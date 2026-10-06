import { z } from "zod";

export const saveDesignSchema = z.object({
  id: z.string().optional().nullable(),
  name: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório.")
    .max(255),
  model: z
    .string({ message: "Modelo é obrigatório." })
    .trim()
    .min(1, "Modelo é obrigatório.")
    .max(255),
  color: z
    .string({ message: "Cor é obrigatória." })
    .trim()
    .min(1, "Cor é obrigatória.")
    .max(50),
  is_sunglasses: z.boolean().optional(),
  anti_reflective: z.boolean().optional(),
  temple_style: z.string().max(50).optional(),
  top_bar: z.boolean().optional(),
  bridge_style: z.string().max(50).optional(),
  frame_profile: z.string().max(50).optional(),
  temple_open: z.coerce.number().max(99.99).optional(),
  published: z.boolean().optional(),
});

export type SaveDesignDTO = z.infer<typeof saveDesignSchema>;
