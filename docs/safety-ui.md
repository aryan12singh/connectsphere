# Operational Safety UI and validation

Aryan's independent CS-93/94/95 slice, 13 October 2026. The current Coordinator
Event page includes a real preparation panel using its existing authorized venue
summary. It displays current room facts and outstanding venues, and opens the
seven-factor details. Technical/support proof is unavailable, so submission stays
disabled. Empty equipment is never interpreted as approved or not required.

## Components and source facts

| Component | Available behavior | Integration boundary |
| --- | --- | --- |
| `CoordinatorSafetyPreparation` | Current Event/assignment only; venue blockers, per-room attendance/capacity/layout/accessibility, unknown operational factors and disabled submission | Existing Booking summary; no Safety submission request |
| `SafetyReviewDetails` | Seven factors per room, over-capacity warning, explicit unknown data and equipment state | A permitted, current server projection must provide emergency access, placement, crowd movement and restrictions |
| `SafetyDecisionForm` | Approve/Reject/Request Changes; trimmed required reasons; affected-area validation; current round/revision and explicit permission; duplicate intent guard; clears superseded drafts | Emits a validated local intent; no API, Officer role grant, persistence, success notification or Event transition |
| `SafetyReworkPanel` | Explicit feedback visibility; affected areas only; unaffected approvals retained; current proof for every affected arrangement; one versioned resubmit intent | Standalone component awaiting the reviewed rework/readiness API; default actions disabled |

The seven factors are attendance/capacity, layout, emergency access,
accessibility requirements, equipment placement, crowd movement and venue
restrictions. Room capacities are never summed. Unknown operational factors
display **Not recorded**; free-text Event venue requirements are not silently
relabeled as verified venue restrictions. Virtual venue capacity is explicitly
not applicable when the supplied venue type identifies it.

The local types in `safety-review-state.ts` describe display data and intents.
They are not an OpenAPI contract or proposed replacements for Event states.
No new public route, role seed, permission, shared Event controller or equipment
schema is introduced. Officer decision/rework components have no production
entry point until the actual authorization and data interfaces are integrated.

## Required handoff before live Safety

- Marc CS-10: recognized Officer role and verified action capabilities. The
  backend must authorize every queue/read/decision, including secondary roles.
- Alan CS-42: complete current technical/support approval and reservation proof,
  or reviewed explicit NOT_REQUIRED. Bind proof to the requirements revision.
- Javier CS-77: reviewed queue/read/write projection, round/version fencing,
  preparation/confirmation ordering, controlled edits, selective rework and
  permitted feedback/history visibility. Parent Event and EventRequest IDs remain
  distinct. Each service accesses only its own database.
- Marc CS-50/51: actual queue/decision/rework notice delivery and deduplication.

The eventual parent must supply permitted, already-redacted data and explicit
capabilities. Hiding feedback in a component does not replace server redaction.
Wire `decision`/`resubmit` to the reviewed authenticated command, derive actor
identity server-side, recheck assignment/versions/readiness at commit, and set
`pending` while saving. Clear the previous `requestError` when starting a command,
then supply the latest error on failure and end `pending` after its outcome.
Each failed pending cycle allows retry even if the new error text is identical;
no component reports persistence from a local event. Fetch the authoritative next
round after success. Current Venue type/capacity override stored arrangement
requirements for capacity presentation. Stale affected-area readiness is labelled
unverified rather than approved. Do not connect a guessed transition or treat a stale form
as an approved review. Significant changes invalidate older evidence under the
agreed contract while preserving unaffected approvals and immutable history.

## Verification

Canonical specs are `tests/specs/CS-93.spec.ts`, `CS-94.spec.ts` and
`CS-95.spec.ts`, with blue source cases and dated yellow records under
`tests/records`. The Coordinator preparation also has a live desktop/mobile case
on real Nuxt/BFF/Kong/auth/PostgreSQL. Standalone Officer/rework component fixtures
prove only their display, validation and emitted intents. Original Safety queue,
submission, role authorization, durable rounds, controlled edits/rework, inbox
and whole-Event acceptance cases remain unexecuted until their implementations
exist. Human review, main merge/CI and PO acceptance remain separate gates.
