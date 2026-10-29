import { asRole, type TestClient } from "./test-db";
import { IDS, TOKENS } from "./test-config";

export function asUser<T>(
  userId: string,
  work: (client: TestClient) => Promise<T>,
): Promise<T> {
  return asRole("authenticated", userId, work);
}

export function asAnon<T>(work: (client: TestClient) => Promise<T>): Promise<T> {
  return asRole("anon", null, work);
}

export type PlaceOrderResult = {
  ok: boolean;
  error_code: string | null;
  error_detail: string | null;
  order_id: string | null;
  order_number: string | null;
  public_token: string | null;
  subtotal_minor: number | null;
  total_minor: number | null;
  status: string | null;
  created_at: string | null;
};

export async function placeOrder(
  token: string,
  items: { menu_item_id: string; quantity: number; notes?: string }[],
  key: string,
  source: "qr" | "tablet" = "qr",
): Promise<PlaceOrderResult> {
  const result = await asAnon((client) =>
    client.query<PlaceOrderResult>(
      `select ok, error_code, error_detail, order_id, order_number, public_token,
              subtotal_minor, total_minor, status, created_at
         from public.place_order($1, $2::jsonb, $3, $4, null)`,
      [token, JSON.stringify(items), key, source],
    ),
  );
  const row = result.rows[0];
  return {
    ...row,
    subtotal_minor: row.subtotal_minor === null ? null : Number(row.subtotal_minor),
    total_minor: row.total_minor === null ? null : Number(row.total_minor),
  };
}

export async function mustPlaceOrder(
  token: string,
  items: { menu_item_id: string; quantity: number; notes?: string }[],
  key: string,
  source: "qr" | "tablet" = "qr",
): Promise<PlaceOrderResult & { order_id: string; order_number: string; public_token: string }> {
  const result = await placeOrder(token, items, key, source);
  if (!result.ok || !result.order_id || !result.order_number || !result.public_token) {
    throw new Error(`place_order failed: ${result.error_code ?? "unknown"}`);
  }
  return {
    ...result,
    order_id: result.order_id,
    order_number: result.order_number,
    public_token: result.public_token,
  };
}

export type PublicOrderPayload = {
  ok: boolean;
  error?: string;
  order?: {
    order_number: string;
    status: string;
    subtotal_minor: number;
    charges_minor: number;
    total_minor: number;
    items: { name: string; unit_price_minor: number; quantity: number }[];
  };
};

export async function publicOrder(token: string): Promise<PublicOrderPayload> {
  const result = await asAnon((client) =>
    client.query<{ payload: PublicOrderPayload }>(
      "select public.get_public_order($1) as payload",
      [token],
    ),
  );
  return result.rows[0].payload;
}

export type TransitionResult = {
  ok: boolean;
  error_code: string | null;
  previous_status: string | null;
  status: string | null;
  updated_at: string | null;
};

export async function transition(
  userId: string,
  orderId: string,
  to: string,
  reason?: string,
): Promise<TransitionResult> {
  const result = await asUser(userId, (client) =>
    client.query<TransitionResult>(
      `select ok, error_code, previous_status, status, updated_at
         from public.update_order_status($1, $2, $3)`,
      [orderId, to, reason ?? null],
    ),
  );
  return result.rows[0];
}

export { IDS, TOKENS };
