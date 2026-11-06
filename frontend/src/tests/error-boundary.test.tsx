import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ErrorBoundary from "../components/ErrorBoundary";

function ProblematicComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Erro simulado para teste de ErrorBoundary");
  }
  return <div>Componente renderizado com sucesso</div>;
}

describe("TEST-06: Setup Frontend e Teste de Componente Real (ErrorBoundary)", () => {
  it("renderiza os filhos normalmente quando não há erro", () => {
    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Componente renderizado com sucesso")).toBeInTheDocument();
  });

  it("captura erro em componente filho e exibe a mensagem de fallback", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByText("Ops! Algo deu errado.")).toBeInTheDocument();
    expect(
      screen.getByText("Ocorreu um erro inesperado na interface. Não se preocupe, seus dados estão seguros.")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /voltar ao início/i })).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
