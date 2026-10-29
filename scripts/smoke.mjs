/**
 * End-to-end smoke test against a running app.
 *
 *   npm run dev            # terminal 1
 *   npm run smoke          # terminal 2
 *
 * Uses the seeded demo restaurant. Exits non-zero on the first failed check.
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const TABLE_TOKEN = process.env.SMOKE_TABLE_TOKEN ?? "devqr-mama-njeris-table-04-9f3a2b1c";
const ITEM_ID = "dddddddd-0000-4000-8000-000000000003"; // Nyama Choma
const SOLD_OUT_ID = "dddddddd-0000-4000-8000-000000000008"; // Fish Fillet & Chips
const PASSWORD = "tableflow123";

let checks = 0;
function ok(condition, label, detail = "") {
  checks += 1;
  if (!condition) {
    throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
  }
  console.log(`ok    ${label}`);
}

async function json(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 200) };
  }
}

async function login(email) {
  const response = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  ok(response.status === 200, `login ${email}`, `got ${response.status}`);
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  ok(cookie.startsWith("tf_session="), "issued staff session cookie");
  return cookie;
}

function orderBody(key, itemId = ITEM_ID, quantity = 1) {
  return JSON.stringify({
    tableToken: TABLE_TOKEN,
    source: "qr",
    idempotencyKey: key,
    note: "Smoke test order",
    items: [{ menuItemId: itemId, quantity, notes: "No onions" }],
  });
}

try {
const health = await fetch(`${BASE}/api/health`);
await health.text();
ok(health.status === 200, "health endpoint");

const menu = await fetch(`${BASE}/t/${TABLE_TOKEN}`);
// React splits adjacent text nodes with comment markers; strip them for assertions.
const menuHtml = (await menu.text()).replace(/<!--.*?-->/g, "");
ok(menu.status === 200, "table menu renders");
ok(menuHtml.includes("Mama Njeri"), "menu shows restaurant name");
ok(menuHtml.includes("Table 4"), "menu shows table 4");
ok(menuHtml.includes("Nyama Choma"), "menu shows items with prices");

const missing = await fetch(`${BASE}/t/not-a-real-token-xxxxxxxxxxxxxxxx`);
ok(missing.status === 200, "unknown table renders a friendly page");
ok(
  (await missing.text()).replace(/<!--.*?-->/g, "").includes("can't open this table"),
  "unknown table page explains the problem",
);

const key = crypto.randomUUID();
const createdResponse = await fetch(`${BASE}/api/public/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(key, ITEM_ID, 2),
});
const created = await json(createdResponse);
ok(createdResponse.status === 201, "order created", JSON.stringify(created));
ok(created.totalMinor === 190000, "server calculated total (2 × 95,000)", String(created.totalMinor));

const duplicateResponse = await fetch(`${BASE}/api/public/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(key, ITEM_ID, 2),
});
const duplicate = await json(duplicateResponse);
ok(duplicateResponse.status === 201, "duplicate submit accepted idempotently");
ok(duplicate.orderId === created.orderId, "duplicate submit returns the same order");

const soldOutResponse = await fetch(`${BASE}/api/public/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: orderBody(crypto.randomUUID(), SOLD_OUT_ID, 1),
});
const soldOut = await json(soldOutResponse);
ok(soldOutResponse.status === 409, "sold-out item rejected", `got ${soldOutResponse.status}`);
ok(soldOut.code === "item_unavailable", "sold-out error code");

const badTokenResponse = await fetch(`${BASE}/api/public/orders`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tableToken: "unknown-token-that-is-long-enough-1234",
    source: "qr",
    idempotencyKey: crypto.randomUUID(),
    items: [{ menuItemId: ITEM_ID, quantity: 1 }],
  }),
});
ok(badTokenResponse.status === 400, "unknown table token rejected");

const statusResponse = await fetch(`${BASE}/api/public/orders/${created.publicToken}`);
const statusPayload = await json(statusResponse);
ok(statusResponse.status === 200, "public order status loads");
ok(statusPayload.status === "pending", "new order is pending");

const ownerCookie = await login("owner@tableflow.test");

const queueResponse = await fetch(`${BASE}/api/staff/orders`, {
  headers: { cookie: ownerCookie },
});
const queue = await json(queueResponse);
ok(queueResponse.status === 200, "staff queue loads");
ok(
  queue.orders.some((order) => order.id === created.orderId),
  "new order appears once in the staff queue",
);
ok(
  queue.orders.filter((order) => order.id === created.orderId).length === 1,
  "queue contains no duplicate of the order",
);
const queueOrder = queue.orders.find((order) => order.id === created.orderId);
ok(queueOrder.table_number === "4", "queue shows the correct table", queueOrder.table_number);
ok(queueOrder.items[0].notes === "No onions", "queue shows the item note");

const acceptResponse = await fetch(`${BASE}/api/staff/orders/${created.orderId}/status`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: ownerCookie },
  body: JSON.stringify({ status: "accepted" }),
});
ok(acceptResponse.status === 200, "staff accepts the order");

const afterAccept = await json(
  await fetch(`${BASE}/api/public/orders/${created.publicToken}`),
);
ok(afterAccept.status === "accepted", "diner sees the accepted status");

const illegalResponse = await fetch(`${BASE}/api/staff/orders/${created.orderId}/status`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: ownerCookie },
  body: JSON.stringify({ status: "completed" }),
});
ok(illegalResponse.status === 400, "illegal status jump rejected");

const kitchenCookie = await login("kitchen@tableflow.test");
const kitchenQueue = await json(
  await fetch(`${BASE}/api/staff/orders`, { headers: { cookie: kitchenCookie } }),
);
ok(kitchenQueue.orders.length > 0, "kitchen can load the queue");
ok(
  kitchenQueue.orders.every((order) => order.total_minor === null),
  "kitchen never receives totals",
);

const kitchenAccept = await fetch(`${BASE}/api/staff/orders/${created.orderId}/status`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: kitchenCookie },
  body: JSON.stringify({ status: "preparing" }),
});
ok(kitchenAccept.status === 200, "kitchen starts preparing an accepted order");

const rivalCookie = await login("rival@tableflow.test");
const rivalQueue = await json(
  await fetch(`${BASE}/api/staff/orders`, { headers: { cookie: rivalCookie } }),
);
ok(
  rivalQueue.orders.every((order) => order.id !== created.orderId),
  "another restaurant cannot see the order",
);

const rivalUpdate = await fetch(`${BASE}/api/staff/orders/${created.orderId}/status`, {
  method: "POST",
  headers: { "content-type": "application/json", cookie: rivalCookie },
  body: JSON.stringify({ status: "ready" }),
});
ok(rivalUpdate.status === 403, "another restaurant cannot update the order");

const admin = await fetch(`${BASE}/admin`, { headers: { cookie: ownerCookie } });
ok(admin.status === 200, "owner can open restaurant admin");

const adminMenu = await fetch(`${BASE}/admin/menu`, { headers: { cookie: ownerCookie } });
ok((await adminMenu.text()).includes("Add menu item"), "owner can manage the menu");

const adminTables = await fetch(`${BASE}/admin/tables`, { headers: { cookie: ownerCookie } });
const adminTablesHtml = await adminTables.text();
ok(adminTablesHtml.includes("Add a table"), "owner can create tables");
ok(adminTablesHtml.includes("Regenerate QR"), "owner can regenerate table QR codes");

const adminStaff = await fetch(`${BASE}/admin/staff`, { headers: { cookie: ownerCookie } });
ok((await adminStaff.text()).includes("Add a staff account"), "owner can manage staff");

const detail = await fetch(`${BASE}/staff/orders/${created.orderId}`, {
  headers: { cookie: ownerCookie },
});
const detailHtml = await detail.text();
ok(detail.status === 200, "staff order detail loads");
ok(detailHtml.includes("Mark ready"), "detail offers the next valid action");
ok(detailHtml.includes("No onions"), "detail shows item notes");

const streamController = new AbortController();
const stream = await fetch(`${BASE}/api/staff/stream`, {
  headers: { cookie: ownerCookie },
  signal: streamController.signal,
});
ok(stream.headers.get("content-type")?.includes("text/event-stream"), "live stream uses SSE");
const reader = stream.body?.getReader();
const firstChunk = reader ? await reader.read() : null;
ok(
  Boolean(firstChunk?.value && new TextDecoder().decode(firstChunk.value).includes("event:")),
  "live stream emits an event",
);
streamController.abort();

const kitchenAdmin = await fetch(`${BASE}/admin`, {
  headers: { cookie: kitchenCookie },
  redirect: "manual",
});
ok(
  kitchenAdmin.status === 307 || kitchenAdmin.status === 302,
  "kitchen is redirected away from admin",
  String(kitchenAdmin.status),
);

console.log(`\n${checks} checks passed`);
} catch (error) {
  console.error(`FAIL  ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
