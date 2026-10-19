/* FreeMap self-check: run with `node test.js`. No framework, no browser needed. */
'use strict';
const assert = require('assert');
const FM = require('./freemap.js');
const M = FM.__math;

// 1. Projection round-trips across the globe and zoom levels.
for (const [lat, lng, z] of [[0, 0, 0], [28.6139, 77.2090, 5], [-33.8688, 151.2093, 17], [64.9, -147.1, 3]]) {
  const p = M.project(lat, lng, z);
  const [lat2, lng2] = M.unproject(p.x, p.y, z);
  assert.ok(Math.abs(lat2 - lat) < 1e-6 && Math.abs(lng2 - lng) < 1e-6,
    `roundtrip failed for ${lat},${lng} @ z${z}`);
}

// 2. Known reference values (Web Mercator origin is tile (0,0) center at z0).
assert.strictEqual(M.project(0, 0, 0).x, 128);
assert.strictEqual(M.project(0, 0, 0).y, 128);
assert.strictEqual(M.lngToWorldX(180, 0), 256);
assert.strictEqual(M.lngToWorldX(-180, 0), 0);
assert.ok(Math.abs(M.latToWorldY(M.MAX_LAT, 0) - 0) < 1e-9, 'north pole clamps to y=0');

// 3. Pole clamp keeps mercator y finite.
const pole = M.project(-89.9, 0, 10);
assert.ok(isFinite(pole.y) && pole.y > 0);

// 4. tilesInView covers the viewport, stays in range, and duplicates at low zoom.
const tiles = M.tilesInView({ lat: 28.6, lng: 77.2 }, 12, 1280, 720);
assert.ok(tiles.length >= Math.ceil(1280 / 256) * Math.ceil(720 / 256), 'not enough tiles to cover viewport');
for (const t of tiles) {
  assert.ok(t.wx >= 0 && t.wx < 4096, 'wrapped tile x out of range');
  assert.ok(t.y >= 0 && t.y < 4096, 'tile y out of range');
}
const lowZoom = M.tilesInView({ lat: 20, lng: 0 }, 2, 2000, 1000);
const n = 4; // 2^2
assert.ok(lowZoom.every(t => t.wx >= 0 && t.wx < n), 'wrapped x must stay inside the z2 world');
const xs = new Set(lowZoom.map(t => t.x));
assert.ok(xs.size >= n, `x span (${xs.size}) must cover the whole world (${n}) when viewport > world`);
const keys = new Set(lowZoom.map(t => t.x + ',' + t.y));
assert.strictEqual(keys.size, lowZoom.length, 'unwrapped tile keys must be unique');

// 5. Fractional zoom rounds to the right integer tile grid.
const f = M.tilesInView({ lat: 0, lng: 0 }, 5.6, 256, 256);
assert.ok(f.every(t => t.z === 6), 'fractional zoom 5.6 should render on the z6 grid');

console.log(`All ${5} FreeMap checks passed ✓ (v${FM.version})`);
