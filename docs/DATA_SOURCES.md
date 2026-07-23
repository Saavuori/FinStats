# Data sources

finstats is built entirely on open interfaces published by **Statistics Finland
(Tilastokeskus)**. Everything is licensed **CC BY 4.0** — free to reuse with
attribution. finstats is not affiliated with Statistics Finland.

Overview page:
<https://stat.fi/en/services/statistical-data-services/open-data-and-interfaces>

## 1. PxWeb API (statistical tables)

The primary source. All numeric data comes from here.

- **Root**: `https://pxdata.stat.fi/PxWeb/api/v1/{lang}/{db}/`
  - `lang` ∈ `en` | `fi` | `sv`
  - `db` = `StatFin` (the main open collection). Others exist, e.g.
    `Postinumeroalueittainen_avoin_tieto` (PAAVO, postal-area data).
- **Browse the tree**: `GET .../StatFin/` → subject folders → `GET .../StatFin/vaerak/`
  → table list. Tables have `type: "t"` and ids ending in `.px`.
- **Full-text search**: `GET .../StatFin/?query=population&filter=*`.
- **Table metadata**: `GET .../StatFin/vaerak/11rb.px` → `{ title, variables[] }`.
  Each variable has `code`, `text`, `values[]`, `valueTexts[]`, and — on the
  time variable — `time: true`.
- **Data**: `POST` the same table URL with a selection body, asking for
  `json-stat2`:

  ```json
  {
    "query": [
      { "code": "timeperiod_y", "selection": { "filter": "item", "values": ["2023", "2024", "2025"] } }
    ],
    "response": { "format": "json-stat2" }
  }
  ```

  `filter` may be `item` (listed codes), `all`, or `top` (N most recent).
  Formats also include `csv`, `xlsx`, `px`, `sdmx`.

### Limits (from the `?config` endpoint)

| Limit            | Value            | On breach |
| ---------------- | ---------------- | --------- |
| Cells per query  | 120 000          | HTTP 403  |
| Calls per window | 40 / 60 seconds  | HTTP 429  |
| Query timeout    | 60 seconds       | HTTP 503  |

CORS is enabled, so the browser calls the API directly. finstats estimates the
cell count (product of selected value counts) before querying and blocks
anything over the limit.

### Variable-role detection

The metadata does not label "which variable is the region" or "which is the
measure", so finstats infers it:

- **time** — `time: true` in the metadata (also matched by code patterns like
  `timeperiod_y`, `Vuosi`, `Kuukausi`).
- **contents / measure** — `code === "contentscode"` (or text Information /
  Tiedot / Uppgifter). Carries the unit.
- **region** — code prefix `KU` (municipality), `MK` (region/maakunta), `SK`
  (sub-region), `MA` (major region); `SSS` is WHOLE COUNTRY.

## 2. WFS geographic data (map geometry)

Used only to draw the choropleth outlines.

- **Endpoint**: `https://geo.stat.fi/geoserver/tilastointialueet/wfs`
- **Layer**: `tilastointialueet:kunta4500k` — municipalities, generalised to
  1:4 500 000 (small file, fine for a national overview).
- **Request**: `GetFeature`, `outputFormat=application/json`,
  `srsName=EPSG:4326` (WGS84, what MapLibre wants).
- **Join key**: each feature has `kunta` = 3-digit code (`"020"`); StatFin uses
  `KU020`. `lib/wfs.ts` reduces both to bare digits.

Statistics Finland also publishes WMS and an OGC API – Features endpoint for the
same data; WFS-as-GeoJSON is the simplest fit for a web map and is what we use.

## Not used (and why)

- **Open Classifications API** (`stat.fi/en/luokitukset/info`) — classification
  metadata and correspondence tables. Not needed: PxWeb metadata already ships
  the human-readable `valueTexts` for every code we display.
