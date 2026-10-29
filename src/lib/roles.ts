export const ROLES = ["owner", "manager", "wait_staff", "kitchen", "cashier"] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  wait_staff: "Wait staff",
  kitchen: "Kitchen",
  cashier: "Cashier",
};

export const ASSIGNABLE_ROLES = ["manager", "wait_staff", "kitchen", "cashier"] as const;
