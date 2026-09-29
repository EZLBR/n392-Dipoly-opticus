// ============================================================
//   Middleware global de erro — Problem Details (RFC 9457)
//
//   Captura QUALQUER erro que chega ao pipeline do Express
//   (via next(err) ou rejeição/throw em handler async) e responde
//   no formato application/problem+json. Também traduz erros da
//   camada de dados (Prisma e driver pg) para os códigos HTTP
//   corretos (unique → 409, not found → 404).
//
//   Nenhum detalhe de infraestrutura (stack, driver, SQL) é
//   exposto no corpo: ele fica apenas nos logs, referenciado pelo
//   mesmo `instance` devolvido ao cliente.
// ============================================================

import crypto from "crypto";
import type { ErrorRequestHandler, Response } from "express";
import {
  BadRequestProblem,
  ConflictProblem,
  ForbiddenProblem,
  HttpProblem,
  InternalServerErrorProblem,
  NotFoundProblem,
  TooManyRequestsProblem,
  UnauthorizedProblem,
  ValidationProblem,
  type ProblemDetails,
  type ValidationFieldError,
} from "../errors/problem.js";
import logger from "../utils/logger.js";

/**
 * Corpo de erro devolvido ao cliente: RFC 9457 + `timestamp` + alias `error`.
 *
 * `traceId` é o identificador de correlação opaco (UUID) que o cliente pode
 * reportar num chamado; é o mesmo valor do `instance` (RFC 9457), do header
 * `X-Request-Id` e da chave usada nos logs do servidor.
 */
export interface ProblemResponseBody extends ProblemDetails {
  detail: string;
  instance: string;
  timestamp: string;
  traceId: string;
  error: string;
}

const SQLSTATE = /^[0-9A-Z]{5}$/;
const SQLSTATE_UNIQUE = new Set(["23505", "23P01"]);
const SQLSTATE_FK = "23503";
const SQLSTATE_NO_DATA = "P0002";

// ─────────────────────────────────────────────────────────
//   Tradução de erros do banco de dados
// ─────────────────────────────────────────────────────────

/** Valores que podem vazar no detail. Campos de schema não são infraestrutura. */
function alvos(deAlvo: unknown): string | null {
  if (Array.isArray(deAlvo)) {
    return deAlvo.map(String).join(", ");
  }
  return typeof deAlvo === "string" ? deAlvo : null;
}

/**
 * Traduz um erro de banco para um HttpProblem. Devolve null quando o erro
 * não tem sinal conhecido (virou 500 genérico no middleware).
 */
function mapearErroBanco(err: Error): HttpProblem | null {
  const comCodigo = err as Error & {
    code?: unknown;
    meta?: { code?: unknown; target?: unknown };
  };

  // Prisma translada violações do Postgres para códigos P####.
  if (comCodigo.name === "PrismaClientKnownRequestError") {
    switch (comCodigo.code) {
      case "P2002": {
        const campos = alvos(comCodigo.meta?.target);
        return new ConflictProblem(
          campos
            ? `Já existe um registro com o mesmo valor para: ${campos}.`
            : "Já existe um registro com os mesmos dados.",
        );
      }
      case "P2025":
        return new NotFoundProblem("Recurso não encontrado.");
      case "P2010": {
        const raiz = comCodigo.meta?.code;
        if (SQLSTATE_UNIQUE.has(String(raiz))) {
          return new ConflictProblem("Já existe um registro com os mesmos dados.");
        }
        if (raiz === SQLSTATE_FK) {
          return new ConflictProblem("Registro referenciado não existe.");
        }
        return null;
      }
      default:
        return null;
    }
  }

  // Erro cru do driver pg: `code` é o SQLSTATE de 5 caracteres.
  if (typeof comCodigo.code === "string" && SQLSTATE.test(comCodigo.code)) {
    if (SQLSTATE_UNIQUE.has(comCodigo.code)) {
      return new ConflictProblem("Já existe um registro com os mesmos dados.");
    }
    if (comCodigo.code === SQLSTATE_FK) {
      return new ConflictProblem("Registro referenciado não existe.");
    }
    if (comCodigo.code === SQLSTATE_NO_DATA) {
      return new NotFoundProblem("Recurso não encontrado.");
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────
//   Erros legados e erros do framework
// ─────────────────────────────────────────────────────────

/** Detalhe seguro para erros de parsing do corpo (não ecoa o payload). */
function detalheSeguro(err: Error & { type?: unknown }): string {
  const tipo = err.type;
  if (typeof tipo === "string" && (tipo.startsWith("entity.parse") || tipo.startsWith("encoding."))) {
    return "Corpo da requisição inválido.";
  }
  return err.message || "Requisição inválida.";
}

/** Converte status legado 4xx no HttpProblem correspondente. */
function problemaPorStatus(status: number, detail: string): HttpProblem {
  switch (status) {
    case 400:
      return new BadRequestProblem(detail);
    case 401:
      return new UnauthorizedProblem(detail);
    case 403:
      return new ForbiddenProblem(detail);
    case 404:
      return new NotFoundProblem(detail);
    case 409:
      return new ConflictProblem(detail);
    case 422:
      return new ValidationProblem([], { detail });
    case 429:
      return new TooManyRequestsProblem(detail);
    default:
      return new BadRequestProblem(detail);
  }
}

/**
 * Encara erros "legados" (Exceptions/objetos com `status` numérico 4xx,
 * ex.: erros do body-parser, `throw { status, message }`) como Problem.
 * Utilizado como rede de segurança para nada cair em 500.
 */
function mapearErroLegado(err: Error & { status?: unknown; type?: unknown }): HttpProblem | null {
  const status = err.status;
  if (typeof status !== "number" || status < 400 || status >= 500) {
    return null;
  }

  return problemaPorStatus(status, detalheSeguro(err));
}

/** Converte qualquer erro desconhecido no HttpProblem correspondente. */
export function paraProblema(err: unknown): HttpProblem | null {
  if (err instanceof HttpProblem) {
    return err;
  }

  if (err instanceof Error) {
    return mapearErroBanco(err) ?? mapearErroLegado(err);
  }

  // Objeto legado "throw { status, message }".
  if (err !== null && typeof err === "object") {
    const legado = err as { status?: unknown; message?: unknown };
    if (
      typeof legado.status === "number" &&
      legado.status >= 400 &&
      legado.status < 500 &&
      typeof legado.message === "string"
    ) {
      return problemaPorStatus(legado.status, legado.message);
    }
  }

  return null;
}

// ─────────────────────────────────────────────────────────
//   Serialização
// ─────────────────────────────────────────────────────────

function montarCorpo(problem: HttpProblem, traceId: string): ProblemResponseBody {
  const base = problem.toJSON();
  const detail = problem.detail ?? problem.message;
  const corpo: ProblemResponseBody = {
    ...base,
    detail,
    instance: problem.instance ?? traceId,
    timestamp: new Date().toISOString(),
    traceId,
    error: detail,
  };
  if (base.errors !== undefined) {
    corpo.errors = base.errors as ValidationFieldError[];
  }
  return corpo;
}

function enviar(res: Response, problem: HttpProblem, traceId: string): void {
  res
    .status(problem.status)
    .set("Content-Type", "application/problem+json")
    .json(montarCorpo(problem, traceId));
}

// ─────────────────────────────────────────────────────────
//   Middleware
// ─────────────────────────────────────────────────────────

export const problemErrorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const traceId = req.requestId ?? crypto.randomUUID();
  const problem = paraProblema(err);

  if (problem === null) {
    logger.error({ err, traceId, requestId: req.requestId }, "Erro não mapeado pelo middleware de Problem Details");
    return enviar(res, new InternalServerErrorProblem("Ocorreu um erro interno no servidor."), traceId);
  }

  if (problem.status >= 500) {
    logger.error({ err, traceId, requestId: req.requestId }, "Erro interno no servidor");
  }

  return enviar(res, problem, traceId);
};

export default problemErrorHandler;