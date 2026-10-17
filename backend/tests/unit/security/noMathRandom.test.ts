// ============================================================
//   Guarda de regressão: nenhum Math.random nos fluxos de pagamento
//
//   O billingId era gerado com Math.random (~900 mil valores
//   possíveis e previsíveis). Identificadores, tokens e segredos
//   exigem CSPRNG (crypto.randomUUID / randomBytes). Este teste falha
//   no CI se um Math.random voltar a aparecer nos controllers de
//   pagamento/pedido ou no gerador de billingId.
// ============================================================

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const raizSrc = join(dirname(fileURLToPath(import.meta.url)), "../../../src");

const ARQUIVOS_SENSIVEIS = [
  "controllers/paymentController.ts",
  "controllers/orderController.ts",
  "utils/billingId.ts",
];

describe("Math.random fora do contexto de segurança", () => {
  it.each(ARQUIVOS_SENSIVEIS)("%s não usa Math.random", (relativo) => {
    const conteudo = readFileSync(join(raizSrc, relativo), "utf8");
    expect(conteudo).not.toContain("Math.random");
  });
});
