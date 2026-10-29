"use client";

import { useEffect, useRef, useState } from "react";
import { Brand } from "@/components/shared/Brand";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { formatMoney, formatTime } from "@/lib/format";
import type { OrderStatus, PublicOrder } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/types";

const FLOW: OrderStatus[] = ["pending", "accepted", "preparing", "ready", "served"];

// Plain-language headline per stage; the badge already carries the status name.
const HEADLINE: Record<string, string> = {
  pending: "Order received",
  accepted: "The team has your order",
  preparing: "Your food is being prepared",
  ready: "Your order is ready",
  served: "Enjoy your meal",
};

export function OrderStatusLive({
  token,
  initialOrder,
  justPlaced,
}: {
  token: string;
  initialOrder: PublicOrder;
  justPlaced: boolean;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [connection, setConnection] = useState<"live" | "reconnecting">("live");
  // Rendered only after a client refresh, so server and client markup agree.
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const latest = useRef(initialOrder);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch(`/api/public/orders/${token}`, { cache: "no-store" });
        if (!response.ok) throw new Error("bad response");
        const next = (await response.json()) as PublicOrder;
        if (cancelled) return;
        latest.current = next;
        setOrder(next);
        setConnection("live");
        setCheckedAt(next.updated_at ?? null);
      } catch {
        if (!cancelled) setConnection("reconnecting");
      }
    }

    const timer = window.setInterval(refresh, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const currentIndex = FLOW.indexOf(order.status);
  const isCancelled = order.status === "cancelled";
  const isCompleted = order.status === "completed";

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Brand href="/" />
          <span className={`conn ${connection === "live" ? "" : "conn-offline"}`}>
            <span className={`conn-dot ${connection === "live" ? "conn-live" : ""}`} />
            {connection === "live" ? "Live" : "Reconnecting…"}
          </span>
        </div>
      </header>

      <main id="main" className="customer-shell">
        <div className="container" style={{ maxWidth: 680 }}>
          {justPlaced ? (
            <div className="alert alert-success" style={{ marginBottom: 14 }} role="status">
              <strong>Order received.</strong> The team has your order for Table {order.table_number}.
              Keep this page open to follow progress.
            </div>
          ) : null}

          <section className="card status-hero">
            <div className="status-line">
              <StatusBadge status={order.status} />
              <span className="tiny muted mono">Order {order.order_number}</span>
              <span className="chip">Table {order.table_number}</span>
            </div>
            <h1>
              {isCancelled
                ? "This order was cancelled"
                : isCompleted
                  ? "All done — thank you"
                  : (HEADLINE[order.status] ?? STATUS_LABELS[order.status])}
            </h1>
            <p className="muted small" style={{ margin: 0 }}>              {order.restaurant_name} · placed {formatTime(order.created_at)} · checked {" "}
              {formatTime(checkedAt ?? order.updated_at)}
            </p>

            {!isCancelled ? (
              <div className="progress">
                <ol className="progress-track" aria-label="Order progress">
                  {FLOW.map((status, index) => {
                    const done = isCompleted || (currentIndex >= 0 && index <= currentIndex);
                    const current = !isCompleted && index === currentIndex;
                    return (
                      <li
                        key={status}
                        className={`progress-step ${done ? "is-done" : ""} ${
                          current ? "is-current" : ""
                        }`}
                        aria-current={current ? "step" : undefined}
                      >
                        {STATUS_LABELS[status]}
                      </li>
                    );
                  })}
                </ol>
              </div>
            ) : (
              <div className="alert alert-warn" style={{ marginTop: 6 }}>
                Please speak to a staff member if you did not expect this. Nothing has been charged.
              </div>
            )}

            {order.status === "served" && !isCompleted ? (
              <p className="tiny muted" style={{ margin: 0 }}>
                Enjoy your meal. Your server will close the order when you are ready.
              </p>
            ) : null}
          </section>

          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-head">
              <h2>Your items</h2>
              <span className="tiny muted">
                {order.items.reduce((sum, item) => sum + item.quantity, 0)} item
                {order.items.reduce((sum, item) => sum + item.quantity, 0) === 1 ? "" : "s"}
              </span>
            </div>
            <div className="panel-body">
              <div className="order-lines">
                {order.items.map((item, index) => (
                  <div className="order-line" key={`${item.name}-${index}`}>
                    <span className="qty-badge">{item.quantity}×</span>
                    <span>
                      {item.name}
                      {item.notes ? (
                        <span className="tiny muted" style={{ display: "block" }}>
                          {item.notes}
                        </span>
                      ) : null}
                    </span>
                    <span className="price">
                      {formatMoney(item.line_total_minor, order.currency)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="totals" style={{ marginTop: 16 }}>
                <div>
                  <span>Subtotal</span>
                  <span>{formatMoney(order.subtotal_minor, order.currency)}</span>
                </div>
                {order.charges_minor > 0 ? (
                  <div>
                    <span>Charges</span>
                    <span>{formatMoney(order.charges_minor, order.currency)}</span>
                  </div>
                ) : null}
                <div className="grand">
                  <span>Total</span>
                  <span>{formatMoney(order.total_minor, order.currency)}</span>
                </div>
              </div>

              {order.customer_note ? (
                <p className="tiny muted" style={{ marginTop: 12, marginBottom: 0 }}>
                  Your note: {order.customer_note}
                </p>
              ) : null}
            </div>
          </section>

          <div className="alert alert-info small" style={{ marginTop: 16 }}>
            <strong>Payment:</strong> please pay your server. This app does not take payments yet and
            will never ask for your M-Pesa PIN.
          </div>

          <p className="tiny muted" style={{ marginTop: 16 }}>
            Keep this page open for updates. If the connection drops it reconnects and reloads the
            latest status from the restaurant.
          </p>
        </div>
      </main>
    </>
  );
}
