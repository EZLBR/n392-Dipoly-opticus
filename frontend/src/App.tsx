import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { useCart } from "./contexts/CartContext";
import Navbar from "./components/Navbar";
import { useTranslation } from "./contexts/LanguageContext";
import { Check, X, AlertTriangle } from "lucide-react";
import { FactoryDashboard, StaffDashboard } from "./components/Dashboards";
import ErrorBoundary from "./components/ErrorBoundary";
import { setNavigateHandler } from "./utils/api";
import RequireAuth from "./components/RequireAuth";
import { FACTORY_ROLES, ORDER_ROLES, STAFF_ROLES, STUDIO_ROLES } from "./routes/access";

// Lazy Loading para os componentes pesados
const Marketplace = lazy(() => import("./components/Marketplace"));
const CreatorStudio = lazy(() => import("./components/CreatorStudio"));
const DesignsGallery = lazy(() => import("./components/DesignsGallery"));
const AuthPage = lazy(() => import("./components/AuthPage"));
const Cart = lazy(() => import("./components/Cart"));
const CustomerOrders = lazy(() => import("./components/CustomerOrders"));

export function AppContent() {
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const { session, authWarning, clearAuthWarning } = useAuth();
  const { clearCart } = useCart();
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    setNavigateHandler(navigate);
    return () => setNavigateHandler(null);
  }, [navigate]);

  // Verifica redirecionamento de pagamento
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      setShowPaymentSuccess(true);
      clearCart();
      // Use window.history to replace URL without triggering React Router re-renders
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A proteção de rotas privadas fica no RequireAuth (FE-08). Aqui só resta a
  // regra de produto da fábrica, que trabalha exclusivamente no seu painel.
  useEffect(() => {
    if (session?.role === "factory" && location.pathname !== "/factory-dashboard") {
      navigate("/factory-dashboard", { replace: true });
    }
  }, [session, location.pathname, navigate]);

  // Aplica classes visuais no body dependendo da rota
  useEffect(() => {
    document.body.classList.remove("page-marketplace", "page-create", "page-cart", "page-auth", "page-designs");
    if (location.pathname === "/create") {
      document.body.classList.add("page-create");
    } else if (location.pathname === "/cart") {
      document.body.classList.add("page-cart");
    } else if (location.pathname === "/login") {
      document.body.classList.add("page-auth");
    } else if (location.pathname === "/designs") {
      document.body.classList.add("page-designs");
    } else {
      document.body.classList.add("page-marketplace");
    }
  }, [location.pathname]);

  // Função legado de compatibilidade para os componentes que ainda esperam `setView`
  const setViewLegacy = (viewName) => {
    if (viewName === "marketplace") navigate("/");
    else navigate(`/${viewName}`);
  };

  const currentView = location.pathname.substring(1) || "marketplace";

  return (
    <div className="app-container">
      <Navbar currentView={currentView} setView={setViewLegacy} />

      {authWarning && (
        <div
          role="alert"
          className="auth-warning-banner"
          style={{
            background: "rgba(239, 68, 68, 0.15)",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            color: "#f87171",
            padding: "12px 20px",
            borderRadius: "8px",
            margin: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.3)",
            backdropFilter: "blur(8px)",
            position: "relative",
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <AlertTriangle size={20} />
            <span style={{ fontWeight: 500 }}>{authWarning}</span>
          </div>
          <button
            onClick={clearAuthWarning}
            aria-label={t("app-close-warning")}
            style={{
              background: "transparent",
              border: "none",
              color: "#f87171",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              padding: "4px",
            }}
          >
            <X size={18} />
          </button>
        </div>
      )}

      <main className="main-content">
        <Suspense fallback={
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'rgba(255,255,255,0.5)', fontFamily:'var(--font-primary)'}}>
            {t("app-loading")}
          </div>
        }>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Marketplace setView={setViewLegacy} />} />
              <Route path="/login" element={<AuthPage />} />
              <Route path="/designs" element={<RequireAuth roles={STUDIO_ROLES}><DesignsGallery setView={setViewLegacy} /></RequireAuth>} />
              <Route path="/create" element={<RequireAuth roles={STUDIO_ROLES}><CreatorStudio setView={setViewLegacy} /></RequireAuth>} />
              <Route path="/cart" element={<RequireAuth roles={STUDIO_ROLES}><Cart setView={setViewLegacy} /></RequireAuth>} />
              <Route path="/orders" element={<RequireAuth roles={ORDER_ROLES}><CustomerOrders /></RequireAuth>} />
              <Route path="/orders/:publicId" element={<RequireAuth roles={ORDER_ROLES}><CustomerOrders /></RequireAuth>} />
              <Route path="/factory-dashboard" element={<RequireAuth roles={FACTORY_ROLES}><FactoryDashboard /></RequireAuth>} />
              <Route path="/staff-dashboard" element={<RequireAuth roles={STAFF_ROLES}><StaffDashboard /></RequireAuth>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </ErrorBoundary>
        </Suspense>
      </main>

      {/* Modal Glassmorphic de Sucesso de Pagamento */}
      {showPaymentSuccess && (
        <div className="modal open" style={{ zIndex: 9999, background: "rgba(10, 15, 26, 0.75)", backdropFilter: "blur(12px)" }}>
          <div className="modal-card" style={{ maxWidth: "480px", background: "rgba(22, 27, 34, 0.95)", border: "1px solid rgba(240, 246, 252, 0.1)", borderRadius: "16px" }}>
            <div className="modal-head" style={{ borderBottom: "1px solid rgba(240, 246, 252, 0.08)" }}>
              <h3 style={{ textTransform: "uppercase", letterSpacing: "1.5px", fontWeight: "700", color: "#22c55e" }}>
                {t("app-payment-confirmed")}
              </h3>
              <button
                className="modal-close"
                onClick={(e) => {
                  e.preventDefault();
                  setShowPaymentSuccess(false);
                }}
                style={{ background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.1)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="modal-body" style={{ textAlign: "center", padding: "40px 24px" }}>
              <div style={{
                background: "rgba(34, 197, 94, 0.15)",
                color: "#22c55e",
                width: "72px",
                height: "72px",
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 24px auto",
                boxShadow: "0 0 25px rgba(34, 197, 94, 0.2)",
                border: "1px solid rgba(34, 197, 94, 0.3)"
              }}>
                <Check size={36} />
              </div>
              <h2 style={{ fontSize: "24px", fontWeight: "700", marginBottom: "12px", letterSpacing: "-0.5px" }}>
                {t("app-order-in-production")}
              </h2>
              <p style={{ color: "#8b949e", fontSize: "14px", lineHeight: "1.6", marginBottom: "32px" }}>
                {t("app-excellent-your-pix-payment-was-validated")}
              </p>
              <button
                className="btn primary"
                style={{ width: "100%", padding: "14px", fontWeight: "600", fontSize: "14px", textTransform: "uppercase", background: "#22c55e", borderColor: "#22c55e", color: "#fff", cursor: "pointer" }}
                onClick={(e) => {
                  e.preventDefault();
                  setShowPaymentSuccess(false);
                }}
              >
                {t("app-dismiss")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}
