// ============================================================
//   PRODUCT SERVICE
//   Regra de negócio de produtos. Não conhece Request nem Response.
//
//   DB-03: o acesso ao banco é pelo Prisma Client, direto do service.
// ============================================================

import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { BadRequestProblem, NotFoundProblem } from "../errors/problem.js";
import type {
  CreateProductDTO,
  GetProductsQueryDTO,
  PaginatedProductsDTO,
  ProductDetailDTO,
  ProductResponseDTO,
  UpdateProductDTO,
} from "../dtos/product/product.dto.js";

const NAO_ENCONTRADO = "Produto não encontrado.";

/** Colunas públicas de um produto, com categoria e estoque, sem ids internos. */
const CAMPOS_PRODUTO = {
  publicId: true,
  nome: true,
  descricao: true,
  preco: true,
  imagemUrl: true,
  ativo: true,
  criadoEm: true,
  categoria: { select: { publicId: true, nome: true } },
  estoque: { select: { quantidade: true, estoqueMinimo: true } },
} satisfies Prisma.ProdutoSelect;

type ProdutoLido = Prisma.ProdutoGetPayload<{ select: typeof CAMPOS_PRODUTO }>;

function toProductResponse(produto: ProdutoLido): ProductResponseDTO {
  return {
    publicId: produto.publicId,
    nome: produto.nome,
    descricao: produto.descricao,
    // O Decimal serializado sozinho perde o zero final (199.9).
    preco: produto.preco.toFixed(2),
    categoriaPublicId: produto.categoria?.publicId ?? null,
    categoria_nome: produto.categoria?.nome ?? null,
    imagem_url: produto.imagemUrl,
    ativo: produto.ativo,
    criado_em: produto.criadoEm,
    estoque_quantidade: produto.estoque?.quantidade ?? null,
  };
}

function toProductDetail(produto: ProdutoLido): ProductDetailDTO {
  return { ...toProductResponse(produto), estoque_minimo: produto.estoque?.estoqueMinimo ?? null };
}

/** O texto do número vai exato para o DECIMAL, e o banco arredonda as casas. */
const emDecimal = (preco: number) => new Prisma.Decimal(String(preco));

/**
 * Resolve a categoria informada e a segura até o fim da transação.
 *
 * Reativar um produto não muda a chave estrangeira, então o banco não trava
 * a categoria sozinho. Sem este FOR KEY SHARE, a remoção da categoria não
 * enxergaria o produto reativado e o deixaria sem categoria.
 */
async function travarCategoria(tx: Prisma.TransactionClient, publicId?: string | null): Promise<number | null> {
  if (!publicId) return null;

  const [categoria] = await tx.$queryRaw<{ id: number }[]>`
    SELECT id FROM categorias WHERE "publicId" = ${publicId} FOR KEY SHARE`;

  if (!categoria) {
    throw new BadRequestProblem("Categoria não encontrada.");
  }
  return categoria.id;
}

/**
 * O `contains` do Prisma vira `ILIKE '%termo%'` sem escapar o termo: `%` e `_`
 * funcionavam como curinga (buscar "%" trazia todo o catálogo). Escapados, a
 * busca é literal. O `\` é o escape padrão do LIKE no PostgreSQL.
 */
export const escaparCuringas = (termo: string) => termo.replace(/[\\%_]/g, "\\$&");

export class ProductService {
  /** Produto e estoque (zerado) nascem juntos, ou nenhum dos dois. */
  static async create(dto: CreateProductDTO): Promise<ProductDetailDTO> {
    const produto = await prisma.$transaction(async (tx) => {
      const categoriaId = await travarCategoria(tx, dto.categoriaPublicId);
      return tx.produto.create({
        data: {
          nome: dto.nome,
          descricao: dto.descricao || null,
          preco: emDecimal(dto.preco),
          categoriaId,
          imagemUrl: dto.imagem_url || null,
          ativo: true,
          estoque: { create: { quantidade: 0, estoqueMinimo: 5 } },
        },
        select: CAMPOS_PRODUTO,
      });
    });
    return toProductDetail(produto);
  }

  /** Lista os produtos ativos, do mais novo para o mais antigo. */
  static async list({ categoriaPublicId, search, page, limit }: GetProductsQueryDTO): Promise<PaginatedProductsDTO> {
    const termo = search ? escaparCuringas(search) : undefined;
    const where: Prisma.ProdutoWhereInput = {
      ativo: true,
      ...(categoriaPublicId ? { categoria: { publicId: categoriaPublicId } } : {}),
      ...(termo
        ? {
            OR: [
              { nome: { contains: termo, mode: "insensitive" } },
              { descricao: { contains: termo, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [produtos, total] = await Promise.all([
      prisma.produto.findMany({
        where,
        orderBy: [{ criadoEm: "desc" }, { id: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
        select: CAMPOS_PRODUTO,
      }),
      prisma.produto.count({ where }),
    ]);

    return {
      produtos: produtos.map(toProductResponse),
      // Contrato público: o total sempre saiu como texto.
      total: String(total),
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  static async getByPublicId(publicId: string): Promise<ProductDetailDTO> {
    const produto = await prisma.produto.findUnique({ where: { publicId }, select: CAMPOS_PRODUTO });

    if (!produto) {
      throw new NotFoundProblem(NAO_ENCONTRADO);
    }
    return toProductDetail(produto);
  }

  static async update(publicId: string, dto: UpdateProductDTO): Promise<ProductDetailDTO> {
    const produto = await prisma.$transaction(async (tx) => {
      // Produto inexistente responde 404 mesmo com categoria inválida.
      const existente = await tx.produto.findUnique({ where: { publicId }, select: { id: true } });
      if (!existente) {
        throw new NotFoundProblem(NAO_ENCONTRADO);
      }

      const categoriaId = await travarCategoria(tx, dto.categoriaPublicId);
      return tx.produto.update({
        where: { id: existente.id },
        data: {
          nome: dto.nome,
          descricao: dto.descricao || null,
          preco: emDecimal(dto.preco),
          categoriaId,
          imagemUrl: dto.imagem_url || null,
          // Sem o campo, o produto mantém o estado atual. Antes, `?? true`
          // reativava em silêncio um produto desativado a cada edição.
          ativo: dto.ativo,
        },
        select: CAMPOS_PRODUTO,
      });
    });
    return toProductDetail(produto);
  }

  /** Soft delete: o produto sai do catálogo e o histórico de pedidos fica. */
  static async deactivate(publicId: string): Promise<void> {
    const { count } = await prisma.produto.updateMany({ where: { publicId }, data: { ativo: false } });

    if (count === 0) {
      throw new NotFoundProblem(NAO_ENCONTRADO);
    }
  }
}
