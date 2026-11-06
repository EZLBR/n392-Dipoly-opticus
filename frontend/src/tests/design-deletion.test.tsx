import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { CartProvider } from "../contexts/CartContext";
import { LanguageProvider } from "../contexts/LanguageContext";
import DesignsGallery from "../components/DesignsGallery";

vi.mock("../components/ThreePreview", () => ({ default: () => null }));
const draft = (id: string, name: string) => ({ id, name, model: "round", color: "#112233", syncStatus: "local" });
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
const renderGallery = (extra?: React.ReactNode) => render(<AuthProvider><LanguageProvider><CartProvider>{extra}<DesignsGallery setView={() => {}} /></CartProvider></LanguageProvider></AuthProvider>);
function deleteButton(name: string) { return within(screen.getByText(name).closest("article")!).getByTitle("Delete Design"); }
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("opticus_token", "token-A");
  localStorage.setItem("opticus_studio_owner", "user:A");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
function api(remote: () => Response = () => json({ designs: [] }), remove: () => Response | Promise<Response> = () => json({ message: "ok" })) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "DELETE") return remove();
    if (String(url).endsWith("/auth/me")) return json({ user: { id: "A", name: "A", role: "client" } });
    if (String(url).endsWith("/designs")) return remote();
    return json({ users: [] });
  });
}
function changeSharedAccount() {
  localStorage.setItem("opticus_studio_owner", "user:B");
  localStorage.setItem("opticus_token", "token-B");
  localStorage.setItem("opticus_designs", JSON.stringify([draft("b", "B private")]));
  localStorage.setItem("opticus_active_design", "0");
  localStorage.setItem("opticus_active_design_id", "b");
}
it("does not write A's private drafts into B's cache when an old tab deletes a local draft", async () => {
  localStorage.setItem("opticus_designs", JSON.stringify([draft("a1", "A first"), draft("a2", "A private")]));
  api(); renderGallery();
  await screen.findByText("A first");
  changeSharedAccount();
  fireEvent.click(deleteButton("A first"));
  expect(JSON.parse(localStorage.getItem("opticus_designs")!)).toEqual([draft("b", "B private")]);
  expect(localStorage.getItem("opticus_active_design_id")).toBe("b");
  expect(await screen.findByRole("alert")).toBeInTheDocument();
});
it("removes only the owner's local draft and updates the gallery without a reload", async () => {
  localStorage.setItem("opticus_designs", JSON.stringify([draft("a1", "A first"), draft("a2", "A private")]));
  localStorage.setItem("opticus_active_design", "0");
  localStorage.setItem("opticus_active_design_id", "a1");
  api(); renderGallery();
  await screen.findByText("A first");
  fireEvent.click(deleteButton("A first"));
  await waitFor(() => expect(screen.queryByText("A first")).not.toBeInTheDocument());
  expect(screen.getByText("A private")).toBeInTheDocument();
  expect(localStorage.getItem("opticus_active_design_id")).toBeNull();
  expect(JSON.parse(localStorage.getItem("opticus_designs")!)).toEqual([draft("a2", "A private")]);
});
it("does not clear B's active selection if the session changes during remote refresh after deletion", async () => {
  let reads = 0;
  let release!: (value: Response) => void;
  let refreshStarted!: () => void;
  const refreshing = new Promise<void>(resolve => { refreshStarted = resolve; });
  const remote = { id: "remote-a", name: "Remote A", model: "round", color: "#112233" };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "DELETE") return json({ message: "ok" });
    if (String(url).endsWith("/auth/me")) return json({ user: { id: "A", name: "A", role: "client" } });
    if (String(url).endsWith("/designs")) {
      if (++reads === 1) return json({ designs: [remote] });
      refreshStarted(); return new Promise(resolve => { release = resolve; });
    }
    return json({ users: [] });
  });
  renderGallery();
  await screen.findByText("Remote A");
  localStorage.setItem("opticus_active_design", "0");
  localStorage.setItem("opticus_active_design_id", "remote-a");
  fireEvent.click(deleteButton("Remote A"));
  await refreshing;
  changeSharedAccount();
  await act(async () => release(json({ designs: [] })));
  expect(localStorage.getItem("opticus_active_design_id")).toBe("b");
  expect(JSON.parse(localStorage.getItem("opticus_designs")!)).toEqual([draft("b", "B private")]);
});

it("requires confirmed remote deletion for an offline edit of a previously synchronized design", async () => {
  const remote = { id: "remote-a", name: "Remote A", model: "round", color: "#112233" };
  let serverDesigns = [remote];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    if (init?.method === "POST") throw new TypeError("Failed to fetch");
    if (init?.method === "DELETE") { serverDesigns = []; return json({ message: "ok" }); }
    if (String(url).endsWith("/auth/me")) return json({ user: { id: "A", name: "A", role: "client" } });
    if (String(url).endsWith("/designs")) return json({ designs: serverDesigns });
    return json({ users: [] });
  });
  function SaveOfflineEdit() {
    const { saveDesign } = useAuth();
    return <button onClick={() => saveDesign({ ...remote, name: "Offline A" })}>Save offline edit</button>;
  }
  renderGallery(<SaveOfflineEdit />);
  await screen.findByText("Remote A");
  fireEvent.click(screen.getByText("Save offline edit"));
  await screen.findByText("Offline A");
  fireEvent.click(deleteButton("Offline A"));
  await waitFor(() => expect(serverDesigns).toEqual([]));
  await waitFor(() => expect(screen.queryByText("Offline A")).not.toBeInTheDocument());
  expect(screen.queryByText("Remote A")).not.toBeInTheDocument();
});
