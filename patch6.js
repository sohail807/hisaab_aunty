const fs = require('fs'); let b = fs.readFileSync('src/backend.js', 'utf8');
const rep = (x, y) => { if (!b.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); b = b.replace(x, () => y); };
const swap = (s, e, text) => { const i = b.indexOf(s), j = b.indexOf(e, i + 1); if (i < 0 || j < 0) throw new Error('marker: ' + s.slice(0, 40) + ' | ' + e.slice(0, 40)); b = b.slice(0, i) + text + b.slice(j); };

// 1. goals: many or none, one combined view for "the goal"
rep("  B.goalOf = (uid) => db.find('goal', g => g.user_id === uid && g.active);", `  B.goalRows = (uid) => db.where('goal', g => g.user_id === uid && g.active).sort((x, y) => x.created_at.localeCompare(y.created_at));
  B.goalLabel = (rows) => rows.length <= 2 ? rows.map(g => g.name).join(' & ') : rows.slice(0, 2).map(g => g.name).join(', ') + ' +' + (rows.length - 2) + ' more';
  // "the goal" the rest of the server talks about: the only goal, or one combined view of several
  B.goalOf = (uid) => {
    const rows = B.goalRows(uid); if (!rows.length) return null; if (rows.length === 1) return rows[0];
    return Object.assign({}, rows[0], { name: B.goalLabel(rows), icon: '🎯', cost_paise: rows.reduce((s, g) => s + g.cost_paise, 0), deadline: rows.map(g => g.deadline).sort().pop(), count: rows.length });
  };`);
swap("  B.ctxFor = (uid) => {", "  // ----- categories (default five", `  B.ctxFor = (uid) => {
    const user = B.userById(uid), rows = B.goalRows(uid), goal = B.goalOf(uid), today = B.today(user), spends = B.calcSpends(uid, user.timezone);
    // income: what the user told us (minus rent and fixed bills); older data falls back to the first goal's free income
    let income = null; if (user.income_paise != null) income = Math.max(0, toRupees(user.income_paise) - toRupees(user.rent_paise || 0)); else if (rows[0]) income = toRupees(rows[0].free_income_paise);
    let d = null, input = null;
    if (income != null) { input = { income, today, spends, goals: rows.map(g => ({ id: g.id, name: g.name, icon: g.icon || goalIcon(g.name), cost: toRupees(g.cost_paise), deadline: g.deadline })), cost: goal ? toRupees(goal.cost_paise) : 0, deadline: goal ? goal.deadline : today }; d = derive(input); }
    return { user, goal, goals: rows, today, spends, input, d };
  };
`);
swap("  B.goalFigures = (c) => {", "  B.dayset = (uid, tz) => {", `  B.goalFigures = (c) => {
    if (!c.goal || !c.d) return null; const d = c.d, g = c.goal;
    return { name: g.name, count: c.goals.length, cost_paise: g.cost_paise, deadline: g.deadline, free_income_paise: toPaise(c.input.income), required_per_month_paise: toPaise(d.reqPerMonth), required_per_day_paise: toPaise(d.reqPerDay), eta_date: d.etaDate, delay_days: d.delayDays, on_time: d.onTime, never: d.never, deadline_passed: d.deadlinePassed, no_budget: d.noBudget, icon: g.icon || goalIcon(g.name), income_paise: c.user.income_paise != null ? c.user.income_paise : (g.income_paise == null ? null : g.income_paise), rent_paise: c.user.rent_paise != null ? c.user.rent_paise : (g.rent_paise == null ? null : g.rent_paise) };
  };
  B.goalList = (c) => c.goals.map((g, i) => { const pg = c.d.goals[i]; return { id: g.id, name: g.name, icon: g.icon || goalIcon(g.name), cost_paise: g.cost_paise, deadline: g.deadline, required_per_month_paise: toPaise(pg.req), months_left: round1(pg.monthsLeft), eta_date: pg.etaDate, delay_days: pg.delayDays, on_time: pg.onTime, never: pg.never }; });
  // the numbers behind "your daily budget", so the user can see where it comes from
  B.budgetExplainer = (c) => !c.d ? null : { income_paise: c.user.income_paise != null ? c.user.income_paise : toPaise(c.input.income), rent_paise: c.user.rent_paise || 0, saving_paise: toPaise(c.d.reqPerMonth), free_paise: toPaise(c.d.monthBudget), days_in_month: c.d.dim, daily_paise: toPaise(c.d.dailyBudget), goals: B.goalList(c).map(g => ({ name: g.name, icon: g.icon, req_paise: g.required_per_month_paise })) };
`);
// 2. goal CRUD
swap("  B.setGoal = (uid, g) => {", "  // ---------- spends ----------", `  const checkGoal = (g) => {
    if (!g.name || String(g.name).trim().length < 1 || String(g.name).length > 60) throw E.invalid('Give the goal a short name.');
    if (!Number.isInteger(g.cost_paise) || g.cost_paise <= 0) throw E.invalid('Goal cost must be more than zero.');
    if (g.free_income_paise != null && (!Number.isInteger(g.free_income_paise) || g.free_income_paise < 0)) throw E.invalid('Free income cannot be negative.');
    if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(g.deadline || '')) throw E.invalid('Deadline must be a date like 2027-02-11.');
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
    if (p.deadline !== undefined) { if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(p.deadline)) throw E.invalid('Deadline must be a date like 2027-02-11.'); patch.deadline = p.deadline; }
    db.update('goal', g, patch); return { goals: B.goalList(B.ctxFor(c.uid)) };
  });
  B.route('DELETE', '/goals/:id', async (c) => { db.update('goal', ownGoal(c), { active: false }); const x = B.ctxFor(c.uid); return { ok: true, goals: x.d ? B.goalList(x) : [] }; });

`);
// 3. income and rent on the profile
rep("    app_lock_after_seconds: v =>", "    income_paise: v => v === null || (Number.isInteger(v) && v >= 0 && v <= 1e12), rent_paise: v => v === null || (Number.isInteger(v) && v >= 0 && v <= 1e12),\n    app_lock_after_seconds: v =>");
// 4. password rules
rep("  const EMAIL_RE =", "  const pwProblem = (pw) => pw.length < 8 ? 'Password needs at least 8 characters.' : !/[A-Za-z]/.test(pw) ? 'Password needs at least one letter.' : !/\\d/.test(pw) ? 'Password needs at least one number.' : null;\n  const EMAIL_RE =");
rep("    if (String(b.password || '').length < 8) throw E.invalid('Password needs at least 8 characters.');", "    { const pp = pwProblem(String(b.password || '')); if (pp) throw E.invalid(pp); }");
rep("    if (String(b.new_password || '').length < 8) throw E.invalid('New password needs at least 8 characters.');", "    { const pp = pwProblem(String(b.new_password || '')); if (pp) throw E.invalid(pp.replace('Password', 'New password')); }");
// 5. no "first spend" insight
rep("    if (!kind) { kind = 'first_steps'; facts = {}; }", "    if (!kind) return null;   // nothing worth saying yet: show no insight card");
// 6. summary: budget without a goal, goals list, explainer
rep("has_goal: !!x.goal, goal: B.goalFigures(x),", "has_goal: !!x.goal, has_budget: !!x.d, goal: B.goalFigures(x), goals: x.d ? B.goalList(x) : [], budget_explainer: B.budgetExplainer(x),");
rep("text: 'Set a goal', on_time: null }", "text: 'Set your income', on_time: null }");
rep("fmtINR(-d.leftToday) + ' over today', on_time: d.onTime },", "fmtINR(-d.leftToday) + ' over today', on_time: x.goal ? d.onTime : null },");
// 7. history carries the chat widgets (skip, slider, buttons)
rep("meta: m.meta ? { actions: m.meta.actions, nudge_id: m.meta.nudge_id, flow: m.meta.flow } : {}", "meta: m.meta ? { actions: m.meta.actions, nudge_id: m.meta.nudge_id, flow: m.meta.flow, ui: m.meta.ui } : {}");
fs.writeFileSync('src/backend.js', b); console.log('backend patched');
