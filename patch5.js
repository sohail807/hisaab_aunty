const fs = require('fs'); let a = fs.readFileSync('src/logic.js', 'utf8');
const swap = (s, e, text) => { const i = a.indexOf(s), j = a.indexOf(e, i + 1); if (i < 0 || j < 0) throw new Error('marker: ' + s.slice(0, 40) + ' | ' + e.slice(0, 40)); a = a.slice(0, i) + text + a.slice(j); };
const rep = (x, y) => { if (!a.includes(x)) throw new Error('missing: ' + x.slice(0, 60)); a = a.replace(x, () => y); };

// ---------- derive(): any number of goals, or none ----------
swap("// s = { income, cost, deadline", "function verdict(a, d) {", `// s = { income, today, spends:[{amount, category, dk}], and either goals:[{name, cost, deadline}] or a single cost + deadline }
// With no goals the app is a plain daily budgeter: free income spread over the days of the month.
// With several goals, the monthly saving needed is the sum, and savings are shared in proportion, so an overspend
// delays every goal by the same number of days: amount / (total required per day).
function etaFor(per, projSave, reqPerMonth, today) {
  const out = per.map(g => {
    const share = projSave > 0 && reqPerMonth > 0 ? projSave * g.req / reqPerMonth : 0;
    const etaDays = share > 0 ? g.cost / share * DPM : Infinity;
    const delay = isFinite(etaDays) ? Math.round(etaDays - g.daysLeft) : null;
    return Object.assign({}, g, { share, etaDays, etaDate: isFinite(etaDays) ? addDays(today, Math.round(etaDays)) : null, delayDays: delay, never: !isFinite(etaDays), onTime: isFinite(etaDays) && delay <= ONTIME_DAYS });
  });
  return out;
}
function derive(s) {
  const today = s.today, dim = daysInMonth(today), dom = +today.slice(8);
  const gl = s.goals ? s.goals : (s.cost > 0 ? [{ name: s.name || 'Goal', cost: s.cost, deadline: s.deadline }] : []);
  const base = gl.map(g => { const daysLeft = diffDays(g.deadline, today), monthsLeft = Math.max(MIN_MONTHS, daysLeft / DPM); return Object.assign({}, g, { daysLeft, monthsLeft, req: g.cost / monthsLeft }); });
  const reqPerMonth = base.reduce((a, g) => a + g.req, 0);
  const reqPerDay = reqPerMonth / DPM;
  const first = base[0] || { daysLeft: 0, monthsLeft: 0 };
  const free = s.income - reqPerMonth;
  const dailyBudget = Math.max(0, free / dim);
  const monthBudget = Math.max(0, free);
  const sum = (fn) => s.spends.reduce((a, x) => fn(x) ? a + x.amount : a, 0);
  const spentToday = sum(x => x.dk === today);
  const leftToday = dailyBudget - spentToday;
  const weekFrom = addDays(today, -6);
  const weekTotal = sum(x => x.dk >= weekFrom && x.dk <= today);
  const weekBudget = dailyBudget * 7;
  const mp = today.slice(0, 7);
  const spentMTD = sum(x => x.dk.slice(0, 7) === mp && x.dk <= today);
  const projSpend = dom < 4 ? monthBudget : spentMTD + (spentMTD / dom) * (dim - dom);
  const projSave = s.income - projSpend;
  const hasGoals = base.length > 0;
  const goals = etaFor(base, projSave, reqPerMonth, today);
  const never = hasGoals && goals.some(g => g.never);
  const worst = goals.filter(g => !g.never).sort((x, y) => y.delayDays - x.delayDays)[0];
  const etaMonths = !hasGoals || never ? (hasGoals ? Infinity : null) : goals[0].etaDays / DPM;
  const delayDays = !hasGoals || never ? null : worst.delayDays;
  const etaDate = !hasGoals || never ? null : worst.etaDate;
  const onTime = hasGoals ? goals.every(g => g.onTime) : true;
  return {
    daysLeft: first.daysLeft, monthsLeft: first.monthsLeft, reqPerMonth, reqPerDay, free, dailyBudget, monthBudget, spentToday, leftToday,
    weekTotal, weekBudget, spentMTD, projSpend, projSave, etaMonths, etaDate, delayDays, onTime, never, hasGoals, goals,
    dom, dim, deadlinePassed: base.some(g => g.daysLeft < 0), noBudget: free <= 0,
    goalDays: x => reqPerDay > 0 ? x / reqPerDay : 0,
  };
}
// after an overspend: what to spend per day for the rest of the month to land back on plan
function recoveryPlan(d) {
  const remainingDays = d.dim - d.dom, remaining = d.monthBudget - d.spentMTD;
  const newDaily = remainingDays > 0 ? Math.max(0, remaining / remainingDays) : null;
  return { remainingDays, remaining, newDaily, normalDaily: d.dailyBudget, cutPerDay: newDaily == null ? null : Math.max(0, d.dailyBudget - newDaily) };
}
`);
// ---------- what-if for several goals ----------
swap("// what-if: kind = cut_category", "// streaks: daySet", `// what-if: kind = cut_category | extra_saving | one_off_spend
function whatIf(s, d, kind, p) {
  const today = s.today;
  let delta = 0, assumption = '';
  if (kind === 'cut_category') {
    const rate = totalIn(s.spends, addDays(today, -27), today, p.category) / 28;
    delta = rate * p.days; assumption = \`Your \${p.category} run-rate over the last 28 days is \${fmtINR(rate)}/day, so skipping it for \${p.days} days keeps about \${fmtINR(delta)}.\`;
  } else if (kind === 'extra_saving') {
    delta = p.amount; assumption = \`Saving \${fmtINR(p.amount)} more each month.\`;
  } else if (kind === 'one_off_spend') {
    delta = -p.amount; assumption = \`A one-off spend of \${fmtINR(p.amount)}.\`;
  }
  const save2 = d.projSave + delta;
  const g2 = etaFor(d.goals, save2, d.reqPerMonth, today);
  const never = g2.some(g => g.never);
  const worst = g2.filter(g => !g.never).sort((x, y) => y.delayDays - x.delayDays)[0];
  const delay2 = never || !worst ? null : worst.delayDays;
  return {
    kind, assumption, delta,
    baseline: { delay_days: d.delayDays, eta_date: d.etaDate, on_time: d.onTime },
    scenario: { delay_days: delay2, eta_date: never || !worst ? null : worst.etaDate, on_time: !never && g2.every(g => g.onTime) },
    days_changed: (d.delayDays == null || delay2 == null) ? null : d.delayDays - delay2,   // positive = reaches goal earlier
  };
}
`);
// ---------- friendlier goal naming and durations ----------
rep("t = t.replace(/^(hey|hi|hello|well|so|um|ok|okay|actually)[, ]+/i, '');", "t = t.replace(/^(hey|hi|hello|well|so|um|ok|okay|actually)[,.!\\s]+/i, '').replace(/^[.,!\\s]+/, '');");
rep("  return (t[0].toUpperCase() + t.slice(1)).slice(0, 40);\n}", `  t = t[0].toUpperCase() + t.slice(1);
  if (t.length > 40) { const cut = t.slice(0, 40); t = cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)); }
  return t;
}
// "6 months", "90 days", "2 weeks", "1.5 years" or a plain number (months) -> months, or null
function parseDuration(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/(\\d+(?:\\.\\d+)?)\\s*(day|days|d|week|weeks|wk|wks|month|months|mo|mos|year|years|yr|yrs)?\\b/);
  if (!m) return null; const n = parseFloat(m[1]); const u = m[2] || 'month';
  if (/^d/.test(u)) return n / DPM; if (/^w/.test(u)) return n * 7 / DPM; if (/^y/.test(u)) return n * 12; return n;
}`);
// logic tests
rep("  return T;\n}\nif (typeof module", `  { const mg = derive({ income: 22000, today: '2026-10-11', spends: [], goals: [{ name: 'Goa', cost: 26000, deadline: '2027-02-11' }, { name: 'Laptop', cost: 48000, deadline: '2027-08-11' }] });
    const single = derive({ income: 22000, today: '2026-10-11', spends: [], goals: [{ name: 'Goa', cost: 26000, deadline: '2027-02-11' }] });
    add('several goals: required saving is the sum of each goal', near(mg.reqPerMonth, 6433.94 + 48000 / (303 / DPM)) && mg.goals.length === 2 && near(single.reqPerMonth, 6433.94), mg.reqPerMonth.toFixed(2));
    add('several goals: one goal gives the same numbers as before', near(single.dailyBudget, 502.13) && single.onTime && single.goals.length === 1);
    add('several goals: an overspend costs every goal the same number of days', near(mg.goalDays(500), 500 / mg.reqPerDay) && mg.goalDays(500) < d.goalDays(500));
    const mgSpend = derive({ income: 22000, today: '2026-10-20', spends: [{ amount: 9000, category: 'food', dk: '2026-10-15' }], goals: [{ name: 'Goa', cost: 26000, deadline: '2027-02-11' }, { name: 'Laptop', cost: 48000, deadline: '2027-08-11' }] });
    add('several goals: heavy spending pushes both goals late with their own status', mgSpend.goals.length === 2 && mgSpend.goals.every(g => g.delayDays == null || g.delayDays > 0) && !mgSpend.onTime, JSON.stringify(mgSpend.goals.map(g => g.delayDays)));
    const none = derive({ income: 31000, today: '2026-10-11', spends: [{ amount: 400, category: 'food', dk: '2026-10-11' }] });
    add('no goal: a plain daily budget of income / days in month', near(none.dailyBudget, 1000) && near(none.leftToday, 600) && none.reqPerMonth === 0 && none.goalDays(500) === 0 && none.onTime && !none.hasGoals, none.dailyBudget);
    const rp = recoveryPlan(derive({ income: 31000, today: '2026-10-11', spends: [{ amount: 5000, category: 'food', dk: '2026-10-11' }] }));
    add('recovery plan after an overspend: remaining month budget spread over remaining days', rp.remainingDays === 20 && near(rp.newDaily, (31000 - 5000) / 20) && rp.cutPerDay > 0, JSON.stringify(rp));
    add('durations: months, days, weeks, years, plain number', near(parseDuration('6 months'), 6) && near(parseDuration('90 days'), 90 / DPM) && near(parseDuration('2 weeks'), 14 / DPM) && near(parseDuration('1.5 years'), 18) && near(parseDuration('4.04'), 4.04) && parseDuration('soon') === null);
    add('goal naming: "Hey.. Am saving for my visa finane for dubai"', cleanGoalName('Hey.. Am saving for my visa finane for dubai') === 'Visa finane for dubai', cleanGoalName('Hey.. Am saving for my visa finane for dubai'));
  }
  return T;
}
if (typeof module`);
fs.writeFileSync('src/logic.js', a); console.log('logic patched');
