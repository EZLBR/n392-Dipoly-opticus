import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import prisma from "../config/prisma.js";
import { BadRequestProblem } from "../errors/problem.js";
import { escapeEmailHtml, sendEmail } from "../utils/mailTransport.js";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export const RESET_TOKEN_TTL_MS = 15 * 60 * 1000;
/** Intervalo mínimo entre dois pedidos para a mesma conta. */
export const RESET_REQUEST_COOLDOWN_MS = 60 * 1000;

export async function requestPasswordReset(email: string, language: "pt" | "en"): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  // Um token emitido há menos de um minuto não é substituído: evita inundar a
  // caixa de entrada e invalidar o link legítimo com pedidos de vários IPs.
  const { count } = await prisma.usuario.updateMany({
    where: {
      email,
      OR: [
        { resetTokenExpiresAt: null },
        { resetTokenExpiresAt: { lte: new Date(now + RESET_TOKEN_TTL_MS - RESET_REQUEST_COOLDOWN_MS) } },
      ],
    },
    data: {
      resetTokenHash: tokenHash(token),
      resetTokenExpiresAt: new Date(now + RESET_TOKEN_TTL_MS),
    },
  });
  if (!count) return;

  const link = new URL("/reset-password", env.FRONTEND_URL);
  link.hash = new URLSearchParams({ token }).toString();
  const action = language === "pt" ? "Redefinir senha do Opticus" : "Reset your Opticus password";
  const expiry = language === "pt" ? "O link expira em 15 minutos." : "This link expires in 15 minutes.";
  await sendEmail(email, action, `<p><a href="${escapeEmailHtml(link.href)}">${action}</a></p><p>${expiry}</p>`);
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const hash = tokenHash(token);
  const existing = await prisma.usuario.findUnique({
    where: { resetTokenHash: hash },
    select: { resetTokenExpiresAt: true },
  });
  const invalidToken = () => new BadRequestProblem("Link de recuperação inválido ou expirado.");
  if (!existing?.resetTokenExpiresAt || existing.resetTokenExpiresAt.getTime() <= Date.now()) {
    throw invalidToken();
  }

  const senhaHash = await bcrypt.hash(password, 10);
  const { count } = await prisma.usuario.updateMany({
    where: { resetTokenHash: hash, resetTokenExpiresAt: { gt: new Date() } },
    // sessoesValidasDesde derruba todos os JWTs emitidos antes da troca.
    data: { senhaHash, resetTokenHash: null, resetTokenExpiresAt: null, sessoesValidasDesde: new Date() },
  });
  if (!count) throw invalidToken();
}

/**
 * Validador de sessão do guard. Conta apagada não tem sessão válida. O `iat` do JWT tem resolução de segundos, então
 * a comparação também é feita em segundos: um login logo após a troca, no mesmo
 * segundo, continua válido.
 */
export async function sessionStillValid(publicId: string, issuedAtSeconds: number | undefined): Promise<boolean> {
  const user = await prisma.usuario.findUnique({
    where: { publicId },
    select: { sessoesValidasDesde: true },
  });
  if (!user) return false; // conta apagada: o token não identifica mais ninguém
  if (!user.sessoesValidasDesde) return true;
  if (issuedAtSeconds === undefined) return false;
  return issuedAtSeconds >= Math.floor(user.sessoesValidasDesde.getTime() / 1000);
}
