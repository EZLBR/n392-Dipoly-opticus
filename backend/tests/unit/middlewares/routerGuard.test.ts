import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import {
  routerGuard,
  RoleRouterGuard,
  getJwtSecret,
} from "../../../src/middlewares/routerGuard.js";
import { protect, authorize } from "../../../src/middlewares/auth.js";
import { UnauthorizedProblem, ForbiddenProblem } from "../../../src/errors/problem.js";
import { sessionStillValid } from "../../../src/services/passwordReset.js";

// O guard sempre consulta a sessão no banco (fail-closed); aqui ela é simulada.
vi.mock("../../../src/services/passwordReset.js", () => ({
  sessionStillValid: vi.fn(async () => true),
}));

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
    it("obtem o segredo configurado no ambiente", async () => {
      expect(getJwtSecret()).toBe(TEST_SECRET);
    });

    it("lanca erro fatal se JWT_SECRET nao estiver definido", async () => {
      delete process.env.JWT_SECRET;
      expect(() => getJwtSecret()).toThrow("FATAL ERROR: JWT_SECRET is not set in environment.");
    });
  });

  describe("Autenticação básica", () => {
    it("rejeita requisição sem header Authorization com 401", async () => {
      const guard = routerGuard();
      const { req, res, resStatus, next } = createMockReqRes();

      await guard(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          detail: "Access denied. No token provided.",
        })
      );
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("rejeita Authorization que não começa com 'Bearer ' com 401", async () => {
      const guard = routerGuard();
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: "Basic 123456",
      });

      await guard(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          detail: "Access denied. No token provided.",
        })
      );
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("rejeita token com assinatura inválida com 401", async () => {
      const guard = routerGuard();
      const invalidToken = jwt.sign({ publicId: "usuario-1", role: "client" }, "wrong-secret");
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${invalidToken}`,
      });

      await guard(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          detail: "Invalid or expired token.",
        })
      );
      expect(resStatus).not.toHaveBeenCalled();
    });

    // ID-02: o usuário é identificado pelo publicId. Um token do formato
    // antigo, com o id inteiro, é assinado corretamente mas não identifica
    // ninguém: 401, e o usuário precisa entrar de novo.
    it("rejeita token válido sem publicId (formato antigo, com id inteiro) com 401", async () => {
      const guard = routerGuard();
      const tokenAntigo = jwt.sign({ id: 10, email: "user@example.com", role: "staff" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${tokenAntigo}`,
      });

      await guard(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(req.user).toBeUndefined();
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("rejeita token expirado com 401", async () => {
      const guard = routerGuard();
      const expiredToken = jwt.sign({ publicId: "usuario-1", role: "client" }, TEST_SECRET, {
        expiresIn: "-1s",
      });
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${expiredToken}`,
      });

      await guard(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 401,
          detail: "Invalid or expired token.",
        })
      );
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("permite token válido quando nenhuma restrição de papel é informada", async () => {
      const guard = routerGuard();
      const token = jwt.sign(
        { publicId: "usuario-10", email: "user@example.com", name: "User", role: "client" },
        TEST_SECRET
      );
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toMatchObject({
        publicId: "usuario-10",
        email: "user@example.com",
        name: "User",
        role: "client",
      });
    });
  });

  describe("Controle de Acesso Baseado em Papéis (RBAC)", () => {
    it("bloqueia com 403 se o usuário autenticado não possui o papel exigido", async () => {
      const guard = routerGuard("staff");
      const token = jwt.sign({ publicId: "usuario-1", role: "client" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenProblem));
      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 403,
          detail: "Access forbidden. Insufficient permissions.",
        })
      );
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("permite acesso se o usuário possui exatamente o papel exigido", async () => {
      const guard = routerGuard("staff");
      const token = jwt.sign({ publicId: "usuario-1", role: "staff" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("permite acesso quando um dos múltiplos papéis coincide (lista com vírgula)", async () => {
      const guard = routerGuard("staff", "factory");
      const token = jwt.sign({ publicId: "usuario-2", role: "factory" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("permite acesso quando um dos múltiplos papéis coincide (formato array)", async () => {
      const guard = routerGuard(["staff", "factory"]);
      const token = jwt.sign({ publicId: "usuario-3", role: "staff" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("funciona com objeto de opções { roles: ['staff'] }", async () => {
      const guard = routerGuard({ roles: ["staff"] });
      const tokenClient = jwt.sign({ publicId: "usuario-4", role: "client" }, TEST_SECRET);
      const { req: reqClient, res: resClient, resStatus: statusClient, next: nextClient } = createMockReqRes({
        authorization: `Bearer ${tokenClient}`,
      });

      await guard(reqClient, resClient, nextClient);
      expect(nextClient).toHaveBeenCalledWith(expect.any(ForbiddenProblem));
      expect(statusClient).not.toHaveBeenCalled();

      const tokenStaff = jwt.sign({ publicId: "usuario-5", role: "staff" }, TEST_SECRET);
      const { req: reqStaff, res: resStaff, resStatus: statusStaff, next: nextStaff } = createMockReqRes({
        authorization: `Bearer ${tokenStaff}`,
      });

      await guard(reqStaff, resStaff, nextStaff);
      expect(statusStaff).not.toHaveBeenCalled();
      expect(nextStaff).toHaveBeenCalledTimes(1);
    });

    it("permite passagem sem token quando allowAnonymous = true", async () => {
      const guard = routerGuard({ allowAnonymous: true });
      const { req, res, resStatus, next } = createMockReqRes();

      await guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toBeUndefined();
    });

    it("anexa o usuário se houver token válido mesmo com allowAnonymous = true", async () => {
      const guard = routerGuard({ allowAnonymous: true });
      const token = jwt.sign({ publicId: "usuario-6", role: "client" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
      expect(req.user).toMatchObject({ publicId: "usuario-6", role: "client" });
    });
  });

  describe("Classe RoleRouterGuard (IRouterGuard)", () => {
    it("canActivate devolve true se não houver restrição de papéis", async () => {
      const guard = new RoleRouterGuard();
      const req = { user: { publicId: "usuario-1", role: "client" } } as unknown as Request;
      expect(guard.canActivate(req)).toBe(true);
    });

    it("canActivate devolve true se o papel do usuário for autorizado", async () => {
      const guard = new RoleRouterGuard(["factory", "staff"]);
      const reqFactory = { user: { publicId: "usuario-1", role: "factory" } } as unknown as Request;
      const reqStaff = { user: { publicId: "usuario-2", role: "staff" } } as unknown as Request;

      expect(guard.canActivate(reqFactory)).toBe(true);
      expect(guard.canActivate(reqStaff)).toBe(true);
    });

    it("canActivate devolve false se o papel for insuficiente", async () => {
      const guard = new RoleRouterGuard("staff");
      const reqClient = { user: { publicId: "usuario-1", role: "client" } } as unknown as Request;

      expect(guard.canActivate(reqClient)).toBe(false);
    });

    it("canActivate devolve false se req.user for indefinido e não for anônimo", async () => {
      const guard = new RoleRouterGuard("staff");
      const req = {} as Request;

      expect(guard.canActivate(req)).toBe(false);
    });

    it("canActivate devolve true para anônimo se allowAnonymous = true", async () => {
      const guard = new RoleRouterGuard({ allowAnonymous: true });
      const req = {} as Request;

      expect(guard.canActivate(req)).toBe(true);
    });

    it("handle executa a proteção completa", async () => {
      const guard = new RoleRouterGuard("staff");
      const token = jwt.sign({ publicId: "usuario-7", role: "staff" }, TEST_SECRET);
      const { req, res, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await guard.handle(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("Retrocompatibilidade com auth.ts (protect e authorize)", () => {
    it("protect rejeita requisição anônima com 401", async () => {
      const { req, res, resStatus, next } = createMockReqRes();
      await protect(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("protect permite requisição com token válido", async () => {
      const token = jwt.sign({ publicId: "usuario-8", role: "client" }, TEST_SECRET);
      const { req, res, resStatus, next } = createMockReqRes({
        authorization: `Bearer ${token}`,
      });

      await protect(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });

    it("authorize bloqueia papel incorreto com 403", async () => {
      const authMiddleware = authorize("staff");
      const req = { user: { publicId: "usuario-9", role: "client" } } as unknown as Request;
      const resJson = vi.fn();
      const resStatus = vi.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus, json: resJson } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      authMiddleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenProblem));
      expect(resStatus).not.toHaveBeenCalled();
    });

    it("authorize permite papel correto", async () => {
      const authMiddleware = authorize("staff");
      const req = { user: { publicId: "usuario-10", role: "staff" } } as unknown as Request;
      const resJson = vi.fn();
      const resStatus = vi.fn().mockReturnValue({ json: resJson });
      const res = { status: resStatus, json: resJson } as unknown as Response;
      const next = vi.fn() as unknown as NextFunction;

      authMiddleware(req, res, next);

      expect(resStatus).not.toHaveBeenCalled();
      expect(next).toHaveBeenCalledTimes(1);
    });
  });

  describe("Sessão revogada (FEAT-01)", () => {
    it("sempre consulta a sessão e recusa com 401 quando ela não vale mais", async () => {
      vi.mocked(sessionStillValid).mockResolvedValueOnce(false);
      const guard = routerGuard();
      const token = jwt.sign({ publicId: "usuario-apagado", role: "client" }, TEST_SECRET);
      const { req, res, next } = createMockReqRes({ authorization: `Bearer ${token}` });

      await guard(req, res, next);

      expect(sessionStillValid).toHaveBeenCalledWith("usuario-apagado", expect.any(Number));
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedProblem));
      expect(req.user).toBeUndefined();
    });
  });
});
