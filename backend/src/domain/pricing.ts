// ============================================================
//   PRECIFICAÇÃO — preço de um óculos personalizado
//
//   O servidor é a autoridade sobre o preço (SEC-05). O frontend
//   mantém a mesma regra em frontend/src/utils/pricing.ts apenas
//   para exibir a prévia; o valor gravado e cobrado é sempre o
//   calculado aqui. Um teste compara as duas em todas as
//   combinações de opções, para que a prévia nunca divirja da
//   cobrança.
//
//   Tudo em centavos inteiros. Ponto flutuante não entra em
//   dinheiro, nem em passo intermediário.
// ============================================================

export const PERFIS_DE_ARMACAO = ["thin", "medium", "bold"] as const;

export const MATERIAIS_DE_ARMACAO = [
  "acetate",
  "titanium",
  "stainless_steel",
  "gold",
  "tr90",
  "wood",
  "carbon_fiber",
] as const;

export const MATERIAIS_DE_LENTE = ["cr39", "polycarbonate"] as const;

export const TRATAMENTOS_DE_LENTE = [
  "anti_reflective",
  "uv_protection",
  "blue_light",
  "mirrored",
  "polarized",
  "photochromic",
] as const;

/** Unidades de um mesmo item por pedido. */
export const QUANTIDADE_MAXIMA_POR_ITEM = 100;

export const PRECOS_EM_CENTAVOS = {
  base: 18_000,
  oculosDeSol: 4_000,
  perfilBold: 2_000,
  materialPremium: 8_000,
  lentePolicarbonato: 3_000,
  porTratamento: 1_500,
} as const;

const MATERIAIS_PREMIUM: ReadonlySet<string> = new Set(["titanium", "gold", "carbon_fiber"]);

/** As opções do Studio que mudam o preço. */
export interface EspecificacaoPrecificavel {
  isSunglasses: boolean;
  frameProfile: (typeof PERFIS_DE_ARMACAO)[number];
  frameMaterial: (typeof MATERIAIS_DE_ARMACAO)[number];
  lensMaterial: (typeof MATERIAIS_DE_LENTE)[number];
  lensTreatments: readonly (typeof TRATAMENTOS_DE_LENTE)[number][];
}

/** Preço de uma unidade, em centavos. Tratamento repetido conta uma vez só. */
export function precoUnitarioEmCentavos(especificacao: EspecificacaoPrecificavel): number {
  let preco = PRECOS_EM_CENTAVOS.base;

  if (especificacao.isSunglasses) preco += PRECOS_EM_CENTAVOS.oculosDeSol;
  if (especificacao.frameProfile === "bold") preco += PRECOS_EM_CENTAVOS.perfilBold;
  if (MATERIAIS_PREMIUM.has(especificacao.frameMaterial)) preco += PRECOS_EM_CENTAVOS.materialPremium;
  if (especificacao.lensMaterial === "polycarbonate") preco += PRECOS_EM_CENTAVOS.lentePolicarbonato;
  preco += new Set(especificacao.lensTreatments).size * PRECOS_EM_CENTAVOS.porTratamento;

  return preco;
}

/** Preço unitário e total de um item do pedido, em centavos. */
export function precoDoItem(especificacao: EspecificacaoPrecificavel, quantidade: number) {
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > QUANTIDADE_MAXIMA_POR_ITEM) {
    throw new RangeError(`Quantidade deve ser um inteiro entre 1 e ${QUANTIDADE_MAXIMA_POR_ITEM}.`);
  }

  const unitario = precoUnitarioEmCentavos(especificacao);
  return { unitario, total: unitario * quantidade };
}

/**
 * Centavos para o texto que a coluna DECIMAL(10, 2) recebe, sem passar por
 * float: 18000 → "180.00", 5 → "0.05".
 */
export function centavosParaDecimal(centavos: number): string {
  if (!Number.isSafeInteger(centavos) || centavos < 0) {
    throw new RangeError(`Valor em centavos inválido: ${centavos}.`);
  }

  const digitos = String(centavos).padStart(3, "0");
  return `${digitos.slice(0, -2)}.${digitos.slice(-2)}`;
}
