"use client";

import { useActionState } from "react";
import { ASSIGNABLE_ROLES, ROLE_LABELS } from "@/lib/roles";
import { createStaffMember, type StaffActionResult } from "./actions";

const initial: StaffActionResult = { ok: false };

export function AddStaffForm() {
  const [state, action, pending] = useActionState(createStaffMember, initial);

  return (
    <form action={action} className="stack">
      <p className="tiny muted" style={{ margin: 0 }}>
        A temporary password is generated once. Share it securely and ask the person to change it
        when password management lands.
      </p>

      {state.error ? (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      ) : null}

      {state.ok && state.tempPassword ? (
        <div className="alert alert-success">
          Account created for <strong>{state.email}</strong>.
          <br />
          Temporary password: <span className="mono">{state.tempPassword}</span>
        </div>
      ) : null}

      <div className="form-grid">
        <label className="field">
          <span>Email</span>
          <input name="email" type="email" required maxLength={200} placeholder="name@example.com" />
        </label>
        <label className="field">
          <span>Display name</span>
          <input name="displayName" maxLength={120} placeholder="Optional" />
        </label>
        <label className="field">
          <span>Role</span>
          <select name="role" required defaultValue="wait_staff">
            {ASSIGNABLE_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
