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
  const { language } = useTranslation();
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
      title: pt ? "Sua forma de se expressar" : "Your way to express yourself",
      text: pt
        ? "Combine silhuetas, cores e acabamentos."
        : "Combine silhouettes, colors and finishes.",
    },
    {
      Icon: Box,
      title: pt ? "Cada ângulo, cada detalhe" : "Every angle, every detail",
      text: pt
        ? "Gire e explore sua armação em 3D."
        : "Rotate and explore your frame in 3D.",
    },
    {
      Icon: Layers,
      title: pt ? "Uma criação que continua" : "A creation you can return to",
      text: pt
        ? "Salve seu design e retome quando quiser."
        : "Save your design and pick up where you left off.",
    },
  ];
  return (
    <div className="market-home">
      <a className="market-skip" href="#catalog-title">
        {pt ? "Pular para o catálogo" : "Skip to catalog"}
      </a>
      <section className="market-hero" aria-labelledby="market-title">
        <div className="market-hero-copy">
          <span className="market-eyebrow">
            <span className="market-dot" />{" "}
            {pt ? "SEU OLHAR. SUA CRIAÇÃO." : "YOUR VISION. YOUR CREATION."}
          </span>
          <h1 id="market-title">
            {pt ? "Um novo jeito" : "A new way"} <br />
            {pt ? "de ver." : "to see."} <br />
            <em>{pt ? "Do seu jeito." : "Your way."}</em>
          </h1>
          <p>
            {pt
              ? "Escolha a forma, descubra materiais e crie sua armação no Studio 3D. Veja cada detalhe antes de levar sua criação para a sacola."
              : "Choose a shape, explore materials and create your frame in the 3D Studio. See every detail before adding your creation to the bag."}
          </p>
          <div className="market-actions">
            <button
              className="market-button primary"
              onClick={() => setView("create")}
            >
              {pt ? "Criar meu óculos" : "Create my eyewear"}
              <ArrowUpRight size={18} />
            </button>
            <button className="market-button secondary" onClick={jumpToCatalog}>
              {pt ? "Explorar a coleção" : "Explore the collection"}
              <ArrowDown size={16} />
            </button>
          </div>
          <div className="market-hero-footnote">
            <Box size={16} />
            <span>
              {pt ? "Prévia 3D em tempo real" : "Real-time 3D preview"}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              {pt ? "Comece sem cadastro" : "Start without an account"}
            </span>
          </div>
        </div>
        <div className="market-hero-visual">
          <div className="market-visual-top">
            <span>OPTICUS / ATELIER</span>
            <span>01 — {pt ? "ESTUDO DE FORMA" : "FORM STUDY"}</span>
          </div>
          <img
            className="market-hero-image"
            src="/eyewear/hero-wayfarer.png"
            width="1000"
            height="780"
            fetchPriority="high"
            alt={
              pt
                ? "Armação Wayfarer em acetato tartaruga, vista em três quartos"
                : "Three-quarter view of a tortoiseshell acetate Wayfarer frame"
            }
          />
          <span className="market-material-tag">
            <span aria-hidden="true" />
            {pt
              ? "Acetato. Textura. Personalidade."
              : "Acetate. Texture. Character."}
          </span>
          <div className="market-visual-bottom">
            <div>
              <span className="market-eyebrow">
                {pt ? "UM PONTO DE PARTIDA" : "A STARTING POINT"}
              </span>
              <h2>Wayfarer</h2>
            </div>
            <button
              className="market-round-link"
              onClick={() => openModel(studioModels[1])}
              aria-label={
                pt
                  ? "Explorar o modelo no Studio 3D"
                  : "Explore the model in the 3D Studio"
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
          pt ? "Por que criar com Opticus" : "Why create with Opticus"
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
              {pt
                ? "ENCONTRE SEU PONTO DE PARTIDA"
                : "FIND YOUR STARTING POINT"}
            </span>
            <h2 id="catalog-title" ref={catalogHeading} tabIndex={-1}>
              {pt
                ? "Clássicos. Com a sua assinatura."
                : "Classics. With your signature."}
            </h2>
          </div>
          <button
            className="market-text-link"
            onClick={() => setView("designs")}
          >
            {pt ? "Minhas criações" : "My designs"}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <div
          className="market-source"
          role="group"
          aria-label={pt ? "Origem do catálogo" : "Catalog source"}
        >
          <button
            aria-pressed={source === "studio"}
            onClick={() => setSource("studio")}
          >
            {pt ? "Modelos do Studio" : "Studio models"}
            <span>04</span>
          </button>
          <button
            aria-pressed={source === "store"}
            onClick={() => setSource("store")}
          >
            {pt ? "Catálogo da loja" : "Store catalog"}
          </button>
        </div>
        {source === "studio" ? (
          <>
            <div className="market-toolbar">
              <label className="market-search">
                <Search size={17} />
                <span className="market-sr-only">
                  {pt ? "Buscar modelos" : "Search models"}
                </span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={
                    pt
                      ? "Nome, formato ou material..."
                      : "Name, shape or material..."
                  }
                />
              </label>
              <label className="market-sort">
                <span>{pt ? "Ordenar por" : "Sort by"}</span>
                <select value={sort} onChange={(e) => setSort(e.target.value)}>
                  <option value="featured">
                    {pt ? "Destaques" : "Featured"}
                  </option>
                  <option value="price-asc">
                    {pt ? "Menor preço" : "Price: low to high"}
                  </option>
                  <option value="price-desc">
                    {pt ? "Maior preço" : "Price: high to low"}
                  </option>
                  <option value="name-asc">
                    {pt ? "Nome: A–Z" : "Name: A–Z"}
                  </option>
                </select>
              </label>
            </div>
            <div className="market-filters">
              <SlidersHorizontal size={16} aria-hidden="true" />
              <fieldset>
                <legend className="market-sr-only">
                  {pt ? "Formato" : "Shape"}
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
                <legend className="market-sr-only">Material</legend>
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
                  {pt ? "Limpar filtros" : "Clear filters"}
                </button>
              )}
              <span className="market-result-count" role="status">
                {products.length} {pt ? "modelos" : "models"}
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
                      aria-label={`${pt ? "Favoritar" : "Favorite"} ${p.name}`}
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
                      aria-label={`${pt ? "Ver" : "View"} ${p.name} ${pt ? "em 3D" : "in 3D"}`}
                    >
                      <Box size={14} />
                      {pt ? "Ver em 3D" : "View in 3D"}
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
                      aria-label={`${pt ? "Personalizar" : "Customize"} ${p.name}`}
                      onClick={() => openModel(p)}
                    >
                      {pt ? "Personalizar" : "Customize"}
                      <ArrowUpRight size={15} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
            {products.length === 0 && (
              <div className="market-state" role="status">
                <Search size={28} />
                <h3>{pt ? "Nenhum modelo por aqui" : "No models found"}</h3>
                <p>
                  {pt
                    ? "Tente outro termo ou remova um dos filtros."
                    : "Try another search or remove a filter."}
                </p>
                <button
                  className="market-button secondary"
                  onClick={clearFilters}
                >
                  {pt ? "Limpar filtros" : "Clear filters"}
                </button>
              </div>
            )}
            <p className="market-price-note">
              {pt
                ? "Valores em dólares (USD). A configuração final no Studio pode alterar o preço."
                : "Prices in US dollars (USD). Your final Studio configuration may change the price."}
            </p>
          </>
        ) : (
          <StoreCatalog pt={pt} />
        )}
        {storageError && (
          <p className="market-storage-warning" role="alert">
            {pt
              ? "O navegador não permitiu salvar suas escolhas. Habilite o armazenamento do site para guardar favoritos e abrir um modelo no Studio."
              : "Your browser could not save your choices. Allow site storage to keep favorites and open a model in the Studio."}
          </p>
        )}
      </section>
      <section className="market-process" aria-labelledby="process-title">
        <div>
          <span className="market-eyebrow">
            {pt
              ? "DO PRIMEIRO TRAÇO À SUA SACOLA"
              : "FROM FIRST IDEA TO YOUR BAG"}
          </span>
          <h2 id="process-title">
            {pt ? "Você imagina." : "You imagine it."}
            <br />
            <em>{pt ? "O Studio dá forma." : "The Studio shapes it."}</em>
          </h2>
          <button
            className="market-button primary"
            onClick={() => setView("create")}
          >
            {pt ? "Explorar o Creator Studio" : "Explore the Creator Studio"}
            <ArrowRight size={17} />
          </button>
        </div>
        <ol>
          {[
            [
              pt ? "Escolha uma base" : "Choose a starting point",
              pt
                ? "Encontre uma silhueta que combina com você ou comece diretamente no Studio."
                : "Find a silhouette that feels like you, or start directly in the Studio.",
            ],
            [
              pt ? "Faça suas escolhas" : "Make it yours",
              pt
                ? "Explore materiais, cores e componentes. Acompanhe cada mudança no modelo 3D."
                : "Explore materials, colors and components. See each change on the 3D model.",
            ],
            [
              pt ? "Revise e leve com você" : "Review and make it happen",
              pt
                ? "Confira os detalhes, salve sua criação ou adicione à sacola para seguir com a compra."
                : "Check the details, save your creation or add it to the bag to continue your purchase.",
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
            {pt ? "Um olhar feito de escolhas." : "A vision shaped by choices."}
          </p>
        </div>
        <nav aria-label={pt ? "Links do rodapé" : "Footer links"}>
          <button onClick={jumpToCatalog}>
            {pt ? "Coleção" : "Collection"}
          </button>
          <button onClick={() => setView("create")}>Creator Studio</button>
          <button onClick={() => setView("designs")}>
            {pt ? "Minhas criações" : "My designs"}
          </button>
        </nav>
        <span>© {new Date().getFullYear()} Opticus · Dipoly</span>
      </footer>
    </div>
  );
}
