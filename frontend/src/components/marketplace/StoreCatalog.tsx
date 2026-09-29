import React, { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Glasses,
  RotateCw,
  Search,
  X,
} from "lucide-react";
import { fetchStorePage, type StorePage, type StoreProduct } from "./catalog";

function ProductImage({ product, pt }: { product: StoreProduct; pt: boolean }) {
  const [failed, setFailed] = useState(false);
  return product.image && !failed ? (
    <img
      src={product.image}
      alt={product.name}
      width="600"
      height="480"
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  ) : (
    <div className="market-image-placeholder">
      <Glasses size={44} strokeWidth={1} />
      <span>{pt ? "Imagem indisponível" : "Image unavailable"}</span>
    </div>
  );
}

export default function StoreCatalog({ pt }: { pt: boolean }) {
  const [search, setSearch] = useState("");
  const [request, setRequest] = useState({ page: 1, query: "", revision: 0 });
  const [data, setData] = useState<StorePage>({
    products: [],
    total: 0,
    totalPages: 0,
  });
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [selected, setSelected] = useState<StoreProduct | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const money = (value: number) =>
    new Intl.NumberFormat(pt ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const timeout = setTimeout(() => controller.abort(), 12000);
    setStatus("loading");
    fetchStorePage(request.page, request.query, controller.signal)
      .then((result) => {
        if (!disposed) {
          setData(result);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!disposed) setStatus("error");
      })
      .finally(() => clearTimeout(timeout));
    return () => {
      disposed = true;
      controller.abort();
      clearTimeout(timeout);
    };
  }, [request]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open)
      dialog.current.showModal();
  }, [selected]);
  return (
    <div className="market-store">
      <p className="market-catalog-intro">
        {pt
          ? "Produtos cadastrados pela loja. Para criar sua própria armação, explore os modelos do Studio."
          : "Products listed by the store. To create your own frame, explore the Studio models."}
      </p>
      <form
        className="market-toolbar"
        onSubmit={(e) => {
          e.preventDefault();
          setRequest({
            page: 1,
            query: search.trim(),
            revision: request.revision + 1,
          });
        }}
      >
        <label className="market-search">
          <Search size={17} />
          <span className="market-sr-only">
            {pt ? "Buscar no catálogo da loja" : "Search the store catalog"}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              pt
                ? "Buscar por nome ou descrição..."
                : "Search by name or description..."
            }
          />
        </label>
        <button className="market-button secondary" type="submit">
          {pt ? "Buscar" : "Search"}
          <ArrowRight size={16} />
        </button>
      </form>
      {status === "loading" && (
        <div role="status" className="market-loading">
          <p>
            {pt ? "Carregando catálogo da loja..." : "Loading store catalog..."}
          </p>
          <div className="market-grid" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div className="market-skeleton" key={i} />
            ))}
          </div>
        </div>
      )}
      {status === "error" && (
        <div className="market-state" role="alert">
          <Glasses size={30} />
          <h3>
            {pt
              ? "Não foi possível carregar o catálogo"
              : "The catalog could not be loaded"}
          </h3>
          <p>
            {pt
              ? "Tente novamente. Os modelos do Studio continuam disponíveis na outra aba."
              : "Please try again. Studio models are still available in the other tab."}
          </p>
          <button
            className="market-button secondary"
            onClick={() =>
              setRequest({ ...request, revision: request.revision + 1 })
            }
          >
            <RotateCw size={15} />
            {pt ? "Tentar novamente" : "Try again"}
          </button>
        </div>
      )}
      {status === "ready" && (
        <>
          <p className="market-store-count" role="status">
            {data.total} {pt ? "produtos encontrados" : "products found"}
          </p>
          {data.products.length === 0 ? (
            <div className="market-state">
              <Glasses size={30} />
              <h3>
                {request.query
                  ? pt
                    ? "Nenhum produto encontrado"
                    : "No products found"
                  : pt
                    ? "A coleção está chegando"
                    : "The collection is on its way"}
              </h3>
              <p>
                {request.query
                  ? pt
                    ? "Tente buscar por outro nome ou descrição."
                    : "Try another name or description."
                  : pt
                    ? "A loja ainda não publicou produtos. Você já pode explorar os modelos do Studio."
                    : "The store has not published products yet. You can already explore the Studio models."}
              </p>
              {request.query && (
                <button
                  className="market-button secondary"
                  onClick={() => {
                    setSearch("");
                    setRequest({
                      page: 1,
                      query: "",
                      revision: request.revision + 1,
                    });
                  }}
                >
                  {pt ? "Limpar busca" : "Clear search"}
                </button>
              )}
            </div>
          ) : (
            <div className="market-grid">
              {data.products.map((product) => (
                <article className="market-card" key={product.id}>
                  <div className="market-card-image store">
                    <ProductImage
                      key={product.image}
                      product={product}
                      pt={pt}
                    />
                  </div>
                  <div className="market-card-info">
                    <p>
                      {product.category ||
                        (pt ? "Coleção da loja" : "Store collection")}
                    </p>
                    <div>
                      <h3>{product.name}</h3>
                      <span>{money(product.price)}</span>
                    </div>
                    <button
                      className="market-text-link"
                      aria-label={`${pt ? "Ver detalhes" : "View details"} ${product.name}`}
                      onClick={() => setSelected(product)}
                    >
                      {pt ? "Ver detalhes" : "View details"}
                      <ArrowRight size={15} />
                      <span className="market-sr-only"> {product.name}</span>
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
          {data.totalPages > 1 && (
            <nav
              className="market-pagination"
              aria-label={pt ? "Paginação do catálogo" : "Catalog pagination"}
            >
              <button
                className="market-button secondary"
                disabled={request.page <= 1}
                onClick={() =>
                  setRequest({ ...request, page: request.page - 1 })
                }
              >
                <ArrowLeft size={15} />
                {pt ? "Anterior" : "Previous"}
              </button>
              <span>
                {pt ? "Página" : "Page"} {request.page} / {data.totalPages}
              </span>
              <button
                className="market-button secondary"
                disabled={request.page >= data.totalPages}
                onClick={() =>
                  setRequest({ ...request, page: request.page + 1 })
                }
              >
                {pt ? "Próxima" : "Next"}
                <ArrowRight size={15} />
              </button>
            </nav>
          )}
          <p className="market-price-note">
            {pt
              ? "Valores em dólares (USD), conforme o catálogo da loja."
              : "Prices in US dollars (USD), as listed by the store."}
          </p>
        </>
      )}
      {selected && (
        <dialog
          className="market-dialog"
          ref={dialog}
          aria-labelledby="store-product-title"
          onCancel={() => setSelected(null)}
          onClose={() => setSelected(null)}
        >
          <button
            autoFocus
            className="market-dialog-close"
            onClick={() => dialog.current?.close()}
            aria-label={pt ? "Fechar detalhes" : "Close details"}
          >
            <X size={20} />
          </button>
          <div className="market-card-image store">
            <ProductImage key={selected.image} product={selected} pt={pt} />
          </div>
          <span className="market-eyebrow">{selected.category}</span>
          <h2 id="store-product-title">{selected.name}</h2>
          <p className="market-detail-price">{money(selected.price)}</p>
          <p>
            {selected.description ||
              (pt
                ? "A loja ainda não adicionou uma descrição para este produto."
                : "The store has not added a description for this product yet.")}
          </p>
          {Number.isFinite(selected.stock) && (
            <p>
              {selected.stock! > 0
                ? pt
                  ? "Em estoque"
                  : "In stock"
                : pt
                  ? "Indisponível no momento"
                  : "Currently unavailable"}
            </p>
          )}
        </dialog>
      )}
    </div>
  );
}
