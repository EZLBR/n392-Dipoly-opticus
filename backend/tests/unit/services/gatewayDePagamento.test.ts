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
  URL_DE_PRODUTO,
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

/** O cadastro do produto responde `produto` (sucesso por padrão); o checkout responde `resposta`. */
function responder(resposta: Response | Error, produto: () => Response | Error = () => corpo(200, { success: true, data: { id: "prod_1" } })) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
    const r = url === URL_DE_PRODUTO ? produto() : resposta;
    if (r instanceof Error) throw r;
    return r;
  });
}

const chamadasPara = (spy: ReturnType<typeof responder>, url: string) => spy.mock.calls.filter(([u]) => u === url);

afterEach(() => vi.restoreAllMocks());

describe("solicitarCobranca", () => {
  it("envia a cobrança autenticada, com tempo limite", async () => {
    const chamada = responder(corpo(200, { success: true, data: { id: "bill_1", url: "https://pagar.invalid" } }));

    await solicitarCobranca("token-secreto", pedido);

    const [produto] = chamadasPara(chamada, URL_DE_PRODUTO);
    expect(JSON.parse(String(produto[1]?.body))).toEqual({ externalId: "42", name: "Wayfarer", price: 21_000, currency: "BRL" });

    const [[url, init]] = chamadasPara(chamada, URL_DE_COBRANCA);
    expect(url).toBe("https://api.abacatepay.com/v2/checkouts/create");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer token-secreto");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init?.body))).toEqual({
      items: [{ id: "42", quantity: 2 }],
      methods: ["PIX"],
      returnUrl: pedido.returnUrl,
      completionUrl: pedido.completionUrl,
      externalId: "42",
    });
    expect(TEMPO_LIMITE_DO_GATEWAY_MS).toBe(10_000);
  });

  it("produto já cadastrado numa tentativa anterior do mesmo pedido: segue para o checkout", async () => {
    const chamada = responder(
      corpo(200, { success: true, data: { id: "bill_1", url: "https://pagar.invalid" } }),
      () => corpo(400, { success: false, error: "Product with externalId already exists" }),
    );
    expect(await solicitarCobranca("t", pedido)).toMatchObject({ status: "criada" });
    expect(chamadasPara(chamada, URL_DE_COBRANCA)).toHaveLength(1);
  });

  it.each<[string, () => Response | Error]>([
    ["recusa declarada", () => corpo(401, { success: false, error: "Insufficient permissions" })],
    ["falha de rede", () => new TypeError("fetch failed")],
  ])("falha ao cadastrar o produto (%s): recusada, sem criar checkout", async (_caso, produto) => {
    const chamada = responder(corpo(200, { success: true, data: { id: "bill_1", url: "https://pagar.invalid" } }), produto);
    expect(await solicitarCobranca("t", pedido)).toMatchObject({ status: "recusada", motivo: expect.stringMatching(/^produto: /) });
    expect(chamadasPara(chamada, URL_DE_COBRANCA)).toHaveLength(0);
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

  describe("incerta: sem resposta conclusiva, a cobrança pode existir", () => {
    it.each<[string, Response | Error]>([
      ["falha de rede", new TypeError("fetch failed")],
      ["tempo limite", new DOMException("The operation was aborted due to timeout", "TimeoutError")],
      ["502 sem corpo legível", texto(502, "<html>Bad Gateway</html>")],
      ["503 com JSON sem success", corpo(503, { message: "indisponível" })],
      ["500 com success false ainda é incerto", corpo(500, { success: false, error: "falha interna" })],
      ["503 com success false ainda é incerto", corpo(503, { success: false })],
      ["408 com success false ainda é incerto", corpo(408, { success: false })],
      ["429 sem corpo legível ainda é incerto", texto(429, "limite atingido")],
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
