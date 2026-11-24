// ============================================================
//   CATEGORY SERVICE
//   Regra de negócio de categorias. Não conhece Request nem Response.
//
//   DB-03: o acesso ao banco é pelo Prisma Client, direto do service.
//   Um repositório aqui só repassaria as chamadas.
// ============================================================

import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { ConflictProblem, NotFoundProblem } from "../errors/problem.js";
import type {
  CategoryDetailDTO,
  CategoryListItemDTO,
  CategoryResponseDTO,
  CreateCategoryDTO,
  UpdateCategoryDTO,
} from "../dtos/category/category.dto.js";

const NAO_ENCONTRADA = "Categoria não encontrada.";
const NOME_EM_USO = "Já existe uma categoria com esse nome.";

/** Colunas públicas de uma categoria, sem o id interno. */
const CAMPOS_CATEGORIA = {
  publicId: true,
  nome: true,
  descricao: true,
  criadoEm: true,
} satisfies Prisma.CategoriaSelect;

type CategoriaLida = Prisma.CategoriaGetPayload<{ select: typeof CAMPOS_CATEGORIA }>;

function toCategoryResponse(categoria: CategoriaLida): CategoryResponseDTO {
  return {
    publicId: categoria.publicId,
    nome: categoria.nome,
    descricao: categoria.descricao,
    criado_em: categoria.criadoEm,
  };
}

/** Traduz o erro de escrita com a mensagem do domínio, sem citar coluna do banco. */
function erroDeEscrita(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002") return new ConflictProblem(NOME_EM_USO);
    if (err.code === "P2025") return new NotFoundProblem(NAO_ENCONTRADA);
  }
  return err;
}

export class CategoryService {
  /** A unicidade do nome é decidida pelo índice do banco, sem consulta antes. */
  static async create({ nome, descricao }: CreateCategoryDTO): Promise<CategoryResponseDTO> {
    try {
      const categoria = await prisma.categoria.create({
        data: { nome, descricao: descricao || null },
        select: CAMPOS_CATEGORIA,
      });
      return toCategoryResponse(categoria);
    } catch (err) {
      throw erroDeEscrita(err);
    }
  }

  /** Lista por nome, com a contagem de produtos ativos de cada categoria. */
  static async list(): Promise<CategoryListItemDTO[]> {
    const categorias = await prisma.categoria.findMany({
      orderBy: { nome: "asc" },
      select: {
        ...CAMPOS_CATEGORIA,
        _count: { select: { produtos: { where: { ativo: true } } } },
      },
    });

    return categorias.map(categoria => ({
      ...toCategoryResponse(categoria),
      // Contrato público: a contagem sempre saiu como texto.
      total_produtos: String(categoria._count.produtos),
    }));
  }

  static async getByPublicId(publicId: string): Promise<CategoryDetailDTO> {
    const categoria = await prisma.categoria.findUnique({
      where: { publicId },
      select: {
        ...CAMPOS_CATEGORIA,
        produtos: {
          where: { ativo: true },
          orderBy: { id: "asc" },
          select: { publicId: true, nome: true, preco: true, imagemUrl: true, ativo: true },
        },
      },
    });

    if (!categoria) {
      throw new NotFoundProblem(NAO_ENCONTRADA);
    }

    return {
      ...toCategoryResponse(categoria),
      produtos: categoria.produtos.map(produto => ({
        publicId: produto.publicId,
        nome: produto.nome,
        // O Decimal serializado sozinho perde o zero final (199.9).
        preco: produto.preco.toFixed(2),
        imagem_url: produto.imagemUrl,
        ativo: produto.ativo,
      })),
    };
  }

  static async update(publicId: string, { nome, descricao }: UpdateCategoryDTO): Promise<CategoryResponseDTO> {
    try {
      const categoria = await prisma.categoria.update({
        where: { publicId },
        data: { nome, descricao: descricao || null },
        select: CAMPOS_CATEGORIA,
      });
      return toCategoryResponse(categoria);
    } catch (err) {
      throw erroDeEscrita(err);
    }
  }

  /**
   * Remove a categoria que não tem produtos ativos.
   *
   * A chave estrangeira é ON DELETE SET NULL: um produto ativo gravado entre
   * a contagem e o DELETE perderia a categoria em silêncio. O FOR UPDATE, que
   * o Prisma não expressa, faz esse INSERT esperar a decisão, ou faz esta
   * transação esperar o INSERT e então contá-lo.
   */
  static async delete(publicId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const [categoria] = await tx.$queryRaw<{ id: number }[]>`
        SELECT id FROM categorias WHERE "publicId" = ${publicId} FOR UPDATE`;

      if (!categoria) {
        throw new NotFoundProblem(NAO_ENCONTRADA);
      }

      const total = await tx.produto.count({ where: { categoriaId: categoria.id, ativo: true } });
      if (total > 0) {
        throw new ConflictProblem(`Não é possível deletar. ${total} produto(s) ainda usam essa categoria.`);
      }

      await tx.categoria.delete({ where: { id: categoria.id } });
    });
  }
}
