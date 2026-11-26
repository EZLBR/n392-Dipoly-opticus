// ============================================================
//   DB-03 — Pedidos: contrato da API
//
//   Falam com a API, não com a implementação. Passavam iguais com
//   o controller em SQL puro: são a prova de que a migração para o
//   Prisma não mudou nada para quem consome. Autorização, preço,
//   cobrança real e versão têm testes próprios (idor-pedidos,
//   pedidos-preco-servidor, cobranca-producao, pedido-versao).
// ============================================================

import { describe, it, expect } from "vitest";
import request from "supertest";
import { app } from "../setup/app.js";
import { pool } from "../setup/db.js";
import prisma from "../../src/config/prisma.js";
import { criarUsuario, comToken } from "../helpers/auth.js";
import { especificacaoDoStudio, PRECO_DA_ESPECIFICACAO_PADRAO } from "../helpers/especificacao.js";
import { esperarProblema } from "../helpers/problem.js";

const CAMPOS_PEDIDO = [
  "abacateBillingId", "createdAt", "customSpecs", "customerEmail", "customerName", "factoryName",
  "factoryPublicId", "items", "productName", "publicId", "status", "total", "updatedAt", "version",
];

const item = (extra: Record<string, unknown> = {}) => ({
  productName: "Armação", factoryName: "Fábrica", customSpecs: especificacaoDoStudio(), ...extra,
});

/** Meia-noite UTC do dia, como o DATE do PostgreSQL chega num processo em UTC. */
const meiaNoite = (data: Date) => `${data.toISOString().slice(0, 10)}T00:00:00.000Z`;

describe("pedidos — contrato da API (DB-03)", () => {
  describe("POST /api/orders", () => {
    it("devolve o pedido criado, repetido em order, com os campos públicos", async () => {
      const cliente = await criarUsuario("client");
      const fabrica = await criarUsuario("factory");

      const res = await request(app).post("/api/orders").set(...comToken(cliente.token))
        .send(item({ factoryPublicId: fabrica.publicId, quantity: 2 }));

      expect(res.status).toBe(201);
      expect(Object.keys(res.body).sort()).toEqual([...CAMPOS_PEDIDO, "order"].sort());
      expect(res.body.order).toEqual(Object.fromEntries(CAMPOS_PEDIDO.map(campo => [campo, res.body[campo]])));
      expect(res.body).toMatchObject({
        customerName: cliente.nome, customerEmail: cliente.email, productName: "Armação",
        factoryPublicId: fabrica.publicId, factoryName: "Fábrica", status: "Pending Payment",
        version: 0, total: (Number(PRECO_DA_ESPECIFICACAO_PADRAO) * 2).toFixed(2), abacateBillingId: null,
        customSpecs: { ...especificacaoDoStudio(), quantity: 2 },
      });
      expect(res.body.createdAt).toBe(meiaNoite(new Date()));
      expect(res.body.updatedAt).toBe(res.body.createdAt);
      // FEAT-04: o item gravado, com o preço unitário do servidor e sem a
      // quantidade dentro da especificação.
      expect(res.body.items).toEqual([{
        publicId: expect.any(String), productName: "Armação", customSpecs: especificacaoDoStudio(), quantity: 2,
        unitPrice: PRECO_DA_ESPECIFICACAO_PADRAO, total: (Number(PRECO_DA_ESPECIFICACAO_PADRAO) * 2).toFixed(2),
      }]);
    });

    it("sem fábrica no corpo, o pedido vai para a fábrica mais antiga", async () => {
      const cliente = await criarUsuario("client");
      const primeira = await criarUsuario("factory");
      await criarUsuario("factory");

      const res = await request(app).post("/api/orders").set(...comToken(cliente.token)).send(item());

      expect(res.status).toBe(201);
      expect(res.body.factoryPublicId).toBe(primeira.publicId);
    });

    it("sem nenhuma fábrica cadastrada, o pedido nasce sem fábrica", async () => {
      const cliente = await criarUsuario("client");

      const res = await request(app).post("/api/orders").set(...comToken(cliente.token)).send(item());

      expect(res.status).toBe(201);
      expect(res.body.factoryPublicId).toBeNull();
    });

    it.each(["client", "staff"] as const)("publicId de um %s como fábrica responde 400 e nada é criado", async (papel) => {
      const cliente = await criarUsuario("client");
      const naoFabrica = await criarUsuario(papel);

      const res = await request(app).post("/api/orders").set(...comToken(cliente.token))
        .send(item({ factoryPublicId: naoFabrica.publicId }));

      esperarProblema(res, 400, "bad-request");
      expect(res.body.detail).toBe("Fábrica não encontrada.");
      expect(await prisma.pedido.count()).toBe(0);
    });

    it("token de um usuário que não existe mais não cria pedido: 401", async () => {
      const cliente = await criarUsuario("client");
      await prisma.usuario.delete({ where: { id: cliente.id } });

      const res = await request(app).post("/api/orders").set(...comToken(cliente.token)).send(item());

      esperarProblema(res, 401, "unauthorized");
      expect(await prisma.pedido.count()).toBe(0);
    });
  });

  describe("GET /api/orders", () => {
    async function pedidoEm(dono: { id: number }, nome: string, dia: string, fabricaId: number | null = null) {
      return prisma.pedido.create({
        data: {
          usuarioId: dono.id, customerName: "Cliente", customerEmail: "c@exemplo.invalid", productName: nome,
          factoryId: fabricaId, total: "450.00", customSpecs: '{"model":"round"}', criadoEm: new Date(`2026-01-${dia}T15:00:00Z`),
        },
      });
    }

    it("lista do mais novo para o mais antigo, com os campos públicos e paginação", async () => {
      const cliente = await criarUsuario("client");
      await pedidoEm(cliente, "Antigo", "01");
      await pedidoEm(cliente, "Novo", "03");
      await pedidoEm(cliente, "Meio", "02");

      const res = await request(app).get("/api/orders").query({ page: 1, limit: 2 }).set(...comToken(cliente.token));

      expect(res.status).toBe(200);
      expect(res.body.orders.map((pedido: { productName: string }) => pedido.productName)).toEqual(["Novo", "Meio"]);
      expect(Object.keys(res.body.orders[0]).sort()).toEqual(CAMPOS_PEDIDO);
      expect(res.body.orders[0]).toMatchObject({
        status: "Pending Payment", total: "450.00", customSpecs: { model: "round" }, factoryPublicId: null,
        createdAt: "2026-01-03T00:00:00.000Z",
      });
      expect(res.body.pagination).toEqual({ page: 1, limit: 2, totalItems: 3, totalPages: 2 });
    });

    it("especificação vazia na linha chega como objeto vazio", async () => {
      const cliente = await criarUsuario("client");
      await prisma.pedido.create({
        data: { usuarioId: cliente.id, customerName: "C", customerEmail: "c@exemplo.invalid", productName: "Sem specs", total: "1.00" },
      });

      const res = await request(app).get("/api/orders").set(...comToken(cliente.token));

      expect(res.body.orders[0].customSpecs).toEqual({});
    });

    it("cada papel vê o seu recorte: cliente os dele, fábrica os atribuídos, staff todos", async () => {
      const cliente = await criarUsuario("client");
      const outro = await criarUsuario("client");
      const fabrica = await criarUsuario("factory");
      const staff = await criarUsuario("staff");
      await pedidoEm(cliente, "Do cliente na fábrica", "01", fabrica.id);
      await pedidoEm(outro, "De outro, sem fábrica", "02");

      const ver = async (token: string) => (await request(app).get("/api/orders").set(...comToken(token))).body;

      expect((await ver(cliente.token)).orders.map((p: { productName: string }) => p.productName)).toEqual(["Do cliente na fábrica"]);
      expect((await ver(fabrica.token)).orders.map((p: { productName: string }) => p.productName)).toEqual(["Do cliente na fábrica"]);
      expect((await ver(staff.token)).pagination.totalItems).toBe(2);
    });

    it("paginação inválida responde 400", async () => {
      const cliente = await criarUsuario("client");

      esperarProblema(await request(app).get("/api/orders").query({ page: 0 }).set(...comToken(cliente.token)), 400, "bad-request");
    });
  });

  describe("POST /api/orders/checkout-cart (simulador)", () => {
    it("cria um pedido por fábrica, todos na mesma cobrança simulada, com os itens de cada uma", async () => {
      const cliente = await criarUsuario("client");
      const fabricaA = await criarUsuario("factory");
      const fabricaB = await criarUsuario("factory");

      const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
        cartItems: [
          item({ productName: "Item A", factoryPublicId: fabricaA.publicId }),
          item({ productName: "Item B", factoryPublicId: fabricaB.publicId, quantity: 3 }),
          item({ productName: "Item padrão" }),
        ],
      });

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(["billingId", "checkoutUrl", "isSimulated"]);
      expect(res.body.isSimulated).toBe(true);
      const url = new URL(res.body.checkoutUrl);
      expect(url.pathname).toBe("/api/payments/simulated-checkout");
      expect(url.searchParams.get("billingId")).toBe(res.body.billingId);
      const { rows } = await pool.query(
        `SELECT p.product_name, f."publicId" AS fabrica, p.total::text, p.status, p.pagamento_simulado, p.abacate_billing_id
           FROM pedidos p LEFT JOIN usuarios f ON f.id = p.factory_id ORDER BY p.id`);
      // FEAT-04: o item sem fábrica vai para a padrão (a mais antiga, A) e
      // entra no pedido dela; a ordem é a da primeira aparição de cada fábrica.
      expect(rows).toEqual([
        { product_name: "Item A (+1)", fabrica: fabricaA.publicId, total: (Number(PRECO_DA_ESPECIFICACAO_PADRAO) * 2).toFixed(2), status: "Pending Payment", pagamento_simulado: true, abacate_billing_id: res.body.billingId },
        { product_name: "Item B", fabrica: fabricaB.publicId, total: (Number(PRECO_DA_ESPECIFICACAO_PADRAO) * 3).toFixed(2), status: "Pending Payment", pagamento_simulado: true, abacate_billing_id: res.body.billingId },
      ]);
      const { rows: itens } = await pool.query(
        `SELECT p.product_name AS pedido, i.product_name AS item, i.quantidade
           FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id ORDER BY p.id, i.id`);
      expect(itens).toEqual([
        { pedido: "Item A (+1)", item: "Item A", quantidade: 1 },
        { pedido: "Item A (+1)", item: "Item padrão", quantidade: 1 },
        { pedido: "Item B", item: "Item B", quantidade: 3 },
      ]);
    });

    it("uma fábrica inválida no meio do carrinho não cria nenhum pedido", async () => {
      const cliente = await criarUsuario("client");
      const fabrica = await criarUsuario("factory");

      const res = await request(app).post("/api/orders/checkout-cart").set(...comToken(cliente.token)).send({
        cartItems: [item({ factoryPublicId: fabrica.publicId }), item({ factoryPublicId: "fabrica-inexistente" })],
      });

      esperarProblema(res, 400, "bad-request");
      expect(res.body.detail).toBe("Fábrica não encontrada.");
      expect(await prisma.pedido.count()).toBe(0);
    });
  });
});
