# finstats

An explorer for Statistics Finland's open data. A React frontend searches and
browses the StatFin PxWeb database, renders any table as a chart or a data
table (with CSV export), and draws regional tables as a choropleth at whichever
area level they carry (municipalities, regions, wellbeing services counties…).
Every view lives in the URL, so it can be shared and bookmarked. A tiny Go
backend embeds the built frontend and serves it as a single binary — nothing
more.

Sibling projects `ratikka` (HSL live transit), `bensa` (fuel prices) and
`tieliikenne` (road traffic) share this architecture, deployment host, and
CI/CD shape — when something here looks unexplained, check how they solved it
before inventing a new approach.

## Key difference from the siblings

`bensa` and `ratikka` have a Go backend that *fetches and caches* upstream data.
finstats does **not**: the browser calls Statistics Finland's PxWeb and WFS
services directly (both send CORS headers). This is deliberate —

- The app browses arbitrary tables, so there is no fixed dataset to cache.
- Rate limits (40 calls / 60 s) are per client IP; direct calls keep each user
  on their own budget instead of sharing the server's IP.

So the backend has no Redis, no poller, and no `/api/data` — only static serving
plus `/api/version` and `/api/health`.

## Layout

```
backend/cmd/server/main.go      entrypoint: wires the two API routes + static
backend/internal/api/static.go  serves the embedded Vite build
backend/internal/api/version.go /api/version and /api/health
backend/internal/api/dist/      frontend build, embedded via //go:embed at image build
frontend/src/lib/pxweb.ts       PxWeb API client (browse / search / meta / query) + default picks
frontend/src/lib/jsonstat.ts    JSON-stat v2 -> tidy "cube", with a unit per measure
frontend/src/lib/series.ts      the chart's reading of a cube (x-axis, series, unit panels)
frontend/src/lib/urlstate.ts    explorer state <-> URL query string
frontend/src/lib/wfs.ts         map levels, area boundaries (GeoJSON) + the area-code join
frontend/src/lib/classes.ts     quantile classes for the choropleth
frontend/src/lib/csv.ts         tidy CSV export
frontend/src/lib/starters.ts    the landing page's popular tables
frontend/src/components/        TableBrowser, DimensionSelect, ChartView, TableView, MapView
scripts/build-changelog.js      CHANGELOG.md -> dist-changelog/index.html for Pages
deploy/                         install.sh (domain as arg) + compose + cron auto-update
```

## Local development

Two processes. The backend defaults to `:8081`, which the Vite dev proxy targets:

```
cd backend && go run ./cmd/server     # :8081, serves /api/*
cd frontend && npm install && npm run dev   # :5173, proxies /api -> :8081
cd frontend && npm test               # vitest: the lib/ logic
```

`backend/internal/api/dist/` holds only `.gitkeep` in a checkout, so
`//go:embed all:dist` still compiles; the backend serves no static files
locally and Vite serves the frontend instead. In dev the version badge just
reads "dev".

## Data sources

- **PxWeb API** — `https://pxdata.stat.fi/PxWeb/api/v1/{lang}/StatFin/…`
  Browse the tree with GETs, GET a `*.px` URL for metadata, POST a selection for
  json-stat2 data. Limits: 120 000 cells/query, 40 calls/60 s. CC BY 4.0.
- **WFS geometry** — `https://geo.stat.fi/geoserver/tilastointialueet/wfs`,
  one `…4500k` layer per map level (`kunta`, `seutukunta`, `maakunta`,
  `hyvinvointialue`, `ely`, …), as GeoJSON in EPSG:4326. Joined to StatFin area codes
  by number (`KU020` ↔ `kunta: "020"`, `MK01` ↔ `maakunta: "01"`). CC BY 4.0.

See `docs/DATA_SOURCES.md` for the full contract and quirks.

## Conventions

- Version/build metadata is injected via `-ldflags` in CI, never hardcoded.
- Unknown `/api/*` paths 404 instead of falling through to `index.html`.
- The UI is metadata-driven: `time` / `contents` / region variables are detected
  from PxWeb metadata (`time: true`, `code === contentscode`, `alue`/`kunta`
  codes and `KU/MK/SK/SA/HVA` value prefixes). If StatFin changes those
  conventions, `pxweb.ts` and `jsonstat.ts` are the places to adjust; which
  levels can be *drawn* is the `MAP_LEVELS` table in `wfs.ts`.
- The URL is the source of truth for the open table and view (`urlstate.ts`).
  Picks equal to a table's default are left out, so links stay short and keep
  following the latest periods. Picks and view changes `replaceState`; opening a
  table or going back to the list `pushState`s.
- Nothing is dropped silently: every combination of multi-valued dimensions is
  a chart series (8 at most — the palette's size — the rest are in the Table
  view), and the map has a picker for every non-area dimension. Values in
  different units never share an axis; they get a panel each.
- The map queries every area of its level itself; it never overwrites the
  user's area picks, which the chart and table keep using.
- Chart/ramp colours come from the validated data-viz palette in
  `lib/palette.ts`, stepped separately for light and dark. Run the data-viz
  validator before changing a hex; a series keeps its colour slot while others
  come and go.
- MapLibre 6 needs its worker URL handed over (`?worker&url` +
  `setWorkerUrl`, as in ratikka); CI fails the build if the worker chunk is
  missing from `dist/assets`.
- Theme is an explicit choice on `<html data-theme>`, not the OS setting.
- CHANGELOG.md headings must match the tags CI generates (`## [v0.1.0] - date`),
  or the Pages changelog renders them as plain text.

## Deployment

Push to `main` → CI tags, builds a multi-arch image, pushes to
`ghcr.io/saavuori/finstats:latest`. The Oracle host runs a 5-minute cron
(`deploy/update.sh`) that pulls and redeploys. TLS is terminated by the Caddy
container in the *ratikka* stack, which proxies the public domain over the
shared external `web-proxy` podman network (live: `finstat.saavuori.live`).
`deploy/install.sh <domain>` does the whole host setup and takes the domain as a
parameter — nothing else hardcodes it. See `docs/DEPLOYMENT.md`.
