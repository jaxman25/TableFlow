"use client";

import { useActionState } from "react";
import { createCategory, createMenuItem, type ActionResult } from "./actions";

const initial: ActionResult = { ok: false };

export function AddCategoryForm() {
  const [state, action, pending] = useActionState(createCategory, initial);

  return (
    <form action={action} className="stack">
      <h3 style={{ margin: 0 }}>Add category</h3>
      {state.error ? (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {state.ok ? <div className="alert alert-success">Category added.</div> : null}
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input name="name" required maxLength={80} placeholder="e.g. Desserts" />
        </label>
        <label className="field">
          <span>Sort order</span>
          <input name="sortOrder" type="number" min={0} max={999} defaultValue={0} />
        </label>
      </div>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Adding…" : "Add category"}
      </button>
    </form>
  );
}

export function AddItemForm({
  categories,
}: {
  categories: { id: string; name: string }[];
}) {
  const [state, action, pending] = useActionState(createMenuItem, initial);

  return (
    <form action={action} className="stack">
      <h3 style={{ margin: 0 }}>Add menu item</h3>
      {state.error ? (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      ) : null}
      {state.ok ? <div className="alert alert-success">Item added.</div> : null}
      {categories.length === 0 ? (
        <p className="muted small" style={{ margin: 0 }}>
          Create a category first.
        </p>
      ) : null}
      <div className="form-grid">
        <label className="field">
          <span>Name</span>
          <input name="name" required maxLength={120} placeholder="e.g. Chicken biryani" />
        </label>
        <label className="field">
          <span>Category</span>
          <select name="categoryId" required defaultValue="">
            <option value="" disabled>
              Choose…
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Price (KSh)</span>
          <input
            name="priceShillings"
            type="number"
            min={0}
            step="1"
            required
            placeholder="450"
          />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea name="description" maxLength={1000} placeholder="Shown to diners" />
      </label>
      <label className="check-row">
        <input type="checkbox" name="isAvailable" defaultChecked />
        <span>Available to order</span>
      </label>
      <button
        type="submit"
        className="btn btn-primary btn-sm"
        disabled={pending || categories.length === 0}
      >
        {pending ? "Adding…" : "Add item"}
      </button>
    </form>
  );
}
