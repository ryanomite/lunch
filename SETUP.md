# Lunch App Setup

## Prerequisites
- Node.js 18+
- MariaDB (shared CapRover container or local)
- Google Maps API key (Maps JavaScript + Places + Directions enabled)
- CapRover with GitHub webhook (for deployment)

## 1. Create env.js

Copy the example and fill in your Google Maps API key:

```bash
cp public/env.example.js public/env.js
# Edit public/env.js and add your key
```

**Never commit `public/env.js` to git.**

## 2. Database Setup

Create the database, user, and tables on your MariaDB server:

```sql
CREATE DATABASE IF NOT EXISTS lunch CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'lunch'@'%' IDENTIFIED BY 'YOUR_PASSWORD';
GRANT ALL PRIVILEGES ON lunch.* TO 'lunch'@'%';
FLUSH PRIVILEGES;
```

Tables are created automatically on first boot from `db/schema.sql`.

## 3. Environment Variables

Set these in CapRover (or locally via `.env`):

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MariaDB host (e.g. `srv-captain--db`) |
| `DB_PORT` | MariaDB port (default `3306`) |
| `DB_USER` | Database user (e.g. `lunch`) |
| `DB_PASS` | Database password |
| `DB_NAME` | Database name (default `lunch`) |
| `PORT` | Server port (default `3000`) |

## 4. Local Development

```bash
npm install
node server.js
# Open http://localhost:3000
```

On first visit you'll be prompted to enter your name and pick a color.

## 5. CapRover Deployment

### One-time setup

1. Add the `captain-definition` file to your repo root (already included)
2. In CapRover, create an app named `lunch`
3. Set app variables for DB credentials
4. Enable "Enable Deploy Webhook" on the app
5. Point your domain `lunch.app.ryanroper.com` to the app in CapRover

### Google Maps API

Add `lunch.app.ryanroper.com` as an HTTP referrer in Google Cloud Console:
- APIs & Services > Credentials > Your Maps key > Application restrictions > HTTP referrers

### Deploy

Push to your GitHub repo. CapRover will auto-deploy via webhook.

## 6. Architecture

- **No build step** — vanilla JS ES modules served directly
- **No client framework** — vanilla DOM manipulation
- **No ORM** — raw mysql2 queries with parameterized SQL
- **No SSR** — static HTML + client-side rendering
- **No SPA router** — hash-free; views toggled by JS
- **SSE** for realtime updates across devices
- **PWA** — installable, offline shell caching

## Project Structure

```
lunch/
├── db/schema.sql          # Database schema (run on boot)
├── db.js                  # mysql2 pool (repo root)
├── server.js              # Express server + REST API
├── Dockerfile
├── captain-definition
├── public/
│   ├── index.html         # PWA shell
│   ├── manifest.json
│   ├── sw.js              # Service worker
│   ├── env.js             # API key (NOT in git)
│   ├── css/app.css
│   ├── icons/             # SVG icons
│   └── js/
│       ├── app.js         # Boot sequence
│       ├── api.js         # Fetch wrappers
│       ├── state.js       # Client state
│       ├── events.js      # Pub/sub
│       ├── utils.js       # Helpers
│       ├── mapManager.js  # Google Maps
│       ├── mapLabel.js    # Map overlays
│       ├── restaurantManager.js
│       ├── panels.js      # UI controller
│       └── configManager.js
├── CORE.md                # Architecture reference
├── LUNCH.md               # Feature spec
├── SETUP.md               # This file
└── package.json
```
