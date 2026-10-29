import type { Queryable } from "@/lib/db/types";

/**
 * Append an audit entry for a privileged change through `public.write_audit`,
 * which stamps the actor from the request claims. Metadata must never contain
 * secrets, QR tokens, or customer personal data.
 */
export async function writeAudit(
  client: Queryable,
  entry: {
    restaurantId: string;
    actorId: string;
    action: string;
    entityType: string;
    entityId: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await client.query("select public.write_audit($1, $2, $3, $4, $5::jsonb)", [
    entry.restaurantId,
    entry.action,
    entry.entityType,
    entry.entityId,
    JSON.stringify(entry.metadata ?? {}),
  ]);
}
