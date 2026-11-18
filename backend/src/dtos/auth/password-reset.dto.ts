import { z } from "zod";
import { loginSchema } from "./login.dto.js";
import { registerSchema } from "./register.dto.js";

export const forgotPasswordSchema = loginSchema.pick({ email: true });

export const resetPasswordSchema = registerSchema.pick({ password: true }).extend({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Link de recuperação inválido."),
  password: registerSchema.shape.password.refine(
    (password) => Buffer.byteLength(password, "utf8") <= 72,
    "A senha deve ter no máximo 72 bytes.",
  ),
});

export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
