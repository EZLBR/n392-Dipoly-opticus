import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { FactoryDashboard, StaffDashboard } from "../components/Dashboards";
import type { Role } from "../routes/access";

// FEAT-03: o menu do painel só oferece as transições que o servidor aceita.
// CONC-02: e envia a versão do pedido que estava na tela.
const updateOrderStatus = vi.fn(async () => ({ ok: true }));
let orders: Array<Record<string, unknown>> = [];
vi.mock("../contexts/OrderContext", () => ({ useOrder: () => ({ orders, updateOrderStatus }) }));

const order = (status: string) => ({
  publicId: "abcdef12-0000-4000-8000-000000000001",
  customerName: "Cliente",
  productName: "Armação teste",
  factoryPublicId: "factory-a",
  factoryName: "Factory A",
  status,
  version: 3,
  total: "450.00",
  createdAt: new Date().toISOString(),
});

function Session({ role }: { role: Role }) {
  const { setSession } = useAuth();
  return <button onClick={() => setSession({ publicId: "factory-a", name: "Factory A", email: "factory@exemplo.invalid", role, factoryName: "Factory A" })}>Authorize</button>;
}

function openMenu(Component: React.ComponentType, role: Role) {
  render(<AuthProvider><LanguageProvider><Session role={role} /><Component /></LanguageProvider></AuthProvider>);
  fireEvent.click(screen.getByText("Authorize"));
  fireEvent.contextMenu(screen.getByText("Armação teste"));
}

const offered = () => ["Queued", "In production", "Delivered", "Cancelled", "Awaiting payment"]
  .filter(label => screen.queryByRole("button", { name: label }));

beforeEach(() => {
  localStorage.clear();
  updateOrderStatus.mockClear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // Charts have no layout in jsdom.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("order status menu (FEAT-03)", () => {
  it("offers nothing to the factory while the order awaits payment", () => {
    orders = [order("Pending Payment")];
    openMenu(FactoryDashboard, "factory");
    expect(offered()).toEqual([]);
    expect(screen.getByText("No status change available for this order.")).toBeInTheDocument();
  });

  it("lets the factory move a paid order forward and sends the chosen status", () => {
    orders = [order("Queued")];
    openMenu(FactoryDashboard, "factory");
    expect(offered()).toEqual(["In production", "Delivered"]);
    fireEvent.click(screen.getByRole("button", { name: "In production" }));
    expect(updateOrderStatus).toHaveBeenCalledWith(orders[0].publicId, "In production", 3);
  });

  it("adds cancellation for staff and nothing after delivery", () => {
    orders = [order("In production")];
    openMenu(StaffDashboard, "staff");
    expect(offered()).toEqual(["Delivered", "Cancelled"]);
    cleanup();
    orders = [order("Delivered")];
    openMenu(StaffDashboard, "staff");
    expect(offered()).toEqual([]);
  });
});
