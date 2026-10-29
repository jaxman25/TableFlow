import { z } from "zod";
import { jsonError, toAppError } from "@/lib/db/errors";
import { submitOrder } from "@/lib/orders/public";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const schema = z.object({
  tableToken: z.string().min(20).max(200),
  source: z.enum(["qr", "tablet"]).default("qr"),
  idempotencyKey: z.string().min(8).max(200),
  note: z.string().max(500).optional().nullable(),
  items: z
    .array(
      z.object({
        menuItemId: z.string().uuid(),
        quantity: z.number().int().min(1).max(99),
        notes: z.string().max(300).optional().nullable(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  try {
    if (!rateLimit(clientKey(request, "order"), 12, 60_000)) {
      return Response.json(
        { error: "Too many attempts. Please wait a moment and try again." },
        { status: 429 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Some order details are missing or invalid." }, { status: 400 });
    }

    const order = await submitOrder(parsed.data);
    return Response.json(order, { status: 201 });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
