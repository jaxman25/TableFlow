import Link from "next/link";
import { PageHead } from "@/components/shared/PageHead";
import { requireRole } from "@/lib/auth/staff";
import { fetchOverview } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export default async function AdminOverviewPage() {
  const context = await requireRole(["owner", "manager"]);
  const stats = await fetchOverview(context.session.userId, context.membership.restaurantId);

  const soldOut = stats.totalItems - stats.availableItems;
  const setup = [
    {
      done: stats.totalItems > 0,
      label: "Menu items added",
      href: "/admin/menu",
      cta: "Open menu",
    },
    {
      done: stats.tables > 0,
      label: "Dining tables with QR codes",
      href: "/admin/tables",
      cta: "Open tables",
    },
    {
      done: stats.ordersToday > 0,
      label: "First order placed",
      href: "/staff",
      cta: "Open queue",
    },
  ];
  const remaining = setup.filter((step) => !step.done).length;

  return (
    <>
      <PageHead
        eyebrow="Service overview"
        title={context.membership.restaurantName}
        description="Live counts for the current service. Orders update as staff move them through the kitchen."
        actions={
          <>
            <Link href="/staff" className="btn btn-secondary btn-sm">
              Open order queue
            </Link>
            <Link href="/admin/menu" className="btn btn-primary btn-sm">
              Manage menu
            </Link>
          </>
        }
      />

      <div className="snapshot" role="group" aria-label="Service snapshot">
        <div className="snapshot-item">
          <span className="num">{stats.activeOrders}</span>
          <span className="lbl">Active orders</span>
        </div>
        <div className={`snapshot-item ${stats.pendingOrders > 0 ? "is-attention" : ""}`}>
          <span className="num">{stats.pendingOrders}</span>
          <span className="lbl">Awaiting acceptance</span>
        </div>
        <div className="snapshot-item">
          <span className="num">{stats.ordersToday}</span>
          <span className="lbl">Orders today</span>
        </div>
        <div className={`snapshot-item ${soldOut > 0 ? "is-attention" : ""}`}>
          <span className="num">
            {stats.availableItems}
            <span className="muted" style={{ fontSize: "var(--text-md)", fontWeight: 600 }}>
              /{stats.totalItems}
            </span>
          </span>
          <span className="lbl">Items available</span>
        </div>
        <div className="snapshot-item">
          <span className="num">{stats.tables}</span>
          <span className="lbl">Dining tables</span>
        </div>
      </div>

      <div className="quick-links" style={{ marginBottom: 20 }}>
        <Link href="/staff" className="quick-link">
          <strong>Order queue</strong>
          <span>
            {stats.pendingOrders > 0
              ? `${stats.pendingOrders} order${stats.pendingOrders === 1 ? "" : "s"} waiting for a decision`
              : "Everything visible has been accepted"}
          </span>
        </Link>
        <Link href="/admin/menu" className="quick-link">
          <strong>Menu &amp; availability</strong>
          <span>
            {soldOut > 0
              ? `${soldOut} item${soldOut === 1 ? "" : "s"} marked sold out`
              : "Every item is currently orderable"}
          </span>
        </Link>
        <Link href="/admin/tables" className="quick-link">
          <strong>Tables &amp; QR codes</strong>
          <span>{stats.tables} table{stats.tables === 1 ? "" : "s"} set up for ordering</span>
        </Link>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h2>Setup checklist</h2>
          <span className="chip">{remaining === 0 ? "Complete" : `${remaining} remaining`}</span>
        </div>
        <div className="panel-body panel-body-flush">
          <ul className="checklist" style={{ padding: "4px 16px" }}>
            {setup.map((step) => (
              <li key={step.label} className={step.done ? "is-done" : ""}>
                <span className="mark" aria-hidden="true">
                  {step.done ? "✓" : ""}
                </span>
                <span className="label">
                  {step.label}
                  <span className="visually-hidden">{step.done ? " — done" : " — not done"}</span>
                </span>
                <Link href={step.href} className="small">
                  {step.done ? "Review" : step.cta}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="panel-foot">
          <p className="tiny muted" style={{ margin: 0 }}>
            Staff invites are managed under Staff. Payments are not enabled in this milestone;
            staff-assisted payment recording arrives in the billing stage.
          </p>
        </div>
      </div>
    </>
  );
}
