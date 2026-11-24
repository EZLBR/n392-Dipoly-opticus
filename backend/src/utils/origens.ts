import type { Request } from "express";

/**
 * Onde o navegador abriu a loja e onde a API responde, para montar os
 * links de pagamento e de retorno.
 */
export function origensDaRequisicao(req: Request): { frontend: string; backend: string } {
  const frontend = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : "http://localhost:5173");
  const protocolo = req.headers["x-forwarded-proto"] || req.protocol;
  return { frontend, backend: `${protocolo}://${req.get("host")}` };
}
