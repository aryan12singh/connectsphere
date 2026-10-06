# CS-44 — Test Case Specification (IS212 / IEEE 829)

Blue section. Written from the current Jira snapshot and implementation instructions. Matrix limits and history granularity remain provisional; execution evidence is separate.

| Test Case ID | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|---|
| TC-CS44-01 | 1,2,5,6 | Readable escaped history with pagination/error states | Authorised history entries | Expand; inspect actor/time/old-new; load older; retry error | HTML note; 20/21 entries; user and System | Newest first; escaped content; correct old/new/actor/time; empty/loading/error/retry handled | Component + native browser | 2026-10-06 |
| TC-CS44-02 | 1,3,4,5,6 | Transactional authorised persistent activity | Migrated PostgreSQL and owner/role/org fixtures | Run HTTP workflow; induce transaction failure; retry; query both entity scopes | Draft/Submitted/Returned/Planning/Completed/Cancelled fixtures | Real actions logged once; failure logs none; private/wrong role denied; Event link distinct; closed history retained; secrets excluded | Real-route API + PostgreSQL + live auth | 2026-10-06 |
| TC-CS44-03 | 2 | Keyboard tabs retain unsaved input and wait for hydration | Owner's saved Draft; real production SSR or mounted request page | Inspect server HTML; wait for enabled controls; type purpose; navigate tabs with arrows, Home and End | Unsaved purpose | SSR tabs disabled until handlers attach; selected tab focused and alone in tab order; typed purpose retained | Mounted Vue + production desktop/mobile browser | 2026-10-07 |

TCs with a manual or real-route layer are not proved solely by a component execution record. API evidence is in the external test-results JSON and logs; native-browser evidence has its own dated record.

## Keyboard tab verification — 2026-10-07

TC-CS44-03: as the owning Organiser on a saved Draft, type an unsaved purpose; focus Details; press ArrowRight and verify History is selected and focused; press ArrowLeft and verify Details focus and the same unsaved purpose. Check End selects/focuses History and Home selects/focuses Details. Each tab has a unique panel relationship and only the selected tab is in the normal tab order. Verify the actual server HTML disables both tabs until their client keyboard handlers are attached. Mounted keyboard/input checks are in the main `tests/specs/CS-44.spec.ts`; actual SSR/desktop/mobile checks are in `frontend/e2e/CS-44.spec.ts`. The initial real desktop focus failure and the later mobile hydration failure are preserved in dated records. This is agent-run evidence, not independent human acceptance.


Permission regression amendment (2026-10-07): trusted auth-service permissions are required in addition to the existing role/record relationship. Request writes require `event_requests.create`; Request/Event reads/history require `events.view`; queue/decisions require `event_requests.review` (queue also view). Removed permissions deny403 before transaction/replay; malformed permission responses fail503. See CS-11 TC-CS11-21 and real-PG permission regressions. Caller fields never supply grants.
