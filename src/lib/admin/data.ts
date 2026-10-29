import { adminQuery, withRole } from "@/lib/db/pool";

export type AdminCategory = {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  items: AdminMenuItem[];
};

export type AdminMenuItem = {
  id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_minor: number;
  is_available: boolean;
  sort_order: number;
};

export type AdminTable = {
  id: string;
  table_number: string;
  status: "active" | "disabled";
  qr_token_rotated_at: string | null;
  active_orders: number;
};

export type AdminMember = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  display_name: string | null;
  email: string | null;
};

export async function listCategoriesWithItems(
  userId: string,
  restaurantId: string,
): Promise<AdminCategory[]> {
  return withRole("authenticated", userId, async (client) => {
    const categories = await client.query<{
      id: string;
      name: string;
      sort_order: number;
      is_active: boolean;
    }>(
      `select id, name, sort_order, is_active
         from public.categories
        where restaurant_id = $1
        order by sort_order, name`,
      [restaurantId],
    );

    const items = await client.query<AdminMenuItem>(
      `select id, category_id, name, description, price_minor, is_available, sort_order
         from public.menu_items
        where restaurant_id = $1
        order by sort_order, name`,
      [restaurantId],
    );

    return categories.rows.map((category) => ({
      ...category,
      items: items.rows.filter((item) => item.category_id === category.id),
    }));
  });
}

export async function listTables(userId: string, restaurantId: string): Promise<AdminTable[]> {
  return withRole("authenticated", userId, async (client) => {
    const result = await client.query<AdminTable>(
      `select t.id, t.table_number, t.status, t.qr_token_rotated_at,
              (select count(*)::int
                 from public.staff_orders o
                where o.table_id = t.id
                  and o.status in ('pending', 'accepted', 'preparing', 'ready', 'served')) as active_orders
         from public.dining_tables t
        where t.restaurant_id = $1
        order by t.table_number`,
      [restaurantId],
    );
    return result.rows;
  });
}

/**
 * Staff lists need auth emails, which are not exposed to tenant roles.
 * Production uses the Supabase Admin API for this; the development shim reads
 * auth.users with a privileged connection after the caller's role has been
 * verified by the page. Always scoped to the caller's restaurant.
 */
export async function listMembers(
  userId: string,
  restaurantId: string,
): Promise<AdminMember[]> {
  const memberships = await withRole("authenticated", userId, async (client) => {
    const result = await client.query<Omit<AdminMember, "email">>(
      `select m.id, m.user_id, m.role, m.status, p.display_name
         from public.restaurant_members m
         left join public.profiles p on p.id = m.user_id
        where m.restaurant_id = $1
        order by m.created_at`,
      [restaurantId],
    );
    return result.rows;
  });

  if (memberships.length === 0) return [];

  const emails = await adminQuery<{ id: string; email: string }>(
    `select id, email from auth.users where id = any($1::uuid[])`,
    [memberships.map((member) => member.user_id)],
  );
  const byId = new Map(emails.map((row) => [row.id, row.email]));

  return memberships.map((member) => ({
    ...member,
    email: byId.get(member.user_id) ?? null,
  }));
}

export type OverviewStats = {
  activeOrders: number;
  pendingOrders: number;
  availableItems: number;
  totalItems: number;
  tables: number;
  ordersToday: number;
};

export async function fetchOverview(
  userId: string,
  restaurantId: string,
): Promise<OverviewStats> {
  return withRole("authenticated", userId, async (client) => {
    const result = await client.query<OverviewStats>(
      `select
         (select count(*)::int from public.staff_orders
           where restaurant_id = $1
             and status in ('pending','accepted','preparing','ready','served')) as "activeOrders",
         (select count(*)::int from public.staff_orders
           where restaurant_id = $1 and status = 'pending') as "pendingOrders",
         (select count(*)::int from public.menu_items
           where restaurant_id = $1 and is_available) as "availableItems",
         (select count(*)::int from public.menu_items where restaurant_id = $1) as "totalItems",
         (select count(*)::int from public.dining_tables where restaurant_id = $1) as "tables",
         (select count(*)::int from public.staff_orders
           where restaurant_id = $1
             and created_at >= date_trunc('day', now())) as "ordersToday"`,
      [restaurantId],
    );
    return result.rows[0];
  });
}
