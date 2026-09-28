import { z } from "zod";

export const createBillingSchema = z.object({
  orderId: z.union(
    [z.string().min(1, "Informe o orderId."), z.number()],
    { message: "Informe o orderId." },
  ),
});

export type CreateBillingDTO = z.infer<typeof createBillingSchema>;
