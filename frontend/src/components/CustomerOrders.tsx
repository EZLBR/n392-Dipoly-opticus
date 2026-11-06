import React, { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { apiClient, ProblemError } from "../api/client";
import { useAuth } from "../contexts/AuthContext";
import { useTranslation } from "../contexts/LanguageContext";
import { label } from "../eyewear/config";
import "./customer-orders.css";

interface OrderSummary {
  publicId: string;
  productName: string;
  total: string;
  status: string | null;
  createdAt: string | null;
}

interface OrderDetail extends OrderSummary {
  customSpecs: Record<string, unknown>;
  history: Array<{
    kind: "baseline" | "created" | "transition";
    fromStatus: string | null;
    toStatus: string | null;
    occurredAt: string;
  }>;
}

type OrderResponse = { order: OrderDetail } | {
  orders: OrderSummary[];
  pagination: { page: number; totalPages: number };
};

type RequestState =
  | { status: "loading" }
  | { status: "error"; notFound: boolean }
  | { status: "ready"; data: OrderResponse };

const statusKeys = new Map([
  ["Pending Payment", "order-status-pending"],
  ["Queued", "order-status-queued"],
  ["In production", "order-status-production"],
  ["Delivered", "order-status-delivered"],
  ["Cancelled", "order-status-cancelled"],
]);

const specFields = [
  ["frontModel", "model", "order-spec-model"],
  ["templeModel", "temple_model", "order-spec-temple"],
  ["frameProfile", "profile", "order-spec-profile"],
  ["frameMaterial", "material", "order-spec-material"],
  ["color", "color", "order-spec-color"],
  ["finish", "finish", "order-spec-finish"],
  ["isSunglasses", "is_sunglasses", "order-spec-sunglasses"],
  ["lensMaterial", "lens_material", "order-spec-lens"],
  ["lensTreatments", "lens_treatments", "order-spec-treatments"],
  ["nosePadMaterial", "nose_pad_material", "order-spec-pads"],
  ["templeTipMaterial", "temple_tip_material", "order-spec-tips"],
  ["hingeMaterial", "hinge_material", "order-spec-hinges"],
  ["templeOpen", "temple_open", "order-spec-angle"],
  ["templeStyle", "temple_style", "order-spec-temple-style"],
  ["bridgeStyle", "bridge_style", "order-spec-bridge-style"],
  ["prescriptionUploaded", "prescription_uploaded", "order-spec-prescription"],
  ["quantity", "quantity", "order-spec-quantity"],
] as const;

function Specifications({ specs }: { specs: Record<string, unknown> }) {
  const { t, language } = useTranslation();
  const formatValue = (value: unknown): string | undefined => {
    if (typeof value === "string" && value) return label(value, language);
    if (typeof value === "number") return String(value);
    if (typeof value === "boolean") return t(value ? "orders-yes" : "orders-no");
    if (Array.isArray(value)) {
      const names = value.filter((item): item is string => typeof item === "string" && item.length > 0);
      return names.length ? names.map(item => label(item, language)).join(", ") : t("orders-none");
    }
  };
  const entries = specFields.flatMap(([key, legacyKey, labelKey]) => {
    const raw = specs[key] ?? specs[legacyKey];
    const value = key === "templeOpen" && typeof raw === "number"
      ? `${Math.round(raw * 180 / Math.PI)}°`
      : formatValue(raw);
    return value === undefined ? [] : [{ labelKey, value }];
  });
  return (
    <section className="customer-orders-section" aria-labelledby="order-specs-heading">
      <h2 id="order-specs-heading">{t("orders-specs")}</h2>
      {entries.length ? (
        <dl className="customer-order-fields">
          {entries.map(({ labelKey, value }) => <div key={labelKey}><dt>{t(labelKey)}</dt><dd>{value}</dd></div>)}
        </dl>
      ) : <p>{t("orders-no-specs")}</p>}
    </section>
  );
}

function OrderView({ token, publicId, page }: { token: string; publicId?: string; page: number }) {
  const { t, language } = useTranslation();
  const [state, setState] = useState<RequestState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    const path = publicId ? `/${encodeURIComponent(publicId)}` : `?page=${page}`;
    const isCurrent = () => !abort.signal.aborted && localStorage.getItem("opticus_token") === token;
    apiClient.get<OrderResponse>(`/orders/mine${path}`, {
      signal: abort.signal,
      headers: { Authorization: `Bearer ${token}` },
    }).then(data => {
      if (isCurrent()) setState({ status: "ready", data });
    }).catch(error => {
      if (isCurrent()) setState({ status: "error", notFound: error instanceof ProblemError && error.status === 404 });
    });
    return () => abort.abort();
  }, [token, publicId, page, attempt]);

  const locale = language === "pt" ? "pt-BR" : "en";
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "BRL" });
  const dateTime = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const date = (value: string | null) => value && !Number.isNaN(Date.parse(value))
    ? <time dateTime={value}>{dateTime.format(new Date(value))}</time>
    : t("orders-unknown");
  const status = (value: string | null) => t(statusKeys.get(value ?? "") ?? "orders-unknown");

  if (state.status === "loading") return <p role="status">{t("orders-loading")}</p>;
  if (state.status === "error") return (
    <div className="customer-orders-section">
      <p role="alert">{t(state.notFound ? "orders-not-found" : "orders-error")}</p>
      {!state.notFound && (
        <button className="btn" onClick={() => {
          setState({ status: "loading" });
          setAttempt(current => current + 1);
        }}>{t("orders-retry")}</button>
      )}
    </div>
  );

  const { data } = state;
  if ("order" in data) {
    const { order } = data;
    return (
      <article>
        <header className="customer-orders-section">
          <h2>{order.productName}</h2>
          <dl className="customer-order-fields">
            <div><dt>{t("orders-status")}</dt><dd>{status(order.status)}</dd></div>
            <div><dt>{t("orders-total")}</dt><dd>{money.format(Number(order.total))}</dd></div>
            <div><dt>{t("orders-date")}</dt><dd>{date(order.createdAt)}</dd></div>
          </dl>
        </header>
        <Specifications specs={order.customSpecs} />
        <section className="customer-orders-section" aria-labelledby="order-history-heading">
          <h2 id="order-history-heading">{t("orders-history")}</h2>
          {order.history.length ? (
            <ol className="customer-order-history">
              {order.history.map((event, index) => (
                <li key={index}>
                  <strong>{t(`orders-event-${event.kind}`)}</strong>
                  <span>{event.kind === "transition" ? `${status(event.fromStatus)} → ${status(event.toStatus)}` : status(event.toStatus)}</span>
                  {date(event.occurredAt)}
                </li>
              ))}
            </ol>
          ) : <p>{t("orders-no-history")}</p>}
        </section>
      </article>
    );
  }

  const { orders, pagination } = data;
  return (
    <>
      {orders.length ? (
        <ul className="customer-order-list">
          {orders.map(order => (
            <li key={order.publicId} className="customer-orders-section">
              <Link to={`/orders/${encodeURIComponent(order.publicId)}`}>{order.productName}</Link>
              <span>{status(order.status)}</span>
              <span>{money.format(Number(order.total))}</span>
              {date(order.createdAt)}
            </li>
          ))}
        </ul>
      ) : <p>{t(pagination.totalPages === 0 ? "orders-empty" : "orders-page-empty")}</p>}
      {(pagination.totalPages > 1 || page > 1) && (
        <nav className="customer-order-pages" aria-label={t("orders-pages")}>
          {page > 1 && <Link className="btn" to={`/orders?page=${Math.min(page - 1, Math.max(1, pagination.totalPages))}`}>{t("orders-previous")}</Link>}
          {page < pagination.totalPages && <Link className="btn" to={`/orders?page=${page + 1}`}>{t("orders-next")}</Link>}
        </nav>
      )}
    </>
  );
}

export default function CustomerOrders() {
  const { session, sessionToken, sessionLoading } = useAuth();
  const { t } = useTranslation();
  const { publicId } = useParams();
  const [search] = useSearchParams();
  const requestedPage = Number(search.get("page"));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 && requestedPage <= 100_000 ? requestedPage : 1;
  const token = sessionToken === localStorage.getItem("opticus_token") ? sessionToken : null;

  return (
    <section className="customer-orders" aria-labelledby="customer-orders-heading">
      {publicId && <Link className="customer-orders-back" to="/orders">{t("orders-back")}</Link>}
      <h1 id="customer-orders-heading">{t(publicId ? "orders-detail" : "nav-orders")}</h1>
      {sessionLoading ? <p role="status">{t("orders-loading")}</p>
        : !session || !token ? <p><Link to="/login">{t("orders-sign-in")}</Link></p>
        : session.role !== "client" ? <p>{t("orders-forbidden")}</p>
        : <OrderView key={JSON.stringify([token, publicId, page])} token={token} publicId={publicId} page={page} />}
    </section>
  );
}
