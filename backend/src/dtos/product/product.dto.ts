import { z } from "zod";

export const createProductSchema = z.object({
  nome: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(255),
  descricao: z.string().trim().optional().nullable(),
  preco: z.coerce
    .number({ message: "Preço é obrigatório." })
    .positive("Preço deve ser um número positivo."),
  categoria_id: z.coerce.number().int().positive().optional().nullable(),
  imagem_url: z.string().trim().max(500).optional().nullable(),
});

export type CreateProductDTO = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object({
  nome: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(255),
  descricao: z.string().trim().optional().nullable(),
  preco: z.coerce
    .number({ message: "Preço é obrigatório." })
    .positive("Preço deve ser um número positivo."),
  categoria_id: z.coerce.number().int().positive().optional().nullable(),
  imagem_url: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
});

export type UpdateProductDTO = z.infer<typeof updateProductSchema>;

export const getProductsQuerySchema = z.object({
  categoria_id: z.coerce.number().int().positive().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type GetProductsQueryDTO = z.infer<typeof getProductsQuerySchema>;
