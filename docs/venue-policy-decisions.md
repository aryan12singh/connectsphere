# Venue and operations policy register

Updated 14 October 2026 from the customer’s **Session 3 - Clarification Answers_G8.xlsx**, sheet G8, column C. The [source transcript](session3-decisions.md) records every answer and the source hash. Customer answers supersede earlier discussion assumptions and future test expectations; previous execution records remain historical.

| Topic | Confirmed requirement | Implementation / remaining decision |
| --- | --- | --- |
| Buffer authority and locking, rows4/6/28 | Venue Staff set independent non-negative buffers; subsequent adjustments restricted | Exact lock point conflicts between “once set” and “once venue is confirmed”; legacy first-setting treatment also needs clarification. Minimum confirmed-booking restriction is implemented with a durable Venue lock before approval. Existing venues are conservatively frozen by migration pending legacy review. Earlier initial-setting policy remains unresolved; keep CS-84 open until clarified. |
| Touching intervals, row5 | Setup-to-turnaround windows may touch; positive overlap forbidden | Default matches. Deployment must retain `VENUE_ALLOW_TOUCHING=true`; false is a legacy alternative, not the customer rule. |
| Numeric buffer cap | Customer specifies no upper bound | 480-minute configurable cap and zero legacy defaults remain team choices, not customer mandates. |
| Opening hours | Customer has not supplied overnight/closed-day exceptions | Current full occupied-window check remains; overnight hours unsupported. |
| Hold approval, rows10–11 | Coordinator confirms the hold venue and informs Staff; Staff approves; expiry never confirms Event | Staff approval implemented. Clarify whether Coordinator’s request already satisfies row10 or a separate confirmation action is needed. |
| Hold timing, rows31–32 | Team decides duration, extensions and warning timing | Working 72-hour duration, expiry capped at setup, Staff extensions and no count cap need team ratification; scheduler/notices remain CS-90/50/51. |
| Equipment, rows11/29/34 | No equipment holds; venue buffers do not automatically apply; location is logistical | Alan’s equipment boundary; empty equipment is not proof of approval or NOT_REQUIRED. |
| Multiple venues, rows23–27/50/53 | Independent room times within Event, each capacity respected, every required room approved; no cancellation cascade | Implemented room foundation; overall registration/capacity policy still requires agreement. |
| Primary location, row26 | Coordinator chooses primary attendee location; Organiser sees every room | Versioned private primary selection implemented in Booking and Coordinator UI. Public/Organiser projections remain integration work; selection does not publish or confirm Event. |
| Changes and unavailability, rows7–9/16/30/51–52 | Coordinator reviews; no automatic cancellation or approval resets. Replacement needs full approval; restoration needs availability and Staff confirmation | Retain manual flags/history; CS-88/91/92 and notice consumers remain required. |
| Safety, rows2–3/17/45–47/49–51 | Safety before Confirmed, separate Preparation; structured checklist, actionable Organiser feedback, private internal notes; rejection targets venue arrangement, Event stays Planning | Local validation/feedback/rework updated. CS-10/42/77 still supply real roles, technical proof, versioned commands and lifecycle. |
| Assignment and accounts, rows12–15/18–22/33/35–43 | Manual Lead assignment; no Coordinator transfer or Lead Coordinator/admin powers; controlled internal account setup | Shared peer-owned access/lifecycle work; cross-Lead scope still needs agreement. |

The CS-86 recheck worker defaults to 5 seconds, retries durable configuration-change intent, and does not itself expire holds or deliver notifications. It remains useful for initial buffer rollout and permitted venue-capacity/hours/access changes; it does not authorize later buffer edits.

Jira CS-76/77 and affected story descriptions carry the source-row requirements. Keep numeric team decisions, unresolved wording, implementation evidence, independent review and PO acceptance separate. No story is closed merely because its requirements were clarified.
