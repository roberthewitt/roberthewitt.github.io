# roberthewitt.github.io

Launch pad and canonical deployment for the Kingshot browser tools.

## Routes

| Path | Content |
| --- | --- |
| `/` | Launch pad maintained in this repository. |
| `/map/` | Player map mirrored from `roberthewitt/kingshot-discord-updates`. |
| `/bear/` | Bear trap logger from the same map/bear deployment. |
| `/calculator/` | Bear troop calculator mirrored from `roberthewitt/kingshot-bear-troop-calc`. |

The former `/kingshot/map/` and `/kingshot/troop-calculator/` routes remain as
small redirects to their canonical replacements.

## Assembly

`.github/workflows/deploy-pages.yml` runs `scripts/assemble-site.mjs` and uploads
the fresh `_site/` directory as the Pages artifact. The assembler always removes
the previous directory first and fails on destination collisions, missing
required files, invalid datasets, legacy deployment paths, or unresolved local
HTML references.

The source repositories are private, so this repository deliberately does not
check them out or require a cross-repository token. It mirrors only their public
GitHub Pages artifacts.

### Map and bear

The map and bear logger are two entry points from one Vite build. They share
hashed files in `assets/`, and their `players.json` and `bear-players.json`
datasets must represent the same roster. The assembler downloads both pages,
all assets referenced by either page, and both datasets as one unit. It then:

- serves the entry points at `/map/` and `/bear/`;
- keeps the shared hashed bundles in `/assets/`;
- keeps `bear-players.json` at the root, where the bear bundle expects it;
- places the exact same `players.json` bytes at the root and under `/map/`,
  where the relocated map bundle expects them; and
- verifies that both datasets are nonempty and have equal player counts.

This preserves the source deployment's internal coupling rather than scraping
the map in isolation.

### Calculator

The current public calculator export is built with the absolute base path
`/kingshot-bear-troop-calc`. The assembler mirrors its documents, referenced
Next.js assets, and lazy webpack chunks, then rewrites that base to
`/calculator` across every text asset.

The calculator source now also supports the future direct-build contract
`BUILD_BASE_PATH=/calculator npm run build`. Until that source change is
deployed and this repository intentionally migrates to source builds, rebasing
the public artifact keeps this deployment independent of it.

## Shared navigation

`assets/tool-navigation.js` is the sole implementation of the Home, Map, Bear,
and Calculator navigation. It defines an accessible, keyboard-focusable,
responsive Web Component with encapsulated styles.

Its links are anchored to a fixed left offset rather than centred. Centring the
links against the viewport moved every link by half the scrollbar width, so the
bar visibly jumped between routes that scroll (`/`, `/calculator/`) and routes
that are viewport-locked (`/map/`, `/bear/`). `scrollbar-gutter: stable` was
rejected because it reserves a permanent gutter and leaves a dead strip beside
the full-bleed bar on the viewport-locked pages. Left-anchoring keeps the bar
full-bleed and the link positions identical on every route in both states.

The links stay on one row at every width, including 320px with a classic
scrollbar, so there is no viewport-dependent wrapping. `overflow-x` on the bar
is only a safety valve for unexpectedly wide labels.

The root page includes `<tool-navigation>` directly. During assembly, the
component loader is added to the map, bear, and calculator documents. On those
pages it inserts the component as a body sibling, outside application mount
points, so it does not modify framework-owned markup or require an iframe.

## Deployment triggers and permissions

The workflow runs:

- on pushes to `main`;
- every six hours, so source-site changes are picked up even if a dispatch
  integration stops working; and
- manually, optionally waiting for a specific map dataset version or calculator
  build id to become visible through the Pages CDN.

Permissions are limited to `contents: read`, `pages: write`, and
`id-token: write`.

## Local validation

Build and validate the same artifact uploaded by Actions:

```sh
node scripts/assemble-site.mjs
python3 -m http.server --directory _site 8000
```

Then exercise `/`, `/map/`, `/bear/`, `/calculator/`, and both legacy routes.
The generated `_site/` directory is intentionally not committed.
