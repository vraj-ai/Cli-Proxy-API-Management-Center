# Login

A user opens the Management Center, sees the endpoint detected from the page URL, enters the management key, and lands in the console; a wrong key is rejected and Logout returns to the login page.

## Sub-features

- `login-detect` shows the detected endpoint under `Endpoint`.
- `login-success` accepts the right key and lands on Fleet `Instance overview`.
- `login-reject` keeps the user on the login page for a wrong key.
- `login-custom` `Use a different endpoint` checkbox reveals an endpoint field.
- `logout` `Logout` button returns to the login form.

## How to get to it (user POV)

- Open `http://127.0.0.1:4173/management.html`.
- Any protected route while logged out redirects to login.

## Driving it with mc.sh

Preconditions:

- Baseline from README; no stored session (each drive uses a fresh browser context).

- **Login.** Run `mc.sh drive login`. Placeholder `Enter the management key` is filled with `fixture-management-key`, button `Open console` clicked; H1 `Instance overview` appears. Proof: `01-login.*`, `02-after-login.*`.
- **Wrong key / logout / custom endpoint.** Not scripted yet; add to drive.mjs using the names above. Wrong key: the fixture returns 401 for any other bearer.

## Gotchas

- The `Remember` checkbox persists the key in localStorage; fresh contexts avoid leaking it between runs.
- Accessible names are i18n; a non-English locale breaks every selector.
