// ============================================================
//   Teste de fumaça — prova que o arnês está de pé
//
//   Se estes passam, então: a app monta sem abrir porta, o
//   Supertest fala com ela, o banco de teste responde e os
//   fixtures criam identidade com token.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { pool } from "../setup/db.js";

describe("infraestrutura de teste", () => {
  it("GET /health responde 200", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("rota inexistente responde 404", async () => {
    const res = await request(app).get("/rota-que-nao-existe");

    expect(res.status).toBe(404);
  });

  it("cria usuário com papel e devolve token utilizável", async () => {
    const fabrica = await criarUsuario("factory");

    expect(fabrica.id).toBeGreaterThan(0);
    expect(fabrica.papel).toBe("factory");
    expect(fabrica.token).toBeTruthy();

    // O token funciona de verdade contra uma rota protegida.
    const res = await request(app).get("/api/auth/me").set(...comToken(fabrica.token));

    expect(res.status).toBe(200);
  });

  it("rota protegida rejeita requisição anônima com 401", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("cada teste começa com o banco limpo", async () => {
    const { rows } = await pool.query<{ total: string }>("SELECT COUNT(*) AS total FROM usuarios");

    // O teste anterior criou uma fábrica. Se a limpeza entre testes
    // não estivesse funcionando, esta contagem viria maior que zero —
    // e a suíte passaria a depender da ordem de execução.
    expect(Number(rows[0].total)).toBe(0);
  });

  it("papéis diferentes recebem tokens distintos e independentes", async () => {
    const cliente = await criarUsuario("client");
    const staff = await criarUsuario("staff");

    expect(cliente.email).not.toBe(staff.email);
    expect(cliente.token).not.toBe(staff.token);

    // Rota que exige papel staff: o cliente é barrado, o staff passa.
    const negado = await request(app).get("/api/auth/users").set(...comToken(cliente.token));
    const permitido = await request(app).get("/api/auth/users").set(...comToken(staff.token));

    expect(negado.status).toBe(403);
    expect(permitido.status).toBe(200);
  });
});
