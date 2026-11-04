# Console navigation

The sidebar takes a logged-in user to the console's management pages: Config, AI Providers, Auth Files, OAuth, Quota, Logs, System, and (when the backend supports plugins) Plugins.

## Sub-features

- `nav-config` `#/config` renders the config editor.
- `nav-auth-files` `#/auth-files` renders Auth Files Management.
- `nav-logs` `#/logs` renders the logs page.
- `nav-system` `#/system` renders system info.
- `nav-plugins` plugin routes appear only when the backend reports plugin support.

## How to get to it (user POV)

- Sidebar links (collapse with `Ctrl+B`), or the hash URL directly.

## Driving it with mc.sh

Preconditions:

- Baseline from README. Fixture returns empty stubs for config/auth-files/logs/system.

- **Route smoke.** Run `mc.sh drive nav-smoke`. Each of `#/config`, `#/auth-files`, `#/logs`, `#/system` loads after login and shows its title text; one screenshot + ARIA snapshot per route (`route-*.png`).

## Gotchas

- Empty fixture data proves only that pages render, not real config semantics; real contracts live in `../CLIProxyAPI`.
- `/settings` and `/api-keys` redirect to `/config`; unknown routes redirect to `/fleet`.
