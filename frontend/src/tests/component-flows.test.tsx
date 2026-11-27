import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import AuthPage from "../components/AuthPage";
import Cart from "../components/Cart";
import { AuthProvider } from "../contexts/AuthContext";
import { CartProvider, useCart } from "../contexts/CartContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { fakeCartApi } from "./cart-api";

vi.mock("../components/ThreePreview", () => ({ default: () => null })); // jsdom has no WebGL.

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("validates the login form and shows an RFC 9457 credential rejection without losing the form", async () => {
  const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(
    JSON.stringify({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
      detail: "Email ou senha incorretos.",
    }),
    { status: 400, headers: { "Content-Type": "application/problem+json" } },
  ));
  render(<MemoryRouter><AuthProvider><LanguageProvider><AuthPage /></LanguageProvider></AuthProvider></MemoryRouter>);

  const email = screen.getByLabelText("Email address") as HTMLInputElement;
  const password = screen.getByLabelText("Password") as HTMLInputElement;
  const enter = screen.getByRole("button", { name: "ENTER OPTICUS" });
  expect(email).toBeInvalid();
  expect(password).toBeInvalid();
  fireEvent.change(email, { target: { value: "invalid" } });
  expect(email.validity.typeMismatch).toBe(true);
  fireEvent.click(enter);
  expect(fetch).not.toHaveBeenCalled();

  fireEvent.change(email, { target: { value: "customer@example.com" } });
  fireEvent.change(password, { target: { value: "incorrect" } });
  fireEvent.click(enter);
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid email or password.");
  expect(enter).toBeEnabled();
  expect(email).toHaveValue("customer@example.com");
});

function AddFrame() {
  const { addToCart, status } = useCart();
  return <button disabled={status !== "ready"} onClick={() => void addToCart({ id: "frame", productName: "Round frame", total: 159, customSpecs: {} })}>
    Add frame
  </button>;
}

it("reflects adding, updating and removing an item with the real cart provider", async () => {
  // CART-01: o provider fala com a API do carrinho da conta.
  localStorage.setItem("opticus_token", "token-a");
  const api = fakeCartApi({ "token-a": { publicId: "user-a", name: "Ana", email: "ana@example.com", role: "client" } });
  render(
    <AuthProvider><CartProvider><LanguageProvider>
      <AddFrame />
      <Cart setView={() => {}} />
    </LanguageProvider></CartProvider></AuthProvider>,
  );

  expect(await screen.findByText("Your shopping cart is empty.")).toBeInTheDocument();
  const add = screen.getByRole("button", { name: "Add frame" });
  await waitFor(() => expect(add).toBeEnabled());
  fireEvent.click(add);
  expect(await screen.findByText("Round frame")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
  await waitFor(() => expect(api.serverCart("user-a")).toEqual([expect.objectContaining({ quantity: 2 })]));
  await waitFor(() => expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeEnabled());
  fireEvent.click(screen.getByRole("button", { name: "Decrease quantity" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Decrease quantity" })).toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Remove item" }));
  expect(await screen.findByText("Your shopping cart is empty.")).toBeInTheDocument();
  expect(localStorage.getItem("opticus_cart")).toBeNull();
});
