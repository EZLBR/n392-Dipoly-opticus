import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Request, Response } from "express";
import {
  BadRequestProblem,
  ConflictProblem,
  ForbiddenProblem,
  HttpProblem,
  NotFoundProblem,
} from "../../../src/errors/problem.js";
import * as authController from "../../../src/controllers/authController.js";
import * as categoryController from "../../../src/controllers/categoryController.js";
import * as designController from "../../../src/controllers/designController.js";
import * as orderController from "../../../src/controllers/orderController.js";
import * as paymentController from "../../../src/controllers/paymentController.js";
import * as productController from "../../../src/controllers/productController.js";
import * as stockController from "../../../src/controllers/stockController.js";
import pool from "../../../src/config/db.js";
import { AuthService } from "../../../src/services/authService.js";
import { OrderService } from "../../../src/services/orderService.js";

function mockResponse() {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  // O checkout simulado define Cache-Control (SEC-03) antes de validar a entrada.
  res.set = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe("API-04 / Épico 3 - Contrato de Erros RFC 9457 e Remoção de Envelope", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Critério de Aceite 1: Controllers lançam erros de domínio", () => {
    it("categoryController lança ConflictProblem se categoria já existe", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 } as any);
      const req = { body: { nome: "Óculos de Sol", descricao: "Teste" } } as Request;
      const res = mockResponse();

      await expect(categoryController.createCategory(req, res)).rejects.toThrow(ConflictProblem);
    });

    it("categoryController lança NotFoundProblem se categoria não for encontrada", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const req = { params: { id: "999" } } as unknown as Request;
      const res = mockResponse();

      await expect(categoryController.getCategoryById(req, res)).rejects.toThrow(NotFoundProblem);
    });

    it("designController lança NotFoundProblem se design não existir ou sem permissão", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const req = { params: { id: "des-999" }, user: { email: "user@test.com", id: 1 } } as unknown as Request;
      const res = mockResponse();

      await expect(designController.deleteDesign(req, res)).rejects.toThrow(NotFoundProblem);
    });

    it("orderController lança ForbiddenProblem se role não for autorizado", async () => {
      const req = { user: { role: "guest", email: "guest@test.com", id: 1 }, query: {} } as unknown as Request;
      const res = mockResponse();

      await expect(orderController.getOrders(req, res)).rejects.toThrow(ForbiddenProblem);
    });

    it("paymentController lança NotFoundProblem se pedido não existir", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const req = { body: { orderId: 999 }, user: { id: 1, role: "client" } } as unknown as Request;
      const res = mockResponse();

      await expect(paymentController.createBilling(req, res)).rejects.toThrow(NotFoundProblem);
    });

    it("paymentController lança o mesmo NotFoundProblem se pedido pertencer a outro usuário", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ id: 5, usuario_id: 2, total: "100.00" }],
        rowCount: 1,
      } as any);
      const req = { body: { orderId: 5 }, user: { id: 1, role: "client" } } as unknown as Request;
      const res = mockResponse();

      await expect(paymentController.createBilling(req, res)).rejects.toThrow(
        new NotFoundProblem("Pedido não encontrado."),
      );
    });

    it("paymentController lança BadRequestProblem se billingId estiver ausente no checkout simulado", async () => {
      const req = { query: {} } as Request;
      const res = mockResponse();

      await expect(paymentController.getSimulatedCheckoutPage(req, res)).rejects.toThrow(BadRequestProblem);
    });

    it("productController lança NotFoundProblem se produto não existir", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const req = { params: { id: "999" } } as unknown as Request;
      const res = mockResponse();

      await expect(productController.getProductById(req, res)).rejects.toThrow(NotFoundProblem);
    });

    // CONC-01: a baixa é um UPDATE atômico com guarda no WHERE. Se a guarda
    // barra (nenhuma linha afetada) e o produto existe, a resposta é 409.
    it("stockController lança ConflictProblem se a baixa resultaria em estoque negativo", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
        .mockResolvedValueOnce({ rows: [{ quantidade: 2 }], rowCount: 1 } as any);
      const req = {
        params: { produtoId: "1" },
        body: { quantidade: 5, operacao: "subtract" },
      } as unknown as Request;
      const res = mockResponse();

      await expect(stockController.updateStock(req, res)).rejects.toThrow(ConflictProblem);
    });
  });

  describe("Critério de Aceite 2: Respostas de sucesso retornam o recurso sem envelope", () => {
    it("authController.register retorna { user, token } sem envelope success", async () => {
      const mockResult = {
        user: { id: 1, name: "Maria", email: "maria@test.com", role: "client", factoryName: null, createdAt: null },
        token: "jwt-token-123",
      };
      vi.spyOn(AuthService, "register").mockResolvedValueOnce(mockResult);

      const req = { body: { name: "Maria", email: "maria@test.com", password: "Password123" } } as Request;
      const res = mockResponse();

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(mockResult);
      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
    });

    it("authController.login retorna { user, token } sem envelope success", async () => {
      const mockResult = {
        user: { id: 1, name: "Maria", email: "maria@test.com", role: "client", factoryName: null, createdAt: null },
        token: "jwt-token-123",
      };
      vi.spyOn(AuthService, "login").mockResolvedValueOnce(mockResult);

      const req = { body: { email: "maria@test.com", password: "Password123" } } as Request;
      const res = mockResponse();

      await authController.login(req, res);

      expect(res.json).toHaveBeenCalledWith(mockResult);
      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
    });

    it("authController.getMe retorna o usuário sem envelope success", async () => {
      const mockUser = { id: 1, name: "Maria", email: "maria@test.com", role: "client", factoryName: null, createdAt: null };
      vi.spyOn(AuthService, "getProfile").mockResolvedValueOnce(mockUser);

      const req = { user: { id: 1 } } as unknown as Request;
      const res = mockResponse();

      await authController.getMe(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.id).toBe(1);
      expect(payload.user).toEqual(mockUser);
    });

    it("categoryController.createCategory retorna a categoria criada sem envelope success", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any) // check existing
        .mockResolvedValueOnce({ rows: [{ id: 10 }], rowCount: 1 } as any) // insert
        .mockResolvedValueOnce({ rows: [{ id: 10, nome: "Esportivo", descricao: "Leve" }], rowCount: 1 } as any); // select

      const req = { body: { nome: "Esportivo", descricao: "Leve" } } as Request;
      const res = mockResponse();

      await categoryController.createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.id).toBe(10);
      expect(payload.nome).toBe("Esportivo");
    });

    it("designController.getDesigns retorna { designs } sem envelope success", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{
          id: "des-1",
          name: "Design 1",
          model: "wayfarer",
          color: "#000",
          is_sunglasses: false,
          anti_reflective: true,
          temple_style: "standard",
          top_bar: false,
          bridge_style: "keyhole",
          frame_profile: "medium",
          temple_open: "0.00",
          published: true,
          created_at: new Date(),
          updated_at: new Date(),
        }],
        rowCount: 1,
      } as any);

      const req = { user: { email: "user@test.com" } } as unknown as Request;
      const res = mockResponse();

      await designController.getDesigns(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(Array.isArray(payload.designs)).toBe(true);
      expect(payload.designs[0].id).toBe("des-1");
    });

    it("orderController.getOrders retorna { orders, pagination } sem envelope success", async () => {
      vi.spyOn(pool, "query")
        .mockResolvedValueOnce({ rows: [{ count: "1" }], rowCount: 1 } as any)
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            publicId: "01J00000000000000000000001",
            customerName: "Maria",
            customerEmail: "maria@test.com",
            productName: "Armação",
            factoryId: 2,
            factoryName: "Fábrica A",
            status: "Pending Payment",
            total: "350.00",
            customSpecs: "{}",
            abacateBillingId: null,
            createdAt: "2026-10-14",
            updatedAt: "2026-10-14",
          }],
          rowCount: 1,
        } as any);

      const req = {
        user: { role: "client", email: "maria@test.com", id: 1 },
        query: { page: "1", limit: "10" },
      } as unknown as Request;
      const res = mockResponse();

      await orderController.getOrders(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(Array.isArray(payload.orders)).toBe(true);
      expect(payload).toHaveProperty("pagination");
    });

    it("productController.getProductById retorna o produto sem envelope success", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ id: 42, nome: "Armação Titanium", preco: 299.9 }],
        rowCount: 1,
      } as any);

      const req = { params: { id: "42" } } as unknown as Request;
      const res = mockResponse();

      await productController.getProductById(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.id).toBe(42);
      expect(payload.nome).toBe("Armação Titanium");
    });

    it("stockController.getStockByProduct retorna { estoque, alerta } sem envelope success", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({
        rows: [{ id: 1, produto_id: 10, quantidade: 20, estoque_minimo: 5, nome: "Armação Titanium", preco: 299.9 }],
        rowCount: 1,
      } as any);

      const req = { params: { produtoId: "10" } } as unknown as Request;
      const res = mockResponse();

      await stockController.getStockByProduct(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.estoque.produto_id).toBe(10);
      expect(payload.alerta).toBe(false);
    });
  });
});
