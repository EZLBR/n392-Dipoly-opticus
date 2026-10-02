import { z } from "zod";

export const updateStockSchema = z.object({
  quantidade: z.coerce.number({ message: "Quantidade é obrigatória." }),
  estoque_minimo: z.coerce.number().optional(),
  operacao: z
    .enum(["set", "add", "subtract"], {
      message: "Operação inválida. Use: set, add ou subtract.",
    })
    .optional()
    .default("set"),
});

export type UpdateStockDTO = z.infer<typeof updateStockSchema>;
