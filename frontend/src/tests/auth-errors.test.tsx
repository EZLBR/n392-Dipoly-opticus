import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { setNavigateHandler, apiFetch } from "../utils/api";

function TestComponent() {
  const { session, authWarning, clearAuthWarning, updateUser } = useAuth();

  const handleTest401 = async () => {
    await apiFetch("http://localhost:5000/api/auth/users/99", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
  };

  const handleTest403 = async () => {
    await apiFetch("http://localhost:5000/api/auth/users/99", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Updated" }),
    });
  };

  return (
    <div>
      <div data-testid="session-status">
        {session ? `Logged as ${session.name} (${session.role})` : "No session"}
      </div>

      {authWarning && (
        <div role="alert" className="auth-warning-banner">
          <span>{authWarning}</span>
          <button onClick={clearAuthWarning} aria-label="Fechar aviso">
            Fechar
          </button>
        </div>
      )}

      <button onClick={handleTest401}>Disparar 401</button>
      <button onClick={handleTest403}>Disparar 403</button>
      <button onClick={() => updateUser("99", { name: "Via Context" })}>
        Disparar updateUser
      </button>
    </div>
  );
}

describe("Épico 7 - Tratamento de 401 e 403 no Frontend", () => {
  const mockNavigate = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    setNavigateHandler(mockNavigate);
    mockNavigate.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setNavigateHandler(null);
    localStorage.clear();
  });

  it("Cenário 1: 401 limpa o token, encerra a sessão e redireciona ao login", async () => {
    localStorage.setItem("opticus_token", "fake-expired-jwt-token");

    // Simula resposta 401 do backend com RFC 9457 Problem Details
    const mockProblemDetails401 = {
      type: "https://opticus.example/problems/unauthorized",
      title: "Sessão expirada. Faça login novamente.",
      status: 401,
      detail: "Invalid or expired token.",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      // Mocks para inicialização bem-sucedida da sessão
      if (urlStr.includes("/auth/me")) {
        return new Response(JSON.stringify({ success: true, user: { id: "1", name: "Maria", role: "client" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (urlStr.includes("/designs") || (urlStr.includes("/auth/users") && !urlStr.includes("/99"))) {
        return new Response(JSON.stringify({ success: true, designs: [], users: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      // Demais requisições (como o endpoint de teste 99) retornam 401
      return new Response(JSON.stringify(mockProblemDetails401), {
        status: 401,
        headers: { "Content-Type": "application/problem+json" },
      });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Espera inicializar a sessão com o token
    await waitFor(() => {
      expect(screen.getByTestId("session-status")).toHaveTextContent("Logged as Maria (client)");
    });
    expect(localStorage.getItem("opticus_token")).toBe("fake-expired-jwt-token");

    // Dispara a requisição que recebe 401
    fireEvent.click(screen.getByText("Disparar 401"));

    // 1. Limpa o token do localStorage
    await waitFor(() => {
      expect(localStorage.getItem("opticus_token")).toBeNull();
    });

    // 2. Encerra a sessão ativa
    expect(screen.getByTestId("session-status")).toHaveTextContent("No session");

    // 3. Redireciona para /login
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("Cenário 2: 403 exibe aviso com o title do Problem Details e mantém a sessão ativa", async () => {
    localStorage.setItem("opticus_token", "valid-client-token");

    const mockProblemDetails403 = {
      type: "https://opticus.example/problems/forbidden",
      title: "Acesso negado para este perfil.",
      status: 403,
      detail: "Access forbidden. Insufficient permissions.",
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/auth/me")) {
        return new Response(JSON.stringify({ success: true, user: { id: "2", name: "João", role: "client" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(mockProblemDetails403), {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Sessão inicial ativa
    await waitFor(() => {
      expect(screen.getByTestId("session-status")).toHaveTextContent("Logged as João (client)");
    });

    // Dispara a requisição que recebe 403
    fireEvent.click(screen.getByText("Disparar 403"));

    // 1. Exibe aviso visível com a mensagem originada de problem.title
    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert).toHaveTextContent("Acesso negado para este perfil.");
    });

    // 2. Mantém a sessão ativa
    expect(screen.getByTestId("session-status")).toHaveTextContent("Logged as João (client)");

    // 3. Mantém o token no localStorage
    expect(localStorage.getItem("opticus_token")).toBe("valid-client-token");

    // 4. NÃO redireciona ao login
    expect(mockNavigate).not.toHaveBeenCalled();

    // 5. Permite fechar o aviso
    fireEvent.click(screen.getByRole("button", { name: "Fechar aviso" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("Chamadas de contexto (ex: updateUser) tratam 403 e 401 de forma consistente", async () => {
    localStorage.setItem("opticus_token", "client-token");

    const mockForbidden = {
      type: "https://opticus.example/problems/forbidden",
      title: "Somente staff pode alterar usuários.",
      status: 403,
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      if (String(url).includes("/auth/me")) {
        return new Response(JSON.stringify({ success: true, user: { id: "3", name: "Ana", role: "client" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(mockForbidden), {
        status: 403,
        headers: { "Content-Type": "application/problem+json" },
      });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("session-status")).toHaveTextContent("Logged as Ana (client)");
    });

    fireEvent.click(screen.getByText("Disparar updateUser"));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Somente staff pode alterar usuários.");
    });

    expect(screen.getByTestId("session-status")).toHaveTextContent("Logged as Ana (client)");
  });

  it("Sessão expirada durante a inicialização (initSession 401) limpa o token e redireciona ao login", async () => {
    localStorage.setItem("opticus_token", "expired-init-token");

    vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(
        JSON.stringify({
          type: "https://opticus.example/problems/unauthorized",
          title: "Sessão expirada.",
          status: 401,
        }),
        {
          status: 401,
          headers: { "Content-Type": "application/problem+json" },
        }
      );
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(localStorage.getItem("opticus_token")).toBeNull();
    });

    expect(screen.getByTestId("session-status")).toHaveTextContent("No session");
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
