# roberthewitt.github.io

Personal GitHub Pages site.

## URL structure

| Path | What it is |
| --- | --- |
| `/` | Static landing page (`index.html` + `assets/styles.css`) served from this repository. |
| `/kingshot/map/` | The Kingshot player map, mirrored from another repository's published site at deploy time. |
| `/kingshot/troop-calculator/` | The bear troop calculator, mirrored the same way. |
| Bear trap logger card | Links directly to the live bear trap logger at [`roberthewitt.github.io/kingshot-discord-updates/bear/`](https://roberthewitt.github.io/kingshot-discord-updates/bear/), rather than being mirrored into this site. |

## How the tools are sourced

Neither tool is stored here, and neither is rebuilt here.

[`roberthewitt/kingshot-discord-updates`](https://github.com/roberthewitt/kingshot-discord-updates)
already builds the map with `npm run map:build` and publishes it to its own
GitHub Pages site. `.github/workflows/deploy-pages.yml` copies that published
bundle into this site's artifact at `kingshot/map/`.

[`roberthewitt/kingshot-bear-troop-calc`](https://github.com/roberthewitt/kingshot-bear-troop-calc)
does the same with `next build`, and the workflow copies its export into
`kingshot/troop-calculator/`.

Both mirror rather than rebuild because the source repositories are **private**.
This workflow's `GITHUB_TOKEN` is scoped to this repository, so it cannot check
them out, and a cross-repository personal access token would add a secret that
silently expires. The published bundles are already public, so mirroring them
needs no credential at all and can only ever serve what those repositories
themselves chose to publish.

For the map, the workflow discovers the hashed asset filenames from the
published `index.html` rather than hardcoding them, fetches `players.json`
separately because the page requests it at runtime, and fails the build if any
file is missing or empty, if the dataset has no players, or if the bundle
contains absolute paths.

### The calculator needs its paths rewritten

The map nests for free; the calculator does not, and the difference is worth
knowing if either source changes.

The map is built by Vite with `base: './'`, so every reference in it is
*relative* and keeps resolving wherever it is served from.

The calculator is a Next.js static export built with
`basePath: '/kingshot-bear-troop-calc'`, so every reference in it is an
*absolute* path rooted at that base. Copied as-is it would request its assets
from the other site entirely. The workflow therefore rewrites that base to
`/kingshot/troop-calculator` across the HTML, JavaScript and CSS.

Two details make that rewrite less obvious than it sounds:

- **The base appears with and without a trailing slash.** The markup uses
  `/kingshot-bear-troop-calc/_next/...`, but the hydration payload and the
  router's own copy of `basePath` hold the bare `/kingshot-bear-troop-calc`.
  Rewriting only the trailing-slash form leaves the router and the webpack
  asset prefix pointing at the original site, which still *works* — same
  origin — while silently coupling this site to the other one.
- **Some chunks appear in no document.** webpack builds their URLs at runtime
  from a table inside its own runtime bundle, so a mirror that only scraped
  the markup would omit them and break the moment a lazy import ran. The
  workflow parses that table, and fails the build if it cannot find it rather
  than shipping a partial copy.

After rewriting, the workflow fails the build if any reference to the original
base survives, or if the markup names an asset that was not copied.

Nothing is ever written back to either source repository.

## When it rebuilds

- On push to `main` (root site changes).
- Every six hours (`0 */6 * * *`), to pick up a newly published map or calculator.
- Manually via **Run workflow** (`workflow_dispatch`).
- On notification from either source repository, if that is wired up (below).

The schedule polls on a fixed interval rather than running once a day timed to
follow the source's publish. GitHub defers scheduled runs under load, and the
source's nominal 05:30 UTC job has actually started between 10:32 and 12:30 UTC
on recent days. This workflow's schedule slips by the same unpredictable amount,
so a single daily slot is as likely to run before that day's publish as after
it, and would then serve the previous day's map for a full day. Polling bounds
staleness to roughly six hours regardless of when the source publishes.

## Optional: refresh as soon as a tool publishes

Either source repository can dispatch this workflow the moment it finishes
publishing, which replaces up-to-six-hours of lag with about a minute. The
schedule stays on as a safety net either way, because a push-based trigger
fails silently: if the token below is revoked or expires, the notifications
simply stop, and nothing goes red to tell you.

This needs a token, because a workflow's built-in `GITHUB_TOKEN` cannot reach
another repository. Note the direction: the token lives in the **source**
repository and only needs permission to start a workflow in **this** one, which
is public. It never needs access to the private repository's contents, and if
it lapses the site keeps updating on schedule rather than breaking.

### From the map repository

1. Create a fine-grained personal access token scoped to **only** the
   `roberthewitt.github.io` repository, with **Actions: Read and write**. That
   permission allows starting a workflow run and nothing else — notably not
   pushing code.
2. Add it to the source repository as a repository secret named
   `SITE_REFRESH_TOKEN`. The same token can be used in both.
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

### From the calculator repository

Same idea, but the thing to wait for is Next's build id rather than a dataset
version. Append this to `.github/workflows/deploy.yml` in
`kingshot-bear-troop-calc`, and have its build job expose the id:

```yaml
  # In the existing `build` job, after the Build step:
      - name: Record Build Id
        id: buildid
        working-directory: ./web
        run: echo "build_id=$(cat .next/BUILD_ID)" >> "$GITHUB_OUTPUT"
```

```yaml
  notify-site:
    name: Refresh Nested Site Copy
    needs: [build, deploy]
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch Site Mirror
        env:
          GH_TOKEN: ${{ secrets.SITE_REFRESH_TOKEN }}
          BUILD_ID: ${{ needs.build.outputs.build_id }}
        run: |
          set -euo pipefail

          if [[ -z "${GH_TOKEN}" ]]; then
            echo "No SITE_REFRESH_TOKEN configured; skipping the refresh."
            exit 0
          fi

          gh workflow run deploy-pages.yml \
            --repo roberthewitt/roberthewitt.github.io \
            --ref main \
            --field "expected_calculator_build=${BUILD_ID}"
```

That needs `build` to declare the output:

```yaml
  build:
    outputs:
      build_id: ${{ steps.buildid.outputs.build_id }}
```

## Why the bear trap logger isn't mirrored

Unlike the map and the calculator, the landing page's "Bear trap logger" card
links straight to
[`roberthewitt.github.io/kingshot-discord-updates/bear/`](https://roberthewitt.github.io/kingshot-discord-updates/bear/)
instead of being copied into `_site` by `deploy-pages.yml`. That page shares a
single `assets/` directory with the map at the root of its own Pages site
(it references `../assets/...`), rather than owning a self-contained bundle
the way the map does with `base: './'`. Mirroring it would mean also mirroring
and rewriting that shared asset directory, which the workflow does not do
today. Linking straight to the source avoids that, at the cost of navigating
away from this site instead of staying nested under `/kingshot/`.
