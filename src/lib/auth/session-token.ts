import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "tf_session";

export type Session = {
  userId: string;
  email: string;
  displayName: string | null;
  expiresAt: number;
};

type TokenPayload = {
  sub: string;
  email: string;
  name: string | null;
  exp: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 16) {
    throw new Error("SESSION_SECRET must be set to at least 16 characters");
  }
  return value;
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(session: Session): string {
  const payload: TokenPayload = {
    sub: session.userId,
    email: session.email,
    name: session.displayName,
    exp: session.expiresAt,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${sign(body)}`;
}

export function readSessionToken(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const given = Buffer.from(signature);
  const wanted = Buffer.from(sign(body));
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!payload.sub || !payload.exp || payload.exp < Date.now()) return null;
    return {
      userId: payload.sub,
      email: payload.email,
      displayName: payload.name,
      expiresAt: payload.exp,
    };
  } catch {
    return null;
  }
}

export function sessionTtlMs(): number {
  const hours = Number(process.env.SESSION_TTL_HOURS ?? 8);
  return (Number.isFinite(hours) && hours > 0 ? hours : 8) * 60 * 60 * 1000;
}
