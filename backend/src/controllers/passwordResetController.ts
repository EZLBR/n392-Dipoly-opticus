import type { Request, Response } from "express";
import type { ForgotPasswordDTO, ResetPasswordDTO } from "../dtos/auth/password-reset.dto.js";
import { requestPasswordReset, resetPassword } from "../services/passwordReset.js";
import logger from "../utils/logger.js";

export function forgotPassword(req: Request, res: Response) {
  const { email } = req.body as ForgotPasswordDTO;
  const language = req.acceptsLanguages("en", "pt") === "pt" ? "pt" : "en";
  // A consulta e o SMTP ficam fora do caminho da resposta pública.
  res.once("finish", () => {
    void requestPasswordReset(email, language).catch((error: unknown) => {
      logger.error({ errorType: error instanceof Error ? error.name : "Unknown" }, "[auth] falha na recuperação de senha");
    });
  });
  return res.status(202).end();
}

export async function applyPasswordReset(req: Request, res: Response) {
  const { token, password } = req.body as ResetPasswordDTO;
  await resetPassword(token, password);
  return res.status(204).end();
}
