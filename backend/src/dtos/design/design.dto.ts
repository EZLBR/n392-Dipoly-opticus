import { z } from "zod";

export const saveDesignSchema = z.object({
  id: z.string().optional().nullable(),
  name: z
    .string({ message: "Nome é obrigatório." })
    .trim()
    .min(1, "Nome é obrigatório."),
  model: z
    .string({ message: "Modelo é obrigatório." })
    .trim()
    .min(1, "Modelo é obrigatório."),
  color: z
    .string({ message: "Cor é obrigatória." })
    .trim()
    .min(1, "Cor é obrigatória."),
  is_sunglasses: z.boolean().optional(),
  anti_reflective: z.boolean().optional(),
  temple_style: z.string().optional(),
  top_bar: z.boolean().optional(),
  bridge_style: z.string().optional(),
  frame_profile: z.string().optional(),
  temple_open: z.coerce.number().optional(),
  published: z.boolean().optional(),
});

export type SaveDesignDTO = z.infer<typeof saveDesignSchema>;
