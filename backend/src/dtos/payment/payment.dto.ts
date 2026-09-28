import { z } from "zod";

export const createBillingSchema = z.object({
  orderId: z.coerce.number({ message: "Informe o orderId." }),
});

export type CreateBillingDTO = z.infer<typeof createBillingSchema>;
