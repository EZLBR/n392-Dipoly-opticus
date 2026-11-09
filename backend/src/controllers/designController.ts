// ============================================================
//   DESIGN CONTROLLER — Designs salvos no Creator Studio
//   Migrado para PostgreSQL (pg, $1)
// ============================================================

import { randomUUID } from "node:crypto";
import pool from "../config/db.js";
import type { Request, Response } from "express";
import { NotFoundProblem } from "../errors/problem.js";
import type { SaveDesignDTO } from "../dtos/design/design.dto.js";
import { resolveStudioConfig } from "../services/designConfig.js";
import { emTransacao } from "../config/transacao.js";

// BOLA-04: criar e atualizar são caminhos separados. Antes, um POST com o
// id de um design alheio não passava no SELECT escopado e caía no INSERT,
// que colidia com a chave primária: id livre respondia 201 e id de outro
// usuário respondia 409, revelando quais ids existiam.
//
// Agora o POST só cria, com id gerado pelo servidor, e o PUT só atualiza o
// que estiver no escopo do usuário. Design alheio e design inexistente dão
// o mesmo 404, e nenhum id enviado pelo cliente chega a um INSERT.
//
// BOLA-05: o dono do design é o usuario_id do token, imutável. O e-mail é
// mutável (o staff pode trocá-lo) e deixou de existir em saved_designs: com
// ele como escopo, quem herdasse o e-mail antigo herdava os designs
// (docs/decisions/ADR-0002-designs-escopados-por-usuario-id.md).

const DESIGN_NAO_ENCONTRADO = "Design não encontrado ou sem permissão.";

// ─────────────────────────────────────────────────────────
//   CRIAR DESIGN
//   POST /api/designs
// ─────────────────────────────────────────────────────────
export async function createDesign(req: Request, res: Response) {
  const {
    name, model, color,
    is_sunglasses, anti_reflective, temple_style,
    top_bar, bridge_style, frame_profile, temple_open, published, config
  } = req.body as SaveDesignDTO;

  const usuarioId = req.user!.id;

  // O identificador é sempre do servidor: UUID v4, nunca valor do cliente.
  const id = randomUUID();

  const { rows: result } = await pool.query<{ id: string }>(
    `INSERT INTO saved_designs
      (id, usuario_id, name, model, color,
       is_sunglasses, anti_reflective, temple_style,
       top_bar, bridge_style, frame_profile, temple_open, published, studio_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb) RETURNING id`,
    [
      id, usuarioId, name, model, color,
      Boolean(is_sunglasses), Boolean(anti_reflective), temple_style || "standard",
      Boolean(top_bar), bridge_style || "keyhole", frame_profile || "medium",
      temple_open || 0.00, Boolean(published), config ? JSON.stringify(config) : null
    ]
  );

  return res.status(201).json({
    message: "Design salvo com sucesso.",
    id:      result[0].id
  });
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR DESIGN
//   PUT /api/designs/:id
// ─────────────────────────────────────────────────────────
export async function updateDesign(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  const payload = req.body as SaveDesignDTO;
  const {
    name, model, color,
    is_sunglasses, anti_reflective, temple_style,
    top_bar, bridge_style, frame_profile, temple_open, published
  } = payload;

  const usuarioId = req.user!.id;

  await emTransacao(async (conexao) => {
    // O documento atual entra na fusão das edições legadas. FOR UPDATE
    // segura a linha até a escrita, para outra edição não se intercalar.
    const { rows: existing } = await conexao.query<{ studio_config: unknown }>(
      "SELECT studio_config FROM saved_designs WHERE id = $1 AND usuario_id = $2 FOR UPDATE",
      [id, usuarioId]
    );

    if (existing.length === 0) {
      throw new NotFoundProblem(DESIGN_NAO_ENCONTRADO);
    }

    const document = resolveStudioConfig(payload, existing[0].studio_config);
    await conexao.query(
      `UPDATE saved_designs SET
        name = $1, model = $2, color = $3,
        is_sunglasses = $4, anti_reflective = $5, temple_style = $6,
        top_bar = $7, bridge_style = $8, frame_profile = $9,
        temple_open = $10, published = $11, updated_at = CURRENT_TIMESTAMP,
        studio_config = COALESCE($14::jsonb, studio_config)
       WHERE id = $12 AND usuario_id = $13`,
      [
        name, document ? `${document.frontModel}_front_${document.templeModel}_temples` : model, document?.color ?? color,
        document?.isSunglasses ?? Boolean(is_sunglasses), document ? document.lensTreatments.includes("anti_reflective") : Boolean(anti_reflective), temple_style || "standard",
        Boolean(top_bar), bridge_style || "keyhole", document?.frameProfile ?? frame_profile ?? "medium",
        document?.templeOpen ?? temple_open ?? 0.00, Boolean(published),
        id, usuarioId, document ? JSON.stringify(document) : null
      ]
    );
  }, { traceId: req.requestId });

  return res.json({ message: "Design atualizado com sucesso.", id });
}

// ─────────────────────────────────────────────────────────
//   LISTAR DESIGNS DO USUÁRIO
//   GET /api/designs
// ─────────────────────────────────────────────────────────
export async function getDesigns(req: Request, res: Response) {
  const usuarioId = req.user!.id;

  const { rows } = await pool.query(
    "SELECT * FROM saved_designs WHERE usuario_id = $1 ORDER BY created_at DESC",
    [usuarioId]
  );

  const designs = rows.map(row => ({
    id:             row.id,
    name:           row.name,
    model:          row.model,
    color:          row.color,
    isSunglasses:   Boolean(row.is_sunglasses),
    antiReflective: Boolean(row.anti_reflective),
    templeStyle:    row.temple_style,
    topBar:         Boolean(row.top_bar),
    bridgeStyle:    row.bridge_style,
    frameProfile:   row.frame_profile,
    templeOpen:     Number(row.temple_open),
    published:      Boolean(row.published),
    createdAt:      row.created_at,
    updatedAt:      row.updated_at,
    config:         row.studio_config ?? null
  }));

  return res.json({ designs });
}

// ─────────────────────────────────────────────────────────
//   DELETAR DESIGN
//   DELETE /api/designs/:id
// ─────────────────────────────────────────────────────────
export async function deleteDesign(req: Request, res: Response) {
  const { id }    = req.params;
  const usuarioId = req.user!.id;

  const { rowCount } = await pool.query(
    "DELETE FROM saved_designs WHERE id = $1 AND usuario_id = $2",
    [id, usuarioId]
  );

  if (rowCount === 0) {
    throw new NotFoundProblem(DESIGN_NAO_ENCONTRADO);
  }

  return res.json({ message: "Design removido com sucesso." });
}
