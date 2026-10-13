// ==UI-DASH== developer dashboard: inspect the database, the maths, Aunty's turns, nudges, API and tests
const DT = { tab: LS.get('ha_dtab', 'controls'), table: 'spend', testResults: null, apiOut: '', sandbox: { income: 22000, cost: 26000, deadline: '2027-02-11', today: '2026-10-11', spent: 120, buy: 1000 } };
const DTABS = [['controls', 'Controls'], ['db', 'Database'], ['calc', 'Calc engine'], ['trace', 'Aunty trace'], ['llm', 'LLM'], ['nudges', 'Nudges'], ['api', 'API console'], ['tests', 'Tests'], ['about', 'Coverage']];
const sw = (k, on) => `<button class="sw ${on ? 'on' : ''}" data-dact="flag" data-k="${k}" role="switch" aria-checked="${on}"></button>`;
const IST = 'Asia/Kolkata';
function simLocal() { const ms = clock.now(); return dayKey(ms, IST) + 'T' + hmOf(ms, IST); }

function seedDemo() {
  if (!App.user) return alert('Log in (or create the demo account) first.');
  const uid = App.user.id, u = B.userById(uid), today = B.today(u); let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  DB.remove('chat_message', r => r.user_id === uid); DB.remove('spend', r => r.user_id === uid); DB.remove('checkin', r => r.user_id === uid); DB.remove('nudge', r => r.user_id === uid); DB.remove('insight', r => r.user_id === uid); DB.remove('recap', r => r.user_id === uid);
  DB.update('app_user', u, { created_at: new Date(clock.now() - 24 * 86400000).toISOString(), flow: null, notif_permission: 'granted' });
  DB.update('app_user', u, { income_paise: 2200000, rent_paise: null });
  B.setGoal(uid, { name: 'Goa trip', cost_paise: 2600000, deadline: monthsToDeadline(today, 4.04), free_income_paise: 2200000 });
  B.addGoal(uid, { name: 'New laptop', cost_paise: 4800000, deadline: monthsToDeadline(today, 12), free_income_paise: 2200000 });
  DB.update('account', B.accountsOf(uid)[0], { opening_paise: 2500000 }); DB.update('category', B.catsOf(uid).find(c => c.slug === 'food'), { limit_paise: 400000 });
  B.addIncome(uid, { amount_paise: 2200000, title: 'Salary', received_at: new Date(Math.min(clock.now(), localToMs(today.slice(0, 7) + '-01', 10, 0, u.timezone))).toISOString() });
  const add = (daysAgo, cat, amt, note, hr) => B.addSpend(uid, { amount_paise: Math.round(amt) * 100, category: cat, note, spent_at: new Date(Math.min(clock.now(), localToMs(addDays(today, -daysAgo), hr || 13, 10, u.timezone))).toISOString(), source: 'chat' });
  for (let d = 22; d >= 0; d--) {
    const wk = d <= 6; if (d % 7 === 4 && d > 0) continue;               // some no-spend days
    if (rnd() < (wk ? .85 : .6)) add(d, 'chai', 25 + Math.floor(rnd() * 5) * 10, ['chai', 'coffee', 'chaayos'][d % 3], 9);
    if (rnd() < (wk ? .75 : .35)) add(d, 'food', 250 + Math.floor(rnd() * 8) * 30, ['swiggy', 'zomato', 'lunch order'][d % 3], 14);
    if (rnd() < .3) add(d, 'ride', 70 + Math.floor(rnd() * 6) * 15, ['auto', 'uber', 'metro'][d % 3], 18);
  }
  add(9, 'shop', 1800, 'amazon shoes', 16); add(2, 'food', 480, 'dominos', 20); add(1, 'food', 410, 'zomato', 20);
  B.addAunty(uid, 'Demo history loaded: three weeks of spends. Ask "how am I doing?" or "compare this week with last week".', 'happy', {});
  refreshSummary().then(loadChat); toast('Demo history loaded');
}
async function demoAccount() {
  const email = 'demo@hisaab.app', pw = 'demo12345'; let r = await B.api('POST', '/v1/auth/login', { body: { email, password: pw } });
  if (r.status !== 200) r = await B.api('POST', '/v1/auth/signup', { body: { email, password: pw, name: 'Demo Priya', city: 'Pune', region_flavour: 'hindi', age_confirmed: true, consent_version: CONSENT_VERSION } });
  if (r.status >= 300) return alert(r.body.error.message);
  S = { access: r.body.access_token, refresh: r.body.refresh_token, uid: r.body.user.id }; saveS(); App.user = r.body.user; await enterApp(); if (!B.goalOf(S.uid)) seedDemo();
}

function dRender() {
  const el = $('#dbody'); if (!el) return; const t = DT.tab; document.querySelectorAll('.dtabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t));
  el.innerHTML = ({ controls: dControls, db: dDb, calc: dCalc, trace: dTrace, llm: dLlm, nudges: dNudges, api: dApi, tests: dTests, about: dAbout })[t]();
}
let dTimer = null;
function refreshDash() { clearTimeout(dTimer); dTimer = setTimeout(() => { const a = document.activeElement; if (a && a.closest && a.closest('.dash') && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return; if (['api', 'tests', 'about', 'llm'].includes(DT.tab)) return; dRender(); }, 120); }
const flagRow = (k, title, sub, on) => `<div class="ctl"><div class="d"><b>${title}</b><small>${sub}</small></div>${sw(k, on)}</div>`;
function dControls() {
  const users = DB.data.app_user, calls = DB.data.ai_call_log;
  return `<h3>Time machine (server clock, India time)</h3><div class="ctl"><div class="d"><b>Simulated now</b><small>Today and "this month" follow this clock. Tokens expire on it too.</small></div><input type="datetime-local" id="simNow" value="${simLocal()}"><button class="dbtn" data-dact="set-clock">Set</button></div>
  <div>${[['+1 hour', 3600000], ['+7 pm today', 'pm'], ['+1 day', 86400000], ['+7 days', 7 * 86400000]].map(([l, v]) => `<button class="dbtn" data-dact="adv" data-v="${v}">${l}</button>`).join('')}<button class="dbtn" data-dact="real-time">Back to real time</button> <span class="tag">${clock.offset ? 'simulated' : 'real'}</span></div>
  <h3>Failure injection</h3>${flagRow('offline', 'Phone is offline', 'Sending is disabled, last figures stay visible', App.offline)}${flagRow('aiDown', 'Language model is down', 'Fallback parser logs plain spends; other questions say "Aunty is thinking"', CFG.aiDown)}${flagRow('injectBadNumber', 'Model invents a rupee figure', 'Guardrail must catch it and repair or fall back to a template', CFG.injectBadNumber)}${flagRow('injectBadRegional', 'Model uses an unapproved regional word', 'Server check removes it', CFG.injectBadRegional)}${flagRow('llmNudges', 'Phase 2: model-written nudges (server flag)', 'Same checks as chat, template fallback if they fail', CFG.llmNudges)}
  <h3>Data</h3><button class="dbtn pri" data-dact="demo-acct">Create / log in to demo account (demo@hisaab.app)</button><button class="dbtn" data-dact="seed">Seed 3 weeks of demo history for the signed-in user</button><button class="dbtn" data-dact="sample-vector">Load the plan's test-vector example</button><button class="dbtn" data-dact="expire-token">Corrupt access token (watch refresh rotate)</button><button class="dbtn" data-dact="retention">Run retention job</button><button class="dbtn" data-dact="clear-rl">Clear rate limits</button><button class="dbtn warn" data-dact="reset-db">Reset entire database</button>
  <h3>Status</h3><div class="kv"><div class="h">Signed in</div><div style="grid-column:span 2">${App.user ? esc(App.user.email) + ' &middot; flavour ' + App.user.region_flavour : 'nobody'}</div><div class="h">Accounts / spends / chat rows</div><div style="grid-column:span 2">${users.length} / ${DB.data.spend.length} / ${DB.data.chat_message.length}</div><div class="h">Model calls logged</div><div style="grid-column:span 2">${calls.length}</div></div>
  <p class="small" style="color:#5A6480">Data lives in this browser's localStorage (key ha_db_v1). Two accounts on the same browser never see each other's data: log out, create another account, and compare the Database tab.</p>`;
}
function dDb() {
  const tn = TABLES, rows = DB.data[DT.table]; const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => v == null ? '<span style="color:#aaa">null</span>' : typeof v === 'object' ? esc(JSON.stringify(v).slice(0, 80)) : esc(String(v).length > 60 ? String(v).slice(0, 60) + '...' : v);
  const userMap = Object.fromEntries(DB.data.app_user.map(u => [u.id, u.email]));
  return `<div>${tn.map(t => `<button class="dbtn ${t === DT.table ? 'pri' : ''}" data-dact="table" data-t="${t}">${t} <span class="tag">${DB.data[t].length}</span></button>`).join('')}</div>
  <p class="small" style="color:#5A6480">Money columns are integer paise. Every row except app_user carries user_id, and every query is filtered by it. ${DT.table === 'spend' ? 'Undone spends keep their row with undone_at set (soft delete).' : ''}</p>
  <div class="tw"><table class="dtable"><thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows.slice(-200).reverse().map(r => `<tr>${cols.map(c => `<td class="${/paise|tokens|latency|count/.test(c) ? 'n' : ''}" ${c === 'user_id' ? `title="${esc(userMap[r[c]] || '')}"` : ''}>${c === 'user_id' ? esc(userMap[r[c]] || r[c].slice(0, 8)) : cell(r[c])}</td>`).join('')}</tr>`).join('') || '<tr><td>empty</td></tr>'}</tbody></table></div>`;
}
function calcRows(c) {
  const d = c.d, i = c.input, f = fmtINR; const dec = x => f(x, 2);
  return [
    ['monthsLeft', 'max(0.25, (deadline - today) / 30.4375)', d.monthsLeft.toFixed(4)], ['reqPerMonth', 'goal cost / monthsLeft', dec(d.reqPerMonth)], ['reqPerDay', 'reqPerMonth / 30.4375', dec(d.reqPerDay)],
    ['free', 'income - reqPerMonth', dec(d.free)], ['dailyBudget', 'max(0, free / days in month (' + d.dim + '))', dec(d.dailyBudget)], ['spentToday', 'sum of today\'s spends', dec(d.spentToday)], ['leftToday', 'dailyBudget - spentToday', dec(d.leftToday)],
    ['weekTotal', 'spends in last 7 days incl. today', dec(d.weekTotal)], ['weekBudget', 'dailyBudget x 7', dec(d.weekBudget)], ['spentMTD', 'spends this calendar month', dec(d.spentMTD)],
    ['projSpend', d.dom < 4 ? 'day < 4: planned pace = monthBudget' : 'spentMTD + spentMTD/day x (days left in month)', dec(d.projSpend)], ['projSave', 'income - projSpend', dec(d.projSave)], ['etaMonths', 'cost / projSave', d.never ? 'never' : d.etaMonths.toFixed(3)],
    ['etaDate', 'today + etaMonths x 30.4375', d.etaDate || 'never'], ['delayDays', 'round(etaDate - deadline); negative = ahead', d.never ? 'never' : d.delayDays], ['on time?', 'delay <= 3 days', d.onTime ? 'yes' : 'no'],
  ];
}
function dCalc() {
  const sb = DT.sandbox; let own = '<p>Sign in to see your live numbers.</p>';
  if (App.user) { const c = B.ctxFor(App.user.id); if (c.d) own = `<div class="kv"><div class="h">Quantity</div><div class="h">Formula</div><div class="h">Value</div>${calcRows(c).map(r => `<div><code>${r[0]}</code></div><div>${esc(r[1])}</div><div><b>${esc(r[2])}</b></div>`).join('')}</div>`; else own = '<p>No goal yet for this account.</p>'; }
  const sd = derive({ income: +sb.income, cost: +sb.cost, deadline: sb.deadline, today: sb.today, spends: [{ amount: +sb.spent, category: 'other', dk: sb.today }] }); const v = verdict(+sb.buy, sd);
  return `<h3>Live numbers for ${App.user ? esc(App.user.email) : 'nobody'}</h3>${own}
  <h3>Sandbox: play with the inputs (does not touch the database)</h3><div class="cols"><div>${[['income', 'Monthly free income'], ['cost', 'Goal cost'], ['deadline', 'Deadline (YYYY-MM-DD)'], ['today', 'Today'], ['spent', 'Spent today'], ['buy', 'Can I buy (amount)']].map(([k, l]) => `<div class="ctl"><div class="d">${l}</div><input data-dact="sb" data-k="${k}" value="${esc(sb[k])}" style="width:130px"></div>`).join('')}</div>
  <div class="kv" style="grid-template-columns:140px 1fr"><div class="h">Per month</div><div>${fmtINR(sd.reqPerMonth, 2)}</div><div class="h">Per day</div><div>${fmtINR(sd.reqPerDay, 2)}</div><div class="h">Daily budget</div><div>${fmtINR(sd.dailyBudget, 2)}</div><div class="h">Left today</div><div>${fmtINR(sd.leftToday, 2)}</div><div class="h">Week budget</div><div>${fmtINR(sd.weekBudget, 2)}</div><div class="h">Goal days (buy)</div><div>${sd.goalDays(+sb.buy).toFixed(2)}</div><div class="h">Verdict</div><div><b>${v.verdict}</b>${v.verdict === 'no' ? ', over ' + fmtINR(v.over, 2) + ', costs ' + round1(v.goalDays) + ' days' : ''}</div><div class="h">Edge flags</div><div>${[sd.deadlinePassed && 'deadline passed', sd.noBudget && 'no budget (saving > income)', sd.dom < 4 && 'planned pace (first 3 days)'].filter(Boolean).join(', ') || 'none'}</div></div></div>`;
}
function dTrace() {
  const t = B.lastTrace; const logs = DB.data.ai_call_log; const by = {};
  logs.forEach(l => { const k = l.purpose + ' / ' + l.model; by[k] = by[k] || { n: 0, i: 0, o: 0, ms: 0 }; by[k].n++; by[k].i += l.input_tokens; by[k].o += l.output_tokens; by[k].ms += l.latency_ms; });
  const RATE = { 'claude-sonnet-5-5': [3, 15], 'claude-haiku-5-5': [1, 5] };   // assumed illustrative $ per million tokens; edit to real prices
  let cost = 0; logs.forEach(l => { const r = RATE[l.model]; if (r) cost += l.input_tokens / 1e6 * r[0] + l.output_tokens / 1e6 * r[1]; });
  const users = new Set(logs.map(l => l.user_id)).size || 1;
  let h = '<p class="small" style="color:#5A6480">The model is mocked locally: a planner picks tools and a writer composes from tool results. Everything around it (system prompt, CONTEXT block, tool validation, 6-round loop, guardrails, repair, template fallback, logging) is the real design.</p>';
  if (!t) h += '<p>Send Aunty a message to see her turn here.</p>';
  else {
    h += `<h3>Last turn: "${esc(t.message)}"</h3><div><span class="tag">plan: ${esc(t.plan || '')}</span><span class="tag">${esc(t.model || '')}</span><span class="tag ${t.outcome === 'ok' ? 'g' : 'r'}">outcome: ${esc(t.outcome || '')}</span><span class="tag">mood: ${esc(t.mood || '')}</span><span class="tag">${t.tool_rounds || 0} tool round(s) of max 6</span><span class="tag">${t.tokens_in || 0} in / ${t.tokens_out || 0} out tokens</span><span class="tag">${t.latency_ms || 0} ms</span></div>`;
    if (t.payload) h += `<h3>1. What the model receives</h3><pre>${esc(t.payload.context)}\n\nMEMORIES: ${esc(JSON.stringify(t.payload.memories))}\nHISTORY: last ${t.payload.history.length} messages\nTOOLS: ${t.payload.tools.join(', ')}\nSYSTEM PROMPT: ${t.payload.system_prompt_tokens} tokens (cached)\nNEVER SENT: ${t.payload.never_sent.join(', ')}</pre>`;
    if (t.slm) h += `<h3>1b. Small language model (parser did not understand)</h3><pre>${esc(JSON.stringify(t.slm, null, 2))}</pre>`;
    h += `<h3>2. Tool calls (run on the server, results are the only source of figures)</h3>` + ((t.rounds || []).map((r, i) => `<div class="small"><b>Round ${i + 1}</b></div>` + r.calls.map(c => `<pre><b>${c.name}</b>(${esc(JSON.stringify(c.input))})\n=> ${esc(JSON.stringify(c.result))}</pre>`).join('')).join('') || '<p class="small">No tools called.</p>');
    h += `<h3>3. Attempts and guardrails</h3>` + (t.attempts || []).map(a => `<div class="small"><span class="${a.ok ? 'ok' : 'bad'}">Try ${a.try} ${a.ok ? 'passed' : 'rejected'}</span> ${esc(a.note || '')}<pre>${esc(a.text || '(empty)')}</pre></div>`).join('');
    if (t.guardrails && t.guardrails.length) h += `<table class="dtable"><tbody>${t.guardrails.map(g => `<tr><td class="${g.ok ? 'ok' : 'bad'}">${g.ok ? 'PASS' : 'FAIL'}</td><td>${esc(g.check)}</td><td>${esc(g.detail)}</td></tr>`).join('')}</tbody></table>`;
    h += `<h3>4. Final reply</h3><pre>${esc(t.final || '')}</pre>`;
  }
  h += `<h3>Cost tracking (ai_call_log, no message text)</h3><table class="dtable"><thead><tr><th>purpose / model</th><th>calls</th><th>input tok</th><th>output tok</th><th>avg ms</th></tr></thead><tbody>${Object.entries(by).map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.n}</td><td class="n">${v.i}</td><td class="n">${v.o}</td><td class="n">${Math.round(v.ms / v.n)}</td></tr>`).join('') || '<tr><td colspan=5>no calls yet</td></tr>'}</tbody></table><p class="small">Illustrative cost with assumed rates: $${cost.toFixed(4)} across ${users} user(s), about $${(cost / users).toFixed(4)} per user so far (edit RATE in ui-dash.js to real prices).</p>`;
  h += `<details><summary><b>System prompt</b></summary><pre>${esc(B.SYSTEM_PROMPT)}</pre></details>`;
  return h;
}
function dNudges() {
  if (!App.user) return '<p>Sign in first.</p>'; const uid = App.user.id; const ev = B.evalNudges(uid); const u = B.userById(uid);
  const hist = DB.where('nudge', n => n.user_id === uid).sort((a, b) => b.sent_at.localeCompare(a.sent_at));
  return `<p class="small" style="color:#5A6480">One nudge a day, at ${u.nudge_time}, outside quiet hours ${u.quiet_start} to ${u.quiet_end}. Opening the app runs the job if the time rules allow (mock cron). Local time now: <b>${hmOf(clock.now(), u.timezone)}</b>.</p>
  <button class="dbtn pri" data-dact="job">Run daily job (respect time)</button><button class="dbtn" data-dact="job-force">Force run (ignore time)</button><button class="dbtn" data-dact="payday">Tap "payday"</button><button class="dbtn" data-dact="recap">Generate last week's recap</button><button class="dbtn" data-dact="insight-reset">Regenerate today's insight</button><span id="jobOut" class="small"></span>
  <h3>Trigger evaluation right now ${ev.blocked ? '(' + esc(ev.blocked) + ')' : ''}</h3><table class="dtable"><thead><tr><th>Trigger</th><th>Facts</th><th>Status</th></tr></thead><tbody>${ev.candidates.map(c => `<tr><td><b>${c.trigger}</b>${c.category ? ' / ' + c.category : ''}</td><td><code>${esc(JSON.stringify(c.facts))}</code></td><td class="${c.suppressed ? 'warn' : (ev.chosen === c ? 'ok' : '')}">${c.suppressed ? 'suppressed: ' + esc(c.suppressed) : ev.chosen === c ? 'CHOSEN' + (ev.alternated ? ' (alternation rule)' : '') : 'eligible, waits'}</td></tr>`).join('') || '<tr><td colspan=3>No trigger is true right now.</td></tr>'}</tbody></table>
  <p class="small">Priority: payday, goal late, repeat habit, over pace, then wins and check-in. After two warnings in a row a win goes first.</p>
  <h3>Nudge history</h3><table class="dtable"><thead><tr><th>When</th><th>Trigger</th><th>Text</th><th>Source</th><th>Reaction</th></tr></thead><tbody>${hist.map(n => `<tr><td>${new Date(n.sent_at).toLocaleString()}</td><td>${n.trigger}</td><td style="max-width:360px;white-space:normal">${esc(n.text)}</td><td>${n.used_template ? 'template' : 'model'}</td><td>${n.reaction || ''}</td></tr>`).join('') || '<tr><td colspan=5>none</td></tr>'}</tbody></table>`;
}
function dApi() {
  const opts = B.routes.map((r, i) => `<option value="${i}">${r.method} /v1${r.pattern}${r.auth ? '' : '  (public)'}</option>`).join('');
  return `<div class="ctl"><select id="apiRoute" style="flex:1" data-dact="api-pick">${opts}</select><button class="dbtn pri" data-dact="api-send">Send</button></div>
  <div class="ctl"><div class="d">Path (edit :id values)</div><input id="apiPath" style="flex:2" value="/v1/summary"></div><div class="ctl"><div class="d">Headers (JSON)</div><input id="apiHdr" style="flex:2" value='{"Idempotency-Key":"demo-1"}'></div>
  <div class="ctl"><label><input type="checkbox" id="apiTok" checked> Send current session's access token</label></div><textarea id="apiBody" placeholder='JSON body, e.g. {"amount_paise":35000,"category":"food","note":"swiggy"}'></textarea>
  <h3>Response</h3><pre id="apiOut">${esc(DT.apiOut)}</pre><h3>Recent requests</h3><table class="dtable"><tbody>${B.events.slice(0, 12).map(e => `<tr><td>${new Date(e.t).toLocaleTimeString()}</td><td>${e.method}</td><td>${esc(e.path)}</td><td class="${e.status < 300 ? 'ok' : 'bad'}">${e.status}</td></tr>`).join('')}</tbody></table>
  <p class="small" style="color:#5A6480">Try the idempotency test: POST /spends twice with the same Idempotency-Key and watch "duplicate": true. Try GET /spends/:id with another account's spend id to see not_found.</p>`;
}
function dTests() {
  const r = DT.testResults; let h = `<button class="dbtn pri" data-dact="run-tests">Run all tests</button><span class="small" id="testState"></span>`;
  if (!r) return h + '<p>Runs the plan\'s money-logic vectors, auth and token rotation, user isolation, the evaluation set, guardrails, AI-down fallback and the nudge engine against a fresh in-memory backend (your data is not touched).</p>';
  const pass = r.filter(x => x.ok).length; h += ` <b class="${pass === r.length ? 'ok' : 'bad'}">${pass} / ${r.length} passed</b>`;
  const groups = [...new Set(r.map(x => x.group))];
  groups.forEach(g => { const rr = r.filter(x => x.group === g); h += `<h3>${esc(g)} <span class="tag ${rr.every(x => x.ok) ? 'g' : 'r'}">${rr.filter(x => x.ok).length}/${rr.length}</span></h3><table class="dtable"><tbody>${rr.map(x => `<tr><td class="${x.ok ? 'ok' : 'bad'}" style="width:48px">${x.ok ? 'PASS' : 'FAIL'}</td><td>${esc(x.name)}${x.ok ? '' : '<br><span class="small bad">' + esc(x.detail) + '</span>'}</td></tr>`).join('')}</tbody></table>`; });
  return h;
}
function dAbout() {
  const rows = [
    ['Money logic (derive, verdict, parser, what-if, compare, streak, recap)', 'Built', 'src/logic.js between the LOGIC markers, ready to lift into packages/core. All plan test vectors pass.'],
    ['Accounts, JWT + rotating refresh tokens, logout-all, change password, rate limits', 'Built (mocked crypto)', 'Password hash and token signature use SHA-256 as stand-ins for argon2id and real JWT.'],
    ['Per-user isolation on every query + automated cross-user test', 'Built', 'See Tests tab.'],
    ['/v1 API with idempotency, soft delete, export, cascade delete', 'Built', 'See API console.'],
    ['Aunty: system prompt, CONTEXT, 14 tools, 6-round loop, mood tag', 'Built; the model is a local mock', 'Swap planPlan/compose in src/aunty.js for the real model call. The server pipeline stays.'],
    ['Guardrails: numbers, regional words, advice, shame, length, repair, template', 'Built', 'Force failures from Controls.'],
    ['AI-down fallback parser, retries with client_message_id', 'Built', ''],
    ['Nudges (8 triggers, priority, alternation, mute, Not now, quiet hours), phase 2 flag', 'Built', 'Push is shown as an in-phone banner; real push needs the Android build.'],
    ['Daily insight, streaks with check-ins, weekly recap + share image', 'Built', 'Share image downloads a PNG; Android share sheet comes with the app.'],
    ['Settings (all sections), memory (20 max), app lock, widget', 'Built / previewed', 'App lock and widget are mock UIs; native versions come with Expo.'],
    ['Ledger tab: income/expense pills, per-day containers, hourly to yearly views, calendar, search, edit and delete', 'Built', 'Not in the original spec; added from design feedback.'],
    ['Floating + sheet with calculator, custom categories, accounts, date and note; Aunty reacts to every entry', 'Built', 'Aunty speaks up in chat and as a banner; she also mentions category limits.'],
    ['Multiple accounts and per-category monthly limits (Settings, Money)', 'Built', 'Transfers between accounts, recurring entries and per-month limit overrides are possible next steps.'],
    ['Edit the last message you sent', 'Built', 'Aunty undoes what it logged and answers the new text. Only the latest message is editable.'],
    ['Voice notes', 'Uses browser speech recognition if available', 'Chrome only; Android uses the phone recogniser.'],
    ['Streaming replies', 'Simulated', 'Typing dots then bubbles; real SSE comes with the server.'],
    ['Bank data (AA, SMS), iPhone, payments', 'Out of scope', 'Per the spec.'],
  ];
  return `<table class="dtable"><thead><tr><th>Spec item</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows.map(r => `<tr><td style="white-space:normal">${r[0]}</td><td class="${/^Built$/.test(r[1]) ? 'ok' : 'warn'}">${r[1]}</td><td style="white-space:normal">${r[2]}</td></tr>`).join('')}</tbody></table>`;
}

function dLlm() {
  const c = CFG.llm, on = B.llm.configured();
  if (c.proxyUrl && DT.llmModels === undefined) { DT.llmModels = null; B.llm.models().then(m => { DT.llmModels = m; }, e => { DT.llmModels = { error: e.message, models: [] }; }).then(() => { if (DT.tab === 'llm') dRender(); }); }
  const ML = DT.llmModels, list = (ML && ML.models) || [], inUse = list.find(m => m.id === (c.model || (ML && ML.default)));
  const modelSel = `<select id="llmModel" style="width:290px"><option value="">Proxy default${ML && ML.default ? ' (' + esc(ML.default) + ')' : ''}</option>${list.map(m => `<option value="${esc(m.id)}"${m.id === c.model ? ' selected' : ''}>${esc(m.label)} ${m.online ? '[online]' : '[offline]'}</option>`).join('')}${c.model && !list.some(m => m.id === c.model) ? `<option value="${esc(c.model)}" selected>${esc(c.model)} [not in the proxy list]</option>` : ''}</select>`;
  return `<p class="small" style="color:#5A6480">Aunty works in two layers. <b>Layer 1 (always on):</b> a deterministic parser handles clear messages ("chai 30", "can I buy shoes for 2k?", "how am I doing"). <b>Layer 2 (needs your LLM and its API key):</b> messages the parser cannot understand go to a small language model, which only <i>proposes</i> an intent as JSON. Our code validates it, runs the tools, and writes the reply. The model never calculates and a spend is never saved from the model's word alone.</p>
  <div class="ctl"><div class="d"><b>Use the language model for free-form messages</b><small>Status: <span class="${on ? 'ok' : 'warn'}">${on ? 'linked (proxy URL set)' : 'not linked. Without it, unrecognised messages get "My language brain is not linked yet".'}</span></small></div>${sw('llmEnabled', c.enabled)}</div>
  <div class="ctl"><div class="d"><b>LLM proxy URL</b><small>Where llm-proxy.js is running. It holds the API key, so this page never does.</small></div><input id="llmUrl" value="${esc(c.proxyUrl)}" style="width:240px"></div>
  <div class="ctl"><div class="d"><b>Model</b><small>The list comes from the proxy (models.json). The phone chat and this dashboard both use the model you pick here. <b>In use now:</b> ${ML === null ? 'loading...' : inUse ? esc(inUse.label) + (inUse.online ? '' : ' (offline!)') : ML && ML.error ? 'unknown (' + esc(ML.error) + ')' : 'proxy default'}</small></div>${modelSel}<button class="dbtn" data-dact="llm-models">Refresh</button></div>
  <div class="ctl"><div class="d"><b>Ask for constrained JSON output</b><small>Turn off if your server rejects response_format.</small></div>${sw('llmSchema', c.jsonSchema !== false)}</div>
  <div class="ctl"><div class="d"><b>Timeout (ms)</b><small>CPU models are slow. The plan's 15 s limit is a starting point.</small></div><input id="llmTimeout" type="number" value="${c.timeoutMs}" style="width:110px"></div>
  <div><button class="dbtn pri" data-dact="llm-save">Save</button><button class="dbtn" data-dact="llm-test">Test connection</button><span id="llmOut" class="small"></span></div>
  <h3>Try a message (shows the proposal and what would run; nothing is executed or saved)</h3>
  <div class="ctl"><input id="llmMsg" style="flex:1" placeholder="e.g. pichle hafte se is hafte kitna zyada gaya" value="pichle hafte se is hafte kitna zyada gaya"><button class="dbtn" data-dact="llm-try">Interpret</button></div>
  <pre id="llmTry" style="min-height:60px">${esc(DT.llmTry || '')}</pre>
  <h3>How the models are set up</h3><pre>1. Each model runs as its own llama-server on its own port (for example 8081, 8080).
2. prototype/models.json lists them: id, label, base_url, model, key_env (no secrets inside).
3. Start the proxy; it reads the key from an environment variable and refuses to start without it:
   LLM_API_KEY=&lt;your key&gt; node llm-proxy.js
4. This page loads the list from the proxy (/models). The model you pick here is the one the phone chat uses.</pre>
  <p class="small" style="color:#5A6480">Full steps, llama.cpp commands and the production mapping are in SLM_INTEGRATION.md.</p>`;
}
const DACT = {
  flag: async el => { const k = el.dataset.k; if (k === 'llmEnabled') { CFG.llm.enabled = !CFG.llm.enabled; saveCfg(); dRender(); return; } if (k === 'llmSchema') { CFG.llm.jsonSchema = CFG.llm.jsonSchema === false; saveCfg(); dRender(); return; } if (k === 'offline') { App.offline = !App.offline; LS.set('ha_offline', App.offline); renderOfflineNote(); } else { CFG[k] = !CFG[k]; saveCfg(); } dRender(); },
  'set-clock': () => { const v = $('#simNow').value; if (!v) return; const [dk, hm] = v.split('T'); const [h, m] = hm.split(':').map(Number); clock.offset = localToMs(dk, h, m, IST) - Date.now(); LS.set('ha_clock_off', clock.offset); afterClock(); },
  adv: el => { const v = el.dataset.v; if (v === 'pm') { const dk = dayKey(clock.now(), IST); let t = localToMs(dk, 19, 5, IST); if (t <= clock.now()) t = localToMs(addDays(dk, 1), 19, 5, IST); clock.offset += t - clock.now(); } else clock.offset += +v; LS.set('ha_clock_off', clock.offset); afterClock(); },
  'real-time': () => { clock.offset = 0; LS.set('ha_clock_off', 0); afterClock(); },
  'demo-acct': demoAccount, seed: seedDemo,
  'sample-vector': async () => {
    if (!App.user) return alert('Log in first.'); const uid = App.user.id; clock.offset = localToMs('2026-10-11', 12, 0, IST) - Date.now(); LS.set('ha_clock_off', clock.offset);
    DB.remove('spend', r => r.user_id === uid); DB.update('app_user', B.userById(uid), { income_paise: 2200000, rent_paise: null }); B.setGoal(uid, { name: 'Goa trip', cost_paise: 2600000, deadline: '2027-02-11', free_income_paise: 2200000 }); DB.update('app_user', B.userById(uid), { flow: null });
    [[30, 'chai', 'chai', 0], [90, 'ride', 'auto', 0], [600, 'food', 'swiggy', 1]].forEach(([a, c, n, d]) => B.addSpend(uid, { amount_paise: a * 100, category: c, note: n, spent_at: new Date(localToMs(addDays('2026-10-11', -d), 11, 0, IST)).toISOString() }));
    await refreshSummary(); toast('Test vector loaded: left today should be ₹382'); dRender();
  },
  'expire-token': () => { if (S) { S.access = 'x.y'; saveS(); toast('Access token corrupted. The next call refreshes it.'); } },
  retention: () => { alert(JSON.stringify(B.runRetention(30, 90))); dRender(); }, 'clear-rl': () => { B.clearRL(); alert('Rate limits cleared.'); },
  'reset-db': async () => { if (!confirm('Delete ALL accounts and data in this prototype?')) return; DB.reset(); S = null; saveS(); App.user = null; LS.set('ha_seen_nudge', null); showWelcome(); dRender(); },
  table: el => { DT.table = el.dataset.t; dRender(); }, sb: el => { DT.sandbox[el.dataset.k] = el.value; clearTimeout(DT.sbT); DT.sbT = setTimeout(() => { const a = el; dRender(); const n = document.querySelector(`[data-k="${a.dataset.k}"]`); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }, 400); },
  job: () => nudgeJob(false), 'job-force': () => nudgeJob(true),
  payday: async () => { await api('POST', '/me/payday'); $('#jobOut').textContent = ' Payday flagged for today.'; dRender(); },
  recap: async () => { const r = await api('POST', '/dev/recap'); if (r.status !== 200) return alert(r.body.error.message); await refreshSummary(); dRender(); },
  'insight-reset': async () => { DB.remove('insight', i => i.user_id === App.user.id && i.day === B.today(App.user)); await refreshSummary(); dRender(); },
  'api-pick': () => { const r = B.routes[+$('#apiRoute').value]; $('#apiPath').value = '/v1' + r.pattern.replace(/:([a-z_]+)/g, '<$1>'); const ex = { 'POST /spends': '{"amount_paise":35000,"category":"food","note":"swiggy"}', 'POST /chat': '{"message":"swiggy 350","client_message_id":"abc-1"}', 'PUT /goal': '{"name":"Goa trip","cost_paise":2600000,"deadline":"2027-02-11","free_income_paise":2200000}', 'PATCH /me': '{"theme":"dark"}', 'POST /nudges/:id/reaction': '{"reaction":"got_it"}', 'POST /auth/login': '{"email":"demo@hisaab.app","password":"demo12345"}' }[r.method + ' ' + r.pattern]; $('#apiBody').value = ex || ''; },
  'api-send': async () => {
    const r = B.routes[+$('#apiRoute').value]; let body, hdr = {}; try { if ($('#apiBody').value.trim()) body = JSON.parse($('#apiBody').value); if ($('#apiHdr').value.trim()) hdr = JSON.parse($('#apiHdr').value); } catch (e) { DT.apiOut = 'Bad JSON: ' + e.message; return dRender2(); }
    const path = $('#apiPath').value; const res = await B.api(r.method, path, { token: $('#apiTok').checked ? S && S.access : null, body, headers: hdr });
    DT.apiOut = r.method + ' ' + path + '\n' + res.status + '\n' + JSON.stringify(res.body, null, 2); dRender2(); if (App.user) refreshSummary();
  },
  'llm-save': () => { CFG.llm.proxyUrl = $('#llmUrl').value.trim() || 'http://localhost:8787'; CFG.llm.model = $('#llmModel').value.trim(); CFG.llm.timeoutMs = Math.max(1000, +$('#llmTimeout').value || 15000); saveCfg(); $('#llmOut').textContent = ' Saved.'; },
  'llm-models': () => { DT.llmModels = undefined; dRender(); },
  'llm-test': async () => { DACT['llm-save'](); const o = $('#llmOut'); o.textContent = ' Testing...'; try { const h = await B.llm.health(); o.textContent = ' Proxy reachable (upstream ' + h.upstream + ', key configured: ' + h.keyConfigured + '). Asking the model...'; const p = await B.llm.ping(); o.textContent = ' OK: model "' + (p.model || '?') + '" replied "' + p.text + '" in ' + p.ms + ' ms.'; } catch (e) { o.textContent = ' Failed: ' + e.message + '. Is llm-proxy.js running, and is the origin allowed (ALLOW_ORIGIN)?'; } },
  'llm-try': async () => { DACT['llm-save'](); const out = $('#llmTry'); if (!App.user) { out.textContent = 'Sign in first.'; return; } const msg = $('#llmMsg').value; out.textContent = 'Asking the model...'; const c = B.ctxFor(App.user.id); try { const r = await B.llm.interpret(msg, { today: c.today, weekday: WEEKDAYS[dow(c.today)], categories: B.catsOf(App.user.id).map(x => x.slug + ' (' + x.label + ')') }); const v = B.intentToPlan(r.obj, msg, c); DT.llmTry = 'Model proposal (' + r.ms + ' ms' + (r.tokens_in ? ', ' + r.tokens_in + ' in / ' + r.tokens_out + ' out tokens' : '') + '):\n' + JSON.stringify(r.obj, null, 2) + '\n\nOur validation: ' + (v.ok ? 'ACCEPTED as "' + v.plan.kind + '"\nTools that would run: ' + (v.plan.calls.map(x => x.name + '(' + JSON.stringify(x.input) + ')').join('\n  ') || '(none; Aunty would reply directly)') : 'REJECTED: ' + v.reason); } catch (e) { DT.llmTry = 'Failed: ' + e.message; } out.textContent = DT.llmTry; },
  'run-tests': async () => { const st = $('#testState'); st.textContent = ' running...'; await sleep(30); try { DT.testResults = runLogicTests().concat(await runBackendTests()); } catch (e) { DT.testResults = [{ group: 'Harness', name: 'tests crashed', ok: false, detail: e.stack }]; } dRender2(); },
};
function dRender2() { const el = $('#dbody'); const sc = el.scrollTop; el.innerHTML = ({ controls: dControls, db: dDb, calc: dCalc, trace: dTrace, llm: dLlm, nudges: dNudges, api: dApi, tests: dTests, about: dAbout })[DT.tab](); el.scrollTop = sc; }
async function nudgeJob(force) { const r = await api('POST', '/dev/nudge-job', { force }); await refreshSummary(); dRender(); const o = $('#jobOut'); if (o) o.textContent = r.body.sent ? ' Sent: ' + r.body.nudge.text : ' Not sent: ' + r.body.reason; }
async function afterClock() { if (App.user) { await refreshSummary(); await loadChat(); } dRender2(); }
document.addEventListener('click', e => { const t = e.target.closest('.dtabs button'); if (t) { DT.tab = t.dataset.t; LS.set('ha_dtab', DT.tab); dRender(); return; } const a = e.target.closest('[data-dact]'); if (a && DACT[a.dataset.dact] && a.tagName !== 'INPUT' && a.tagName !== 'SELECT') { DACT[a.dataset.dact](a, e); } });
document.addEventListener('input', e => { const a = e.target.closest('input[data-dact="sb"]'); if (a) DACT.sb(a); });
document.addEventListener('change', e => { const a = e.target.closest('select[data-dact="api-pick"]'); if (a) DACT['api-pick'](); });
function buildDash() {
  $('#dash').innerHTML = `<div class="dash"><div class="dash-hd"><h1>Hisaab Aunty &middot; prototype dashboard</h1><span class="tag">mock backend in your browser</span></div><div class="dtabs">${DTABS.map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div><div class="dbody" id="dbody"></div></div>`; dRender();
}
// ==END UI-DASH==
