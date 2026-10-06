# Venue/booking startup and CI regression

[Run 37512291335](https://github.com/aryan12singh/connectsphere/actions/runs/37512291335), on the documentation publication `253f538320621308f6699b6a91ca6e41802a8518`, failed before any booking HTTP cases ran. The child printed “booking-service listening on port 43102”, then exited; the old harness reported zero tests and a startup error. This run is retained as a failure, regardless of the earlier successful application run.

The installed Express 5 implementation passes a listen error to the callback. Both service callbacks ignored that argument and logged success even on an occupied port. Four new process-boundary tests reproduced this as **0/4 RED**: occupied ports exited successfully, and `PORT=0` logged zero instead of the actual assigned port. An ephemeral-port collision is a plausible explanation for the CI failure; the original log did not capture its bind error, so the exact runner collision is not claimed as proven.

Both services now report the bind error and exit unsuccessfully, and log the actual bound port on success. Default production ports remain unchanged. HTTP contracts default to OS-assigned port zero, read that child's actual listening port, require the matching service health response and fail promptly with captured output/exit status. Explicit test-port overrides remain supported. Class cleanups terminate children and close reader pipes, including failed setup; the venue fixture also closes its fake booking server.

The new occupied-port and live-health tests pass **4/4 GREEN** on Node 22. The separate forced-collision harness check proves that both suites fail with `EADDRINUSE`, exit 1, zero HTTP cases and clean teardown, rather than passing against another process or waiting eight seconds. Full local suites pass **Venue 42 unit + 10 HTTP = 52/52** and **Booking 34 unit + 14 HTTP = 48/48**, with no weakened business/permission assertions.

- [RED evidence](evidence/startup-ports-red.json)
- [GREEN startup/cleanup evidence](evidence/startup-cleanup-green.json)
- [Forced-collision diagnostics](evidence/contract-startup-diagnostics-green.json)
- [Venue full suite](evidence/venue-startup-full-green.json)
- [Booking full suite](evidence/booking-startup-full-green.json)
- [Latest exact-commit feature checks](https://github.com/aryan12singh/connectsphere/actions?query=branch%3Afeat%2Faryan-sprint2-event-workflows)

These are automated supporting infrastructure regressions, not human acceptance of a teammate's story. Node's unit coverage now includes startup-imported app/routes: the local aggregate is Venue **82.30 / 89.96 / 78.52%** and Booking **79.43 / 90.50 / 78.13%** (lines / branches / functions; includes test files). HTTP contract coverage is not merged into that percentage. The earlier coverage figures in the historical CI result describe their own measured scope.

## Restart authentication rate-limit repair

[Run 37514069476](https://github.com/aryan12singh/connectsphere/actions/runs/37514069476), on `69fe2016b8222ba2aa66de4a2106c40fcde3492a`, passed the entire regression job and all **22/22 browser cases**, then failed before the restart assertion: the new owner session received HTTP429. Kong's existing login policy remains ten attempts per client per minute; browser setup already respected that limit, but the standalone smoke setup did not. This overall run remains recorded as failed.

Smoke authentication now honors numeric Retry-After with a bounded one-to-sixty-second wait (missing/malformed headers default to the minute window), at most three attempts. Only authentication setup's429 is retried. Credential/server failures and network errors propagate immediately; workflow writes, assertions, browser cases and the CI job are not rerun by this helper. A permanent429 is returned after the bound, so the existing exact200 login assertion still fails it.

Five targeted tests recorded **2 pass / 3 fail RED**, then **5/5 GREEN**, covering recovery with the original response, exhaustion, missing/malformed headers, non429 failures and network propagation. See [RED](evidence/smoke-login-backoff-red.json) and [GREEN](evidence/smoke-login-backoff-green.json). [Run 37515969069](https://github.com/aryan12singh/connectsphere/actions/runs/37515969069) subsequently passed both complete jobs, all22 browser cases, live10/10 and no-reseed restart1/1 on a clean source checkout. Its actual source and results are in the [portable CI summary](evidence/ci-37515969069.json).
