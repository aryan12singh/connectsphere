# CS-85 Test Execution — 2026-10-17T05:48:54.507Z

Yellow section (IS212 / IEEE 829). Phase: GREEN-FRONTEND. Generated from actual Vitest JSON; missing cases remain Not Executed.

Source: /tmp/final-expanded-frontend-2.json. Code revision/fingerprint: cae6079 plus recorded factual-review delta; final pushed CI independently verifies committed source / expanded-execution-source.json stores per-file SHA-256; source files unchanged during execution.

Component tests use Nuxt fixtures. BFF tests use real H3/Express/Prisma/PostgreSQL with a deterministic identity service and a forwarding fixture at the Kong boundary. These are not live Keycloak or browser proof. See separate live evidence.

| Test Case ID | Actual Result | Pass/Fail/Not Executed/Blocked | Remarks | Date of Execution |
|---|---|---|---|---|
| TC-CS85-01 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-01 expands the advertised interval by the venue setup and turnaround; TC-CS85-01 preserves the advertised instants when both buffers are zero; TC-CS85-01 expands across midnight and year boundaries without changing the booking; TC-CS85-01 uses instants rather than comparing repeated local clock values; TC-CS85-01 applies each selected venue's own buffers | 2026-10-17T05:48:54.507Z |
| TC-CS85-02 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-03 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-03 shades setup and turnaround in the actual calendar around the advertised booking | 2026-10-17T05:48:54.507Z |
| TC-CS85-04 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-05 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-06 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-07 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-07 compares occupied windows at 2026-12-22T12:44:00Z with touching explicitly permitted; TC-CS85-07 compares occupied windows at 2026-12-22T12:44:59Z with touching explicitly permitted; TC-CS85-07 compares occupied windows at 2026-12-22T12:45:00Z with touching explicitly permitted; TC-CS85-07 compares occupied windows at 2026-12-22T12:46:00Z with touching explicitly permitted; TC-CS85-07 applies a forbidden-touching policy without changing either window; TC-CS85-07 detects containment and identical windows but permits a real gap; TC-CS85-07 refuses to invent a touching policy (undefined); TC-CS85-07 refuses to invent a touching policy ({}); TC-CS85-07 refuses to invent a touching policy ({ allowTouching: 'true' }); TC-CS85-07 refuses to invent a touching policy ({ allowTouching: 1 }) | 2026-10-17T05:48:54.507Z |
| TC-CS85-08 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-09 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-10 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
| TC-CS85-11 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-11 rejects invalid buffer minutes (-1) without coercion; TC-CS85-11 rejects invalid buffer minutes (0.5) without coercion; TC-CS85-11 rejects invalid buffer minutes (30) without coercion; TC-CS85-11 rejects invalid buffer minutes (null) without coercion; TC-CS85-11 rejects invalid buffer minutes (undefined) without coercion; TC-CS85-11 rejects invalid buffer minutes (NaN) without coercion; TC-CS85-11 rejects invalid buffer minutes (Infinity) without coercion; TC-CS85-11 rejects invalid buffer minutes (9007199254740992) without coercion | 2026-10-17T05:48:54.507Z |
| TC-CS85-12 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-12 rejects invalid or ambiguous instants (not-a-date); TC-CS85-12 rejects invalid or ambiguous instants (2026-12-22); TC-CS85-12 rejects invalid or ambiguous instants (2026-12-22T10:00:00); TC-CS85-12 rejects invalid or ambiguous instants (2026-02-30T10:00:00Z); TC-CS85-12 rejects invalid or ambiguous instants (2026-13-01T10:00:00Z); TC-CS85-12 rejects invalid or ambiguous instants (2026-12-22T24:00:00Z); TC-CS85-12 rejects invalid or ambiguous instants (2026-12-22T10:00:00.0001Z); TC-CS85-12 rejects invalid or ambiguous instants (null); TC-CS85-12 rejects invalid or ambiguous instants (undefined); TC-CS85-12 rejects equal or reversed booking instants; TC-CS85-12 rejects invalid comparison windows before reporting availability | 2026-10-17T05:48:54.507Z |
| TC-CS85-13 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-13 fails closed when expansion cannot be represented as date-time instants | 2026-10-17T05:48:54.507Z |
| TC-CS85-14 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-14 calendar preflight uses the server occupied windows and the candidate venue buffers | 2026-10-17T05:48:54.507Z |
| TC-CS85-15 | Assertions passed; see scenario and layer limitations | Pass | TC-CS85-15 same-fixture search, calendar, preflight and write guard agree without creating a conflicting request | 2026-10-17T05:48:54.507Z |
| TC-CS85-30 | No assertion executed | Not Executed |  | 2026-10-17T05:48:54.507Z |
