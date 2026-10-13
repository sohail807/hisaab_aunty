const fs = require('fs'); let b = fs.readFileSync('src/backend.js', 'utf8');
const rep = (a, c) => { if (!b.includes(a)) throw new Error('missing: ' + a.slice(0, 70)); b = b.replace(a, () => c); };
rep("'ai_call_log', 'device'];", "'ai_call_log', 'device', 'category', 'account', 'income'];");
const start = b.indexOf("  B.addSpend = (uid, p) => {"), end = b.indexOf("  B.goalFigures = (c) => {");
const newCore = `  // ----- categories (default five + the user's own, each with an optional monthly limit) and accounts -----
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
`;
b = b.slice(0, start) + newCore + b.slice(end);
rep("on_time: d.onTime, never: d.never, deadline_passed: d.deadlinePassed, no_budget: d.noBudget };", "on_time: d.onTime, never: d.never, deadline_passed: d.deadlinePassed, no_budget: d.noBudget, icon: g.icon || goalIcon(g.name), income_paise: g.income_paise == null ? null : g.income_paise, rent_paise: g.rent_paise == null ? null : g.rent_paise };");
rep("return db.insert('goal', { user_id: uid, name: String(g.name).trim(), cost_paise: g.cost_paise, deadline: g.deadline, free_income_paise: g.free_income_paise, active: true, created_at: iso() });", "const opt = k => (Number.isInteger(g[k]) && g[k] >= 0 ? g[k] : null);\n    return db.insert('goal', { user_id: uid, name: String(g.name).trim(), icon: g.icon || goalIcon(g.name), cost_paise: g.cost_paise, deadline: g.deadline, free_income_paise: g.free_income_paise, income_paise: opt('income_paise'), rent_paise: opt('rent_paise'), active: true, created_at: iso() });");
rep("const r = B.addSpend(c.uid, { amount_paise: b.amount_paise, category: b.category, note: b.note, spent_at: b.spent_at, source: b.source || 'chat', idempotency_key: key });\n    return [r.duplicate ? 200 : 201, { spend: B.spendView(r.spend, c.user.timezone), duplicate: r.duplicate }];",
  "const r = B.addSpend(c.uid, { amount_paise: b.amount_paise, category: b.category, note: b.note, memo: b.memo, account_id: b.account_id, spent_at: b.spent_at, source: b.source || 'chat', idempotency_key: key });\n    const aunty = (!r.duplicate && b.react !== false && B.auntyReactSpend) ? B.auntyReactSpend(c.uid, r.spend) : null;\n    return [r.duplicate ? 200 : 201, { spend: B.spendView(r.spend, c.user.timezone), duplicate: r.duplicate, aunty }];");
rep("  // ---------- chat history helpers ----------", fs.readFileSync('patch1-routes.txt', 'utf8') + "\n  // ---------- chat history helpers ----------");
rep("chat_count: db.where('chat_message', m => m.user_id === c.uid).length };", "chat_count: db.where('chat_message', m => m.user_id === c.uid).length, user_msg_count: db.where('chat_message', m => m.user_id === c.uid && m.role === 'user').length };\n    { const accs = B.accountsOf(c.uid); base.balance_paise = accs.reduce((s, a) => s + B.accountBalance(c.uid, a), 0); const lg = B.ledger(c.uid, x.today.slice(0, 7) + '-01', x.today); base.month_income_paise = lg.income_paise; base.month_expense_paise = lg.expense_paise; }");
rep("    B.startGoalFlow(u.id, true);", "    B.catsOf(u.id); B.accountsOf(u.id);\n    B.startGoalFlow(u.id, true);");
fs.writeFileSync('src/backend.js', b); console.log('patched');
