import { PageHead } from "@/components/shared/PageHead";
import { requireRole } from "@/lib/auth/staff";
import { listMembers } from "@/lib/admin/data";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/roles";
import { changeMemberRole, setMemberStatus } from "./actions";
import { AddStaffForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function AdminStaffPage() {
  const context = await requireRole(["owner", "manager"]);
  const members = await listMembers(context.session.userId, context.membership.restaurantId);
  const actorIsOwner = context.membership.role === "owner";
  const activeCount = members.filter((member) => member.status === "active").length;

  return (
    <>
      <PageHead
        eyebrow="Restaurant"
        title="Staff"
        description="Roles decide what each person can see and do. Kitchen accounts never see prices, and nobody can change their own access."
      />

      <div className="row" style={{ gap: 6, marginBottom: 18 }}>
        <span className="chip">{members.length} accounts</span>
        <span className="chip" style={{ color: "var(--success)", borderColor: "var(--success-line)" }}>
          {activeCount} active
        </span>
        {members.length - activeCount > 0 ? (
          <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn-line)" }}>
            {members.length - activeCount} revoked
          </span>
        ) : null}
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h2>Add a staff account</h2>
          <span className="tiny muted">Uses the development auth shim</span>
        </div>
        <div className="panel-body">
          <AddStaffForm />
        </div>
      </section>

      <div className="table-wrap">
        <table className="data-table table-stack">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role</th>
              <th>Status</th>
              <th style={{ textAlign: "right" }}>Access</th>
            </tr>
          </thead>
          <tbody>
            {members.map((member) => {
              const isSelf = member.user_id === context.session.userId;
              const protectedOwner = member.role === "owner" && !actorIsOwner;
              // Nobody edits their own row: a self-demotion or self-revoke removes
              // the account's last way back into the restaurant.
              const readOnly = protectedOwner || isSelf;
              return (
                <tr key={member.id} className={readOnly ? "row-locked" : ""}>
                  <td className="cell-leading">
                    <strong>{member.display_name ?? "Unnamed"}</strong>
                    <div className="tiny muted">{member.email ?? "—"}</div>
                  </td>
                  <td data-label="Role">
                    {readOnly ? (
                      <span className="badge badge-served">{ROLE_LABELS[member.role]}</span>
                    ) : (
                      <form action={changeMemberRole} className="inline-form">
                        <input type="hidden" name="id" value={member.id} />
                        <select name="role" defaultValue={member.role} aria-label="Role">
                          {actorIsOwner ? (
                            <option value="owner">{ROLE_LABELS.owner}</option>
                          ) : null}
                          {ASSIGNABLE_ROLES.map((role) => (
                            <option key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Save
                        </button>
                      </form>
                    )}
                  </td>
                  <td data-label="Status">
                    <span
                      className={`badge ${
                        member.status === "active" ? "badge-ready" : "badge-cancelled"
                      }`}
                    >
                      {member.status === "active" ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td data-label="Access">
                    <div className="cell-actions">
                      {readOnly ? (
                        <span className="lock-note">
                          {isSelf ? "You — manage from another owner account" : "Owner"}
                        </span>
                      ) : (
                        <form action={setMemberStatus}>
                          <input type="hidden" name="id" value={member.id} />
                          <input
                            type="hidden"
                            name="status"
                            value={member.status === "active" ? "revoked" : "active"}
                          />
                          <button
                            type="submit"
                            className={`btn btn-sm ${
                              member.status === "active" ? "btn-danger-soft" : "btn-secondary"
                            }`}
                          >
                            {member.status === "active" ? "Revoke access" : "Restore access"}
                          </button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {members.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted small">
                  No staff accounts yet. Add the first one above.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="alert alert-info small" style={{ marginTop: 16 }}>
        Account creation uses the development auth shim. With Supabase Auth this becomes an email
        invitation and password setup flow.
      </div>
    </>
  );
}
