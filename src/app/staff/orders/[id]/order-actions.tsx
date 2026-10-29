"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { availableTransitions, type Transition } from "@/lib/orders/transitions";
import type { OrderStatus } from "@/lib/types";

export function OrderActions({
  orderId,
  status,
  role,
}: {
  orderId: string;
  status: OrderStatus;
  role: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reasonFor, setReasonFor] = useState<Transition | null>(null);
  const [reason, setReason] = useState("");

  const transitions = availableTransitions(status, role);
  const primary = transitions.filter((transition) => transition.tone !== "danger");
  const destructive = transitions.filter((transition) => transition.tone === "danger");

  async function apply(transition: Transition, note?: string) {
    setBusy(transition.to);
    setError(null);
    try {
      const response = await fetch(`/api/staff/orders/${orderId}/status`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: transition.to, reason: note ?? null }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "That update was not accepted.");
        return;
      }
      setReasonFor(null);
      setReason("");
      router.refresh();
    } catch {
      setError("Could not reach the server. The order was not changed.");
    } finally {
      setBusy(null);
    }
  }

  function choose(transition: Transition) {
    if (transition.needsReason) {
      setReasonFor(transition);
      setReason("");
      return;
    }
    if (transition.confirm && !window.confirm(transition.confirm)) return;
    void apply(transition);
  }

  if (transitions.length === 0) {
    return (
      <p className="muted small" style={{ margin: 0 }}>
        No further actions are available for your role on this order.
      </p>
    );
  }

  return (
    <div className="actions-stack">
      {error ? (
        <div className="alert alert-error" role="alert">
          {error}
        </div>
      ) : null}

      {primary.map((transition) =>
        reasonFor?.to === transition.to ? (
          <form
            key={transition.to}
            onSubmit={(event) => {
              event.preventDefault();
              if (reason.trim().length < 3) {
                setError("Please give a short reason.");
                return;
              }
              void apply(transition, reason.trim());
            }}
            className="stack-tight"
          >
            <label className="field">
              <span>Reason for cancelling</span>
              <textarea
                value={reason}
                maxLength={500}
                required
                autoFocus
                onChange={(event) => setReason(event.target.value)}
                placeholder="Out of stock, diner changed their mind, duplicate order…"
              />
            </label>
            <div className="row">
              <button
                type="submit"
                className="btn btn-danger btn-sm"
                disabled={busy !== null}
              >
                {busy ? "Saving…" : "Confirm cancellation"}
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setReasonFor(null)}
              >
                Keep order
              </button>
            </div>
          </form>
        ) : (
          <button
            key={transition.to}
            type="button"
            className={`btn btn-${transition.tone} btn-block`}
            disabled={busy !== null}
            onClick={() => choose(transition)}
          >
            {busy === transition.to ? "Saving…" : transition.label}
          </button>
        ),
      )}

      {destructive.length > 0 ? (
        <>
          <hr className="divider" style={{ margin: "4px 0" }} />
          {destructive.map((transition) =>
            reasonFor?.to === transition.to ? (
              <form
                key={transition.to}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (reason.trim().length < 3) {
                    setError("Please give a short reason.");
                    return;
                  }
                  void apply(transition, reason.trim());
                }}
                className="stack-tight"
              >
                <label className="field">
                  <span>Reason for cancelling</span>
                  <textarea
                    value={reason}
                    maxLength={500}
                    required
                    autoFocus
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Out of stock, diner changed their mind, duplicate order…"
                  />
                </label>
                <div className="row">
                  <button type="submit" className="btn btn-danger btn-sm" disabled={busy !== null}>
                    {busy ? "Saving…" : "Confirm cancellation"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setReasonFor(null)}
                  >
                    Keep order
                  </button>
                </div>
              </form>
            ) : (
              <button
                key={transition.to}
                type="button"
                className="btn btn-danger-soft btn-block btn-sm"
                disabled={busy !== null}
                onClick={() => choose(transition)}
              >
                {busy === transition.to ? "Saving…" : transition.label}
              </button>
            ),
          )}
        </>
      ) : null}

      <p className="tiny muted" style={{ margin: 0 }}>
        Only the approved sequence is accepted; anything else is rejected by the server.
      </p>
    </div>
  );
}
