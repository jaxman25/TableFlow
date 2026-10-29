import { withRole } from "@/lib/db/pool";
import { AppError, errorForCode } from "@/lib/db/errors";
import type { OrderStatus, StaffOrder } from "@/lib/types";

type StaffOrderRow = Omit<StaffOrder, "items">;
type StaffItemRow = {
  id: string;
  order_id: string;
  item_name_snapshot: string;
  quantity: number;
  notes: string | null;
  unit_price_minor: string | number | null;
  line_total_minor: string | number | null;
};

function numberOrNull(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === "string" ? Number(value) : value;
}

function assemble(orders: StaffOrderRow[], items: StaffItemRow[]): StaffOrder[] {
  const byOrder = new Map<string, StaffOrder["items"]>();
  for (const item of items) {
    const list = byOrder.get(item.order_id) ?? [];
    list.push({
      id: item.id,
      name: item.item_name_snapshot,
      quantity: item.quantity,
      notes: item.notes,
      unit_price_minor: numberOrNull(item.unit_price_minor),
      line_total_minor: numberOrNull(item.line_total_minor),
    });
    byOrder.set(item.order_id, list);
  }
  return orders.map((order) => ({
    ...order,
    subtotal_minor: numberOrNull(order.subtotal_minor),
    charges_minor: numberOrNull(order.charges_minor),
    total_minor: numberOrNull(order.total_minor),
    items: byOrder.get(order.id) ?? [],
  }));
}

export async function fetchStaffOrders(
  userId: string,
  options: { includeHistory?: boolean } = {},
): Promise<StaffOrder[]> {
  return withRole("authenticated", userId, async (client) => {
    const statuses = options.includeHistory
      ? null
      : ["pending", "accepted", "preparing", "ready", "served"];

    const orders = await client.query<StaffOrderRow>(
      `select id, order_number, table_number, status, source, customer_note,
              subtotal_minor, charges_minor, total_minor, created_at, updated_at,
              accepted_at, ready_at, served_at, completed_at, cancelled_at
         from public.staff_orders
        where ($1::text[] is null or status = any($1::text[]))
        order by created_at asc
        limit 100`,
      [statuses],
    );

    if (orders.rows.length === 0) return [];

    const items = await client.query<StaffItemRow>(
      `select id, order_id, item_name_snapshot, quantity, notes,
              unit_price_minor, line_total_minor
         from public.staff_order_items
        where order_id = any($1::uuid[])
        order by created_at asc`,
      [orders.rows.map((order) => order.id)],
    );

    return assemble(orders.rows, items.rows);
  });
}

export async function fetchStaffOrder(userId: string, orderId: string): Promise<StaffOrder> {
  return withRole("authenticated", userId, async (client) => {
    const order = await client.query<StaffOrderRow>(
      `select id, order_number, table_number, status, source, customer_note,
              subtotal_minor, charges_minor, total_minor, created_at, updated_at,
              accepted_at, ready_at, served_at, completed_at, cancelled_at
         from public.staff_orders
        where id = $1`,
      [orderId],
    );

    if (order.rowCount === 0) {
      throw new AppError("order_not_found", "That order could not be found.", 404);
    }

    const items = await client.query<StaffItemRow>(
      `select id, order_id, item_name_snapshot, quantity, notes,
              unit_price_minor, line_total_minor
         from public.staff_order_items
        where order_id = $1
        order by created_at asc`,
      [orderId],
    );

    return assemble(order.rows, items.rows)[0];
  });
}

export type OrderTimelineEntry = {
  from_status: string | null;
  to_status: string;
  reason: string | null;
  created_at: string;
  actor_name: string | null;
};

export async function fetchOrderTimeline(
  userId: string,
  orderId: string,
): Promise<OrderTimelineEntry[]> {
  return withRole("authenticated", userId, async (client) => {
    const result = await client.query<OrderTimelineEntry>(
      `select e.from_status, e.to_status, e.reason, e.created_at, p.display_name as actor_name
         from public.order_status_events e
         left join public.profiles p on p.id = e.actor_id
        where e.order_id = $1
        order by e.created_at asc`,
      [orderId],
    );
    return result.rows;
  });
}

export async function changeOrderStatus(
  userId: string,
  orderId: string,
  toStatus: OrderStatus,
  reason?: string | null,
): Promise<{ previous_status: string; status: string }> {
  return withRole("authenticated", userId, async (client) => {
    const result = await client.query<{
      ok: boolean;
      error_code: string | null;
      previous_status: string | null;
      status: string | null;
    }>(
      "select ok, error_code, previous_status, status from public.update_order_status($1, $2, $3)",
      [orderId, toStatus, reason ?? null],
    );
    const row = result.rows[0];
    if (!row.ok) throw errorForCode(row.error_code ?? "internal_error");
    return {
      previous_status: row.previous_status as string,
      status: row.status as string,
    };
  });
}
