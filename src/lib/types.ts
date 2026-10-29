export type MenuItemView = {
  id: string;
  name: string;
  description: string | null;
  price_minor: number;
  is_available: boolean;
  image_url: string | null;
};

export type MenuCategoryView = {
  id: string;
  name: string;
  items: MenuItemView[];
};

export type TableContext = {
  restaurant: { name: string; currency: string; timezone: string };
  table: { number: string };
  categories: MenuCategoryView[];
};

export type PublicOrderItem = {
  name: string;
  quantity: number;
  unit_price_minor: number;
  line_total_minor: number;
  notes: string | null;
};

export type PublicOrder = {
  order_number: string;
  status: OrderStatus;
  currency: string;
  subtotal_minor: number;
  charges_minor: number;
  total_minor: number;
  customer_note: string | null;
  created_at: string;
  updated_at: string;
  table_number: string;
  restaurant_name: string;
  items: PublicOrderItem[];
  timeline: { status: OrderStatus; at: string }[];
};

export const ORDER_STATUSES = [
  "pending",
  "accepted",
  "preparing",
  "ready",
  "served",
  "completed",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type StaffOrder = {
  id: string;
  order_number: string;
  table_number: string;
  status: OrderStatus;
  source: string;
  customer_note: string | null;
  subtotal_minor: number | null;
  charges_minor: number | null;
  total_minor: number | null;
  created_at: string;
  updated_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  served_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    notes: string | null;
    unit_price_minor: number | null;
    line_total_minor: number | null;
  }[];
};

export type CartLine = {
  menuItemId: string;
  name: string;
  unitPriceMinor: number;
  quantity: number;
  notes: string;
};

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "New",
  accepted: "Accepted",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};
