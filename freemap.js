/*!
 * FreeMap.js v1.3.0 — a free, open-source, keyless map library.
 * No API keys. No accounts. No dependencies. MIT licensed.
 * Default tiles: OpenStreetMap (https://www.openstreetmap.org/copyright)
 */
(function (global, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else global.FreeMap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TILE = 256;
  var MAX_LAT = 85.0511287798066; // exact Web Mercator cutoff: atan(sinh(pi)) in degrees
  var DEFAULT_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
  var PIN_SVG = '<svg class="fm-pin" viewBox="0 0 24 36" width="26" height="38" aria-hidden="true">' +
    '<path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.16 9.42 7.63 11.17L12 36l4.37-12.83C20.84 21.42 24 17.08 24 12 24 5.37 18.63 0 12 0z" fill="var(--fm-pin,#ea4335)"/>' +
    '<circle cx="12" cy="12" r="4.5" fill="#fff"/></svg>';

  var CSS = [
    '.fm-container{position:relative;overflow:hidden;background:#aad3df;cursor:grab;touch-action:none;outline:none;',
      'font:13px/1.4 system-ui,-apple-system,sans-serif;user-select:none;-webkit-user-select:none}',
    '.fm-container.fm-dragging{cursor:grabbing}',
    '.fm-tiles,.fm-markers,.fm-overlay{position:absolute;inset:0}',
    '.fm-overlay{pointer-events:none;z-index:4;overflow:hidden}',
    '.fm-tile{position:absolute;left:0;top:0;width:256px;height:256px;transform-origin:0 0;pointer-events:none}',
    '.fm-markers{z-index:5;pointer-events:none}',
    '.fm-marker{position:absolute;left:0;top:0;width:0;height:0;pointer-events:auto;cursor:pointer}',
    '.fm-pin{position:absolute;left:0;top:0;transform:translate(-50%,-100%);filter:drop-shadow(0 2px 2px rgba(0,0,0,.35))}',
    '.fm-popup{position:absolute;left:0;top:0;transform:translate(-50%,calc(-100% - 12px));background:#fff;border-radius:8px;',
      'box-shadow:0 2px 10px rgba(0,0,0,.3);padding:8px 24px 8px 12px;max-width:240px;display:none;z-index:6;pointer-events:auto}',
    '.fm-popup-close{position:absolute;top:3px;right:5px;border:0;background:none;font-size:15px;cursor:pointer;color:#666;padding:0 2px}',
    '.fm-zoom{position:absolute;top:12px;left:12px;z-index:7;display:flex;flex-direction:column;border-radius:6px;',
      'overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.3)}',
    '.fm-zoom button{width:34px;height:34px;border:0;background:#fff;font-size:18px;line-height:1;cursor:pointer;color:#333}',
    '.fm-zoom button:hover{background:#f1f3f4}',
    '.fm-zoom button+button{border-top:1px solid #e0e0e0}',
    '.fm-attribution{position:absolute;right:6px;bottom:4px;z-index:7;background:rgba(255,255,255,.85);',
      'padding:1px 6px;border-radius:3px;font-size:11px;color:#333}',
    '.fm-attribution a{color:#1a73e8}'
  ].join('');

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function el(tag, cls) {
    var d = document.createElement(tag);
    if (cls) d.className = cls;
    return d;
  }

  /* ---- Web Mercator (EPSG:3857) math. Pure functions, exported for tests. ---- */

  function lngToWorldX(lng, z) { return ((lng + 180) / 360) * TILE * Math.pow(2, z); }

  function latToWorldY(lat, z) {
    var s = Math.sin(clamp(lat, -MAX_LAT, MAX_LAT) * Math.PI / 180);
    return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * Math.pow(2, z);
  }

  function worldXToLng(x, z) { return x / (TILE * Math.pow(2, z)) * 360 - 180; }

  function worldYToLat(y, z) {
    var n = Math.PI - (2 * Math.PI * y) / (TILE * Math.pow(2, z));
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
  }

  function project(lat, lng, z) { return { x: lngToWorldX(lng, z), y: latToWorldY(lat, z) }; }
  function unproject(x, y, z) { return [worldYToLat(y, z), worldXToLng(x, z)]; } // [lat, lng]

  /* Visible (and ring-margin) tiles at fractional zoom, unwrapped x + wrapped wx. */
  function tilesInView(center, zoom, width, height, z0) {
    z0 = z0 === undefined ? Math.round(zoom) : z0;
    var scale = Math.pow(2, zoom - z0);
    var c = project(center.lat, center.lng, z0);
    var n = Math.pow(2, z0);
    var x0 = Math.floor((c.x - width / (2 * scale)) / TILE);
    var x1 = Math.floor((c.x + width / (2 * scale)) / TILE);
    var y0 = Math.floor((c.y - height / (2 * scale)) / TILE);
    var y1 = Math.floor((c.y + height / (2 * scale)) / TILE);
    var tiles = [];
    for (var tx = x0; tx <= x1; tx++) {
      for (var ty = Math.max(0, y0); ty <= Math.min(n - 1, y1); ty++) {
        tiles.push({ z: z0, x: tx, y: ty, wx: ((tx % n) + n) % n });
      }
    }
    return tiles;
  }

  /* ---- Map ---- */

  // Named FMap internally: a function named `Map` would shadow ES6 `new Map()`
  // used for the tile cache and pointer table (a real bug REA's capture caught).
  function FMap(container, opts) {
    opts = opts || {};
    if (typeof container === 'string') container = document.querySelector(container);
    if (!container) throw new Error('FreeMap: container element not found');
    this._el = container;
    this._tileUrl = opts.tileUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
    this.minZoom = opts.minZoom || 2;
    this.maxZoom = opts.maxZoom || 19;
    this._listeners = {};
    this._tiles = new Map();   // "z/x/y" -> { el }
    this._overlayUrl = opts.overlayUrl || null; // transparent label layer on top (hybrid satellite)
    this._overlayTiles = new Map();
    this._markers = [];
    this._lines = [];
    this._pointers = new Map();
    this._animRaf = null;
    this._inertiaRaf = null;
    this._snapT = null;
    this._popupMarker = null;

    if (opts.center) this.center = { lat: clamp(opts.center[0], -MAX_LAT, MAX_LAT), lng: opts.center[1] };
    else this.center = { lat: 20, lng: 0 };
    this.zoom = clamp(opts.zoom === undefined ? 4 : opts.zoom, this.minZoom, this.maxZoom);

    // Shareable state in the URL hash, like the big maps do (#lat,lng,zoom).
    if (opts.hash && typeof location !== 'undefined') {
      var m = /#(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/.exec(location.hash);
      if (m) {
        this.center = { lat: clamp(+m[1], -MAX_LAT, MAX_LAT), lng: clamp(+m[2], -180, 180) };
        this.zoom = clamp(+m[3], this.minZoom, this.maxZoom);
      }
      this.on('moveend', this._syncHash.bind(this));
    }

    this._width = container.clientWidth || 800;
    this._height = container.clientHeight || 600;
    this._buildDom(opts);
    if (typeof ResizeObserver !== 'undefined') {
      var self = this;
      this._ro = new ResizeObserver(function () {
        self._width = container.clientWidth;
        self._height = container.clientHeight;
        self._svg.setAttribute('width', self._width);
        self._svg.setAttribute('height', self._height);
        self._scheduleRender();
      });
      this._ro.observe(container);
    }
    this._bindEvents();
    var self2 = this;
    requestAnimationFrame(function () { self2._render(); });
  }

  FMap.prototype._buildDom = function (opts) {
    var style = document.getElementById('fm-css');
    if (!style && document.head) {
      style = document.createElement('style');
      style.id = 'fm-css';
      style.textContent = CSS;
      document.head.appendChild(style);
    }
    var c = this._el;
    c.classList.add('fm-container');
    c.tabIndex = 0;
    c.setAttribute('role', 'application');
    c.setAttribute('aria-label', opts.ariaLabel || 'Interactive map. Use plus and minus keys to zoom, arrow keys to pan.');
    this._tilePane = el('div', 'fm-tiles');
    this._overlayPane = el('div', 'fm-tiles'); // sits above imagery, below markers
    this._markerPane = el('div', 'fm-markers');
    this._svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this._svg.setAttribute('class', 'fm-overlay');
    this._svg.setAttribute('width', this._width);
    this._svg.setAttribute('height', this._height);
    this._popupEl = el('div', 'fm-popup');
    c.appendChild(this._tilePane);
    c.appendChild(this._overlayPane);
    c.appendChild(this._svg);
    c.appendChild(this._markerPane);
    c.appendChild(this._popupEl);

    if (opts.controls !== false) {
      var self = this;
      var zoomBox = el('div', 'fm-zoom');
      [['+', 'Zoom in', function () { self.zoomIn(); }],
       ['\u2212', 'Zoom out', function () { self.zoomOut(); }]].forEach(function (b) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = b[0];
        btn.setAttribute('aria-label', b[1]);
        btn.addEventListener('click', b[2]);
        zoomBox.appendChild(btn);
      });
      c.appendChild(zoomBox);
      var attr = el('div', 'fm-attribution');
      attr.innerHTML = opts.attribution || DEFAULT_ATTR;
      c.appendChild(attr);
    }
  };

  /* ---- Events ---- */

  FMap.prototype.on = function (type, cb) {
    (this._listeners[type] = this._listeners[type] || []).push(cb);
    return this;
  };
  FMap.prototype.off = function (type, cb) {
    var a = this._listeners[type];
    if (a) { var i = a.indexOf(cb); if (i >= 0) a.splice(i, 1); }
    return this;
  };
  FMap.prototype.fire = function (type, data) {
    (this._listeners[type] || []).slice().forEach(function (cb) { cb(data); });
  };

  /* ---- View ---- */

  FMap.prototype.getCenter = function () { return [this.center.lat, this.center.lng]; };
  FMap.prototype.getZoom = function () { return this.zoom; };

  FMap.prototype.setView = function (latlng, zoom, opts) {
    opts = opts || {};
    var target = {
      lat: clamp(latlng[0], -MAX_LAT, MAX_LAT),
      lng: latlng[1],
      zoom: clamp(zoom === undefined ? this.zoom : zoom, this.minZoom, this.maxZoom)
    };
    if (opts.animate === false) {
      this._cancelAnim();
      this.center = { lat: target.lat, lng: target.lng };
      this.zoom = target.zoom;
      this._scheduleRender();
      this.fire('move');
      this.fire('moveend');
    } else {
      this._animateTo(target, opts.duration || 400);
    }
  };

  FMap.prototype.flyTo = function (latlng, zoom, opts) { this.setView(latlng, zoom, opts); };

  FMap.prototype.zoomIn = function (delta) {
    var z = clamp(Math.round(this.zoom) + (delta || 1), this.minZoom, this.maxZoom);
    this._animateTo({ lat: this.center.lat, lng: this.center.lng, zoom: z }, 250);
  };
  FMap.prototype.zoomOut = function (delta) { this.zoomIn(-(delta || 1)); };

  FMap.prototype.fitBounds = function (b, opts) {
    opts = opts || {};
    var pad = opts.padding === undefined ? 40 : opts.padding;
    var cap = opts.maxZoom === undefined ? this.maxZoom : opts.maxZoom;
    var z;
    for (z = this.maxZoom; z > this.minZoom; z--) {
      var dx = Math.abs(lngToWorldX(b.east, z) - lngToWorldX(b.west, z));
      var dy = Math.abs(latToWorldY(b.south, z) - latToWorldY(b.north, z));
      if (dx <= this._width - 2 * pad && dy <= this._height - 2 * pad) break;
    }
    this.setView([(b.north + b.south) / 2, (b.east + b.west) / 2], Math.min(z, cap), opts);
  };

  FMap.prototype._animateTo = function (target, duration) {
    this._cancelAnim();
    var self = this;
    var from = { lat: this.center.lat, lng: this.center.lng, zoom: this.zoom };
    var t0 = performance.now();
    function ease(t) { return 1 - Math.pow(1 - t, 3); }
    function step(now) {
      var p = Math.min(1, (now - t0) / duration);
      var e = ease(p);
      self.center = { lat: from.lat + (target.lat - from.lat) * e, lng: from.lng + (target.lng - from.lng) * e };
      self.zoom = from.zoom + (target.zoom - from.zoom) * e;
      self._scheduleRender();
      self.fire('move');
      if (p < 1) self._animRaf = requestAnimationFrame(step);
      else { self._animRaf = null; self.fire('moveend'); }
    }
    this._animRaf = requestAnimationFrame(step);
  };

  FMap.prototype._cancelAnim = function () {
    if (this._animRaf) { cancelAnimationFrame(this._animRaf); this._animRaf = null; }
    if (this._inertiaRaf) { cancelAnimationFrame(this._inertiaRaf); this._inertiaRaf = null; }
    clearTimeout(this._snapT);
  };

  FMap.prototype._syncHash = function () {
    if (typeof history === 'undefined') return;
    var h = '#' + this.center.lat.toFixed(5) + ',' + this.center.lng.toFixed(5) + ',' + (+this.zoom.toFixed(2));
    if (location.hash !== h) history.replaceState(null, '', h);
  };

  /* ---- Geometry helpers ---- */

  FMap.prototype._panBy = function (dx, dy) {
    var c = project(this.center.lat, this.center.lng, this.zoom);
    this.center = { lat: unproject(c.x - dx, c.y - dy, this.zoom)[0], lng: unproject(c.x - dx, c.y - dy, this.zoom)[1] };
  };

  FMap.prototype._screenToLatLng = function (px, py) {
    var c = project(this.center.lat, this.center.lng, this.zoom);
    return unproject(c.x + (px - this._width / 2), c.y + (py - this._height / 2), this.zoom);
  };

  /* Zoom keeping the geographic point at (px, py) pinned under the cursor. */
  FMap.prototype._zoomAt = function (px, py, targetZoom) {
    var sOld = TILE * Math.pow(2, this.zoom);
    var sNew = TILE * Math.pow(2, targetZoom);
    var uC = (this.center.lng + 180) / 360;
    var vC = latToWorldY(this.center.lat, 0) / TILE;
    var u = uC + (px - this._width / 2) / sOld;
    var v = vC + (py - this._height / 2) / sOld;
    this.center = {
      lat: worldYToLat((v - (py - this._height / 2) / sNew) * TILE, 0),
      lng: (u - (px - this._width / 2) / sNew) * 360 - 180
    };
    this.zoom = targetZoom;
  };

  FMap.prototype._snapZoom = function (delay) {
    clearTimeout(this._snapT);
    var self = this;
    this._snapT = setTimeout(function () {
      var target = Math.round(clamp(self.zoom, self.minZoom, self.maxZoom));
      if (Math.abs(target - self.zoom) > 0.01) {
        self._animateTo({ lat: self.center.lat, lng: self.center.lng, zoom: target }, 180);
      } else {
        self.fire('moveend');
      }
    }, delay || 160);
  };

  /* ---- Interaction ---- */

  FMap.prototype._bindEvents = function () {
    var self = this;
    var c = this._el;

    c.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.fm-zoom, .fm-attribution, .fm-popup, .fm-pin')) return;
      self._cancelAnim();
      self._closePopup();
      c.setPointerCapture(e.pointerId);
      self._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (self._pointers.size === 1) {
        self._drag = {
          startX: e.clientX, startY: e.clientY,
          lat: self.center.lat, lng: self.center.lng,
          moved: false, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }]
        };
        c.classList.add('fm-dragging');
      } else if (self._pointers.size === 2) {
        var pts = Array.from(self._pointers.values());
        self._pinch = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          midX: (pts[0].x + pts[1].x) / 2,
          midY: (pts[0].y + pts[1].y) / 2
        };
        self._drag = null;
      }
      e.preventDefault();
    });

    c.addEventListener('pointermove', function (e) {
      if (!self._pointers.has(e.pointerId)) return;
      self._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (self._pointers.size === 1 && self._drag) {
        var d = self._drag;
        var dx = e.clientX - d.startX, dy = e.clientY - d.startY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
        var pc = project(d.lat, d.lng, self.zoom);
        self.center = { lat: unproject(pc.x - dx, pc.y - dy, self.zoom)[0], lng: unproject(pc.x - dx, pc.y - dy, self.zoom)[1] };
        self._scheduleRender();
        self.fire('move');
        var now = performance.now();
        d.samples.push({ t: now, x: e.clientX, y: e.clientY });
        if (d.samples.length > 6) d.samples.shift();
      } else if (self._pointers.size === 2 && self._pinch) {
        var pts2 = Array.from(self._pointers.values());
        var dist = Math.hypot(pts2[0].x - pts2[1].x, pts2[0].y - pts2[1].y);
        var midX = (pts2[0].x + pts2[1].x) / 2, midY = (pts2[0].y + pts2[1].y) / 2;
        var factor = dist / self._pinch.dist;
        if (isFinite(factor) && factor > 0) {
          var rect = c.getBoundingClientRect();
          self._zoomAt(midX - rect.left, midY - rect.top,
            clamp(self.zoom + Math.log2(factor), self.minZoom, self.maxZoom));
          self._panBy(midX - self._pinch.midX, midY - self._pinch.midY);
          self._scheduleRender();
          self.fire('move');
          self._snapZoom();
        }
        self._pinch = { dist: dist, midX: midX, midY: midY };
      }
    });

    function onUp(e) {
      self._pointers.delete(e.pointerId);
      if (self._pointers.size === 1 && self._pinch) {
        // One finger lifted out of a pinch: re-anchor a drag where the finger is now.
        self._pinch = null;
        var rem = Array.from(self._pointers.values())[0];
        self._drag = { startX: rem.x, startY: rem.y, lat: self.center.lat, lng: self.center.lng, moved: true, samples: [] };
      }
      if (self._pointers.size > 0) return;
      c.classList.remove('fm-dragging');
      var d = self._drag;
      self._drag = null;
      self._pinch = null;
      if (!d) return;
      if (!d.moved) {
        var rect = c.getBoundingClientRect();
        var ll = self._screenToLatLng(e.clientX - rect.left, e.clientY - rect.top);
        self.fire('click', { latlng: ll, x: e.clientX - rect.left, y: e.clientY - rect.top });
        self.fire('moveend');
        return;
      }
      var now = performance.now();
      var recent = d.samples.filter(function (s) { return now - s.t < 120; });
      var vx = 0, vy = 0;
      if (recent.length >= 2) {
        var a = recent[0], b = recent[recent.length - 1];
        var dt = Math.max(1, b.t - a.t);
        vx = (b.x - a.x) / dt;
        vy = (b.y - a.y) / dt;
      }
      if (Math.hypot(vx, vy) > 0.15) self._inertia(clamp(vx, -2, 2), clamp(vy, -2, 2));
      else self.fire('moveend');
    }
    c.addEventListener('pointerup', onUp);
    c.addEventListener('pointercancel', onUp);

    c.addEventListener('wheel', function (e) {
      e.preventDefault();
      self._cancelAnim();
      self._closePopup();
      var rect = c.getBoundingClientRect();
      var px = e.clientX - rect.left, py = e.clientY - rect.top;
      if (e.ctrlKey) {
        // Trackpad pinch — browsers deliver it as ctrl+wheel with tiny deltas.
        self._zoomAt(px, py, clamp(self.zoom + clamp(-e.deltaY * 0.01, -0.75, 0.75), self.minZoom, self.maxZoom));
        self._scheduleRender();
        self.fire('move');
        self._snapZoom(300);
      } else if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) {
        // Discrete mouse-wheel notch: one zoom step, snap to crisp integer after.
        var unit = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0022;
        self._zoomAt(px, py, clamp(self.zoom + clamp(-e.deltaY * unit, -1, 1), self.minZoom, self.maxZoom));
        self._scheduleRender();
        self.fire('move');
        self._snapZoom();
      } else {
        // ponytail: |deltaY| < 50 heuristic = trackpad two-finger scroll → pan (Google Maps behaviour); raise threshold if some mouse sends tiny deltas
        self._panBy(-e.deltaX, -e.deltaY);
        self._scheduleRender();
        self.fire('move');
      }
    }, { passive: false });

    c.addEventListener('dblclick', function (e) {
      e.preventDefault();
      var rect = c.getBoundingClientRect();
      self._cancelAnim();
      self._zoomAt(e.clientX - rect.left, e.clientY - rect.top, clamp(Math.round(self.zoom) + 1, self.minZoom, self.maxZoom));
      self._animateTo({ lat: self.center.lat, lng: self.center.lng, zoom: Math.round(self.zoom) }, 200);
    });

    c.addEventListener('keydown', function (e) {
      var handled = true;
      switch (e.key) {
        case '+': case '=': self.zoomIn(); break;
        case '-': case '_': self.zoomOut(); break;
        case 'ArrowLeft': self._panBy(80, 0); break;
        case 'ArrowRight': self._panBy(-80, 0); break;
        case 'ArrowUp': self._panBy(0, 80); break;
        case 'ArrowDown': self._panBy(0, -80); break;
        default: handled = false;
      }
      if (handled) {
        e.preventDefault();
        self._scheduleRender();
        self.fire('move');
        self._snapZoom();
      }
    });

    this._popupEl.addEventListener('click', function (e) {
      if (e.target.closest('.fm-popup-close')) self._closePopup();
    });
  };

  FMap.prototype._inertia = function (vx, vy) {
    var self = this;
    var last = performance.now();
    function step(now) {
      var dt = Math.min(50, now - last);
      last = now;
      vx *= Math.exp(-dt / 325);
      vy *= Math.exp(-dt / 325);
      if (Math.hypot(vx, vy) < 0.02) { self._inertiaRaf = null; self.fire('moveend'); return; }
      self._panBy(-vx * dt, -vy * dt);
      self._scheduleRender();
      self.fire('move');
      self._inertiaRaf = requestAnimationFrame(step);
    }
    this._inertiaRaf = requestAnimationFrame(step);
  };

  /* ---- Rendering ---- */

  FMap.prototype._scheduleRender = function () {
    if (this._renderScheduled) return;
    this._renderScheduled = true;
    var self = this;
    requestAnimationFrame(function () { self._renderScheduled = false; self._render(); });
  };

  FMap.prototype._render = function () {
    var z = clamp(this.zoom, this.minZoom, this.maxZoom);
    var z0 = Math.round(z);
    var scale = Math.pow(2, z - z0);
    var w = this._width, h = this._height;
    var cs = project(this.center.lat, this.center.lng, z); // world px at fractional zoom (scale 1)
    var ox = w / 2 - cs.x, oy = h / 2 - cs.y;

    // Tiles: one extra ring preloaded so panning never shows gaps.
    var self = this;
    function renderTiles(cache, pane, urlFor) {
      var margin = TILE * scale;
      var tiles = tilesInView(self.center, z, w + 2 * margin, h + 2 * margin, z0);
      var seen = new Set();
      var subdomains = ['a', 'b', 'c'];
      tiles.forEach(function (t) {
        var key = t.z + '/' + t.x + '/' + t.y;
        seen.add(key);
        var tile = cache.get(key);
        if (!tile) {
          var img = new Image(TILE, TILE);
          img.className = 'fm-tile';
          img.decoding = 'async';
          img.alt = '';
          img.src = urlFor(t, subdomains);
          pane.appendChild(img);
          tile = { el: img };
          cache.set(key, tile);
        }
        tile.el.style.transform =
          'translate3d(' + (ox + t.x * TILE * scale) + 'px,' + (oy + t.y * TILE * scale) + 'px,0) scale(' + scale + ')';
      });
      cache.forEach(function (tile, key) {
        if (!seen.has(key)) { tile.el.remove(); cache.delete(key); }
      });
    }
    renderTiles(this._tiles, this._tilePane, function (t, subdomains) {
      return self._tileUrl
        .replace('{s}', subdomains[(Math.abs(t.x + t.y)) % 3])
        .replace('{z}', t.z).replace('{x}', t.wx).replace('{y}', t.y);
    });
    if (self._overlayUrl) {
      renderTiles(this._overlayTiles, this._overlayPane, function (t) {
        return self._overlayUrl.replace('{z}', t.z).replace('{x}', t.wx).replace('{y}', t.y);
      });
    } else if (this._overlayTiles.size) {
      this._overlayTiles.forEach(function (tile) { tile.el.remove(); });
      this._overlayTiles.clear();
    }

    // Markers
    this._markers.forEach(function (m) {
      var p = project(m.lat, m.lng, z);
      m.el.style.transform = 'translate3d(' + (ox + p.x) + 'px,' + (oy + p.y) + 'px,0)';
    });

    // Polylines
    var svg = this._svg;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    this._lines.forEach(function (line) {
      var d = '';
      line.latlngs.forEach(function (ll, i) {
        var p = project(ll[0], ll[1], z);
        d += (i ? 'L' : 'M') + (ox + p.x).toFixed(1) + ' ' + (oy + p.y).toFixed(1);
      });
      line.el.setAttribute('d', d);
      svg.appendChild(line.el);
    });

    // Popup follows its marker
    if (this._popupMarker) {
      var pp = project(this._popupMarker.lat, this._popupMarker.lng, z);
      this._popupEl.style.left = (ox + pp.x) + 'px';
      this._popupEl.style.top = (oy + pp.y) + 'px';
    }
  };

  /* ---- Markers, popups, polylines ---- */

  FMap.prototype.addMarker = function (latlng, opts) {
    opts = opts || {};
    var self = this;
    var m = {
      lat: latlng[0], lng: latlng[1],
      el: el('div', 'fm-marker'),
      popup: opts.popup || null
    };
    m.el.innerHTML = PIN_SVG;
    if (opts.color) m.el.style.setProperty('--fm-pin', opts.color);
    m.el.setAttribute('role', 'button');
    m.el.setAttribute('aria-label', opts.title || 'Map marker');
    m.el.title = opts.title || '';
    m.el.addEventListener('click', function () {
      if (m.popup) self._openPopup(m);
    });
    this._markerPane.appendChild(m.el);
    this._markers.push(m);
    this._scheduleRender();
    return {
      setLatLng: function (ll) { m.lat = ll[0]; m.lng = ll[1]; self._scheduleRender(); },
      remove: function () {
        m.el.remove();
        var i = self._markers.indexOf(m);
        if (i >= 0) self._markers.splice(i, 1);
        if (self._popupMarker === m) self._closePopup();
        self._scheduleRender();
      }
    };
  };

  FMap.prototype._openPopup = function (m) {
    this._popupMarker = m;
    this._popupEl.innerHTML =
      '<button type="button" class="fm-popup-close" aria-label="Close popup">\u00d7</button>' + m.popup;
    this._popupEl.style.display = 'block';
    this._scheduleRender();
  };

  FMap.prototype._closePopup = function () {
    this._popupMarker = null;
    this._popupEl.style.display = 'none';
  };

  FMap.prototype.addPolyline = function (latlngs, opts) {
    opts = opts || {};
    var self = this;
    var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', opts.color || '#1a73e8');
    path.setAttribute('stroke-width', opts.weight || 4);
    path.setAttribute('stroke-opacity', opts.opacity === undefined ? 0.9 : opts.opacity);
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('stroke-linecap', 'round');
    var line = { latlngs: latlngs, el: path };
    this._lines.push(line);
    this._scheduleRender();
    return {
      setLatLngs: function (lls) { line.latlngs = lls; self._scheduleRender(); },
      remove: function () {
        var i = self._lines.indexOf(line);
        if (i >= 0) self._lines.splice(i, 1);
        self._scheduleRender();
      }
    };
  };

  /* Swap the tile source at runtime (street ↔ satellite) and re-fetch. */
  FMap.prototype.setTileUrl = function (url, attribution) {
    this._tileUrl = url;
    if (attribution !== undefined) {
      var a = this._el.querySelector('.fm-attribution');
      if (a) a.innerHTML = attribution;
    }
    this._tiles.forEach(function (t) { t.el.remove(); });
    this._tiles.clear();
    this._scheduleRender();
  };

  /* Toggle the transparent label overlay (hybrid satellite) — null hides it. */
  FMap.prototype.setOverlayUrl = function (url) {
    this._overlayUrl = url || null;
    this._overlayTiles.forEach(function (t) { t.el.remove(); });
    this._overlayTiles.clear();
    this._scheduleRender();
  };

  FMap.prototype.remove = function () {
    this._cancelAnim();
    if (this._ro) this._ro.disconnect();
    while (this._el.firstChild) this._el.removeChild(this._el.firstChild);
    this._el.classList.remove('fm-container', 'fm-dragging');
  };

  return {
    Map: FMap,
    __math: {
      project: project, unproject: unproject, tilesInView: tilesInView,
      lngToWorldX: lngToWorldX, latToWorldY: latToWorldY,
      worldXToLng: worldXToLng, worldYToLat: worldYToLat, MAX_LAT: MAX_LAT
    },
    version: '1.3.0'
  };
});
