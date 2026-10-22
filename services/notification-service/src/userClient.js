const config = require('./config');

// Display name of a user (e.g. the Coordinator named in a notice).
// Throws if user-service cannot be reached, so the delivery is retried.
async function displayName(userId) {
  if (!userId) return null;
  const response = await fetch(`${config.userServiceUrl}/internal/users/${encodeURIComponent(userId)}`, {
    headers: { 'x-internal-api-key': config.internalApiKey },
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 404) return 'a Coordinator';
  if (!response.ok) throw new Error(`User service returned ${response.status}`);
  const user = await response.json();
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'a Coordinator';
}

// CS-51: ids of all ACTIVE users holding a role (e.g. every Venue Staff
// member for a new booking request). Uses user-service's existing paged
// internal list. Throws if user-service is down, so delivery is retried.
async function activeUsersWithRole(role) {
  const ids = [];
  for (let page = 1; page <= 40; page += 1) { // 40 x 25 = 1000 users max
    const url = `${config.userServiceUrl}/internal/users?role=${encodeURIComponent(role)}&page=${page}`;
    const response = await fetch(url, { headers: { 'x-internal-api-key': config.internalApiKey }, signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error(`User service returned ${response.status}`);
    const body = await response.json();
    for (const user of body.users || []) if (user.isActive !== false && user.id) ids.push(user.id);
    if (page * (body.pageSize || 25) >= (body.total || 0)) break;
  }
  return ids;
}

async function registeredAttendees(eventId){
 const response=await fetch(`${process.env.ATTENDANCE_SERVICE_URL||'http://attendance-service:3000'}/internal/events/${encodeURIComponent(eventId)}/notification-recipients`,{headers:{'x-internal-api-key':config.internalApiKey},signal:AbortSignal.timeout(5000)});
 if(!response.ok)throw Error('Unable to resolve confirmed registration recipients');
 return (await response.json()).items||[];
}
module.exports = { displayName, activeUsersWithRole,registeredAttendees };
