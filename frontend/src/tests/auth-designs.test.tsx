import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { CreatorStudioProvider, useCreatorStudio } from "../contexts/CreatorStudioContext";
import { defaultConfig } from "../eyewear/config";
import { setNavigateHandler } from "../utils/api";

const json = (body: unknown) => new Response(JSON.stringify(body), {
  headers: { "Content-Type": "application/json" },
});

function AccountControls() {
  const { session, designs, login, logout, saveDesign } = useAuth();
  const [saveError, setSaveError] = React.useState("");
  return <>
    <output aria-label="account">{session?.id || "anonymous"}</output>
    <output aria-label="designs">{designs.map(d => d.name).join(",")}</output>
    <button onClick={() => login("a@example.invalid", "Password123")}>Login A</button>
    <button onClick={() => login("b@example.invalid", "Password123")}>Login B</button>
    <button onClick={logout}>Logout</button>
    <button onClick={() => saveDesign({ id: "offline-a", name: "Private A", model: "round", color: "#112233" }).catch(error => setSaveError(error.message))}>Save offline</button>
    {saveError && <p role="alert">{saveError}</p>}
  </>;
}

beforeEach(() => localStorage.clear());
afterEach(() => { vi.restoreAllMocks(); setNavigateHandler(null); localStorage.clear(); });

function StudioControls() {
  const { config, patchConfig } = useCreatorStudio();
  return <><output aria-label="studio-color">{config.color}</output>
    <button onClick={() => patchConfig({ color: "#112233" })}>Paint A</button></>;
}

function mockApi(designsForA?: Promise<Response>) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, options) => {
    if (String(url).endsWith("/auth/login")) {
      const email = JSON.parse(String(options?.body)).email;
      const id = email.startsWith("a@") ? "A" : "B";
      return json({ success: true, token: `token-${id}`, user: { id, email, name: id, role: "client" } });
    }
    if (String(url).endsWith("/designs")) {
      if (options?.method === "POST") throw new TypeError("Failed to fetch");
      if (new Headers(options?.headers).get("Authorization") === "Bearer token-A" && designsForA) return designsForA;
      return json({ success: true, designs: [] });
    }
    return json({ success: true, users: [] });
  });
}

describe("Studio cache belongs to the active account", () => {
  it("does not show A's offline design after logout and login as B", async () => {
    mockApi();
    render(<AuthProvider><AccountControls /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("A"));
    fireEvent.click(screen.getByText("Save offline"));
    await waitFor(() => expect(screen.getByLabelText("designs")).toHaveTextContent("Private A"));
    localStorage.setItem("opticus_creator_draft", JSON.stringify({ source: "design:offline-a", config: { color: "#112233" } }));
    fireEvent.click(screen.getByText("Logout"));
    expect(localStorage.getItem("opticus_creator_draft")).toBeNull();
    expect(localStorage.getItem("opticus_active_design_id")).toBeNull();
    fireEvent.click(screen.getByText("Login B"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("B"));
    expect(screen.getByLabelText("designs")).toBeEmptyDOMElement();
    expect(localStorage.getItem("opticus_designs") || "[]").not.toContain("Private A");
  });

  it("preserves a new anonymous draft when its creator logs in", async () => {
    mockApi();
    render(<AuthProvider><AccountControls /></AuthProvider>);
    const draft = JSON.stringify({ source: "new", config: { color: "#abcdef" } });
    localStorage.setItem("opticus_creator_draft", draft);
    fireEvent.click(screen.getByText("Login B"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("B"));
    expect(localStorage.getItem("opticus_creator_draft")).toBe(draft);
  });

  it("ignores A's design response when it arrives after B logs in", async () => {
    let releaseA!: (value: Response) => void;
    mockApi(new Promise(resolve => { releaseA = resolve; }));
    render(<AuthProvider><AccountControls /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("A"));
    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(screen.getByText("Login B"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("B"));
    await act(async () => {
      releaseA(json({ success: true, designs: [{ id: "a", name: "Private A", model: "round", color: "#112233" }] }));
    });
    await waitFor(() => expect(localStorage.getItem("opticus_designs")).toBe("[]"));
    expect(screen.getByLabelText("designs")).toBeEmptyDOMElement();
  });

  it("does not expire B when an old request made by A later returns 401", async () => {
    let releaseA!: (value: Response) => void;
    mockApi(new Promise(resolve => { releaseA = resolve; }));
    const navigate = vi.fn();
    setNavigateHandler(navigate);
    render(<AuthProvider><AccountControls /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("A"));
    fireEvent.click(screen.getByText("Logout"));
    fireEvent.click(screen.getByText("Login B"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("B"));
    await act(async () => releaseA(new Response(JSON.stringify({ status: 401 }), { status: 401 })));
    expect(screen.getByLabelText("account")).toHaveTextContent("B");
    expect(localStorage.getItem("opticus_token")).toBe("token-B");
    expect(navigate).not.toHaveBeenCalled();
  });

  it("resets the mounted Studio's private configuration on logout", async () => {
    mockApi();
    render(<AuthProvider><AccountControls /><CreatorStudioProvider><StudioControls /></CreatorStudioProvider></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("A"));
    fireEvent.click(screen.getByText("Paint A"));
    expect(screen.getByLabelText("studio-color")).toHaveTextContent("#112233");
    fireEvent.click(screen.getByText("Logout"));
    expect(screen.getByLabelText("studio-color")).toHaveTextContent(defaultConfig.color);
  });

  it("discards legacy cache whose owner cannot be established", () => {
    mockApi();
    localStorage.setItem("opticus_designs", JSON.stringify([{ id: "old", name: "Private old" }]));
    render(<AuthProvider><AccountControls /></AuthProvider>);
    expect(screen.getByLabelText("designs")).toBeEmptyDOMElement();
  });

  it("cannot send A's private design with B's token after another tab changes the shared session", async () => {
    const fetch = mockApi();
    render(<AuthProvider><AccountControls /></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("A"));
    localStorage.setItem("opticus_studio_owner", "user:B");
    localStorage.setItem("opticus_token", "token-B");
    await act(async () => fireEvent.click(screen.getByText("Save offline")));
    expect(fetch.mock.calls.some(([url, init]) => String(url).endsWith("/designs") && init?.method === "POST")).toBe(false);
    expect(localStorage.getItem("opticus_designs") || "[]").not.toContain("Private A");
  });

  it("unmounts the old Studio on a storage event without erasing the other tab's draft", async () => {
    mockApi();
    render(<AuthProvider><AccountControls /><CreatorStudioProvider><StudioControls /></CreatorStudioProvider></AuthProvider>);
    fireEvent.click(screen.getByText("Login A"));
    await waitFor(() => expect(screen.getByLabelText("account")).toHaveTextContent("A"));
    fireEvent.click(screen.getByText("Paint A"));
    const otherDraft = JSON.stringify({ source: "new", config: { color: "#abcdef" } });
    localStorage.setItem("opticus_studio_owner", "user:B");
    localStorage.setItem("opticus_token", "token-B");
    localStorage.setItem("opticus_creator_draft", otherDraft);
    await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: "opticus_studio_owner", newValue: "user:B" })));
    expect(screen.queryByLabelText("studio-color")).not.toBeInTheDocument();
    expect(localStorage.getItem("opticus_creator_draft")).toBe(otherDraft);
  });
});
