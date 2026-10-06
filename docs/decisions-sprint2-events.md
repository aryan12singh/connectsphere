# Sprint 2: event-service decisions

**Status: proposed. Needs team sign-off before the guard and endpoints are built on it.**
Covers stories CS-10/11 (contract and schema), CS-30 (assignment), CS-32 (status guard),
CS-12 (approve), CS-28 (reject/return) and CS-44 (activity history).

Each decision has a short **Decision**, a **Why**, and the files it touches. Anything marked
*Team to confirm* is my default and can be overturned without large rework.

---

## Decisions that resolved a contradiction

These three were found by comparing the written decisions with `openapi.yaml`.

### D1. An unassigned request is visible to, and claimable by, any Coordinator

* **Decision.** When no Coordinator exists at submission, the request is saved as `SUBMITTED`
  with no Coordinator and shows **"Awaiting assignment"**. Every Coordinator sees it in the
  review queue (filter `assigned=unassigned`). Any Coordinator can take it by calling
  `/reassign` with their own id ("claiming"). Once assigned, only the current Coordinator has
  access.
* **Why.**
  1. Story 3 says submission must succeed and "nothing lost" (test 30-05). If no Coordinator
     could see the request, it would sit with nobody able to open it, which is exactly
     "lost".
  2. A Coordinator account may be created later, and a claim needs no background job.
  3. Access is still tight once assigned: the old Coordinator loses access (test 30-04).
* **Replaces** the earlier wording "unassigned requests are visible to no Coordinator".
* **Touches.** `access-matrix.md` rule 3 (any Coordinator may see *unassigned* Submitted
  requests only), `openapi.yaml` (already written this way).

### D2. Only "create" calls take an `Idempotency-Key`

* **Decision.** The header is accepted on **create request** and **submit** only. It is removed
  from **decision, resubmit and reassign**. A repeated approval returns **409**, never the
  original 200.
* **Why.**
  1. Story 5 says "a repeated approval gets 409". With an idempotency key, a retry would
     replay the first 200, which contradicts it.
  2. Creates need the key (a double-click must not make two drafts). The other actions already
     have two protections: the status guard (right person, wrong status → 409) and the
     `version` check (stale → 409).
  3. Fewer places for the replay store (`idempotency_records`) to be wrong.
* **Touches.** `openapi.yaml` (header removed from 3 operations, note added to `/decision`),
  `docs/api-contract.md` §5.

### D3. "Active" load means open responsibility, including Returned and Confirmed

* **Decision.** A Coordinator's **active** count is the number of requests currently assigned
  to them that are:
  * `SUBMITTED`, or
  * `RETURNED_FOR_AMENDMENT`, or
  * `APPROVED` with the Event in **Planning** or **Confirmed**.

  It excludes `DRAFT`, `REJECTED`, and Events that are **Cancelled**, **Completed** or
  **Rejected**.
* **Selection order.** Fewest active → **most experienced** → lowest id.
  *Most experienced* means the **longest-serving** Coordinator: the account with the earliest
  `createdAt`. *(Team to confirm: this replaces story 3's "assigned least recently" tie-break,
  see below.)*
* **Why.**
  1. Story 3 says "the fewest active events". The Coordinator is still responsible for all
     the states above.
  2. A Returned request comes back to the **same** Coordinator after resubmit, so it is still
     their work. Leaving it out would let one Coordinator pile up returned requests.
  3. A Confirmed event is still being run, so it counts.
  4. The extra tie-break (lowest id) makes the result the same every time, which tests need.
* **Tie-break change.** Story 3 says ties go to "whoever was assigned least recently". The
  team asked for ties to go to the most experienced Coordinator instead.
  1. "Experienced" needed a measurable meaning. Account age needs no new column, and a
     second reading (most events handled) would need a history count and could change
     during a demo.
  2. Test 30-06 already says "earliest-created Coordinator", so this reading matches it
     as written, and the story 3 acceptance line is the one to reword.
  3. Load still comes first, so a senior Coordinator only wins when loads are equal. Work
     does not pile up on one person.
  4. Cost: on equal load the same person always wins, so juniors get new work only when
     they have fewer open requests. If that feels unfair, switch the tie-break back (one line).
* **Wording to change.** Story 3 acceptance criterion 1: *"Ties go to the Coordinator
  who has served longest."* Test 30-06 then stands as written.
* **Touches.** The selection function (story 3), `openapi.yaml` (`/submit` description).

---

## Decisions on the status table (CS-32)

### D4. Reject from Planning closes both records (Option B)

* **Decision.** Rejecting while the Event is in Planning sets the **request to `REJECTED`** and
  the **Event to a new `EventStatus.REJECTED`**, in one transaction. The reason is stored and
  one activity entry is written for each. This is the only path from `APPROVED` to `REJECTED`.
* **Why.** Story 6 says a rejection "closes the request as Rejected". Closing only the Event
  would leave the Organiser looking at an Approved request that is dead.

### D5. Cancel leaves the request alone

* **Decision.** Cancel moves only the Event to `CANCELLED`. The request stays `APPROVED`.
* **Why.** The request was legitimately approved and the event was called off later. This keeps
  "rejected" (we cannot do it) and "cancelled" (it was going ahead) different, as Session 2
  asked.

### D6. Approval is blocked once the event date has passed

* **Decision.** Approve fails with **409 `EVENT_DATE_PASSED`** if the event's start date is
  earlier than today **in the event's time zone**. Today and later are allowed. Compared by
  calendar day, not by instant.
* **Why.** Test 12-06 is phrased by day ("yesterday blocked, today approvable"). Cancel uses
  the real start time, as the table says ("before start time").

### D7. The arrangements checklist is out of scope; the guard only needs its result

* **Decision.** The guard's Confirm row requires a list of outstanding arrangements
  (`context.outstandingArrangements`). Empty list → allowed. Non-empty or **unknown** →
  409 `ARRANGEMENTS_INCOMPLETE`. Tests 32-01/03/06/07 wait for CS-31.
* **Why.** The checklist depends on booking and equipment, built in later sprints. Treating
  "unknown" as blocked means a Confirm can never slip through by accident.

### D8. Cancel and "significant change approved" are encoded, not exposed

* **Decision.** Both rows are in the guard and unit-tested but have no endpoint. The
  endpoints belong to CS-54 and later stories.
* **Why.** Meets "one guard encodes the whole table" without taking on other stories' work.

### D9. Check order: who, then status, then input, then conditions

* **Decision.** 403 (wrong person) → 409 (wrong status) → 422 (bad input) → 409 (date or
  arrangements). A multi-role user can never decide on their own request.
* **Why.** A person who may not act should not learn the request's status.

---

## Decisions on the activity history (CS-44)

### D10. Newest first, 20 per page

* **Decision.** The activity list is **newest first**. The default page size is **20** for
  all lists (maximum 100).
* **Why.** Test 44-03 (newest first) and 44-06 (page size 20). One default for every list is
  simpler than a special case.
* **Changed.** `openapi.yaml` (summary, description, `PageSize` default), `api-contract.md`.

### D11. Assignment is logged, so the normal count is 4, not 3

* **Decision.** Submit → return → resubmit produces **4** entries: submitted, coordinator
  assigned, returned, resubmitted. Resubmit keeps the same Coordinator, so no second
  assignment entry.
* **Why.** Story 3 wants an auditable assignment. The Organiser seeing "Coordinator assigned"
  is useful. Hiding it would need filtering code for little gain. Reword test 44-01 to
  expect 4.

### D12. Edited fields are recorded on the resubmit entry

* **Decision.** The resubmit entry's `details.changes` is a list of `{ field, from, to }` for
  the fields changed while the request was Returned.
* **Why.** Editing is only allowed in Draft and Returned. The Coordinator's question is "what
  changed since I sent it back?", and one entry answers it. Logging every save would flood
  the history.

---

## Other agreed decisions

| # | Decision | Why |
|---|---|---|
| D13 | Identity comes from `x-user-id`, `x-user-roles`, `x-organisation-id`. Kong strips any client-sent copies. The service has no public port. | Story 1 ("identity headers passed from Kong"). |
| D14 | Stack stays **JavaScript, Express 5, Prisma** (as user-service). | Matches the existing services. *Team to confirm.* |
| D15 | Concurrency uses a `version` column: `UPDATE ... WHERE id AND version`; zero rows → 409. | Gives one winner for simultaneous approvals and reassignments. |
| D16 | The database allows only one **current** Coordinator per request (partial unique index). | Makes "exactly one current Coordinator" true even under a race. |
| D17 | Reason and comment: trimmed, 1–500 characters, whitespace-only rejected. | Story 6 and test 28-07. |
| D18 | Outbox rows are written in the same transaction as the change. Publishing comes later. | Notification stories own the publisher. |
| D19 | Status labels come from one shared map (`statusLabels.js`). `SUBMITTED` = "Under Review", `ARRANGEMENT_PENDING` = "Planning". | Story 4 ("one shared label map"). |

---

## Files changed by this record

* `services/event-service/docs/openapi.yaml`: D2, D3, D10, D11, D12.
* `docs/api-contract.md`: D2, D10.
* `services/event-service/src/domain/transitions.js` and `tests/transitions.test.js`:
  error code renamed `EVENT_PASSED` → `EVENT_DATE_PASSED` (D6).
* **Not yet changed (follow-ups):** `docs/access-matrix.md` (D1), test case wording for 30-06
  and 44-01, and the frontend label map (D19).
