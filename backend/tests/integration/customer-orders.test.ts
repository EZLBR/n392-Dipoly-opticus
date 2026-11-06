import { randomUUID } from "node:crypto";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { comToken, criarUsuario, type UsuarioDeTeste } from "../helpers/auth.js";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";

async function createOrder(owner: UsuarioDeTeste, email = owner.email) {
  const { rows: [order] } = await pool.query<{ id: number; publicId: string }>(
    `INSERT INTO pedidos (usuario_id, customer_name, customer_email, product_name, total, custom_specs)
     VALUES ($1, $2, $3, 'Óculos redondo', 159.90, '{"model":"round","quantity":2}')
     RETURNING id, "publicId"`,
    [owner.id, owner.nome, email],
  );
  return order;
}

describe("Customer order history", () => {
  it("returns only the authenticated customer's orders by account ID", async () => {
    const owner = await criarUsuario();
    const other = await criarUsuario();
    const owned = await createOrder(owner, "email-antigo@exemplo.invalid");
    const otherOrder = await createOrder(other, owner.email);
    const authorization = comToken(owner.token);
    const list = await request(app).get("/api/orders/mine").set(...authorization);
    expect(list.status).toBe(200);
    expect(list.headers["cache-control"]).toBe("private, no-store");
    expect(list.body.orders).toEqual([expect.objectContaining({ publicId: owned.publicId, total: "159.90" })]);
    expect(list.body.orders[0]).not.toHaveProperty("customerEmail");
    const legacyList = await request(app).get("/api/orders").set(...authorization);
    expect(legacyList.status).toBe(200);
    expect(legacyList.body.orders.map((order: { publicId: string }) => order.publicId)).toEqual([owned.publicId]);
    const detail = await request(app).get(`/api/orders/mine/${owned.publicId}`).set(...authorization);
    expect(detail.status).toBe(200);
    expect(detail.body.order).toMatchObject({
      publicId: owned.publicId, productName: "Óculos redondo", total: "159.90", status: "Pending Payment",
      customSpecs: { model: "round", quantity: 2 },
    });
    for (const hidden of [otherOrder.publicId, randomUUID(), "bad-id"]) {
      const denied = await request(app).get(`/api/orders/mine/${hidden}`).set(...authorization);
      expect(denied.status).toBe(404);
      expect(denied.body).toMatchObject({ type: "https://opticus.example/problems/not-found", detail: "Pedido não encontrado." });
    }
  });

  it("requires a client session and bounds the page and page size", async () => {
    const factory = await criarUsuario("factory");
    expect((await request(app).get("/api/orders/mine")).status).toBe(401);
    expect((await request(app).get("/api/orders/mine").set(...comToken(factory.token))).status).toBe(403);
    const owner = await criarUsuario();
    const first = await createOrder(owner);
    const second = await createOrder(owner);
    const authorization = comToken(owner.token);
    const list = await request(app).get("/api/orders/mine?page=2&limit=1").set(...authorization);
    expect(list.status).toBe(200);
    expect(list.body).toMatchObject({
      orders: [{ publicId: first.publicId }],
      pagination: { page: 2, limit: 1, totalItems: 2, totalPages: 2 },
    });
    expect(list.body.orders.map((order: { publicId: string }) => order.publicId)).not.toContain(second.publicId);
    for (const query of ["page=0", "limit=101", "page=2.5", "page=2&page=3"]) {
      expect((await request(app).get(`/api/orders/mine?${query}`).set(...authorization)).status).toBe(400);
    }
  });

  it("records creation and committed changes, skipping no-op and rolled-back changes", async () => {
    const owner = await criarUsuario();
    const order = await createOrder(owner);
    await pool.query("UPDATE pedidos SET status = 'Queued' WHERE id = $1", [order.id]);
    await pool.query("UPDATE pedidos SET status = 'Queued' WHERE id = $1", [order.id]);
    const connection = await pool.connect();
    try {
      await connection.query("BEGIN");
      await connection.query("UPDATE pedidos SET status = 'Cancelled' WHERE id = $1", [order.id]);
    } finally {
      await connection.query("ROLLBACK");
      connection.release();
    }
    await pool.query("UPDATE pedidos SET status = 'In production' WHERE id = $1", [order.id]);
    const detail = await request(app).get(`/api/orders/mine/${order.publicId}`).set(...comToken(owner.token));
    expect(detail.status).toBe(200);
    expect(detail.body.order.status).toBe("In production");
    expect(detail.body.order.history).toEqual([
      expect.objectContaining({ kind: "created", fromStatus: null, toStatus: "Pending Payment", occurredAt: expect.any(String) }),
      expect.objectContaining({ kind: "transition", fromStatus: "Pending Payment", toStatus: "Queued", occurredAt: expect.any(String) }),
      expect.objectContaining({ kind: "transition", fromStatus: "Queued", toStatus: "In production", occurredAt: expect.any(String) }),
    ]);
  });
});
