# TableFlow — FreeBuff AI handoff

This folder contains the six planning documents based on the checklist in **“Before Anyone Builds Your Site”**:
1. Product Requirements Document (PRD)
2. Technical Requirements Document
3. App Flow
4. Design Brief
5. Database Schema
6. Implementation Plan

**Working name:** TableFlow (not final)  
**Target market:** Casual-dining restaurants in Kenya  
**MVP:** QR and restaurant-tablet ordering, staff/kitchen dashboard, restaurant menu/table/staff management, staff-assisted payment recording, then M-Pesa Daraja sandbox integration.  
**Deferred:** Trivia, restaurant-wide games, loyalty, rotating Wi-Fi credentials, multi-branch features.

## Instructions for FreeBuff AI

Read all six documents before changing code. Treat them as the current project specification, but identify unresolved decisions rather than guessing.

1. Inspect the existing repository and summarize its framework, file structure, current functionality, tests, and risks before editing.
2. Do not overwrite or delete existing work without explaining the impact and obtaining approval.
3. Follow the selected stack: Next.js + TypeScript, PostgreSQL/Supabase, Supabase Auth/RLS/Realtime, Daraja API for M-Pesa, and Vercel deployment unless a documented blocker is found and approved.
4. Implement one stage at a time using `06-implementation-plan.md`.
5. Begin with Stage 1 and Milestone 1. Do not start trivia or Wi-Fi features.
6. Use database migrations. Keep secrets out of source control and provide `.env.example` placeholders only.
7. Treat server-side validation, tenant isolation, payment verification, and idempotency as release-blocking requirements.
8. After each stage, report: files changed, behavior implemented, commands/tests run, test results, remaining issues, and decisions needed.
9. Do not claim something works unless you ran the relevant checks. If blocked, report the exact blocker and safest next step.
10. Stop at each stage's acceptance criteria and ask for owner review before moving to the next stage.

## Current decisions and open questions

Decided:
- Casual-dining restaurants are the initial market.
- Customers can order using table QR codes or restaurant-provided tablets.
- Initial payment paths are M-Pesa and staff-assisted payment.
- The first milestone excludes real-money payments and focuses on the working order flow.
- Trivia and rotating Wi-Fi are later phases.

Needs owner approval before relevant implementation:
- Final product name/logo/domain.
- Individual order versus one shared table bill.
- Tax, service charge, discounts, and receipt rules.
- Whether staff must accept an order before kitchen preparation.
- Exact role permissions and pilot restaurant.
