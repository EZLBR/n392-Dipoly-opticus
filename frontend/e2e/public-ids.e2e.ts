import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const legacyResourcePath = /^\/api\/(?:auth\/users|orders(?:\/mine)?|designs|products|categories|stock\/product)\/\d+(?:\/|$)/;

test("uses public identifiers through design editing, checkout and order history", async ({ page }) => {
  const numericPaths: string[] = [];
  page.on("request", request => {
    const path = new URL(request.url()).pathname;
    if (legacyResourcePath.test(path)) numericPaths.push(path);
  });
  page.on("dialog", dialog => dialog.accept());
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "yes");
    localStorage.setItem("opticus_language", "en");
    localStorage.setItem("opticus_studio_owner", "anonymous");
    localStorage.setItem("opticus_designs", JSON.stringify([{ id: 48, name: "Old design" }]));
    localStorage.setItem("opticus_active_design", "0");
    localStorage.setItem("opticus_active_product", "37");
    localStorage.setItem("opticus_orders", JSON.stringify([{ id: 12 }]));
    localStorage.setItem("opticus_cart", JSON.stringify([{ id: 37, factoryId: 12 }]));
  });

  await page.goto("/login");
  await expect.poll(() => page.evaluate(() => [
    localStorage.getItem("opticus_designs"), localStorage.getItem("opticus_cart"),
    localStorage.getItem("opticus_active_design"), localStorage.getItem("opticus_active_product"),
    localStorage.getItem("opticus_orders"),
  ])).toEqual(["[]", "[]", null, null, null]);

  await page.getByRole("tab", { name: "SIGN UP" }).click();
  await page.getByLabel("Full name").fill("Test customer");
  await page.getByLabel("Email address").fill(`customer-${randomUUID()}@example.invalid`);
  await page.getByLabel("Password (8+ characters)", { exact: true }).fill("Customer123");
  await page.getByLabel("Confirm password").fill("Customer123");
  await page.getByRole("button", { name: "CREATE ACCOUNT", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/create");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Design name").fill("Public ID Frame");
  const created = page.waitForResponse(response =>
    response.request().method() === "POST" && new URL(response.url()).pathname === "/api/designs");
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  const createdResponse = await created;
  expect(createdResponse.ok()).toBe(true);
  const { id } = await createdResponse.json();
  expect(id).toMatch(uuid);

  await page.getByRole("button", { name: "EDIT IN STUDIO" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByLabel("Design name").fill("Edited Public ID Frame");
  const edited = page.waitForResponse(response =>
    response.request().method() === "PUT" && response.url().endsWith(`/api/designs/${id}`));
  await page.getByRole("button", { name: "Save design", exact: true }).click();
  expect((await edited).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Edited Public ID Frame" })).toBeVisible();

  await page.getByRole("button", { name: "ADD TO CART" }).click();
  await page.goto("/cart");
  await page.getByRole("button", { name: "PROCEED TO PIX PAYMENT" }).press("Enter");
  await page.getByRole("button", { name: "SIMULATE PIX PAYMENT" }).click();
  await page.getByRole("button", { name: "DISMISS" }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("opticus_cart"))).toBe("[]");

  await page.goto("/orders");
  const order = page.getByRole("link", { name: "Edited Public ID Frame" });
  const href = await order.getAttribute("href");
  expect(href?.split("/").at(-1)).toMatch(uuid);
  await order.click();
  await expect(page.getByRole("heading", { name: "Order details" })).toBeVisible();

  await page.goto("/orders/48");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("Order not found.");
  await page.goto("/designs");
  const deleted = page.waitForResponse(response =>
    response.request().method() === "DELETE" && response.url().endsWith(`/api/designs/${id}`));
  await page.getByTitle("Delete Design").click();
  expect((await deleted).ok()).toBe(true);
  await expect(page.getByRole("heading", { name: "Edited Public ID Frame" })).toHaveCount(0);
  expect(numericPaths).toEqual([]);
});
