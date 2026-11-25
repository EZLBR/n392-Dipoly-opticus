// ============================================================
//   Byte NUL (U+0000): 400, nunca 500
//
//   O PostgreSQL recusa U+0000 em texto. Antes da guarda global,
//   `/api/categories/%00` e um "\u0000" no corpo viravam erro interno.
// ============================================================

import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import { comToken, criarUsuario } from "../helpers/auth.js";
import { esperarProblema } from "../helpers/problem.js";

describe("byte NUL na requisição", () => {
  it.each([
    "/api/categories/%00",
    "/api/products/abc%00def",
    "/api/products?search=%00",
    "/api/stock/product/%00",
  ])("GET %s responde 400", async (rota) => {
    const staff = await criarUsuario("staff");
    const res = await request(app).get(rota).set(...comToken(staff.token));
    esperarProblema(res, 400, "bad-request");
  });

  it("um campo JSON com \\u0000 responde 400 e não grava nada", async () => {
    const staff = await criarUsuario("staff");
    const res = await request(app).post("/api/categories").set(...comToken(staff.token))
      .send({ nome: "Categoria\u0000Nula" });

    esperarProblema(res, 400, "bad-request");
    const { rows } = await pool.query("SELECT count(*)::int AS total FROM categorias");
    expect(rows[0].total).toBe(0);
  });

  it("a guarda olha também campos aninhados", async () => {
    const res = await request(app).post("/api/auth/login")
      .send({ email: "a@exemplo.invalid", password: "x", extra: { lista: ["ok", "nu\u0000l"] } });
    esperarProblema(res, 400, "bad-request");
  });

  it("texto normal com acentos e emoji continua passando", async () => {
    const staff = await criarUsuario("staff");
    const res = await request(app).post("/api/categories").set(...comToken(staff.token))
      .send({ nome: "Óculos ✨ Coleção" });
    expect(res.status).toBe(201);
  });
});
