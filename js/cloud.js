/**
 * Laa Fresh Stock Manager - Cloud Sync Engine (Office ↔ Home Realtime Sync)
 * Connects to Supabase Free Tier (PostgreSQL cloud database)
 * Keeps Stock, Operations Teams, Storage Rooms, and Vendor Bills in sync across all devices.
 */

const CLOUD_CFG_KEY = 'laaFreshCloudCfgV1';
let cloudSyncTimer = null;
let isSyncing = false;

function getCloudCfg() {
  try {
    return JSON.parse(localStorage.getItem(CLOUD_CFG_KEY)) || null;
  } catch (e) {
    return null;
  }
}

function setCloudCfg(cfg) {
  try {
    if (cfg) localStorage.setItem(CLOUD_CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CLOUD_CFG_KEY);
  } catch (e) {}
  renderCloudPill();
}

function isCloudActive() {
  let c = getCloudCfg();
  return !!(c && c.url && c.key && c.active);
}

/**
 * Push current local state to cloud database (debounced to avoid spamming).
 */
function cloudPush() {
  if (!isCloudActive() || isSyncing) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(async () => {
    let cfg = getCloudCfg();
    if (!cfg || !cfg.url || !cfg.key) return;
    try {
      updateSyncStatus('syncing', 'Syncing to cloud…');
      let endpoint = cfg.url.replace(/\/+$/, '') + '/rest/v1/laa_fresh_state';
      let payload = {
        id: 'global_state',
        data: state,
        updated_at: new Date().toISOString()
      };

      let res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'apikey': cfg.key,
          'Authorization': 'Bearer ' + cfg.key,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        updateSyncStatus('online', 'Cloud synced');
      } else {
        let errTxt = await res.text();
        console.warn('Cloud sync push warning:', errTxt);
        updateSyncStatus('err', 'Sync warning');
      }
    } catch (e) {
      console.warn('Cloud push network error:', e);
      updateSyncStatus('offline', 'Offline (local saved)');
    }
  }, 1200);
}

/**
 * Pull latest state from cloud database.
 */
async function cloudPull(silent = false) {
  let cfg = getCloudCfg();
  if (!cfg || !cfg.url || !cfg.key || !cfg.active) return false;

  try {
    if (!silent) updateSyncStatus('syncing', 'Pulling cloud data…');
    isSyncing = true;
    let endpoint = cfg.url.replace(/\/+$/, '') + '/rest/v1/laa_fresh_state?id=eq.global_state&select=*';

    let res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'apikey': cfg.key,
        'Authorization': 'Bearer ' + cfg.key
      }
    });

    if (res.ok) {
      let rows = await res.json();
      if (Array.isArray(rows) && rows.length > 0 && rows[0].data) {
        let remoteState = rows[0].data;
        // Verify state integrity
        if (remoteState && Array.isArray(remoteState.products)) {
          Object.assign(state, remoteState);
          try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
          renderAll();
          if (typeof renderStorageUI === 'function') renderStorageUI();
          if (typeof renderVendors === 'function') renderVendors(true);
          updateSyncStatus('online', 'Cloud live');
          if (!silent) toast('Synced latest data from cloud.', 'ok');
          return true;
        }
      }
      updateSyncStatus('online', 'Cloud ready (empty)');
      return false;
    } else {
      updateSyncStatus('err', 'Cloud pull failed');
      return false;
    }
  } catch (e) {
    console.warn('Cloud pull error:', e);
    updateSyncStatus('offline', 'Offline');
    return false;
  } finally {
    isSyncing = false;
  }
}

function updateSyncStatus(status, label) {
  let el = document.getElementById('cloudSyncPill');
  if (!el) return;
  let color = status === 'online' ? '#10b981' : status === 'syncing' ? '#3b82f6' : status === 'err' ? '#ef4444' : '#9ca3af';
  let dot = `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`;
  el.innerHTML = `${dot}<span>${esc(label)}</span>`;
  el.className = `chipbtn cloud-pill ${status}`;
}

function renderCloudPill() {
  let el = document.getElementById('cloudSyncPill');
  if (!el) return;
  if (isCloudActive()) {
    updateSyncStatus('online', 'Cloud synced');
  } else {
    updateSyncStatus('offline', 'Cloud Sync: Local Only');
  }
}

/**
 * Interactive Cloud Sync Setup Dialog
 */
window.openCloudSyncModal = function() {
  let cfg = getCloudCfg() || { url: '', key: '', active: false };

  showModal(`
    <div class="big">☁️</div>
    <h3>Office ↔ Home Cloud Sync Setup</h3>
    <p>Keep all inward stock, operations handovers, cold storage rooms, and vendor bills synchronized in real-time between your office and home.</p>

    <div class="hint green" style="margin-bottom:14px">
      <b>Free Database:</b> Uses <b>Supabase</b> (PostgreSQL cloud database — 100% free forever, no credit card required, 500MB storage).
    </div>

    <form id="cloudCfgForm" onsubmit="event.preventDefault(); submitCloudConfig();">
      <div class="formgrid" style="margin:12px 0">
        <div class="field full">
          <label>Supabase Project URL</label>
          <input id="cfgCloudUrl" placeholder="https://your-project-id.supabase.co" value="${esc(cfg.url || '')}" required>
        </div>
        <div class="field full">
          <label>Supabase Anon / Public API Key</label>
          <input id="cfgCloudKey" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value="${esc(cfg.key || '')}" required>
        </div>
      </div>

      <details style="margin:12px 0;background:#f7f8fc;padding:10px 14px;border-radius:12px;border:1px solid #dde1ea">
        <summary style="cursor:pointer;font-weight:700;font-size:13px;color:#475569">📋 1-Time SQL to run in Supabase SQL Editor (Click to view)</summary>
        <pre style="margin:8px 0 0;padding:10px;background:#1e293b;color:#f8fafc;border-radius:8px;font-size:12px;overflow-x:auto">CREATE TABLE IF NOT EXISTS laa_fresh_state (
  id TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE laa_fresh_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public access" ON laa_fresh_state FOR ALL USING (true) WITH CHECK (true);</pre>
      </details>

      <div class="actions" style="margin-top:16px">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        ${cfg.active ? '<button class="btn danger" type="button" onclick="disconnectCloud()">Disconnect</button>' : ''}
        <button class="btn light" type="button" onclick="testCloudConnection()">⚡ Test Connection</button>
        <button class="btn" type="submit">✓ Save &amp; Sync Now</button>
      </div>
    </form>
  `);
};

window.testCloudConnection = async function() {
  let url = (document.getElementById('cfgCloudUrl')?.value || '').trim();
  let key = (document.getElementById('cfgCloudKey')?.value || '').trim();

  if (!url || !key) return toast('Please enter both Supabase URL and Key.', 'err');

  toast('Testing connection to Supabase…', 'ok');
  try {
    let endpoint = url.replace(/\/+$/, '') + '/rest/v1/laa_fresh_state?limit=1';
    let res = await fetch(endpoint, {
      method: 'GET',
      headers: { 'apikey': key, 'Authorization': 'Bearer ' + key }
    });

    if (res.ok) {
      toast('✓ Connection successful! Cloud database is ready.', 'ok');
    } else {
      let t = await res.text();
      toast('Connection failed. Make sure you ran the SQL table setup in Supabase.', 'err');
      console.warn('Supabase test response:', t);
    }
  } catch (e) {
    toast('Network error connecting to Supabase: ' + e.message, 'err');
  }
};

window.submitCloudConfig = async function() {
  let url = (document.getElementById('cfgCloudUrl')?.value || '').trim();
  let key = (document.getElementById('cfgCloudKey')?.value || '').trim();

  if (!url || !key) return toast('Please enter URL and API key.', 'err');

  setCloudCfg({ url, key, active: true, connectedAt: new Date().toISOString() });
  closeModal();
  toast('Connecting and syncing with cloud…', 'ok');

  // Try pull first; if empty, push current local state to initialize
  let pulled = await cloudPull(false);
  if (!pulled) {
    cloudPush();
  }
};

window.disconnectCloud = function() {
  setCloudCfg(null);
  closeModal();
  toast('Cloud sync disconnected. Operating in local mode.', 'ok');
};

// Periodic background sync: checks for updates every 45 seconds when tab is active
setInterval(() => {
  if (isCloudActive() && !document.hidden) {
    cloudPull(true);
  }
}, 45000);
