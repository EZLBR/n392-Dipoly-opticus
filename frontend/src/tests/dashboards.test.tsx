import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { FactoryDashboard, StaffDashboard } from "../components/Dashboards";

vi.mock("../contexts/OrderContext", () => ({ useOrder: () => ({ orders: [], updateOrderStatus: vi.fn() }) }));

function SessionControls({ role }: { role: string }) {
  const { setSession } = useAuth();
  return <>
    <button onClick={() => setSession({ id: "factory-a", role, factoryName: "Factory A" })}>Authorize</button>
    <button onClick={() => setSession(null)}>End session</button>
    <button onClick={() => setSession({ id: "client-a", role: "client" })}>Client session</button>
  </>;
}

beforeEach(() => { localStorage.clear(); vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} }); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("dashboard session transitions (#38)", () => {
  it.each([
    { Component: FactoryDashboard, role: "factory", title: "Factory A Dashboard" },
    { Component: StaffDashboard, role: "staff", title: "Operations Dashboard" },
  ])("keeps $role dashboard working across authorization and logout", ({ Component, role, title }) => {
    // Charts have no layout in jsdom; this test exercises the real dashboard, not chart rendering.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    render(<AuthProvider><LanguageProvider><SessionControls role={role} /><Component /></LanguageProvider></AuthProvider>);
    expect(screen.getByText("Access denied.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Authorize"));
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(errors.mock.calls.flat().join(" ")).not.toMatch(/order of Hooks|Rendered (more|fewer) hooks/);
    fireEvent.click(screen.getByText("End session"));
    expect(screen.getByText("Access denied.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: title })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Client session"));
    expect(screen.getByText("Access denied.")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Authorize"));
    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
  });
});
