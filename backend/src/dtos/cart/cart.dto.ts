import { z } from "zod";
import { QUANTIDADE_MAXIMA_POR_ITEM } from "../../domain/pricing.js";
import { cartItemSchema } from "../order/order.dto.js";

// ============================================================
//   CART-01 (#115) — carrinho da conta
//
//   O item do carrinho é validado com o mesmo schema do checkout: o
//   que entra no carrinho já passa pelo catálogo de opções e pela trava
//   de arte e estampa. O dono vem sempre do token, nunca do corpo.
// ============================================================

/** POST /api/cart/items: um item novo, ou mais unidades de um igual. */
export const addCartItemSchema = cartItemSchema;

export type AddCartItemDTO = z.infer<typeof addCartItemSchema>;

const quantidade = z
  .number({ message: "Informe a quantidade." })
  .int("A quantidade é um número inteiro.")
  .min(1, "A quantidade mínima é 1.")
  .max(QUANTIDADE_MAXIMA_POR_ITEM, `A quantidade máxima por item é ${QUANTIDADE_MAXIMA_POR_ITEM}.`);

/** PATCH /api/cart/items/:publicId. */
export const updateCartItemSchema = z.object({ quantity: quantidade });

export type UpdateCartItemDTO = z.infer<typeof updateCartItemSchema>;

/** Teto de linhas num carrinho. Quantidade de uma mesma linha é outro limite. */
export const LINHAS_MAXIMAS_NO_CARRINHO = 20;

/**
 * POST /api/cart/checkout: o carrinho que o cliente está vendo. O servidor
 * só cobra se ele for exatamente o carrinho atual da conta; outra aba ou
 * dispositivo que mudou o carrinho nesse meio-tempo dá 409.
 */
export const checkoutCartSnapshotSchema = z.object({
  items: z
    .array(z.object({
      publicId: z.string({ message: "Item inválido." }).trim().min(1, "Item inválido.").max(64, "Item inválido."),
      quantity: quantidade,
    }), { message: "Informe os itens do carrinho." })
    .min(1, "O carrinho está vazio.")
    .max(LINHAS_MAXIMAS_NO_CARRINHO, "Itens demais no carrinho."),
});

export type CheckoutCartSnapshotDTO = z.infer<typeof checkoutCartSnapshotSchema>;

/** Um item do carrinho, como a API devolve. Preços em reais, calculados no servidor. */
export interface CartItemResponseDTO {
  publicId: string;
  productName: string;
  factoryPublicId: string | null;
  factoryName: string;
  customSpecs: Record<string, unknown>;
  quantity: number;
  /** false: a linha não passa mais nas regras de compra; fica sem preço e o checkout a recusa. */
  available: boolean;
  /** Preço unitário calculado no servidor (SEC-05), "0.00"; null se indisponível. */
  unitPrice: string | null;
  /** unitPrice × quantity; null se indisponível. */
  total: string | null;
  /** Há um pedido deste item aguardando a confirmação do pagamento. */
  paymentPending: boolean;
}

export interface CartResponseDTO {
  items: CartItemResponseDTO[];
  /** Soma dos itens disponíveis. */
  subtotal: string;
}
