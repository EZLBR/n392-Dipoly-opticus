import React, { useState, useEffect } from "react";
import * as THREE from "three";
import { useAuth } from "../contexts/AuthContext";
import { useCart } from "../contexts/CartContext";
import { localizeProblem, useTranslation, type Language } from "../contexts/LanguageContext";
import { Trash2, Plus, Minus, ShoppingBag, ArrowRight, Info, AlertCircle } from "lucide-react";

import ThreePreview from "./ThreePreview";
import { fetchSimulatedCheckoutHtml, confirmSimulatedPayment } from "../utils/simulated-checkout";
import { ProblemError } from "../api/client";
import { hasArtwork } from "../eyewear/artwork";
import { normalizeConfig } from "../eyewear/config";

interface SimulatedCheckout {
  html: string;
  owner: string;
  token: string | null;
  billingId: string;
  url: string;
  language: Language;
}

export default function Cart({ setView }) {
  const { session } = useAuth();
  const { cart, removeFromCart, updateCartQty, clearCart, checkoutCart } = useCart();
  const { t, language } = useTranslation();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const [toastMessage, setToastMessage] = useState("");
  const [simulatedCheckout, setSimulatedCheckout] = useState<SimulatedCheckout | null>(null);
  const [checkoutLanguageError, setCheckoutLanguageError] = useState(false);
  const [checkoutLanguageAttempt, setCheckoutLanguageAttempt] = useState(0);
  const containsArtwork = cart.some(item => hasArtwork(normalizeConfig(item.customSpecs)));
  const checkout = simulatedCheckout?.owner === String(session?.id)
    && simulatedCheckout.token === localStorage.getItem("opticus_token") ? simulatedCheckout : null;

  useEffect(() => {
    if (!checkout || checkout.language === language) return;
    const controller = new AbortController();
    setCheckoutLanguageError(false);
    fetchSimulatedCheckoutHtml(checkout.url, language, controller.signal).then(html => {
      if (!controller.signal.aborted && checkout.token === localStorage.getItem("opticus_token")) {
        setSimulatedCheckout(current => current === checkout ? { ...current, html, language } : current);
      }
    }).catch(() => {
      if (!controller.signal.aborted) setCheckoutLanguageError(true);
    });
    return () => controller.abort();
  }, [checkout, language, checkoutLanguageAttempt]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage("");
    }, 4500);
  };

  const getSubtotal = () => {
    return cart.reduce((sum, item) => sum + Number(item.total) * (item.quantity || 1), 0);
  };

  const handleQtyChange = (itemId, currentQty, delta) => {
    const nextQty = currentQty + delta;
    if (nextQty >= 1) {
      updateCartQty(itemId, nextQty);
    }
  };

  const handleCheckout = async () => {
    if (containsArtwork) return;
    if (!session) {
      alert(
        t("cart-you-need-to-log-in-to")
      );
      setView("login");
      return;
    }

    setCheckoutLoading(true);
    const token = localStorage.getItem("opticus_token");

    try {
      const result = await checkoutCart(cart);

      if (result && (result.ok || result.checkoutUrl || result.isOffline || result.success)) {
        if (result.isOffline) {
          showToast(t("toast-offline-checkout"));
          setTimeout(() => {
            setView("marketplace");
          }, 2000);
        } else if (result.checkoutUrl) {
          if (result.isSimulated) {
            if (token !== localStorage.getItem("opticus_token")) return;
            const url = result.checkoutUrl;
            const html = await fetchSimulatedCheckoutHtml(url, language);
            const billingId = result.billingId || new URL(url).searchParams.get("billingId") || "";
            if (token === localStorage.getItem("opticus_token")) {
              setSimulatedCheckout({ html, owner: String(session.id), token, billingId, url, language });
            }
          } else {
            window.location.href = result.checkoutUrl;
          }
        }
      } else {
        alert(
          result?.error ||
          (t("cart-an-error-occurred-during-checkout-initialization"))
        );
      }
    } catch (err) {
      console.error("Checkout process failed:", err);
      alert(
        err instanceof ProblemError ? localizeProblem(err.problem, language) : t("cart-could-not-connect-to-the-payment")
      );
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleConfirmSimulatedPayment = async () => {
    if (!checkout) return;
    setConfirmingPayment(true);
    try {
      await confirmSimulatedPayment(checkout.billingId);
      // O App escuta `?payment=success` no carregamento e limpa a sacola.
      window.location.href = "/?payment=success";
    } catch (err) {
      const detail = err instanceof ProblemError ? localizeProblem(err.problem, language) : "";
      alert(
        detail ||
        (t("cart-could-not-confirm-the-simulated-payment"))
      );
    } finally {
      setConfirmingPayment(false);
    }
  };

  if (checkout) {
    return <section aria-label={t("cart-simulated-payment")} style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <button className="btn" onClick={() => setSimulatedCheckout(null)}>
          {t("cart-back-to-bag")}
        </button>
        <button
          className="btn primary"
          onClick={handleConfirmSimulatedPayment}
          disabled={confirmingPayment}
        >
          {confirmingPayment
            ? (t("cart-confirming"))
            : (t("cart-simulate-pix-payment"))}
        </button>
      </div>
      {checkoutLanguageError && checkout.language !== language && <div role="alert">
        <p>{t("cart-language-load-failed")}</p>
        <button className="btn" onClick={() => setCheckoutLanguageAttempt(attempt => attempt + 1)}>
          {t("cart-retry-language")}
        </button>
      </div>}
      <iframe title={t("cart-your-pix-billing")}
        srcDoc={checkout.html} sandbox="allow-same-origin"
        referrerPolicy="no-referrer" style={{ width: "100%", height: "80vh", border: 0, marginTop: 16 }} />
    </section>;
  }
  return (
    <div className="page-wrapper" style={{ padding: "40px 20px", maxWidth: "1200px", margin: "0 auto" }}>
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
          zIndex: 1000,
          display: "flex",
          alignItems: "center",
          gap: "10px",
          backdropFilter: "blur(10px)",
          fontSize: "14px",
          fontWeight: "600",
          animation: "slideIn 0.3s ease"
        }}>
          <Info size={16} color="var(--primary-accent)" />
          {toastMessage}
        </div>
      )}

      <div className="cart-header" style={{ marginBottom: "32px" }}>
        <span className="eyebrow" style={{ color: "var(--primary-accent)", fontSize: "12px", letterSpacing: "2px", textTransform: "uppercase" }}>
          {t("hero-eyebrow-marketplace")}
        </span>
        <h1 style={{ fontSize: "36px", fontWeight: "700", marginTop: "8px" }}>
          {t("cart-title").toUpperCase()}
        </h1>
      </div>

      {cart.length === 0 ? (
        <div className="premium-glass-card" style={{
          padding: "80px 40px",
          textAlign: "center",
          borderRadius: "16px",
          border: "1px solid rgba(255,255,255,0.06)"
        }}>
          <div style={{
            background: "rgba(255, 255, 255, 0.03)",
            width: "80px",
            height: "80px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px auto",
            border: "1px solid rgba(255,255,255,0.08)"
          }}>
            <ShoppingBag size={36} color="var(--color-hint)" />
          </div>
          <h2 style={{ fontSize: "22px", fontWeight: "600", marginBottom: "12px" }}>
            {t("cart-empty")}
          </h2>
          <p style={{ color: "var(--color-hint)", fontSize: "14px", maxWidth: "400px", margin: "0 auto 32px auto", lineHeight: "1.6" }}>
            {t("cart-browse-our-catalog-or-open-the")}
          </p>
          <button className="btn primary" onClick={() => setView("marketplace")} style={{ padding: "12px 32px", fontSize: "14px", fontWeight: "600" }}>
            {t("cart-go-to-marketplace")}
          </button>
        </div>
      ) : (
        <div className="cart-layout">

          {/* Cart Items List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {cart.map((item) => {
              const specs = item.customSpecs || {};
              const shape = specs.model || "round";
              const color = specs.color || "#000000";
              const isSun = !!specs.isSunglasses;

              return (
                <div
                  key={item.id}
                  className="premium-glass-card cart-item"
                >
                  <ThreePreview config={specs} />

                  <div className="cart-item-details">
                    <h3 style={{ fontSize: "18px", fontWeight: "600", margin: "0 0 6px 0" }}>
                      {item.productName}
                    </h3>
                    <p style={{ color: "var(--color-hint)", fontSize: "12px", margin: "0 0 12px 0", textTransform: "uppercase", letterSpacing: "1px" }}>
                      {t("journey-03-title")} &bull; {item.factoryName || t("cart-partner")}
                    </p>

                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <span style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        color: "var(--text-light)"
                      }}>
                        {t("cart-shape")}{shape.toUpperCase()}
                      </span>
                      <span style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                      }}>
                        {t("cart-color")}
                        <span style={{ display: "inline-block", width: "10px", height: "10px", borderRadius: "50%", background: color, border: "1px solid rgba(255,255,255,0.2)" }} />
                        {color}
                      </span>
                      <span style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        fontSize: "11px",
                        padding: "3px 10px",
                        borderRadius: "12px",
                        color: isSun ? "#f59e0b" : "var(--color-hint)"
                      }}>
                        {isSun ? (t("cart-sunglasses")) : (t("cart-clear-lens"))}
                      </span>
                      {specs.antiReflective && (
                        <span style={{
                          background: "rgba(34,197,94,0.08)",
                          border: "1px solid rgba(34,197,94,0.15)",
                          fontSize: "11px",
                          padding: "3px 10px",
                          borderRadius: "12px",
                          color: "#22c55e"
                        }}>
                          {t("cart-anti-reflective")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quantity Actions */}
                  <div className="cart-item-actions">
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      border: "1px solid rgba(255,255,255,0.08)",
                      background: "rgba(255,255,255,0.02)",
                      borderRadius: "6px",
                      padding: "4px"
                    }}>
                      <button
                        onClick={() => handleQtyChange(item.id, item.quantity || 1, -1)}
                        style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", padding: "6px" }}
                        disabled={(item.quantity || 1) <= 1}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ padding: "0 12px", fontWeight: "600", fontSize: "14px", minWidth: "20px", textAlign: "center" }}>
                        {item.quantity || 1}
                      </span>
                      <button
                        onClick={() => handleQtyChange(item.id, item.quantity || 1, 1)}
                        style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", display: "flex", padding: "6px" }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <div style={{ fontSize: "16px", fontWeight: "700", minWidth: "80px", textAlign: "right" }}>
                      R$ {(Number(item.total) * (item.quantity || 1)).toFixed(2)}
                    </div>

                    <button
                      className="btn"
                      onClick={() => {
                        removeFromCart(item.id);
                        showToast(t("cart-item-removed"));
                      }}
                      style={{
                        background: "rgba(239, 68, 68, 0.08)",
                        border: "1px solid rgba(239, 68, 68, 0.15)",
                        padding: "10px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#ef4444"
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: "10px" }}>
              <button
                className="btn"
                onClick={() => setView("marketplace")}
                style={{ padding: "10px 20px", fontSize: "13px", fontWeight: "600" }}
              >
                {t("cart-continue-shopping")}
              </button>
              <button
                className="btn"
                onClick={() => {
                  clearCart();
                  showToast(t("cart-empty"));
                }}
                style={{ padding: "10px 20px", fontSize: "13px", color: "#ef4444", background: "none", border: "none" }}
              >
                {t("cart-clear").toUpperCase()}
              </button>
            </div>
          </div>

          {/* Cart Summary & Checkout Panel */}
          <aside className="premium-glass-card" style={{
            padding: "24px",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(22, 27, 34, 0.4)",
            backdropFilter: "blur(16px)"
          }}>
            <h3 style={{ fontSize: "18px", fontWeight: "600", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.06)", paddingBottom: "12px" }}>
              {t("cart-order-summary")}
            </h3>

            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--color-hint)" }}>
                <span>{t("cart-total-items")}</span>
                <span>{cart.reduce((sum, item) => sum + (item.quantity || 1), 0)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "14px", color: "var(--color-hint)" }}>
                <span>{t("cart-shipping")}</span>
                <span style={{ color: "#22c55e", fontWeight: "600" }}>{t("cart-free-express")}</span>
              </div>

              <div style={{ borderTop: "1px dashed rgba(255,255,255,0.08)", margin: "8px 0" }} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontSize: "16px", fontWeight: "600" }}>{t("cart-subtotal")}</span>
                <span style={{ fontSize: "24px", fontWeight: "700", color: "#22c55e" }}>
                  R$ {getSubtotal().toFixed(2)}
                </span>
              </div>
            </div>

            {/* Payment security info */}
            <div style={{
              display: "flex",
              gap: "10px",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
              borderRadius: "8px",
              padding: "12px",
              marginBottom: "24px",
              fontSize: "12px",
              lineHeight: "1.4",
              color: "var(--color-hint)"
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, color: "var(--primary-accent)", marginTop: "2px" }} />
              <div>
                {t("cart-secure-pix-payment-processed-through-abacatepay")}
              </div>
            </div>

            {containsArtwork && <p role="status">{t("cart-remove-artwork-designs-from-the-bag")}</p>}
            <button
              className="btn primary"
              onClick={handleCheckout}
              disabled={checkoutLoading || containsArtwork}
              style={{
                width: "100%",
                padding: "16px",
                fontSize: "14px",
                fontWeight: "700",
                letterSpacing: "1px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                borderColor: "#22c55e",
                color: "#fff",
                borderRadius: "8px",
                boxShadow: "0 0 20px rgba(34, 197, 94, 0.35)",
                cursor: "pointer"
              }}
            >
              {checkoutLoading ? (
                t("cart-processing")
              ) : (
                <>
                  {t("cart-checkout")}
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </aside>
        </div>
      )}
    </div>
  );
}
