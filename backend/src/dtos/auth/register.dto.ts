import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(255),
  email: z
    .string({ message: "Email é obrigatório." })
    .trim()
    .toLowerCase()
    .max(255)
    .email("Formato de email inválido."),
  password: z
    .string({ message: "Senha é obrigatória." })
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .regex(/[a-zA-Z]/, "A senha deve conter letras e números.")
    .regex(/\d/, "A senha deve conter letras e números."),
});

export type RegisterDTO = z.infer<typeof registerSchema>;
