# CS-11 — Test Case Specification (IS212 / IEEE 829)

> Requirements-owned test cases written before implementation. Execution evidence is retained with the test run's workflow artifacts.

Story: *As an Event Organiser, I want to submit my event requirements and view the recorded request so that ConnectSphere can begin planning from accurate information.*

Field-matrix rule: cases referencing mandatory or conditional fields use the **approved C02 matrix**. The recommendations in `prototype-validation.md` are not binding until approved.

| Test Case ID | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---:|---|---|---|---|---|---|---|
| TC-CS11-01 | 1 | Form captures every required information category | Authenticated Event Organiser; new-request form open | Inspect and exercise each field/control | Name, purpose, description, proposed date, start/end time, time zone, attendance, venue type, minimum capacity, preferred layout, venue/location requirements, accessibility (+details), equipment/technical (+details) — per Figma 2044:4675; registration UI absent, covered only via C02/API | Each AC1 category can be represented and survives client serialization without loss; optional fields may be empty | Component + API contract | 2026-09-19 02:15:00 |
| TC-CS11-02 | 1, 2 | Approved minimum field set submits successfully | Approved C02 matrix available; authenticated Organiser | Populate every C02 Mandatory field, omit Optional fields, submit once | One valid value per Mandatory field | Server accepts the request; optional omissions do not cause errors | API integration | 2026-09-19 02:15:00 |
| TC-CS11-03 | 2 | Every mandatory field is enforced server-side | Approved C02 matrix available; authenticated Organiser; record count known | For each Mandatory field, send a request omitting only that field | Table-driven omissions from approved matrix | Each request is rejected with a field-keyed error for the omitted field; no Submitted record, activity, assignment or notification is created | API integration + persistence | 2026-09-19 02:15:00 |
| TC-CS11-04 | 2 | Conditional fields are enforced only when their trigger applies | Approved C02 trigger matrix available | Submit each trigger-on payload without its dependent field; repeat with trigger off | `OTHER` layout/equipment/accessibility without details (registration conditional deferred to approved C02 trigger matrix — no Figma control in 2044:4675) | Trigger-on payload is rejected with field-level guidance and no side effects; trigger-off payload is not rejected for that dependent field | API integration | 2026-09-19 02:15:00 |
| TC-CS11-05 | 2 | Invalid supplied values receive field-level guidance | Authenticated Organiser | Submit one invalid value at a time and then a combination | Invalid date/time, zero/negative/fractional attendance, non-positive duration, capacity below allowed rule, over-length text, unknown enum | Server rejects without persistence; response identifies every invalid field and a user-actionable reason | API integration | 2026-09-19 02:15:00 |
| TC-CS11-06 | 2, Scope | No arbitrary submission lead-time restriction is imposed | Clock fixed; otherwise valid request | Submit an event just beyond the minimum valid future instant and one far in the future | Near-future and distant-future proposed dates | Both pass date validation; validation applies no undocumented minimum or maximum lead time | API integration with fixed clock | 2026-09-19 02:15:00 |
| TC-CS11-07 | 3 | Successful submission creates one identified Submitted request | Authenticated Organiser; persistence empty | Submit one valid request | Valid complete payload and unique operation key | Response is successful and contains unique request ID, `Submitted` stage and submission timestamp; persisted record has the same values and owning Organiser | API + persistence integration | 2026-09-19 02:15:00 |
| TC-CS11-08 | 3 | On-screen confirmation identifies the persisted request | TC-CS11-07 submission succeeds | Complete the form and observe confirmation | Request created by TC-CS11-07-equivalent flow | Confirmation displays the returned request ID and Submitted stage; it does not claim success before the server response | Component/browser integration | 2026-09-19 02:15:00 |
| TC-CS11-09 | 4 | Owning Organiser retrieves current information and stage | Submitted request owned by Organiser A | Organiser A opens the request by ID | Existing request ID | Response/view matches persisted information and current stage | API + page integration | 2026-09-19 02:15:00 |
| TC-CS11-10 | 4 | Unrelated authenticated user cannot retrieve the request | Submitted request owned by Organiser A; Organiser B authenticated | Organiser B requests A’s request ID directly | A’s request ID | Access is denied without returning request contents or leaking whether mutable details exist | API authorization integration | 2026-09-19 02:15:00 |
| TC-CS11-11 | 4 | Unrelated user cannot modify the request | Submitted request owned by Organiser A; Organiser B authenticated | Organiser B sends each supported mutation method directly | A’s request ID and changed name/date | Access is denied; persisted request, activity history, assignment and notification state remain unchanged | API authorization + persistence | 2026-09-19 02:15:00 |
| TC-CS11-12 | 5 | Owning Organiser cannot modify a Submitted request | Submitted request owned by authenticated Organiser A | Attempt to edit or resubmit changed fields through UI and direct API | Changed description/date | UI is read-only and direct mutation is rejected; stored data remains unchanged | Component + API integration | 2026-09-19 02:15:00 |
| TC-CS11-13 | 6 | Repeating the same operation is idempotent | Authenticated Organiser; valid payload; stable operation key | Send identical submission twice with the same operation key, including a retry after an uncertain first response | Same actor, payload and idempotency key | Both responses identify the same request; exactly one request and one successful-submission activity exist | API + persistence integration | 2026-09-19 02:15:00 |
| TC-CS11-14 | 6 | Reusing an operation key for a different payload is rejected | TC-CS11-13 completed | Submit changed content with the same operation key | Same key, changed event name/date | Conflict is returned; original request remains unchanged; no second success activity or downstream dispatch occurs | API + persistence integration | 2026-09-19 02:15:00 |
| TC-CS11-15 | 6 | Successful submission records the shared activity contract | Valid request submitted once | Read the activity through the agreed activity boundary | Successful request ID | Exactly one activity records agreed action type, request reference, actor ID and successful action time using the shared contract | Activity integration | 2026-09-19 02:15:00 |
| TC-CS11-16 | 7 | Submitted request becomes available for CS-30 assignment once | Valid request submitted | Observe the agreed assignment input boundary | Successful request ID | One eligible assignment item/reference exists for that request in Submitted state; retries do not duplicate it | Assignment integration | 2026-09-19 02:15:00 |
| TC-CS11-17 | 7 | CS-50 submission notification is actually delivered | T01 delivery conditions met; test recipient/transport available | Submit valid request, wait for delivery receipt, correlate it to request | Valid request and reachable recipient | One notification is delivered and receipt evidence correlates actor/request/message; no second submission is needed | Notification integration/contract test | 2026-09-19 02:15:00 |
| TC-CS11-18 | 7 | Notification failure retries without repeating submission | T01 retry policy defined; transport fails then recovers | Submit once, force initial delivery failure, allow retry | Stable operation key; deterministic transient transport failure | One request remains persisted; delivery is retried per T01; final receipt or terminal failure is recorded; no duplicate request/activity/assignment is created | Notification failure integration | 2026-09-19 02:15:00 |
| TC-CS11-19 | Scope | CS-11 does not persist incomplete drafts | CS-29 not included in delivery | Partially complete form, navigate away/reload; probe submission API with incomplete data | Incomplete payload | No resumable draft is created by CS-11; UI does not promise autosave or offer `Save draft`; incomplete submit receives validation only | Component + API integration | 2026-09-19 02:15:00 |

## TDD execution order

Implement one RED→GREEN slice at a time:

1. TC-CS11-02/03/04/05 — approved validation matrix and no-side-effect rejection.
2. TC-CS11-07/08 — persistence and confirmation.
3. TC-CS11-09/10/11/12 — owner retrieval and immutability.
4. TC-CS11-13/14/15 — idempotency and activity.
5. TC-CS11-16 — assignment availability.
6. TC-CS11-17/18 — T01 notification delivery and retry.
7. TC-CS11-01/06/19 — cross-cutting UI, lead-time and scope checks.

Do not convert blocked cases into passing placeholders, tautologies or mocks that merely return the asserted result. A case becomes executable only when its listed contract dependency is agreed; once accepted, its expected result changes only with a traceable requirement change.

## Agreed BFF surface (2026-09-20 11:00:00)

`POST/PUT/GET /api/events` is the canonical CS-11 BFF surface (single resource, uppercase `EventRequestStatus` + `DRAFT`; `NEW` client-only). The `/api/event-requests/*` cases above stay until the backend contract lands. New automated coverage (all in `tests/specs/CS-11.spec.ts`): TC-CS11-20 (draft/submit create, 422, 401), TC-CS11-21 (PUT submit-transition, edit-save, 403, 404), TC-CS11-22 (create-form submit/draft/error flow returns home refreshed). New-request form cards render flat (no card chrome; Request-status card unchanged); dashboard cards link to `/requests/:id`.

## Unified form template (2026-09-20 12:00:00)

Create (`/requests/new`) and detail (`/requests/:id`) render one shared `RequestFormPage` shell (header + optional coordinator banner + reusable fields + one responsive action grid). The create page's separate desktop status card and sticky mobile bar are removed; TC-CS11-01 UI coverage now asserts the single action bar. Action rules: draft → Save changes + Submit request; non-draft (except REJECTED) → single Save and Submit in edit mode; REJECTED → read-only, no edit.

## Source-based amendments — 2026-10-06

The current CS-11 Jira AC7 and full implementation request supersede the older TC-CS11-17/18 notification-delivery expectations for this branch: both now prove a transactional pending RequestSubmitted outbox row and no duplicate on replay. Actual CS-50 delivery/retry remains **Not Executed** and outside this task. Historic records are retained; a new outbox result does not establish old delivery acceptance.

C02 is still a team proposal. TC-CS11-02/03/04 use it provisionally and do not claim approval. Registration is now captured in the UI. TC-CS11-19 covers incomplete **submit** rejection; the user explicitly included CS-29, so explicit Save draft is now supported. The contradictory no-Save-draft wording is superseded, not quietly passed.

The old TC-CS11-20/21/22 mock-route fixtures are replaced by actual H3→Express→Prisma tests: create/401/422/role/CSRF in 07/19/20; update/submit/private/404 in CS29-02/03 and CS27-02/03 plus service API tests; receipt/draft navigation in 08 and CS29-01/02 plus live browser. Current-row locks, rollback and concurrent duplicates are additionally proved in event-service integration tests. Old 405 edit expectations now use the shared guard's 409 state conflict; 403 ownership is retained. TC-CS11-21/22 have no new assertion with those exact IDs and are reported Not Executed with this mapping.

## Accessibility regressions — 2026-10-07

| Test Case ID | AC | Scenario | Steps and data | Expected result | Layer | Created |
|---|---|---|---|---|---|---|
| TC-CS11-23 | 1,2; accessibility | Mandatory-name and purpose cues preserve incomplete Draft workflow | Inspect required cues, then type purpose only | Both controls announce required-for-submit; purpose-only Save draft remains enabled | Component; real desktop/mobile browser | 2026-10-07 01:26 SGT |
| TC-CS11-24 | 1; accessibility | Label targets remain unique and labelable | Inspect every explicit label and its target ID | Exactly one input/select/textarea for each label; section headings cannot steal a control ID | Component; real browser form completion | 2026-10-07 01:44 SGT |

TC23 first failed in the dated 17:26:58Z RED record. TC24 first reached a valid assertion failure in 17:45:33Z RED after the cross-platform dependency setup was corrected; the preceding native-binding startup failure is diagnostic only. Existing test expectations have not been weakened.

## Trusted permission amendment — 2026-10-07

TC-CS11-21: With the same authenticated Organiser session and role, remove `event_requests.create` from the identity service's trusted permission response. New creation, same-key replay and own Draft/submission/resubmission writes return403 without new request, activity, assignment, outbox or replay rows; a caller body/header or nested user field cannot restore the grant. Keeping `events.view` permits the existing owner read. Removing `events.view` blocks lists, detail, contact and Request/Event history; missing/malformed upstream permission arrays fail503 without role fallback. Coordinator queue/decisions additionally require `event_requests.review`, preserving assignment/self-review guards. Backend real-PG regressions and two actual H3 BFF cases exercise these gates; live identity verification is separately recorded. This consumes the existing catalog rather than redefining the teammate's broader permissions administration.

## HTTP transport boundary amendment — 2026-10-07

Backend supplemental HTTP-01 follows the standing10KB security rule: an unauthenticated10240-byte JSON object reaches the401 authentication check, while10241 bytes return413/PAYLOAD_TOO_LARGE without a database call. HTTP-02 submits malformed JSON with private content and requires400/BAD_REQUEST plus a stable generic message. Two meaningful Node22 RED failures precede two GREEN passes; dated HTTP records supplement the main BFF/component specs. The whole request limit is independent of individual field limits.

## Form hydration regression — 7 October 2026

| Test Case ID | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|---|
| TC-CS11-25 | 1,2,5; reliable form interaction | No native form submission before handlers attach | Production SSR or real Vue server renderer | Render all form modes before mount; use hydrated form afterward | Meaningful synthetic draft; browser session with JavaScript disabled | Inputs/actions disabled before mount; no native GET or lost early input; normal actions work after mount | SSR component + production desktop/mobile | 2026-10-07T02:43:05+00:00 |
