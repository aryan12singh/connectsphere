# Shared service test permissions

`role-permissions.js` is the canonical default permission snapshot used by the
booking and venue services only for their isolated test actors and explicit
`AUTH_MODE=mock` mode.

Production requests must carry a bearer token and resolve permissions through
auth-service's `/internal/sessions/validate` endpoint. A valid auth response
without a `permissions` array is rejected (fail closed); an empty array is
accepted as an authenticated user with no permissions and protected routes
return `403`.

The Docker Compose build context for booking and venue services includes this
folder so the test/mock adapter is available inside their images.
