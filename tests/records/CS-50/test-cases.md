# CS-50 — Test Case Specification (IS212 / IEEE 829)

Story (Jira CS-50): *As an Organiser or Coordinator, I want event and assignment
updates delivered to me so that I know the outcome and what to do next.*

Test IDs and cases follow the PO's sprint test sheet (`sprint_test_case_sheet.xlsx`,
2026-10-17). They replace the older Jira comment table (draft ON-01..08).

**How it works.** event-service writes a domain message to its outbox in the
same transaction as the change. notification-service turns each message into
in-app notices (`POST /internal/messages`, the same code the RabbitMQ consumer
will call). The inbox is the channel of record; email is optional and not built.

| Test Case ID | Scenario | Pre-conditions | Test Steps | Expected Result | Automation | Status |
|---|---|---|---|---|---|---|
| TC-CS50-01 | Organiser told the request was approved | E1 under review, C1 assigned; O1 inbox empty | C1 approves E1; deliver the message; O1 reads inbox | Exactly 1 notice, type `EVENT_APPROVED`, link `/events/E1`, text mentions planning | notification unit + contract `test_cs50_01` + PG; event-service PG `TC-CS50-01e` (message carries organiser, name, event id, statuses) | Pass (2026-10-17) |
| TC-CS50-02 | Reassignment notifies old and new Coordinator and the Organiser | E1 assigned to C1 | Reassign to C2; deliver | C1 `REASSIGNED_AWAY` (no link, they lost access); C2 `ASSIGNED_TO_YOU`; O1 `COORDINATOR_CHANGED` naming C2 | notification unit + contract `test_cs50_02` | Pass |
| TC-CS50-03 | Organiser opens a notice from the bell | 01 state; O1 signed in | Read badge; click bell; click the notice; re-read badge | Badge 1; `/events/E1` opens; badge gone; `readAt` saved on the server | vitest `tests/specs/CS-50.spec.ts`; contract `test_cs50_03`; PG `TC-CS50-01pg/03pg` | Pass |
| TC-CS50-04 | Unrelated users can't see someone else's notice | Notice N1 for O1 | O2 lists inbox; O2 `GET /notifications/N1`; O2 marks it read | Not listed; 404; 404 (nothing changed). Not signed in → 401 | notification unit `TC-CS50-04u` + contract `test_cs50_04` + PG | Pass |
| TC-CS50-05 | Relay replay doesn't duplicate a notice | Message M1 delivered | Deliver M1 again (also 10 in parallel on PostgreSQL) | Still exactly 1 notice; result `duplicate` | notification unit + contract `test_cs50_05` + PG `TC-CS50-05pg`; live: 181 real outbox rows replayed → 0 new | Pass |
| TC-CS50-06 | Failed action sends nothing | E1 rejected | C1 tries to approve | 409; no `RequestApproved` outbox message, so no notice can exist | event-service PG `TC-CS50-06` | Pass |
| TC-CS50-07 | Unread badge cap (placeholder 99+) | 98, 99, 100 unread | `GET /notifications/summary` | "98", "99", "99+" | notification unit + contract `test_cs50_07` | Pass |

## Extra cases (card AC not in the sheet)

| Test Case ID | What it proves | Automation |
|---|---|---|
| TC-CS50-02b | First assignment notifies the new Coordinator and the Organiser (Session 3 rule) | unit |
| TC-CS50-05b | Two separate actions on one event each notify (dedup by message + recipient + type, not by event) | unit |
| TC-CS50-08 | Delivery failure is retried 3 times (4 attempts), then marked Failed; no notice; Technical Support (`audit.view`) sees it without notice text; others get 403 | unit, contract, PG, vitest `TC-CS50-08u`, live |
| TC-CS50-09 | A retry that then succeeds delivers once | unit |
| TC-CS50-10 | Every notice has eventName, requestId, oldStatus, newStatus, timestamp; no internal notes | unit |
| TC-CS50-11 | Read notices kept 30 days after reading, hidden after; unread always shown | unit, PG |
| TC-CS50-12 | Unknown message types ignored; malformed rejected (422); internal endpoint needs the key (403) | unit, contract |

## Not covered yet
- **RabbitMQ relay and consumer.** Waiting for CS-39's exchange/queue names.
  Until then delivery is driven through `POST /internal/messages`. A recorded
  outbox row alone is not proof of end-user delivery (card AC).
- **Lead intake notice (CS-81)** and **Event confirmed (CS-31):** the
  producers don't exist yet. The `EVENT_CONFIRMED` template is ready.
- **Delivery-time target (2 min):** still a proposal on the card, so it is not a pass/fail gate.
