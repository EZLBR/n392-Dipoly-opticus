// ============================================================
//   ID-02 — Identidade do usuário autenticado
//
//   O token carrega só o publicId do usuário. As consultas resolvem o
//   id interno dentro da própria cláusula, com a subconsulta abaixo,
//   sem uma busca separada antes da query.
// ============================================================

import type { Request } from "express";
import { UnauthorizedProblem } from "../errors/problem.js";

/** publicId do usuário autenticado, vindo exclusivamente do token. */
export function publicIdDoUsuario(req: Request): string {
  const publicId = req.user?.publicId;
  if (typeof publicId !== "string" || !publicId) {
    throw new UnauthorizedProblem("Sessão inválida.");
  }
  return publicId;
}

/**
 * Subconsulta SQL que resolve o id interno de um usuário pelo publicId
 * recebido no parâmetro posicional indicado (ex.: `usuarioPorPublicId("$2")`).
 */
export const usuarioPorPublicId = (parametro: string) =>
  `(SELECT u.id FROM usuarios u WHERE u."publicId" = ${parametro})`;
