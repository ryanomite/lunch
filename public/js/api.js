function _headers() {
  const name = localStorage.getItem('lunch-user-name');
  return name ? { 'X-Lunch-User': name } : {};
}

export async function getConfig() {
  const res = await fetch('/api/config');
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Config request failed (${res.status})`);
  }
  return res.json();
}

export async function getRestaurants() {
  const res = await fetch('/api/restaurants', { headers: _headers() });
  if (!res.ok) throw new Error(`Failed to load restaurants (${res.status})`);
  return res.json();
}

export async function getDeletedRestaurants() {
  const res = await fetch('/api/restaurants/deleted', { headers: _headers() });
  if (!res.ok) throw new Error(`Failed to load deleted restaurants (${res.status})`);
  return res.json();
}

export async function createRestaurant(data) {
  const res = await fetch('/api/restaurants', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ..._headers() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create restaurant (${res.status})`);
  return res.json();
}

export async function updateRestaurant(id, data) {
  const res = await fetch(`/api/restaurants/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ..._headers() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update restaurant (${res.status})`);
  return res.json();
}

export async function deleteRestaurant(id) {
  const res = await fetch(`/api/restaurants/${id}`, {
    method: 'DELETE',
    headers: _headers(),
  });
  if (!res.ok) throw new Error(`Failed to delete restaurant (${res.status})`);
  return res.json();
}

export async function restoreRestaurant(id) {
  const res = await fetch(`/api/restaurants/${id}/restore`, {
    method: 'POST',
    headers: _headers(),
  });
  if (!res.ok) throw new Error(`Failed to restore restaurant (${res.status})`);
  return res.json();
}

export async function toggleVisit(id) {
  const res = await fetch(`/api/restaurants/${id}/visit`, {
    method: 'POST',
    headers: _headers(),
  });
  if (!res.ok) throw new Error(`Failed to toggle visit (${res.status})`);
  return res.json();
}

export async function toggleFavorite(id) {
  const res = await fetch(`/api/restaurants/${id}/favorite`, {
    method: 'POST',
    headers: _headers(),
  });
  if (!res.ok) throw new Error(`Failed to toggle favorite (${res.status})`);
  return res.json();
}

export async function getTags() {
  const res = await fetch('/api/tags', { headers: _headers() });
  if (!res.ok) throw new Error(`Failed to load tags (${res.status})`);
  return res.json();
}

export async function createTag(data) {
  const res = await fetch('/api/tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ..._headers() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create tag (${res.status})`);
  return res.json();
}

export async function updateTag(id, data) {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ..._headers() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update tag (${res.status})`);
  return res.json();
}

export async function deleteTag(id) {
  const res = await fetch(`/api/tags/${id}`, {
    method: 'DELETE',
    headers: _headers(),
  });
  if (!res.ok) throw new Error(`Failed to delete tag (${res.status})`);
  return res.json();
}

export async function getUsers() {
  const res = await fetch('/api/users', { headers: _headers() });
  if (!res.ok) throw new Error(`Failed to load users (${res.status})`);
  return res.json();
}

export async function identifyUser(name, color) {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, color }),
  });
  if (!res.ok) throw new Error(`Failed to identify user (${res.status})`);
  return res.json();
}

export async function updateUserColor(name, color) {
  const res = await fetch(`/api/users/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ..._headers() },
    body: JSON.stringify({ color }),
  });
  if (!res.ok) throw new Error(`Failed to update user color (${res.status})`);
  return res.json();
}

export async function getSettings() {
  const res = await fetch('/api/settings', { headers: _headers() });
  if (!res.ok) throw new Error(`Failed to load settings (${res.status})`);
  return res.json();
}

export async function updateSettings(data) {
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ..._headers() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update settings (${res.status})`);
  return res.json();
}

export async function getStats() {
  const res = await fetch('/api/stats', { headers: _headers() });
  if (!res.ok) throw new Error(`Failed to load stats (${res.status})`);
  return res.json();
}
