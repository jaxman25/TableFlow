import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { seedFixtures } from "./fixtures";

export type TestClient = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number }>;
};

let database: Promise<PGlite> | null = null;

async function createDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.waitReady;

  await db.exec(readFileSync(resolve(process.cwd(), "scripts/dev-db/bootstrap.sql"), "utf8"));

  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const files = readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();
  for (const file of files) {
    await db.exec(readFileSync(resolve(migrationsDir, file), "utf8"));
  }

  await seedFixtures(db);
  return db;
}

export function getTestDb(): Promise<PGlite> {
  if (!database) database = createDatabase();
  return database;
}

function clientFor(db: PGlite): TestClient {
  return {
    async query<T>(text: string, values?: unknown[]) {
      const result = await db.query(text, values);
      return {
        rows: result.rows as T[],
        rowCount: result.rows.length || (result.affectedRows ?? 0),
      };
    },
  };
}

/**
 * Runs work inside a transaction with Supabase-style role and JWT claims, which
 * is exactly how RLS is evaluated in production.
 */
export async function asRole<T>(
  role: "anon" | "authenticated",
  userId: string | null,
  work: (client: TestClient) => Promise<T>,
): Promise<T> {
  const db = await getTestDb();
  const client = clientFor(db);
  await db.exec("begin");
  try {
    await db.query(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ sub: userId ?? undefined, role }),
    ]);
    const result = await work(client);
    await db.exec("commit");
    return result;
  } catch (error) {
    await db.exec("rollback").catch(() => undefined);
    throw error;
  }
}

/** Direct, privileged access for fixture setup and assertions. */
export async function adminClient(): Promise<TestClient> {
  const db = await getTestDb();
  return clientFor(db);
}
