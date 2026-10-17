// ============================================================
//   SEC-04 — política de ABACATE_TOKEN
//
//   A variável é obrigatória em todos os ambientes; o placeholder do
//   simulador é aceito fora de produção, mas nunca em produção. É o
//   segredo que o webhook usa para validar a assinatura HMAC.
// ============================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import {
  ABACATE_TOKEN_PLACEHOLDER,
  getAbacateToken,
  isPlaceholderAbacateToken,
  isSimulatedPaymentGateway,
  readAbacateToken,
} from "../../../src/config/env.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("ABACATE_TOKEN (SEC-04)", () => {
  it("reconhece o placeholder de simulador", () => {
    expect(isPlaceholderAbacateToken(ABACATE_TOKEN_PLACEHOLDER)).toBe(true);
    expect(isPlaceholderAbacateToken("token-real")).toBe(false);
    expect(isPlaceholderAbacateToken(undefined)).toBe(false);
  });

  it("exige a variável em qualquer ambiente", () => {
    expect(() => readAbacateToken("", "development")).toThrow(/obrigatória/);
    expect(() => readAbacateToken("   ", "test")).toThrow(/obrigatória/);
    expect(() => readAbacateToken(undefined, "production")).toThrow(/obrigatória/);
  });

  it("aceita o placeholder fora de produção, mas o recusa em produção", () => {
    expect(readAbacateToken(ABACATE_TOKEN_PLACEHOLDER, "development")).toBe(
      ABACATE_TOKEN_PLACEHOLDER,
    );
    expect(readAbacateToken(ABACATE_TOKEN_PLACEHOLDER, "test")).toBe(ABACATE_TOKEN_PLACEHOLDER);
    expect(() => readAbacateToken(ABACATE_TOKEN_PLACEHOLDER, "production")).toThrow(/produção/);
  });

  it("aceita um token real em produção", () => {
    expect(readAbacateToken("token-real", "production")).toBe("token-real");
  });

  it("lê o token em tempo de chamada (respeita stub, reflete o modo)", () => {
    vi.stubEnv("ABACATE_TOKEN", ABACATE_TOKEN_PLACEHOLDER);
    expect(getAbacateToken()).toBe(ABACATE_TOKEN_PLACEHOLDER);
    expect(isSimulatedPaymentGateway()).toBe(true);

    vi.stubEnv("ABACATE_TOKEN", "token-real");
    expect(getAbacateToken()).toBe("token-real");
    expect(isSimulatedPaymentGateway()).toBe(false);
  });
});
