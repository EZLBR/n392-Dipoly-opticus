import { z } from "zod";

// ID-02: a categoria é referenciada pelo publicId (UUID), nunca pelo id inteiro.
const publicIdDaCategoria = z.string().trim().min(1, "Categoria inválida.").max(64, "Categoria inválida.");

// Limites da coluna DECIMAL(10,2): abaixo de 0,01 o banco gravaria R$ 0,00, e
// acima do máximo a escrita falharia como erro interno.
const precoSchema = z.coerce
  .number({ message: "Preço é obrigatório." })
  .positive({ message: "Preço deve ser um número positivo.", abort: true })
  .min(0.01, "O preço mínimo é 0,01.")
  .max(99_999_999.99, "O preço máximo é 99.999.999,99.");

export const createProductSchema = z.object({
  nome: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(255),
  descricao: z.string().trim().optional().nullable(),
  preco: precoSchema,
  categoriaPublicId: publicIdDaCategoria.optional().nullable(),
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
  preco: precoSchema,
  categoriaPublicId: publicIdDaCategoria.optional().nullable(),
  imagem_url: z.string().trim().max(500).optional().nullable(),
  ativo: z.boolean().optional(),
});

export type UpdateProductDTO = z.infer<typeof updateProductSchema>;

export const getProductsQuerySchema = z.object({
  categoriaPublicId: publicIdDaCategoria.optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

export type GetProductsQueryDTO = z.infer<typeof getProductsQuerySchema>;

/** O que a API devolve de um produto na listagem. Nunca o id interno. */
export interface ProductResponseDTO {
  publicId: string;
  nome: string;
  descricao: string | null;
  /** DECIMAL como texto de duas casas, sem passar por float. */
  preco: string;
  categoriaPublicId: string | null;
  categoria_nome: string | null;
  imagem_url: string | null;
  ativo: boolean | null;
  criado_em: Date | null;
  estoque_quantidade: number | null;
}

export interface ProductDetailDTO extends ProductResponseDTO {
  estoque_minimo: number | null;
}

export interface PaginatedProductsDTO {
  produtos: ProductResponseDTO[];
  total: string;
  page: number;
  totalPages: number;
}
