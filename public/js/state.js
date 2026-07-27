import * as events from './events.js';

let _restaurants = [];
let _tags        = [];
let _users       = [];
let _settings    = {};

export function init(data) {
  _restaurants = Array.isArray(data.restaurants) ? data.restaurants : [];
}

export function setTags(tags)  { _tags  = Array.isArray(tags)  ? tags  : []; }
export function setUsers(users) { _users = Array.isArray(users) ? users : []; }
export function setSettings(s) { _settings = s || {}; }

export function getRestaurants()  { return _restaurants; }
export function getTags()         { return _tags; }
export function getUsers()        { return _users; }
export function getSettings()     { return _settings; }

export function getRestaurant(id) {
  return _restaurants.find(r => r.id === id) || null;
}

export function getUser(name) {
  return _users.find(u => u.name === name) || null;
}

export function addRestaurant(r) {
  _restaurants.push(r);
  events.emit('restaurant:added', r);
  events.emit('state:changed');
}

export function updateRestaurant(id, updates) {
  const idx = _restaurants.findIndex(r => r.id === id);
  if (idx < 0) return null;
  _restaurants[idx] = { ..._restaurants[idx], ...updates };
  events.emit('restaurant:updated', _restaurants[idx]);
  events.emit('state:changed');
  return _restaurants[idx];
}

export function removeRestaurant(id) {
  _restaurants = _restaurants.filter(r => r.id !== id);
  events.emit('restaurant:deleted', id);
  events.emit('state:changed');
}
