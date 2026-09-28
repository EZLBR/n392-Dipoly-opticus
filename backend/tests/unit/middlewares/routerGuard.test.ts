import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import {
  routerGuard,
  RoleRouterGuard,
  getJwtSecret,
} from "../../../src/middlewares/routerGuard.js";
import { protect, authorize } from "../../../src/middlewares/auth.js";

const TEST_SECRET = "test-jwt-secret-key-1234567890";

function createMockReqRes(headers: Record<string, string> = {}) {
  const req = {
    headers,
    user: undefined,
  } as unknown as Request;

  const resJson = vi.fn();
  const resStatus = vi.fn().mockReturnValue({ json: resJson });

  const res = {
    status: resStatus,
    json: resJson,
  } as unknown as Response;

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, resStatus, resJson, next };
}

describe("routerGuard Middleware", () => {
  const originalEnvSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalEnvSecret;
  });

  describe("Secret retrieval", () => {
    it("obtem o segredo configurado no ambiente", () => {
      expect(getJwtSecret()).toBe(TEST_SECRET);
    });

    it("lanca erro fatal se JWT_SECRET nao estiver definido", () => {
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow("FATAL ERROR: JWT_SECRET is not set in environment.");
    });
  });

  describe("Autenticação básica", () => {
    it("rejeita requisição sem header Authorization com 401", () => {
      const guard = routerGuard();
      const { req, res, resStatus, resJson, next } = createMockReqRes();

      guard(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(401);
      expect(resJson).toHaveBeenCalledWith({
        success: false,
        error: "Access denied. No token provided.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejeita Authorization que não começa com 'Bearer ' com 401", () => {
      const guard = routerGuard();
      const { req, res, resStatus, resJson, next } = createMockReqRes({
        authorization: "Basic 123456",
      });

      guard(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(401);
      expect(resJson).toHaveBeenCalledWith({
        success: false,
        error: "Access denied. No token provided.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejeita token com assinatura inválida com 401", () => {
      const guard = routerGuard();
      const invalidToken = jwt.sign({ id: "1", role: "client" }, "wrong-secret");
      const { req, res, resStatus, resJson, next } = createMockReqRes({
        authorization: `Bearer ${invalidToken}`,
      });

      guard(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(401);
      expect(resJson).toHaveBeenCalledWith({
        success: false,
        error: "Invalid or expired token.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("rejeita token expirado com 401", () => {
      const guard = routerGuard();
      const expiredToken = jwt.sign({ id: "1", role: "client" }, TEST_SECRET, {
        expiresIn: "-1s",
      });
      const { req, res, resStatus, resJson, next } = createMockReqRes({
        authorization: `Bearer ${expiredToken}`,
      });

      guard(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(401);
      expect(resJson).toHaveBeenCalledWith({
        success: false,
        error: "Invalid or expired token.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("permite token válido quando nenhuma restrição de papel é informada", () => {
      const guard = routerGuard();
      const token = jwt.sign(
        { id: "10", email: "user@example.com", name: "User", role: "client" },
        TEST_SECRET
      );
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toMatchObject({
        id: "10",
        email: "user@example.com",
        name: "User",
        role: "client",
      });
    });
  });

  describe("Controle de Acesso Baseado em Papéis (RBAC)", () => {
    it("bloqueia com 403 se o usuário autenticado não possui o papel exigido", () => {
      const guard = routerGuard("staff");
      const token = jwt.sign({ id: "1", role: "client" }, TEST_SECRET);
      const { req, res, resStatus, resJson, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(403);
      expect(resJson).toHaveBeenCalledWith({
        success: false,
        error: "Access forbidden. Insufficient permissions.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("permite acesso se o usuário possui exatamente o papel exigido", () => {
      const guard = routerGuard("staff");
      const token = jwt.sign({ id: "1", role: "staff" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("permite acesso quando um dos múltiplos papéis coincide (lista com vírgula)", () => {
      const guard = routerGuard("staff", "factory");
      const token = jwt.sign({ id: "2", role: "factory" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("permite acesso quando um dos múltiplos papéis coincide (formato array)", () => {
      const guard = routerGuard(["staff", "factory"]);
      const token = jwt.sign({ id: "3", role: "staff" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("funciona com objeto de opções { roles: ['staff'] }", () => {
      const guard = routerGuard({ roles: ["staff"] });
      const tokenClient = jwt.sign({ id: "4", role: "client" }, TEST_SECRET);
      const { req: reqClient, res: resClient, resStatus: statusClient, next: nextClient } = createMockReqRes({
        authorization: `Bearer ${tokenClient}`,
      });

      guard(reqClient, resClient, nextClient);
      expect(statusClient).toHaveBeenCalledWith(403);
      expect(nextClient).not.toHaveBeenCalled();

      const tokenStaff = jwt.sign({ id: "5", role: "staff" }, TEST_SECRET);
      const { req: reqStaff, res: resStaff, resStatus: statusStaff, next: nextStaff } = createMockReqRes({
        authorization: `Bearer ${tokenStaff}`,
      });

      guard(reqStaff, resStaff, nextStaff);
      expect(statusStaff).not.toHaveBeenCalled();
      expect(nextStaff).toHaveBeenCalledTimes(1);
    });

    it("permite passagem sem token quando allowAnonymous = true", () => {
      const guard = routerGuard({ allowAnonymous: true });
      const { req, res, resStatus, next } = createMockReqRes();

      guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeUndefined();
    });

    it("anexa o usuário se houver token válido mesmo com allowAnonymous = true", () => {
      const guard = routerGuard({ allowAnonymous: true });
      const token = jwt.sign({ id: "6", role: "client" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toMatchObject({ id: "6", role: "client" });
    });
  });

  describe("Classe RoleRouterGuard (IRouterGuard)", () => {
    it("canActivate devolve true se não houver restrição de papéis", () => {
      const guard = new RoleRouterGuard();
      const req = { user: { id: "1", role: "client" } } as unknown as Request;
      expect(guard.canActivate(req)).toBe(true);
    });

    it("canActivate devolve true se o papel do usuário for autorizado", () => {
      const guard = new RoleRouterGuard(["factory", "staff"]);
      const reqFactory = { user: { id: "1", role: "factory" } } as unknown as Request;
      const reqStaff = { user: { id: "2", role: "staff" } } as unknown as Request;

      expect(guard.canActivate(reqFactory)).toBe(true);
      expect(guard.canActivate(reqStaff)).toBe(true);
    });

    it("canActivate devolve false se o papel for insuficiente", () => {
      const guard = new RoleRouterGuard("staff");
      const reqClient = { user: { id: "1", role: "client" } } as unknown as Request;

      expect(guard.canActivate(reqClient)).toBe(false);
    });

    it("canActivate devolve false se req.user for indefinido e não for anônimo", () => {
      const guard = new RoleRouterGuard("staff");
      const req = {} as Request;

      expect(guard.canActivate(req)).toBe(false);
    });

    it("canActivate devolve true para anônimo se allowAnonymous = true", () => {
      const guard = new RoleRouterGuard({ allowAnonymous: true });
      const req = {} as Request;

      expect(guard.canActivate(req)).toBe(true);
    });

    it("handle executa a proteção completa", () => {
      const guard = new RoleRouterGuard("staff");
      const token = jwt.sign({ id: "7", role: "staff" }, TEST_SECRET);
      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      guard.handle(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("Retrocompatibilidade com auth.ts (protect e authorize)", () => {
    it("protect rejeita requisição anônima com 401", () => {
      const { req, res, resStatus, resJson, next } = createMockReqRes();
      protect(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(401);
      expect(resJson).toHaveBeenCalledWith({
        success: false,
        error: "Access denied. No token provided.",
      });
      expect(next).not.toHaveBeenCalled();
    });

    it("protect permite requisição com token válido", () => {
      const token = jwt.sign({ id: "8", role: "client" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      protect(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("authorize bloqueia papel incorreto com 403", () => {
      const authMiddleware = authorize("staff");
      const req = { user: { id: "9", role: "client" } } as unknown as Request;
      const resJson = vi.fn();
      const resStatus = vi.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus, json: resJson } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      authMiddleware(req, res, next);

      expect(resStatus).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it("authorize permite papel correto", () => {
      const authMiddleware = authorize("staff");
      const req = { user: { id: "10", role: "staff" } } as unknown as Request;
      const resJson = vi.fn();
      const resStatus = vi.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus, json: resJson } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      authMiddleware(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });
});
