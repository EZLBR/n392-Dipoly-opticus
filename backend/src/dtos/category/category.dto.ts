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

/** O que a API devolve de uma categoria. Nunca o id interno. */
export interface CategoryResponseDTO {
  publicId: string;
  nome: string;
  descricao: string | null;
  criado_em: Date | null;
}

export interface CategoryListItemDTO extends CategoryResponseDTO {
  total_produtos: string;
}

export interface CategoryDetailDTO extends CategoryResponseDTO {
  produtos: Array<{
    publicId: string;
    nome: string;
    /** DECIMAL como texto de duas casas, sem passar por float. */
    preco: string;
    imagem_url: string | null;
    ativo: boolean | null;
  }>;
}
