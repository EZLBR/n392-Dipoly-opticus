import { describe, expect, it } from "vitest";
import { createProductSchema } from "../../../src/dtos/product/product.dto.js";

function mensagemDoPreco(corpo: Record<string, unknown>): string | undefined {
  const resultado = createProductSchema.safeParse(corpo);
  return resultado.success ? undefined : resultado.error.issues.find(i => i.path[0] === "preco")?.message;
}

describe("preço do produto", () => {
  it("sem preço, diz que é obrigatório", () => {
    expect(mensagemDoPreco({ nome: "Aviador" })).toBe("Preço é obrigatório.");
  });

  it("com preço inválido, diz que deve ser positivo", () => {
    expect(mensagemDoPreco({ nome: "Aviador", preco: "abc" })).toBe("Preço deve ser um número positivo.");
    expect(mensagemDoPreco({ nome: "Aviador", preco: -10 })).toBe("Preço deve ser um número positivo.");
  });
});
