import React, { useState, useEffect, Suspense, lazy } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./contexts/AuthContext";
import { useCart } from "./contexts/CartContext";
import Navbar from "./components/Navbar";
import { useTranslation } from "./contexts/LanguageContext";
import { Check, X } from "lucide-react";
import { FactoryDashboard, StaffDashboard } from "./components/Dashboards";
import ErrorBoundary from "./components/ErrorBoundary";

// Lazy Loading para os componentes pesados
const Marketplace = lazy(() => import("./components/Marketplace"));
const CreatorStudio = lazy(() => import("./components/CreatorStudio"));
const DesignsGallery = lazy(() => import("./components/DesignsGallery"));
const AuthPage = lazy(() => import("./components/AuthPage"));
const Cart = lazy(() => import("./components/Cart"));

function AppContent() {
  const [showPaymentSuccess, setShowPaymentSuccess] = useState(false);
  const { session } = useAuth();
  const { clearCart } = useCart();
  const { language } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

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

  // Controle de permissões (Roles) e proteção de rotas
  useEffect(() => {
    if (!session) {
      if (location.pathname === "/factory-dashboard" || location.pathname === "/staff-dashboard") {
        navigate("/");
      }
    } else {
      if (session.role === "factory" && location.pathname !== "/factory-dashboard") {
        navigate("/factory-dashboard");
      }
      if (session.role === "staff" && location.pathname === "/factory-dashboard") {
        navigate("/staff-dashboard");
      }
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

      <main className="main-content">
        <Suspense fallback={
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', color:'rgba(255,255,255,0.5)', fontFamily:'var(--font-primary)'}}>
            Carregando interface...
          </div>
        }>
          <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Marketplace setView={setViewLegacy} />} />
              <Route path="/designs" element={<DesignsGallery setView={setViewLegacy} />} />
              <Route path="/create" element={<CreatorStudio setView={setViewLegacy} />} />
              <Route path="/cart" element={<Cart setView={setViewLegacy} />} />
              <Route path="/login" element={<AuthPage setView={setViewLegacy} />} />
              <Route path="/factory-dashboard" element={<FactoryDashboard />} />
              <Route path="/staff-dashboard" element={<StaffDashboard />} />
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
                {language === "pt" ? "PAGAMENTO VERIFICADO" : "PAYMENT CONFIRMED"}
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
                {language === "pt" ? "Pedido em Produção!" : "Order in Production!"}
              </h2>
              <p style={{ color: "#8b949e", fontSize: "14px", lineHeight: "1.6", marginBottom: "32px" }}>
                {language === "pt"
                  ? "Excelente! Seu pagamento via Pix foi validado com sucesso através do AbacatePay. O pedido foi recebido e encaminhado para a fila de produção da Fábrica!"
                  : "Excellent! Your Pix payment was validated successfully through AbacatePay. The order has been received and forwarded to the Factory production queue!"}
              </p>
              <button
                className="btn primary"
                style={{ width: "100%", padding: "14px", fontWeight: "600", fontSize: "14px", textTransform: "uppercase", background: "#22c55e", borderColor: "#22c55e", color: "#fff", cursor: "pointer" }}
                onClick={(e) => {
                  e.preventDefault();
                  setShowPaymentSuccess(false);
                }}
              >
                {language === "pt" ? "CONFIRMAR" : "DISMISS"}
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
