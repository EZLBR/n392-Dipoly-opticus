import crypto from "crypto";
import type { RequestHandler } from "express";

/**
 * Gera um identificador de correlação para cada requisição.
 *
 * O id é sempre gerado no servidor (nunca reutilizado do cliente), garantindo
 * unicidade do campo `instance` das respostas Problem Details e permitindo
 * rastrear uma ocorrência nos logs.
 */
export function requestId(): RequestHandler {
  return (req, res, next) => {
    req.requestId = crypto.randomUUID();
    res.setHeader("X-Request-Id", req.requestId);
    next();
  };
}