import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Cart from "../components/Cart";
import { LanguageProvider, useTranslation } from "../contexts/LanguageContext";

const checkoutCart = vi.hoisted(() => vi.fn());
vi.mock("../contexts/AuthContext", () => ({ useAuth: () => ({ session: { id: "customer" } }) }));
vi.mock("../contexts/CartContext", () => ({
  useCart: () => ({ checkoutCart, cart: [{ id: "frame", quantity: 1, total: 159, customSpecs: {} }] }),
}));
vi.mock("../components/ThreePreview", () => ({ default: () => null }));

function LanguageControl() {
  const { setLanguage } = useTranslation();
  return <button onClick={() => setLanguage("pt")}>PT</button>;
}

afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

it("refreshes the same private checkout when the language changes", async () => {
  const url = "http://localhost:5000/api/payments/simulated-checkout?billingId=existing";
  checkoutCart.mockResolvedValueOnce({ ok: true, isSimulated: true, checkoutUrl: url, billingId: "existing" });
  localStorage.setItem("opticus_token", "synthetic-test-token");
  const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    expect(String(input)).toBe(url);
    const headers = new Headers(init?.headers);
    expect(headers.get("Authorization")).toBe("Bearer synthetic-test-token");
    return new Response(`<p>${headers.get("Accept-Language")}</p>`, { headers: { "Content-Type": "text/html" } });
  });

  render(<LanguageProvider><LanguageControl /><Cart setView={vi.fn()} /></LanguageProvider>);
  fireEvent.click(screen.getByRole("button", { name: "PROCEED TO PIX PAYMENT" }));
  expect(await screen.findByTitle("Your Pix billing")).toHaveAttribute("srcdoc", "<p>en</p>");
  fireEvent.click(screen.getByRole("button", { name: "PT" }));
  await waitFor(() => expect(screen.getByTitle("Sua cobrança Pix")).toHaveAttribute("srcdoc", "<p>pt</p>"));
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(checkoutCart).toHaveBeenCalledTimes(1);
});
