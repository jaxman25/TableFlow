import Link from "next/link";
import { Brand } from "@/components/shared/Brand";

const STEPS = [
  {
    title: "Diners scan the table code",
    body: "The menu opens in the browser, already tied to the table. No app and no account.",
  },
  {
    title: "The order reaches the floor",
    body: "Wait staff see the table number, notes, and order age in one shared queue.",
  },
  {
    title: "Kitchen moves it forward",
    body: "Accept, prepare, ready — each step recorded with who did it and when.",
  },
];

export default function HomePage() {
  const demoToken = process.env.DEMO_TABLE_TOKEN;
  const showDemo = process.env.NODE_ENV !== "production" && Boolean(demoToken);

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Brand />
          <Link href="/staff/login" className="btn btn-secondary btn-sm">
            Staff sign in
          </Link>
        </div>
      </header>

      <main id="main" className="container" style={{ padding: "64px 24px 80px" }}>
        <div style={{ maxWidth: 620 }}>
          <p className="eyebrow">Restaurant ordering · pilot build</p>
          <h1 style={{ fontSize: "clamp(1.9rem, 4vw, 2.5rem)", margin: "10px 0 14px" }}>
            Orders from the table reach the kitchen without a detour.
          </h1>
          <p className="muted" style={{ fontSize: "var(--text-lg)", maxWidth: "52ch" }}>
            TableFlow gives casual-dining restaurants QR and tablet ordering, a shared staff queue,
            and a kitchen view that deliberately hides prices. This milestone covers the order
            flow only — no card or M-Pesa payments yet.
          </p>

          <div className="row" style={{ marginTop: 28 }}>
            <Link href="/staff/login" className="btn btn-primary">
              Staff dashboard
            </Link>
            <a href="#how-it-works" className="btn btn-secondary">
              How it works
            </a>
          </div>

          {showDemo ? (
            <p className="tiny muted" style={{ marginTop: 18 }}>
              Development demo: <Link href={`/t/${demoToken}`}>open the Table 4 menu</Link> or{" "}
              <Link href="/staff/login">sign in as staff</Link>.
            </p>
          ) : null}
        </div>

        <section id="how-it-works" style={{ marginTop: 72 }}>
          <p className="eyebrow">How it works</p>
          <div
            style={{
              display: "grid",
              gap: 0,
              marginTop: 14,
              borderTop: "1px solid var(--border)",
            }}
          >
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                style={{
                  display: "grid",
                  gridTemplateColumns: "40px minmax(0, 1fr) minmax(0, 1.1fr)",
                  gap: 20,
                  alignItems: "baseline",
                  padding: "18px 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span className="mono tiny muted">0{index + 1}</span>
                <strong style={{ fontSize: "var(--text-md)" }}>{step.title}</strong>
                <span className="muted small">{step.body}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel" style={{ marginTop: 40, maxWidth: 720 }}>
          <div className="panel-head">
            <h2>In this milestone</h2>
            <span className="chip">Pilot scope</span>
          </div>
          <div className="panel-body">
            <ul className="muted small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>QR and tablet ordering with server-calculated prices.</li>
              <li>Live staff queue with validated status updates.</li>
              <li>Restaurant isolation enforced by row-level security.</li>
              <li>No real-money payments; staff record payment in a later stage.</li>
            </ul>
          </div>
        </section>
      </main>
    </>
  );
}
