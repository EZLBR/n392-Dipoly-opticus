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

/** Resposta quando, em produção, o gateway confirmou que a cobrança não foi criada. */
export const PAGAMENTO_INDISPONIVEL =
  "O pagamento está indisponível no momento. Nenhuma cobrança foi criada; tente novamente mais tarde.";

/** Resposta quando o gateway não respondeu de forma conclusiva: a cobrança pode existir. */
export const PAGAMENTO_NAO_CONFIRMADO =
  "Não foi possível confirmar a cobrança com o gateway de pagamento. O pedido foi mantido como pendente; " +
  "confira seus pedidos antes de tentar novamente.";

/** Há um token real do AbacatePay, e não vazio nem o valor de exemplo do .env.example. */
export function gatewayDePagamentoConfigurado(token: string | undefined = process.env.ABACATE_TOKEN): boolean {
  return Boolean(token) && !token!.includes("your_abacatepay_token_here");
}
