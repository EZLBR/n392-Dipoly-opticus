import { z } from "zod";

export const createCategorySchema = z.object({
  nome: z
    .string({ message: "Nome da categoria é obrigatório." })
    .trim()
    .min(1, "Nome da categoria é obrigatório.")
    .max(100),
  descricao: z.string().trim().optional().nullable(),
});

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  nome: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(100),
  descricao: z.string().trim().optional().nullable(),
});

export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;
