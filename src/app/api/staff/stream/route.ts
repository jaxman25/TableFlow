import { getSession } from "@/lib/auth/session";
import { getQueueMembership } from "@/lib/auth/staff";
import { fetchStaffOrders } from "@/lib/orders/staff";

export const dynamic = "force-dynamic";

/**
 * Server-sent events for the staff queue.
 *
 * The database remains the source of truth: this stream only signals "something
 * changed" and the client refetches `/api/staff/orders`. Supabase Realtime will
 * replace this transport in production; the client already falls back to
 * periodic polling if the stream drops.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!(await getQueueMembership(session.userId))) {
    return new Response("Forbidden", { status: 403 });
  }

  const encoder = new TextEncoder();
  let fingerprint = "";

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          close();
        }
      };

      const tick = async () => {
        try {
          const orders = await fetchStaffOrders(session.userId);
          const next = orders
            .map((order) => `${order.id}:${order.status}:${order.updated_at}`)
            .join("|");
          if (next !== fingerprint) {
            fingerprint = next;
            send("orders", { changed: true, at: new Date().toISOString() });
          } else {
            send("ping", { at: new Date().toISOString() });
          }
        } catch {
          send("error", { message: "Reconnecting" });
        }
      };

      const timer = setInterval(tick, 3000);
      request.signal.addEventListener("abort", close);
      send("ready", { at: new Date().toISOString() });
      await tick();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
