# Role and Event Access Matrix

## Identity and venue amendment — 7 October 2026

This amendment supersedes the historical single-role and interface restrictions below. Auth-service validates every role, reads a deduplicated union of current database grants on each request, and rejects missing/unknown roles. The fixed action-role policy in `services/utils/role-policy.js` is an additional boundary: assigning a capability to an unrelated role cannot turn an Attendee into Venue Staff or a Coordinator into Technical Support. Event-service also applies its owner, organisation and current-assignment guards.

| Action | Organiser | Coordinator | Venue Staff | Technical Support | Attendee |
|---|---|---|---|---|---|
| Home | Events | Assigned queue | Venues | User directory | Own profile |
| Public signup | Yes, organisation required | Seed only | Seed only | Seed only | Yes |
| Venue details/calendar | No | Read | Read | Read | No |
| Venue mutation | No | No | With manage grant | No | No |
| Ordinary booking create | No | With create grant and current Event assignment | No, unless also Coordinator with create grant | No | No |
| Operational BLOCKED/UNAVAILABLE window | No | No | With decision grant | No | No |
| Booking decision | No | Own tentative/cancelled edits with current Event assignment | With decision grant | No | No |
| User administration | No | No | No | With matching grant | No |

All role homes are implemented. A multi-role account can choose an already granted presentation role in the account menu without logging in again; this affects navigation only. The backend continues to check all verified roles plus effective capabilities and record relationships. Reload preserves the selected role while it remains granted. An unassigned role selection returns 403. No System Administrator role exists.

Organiser signup resolves an exact trimmed organisation name server-side in the same transaction as the profile. Matching names share an ID, including concurrent signup; duplicate email rolls back new organisation creation. Attendee company text never grants organisation membership, and client-supplied IDs/role lists are ignored. Membership is self-declared under the current signup contract; verified/invited affiliation remains a separate product decision. Staff roles can only be seeded, and the public/admin/internal provisioning endpoints reject staff grants or changes to seeded staff roles.

Coordinator booking detail/list/history and edits also recheck current Event assignment via Event service. Missing/foreign assignment denies 403; an unavailable proof returns 503 without writes. Technical Support receives only `venues.view` through an additive migration. Booking availability now uses that read permission; booking/venue writes retain action-specific grants. Logout, expiry and disable invalidate the backend session; inactivity at the configured boundary is expired (`>=`), and successful requests record their exact activity time.


## Current event-workflow access — 2026-10-06

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

All event routes additionally consume the top-level trusted auth-service permission array on every request. Request create/save/submit/resubmit require `event_requests.create`; Request/Event reads, history and contact require `events.view`; decisions require `event_requests.review`; the queue requires view and review. Empty permissions deny 403; missing/malformed upstream permission data fails503. Cached replay, body/header grants and nested user permissions never bypass these checks. Role/relationship checks remain business constraints after the capability gate. Staff option projection requires view permission; Technical Support's current default catalog does not grant it, so this branch adds no such grant.

Multi-role business checks use the verified roles array; effective capabilities are exactly those returned by auth-service, with no locally invented union or role fallback. Authentication's broader permissions administration is unchanged; no self-provisioning/reassignment rights are added. Missing organisation denies same-org access. Completed/cancelled history uses the same rules. Unauthenticated/expired/revoked401; wrong actor403; right actor/wrong state or stale version409. No ordinary history update/delete route.

These rules are exercised by real PostgreSQL API tests, BFF fixtures and separate live-auth checks. Full instructor access and independent product acceptance remain manual review gates.

---

Historical Sprint1 matrix and findings (retained for traceability; resolved by the amendment where event routes were touched):

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

### Venues and venue bookings (Sprint 2, rules decided 2026-10-07)

Venue Staff now have an interface (`/venue`). Every row is enforced by
venue-service / booking-service through permissions (`venues.view`,
`venues.manage`, `venue_bookings.create`, `venue_bookings.decide`), not
only by hiding buttons.

| Action | Organiser | Coordinator | Venue Staff | Tech Support | Attendee |
| --- | --- | --- | --- | --- | --- |
| View venues | No | Yes | Yes | No | No |
| Create / edit / delete a venue, set Active/Inactive | No | No | Yes | No | No |
| Create a venue booking (always starts Tentatively held) | No | Yes | **No** | No | No |
| Edit details of a booking | No | Own, while Tentatively held | No | No | No |
| Change a booking's status (confirm, reject, unavailable, cancel) | No | **No** | Yes | No | No |
| Block out time on the venue calendar | No | No | **No** | No | No |
| See a booking in full (title, reason, event, requester) | No | Own only | All | No | No |
| See other people's bookings | No | As "Not available" (times only) | In full | No | No |
| Booking history of a venue | No | Own bookings only | All | No | No |

Overlapping bookings are refused by booking-service (409 `BOOKING_CONFLICT`),
not only by the calendar. A venue marked Inactive cannot be booked.
Event bookings (event-service, not built yet) will be decided by the Event
Coordinator.

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

## Current booking creation amendment — 7 October 2026

The canonical create permission is required for an ordinary booking. `VENUE_STAFF` with decision permission can create only operational BLOCKED/UNAVAILABLE windows under that permission. Existing authorised staff replacements still use the shared staff policy. Technical Support does not gain booking access from its role alone. API checks reject denied creation before writes/history, and the calendar's new staff window presents only permitted statuses. This amendment is covered by the retained booking contract and live browser regression.
