# TableFlow

QR and tablet ordering for casual-dining restaurants, with a live staff queue, menu/table/staff
administration, and restaurant-level data isolation. Working name — not final branding.

**Current milestone:** working order flow without real-money payments (Stages 1–4 of
`docs/planning/06-implementation-plan.md`). Payments, M-Pesa, trivia, loyalty, and Wi-Fi are not
built yet.

## Stack

- Next.js 15 (App Router) + TypeScript + React 19
- PostgreSQL via Supabase in production
- Supabase Auth / Realtime planned for production; development uses a local auth shim and SSE
- Row Level Security as the tenant boundary
- Vitest for unit and database integration tests, Playwright for the browser pass

## Quick start

Requirements: Node 20+, npm, and (for the browser check) Chromium.

```bash
npm install
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # SESSION_SECRET
# paste the value into .env.local

npm run db:setup    # create the local database, migrate, and seed
npm run dev         # http://localhost:3000
```

Seeded demo data:

| What | Value |
|---|---|
| Owner | `owner@tableflow.test` / `tableflow123` |
| Manager | `manager@tableflow.test` / `tableflow123` |
| Wait staff | `waiter@tableflow.test` / `tableflow123` |
| Kitchen | `kitchen@tableflow.test` / `tableflow123` |
| Table 4 menu | generated at seed time; see seed output for the exact `/t/<token>` link |
| Tablet variant | same URL with `?source=tablet` |

The seed also creates a second restaurant (`Rival Cafe`) so cross-tenant isolation can be checked
by hand.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Next.js development server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit + RLS/ordering integration) |
| `npm run db:setup` | Create/migrate the local database and seed demo data |
| `npm run db:migrate` | Apply pending `supabase/migrations/*.sql` |
| `npm run db:reset` | Drop the public schema and reapply every migration |
| `npm run db:seed` | Reset demo restaurant data and sample orders |
| `npm run smoke` | HTTP smoke test against a running app |
| `npm run ui-check` | Playwright flow: admin setup → QR → cart → staff accept |

`smoke` and `ui-check` require `npm run dev` to be running and the seed to be applied.

## Architecture notes

- **Migrations** live in `supabase/migrations/` and are append-only. `0001` schema, `0002` RLS and
  staff views, `0003`/`0005` order functions, `0004` membership hardening.
- **Tenant isolation** is enforced by RLS on every tenant-owned table. Requests run as `anon` or
  `authenticated` with JWT-style claims, the same way Supabase evaluates policies. Cross-tenant
  reads/writes are covered by tests.
- **Orders** are written only through `public.place_order`, which resolves the opaque QR token,
  validates availability and quantities, computes totals from menu prices, snapshots names/prices,
  and de-duplicates retries by idempotency key. `orders` and `order_items` have no `authenticated`
  grants; staff read them through the masked `staff_orders` / `staff_order_items` views.
- **Kitchen privacy:** the staff views null out prices and totals for kitchen accounts.
- **Status changes** go through `public.update_order_status`, which enforces the transition matrix
  and actor roles, then writes an order event and an audit row.
- **Validation failures** return result envelopes (`ok`, `error_code`) rather than raising, so a
  rejected order never leaves a session or transaction in an error state.
- **Realtime:** the staff queue consumes a server-sent event stream and refetches
  `/api/staff/orders`; polling every 12s is the fallback. The database remains the source of truth.
- **QR codes** are generated server-side; only a SHA-256 hash of each token is stored. The raw link
  is displayed once at creation or after regeneration.

## Role matrix (approved for this milestone)

| Role | Queue / orders | Status changes | Menu & tables | Staff | Prices |
|---|---|---|---|---|---|
| Owner / manager | read | full valid matrix | manage | manage (manager cannot touch owners) | yes |
| Wait staff | read | accept, prepare→ready→served→completed, cancel new orders | no | no | yes |
| Kitchen | read | accepted→preparing, preparing→ready | no | no | no |
| Cashier | read | same order-level transitions as wait staff (prices hidden) | no | no | no |

## Development database

The sandbox cannot run native PostgreSQL child processes, so local development uses **PGlite**
(PostgreSQL compiled to WebAssembly) **in-process** via `DB_DRIVER=pglite`. Application code,
migrations, RLS policies, and transactions are the same as production; only the engine host
changes (`src/lib/db/pool.ts` has both drivers).

- Data lives in `%LOCALAPPDATA%\TableFlow\pglite` (override with `PGLITE_DIR`). Delete that
  folder or run `npm run db:reset` to start over.
- PGlite is a single session, so database access is serialised. This is a development-only
  constraint; stop the dev server before running migration or seed scripts.
- `DB_DRIVER=pg` switches to node-postgres with `DATABASE_URL` (production/Supabase).

Production target remains Supabase Postgres. Set `DB_DRIVER=pg` and `DATABASE_URL` to the Supabase
connection string, apply the migrations, and wire Supabase Auth/Realtime as described in
`docs/planning/02-technical-requirements.md`.

## Not built yet

- Real-money payments, staff-assisted payment recording, M-Pesa Daraja (Stage 5–6)
- Supabase Auth and Supabase Realtime (development shim + SSE are in place)
- Tax/service charges (schema keeps `charges_minor`, currently always zero)
- Shared table bills (billing unit is one order)
- Platform admin, onboarding, and cross-tenant support tooling
- Trivia, loyalty, Wi-Fi, multi-branch
