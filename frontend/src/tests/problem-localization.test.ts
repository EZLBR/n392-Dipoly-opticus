import { afterEach, expect, it } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { LanguageProvider, localizeProblem, useTranslation } from "../contexts/LanguageContext";

afterEach(() => { cleanup(); localStorage.clear(); });

it("localizes known problems and chooses a safe fallback for unexpected API text", () => {
  const problem = { type: "https://opticus.example/problems/forbidden", status: 403, detail: "raw internal detail" };
  expect(localizeProblem(problem, "pt")).toBe("Você não tem permissão para esta ação.");
  expect(localizeProblem(problem, "en")).toBe("You don't have permission to do this.");
  expect(localizeProblem({ status: 500, detail: "stack trace" }, "en")).toBe("The server couldn't complete the request. Try again.");
});

it("uses the saved language and handles invalid saved preferences", () => {
  localStorage.setItem("opticus_language", "pt");
  expect(localizeProblem({ status: 404 })).toBe("Recurso não encontrado.");
  localStorage.setItem("opticus_language", "invalid");
  expect(localizeProblem({ status: 404 })).toBe("Resource not found.");
});

it("keeps actionable login, registration and pending payment messages", () => {
  expect(localizeProblem({ status: 400, detail: "Email ou senha incorretos." }, "en"))
    .toBe("Invalid email or password.");
  expect(localizeProblem({ status: 409, detail: "Já existe uma conta com esse email." }, "en"))
    .toBe("An account already exists with this email.");
  expect(localizeProblem({ status: 503, detail: "Não foi possível confirmar a cobrança com o gateway de pagamento." }, "en"))
    .toContain("Check your orders before trying again.");
});

it("persists a selected language across provider remounts", () => {
  const first = renderHook(useTranslation, { wrapper: LanguageProvider });
  act(() => first.result.current.setLanguage("pt"));
  expect(first.result.current.t("auth-email")).toBe("E-mail");
  expect(document.documentElement.lang).toBe("pt-BR");
  first.unmount();
  const restored = renderHook(useTranslation, { wrapper: LanguageProvider });
  expect(restored.result.current.language).toBe("pt");
  expect(restored.result.current.t("dash-staff-title")).toBe("Painel de operações");
});
