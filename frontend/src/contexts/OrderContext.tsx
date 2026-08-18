import React, { createContext, useContext, useState, useEffect } from "react";
import { useAuth } from "./AuthContext";

const OrderContext = createContext<any>(undefined);

export function OrderProvider({ children }) {
  const { session, isBackendConnected } = useAuth();
  let API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
  if (API_URL.endsWith('/')) API_URL = API_URL.slice(0, -1);
  if (!API_URL.endsWith('/api')) API_URL = `${API_URL}/api`;

  const [orders, setOrders] = useState(() => {
    const localOrders = localStorage.getItem("opticus_orders");
    return localOrders ? JSON.parse(localOrders) : [];
  });

  const fetchBackendOrders = async (token) => {
    try {
      const res = await fetch(`${API_URL}/orders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOrders(data.orders);
        localStorage.setItem("opticus_orders", JSON.stringify(data.orders));
      }
    } catch (e) {
      console.error("Failed to load backend orders:", e);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem("opticus_token");
    if (token && isBackendConnected) {
      fetchBackendOrders(token);
    }
  }, [isBackendConnected]);

  const updateOrderStatus = async (orderId, newStatus) => {
    const token = localStorage.getItem("opticus_token");
    if (isBackendConnected && token) {
      try {
        const res = await fetch(`${API_URL}/orders/${orderId}/status`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json();
        if (res.ok && data.success) {
          fetchBackendOrders(token);
          return;
        }
      } catch (e) {
        console.error("Backend status update failed, shifting to local cache:", e);
      }
    }

    // Fallback simulation
    const nextOrders = orders.map((o) => {
      if (o.id === orderId) {
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
        const res = await fetch(`${API_URL}/payments/create-billing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
          },
          body: JSON.stringify({ orderId })
        });
        const data = await res.json();
        return data;
      } catch (e) {
        console.error("AbacatePay billing setup failed:", e);
        return { success: false, error: "Backend payment service is currently offline." };
      }
    }
    return { success: false, error: "Backend offline. Simulated checkout is unavailable." };
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
