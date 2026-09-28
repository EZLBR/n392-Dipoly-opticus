import { z } from "zod";

export const updateUserSchema = z.object({
  name: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório."),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("Formato de email inválido.")
    .optional(),
  password: z
    .string()
    .min(8, "A senha deve ter pelo menos 8 caracteres.")
    .regex(/[a-zA-Z]/, "A senha deve conter letras e números.")
    .regex(/\d/, "A senha deve conter letras e números.")
    .optional(),
  role: z.enum(["admin", "client", "staff", "factory"]).optional(),
  factoryName: z.string().nullable().optional(),
});

export type UpdateUserDTO = z.infer<typeof updateUserSchema>;
