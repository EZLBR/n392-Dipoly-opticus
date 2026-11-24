import { generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { OAuth2Client } from "google-auth-library";
import jwt from "jsonwebtoken";
import request from "supertest";
import { app } from "../setup/app.js";
import prisma from "../../src/config/prisma.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const clientId = "opticus-test.apps.googleusercontent.com";
const nonce = "b".repeat(64);
const email = "google@example.com";
const exchange = () => request(app).post("/api/auth/google/exchange")
  .send({ code: "test-authorization-code", verifier: "a".repeat(64), nonce, role: "staff" });
let credential: string;

function idToken(overrides: Record<string, unknown> = {}) {
  return jwt.sign({
    aud: clientId,
    iss: "https://accounts.google.com",
    sub: "stable-google-subject",
    nonce,
    email,
    email_verified: true,
    name: "Google Customer",
    exp: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  }, privateKey, { algorithm: "RS256", keyid: "test-key" });
}

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", clientId);
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
  credential = idToken();
  vi.spyOn(OAuth2Client.prototype, "getToken")
    .mockImplementation(async () => ({ tokens: { id_token: credential } }));
  vi.spyOn(OAuth2Client.prototype, "getFederatedSignonCertsAsync").mockResolvedValue({
    certs: { "test-key": publicKey.export({ type: "spki", format: "pem" }).toString() },
    format: "PEM",
  } as Awaited<ReturnType<OAuth2Client["getFederatedSignonCertsAsync"]>>);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("inicia o fluxo com PKCE, state e nonce e informa indisponibilidade sem configuração", async () => {
  const start = () => request(app).post("/api/auth/google/start")
    .set("Accept-Language", "pt").send({ state: "a".repeat(64), nonce, challenge: "x".repeat(43) });
  const { body } = await start().expect(200);
  const url = new URL(body.url);
  expect(url.origin).toBe("https://accounts.google.com");
  expect(url.searchParams.get("client_id")).toBe(clientId);
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("state")).toBe("a".repeat(64));
  expect(url.searchParams.get("nonce")).toBe(nonce);
  expect(url.searchParams.get("hl")).toBe("pt-BR");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "");
  await start().expect(503);
});

it("cria um cliente, usa a sessão existente da API e reconhece o mesmo sub", async () => {
  const { body } = await exchange().expect(200);
  expect(body.user.role).toBe("client");
  expect(body.user.email).toBe(email);
  const profile = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${body.token}`).expect(200);
  expect(profile.body.user.publicId).toBe(body.user.publicId);

  credential = idToken({ email: "changed@example.com" });
  const second = await exchange().expect(200);
  expect(second.body.user.publicId).toBe(body.user.publicId);
  expect(await prisma.usuario.count()).toBe(1);
});

it("recusa credencial inválida, expirada ou de outro nonce", async () => {
  for (const token of [
    "invalid-token",
    idToken({ exp: Math.floor(Date.now() / 1000) - 1 }),
    idToken({ nonce: "wrong-nonce" }),
    idToken({ aud: "other-client" }),
  ]) {
    credential = token;
    await exchange().expect(400);
  }
  expect(await prisma.usuario.count()).toBe(0);
});

it("não vincula uma conta Opticus existente pelo e-mail", async () => {
  await request(app).post("/api/auth/register")
    .send({ name: "Existing", email, password: "Existing123" }).expect(201);
  await exchange().expect(409);
  const user = await prisma.usuario.findUniqueOrThrow({ where: { email } });
  expect(user.googleSubject).toBeNull();
  await request(app).post("/api/auth/login").send({ email, password: "Existing123" }).expect(200);
});
