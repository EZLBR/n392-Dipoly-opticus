import { z } from "zod";

export const updateUserSchema = z.object({
  name: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(255),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(255)
    .email("Formato de email inválido.")
    .optional(),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .regex(/[a-zA-Z]/, "A senha deve conter letras e números.")
    .regex(/\d/, "A senha deve conter letras e números.")
    .optional(),
  role: z.enum(["admin", "client", "staff", "factory"]).optional(),
  factoryName: z.string().max(255).nullable().optional(),
});

export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
