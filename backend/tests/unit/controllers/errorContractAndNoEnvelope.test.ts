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
import { CategoryService } from "../../../src/services/categoryService.js";
import { OrderService } from "../../../src/services/orderService.js";
import { PaymentService } from "../../../src/services/paymentService.js";
import { ProductService } from "../../../src/services/productService.js";
import { StockService } from "../../../src/services/stockService.js";

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
      vi.spyOn(CategoryService, "create").mockRejectedValueOnce(new ConflictProblem("Já existe uma categoria com esse nome."));
      const req = { body: { nome: "Óculos de Sol", descricao: "Teste" } } as Request;
      const res = mockResponse();

      await expect(categoryController.createCategory(req, res)).rejects.toThrow(ConflictProblem);
    });

    it("categoryController lança NotFoundProblem se categoria não for encontrada", async () => {
      vi.spyOn(CategoryService, "getByPublicId").mockRejectedValueOnce(new NotFoundProblem("Categoria não encontrada."));
      const req = { params: { publicId: "categoria-inexistente" } } as unknown as Request;
      const res = mockResponse();

      await expect(categoryController.getCategoryById(req, res)).rejects.toThrow(NotFoundProblem);
    });

    it("designController lança NotFoundProblem se design não existir ou sem permissão", async () => {
      vi.spyOn(pool, "query").mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);
      const req = { params: { id: "des-999" }, user: { email: "user@test.com", publicId: "usuario-1" } } as unknown as Request;
      const res = mockResponse();

      await expect(designController.deleteDesign(req, res)).rejects.toThrow(NotFoundProblem);
    });

    it("orderController lança ForbiddenProblem se role não for autorizado", async () => {
      const req = { user: { role: "guest", email: "guest@test.com", publicId: "usuario-1" }, query: {} } as unknown as Request;
      const res = mockResponse();

      await expect(orderController.getOrders(req, res)).rejects.toThrow(ForbiddenProblem);
    });

    // DB-03: a consulta escopada está no PaymentService e é coberta contra o
    // banco em idor-pagamentos.test.ts. Aqui, o controller entrega ao service
    // a identidade do token e propaga o 404.
    it("paymentController lança NotFoundProblem se pedido não existir ou for de outro usuário", async () => {
      const criar = vi.spyOn(PaymentService, "criarCobranca").mockRejectedValueOnce(new NotFoundProblem("Pedido não encontrado."));
      const req = {
        body: { orderPublicId: "pedido-5" },
        user: { publicId: "usuario-1", role: "client" },
        headers: {},
        protocol: "http",
        get: () => "api.test",
      } as unknown as Request;
      const res = mockResponse();

      await expect(paymentController.createBilling(req, res)).rejects.toThrow(
        new NotFoundProblem("Pedido não encontrado."),
      );
      // O escopo vem do token, nunca do corpo.
      expect(criar).toHaveBeenCalledWith(expect.objectContaining({
        ator: { publicId: "usuario-1", role: "client" },
        orderPublicId: "pedido-5",
      }));
    });

    it("paymentController lança BadRequestProblem se billingId estiver ausente no checkout simulado", async () => {
      const req = { query: {} } as Request;
      const res = mockResponse();

      await expect(paymentController.getSimulatedCheckoutPage(req, res)).rejects.toThrow(BadRequestProblem);
    });

    it("productController lança NotFoundProblem se produto não existir", async () => {
      vi.spyOn(ProductService, "getByPublicId").mockRejectedValueOnce(new NotFoundProblem("Produto não encontrado."));
      const req = { params: { publicId: "produto-inexistente" } } as unknown as Request;
      const res = mockResponse();

      await expect(productController.getProductById(req, res)).rejects.toThrow(NotFoundProblem);
    });

    // CONC-01: a guarda da baixa está no StockService e é coberta contra o
    // banco em estoque-concorrencia.test.ts. Aqui, o controller propaga o 409.
    it("stockController lança ConflictProblem se a baixa resultaria em estoque negativo", async () => {
      vi.spyOn(StockService, "update").mockRejectedValueOnce(
        new ConflictProblem("Estoque insuficiente. Disponível: 2 unidades."),
      );
      const req = {
        params: { produtoPublicId: "produto-1" },
        body: { quantidade: 5, operacao: "subtract" },
      } as unknown as Request;
      const res = mockResponse();

      await expect(stockController.updateStock(req, res)).rejects.toThrow(ConflictProblem);
    });
  });

  describe("Critério de Aceite 2: Respostas de sucesso retornam o recurso sem envelope", () => {
    it("authController.register retorna { user, token } sem envelope success", async () => {
      const mockResult = {
        user: { publicId: "usuario-1", name: "Maria", email: "maria@test.com", role: "client", factoryName: null, createdAt: null },
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
        user: { publicId: "usuario-1", name: "Maria", email: "maria@test.com", role: "client", factoryName: null, createdAt: null },
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
      const mockUser = { publicId: "usuario-1", name: "Maria", email: "maria@test.com", role: "client", factoryName: null, createdAt: null };
      const perfil = vi.spyOn(AuthService, "getProfile").mockResolvedValueOnce(mockUser);

      const req = { user: { publicId: "usuario-1" } } as unknown as Request;
      const res = mockResponse();

      await authController.getMe(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(perfil).toHaveBeenCalledWith("usuario-1");
      expect(payload.publicId).toBe("usuario-1");
      expect(payload).not.toHaveProperty("id");
      expect(payload.user).toEqual(mockUser);
    });

    it("categoryController.createCategory retorna a categoria criada sem envelope success", async () => {
      vi.spyOn(CategoryService, "create").mockResolvedValueOnce({
        publicId: "categoria-10",
        nome: "Esportivo",
        descricao: "Leve",
        criado_em: new Date(),
      });

      const req = { body: { nome: "Esportivo", descricao: "Leve" } } as Request;
      const res = mockResponse();

      await categoryController.createCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.publicId).toBe("categoria-10");
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

      const req = { user: { email: "user@test.com", publicId: "usuario-1" } } as unknown as Request;
      const res = mockResponse();

      await designController.getDesigns(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(Array.isArray(payload.designs)).toBe(true);
      expect(payload.designs[0].id).toBe("des-1");
    });

    it("orderController.getOrders retorna { orders, pagination } sem envelope success", async () => {
      vi.spyOn(OrderService, "list").mockResolvedValueOnce({
        orders: [{
          publicId: "01J00000000000000000000001",
          customerName: "Maria",
          customerEmail: "maria@test.com",
          productName: "Armação",
          factoryPublicId: "fabrica-2",
          factoryName: "Fábrica A",
          status: "Pending Payment",
          version: 0,
          total: "350.00",
          customSpecs: {},
          abacateBillingId: null,
          createdAt: new Date("2026-10-14T00:00:00Z"),
          updatedAt: new Date("2026-10-14T00:00:00Z"),
        }],
        pagination: { page: 1, limit: 10, totalItems: 1, totalPages: 1 },
      });

      const req = {
        user: { role: "client", email: "maria@test.com", publicId: "usuario-1" },
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
      vi.spyOn(ProductService, "getByPublicId").mockResolvedValueOnce({
        publicId: "produto-42",
        nome: "Armação Titanium",
        descricao: null,
        preco: "299.90",
        categoriaPublicId: null,
        categoria_nome: null,
        imagem_url: null,
        ativo: true,
        criado_em: new Date(),
        estoque_quantidade: 0,
        estoque_minimo: 5,
      });

      const req = { params: { publicId: "produto-42" } } as unknown as Request;
      const res = mockResponse();

      await productController.getProductById(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.publicId).toBe("produto-42");
      expect(payload.nome).toBe("Armação Titanium");
    });

    it("stockController.getStockByProduct retorna { estoque, alerta } sem envelope success", async () => {
      vi.spyOn(StockService, "getByProduct").mockResolvedValueOnce({
        estoque: {
          publicId: "estoque-1",
          produtoPublicId: "produto-10",
          produto_nome: "Armação Titanium",
          quantidade: 20,
          estoque_minimo: 5,
          atualizado_em: new Date(),
          version: 0,
          preco: "299.90",
        },
        alerta: false,
      });

      const req = { params: { produtoPublicId: "produto-10" } } as unknown as Request;
      const res = mockResponse();

      await stockController.getStockByProduct(req, res);

      const payload = (res.json as any).mock.calls[0][0];
      expect(payload).not.toHaveProperty("success");
      expect(payload.estoque.produtoPublicId).toBe("produto-10");
      expect(payload.alerta).toBe(false);
    });
  });
});
