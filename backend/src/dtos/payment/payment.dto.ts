import { z } from "zod";

// ID-02: o pedido é indicado pelo publicId (UUID), nunca pelo id inteiro.
export const createBillingSchema = z.object({
  orderPublicId: z
    .string({ message: "Informe o orderPublicId." })
    .trim()
    .min(1, "Informe o orderPublicId.")
    .max(64, "Informe o orderPublicId."),
});

export type CreateBillingDTO = z.infer<typeof createBillingSchema>;
