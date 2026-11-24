// ============================================================
//   Recusa o byte NUL (U+0000) na URL e no corpo
//
//   O PostgreSQL não aceita U+0000 em TEXT/VARCHAR. Um `%00` na rota
//   (`/api/categories/%00`) ou um "\u0000" num campo JSON chegava até
//   a consulta e virava erro interno (500). Nenhum campo da API aceita
//   esse caractere, então a requisição é recusada com 400 antes de
//   chegar a qualquer controller.
// ============================================================

import type { NextFunction, Request, Response } from "express";
import { BadRequestProblem } from "../errors/problem.js";

const NUL = "\u0000";

/** Procura o NUL em strings, inclusive em chaves e valores aninhados. */
export function contemNul(valor: unknown, profundidade = 0): boolean {
  if (typeof valor === "string") return valor.includes(NUL);
  // O corpo tem no máximo 1 MB; o limite evita recursão sem fim em estruturas patológicas.
  if (profundidade > 32 || valor === null || typeof valor !== "object") return false;
  if (Array.isArray(valor)) return valor.some(item => contemNul(item, profundidade + 1));
  return Object.entries(valor).some(
    ([chave, item]) => chave.includes(NUL) || contemNul(item, profundidade + 1),
  );
}

function urlContemNul(url: string): boolean {
  if (/%00/i.test(url)) return true;
  try {
    return decodeURIComponent(url).includes(NUL);
  } catch {
    // Percent-encoding malformado fica para o roteador responder.
    return false;
  }
}

export function rejectNulBytes() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (urlContemNul(req.originalUrl) || contemNul(req.body)) {
      return next(new BadRequestProblem("A requisição contém um caractere inválido (U+0000)."));
    }
    next();
  };
}
