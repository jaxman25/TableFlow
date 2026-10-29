import { STATUS_LABELS, type OrderStatus } from "@/lib/types";

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge badge-${status}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}
