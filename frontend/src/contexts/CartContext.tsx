import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { apiClient, ProblemError } from "../api/client";
import { localizeProblem, translate } from "./LanguageContext";
import { normalizeConfig } from "../eyewear/config";
import { hasUnapprovedCustomization } from "../eyewear/artwork";

import type { Billing, BillingResult, CartItem } from "../types/domain";

interface CartContextValue {
  cart: CartItem[];
  addToCart: (item: CartItem) => void;
  removeFromCart: (itemId: string) => void;
  updateCartQty: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  checkoutCart: (items: CartItem[]) => Promise<BillingResult>;
}

const CartContext = createContext<CartContextValue | undefined>(undefined);

export function CartProvider({ children }: React.PropsWithChildren) {
  const { isBackendConnected } = useAuth();

  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const localCart = localStorage.getItem("opticus_cart");
      return localCart ? JSON.parse(localCart) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem("opticus_cart", JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item: CartItem) => {
    if (hasUnapprovedCustomization(normalizeConfig(item.customSpecs))) return;
    setCart((prevCart) => {
      const existing = prevCart.find((i) => i.id === item.id);
      if (existing) {
        return prevCart.map((i) => i.id === item.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i);
      }
      return [...prevCart, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((i) => i.id !== itemId));
  };

  const updateCartQty = (itemId: string, qty: number) => {
    if (qty < 1) return;
    setCart((prevCart) => prevCart.map((i) => i.id === itemId ? { ...i, quantity: qty } : i));
  };

  const clearCart = () => {
    setCart([]);
  };

  const checkoutCart = async (cartItems: CartItem[]): Promise<BillingResult> => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const data = await apiClient.post<Billing>("/orders/checkout-cart", { cartItems });
        return { ok: true, ...data };
      } catch (e) {
        if (e instanceof ProblemError) {
          return { ok: false, error: localizeProblem(e.problem) };
        }
        console.error("Consolidated backend checkout failed, shifting to local cache simulation:", e);
      }
    }

    return {
      ok: false,
      error: translate("checkout-connection-required")
    };
  };

  return (
    <CartContext.Provider value={{ cart, addToCart, removeFromCart, updateCartQty, clearCart, checkoutCart }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within a CartProvider");
  return context;
}
