import { Pool } from "pg";
import type { Queryable } from "./types";
import { dbDriver } from "./types";

export type AppRole = "anon" | "authenticated";

declare global {
  var __tableflowPool: Pool | undefined;
  var __tableflowPglite: Promise<Queryable & { close: () => Promise<void> }> | undefined;
}

function getPool(): Pool {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured");
  }
  if (!global.__tableflowPool) {
    global.__tableflowPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: Number(process.env.DATABASE_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    });
  }
  return global.__tableflowPool;
}

/**
 * Development driver: PGlite runs PostgreSQL in-process (WebAssembly). This
 * sandbox cannot host native PostgreSQL child processes, and its TCP socket
 * bridge corrupted multi-statement requests, so local development talks to the
 * engine directly. Production always uses node-postgres against Supabase.
 */
async function getPglite() {
  if (!global.__tableflowPglite) {
    global.__tableflowPglite = (async () => {
      const { PGlite } = await import("@electric-sql/pglite");
      const path = await import("node:path");
      const dataDir =
        process.env.PGLITE_DIR ??
        path.join(process.env.LOCALAPPDATA ?? process.cwd(), "TableFlow", "pglite");
      const db = new PGlite(dataDir);
      await db.waitReady;

      const client: Queryable & { close: () => Promise<void> } = {
        async query<T>(text: string, values?: unknown[]) {
          const result = await db.query(text, values);
          // PGlite reports affectedRows for SELECT too (as 0), so prefer the
          // actual row count when rows were returned.
          return {
            rows: result.rows as T[],
            rowCount: result.rows.length || (result.affectedRows ?? 0),
          };
        },
        close: () => db.close(),
      };
      return client;
    })();
  }
  return global.__tableflowPglite;
}

/**
 * PGlite is a single session. Serialising access keeps role/claim state from
 * leaking between requests and keeps transactions strictly ordered.
 */
let queue: Promise<unknown> = Promise.resolve();

function serialized<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work, work);
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/**
 * Run work inside a transaction as a specific Postgres role with JWT-style
 * claims, exactly as Supabase does for `anon` and `authenticated` requests.
 * RLS policies are therefore the single source of truth for tenant isolation.
 */
export function withRole<T>(
  role: AppRole,
  userId: string | null,
  work: (client: Queryable) => Promise<T>,
): Promise<T> {
  return serialized(async () => {
    const claims = JSON.stringify({ sub: userId ?? undefined, role });

    if (dbDriver() === "pglite") {
      const client = await getPglite();
      await client.query("begin");
      try {
        await client.query(`set local role ${role}`);
        await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
        const result = await work(client);
        await client.query("commit");
        return result;
      } catch (error) {
        await client.query("rollback").catch(() => undefined);
        throw error;
      }
    }

    const client = await getPool().connect();
    await client.query("begin");
    try {
      await client.query(`set local role ${role}`);
      await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  });
}

/** Connectivity probe for health checks. */
export function ping(): Promise<void> {
  return serialized(async () => {
    if (dbDriver() === "pglite") {
      const client = await getPglite();
      await client.query("select 1");
      return;
    }
    const client = await getPool().connect();
    try {
      await client.query("select 1");
    } finally {
      client.release();
    }
  });
}

/**
 * Privileged access for the development auth shim only. Never used for tenant
 * data: production authentication is handled by Supabase Auth.
 */
export function adminQuery<T extends Record<string, unknown>>(
  text: string,
  values: unknown[] = [],
): Promise<T[]> {
  return serialized(async () => {
    if (dbDriver() === "pglite") {
      const client = await getPglite();
      const result = await client.query<T>(text, values);
      return result.rows;
    }

    const client = await getPool().connect();
    try {
      const result = await client.query(text, values);
      return result.rows as T[];
    } finally {
      client.release();
    }
  });
}
