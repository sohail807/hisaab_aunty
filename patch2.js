const fs = require('fs'); let a = fs.readFileSync('src/aunty.js', 'utf8');
const between = (s, e) => { const i = a.indexOf(s), j = a.indexOf(e, i + 1); if (i < 0 || j < 0) throw new Error('marker missing: ' + s.slice(0, 50) + ' / ' + e.slice(0, 50)); return [i, j]; };
const swap = (s, e, text) => { const [i, j] = between(s, e); a = a.slice(0, i) + text + a.slice(j); };
const rep = (x, y) => { if (!a.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); a = a.replace(x, () => y); };

// ---------- 1. goal setup flow: name in the user's own words, icon, income, optional balance / rent / food ----------
swap("  const Q = {", "  // ---------- tools (all run", `  const Q = {
    name: 'What are you saving for? Tell me in your own words, like "my wedding" or "Goa trip".',
    cost: 'How much does it cost? 26000, 26k or 26,000 all work.',
    months: 'In how many months do you want it? A whole number or a decimal is fine (at least 0.25).',
    income: 'What is your total monthly income? Salary or allowance, before any bills.',
    balance: 'Optional: how much is in your bank account right now? Type "skip" to leave it.',
    rent: 'Optional: your monthly rent or other fixed bills? Type "skip" if none or not sure.',
    food: 'Optional: roughly how much do you spend on food each month? I will use it as your food limit, and you can change it any time. "skip" is fine.',
  };
  const STEPS = ['name', 'cost', 'months', 'income', 'balance', 'rent', 'food'], OPTIONAL = ['balance', 'rent', 'food'];
  B.startGoalFlow = (uid, first) => {
    const u = B.userById(uid); db.update('app_user', u, { flow: { step: 'name', tries: 0, data: {} } });
    if (first) { B.addAunty(uid, \`Namaste \${u.display_name.split(' ')[0]}! I am Hisaab Aunty, an AI money coach. I help with budgeting, not financial advice, and I will never ask for bank passwords, PINs or OTPs.\`, 'happy', { tpl: 'greet' }); }
    else B.addAunty(uid, 'Chalo, let us set a fresh goal. Type "cancel" any time to keep the old one.', 'happy', {});
    B.addAunty(uid, Q.name, 'neutral', { flow: 'name' });
  };
  function handleFlow(uid, text) {
    const u = B.userById(uid), f = u.flow, t = text.trim();
    const retry = (msg) => { f.tries++; db.update('app_user', u, { flow: f }); return { text: msg + ' ' + Q[f.step], mood: 'neutral' }; };
    if (/^\\s*(cancel|stop|nevermind|never mind)\\s*$/i.test(t)) { db.update('app_user', u, { flow: null }); return { text: 'No problem, I have left your goal as it was. Ask me anything when you are ready.', mood: 'neutral' }; }
    const skipped = OPTIONAL.includes(f.step) && /^\\s*(skip|no|none|nahi|na|later|not sure|-)\\s*$/i.test(t);
    let ack = '';
    if (f.step === 'name') {
      if (!t || t.length > 120) return retry('A short name please.');
      f.data.name = cleanGoalName(t); f.data.icon = goalIcon(f.data.name); ack = \`\${f.data.icon} \${f.data.name}, lovely. \`;
    } else if (f.step === 'cost') { const x = parseAmount(t); if (!x || x <= 0 || x > 1e8) return retry('I could not read that amount.'); f.data.cost = x; }
    else if (f.step === 'months') { const m = parseFloat((t.match(/\\d+(\\.\\d+)?/) || [])[0]); if (!(m >= 0.25) || m > 120) return retry('Months should be a number, at least 0.25.'); f.data.months = m; }
    else if (f.step === 'income') { const x = parseAmount(t); if (x == null || x <= 0 || x > 1e8) return retry('I could not read that amount.'); f.data.income = x; }
    else if (skipped) f.data[f.step] = null;
    else { const x = parseAmount(t); if (x == null || x < 0 || x > 1e9) return retry('I could not read that amount, or type "skip".'); f.data[f.step] = x; }
    const next = STEPS[STEPS.indexOf(f.step) + 1];
    if (next) { f.step = next; f.tries = 0; db.update('app_user', u, { flow: f }); return { text: ack + Q[next], mood: 'neutral' }; }
    // all answered: save the goal and the optional extras
    const d0 = f.data, today = B.today(u), deadline = monthsToDeadline(today, d0.months);
    const rent = d0.rent || 0, free = Math.max(0, d0.income - rent);
    B.setGoal(uid, { name: d0.name, icon: d0.icon, cost_paise: toPaise(d0.cost), deadline, free_income_paise: toPaise(free), income_paise: toPaise(d0.income), rent_paise: d0.rent != null ? toPaise(d0.rent) : null });
    const extra = [];
    if (d0.balance != null) { const acc = B.accountsOf(uid)[0]; const cur = B.accountBalance(uid, acc); db.update('account', acc, { opening_paise: acc.opening_paise + (toPaise(d0.balance) - cur) }); extra.push(\`Your account shows \${R(d0.balance)}.\`); }
    if (d0.rent) extra.push(\`Rent \${R(d0.rent)} is set aside, so your free income is \${R(free)}.\`);
    if (d0.food) { const fc = B.catsOf(uid).find(x => x.slug === 'food'); db.update('category', fc, { limit_paise: toPaise(d0.food) }); extra.push(\`Food limit set to \${R(d0.food)} a month.\`); }
    db.update('app_user', u, { flow: null });
    const c = B.ctxFor(uid), d = c.d;
    const head = d.noBudget ? \`\${d0.icon} Goal saved: \${d0.name}, \${R(d0.cost)} by \${fmtDate(deadline)}. Honest heads-up: that needs \${R(d.reqPerMonth)} a month, which is more than your \${R(free)} free income, so the daily budget is \${R(0)}. A longer deadline would make this doable.\`
      : \`\${d0.icon} Done! \${d0.name}: \${R(d0.cost)} by \${fmtDate(deadline)}. You need to save \${R(d.reqPerMonth)} a month (\${R(d.reqPerDay)} a day), which leaves \${R(d.dailyBudget)} a day to spend.\`;
    return { text: head + ' ' + extra.join(' ') + (d.noBudget ? '' : ' Tell me what you spend and I will keep score.'), mood: d.noBudget ? 'neutral' : 'happy', actions: [{ type: 'goal_updated' }], navigate: 'spend' };
  }

`);

// ---------- 2. log_spend uses user categories and reports category limits ----------
swap("    log_spend(uid, i, turn) {", "    check_purchase(uid, i) {", `    log_spend(uid, i, turn) {
      need(typeof i.amount_inr === 'number' && i.amount_inr > 0 && i.amount_inr <= 1e7, 'amount_inr must be more than 0');
      const category = B.catsOf(uid).some(x => x.slug === i.category) ? i.category : 'other';
      const u = B.userById(uid), today = B.today(u); let spent_at = null, date = today;
      if (i.when) { need(isDk(i.when.slice(0, 10)), 'when must be an ISO date'); date = i.when.slice(0, 10); need(date <= today, 'date is in the future'); if (date !== today) spent_at = B.iso(localToMs(date, 12, 0, u.timezone)); }
      const res = B.addSpend(uid, { amount_paise: toPaise(i.amount_inr), category, note: String(i.note || '').slice(0, 60), spent_at, source: turn.source || 'chat', idempotency_key: nextIdem(turn) });
      return buildLogResult(uid, res.spend, res.duplicate);
    },
`);
rep("  const TOOLS = {", `  function buildLogResult(uid, row, dup) {
    const u = B.userById(uid), c = B.ctxFor(uid), today = B.today(u), date = dayKey(Date.parse(row.spent_at), u.timezone), amt = toRupees(row.amount_paise);
    const cat = B.catsOf(uid).find(x => x.slug === row.category);
    const out = { saved: true, duplicate: !!dup, spend_id: row.id, amount_inr: r2(amt), category: row.category, category_label: cat ? cat.label : row.category, note: row.note, date, is_today: date === today, serious: !!(c.d && amt > 3 * c.d.dailyBudget && c.d.dailyBudget > 0), goal_days_cost: c.d ? round1(c.d.goalDays(amt)) : null, cat_limit_inr: null };
    if (cat && cat.limit_paise) {
      const used = toRupees(B.monthSpent(uid, date.slice(0, 7), row.category)), lim = toRupees(cat.limit_paise);
      Object.assign(out, { cat_limit_inr: r2(lim), cat_month_inr: r2(used), cat_status: used > lim ? 'over' : used >= 0.8 * lim ? 'near' : 'ok', cat_over_by_inr: used > lim ? r2(used - lim) : 0 });
    }
    return Object.assign(out, leftBits(c), goalBits(c));
  }
  const TOOLS = {`);
// ---------- 3. new tools ----------
rep("    checkin_today(uid) {", `    set_category_limit(uid, i) {
      need(typeof i.amount_inr === 'number' && i.amount_inr >= 0 && i.amount_inr <= 1e8, 'amount_inr must be 0 or more');
      const cat = B.catsOf(uid).find(x => x.slug === i.category); need(!!cat, 'unknown category');
      db.update('category', cat, { limit_paise: i.amount_inr > 0 ? toPaise(i.amount_inr) : null });
      return { category: cat.slug, label: cat.label, limit_inr: i.amount_inr > 0 ? r2(i.amount_inr) : null, month_spent_inr: r2(toRupees(B.monthSpent(uid, B.today(B.userById(uid)).slice(0, 7), cat.slug))) };
    },
    get_category_limits(uid) {
      const month = B.today(B.userById(uid)).slice(0, 7);
      return { month, categories: B.catsOf(uid).map(x => { const sp = toRupees(B.monthSpent(uid, month, x.slug)), lim = x.limit_paise == null ? null : toRupees(x.limit_paise); return { slug: x.slug, label: x.label, limit_inr: lim == null ? null : r2(lim), spent_inr: r2(sp), left_inr: lim == null ? null : r2(lim - sp), status: lim == null ? 'none' : sp > lim ? 'over' : sp >= 0.8 * lim ? 'near' : 'ok' }; }) };
    },
    get_accounts(uid) {
      const today = B.today(B.userById(uid)); const accs = B.accountsOf(uid).map(x => ({ name: x.name, type: x.type, balance_inr: r2(toRupees(B.accountBalance(uid, x))) })); const lg = B.ledger(uid, today.slice(0, 7) + '-01', today);
      return { accounts: accs, total_inr: r2(accs.reduce((s, x) => s + x.balance_inr, 0)), month_income_inr: r2(toRupees(lg.income_paise)), month_expense_inr: r2(toRupees(lg.expense_paise)) };
    },
    checkin_today(uid) {`);
// ---------- 4. context block ----------
rep("    } else lines.push('goal: none yet (setup not finished)');", `    } else lines.push('goal: none yet (setup not finished)');
    { const accs = B.accountsOf(uid), tot = accs.reduce((s, x) => s + B.accountBalance(uid, x), 0), lg = B.ledger(uid, c.today.slice(0, 7) + '-01', c.today); lines.push(\`accounts: \${accs.length}, total balance \${R(toRupees(tot))}\`, \`this_month: income \${R(toRupees(lg.income_paise))}, expenses \${R(toRupees(lg.expense_paise))}\`); }`);
// ---------- 5. planner: custom categories, limits, balances ----------
{
  const [i, j] = between("  function planPlan(msg, c, turn) {", "  // ---------- the mock \"model\": writes the reply from tool results");
  let region = a.slice(i, j).replace(/MATCH_CAT\(/g, 'MC(');
  region = region.replace("    const t = msg.toLowerCase().trim(), today = c.today;", `    const t = msg.toLowerCase().trim(), today = c.today;
    const customs = B.catsOf(c.user.id).filter(x => x.custom);
    const MC = (s) => MATCH_CAT(s) || (customs.find(x => new RegExp('\\\\b' + x.label.toLowerCase().replace(/[^a-z0-9 ]/g, '') + '\\\\b').test(s.toLowerCase())) || {}).slug || null;`);
  region = region.replace("    // what-if\n", `    if (/\\b(limit|limits|cap)\\b/.test(t) && /\\b(set|change|make|put|keep|raise|lower|update|remove)\\b/.test(t) && (hasAmt || /remove|no limit/.test(t))) { const cat = MC(t.replace(/delivery/, 'swiggy')); if (cat) return S('limit_set', { calls: [{ name: 'set_category_limit', input: { category: cat, amount_inr: /remove|no limit/.test(t) ? 0 : (amounts[0] || { value: 0 }).value } }] }); }
    if (/\\b(limits?|category budgets?)\\b/.test(t)) return S('limits', { calls: [{ name: 'get_category_limits', input: {} }] });
    if ((/\\b(balance|my accounts?|how much (money )?do i have|bank account)\\b|(income|earned|salary).{0,20}(this month|month|so far)|how much (did i|have i) (earn|get|receive)/.test(t)) && !hasAmt) return S('accounts', { calls: [{ name: 'get_accounts', input: {} }] });
    // what-if\n`);
  a = a.slice(0, i) + region + a.slice(j);
}
// ---------- 6. compose: limit sentence + new kinds ----------
rep("        if (last.goal_status === 'late' && !seriousSpend && single) text += `\\n\\n${statusLine(last)} A lighter day or two will fix it.`;", `        const lim = last.cat_status === 'over' ? \`That is \${R(last.cat_over_by_inr)} over your \${last.category_label} limit of \${R(last.cat_limit_inr)} this month.\` : last.cat_status === 'near' ? \`\${last.category_label} is at \${R(last.cat_month_inr)} of your \${R(last.cat_limit_inr)} limit this month.\` : '';
        const extra = [];
        if (last.goal_status === 'late' && !seriousSpend && single) extra.push(\`\${statusLine(last)} A lighter day or two will fix it.\`);
        if (lim && !seriousSpend) { extra.push(lim); if (last.cat_status === 'over' && mood !== 'shock') mood = 'judge'; }
        if (extra.length) text += '\\n\\n' + extra.join(' ');`);
rep("      case 'whatif': {", `      case 'limit_set': { const r = results[0]; if (r.error) return { text: 'Tell me the category and amount, like "set food limit 3000".', mood: 'neutral' }; return { text: r.limit_inr ? \`\${r.label} limit set to \${R(r.limit_inr)} a month. You have used \${R(r.month_spent_inr)} so far this month.\` : \`Removed the \${r.label} limit.\`, mood: 'happy', actions: [{ type: 'limit_changed' }] }; }
      case 'limits': { const r = results[0]; const w2 = r.categories.filter(x => x.limit_inr != null); if (!w2.length) return { text: 'You have not set any category limits. Say "set food limit 3000" and I will keep watch.', mood: 'neutral' }; return { text: 'This month: ' + w2.map(x => \`\${x.label} \${R(x.spent_inr)} of \${R(x.limit_inr)}\${x.status === 'over' ? ' (over)' : ''}\`).join(', ') + '.', mood: w2.some(x => x.status === 'over') ? 'judge' : 'happy', explain: true }; }
      case 'accounts': { const r = results[0]; return { text: \`Balance across \${r.accounts.length} account\${r.accounts.length > 1 ? 's' : ''}: \${R(r.total_inr)} (\${r.accounts.map(x => x.name + ' ' + R(x.balance_inr)).join(', ')}). This month: \${R(r.month_income_inr)} in, \${R(r.month_expense_inr)} out.\`, mood: 'neutral', explain: true }; }
      case 'whatif': {`);
// ---------- 7. reactions to spends added outside chat + chat route with edit ----------
swap("  B.route('POST', '/chat', async (c) => {", "  B.TOOL_NAMES =", `  // Aunty speaks up about every spend or income added from the + button, in the same voice as chat
  function reactText(uid, text, results, mood, actions) {
    const u = B.userById(uid), ctxText = buildContext(uid); const allowed = allowedNumbers(results, ctxText, '', []); const g = runGuardrails(text, allowed, u, false);
    if (!g.ok) { const fixed = repair(text, g, u); text = fixed && runGuardrails(fixed, allowed, u, false).ok ? fixed : plainTemplate({}, results); mood = 'neutral'; }
    const msg = B.addAunty(uid, text, mood, { actions, source: 'add_sheet' }); B.logAI(uid, 'spend_reaction', cfg.chatModel, ctxText, text, 300, 'ok');
    return { text, mood, message_id: msg.id, actions };
  }
  B.auntyReactSpend = (uid, row) => {
    const c = B.ctxFor(uid), turn = { tpl: [], seed: row.id, idem: 0 }; const res = buildLogResult(uid, row, false);
    const out = compose({ kind: 'log' }, [res], c, turn, chooser(uid, turn));
    return reactText(uid, out.text.replace(/\\n\\n/g, ' '), [res], out.mood, out.actions);
  };
  B.auntyReactIncome = (uid, inc) => {
    const c = B.ctxFor(uid), u = c.user, amt = toRupees(inc.amount_paise); const res = { income_inr: r2(amt), title: inc.title, req_per_month_inr: c.d ? r2(c.d.reqPerMonth) : null, goal_name: c.goal ? c.goal.name : null };
    const text = c.d ? \`\${cap(touch(u, 'go') ? touch(u, 'go') + ', ' : '')}\${touch(u, 'go') ? 'money' : 'Money'} in: \${R(amt)}\${inc.title && inc.title !== 'Income' ? ' (' + inc.title + ')' : ''}. Move \${R(res.req_per_month_inr)} to the \${res.goal_name} fund first, before the month gets ideas.\` : \`Money in: \${R(amt)}. Set a goal and I will tell you how much to put aside first.\`;
    return reactText(uid, text, [res], 'happy', []);
  };
  // one shared path for a new message and for an edited last message
  async function chatCore(uid, user, msg, cid, replaceMsg) {
    let resp;
    if (replaceMsg) { db.update('chat_message', replaceMsg, { text: msg, edited: true, client_message_id: cid }); } else B.addUserMsg(uid, msg, cid);
    if (user.flow) {
      const r = handleFlow(uid, msg);
      resp = { replies: [{ text: r.text, mood: r.mood }], actions: r.actions || [], summary_changed: !!r.actions, navigate: r.navigate || null, mood: r.mood };
      B.logAI(uid, 'goal_setup_script', 'none', '', '', 1, 'script');
    } else if (cfg.aiDown) resp = fallbackTurn(uid, msg, cid);
    else resp = await auntyTurn(uid, msg, cid);
    resp.replies.forEach((rp, i) => B.addAunty(uid, rp.text, rp.mood, i === 0 ? { reply_to: cid, response: resp, actions: resp.actions, tpl: resp.tpl } : { actions: [] }));
    if (!resp.replies.length && cid) B.addAunty(uid, '(goal setup started)', 'neutral', { reply_to: cid, response: resp, hidden: true });
    return resp;
  }
  const checkMsg = (c) => {
    const msg = String((c.body || {}).message || '').trim(); if (!msg) throw E.invalid('Say something first.'); if (msg.length > 500) throw E.invalid('Keep it under 500 characters, please.');
    return msg;
  };
  B.route('POST', '/chat', async (c) => {
    const msg = checkMsg(c), cid = (c.body || {}).client_message_id || null, uid = c.uid;
    if (cid) {
      const prior = db.find('chat_message', m => m.user_id === uid && m.client_message_id === cid);
      if (prior) { const rep = db.find('chat_message', m => m.user_id === uid && m.meta && m.meta.reply_to === cid && m.meta.response); if (rep) return Object.assign({ replayed: true }, rep.meta.response); }
    }
    if (!B.hit('chat:' + uid, 20, 60000)) throw E.rate('One at a time, please. Give me a few seconds.');
    return chatCore(uid, c.user, msg, cid, null);
  });
  // edit the last message you sent: Aunty undoes what that message did and answers the new text
  B.route('POST', '/chat/:id/edit', async (c) => {
    const msg = checkMsg(c), uid = c.uid; if (!B.hit('chat:' + uid, 20, 60000)) throw E.rate('One at a time, please. Give me a few seconds.');
    if (c.user.flow) throw E.invalid('Finish or cancel the goal setup first.');
    const all = db.data.chat_message.filter(m => m.user_id === uid), users = all.filter(m => m.role === 'user'), last = users[users.length - 1];
    const m = all.find(x => x.id === c.params.id && x.role === 'user'); if (!m) throw E.notFound('Message not found.');
    if (!last || last.id !== m.id) throw E.invalid('Only your latest message can be edited.');
    const reps = all.slice(all.indexOf(m) + 1).filter(r => r.role !== 'user');
    if (reps.some(r => r.meta && (r.meta.flow || (r.meta.response && r.meta.response.flow_started)))) throw E.invalid('That was part of the goal setup. Say "change my goal" to redo it.');
    reps.forEach(r => ((r.meta && r.meta.actions) || []).forEach(x => { if (x.type === 'spend_logged' && x.spend_id) { const s = db.find('spend', y => y.id === x.spend_id && y.user_id === uid); if (s && !s.undone_at) db.update('spend', s, { undone_at: B.iso() }); } }));
    const drop = new Set(reps.filter(r => !(r.meta && r.meta.nudge_id)).map(r => r.id)); db.remove('chat_message', r => drop.has(r.id));
    const resp = await chatCore(uid, c.user, msg, uuid(), m); resp.edited = true; return resp;
  });
  `);
fs.writeFileSync('src/aunty.js', a); console.log('aunty patched');
