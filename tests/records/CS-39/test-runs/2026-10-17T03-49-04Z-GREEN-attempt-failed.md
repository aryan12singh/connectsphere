# CS-39 Test Execution — 2026-10-17T03:49:04.904Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-attempt-failed. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /var/folders/0w/gnktxrm941n4p1q_qt1pgjsw0000gp/T/connectsphere-vitest-1792208943478.json. Code revision/fingerprint: see outside run metadata; early diagnostic not fingerprinted / not supplied.

Actual outbox/broker outage/restart/replay/dead-letter and before-commit PG maintenance barrier

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS39-01 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-02 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-03 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-04 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-05 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-06 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-06 stale persisted conflict flags cannot keep an expired partner occupying the other hold | 2026-10-17T03:49:04.904Z |
| TC-CS39-07 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-07 refuses a conflict acknowledgement or override at approval after a configuration change | 2026-10-17T03:49:04.904Z |
| TC-CS39-08 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-09 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-09 refuses competing occupied windows and leaves exactly one booking/history | 2026-10-17T03:49:04.904Z |
| TC-CS39-10 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-10 a combined Coordinator/Staff role cannot directly create a confirmed booking or override a clash | 2026-10-17T03:49:04.904Z |
| TC-CS39-11 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-11 an operational closure flags inherited holds without cancelling them and releasing it clears the flags | 2026-10-17T03:49:04.904Z |
| TC-CS39-20 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-20 saves notification context with the real booking action so delivery never invents an owner or request ID | 2026-10-17T03:49:04.904Z |
| TC-CS39-21 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-21 exposes current booking proof only to the internal notification consumer | 2026-10-17T03:49:04.904Z |
| TC-CS39-22 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-22 resolves the current Coordinator before delivering an old queued decision and never leaks the staff reason to the Organiser | 2026-10-17T03:49:04.904Z |
| TC-CS39-23 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-23 a real booking action delivers a persisted staff notice through RabbitMQ | 2026-10-17T03:49:04.904Z |
| TC-CS39-24 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-24 rejects malformed array payloads before recording a delivery receipt | 2026-10-17T03:49:04.904Z |
| TC-CS39-25 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-25 suppresses superseded assignment and booking-decision generations before inbox persistence | 2026-10-17T03:49:04.904Z |
| TC-CS39-26 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-26 hold expiry produces an actual current Coordinator notice without releasing equipment | 2026-10-17T03:49:04.904Z |
| TC-CS39-27 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-27 concurrent redeliveries with a changed assignment claim one message before inserting notices | 2026-10-17T03:49:04.904Z |
| TC-CS39-28 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-28 Safety submissions alert Officers and technical feedback reaches the relevant staff without private notes | 2026-10-17T03:49:04.904Z |
| TC-CS39-29 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-29 delayed same-round changes feedback survives Coordinator review and suppresses a superseded round | 2026-10-17T03:49:04.904Z |
| TC-CS39-30 | No assertion executed | Not Executed |  | 2026-10-17T03:49:04.904Z |
| TC-CS39-31 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-31 actual broker outage, producer restart, confirmed retry, duplicate replay, mandatory return and malformed dead letter | 2026-10-17T03:49:04.904Z |
