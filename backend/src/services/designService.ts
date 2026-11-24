// ============================================================
//   DESIGN SERVICE — Designs salvos no Creator Studio
//   Regra de negócio de designs. Não conhece Request nem Response.
//
//   DB-03: o acesso ao banco é pelo Prisma Client, direto do service.
//
//   BOLA-04: criar e atualizar são caminhos separados. Antes, um POST com o
//   id de um design alheio não passava no SELECT escopado e caía no INSERT,
//   que colidia com a chave primária: id livre respondia 201 e id de outro
//   usuário respondia 409, revelando quais ids existiam. Agora o POST só
//   cria, com id gerado pelo servidor, e o PUT só atualiza o que estiver no
//   escopo do usuário. Design alheio e design inexistente dão o mesmo 404.
//
//   BOLA-05: o dono do design é o usuario_id do token, imutável, e não o
//   e-mail (docs/decisions/ADR-0002-designs-escopados-por-usuario-id.md).
//
//   ID-02: o token traz o publicId do usuário; o usuario_id é resolvido
//   dentro de cada consulta.
// ============================================================

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../config/prisma.js";
import { NotFoundProblem, UnauthorizedProblem } from "../errors/problem.js";
import type { DesignResponseDTO, SaveDesignDTO } from "../dtos/design/design.dto.js";
import { resolveStudioConfig } from "./designConfig.js";
import { syncDesignAssets } from "./studioAssets.js";

const DESIGN_NAO_ENCONTRADO = "Design não encontrado ou sem permissão.";

/** DECIMAL(4,2): o texto do número vai exato, e o banco arredonda as casas. */
const emDecimal = (valor: number) => new Prisma.Decimal(String(valor));

export class DesignService {
  /** Cria o design com id gerado pelo servidor e devolve esse id. */
  static async create(usuarioPublicId: string, dto: SaveDesignDTO): Promise<string> {
    // O identificador é sempre do servidor: UUID v4, nunca valor do cliente.
    const id = randomUUID();

    await prisma.$transaction(async (tx) => {
      const dono = await tx.usuario.findUnique({ where: { publicId: usuarioPublicId }, select: { id: true } });
      if (!dono) {
        throw new UnauthorizedProblem("Sessão inválida.");
      }

      await tx.savedDesign.create({
        data: {
          id,
          usuarioId: dono.id,
          name: dto.name,
          model: dto.model,
          color: dto.color,
          isSunglasses: Boolean(dto.is_sunglasses),
          antiReflective: Boolean(dto.anti_reflective),
          templeStyle: dto.temple_style || "standard",
          topBar: Boolean(dto.top_bar),
          bridgeStyle: dto.bridge_style || "keyhole",
          frameProfile: dto.frame_profile || "medium",
          templeOpen: emDecimal(dto.temple_open || 0),
          published: Boolean(dto.published),
          ...(dto.config ? { studioConfig: dto.config as Prisma.InputJsonValue } : {}),
        },
      });

      if (dto.config?.artwork.version === 3) {
        await syncDesignAssets(tx, usuarioPublicId, id, dto.config);
      }
    });

    return id;
  }

  static async update(usuarioPublicId: string, id: string, payload: SaveDesignDTO): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // O documento atual entra na fusão das edições legadas. O FOR UPDATE,
      // que o Prisma não expressa, segura a linha até a escrita, para outra
      // edição não se intercalar.
      const [atual] = await tx.$queryRaw<{ studio_config: unknown }[]>`
        SELECT studio_config FROM saved_designs
         WHERE id = ${id}
           AND usuario_id = (SELECT u.id FROM usuarios u WHERE u."publicId" = ${usuarioPublicId})
         FOR UPDATE`;

      if (!atual) {
        throw new NotFoundProblem(DESIGN_NAO_ENCONTRADO);
      }

      const document = resolveStudioConfig(payload, atual.studio_config);
      if (document?.artwork.version === 3) {
        await syncDesignAssets(tx, usuarioPublicId, id, document);
      }

      // A escrita repete o escopo do dono, como a leitura.
      await tx.savedDesign.updateMany({
        where: { id, usuario: { publicId: usuarioPublicId } },
        data: {
          name: payload.name,
          model: document ? `${document.frontModel}_front_${document.templeModel}_temples` : payload.model,
          color: document?.color ?? payload.color,
          isSunglasses: document?.isSunglasses ?? Boolean(payload.is_sunglasses),
          antiReflective: document
            ? document.lensTreatments.includes("anti_reflective")
            : Boolean(payload.anti_reflective),
          templeStyle: payload.temple_style || "standard",
          topBar: Boolean(payload.top_bar),
          bridgeStyle: payload.bridge_style || "keyhole",
          frameProfile: document?.frameProfile ?? payload.frame_profile ?? "medium",
          templeOpen: emDecimal(document?.templeOpen ?? payload.temple_open ?? 0),
          published: Boolean(payload.published),
          updatedAt: new Date(),
          // Sem documento novo, o documento salvo continua.
          ...(document ? { studioConfig: document as Prisma.InputJsonValue } : {}),
        },
      });
    });
  }

  /** Designs do próprio usuário, do mais novo para o mais antigo. */
  static async list(usuarioPublicId: string): Promise<DesignResponseDTO[]> {
    const designs = await prisma.savedDesign.findMany({
      where: { usuario: { publicId: usuarioPublicId } },
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    });

    return designs.map(design => ({
      id: design.id,
      name: design.name,
      model: design.model,
      color: design.color,
      isSunglasses: Boolean(design.isSunglasses),
      antiReflective: Boolean(design.antiReflective),
      templeStyle: design.templeStyle,
      topBar: Boolean(design.topBar),
      bridgeStyle: design.bridgeStyle,
      frameProfile: design.frameProfile,
      templeOpen: Number(design.templeOpen),
      published: Boolean(design.published),
      createdAt: design.createdAt,
      updatedAt: design.updatedAt,
      config: design.studioConfig ?? null,
    }));
  }

  static async delete(usuarioPublicId: string, id: string): Promise<void> {
    const { count } = await prisma.savedDesign.deleteMany({
      where: { id, usuario: { publicId: usuarioPublicId } },
    });

    if (count === 0) {
      throw new NotFoundProblem(DESIGN_NAO_ENCONTRADO);
    }
  }
}
