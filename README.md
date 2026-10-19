# FreeMap.js — Free Google Maps Alternative with No API Key

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![dependencies](https://img.shields.io/badge/dependencies-0-brightgreen)]()
[![version](https://img.shields.io/badge/version-1.3.0-blue)]()

A free, open-source **JavaScript map library** that works with **no API key, no billing account, no signup — ever**. Google-Maps-style street maps and hybrid satellite view (imagery + place/road/shop labels), place search with live suggestions, driving directions, and "my location" — in **one `<script>` tag** with **zero dependencies**.

If you were searching for *"Google Maps API alternative without key"*, *"free map API"*, *"embed map without billing account"* or *"open source Google Maps"* — this is that project. Tile providers, geocoding and routing are wired up and keyless out of the box.

## Why developers use FreeMap instead of the Google Maps API

| | FreeMap.js | Google Maps API | Mapbox |
|---|---|---|---|
| API key | ❌ never | ✅ required | ✅ required |
| Billing account / credit card | ❌ none | ✅ required | ✅ required |
| Cost | free | pay-per-use after free tier | pay-per-use |
| Hybrid satellite (imagery + labels) | ✅ | ✅ | ✅ |
| Place search + directions | ✅ built in | ✅ | via plugins |
| Dependencies | 0 | 1 | 1+ |

## What's under the hood

| What | FreeMap uses | Key needed |
|---|---|---|
| Street map | OpenStreetMap tiles — or Google Maps CDN (demo default) | ❌ |
| Satellite | Google hybrid tiles (demo default) — or Esri World Imagery / EOX s2cloudless | ❌ |
| Labels overlay | baked into Google hybrid — or CARTO transparent labels | ❌ |
| Place search | Nominatim | ❌ |
| Directions | OSRM | ❌ |
| My location | Browser Geolocation | ❌ |

## Quick start

```html
<script src="freemap.js"></script>
<div id="map" style="height: 500px"></div>
<script>
  const map = new FreeMap.Map('#map', { center: [28.6139, 77.2090], zoom: 12, hash: true });
  map.addMarker([28.6129, 77.2295], { color: '#ea4335', title: 'India Gate', popup: '<b>India Gate</b>' });
</script>
```

Run the full demo (layer switch, live search suggestions, directions, my location):

```
python serve.py 8123
# open http://127.0.0.1:8123/demo/
```

`serve.py` sends no-cache headers — plain `python -m http.server` lets the browser keep showing an old build after you edit files.

## Features

- 🛰 **Hybrid satellite** — imagery with place, road and shop names, like Google Maps' satellite layer
- 🗺 **Street ↔ satellite switch** — one click, swap tile sources at runtime
- 🔎 **Place search with live autocomplete** — suggestions appear as you type (Nominatim)
- 🧭 **Driving directions** — click two points, get route polyline + distance + time (OSRM)
- 📍 **My location** — one button geolocation
- 📌 Markers, popups, polylines — simple APIs
- 🖱 **Every input** — drag with inertia, trackpad pinch zoom, two-finger scroll pan, mouse wheel zoom toward cursor, touch pinch, double-click, keyboard (`+`/`-`, arrows)
- 🔗 **Shareable map state** — `#lat,lng,zoom` in the URL hash
- 📦 **UMD** — works via `<script>` tag and in Node; ~20 KB, zero dependencies

## API

```js
new FreeMap.Map(el, {
  center: [lat, lng], zoom: 11,
  tileUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', // {s} {z} {x} {y}
  overlayUrl: null,    // transparent label tiles on top — hybrid satellite:
                       // 'https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png'
  minZoom: 2, maxZoom: 19,
  hash: true,          // keep #lat,lng,zoom in the URL — shareable map state
  controls: true,      // zoom buttons + attribution
  attribution: '…'     // required if you swap tileUrl
})
```

- `map.setView([lat,lng], zoom, {animate, duration})` / `flyTo` / `zoomIn()` / `zoomOut()`
- `map.fitBounds({north, south, east, west}, {padding, maxZoom})`
- `map.setTileUrl(url, attribution)` / `map.setOverlayUrl(url|null)` — swap layers at runtime (street ↔ satellite)
- `const m = map.addMarker([lat,lng], {title, popup: html, color})` → `m.remove()`, `m.setLatLng()`
- `const l = map.addPolyline([[lat,lng],…], {color, weight, opacity})` → `l.remove()`, `l.setLatLngs()`
- `map.on('move' | 'moveend' | 'click' | 'zoom', cb)` — `click` gives `{latlng, x, y}`
- `map.getCenter()`, `map.getZoom()`

## FAQ

### Do I need an API key or billing account?
No. FreeMap never asks for a key, account, or credit card — clone, open the demo, done.

### Is it really free forever? What's the catch?
The library is MIT — yours forever, nothing to renew. Map data, search and routing come from free community services (OpenStreetMap, Nominatim, OSRM) with fair-use limits: perfect for demos and low-traffic sites; for production scale, self-host or plug in a licensed provider — the swap is two URL constants.

### Can I use Google Maps without an API key?
The demo ships with Google's keyless tile CDN so it looks and loads exactly like Google Maps. Honest note: Google's ToS does not license third-party tile embedding, so treat that mode as educational. For a fully-licensed build, swap to OpenStreetMap (street) and Esri/EOX (satellite) — see below.

### How is this different from Leaflet?
Leaflet is a map engine — you assemble tiles, geocoding, routing and mobile gestures yourself. FreeMap is batteries-included and keyless out of the box. It's a lean demo-grade library, not a Leaflet replacement for complex apps.

## Tile sources & the honest note

The demo defaults to Google's tile CDN because it looks and loads exactly like Google Maps and needs no key or account. Know the trade-off: **Google's ToS does not license third-party tile embedding.** For anything serious, swap the two URL constants in `demo/index.html`:

- **Map layer** — OpenStreetMap `https://tile.openstreetmap.org/{z}/{x}/{y}.png` (ODbL, attribution only — fully open)
- **Satellite layer** — Esri World Imagery `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`. Since 2025 Esri stamps keyless tiles with an "API KEY REQUIRED" watermark — a free Esri developer account key removes it, or use EOX Sentinel-2 cloudless (keyless, CC BY 4.0, max ~z15, blurry at street zoom): `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2020_3857/default/g/{z}/{y}/{x}.jpg`
- On top of OSM, add place/road labels with a transparent overlay: `map.setOverlayUrl('https://basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png')`

OpenStreetMap data is ODbL — you **must** show attribution when using it. Free demo servers (Nominatim/OSRM) have fair-use policies — fine for development, self-host for production scale.

## Publishing your own repo

Yes — publish freely. The code is MIT (see `LICENSE`), it's yours. Keep these in place and you're in the clear:

1. **MIT license file** — keep as-is.
2. **Attribution strings** — OSM (ODbL) and Esri/CARTO/EOX attributions are already wired into the demo; don't strip them when you swap tile sources.
3. **Google tiles note** — the demo's default tiles come from Google's keyless tile CDN. Google's ToS does not license third-party embedding, so present your repo as a demo/educational project (like this README does), and keep the swap-to-OSM section so users can run a fully-licensed build. Don't market the Google-tile mode as an official Google product or rebrand their attribution away.
4. **Fair-use APIs** — Nominatim/OSRM are free community demo servers with rate limits; fine for a demo repo, just don't encourage production traffic at them (README already says self-host).

## Files

- `freemap.js` — the library (UMD, works in browser and Node)
- `demo/index.html` — Google-Maps-style demo: hybrid satellite, layer switch, live search suggestions, directions, my location
- `test.js` — `node test.js` self-check for the projection/tile math
- `serve.py` — no-cache dev server

## License

MIT — see [LICENSE](LICENSE). Skipped on purpose: vector tiles, raster layer switching, clustering — add when a real need shows up.
