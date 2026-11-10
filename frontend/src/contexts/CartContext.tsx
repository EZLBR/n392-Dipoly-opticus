import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { apiClient, ProblemError } from "../api/client";
import { localizeProblem, translate } from "./LanguageContext";
import { normalizeConfig } from "../eyewear/config";
import { hasUnapprovedCustomization } from "../eyewear/artwork";

const CartContext = createContext<any>(undefined);

export function CartProvider({ children }) {
  const { isBackendConnected } = useAuth();

  const [cart, setCart] = useState(() => {
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

  const addToCart = (item) => {
    if (hasUnapprovedCustomization(normalizeConfig(item.customSpecs))) return;
    setCart((prevCart) => {
      const existing = prevCart.find((i) => i.id === item.id);
      if (existing) {
        return prevCart.map((i) => i.id === item.id ? { ...i, quantity: (i.quantity || 1) + 1 } : i);
      }
      return [...prevCart, { ...item, quantity: 1 }];
    });
  };

  const removeFromCart = (itemId) => {
    setCart((prevCart) => prevCart.filter((i) => i.id !== itemId));
  };

  const updateCartQty = (itemId, qty) => {
    if (qty < 1) return;
    setCart((prevCart) => prevCart.map((i) => i.id === itemId ? { ...i, quantity: qty } : i));
  };

  const clearCart = () => {
    setCart([]);
  };

  const checkoutCart = async (cartItems) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const data = await apiClient.post<any>("/orders/checkout-cart", { cartItems });
        return { ok: true, ...data };
      } catch (e: any) {
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
  return useContext(CartContext);
}
