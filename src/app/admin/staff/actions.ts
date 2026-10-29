"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/audit";
import { hashPassword } from "@/lib/auth/password";
import { requireRole } from "@/lib/auth/staff";
import { toAppError } from "@/lib/db/errors";
import { adminQuery, withRole } from "@/lib/db/pool";
import { ASSIGNABLE_ROLES } from "@/lib/roles";

export type StaffActionResult = {
  ok: boolean;
  error?: string;
  tempPassword?: string;
  email?: string;
};

const createSchema = z.object({
  email: z.string().trim().email("Enter a valid email address.").max(200),
  displayName: z.string().trim().max(120).optional().default(""),
  role: z.enum(ASSIGNABLE_ROLES),
});

export async function createStaffMember(
  _previous: StaffActionResult,
  formData: FormData,
): Promise<StaffActionResult> {
  const context = await requireRole(["owner", "manager"]);
  const parsed = createSchema.safeParse({
    email: formData.get("email"),
    displayName: formData.get("displayName") ?? "",
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the staff details." };
  }

  const email = parsed.data.email.toLowerCase();
  try {
    const existing = await adminQuery<{ id: string }>(
      "select id from auth.users where lower(email) = $1",
      [email],
    );
    if (existing.length > 0) {
      return { ok: false, error: "An account with that email already exists." };
    }

    const userId = randomUUID();
    const tempPassword = randomBytes(9).toString("base64url");
    const passwordHash = await hashPassword(tempPassword);

    // Development auth shim only. Production uses the Supabase Admin invite API.
    await adminQuery(
      `insert into auth.users (id, email, encrypted_password) values ($1, $2, $3)`,
      [userId, email, passwordHash],
    );
    await adminQuery(`update public.profiles set display_name = $1 where id = $2`, [
      parsed.data.displayName || email.split("@")[0],
      userId,
    ]);

    await withRole("authenticated", context.session.userId, async (client) => {
      await client.query(
        `insert into public.restaurant_members (restaurant_id, user_id, role, status)
         values ($1, $2, $3, 'active')`,
        [context.membership.restaurantId, userId, parsed.data.role],
      );

      await writeAudit(client, {
        restaurantId: context.membership.restaurantId,
        actorId: context.session.userId,
        action: "staff.created",
        entityType: "profile",
        entityId: userId,
        metadata: { role: parsed.data.role },
      });
    });

    revalidatePath("/admin/staff");
    return { ok: true, tempPassword, email };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function changeMemberRole(formData: FormData): Promise<void> {
  const context = await requireRole(["owner", "manager"]);
  const membershipId = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!membershipId || !ASSIGNABLE_ROLES.includes(role as (typeof ASSIGNABLE_ROLES)[number])) {
    return;
  }

  await withRole("authenticated", context.session.userId, async (client) => {
    const target = await client.query<{ role: string; user_id: string }>(
      "select role, user_id from public.restaurant_members where id = $1 and restaurant_id = $2",
      [membershipId, context.membership.restaurantId],
    );
    if (target.rowCount === 0) return;
    // Changing your own role can strip your last way back into the restaurant.
    if (target.rows[0].user_id === context.session.userId) return;
    if (target.rows[0].role === "owner" && context.membership.role !== "owner") return;

    await client.query(
      `update public.restaurant_members set role = $1
        where id = $2 and restaurant_id = $3`,
      [role, membershipId, context.membership.restaurantId],
    );
    await writeAudit(client, {
      restaurantId: context.membership.restaurantId,
      actorId: context.session.userId,
      action: "staff.role_changed",
      entityType: "restaurant_member",
      entityId: membershipId,
      metadata: { role },
    });
  });
  revalidatePath("/admin/staff");
}

export async function setMemberStatus(formData: FormData): Promise<void> {
  const context = await requireRole(["owner", "manager"]);
  const membershipId = String(formData.get("id") ?? "");
  const status = formData.get("status") === "active" ? "active" : "revoked";
  if (!membershipId) return;

  await withRole("authenticated", context.session.userId, async (client) => {
    const target = await client.query<{ role: string; user_id: string }>(
      "select role, user_id from public.restaurant_members where id = $1 and restaurant_id = $2",
      [membershipId, context.membership.restaurantId],
    );
    if (target.rowCount === 0) return;
    // Revoking yourself locks you out of the restaurant immediately.
    if (target.rows[0].user_id === context.session.userId) return;
    if (target.rows[0].role === "owner" && context.membership.role !== "owner") return;

    await client.query(
      `update public.restaurant_members set status = $1
        where id = $2 and restaurant_id = $3`,
      [status, membershipId, context.membership.restaurantId],
    );
    await writeAudit(client, {
      restaurantId: context.membership.restaurantId,
      actorId: context.session.userId,
      action: "staff.status_changed",
      entityType: "restaurant_member",
      entityId: membershipId,
      metadata: { status },
    });
  });
  revalidatePath("/admin/staff");
}
