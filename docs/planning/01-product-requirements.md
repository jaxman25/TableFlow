# 01 — Product Requirements Document (PRD)
## Working title: TableFlow
**Status:** Draft for owner review  
**Product:** Multi-restaurant ordering, kitchen coordination, and payment platform  
**Initial market:** Casual-dining restaurants in Kenya  
**Primary users:** Restaurant owners/managers, wait staff, kitchen staff, and diners

## 1. Product vision
Help casual-dining restaurants receive accurate table orders, coordinate service, and collect payments more efficiently. Diners must be able to order from their own phones by scanning a table QR code or use a restaurant-provided tablet. No customer app installation is required.

“TableFlow” is a temporary working name, not a final brand decision.

## 2. Problem to solve
Restaurants may rely on handwritten orders, verbal communication, or disconnected systems. These processes can cause wrong-table orders, delays, billing confusion, and limited visibility into order status.

## 3. MVP goals
1. A diner can identify the correct restaurant/table and place an order.
2. Staff can see new orders with the correct table number and order details.
3. Kitchen/staff can update order status and diners can see progress.
4. The restaurant can manage its menu, tables, and staff access.
5. The system can record staff-assisted payments and later support verified M-Pesa STK Push payments.
6. Data belonging to one restaurant is isolated from all other restaurants.

## 4. Out of scope for the first MVP
- Trivia, solo games, table multiplayer, and restaurant-wide competitions.
- Rotating Wi-Fi passwords or router/network administration.
- Loyalty/rewards, sponsored prizes, inventory management, delivery, reservations, and multi-branch reporting.
- Native Android/iOS customer apps.
- Automated production M-Pesa payments before sandbox testing and business approval.
These may be considered after the core workflow has been validated in a real restaurant.

## 5. User roles and needs
### Diner
- Open the menu from a table QR code or restaurant tablet.
- View categories, prices, availability, and item details.
- Customize items where supported, add notes, review the cart, and submit an order.
- See order status and the bill.
- Choose M-Pesa when enabled or ask staff to handle payment.
- Never be asked to enter or share an M-Pesa PIN in the website.

### Wait staff
- View orders and table numbers.
- See order details and status.
- Help diners and record permitted staff-assisted payment events.
- Never mark an electronic payment successful without verified evidence.

### Kitchen staff
- See new accepted orders and item notes.
- Update preparation status.
- Avoid accidentally completing or duplicating orders.

### Restaurant owner/manager
- Manage menu categories, menu items, prices, availability, tables, QR codes, staff roles, orders, and payment records.
- View basic order and sales summaries.
- Access only their restaurant's data.

### Platform administrator
- Onboard/suspend restaurant accounts and support the service.
- Have explicitly controlled access; privileged actions must be auditable.

## 6. Functional requirements
### Menu and tables
- Each restaurant has its own public menu and settings.
- Each active dining table has a unique table identifier and QR token.
- QR links must not expose sequential internal database IDs or allow a diner to impersonate another restaurant/table by editing a simple number.
- Staff can create, edit, disable, and reorder menu categories/items.
- Unavailable items cannot be ordered.

### Ordering
- The server, not the browser, calculates prices and totals from current trusted menu data.
- Order submission records restaurant, table, items, quantities, item notes, price snapshots, status, and timestamps.
- Repeated clicks/network retries must not create duplicate orders; use an idempotency strategy.
- New orders appear in the staff dashboard in near real time, with a safe refresh/reconnect fallback.
- Status transitions must be validated server-side.
- An order must retain its historical item names and prices after menu changes.

### Billing and payments
- MVP supports recording staff-assisted payments with method, amount, staff actor, timestamp, and verification status.
- M-Pesa integration must use the official Daraja flow, server-side credentials, callbacks, and reconciliation.
- Payment state must be separate from order preparation state.
- Do not mark M-Pesa as paid based only on a browser response, customer screenshot, or unverified request.
- Handle pending, successful, failed, cancelled, timed-out, and duplicate callback cases.
- Never collect or store M-Pesa PINs.
- Design the data model to allow multiple payment records per order, including partial/split payments later, even if full split-bill UX is deferred.

### Access and privacy
- Restaurant users can access only restaurants to which they belong and only within their assigned role permissions.
- Public diners can access only the menu/table/order information necessary for their session.
- Do not expose private customer phone numbers or payment payloads to other diners.
- Log sensitive administrative and payment actions.

## 7. Non-functional requirements
- Mobile-first responsive UI; usable on common Android browsers and tablet screens.
- Clear loading, empty, success, offline/retry, and error states.
- Secure authentication, authorization, validation, and secrets management.
- Database migrations must be tracked in version control.
- Important actions and payment state changes must be auditable.
- Accessibility basics: readable contrast, keyboard navigation for staff dashboards, labels, and meaningful error messages.
- Avoid unnecessary collection of personal data.

## 8. MVP acceptance criteria
- A QR code for Table 4 opens the correct restaurant menu and table context.
- An order submitted for Table 4 appears once in staff view and clearly shows Table 4.
- Changing a menu price does not change existing order-item price snapshots.
- An unavailable item is rejected server-side even if a stale browser page still displays it.
- Restaurant A cannot read or modify Restaurant B's private records.
- Staff can progress an order through valid statuses; invalid transitions are rejected.
- A staff-recorded payment includes actor, amount, method, and status.
- M-Pesa payment is not marked successful until a verified server-side confirmation is processed.
- Errors do not silently discard an order or payment attempt.

## 9. Success measures for the pilot
Measure before/after where possible:
- Percentage of orders correctly associated with a table.
- Order submission-to-staff visibility time.
- Number of duplicate or missing orders.
- Number of order corrections caused by communication mistakes.
- Payment reconciliation accuracy.
- Staff and owner feedback after real service periods.
Do not claim improvements until measured.

## 10. Product decisions requiring owner approval
- Final product name and visual identity.
- Whether diners may add more items to an existing table order or submit separate rounds.
- Whether staff must accept every order before kitchen preparation starts.
- Tax, service charge, discount, and receipt rules per restaurant.
- Whether payment is per order or per table bill in the first release.
- Exact role permissions and whether kitchen users can view prices.
- Pilot restaurant, devices, and success thresholds.
