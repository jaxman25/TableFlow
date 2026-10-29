import { PageHead } from "@/components/shared/PageHead";
import { EmptyState } from "@/components/shared/EmptyState";
import { requireRole } from "@/lib/auth/staff";
import { listCategoriesWithItems } from "@/lib/admin/data";
import { formatMoney } from "@/lib/format";
import { AddCategoryForm, AddItemForm } from "./forms";
import { toggleItemAvailability, updateItemPrice } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminMenuPage() {
  const context = await requireRole(["owner", "manager"]);
  const categories = await listCategoriesWithItems(
    context.session.userId,
    context.membership.restaurantId,
  );

  const totalItems = categories.reduce((sum, category) => sum + category.items.length, 0);
  const soldOut = categories.reduce(
    (sum, category) => sum + category.items.filter((item) => !item.is_available).length,
    0,
  );

  return (
    <>
      <PageHead
        eyebrow="Restaurant"
        title="Menu"
        description="Prices are copied into an order when it is placed, so editing a price never changes an existing order."
      />

      <div className="row" style={{ gap: 6, marginBottom: 18 }}>
        <span className="chip">
          {categories.length} categor{categories.length === 1 ? "y" : "ies"}
        </span>
        <span className="chip">{totalItems} items</span>
        {soldOut > 0 ? (
          <span className="chip" style={{ color: "var(--warn)", borderColor: "var(--warn-line)" }}>
            {soldOut} sold out
          </span>
        ) : null}
      </div>

      <section className="panel" style={{ marginBottom: 24 }}>
        <div className="panel-head">
          <h2>Add to the menu</h2>
          <span className="tiny muted">New items appear on the diner menu immediately.</span>
        </div>
        <div className="panel-body">
          <div className="form-split">
            <AddItemForm
              categories={categories.map((category) => ({
                id: category.id,
                name: category.name,
              }))}
            />
            <AddCategoryForm />
          </div>
        </div>
      </section>

      {categories.length === 0 ? (
        <EmptyState title="Your menu is empty">
          Add a category first, then add items to it. Diner menus are built from active categories
          only.
        </EmptyState>
      ) : null}

      {categories.map((category) => (
        <section key={category.id} className="category-block">
          <div className="category-head">
            <div>
              <h2>{category.name}</h2>
              <span className="tiny muted">
                {category.items.length} item{category.items.length === 1 ? "" : "s"} · position{" "}
                {category.sort_order}
              </span>
            </div>
            <span className={`badge ${category.items.length > 0 ? "badge-served" : "badge-pending"}`}>
              {category.items.length > 0 ? "On the menu" : "Empty"}
            </span>
          </div>

          {category.items.length === 0 ? (
            <p className="muted small" style={{ padding: "14px 16px", margin: 0 }}>
              No items yet. Use “Add menu item” above and choose this category.
            </p>
          ) : (
            <div className="table-wrap table-wrap-embedded">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Price (KSh)</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {category.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.name}</strong>
                        {item.description ? (
                          <div className="tiny muted" style={{ maxWidth: "46ch" }}>
                            {item.description}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        <form action={updateItemPrice} className="inline-form">
                          <input type="hidden" name="id" value={item.id} />
                          <input
                            name="priceShillings"
                            type="number"
                            min={0}
                            step="1"
                            className="price-input"
                            defaultValue={item.price_minor / 100}
                            aria-label={`Price in shillings for ${item.name}`}
                          />
                          <button type="submit" className="btn btn-secondary btn-sm">
                            Save
                          </button>
                        </form>
                        <div className="tiny muted" style={{ marginTop: 3 }}>
                          Currently {formatMoney(item.price_minor)}
                        </div>
                      </td>
                      <td>
                        <span
                          className={`badge ${item.is_available ? "badge-ready" : "badge-cancelled"}`}
                        >
                          {item.is_available ? "Available" : "Sold out"}
                        </span>
                      </td>
                      <td>
                        <div className="cell-actions">
                          <form action={toggleItemAvailability}>
                            <input type="hidden" name="id" value={item.id} />
                            <input
                              type="hidden"
                              name="next"
                              value={item.is_available ? "false" : "true"}
                            />
                            <button
                              type="submit"
                              className={`btn btn-sm ${
                                item.is_available ? "btn-secondary" : "btn-primary"
                              }`}
                            >
                              {item.is_available ? "Mark sold out" : "Mark available"}
                            </button>
                          </form>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
    </>
  );
}
