# 02 — Technical Requirements Document
## Working title: TableFlow
**Status:** Draft; keep the selected stack unless a documented technical blocker is approved.

## 1. Architecture
Build a responsive web application with separate customer, restaurant staff, and platform-admin experiences. Use one codebase and shared domain logic; do not create separate native customer apps for the MVP.

## 2. Selected stack
- **Frontend and server routes:** Next.js + TypeScript.
- **Database:** PostgreSQL managed by Supabase.
- **Authentication:** Supabase Auth.
- **Realtime order updates:** Supabase Realtime, with reconnection and refresh fallback.
- **Authorization:** PostgreSQL Row Level Security (RLS), server-side authorization checks, and role checks.
- **Payments:** Safaricom Daraja API, initially in sandbox.
- **Deployment:** Vercel for the web app; Supabase for database/auth/realtime.
- **Version control:** Git repository with migrations and documented environment setup.

Do not silently replace these technologies. If a change is genuinely necessary, explain the reason, trade-offs, migration impact, and request approval before changing it.

## 3. Application areas
1. Public customer menu/order experience.
2. Restaurant staff/kitchen dashboard.
3. Restaurant owner/admin dashboard.
4. Platform owner/admin dashboard.
5. Server-side API/actions for orders, totals, authorization, payments, callbacks, and audit events.

## 4. Environments and configuration
Maintain separate local/development, payment-sandbox/staging, and production configuration. Use environment variables for credentials. Never commit secrets, service-role keys, Daraja consumer secrets, access tokens, or production credentials.

Required configuration should be documented in `.env.example` using placeholder values only. Supabase service-role credentials must never be exposed to the browser. Payment initiation and callback processing must run server-side.

## 5. Security requirements
- Enable RLS on all tables containing tenant-owned or private data.
- Enforce `restaurant_id` scope on server operations; do not trust a client-provided restaurant ID alone.
- Validate input on the server, including quantities, prices, status transitions, and payment amounts.
- Derive totals from database prices and persisted order snapshots, never from a client-submitted total.
- Use opaque, unguessable QR tokens; support disabling/regenerating tokens.
- Rate-limit or otherwise protect public order submission and payment initiation.
- Verify payment callback authenticity according to the current Daraja documentation and reconcile transaction status.
- Implement idempotency for order creation, payment initiation, and callback handling.
- Keep audit logs for privileged changes and payment state changes.
- Store only the minimum necessary customer data and define retention/access rules.
- Do not log secrets, PINs, or unnecessary personal/payment payload data.

## 6. Realtime and reliability
- Staff dashboards should receive new orders and updates in near real time.
- Handle dropped connections, duplicate events, stale views, and browser refreshes.
- The database remains the source of truth; realtime messages are notifications, not the sole record.
- Provide visible pending/error states if order submission or payment status is uncertain.
- Do not automatically retry a payment in a way that could charge a customer twice.

## 7. Payment requirements
- Start with Daraja sandbox; production access depends on the required Safaricom/business setup and approval.
- Keep payment states distinct from order states.
- Record an internal payment attempt before initiating the provider request.
- Store provider request/checkout identifiers and transaction references where returned.
- Process callbacks idempotently and verify amounts, currency, merchant context, and transaction identity.
- Include a reconciliation path for delayed/missing callbacks and ambiguous outcomes.
- Staff-assisted payments must be explicitly labelled as recorded/verified by staff, with an audit trail.
- Never ask for, transmit, or store the customer's M-Pesa PIN in the app.

## 8. Suggested repository structure
Adapt to the existing repository rather than overwriting it blindly.

```text
app/
  (customer)/
  (staff)/
  (restaurant-admin)/
  (platform-admin)/
  api/
components/
  customer/
  staff/
  admin/
  shared/
lib/
  auth/
  db/
  orders/
  payments/
  validation/
  security/
supabase/
  migrations/
  seed.sql
public/
  qr/
tests/
  unit/
  integration/
  e2e/
.env.example
README.md
```

## 9. Testing and quality gates
- Unit tests: totals, state transitions, permission helpers, payment-state logic.
- Integration tests: order creation, item availability, database constraints, payment callback idempotency.
- Security tests: cross-tenant reads/writes and role escalation.
- End-to-end tests: QR order, tablet order, staff update, bill, staff-recorded payment.
- Sandbox tests: success, rejection, timeout, delayed callback, duplicate callback, and callback amount mismatch.
- Run lint, type checks, tests, and database migration checks before declaring a milestone complete.

## 10. Deployment and operations
- Use reviewed migrations; never make untracked production schema changes.
- Maintain backups and document restoration steps.
- Add basic error logging/monitoring without exposing secrets or sensitive payloads.
- Document deployment, rollback, environment variables, and admin account setup.
- Avoid introducing paid infrastructure or services without recording the cost and getting approval.

## 11. Technical decisions needing approval
- Whether to use Next.js server actions, API routes, or a consistent combination.
- Exact supported tax/service-charge model.
- Whether customer order access uses a signed session/token and how that token expires.
- Production logging/monitoring service.
- Backup and retention period.
