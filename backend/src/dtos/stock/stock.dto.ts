import { z } from "zod";

/** Maior valor da coluna `INTEGER` do PostgreSQL. Acima disso, o banco responde erro. */
export const LIMITE_QUANTIDADE_ESTOQUE = 2_147_483_647;

/**
 * Inteiro não negativo vindo do corpo da requisição.
 *
 * Aceita número ou texto só com dígitos ("12"), como o `z.coerce` aceitava.
 * Mas não aceita o que o `z.coerce.number()` convertia silenciosamente em
 * 0 (`null`, `""`, `"   "`, `false`, `[]`), porque isso zerava o estoque com
 * uma entrada inválida. O 0 continua válido quando vem escrito de propósito.
 */
function inteiroNaoNegativo(campo: string) {
  const mensagem = `${campo} deve ser um número inteiro maior ou igual a zero.`;

  return z.preprocess(
    (valor) => (typeof valor === "string" && /^\s*\d+\s*$/.test(valor) ? Number(valor) : valor),
    z
      .number({ message: mensagem })
      .int(mensagem)
      .min(0, mensagem)
      .max(LIMITE_QUANTIDADE_ESTOQUE, `${campo} excede o limite de ${LIMITE_QUANTIDADE_ESTOQUE}.`),
  );
}

export const updateStockSchema = z.object({
  quantidade: inteiroNaoNegativo("Quantidade"),
  estoque_minimo: inteiroNaoNegativo("Estoque mínimo").optional(),
  operacao: z
    .enum(["set", "add", "subtract"], {
      message: "Operação inválida. Use: set, add ou subtract.",
    })
    .optional()
    .default("set"),
});

export type UpdateStockDTO = z.infer<typeof updateStockSchema>;
