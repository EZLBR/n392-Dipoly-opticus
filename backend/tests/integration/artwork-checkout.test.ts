import { expect, it } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { criarUsuario, comToken } from "../helpers/auth.js";

it.each(["/api/orders", "/api/orders/checkout-cart"])("does not create orders with unapproved artwork through %s", async path => {
  const owner = await criarUsuario();
  const factory = await criarUsuario("factory");
  const item = { productName: "Custom eyewear", factoryId: factory.id, factoryName: "Factory", total: 450,
    customSpecs: { artwork: { version: 1, layers: [{ id: "text-1", text: "Meu nome" }] } } };
  const response = await request(app).post(path).set(...comToken(owner.token))
    .send(path.endsWith("checkout-cart") ? { cartItems: [item] } : item);
  expect(response.status).toBe(400);
  expect((await pool.query("SELECT COUNT(*)::int AS total FROM pedidos")).rows[0].total).toBe(0);
});
