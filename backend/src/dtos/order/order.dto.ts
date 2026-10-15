import { z } from "zod";
import {
  MATERIAIS_DE_ARMACAO,
  MATERIAIS_DE_LENTE,
  PERFIS_DE_ARMACAO,
  QUANTIDADE_MAXIMA_POR_ITEM,
  TRATAMENTOS_DE_LENTE,
} from "../../domain/pricing.js";

// O cliente não envia preço: o total vem de precoUnitarioEmCentavos() a
// partir das especificações (SEC-05). Um `total` no corpo é descartado
// pelo parse, como qualquer campo fora do schema.
//
// Os campos que mudam o preço são validados contra o catálogo de opções,
// e o resultado do parse é o que se grava em custom_specs. Assim, o que é
// cobrado é exatamente o que vai para a fábrica. Os demais campos do
// Studio (cor, modelo, acabamento...) seguem como foram enviados.
const customSpecsSchema = z.looseObject({
  isSunglasses: z.boolean({ message: "Informe se a lente é de sol (true ou false)." }),
  frameProfile: z.enum(PERFIS_DE_ARMACAO, { message: "Perfil de armação inválido." }),
  frameMaterial: z.enum(MATERIAIS_DE_ARMACAO, { message: "Material de armação inválido." }),
  lensMaterial: z.enum(MATERIAIS_DE_LENTE, { message: "Material de lente inválido." }),
  lensTreatments: z
    .array(z.enum(TRATAMENTOS_DE_LENTE, { message: "Tratamento de lente inválido." }), {
      message: "Informe a lista de tratamentos de lente.",
    })
    .max(TRATAMENTOS_DE_LENTE.length)
    .transform((tratamentos) => [...new Set(tratamentos)]),
}).superRefine((specs, context) => {
  // Campos fora dos de preço chegam como unknown no looseObject.
  const documento = specs as Record<string, any>;
  const hasUnapprovedArtwork = [documento, documento.config].some(document => {
    const artwork = document?.artwork;
    return artwork != null && (!Array.isArray(artwork.layers) || artwork.layers.length > 0);
  });
  if (hasUnapprovedArtwork) context.addIssue({ code: "custom", path: ["artwork"],
    message: "A compra de designs com arte aguarda validação da fábrica. Salve sua criação no Studio." });
});

// Quantidade cobrada e gravada no pedido, nos dois endpoints. Uma
// customSpecs.quantity enviada pelo cliente é sobrescrita por esta.
const quantidadeSchema = z.coerce.number().int().positive().max(QUANTIDADE_MAXIMA_POR_ITEM).optional().default(1);

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
  customSpecs: customSpecsSchema,
  quantity: quantidadeSchema,
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
  customSpecs: customSpecsSchema,
  quantity: quantidadeSchema,
});

export type CartItemDTO = z.infer<typeof cartItemSchema>;

export const checkoutCartSchema = z.object({
  cartItems: z
    .array(cartItemSchema, { message: "Forneça um array cartItems não vazio." })
    .min(1, "Forneça um array cartItems não vazio."),
});

export type CheckoutCartDTO = z.infer<typeof checkoutCartSchema>;
