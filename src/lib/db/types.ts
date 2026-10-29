/** Minimal query surface shared by node-postgres and the in-process PGlite driver. */
export type Queryable = {
  query<T = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[]; rowCount: number | null }>;
};

export type DbDriver = "pg" | "pglite";

export function dbDriver(): DbDriver {
  return process.env.DB_DRIVER === "pglite" ? "pglite" : "pg";
}
