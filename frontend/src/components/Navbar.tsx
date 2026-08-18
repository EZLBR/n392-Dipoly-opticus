import React, { useState, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { useTranslation } from "../contexts/LanguageContext";
import { Moon, Sun, Globe, LogOut, Menu, X } from "lucide-react";

export default function Navbar({ currentView, setView }) {
  const { session, logout } = useAuth();
  const { cart } = useCart();
  const { t, language, setLanguage } = useTranslation();
  const [darkMode, setDarkMode] = useState(() => {
    return localStorage.getItem("opticus_theme") === "dark";
  });
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (darkMode) {
      document.body.classList.add("dark");
      document.documentElement.classList.add("dark-mode");
      localStorage.setItem("opticus_theme", "dark");
    } else {
      document.body.classList.remove("dark");
      document.documentElement.classList.remove("dark-mode");
      localStorage.setItem("opticus_theme", "light");
    }
  }, [darkMode]);

  // Close mobile menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [currentView]);

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 768) setMenuOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleNavClick = (view, e) => {
    e.preventDefault();
    setView(view);
    setMenuOpen(false);
  };

  return (
    <header className="navbar">
      <div className="navbar-top-row">
        <div className="logo" onClick={(e) => handleNavClick("marketplace", e)} style={{ cursor: "pointer" }}>
          OPTICUS
        </div>

        <button
          className="mobile-menu-btn"
          aria-label="Toggle navigation menu"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      <div className={`nav-menu ${menuOpen ? "open" : ""}`}>
        <nav>
          <a
            href="#"
            className={currentView === "marketplace" ? "active" : ""}
            onClick={(e) => handleNavClick("marketplace", e)}
          >
            {t("nav-explore")}
          </a>

          {/* Only show Studio and Import for clients or staff */}
          {(!session || session.role === "client" || session.role === "staff") && (
            <>
              <a
                href="#"
                className={currentView === "create" ? "active" : ""}
                onClick={(e) => handleNavClick("create", e)}
              >
                {t("nav-studio")}
              </a>
              <a
                href="#"
                className={currentView === "designs" ? "active" : ""}
                onClick={(e) => handleNavClick("designs", e)}
              >
                {t("nav-my-designs")}
              </a>
              <a
                href="#"
                className={currentView === "cart" ? "active" : ""}
                onClick={(e) => handleNavClick("cart", e)}
                style={{ display: "inline-flex", alignItems: "center" }}
              >
                {t("nav-cart")}
                {cart && cart.length > 0 && (
                  <span className="cart-badge" style={{
                    marginLeft: "6px",
                    background: "#ff0055",
                    color: "#fff",
                    borderRadius: "10px",
                    padding: "1px 6px",
                    fontSize: "10px",
                    fontWeight: "bold",
                    boxShadow: "0 0 10px #ff0055",
                    border: "1px solid rgba(255,255,255,0.4)",
                    display: "inline-block",
                    lineHeight: "1.2"
                  }}>
                    {cart.reduce((sum, item) => sum + (item.quantity || 1), 0)}
                  </span>
                )}
              </a>
            </>
          )}

          {/* Dashboard link for Factory or Staff */}
          {session && session.role === "factory" && (
            <a
              href="#"
              className={currentView === "factory-dashboard" ? "active" : ""}
              onClick={(e) => handleNavClick("factory-dashboard", e)}
            >
              {t("nav-dashboard")}
            </a>
          )}

          {session && session.role === "staff" && (
            <a
              href="#"
              className={currentView === "staff-dashboard" ? "active" : ""}
              onClick={(e) => handleNavClick("staff-dashboard", e)}
            >
              {t("nav-dashboard")}
            </a>
          )}
        </nav>

        <div className="navbar-actions">
          <div id="sessionArea">
            {session ? (
              <div className="session-box">
                <span>
                  {session.name} &middot; {session.role.toUpperCase()}
                </span>
                <button className="btn logout-btn" id="logoutBtn" type="button" onClick={logout}>
                  <LogOut size={14} style={{ marginRight: "4px", verticalAlign: "middle" }} />
                  {t("nav-logout")}
                </button>
              </div>
            ) : (
              <button className="btn" type="button" onClick={() => { setView("login"); setMenuOpen(false); }}>
                {t("nav-login").toUpperCase()}
              </button>
            )}
          </div>

          <div className="language-selector">
            <Globe size={14} className="globe-icon" style={{ marginRight: "4px", verticalAlign: "middle" }} />
            <select
              id="languageSelector"
              aria-label="Select language"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="en">EN</option>
              <option value="pt">PT</option>
            </select>
          </div>

          <button
            id="darkToggle"
            className="dark-toggle"
            aria-label="Toggle dark mode"
            onClick={() => setDarkMode(!darkMode)}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </div>
    </header>
  );
}
