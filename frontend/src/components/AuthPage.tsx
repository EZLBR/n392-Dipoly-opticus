import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../contexts/LanguageContext";

export default function AuthPage({ setView }) {
  const { login, signup } = useAuth();
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("login");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Signup form state
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupConfirm, setSignupConfirm] = useState("");
  const [signupError, setSignupError] = useState("");
  const [signupSuccess, setSignupSuccess] = useState("");

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setLoginError("");
    setLoginLoading(true);

    try {
      const result = await login(loginEmail, loginPassword);
      setLoginLoading(false);

      if (result.ok) {
        const redirect = localStorage.getItem("opticus_redirect_after_login");
        if (redirect) {
          localStorage.removeItem("opticus_redirect_after_login");
          setView(redirect);
          return;
        }

        if (result.role === "client") setView("marketplace");
        else if (result.role === "factory") setView("factory-dashboard");
        else if (result.role === "staff") setView("staff-dashboard");
      } else {
        setLoginError(result.message || "Invalid credentials.");
      }
    } catch (err) {
      setLoginLoading(false);
      setLoginError("An unexpected error occurred.");
    }
  };

  const handleSignupSubmit = async (e) => {
    e.preventDefault();
    setSignupError("");
    setSignupSuccess("");

    if (!signupName.trim() || !signupEmail.trim() || signupPassword.length < 8) {
      setSignupError("Fill all required fields. Password must be at least 8 characters.");
      return;
    }

    if (signupPassword !== signupConfirm) {
      setSignupError("Passwords do not match.");
      return;
    }



    try {
      const result = await signup({
        name: signupName,
        email: signupEmail,
        password: signupPassword
      });

      if (result.ok) {
        setSignupSuccess("Account created. Opening your workspace...");
        setTimeout(() => {
          const redirect = localStorage.getItem("opticus_redirect_after_login");
          if (redirect) {
            localStorage.removeItem("opticus_redirect_after_login");
            setView(redirect);
            return;
          }

          if (result.role === "client") setView("marketplace");
          else if (result.role === "factory") setView("factory-dashboard");
          else if (result.role === "staff") setView("staff-dashboard");
        }, 500);
      } else {
        setSignupError(result.message || "Signup failed.");
      }
    } catch (err) {
      setSignupError("An unexpected error occurred during signup.");
    }
  };

  return (
    <div className="auth-container" style={{ maxWidth: "480px", margin: "80px auto", padding: "20px" }}>
      <section className="auth-card premium-glass-card" style={{ padding: "30px", borderRadius: "12px" }}>
        <div className="auth-header" style={{ marginBottom: "24px", textAlign: "center" }}>
          <span className="eyebrow" style={{ fontSize: "12px", letterSpacing: "1.5px", textTransform: "uppercase", color: "var(--primary-accent)" }}>
            {activeTab === "login" ? "Welcome back" : "Create account"}
          </span>
          <h2 style={{ fontSize: "24px", margin: "8px 0" }}>
            {activeTab === "login" ? "Access your Opticus account" : "Join Opticus"}
          </h2>
          <p style={{ fontSize: "14px", color: "var(--color-hint)", lineHeight: "1.4" }}>
            {activeTab === "login"
              ? "Use your email and password to log in. We'll open the right workspace automatically."
              : "Create a client or factory account and continue into your workspace."}
          </p>
        </div>

        <div className="auth-tabs" role="tablist" style={{ display: "flex", borderBottom: "1px solid var(--border-light)", marginBottom: "20px" }}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "login"}
            aria-controls="login-panel"
            className={`auth-tab ${activeTab === "login" ? "is-active" : ""}`}
            style={{ flex: 1, background: "none", border: "none", color: activeTab === "login" ? "var(--text-dark)" : "var(--color-hint)", borderBottom: activeTab === "login" ? "2px solid var(--primary-accent)" : "none", padding: "10px", cursor: "pointer", fontWeight: "600" }}
            onClick={() => setActiveTab("login")}
          >
            LOGIN
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "signup"}
            aria-controls="signup-panel"
            className={`auth-tab ${activeTab === "signup" ? "is-active" : ""}`}
            style={{ flex: 1, background: "none", border: "none", color: activeTab === "signup" ? "var(--text-dark)" : "var(--color-hint)", borderBottom: activeTab === "signup" ? "2px solid var(--primary-accent)" : "none", padding: "10px", cursor: "pointer", fontWeight: "600" }}
            onClick={() => setActiveTab("signup")}
          >
            SIGNUP
          </button>
        </div>

        {activeTab === "login" ? (
          <form onSubmit={handleLoginSubmit} role="tabpanel" id="login-panel">
            <div className="form-group" style={{ marginBottom: "16px" }}>
              <label htmlFor="loginEmail" style={{ display: "block", marginBottom: "6px", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Email Address</label>
              <input
                type="email"
                id="loginEmail"
                className="control-select premium-input"
                style={{ width: "100%", padding: "10px" }}
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label htmlFor="loginPassword" style={{ display: "block", marginBottom: "6px", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Password</label>
              <input
                type="password"
                id="loginPassword"
                className="control-select premium-input"
                style={{ width: "100%", padding: "10px" }}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                required
              />
            </div>

            {loginError && <p style={{ color: "#ef4444", fontSize: "14px", margin: "0 0 16px 0" }}>{loginError}</p>}

            <button
              type="submit"
              className="save-btn"
              style={{ width: "100%", padding: "12px", fontSize: "14px", fontWeight: "600", marginBottom: "16px" }}
              disabled={loginLoading}
            >
              {loginLoading ? "ENTERING..." : "ENTER OPTICUS"}
            </button>

            <div style={{ display: "flex", alignItems: "center", margin: "16px 0", color: "var(--color-hint)", fontSize: "12px" }}>
              <div style={{ flex: 1, height: "1px", background: "var(--border-light)" }}></div>
              <span style={{ padding: "0 10px" }}>OR</span>
              <div style={{ flex: 1, height: "1px", background: "var(--border-light)" }}></div>
            </div>

            <button
              type="button"
              className="btn"
              onClick={() => alert("Google Login would open here.")}
              style={{ width: "100%", padding: "12px", fontSize: "14px", fontWeight: "600", display: "flex", alignItems: "center", justifyContent: "center", gap: "10px", background: "#fff", color: "#000", borderRadius: "6px" }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignupSubmit}>
            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label htmlFor="signupName" style={{ display: "block", marginBottom: "6px", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Full Name</label>
              <input
                type="text"
                id="signupName"
                className="control-select premium-input"
                style={{ width: "100%", padding: "10px" }}
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                required
              />
            </div>



            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label htmlFor="signupEmail" style={{ display: "block", marginBottom: "6px", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Email Address</label>
              <input
                type="email"
                id="signupEmail"
                className="control-select premium-input"
                style={{ width: "100%", padding: "10px" }}
                value={signupEmail}
                onChange={(e) => setSignupEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: "12px" }}>
              <label htmlFor="signupPassword" style={{ display: "block", marginBottom: "6px", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Password (8+ chars)</label>
              <input
                type="password"
                id="signupPassword"
                className="control-select premium-input"
                style={{ width: "100%", padding: "10px" }}
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: "20px" }}>
              <label htmlFor="signupConfirm" style={{ display: "block", marginBottom: "6px", fontSize: "12px", textTransform: "uppercase", fontWeight: "600" }}>Confirm Password</label>
              <input
                type="password"
                id="signupConfirm"
                className="control-select premium-input"
                style={{ width: "100%", padding: "10px" }}
                value={signupConfirm}
                onChange={(e) => setSignupConfirm(e.target.value)}
                required
              />
            </div>

            {signupError && <p style={{ color: "#ef4444", fontSize: "14px", margin: "0 0 16px 0" }}>{signupError}</p>}
            {signupSuccess && <p style={{ color: "#22c55e", fontSize: "14px", margin: "0 0 16px 0" }}>{signupSuccess}</p>}

            <button
              type="submit"
              className="save-btn"
              style={{ width: "100%", padding: "12px", fontSize: "14px", fontWeight: "600" }}
            >
              CREATE ACCOUNT
            </button>
          </form>
        )}

        <div style={{ marginTop: "40px", padding: "24px", background: "rgba(22, 163, 74, 0.05)", borderRadius: "12px", border: "1px dashed rgba(34, 197, 94, 0.3)", textAlign: "center" }}>
          <h3 style={{ fontSize: "16px", fontWeight: "600", marginBottom: "8px", color: "var(--primary-accent)" }}>Be a Partner Factory</h3>
          <p style={{ fontSize: "13px", color: "var(--color-hint)", lineHeight: "1.5", marginBottom: "16px" }}>
            Do you own a CNC factory or 3D printing facility? Join our distributed network of manufacturers and receive automatic CAD orders straight from our clients.
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => alert("Redirecting to Partner Application...")}
            style={{ padding: "10px 24px", fontSize: "13px", fontWeight: "600", border: "1px solid var(--primary-accent)", color: "var(--primary-accent)", background: "transparent", borderRadius: "6px", cursor: "pointer" }}
          >
            APPLY TO BE A PARTNER
          </button>
        </div>
      </section>
    </div>
  );
}
