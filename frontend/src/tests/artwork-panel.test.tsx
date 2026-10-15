import React from "react";
import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CreatorStudioProvider } from "../contexts/CreatorStudioContext";
import ArtworkPanel from "../components/creator/ArtworkPanel";
import { SaveDesignModal } from "../components/creator/CreatorModals";

let restoreDialog = () => {};
afterEach(() => { vi.restoreAllMocks(); restoreDialog(); localStorage.clear(); });
const mount = () => {
  localStorage.setItem("opticus_language", "pt");
  return render(<LanguageProvider><AuthProvider><CreatorStudioProvider><ArtworkPanel /></CreatorStudioProvider></AuthProvider></LanguageProvider>);
};

it("edits a text layer and persists the controls into the Studio draft", () => {
  mount();
  fireEvent.click(screen.getByRole("button", { name: "Adicionar texto" }));
  fireEvent.change(screen.getByLabelText("Texto"), { target: { value: "Meu nome" } });
  fireEvent.change(screen.getByLabelText("Região da armação"), { target: { value: "front-left" } });
  fireEvent.change(screen.getByLabelText("Posição horizontal"), { target: { value: "0.4" } });
  fireEvent.change(screen.getByLabelText("Rotação"), { target: { value: "15" } });
  const draft = JSON.parse(localStorage.getItem("opticus_creator_draft")!);
  expect(draft.config.artwork.layers[0]).toMatchObject({ text: "Meu nome", zone: "front-left", x: 0.4, rotation: 15 });
  expect(screen.queryByRole("option", { name: /Lente/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Remover texto" }));
  expect(JSON.parse(localStorage.getItem("opticus_creator_draft")!).config.artwork.layers).toEqual([]);
});

it("limits the editor to six text layers", () => {
  mount();
  for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole("button", { name: "Adicionar texto" }));
  expect(screen.getByRole("button", { name: "Adicionar texto" })).toBeDisabled();
  expect(JSON.parse(localStorage.getItem("opticus_creator_draft")!).config.artwork.layers).toHaveLength(6);
});

it("does not allow saving a layer whose text is blank", () => {
  const original = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: function () { this.open = true; } });
  restoreDialog = () => original ? Object.defineProperty(HTMLDialogElement.prototype, "showModal", original) : Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  localStorage.setItem("opticus_language", "pt");
  render(<LanguageProvider><AuthProvider><CreatorStudioProvider>
    <ArtworkPanel /><SaveDesignModal isOpen={true} onClose={() => {}} onOpenDesigns={() => {}} />
  </CreatorStudioProvider></AuthProvider></LanguageProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Adicionar texto" }));
  fireEvent.change(screen.getByLabelText("Texto", { exact: true }), { target: { value: "" } });
  fireEvent.change(screen.getByLabelText("Nome do design"), { target: { value: "Minha criação" } });
  expect(screen.getByRole("button", { name: "Salvar design" })).toBeDisabled();
});
