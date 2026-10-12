# Venue and operations policy register

CS-76 working register, refreshed 12 October 2026. The latest shared Week 7 clarification answer cells remain blank. Every decision below remains **Pending** customer/team confirmation. The implemented settings make the independent venue phase runnable; they do not turn discussion proposals or test fixtures into customer acceptance.

| Topic | Current working setting / implementation | Decision or remaining boundary |
| --- | --- | --- |
| Q2 buffer authority | Venue Staff configures fixed per-Venue whole minutes; event callers cannot override them | Confirm authority, defaults and exceptions; CS-84/77 |
| Q3 touching intervals | `VENUE_ALLOW_TOUCHING=true`; positive overlap is always refused | Confirm half-open boundary; both alternatives have domain tests |
| Buffer cap | Zero migration/default; `MAX_VENUE_BUFFER_MINUTES=480`, configurable | Confirm upper bound and legacy treatment |
| Opening hours | Entire occupied interval fits current venue-local hours; overnight schedules remain unsupported | Confirm any overnight/closed-day exceptions |
| Q4 configuration changes | Save permitted changes, retain bookings, durable recheck and flag/manual resolution; no automatic Event state change | Confirm recipients/resolution owner; CS-86/51 |
| Q8 hold completion | Venue Staff approval turns that active hold into a confirmed venue booking | Confirm completion action separately from parent Event confirmation |
| Hold duration | `VENUE_HOLD_HOURS=72`; default capped at occupied setup start | Confirm duration; legacy migration uses a fixed 72-hour treatment |
| Extensions | Venue Staff only, version/reason required, active hold only, later deadline capped at setup; no expiry resurrection | Confirm count/authority policy; current implementation has no extension-count cap |
| Setup cap | `VENUE_ALLOW_EXPIRY_AT_SETUP=true`; strict mode caps one millisecond earlier | Confirm inclusive versus strict wording; creation must precede expiry |
| Q9 expiry effect | Deadline immediately removes only that hold's occupancy and prevents approval; parent Event/equipment are unchanged | CS-90 scheduler/audited expiry and CS-50/51 notice delivery remain pending |
| Warnings and timing targets | Research spike supports explicit warning lead, deduplication and catch-up | No production reminders or customer processing SLA claimed |
| Multi-room needs | Independent times/attendance; all current non-cancelled arrangements required; no capacity sum | Confirm required/optional rooms and attendee/registration capacity |
| Requirement labels | Map existing request-form labels to known catalogue codes; retain unknown needs as unmet | Free-text notes need Staff assessment; broadened catalogues/layouts require reviewed scope |
| Equipment window | No change to equipment reservations or technical approval | Alan owns CS-40/41/42/46; cannot infer NOT_REQUIRED from empty arrays |
| Safety Q1/Q14/Q15 | Brief requires current Safety review before preparation; exact confirmation ordering, edits/rework/visibility remain open | CS-10/42/77 and CS-93/94/95; no invented role or parent transition |
| Replacement/restoration Q5–Q7 | Retain existing commitments; no automatic cancellation or public replacement notices | Sprint 4 producer decisions stay with CS-88/91/92/51/52/54 |

The production recheck poll defaults to `RECHECK_POLL_MS=5000`. It retries durable private configuration-change intent; it is not the hold expiry worker or a RabbitMQ notification relay.

Q10–Q13 assignment/Lead choices remain with Javier and Marc through CS-76/77. Q16–Q20 account administration remain additional scope questions. Current public role boundaries remain in the [access matrix](access-matrix.md).

For each resolved entry record the decision-maker, date/source, rationale, affected Jira AC/test IDs, design revision, owner and review in canonical Jira. Then refine dependent implementation and tests together. Do not fill customer answer cells from these assumptions.

Sources: [CS-76](https://spmg8.atlassian.net/browse/CS-76), [CS-77](https://spmg8.atlassian.net/browse/CS-77), [shared project documents](https://drive.google.com/drive/folders/1C_O1IO-YgUKYeU4bBm0ldiEe9xG6qpGt), Week 7 Customer Changes.pdf, Clarification Questions.docx, Week 7 change summary.docx and New Stories AC & Test Cases.docx.
