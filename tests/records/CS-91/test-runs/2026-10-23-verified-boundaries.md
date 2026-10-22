# CS-91 verified execution — 23 October 2026

Source: clean `1c87348696b104adf911ecdde3214bcb4cf49b17`, Node 22.19.0. The production source is unchanged in `ea1cc7ab9e34f72a16c1bf2f472575299e062d71`; that commit updates one legacy browser fixture.

| Case | Executed proof | Result |
| --- | --- | --- |
| TC-CS91-25 | Production Booking HTTP handlers over memory stores: current impact proof, persistent category/private note and one logical same-key save | Passed |

The observation was captured at 19:58 UTC on 22 October (03:58 Singapore time on 23 October). Booking passed 104/104 tests. Notification passed 26/26 unit and 6/6 real PostgreSQL tests, including persistent delivery/current-source checks; PostgreSQL coverage was 75.25% lines, 51% branches and 68.75% functions. Existing thresholds were unchanged. The legacy Calendar explicit-impact-confirmation regression separately passed desktop/mobile 2/2 on the source committed as `ea1cc7a`.

The [case ledger, rows 137–162](https://docs.google.com/spreadsheets/d/1n7kRH5iPyHaxj5Rs41f53Shbn6TX-KXCdE7JcP9gQB8/edit#gid=1680394087&range=F137:U162) records final outcomes and actual UI/query/delivery evidence. [Required CI](https://github.com/aryan12singh/connectsphere/actions/workflows/event-workflows.yml) records committed full-stack runs; the [source map](../../../../docs/sprint4-venue-test-map.md) identifies executable tests.

Accepted policy corrects two draft expectations: shortening/removing a block retains Affected until explicit Staff confirmation; a block ending at occupied setup start is free, while ending after it overlaps. Public period/category changes refresh actionable notices; private notes stay private. Generated results remain outside Git. Developer review and Product Owner acceptance remain separate gates.
