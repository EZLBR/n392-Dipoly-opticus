import { z } from "zod";

// ID-02: o pedido é indicado pelo publicId (UUID), nunca pelo id inteiro.
export const createBillingSchema = z.object({
  orderPublicId: z
    .string({ message: "Informe o orderPublicId." })
    .trim()
    .min(1, "Informe o orderPublicId.")
    .max(64, "Informe o orderPublicId."),
});

export type CreateBillingDTO = z.infer<typeof createBillingSchema>;

/** Para onde o cliente vai pagar. */
export interface BillingResultDTO {
  checkoutUrl: string;
  isSimulated: boolean;
}

/** Um pagamento na listagem do staff, sem ids internos (ID-02). */
export interface PaymentResponseDTO {
  publicId: string;
  pedidoPublicId: string;
  metodo: string | null;
  status: string | null;
  /** Decimal em texto, com os dois centavos ("1999.90"). */
  valor: string;
  referenciaExterna: string | null;
  criadoEm: Date | null;
  clienteNome: string;
  clienteEmail: string;
}

export interface PaginatedPaymentsDTO {
  pagamentos: PaymentResponseDTO[];
  pagination: { page: number; limit: number; totalItems: number; totalPages: number };
}

/** O que a página do simulador mostra. Valores em texto decimal, sem float. */
export interface SimulatedCheckoutDTO {
  /** FEAT-04: um por item do pedido; quantity é null num pedido sem itens. */
  itens: { productName: string; quantity: number | null; total: string }[];
  total: string;
  cliente: { nome: string; email: string };
}
