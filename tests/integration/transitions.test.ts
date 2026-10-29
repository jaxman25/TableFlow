import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { asUser, IDS, mustPlaceOrder, TOKENS, transition } from "../helpers";

async function freshOrder(): Promise<string> {
  const order = await mustPlaceOrder(
    TOKENS.tableA,
    [{ menu_item_id: IDS.itemA, quantity: 1 }],
    randomUUID(),
  );
  return order.order_id;
}

describe("staff status transitions", () => {
  it("rejects an invalid jump straight to preparing", async () => {
    const orderId = await freshOrder();
    const result = await transition(IDS.waiterA, orderId, "preparing");
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("invalid_transition");
  });

  it("does not let kitchen accept a new order", async () => {
    const orderId = await freshOrder();
    const result = await transition(IDS.kitchenA, orderId, "accepted");
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("invalid_transition");
  });

  it("walks the approved flow and records events plus audit entries", async () => {
    const orderId = await freshOrder();

    expect((await transition(IDS.waiterA, orderId, "accepted")).status).toBe("accepted");
    expect((await transition(IDS.kitchenA, orderId, "preparing")).status).toBe("preparing");
    expect((await transition(IDS.kitchenA, orderId, "ready")).status).toBe("ready");
    expect((await transition(IDS.waiterA, orderId, "served")).status).toBe("served");
    expect((await transition(IDS.waiterA, orderId, "completed")).status).toBe("completed");

    const events = await asUser(IDS.ownerA, (client) =>
      client.query<{ to_status: string }>(
        "select to_status from public.order_status_events where order_id = $1 order by created_at",
        [orderId],
      ),
    );
    expect(events.rows.map((row) => row.to_status)).toEqual([
      "pending",
      "accepted",
      "preparing",
      "ready",
      "served",
      "completed",
    ]);

    const audit = await asUser(IDS.ownerA, (client) =>
      client.query<{ action: string }>(
        "select action from public.audit_logs where entity_id = $1 order by created_at",
        [orderId],
      ),
    );
    expect(audit.rows.map((row) => row.action)).toContain("order.status_changed");
    expect(audit.rows.filter((row) => row.action === "order.status_changed")).toHaveLength(5);
  });

  it("does not let kitchen mark an order served", async () => {
    const orderId = await freshOrder();
    await transition(IDS.waiterA, orderId, "accepted");
    await transition(IDS.kitchenA, orderId, "preparing");
    await transition(IDS.kitchenA, orderId, "ready");

    const result = await transition(IDS.kitchenA, orderId, "served");
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("invalid_transition");
  });

  it("requires a reason for cancellation and closes the order", async () => {
    const orderId = await freshOrder();

    const noReason = await transition(IDS.waiterA, orderId, "cancelled");
    expect(noReason.ok).toBe(false);
    expect(noReason.error_code).toBe("reason_required");

    const cancelled = await transition(IDS.waiterA, orderId, "cancelled", "Diner left");
    expect(cancelled.ok).toBe(true);
    expect(cancelled.status).toBe("cancelled");

    const reopen = await transition(IDS.waiterA, orderId, "accepted");
    expect(reopen.ok).toBe(false);
    expect(reopen.error_code).toBe("invalid_transition");

    const reason = await asUser(IDS.ownerA, (client) =>
      client.query<{ reason: string }>(
        "select reason from public.order_status_events where order_id = $1 and to_status = 'cancelled'",
        [orderId],
      ),
    );
    expect(reason.rows[0].reason).toBe("Diner left");
  });

  it("stops kitchen from cancelling work in preparation", async () => {
    const orderId = await freshOrder();
    await transition(IDS.waiterA, orderId, "accepted");
    await transition(IDS.kitchenA, orderId, "preparing");

    const result = await transition(IDS.kitchenA, orderId, "cancelled", "Not allowed");
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("invalid_transition");
  });

  it("refuses a staff member from another restaurant", async () => {
    const orderId = await freshOrder();
    const result = await transition(IDS.ownerB, orderId, "accepted");
    expect(result.ok).toBe(false);
    expect(result.error_code).toBe("forbidden");
  });

  it("rejects an unknown order and an anonymous actor", async () => {
    const missing = await transition(IDS.ownerA, "99999999-0000-4000-8000-000000000000", "accepted");
    expect(missing.error_code).toBe("order_not_found");

    const orderId = await freshOrder();
    const anonymous = await transition("", orderId, "accepted");
    expect(anonymous.ok).toBe(false);
  });
});
