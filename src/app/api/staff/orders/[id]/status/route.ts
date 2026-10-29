import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getQueueMembership } from "@/lib/auth/staff";
import { jsonError, toAppError } from "@/lib/db/errors";
import { changeOrderStatus } from "@/lib/orders/staff";
import { ORDER_STATUSES } from "@/lib/types";

const schema = z.object({
  status: z.enum(ORDER_STATUSES),
  reason: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "Please sign in again." }, { status: 401 });
  }
  if (!(await getQueueMembership(session.userId))) {
    return Response.json({ error: "Your role does not include the order queue." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "That status update is not valid." }, { status: 400 });
    }

    const result = await changeOrderStatus(
      session.userId,
      id,
      parsed.data.status,
      parsed.data.reason,
    );

    return Response.json({
      ok: true,
      previousStatus: result.previous_status,
      status: result.status,
    });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
