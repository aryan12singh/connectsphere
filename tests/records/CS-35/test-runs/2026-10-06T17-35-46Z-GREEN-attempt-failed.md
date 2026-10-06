# CS-35 Test Execution — 2026-10-06T17:35:46.997Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-attempt-failed. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /evidence/frontend-green.json. Code revision/fingerprint: see outside run metadata; early diagnostic not fingerprinted / not supplied.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS35-01 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-01 preserves a valid BLOCKED status and required reason | 2026-10-06T17:35:46.997Z |
| TC-CS35-02 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-02 prefills an empty-slot draft without performing a mutation | 2026-10-06T17:35:46.997Z |
| TC-CS35-03 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-03 hides block creation when the Coordinator lacks decision authority | 2026-10-06T17:35:46.997Z |
| TC-CS35-04 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-04 rejects an end time before the start time with field guidance | 2026-10-06T17:35:46.997Z |
| TC-CS35-05 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-05 warns about affected bookings but lets a BLOCKED interval continue | 2026-10-06T17:35:46.997Z |
| TC-CS35-06 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-06 rejects a normal booking inside a blocking interval before it posts | 2026-10-06T17:35:46.997Z |
| TC-CS35-07 | Assertions passed; see scenario and layer limitations | Pass | TC-CS35-07 rejects equal times and accepts a one-minute block | 2026-10-06T17:35:46.997Z |
