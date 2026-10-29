import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asUser, IDS, mustPlaceOrder, placeOrder, publicOrder, TOKENS } from "../helpers";

describe("placing orders", () => {
  it("calculates totals from trusted menu prices and snapshots the item", async () => {
    const order = await mustPlaceOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 3 }],
      randomUUID(),
    );
    expect(order.total_minor).toBe(135000);
    expect(order.order_number).toMatch(/^O\d+$/);

    const payload = await publicOrder(order.public_token);
    expect(payload.ok).toBe(true);
    const view = payload.order!;
    expect(view.status).toBe("pending");
    expect(view.subtotal_minor).toBe(135000);
    expect(view.charges_minor).toBe(0);
    expect(view.total_minor).toBe(135000);
    expect(view.items[0].unit_price_minor).toBe(45000);
    expect(view.items[0].quantity).toBe(3);
    expect(view.items[0].name).toBe("Test Pilau");
  });

  it("keeps the historical price when the menu price changes", async () => {
    const order = await mustPlaceOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 1 }],
      randomUUID(),
    );

    await asUser(IDS.ownerA, (client) =>
      client.query("update public.menu_items set price_minor = 51000 where id = $1", [IDS.itemA]),
    );

    try {
      const payload = await publicOrder(order.public_token);
      expect(payload.order!.total_minor).toBe(45000);
      expect(payload.order!.items[0].unit_price_minor).toBe(45000);

      const newOrder = await mustPlaceOrder(
        TOKENS.tableA,
        [{ menu_item_id: IDS.itemA, quantity: 1 }],
        randomUUID(),
      );
      expect(newOrder.total_minor).toBe(51000);
    } finally {
      await asUser(IDS.ownerA, (client) =>
        client.query("update public.menu_items set price_minor = 45000 where id = $1", [IDS.itemA]),
      );
    }
  });

  it("returns the same order when the same idempotency key is retried", async () => {
    const key = randomUUID();
    const first = await mustPlaceOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 1 }],
      key,
    );
    const second = await mustPlaceOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 1 }],
      key,
    );

    expect(second.order_id).toBe(first.order_id);

    const count = await asUser(IDS.ownerA, (client) =>
      client.query<{ count: string }>(
        "select count(*)::text as count from public.staff_orders where order_number = $1",
        [first.order_number],
      ),
    );
    expect(count.rows[0].count).toBe("1");
  });

  it("keeps idempotency keys scoped to the table that placed the order", async () => {
    // A key replayed from a different table must create that table's own order,
    // never hand back the first table's order number or diner token.
    const key = randomUUID();
    const first = await mustPlaceOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 1 }],
      key,
    );
    const second = await mustPlaceOrder(
      TOKENS.tableB,
      [{ menu_item_id: IDS.itemB, quantity: 1 }],
      key,
    );

    expect(second.order_id).not.toBe(first.order_id);
    expect(second.public_token).not.toBe(first.public_token);

    const view = await publicOrder(second.public_token);
    expect(view.order!.items[0].name).toBe("Rival Dish");
  });

  it("rejects unavailable items even if a stale page still shows them", async () => {
    const result = await placeOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemASoldOut, quantity: 1 }],
      randomUUID(),
    );
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("item_unavailable");
    expect(result.error_detail).toContain("Sold Out Stew");
  });

  it("rejects an item that belongs to another restaurant", async () => {
    const result = await placeOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemB, quantity: 1 }],
      randomUUID(),
    );
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("invalid_menu_item");
  });

  it("rejects invalid quantities", async () => {
    const zero = await placeOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 0 }],
      randomUUID(),
    );
    expect(zero.error_code).toBe("invalid_items");

    const huge = await placeOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 100 }],
      randomUUID(),
    );
    expect(huge.error_code).toBe("invalid_items");
  });

  it("rejects an empty cart and an unknown table", async () => {
    const empty = await placeOrder(TOKENS.tableA, [], randomUUID());
    expect(empty.error_code).toBe("invalid_items");

    const unknown = await placeOrder(
      "unknown-token-that-is-long-enough-1234",
      [{ menu_item_id: IDS.itemA, quantity: 1 }],
      randomUUID(),
    );
    expect(unknown.error_code).toBe("invalid_table_token");
  });

  it("records the tablet source", async () => {
    const order = await mustPlaceOrder(
      TOKENS.tableA,
      [{ menu_item_id: IDS.itemA, quantity: 1 }],
      randomUUID(),
      "tablet",
    );
    const source = await asUser(IDS.ownerA, (client) =>
      client.query<{ source: string }>("select source from public.staff_orders where id = $1", [
        order.order_id,
      ]),
    );
    expect(source.rows[0].source).toBe("tablet");
  });

  it("does not expose an order through an invalid public token", async () => {
    const payload = await publicOrder("a".repeat(32));
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("order_not_found");
  });
});
