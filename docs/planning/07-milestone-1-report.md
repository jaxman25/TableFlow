# 07 — Milestone 1 implementation notes

**Status:** order flow implemented, awaiting owner review before Stage 5 (billing).
**Scope delivered:** Stage 1 foundation plus the Stage 2–4 capabilities required by Milestone 1.
Trivia, loyalty, Wi-Fi, and payments were not started.

## Decisions applied (owner approved 2026-10-21)

| Decision | Value |
|---|---|
| Dev runtime | Local Postgres-compatible database with a development auth shim |
| Order acceptance | Required: `pending → accepted → preparing → ready → served → completed` |
| Billing unit | One order (a table can have several orders per service) |
| Role matrix | Owner/manager full; wait staff accept and progress; kitchen no prices; cashier deferred |
| Charges | Zero in this milestone; `charges_minor` retained |

## Database additions beyond the draft schema

- `orders.public_token` — opaque token for the diner status page without an account.
- `order_status_events` — one row per transition with actor, timestamp, and reason.
- `restaurants.requires_order_acceptance` — defaults to true; no UI toggle yet.
- `dining_tables.qr_token_rotated_at` / `qr_token_expires_at` — rotation trail and optional expiry.
- `restaurant_members` policies hardened so a manager can never demote, revoke, or delete an owner.
- Tenant-safe composite foreign keys (table/order/category must belong to the same restaurant).

## Deliberate deviations (deviation, not stack change)

1. **Local database:** native PostgreSQL could not run in this sandbox (child processes were killed
   with `0xC0000142`). Local development runs PGlite in-process via `DB_DRIVER=pglite`.
   Production remains Supabase Postgres through node-postgres (`DB_DRIVER=pg`); migrations, RLS,
   and transactions are unchanged.
2. **Auth:** `AUTH_PROVIDER=local` reads development credentials created by the seed. Supabase Auth
   is still the production plan; the swap is contained in `src/lib/auth/local-provider.ts`.
3. **Realtime:** the staff queue uses SSE (server polls the DB) plus a 12s polling fallback, rather
   than Supabase Realtime. The database remains the source of truth.
4. **Order errors:** order functions return result envelopes instead of raising exceptions. This
   keeps expected business failures out of exception control flow and maps them to HTTP errors in
   one place; validation and atomicity are unchanged.
5. **Rate limiting:** public order submission has a process-local sliding window. Replace with a
   shared limiter before production.
6. **Audit writes:** administrative changes append audit rows through `public.write_audit`, which
   stamps the actor from request claims and limits callers to the restaurant's owner/manager.

## Still open (owner input required)

- Final product name, logo, and domain.
- Tax, service charge, discount, and receipt rules (needed before Stage 5).
- Receipt content and whether staff-recorded payments need a second approver.
- Whether diners may add rounds to an existing order, and how that reads on the bill.
- Tablet device policy: one table per device vs staff-managed table selector.
- Whether kitchen should ever see prices (currently no).
- Pilot restaurant, devices, and success thresholds.

## Known gaps before production

- Supabase Auth invite/password-reset flow and session refresh.
- Shared rate limiting and audit retention policy.
- Payment tables exist but have no UI or write path.
- No platform-admin onboarding/suspension tooling.
- No CI pipeline; checks are run manually (`typecheck`, `lint`, `test`, `build`, `smoke`, `ui-check`).
