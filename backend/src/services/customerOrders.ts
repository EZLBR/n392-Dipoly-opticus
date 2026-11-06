import pool from "../config/db.js";

interface CustomerOrder {
  publicId: string;
  productName: string;
  total: string;
  status: string | null;
  createdAt: string | null;
}

interface StatusEvent {
  kind: "baseline" | "created" | "transition";
  fromStatus: string | null;
  toStatus: string | null;
  occurredAt: string;
}

const orderFields = `
  p."publicId",
  p.product_name AS "productName",
  p.total::text AS total,
  p.status,
  p.criado_em AT TIME ZONE 'UTC' AS "createdAt"
`;

export async function listCustomerOrders(userId: number, page: number, limit: number) {
  const { rows: [result] } = await pool.query<{ orders: CustomerOrder[]; totalItems: number }>(
    `WITH page AS (
       SELECT ${orderFields}, p.id
       FROM pedidos p WHERE p.usuario_id = $1
       ORDER BY p.criado_em DESC NULLS LAST, p.id DESC LIMIT $2 OFFSET $3
     )
     SELECT
       COALESCE(jsonb_agg(to_jsonb(page) - 'id' ORDER BY page."createdAt" DESC NULLS LAST, page.id DESC), '[]') AS orders,
       (SELECT COUNT(*)::integer FROM pedidos WHERE usuario_id = $1) AS "totalItems"
     FROM page`,
    [userId, limit, (page - 1) * limit],
  );
  return {
    orders: result.orders,
    pagination: { page, limit, totalItems: result.totalItems, totalPages: Math.ceil(result.totalItems / limit) },
  };
}

function readSpecifications(serialized: string | null): Record<string, unknown> {
  if (!serialized) return {};
  try {
    const value: unknown = JSON.parse(serialized);
    return value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function findCustomerOrder(userId: number, publicId: string) {
  const { rows: [order] } = await pool.query<CustomerOrder & {
    customSpecs: string | null;
    history: StatusEvent[];
  }>(
    `SELECT ${orderFields}, p.custom_specs AS "customSpecs",
       COALESCE((
         SELECT jsonb_agg(jsonb_build_object(
           'kind', h.kind, 'fromStatus', h.from_status, 'toStatus', h.to_status, 'occurredAt', h.occurred_at
         ) ORDER BY h.id)
         FROM order_status_history h WHERE h.order_id = p.id
       ), '[]') AS history
     FROM pedidos p WHERE p.usuario_id = $1 AND p."publicId" = $2`,
    [userId, publicId],
  );
  return order ? { ...order, customSpecs: readSpecifications(order.customSpecs) } : undefined;
}
