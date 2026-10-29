"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/audit";
import { requireRole } from "@/lib/auth/staff";
import { toAppError } from "@/lib/db/errors";
import { withRole } from "@/lib/db/pool";

export type ActionResult = { ok: boolean; error?: string };

const categorySchema = z.object({
  name: z.string().trim().min(1, "Enter a category name.").max(80),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});

const itemSchema = z.object({
  name: z.string().trim().min(1, "Enter an item name.").max(120),
  categoryId: z.string().uuid("Choose a category."),
  description: z.string().trim().max(1000).optional().default(""),
  priceShillings: z.coerce
    .number({ invalid_type_error: "Enter a price." })
    .min(0, "Price cannot be negative.")
    .max(1_000_000, "Price is too large."),
  isAvailable: z.coerce.boolean().optional().default(true),
});

function failure(error: unknown): ActionResult {
  return { ok: false, error: toAppError(error).message };
}

export async function createCategory(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireRole(["owner", "manager"]);
  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the category details." };
  }

  try {
    await withRole("authenticated", context.session.userId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into public.categories (restaurant_id, name, sort_order)
         values ($1, $2, $3)
         returning id`,
        [context.membership.restaurantId, parsed.data.name, parsed.data.sortOrder],
      );
      await writeAudit(client, {
        restaurantId: context.membership.restaurantId,
        actorId: context.session.userId,
        action: "menu.category_created",
        entityType: "category",
        entityId: inserted.rows[0].id,
        metadata: { name: parsed.data.name },
      });
    });
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function createMenuItem(
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const context = await requireRole(["owner", "manager"]);
  const parsed = itemSchema.safeParse({
    name: formData.get("name"),
    categoryId: formData.get("categoryId"),
    description: formData.get("description") ?? "",
    priceShillings: formData.get("priceShillings"),
    isAvailable: formData.get("isAvailable") === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the item details." };
  }

  try {
    await withRole("authenticated", context.session.userId, async (client) => {
      const priceMinor = Math.round(parsed.data.priceShillings * 100);
      const inserted = await client.query<{ id: string }>(
        `insert into public.menu_items (
           restaurant_id, category_id, name, description, price_minor, is_available
         ) values ($1, $2, $3, $4, $5, $6)
         returning id`,
        [
          context.membership.restaurantId,
          parsed.data.categoryId,
          parsed.data.name,
          parsed.data.description || null,
          priceMinor,
          parsed.data.isAvailable,
        ],
      );
      await writeAudit(client, {
        restaurantId: context.membership.restaurantId,
        actorId: context.session.userId,
        action: "menu.item_created",
        entityType: "menu_item",
        entityId: inserted.rows[0].id,
        metadata: { name: parsed.data.name, price_minor: priceMinor },
      });
    });
    revalidatePath("/admin/menu");
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}

export async function updateItemPrice(formData: FormData): Promise<void> {
  const context = await requireRole(["owner", "manager"]);
  const id = String(formData.get("id") ?? "");
  const price = Number(formData.get("priceShillings"));
  if (!id || !Number.isFinite(price) || price < 0 || price > 1_000_000) return;

  await withRole("authenticated", context.session.userId, async (client) => {
    const updated = await client.query<{ id: string; price_minor: string }>(
      `update public.menu_items
          set price_minor = $1
        where id = $2 and restaurant_id = $3
        returning id, price_minor`,
      [Math.round(price * 100), id, context.membership.restaurantId],
    );
    if (updated.rowCount === 0) return;
    await writeAudit(client, {
      restaurantId: context.membership.restaurantId,
      actorId: context.session.userId,
      action: "menu.price_changed",
      entityType: "menu_item",
      entityId: id,
      metadata: { price_minor: Number(updated.rows[0].price_minor) },
    });
  });
  revalidatePath("/admin/menu");
}

export async function toggleItemAvailability(formData: FormData): Promise<void> {
  const context = await requireRole(["owner", "manager"]);
  const id = String(formData.get("id") ?? "");
  const next = formData.get("next") === "true";
  if (!id) return;

  await withRole("authenticated", context.session.userId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `update public.menu_items
          set is_available = $1
        where id = $2 and restaurant_id = $3
        returning id`,
      [next, id, context.membership.restaurantId],
    );
    if (updated.rowCount === 0) return;
    await writeAudit(client, {
      restaurantId: context.membership.restaurantId,
      actorId: context.session.userId,
      action: "menu.availability_changed",
      entityType: "menu_item",
      entityId: id,
      metadata: { is_available: next },
    });
  });
  revalidatePath("/admin/menu");
  revalidatePath("/");
}
