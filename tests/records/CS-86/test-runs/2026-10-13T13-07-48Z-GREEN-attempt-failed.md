# CS-86 Test Execution — 2026-10-13T13:07:48.702Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-attempt-failed. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /tmp/connectsphere-s3-20261013-phase4/frontend-full.json. Code revision/fingerprint: c49541b-working / not supplied.

Full frontend regression with real service handlers and independent Safety component projections. Safety component intents do not establish backend role authorization, transitions, durable review/rework or inbox delivery.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS86-01 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-01 flags both approved bookings after a buffer increase and clears them idempotently on resolution | 2026-10-13T13:07:48.702Z |
| TC-CS86-02 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-03 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-03 the actual Staff workspace offers both conflict windows and a reasoned rollout recheck | 2026-10-13T13:07:48.702Z |
| TC-CS86-04 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-05 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-05 ended bookings are not changed or reported during a later recheck | 2026-10-13T13:07:48.702Z |
| TC-CS86-06 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-06 flagged inherited bookings cannot be deleted and retain every audit record | 2026-10-13T13:07:48.702Z |
| TC-CS86-07 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-07 turnaround boundary preserves both bookings at a 44 minute gap; TC-CS86-07 turnaround boundary preserves both bookings at a 45 minute gap; TC-CS86-07 turnaround boundary preserves both bookings at a 46 minute gap | 2026-10-13T13:07:48.702Z |
| TC-CS86-08 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-08 Staff see both current inherited conflicts before the worker runs, without mutating commitments | 2026-10-13T13:07:48.702Z |
| TC-CS86-09 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-09 authenticated Staff can recheck existing bookings for rollout with atomic, idempotent history and intent | 2026-10-13T13:07:48.702Z |
| TC-CS86-10 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-10 a retired rejected room cannot prevent Staff from reviewing other inherited conflicts | 2026-10-13T13:07:48.702Z |
| TC-CS86-11 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-11 Staff tools recognize an authorized secondary role and stay hidden from Technical Support | 2026-10-13T13:07:48.702Z |
| TC-CS86-12 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-12 legacy confirmed bookings with a missing Event remain visible and auditable without blocking other rechecks | 2026-10-13T13:07:48.702Z |
| TC-CS86-13 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-13 a hold expiring during a slow Event lookup is excluded from the recheck without an expiry mutation | 2026-10-13T13:07:48.702Z |
| TC-CS86-14 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-15 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-16 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-16 a room still in turnaround remains in both conflict panes and cannot clear the later booking flag | 2026-10-13T13:07:48.702Z |
| TC-CS86-17 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-17 an authorized secondary Staff role can create operational windows from the actual workspace calendar | 2026-10-13T13:07:48.702Z |
| TC-CS86-18 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-18 Staff calendar controls follow the current CONFIRMED booking permissions; TC-CS86-18 Staff calendar controls follow the current BLOCKED booking permissions | 2026-10-13T13:07:48.702Z |
| TC-CS86-20 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-20 an expired hold whose venue is removed during a lock wait cannot poison the read | 2026-10-13T13:07:48.702Z |
| TC-CS86-21 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-21 an expired hold whose venue is removed during a venue wait cannot poison the read | 2026-10-13T13:07:48.702Z |
| TC-CS86-22 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-22 initial rollout automatically flags inherited approvals once without a configuration edit | 2026-10-13T13:07:48.702Z |
| TC-CS86-23 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-23 initial rollout survives an unavailable Booking service and retries the same action | 2026-10-13T13:07:48.702Z |
| TC-CS86-24 | Assertions passed; see scenario and layer limitations | Pass | TC-CS86-24 initial rollout catches a venue arriving after startup without cancelling existing bookings | 2026-10-13T13:07:48.702Z |
| TC-CS86-25 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-26 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-27 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
| TC-CS86-30 | No assertion executed | Not Executed |  | 2026-10-13T13:07:48.702Z |
