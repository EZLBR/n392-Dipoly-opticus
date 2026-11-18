import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { env } from "../config/env.js";
import prisma from "../config/prisma.js";
import type { GoogleExchangeDTO, GoogleStartDTO } from "../dtos/auth/google.dto.js";
import { loginSchema } from "../dtos/auth/login.dto.js";
import { BadRequestProblem, ConflictProblem, ServiceUnavailableProblem } from "../errors/problem.js";
import { AuthService } from "./authService.js";

const verifier = new OAuth2Client();

function providerConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new ServiceUnavailableProblem("Login com Google indisponível.");
  return { clientId, clientSecret, redirectUri: new URL("/login", env.FRONTEND_URL).href };
}

export function googleAuthorizationUrl(input: GoogleStartDTO, locale: "pt-BR" | "en") {
  const { clientId, redirectUri } = providerConfig();
  const client = new OAuth2Client({ clientId, redirectUri });
  const url = new URL(client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state: input.state,
    code_challenge_method: CodeChallengeMethod.S256,
    code_challenge: input.challenge,
    prompt: "select_account",
  }));
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("hl", locale);
  return url.href;
}

export async function signInWithGoogle(input: GoogleExchangeDTO) {
  const { clientId, clientSecret, redirectUri } = providerConfig();
  const client = new OAuth2Client({ clientId, clientSecret, redirectUri });
  const invalid = () => new BadRequestProblem("Credencial do Google inválida ou expirada.");
  const payload = await (async () => {
    try {
      const { tokens } = await client.getToken({ code: input.code, codeVerifier: input.verifier });
      if (!tokens.id_token) throw invalid();
      const ticket = await verifier.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
      return ticket.getPayload();
    } catch {
      throw invalid();
    }
  })();

  const email = loginSchema.shape.email.safeParse(payload?.email);
  if (!email.success || !payload?.email_verified || !payload.sub || payload.sub.length > 255
      || !payload.exp || payload.exp * 1000 <= Date.now()
      || (payload as { nonce?: string }).nonce !== input.nonce) throw invalid();

  const linked = await prisma.usuario.findUnique({ where: { googleSubject: payload.sub } });
  if (linked) return AuthService.issueSession(linked);

  const conflict = () => new ConflictProblem("Este e-mail já pertence a uma conta Opticus. Entre com sua senha.");
  const existing = await prisma.usuario.findFirst({ where: { email: { equals: email.data, mode: "insensitive" } } });
  if (existing) throw conflict();

  // A conta começa sem uma senha utilizável. A senha aleatória nunca sai do servidor.
  const senhaHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
  try {
    const user = await prisma.usuario.create({ data: {
      googleSubject: payload.sub,
      email: email.data,
      nome: payload.name?.trim().slice(0, 255) || email.data,
      role: "client",
      senhaHash,
    } });
    return AuthService.issueSession(user);
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    // Duas autorizações válidas para o mesmo Google sub podem chegar juntas.
    const winner = await prisma.usuario.findUnique({ where: { googleSubject: payload.sub } });
    if (winner) return AuthService.issueSession(winner);
    throw conflict();
  }
}
