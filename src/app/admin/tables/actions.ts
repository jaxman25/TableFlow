"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import QRCode from "qrcode";
import { z } from "zod";
import { writeAudit } from "@/lib/admin/audit";
import { requireRole } from "@/lib/auth/staff";
import { toAppError } from "@/lib/db/errors";
import { withRole } from "@/lib/db/pool";

export type TableActionResult = {
  ok: boolean;
  error?: string;
  dataUrl?: string;
  url?: string;
  tableNumber?: string;
};

function newToken(): string {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tableUrl(token: string): string {
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}/t/${token}`;
}

async function qr(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 360,
    margin: 1,
    color: { dark: "#17211D", light: "#FFFFFF" },
  });
}

const tableSchema = z.object({
  tableNumber: z.string().trim().min(1, "Enter a table number or name.").max(40),
});

export async function createTable(
  _previous: TableActionResult,
  formData: FormData,
): Promise<TableActionResult> {
  const context = await requireRole(["owner", "manager"]);
  const parsed = tableSchema.safeParse({ tableNumber: formData.get("tableNumber") });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the table details." };
  }

  const token = newToken();
  try {
    await withRole("authenticated", context.session.userId, async (client) => {
      const inserted = await client.query<{ id: string }>(
        `insert into public.dining_tables (restaurant_id, table_number, qr_token_hash)
         values ($1, $2, $3)
         returning id`,
        [context.membership.restaurantId, parsed.data.tableNumber, hashToken(token)],
      );
      await writeAudit(client, {
        restaurantId: context.membership.restaurantId,
        actorId: context.session.userId,
        action: "table.created",
        entityType: "dining_table",
        entityId: inserted.rows[0].id,
        metadata: { table_number: parsed.data.tableNumber },
      });
    });
  } catch (error) {
    const pgCode = (error as { code?: string }).code;
    return {
      ok: false,
      error:
        pgCode === "23505"
          ? "A table with that number already exists."
          : toAppError(error).message,
    };
  }

  const url = tableUrl(token);
  revalidatePath("/admin/tables");
  return {
    ok: true,
    dataUrl: await qr(url),
    url,
    tableNumber: parsed.data.tableNumber,
  };
}

export async function regenerateTableQr(tableId: string): Promise<TableActionResult> {
  const context = await requireRole(["owner", "manager"]);
  if (!tableId) return { ok: false, error: "Missing table." };

  const token = newToken();
  try {
    const updated = await withRole("authenticated", context.session.userId, async (client) => {
      const result = await client.query<{ id: string; table_number: string }>(
        `update public.dining_tables
            set qr_token_hash = $1, qr_token_rotated_at = now()
          where id = $2 and restaurant_id = $3
          returning id, table_number`,
        [hashToken(token), tableId, context.membership.restaurantId],
      );
      if (result.rowCount && result.rowCount > 0) {
        await writeAudit(client, {
          restaurantId: context.membership.restaurantId,
          actorId: context.session.userId,
          action: "table.qr_regenerated",
          entityType: "dining_table",
          entityId: result.rows[0].id,
          metadata: { table_number: result.rows[0].table_number },
        });
      }
      return result.rows[0];
    });

    if (!updated) return { ok: false, error: "Table not found." };

    const url = tableUrl(token);
    revalidatePath("/admin/tables");
    return {
      ok: true,
      dataUrl: await qr(url),
      url,
      tableNumber: updated.table_number,
    };
  } catch (error) {
    return { ok: false, error: toAppError(error).message };
  }
}

export async function setTableStatus(formData: FormData): Promise<void> {
  const context = await requireRole(["owner", "manager"]);
  const id = String(formData.get("id") ?? "");
  const status = formData.get("status") === "active" ? "active" : "disabled";
  if (!id) return;

  await withRole("authenticated", context.session.userId, async (client) => {
    const updated = await client.query<{ id: string }>(
      `update public.dining_tables set status = $1
        where id = $2 and restaurant_id = $3
        returning id`,
      [status, id, context.membership.restaurantId],
    );
    if (updated.rowCount === 0) return;
    await writeAudit(client, {
      restaurantId: context.membership.restaurantId,
      actorId: context.session.userId,
      action: "table.status_changed",
      entityType: "dining_table",
      entityId: id,
      metadata: { status },
    });
  });
  revalidatePath("/admin/tables");
}
