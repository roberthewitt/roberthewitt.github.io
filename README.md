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
- On notification from the source repository, if that is wired up (below).

The schedule polls on a fixed interval rather than running once a day timed to
follow the source's publish. GitHub defers scheduled runs under load, and the
source's nominal 05:30 UTC job has actually started between 10:32 and 12:30 UTC
on recent days. This workflow's schedule slips by the same unpredictable amount,
so a single daily slot is as likely to run before that day's publish as after
it, and would then serve the previous day's map for a full day. Polling bounds
staleness to roughly six hours regardless of when the source publishes.

## Optional: refresh as soon as the map publishes

The source repository can dispatch this workflow the moment it finishes
publishing, which replaces up-to-six-hours of lag with about a minute. The
schedule stays on as a safety net either way, because a push-based trigger
fails silently: if the token below is revoked or expires, the notifications
simply stop, and nothing goes red to tell you.

This needs a token, because a workflow's built-in `GITHUB_TOKEN` cannot reach
another repository. Note the direction: the token lives in the **source**
repository and only needs permission to start a workflow in **this** one, which
is public. It never needs access to the private repository's contents, and if
it lapses the site keeps updating on schedule rather than breaking.

1. Create a fine-grained personal access token scoped to **only** the
   `roberthewitt.github.io` repository, with **Actions: Read and write**. That
   permission allows starting a workflow run and nothing else — notably not
   pushing code.
2. Add it to `kingshot-discord-updates` as a repository secret named
   `SITE_REFRESH_TOKEN`.
3. Append this job to that repository's `.github/workflows/publish-player-map.yml`:

   ```yaml
     notify-site:
       name: Refresh Nested Site Copy
       needs: [build, deploy]
       runs-on: ubuntu-latest
       steps:
         - name: Dispatch Site Mirror
           env:
             GH_TOKEN: ${{ secrets.SITE_REFRESH_TOKEN }}
             DATASET_VERSION: ${{ needs.build.outputs.dataset_version }}
           run: |
             set -euo pipefail

             # Skip rather than fail when the secret is absent, so publishing
             # the map never depends on the mirror being configured.
             if [[ -z "${GH_TOKEN}" ]]; then
               echo "No SITE_REFRESH_TOKEN configured; skipping the refresh."
               exit 0
             fi

             gh workflow run deploy-pages.yml \
               --repo roberthewitt/roberthewitt.github.io \
               --ref main \
               --field "expected_version=${DATASET_VERSION}"
   ```

`expected_version` matters. GitHub Pages serves through a CDN with
`cache-control: max-age=600`, and that cache honours neither a cache-busting
query string nor a `no-cache` request header, so for up to ten minutes after the
source deploys the edge can still return the *previous* bundle. Being told the
map has published is therefore not the same as being able to read it. Passing
the version the source just published makes this workflow wait until the public
site actually serves it, instead of copying stale files and sitting on them
until the next scheduled run.

The value is already computed in that workflow as `dataset_version`, so the
snippet just forwards it.

## Adding `/kingshot/bear/`

Add the page under `kingshot/bear/` in this repository (or extend the workflow to
build it from elsewhere) and turn the disabled card in `index.html` into a real
link.
