import { z } from "zod";

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
  customSpecs: z.record(z.string(), z.any()),
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
  customSpecs: z.record(z.string(), z.any()),
  quantity: z.coerce.number().int().positive().optional().default(1),
});

export type CartItemDTO = z.infer<typeof cartItemSchema>;

export const checkoutCartSchema = z.object({
  cartItems: z
    .array(cartItemSchema, { message: "Forneça um array cartItems não vazio." })
    .min(1, "Forneça um array cartItems não vazio."),
});

export type CheckoutCartDTO = z.infer<typeof checkoutCartSchema>;
