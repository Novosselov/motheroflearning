// Campaign Map MVP (PNG map + draggable markers + polling sync)
//
// Data model uses image-space coords:
//   x = 0..imageWidth (left->right)
//   y = 0..imageHeight (top->bottom)
//
// Controls:
// - Drag marker: move
// - Shift+click map: add marker
// - Alt+click marker: delete
// - Shift+click marker: rename

const MAP_IMAGE = 'map.png';

const map = L.map('map', {
  crs: L.CRS.Simple,
  minZoom: -2,
  maxZoom: 2,
  zoomSnap: 0.25
});

map.attributionControl.remove();
// Ask once (stored in localStorage) so git history is readable.
function getWho() {
  let who = localStorage.getItem('who');
  if (!who) {
    who = (prompt('Your name (for change history)?') || 'anon').trim();
    if (!who) who = 'anon';
    localStorage.setItem('who', who);
  }
  return who;
}
const WHO = getWho();

// ---- Helpers ----
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function escAttr(s) {
  return esc(s).replace(/"/g, '&quot;');
}
function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  const ini = parts.slice(0, 2).map(p => p[0]?.toUpperCase()).join('');
  return ini || '?';
}
function typeColor(type) {
  if (type === 'location') return '#16a34a';
  if (type === 'event') return '#f97316';
  return '#2563eb';
}

// ---- UX marker (DivIcon) ----
function renderPinHTML(m) {
  const type = m.type || 'player';
  const color = m.color || typeColor(type);
  const name = m.name || m.id || '';
  const avatar = (m.avatar || '').trim();

  const inner = avatar
    ? `<img src="${escAttr(avatar)}" alt="">`
    : `<span class="mkr__initials">${esc(initials(name))}</span>`;

  return `
    <div class="mkr" data-type="${escAttr(type)}" style="--mkr-color:${escAttr(color)}">
      <div class="mkr__body">
        <div class="mkr__frame">${inner}</div>
      </div>
      <div class="mkr__tail"></div>
      <div class="mkr__label">${esc(name)}</div>
    </div>
  `;
}

function makePinIcon(m) {
  // iconSize includes label area; anchor is the tip of the pin
  return L.divIcon({
    className: 'mkr-wrap',
    html: renderPinHTML(m),
    iconSize: [48, 78],
    iconAnchor: [24, 60]
  });
}

// ---- API ----
async function apiGetData() {
  const r = await fetch('/data', { cache: 'no-store' });
  if (!r.ok) throw new Error('Failed to load /data');
  return await r.json();
}
async function apiCreateMarker(marker) {
  const r = await fetch('/markers', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User': WHO },
    body: JSON.stringify(marker)
  });
  if (!r.ok) throw new Error('Failed to create marker');
  return await r.json();
}
async function apiPatchMarker(id, patch) {
  const r = await fetch(`/markers/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'X-User': WHO },
    body: JSON.stringify(patch)
  });
  if (!r.ok) throw new Error('Failed to save marker');
  return await r.json();
}
async function apiDeleteMarker(id) {
  const r = await fetch(`/markers/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-User': WHO }
  });
  if (!r.ok) throw new Error('Failed to delete marker');
}

// ---- Marker sync state ----
const markerById = new Map(); // id -> Leaflet marker
const dataById = new Map();   // id -> last known marker data
const draggingIds = new Set();

function addOrUpdateMarker(m) {
  const id = String(m.id);
  const prev = dataById.get(id);

  if (!markerById.has(id)) {
    const lm = L.marker([m.y, m.x], {
      draggable: true,
      icon: makePinIcon(m)
    }).addTo(map);

    markerById.set(id, lm);
    dataById.set(id, m);

    lm.on('dragstart', () => draggingIds.add(id));

    lm.on('dragend', async () => {
      const ll = lm.getLatLng();
      // Keep diffs small and stable (also nicer git history)
      const x = Math.round(ll.lng * 100) / 100;
      const y = Math.round(ll.lat * 100) / 100;

      try {
        const updated = await apiPatchMarker(id, { x, y });
        dataById.set(id, updated);
        lm.setIcon(makePinIcon(updated));
      } catch (err) {
        alert('Save failed. Refresh and try again.');
      } finally {
        draggingIds.delete(id);
      }
    });

    lm.on('click', async (e) => {
      if (e.originalEvent?.altKey) {
        if (confirm(`Delete marker "${m.name || m.id}"?`)) {
          await apiDeleteMarker(id);
          // Remove locally (poll will also remove)
          map.removeLayer(lm);
          markerById.delete(id);
          dataById.delete(id);
        }
        return;
      }

      if (e.originalEvent?.shiftKey) {
        const nextName = prompt('New name:', (dataById.get(id)?.name || m.name || '').trim());
        if (nextName && nextName.trim()) {
          const updated = await apiPatchMarker(id, { name: nextName.trim() });
          dataById.set(id, updated);
          lm.setIcon(makePinIcon(updated));
        }
      }
    });

    return;
  }

  // Existing marker: update if not being dragged locally
  const lm = markerById.get(id);

  if (!draggingIds.has(id)) {
    lm.setLatLng([m.y, m.x]);
  }

  // If metadata changed, refresh icon
  if (!prev ||
      prev.name !== m.name ||
      prev.type !== m.type ||
      prev.color !== m.color ||
      prev.avatar !== m.avatar) {
    lm.setIcon(makePinIcon(m));
  }

  dataById.set(id, m);
}

function removeMissingMarkers(currentMarkers) {
  const keep = new Set(currentMarkers.map(m => String(m.id)));
  for (const [id, lm] of markerById.entries()) {
    if (!keep.has(id)) {
      map.removeLayer(lm);
      markerById.delete(id);
      dataById.delete(id);
      draggingIds.delete(id);
    }
  }
}

// ---- Load map image to get correct bounds automatically ----
const img = new Image();
img.onload = async () => {
  const w = img.naturalWidth || 3000;
  const h = img.naturalHeight || 2000;
  const bounds = [[0, 0], [h, w]];

  L.imageOverlay(MAP_IMAGE, bounds).addTo(map);
  map.fitBounds(bounds);

  // Initial load
  await refresh();

  // Poll for updates so all players see changes without refresh
  setInterval(refresh, 3000);

  // Add marker with Shift+click
  map.on('click', async (e) => {
    if (!e.originalEvent?.shiftKey) return;

    const name = (prompt('Marker name?') || '').trim();
    if (!name) return;

    const type = (prompt('Type: player/location/event', 'player') || 'player').trim().toLowerCase();
    const safeType = (type === 'location' || type === 'event') ? type : 'player';

    const created = await apiCreateMarker({
      name,
      type: safeType,
      x: Math.round(e.latlng.lng * 100) / 100,
      y: Math.round(e.latlng.lat * 100) / 100,
      color: typeColor(safeType),
      avatar: ''
    });

    addOrUpdateMarker(created);
  });
};
img.src = MAP_IMAGE;

async function refresh() {
  try {
    const data = await apiGetData();
    for (const m of (data.markers || [])) addOrUpdateMarker(m);
    removeMissingMarkers(data.markers || []);
  } catch (e) {
    // Avoid spamming alerts; network hiccups happen
    console.warn(e);
  }
}
