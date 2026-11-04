---
name: verify-management-center
description: Launch, drive, and capture proof for the CLI Proxy API Management Center web UI (React single-file app at /management.html) against the repo's own fixture backend (scripts/fleet-fixture.ts), using headless Chrome via playwright-core. Use when you need to prove a UI change works in a real browser, reproduce a UI bug, or verify a route/feature from features/.
---

# verify-management-center

The Management Center is a web UI only (no proxy). In production it is served by CLIProxyAPI at `/management.html` and talks to `/v0/management/*` with `Authorization: Bearer <management key>`. For verification we serve the built `dist/index.html` from the repo's own mock backend, `scripts/fleet-fixture.ts`, which implements the management API (Fleet, keys, config stubs) in memory. No real provider is ever called.

All commands below run from the repo root. The helper is `.cursor/skills/verify-management-center/scripts/mc.sh` (call it `MC` below).

```bash
MC=.cursor/skills/verify-management-center/scripts/mc.sh
```

## Launch

```bash
$MC launch            # bun install (if needed) → bun run build → start fixture on MC_PORT (default 4173)
```

- Ready when it prints `ready: http://127.0.0.1:4173 ...` (it waits for the fixture's `Fleet fixture ready` log line).
- Build log and fixture log: `/tmp/mc-verify-$MC_PORT/{build.log,fixture.log}`; PID in `/tmp/mc-verify-$MC_PORT/pid`.
- Isolation: one instance per port. Run side by side with `MC_PORT=4180 $MC launch` (use the same `MC_PORT` for every later command). Launch refuses if the port is busy or a previous run is still recorded — run cleanup, do not reuse someone else's instance.
- Fixture login: URL is auto-detected from the page, key is `fixture-management-key` (public, hard-coded in the fixture; not a secret). Never paste a real management key into evidence.
- Fleet-absent variant (Fleet plugin disabled): start the fixture manually with `FLEET_FIXTURE_MODE=absent` — not wrapped by mc.sh.
- First run also installs `playwright-core` into `~/.cache/mc-verify-tools` (outside the repo; does not touch `bun.lock`). Browser: `/usr/bin/google-chrome` (override `MC_CHROME`).

## Doctor

```bash
$MC doctor            # read-only; exit 0 = worth driving
```

Checks: recorded PID alive; port owned by our process group; `management.html` returns 200; `/v0/management/config` returns 401 without a key; `/v0/management/fleet/state` accepts the fixture key; `dist/index.html` is newer than `src/` (warn = stale build, re-launch). Run it first whenever anything looks off.

## Drive

```bash
$MC drive <feature>   # runs scripts/drive.mjs in headless Chrome, locale en-US, 1440x900
```

Features implemented in `scripts/drive.mjs`: `login`, `fleet-overview`, `fleet-create-key`, `nav-smoke`. Each starts by logging in through the real login form (placeholder `Enter the management key`, button `Open console`) and waits for the H1 `Instance overview`. Handles are ARIA roles + English accessible names from `src/i18n/locales/en.json`; the browser locale must stay `en-US` or names change (fallback language is zh-CN). To add a recipe, add an entry to `features` in drive.mjs using `check()` and `shot()`, and document it in `features/`.

The feature map in [`features/README.md`](features/README.md) is the source of truth for what to drive and what proves it.

## Evidence

Every drive writes to `.verify/<YYYYmmdd-HHMMSS>-<feature>/` (override root with `MC_EVIDENCE`, run name with `MC_RUN`); keep `.verify/` out of git (it is listed in `.git/info/exclude` on this box; add it there in a fresh clone):

- `NN-<step>.png` full-page screenshot + `NN-<step>.aria.txt` ARIA snapshot at each state (before and after the action, not just the final screen)
- `result.json` — feature, URL, per-step PASS/FAIL, browser console errors
- `drive.log` — timestamped transcript; `zz-failure.*` on failure
- Side-effect read-backs, e.g. `05-fleet-keys.json` (backend `GET /v0/management/fleet/keys`, fetched independently of the UI)

Proof standards: go through the real user path (login form, nav links, buttons), never call store setters or poke localStorage; for mutations, confirm both the UI state and a second read from the backend; report the fixture as the backend (it is a mock — behavior that depends on real CLIProxyAPI semantics is NOT proven here and must be called out). Fixture secrets such as `sk-flt-fixture-0000` are fake, but still don't copy secret values into reports.

## Cleanup

```bash
$MC cleanup           # kills only the recorded PID's process group, removes /tmp/mc-verify-$MC_PORT
```

Never `pkill bun`/`vite`. Cleanup never touches `.verify/` or `dist/`. Run it after every run, including failed iterations, then confirm `ss -ltn 'sport = :4173'` shows nothing.

## Helpers

- `scripts/mc.sh launch|doctor|drive <feature>|cleanup` — lifecycle wrapper (env: `MC_PORT`, `MC_EVIDENCE`, `MC_RUN`, `MC_STATE`, `MC_TOOLS`).
- `scripts/drive.mjs <feature>` — browser recipes; normally invoked via `mc.sh drive` (needs `NODE_PATH`, `MC_URL`, `MC_KEY`, `MC_OUT`, which mc.sh sets).
- Repo checks that complement (not replace) browser proof: `bun run verify` (tests + lint + build). There is no browser DOM test harness in `tests/`.

Full proof loop:

```bash
$MC launch && $MC doctor && $MC drive fleet-create-key; $MC cleanup; ls .verify/
```

Keep the map honest with `/maintain-verification-skill`.
