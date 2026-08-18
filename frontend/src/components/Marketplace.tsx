import React, { useState, useEffect, useRef } from "react";
import * as THREE from "three";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useTranslation } from "../contexts/LanguageContext";
import { Heart, Search, X, Edit, Eye, FolderHeart, Sparkles } from "lucide-react";
import { calculateBasePrice } from "../utils/pricing";

import ThreePreview from "./ThreePreview";

export default function Marketplace({ setView }) {
  const { session } = useAuth();
  const { cart, addToCart } = useCart();
  const { t, language } = useTranslation();
  const [toastMessage, setToastMessage] = useState("");

  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("opticus_favorites")) || [];
    } catch {
      return [];
    }
  });

  // Base Products
  const baseProducts: any[] = [
    {
      id: "base-round-metal",
      name: "Aero Round",
      shape: "round",
      material: "metal",
      price: calculateBasePrice({ frameMaterial: "metal" }),
      badge: "Best Seller"
    },
    {
      id: "base-square-acetate",
      name: "Nova Square",
      shape: "square",
      material: "acetate",
      price: calculateBasePrice({ frameMaterial: "acetate", frameProfile: "bold" }),
      badge: "New"
    },
    {
      id: "base-round-acetate",
      name: "Luna Frame",
      shape: "round",
      material: "acetate",
      price: calculateBasePrice({ frameMaterial: "acetate" }),
      badge: "Classic"
    },
    {
      id: "base-square-metal",
      name: "Titan Edge",
      shape: "square",
      material: "titanium",
      price: calculateBasePrice({ frameMaterial: "titanium" }),
      badge: "Premium"
    }
  ];

  // Filters State
  const [filterShapes, setFilterShapes] = useState([]);
  const [filterMaterials, setFilterMaterials] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState("featured");

  useEffect(() => {
    localStorage.setItem("opticus_favorites", JSON.stringify(favorites));
  }, [favorites]);

  const toggleFavorite = (id) => {
    setFavorites((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const getAllProducts = () => {
    const base = baseProducts.map((p) => ({ ...p, type: "base" }));
    return [...base];
  };

  const handleClearFilters = () => {
    setFilterShapes([]);
    setFilterMaterials([]);
    setSearchQuery("");
    setSortBy("featured");
  };

  const handleShapeFilterChange = (val) => {
    setFilterShapes((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  const handleMaterialFilterChange = (val) => {
    setFilterMaterials((prev) =>
      prev.includes(val) ? prev.filter((item) => item !== val) : [...prev, val]
    );
  };

  const getFilteredProducts = () => {
    let list = getAllProducts();

    // 1. Search Query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.shape.toLowerCase().includes(q) ||
          p.material.toLowerCase().includes(q)
      );
    }

    // 2. Shape Filter
    if (filterShapes.length > 0) {
      list = list.filter((p) => filterShapes.includes(p.shape));
    }

    // 3. Material Filter
    if (filterMaterials.length > 0) {
      list = list.filter((p) => filterMaterials.includes(p.material));
    }

    // 4. Sort
    if (sortBy === "price-asc") {
      list.sort((a, b) => a.price - b.price);
    } else if (sortBy === "price-desc") {
      list.sort((a, b) => b.price - a.price);
    } else if (sortBy === "name-asc") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      // Featured: favorites first
      list.sort((a, b) => {
        const aFav = favorites.includes(a.id) ? 1 : 0;
        const bFav = favorites.includes(b.id) ? 1 : 0;
        return bFav - aFav;
      });
    }

    return list;
  };

  const handleProductAction = (id, type) => {
    const product = getAllProducts().find((p) => p.id === id);
    if (!product) return;

    if (product.type === "saved") {
      localStorage.setItem("opticus_active_design", String(product.savedIndex));
      localStorage.removeItem("opticus_active_product");
    } else {
      localStorage.setItem("opticus_active_product", product.id);
      localStorage.removeItem("opticus_active_design");
    }

    setView("create");
  };



  const filteredList = getFilteredProducts();

  return (
    <div className="page-marketplace">
      <div className="page-wrapper">
        <section className="hero hero-marketplace">
          <div className="hero-copy">
            <span className="eyebrow">{t("hero-eyebrow-marketplace")}</span>
            <h1>{t("hero-title-marketplace").toUpperCase()}</h1>
            <p>{t("hero-desc-marketplace")}</p>
            <div className="hero-actions">
              <button className="btn primary hero-btn" onClick={() => setView("create")}>
                <Sparkles size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                {t("btn-start-studio")}
              </button>
              <button className="btn hero-btn" onClick={() => setView("designs")}>
                <FolderHeart size={16} style={{ marginRight: "6px", verticalAlign: "middle" }} />
                {t("btn-open-saved")}
              </button>
            </div>
          </div>

          <div className="hero-panel">
            <div className="hero-card">
              <span className="hero-card-label">{t("hero-card-label")}</span>
              <strong>{t("hero-card-title")}</strong>
              <p>{t("hero-card-desc")}</p>
            </div>
            <div className="hero-stats">
              <div>
                <strong>3+</strong>
                <span>base models</span>
              </div>
              <div>
                <strong>Live</strong>
                <span>community designs</span>
              </div>
              <div>
                <strong>3D</strong>
                <span>preview workflow</span>
              </div>
            </div>
          </div>
        </section>

        <main className="marketplace">
          <aside className="filters">
            <div className="panel-kicker">{t("filter-refine")}</div>
            <h3>{t("filter-by")}</h3>

            <div className="filter-group" style={{ margin: "20px 0" }}>
              <p style={{ fontWeight: "600", marginBottom: "10px", fontSize: "12px", textTransform: "uppercase" }}>{t("filter-shape")}</p>
              <label style={{ display: "block", marginBottom: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  value="round"
                  style={{ marginRight: "8px" }}
                  checked={filterShapes.includes("round")}
                  onChange={() => handleShapeFilterChange("round")}
                />{" "}
                Round
              </label>
              <label style={{ display: "block", marginBottom: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  value="square"
                  style={{ marginRight: "8px" }}
                  checked={filterShapes.includes("square")}
                  onChange={() => handleShapeFilterChange("square")}
                />{" "}
                Square
              </label>
            </div>

            <div className="filter-group" style={{ margin: "20px 0" }}>
              <p style={{ fontWeight: "600", marginBottom: "10px", fontSize: "12px", textTransform: "uppercase" }}>{t("filter-material")}</p>
              <label style={{ display: "block", marginBottom: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  value="metal"
                  style={{ marginRight: "8px" }}
                  checked={filterMaterials.includes("metal")}
                  onChange={() => handleMaterialFilterChange("metal")}
                />{" "}
                Metal
              </label>
              <label style={{ display: "block", marginBottom: "8px", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  value="acetate"
                  style={{ marginRight: "8px" }}
                  checked={filterMaterials.includes("acetate")}
                  onChange={() => handleMaterialFilterChange("acetate")}
                />{" "}
                Acetate
              </label>
            </div>

            <button id="clearFilters" className="btn" style={{ width: "100%", marginTop: "10px" }} onClick={handleClearFilters}>
              CLEAR FILTERS
            </button>
          </aside>

          <section className="catalog">
            <div className="catalog-toolbar">
              <div className="toolbar-copy">
                <span className="panel-kicker">Catalog</span>
                <h2>Discover standout shapes and materials</h2>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  <Search size={14} style={{ position: "absolute", left: "10px", top: "13px", color: "var(--color-hint)" }} />
                  <input
                    type="text"
                    id="searchInput"
                    className="search-input"
                    placeholder="Search designs..."
                    style={{ paddingLeft: "30px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: "6px", height: "38px" }}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>

                <select
                  id="sortSelect"
                  className="sort-select"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", borderRadius: "6px", height: "38px", padding: "0 10px" }}
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                >
                  <option value="featured">Featured</option>
                  <option value="price-asc">Price: Low to High</option>
                  <option value="price-desc">Price: High to Low</option>
                  <option value="name-asc">Name: A to Z</option>
                </select>
              </div>
            </div>

            <section className="products" id="productGrid">
              {filteredList.length === 0 ? (
                <div className="empty-state" style={{ gridColumn: "1/-1", textAlign: "center", padding: "60px 0" }}>
                  <h3>No designs found</h3>
                  <p>Try changing the filters or search term.</p>
                </div>
              ) : (
                filteredList.map((p) => {
                  const isFav = favorites.includes(p.id);
                  return (
                    <article key={p.id} className="product-card" style={{ position: "relative" }}>
                      <button
                        className={`favorite-btn ${isFav ? "active" : ""}`}
                        style={{ position: "absolute", top: "12px", right: "12px", background: "none", border: "none", cursor: "pointer", zIndex: "5" }}
                        onClick={() => toggleFavorite(p.id)}
                        aria-label="Favorite"
                      >
                        <Heart size={18} fill={isFav ? "var(--primary-accent)" : "none"} color={isFav ? "var(--primary-accent)" : "#fff"} />
                      </button>

                      <div className="product-badge">{p.badge}</div>

                      <ThreePreview shape={p.shape} material={p.material} />

                      <div className="product-meta" style={{ padding: "16px" }}>
                        <div className="product-topline" style={{ display: "flex", gap: "10px", fontSize: "11px", textTransform: "uppercase", color: "var(--color-hint)", marginBottom: "6px" }}>
                          <span>{p.shape}</span>
                          <span>{p.material}</span>
                        </div>

                        <h3 style={{ fontSize: "16px", margin: "0 0 8px 0" }}>{p.name}</h3>
                        <p className="product-price" style={{ fontWeight: "600", fontSize: "15px", margin: "0 0 16px 0" }}>${Number(p.price).toFixed(2)}</p>

                        <div className="product-actions" style={{ display: "flex", gap: "10px" }}>
                          <button className="btn" style={{ flex: 1 }} onClick={() => handleProductAction(p.id, "view")}>
                            <Eye size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} /> VIEW
                          </button>
                          <button className="btn primary" style={{ flex: 1 }} onClick={() => handleProductAction(p.id, "customize")}>
                            <Edit size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} /> CUSTOMIZE
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </section>
          </section>
        </main>

        {/* Premium Footer */}
        <footer className="marketplace-footer">
          <div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "28px", marginBottom: "20px" }}>OPTICUS</h2>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.6" }}>
              Redefining luxury eyewear through cutting-edge 3D customization and premium materials.
            </p>
          </div>
          <div>
            <h4 style={{ fontWeight: 600, marginBottom: "20px", textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.1em" }}>Collections</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Titanium Series</a></li>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Classic Acetate</a></li>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Polarized Sun</a></li>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Limited Editions</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontWeight: 600, marginBottom: "20px", textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.1em" }}>Support</h4>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: "12px" }}>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Care Guide</a></li>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Warranty</a></li>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Shipping</a></li>
              <li><a href="#" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Contact Us</a></li>
            </ul>
          </div>
          <div>
            <h4 style={{ fontWeight: 600, marginBottom: "20px", textTransform: "uppercase", fontSize: "12px", letterSpacing: "0.1em" }}>Newsletter</h4>
            <p style={{ color: "var(--text-muted)", fontSize: "14px", marginBottom: "16px" }}>Subscribe for exclusive designs and early access.</p>
            <div style={{ display: "flex", gap: "8px" }}>
              <input type="email" placeholder="Your email" style={{ flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
              <button className="btn primary" style={{ padding: "0 16px" }}>Join</button>
            </div>
          </div>
          <div className="footer-bottom">
            <span>&copy; {new Date().getFullYear()} OPTICUS LUXURY EYEWEAR. All rights reserved.</span>
            <div style={{ display: "flex", gap: "20px" }}>
              <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Privacy Policy</a>
              <a href="#" style={{ color: "var(--text-muted)", textDecoration: "none" }}>Terms of Service</a>
            </div>
          </div>
        </footer>
      </div>



      {toastMessage && (
        <div style={{
          position: "fixed",
          bottom: "30px",
          right: "30px",
          background: "rgba(22, 27, 34, 0.95)",
          border: "1px solid var(--primary-accent)",
          boxShadow: "0 0 20px var(--primary-accent)",
          padding: "16px 24px",
          borderRadius: "8px",
          color: "#fff",
          zIndex: 10000,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          backdropFilter: "blur(10px)",
          fontSize: "14px",
          fontWeight: "600"
        }}>
          <Sparkles size={16} color="var(--primary-accent)" />
          {toastMessage}
        </div>
      )}
    </div>
  );
}
