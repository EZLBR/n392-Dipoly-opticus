import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/utils/mailTransport.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/utils/mailTransport.js")>(),
  sendEmail,
}));

const email = "reset@example.com";
const oldPassword = "OldPassword1";
const password = "NewPassword2";
const forgot = (address: string) => request(app).post("/api/auth/forgot-password").send({ email: address });
const reset = (token: string) => request(app).post("/api/auth/reset-password").send({ token, password });

beforeEach(async () => {
  sendEmail.mockClear();
  await request(app).post("/api/auth/register").send({ name: "Cliente", email, password: oldPassword }).expect(201);
});

async function getToken() {
  await forgot(email).expect(202);
  await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
  const html = String(sendEmail.mock.calls[0][2]);
  const token = /#token=([a-f0-9]{64})/.exec(html)?.[1];
  if (!token) throw new Error("E-mail sem link de recuperação");
  return token;
}

it("responde igualmente para e-mail cadastrado e desconhecido", async () => {
  const [known, unknown] = await Promise.all([forgot(email), forgot("unknown@example.com")]);
  expect(known.status).toBe(202);
  expect(unknown.status).toBe(202);
  expect(known.text).toBe(unknown.text);
  await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledOnce());
});

it("armazena apenas o hash e consome o token uma vez mesmo com requisições concorrentes", async () => {
  const token = await getToken();
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  expect(user.resetTokenHash).toBe(createHash("sha256").update(token).digest("hex"));
  const results = await Promise.all([reset(token), reset(token)]);
  expect(results.map(result => result.status).sort()).toEqual([204, 400]);
  await request(app).post("/api/auth/login").send({ email, password }).expect(200);
  await request(app).post("/api/auth/login").send({ email, password: oldPassword }).expect(400);
});

it("rejeita token expirado", async () => {
  const token = await getToken();
  await prisma.usuario.update({ where: { email }, data: { resetTokenExpiresAt: new Date(0) } });
  await reset(token).expect(400);
});
