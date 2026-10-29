import Link from "next/link";
import { StaffHeader } from "@/components/staff/StaffHeader";
import { canAccessQueue, requireStaff } from "@/lib/auth/staff";
import { fetchStaffOrders } from "@/lib/orders/staff";
import { LiveQueue } from "./live-queue";

export const dynamic = "force-dynamic";

export default async function StaffQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const context = await requireStaff();
  const { denied } = await searchParams;

  // The role matrix gives the queue to owner/manager/wait staff/kitchen. Cashier
  // arrives with payments in Stage 5 and must not read orders or prices.
  if (!canAccessQueue(context.membership.role)) {
    return (
      <>
        <StaffHeader
          restaurantName={context.membership.restaurantName}
          role={context.membership.role}
          displayName={context.session.displayName}
        />
        <main id="main" className="staff-shell">
          <div className="container">
            <div className="card detail-card">
              <h1 style={{ marginBottom: 4 }}>No order queue for this role</h1>
              <p className="muted" style={{ marginTop: 0 }}>
                Your role does not include the order queue. Ask the owner for a role that does, or
                sign in with a different account.
              </p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const orders = await fetchStaffOrders(context.session.userId);

  return (
    <>
      <StaffHeader
        restaurantName={context.membership.restaurantName}
        role={context.membership.role}
        displayName={context.session.displayName}
      />
      <main id="main" className="staff-shell">
        <div className="container" style={{ maxWidth: 1440 }}>
          {denied === "1" ? (
            <div className="alert alert-warn" style={{ marginBottom: 14 }} role="alert">
              Your role does not have access to that page.
            </div>
          ) : null}

          <div className="staff-top">
            <div>
              <p className="eyebrow">Live service</p>
              <h1>Order queue</h1>
              <p className="page-sub">
                New orders appear automatically. The database is the source of truth, so refreshing
                never loses an order.
              </p>
            </div>
            <div className="page-actions">
              {["owner", "manager"].includes(context.membership.role) ? (
                <Link href="/admin" className="btn btn-secondary btn-sm">
                  Restaurant admin
                </Link>
              ) : null}
            </div>
          </div>

          <LiveQueue initialOrders={orders} />
        </div>
      </main>
    </>
  );
}
