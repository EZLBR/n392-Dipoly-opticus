// ============================================================
//   SEC-05 — Regra de precificação do servidor
//
//   Função pura: nenhum banco, rede ou app. Inclui o contrato com a
//   prévia do frontend, porque o cliente vê um preço e paga outro se
//   as duas cópias da regra divergirem.
// ============================================================

import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import {
  MATERIAIS_DE_ARMACAO,
  MATERIAIS_DE_LENTE,
  PERFIS_DE_ARMACAO,
  QUANTIDADE_MAXIMA_POR_ITEM,
  TRATAMENTOS_DE_LENTE,
  centavosParaDecimal,
  precoDoItem,
  precoUnitarioEmCentavos,
  type EspecificacaoPrecificavel,
} from "../../../src/domain/pricing.js";

const simples: EspecificacaoPrecificavel = {
  isSunglasses: false,
  frameProfile: "medium",
  frameMaterial: "acetate",
  lensMaterial: "cr39",
  lensTreatments: [],
};

describe("precoUnitarioEmCentavos", () => {
  it.each<[string, Partial<EspecificacaoPrecificavel>, number]>([
    ["armação simples", {}, 18_000],
    ["lente de sol: +40", { isSunglasses: true }, 22_000],
    ["perfil bold: +20", { frameProfile: "bold" }, 20_000],
    ["perfil thin não muda o preço", { frameProfile: "thin" }, 18_000],
    ["titânio: +80", { frameMaterial: "titanium" }, 26_000],
    ["ouro: +80", { frameMaterial: "gold" }, 26_000],
    ["fibra de carbono: +80", { frameMaterial: "carbon_fiber" }, 26_000],
    ["aço inoxidável não é premium", { frameMaterial: "stainless_steel" }, 18_000],
    ["madeira não é premium", { frameMaterial: "wood" }, 18_000],
    ["lente de policarbonato: +30", { lensMaterial: "polycarbonate" }, 21_000],
    ["um tratamento: +15", { lensTreatments: ["polarized"] }, 19_500],
    ["dois tratamentos: +30", { lensTreatments: ["anti_reflective", "uv_protection"] }, 21_000],
    ["tratamento repetido conta uma vez", { lensTreatments: ["polarized", "polarized"] }, 19_500],
    [
      "tudo no máximo: 180 + 40 + 20 + 80 + 30 + 6 × 15 = 440",
      {
        isSunglasses: true,
        frameProfile: "bold",
        frameMaterial: "gold",
        lensMaterial: "polycarbonate",
        lensTreatments: [...TRATAMENTOS_DE_LENTE],
      },
      44_000,
    ],
  ])("%s", (_caso, alteracoes, esperado) => {
    expect(precoUnitarioEmCentavos({ ...simples, ...alteracoes })).toBe(esperado);
  });
});

describe("precoDoItem", () => {
  it("multiplica o preço unitário pela quantidade", () => {
    expect(precoDoItem({ ...simples, isSunglasses: true }, 3)).toEqual({ unitario: 22_000, total: 66_000 });
  });

  it("aceita a quantidade máxima", () => {
    expect(precoDoItem(simples, QUANTIDADE_MAXIMA_POR_ITEM).total).toBe(18_000 * QUANTIDADE_MAXIMA_POR_ITEM);
  });

  it.each([0, -1, 1.5, Number.NaN, QUANTIDADE_MAXIMA_POR_ITEM + 1])("recusa a quantidade %s", (quantidade) => {
    expect(() => precoDoItem(simples, quantidade)).toThrow(RangeError);
  });
});

describe("centavosParaDecimal", () => {
  it.each([
    [0, "0.00"],
    [5, "0.05"],
    [99, "0.99"],
    [100, "1.00"],
    [18_000, "180.00"],
    [19_550, "195.50"],
    [4_400_000, "44000.00"],
    [9_999_999_999, "99999999.99"],
  ])("%i centavos → %s", (centavos, texto) => {
    expect(centavosParaDecimal(centavos)).toBe(texto);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2])(
    "recusa %s",
    (centavos) => {
      expect(() => centavosParaDecimal(centavos)).toThrow(RangeError);
    },
  );
});

// O frontend exibe a prévia com frontend/src/utils/pricing.ts. Se as duas
// regras divergirem, o cliente vê um preço no Studio e é cobrado por outro.
// O teste percorre todas as combinações de opções do catálogo.
describe("contrato com a prévia do frontend", () => {
  it("o servidor cobra exatamente o preço que o Studio exibe, em todas as combinações", async () => {
    const caminho = fileURLToPath(new URL("../../../../frontend/src/utils/pricing.ts", import.meta.url));
    const { calculateBasePrice } = (await import(/* @vite-ignore */ caminho)) as {
      calculateBasePrice: (especificacao: EspecificacaoPrecificavel) => number;
    };

    const subconjuntos = Array.from({ length: 2 ** TRATAMENTOS_DE_LENTE.length }, (_, mascara) =>
      TRATAMENTOS_DE_LENTE.filter((_, i) => mascara & (1 << i)),
    );

    const divergencias: string[] = [];
    let combinacoes = 0;
    for (const isSunglasses of [false, true])
      for (const frameProfile of PERFIS_DE_ARMACAO)
        for (const frameMaterial of MATERIAIS_DE_ARMACAO)
          for (const lensMaterial of MATERIAIS_DE_LENTE)
            for (const lensTreatments of subconjuntos) {
              const especificacao = { isSunglasses, frameProfile, frameMaterial, lensMaterial, lensTreatments };
              const servidor = precoUnitarioEmCentavos(especificacao);
              const previa = Math.round(calculateBasePrice(especificacao) * 100);
              combinacoes++;
              if (servidor !== previa) divergencias.push(`${JSON.stringify(especificacao)}: ${servidor} × ${previa}`);
            }

    expect(combinacoes).toBe(2 * 3 * 7 * 2 * 64);
    expect(divergencias).toEqual([]);
  });
});
