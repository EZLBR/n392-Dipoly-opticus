import { describe, it, expect } from "vitest";
import { gerarBillingId, type OrigemBilling } from "../../../src/utils/billingId.js";

// UUID v4: versão 4 e variante RFC 4122.
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("gerarBillingId", () => {
  it.each<[OrigemBilling]>([["sim"], ["fallback"]])(
    "gera um UUID v4 válido com o prefixo de origem %s",
    (origem) => {
      const billingId = gerarBillingId(origem);

      expect(billingId).toMatch(/^bill-(sim|fallback)-/);
      expect(billingId).toBe(`bill-${origem}-${billingId.slice(`bill-${origem}-`.length)}`);

      const uuid = billingId.replace(/^bill-(sim|fallback)-/, "");
      expect(uuid).toMatch(UUID_V4);
    }
  );

  it("usa 'sim' como origem padrão", () => {
    expect(gerarBillingId()).toMatch(/^bill-sim-/);
  });

  it("duas chamadas consecutivas retornam valores diferentes", () => {
    const vistas = new Set(Array.from({ length: 1000 }, () => gerarBillingId()));
    expect(vistas.size).toBe(1000);
  });

  it("cabe no VARCHAR(255) usado em pedidos.abacate_billing_id e pagamentos.referencia_externa", () => {
    expect(gerarBillingId("fallback").length).toBeLessThanOrEqual(255);
  });
});
