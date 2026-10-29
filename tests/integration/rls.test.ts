import { describe, expect, it } from "vitest";
import { asAnon, asUser, IDS, TOKENS } from "../helpers";

describe("restaurant isolation (RLS)", () => {
  it("lists only the restaurants a user belongs to", async () => {
    const result = await asUser(IDS.ownerA, (client) =>
      client.query<{ id: string }>("select id from public.restaurants order by id"),
    );
    expect(result.rows.map((row) => row.id)).toEqual([IDS.restaurantA]);
  });

  it("hides another restaurant's menu items", async () => {
    const result = await asUser(IDS.ownerA, (client) =>
      client.query<{ id: string }>("select id from public.menu_items order by id"),
    );
    expect(result.rows.map((row) => row.id)).not.toContain(IDS.itemB);
  });

  it("cannot update a row owned by another restaurant", async () => {
    const result = await asUser(IDS.ownerA, (client) =>
      client.query("update public.menu_items set price_minor = 1 where id = $1", [IDS.itemB]),
    );
    expect(result.rowCount).toBe(0);
  });

  it("cannot insert a menu item into another restaurant", async () => {
    await expect(
      asUser(IDS.ownerA, (client) =>
        client.query(
          `insert into public.menu_items (restaurant_id, name, price_minor)
           values ($1, 'Smuggled item', 100)`,
          [IDS.restaurantB],
        ),
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it("cannot insert a menu item with a category from another restaurant", async () => {
    await expect(
      asUser(IDS.ownerB, (client) =>
        client.query(
          `insert into public.menu_items (restaurant_id, category_id, name, price_minor)
           values ($1, $2, 'Mismatched category', 100)`,
          [IDS.restaurantB, IDS.categoryA],
        ),
      ),
    ).rejects.toThrow(/foreign key|violates/i);
  });

  it("denies authenticated users direct access to order tables", async () => {
    await expect(
      asUser(IDS.ownerA, (client) => client.query("select * from public.orders")),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asUser(IDS.ownerA, (client) => client.query("select * from public.order_items")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("denies anonymous users any direct table access", async () => {
    await expect(
      asAnon((client) => client.query("select * from public.restaurants")),
    ).rejects.toThrow(/permission denied/i);

    await expect(
      asAnon((client) => client.query("select * from public.orders")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("shows kitchen staff the order queue without prices or totals", async () => {
    const orders = await asUser(IDS.kitchenA, (client) =>
      client.query<{ total_minor: string | null; restaurant_id: string }>(
        "select total_minor, restaurant_id from public.staff_orders",
      ),
    );
    expect(orders.rows.length).toBeGreaterThan(0);
    for (const order of orders.rows) {
      expect(order.restaurant_id).toBe(IDS.restaurantA);
      expect(order.total_minor).toBeNull();
    }

    const items = await asUser(IDS.kitchenA, (client) =>
      client.query<{ unit_price_minor: string | null; line_total_minor: string | null }>(
        "select unit_price_minor, line_total_minor from public.staff_order_items",
      ),
    );
    expect(items.rows.length).toBeGreaterThan(0);
    for (const item of items.rows) {
      expect(item.unit_price_minor).toBeNull();
      expect(item.line_total_minor).toBeNull();
    }
  });

  it("hides the priced menu from kitchen staff", async () => {
    const items = await asUser(IDS.kitchenA, (client) =>
      client.query("select id from public.menu_items"),
    );
    expect(items.rowCount).toBe(0);
  });

  it("does not let one restaurant's staff see another's orders", async () => {
    const result = await asUser(IDS.ownerB, (client) =>
      client.query<{ id: string }>("select id from public.staff_orders"),
    );
    for (const row of result.rows) {
      expect(row.id).toBeTruthy();
    }
    const own = await asUser(IDS.ownerB, (client) =>
      client.query<{ restaurant_id: string }>("select restaurant_id from public.staff_orders"),
    );
    expect(own.rows.every((row) => row.restaurant_id === IDS.restaurantB)).toBe(true);
  });

  it("resolves a valid table token publicly", async () => {
    const result = await asAnon((client) =>
      client.query<{
        ctx: { ok: boolean; restaurant: { name: string }; table: { number: string } };
      }>("select public.get_table_context($1) as ctx", [TOKENS.tableA]),
    );
    expect(result.rows[0].ctx.ok).toBe(true);
    expect(result.rows[0].ctx.restaurant.name).toBe("Restaurant A");
    expect(result.rows[0].ctx.table.number).toBe("T1");
  });

  it("rejects unknown table tokens", async () => {
    const result = await asAnon((client) =>
      client.query<{ ctx: { ok: boolean; error: string } }>(
        "select public.get_table_context($1) as ctx",
        ["x".repeat(40)],
      ),
    );
    expect(result.rows[0].ctx.ok).toBe(false);
    expect(result.rows[0].ctx.error).toBe("invalid_table_token");
  });

  it("prevents a manager from demoting or revoking an owner", async () => {
    const demote = await asUser(IDS.managerA, (client) =>
      client.query(
        "update public.restaurant_members set role = 'wait_staff' where user_id = $1",
        [IDS.ownerA],
      ),
    );
    expect(demote.rowCount).toBe(0);

    const revoke = await asUser(IDS.managerA, (client) =>
      client.query(
        "update public.restaurant_members set status = 'revoked' where user_id = $1",
        [IDS.ownerA],
      ),
    );
    expect(revoke.rowCount).toBe(0);
  });

  it("stops the last active owner from demoting or revoking themselves", async () => {
    await expect(
      asUser(IDS.ownerA, (client) =>
        client.query("update public.restaurant_members set role = 'manager' where user_id = $1", [
          IDS.ownerA,
        ]),
      ),
    ).rejects.toThrow(/last_owner_required/);

    await expect(
      asUser(IDS.ownerA, (client) =>
        client.query("update public.restaurant_members set status = 'revoked' where user_id = $1", [
          IDS.ownerA,
        ]),
      ),
    ).rejects.toThrow(/last_owner_required/);
  });

  it("prevents kitchen staff from reading payment records", async () => {
    await expect(
      asUser(IDS.kitchenA, (client) => client.query("select * from public.payments")),
    ).rejects.toThrow(/permission denied/i);
  });

  it("only lets managers append audit entries, and stamps the real actor", async () => {
    const kitchenAttempt = await asUser(IDS.kitchenA, (client) =>
      client.query<{ ok: boolean }>(
        "select public.write_audit($1, 'test.action', 'menu_item', null, '{}'::jsonb) as ok",
        [IDS.restaurantA],
      ),
    );
    expect(kitchenAttempt.rows[0].ok).toBe(false);

    const managerAttempt = await asUser(IDS.managerA, (client) =>
      client.query<{ ok: boolean }>(
        "select public.write_audit($1, 'test.action', 'menu_item', null, '{}'::jsonb) as ok",
        [IDS.restaurantA],
      ),
    );
    expect(managerAttempt.rows[0].ok).toBe(true);

    const entry = await asUser(IDS.ownerA, (client) =>
      client.query<{ actor_id: string }>(
        "select actor_id from public.audit_logs where action = 'test.action' order by created_at desc limit 1",
      ),
    );
    expect(entry.rows[0].actor_id).toBe(IDS.managerA);
  });

  it("keeps audit logs scoped to the restaurant's managers", async () => {
    const owner = await asUser(IDS.ownerA, (client) =>
      client.query<{ restaurant_id: string }>("select restaurant_id from public.audit_logs"),
    );
    expect(owner.rows.length).toBeGreaterThan(0);
    expect(owner.rows.every((row) => row.restaurant_id === IDS.restaurantA)).toBe(true);

    const kitchen = await asUser(IDS.kitchenA, (client) =>
      client.query("select id from public.audit_logs"),
    );
    expect(kitchen.rowCount).toBe(0);
  });
});
