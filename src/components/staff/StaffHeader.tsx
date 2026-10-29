"use client";

import { useRouter } from "next/navigation";
import { Brand } from "@/components/shared/Brand";
import { ROLE_LABELS } from "@/lib/roles";

export function StaffHeader({
  restaurantName,
  role,
  displayName,
}: {
  restaurantName: string;
  role: string;
  displayName: string | null;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/staff/login");
    router.refresh();
  }

  return (
    <header className="site-header">
      <div className="container">
        <div className="row" style={{ gap: 12 }}>
          <Brand href="/staff" />
          <span className="chip">{restaurantName}</span>
        </div>
        <div className="header-meta">
          <span>
            {displayName ? `${displayName} · ` : ""}
            <strong style={{ color: "var(--ink-2)" }}>{ROLE_LABELS[role] ?? role}</strong>
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={signOut}>
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}
