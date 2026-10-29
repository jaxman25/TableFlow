import { jsonError, toAppError } from "@/lib/db/errors";
import { fetchPublicOrder } from "@/lib/orders/public";

export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const order = await fetchPublicOrder(token);
    return Response.json(order, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
