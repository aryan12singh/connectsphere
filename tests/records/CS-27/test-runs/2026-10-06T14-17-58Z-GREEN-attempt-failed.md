# CS-27 Test Execution — 2026-10-06T14:17:58.967Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-attempt-failed. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /tmp/connectsphere-vitest-1791296276132.json. Code revision/fingerprint: 53c99b1 / not supplied.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS27-01 | Assertions passed; see scenario and layer limitations | Pass | shows escaped return comments beside the form and separate Save/Resubmit controls; shows every field error and ties messages to controls | 2026-10-06T14:17:58.967Z |
| TC-CS27-02 | Assertions passed; see scenario and layer limitations | Pass | keeps ID/coordinator, return baseline across saves, comments and one concurrent resubmission | 2026-10-06T14:17:58.967Z |
| TC-CS27-03 | Assertions passed; see scenario and layer limitations | Pass | denies wrong owner and invalid resubmission, and locks rejected requests | 2026-10-06T14:17:58.967Z |
