# 06 — Implementation Plan
## Working title: TableFlow
**Delivery approach:** Small stages with explicit acceptance and owner sign-off.  
**Initial target:** One casual-dining restaurant pilot in Kenya.

## Stage 0 — Approve the plan
**Deliverables**
- Owner approves the PRD, technical stack, app flow, design brief, schema, and implementation sequence.
- Resolve critical decisions: brand name, bill model, tax/service charges, order acceptance, role permissions, pilot restaurant.
- Confirm repository and current codebase before modifying files.

**Exit criteria**
- Six documents reviewed and approved.
- No unresolved requirement that would change the database or core flow.

## Stage 1 — Project foundation
**Deliverables**
- Inspect existing repository; report framework, structure, current behavior, and risks before editing.
- Configure Next.js + TypeScript and Supabase without overwriting existing work.
- Create `.env.example`, setup instructions, lint/type-check/test commands.
- Create initial migrations and baseline RLS policies.
- Set up shared layout, authentication, role checks, and restaurant membership.

**Acceptance**
- App runs locally using documented commands.
- Migrations apply cleanly.
- Unauthenticated/private and cross-tenant access tests pass.

## Stage 2 — Restaurant setup and menu
**Deliverables**
- Restaurant profile and settings.
- Menu category/item CRUD and availability.
- Table management and QR token generation.
- Staff membership and roles.

**Acceptance**
- Owner can set up a restaurant, create tables, add menu items, and generate table QR codes.
- Public menu exposes only active items and no private administrative data.

## Stage 3 — Customer ordering
**Deliverables**
- Mobile customer menu, item detail/customization supported by requirements, cart, and order submission.
- QR and tablet entry paths.
- Server-side price calculation, snapshots, validation, and idempotency.
- Customer order confirmation and status view.

**Acceptance**
- Test QR order and tablet order both create correct orders.
- Invalid table, unavailable item, bad quantity, and duplicate-submit cases are handled safely.
- Existing order prices remain unchanged when menu prices change.

## Stage 4 — Staff and kitchen workflow
**Deliverables**
- Staff login and role-aware order queue.
- Order details with table number and item notes.
- Valid status transitions and realtime updates.
- Connection/retry behavior and order history.

**Acceptance**
- New orders show once with the correct table.
- Staff cannot perform actions outside their role.
- Reconnect/refresh recovers the persisted queue.

## Stage 5 — Billing and staff-assisted payments
**Deliverables**
- Bill view with transparent totals.
- Staff-assisted payment recording and audit history.
- Payment state separate from order state.
- Receipts/confirmation based on approved rules.

**Acceptance**
- Staff payment records contain amount, method, actor, time, and status.
- Unauthorized users cannot mark payments paid.
- Partial/duplicate/incorrect payment cases are handled according to approved billing rules.

## Stage 6 — M-Pesa sandbox
**Deliverables**
- Daraja sandbox setup and server-side STK Push initiation.
- Secure callback endpoint and idempotent event processing.
- Pending/success/failure/unknown states and reconciliation workflow.
- Test evidence for duplicate and delayed callbacks.

**Acceptance**
- No payment is marked successful from browser-only evidence.
- Callback amount/reference is validated.
- Duplicate callbacks do not duplicate payment records or receipts.
- Production credentials are not required for development and never committed.

## Stage 7 — Pilot readiness
**Deliverables**
- End-to-end, permission, usability, and failure-path tests.
- Tablet and common Android browser testing.
- Owner/staff onboarding guide and incident/recovery notes.
- Backups, monitoring, deployment/rollback procedure.
- Pilot success metrics and feedback form.

**Acceptance**
- Restaurant staff can use the system during a supervised test service.
- Orders, table identity, and payment records reconcile.
- Critical security/payment defects are resolved before production use.

## Stage 8 — Post-MVP roadmap (not part of initial release)
Only after pilot feedback and owner approval:
1. Trivia: solo and same-table multiplayer.
2. Restaurant-wide competitions and leaderboard.
3. Loyalty/rewards and sponsored promotions.
4. Rotating Wi-Fi access integrated with supported router/network controls.
5. Multi-branch management, subscriptions, and advanced analytics.

## Milestone 1 (first build target)
**Working order flow without real-money payments.**

Must include:
- Project setup and database/auth foundation.
- Restaurant/table/menu setup.
- QR and tablet customer entry.
- Cart and order submission.
- Live staff queue showing correct table number.
- Staff status updates.
- RLS and cross-restaurant security tests.

**Estimated duration:** 1–2 weeks for a focused solo developer, depending on starting codebase and experience. Treat this as an estimate, not a deadline guarantee.

## Change control
- FreeBuff AI must not silently add features, replace the stack, delete existing code, or change schema assumptions.
- Before a major change, explain why it is needed, list affected files/data, propose a safe plan, and wait for approval.
- Use small, reviewable changes. Run checks after each stage.
- Keep migrations and meaningful changes in version control.
- Never claim a feature is complete unless implemented and tested.
