# finstats Changelog

All notable changes to this project are documented here. The version headings
match the tags CI generates on each push to `main`.

## [v0.1.1] - 2026-07-25

### Added
- **One-command install**: `deploy/install.sh <domain>` sets up the whole
  deployment on a Podman or Docker host behind Caddy — compose files, the shared
  `web-proxy` network, the TLS vhost, and the auto-update cron — with the public
  domain as its only required argument. Re-running it updates in place.

### Changed
- `deploy/update.sh` resolves its own directory and detects the container
  engine, so it works from any install directory under Podman or Docker.
- The live deployment is `tilastokeskus.duckdns.org`; the domain is no longer
  hardcoded anywhere in the deployment tooling.

## [v0.1.0] - 2026-07-23

### Added
- **Generic StatFin explorer**: Search or browse the whole Statistics Finland
  open database (thousands of tables) and visualise any of them without
  table-specific code. The UI is driven entirely by each table's metadata.
- **Table browser**: Full-text search across StatFin plus a folder tree with
  breadcrumbs, backed by the PxWeb API's search and navigation endpoints.
- **Auto dimension controls**: Every variable of a table becomes a searchable
  multi-select, with bulk actions (select all / clear / latest 12) and a live
  cell-count estimate that guards the API's 120 000-cell limit.
- **Chart view**: Line and bar charts (Recharts) with the time dimension on the
  x-axis, a selectable series splitter, a validated colourblind-safe palette,
  and unit-aware tooltips.
- **Choropleth map**: MapLibre GL map of Finland's municipalities for any
  regional table, joined to Statistics Finland's WFS boundary geometry, with a
  period/measure selector and a sequential value ramp.
- **Light and dark themes**: An explicit toggle (not tied to the OS setting),
  persisted across visits, shared by the CSS, charts and the map basemap.
- **CI/CD**: Push to `main` tags a release, builds a multi-arch image and pushes
  it to GHCR; the Oracle host auto-deploys within five minutes via cron.
- **Changelog on GitHub Pages**: This file is compiled to a styled page on each
  change.

### Notes
- finstats is a client-side app: the browser calls Statistics Finland's PxWeb
  and WFS services directly (both send CORS headers), so the Go backend only
  serves the embedded build plus `/api/version` and `/api/health`. No database
  or cache is deployed. See `docs/DATA_SOURCES.md`.
- All data and geometry are © Statistics Finland, licensed CC BY 4.0. finstats
  is not affiliated with Statistics Finland.
