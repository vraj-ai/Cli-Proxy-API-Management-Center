# Fleet overview

The default landing page (`#/fleet`) summarizes the proxy instance: connection status, provider accounts with model counts, the latest request pace, and quota per account with stale markers.

## Sub-features

- `overview-status` `Proxy instance status` region shows Connected.
- `overview-providers` `Provider accounts` lists `openai` and `anthropic`.
- `overview-pace` `Latest completed request` shows tokens/second.
- `overview-quota` `Quota by account` shows Daily/Weekly bars, anthropic marked `Stale`.
- `overview-absent` with Fleet absent, `Fleet is unavailable` notice.

## How to get to it (user POV)

- Log in (lands here), or `Fleet sections` nav → `Overview`, or `#/fleet`.

## Driving it with mc.sh

Preconditions:

- Baseline from README (Fleet present).

- **Overview.** Run `mc.sh drive fleet-overview`. Headings `Provider accounts` and `Quota by account` and text `openai` are present. Proof: `02-fleet-overview.png/.aria.txt`.
- **Absent mode.** Start the fixture manually with `FLEET_FIXTURE_MODE=absent FLEET_FIXTURE_PORT=4181 bun scripts/fleet-fixture.ts`; expect status `Fleet is unavailable`. Not wrapped by mc.sh.

## Gotchas

- Pace and quota reset times are generated at fixture start; don't assert exact timestamps.
- `Refresh All` in the header refetches; wait for headings rather than sleeping.
