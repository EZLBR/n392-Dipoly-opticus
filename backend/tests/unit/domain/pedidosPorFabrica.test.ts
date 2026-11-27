import { describe, expect, it } from "vitest";
import { agruparPorFabrica } from "../../../src/domain/pedidosPorFabrica.js";

describe("agruparPorFabrica (FEAT-04, ADR-0004)", () => {
  it("junta os itens da mesma fábrica, na ordem em que cada fábrica aparece", () => {
    expect(agruparPorFabrica([7, 3, 7, null, 3, null])).toEqual([[0, 2], [1, 4], [3, 5]]);
  });

  it("uma fábrica só vira um grupo com todos os itens", () => {
    expect(agruparPorFabrica([5, 5, 5])).toEqual([[0, 1, 2]]);
  });

  it("sem fábrica cadastrada, todos os itens ficam no mesmo grupo", () => {
    expect(agruparPorFabrica([null, null])).toEqual([[0, 1]]);
  });

  it("carrinho vazio não tem grupo", () => {
    expect(agruparPorFabrica([])).toEqual([]);
  });
});
