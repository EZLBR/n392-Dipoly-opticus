// ============================================================
//   PAGAMENTO — gateway real e simulador
//
//   Ponto único da regra do SEC-06: o simulador de pagamento só
//   existe fora de produção. As rotas do simulador e os dois
//   caminhos de cobrança (checkout-cart e create-billing) decidem
//   a partir daqui.
// ============================================================

import { env } from "./env.js";

/** Fora de produção, o checkout cai no simulador quando o gateway não está disponível. */
export const simuladorDePagamentoAtivo = env.NODE_ENV !== "production";

/** Tempo máximo de espera pela resposta do gateway antes de tratá-lo como indisponível. */
export const TEMPO_LIMITE_DO_GATEWAY_MS = 10_000;

/** Resposta ao cliente quando, em produção, não é possível criar a cobrança real. */
export const PAGAMENTO_INDISPONIVEL =
  "O pagamento está indisponível no momento. Nenhuma cobrança foi criada; tente novamente mais tarde.";

/** Há um token real do AbacatePay, e não vazio nem o valor de exemplo do .env.example. */
export function gatewayDePagamentoConfigurado(token: string | undefined = process.env.ABACATE_TOKEN): boolean {
  return Boolean(token) && !token!.includes("your_abacatepay_token_here");
}
