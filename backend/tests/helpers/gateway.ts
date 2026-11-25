// ============================================================
//   AbacatePay simulado nos testes de integração
//
//   Na API v2 a cobrança tem duas chamadas: cadastrar o produto do
//   pedido e criar o checkout. Os cenários dos testes (recusa, timeout,
//   aprovação...) valem para o checkout; o cadastro do produto sempre
//   responde sucesso, a menos que o teste diga o contrário.
// ============================================================

import { vi, type MockInstance } from "vitest";
import { URL_DE_COBRANCA, URL_DE_PRODUTO } from "../../src/services/gatewayDePagamento.js";

type Fetch = typeof globalThis.fetch;
type Spy = MockInstance<Fetch>;

const produtoCriado = () =>
  new Response(JSON.stringify({ success: true, data: { id: "prod_teste" } }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });

/** Espiona o fetch: o checkout segue `checkout`, o cadastro de produto responde sucesso. */
export function espiarCheckout(checkout: (...args: Parameters<Fetch>) => Promise<Response>): Spy {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) =>
    url === URL_DE_PRODUTO ? produtoCriado() : checkout(url, init));
}

const corpoDe = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

/** Corpos enviados para criar o checkout. */
export const checkoutsEnviados = (spy: Spy) =>
  spy.mock.calls.filter(([url]) => url === URL_DE_COBRANCA).map(([, init]) => corpoDe(init));

/** Corpos enviados para cadastrar produtos. */
export const produtosEnviados = (spy: Spy) =>
  spy.mock.calls.filter(([url]) => url === URL_DE_PRODUTO).map(([, init]) => corpoDe(init));
