# Current event-workflow access — 2026-10-06

This implemented amendment supersedes conflicting Sprint1 event/request rows below. Identity is verified at auth-service on every event call; roles array is authoritative with legacy single-role fallback. Caller role/owner/organisation headers or body fields grant nothing.

| Resource/action | Organiser | Coordinator | Venue/Technical Staff | Attendee |
|---|---|---|---|---|
| Create/submit/save/resubmit Request | Owner only, guarded Draft/Returned states | No | No | No |
| Request detail/history (including all cursor pages) | Owner only | Current assigned, non-Draft, excluding self-organised work | No | No |
| Draft list/detail/history | Owner only | No | No | No |
| Assigned submitted queue/return/approve/reject | No | Current assigned only; shared guard/version | No | No |
| Actual Event history | Owner or same non-null organisation | Current assigned | No | No |
| Minimal Event booking options | Own/same-org | Current assigned | Planning/Confirmed ID,title,status only | No |
| GET BFF /api/users/:id | Own profile only | Own profile only | Own profile only | Own profile only |
| Request-scoped Coordinator/Organiser contact | Only authorised relationship, limited projection | Only authorised relationship | No | No |

Historic Draft entries remain owner-only after publication; a Coordinator sees published values with prior Draft values marked private. Wider Event viewers receive only Event-scoped entries, filtered before cursor paging.

Multi-role users receive applicable role rights while relationships remain mandatory. Authentication's broader permissions administration is unchanged; no self-provisioning/reassignment rights are added. Missing organisation denies same-org access. Completed/cancelled history uses the same rules. Unauthenticated/expired/revoked401; wrong actor403; right actor/wrong state or stale version409. No ordinary history update/delete route.

These rules are exercised by real PostgreSQL API tests, BFF fixtures and separate live-auth checks. Full instructor access and independent product acceptance remain manual review gates.

---

Historical Sprint1 matrix and findings (retained for traceability; resolved by the amendment where event routes were touched):

# Role and Event Access Matrix

Specifies which users may view or change each protected resource, based on their
role *and* their relationship to the event. Derived from the implemented Sprint 1
endpoints and screens; extended as features land.

Status of each rule: **Built** (enforced in code today) or **Planned** (agreed, not
yet implemented).

---

## Roles

| Role | Backend value |
| --- | --- |
| Event Organiser | `EVENT_ORGANISER` |
| Event Coordinator | `EVENT_COORDINATOR` |
| Venue Staff | `VENUE_STAFF` |
| Technical Support Staff | `TECHNICAL_SUPPORT_STAFF` |
| Attendee | `ATTENDEE` |

Any account whose role is missing or outside this list is denied at login and is
never defaulted to a privileged role.

---

## Matrix (as built, Sprint 1)

Legend: **Yes** · **Own** (only records they own) · **Assigned** (only events assigned
to them) · **No** · **n/a** (feature not built)

| Action | Organiser | Coordinator | Venue Staff | Tech Support | Attendee |
| --- | --- | --- | --- | --- | --- |
| Log in | Yes | Yes | Yes | Yes | Yes |
| Reach the application interface | Yes | Yes | **No** | **No** | **No** |
| Create / submit an event request | Own | No | No | No | No |
| List event requests | Own | No (uses queue) | No | No | No |
| View a single event request | Own | Submitted or Assigned | No | No | No |
| Edit an event request | Own | No | No | No | No |
| View the review queue | No | Yes | No | No | No |
| Approve / reject / request amendments | No | Yes | No | No | No |
| Reassign the coordinator | No | n/a | No | No | No |
| Read a user record | Yes | Yes | Yes | Yes | Yes |

**Venue Staff, Technical Support Staff and Attendees can authenticate but have no
interface yet.** Their rows fill in as venue, equipment and registration features
are built.

---

## Enforcement rules

1. **Server-side, not interface-only.** Every rule above is enforced at the API.
   The route middleware only redirects; it is not the access control.
2. **Ownership beats role.** An Organiser may act only on requests where
   `organiserId` matches their own id. Role alone grants nothing.
3. **Coordinator visibility.** A Coordinator may view any request in `SUBMITTED`
   state, plus any request assigned to them. This is deliberate: the review queue
   must show unassigned submitted work.
4. **One current coordinator.** Assignment records the coordinator and revokes the
   previous one, so an event has at most one at any time.
5. **Generic failures.** Bad email and bad password return the same message, so
   account existence is not leaked.
6. **Decisions are state-gated.** Only a `SUBMITTED` request can be approved,
   rejected or returned for amendment; anything else is rejected as a conflict.

---

## Findings to fix

Identified by reading the endpoints rather than the interface. Both are cases where
the UI blocks an action but the API does not.

| # | Endpoint | Issue | Suggested fix |
| --- | --- | --- | --- |
| 1 | `POST /api/events` | Requires a session but **does not check role**. Any authenticated user, including an Attendee or Venue Staff member, can create an event request by calling the endpoint directly. The interface hides it; the API allows it. | Reject any role other than Event Organiser. |
| 2 | `GET /api/users/[id]` | Requires a session but applies **no role or ownership check**. Any authenticated user can read any other user's record. | Restrict to the requester's own record, plus the parties to an event the requester is authorised to see. |

Both are exactly the failure mode this matrix exists to catch: permission enforced
by hiding a control instead of by checking the request.

---

## To verify

- Whether an Organiser can still edit a request after it reaches `SUBMITTED`.
  CS-11 states submitted requests are read-only unless returned for amendment.
- Whether a Coordinator's access is revoked on reassignment once reassignment is
  implemented (CS-30).

---

## Open questions

Blocked on the customer or a team decision (tracked as T02 in CS-24):

- **Multi-role accounts.** Can one account hold more than one role? The current
  session model assumes exactly one.
- **Same-organisation visibility.** Can Organisers in the same client organisation
  see each other's events? The customer left this to implementation design.
- **Internal provisioning.** How Coordinator, Venue Staff and Technical Support
  accounts are created, given there is no System Administrator role.

---

## Verification

Covered today by the CS-10 automated tests: unauthenticated access to a protected
endpoint returns 401; an account with an unrecognised role is denied rather than
defaulted.

Not yet covered, and due with CS-26 in Sprint 2: direct endpoint access by a second
Organiser against another Organiser's request, Coordinator access to an event
assigned to a different Coordinator, and access revocation after reassignment.
