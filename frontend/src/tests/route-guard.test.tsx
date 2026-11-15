import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LanguageProvider } from "../contexts/LanguageContext";
import { loginRedirectTarget } from "../routes/access";

// Sessão em estado React comum, como no AuthContext real: o guard precisa
// reagir a login, logout e expiração com o mesmo agendamento de renderização.
// `auth.set` antes do render define o estado inicial; depois, atualiza o provider.
type AuthState = { session: { role: string; name: string } | null; sessionLoading: boolean };
const auth = vi.hoisted(() => {
  let initial: AuthState = { session: null, sessionLoading: false };
  let update: ((patch: Partial<AuthState>) => void) | null = null;
  return {
    initial: () => initial,
    bind: (fn: typeof update) => { update = fn; },
    set: (patch: Partial<AuthState>) => {
      initial = { ...initial, ...patch };
      update?.(patch);
    },
  };
});

vi.mock("../contexts/AuthContext", async () => {
  const React = await import("react");
  const Context = React.createContext<any>(null);
  function AuthProvider({ children }: { children: React.ReactNode }) {
    const [state, setState] = React.useState<AuthState>(auth.initial);
    React.useEffect(() => {
      auth.bind(patch => setState(current => ({ ...current, ...patch })));
      return () => auth.bind(null);
    }, []);
    const value = {
      ...state,
      authWarning: null,
      clearAuthWarning: () => {},
      logout: () => setState(current => ({ ...current, session: null })),
      login: async (email: string) => {
        const role = email.split("@")[0];
        setState(current => ({ ...current, session: { role, name: "Ana" } }));
        return { ok: true, role };
      },
      signup: async () => ({ ok: false }),
    };
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }
  return { AuthProvider, useAuth: () => React.useContext(Context) };
});
vi.mock("../contexts/CartContext", () => ({ useCart: () => ({ cart: [{ id: "x", quantity: 2 }], clearCart: () => {} }) }));

// Cada página privada registra se chegou a montar.
const mounted = vi.hoisted(() => [] as string[]);
vi.mock("../components/Marketplace", () => ({ default: () => <h1>Explorer page</h1> }));
vi.mock("../components/CreatorStudio", () => ({ default: () => { mounted.push("studio"); return <h1>Studio page</h1>; } }));
vi.mock("../components/DesignsGallery", () => ({ default: () => { mounted.push("designs"); return <h1>Designs page</h1>; } }));
vi.mock("../components/Cart", () => ({ default: () => { mounted.push("cart"); return <h1>Cart page</h1>; } }));
vi.mock("../components/CustomerOrders", () => ({ default: () => { mounted.push("orders"); return <h1>Orders page</h1>; } }));
vi.mock("../components/Dashboards", () => ({
  FactoryDashboard: () => { mounted.push("factory"); return <h1>Factory page</h1>; },
  StaffDashboard: () => { mounted.push("staff"); return <h1>Staff page</h1>; },
}));

import { AppContent } from "../App";
import { AuthProvider } from "../contexts/AuthContext";

function CurrentPath() {
  const location = useLocation();
  return <div data-testid="path">{location.pathname}</div>;
}

function renderApp(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <LanguageProvider>
          <AppContent />
          <CurrentPath />
        </LanguageProvider>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const privatePaths = ["/create", "/designs", "/cart", "/orders", "/orders/abc", "/factory-dashboard", "/staff-dashboard"];
const path = () => screen.getByTestId("path").textContent;
// jsdom descarta o espaço antes do texto oculto ao calcular o nome acessível.
const locked = (label: string, note = "Sign in required") => new RegExp(`^${label}\\s*\\(${note}\\)$`);
const nav = () => within(screen.getByRole("navigation"));

async function signIn(role: string) {
  fireEvent.change(await screen.findByLabelText("Email address"), { target: { value: `${role}@opticus.test` } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "senha-de-teste" } });
  fireEvent.click(screen.getByRole("button", { name: "ENTER OPTICUS" }));
}

beforeEach(() => {
  mounted.length = 0;
  localStorage.setItem("opticus_language", "en");
  auth.set({ session: null, sessionLoading: false });
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("FE-08: visitors only reach the Explorer and authentication", () => {
  it("keeps the Explorer and login public", async () => {
    renderApp("/");
    expect(await screen.findByRole("heading", { name: "Explorer page" })).toBeInTheDocument();
    cleanup();
    renderApp("/login");
    expect(await screen.findByLabelText("Email address")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });

  it.each(privatePaths)("sends a visitor opening %s by URL to login without mounting the page", async privatePath => {
    renderApp(privatePath);
    expect(await screen.findByRole("note")).toHaveTextContent("Sign in to access this area");
    expect(path()).toBe("/login");
    expect(mounted).toEqual([]);
  });

  it("marks private navigation for visitors and hides the cart count", async () => {
    renderApp("/");
    await screen.findByRole("heading", { name: "Explorer page" });
    for (const label of ["STUDIO", "MY DESIGNS", "CART"]) {
      expect(nav().getByRole("link", { name: locked(label) })).toHaveAttribute("title", "Sign in required");
    }
    expect(nav().queryByText("2")).not.toBeInTheDocument();
    fireEvent.click(nav().getByRole("link", { name: locked("STUDIO") }));
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(mounted).toEqual([]);
  });

  it("communicates the requirement in Portuguese", async () => {
    localStorage.setItem("opticus_language", "pt");
    renderApp("/cart");
    expect(await screen.findByRole("note")).toHaveTextContent("Entre na sua conta para acessar esta área");
    expect(nav().getByRole("link", { name: locked("ESTÚDIO", "Requer login") })).toBeInTheDocument();
  });

  it("returns to the requested page after login", async () => {
    renderApp("/cart");
    await signIn("client");
    expect(await screen.findByRole("heading", { name: "Cart page" })).toBeInTheDocument();
    expect(path()).toBe("/cart");
  });

  it("sends a role that cannot open the requested page to its own home after login", async () => {
    renderApp("/orders");
    await signIn("staff");
    expect(await screen.findByRole("heading", { name: "Staff page" })).toBeInTheDocument();
    expect(mounted).not.toContain("orders");
  });

  it("waits for session restoration without redirecting or mounting private pages", async () => {
    auth.set({ sessionLoading: true });
    renderApp("/staff-dashboard");
    expect(await screen.findByRole("status")).toHaveTextContent("Loading");
    expect(path()).toBe("/staff-dashboard");
    expect(mounted).toEqual([]);
    expect(screen.queryByRole("button", { name: "LOGIN" })).not.toBeInTheDocument();

    act(() => auth.set({ session: { role: "staff", name: "Ana" }, sessionLoading: false }));
    expect(await screen.findByRole("heading", { name: "Staff page" })).toBeInTheDocument();
  });

  it("sends an invalid restored session to login", async () => {
    auth.set({ sessionLoading: true });
    renderApp("/create");
    await screen.findByRole("status");
    act(() => auth.set({ sessionLoading: false }));
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(mounted).toEqual([]);
  });

  it.each([
    ["client", "/staff-dashboard", "/", "Explorer page"],
    ["client", "/factory-dashboard", "/", "Explorer page"],
    ["staff", "/orders", "/staff-dashboard", "Staff page"],
    ["factory", "/create", "/factory-dashboard", "Factory page"],
  ])("redirects a %s away from %s", async (role, privatePath, home, heading) => {
    auth.set({ session: { role, name: "Ana" } });
    renderApp(privatePath);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(path()).toBe(home);
  });

  it("lets an authenticated client open its private pages", async () => {
    auth.set({ session: { role: "client", name: "Ana" } });
    renderApp("/orders/abc");
    expect(await screen.findByRole("heading", { name: "Orders page" })).toBeInTheDocument();
    expect(nav().getByRole("link", { name: "STUDIO" })).not.toHaveAttribute("title");
  });

  it("takes the user back to the Explorer on logout and blocks private pages again", async () => {
    auth.set({ session: { role: "client", name: "Ana" } });
    renderApp("/create");
    await screen.findByRole("heading", { name: "Studio page" });
    fireEvent.click(screen.getByRole("button", { name: /Logout/ }));
    expect(await screen.findByRole("heading", { name: "Explorer page" })).toBeInTheDocument();
    fireEvent.click(nav().getByRole("link", { name: locked("CART") }));
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(mounted).not.toContain("cart");
  });

  it("sends an expired session to login and returns there afterwards", async () => {
    auth.set({ session: { role: "client", name: "Ana" } });
    renderApp("/designs");
    await screen.findByRole("heading", { name: "Designs page" });
    act(() => auth.set({ session: null }));
    expect(await screen.findByRole("note")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Designs page" })).not.toBeInTheDocument();
    await signIn("client");
    expect(await screen.findByRole("heading", { name: "Designs page" })).toBeInTheDocument();
  });
});

describe("loginRedirectTarget", () => {
  it.each([
    ["/cart", "client", "/cart"],
    ["/orders/abc?page=2", "client", "/orders/abc?page=2"],
    ["/staff-dashboard", "staff", "/staff-dashboard"],
    ["/staff-dashboard", "client", "/"],
    ["/create", "factory", "/factory-dashboard"],
    ["https://evil.example/cart", "client", "/"],
    ["//evil.example/cart", "client", "/"],
    ["/\\evil.example", "client", "/"],
    ["/login", "client", "/"],
    ["/unknown", "staff", "/staff-dashboard"],
    [undefined, "client", "/"],
    [42, "factory", "/factory-dashboard"],
  ])("accepts only allowed internal routes (%s as %s)", (from, role, expected) => {
    expect(loginRedirectTarget(from, role)).toBe(expected);
  });
});
