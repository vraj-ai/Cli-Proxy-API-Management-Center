# Fleet client keys

On `Access and models` → `Client keys`, a user mints a client key (optionally named, all or selected models), sees the secret once, and manages existing keys (edit access, disable, revoke, adopt legacy keys).

## Sub-features

- `keys-create` `Create client key` form creates a key.
- `keys-secret-once` dialog `Copy this key now` shows the secret with `Copy key` / `Done`.
- `keys-list` `Managed client keys` lists the new key by name.
- `keys-revoke` `Revoke key` removes a key.
- `keys-disable` `Disable` toggles a key.
- `keys-adopt` `Adopt key` imports a legacy `api-keys` entry.

## How to get to it (user POV)

- `Fleet sections` nav → link `Access` (`#/fleet/access`), tab `Client keys` (default).

## Driving it with mc.sh

Preconditions:

- Baseline from README; `Local app` is the only managed key.

- **Open Access.** Click link `Access` in navigation `Fleet sections`. H1 `Access and models`; tab `Client keys` has `aria-selected=true`. Proof `02-access-before.*`.
- **Create.** Fill placeholder `e.g. pi, opencode, laptop` with `verify-<ts>`, click button `Create client key`. Heading `Copy this key now` appears. Proof `03-secret-shown.*`.
- **Dismiss.** Click button `Done`. The name `verify-<ts>` appears in the list. Proof `04-key-listed.*`.
- **Backend read-back.** `GET /v0/management/fleet/keys` contains `verify-<ts>`. Proof `05-fleet-keys.json`.
- All four steps: `mc.sh drive fleet-create-key`.
- Revoke/disable/adopt: not scripted yet.

## Gotchas

- The dismiss button is `Done`, not "Dismiss" (the `dismiss_secret` i18n key is unused here).
- The fixture returns secret `sk-flt-fixture-NNNN`; screenshots show it. Fine for the fixture, never for a real backend.
- Keys persist only until the fixture restarts.
