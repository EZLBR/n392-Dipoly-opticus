// ============================================================
//   DESIGN CONTROLLER — Designs salvos no Creator Studio
//
//   DB-03: adapta o HTTP. A regra, a autorização por dono (BOLA-04 e
//   BOLA-05) e o acesso ao banco ficam no DesignService.
// ============================================================

import type { Request, Response } from "express";
import { publicIdDoUsuario } from "../utils/identidade.js";
import type { SaveDesignDTO } from "../dtos/design/design.dto.js";
import { DesignService } from "../services/designService.js";

// ─────────────────────────────────────────────────────────
//   CRIAR DESIGN
//   POST /api/designs
// ─────────────────────────────────────────────────────────
export async function createDesign(req: Request, res: Response) {
  const id = await DesignService.create(publicIdDoUsuario(req), req.body as SaveDesignDTO);

  return res.status(201).json({
    message: "Design salvo com sucesso.",
    id
  });
}

// ─────────────────────────────────────────────────────────
//   ATUALIZAR DESIGN
//   PUT /api/designs/:id
// ─────────────────────────────────────────────────────────
export async function updateDesign(req: Request, res: Response) {
  const { id } = req.params as { id: string };
  await DesignService.update(publicIdDoUsuario(req), id, req.body as SaveDesignDTO);

  return res.json({ message: "Design atualizado com sucesso.", id });
}

// ─────────────────────────────────────────────────────────
//   LISTAR DESIGNS DO USUÁRIO
//   GET /api/designs
// ─────────────────────────────────────────────────────────
export async function getDesigns(req: Request, res: Response) {
  return res.json({ designs: await DesignService.list(publicIdDoUsuario(req)) });
}

// ─────────────────────────────────────────────────────────
//   DELETAR DESIGN
//   DELETE /api/designs/:id
// ─────────────────────────────────────────────────────────
export async function deleteDesign(req: Request, res: Response) {
  await DesignService.delete(publicIdDoUsuario(req), String(req.params.id));

  return res.json({ message: "Design removido com sucesso." });
}
