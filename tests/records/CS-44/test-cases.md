# CS-44 — Test Case Specification (IS212 / IEEE 829)

Blue section. Written from the current Jira snapshot and implementation instructions. Matrix limits and history granularity remain provisional; execution evidence is separate.

| Test Case ID | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|---|
| TC-CS44-01 | 1,2,5,6 | Readable escaped history with pagination/error states | Authorised history entries | Expand; inspect actor/time/old-new; load older; retry error | HTML note; 20/21 entries; user and System | Newest first; escaped content; correct old/new/actor/time; empty/loading/error/retry handled | Component + native browser | 2026-10-06 |
| TC-CS44-02 | 1,3,4,5,6 | Transactional authorised persistent activity | Migrated PostgreSQL and owner/role/org fixtures | Run HTTP workflow; induce transaction failure; retry; query both entity scopes | Draft/Submitted/Returned/Planning/Completed/Cancelled fixtures | Real actions logged once; failure logs none; private/wrong role denied; Event link distinct; closed history retained; secrets excluded | Real-route API + PostgreSQL + live auth | 2026-10-06 |

TCs with a manual or real-route layer are not proved solely by a component execution record. API evidence is in the external test-results JSON and logs; native-browser evidence has its own dated record.
