# 17 October 2026 — Sprint 3 Venue and Safety completion audit

Owner: Aryan. Scope: CS-36/37/38/39/84/85/86/87/93/94/95 and their shared
Drive test evidence. PR: [#13](https://github.com/aryan12singh/connectsphere/pull/13).

## Confirmed defect and correction

CS-85's operating-hours check compared only local endpoints. During New York's
clock rollback, 01:20 EDT → 01:10 EST was incorrectly accepted for a venue open
01:00–01:30, although its actual50-minute occupied interval traverses closed
time. This violates the existing full-occupied-interval requirement; no new
policy, endpoint, schema or dependency is introduced.

The shared validator checks actual time in constant-offset segments and checks
both sides of timezone transitions. It retains half-open closing boundaries,
venue-local dates, buffers and the existing366-day bound. Intl supplies offsets;
neither an annual transition date nor a one-hour offset is hard-coded. Search,
request, approval and readiness all consume this same validator.

## Verification and evidence

- TC-CS85-16: initial native regression **4/8 passed, 4 failed**; corrected
  **8/8 passed**, including New York and Lord Howe rollbacks, spring-forward,
  exact closing, subminute overflow, local midnight and invalid ranges.
- TC-CS85-17: actual Venue/Event/Booking HTTP agrees on search, denied creation
  and denied approval; complete before/after business effects stay unchanged.
- TC-CS85-18: actual PostgreSQL denial has zero effects; the open-hours control
  persists one booking/activity/intent and the correct UTC instants.
- Booking **43/43 unit**, **19/19 PostgreSQL**, **14/14 contracts** pass with
  unchanged coverage floors. Full frontend **387/387** and its floors pass.
- The first simultaneous local frontend/database run had a CS-29 timeout and
  cascading response failure; its raw diagnostics are retained. The unchanged
  full frontend command passed on rerun, with no retries/skips added.
- TC-CS85-31 adds real desktop/mobile UI/BFF/current-hours/SQL proof. Hosted CI
  also reruns all service, browser, broker and retained-data checks.

The77 existing owned shared-sheet scenarios are checked by behavior against
their named canonical assertions and execution layers. Supplemental cases cover
the Q2 two-action flow, current hours across a rollback, legacy communication
attestation and persistent primary-room selection. Existing peer rows, images
and range links stay in place. Repeated visible remarks move to cell notes;
case-specific assertions and original links remain available.

Raw JSON, coverage, original screenshots, SHA256 manifests and diagnostic runs
stay outside Git in the agreed Sprint evidence location. Short source-linked
RED/GREEN records remain under `tests/records/CS-85`.

## Merge and human records

**Checkpoint history:** this audit preceded PR #14. Its merge is included at
`ac9a38f`; [combined-source reconciliation](2026-10-17-pr14-reconciliation.md)
records all 10 hosted CI jobs passing. The earlier Marcus dependency is cleared.
PR #13 remains draft and unmerged pending independent review and an authorized
squash merge.

Q2 is resolved: Coordinator tentative request → Venue Staff approval confirms
the venue booking, without an extra Coordinator button. Parent Event Safety,
confirmation and Preparation remain separate. CS-37/38 actual manual/PO/author
walkthrough records, CS-74 model review, CS-78 agreed spike timebox/review,
CS-76 planning/velocity records and CS-96 real team adoption remain human work.
No review result, meeting participation or Done transition is inferred.
