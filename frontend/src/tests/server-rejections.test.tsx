import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { OrderProvider, useOrder } from "../contexts/OrderContext";
import { CartProvider } from "../contexts/CartContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CreatorStudioProvider } from "../contexts/CreatorStudioContext";
import { FactoryDashboard, StaffDashboard } from "../components/Dashboards";
import { SaveDesignModal } from "../components/creator/CreatorModals";
import DesignsGallery from "../components/DesignsGallery";
import { ProblemError, setNavigateHandler } from "../api/client";

vi.mock("../components/ThreePreview", () => ({ default: () => null })); // No GPU needed for delete flow.
const order = { id: 1, publicId: "order-a", factoryId: "owner-a", customerName: "Ana", productName: "Frame A", status: "Queued", total: 100 };
const design = { id: "design-a", name: "Original design", model: "round", color: "#112233" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const denied = (status = 403) => json({ title: "Operação recusada", detail: "Você não pode alterar este recurso.", status }, status);
let restoreDialog = () => {};

function mockApi(mutate: (path: string, options: RequestInit) => Response | Promise<Response>, role = "staff", readOrders: () => Response | Promise<Response> = () => json({ orders: [order] })) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options = {}) => {
    const path = new URL(String(url)).pathname;
    if (options.method && options.method !== "GET") return mutate(path, options);
    if (path.endsWith("/auth/me")) return json({ user: { id: "owner-a", name: "Ana", role, factoryName: "Factory A" } });
    if (path.endsWith("/auth/users")) return json({ users: [] });
    if (path.endsWith("/orders")) return readOrders();
    if (path.endsWith("/designs")) return json({ designs: [design] });
    throw new Error(`Unexpected GET ${path}`);
  });
}
function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider><OrderProvider><LanguageProvider>{children}</LanguageProvider></OrderProvider></AuthProvider>;
}
async function contexts() {
  const hook = renderHook(() => ({ auth: useAuth(), order: useOrder() }), { wrapper: Providers });
  await waitFor(() => expect(hook.result.current.order.orders).toHaveLength(1));
  await waitFor(() => expect(hook.result.current.auth.designs).toHaveLength(1));
  return hook;
}
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("opticus_token", "test-token");
  localStorage.setItem("opticus_studio_owner", "user:owner-a");
  localStorage.setItem("opticus_language", "pt");
  setNavigateHandler(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); restoreDialog(); vi.restoreAllMocks(); vi.unstubAllGlobals(); setNavigateHandler(null); localStorage.clear(); });

describe("server rejection is not local success (#34)", () => {
  it.each([401, 403, 422, 500])("keeps order and cache unchanged on HTTP %i", async status => {
    mockApi(() => denied(status));
    const { result } = await contexts();
    const cached = localStorage.getItem("opticus_orders");
    let response;
    await act(async () => { response = await result.current.order.updateOrderStatus("order-a", "Delivered"); });
    expect(result.current.order.orders).toEqual([order]);
    expect(localStorage.getItem("opticus_orders")).toBe(cached);
    expect(response).toMatchObject({ ok: false, error: "Você não pode alterar este recurso." });
  });

  it("does not simulate an order mutation during a transport failure", async () => {
    mockApi(() => { throw new TypeError("Failed to fetch"); });
    const { result } = await contexts();
    const cached = localStorage.getItem("opticus_orders");
    let response;
    await act(async () => { response = await result.current.order.updateOrderStatus("order-a", "Delivered"); });
    expect(result.current.order.orders).toEqual([order]);
    expect(localStorage.getItem("opticus_orders")).toBe(cached);
    expect(response).toMatchObject({ ok: false, error: expect.stringMatching(/conexão|rede/i) });
  });

  it("does not simulate an order mutation without authentication", async () => {
    localStorage.removeItem("opticus_token");
    localStorage.setItem("opticus_orders", JSON.stringify([order]));
    const { result } = renderHook(useOrder, { wrapper: Providers });
    let response;
    await act(async () => { response = await result.current.updateOrderStatus("order-a", "Delivered"); });
    expect(result.current.orders).toEqual([order]);
    expect(response).toMatchObject({ ok: false });
  });

  it("uses the canonical server order after a successful mutation", async () => {
    let accepted = false;
    mockApi(() => { accepted = true; return json({ message: "ok" }); }, "staff", () => json({ orders: [{ ...order, status: accepted ? "In production" : "Queued" }] }));
    const { result } = await contexts();
    let response;
    await act(async () => { response = await result.current.order.updateOrderStatus("order-a", "Delivered"); });
    expect(response).toEqual({ ok: true });
    expect(result.current.order.orders[0].status).toBe("In production");
    expect(JSON.parse(localStorage.getItem("opticus_orders")!)[0].status).toBe("In production");
  });

  it("reports a failed refresh without fabricating the requested order status", async () => {
    let accepted = false;
    mockApi(() => { accepted = true; return json({ message: "ok" }); }, "staff", () => accepted ? denied(500) : json({ orders: [order] }));
    const { result } = await contexts();
    let response;
    await act(async () => { response = await result.current.order.updateOrderStatus("order-a", "Delivered"); });
    expect(response).toMatchObject({ ok: false });
    expect(result.current.order.orders).toEqual([order]);
    expect(JSON.parse(localStorage.getItem("opticus_orders")!)).toEqual([order]);
  });

  it("does not refresh a new account after an old order mutation completes", async () => {
    let release!: (value: Response) => void;
    const fetch = mockApi(() => new Promise(resolve => { release = resolve; }));
    const { result } = await contexts();
    const pending = result.current.order.updateOrderStatus("order-a", "Delivered");
    const readsBefore = fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/orders") && init?.method === "GET").length;
    localStorage.setItem("opticus_token", "other-account-token");
    let response;
    await act(async () => { release(json({ message: "ok" })); response = await pending; });
    expect(response).toMatchObject({ ok: false });
    expect(fetch.mock.calls.filter(([url, init]) => String(url).endsWith("/orders") && init?.method === "GET")).toHaveLength(readsBefore);
  });

  it("does not overwrite the new account cache with a delayed old-account read", async () => {
    let release!: (value: Response) => void;
    let deferred = false;
    mockApi(() => denied(), "staff", () => deferred ? new Promise<Response>(resolve => { release = resolve; }) : json({ orders: [order] }));
    const { result } = await contexts();
    deferred = true;
    const pending = result.current.order.fetchBackendOrders("test-token");
    localStorage.setItem("opticus_token", "other-account-token");
    localStorage.setItem("opticus_orders", "[]");
    let response;
    await act(async () => { release(json({ orders: [{ ...order, status: "Delivered" }] })); response = await pending; });
    expect(localStorage.getItem("opticus_orders")).toBe("[]");
    expect(response).toMatchObject({ ok: false });
  });

  it.each([403, 422, 500])("does not save a rejected design locally on HTTP %i", async status => {
    mockApi(() => denied(status));
    const { result } = await contexts();
    localStorage.setItem("opticus_active_design_id", "design-a");
    const cached = localStorage.getItem("opticus_designs");
    let failure;
    await act(async () => { try { await result.current.auth.saveDesign({ ...design, name: "Rejected edit" }); } catch (error) { failure = error; } });
    expect(failure).toBeInstanceOf(ProblemError);
    expect(localStorage.getItem("opticus_designs")).toBe(cached);
    expect(localStorage.getItem("opticus_active_design_id")).toBe("design-a");
    expect(result.current.auth.designs[0].name).toBe("Original design");
  });

  it("preserves the explicit unsynced draft on a real transport failure", async () => {
    mockApi(() => { throw new TypeError("Failed to fetch"); });
    const { result } = await contexts();
    let saved;
    await act(async () => { saved = await result.current.auth.saveDesign({ ...design, name: "Offline draft" }); });
    expect(saved).toMatchObject({ name: "Offline draft", syncStatus: "local" });
    expect(result.current.auth.designs[0].name).toBe("Offline draft");
  });

  it("does not turn an invalid success response into an offline draft", async () => {
    mockApi(() => new Response("{invalid", { headers: { "Content-Type": "application/json" } }));
    const { result } = await contexts();
    const cached = localStorage.getItem("opticus_designs");
    let failure;
    await act(async () => { try { await result.current.auth.saveDesign({ ...design, name: "Bad response" }); } catch (error) { failure = error; } });
    expect(failure).toBeInstanceOf(SyntaxError);
    expect(localStorage.getItem("opticus_designs")).toBe(cached);
  });

  it.each([null, "not-a-design-response"])("does not save a local copy for malformed success body %s", async body => {
    mockApi(() => json(body));
    const { result } = await contexts();
    const cached = localStorage.getItem("opticus_designs");
    let failure;
    await act(async () => { try { await result.current.auth.saveDesign({ ...design, name: "Bad response" }); } catch (error) { failure = error; } });
    expect(failure).toBeInstanceOf(Error);
    expect(localStorage.getItem("opticus_designs")).toBe(cached);
  });

  it("marks a remotely saved design as synchronized", async () => {
    mockApi(() => json({ id: "design-a" }));
    const { result } = await contexts();
    let saved;
    await act(async () => { saved = await result.current.auth.saveDesign({ ...design, name: "Accepted edit" }); });
    expect(saved).toMatchObject({ name: "Accepted edit", syncStatus: "synced" });
  });

  it.each([{ Component: StaffDashboard, role: "staff" }, { Component: FactoryDashboard, role: "factory" }])
    ("shows the rejection in the $role dashboard without changing the row", async ({ Component, role }) => {
      mockApi(() => denied(), role);
      render(<Providers><Component /></Providers>);
      const row = (await screen.findByText("Frame A")).closest("tr")!;
      fireEvent.contextMenu(row);
      fireEvent.click(screen.getByRole("button", { name: "Delivered" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Você não pode alterar este recurso.");
      expect(row).toHaveTextContent("Queued");
    });

  it("keeps the save modal open and shows the server rejection", async () => {
    mockApi(() => denied(), "client");
    const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
    Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function () { this.open = true; } });
    restoreDialog = () => original ? Object.defineProperty(HTMLDialogElement.prototype, "showModal", original) : Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
    const closed = vi.fn();
    render(<Providers><CreatorStudioProvider><SaveDesignModal isOpen onClose={closed} onOpenDesigns={() => {}} /></CreatorStudioProvider></Providers>);
    const input = await screen.findByLabelText("Nome do design");
    fireEvent.change(input, { target: { value: "Rejected design" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar design" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Você não pode alterar este recurso.");
    expect(closed).not.toHaveBeenCalled();
    expect(document.querySelector("dialog")).toHaveAttribute("open");
  });

  it("does not clear the active design when remote deletion is refused", async () => {
    mockApi(() => denied(), "client");
    render(<Providers><CartProvider><DesignsGallery setView={() => {}} /></CartProvider></Providers>);
    await screen.findByText("Original design");
    localStorage.setItem("opticus_active_design", "0");
    localStorage.setItem("opticus_active_design_id", "design-a");
    fireEvent.click(screen.getByTitle("Delete Design"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Você não pode alterar este recurso.");
    expect(localStorage.getItem("opticus_active_design_id")).toBe("design-a");
    expect(screen.getByText("Original design")).toBeInTheDocument();
  });
});
