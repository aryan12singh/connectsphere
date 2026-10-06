# Finish plan and explanation guide

The four implementation stories carry16 points total: CS-11(5), CS-27(3), CS-29(3), CS-44(5). They remain candidates for acceptance, not earned velocity, until the team's full DoD is met. Sprint2 ends8 October2026 at16:48 SGT according to the live Jira sprint. No unassigned Sprint2 issue was found in the complete assigned-or-empty query; other people's work has not been taken over.

1. Aryan reads and explains the AI-assisted source: `services/event-service/src/workflows.js`, `src/domain/validation.js`, `src/domain/transitions.js`, request BFF routes and the request/history Vue pages. Explain ownership/current-Coordinator checks, version locks, transactional assignment/outbox/history, durable idempotency and UTC/local date conversion.
2. Ask a different developer to run the documented fresh-stack review, inspect the new tests and approve the PR. Focused main migration-upgrade preservation evidence from the earlier checkpoint remains applicable because migrations/event source are unchanged by this verification pass.
3. Resolve the C02 venue/layout interpretation using the actual G8 Session1 answers, and agree how separate create/edit/assignment records satisfy CS-44's activity-count example. Keep actual audit actions; do not delete them to manufacture a count.
4. Aryan opens the PR with the supplied description; the team reviews and merges, then checks CI on the merge commit. No merge or PR was created automatically. CS-67's Sprint1 PR2/3 are merged; remaining task verification includes main CI and old-branch archive confirmation. Both old branch refs still exist.
5. Execute and record independent manual cases and PO acceptance. Only then move a story to Done and count its points.
6. Complete CS-70 using the exact confirmed instructor accounts and actual accepted GitHub/Jira-browse proof. The instructor-access sheet states what was verified and what is missing.

Review safeguards: Draft ownership is private even within an organisation; Event history has its own distinct Event ID and access rules; rejected requests cannot be reopened through amendment APIs; Submitted requests are read-only; failed/replayed writes do not add audit/outbox rows. Notification outbox persistence is proved, while actual relay/delivery is CS-50 work. Completed/Cancelled history is verified with persisted closed-state fixtures; this branch does not add their transition endpoints.

The calendar regression repair separates ordinary `venue_bookings.create` from staff decisions. Staff can still create operational BLOCKED/UNAVAILABLE windows under decision permission and update existing bookings; the UI defaults a new staff window to BLOCKED. Explain both the retained negative HTTP regression and the positive live UI checks. The original booking BFF's success200 is retained; direct service create remains201.

Week7 review for the next planning meeting: compare the new brief/change summary/new-story AC with the backlog, estimate and prioritise the new rules, and update contracts/tests before implementation. Nothing from that new brief is silently added to the running Sprint2 commitment here.
