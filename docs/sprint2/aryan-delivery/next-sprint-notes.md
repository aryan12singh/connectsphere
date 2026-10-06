# Week 7 changes for the next planning meeting

These are future Release 1 requirements from the local Drive mirror's Week 7 change summary, Updated Sprint Checklist and New Stories AC / Test Cases. They have not been added to the running Sprint 2 commitment. The customer places all six changes in the Week 12 release; estimates and sprint allocations in the planning documents remain proposals.

| Change | Contract and implementation consequence | Dependency to plan |
|---|---|---|
| Venue setup and turnaround buffers | Use start minus setup through end plus turnaround for availability/conflicts. Flag existing clashes rather than deleting bookings. | Venue configuration → shared interval calculation → search, calendar and booking checks |
| A booked venue becomes temporarily unavailable | Permit the operational flag, identify affected bookings and notify Coordinators. Preserve the event and request a replacement venue. | Impact detection → notifications → replacement search/request |
| Several venues for one Event | Enforce one active request per venue per Event; assess each independently. Changing one booking preserves the others. | Booking schema/uniqueness → per-venue search/request → readiness across all bookings |
| Tentative holds expire | Store an expiry, release elapsed holds and notify the Coordinator. Recheck availability before approving an expired request. | Hold creation and durable expiry processing → availability/status/calendar |
| Event Coordinator Lead | Replace automatic assignment on submission with an unassigned queue and manual Lead assignment/reassignment. Add its role, supervision screen and permissions. | Seven-role matrix → queue → assignment and revoked former-Coordinator access |
| Safety Officer review | Require approval after venue/technical arrangements and before preparation/confirmation. Support rejection/changes and re-review after relevant changes. | Seven-role matrix → readiness/status gate → review and rework workflow |

The proposed split is 29 points of foundations in Sprint 3 and 34 points in Sprint 4, across 16 new stories. Compare it with accepted Sprint 2 velocity and actual capacity before committing. The safety review chain must remain in the release because confirmation depends on it. Oversight and independent single-booking changes are the suggested capacity buffer candidates.

**Resolve issue identity before editing Jira.** The document proposes CS-45 through CS-60, but those numbers are not a reliable mapping to this live project. For example, its proposed CS-50 is buffer calculation while live Jira CS-50 is notification delivery. Map requirements by title/content and allocate real Jira keys; do not overwrite the existing notification ticket.

Keep the current Sprint 2 auto-assignment, current permission roles and operational block semantics until the team plans the replacement. The regression repair in this branch preserves current staff operational-window creation; it does not implement Week 7's affected-booking notifications, replacement venue workflow, buffers, multiple venues, expiring holds, Lead queue or safety gate.
