# 05 — Database Schema and Data Access Plan
## Working title: TableFlow
**Database:** PostgreSQL via Supabase  
**Status:** Logical schema draft. Review constraints and migrations before production.

## 1. Schema principles
- Multi-tenant: restaurant-owned records include `restaurant_id` directly or are reachable through a restaurant-owned parent.
- Use UUID primary keys unless there is a documented reason not to.
- Use `timestamptz` for timestamps and UTC in storage.
- Use integer minor currency units (e.g., cents) for money; store currency code, default `KES`.
- Add `created_at` and `updated_at` where useful.
- Enforce important rules with database constraints and server-side transactions.
- Do not store M-Pesa PINs.
- Store immutable order-item price/name snapshots.
- Treat payment provider payloads as sensitive; minimize stored fields and restrict access.

## 2. Core tables

### `restaurants`
- `id uuid primary key`
- `name text not null`
- `slug text unique not null`
- `status text not null` — e.g. `active`, `suspended`, `setup`
- `currency char(3) not null default 'KES'`
- `timezone text not null default 'Africa/Nairobi'`
- `created_at`, `updated_at timestamptz`

### `profiles`
- `id uuid primary key references auth.users(id) on delete cascade`
- `display_name text`
- `phone text`
- `created_at`, `updated_at timestamptz`
Only store profile data needed for the service.

### `restaurant_members`
- `id uuid primary key`
- `restaurant_id uuid not null references restaurants(id)`
- `user_id uuid not null references profiles(id)`
- `role text not null` — `owner`, `manager`, `wait_staff`, `kitchen`, `cashier`
- `status text not null default 'active'`
- `created_at timestamptz`
- Unique constraint on (`restaurant_id`, `user_id`).
A user may belong to more than one restaurant only if explicitly supported.

### `dining_tables`
- `id uuid primary key`
- `restaurant_id uuid not null references restaurants(id)`
- `table_number text not null`
- `qr_token_hash text unique not null` — store a hash where feasible; never rely on sequential IDs as public identifiers.
- `status text not null default 'active'`
- `created_at`, `updated_at timestamptz`
- Unique constraint on (`restaurant_id`, `table_number`).

### `categories`
- `id uuid primary key`
- `restaurant_id uuid not null references restaurants(id)`
- `name text not null`
- `sort_order integer not null default 0`
- `is_active boolean not null default true`
- `created_at`, `updated_at timestamptz`

### `menu_items`
- `id uuid primary key`
- `restaurant_id uuid not null references restaurants(id)`
- `category_id uuid references categories(id)`
- `name text not null`
- `description text`
- `image_url text`
- `price_minor bigint not null check (price_minor >= 0)`
- `currency char(3) not null default 'KES'`
- `is_available boolean not null default true`
- `sort_order integer not null default 0`
- `created_at`, `updated_at timestamptz`
Validate category and item belong to the same restaurant.

### `orders`
- `id uuid primary key`
- `restaurant_id uuid not null references restaurants(id)`
- `table_id uuid not null references dining_tables(id)`
- `order_number text not null`
- `source text not null` — `qr`, `tablet`, or approved staff entry
- `status text not null` — `pending`, `accepted`, `preparing`, `ready`, `served`, `completed`, `cancelled`
- `currency char(3) not null default 'KES'`
- `subtotal_minor bigint not null check (subtotal_minor >= 0)`
- `charges_minor bigint not null default 0 check (charges_minor >= 0)`
- `total_minor bigint not null check (total_minor >= 0)`
- `idempotency_key text`
- `created_at`, `updated_at timestamptz`
- Optional `accepted_at`, `ready_at`, `served_at`, `completed_at`
- Unique constraint on (`restaurant_id`, `order_number`)
- Unique idempotency constraint scoped appropriately, e.g. (`restaurant_id`, `idempotency_key`) where key is not null.
Validate table belongs to the same restaurant. Calculate totals server-side.

### `order_items`
- `id uuid primary key`
- `order_id uuid not null references orders(id) on delete restrict`
- `menu_item_id uuid references menu_items(id) on delete set null`
- `item_name_snapshot text not null`
- `unit_price_minor bigint not null check (unit_price_minor >= 0)`
- `quantity integer not null check (quantity > 0)`
- `line_total_minor bigint not null check (line_total_minor >= 0)`
- `notes text`
- `created_at timestamptz`
Snapshot name and price at time of ordering. Validate quantity and calculate line total server-side.

### `payments`
- `id uuid primary key`
- `restaurant_id uuid not null references restaurants(id)`
- `order_id uuid not null references orders(id)`
- `method text not null` — e.g. `mpesa`, `cash`, `card`, `other`
- `status text not null` — `pending`, `succeeded`, `failed`, `cancelled`, `unknown`, `refunded`
- `amount_minor bigint not null check (amount_minor > 0)`
- `currency char(3) not null default 'KES'`
- `provider_request_id text`
- `provider_transaction_ref text`
- `recorded_by uuid references profiles(id)`
- `verified_at timestamptz`
- `created_at`, `updated_at timestamptz`
Validate payment restaurant matches order restaurant. Do not allow client-side status updates.

### `payment_events`
- `id uuid primary key`
- `payment_id uuid references payments(id)`
- `provider text not null`
- `event_reference text unique`
- `event_type text not null`
- `processing_status text not null`
- `received_at timestamptz not null default now()`
- `payload_redacted jsonb`
Use least-privilege access, redact unnecessary personal data, and enforce idempotent processing.

### `audit_logs`
- `id uuid primary key`
- `restaurant_id uuid references restaurants(id)`
- `actor_id uuid references profiles(id)`
- `action text not null`
- `entity_type text`
- `entity_id uuid`
- `metadata_redacted jsonb`
- `created_at timestamptz not null default now()`
Audit sensitive changes and payment actions. Avoid secrets and unnecessary personal data in metadata.

## 3. Relationships
- `restaurants` 1—many `restaurant_members`, `dining_tables`, `categories`, `menu_items`, `orders`, `payments`.
- `profiles` 1—many `restaurant_members`.
- `categories` 1—many `menu_items`.
- `dining_tables` 1—many `orders`.
- `orders` 1—many `order_items` and 1—many `payments`.
- `payments` 1—many `payment_events`.
- `audit_logs` reference the acting user and optionally restaurant.

## 4. Access control / RLS
- Enable RLS on every tenant-owned/private table.
- Restaurant members may read/write only rows for restaurants where they have active membership and sufficient role permissions.
- Kitchen role can read order details needed for preparation and update only permitted order states; price visibility is an owner decision.
- Cashier role can access bills/payments but not modify menu/roles unless granted.
- Owners/managers manage their restaurant's menu, tables, and staff according to policy.
- Public customers may read active menu data and resolve a valid QR token through a narrow server-side function. Do not expose all table records or raw token hashes.
- Order creation should use a validated server-side operation that confirms the QR/table context, item availability, price snapshots, and totals.
- Payment callbacks use a server-only route/service role and must not be callable as an authenticated customer write.
- Platform administration is separate and audited. Do not create broad cross-tenant policies for convenience.

## 5. Transactions and invariants
- Create order and order items in one transaction.
- Confirm restaurant/table/item relationships are consistent.
- Compute all totals on trusted server-side code.
- Process each provider event once; duplicate callback must not duplicate payment.
- Payment success must match expected provider reference, amount, currency, and payment attempt.
- Do not mark a bill fully paid until verified successful payments cover the amount due under the approved billing rules.
- Preserve completed order and payment history; use controlled correction/refund workflows rather than silently editing records.

## 6. Indexes to consider
- `orders(restaurant_id, status, created_at)`
- `orders(restaurant_id, table_id, created_at)`
- `order_items(order_id)`
- `payments(restaurant_id, order_id, status)`
- `restaurant_members(user_id, status)`
- `menu_items(restaurant_id, is_available, sort_order)`
- `categories(restaurant_id, is_active, sort_order)`
- Unique indexes for restaurant slug, table number per restaurant, order number per restaurant, QR token hash, and provider event reference.

## 7. Future tables — not MVP unless approved
- `restaurant_subscriptions`
- `loyalty_accounts`, `loyalty_transactions`
- `trivia_games`, `trivia_sessions`, `trivia_answers`, `trivia_leaderboards`
- `wifi_access_policies`
- `branches`
Do not create these tables prematurely unless the owner approves a phase change.

## 8. Schema approval checklist
- [ ] Role matrix approved.
- [ ] Tax/service-charge/discount rules approved.
- [ ] Table bill versus individual order payment model approved.
- [ ] RLS policies tested with at least two restaurants and multiple roles.
- [ ] Migration and rollback reviewed.
- [ ] Payment callback and audit retention rules reviewed.
