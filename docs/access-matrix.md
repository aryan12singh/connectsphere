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
