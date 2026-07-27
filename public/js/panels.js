import * as api from './api.js';
import * as state from './state.js';
import * as events from './events.js';
import * as mapManager from './mapManager.js';
import * as restaurantManager from './restaurantManager.js';
import * as configManager from './configManager.js';
import { WAIT_TIME_OPTIONS, DISTANCE_BUCKETS, SORT_OPTIONS, VISITED_FILTER_OPTIONS, formatDate, todayStr, daysAgo, waitTimeLabel, waitTimeMinutes } from './utils.js';

let _currentView = 'restaurants';
let _mapMode     = 'table';
let _allTags     = [];
let _allUsers    = [];

const _filters = {
  search:   '',
  tags:     [],
  waitTime: 'any',
  distance: 'any',
  stars:    'any',
  visited:  'any',
  sort:     'name',
};

let _editorRestaurant = null;
let _editorAutocomplete = null;

export function init(tags, users) {
  _allTags  = tags;
  _allUsers = users;
  _wireNav();
  _wireViewToggle();
  _wireFilterBar();
  _wireEditorModal();
  renderView();
}

export function updateTags(tags)  { _allTags  = tags; }
export function updateUsers(users) { _allUsers = users; }

// ── Navigation ────────────────────────────────────────────────────
function _wireNav() {
  document.getElementById('menu-btn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('dropdown-menu').classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    document.getElementById('dropdown-menu').classList.add('hidden');
  });
  document.getElementById('dropdown-menu').addEventListener('click', e => e.stopPropagation());

  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentView = btn.dataset.view;
      document.getElementById('dropdown-menu').classList.add('hidden');
      document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.view === _currentView));
      renderView();
    });
  });
}

// ── View switching ────────────────────────────────────────────────
export function renderView() {
  document.querySelectorAll('.view-panel').forEach(v => v.classList.add('hidden'));
  const current = document.getElementById(`view-${_currentView}`);
  if (current) current.classList.remove('hidden');

  if (_currentView === 'restaurants') {
    _renderRestaurantView();
  } else if (_currentView === 'stats') {
    _renderStatsView();
  } else if (_currentView === 'config') {
    configManager.show();
  }
}

// ── Restaurant view ───────────────────────────────────────────────
function _renderRestaurantView() {
  const filtered = _getFilteredRestaurants();
  _renderTable(filtered);
  restaurantManager.renderMarkers(filtered, _allTags, _allUsers);
  if (_mapMode === 'map') {
    restaurantManager.fitMapToRestaurants(filtered);
  }
}

function _getFilteredRestaurants() {
  let list = state.getRestaurants().filter(r => !r.deleted_at);

  // Search
  if (_filters.search) {
    const q = _filters.search.toLowerCase();
    list = list.filter(r => r.name.toLowerCase().includes(q) || (r.address || '').toLowerCase().includes(q));
  }

  // Tags
  if (_filters.tags.length) {
    list = list.filter(r => _filters.tags.some(tid => r.tags?.some(t => t.id === tid)));
  }

  // Wait time
  if (_filters.waitTime !== 'any') {
    list = list.filter(r => r.wait_time === _filters.waitTime);
  }

  // Distance
  if (_filters.distance !== 'any') {
    list = list.filter(r => {
      const m = r.distance_minutes;
      if (m == null) return false;
      if (_filters.distance === 'close')  return m < 5;
      if (_filters.distance === 'medium') return m < 15;
      if (_filters.distance === 'long')   return m < 25;
      return true;
    });
  }

  // Stars
  if (_filters.stars !== 'any') {
    if (_filters.stars === 'mine') {
      const name = localStorage.getItem('lunch-user-name');
      list = list.filter(r => r.favorites?.some(f => f.name === name));
    } else if (_filters.stars === 'unstarred') {
      list = list.filter(r => !r.favorites?.length);
    } else {
      const minCount = parseInt(_filters.stars, 10);
      list = list.filter(r => (r.favorites?.length || 0) >= minCount);
    }
  }

  // Visited
  if (_filters.visited === 'never') {
    list = list.filter(r => r.total_visits === 0);
  } else if (_filters.visited === 'old') {
    list = list.filter(r => !r.last_visited || r.last_visited < daysAgo(90));
  }

  // Sort
  const sorted = [...list];
  if (_filters.sort === 'shuffle') {
    for (let i = sorted.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
    }
  } else if (_filters.sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (_filters.sort === 'distance') {
    sorted.sort((a, b) => (a.distance_minutes ?? 9999) - (b.distance_minutes ?? 9999));
  } else if (_filters.sort === 'wait_time') {
    sorted.sort((a, b) => waitTimeMinutes(a.wait_time) - waitTimeMinutes(b.wait_time));
  } else if (_filters.sort === 'stars') {
    sorted.sort((a, b) => (b.favorites?.length || 0) - (a.favorites?.length || 0));
  } else if (_filters.sort === 'last_visited') {
    sorted.sort((a, b) => (a.last_visited || '0000') < (b.last_visited || '0000') ? 1 : -1);
  } else if (_filters.sort === 'total_visits') {
    sorted.sort((a, b) => (b.total_visits || 0) - (a.total_visits || 0));
  }

  return sorted;
}

// ── Table rendering ───────────────────────────────────────────────
function _renderTable(restaurants) {
  const tbody = document.getElementById('restaurant-tbody');
  const userColorMap = {};
  _allUsers.forEach(u => { userColorMap[u.name] = u.color; });
  const currentUser = localStorage.getItem('lunch-user-name');

  if (!restaurants.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">No restaurants match your filters.</td></tr>';
    return;
  }

  tbody.innerHTML = restaurants.map(r => {
    const isVisited = !!r.visited_today;
    const isFav     = r.favorites?.some(f => f.name === currentUser);
    const starsHtml = (r.favorites || []).map(f =>
      `<i class="fa-solid fa-star" style="color:${f.color}" title="${f.name}"></i>`
    ).join(' ');

    return `<tr data-id="${r.id}">
      <td class="col-name">
        <button class="btn-edit" data-id="${r.id}" title="Edit"><i class="fa-solid fa-pencil"></i></button>
        ${_esc(r.name)}
      </td>
      <td class="col-distance">${r.distance_minutes != null ? r.distance_minutes + ' min' : '—'}</td>
      <td class="col-last-visited">${formatDate(r.last_visited)}</td>
      <td class="col-total-visits">${r.total_visits || 0}</td>
      <td class="col-stars">${starsHtml}</td>
      <td class="col-actions">
        <button class="btn-visit ${isVisited ? 'visited' : ''}" data-id="${r.id}" title="${isVisited ? 'Remove visit' : 'Mark visited'}">
          <i class="fa-solid fa-check"></i>
        </button>
        <button class="btn-fav ${isFav ? 'favorited' : ''}" data-id="${r.id}" title="${isFav ? 'Remove favorite' : 'Add favorite'}">
          <i class="fa-solid fa-star" style="${isFav ? '' : 'opacity:0.3'}"></i>
        </button>
        <button class="btn-delete" data-id="${r.id}" title="Delete"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>`;
  }).join('');

  // Wire table actions
  tbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditor(btn.dataset.id));
  });
  tbody.querySelectorAll('.btn-visit').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.toggleVisit(btn.dataset.id);
      await _reloadData();
    });
  });
  tbody.querySelectorAll('.btn-fav').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.toggleFavorite(btn.dataset.id);
      await _reloadData();
    });
  });
  tbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const r = state.getRestaurant(parseInt(btn.dataset.id));
      if (r && confirm(`Delete "${r.name}"?`)) {
        await api.deleteRestaurant(btn.dataset.id);
        await _reloadData();
      }
    });
  });
}

// ── Filter bar wiring ─────────────────────────────────────────────
function _wireFilterBar() {
  // Search
  const searchInput = document.getElementById('filter-search');
  let searchTimeout;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      _filters.search = searchInput.value.trim();
      _renderRestaurantView();
    }, 200);
  });

  // Tags filter — populated by _rebuildTagsFilter() below
  _rebuildTagsFilter();

  // Wait time
  const waitSelect = document.getElementById('filter-wait');
  waitSelect.innerHTML = '<option value="any">Any wait</option>' +
    WAIT_TIME_OPTIONS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  waitSelect.addEventListener('change', () => { _filters.waitTime = waitSelect.value; _renderRestaurantView(); });

  // Distance
  const distSelect = document.getElementById('filter-distance');
  distSelect.innerHTML = DISTANCE_BUCKETS.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  distSelect.addEventListener('change', () => { _filters.distance = distSelect.value; _renderRestaurantView(); });

  // Stars
  const starsSelect = document.getElementById('filter-stars');
  _rebuildStarsFilter();
  starsSelect.addEventListener('change', () => { _filters.stars = starsSelect.value; _renderRestaurantView(); });

  // Visited
  const visSelect = document.getElementById('filter-visited');
  visSelect.innerHTML = '<option value="any">Any status</option>' +
    VISITED_FILTER_OPTIONS.slice(1).map(o => `<option value="${o.value}">${o.label}</option>`).join('');
  visSelect.addEventListener('change', () => { _filters.visited = visSelect.value; _renderRestaurantView(); });

  // Sort
  const sortSelect = document.getElementById('filter-sort');
  sortSelect.innerHTML = SORT_OPTIONS.map(o => `<option value="${o.value}">Sort: ${o.label}</option>`).join('');
  sortSelect.value = 'name';
  sortSelect.addEventListener('change', () => { _filters.sort = sortSelect.value; _renderRestaurantView(); });

  // Add button
  document.getElementById('btn-add-restaurant').addEventListener('click', () => openEditor());
}

export function rebuildFilters(tags, users) {
  _allTags  = tags;
  _allUsers = users;
  _rebuildTagsFilter();
  _rebuildStarsFilter();
}

function _rebuildTagsFilter() {
  const container = document.getElementById('filter-tags-chips');
  if (!container) return;
  container.innerHTML = _allTags.map(t => {
    const iconHtml = t.icon ? `<i class="fa-solid ${_esc(t.icon)}"></i> ` : '';
    return `<label class="tag-chip"><input type="checkbox" value="${t.id}"> ${iconHtml}${_esc(t.label)}</label>`;
  }).join('');
  container.querySelectorAll('input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', () => {
      _filters.tags = [...container.querySelectorAll('input:checked')].map(c => parseInt(c.value));
      _renderRestaurantView();
    });
  });
}

function _rebuildStarsFilter() {
  const sel = document.getElementById('filter-stars');
  if (!sel) return;
  let html = '<option value="any">Any stars</option>';
  for (let i = 1; i <= _allUsers.length; i++) {
    html += `<option value="${i}">${i}+ stars</option>`;
  }
  html += '<option value="mine">My favorites</option>';
  html += '<option value="unstarred">No stars</option>';
  sel.innerHTML = html;
}

// ── View toggle (Table / Map) ─────────────────────────────────────
function _wireViewToggle() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      _mapMode = tab.dataset.mode;
      document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.mode === _mapMode));
      document.getElementById('table-container').classList.toggle('hidden', _mapMode !== 'table');
      document.getElementById('map-container').classList.toggle('hidden', _mapMode !== 'map');
      const filtered = _getFilteredRestaurants();
      restaurantManager.renderMarkers(filtered, _allTags, _allUsers);
      if (_mapMode === 'map') {
        restaurantManager.fitMapToRestaurants(filtered);
      }
    });
  });
}

// ── Editor modal ──────────────────────────────────────────────────
function _wireEditorModal() {
  document.getElementById('btn-close-editor').addEventListener('click', closeEditor);
  document.getElementById('btn-cancel-editor').addEventListener('click', closeEditor);
  document.getElementById('modal-backdrop').addEventListener('click', closeEditor);

  document.getElementById('btn-save-editor').addEventListener('click', _handleEditorSave);
}

export function openEditor(restaurantId) {
  _editorRestaurant = restaurantId ? state.getRestaurant(parseInt(restaurantId)) : null;
  const r = _editorRestaurant;

  document.getElementById('editor-title').textContent = r ? 'Edit Restaurant' : 'Add Restaurant';
  document.getElementById('ed-name').value = r?.name || '';
  document.getElementById('ed-address').value = r?.address || '';
  document.getElementById('ed-distance').value = r?.distance_minutes ?? '';
  document.getElementById('ed-wait').value = r?.wait_time || '';
  document.getElementById('ed-hours').value = r?.sunday_hours || '';
  document.getElementById('ed-price').value = r?.price_tier ?? '';
  document.getElementById('ed-notes').value = r?.notes || '';
  document.getElementById('ed-last-visit').value = r?.last_visited ? String(r.last_visited).slice(0, 10) : '';

  // Tags
  const tagContainer = document.getElementById('ed-tags');
  tagContainer.innerHTML = _allTags.map(t => {
    const checked = r?.tags?.some(rt => rt.id === t.id) ? 'checked' : '';
    const iconHtml = t.icon ? `<i class="fa-solid ${_esc(t.icon)}"></i> ` : '';
    return `<label class="tag-chip"><input type="checkbox" value="${t.id}" ${checked}> ${iconHtml}${_esc(t.label)}</label>`;
  }).join('');

  // Setup Places autocomplete
  if (window.google) {
    const nameInput = document.getElementById('ed-name');
    if (_editorAutocomplete) google.maps.event.clearInstanceListeners(_editorAutocomplete);
    _editorAutocomplete = mapManager.createAutocomplete(nameInput, {
      fields: ['geometry', 'name', 'formatted_address', 'place_id', 'opening_hours', 'price_level'],
    });
    _editorAutocomplete.addListener('place_changed', async () => {
      const place = _editorAutocomplete.getPlace();
      if (!place.geometry) return;
      document.getElementById('ed-name').value = place.name || '';
      document.getElementById('ed-address').value = place.formatted_address || '';

      // Auto-fill Sunday hours
      if (place.opening_hours?.weekday_text) {
        const sundayText = place.opening_hours.weekday_text[6] || '';
        const hours = sundayText.replace(/^Sunday:\s*/i, '');
        if (hours && hours.toLowerCase() !== 'closed') {
          document.getElementById('ed-hours').value = hours;
        }
      }

      // Auto-fill price tier
      if (place.price_level != null) {
        document.getElementById('ed-price').value = place.price_level;
      }

      // Calculate drive time
      await _calculateDriveTime(place);
    });
  }

  document.getElementById('modal-backdrop').classList.remove('hidden');
  document.getElementById('editor-modal').classList.remove('hidden');
}

export function closeEditor() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('editor-modal').classList.add('hidden');
  _editorRestaurant = null;
}

async function _calculateDriveTime(place) {
  const originStr = state.getSettings().origin_address;
  if (!originStr || !place.geometry) return;

  try {
    const result = await mapManager.getDirections(originStr, place.geometry.location);
    const route = result.routes[0];
    if (route?.legs[0]?.duration) {
      const mins = Math.round(route.legs[0].duration.value / 60);
      document.getElementById('ed-distance').value = mins;
    }
  } catch (err) {
    console.warn('Drive time calculation failed:', err.message);
  }
}

async function _handleEditorSave() {
  const name = document.getElementById('ed-name').value.trim();
  if (!name) { alert('Restaurant name is required.'); return; }

  const tagIds = [...document.querySelectorAll('#ed-tags input:checked')].map(cb => parseInt(cb.value));

  const data = {
    name,
    address:          document.getElementById('ed-address').value.trim() || null,
    distance_minutes: document.getElementById('ed-distance').value ? parseInt(document.getElementById('ed-distance').value) : null,
    wait_time:        document.getElementById('ed-wait').value || null,
    sunday_hours:     document.getElementById('ed-hours').value.trim() || null,
    price_tier:       document.getElementById('ed-price').value ? parseInt(document.getElementById('ed-price').value) : null,
    notes:            document.getElementById('ed-notes').value.trim() || null,
    tag_ids:          tagIds,
    last_visit_date:  document.getElementById('ed-last-visit').value || null,
  };

  // If editing, also send place_id/lat/lng from existing record
  if (_editorRestaurant) {
    data.place_id = _editorRestaurant.place_id;
    data.lat = _editorRestaurant.lat;
    data.lng = _editorRestaurant.lng;
    await api.updateRestaurant(_editorRestaurant.id, data);
  } else {
    // For new restaurants, get lat/lng from the autocomplete
    if (_editorAutocomplete) {
      const place = _editorAutocomplete.getPlace();
      if (place?.geometry) {
        data.place_id = place.place_id || null;
        data.lat = place.geometry.location.lat();
        data.lng = place.geometry.location.lng();
      }
    }
    await api.createRestaurant(data);
  }

  closeEditor();
  await _reloadData();
}

// ── Stats view ────────────────────────────────────────────────────
async function _renderStatsView() {
  const container = document.getElementById('stats-content');
  try {
    const stats = await api.getStats();
    let html = '<h2>Top Restaurants</h2>';
    if (stats.leaderboard.length) {
      const maxVisits = Math.max(...stats.leaderboard.map(r => r.visits));
      html += '<div class="leaderboard">';
      stats.leaderboard.forEach((r, i) => {
        const pct = maxVisits > 0 ? (r.visits / maxVisits * 100) : 0;
        html += `<div class="lb-row">
          <span class="lb-rank">${i + 1}</span>
          <span class="lb-name">${_esc(r.name)}</span>
          <div class="lb-bar-wrap"><div class="lb-bar" style="width:${pct}%"></div></div>
          <span class="lb-count">${r.visits}</span>
        </div>`;
      });
      html += '</div>';
    } else {
      html += '<p class="empty-state">No visits logged yet.</p>';
    }

    html += '<h2>New &amp; Unvisited</h2>';
    if (stats.unvisited.length) {
      html += '<ul class="simple-list">' + stats.unvisited.map(r =>
        `<li>${_esc(r.name)}</li>`
      ).join('') + '</ul>';
    } else {
      html += '<p class="empty-state">All restaurants have been visited!</p>';
    }

    html += '<h2>Recent Visits</h2>';
    if (stats.recentVisits.length) {
      html += '<table class="stats-table"><thead><tr><th>Date</th><th>Restaurant</th><th>Logged by</th></tr></thead><tbody>';
      stats.recentVisits.forEach(v => {
        html += `<tr><td>${formatDate(v.visit_date)}</td><td>${_esc(v.restaurant_name)}</td><td>${_esc(v.created_by || '—')}</td></tr>`;
      });
      html += '</tbody></table>';
    } else {
      html += '<p class="empty-state">No visits yet.</p>';
    }

    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `<p class="empty-state">Error loading stats: ${_esc(err.message)}</p>`;
  }
}

// ── Data reload ───────────────────────────────────────────────────
async function _reloadData() {
  try {
    const data = await api.getRestaurants();
    state.init(data);
    _renderRestaurantView();
    try { localStorage.setItem('lunch-data', JSON.stringify(state.getRestaurants())); } catch (_) {}
  } catch (err) {
    console.warn('Reload failed:', err.message);
  }
}

// ── Toast ─────────────────────────────────────────────────────────
export function showToast(msg, type = 'info', duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = `toast toast-${type}`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.className = 'toast hidden'; }, duration);
}

// ── SSE remote reload ─────────────────────────────────────────────
export function handleRemoteReload() {
  if (!document.getElementById('editor-modal').classList.contains('hidden')) {
    showToast('Updated by another device', 'info');
    return;
  }
  _reloadData();
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
