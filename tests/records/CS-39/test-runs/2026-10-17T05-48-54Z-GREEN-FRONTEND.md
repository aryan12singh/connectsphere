# CS-39 Test Execution — 2026-10-17T05:48:54.507Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-FRONTEND. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /tmp/final-expanded-frontend-2.json. Code revision/fingerprint: cae6079 plus recorded factual-review delta; final pushed CI independently verifies committed source / expanded-execution-source.json stores per-file SHA-256; source files unchanged during execution.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS39-01 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-02 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-03 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-04 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-05 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-06 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-06 stale persisted conflict flags cannot keep an expired partner occupying the other hold | 2026-10-17T05:48:54.507Z |
| TC-CS39-07 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-07 refuses a conflict acknowledgement or override at approval after a configuration change | 2026-10-17T05:48:54.507Z |
| TC-CS39-08 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-09 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-09 refuses competing occupied windows and leaves exactly one booking/history | 2026-10-17T05:48:54.507Z |
| TC-CS39-10 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-10 a combined Coordinator/Staff role cannot directly create a confirmed booking or override a clash | 2026-10-17T05:48:54.507Z |
| TC-CS39-11 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-11 an operational closure flags inherited holds without cancelling them and releasing it clears the flags | 2026-10-17T05:48:54.507Z |
| TC-CS39-20 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-20 saves notification context with the real booking action so delivery never invents an owner or request ID | 2026-10-17T05:48:54.507Z |
| TC-CS39-21 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-21 exposes current booking proof only to the internal notification consumer | 2026-10-17T05:48:54.507Z |
| TC-CS39-22 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-22 resolves the current Coordinator before delivering an old queued decision and never leaks the staff reason to the Organiser | 2026-10-17T05:48:54.507Z |
| TC-CS39-23 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-24 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-24 rejects malformed array payloads before recording a delivery receipt | 2026-10-17T05:48:54.507Z |
| TC-CS39-25 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-25 suppresses superseded assignment and booking-decision generations before inbox persistence | 2026-10-17T05:48:54.507Z |
| TC-CS39-26 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-27 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-27 concurrent redeliveries with a changed assignment claim one message before inserting notices | 2026-10-17T05:48:54.507Z |
| TC-CS39-28 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-28 Safety submissions alert Officers and technical feedback reaches the relevant staff without private notes | 2026-10-17T05:48:54.507Z |
| TC-CS39-29 | Assertions passed; see scenario and layer limitations | Pass | TC-CS39-29 delayed same-round changes feedback survives Coordinator review and suppresses a superseded round | 2026-10-17T05:48:54.507Z |
| TC-CS39-30 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS39-31 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
