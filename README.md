# roberthewitt.github.io

Personal GitHub Pages site.

## URL structure

| Path | What it is |
| --- | --- |
| `/` | Static landing page (`index.html` + `assets/styles.css`) served from this repository. |
| `/kingshot/map/` | The Kingshot player map, mirrored from another repository's published site at deploy time. |
| `/kingshot/bear/` | Reserved for a future bear trap damage input tool. Not published yet, so the landing page marks it "Coming soon" rather than linking to it. |

## How the map is sourced

The map is **not** stored here, and it is not rebuilt here either.

[`roberthewitt/kingshot-discord-updates`](https://github.com/roberthewitt/kingshot-discord-updates)
already builds the map with `npm run map:build` and publishes it to its own
GitHub Pages site. `.github/workflows/deploy-pages.yml` copies that published
bundle into this site's artifact at `kingshot/map/`.

It mirrors rather than rebuilds because the source repository is **private**.
This workflow's `GITHUB_TOKEN` is scoped to this repository, so it cannot check
the source out, and a cross-repository personal access token would add a secret
that silently expires. The published bundle is already public, so mirroring it
needs no credential at all and can only ever serve what the source repository
itself chose to publish.

The bundle is built by Vite with `base: './'`, so every reference in it is
relative and keeps resolving from the nested path. The workflow discovers the
hashed asset filenames from the published `index.html` rather than hardcoding
them, fetches `players.json` separately because the page requests it at runtime,
and then fails the build if any file is missing or empty, if the dataset has no
players, or if the bundle contains absolute paths.

Nothing is ever written back to `kingshot-discord-updates`.

## When it rebuilds

- On push to `main` (root site changes).
- Every six hours (`0 */6 * * *`), to pick up a newly published map.
- Manually via **Run workflow** (`workflow_dispatch`).

It polls on a fixed interval rather than running once a day timed to follow the
source's publish. GitHub defers scheduled runs under load, and the source's
nominal 05:30 UTC job has actually started between 10:32 and 12:30 UTC on recent
days. This workflow's schedule slips by the same unpredictable amount, so a
single daily slot is as likely to run before that day's publish as after it, and
would then serve the previous day's map for a full day. Polling bounds staleness
to roughly six hours regardless of when the source actually publishes.

## Adding `/kingshot/bear/`

Add the page under `kingshot/bear/` in this repository (or extend the workflow to
build it from elsewhere) and turn the disabled card in `index.html` into a real
link.
