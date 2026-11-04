# Management Center verification map

Maintained source for verifying the user-facing behavior of the CLI Proxy API Management Center. Read this index, then use the matching feature file as the recipe.

## Baseline preconditions

- `mc.sh launch` started the fixture at `http://127.0.0.1:$MC_PORT` (default 4173) from a fresh `bun run build`.
- `mc.sh doctor` exits 0.
- Fixture state is in memory and resets on every launch: providers `openai` and `anthropic`, one managed key `Local app`, one legacy key.
- Browser locale `en-US` (drive.mjs sets it).
- Never drive an instance this run did not launch.

## Driving conventions

- Run browser actions through `mc.sh drive <feature>`; recipes live in `scripts/drive.mjs`.
- Prefer ARIA roles and English accessible names from `src/i18n/locales/en.json`.
- Routes are hash routes: `/management.html#/fleet`, `#/fleet/access`, `#/config`, ...
- Mutations hit the in-memory fixture only; relaunch to reset.

## Proof and skip reporting

- Capture the state before and after the action (`.png` + `.aria.txt`).
- Mutation proof includes an independent backend read (JSON file in the run dir).
- Record the feature ID and entry point used.
- The fixture stubs most non-Fleet endpoints with empty data; say so when a proof relies on them.
- Do not report a skipped entry point as verified through a different path.

## Feature entry contract

Each file: H1 + one paragraph, then `Sub-features`, `How to get to it (user POV)`, `Driving it with mc.sh`, `Gotchas`.

## Features

- [Login](./login.md) — management-key login, auto-detected endpoint, logout.
- [Fleet overview](./fleet-overview.md) — instance status, providers, pace, quota.
- [Fleet client keys](./fleet-client-keys.md) — create, view-once secret, list, revoke.
- [Console navigation](./console-navigation.md) — sidebar routes: Config, Auth Files, Logs, System.
