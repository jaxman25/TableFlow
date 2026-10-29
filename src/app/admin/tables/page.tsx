import { PageHead } from "@/components/shared/PageHead";
import { EmptyState } from "@/components/shared/EmptyState";
import { requireRole } from "@/lib/auth/staff";
import { listTables } from "@/lib/admin/data";
import { setTableStatus } from "./actions";
import { CreateTableForm, RegenerateQrButton } from "./forms";

export const dynamic = "force-dynamic";

export default async function AdminTablesPage() {
  const context = await requireRole(["owner", "manager"]);
  const tables = await listTables(context.session.userId, context.membership.restaurantId);
  const active = tables.filter((table) => table.status === "active").length;

  return (
    <>
      <PageHead
        eyebrow="Restaurant"
        title="Tables & QR codes"
        description="Every active table has an opaque token. Codes cannot be guessed from the table number, and only a hash is stored."
      />

      <div className="row" style={{ gap: 6, marginBottom: 18 }}>
        <span className="chip">{tables.length} tables</span>
        <span className="chip" style={{ color: "var(--success)", borderColor: "var(--success-line)" }}>
          {active} accepting orders
        </span>
        {tables.length - active > 0 ? (
          <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn-line)" }}>
            {tables.length - active} disabled
          </span>
        ) : null}
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h2>Add a table</h2>
          <span className="tiny muted">The QR code is shown once, right after creation.</span>
        </div>
        <div className="panel-body">
          <CreateTableForm />
        </div>
      </section>

      {tables.length === 0 ? (
        <EmptyState title="No tables yet">
          Create the first table above, print its QR code, and place it on the table. Diners who
          scan it order against that table number.
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Table</th>
                  <th>Status</th>
                  <th className="num">Active orders</th>
                  <th>QR rotated</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tables.map((table) => (
                  <tr key={table.id}>
                    <td>
                      <strong>{table.table_number}</strong>
                    </td>
                    <td>
                      <span
                        className={`badge ${
                          table.status === "active" ? "badge-ready" : "badge-cancelled"
                        }`}
                      >
                        {table.status === "active" ? "Active" : "Disabled"}
                      </span>
                    </td>
                    <td className="num">{table.active_orders}</td>
                    <td className="tiny muted">
                      {table.qr_token_rotated_at
                        ? new Date(table.qr_token_rotated_at).toLocaleString("en-KE")
                        : "Original code"}
                    </td>
                    <td>
                      <div className="cell-actions">
                        <RegenerateQrButton tableId={table.id} tableNumber={table.table_number} />
                        <form action={setTableStatus}>
                          <input type="hidden" name="id" value={table.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={table.status === "active" ? "disabled" : "active"}
                          />
                          <button
                            type="submit"
                            className={`btn btn-sm ${
                              table.status === "active" ? "btn-danger-soft" : "btn-secondary"
                            }`}
                          >
                            {table.status === "active" ? "Disable" : "Enable"}
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="alert alert-info small" style={{ marginTop: 16 }}>
            <strong>Tablet ordering:</strong> open a table&apos;s link with{" "}
            <span className="mono">?source=tablet</span> on the tablet. The cart is stored per table
            and cleared when an order is placed. Disabling a table blocks new orders without
            deleting its history.
          </div>
        </>
      )}
    </>
  );
}
