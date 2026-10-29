import Link from "next/link";
import { Brand } from "@/components/shared/Brand";
import { toAppError } from "@/lib/db/errors";
import { fetchPublicOrder } from "@/lib/orders/public";
import { OrderStatusLive } from "./order-status-live";

export const dynamic = "force-dynamic";

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ placed?: string }>;
}) {
  const { token } = await params;
  const { placed } = await searchParams;

  try {
    const order = await fetchPublicOrder(token);
    return <OrderStatusLive token={token} initialOrder={order} justPlaced={placed === "1"} />;
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
            <p className="eyebrow">Order status</p>
            <h1>Order not found</h1>
            <p className="muted">{appError.message}</p>
            <p className="tiny muted">
              Links to an order work for as long as the restaurant keeps the order on record. Ask a
              staff member if you need the bill checked.
            </p>
            <Link href="/" className="btn btn-secondary btn-sm">
              Back to start
            </Link>
          </div>
        </main>
      </>
    );
  }
}
