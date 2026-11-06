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
import { translate } from "../../contexts/LanguageContext";

function ProductImage({ product, pt }: { product: StoreProduct; pt: boolean }) {
  const t = (key: string) => translate(key, pt ? "pt" : "en");
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
      <span>{t("store-image-unavailable")}</span>
    </div>
  );
}

export default function StoreCatalog({ pt }: { pt: boolean }) {
  const t = (key: string) => translate(key, pt ? "pt" : "en");
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
        {t("store-products-listed-by-the-store-to")}
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
            {t("store-search-the-store-catalog")}
          </span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              t("store-search-by-name-or-description")
            }
          />
        </label>
        <button className="market-button secondary" type="submit">
          {t("store-search")}
          <ArrowRight size={16} />
        </button>
      </form>
      {status === "loading" && (
        <div role="status" className="market-loading">
          <p>
            {t("store-loading-store-catalog")}
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
            {t("store-the-catalog-could-not-be-loaded")}
          </h3>
          <p>
            {t("store-please-try-again-studio-models-are")}
          </p>
          <button
            className="market-button secondary"
            onClick={() =>
              setRequest({ ...request, revision: request.revision + 1 })
            }
          >
            <RotateCw size={15} />
            {t("try-on-try-again")}
          </button>
        </div>
      )}
      {status === "ready" && (
        <>
          <p className="market-store-count" role="status">
            {data.total} {t("store-products-found")}
          </p>
          {data.products.length === 0 ? (
            <div className="market-state">
              <Glasses size={30} />
              <h3>
                {request.query
                  ? t("store-no-products-found")
                  : t("store-the-collection-is-on-its-way")}
              </h3>
              <p>
                {request.query
                  ? t("store-try-another-name-or-description")
                  : t("store-the-store-has-not-published-products")}
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
                  {t("store-clear-search")}
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
                        (t("store-store-collection"))}
                    </p>
                    <div>
                      <h3>{product.name}</h3>
                      <span>{money(product.price)}</span>
                    </div>
                    <button
                      className="market-text-link"
                      aria-label={`${t("store-view-details")} ${product.name}`}
                      onClick={() => setSelected(product)}
                    >
                      {t("store-view-details")}
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
              aria-label={t("store-catalog-pagination")}
            >
              <button
                className="market-button secondary"
                disabled={request.page <= 1}
                onClick={() =>
                  setRequest({ ...request, page: request.page - 1 })
                }
              >
                <ArrowLeft size={15} />
                {t("store-previous")}
              </button>
              <span>
                {t("store-page")} {request.page} / {data.totalPages}
              </span>
              <button
                className="market-button secondary"
                disabled={request.page >= data.totalPages}
                onClick={() =>
                  setRequest({ ...request, page: request.page + 1 })
                }
              >
                {t("store-next")}
                <ArrowRight size={15} />
              </button>
            </nav>
          )}
          <p className="market-price-note">
            {t("store-prices-in-us-dollars-usd-as")}
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
            aria-label={t("store-close-details")}
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
              (t("store-the-store-has-not-added-a"))}
          </p>
          {Number.isFinite(selected.stock) && (
            <p>
              {selected.stock! > 0
                ? t("store-in-stock")
                : t("store-currently-unavailable")}
            </p>
          )}
        </dialog>
      )}
    </div>
  );
}
