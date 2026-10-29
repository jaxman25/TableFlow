/**
 * Postgres function errors carry stable message keys. Map them to safe,
 * user-facing text without leaking internals.
 */
export class AppError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const MESSAGES: Record<string, string> = {
  invalid_table_token: "This table link is not valid. Please ask a staff member for help.",
  table_unavailable: "This table is not available right now. Please ask a staff member for help.",
  restaurant_unavailable: "This restaurant is not accepting orders right now.",
  invalid_items: "Some items in your cart are not valid. Please review your order.",
  invalid_menu_item: "An item in your cart is no longer on the menu. Please refresh the menu.",
  invalid_idempotency_key: "We could not verify this order attempt. Please reload and try again.",
  invalid_source: "This ordering channel is not supported.",
  invalid_note: "Your note is too long.",
  invalid_transition: "That status change is not allowed.",
  reason_required: "Please give a reason for cancelling this order.",
  order_conflict: "This order is already being processed. Please check your order status.",
  forbidden: "You do not have permission to do that.",
  unauthenticated: "Please sign in again.",
  order_not_found: "That order could not be found.",
  invalid_order_token: "This order link is not valid.",
  invalid_credentials: "Email or password is incorrect.",
  last_owner_required: "A restaurant must keep at least one active owner.",
  auth_not_configured: "Authentication is not configured for this environment.",
};

/** Build a typed error from a database result code. */
export function errorForCode(code: string, detail?: string | null): AppError {
  if (code === "item_unavailable") {
    return new AppError(
      code,
      `${detail ?? "That item"} is sold out right now. Remove it from your cart to continue.`,
      409,
    );
  }
  const message = MESSAGES[code] ?? "Something went wrong. Please try again.";
  const status = code === "forbidden" || code === "unauthenticated"
    ? 403
    : code === "order_not_found"
      ? 404
      : 400;
  return new AppError(code, message, status);
}

export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("item_unavailable:")) {
    const item = message.slice("item_unavailable:".length).trim();
    return new AppError(
      "item_unavailable",
      `${item} is sold out right now. Remove it from your cart to continue.`,
      409,
    );
  }

  const key = message.trim().split("\n")[0];
  if (MESSAGES[key]) return errorForCode(key);

  return new AppError("internal_error", "Something went wrong. Please try again.", 500);
}

export function jsonError(error: unknown): Response {
  const appError = toAppError(error);
  return Response.json({ error: appError.message, code: appError.code }, { status: appError.status });
}
