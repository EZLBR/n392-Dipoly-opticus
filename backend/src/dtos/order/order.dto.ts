import { z } from "zod";
import {
  MATERIAIS_DE_ARMACAO,
  MATERIAIS_DE_LENTE,
  PERFIS_DE_ARMACAO,
  QUANTIDADE_MAXIMA_POR_ITEM,
  TRATAMENTOS_DE_LENTE,
} from "../../domain/pricing.js";
import { STATUS_DO_PEDIDO } from "../../domain/pedidoStatus.js";

// O cliente não envia preço: o total vem de precoUnitarioEmCentavos() a
// partir das especificações (SEC-05). Um `total` no corpo é descartado
// pelo parse, como qualquer campo fora do schema.
//
// Os campos que mudam o preço são validados contra o catálogo de opções,
// e o resultado do parse é o que se grava em custom_specs. Assim, o que é
// cobrado é exatamente o que vai para a fábrica. Os demais campos do
// Studio (cor, modelo, acabamento...) seguem como foram enviados.
/** Campo de um valor desconhecido; nulo, indefinido ou primitivo sem o campo dá undefined. */
function campo(valor: unknown, chave: string): unknown {
  return valor == null ? undefined : (valor as Record<string, unknown>)[chave];
}

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
  // Campos fora dos de preço chegam como unknown no looseObject. TS-01: são
  // lidos como unknown, sem any; um valor que não é objeto não tem campos.
  const documentos: unknown[] = [specs, campo(specs, "config")];
  const hasUnapprovedArtwork = documentos.some(document => {
    const artwork = campo(document, "artwork");
    if (artwork == null) return false;
    const layers = campo(artwork, "layers");
    return !Array.isArray(layers) || layers.length > 0;
  });
  if (hasUnapprovedArtwork) context.addIssue({ code: "custom", path: ["artwork"],
    message: "A compra de designs com arte aguarda validação da fábrica. Salve sua criação no Studio." });
  const hasUnapprovedPattern = documentos.some(document => {
    const pattern = campo(document, "surfacePattern");
    return pattern != null && (campo(pattern, "version") !== 1 || campo(pattern, "style") !== "none");
  });
  if (hasUnapprovedPattern) context.addIssue({ code: "custom", path: ["surfacePattern"],
    message: "A compra de estampas aguarda validação da fábrica. Salve sua criação no Studio." });
});

// ID-02: a fábrica é indicada pelo publicId (UUID), nunca pelo id inteiro.
// Opcional: sem ela, o pedido vai para a fábrica padrão.
const publicIdDaFabrica = z.string().trim().min(1, "Fábrica inválida.").max(64, "Fábrica inválida.").optional();

// Quantidade cobrada e gravada no pedido, nos dois endpoints. Uma
// customSpecs.quantity enviada pelo cliente é sobrescrita por esta.
const quantidadeSchema = z.coerce.number().int().positive().max(QUANTIDADE_MAXIMA_POR_ITEM).optional().default(1);

export const createOrderSchema = z.object({
  productName: z
    .string({ message: "Nome do produto é obrigatório." })
    .trim()
    .min(1, "Nome do produto é obrigatório.")
    .max(255),
  factoryPublicId: publicIdDaFabrica,
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
  status: z.enum(STATUS_DO_PEDIDO, { message: "Informe um status válido." }),
  // CONC-02: a versão lida pelo cliente. Teto do INTEGER do PostgreSQL, para
  // um valor absurdo virar 400 em vez de erro do banco.
  version: z.number({ message: "Informe a versão do pedido que você leu." })
    .int("A versão é um número inteiro.")
    .min(0, "A versão não pode ser negativa.")
    .max(2_147_483_647, "Versão inválida."),
});

export type UpdateOrderStatusDTO = z.infer<typeof updateOrderStatusSchema>;

export const cartItemSchema = z.object({
  productName: z
    .string({ message: "Nome do produto é obrigatório." })
    .trim()
    .min(1, "Nome do produto é obrigatório.")
    .max(255),
  factoryPublicId: publicIdDaFabrica,
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

/** Um item do pedido (FEAT-04), com o preço gravado na compra. */
export interface OrderItemResponseDTO {
  publicId: string;
  productName: string;
  /** A especificação do item, sem a quantidade. */
  customSpecs: Record<string, unknown>;
  quantity: number;
  /** DECIMAL como texto de duas casas, sem passar por float. */
  unitPrice: string;
  /** unitPrice × quantity, também exato. */
  total: string;
}

/** O que a API devolve de um pedido. Nunca o id interno (ID-02). */
export interface OrderResponseDTO {
  publicId: string;
  customerName: string;
  customerEmail: string;
  productName: string;
  factoryPublicId: string | null;
  factoryName: string | null;
  status: string | null;
  version: number;
  /** DECIMAL como texto de duas casas, sem passar por float. */
  total: string;
  customSpecs: Record<string, unknown>;
  abacateBillingId: string | null;
  /** Só o dia, à meia-noite. */
  createdAt: Date | null;
  updatedAt: Date | null;
  /** Os itens do pedido, na ordem em que foram escolhidos. A soma é o total. */
  items: OrderItemResponseDTO[];
}

export interface PaginatedOrdersDTO {
  orders: OrderResponseDTO[];
  pagination: { page: number; limit: number; totalItems: number; totalPages: number };
}

export interface CheckoutResultDTO {
  checkoutUrl: string;
  isSimulated: boolean;
  billingId: string;
}
