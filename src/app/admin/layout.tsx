import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/admin/SignOutButton";
import { Brand } from "@/components/shared/Brand";
import { ROLE_LABELS } from "@/lib/roles";
import { requireRole } from "@/lib/auth/staff";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const context = await requireRole(["owner", "manager"]);

  return (
    <div className="admin-shell">
      <aside className="admin-side">
        <div>
          <Brand href="/admin" />
          <p className="admin-context">
            <strong>{context.membership.restaurantName}</strong>
            <br />
            {ROLE_LABELS[context.membership.role] ?? context.membership.role}
          </p>
        </div>

        <AdminNav />

        <div className="admin-foot" style={{ marginTop: "auto", display: "grid", gap: 8 }}>
          <span className="tiny" style={{ color: "#8ba398" }}>
            {context.session.email}
          </span>
          <SignOutButton />
        </div>
      </aside>
      <main id="main" className="admin-main">
        {children}
      </main>
    </div>
  );
}
