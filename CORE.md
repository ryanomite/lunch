# CORE — Reference Architecture & Learnings for New Family Web Apps

This document captures the architecture, conventions, and proven patterns from the
**Vacation Planner** app so that new family web apps (starting with the **Lunch**
restaurant-idea app) can be planned and built on the same foundation without
re-deriving every decision. It is intended as the primary brief an LLM reads when
planning a new app in this family.

The Vacation Planner source lives at `/Users/ryan/travel` and is the canonical
reference implementation. Citations like `server.js:26` refer to files/lines there.

---

## 1. Goals & guiding principles

- **Single-purpose, family-scale web apps** — small number of trusted users (the
  household), no public sign-up, no per-user authentication needed.
- **Fast to plan, fast to build, fast to deploy.** No build step, no framework,
  no ORM, no database migrations to manage by hand beyond what's needed.
- **Installable PWA** so the app lives on the home screen and feels native.
- **Realtime collaboration** — when one family member edits, everyone else sees
  it without a manual refresh.
- **Resilient & offline-friendly** — works through network blips, caches the
  shell, falls back to local storage.
- **Cheap to host** — one container on CapRover, one shared MariaDB instance.

---

## 2. Tech stack (carry over as-is)

| Layer | Technology | Notes |
|---|---|---|
| Frontend | **Vanilla JS ES modules** | No bundler, no transpiler, no React/Vue. Files are served directly by Express. |
| Map | **Google Maps JavaScript API + Places API** | Dynamic loader, script injected with a one-shot callback. |
| Backend | **Node.js + Express** | Keep it minimal — no ORM, no extra frameworks. |
| Realtime | **Server-Sent Events (SSE)** | No websockets dependency; `EventSource` auto-reconnects. See §7. |
| Storage | **MariaDB** *(new for Lunch app)* | Shared CapRover database container. Replaces the `data.json` file used in Vacation. |
| Styling | **Plain CSS in `public/css/app.css`** | Dark theme base `#0f172a`. No CSS frameworks. |
| Packaging | **Dockerfile + `captain-definition`** | Deploy to CapRover via GitHub webhook on `main`. |
| Versioning | **Semantic versioning** `MAJOR.MINOR.PATCH` from `0.1.0` | See §12. |

### ⚠️ Things to deliberately change / not carry over
- **Storage:** Vacation used `data/data.json` (a single file). Lunch will use
  **MariaDB** with a relational schema. The atomic-write + backup-file approach
  in `server.js:70-96` does not apply; use SQL transactions and DB-level backups
  instead. The server still exposes a REST API that hides this from the client.
- **WebSocket note:** Vacation uses SSE (one-way, server→client) which is enough
  because edits are user-triggered POSTs. If the Lunch app needs true bidirectional
  low-latency updates (e.g. live voting while standing in the parking lot), SSE is
  still adequate — clients POST their changes and the server fans out via SSE.
  **WebSockets are available via the same Express server if needed** (add `ws`
  package), but SSE is the recommended default to match the existing pattern.

---

## 3. Repository & directory layout (recommended)

Keep the same shape as Vacation — it has proven clean:

```
lunch/
├── server.js              Express backend (REST + SSE + static)
├── package.json
├── Dockerfile
├── captain-definition
├── README.md
├── SETUP.md               Ops/setup guide (API keys, CapRover steps)
├── .github/
│   └── copilot-instructions.md   Versioning + coding conventions
├── db/
│   └── schema.sql         MariaDB schema (checked in, idempotent CREATE TABLE)
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js              Service worker — offline shell + optional background sync
    ├── icons/
    └── css/
    │   └── app.css
    └── js/
        ├── app.js         Boot sequence only
        ├── api.js         Backend fetch calls
        ├── state.js       Single source of truth; all mutations here
        ├── events.js      Pub/sub bus (no direct module cross-imports)
        ├── utils.js       Constants + helpers
        ├── db.js          ★ NEW — MariaDB connection pool (server-side, but
        │                      paired conceptually with api.js). See §8.
        ├── mapManager.js  All google.maps.* calls isolated here
        └── ... feature managers (e.g. restaurantManager.js)
```

**Frontend module dependency rule (from Vacation, must keep):**
> Never import `panels.js` (or any UI module) from a manager module.
> Events flow: user interaction → manager emits event → panels/state react.
> The only module that touches `google.maps.*` is `mapManager.js`.

---

## 4. Backend conventions

### 4.1 Express setup — `server.js`

From `server.js`:

- `'use strict'` at the top.
- `app.use(express.json({ limit: '10mb' }))` — generous body limit for payloads.
- `app.use(express.static(path.join(__dirname, 'public')))` — serve frontend.
- `const PORT = process.env.PORT || 3000;`
- Listen with a startup `console.log`.

### 4.2 Config endpoint (don't ship API keys to the client bundle)

`server.js:42-48` exposes `GET /api/config` returning `{ mapsApiKey }` read from
`process.env.GOOGLE_MAPS_API_KEY`. The client fetches this **before** loading the
Maps script — keys are never hardcoded in JS. Keep this exact pattern.

If the env var is missing, return `500` with a clear message so the client can
show a friendly "Could not start" screen (`app.js:232` shows the error UI).

### 4.3 REST endpoints

Vacation's surface is tiny (`server.js:51-148`):

| Method & path | Purpose |
|---|---|
| `GET  /api/config` | Hand the Maps API key to the client. |
| `GET  /api/data`   | Load the whole plan. |
| `POST /api/data`   | Replace the whole plan (atomic write + backup). |
| `GET  /api/backups` / `POST /api/restore/:filename` | Backup list + restore. |
| `POST /api/location` | Share-mode location push (rebroadcast over SSE). |
| `GET  /api/events` | SSE stream (§7). |

**Lunch adaptation:** instead of one `GET/POST /api/data` blob, expose granular
resource routes backed by MariaDB, e.g.:

```
GET    /api/restaurants            list
POST   /api/restaurants            create
GET    /api/restaurants/:id        read one
PUT    /api/restaurants/:id         update
DELETE /api/restaurants/:id         delete
POST   /api/restaurants/:id/vote    (or /try, /skip — whatever the schema needs)
```

Each mutating handler must, on success, `_broadcast({ type: 'data-changed' })` so
other clients refresh. (Vacation did `_broadcast` only in the bulk-save handler;
Lunch should do it in every mutator.) See §7.

### 4.4 Validation

Vacation validates top-level shape with `Array.isArray(...)` checks
(`server.js:58-61`, `server.js:72-75`). For Lunch with MariaDB, lean on:
- SQL column types / `NOT NULL` constraints.
- Explicit `400` responses for malformed JSON / missing required fields.
- Sanitize / parameterize every query (use the `mysql2` driver with prepared
  statements or the promise pool's `query(sql, params)` parameterization — never
  string-concat user input).

### 4.5 Backups

Vacation writes a dated JSON file to `data/backups/` on every save. With MariaDB,
relax: rely on CapRover's DB container / nightly dumps instead of code-level
backups. Keep a simple `GET /api/backups` only if you actually want a UI for it.

---

## 5. Frontend architecture (carry over verbatim where possible)

### 5.1 Boot sequence — `app.js`

Vacation's `boot()` (`app.js:16-169`) is the template. Ordered steps:

1. `api.getConfig()` — get Maps key.
2. `loadMapsAPI(key)` — dynamippet script.
3. Load saved data with **localStorage fallback** if the backend is down
   (`loadDataWithFallback`, `app.js:190`).
4. `state.init(data)` — hand data to the store.
5. Init managers in dependency order (map → feature managers → panels).
6. Render saved data.
7. `events.on('state:changed', …)` — persist to `localStorage` on every change
   (the **auto-save** guarantee; server save is explicit via a Save button).
8. Wire UI controls.
9. Hide loading overlay.
10. Register service worker.
11. (App-specific) GPS, share mode, etc.
12. Connect the live-update SSE stream.

The whole flow is wrapped in `try/catch` → `showError(err)` (`app.js:166-168`),
which surfaces a friendly error screen (`index.html:286-290`) instead of a blank page.

### 5.2 Central state store — `state.js`

Vacation's `state.js` is the **single source of truth**. Key invariants:

- A module-level `_data` object; `init(data)` replaces it; `serialize()` deep-copies
  (via `JSON.parse(JSON.stringify(...))`) so callers can't mutate internal state.
- **Selectors** (`getLocations`, `getLocation(id)`) read only.
- **Mutations** (`addLocation`, `updateLocation`, `deleteLocation`, …) each
  perform the change and then `events.emit('entity:verb', payload)` followed by
  `events.emit('state:changed')`.
- Cascade rules live here, not in managers — e.g. deleting a location also removes
  dependent journeys (`state.js:42-50`).

For Lunch, follow the same shape: a `restaurants` array (or map) and any related
collections (votes, tags, visits). Keep all mutation logic here; managers just call
into `state.*` and react to events.

> **Note on the DB-backed app:** the client state store can still mirror the DB
> as an in-cache copy. The flow becomes: manager action → POST/PUT to server →
> on 2xx, mutate local `state` → emit `state:changed` → UI updates immediately,
> without waiting for the SSE round-trip. The SSE `data-changed` is the source of
> truth for *other* clients. See §10 for the optimistic-update policy.

### 5.3 Pub/sub event bus — `events.js`

Vacation's `events.js` is 22 lines: `on`, `off`, `emit`, a `Map` of handlers. This
is exactly what decouples managers from panels. Don't replace it with anything
heavier — copy verbatim.

### 5.4 API module — `api.js`

Vacation's `api.js` is 24 lines: thin `fetch` wrappers that throw on `!res.ok`.
Keep this.urse: one JS module, one function per endpoint, JSON in/out.

### 5.5 Utils & constants — `utils.js`

Vacation keeps color palettes, icon definitions, ID generation, and pure
formatting helpers here. Patterns to copy:

- `export const COLORS = [...]` palette used by both editor UI and markers.
- `export const DEFAULT_ICON / DEFAULT_COLOR`.
- `export function generateId()` — `Date.now().toString(36) + Math.random().toString(36).slice(2, 7)`.
  In Lunch, prefer letting **MariaDB** generate ids (`AUTO_INCREMENT`), and only
  generate client-side temp ids if you do optimistic inserts.
- Pure formatting helpers (`formatDate`, `formatMinutes`, `parseDurationMinutes`).

---

## 6. Google Maps integration — exactly the pattern to keep

### 6.1 Dynamic loader (frontend)

Vacation never bundles the Maps API. It injects a `<script>` with a unique global
callback, and waits for it to fire before initializing anything map-related
(`app.js:173-186`):

```js
function loadMapsAPI(apiKey) {
  return new Promise((resolve, reject) => {
    const cb = '_googleMapsReady_' + Date.now();
    window[cb] = () => { delete window[cb]; resolve(); };
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places&callback=${cb}`;
    s.async = true; s.defer = true;
    s.onerror = () => reject(new Error('Failed to load Google Maps API.'));
    document.head.appendChild(s);
  });
}
```

Use `libraries=places` query param so the Places library (autocomplete, place
details) is available; add `&libraries=geometry` if needed for distance math.

### 6.2 All `google.maps.*` live in ONE file — `mapManager.js`

`mapManager.js` is the entire Maps abstraction. Other modules never call
`google.maps.*` directly. Vacation exposes:

- `init()` — create the `Map`, `Geocoder`, `DirectionsService`, an `Autocomplete`
  on the toolbar search box.
- `getMap()`, `createAutocomplete(inputEl)` — give managers their own autocomplete
  bound to a specific `<input>`.
- `addMapClickListener(fn)`, `removeListener(handle)`, `setMapCursor(...)`.
- `fitBoundsToLocations([...])` — zoom-to-fit with a single-location fast path.
- `reverseGeocode(latLng)` — Promise-wrapped geocoder, with a sensible fallback
  to formatted `"lat, lng"`.
- `getDirections(from, to)` — Promise-wrapped Directions API call with
  `provideRouteAlternatives: true`.
- `getPlaceDetails(placeId)` — Promise-wrapped PlacesService.
- `makeMarkerIcon(color, iconDef)` — returns a Google Maps `Icon` whose `url` is an
  inline SVG data URI (lets you color markers and embed FontAwesome glyphs). This
  is the cleanest way to get custom colored SVG markers without image assets.
- `initGeolocation(onTap)` — `navigator.geolocation.watchPosition` plus a custom
  `OverlayView` GPS dot; tap handler lets you toggle Follow Me from the dot itself.

For Lunch, prune what you don't need (Directions, probably) and keep: `init`,
`getMap`, `createAutocomplete`, `addMapClickListener`, `fitBoundsTo…`,
`makeMarkerIcon`, `getPlaceDetails`. The search-as-you-type autocomplete for
restaurant names is the same `createAutocomplete` call used by Vacation's
"Add Stop" feature.

### 6.3 API key setup (reuse the existing key)

If the Lunch app maps a domain like `lunch.app.ryanroper.com`, add that referrer
to the **same** Google Cloud API key's allowed HTTP referrers — Vacation already
restricts to `https://vacation.app.ryanroper.com/*`. Just add the new referrer;
no new key needed. Enable the same APIs: **Maps JavaScript API**, **Places API**.
(Directions API only if Lunch ever routes between restaurants — unlikely.)

`SETUP.md` steps for the key are reusable; update only the referrer and CapRover
app name.

---

## 7. Realtime updates via Server-Sent Events — keep this exact pattern

Vacation's realtime layer is ~30 lines of `server.js` + ~15 lines of `app.js`.
SSE is the right default for these family apps: no extra dependencies, native
browser auto-reconnect, works through nginx/CapRover with one header.

### 7.1 Server (`server.js:12-40`)

```js
const _sseClients = new Set();
function _broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  _sseClients.forEach(res => {
    try { res.write(msg); } catch (_) { _sseClients.delete(res); }
  });
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',          // critical behind CapRover/nginx proxy
  });
  res.write('retry: 3000\n\n');         // client reconnects after 3s if dropped
  _sseClients.add(res);
  const keepalive = setInterval(() => {
    try { res.write(':ping\n\n'); } catch (_) { clearInterval(keepalive); _sseClients.delete(res); }
  }, 25000);                            // stop nginx/proxy closing idle streams
  req.on('close', () => { clearInterval(keepalive); _sseClients.delete(res); });
});
```

Critical gotchas captured here:
- **`X-Accel-Buffering: no`** — disables nginx proxy buffering so the stream
  flushes immediately. Without this, SSE behind CapRover is unusably laggy.
- **`:ping` comment every 25s** — keeps the connection alive through proxies
  that close idle streams after ~60s.
- **`retry: 3000`** — first line sent; tells `EventSource` to reconnect after 3s
  on disconnect (it also auto-reconnects by default).
- Cleared keepalive + `_sseClients.delete` on `req.on('close')`.

After every mutating REST handler succeeds, call `_broadcast({ type: 'data-changed' })`.
For per-entity updates you can be more granular (e.g.
`{ type: 'restaurant:added', id }`) — clients can decide whether to refetch all
or update one.

### 7.2 Client (`app.js:360-389`)

```js
function _connectSSE() {
  if (typeof EventSource === 'undefined') return; // graceful degradation
  const es = new EventSource('/api/events');
  es.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (msg.type === 'data-changed') _remoteReload();
      // ...handle other msg types here (e.g. 'user-location')
    } catch (_) {}
  };
  // EventSource auto-reconnects — no manual retry needed.
}

async function _remoteReload() {
  // Don't interrupt an active edit session — toast instead.
  if (anyEditorOpen()) { _showToast('Updated by another device', 'info', 3000); return; }
  const data = await api.loadData();
  // clearAll managers, state.init(data), renderAll, sync localStorage.
}
```

The "don't interrupt active edits — toast and skip" rule (`app.js:375-377`) is
important UX: family members may be editing simultaneously from different phones.

### 7.3 CapRover note

CapRover fronts Node services with nginx. The `X-Accel-Buffering: no` header is
what makes SSE usable there. Confirmed working in production on Vacation.

---

## 8. Database — MariaDB (new for Lunch)

Vacation had no database. Lunch adopts MariaDB, available as a shared CapRover
container.

### 8.1 Connection

Recommended driver: **`mysql2`** (promise API). Add it to `package.json` — this is
one of those "clear reasons" for a new dependency the copilot-instructions allow.

```js
// db.js (server-side)
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'mariadb',
  port:     Number(process.env.DB_PORT) || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME     || 'lunch',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
});

module.exports = pool;
```

Wire the pool env vars in CapRover → App Configs → Environmental Variables
(point at the shared MariaDB container's hostname/port and a dedicated
database + user).

### 8.2 Schema design — relational

The whole point of switching to MariaDB is proper relational structure. Sketch
(rewrite during actual planning, this is a starting point):

```sql
-- A restaurant idea
CREATE TABLE restaurants (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(180) NOT NULL,
  place_id     VARCHAR(255),          -- Google Places place_id, for re-fetch
  address      VARCHAR(255),
  lat          DECIMAL(10,7),
  lng          DECIMAL(10,7),
  cuisine      VARCHAR(80),           -- e.g. "Mexican", "Thai"
  price_tier   TINYINT,               -- 1-4 ($ – $$$$)
  notes        TEXT,                  -- "kids menu good", "closed Sundays"
  emoji        VARCHAR(8),             -- optional marker icon
  color        VARCHAR(7),             -- "#ef4444" marker color
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_place_id (place_id)
);

-- Who's tried it and when
CREATE TABLE visits (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  visited_at    DATE NOT NULL,
  notes         VARCHAR(255),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  KEY idx_visits_res (restaurant_id, visited_at)
);

-- A yes/no vote per family member per restaurant ("want to go?" / "tried it")
CREATE TABLE votes (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  restaurant_id INT NOT NULL,
  member        VARCHAR(40) NOT NULL,    -- first name (no auth)
  want          BOOLEAN NOT NULL DEFAULT TRUE,  -- TRUE = want, FALSE = skip
  voted_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_member_vote (restaurant_id, member),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
);

-- Free-form tags ("after-church", "date-night", "kids-friendly")
CREATE TABLE tags (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  label         VARCHAR(40) NOT NULL UNIQUE,
  color         VARCHAR(7)
);
CREATE TABLE restaurant_tags (
  restaurant_id INT NOT NULL,
  tag_id        INT NOT NULL,
  PRIMARY KEY (restaurant_id, tag_id),
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id)        REFERENCES tags(id)        ON DELETE CASCADE
);
```

Check the schema into `db/schema.sql` and apply once (or as you iterate). CapRover
gives you a stable hostname for the shared MariaDB container — connect via that.

### 8.3 Connection detail to confirm with CapRover

CapRover's "app-to-app" communication uses the app's container name as the
hostname (e.g. `srv-captain--mariadb`). Confirm the exact hostname and the
database/user provisioned for the Lunch app during planning. Set `DB_HOST`,
`DB_NAME`, `DB_USER`, `DB_PASSWORD` as CapRover env vars.

---

## 9. PWA install — carry over the pattern

### 9.1 `manifest.json`

Vacation's `manifest.json` is the minimum that works on Android Chrome, iOS
Safari, and desktop installs. Copy this structure; just change name/theme color:

```json
{
  "name": "Lunch",
  "short_name": "Lunch",
  "description": "Family restaurant ideas",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#0f172a",
  "orientation": "any",
  "categories": ["food", "productivity"],
  "icons": [
    { "src": "/icons/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

### 9.2 iOS PWA meta tags (`index.html:13-17`)

```html
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Lunch">
<link rel="apple-touch-icon" href="/icons/icon.svg">
```

These are what make "Add to Home Screen" on iOS behave like a real app
(no Safari chrome, dark status bar). Don't skip them.

### 9.3 Install-prompt nudge (`app.js:410-444`)

Vacation implements a polite install banner: capture `beforeinstallprompt`,
defer showing it by 2.5s, cap the number of times it appears per device
(`localStorage` counter, `MAX_SHOWS = 2`), and never show it if already
installed (`display-mode: standalone`).

```js
let _installPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _installPrompt = e;
  if (window.matchMedia('(display-mode: standalone)').matches) return; // already installed
  setTimeout(_showInstallBanner, 2500);
});
```

This is the right tone for a family app — not annoying, but not silent. The
matching HTML (`index.html:278-283`) is a thin bottom-bar with Install + Dismiss
buttons. Reuse `LUNCH-pwa-prompt-count` as the localStorage key.

### 9.4 Service worker — `sw.js`

Vacation's `sw.js` does three things:
1. Cache the **app shell** (a fixed list of `/`, JS, CSS, manifest, icons) on
   install, versioned by app version (`CACHE = 'vacation-v1.1.0'`).
2. On `activate`, delete any cache whose name differs (version-bump cleanup).
3. On `fetch`, **only match GETs on same origin, and never `/api/*`** — so the
   data layer is always live and never stale-cached. This is critical for a
   realtime app.

Plus, optional Service-Worker-side background sync for share mode (probably not
needed for Lunch — skip unless there's a clear reason).

For Lunch:
- Bump `CACHE` to `'lunch-v0.1.0'` (match `package.json` version).
- Update the `SHELL` array with Lunch's actual JS module list (one entry per
  file in `public/js`, plus `/css/app.css`, `/manifest.json`, `/icons/icon.svg`).
- Keep the exact `fetch` interceptor (`method !== 'GET' → return`, `origin
  !== self.location.origin → return`, `pathname.startsWith('/api/') → return`).
- Bump the cache name on every version bump so users get the new shell after
  deploy.

### 9.5 Wake lock + BFCache (optional, harmless)

Vacation also keeps the screen awake (`app.js:397-408`) and force-reloads on
BFCache restore (`app.js:392-394`). The wake lock is debatable for Lunch — the
"deciding what's for lunch" use case is shorter than road-trip navigation — but
the BFCache `pageshow` reload is a safe carryover (prevents stale SSE state
when reopening the PWA from the task switcher).

---

## 10. Data-flow policy for the DB-backed app

Vacation was a "single blob — explicit save" model. Lunch should be **per-action
optimistic**, because the relationship is now row-level:

```
User action in UI
  → manager calls optimistic state mutation (e.g. state.addRestaurant(temp))
     (only if you want instant feedback; alternatively wait for server)
  → api.post(...) / put(...) / delete(...)
  → on 2xx:
      server persists to MariaDB, broadcasts SSE { type:'data-changed' }
        (other clients refetch and re-render)
      originating client:
        reconcile client state from server response (replace temp id with real id),
        emit 'state:changed' → UI already updated, just confirm
  → on error:
        rollback the optimistic change, toast "Save failed", emit 'state:changed'
```

For Lunch's scale (a handful of family members, low write contention, generous
free DB cost), simple optimistic-then-reconcile is fine. Don't reach for
per-key SSE diffs unless a real problem shows up.

**localStorage mirror:** still keep an `events.on('state:changed', …)` listener
(`app.js:40-46`) writing the whole state to `localStorage` as a bootstrap cache
and offline fallback. On boot, `loadDataWithFallback()` tries the server first,
falls back to the cached snapshot if the server is unreachable
(`app.js:190-201`).

---

## 11. Security & safety

Vacation is wide-open (no auth) — appropriate for a family-shared URL. Carry this
explicitly:

- **No end-user authentication.** Anyone with the URL can read and write. This
  is the agreed trade-off for these family apps.
- **API key safety:** the Google Maps key is server-side only; the client gets
  it through `/api/config`. Restrict the key in Google Cloud to the production
  HTTPS referrer(s) only (Vacation restricts to
  `https://vacation.app.ryanroper.com/*`; add `https://lunch.app.ryanroper.com/*`
  or whatever the Lunch domain is).
- **DB password** lives in CapRover env vars, never in git.
- **SQL injection:** use `mysql2` parameterized queries / named placeholders.
  Never string-concat into SQL.
- **Input bounds:** keep `express.json({ limit: '10mb' })` for big payloads; for
  Lunch, smaller is fine (`'1mb'` unless rich text notes grow large).
- **CORS:** not needed — frontend and API are same origin in this deployment.
  Don't add `cors` package unless you start serving the frontend from a different
  origin.

---

## 12. Versioning & deploy discipline

From `.github/copilot-instructions.md` — keep the same conventions:

- **Semantic versioning** starting at `0.1.0`, kept in `package.json`.
  - Minor (`x.Y.0`): new features, panels, endpoints, capabilities.
  - Patch (`x.x.Z`): fixes, copy, style, behavior-preserving refactors.
  - Major (`X.0.0`): breaking schema or architectural overhaul.
- **Commit message format:** every commit message **must** be prefixed with the
  next version number, e.g. `0.1.0 Initial Lunch app scaffold`.
- Before committing: bump `package.json` `version` to the next number.
- After committing + push to `main`: CapRover webhook rebuilds and redeploys.
  The command itself: `git add -A && git commit -m "x.x.x …" && git push`.
- **Service worker cache name** must also be bumped with every release, or the
  installed PWAs won't pick up the new shell. Keep the sw cache version
  in sync with `package.json` version (Vacation does `vacation-v1.1.0`).

---

## 13. Deployment (CapRover) — re-use Vacation's setup, with MariaDB deltas

### One-time CapRover setup for Lunch

1. CapRover dashboard → create a new app (e.g. **lunch**).
2. **Environmental Variables:** set
   ```
   GOOGLE_MAPS_API_KEY = <same key as Vacation>
   DB_HOST     = <shared mariadb hostname, e.g. srv-captain--mariadb>
   DB_PORT     = 3306
   DB_NAME     = lunch
   DB_USER     = <user provisioned for this app>
   DB_PASSWORD = <strong password>
   ```
3. **No persistent data volume is needed for Lunch** (DB lives in the shared
   MariaDB container, not the Lunch container's filesystem). Vacation needed a
   volume for `data.json`; Lunch does not.
4. Connect the GitHub repo under *Deployment → Method 3*, branch `main`.
   Add the CapRover webhook URL to GitHub → Settings → Webhooks.
5. Enable Force HTTPS and set the domain (e.g. `lunch.app.ryanroper.com`).
6. Create the database & user on the shared MariaDB container:
   ```sql
   CREATE DATABASE lunch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   CREATE USER 'lunch'@'%' IDENTIFIED BY '<strong password>';
   GRANT ALL ON lunch.* TO 'lunch'@'%';
   ```
   Then apply `db/schema.sql` against that database.

### Every subsequent deploy

```bash
git add -A && git commit -m "0.1.0 …" && git push
```

CapRover rebuilds the Docker image and redeploys. The `Dockerfile` and
`captain-definition` from Vacation can be reused verbatim — they just copy
the repo, `npm ci --production`, and run `node server.js`.

### Dockerfile (reusable)

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
EXPOSE 3000
CMD ["node", "server.js"]
```

### captain-definition (reusable)

```json
{ "schemaVersion": 2, "dockerfilePath": "./Dockerfile" }
```

---

## 14. `.gitignore` baseline

```
node_modules/
.env
*.log
.DS_Store
```

Vacation also ignores `data/data.json`; Lunch won't have that file, but if you
write an `db/schema.local.sql` or scratch exports, add them.

---

## 15. SETUP.md template (to be filled in for Lunch)

The Vacation `SETUP.md` is a good skeleton. Sections to keep:
1. Google Maps API key (point at the existing cloud project; just add the new
   referrer).
2. Local development (`npm install`; export env vars including the `DB_*` set
   plus `GOOGLE_MAPS_API_KEY`; `npm start` → `http://localhost:3000`).
3. CapRover deployment (§13 above).
4. App usage (Lunch-specific).
5. Data persistence notes: explain that all data lives in MariaDB, with a
   `localStorage` snapshot for cold-start/offline, and SSE pushes live changes.
6. Project structure (§3).

---

## 16. Coding conventions (carry over verbatim)

From `.github/copilot-instructions.md`:

- **Language:** Vanilla JavaScript ES modules (no build step, no transpiler).
- **Backend:** Node.js + Express. Keep it minimal — no ORM, no extra frameworks.
- **Styling:** Plain CSS in `public/css/app.css`. Dark theme (`#0f172a` base).
  No CSS frameworks.
- **No comments or docstrings** should be added to code that wasn't changed.
- **No new dependencies** without a clear reason — check `package.json` first.
  (For Lunch, `mysql2` is the one sanctioned new dependency.)
- **Architecture:** events flow user → manager emits event → panels/state react.
  Never import `panels.js` from a manager module. Keep `google.maps.*` only in
  `mapManager.js`.
- **`'use strict'`** at the top of every server-side JS file.

---

## 17. Things to verify / decide during actual Lunch planning

These are deferred until the Lunch planning session — flagged here so they don't
get forgotten:

- [ ] **Domain** for Lunch on CapRover (e.g. `lunch.app.ryanroper.com`).
- [ ] **Shared MariaDB access**: exact container hostname, port, and whether
  CapRover creates a default user or whether provision is manual. Confirm you can
  reach it from the Lunch container at runtime.
- [ ] **Final data model** (§8.2 is a starting sketch): restaurants, visits,
  votes (per family member, want/skip), tags. Decide whether "after church"
  is a tag, a date constraint, or a UI filter. Decide price tier source
  (manual vs. pulled from Places).
- [ ] **Google Places `place_id` reuse**: store it so adding a known chain can
  later enrich details (hours, phone) without re-keying. Confirm Places API
  field set to request (`name`, `formatted_address`, `formatted_phone_number`,
  `geometry`, `place_id`).
- [ ] **Marker icon set**: reuse Vacation's `utils.js` ICONS palette (it already
  has `utensils`), or fork a smaller food-focused icon set.
- [ ] **Whether to keep the "Add Location by clicking the map" affordance** —
  probably yes; tapping the map or searching "Chipotle near me" both create
  a restaurant row. Same UX as Vacation's `_toggleAddMode` / `_onPlaceSelected`.
- [ ] **Where family members' names come from** without auth: Vacation's Share
  Mode prompts for a first name and stores it in `localStorage`. Lunch will need
  a "who am I" concept for votes; reuse that prompt pattern (no auth, name in
  localStorage). Pick a key like `lunch-member-name`.
- [ ] **Optimistic-update honesty:** if two family members vote at the same
  instant, the SSE `data-changed` from the second one will refetch the row;
  make sure the refetch path does not clobber an in-flight optimistic update
  on the originating client. Simplest answer: refetch is the source of truth,
  optimistic only bridges the round-trip visually.
- [ ] **Service worker version bump workflow:** decide whether to bump sw cache
  name on every commit ( Vacation chose to) or only on minor/major. Recommend
  bumping only on minor/major to avoid deploying a stale-cache bug mid-session.

---

## 18. Quick reference — file-by-file reuse cheat sheet

| Vacation file | Lunch action |
|---|---|
| `server.js` (SSE + config + REST) | **Adapt** — keep SSE/config verbatim; replace blob-save with per-entity REST routes backed by MariaDB. |
| `public/js/app.js` | **Adapt** — same boot sequence; drop journey/share code; keep PWA install, SW registration, wake lock, SSE connect, localStorage fallback. |
| `public/js/api.js` | **Adapt** — add per-resource fetch wrappers (`getRestaurants`, `addRestaurant`, …). |
| `public/js/state.js` | **Adapt** — mirror the DB rows in memory; same mutation→emit→changed pattern. |
| `public/js/events.js` | **Copy verbatim.** |
| `public/js/utils.js` | **Copy verbatim**, trim icons/colors to what Lunch needs, keep `generateId`/formatters. |
| `public/js/mapManager.js` | **Copy most** — drop `getDirections` and Follow Me; keep `init`, autocomplete, `makeMarkerIcon`, `getPlaceDetails`, `fitBoundsToLocations`. |
| `public/js/locationManager.js` | **Adapt** — same marker-create / sync / remove pattern, applied to restaurants. |
| `public/js/panels.js` | **Rewrite** — Lunch-specific UI; follow the panel/overlay/modal patterns from Vacation (bottom-sheet on mobile, modal backdrop, toast). |
| `public/js/shareManager.js` | **Drop** unless Lunch wants live location sharing. |
| `public/index.html` | **Adapt** — same meta tags, PWA install banner, loading overlay, error screen skeleton; new body markup for Lunch. |
| `public/manifest.json` | **Adapt** (§9.1). |
| `public/sw.js` | **Adapt** — new CACHE name, new SHELL file list. |
| `Dockerfile`, `captain-definition` | **Copy verbatim.** |
| `.github/copilot-instructions.md` | **Adapt** — change "no database" rule; note `mysql2` dependency; otherwise keep versioning + conventions. |
| `SETUP.md`, `README.md` | **Rewrite** for Lunch. |
| `data/` | **Not used.** Replace with `db/schema.sql`. |

---

_Compiled from the Vacation Planner codebase at `/Users/ryan/travel` (v1.1.5). When in
doubt, the Vacation source is the authoritative example — read it before re-deciding._