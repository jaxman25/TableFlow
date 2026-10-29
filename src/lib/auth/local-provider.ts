import { adminQuery } from "@/lib/db/pool";
import { AppError } from "@/lib/db/errors";
import { verifyPassword } from "./password";

type AuthUserRow = {
  id: string;
  email: string;
  encrypted_password: string | null;
  display_name: string | null;
};

/**
 * Development-only authentication.
 *
 * The owner approved a local Postgres/auth shim for development on 2026-10-21.
 * `AUTH_PROVIDER=local` reads the credentials created by the seed script. In
 * production this module is replaced by Supabase Auth (`@supabase/ssr`); the
 * rest of the app only depends on `Session`, so the swap is contained here.
 */
export async function authenticateWithPassword(
  email: string,
  password: string,
): Promise<{ userId: string; email: string; displayName: string | null }> {
  if ((process.env.AUTH_PROVIDER ?? "local") !== "local") {
    throw new AppError(
      "auth_not_configured",
      "Supabase Auth is not wired up in this build. Set AUTH_PROVIDER=local for development.",
      501,
    );
  }

  const rows = await adminQuery<AuthUserRow>(
    `select u.id, u.email, u.encrypted_password, p.display_name
       from auth.users u
       left join public.profiles p on p.id = u.id
      where lower(u.email) = lower($1)
      limit 1`,
    [email.trim()],
  );

  const user = rows[0];
  const valid = user ? await verifyPassword(password, user.encrypted_password) : false;

  // Same generic error for unknown user and wrong password.
  if (!user || !valid) {
    throw new AppError("invalid_credentials", "Email or password is incorrect.", 401);
  }

  return { userId: user.id, email: user.email, displayName: user.display_name };
}
