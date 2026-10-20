// ============================================================
//   Classificação da resposta do gateway de pagamento (SEC-06)
//
//   Só "recusada" autoriza desfazer pedidos. Tudo o que não for uma
//   recusa declarada ou uma cobrança identificada é "incerta": a
//   cobrança pode existir e nada pode ser desfeito.
// ============================================================

import { describe, it, expect, vi, afterEach } from "vitest";
import {
  TEMPO_LIMITE_DO_GATEWAY_MS,
  URL_DE_COBRANCA,
  solicitarCobranca,
  type PedidoDeCobranca,
} from "../../../src/services/gatewayDePagamento.js";

const pedido: PedidoDeCobranca = {
  products: [{ externalId: "42", name: "Wayfarer", quantity: 2, price: 21_000 }],
  returnUrl: "https://loja.invalid/",
  completionUrl: "https://loja.invalid/",
  customer: { name: "Cliente", email: "cliente@exemplo.invalid", taxId: "00000000000" },
};

const corpo = (status: number, conteudo: unknown) =>
  new Response(JSON.stringify(conteudo), { status, headers: { "Content-Type": "application/json" } });
const texto = (status: number, conteudo: string) => new Response(conteudo, { status });

function responder(resposta: Response | Error) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
    if (resposta instanceof Error) throw resposta;
    return resposta;
  });
}

afterEach(() => vi.restoreAllMocks());

describe("solicitarCobranca", () => {
  it("envia a cobrança autenticada, com tempo limite", async () => {
    const chamada = responder(corpo(200, { success: true, data: { id: "bill_1", url: "https://pagar.invalid" } }));

    await solicitarCobranca("token-secreto", pedido);

    const [url, init] = chamada.mock.calls[0];
    expect(url).toBe(URL_DE_COBRANCA);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-secreto");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toMatchObject({ frequency: "ONE_TIME", methods: ["PIX"], ...pedido });
    expect(TEMPO_LIMITE_DO_GATEWAY_MS).toBe(10_000);
  });

  it("2xx com success e id/url: criada", async () => {
    responder(corpo(200, { success: true, data: { id: "bill_1", url: "https://pagar.invalid" } }));
    expect(await solicitarCobranca("t", pedido)).toEqual({ status: "criada", billingId: "bill_1", url: "https://pagar.invalid" });
  });

  describe("recusada: o gateway respondeu que não criou a cobrança", () => {
    it.each<[string, Response, string]>([
      ["422 com success: false", corpo(422, { success: false, error: "CPF inválido" }), "CPF inválido"],
      ["200 com success: false", corpo(200, { success: false }), "HTTP 200"],
      ["401 sem corpo legível", texto(401, "unauthorized"), "HTTP 401"],
    ])("%s", async (_caso, resposta, motivo) => {
      responder(resposta);
      expect(await solicitarCobranca("t", pedido)).toEqual({ status: "recusada", motivo });
    });
  });

  describe("incerta: sem resposta conclusiva ou com falha do servidor do gateway", () => {
    it.each<[string, Response | Error]>([
      ["falha de rede", new TypeError("fetch failed")],
      ["tempo limite", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
      ["502 sem corpo legível", texto(502, "<html>Bad Gateway</html>")],
      ["503 com JSON sem success", corpo(503, { message: "indisponível" })],
      // O servidor do gateway falhou: a declaração não garante que a cobrança deixou de existir.
      ["500 com success: false declarado", corpo(500, { success: false, error: "falha interna" })],
      ["503 com success: false declarado", corpo(503, { success: false })],
      ["200 sem corpo legível", texto(200, "ok")],
      ["200 com success sem id/url", corpo(200, { success: true })],
    ])("%s", async (_caso, resposta) => {
      responder(resposta);
      const resultado = await solicitarCobranca("t", pedido);
      expect(resultado.status).toBe("incerta");
    });
  });

  it("o motivo registrado fica limitado a uma linha de 300 caracteres", async () => {
    responder(corpo(422, { success: false, error: `${"x".repeat(400)}\nstack interna` }));
    const resultado = await solicitarCobranca("t", pedido);
    expect(resultado).toMatchObject({ status: "recusada" });
    expect((resultado as { motivo: string }).motivo).toHaveLength(300);
  });
});
