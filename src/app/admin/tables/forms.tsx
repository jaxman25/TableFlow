"use client";

import { useActionState, useState, useTransition } from "react";
import { Dialog } from "@/components/shared/Dialog";
import { createTable, regenerateTableQr, type TableActionResult } from "./actions";

const initial: TableActionResult = { ok: false };

function QrPanel({
  title,
  result,
  onClose,
}: {
  title: string;
  result: TableActionResult;
  onClose: () => void;
}) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      width={420}
      footer={
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
          Print QR code
        </button>
      }
    >
      <div className="qr-box">
        {result.dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={result.dataUrl} alt={`QR code for table ${result.tableNumber ?? ""}`} />
        ) : null}
        <strong>Table {result.tableNumber}</strong>
        <p className="url mono">{result.url}</p>
        <a href={result.url} className="btn btn-secondary btn-sm" target="_blank" rel="noreferrer">
          Open table menu
        </a>
      </div>
      <div className="alert alert-warn small" style={{ marginTop: 12 }}>
        Save or print this QR now. Only a hash is stored, so the link cannot be shown again.
        Regenerating replaces it and invalidates the previous code.
      </div>
    </Dialog>
  );
}

export function CreateTableForm() {
  const [state, action, pending] = useActionState(createTable, initial);
  const [closed, setClosed] = useState(false);

  return (
    <>
      <form action={action} className="form-grid">
        <label className="field">
          <span>Table number or name</span>
          <input name="tableNumber" required maxLength={40} placeholder="e.g. 7 or Patio 2" />
          <span className="hint">Shown to diners and staff exactly as typed.</span>
        </label>
        {state.error ? (
          <div className="alert alert-error" role="alert">
            {state.error}
          </div>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create table & QR"}
        </button>
      </form>

      {state.ok && !closed ? (
        <QrPanel title="New table QR" result={state} onClose={() => setClosed(true)} />
      ) : null}
    </>
  );
}

export function RegenerateQrButton({
  tableId,
  tableNumber,
}: {
  tableId: string;
  tableNumber: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<TableActionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function regenerate() {
    if (
      !window.confirm(
        `Regenerate the QR for ${tableNumber}? The current printed code will stop working immediately.`,
      )
    ) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const response = await regenerateTableQr(tableId);
      if (!response.ok) {
        setError(response.error ?? "Could not regenerate the QR.");
        return;
      }
      setResult(response);
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={regenerate}
        disabled={pending}
      >
        {pending ? "Working…" : "Regenerate QR"}
      </button>
      {error ? (
        <div className="alert alert-error tiny" style={{ marginTop: 6 }} role="alert">
          {error}
        </div>
      ) : null}
      {result?.dataUrl ? (
        <QrPanel title="New QR code" result={result} onClose={() => setResult(null)} />
      ) : null}
    </>
  );
}
