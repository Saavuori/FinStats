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
- **Full-text search**: `GET .../StatFin/?query=population` (adding
  `filter=*` makes the text search return nothing). Hits carry `path`,
  `title`, `score` and a `published` timestamp. Space-separated terms are ORed.
- **Recently updated tables**: there is no endpoint for this, and walking the
  tree costs one call per subject (~135, over the rate limit). finstats instead
  searches for the last three years plus period words
  (`2024 2025 2026 month monthly quarter quarterly annual week`). Table titles
  end in the period they cover, so this one call returns ~1 400 of ~1 500
  tables (~270 kB) with `published` dates. Checked against a full tree crawl,
  it found every table updated in the previous two weeks.
  Timestamps have no zone; they are Finnish local time.
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
anything over the limit, and answers a repeated query (a view flipped back and
forth) from a small in-memory cache instead of spending another call.

### Variable-role detection

The metadata does not label "which variable is the region" or "which is the
measure", so finstats infers it:

- **time** — `time: true` in the metadata (also matched by code patterns like
  `timeperiod_y`, `Vuosi`, `Kuukausi` — some election tables omit the flag).
- **contents / measure** — `code === "contentscode"` (or text Information /
  Tiedot / Uppgifter). Each measure carries its own unit and decimals in the
  json-stat response (`category.unit[code] = { base, decimals }`), and one
  table can mix them: counts, `per cent`, `years`, `EUR/square metre`.
- **region** — a variable code starting `alue`/`kunta`/`maakunta`/…, a label
  such as Area / Region / Municipality, or value codes prefixed `KU`
  (municipality), `SK` (sub-region), `MK` (region), `HVA` (wellbeing services
  county), `SA` (major region), `MA` (mainland / Åland). `SSS` is WHOLE
  COUNTRY. Some municipality tables use bare codes (`020` rather than
  `KU020`); those are trusted only in a variable that says it holds
  municipalities, because sub-region numbers overlap municipality numbers.

## 2. WFS geographic data (map geometry)

Used only to draw the choropleth outlines.

- **Endpoint**: `https://geo.stat.fi/geoserver/tilastointialueet/wfs`
- **Layers**: one per map level, all generalised to 1:4 500 000 (small files,
  fine for a national overview). Each feature carries the area's number in a
  property named after the layer:

  | StatFin code | Level | Layer | Property |
  | --- | --- | --- | --- |
  | `KU020` (or bare `020`) | Municipalities | `kunta4500k` | `kunta: "020"` |
  | `SK011` | Sub-regions | `seutukunta4500k` | `seutukunta: "011"` |
  | `HVA01` | Wellbeing services counties | `hyvinvointialue4500k` | `hyvinvointialue: "01"` |
  | `MK01` | Regions | `maakunta4500k` | `maakunta: "01"` |
  | `EVK01` | Economic development centres | `elinvoimakeskus4500k` | `elinvoimakeskus: "01"` |
  | `ELY01` | ELY centres (until 2025) | `ely4500k` | `ely: "01"` |
  | `VP01` | Electoral districts | `vaalipiiri4500k` | `vaalipiiri: "01"` |
  | `SA1` | Major regions | `suuralue4500k` | `suuralue: "1"` |

  Not offered: `tyossakayntialue` (travel-to-work areas) numbers its areas
  differently from StatFin's `TA` codes (`TA01` is Espoo-Kauniainen, the
  layer's `01` is Helsinki), and `avi` hasn't been matched to a StatFin coding
  yet. Year-suffixed variants (`kunta4500k_2024`, …) hold past area
  divisions; the unsuffixed layer is the current one.
- **Request**: `GetFeature`, `outputFormat=application/json`,
  `srsName=EPSG:4326` (WGS84, what MapLibre wants).
- **Join key**: `lib/wfs.ts` reduces both sides to the plain number
  (`KU020` → `20` ↔ `kunta: "020"` → `20`). A dimension usually mixes levels;
  each level is matched by its own prefix, so `SK091` (a sub-region) can never
  land on municipality 091 (Helsinki). A level is offered once a table has two
  of its areas, and the map always queries every area of the chosen level.

Statistics Finland also publishes WMS and an OGC API – Features endpoint for the
same data; WFS-as-GeoJSON is the simplest fit for a web map and is what we use.

## Not used (and why)

- **Open Classifications API** (`stat.fi/en/luokitukset/info`) — classification
  metadata and correspondence tables. Not needed: PxWeb metadata already ships
  the human-readable `valueTexts` for every code we display.
