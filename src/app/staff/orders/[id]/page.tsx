import Link from "next/link";
import { redirect } from "next/navigation";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { canAccessQueue, requireStaff } from "@/lib/auth/staff";
import { toAppError } from "@/lib/db/errors";
import { formatAge, formatMoney, formatTime } from "@/lib/format";
import { fetchOrderTimeline, fetchStaffOrder } from "@/lib/orders/staff";
import { ORDER_STATUSES, STATUS_LABELS, type OrderStatus } from "@/lib/types";
import { OrderActions } from "./order-actions";

export const dynamic = "force-dynamic";

const OPEN_STATUSES: OrderStatus[] = ORDER_STATUSES.filter(
  (status) => status !== "completed" && status !== "cancelled",
);

export default async function StaffOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const context = await requireStaff();
  if (!canAccessQueue(context.membership.role)) redirect("/staff");
  const { id } = await params;

  let order;
  try {
    order = await fetchStaffOrder(context.session.userId, id);
  } catch (error) {
    const appError = toAppError(error);
    return (
      <>
        <StaffHeader
          restaurantName={context.membership.restaurantName}
          role={context.membership.role}
          displayName={context.session.displayName}
        />
        <main id="main" className="staff-shell">
          <div className="container">
            <div className="empty">
              {appError.message}{" "}
              <Link href="/staff" className="btn btn-secondary btn-sm">
                Back to queue
              </Link>
            </div>
          </div>
        </main>
      </>
    );
  }

  const timeline = await fetchOrderTimeline(context.session.userId, order.id);
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const isOpen = OPEN_STATUSES.includes(order.status);
  const age = formatAge(order.created_at);

  return (
    <>
      <StaffHeader
        restaurantName={context.membership.restaurantName}
        role={context.membership.role}
        displayName={context.session.displayName}
      />
      <main id="main" className="staff-shell">
        <div className="container" style={{ maxWidth: 1120 }}>
          <div className="spread" style={{ marginBottom: 14 }}>
            <Link href="/staff" className="btn btn-ghost btn-sm">
              ← Back to queue
            </Link>
            <div className="row" style={{ gap: 8 }}>
              {isOpen ? <span className="chip">{age} open</span> : null}
              <StatusBadge status={order.status} />
            </div>
          </div>

          <div className="page-head">
            <div>
              <p className="eyebrow">{order.source === "tablet" ? "Tablet order" : "QR order"}</p>
              <h1>
                Table {order.table_number} <span className="muted">·</span>{" "}
                <span className="mono">{order.order_number}</span>
              </h1>
              <p className="page-sub">
                {itemCount} item{itemCount === 1 ? "" : "s"} · placed {formatTime(order.created_at)}
                {order.accepted_at
                  ? ` · accepted ${formatTime(order.accepted_at)}`
                  : ""}
              </p>
            </div>
          </div>

          <div className="detail-grid">
            <div className="stack">
              <section className="panel">
                <div className="panel-head">
                  <h2>Items</h2>
                  <span className="tiny muted">
                    {order.subtotal_minor === null
                      ? "Prices are hidden for kitchen accounts"
                      : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="panel-body panel-body-flush">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th style={{ width: 56 }} className="num">
                          Qty
                        </th>
                        <th>Item</th>
                        {order.subtotal_minor !== null ? (
                          <th style={{ textAlign: "right" }}>Line</th>
                        ) : null}
                      </tr>
                    </thead>
                    <tbody>
                      {order.items.map((item) => (
                        <tr key={item.id}>
                          <td className="num" style={{ fontWeight: 700 }}>
                            {item.quantity}
                          </td>
                          <td>
                            <strong style={{ fontWeight: 600 }}>{item.name}</strong>
                            {item.notes ? (
                              <div className="tiny" style={{ color: "var(--warn)" }}>
                                Note: {item.notes}
                              </div>
                            ) : null}
                          </td>
                          {order.subtotal_minor !== null ? (
                            <td className="price" style={{ textAlign: "right" }}>
                              {formatMoney(item.line_total_minor)}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {order.subtotal_minor !== null ? (
                  <div className="panel-foot">
                    <div className="totals">
                      <div>
                        <span>Subtotal</span>
                        <span>{formatMoney(order.subtotal_minor)}</span>
                      </div>
                      <div>
                        <span>Charges</span>
                        <span>{formatMoney(order.charges_minor ?? 0)}</span>
                      </div>
                      <div className="grand">
                        <span>Total</span>
                        <span>{formatMoney(order.total_minor)}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </section>

              {order.customer_note ? (
                <div className="alert alert-warn" role="note">
                  <strong>Note from diner:</strong> {order.customer_note}
                </div>
              ) : null}

              <section className="panel">
                <div className="panel-head">
                  <h2>Activity</h2>
                  <span className="tiny muted">Who changed what, and when</span>
                </div>
                <div className="panel-body">
                  {timeline.length === 0 ? (
                    <p className="muted small" style={{ margin: 0 }}>
                      No status events recorded yet.
                    </p>
                  ) : (
                    <ul className="timeline">
                      {timeline.map((entry, index) => (
                        <li key={`${entry.to_status}-${entry.created_at}-${index}`}>
                          <span className="dot" aria-hidden="true" />
                          <span>
                            <strong>
                              {STATUS_LABELS[entry.to_status as OrderStatus] ?? entry.to_status}
                            </strong>
                            {entry.from_status
                              ? ` from ${
                                  STATUS_LABELS[entry.from_status as OrderStatus] ?? entry.from_status
                                }`
                              : ""}
                            {entry.actor_name ? ` · ${entry.actor_name}` : ""}
                            <span className="when">{formatTime(entry.created_at)}</span>
                            {entry.reason ? (
                              <span className="tiny muted" style={{ display: "block" }}>
                                Reason: {entry.reason}
                              </span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            <div className="stack" style={{ position: "sticky", top: 76 }}>
              <section className="panel">
                <div className="panel-head">
                  <h2>Actions</h2>
                </div>
                <div className="panel-body">
                  <OrderActions
                    orderId={order.id}
                    status={order.status}
                    role={context.membership.role}
                  />
                </div>
              </section>

              <section className="panel">
                <div className="panel-head">
                  <h2>Details</h2>
                </div>
                <div className="panel-body">
                  <dl className="kv">
                    <dt>Order</dt>
                    <dd className="mono">{order.order_number}</dd>
                    <dt>Table</dt>
                    <dd>{order.table_number}</dd>
                    <dt>Source</dt>
                    <dd>{order.source === "tablet" ? "Tablet" : "QR code"}</dd>
                    <dt>Placed</dt>
                    <dd>{formatTime(order.created_at)}</dd>
                    <dt>Accepted</dt>
                    <dd>{order.accepted_at ? formatTime(order.accepted_at) : "—"}</dd>
                    <dt>Ready</dt>
                    <dd>{order.ready_at ? formatTime(order.ready_at) : "—"}</dd>
                    <dt>Served</dt>
                    <dd>{order.served_at ? formatTime(order.served_at) : "—"}</dd>
                    <dt>Closed</dt>
                    <dd>
                      {order.completed_at
                        ? formatTime(order.completed_at)
                        : order.cancelled_at
                          ? `Cancelled ${formatTime(order.cancelled_at)}`
                          : "—"}
                    </dd>
                  </dl>
                </div>
              </section>

              <p className="tiny muted" style={{ margin: 0 }}>
                Only the approved sequence is accepted; the server rejects anything else. Payment is
                recorded in a later stage.
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
