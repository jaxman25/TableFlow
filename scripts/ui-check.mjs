/**
 * Browser check for the flows that only exist in the UI (server actions,
 * cart state, live queue). Requires the dev server and seeded demo data.
 *
 *   npm run dev       # terminal 1
 *   npm run ui-check  # terminal 2
 */
import { chromium } from "playwright";

const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const TABLE_TOKEN = process.env.SMOKE_TABLE_TOKEN ?? "devqr-mama-njeris-table-04-9f3a2b1c";
const suffix = String(Date.now()).slice(-5);
const tableName = `Patio ${suffix}`;
const itemName = `Mango Sorbet ${suffix}`;

let checks = 0;
function ok(condition, label, detail = "") {
  checks += 1;
  if (!condition) throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
  console.log(`ok    ${label}`);
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

try {
  // ---------------------------------------------------------------- sign in
  await page.goto(`${BASE}/staff/login`);
  await page.fill('input[type="email"]', "owner@tableflow.test");
  await page.fill('input[type="password"]', "tableflow123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/staff");
  ok(await page.getByText("Order queue").isVisible(), "owner signs in and sees the queue");

  // ------------------------------------------------------------ create table
  await page.goto(`${BASE}/admin/tables`);
  const createForm = page.locator("form", { hasText: "Add a table" });
  await createForm.locator('input[name="tableNumber"]').fill(tableName);
  await page.getByRole("button", { name: "Create table & QR" }).click();
  await page.getByText("New table QR").waitFor({ timeout: 10_000 });
  const qrVisible = await page
    .getByRole("dialog")
    .locator("img")
    .isVisible()
    .catch(() => false);
  ok(qrVisible, "new table shows a printable QR code");
  const qrText = await page.getByRole("dialog").innerText();
  ok(qrText.includes("Only a hash is stored"), "QR is shown once with a clear warning");
  await page.getByRole("button", { name: "Close" }).click();
  await page.getByRole("cell", { name: tableName, exact: true }).waitFor();
  ok(true, "new table appears in the table list");

  // -------------------------------------------------------------- add menu
  await page.goto(`${BASE}/admin/menu`);
  const categoryForm = page.locator("form", { hasText: "Add category" });
  await categoryForm.locator('input[name="name"]').fill(`Desserts ${suffix}`);
  await categoryForm.getByRole("button", { name: "Add category" }).click();
  await page.getByText("Category added.").waitFor();
  ok(true, "owner adds a menu category");

  const itemForm = page.locator("form", { hasText: "Add menu item" });
  await itemForm.locator('input[name="name"]').fill(itemName);
  await itemForm.locator('select[name="categoryId"]').selectOption({ label: `Desserts ${suffix}` });
  await itemForm.locator('input[name="priceShillings"]').fill("300");
  await itemForm.locator('textarea[name="description"]').fill("House-made sorbet.");
  await itemForm.getByRole("button", { name: "Add item" }).click();
  await page.getByText("Item added.").waitFor();
  ok(await page.getByText(itemName).first().isVisible(), "owner adds a menu item");

  // ------------------------------------------------------- customer order
  await page.goto(`${BASE}/t/${TABLE_TOKEN}`);
  const itemCard = page.locator("article", { hasText: itemName });
  await itemCard.getByRole("button", { name: "Add" }).click();
  ok(await page.getByRole("button", { name: "Review order" }).isVisible(), "cart dock appears");

  await page.getByRole("button", { name: "Review order" }).click();
  await page.getByRole("dialog", { name: "Review your order" }).waitFor();
  await page.getByRole("button", { name: "Place order" }).click();
  await page.waitForURL("**/order/**", { timeout: 15_000 });
  ok(await page.getByText("Order received.").isVisible(), "diner places an order from the cart");
  ok(await page.getByText(itemName).first().isVisible(), "status page lists the ordered item");

  const orderUrl = page.url();

  // ---------------------------------------------------------- staff accept
  await page.goto(`${BASE}/staff`);
  const orderCard = page.locator("a.order-card", { hasText: itemName }).first();
  await orderCard.waitFor({ timeout: 15_000 });
  await orderCard.click();
  await page.getByRole("heading", { name: /Table/ }).waitFor();
  await page.getByRole("button", { name: "Accept order" }).click();
  await page.getByRole("button", { name: "Start preparing" }).waitFor({ timeout: 10_000 });
  ok(true, "staff accepts the order and sees the next valid action");

  // ------------------------------------------------------ diner sees update
  await page.goto(orderUrl);
  await page.getByText("Accepted").first().waitFor({ timeout: 15_000 });
  ok(true, "diner sees the accepted status");

  console.log(`\n${checks} UI checks passed`);
} catch (error) {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
