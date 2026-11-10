import { z } from "zod";
import { studioConfigSchema } from "./studio-config.dto.js";

/**
 * Campos de um design. O identificador não faz parte do corpo (BOLA-04):
 * na criação ele é gerado pelo servidor e na atualização vem da URL.
 */
export const saveDesignSchema = z.object({
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
  config: studioConfigSchema.optional().nullable(),
});

/**
 * POST /api/designs só cria. Um `id` no corpo era a atualização pelo POST,
 * que caía no INSERT quando o design era de outro usuário e virava oráculo
 * de existência. Ele é recusado em vez de ignorado: ignorar criaria uma
 * cópia a cada salvamento de um cliente antigo.
 */
export const createDesignSchema = saveDesignSchema.extend({
  id: z
    .null({ message: "O identificador do design é gerado pelo servidor. Para atualizar, use PUT /api/designs/:id." })
    .optional(),
});

export type SaveDesignDTO = z.infer<typeof saveDesignSchema>;
