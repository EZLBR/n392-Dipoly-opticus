import { afterEach, expect, it, vi } from "vitest";
import { fetchSimulatedCheckoutHtml } from "../utils/simulated-checkout";

afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });

it("loads the private checkout with Authorization instead of putting the token in its URL", async () => {
  localStorage.setItem("opticus_token", "private-token");
  vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    expect(String(url)).toBe("http://localhost:5000/api/payments/simulated-checkout?billingId=private-bill");
    expect(new Headers(init?.headers).get("Authorization")).toBe("Bearer private-token");
    return new Response("<h1>My checkout</h1>", { headers: { "Content-Type": "text/html" } });
  });
  expect(await fetchSimulatedCheckoutHtml("http://localhost:5000/api/payments/simulated-checkout?billingId=private-bill")).toContain("My checkout");
});

it("does not send the account token to an external checkout URL", async () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  await expect(fetchSimulatedCheckoutHtml("https://unrelated.invalid/api/payments/simulated-checkout?billingId=x")).rejects.toThrow();
  expect(fetch).not.toHaveBeenCalled();
});
