import { cookies } from "next/headers";
import { z } from "zod";
import { authenticateWithPassword } from "@/lib/auth/local-provider";
import {
  SESSION_COOKIE,
  createSessionToken,
  sessionCookieOptions,
  sessionTtlMs,
} from "@/lib/auth/session";
import { jsonError, toAppError } from "@/lib/db/errors";

const schema = z.object({
  email: z.string().trim().min(3).max(200),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Enter your email and password." }, { status: 400 });
    }

    const user = await authenticateWithPassword(parsed.data.email, parsed.data.password);
    const expiresAt = Date.now() + sessionTtlMs();

    const store = await cookies();
    store.set(
      SESSION_COOKIE,
      createSessionToken({
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        expiresAt,
      }),
      sessionCookieOptions(expiresAt),
    );

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(toAppError(error));
  }
}
