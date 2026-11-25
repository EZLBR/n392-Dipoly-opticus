// ============================================================
//   CART-01 (#115) — carrinho da conta no frontend
//
//   O carrinho vem da API, por conta. Os testes cobrem: carga por
//   sessão, CRUD refletindo o servidor, isolamento entre contas
//   (inclusive respostas atrasadas), carrinho legado sem dono, falhas
//   de servidor e de rede e checkout com o carrinho atual.
// ============================================================

import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Cart from "../components/Cart";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { CartProvider, LEGACY_CART_KEY, useCart } from "../contexts/CartContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { normalizeConfig } from "../eyewear/config";
import { fakeCartApi } from "./cart-api";

vi.mock("../components/ThreePreview", () => ({ default: () => null })); // jsdom não tem WebGL.

const USERS = {
  "token-a": { publicId: "user-a", name: "Ana", email: "ana@example.com", role: "client" },
  "token-b": { publicId: "user-b", name: "Bruno", email: "bruno@example.com", role: "client" },
};

const frame = (color = "#382016") => ({
  id: "ignored-by-server",
  productName: "Round frame",
  factoryName: "Demo Factory",
  total: 1,
  customSpecs: normalizeConfig({ color }),
});

/** Botões de teste para as ações que outras telas disparam. */
function Controls() {
  const { addToCart, status } = useCart();
  const { login, logout, session } = useAuth();
  const [message, setMessage] = React.useState("");
  return <>
    <output aria-label="session">{session?.publicId ?? "none"}</output>
    <output aria-label="cart-status">{status}</output>
    <output aria-label="add-result">{message}</output>
    <button onClick={async () => { const r = await addToCart(frame()); setMessage(r.ok ? "ok" : r.error); }}>Add frame</button>
    <button onClick={async () => { const r = await addToCart(frame("#000000")); setMessage(r.ok ? "ok" : r.error); }}>Add black frame</button>
    <button onClick={() => logout()}>Logout</button>
    <button onClick={() => void login("bruno@example.com", "x")}>Login B</button>
  </>;
}

function renderCart() {
  return render(
    <AuthProvider><CartProvider><LanguageProvider>
      <Controls />
      <Cart setView={() => {}} />
    </LanguageProvider></CartProvider></AuthProvider>,
  );
}

const itemNames = () => Array.from(document.querySelectorAll(".cart-item h3")).map(h => h.textContent);
/** Algum texto da tela tem este valor (o formato da moeda depende do idioma). */
const showsAmount = (amount: string) => screen.getAllByText(new RegExp(amount.replace(".", "[.,]"))).length > 0;

beforeEach(() => localStorage.setItem("opticus_token", "token-a"));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

it("carrega o carrinho da conta pela API, com o subtotal do servidor", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Aviator", 2);
  renderCart();

  expect(await screen.findByText("Aviator")).toBeInTheDocument();
  expect(showsAmount("420.00")).toBe(true);
});

it("o carrinho legado opticus_cart, sem dono, não é associado à conta e é apagado", async () => {
  localStorage.setItem(LEGACY_CART_KEY, JSON.stringify([{ id: "legacy", productName: "Old frame", total: 1, quantity: 1, customSpecs: {} }]));
  const api = fakeCartApi(USERS);
  renderCart();

  await waitFor(() => expect(screen.getByLabelText("cart-status")).toHaveTextContent("ready"));
  expect(screen.queryByText("Old frame")).not.toBeInTheDocument();
  expect(localStorage.getItem(LEGACY_CART_KEY)).toBeNull();
  expect(api.fetch.mock.calls.some(([, init]) => String(init?.body ?? "").includes("Old frame"))).toBe(false);
});

it("adicionar, alterar e remover passam pelo servidor e mostram o que ele devolveu", async () => {
  const api = fakeCartApi(USERS);
  renderCart();
  await waitFor(() => expect(screen.getByLabelText("cart-status")).toHaveTextContent("ready"));

  fireEvent.click(screen.getByText("Add frame"));
  expect(await screen.findByText("Round frame")).toBeInTheDocument();
  expect(api.serverCart("user-a")).toEqual([expect.objectContaining({ productName: "Round frame", quantity: 1 })]);

  // A mesma configuração soma; outra configuração do mesmo modelo é outro item.
  fireEvent.click(screen.getByText("Add frame"));
  fireEvent.click(screen.getByText("Add black frame"));
  await waitFor(() => expect(api.serverCart("user-a").map(l => l.quantity)).toEqual([2, 1]));
  await waitFor(() => expect(itemNames()).toEqual(["Round frame", "Round frame"]));

  fireEvent.click(screen.getAllByRole("button", { name: "Increase quantity" })[0]);
  await waitFor(() => expect(api.serverCart("user-a")[0].quantity).toBe(3));
  await waitFor(() => expect(showsAmount("840.00")).toBe(true));

  fireEvent.click(screen.getAllByRole("button", { name: "Remove item" })[1]);
  await waitFor(() => expect(api.serverCart("user-a")).toHaveLength(1));
  await waitFor(() => expect(itemNames()).toEqual(["Round frame"]));
});

it("conta A → logout → conta B: nenhum item de A aparece para B", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Ana's frame");
  api.addOnServer("user-b", "Bruno's frame");
  renderCart();
  expect(await screen.findByText("Ana's frame")).toBeInTheDocument();

  fireEvent.click(screen.getByText("Logout"));
  await waitFor(() => expect(screen.queryByText("Ana's frame")).not.toBeInTheDocument());

  fireEvent.click(screen.getByText("Login B"));
  expect(await screen.findByText("Bruno's frame")).toBeInTheDocument();
  expect(screen.queryByText("Ana's frame")).not.toBeInTheDocument();

  // B adiciona: o item vai para o carrinho de B, nunca para o de A.
  fireEvent.click(screen.getByText("Add frame"));
  await waitFor(() => expect(api.serverCart("user-b")).toHaveLength(2));
  expect(api.serverCart("user-a").map(l => l.productName)).toEqual(["Ana's frame"]);
});

it("a resposta atrasada do carrinho de A, chegando depois da troca para B, é descartada", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Ana's frame");
  api.addOnServer("user-b", "Bruno's frame");
  const releaseA = api.hold("GET", "/cart");
  renderCart();
  await waitFor(() => expect(screen.getByLabelText("session")).toHaveTextContent("user-a"));

  fireEvent.click(screen.getByText("Logout"));
  fireEvent.click(screen.getByText("Login B"));
  expect(await screen.findByText("Bruno's frame")).toBeInTheDocument();

  await act(async () => { releaseA(); await new Promise(r => setTimeout(r, 20)); });
  expect(screen.queryByText("Ana's frame")).not.toBeInTheDocument();
  expect(screen.getByText("Bruno's frame")).toBeInTheDocument();
});

it("uma adição de A que termina depois da troca para B não aparece no carrinho de B", async () => {
  const api = fakeCartApi(USERS);
  renderCart();
  await waitFor(() => expect(screen.getByLabelText("cart-status")).toHaveTextContent("ready"));

  const release = api.hold("POST", "/cart/items");
  fireEvent.click(screen.getByText("Add frame"));
  fireEvent.click(screen.getByText("Logout"));
  fireEvent.click(screen.getByText("Login B"));
  await waitFor(() => expect(screen.getByLabelText("session")).toHaveTextContent("user-b"));

  await act(async () => { release(); await new Promise(r => setTimeout(r, 20)); });
  expect(screen.queryByText("Round frame")).not.toBeInTheDocument();
  expect(screen.getByLabelText("add-result")).not.toHaveTextContent("ok");
});

it("falha do servidor ao adicionar não mostra o item nem confirma o salvamento", async () => {
  const api = fakeCartApi(USERS);
  renderCart();
  await waitFor(() => expect(screen.getByLabelText("cart-status")).toHaveTextContent("ready"));

  api.failNext("POST", "/cart/items");
  fireEvent.click(screen.getByText("Add frame"));
  await waitFor(() => expect(screen.getByLabelText("add-result")).not.toHaveTextContent(""));
  expect(screen.getByLabelText("add-result")).not.toHaveTextContent("ok");
  expect(screen.queryByText("Round frame")).not.toBeInTheDocument();
  expect(screen.getByText("Your shopping cart is empty.")).toBeInTheDocument();
});

it("falha ao alterar a quantidade avisa e mantém a quantidade do servidor", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Aviator");
  renderCart();
  expect(await screen.findByText("Aviator")).toBeInTheDocument();

  api.failNext("PATCH", "/cart/items", "network");
  fireEvent.click(screen.getByRole("button", { name: "Increase quantity" }));
  expect(await screen.findByText(/did not respond|offline/)).toBeInTheDocument();
  expect(api.serverCart("user-a")[0].quantity).toBe(1);
  expect(showsAmount("210.00")).toBe(true);
});

it("falha ao carregar mostra o erro e permite tentar de novo", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Aviator");
  api.failNext("GET", "/cart", "network");
  renderCart();

  expect(await screen.findByText("We couldn't load your cart.")).toBeInTheDocument();
  expect(screen.queryByText("Your shopping cart is empty.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(await screen.findByText("Aviator")).toBeInTheDocument();
});

it("sem rede, a mensagem diz que está offline", async () => {
  const api = fakeCartApi(USERS);
  api.failNext("GET", "/cart", "network");
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  renderCart();
  expect(await screen.findByText(/You are offline/)).toBeInTheDocument();
});

it("o checkout manda o carrinho que está na tela e marca os itens como pagamento em andamento", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Aviator", 2);
  const assign = vi.fn();
  vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, set href(url: string) { assign(url); } } as unknown as Location);
  renderCart();
  expect(await screen.findByText("Aviator")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /PIX/i }));
  await waitFor(() => expect(assign).toHaveBeenCalledWith("https://gateway.invalid/pay/bill_1"));
  expect(api.checkouts).toEqual([{ token: "token-a", items: [{ publicId: api.serverCart("user-a")[0].publicId, quantity: 2 }] }]);
  // O item continua no carrinho até a confirmação do pagamento.
  expect(await screen.findByText(/Payment in progress/)).toBeInTheDocument();
});

it("carrinho mudado em outra aba: o checkout recusa (409), avisa e recarrega o carrinho atual", async () => {
  const api = fakeCartApi(USERS);
  api.addOnServer("user-a", "Aviator");
  const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
  renderCart();
  expect(await screen.findByText("Aviator")).toBeInTheDocument();

  api.addOnServer("user-a", "Added in another tab");
  fireEvent.click(screen.getByRole("button", { name: /PIX/i }));

  await waitFor(() => expect(alert).toHaveBeenCalledWith("Your cart changed in another tab or device. Review the items before paying."));
  expect(await screen.findByText("Added in another tab")).toBeInTheDocument();
});
