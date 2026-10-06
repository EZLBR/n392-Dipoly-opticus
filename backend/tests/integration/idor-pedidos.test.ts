// ============================================================
//   TEST-02 — Regressão IDOR/BOLA: pedidos
//
//   Donos do recurso: o cliente que comprou e a fábrica que produz.
//   Staff enxerga todos, por regra explícita.
//
//   A mudança de status em si (BOLA-01) está coberta em
//   orders-status-bola.test.ts. Aqui ficam a listagem, a criação e
//   a troca de identificador no corpo da requisição.
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import prisma from "../../src/config/prisma.js";
import { app } from "../setup/app.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { criarPedido, lerPedido } from "../helpers/orders.js";
import { esperarProblema } from "../helpers/problem.js";

const publicIds = (res: { body: { orders: Array<{ publicId: string }> } }) =>
  res.body.orders.map((o) => o.publicId).sort();

describe("pedidos — autorização de objeto (TEST-02)", () => {
  describe("usuário anônimo recebe 401", () => {
    it("GET /api/orders", async () => {
      esperarProblema(await request(app).get("/api/orders"), 401, "unauthorized");
    });

    it("POST /api/orders — e nenhum pedido é criado", async () => {
      const res = await request(app).post("/api/orders").send({ productName: "x" });

      esperarProblema(res, 401, "unauthorized");
      expect(await prisma.pedido.count()).toBe(0);
    });

    it("POST /api/orders/checkout-cart — e nenhum pedido é criado", async () => {
      const res = await request(app).post("/api/orders/checkout-cart").send({ cartItems: [] });

      esperarProblema(res, 401, "unauthorized");
      expect(await prisma.pedido.count()).toBe(0);
    });
  });

  describe("GET /api/orders — escopo da listagem", () => {
    it("cliente vê apenas os próprios pedidos", async () => {
      const fabrica = await criarUsuario("factory");
      const a = await criarUsuario("client");
      const b = await criarUsuario("client");
      await criarPedido({ dono: a, fabrica });
      await criarPedido({ dono: a, fabrica });
      const deB = await criarPedido({ dono: b, fabrica });

      const res = await request(app).get("/api/orders").set(...comToken(b.token));

      expect(res.status).toBe(200);
      expect(publicIds(res)).toEqual([deB.publicId]);
    });

    it("fábrica vê apenas os pedidos atribuídos a ela", async () => {
      const cliente = await criarUsuario("client");
      const fabricaA = await criarUsuario("factory");
      const fabricaB = await criarUsuario("factory");
      await criarPedido({ dono: cliente, fabrica: fabricaA });
      const deB = await criarPedido({ dono: cliente, fabrica: fabricaB });

      const res = await request(app).get("/api/orders").set(...comToken(fabricaB.token));

      expect(res.status).toBe(200);
      expect(publicIds(res)).toEqual([deB.publicId]);
    });

    it("staff vê os pedidos de todos", async () => {
      const fabrica = await criarUsuario("factory");
      const a = await criarUsuario("client");
      const b = await criarUsuario("client");
      const staff = await criarUsuario("staff");
      const p1 = await criarPedido({ dono: a, fabrica });
      const p2 = await criarPedido({ dono: b, fabrica });

      const res = await request(app).get("/api/orders").set(...comToken(staff.token));

      // A exceção de papel privilegiado precisa de teste que prove que
      // ela funciona, não só de testes que provam os bloqueios.
      expect(res.status).toBe(200);
      expect(publicIds(res)).toEqual([p1.publicId, p2.publicId].sort());
    });
  });

  describe("identificador no corpo não amplia o acesso", () => {
    it("POST /api/orders ignora dono, e-mail e nome enviados no corpo", async () => {
      const fabrica = await criarUsuario("factory");
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");

      const res = await request(app)
        .post("/api/orders")
        .set(...comToken(atacante.token))
        .send({
          productName: "Armacao",
          factoryId: fabrica.id,
          factoryName: "Fabrica",
          total: 450,
          customSpecs: { cor: "preto" },
          usuarioId: vitima.id,
          usuario_id: vitima.id,
          customerEmail: vitima.email,
          customerName: vitima.nome,
        });

      expect(res.status).toBe(201);
      const criado = await prisma.pedido.findFirstOrThrow({
        select: { usuarioId: true, customerEmail: true },
      });
      expect(criado.usuarioId).toBe(atacante.id);
      expect(criado.customerEmail).toBe(atacante.email);

      const daVitima = await request(app).get("/api/orders").set(...comToken(vitima.token));
      expect(daVitima.body.orders).toHaveLength(0);
    });

    it("POST /api/orders/checkout-cart ignora o dono enviado no corpo", async () => {
      const fabrica = await criarUsuario("factory");
      const vitima = await criarUsuario("client");
      const atacante = await criarUsuario("client");

      const res = await request(app)
        .post("/api/orders/checkout-cart")
        .set(...comToken(atacante.token))
        .send({
          usuarioId: vitima.id,
          customerEmail: vitima.email,
          cartItems: [
            {
              productName: "Armacao",
              factoryId: fabrica.id,
              factoryName: "Fabrica",
              total: 450,
              customSpecs: { cor: "preto" },
              quantity: 1,
              usuarioId: vitima.id,
            },
          ],
        });

      expect(res.status).toBe(200);
      const donos = await prisma.pedido.findMany({ select: { usuarioId: true } });
      expect(donos.length).toBeGreaterThan(0);
      expect(donos.every((p) => p.usuarioId === atacante.id)).toBe(true);
    });

    it("PUT /status com factoryId no corpo não transfere o pedido para outra fábrica", async () => {
      const cliente = await criarUsuario("client");
      const fabricaA = await criarUsuario("factory");
      const fabricaB = await criarUsuario("factory");
      const pedido = await criarPedido({ dono: cliente, fabrica: fabricaA });

      const res = await request(app)
        .put(`/api/orders/${pedido.publicId}/status`)
        .set(...comToken(fabricaA.token))
        .send({ status: "In production", factoryId: fabricaB.id, factory_id: fabricaB.id });

      expect(res.status).toBe(200);
      expect((await lerPedido(pedido.publicId))?.factoryId).toBe(fabricaA.id);
    });

    it("PUT /status: fábrica alheia que envia o próprio factoryId no corpo continua bloqueada", async () => {
      const cliente = await criarUsuario("client");
      const fabricaA = await criarUsuario("factory");
      const fabricaB = await criarUsuario("factory");
      const pedido = await criarPedido({ dono: cliente, fabrica: fabricaA });
      const antes = await lerPedido(pedido.publicId);

      const res = await request(app)
        .put(`/api/orders/${pedido.publicId}/status`)
        .set(...comToken(fabricaB.token))
        .send({ status: "Delivered", factoryId: fabricaB.id });

      esperarProblema(res, 404, "not-found");
      expect(await lerPedido(pedido.publicId)).toEqual(antes);
    });
  });
});
