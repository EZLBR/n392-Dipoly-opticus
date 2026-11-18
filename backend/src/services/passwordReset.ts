import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { env } from "../config/env.js";
import prisma from "../config/prisma.js";
import { BadRequestProblem } from "../errors/problem.js";
import { escapeEmailHtml, sendEmail } from "../utils/mailTransport.js";

const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

export async function requestPasswordReset(email: string, language: "pt" | "en"): Promise<void> {
  const token = randomBytes(32).toString("hex");
  const { count } = await prisma.usuario.updateMany({
    where: { email },
    data: {
      resetTokenHash: tokenHash(token),
      resetTokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000),
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
    data: { senhaHash, resetTokenHash: null, resetTokenExpiresAt: null },
  });
  if (!count) throw invalidToken();
}
