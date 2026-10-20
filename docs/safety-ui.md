# Operational Safety implementation and review

Updated 17 October 2026 on `feat/aryan-sprint3-venue-safety`. The current branch integrates the real Officer role, Event-owned Safety workflow, Technical Support proof and notification delivery. [Integration/handoff](sprint3-integration-handoff.md) and [current verification](devlogs/2026-10-17-integrated-venue-safety.md) supersede the 14 October UI-only delivery limits. Historical dated test runs retain their original scope.

## Workflow and authority

The current Coordinator's Event page loads current Booking/Equipment proof through the authenticated BFF. Every required room must be confirmed, conflict-free and suitable. Technical Support must approve the current requirements plus real reserved stock, or explicitly approve NOT_REQUIRED. The UI lists outstanding facts and never derives approval from an empty equipment array.

Submitting creates a durable Event-owned operation and numbered immutable snapshot. Booking and Equipment prepare exact-token fences before Event finalizes the round; Event does not hold its transaction across resource RPC. Only an active Officer with both role and capability can read the queue and record a decision. The protected `/safety-checks` queue shows current rounds by upcoming Event date; its detail shows all seven factors, current source facts and changes since earlier rounds.

The Officer reviews attendance/capacity, layout, emergency access, accessibility, equipment placement, crowd movement and venue restrictions. The checklist means reviewed, not automatically safe. Approve, scoped venue rejection and Request Changes have their own validation. Rejection/changes require actionable comments; changes require affected areas. Private notes/checklist remain internal. The backend redacts Organiser responses and notice payloads; component hiding is supplementary.

The Coordinator records the current review/next action and corrects affected facts or directs a specific replacement. Unaffected approvals remain. Rejected room facts must materially change or the room be replaced before a new round; metadata-only edits and identical recreation cannot bypass this. Old rounds/decisions are immutable and stay historical. Factual source changes invalidate current proof before mutation; handover metadata alone preserves factual approvals while revoking the old actor's authority.

Current Safety approval permits the Coordinator to Confirm; a separate action starts Preparation. Venue/Technical staff use `/technical-requirements/preparation`. A Venue note identifies its required booking and approved round/token, so notes from an old round cannot masquerade as current preparation.

## UI components

| Surface | Current behavior |
|---|---|
| `SafetyWorkspace` on Event details | Current-source readiness, submit/retry, recorded Coordinator review, controlled Event correction, confirmation and separate Preparation |
| `SafetyReviewDetails` | Seven factors per room, explicit unknowns, capacity warning, approved actual equipment placement and proof |
| `SafetyDecisionForm` | Permission/current-round guard, all seven checks, scoped reject/areas/reason/private notes, stable accessible control names, duplicate guard and retry after failure |
| Officer queue/detail | Actual authorized reads, current immutable round, prior-fact comparison, persisted decision and authoritative refresh |
| `SafetyReworkPanel` | Retained reusable presentation/validation; production Event workspace supplies actual current state rather than treating emitted intents as persistence |
| Staff Preparation | Current Event/room selection, controls disabled before hydration, versioned idempotent note and current/history labels |

See [Event/Safety OpenAPI](../services/event-service/docs/openapi.yaml), [Equipment OpenAPI](../services/equipment-service/docs/openapi.yaml) and [architecture/model](connectsphere-architecture.md). Planning Event IDs and EventRequest IDs are distinct.

## Verification and remaining gates

Canonical specs and blue/yellow records are under `tests/specs/CS-93.spec.ts`, `CS-94.spec.ts`, `CS-95.spec.ts` and corresponding `tests/records` directories. Actual authenticated API/PG/Rabbit acceptance covers incomplete/complete proof, required and not-required equipment, wrong roles, validation failures, raw database immutability, scoped rejection, source invalidation, corrections, numbered rounds, confirmation and Preparation. Production desktop/mobile evidence covers the full user journey; component/source controls are labelled at their actual layer.

Q2 remains a real pending PO answer: whether a Coordinator venue request already counts as their confirmation or needs a separate action before Staff approval. It does not silently introduce a new Safety lifecycle. Peer review, main merge/merge CI, manual acceptance and PO sign-off remain human release gates. Engineering inventory/coverage defaults and the remaining human model/spike/adoption records are explicit in the handoff; automation does not assert them.
