// ============================================================
//   Asserções sobre o contrato de erro (RFC 9457)
//
//   Segue a mesma assinatura verificada em
//   tests/integration/problem-details.test.ts, para que os testes
//   de autorização cobrem o contrato real da API — e não apenas o
//   status HTTP.
// ============================================================

import { expect } from "vitest";
import { PROBLEM_TYPE_NAMESPACE } from "../../src/errors/problem.js";

export type SlugDeProblema =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "bad-request"
  | "validation"
  | "service-unavailable";

interface RespostaHttp {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Record<string, unknown>;
}

/** A resposta é um Problem Details válido, com o status e o tipo esperados. */
export function esperarProblema(res: RespostaHttp, status: number, slug: SlugDeProblema): void {
  expect(res.status).toBe(status);
  expect(res.headers["content-type"]).toContain("application/problem+json");
  expect(res.body["status"]).toBe(status);
  expect(res.body["type"]).toBe(`${PROBLEM_TYPE_NAMESPACE}/${slug}`);
  expect(typeof res.body["title"]).toBe("string");
  expect(typeof res.body["detail"]).toBe("string");
}

/**
 * Parte semântica do problema, sem os campos de correlação.
 *
 * Apenas `instance`, `timestamp` e `traceId` variam por requisição.
 * Todos os demais campos, inclusive `error` e extensões futuras, devem
 * ser iguais para não revelar a existência de um recurso fora do escopo.
 */
export function semanticaDoProblema(body: Record<string, unknown>) {
  const { instance, timestamp, traceId, ...semCorrelacao } = body;
  return semCorrelacao;
}
