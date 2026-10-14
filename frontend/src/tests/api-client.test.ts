import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  apiClient,
  apiFetch,
  apiRequest,
  ProblemError,
  parseProblemDetails,
  resolveUrl,
  API_BASE_URL,
  setAuthErrorHandler,
  setNavigateHandler,
} from "../api/client";

describe("FE-01: api/client.ts - Centralized HTTP Client", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setAuthErrorHandler(null);
    setNavigateHandler(null);
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    setAuthErrorHandler(null);
    setNavigateHandler(null);
  });

  describe("1. URL Resolution (VITE_API_URL)", () => {
    it("resolves relative path with leading slash", () => {
      expect(resolveUrl("/orders")).toBe(`${API_BASE_URL}/orders`);
    });

    it("resolves relative path without leading slash", () => {
      expect(resolveUrl("orders/checkout")).toBe(`${API_BASE_URL}/orders/checkout`);
    });

    it("preserves absolute http and https URLs", () => {
      expect(resolveUrl("http://external.api/v1/test")).toBe("http://external.api/v1/test");
      expect(resolveUrl("https://external.api/v1/test")).toBe("https://external.api/v1/test");
    });
  });

  describe("2. Automatic Token Injection", () => {
    it("automatically injects Authorization Bearer header when token is in localStorage", async () => {
      localStorage.setItem("opticus_token", "jwt-token-123");

      let capturedHeaders: Headers | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      await apiFetch("http://localhost:5000/api/orders");

      expect(capturedHeaders?.get("Authorization")).toBe("Bearer jwt-token-123");
    });

    it("does not inject Authorization header when no token in localStorage", async () => {
      let capturedHeaders: Headers | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      await apiFetch("http://localhost:5000/api/orders");

      expect(capturedHeaders?.has("Authorization")).toBe(false);
    });

    it("preserves custom Authorization header if explicitly passed", async () => {
      localStorage.setItem("opticus_token", "jwt-token-default");

      let capturedHeaders: Headers | undefined;
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      await apiFetch("http://localhost:5000/api/orders", {
        headers: { Authorization: "Bearer custom-token" },
      });

      expect(capturedHeaders?.get("Authorization")).toBe("Bearer custom-token");
    });
  });

  describe("3. RFC 9457 Problem Details Parsing & Typed ProblemError", () => {
    it("parses application/problem+json response and throws typed ProblemError", async () => {
      const problemPayload = {
        type: "https://opticus.example/problems/validation-error",
        title: "Dados de requisição inválidos",
        status: 400,
        detail: "O campo email é obrigatório.",
        instance: "/api/auth/register",
        invalidParams: [{ name: "email", reason: "Required" }],
      };

      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return new Response(JSON.stringify(problemPayload), {
          status: 400,
          headers: { "Content-Type": "application/problem+json" },
        });
      });

      try {
        await apiClient.post("/auth/register", {});
        expect.unreachable("Deveria ter lançado ProblemError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProblemError);
        expect(err).toBeInstanceOf(Error);
        expect(err.name).toBe("ProblemError");
        expect(err.status).toBe(400);
        expect(err.type).toBe("https://opticus.example/problems/validation-error");
        expect(err.title).toBe("Dados de requisição inválidos");
        expect(err.detail).toBe("O campo email é obrigatório.");
        expect(err.instance).toBe("/api/auth/register");
        expect(err.invalidParams).toEqual([{ name: "email", reason: "Required" }]);
        expect(err.message).toBe("O campo email é obrigatório.");
      }
    });

    it("parses fallback problem details when response body is not JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return new Response("Internal Server Error Text", {
          status: 500,
          statusText: "Server Error",
        });
      });

      try {
        await apiClient.get("/faulty-endpoint");
        expect.unreachable("Deveria ter lançado ProblemError");
      } catch (err: any) {
        expect(err).toBeInstanceOf(ProblemError);
        expect(err.status).toBe(500);
        expect(err.title).toBe("Server Error");
      }
    });
  });

  describe("4. Global Auth Interceptors (401 & 403)", () => {
    it("handles 401 by clearing localStorage token, calling handler, and redirecting", async () => {
      localStorage.setItem("opticus_token", "expired-token");

      const authErrorHandler = vi.fn();
      const navigateHandler = vi.fn();
      setAuthErrorHandler(authErrorHandler);
      setNavigateHandler(navigateHandler);

      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            status: 401,
            title: "Sessão expirada",
            detail: "Token JWT expirado",
          }),
          {
            status: 401,
            headers: { "Content-Type": "application/problem+json" },
          }
        );
      });

      try {
        await apiClient.get("/orders");
      } catch (e) {
        expect(e).toBeInstanceOf(ProblemError);
      }

      expect(localStorage.getItem("opticus_token")).toBeNull();
      expect(authErrorHandler).toHaveBeenCalledWith(401, expect.objectContaining({ status: 401 }));
      expect(navigateHandler).toHaveBeenCalledWith("/login");
    });

    it("handles 403 by calling handler without clearing token or redirecting", async () => {
      localStorage.setItem("opticus_token", "client-token");

      const authErrorHandler = vi.fn();
      const navigateHandler = vi.fn();
      setAuthErrorHandler(authErrorHandler);
      setNavigateHandler(navigateHandler);

      vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        return new Response(
          JSON.stringify({
            status: 403,
            title: "Acesso proibido",
          }),
          {
            status: 403,
            headers: { "Content-Type": "application/problem+json" },
          }
        );
      });

      try {
        await apiClient.get("/admin/users");
      } catch (e) {
        expect(e).toBeInstanceOf(ProblemError);
      }

      expect(localStorage.getItem("opticus_token")).toBe("client-token");
      expect(authErrorHandler).toHaveBeenCalledWith(403, expect.objectContaining({ status: 403 }));
      expect(navigateHandler).not.toHaveBeenCalled();
    });
  });

  describe("5. HTTP Methods (get, post, put, patch, delete)", () => {
    it("apiClient.get performs GET and parses JSON", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        expect(init?.method).toBe("GET");
        return new Response(JSON.stringify([{ id: "1" }]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const data = await apiClient.get<Array<{ id: string }>>("/orders");
      expect(data).toEqual([{ id: "1" }]);
    });

    it("apiClient.post automatically stringifies body and sets Content-Type", async () => {
      let capturedBody: any;
      let capturedHeaders: Headers | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        expect(init?.method).toBe("POST");
        capturedBody = init?.body;
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const result = await apiClient.post("/orders", { item: "Glasses" });
      expect(capturedHeaders?.get("Content-Type")).toBe("application/json");
      expect(capturedBody).toBe(JSON.stringify({ item: "Glasses" }));
      expect(result).toEqual({ success: true });
    });

    it("apiClient.put performs PUT with serialized body", async () => {
      let capturedBody: any;
      let capturedHeaders: Headers | undefined;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        expect(init?.method).toBe("PUT");
        capturedBody = init?.body;
        capturedHeaders = new Headers(init?.headers);
        return new Response(JSON.stringify({ updated: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const result = await apiClient.put("/orders/123", { status: "shipped" });
      expect(capturedHeaders?.get("Content-Type")).toBe("application/json");
      expect(capturedBody).toBe(JSON.stringify({ status: "shipped" }));
      expect(result).toEqual({ updated: true });
    });

    it("apiClient.patch performs PATCH with serialized body", async () => {
      let capturedBody: any;

      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        expect(init?.method).toBe("PATCH");
        capturedBody = init?.body;
        return new Response(JSON.stringify({ patched: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const result = await apiClient.patch("/orders/123", { notes: "test" });
      expect(capturedBody).toBe(JSON.stringify({ notes: "test" }));
      expect(result).toEqual({ patched: true });
    });

    it("apiClient.delete performs DELETE", async () => {
      vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
        expect(init?.method).toBe("DELETE");
        return new Response(null, { status: 204 });
      });

      const result = await apiClient.delete("/orders/123");
      expect(result).toBeUndefined();
    });
  });
});
