# CS-90 verified execution — 23 October 2026

Source: clean `1c87348696b104adf911ecdde3214bcb4cf49b17`, Node 22.19.0. The production source is unchanged in `ea1cc7ab9e34f72a16c1bf2f472575299e062d71`; that commit updates one legacy browser fixture.

| Case | Executed proof | Result |
| --- | --- | --- |
| TC-CS90-16 | Production Booking HTTP handlers over memory stores: a distinct freshly checked resubmission retains expired history and removes the old request from unresolved readiness | Passed |

The observation was captured at 19:58 UTC on 22 October (03:58 Singapore time on 23 October). Booking coverage passed 104/104 tests with 96.86% lines, 83.57% branches and 97.43% functions. Notification passed 26/26 unit and 6/6 PostgreSQL tests. Existing thresholds were unchanged. Controlled-clock component checks distinguish approval at T−1 second from refusal at T and T+1; the separate browser source uses twenty real PostgreSQL row barriers and the existing production expiry scanner.

The [case ledger, rows 121–136](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F121:U136) records the final case outcomes, elapsed deadlines, worker/restart proof and stage-specific images. [Required CI](https://github.com/aryan12singh/connectsphere/actions/workflows/event-workflows.yml) records committed full-stack runs; the [source map](../../../../docs/sprint4-venue-test-map.md) identifies executable tests.

Expiry is the computed `effectiveStatus: EXPIRED` of the retained tentative row, not a new stored enum. Fixture-controlled deadlines and assignment changes are labelled explicitly. Generated results remain outside Git. Developer review and Product Owner acceptance remain separate gates.
