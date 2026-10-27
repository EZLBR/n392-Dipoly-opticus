import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { OrderProvider, useOrder } from "../contexts/OrderContext";

vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ session: null, isBackendConnected: false }) }));

function Orders() {
  const { orders } = useOrder();
  return <output aria-label="orders">{JSON.stringify(orders)}</output>;
}
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

describe("order cache recovery (#35)", () => {
  it.each(["{private-corrupted", "null", '{"private":"not-a-list"}', '"private-string"'])
    ("discards invalid cache %s without exposing its content", raw => {
      localStorage.setItem("opticus_orders", raw);
      const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
      render(<OrderProvider><Orders /></OrderProvider>);
      expect(screen.getByLabelText("orders")).toHaveTextContent("[]");
      expect(localStorage.getItem("opticus_orders")).toBeNull();
      expect(warning).toHaveBeenCalled();
      expect(JSON.stringify(warning.mock.calls)).not.toContain("private");
    });

  it("restores an existing order array", () => {
    localStorage.setItem("opticus_orders", '[{"publicId":"order-a","status":"Queued"}]');
    render(<OrderProvider><Orders /></OrderProvider>);
    expect(screen.getByLabelText("orders")).toHaveTextContent('[{"publicId":"order-a","status":"Queued"}]');
  });

  it("starts empty when there is no cache", () => {
    render(<OrderProvider><Orders /></OrderProvider>);
    expect(screen.getByLabelText("orders")).toHaveTextContent("[]");
  });

  it("does not crash when browser storage is inaccessible", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<OrderProvider><Orders /></OrderProvider>);
    expect(screen.getByLabelText("orders")).toHaveTextContent("[]");
  });

  it("does not crash when invalid cache cannot be removed", () => {
    localStorage.setItem("opticus_orders", "{invalid");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    render(<OrderProvider><Orders /></OrderProvider>);
    expect(screen.getByLabelText("orders")).toHaveTextContent("[]");
  });
});
