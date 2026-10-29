# 04 — Design Brief
## Working title: TableFlow
**Status:** Visual direction proposed; final name, logo, and palette require owner approval.

## 1. Design objective
Create a trustworthy, fast, hospitality-focused interface that feels like a real restaurant product, not a generic AI-generated dashboard. The customer interface should make ordering effortless; staff interfaces should prioritize speed, clarity, and visibility under busy service conditions.

## 2. Brand direction
- Working name: **TableFlow** (temporary).
- Brand traits: welcoming, efficient, clear, reliable, modern.
- Avoid: excessive gradients, glassmorphism everywhere, oversized empty hero sections in operational screens, decorative animations, emoji-heavy UI, and inconsistent components.
- Do not invent a final logo or present the working name as approved branding.

## 3. Proposed visual system
Use these as initial tokens, subject to owner review:
- Primary: deep forest green `#176B52`.
- Text: near-black `#17211D`.
- Background: warm off-white `#F7F8F5`.
- Surface: white `#FFFFFF`.
- Border: soft neutral `#DDE4DE`.
- Success: accessible green.
- Warning: amber with readable text.
- Error: dark red with clear text.
- Font: Inter or a similar legible sans-serif; use one type family consistently.
- Rounded corners: moderate (8–12 px), not pill-shaped for every element.
- Use consistent spacing, typography scale, focus states, and button hierarchy.

## 4. Customer experience
- Mobile-first, quick-loading, and usable on modest Android devices and connections.
- Put restaurant name and table context where diners can see them.
- Make prices, availability, quantity controls, cart total, and order confirmation obvious.
- Keep the primary action prominent: “Add to cart,” “Review order,” or “Place order.”
- Avoid forcing account creation for basic ordering unless a confirmed business requirement requires it.
- Clearly show pending/success/failure states.
- Do not ask for M-Pesa PINs or imitate the provider's PIN screen.
- Provide readable item notes, clear errors, and an easy way to ask staff for help.

## 5. Staff and kitchen dashboard
- Desktop/tablet-first with responsive layouts.
- Use a high-contrast order queue with large table numbers, order age, status, item counts, and notes.
- Distinguish statuses using text plus color, not color alone.
- New orders must be visually obvious without disruptive animation or sound by default.
- Keep frequent actions reachable with minimal clicks.
- Prevent accidental completion/cancellation through confirmation where appropriate.
- Provide clear connection status and last-updated indicators.

## 6. Restaurant admin
- Consistent sidebar/top navigation and page titles.
- Tables should support search/filter and clear empty states.
- Forms should group related fields and validate inline.
- Price and availability editing must be obvious.
- Destructive actions require confirmation.
- Reports must label date ranges and distinguish order totals from verified payments.

## 7. Components to standardize
Buttons (primary/secondary/danger), text inputs, phone input, selects, item cards, quantity controls, cart rows, status badges, order cards, tables, dialogs, toast/inline alerts, loading skeletons, empty states, error states, confirmation dialogs, and pagination/filter controls.

## 8. Responsive behavior
- Customer menu: one-column mobile layout; cart remains easy to access.
- Staff queue: card-based layout on narrow screens, denser columns on large screens.
- Admin: sidebar collapses on small screens; forms remain usable on tablets.
- Touch targets should be comfortably sized; avoid tiny icons as the only action controls.

## 9. Accessibility and usability
- Maintain readable contrast and visible keyboard focus.
- Use labels and accessible names for controls.
- Do not convey payment/order status by color alone.
- Support keyboard operation for staff screens.
- Respect reduced-motion preferences and keep animations purposeful.
- Use meaningful error messages and preserve user input when safe.

## 10. Required design deliverables
Before implementing each screen, FreeBuff should define:
- Screen purpose and primary user.
- Layout hierarchy and main action.
- Loading, empty, error, and success states.
- Mobile/tablet/desktop behavior.
- Reused components and relevant design tokens.
- Accessibility considerations.
Do not create extra screens or branding concepts without a product requirement.
