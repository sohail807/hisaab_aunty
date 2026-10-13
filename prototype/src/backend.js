// ==BACKEND== mock server: database, auth, /v1 API, nudge engine, insights, recaps.
// In the real build this is apps/server (Node + Postgres). Here it runs in the browser over localStorage,
// behind the same /v1 contract, so the UI only ever talks to api().
const uuid = () => (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
async function sha256(str) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; return 'weak' + (h >>> 0).toString(16);
}
class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
const E = {
  unauthorized: (m) => new ApiError(401, 'unauthorized', m || 'Please log in again.'),
  rate: (m) => new ApiError(429, 'rate_limited', m || 'Too many tries. Please wait a minute.'),
  invalid: (m) => new ApiError(400, 'invalid_input', m || 'That does not look right.'),
  notFound: (m) => new ApiError(404, 'not_found', m || 'Not found.'),
  ai: (m) => new ApiError(503, 'ai_unavailable', m || 'Aunty is thinking. Try again in a moment.'),
  conflict: (m) => new ApiError(409, 'conflict', m || 'That already exists.'),
};
const TABLES = ['app_user', 'refresh_token', 'goal', 'spend', 'chat_message', 'nudge', 'aunty_memory', 'insight', 'recap', 'checkin', 'ai_call_log', 'device', 'category', 'account', 'income'];

// ---------- mock database (Postgres stand-in) ----------
function createDB(persistKey) {
  const empty = () => Object.fromEntries(TABLES.map(t => [t, []]));
  let data = empty();
  const ls = typeof localStorage !== 'undefined' ? localStorage : null;
  if (persistKey && ls) { try { const j = ls.getItem(persistKey); if (j) data = Object.assign(empty(), JSON.parse(j)); } catch (e) { /* ignore */ } }
  let timer = null;
  const save = () => { if (!persistKey || !ls) return; clearTimeout(timer); timer = setTimeout(() => { try { ls.setItem(persistKey, JSON.stringify(data)); } catch (e) { /* quota */ } }, 20); };
  return {
    get data() { return data; },
    insert(t, row) { const r = Object.assign({ id: uuid() }, row); data[t].push(r); save(); return r; },
    where(t, fn) { return data[t].filter(fn); },
    find(t, fn) { return data[t].find(fn); },
    update(t, r, patch) { Object.assign(r, patch); save(); return r; },
    remove(t, fn) { const n = data[t].length; data[t] = data[t].filter(r => !fn(r)); save(); return n - data[t].length; },
    reset() { data = empty(); save(); },
    save,
  };
}

// ---------- approved regional words (one list per flavour, edited by native reviewers) ----------
const FLAVOURS = {
  none: [], hindi: ['arre', 'chalo', 'bilkul', 'achha', 'shabaash', 'hisaab'], tamil: ['aiyo', 'seri', 'machi'],
  telugu: ['ayyo', 'sare'], kannada: ['ayyo', 'sari', 'guru'], marathi: ['arre', 'chala', 'bas'],
};
const FLAVOUR_STATUS = { none: 'live', hindi: 'live', tamil: 'preview', telugu: 'preview', kannada: 'preview', marathi: 'preview' };
const ALL_REGIONAL = [...new Set(Object.values(FLAVOURS).flat())].filter(w => w !== 'hisaab');
// a touch word per mood of the sentence; at most one per message
const TOUCH = {
  hindi: { oops: 'Arre', go: 'Chalo', yes: 'Bilkul', ok: 'Achha', win: 'Shabaash' },
  tamil: { oops: 'Aiyo', go: 'Seri', yes: 'Seri', ok: 'Seri', win: 'Machi' },
  telugu: { oops: 'Ayyo', go: 'Sare', yes: 'Sare', ok: 'Sare', win: 'Sare' },
  kannada: { oops: 'Ayyo', go: 'Sari', yes: 'Sari', ok: 'Sari', win: 'Guru' },
  marathi: { oops: 'Arre', go: 'Chala', yes: 'Bas', ok: 'Bas', win: 'Chala' },
  none: { oops: '', go: '', yes: '', ok: '', win: '' },
};
const touch = (user, k) => (TOUCH[user.region_flavour] || TOUCH.none)[k] || '';
function regionalCheck(text, flavour) {
  const allowed = FLAVOURS[flavour] || [];
  const words = (text.toLowerCase().match(/[a-z]+/g) || []);
  const bad = [...new Set(words.filter(w => ALL_REGIONAL.includes(w) && !allowed.includes(w)))];
  const used = words.filter(w => allowed.includes(w) && w !== 'hisaab').length;
  return { ok: bad.length === 0 && used <= 2, bad, used };
}
const ADVICE_RE = /\b(mutual funds?|stocks?|shares?|crypto|bitcoin|sip|nifty|sensex|invest(ing|ment|ments)?|loans?|emi|credit cards?|insurance|tax(es)?|ipo|fixed deposits?|etf)\b/i;
const SHAME_RE = /\b(stupid|idiot|lazy|shame on|irresponsible|disgrace|pathetic|waste of money)\b/i;

function createBackend(opts) {
  const db = opts.db, clock = opts.clock;
  const cfg = Object.assign({ aiDown: false, llmNudges: false, injectBadNumber: false, injectBadRegional: false, accessTtlMs: 15 * 60000, refreshTtlMs: 30 * 86400000, chatModel: 'claude-sonnet-5-5', bgModel: 'claude-haiku-5-5' }, opts.cfg || {});
  const B = { db, clock, cfg, routes: [], events: [], rl: {} };
  const now = () => clock.now();
  const iso = (ms) => new Date(ms == null ? now() : ms).toISOString();
  B.iso = iso;
  const SECRET = 'mock-server-secret';

  // ----- helpers -----
  B.hit = (key, limit, windowMs) => {   // sliding-window rate limit
    const t = now(); const arr = (B.rl[key] || []).filter(x => t - x < windowMs);
    if (arr.length >= limit) { B.rl[key] = arr; return false; }
    arr.push(t); B.rl[key] = arr; return true;
  };
  B.clearRL = (prefix) => { Object.keys(B.rl).forEach(k => { if (!prefix || k.startsWith(prefix)) delete B.rl[k]; }); };
  B.route = (method, pattern, handler, o) => {
    const keys = []; const re = new RegExp('^' + pattern.replace(/:([a-z_]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
    B.routes.push({ method, re, keys, handler, auth: !(o && o.auth === false), pattern });
  };
  B.logAI = (uid, purpose, model, inText, outText, ms, outcome) => db.insert('ai_call_log', { user_id: uid, purpose, model, input_tokens: Math.ceil((inText || '').length / 4), output_tokens: Math.ceil((outText || '').length / 4), latency_ms: Math.round(ms || 0), outcome: outcome || 'ok', created_at: iso() });
  const publicUser = (u) => { const { password_hash, salt, ...rest } = u; return rest; };
  B.publicUser = publicUser;
  B.userById = (uid) => db.find('app_user', u => u.id === uid && !u.deleted_at);
  B.today = (u) => dayKey(now(), u.timezone);
  B.goalRows = (uid) => db.where('goal', g => g.user_id === uid && g.active).sort((x, y) => x.created_at.localeCompare(y.created_at));
  B.goalLabel = (rows) => rows.length <= 2 ? rows.map(g => g.name).join(' & ') : rows.slice(0, 2).map(g => g.name).join(', ') + ' +' + (rows.length - 2) + ' more';
  // "the goal" the rest of the server talks about: the only goal, or one combined view of several
  B.goalOf = (uid) => {
    const rows = B.goalRows(uid); if (!rows.length) return null; if (rows.length === 1) return rows[0];
    return Object.assign({}, rows[0], { name: B.goalLabel(rows), icon: '🎯', cost_paise: rows.reduce((s, g) => s + g.cost_paise, 0), deadline: rows.map(g => g.deadline).sort().pop(), count: rows.length });
  };
  B.rawSpends = (uid) => db.where('spend', r => r.user_id === uid && !r.undone_at);
  B.calcSpends = (uid, tz) => B.rawSpends(uid).map(r => ({ id: r.id, amount: toRupees(r.amount_paise), category: r.category, note: r.note, dk: dayKey(Date.parse(r.spent_at), tz), spent_at: r.spent_at, created_at: r.created_at, source: r.source }));
  // everything the rest of the server needs for one user, rebuilt from the database each time
  B.ctxFor = (uid) => {
    const user = B.userById(uid), rows = B.goalRows(uid), goal = B.goalOf(uid), today = B.today(user), spends = B.calcSpends(uid, user.timezone);
    // income: what the user told us (minus rent and fixed bills); older data falls back to the first goal's free income
    let income = null; if (user.income_paise != null) income = Math.max(0, toRupees(user.income_paise) - toRupees(user.rent_paise || 0)); else if (rows[0]) income = toRupees(rows[0].free_income_paise);
    let d = null, input = null;
    if (income != null) { input = { income, today, spends, goals: rows.map(g => ({ id: g.id, name: g.name, icon: g.icon || goalIcon(g.name), cost: toRupees(g.cost_paise), deadline: g.deadline })), cost: goal ? toRupees(goal.cost_paise) : 0, deadline: goal ? goal.deadline : today }; d = derive(input); }
    return { user, goal, goals: rows, today, spends, input, d };
  };
  // ----- categories (default five + the user's own, each with an optional monthly limit) and accounts -----
  const DEFAULT_CATS = [['food', 'Food delivery', '🍔'], ['chai', 'Chai & coffee', '☕'], ['ride', 'Auto & cab', '🛺'], ['shop', 'Shopping', '🛍️'], ['other', 'Other', '🧾']];
  B.catsOf = (uid) => {
    let rows = db.where('category', r => r.user_id === uid);
    if (!rows.length) rows = DEFAULT_CATS.map(([slug, label, icon]) => db.insert('category', { user_id: uid, slug, label, icon, limit_paise: null, custom: false, created_at: iso() }));
    return rows;
  };
  B.catLabelOf = (uid, slug) => { const r = B.catsOf(uid).find(x => x.slug === slug); return r ? r.label : (CAT_LABEL[slug] || slug); };
  B.monthSpent = (uid, month, slug) => { const tz = B.userById(uid).timezone; return B.rawSpends(uid).filter(r => dayKey(Date.parse(r.spent_at), tz).slice(0, 7) === month && (!slug || r.category === slug)).reduce((a, r) => a + r.amount_paise, 0); };
  B.accountsOf = (uid) => {
    let rows = db.where('account', r => r.user_id === uid && !r.archived_at);
    if (!rows.length) rows = [db.insert('account', { user_id: uid, name: 'Bank account', type: 'bank', icon: '🏦', opening_paise: 0, archived_at: null, created_at: iso() })];
    return rows;
  };
  B.accountBalance = (uid, acc) => {
    const first = B.accountsOf(uid)[0];
    const out = B.rawSpends(uid).filter(r => (r.account_id || (first && first.id)) === acc.id).reduce((a, r) => a + r.amount_paise, 0);
    const inc = db.where('income', r => r.user_id === uid && !r.deleted_at && (r.account_id || (first && first.id)) === acc.id).reduce((a, r) => a + r.amount_paise, 0);
    return acc.opening_paise + inc - out;
  };
  B.addSpend = (uid, p) => {
    const user = B.userById(uid);
    if (p.idempotency_key) { const dup = db.find('spend', r => r.user_id === uid && r.idempotency_key === p.idempotency_key); if (dup) return { spend: dup, duplicate: true }; }
    if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0 || p.amount_paise > 1e10) throw E.invalid('Amount must be more than zero.');
    if (!B.catsOf(uid).some(c => c.slug === p.category)) throw E.invalid('Pick one of your categories.');
    const accs = B.accountsOf(uid); if (p.account_id && !accs.some(a => a.id === p.account_id)) throw E.invalid('Pick one of your accounts.');
    const spent_at = p.spent_at || iso();
    if (Date.parse(spent_at) > now() + 3600000) throw E.invalid('That date is in the future.');
    const row = db.insert('spend', { user_id: uid, amount_paise: p.amount_paise, category: p.category, note: (p.note || '').slice(0, 60), memo: (p.memo || '').slice(0, 140), account_id: p.account_id || accs[0].id, spent_at, source: p.source || 'chat', external_ref: null, idempotency_key: p.idempotency_key || null, created_at: iso(), undone_at: null });
    return { spend: row, duplicate: false, tz: user.timezone };
  };
  B.spendView = (r, tz) => ({ id: r.id, amount_paise: r.amount_paise, category: r.category, note: r.note, memo: r.memo || '', account_id: r.account_id || null, spent_at: r.spent_at, source: r.source, day: dayKey(Date.parse(r.spent_at), tz) });
  B.goalFigures = (c) => {
    if (!c.goal || !c.d) return null; const d = c.d, g = c.goal;
    return { name: g.name, count: c.goals.length, cost_paise: g.cost_paise, deadline: g.deadline, free_income_paise: toPaise(c.input.income), required_per_month_paise: toPaise(d.reqPerMonth), required_per_day_paise: toPaise(d.reqPerDay), eta_date: d.etaDate, delay_days: d.delayDays, on_time: d.onTime, never: d.never, deadline_passed: d.deadlinePassed, no_budget: d.noBudget, icon: g.icon || goalIcon(g.name), income_paise: c.user.income_paise != null ? c.user.income_paise : (g.income_paise == null ? null : g.income_paise), rent_paise: c.user.rent_paise != null ? c.user.rent_paise : (g.rent_paise == null ? null : g.rent_paise) };
  };
  B.goalList = (c) => c.goals.map((g, i) => { const pg = c.d.goals[i]; return { id: g.id, name: g.name, icon: g.icon || goalIcon(g.name), cost_paise: g.cost_paise, deadline: g.deadline, required_per_month_paise: toPaise(pg.req), months_left: round1(pg.monthsLeft), eta_date: pg.etaDate, delay_days: pg.delayDays, on_time: pg.onTime, never: pg.never }; });
  // the numbers behind "your daily budget", so the user can see where it comes from
  B.budgetExplainer = (c) => !c.d ? null : { income_paise: c.user.income_paise != null ? c.user.income_paise : toPaise(c.input.income), rent_paise: c.user.rent_paise || 0, saving_paise: toPaise(c.d.reqPerMonth), free_paise: toPaise(c.d.monthBudget), days_in_month: c.d.dim, daily_paise: toPaise(c.d.dailyBudget), goals: B.goalList(c).map(g => ({ name: g.name, icon: g.icon, req_paise: g.required_per_month_paise })) };
  B.dayset = (uid, tz) => {
    const spendDays = new Set(B.calcSpends(uid, tz).map(x => x.dk));
    const checks = new Set(db.where('checkin', r => r.user_id === uid).map(r => r.day));
    return { spendDays, all: new Set([...spendDays, ...checks]) };
  };
  B.streakFor = (uid) => {
    const u = B.userById(uid), { spendDays, all } = B.dayset(uid, u.timezone);
    return streakInfo(all, spendDays, B.today(u), dayKey(Date.parse(u.created_at), u.timezone));
  };

  // ---------- accounts and sessions ----------
  const hashPw = (pw, salt) => sha256(salt + ':' + pw + ':mock-argon2id');   // stand-in for argon2id
  async function signToken(uid) {
    const payload = btoa(JSON.stringify({ sub: uid, exp: now() + cfg.accessTtlMs, jti: uuid() }));
    return payload + '.' + (await sha256(SECRET + payload)).slice(0, 24);
  }
  async function readToken(tok) {
    if (!tok || typeof tok !== 'string' || !tok.includes('.')) throw E.unauthorized();
    const [payload, sig] = tok.split('.');
    if ((await sha256(SECRET + payload)).slice(0, 24) !== sig) throw E.unauthorized();
    let p; try { p = JSON.parse(atob(payload)); } catch (e) { throw E.unauthorized(); }
    if (p.exp < now()) throw E.unauthorized('Session expired.');
    return p;
  }
  async function issueSession(uid, device) {
    const refresh = uuid() + uuid().replace(/-/g, '');
    db.insert('refresh_token', { user_id: uid, token_hash: await sha256(refresh), device_label: device || 'Browser', created_at: iso(), expires_at: iso(now() + cfg.refreshTtlMs), revoked_at: null });
    return { access_token: await signToken(uid), refresh_token: refresh };
  }
  const revokeAll = (uid, exceptHash) => db.where('refresh_token', t => t.user_id === uid && !t.revoked_at && t.token_hash !== exceptHash).forEach(t => db.update('refresh_token', t, { revoked_at: iso() }));
  const pwProblem = (pw) => pw.length < 8 ? 'Password needs at least 8 characters.' : !/[A-Za-z]/.test(pw) ? 'Password needs at least one letter.' : !/\d/.test(pw) ? 'Password needs at least one number.' : null;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  B.route('POST', '/auth/signup', async (c) => {
    const b = c.body || {}; const email = String(b.email || '').trim().toLowerCase();
    if (!B.hit('signup:ip', 8, 3600000) || !B.hit('signup:' + email, 4, 3600000)) throw E.rate();
    if (!EMAIL_RE.test(email)) throw E.invalid('Please enter a valid email.');
    { const pp = pwProblem(String(b.password || '')); if (pp) throw E.invalid(pp); }
    if (b.age_confirmed !== true) throw E.invalid('Please confirm you are 18 or older.');
    if (!b.consent_version) throw E.invalid('Please accept the privacy notice to continue.');
    if (db.find('app_user', u => u.email === email && !u.deleted_at)) throw E.conflict('That email already has an account. Try logging in.');
    const salt = uuid().slice(0, 8);
    const flavour = Object.keys(FLAVOURS).includes(b.region_flavour) ? b.region_flavour : 'none';
    const u = db.insert('app_user', {
      email, password_hash: await hashPw(b.password, salt), salt, display_name: String(b.name || '').trim().slice(0, 40) || 'Friend', city: String(b.city || '').slice(0, 40),
      region_flavour: flavour, timezone: 'Asia/Kolkata', consent_version: b.consent_version, consent_at: iso(), age_confirmed: true, created_at: iso(), deleted_at: null,
      theme: 'system', haptics: true, reduce_motion: 'system', voice_language: 'en-IN', nudge_types: { wins: true, warnings: true, checkins: true, recap: true }, recap_day: 1,
      nudge_time: '19:00', quiet_start: '22:00', quiet_end: '08:00', muted_categories: [], app_lock: false, app_lock_after_seconds: 60, notif_permission: 'unknown',
      flow: null, payday_flag_day: null,
    });
    B.catsOf(u.id); B.accountsOf(u.id);
    B.startGoalFlow(u.id, true);
    return [201, { user: publicUser(u), ...(await issueSession(u.id, b.device)) }];
  }, { auth: false });
  B.route('POST', '/auth/login', async (c) => {
    const b = c.body || {}; const email = String(b.email || '').trim().toLowerCase();
    if (!B.hit('login:ip', 20, 600000)) throw E.rate();
    const failKey = 'loginfail:' + email;
    if ((B.rl[failKey] || []).filter(x => now() - x < 600000).length >= 5) throw E.rate('Too many wrong tries. Wait a few minutes.');
    const u = db.find('app_user', x => x.email === email && !x.deleted_at);
    if (!u || (await hashPw(String(b.password || ''), u.salt)) !== u.password_hash) {
      B.rl[failKey] = (B.rl[failKey] || []).concat(now()); throw E.unauthorized('Email or password is not right.');
    }
    delete B.rl[failKey];
    return { user: publicUser(u), ...(await issueSession(u.id, b.device)) };
  }, { auth: false });
  B.route('POST', '/auth/refresh', async (c) => {
    const h = await sha256(String((c.body || {}).refresh_token || ''));
    const t = db.find('refresh_token', x => x.token_hash === h);
    if (!t) throw E.unauthorized();
    if (t.revoked_at) { revokeAll(t.user_id); throw E.unauthorized('Session was reused. Logged out everywhere for safety.'); }   // rotation: reuse = theft signal
    if (Date.parse(t.expires_at) < now()) throw E.unauthorized('Session expired.');
    if (!B.userById(t.user_id)) throw E.unauthorized();
    db.update('refresh_token', t, { revoked_at: iso() });
    return await issueSession(t.user_id, t.device_label);
  }, { auth: false });
  B.route('POST', '/auth/logout', async (c) => {
    const h = await sha256(String((c.body || {}).refresh_token || ''));
    const t = db.find('refresh_token', x => x.token_hash === h && x.user_id === c.uid);
    if (t) db.update('refresh_token', t, { revoked_at: iso() });
    return { ok: true };
  });
  B.route('POST', '/auth/logout-all', async (c) => { revokeAll(c.uid); return { ok: true }; });
  B.route('POST', '/auth/change-password', async (c) => {
    const b = c.body || {};
    if ((await hashPw(String(b.current_password || ''), c.user.salt)) !== c.user.password_hash) throw E.unauthorized('Current password is not right.');
    { const pp = pwProblem(String(b.new_password || '')); if (pp) throw E.invalid(pp.replace('Password', 'New password')); }
    const salt = uuid().slice(0, 8);
    db.update('app_user', c.user, { salt, password_hash: await hashPw(b.new_password, salt) });
    revokeAll(c.uid, await sha256(String(b.refresh_token || '')));
    return { ok: true };
  });

  // ---------- profile and settings ----------
  B.route('GET', '/me', async (c) => ({ user: publicUser(c.user), flavours: FLAVOUR_STATUS }));
  const PATCHABLE = {
    display_name: v => typeof v === 'string' && v.length <= 40, city: v => typeof v === 'string' && v.length <= 40,
    timezone: v => { try { new Intl.DateTimeFormat('en', { timeZone: v }); return true; } catch (e) { return false; } },
    region_flavour: v => v in FLAVOURS, theme: v => ['system', 'light', 'dark'].includes(v), haptics: v => typeof v === 'boolean',
    reduce_motion: v => ['system', 'on', 'off'].includes(v), voice_language: v => ['en-IN', 'hi-IN'].includes(v),
    nudge_types: v => v && ['wins', 'warnings', 'checkins', 'recap'].every(k => typeof v[k] === 'boolean'),
    recap_day: v => Number.isInteger(v) && v >= 0 && v <= 6, nudge_time: v => /^\d\d:\d\d$/.test(v), quiet_start: v => /^\d\d:\d\d$/.test(v), quiet_end: v => /^\d\d:\d\d$/.test(v),
    muted_categories: v => Array.isArray(v) && v.every(x => CATS.includes(x)), app_lock: v => typeof v === 'boolean',
    income_paise: v => v === null || (Number.isInteger(v) && v >= 0 && v <= 1e12), rent_paise: v => v === null || (Number.isInteger(v) && v >= 0 && v <= 1e12),
    app_lock_after_seconds: v => Number.isInteger(v) && v >= 0 && v <= 3600, notif_permission: v => ['unknown', 'granted', 'denied'].includes(v),
  };
  B.route('PATCH', '/me', async (c) => {
    const patch = {};
    for (const [k, v] of Object.entries(c.body || {})) { if (!(k in PATCHABLE)) throw E.invalid('Unknown setting: ' + k); if (!PATCHABLE[k](v)) throw E.invalid('Bad value for ' + k); patch[k] = v; }
    return { user: publicUser(db.update('app_user', c.user, patch)) };
  });
  B.route('GET', '/me/export', async (c) => {
    const out = { exported_at: iso(), user: publicUser(c.user) };
    TABLES.filter(t => t !== 'app_user' && t !== 'refresh_token').forEach(t => { out[t] = db.where(t, r => r.user_id === c.uid); });
    return out;
  });
  B.route('DELETE', '/me', async (c) => {
    revokeAll(c.uid);
    let n = 0; TABLES.filter(t => t !== 'app_user').forEach(t => { n += db.remove(t, r => r.user_id === c.uid); });
    db.remove('app_user', u => u.id === c.uid);
    return { deleted: true, rows_removed: n + 1 };
  });

  // ---------- goal ----------
  const checkGoal = (g) => {
    if (!g.name || String(g.name).trim().length < 1 || String(g.name).length > 60) throw E.invalid('Give the goal a short name.');
    if (!Number.isInteger(g.cost_paise) || g.cost_paise <= 0) throw E.invalid('Goal cost must be more than zero.');
    if (g.free_income_paise != null && (!Number.isInteger(g.free_income_paise) || g.free_income_paise < 0)) throw E.invalid('Free income cannot be negative.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(g.deadline || '')) throw E.invalid('Deadline must be a date like 2027-02-11.');
  };
  B.addGoal = (uid, g) => {
    checkGoal(g); const opt = k => (Number.isInteger(g[k]) && g[k] >= 0 ? g[k] : null);
    return db.insert('goal', { user_id: uid, name: String(g.name).trim(), icon: g.icon || goalIcon(g.name), cost_paise: g.cost_paise, deadline: g.deadline, free_income_paise: Number.isInteger(g.free_income_paise) ? g.free_income_paise : 0, income_paise: opt('income_paise'), rent_paise: opt('rent_paise'), active: true, created_at: iso() });
  };
  B.setGoal = (uid, g) => { checkGoal(g); B.goalRows(uid).forEach(x => db.update('goal', x, { active: false })); return B.addGoal(uid, g); };   // replaces every goal
  B.route('GET', '/goal', async (c) => { const x = B.ctxFor(c.uid); return { goal: B.goalFigures(x) }; });
  B.route('PUT', '/goal', async (c) => { B.setGoal(c.uid, c.body || {}); return { goal: B.goalFigures(B.ctxFor(c.uid)) }; });
  B.route('GET', '/goals', async (c) => { const x = B.ctxFor(c.uid); return { goals: x.d ? B.goalList(x) : [], budget: B.budgetExplainer(x) }; });
  B.route('POST', '/goals', async (c) => { B.addGoal(c.uid, c.body || {}); const x = B.ctxFor(c.uid); return [201, { goals: B.goalList(x) }]; });
  const ownGoal = (c) => { const g = db.find('goal', x => x.id === c.params.id && x.user_id === c.uid && x.active); if (!g) throw E.notFound('Goal not found.'); return g; };
  B.route('PATCH', '/goals/:id', async (c) => {
    const g = ownGoal(c), p = c.body || {}, patch = {};
    if (p.name !== undefined) { if (!String(p.name).trim() || String(p.name).length > 60) throw E.invalid('Give the goal a short name.'); patch.name = String(p.name).trim(); patch.icon = goalIcon(patch.name); }
    if (p.cost_paise !== undefined) { if (!Number.isInteger(p.cost_paise) || p.cost_paise <= 0) throw E.invalid('Goal cost must be more than zero.'); patch.cost_paise = p.cost_paise; }
    if (p.deadline !== undefined) { if (!/^\d{4}-\d{2}-\d{2}$/.test(p.deadline)) throw E.invalid('Deadline must be a date like 2027-02-11.'); patch.deadline = p.deadline; }
    db.update('goal', g, patch); return { goals: B.goalList(B.ctxFor(c.uid)) };
  });
  B.route('DELETE', '/goals/:id', async (c) => { db.update('goal', ownGoal(c), { active: false }); const x = B.ctxFor(c.uid); return { ok: true, goals: x.d ? B.goalList(x) : [] }; });

  // ---------- spends ----------
  B.route('GET', '/spends', async (c) => {
    const u = c.user; const q = c.query; let rows = B.rawSpends(c.uid).map(r => B.spendView(r, u.timezone));
    if (q.from) rows = rows.filter(r => r.day >= q.from); if (q.to) rows = rows.filter(r => r.day <= q.to);
    rows.sort((a, b) => b.spent_at.localeCompare(a.spent_at));
    return { spends: rows.slice(0, Math.min(+q.limit || 50, 200)) };
  });
  B.route('POST', '/spends', async (c) => {
    const b = c.body || {}; const key = c.headers['Idempotency-Key'] || c.headers['idempotency-key'];
    if (!key) throw E.invalid('Idempotency-Key header is required.');
    const r = B.addSpend(c.uid, { amount_paise: b.amount_paise, category: b.category, note: b.note, memo: b.memo, account_id: b.account_id, spent_at: b.spent_at, source: b.source || 'chat', idempotency_key: key });
    const aunty = (!r.duplicate && b.react !== false && B.auntyReactSpend) ? B.auntyReactSpend(c.uid, r.spend) : null;
    return [r.duplicate ? 200 : 201, { spend: B.spendView(r.spend, c.user.timezone), duplicate: r.duplicate, aunty }];
  });
  const ownSpend = (c) => { const r = db.find('spend', x => x.id === c.params.id && x.user_id === c.uid); if (!r) throw E.notFound('Spend not found.'); return r; };
  B.route('DELETE', '/spends/:id', async (c) => { const r = ownSpend(c); if (r.undone_at) return { ok: true, already: true }; db.update('spend', r, { undone_at: iso() }); if (c.query.announce) B.addAunty(c.uid, 'Done. Removed ' + fmtINR(toRupees(r.amount_paise)) + ' (' + (r.note || r.category) + '). It is not on the books any more.', 'neutral', {}); return { ok: true }; });
  B.route('POST', '/spends/:id/restore', async (c) => { const r = ownSpend(c); db.update('spend', r, { undone_at: null }); return { spend: B.spendView(r, c.user.timezone) }; });

  B.route('PATCH', '/spends/:id', async (c) => {
    const r = ownSpend(c), p = c.body || {}, patch = {};
    if (p.amount_paise !== undefined) { if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0) throw E.invalid('Amount must be more than zero.'); patch.amount_paise = p.amount_paise; }
    if (p.category !== undefined) { if (!B.catsOf(c.uid).some(x => x.slug === p.category)) throw E.invalid('Pick one of your categories.'); patch.category = p.category; }
    if (p.account_id !== undefined) { if (!B.accountsOf(c.uid).some(a => a.id === p.account_id)) throw E.invalid('Pick one of your accounts.'); patch.account_id = p.account_id; }
    if (p.note !== undefined) patch.note = String(p.note).slice(0, 60);
    if (p.memo !== undefined) patch.memo = String(p.memo).slice(0, 140);
    if (p.spent_at !== undefined) { if (Date.parse(p.spent_at) > now() + 3600000) throw E.invalid('That date is in the future.'); patch.spent_at = p.spent_at; }
    return { spend: B.spendView(db.update('spend', r, patch), c.user.timezone) };
  });

  // ---------- income ----------
  B.addIncome = (uid, p) => {
    if (p.idempotency_key) { const dup = db.find('income', r => r.user_id === uid && r.idempotency_key === p.idempotency_key); if (dup) return { income: dup, duplicate: true }; }
    if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0 || p.amount_paise > 1e11) throw E.invalid('Amount must be more than zero.');
    const accs = B.accountsOf(uid); if (p.account_id && !accs.some(a => a.id === p.account_id)) throw E.invalid('Pick one of your accounts.');
    const at = p.received_at || iso(); if (Date.parse(at) > now() + 3600000) throw E.invalid('That date is in the future.');
    return { income: db.insert('income', { user_id: uid, amount_paise: p.amount_paise, title: String(p.title || 'Income').slice(0, 60), memo: String(p.memo || '').slice(0, 140), account_id: p.account_id || accs[0].id, received_at: at, idempotency_key: p.idempotency_key || null, created_at: iso(), deleted_at: null }), duplicate: false };
  };
  const incView = (r, tz) => ({ id: r.id, amount_paise: r.amount_paise, title: r.title, memo: r.memo || '', account_id: r.account_id, received_at: r.received_at, day: dayKey(Date.parse(r.received_at), tz) });
  const ownIncome = (c) => { const r = db.find('income', x => x.id === c.params.id && x.user_id === c.uid && !x.deleted_at); if (!r) throw E.notFound('Income not found.'); return r; };
  B.route('POST', '/income', async (c) => {
    const b = c.body || {}; const key = c.headers['Idempotency-Key'] || c.headers['idempotency-key']; if (!key) throw E.invalid('Idempotency-Key header is required.');
    const r = B.addIncome(c.uid, { amount_paise: b.amount_paise, title: b.title, memo: b.memo, account_id: b.account_id, received_at: b.received_at, idempotency_key: key });
    const aunty = (!r.duplicate && b.react !== false && B.auntyReactIncome) ? B.auntyReactIncome(c.uid, r.income) : null;
    return [r.duplicate ? 200 : 201, { income: incView(r.income, c.user.timezone), duplicate: r.duplicate, aunty }];
  });
  B.route('GET', '/income', async (c) => ({ income: db.where('income', r => r.user_id === c.uid && !r.deleted_at).map(r => incView(r, c.user.timezone)).filter(r => (!c.query.from || r.day >= c.query.from) && (!c.query.to || r.day <= c.query.to)).sort((a, b) => b.received_at.localeCompare(a.received_at)) }));
  B.route('PATCH', '/income/:id', async (c) => {
    const r = ownIncome(c), p = c.body || {}, patch = {};
    if (p.amount_paise !== undefined) { if (!Number.isInteger(p.amount_paise) || p.amount_paise <= 0) throw E.invalid('Amount must be more than zero.'); patch.amount_paise = p.amount_paise; }
    if (p.title !== undefined) patch.title = String(p.title).slice(0, 60);
    if (p.memo !== undefined) patch.memo = String(p.memo).slice(0, 140);
    if (p.account_id !== undefined) { if (!B.accountsOf(c.uid).some(a => a.id === p.account_id)) throw E.invalid('Pick one of your accounts.'); patch.account_id = p.account_id; }
    if (p.received_at !== undefined) patch.received_at = p.received_at;
    return { income: incView(db.update('income', r, patch), c.user.timezone) };
  });
  B.route('DELETE', '/income/:id', async (c) => { db.update('income', ownIncome(c), { deleted_at: iso() }); return { ok: true }; });

  // ---------- ledger: every income and expense in a range, newest first ----------
  B.ledger = (uid, from, to) => {
    const u = B.userById(uid), tz = u.timezone, accs = Object.fromEntries(db.where('account', r => r.user_id === uid).map(a => [a.id, a])), cats = Object.fromEntries(B.catsOf(uid).map(x => [x.slug, x]));
    const out = [];
    B.rawSpends(uid).forEach(r => { const ms = Date.parse(r.spent_at), day = dayKey(ms, tz); if (day >= from && day <= to) out.push({ id: r.id, kind: 'expense', amount_paise: r.amount_paise, title: r.note || (cats[r.category] ? cats[r.category].label : r.category), category: r.category, category_label: cats[r.category] ? cats[r.category].label : r.category, icon: cats[r.category] ? cats[r.category].icon : '🧾', memo: r.memo || '', account_id: r.account_id || null, account_name: accs[r.account_id] ? accs[r.account_id].name : '', at: r.spent_at, day, hm: hmOf(ms, tz) }); });
    db.where('income', r => r.user_id === uid && !r.deleted_at).forEach(r => { const ms = Date.parse(r.received_at), day = dayKey(ms, tz); if (day >= from && day <= to) out.push({ id: r.id, kind: 'income', amount_paise: r.amount_paise, title: r.title, category: 'income', category_label: 'Income', icon: '💰', memo: r.memo || '', account_id: r.account_id, account_name: accs[r.account_id] ? accs[r.account_id].name : '', at: r.received_at, day, hm: hmOf(ms, tz) }); });
    out.sort((a, b) => b.at.localeCompare(a.at));
    const exp = out.filter(x => x.kind === 'expense').reduce((a, x) => a + x.amount_paise, 0), inc = out.filter(x => x.kind === 'income').reduce((a, x) => a + x.amount_paise, 0);
    return { from, to, entries: out, income_paise: inc, expense_paise: exp, net_paise: inc - exp };
  };
  B.route('GET', '/ledger', async (c) => {
    const q = c.query; if (!/^\d{4}-\d{2}-\d{2}$/.test(q.from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(q.to || '')) throw E.invalid('from and to must be dates.');
    return B.ledger(c.uid, q.from, q.to);
  });

  // ---------- categories with monthly limits ----------
  const catView = (r, month, uid) => ({ slug: r.slug, label: r.label, icon: r.icon, custom: !!r.custom, limit_paise: r.limit_paise, month, spent_paise: month ? B.monthSpent(uid, month, r.slug) : null });
  B.route('GET', '/categories', async (c) => { const m = /^\d{4}-\d{2}$/.test(c.query.month || '') ? c.query.month : B.today(c.user).slice(0, 7); return { month: m, categories: B.catsOf(c.uid).map(r => catView(r, m, c.uid)) }; });
  B.route('POST', '/categories', async (c) => {
    const b = c.body || {}, label = String(b.label || '').trim(); if (!label || label.length > 24) throw E.invalid('Give the category a short name.');
    const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'cat';
    if (B.catsOf(c.uid).some(x => x.slug === slug || x.label.toLowerCase() === label.toLowerCase())) throw E.conflict('You already have that category.');
    if (b.limit_paise != null && (!Number.isInteger(b.limit_paise) || b.limit_paise < 0)) throw E.invalid('Limit must be a positive amount.');
    return [201, { category: catView(db.insert('category', { user_id: c.uid, slug, label, icon: String(b.icon || '🏷️').slice(0, 4), limit_paise: b.limit_paise == null ? null : b.limit_paise, custom: true, created_at: iso() }), null, c.uid) }];
  });
  B.route('PATCH', '/categories/:slug', async (c) => {
    const r = B.catsOf(c.uid).find(x => x.slug === c.params.slug); if (!r) throw E.notFound('Category not found.'); const b = c.body || {}, patch = {};
    if (b.limit_paise !== undefined) { if (b.limit_paise !== null && (!Number.isInteger(b.limit_paise) || b.limit_paise < 0)) throw E.invalid('Limit must be a positive amount.'); patch.limit_paise = b.limit_paise; }
    if (b.label !== undefined) { if (!String(b.label).trim() || String(b.label).length > 24) throw E.invalid('Give the category a short name.'); patch.label = String(b.label).trim(); }
    if (b.icon !== undefined) patch.icon = String(b.icon).slice(0, 4);
    return { category: catView(db.update('category', r, patch), null, c.uid) };
  });
  B.route('DELETE', '/categories/:slug', async (c) => {
    const r = B.catsOf(c.uid).find(x => x.slug === c.params.slug); if (!r) throw E.notFound('Category not found.'); if (!r.custom) throw E.conflict('Built-in categories cannot be deleted.');
    db.where('spend', s => s.user_id === c.uid && s.category === r.slug).forEach(s => db.update('spend', s, { category: 'other' })); db.remove('category', x => x.id === r.id); return { ok: true, moved_to: 'other' };
  });

  // ---------- accounts (bank, cash, wallet, card) ----------
  const accView = (a, uid) => ({ id: a.id, name: a.name, type: a.type, icon: a.icon, opening_paise: a.opening_paise, balance_paise: B.accountBalance(uid, a) });
  B.route('GET', '/accounts', async (c) => { const accs = B.accountsOf(c.uid).map(a => accView(a, c.uid)); return { accounts: accs, total_paise: accs.reduce((s, a) => s + a.balance_paise, 0) }; });
  B.route('POST', '/accounts', async (c) => {
    const b = c.body || {}, name = String(b.name || '').trim(); if (!name || name.length > 30) throw E.invalid('Give the account a short name.');
    if (B.accountsOf(c.uid).some(a => a.name.toLowerCase() === name.toLowerCase())) throw E.conflict('You already have an account with that name.');
    if (b.opening_paise != null && !Number.isInteger(b.opening_paise)) throw E.invalid('Opening balance must be an amount.');
    const type = ['bank', 'cash', 'wallet', 'card'].includes(b.type) ? b.type : 'bank'; const icon = { bank: '🏦', cash: '💵', wallet: '👛', card: '💳' }[type];
    return [201, { account: accView(db.insert('account', { user_id: c.uid, name, type, icon: b.icon || icon, opening_paise: b.opening_paise || 0, archived_at: null, created_at: iso() }), c.uid) }];
  });
  const ownAcc = (c) => { const a = db.find('account', x => x.id === c.params.id && x.user_id === c.uid && !x.archived_at); if (!a) throw E.notFound('Account not found.'); return a; };
  B.route('PATCH', '/accounts/:id', async (c) => {
    const a = ownAcc(c), b = c.body || {}, patch = {};
    if (b.name !== undefined) { if (!String(b.name).trim() || String(b.name).length > 30) throw E.invalid('Give the account a short name.'); patch.name = String(b.name).trim(); }
    if (b.opening_paise !== undefined) { if (!Number.isInteger(b.opening_paise)) throw E.invalid('Opening balance must be an amount.'); patch.opening_paise = b.opening_paise; }
    if (b.type !== undefined && ['bank', 'cash', 'wallet', 'card'].includes(b.type)) patch.type = b.type;
    return { account: accView(db.update('account', a, patch), c.uid) };
  });
  B.route('DELETE', '/accounts/:id', async (c) => {
    const a = ownAcc(c); const accs = B.accountsOf(c.uid); if (accs.length < 2) throw E.conflict('Keep at least one account.');
    const target = accs.find(x => x.id !== a.id), first = accs[0];
    db.where('spend', s => s.user_id === c.uid && (s.account_id || first.id) === a.id).forEach(s => db.update('spend', s, { account_id: target.id }));
    db.where('income', s => s.user_id === c.uid && (s.account_id || first.id) === a.id).forEach(s => db.update('income', s, { account_id: target.id }));
    db.update('account', target, { opening_paise: target.opening_paise + a.opening_paise });
    db.update('account', a, { archived_at: iso() }); return { ok: true, moved_to: target.name };
  });

  // ---------- chat history helpers ----------
  B.addAunty = (uid, text, mood, meta) => db.insert('chat_message', { user_id: uid, role: 'aunty', text, mood: mood || 'neutral', client_message_id: null, meta: meta || {}, created_at: iso() });
  B.addUserMsg = (uid, text, cid) => db.insert('chat_message', { user_id: uid, role: 'user', text, mood: null, client_message_id: cid || null, meta: {}, created_at: iso() });
  B.route('GET', '/chat/history', async (c) => {
    const rows = db.where('chat_message', m => m.user_id === c.uid).sort((a, b) => a.created_at.localeCompare(b.created_at) || 0);
    return { messages: rows.filter(m => !(m.meta && m.meta.hidden)).slice(-150).map(m => ({ id: m.id, role: m.role, text: m.text, mood: m.mood, created_at: m.created_at, cid: m.client_message_id, meta: m.meta ? { actions: m.meta.actions, nudge_id: m.meta.nudge_id, flow: m.meta.flow, ui: m.meta.ui } : {} })) };
  });
  B.route('DELETE', '/chat/history', async (c) => { db.remove('chat_message', m => m.user_id === c.uid); return { ok: true }; });

  // ---------- memories ----------
  B.route('GET', '/memories', async (c) => ({ memories: db.where('aunty_memory', m => m.user_id === c.uid) }));
  B.route('DELETE', '/memories/:id', async (c) => { const n = db.remove('aunty_memory', m => m.id === c.params.id && m.user_id === c.uid); if (!n) throw E.notFound(); return { ok: true }; });
  B.route('DELETE', '/memories', async (c) => { db.remove('aunty_memory', m => m.user_id === c.uid); return { ok: true }; });

  // ---------- check-ins, streak, devices ----------
  B.route('POST', '/checkins/today', async (c) => {
    const day = B.today(c.user);
    if (!db.find('checkin', r => r.user_id === c.uid && r.day === day)) db.insert('checkin', { user_id: c.uid, day, created_at: iso() });
    return { streak: B.streakFor(c.uid) };
  });
  B.route('GET', '/streak', async (c) => ({ streak: B.streakFor(c.uid) }));
  B.route('POST', '/devices', async (c) => { const t = String((c.body || {}).push_token || ''); if (!t) throw E.invalid(); if (!db.find('device', d => d.user_id === c.uid && d.push_token === t)) db.insert('device', { user_id: c.uid, push_token: t, created_at: iso() }); return { ok: true }; });

  // ---------- nudges ----------
  const TRIGGERS = ['payday', 'goal_late', 'repeat_habit', 'over_pace', 'back_on_track', 'win_skip', 'win_pace', 'check_in'];
  const WARN = ['goal_late', 'repeat_habit', 'over_pace'], WIN = ['win_pace', 'win_skip', 'back_on_track'];
  const catWord = { food: 'delivery order', chai: 'chai or coffee', ride: 'auto or cab ride', shop: 'shopping order', other: 'spend' };
  const ordinal = n => ['', 'First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'][n] || n + 'th';
  const NUDGE_TPL = {   // approved templates (phase 1). B variants are what the "model" writes in phase 2.
    payday: { A: (f, w) => [`${w.go ? w.go + ', p' : 'P'}ayday! Move ₹${groupIN(String(f.required_per_month_inr))} to the ${f.goal_name} fund first, before the month gets ideas.`], B: (f, w) => [`Payday for ${f.goal_name}! Park ₹${groupIN(String(f.required_per_month_inr))} in the fund before the salary starts making friends with delivery apps.`] },
    goal_late: { A: (f, w) => [`${w.oops ? w.oops + ', ' : ''}${f.goal_name} is running ${f.days_late} days late. Not a disaster, but it is looking at its watch.`], B: (f, w) => [`${f.goal_name} is ${f.days_late} days behind schedule and tapping its foot. One quiet week fixes a lot.`] },
    repeat_habit: { A: (f, w) => [`${w.oops ? w.oops + ', ' : ''}${f.category === 'food' ? ordinal(f.count).toLowerCase() + ' delivery' : f.count + ' ' + catWord[f.category] + 's'} this week: ₹${groupIN(String(f.total_inr))}. That is ${f.goal_days} days of ${f.goal_name}${f.category === 'food' ? ', now on its way to someone else\'s kitchen' : ', quietly walking away'}.`], B: (f, w) => [`${f.count} ${catWord[f.category]}s this week came to ₹${groupIN(String(f.total_inr))}. That is ${f.goal_days} days of ${f.goal_name} gone, and the habit is not even paying rent.`] },
    over_pace: { A: (f, w) => [`You are ₹${groupIN(String(f.over_inr))} over this week, mostly ${f.top_category}. That is ${f.goal_days} days of ${f.goal_name}. Small fix: one less ${catWord[f.top_category]}.`], B: (f, w) => [`This week ran ₹${groupIN(String(f.over_inr))} over budget, mostly ${f.top_category}. That is ${f.goal_days} days of ${f.goal_name}; skip one ${catWord[f.top_category]} and we are nearly square.`] },
    win_pace: { A: (f, w) => [`₹${groupIN(String(f.under_inr))} under budget this week. That is ${f.goal_days} days of ${f.goal_name} back. ${w.win ? w.win + ', t' : 'T'}ake a bow.`], B: (f, w) => [`₹${groupIN(String(f.under_inr))} under budget this week, so ${f.goal_days} days of ${f.goal_name} just came back. Your wallet deserves a quiet round of applause.`] },
    win_skip: { A: (f, w) => [`You skipped the ${catWord[f.category]}s this week. That is ₹${groupIN(String(f.kept_inr))} kept, or ${f.goal_days} days of ${f.goal_name} back. ${w.yes ? w.yes + ' w' : 'W'}orth it.`], B: (f, w) => [`No ${catWord[f.category]}s this week: ₹${groupIN(String(f.kept_inr))} kept and ${f.goal_days} days of ${f.goal_name} back. Loud applause from me.`] },
    back_on_track: { A: (f, w) => [`${f.goal_name} is back on schedule. Quietly proud of you.`], B: (f, w) => [`${f.goal_name} is back on schedule. I am not crying, it is just the calculator.`] },
    check_in: { A: (f, w) => [`Have not heard from your wallet in ${f.days_since} days. ${f.goal_name} is waiting. Quick catch-up?`], B: (f, w) => [`${f.days_since} days of silence from your wallet. ${f.goal_name} is wondering if you are okay. Quick catch-up?`] },
  };
  B.NUDGE_TPL = NUDGE_TPL;
  const TOPIC_RE = { goal_late: /goal|late|schedule|on track/i, over_pace: /budget|week|status|how am i|doing|over/i, payday: /payday|salary/i, win_pace: /week|budget|how am i|doing/i, win_skip: /week|skip|how am i/i, back_on_track: /goal|on track|late/i };
  B.evalNudges = (uid) => {
    const c = B.ctxFor(uid); const out = { candidates: [], blocked: null };
    if (!c.goal) { out.blocked = 'No goal set yet'; return out; }
    const { d, spends, today, user } = c; const gname = c.goal.name;
    const wk = addDays(today, -6), pwF = addDays(today, -13), pwT = addDays(today, -7);
    const r0 = x => Math.round(x), gd = x => round1(x / d.reqPerDay);
    const cand = (trigger, category, facts, text) => out.candidates.push({ trigger, category: category || null, facts, suppressed: null });
    const lastSpend = spends.map(x => x.dk).sort().pop();
    if (user.payday_flag_day === today) cand('payday', null, { goal_name: gname, required_per_month_inr: r0(d.reqPerMonth) });
    const hasData = spends.length > 0;
    if (hasData && (d.never || d.delayDays > ONTIME_DAYS)) cand('goal_late', null, { goal_name: gname, days_late: d.never ? 99 : d.delayDays });
    let best = null; CATS.filter(x => x !== 'other').forEach(cat => { const a = spends.filter(x => x.category === cat && x.dk >= wk && x.dk <= today); if (a.length >= 4) { const t = a.reduce((s, x) => s + x.amount, 0); if (!best || t > best.t) best = { cat, n: a.length, t }; } });
    if (best) cand('repeat_habit', best.cat, { goal_name: gname, category: best.cat, count: best.n, total_inr: r0(best.t), goal_days: gd(best.t) });
    if (d.weekBudget > 0 && d.weekTotal > d.weekBudget) { const bd = breakdown(spends, wk, today); const over = d.weekTotal - d.weekBudget; cand('over_pace', bd[0].category, { goal_name: gname, over_inr: r0(over), goal_days: gd(over), top_category: bd[0].category }); }
    const lastLate = db.where('nudge', n => n.user_id === uid && n.trigger === 'goal_late').pop(), lastBack = db.where('nudge', n => n.user_id === uid && n.trigger === 'back_on_track').pop();
    if (lastLate && (!lastBack || lastBack.sent_at < lastLate.sent_at) && !d.never && d.delayDays <= ONTIME_DAYS) cand('back_on_track', null, { goal_name: gname });
    CATS.filter(x => x !== 'other').forEach(cat => {
      const prev = spends.filter(x => x.category === cat && x.dk >= pwF && x.dk <= pwT), cur = spends.filter(x => x.category === cat && x.dk >= wk && x.dk <= today);
      if (prev.length >= 2 && cur.length === 0) { const kept = prev.reduce((s, x) => s + x.amount, 0); if (!out.candidates.find(x => x.trigger === 'win_skip')) cand('win_skip', cat, { goal_name: gname, category: cat, kept_inr: r0(kept), goal_days: gd(kept) }); }
    });
    if (hasData && d.weekBudget > 0 && d.weekTotal > 0 && d.weekTotal <= 0.8 * d.weekBudget && spends.some(x => x.dk >= wk)) { const under = d.weekBudget - d.weekTotal; cand('win_pace', null, { goal_name: gname, under_inr: r0(under), goal_days: gd(under) }); }
    const ds = lastSpend ? diffDays(today, lastSpend) : diffDays(today, dayKey(Date.parse(user.created_at), user.timezone));
    if (ds >= 3) cand('check_in', null, { goal_name: gname, days_since: ds });
    // suppression rules
    const chattedToday = db.where('chat_message', m => m.user_id === uid && m.role === 'user' && dayKey(Date.parse(m.created_at), user.timezone) === today).map(m => m.text);
    out.candidates.forEach(x => {
      const isWin = WIN.includes(x.trigger), isWarn = WARN.includes(x.trigger);
      if (isWin && !user.nudge_types.wins) x.suppressed = 'Wins are turned off in settings';
      else if (isWarn && !user.nudge_types.warnings) x.suppressed = 'Warnings are turned off in settings';
      else if ((x.trigger === 'check_in' || x.trigger === 'payday') && !user.nudge_types.checkins) x.suppressed = 'Check-ins are turned off in settings';
      else if (x.category && user.muted_categories.includes(x.category)) x.suppressed = 'Category ' + x.category + ' is muted';
      else {
        const nn = db.where('nudge', n => n.user_id === uid && n.trigger === x.trigger && (n.category || null) === x.category && n.reaction === 'not_now' && diffDays(today, dayKey(Date.parse(n.reacted_at), user.timezone)) < 14).pop();
        if (nn && diffDays(today, dayKey(Date.parse(nn.reacted_at), user.timezone)) % 2 === 1) x.suppressed = '"Not now" on ' + dayKey(Date.parse(nn.reacted_at), user.timezone) + ' halves this nudge for 14 days';
        else if (chattedToday.some(t => x.category ? guessCat(t) === x.category : x.trigger === 'check_in' ? true : (TOPIC_RE[x.trigger] || /^$/).test(t))) x.suppressed = 'You already chatted about this today';
      }
    });
    // choose: payday > goal late > repeat habit > over pace > wins and check-in; alternate wins and warnings
    const ok = out.candidates.filter(x => !x.suppressed);
    const rank = t => TRIGGERS.indexOf(t);
    ok.sort((a, b) => rank(a.trigger) - rank(b.trigger));
    let chosen = ok[0] || null;
    const recent = db.where('nudge', n => n.user_id === uid).sort((a, b) => a.sent_at.localeCompare(b.sent_at)).slice(-2);
    if (chosen && chosen.trigger !== 'payday' && recent.length === 2 && recent.every(n => WARN.includes(n.trigger))) {
      const w = ok.find(x => WIN.includes(x.trigger)); if (w) { chosen = w; out.alternated = true; }
    }
    out.chosen = chosen; out.todayKey = today;
    return out;
  };
  // writes the nudge text. Phase 1 = approved template; phase 2 (server flag) = "model" wording that must pass the same checks
  B.checkNudgeText = (text, facts, user) => {
    const problems = [];
    const allowed = []; Object.values(facts).forEach(v => { if (typeof v === 'number') allowed.push(v); });
    allNumbers(text).forEach(n => { if (!allowed.some(a => Math.abs(a - n) < 0.051)) problems.push('number ' + n + ' is not in the facts'); });
    if (ADVICE_RE.test(text)) problems.push('investment wording');
    if (SHAME_RE.test(text)) problems.push('shaming wording');
    if ((text.match(/[.!?](\s|$)/g) || []).length > 2) problems.push('more than two sentences');
    if (facts.goal_name && !text.includes(facts.goal_name)) problems.push('goal not named');
    const rc = regionalCheck(text, user.region_flavour); if (!rc.ok) problems.push('regional words: ' + (rc.bad.join(', ') || 'more than two used'));
    return problems;
  };
  B.writeNudge = (user, trigger, facts, uid) => {
    const w = TOUCH[user.region_flavour] || TOUCH.none; const tpl = NUDGE_TPL[trigger]; const t0 = performance && performance.now ? performance.now() : 0;
    let text, used_template = true, attempt = [];
    if (cfg.llmNudges && !cfg.aiDown) {
      let t = tpl.B(facts, w)[0];
      if (cfg.injectBadNumber) t += ' You saved ₹4,999 last month.';
      if (cfg.injectBadRegional && user.region_flavour !== 'tamil') t = 'Aiyo, ' + t;
      let p = B.checkNudgeText(t, facts, user); attempt.push({ try: 1, problems: p });
      if (p.length) { t = tpl.B(facts, w)[0] + (cfg.injectBadNumber ? ' You saved ₹4,999 last month.' : ''); p = B.checkNudgeText(t, facts, user); attempt.push({ try: 2, problems: p, note: 'retry once' }); }
      if (!p.length) { text = t; used_template = false; }
      B.logAI(uid, 'nudge_wording', cfg.bgModel, JSON.stringify(facts), t, 300, used_template ? 'fallback_template' : 'ok');
    }
    if (!text) text = tpl.A(facts, w)[0];
    return { text: text.replace(/\s+/g, ' '), used_template, attempts: attempt };
  };
  B.runNudgeJob = (uid, o) => {
    o = o || {}; const user = B.userById(uid); if (!user) return { sent: false, reason: 'no user' };
    const hm = hmOf(now(), user.timezone), today = B.today(user);
    if (!o.force) {
      if (hmToMin(hm) < hmToMin(user.nudge_time)) return { sent: false, reason: `Before the nudge time (${user.nudge_time}); it is ${hm}` };
      if (inQuietHours(hm, user.quiet_start, user.quiet_end)) return { sent: false, reason: `Quiet hours (${user.quiet_start} to ${user.quiet_end})` };
    }
    if (db.find('nudge', n => n.user_id === uid && dayKey(Date.parse(n.sent_at), user.timezone) === today)) return { sent: false, reason: 'Already sent a nudge today (one a day)' };
    const ev = B.evalNudges(uid);
    if (!ev.chosen) return { sent: false, reason: ev.blocked || 'No trigger is true and unsuppressed today', evaluation: ev };
    const wr = B.writeNudge(user, ev.chosen.trigger, ev.chosen.facts, uid);
    const n = db.insert('nudge', { user_id: uid, trigger: ev.chosen.trigger, category: ev.chosen.category, text: wr.text, facts: ev.chosen.facts, used_template: wr.used_template, sent_at: iso(), reaction: null, reacted_at: null });
    B.addAunty(uid, wr.text, WIN.includes(n.trigger) ? 'happy' : 'judge', { nudge_id: n.id });
    if (user.payday_flag_day === today && n.trigger === 'payday') db.update('app_user', user, { payday_flag_day: null });
    return { sent: true, nudge: n, evaluation: ev, attempts: wr.attempts };
  };
  B.route('GET', '/nudges', async (c) => ({ nudges: db.where('nudge', n => n.user_id === c.uid).sort((a, b) => b.sent_at.localeCompare(a.sent_at)).slice(0, +c.query.limit || 30) }));
  B.route('POST', '/nudges/:id/reaction', async (c) => {
    const n = db.find('nudge', x => x.id === c.params.id && x.user_id === c.uid); if (!n) throw E.notFound();
    const r = (c.body || {}).reaction; if (!['got_it', 'not_now'].includes(r)) throw E.invalid();
    return { nudge: db.update('nudge', n, { reaction: r, reacted_at: iso() }) };
  });
  B.route('POST', '/me/payday', async (c) => { db.update('app_user', c.user, { payday_flag_day: B.today(c.user) }); return { ok: true }; });
  B.route('POST', '/dev/nudge-job', async (c) => { const r = B.runNudgeJob(c.uid, { force: !!(c.body || {}).force }); return { sent: r.sent, reason: r.reason, nudge: r.nudge, evaluation: r.evaluation || null, attempts: r.attempts }; });
  B.route('GET', '/dev/nudge-eval', async (c) => B.evalNudges(c.uid));

  // ---------- insight (one a day) ----------
  B.ensureInsight = (uid) => {
    const c = B.ctxFor(uid), today = c.today; const ex = db.find('insight', i => i.user_id === uid && i.day === today); if (ex) return ex;
    const user = c.user, wk = addDays(today, -6), pw = addDays(today, -13), pwT = addDays(today, -7);
    let kind = null, facts = {};
    if (c.spends.length) {
      const cp = comparePeriods(c.spends, wk, today, pw, pwT);
      const g = cp.biggestGrowth;
      if (g && g.a >= 100 && g.b > 0 && (g.diff / g.b) >= 0.25) { kind = 'category_up'; facts = { category: g.category, pct: Math.round(g.diff / g.b * 100), this_week_inr: Math.round(g.a), last_week_inr: Math.round(g.b) }; }
      if (!kind) { const sd = new Set(c.spends.filter(x => x.dk >= wk).map(x => x.dk)); const created = dayKey(Date.parse(user.created_at), user.timezone); let free = 0; for (let k = wk; k <= today; k = addDays(k, 1)) if (k >= created && !sd.has(k) && k < today) free++; if (free >= 2) { kind = 'no_spend_days'; facts = { count: free }; } }
      const prev = db.where('insight', i => i.user_id === uid).pop();
      if (!kind && c.d && !c.d.never && prev && prev.facts.delay_days != null && prev.facts.delay_days - c.d.delayDays >= 1) { kind = 'goal_moved'; facts = { days: prev.facts.delay_days - c.d.delayDays, goal_name: c.goal.name }; }
      if (!kind && c.d) { kind = 'on_pace'; facts = { week_total_inr: Math.round(c.d.weekTotal), week_budget_inr: Math.round(c.d.weekBudget) }; }
    }
    if (!kind) return null;   // nothing worth saying yet: show no insight card
    facts.delay_days = c.d && !c.d.never ? c.d.delayDays : null;
    const w = TOUCH[user.region_flavour] || TOUCH.none;
    const gname = c.goal ? c.goal.name : 'your goal';
    const line = ({
      category_up: () => `${CAT_LABEL[facts.category]} is up ${facts.pct}% on last week: ₹${groupIN(String(facts.this_week_inr))} against ₹${groupIN(String(facts.last_week_inr))}.`,
      no_spend_days: () => `${facts.count} no-spend days in the last week. ${w.win ? w.win + ', n' : 'N'}ice going.`,
      goal_moved: () => `${gname} moved ${facts.days} ${facts.days === 1 ? 'day' : 'days'} closer since your last check.`,
      on_pace: () => `This week: ₹${groupIN(String(facts.week_total_inr))} spent of ₹${groupIN(String(facts.week_budget_inr))} budget.`,
      first_steps: () => 'Tell me your first spend and I will start counting.',
    })[kind]();
    const t0 = 120; let text = line, used_template = false;
    const probs = B.checkNudgeText(text, Object.assign({}, facts, { goal_name: undefined }), user).filter(p => p !== 'goal not named');
    if (probs.length || cfg.aiDown) { used_template = true; text = ({ category_up: 'One category grew on last week.', no_spend_days: 'You had some no-spend days this week.', goal_moved: 'Your goal moved closer.', on_pace: 'Here is your week so far.', first_steps: line })[kind]; if (typeof text === 'function') text = text(); }
    B.logAI(uid, 'insight', cfg.bgModel, JSON.stringify(facts), text, t0, cfg.aiDown ? 'ai_down_template' : used_template ? 'fallback_template' : 'ok');
    return db.insert('insight', { user_id: uid, day: today, kind, facts, text, used_template, created_at: iso() });
  };
  // ---------- weekly recap ----------
  B.makeRecap = (uid, force) => {
    const c = B.ctxFor(uid); if (!c.goal) return null; const user = c.user, today = c.today;
    const ws = addDays(weekStartMon(today), -7);
    const ex = db.find('recap', r => r.user_id === uid && r.week_start === ws); if (ex) return ex;
    const created = dayKey(Date.parse(user.created_at), user.timezone);
    if (!force) { const due = addDays(weekStartMon(today), (user.recap_day + 6) % 7); if (today < due || created > addDays(ws, 6) || !user.nudge_types.recap) return null; }
    const streak = B.streakFor(uid).current; const f = recapFacts(c.input, c.d, ws, streak);
    const facts = { week_start: f.week_start, week_end: f.week_end, total_inr: Math.round(f.total), budget_inr: Math.round(f.budget), top_category: f.top_category, top_total_inr: Math.round(f.top_total), goal_days: round1(f.goal_days), streak, goal_name: c.goal.name, spends: f.spends };
    const gdAbs = round1(Math.abs(f.goal_days));
    const caption = f.spends === 0 ? `A quiet week for ${c.goal.name}. Tell me what you spend and I will have more to say.` : f.goal_days >= 0
      ? `₹${groupIN(String(facts.budget_inr - facts.total_inr))} under budget, so ${gdAbs} days of ${c.goal.name} back. Top spend: ${CAT_LABEL[f.top_category]}.`
      : `₹${groupIN(String(facts.total_inr - facts.budget_inr))} over budget, so ${gdAbs} days of ${c.goal.name} slipped. Top spend: ${CAT_LABEL[f.top_category]}. New week, fresh page.`;
    B.logAI(uid, 'recap_caption', cfg.bgModel, JSON.stringify(facts), caption, 250, 'ok');
    return db.insert('recap', { user_id: uid, week_start: ws, facts, caption, created_at: iso() });
  };
  B.route('GET', '/recaps', async (c) => ({ recaps: db.where('recap', r => r.user_id === c.uid).sort((a, b) => b.week_start.localeCompare(a.week_start)) }));
  B.route('GET', '/recaps/:id', async (c) => { const r = db.find('recap', x => x.id === c.params.id && x.user_id === c.uid); if (!r) throw E.notFound(); return { recap: r }; });
  B.route('POST', '/dev/recap', async (c) => { const r = B.makeRecap(c.uid, true); if (!r) throw E.invalid('Set a goal first.'); return { recap: r }; });

  // ---------- summary (everything the Spend tab needs) ----------
  B.route('GET', '/summary', async (c) => {
    const x = B.ctxFor(c.uid), u = x.user;
    B.runNudgeJob(c.uid);                                // mock cron tick: sends only if the time rules allow
    B.makeRecap(c.uid, false);
    const insight = B.ensureInsight(c.uid);
    const recent = x.spends.slice().sort((a, b) => b.spent_at.localeCompare(a.spent_at)).slice(0, 25).map(s => ({ id: s.id, amount_paise: toPaise(s.amount), category: s.category, note: s.note, spent_at: s.spent_at, day: s.dk }));
    const ln = db.where('nudge', n => n.user_id === c.uid).sort((a, b) => b.sent_at.localeCompare(a.sent_at))[0] || null;
    const recap = db.where('recap', r => r.user_id === c.uid).sort((a, b) => b.week_start.localeCompare(a.week_start))[0] || null;
    const base = { today: x.today, has_goal: !!x.goal, has_budget: !!x.d, goal: B.goalFigures(x), goals: x.d ? B.goalList(x) : [], budget_explainer: B.budgetExplainer(x), categories_last_7_days: breakdown(x.spends, addDays(x.today, -6), x.today).map(b => ({ id: b.category, spent_paise: toPaise(b.total), count: b.count })), recent_spends: recent, is_sample: false, latest_nudge: ln, insight, streak: B.streakFor(c.uid), latest_recap: recap, checked_in_today: !!db.find('checkin', r => r.user_id === c.uid && r.day === x.today), chat_count: db.where('chat_message', m => m.user_id === c.uid).length, user_msg_count: db.where('chat_message', m => m.user_id === c.uid && m.role === 'user').length };
    { const accs = B.accountsOf(c.uid); base.balance_paise = accs.reduce((s, a) => s + B.accountBalance(c.uid, a), 0); const lg = B.ledger(c.uid, x.today.slice(0, 7) + '-01', x.today); base.month_income_paise = lg.income_paise; base.month_expense_paise = lg.expense_paise; }
    if (!x.d) return Object.assign(base, { daily_budget_paise: null, spent_today_paise: toPaise(x.spends.filter(s => s.dk === x.today).reduce((a, s) => a + s.amount, 0)), left_today_paise: null, status: null, week: null, month: null, widget: { text: 'Set your income', on_time: null } });
    const d = x.d;
    return Object.assign(base, {
      daily_budget_paise: toPaise(d.dailyBudget), spent_today_paise: toPaise(d.spentToday), left_today_paise: toPaise(d.leftToday), status: d.leftToday >= 0 ? 'on_track' : 'over',
      week: { spent_paise: toPaise(d.weekTotal), budget_paise: toPaise(d.weekBudget) }, month: { spent_paise: toPaise(d.spentMTD), budget_paise: toPaise(d.monthBudget), projected_paise: toPaise(d.projSpend) },
      widget: { text: d.leftToday >= 0 ? fmtINR(d.leftToday) + ' left today' : fmtINR(-d.leftToday) + ' over today', on_time: x.goal ? d.onTime : null },
    });
  });

  // ---------- retention job (undone spends and old chat are hard-deleted) ----------
  B.runRetention = (undoneDays, chatDays) => {
    const cut = (days) => iso(now() - days * 86400000);
    const a = db.remove('spend', r => r.undone_at && r.undone_at < cut(undoneDays || 30));
    const b = db.remove('chat_message', m => m.created_at < cut(chatDays || 90));
    return { undone_spends_deleted: a, old_messages_deleted: b };
  };

  // ---------- the router ----------
  B.api = async (method, path, o) => {
    o = o || {}; const [pathOnly, qs] = path.split('?'); const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const p = pathOnly.replace(/^\/v1/, '').replace(/\/$/, '') || '/';
    const t0 = now();
    try {
      let route = null, params = {};
      for (const r of B.routes) { if (r.method !== method) continue; const m = r.re.exec(p); if (m) { route = r; r.keys.forEach((k, i) => params[k] = decodeURIComponent(m[i + 1])); break; } }
      if (!route) throw E.notFound('No such endpoint.');
      const c = { params, query, body: o.body, headers: o.headers || {}, uid: null, user: null };
      if (route.auth) { const tok = await readToken(o.token); const u = B.userById(tok.sub); if (!u) throw E.unauthorized(); c.uid = u.id; c.user = u; }
      const res = await route.handler(c);
      const [status, body] = Array.isArray(res) ? res : [200, res];
      B.events.unshift({ t: now(), method, path: pathOnly, status }); B.events.length = Math.min(B.events.length, 60);
      return { status, body };
    } catch (e) {
      if (!(e instanceof ApiError)) { console.error(e); e = new ApiError(500, 'internal', 'Something went wrong on our side. Please try again.'); }
      B.events.unshift({ t: now(), method, path: pathOnly, status: e.status }); B.events.length = Math.min(B.events.length, 60);
      return { status: e.status, body: { error: { code: e.code, message: e.message } } };
    }
  };
  return B;
}
// ==END BACKEND==
