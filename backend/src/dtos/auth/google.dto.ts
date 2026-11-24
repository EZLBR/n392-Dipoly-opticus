import { z } from "zod";

const flowValue = z.string().regex(/^[a-f0-9]{64}$/);
export const googleStartSchema = z.object({
  state: flowValue,
  nonce: flowValue,
  challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export const googleExchangeSchema = z.object({
  code: z.string().min(1).max(2048),
  verifier: flowValue,
  nonce: flowValue,
});

export type GoogleStartDTO = z.infer<typeof googleStartSchema>;
export type GoogleExchangeDTO = z.infer<typeof googleExchangeSchema>;
