import { describe, expect, it } from "vitest";
import { UploadSlots } from "../../../src/services/uploadSlots.js";

describe("UploadSlots", () => {
  it("um usuário ocupando a própria vaga não bloqueia os outros", () => {
    const slots = new UploadSlots(1, 6);

    expect(slots.reservar("ana")).not.toBeNull();
    expect(slots.reservar("ana")).toBeNull();
    expect(slots.reservar("bia")).not.toBeNull();
    expect(slots.emUso()).toBe(2);
  });

  it("o teto global continua valendo", () => {
    const slots = new UploadSlots(1, 2);

    slots.reservar("ana");
    slots.reservar("bia");
    expect(slots.reservar("caio")).toBeNull();
  });

  it("liberar devolve a vaga, e liberar duas vezes não conta em dobro", () => {
    const slots = new UploadSlots(1, 2);
    const liberar = slots.reservar("ana")!;

    liberar();
    liberar();

    expect(slots.emUso()).toBe(0);
    expect(slots.emUso("ana")).toBe(0);
    expect(slots.reservar("ana")).not.toBeNull();
    expect(slots.reservar("bia")).not.toBeNull();
    expect(slots.reservar("caio")).toBeNull();
  });
});
