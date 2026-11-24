import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { apiClient, ProblemError } from "../api/client";
import { localizeProblem, translate } from "./LanguageContext";

import type { Billing, BillingResult, Order } from "../types/domain";
import { isPublicId } from "../utils/publicId";

interface OrderContextValue {
  orders: Order[];
  setOrders: React.Dispatch<React.SetStateAction<Order[]>>;
  fetchBackendOrders: (token?: string | null) => Promise<OrderResult>;
  updateOrderStatus: (publicId: string, status: string, version?: number) => Promise<OrderResult>;
  createPaymentBilling: (orderPublicId: string) => Promise<BillingResult>;
}

const OrderContext = createContext<OrderContextValue | undefined>(undefined);
type OrderResult = { ok: true } | { ok: false; error: string };
const orderFailure = (error: unknown): OrderResult => ({
  ok: false,
  error: error instanceof ProblemError ? localizeProblem(error.problem)
    : translate(error instanceof TypeError ? "orders-network-error" : "orders-update-error"),
});

export function OrderProvider({ children }: React.PropsWithChildren) {
  const { isBackendConnected } = useAuth();

  const [orders, setOrders] = useState<Order[]>(() => {
    try {
      const localOrders = localStorage.getItem("opticus_orders");
      if (localOrders === null) return [];
      const parsed = JSON.parse(localOrders);
      if (Array.isArray(parsed) && parsed.every(order =>
        order && isPublicId(order.publicId)
          && (order.factoryPublicId == null || isPublicId(order.factoryPublicId))
          && !("id" in order) && !("factoryId" in order),
      )) return parsed;
    } catch {
      // Invalid JSON or unavailable browser storage: never fail during render.
    }
    console.warn("Cache de pedidos inválido ou indisponível; iniciando com lista vazia.");
    try { localStorage.removeItem("opticus_orders"); } catch { /* Storage may be blocked. */ }
    return [];
  });

  const fetchBackendOrders = async (token = localStorage.getItem("opticus_token")): Promise<OrderResult> => {
    try {
      if (!token || token !== localStorage.getItem("opticus_token")) {
        return { ok: false, error: translate("orders-session-changed") };
      }
      const data = await apiClient.get<{ orders: Order[] } | Order[]>("/orders", { headers: { Authorization: `Bearer ${token}` } });
      if (token !== localStorage.getItem("opticus_token")) {
        return { ok: false, error: translate("orders-session-changed") };
      }
      const ordersList = Array.isArray(data) ? data : data.orders;
      setOrders(ordersList);
      localStorage.setItem("opticus_orders", JSON.stringify(ordersList));
      return { ok: true };
    } catch (e) {
      console.error("Failed to load backend orders:", e);
      return orderFailure(e);
    }
  };

  useEffect(() => {
    if (!isBackendConnected) return;
    const token = localStorage.getItem("opticus_token");
    if (token && isBackendConnected) {
      fetchBackendOrders(token);
    }
  }, [isBackendConnected]);

  // CONC-02: `version` é a versão do pedido que a tela mostrava ao decidir.
  const updateOrderStatus = async (publicId: string, newStatus: string, version?: number): Promise<OrderResult> => {
    if (!isPublicId(publicId)) return { ok: false, error: translate("api-not-found") };
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await apiClient.put(`/orders/${encodeURIComponent(publicId)}/status`, { status: newStatus, version }, { headers: { Authorization: `Bearer ${token}` } });
        return await fetchBackendOrders(token);
      } catch (e) {
        // 409: a tela estava desatualizada. Recarrega a lista e pede para
        // a pessoa conferir e decidir de novo; nada é aplicado localmente.
        if (e instanceof ProblemError && e.status === 409) {
          await fetchBackendOrders(token);
          return { ok: false, error: translate("orders-version-conflict") };
        }
        return orderFailure(e);
      }
    }

    return { ok: false, error: translate("orders-sign-in-to-edit") };
  };

  // ID-02: o pedido é indicado pelo publicId.
  const createPaymentBilling = async (orderPublicId: string): Promise<BillingResult> => {
    if (!isPublicId(orderPublicId)) return { ok: false, error: translate("api-not-found") };
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const data = await apiClient.post<Billing>("/payments/create-billing", { orderPublicId });
        return { ok: true, ...data };
      } catch (e) {
        if (e instanceof ProblemError) {
          return { ok: false, error: localizeProblem(e.problem) };
        }
        console.error("AbacatePay billing setup failed:", e);
        return { ok: false, error: translate("billing-unavailable") };
      }
    }
    return { ok: false, error: translate("simulated-checkout-unavailable") };
  };

  return (
    <OrderContext.Provider value={{ orders, setOrders, fetchBackendOrders, updateOrderStatus, createPaymentBilling }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  const context = useContext(OrderContext);
  if (!context) throw new Error("useOrder must be used within an OrderProvider");
  return context;
}
