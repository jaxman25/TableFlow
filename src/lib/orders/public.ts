import { errorForCode } from "@/lib/db/errors";
import { withRole } from "@/lib/db/pool";
import type { PublicOrder, TableContext } from "@/lib/types";

export type PlaceOrderInput = {
  tableToken: string;
  source: "qr" | "tablet";
  idempotencyKey: string;
  note?: string | null;
  items: { menuItemId: string; quantity: number; notes?: string | null }[];
};

type ContextEnvelope =
  | ({ ok: true } & TableContext)
  | { ok: false; error: string };

type PublicOrderEnvelope =
  | { ok: true; order: PublicOrder }
  | { ok: false; error: string };

export type PlaceOrderRow = {
  ok: boolean;
  error_code: string | null;
  error_detail: string | null;
  order_id: string | null;
  order_number: string | null;
  public_token: string | null;
  subtotal_minor: string | number | null;
  total_minor: string | number | null;
  status: string | null;
  created_at: string | null;
};

export async function fetchTableContext(token: string): Promise<TableContext> {
  return withRole("anon", null, async (client) => {
    const result = await client.query<{ ctx: ContextEnvelope }>(
      "select public.get_table_context($1) as ctx",
      [token],
    );
    const ctx = result.rows[0].ctx;
    if (!ctx.ok) throw errorForCode(ctx.error);
    return { restaurant: ctx.restaurant, table: ctx.table, categories: ctx.categories };
  });
}

export async function fetchPublicOrder(token: string): Promise<PublicOrder> {
  return withRole("anon", null, async (client) => {
    const result = await client.query<{ payload: PublicOrderEnvelope }>(
      "select public.get_public_order($1) as payload",
      [token],
    );
    const payload = result.rows[0].payload;
    if (!payload.ok) throw errorForCode(payload.error);
    return payload.order;
  });
}

export async function submitOrder(input: PlaceOrderInput): Promise<{
  orderId: string;
  orderNumber: string;
  publicToken: string;
  subtotalMinor: number;
  totalMinor: number;
  status: string;
}> {
  return withRole("anon", null, async (client) => {
    const result = await client.query<PlaceOrderRow>(
      `select ok, error_code, error_detail, order_id, order_number, public_token,
              subtotal_minor, total_minor, status, created_at
         from public.place_order($1, $2::jsonb, $3, $4, $5)`,
      [
        input.tableToken,
        JSON.stringify(
          input.items.map((item) => ({
            menu_item_id: item.menuItemId,
            quantity: item.quantity,
            ...(item.notes ? { notes: item.notes } : {}),
          })),
        ),
        input.idempotencyKey,
        input.source,
        input.note ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row.ok) throw errorForCode(row.error_code ?? "internal_error", row.error_detail);

    return {
      orderId: row.order_id as string,
      orderNumber: row.order_number as string,
      publicToken: row.public_token as string,
      subtotalMinor: Number(row.subtotal_minor),
      totalMinor: Number(row.total_minor),
      status: row.status as string,
    };
  });
}
