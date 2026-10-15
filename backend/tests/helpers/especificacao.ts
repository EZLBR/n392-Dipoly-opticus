// ============================================================
//   Fixture de especificação de óculos
//
//   Espelha o customSpecs que o Creator Studio envia hoje: a
//   configuração normalizada (frontend/src/eyewear/config.ts) mais os
//   apelidos `model` e `profile`. Com os valores padrão, o preço é
//   180 + 2 tratamentos × 15 = 210,00.
// ============================================================

export const PRECO_DA_ESPECIFICACAO_PADRAO = "210.00";

export function especificacaoDoStudio(alteracoes: Record<string, unknown> = {}) {
  return {
    frontModel: "wayfarer",
    templeModel: "wayfarer",
    frameProfile: "medium",
    frameMaterial: "acetate",
    color: "#382016",
    finish: "tortoise",
    isSunglasses: false,
    lensMaterial: "cr39",
    lensTreatments: ["anti_reflective", "uv_protection"],
    nosePadMaterial: "silicone",
    templeTipMaterial: "acetate",
    hingeMaterial: "stainless_steel",
    templeOpen: 0,
    model: "wayfarer",
    profile: "medium",
    ...alteracoes,
  };
}
