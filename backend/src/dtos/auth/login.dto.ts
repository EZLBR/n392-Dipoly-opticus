import { z } from "zod";

export const loginSchema = z.object({
  email: z
    .string({ message: "Email é obrigatório." })
    .trim()
    .toLowerCase()
    .email("Formato de email inválido."),
  password: z
    .string({ message: "Senha é obrigatória." })
    .min(1, "Senha é obrigatória."),
});

export type LoginDTO = z.infer<typeof loginSchema>;
