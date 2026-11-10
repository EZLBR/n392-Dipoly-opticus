// BOLA-04: the server generates a design's id on creation (POST) and only
// updates a design that already exists there (PUT /designs/:id). The client
// never sends an id in the body, so it cannot probe other users' ids.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { setNavigateHandler } from "../api/client";

const SERVER_ID = "3f2b8c1e-9a4d-4f6b-8e2a-1c5d7e9f0a3b";
const remote = { id: "remote-a", name: "Remote A", model: "round", color: "#112233" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function mockApi(serverDesigns: unknown[] = []) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init = {}) => {
    const path = new URL(String(url)).pathname;
    if (init.method === "POST") return json({ id: SERVER_ID }, 201);
    if (init.method === "PUT") return json({ id: path.split("/").pop() });
    if (path.endsWith("/auth/me")) return json({ user: { id: "owner-a", name: "Ana", role: "client" } });
    if (path.endsWith("/designs")) return json({ designs: serverDesigns });
    return json({ users: [] });
  });
}

function writes(fetch: ReturnType<typeof mockApi>) {
  return fetch.mock.calls
    .filter(([, init]) => init?.method === "POST" || init?.method === "PUT")
    .map(([url, init]) => ({ method: init?.method, path: new URL(String(url)).pathname, body: JSON.parse(String(init?.body)) }));
}

async function auth(expectedDesigns: number) {
  const hook = renderHook(() => useAuth(), { wrapper: AuthProvider });
  await waitFor(() => expect(hook.result.current.session).toBeTruthy());
  await waitFor(() => expect(hook.result.current.designs).toHaveLength(expectedDesigns));
  return hook;
}

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem("opticus_token", "test-token");
  localStorage.setItem("opticus_studio_owner", "user:owner-a");
  setNavigateHandler(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); setNavigateHandler(null); localStorage.clear(); });

describe("saving a design uses the server's identity (BOLA-04)", () => {
  it("creates a new design with POST, without an id, and keeps the server's id", async () => {
    const fetch = mockApi();
    const { result } = await auth(0);

    let saved;
    await act(async () => { saved = await result.current.saveDesign({ id: null, name: "New", model: "round", color: "#112233" }); });

    expect(writes(fetch)).toEqual([{ method: "POST", path: "/api/designs", body: expect.not.objectContaining({ id: expect.anything() }) }]);
    expect(saved).toMatchObject({ id: SERVER_ID, remoteId: SERVER_ID, syncStatus: "synced" });
    expect(localStorage.getItem("opticus_active_design_id")).toBe(SERVER_ID);
  });

  it("creates a never-synced local draft with POST and replaces it instead of keeping a copy", async () => {
    localStorage.setItem("opticus_designs", JSON.stringify([{ id: "design-123", name: "Draft", model: "round", color: "#112233", syncStatus: "local" }]));
    const fetch = mockApi();
    const { result } = await auth(1);

    await act(async () => { await result.current.saveDesign({ id: "design-123", name: "Draft", model: "round", color: "#112233" }); });

    expect(writes(fetch)).toEqual([{ method: "POST", path: "/api/designs", body: expect.not.objectContaining({ id: expect.anything() }) }]);
    const cached = JSON.parse(localStorage.getItem("opticus_designs")!);
    expect(cached.map(design => [design.id, design.syncStatus])).toEqual([[SERVER_ID, "synced"]]);
    expect(localStorage.getItem("opticus_active_design_id")).toBe(SERVER_ID);
  });

  it("updates a synchronized design with PUT to its own id, without an id in the body", async () => {
    const fetch = mockApi([remote]);
    const { result } = await auth(1);

    let saved;
    await act(async () => { saved = await result.current.saveDesign({ ...remote, name: "Edited" }); });

    expect(writes(fetch)).toEqual([{ method: "PUT", path: "/api/designs/remote-a", body: expect.not.objectContaining({ id: expect.anything() }) }]);
    expect(saved).toMatchObject({ id: "remote-a", name: "Edited", syncStatus: "synced" });
    expect(result.current.designs.map(design => design.id)).toEqual(["remote-a"]);
  });
});
