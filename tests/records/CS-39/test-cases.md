# CS-39 — Test Case Specification (IS212 / IEEE 829)

## 13 October production browser evidence

Date of Creation: 2026-10-13T21:11:00+08:00. TC-CS39-30 covers concurrent request winner. Preconditions and steps: Two simultaneous requests for one buffered slot through live BFF; inspect owned fixture rows. Expected result: One200 and one409; exactly one saved booking; Coordinator page and PostgreSQL proof. Run desktop/mobile on the isolated production stack. Screenshots and captured query results remain CI/Jira evidence. Explicit fixture setup is labelled; this case does not establish unimplemented inbox delivery, whole-Event Safety transitions, customer policy approval or human acceptance.

Blue section. Date of Creation: 2026-10-12T19:13:47+08:00. Reconciled 12 October 2026.

Source: [CS-39](https://spmg8.atlassian.net/browse/CS-39), live acceptance criteria and PM supplemental tables. Source cases retain their IDs and intent. Additional cases below cover observed integration regressions. These are specifications, not execution results; dated yellow records report only the assertions and layers actually run. Passing a related check does not execute the source's browser, message-delivery, parent transition or manual/PO steps.

Current contract, reconciled 17 October 2026: use the actual Planning Event ID, `TENTATIVELY_HELD` for the Coordinator request and `CONFIRMED` for Venue Staff approval of that booking. Validation uses422 `error.fields`; decisions/extensions require the read version and reason. The [policy register](../../../docs/venue-policy-decisions.md) records the customer answers, PO buffer direction and agreed team settings. Q2 is resolved: no extra Coordinator venue-confirmation action; whole-Event confirmation remains separate. Original source examples and dated results below remain historical.

| Test Case ID | Scenario / AC | Pre-conditions | Test steps / data | Expected result / assertions | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS39-01 | Overlap flagged before decision (DO AC1; DO-01) | B1 APPROVED 10:00–12:00; B2 PENDING 11:00–13:00 at V1 | 1) GET /venue-bookings/B2 as VS1; — | conflicts contains B1; A1 assertIn("B1", [c["bookingId"] for c in res.json()["conflicts"]]) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-02 | Approved booking used in later checks (DO AC4; DO-02) | B3 approved; B4 overlaps B3 | 1) GET B4; — | conflicts contains B3; A1 assertIn("B3", conflict_ids("B4")) | Happy path · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-03 | Conflict is a hard block even after acknowledgement (DO AC2; DO-03) | DO-01 state; VS1 on B2 | Attempt approval of the conflicting new commitment, with and without an acknowledgement/override payload.; — | 409 conflict; neither acknowledgement nor override creates a new overlapping commitment; original booking remains.; Assert both attempts are rejected; assert no new effective commitment, history or success outbox; original arrangement unchanged. | Workflow · E2E | 2026-10-12T19:13:47+08:00 |
| TC-CS39-04 | Search, calendar, approval agree (DO AC1 (+W7); DO-04 (New W7)) | B1 at V1 | 1) Search 12:30–13:30 2) Calendar at 12:40 3) GET new booking conflicts; — | All report conflict with B1; A1 assertNotIn("V1", search_ids) A2 assertEqual(status_at("V1","12:40"), "CONFIRMED") A3 assertListEqual(conflict_ids("B_new"), ["B1"]) | Cross-cutting · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-05 | Clash only because of turnaround (DO AC1 (+W7); DO-05 (New W7)) | V45 (0/45): B1 10:00–12:00, B2 12:30–14:00 | 1) GET B2; — | Conflict with B1; A1 assertListEqual(conflict_ids("B2"), ["B1"]) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-06 | Only an expired hold overlaps (DO AC3 (+W7); DO-06 (New W7)) | H_exp expired; B5 over it | 1) GET B5; — | No conflicts; A1 assertListEqual(conflict_ids("B5"), []) | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-07 | Conflict cannot be overridden through the API (DO AC2; DO-07) | DO-01 state | Attempt approval of the conflicting new commitment, with and without an acknowledgement/override payload.; — | 409 conflict; neither acknowledgement nor override creates a new overlapping commitment; original booking remains.; Assert both attempts are rejected; assert no new effective commitment, history or success outbox; original arrangement unchanged. | Negative · Integration | 2026-10-12T19:13:47+08:00 |
| TC-CS39-08 | Window ends 12:45; new starts 12:44, 12:45, 12:46 (DO AC3 (+W7); DO-08 (New W7)) | 3 fixtures | 1) GET conflicts for each; — | Flagged, not, not; A1 assertListEqual(conflict_ids(at("12:44")), ["B1"]) A2 assertListEqual(conflict_ids(at("12:45")), []) A3 assertListEqual(conflict_ids(at("12:46")), []) | Boundary · Integration | 2026-10-12T19:13:47+08:00 |

## Derived integration cases

| Test Case ID | Scenario | Pre-conditions | Test steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- | --- |
| TC-CS39-09 | Parallel occupied-window commitments | Two eligible requests for same Venue/time | Submit concurrently with distinct idempotency keys | One201/one409; one booking/activity/request intent | HTTP / memory and PostgreSQL | 2026-10-12T19:13:47+08:00 |
| TC-CS39-10 | Combined-role direct-confirmation bypass | Caller has Coordinator and Venue Staff roles | Create ordinary booking with CONFIRMED or conflict override | 403; no direct-confirmed record or overridden commitment | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |
| TC-CS39-11 | Operational closure and explicit release | Existing independent holds | Staff closes an overlapping interval, then releases it | Flag affected records without cancelling them; release clears managed flags | Real HTTP / memory | 2026-10-12T19:13:47+08:00 |

## Session 3 fixture reconciliation — 14 October 2026

Customer rows4/6 prohibit later buffer edits. Regression fixtures requiring old inconsistent buffer/booking snapshots now seed explicit isolated historical data; they do not exercise or endorse a public post-confirmation buffer edit. Recheck, conflict, immutability and deletion assertions remain. CS-36-23 now verifies deletion CAS using permitted name maintenance. The new buffer denial/fence cases are TC-CS84-31 through34. Dated earlier execution records are unchanged.

## Notification integration — 17 October 2026

| Test Case ID | Scenario | Preconditions and steps | Expected result | Required layer | Date of Creation |
| --- | --- | --- | --- | --- | --- |
| TC-CS39-20 | Durable booking notification context | Create a real Planning Event and venue; request a hold; inspect its transactional intent; retry an overlapping request | Real request ID, organiser, current Coordinator, Event/venue names and timestamp saved together; rejected action creates no extra booking or message | Real HTTP / isolated repositories | 2026-10-17T10:28:00+08:00 |

| TC-CS39-21 | Consumer current-booking projection | Create a hold, read notification context without/with internal key | Unauthorized denied; authorized response contains current identity/status/deadline/version/flags and no private reason | Real HTTP / isolated repositories | 2026-10-17T10:40:00+08:00 |
| TC-CS39-22 | Reassignment privacy at delivery | Queue a rejected-booking decision naming a former Coordinator; source projection names current Coordinator | Only current Coordinator and owner receive it; staff reason withheld from Organiser | Consumer / real repository with isolated source projection | 2026-10-17T10:40:00+08:00 |

| TC-CS39-23 | Real booking to broker to persisted inbox | Disposable PG/RabbitMQ/Kong/Keycloak stack; real account login, submit/approve request, create venue/hold and same-key replay | One transactional intent; corresponding stable message ID arrives in Staff inbox and notification DB exactly once | Real authentication, HTTP, PG16 and AMQP | 2026-10-17T10:46:00+08:00 |

| TC-CS39-24 | Poison envelope validation | Deliver a message whose payload is an array | 422 and no receipt or inbox write | Delivery boundary | 2026-10-17T10:42:00+08:00 |

| TC-CS39-25 | Superseded queued actions | Current source assignment differs from queued assignment; latest rejected booking decision is a later generation | Neither old action is delivered with invented/current replacement facts or an obsolete reason | Consumer / independently controlled HTTP source | 2026-10-17T10:45:00+08:00 |
| TC-CS39-26 | Actual hold expiry notice | Create a real five-second hold and wait for expiry on the isolated production stack | Current Coordinator receives one HOLD_EXPIRED; equipment untouched | Real authentication, HTTP, PG16 and AMQP worker | 2026-10-17T10:45:00+08:00 |

| TC-CS39-27 | Concurrent reassignment during duplicate delivery | Two deliveries resolve different current owners before either saves | Only one delivery claims the message; one Staff recipient, one processed and one duplicate result | Real delivery/repository race | 2026-10-17T10:46:00+08:00 |

### TC-CS39-28 — Safety domain message routing and privacy
Date of Creation: 2026-10-17T03:17:00Z
Steps: deliver SafetySubmitted and SafetyChangesRequested with TECHNICAL area through actual notification templates and active-role directory adapter.
Expected: Officer receives current-round link; Technical Support receives applicable feedback; private Safety notes never appear.


## Integrated acceptance additions — 2026-10-17T03:53:21+00:00

These cases supplement the preserved earlier specifications. Current contracts and the Session 3/PO precedence remain authoritative. Browser IDs can cover several linked story assertions; matching numeric suffixes in the shared sheet do not imply identical scenarios.

| Test Case ID | Requirement / expected result | Execution layer and precondition |
|---|---|---|
| TC-CS39-31 | Actual outage and producer restart retain the outbox intent; confirmed retry creates one inbox item; replay is deduplicated; unroutable publish fails; malformed payload goes to DLQ. | Actual disposable Kong, Keycloak, PostgreSQL and RabbitMQ; opt-in CS_BUS_FAULT_ACCEPTANCE=1. |
