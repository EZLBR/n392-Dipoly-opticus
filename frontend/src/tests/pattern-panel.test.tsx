import React from "react";
import { afterEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AuthProvider } from "../contexts/AuthContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import { CreatorStudioProvider } from "../contexts/CreatorStudioContext";
import CustomizationPanel from "../components/creator/CustomizationPanel";

const mount = () => render(<AuthProvider><LanguageProvider><CreatorStudioProvider><CustomizationPanel onSave={() => {}} onCart={() => {}} /></CreatorStudioProvider></LanguageProvider></AuthProvider>);
afterEach(() => { cleanup(); localStorage.clear(); });
it("edits a surface pattern, persists the draft and restores its controls", () => {
  localStorage.setItem("opticus_language", "pt");
  const view = mount();
  fireEvent.change(screen.getByLabelText("Estampa da armação"), { target: { value: "checker" } });
  fireEvent.change(screen.getByLabelText("Escala da estampa"), { target: { value: "3" } });
  fireEvent.change(screen.getByLabelText("Orientação da estampa"), { target: { value: "45" } });
  fireEvent.change(screen.getByLabelText("Cor da estampa"), { target: { value: "#aabbcc" } });
  expect(JSON.parse(localStorage.getItem("opticus_creator_draft")!).config.surfacePattern)
    .toEqual({ version: 1, style: "checker", scale: 3, rotation: 45, ink: "#aabbcc" });
  expect(screen.getByText(/apenas visual/i)).toBeInTheDocument();
  view.unmount(); mount();
  expect(screen.getByLabelText("Estampa da armação")).toHaveValue("checker");
  expect(screen.getByLabelText("Escala da estampa")).toHaveValue("3");
  fireEvent.click(screen.getByRole("button", { name: /Revisão/ }));
  expect(screen.getByRole("button", { name: "Adicionar à sacola" })).toBeDisabled();
});
