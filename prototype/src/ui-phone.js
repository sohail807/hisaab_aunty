// ==UI-PHONE== the mobile app, talking only to api() (the mock /v1 server)
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } } };
const clock = { offset: LS.get('ha_clock_off', 0), now() { return Date.now() + this.offset; } };
const DB = createDB('ha_db_v1');
const CFG = Object.assign({ aiDown: false, llmNudges: false, injectBadNumber: false, injectBadRegional: false }, LS.get('ha_cfg', {}));
const B = createBackend({ db: DB, clock, cfg: CFG }); installAunty(B);
CFG.llm = Object.assign({ enabled: false, proxyUrl: 'http://localhost:8787', model: '', timeoutMs: 60000, jsonSchema: true }, CFG.llm || {});
B.llm = makeLLM(CFG);   // the small language model adapter; the API key lives only in llm-proxy.js
const saveCfg = () => LS.set('ha_cfg', { aiDown: CFG.aiDown, llmNudges: CFG.llmNudges, injectBadNumber: CFG.injectBadNumber, injectBadRegional: CFG.injectBadRegional, llm: CFG.llm });
let S = LS.get('ha_session', null);
const saveS = () => LS.set('ha_session', S);
const App = { user: null, summary: null, tab: 'chat', offline: LS.get('ha_offline', false), rendered: new Set(), prevLeft: null, mood: 'neutral', busy: false, lastHidden: 0, locked: false, signup: {}, flavours: {} };
const CONSENT_VERSION = '2026-10';
const money = p => fmtINR(p / 100);
const catLabel = c => { const x = (App.cats || []).find(k => k.slug === c); return x ? x.label : (CAT_LABEL[c] || c); };
const catIcon = c => { const x = (App.cats || []).find(k => k.slug === c); return x ? x.icon : '🧾'; };
async function loadCats(month) { const r = await api('GET', '/categories' + (month ? '?month=' + month : '')); if (r.status === 200) { App.cats = r.body.categories; return r.body; } return null; }
const nowIso = () => new Date(clock.now()).toISOString();

let refreshInFlight = null;   // only ONE refresh at a time: refresh tokens rotate, so two parallel refreshes reuse the same token and the server logs you out everywhere
function refreshSession() {
  if (!refreshInFlight) refreshInFlight = (async () => {
    if (!S || !S.refresh) return false;
    const rr = await B.api('POST', '/v1/auth/refresh', { body: { refresh_token: S.refresh } });
    if (rr.status === 200) { S.access = rr.body.access_token; S.refresh = rr.body.refresh_token; saveS(); return true; }
    return false;
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}
async function api(method, path, body, headers) {
  if (App.offline) return { status: 0, body: { error: { code: 'offline', message: 'You are offline.' } } };
  const used = S && S.access;
  let r = await B.api(method, '/v1' + path, { token: used, body, headers });
  if (r.status === 401 && S && S.refresh && !path.startsWith('/auth/')) {
    const ok = (S && S.access !== used) ? true : await refreshSession();   // another request may already have refreshed: then just retry with the new token
    if (ok && S) r = await B.api(method, '/v1' + path, { token: S.access, body, headers });
    else if (!ok) forceLogout();
  }
  if (typeof refreshDash === 'function') refreshDash();
  return r;
}
function forceLogout() { S = null; saveS(); App.user = null; showWelcome(); }
const vibe = ms => { if (App.user && App.user.haptics && navigator.vibrate) try { navigator.vibrate(ms || 10); } catch (e) { /* ignore */ } };

// ---------- Aunty's face ----------
function faceSVG(mood, cls) {
  return `<svg class="face m-${mood} ${cls || ''}" viewBox="0 0 100 100" aria-label="Aunty looks ${mood}"><circle cx="50" cy="50" r="48" fill="#F39C1E"/>
  <circle cx="50" cy="13" r="10" fill="#1C2B4B"/><ellipse cx="50" cy="42" rx="30" ry="32" fill="#1C2B4B"/><ellipse cx="50" cy="52" rx="25" ry="28" fill="#C98A5B"/>
  <path d="M25 46 Q50 10 75 46 Q50 30 25 46Z" fill="#1C2B4B"/><circle cx="24" cy="58" r="3" fill="#E8B930"/><circle cx="76" cy="58" r="3" fill="#E8B930"/>
  <circle cx="40" cy="49" r="8.5" fill="rgba(255,255,255,.18)" stroke="#1C2B4B" stroke-width="2"/><circle cx="60" cy="49" r="8.5" fill="rgba(255,255,255,.18)" stroke="#1C2B4B" stroke-width="2"/><path d="M48.5 49 H51.5" stroke="#1C2B4B" stroke-width="2"/>
  <circle class="eye" cx="40" cy="50" r="2.4"/><circle class="eye" cx="60" cy="50" r="2.4"/>
  <path class="brow-l" d="M32 38 L47 38"/><path class="brow-r" d="M53 38 L68 38"/><circle cx="50" cy="41" r="2" fill="#D32F2F"/><path class="mouth" d="M43 65 L57 65"/></svg>`;
}
function setMood(m) { App.mood = m; document.querySelectorAll('#hdrFace .face').forEach(f => { f.setAttribute('class', f.getAttribute('class').replace(/m-\w+/, 'm-' + m)); }); }

// ---------- screens: splash, welcome, signup, login ----------
const phone = () => $('#phone');
function applyTheme() {
  const u = App.user; const p = phone(); if (!p) return;
  const t = u ? u.theme : 'system'; const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  p.dataset.theme = dark ? 'dark' : 'light';
  const rm = u ? u.reduce_motion : 'system'; p.dataset.rm = rm; p.classList.toggle('rm', rm === 'on' || (rm === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches));
}
function showSplash() { phone().innerHTML = `<div class="screen navy"><div class="pop" style="width:120px">${faceSVG('happy')}</div><h1 style="font-size:34px;margin-top:14px">Hisaab Aunty</h1></div>`; }
// ---------- sign-in screens: no browser password manager, show/hide eye, live password rules ----------
const EYE_ON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.9 17.9A10.9 10.9 0 0112 19C5 19 1 12 1 12a19.8 19.8 0 015.1-5.9M9.9 5.2A10.4 10.4 0 0112 5c7 0 11 7 11 7a19.7 19.7 0 01-3.2 4.2M1 1l22 22"/><path d="M14.1 14.1a3 3 0 01-4.2-4.2"/></svg>';
const authWrap = (inner) => `<div class="screen">${inner}</div><div id="overlay"></div>`;
// type="text" with CSS masking, so Chrome never offers to save or suggest a password
function pwField(id, val, label) {
  return `<div class="field"><label for="${id}">${label}</label><div class="pwrow"><input id="${id}" class="pw-mask" type="text" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" data-lpignore="true" data-1p-ignore="true" data-form-type="other" name="x${id}" value="${esc(val || '')}"><button type="button" class="eye" data-act="pw-eye" data-t="${id}" aria-label="Show password" aria-pressed="false">${EYE_ON}</button></div></div>`;
}
const PW_RULES = [['len', 'At least 8 characters', v => v.length >= 8], ['letter', 'A letter (a to z)', v => /[A-Za-z]/.test(v)], ['num', 'A number (0 to 9)', v => /\d/.test(v)]];
const pwProblem = v => { const bad = PW_RULES.find(r => !r[2](v)); return bad ? 'Password needs: ' + bad[1].toLowerCase() + '.' : null; };
function pwRulesHtml(v) { return `<ul class="pwrules" id="pwRules" aria-live="polite">${PW_RULES.map(r => `<li data-r="${r[0]}" class="${r[2](v || '') ? 'ok' : ''}"><span class="tick">${r[2](v || '') ? '&#10003;' : '&#9675;'}</span> ${r[1]}</li>`).join('')}</ul>`; }
function showWelcome() {
  applyTheme();
  phone().innerHTML = authWrap(`<div class="pad" style="flex:1;display:flex;flex-direction:column;justify-content:center;text-align:center;gap:10px">
  <div style="width:130px;margin:0 auto">${faceSVG('happy')}</div><h1 style="font-size:36px">Hisaab Aunty</h1>
  <p class="muted" style="margin:0 12px 18px">Your daily number, your goals, and one honest aunty. Tell her what you spent and she keeps the books.</p>
  <button class="btn block" data-act="go-signup">Create account</button><button class="btn sec block" data-act="go-login">Log in</button></div>`);
}
function showLogin(err) {
  phone().innerHTML = authWrap(`<div class="scroll pad"><button class="lnk" data-act="back-welcome">Back</button><h1 style="font-size:30px;margin:14px 0 4px">Welcome back</h1>
  <div class="field"><label for="lEmail">Email</label><input id="lEmail" type="email" autocomplete="off" value="${esc(App.lastEmail || '')}"></div>
  ${pwField('lPw', '', 'Password')}
  <div class="err" id="lErr">${esc(err || '')}</div><button class="btn block" data-act="do-login">Log in</button></div>`);
}
function showSignup(step, err) {
  const d = App.signup;
  if (step === 1) phone().innerHTML = authWrap(`<div class="scroll pad"><button class="lnk" data-act="back-welcome">Back</button><h1 style="font-size:30px;margin:14px 0 4px">Create your account</h1><p class="muted small">Step 1 of 3</p>
  <div class="field"><label for="sEmail">Email</label><input id="sEmail" type="email" autocomplete="off" value="${esc(d.email || '')}"></div>
  ${pwField('sPw', d.password, 'Password')}${pwRulesHtml(d.password)}
  <div class="err" id="sErr">${esc(err || '')}</div><button class="btn block" data-act="signup-1">Continue</button></div>`);
  else if (step === 2) phone().innerHTML = authWrap(`<div class="scroll pad"><button class="lnk" data-act="signup-back">Back</button><h1 style="font-size:30px;margin:14px 0 4px">About you</h1><p class="muted small">Step 2 of 3</p>
  <div class="field"><label for="sName">Your first name</label><input id="sName" autocomplete="off" value="${esc(d.name || '')}"></div>
  <div class="field"><label for="sCity">Which city are you in?</label><input id="sCity" autocomplete="off" value="${esc(d.city || '')}" placeholder="Pune, Chennai, Delhi..."></div>
  <div class="field"><label for="sFlav">Aunty's regional flavour</label><select id="sFlav">${Object.keys(FLAVOURS).map(f => `<option value="${f}" ${d.region_flavour === f ? 'selected' : ''}>${f === 'none' ? 'English only' : cap(f)}${FLAVOUR_STATUS[f] === 'preview' ? ' (preview)' : ''}</option>`).join('')}</select></div>
  <label class="check"><input type="checkbox" id="sAge"> <span>I am 18 or older.</span></label>
  <label class="check"><input type="checkbox" id="sConsent"> <span>I accept the <button type="button" class="lnk" data-act="show-privacy">privacy notice</button>.</span></label>
  <div class="err" id="sErr">${esc(err || '')}</div><button class="btn block" data-act="signup-2">Create account</button></div>`);
  else phone().innerHTML = authWrap(`<div class="scroll pad" style="text-align:center"><div style="width:100px;margin:30px auto 10px">${faceSVG('happy')}</div><h1 style="font-size:28px">Aunty speaks up once a day</h1><p class="muted">Step 3 of 3. Around 7 pm she sends one short nudge: a win, or a warning when a habit pulls a goal off track. Never more than one a day, never at night.</p>
  <button class="btn block" data-act="notif-allow">Allow notifications</button><button class="btn sec block" style="margin-top:8px" data-act="notif-later">Maybe later</button></div>`);
}

async function doLogin(email, pw) {
  const r = await B.api('POST', '/v1/auth/login', { body: { email, password: pw, device: 'Web prototype' } });
  if (r.status !== 200) return showLogin(r.body.error.message);
  S = { access: r.body.access_token, refresh: r.body.refresh_token, uid: r.body.user.id }; saveS(); App.user = r.body.user; await enterApp();
}

// ---------- shell ----------
async function enterApp() {
  App.rendered = new Set(); App.prevLeft = null; App.tab = 'chat';
  const me = await api('GET', '/me'); if (me.status !== 200) return showWelcome(); App.user = me.body.user; App.flavours = me.body.flavours;
  phone().innerHTML = `<div class="hdr"><div class="sp"><div class="ttl">Hisaab Aunty</div><div class="sub" id="hdrSub">&nbsp;</div></div><span id="hdrPill"></span><button class="icon-btn" data-act="open-settings" aria-label="Settings">&#9881;</button></div>
  <div class="panels"><div class="panel" id="p-spend"></div><div class="panel" id="p-chat"></div><div class="panel" id="p-ledger"></div><div class="panel" id="p-goal"></div></div><button class="fab" id="fab" data-act="fab" aria-label="Add expense or income" style="display:none">+</button>
  <div class="tabbar" role="tablist"><button data-act="tab" data-tab="spend"><span class="ti">&#9684;</span>Spend</button><button data-act="tab" data-tab="chat"><span class="ti">&#128172;</span>Aunty</button><button data-act="tab" data-tab="ledger"><span class="ti">&#9776;</span>Ledger</button><button data-act="tab" data-tab="goal"><span class="ti">&#9733;</span>Goal</button></div><div id="overlay"></div>`;
  applyTheme(); buildSpendShell(); buildChat(); $('#p-goal').innerHTML = '';
  await loadCats();
  if (App.freshSignup) { await refreshSummary(); switchTab('chat'); await introChat(); } else { await loadChat(); await refreshSummary(); switchTab('chat'); renderLastWidget(); }
  if (typeof refreshDash === 'function') refreshDash();
}
function switchTab(t) {
  if (App.tab === 'chat' && t !== 'chat') setMood('neutral');
  App.tab = t; const fab = $('#fab'); if (fab) fab.style.display = (t === 'spend' || t === 'ledger') ? 'flex' : 'none'; if (t === 'ledger' && typeof loadLedger === 'function') loadLedger();
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === 'p-' + t));
  document.querySelectorAll('.tabbar button').forEach(b => { const on = b.dataset.tab === t; b.classList.toggle('on', on); on ? b.setAttribute('aria-selected', 'true') : b.removeAttribute('aria-selected'); });
  if (t === 'chat') { const f = $('#feed'); if (f) f.scrollTop = f.scrollHeight; setTimeout(() => { const i = $('#chatIn'); if (i) i.focus(); }, 50); }
}
function updateHeader() {
  const s = App.summary; if (!s) return; const sub = $('#hdrSub'), pill = $('#hdrPill'); if (!sub) return;
  sub.textContent = s.goal ? (s.goal.icon || '🎯') + ' ' + s.goal.name + (s.goal.count > 1 ? ' goals' : ' goal') : (s.has_budget ? 'Daily budget' : 'Setting up');
  pill.innerHTML = s.status === 'on_track' ? '<span class="pill ok">&#10003; on track</span>' : s.status === 'over' ? '<span class="pill over">&#9650; over</span>' : '';
}
async function refreshSummary(opts) {
  const r = await api('GET', '/summary'); if (r.status !== 200) { if (r.status === 0) renderOfflineNote(); return; } App.summary = r.body; renderOfflineNote();
  updateHeader(); renderSpend(opts); renderGoal(); renderWidgetPreview(); if (App.tab === 'ledger' && typeof loadLedger === 'function') loadLedger();
  const s = r.body, n = s.latest_nudge;
  if (n && LS.get('ha_seen_nudge') !== n.id) { LS.set('ha_seen_nudge', n.id); if (App.user.notif_permission === 'granted' && App.tab !== 'chat') showPush(n.text); loadChat(); }
  if (s.streak && s.streak.milestone) { const k = 'ha_cele_' + s.today + '_' + s.streak.milestone; if (!LS.get(k)) { LS.set(k, 1); celebrate(s.streak.milestone + '-day streak!'); } }
}
function renderOfflineNote() { const f = $('#offNote'); if (f) f.style.display = App.offline ? 'block' : 'none'; const i = $('#chatIn'); if (i) { i.disabled = App.offline; i.placeholder = App.offline ? 'Offline: sending is paused' : 'Message Aunty...'; } const b = $('#sendBtn'); if (b) b.disabled = App.offline; }
function showPush(text) { const o = $('#overlay'); const el = document.createElement('div'); el.className = 'push'; el.innerHTML = `<b>Aunty &middot; now</b><div>${esc(text)}</div>`; el.onclick = () => { el.remove(); switchTab('chat'); }; o.appendChild(el); vibe(15); setTimeout(() => el.remove(), 7000); }
function toast(html, ms) { const o = $('#overlay'); if (!o) return; o.querySelectorAll('.toast').forEach(t => t.remove()); const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; o.appendChild(el); setTimeout(() => el.remove(), ms || 5000); return el; }
function celebrate(text) {
  vibe([20, 40, 20]); toast('<b>' + esc(text) + '</b> Aunty is proud.', 4000);
  const o = $('#overlay'); const c = document.createElement('div'); c.className = 'confetti'; const colors = ['#F39C1E', '#1D7349', '#B3261E', '#1C2B4B', '#FFAE45'];
  for (let i = 0; i < 28; i++) { const e = document.createElement('i'); e.style.left = Math.random() * 100 + '%'; e.style.background = colors[i % 5]; e.style.animationDelay = Math.random() * .5 + 's'; c.appendChild(e); }
  o.appendChild(c); setTimeout(() => c.remove(), 2400);
}

// ---------- Spend tab ----------
function buildSpendShell() {
  $('#p-spend').innerHTML = `<div class="scroll" id="spendScroll">
  <div class="gauge-card"><svg class="gauge" id="gauge" viewBox="0 0 220 120" role="img" aria-label="What is left today"><path class="track" pathLength="100" d="M20 110 A90 90 0 0 1 200 110"/><path class="fill" id="gArc" pathLength="100" d="M20 110 A90 90 0 0 1 200 110" style="stroke-dashoffset:100"/></svg>
  <div class="big" id="bigNum">&nbsp;</div><div class="gauge-lbl" id="gLbl"></div><div class="gauge-sub" id="gSub"></div><div id="gTag" style="margin-top:8px"></div>
  <button class="btn saf block" style="margin-top:12px" data-act="tell-aunty">Tell Aunty what you spent</button><div class="row" style="margin-top:8px;justify-content:center;gap:14px"><button class="lnk small" data-act="add-manual">Add a spend manually</button></div></div>
  <div id="spendRest"></div></div>`;
}
function animateNum(el, from, to, prefix) {
  const rm = phone().classList.contains('rm'); if (rm || from == null || from === to) { el.textContent = prefix + fmtINR(Math.abs(to)).replace('₹', '₹'); return; }
  const t0 = performance.now(), dur = 800; const step = t => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmtINR(Math.abs(from + (to - from) * e)); if (k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step);
}
function renderSpend() {
  const s = App.summary; if (!s || !$('#gArc')) return; const arc = $('#gArc'), g = $('#gauge');
  if (!s.has_budget) { arc.style.strokeDashoffset = 100; g.classList.remove('over'); $('#bigNum').textContent = '—'; $('#gLbl').textContent = 'no daily number yet'; $('#gSub').textContent = 'Tell Aunty your monthly income'; $('#gTag').innerHTML = ''; }
  else {
    const left = s.left_today_paise / 100, bud = s.daily_budget_paise / 100, over = left < 0;
    const frac = bud > 0 ? Math.min(1, Math.abs(left) / bud) : 0; arc.style.strokeDashoffset = 100 * (1 - (over ? Math.max(frac, .04) : frac)); g.classList.toggle('over', over);
    animateNum($('#bigNum'), App.prevLeft, Math.abs(left), ''); App.prevLeft = Math.abs(left);
    $('#gLbl').textContent = over ? 'over today' : 'left today'; $('#gSub').innerHTML = `${fmtINR(s.spent_today_paise / 100)} spent of ${fmtINR(bud)} a day <button class="info" data-act="budget-info" aria-label="How is this calculated?">&#9432; how?</button>`;
    $('#gTag').innerHTML = over ? '<span class="pill over">&#9650; Over budget</span>' : '<span class="pill ok">&#10003; On track today</span>';
  }
  const goalTile = !s.goal ? `<div class="v">No goal</div><button class="lnk small" data-act="add-goal">Add one</button>` : `<div class="v">${s.goal.icon || '🎯'} ${esc(s.goal.name)}</div>${goalPill(s.goal)}`;
  const wk = s.week; const wp = wk && wk.budget_paise ? Math.min(100, wk.spent_paise / wk.budget_paise * 100) : 0;
  const cats = s.categories_last_7_days, maxc = Math.max(1, ...cats.map(c => c.spent_paise));
  const sk = s.streak, ln = s.latest_nudge, rc = s.latest_recap;
  const noSpendBtn = (!s.checked_in_today && s.spent_today_paise === 0 && s.has_budget) ? `<button class="btn sm sec" data-act="checkin">Nothing spent today</button>` : '';
  $('#spendRest').innerHTML = `
  <div class="grid2"><div class="tile"><div class="k">This week</div><div class="v">${wk ? fmtINR(wk.spent_paise / 100) : '—'}</div><div class="bar ${wk && wk.spent_paise > wk.budget_paise ? 'over' : ''}"><i style="width:${wp}%"></i></div><div class="small muted" style="margin-top:4px">${wk ? 'of ' + fmtINR(wk.budget_paise / 100) + ' budget' : 'needs your income'}</div></div>
  <div class="tile"><div class="k">Goal</div>${goalTile}</div></div>
  <div class="card row"><div style="font-size:26px">&#128293;</div><div class="sp"><b>${sk.current} day streak</b><div class="small muted">Best ${sk.best} &middot; ${sk.noSpendDaysThisMonth} no-spend days this month</div></div>${noSpendBtn}</div>
  ${s.insight ? `<div class="card insight"><div class="small muted" style="font-weight:700">Today's insight</div><div>${esc(s.insight.text)}</div></div>` : ''}
  ${ln ? `<div class="card nudge"><div class="small muted" style="font-weight:700">Latest nudge</div><div style="margin:4px 0 8px">${esc(ln.text)}</div>${ln.reaction ? `<span class="pill neutral">${ln.reaction === 'got_it' ? 'Got it' : 'Not now'}</span>` : `<button class="btn sm" data-act="react" data-id="${ln.id}" data-r="got_it">Got it</button> <button class="btn sm sec" data-act="react" data-id="${ln.id}" data-r="not_now">Not now</button>`} <button class="lnk small" data-act="open-settings" data-scroll="past-nudges" style="margin-left:8px">Past nudges</button></div>` : ''}
  ${rc ? `<div class="card"><div class="small muted" style="font-weight:700">Weekly recap &middot; week of ${fmtDate(rc.week_start)}</div><div style="margin:4px 0 8px">${esc(rc.caption)}</div><button class="btn sm sec" data-act="share-recap" data-id="${rc.id}">Share as image</button></div>` : ''}
  <div class="card"><h3>Last 7 days by category</h3>${cats.length ? cats.map(c => `<div class="cat-row"><span>${catIcon(c.id)} ${catLabel(c.id)}</span><div class="bar"><i style="width:${c.spent_paise / maxc * 100}%"></i></div><b>${fmtINR(c.spent_paise / 100)}</b></div>`).join('') : '<div class="empty">Nothing yet. Your first spend will show up here.</div>'}</div>
  <div class="card"><h3>Recent spends</h3>${s.recent_spends.length ? s.recent_spends.slice(0, 12).map(x => `<div class="spend-row"><span class="chip-cat">${catIcon(x.category)} ${catLabel(x.category)}</span><div class="sp">${esc(x.note || x.category)}<div class="small muted">${x.day === s.today ? 'Today' : fmtDate(x.day)}</div></div><b>${fmtINR(x.amount_paise / 100)}</b><button class="x" data-act="rm-spend" data-id="${x.id}" aria-label="Remove ${esc(x.note || x.category)}">&#10005;</button></div>`).join('') : '<div class="empty">No spends yet. Tell Aunty about your first chai.</div>'}</div>`;
}
function goalPill(g) {
  if (g.never) return '<span class="pill late">&#9650; Not reachable at this pace</span>';
  return g.on_time ? `<span class="pill ok">&#10003; On time${g.delay_days < 0 ? ', ' + daysTxt(g.delay_days) + ' ahead' : ''}</span>` : `<span class="pill late">&#9650; Running late, ${daysTxt(g.delay_days)} behind</span>`;
}
// the numbers behind the daily budget, shown on the Goal tab and in the "how is this calculated" sheet
function budgetBreakdownHtml(bx) {
  if (!bx) return '<div class="empty">Tell Aunty your monthly income and she will work out your daily number.</div>';
  const row = (l, v, cls) => `<div class="brow ${cls || ''}"><span>${l}</span><b>${v}</b></div>`;
  return `${row('Monthly income', fmtINR(bx.income_paise / 100))}${bx.rent_paise ? row('minus rent and fixed bills', '-' + fmtINR(bx.rent_paise / 100)) : ''}${bx.goals.map(g => row('minus saving for ' + esc(g.icon + ' ' + g.name), '-' + fmtINR(g.req_paise / 100))).join('')}
  ${row('Free to spend this month', fmtINR(bx.free_paise / 100), 'sum')}${row('divided by the days in this month', bx.days_in_month + ' days')}${row('Your daily number', fmtINR(bx.daily_paise / 100), 'sum big2')}
  <div class="small muted" style="margin-top:8px">Goal savings are cost divided by months left. Change your income or rent in Settings, or tell Aunty.</div>`;
}
function renderGoal() {
  const s = App.summary, el = $('#p-goal'); if (!el || !s) return; const bx = s.budget_explainer;
  if (!s.goals.length) { el.innerHTML = `<div class="scroll"><div class="empty" style="padding:30px 10px"><div style="width:80px;margin:0 auto 10px">${faceSVG('neutral')}</div>No goal yet. That is fine: your daily number works without one.<br><br><button class="btn" data-act="add-goal">Add a goal</button></div>${bx ? `<div class="card"><h3>How your daily number works</h3>${budgetBreakdownHtml(bx)}</div>` : ''}</div>`; return; }
  const cards = s.goals.map(g => `<div class="card" style="margin-top:0;margin-bottom:12px"><div class="row"><div style="font-size:34px">${g.icon}</div><div class="sp"><div class="small muted" style="font-weight:700">Saving for</div><h1 style="font-size:24px;line-height:1.1">${esc(g.name)}</h1></div><button class="x" data-act="del-goal" data-id="${g.id}" data-n="${esc(g.name)}" aria-label="Delete ${esc(g.name)}">&#10005;</button></div>
  <div style="margin:8px 0">${goalPill(g)}</div><div class="grid2" style="margin-top:0"><div class="tile"><div class="k">Cost</div><div class="v">${money(g.cost_paise)}</div></div><div class="tile"><div class="k">Deadline</div><div class="v" style="font-size:16px">${fmtDate(g.deadline)}</div></div></div>
  <div class="small muted" style="margin-top:8px">Needs ${money(g.required_per_month_paise)} a month. ${g.never ? 'At this month\'s pace it would not be reached.' : 'At your pace: around ' + fmtDate(g.eta_date) + '.'}</div></div>`).join('');
  const total = s.goal;
  el.innerHTML = `<div class="scroll">${cards}${s.goals.length > 1 ? `<div class="card" style="margin-top:0;margin-bottom:12px"><div class="small muted" style="font-weight:700">All goals together</div><div class="v num" style="font-size:22px">${money(total.required_per_month_paise)} a month</div><div class="small muted">${money(total.required_per_day_paise)} a day. Every spend delays all of them by the same number of days.</div></div>` : ''}
  <button class="btn block" data-act="add-goal">Add another goal</button><div class="card"><h3>How your daily number works</h3>${budgetBreakdownHtml(bx)}</div></div>`;
}

function renderWidgetPreview() { const el = $('#widgetPrev'); if (!el || !App.summary) return; const w = App.summary.widget; el.innerHTML = `<div class="widget" data-act="widget-tap">${faceSVG('happy')}<div><div class="num" style="font-size:16px;line-height:1.1">${esc(w.text)}</div><div class="small" style="opacity:.8">${w.on_time == null ? 'no goal' : w.on_time ? 'goal on time' : 'goal late'}</div></div></div>`; }

// ---------- chat ----------
const CHIPS = ['swiggy 350', 'chai 30', 'Can I buy shoes 2k?', 'How am I doing?', 'chai 20 and auto 80', 'Compare this week with last week', 'If I skip delivery for 2 weeks', 'Explain my goal maths', 'Show my food spends this month', 'What is my streak?', 'Remember my rent is due on the 5th'];
function buildChat() {
  $('#p-chat').innerHTML = `<div class="offline-note" id="offNote" style="display:none">Offline. Showing your last figures; sending is paused.</div><div class="feed" id="feed" aria-live="polite"></div>
  <div class="chips" id="chips">${CHIPS.map(c => `<button data-act="chip" data-t="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="edit-banner" id="editBanner" style="display:none"><span>Editing your last message</span><button type="button" class="lnk" data-act="cancel-edit">Cancel</button></div>
  <form class="chat-in" id="chatForm"><button type="button" class="btn mic" id="micBtn" data-act="mic" aria-label="Speak">&#127908;</button><textarea id="chatIn" rows="1" autocomplete="off" maxlength="500" placeholder="Message Aunty..." aria-label="Message"></textarea><button class="btn" id="sendBtn" type="submit">Send</button></form>`;
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); const i = $('#chatIn'); const t = i.value.trim(); if (!t) return; i.value = ''; autoGrow(i); if (App.editing) editMessage(t); else sendMessage(t); });
}
function bubble(m, opts) {
  const f = $('#feed'); if (!f) return; if (m.id && App.rendered.has(m.id)) return; if (m.id) App.rendered.add(m.id);
  const el = document.createElement('div'); el.className = 'msg ' + (m.role === 'user' ? 'u' : 'a') + (m.meta && m.meta.nudge_id ? ' nudgemsg' : ''); if (m.cid) el.dataset.cid = m.cid; if (m.id) el.dataset.mid = m.id; if (m.meta && m.meta.flow) el.dataset.flow = '1'; if (m.meta && m.meta.ui) el.dataset.ui = JSON.stringify(m.meta.ui);
  let html = esc(m.text);
  if (m.meta && m.meta.nudge_id) html = '<div class="small muted" style="font-weight:700;margin-bottom:2px">Aunty\'s nudge</div>' + html;
  const acts = (m.meta && m.meta.actions) || []; acts.filter(a => a.type === 'spend_logged' && a.spend_id).forEach(a => { html += `<button class="lnk undo" data-act="undo-spend" data-id="${a.spend_id}">Undo ${a.amount_inr ? fmtINR(a.amount_inr) : 'this'}</button>`; });
  el.innerHTML = html; f.appendChild(el); f.scrollTop = f.scrollHeight; markEditable(); return el;
}
function markEditable() {
  document.querySelectorAll('.edit-btn').forEach(b => b.remove()); const f = $('#feed'); if (!f) return;
  const us = [...f.querySelectorAll('.msg.u')]; const last = us[us.length - 1]; if (!last || !last.dataset.mid || last.classList.contains('fail')) return;
  const after = [...f.children].slice([...f.children].indexOf(last) + 1); if (after.some(n => n.classList && n.classList.contains('typing'))) return; const nx = after.find(n => n.classList && n.classList.contains('a')); if (nx && nx.dataset.flow) return;
  last.insertAdjacentHTML('beforeend', `<button class="lnk edit-btn" data-act="edit-msg" data-id="${last.dataset.mid}" data-t="${esc(last.firstChild.textContent)}">Edit</button>`);
}
function hideChips() { const c = $('#chips'); if (c) c.remove(); }
function startEdit(id, text) { App.editing = { id }; const i = $('#chatIn'); i.value = text; autoGrow(i); i.focus(); $('#editBanner').style.display = 'flex'; }
function cancelEdit() { App.editing = null; const i = $('#chatIn'); if (i) { i.value = ''; autoGrow(i); } const b = $('#editBanner'); if (b) b.style.display = 'none'; }
async function editMessage(text) {
  const id = App.editing.id; cancelEdit(); typingOn(); await sleep(phone().classList.contains('rm') ? 0 : 350);
  const r = await api('POST', '/chat/' + id + '/edit', { message: text }); typingOff();
  if (r.status !== 200) { toast(esc(r.body.error ? r.body.error.message : 'Could not edit that message.')); return; }
  App.rendered = new Set(); $('#feed').innerHTML = ''; await loadChat(); if (r.body.replies && r.body.replies[0]) setMood(r.body.replies[0].mood || 'neutral'); await refreshSummary(); vibe(8);
}
function typingOn() { const f = $('#feed'); if (!f || $('#typing')) return; const t = document.createElement('div'); t.id = 'typing'; t.className = 'typing'; t.innerHTML = '<i></i><i></i><i></i>'; t.setAttribute('aria-label', 'Aunty is typing'); f.appendChild(t); f.scrollTop = f.scrollHeight; }
function typingOff() { const t = $('#typing'); if (t) t.remove(); }
async function loadChat() {
  const r = await api('GET', '/chat/history'); if (r.status !== 200) return; const f = $('#feed'); if (!f) return;
  if (r.body.messages.some(m => m.role === 'user')) hideChips();
  const sc = f.scrollTop; r.body.messages.forEach(m => { if (m.cid && m.role === 'user' && f.querySelector(`[data-cid="${m.cid}"]`)) { App.rendered.add(m.id); return; } bubble(m); }); f.scrollTop = sc || f.scrollHeight; renderLastWidget();
  if (!r.body.messages.length) { const e = document.createElement('div'); e.className = 'empty'; e.id = 'chatEmpty'; e.textContent = 'Say hello to Aunty.'; if (!f.children.length) f.appendChild(e); }
}
async function sendMessage(text, cidRetry) {
  if (App.offline) { toast('You are offline. Reconnect and try again.'); return; }
  if (App.tab !== 'chat') switchTab('chat'); const ce = $('#chatEmpty'); if (ce) ce.remove(); hideChips(); document.querySelectorAll('.wgt').forEach(w => w.remove());
  const cid = cidRetry || uuid(); let ub = $(`[data-cid="${cid}"]`);
  if (!ub) { ub = bubble({ role: 'user', text, cid }); } else { ub.classList.remove('fail'); const mt = ub.querySelector('.meta'); if (mt) mt.remove(); }
  typingOn(); App.busy = true; await sleep(phone().classList.contains('rm') ? 0 : 450);
  const r = await api('POST', '/chat', { message: text, client_message_id: cid });
  typingOff(); App.busy = false;
  if (r.status === 200) {
    const hist = await api('GET', '/chat/history'); const fresh = hist.body.messages.filter(m => !App.rendered.has(m.id) && !(m.role === 'user' && m.cid === cid));
    hist.body.messages.filter(m => m.role === 'user' && m.cid === cid).forEach(m => { App.rendered.add(m.id); if (ub) ub.dataset.mid = m.id; });
    for (let i = 0; i < fresh.length; i++) { if (i > 0) { typingOn(); await sleep(phone().classList.contains('rm') ? 0 : 500); typingOff(); } const el = bubble(fresh[i]); if (fresh[i].role === 'aunty') { setMood(fresh[i].mood || 'neutral'); vibe(8); } }
    markEditable(); renderLastWidget(); if (r.body.popup) setTimeout(() => showFume(r.body.popup), 450); if (r.body.summary_changed) await refreshSummary();
    if (r.body.navigate) { await sleep(900); switchTab(r.body.navigate); }
    return;
  }
  const code = r.body.error && r.body.error.code;
  if (code === 'rate_limited' || code === 'invalid_input') { ub.classList.add('fail'); ub.insertAdjacentHTML('beforeend', `<div class="meta">${esc(r.body.error.message)}</div>`); return; }
  ub.classList.add('fail'); ub.insertAdjacentHTML('beforeend', `<div class="meta">Not sent. <button class="lnk" data-act="retry" data-t="${esc(text)}" data-cid="${cid}">Tap to retry</button></div>`);
  if (code === 'ai_unavailable') bubble({ role: 'aunty', text: r.body.error.message });
}
async function runUndo(id, btn) {
  const r = await api('DELETE', '/spends/' + id + '?announce=1'); if (r.status !== 200) return toast('Could not undo. Try again.');
  vibe(12); if (btn) { btn.disabled = true; btn.textContent = r.body.already ? 'Already removed' : 'Removed'; }
  await loadChat(); setMood('neutral'); await refreshSummary();
}

// ---------- sheets ----------
function openSheet(html) { const o = $('#overlay'); closeSheet(); const bg = document.createElement('div'); bg.className = 'sheet-bg'; bg.id = 'sheet'; bg.innerHTML = `<div class="sheet" role="dialog">${html}</div>`; bg.addEventListener('click', e => { if (e.target === bg) closeSheet(); }); o.appendChild(bg); }
function closeSheet() { const s = $('#sheet'); if (s) s.remove(); }
function openManual() {
  App.manualKey = uuid();
  openSheet(`<h2 style="font-size:22px">Add a spend</h2><div class="field"><label for="mAmt">Amount (₹)</label><input id="mAmt" inputmode="decimal" placeholder="350"></div>
  <div class="field"><label for="mCat">Category</label><select id="mCat">${CATS.map(c => `<option value="${c}">${catLabel(c)}</option>`).join('')}</select></div>
  <div class="field"><label for="mNote">Note</label><input id="mNote" maxlength="60" placeholder="swiggy"></div><div class="field"><label for="mWhen">When</label><select id="mWhen"><option value="0">Today</option><option value="1">Yesterday</option><option value="2">2 days ago</option></select></div>
  <div class="err" id="mErr"></div><button class="btn block" data-act="manual-save">Save spend</button>`);
}
async function manualSave() {
  const amt = parseFloat(String($('#mAmt').value).replace(/,/g, '')); const u = App.user; const dk = addDays(App.summary.today, -(+$('#mWhen').value));
  const body = { amount_paise: toPaise(amt), category: $('#mCat').value, note: $('#mNote').value, source: 'chat' }; if (dk !== App.summary.today) body.spent_at = nowIso().slice(0, 10) && new Date(localToMs(dk, 12, 0, u.timezone)).toISOString();
  const r = await api('POST', '/spends', body, { 'Idempotency-Key': App.manualKey });
  if (r.status >= 300) return ($('#mErr').textContent = r.body.error ? r.body.error.message : 'Could not save.');
  closeSheet(); vibe(10); await refreshSummary();
  toast(`Saved ${money(r.body.spend.amount_paise)}. <button class="lnk" data-act="undo-spend" data-id="${r.body.spend.id}" data-silent="1">Undo</button>`);
}

// ---------- settings ----------
function openSettings(scrollTo) {
  const u = App.user, o = $('#overlay'); const sw = (k, on) => `<button class="switch ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-act="toggle" data-k="${k}"></button>`;
  const nt = u.nudge_types; const bx = App.summary.budget_explainer, ng = App.summary.goals.length; const sel = (k, opts, cur) => `<select data-act="set" data-k="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const el = document.createElement('div'); el.className = 'screen settings'; el.id = 'settingsScreen';
  el.innerHTML = `<div class="hdr"><button class="icon-btn" data-act="close-settings" aria-label="Back">&larr;</button><div class="ttl">Settings</div></div><div class="scroll" id="setScroll" style="padding-top:0">
  <h2>Appearance</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">Theme</span>${sel('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']], u.theme)}</div><div class="srow"><span class="sp">Reduce motion</span>${sel('reduce_motion', [['system', 'System'], ['on', 'On'], ['off', 'Off']], u.reduce_motion)}</div><div class="srow"><span class="sp">Haptics</span>${sw('haptics', u.haptics)}</div></div>
  <h2>Aunty</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">Regional flavour</span>${sel('region_flavour', Object.keys(FLAVOURS).map(f => [f, (f === 'none' ? 'English only' : cap(f)) + (FLAVOUR_STATUS[f] === 'preview' ? ' (preview)' : '')]), u.region_flavour)}</div>
  <div class="srow"><span class="sp">Voice language</span>${sel('voice_language', [['en-IN', 'Indian English'], ['hi-IN', 'Hindi']], u.voice_language)}</div>
  <div class="srow"><span class="sp">Aunty's memory <span class="badge" id="memCount"></span></span><button class="btn sm sec" data-act="show-memory">View</button></div><div class="srow"><span class="sp">Clear chat history</span><button class="btn sm sec" data-act="clear-chat">Clear</button></div></div>
  <h2>Money</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">Accounts (bank, cash, wallet)</span><button class="btn sm sec" data-act="manage-accounts">Manage</button></div><div class="srow"><span class="sp">Categories and monthly limits</span><button class="btn sm sec" data-act="manage-cats">Manage</button></div></div>
  <h2>Budget and goals</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">Monthly income</span><button class="btn sm sec" data-act="change-income">${bx ? money(bx.income_paise) : 'Set'}</button></div><div class="srow"><span class="sp">Rent and fixed bills</span><button class="btn sm sec" data-act="change-rent">${bx ? money(bx.rent_paise) : 'Set'}</button></div><div class="srow"><span class="sp">${ng ? ng + (ng > 1 ? ' goals' : ' goal') : 'No goals yet'}</span><button class="btn sm sec" data-act="add-goal">Add</button> <button class="btn sm sec" data-act="manage-goals">Manage</button></div></div>
  <h2>Nudges</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">Nudge time</span><input type="time" value="${u.nudge_time}" data-act="set" data-k="nudge_time"></div><div class="srow"><span class="sp">Quiet hours</span><input type="time" value="${u.quiet_start}" data-act="set" data-k="quiet_start"> <input type="time" value="${u.quiet_end}" data-act="set" data-k="quiet_end"></div>
  <div class="srow"><span class="sp">Wins</span>${sw('nt:wins', nt.wins)}</div><div class="srow"><span class="sp">Warnings</span>${sw('nt:warnings', nt.warnings)}</div><div class="srow"><span class="sp">Check-ins</span>${sw('nt:checkins', nt.checkins)}</div><div class="srow"><span class="sp">Weekly recap</span>${sw('nt:recap', nt.recap)}</div>
  <div class="srow"><span class="sp">Recap day</span>${sel('recap_day', ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => [i, d]), u.recap_day)}</div>
  <div class="srow" style="flex-wrap:wrap"><span class="sp">Muted categories</span>${CATS.filter(c => c !== 'other').map(c => `<label class="small"><input type="checkbox" data-act="mute" data-c="${c}" ${u.muted_categories.includes(c) ? 'checked' : ''}> ${catLabel(c)}</label>`).join(' ')}</div>
  <div class="srow"><span class="sp">Notifications: <b>${u.notif_permission}</b></span><button class="btn sm sec" data-act="notif-toggle">${u.notif_permission === 'granted' ? 'Turn off' : 'Allow'}</button></div>
  <div id="past-nudges"><h3 style="font-size:14px;margin:10px 0 4px">Past nudges</h3><div id="pastList" class="small muted">Loading...</div></div></div>
  <h2>Security</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">App lock (fingerprint or PIN)</span>${sw('app_lock', u.app_lock)}</div><div class="srow"><span class="sp">Lock after</span>${sel('app_lock_after_seconds', [[0, 'Immediately'], [60, '1 minute'], [300, '5 minutes']], u.app_lock_after_seconds)}</div>${u.app_lock ? '<div class="srow"><span class="sp">Test the lock now</span><button class="btn sm sec" data-act="lock-now">Lock</button></div>' : ''}
  <div class="srow"><span class="sp">Change password</span><button class="btn sm sec" data-act="change-pw">Change</button></div><div class="srow"><span class="sp">Log out</span><button class="btn sm sec" data-act="logout">Log out</button></div><div class="srow"><span class="sp">Log out of all devices</span><button class="btn sm sec" data-act="logout-all">Log out all</button></div></div>
  <h2>Privacy and data</h2><div class="card" style="margin-top:0"><div class="srow"><span class="sp">Consent notice (accepted v${esc(u.consent_version)})</span><button class="btn sm sec" data-act="show-consent">Read</button></div><div class="srow"><span class="sp">How Aunty uses AI</span><button class="btn sm sec" data-act="show-ai">Read</button></div><div class="srow"><span class="sp">Export my data</span><button class="btn sm sec" data-act="export">Export</button></div><div class="srow"><span class="sp">Delete my account</span><button class="btn sm danger" data-act="delete-account">Delete</button></div></div>
  <h2>Help and about</h2><div class="card" style="margin-top:0"><p class="small" style="margin:0 0 8px">Aunty is an AI. She gives budgeting help, never financial advice, and never asks for bank passwords, PINs or OTPs.</p><div class="srow"><span class="sp">Home-screen widget (preview)</span></div><div id="widgetPrev"></div><p class="small muted">Version 0.1 prototype &middot; Terms: demo only</p></div></div>`;
  o.appendChild(el); renderWidgetPreview();
  api('GET', '/memories').then(r => { const b = $('#memCount'); if (b) b.textContent = r.body.memories.length + '/20'; });
  api('GET', '/nudges').then(r => { const l = $('#pastList'); if (!l) return; l.innerHTML = r.body.nudges.length ? r.body.nudges.map(n => `<div style="padding:5px 0;border-top:1px solid var(--line)">${esc(n.text)}<div class="small muted">${new Date(n.sent_at).toLocaleDateString()} &middot; ${n.trigger}${n.reaction ? ' &middot; ' + n.reaction : ''}</div></div>`).join('') : 'None yet.'; if (scrollTo) { const t = $('#' + scrollTo); if (t) t.scrollIntoView(); } });
}
async function patchMe(p) { const r = await api('PATCH', '/me', p); if (r.status === 200) { App.user = r.body.user; applyTheme(); } else toast(r.body.error.message); return r; }
async function exportData() {
  const r = await api('GET', '/me/export'); const blob = new Blob([JSON.stringify(r.body, null, 2)], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'hisaab-aunty-export.json'; a.click(); toast('Your data was exported.');
}
async function shareRecap(id) {
  const r = (await api('GET', '/recaps/' + id)).body.recap, f = r.facts; const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1350; const g = cv.getContext('2d');
  g.fillStyle = '#1C2B4B'; g.fillRect(0, 0, 1080, 1350); g.fillStyle = '#F39C1E'; g.beginPath(); g.arc(540, 250, 140, 0, 7); g.fill(); g.fillStyle = '#FBF6EC'; g.font = '700 72px sans-serif'; g.textAlign = 'center'; g.fillText('My week with Aunty', 540, 520);
  g.font = '600 120px sans-serif'; g.fillText('₹' + groupIN(String(f.total_inr)), 540, 700); g.font = '40px sans-serif'; g.fillText('spent of ₹' + groupIN(String(f.budget_inr)) + ' budget', 540, 770);
  g.font = '44px sans-serif'; wrapText(g, r.caption, 540, 900, 860, 58); g.fillStyle = '#F39C1E'; g.font = '600 40px sans-serif'; g.fillText('Hisaab Aunty', 540, 1260);
  cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'weekly-recap.png'; a.click(); toast('Recap image saved (the phone share sheet opens here on Android).'); });
}
function wrapText(g, text, x, y, mw, lh) { let line = ''; text.split(' ').forEach(w => { const t = line + w + ' '; if (g.measureText(t).width > mw && line) { g.fillText(line.trim(), x, y); line = w + ' '; y += lh; } else line = t; }); g.fillText(line.trim(), x, y); }

// ---------- app lock ----------
function checkLock() {
  const u = App.user; if (!u || !u.app_lock || App.locked) return; const away = (Date.now() - App.lastHidden) / 1000;
  if (App.lastHidden && away >= u.app_lock_after_seconds) lockNow();
}
function lockNow() { App.locked = true; const o = $('#overlay'); if (!o) return; const l = document.createElement('div'); l.className = 'lock'; l.id = 'lockScr'; l.innerHTML = `<div style="width:90px">${faceSVG('neutral')}</div><h1>Aunty is locked</h1><button class="btn saf" data-act="unlock">Use fingerprint or PIN</button><div class="small" style="opacity:.7">(mock: a real build uses Android biometrics)</div>`; o.appendChild(l); }
document.addEventListener('visibilitychange', () => { if (document.hidden) App.lastHidden = Date.now(); else checkLock(); });
window.addEventListener('blur', () => { App.lastHidden = Date.now(); });
window.addEventListener('focus', () => { checkLock(); });

// ---------- events ----------
const ACT = {
  'go-signup': () => { App.signup = {}; showSignup(1); }, 'go-login': () => showLogin(), 'back-welcome': () => showWelcome(), 'signup-back': () => showSignup(1),
  'do-login': () => doLogin($('#lEmail').value, $('#lPw').value),
  'signup-1': () => { const email = $('#sEmail').value.trim(), pw = $('#sPw').value; App.signup.email = email; App.signup.password = pw; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showSignup(1, 'Please enter a valid email.'); if (pw.length < 8) return showSignup(1, 'Password needs at least 8 characters.'); showSignup(2); },
  'signup-2': async () => {
    const d = App.signup; d.name = $('#sName').value; d.city = $('#sCity').value; d.region_flavour = $('#sFlav').value; d.age_confirmed = $('#sAge').checked; d.consent_version = $('#sConsent').checked ? CONSENT_VERSION : null;
    if (!d.name.trim()) return showSignup(2, 'What should Aunty call you?'); if (!d.age_confirmed) return showSignup(2, 'Please confirm you are 18 or older.'); if (!d.consent_version) return showSignup(2, 'Please accept the privacy notice to continue.');
    const r = await B.api('POST', '/v1/auth/signup', { body: Object.assign({ device: 'Web prototype' }, d) }); if (r.status !== 201) return showSignup(2, r.body.error.message);
    S = { access: r.body.access_token, refresh: r.body.refresh_token, uid: r.body.user.id }; saveS(); App.user = r.body.user; App.lastEmail = d.email; App.freshSignup = true; showSignup(3);
  },
  'notif-allow': async () => { try { if (window.Notification && Notification.permission === 'default') Notification.requestPermission(); } catch (e) { /* mock */ } await api('PATCH', '/me', { notif_permission: 'granted' }); await enterApp(); },
  'notif-later': async () => { await enterApp(); },
  tab: el => switchTab(el.dataset.tab), 'tell-aunty': () => { switchTab('chat'); },
  chip: el => sendMessage(el.dataset.t), retry: el => sendMessage(el.dataset.t, el.dataset.cid),
  'start-goal': () => { closeSettingsScreen(); sendMessage('I want to change my goal'); },
  'undo-spend': (el) => runUndo(el.dataset.id, el.dataset.silent ? null : el),
  'rm-spend': async el => { const id = el.dataset.id; const row = App.summary.recent_spends.find(x => x.id === id); await api('DELETE', '/spends/' + id); vibe(10); await refreshSummary(); toast(`Removed ${row ? money(row.amount_paise) : 'spend'}. <button class="lnk" data-act="restore" data-id="${id}">Undo</button>`); },
  restore: async el => { await api('POST', '/spends/' + el.dataset.id + '/restore'); await refreshSummary(); closeToasts(); },
  checkin: async () => { await api('POST', '/checkins/today'); vibe(10); await refreshSummary(); },
  react: async el => { await api('POST', '/nudges/' + el.dataset.id + '/reaction', { reaction: el.dataset.r }); await refreshSummary(); },
  'share-recap': el => shareRecap(el.dataset.id), 'add-manual': openManual, 'manual-save': manualSave,
  'open-settings': el => openSettings(el.dataset.scroll), 'close-settings': closeSettingsScreen,
  toggle: async el => { const k = el.dataset.k; const u = App.user; let r; if (k.startsWith('nt:')) r = await patchMe({ nudge_types: Object.assign({}, u.nudge_types, { [k.slice(3)]: !u.nudge_types[k.slice(3)] }) }); else r = await patchMe({ [k]: !u[k] }); reopenSettings(); },
  mute: async el => { const c = el.dataset.c, u = App.user; await patchMe({ muted_categories: el.checked ? [...u.muted_categories, c] : u.muted_categories.filter(x => x !== c) }); },
  'notif-toggle': async () => { await patchMe({ notif_permission: App.user.notif_permission === 'granted' ? 'denied' : 'granted' }); reopenSettings(); toast('On Android this opens the system notification settings.'); },
  'edit-msg': el => startEdit(el.dataset.id, el.dataset.t), 'cancel-edit': cancelEdit,
  'show-memory': async () => { const r = await api('GET', '/memories'); const m = r.body.memories; openSheet(`<h2 style="font-size:22px">What Aunty remembers</h2>${m.length ? m.map(x => `<div class="srow"><span class="sp">${esc(x.text)}</span><button class="x" data-act="forget" data-id="${x.id}" aria-label="Forget">&#10005;</button></div>`).join('') + '<button class="btn sec block" style="margin-top:12px" data-act="forget-all">Clear all</button>' : '<div class="empty">Nothing yet. Tell Aunty "remember my rent is due on the 5th".</div>'}`); },
  forget: async el => { await api('DELETE', '/memories/' + el.dataset.id); ACT['show-memory'](); }, 'forget-all': async () => { await api('DELETE', '/memories'); closeSheet(); reopenSettings(); },
  'clear-chat': async () => { if (!confirm('Clear the whole chat history?')) return; await api('DELETE', '/chat/history'); App.rendered = new Set(); $('#feed').innerHTML = '<div class="empty" id="chatEmpty">Chat cleared.</div>'; toast('Chat history cleared.'); },
  'change-income': async () => { const g = App.summary.goal; if (!g) return; const v = prompt('Monthly free income (₹, after fixed bills):', g.free_income_paise / 100); const n = parseAmount(String(v || '')); if (!n) return; const r = await api('PUT', '/goal', { name: g.name, cost_paise: g.cost_paise, deadline: g.deadline, free_income_paise: toPaise(n) }); if (r.status === 200) { await refreshSummary(); reopenSettings(); } else toast(r.body.error.message); },
  'change-pw': async () => { const cur = prompt('Current password:'); if (cur == null) return; const nw = prompt('New password (min 8 characters):'); if (nw == null) return; const r = await api('POST', '/auth/change-password', { current_password: cur, new_password: nw, refresh_token: S.refresh }); toast(r.status === 200 ? 'Password changed. Other devices were logged out.' : r.body.error.message); },
  logout: async () => { await api('POST', '/auth/logout', { refresh_token: S.refresh }); forceLogout(); }, 'logout-all': async () => { await api('POST', '/auth/logout-all'); forceLogout(); },
  'show-consent': () => openSheet(`<h2 style="font-size:22px">Privacy notice v${CONSENT_VERSION}</h2><p class="small">We collect: amount, category, note and date of each spend, your goal, and your chat with Aunty. We do not collect contacts, location or bank statements. We use it to calculate your budget, write replies and nudges, and improve reliability. Chat is processed by an AI provider that receives only what a single turn needs. You can export or delete everything any time. Accepted on ${esc(App.user.consent_at.slice(0, 10))}.</p>`),
  'show-ai': () => openSheet(`<h2 style="font-size:22px">How Aunty uses AI</h2><p class="small">Aunty is an AI. The AI decides what you meant and writes in Aunty's voice, but every rupee figure comes from our own calculator and is checked before you see it. She never gives investment, tax, loan or insurance advice. The AI provider never sees your email, password or device data.</p>`),
  export: exportData,
  'delete-account': async () => { if (!confirm('Delete your account and ALL data? This cannot be undone.')) return; const r = await api('DELETE', '/me'); S = null; saveS(); App.user = null; toast; showWelcome(); alert('Account deleted. Rows removed: ' + r.body.rows_removed); },
  set: async el => { const k = el.dataset.k; let v = el.value; if (['recap_day', 'app_lock_after_seconds'].includes(k)) v = +v; const r = await patchMe({ [k]: v }); if (k === 'region_flavour' && r.status === 200 && FLAVOUR_STATUS[v] === 'preview') toast('This flavour is in preview until a native speaker reviews it.'); },
  'lock-now': () => { closeSettingsScreen(); lockNow(); }, unlock: () => { App.locked = false; const l = $('#lockScr'); if (l) l.remove(); },
  'widget-tap': () => { closeSettingsScreen(); switchTab('chat'); },
  mic: () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return toast('Voice input needs a browser with speech recognition, like Chrome. Typing works everywhere.');
    const rec = new SR(); rec.lang = App.user.voice_language; rec.interimResults = false; const b = $('#micBtn'); b.classList.add('rec'); rec.onresult = e => { $('#chatIn').value = e.results[0][0].transcript; $('#chatIn').focus(); }; rec.onend = () => b.classList.remove('rec'); rec.onerror = () => { b.classList.remove('rec'); toast('I could not hear that. Check the microphone permission.'); }; try { rec.start(); } catch (e) { b.classList.remove('rec'); }
  },
};
function closeToasts() { document.querySelectorAll('#overlay .toast').forEach(t => t.remove()); }
function closeSettingsScreen() { const s = $('#settingsScreen'); if (s) s.remove(); closeSheet(); }
function reopenSettings() { const sc = $('#setScroll') ? $('#setScroll').scrollTop : 0; closeSettingsScreen(); openSettings(); const n = $('#setScroll'); if (n) n.scrollTop = sc; }
document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el || el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type !== 'checkbox')) return; const f = ACT[el.dataset.act]; if (f) { e.preventDefault(); f(el, e); } });
document.addEventListener('change', e => { const el = e.target.closest('[data-act="set"],[data-act="mute"]'); if (el) ACT[el.dataset.act](el, e); });
document.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'lPw' || e.target.id === 'lEmail')) ACT['do-login'](); });
async function bootPhone() {
  showSplash(); applyTheme(); await sleep(1000);
  if (S) { const r = await api('GET', '/me'); if (r.status === 200) { App.user = r.body.user; return enterApp(); } S = null; saveS(); }
  showWelcome();
}

// ---------- growing message box ----------
function autoGrow(el) { if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 132) + 'px'; }
document.addEventListener('input', e => { if (e.target.id === 'chatIn') autoGrow(e.target); if (e.target.id === 'sPw') { const r = $('#pwRules'); if (r) r.outerHTML = pwRulesHtml(e.target.value); } if (e.target.id === 'slRange') sliderLabel(); });
document.addEventListener('keydown', e => { if (e.target.id === 'chatIn' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const f = $('#chatForm'); if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true })); } });

// ---------- widgets under Aunty's last message: Skip, Add another goal, and the days/months slider ----------
const Sl = { unit: 'months' };
function widgetHtml(ui) {
  if (ui.type === 'skip') return `<button class="skipbtn" data-act="wgt-send" data-t="${esc(ui.text)}">${esc(ui.label)}</button>`;
  if (ui.type === 'buttons') return ui.options.map(o => `<button class="skipbtn" data-act="wgt-send" data-t="${esc(o.text)}">${esc(o.label)}</button>`).join('');
  if (ui.type === 'slider') return `<div class="slider"><div class="seg" id="slUnit"><button type="button" class="on" data-act="sl-unit" data-u="months">Months</button><button type="button" data-act="sl-unit" data-u="days">Days</button></div><input type="range" id="slRange" min="1" max="60" step="1" value="6" aria-label="How long"><div class="sllbl" id="slLbl"></div><button type="button" class="btn sm" data-act="sl-set">Set</button></div>`;
  return '';
}
function sliderLabel() {
  const r = $('#slRange'), l = $('#slLbl'); if (!r || !l) return; const v = +r.value, days = Sl.unit === 'days' ? v : Math.round(v * DPM);
  l.innerHTML = `<b>${v} ${Sl.unit === 'days' ? (v === 1 ? 'day' : 'days') : (v === 1 ? 'month' : 'months')}</b> &middot; by ${fmtDate(addDays(App.summary ? App.summary.today : dayKey(clock.now(), tzOf()), days))}`;
}
function renderLastWidget() {
  document.querySelectorAll('.wgt').forEach(w => w.remove()); const f = $('#feed'); if (!f) return;
  const kids = [...f.children].filter(n => !n.classList.contains('typing')); const last = kids[kids.length - 1];
  if (!last || !last.dataset || !last.dataset.ui) return; let ui; try { ui = JSON.parse(last.dataset.ui); } catch (e) { return; }
  const w = document.createElement('div'); w.className = 'wgt'; w.innerHTML = widgetHtml(ui); last.after(w); f.scrollTop = f.scrollHeight;
  if (ui.type === 'slider') { Sl.unit = 'months'; sliderLabel(); }
}
// ---------- first open: Aunty types, one message at a time ----------
async function introChat() {
  App.freshSignup = false; const r = await api('GET', '/chat/history'); if (r.status !== 200) return; const chips = $('#chips'); if (chips) chips.style.visibility = 'hidden';
  const rm = phone().classList.contains('rm');
  for (const m of r.body.messages) { typingOn(); await sleep(rm ? 0 : 1200); typingOff(); bubble(m); if (m.role === 'aunty') setMood(m.mood || 'neutral'); await sleep(rm ? 0 : 300); }
  if (chips) chips.style.visibility = 'visible'; renderLastWidget(); const i = $('#chatIn'); if (i) i.focus();
}
// ---------- sheets with a close icon, the budget explainer, the "Aunty fumes" popup ----------
const sheetWithClose = (title, body) => `<div class="row" style="align-items:flex-start"><h2 class="sp" style="font-size:22px">${title}</h2><button class="x" data-act="close-sheet" aria-label="Close">&#10005;</button></div>${body}`;
function showFume(p) {
  vibe([30, 60, 30]); closeSheet(); const o = $('#overlay'); if (!o) return; const old = $('#fume'); if (old) old.remove(); setMood('shock');
  const bg = document.createElement('div'); bg.className = 'sheet-bg fumebg'; bg.id = 'fume';
  bg.innerHTML = `<div class="fume-card" role="alertdialog" aria-label="Aunty is upset"><div class="fume-face">${faceSVG('shock')}<span class="steam s1"></span><span class="steam s2"></span></div><h2>${esc(p.title)}</h2><p>${esc(p.line)}</p><div class="fstats">${p.stats.map(s => `<div><span>${esc(s.k)}</span><b>${esc(s.v)}</b></div>`).join('')}</div><div class="row"><button class="btn sec sp" data-act="fume-undo" data-id="${p.spend_id}">Undo that spend</button><button class="btn sp" data-act="fume-ok">Okay, new plan</button></div></div>`;
  o.appendChild(bg);
}
Object.assign(ACT, {
  'pw-eye': el => { const i = $('#' + el.dataset.t); const hidden = i.classList.toggle('pw-mask'); el.innerHTML = hidden ? EYE_ON : EYE_OFF; el.setAttribute('aria-pressed', String(!hidden)); el.setAttribute('aria-label', hidden ? 'Show password' : 'Hide password'); },
  'signup-1': () => { const email = $('#sEmail').value.trim(), pw = $('#sPw').value; App.signup.email = email; App.signup.password = pw; if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showSignup(1, 'Please enter a valid email.'); const pp = pwProblem(pw); if (pp) return showSignup(1, pp); showSignup(2); },
  'show-privacy': () => openSheet(sheetWithClose('Privacy notice v' + CONSENT_VERSION, '<p class="small">We collect only what you tell Aunty: amounts, categories, notes and dates, your income and goals. We use it to work out your budget and write replies and nudges. Your chat is processed by an AI provider that receives only what a single turn needs. Aunty is an AI that gives budgeting help, not financial advice, and she never asks for bank passwords, PINs or OTPs. You can export or delete everything any time in Settings.</p>')),
  'show-consent': () => openSheet(sheetWithClose('Privacy notice v' + CONSENT_VERSION, `<p class="small">We collect: amount, category, note and date of each spend, your income, goals and your chat with Aunty. We do not collect contacts, location or bank statements. We use it to calculate your budget, write replies and nudges, and improve reliability. Chat is processed by an AI provider that receives only what a single turn needs. You can export or delete everything any time. Accepted on ${esc(App.user.consent_at.slice(0, 10))}.</p>`)),
  'show-ai': () => openSheet(sheetWithClose('How Aunty uses AI', '<p class="small">Aunty is an AI. She decides what you meant and writes in Aunty\'s voice, but every rupee figure comes from our own calculator and is checked before you see it. She gives budgeting help, never investment, tax, loan or insurance advice, and never asks for bank passwords, PINs or OTPs. The AI provider never sees your email, password or device data.</p>')),
  'close-sheet': closeSheet,
  'budget-info': () => openSheet(sheetWithClose('How your daily number is worked out', budgetBreakdownHtml(App.summary && App.summary.budget_explainer))),
  'add-goal': () => { closeSettingsScreen(); sendMessage('add another goal'); },
  'del-goal': async el => { if (!confirm('Delete the goal "' + el.dataset.n + '"?')) return; await api('DELETE', '/goals/' + el.dataset.id); await refreshSummary(); },
  'manage-goals': () => { closeSettingsScreen(); switchTab('goal'); },
  'wgt-send': el => sendMessage(el.dataset.t),
  'sl-unit': el => { Sl.unit = el.dataset.u; document.querySelectorAll('#slUnit button').forEach(b => b.classList.toggle('on', b.dataset.u === Sl.unit)); const r = $('#slRange'); if (Sl.unit === 'days') { r.min = 7; r.max = 365; r.value = 90; } else { r.min = 1; r.max = 60; r.value = 6; } sliderLabel(); },
  'sl-set': () => { const v = +$('#slRange').value; sendMessage(v + ' ' + (Sl.unit === 'days' ? (v === 1 ? 'day' : 'days') : (v === 1 ? 'month' : 'months'))); },
  'fume-ok': () => { const f = $('#fume'); if (f) f.remove(); setMood('neutral'); },
  'fume-undo': async el => { const f = $('#fume'); if (f) f.remove(); await runUndo(el.dataset.id, null); },
  'change-income': async () => { const bx = App.summary.budget_explainer; const v = prompt('Your monthly income (₹):', bx ? bx.income_paise / 100 : ''); const n = parseAmount(String(v || '')); if (!n) return; const r = await api('PATCH', '/me', { income_paise: toPaise(n) }); if (r.status === 200) { App.user = r.body.user; await refreshSummary(); reopenSettings(); } else toast(esc(r.body.error.message)); },
  'change-rent': async () => { const bx = App.summary.budget_explainer; const v = prompt('Monthly rent or fixed bills (₹, 0 for none):', bx ? bx.rent_paise / 100 : ''); if (v == null) return; const n = parseAmount(String(v || '0')); const r = await api('PATCH', '/me', { rent_paise: toPaise(n || 0) }); if (r.status === 200) { App.user = r.body.user; await refreshSummary(); reopenSettings(); } else toast(esc(r.body.error.message)); },
});
// ==END UI-PHONE==
