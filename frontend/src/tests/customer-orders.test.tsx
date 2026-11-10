import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CustomerOrders from "../components/CustomerOrders";
import { LanguageProvider } from "../contexts/LanguageContext";

const auth = vi.hoisted(() => ({
  session: { role: "client" } as { role: string } | null,
  sessionToken: "account-one",
  sessionLoading: false,
}));
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => auth }));

const order = { publicId: "order-id", productName: "Óculos redondo", status: "Queued", total: "159.90", createdAt: "2026-11-05T14:00:00Z" };
const pagination = { page: 1, totalPages: 1 };
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function view(path = "/orders") {
  return (
    <MemoryRouter initialEntries={[path]}>
      <LanguageProvider>
        <Routes>
          <Route path="/orders" element={<CustomerOrders />} />
          <Route path="/orders/:publicId" element={<CustomerOrders />} />
        </Routes>
      </LanguageProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  auth.session = { role: "client" };
  auth.sessionToken = "account-one";
  auth.sessionLoading = false;
  localStorage.setItem("opticus_language", "pt");
  localStorage.setItem("opticus_token", auth.sessionToken);
});

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe("Customer orders", () => {
  it("lists orders and opens a detail with recorded transitions and actual specifications", async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ orders: [order], pagination }))
      .mockResolvedValueOnce(json({ order: {
        ...order, customSpecs: { model: "round", quantity: 2, color: "#101010",
          templeOpen: Math.PI / 4, templeStyle: "standard", bridgeStyle: "soft", prescriptionUploaded: true },
        history: [
          { kind: "baseline", fromStatus: null, toStatus: "Pending Payment", occurredAt: order.createdAt },
          { kind: "transition", fromStatus: "Pending Payment", toStatus: "Queued", occurredAt: "2026-11-05T15:00:00Z" },
        ],
      } }));
    vi.stubGlobal("fetch", fetch);
    render(view());
    expect(screen.getByRole("status")).toHaveTextContent("Carregando pedidos");
    fireEvent.click(await screen.findByRole("link", { name: order.productName }));
    expect(await screen.findByRole("heading", { name: order.productName })).toBeInTheDocument();
    expect(screen.getByText("Redondo")).toBeInTheDocument();
    expect(screen.getByText("#101010")).toBeInTheDocument();
    expect(screen.getByText("45°")).toBeInTheDocument();
    expect(screen.getByText("Estilo da ponte")).toBeInTheDocument();
    expect(screen.getByText("Receita enviada")).toBeInTheDocument();
    expect(screen.getByText("Primeiro status registrado")).toBeInTheDocument();
    expect(screen.getByText("Aguardando pagamento → Na fila")).toBeInTheDocument();
    expect(fetch.mock.calls[1][0]).toMatch(/\/orders\/mine\/order-id$/);
    expect(fetch.mock.calls[1][1].headers.get("Authorization")).toBe("Bearer account-one");
  });

  it("shows a localized error and retries to an empty list", async () => {
    localStorage.setItem("opticus_language", "en");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("internals"))
      .mockResolvedValueOnce(json({ orders: [], pagination: { page: 1, totalPages: 0 } })));
    render(view());
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load orders");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("You don't have any orders yet.")).toBeInTheDocument();
  });

  it("waits for authentication and clears a stale response on account change", async () => {
    auth.sessionLoading = true;
    let resolveOld!: (response: Response) => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<Response>(resolve => { resolveOld = resolve; }))
      .mockResolvedValueOnce(json({ orders: [], pagination: { page: 1, totalPages: 0 } }));
    vi.stubGlobal("fetch", fetch);
    const { rerender } = render(view());
    expect(fetch).not.toHaveBeenCalled();
    auth.sessionLoading = false;
    rerender(view());
    expect(fetch).toHaveBeenCalledTimes(1);
    auth.session = { role: "client" };
    auth.sessionToken = "account-two";
    localStorage.setItem("opticus_token", auth.sessionToken);
    rerender(view());
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => resolveOld(json({ orders: [order], pagination })));
    expect(await screen.findByText("Você ainda não tem pedidos.")).toBeInTheDocument();
    expect(screen.queryByText(order.productName)).toBeNull();
  });
});
