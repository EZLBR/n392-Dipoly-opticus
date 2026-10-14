import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Marketplace from "../components/Marketplace";
import { LanguageProvider } from "../contexts/LanguageContext";
import {
  fetchStorePage,
  filterModels,
  studioModels,
} from "../components/marketplace/catalog";
import { restoreStudio } from "../eyewear/storage";
import { calculateBasePrice } from "../utils/pricing";

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("opticus_language", "pt");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const mount = () => {
  const navigate = vi.fn();
  render(
    <LanguageProvider>
      <Marketplace setView={navigate} />
    </LanguageProvider>,
  );
  return navigate;
};
const response = (
  produtos = [],
  total = produtos.length,
  totalPages = produtos.length ? 1 : 0,
) => ({
  ok: true,
  json: async () => ({ success: true, produtos, total, totalPages }),
});
const storeTab = () =>
  fireEvent.click(screen.getByRole("button", { name: "Catálogo da loja" }));

describe("Marketplace discovery and Studio handoff", () => {
  it("opens the Studio, focuses the catalog and keeps the homepage free of live canvases", () => {
    const navigate = mount();
    expect(document.querySelector("canvas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Criar meu óculos" }));
    expect(navigate).toHaveBeenCalledWith("create");
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const heading = screen.getByRole("heading", {
      name: "Clássicos. Com a sua assinatura.",
    });
    heading.scrollIntoView = vi.fn();
    fireEvent.click(screen.getByRole("button", { name: "Explorar a coleção" }));
    expect(heading).toHaveFocus();
    expect(heading.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
  });
  it("combines shape/material/search and restores all models after an empty result", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Redondo" }));
    fireEvent.click(screen.getByRole("button", { name: "Acetato" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(
      screen.getByRole("heading", { name: "Luna Frame" }),
    ).toBeInTheDocument();
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar modelos" }),
      { target: { value: "nada" } },
    );
    expect(screen.getByText("Nenhum modelo por aqui")).toBeInTheDocument();
    fireEvent.click(
      screen.getAllByRole("button", { name: "Limpar filtros" })[0],
    );
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
  it("persists favorites and changes featured ordering", () => {
    mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Favoritar Titan Edge" }),
    );
    expect(
      screen.getByRole("button", { name: "Favoritar Titan Edge" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(screen.getAllByRole("article")[0]).getByRole("heading", {
        name: "Titan Edge",
      }),
    ).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("opticus_favorites")!)).toContain(
      "base-square-metal",
    );
  });
  it("passes the exact selected configuration to the Studio and preserves displayed prices", () => {
    const navigate = mount();
    localStorage.setItem("opticus_active_design_id", "previous-design");
    localStorage.setItem(
      "opticus_creator_draft",
      JSON.stringify({ source: "new", config: { frontModel: "aviator" } }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Personalizar Nova Square" }),
    );
    expect(navigate).toHaveBeenCalledWith("create");
    expect(localStorage.getItem("opticus_active_design_id")).toBeNull();
    expect(restoreStudio(localStorage).config).toEqual(studioModels[1].config);
    for (const model of studioModels)
      expect(model.price).toBe(calculateBasePrice(model.config));
    expect(studioModels.map((p) => p.price)).toEqual([180, 200, 180, 260]);
  });
  it("searches Portuguese labels without accents and sorts numerically", () => {
    expect(
      filterModels("titanio", [], [], "featured", []).map((p) => p.name),
    ).toEqual(["Titan Edge"]);
    expect(
      filterModels("", [], [], "price-desc", []).map((p) => p.price),
    ).toEqual([260, 200, 180, 180]);
    expect(
      filterModels("", [], ["metal"], "featured", []).map((p) => p.name),
    ).toEqual(["Aero Round"]);
  });
  it("renders the same entry points in English and survives malformed favorite storage", () => {
    localStorage.setItem("opticus_language", "en");
    localStorage.setItem("opticus_favorites", '{"invalid":true}');
    mount();
    expect(
      screen.getByRole("button", { name: "Create my eyewear" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Search models" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
});

describe("Store catalog states", () => {
  it("loads only on demand and shows a genuine empty catalog", async () => {
    let resolve: (value: unknown) => void;
    const fetch = vi.fn(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    vi.stubGlobal("fetch", fetch);
    mount();
    expect(fetch).not.toHaveBeenCalled();
    storeTab();
    expect(
      screen.getByText("Carregando catálogo da loja..."),
    ).toBeInTheDocument();
    resolve!(response());
    expect(
      await screen.findByText("A coleção está chegando"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Nova Square" })).toBeNull();
  });
  it("recovers from an API error through retry", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce(
        response([{ id: 1, nome: "Armação da loja", preco: "230.50" }]),
      );
    vi.stubGlobal("fetch", fetch);
    mount();
    storeTab();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Não foi possível carregar o catálogo",
    );
    fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    expect(
      await screen.findByRole("heading", { name: "Armação da loja" }),
    ).toBeInTheDocument();
    expect(screen.getByText("US$ 230,50")).toBeInTheDocument();
  });
  it("keeps the server search in pagination and aborts requests when leaving the store", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        response([{ id: 1, nome: "Solar", preco: 220 }], 13, 2),
      );
    vi.stubGlobal("fetch", fetch);
    mount();
    storeTab();
    await screen.findByRole("heading", { name: "Solar" });
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Buscar no catálogo da loja" }),
      { target: { value: "solar" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));
    await screen.findByRole("heading", { name: "Solar" });
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() =>
      expect(fetch.mock.lastCall![0]).toContain("page=2&limit=12&search=solar"),
    );
    const signal = fetch.mock.lastCall![1].signal;
    fireEvent.click(screen.getByRole("button", { name: /Modelos do Studio/ }));
    expect(signal.aborted).toBe(true);
    expect(screen.getAllByRole("article")).toHaveLength(4);
  });
  it("rejects a malformed API response rather than displaying a fake empty state", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({
          ok: true,
          json: async () => ({ success: true, products: [] }),
        }),
    );
    await expect(
      fetchStorePage(1, "", new AbortController().signal),
    ).rejects.toThrow("Invalid catalog response");
  });
});
