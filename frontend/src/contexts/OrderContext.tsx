import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { apiClient, ProblemError } from "../api/client";

const OrderContext = createContext<any>(undefined);
type OrderResult = { ok: true } | { ok: false; error: string };
const orderFailure = (error: unknown): OrderResult => ({
  ok: false,
  error: error instanceof ProblemError ? error.detail || error.title || error.message
    : error instanceof TypeError ? "Não foi possível conectar ao servidor. Verifique sua conexão e consulte o pedido antes de tentar novamente."
    : "Não foi possível atualizar os pedidos. Consulte o servidor novamente.",
});

export function OrderProvider({ children }) {
  const { isBackendConnected } = useAuth();

  const [orders, setOrders] = useState(() => {
    try {
      const localOrders = localStorage.getItem("opticus_orders");
      if (localOrders === null) return [];
      const parsed = JSON.parse(localOrders);
      if (Array.isArray(parsed)) return parsed;
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
        return { ok: false, error: "A sessão mudou. Atualize a página para consultar os pedidos." };
      }
      const data = await apiClient.get<any>("/orders", { headers: { Authorization: `Bearer ${token}` } });
      if (token !== localStorage.getItem("opticus_token")) {
        return { ok: false, error: "A sessão mudou. Atualize a página para consultar os pedidos." };
      }
      const ordersList = data.orders || data;
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

  const updateOrderStatus = async (orderId, newStatus): Promise<OrderResult> => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await apiClient.put(`/orders/${orderId}/status`, { status: newStatus }, { headers: { Authorization: `Bearer ${token}` } });
        return await fetchBackendOrders(token);
      } catch (e) {
        return orderFailure(e);
      }
    }

    return { ok: false, error: "Entre na sua conta e conecte-se ao servidor para alterar o pedido." };
  };

  const createPaymentBilling = async (orderId) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const data = await apiClient.post<any>("/payments/create-billing", { orderId });
        return { ok: true, ...data };
      } catch (e: any) {
        if (e instanceof ProblemError) {
          return { ok: false, error: e.detail || e.title || e.message };
        }
        console.error("AbacatePay billing setup failed:", e);
        return { ok: false, error: "Backend payment service is currently offline." };
      }
    }
    return { ok: false, error: "Backend offline. Simulated checkout is unavailable." };
  };

  return (
    <OrderContext.Provider value={{ orders, setOrders, fetchBackendOrders, updateOrderStatus, createPaymentBilling }}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrder() {
  return useContext(OrderContext);
}
