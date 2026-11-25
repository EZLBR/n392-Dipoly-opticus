// ============================================================
//   AbacatePay simulado nos testes de integração
//
//   Na API v2 a cobrança tem duas chamadas: cadastrar o produto e criar
//   o checkout. O simulado guarda estado como o AbacatePay real (revisão
//   do #146):
//
//   - um externalId já cadastrado responde "already exists" e o produto
//     mantém o preço do primeiro cadastro;
//   - o checkout vale a soma de preço × quantidade dos produtos
//     cadastrados (data.amount).
//
//   O cenário do teste (recusa, timeout, aprovação...) decide só a
//   resposta do checkout. Numa aprovação sem `amount`, o simulado
//   preenche o valor calculado; o cenário que quiser testar um valor
//   divergente manda o próprio `amount`.
// ============================================================

import { vi, type MockInstance } from "vitest";
import { URL_DE_COBRANCA, URL_DE_PRODUTO } from "../../src/services/gatewayDePagamento.js";

type Fetch = typeof globalThis.fetch;
type Spy = MockInstance<Fetch>;
type Item = { id: string; quantity: number };

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "Content-Type": "application/json" } });

const corpoDe = (init: RequestInit | undefined) => JSON.parse(String(init?.body));

/** Valor que o AbacatePay cobraria pelos itens, com os preços já cadastrados. */
const valorDosItens = (precos: Map<string, number>, itens: Item[]) =>
  itens.reduce((soma, item) => soma + (precos.get(item.id) ?? Number.NaN) * item.quantity, 0);

/** Na aprovação sem `amount`, devolve a mesma resposta com o valor calculado. */
async function comValor(resposta: Response, valor: number): Promise<Response> {
  let corpo: { success?: unknown; data?: Record<string, unknown> };
  try {
    corpo = await resposta.clone().json();
  } catch {
    return resposta;
  }
  if (corpo?.success !== true || typeof corpo.data !== "object" || corpo.data === null || "amount" in corpo.data) {
    return resposta;
  }
  return json(resposta.status, { ...corpo, data: { ...corpo.data, amount: valor } });
}

/** Espiona o fetch com um AbacatePay que guarda os produtos; o checkout segue `checkout`. */
export function espiarCheckout(checkout: (...args: Parameters<Fetch>) => Promise<Response>): Spy {
  const precos = new Map<string, number>();
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (url === URL_DE_PRODUTO) {
      const produto = corpoDe(init);
      if (precos.has(produto.externalId)) {
        return json(400, { success: false, data: null, error: "Product with externalId already exists" });
      }
      precos.set(produto.externalId, produto.price);
      return json(200, { success: true, error: null, data: { id: `prod_${precos.size}`, ...produto } });
    }
    const resposta = await checkout(url, init);
    return url === URL_DE_COBRANCA ? comValor(resposta, valorDosItens(precos, corpoDe(init).items)) : resposta;
  });
}

/** Corpos enviados para criar o checkout. */
export const checkoutsEnviados = (spy: Spy) =>
  spy.mock.calls.filter(([url]) => url === URL_DE_COBRANCA).map(([, init]) => corpoDe(init));

/** Corpos enviados para cadastrar produtos. */
export const produtosEnviados = (spy: Spy) =>
  spy.mock.calls.filter(([url]) => url === URL_DE_PRODUTO).map(([, init]) => corpoDe(init));

/** Valor, em centavos, de cada checkout pedido, com o preço que o AbacatePay guardou (o do primeiro cadastro). */
export function valoresCobrados(spy: Spy): number[] {
  const precos = new Map<string, number>();
  for (const produto of produtosEnviados(spy)) {
    if (!precos.has(produto.externalId)) precos.set(produto.externalId, produto.price);
  }
  return checkoutsEnviados(spy).map((checkout) => valorDosItens(precos, checkout.items));
}
