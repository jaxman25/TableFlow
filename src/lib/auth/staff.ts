import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { withRole } from "@/lib/db/pool";
import {
  SESSION_COOKIE,
  readSessionToken,
  requireSession,
  type Session,
} from "./session";

export { ROLE_LABELS } from "@/lib/roles";

export type Membership = {
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  currency: string;
  role: string;
};

export type StaffContext = {
  session: Session;
  membership: Membership;
};

type MembershipRow = {
  restaurant_id: string;
  role: string;
  name: string;
  slug: string;
  currency: string;
};

export async function getMemberships(userId: string): Promise<Membership[]> {
  return withRole("authenticated", userId, async (client) => {
    const result = await client.query<MembershipRow>(
      `select m.restaurant_id, m.role, r.name, r.slug, r.currency
         from public.restaurant_members m
         join public.restaurants r on r.id = m.restaurant_id
        where m.user_id = $1
          and m.status = 'active'
        order by r.name`,
      [userId],
    );
    return result.rows.map((row) => ({
      restaurantId: row.restaurant_id,
      restaurantName: row.name,
      restaurantSlug: row.slug,
      currency: row.currency,
      role: row.role,
    }));
  });
}

/**
 * Milestone 1 targets a single pilot restaurant per user. If a user belongs to
 * several restaurants, a restaurant switcher is a later-stage decision.
 */
export async function getStaffContext(): Promise<StaffContext | null> {
  const session = await requireSession();
  const memberships = await getMemberships(session.userId);
  if (memberships.length === 0) return null;
  return { session, membership: memberships[0] };
}

export async function requireStaff(): Promise<StaffContext> {
  const context = await getStaffContext();
  if (!context) redirect("/staff/no-access");
  return context;
}

export async function requireRole(roles: string[]): Promise<StaffContext> {
  const context = await requireStaff();
  if (!roles.includes(context.membership.role)) redirect("/staff?denied=1");
  return context;
}

export async function getOptionalSession(): Promise<Session | null> {
  const store = await cookies();
  return readSessionToken(store.get(SESSION_COOKIE)?.value);
}

/** Roles that may read the order queue (README role matrix). */
export const QUEUE_ROLES = ["owner", "manager", "wait_staff", "kitchen"] as const;

export function canAccessQueue(role: string): boolean {
  return (QUEUE_ROLES as readonly string[]).includes(role);
}

/** Membership for API routes that need the queue role without a full page context. */
export async function getQueueMembership(userId: string): Promise<Membership | null> {
  const memberships = await getMemberships(userId);
  return memberships.find((membership) => canAccessQueue(membership.role)) ?? null;
}

export function canManage(role: string): boolean {
  return role === "owner" || role === "manager";
}

export function canSeePrices(role: string): boolean {
  return role !== "kitchen";
}
