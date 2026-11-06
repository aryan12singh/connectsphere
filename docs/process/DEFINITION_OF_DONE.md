# Definition of Done

Agreed by the Scrum Team and applied identically to every user story. A story is
**Done** only when every applicable item below is true. There is no partial credit.
A story that fails any item returns to the Product Backlog, is not presented at the
Sprint Review, and contributes zero story points to velocity.

---

## 1. Acceptance criteria satisfied

- Every acceptance criterion on the story is demonstrably met.
- Verified by someone other than the person who implemented it.

## 2. Automated and manual tests pass

- Unit tests exist for the story's logic and pass.
- Tests cover normal, boundary and failure cases, not only the happy path.
- Documented manual test cases for the story have been executed and pass.
- No known regression in any previously accepted story.
- CI pipeline green on the merge commit.

## 3. Code reviewed

- Merged into `main` through a pull request.
- Approved by at least one other developer.

## 4. AI-assisted code is understood, not just accepted

- Anyone submitting AI-generated code has read it and can explain what it does and
  why it is there.
- The reviewer confirms that understanding rather than approving unread code.

## 5. Integrated into the Increment

- Merged into `main` and working alongside all previously delivered stories.
- Runs from a clean clone by following the README, with no undocumented setup.

## 6. Documentation and design views updated where necessary

- C4 views, UML class diagrams, the ERD and the Swagger/OpenAPI contract are updated
  when the change affects them.
- README updated when the change affects how the system is run or configured.

## 7. Cross-cutting criteria satisfied where applicable

- Accessibility, security and UI criteria relevant to the story are met.
  Accessibility is a stated customer requirement, not optional.

## 8. Evidence recorded

- Test cases and a dated execution result are stored in the story's test-records
  folder, so each story traces to the tests that prove it.
- Jira card moved to Done by the person who did the work, with the pull request
  linked on the card.

## 9. Accepted by the Product Owner

- The Product Owner has accepted the story at, or before, the Sprint Review.

---

## Tasks (non-story work)

A **task** is Done when its artefact is committed to the repository or saved in the
agreed shared location, and its Jira card is updated. Tasks carry no story points.

---

## Scheduled additions

This Definition of Done is a baseline of the team's current capabilities, extended
as the team improves:

| Effective from | Addition | Reason |
| --- | --- | --- |
| Sprint 2 | Unit tests and green CI (item 2) | Unit testing, coverage and CI taught in Week 6 |
| Sprint 3 | Integration and end-to-end tests for cross-feature behaviour | Integration and E2E testing taught in Week 9 |
| Sprint 3 | An agreed code-coverage threshold, enforced in CI | Set from Sprint 2 measurements rather than claimed |
| Sprint 4 | A deliberate refactoring pass with no new code smells | Refactoring taught in Week 11 |

Deployment is deliberately not scheduled: the project requires a documented
clean-checkout run, which item 5 already covers.

## Undone work

Anything required to ship that this Definition of Done does not yet cover is
**undone work**. It does not disappear; it accumulates until release. The scheduled
additions above are how we reduce it each sprint.

---

## Change log

| Date | Change | Agreed at |
| --- | --- | --- |
| 2026-09-22 | First version | Sprint 1 Retrospective |
