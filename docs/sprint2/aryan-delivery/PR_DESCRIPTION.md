# Implement persistent organiser request workflows and authorised history

Organisers can submit and reopen persistent requests, save and resume incomplete private Drafts, amend a returned request and resubmit it with the same ID/Coordinator, and inspect authorised actor/time/old-new history through the live BFF. Failed saves retain input; request writes use guarded versions and durable idempotency, with assignment/outbox/history recorded transactionally.

Adds production desktop/mobile Chromium coverage and feature-branch/PR/main CI, including real Keycloak/Kong/PostgreSQL, a real service outage/retry and restart persistence. Corrects required-field cues, unique label targets, keyboard tab navigation, and the booking create-permission regression while preserving staff operational windows and existing decisions. Targeted compatible dependency patches are locked.

Validation evidence and final run links are in `docs/sprint2/aryan-delivery/verification.md` and dated story records. C02 venue/layout interpretation and CS-44 activity granularity remain explicit review decisions. Independent developer review, manual tests, Aryan's code understanding, green merge CI and PO acceptance are required before Done. Existing dependency advisories remain documented.
