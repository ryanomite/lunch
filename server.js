'use strict';

const express = require('express');
const path   = require('path');
const fs     = require('fs');
const db     = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── SSE clients ───────────────────────────────────────────────────
const _sseClients = new Set();

function _broadcast(payload) {
  const msg = `data: ${JSON.stringify(payload)}\n\n`;
  _sseClients.forEach(res => {
    try { res.write(msg); } catch (_) { _sseClients.delete(res); }
  });
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type':       'text/event-stream',
    'Cache-Control':      'no-cache',
    'Connection':         'keep-alive',
    'X-Accel-Buffering':  'no',
  });
  res.write('retry: 3000\n\n');
  _sseClients.add(res);
  const keepalive = setInterval(() => {
    try { res.write(':ping\n\n'); } catch (_) { clearInterval(keepalive); _sseClients.delete(res); }
  }, 25000);
  req.on('close', () => { clearInterval(keepalive); _sseClients.delete(res); });
});

// ── Schema bootstrap (idempotent) ────────────────────────────────
async function _bootstrap() {
  const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
  const stmts = schema.split(';').map(s => s.trim()).filter(Boolean);
  for (const stmt of stmts) {
    await db.query(stmt);
  }
  console.log('Database schema applied.');
}

// ── Helper: get user from header ──────────────────────────────────
function _getUser(req) {
  return (req.headers['x-lunch-user'] || '').trim() || null;
}

// ── Config ────────────────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_MAPS_API_KEY is not set' });
  }
  try {
    const [rows] = await db.query('SELECT setting_value FROM settings WHERE setting_key = ?', ['origin_address']);
    const originAddress = rows[0]?.setting_value || '';
    res.json({ mapsApiKey: apiKey, originAddress });
  } catch (err) {
    res.json({ mapsApiKey: apiKey, originAddress: '' });
  }
});

// ── Settings ──────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    rows.forEach(r => { settings[r.setting_key] = r.setting_value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', async (req, res) => {
  const user = _getUser(req);
  try {
    const entries = Object.entries(req.body);
    for (const [key, value] of entries) {
      await db.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
        [key, value]
      );
    }
    if (user) {
      await db.query('UPDATE users SET last_edit_at = NOW() WHERE name = ?', [user]);
    }
    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Users ─────────────────────────────────────────────────────────
app.get('/api/users', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT name, color, is_admin, created_at FROM users ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', async (req, res) => {
  const { name, color } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  const cleanName  = name.trim().replace(/\b\w/g, c => c.toUpperCase());
  const cleanColor = (color || '#ef4444').trim();
  try {
    await db.query(
      'INSERT INTO users (name, color, last_used_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE color = VALUES(color), last_used_at = NOW()',
      [cleanName, cleanColor]
    );
    res.json({ name: cleanName, color: cleanColor });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/users/:name', async (req, res) => {
  const originalName = req.params.name;
  const { color } = req.body;
  try {
    if (color) {
      await db.query('UPDATE users SET color = ?, updated_at = NOW() WHERE name = ?', [color, originalName]);
    }
    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tags ──────────────────────────────────────────────────────────
app.get('/api/tags', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id, label, icon, created_by, created_at FROM tags ORDER BY label');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tags', async (req, res) => {
  const user = _getUser(req);
  const { label, icon } = req.body;
  if (!label || !label.trim()) return res.status(400).json({ error: 'label required' });
  try {
    const [result] = await db.query(
      'INSERT INTO tags (label, icon, created_by) VALUES (?, ?, ?)',
      [label.trim(), (icon || '').trim(), user]
    );
    res.json({ id: result.insertId, label: label.trim(), icon: (icon || '').trim(), created_by: user });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Tag already exists' });
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/tags/:id', async (req, res) => {
  const { label, icon } = req.body;
  try {
    const sets   = [];
    const params = [];
    if (label !== undefined) { sets.push('label = ?'); params.push(label.trim()); }
    if (icon  !== undefined) { sets.push('icon = ?');   params.push(icon.trim()); }
    if (!sets.length) return res.json({ ok: true });
    params.push(req.params.id);
    await db.query(`UPDATE tags SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/tags/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM tags WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Restaurants ───────────────────────────────────────────────────

// Helper: fetch restaurants with tags, favorites, visit info
async function _fetchRestaurants(deleted = false) {
  const where = deleted ? 'WHERE r.deleted_at IS NOT NULL' : 'WHERE r.deleted_at IS NULL';

  const [restaurants] = await db.query(`
    SELECT r.*, COUNT(DISTINCT v.id) AS total_visits,
           MAX(v.visit_date)         AS last_visited,
           (SELECT v2.visit_date FROM visits v2
            WHERE v2.restaurant_id = r.id AND v2.visit_date = CURDATE()
            LIMIT 1) AS visited_today
    FROM restaurants r
    LEFT JOIN visits v ON v.restaurant_id = r.id
    ${where}
    GROUP BY r.id
    ORDER BY r.name
  `);

  const ids = restaurants.map(r => r.id);
  if (!ids.length) return { restaurants: [], tags: {}, favorites: {} };

  const [tagRows] = await db.query(`
    SELECT rt.restaurant_id, t.id, t.label, t.icon
    FROM restaurant_tags rt
    JOIN tags t ON t.id = rt.tag_id
    WHERE rt.restaurant_id IN (?)
  `, [ids]);

  const [favRows] = await db.query(`
    SELECT f.restaurant_id, f.user_name, u.color
    FROM favorites f
    JOIN users u ON u.name = f.user_name
    WHERE f.restaurant_id IN (?)
  `, [ids]);

  const tagsMap = {};
  const favsMap = {};
  tagRows.forEach(r => {
    if (!tagsMap[r.restaurant_id]) tagsMap[r.restaurant_id] = [];
    tagsMap[r.restaurant_id].push({ id: r.id, label: r.label, icon: r.icon });
  });
  favRows.forEach(r => {
    if (!favsMap[r.restaurant_id]) favsMap[r.restaurant_id] = [];
    favsMap[r.restaurant_id].push({ name: r.user_name, color: r.color });
  });

  restaurants.forEach(r => {
    r.tags       = tagsMap[r.id] || [];
    r.favorites  = favsMap[r.id] || [];
  });

  return { restaurants };
}

app.get('/api/restaurants', async (req, res) => {
  try {
    const data = await _fetchRestaurants(false);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/restaurants/deleted', async (req, res) => {
  try {
    const data = await _fetchRestaurants(true);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants', async (req, res) => {
  const user = _getUser(req);
  const { name, place_id, address, lat, lng, distance_minutes, wait_time, sunday_hours, price_tier, notes, tag_ids, last_visit_date } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });
  try {
    const [result] = await db.query(
      `INSERT INTO restaurants
        (name, place_id, address, lat, lng, distance_minutes, wait_time, sunday_hours, price_tier, notes, created_by, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), place_id || null, address || null, lat || null, lng || null,
       distance_minutes ?? null, wait_time || null, sunday_hours || null,
       price_tier ?? null, notes || null, user, user]
    );
    const id = result.insertId;

    if (Array.isArray(tag_ids) && tag_ids.length) {
      const vals = tag_ids.map(tid => [id, tid]);
      await db.query('INSERT INTO restaurant_tags (restaurant_id, tag_id) VALUES ?', [vals]);
    }

    if (last_visit_date) {
      await db.query(
        'INSERT IGNORE INTO visits (restaurant_id, visit_date, created_by) VALUES (?, ?, ?)',
        [id, last_visit_date, user]
      );
    }

    if (user) {
      await db.query('UPDATE users SET last_used_at = NOW() WHERE name = ?', [user]);
    }

    res.json({ id });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/restaurants/:id', async (req, res) => {
  const user = _getUser(req);
  const { name, place_id, address, lat, lng, distance_minutes, wait_time, sunday_hours, price_tier, notes, tag_ids } = req.body;
  try {
    await db.query(
      `UPDATE restaurants SET
        name = ?, place_id = ?, address = ?, lat = ?, lng = ?,
        distance_minutes = ?, wait_time = ?, sunday_hours = ?,
        price_tier = ?, notes = ?, updated_by = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [name, place_id || null, address || null, lat || null, lng || null,
       distance_minutes ?? null, wait_time || null, sunday_hours || null,
       price_tier ?? null, notes || null, user, req.params.id]
    );

    if (Array.isArray(tag_ids)) {
      await db.query('DELETE FROM restaurant_tags WHERE restaurant_id = ?', [req.params.id]);
      if (tag_ids.length) {
        const vals = tag_ids.map(tid => [req.params.id, tid]);
        await db.query('INSERT INTO restaurant_tags (restaurant_id, tag_id) VALUES ?', [vals]);
      }
    }

    if (user) {
      await db.query('UPDATE users SET last_edit_at = NOW() WHERE name = ?', [user]);
    }

    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/restaurants/:id', async (req, res) => {
  const user = _getUser(req);
  try {
    await db.query('UPDATE restaurants SET deleted_at = NOW(), updated_by = ? WHERE id = ? AND deleted_at IS NULL', [user, req.params.id]);
    if (user) {
      await db.query('UPDATE users SET last_edit_at = NOW() WHERE name = ?', [user]);
    }
    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restaurants/:id/restore', async (req, res) => {
  try {
    await db.query('UPDATE restaurants SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL', [req.params.id]);
    res.json({ ok: true });
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Visits ────────────────────────────────────────────────────────
app.post('/api/restaurants/:id/visit', async (req, res) => {
  const user = _getUser(req);
  try {
    const [existing] = await db.query(
      'SELECT id FROM visits WHERE restaurant_id = ? AND visit_date = CURDATE()',
      [req.params.id]
    );
    if (existing.length) {
      await db.query('DELETE FROM visits WHERE restaurant_id = ? AND visit_date = CURDATE()', [req.params.id]);
      res.json({ visited: false });
    } else {
      await db.query(
        'INSERT IGNORE INTO visits (restaurant_id, visit_date, created_by) VALUES (?, CURDATE(), ?)',
        [req.params.id, user]
      );
      res.json({ visited: true });
    }
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Favorites ─────────────────────────────────────────────────────
app.post('/api/restaurants/:id/favorite', async (req, res) => {
  const user = _getUser(req);
  if (!user) return res.status(400).json({ error: 'user required' });
  try {
    const [existing] = await db.query(
      'SELECT 1 FROM favorites WHERE restaurant_id = ? AND user_name = ?',
      [req.params.id, user]
    );
    if (existing.length) {
      await db.query('DELETE FROM favorites WHERE restaurant_id = ? AND user_name = ?', [req.params.id, user]);
      res.json({ favorited: false });
    } else {
      await db.query('INSERT INTO favorites (restaurant_id, user_name) VALUES (?, ?)', [req.params.id, user]);
      res.json({ favorited: true });
    }
    _broadcast({ type: 'data-changed' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stats ─────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [leaderboard] = await db.query(`
      SELECT r.id, r.name, COUNT(v.id) AS visits
      FROM restaurants r
      JOIN visits v ON v.restaurant_id = r.id
      WHERE r.deleted_at IS NULL
      GROUP BY r.id
      ORDER BY visits DESC
      LIMIT 10
    `);

    const [unvisited] = await db.query(`
      SELECT r.id, r.name, r.created_at
      FROM restaurants r
      LEFT JOIN visits v ON v.restaurant_id = r.id
      WHERE r.deleted_at IS NULL AND v.id IS NULL
      ORDER BY r.created_at DESC
      LIMIT 5
    `);

    const [recentVisits] = await db.query(`
      SELECT v.visit_date, r.name AS restaurant_name, v.created_by
      FROM visits v
      JOIN restaurants r ON r.id = v.restaurant_id
      WHERE r.deleted_at IS NULL
      ORDER BY v.visit_date DESC, v.created_at DESC
      LIMIT 10
    `);

    res.json({ leaderboard, unvisited, recentVisits });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────────
async function start() {
  try {
    await _bootstrap();
    app.listen(PORT, () => {
      console.log(`Lunch app running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
