# 03 — Application Flow
## Working title: TableFlow
**Purpose:** Define screens, actions, success paths, and failure paths before implementation.

## 1. Entry points
### QR code
1. Diner scans a table-specific QR code.
2. App validates the opaque QR token and resolves the active restaurant/table.
3. Show restaurant name, table identifier, menu, and any service notice.
4. If the token is invalid, expired, disabled, or table is unavailable, show a clear message and offer staff assistance. Do not silently route to another table.

### Restaurant tablet
1. Tablet opens the customer ordering page.
2. If assigned to one table, use a controlled device/table assignment.
3. Otherwise, show a table selector managed by staff.
4. Clear the previous customer session/cart after order completion or inactivity so the next diner cannot see prior details.

## 2. Customer menu and ordering
1. **Menu screen:** categories, items, prices, availability, item details.
2. Diner opens an item.
3. **Item detail:** quantity, supported options/customizations, special note.
4. Diner adds item to cart.
5. **Cart:** item list, quantities, prices, subtotal, applicable charges clearly disclosed.
6. Diner edits or removes items.
7. Diner submits order.
8. Server validates table, item availability, quantities, current prices, and applicable rules; calculates the total.
9. On success, persist order and items transactionally and show order number/table.
10. If submission outcome is uncertain, prevent blind resubmission; check whether the original request succeeded using an idempotency key.
11. **Order status screen:** show current status and last update.

## 3. Staff and kitchen flow
1. Staff signs in.
2. Server checks restaurant membership and role.
3. **Order queue:** show new orders with order number, table, age, items, notes, and status.
4. Staff opens an order.
5. Staff accepts/rejects it if that workflow is enabled; rejection requires a reason and must notify the relevant customer session.
6. Kitchen/staff update status using valid transitions.
7. Diner sees updates without needing to reload; reconnect/refresh remains available.
8. Marking an order ready/served records actor and timestamp.
9. Completed orders remain available in history.

Recommended initial status sequence: `pending` → `accepted` → `preparing` → `ready` → `served` → `completed`. Define explicit permitted transitions; allow `cancelled` only under documented conditions. Do not let a browser write arbitrary status strings.

## 4. Bill and payment flow
1. Diner opens **Bill** and sees persisted order items, totals, payment status, and any charges.
2. Diner chooses:
   - **M-Pesa:** enter phone number, review amount, request STK Push.
   - **Ask staff to pay:** show a clear message that staff will assist/record payment; do not imply that the bill is already paid.
3. Server creates a pending payment attempt and calls Daraja server-side.
4. Show “Waiting for M-Pesa confirmation.”
5. Process provider callback server-side and verify transaction details.
6. Update payment state idempotently; refresh customer/staff views.
7. If failed/cancelled, show safe retry guidance. If pending/unknown, show pending and advise not to pay again until status is checked.
8. Staff-assisted payment: authorized staff selects method, amount, and status, then confirms. Record actor/time and require elevated permission for corrections/refunds.
9. Bill is fully paid only when verified successful payments cover the amount due, according to approved billing rules.

## 5. Restaurant admin flows
- Sign in → overview.
- Menu → create/edit category → create/edit item → set price/availability → save.
- Tables → create table → generate QR token/printable QR → disable/regenerate when needed.
- Staff → invite/create account → assign role → revoke access.
- Orders/payments → filter by date/status/table → inspect details and audit trail.
- Settings → configure restaurant details and approved billing rules.

## 6. Platform admin flow
- Sign in with privileged account → restaurant list → onboard/activate/suspend restaurant → inspect limited operational status → view audit events.
- Any cross-tenant support access must be restricted, intentional, and logged.

## 7. Error and edge cases
- Invalid QR/table: explain issue and direct diner to staff.
- Item becomes unavailable while in cart: block submission or require confirmation after refreshing the cart.
- Lost connection during submit: show uncertain state and safely reconcile using idempotency.
- Staff dashboard disconnects: show connection warning and recover without losing persisted orders.
- Duplicate order event: render one order using stable IDs.
- Payment callback delayed/missing: remain pending and provide reconciliation; never assume failure or success without evidence.
- Duplicate callback: do not duplicate payment or receipt.
- Wrong callback amount/reference: flag for reconciliation and do not mark paid.
- Staff session expired: protect private data and request sign-in again.
- Tablet reused: clear prior cart/session and prevent access to previous customer's information.

## 8. Navigation map
- Customer: Menu → Item → Cart → Submit → Order Status → Bill → Payment.
- Staff: Login → Order Queue → Order Detail → Status Update → Payment/History.
- Restaurant admin: Login → Overview → Menu / Tables / Staff / Orders & Payments / Settings.
- Platform admin: Login → Restaurants / Operational Status / Audit Logs.

## 9. Out of scope flows
Trivia, restaurant-wide games, loyalty rewards, and rotating Wi-Fi credentials are later phases and should not be built as part of the MVP.
