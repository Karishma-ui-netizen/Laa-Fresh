/**
 * Laa Fresh Stock Manager - Operations & Storage Room Engine
 * Handles:
 * 1. Inward Stock Receiving & Staging
 * 2. Operations Team Handover (Fresh Team vs Frozen Team + Person Name & kg/packets)
 * 3. Moving Stock from Operations into Storage Rooms (Fresh Storage vs Frozen Storage)
 * 4. Option to Add Existing Storage (Direct Opening Balances / Audit Counts)
 * 5. Outward Dispatch validation & deduction from specific Storage Rooms
 */

const STORAGE_ROOMS = ['Fresh Storage', 'Frozen Storage'];
const OP_TEAMS = ['Fresh Team', 'Frozen Team'];
const DEFAULT_HANDLERS = ['Ramesh', 'Imran', 'Suresh', 'Karthik', 'Praveen', 'Rajesh', 'Vignesh', 'Manoj'];

function ensureStorage(s) {
  if (!Array.isArray(s.storageTx)) s.storageTx = [];
  if (!Array.isArray(s.handlers)) s.handlers = DEFAULT_HANDLERS.slice();
}

/**
 * Calculate available stock in a specific storage room for a given product.
 * Returns amount in grams for weight items, or pieces count for pcs items.
 */
function getStorageStock(prodName, room, txList) {
  ensureStorage(state);
  let p = packFor(prodName), pcs = isPcs(prodName);
  let total = 0;

  // 1. Explicit storage transactions
  (state.storageTx || []).forEach(st => {
    let amt = pcs ? (Number(st.packs || st.grams) || 0) : (Number(st.grams) || 0);

    // Direct movement to / from storage room
    if (st.product === prodName && st.storageRoom === room) {
      if (st.type === 'to_storage' || st.type === 'existing_storage' || st.type === 'transfer_in') {
        total += amt;
      } else if (st.type === 'storage_dispatch' || st.type === 'transfer_out') {
        total -= amt;
      }
    }

    // Processed output placed directly into this room
    if (st.type === 'process_conversion' && st.outProduct === prodName && st.storageRoom === room) {
      let outAmt = pcs ? (Number(st.outPacks || st.outGrams) || 0) : (Number(st.outGrams) || 0);
      total += outAmt;
    }

    // If raw stock was taken from a storage room during processing
    if (st.type === 'process_conversion' && st.rawProduct === prodName && st.fromRoom === room) {
      let rawAmt = pcs ? (Number(st.rawPacks || st.rawGrams) || 0) : (Number(st.rawGrams) || 0);
      total -= rawAmt;
    }
  });

  // Outward stock strictly depends ONLY on what was moved into the storage room.
  // It does not depend on un-moved dock inward stock or un-mapped operation stock.
  return total;
}

/**
 * Calculate stock currently in-hand with an Operations Team (Fresh or Frozen).
 */
function getTeamInHand(prodName, team) {
  ensureStorage(state);
  let pcs = isPcs(prodName), total = 0;
  (state.storageTx || []).forEach(st => {
    if (st.team !== team) return;
    let amt = pcs ? (Number(st.packs || st.grams) || 0) : (Number(st.grams) || 0);

    if (st.product === prodName) {
      if (st.type === 'handover') {
        total += amt;
      } else if (st.type === 'to_storage') {
        total -= amt;
      }
    }

    // Deduct raw stock consumed during processing/cutting
    if (st.type === 'process_conversion' && st.rawProduct === prodName) {
      let rawAmt = pcs ? (Number(st.rawPacks || st.rawGrams) || 0) : (Number(st.rawGrams) || 0);
      total -= rawAmt;
    }
  });
  return Math.max(0, total);
}

/**
 * Returns available in-hand stock for a specific person, product and team.
 */
function getPersonProductInHand(person, prodName, team) {
  ensureStorage(state);
  let pcs = isPcs(prodName), total = 0;
  let pNorm = (person || '').trim().toLowerCase();
  (state.storageTx || []).forEach(st => {
    let stPerson = (st.person || '').trim().toLowerCase();
    if (person && stPerson !== pNorm) return;
    if (team && st.team !== team) return;
    let amt = pcs ? (Number(st.packs || st.grams) || 0) : (Number(st.grams) || 0);

    if (st.product === prodName) {
      if (st.type === 'handover') {
        total += amt;
      } else if (st.type === 'to_storage') {
        total -= amt;
      }
    }

    if (st.type === 'process_conversion' && st.rawProduct === prodName) {
      let rawAmt = pcs ? (Number(st.rawPacks || st.rawGrams) || 0) : (Number(st.rawGrams) || 0);
      total -= rawAmt;
    }
  });
  return Math.max(0, total);
}

/**
 * Returns all active in-hand allocations grouped by handler person, product and team.
 */
function getInHandAllocations() {
  ensureStorage(state);
  let map = new Map();
  (state.storageTx || []).forEach(st => {
    let person = (st.person || '').trim();
    let team = st.team || 'Fresh Team';
    let prod = st.product || st.rawProduct;
    if (!person || !prod) return;
    let key = `${person}__${prod}__${team}`;
    if (!map.has(key)) {
      map.set(key, {
        person,
        product: prod,
        team,
        latestDate: st.date || dateNow(),
        packWeightKg: st.packWeightKg || (st.grams && st.packs ? +(st.grams / (st.packs * 1000)).toFixed(3) : 0.5),
        packs: st.packs || 0,
        unitMode: st.unitMode || 'kg'
      });
    } else {
      let o = map.get(key);
      if (st.date && st.date >= o.latestDate) {
        o.latestDate = st.date;
        if (st.packWeightKg) o.packWeightKg = st.packWeightKg;
        if (st.packs) o.packs = st.packs;
        if (st.unitMode) o.unitMode = st.unitMode;
      }
    }
  });

  let allocations = [];
  map.forEach(meta => {
    let qty = getPersonProductInHand(meta.person, meta.product, meta.team);
    if (qty > 0) {
      let pcs = isPcs(meta.product);
      allocations.push({
        person: meta.person,
        product: meta.product,
        team: meta.team,
        date: meta.latestDate,
        qty: qty,
        isPcs: pcs,
        packWeightKg: meta.packWeightKg || 0.5,
        packs: meta.packs || (meta.packWeightKg ? Math.round((qty / 1000) / meta.packWeightKg) : 0),
        unitMode: meta.unitMode
      });
    }
  });
  return allocations.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}

/**
 * Returns summary of all storage balances across rooms and operations teams.
 */
function storageSummary() {
  ensureStorage(state);
  let al = aliasSet();
  let items = state.products.filter(p => !al.has(p.name));
  let freshTotG = 0, frozenTotG = 0, teamTotG = 0;
  let rows = [];

  items.forEach(p => {
    let fresh = getStorageStock(p.name, 'Fresh Storage');
    let frozen = getStorageStock(p.name, 'Frozen Storage');
    let freshTeam = getTeamInHand(p.name, 'Fresh Team');
    let frozenTeam = getTeamInHand(p.name, 'Frozen Team');
    let team = freshTeam + frozenTeam;
    let total = fresh + frozen + team;

    if (!p.unit || p.unit !== 'pcs') {
      freshTotG += Math.max(0, fresh);
      frozenTotG += Math.max(0, frozen);
      teamTotG += Math.max(0, team);
    }

    rows.push({
      product: p.name,
      isPcs: p.unit === 'pcs',
      fresh,
      frozen,
      freshTeam,
      frozenTeam,
      team,
      total
    });
  });

  return { freshTotG, frozenTotG, teamTotG, rows };
}

/**
 * Add / Record Existing Storage Stock directly into Fresh or Frozen room
 */
function addExistingStorageStock(data) {
  ensureStorage(state);
  let p = ensureProduct(data.product);
  let pcs = isPcs(p);
  let grams = pcs ? Math.round(Number(data.qty) || 0) : gramsVal(data.qty, data.unit || 'kg');
  if (grams <= 0) return toast('Please enter a valid quantity greater than zero.', 'err');

  let entry = {
    id: 'st_' + Date.now() + Math.random().toString(36).slice(2, 6),
    type: 'existing_storage',
    date: data.date || dateNow(),
    product: p,
    storageRoom: data.storageRoom || 'Fresh Storage',
    location: (data.location || '').trim(),
    grams: grams,
    packs: pcs ? grams : (Number(data.packs) || 0),
    u: pcs ? 'pcs' : 'kg',
    person: (data.person || curBy() || 'Staff').trim(),
    notes: (data.notes || 'Existing stock opening balance').trim(),
    createdAt: new Date().toISOString(),
    createdBy: curBy()
  };

  state.storageTx.push(entry);
  rememberHandler(entry.person);

  // Also sync with core inventory state.tx as an opening balance record so dashboard reflects it
  txAdd({
    type: 'Inward',
    date: entry.date,
    product: p,
    grams: grams,
    packCount: entry.packs,
    u: pcs ? 'pcs' : undefined,
    mode: 'bulk',
    source: 'Existing Storage (' + entry.storageRoom + ')',
    ref: entry.location ? 'Loc: ' + entry.location : 'Opening Stock',
    notes: entry.notes + ' · Added by ' + entry.person,
    storageRoom: entry.storageRoom
  });

  logActivity('Existing storage stock added', `${entry.storageRoom} · ${p} · ${fmtQty(grams, pcs)} · Stored by ${entry.person}`);
  save();
  renderOperationsUI();
  renderStorageUI();
  renderAll();
  toast(`Added ${fmtQty(grams, pcs)} of ${p} to ${entry.storageRoom}.`, 'ok');
}

/**
 * Handover Inward stock to Operations Team (Fresh or Frozen)
 */
function handoverToOperations(data) {
  ensureStorage(state);
  let p = data.product;
  let pcs = isPcs(p);
  let grams = pcs ? Math.round(Number(data.qty) || 0) : gramsVal(data.qty, data.unit || 'kg');
  if (!p) return toast('Please select a product.', 'err');
  if (grams <= 0) return toast('Please enter a valid handover quantity.', 'err');
  if (!data.person || !data.person.trim()) return toast('Please enter the name of the person receiving the stock.', 'err');

  let entry = {
    id: 'ho_' + Date.now() + Math.random().toString(36).slice(2, 6),
    type: 'handover',
    date: data.date || dateNow(),
    inwardId: data.inwardId || null,
    product: p,
    team: data.team || 'Fresh Team',
    person: data.person.trim(),
    grams: grams,
    packs: pcs ? grams : (Number(data.packs) || 0),
    packWeightKg: Number(data.packWeightKg) || 0.5,
    unitMode: data.unitMode || 'kg',
    u: pcs ? 'pcs' : 'kg',
    notes: (data.notes || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: curBy()
  };

  state.storageTx.push(entry);
  rememberHandler(entry.person);

  // Update inward transaction note/tag if tied to an inward batch
  if (data.inwardId) {
    let t = state.tx.find(x => String(x.id) === String(data.inwardId));
    if (t) {
      t.handoverStatus = 'Handed over';
      t.handoverTeam = entry.team;
      t.handoverPerson = entry.person;
      t.handoverQty = grams;
      stampRecord(t);
    }
  }

  logActivity('Operations handover', `Inward → ${entry.team} (${entry.person}) · ${p} · ${fmtQty(grams, pcs)}`);
  save();
  renderOperationsUI();
  renderStorageUI();
  renderInwardHandoverQueue();
  renderAll();
  toast(`Stock handed over to ${entry.person} (${entry.team}).`, 'ok');
}

/**
 * Operations Team moves stock into Storage Room (Fresh or Frozen Room)
 */
function moveTeamToStorage(data) {
  ensureStorage(state);
  let p = data.product;
  let pcs = isPcs(p);
  let grams = pcs ? Math.round(Number(data.qty) || 0) : gramsVal(data.qty, data.unit || 'kg');
  if (!p) return toast('Please select a product.', 'err');
  if (grams <= 0) return toast('Please enter a valid quantity.', 'err');

  let team = data.team || (data.storageRoom === 'Frozen Storage' ? 'Frozen Team' : 'Fresh Team');
  let inHand = getTeamInHand(p, team);

  if (inHand < grams) {
    return toast(`Cannot move ${fmtQty(grams, pcs)}. ${team} only has ${fmtQty(inHand, pcs)} in hand.`, 'err');
  }

  let entry = {
    id: 'ms_' + Date.now() + Math.random().toString(36).slice(2, 6),
    type: 'to_storage',
    date: data.date || dateNow(),
    product: p,
    team: team,
    storageRoom: data.storageRoom || 'Fresh Storage',
    location: (data.location || '').trim(),
    person: (data.person || curBy() || 'Staff').trim(),
    grams: grams,
    packs: pcs ? grams : (Number(data.packs) || 0),
    u: pcs ? 'pcs' : 'kg',
    notes: (data.notes || '').trim(),
    createdAt: new Date().toISOString(),
    createdBy: curBy()
  };

  state.storageTx.push(entry);
  rememberHandler(entry.person);

  logActivity('Moved to storage room', `${team} → ${entry.storageRoom} · ${p} · ${fmtQty(grams, pcs)} (${entry.location || 'Room'}) by ${entry.person}`);
  save();
  renderOperationsUI();
  renderStorageUI();
  renderAll();
  toast(`Moved ${fmtQty(grams, pcs)} of ${p} to ${entry.storageRoom}.`, 'ok');
}

/**
 * Records storage room deduction when outward dispatch takes place.
 */
function recordStorageDispatch(tx) {
  ensureStorage(state);
  let room = tx.storageRoom || (/frozen/i.test(tx.product) ? 'Frozen Storage' : 'Fresh Storage');
  let p = tx.rawFrom || tx.product;
  let pcs = tx.u === 'pcs' || isPcs(p);
  let grams = pcs ? (Number(tx.grams) || 0) : (Number(tx.rawG || tx.grams) || 0);

  let entry = {
    id: 'sd_' + Date.now() + Math.random().toString(36).slice(2, 6),
    type: 'storage_dispatch',
    outwardId: tx.id,
    date: tx.date || dateNow(),
    product: p,
    storageRoom: room,
    customer: tx.customer || '',
    grams: grams,
    packs: tx.packs || 0,
    u: pcs ? 'pcs' : 'kg',
    createdAt: new Date().toISOString(),
    createdBy: curBy()
  };

  state.storageTx.push(entry);
}

function rememberHandler(name) {
  if (!name || typeof name !== 'string') return;
  name = name.trim();
  if (name.length < 2) return;
  ensureStorage(state);
  if (!state.handlers.some(h => h.toLowerCase() === name.toLowerCase())) {
    state.handlers.push(name);
  }
}

function gramsVal(q, u) {
  let n = Number(q) || 0;
  return Math.round(n * (u === 'g' ? 1 : 1000));
}

/* ================= UI RENDERING FOR OPERATION TEAM & STORAGE ROOM ================= */

/**
 * Render the dedicated Operation Team panel (Processing, Mapping & Utilization)
 */
function renderOperationsUI() {
  ensureStorage(state);
  let panel = document.getElementById('operations');
  if (!panel) return;

  let al = aliasSet();
  let plain = state.products.filter(p => !al.has(p.name));

  // Role banner for Operation Team members
  let greetEl = document.getElementById('opRoleGreeting');
  if (greetEl) {
    if (isOpRole()) {
      greetEl.style.display = 'block';
      greetEl.innerHTML = `
        <div style="background:#f0f9ff;border:1.5px solid #bae6fd;padding:12px 18px;border-radius:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="margin:0 0 3px;font-size:16px;color:#0284c7">👋 Hello, ${esc(AUTH.cur.name)} (Operation Team)</h3>
            <p class="mini" style="margin:0;color:#0369a1">Here is the stock assigned to you. Map what it was used for, confirm packets and packet weight, verify cutting wastage &amp; reasons, and move directly to Cold Storage.</p>
          </div>
          <span class="rtag op">Operation Team Active</span>
        </div>
      `;
    } else {
      greetEl.style.display = 'none';
      greetEl.innerHTML = '';
    }
  }

  // Populate Handler Filter for Admin
  let hSel = document.getElementById('opHandlerFilter');
  if (hSel) {
    let curVal = hSel.value;
    let handlers = [...new Set((state.storageTx || []).map(st => st.person).filter(Boolean))].sort();
    hSel.innerHTML = '<option value="">All Handlers / Persons</option>' + handlers.map(h => `<option value="${esc(h)}"${h === curVal ? ' selected' : ''}>👤 ${esc(h)}</option>`).join('');
  }

  // 1. Calculate Operations Utilization & Reconciliation
  let totalInwardGivenG = 0;
  (state.storageTx || []).forEach(st => {
    if (st.type === 'handover') {
      totalInwardGivenG += (Number(st.grams) || 0);
    }
  });

  let totalConvertedG = 0;
  let totalConvertedPacks = 0;
  let totalWastageG = 0;
  let conversions = (state.storageTx || []).filter(st => st.type === 'process_conversion');

  conversions.forEach(st => {
    totalConvertedG += (Number(st.outGrams) || 0);
    totalConvertedPacks += (Number(st.outPacks) || 0);
    totalWastageG += (Number(st.wasteGrams) || 0);
  });

  let inHandG = 0;
  plain.forEach(p => {
    inHandG += getTeamInHand(p.name, 'Fresh Team') + getTeamInHand(p.name, 'Frozen Team');
  });

  let yieldPct = totalInwardGivenG > 0 ? (totalConvertedG / totalInwardGivenG) * 100 : (conversions.length ? (totalConvertedG / (totalConvertedG + totalWastageG)) * 100 : 100);
  let wastePct = totalInwardGivenG > 0 ? (totalWastageG / totalInwardGivenG) * 100 : (conversions.length ? (totalWastageG / (totalConvertedG + totalWastageG)) * 100 : 0);

  // Render KPI Cards
  let cardsEl = document.getElementById('opOverviewCards');
  if (cardsEl) {
    cardsEl.innerHTML = [
      {
        title: 'Total Inward Given to Operations',
        val: fmtG(totalInwardGivenG),
        sub: 'Raw meat assigned from receiving dock',
        ico: '📥',
        border: 'in-border'
      },
      {
        title: 'Total Meat Converted &amp; Produced',
        val: fmtG(totalConvertedG),
        sub: totalConvertedPacks > 0 ? `${totalConvertedPacks} packets packed &amp; stored` : 'Finished cuts moved to storage',
        ico: '🥩',
        border: 'cut-border'
      },
      {
        title: 'Cutting Wastage &amp; Trimmings',
        val: fmtG(totalWastageG),
        sub: `${wastePct.toFixed(1)}% cutting loss with reasons`,
        ico: '✂️',
        border: 'waste-border'
      },
      {
        title: 'Raw Meat Remaining In Hand',
        val: fmtG(inHandG),
        sub: inHandG > 0 ? 'Stock currently being cut/mapped' : 'All handed-over stock converted',
        ico: '👥',
        border: 'hand-border'
      },
      {
        title: 'Meat Utilization Rate',
        val: `${yieldPct.toFixed(1)}%`,
        sub: 'Overall conversion efficiency',
        ico: '📊',
        border: 'util-border'
      }
    ].map(c => `
      <div class="card room-card op-card ${c.border}">
        <div class="ico">${c.ico}</div>
        <div class="label">${c.title}</div>
        <div class="num">${c.val}</div>
        <small>${c.sub}</small>
      </div>
    `).join('');
  }

  // Render Box 1: Raw Meat In Hand
  renderOpInHandTable();

  // Render Box 2: Meat Mapping & Utilization Ledger
  renderOpMappingLedgerTable();

  // Render Box 3: Inward Handover History
  renderHandoverHistoryTable();

  // Fill dropdowns
  fillStorageSelects();
}

/**
 * Render Raw Meat In Hand with Operation Team
 */
function renderOpInHandTable() {
  let el = document.getElementById('opInHandTable');
  if (!el) return;
  let filterTeam = document.getElementById('opTeamFilter')?.value || '';
  let filterDate = document.getElementById('opDateFilter')?.value || '';
  let filterHandler = document.getElementById('opHandlerFilter')?.value || '';

  let allocations = getInHandAllocations();

  // If logged in as an Operation Team user, show ONLY their assigned stock
  if (isOpRole()) {
    let myName = (AUTH.cur.name || '').toLowerCase().trim();
    let myUser = (AUTH.cur.username || '').toLowerCase().trim();
    allocations = allocations.filter(a => {
      let p = (a.person || '').toLowerCase().trim();
      return p === myName || p === myUser || p.includes(myUser) || myName.includes(p);
    });
  } else if (filterHandler) {
    allocations = allocations.filter(a => a.person.toLowerCase() === filterHandler.toLowerCase());
  }

  if (filterTeam) {
    allocations = allocations.filter(a => a.team === filterTeam);
  }

  if (filterDate) {
    allocations = allocations.filter(a => a.date === filterDate);
  }

  el.innerHTML = allocations.length ? table(
    ['Handover Date', 'Assigned Team', 'Receiver Person (Handler)', 'Raw Meat Product', 'In-Hand Quantity', 'Packets &amp; Packet Weight', 'Utilization Status', 'Action'],
    allocations.map(r => {
      let packInfo = r.packs > 0 ? `<strong>${r.packs}</strong> pkts <span class="mini">(${r.packWeightKg || 0.5} kg/pkt)</span>` : '<span class="mini">—</span>';
      return [
        esc(r.date),
        `<span class="tag ${r.team === 'Frozen Team' ? 'frozen' : 'fresh'}">${esc(r.team)}</span>`,
        `<strong>${esc(r.person)}</strong>`,
        prodTag(r.product),
        `<span class="tag in" style="font-size:12px;font-weight:750">${fmtQty(r.qty, r.isPcs)}</span>`,
        packInfo,
        `<span class="tag bad">Waiting for Mapping</span>`,
        `<button class="btn sm" type="button" onclick="openProcessModal('${esc(r.product)}', '${esc(r.team)}', '${esc(r.person)}', '${r.isPcs ? r.qty : (r.qty / 1000).toFixed(3)}', '${r.packWeightKg || 0.5}')">Map Usage &amp; Move</button>`
      ];
    })
  ) : `<div class="empty">${isOpRole() ? 'No raw meat currently assigned to you waiting for mapping. Check date filter above or ask manager for handover.' : 'No raw meat currently waiting in hand. All handed-over meat has been mapped and moved to storage, or handover inward stock above.'}</div>`;
}

/**
 * Render Meat Mapping & Utilization Ledger (What They Used It For)
 */
function renderOpMappingLedgerTable() {
  let el = document.getElementById('opMappingLedgerTable');
  if (!el) return;
  let q = (document.getElementById('opLedgerSearch')?.value || '').toLowerCase();
  let list = (state.storageTx || []).filter(st => st.type === 'process_conversion').slice().reverse();

  if (isOpRole()) {
    let myName = (AUTH.cur.name || '').toLowerCase().trim();
    let myUser = (AUTH.cur.username || '').toLowerCase().trim();
    list = list.filter(st => {
      let p = (st.person || '').toLowerCase().trim();
      return p === myName || p === myUser || p.includes(myUser) || myName.includes(p);
    });
  }

  if (q) {
    list = list.filter(st =>
      (st.rawProduct || '').toLowerCase().includes(q) ||
      (st.outProduct || '').toLowerCase().includes(q) ||
      (st.person || '').toLowerCase().includes(q) ||
      (st.team || '').toLowerCase().includes(q) ||
      (st.wasteReason || '').toLowerCase().includes(q)
    );
  }

  el.innerHTML = list.length ? table(
    [
      'Date & Time',
      'Assigned Handler & Team',
      'Inward Raw Meat Given',
      'Meat Mapping: What It Was Used For',
      'Converted Weight (kg)',
      'Converted Packets Count',
      'Single Packet Weight',
      'Cutting Wastage & Loss',
      'Wastage Reason',
      'Cold Storage Room Stored In',
      'Status'
    ],
    list.map(st => {
      let rawTxt = fmtQty(st.rawGrams, st.rawUnit === 'packets');
      let outTxt = fmtQty(st.outGrams, st.outUnit === 'packets');
      let pktsTxt = st.outPacks > 0 ? `<strong>${st.outPacks}</strong> pkts` : '<span class="mini">—</span>';
      let singleWeightTxt = st.singlePackWeight ? `${st.singlePackWeight} kg` : (st.outPacks > 0 ? `${(st.outGrams / (st.outPacks * 1000)).toFixed(3)} kg` : '<span class="mini">—</span>');
      let wasteTxt = `<span class="tag waste">Loss: ${fmtG(st.wasteGrams)} (${(st.wastePct || 0).toFixed(1)}%)</span>`;
      let roomTag = `<span class="tag ${st.storageRoom === 'Frozen Storage' ? 'frozen' : 'fresh'}">${esc(st.storageRoom)}</span>` + (st.location ? `<div class="mini">Loc: ${esc(st.location)}</div>` : '');

      return [
        `<span class="mini">${st.createdAt ? new Date(st.createdAt).toLocaleString('en-IN') : st.date}</span>`,
        `<strong>${esc(st.person || 'Staff')}</strong><br><span class="tag ${st.team === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(st.team)}</span>`,
        `${prodTag(st.rawProduct)}<br><span class="tag in sm">${rawTxt}</span>`,
        `${prodTag(st.outProduct)}`,
        `<strong>${outTxt}</strong>`,
        pktsTxt,
        singleWeightTxt,
        wasteTxt,
        `<strong>${esc(st.wasteReason || 'Cutting loss')}</strong>`,
        roomTag,
        `<span class="tag good">Moved to Storage</span>`
      ];
    })
  ) : '<div class="empty">No meat mappings recorded yet. When the operation team cuts or converts raw meat, click "Map Meat Usage &amp; Move to Storage" above.</div>';
}

/**
 * Render the dedicated Storage Room panel (Chiller & Deep Freezer Inventory)
 */
function renderStorageUI() {
  ensureStorage(state);
  let panel = document.getElementById('storage');
  if (!panel) return;

  let sum = storageSummary();
  let s = stock();
  let deficitCount = Object.values(s).filter(g => g < 0).length;

  // Storage Overview Cards
  let cardsEl = document.getElementById('storageOverviewCards');
  if (cardsEl) {
    cardsEl.innerHTML = [
      {
        title: 'Fresh Storage Stock',
        val: fmtG(sum.freshTotG),
        sub: 'Chiller / Cold Room stock ready for dispatch',
        ico: '🥗',
        border: 'fresh-border'
      },
      {
        title: 'Frozen Storage Stock',
        val: fmtG(sum.frozenTotG),
        sub: 'Deep Freezer stock ready for dispatch',
        ico: '🧊',
        border: 'frozen-border'
      },
      {
        title: 'Total Storage Available',
        val: fmtG(sum.freshTotG + sum.frozenTotG),
        sub: 'Total physical cold room inventory',
        ico: '🏢',
        border: ''
      },
      {
        title: 'Storage Deficit Checks',
        val: deficitCount,
        sub: deficitCount > 0 ? '⚠️ Dispatched before stock moved to room' : '✅ All dispatches verified with room deposits',
        ico: deficitCount > 0 ? '⚠️' : '✅',
        border: deficitCount > 0 ? 'waste-border' : 'cut-border'
      }
    ].map(c => `
      <div class="card room-card ${c.border}">
        <div class="ico">${c.ico}</div>
        <div class="label">${c.title}</div>
        <div class="num">${c.val}</div>
        <small>${c.sub}</small>
      </div>
    `).join('');
  }

  // Render Storage Stock Ledger Table
  renderStorageBalancesTable(sum.rows);

  // Render Storage Movement / Opening Balance Log
  renderStorageMovementsTable();

  // Fill dropdowns
  fillStorageSelects();
}

function renderStorageBalancesTable(rows) {
  let el = document.getElementById('storageStockTable');
  if (!el) return;
  let q = (document.getElementById('storageSearch')?.value || '').toLowerCase();
  let filterRoom = document.getElementById('storageRoomFilter')?.value || '';

  let filtered = rows.filter(r => {
    if (q && !r.product.toLowerCase().includes(q)) return false;
    if (filterRoom === 'Fresh' && r.fresh <= 0) return false;
    if (filterRoom === 'Frozen' && r.frozen <= 0) return false;
    return true;
  });

  el.innerHTML = table(
    ['Product Name', 'Fresh Storage (Chiller)', 'Frozen Storage (Deep Freezer)', 'Total Storage Available', 'Stock Status', 'Actions'],
    filtered.map(r => {
      let fTxt = r.fresh < 0
        ? `<span class="tag deficit" title="Deficit: dispatched before stock moved to room">⚠️ ${fmtQty(r.fresh, r.isPcs)}</span>`
        : `<span class="tag fresh">${fmtQty(r.fresh, r.isPcs)}</span>`;

      let zTxt = r.frozen < 0
        ? `<span class="tag deficit" title="Deficit: dispatched before stock moved to room">⚠️ ${fmtQty(r.frozen, r.isPcs)}</span>`
        : `<span class="tag frozen">${fmtQty(r.frozen, r.isPcs)}</span>`;

      let tot = r.fresh + r.frozen;
      let totTxt = tot < 0
        ? `<span style="color:#b42332;font-weight:800">⚠️ ${fmtQty(tot, r.isPcs)}</span>`
        : `<strong>${fmtQty(tot, r.isPcs)}</strong>`;

      let status = tot < 0
        ? `<span class="tag deficit">⚠️ Deficit (${fmtQty(tot, r.isPcs)})</span>`
        : (tot === 0 ? '<span class="mini">Out of stock</span>' : '<span class="tag good">✓ Ready for Dispatch</span>');

      return [
        `${prodTag(r.product)}${r.isPcs ? ' <span class="tag good">pieces</span>' : ''}`,
        fTxt,
        zTxt,
        totTxt,
        status,
        `<div class="actions" style="flex-wrap:nowrap">
          <button class="btn light sm" type="button" onclick="openMoveModal('${esc(r.product)}')">Transfer</button>
          <button class="icon-btn" type="button" onclick="openExistingStorageModal('${esc(r.product)}')">+ Add Stock</button>
        </div>`
      ];
    })
  );
}

function renderInwardHandoverQueue() {
  let el = document.getElementById('inwardQueueTable');
  if (!el) return;
  let inw = state.tx.filter(t => t.type === 'Inward').slice().reverse().slice(0, 30);

  el.innerHTML = inw.length ? table(
    ['Date', 'Inward Product', 'Received Qty', 'Supplier', 'Handover Status', 'Assigned To', 'Action'],
    inw.map(t => {
      let isHanded = t.handoverStatus === 'Handed over';
      let tag = isHanded
        ? `<span class="tag good">Handed to Operation Team</span>`
        : `<span class="tag bad">At Bay (Pending Handover)</span>`;

      let assigned = isHanded
        ? `<strong>${esc(t.handoverPerson || 'Staff')}</strong> <span class="tag ${t.handoverTeam === 'Frozen Team' ? 'frozen' : 'fresh'}">${esc(t.handoverTeam || 'Team')}</span>`
        : '<span class="mini">Not yet assigned</span>';

      let act = isHanded
        ? `<div class="actions" style="flex-wrap:nowrap">
            <button class="btn sm" type="button" onclick="openProcessModal('${esc(t.product)}', '${esc(t.handoverTeam)}', '${esc(t.handoverPerson)}')">Map Usage &amp; Move</button>
            <button class="btn light sm" type="button" onclick="openHandoverModal('${t.id}')">Re-assign</button>
           </div>`
        : `<button class="btn sm" type="button" onclick="openHandoverModal('${t.id}')">Handover to Team</button>`;

      return [
        esc(t.date),
        prodTag(t.product),
        fmtQty(t.grams, t.u === 'pcs'),
        esc(t.source || '—'),
        tag,
        assigned,
        act
      ];
    })
  ) : '<div class="empty">No inward stock received yet.</div>';
}

function renderHandoverHistoryTable() {
  let el = document.getElementById('handoverHistoryTable');
  if (!el) return;
  let q = (document.getElementById('opHoSearch')?.value || '').toLowerCase().trim();
  let list = (state.storageTx || []).filter(st => st.type === 'handover').slice().reverse();

  if (q) {
    list = list.filter(st =>
      (st.product || '').toLowerCase().includes(q) ||
      (st.person || '').toLowerCase().includes(q) ||
      (st.team || '').toLowerCase().includes(q)
    );
  }

  el.innerHTML = list.length ? table(
    ['Handover Date', 'Product Name', 'Assigned Team', 'Person Name (Receiver)', 'Quantity Given', 'Packets & Weight/Packet', 'Handed Over By', 'Action'],
    list.slice(0, 50).map(st => {
      let packInfo = st.packs > 0 ? `<strong>${st.packs}</strong> pkts <span class="mini">(${st.packWeightKg || 0.5} kg/pkt)</span>` : '<span class="mini">—</span>';
      return [
        `<span class="mini">${st.createdAt ? new Date(st.createdAt).toLocaleDateString('en-IN') : st.date}</span>`,
        prodTag(st.product),
        `<span class="tag ${st.team === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(st.team)}</span>`,
        `<strong>${esc(st.person)}</strong>`,
        `<strong>${fmtQty(st.grams, st.u === 'pcs')}</strong>`,
        packInfo,
        esc(st.createdBy || 'Staff'),
        `<button class="btn sm" type="button" onclick="openMapModal('${esc(st.product)}', '${esc(st.team)}', '${esc(st.person)}')">Map Stock</button>`
      ];
    })
  ) : '<div class="empty">No handovers recorded yet. Handover inward stock to Fresh or Frozen team members above.</div>';
}

function renderStorageMovementsTable() {
  let el = document.getElementById('storageMovementsTable');
  if (!el) return;
  let list = (state.storageTx || []).filter(st => ['to_storage', 'existing_storage', 'transfer_in', 'storage_dispatch'].includes(st.type)).slice().reverse().slice(0, 150);

  el.innerHTML = list.length ? table(
    ['Date & Time', 'Type', 'Storage Room', 'Product', 'Quantity', 'Location / Bin', 'Person / Operator', 'Notes'],
    list.map(st => {
      let typeLabel = st.type === 'existing_storage'
        ? '<span class="tag good">Opening Stock Added</span>'
        : st.type === 'to_storage'
        ? '<span class="tag pr">Moved to Storage Room</span>'
        : st.type === 'storage_dispatch'
        ? '<span class="tag out">Outward Dispatch</span>'
        : '<span class="tag in">Transfer</span>';

      let roomTag = `<span class="tag ${st.storageRoom === 'Frozen Storage' ? 'frozen' : 'fresh'}">${esc(st.storageRoom)}</span>`;

      return [
        `<span class="mini">${st.createdAt ? new Date(st.createdAt).toLocaleString('en-IN') : st.date}</span>`,
        typeLabel,
        roomTag,
        prodTag(st.product),
        fmtQty(st.grams, st.u === 'pcs'),
        esc(st.location || '—'),
        esc(st.person || st.createdBy || '—'),
        esc(st.notes || '—')
      ];
    })
  ) : '<div class="empty">No storage room movements recorded yet. Use "Move to Storage" or "Add Existing Storage Stock" above.</div>';
}

function fillStorageSelects() {
  ensureStorage(state);
  let al = aliasSet();
  let plain = state.products.filter(p => !al.has(p.name));
  let opt = p => `<option value="${esc(p.name)}">${esc(p.name)}</option>`;

  // Products
  ['existProd', 'hoProd', 'moveProd'].forEach(id => {
    let sel = document.getElementById(id);
    if (!sel) return;
    let v = sel.value;
    sel.innerHTML = '<option value="">Choose product</option>' + plain.map(opt).join('');
    if ([...sel.options].some(o => o.value === v)) sel.value = v;
  });

  // Handler datalists
  let dl = document.getElementById('handlerList');
  if (dl) {
    dl.innerHTML = state.handlers.map(h => `<option value="${esc(h)}">`).join('');
  }
}

/* ================= MODAL CONTROLLERS ================= */

function openExistingStorageModal(prodName) {
  ensureStorage(state);
  let p = prodName || '';
  let pcs = isPcs(p);

  showModal(`
    <div class="big">🏷️</div>
    <h3>Add Existing Storage Stock</h3>
    <p>Directly record existing stock currently sitting in your Fresh Storage or Frozen Storage room without needing a vendor inward bill.</p>
    <form id="existStorageForm" onsubmit="event.preventDefault(); submitExistingStorage();">
      <div class="formgrid" style="margin:14px 0">
        <div class="field">
          <label>Storage Room</label>
          <select id="mdlExRoom">
            <option value="Fresh Storage">🥗 Fresh Storage (Chiller / Cold Room)</option>
            <option value="Frozen Storage"${/frozen/i.test(p) ? ' selected' : ''}>🧊 Frozen Storage (Deep Freezer)</option>
          </select>
        </div>
        <div class="field">
          <label>Product Name</label>
          <select id="mdlExProd" onchange="updateExUnitPrompt()">
            ${state.products.map(x => `<option value="${esc(x.name)}"${x.name === p ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="mdlExQtyField">
          <label id="mdlExQtyLbl">${pcs ? 'Quantity (pieces count)' : 'Quantity (kg)'}</label>
          <input id="mdlExQty" type="number" min="0.001" step="${pcs ? '1' : '0.001'}" placeholder="e.g. 25" required>
        </div>
        <div class="field">
          <label>Storage Location / Shelf / Bin (optional)</label>
          <input id="mdlExLoc" placeholder="e.g. Cold Room 1 - Rack A">
        </div>
        <div class="field">
          <label>Stored By / Verified By (Person)</label>
          <input id="mdlExPerson" list="handlerList" placeholder="e.g. Ramesh" required>
        </div>
        <div class="field">
          <label>Date</label>
          <input id="mdlExDate" type="date" value="${dateNow()}">
        </div>
        <div class="field full">
          <label>Notes / Audit Reason</label>
          <input id="mdlExNotes" placeholder="e.g. Opening stock audit / pre-existing inventory" value="Opening stock balance">
        </div>
      </div>
      <div class="actions">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">✓ Add to Storage</button>
      </div>
    </form>
  `);
}

function updateExUnitPrompt() {
  let sel = document.getElementById('mdlExProd');
  let lbl = document.getElementById('mdlExQtyLbl');
  let inp = document.getElementById('mdlExQty');
  if (!sel || !lbl || !inp) return;
  let pcs = isPcs(sel.value);
  lbl.textContent = pcs ? 'Quantity (pieces count)' : 'Quantity (kg)';
  inp.step = pcs ? '1' : '0.001';
}

function submitExistingStorage() {
  let room = document.getElementById('mdlExRoom').value;
  let prod = document.getElementById('mdlExProd').value;
  let qty = document.getElementById('mdlExQty').value;
  let loc = document.getElementById('mdlExLoc').value;
  let person = document.getElementById('mdlExPerson').value;
  let date = document.getElementById('mdlExDate').value;
  let notes = document.getElementById('mdlExNotes').value;

  if (!prod) return toast('Please pick a product.', 'err');
  if (!qty || +qty <= 0) return toast('Please enter a valid quantity.', 'err');
  if (!person || !person.trim()) return toast('Please enter the name of person who verified the stock.', 'err');

  closeModal();
  addExistingStorageStock({
    storageRoom: room,
    product: prod,
    qty: qty,
    unit: 'kg',
    location: loc,
    person: person,
    date: date,
    notes: notes
  });
}

function openHandoverModal(inwardId) {
  ensureStorage(state);
  let t = inwardId ? state.tx.find(x => String(x.id) === String(inwardId)) : null;
  let prod = t ? t.product : '';
  let qty = t ? (t.u === 'pcs' ? t.grams : (t.grams / 1000).toFixed(3)) : '';
  let pcs = t ? t.u === 'pcs' : isPcs(prod);
  let isFrozen = /frozen/i.test(prod);

  let al = aliasSet();
  let plain = state.products.filter(p => !al.has(p.name));
  if (prod && !plain.some(p => p.name === prod)) {
    plain.unshift({ name: prod });
  }

  loadUsers();
  let candidateUsers = (AUTH.users || []).filter(u => u.active).map(u => ({ name: u.name, username: u.username, role: u.role }));
  let allPersons = [...new Set(candidateUsers.map(u => u.name).concat(state.handlers || []))].filter(Boolean);
  if (!allPersons.includes('Ramesh')) allPersons.push('Ramesh');

  let defaultPerson = t?.handoverPerson || candidateUsers.find(u => u.role === 'operation')?.name || allPersons[0] || 'Ramesh';
  let initPacks = t?.packCount || (qty ? Math.round(Number(qty) / 0.5) : 20);

  showModal(`
    <h3>Handover Inward Stock to Person</h3>
    <p>Handover inward meat to operation team member. Enter <b>packets count &amp; weight per packet</b> or <b>total weight</b>, and save.</p>
    <form id="handoverForm" onsubmit="event.preventDefault(); submitHandover('${inwardId || ''}');">
      <div class="formgrid" style="margin:14px 0">
        <div class="field">
          <label>Product Name</label>
          <select id="mdlHoProd" onchange="updateHoProductDetails()" required>
            <option value="">Choose product</option>
            ${plain.map(x => `<option value="${esc(x.name)}"${x.name === prod ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Assign to Team</label>
          <select id="mdlHoTeam">
            <option value="Fresh Team"${!isFrozen ? ' selected' : ''}>Fresh Team</option>
            <option value="Frozen Team"${isFrozen ? ' selected' : ''}>Frozen Team</option>
          </select>
        </div>
        <div class="field">
          <label>Handover to Person (Receiver)</label>
          <select id="mdlHoPersonSelect" onchange="handleHoPersonSelectChange()" required>
            <option value="">Choose person name</option>
            ${allPersons.map(pn => `<option value="${esc(pn)}"${pn === defaultPerson ? ' selected' : ''}>${esc(pn)}</option>`).join('')}
            <option value="__custom__">+ Type new person name...</option>
          </select>
          <div id="mdlHoCustomPersonBox" style="display:none;margin-top:6px">
            <input id="mdlHoCustomPerson" placeholder="Type person name (e.g. Ramesh)">
          </div>
        </div>
        <div class="field">
          <label>Handover Unit Mode</label>
          <select id="mdlHoMode" onchange="toggleHoMode()">
            <option value="packets">Packets Count (Packets × Weight of 1 Packet)</option>
            <option value="bulk">Total Weight in kg</option>
          </select>
        </div>

        <!-- Packets Count Mode Section -->
        <div class="field full" id="mdlHoPacketsBox" style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label>Number of Packets</label>
              <input id="mdlHoPacks" type="number" min="1" step="1" placeholder="e.g. 20" value="${initPacks}" oninput="calcHoLive()">
            </div>
            <div>
              <label>Weight of One Packet (kg)</label>
              <input id="mdlHoPackWeight" type="number" min="0.001" step="0.001" placeholder="e.g. 0.500" value="0.500" oninput="calcHoLive()">
              <div style="display:flex;gap:4px;margin-top:5px;flex-wrap:wrap">
                <button type="button" class="weight-chip" onclick="setHoWeight(0.25)">250g</button>
                <button type="button" class="weight-chip" onclick="setHoWeight(0.50)">500g</button>
                <button type="button" class="weight-chip" onclick="setHoWeight(0.75)">750g</button>
                <button type="button" class="weight-chip" onclick="setHoWeight(1.00)">1.0 kg</button>
                <button type="button" class="weight-chip" onclick="setHoWeight(1.50)">1.5 kg</button>
                <button type="button" class="weight-chip" onclick="setHoWeight(2.00)">2.0 kg</button>
              </div>
            </div>
          </div>
          <div class="calc-summary-box" id="mdlHoCalcBox" style="margin-top:10px">
            Calculated Handover Weight: <b id="mdlHoCalcTot" style="color:#0284c7">10.000 kg</b> (<span id="mdlHoCalcDesc">20 packets × 0.500 kg</span>)
          </div>
        </div>

        <!-- Bulk kg Mode Section -->
        <div class="field full" id="mdlHoBulkBox" style="display:none;background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0">
          <label>Total Handover Weight (kg)</label>
          <input id="mdlHoBulkQty" type="number" min="0.001" step="0.001" placeholder="e.g. 10.000" value="${qty || ''}" oninput="calcHoLive()">
        </div>

        <div class="field">
          <label>Handover Date</label>
          <input id="mdlHoDate" type="date" value="${dateNow()}">
        </div>
        <div class="field">
          <label>Notes / Remarks (optional)</label>
          <input id="mdlHoNotes" placeholder="e.g. Sent for cutting/chilling">
        </div>
      </div>
      <div class="actions">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">Save Handover</button>
      </div>
      </div>
    </form>
  `);

  calcHoLive();
}

window.handleHoPersonSelectChange = function() {
  let sel = document.getElementById('mdlHoPersonSelect');
  let box = document.getElementById('mdlHoCustomPersonBox');
  let inp = document.getElementById('mdlHoCustomPerson');
  if (!sel || !box) return;
  if (sel.value === '__custom__') {
    box.style.display = 'block';
    if (inp) inp.focus();
  } else {
    box.style.display = 'none';
  }
};

window.toggleHoMode = function() {
  let mode = document.getElementById('mdlHoMode')?.value || 'packets';
  let pBox = document.getElementById('mdlHoPacketsBox');
  let bBox = document.getElementById('mdlHoBulkBox');
  if (pBox) pBox.style.display = mode === 'packets' ? 'block' : 'none';
  if (bBox) bBox.style.display = mode === 'bulk' ? 'block' : 'none';
  calcHoLive();
};

window.setHoWeight = function(w) {
  let inp = document.getElementById('mdlHoPackWeight');
  if (inp) {
    inp.value = Number(w).toFixed(3);
    calcHoLive();
  }
};

window.calcHoLive = function() {
  let mode = document.getElementById('mdlHoMode')?.value || 'packets';
  let totEl = document.getElementById('mdlHoCalcTot');
  let descEl = document.getElementById('mdlHoCalcDesc');

  if (mode === 'packets') {
    let packs = Number(document.getElementById('mdlHoPacks')?.value) || 0;
    let pw = Number(document.getElementById('mdlHoPackWeight')?.value) || 0;
    let tot = packs * pw;
    if (totEl) totEl.textContent = `${tot.toFixed(3)} kg`;
    if (descEl) descEl.textContent = `${packs} packets × ${pw.toFixed(3)} kg`;
  }
};

window.updateHoProductDetails = function() {
  let sel = document.getElementById('mdlHoProd');
  let teamSel = document.getElementById('mdlHoTeam');
  if (!sel) return;
  let p = sel.value;
  if (teamSel && p) {
    teamSel.value = /frozen/i.test(p) ? 'Frozen Team' : 'Fresh Team';
  }
};

function submitHandover(inwardId) {
  let team = document.getElementById('mdlHoTeam').value;
  let personSel = document.getElementById('mdlHoPersonSelect').value;
  let customPerson = (document.getElementById('mdlHoCustomPerson')?.value || '').trim();
  let person = personSel === '__custom__' ? customPerson : personSel;

  let prod = document.getElementById('mdlHoProd').value;
  let mode = document.getElementById('mdlHoMode')?.value || 'packets';
  let date = document.getElementById('mdlHoDate').value;
  let notes = document.getElementById('mdlHoNotes').value;

  if (!prod) return toast('Please select a product from the dropdown.', 'err');
  if (!person) return toast('Please specify the person taking responsibility.', 'err');

  let qty = 0, packs = 0, packWeightKg = 0.5;
  if (mode === 'packets') {
    packs = Number(document.getElementById('mdlHoPacks')?.value) || 0;
    packWeightKg = Number(document.getElementById('mdlHoPackWeight')?.value) || 0.5;
    if (packs <= 0) return toast('Please enter number of packets.', 'err');
    if (packWeightKg <= 0) return toast('Please enter weight of one packet.', 'err');
    qty = +(packs * packWeightKg).toFixed(3);
  } else {
    qty = Number(document.getElementById('mdlHoBulkQty')?.value) || 0;
    if (qty <= 0) return toast('Please enter handover weight in kg.', 'err');
    packs = 0;
    packWeightKg = 0.5;
  }

  closeModal();
  handoverToOperations({
    inwardId: inwardId || null,
    team: team,
    person: person,
    product: prod,
    qty: qty,
    packs: packs,
    packWeightKg: packWeightKg,
    unitMode: mode,
    unit: 'kg',
    date: date,
    notes: notes
  });
}

function openMoveModal(prodName) {
  ensureStorage(state);
  let al = aliasSet();
  let plain = state.products.filter(p => !al.has(p.name));
  let p = prodName || (plain[0] ? plain[0].name : '');
  let pcs = isPcs(p);
  let freshTeamHand = getTeamInHand(p, 'Fresh Team');
  let frozenTeamHand = getTeamInHand(p, 'Frozen Team');
  let defaultTeam = frozenTeamHand > freshTeamHand ? 'Frozen Team' : 'Fresh Team';
  let availQty = defaultTeam === 'Frozen Team' ? frozenTeamHand : freshTeamHand;
  let defaultRoom = defaultTeam === 'Frozen Team' ? 'Frozen Storage' : 'Fresh Storage';

  showModal(`
    <div class="big">🚪</div>
    <h3>Move Stock into Storage Room</h3>
    <p>Operations team moves verified/processed stock into the designated <b>Fresh Storage</b> or <b>Frozen Storage</b> room.</p>
    <form id="moveRoomForm" onsubmit="event.preventDefault(); submitMoveRoom();">
      <div class="formgrid" style="margin:14px 0">
        <div class="field">
          <label>Product</label>
          <select id="mdlMvProd" onchange="updateMvTeamAvail()" required>
            <option value="">Choose product</option>
            ${plain.map(x => `<option value="${esc(x.name)}"${x.name === p ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>From Operations Team</label>
          <select id="mdlMvTeam" onchange="updateMvTeamAvail()">
            <option value="Fresh Team"${defaultTeam === 'Fresh Team' ? ' selected' : ''}>🟢 Fresh Team (${fmtQty(freshTeamHand, pcs)} in hand)</option>
            <option value="Frozen Team"${defaultTeam === 'Frozen Team' ? ' selected' : ''}>❄️ Frozen Team (${fmtQty(frozenTeamHand, pcs)} in hand)</option>
          </select>
        </div>
        <div class="field">
          <label>Target Storage Room</label>
          <select id="mdlMvRoom">
            <option value="Fresh Storage"${defaultRoom === 'Fresh Storage' ? ' selected' : ''}>🥗 Fresh Storage (Chiller / Cold Room)</option>
            <option value="Frozen Storage"${defaultRoom === 'Frozen Storage' ? ' selected' : ''}>🧊 Frozen Storage (Deep Freezer)</option>
          </select>
        </div>
        <div class="field">
          <label id="mdlMvQtyLbl">Quantity to Store (${pcs ? 'pieces' : 'kg'})</label>
          <input id="mdlMvQty" type="number" min="0.001" step="${pcs ? '1' : '0.001'}" value="${pcs ? availQty : (availQty / 1000).toFixed(3)}" required>
        </div>
        <div class="field">
          <label>Rack / Shelf / Bin Location</label>
          <input id="mdlMvLoc" placeholder="e.g. Chiller A - Bin 4, Deep Freezer 1">
        </div>
        <div class="field">
          <label>Operator / Stored By</label>
          <input id="mdlMvPerson" list="handlerList" placeholder="e.g. Suresh" required>
        </div>
        <div class="field full">
          <label>Date & Notes</label>
          <input id="mdlMvNotes" placeholder="e.g. Temperature checked & stacked properly">
        </div>
      </div>
      <div class="actions">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">✓ Place in Storage Room</button>
      </div>
    </form>
  `);
}

function updateMvTeamAvail() {
  let prod = document.getElementById('mdlMvProd')?.value;
  let teamSel = document.getElementById('mdlMvTeam');
  let roomSel = document.getElementById('mdlMvRoom');
  let qtyLbl = document.getElementById('mdlMvQtyLbl');
  let qtyInp = document.getElementById('mdlMvQty');
  if (!prod || !teamSel) return;

  let pcs = isPcs(prod);
  if (qtyLbl) qtyLbl.textContent = `Quantity to Store (${pcs ? 'pieces' : 'kg'})`;
  if (qtyInp) qtyInp.step = pcs ? '1' : '0.001';

  let freshHand = getTeamInHand(prod, 'Fresh Team');
  let frozenHand = getTeamInHand(prod, 'Frozen Team');

  let curTeam = teamSel.value;
  teamSel.innerHTML = `
    <option value="Fresh Team"${curTeam === 'Fresh Team' ? ' selected' : ''}>🟢 Fresh Team (${fmtQty(freshHand, pcs)} in hand)</option>
    <option value="Frozen Team"${curTeam === 'Frozen Team' ? ' selected' : ''}>❄️ Frozen Team (${fmtQty(frozenHand, pcs)} in hand)</option>
  `;

  let team = teamSel.value;
  let hand = team === 'Frozen Team' ? frozenHand : freshHand;
  if (roomSel) roomSel.value = team === 'Frozen Team' ? 'Frozen Storage' : 'Fresh Storage';
  if (qtyInp) qtyInp.value = pcs ? hand : (hand / 1000).toFixed(3);
}

function submitMoveRoom() {
  let prod = document.getElementById('mdlMvProd').value;
  let team = document.getElementById('mdlMvTeam').value;
  let room = document.getElementById('mdlMvRoom').value;
  let qty = document.getElementById('mdlMvQty').value;
  let loc = document.getElementById('mdlMvLoc').value;
  let person = document.getElementById('mdlMvPerson').value;
  let notes = document.getElementById('mdlMvNotes').value;

  closeModal();
  moveTeamToStorage({
    product: prod,
    team: team,
    storageRoom: room,
    qty: qty,
    unit: 'kg',
    location: loc,
    person: person,
    date: dateNow(),
    notes: notes
  });
}

/* ================= OPERATIONS PROCESSING, CONVERSION & WASTAGE ================= */

/**
 * Open the interactive Operations Cutting, Mapping & Wastage modal
 * Supports both creating new mapping and editing existing mapping (editId)
 */
function openProcessModal(defaultProd, defaultTeam, defaultPerson, defaultQty, defaultPackWeight, editId) {
  ensureStorage(state);
  let al = aliasSet();
  let plain = state.products.filter(p => !al.has(p.name));

  let existing = editId ? (state.storageTx || []).find(st => st.id === editId) : null;

  // Determine current user and available allocations
  let allocations = getInHandAllocations();
  let myName = (AUTH.cur?.name || '').trim();
  let isOp = isOpRole();

  if (isOp && !defaultPerson) {
    defaultPerson = myName;
  }

  let personAllocations = isOp
    ? allocations.filter(a => {
        let p = (a.person || '').toLowerCase().trim();
        return p === myName.toLowerCase() || p === (AUTH.cur?.username || '').toLowerCase();
      })
    : (defaultPerson ? allocations.filter(a => a.person.toLowerCase() === defaultPerson.toLowerCase()) : allocations);

  let initialTeam = existing?.team || defaultTeam || (personAllocations[0] ? personAllocations[0].team : 'Fresh Team');
  let initialProd = existing?.rawProduct || defaultProd || (personAllocations[0] ? personAllocations[0].product : plain[0]?.name || '');
  let initialPerson = existing?.person || defaultPerson || (personAllocations[0] ? personAllocations[0].person : (state.handlers[0] || 'Ramesh'));
  let initialQty = existing ? +(existing.rawGrams / 1000).toFixed(3) : (defaultQty || (personAllocations[0] ? +(personAllocations[0].qty / 1000).toFixed(3) : 10.000));
  let initialPackWeight = existing ? existing.singlePackWeight : (defaultPackWeight || (personAllocations[0]?.packWeightKg ? personAllocations[0].packWeightKg : 0.500));
  let initialOutPacks = existing ? existing.outPacks : 16;
  let initialOutQty = existing ? +(existing.outGrams / 1000).toFixed(3) : +(initialOutPacks * initialPackWeight).toFixed(3);
  let initialWasteQty = existing ? +(existing.wasteGrams / 1000).toFixed(3) : Math.max(0, +(initialQty - initialOutQty).toFixed(3));
  let initialWasteReason = existing?.wasteReason || 'Bone & Carcass Removal';
  let initialRoom = existing?.storageRoom || (initialTeam === 'Frozen Team' || /frozen/i.test(initialProd) ? 'Frozen Storage' : 'Fresh Storage');

  let d = document.getElementById('dialog');
  if (d) d.classList.add('wide');

  showModal(`
    <h3>${existing ? 'Edit Stock Mapping &amp; Wastage' : 'Stock Mapping: What Was This Meat Used For?'}</h3>
    <p>${existing ? 'Update cut conversion, packet count, weight of single packet, wastage weight and reason.' : 'Map inward raw meat into finished cuts, enter <b>packets count</b> and <b>weight of single packet</b>. Check conversion, cutting loss/wastage, and move directly to Cold Storage Room.'}</p>

    <form id="procModalForm" onsubmit="event.preventDefault(); submitProcess('${existing ? existing.id : ''}');">
      <div class="formgrid" style="margin:14px 0">
        
        <div class="field">
          <label>Operations Team</label>
          <select id="mdlProcTeam" onchange="updateProcTeamRawList()">
            <option value="Fresh Team"${initialTeam === 'Fresh Team' ? ' selected' : ''}>Fresh Team</option>
            <option value="Frozen Team"${initialTeam === 'Frozen Team' ? ' selected' : ''}>Frozen Team</option>
          </select>
        </div>

        <div class="field">
          <label>Operation Member (Handler)</label>
          ${isOp 
            ? `<input id="mdlProcPerson" value="${esc(myName)}" readonly style="background:#f1f5f9;font-weight:750;color:#0284c7">`
            : `<input id="mdlProcPerson" list="handlerList" placeholder="e.g. Ramesh" required value="${esc(initialPerson)}" onchange="updateProcTeamRawList()">`
          }
        </div>

        <!-- Section 1: Raw Meat Consumed -->
        <div class="field full" style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0">
          <div style="font-weight:750;margin-bottom:8px;color:#1e293b;display:flex;justify-content:space-between;align-items:center">
            <span>1. Raw Meat Consumed (In-Hand Handover Stock)</span>
            <span id="mdlProcAvailBadge" class="tag in sm">Available in hand</span>
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label>Raw Meat Product</label>
              <select id="mdlProcRaw" onchange="updateProcRawDetails()" required>
                <!-- Filled dynamically -->
              </select>
              <div id="mdlProcAvailHint" class="mini" style="margin-top:4px"></div>
            </div>
            <div>
              <label>Raw Meat Input Weight (kg)</label>
              <input id="mdlProcInputQty" type="number" min="0.001" step="0.001" placeholder="e.g. 10.000" value="${initialQty}" oninput="calcMappedOutputWeight()" required>
            </div>
          </div>
          <div style="margin-top:10px;display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label>Processing / Mapping Date</label>
              <input id="mdlProcDate" type="date" value="${existing?.date || dateNow()}" onchange="updateProcessLiveCalc()">
            </div>
            <div>
              <label class="mini" style="color:var(--muted)">Stock Assignment Status</label>
              <div id="mdlProcAssignStatus" class="mini" style="margin-top:6px;font-weight:700;color:#0284c7">${existing ? 'Editing Existing Mapping' : 'Handover Meat Verified'}</div>
            </div>
          </div>
        </div>

        <!-- Section 2: Meat Mapping & Finished Cut Produced -->
        <div class="field full" style="background:#f8fafc;padding:12px;border-radius:12px;border:1px solid #e2e8f0">
          <div style="font-weight:750;margin-bottom:8px;color:#1e293b">2. Meat Mapping: What Was This Meat Used For?</div>

          <!-- Quick Cut Preset Chips -->
          <div style="margin-bottom:10px">
            <span class="mini" style="font-weight:700;color:var(--muted)">Quick Select Finished Cut:</span>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:4px">
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Chicken Curry Cut')">Chicken Curry Cut</button>
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Chicken Tikka')">Chicken Tikka</button>
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Chicken Marinade')">Chicken Marinade</button>
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Chicken Biryani Cut')">Chicken Biryani Cut</button>
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Chicken Boneless')">Chicken Boneless</button>
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Basa Fillet')">Basa Fillet</button>
              <button type="button" class="btn light sm" style="padding:4px 8px;font-size:11.5px" onclick="setQuickCut('Mutton Curry Cut')">Mutton Curry Cut</button>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div>
              <label>Target Mapped Cut / Product Outcome</label>
              <select id="mdlProcOutProd" onchange="checkProcCustomOutProd()" required>
                <option value="">Choose cut / product</option>
                ${plain.map(x => `<option value="${esc(x.name)}"${existing?.outProduct === x.name ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}
                <option value="__new__">+ Type New Cut Name...</option>
              </select>
              <div id="mdlProcNewProdBox" style="display:none;margin-top:6px">
                <input id="mdlProcNewProdName" placeholder="e.g. Chicken Tikka, Basa Fillet" value="${existing?.outProduct && !plain.some(x => x.name === existing.outProduct) ? esc(existing.outProduct) : ''}">
              </div>
            </div>
            <div>
              <label>Packets Count Packed</label>
              <input id="mdlProcOutputPacks" type="number" min="1" step="1" placeholder="e.g. 16" value="${initialOutPacks}" oninput="calcMappedOutputWeight()" required>
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px">
            <div>
              <label>Weight of Single Packet (kg)</label>
              <input id="mdlProcSinglePackWeight" type="number" min="0.001" step="0.001" placeholder="e.g. 0.500" value="${initialPackWeight}" oninput="calcMappedOutputWeight()" required>
              <div style="display:flex;gap:4px;margin-top:4px;flex-wrap:wrap">
                <button type="button" class="weight-chip" onclick="setProcSingleWeight(0.25)">250g</button>
                <button type="button" class="weight-chip" onclick="setProcSingleWeight(0.50)">500g</button>
                <button type="button" class="weight-chip" onclick="setProcSingleWeight(0.75)">750g</button>
                <button type="button" class="weight-chip" onclick="setProcSingleWeight(1.00)">1.0 kg</button>
                <button type="button" class="weight-chip" onclick="setProcSingleWeight(1.50)">1.5 kg</button>
                <button type="button" class="weight-chip" onclick="setProcSingleWeight(2.00)">2.0 kg</button>
              </div>
            </div>
            <div>
              <label>Total Packed Output Weight (kg)</label>
              <input id="mdlProcOutputQty" type="number" min="0.001" step="0.001" placeholder="e.g. 8.000" value="${initialOutQty}" oninput="updateProcessLiveCalc(true)" required>
              <span class="mini" style="color:var(--muted)">Auto-calculated: Packets × Single Packet Weight</span>
            </div>
          </div>

          <div style="margin-top:12px">
            <label>Wastage / Cutting Loss Weight (kg)</label>
            <input id="mdlProcWastageQty" type="number" min="0" step="0.001" placeholder="0.000" value="${initialWasteQty}" oninput="onManualWastageInput()">
            <span class="mini" style="color:var(--muted)">Auto-filled from (Raw Weight - Packed Weight). You can edit or fine-tune this value manually.</span>
          </div>
        </div>

        <!-- Section 3: Live Verification, Discrepancy & Wastage Card -->
        <div class="field full">
          <div id="mdlProcVerificationCard">
            <!-- Dynamic verification box rendered by updateProcessLiveCalc -->
          </div>
        </div>

        <div class="field full" id="mdlProcWasteReasonField">
          <label>Wastage / Loss Reason (select or type manually)</label>
          <div style="display:flex;gap:8px">
            <select id="mdlProcWasteReasonSel" onchange="handleWasteReasonSelChange()" style="flex:1">
              <option value="">-- Choose reason or type below --</option>
              <option value="Bone &amp; Carcass Removal">Bone &amp; Carcass Removal</option>
              <option value="Skinning &amp; Scaling">Skinning &amp; Scaling Loss</option>
              <option value="Fat &amp; Gizzard Trimming">Fat &amp; Gizzard Trimming</option>
              <option value="Thawing &amp; Blood Loss">Thawing &amp; Blood Loss</option>
              <option value="Damaged / Bruised Parts">Damaged / Bruised / Rejected</option>
              <option value="Cutting &amp; Cleaning Loss">Cutting &amp; Cleaning Loss</option>
              <option value="Standard Trimming Loss">Standard Trimming Loss</option>
              <option value="__custom__">+ Type custom reason manually...</option>
            </select>
          </div>
          <div style="margin-top:6px">
            <input id="mdlProcWasteReasonInput" placeholder="Type reason manually..." value="${esc(initialWasteReason)}">
          </div>
        </div>

        <div class="field">
          <label>Destination Cold Storage Room</label>
          <select id="mdlProcRoom">
            <option value="Fresh Storage"${initialRoom === 'Fresh Storage' ? ' selected' : ''}>Fresh Storage (Chiller)</option>
            <option value="Frozen Storage"${initialRoom === 'Frozen Storage' ? ' selected' : ''}>Frozen Storage (Deep Freezer)</option>
          </select>
        </div>

        <div class="field">
          <label>Notes / Cutting Remarks (optional)</label>
          <input id="mdlProcNotes" placeholder="e.g. Prepared for daily dispatch orders" value="${esc(existing?.notes || '')}">
        </div>

        <div class="field full" style="margin-top:6px">
          <label style="display:flex;align-items:center;gap:10px;font-size:13.5px;font-weight:700;cursor:pointer;background:#f0fdf4;padding:12px 16px;border:1.5px solid #86efac;border-radius:10px;color:#166534">
            <input type="checkbox" id="mdlProcMoveCheckbox" checked style="width:20px;height:20px;accent-color:#16a34a">
            <span>Move to Storage Room (Directly place converted cuts into chosen storage room)</span>
          </label>
        </div>
      </div>

      <div class="actions">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit" id="mdlProcSubmitBtn" style="font-size:14px;padding:11px 24px">${existing ? '✓ Save Changes to Mapping' : 'Save &amp; Move to Storage Room'}</button>
      </div>
    </form>
  `);

  updateProcTeamRawList(initialProd);
  if (existing) {
    let outSel = document.getElementById('mdlProcOutProd');
    if (outSel) {
      if ([...outSel.options].some(o => o.value === existing.outProduct)) {
        outSel.value = existing.outProduct;
      } else {
        outSel.value = '__new__';
        let customBox = document.getElementById('mdlProcNewProdBox');
        let customInp = document.getElementById('mdlProcNewProdName');
        if (customBox) customBox.style.display = 'block';
        if (customInp) customInp.value = existing.outProduct;
      }
    }
  }
  updateProcessLiveCalc(true);
}

window.handleWasteReasonSelChange = function() {
  let sel = document.getElementById('mdlProcWasteReasonSel');
  let inp = document.getElementById('mdlProcWasteReasonInput');
  if (!sel || !inp) return;
  if (sel.value && sel.value !== '__custom__') {
    inp.value = sel.value;
  } else if (sel.value === '__custom__') {
    inp.value = '';
    inp.focus();
  }
};

window.onManualWastageInput = function() {
  updateProcessLiveCalc(true);
};

window.setQuickCut = function(name) {
  let sel = document.getElementById('mdlProcOutProd');
  let customBox = document.getElementById('mdlProcNewProdBox');
  let customInp = document.getElementById('mdlProcNewProdName');
  if (!sel) return;
  if ([...sel.options].some(o => o.value === name)) {
    sel.value = name;
    if (customBox) customBox.style.display = 'none';
  } else {
    sel.value = '__new__';
    if (customBox) {
      customBox.style.display = 'block';
      if (customInp) customInp.value = name;
    }
  }
  updateProcessLiveCalc(false);
};

window.setProcSingleWeight = function(w) {
  let inp = document.getElementById('mdlProcSinglePackWeight');
  if (inp) {
    inp.value = Number(w).toFixed(3);
    calcMappedOutputWeight();
  }
};

window.calcMappedOutputWeight = function() {
  let packs = Number(document.getElementById('mdlProcOutputPacks')?.value) || 0;
  let singleW = Number(document.getElementById('mdlProcSinglePackWeight')?.value) || 0;
  let outQtyInp = document.getElementById('mdlProcOutputQty');
  if (outQtyInp && packs > 0 && singleW > 0) {
    outQtyInp.value = (packs * singleW).toFixed(3);
  }
  updateProcessLiveCalc(false);
};

function updateProcTeamRawList(selectedProd) {
  let team = document.getElementById('mdlProcTeam')?.value || 'Fresh Team';
  let person = (document.getElementById('mdlProcPerson')?.value || '').trim();
  let rawSel = document.getElementById('mdlProcRaw');
  if (!rawSel) return;

  let al = aliasSet();
  let plain = state.products.filter(p => !al.has(p.name));

  let options = plain.map(p => {
    let inHand = person ? getPersonProductInHand(person, p.name, team) : getTeamInHand(p.name, team);
    let pcs = isPcs(p.name);
    return {
      name: p.name,
      inHand: inHand,
      isPcs: pcs,
      label: `${p.name} ${inHand > 0 ? `(Available: ${fmtQty(inHand, pcs)})` : '(0 in hand)'}`
    };
  }).sort((a, b) => b.inHand - a.inHand);

  rawSel.innerHTML = options.map(o => `
    <option value="${esc(o.name)}"${(selectedProd && selectedProd === o.name) || (!selectedProd && o.inHand > 0 && options[0].name === o.name) ? ' selected' : ''}>
      ${esc(o.label)}
    </option>
  `).join('');

  updateProcRawDetails();
}

function updateProcRawDetails() {
  let team = document.getElementById('mdlProcTeam')?.value || 'Fresh Team';
  let person = (document.getElementById('mdlProcPerson')?.value || '').trim();
  let raw = document.getElementById('mdlProcRaw')?.value;
  let hint = document.getElementById('mdlProcAvailHint');
  let inpQty = document.getElementById('mdlProcInputQty');
  let outRoom = document.getElementById('mdlProcRoom');
  if (!raw) return;

  let inHand = person ? getPersonProductInHand(person, raw, team) : getTeamInHand(raw, team);
  let pcs = isPcs(raw);

  if (hint) {
    hint.innerHTML = inHand > 0
      ? `<span style="color:#12805a;font-weight:700">${fmtQty(inHand, pcs)} available in hand with ${esc(person || team)}.</span>`
      : `<span style="color:#b42332;font-weight:700">0 available in hand with ${esc(person || team)}.</span>`;
  }

  if (inpQty && (!inpQty.value || +inpQty.value <= 0) && inHand > 0) {
    inpQty.value = pcs ? inHand : (inHand / 1000).toFixed(3);
  }

  if (outRoom) {
    outRoom.value = team === 'Frozen Team' || /frozen/i.test(raw) ? 'Frozen Storage' : 'Fresh Storage';
  }

  calcMappedOutputWeight();
}

function checkProcCustomOutProd() {
  let sel = document.getElementById('mdlProcOutProd');
  let box = document.getElementById('mdlProcNewProdBox');
  let inp = document.getElementById('mdlProcNewProdName');
  if (!sel || !box) return;
  if (sel.value === '__new__') {
    box.style.display = 'block';
    if (inp) inp.focus();
  } else {
    box.style.display = 'none';
  }
}

function updateProcessLiveCalc(isManualWastage) {
  let inQty = Number(document.getElementById('mdlProcInputQty')?.value) || 0;
  let outQty = Number(document.getElementById('mdlProcOutputQty')?.value) || 0;
  let packs = Number(document.getElementById('mdlProcOutputPacks')?.value) || 0;
  let singleW = Number(document.getElementById('mdlProcSinglePackWeight')?.value) || 0;
  let wasteInp = document.getElementById('mdlProcWastageQty');
  let reasonField = document.getElementById('mdlProcWasteReasonField');
  let card = document.getElementById('mdlProcVerificationCard');
  let submitBtn = document.getElementById('mdlProcSubmitBtn');

  if (!card) return;

  // Auto-fill wastage if user has not overridden manually
  if (!isManualWastage && wasteInp) {
    let autoWaste = Math.max(0, +(inQty - outQty).toFixed(3));
    wasteInp.value = autoWaste.toFixed(3);
  }

  let wasteQty = Number(wasteInp ? wasteInp.value : (inQty - outQty)) || 0;
  let totalAccounted = +(outQty + wasteQty).toFixed(3);
  let discrepancy = +(inQty - totalAccounted).toFixed(3);

  // 1. Clash: Packed weight exceeds raw meat input
  if (outQty > inQty + 0.001) {
    let excess = (outQty - inQty).toFixed(3);
    card.innerHTML = `
      <div class="match-box clash">
        <span><b>Clash in Mapping:</b> Total packed weight (<b>${outQty.toFixed(3)} kg</b>) exceeds raw meat received (<b>${inQty.toFixed(3)} kg</b>) by <b>${excess} kg</b>. You cannot pack more meat than raw received. Please check packet count or single packet weight.</span>
      </div>
    `;
    if (reasonField) reasonField.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';
    }
    return;
  }

  // 2. Clash: Packed weight + Wastage exceeds raw meat input
  if (totalAccounted > inQty + 0.001) {
    let excess = (totalAccounted - inQty).toFixed(3);
    card.innerHTML = `
      <div class="match-box clash">
        <span><b>Clash in Mapping:</b> Packed weight (${outQty.toFixed(3)} kg) + Wastage (${wasteQty.toFixed(3)} kg) = <b>${totalAccounted} kg</b>, which exceeds raw input (<b>${inQty.toFixed(3)} kg</b>) by <b>${excess} kg</b>. Please adjust wastage or packets.</span>
      </div>
    `;
    if (reasonField) reasonField.style.display = 'block';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.5';
      submitBtn.style.cursor = 'not-allowed';
    }
    return;
  }

  // 3. Perfect match: 100% converted, zero cutting loss
  if (wasteQty <= 0.001 && Math.abs(inQty - outQty) <= 0.001) {
    card.innerHTML = `
      <div class="match-box ok">
        <span><b>Utilized Correctly (100%):</b> All raw meat converted into finished cuts (${packs} packets × ${singleW.toFixed(3)} kg = ${outQty.toFixed(3)} kg). Zero wastage. Ready to move to Storage Room.</span>
      </div>
    `;
    if (reasonField) reasonField.style.display = 'none';
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
    }
    return;
  }

  // 4. Cutting Loss / Wastage present
  let wastePct = inQty > 0 ? ((wasteQty / inQty) * 100).toFixed(1) : '0.0';
  let diffNotice = Math.abs(discrepancy) > 0.001
    ? `<div style="margin-top:4px;color:#9a3412">Unaccounted remaining: <b>${discrepancy.toFixed(3)} kg</b></div>`
    : '';

  card.innerHTML = `
    <div class="match-box warn">
      <div style="flex:1">
        <div><b>Cutting Loss Detected:</b> <b>${wasteQty.toFixed(3)} kg (${wastePct}%)</b> of raw meat recorded as cutting loss/trimming.</div>
        <div class="mini" style="margin-top:5px;font-weight:600;color:#78350f">
          Raw Received: <b>${inQty.toFixed(3)} kg</b> · Finished Cuts: <b>${outQty.toFixed(3)} kg</b> (${packs} pkts) · Wastage: <b>${wasteQty.toFixed(3)} kg</b>.
          ${diffNotice}
          Please select or type wastage reason below:
        </div>
      </div>
    </div>
  `;
  if (reasonField) reasonField.style.display = 'block';
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.style.opacity = '1';
    submitBtn.style.cursor = 'pointer';
  }
}

function submitProcess(editId) {
  ensureStorage(state);
  let team = document.getElementById('mdlProcTeam').value;
  let person = (document.getElementById('mdlProcPerson')?.value || '').trim();
  let raw = document.getElementById('mdlProcRaw').value;
  let inQty = Number(document.getElementById('mdlProcInputQty').value) || 0;

  let outSel = document.getElementById('mdlProcOutProd').value;
  let customOut = (document.getElementById('mdlProcNewProdName')?.value || '').trim();
  let finished = outSel === '__new__' ? customOut : outSel;

  let packs = Number(document.getElementById('mdlProcOutputPacks').value) || 0;
  let singlePackWeight = Number(document.getElementById('mdlProcSinglePackWeight').value) || 0.500;
  let outQty = Number(document.getElementById('mdlProcOutputQty').value) || 0;

  let wasteQty = Number(document.getElementById('mdlProcWastageQty')?.value) || 0;
  let reasonInput = (document.getElementById('mdlProcWasteReasonInput')?.value || '').trim();
  let reasonSel = (document.getElementById('mdlProcWasteReasonSel')?.value || '').trim();
  let wasteReason = reasonInput || (reasonSel !== '__custom__' ? reasonSel : '') || 'Standard Trimming Loss';

  let room = document.getElementById('mdlProcRoom').value;
  let date = document.getElementById('mdlProcDate').value || dateNow();
  let notes = (document.getElementById('mdlProcNotes')?.value || '').trim();

  if (!raw) return toast('Please select the raw product consumed.', 'err');
  if (!finished) return toast('Please specify what this meat was used for (finished cut).', 'err');
  if (inQty <= 0) return toast('Please enter a valid raw input quantity.', 'err');
  if (outQty <= 0) return toast('Please enter a valid finished output quantity.', 'err');
  if (!person) return toast('Please enter the name of the operator/cutter.', 'err');

  // Clash checks
  if (outQty > inQty + 0.001) {
    return toast('Cannot move to storage: Clash in mapping. Total packed weight exceeds raw meat received. Please correct packet count.', 'err');
  }
  if (outQty + wasteQty > inQty + 0.001) {
    return toast(`Cannot move to storage: Packed weight (${outQty.toFixed(3)} kg) + Wastage (${wasteQty.toFixed(3)} kg) exceeds raw received (${inQty.toFixed(3)} kg).`, 'err');
  }

  let rawGrams = Math.round(inQty * 1000);
  let outGrams = Math.round(outQty * 1000);
  let wasteGrams = Math.round(wasteQty * 1000);
  let wastePct = rawGrams > 0 ? (wasteGrams / rawGrams) * 100 : 0;
  let finalReason = wasteGrams > 0 ? wasteReason : 'Zero Wastage (100% Packed)';

  // Auto-register mapped finished cut into product catalog so it's readily available for Outward Dispatch
  if (!state.products.some(p => p.name.toLowerCase() === finished.toLowerCase())) {
    state.products.push({
      name: finished,
      unit: 'kg',
      size: singlePackWeight || 0.500
    });
  }

  if (editId) {
    let entry = (state.storageTx || []).find(st => st.id === editId);
    if (!entry) return toast('Could not find existing mapping record to update.', 'err');

    entry.date = date;
    entry.team = team;
    entry.person = person;
    entry.rawProduct = raw;
    entry.rawGrams = rawGrams;
    entry.outProduct = finished;
    entry.outGrams = outGrams;
    entry.outPacks = packs;
    entry.singlePackWeight = singlePackWeight;
    entry.wasteGrams = wasteGrams;
    entry.wastePct = wastePct;
    entry.wasteReason = finalReason;
    entry.storageRoom = room;
    entry.notes = notes;
    entry.updatedAt = new Date().toISOString();

    // Update corresponding state.tx record if present
    let txMatch = state.tx.find(t => t.storageTxId === editId || (t.type === 'Processing' && t.date === date && t.person === person && t.raw === raw));
    if (txMatch) {
      txMatch.date = date;
      txMatch.raw = raw;
      txMatch.finished = finished;
      txMatch.inputG = rawGrams;
      txMatch.outputG = outGrams;
      txMatch.wasteG = wasteGrams;
      txMatch.wasteReason = finalReason;
      txMatch.storageRoom = room;
      txMatch.team = team;
      txMatch.person = person;
      txMatch.packs = packs;
      txMatch.notes = `${team} (${person}) mapped ${inQty.toFixed(3)} kg of ${raw} → ${outQty.toFixed(3)} kg of ${finished} (${packs} pkts × ${singlePackWeight.toFixed(3)} kg). Wastage: ${(wasteGrams/1000).toFixed(3)} kg (${wastePct.toFixed(1)}% - ${finalReason}). Placed in ${room}. ${notes}`;
    }

    logActivity('Stock Mapping Updated', `${team} (${person}) · ${raw} → ${finished} · ${outQty.toFixed(3)} kg (${packs} pkts) in ${room}`);
    toast('Stock mapping updated successfully.', 'ok');
  } else {
    let entryId = 'pr_' + Date.now() + Math.random().toString(36).slice(2, 6);
    let entry = {
      id: entryId,
      type: 'process_conversion',
      date: date,
      team: team,
      person: person,
      rawProduct: raw,
      rawGrams: rawGrams,
      rawPacks: 0,
      rawUnit: 'kg',
      outProduct: finished,
      outGrams: outGrams,
      outPacks: packs,
      singlePackWeight: singlePackWeight,
      outUnit: 'kg',
      wasteGrams: wasteGrams,
      wastePct: wastePct,
      wasteReason: finalReason,
      storageRoom: room,
      notes: notes,
      createdAt: new Date().toISOString(),
      createdBy: curBy()
    };

    state.storageTx.push(entry);
    rememberHandler(person);

    // Sync with state.tx as a Processing transaction
    txAdd({
      type: 'Processing',
      storageTxId: entryId,
      date: date,
      raw: raw,
      finished: finished,
      inputG: rawGrams,
      outputG: outGrams,
      wasteG: wasteGrams,
      wasteReason: finalReason,
      storageRoom: room,
      team: team,
      person: person,
      packs: packs,
      notes: `${team} (${person}) mapped ${inQty.toFixed(3)} kg of ${raw} → ${outQty.toFixed(3)} kg of ${finished} (${packs} pkts × ${singlePackWeight.toFixed(3)} kg). Wastage: ${(wasteGrams/1000).toFixed(3)} kg (${wastePct.toFixed(1)}% - ${finalReason}). Placed in ${room}. ${notes}`
    });

    logActivity('Operations Meat Mapping', `${team} (${person}) · ${raw} → ${finished} · ${outQty.toFixed(3)} kg (${packs} pkts) moved to ${room}`);
    toast(`Meat mapped & moved to ${room}: ${packs} pkts (${outQty.toFixed(3)} kg) of ${finished}. Wastage: ${(wasteGrams/1000).toFixed(3)} kg (${finalReason}).`, 'ok');
  }

  save();
  closeModal();
  renderOperationsUI();
  renderStorageUI();
  renderMappingUI();
  renderAll();
}

window.openEditMapModal = function(id) {
  let entry = (state.storageTx || []).find(st => st.id === id);
  if (!entry) return toast('Mapping record not found.', 'err');
  openProcessModal(entry.rawProduct, entry.team, entry.person, +(entry.rawGrams / 1000).toFixed(3), entry.singlePackWeight, entry.id);
};

window.openProcessModal = openProcessModal;
window.submitProcess = submitProcess;
window.updateProcTeamRawList = updateProcTeamRawList;
window.updateProcRawDetails = updateProcRawDetails;
window.checkProcCustomOutProd = checkProcCustomOutProd;
window.updateProcessLiveCalc = updateProcessLiveCalc;
window.openHandoverModal = openHandoverModal;
window.submitHandover = submitHandover;

/**
 * Render Operations Cutting & Wastage Log Table
 */
function renderProcessWastageTable() {
  let el = document.getElementById('processWastageTable');
  if (!el) return;
  let list = (state.storageTx || []).filter(st => st.type === 'process_conversion').slice().reverse().slice(0, 100);

  el.innerHTML = list.length ? table(
    ['Date & Time', 'Team & Cutter', 'Raw Used (Input)', 'Finished Cut (Output)', 'Wastage & Loss', 'Reason', 'Cold Storage Room', 'Notes'],
    list.map(st => {
      let rawTxt = fmtQty(st.rawGrams, st.rawUnit === 'packets') + (st.rawPacks > 0 ? ` (${st.rawPacks} pkts)` : '');
      let outTxt = fmtQty(st.outGrams, st.outUnit === 'packets') + (st.outPacks > 0 ? ` (${st.outPacks} pkts)` : '');
      let roomTag = `<span class="tag ${st.storageRoom === 'Frozen Storage' ? 'frozen' : 'fresh'}">${esc(st.storageRoom)}</span>` + (st.location ? `<div class="mini">Loc: ${esc(st.location)}</div>` : '');

      return [
        `<span class="mini">${st.createdAt ? new Date(st.createdAt).toLocaleString('en-IN') : st.date}</span>`,
        `<strong>${esc(st.person || 'Staff')}</strong><br><span class="tag ${st.team === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(st.team)}</span>`,
        `${prodTag(st.rawProduct)}<br><span class="tag in sm">${rawTxt}</span>`,
        `${prodTag(st.outProduct)}<br><span class="tag yield sm">${outTxt}</span>`,
        `<span class="tag waste">Loss: ${fmtG(st.wasteGrams)} (${(st.wastePct || 0).toFixed(1)}%)</span>`,
        `<strong>${esc(st.wasteReason || 'Cutting loss')}</strong>`,
        roomTag,
        esc(st.notes || '—')
      ];
    })
  ) : '<div class="empty">No cutting or processing logged yet. Convert raw meat in the Stock Mapping tab.</div>';
}

/**
 * Render Dashboard Operations Cutting Summary Table
 */
function renderDashProcessTable() {
  let el = document.getElementById('dashProcessTable');
  if (!el) return;
  let list = (state.storageTx || []).filter(st => st.type === 'process_conversion').slice().reverse().slice(0, 7);

  el.innerHTML = list.length ? table(
    ['Date', 'Team & Operator', 'Raw Consumed', 'Finished Cut Produced', 'Wastage', 'Storage Room'],
    list.map(st => [
      esc(st.date),
      `<strong>${esc(st.person || 'Staff')}</strong><br><span class="mini">${esc(st.team)}</span>`,
      `${prodTag(st.rawProduct)}<br><span class="tag in sm">${fmtG(st.rawGrams)}</span>`,
      `${prodTag(st.outProduct)}<br><span class="tag yield sm">${fmtG(st.outGrams)}</span>`,
      `<span class="tag waste sm">${fmtG(st.wasteGrams)} (${(st.wastePct || 0).toFixed(1)}%)</span><br><span class="mini">${esc(st.wasteReason || '')}</span>`,
      `<span class="tag ${st.storageRoom === 'Frozen Storage' ? 'frozen' : 'fresh'} sm">${esc(st.storageRoom)}</span>`
    ])
  ) : '<div class="empty">No cutting logged yet. Map inward stock in the Stock Mapping tab.</div>';
}

/**
 * Render Dashboard Inward Receiving Table (Table 1 on Dashboard)
 */
function renderDashInwardTable() {
  let el = document.getElementById('dashInwardTable');
  if (!el) return;
  let q = (document.getElementById('dashInwardSearch')?.value || '').toLowerCase().trim();
  let d = document.getElementById('dashInwardDate')?.value || '';
  let inw = state.tx.filter(t => t.type === 'Inward').slice().reverse();

  if (d) {
    inw = inw.filter(t => t.date === d);
  }
  if (q) {
    inw = inw.filter(t =>
      (t.product || '').toLowerCase().includes(q) ||
      (t.source || '').toLowerCase().includes(q) ||
      (t.ref || '').toLowerCase().includes(q) ||
      (t.handoverPerson || '').toLowerCase().includes(q)
    );
  }

  el.innerHTML = inw.length ? table(
    ['Date Received', 'Inward Product', 'Supplier / Vendor', 'Received Weight', 'Packets Count', 'Handover Status', 'Assigned Person', 'Action'],
    inw.slice(0, 30).map(t => {
      let isHanded = t.handoverStatus === 'Handed over';
      let statusTag = isHanded
        ? `<span class="tag good">Handed Over</span>`
        : `<span class="tag bad">Pending Handover</span>`;

      let assigned = isHanded
        ? `<strong>${esc(t.handoverPerson || 'Staff')}</strong> <span class="tag ${t.handoverTeam === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(t.handoverTeam || '')}</span>`
        : '<span class="mini">Not assigned</span>';

      let pkts = t.packCount > 0 ? `<strong>${t.packCount}</strong> pkts` : (t.u === 'pcs' ? `<strong>${t.grams}</strong> pcs` : '<span class="mini">—</span>');

      let act = isHanded
        ? `<div class="actions" style="flex-wrap:nowrap">
            <button class="btn light sm" type="button" onclick="openHandoverModal('${t.id}')">Re-assign</button>
            <button class="btn sm" type="button" onclick="openMapModal('${esc(t.product)}', '${esc(t.handoverTeam || 'Fresh Team')}', '${esc(t.handoverPerson || '')}')">Map Stock</button>
           </div>`
        : `<button class="btn sm" type="button" onclick="openHandoverModal('${t.id}')">Handover to Person</button>`;

      return [
        `<span class="mini">${esc(t.date)}</span>${t.ref ? `<br><span class="mini">Ref: ${esc(t.ref)}</span>` : ''}`,
        prodTag(t.product),
        esc(t.source || 'Direct Supplier'),
        `<strong>${fmtQty(t.grams, t.u === 'pcs')}</strong>`,
        pkts,
        statusTag,
        assigned,
        act
      ];
    })
  ) : '<div class="empty">No inward stock found. Click "+ Inward Stock" above to receive arrivals.</div>';
}

/**
 * Render Operation Team Handover Inward Stock List (with date & product filter)
 */
function renderOpHandoverList() {
  ensureStorage(state);
  let el = document.getElementById('opInwardQueueTable');
  if (!el) return;

  // Populate product filter dropdown if needed
  let prodSel = document.getElementById('opHoProd');
  if (prodSel && prodSel.options.length <= 1) {
    let prods = [...new Set(state.tx.filter(t => t.type === 'Inward').map(t => t.product).concat(state.products.map(p => p.name)))].filter(Boolean).sort();
    let cur = prodSel.value;
    prodSel.innerHTML = '<option value="">All Products</option>' + prods.map(p => `<option value="${esc(p)}"${p === cur ? ' selected' : ''}>${esc(p)}</option>`).join('');
  }

  let filterDate = document.getElementById('opHoDate')?.value || '';
  let filterProd = document.getElementById('opHoProd')?.value || '';

  let list = state.tx.filter(t => t.type === 'Inward').slice().reverse();

  if (filterDate) {
    list = list.filter(t => t.date === filterDate);
  }
  if (filterProd) {
    list = list.filter(t => t.product.toLowerCase() === filterProd.toLowerCase());
  }

  el.innerHTML = list.length ? table(
    ['Date Received', 'Product Name', 'Supplier / Vendor', 'Received Weight', 'Packets Count', 'Handover Status', 'Assigned Person', 'Action'],
    list.map(t => {
      let isHanded = t.handoverStatus === 'Handed over';
      let statusTag = isHanded
        ? `<span class="tag good">Handed Over</span>`
        : `<span class="tag bad">Pending Handover</span>`;

      let assigned = isHanded
        ? `<strong>${esc(t.handoverPerson || 'Staff')}</strong> <span class="tag ${t.handoverTeam === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(t.handoverTeam || '')}</span>`
        : '<span class="mini">Not assigned</span>';

      let pkts = t.packCount > 0 ? `<strong>${t.packCount}</strong> pkts` : (t.u === 'pcs' ? `<strong>${t.grams}</strong> pcs` : '<span class="mini">—</span>');

      let act = isHanded
        ? `<div class="actions" style="flex-wrap:nowrap">
            <button class="btn light sm" type="button" onclick="openHandoverModal('${t.id}')">Re-assign</button>
            <button class="btn sm" type="button" onclick="openMapModal('${esc(t.product)}', '${esc(t.handoverTeam || 'Fresh Team')}', '${esc(t.handoverPerson || '')}')">Map Stock</button>
           </div>`
        : `<button class="btn sm" type="button" onclick="openHandoverModal('${t.id}')">Handover to Person</button>`;

      return [
        esc(t.date),
        `<div style="cursor:pointer" onclick="openHandoverModal('${t.id}')" title="Click to handover">${prodTag(t.product)}</div>`,
        esc(t.source || 'Direct Supplier'),
        `<strong>${fmtQty(t.grams, t.u === 'pcs')}</strong>`,
        pkts,
        statusTag,
        assigned,
        act
      ];
    })
  ) : '<div class="empty">No inward stock found matching the filter. Choose another date or product, or receive stock in the Inward tab.</div>';
}

function clearOpFilters() {
  let d = document.getElementById('opHoDate');
  let p = document.getElementById('opHoProd');
  if (d) d.value = '';
  if (p) p.value = '';
  renderOpHandoverList();
}

/**
 * Render Stock Mapping UI (Dedicated Stock Mapping Tab)
 * Table 1: Raw Material In Hand (Waiting for Mapping) - only unmapped in-hand stock
 * Table 2: Completed Mappings in Storage Room (With Option to Edit)
 */
function renderMappingUI() {
  ensureStorage(state);
  let elPending = document.getElementById('mappingTable');
  let elHistory = document.getElementById('mappingHistoryTable');
  if (!elPending && !elHistory) return;

  // Populate person dropdown
  let personSel = document.getElementById('mapPerson');
  if (personSel) {
    let curVal = personSel.value;
    loadUsers();
    let candidateUsers = (AUTH.users || []).map(u => u.name);
    let handlers = [...new Set((state.storageTx || []).map(st => st.person).concat(candidateUsers).concat(state.handlers || []))].filter(Boolean).sort();

    // If logged in as Operation role, lock to current user's name
    if (isOpRole()) {
      let myName = AUTH.cur.name;
      personSel.innerHTML = `<option value="${esc(myName)}" selected>${esc(myName)} (You)</option>`;
      personSel.disabled = true;
      curVal = myName;
    } else {
      personSel.disabled = false;
      let opts = '<option value="">All Persons</option>' + handlers.map(h => `<option value="${esc(h)}"${h === curVal ? ' selected' : ''}>${esc(h)}</option>`).join('');
      if (personSel.innerHTML !== opts) {
        personSel.innerHTML = opts;
      }
    }
  }

  let filterDate = document.getElementById('mapDate')?.value || '';
  let filterPerson = document.getElementById('mapPerson')?.value || '';
  let filterStatus = document.getElementById('mapStatusFilter')?.value || '';
  let qPending = (document.getElementById('mapTableSearch')?.value || '').toLowerCase().trim();
  let qHistory = (document.getElementById('mapHistorySearch')?.value || '').toLowerCase().trim();

  // 1. Table 1: Raw Material in Hand (Waiting for Mapping)
  if (elPending) {
    if (filterStatus === 'completed') {
      elPending.innerHTML = '<div class="empty">Pending table hidden by "Completed only" filter. Select "All Materials" or "Pending Mapping" above.</div>';
    } else {
      let allocations = getInHandAllocations().filter(a => a.qty > 0);

      if (isOpRole()) {
        let myName = (AUTH.cur.name || '').toLowerCase().trim();
        let myUser = (AUTH.cur.username || '').toLowerCase().trim();
        allocations = allocations.filter(a => {
          let p = (a.person || '').toLowerCase().trim();
          return p === myName || p === myUser || p.includes(myUser) || myName.includes(p);
        });
      } else if (filterPerson) {
        allocations = allocations.filter(a => a.person.toLowerCase() === filterPerson.toLowerCase());
      }

      if (filterDate) {
        allocations = allocations.filter(a => a.date === filterDate);
      }
      if (qPending) {
        allocations = allocations.filter(a =>
          a.product.toLowerCase().includes(qPending) ||
          a.person.toLowerCase().includes(qPending) ||
          a.team.toLowerCase().includes(qPending)
        );
      }

      elPending.innerHTML = allocations.length ? table(
        [
          'Date Handed Over',
          'Operation Member',
          'Inward Raw Meat',
          'Assigned Team',
          'Quantity in Hand',
          'Packets & Weight/Packet',
          'Status',
          'Action'
        ],
        allocations.map(a => {
          let packInfo = a.packs > 0 ? `<strong>${a.packs}</strong> pkts <span class="mini">(${a.packWeightKg || 0.5} kg/pkt)</span>` : '<span class="mini">—</span>';
          return [
            `<span class="mini">${esc(a.date)}</span>`,
            `<strong>${esc(a.person)}</strong>`,
            prodTag(a.product),
            `<span class="tag ${a.team === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(a.team)}</span>`,
            `<span class="tag in" style="font-size:12.5px;font-weight:750">${fmtQty(a.qty, a.isPcs)}</span>`,
            packInfo,
            `<span class="tag bad">Waiting for Mapping</span>`,
            `<button class="btn sm" type="button" onclick="openMapModal('${esc(a.product)}', '${esc(a.team)}', '${esc(a.person)}', '${a.isPcs ? a.qty : (a.qty / 1000).toFixed(3)}', '${a.packWeightKg || 0.5}')">Map Usage &amp; Move</button>`
          ];
        })
      ) : `<div class="empty">${isOpRole() ? 'No raw meat currently assigned to you waiting for mapping. Choose another date or ask manager for handover.' : 'No raw meat waiting for mapping. All handed-over meat has been mapped and moved to storage, or handover inward stock in Operation Team tab.'}</div>`;
    }
  }

  // 2. Table 2: Completed Mappings in Storage Room (With Option to Edit)
  if (elHistory) {
    if (filterStatus === 'pending') {
      elHistory.innerHTML = '<div class="empty">Completed table hidden by "Pending only" filter. Select "All Materials" or "Completed" above.</div>';
    } else {
      let conversions = (state.storageTx || []).filter(st => st.type === 'process_conversion').slice().reverse();

      if (isOpRole()) {
        let myName = (AUTH.cur.name || '').toLowerCase().trim();
        let myUser = (AUTH.cur.username || '').toLowerCase().trim();
        conversions = conversions.filter(st => {
          let p = (st.person || '').toLowerCase().trim();
          return p === myName || p === myUser || p.includes(myUser) || myName.includes(p);
        });
      } else if (filterPerson) {
        conversions = conversions.filter(st => (st.person || '').toLowerCase() === filterPerson.toLowerCase());
      }

      if (filterDate) {
        conversions = conversions.filter(st => st.date === filterDate);
      }

      let q = qHistory || qPending;
      if (q) {
        conversions = conversions.filter(st =>
          (st.rawProduct || '').toLowerCase().includes(q) ||
          (st.outProduct || '').toLowerCase().includes(q) ||
          (st.person || '').toLowerCase().includes(q) ||
          (st.wasteReason || '').toLowerCase().includes(q)
        );
      }

      elHistory.innerHTML = conversions.length ? table(
        [
          'Mapping Date',
          'Operation Member',
          'Raw Meat Used',
          'Mapped Finished Cut',
          'Converted Output',
          'Cutting Wastage & Loss',
          'Wastage Reason',
          'Cold Storage Room',
          'Action'
        ],
        conversions.map(st => {
          let outTxt = fmtQty(st.outGrams, st.outUnit === 'packets');
          let outInfo = `<strong>${outTxt}</strong>` + (st.outPacks > 0 ? `<br><span class="mini">${st.outPacks} pkts × ${st.singlePackWeight || 0.5} kg</span>` : '');
          let wasteTxt = st.wasteGrams > 0
            ? `<span class="tag waste sm">Loss: ${fmtG(st.wasteGrams)} (${(st.wastePct || 0).toFixed(1)}%)</span>`
            : `<span class="tag good sm">Zero loss (100%)</span>`;

          let roomTag = `<span class="tag ${st.storageRoom === 'Frozen Storage' ? 'frozen' : 'fresh'}">${esc(st.storageRoom || 'Fresh Storage')}</span>`;

          return [
            `<span class="mini">${st.createdAt ? new Date(st.createdAt).toLocaleDateString('en-IN') : st.date}</span>`,
            `<strong>${esc(st.person || 'Staff')}</strong><br><span class="tag ${st.team === 'Frozen Team' ? 'frozen' : 'fresh'} sm">${esc(st.team)}</span>`,
            `${prodTag(st.rawProduct)}<br><span class="tag in sm">${fmtQty(st.rawGrams, false)}</span>`,
            `${prodTag(st.outProduct)}`,
            outInfo,
            wasteTxt,
            `<strong>${esc(st.wasteReason || '—')}</strong>`,
            roomTag,
            `<button class="btn light sm" type="button" onclick="openEditMapModal('${st.id}')">Edit Mapping</button>`
          ];
        })
      ) : '<div class="empty">No completed mappings found matching filters. Convert raw meat in Table 1 above.</div>';
    }
  }
}

window.openMapModal = function(prod, team, person, qty, packWeight) {
  openProcessModal(prod, team, person, qty, packWeight);
};
window.renderOpHandoverList = renderOpHandoverList;
window.clearOpFilters = clearOpFilters;
window.renderMappingUI = renderMappingUI;
