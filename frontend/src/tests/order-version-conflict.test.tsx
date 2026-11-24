import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { AuthProvider } from "../contexts/AuthContext";
import { OrderProvider, useOrder } from "../contexts/OrderContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { setNavigateHandler } from "../api/client";

// CONC-02: o painel envia a versão lida e, num 409, recarrega a lista em vez
// de aplicar a mudança localmente.
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const conflict = () => json({
  type: "https://opticus.example/problems/conflict", title: "Conflito", status: 409,
  detail: "O pedido foi alterado por outra pessoa. Recarregue e tente novamente.",
}, 409);

const stale = { publicId: "order-a", factoryPublicId: "owner-a", productName: "Frame A", status: "Queued", version: 4, total: "100.00" };
const fresh = { ...stale, status: "Cancelled", version: 5 };

function mockApi(mutate: (body: Record<string, unknown>) => Response) {
  let reads = 0;
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const path = new URL(String(url)).pathname;
    if (options.method === "PUT") return mutate(JSON.parse(String(options.body)));
    if (path.endsWith("/auth/me")) return json({ user: { publicId: "owner-a", name: "Ana", role: "staff" } });
    if (path.endsWith("/auth/users")) return json({ users: [] });
    if (path.endsWith("/designs")) return json({ designs: [] });
    if (path.endsWith("/orders")) return json({ orders: [reads++ === 0 ? stale : fresh] });
    throw new Error(`Unexpected ${options.method ?? "GET"} ${path}`);
  });
  return fetch;
}

async function orderContext() {
  const hook = renderHook(() => useOrder(), {
    wrapper: ({ children }) => <AuthProvider><OrderProvider><LanguageProvider>{children}</LanguageProvider></OrderProvider></AuthProvider>,
  });
  await waitFor(() => expect(hook.result.current.orders).toEqual([stale]));
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("opticus_token", "test-token");
  localStorage.setItem("opticus_language", "pt");
  setNavigateHandler(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setNavigateHandler(null); localStorage.clear(); });

describe("order version conflict (CONC-02)", () => {
  it("sends the version the screen showed", async () => {
    let sent: Record<string, unknown> | undefined;
    mockApi(body => { sent = body; return json({ message: "ok" }); });
    const { result } = await orderContext();

    await act(async () => { await result.current.updateOrderStatus("order-a", "In production", stale.version); });

    expect(sent).toEqual({ status: "In production", version: 4 });
  });

  it("reloads the orders on 409 and asks to check again, without applying the change", async () => {
    const fetch = mockApi(() => conflict());
    const { result } = await orderContext();
    const readsBefore = fetch.mock.calls.filter(([url]) => String(url).endsWith("/orders")).length;

    let response;
    await act(async () => { response = await result.current.updateOrderStatus("order-a", "In production", stale.version); });

    expect(response).toEqual({
      ok: false,
      error: "Este pedido foi alterado por outra pessoa. A lista foi atualizada; confira o status e tente de novo.",
    });
    expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/orders"))).toHaveLength(readsBefore + 1);
    // A tela passa a mostrar o pedido como está no servidor, não o status pedido.
    expect(result.current.orders).toEqual([fresh]);
  });
});
