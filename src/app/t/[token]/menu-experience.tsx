"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "@/components/shared/Brand";
import { Dialog } from "@/components/shared/Dialog";
import { EmptyState } from "@/components/shared/EmptyState";
import { formatMoney } from "@/lib/format";
import type { CartLine, MenuItemView, TableContext } from "@/lib/types";

type Props = {
  token: string;
  context: TableContext;
  source: "qr" | "tablet";
};

function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
}

export function MenuExperience({ token, context, source }: Props) {
  const router = useRouter();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const idempotencyKey = useRef<string | null>(null);

  const cartKey = `tf-cart:${token}`;
  const idempotencyStorageKey = `tf-idem:${token}`;
  const currency = context.restaurant.currency;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(cartKey);
      if (raw) {
        const parsed = JSON.parse(raw) as CartLine[];
        if (Array.isArray(parsed)) {
          setCart(
            parsed.filter(
              (line) =>
                typeof line.menuItemId === "string" &&
                typeof line.quantity === "number" &&
                line.quantity > 0,
            ),
          );
        }
      }
      idempotencyKey.current = window.localStorage.getItem(idempotencyStorageKey);
    } catch {
      // A corrupt cart should never block ordering.
    }
    setHydrated(true);
  }, [cartKey, idempotencyStorageKey]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(cartKey, JSON.stringify(cart));
    } catch {
      // Ignore storage failures (private mode, quota).
    }
  }, [cart, cartKey, hydrated]);

  const itemCount = useMemo(() => cart.reduce((sum, line) => sum + line.quantity, 0), [cart]);
  const totalMinor = cartTotal(cart);

  function addItem(item: MenuItemView) {
    if (!item.is_available) return;
    setError(null);
    setCart((current) => {
      const existing = current.find((line) => line.menuItemId === item.id);
      if (existing) {
        return current.map((line) =>
          line.menuItemId === item.id
            ? { ...line, quantity: Math.min(99, line.quantity + 1) }
            : line,
        );
      }
      return [
        ...current,
        {
          menuItemId: item.id,
          name: item.name,
          unitPriceMinor: item.price_minor,
          quantity: 1,
          notes: "",
        },
      ];
    });
  }

  function changeQuantity(menuItemId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) =>
          line.menuItemId === menuItemId
            ? { ...line, quantity: Math.min(99, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity > 0),
    );
  }

  function setLineNote(menuItemId: string, value: string) {
    setCart((current) =>
      current.map((line) => (line.menuItemId === menuItemId ? { ...line, notes: value } : line)),
    );
  }

  async function submit() {
    if (cart.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);

    if (!idempotencyKey.current) {
      idempotencyKey.current = crypto.randomUUID();
      try {
        window.localStorage.setItem(idempotencyStorageKey, idempotencyKey.current);
      } catch {
        // The in-memory key still protects against double clicks.
      }
    }

    try {
      const response = await fetch("/api/public/orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          tableToken: token,
          source,
          idempotencyKey: idempotencyKey.current,
          note: note.trim() || null,
          items: cart.map((line) => ({
            menuItemId: line.menuItemId,
            quantity: line.quantity,
            notes: line.notes.trim() || null,
          })),
        }),
      });

      const payload = (await response.json()) as { publicToken?: string; error?: string };

      if (!response.ok || !payload.publicToken) {
        setError(payload.error ?? "We could not place your order. Please try again.");
        return;
      }

      try {
        window.localStorage.removeItem(cartKey);
        window.localStorage.removeItem(idempotencyStorageKey);
        window.localStorage.removeItem("tf-tablet-table");
      } catch {
        // Ignore storage failures.
      }
      idempotencyKey.current = null;
      setCart([]);
      setOpen(false);
      router.push(`/order/${payload.publicToken}?placed=1`);
    } catch {
      setError(
        "Your order may not have reached the kitchen. Do not resubmit yet — check your order status first or ask a staff member.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <header className="site-header">
        <div className="container">
          <Brand href="/" />
          <span className="chip">{source === "tablet" ? "Tablet ordering" : "Table ordering"}</span>
        </div>
      </header>

      <main id="main" className="customer-shell">
        <div className="container" style={{ maxWidth: 780 }}>
          <div className="restaurant-head">
            <div style={{ display: "grid", gap: 2 }}>
              <div className="spread" style={{ gap: 8 }}>
                <p className="eyebrow" style={{ margin: 0 }}>
                  Menu · prices in {currency}
                </p>
                <span className="table-pill">Table {context.table.number}</span>
              </div>
              <h1>{context.restaurant.name}</h1>
              <p className="muted small" style={{ margin: 0 }}>
                Order for your table and follow it live. No app or account needed.
              </p>
            </div>
          </div>

          {error ? (
            <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
              {error}
            </div>
          ) : null}

          {context.categories.length > 0 ? (
            <nav className="category-nav" aria-label="Menu categories">
              {context.categories.map((category) => (
                <a key={category.id} href={`#cat-${category.id}`}>
                  {category.name}
                </a>
              ))}
            </nav>
          ) : null}

          {context.categories.length === 0 ? (
            <EmptyState title="This menu is not set up yet">
              Please ask a staff member for a menu. You can still order through them.
            </EmptyState>
          ) : null}

          {context.categories.map((category) => (
            <section key={category.id} id={`cat-${category.id}`} className="menu-section">
              <h2>
                {category.name}
                <span className="muted" style={{ fontWeight: 600, marginLeft: 6 }}>
                  {category.items.length > 0 ? `(${category.items.length})` : ""}
                </span>
              </h2>
              {category.items.length === 0 ? (
                <div className="empty small">Nothing in this section yet.</div>
              ) : (
                <div className="menu-list">
                  {category.items.map((item) => {
                    const inCart = cart.find((line) => line.menuItemId === item.id);
                    return (
                      <article
                        key={item.id}
                        className={`menu-item ${item.is_available ? "" : "sold-out"}`}
                      >
                        <div>
                          <h3>{item.name}</h3>
                          {item.description ? <p>{item.description}</p> : null}
                        </div>
                        <div className="item-actions">
                          <span className="price">{formatMoney(item.price_minor, currency)}</span>
                          {item.is_available ? (
                            inCart ? (
                              <div className="qty" aria-label={`Quantity for ${item.name}`}>
                                <button
                                  type="button"
                                  onClick={() => changeQuantity(item.id, -1)}
                                  aria-label={`Remove one ${item.name}`}
                                >
                                  −
                                </button>
                                <span aria-live="polite">{inCart.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => changeQuantity(item.id, 1)}
                                  aria-label={`Add one ${item.name}`}
                                >
                                  +
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => addItem(item)}
                              >
                                Add
                              </button>
                            )
                          ) : (
                            <span className="badge badge-cancelled">Sold out</span>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ))}

          <div className="alert alert-info small" style={{ marginTop: 8 }}>
            Payment is handled by staff at the table for now. This app never asks for an M-Pesa PIN.
          </div>
        </div>
      </main>

      {itemCount > 0 ? (
        <div className="cart-dock">
          <div className="container" style={{ maxWidth: 780 }}>
            <div className="cart-dock-total">
              <span className="tiny muted">
                {itemCount} item{itemCount === 1 ? "" : "s"} · table {context.table.number}
              </span>
              <strong>{formatMoney(totalMinor, currency)}</strong>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => setOpen(true)}>
              Review order
            </button>
          </div>
        </div>
      ) : null}

      {open ? (
        <Dialog
          title="Review your order"
          onClose={() => setOpen(false)}
          footer={
            <div style={{ display: "grid", gap: 10, width: "100%" }}>
              <div className="totals">
                <div>
                  <span>Subtotal</span>
                  <span>{formatMoney(totalMinor, currency)}</span>
                </div>
                <div className="grand">
                  <span>Total</span>
                  <span>{formatMoney(totalMinor, currency)}</span>
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setOpen(false)}
                >
                  Keep browsing
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={cart.length === 0 || submitting}
                  onClick={submit}
                >
                  {submitting ? "Sending order…" : "Place order"}
                </button>
              </div>
            </div>
          }
        >
          <p className="tiny muted" style={{ marginTop: 0 }}>
            Table {context.table.number} · {context.restaurant.name}. Prices are confirmed by the
            kitchen when the order is accepted.
          </p>

          {cart.length === 0 ? (
            <div className="empty">Your cart is empty.</div>
          ) : (
            cart.map((line) => (
              <div key={line.menuItemId} className="cart-line">
                <div>
                  <strong>{line.name}</strong>
                  <div className="tiny muted">
                    {formatMoney(line.unitPriceMinor, currency)} each
                  </div>
                  <input
                    className="note-input"
                    placeholder="Note for the kitchen (optional)"
                    value={line.notes}
                    maxLength={300}
                    onChange={(event) => setLineNote(line.menuItemId, event.target.value)}
                    aria-label={`Note for ${line.name}`}
                  />
                </div>
                <div style={{ display: "grid", justifyItems: "end", gap: 6 }}>
                  <div className="qty">
                    <button
                      type="button"
                      onClick={() => changeQuantity(line.menuItemId, -1)}
                      aria-label={`Remove one ${line.name}`}
                    >
                      −
                    </button>
                    <span aria-live="polite">{line.quantity}</span>
                    <button
                      type="button"
                      onClick={() => changeQuantity(line.menuItemId, 1)}
                      aria-label={`Add one ${line.name}`}
                    >
                      +
                    </button>
                  </div>
                  <span className="price small">
                    {formatMoney(line.unitPriceMinor * line.quantity, currency)}
                  </span>
                </div>
              </div>
            ))
          )}

          {cart.length > 0 ? (
            <label className="field" style={{ marginTop: 16 }}>
              <span>Note for the whole order (optional)</span>
              <textarea
                value={note}
                maxLength={500}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Allergies, cutlery, or anything the team should know"
              />
            </label>
          ) : null}

          {error ? (
            <div className="alert alert-error" role="alert" style={{ marginTop: 14 }}>
              {error}
            </div>
          ) : null}

          <p className="tiny muted" style={{ marginTop: 14, marginBottom: 0 }}>
            You will see live status after ordering. Pay your server at the end.
          </p>
        </Dialog>
      ) : null}
    </>
  );
}
