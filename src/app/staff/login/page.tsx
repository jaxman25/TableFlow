import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Brand } from "@/components/shared/Brand";
import { getSession } from "@/lib/auth/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Staff sign in" };

export default async function StaffLoginPage() {
  const session = await getSession();
  if (session) redirect("/staff");

  const showDemoCredentials = process.env.NODE_ENV !== "production";

  return (
    <main id="main" className="login-shell">
      <div className="card login-card">
        <Brand href="/" />
        <h1 style={{ marginTop: 22 }}>Sign in to your restaurant</h1>
        <p className="muted small" style={{ marginBottom: 0 }}>
          Use the account your owner or manager created. Access is limited to your restaurant.
        </p>

        <LoginForm />

        {showDemoCredentials ? (
          <div className="login-foot">
            <strong>Development accounts</strong>
            <div
              className="mono"
              style={{ marginTop: 6, lineHeight: 1.8, fontSize: 11.5, color: "var(--ink-2)" }}
            >
              owner@tableflow.test
              <br />
              manager@tableflow.test
              <br />
              waiter@tableflow.test
              <br />
              kitchen@tableflow.test
            </div>
            <div style={{ marginTop: 8 }}>
              Password <span className="mono">tableflow123</span>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
