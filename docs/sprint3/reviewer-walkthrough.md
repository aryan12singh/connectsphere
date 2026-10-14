# Sprint 3 venue reviewer walkthrough

Prepared 14 October 2026 for `feat/aryan-sprint3-venue-safety`. This is an agenda and sign-off template. Human walkthrough, model review, spike timebox approval and PO acceptance have **not** been recorded by preparing it.

## Review baseline and evidence

Review [implementation baseline d4c40a9](https://github.com/aryan12singh/connectsphere/tree/d4c40a99987a43f2f675a2aace4b4c3afbe8a42b), [green eight-job CI](https://github.com/aryan12singh/connectsphere/actions/runs/38539513763), and the [phase report at that revision](https://github.com/aryan12singh/connectsphere/blob/d4c40a99987a43f2f675a2aace4b4c3afbe8a42b/docs/devlogs/2026-10-14-coordinated-legacy-buffers.md). That baseline has 342 passing frontend tests and 70 passing desktop/mobile browser tests, with live-service/restart checks. Record the actual revision if reviewing later changes; earlier green CI does not verify a new revision.

Current direction is in the [policy register](../venue-policy-decisions.md) and [customer transcript](../session3-decisions.md). Only the Coordinator venue-confirmation action remains pending clarification. Safety occurs before Confirmed, followed by separate Preparation. The independent Safety components do not deliver the pending Officer/API/technical integrations.

## Prepare a retained local review stack

From the repository root, use a clean checkout, Docker Desktop and Node 22. Follow the setup block in [the isolated review recipe](../event-review-run.md), using a fresh `csreview-aryan-ci-…` project, an unused external evidence directory and free ports. Keep that Bash session open: it defines `cs_review_compose`, `cs_review_dir`, `cs_review_port_base` and `cs_review_pg_port`. Do not reseed an existing project or use shared team data.

```bash
git rev-parse HEAD
git status --short
node --version
docker compose -f "$cs_review_compose" ps
```

Open `http://127.0.0.1:<cs_review_port_base>/login`. Use the synthetic Sarah Organiser, the Event's current assigned Coordinator and Ravi Venue Staff accounts from `infra/keycloak/connectsphere-realm.json`; do not copy passwords/cookies into evidence. Create and approve a uniquely named request to obtain a Planning Event. Its Event ID is different from its Request ID. Keep Event/venue/booking IDs alongside screenshots and read versions before each action.

The baseline browser fixtures under `frontend/e2e/CS-36.spec.ts` through `CS-87.spec.ts` show the exact approved setup and SQL evidence queries. Legacy cases explicitly seed pre-policy data in the isolated project; do not reproduce them by granting allowances in a shared or production database.

## Eight-story walkthrough

For each row, the reviewer independently performs or observes the actual UI action, checks the result against the current blue specification, and records observed behavior plus UI/API/database evidence. Automated screenshots are useful supporting evidence; leave the manual result blank until the walkthrough happens. For expiry/race/legacy paths, use the named isolated fixture and inspect the captured persisted rows, rather than pretending normal clicks recreate an old migration or a concurrent race.

| Story | Reviewer demonstration | Persisted evidence / boundary |
| --- | --- | --- |
| [CS-36](https://spmg8.atlassian.net/browse/CS-36) search | Search from the current Coordinator Event workspace. Check full results before eligible partials, explicit missing needs, an empty result, and capacity at/below/above the room limit. Search creates no hold. | TC-CS36-30 UI; CS36-03/10 hard-capacity checks. Under-capacity physical/hybrid rooms are excluded even from partials. |
| [CS-37](https://spmg8.atlassian.net/browse/CS-37) holds/extensions | Request a room and inspect its persisted deadline. Check the 72-hour default capped at setup; request an extension as current Coordinator, then approve the same version/deadline as Staff. Inspect expiry at the exact deadline. | TC-CS37-30; booking deadline/version/count/request and activity. One extension up to24 hours, never beyond setup; pending request retains old expiry. Scheduled reminder delivery is CS-90/50/51. |
| [CS-38](https://spmg8.atlassian.net/browse/CS-38) Staff decisions | Staff approves/rejects with a reason. Check missing reason, stale replay and expired hold refusal. Refresh the real Coordinator Event page. | TC-CS38-30; booking/activity/outbox rows and authenticated actor. Venue approval does not confirm the parent Event or settle Q2. |
| [CS-39](https://spmg8.atlassian.net/browse/CS-39) overlap prevention | Compare advertised and occupied intervals. Check adjacent touching windows and a positive overlap; inspect the concurrent-request fixture's single winner. | TC-CS39-30; one committed booking/activity/request intent, no orphan or conflict override. Search/calendar/write guards use the same interval. |
| [CS-84](https://spmg8.atlassian.net/browse/CS-84) buffer configuration | Edit independent whole-minute buffers before first confirmation; after confirmation verify ordinary edits are locked. In the explicit pre-policy fixture, complete Staff→Coordinator→Organiser acknowledgements, per-Event note and reason; change a value to verify acknowledgement reset, then save once. | TC-CS84-30/39/41; Venue version/history, communication identities/booking versions and consumed allowance. Existing approvals remain; a never-confirmed legacy venue remains ordinarily editable until first confirmation. Attestation records communication, not independent proof that external messages occurred. |
| [CS-85](https://spmg8.atlassian.net/browse/CS-85) effective windows | Inspect setup/turnaround shading and persisted occupied start/end while advertised Event times stay unchanged. Check full opening-hour coverage and exact touching boundaries. | TC-CS85-30; Booking buffer snapshots and occupied-window fields. Venue buffers do not create equipment holds. |
| [CS-86](https://spmg8.atlassian.net/browse/CS-86) recheck/rollout | Inspect the explicit inherited-conflict fixture: both commitments remain, flags identify the new occupied-window conflict, current Staff recheck is versioned, and startup/restart retains one completed rollout receipt. | TC-CS86-03/30; Booking flags/activity plus Venue rollout/recheck receipts. No automatic Event cancellation, approval reset or inbox-delivery claim. |
| [CS-87](https://spmg8.atlassian.net/browse/CS-87) independent rooms | Request two rooms with their own schedule/attendance, approve them separately, select a primary room, then change/release only one. Check simultaneous attendee allocations and current aggregate readiness. | TC-CS87-13/25; separate IDs/versions/statuses, retained other-room approval and primary choice. All required rooms must be ready; capacities are not summed for registration. Public Attendee projection remains a peer integration. |

Use each story's [blue cases and dated yellow runs](../../tests/records) to identify remaining source-layer cases, rather than marking every original scenario passed from a related component check. Record unexpected behavior as a defect; retest its fix before sign-off.

## CS-74 model review

Another developer compares [the authoritative model](../venue-data-model.md) with Venue/Booking Prisma schemas, additive migrations and OpenAPI contracts at the reviewed revision. Check:

- Each service owns its database; Event/Coordinator/Organiser IDs are logical references, with no cross-database foreign key or direct peer-database read.
- Existing IDs/history survive migrations; versions, deadlines, occupied snapshots, primary venue and one-time legacy allowance match the documented behavior.
- Venue row locks/CAS and Booking commitment locks protect edit/confirmation/recheck boundaries; history and durable intent commit atomically and retries remain idempotent.
- Original catalogue/model drafts remain historical; the running schema is the reviewed source of truth. Confirm technical and Safety contracts still belong to CS-42/77.

The author explains an ordinary hold/approval, a failed first confirmation, a coordinated legacy configuration and an independent room change. The reviewer records corrections and their verification, rather than signing merely because tests are green.

## CS-78 clock and persistence-spike review

Review [hold-expiry findings](../hold-expiry.md), [15 technical cases](../../tests/records/CS-78/test-cases.md) and [the original actual PostgreSQL/domain result](../../tests/records/CS-78/test-runs/2026-10-08T16-49-25Z-GREEN-SPIKE.md). Distinguish disposable prototype tables/outbox intent from the CS-90 production scheduler and actual CS-50/51 delivery.

Optional reproduction on the fresh retained review project's PostgreSQL: create `booking_test` **once** in that isolated project, then run from the repository root with native Node22. The spike validates local database/schema targets, creates its own scratch schema and drops that scratch schema on completion; do not substitute an application or shared database.

```bash
docker compose -f "$cs_review_compose" exec -T postgres \
  psql -U connectsphere -d postgres \
  -c 'CREATE DATABASE booking_test OWNER connectsphere;'
npm ci --prefix services/booking-service
(
  cd services/booking-service
  npx prisma generate
  DATABASE_URL="postgresql://connectsphere:connectsphere@127.0.0.1:$cs_review_pg_port/booking_test" \
    CS_HOLD_SPIKE_RESULTS="$cs_review_dir/cs78-postgres.json" npm run test:hold-spike
)
(
  cd frontend
  TEST_RESULTS_JSON="$cs_review_dir/cs78-domain.json" npm run test:report -- \
    ../tests/specs/CS-78.spec.ts ../tests/specs/CS-85.spec.ts
)
```

Inspect exact-deadline expiry and approval races, database clock after row-lock waits, immediate effective availability before worker processing, bounded SKIP LOCKED claims, lease/token/version fencing, warning/expiry deduplication, outbox-failure rollback and restart/catch-up. Record the agreed retrospective timebox and any follow-up; do not reconstruct an actual timebox from test timestamps. The agreed72h/one24h extension/24h warning policy is current, while polling, batch/lease and backoff choices remain engineering configuration for the production owner.

## Full automated reproduction

Run from repository root on Node22 after the installations above. This creates a **separate fresh stack**, records logs outside Git, executes desktop/mobile plus live-service/restart checks, then stops its containers while retaining the project volume. Choose free ports; it does not leave a running manual-demo stack.

```bash
npm ci --prefix services/event-service
npm ci --prefix frontend
(cd frontend && npx playwright install --with-deps chromium)
cs_browser_stamp="$(date -u +%Y%m%d%H%M%S)"
CSE2E_PROJECT="csreview-aryan-ci-review-$cs_browser_stamp" \
  CSE2E_WORK_DIR="$PWD/../cs-browser-review-$cs_browser_stamp" \
  CSE2E_PORT_BASE=43000 bash scripts/run-event-review-ci.sh
```

Record actual command, revision, start/end time, exit status and evidence location. The browser runner writes dated test records, so the working tree can change after the initial source snapshot. Never treat generated records as proof of human acceptance. Stop only the retained manual project's containers when finished: `docker compose -f "$cs_review_compose" stop`; keep its volume/evidence and do not reseed on reopening.

## Sign-off record — complete after the actual review

| Field | Actual record |
| --- | --- |
| Reviewer / author / date / start–end | |
| Source SHA / branch / clean-source status | |
| Stack project / frontend URL / evidence folder | |
| CS-36 manual result, case IDs and evidence | |
| CS-37 manual result, case IDs and evidence | |
| CS-38 manual result, case IDs and evidence | |
| CS-39 manual result, case IDs and evidence | |
| CS-84 manual result, case IDs and evidence | |
| CS-85 manual result, case IDs and evidence | |
| CS-86 manual result, case IDs and evidence | |
| CS-87 manual result, case IDs and evidence | |
| CS-74 independent model review / author explanation / corrections | |
| CS-78 agreed timebox / actual spike review / findings / follow-up | |
| Remaining defects / blockers / owners / next check | |
| Q2 answer, source and resulting action, if received | |
| PR review / approved merge SHA / green main CI, when available | |
| PO acceptance per story, when actually given | |

Keep unresolved items open. This preparation does not move stories to Done: apply the team's [Definition of Done](../DEFINITION_OF_DONE.md), including actual manual verification, independent developer review, main integration/CI and PO acceptance.
