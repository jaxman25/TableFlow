import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { MIGRATIONS_DIR, migrationFiles, openDatabase } from "./pglite.mjs";

/**
 * Applies pending files from supabase/migrations in filename order.
 * Pass an open database to reuse it; otherwise a connection is opened and closed.
 */
export async function migrate({ db, reset = false, quiet = false } = {}) {
  const database = db ?? (await openDatabase());
  const ownsConnection = !db;

  try {
    if (reset) {
      if (!quiet) console.log("[migrate] resetting public schema");
      await database.exec("drop schema if exists public cascade");
      await database.exec("create schema public");
      await database.exec("grant usage on schema public to anon, authenticated, service_role");
    }

    await database.exec(`
      create table if not exists public.schema_migrations (
        filename text primary key,
        applied_at timestamptz not null default now()
      )
    `);

    const applied = new Set(
      (await database.query("select filename from public.schema_migrations")).rows.map(
        (row) => row.filename,
      ),
    );

    const files = migrationFiles();
    let count = 0;

    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
      if (!quiet) console.log(`[migrate] applying ${file}`);
      await database.exec("begin");
      try {
        await database.exec(sql);
        await database.query("insert into public.schema_migrations (filename) values ($1)", [file]);
        await database.exec("commit");
        count += 1;
      } catch (error) {
        await database.exec("rollback").catch(() => undefined);
        throw new Error(`Migration ${file} failed: ${error.message}`);
      }
    }

    if (!quiet) {
      console.log(
        count === 0 ? "[migrate] already up to date" : `[migrate] applied ${count} migration(s)`,
      );
    }
    return { applied: count, files };
  } finally {
    if (ownsConnection) await database.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reset = process.argv.includes("--reset");
  migrate({ reset })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[migrate] ${error.message}`);
      process.exit(1);
    });
}
