import type { OrderStatus } from "@/lib/types";

export type Transition = {
  to: OrderStatus;
  label: string;
  roles: string[];
  tone: "primary" | "secondary" | "danger";
  needsReason?: boolean;
  confirm?: string;
};

/**
 * Mirrors the matrix in `public.update_order_status`. The database is the
 * authority; this copy only decides which buttons to render.
 */
export const TRANSITIONS: Record<OrderStatus, Transition[]> = {
  pending: [
    {
      to: "accepted",
      label: "Accept order",
      roles: ["owner", "manager", "wait_staff"],
      tone: "primary",
    },
    {
      to: "cancelled",
      label: "Reject order",
      roles: ["owner", "manager", "wait_staff"],
      tone: "danger",
      needsReason: true,
      confirm: "Reject this order? The diner will see it as cancelled.",
    },
  ],
  accepted: [
    {
      to: "preparing",
      label: "Start preparing",
      roles: ["owner", "manager", "wait_staff", "kitchen"],
      tone: "primary",
    },
    {
      to: "cancelled",
      label: "Cancel order",
      roles: ["owner", "manager"],
      tone: "danger",
      needsReason: true,
      confirm: "Cancel an accepted order?",
    },
  ],
  preparing: [
    {
      to: "ready",
      label: "Mark ready",
      roles: ["owner", "manager", "wait_staff", "kitchen"],
      tone: "primary",
    },
    {
      to: "cancelled",
      label: "Cancel order",
      roles: ["owner", "manager"],
      tone: "danger",
      needsReason: true,
      confirm: "Cancel an order that is already being prepared?",
    },
  ],
  ready: [
    {
      to: "served",
      label: "Mark served",
      roles: ["owner", "manager", "wait_staff"],
      tone: "primary",
    },
    {
      to: "cancelled",
      label: "Cancel order",
      roles: ["owner", "manager"],
      tone: "danger",
      needsReason: true,
      confirm: "Cancel an order that is ready?",
    },
  ],
  served: [
    {
      to: "completed",
      label: "Complete order",
      roles: ["owner", "manager", "wait_staff"],
      tone: "primary",
      confirm: "Close this order? Ask about payment first.",
    },
  ],
  completed: [],
  cancelled: [],
};

export function availableTransitions(status: OrderStatus, role: string): Transition[] {
  return (TRANSITIONS[status] ?? []).filter((transition) => transition.roles.includes(role));
}
