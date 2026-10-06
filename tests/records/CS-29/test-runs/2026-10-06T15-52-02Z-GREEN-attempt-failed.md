# CS-29 Test Execution — 2026-10-06T15:52:02.901Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-attempt-failed. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /evidence/logs/frontend-final-verified.json. Code revision/fingerprint: 53c99b1f5d62f73e3ff371420df3b0dd82bca3af / b938cfa4870ccca0ca8ece6222a16f076953510b47cdeb5fa8115be057ab48d9.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS29-01 | Assertions passed; see scenario and layer limitations | Pass | disables empty Save, enables a single purpose without requiring a title; permits incomplete form actions without native browser mandatory blockers | 2026-10-06T15:52:02.901Z |
| TC-CS29-02 | Assertions passed; see scenario and layer limitations | Pass | saves an incomplete private draft, updates the same ID and submits that record | 2026-10-06T15:52:02.901Z |
| TC-CS29-03 | Assertions passed; see scenario and layer limitations | Pass | preserves the last committed version after validation failure and rejects stale saves | 2026-10-06T15:52:02.901Z |
| TC-CS29-04 | No assertion executed | Not Executed |  | 2026-10-06T15:52:02.901Z |
