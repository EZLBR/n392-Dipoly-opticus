import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { fakeCartApi } from "./cart-api";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider, useCart } from "../contexts/CartContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import DesignsGallery from "../components/DesignsGallery";
import { normalizeConfig } from "../eyewear/config";

// GPU rendering is an unrelated external dependency for this cart-entry test.
vi.mock("../components/ThreePreview", () => ({ default: () => null }));
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
const config = normalizeConfig({ artwork: { version: 1, layers: [{ id: "text-1", text: "Brand", zone: "temple-right" }] } });

it("keeps a saved artwork design editable but unavailable to add from the gallery", () => {
  localStorage.setItem("opticus_studio_owner", "anonymous");
  localStorage.setItem("opticus_designs", JSON.stringify([{ id: "art", name: "Art design", syncStatus: "local", config }]));
  render(<LanguageProvider><AuthProvider><CartProvider><DesignsGallery setView={() => {}} /></CartProvider></AuthProvider></LanguageProvider>);
  expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "EDIT IN STUDIO" })).toBeEnabled();
});

function CartControls() {
  const { cart, addToCart, status } = useCart();
  return <><output aria-label="cart-status">{status}</output><output aria-label="cart-count">{cart.length}</output>
    <button onClick={() => void addToCart({ id: "normal", productName: "Test frame", total: 100, customSpecs: normalizeConfig() })}>Add normal</button>
    <button onClick={() => void addToCart({ id: "art", productName: "Test frame", total: 100, customSpecs: config })}>Add art</button></>;
}
it("rejects artwork at the shared cart entry point while accepting a normal design", async () => {
  localStorage.setItem("opticus_token", "token-a");
  const api = fakeCartApi({ "token-a": { publicId: "user-a", name: "Ana", email: "ana@example.com", role: "client" } });
  render(<AuthProvider><CartProvider><CartControls /></CartProvider></AuthProvider>);
  await waitFor(() => expect(screen.getByLabelText("cart-status")).toHaveTextContent("ready"));
  fireEvent.click(screen.getByText("Add normal"));
  await waitFor(() => expect(screen.getByLabelText("cart-count")).toHaveTextContent("1"));
  fireEvent.click(screen.getByText("Add art"));
  await new Promise(resolve => setTimeout(resolve, 20));
  expect(screen.getByLabelText("cart-count")).toHaveTextContent("1");
  // A arte nem chega ao servidor.
  expect(api.serverCart("user-a")).toHaveLength(1);
});

function PatternCartControls() {
  const { cart, addToCart } = useCart();
  return <><output aria-label="cart-count">{cart.length}</output><button onClick={() => addToCart({ id: "pattern", productName: "Test frame", total: 100, customSpecs: normalizeConfig({ surfacePattern: { version: 1, style: "checker" } }) })}>Add pattern</button></>;
}
it("does not add a visual-only pattern to the shared cart", () => {
  render(<AuthProvider><CartProvider><PatternCartControls /></CartProvider></AuthProvider>);
  fireEvent.click(screen.getByText("Add pattern"));
  expect(screen.getByLabelText("cart-count")).toHaveTextContent("0");
});
