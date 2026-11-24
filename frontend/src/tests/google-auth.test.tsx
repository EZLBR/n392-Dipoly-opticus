import { StrictMode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import AuthPage from "../components/AuthPage";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";

const state = "a".repeat(64);
const nonce = "b".repeat(64);
const verifier = "c".repeat(64);

function Account() {
  const { session } = useAuth();
  return <h1>{session?.name}</h1>;
}

function renderCallback(query: string) {
  sessionStorage.setItem("opticus_google_sign_in", JSON.stringify({
    state, nonce, verifier, from: "/orders", createdAt: Date.now(),
  }));
  render(<StrictMode><MemoryRouter initialEntries={[`/login?${query}`]}>
    <AuthProvider><LanguageProvider><Routes>
      <Route path="/login" element={<AuthPage />} />
      <Route path="/orders" element={<Account />} />
    </Routes></LanguageProvider></AuthProvider>
  </MemoryRouter></StrictMode>);
}

afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); sessionStorage.clear(); });

it("reports a cancelled flow in Portuguese and consumes its local state", async () => {
  localStorage.setItem("opticus_language", "pt");
  const fetch = vi.spyOn(globalThis, "fetch");
  renderCallback(`error=access_denied&state=${state}`);
  expect(await screen.findByRole("alert")).toHaveTextContent("O login com Google foi cancelado.");
  expect(fetch).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("opticus_google_sign_in")).toBeNull();
});

it("does not exchange a callback with mismatched state", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  renderCallback("code=test-code&state=incorrect");
  expect(await screen.findByRole("alert")).toHaveTextContent("could not be verified");
  expect(fetch).not.toHaveBeenCalled();
});

it("exchanges once, opens the allowed route and stores the same Opticus session", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, options) => {
    if (String(input).endsWith("/auth/google/exchange")) {
      expect(JSON.parse(String(options?.body))).toEqual({ code: "test-code", nonce, verifier });
      return Response.json({ user: { publicId: "customer-id", role: "client", name: "Google customer" }, token: "opticus-token" });
    }
    return Response.json({ designs: [] });
  });

  renderCallback(`code=test-code&state=${state}`);
  expect(await screen.findByRole("heading", { name: "Google customer" })).toBeInTheDocument();
  expect(localStorage.getItem("opticus_token")).toBe("opticus-token");
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/auth/google/exchange"))).toHaveLength(1);
});
