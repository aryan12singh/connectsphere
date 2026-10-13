# Venue and booking BFF contract

The selected Figma frames (`Venue Details Modification Form — Desktop` and
`Venue Booking — Desktop`) are served through Nuxt's authenticated BFF. The
browser calls `/api/*`; the BFF calls the same public paths on Kong using the
opaque bearer token held in the sealed session cookie.

## Route mapping

| BFF route | Kong route | Frame use |
| --- | --- | --- |
| `GET /api/venues/options` | `GET /venues/options` | Controlled venue types, layouts, facilities and accessibility values |
| `GET /api/venues?search=` | `GET /venues?search=` | Manage-venues list |
| `GET /api/venues/:venueId` | `GET /venues/:venueId` | Venue detail/edit form |
| `PUT /api/venues/:venueId` | `PUT /venues/:venueId` | Replace venue details and operating hours |
| `DELETE /api/venues/:venueId` | `DELETE /venues/:venueId` | Delete any venue when no current/future tentative or confirmed booking is linked |
| `GET /api/venues/:venueId/operating-hours` | `GET /venues/:venueId/operating-hours` | Operating-hours editor |
| `PUT /api/venues/:venueId/operating-hours` | `PUT /venues/:venueId/operating-hours` | Save hours with a reason |
| `GET /api/venues/:venueId/history/combined` | venue history + `GET /venue-bookings/history?venueId=` | Single combined version-history surface in the booking frame |
| `GET /api/bookings?...` | `GET /venue-bookings?...` | Booking queue/list |
| `POST /api/bookings` | `POST /venue-bookings` | Create booking; forwards `Idempotency-Key` |
| `GET /api/bookings/:bookingId` | `GET /venue-bookings/:bookingId` | Booking detail |
| `DELETE /api/bookings/:bookingId` | `DELETE /venue-bookings/:bookingId` | Protected-method denial405 after authentication/current access; bookings and history retained |
| `PUT /api/bookings/:bookingId` | `PUT /venue-bookings/:bookingId` | Booking/status change |
| `PUT /api/bookings/:bookingId/decision` | `PUT /venue-bookings/:bookingId/decision` | Versioned Venue Staff approve/reject with reason |
| `PUT /api/bookings/:bookingId/hold-extension` | `PUT /venue-bookings/:bookingId/hold-extension` | Versioned active-hold extension with future deadline/reason |
| `GET /api/bookings/events/:eventId/summary` | `GET /venue-bookings/events/:eventId/summary` | Independent rooms, current assignment, authoritative Venue type/capacity, expiry, flags and venue readiness |
| `GET /api/bookings/events/:eventId/venue-search` | `GET /venue-bookings/events/:eventId/venue-search` | Current Coordinator's requirement-aware room search |
| `GET /api/bookings/conflicts?venueId=` | `GET /venue-bookings/conflicts?venueId=` | Venue Staff current conflict review, both occupied windows and assignment |
| `POST /api/bookings/rechecks` | `POST /venue-bookings/rechecks` | Initial buffer rollout recheck, authenticated Staff actor, current venue version and reason |
| `GET /api/bookings/availability?venueId=` | `GET /venue-bookings/availability?venueId=` | Server-derived occupied intervals; client preflight uses the returned timing policy |

The BFF does not rename or normalize service fields. Venue form values remain
`supportedLayouts`, `facilities`, `accessibilityTags`, `timeZone`,
`managedById`, `operatingHours` (non-empty), and `reason`. Booking values remain
`eventId`, `venueId`, `title`, `reason`, `startAt`, `endAt`, `timeZone`, and
the requested persisted `status`. The booking service decides whether the
actor may use that status.

`GET /api/venues/:venueId/history/combined` returns `{ venueId, items }`, where `items`
contains both service records and keeps each record's `source`, actor, reason,
change payload, and `occurredAt` fields. The BFF sorts the combined list newest
first; it does not write either history store.

The frontend contract is intentionally named `/api/bookings/*`; only the Kong
and booking-service contract retains the `/venue-bookings/*` path.

## Sprint 3 venue integration — 12 October 2026

The Event page adds room search/request/release using the current interface while
the Sprint 3 Figma work is pending. It uses the distinct approved Event ID, not
the request ID. Defaults come from current Event requirements; the Booking
projection maps known request-form labels to catalogue codes. Search lists
full/partial matches and occupied intervals without reserving. Each request
retains its idempotency key for the same payload, creates an independent hold,
and displays its persisted deadline/countdown and read version.

Venue create/edit carries `setupMinutes`, `turnaroundMinutes` and `version`.
Calendar shows separate buffers and hides a fetched hold at its deadline without
navigation. Read-only viewers retain operational closure labels but cannot see
another Event's private title/reason or mutate it. Coordinator editing follows
current assignment rather than the original requester.

The Staff queue uses versioned decision/extension routes with an entered reason,
current needs, occupied timing, flags and deadline. Ordinary creation cannot
confirm a booking; unrestricted Staff status changes are superseded by guarded
active-hold decisions. Stale/conflicting/expired attempts have no history or
intent effect. BFF error status/body remain preserved; refresh/retry are explicit.

All remaining required rooms must be approved for current needs for venue
readiness. That projection is not full Event readiness, technical approval or a
Safety decision. [Policy register](venue-policy-decisions.md) and
[phase delivery](devlogs/2026-10-12-venue-workflows.md) identify the pending gates.

## Sprint 3 continuation — 13 October 2026

The Staff Buffer conflicts tab compares preserved commitments side by side using
current Venue settings and occupied-window ends. Staff can run an explicit initial
rollout recheck with a reason and the Venue version they read. It cannot delete,
force-confirm or cancel an approved arrangement. Stale configuration returns409;
repeated successful rechecks do not duplicate booking history or notice intent.

Find alternatives prefills the selected room's attendance, times, layout and needs
and sends `bookingId` plus `bookingVersion`. The search excludes the original venue
and remains read-only. An assigned Coordinator can move an unapproved room with a
versioned PUT; siblings and the booking ID/history remain unchanged. Approved-room
alternative assessment has no direct replacement mutation within this phase.
Changing criteria, source identity or Event invalidates pending search results.
A stale move refreshes the selected booking version while preserving edited criteria;
arranging actions require the displayed Event to match the route. A new
request after an acknowledged request was released uses a new action key; an
ambiguous failed retry retains its key.

The Staff queue disables decisions/extensions at the deadline while open. An
imported hold whose Event is missing remains visible with `EVENT_NOT_FOUND` and no
action controls; one orphan does not block healthy requests. Real Event dependency
outages still fail closed. The calendar recognizes an authorized secondary Staff
role, offers only operational-window transitions, and keeps approved arrangements
read-only. Historical removed venues do not break future availability. Movement
appears in both involved venue timelines while creation stays at its origin;
current-assignment filtering protects both timelines.

See [dated delivery and evidence](devlogs/2026-10-13-venue-workflows.md). The
independent audit and automation do not replace team review or PO acceptance.

## Authentication and errors

Every route requires a Nuxt session with a server-side token. Kong and the
owning service remain responsible for `venues.view`, `venues.manage`, and
`venue_bookings.create`/`venue_bookings.decide` authorization. Service error HTTP status codes and
error bodies are preserved by the existing `backendFetch` adapter; a missing
or unreachable Kong response becomes the existing BFF 401/503 behavior.

The BFF is transport-only: validation, ownership, idempotency, status rules,
and database writes stay in the venue and booking services.

## Creation permission regression repair — 7 October 2026

Ordinary `POST /venue-bookings` requires `venue_bookings.create`. Venue Staff may instead create an explicit BLOCKED or UNAVAILABLE operational window with `venue_bookings.decide`; that exception does not grant ordinary creation. Their calendar starts such a new window at BLOCKED and offers only those two statuses. Existing staff booking decisions/edits and Coordinator tentative/cancelled creation keep the prior status rules. The original create-permission regression test is preserved, with positive operational-window/replay checks and denied-create/no-history checks added. No schema, response shape or shared auth permission list changed.

The existing booking BFF returns200 on successful creation (it forwards the body through backendFetch). Direct booking-service creation remains201, with200 on idempotent replay. The live browser regression checks this existing BFF behavior and then reads the persisted ID/status and unchanged history after denied writes; it does not change the transport contract.

## Venue time and current assignment — 7 October 2026

Coordinator, Venue Staff and Technical Support may read venue details and availability with `venues.view`; only Venue Staff with `venues.manage` changes a venue. Public roles remain denied even if someone adds a staff capability to them. Technical Support's additive migration grants read access only. The support calendar hides creation/edit controls and does not fetch forbidden Event options.

An open operating-hours row requires `closesAt > opensAt`; equality/reversed hours return422 on create, full replacement and the hours-only endpoint without changing venue/history. Calendar day/week boundaries use the venue's IANA zone; each civil midnight is converted independently so DST days have 23 or 25 hours. Intervals split at local midnight and clip to the selected view. Cleared/invalid or ambiguous local booking inputs disable save and show field guidance.

Ordinary Coordinator bookings require the caller's create grant and the current assignment of the actual Event ID. Booking-service asks `GET /events/:eventId/booking-access` on Event service using the same verified bearer token; it never reads event_db or trusts an assignment field in the browser. Detail, edit, list and history recheck current assignment as well as booking ownership. Foreign/removed assignment returns 403; dependency failure returns 503 before writes, with safe retry guidance. Venue Staff with the decision grant may act on existing bookings and create operational windows without an Event link.
