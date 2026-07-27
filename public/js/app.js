import * as api from './api.js';
import * as state from './state.js';
import * as events from './events.js';
import * as panels from './panels.js';
import * as configManager from './configManager.js';
import * as restaurantManager from './restaurantManager.js';
import * as mapManager from './mapManager.js';

let _sseSource = null;
let _pwaDeferredPrompt = null;
let _mapId = '';

// ── Boot ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const loadingEl = document.getElementById('loading');

  try {
    // 1. Check first-run user identification
    const userId = localStorage.getItem('lunch-user-name');
    if (!userId) {
      loadingEl.classList.add('hidden');
      await _showFirstRunModal();
      loadingEl.classList.remove('hidden');
    }

    // 2. Fetch config (includes Maps API key)
    const config = await api.getConfig();
    _mapId = config.mapId || '';

    // 3. Load Google Maps API
    await _loadMapsApi(config.mapsApiKey);

    // 4. Fetch all data
    const [restaurants, tags, users, settings] = await Promise.all([
      api.getRestaurants(),
      api.getTags(),
      api.getUsers(),
      api.getSettings(),
    ]);

    // 5. Init state
    state.init(restaurants);
    state.setTags(tags);
    state.setUsers(users);
    state.setSettings(settings);

    // 6. Init modules
    configManager.init(_onOriginChange);
    panels.init(tags, users);
    restaurantManager.init();

    // Init map with origin
    if (settings.origin_address) {
      mapManager.init(settings.origin_address, config.mapId);
    }

    // 6. Connect SSE
    _connectSSE();

    // 7. Register PWA
    _registerServiceWorker();
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _pwaDeferredPrompt = e;
      const banner = document.getElementById('install-banner');
      if (banner) banner.classList.remove('hidden');
    });

    // 8. Done
    loadingEl.classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    // Show install banner if already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      const banner = document.getElementById('install-banner');
      if (banner) banner.classList.add('hidden');
    }
  } catch (err) {
    console.error('Boot failed:', err);
    loadingEl.innerHTML = `
      <div class="error-box">
        <h1>Failed to load</h1>
        <p>${_esc(err.message)}</p>
        <button onclick="location.reload()">Retry</button>
      </div>`;
  }
});

// ── First-run user identification ─────────────────────────────────
function _showFirstRunModal() {
  return new Promise(resolve => {
    const backdrop = document.getElementById('modal-backdrop');
    const modal    = document.getElementById('first-run-modal');
    backdrop.classList.remove('hidden');
    modal.classList.remove('hidden');

    const nameInput  = document.getElementById('fr-name');
    const colorInput = document.getElementById('fr-color');
    const saveBtn    = document.getElementById('fr-save');

    // Randomize default color
    const palette = ['#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#8b5cf6','#ec4899'];
    colorInput.value = palette[Math.floor(Math.random() * palette.length)];

    saveBtn.addEventListener('click', async () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.focus(); return; }
      const color = colorInput.value;
      localStorage.setItem('lunch-user-name', name);
      localStorage.setItem('lunch-user-color', color);
      await api.identifyUser(name, color);
      backdrop.classList.add('hidden');
      modal.classList.add('hidden');
      resolve();
    });
  });
}

// ── Google Maps API ───────────────────────────────────────────────
function _loadMapsApi(key) {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) { resolve(); return; }
    if (!key) {
      console.warn('No Google Maps API key configured — map features will be degraded');
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places,marker&loading=async&callback=__mapsReady`;
    script.async = true;
    script.defer = true;
    window.__mapsReady = resolve;
    script.onerror = () => reject(new Error('Failed to load Google Maps API'));
    document.head.appendChild(script);
  });
}

// ── SSE ───────────────────────────────────────────────────────────
function _connectSSE() {
  if (_sseSource) _sseSource.close();
  const userId = localStorage.getItem('lunch-user-name') || '';
  _sseSource = new EventSource(`/api/events?user=${encodeURIComponent(userId)}`);

  _sseSource.addEventListener('config-change', () => {
    panels.handleRemoteReload();
  });

  _sseSource.addEventListener('error', () => {
    console.warn('SSE connection lost, reconnecting…');
  });
}

// ── Origin change callback ────────────────────────────────────────
function _onOriginChange(origin) {
  mapManager.init(origin, _mapId);
}

// ── PWA install ───────────────────────────────────────────────────
window._installApp = async () => {
  if (!_pwaDeferredPrompt) return;
  _pwaDeferredPrompt.prompt();
  const { outcome } = await _pwaDeferredPrompt.userChoice;
  if (outcome === 'accepted') {
    document.getElementById('install-banner')?.classList.add('hidden');
  }
  _pwaDeferredPrompt = null;
};

window._dismissInstall = () => {
  document.getElementById('install-banner')?.classList.add('hidden');
};

async function _registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/sw.js');
    } catch (err) {
      console.warn('SW registration failed:', err.message);
    }
  }
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
