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
| `PUT /api/bookings/:bookingId` | `PUT /venue-bookings/:bookingId` | Booking/status change |
| `GET /api/bookings/availability?venueId=` | `GET /venue-bookings/availability?venueId=` | Client-side conflict indication |

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
