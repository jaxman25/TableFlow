import { getSession } from "@/lib/auth/session";
import { getQueueMembership } from "@/lib/auth/staff";
import { jsonError, toAppError } from "@/lib/db/errors";
import { fetchStaffOrders } from "@/lib/orders/staff";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }
  if (!(await getQueueMembership(session.userId))) {
    return Response.json({ error: "Your role does not include the order queue." }, { status: 403 });
  }

  try {
    const url = new URL(request.url);
    const orders = await fetchStaffOrders(session.userId, {
      includeHistory: url.searchParams.get("history") === "1",
    });
    return Response.json(
      { orders, fetchedAt: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
