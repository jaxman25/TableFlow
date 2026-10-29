import Link from "next/link";
import { Brand } from "@/components/shared/Brand";
import { toAppError } from "@/lib/db/errors";
import { fetchTableContext } from "@/lib/orders/public";
import { MenuExperience } from "./menu-experience";

export const dynamic = "force-dynamic";

export default async function TablePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ source?: string }>;
}) {
  const { token } = await params;
  const { source } = await searchParams;
  const orderSource = source === "tablet" ? "tablet" : "qr";

  try {
    const context = await fetchTableContext(token);
    return (
      <MenuExperience token={token} context={context} source={orderSource} />
    );
  } catch (error) {
    const appError = toAppError(error);
    return (
      <>
        <header className="site-header">
          <div className="container">
            <Brand href="/" />
          </div>
        </header>
        <main id="main" className="container">
          <div className="card detail-card">
            <p className="eyebrow">Table link</p>
            <h1>We can&apos;t open this table</h1>
            <p className="muted">{appError.message}</p>
            <div className="alert alert-info" style={{ textAlign: "left", marginTop: 14 }}>
              Please show this screen to a member of staff. They can check the table and bring you
              a menu.
            </div>
            <Link href="/" className="btn btn-secondary btn-sm" style={{ marginTop: 16 }}>
              Back to start
            </Link>
          </div>
        </main>
      </>
    );
  }
}
