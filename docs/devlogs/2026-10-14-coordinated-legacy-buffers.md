# Buffer locking and coordinated existing bookings — 14 October 2026

Branch: `feat/aryan-sprint3-venue-safety`; phase base `10e4e91`. Source: the PO reply relayed by Aryan, followed by authorization to implement question 1 and reconcile the internal prospective test decisions. The raw Session 3 customer transcript remains unchanged. Question 2 (whether the Coordinator request itself is confirmation) remains pending; no additional confirmation action is invented.

## Delivered

- Ordinary Venue buffers remain editable until the first successful Staff-confirmed booking. The existing precommit concurrency fence remains conservative after an uncertain response. A Staff edit can recover that provisional fence only after Booking proves under its shared venue lock that no booking was ever confirmed there, including moved/cancelled history, and Venue verifies current version and provisional history. Recovery, edit, audit and recheck commit atomically. A real historical confirmation or legacy receipt carrying confirmation proof never becomes an ordinary buffer override. Legacy initialization before any confirmed booking consumes its allowance but clears the blanket freeze; ordinary edits remain available until the first success. Its immutable configuredAfterConfirmation:false receipt also permits recovery of a later interrupted first confirmation, with fresh never-confirmed proof.
- The additive Venue migration grants one initial coordinated configuration only to locked catalogue rows that existed when the original blanket-freeze migration completed. Existing buffer values, IDs, versions and history are retained; later venues do not receive an allowance. The flag is server-owned, false by default and permanently consumed by the guarded operation.
- Staff reads the affected current/future Event commitments, current Coordinator/Organiser pairs and booking versions. Saving requires the exact current set, both communication acknowledgements, a note for each Event, current venue version and a reason. Booking serializes the operation with holds/approvals; Venue saves the settings, immutable communication snapshot, actor/time, allowance consumption and durable recheck together. Missing contacts, stale data, unauthorized actors, repeat use and dependency outages fail closed.
- The communication record is Staff's attestation of actual Staff → Coordinator → Organiser conversations, not independently verified external-message delivery. No messages are sent by this change. Changes to either proposed buffer value clear the form's acknowledgements and notes; refreshed contacts/version clear superseded drafts.
- Existing approvals and history remain. The worker retries current buffer rechecks and flags inherited conflicts on both affected bookings. The live browser test demonstrates this with two already-approved adjacent arrangements and a separate never-confirmed legacy venue that stays editable.
- Internal test reconciliation keeps capacity as a hard physical/hybrid search requirement; no under-capacity partial fallback. Omitted initial hold deadlines use the agreed 72-hour default capped at setup; supplied null/malformed/past deadlines are rejected. Current CS36-03/10 and CS37-14 now match that behavior; original source proposals remain explicitly superseded, with historical execution records retained.
- Thirty-three affected Jira descriptions record PO direction and Q2-only pending wording, preserving existing HTML/media, owners, status, estimates and placement. Published implementation/test/CI evidence is linked in the own-ticket progress comments; no story closure is implied.

## Verification

| Check | Final result |
| --- | --- |
| Node 22.23.3 frontend coverage | 342/342; zero pending/skipped; statements 76.85%, branches 75.28% |
| Reconciled CS36/37/84 real HTTP and UI cases | Included in342/342; final independent CS84 check29/29 |
| Frontend / browser TypeScript | Passed |
| Venue unit / HTTP / actual PostgreSQL | 43/43 · 11/11 · 12/12 |
| Booking unit / HTTP / actual PostgreSQL | 35/35 · 14/14 · 17/17 |
| Actual staged Prisma migration | Pre-freeze allowance granted; later confirmed venue excluded; values, version and history retained |
| PostgreSQL failure/concurrency/reconnect | Injected recheck failure rolls back settings/history/allowance; competing writes produce one success; one audit/recheck persists across reconnect |
| Production build / desktop-mobile / live-service / restart | Passed: 4/4 CS84 browser cases, 11/11 live-service checks, 1/1 restart; zero failures, skips or flaky results |
| Independent audit | One audit P2 and the premature legacy-lock edge reproduced, fixed and independently verified; initial52/52 focused tests, finalCS84 29/29 and historical confirmation HTTP checks; no remaining confirmed P1/P2 in the changed scope |

Behavioral RED records cover the missing legacy path, failed-confirmation recovery, missing form, stale value acknowledgements, unlinked active commitment and explicit null deadline. GREEN records retain actual outcomes. The controlled PostgreSQL fault returns500 as expected and verifies rollback; its diagnostic is not an unexpected product failure.

Earlier diagnostics are retained outside Git, including a final-suite launch that preceded the recreated Event database readiness and was rerun after migration completed: the first full-suite invocation lacked its isolated Event database/session environment; two browser fixture attempts used a Request ID instead of the approved Event ID, then a stale sibling booking version after the first approval recheck. Final fixtures use the correct Event identity and current read versions. No production acceptance assertion was weakened. The benign Playwright NO_COLOR/FORCE_COLOR warning does not affect assertions.

Raw logs and coverage: `/tmp/connectsphere-q1-20261014/`. Final isolated production evidence: `/tmp/connectsphere-q1-verified-live-20261014/evidence/`. Named durable screenshots/database and execution logs are retained under the PROJECT Sprint 3 evidence directory. Raw JSON, coverage and browser trees stay outside Git; compact blue/yellow records and this report are canonical. Hosted CI runs the full unfiltered suite for the pushed commit; its exact SHA/run/final result is recorded on Jira.

## Remaining boundaries

- Only question 2 remains a pending clarification for these policies. Deploy the additive Venue migration with compatible Venue/Booking/UI versions; do not grant allowances manually to later catalogue rows.
- Marc CS-10, Alan CS-42 and Javier CS-77/shared Event contracts still supply the peer foundations for live Safety authorization, technical proof, reviewed rounds/commands/privacy and lifecycle integration. This phase does not complete CS93/94/95 end to end.
- CS50/51 own actual notification delivery; CS90 remains unassigned future expiry/reminder scheduling. Registration/public Event projections remain with their owners.
- Team model/spike review, actual Figma/async adoption, human walkthrough, approved main merge/CI and PO acceptance remain separate gates. No PR is created by this phase.
