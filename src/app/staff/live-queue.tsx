"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { formatAge, formatMoney, formatTime } from "@/lib/format";
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus, type StaffOrder } from "@/lib/types";

const QUEUE_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  (status) => status !== "completed" && status !== "cancelled",
);

const URGENT_AFTER_MINUTES = 10;

function ageMinutes(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 60000;
}

export function LiveQueue({ initialOrders }: { initialOrders: StaffOrder[] }) {
  const [orders, setOrders] = useState<StaffOrder[]>(initialOrders);
  const [connection, setConnection] = useState<"live" | "reconnecting">("live");
  // Time-dependent labels are rendered after mount so server and client agree.
  const [mounted, setMounted] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, rerender] = useReducer((value: number) => value + 1, 0);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set(initialOrders.map((order) => order.id)));

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/staff/orders", { cache: "no-store" });
      if (response.status === 401) {
        window.location.href = "/staff/login";
        return;
      }
      if (!response.ok) throw new Error("queue unavailable");
      const payload = (await response.json()) as { orders: StaffOrder[] };

      const fresh = payload.orders.filter((order) => !knownIds.current.has(order.id));
      if (fresh.length > 0) {
        setNewIds((current) => {
          const next = new Set(current);
          fresh.forEach((order) => next.add(order.id));
          return next;
        });
        window.setTimeout(() => {
          setNewIds((current) => {
            const next = new Set(current);
            fresh.forEach((order) => next.delete(order.id));
            return next;
          });
        }, 8000);
      }

      knownIds.current = new Set(payload.orders.map((order) => order.id));
      setOrders(payload.orders);
      setLastUpdated(new Date());
      setConnection("live");
    } catch {
      setConnection("reconnecting");
    }
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const source = new EventSource("/api/staff/stream");
    source.addEventListener("ready", () => setConnection("live"));
    source.addEventListener("orders", () => void refresh());
    source.onerror = () => setConnection("reconnecting");
    source.onopen = () => setConnection("live");

    const fallback = window.setInterval(() => void refresh(), 12_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Re-render every 30s so "x min ago" and urgency stay accurate.
    const ageTimer = window.setInterval(() => rerender(), 30_000);

    return () => {
      source.close();
      window.clearInterval(fallback);
      window.clearInterval(ageTimer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  const pendingCount = orders.filter((order) => order.status === "pending").length;
  const matchesWaiting = orders.filter((order) => order.status === "preparing").length;

  return (
    <>
      <div className="queue-status">
        <span className={`conn ${connection === "live" ? "" : "conn-offline"}`}>
          <span className={`conn-dot ${connection === "live" ? "conn-live" : ""}`} />
          {connection === "live" ? "Live updates" : "Reconnecting — retrying"}
        </span>
        <span className="tiny muted">
          {orders.length} active
          {lastUpdated && mounted ? ` · updated ${formatTime(lastUpdated.toISOString())}` : null}
        </span>
        {pendingCount > 0 ? (
          <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn-line)" }}>
            {pendingCount} awaiting acceptance
          </span>
        ) : null}
        {matchesWaiting > 0 ? <span className="chip">{matchesWaiting} in the kitchen</span> : null}
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => void refresh()}
          style={{ marginLeft: "auto" }}
        >
          Refresh
        </button>
      </div>

      <p className="queue-hint tiny muted">Swipe sideways to see the later stages.</p>

      <div className="queue">
        {QUEUE_STATUSES.map((status) => {
          const columnOrders = orders
            .filter((order) => order.status === status)
            .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

          return (
            <section key={status} className="queue-col" aria-label={`${STATUS_LABELS[status]} orders`}>
              <div className="queue-col-head">
                <span>{STATUS_LABELS[status]}</span>
                <span className="queue-count">{columnOrders.length}</span>
              </div>

              {columnOrders.length === 0 ? (
                <p className="queue-empty">No orders</p>
              ) : null}

              {columnOrders.map((order) => {
                const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
                const urgent =
                  mounted &&
                  status !== "ready" &&
                  ageMinutes(order.created_at) >= URGENT_AFTER_MINUTES;
                const ageLabel = mounted ? formatAge(order.created_at) : "just now";
                const noteItems = order.items.filter((item) => item.notes);

                return (
                  <Link
                    key={order.id}
                    href={`/staff/orders/${order.id}`}
                    className={`order-card ${newIds.has(order.id) ? "is-new" : ""} ${
                      urgent ? "is-urgent" : ""
                    }`}
                    aria-label={`Order ${order.order_number} for table ${order.table_number}, ${ageLabel} old`}
                  >
                    <div className="spread" style={{ gap: 8 }}>
                      <span className="table-big">{order.table_number}</span>
                      <span className="tiny muted mono">{order.order_number}</span>
                    </div>

                    <div className="order-meta">
                      <span className={urgent ? "age-warn" : ""}>{ageLabel} ago</span>
                      <span>
                        {itemCount} item{itemCount === 1 ? "" : "s"}
                      </span>
                    </div>

                    <div className="order-summary">
                      {order.items.slice(0, 3).map((item, index) => (
                        <span key={item.id}>
                          {index > 0 ? " · " : ""}
                          <strong style={{ fontWeight: 700 }}>{item.quantity}×</strong> {item.name}
                        </span>
                      ))}
                      {order.items.length > 3 ? ` +${order.items.length - 3} more` : ""}
                    </div>

                    {noteItems.length > 0 ? (
                      <div className="tiny" style={{ marginTop: 6, color: "var(--ink-2)" }}>
                        {noteItems.slice(0, 2).map((item) => (
                          <div key={item.id}>
                            <span aria-hidden="true">↳ </span>
                            {item.notes}
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {order.customer_note ? (
                      <span className="flag">Diner note</span>
                    ) : null}

                    {order.total_minor !== null ? (
                      <div className="order-total">{formatMoney(order.total_minor)}</div>
                    ) : null}
                  </Link>
                );
              })}
            </section>
          );
        })}
      </div>

      <p className="tiny muted" style={{ marginTop: 18 }}>
        Completed and cancelled orders stay in history with a full audit trail. Open an order to
        change its status; the server rejects transitions your role cannot make.
      </p>
    </>
  );
}
