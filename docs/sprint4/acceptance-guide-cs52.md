# CS-52 acceptance guide (Marc)

How to test each CS-52 acceptance criterion and what to screenshot. Case IDs match `tests/records/CS-52/test-cases.md`.

**What runs live today.** Registration (AC1) and effective Event changes (AC2) are live. These parts are covered by automated tests only:
- waitlist (CS-48 leaves it out of Release 1);
- withdrawal (CS-49 not merged);
- the cancellation publisher (CS-54 not merged).

## Part A — automated evidence (all six cases)

Use Git Bash on Windows; npm must use it as its script shell (see the Sprint 3 guide).

```bash
cd services/notification-service
npm install
npm run test:unit -- --test-reporter=spec
```

**Screenshot 1:** the six lines `✔ TC-CS52-01` … `✔ TC-CS52-06`, plus the final `pass`/`fail` totals.

If running locally is a problem, open the PR's GitHub Actions run, expand the notification-service unit step, and screenshot the same lines.

## Part B — live registration notice (AC1, TC-CS52-01)

1. Start the full stack and load the seed, as in `docs/how-to-run-and-test.md`:
   `docker compose -f infra/docker-compose.yml up --build -d`.
2. Start the frontend (`cd frontend`, `npm run dev`, with `NUXT_AUTH_MODE=live` in `.env`). Open http://localhost:3000.
3. Sign in as the Attendee `ethan.goh@gmail.com` / `Ethan@CS13!`.
4. Open **Attendances**, choose **ConnectSphere Spring Showcase** and click **Register**.
   - **Screenshot 2:** the Registered status and places remaining.
5. Wait a few seconds and open the notification bell.
   - **Screenshot 3:** *Your registration for "ConnectSphere Spring Showcase" is confirmed.*
   - Clicking it opens `/attendances/events/f1000000-0000-4000-8000-000000000016`.
6. Sign out and sign in as another Attendee, `nur.aisyah@outlook.com` / `Nur@CS14!`.
   - **Screenshot 4:** the bell does not show Ethan's notice (AC5).
7. Optional, to show privacy and identity in the database:

   ```bash
   docker compose -f infra/docker-compose.yml exec postgres psql -U connectsphere -d notification_db -c "SELECT \"recipientId\",type,\"eventRequestId\",\"sourceMessageId\",data FROM notifications WHERE type='REGISTRATION_CONFIRMED';"
   ```

   - **Screenshot 5:** one row, with `eventRequestId` empty and data limited to the Event name, ID, version and time.

## Part C — effective change (AC2) and pending change (AC4)

These need a confirmed Event with a registration, a venue replacement, and Safety re-approval. They reuse Aryan's CS-92 flow. If that flow is not set up on your machine, use Part A as the evidence.

1. With Ethan registered (Part B), sign in as the Event's Coordinator. Approve a venue replacement (CS-92).
   - Check Ethan's bell before Safety re-approval: there is **no** change notice yet (AC4).
   - **Screenshot 6:** Ethan's bell with no change notice.
2. Get Safety approval, then confirm the Event as the Coordinator.
   - **Screenshot 7:** Ethan's bell showing *The confirmed details … changed to … at <venues>*.
3. While the venue is still unavailable, check the Organiser's bell.
   - **Screenshot 8:** the Organiser's *A venue … needs an alternative* notice, which appears immediately (AC4).

## Mapping to the Jira criteria

| AC | Evidence |
| --- | --- |
| AC1 | Screenshots 1–3. Waitlist and withdrawal are in Screenshot 1 only. |
| AC2 | Screenshot 1 (TC-CS52-02); Screenshot 7 if Part C was run |
| AC3 | Screenshot 1 (TC-CS52-03); live once CS-54 publishes `EventCancelled` |
| AC4 | Screenshot 1 (TC-CS52-04); Screenshots 6 and 8 |
| AC5 | Screenshots 1, 4 and 5 |
| AC6 | Screenshot 1 (TC-CS52-06) |
