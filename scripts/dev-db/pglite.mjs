import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";

export const DATA_DIR =
  process.env.PGLITE_DIR ?? join(process.env.LOCALAPPDATA ?? process.cwd(), "TableFlow", "pglite");

export const MIGRATIONS_DIR = resolve(process.cwd(), "supabase/migrations");

/** Opens the persistent development database and ensures the auth shim exists. */
export async function openDatabase() {
  const db = new PGlite(DATA_DIR);
  await db.waitReady;
  await db.exec(readFileSync(resolve(process.cwd(), "scripts/dev-db/bootstrap.sql"), "utf8"));
  return db;
}

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}
