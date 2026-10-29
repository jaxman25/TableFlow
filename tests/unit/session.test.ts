import { beforeEach, describe, expect, it } from "vitest";
import { createSessionToken, readSessionToken } from "@/lib/auth/session-token";

const session = {
  userId: "20000000-0000-4000-8000-000000000001",
  email: "owner-a@test.local",
  displayName: "Owner A",
  expiresAt: Date.now() + 60_000,
};

describe("staff session tokens", () => {
  beforeEach(() => {
    process.env.SESSION_SECRET = "unit-test-secret-0123456789abcdef";
  });

  it("round-trips a signed session", () => {
    const token = createSessionToken(session);
    const decoded = readSessionToken(token);
    expect(decoded?.userId).toBe(session.userId);
    expect(decoded?.email).toBe(session.email);
    expect(decoded?.displayName).toBe(session.displayName);
  });

  it("rejects a tampered payload", () => {
    const token = createSessionToken(session);
    const [body, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ sub: "someone-else", email: "x@y.z", name: null, exp: Date.now() + 60_000 }),
    ).toString("base64url");
    expect(readSessionToken(`${forged}.${signature}`)).toBeNull();
    expect(body).not.toBe(forged);
  });

  it("rejects a token signed with another secret", () => {
    const token = createSessionToken(session);
    process.env.SESSION_SECRET = "a-different-secret-0123456789abcdef";
    expect(readSessionToken(token)).toBeNull();
  });

  it("rejects expired tokens and malformed input", () => {
    const expired = createSessionToken({ ...session, expiresAt: Date.now() - 1 });
    expect(readSessionToken(expired)).toBeNull();
    expect(readSessionToken("not-a-token")).toBeNull();
    expect(readSessionToken(undefined)).toBeNull();
  });
});
