/**
 * Laa Fresh Stock Manager - Vendor Management, Reconciliation, Opening Balances & OpenXML Excel Generator
 */
const $ = id => document.getElementById(id);
const inr = n => '₹' + (Number(n) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

function ensureV(s) {
  if (!Array.isArray(s.suppliers)) s.suppliers = SUPPLIERS.slice();
  if (!Array.isArray(s.bills)) s.bills = [];
  if (!s.vmap) s.vmap = {};
  if (!s.vrate) s.vrate = {};
  if (!Array.isArray(s.vextra)) s.vextra = [];
  if (!Array.isArray(s.activityLog)) s.activityLog = [];
  if (!s.vsup) {
    s.vsup = 1;
    Object.keys(VP).forEach(n => {
      if (!s.suppliers.some(x => x.toLowerCase() === n.toLowerCase())) s.suppliers.push(n);
    });
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {}
}

function vItems(sup) {
  let lc = String(sup).toLowerCase(),
      k = Object.keys(VP).find(x => x.toLowerCase() === lc),
      base = (VP[k] || []).map(x => ({ cat: x.cat, name: x.name, unit: x.unit, rate: x.rate, extra: 0 }))
        .concat(state.vextra.filter(x => x.sup.toLowerCase() === lc).map(x => ({ cat: x.cat, name: x.name, unit: x.unit, rate: x.rate, extra: 1 }))),
      cnt = {};
  base.forEach(x => cnt[x.name] = (cnt[x.name] || 0) + 1);
  base.forEach(x => {
    x.label = x.name + (cnt[x.name] > 1 ? ' [' + x.cat + ']' : '');
    let o = state.vrate[sup + '|' + x.label];
    if (o != null) x.rate = o;
  });
  return base;
}

function tok(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w && !['with', 'without', 'the', 'of'].includes(w));
}

function bestItem(sup, prod, items) {
  let m = state.vmap[sup + '|' + prod];
  if (m) {
    let x = items.find(i => i.label === m);
    if (x) return x;
  }
  let pt = tok(prod), best = null, bs = 0;
  items.forEach(i => {
    let it = tok(i.name), c = pt.filter(w => it.includes(w)).length;
    if (!c) return;
    let sc = c / it.length + c / pt.length;
    if (sc > bs) { bs = sc; best = i; }
  });
  return bs >= 0.8 ? best : null;
}

function defQty(t, u) {
  let kg = t.u === 'pcs' ? t.grams : t.grams / 1000;
  if (u === 'kg') return +kg.toFixed(3);
  return t.packCount > 0 ? t.packCount : +kg.toFixed(3);
}

function buildLines(sup, date) {
  let items = vItems(sup), lc = sup.toLowerCase(),
      b = state.bills.find(x => !x.additional && x.supplier === sup && x.date === date),
      L = [];
  state.tx.filter(t => t.type === 'Inward' && String(t.source || '').toLowerCase() === lc && t.date === date).forEach(t => {
    let inw = t.product + ' · ' + fmtQty(t.grams, t.u === 'pcs'),
        sv = b && b.lines.find(l => String(l.tid) === String(t.id));
    if (sv) {
      L.push(Object.assign({}, sv, { inw, prod: t.product }));
      return;
    }
    let it = bestItem(sup, t.product, items);
    L.push({
      tid: t.id,
      prod: t.product,
      inw,
      item: it ? it.label : '',
      unit: it ? it.unit : (t.u === 'pcs' ? 'pcs' : 'kg'),
      rate: it ? it.rate : 0,
      qty: defQty(t, it ? it.unit : 'kg')
    });
  });
  if (b) b.lines.filter(l => l.tid == null).forEach(l => L.push(Object.assign({}, l)));
  return L;
}

let vcur = { sup: '', date: '', lines: [] };

function vBillOf(sup, date) {
  return state.bills.find(x => !x.additional && x.supplier === sup && x.date === date);
}

function vLoad() {
  let sup = $('vSup').value, date = $('vDate').value,
      b = sup && date ? vBillOf(sup, date) : null;
  vcur = { sup, date, lines: sup && date ? buildLines(sup, date) : [] };
  $('vClaimed').value = b && b.claimed > 0 ? b.claimed : '';
  $('vPaid').value = b && b.paid > 0 ? b.paid : '';
  $('vPdate').value = b ? b.pdate || '' : '';
  $('vUtr').value = b ? b.utr || '' : '';
  $('vNotes').value = b ? b.notes || '' : '';
  $('vDelBtn').style.display = b ? '' : 'none';
  vRows();
  vRates();
  $('vStatus').value = b ? payStatus(vTot(b)) : 'Unpaid';
  $('vInfo').textContent = !sup
    ? 'Choose a vendor to see that day’s inward stock with rates.'
    : (b ? 'Saved bill loaded.' : (vcur.lines.length ? '' : 'No inward entries from this vendor on this date. You can add extra lines.'));
}

function vRows() {
  let items = vItems(vcur.sup);
  $('vDL').innerHTML = items.map(i => `<option value="${esc(i.label)}">`).join('');
  $('vLines').innerHTML = vcur.lines.length ? '<table><thead><tr><th>Inward received</th><th>Vendor item (mapped)</th><th>Unit</th><th>Rate / MRP ₹</th><th>Qty</th><th>Amount</th><th></th></tr></thead><tbody>' + vcur.lines.map((l, i) => `
    <tr data-i="${i}">
      <td>${l.inw ? esc(l.inw) : '<span class="mini">extra line</span>'}</td>
      <td><input list="vDL" data-f="item" value="${esc(l.item)}" placeholder="Pick / type item" style="min-width:230px"></td>
      <td><select data-f="unit" style="width:80px"><option${l.unit === 'kg' ? ' selected' : ''}>kg</option><option${l.unit === 'pcs' ? ' selected' : ''}>pcs</option></select></td>
      <td><input data-f="rate" type="number" step="0.01" min="0" value="${l.rate}" style="width:110px"></td>
      <td><input data-f="qty" type="number" step="0.001" min="0" value="${l.qty}" style="width:100px"></td>
      <td><strong class="vamt">${inr(l.rate * l.qty)}</strong></td>
      <td>${l.tid == null ? '<button type="button" class="icon-btn" data-rm="1">✕</button>' : ''}</td>
    </tr>`).join('') + '</tbody></table>' : '<div class="empty">Nothing to bill yet.</div>';
  vCalc();
}

function vTotal(lines) {
  return r2((lines || []).reduce((a, l) => a + (+l.rate || 0) * (+l.qty || 0), 0));
}

function vTot(b) {
  let computed = vTotal(b.lines),
      claimed = +b.claimed || 0,
      payable = claimed > 0 ? claimed : (b.amount > 0 ? b.amount : computed),
      paid = +b.paid || 0;
  return {
    computed,
    claimed,
    diff: claimed > 0 ? r2(claimed - computed) : 0,
    payable,
    paid,
    out: r2(payable - paid)
  };
}

function payStatus(t) {
  return t.paid <= 0 ? 'Unpaid' : (t.out <= 0.5 ? 'Paid' : 'Part paid');
}

function vCalc() {
  let computed = vTotal(vcur.lines),
      claimed = +$('vClaimed').value || 0,
      payable = claimed > 0 ? claimed : computed,
      paid = +$('vPaid').value || 0,
      out = r2(payable - paid),
      d = r2(claimed - computed);
  $('vComputed').textContent = inr(computed);
  $('vPayable').textContent = inr(payable);
  $('vOut').textContent = inr(out);
  let el = $('vDiff');
  if (!(claimed > 0)) {
    el.innerHTML = '<span class="mini">Enter the vendor’s claimed bill to see the difference</span>';
  } else if (Math.abs(d) < 0.5) {
    el.innerHTML = '<span class="tag good">Matches rate card</span>';
  } else if (d > 0) {
    el.innerHTML = '<span class="tag bad">Vendor claims ' + inr(d) + ' MORE</span>';
  } else {
    el.innerHTML = '<span class="tag pr">Vendor claims ' + inr(-d) + ' LESS</span>';
  }
}

function vSave() {
  if (!vcur.sup || !vcur.date) return toast('Choose vendor and date first.', 'err');
  let lines = vcur.lines.filter(l => l.tid != null || l.item || (+l.qty > 0));
  if (!lines.length && !(+$('vClaimed').value > 0)) return toast('Nothing to save: no lines and no claimed amount.', 'err');
  let t0 = { computed: 0, claimed: +$('vClaimed').value || 0 };
  let paid = +$('vPaid').value || 0,
      st = $('vStatus').value,
      payable = t0.claimed > 0 ? t0.claimed : vTotal(lines);
  if (st === 'Paid' && !(paid > 0)) paid = payable;
  if (st === 'Unpaid') paid = 0;
  let b = vBillOf(vcur.sup, vcur.date), isNew = !b;
  if (!b) {
    b = { id: Date.now() + Math.random(), supplier: vcur.sup, date: vcur.date };
    state.bills.push(b);
  }
  Object.assign(b, {
    lines: lines.map(l => ({
      tid: l.tid == null ? null : l.tid,
      prod: l.prod || '',
      item: l.item,
      unit: l.unit,
      rate: +l.rate || 0,
      qty: +l.qty || 0
    })),
    claimed: t0.claimed,
    paid: paid,
    pdate: paid > 0 ? ($('vPdate').value || dateNow()) : '',
    utr: $('vUtr').value.trim(),
    notes: $('vNotes').value.trim()
  });
  stampRecord(b, isNew);
  logActivity(isNew ? 'Vendor bill added' : 'Vendor bill updated', `${b.supplier} · ${b.date} · ₹${vTot(b).payable.toFixed(2)}`);
  lines.forEach(l => {
    if (l.tid != null && l.prod && l.item) state.vmap[vcur.sup + '|' + l.prod] = l.item;
  });
  save();
  vLoad();
  renderVendors(true);
  toast('Vendor bill saved.', 'ok');
}

function vDelete() {
  let b = vBillOf(vcur.sup, vcur.date);
  if (!b) return;
  showModal(`<div class="big">🗑</div><h3>Delete this vendor bill?</h3><p>${esc(b.supplier)} · ${esc(b.date)}. Inward stock is not affected, only the bill and payment details are removed.</p><div class="actions"><button class="btn light" data-cancel>Keep it</button><button class="btn danger" data-ok>Yes, delete</button></div>`, () => {
    state.bills = state.bills.filter(x => x !== b);
    logActivity('Vendor bill deleted', `${b.supplier} · ${b.date}`);
    save();
    vLoad();
    renderVendors(true);
    toast('Bill deleted.', 'ok');
  });
}

function vFiltered() {
  let f = $('vfFrom').value, t = $('vfTo').value, s = $('vfSup').value;
  return state.bills.filter(b => (!f || b.date >= f) && (!t || b.date <= t) && (!s || b.supplier === s))
    .map(b => Object.assign({ b }, vTot(b)))
    .map(x => Object.assign(x, { status: payStatus(x) }));
}

function vGroup(list, keyf) {
  let m = {};
  list.forEach(x => {
    let k = keyf(x), g = m[k] = m[k] || { n: 0, payable: 0, paid: 0, out: 0 };
    g.n++;
    g.payable += x.payable;
    g.paid += x.paid;
    g.out += x.out;
  });
  return m;
}

function vSt(s) {
  return `<span class="tag ${s === 'Paid' ? 'good' : s === 'Part paid' ? 'out' : 'bad'}">${s}</span>`;
}

/* ================= VENDOR KPI SUMMARY STAT CARDS ================= */

function renderVendorKpis() {
  let el = $('vendorKpiCards');
  if (!el) return;
  let all = state.bills.map(b => Object.assign({ b }, vTot(b)));
  let payable = all.reduce((a, x) => a + x.payable, 0);
  let paid = all.reduce((a, x) => a + x.paid, 0);
  let out = all.reduce((a, x) => a + x.out, 0);
  let openings = all.filter(x => x.b.isOpening).length;

  el.innerHTML = [
    { title: 'Total Vendor Dues / Bills', val: inr(payable), sub: `${all.length} total bills & charges`, border: 'pay-border' },
    { title: 'Total Payments Made', val: inr(paid), sub: 'Recorded payments with UTR', border: 'paid-border' },
    { title: 'Payment Left (Outstanding)', val: inr(out), sub: out > 0.5 ? 'Pending vendor payments' : 'All clear / no dues', border: 'out-border' },
    { title: 'Opening Balance Records', val: openings, sub: 'Carried forward payment balances', border: 'open-border' }
  ].map(c => `
    <div class="vendor-kpi-card ${c.border}">
      <div class="label">${c.title}</div>
      <div class="num" style="font-size:22px;margin:4px 0">${c.val}</div>
      <small style="color:var(--muted)">${c.sub}</small>
    </div>
  `).join('');
}

/* ================= OPENING BALANCE / EXISTING PAYMENT LEFT ================= */

window.openVendorOpeningBalanceModal = function(defaultSup) {
  ensureV(state);
  let supList = state.suppliers.slice().sort((a, b) => a.localeCompare(b));
  let curSup = defaultSup || $('vSup')?.value || (supList[0] || '');

  showModal(`
    <div class="big">🏷️</div>
    <h3>Add Existing Payment Left (Opening Balance)</h3>
    <p>Record an opening unpaid balance for a vendor carried forward from previous ledgers or before using this software. This records a financial liability without creating or moving stock.</p>
    <form id="vOpeningForm" onsubmit="event.preventDefault(); submitVendorOpeningBalance();">
      <div class="formgrid" style="margin:14px 0">
        <div class="field">
          <label>Vendor / Supplier</label>
          <select id="mdlOpSup" required>
            ${supList.map(s => `<option value="${esc(s)}"${s === curSup ? ' selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>As-of Date</label>
          <input id="mdlOpDate" type="date" value="${dateNow()}" required>
        </div>
        <div class="field">
          <label>Existing Payment Left / Opening Outstanding ₹</label>
          <input id="mdlOpAmount" type="number" step="0.01" min="0.01" placeholder="e.g. 25000" required>
        </div>
        <div class="field">
          <label>Amount Already Paid ₹ (optional)</label>
          <input id="mdlOpPaid" type="number" step="0.01" min="0" value="0">
        </div>
        <div class="field">
          <label>Payment Date (if paid)</label>
          <input id="mdlOpPdate" type="date">
        </div>
        <div class="field">
          <label>UTR Number / Ref</label>
          <input id="mdlOpUtr" placeholder="UTR transaction number if paid">
        </div>
        <div class="field full">
          <label>Reference / Invoice Note</label>
          <input id="mdlOpRef" placeholder="e.g. Opening Balance before system launch / Ledger carry forward" value="Opening Balance">
        </div>
        <div class="field full">
          <label>Notes / Remarks</label>
          <input id="mdlOpNotes" placeholder="e.g. Agreed opening dues pending settlement">
        </div>
      </div>
      <div class="actions">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">✓ Save Opening Balance</button>
      </div>
    </form>
  `);
};

window.submitVendorOpeningBalance = function() {
  let sup = $('mdlOpSup').value.trim(),
      date = $('mdlOpDate').value || dateNow(),
      amount = +$('mdlOpAmount').value || 0,
      paid = +$('mdlOpPaid').value || 0,
      pdate = $('mdlOpPdate').value,
      utr = $('mdlOpUtr').value.trim(),
      ref = $('mdlOpRef').value.trim() || 'Opening Balance',
      notes = $('mdlOpNotes').value.trim() || 'Existing payment left';

  if (!sup) return toast('Please select a vendor.', 'err');
  if (amount <= 0) return toast('Please enter a valid opening amount.', 'err');
  if (paid > amount) return toast('Amount paid cannot exceed total balance.', 'err');

  closeModal();

  let b = {
    id: 'op_' + Date.now() + Math.random().toString(36).slice(2, 6),
    supplier: sup,
    date: date,
    isOpening: true,
    additional: true, // Strictly financial, zero stock movement
    lines: [{
      tid: null,
      prod: '★ Existing Payment Left',
      item: 'Opening Balance',
      unit: 'bill',
      rate: amount,
      qty: 1
    }],
    claimed: amount,
    amount: amount,
    paid: paid,
    pdate: paid > 0 ? (pdate || dateNow()) : '',
    utr: utr,
    ref: ref,
    notes: notes
  };

  stampRecord(b, true);
  state.bills.push(b);
  logActivity('Vendor opening payment recorded', `${sup} · ${date} · ₹${amount.toFixed(2)} (Ref: ${ref})`);
  save();
  renderVendors(true);
  toast(`Opening balance of ${inr(amount)} recorded for ${sup}.`, 'ok');
};

/* ================= QUICK PAYMENT RECORDING ================= */

window.openQuickPayModal = function(billId) {
  let b = state.bills.find(x => String(x.id) === String(billId));
  if (!b) return toast('Bill not found.', 'err');
  let t = vTot(b);
  let pending = t.out;

  showModal(`
    <div class="big">💰</div>
    <h3>Record Payment · ${esc(b.supplier)}</h3>
    <p>Bill Date: <b>${esc(b.date)}</b> · Reference: <b>${esc(b.ref || b.notes || (b.isOpening ? 'Opening Balance' : 'Bill'))}</b></p>
    <div class="calc" style="margin:12px 0 16px">
      <div><span>Total Bill Amount</span><br><b>${inr(t.payable)}</b></div>
      <div><span>Already Paid</span><br><b style="color:#12805a">${inr(t.paid)}</b></div>
      <div><span>Payment Left</span><br><b style="color:#b42332">${inr(pending)}</b></div>
    </div>
    <form id="quickPayForm" onsubmit="event.preventDefault(); submitQuickPay('${b.id}');">
      <div class="formgrid">
        <div class="field">
          <label>Payment Amount ₹</label>
          <input id="mdlPayAmount" type="number" step="0.01" min="0.01" max="${pending > 0 ? pending : ''}" value="${pending > 0 ? pending : ''}" required>
        </div>
        <div class="field">
          <label>Payment Date</label>
          <input id="mdlPayDate" type="date" value="${dateNow()}" required>
        </div>
        <div class="field">
          <label>UTR Number / Transaction Ref</label>
          <input id="mdlPayUtr" placeholder="e.g. UTR123456789" required>
        </div>
        <div class="field">
          <label>Payment Mode / Notes</label>
          <input id="mdlPayNotes" placeholder="e.g. NEFT / IMPS / Cheque">
        </div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="btn light" type="button" data-cancel>Cancel</button>
        <button class="btn" type="submit">✓ Confirm &amp; Save Payment</button>
      </div>
    </form>
  `);
};

window.submitQuickPay = function(billId) {
  let b = state.bills.find(x => String(x.id) === String(billId));
  if (!b) return;
  let payAmt = +$('mdlPayAmount').value || 0;
  let pdate = $('mdlPayDate').value || dateNow();
  let utr = $('mdlPayUtr').value.trim();
  let notes = $('mdlPayNotes').value.trim();

  if (payAmt <= 0) return toast('Please enter a valid payment amount.', 'err');

  let curPaid = +b.paid || 0;
  b.paid = r2(curPaid + payAmt);
  b.pdate = pdate;
  if (utr) b.utr = utr;
  if (notes) b.notes = (b.notes ? b.notes + ' · ' : '') + notes;
  stampRecord(b, false);

  logActivity('Vendor payment recorded', `${b.supplier} · Paid ₹${payAmt.toFixed(2)} (UTR: ${utr || '—'})`);
  save();
  closeModal();
  renderVendors(true);
  toast(`Recorded payment of ${inr(payAmt)} to ${b.supplier}.`, 'ok');
};

window.scrollToExtraBillForm = function() {
  let el = $('extraBillSection');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  let sel = $('vExtraSup');
  if (sel) sel.focus();
};

/* ================= ADDITIONAL VENDOR BILLS (NO STOCK MOVEMENT) ================= */

let vExtraEditId = null, vExtraLines = [];

function vExtraTotal() {
  return r2(vExtraLines.reduce((a, l) => a + (+l.qty || 0) * (+l.rate || 0), 0));
}

function vExtraProductOptions() {
  let sup = $('vExtraSup').value;
  let dl = $('vExtraDL');
  if (!dl) return;

  let items = sup ? vItems(sup) : [];
  let servicePresets = [
    { label: 'Packing Covers / Bags', unit: 'pkt', rate: 250 },
    { label: 'Thermocol Boxes', unit: 'box', rate: 180 },
    { label: 'Ice Blocks (50kg)', unit: 'box', rate: 120 },
    { label: 'Dry Ice (Freezer pack)', unit: 'kg', rate: 90 },
    { label: 'Vehicle Freight / Delivery', unit: 'trip', rate: 1200 },
    { label: 'Loading & Unloading Wages', unit: 'bill', rate: 500 },
    { label: 'Crate Rent & Washing', unit: 'pcs', rate: 25 }
  ];

  let allOpts = items.map(i => `<option value="${esc(i.label)}">${esc(i.label)} · ${inr(i.rate)}/${esc(i.unit)}</option>`)
    .concat(servicePresets.map(s => `<option value="${esc(s.label)}">${esc(s.label)} · ${inr(s.rate)}/${esc(s.unit)}</option>`));

  dl.innerHTML = allOpts.join('');

  let pInp = $('vExtraProduct');
  if (pInp && !vExtraEditId) {
    pInp.value = '';
    $('vExtraQty').value = '';
    $('vExtraRate').value = '';
  }
}

function vExtraProductAutoFill() {
  let sup = $('vExtraSup').value;
  let val = ($('vExtraProduct')?.value || '').trim();
  if (!val) return;
  let items = sup ? vItems(sup) : [];
  let it = items.find(i => i.label.toLowerCase() === val.toLowerCase() || i.name.toLowerCase() === val.toLowerCase());
  if (it) {
    if (!$('vExtraRate').value) $('vExtraRate').value = it.rate;
    if ($('vExtraUnit')) $('vExtraUnit').value = it.unit;
  }
}

function renderExtraLines() {
  let el = $('vExtraLinesTable');
  if (!el) return;

  el.innerHTML = vExtraLines.length ? table(
    ['Product / Service', 'Quantity', 'Unit', 'Price / Rate ₹ (Editable)', 'Amount ₹', ''],
    vExtraLines.map((l, i) => [
      `<strong>${esc(l.prod || l.item)}</strong>`,
      `<input class="tbl-edit-input" type="number" min="0.001" step="0.001" value="${l.qty}" onchange="vUpdateExtraLineQty(${i}, this.value)" style="width:85px">`,
      esc(l.unit),
      `<input class="tbl-edit-input" type="number" min="0" step="0.01" value="${l.rate}" onchange="vUpdateExtraLineRate(${i}, this.value)" style="width:110px">`,
      `<strong>${inr((+l.qty || 0) * (+l.rate || 0))}</strong>`,
      `<button type="button" class="icon-btn" onclick="vExtraRemoveLine(${i})">✕</button>`
    ])
  ) : '<div class="empty">Type or pick a product/service, enter quantity &amp; price, and click "＋ Add to Bill".</div>';

  let sum = vExtraTotal();
  let amtEl = $('vExtraAmount');
  if (amtEl) {
    if (vExtraLines.length > 0 || !amtEl.value || +amtEl.value === 0) {
      amtEl.value = sum > 0 ? sum.toFixed(2) : '';
    }
  }
}

window.vUpdateExtraLineQty = function(i, val) {
  if (vExtraLines[i]) {
    vExtraLines[i].qty = +val || 0;
    renderExtraLines();
  }
};

window.vUpdateExtraLineRate = function(i, val) {
  if (vExtraLines[i]) {
    vExtraLines[i].rate = +val || 0;
    renderExtraLines();
  }
};

window.vExtraRemoveLine = function(i) {
  vExtraLines.splice(i, 1);
  renderExtraLines();
};

function vExtraFormReset() {
  vExtraEditId = null;
  vExtraLines = [];
  $('vExtraBillForm').reset();
  $('vExtraDate').value = dateNow();
  $('vExtraPaid').value = '0';
  $('vExtraCancel').style.display = 'none';
  $('vExtraBillForm').querySelector('button[type=submit]').textContent = '＋ Save additional bill';
  vExtraProductOptions();
  renderExtraLines();
}

function renderExtraBills() {
  let el = $('vExtraBillTable');
  if (!el) return;
  let list = state.bills.filter(b => b.additional).slice().sort((a, b) => b.date.localeCompare(a.date));

  el.innerHTML = list.length ? table(
    ['Date', 'Vendor', 'Type', 'Description / Items', 'Total Payable', 'Paid', 'Payment Left', 'Action'],
    list.map(b => {
      let t = vTot(b);
      let desc = (b.lines || []).map(l => `${l.prod || l.item} (${l.qty} ${l.unit} @ ₹${l.rate})`).join(', ');
      let typeTag = b.isOpening
        ? '<span class="tag opening">★ Opening Balance</span>'
        : '<span class="tag nostock">📦 No Stock Bill</span>';

      let outColor = t.out > 0.5 ? '#b42332' : '#12805a';

      return [
        esc(b.date),
        `<strong>${esc(b.supplier)}</strong>`,
        typeTag,
        `<span class="mini">${esc(desc || b.ref || b.notes || 'Additional charge')}</span>`,
        inr(t.payable),
        inr(t.paid),
        `<strong style="color:${outColor}">${inr(t.out)}</strong>`,
        `<div class="actions" style="flex-wrap:nowrap">
          ${t.out > 0.5 ? `<button class="btn sm" type="button" onclick="openQuickPayModal('${b.id}')">💰 Pay</button>` : ''}
          <button class="icon-btn" type="button" onclick="vEditExtraBill('${b.id}')">✏️ Edit</button>
          <button class="icon-btn" type="button" onclick="vDeleteExtraBill('${b.id}')">🗑 Delete</button>
        </div>`
      ];
    })
  ) : '<div class="empty">No additional bills or opening balances recorded yet.</div>';
}

function fillExtraSup() {
  let sel = $('vExtraSup');
  if (!sel) return;
  let old = sel.value,
      names = [...new Set([...state.suppliers, ...state.bills.map(b => b.supplier)])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Choose vendor</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (names.includes(old)) sel.value = old;
  vExtraProductOptions();
}

window.vEditExtraBill = function(id) {
  let b = state.bills.find(x => x.additional && String(x.id) === String(id));
  if (!b) return;
  vExtraEditId = b.id;
  fillExtraSup();
  $('vExtraSup').value = b.supplier;
  vExtraProductOptions();
  $('vExtraDate').value = b.date;
  $('vExtraRef').value = b.ref || '';
  $('vExtraPaid').value = b.paid || 0;
  $('vExtraPdate').value = b.pdate || '';
  $('vExtraUtr').value = b.utr || '';
  $('vExtraNotes').value = b.notes || '';
  vExtraLines = (b.lines || []).map(l => ({
    ...l,
    prod: l.prod || l.item || '',
    item: l.item || l.prod || '',
    unit: l.unit || 'pcs',
    rate: +l.rate || 0,
    qty: +l.qty || 1
  }));
  renderExtraLines();
  let tot = vTot(b);
  $('vExtraAmount').value = tot.payable.toFixed(2);
  $('vExtraCancel').style.display = '';
  $('vExtraBillForm').querySelector('button[type=submit]').textContent = '✓ Update bill pricing & details';
  $('vExtraBillForm').scrollIntoView({ behavior: 'smooth', block: 'center' });
};

window.vDeleteExtraBill = function(id) {
  let b = state.bills.find(x => x.additional && String(x.id) === String(id));
  if (!b) return;
  let label = b.isOpening ? 'opening balance record' : 'additional bill';
  showModal(`
    <div class="big">🗑</div>
    <h3>Delete this ${label}?</h3>
    <p>${esc(b.supplier)} · ${esc(b.date)} · ${inr(vTot(b).payable)}. Stock is not affected.</p>
    <div class="actions">
      <button class="btn light" data-cancel>Cancel</button>
      <button class="btn danger" data-ok>Delete</button>
    </div>
  `, () => {
    state.bills = state.bills.filter(x => x !== b);
    logActivity(`Additional no-stock bill deleted`, `${b.supplier} · ${b.date}`);
    save();
    renderExtraBills();
    renderVendors(true);
    toast('Bill deleted.', 'ok');
  });
};

function saveExtraBill(e) {
  e.preventDefault();
  let sup = $('vExtraSup').value;
  let date = $('vExtraDate').value;
  let lineTotal = vExtraTotal();
  let rawAmt = +$('vExtraAmount').value;
  let amount = rawAmt > 0 ? rawAmt : lineTotal;
  let paid = +$('vExtraPaid').value || 0;

  if (!sup || !date) return toast('Please choose a vendor and date.', 'err');
  if (amount <= 0 && !vExtraLines.length) return toast('Please add at least one line or enter a bill amount.', 'err');
  if (paid > amount) return toast('Amount paid cannot exceed total bill amount.', 'err');

  let b = vExtraEditId ? state.bills.find(x => x.additional && String(x.id) === String(vExtraEditId)) : null;
  let isNew = !b;
  if (!b) {
    b = { id: Date.now() + Math.random(), supplier: sup, date, additional: true, lines: [] };
    state.bills.push(b);
  }

  let finalLines = vExtraLines.length > 0
    ? vExtraLines.map(l => ({
        tid: null,
        prod: l.prod || l.item || 'Item',
        item: l.item || l.prod || 'Item',
        unit: l.unit || 'pcs',
        rate: +l.rate || 0,
        qty: +l.qty || 1
      }))
    : [{
        tid: null,
        prod: $('vExtraRef').value.trim() || 'Additional charge',
        item: 'Additional bill',
        unit: 'bill',
        rate: amount,
        qty: 1
      }];

  Object.assign(b, {
    supplier: sup,
    date,
    additional: true,
    lines: finalLines,
    claimed: amount,
    amount: amount,
    paid: paid,
    pdate: paid > 0 ? ($('vExtraPdate').value || dateNow()) : '',
    utr: $('vExtraUtr').value.trim(),
    ref: $('vExtraRef').value.trim(),
    notes: $('vExtraNotes').value.trim()
  });

  stampRecord(b, isNew);
  logActivity(
    isNew ? 'Additional no-stock bill added' : 'Additional no-stock bill updated',
    `${b.supplier} · ${b.date} · ₹${amount.toFixed(2)} (${finalLines.length} items)`
  );

  save();
  vExtraFormReset();
  fillExtraSup();
  renderExtraBills();
  renderVendors(true);
  renderVendorDashboard();
  toast('Additional vendor bill saved. Stock was not changed.', 'ok');
}

/* ================= VENDOR MASTER INITIALIZATION & TABLES ================= */

function vInit() {
  ensureV(state);
  fillExtraSup();
  vExtraFormReset();

  $('vExtraBillForm').onsubmit = saveExtraBill;
  $('vExtraCancel').onclick = vExtraFormReset;
  $('vExtraSup').onchange = () => { vExtraProductOptions(); };
  $('vExtraProduct').oninput = vExtraProductAutoFill;

  $('vExtraAddLine').onclick = () => {
    let pInp = $('vExtraProduct');
    let name = (pInp ? pInp.value : '').trim();
    let qty = +$('vExtraQty').value || 1;
    let unit = $('vExtraUnit').value || 'pcs';
    let rate = +$('vExtraRate').value || 0;

    if (!name) return toast('Please type or pick an item or service name.', 'err');
    if (qty <= 0) return toast('Quantity must be greater than zero.', 'err');

    vExtraLines.push({
      prod: name,
      item: name,
      unit: unit,
      rate: rate,
      qty: qty
    });

    pInp.value = '';
    $('vExtraQty').value = '';
    $('vExtraRate').value = '';
    renderExtraLines();
  };

  renderExtraBills();
  renderVendorKpis();

  ['vPdate', 'vfFrom', 'vfTo'].forEach(i => $(i).value = '');
  $('vDate').value = dateNow();
  $('vSup').onchange = vLoad;
  $('vDate').onchange = vLoad;

  $('vLines').addEventListener('input', e => {
    let r = vRowOf(e.target), f = e.target.dataset.f;
    if (!r || !f || f === 'item') return;
    r.l[f] = f === 'unit' ? e.target.value : e.target.value;
    r.tr.querySelector('.vamt').textContent = inr(r.l.rate * r.l.qty);
    vCalc();
  });

  $('vLines').addEventListener('change', e => {
    let r = vRowOf(e.target);
    if (e.target.dataset.rm && r) return;
    if (!r || e.target.dataset.f !== 'item') return;
    let v = e.target.value.trim(),
        it = vItems(vcur.sup).find(i => i.label.toLowerCase() === v.toLowerCase());
    r.l.item = it ? it.label : v;
    if (it) {
      e.target.value = it.label;
      r.l.unit = it.unit;
      r.l.rate = it.rate;
      r.tr.querySelector('[data-f=unit]').value = it.unit;
      r.tr.querySelector('[data-f=rate]').value = it.rate;
      if (r.l.tid != null) {
        let t = state.tx.find(x => String(x.id) === String(r.l.tid));
        if (t) {
          r.l.qty = defQty(t, it.unit);
          r.tr.querySelector('[data-f=qty]').value = r.l.qty;
        }
      }
    }
    r.tr.querySelector('.vamt').textContent = inr(r.l.rate * r.l.qty);
    vCalc();
  });

  $('vLines').addEventListener('click', e => {
    if (e.target.dataset.rm) {
      let r = vRowOf(e.target);
      vcur.lines.splice(+r.tr.dataset.i, 1);
      vRows();
    }
  });

  $('vAddLine').onclick = () => {
    if (!vcur.sup) return toast('Choose a vendor first.', 'err');
    vcur.lines.push({ tid: null, prod: '', inw: '', item: '', unit: 'kg', rate: 0, qty: 0 });
    vRows();
  };

  ['vClaimed', 'vPaid'].forEach(i => $(i).addEventListener('input', vCalc));

  $('vStatus').onchange = () => {
    let s = $('vStatus').value,
        claimed = +$('vClaimed').value || 0,
        pay = claimed > 0 ? claimed : vTotal(vcur.lines);
    if (s === 'Paid') {
      $('vPaid').value = pay;
      if (!$('vPdate').value) $('vPdate').value = dateNow();
    } else if (s === 'Unpaid') {
      $('vPaid').value = '';
      $('vPdate').value = '';
      $('vUtr').value = '';
    }
    vCalc();
  };

  $('vPaid').addEventListener('input', () => {
    let p = +$('vPaid').value || 0,
        claimed = +$('vClaimed').value || 0,
        pay = claimed > 0 ? claimed : vTotal(vcur.lines);
    $('vStatus').value = p <= 0 ? 'Unpaid' : (pay - p <= 0.5 ? 'Paid' : 'Part paid');
    if (p > 0 && !$('vPdate').value) $('vPdate').value = dateNow();
  });

  $('vSaveBtn').onclick = vSave;
  $('vDelBtn').onclick = () => { if (needAdmin('delete vendor bills')) vDelete(); };

  $('vRateTable').addEventListener('change', e => {
    let lab = e.target.dataset.lab;
    if (!lab) return;
    state.vrate[$('vSup').value + '|' + lab] = +e.target.value || 0;
    logActivity('Vendor rate updated', `${$('vSup').value} · ${lab} · ₹${(+e.target.value || 0).toFixed(2)}`);
    persist();
    save();
    toast('Rate updated. New bills will use it.', 'ok');
  });

  $('vNiAdd').onclick = () => { if (needAdmin('add rate-list items')) vAddItem(); };

  ['vfFrom', 'vfTo', 'vfSup'].forEach(i => $(i).onchange = () => renderVendors(true));
  ['vDashSup', 'vDashFrom', 'vDashTo'].forEach(i => $(i).onchange = renderVendorDashboard);
  $('vDashExport').onclick = () => vExport('dash');
  $('vBillsExport').onclick = () => vExport('bills');

  vLoad();
  renderVendorDashboard();
}

function renderVendors(listsOnly) {
  if (!$('vendors')) return;
  fillExtraSup();
  renderExtraBills();
  renderVendorKpis();

  let sel = $('vSup'), v = sel.value,
      names = state.suppliers.slice().sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">Choose vendor</option>' + names.map(x => `<option>${esc(x)}</option>`).join('');
  if (names.includes(v)) sel.value = v;

  let fs = $('vfSup'), fv = fs.value;
  fs.innerHTML = '<option value="">All vendors</option>' + names.map(x => `<option>${esc(x)}</option>`).join('');
  if (names.includes(fv)) fs.value = fv;

  if (!listsOnly) vLoad();

  let L = vFiltered(),
      g = vGroup(L, x => x.b.supplier),
      keys = Object.keys(g).sort((a, b) => g[b].out - g[a].out),
      tot = { n: 0, payable: 0, paid: 0, out: 0 };
  keys.forEach(k => {
    for (let f in tot) tot[f] += g[k][f];
  });

  $('vOutTable').innerHTML = table(
    ['Vendor', 'Bills / Balances', 'Total Payable', 'Total Paid', 'Outstanding (Payment Left)', 'Actions'],
    keys.map(k => {
      let outColor = g[k].out > 0.5 ? '#b42332' : '#12805a';
      return [
        `<a href="#" onclick="vPickSup(this.dataset.n);return false" data-n="${esc(k)}"><strong>${esc(k)}</strong></a>`,
        g[k].n,
        inr(g[k].payable),
        inr(g[k].paid),
        `<strong style="color:${outColor}">${inr(g[k].out)}</strong>`,
        `<div class="actions">
          ${g[k].out > 0.5 ? `<button class="btn sm" type="button" onclick="openVendorOpeningBalanceModal('${esc(k)}')">＋ Add Balance</button>` : ''}
        </div>`
      ];
    }).concat(keys.length ? [[
      '<strong>TOTAL</strong>',
      '<strong>' + tot.n + '</strong>',
      '<strong>' + inr(tot.payable) + '</strong>',
      '<strong>' + inr(tot.paid) + '</strong>',
      `<strong style="color:${tot.out > 0.5 ? '#b42332' : '#12805a'}">${inr(tot.out)}</strong>`,
      ''
    ]] : [])
  );

  $('vLedger').innerHTML = table(
    ['Date', 'Vendor', 'Type', 'Rate-card / Items', 'Claimed bill', 'Payable', 'Paid', 'Paid on', 'UTR no.', 'Payment Left', 'Status', 'Actions'],
    L.slice().sort((a, b) => b.b.date.localeCompare(a.b.date) || a.b.supplier.localeCompare(b.b.supplier)).map(x => {
      let typeTag = x.b.isOpening
        ? '<span class="tag opening">★ Opening Balance</span>'
        : (x.b.additional ? '<span class="tag nostock">📦 No Stock Bill</span>' : '<span class="tag in">📥 Inward Bill</span>');

      let desc = x.b.lines && x.b.lines.length
        ? (x.b.isOpening ? 'Carried forward payment left' : x.b.lines.map(l => l.prod || l.item).filter(Boolean).slice(0, 2).join(', '))
        : inr(x.computed);

      return [
        esc(x.b.date),
        `<strong>${esc(x.b.supplier)}</strong>`,
        typeTag,
        `<span class="mini">${esc(desc)}</span>`,
        x.claimed > 0 ? inr(x.claimed) : '—',
        inr(x.payable),
        inr(x.paid),
        esc(x.b.pdate || '—'),
        esc(x.b.utr || '—'),
        `<strong style="color:${x.out > 0.5 ? '#b42332' : '#12805a'}">${inr(x.out)}</strong>`,
        vSt(x.status),
        `<div class="actions" style="flex-wrap:nowrap">
          ${x.out > 0.5 ? `<button class="btn sm" type="button" onclick="openQuickPayModal('${x.b.id}')">💰 Pay</button>` : ''}
          ${x.b.additional
            ? `<button class="icon-btn" type="button" onclick="vEditExtraBill('${x.b.id}')">✏️ Edit</button>`
            : `<button class="btn light sm" type="button" onclick="vOpen('${x.b.id}')">Open</button>`}
        </div>`
      ];
    })
  );

  let mg = vGroup(L, x => x.b.date.slice(0, 7) + '|' + x.b.supplier),
      mm = vGroup(L, x => x.b.date.slice(0, 7)),
      rows = [];
  Object.keys(mm).sort().reverse().forEach(m => {
    Object.keys(mg).filter(k => k.startsWith(m + '|')).sort().forEach(k => {
      let o = mg[k];
      rows.push([monthLbl(m), esc(k.slice(8)), o.n, inr(o.payable), inr(o.paid), inr(o.out)]);
    });
    let o = mm[m];
    rows.push([`<strong>${monthLbl(m)} total</strong>`, '', `<strong>${o.n}</strong>`, `<strong>${inr(o.payable)}</strong>`, `<strong>${inr(o.paid)}</strong>`, `<strong>${inr(o.out)}</strong>`]);
  });
  $('vMonth').innerHTML = table(['Month', 'Vendor', 'Bills', 'Payable', 'Paid', 'Outstanding'], rows);

  vRates();
  renderVendorDashboard();
}

function monthLbl(m) {
  let d = new Date(m + '-01T00:00:00');
  return d.toLocaleString('en-IN', { month: 'short', year: 'numeric' });
}

function vPickSup(n) {
  $('vfSup').value = n;
  renderVendors(true);
}

function vOpen(id) {
  let b = state.bills.find(x => String(x.id) === String(id));
  if (!b) return;
  $('vSup').value = b.supplier;
  $('vDate').value = b.date;
  vLoad();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function vRates() {
  let el = $('vRateTable');
  if (!el) return;
  let sup = $('vSup').value;
  $('vRateTitle').textContent = sup ? 'Rate list · ' + sup : 'Rate list';
  if (!sup) {
    el.innerHTML = '<div class="empty">Choose a vendor above to see its rate list.</div>';
    return;
  }
  let items = vItems(sup);
  el.innerHTML = items.length ? table(['Item', 'Category', 'Unit', 'Rate / MRP ₹'], items.map(i => [
    esc(i.name),
    esc(i.cat),
    i.unit,
    `<input type="number" step="0.01" min="0" value="${i.rate}" data-lab="${esc(i.label)}" style="width:110px">`
  ])) : '<div class="empty">No rates saved for this vendor yet. Add items below.</div>';
}

function vAddItem() {
  let sup = $('vSup').value, n = $('vNiName').value.trim();
  if (!sup) return toast('Choose a vendor first.', 'err');
  if (!n) return toast('Enter the item name.', 'err');
  state.vextra.push({ sup, name: n, cat: $('vNiCat').value.trim() || 'Other', unit: $('vNiUnit').value, rate: +$('vNiRate').value || 0 });
  ['vNiName', 'vNiCat', 'vNiRate'].forEach(i => $(i).value = '');
  logActivity('Vendor rate item added', sup + ' · ' + n);
  persist();
  vRows();
  vRates();
  toast('Item added to rate list.', 'ok');
}

function vRowOf(el) {
  let tr = el.closest('tr[data-i]');
  return tr ? { tr, l: vcur.lines[+tr.dataset.i] } : null;
}

/* ================= VENDOR DASHBOARD & EXPORT ================= */

function vDashFiltered() {
  let f = $('vDashFrom').value, t = $('vDashTo').value, sup = $('vDashSup').value;
  return state.bills.filter(b => (!f || b.date >= f) && (!t || b.date <= t) && (!sup || b.supplier === sup))
    .map(b => Object.assign({ b }, vTot(b)))
    .map(x => Object.assign(x, { status: payStatus(x) }));
}

function renderVendorDashboard() {
  if (!$('vDashSup')) return;
  let sel = $('vDashSup'), old = sel.value,
      names = [...new Set([...state.suppliers, ...state.bills.map(b => b.supplier)])].filter(Boolean).sort((a, b) => a.localeCompare(b));
  sel.innerHTML = '<option value="">All vendors</option>' + names.map(n => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
  if (names.includes(old)) sel.value = old;

  let L = vDashFiltered().sort((a, b) => b.b.date.localeCompare(a.b.date) || a.b.supplier.localeCompare(b.b.supplier));
  let payable = L.reduce((a, x) => a + x.payable, 0),
      paid = L.reduce((a, x) => a + x.paid, 0),
      out = L.reduce((a, x) => a + x.out, 0);

  $('vDashCards').innerHTML = [
    ['Bills & Charges', L.length, 'Entries in selected period'],
    ['Payable', inr(payable), 'Total dues calculated'],
    ['Paid', inr(paid), 'Total payments recorded'],
    ['Outstanding', inr(out), 'Balance payment left']
  ].map(c => `<div class="card"><div class="label">${c[0]}</div><div class="num">${c[1]}</div><small>${c[2]}</small></div>`).join('');

  $('vDashLedger').innerHTML = table(
    ['Date', 'Supplier', 'Rate-card total', 'Claimed bill', 'Difference', 'Payable', 'Paid', 'Paid on', 'UTR no.', 'Outstanding', 'Status', 'Last updated', ''],
    L.map(x => [
      esc(x.b.date),
      esc(x.b.supplier),
      inr(x.computed),
      x.claimed > 0 ? inr(x.claimed) : '—',
      x.claimed > 0 ? inr(x.diff) : '—',
      inr(x.payable),
      inr(x.paid),
      esc(x.b.pdate || '—'),
      esc(x.b.utr || '—'),
      inr(x.out),
      vSt(x.status),
      esc(x.b.updatedAt ? new Date(x.b.updatedAt).toLocaleString('en-IN') : '—'),
      `<button class="btn light sm" onclick="vOpen('${x.b.id}')">Open</button>`
    ])
  );

  let mg = vGroup(L, x => x.b.date.slice(0, 7) + '|' + x.b.supplier),
      mm = vGroup(L, x => x.b.date.slice(0, 7)),
      rows = [];
  Object.keys(mm).sort().reverse().forEach(m => {
    Object.keys(mg).filter(k => k.startsWith(m + '|')).sort().forEach(k => {
      let o = mg[k];
      rows.push([monthLbl(m), esc(k.slice(8)), o.n, inr(o.payable), inr(o.paid), inr(o.out)]);
    });
    let o = mm[m];
    rows.push([`<strong>${monthLbl(m)} total</strong>`, '', `<strong>${o.n}</strong>`, `<strong>${inr(o.payable)}</strong>`, `<strong>${inr(o.paid)}</strong>`, `<strong>${inr(o.out)}</strong>`]);
  });
  $('vDashMonth').innerHTML = table(['Month', 'Supplier', 'Bills', 'Payable', 'Paid', 'Outstanding'], rows);

  let lines = [];
  L.forEach(x => (x.b.lines || []).forEach(l => lines.push({
    date: x.b.date,
    supplier: x.b.supplier,
    product: l.prod || l.item || 'Unspecified product',
    item: l.item || l.prod || '',
    unit: l.unit || 'kg',
    qty: +l.qty || 0,
    rate: +l.rate || 0,
    amount: (+l.qty || 0) * (+l.rate || 0),
    updatedAt: x.b.updatedAt || x.b.createdAt || ''
  })));
  $('vDashLines').innerHTML = table(['Bill date', 'Supplier', 'Inward product', 'Vendor item', 'Unit', 'Rate / MRP', 'Qty', 'Amount', 'Last updated'], lines.map(l => [
    esc(l.date),
    esc(l.supplier),
    esc(l.product),
    esc(l.item),
    esc(l.unit),
    inr(l.rate),
    l.qty,
    inr(l.amount),
    l.updatedAt ? new Date(l.updatedAt).toLocaleString('en-IN') : '—'
  ]));

  let sortedLines = lines.slice().sort((a, b) => b.date.localeCompare(a.date) || a.supplier.localeCompare(b.supplier) || a.product.localeCompare(b.product));
  $('vDashProductDaily').innerHTML = table(['Date', 'Vendor', 'Product name', 'Quantity', 'Unit', 'Price / unit (₹)', 'Amount (₹)'], sortedLines.map(l => [
    esc(l.date),
    esc(l.supplier),
    esc(l.product),
    l.qty,
    esc(l.unit),
    inr(l.rate),
    inr(l.amount)
  ]));

  let pmap = {};
  lines.forEach(l => {
    let m = l.date.slice(0, 7), k = [m, l.supplier, l.product, l.unit].join('|'),
        o = pmap[k] || (pmap[k] = { month: m, supplier: l.supplier, product: l.product, unit: l.unit, qty: 0, amount: 0, rate: l.rate });
    o.qty += l.qty;
    o.amount += l.amount;
    if (l.rate) o.rate = l.rate;
  });
  $('vDashProductMonthly').innerHTML = table(['Month', 'Vendor', 'Product name', 'Total quantity', 'Unit', 'Price / unit (₹)', 'Total amount (₹)'], Object.values(pmap).sort((a, b) => b.month.localeCompare(a.month) || a.supplier.localeCompare(b.supplier) || a.product.localeCompare(b.product)).map(o => [
    monthLbl(o.month),
    esc(o.supplier),
    esc(o.product),
    Math.round(o.qty * 1000) / 1000,
    esc(o.unit),
    inr(o.rate),
    inr(o.amount)
  ]));

  let acts = (state.activityLog || []).slice().reverse().slice(0, 500);
  $('vDashActivity').innerHTML = acts.length ? table(['Timestamp', 'User', 'Activity', 'Details'], acts.map(a => [
    a.at ? new Date(a.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' }) : '—',
    esc(a.by || '—'),
    esc(a.action),
    esc(a.details)
  ])) : '<div class="empty">No activity log entries yet. New actions will be timestamped from now on.</div>';
}

function vExport(source = 'dash') {
  let f = source === 'bills' ? $('vfFrom').value : $('vDashFrom').value,
      t = source === 'bills' ? $('vfTo').value : $('vDashTo').value,
      vendor = source === 'bills' ? $('vfSup').value : $('vDashSup').value;

  let L = state.bills.filter(b => (!f || b.date >= f) && (!t || b.date <= t) && (!vendor || b.supplier === vendor))
    .map(b => Object.assign({ b }, vTot(b)))
    .map(x => Object.assign(x, { status: payStatus(x) }))
    .sort((a, b) => a.b.date.localeCompare(b.b.date) || a.b.supplier.localeCompare(b.b.supplier));

  if (!L.length) return toast('No vendor bills in the selected date/vendor filter to export.', 'err');

  let g = vGroup(L, x => x.b.supplier),
      keys = Object.keys(g).sort(),
      tot = { n: 0, payable: 0, paid: 0, out: 0 };
  keys.forEach(k => {
    for (let z in tot) tot[z] += g[k][z];
  });

  let outstanding = [['Vendor', 'No. of bills', 'Payable (₹)', 'Paid (₹)', 'Outstanding (₹)', 'Payment status']].concat(
    keys.map(k => [k, g[k].n, r2(g[k].payable), r2(g[k].paid), r2(g[k].out), g[k].out <= 0.5 ? 'Paid' : g[k].paid > 0 ? 'Part paid' : 'Unpaid']),
    [['TOTAL', tot.n, r2(tot.payable), r2(tot.paid), r2(tot.out), '']]
  );

  let ledger = [['Bill date', 'Vendor', 'Rate-card total (₹)', 'Claimed bill (₹)', 'Difference (₹)', 'Payable (₹)', 'Paid (₹)', 'Payment date', 'UTR number', 'Status', 'Outstanding (₹)', 'Running outstanding (₹)']],
      run = {};
  L.forEach(x => {
    let k = x.b.supplier;
    run[k] = r2((run[k] || 0) + x.out);
    ledger.push([
      x.b.date,
      k,
      r2(x.computed),
      x.claimed > 0 ? r2(x.claimed) : '',
      x.claimed > 0 ? r2(x.diff) : '',
      r2(x.payable),
      r2(x.paid),
      x.b.pdate || '',
      x.b.utr || '',
      x.status,
      r2(x.out),
      run[k]
    ]);
  });

  let daily = vGroup(L, x => x.b.date + '|' + x.b.supplier),
      byDate = vGroup(L, x => x.b.date),
      dayRows = [['Date', 'Vendor', 'No. of bills', 'Payable (₹)', 'Paid (₹)', 'Outstanding (₹)']];
  Object.keys(byDate).sort().forEach(d => {
    Object.keys(daily).filter(k => k.startsWith(d + '|')).sort().forEach(k => {
      let o = daily[k];
      dayRows.push([d, k.slice(d.length + 1), o.n, r2(o.payable), r2(o.paid), r2(o.out)]);
    });
    let o = byDate[d];
    dayRows.push([d, 'DAY TOTAL', o.n, r2(o.payable), r2(o.paid), r2(o.out)]);
  });

  let mg = vGroup(L, x => x.b.date.slice(0, 7) + '|' + x.b.supplier),
      mm = vGroup(L, x => x.b.date.slice(0, 7)),
      monthRows = [['Month', 'Vendor', 'No. of bills', 'Payable (₹)', 'Paid (₹)', 'Outstanding (₹)']],
      monthBold = new Set();
  Object.keys(mm).sort().forEach(m => {
    Object.keys(mg).filter(k => k.startsWith(m + '|')).sort().forEach(k => {
      let o = mg[k];
      monthRows.push([m, k.slice(8), o.n, r2(o.payable), r2(o.paid), r2(o.out)]);
    });
    let o = mm[m];
    monthBold.add(monthRows.length);
    monthRows.push([m, 'MONTH TOTAL', o.n, r2(o.payable), r2(o.paid), r2(o.out)]);
  });

  let lines = [['Vendor', 'Bill date', 'Inward product', 'Vendor item', 'Unit', 'Rate / MRP (₹)', 'Qty', 'Amount (₹)']];
  L.forEach(x => x.b.lines.forEach(l => lines.push([
    x.b.supplier,
    x.b.date,
    l.prod || '',
    l.item || '',
    l.unit,
    r2(+l.rate || 0),
    +l.qty || 0,
    r2((+l.rate || 0) * (+l.qty || 0))
  ])));

  let prodMonthMap = {},
      prodMonthRows = [['Month', 'Vendor', 'Product', 'Unit', 'Total quantity', 'Rate (₹)', 'Bill amount (₹)']];
  L.forEach(x => (x.b.lines || []).forEach(l => {
    let prod = l.prod || l.item || 'Unspecified product',
        unit = l.unit || '',
        key = x.b.date.slice(0, 7) + '|' + x.b.supplier + '|' + prod + '|' + unit,
        o = prodMonthMap[key] || (prodMonthMap[key] = { month: x.b.date.slice(0, 7), vendor: x.b.supplier, prod, unit, qty: 0, amount: 0, rate: 0 });
    o.qty += (+l.qty || 0);
    o.amount += (+l.qty || 0) * (+l.rate || 0);
    o.rate = +l.rate || o.rate;
  }));
  Object.values(prodMonthMap).sort((a, b) => a.month.localeCompare(b.month) || a.vendor.localeCompare(b.vendor) || a.prod.localeCompare(b.prod)).forEach(o => {
    prodMonthRows.push([o.month, o.vendor, o.prod, o.unit, Math.round(o.qty * 1000) / 1000, r2(o.rate), r2(o.amount)]);
  });

  let productDailyRows = [['Date', 'Vendor', 'Product name', 'Quantity', 'Unit', 'Price per unit (₹)', 'Amount (₹)', 'Last updated']];
  L.forEach(x => (x.b.lines || []).forEach(l => productDailyRows.push([
    x.b.date,
    x.b.supplier,
    l.prod || l.item || 'Unspecified product',
    +l.qty || 0,
    l.unit || 'kg',
    r2(+l.rate || 0),
    r2((+l.qty || 0) * (+l.rate || 0)),
    x.b.updatedAt ? new Date(x.b.updatedAt).toLocaleString('en-IN') : ''
  ])));

  let activityRows = [['Timestamp', 'Activity', 'Details']].concat(
    (state.activityLog || []).slice().reverse().map(a => [
      a.at ? new Date(a.at).toLocaleString('en-IN') : '',
      a.action,
      a.details
    ])
  );

  let safeVendor = vendor ? vendor.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') : 'all-vendors',
      from = f || 'all-dates',
      to = t || 'current';

  download(
    'laa-fresh-vendor-bills-' + safeVendor + '-' + dateNow() + '.xlsx',
    xlsxBlob([
      { name: 'Outstanding', rows: outstanding, bold: new Set([outstanding.length - 1]) },
      { name: 'Day-wise', rows: dayRows },
      { name: 'Ledger', rows: ledger },
      { name: 'Month-wise', rows: monthRows, bold: monthBold },
      { name: 'Bill Lines', rows: lines },
      { name: 'Product Month-wise', rows: prodMonthRows },
      { name: 'Product Day-wise', rows: productDailyRows },
      { name: 'Activity Log', rows: activityRows }
    ]),
    'application/octet-stream'
  );

  toast('Vendor Bills Excel downloaded with daily/monthly product reports and timestamped activity log (' + from + ' to ' + to + ').', 'ok');
}

function xlsxBlob(sheets) {
  const enc = new TextEncoder(),
        X = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  const col = n => {
    let s = '';
    n++;
    while (n > 0) {
      let m = (n - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  };
  const sx = sh => {
    let w = [];
    sh.rows.forEach(r => r.forEach((v, i) => {
      w[i] = Math.max(w[i] || 9, Math.min(55, String(v == null ? '' : v).length + 3));
    }));
    let x = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>' + Array.from(w, (n, i) => `<col min="${i + 1}" max="${i + 1}" width="${n || 9}" customWidth="1"/>`).join('') + '</cols><sheetData>';
    sh.rows.forEach((r, ri) => {
      let b = ri === 0 || (sh.bold && sh.bold.has(ri)) ? 1 : 0;
      x += `<row r="${ri + 1}">`;
      r.forEach((v, i) => {
        let ref = col(i) + (ri + 1);
        if (typeof v === 'number' && isFinite(v)) {
          x += `<c r="${ref}" s="${b}"><v>${Math.round(v * 1000) / 1000}</v></c>`;
        } else if (v !== '' && v != null) {
          x += `<c r="${ref}" t="inlineStr" s="${b}"><is><t xml:space="preserve">${X(v)}</t></is></c>`;
        }
      });
      x += '</row>';
    });
    return x + '</sheetData></worksheet>';
  };
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"',
        H = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const files = [
    ['[Content_Types].xml', H + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' + sheets.map((s, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') + '</Types>'],
    ['_rels/.rels', H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', H + `<workbook ${NS} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` + sheets.map((s, i) => `<sheet name="${X(s.name).slice(0, 31)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', H + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') + `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ['xl/styles.xml', H + `<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`]
  ].concat(sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, sx(s)]));

  const T = new Uint32Array(256).map((_, n) => {
    for (let k = 0; k < 8; k++) n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
    return n >>> 0;
  });
  const crc = d => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < d.length; i++) c = T[(c ^ d[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  };

  let parts = [], cd = [], off = 0;
  files.forEach(([n, d]) => {
    let nb = enc.encode(n), db = enc.encode(d), c = crc(db),
        h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x0800, true);
    h.setUint16(12, 0x21, true);
    h.setUint32(14, c, true);
    h.setUint32(18, db.length, true);
    h.setUint32(22, db.length, true);
    h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, db);
    let e = new DataView(new ArrayBuffer(46));
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(8, 0x0800, true);
    e.setUint16(14, 0x21, true);
    e.setUint32(16, c, true);
    e.setUint32(20, db.length, true);
    e.setUint32(24, db.length, true);
    e.setUint16(28, nb.length, true);
    e.setUint32(42, off, true);
    cd.push(new Uint8Array(e.buffer), nb);
    off += 30 + nb.length + db.length;
  });

  let cs = cd.reduce((a, b) => a + b.length, 0),
      en = new DataView(new ArrayBuffer(22));
  en.setUint32(0, 0x06054b50, true);
  en.setUint16(8, files.length, true);
  en.setUint16(10, files.length, true);
  en.setUint32(12, cs, true);
  en.setUint32(16, off, true);

  return new Blob(parts.concat(cd, [new Uint8Array(en.buffer)]), {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
