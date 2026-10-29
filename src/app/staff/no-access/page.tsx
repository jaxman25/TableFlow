import Link from "next/link";
import { Brand } from "@/components/shared/Brand";

export default function NoAccessPage() {
  return (
    <main id="main" className="login-shell">
      <div className="card login-card">
        <Brand href="/" />
        <h1 style={{ marginTop: 22 }}>No restaurant access</h1>
        <p className="muted" style={{ marginBottom: 0 }}>
          You are signed in, but this account is not linked to an active restaurant team. Ask the
          owner or manager to invite you with the right role, then sign in again.
        </p>
        <div className="row" style={{ marginTop: 22 }}>
          <Link href="/staff/login" className="btn btn-secondary">
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
