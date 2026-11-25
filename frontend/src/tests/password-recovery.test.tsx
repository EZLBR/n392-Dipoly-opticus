import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { LanguageProvider } from "../contexts/LanguageContext";
import PasswordRecovery from "../components/PasswordRecovery";

// FEAT-01: telas de "esqueci a senha" e de redefinição.
const token = "a".repeat(64);
const empty = (status: number) => new Response(null, { status });
const problem = (status: number) => new Response(JSON.stringify({
  type: "https://opticus.example/problems/bad-request", title: "Erro", status,
  detail: "Link de recuperação inválido ou expirado.",
}), { status, headers: { "Content-Type": "application/problem+json" } });

function renderAt(entry: string) {
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/forgot-password" element={<PasswordRecovery key="forgot" />} />
          <Route path="/reset-password" element={<PasswordRecovery key="reset" />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

const lastBody = (fetch: ReturnType<typeof vi.spyOn>) =>
  JSON.parse(String((fetch.mock.calls.at(-1)?.[1] as RequestInit).body));

describe("PasswordRecovery", () => {
  beforeEach(() => localStorage.setItem("opticus_language", "en"));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("pede o link e mostra a mesma mensagem neutra", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(empty(202));
    renderAt("/forgot-password");

    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: "ana@exemplo.invalid" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("status")).toHaveTextContent("If your account exists");
    expect(String(fetch.mock.calls[0][0])).toMatch(/\/auth\/forgot-password$/);
    expect(lastBody(fetch)).toEqual({ email: "ana@exemplo.invalid" });
  });

  it("lê o token do fragmento, tira-o da URL e envia a nova senha", async () => {
    const replaceState = vi.spyOn(window.history, "replaceState");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(empty(204));
    renderAt(`/reset-password#token=${token}`);

    // O token sai da barra de endereço antes de qualquer interação.
    await waitFor(() => expect(replaceState.mock.calls.at(-1)?.slice(1)).toEqual(["", "/reset-password"]));

    fireEvent.change(screen.getByLabelText(/8/), { target: { value: "NovaSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Password changed");
    expect(lastBody(fetch)).toEqual({ token, password: "NovaSenha123" });
  });

  it("sem token válido no link, não mostra o formulário", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    renderAt("/reset-password#token=curto");

    expect(screen.getByRole("alert")).toHaveTextContent("invalid or expired");
    expect(screen.queryByRole("button", { name: "Submit" })).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("token recusado pela API mostra a mensagem de link inválido", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(problem(400));
    renderAt(`/reset-password#token=${token}`);

    fireEvent.change(screen.getByLabelText(/8/), { target: { value: "NovaSenha123" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This reset link is invalid or expired.");
  });
});
