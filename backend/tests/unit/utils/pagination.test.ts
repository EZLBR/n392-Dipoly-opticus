import { describe, it, expect } from "vitest";
import { parsePagination } from "../../../src/utils/pagination.js";

describe("parsePagination helper (CONC-04)", () => {
  it("deve aplicar valores padrão quando page e limit forem omitidos", () => {
    const res = parsePagination({});
    expect(res.isValid).toBe(true);
    expect(res.page).toBe(1);
    expect(res.limit).toBe(20);
    expect(res.offset).toBe(0);
  });

  it("deve limitar limit=999999999 ao teto máximo de 100", () => {
    const res = parsePagination({ limit: "999999999" });
    expect(res.isValid).toBe(true);
    expect(res.limit).toBe(100);
    expect(res.page).toBe(1);
    expect(res.offset).toBe(0);
  });

  it("deve rejeitar page=-1 retornando isValid: false (evita OFFSET negativo)", () => {
    const res = parsePagination({ page: "-1" });
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("deve rejeitar limit=abc retornando isValid: false", () => {
    const res = parsePagination({ limit: "abc" });
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("deve rejeitar limit=0 retornando isValid: false", () => {
    const res = parsePagination({ limit: "0" });
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("deve rejeitar page=0 retornando isValid: false", () => {
    const res = parsePagination({ page: "0" });
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it("deve calcular o offset correto para páginas subsequentes", () => {
    const res = parsePagination({ page: "3", limit: "15" });
    expect(res.isValid).toBe(true);
    expect(res.page).toBe(3);
    expect(res.limit).toBe(15);
    expect(res.offset).toBe(30);
  });
});
