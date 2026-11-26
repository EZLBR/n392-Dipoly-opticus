import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { FactoryDashboard, StaffDashboard } from "../components/Dashboards";
import { resumoDosItens } from "../utils/orderItems";
import type { OrderItem } from "../types/domain";
import type { Role } from "../routes/access";

// FEAT-04: um pedido agrupa os itens de uma fábrica. Os painéis mostram
// cada item, com a especificação dele (o "Meus pedidos" está em
// customer-orders.test.tsx).

let orders: Array<Record<string, unknown>> = [];
vi.mock("../contexts/OrderContext", () => ({ useOrder: () => ({ orders, updateOrderStatus: vi.fn() }) }));

const item = (productName: string, quantity: number, customSpecs: Record<string, unknown>, unitPrice = "210.00"): OrderItem => ({
  publicId: `${productName.toLowerCase()}-0000-4000-8000-000000000001`,
  productName, quantity, customSpecs, unitPrice,
  total: (Number(unitPrice) * quantity).toFixed(2),
});

const pedidoDeDoisItens = {
  publicId: "abcdef12-0000-4000-8000-000000000001",
  customerName: "Cliente",
  productName: "Wayfarer (+1)",
  factoryPublicId: "factory-a",
  factoryName: "Factory A",
  status: "Queued",
  version: 1,
  total: "690.00",
  createdAt: new Date().toISOString(),
  customSpecs: {},
  items: [
    item("Wayfarer", 2, { color: "#101010" }),
    item("Redondo", 1, { color: "#ababab" }, "270.00"),
  ],
};

function Session({ role }: { role: Role }) {
  const { setSession } = useAuth();
  return <button onClick={() => setSession({ publicId: "factory-a", name: "Factory A", email: "factory@exemplo.invalid", role, factoryName: "Factory A" })}>Authorize</button>;
}

function abrirDetalhes(Component: React.ComponentType, role: Role, textoDaLinha: string) {
  render(<AuthProvider><LanguageProvider><Session role={role} /><Component /></LanguageProvider></AuthProvider>);
  fireEvent.click(screen.getByText("Authorize"));
  fireEvent.contextMenu(screen.getByText(textoDaLinha));
  fireEvent.click(screen.getByRole("button", { name: /View details/ }));
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  // Charts have no layout in jsdom.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("resumoDosItens", () => {
  it("junta os itens numa linha, com a quantidade quando passa de 1", () => {
    expect(resumoDosItens(pedidoDeDoisItens)).toBe("2× Wayfarer, Redondo");
  });

  it("pedido sem itens no cache mostra o nome do próprio pedido", () => {
    expect(resumoDosItens({ productName: "Armação antiga" })).toBe("Armação antiga");
    expect(resumoDosItens({ productName: "Armação antiga", items: [] })).toBe("Armação antiga");
  });
});

describe.each([
  { Component: FactoryDashboard, role: "factory" as const },
  { Component: StaffDashboard, role: "staff" as const },
])("painel ($role)", ({ Component, role }) => {
  it("a tabela resume os itens e os detalhes mostram cada um, com a sua especificação", () => {
    orders = [pedidoDeDoisItens];
    abrirDetalhes(Component, role, "2× Wayfarer, Redondo");

    const wayfarer = screen.getByRole("region", { name: "Wayfarer" });
    expect(within(wayfarer).getByText("Quantity: 2")).toBeInTheDocument();
    expect(within(wayfarer).getByText("#101010")).toBeInTheDocument();
    expect(within(wayfarer).queryByText("#ababab")).toBeNull();
    const redondo = screen.getByRole("region", { name: "Redondo" });
    expect(within(redondo).getByText("Quantity: 1")).toBeInTheDocument();
    expect(within(redondo).getByText("#ababab")).toBeInTheDocument();
  });

  it("pedido sem itens (cache antigo) mostra a especificação do pedido", () => {
    orders = [{ ...pedidoDeDoisItens, productName: "Armação antiga", items: undefined, customSpecs: { color: "#202020" } }];
    abrirDetalhes(Component, role, "Armação antiga");

    expect(screen.getByText("#202020")).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Wayfarer" })).toBeNull();
  });
});
