import * as api from './api.js';
import * as state from './state.js';
import * as events from './events.js';
import * as panels from './panels.js';

let _onOriginChange = null;

export function init(onOriginChange) {
  _onOriginChange = onOriginChange;
}

export async function show() {
  const container = document.getElementById('config-content');
  const settings  = state.getSettings();
  const users     = state.getUsers();
  const tags      = state.getTags();

  let html = '';

  // ── Origin address ────────────────────────────────────────────
  html += `<section class="config-section">
    <h3>Origin Address</h3>
    <p class="config-desc">All drive times are calculated from this address. Changing it does NOT update existing restaurants.</p>
    <div class="config-row">
      <input type="text" id="cfg-origin" class="input-wide" placeholder="Enter a full address…"
             value="${_esc(settings.origin_address || '')}">
      <button id="cfg-save-origin" class="btn btn-primary">Save</button>
    </div>
  </section>`;

  // ── Users ─────────────────────────────────────────────────────
  html += `<section class="config-section">
    <h3>Users</h3>
    <div id="cfg-users-list" class="config-list">
      ${users.map(u => `
        <div class="config-item" data-user-id="${u.id}">
          <input type="color" class="user-color-picker" data-name="${_esc(u.name)}" value="${u.color}" title="Change color for ${_esc(u.name)}">
          <span class="config-item-name">${_esc(u.name)}</span>
          <button class="btn-icon btn-remove-user" data-id="${u.id}" title="Remove user"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `).join('')}
    </div>
    <div class="config-row">
      <input type="text" id="cfg-new-user-name" placeholder="Name" maxlength="30">
      <input type="color" id="cfg-new-user-color" value="#0d9488">
      <button id="cfg-add-user" class="btn btn-secondary">Add</button>
    </div>
  </section>`;

  // ── Tags ──────────────────────────────────────────────────────
  html += `<section class="config-section">
    <h3>Tags</h3>
    <p class="config-desc">Optionally add a <a href="https://fontawesome.com/search?ic=free-collection" target="_blank" rel="noopener">Font Awesome</a> icon like <code>utensils</code> or <code>burger</code> (the <code>fa-</code> prefix is added automatically if omitted).</p>
    <div id="cfg-tags-list" class="config-list">
      ${tags.map(t => {
        const iconHtml = t.icon ? `<i class="fa-solid ${_esc(t.icon)}"></i>` : '';
        return `
        <div class="config-item" data-tag-id="${t.id}">
          ${iconHtml}
          <span class="config-item-name">${_esc(t.label)}</span>
          <button class="btn-icon btn-remove-tag" data-id="${t.id}" title="Remove tag"><i class="fa-solid fa-xmark"></i></button>
        </div>`;
      }).join('')}
    </div>
    <div class="config-row">
      <input type="text" id="cfg-new-tag-icon" placeholder="fa-icon" maxlength="40">
      <input type="text" id="cfg-new-tag-label" placeholder="Label" maxlength="30">
      <button id="cfg-add-tag" class="btn btn-secondary">Add</button>
    </div>
  </section>`;

  // ── Recently deleted ──────────────────────────────────────────
  const deleted = state.getRestaurants().filter(r => r.deleted_at);
  if (deleted.length) {
    html += `<section class="config-section">
      <h3>Recently Deleted</h3>
      <div id="cfg-deleted-list" class="config-list">
        ${deleted.map(r => `
          <div class="config-item" data-del-id="${r.id}">
            <span class="config-item-name">${_esc(r.name)}</span>
            <button class="btn btn-secondary btn-restore" data-id="${r.id}">Restore</button>
          </div>
        `).join('')}
      </div>
    </section>`;
  }

  container.innerHTML = html;
  _wireConfig(container);
}

function _wireConfig(container) {
  // Origin
  container.querySelector('#cfg-save-origin').addEventListener('click', async () => {
    const val = container.querySelector('#cfg-origin').value.trim();
    await api.updateSettings({ origin_address: val });
    state.setSettings({ ...state.getSettings(), origin_address: val });
    if (_onOriginChange) _onOriginChange(val);
    panels.showToast('Origin saved', 'success');
  });

  // Add user
  container.querySelector('#cfg-add-user').addEventListener('click', async () => {
    const name  = container.querySelector('#cfg-new-user-name').value.trim();
    const color = container.querySelector('#cfg-new-user-color').value;
    if (!name) { panels.showToast('Name required', 'error'); return; }
    await api.createUser({ name, color });
    const users = await api.getUsers();
    state.setUsers(users);
    panels.updateUsers(users);
    panels.rebuildFilters(state.getTags(), users);
    panels.showToast(`Added ${name}`, 'success');
    show();
  });

  // Remove user
  container.querySelectorAll('.btn-remove-user').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (!confirm('Remove this user?')) return;
      await api.deleteUser(id);
      const users = await api.getUsers();
      state.setUsers(users);
      panels.updateUsers(users);
      panels.rebuildFilters(state.getTags(), users);
      panels.showToast('User removed', 'success');
      show();
    });
  });

  // Edit user color
  container.querySelectorAll('.user-color-picker').forEach(picker => {
    picker.addEventListener('change', async () => {
      const name  = picker.dataset.name;
      const color = picker.value;
      await api.updateUserColor(name, color);
      const users = await api.getUsers();
      state.setUsers(users);
      panels.updateUsers(users);
      panels.rebuildFilters(state.getTags(), users);
      panels.showToast(`Updated ${name}'s color`, 'success');
    });
  });

  // Add tag
  container.querySelector('#cfg-add-tag').addEventListener('click', async () => {
    const icon  = container.querySelector('#cfg-new-tag-icon').value.trim();
    const label = container.querySelector('#cfg-new-tag-label').value.trim();
    if (!label) { panels.showToast('Label required', 'error'); return; }
    const cleanIcon = icon ? (icon.startsWith('fa-') ? icon : `fa-${icon}`) : '';
    await api.createTag({ icon: cleanIcon, label });
    const tags = await api.getTags();
    state.setTags(tags);
    panels.updateTags(tags);
    panels.rebuildFilters(tags, state.getUsers());
    panels.showToast(`Added tag "${label}"`, 'success');
    show();
  });

  // Remove tag
  container.querySelectorAll('.btn-remove-tag').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (!confirm('Remove this tag?')) return;
      await api.deleteTag(id);
      const tags = await api.getTags();
      state.setTags(tags);
      panels.updateTags(tags);
      panels.rebuildFilters(tags, state.getUsers());
      panels.showToast('Tag removed', 'success');
      show();
    });
  });

  // Restore deleted
  container.querySelectorAll('.btn-restore').forEach(btn => {
    btn.addEventListener('click', async () => {
      await api.restoreRestaurant(btn.dataset.id);
      await _reloadRestaurants();
      panels.showToast('Restaurant restored', 'success');
      show();
    });
  });
}

async function _reloadRestaurants() {
  const data = await api.getRestaurants();
  state.init(data);
}

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
