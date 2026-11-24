import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";
import { mensagensDeTeste } from "../../src/utils/mailTransport.js";
import { esperarProblema } from "../helpers/problem.js";

// Sem mock: com NODE_ENV=test o sendEmail grava em mensagensDeTeste e nunca
// abre conexão SMTP. O teste prova que o fluxo passa por essa guarda.

const email = "reset@example.com";
const oldPassword = "OldPassword1";
const password = "NewPassword2";
const forgot = (address: string) => request(app).post("/api/auth/forgot-password").send({ email: address });
const reset = (token: string, novaSenha = password) =>
  request(app).post("/api/auth/reset-password").send({ token, password: novaSenha });
const login = (senha: string) => request(app).post("/api/auth/login").send({ email, password: senha });
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

let sessionToken: string;

beforeEach(async () => {
  mensagensDeTeste.length = 0;
  const res = await request(app).post("/api/auth/register")
    .send({ name: "Cliente", email, password: oldPassword }).expect(201);
  sessionToken = res.body.token;
});

async function getToken() {
  const antes = mensagensDeTeste.length;
  await forgot(email).expect(202);
  await vi.waitFor(() => expect(mensagensDeTeste).toHaveLength(antes + 1));
  const token = /#token=([a-f0-9]{64})/.exec(mensagensDeTeste[antes].html)?.[1];
  if (!token) throw new Error("E-mail sem link de recuperação");
  return token;
}

it("responde igualmente para e-mail cadastrado e desconhecido", async () => {
  const [known, unknown] = await Promise.all([forgot(email), forgot("unknown@example.com")]);
  expect(known.status).toBe(202);
  expect(unknown.status).toBe(202);
  expect(known.text).toBe(unknown.text);
  await vi.waitFor(() => expect(mensagensDeTeste).toHaveLength(1));
  expect(mensagensDeTeste[0].to).toBe(email);
});

it("e-mail desconhecido não grava token em nenhuma conta", async () => {
  await forgot("unknown@example.com").expect(202);
  await getToken();
  expect(await prisma.usuario.count({ where: { resetTokenHash: { not: null } } })).toBe(1);
  expect(mensagensDeTeste.map(m => m.to)).toEqual([email]);
});

it("armazena apenas o hash e consome o token uma vez mesmo com requisições concorrentes", async () => {
  const token = await getToken();
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  expect(user.resetTokenHash).toBe(tokenHash(token));
  const results = await Promise.all([reset(token), reset(token)]);
  expect(results.map(result => result.status).sort()).toEqual([204, 400]);
  await login(password).expect(200);
  await login(oldPassword).expect(400);
});

it("rejeita token expirado", async () => {
  const token = await getToken();
  await prisma.usuario.update({ where: { email }, data: { resetTokenExpiresAt: new Date(0) } });
  await reset(token).expect(400);
});

it("rejeita token com formato inválido na validação", async () => {
  esperarProblema(await reset("nao-e-um-token"), 400, "bad-request");
});

it("rejeita senha nova com mais de 72 bytes", async () => {
  const token = await getToken();
  esperarProblema(await reset(token, "Senha1" + "é".repeat(34)), 400, "bad-request");
});

it("cadastro também recusa senha com mais de 72 bytes", async () => {
  const res = await request(app).post("/api/auth/register")
    .send({ name: "Outro", email: "longa@example.com", password: "Senha1" + "é".repeat(34) });
  esperarProblema(res, 400, "bad-request");
});

it("um segundo pedido dentro de um minuto não troca o token nem reenvia", async () => {
  const token = await getToken();
  await forgot(email).expect(202);
  // Dá tempo ao processamento em segundo plano do segundo pedido.
  await new Promise(resolve => setTimeout(resolve, 300));
  expect(mensagensDeTeste).toHaveLength(1);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  expect(user.resetTokenHash).toBe(tokenHash(token));
});

it("depois do intervalo mínimo, um novo pedido gera outro link", async () => {
  const primeiro = await getToken();
  await prisma.usuario.update({
    where: { email },
    data: { resetTokenExpiresAt: new Date(Date.now() + 13 * 60 * 1000) },
  });
  const segundo = await getToken();
  expect(segundo).not.toBe(primeiro);
  await reset(primeiro).expect(400);
});

it("a troca de senha derruba as sessões emitidas antes dela", async () => {
  const me = (token: string) => request(app).get("/api/auth/me").set("Authorization", `Bearer ${token}`);
  await me(sessionToken).expect(200);

  // O iat tem resolução de segundos: a troca precisa cair num segundo posterior.
  await new Promise(resolve => setTimeout(resolve, 1100));
  await reset(await getToken()).expect(204);

  esperarProblema(await me(sessionToken), 401, "unauthorized");

  const novo = await login(password).expect(200);
  await me(novo.body.token).expect(200);
});
