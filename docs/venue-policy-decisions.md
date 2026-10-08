# Venue and operations policy register

CS-76 working register, 9 October 2026. Current Jira remains the full release
decision log. The customer-answer cells in the supplied Week 7 clarification
document are blank; every entry below is **Pending**. Discussion proposals and
test fixtures are not customer acceptance. Session 2 allowed justified team
duration/response choices; the team still needs to record the actual choice.

| Question / topic | Working proposal or open choice | Impact and implementation boundary |
| --- | --- | --- |
| Q2: buffer authority/overrides | Venue Staff; fixed per venue, no per-event overrides | CS-84/85. Pure window calculation accepts explicit values; no access or storage policy added here. |
| Q3: adjacent occupied windows | Forbid overlap; permit exact touching | CS-85/39. `allowTouching` must be explicitly selected; both alternatives are tested. One-second overlap is a conflict under either choice. |
| Q4: buffer-change conflicts | Venue Staff and affected Coordinators; flag/manual resolution, no automatic Event state change | CS-86/51. Recipient list, resolution owner and current-versus-historical bookings need approval. |
| Q8: action completing a hold | Venue Staff booking approval rather than Event confirmation | CS-37/38/90. Prototype approval is a research transition, not an approved production API. |
| Q9: expiry effect | Expire only that booking, retain parent Event planning and equipment | CS-90/31/46. The spike has no Event/equipment write path; final lifecycle effect remains open. |
| Buffer defaults/cap | Draft zero migration default and 480-minute maximum | CS-84/77. No hard-coded default or maximum in the helpers. Select upper bound, migration treatment and recomputation policy explicitly. |
| Operating hours | Entire setup/event/turnaround window may need to fit opening hours | CS-36/39/84/85. Confirm overnight/closed-day handling and exceptions; baseline catalogue rejects overnight opening schedules. |
| Equipment reservation window | Existing zero-buffer rule versus venue occupied window | CS-40/41/42/46. Coordinate with Alan; do not silently extend equipment bookings. |
| Hold duration/extensions | Draft 72-hour default; authority/count/cap unspecified | CS-37/77. Choose duration, extension permissions, rejection behavior and audit/version contract. Fixtures use explicit synthetic deadlines. |
| Hold/setup cap | Draft text has both inclusive `expiresAt <= occupiedStartAt` and strict `expiresAt < occupiedStartAt` | CS-37/85/90. `allowExpiryAtOccupiedStart` is required explicitly; both choices are tested. Expiry must follow creation under either choice. |
| Warning and short/legacy holds | Draft 24-hour lead; short holds and past deadlines need a rule | CS-37/90/50. Explicit lead only. Spike prioritizes expiry over a stale warning and deduplicates each version/type; no production warning channel implemented. |
| Timing targets | Draft one-minute expiry processing, two-minute operational notice | CS-78/79/90/51. Measure before agreeing a target; these are not customer SLAs. Effective occupancy/approval must use the deadline even if the worker is late. |
| Multi-venue timing/attendance | Independent per-booking times, required rooms, attendee display and capacity rule | CS-87/31/47/48. Do not blindly sum room capacities; confirm derived registration capacity and which approvals are required. |
| Replacement/restoration, Q5–Q7 | Public recipients after effective replacement approval; no automatic cancellation; restoration/withdrawal races unresolved | CS-88/91/92/51/52/54. Leave Sprint 4 producer policies on their current owners. |
| Safety, Q1/Q14/Q15 | Safety before Confirmed; significant edits invalidate approval; reason visibility/decision structure provisional | CS-93/94/95/31/45/88/92. Requires CS-77 and technical readiness. No invented Safety enum, role grant or confirmation transition here. |

Q10–Q13 assignment/Lead decisions remain in CS-76/77 with Javier and Marc.
Q16–Q20 account administration remain additional scope questions; they do not
authorize another role or provisioning module. Current role boundaries remain
those in the [access matrix](access-matrix.md).

For each resolved entry record: decision, customer or PO/team decision-maker,
date/source, rationale, affected Jira AC/test IDs, design revision, action owner
and review. Update the canonical Jira decision table and dependent stories as a
separate agreed refinement. Leave answers Pending until that evidence exists.

Sources: [CS-76](https://spmg8.atlassian.net/browse/CS-76),
[CS-77](https://spmg8.atlassian.net/browse/CS-77),
[shared project documents](https://drive.google.com/drive/folders/1C_O1IO-YgUKYeU4bBm0ldiEe9xG6qpGt),
Week 7 Customer Changes.pdf, Clarification Questions.docx, Week 7 change summary.docx
and New Stories AC & Test Cases.docx. These notes cover the venue/operations
subset only; they do not complete the release-wide CS-76 checklist.
