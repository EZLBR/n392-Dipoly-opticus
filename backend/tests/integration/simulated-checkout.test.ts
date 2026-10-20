import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido } from "../helpers/orders.js";

async function billing() {
  const owner = await criarUsuario();
  const order = await criarPedido({ dono: owner, status: "Pending_Payment" });
  await pool.query("UPDATE pedidos SET abacate_billing_id = $1, pagamento_simulado = true WHERE id = $2", ["private-bill", order.id]);
  return owner;
}

describe("SEC-03 — simulated checkout is private", () => {
  it("rejects anonymous reads without returning the customer's personal data", async () => {
    const owner = await billing();
    const response = await request(app).get("/api/payments/simulated-checkout?billingId=private-bill");
    expect(response.status).toBe(401);
    expect(response.text).not.toContain(owner.email);
    expect(response.text).not.toContain(owner.nome);
  });

  it("returns 404 for another account's billing", async () => {
    const owner = await billing();
    const stranger = await criarUsuario();
    const response = await request(app).get("/api/payments/simulated-checkout?billingId=private-bill").set(...comToken(stranger.token));
    expect(response.status).toBe(404);
    expect(response.text).not.toContain(owner.email);
  });

  it("renders only the owner's orders even when a billing identifier is shared", async () => {
    const owner = await billing();
    const stranger = await criarUsuario();
    const otherOrder = await criarPedido({ dono: stranger });
    await pool.query("UPDATE pedidos SET abacate_billing_id = $1, pagamento_simulado = true, product_name = $2 WHERE id = $3", ["private-bill", "OTHER-ACCOUNT-ITEM", otherOrder.id]);
    const response = await request(app).get("/api/payments/simulated-checkout?billingId=private-bill").set(...comToken(owner.token));
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.text).toContain(owner.email);
    expect(response.text).not.toContain("OTHER-ACCOUNT-ITEM");
    expect(response.text).not.toContain(stranger.email);
    expect(response.text).not.toContain(owner.token);
  });
});
