// ============================================================
//   CART-01 (#115) — carrinho da conta
//
//   O carrinho vive no backend, ligado à conta do token. Esta camada só
//   espelha o que a API devolve: cada mutação responde o carrinho
//   inteiro, e é ele que vai para a tela. Nada é dado como salvo antes
//   de o servidor confirmar.
//
//   Sessão: o carrinho é carregado de novo a cada troca de sessão (login,
//   logout, outra conta, outra aba). Uma resposta que chega depois da
//   troca é descartada pela geração, para nenhum item de uma conta
//   aparecer na outra.
//
//   Carrinho legado: a chave global `opticus_cart` não tinha dono, então
//   não é associada a ninguém. Ela é apagada deste navegador na primeira
//   carga (ver docs/decisions/ADR-0005-carrinho-por-conta.md).
// ============================================================

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "./AuthContext";
import { apiClient, ProblemError } from "../api/client";
import { localizeProblem, translate } from "./LanguageContext";
import { normalizeConfig } from "../eyewear/config";
import { hasUnapprovedCustomization } from "../eyewear/artwork";
import type { Billing, BillingResult, CartItem } from "../types/domain";

export const LEGACY_CART_KEY = "opticus_cart";

/** Quem compra no Studio tem carrinho; a mesma regra da rota /cart. */
const CART_ROLES = new Set(["client", "staff"]);

export type CartStatus = "idle" | "loading" | "ready" | "error";
export type CartMutationResult = { ok: true } | { ok: false; error: string };

interface CartContextValue {
  cart: CartItem[];
  /** Subtotal calculado no servidor, em reais. */
  subtotal: number;
  /** idle: sem carrinho (visitante ou fábrica); error: a carga falhou. */
  status: CartStatus;
  error: string | null;
  /** Há uma alteração esperando a resposta do servidor. */
  saving: boolean;
  refresh: () => Promise<void>;
  addToCart: (item: CartItem) => Promise<CartMutationResult>;
  removeFromCart: (itemId: string) => Promise<CartMutationResult>;
  updateCartQty: (itemId: string, quantity: number) => Promise<CartMutationResult>;
  clearCart: () => Promise<CartMutationResult>;
  checkoutCart: () => Promise<BillingResult>;
}

interface ServerCartItem {
  publicId: string;
  productName: string;
  factoryPublicId: string | null;
  factoryName: string;
  customSpecs: CartItem["customSpecs"];
  quantity: number;
  unitPrice: string;
  total: string;
  paymentPending: boolean;
}

interface ServerCart {
  items: ServerCartItem[];
  subtotal: string;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

const toCartItem = (item: ServerCartItem): CartItem => ({
  id: item.publicId,
  productName: item.productName,
  ...(item.factoryPublicId ? { factoryPublicId: item.factoryPublicId } : {}),
  factoryName: item.factoryName,
  total: Number(item.unitPrice),
  quantity: item.quantity,
  customSpecs: item.customSpecs,
  paymentPending: item.paymentPending,
});

/** Mensagem para a falha de uma chamada: o problema do servidor ou a falta de rede. */
function failureMessage(error: unknown): string {
  if (error instanceof ProblemError) return localizeProblem(error.problem);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return translate("cart-offline");
  return translate("cart-server-unavailable");
}

const withToken = (token: string) => ({ headers: { Authorization: `Bearer ${token}` } });

export function CartProvider({ children }: React.PropsWithChildren) {
  const { session, sessionToken, sessionLoading } = useAuth();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [subtotal, setSubtotal] = useState(0);
  const [status, setStatus] = useState<CartStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Cada sessão é uma geração. Resposta de geração antiga não toca no estado.
  const generation = useRef(0);
  const owner = useRef<{ token: string; publicId: string } | null>(null);

  const token = session && sessionToken && CART_ROLES.has(String(session.role)) ? sessionToken : null;
  const ownerKey = token && session ? `${session.publicId}:${token}` : null;

  useEffect(() => {
    try { localStorage.removeItem(LEGACY_CART_KEY); } catch { /* armazenamento indisponível */ }
  }, []);

  /** Aplica o carrinho do servidor se ele ainda é da sessão que pediu. */
  const apply = useCallback((gen: number, data: ServerCart) => {
    if (gen !== generation.current || owner.current?.token !== localStorage.getItem("opticus_token")) return false;
    setCart(data.items.map(toCartItem));
    setSubtotal(Number(data.subtotal));
    setStatus("ready");
    setError(null);
    return true;
  }, []);

  const load = useCallback(async () => {
    const current = owner.current;
    if (!current) return;
    const gen = generation.current;
    setStatus(previous => (previous === "ready" ? previous : "loading"));
    try {
      apply(gen, await apiClient.get<ServerCart>("/cart", withToken(current.token)));
    } catch (e) {
      if (gen !== generation.current) return;
      setStatus("error");
      setError(failureMessage(e));
    }
  }, [apply]);

  useEffect(() => {
    if (sessionLoading) return;
    generation.current += 1;
    owner.current = token && session ? { token, publicId: String(session.publicId) } : null;
    // O carrinho da sessão anterior some na hora, antes de qualquer resposta.
    setCart([]);
    setSubtotal(0);
    setError(null);
    setSaving(false);
    setStatus(owner.current ? "loading" : "idle");
    if (owner.current) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownerKey, sessionLoading]);

  /** Executa uma alteração e mostra o carrinho que o servidor devolveu. */
  const mutate = useCallback(async (call: (token: string) => Promise<ServerCart | undefined>): Promise<CartMutationResult> => {
    const current = owner.current;
    if (!current) return { ok: false, error: translate("cart-you-need-to-log-in-to") };
    const gen = generation.current;
    setSaving(true);
    try {
      const data = await call(current.token);
      if (gen !== generation.current) return { ok: false, error: translate("cart-session-changed") };
      if (data) apply(gen, data);
      else await load();
      return { ok: true };
    } catch (e) {
      if (gen !== generation.current) return { ok: false, error: translate("cart-session-changed") };
      // A tela volta para o que o servidor tem, e não para o que se tentou.
      void load();
      return { ok: false, error: failureMessage(e) };
    } finally {
      if (gen === generation.current) setSaving(false);
    }
  }, [apply, load]);

  const addToCart = (item: CartItem) => {
    if (hasUnapprovedCustomization(normalizeConfig(item.customSpecs))) {
      return Promise.resolve<CartMutationResult>({ ok: false, error: translate("decoration-preview") });
    }
    const { productName, factoryPublicId, factoryName, customSpecs } = item;
    return mutate(token => apiClient.post<ServerCart>("/cart/items", {
      productName,
      ...(factoryPublicId ? { factoryPublicId } : {}),
      factoryName: factoryName || "Demo Factory",
      customSpecs,
      quantity: item.quantity || 1,
    }, withToken(token)));
  };

  const removeFromCart = (itemId: string) =>
    mutate(token => apiClient.delete<ServerCart>(`/cart/items/${encodeURIComponent(itemId)}`, withToken(token)));

  const updateCartQty = (itemId: string, quantity: number) => {
    if (!Number.isInteger(quantity) || quantity < 1) {
      return Promise.resolve<CartMutationResult>({ ok: false, error: translate("cart-invalid-quantity") });
    }
    return mutate(token => apiClient.patch<ServerCart>(`/cart/items/${encodeURIComponent(itemId)}`, { quantity }, withToken(token)));
  };

  const clearCart = () => mutate(async token => {
    await apiClient.delete("/cart", withToken(token));
    return { items: [], subtotal: "0.00" };
  });

  /**
   * Cobra o carrinho que está na tela. O servidor cria os pedidos a partir
   * do carrinho gravado e recusa (409) se ele mudou em outra aba ou
   * dispositivo; nesse caso a tela recarrega o carrinho atual.
   */
  const checkoutCart = async (): Promise<BillingResult> => {
    const current = owner.current;
    if (!current) return { ok: false, error: translate("checkout-connection-required") };
    const gen = generation.current;
    const items = cart.map(item => ({ publicId: item.id, quantity: item.quantity || 1 }));
    try {
      const data = await apiClient.post<Billing>("/cart/checkout", { items }, withToken(current.token));
      if (gen !== generation.current) return { ok: false, error: translate("cart-session-changed") };
      // Os itens continuam até o pagamento ser confirmado; a tela mostra isso.
      void load();
      return { ok: true, ...data };
    } catch (e) {
      if (gen !== generation.current) return { ok: false, error: translate("cart-session-changed") };
      if (e instanceof ProblemError && e.problem.status === 409) void load();
      return { ok: false, error: failureMessage(e) };
    }
  };

  return (
    <CartContext.Provider value={{
      cart, subtotal, status, error, saving, refresh: load,
      addToCart, removeFromCart, updateCartQty, clearCart, checkoutCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
