// ============================================================
//   Identificador de cobrança (billingId)
//
//   Formato: `bill-<origem>-<uuid v4>` (ex.: `bill-sim-9f1e...`).
//
//   O prefixo é apenas semântico — nenhum fluxo o interpreta — e é
//   mantido para observabilidade em logs (`sim` para o simulador,
//   `fallback` para a queda do gateway). Ele não reduz a entropia:
//   o UUID v4 inteiro (122 bits) permanece.
//
//   A entropia vem do `crypto.randomUUID()` (CSPRNG), substituindo o
//   antigo PRNG não criptográfico com ~900 mil valores previsíveis.
// ============================================================

import { randomUUID } from "node:crypto";

export type OrigemBilling = "sim" | "fallback";

export function gerarBillingId(origem: OrigemBilling = "sim"): string {
  return `bill-${origem}-${randomUUID()}`;
}
