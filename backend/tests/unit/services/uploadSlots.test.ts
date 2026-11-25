import { describe, expect, it } from "vitest";
import { UploadSlots, lerTetoDeUploads } from "../../../src/services/uploadSlots.js";

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

describe("lerTetoDeUploads", () => {
  it("usa 4 sem a variável e aceita um inteiro de 1 a 64", () => {
    expect(lerTetoDeUploads(undefined)).toBe(4);
    expect(lerTetoDeUploads(" ")).toBe(4);
    expect(lerTetoDeUploads("8")).toBe(8);
  });

  it("recusa valor inválido em vez de cair no padrão", () => {
    for (const valor of ["0", "-1", "2.5", "abc", "65"]) {
      expect(() => lerTetoDeUploads(valor), valor).toThrow(/STUDIO_UPLOADS_SIMULTANEOS/);
    }
  });
});
