# roberthewitt.github.io

Personal GitHub Pages site.

## URL structure

| Path | What it is |
| --- | --- |
| `/` | Static landing page (`index.html` + `assets/styles.css`) served from this repository. |
| `/kingshot/map/` | The Kingshot player map, built from another repository at deploy time. |
| `/kingshot/bear/` | Reserved for a future bear trap damage input tool. Not published yet, so the landing page marks it "Coming soon" rather than linking to it. |

## How the map is sourced

The map is **not** stored here. `.github/workflows/deploy-pages.yml` checks out the
public repository [`roberthewitt/kingshot-discord-updates`](https://github.com/roberthewitt/kingshot-discord-updates)
read-only, installs its Node 20 dependencies with `npm ci`, and runs its existing
`npm run map:build`. That script regenerates `web/public/players.json` from the
checked-in roster and bundles the site into `dist/player-map`, which the workflow
copies into the deployed artifact at `kingshot/map/`.

The map's Vite config uses `base: './'`, so its asset references are relative and
keep working at the nested path. The workflow asserts this before uploading.

Nothing is ever written back to `kingshot-discord-updates`.

## When it rebuilds

- On push to `main` (root site changes).
- Daily at 05:30 UTC-ish (`45 5 * * *`), just after the source repository's own
  `Publish Player Map` schedule, so the map picks up that day's roster.
- Manually via **Run workflow** (`workflow_dispatch`).

## Adding `/kingshot/bear/`

Add the page under `kingshot/bear/` in this repository (or extend the workflow to
build it from elsewhere) and turn the disabled card in `index.html` into a real
link.
