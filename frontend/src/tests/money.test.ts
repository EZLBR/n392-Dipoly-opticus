import { expect, it } from "vitest";
import { formatMoney } from "../utils/money";

// A cobrança é em BRL: todas as telas usam o mesmo formato, no padrão do idioma
it("formata preços em reais no padrão do idioma", () => {
  expect(formatMoney(1234.5, "pt").replace(/\s/g, " ")).toBe("R$ 1.234,50");
  expect(formatMoney(1234.5, "en")).toBe("R$1,234.50");
});

it("preço inválido aparece como \"—\", não como grátis", () => {
  expect(formatMoney(Number.NaN, "pt")).toBe("—");
  expect(formatMoney(Number.POSITIVE_INFINITY, "en")).toBe("—");
});
