import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../contexts/LanguageContext";
import { hasRole, homeFor, type Role } from "../routes/access";

/**
 * Guard das rotas privadas (FE-08). O conteúdo protegido só é montado depois
 * que a sessão foi restaurada e validada, então nenhum componente privado
 * dispara consultas para visitantes ou antes da validação.
 */
export default function RequireAuth({ roles, children }: { roles: readonly Role[]; children: React.ReactNode }) {
  const { session, sessionLoading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (sessionLoading) {
    return (
      <p role="status" className="route-loading" style={{ textAlign: "center", padding: "80px 20px", color: "var(--color-hint)" }}>
        {t("app-loading")}
      </p>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }

  if (!hasRole(session.role, roles)) {
    return <Navigate to={homeFor(session.role)} replace />;
  }

  return <>{children}</>;
}
