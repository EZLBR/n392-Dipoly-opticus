import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { apiClient, ProblemError } from "../api/client";
import { localizeProblem, useTranslation } from "../contexts/LanguageContext";

export default function PasswordRecovery() {
  const { t, lang } = useTranslation();
  const { pathname, hash } = useLocation();
  const resetting = pathname === "/reset-password";
  const [token] = useState(() => new URLSearchParams(hash.slice(1)).get("token"));
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (resetting && hash) window.history.replaceState(window.history.state, "", pathname);
  }, [resetting, hash, pathname]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      if (resetting) await apiClient.post("/auth/reset-password", { token, password: value });
      else await apiClient.post("/auth/forgot-password", { email: value }, { headers: { "Accept-Language": lang } });
      setValue("");
      setDone(true);
    } catch (failure) {
      const message = failure instanceof ProblemError ? localizeProblem(failure.problem) : t("auth-recovery-error");
      setError(message);
    } finally {
      setPending(false);
    }
  };

  const canSubmit = !resetting || (token !== null && /^[a-f0-9]{64}$/.test(token));
  return (
    <div className="auth-container" style={{ maxWidth: 480, margin: "80px auto", padding: 20 }}>
      <section className="auth-card premium-glass-card" style={{ padding: 30 }}>
        <h2>{t(resetting ? "auth-reset-title" : "auth-forgot-title")}</h2>
        {done ? <p role="status">{t(resetting ? "auth-reset-done" : "auth-forgot-done")}</p> : canSubmit ? (
          <form onSubmit={submit}>
            <div className="form-group">
              <label htmlFor="recovery-value">{t(resetting ? "auth-password-min" : "auth-email")}</label>
              <input id="recovery-value" className="control-select premium-input" type={resetting ? "password" : "email"}
                autoComplete={resetting ? "new-password" : "email"} required
                minLength={resetting ? 8 : undefined} maxLength={resetting ? 72 : 255}
                value={value} onChange={event => setValue(event.target.value)} />
            </div>
            {error && <p role="alert">{error}</p>}
            <button className="save-btn" disabled={pending}>{t("auth-recovery-submit")}</button>
          </form>
        ) : <p role="alert">{t("auth-reset-invalid")} <Link to="/forgot-password">{t("auth-forgot-title")}</Link></p>}
        <p><Link to="/login">{t("auth-tab-login")}</Link></p>
      </section>
    </div>
  );
}
