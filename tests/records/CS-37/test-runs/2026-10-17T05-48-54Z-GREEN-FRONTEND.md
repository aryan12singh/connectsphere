# CS-37 Test Execution — 2026-10-17T05:48:54.507Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-FRONTEND. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /tmp/final-expanded-frontend-2.json. Code revision/fingerprint: cae6079 plus recorded factual-review delta; final pushed CI independently verifies committed source / expanded-execution-source.json stores per-file SHA-256; source files unchanged during execution.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS37-01 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-02 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-03 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-04 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-05 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-06 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-07 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-08 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-09 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-10 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-10 creates an independently identified hold with a persisted future deadline and occupied window | 2026-10-17T05:48:54.507Z |
| TC-CS37-11 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-11 lets Venue Staff extend an active hold once with deadline history and a version guard | 2026-10-17T05:48:54.507Z |
| TC-CS37-12 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-13 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-14 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-14 derives an omitted deadline but refuses null, malformed or past supplied deadlines without writes | 2026-10-17T05:48:54.507Z |
| TC-CS37-15 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-16 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-16 derives the default from the admission clock and caps it at setup (47h gap); TC-CS37-16 derives the default from the admission clock and caps it at setup (72h gap); TC-CS37-16 derives the default from the admission clock and caps it at setup (73h gap) | 2026-10-17T05:48:54.507Z |
| TC-CS37-17 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-18 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-19 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-19 saves one durable request intent alongside the hold | 2026-10-17T05:48:54.507Z |
| TC-CS37-20 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-20 refuses an Event outside Planning without saving a hold | 2026-10-17T05:48:54.507Z |
| TC-CS37-21 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-21 failed move preserves both rooms and a successful move releases only its old room | 2026-10-17T05:48:54.507Z |
| TC-CS37-22 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-22 rejects a setup window outside operating hours without any hold | 2026-10-17T05:48:54.507Z |
| TC-CS37-23 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-23 rejects malformed or forbidden per-booking overrides: facilities=null; TC-CS37-23 rejects malformed or forbidden per-booking overrides: facilities=PROJECTOR; TC-CS37-23 rejects malformed or forbidden per-booking overrides: accessibilityNeeds={}; TC-CS37-23 rejects malformed or forbidden per-booking overrides: required=false; TC-CS37-23 rejects malformed or forbidden per-booking overrides: setupMinutes=0; TC-CS37-23 rejects malformed or forbidden per-booking overrides: startAt=2026-12-21T02:00:00 | 2026-10-17T05:48:54.507Z |
| TC-CS37-24 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-24 keeps a Staff-approved extension when the Coordinator edits a title | 2026-10-17T05:48:54.507Z |
| TC-CS37-25 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-25 an expired hold does not prevent venue deletion eligibility while its row/history stay intact | 2026-10-17T05:48:54.507Z |
| TC-CS37-26 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-26 requires a current Coordinator request before Staff may approve a single bounded extension; TC-CS37-26 the actual calendar removes a fetched hold at its deadline without waiting for a worker or navigation | 2026-10-17T05:48:54.507Z |
| TC-CS37-27 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-27 rejects excessive, expired, stale and unauthorized extension requests without changing the hold | 2026-10-17T05:48:54.507Z |
| TC-CS37-28 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-28 creates one immediate warning intent for a short hold and deduplicates request replay | 2026-10-17T05:48:54.507Z |
| TC-CS37-29 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS37-30 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-30 an unassigned dual-role actor cannot overwrite the assigned Coordinator extension request | 2026-10-17T05:48:54.507Z |
| TC-CS37-31 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-31 re-requesting a rejected room within 24 hours creates an immediate warning for its new hold | 2026-10-17T05:48:54.507Z |
| TC-CS37-33 | Assertions passed; see scenario and layer limitations | Pass | TC-CS37-33 a conflicting time edit preserves both original commitments and all business effects | 2026-10-17T05:48:54.507Z |
