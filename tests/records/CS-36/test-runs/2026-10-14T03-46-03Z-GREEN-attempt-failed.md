# CS-36 Test Execution — 2026-10-14T03:46:03.483Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-attempt-failed. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /tmp/connectsphere-session3-20261014/final-focused.json. Code revision/fingerprint: see outside run metadata; early diagnostic not fingerprinted / not supplied.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS36-01 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-02 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-03 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-04 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-05 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-06 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-07 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-08 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-09 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-09 expired holds stop occupying the calendar and search at the exact persisted deadline | 2026-10-14T03:46:03.483Z |
| TC-CS36-10 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-11 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
| TC-CS36-12 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-12 sorts full before partial and excludes inactive, small and occupied rooms without reserving | 2026-10-14T03:46:03.483Z |
| TC-CS36-13 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-13 uses current assignment and refuses a search by another Coordinator | 2026-10-14T03:46:03.483Z |
| TC-CS36-14 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-14 exposes busy intervals without another customer’s title, notes or internal flags | 2026-10-14T03:46:03.483Z |
| TC-CS36-15 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-15 respects the Event minimum capacity and venue type while a smaller breakout is independently assessed | 2026-10-14T03:46:03.483Z |
| TC-CS36-16 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-16 preserves the explicit no-accessibility-needs marker without inventing a required facility | 2026-10-14T03:46:03.483Z |
| TC-CS36-17 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-17 per-room filters cannot silently drop mandatory Event accessibility needs | 2026-10-14T03:46:03.483Z |
| TC-CS36-18 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-18 lets read-only support identify an operational closure without exposing staff notes or write access | 2026-10-14T03:46:03.483Z |
| TC-CS36-19 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-19 read projections use the deadline after a slow venue lookup, including calendar, search and Event summary | 2026-10-14T03:46:03.483Z |
| TC-CS36-20 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-20 alternative search keeps the individual booking needs and excludes its original venue without writes | 2026-10-14T03:46:03.483Z |
| TC-CS36-21 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-21 a deleted venue with fully ended confirmations cannot break the future availability calendar | 2026-10-14T03:46:03.483Z |
| TC-CS36-22 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-22 legitimate deletion against a historical shorter-turnaround snapshot ignores the old booking snapshot | 2026-10-14T03:46:03.483Z |
| TC-CS36-23 | Assertions passed; see scenario and layer limitations | Pass | TC-CS36-23 venue maintenance during checked deletion requires a fresh deletion check | 2026-10-14T03:46:03.483Z |
| TC-CS36-30 | No assertion executed | Not Executed |  | 2026-10-14T03:46:03.483Z |
