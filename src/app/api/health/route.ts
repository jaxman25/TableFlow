import { ping } from "@/lib/db/pool";

export async function GET() {
  try {
    await ping();
    return Response.json({ ok: true, database: "up" });
  } catch {
    return Response.json({ ok: false, database: "down" }, { status: 503 });
  }
}
