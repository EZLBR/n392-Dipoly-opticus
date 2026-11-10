import React from "react";
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import ErrorBoundary from "../components/ErrorBoundary";

afterEach(() => {
  cleanup();
  localStorage.removeItem("opticus_language");
  vi.restoreAllMocks();
});

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

  it.each([
    {
      language: "pt",
      title: "Algo deu errado.",
      description: "Esta tela encontrou um erro inesperado. Tente voltar ao início.",
      button: "VOLTAR AO INÍCIO",
    },
    {
      language: "en",
      title: "Something went wrong.",
      description: "This screen ran into an unexpected error. Try returning to the homepage.",
      button: "BACK TO HOME",
    },
  ])("captura erro em componente filho e exibe o fallback em $language", ({ language, title, description, button }) => {
    localStorage.setItem("opticus_language", language);
    vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblematicComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: button })).toBeInTheDocument();
  });
});
