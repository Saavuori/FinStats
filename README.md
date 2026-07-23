# finstats

**An easy way to explore and visualise open data from Statistics Finland
(Tilastokeskus).** Search or browse the whole StatFin database, turn any table
into a chart, and draw regional tables as a choropleth over Finland's
municipalities — all in the browser.

> Data © Statistics Finland, licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
> finstats is an independent project and is not affiliated with Statistics Finland.

![finstats](docs/screenshot.png)

## What it does

- **Browse or search** thousands of StatFin tables (population, economy,
  housing, environment, transport, …) via the PxWeb API.
- **One generic UI for every table** — controls are generated from each table's
  metadata, so there is no per-table code. Every dimension becomes a searchable
  multi-select.
- **Charts** — line and bar, with the time dimension on the x-axis, a selectable
  series splitter, and unit-aware tooltips.
- **Maps** — for any table with a regional dimension, a MapLibre choropleth of
  the 300+ municipalities, joined to Statistics Finland's WFS boundary geometry,
  with a period/measure selector and a value ramp.
- **Light / dark theme**, an explicit toggle persisted across visits.

Because Statistics Finland's APIs send CORS headers, the browser talks to them
directly — finstats has no data backend and stores nothing.

## Architecture

```
frontend/   Vite + React + TypeScript SPA (Recharts, MapLibre GL)
backend/    tiny Go server: embeds the built SPA, plus /api/version + /api/health
Dockerfile  multi-stage: build SPA -> embed in Go binary -> alpine runtime
deploy/     production compose + cron auto-update for the Oracle/Podman host
```

The Go backend exists only to ship the frontend as a single self-contained
binary that matches the sibling apps' deployment. It fetches no data. See
[`CLAUDE.md`](CLAUDE.md) for the full rationale and
[`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) for the API contract.

## Local development

Requires Node 22+ and Go 1.26+.

```bash
# terminal 1 — backend on :8081 (serves /api/*; no frontend in a dev checkout)
cd backend
go run ./cmd/server

# terminal 2 — frontend on :5173 (proxies /api -> :8081)
cd frontend
npm install
npm run dev
```

Open <http://localhost:5173>. In dev, Vite serves the SPA and the backend only
answers `/api/*`; the version badge reads `dev`.

### Production build (single binary)

```bash
docker build -t finstats .
docker run --rm -p 8080:8080 finstats
# open http://localhost:8080
```

## Data sources

| Source | Use | Licence |
| ------ | --- | ------- |
| [PxWeb API](https://pxdata.stat.fi/api1.html) (`pxdata.stat.fi`) | all statistical tables (json-stat2) | CC BY 4.0 |
| [WFS](https://geo.stat.fi/geoserver/tilastointialueet/wfs) (`geo.stat.fi`) | municipality boundaries for the map | CC BY 4.0 |

Details, limits and quirks: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Deployment & CI/CD

Push to `main` → GitHub Actions tags a release, builds a multi-arch image and
pushes it to `ghcr.io/saavuori/finstats`; the Oracle host auto-deploys within
five minutes. The changelog is published to GitHub Pages. Full runbook:
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md). Release notes:
[`CHANGELOG.md`](CHANGELOG.md).

## Licence

Code under the MIT licence (see `LICENSE`). Data and geometry © Statistics
Finland, CC BY 4.0.
