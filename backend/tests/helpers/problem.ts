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
  | "validation";

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
 * `instance`, `timestamp` e `traceId` mudam a cada requisição por
 * definição. Para provar que dois casos são indistinguíveis — recurso
 * inexistente e recurso de outra pessoa — compara-se só o que o
 * cliente poderia usar como oráculo.
 */
export function semanticaDoProblema(body: Record<string, unknown>) {
  return {
    type: body["type"],
    title: body["title"],
    status: body["status"],
    detail: body["detail"],
  };
}
