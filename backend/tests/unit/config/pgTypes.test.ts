import { describe, expect, it } from "vitest";
import { lerTimestampComoUtc } from "../../../src/config/pgTypes.js";

describe("lerTimestampComoUtc", () => {
  it("lê o TIMESTAMP do banco como UTC, independentemente do fuso do processo", () => {
    expect(lerTimestampComoUtc("2026-11-24 12:34:56.789")).toEqual(new Date("2026-11-24T12:34:56.789Z"));
    expect(lerTimestampComoUtc("2026-01-01 00:00:00")).toEqual(new Date("2026-01-01T00:00:00Z"));
  });

  it("mantém o comportamento do driver para valores especiais", () => {
    expect(lerTimestampComoUtc("infinity")).toBe(Infinity);
    expect(lerTimestampComoUtc("-infinity")).toBe(-Infinity);
  });
});
