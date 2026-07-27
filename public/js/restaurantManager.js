import * as mapManager from './mapManager.js';
import { getMapLabelClass } from './mapLabel.js';

let _markers  = [];
let _labels   = [];

export function init() {}

export function clearAll() {
  _markers.forEach(m => m.setMap(null));
  _labels.forEach(l => { try { l.setMap(null); } catch (_) {} });
  _markers = [];
  _labels  = [];
}

export function renderMarkers(restaurants, tags, users) {
  clearAll();
  const MapLabel = getMapLabelClass();
  const userColorMap = {};
  users.forEach(u => { userColorMap[u.name] = u.color; });

  restaurants.forEach(r => {
    const lat = Number(r.lat);
    const lng = Number(r.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const pos = { lat, lng };

    // Marker icon: first tag's FA icon on primary-colored pin
    const firstTag = r.tags?.[0];
    const iconDef = firstTag?.icon ? _parseIcon(firstTag.icon) : null;
    const marker = new google.maps.Marker({
      position: pos,
      map: mapManager.getMap(),
      icon: mapManager.makeMarkerIcon('#F38DC8', iconDef),
      title: r.name,
    });
    _markers.push(marker);

    // Name label above pin
    const label = new MapLabel([r.name], pos, '#FFFFFF');
    label.setMap(mapManager.getMap());
    _labels.push(label);
  });
}

export function fitMapToRestaurants(restaurants) {
  const valid = restaurants.filter(r => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)));
  mapManager.fitBoundsToLocations(valid);
}

export function getLabels() { return _labels; }

function _parseIcon(iconStr) {
  if (!iconStr) return null;
  // Simple FA icon name mapping - for CDN kit, we render the FA glyph path
  // For the marker SVG, we need the path data. We'll use a simple lookup.
  const ICON_PATHS = {
    'fa-utensils':       { width: 512, path: 'M63.9 14.4C63.1 6.2 56.2 0 48 0s-15.1 6.2-16 14.3L17.9 149.7c-1.3 6-1.9 12.1-1.9 18.2 0 45.9 35.1 83.6 80 87.7L96 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-224.4c44.9-4.1 80-41.8 80-87.7 0-6.1-.6-12.2-1.9-18.2L223.9 14.3C223.1 6.2 216.2 0 208 0s-15.1 6.2-15.9 14.4L178.5 149.9c-.6 5.7-5.4 10.1-11.1 10.1-5.8 0-10.6-4.4-11.2-10.2L143.9 14.6C143.2 6.3 136.3 0 128 0s-15.2 6.3-15.9 14.6L99.8 149.8c-.5 5.8-5.4 10.2-11.2 10.2-5.8 0-10.6-4.4-11.1-10.1L63.9 14.4zM448 0C432 0 320 32 320 176l0 112c0 35.3 28.7 64 64 64l32 0 0 128c0 17.7 14.3 32 32 32s32-14.3 32-32l0-448c0-17.7-14.3-32-32-32z' },
    'fa-map-pin':        { width: 320, path: 'M192 284.4C256.1 269.9 304 212.5 304 144 304 64.5 239.5 0 160 0S16 64.5 16 144c0 68.5 47.9 125.9 112 140.4L128 480c0 17.7 14.3 32 32 32s32-14.3 32-32l0-195.6zM168 96c-30.9 0-56 25.1-56 56 0 13.3-10.7 24-24 24s-24-10.7-24-24c0-57.4 46.6-104 104-104 13.3 0 24 10.7 24 24s-10.7 24-24 24z' },
    'fa-star':           { width: 576, path: 'M309.5-18.9c-4.1-8-12.4-13.1-21.4-13.1s-17.3 5.1-21.4 13.1L193.1 125.3 33.2 150.7c-8.9 1.4-16.3 7.7-19.1 16.3s-.5 18 5.8 24.4l114.4 114.5-25.2 159.9c-1.4 8.9 2.3 17.9 9.6 23.2s16.9 6.1 25 2L288.1 417.6 432.4 491c8 4.1 17.7 3.3 25-2s11-14.2 9.6-23.2L441.7 305.9 556.1 191.4c6.4-6.4 8.6-15.8 5.8-24.4s-10.1-14.9-19.1-16.3L383 125.3 309.5-18.9z' },
    'fa-burger':         { width: 512, path: 'M123.6 78.8C138.1 47.7 172.5 28.3 208.2 30l1.8 0c26.5 0 51.4 12.2 67.4 33.2C301.6 39.5 338 24 376 24c17.7 0 32 14.3 32 32s-14.3 32-32 32c-26.5 0-51.4 12.2-67.4 33.2-11.1 14.3-26.5 23.6-43.2 27.3L272 152c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-3.7c-16.7 3.7-32.1 13-43.2 27.3C99.4 194.6 62.6 209.6 24 209.6 10.7 209.6-3.6 195.3-3.6 182s14.3-27.6 27.6-27.6c26.5 0 51.4-12.2 67.4-33.2 11.1-14.3 26.5-23.6 43.2-27.3L132 92 123.6 78.8zM75.6 256c-13.3 0-24 10.7-24 24l0 16c0 44.2 35.8 80 80 80l248 0c44.2 0 80-35.8 80-80l0-16c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 16c0 17.7-14.3 32-32 32L128 352c-17.7 0-32-14.3-32-32l0-16c0-13.3-10.7-24-24-24zM480 256c-13.3 0-24 10.7-24 24l0 16 0 0 0 16c0 44.2-35.8 80-80 80l-8 0 0-56c17.7-14.3 32-35.3 32-56 0-35.3-26.7-64-64-64s-64 28.7-64 64c0 20.7 14.3 41.7 32 56l0 56-8 0c-44.2 0-80-35.8-80-80l0-16c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 16c0 44.2 35.8 80 80 80l248 0c44.2 0 80-35.8 80-80l0-16c0-13.3-10.7-24-24-24z' },
    'fa-store':          { width: 576, path: 'M32 0C14.3 0 0 14.3 0 32V64c0 17.7 14.3 32 32 32H48c17.7 0 32-14.3 32-32V32C80 14.3 65.7 0 48 0H32zM272 0c-17.7 0-32 14.3-32 32V64c0 17.7 14.3 32 32 32H288c17.7 0 32-14.3 32-32V32C320 14.3 305.7 0 288 0H272zM528 0c-17.7 0-32 14.3-32 32V64c0 17.7 14.3 32 32 32H544c17.7 0 32-14.3 32-32V32C576 14.3 561.7 0 544 0H528zM0 224c0-17.7 14.3-32 32-32H544c17.7 0 32 14.3 32 32V480c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V224zM96 352c-17.7 0-32 14.3-32 32v32c0 17.7 14.3 32 32 32H96V352zm160 0V448H96c-17.7 0-32-14.3-32-32V416H128c17.7 0 32-14.3 32-32V352H256zm160 0v64c0 17.7-14.3 32-32 32H352V352H416zm96 0v64H416V352H512z' },
    'fa-mug-hot':        { width: 512, path: 'M176 0H48C21.5 0 0 21.5 0 48V256H368V48c0-26.5-21.5-48-48-48H240v80c0 8.8 7.2 16 16 16h80V256H0V48C0 21.5 21.5 0 48 0H176zM464 288H352v96c0 35.3-28.7 64-64 64H224c-35.3 0-64-28.7-64-64V288H48c-26.5 0-48 21.5-48 48V464c0 26.5 21.5 48 48 48H416c26.5 0 48-21.5 48-48V336c0-26.5-21.5-48-48-48zM496 32a32 32 0 1 0 -64 0 32 32 0 1 0 64 0z' },
  };
  // Strip leading "fa-" if present, then try to find the path
  const key = iconStr.startsWith('fa-') ? iconStr : `fa-${iconStr}`;
  return ICON_PATHS[key] || null;
}
