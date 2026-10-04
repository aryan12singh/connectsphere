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
`venue_bookings.create`/`venue_bookings.decide` authorization. Service HTTP status codes and
error bodies are preserved by the existing `backendFetch` adapter; a missing
or unreachable Kong response becomes the existing BFF 401/503 behavior.

The BFF is transport-only: validation, ownership, idempotency, status rules,
and database writes stay in the venue and booking services.
