// ==UI-LEDGER== ledger tab, floating + button, add/edit sheet with calculator, calendar, accounts, categories and limits
const L = { mode: LS.get('ha_lmode', 'monthly'), anchor: null, data: null, range: null, search: '', showSearch: false, menu: false, limits: [] };
const MODES = [['hourly', 'Hourly'], ['daily', 'Daily'], ['weekly', 'Weekly'], ['monthly', 'Monthly'], ['quarterly', 'Quarterly'], ['yearly', 'Yearly']];
const MODE_LABEL = Object.fromEntries(MODES);
const EMOJIS = ['🏷️', '🏋️', '🎬', '💊', '📚', '🐶', '🎮', '🍺', '✈️', '🏠', '💡', '🎁', '🚗', '👗'];
const signedAmt = (p, kind) => (kind === 'income' ? '+' : '-') + fmtINR(Math.abs(p) / 100);
const netAmt = p => (p >= 0 ? '+' : '-') + fmtINR(Math.abs(p) / 100);
const tzOf = () => (App.user && App.user.timezone) || 'Asia/Kolkata';

async function loadLedger() {
  if (!App.summary) return; if (!L.anchor) L.anchor = App.summary.today;
  const rg = periodRange(L.mode, L.anchor); L.range = rg;
  const [r, c] = await Promise.all([api('GET', `/ledger?from=${rg.from}&to=${rg.to}`), L.mode === 'monthly' ? api('GET', '/categories?month=' + rg.from.slice(0, 7)) : Promise.resolve(null)]);
  if (r.status !== 200) return; L.data = r.body; if (c && c.status === 200) { L.limits = c.body.categories; App.cats = c.body.categories; }
  renderLedger();
}
function renderLedger() {
  const el = $('#p-ledger'); if (!el || !L.data) return; const d = L.data, s = App.summary;
  const keepSearch = $('#lSearch') ? $('#lSearch').value : L.search;
  el.innerHTML = `<div class="lhead"><button class="icon-btn" data-act="l-prev" aria-label="Previous">&lsaquo;</button><button class="ltitle" data-act="l-cal" aria-label="Open calendar">${esc(L.range.label)} <span class="muted">&#9662;</span></button><button class="icon-btn" data-act="l-next" aria-label="Next">&rsaquo;</button><span class="sp"></span>
  <button class="icon-btn" data-act="l-search" aria-label="Search">&#128269;</button><div class="menu-wrap"><button class="pillbtn" data-act="l-menu">${MODE_LABEL[L.mode]} &#9662;</button>${L.menu ? `<div class="menu">${MODES.map(([k, l]) => `<button class="${k === L.mode ? 'on' : ''}" data-act="l-mode" data-m="${k}">${l}</button>`).join('')}</div>` : ''}</div></div>
  <div class="lsum"><div class="spill inc"><span class="ic">&#8595;</span><div><div class="k">Income</div><div class="v">${fmtINR(d.income_paise / 100)}</div></div></div><div class="spill exp"><span class="ic">&#8593;</span><div><div class="k">Expense</div><div class="v">${fmtINR(d.expense_paise / 100)}</div></div></div></div>
  <div class="lnet small muted">Net <b class="${d.net_paise >= 0 ? 'okc' : 'overc'}">${netAmt(d.net_paise)}</b> &middot; Balance across accounts <b>${fmtINR((s.balance_paise || 0) / 100)}</b></div>
  <div class="lsearch" style="display:${L.showSearch ? 'block' : 'none'}"><input id="lSearch" placeholder="Search title, category, note, account" value="${esc(keepSearch)}" aria-label="Search entries"></div>
  <div id="lList"></div>`;
  renderLedgerList();
}
function renderLedgerList() {
  const box = $('#lList'); if (!box) return; const d = L.data, q = ($('#lSearch') ? $('#lSearch').value : L.search).trim().toLowerCase(); L.search = q;
  let entries = d.entries.filter(e => !q || (e.title + ' ' + e.category_label + ' ' + e.memo + ' ' + e.account_name).toLowerCase().includes(q));
  let html = '';
  if (L.mode === 'monthly' && !q) {
    const withLim = L.limits.filter(c => c.limit_paise != null);
    html += `<div class="card lim"><div class="row"><h3 class="sp">Category limits</h3><button class="lnk small" data-act="manage-cats">${withLim.length ? 'Edit' : 'Set limits'}</button></div>` + (withLim.length ? withLim.map(c => { const pct = c.limit_paise ? Math.min(100, c.spent_paise / c.limit_paise * 100) : 0, over = c.spent_paise > c.limit_paise; return `<div class="cat-row"><span>${c.icon} ${esc(c.label)}</span><div class="bar ${over ? 'over' : ''}"><i style="width:${pct}%"></i></div><b class="${over ? 'overc' : ''}">${fmtINR(c.spent_paise / 100)} / ${fmtINR(c.limit_paise / 100)}</b></div>${over ? '<div class="small overc" style="margin:-4px 0 6px 0">Over by ' + fmtINR((c.spent_paise - c.limit_paise) / 100) + '</div>' : ''}`; }).join('') : '<div class="small muted">Give a category a monthly limit and Aunty will keep watch.</div>') + '</div>';
  }
  if (!entries.length) { box.innerHTML = html + `<div class="empty" style="padding:30px 10px">${q ? 'Nothing matches your search.' : 'Nothing in this period yet.<br>Tap + to add an expense or income, or tell Aunty.'}</div>`; return; }
  const mode = L.mode; const groups = []; const idx = {};
  const keyOf = e => mode === 'hourly' ? e.hm.slice(0, 2) : (mode === 'quarterly' || mode === 'yearly') ? e.day.slice(0, 7) : e.day;
  const labelOf = k => mode === 'hourly' ? fmtTime12(k + ':00') : (mode === 'quarterly' || mode === 'yearly') ? MON3[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) : fmtDayLong(k) + (k === App.summary.today ? ' · Today' : '');
  entries.forEach(e => { const k = keyOf(e); if (!(k in idx)) { idx[k] = groups.length; groups.push({ k, rows: [] }); } groups[idx[k]].rows.push(e); });
  groups.forEach(g => {
    const net = g.rows.reduce((a, e) => a + (e.kind === 'income' ? e.amount_paise : -e.amount_paise), 0);
    const rows = g.rows.map(e => `<div class="lrow" data-act="l-edit" data-id="${e.id}" data-kind="${e.kind}" tabindex="0" role="button"><span class="lic ${e.kind}">${e.icon}</span><div class="sp"><div class="lt">${esc(e.title)}</div><div class="small muted">${esc(e.category_label)}${e.account_name ? ' &middot; ' + esc(e.account_name) : ''} &middot; ${fmtTime12(e.hm)}${e.memo ? ' &middot; ' + esc(e.memo) : ''}</div></div><b class="amt ${e.kind === 'income' ? 'okc' : 'overc'}">${signedAmt(e.amount_paise, e.kind)}</b></div>`).join('');
    const head = `<div class="dhead"><span>${labelOf(g.k)}</span><b class="${net >= 0 ? 'okc' : 'overc'}">${netAmt(net)}</b></div>`;
    html += (mode === 'quarterly' || mode === 'yearly') ? `<details class="dcard"><summary>${head}</summary>${rows}</details>` : `<div class="dcard">${head}${rows}</div>`;
  });
  box.innerHTML = html;
}
function ledgerStep(dir) { L.anchor = periodStep(L.mode, L.anchor, dir); loadLedger(); }

// ---------- calendar ----------
async function openCalendar(month) {
  month = month || L.anchor.slice(0, 7); const [y, m] = month.split('-').map(Number); const first = month + '-01', last = month + '-' + String(daysInMonth(first)).padStart(2, '0');
  const r = await api('GET', `/ledger?from=${first}&to=${last}`); const by = {}; (r.body.entries || []).forEach(e => { by[e.day] = by[e.day] || { i: 0, x: 0 }; e.kind === 'income' ? by[e.day].i += e.amount_paise : by[e.day].x += e.amount_paise; });
  const lead = dow(first), dim = daysInMonth(first); let cells = ''; for (let i = 0; i < lead; i++) cells += '<span></span>';
  for (let d = 1; d <= dim; d++) { const k = month + '-' + String(d).padStart(2, '0'), v = by[k]; cells += `<button class="cday ${k === App.summary.today ? 'today' : ''} ${k === L.anchor ? 'sel' : ''}" data-act="cal-day" data-d="${k}"><span>${d}</span>${v ? `<span class="dots">${v.x ? '<i class="dx"></i>' : ''}${v.i ? '<i class="di"></i>' : ''}</span>` : ''}</button>`; }
  openSheet(`<div class="row"><button class="icon-btn" data-act="cal-nav" data-m="${periodStep('monthly', first, -1).slice(0, 7)}" aria-label="Previous month">&lsaquo;</button><h2 class="sp" style="text-align:center;font-size:22px">${MON3[m - 1]} ${y}</h2><button class="icon-btn" data-act="cal-nav" data-m="${periodStep('monthly', first, 1).slice(0, 7)}" aria-label="Next month">&rsaquo;</button></div>
  <div class="mstrip">${MON3.map((n, i) => `<button class="${i === m - 1 ? 'on' : ''}" data-act="cal-nav" data-m="${y}-${String(i + 1).padStart(2, '0')}">${n}</button>`).join('')}</div>
  <div class="cgrid head">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(x => `<b>${x}</b>`).join('')}</div><div class="cgrid">${cells}</div>
  <div class="small muted" style="margin:8px 0"><i class="dx dot"></i> expense &nbsp; <i class="di dot"></i> income &nbsp; Tap a day to see it.</div>
  <div class="row"><button class="btn sec sp" data-act="cal-month" data-m="${month}">Show whole month</button><button class="btn sp" data-act="cal-day" data-d="${App.summary.today}">Today</button></div>`);
}

// ---------- add / edit sheet ----------
const Sh = { kind: 'expense', cat: 'other', acc: null, key: null, edit: null, accounts: [] };
async function openTxnSheet(entry) {
  await loadCats(); const ar = await api('GET', '/accounts'); Sh.accounts = ar.body.accounts || []; Sh.key = uuid(); Sh.edit = entry || null;
  Sh.kind = entry ? entry.kind : 'expense'; Sh.cat = entry && entry.kind === 'expense' ? entry.category : (Sh.cat && App.cats.some(c => c.slug === Sh.cat) ? Sh.cat : 'other'); Sh.acc = entry ? entry.account_id : (Sh.accounts[0] && Sh.accounts[0].id);
  const tz = tzOf(); const at = entry ? new Date(entry.at).getTime() : clock.now(); const dt = dayKey(at, tz) + 'T' + hmOf(at, tz);
  openSheet(`<div class="row"><h2 class="sp" style="font-size:22px">${entry ? 'Edit entry' : 'Add'}</h2>${entry ? '' : `<div class="seg" id="shKind"><button class="${Sh.kind === 'expense' ? 'on' : ''}" data-act="sh-kind" data-k="expense">Expense</button><button class="${Sh.kind === 'income' ? 'on' : ''}" data-act="sh-kind" data-k="income">Income</button></div>`}</div>
  <div class="field"><label for="shAmt">Amount (₹)</label><div class="row"><input id="shAmt" class="sp" inputmode="decimal" placeholder="0" value="${entry ? entry.amount_paise / 100 : ''}" autocomplete="off"><button type="button" class="btn sec calc-btn" data-act="calc-toggle" aria-label="Calculator">&#129518;</button></div></div>
  <div id="calcBox" style="display:none"></div>
  <div class="field"><label for="shTitle">Title</label><input id="shTitle" maxlength="60" placeholder="${Sh.kind === 'income' ? 'Salary' : 'Dinner, auto, groceries...'}" value="${esc(entry ? entry.title : '')}"></div>
  <div id="shCatWrap" style="display:${Sh.kind === 'expense' ? 'block' : 'none'}"><div class="field" style="margin-bottom:0"><label>Category</label></div><div class="cchips" id="shChips"></div><div class="small muted" id="shLimit" style="margin:4px 0 6px"></div><div id="shNewCat" style="display:none"></div></div>
  <div class="field"><label for="shAcc">Account</label><select id="shAcc">${Sh.accounts.map(a => `<option value="${a.id}" ${a.id === Sh.acc ? 'selected' : ''}>${a.icon} ${esc(a.name)} (${fmtINR(a.balance_paise / 100)})</option>`).join('')}</select></div>
  <div class="field"><label for="shWhen">Date and time</label><input id="shWhen" type="datetime-local" value="${dt}"></div>
  <div class="field"><label for="shMemo">Note (optional)</label><textarea id="shMemo" rows="2" maxlength="140" placeholder="Anything to remember">${esc(entry ? entry.memo : '')}</textarea></div>
  <div class="err" id="shErr"></div><div class="row"><button class="btn sp" data-act="sh-save">Save</button>${entry ? '<button class="btn danger" data-act="sh-delete">Delete</button>' : ''}</div>`);
  renderChips(); setTimeout(() => { const a = $('#shAmt'); if (a && !entry) a.focus(); }, 60);
}
function renderChips() {
  const w = $('#shChips'); if (!w) return;
  w.innerHTML = App.cats.map(c => `<button type="button" class="cchip ${c.slug === Sh.cat ? 'on' : ''}" data-act="sh-cat" data-s="${c.slug}">${c.icon} ${esc(c.label)}${c.limit_paise != null ? '<small> limit</small>' : ''}</button>`).join('') + '<button type="button" class="cchip plus" data-act="sh-newcat" aria-label="New category">+</button>';
  const c = App.cats.find(x => x.slug === Sh.cat), h = $('#shLimit'); if (!h) return;
  if (c && c.limit_paise != null) { const used = c.spent_paise != null ? c.spent_paise : 0; h.innerHTML = `${esc(c.label)} limit this month: <b>${fmtINR(used / 100)}</b> of <b>${fmtINR(c.limit_paise / 100)}</b> used`; } else h.textContent = '';
}
function sheetAmount() { const raw = $('#shAmt').value; let v = calcEval(raw); if (v == null) v = parseAmount(raw); return v; }
async function saveTxn() {
  const err = $('#shErr'); const v = sheetAmount(); if (!(v > 0)) return (err.textContent = 'Enter an amount above zero.');
  const tz = tzOf(), when = $('#shWhen').value; let spent_at; if (when) { const [dk, hm] = when.split('T'); const [h, m] = hm.split(':').map(Number); const ms = localToMs(dk, h, m, tz); if (!Sh.edit && Math.abs(ms - clock.now()) > 90000) spent_at = new Date(ms).toISOString(); else if (Sh.edit) spent_at = new Date(ms).toISOString(); }
  let title = $('#shTitle').value.trim(); const memo = $('#shMemo').value.trim(), account_id = $('#shAcc').value, amount_paise = toPaise(v);
  let r;
  if (Sh.kind === 'expense') {
    const cat = App.cats.find(c => c.slug === Sh.cat); if (!title) title = cat ? cat.label : 'Expense';
    r = Sh.edit ? await api('PATCH', '/spends/' + Sh.edit.id, { amount_paise, category: Sh.cat, note: title, memo, account_id, spent_at }) : await api('POST', '/spends', { amount_paise, category: Sh.cat, note: title, memo, account_id, spent_at, source: 'manual' }, { 'Idempotency-Key': Sh.key });
  } else {
    if (!title) title = 'Income';
    r = Sh.edit ? await api('PATCH', '/income/' + Sh.edit.id, { amount_paise, title, memo, account_id, received_at: spent_at }) : await api('POST', '/income', { amount_paise, title, memo, account_id, received_at: spent_at }, { 'Idempotency-Key': Sh.key });
  }
  if (r.status >= 300) return (err.textContent = r.status === 0 ? 'You are offline. Try again when you are back.' : r.body.error.message);
  closeSheet(); vibe(10); await loadChat(); await refreshSummary(); if (App.tab === 'ledger') loadLedger();
  if (r.body.aunty) auntySays(r.body.aunty);
}
function auntySays(a) {
  setMood(a.mood || 'neutral'); const o = $('#overlay'); if (!o) return; o.querySelectorAll('.says').forEach(x => x.remove());
  const el = document.createElement('div'); el.className = 'says'; el.innerHTML = `<div class="sface">${faceSVG(a.mood || 'neutral')}</div><div class="sp"><b>Aunty</b><div>${esc(a.text)}</div><button class="lnk small" data-act="says-chat">Open chat</button></div><button class="x" data-act="says-close" aria-label="Close">&#10005;</button>`;
  o.appendChild(el); setTimeout(() => { if (el.isConnected) el.remove(); }, 9000);
}
// ---------- calculator ----------
const Calc = { expr: '' };
function calcRender() { const box = $('#calcBox'); if (!box) return; const v = calcEval(Calc.expr); box.innerHTML = `<div class="calc"><div class="cdisp"><div class="small muted">${esc(Calc.expr || '0')}</div><b>${v == null ? '' : '= ' + fmtINR(v, Number.isInteger(v) ? 0 : 2)}</b></div><div class="ckeys">${['C', '(', ')', '⌫', '7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', '.', '=', '+'].map(k => `<button type="button" data-act="calc-key" data-k="${k}">${k}</button>`).join('')}</div><button type="button" class="btn sm block" data-act="calc-use">Use this amount</button></div>`; }
// ---------- accounts and categories management ----------
async function openAccounts() {
  const r = await api('GET', '/accounts'); const a = r.body.accounts;
  openSheet(`<h2 style="font-size:22px">Accounts</h2><div class="small muted" style="margin-bottom:8px">Total balance <b>${fmtINR(r.body.total_paise / 100)}</b>. Balance = opening balance + income &minus; expenses.</div>
  ${a.map(x => `<div class="srow"><span style="font-size:22px">${x.icon}</span><div class="sp"><b>${esc(x.name)}</b><div class="small muted">${x.type}</div></div><b>${fmtINR(x.balance_paise / 100)}</b><button class="btn sm sec" data-act="acc-edit" data-id="${x.id}" data-n="${esc(x.name)}" data-b="${x.balance_paise / 100}">Edit</button><button class="x" data-act="acc-del" data-id="${x.id}" aria-label="Delete ${esc(x.name)}">&#10005;</button></div>`).join('')}
  <h3 style="margin:14px 0 4px;font-size:15px">Add an account</h3><div class="field"><input id="aName" placeholder="Name, e.g. HDFC salary, Cash, Paytm"></div><div class="row"><select id="aType" class="sp field"><option value="bank">Bank</option><option value="cash">Cash</option><option value="wallet">Wallet</option><option value="card">Card</option></select><input id="aBal" class="sp" inputmode="decimal" placeholder="Current balance (₹)"></div><div class="err" id="aErr"></div><button class="btn block" data-act="acc-add">Add account</button>`);
}
async function openCats() {
  const r = await loadCats(L.range ? L.range.from.slice(0, 7) : null); if (!r) return; const month = r.month;
  openSheet(`<h2 style="font-size:22px">Categories and limits</h2><div class="small muted" style="margin-bottom:8px">A limit applies to every month. Spending so far is for ${month}. Leave blank for no limit.</div>
  ${r.categories.map(c => `<div class="srow"><span style="font-size:22px">${c.icon}</span><div class="sp"><b>${esc(c.label)}</b><div class="small muted">${fmtINR((c.spent_paise || 0) / 100)} spent</div></div><input class="lim-in" type="number" min="0" inputmode="decimal" placeholder="no limit" data-lim="${c.slug}" value="${c.limit_paise != null ? c.limit_paise / 100 : ''}" aria-label="Limit for ${esc(c.label)}">${c.custom ? `<button class="x" data-act="cat-del" data-s="${c.slug}" aria-label="Delete ${esc(c.label)}">&#10005;</button>` : ''}</div>`).join('')}
  <h3 style="margin:14px 0 4px;font-size:15px">New category</h3><div class="row"><select id="nIcon" class="field" style="width:70px">${EMOJIS.map(e => `<option>${e}</option>`).join('')}</select><input id="nName" class="sp" placeholder="Name, e.g. Gym"><input id="nLim" class="sp" type="number" min="0" placeholder="Limit (₹)"></div><div class="err" id="nErr"></div><button class="btn block" data-act="cat-add">Add category</button>`);
}
async function addCatFromSheet(prefix, after) {
  const name = $('#' + prefix + 'Name').value.trim(), lim = parseFloat($('#' + prefix + 'Lim').value), icon = $('#' + prefix + 'Icon').value, err = $('#' + prefix + 'Err');
  const r = await api('POST', '/categories', { label: name, icon, limit_paise: lim > 0 ? toPaise(lim) : null }); if (r.status >= 300) return (err.textContent = r.body.error.message);
  await loadCats(); after(r.body.category);
}

Object.assign(ACT, {
  fab: () => openTxnSheet(null), 'add-manual': () => openTxnSheet(null), 'tell-aunty': () => switchTab('chat'),
  'l-prev': () => ledgerStep(-1), 'l-next': () => ledgerStep(1), 'l-cal': () => openCalendar(), 'l-menu': () => { L.menu = !L.menu; renderLedger(); },
  'l-mode': el => { L.mode = el.dataset.m; L.menu = false; LS.set('ha_lmode', L.mode); loadLedger(); },
  'l-search': () => { L.showSearch = !L.showSearch; renderLedger(); if (L.showSearch) { const i = $('#lSearch'); if (i) i.focus(); } },
  'l-edit': el => { const e = L.data.entries.find(x => x.id === el.dataset.id); if (e) openTxnSheet(e); },
  'cal-nav': el => openCalendar(el.dataset.m), 'cal-day': el => { L.mode = 'daily'; L.anchor = el.dataset.d; LS.set('ha_lmode', 'daily'); closeSheet(); loadLedger(); },
  'cal-month': el => { L.mode = 'monthly'; L.anchor = el.dataset.m + '-01'; LS.set('ha_lmode', 'monthly'); closeSheet(); loadLedger(); },
  'sh-kind': el => { Sh.kind = el.dataset.k; document.querySelectorAll('#shKind button').forEach(b => b.classList.toggle('on', b.dataset.k === Sh.kind)); $('#shCatWrap').style.display = Sh.kind === 'expense' ? 'block' : 'none'; $('#shTitle').placeholder = Sh.kind === 'income' ? 'Salary' : 'Dinner, auto, groceries...'; },
  'sh-cat': el => { Sh.cat = el.dataset.s; renderChips(); },
  'sh-newcat': () => { const n = $('#shNewCat'); if (n.style.display === 'block') { n.style.display = 'none'; return; } n.style.display = 'block'; n.innerHTML = `<div class="newcat"><div class="row"><select id="snIcon" style="width:64px">${EMOJIS.map(e => `<option>${e}</option>`).join('')}</select><input id="snName" class="sp" placeholder="Category name"><input id="snLim" class="sp" type="number" min="0" placeholder="Limit ₹ (optional)"></div><div class="err" id="snErr"></div><button type="button" class="btn sm" data-act="sh-savecat">Add category</button></div>`; $('#snName').focus(); },
  'sh-savecat': () => addCatFromSheet('sn', c => { Sh.cat = c.slug; $('#shNewCat').style.display = 'none'; renderChips(); }),
  'sh-save': saveTxn,
  'sh-delete': async () => {
    const e = Sh.edit; if (e.kind === 'income') { if (!confirm('Delete this income?')) return; await api('DELETE', '/income/' + e.id); closeSheet(); await refreshSummary(); return; }
    await api('DELETE', '/spends/' + e.id); closeSheet(); await refreshSummary(); toast(`Deleted ${fmtINR(e.amount_paise / 100)}. <button class="lnk" data-act="restore" data-id="${e.id}">Undo</button>`);
  },
  'calc-toggle': () => { const b = $('#calcBox'); const open = b.style.display === 'none'; b.style.display = open ? 'block' : 'none'; if (open) { Calc.expr = $('#shAmt').value && calcEval($('#shAmt').value) != null ? $('#shAmt').value : ''; calcRender(); } },
  'calc-key': el => { const k = el.dataset.k; if (k === 'C') Calc.expr = ''; else if (k === '⌫') Calc.expr = Calc.expr.slice(0, -1); else if (k === '=') { const v = calcEval(Calc.expr); if (v != null) Calc.expr = String(v); } else Calc.expr += k; calcRender(); },
  'calc-use': () => { const v = calcEval(Calc.expr); if (v == null || v <= 0) return toast('That does not add up to an amount.'); $('#shAmt').value = v; $('#calcBox').style.display = 'none'; },
  'manage-accounts': openAccounts, 'manage-cats': openCats,
  'acc-add': async () => { const r = await api('POST', '/accounts', { name: $('#aName').value, type: $('#aType').value, opening_paise: toPaise(parseFloat($('#aBal').value) || 0) }); if (r.status >= 300) return ($('#aErr').textContent = r.body.error.message); await refreshSummary(); openAccounts(); },
  'acc-edit': async el => { const n = prompt('Account name:', el.dataset.n); if (n == null) return; const b = prompt('Current balance (₹):', el.dataset.b); if (b == null) return; const target = toPaise(parseFloat(b) || 0), cur = toPaise(parseFloat(el.dataset.b)); const accs = (await api('GET', '/accounts')).body.accounts; const a = accs.find(x => x.id === el.dataset.id); const r = await api('PATCH', '/accounts/' + el.dataset.id, { name: n, opening_paise: a.opening_paise + (target - a.balance_paise) }); if (r.status >= 300) toast(esc(r.body.error.message)); await refreshSummary(); openAccounts(); },
  'acc-del': async el => { if (!confirm('Delete this account? Its entries move to your other account.')) return; const r = await api('DELETE', '/accounts/' + el.dataset.id); if (r.status >= 300) toast(esc(r.body.error.message)); await refreshSummary(); openAccounts(); },
  'cat-add': () => addCatFromSheet('n', () => { refreshSummary(); openCats(); }),
  'cat-del': async el => { if (!confirm('Delete this category? Its spends move to Other.')) return; await api('DELETE', '/categories/' + el.dataset.s); await loadCats(); await refreshSummary(); openCats(); },
  'says-chat': () => { document.querySelectorAll('.says').forEach(x => x.remove()); switchTab('chat'); }, 'says-close': el => el.closest('.says').remove(),
});
document.addEventListener('change', async e => {
  const el = e.target.closest('[data-lim]'); if (!el) return; const v = parseFloat(el.value);
  const r = await api('PATCH', '/categories/' + el.dataset.lim, { limit_paise: v > 0 ? toPaise(v) : null }); if (r.status >= 300) toast(esc(r.body.error.message)); else { await loadCats(); toast('Limit saved.', 1800); if (App.tab === 'ledger') loadLedger(); }
});
document.addEventListener('input', e => { if (e.target.id === 'lSearch') renderLedgerList(); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'shAmt') { e.preventDefault(); const v = calcEval(e.target.value); if (v != null) e.target.value = v; } if (e.key === 'Enter' && e.target.classList && e.target.classList.contains('lrow')) e.target.click(); });
(function swipe() { let x0 = null; document.addEventListener('touchstart', e => { x0 = e.target.closest('#p-ledger') ? e.touches[0].clientX : null; }, { passive: true }); document.addEventListener('touchend', e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 70) ledgerStep(dx < 0 ? 1 : -1); }, { passive: true }); })();
document.addEventListener('click', e => { if (L.menu && !e.target.closest('.menu-wrap')) { L.menu = false; if (App.tab === 'ledger' && L.data) renderLedger(); } });
// ==END UI-LEDGER==
