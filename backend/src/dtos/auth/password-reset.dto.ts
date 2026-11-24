import { z } from "zod";
import { loginSchema } from "./login.dto.js";
import { registerSchema } from "./register.dto.js";

export const forgotPasswordSchema = loginSchema.pick({ email: true });

export const resetPasswordSchema = registerSchema.pick({ password: true }).extend({
  token: z.string().regex(/^[a-f0-9]{64}$/, "Link de recuperação inválido."),
});

export type ForgotPasswordDTO = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDTO = z.infer<typeof resetPasswordSchema>;
