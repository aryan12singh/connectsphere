# Agreed venue policies — 14 October 2026

Branch: `feat/aryan-sprint3-venue-safety`; phase base `6529635`. Aryan accepted policy proposals 3–6 in the project discussion. The [policy register](../venue-policy-decisions.md) records those rules; the [customer transcript](../session3-decisions.md) remains unchanged. Questions 1–2 (initial buffer lock/legacy configuration and the Coordinator confirmation action) remain pending customer clarification.

## Delivered

- CS-37/38: current assigned Coordinator requests a versioned hold extension; Staff approves its exact requested deadline with a reason. The allowance is one extension, at most 24 additional hours, capped at setup. Request alone does not extend occupancy. Stale, expired, excessive and unauthorized operations leave state unchanged. A dual Coordinator/Staff role does not bypass current assignment.
- Extension request/count, activity and outbox persist atomically under the existing Event/venue locks. Reconnect preserves them; competing approvals spend the allowance once. Arrangement edits invalidate pending requests; a new Coordinator must submit their own request. The additive migration backfills already-used allowances from retained extension intents without changing historical deadlines, versions or history.
- Short initial holds, re-requested holds and shortened deadlines within 24 hours queue an immediate Coordinator warning intent. Request replay and unchanged-deadline edits do not duplicate it. Scheduled expiry/reminder processing and actual notice delivery remain CS-90/50/51; this phase does not claim those jobs are deployed.
- CS-87/93: Event summary validates required-room headcounts separately for each simultaneous booked interval. An 80-person plenary followed by 40/40 breakouts remains 80 people. Shortages or excess allocations block venue readiness and appear in the Coordinator/Safety preparation UI, without resetting room approvals. Break/travel gaps are not inferred to be venue sessions. Public registration enforcement remains owned by the Event/attendance services.
- CS-84: existing independent 0–480 whole-minute defaults are now an agreed configurable team limit. Existing boundary/invalid-value checks remain in force; the initial lock point is still unresolved.
- Twenty-one Jira descriptions now record applicable policies 3–6 and explicitly retain questions 1–2. Owners/statuses were verified unchanged. Lead scope, cross-scope handover and registration contracts are recorded for peer implementation; no peer service was modified.

## Verification

| Check | Result |
| --- | --- |
| Node 22.23.3 frontend coverage suite | 335/335; statements 76.48%, branches 74.93% |
| Frontend and browser TypeScript | Passed |
| Booking unit / HTTP / PostgreSQL | 35/35; 14/14; 17/17 |
| Legacy migration probe | Actual preceding SQL + existing records + new migration; spent/unused allowances, deadlines, versions and history retained |
| Independent audit | Two P2 findings reproduced with RED tests, fixed and independently rechecked; no remaining P1/P2 in this changed scope |
| Production build / focused desktop-mobile / live smoke / restart | Passed: production build, 4/4 changed-workflow desktop/mobile checks, 11/11 live-service checks and 1/1 restart check; no skips or flaky results |

Tests follow the changed policies: TC-CS37-11/24 now include the required Coordinator request; TC-CS87-01 uses disjoint 80/40/40/40 parallel allocations for 200 attendees. Assertions were reconciled with the agreed requirement, not weakened to bypass it. New cases are CS37-26–31, CS38-18 and CS87-28–29. Dated RED/GREEN records retain actual outcomes; the PostgreSQL record is compiled from the actual Node TAP log.

Early diagnostic runs used system Node 26 because a previous temporary Node 22 installation had been removed. Final suite, typechecks, service tests and production/browser verification were rerun with an explicitly checked Node 22.23.3 runtime. The browser runner may print the benign Playwright NO_COLOR/FORCE_COLOR environment warning; it does not affect assertions.

Raw evidence: `/tmp/connectsphere-policy-20261014/`; isolated production stack: `/tmp/connectsphere-policy-live-20261014/evidence/`. The local production runner is an external copy of the standard CI runner with an explicit repository root and `CS-87.spec.ts` filter; it retains the production build, eleven live-service checks and restart smoke. Hosted CI runs the complete unfiltered suite for the published commit. Full JSON, coverage trees and browser media remain outside Git or in CI artifacts.

## Remaining gates

- Customer questions 1–2 remain open. Existing conservative buffer protections are retained.
- CS-90 is unassigned future scheduler work; CS-50/51 own notification delivery and must resolve the current recipient and suppress stale deadline messages.
- Shared Event/attendance owners must persist/enforce the single registration limit against reviewed attendance; Lead owners implement supervisory scopes and cross-scope handover.
- CS-10/42/77 still supply authoritative Officer access, versioned Safety commands, technical proof, server-side redaction and the Event lifecycle. This phase does not complete end-to-end Safety approval.
- Deploy the Booking migration with its compatible service/UI. Team review, integration, main merge and PO acceptance remain separate; no PR is opened by this phase.
