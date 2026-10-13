const fs = require('fs'); let a = fs.readFileSync('src/aunty.js', 'utf8');
const rep = (x, y) => { if (!a.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); a = a.replace(x, () => y); };
const swap = (s, e, text) => { const i = a.indexOf(s), j = a.indexOf(e, i + 1); if (i < 0 || j < 0) throw new Error('marker: ' + s.slice(0, 40) + ' | ' + e.slice(0, 40)); a = a.slice(0, i) + text + a.slice(j); };

// ---------- 1. onboarding: income first (daily budget), optional extras, then goals (optional, as many as you like) ----------
swap("  const Q = {", "  // ---------- tools (all run", `  const Q = {
    income: 'Let us start simple: what is your monthly income? Salary or allowance is fine. It is how I work out the number you can spend each day.',
    balance: 'Optional: how much is in your bank account right now?',
    rent: 'Optional: your monthly rent or other fixed bills?',
    food: 'Optional: roughly how much do you spend on food each month? I will use it as your food limit, and you can change it any time.',
    goal: 'Are you saving for something? Tell me in your own words, like "my wedding" or "Goa trip". Or skip it and I will just track your daily spending.',
    cost: 'Got it. Do you have an estimated budget you wish to save for it? A rough number is fine, like 26k.',
    months: 'By when would you like to reach it? Slide to pick, in days or months.',
  };
  const FULL = ['income', 'balance', 'rent', 'food', 'goal', 'cost', 'months'], GOAL_ONLY = ['goal', 'cost', 'months'], OPTIONAL = ['balance', 'rent', 'food', 'goal'];
  const uiFor = (step) => step === 'goal' ? { type: 'skip', label: 'Skip, just track daily spending', text: 'skip' } : OPTIONAL.includes(step) ? { type: 'skip', label: 'Skip', text: 'skip' } : step === 'months' ? { type: 'slider' } : null;
  const GREET = (n) => \`Namaste \${n}! I am Hisaab Aunty, and I turn "where did my money go?" into "oh, so that is where."\`;
  B.startGoalFlow = (uid, first, opts) => {
    const u = B.userById(uid), mode = first ? 'full' : 'goal'; db.update('app_user', u, { flow: { mode, step: FULL[0] === 'income' && first ? 'income' : 'goal', tries: 0, data: {}, replace: !!(opts && opts.replace) } });
    if (first) { B.addAunty(uid, GREET(u.display_name.split(' ')[0]), 'happy', { tpl: 'greet', flow: 'greet' }); B.addAunty(uid, Q.income, 'neutral', { flow: 'income' }); }
    else { B.addAunty(uid, opts && opts.replace ? 'Chalo, let us redo your goal. Type "cancel" any time to keep the old one.' : 'Chalo, another goal! Type "cancel" any time to stop.', 'happy', { flow: 'goal' }); B.addAunty(uid, Q.goal.split(' Or skip')[0], 'neutral', { flow: 'goal', ui: { type: 'skip', label: 'Never mind', text: 'cancel' } }); }
  };
  function handleFlow(uid, text) {
    const u = B.userById(uid), f = u.flow, t = text.trim(); const steps = f.mode === 'full' ? FULL : GOAL_ONLY;
    const retry = (msg) => { f.tries++; db.update('app_user', u, { flow: f }); return { text: msg + ' ' + Q[f.step], mood: 'neutral', ui: uiFor(f.step) }; };
    if (/^\\s*(cancel|stop|nevermind|never mind)\\s*$/i.test(t)) { db.update('app_user', u, { flow: null }); return { text: 'No problem, nothing changed. Ask me anything when you are ready.', mood: 'neutral' }; }
    const skipped = OPTIONAL.includes(f.step) && /^\\s*(skip|no|none|nahi|na|later|not sure|-)\\s*$/i.test(t);
    let ack = '';
    if (f.step === 'income') { const x = parseAmount(t); if (x == null || x <= 0 || x > 1e8) return retry('I could not read that amount.'); f.data.income = x; }
    else if (f.step === 'goal') {
      if (skipped) f.data.noGoal = true;
      else { if (!t || t.length > 140) return retry('A short description please.'); f.data.name = cleanGoalName(t); f.data.icon = goalIcon(f.data.name); ack = \`\${f.data.icon} \${f.data.name}. \`; }
    }
    else if (f.step === 'cost') { const x = parseAmount(t); if (!x || x <= 0 || x > 1e8) return retry('I could not read that amount.'); f.data.cost = x; }
    else if (f.step === 'months') { const m = parseDuration(t); if (m == null || !(m >= 0.25) || m > 600) return retry('Pick a duration of at least a week, like 6 months or 90 days.'); f.data.months = m; }
    else if (skipped) f.data[f.step] = null;
    else { const x = parseAmount(t); if (x == null || x < 0 || x > 1e9) return retry('I could not read that amount, or tap skip.'); f.data[f.step] = x; }
    let next = steps[steps.indexOf(f.step) + 1]; if (f.step === 'goal' && f.data.noGoal) next = null;
    if (next) { f.step = next; f.tries = 0; db.update('app_user', u, { flow: f }); return { text: ack + Q[next], mood: 'neutral', ui: uiFor(next) }; }
    // all answered: save income and extras, then the goal (if any)
    const d0 = f.data, today = B.today(u), patch = {};
    if (f.mode === 'full') { patch.income_paise = toPaise(d0.income); patch.rent_paise = d0.rent != null ? toPaise(d0.rent) : null; db.update('app_user', u, patch); }
    const extra = [];
    if (f.mode === 'full') {
      if (d0.balance != null) { const acc = B.accountsOf(uid)[0]; const cur = B.accountBalance(uid, acc); db.update('account', acc, { opening_paise: acc.opening_paise + (toPaise(d0.balance) - cur) }); extra.push(\`Your account shows \${R(d0.balance)}.\`); }
      if (d0.food) { const fc = B.catsOf(uid).find(x => x.slug === 'food'); db.update('category', fc, { limit_paise: toPaise(d0.food) }); extra.push(\`Food limit set to \${R(d0.food)} a month.\`); }
    }
    let deadline = null;
    if (!d0.noGoal) {
      deadline = monthsToDeadline(today, d0.months); const uu = B.userById(uid);
      const free = uu.income_paise != null ? Math.max(0, uu.income_paise - (uu.rent_paise || 0)) : 0;
      const g = { name: d0.name, icon: d0.icon, cost_paise: toPaise(d0.cost), deadline, free_income_paise: free, income_paise: uu.income_paise, rent_paise: uu.rent_paise };
      if (f.replace) B.setGoal(uid, g); else B.addGoal(uid, g);
    }
    db.update('app_user', u, { flow: null });
    const c = B.ctxFor(uid), d = c.d, rentNow = B.userById(uid).rent_paise ? toRupees(B.userById(uid).rent_paise) : 0, incomeNow = B.userById(uid).income_paise != null ? toRupees(B.userById(uid).income_paise) : d.free;
    const how = \`Here is where your daily number comes from: your \${R(incomeNow)} income\${rentNow ? ', minus ' + R(rentNow) + ' rent' : ''}\${d.reqPerMonth > 0 ? ', minus ' + R(d.reqPerMonth) + ' for your goals' : ''}, spread over \${d.dim} days of this month.\`;
    if (rentNow) extra.unshift(\`Rent \${R(rentNow)} is set aside, so your free income is \${R(incomeNow - rentNow)}.\`);
    let head, ui = null;
    if (d0.noGoal) head = \`All set! That gives you \${R(d.dailyBudget)} a day to spend. \${how} Tell me what you spend and I will keep score. You can add a goal any time.\`;
    else if (d.noBudget) head = \`\${d0.icon} Goal saved: \${d0.name}, \${R(d0.cost)} by \${fmtDate(deadline)}. Honest heads-up: your goals need \${R(d.reqPerMonth)} a month, which is more than your \${R(d.free + d.reqPerMonth)} free income, so the daily budget is \${R(0)}. A longer deadline would make this doable.\`;
    else if (c.goals.length > 1) head = \`\${d0.icon} Added \${d0.name}: \${R(d0.cost)} by \${fmtDate(deadline)}. Together your \${c.goals.length} goals need \${R(d.reqPerMonth)} a month (\${R(d.reqPerDay)} a day), which leaves \${R(d.dailyBudget)} a day to spend. Every spend now counts against all of them.\`;
    else head = \`\${d0.icon} Done! \${d0.name}: \${R(d0.cost)} by \${fmtDate(deadline)}. You need to save \${R(d.reqPerMonth)} a month (\${R(d.reqPerDay)} a day), which leaves \${R(d.dailyBudget)} a day to spend. \${how}\`;
    if (!d0.noGoal && !d.noBudget) ui = { type: 'buttons', options: [{ label: 'Add another goal', text: 'add another goal' }, { label: 'That is all', text: 'that is all' }] };
    return { text: head + (extra.length ? ' ' + extra.join(' ') : '') + (d0.noGoal || d.noBudget ? '' : ' Tell me what you spend and I will keep score.'), mood: d.noBudget ? 'neutral' : 'happy', actions: [{ type: 'goal_updated' }], navigate: ui ? null : 'spend', ui };
  }

`);
// ---------- 2. tools: no goal, several goals ----------
rep("const goalBits = (c) => c.d ? {", "const goalBits = (c) => c.d && c.goal ? {");
rep("remaining_inr: v.verdict === 'no' ? 0 : r2(c.d.leftToday - i.amount_inr), over_by_inr: r2(v.over), goal_days_cost: round1(v.goalDays), goal_name: c.goal.name });", "remaining_inr: v.verdict === 'no' ? 0 : r2(c.d.leftToday - i.amount_inr), over_by_inr: r2(v.over), goal_days_cost: round1(v.goalDays), goal_name: c.goal ? c.goal.name : null });");
rep("      const c = B.ctxFor(uid); if (!c.d) return { error: 'no_goal' }; const d = c.d;\n      const base = Object.assign({ period }, goalBits(c));", "      const c = B.ctxFor(uid); if (!c.d || (period === 'goal' && !c.goal)) return { error: 'no_goal' }; const d = c.d;\n      const base = Object.assign({ period }, goalBits(c));");
rep("      const c = B.ctxFor(uid); if (!c.d) return { error: 'no_goal' };\n      if (i.kind === 'cut_category')", "      const c = B.ctxFor(uid); if (!c.d || !c.goal) return { error: 'no_goal' };\n      if (i.kind === 'cut_category')");
rep("need(CATS.includes(i.category) && i.days > 0", "need(B.catsOf(uid).some(x => x.slug === i.category) && i.days > 0");
swap("    get_goal_details(uid) {", "    get_streak(uid) {", `    get_goal_details(uid) {
      const c = B.ctxFor(uid); if (!c.d) return { error: 'no_goal' }; const d = c.d, u = c.user;
      const gross = u.income_paise != null ? toRupees(u.income_paise) : d.free + d.reqPerMonth, rent = u.rent_paise ? toRupees(u.rent_paise) : 0;
      const list = c.goals.map((g, i) => ({ name: g.name, cost_inr: r2(toRupees(g.cost_paise)), deadline: g.deadline, required_per_month_inr: r2(d.goals[i].req), delay_days: d.goals[i].delayDays, on_time: d.goals[i].onTime }));
      return { goal_name: c.goal ? c.goal.name : null, goal_count: c.goals.length, goals: list, cost_inr: c.goal ? r2(toRupees(c.goal.cost_paise)) : null, deadline: c.goal ? c.goal.deadline : null, months_left: round1(d.monthsLeft), gross_income_inr: r2(gross), rent_inr: r2(rent), income_inr: r2(d.free + d.reqPerMonth), required_per_month_inr: r2(d.reqPerMonth), required_per_day_inr: r2(d.reqPerDay), left_after_saving_inr: r2(d.free), daily_budget_inr: r2(d.dailyBudget), days_in_month: d.dim, eta_date: d.etaDate, delay_days: d.delayDays, on_time: d.onTime, never: d.never, explanation: { required_per_month: 'goal cost divided by months left, added up across goals', daily_budget: '(free income minus required saving) divided by days in this month', eta: 'projected from this month\\'s spending pace; on time if at most 3 days late' } };
    },
`);
// the spend result also carries what the "fuming" reaction needs
rep("serious: !!(c.d && amt > 3 * c.d.dailyBudget && c.d.dailyBudget > 0), goal_days_cost: c.d ? round1(c.d.goalDays(amt)) : null, cat_limit_inr: null };", "serious: !!(c.d && amt > 3 * c.d.dailyBudget && c.d.dailyBudget > 0), goal_days_cost: c.d ? round1(c.d.goalDays(amt)) : null, cat_limit_inr: null };\n    if (c.d) { const rp = recoveryPlan(c.d); out.recovery = { remaining_days: rp.remainingDays, new_daily_inr: rp.newDaily == null ? null : r2(rp.newDaily), normal_daily_inr: r2(rp.normalDaily), cut_per_day_inr: rp.cutPerDay == null ? null : r2(rp.cutPerDay) }; }");
// ---------- 3. context block ----------
swap("    if (c.d) {\n      const d = c.d;", "    } else lines.push('goal: none yet (setup not finished)');", `    if (c.d) {
      const d = c.d;
      lines.push(c.goal ? \`goals (\${c.goals.length}): \${c.goal.name}, total cost \${R(c.goal.cost_paise / 100)}, last deadline \${c.goal.deadline}\` : 'goals: none (daily budgeting only)', \`daily_budget: \${R(d.dailyBudget)}\`, \`spent_today: \${R(d.spentToday)}\`, \`left_today: \${d.leftToday >= 0 ? R(d.leftToday) : 'over by ' + R(-d.leftToday)}\`);
      if (c.goal) lines.push(\`goal_status: \${d.never ? 'never at this pace' : d.onTime ? 'on time' : 'late'}\${d.never ? '' : ' (delay ' + d.delayDays + ' days; negative is ahead)'}\`);
`);
// ---------- 4. planner: add another goal, replace, that is all ----------
rep("    if (/\\b(change|set|new|edit|update|start)\\b.{0,25}\\bgoal\\b|\\bgoal\\b.{0,20}\\b(change|set up|setup|new)\\b|change my goal/.test(t) && !/(explain|maths|math)/.test(t)) return S('goal_setup');", "    if (/^(that('| i)?s all|that is all|no more|all good|nothing else|i am done|i'm done)\\b/.test(t)) return S('smalltalk', { done: true });\n    if (/\\b(add|another|new|second|one more|more|set|set up|start)\\b.{0,25}\\bgoals?\\b|\\bgoals?\\b.{0,20}\\b(change|set up|setup|new|add)\\b|change my goal|\\b(change|edit|update|replace)\\b.{0,20}\\bgoals?\\b/.test(t) && !/(explain|maths|math|how (much|many)|what)/.test(t)) return S('goal_setup', { replace: /\\b(change|edit|update|replace)\\b/.test(t) && c.goals.length <= 1 });");
rep("if (!c.d && !/^(hi|hello|namaste|hey)\\b/.test(t) && !/(goal|are you|ai\\b|safe|export|delete|help|how does|what is)/.test(t)) return S('no_goal');", "if (!c.d && !/^(hi|hello|namaste|hey)\\b/.test(t) && !/(goal|are you|ai\\b|safe|export|delete|help|how does|what is)/.test(t)) return S('no_goal');");
rep("B.startGoalFlow(uid, false); B.lastTrace", "B.startGoalFlow(uid, false, { replace: plan.replace }); B.lastTrace");
// ---------- 5. compose: smalltalk done, no-goal wording, goal explain with several goals, the fuming reaction ----------
rep("case 'smalltalk': return { text: plan.thanks ?", "case 'smalltalk': return { text: plan.done ? 'Perfect. Tell me what you spend and I will keep score.' : plan.thanks ?");
rep("case 'no_goal': return { text: 'Let us set your goal first so I can do the maths properly. Say \"set my goal\" whenever you are ready.', mood: 'neutral' };", "case 'no_goal': return { text: 'Tell me your monthly income first so I can work out your daily number. Just type it, like 40k.', mood: 'neutral' };");
// log: calm only for emergencies and bills; big discretionary overspend gets the fuming reaction
rep("const parts = []; const seriousSpend = ok.some(r => r.serious) || plan.serious;\n        if (!c.d) return { text: `Logged ${R(total)}. Set a goal and I will show you what spends cost in days.`, mood: 'neutral', actions: ok.map(r => ({ type: 'spend_logged', spend_id: r.spend_id })) };", "const hasGoal = !!c.goal; const seriousSpend = !!plan.serious || ok.some(r => r.category === 'other' && OTHER_OK.test(r.note || ''));\n        if (!c.d) return { text: `Logged ${R(total)}. Tell me your monthly income and I will show you what is left each day.`, mood: 'neutral', actions: ok.map(r => ({ type: 'spend_logged', spend_id: r.spend_id })) };");
rep("const gd = round1(total / c.d.reqPerDay);\n        let text, mood;", "const gd = round1(c.d.goalDays(total));\n        let text, mood, popup = null;\n        const rec = last.recovery; const fume = single && !seriousSpend && last.over_today && last.daily_budget_inr > 0 && last.amount_inr > 1.5 * last.daily_budget_inr;");
rep("        else if (!single) { text = `Logged ${ok.length} spends", "        else if (fume) {\n          const planTxt = rec && rec.remaining_days > 0 ? (rec.new_daily_inr > 0 ? `New plan: keep to ${R(rec.new_daily_inr)} a day for the next ${rec.remaining_days} days, instead of ${R(rec.normal_daily_inr)}.` : `There is no room left this month, so keep spending to the essentials.`) : 'Tomorrow starts a fresh month, so we reset then.';\n          text = `${lead('oops', R(last.amount_inr) + ' on ' + lbl(last) + '?!')}${when} That is ${R(-last.left_today_inr)} over today${hasGoal ? ', and it costs ' + daysTxt(gd) + ' of ' + gname : ''}.\\n\\n${planTxt}`; mood = 'shock';\n          popup = { mood: 'shock', title: `${R(last.amount_inr)} on ${lbl(last)}?!`, line: hasGoal ? `That one purchase pushes ${gname} back by ${daysTxt(gd)}.` : 'That is a lot more than your daily number.', stats: [{ k: 'Over today by', v: R(-last.left_today_inr) }].concat(hasGoal ? [{ k: 'Goal cost', v: daysTxt(gd) + ' of ' + gname }] : []).concat(rec && rec.remaining_days > 0 && rec.new_daily_inr != null ? [{ k: 'New daily plan', v: rec.new_daily_inr > 0 ? R(rec.new_daily_inr) + ' for ' + rec.remaining_days + ' days' : 'essentials only' }] : []), spend_id: last.spend_id };\n        }\n        else if (!single) { text = `Logged ${ok.length} spends");
// no-goal variants of the ordinary reactions
rep("          text = choose('log_' + last.category, J[last.category] || J.other);", "          const NG = { food: [`${lead('oops', R(last.amount_inr) + ' on ' + lbl(last))}${when}. The delivery guy knows your door better than your neighbours do. ${leftTxt}`], chai: J.chai, ride: J.ride, shop: [`${R(last.amount_inr)} on ${lbl(last)}${when}. Your cart had a good day. ${leftTxt}`], other: J.other };\n          text = choose('log_' + last.category + (hasGoal ? '' : '_ng'), (hasGoal ? J : NG)[last.category] || J.other);");
rep("        return { text, mood, actions: ok.map(r => ({ type: 'spend_logged', spend_id: r.spend_id, amount_inr: r.amount_inr, note: lbl(r) })) };\n      }\n      case 'check': {", "        return { text, mood, popup, actions: ok.map(r => ({ type: 'spend_logged', spend_id: r.spend_id, amount_inr: r.amount_inr, note: lbl(r) })) };\n      }\n      case 'check': {");
rep("which costs ${daysTxt(r.goal_days_cost)} of ${r.goal_name}. Sleep on it?`", "${r.goal_name ? 'which costs ' + daysTxt(r.goal_days_cost) + ' of ' + r.goal_name + '. ' : ''}Sleep on it?`");
rep("const gname = c.goal ? c.goal.name : 'your goal';", "const gname = c.goal ? c.goal.name : 'your goals';");
swap("      case 'goal_explain': {", "      case 'whatif': {", `      case 'goal_explain': {
        const r = results[0]; if (r.error) return { text: 'Tell me your monthly income first and I will walk you through the maths.', mood: 'neutral' };
        const rent = r.rent_inr > 0 ? \` Rent \${R(r.rent_inr)} is already taken out of your \${R(r.gross_income_inr)} income.\` : '';
        if (!r.goal_count) return { text: \`You have no goal yet, so your whole free income of \${R(r.income_inr)} is yours to spend. Spread over \${r.days_in_month} days that is \${R(r.daily_budget_inr)} a day.\${rent}\`, mood: 'neutral', explain: true };
        const multi = r.goal_count > 1;
        return { text: \`\${multi ? 'Your ' + r.goal_count + ' goals (' + r.goals.map(x => x.name + ' ' + R(x.required_per_month_inr) + ' a month').join(', ') + ') together need ' + R(r.required_per_month_inr) + ' a month, or ' + R(r.required_per_day_inr) + ' a day.' : r.goal_name + ' costs ' + R(r.cost_inr) + ' and is due ' + fmtDate(r.deadline) + ', about ' + r.months_left + ' months away. Cost divided by months gives ' + R(r.required_per_month_inr) + ' to save each month, or ' + R(r.required_per_day_inr) + ' a day.'} Your free income \${R(r.income_inr)} minus that leaves \${R(r.left_after_saving_inr)}, which is \${R(r.daily_budget_inr)} a day to spend.\${rent} \${r.never ? 'At this pace the goal is not reachable.' : r.on_time ? \`At your current pace you reach \${multi ? 'them' : 'it'} \${r.delay_days < 0 ? daysTxt(r.delay_days) + ' early' : 'on time'}.\` : \`At your current pace you reach \${multi ? 'the slowest' : 'it'} \${daysTxt(r.delay_days)} late.\`}\`, mood: r.on_time ? 'happy' : 'judge', explain: true };
      }
`);
// reaction text and popups travel with the reply
rep("    return reactText(uid, out.text.replace(/\\n\\n/g, ' '), [res], out.mood, out.actions);", "    const rt = reactText(uid, out.text.replace(/\\n\\n/g, ' '), [res], out.mood, out.actions); if (out.popup) rt.popup = out.popup; return rt;");
rep("const text = c.d ? `${cap(touch(u, 'go')", "const text = c.goal ? `${cap(touch(u, 'go')");
rep("return { replies, actions, summary_changed: mutated, tpl: turn.tpl, mood: parsed.mood };", "return { replies, actions, summary_changed: mutated, tpl: turn.tpl, mood: parsed.mood, popup: out.popup || null };");
// chat widgets are stored with the reply so a reload shows the same slider or skip button
rep("resp = { replies: [{ text: r.text, mood: r.mood }], actions: r.actions || [], summary_changed: !!r.actions, navigate: r.navigate || null, mood: r.mood };", "resp = { replies: [{ text: r.text, mood: r.mood }], actions: r.actions || [], summary_changed: !!r.actions, navigate: r.navigate || null, mood: r.mood, ui: r.ui || null };");
rep("tpl: resp.tpl, flow: inFlow || undefined } : { actions: [], flow: inFlow || undefined }));", "tpl: resp.tpl, flow: inFlow || undefined, ui: resp.ui || undefined } : { actions: [], flow: inFlow || undefined }));");
// system prompt: the app is not only for saving
rep("- If the user wants to set or change their goal, reply with exactly: [goal_setup]", "- Goals are optional and there can be several. If the user wants to add, set or change a goal, reply with exactly: [goal_setup]. Without goals you are a daily budgeting coach: income minus bills, spread over the days of the month.");
rep("if (extra.length) text += '\\n\\n' + extra.join(' ');", "if (extra.length) text += (fume ? ' ' : '\\n\\n') + extra.join(' ');");
fs.writeFileSync('src/aunty.js', a); console.log('aunty patched');
