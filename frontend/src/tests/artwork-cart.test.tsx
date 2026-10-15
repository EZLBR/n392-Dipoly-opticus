import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider, useCart } from "../contexts/CartContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import DesignsGallery from "../components/DesignsGallery";
import { normalizeConfig } from "../eyewear/config";

// GPU rendering is an unrelated external dependency for this cart-entry test.
vi.mock("../components/ThreePreview", () => ({ default: () => null }));
afterEach(() => localStorage.clear());
const config = normalizeConfig({ artwork: { version: 1, layers: [{ id: "text-1", text: "Brand", zone: "temple-right" }] } });

it("keeps a saved artwork design editable but unavailable to add from the gallery", () => {
  localStorage.setItem("opticus_studio_owner", "anonymous");
  localStorage.setItem("opticus_designs", JSON.stringify([{ id: "art", name: "Art design", syncStatus: "local", config }]));
  render(<LanguageProvider><AuthProvider><CartProvider><DesignsGallery setView={() => {}} /></CartProvider></AuthProvider></LanguageProvider>);
  expect(screen.getByRole("button", { name: "ADD TO CART" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "EDIT IN STUDIO" })).toBeEnabled();
});

function CartControls() {
  const { cart, addToCart } = useCart();
  return <><output aria-label="cart-count">{cart.length}</output>
    <button onClick={() => addToCart({ id: "normal", customSpecs: normalizeConfig() })}>Add normal</button>
    <button onClick={() => addToCart({ id: "art", customSpecs: config })}>Add art</button></>;
}
it("rejects artwork at the shared cart entry point while accepting a normal design", () => {
  render(<AuthProvider><CartProvider><CartControls /></CartProvider></AuthProvider>);
  fireEvent.click(screen.getByText("Add normal"));
  expect(screen.getByLabelText("cart-count")).toHaveTextContent("1");
  fireEvent.click(screen.getByText("Add art"));
  expect(screen.getByLabelText("cart-count")).toHaveTextContent("1");
});
