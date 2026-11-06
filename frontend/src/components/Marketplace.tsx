import React, { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Box,
  Check,
  Glasses,
  Heart,
  Layers,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useTranslation } from "../contexts/LanguageContext";
import { readJSON } from "../eyewear/storage";
import {
  filterModels,
  studioModels,
  shapeLabel,
  materialLabel,
  type StudioModel,
} from "./marketplace/catalog";
import StoreCatalog from "./marketplace/StoreCatalog";
import "./marketplace/marketplace.css";

export default function Marketplace({
  setView,
}: {
  setView: (view: string) => void;
}) {
  const { language, t } = useTranslation();
  const pt = language === "pt";
  const [source, setSource] = useState<"studio" | "store">("studio");
  const [query, setQuery] = useState("");
  const [shapes, setShapes] = useState<string[]>([]);
  const [materials, setMaterials] = useState<string[]>([]);
  const [sort, setSort] = useState("featured");
  const [favorites, setFavorites] = useState<string[]>(() =>
    readJSON(localStorage, "opticus_favorites", []).filter(
      (id: unknown) => typeof id === "string",
    ),
  );
  const [storageError, setStorageError] = useState(false);
  const catalogHeading = useRef<HTMLHeadingElement>(null);
  const money = (value: number) =>
    new Intl.NumberFormat(pt ? "pt-BR" : "en-US", {
      style: "currency",
      currency: "USD",
    }).format(value);
  const products = filterModels(query, shapes, materials, sort, favorites);
  const hasFilters = !!(query || shapes.length || materials.length);
  useEffect(() => {
    document.body.classList.add("opticus-home");
    return () => document.body.classList.remove("opticus-home");
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("opticus_favorites", JSON.stringify(favorites));
    } catch {
      setStorageError(true);
    }
  }, [favorites]);
  function openModel(model: StudioModel) {
    try {
      localStorage.setItem(
        "opticus_active_product_config",
        JSON.stringify({ id: model.id, config: model.config }),
      );
      localStorage.setItem("opticus_active_product", model.id);
      localStorage.removeItem("opticus_active_design");
      localStorage.removeItem("opticus_active_design_id");
      setView("create");
    } catch {
      setStorageError(true);
    }
  }
  function clearFilters() {
    setQuery("");
    setShapes([]);
    setMaterials([]);
    setSort("featured");
  }
  function jumpToCatalog() {
    catalogHeading.current?.focus({ preventScroll: true });
    catalogHeading.current?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  const benefits = [
    {
      Icon: Glasses,
      title: t("market-your-way-to-express-yourself"),
      text: t("market-combine-silhouettes-colors-and-finishes"),
    },
    {
      Icon: Box,
      title: t("market-every-angle-every-detail"),
      text: t("market-rotate-and-explore-your-frame-in"),
    },
    {
      Icon: Layers,
      title: t("market-a-creation-you-can-return-to"),
      text: t("market-save-your-design-and-pick-up"),
    },
  ];
  return (
    <div className="market-home">
      <a className="market-skip" href="#catalog-title">
        {t("market-skip-to-catalog")}
      </a>
      <section className="market-hero" aria-labelledby="market-title">
        <div className="market-hero-copy">
          <span className="market-eyebrow">
            <span className="market-dot" />{" "}
            {t("market-your-vision-your-creation")}
          </span>
          <h1 id="market-title">
            {t("market-a-new-way")} <br />
            {t("market-to-see")} <br />
            <em>{t("market-your-way")}</em>
          </h1>
          <p>
            {t("market-choose-a-shape-explore-materials-and")}
          </p>
          <div className="market-actions">
            <button
              className="market-button primary"
              onClick={() => setView("create")}
            >
              {t("market-create-my-eyewear")}
              <ArrowUpRight size={18} />
            </button>
            <button className="market-button secondary" onClick={jumpToCatalog}>
              {t("market-explore-the-collection")}
              <ArrowDown size={16} />
            </button>
          </div>
          <div className="market-hero-footnote">
            <Box size={16} />
            <span>
              {t("market-real-time-3d-preview")}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {t("market-start-without-an-account")}
            </span>
          </div>
        </div>
        <div className="market-hero-visual">
          <div className="market-visual-top">
            <span>{t("brand-atelier")}</span>
            <span>01 — {t("market-form-study")}</span>
          </div>
          <img
            className="market-hero-image"
            src="/eyewear/hero-wayfarer.png"
            width="1000"
            height="780"
            fetchPriority="high"
            alt={
              t("market-three-quarter-view-of-a-tortoiseshell")
            }
          />
          <span className="market-material-tag">
            <span aria-hidden="true" />
            {t("market-acetate-texture-character")}
          </span>
          <div className="market-visual-bottom">
            <div>
              <span className="market-eyebrow">
                {t("market-a-starting-point")}
              </span>
              <h2>Wayfarer</h2>
            </div>
            <button
              className="market-round-link"
              onClick={() => openModel(studioModels[1])}
              aria-label={
                t("market-explore-the-model-in-the-3d")
              }
            >
              <ArrowUpRight size={26} />
            </button>
          </div>
        </div>
      </section>
      <section
        className="market-benefits"
        aria-label={
          t("market-why-create-with-opticus")
        }
      >
        {benefits.map(({ Icon, title, text }) => (
          <div key={title}>
            <Icon size={23} strokeWidth={1.4} />
            <div>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </div>
        ))}
      </section>
      <section className="market-collection" aria-labelledby="catalog-title">
        <div className="market-section-heading">
          <div>
            <span className="market-eyebrow">
              {t("market-find-your-starting-point")}
            </span>
            <h2 id="catalog-title" ref={catalogHeading} tabIndex={-1}>
              {t("market-classics-with-your-signature")}
            </h2>
          </div>
          <button
            className="market-text-link"
            onClick={() => setView("designs")}
          >
            {t("market-my-designs")}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div
          className="market-source"
          role="group"
          aria-label={t("market-catalog-source")}
        >
          <button
            aria-pressed={source === "studio"}
            onClick={() => setSource("studio")}
          >
            {t("market-studio-models")}
            <span>04</span>
          </button>
          <button
            aria-pressed={source === "store"}
            onClick={() => setSource("store")}
          >
            {t("market-store-catalog")}
          </button>
        </div>
        {source === "studio" ? (
          <>
            <div className="market-toolbar">
              <label className="market-search">
                <Search size={17} />
                <span className="market-sr-only">
                  {t("market-search-models")}
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    t("market-name-shape-or-material")
                  }
                />
              </label>
              <label className="market-sort">
                <span>{t("market-sort-by")}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="featured">
                    {t("market-featured")}
                  </option>
                  <option value="price-asc">
                    {t("market-price-low-to-high")}
                  </option>
                  <option value="price-desc">
                    {t("market-price-high-to-low")}
                  </option>
                  <option value="name-asc">
                    {t("market-name-a-z")}
                  </option>
                </select>
              </label>
            </div>
            <div className="market-filters">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <fieldset>
                <legend className="market-sr-only">
                  {t("market-shape")}
                </legend>
                {["round", "square"].map((shape) => (
                  <button
                    key={shape}
                    aria-pressed={shapes.includes(shape)}
                    onClick={() => setShapes(toggle(shapes, shape))}
                  >
                    {shapes.includes(shape) && <Check size={12} />}
                    {shapeLabel(shape, pt)}
                  </button>
                ))}
              </fieldset>
              <span className="market-filter-divider" />
              <fieldset>
                <legend className="market-sr-only">{t("market-material")}</legend>
                {["acetate", "metal", "titanium"].map((material) => (
                  <button
                    key={material}
                    aria-pressed={materials.includes(material)}
                    onClick={() => setMaterials(toggle(materials, material))}
                  >
                    {materials.includes(material) && <Check size={12} />}
                    {materialLabel(material, pt)}
                  </button>
                ))}
              </fieldset>
              {hasFilters && (
                <button className="market-clear" onClick={clearFilters}>
                  <X size={13} />
                  {t("market-clear-filters")}
                </button>
              )}
              <span className="market-result-count" role="status">
                {products.length} {t("market-models")}
              </span>
            </div>
            <div className="market-grid">
              {products.map((p, index) => (
                <article className="market-card" key={p.id}>
                  <div className="market-card-image">
                    <img
                      src={p.image}
                      width="1000"
                      height="780"
                      loading="lazy"
                      decoding="async"
                      alt={`${p.name} — ${shapeLabel(p.shape, pt)}, ${materialLabel(p.material, pt)}`}
                    />
                    <span className="market-card-number">
                      0{index + 1} / OPTICUS
                    </span>
                    <button
                      className="market-favorite"
                      aria-pressed={favorites.includes(p.id)}
                      aria-label={`${t("market-favorite")} ${p.name}`}
                      onClick={() => setFavorites(toggle(favorites, p.id))}
                    >
                      <Heart
                        size={17}
                        fill={
                          favorites.includes(p.id) ? "currentColor" : "none"
                        }
                      />
                    </button>
                    <button
                      className="market-card-open"
                      onClick={() => openModel(p)}
                      aria-label={`${t("market-view")} ${p.name} ${t("market-in-3d")}`}
                    >
                      <Box size={14} />
                      {t("market-view-in-3d")}
                    </button>
                  </div>
                  <div className="market-card-info">
                    <p>
                      {shapeLabel(p.shape, pt)}{" "}
                      <span aria-hidden="true">/</span>{" "}
                      {materialLabel(p.material, pt)}
                    </p>
                    <div>
                      <h3>{p.name}</h3>
                      <span>{money(p.price)}</span>
                    </div>
                    <button
                      className="market-text-link"
                      aria-label={`${t("market-customize")} ${p.name}`}
                      onClick={() => openModel(p)}
                    >
                      {t("market-customize")}
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {products.length === 0 && (
              <div className="market-state" role="status">
                <Search size={28} />
                <h3>{t("market-no-models-found")}</h3>
                <p>
                  {t("market-try-another-search-or-remove-a")}
                </p>
                <button
                  className="market-button secondary"
                  onClick={clearFilters}
                >
                  {t("market-clear-filters")}
                </button>
              </div>
            )}
            <p className="market-price-note">
              {t("market-prices-in-us-dollars-usd-your")}
            </p>
          </>
        ) : (
          <StoreCatalog pt={pt} />
        )}
        {storageError && (
          <p className="market-storage-warning" role="alert">
            {t("market-your-browser-could-not-save-your")}
          </p>
        )}
      </section>
      <section className="market-process" aria-labelledby="process-title">
        <div>
          <span className="market-eyebrow">
            {t("market-from-first-idea-to-your-bag")}
          </span>
          <h2 id="process-title">
            {t("market-you-imagine-it")}
            <br />
            <em>{t("market-the-studio-shapes-it")}</em>
          </h2>
          <button
            className="market-button primary"
            onClick={() => setView("create")}
          >
            {t("market-explore-the-creator-studio")}
            <ArrowRight size={17} />
          </button>
        </div>
        <ol>
          {[
            [
              t("market-choose-a-starting-point"),
              t("market-find-a-silhouette-that-feels-like"),
            ],
            [
              t("market-make-it-yours"),
              t("market-explore-materials-colors-and-components-see"),
            ],
            [
              t("market-review-and-make-it-happen"),
              t("market-check-the-details-save-your-creation"),
            ],
          ].map(([title, description], i) => (
            <li key={title}>
              <span>0{i + 1}</span>
              <div>
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <footer className="market-footer">
        <div>
          <a href="/" className="market-wordmark">
            OPTICUS<span>®</span>
          </a>
          <p>
            {t("market-a-vision-shaped-by-choices")}
          </p>
        </div>
        <nav aria-label={t("market-footer-links")}>
          <button onClick={jumpToCatalog}>
            {t("market-collection")}
          </button>
          <button onClick={() => setView("create")}>{t("brand-studio")}</button>
          <button onClick={() => setView("designs")}>
            {t("market-my-designs")}
          </button>
        </nav>
        <span>© {new Date().getFullYear()} Opticus · Dipoly</span>
      </footer>
    </div>
  );
}
