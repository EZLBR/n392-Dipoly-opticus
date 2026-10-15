import { z } from "zod";

const customSpecsSchema = z.record(z.string(), z.any()).superRefine((specs, context) => {
  const hasUnapprovedArtwork = [specs, specs.config].some(document => {
    const artwork = document?.artwork;
    return artwork != null && (!Array.isArray(artwork.layers) || artwork.layers.length > 0);
  });
  if (hasUnapprovedArtwork) context.addIssue({ code: "custom", path: ["artwork"],
    message: "A compra de designs com arte aguarda validação da fábrica. Salve sua criação no Studio." });
});

export const createOrderSchema = z.object({
  productName: z
    .string({ message: "Nome do produto é obrigatório." })
    .trim()
    .min(1, "Nome do produto é obrigatório.")
    .max(255),
  factoryId: z.coerce.number({ message: "ID da fábrica é obrigatório." }),
  factoryName: z
    .string({ message: "Nome da fábrica é obrigatório." })
    .trim()
    .min(1, "Nome da fábrica é obrigatório.")
    .max(255),
  total: z.coerce
    .number({ message: "Total é obrigatório." })
    .positive("Total deve ser um número positivo."),
  customSpecs: customSpecsSchema,
});

export type CreateOrderDTO = z.infer<typeof createOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z
    .enum(["Pending Payment", "Queued", "In production", "Delivered", "Cancelled"], {
      message: "Informe um status válido.",
    }),
});

export type UpdateOrderStatusDTO = z.infer<typeof updateOrderStatusSchema>;

export const cartItemSchema = z.object({
  productName: z
    .string({ message: "Nome do produto é obrigatório." })
    .trim()
    .min(1, "Nome do produto é obrigatório.")
    .max(255),
  factoryId: z.coerce.number({ message: "ID da fábrica é obrigatório." }),
  factoryName: z
    .string({ message: "Nome da fábrica é obrigatório." })
    .trim()
    .min(1, "Nome da fábrica é obrigatório.")
    .max(255),
  total: z.coerce
    .number({ message: "Total é obrigatório." })
    .positive("Total deve ser um número positivo."),
  customSpecs: customSpecsSchema,
  quantity: z.coerce.number().int().positive().optional().default(1),
});

export type CartItemDTO = z.infer<typeof cartItemSchema>;

export const checkoutCartSchema = z.object({
  cartItems: z
    .array(cartItemSchema, { message: "Forneça um array cartItems não vazio." })
    .min(1, "Forneça um array cartItems não vazio."),
});

export type CheckoutCartDTO = z.infer<typeof checkoutCartSchema>;
