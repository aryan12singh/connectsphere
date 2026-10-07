# CS-27 — Test Case Specification (IS212 / IEEE 829)

Blue section. Written from the current Jira snapshot and implementation instructions. Matrix limits and history granularity remain provisional; execution evidence is separate.

| Test Case ID | AC | Test Scenario | Pre-conditions | Test Steps | Test Data | Expected Result | Automation layer | Date of Creation |
|---|---|---|---|---|---|---|---|---|
| TC-CS27-01 | 1,2 | Returned interface and errors | Owner has a returned request | Open/edit; inspect comments and submit invalid attendance | Escaped HTML comments; attendance 0 | Comments beside shared form; all errors linked to controls; entered values retained | Component + live browser | 2026-10-06 |
| TC-CS27-02 | 3,4,6 | Same-record amendment and replay | Assigned Coordinator returned a complete request | Save two amendments; resubmit concurrently with one key; read history | Attendance 50 to 75; additional description | Same request ID/Coordinator; revisedAt; Submitted; old values reflect return baseline; one resubmit/outbox | Real BFF + PostgreSQL + live auth | 2026-10-06 |
| TC-CS27-03 | 2,5 | Invalid actor, state and unchanged-content guard | Owner, other Organiser and rejected/returned records | Attempt wrong-owner save; unchanged/invalid resubmit; rejected edit | Missing mandatory fields; unchanged content | 403 wrong actor; 409 state/no changes; 422 validation; no persisted overwrite | Real BFF + PostgreSQL | 2026-10-06 |

TCs with a manual or real-route layer are not proved solely by a component execution record. API evidence is in the external test-results JSON and logs; native-browser evidence has its own dated record.


Permission regression amendment (2026-10-07): trusted auth-service permissions are required in addition to the existing role/record relationship. Request writes require `event_requests.create`; Request/Event reads/history require `events.view`; queue/decisions require `event_requests.review` (queue also view). Removed permissions deny403 before transaction/replay; malformed permission responses fail503. See CS-11 TC-CS11-21 and real-PG permission regressions. Caller fields never supply grants.
