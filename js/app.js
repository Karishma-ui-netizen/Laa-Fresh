/**
 * Laa Fresh Stock Manager - Core Inventory & Application Logic
 * Integrates: Inward Receiving, Operations & Storage Dispatch, Processing, Mappings, Setup, Backup & Bin
 */

function fixPcs(s) {
  ['Idiyappam', 'Parotta'].forEach(n => {
    let q = s.products.find(x => x.name.toLowerCase() === n.toLowerCase());
    if (!q) s.products.push({ name: n, size: 0, unit: 'pcs', w: {} });
    else if (!s.tx.some(t => t.product === q.name)) q.unit = 'pcs';
  });
  s.pcsFix = true;
}

function ensureSuppliers(s) {
  if (!Array.isArray(s.suppliers)) {
    s.suppliers = SUPPLIERS.slice();
    (s.tx || []).forEach(t => {
      if (t.source && !s.suppliers.some(x => x.toLowerCase() === t.source.toLowerCase())) {
        s.suppliers.push(t.source);
      }
    });
  }
}

function catalogList() {
  return CATALOG.map(c => ({
    name: c[0],
    size: c[2],
    unit: c[3] || 'g',
    w: Object.assign({}, c[1])
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function migrateCatalog(s) {
  let used = new Set(), add = n => { if (n) used.add(String(n).toLowerCase()); };
  (s.tx || []).concat((s.deleted || []).map(d => d.tx)).forEach(t => {
    add(t.product); add(t.raw); add(t.finished); add(t.rawFrom);
  });
  (s.maps || []).forEach(m => {
    add(m.raw); add(m.alias); add(m.finished);
  });
  let cat = catalogList(), have = new Set(cat.map(p => p.name.toLowerCase())),
      keep = s.products.filter(p => used.has(p.name.toLowerCase()) && !have.has(p.name.toLowerCase()));
  s.products = cat.concat(keep);
  s.catalogV = 3;
}

var state = loadState();
window.state = state;

function loadState() {
  try {
    let s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.products) && Array.isArray(s.tx) && Array.isArray(s.maps)) {
      s.maps.forEach(m => { if (!m.alias) m.alias = m.finished || m.name; });
      if (!Array.isArray(s.deleted)) s.deleted = [];
      s.tx.forEach((t, i) => { if (t.id == null) t.id = Date.now() + i + Math.random(); });
      if (s.catalogV !== 3) migrateCatalog(s);
      if (!s.pcsFix) fixPcs(s);
      ensureSuppliers(s);
      ensureCustomers(s);
      ensureStorage(s);
      s.products.forEach(q => { if (q.name === "Idiyappam" && q.unit === "pcs" && !(q.size > 0)) q.size = 4; });
      return s;
    }
  } catch (e) {}
  let initial = {
    products: catalogList(),
    tx: [],
    maps: [],
    deleted: [],
    catalogV: 3,
    pcsFix: true,
    suppliers: SUPPLIERS.slice(),
    customers: [],
    storageTx: []
  };
  ensureStorage(initial);
  return initial;
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    toast('Error saving to local storage. Storage may be full.', 'err');
  }
  if (typeof cloudPush === 'function') cloudPush();
  renderAll();
}

function toast(msg, kind, undo) {
  let box = document.getElementById('toasts');
  if (!box) return;
  let el = document.createElement('div');
  el.className = 'toast' + (kind === 'err' ? ' err' : kind === 'ok' ? ' okk' : '');
  el.innerHTML = '<span>' + esc(msg) + '</span>';
  if (undo) {
    let b = document.createElement('button');
    b.textContent = undo.label;
    b.onclick = () => { undo.fn(); el.remove(); };
    el.appendChild(b);
  }
  box.appendChild(el);
  setTimeout(() => el.remove(), undo ? 9000 : 3800);
}

window.alert = m => toast(m, /not enough|valid|choose|exists|cannot|must|enter|please|not valid/i.test(m) ? 'err' : 'ok');

function dateNow() {
  let d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function grams(q, u) {
  return Math.round(Number(q) * (u === 'kg' ? 1000 : 1));
}

function fmtG(g) {
  g = Math.round(Number(g) || 0);
  if (Math.abs(g) >= 1000) return (g / 1000).toLocaleString('en-IN', { maximumFractionDigits: 3 }) + ' kg';
  return g.toLocaleString('en-IN') + ' g';
}

function fmtQty(v, P) {
  return P ? (Math.round(Number(v) || 0)).toLocaleString('en-IN') + ' pcs' : fmtG(v);
}

function isPcs(n) {
  let q = packFor(n);
  return !!q && q.unit === 'pcs';
}

const CHIPVALS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20];

function buildChips(id, input, after) {
  let el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = CHIPVALS.map(v => `<label class="chip" data-v="${v}"><input type="checkbox" value="${v}"><span>${v}</span></label>`).join('');
  el.onchange = e => {
    let c = e.target.closest('input');
    if (!c) return;
    input().value = c.checked ? c.value : '';
    after();
  };
}

function refreshChips(id, val) {
  document.querySelectorAll('#' + id + ' .chip').forEach(c => {
    let on = c.dataset.v === String(+val);
    c.classList.toggle('on', on);
    let inp = c.querySelector('input');
    if (inp) inp.checked = on;
  });
}

function fmtNum(n) {
  return (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function prodColorCat(name) {
  let n = (name || '').toLowerCase();
  if (/chicken/i.test(n)) return 'chicken';
  if (/fish|basa|catla|anchovy|pomfret|prawn|tuna|squid|rohu|seer|tilapia|shrimp|mussel|karuvadu|seafood|lady/i.test(n)) return 'seafood';
  if (/mutton|goat|lamb/i.test(n)) return 'mutton';
  if (/buffalo|beef|meat|keema/i.test(n)) return 'beef';
  if (/idiyappam|parotta|veg|rice/i.test(n)) return 'ready';
  return 'other';
}

function prodTag(name) {
  if (!name) return '—';
  let cat = prodColorCat(name);
  return `<span class="prod-badge ${cat}">${esc(name)}</span>`;
}
window.prodTag = prodTag;
window.prodColorCat = prodColorCat;
window.save = save;
window.dateNow = dateNow;
window.fmtQty = fmtQty;
window.fmtG = fmtG;
window.isPcs = isPcs;
window.esc = esc;
window.toast = toast;
window.go = go;

function go(id) {
  if (!canTab(id)) {
    if (AUTH.cur) toast('You do not have access to that section.', 'err');
    id = isOpRole() ? 'mapping' : 'dashboard';
  }
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('active', b.dataset.tab === id));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('active', p.id === id));
  if (id === 'reports') renderReport();
  if (id === 'operations') {
    renderOperationsUI();
    if (typeof renderOpHandoverList === 'function') renderOpHandoverList();
  }
  if (id === 'mapping') {
    if (typeof renderMappingUI === 'function') renderMappingUI();
  }
  if (id === 'storage') renderStorageUI();
  if (id === 'vendors') renderVendors();
  if (id === 'users') renderUsers();
  if (id === 'outward') updateOutPreview();
}

document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.tab));

function productOptions(sel, placeholder = 'Choose product') {
  if (!sel) return;
  let val = sel.value, al = aliasSet(), list = state.products.filter(p => !al.has(p.name));
  sel.innerHTML = '<option value="">' + placeholder + '</option>' + list.map(p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`).join('');
  if (list.some(p => p.name === val)) sel.value = val;
}

function refreshSelects() {
  let al = aliasSet(), plain = state.products.filter(p => !al.has(p.name)),
      opt = p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`,
      NEW = '<option value="__new__">＋ Add new product…</option>';

  let ip = document.getElementById('inProduct');
  if (ip) productOptions(ip);

  let mr = document.getElementById('mapRaw');
  if (mr) {
    let v = mr.value;
    mr.innerHTML = '<option value="">Choose raw product</option>' + plain.map(opt).join('') + NEW;
    if ([...mr.options].some(x => x.value === v)) mr.value = v;
  }

  let mp = document.getElementById('mapProd');
  if (mp) {
    let v = mp.value;
    mp.innerHTML = '<option value="">Choose mapped product</option>' + plain.map(opt).join('') + NEW;
    if ([...mp.options].some(x => x.value === v)) mp.value = v;
  }

  syncNew();
  custOptions();
  outOptions();
  supOptions();
  fillStorageSelects();
}

function outOptions() {
  let f = document.getElementById('outwardForm'), o = document.getElementById('outProduct');
  if (!o) return;
  let val = o.value, ch = f.customer.value, al = aliasSet(),
      plain = state.products.filter(p => !al.has(p.name)),
      has = p => p.w && (ch in p.w),
      listed = plain.filter(has),
      others = plain.filter(p => !has(p)),
      opt = p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`;

  o.innerHTML = '<option value="">Choose product</option>' +
    (listed.length ? `<optgroup label="Listed for ${esc(ch)}">` + listed.map(opt).join('') + '</optgroup>' : '') +
    `<optgroup label="${listed.length ? 'Other products' : 'Stock products'}">` + others.map(opt).join('') + '</optgroup>' +
    (state.maps.length ? '<optgroup label="Mapped products">' + state.maps.map(m => `<option value="${esc(m.alias)}">${esc(m.alias)}</option>`).join('') + '</optgroup>' : '');

  if ([...o.options].some(x => x.value === val)) o.value = val;
}

function ensureSupplier(n) {
  n = n.trim();
  let ex = state.suppliers.find(x => x.toLowerCase() === n.toLowerCase());
  if (ex) return ex;
  state.suppliers.push(n);
  logActivity('Supplier added', n + ' (from a form)');
  return n;
}

function ensureCustomers(s) {
  if (!Array.isArray(s.customers)) {
    s.customers = [];
    (s.tx || []).forEach(t => {
      let c = t.type === 'Outward' && t.customer;
      if (c && !CHANNELS.some(x => x.toLowerCase() === c.toLowerCase()) && !s.customers.some(x => x.toLowerCase() === c.toLowerCase())) {
        s.customers.push(c);
      }
    });
  }
}

function ensureCustomer(n) {
  n = n.trim();
  let ex = CHANNELS.concat(state.customers).find(x => x.toLowerCase() === n.toLowerCase());
  if (ex) return ex;
  state.customers.push(n);
  logActivity('Customer added', n + ' (from a form)');
  return n;
}

function syncCust() {
  let s = document.getElementById('outCustomer');
  if (s) document.getElementById('newCustBox').classList.toggle('show', s.value === '__new__');
}

function custOptions() {
  let s = document.getElementById('outCustomer');
  if (!s) return;
  let v = s.value;
  s.innerHTML = CH.concat(state.customers.slice().sort((a, b) => a.localeCompare(b)), ['Other']).map(c => `<option>${esc(c)}</option>`).join('') + '<option value="__new__">＋ Add new customer / company…</option>';
  if ([...s.options].some(o => o.value === v)) s.value = v;
  syncCust();
}

function renderCustomers() {
  let el = document.getElementById('custTable');
  if (!el) return;
  el.innerHTML = table(['Customer / company', 'Action'],
    CH.map(c => [`<strong>${esc(c)}</strong>`, '<span class="tag">built-in</span>']).concat(
      state.customers.slice().sort((a, b) => a.localeCompare(b)).map(c => [
        `<strong>${esc(c)}</strong>`,
        `<button class="icon-btn" onclick="deleteCustomer(this.dataset.n)" data-n="${esc(c)}">🗑 Remove</button>`
      ])
    )
  );
}

document.getElementById('custForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target, n = f.n.value.trim();
  if (!n) return;
  if (CHANNELS.concat(state.customers).some(x => x.toLowerCase() === n.toLowerCase())) return alert('That customer already exists.');
  state.customers.push(n);
  logActivity('Customer added', n);
  save();
  f.reset();
  alert('Customer added. It is now in the Outward dispatch list.');
});

window.deleteCustomer = n => showModal(`
  <div class="big">🗑</div>
  <h3>Remove customer?</h3>
  <p>"${esc(n)}" will be removed from the dropdown. Past dispatches keep the name.</p>
  <div class="actions">
    <button class="btn light" data-cancel>Keep it</button>
    <button class="btn danger" data-ok>Remove</button>
  </div>
`, () => {
  state.customers = state.customers.filter(x => x !== n);
  logActivity('Customer removed', n);
  save();
  toast('Customer removed.', 'ok');
});

function syncSup() {
  let s = document.getElementById('inSupplier');
  if (s) document.getElementById('newSupBox').classList.toggle('show', s.value === '__new__');
}

function supOptions() {
  let s = document.getElementById('inSupplier');
  if (!s) return;
  let v = s.value;
  s.innerHTML = '<option value="">Choose supplier</option>' + state.suppliers.slice().sort((a, b) => a.localeCompare(b)).map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join('') + '<option value="__new__">＋ Add new supplier…</option>';
  if ([...s.options].some(o => o.value === v)) s.value = v;
  syncSup();
}

function syncNew() {
  let a = document.getElementById('mapRaw'), b = document.getElementById('mapProd');
  if (!a || !b) return;
  document.getElementById('newRawBox').classList.toggle('show', a.value === '__new__');
  document.getElementById('newProdBox').classList.toggle('show', b.value === '__new__');
}

document.getElementById('mapRaw')?.addEventListener('change', syncNew);
document.getElementById('mapProd')?.addEventListener('change', syncNew);

function ensureProduct(name) {
  name = name.trim();
  let ex = state.products.find(p => p.name.toLowerCase() === name.toLowerCase());
  if (ex) return ex.name;
  state.products.push({ name, size: 0, unit: 'g' });
  logActivity('Product added', name + ' (from a form)');
  return name;
}

/**
 * Calculates current available stock across all products
 */
function stock(list) {
  list = list || state.tx;
  let s = {};
  state.products.forEach(p => s[p.name] = 0);
  for (let t of list) {
    if (t.type === 'Inward') {
      s[t.product] = (s[t.product] || 0) + t.grams;
    } else if (t.type === 'Outward') {
      if (t.rawFrom) {
        s[t.product] = (s[t.product] || 0) - (t.ownG || 0);
        s[t.rawFrom] = (s[t.rawFrom] || 0) - (t.rawG || 0);
      } else {
        s[t.product] = (s[t.product] || 0) - t.grams;
      }
    } else if (t.type === 'Processing') {
      s[t.raw] = (s[t.raw] || 0) - t.inputG;
      s[t.finished] = (s[t.finished] || 0) + t.outputG;
    }
  }
  return s;
}

function logActivity(action, details) {
  if (!Array.isArray(state.activityLog)) state.activityLog = [];
  let u = curUser(), e = {
    at: new Date().toISOString(),
    action: String(action || 'Update'),
    details: String(details || ''),
    by: u ? u.username : '',
    role: u ? u.role : ''
  };
  state.activityLog.push(e);
  if (state.activityLog.length > 3000) state.activityLog = state.activityLog.slice(-3000);
  auditPush(e);
}

function stampRecord(o, isNew = false) {
  let now = new Date().toISOString(), by = curBy();
  if (isNew && !o.createdAt) o.createdAt = now;
  if (isNew && !o.createdBy) o.createdBy = by;
  o.updatedAt = now;
  o.updatedBy = by;
  return o;
}

function txAdd(t) {
  t.id = Date.now() + Math.random();
  stampRecord(t, true);
  state.tx.push(t);
  logActivity('Stock entry added', `${t.type} · ${t.product || t.finished || ''} · ${fmtQty(t.grams || t.outputG || 0, t.u === 'pcs')} · ${t.type === 'Inward' ? (t.source || '') : t.customer || ''}`);
  save();
}
window.txAdd = txAdd;

function setupDates() {
  document.querySelectorAll('input[type=date]').forEach(x => {
    if (!x.value) x.value = dateNow();
  });
}

const mode = document.getElementById('inMode');

function setInMode() {
  if (!mode) return;
  if (isPcs(document.getElementById('inwardForm').product.value)) {
    applyInPcs(true);
    return;
  }
  let m = mode.value;
  let bulkEl = document.getElementById('bulkField');
  let bulkPacksEl = document.getElementById('bulkPacksField');
  if (bulkEl) bulkEl.style.display = m === 'bulk' ? 'flex' : 'none';
  if (bulkPacksEl) bulkPacksEl.style.display = m === 'bulk' ? 'flex' : 'none';
  document.getElementById('packCountField').style.display = m === 'packs' ? 'flex' : 'none';
  document.getElementById('packSizeField').style.display = m === 'packs' ? 'flex' : 'none';
  document.getElementById('gramsField').style.display = m === 'grams' ? 'flex' : 'none';
  calcInward();
}

let modeTouched = false;
if (mode) {
  mode.onchange = () => { modeTouched = true; setInMode(); };
}

function applyInPcs(P) {
  let f = document.getElementById('inwardForm');
  if (!f) return;
  let d = (id, on) => { let el = document.getElementById(id); if (el) el.style.display = on ? 'flex' : 'none'; };
  d('modeField', !P);
  d('inPackUnit', !P);
  d('inChips', false);
  d('bulkPacksField', !P && (!mode || mode.value === 'bulk'));
  document.querySelector('#bulkField label').textContent = P ? 'Total pieces (count)' : 'Total weight (kg)';
  document.querySelector('#packSizeField label').textContent = P ? 'Pieces in one pack (tick one box)' : 'Weight per packet';
  document.querySelector('#packCountField label').textContent = P ? 'Number of packs' : 'Number of packets';
  if (P) {
    mode.value = 'bulk';
    d('bulkField', 1);
    d('packCountField', 0);
    d('packSizeField', 0);
    d('gramsField', 0);
  } else {
    setInMode();
  }
}

function syncInPcs(src) {
  let f = document.getElementById('inwardForm');
  let pp = +f.packSize.value || 0;
  if (src === 'size') src = (+f.bulkKg.value > 0) ? 'total' : 'packs';
  if (src === 'packs') {
    let pk = +f.packCount.value || 0;
    if (pk > 0 && pp > 0) f.bulkKg.value = Math.round(pk * pp);
  } else {
    let tot = +f.bulkKg.value || 0;
    if (tot > 0 && pp > 0) {
      let pk = tot / pp;
      f.packCount.value = Number.isInteger(pk) ? pk : +pk.toFixed(2);
    }
  }
  refreshChips('inChips', f.packSize.value);
  calcInward();
}

['packCount', 'bulkKg', 'packSize'].forEach(n => {
  let el = document.getElementById('inwardForm')?.[n];
  if (el) {
    el.addEventListener('input', () => {
      let f = document.getElementById('inwardForm');
      if (isPcs(f.product.value)) syncInPcs(n === 'packCount' ? 'packs' : n === 'bulkKg' ? 'total' : 'size');
    });
  }
});

function fillInPack() {
  let f = document.getElementById('inwardForm');
  if (!f) return;
  let p = packFor(f.product.value), n = document.getElementById('inPackNote'), P = !!p && p.unit === 'pcs';
  applyInPcs(P);
  if (P) {
    f.packSize.value = '';
    f.packCount.value = '';
    n.textContent = 'Enter the total number of pieces. Pack size is only needed when you dispatch.';
    calcInward();
    return;
  }
  let w = weightFor(p, '');
  if (w.g > 0) {
    f.packSize.value = w.g;
    f.packUnit.value = 'g';
    n.textContent = 'Default pack weight: ' + fmtNum(w.g) + ' g (you can customize it)';
    if (!modeTouched && mode.value !== 'packs') {
      mode.value = 'packs';
      setInMode();
    }
  } else {
    f.packSize.value = '';
    n.textContent = f.product.value ? 'Enter received packet weight above.' : '';
  }
  calcInward();
}

document.getElementById('inProduct')?.addEventListener('change', fillInPack);
document.getElementById('inwardForm')?.addEventListener('reset', () => setTimeout(() => {
  applyInPcs(false);
  syncSup();
  document.getElementById('inPackNote').textContent = '';
}, 0));
document.getElementById('inPackFor')?.addEventListener('change', fillInPack);
document.getElementById('inSupplier')?.addEventListener('change', syncSup);
document.querySelectorAll('#inwardForm input,#inwardForm select').forEach(x => x.addEventListener('input', calcInward));

function inwardGrams(f) {
  if (isPcs(f.product.value)) return Math.round(+f.bulkKg.value || 0);
  if (f.mode.value === 'bulk') return grams(f.bulkKg.value, 'kg');
  if (f.mode.value === 'grams') return Math.round(+f.grams.value || 0);
  return grams((+f.packCount.value || 0) * (+f.packSize.value || 0), f.packUnit.value);
}

function calcInward() {
  let f = document.getElementById('inwardForm');
  if (!f) return;
  if (isPcs(f.product.value)) {
    document.getElementById('inCalc').textContent = fmtQty(inwardGrams(f), true);
    let pk = +f.packCount.value || 0, pp = +f.packSize.value || 0;
    document.getElementById('inCalcSub').textContent = pk > 0 && pp > 0 ? `${fmtNum(pk)} packs × ${fmtNum(pp)} pieces` : 'Total pieces being added';
    return;
  }
  let total = inwardGrams(f);
  document.getElementById('inCalc').textContent = fmtG(total);
  document.getElementById('inCalcSub').textContent = f.mode.value === 'packs'
    ? `${fmtNum(f.packCount.value || 0)} packets × ${fmtNum(f.packSize.value || 0)} ${f.packUnit.value} each`
    : f.mode.value === 'bulk' ? 'Bulk weight converted to grams' : 'Exact gram quantity';
}

document.getElementById('inwardForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target, g = inwardGrams(f);
  if (g <= 0) return alert('Please enter a valid quantity.');
  let supName = f.source.value;
  if (supName === '__new__') {
    supName = (f.newSupplier.value || '').trim();
    if (!supName) return alert('Enter the new supplier name.');
    supName = ensureSupplier(supName);
  }

  let packCountVal = 0;
  if (isPcs(f.product.value)) {
    packCountVal = +f.bulkKg.value || 0;
  } else if (f.mode.value === 'packs') {
    packCountVal = +f.packCount.value || 0;
  } else {
    packCountVal = +(f.bulkPacks && f.bulkPacks.value) || (+f.packCount && +f.packCount.value) || 0;
  }

  let tx = {
    type: 'Inward',
    date: f.date.value,
    product: f.product.value,
    grams: g,
    packCount: packCountVal,
    u: isPcs(f.product.value) ? 'pcs' : undefined,
    mode: f.mode.value,
    source: supName,
    ref: f.ref.value,
    notes: f.notes.value,
    handoverStatus: 'Pending Handover'
  };

  txAdd(tx);

  let keepProd = f.product.value;
  f.reset();
  f.date.value = dateNow();
  applyInPcs(false);
  document.getElementById('inPackNote').textContent = '';
  syncSup();

  // Instant option to handover to operations team
  toast('Inward stock saved. Ready for Operations Team handover.', 'ok', {
    label: '👉 Handover to Team',
    fn: () => openHandoverModal(tx.id)
  });
});

document.getElementById('productForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target, n = f.name.value.trim();
  if (state.products.some(p => p.name.toLowerCase() === n.toLowerCase())) return alert('That product already exists.');
  state.products.push({ name: n, size: +f.size.value || 0, unit: f.pcs.checked ? 'pcs' : f.unit.value });
  logActivity('Product added', n);
  save();
  f.reset();
  alert('Product added. It is now available in Inward, Mapping, Storage and Dispatch.');
});

/* ================= OUTWARD DISPATCH STRICTLY FROM STORAGE ================= */

function syncOutPack() {
  let f = document.getElementById('outwardForm');
  if (!f) return;
  let pk = +f.packs.value || 0, sz = +f.packSize.value || 0;
  if (isPcs(f.product.value)) {
    if (pk > 0 && sz > 0) f.qty.value = Math.round(pk * sz);
    refreshChips('outChips', f.packSize.value);
  } else if (pk > 0 && sz > 0) {
    let g = Math.round(pk * sz * (f.packUnit.value === 'kg' ? 1000 : 1));
    f.qty.value = +(g / 1000).toFixed(3);
    f.unit.value = 'kg';
  }
  updateOutPreview();
}

function applyOutPcs(P) {
  document.getElementById('outPackUnit').style.display = P ? 'none' : '';
  document.getElementById('outUnitField').style.display = 'none';
  document.getElementById('outChips').style.display = P ? 'flex' : 'none';
  document.getElementById('lblOutPack').textContent = P ? 'Pieces in one pack (tick one box)' : 'Weight per packet';
  document.getElementById('lblOutQty').textContent = P ? 'Total pieces to dispatch' : 'Total quantity to dispatch (kg)';
}

function fillOutPack() {
  let f = document.getElementById('outwardForm');
  if (!f) return;
  let p = packFor(f.product.value), n = document.getElementById('outPackNote'), ch = f.customer.value,
      w = weightFor(p, ch), P = !!p && p.unit === 'pcs';
  applyOutPcs(P);

  // Auto-select storage room based on product name if user hasn't explicitly clicked one
  let isFrozen = /frozen/i.test(f.product.value);
  let room = isFrozen ? 'Frozen Storage' : 'Fresh Storage';
  selectOutStorageRoom(room);

  if (P) {
    f.packSize.value = p.size > 0 ? p.size : '';
    n.textContent = p.size > 0 ? 'Default: ' + fmtNum(p.size) + ' pieces per pack (tick a box or type it)' : 'Tick how many pieces are in one pack';
    syncOutPack();
    return;
  }
  if (w.g > 0) {
    f.packSize.value = w.g;
    f.packUnit.value = 'g';
    n.textContent = w.lbl === 'default'
      ? ((p.w && Object.keys(p.w).length ? 'No weight saved for ' + ch + '. Showing default pack: ' : 'Default pack: ') + fmtNum(w.g) + ' g (you can change it)')
      : 'Pack for ' + ch + ': ' + fmtNum(w.g) + ' g (you can change it)';
  } else {
    f.packSize.value = '';
    n.textContent = f.product.value ? 'No weight set. Enter it manually.' : '';
  }
  syncOutPack();
}

function selectOutStorageRoom(room) {
  let rInput = document.getElementById('outStorageRoom');
  if (rInput) rInput.value = room;
  document.querySelectorAll('.out-storage-pill').forEach(pill => {
    pill.classList.toggle('active', pill.dataset.room === room);
  });
  updateOutPreview();
}

function getOutStorageRoom() {
  let r = document.getElementById('outStorageRoom')?.value;
  if (r && STORAGE_ROOMS.includes(r)) return r;
  let prod = document.getElementById('outwardForm')?.product?.value || '';
  return /frozen/i.test(prod) ? 'Frozen Storage' : 'Fresh Storage';
}

function outPlan() {
  let f = document.getElementById('outwardForm');
  if (!f) return { linked: false, p: '', g: 0, av: 0 };
  let p = f.product.value, g = isPcs(p) ? Math.round(+f.qty.value || 0) : grams(f.qty.value, f.unit.value);
  let room = getOutStorageRoom();
  let m = mapOf(p);

  if (!m) {
    let avRoom = getStorageStock(p, room);
    return { linked: false, p, g, av: avRoom, room };
  } else {
    let avRaw = getStorageStock(m.raw, room);
    return { linked: true, p, g, raw: m.raw, rawG: g, ownUse: 0, av: avRaw, room };
  }
}

function updateOutPreview() {
  let f = document.getElementById('outwardForm');
  if (!f) return;
  let p = f.product.value, pl = outPlan(), Q = v => fmtQty(v, isPcs(p));
  let avEl = document.getElementById('outAvailable'), aftEl = document.getElementById('outAfter');

  // Update room pill badges with live stock
  if (p) {
    let freshAv = getStorageStock(pl.linked ? pl.raw : p, 'Fresh Storage');
    let frozenAv = getStorageStock(pl.linked ? pl.raw : p, 'Frozen Storage');
    let bFresh = document.getElementById('badgeOutFresh');
    let bFrozen = document.getElementById('badgeOutFrozen');
    if (bFresh) bFresh.textContent = fmtQty(freshAv, isPcs(p));
    if (bFrozen) bFrozen.textContent = fmtQty(frozenAv, isPcs(p));
  }

  if (avEl) avEl.textContent = p ? `${Q(pl.av)} (in ${pl.room})` : 'Choose a product';
  if (aftEl) aftEl.textContent = !p
    ? 'Stock after dispatch will appear here'
    : pl.linked
    ? `Takes from ${pl.raw} in ${pl.room} → room balance will be ${fmtQty(pl.av - pl.g, false)}`
    : `After dispatch from ${pl.room}: ${Q(pl.av - pl.g)}`;
}

document.getElementById('outCustomer')?.addEventListener('change', () => {
  let f = document.getElementById('outwardForm');
  syncCust();
  if (CUSTDEST[f.customer.value]) f.location.value = CUSTDEST[f.customer.value];
  outOptions();
  fillOutPack();
});

document.getElementById('outProduct')?.addEventListener('change', fillOutPack);

['packs', 'packSize', 'packUnit'].forEach(n => {
  let el = document.getElementById('outwardForm')?.[n];
  if (el) {
    el.addEventListener('input', syncOutPack);
    el.addEventListener('change', syncOutPack);
  }
});

document.querySelectorAll('#outwardForm input,#outwardForm select').forEach(x => x.addEventListener('input', updateOutPreview));

document.getElementById('outwardForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target, pl = outPlan();
  if (pl.g <= 0) return alert('Enter a valid quantity.');
  if (!pl.p) return alert('Please choose a product.');

  if (pl.av < pl.g) {
    return alert(`Not enough stock in ${pl.room}. Available: ${fmtQty(pl.av, isPcs(pl.p))}. Outward stock can only be dispatched directly from the Storage Room. Please move finished cuts from Stock Mapping into ${pl.room} first.`);
  }

  let custName = f.customer.value;
  if (custName === '__new__') {
    custName = (f.newCustomer.value || '').trim();
    if (!custName) return alert('Enter the new customer or company name.');
    custName = ensureCustomer(custName);
  }

  let t = {
    type: 'Outward',
    date: f.date.value,
    customer: custName,
    location: f.location.value,
    product: pl.p,
    grams: pl.g,
    packs: +f.packs.value || 0,
    ref: f.ref.value,
    notes: f.notes.value,
    storageRoom: pl.room
  };

  if (isPcs(pl.p)) t.u = 'pcs';
  if (pl.linked) {
    t.rawFrom = pl.raw;
    t.rawG = pl.rawG;
    t.ownG = pl.ownUse;
  }

  let keepC = custName, keepL = f.location.value;
  txAdd(t);

  // Deduct from storage ledger
  recordStorageDispatch(t);

  f.reset();
  f.customer.value = keepC;
  f.location.value = keepL;
  f.date.value = dateNow();
  syncCust();
  outOptions();
  f.qty.value = 1;
  f.packs.value = 0;
  document.getElementById('outPackNote').textContent = '';
  applyOutPcs(false);
  updateOutPreview();

  alert(pl.linked
    ? `Dispatch saved. ${fmtG(pl.rawG)} deducted from ${pl.raw} in ${pl.room}.`
    : `Dispatch saved. Stock deducted from ${pl.room}.`);
});

function typeTag(t) {
  return `<span class="tag ${t === 'Inward' ? 'in' : t === 'Outward' ? 'out' : 'pr'}">${t}</span>`;
}

function txName(t) {
  return t.type === 'Processing' ? t.raw + ' → ' + t.finished : (t.rawFrom ? t.product + ' (from ' + t.rawFrom + ')' : (t.product || ''));
}

function packFor(n) {
  return state.products.find(p => p.name === n);
}

function weightFor(p, ch) {
  if (!p) return { g: 0, lbl: '' };
  if (ch && p.w && (ch in p.w)) return { g: p.w[ch] > 0 ? p.w[ch] : 0, lbl: ch };
  let d = (p.size || 0) * (p.unit === 'kg' ? 1000 : 1);
  return { g: d > 0 ? d : 0, lbl: 'default' };
}

function mapOf(n) {
  return state.maps.find(m => m.alias === n);
}

function aliasSet() {
  return new Set(state.maps.map(m => m.alias));
}

function txQty(t) {
  let pk = t.type === 'Outward' ? t.packs : t.type === 'Inward' ? t.packCount : 0;
  let roomStr = t.storageRoom ? `<br><span class="tag ${t.storageRoom === 'Frozen Storage' ? 'frozen' : 'fresh'} sm">${esc(t.storageRoom)}</span>` : '';
  return (t.u === 'pcs' ? fmtQty(t.grams, true) : fmtG(t.type === 'Processing' ? t.inputG : t.grams)) +
    (pk > 0 ? ` <span class="mini">· ${pk} pkts</span>` : '') + roomStr;
}

function table(head, rows) {
  if (!rows.length) return '<div class="empty">No entries yet. Add your first stock transaction to see it here.</div>';
  return '<table><thead><tr>' + head.map(x => '<th>' + x + '</th>').join('') + '</tr></thead><tbody>' + rows.map(r => '<tr>' + r.map(x => '<td>' + x + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
}
window.table = table;

document.getElementById('mapForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target, raw = f.raw.value, prod = f.prod.value;
  if (raw === '__new__') raw = f.newRaw.value.trim();
  if (prod === '__new__') prod = f.newProd.value.trim();
  if (!raw) return alert('Choose or enter the raw product.');
  if (!prod) return alert('Choose or enter the mapped product.');
  if (raw.toLowerCase() === prod.toLowerCase()) return alert('Mapped product must be different from the raw product.');
  if (state.maps.some(m => m.alias.toLowerCase() === prod.toLowerCase())) return alert('That product is already mapped.');
  if (state.maps.some(m => m.alias.toLowerCase() === raw.toLowerCase())) return alert('The raw product cannot itself be a mapped product.');
  if (state.maps.some(m => m.raw.toLowerCase() === prod.toLowerCase())) return alert('That product is already used as a raw product.');
  raw = ensureProduct(raw);
  prod = ensureProduct(prod);
  state.maps.push({ id: Date.now() + Math.random(), raw, alias: prod, name: prod });
  logActivity('Product mapping added', `${raw} → ${prod}`);
  save();
  f.reset();
  syncNew();
  alert(`Mapped. "${prod}" now appears in Outward dispatch and takes stock from ${raw}.`);
});

function renderMappings() {
  let el = document.getElementById('mappingTable');
  if (!el) return;
  el.innerHTML = table(['Mapped name (in dispatch list)', 'Takes stock from', 'Action'], state.maps.map(m => [
    `<strong>${esc(m.alias)}</strong>`,
    esc(m.raw),
    `<button class="icon-btn" onclick="deleteMap('${m.id}')">Remove</button>`
  ]));
}

window.deleteMap = id => {
  if (!needAdmin('remove mappings')) return;
  if (confirm('Remove this mapping? Past dispatches stay in your history.')) {
    let m = state.maps.find(x => String(x.id) === String(id));
    state.maps = state.maps.filter(m => String(m.id) !== String(id));
    logActivity('Product mapping removed', m ? m.raw + ' → ' + m.alias : '');
    save();
  }
};

/* ================= PROCESSING MODULE ================= */

document.getElementById('procForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target;
  let raw = f.raw.value, finished = f.finished.value;
  let inKg = +f.inputKg.value || 0, outKg = +f.outputKg.value || 0;
  if (!raw || !finished) return alert('Choose both raw and finished products.');
  if (inKg <= 0 || outKg <= 0) return alert('Enter valid input and output quantities.');

  let inG = Math.round(inKg * 1000), outG = Math.round(outKg * 1000);
  let s = stock();
  if ((s[raw] || 0) < inG) return alert(`Not enough ${raw} stock. Available: ${fmtG(s[raw] || 0)}.`);

  let t = {
    type: 'Processing',
    date: f.date.value || dateNow(),
    raw: raw,
    finished: finished,
    inputG: inG,
    outputG: outG,
    notes: f.notes.value || ''
  };

  txAdd(t);
  f.reset();
  f.date.value = dateNow();
  alert(`Processing logged. ${fmtG(inG)} of ${raw} converted into ${fmtG(outG)} of ${finished}.`);
});

function renderAll() {
  ensureV(state);
  ensureStorage(state);
  refreshSelects();
  let s = stock(), positive = state.products.reduce((a, p) => a + (p.unit === 'pcs' ? 0 : Math.max(0, s[p.name] || 0)), 0),
      low = Object.values(s).filter(g => g < 0).length;

  let sum = storageSummary();

  let sumEl = document.getElementById('summary');
  if (sumEl) {
    sumEl.innerHTML = [
      ['Total Stock Weight', fmtG(positive), 'Weight stock (pieces not added)', '📦'],
      ['Fresh Storage', fmtG(sum.freshTotG), 'Chiller / Cold Room stock', '🥗'],
      ['Frozen Storage', fmtG(sum.frozenTotG), 'Deep Freezer stock', '🧊'],
      ['Stock Checks', low, low ? 'Review negative balances' : 'No negative stock balances', low ? '⚠️' : '✅']
    ].map(c => `<div class="card"><div class="ico">${c[3]}</div><div class="label">${c[0]}</div><div class="num">${c[1]}</div><small>${c[2]}</small></div>`).join('');
  }

  // Deficit / Negative Balance Explanation Banner
  let deficitProducts = [];
  state.products.forEach(p => {
    let g = s[p.name] || 0;
    let fresh = getStorageStock(p.name, 'Fresh Storage');
    let frozen = getStorageStock(p.name, 'Frozen Storage');
    if (g < 0 || fresh < 0 || frozen < 0) {
      deficitProducts.push({ name: p.name, balance: g, fresh, frozen, isPcs: p.unit === 'pcs' });
    }
  });

  let defBanner = document.getElementById('deficitAlertBanner');
  if (defBanner) {
    if (deficitProducts.length > 0) {
      let defItemsStr = deficitProducts.map(d => `${d.name} (${fmtQty(d.balance, d.isPcs)})`).join(', ');
      defBanner.style.display = 'block';
      defBanner.innerHTML = `
        <div class="hint" style="background:#fff2f2;border:1.5px solid #fecaca;color:#991b1b;padding:14px 18px;border-radius:14px;display:flex;align-items:flex-start;gap:14px;box-shadow:0 4px 12px rgba(185,28,28,0.06)">
          <span style="font-size:24px;line-height:1">⚠️</span>
          <div style="flex:1">
            <div style="font-weight:800;font-size:14px;color:#991b1b;margin-bottom:3px">
              Storage Deficit Detected (${deficitProducts.length} item${deficitProducts.length > 1 ? 's' : ''}): ${esc(defItemsStr)}
            </div>
            <div style="font-size:12.5px;line-height:1.5;color:#7f1d1d">
              <strong>What does a negative balance like -1.750 kg mean?</strong><br>
              An outward dispatch was recorded, but according to your cold storage ledger, either:<br>
              1) The stock was received at inward bay or given to operations team, but <b>not yet moved / processed into the storage room</b>; OR<br>
              2) An outward dispatch was entered before inward arrival was recorded. Outward dispatches draw directly from Cold Storage Rooms. Once you move stock from Operations or record inward stock, this deficit is automatically cleared.
            </div>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">
              <button class="btn sm" style="background:#b91c1c;color:#fff" onclick="openMoveModal('${esc(deficitProducts[0]?.name || '')}')">🚪 Move Inward Stock to Storage</button>
              <button class="btn light sm" style="border-color:#fca5a5;color:#991b1b" onclick="openProcessModal('${esc(deficitProducts[0]?.name || '')}')">🔪 Process &amp; Cut Raw Stock</button>
              <button class="icon-btn" onclick="openExistingStorageModal('${esc(deficitProducts[0]?.name || '')}')">🏷️ Add Opening Stock</button>
            </div>
          </div>
        </div>
      `;
    } else {
      defBanner.style.display = 'none';
    }
  }

  // TABLE 1: Cold Storage Room Inventory
  let stEl = document.getElementById('stockTable');
  if (stEl) {
    let q = (document.getElementById('stockSearch')?.value || '').toLowerCase();
    stEl.innerHTML = table(['Product Name', 'Fresh Storage (Chiller)', 'Frozen Storage (Deep Freezer)', 'With Operations Teams', 'Total Storage Balance', 'Status', 'Actions'],
      state.products.filter(p => (!aliasSet().has(p.name) || (s[p.name] || 0) !== 0) && p.name.toLowerCase().includes(q)).map(p => {
        let g = s[p.name] || 0, ms = state.maps.filter(m => m.raw === p.name).map(m => m.alias);
        let fresh = getStorageStock(p.name, 'Fresh Storage');
        let frozen = getStorageStock(p.name, 'Frozen Storage');
        let freshTeam = getTeamInHand(p.name, 'Fresh Team');
        let frozenTeam = getTeamInHand(p.name, 'Frozen Team');
        let teamHand = freshTeam + frozenTeam;

        let fTxt = fresh < 0
          ? `<span class="tag deficit">⚠️ ${fmtQty(fresh, p.unit === 'pcs')} Deficit</span>`
          : `<span class="tag fresh">${fmtQty(fresh, p.unit === 'pcs')}</span>`;

        let zTxt = frozen < 0
          ? `<span class="tag deficit">⚠️ ${fmtQty(frozen, p.unit === 'pcs')} Deficit</span>`
          : `<span class="tag frozen">${fmtQty(frozen, p.unit === 'pcs')}</span>`;

        let teamTxt = teamHand > 0
          ? `<span class="tag team">${fmtQty(teamHand, p.unit === 'pcs')}</span><div class="mini">Fresh: ${fmtQty(freshTeam, p.unit === 'pcs')} | Frozen: ${fmtQty(frozenTeam, p.unit === 'pcs')}</div>`
          : '<span class="mini">—</span>';

        let totTxt = g < 0
          ? `<span style="color:#b42332;font-weight:800">⚠️ ${fmtQty(g, p.unit === 'pcs')}</span>`
          : `<strong>${fmtQty(g, p.unit === 'pcs')}</strong>`;

        let statusBadge = g < 0
          ? `<span class="tag deficit">⚠️ Deficit (${fmtQty(g, p.unit === 'pcs')})</span>`
          : (g === 0 ? '<span class="mini">Out of stock</span>' : '<span class="tag good">✓ In Stock</span>');

        return [
          `${prodTag(p.name)}` + (p.unit === 'pcs' ? ' <span class="tag good">pcs</span>' : '') + (ms.length ? `<br><span class="mini">Mapped: ${esc(ms.join(', '))}</span>` : ''),
          fTxt,
          zTxt,
          teamTxt,
          totTxt,
          statusBadge,
          `<div class="actions" style="flex-wrap:nowrap">
            ${teamHand > 0 ? `<button class="btn sm" type="button" onclick="openProcessModal('${esc(p.name)}')">🔪 Process</button>` : ''}
            <button class="btn light sm" type="button" onclick="openMoveModal('${esc(p.name)}')">Move</button>
            <button class="icon-btn" type="button" onclick="openExistingStorageModal('${esc(p.name)}')">＋</button>
          </div>`
        ];
      })
    );
  }

  // TABLE 2: Inward Stock Received at Bay
  if (typeof renderDashInwardTable === 'function') {
    renderDashInwardTable();
  }

  // Operations Cutting Summary
  if (typeof renderDashProcessTable === 'function') {
    renderDashProcessTable();
  }

  // Inward Handover Queue (on Inward tab)
  if (typeof renderInwardHandoverQueue === 'function') {
    renderInwardHandoverQueue();
  }

  // Operations Team tab
  if (typeof renderOperationsUI === 'function') {
    renderOperationsUI();
  }
  if (typeof renderOpHandoverList === 'function') {
    renderOpHandoverList();
  }

  // Stock Mapping tab
  if (typeof renderMappingUI === 'function') {
    renderMappingUI();
  }

  // Storage Room tab
  if (typeof renderStorageUI === 'function') {
    renderStorageUI();
  }

  let rtEl = document.getElementById('recentTable');
  if (rtEl) {
    rtEl.innerHTML = table(['Date', 'Activity', 'Details', 'Weight / Qty', ''], state.tx.slice().reverse().slice(0, 7).map(t => [
      esc(t.date),
      typeTag(t.type),
      esc(txName(t)),
      txQty(t),
      delBtn(t)
    ]));
  }

  renderBin();

  let ptEl = document.getElementById('productTable');
  if (ptEl) {
    let q = (document.getElementById('prodSearch')?.value || '').toLowerCase();
    ptEl.innerHTML = table(['Product', 'Default pack', 'Customer weights', 'Action'],
      state.products.map((p, i) => ({ p, i })).filter(x => x.p.name.toLowerCase().includes(q)).map(({ p, i }) => {
        let w = p.w || {}, ks = Object.keys(w), tip = ks.map(k => k + ': ' + (w[k] > 0 ? w[k] + ' g' : 'no weight')).join('\n');
        return [
          `<strong>${esc(p.name)}</strong>${p.unit === 'pcs' ? ' <span class="tag good">pieces</span>' : ''}`,
          p.size > 0 ? fmtNum(p.size) + (p.unit === 'pcs' ? ' pcs / pack' : ' ' + p.unit) : '<span class="mini">not set</span>',
          ks.length ? `<span class="tag pr" title="${esc(tip)}">${ks.length} customer${ks.length > 1 ? 's' : ''}</span>` : '<span class="mini">—</span>',
          `<div class="actions"><button class="btn light sm" onclick="editProduct(${i})">✏️ Edit</button><button class="icon-btn" onclick="deleteProduct(${i})">🗑</button></div>`
        ];
      })
    );
  }

  renderSuppliers();
  renderCustomers();
  renderMappings();
  renderReport();
  updateOutPreview();
  renderStorageUI();
  renderVendors(true);
  if (typeof renderVendorDashboard === 'function') renderVendorDashboard();
}

function renderSuppliers() {
  let el = document.getElementById('supTable');
  if (!el) return;
  el.innerHTML = table(['Supplier', 'Action'], state.suppliers.slice().sort((a, b) => a.localeCompare(b)).map(s => [
    `<strong>${esc(s)}</strong>`,
    `<button class="icon-btn" onclick="deleteSupplier(this.dataset.n)" data-n="${esc(s)}">🗑 Remove</button>`
  ]));
}

document.getElementById('supForm')?.addEventListener('submit', e => {
  e.preventDefault();
  let f = e.target, n = f.n.value.trim();
  if (!n) return;
  if (state.suppliers.some(x => x.toLowerCase() === n.toLowerCase())) return alert('That supplier already exists.');
  state.suppliers.push(n);
  logActivity('Supplier added', n);
  save();
  f.reset();
  alert('Supplier added.');
});

window.deleteSupplier = n => showModal(`
  <div class="big">🗑</div>
  <h3>Remove supplier?</h3>
  <p>"${esc(n)}" will be removed from the dropdown. Past inward entries keep the name.</p>
  <div class="actions">
    <button class="btn light" data-cancel>Keep it</button>
    <button class="btn danger" data-ok>Remove</button>
  </div>
`, () => {
  state.suppliers = state.suppliers.filter(x => x !== n);
  logActivity('Supplier removed', n);
  save();
  toast('Supplier removed.', 'ok');
});

window.editProduct = i => {
  let p = state.products[i], w = p.w || {};
  showModal(`
    <div class="big">✏️</div>
    <h3>Edit product</h3>
    <div class="formgrid" style="margin:14px 0">
      <div class="field full"><label>Product name</label><input id="epName" value="${esc(p.name)}"></div>
      <div class="field full"><label class="chk"><input type="checkbox" id="epPcs"${p.unit === 'pcs' ? ' checked' : ''}> Counted in pieces (not weight)</label></div>
      <div class="field"><label>Default pack weight (or pieces per pack)</label><input id="epSize" type="number" min="0" step="0.001" value="${p.size || ''}" placeholder="e.g. 450"></div>
      <div class="field"><label>Unit</label><select id="epUnit"><option value="g"${p.unit === 'g' ? ' selected' : ''}>grams</option><option value="kg"${p.unit === 'kg' ? ' selected' : ''}>kg</option></select></div>
    </div>
    <h4 style="margin:4px 0 4px;font-size:14px">Weight per customer (grams)</h4>
    <p class="mini" style="margin:0 0 10px">Fills in automatically in Dispatch. Leave blank if this product is not sold to that customer.</p>
    <div class="formgrid" style="margin-bottom:16px">${CH.map((c, k) => `<div class="field"><label>${esc(c)}</label><input id="ew${k}" type="number" min="0" step="0.001" value="${c in w ? w[c] : ''}" placeholder="—"></div>`).join('')}</div>
    <div class="actions">
      <button class="btn light" data-cancel>Cancel</button>
      <button class="btn" data-ok>Save</button>
    </div>
  `, () => {
    let name = document.getElementById('epName').value.trim(),
        size = +document.getElementById('epSize').value || 0,
        unit = document.getElementById('epPcs').checked ? 'pcs' : document.getElementById('epUnit').value;
    if (!name) return alert('Product name cannot be empty.');
    if (state.products.some((x, j) => j !== i && x.name.toLowerCase() === name.toLowerCase())) return alert('That product name already exists.');
    let nw = {};
    CH.forEach((c, k) => {
      let v = document.getElementById('ew' + k).value;
      if (v !== '') nw[c] = Math.max(0, +v || 0);
    });
    let old = p.name;
    p.name = name;
    p.size = size;
    p.unit = unit;
    p.w = nw;
    logActivity('Product settings edited', `${old} → ${name}; unit ${unit}; pack ${size}`);
    let fix = t => {
      ['product', 'raw', 'finished', 'rawFrom'].forEach(k => { if (t[k] === old) t[k] = name; });
    };
    state.tx.forEach(fix);
    state.deleted.forEach(d => fix(d.tx));
    state.maps.forEach(m => {
      if (m.raw === old) m.raw = name;
      if (m.alias === old) m.alias = name;
      if (m.finished === old) m.finished = name;
      if (m.name === old) m.name = name;
    });
    (state.storageTx || []).forEach(st => { if (st.product === old) st.product = name; });
    save();
    toast('Product updated.', 'ok');
  });
};

window.deleteProduct = i => {
  let n = state.products[i].name, hit = t => [t.product, t.raw, t.finished, t.rawFrom].includes(n);
  if (state.tx.some(hit) || state.deleted.some(d => hit(d.tx)) || state.maps.some(m => m.raw === n || m.alias === n)) {
    return alert('Cannot delete "' + n + '" because it is used in stock entries or a mapping.');
  }
  showModal(`
    <div class="big">🗑</div>
    <h3>Delete product?</h3>
    <p>"${esc(n)}" will be removed from your product list.</p>
    <div class="actions">
      <button class="btn light" data-cancel>Keep it</button>
      <button class="btn danger" data-ok>Delete</button>
    </div>
  `, () => {
    state.products.splice(i, 1);
    logActivity('Product deleted', n);
    save();
    toast('Product deleted.', 'ok');
  });
};

function reportTx() {
  let from = document.getElementById('fromDate').value,
      to = document.getElementById('toDate').value,
      type = document.getElementById('typeFilter').value;
  return state.tx.filter(t => (!from || t.date >= from) && (!to || t.date <= to) && (!type || t.type === type)).slice().reverse();
}

function renderReport() {
  let el = document.getElementById('reportTable');
  if (!el) return;
  el.innerHTML = table(['Date', 'Type', 'Product / movement', 'Quantity', 'Storage Room / Party', 'Destination', 'Reference', 'Notes', 'Entered by', 'Action'],
    reportTx().map(t => [
      esc(t.date),
      typeTag(t.type),
      esc(txName(t)),
      txQty(t),
      esc(t.storageRoom || t.customer || t.source || '—'),
      esc(t.location || '—'),
      esc(t.ref || '—'),
      esc(t.notes || '—'),
      esc(t.createdBy || '—') + (t.updatedBy && t.updatedBy !== t.createdBy ? '<div class="mini">edited: ' + esc(t.updatedBy) + '</div>' : ''),
      delBtn(t)
    ])
  );
}

document.getElementById('applyFilters')?.addEventListener('click', renderReport);

document.getElementById('exportCsv')?.addEventListener('click', () => {
  let rows = [
    ['Date', 'Type', 'Product/movement', 'Quantity', 'Unit', 'Packets Count', 'Storage Room', 'Customer/source', 'Destination', 'Reference', 'Notes', 'Entered by'],
    ...reportTx().map(t => [
      t.date,
      t.type,
      t.type === 'Processing' ? t.raw + ' -> ' + t.finished : t.product,
      t.type === 'Processing' ? t.inputG : (t.u === 'pcs' ? t.grams : +(t.grams / 1000).toFixed(3)),
      t.u === 'pcs' ? 'pcs' : 'kg',
      t.packCount || t.packs || (t.u === 'pcs' ? t.grams : ''),
      t.storageRoom || '',
      t.customer || t.source || '',
      t.location || '',
      t.ref || '',
      t.notes || '',
      t.createdBy || ''
    ])
  ];
  download('laa-fresh-report.csv', '\ufeff' + rows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv');
});

function showCloseNote() {
  let n = document.getElementById('closeNote');
  if (!n) return;
  let d = null;
  try { d = localStorage.getItem('laaLastClose'); } catch (e) {}
  n.textContent = d ? 'Last closing stock downloaded for: ' + d : 'Not downloaded yet. Do this every evening after your last entry.';
}

function closingStock() {
  let d = (document.getElementById('closeDate') || {}).value || dateNow(),
      o = stock(state.tx.filter(t => t.date < d)),
      c = stock(state.tx.filter(t => t.date <= d)),
      inn = {},
      innPacks = {},
      outG = {},
      outPacks = {};

  // Calculate today's inward weight and packets count
  state.tx.filter(t => t.type === 'Inward' && t.date === d).forEach(t => {
    inn[t.product] = (inn[t.product] || 0) + t.grams;
    innPacks[t.product] = (innPacks[t.product] || 0) + (+t.packCount || (t.u === 'pcs' ? t.grams : 0));
  });

  // Calculate today's outward dispatch weight and packets count
  state.tx.filter(t => t.type === 'Outward' && t.date === d).forEach(t => {
    let p = t.rawFrom || t.product;
    outG[p] = (outG[p] || 0) + (t.rawG || t.grams || 0);
    outPacks[p] = (outPacks[p] || 0) + (+t.packs || 0);
  });

  let al = aliasSet();

  // Sheet 1: Closing Stock Summary (including Inward Packets Count)
  let closingHeaders = [
    'Product Name',
    'Unit',
    'Fresh Storage (Room Stock)',
    'Frozen Storage (Room Stock)',
    'Opening Balance',
    'Inward Today (Weight/Qty)',
    'Inward Packets Count',
    'Dispatched Today (Weight/Qty)',
    'Dispatched Packets Count',
    'Closing Balance'
  ];

  let closingRows = [
    ['Laa Fresh Stock Manager - Closing Stock as on ' + d],
    ['Report Date: ' + d, 'Generated: ' + new Date().toLocaleString('en-IN')],
    [],
    closingHeaders
  ];

  state.products.filter(p => !al.has(p.name) || (c[p.name] || 0) !== 0).slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(p => {
    let P = p.unit === 'pcs',
        f = v => P ? Math.round(v || 0) : +((v || 0) / 1000).toFixed(3),
        op = o[p.name] || 0,
        cl = c[p.name] || 0,
        i = inn[p.name] || 0,
        iPacks = innPacks[p.name] || 0,
        disp = (op + i - cl),
        oPacks = outPacks[p.name] || 0;

    let fresh = getStorageStock(p.name, 'Fresh Storage');
    let frozen = getStorageStock(p.name, 'Frozen Storage');

    closingRows.push([
      p.name,
      P ? 'pcs' : 'kg',
      f(fresh),
      f(frozen),
      f(op),
      f(i),
      iPacks > 0 ? iPacks : (P ? f(i) : 0),
      f(disp),
      oPacks > 0 ? oPacks : 0,
      f(cl)
    ]);
  });

  // Sheet 2: Inward Receiving Batches & Packets Log for date d
  let inwBatches = state.tx.filter(t => t.type === 'Inward' && t.date === d);
  let inwardBatchRows = [
    ['Inward Receiving Batches & Packets Detail - ' + d],
    ['Total Inward Batches: ' + inwBatches.length],
    [],
    [
      'Date',
      'Product',
      'Supplier / Vendor',
      'Received Qty',
      'Unit',
      'Packets Count',
      'Entry Mode',
      'Invoice / Ref',
      'Handover Status',
      'Assigned Team',
      'Receiver Person',
      'Notes'
    ]
  ];

  inwBatches.forEach(t => {
    let pcs = t.u === 'pcs';
    inwardBatchRows.push([
      t.date,
      t.product,
      t.source || '—',
      pcs ? t.grams : +(t.grams / 1000).toFixed(3),
      pcs ? 'pcs' : 'kg',
      +t.packCount || (pcs ? t.grams : 0),
      t.mode || 'bulk',
      t.ref || '—',
      t.handoverStatus || 'Pending Handover',
      t.handoverTeam || '—',
      t.handoverPerson || '—',
      t.notes || '—'
    ]);
  });

  // Export as genuine .xlsx Excel workbook if xlsxBlob is available
  if (typeof xlsxBlob === 'function') {
    let blob = xlsxBlob([
      { name: 'Closing Stock', rows: closingRows, bold: new Set([0, 3]) },
      { name: 'Inward & Packets Today', rows: inwardBatchRows, bold: new Set([0, 3]) }
    ]);
    download('laa-fresh-closing-stock-' + d + '.xlsx', blob, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  } else {
    // CSV fallback with both closing summary and inward packet detail
    let csvRows = closingRows.concat([[]], inwardBatchRows);
    download('laa-fresh-closing-stock-' + d + '.csv', '\ufeff' + csvRows.map(r => r.map(v => '"' + String(v ?? '').replace(/"/g, '""') + '"').join(',')).join('\r\n'), 'text/csv');
  }

  try { localStorage.setItem('laaLastClose', d); } catch (e) {}
  showCloseNote();
  toast(`Closing stock for ${d} with Inward Packets Count downloaded.`, 'ok');
}

document.getElementById('closeBtn')?.addEventListener('click', closingStock);
showCloseNote();

function download(name, data, type) {
  logActivity('File downloaded', name);
  let blob = (data instanceof Blob) ? data : new Blob([data], { type: type || 'application/octet-stream' });
  let a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

document.getElementById('backupBtn')?.addEventListener('click', () => {
  download('laa-fresh-backup.json', JSON.stringify(state, null, 2), 'application/json');
});

document.getElementById('restoreFile')?.addEventListener('change', async e => {
  let f = e.target.files[0];
  if (!f) return;
  try {
    let d = JSON.parse(await f.text());
    if (!Array.isArray(d.products) || !Array.isArray(d.tx) || !Array.isArray(d.maps)) throw Error();
    if (confirm('Replace current app data with this backup?')) {
      if (!Array.isArray(d.deleted)) d.deleted = [];
      d.maps.forEach(m => { if (!m.alias) m.alias = m.finished || m.name; });
      if (d.catalogV !== 3) migrateCatalog(d);
      if (!d.pcsFix) fixPcs(d);
      ensureSuppliers(d);
      ensureCustomers(d);
      ensureStorage(d);
      state = d;
      logActivity('Backup restored', 'From file ' + f.name);
      save();
      alert('Backup restored.');
    }
  } catch (err) {
    alert('That backup file is not valid for this app.');
  }
  e.target.value = '';
});

document.getElementById('clearBtn')?.addEventListener('click', () => {
  if (confirm('This deletes saved products, mappings and transactions from this browser. Download a backup first. Continue?')) {
    logActivity('All app data cleared', 'Products, mappings and transactions reset');
    state = {
      products: catalogList(),
      tx: [],
      maps: [],
      deleted: [],
      catalogV: 3,
      pcsFix: true,
      suppliers: SUPPLIERS.slice(),
      customers: [],
      storageTx: []
    };
    save();
    alert('App data cleared.');
  }
});

/* ================= TRANSACTION EDIT / DELETE / RESTORE ================= */

window.editTx = id => {
  let t = state.tx.find(x => String(x.id) === String(id));
  if (!t) return;
  if (!['Inward', 'Outward'].includes(t.type)) return toast('Only inward and outward stock entries can be edited here.', 'err');
  let pcs = t.u === 'pcs' || isPcs(t.product), qty = pcs ? (+t.grams || 0) : (+t.grams || 0) / 1000;

  showModal(`
    <div class="big">✏️</div>
    <h3>Edit ${t.type === 'Inward' ? 'inward stock' : 'outward dispatch'}</h3>
    <p class="mini">Saving updates the original stock movement and recalculates the current stock balance.</p>
    <div class="formgrid" style="margin:14px 0">
      <div class="field"><label>Date</label><input id="etDate" type="date" value="${esc(t.date || dateNow())}"></div>
      <div class="field"><label>Product</label><select id="etProduct">${state.products.map(p => `<option value="${esc(p.name)}"${p.name === t.product ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Quantity (${pcs ? 'pieces' : 'kg'})</label><input id="etQty" type="number" min="0.001" step="${pcs ? '1' : '0.001'}" value="${pcs ? Math.round(qty) : qty.toFixed(3)}"></div>
      <div class="field"><label>${t.type === 'Inward' ? 'Supplier' : 'Customer / company'}</label><input id="etParty" value="${esc(t.type === 'Inward' ? (t.source || '') : (t.customer || ''))}"></div>
      ${t.type === 'Outward' ? `
        <div class="field"><label>Storage Room</label><select id="etRoom"><option value="Fresh Storage"${t.storageRoom === 'Fresh Storage' ? ' selected' : ''}>Fresh Storage</option><option value="Frozen Storage"${t.storageRoom === 'Frozen Storage' ? ' selected' : ''}>Frozen Storage</option></select></div>
        <div class="field"><label>Destination</label><input id="etLocation" value="${esc(t.location || '')}"></div>
      ` : ''}
      <div class="field"><label>Reference</label><input id="etRef" value="${esc(t.ref || '')}"></div>
      <div class="field full"><label>Notes</label><input id="etNotes" value="${esc(t.notes || '')}"></div>
    </div>
    <div class="actions">
      <button class="btn light" data-cancel>Cancel</button>
      <button class="btn" data-ok>✓ Save changes</button>
    </div>
  `, () => {
    let old = { ...t }, p = $('etProduct').value, q = +$('etQty').value, date = $('etDate').value;
    if (!date || !p || q <= 0) {
      Object.assign(t, old);
      return toast('Enter a valid date, product and quantity.', 'err');
    }
    let P = isPcs(p), g = P ? Math.round(q) : Math.round(q * 1000);
    t.date = date;
    t.product = p;
    t.grams = g;
    if (P) t.u = 'pcs'; else delete t.u;
    if (t.type === 'Inward') {
      t.source = $('etParty').value.trim();
      t.packCount = 0;
      t.mode = 'bulk';
    } else {
      t.customer = $('etParty').value.trim();
      t.location = $('etLocation')?.value.trim() || '';
      t.storageRoom = $('etRoom')?.value || 'Fresh Storage';
      let m = mapOf(p);
      if (m) {
        t.rawFrom = m.raw;
        t.rawG = g;
        t.ownG = 0;
      } else {
        delete t.rawFrom;
        delete t.rawG;
        delete t.ownG;
      }
    }
    t.ref = $('etRef').value.trim();
    t.notes = $('etNotes').value.trim();
    stampRecord(t);
    logActivity('Stock entry edited', `${t.type} · ${t.product} · ${fmtQty(t.grams, t.u === 'pcs')} · ${t.date}`);
    let neg = negatives(state.tx);
    save();
    toast(neg.length ? 'Entry updated. Some stock is now below zero; please review.' : 'Entry updated and stock recalculated.', 'ok');
  });
};

function delBtn(t) {
  return `<div class="actions"><button class="icon-btn" onclick="editTx('${t.id}')" title="Edit this entry">✏️ Edit</button><button class="icon-btn" onclick="askDelete('${t.id}')" title="Delete this entry">🗑 Delete</button></div>`;
}

function closeModal() {
  document.getElementById('modal').classList.remove('show');
  document.getElementById('dialog')?.classList.remove('wide');
}

function showModal(html, onOk) {
  let d = document.getElementById('dialog');
  d.innerHTML = html;
  document.getElementById('modal').classList.add('show');
  let ok = d.querySelector('[data-ok]'), no = d.querySelector('[data-cancel]');
  if (ok) ok.onclick = () => { closeModal(); onOk && onOk(); };
  if (no) no.onclick = closeModal;
}

document.getElementById('modal')?.addEventListener('click', e => {
  if (e.target.id === 'modal') closeModal();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

function negatives(list) {
  let s = stock(list);
  return Object.keys(s).filter(k => s[k] < 0).map(k => ({ name: k, g: s[k] }));
}

function describe(t) {
  let rows = [
    `<b>Type:</b> ${t.type}`,
    `<b>Date:</b> ${esc(t.date)}`,
    `<b>Product:</b> ${esc(txName(t))}`,
    `<b>Quantity:</b> ${txQty(t)}` + (t.type === 'Processing' ? ` → output ${fmtG(t.outputG)}` : '')
  ];
  if (t.storageRoom) rows.push(`<b>Storage Room:</b> ${esc(t.storageRoom)}`);
  if (t.customer) rows.push(`<b>Customer:</b> ${esc(t.customer)} · ${esc(t.location || '')}`);
  if (t.source) rows.push(`<b>Source:</b> ${esc(t.source)}`);
  if (t.ref) rows.push(`<b>Reference:</b> ${esc(t.ref)}`);
  return rows.join('<br>');
}

function effect(t) {
  if (t.type === 'Inward') return `${fmtQty(t.grams, t.u === 'pcs')} will be <b>removed</b> from ${esc(t.product)}.`;
  if (t.type === 'Outward' && t.rawFrom) return `${fmtG(t.rawG)} will be <b>added back</b> to ${esc(t.rawFrom)}` + (t.ownG ? ` and ${fmtG(t.ownG)} to ${esc(t.product)}` : '') + '.';
  if (t.type === 'Outward') return `${fmtQty(t.grams, t.u === 'pcs')} will be <b>added back</b> to ${esc(t.product)}.`;
  return `${fmtG(t.inputG)} will be added back to ${esc(t.raw)} and ${fmtG(t.outputG)} removed from ${esc(t.finished)}.`;
}

window.askDelete = id => {
  let i = state.tx.findIndex(t => String(t.id) === String(id));
  if (i < 0) return;
  let t = state.tx[i];
  let before = negatives(state.tx).map(x => x.name),
      after = negatives(state.tx.filter((_, j) => j !== i)).filter(x => !before.includes(x.name));

  let warn = after.length
    ? `<div class="warn">⚠️ After deleting, <b>${after.map(x => esc(x.name) + ' (' + fmtQty(x.g, isPcs(x.name)) + ')').join(', ')}</b> will go below zero because other entries depend on this one. You can still delete and fix those entries too, or press Restore from the bin anytime.</div>`
    : '';

  showModal(`
    <div class="big">🗑</div>
    <h3>Delete this entry?</h3>
    <p>${effect(t)} It goes to the <b>Recently deleted</b> bin, so you can restore it if this was a mistake.</p>
    <div class="detail">${describe(t)}</div>
    ${warn}
    <div class="actions">
      <button class="btn light" data-cancel>Keep it</button>
      <button class="btn danger" data-ok>Yes, delete</button>
    </div>
  `, () => doDelete(t.id));
};

function doDelete(id) {
  let i = state.tx.findIndex(t => String(t.id) === String(id));
  if (i < 0) return;
  let t = state.tx.splice(i, 1)[0];
  state.deleted.push({ tx: t, idx: i, at: new Date().toISOString() });
  logActivity('Stock entry deleted', `${t.type} · ${t.product || t.finished || ''} · ${t.date}`);
  save();
  toast('Entry deleted. Stock corrected.', 'ok', {
    label: '↩ Undo',
    fn: () => restoreTx(t.id, true)
  });
}

window.restoreTx = (id, quiet) => {
  let i = state.deleted.findIndex(d => String(d.tx.id) === String(id));
  if (i < 0) return;
  let d = state.deleted.splice(i, 1)[0];
  state.tx.splice(Math.min(d.idx, state.tx.length), 0, d.tx);
  logActivity('Stock entry restored', `${d.tx.type} · ${d.tx.product || d.tx.finished || ''} · ${d.tx.date}`);
  let neg = negatives(state.tx);
  save();
  toast(neg.length ? 'Entry restored, but some stock is now below zero. Please review.' : 'Entry restored. Stock updated.', neg.length ? 'err' : 'ok');
};

window.purgeTx = id => showModal(`
  <div class="big">⚠️</div>
  <h3>Delete forever?</h3>
  <p>This entry will be permanently removed and cannot be restored.</p>
  <div class="actions">
    <button class="btn light" data-cancel>Cancel</button>
    <button class="btn danger" data-ok>Delete forever</button>
  </div>
`, () => {
  let d = state.deleted.find(d => String(d.tx.id) === String(id));
  state.deleted = state.deleted.filter(d => String(d.tx.id) !== String(id));
  logActivity('Stock entry permanently deleted', d ? d.tx.type + ' · ' + (d.tx.product || d.tx.finished || '') + ' · ' + d.tx.date : '');
  save();
  toast('Permanently deleted.', 'ok');
});

document.getElementById('emptyBin')?.addEventListener('click', () => {
  if (!state.deleted.length) return toast('The bin is already empty.');
  showModal(`
    <div class="big">⚠️</div>
    <h3>Empty the bin?</h3>
    <p>All ${state.deleted.length} deleted entries will be removed permanently.</p>
    <div class="actions">
      <button class="btn light" data-cancel>Cancel</button>
      <button class="btn danger" data-ok>Empty bin</button>
    </div>
  `, () => {
    logActivity('Bin emptied', state.deleted.length + ' entries permanently removed');
    state.deleted = [];
    save();
    toast('Bin emptied.', 'ok');
  });
});

function renderBin() {
  let el = document.getElementById('binTable');
  if (!el) return;
  document.getElementById('binCount').textContent = state.deleted.length;
  if (!state.deleted.length) {
    el.innerHTML = '<div class="empty">Nothing here. Deleted entries will appear in this bin.</div>';
    return;
  }
  el.innerHTML = table(['Date', 'Type', 'Product / movement', 'Quantity', 'Deleted on', 'Action'],
    state.deleted.slice().reverse().map(d => {
      let t = d.tx;
      return [
        esc(t.date),
        typeTag(t.type),
        esc(txName(t)),
        txQty(t),
        new Date(d.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
        `<div class="actions">
          <button class="icon-btn ok" onclick="restoreTx('${t.id}')">↩ Restore</button>
          <button class="icon-btn" onclick="purgeTx('${t.id}')">✕ Forever</button>
        </div>`
      ];
    })
  );
}

buildChips('inChips', () => document.getElementById('inwardForm').packSize, () => syncInPcs('size'));
buildChips('outChips', () => document.getElementById('outwardForm').packSize, syncOutPack);

/* ================= BOOTSTRAP INITIALIZATION ================= */

function initApp() {
  setupDates();
  vInit();
  let inF = document.getElementById('inwardForm');
  if (inF && inF.date) inF.date.value = dateNow();
  let outF = document.getElementById('outwardForm');
  if (outF && outF.date) outF.date.value = dateNow();
  setInMode();
  renderAll();
  renderStorageUI();
  if (typeof renderCloudPill === 'function') renderCloudPill();
  if (typeof cloudPull === 'function') cloudPull(true);
  authInit();
}

window.addEventListener('DOMContentLoaded', initApp);
