import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { apiClient, ProblemError } from "../api/client";

const OrderContext = createContext<any>(undefined);

export function OrderProvider({ children }) {
  const { session, isBackendConnected } = useAuth();

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

  const fetchBackendOrders = async (_token?: string) => {
    try {
      const data = await apiClient.get<any>("/orders");
      const ordersList = data.orders || data;
      setOrders(ordersList);
      localStorage.setItem("opticus_orders", JSON.stringify(ordersList));
    } catch (e) {
      console.error("Failed to load backend orders:", e);
    }
  };

  useEffect(() => {
    if (!isBackendConnected) return;
    const token = localStorage.getItem("opticus_token");
    if (token && isBackendConnected) {
      fetchBackendOrders(token);
    }
  }, [isBackendConnected]);

  const updateOrderStatus = async (orderId, newStatus) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        await apiClient.put(`/orders/${orderId}/status`, { status: newStatus });
        fetchBackendOrders(token);
        return;
      } catch (e) {
        console.error("Backend status update failed, shifting to local cache:", e);
      }
    }

    // Fallback simulation
    const nextOrders = orders.map((o) => {
      if (o.publicId === orderId) {
        return { ...o, status: newStatus };
      }
      return o;
    });
    localStorage.setItem("opticus_orders", JSON.stringify(nextOrders));
    setOrders(nextOrders);
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
