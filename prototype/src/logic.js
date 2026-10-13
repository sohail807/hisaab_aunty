// ==LOGIC==
// Hisaab Aunty money logic. Pure functions, no I/O. Lift this block into packages/core.
// Amounts here are rupees (numbers). The database stores integer paise; conversion happens in the backend.
const DPM = 30.4375;          // days per month used for goal maths
const MIN_MONTHS = 0.25;      // so a goal due tomorrow does not divide by zero
const ONTIME_DAYS = 3;        // on time when projected delay <= 3 days
const CATS = ['food', 'chai', 'ride', 'shop', 'other'];
const CAT_LABEL = { food: 'Food delivery', chai: 'Chai & coffee', ride: 'Auto & cab', shop: 'Shopping', other: 'Other' };

// ---------- formatting ----------
function groupIN(intStr) {
  const last3 = intStr.slice(-3), rest = intStr.slice(0, -3);
  return rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;
}
function fmtINR(n, dec) {
  n = Number(n); const neg = n < 0; n = Math.abs(n);
  const s = dec ? n.toFixed(dec) : String(Math.round(n));
  const [i, d] = s.split('.');
  return (neg ? '-' : '') + '₹' + groupIN(i) + (d ? '.' + d : '');
}
const round1 = x => Math.round(x * 10) / 10;
const daysTxt = x => { const r = round1(Math.abs(x)); return (r === 1 ? '1 day' : r + ' days'); };
const toPaise = r => Math.round(r * 100);
const toRupees = p => p / 100;

// ---------- dates (all "day keys" are YYYY-MM-DD in the user's timezone) ----------
function dayKey(ms, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ms);
}
const dkToDays = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
const daysToDk = n => new Date(Math.round(n) * 86400000).toISOString().slice(0, 10);
const addDays = (k, n) => daysToDk(dkToDays(k) + n);
const diffDays = (a, b) => dkToDays(a) - dkToDays(b);
const daysInMonth = k => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
const dow = k => new Date(dkToDays(k) * 86400000).getUTCDay();            // 0 = Sunday
const weekStartMon = k => addDays(k, -((dow(k) + 6) % 7));
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
function tzOffsetMin(tz, ms) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(ms);
  const g = {}; parts.forEach(p => g[p.type] = p.value);
  const asUTC = Date.UTC(+g.year, +g.month - 1, +g.day, +g.hour, +g.minute, +g.second);
  return Math.round((asUTC - Math.floor(ms / 1000) * 1000) / 60000);
}
function localToMs(dk, hh, mm, tz) {
  const [y, m, d] = dk.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  return guess - tzOffsetMin(tz || 'Asia/Kolkata', guess) * 60000;
}
function hmOf(ms, tz) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
}
const hmToMin = hm => { const [h, m] = hm.split(':').map(Number); return h * 60 + m; };
function inQuietHours(hm, start, end) {   // handles ranges that cross midnight (22:00 to 08:00)
  const t = hmToMin(hm), s = hmToMin(start), e = hmToMin(end);
  return s <= e ? (t >= s && t < e) : (t >= s || t < e);
}
const monthsToDeadline = (today, months) => addDays(today, Math.round(months * DPM));

// ---------- the core calculations ----------
// s = { income, today, spends:[{amount, category, dk}], and either goals:[{name, cost, deadline}] or a single cost + deadline }
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
function verdict(a, d) {
  const left = d.leftToday;
  if (a <= 0.7 * left) return { verdict: 'yes', over: 0, goalDays: 0 };
  if (a <= left) return { verdict: 'meh', over: 0, goalDays: 0 };
  const over = a - Math.max(left, 0);
  return { verdict: 'no', over, goalDays: d.goalDays(over) };
}

// ---------- spend parsing (used before the AI, and as the fallback after) ----------
const AMT_RE = /(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)\s*(k|lakh|lacs?|lac|l)?(?![a-z0-9])/ig;
function findAmounts(text) {
  const out = []; let m; AMT_RE.lastIndex = 0;
  while ((m = AMT_RE.exec(text))) {
    let v = parseFloat(m[1].replace(/,/g, ''));
    const suf = (m[2] || '').toLowerCase();
    if (suf === 'k') v *= 1000; else if (suf) v *= 100000;
    out.push({ value: v, index: m.index, end: m.index + m[0].length, raw: m[0] });
  }
  return out;
}
function parseAmount(text) { const a = findAmounts(text); return a.length ? a[0].value : null; }
const CAT_WORDS = [
  ['food', 'swiggy|zomato|eatsure|pizza|dominos|burger|kfc|mcd|biryani|food|lunch|dinner|order|delivery'],
  ['chai', 'chai|tea|coffee|cafe|starbucks|chaayos|barista|ccd'],
  ['ride', 'auto|cab|uber|ola|rapido|metro|petrol|fuel|bus|train'],
  ['shop', 'blinkit|zepto|instamart|amazon|flipkart|myntra|ajio|nykaa|meesho|shoes|shirt|kurta|shopping|clothes'],
];
function guessCat(text) {
  for (const [c, words] of CAT_WORDS) if (new RegExp('\\b(?:' + words + ')\\b', 'i').test(text)) return c;
  return 'other';
}
const FILLER = /\b(spent|spend|paid|pay|gave|give|sent|send|bought|buy|for|on|to|ko|rs|rupees|rupee|inr|just|only|a|an|the|my|me|i|ka|ki|ke|kal|aaj|yesterday|today|parso|of|at|from|last|ago|please|pls|diye|diya|dediye|dedo|de|gaye|gaya|gayi|gya|lag|lage|laga|udaye|udaya|kharch|kiya|kiye|hua|hue|dala|daala|liya|liye|mein|pe|par|se|ne|tha|thi|hai|phook|yaar|bhai|plz|aunty|na)\b|₹/ig;
function noteFrom(seg) {
  let t = seg.replace(AMT_RE, ' ').replace(FILLER, ' ').replace(/\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?\b/ig, ' ');
  t = t.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.split(' ').slice(0, 4).join(' ');
}
const WORD_NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, ek: 1, do: 2, teen: 3, char: 4, paanch: 5, a: 1, couple: 2 };
function parseCount(text) {
  const m = text.match(/\b(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|ek|teen|char|paanch|a couple of)\s*(day|days|din|week|weeks|hafta|haftey|month|months)\b/i);
  if (!m) return null;
  const n = isNaN(m[1]) ? (WORD_NUM[m[1].toLowerCase().replace('a couple of', 'couple')] || 1) : parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mult = /^(week|hafta)/.test(unit) ? 7 : /^month/.test(unit) ? 30 : 1;
  return { n, days: Math.round(n * mult) };
}
// returns a day key or null if the message names no date
function parseWhen(text, today) {
  const t = text.toLowerCase();
  if (/\b(parso|day before yesterday)\b/.test(t)) return addDays(today, -2);
  if (/\b(kal|yesterday)\b/.test(t)) return addDays(today, -1);
  if (/\b(aaj|today)\b/.test(t)) return today;
  const wd = t.match(/\blast\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (wd) { const target = WEEKDAYS.indexOf(wd[1]); const delta = ((dow(today) - target + 7) % 7) || 7; return addDays(today, -delta); }
  const dm = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/);
  if (dm) {
    const mi = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(dm[2]);
    let y = +today.slice(0, 4); let k = `${y}-${String(mi + 1).padStart(2, '0')}-${String(+dm[1]).padStart(2, '0')}`;
    if (k > today) k = `${y - 1}-${k.slice(5)}`;
    return k;
  }
  return null;
}
// the prototype's route(): the basic parser used as fallback when the AI is down
function route(text) {
  const t = text.toLowerCase().trim();
  if (/\b(undo|delete last|oops)\b/.test(t)) return { intent: 'undo' };
  if (/\breset\b/.test(t)) return { intent: 'reset' };
  if (/\b(set|change|new)\b.*\bgoal\b/.test(t)) return { intent: 'goal' };
  if (/how am i doing|on track|status/.test(t)) return { intent: 'status' };
  const amount = parseAmount(t);
  if (amount != null && amount > 0 && (/\?|can i|should i|afford|worth it/.test(t))) return { intent: 'check', amount, label: noteFrom(text) };
  if (amount != null && amount > 0) return { intent: 'spend', amount, category: guessCat(t), note: noteFrom(text) || guessCat(t) };
  return { intent: 'help' };
}

// ---------- queries over a list of spends [{amount, category, dk}] ----------
const inRange = (x, from, to) => x.dk >= from && x.dk <= to;
function totalIn(spends, from, to, cat) { return spends.reduce((a, x) => inRange(x, from, to) && (!cat || x.category === cat) ? a + x.amount : a, 0); }
function breakdown(spends, from, to) {
  const m = {};
  spends.forEach(x => { if (inRange(x, from, to)) { m[x.category] = m[x.category] || { category: x.category, total: 0, count: 0 }; m[x.category].total += x.amount; m[x.category].count++; } });
  return Object.values(m).sort((a, b) => b.total - a.total);
}
function comparePeriods(spends, aFrom, aTo, bFrom, bTo) {
  const A = breakdown(spends, aFrom, aTo), B = breakdown(spends, bFrom, bTo);
  const cats = new Set([...A.map(x => x.category), ...B.map(x => x.category)]);
  const rows = [...cats].map(c => {
    const a = (A.find(x => x.category === c) || { total: 0 }).total, b = (B.find(x => x.category === c) || { total: 0 }).total;
    return { category: c, a, b, diff: a - b };
  }).sort((x, y) => y.diff - x.diff);
  const ta = rows.reduce((s, r) => s + r.a, 0), tb = rows.reduce((s, r) => s + r.b, 0);
  return { rows, totalA: ta, totalB: tb, diff: ta - tb, biggestGrowth: rows.length && rows[0].diff > 0 ? rows[0] : null, biggestDrop: rows.length && rows[rows.length - 1].diff < 0 ? rows[rows.length - 1] : null };
}
// what-if: kind = cut_category | extra_saving | one_off_spend
function whatIf(s, d, kind, p) {
  const today = s.today;
  let delta = 0, assumption = '';
  if (kind === 'cut_category') {
    const rate = totalIn(s.spends, addDays(today, -27), today, p.category) / 28;
    delta = rate * p.days; assumption = `Your ${p.category} run-rate over the last 28 days is ${fmtINR(rate)}/day, so skipping it for ${p.days} days keeps about ${fmtINR(delta)}.`;
  } else if (kind === 'extra_saving') {
    delta = p.amount; assumption = `Saving ${fmtINR(p.amount)} more each month.`;
  } else if (kind === 'one_off_spend') {
    delta = -p.amount; assumption = `A one-off spend of ${fmtINR(p.amount)}.`;
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
// streaks: daySet holds days with a spend or a "nothing spent" check-in
function streakInfo(daySet, spendDays, today, createdDk) {
  let cur = 0, d = daySet.has(today) ? today : addDays(today, -1);
  while (daySet.has(d)) { cur++; d = addDays(d, -1); }
  const sorted = [...daySet].sort(); let best = 0, run = 0, prev = null;
  sorted.forEach(k => { run = (prev && diffDays(k, prev) === 1) ? run + 1 : 1; best = Math.max(best, run); prev = k; });
  const start = [today.slice(0, 7) + '-01', createdDk || today.slice(0, 7) + '-01'].sort().pop();
  let nsd = 0;
  for (let k = start; k <= today; k = addDays(k, 1)) {
    if (k < today && !spendDays.has(k)) nsd++;
    else if (k === today && !spendDays.has(k) && daySet.has(k)) nsd++;
  }
  return { current: cur, best: Math.max(best, cur), noSpendDaysThisMonth: nsd, milestone: [3, 7, 14, 30].includes(cur) ? cur : null };
}
function recapFacts(s, d, weekStart, streak) {
  const weekEnd = addDays(weekStart, 6);
  const total = totalIn(s.spends, weekStart, weekEnd), budget = d.dailyBudget * 7;
  const bd = breakdown(s.spends, weekStart, weekEnd);
  return {
    week_start: weekStart, week_end: weekEnd, total, budget, top_category: bd[0] ? bd[0].category : null, top_total: bd[0] ? bd[0].total : 0,
    goal_days: d.reqPerDay > 0 ? (budget - total) / d.reqPerDay : 0, streak, spends: bd.reduce((a, x) => a + x.count, 0),
  };
}
// numbers: every rupee figure in a text
function rupeeFigures(text) { const out = []; let m; const re = /₹\s?(\d[\d,]*(?:\.\d+)?)/g; while ((m = re.exec(text))) out.push(parseFloat(m[1].replace(/,/g, ''))); return out; }
function allNumbers(text) { const out = []; let m; const re = /\d[\d,]*(?:\.\d+)?/g; while ((m = re.exec(text))) out.push(parseFloat(m[0].replace(/,/g, ''))); return out; }
// ---------- goal naming: capture the essence of what the user says ----------
function cleanGoalName(text) {
  let t = String(text || '').trim().replace(/[.!?]+$/g, '');
  t = t.replace(/^(hey|hi|hello|well|so|um|ok|okay|actually)[,.!\s]+/i, '').replace(/^[.,!\s]+/, '');
  const lead = [/^(i\s*am|i'm|im|am|we\s*are|we're)\s+(saving(\s+up)?|planning|trying|going)\s+(for|to\s+(buy|get|go\s+(on|to)|save\s+for))\s+/i, /^(i|we)\s+(want|wanna|need|plan)\s+to\s+(save(\s+up)?(\s+for)?|buy|get|go\s+(on|to))\s+/i, /^(saving(\s+up)?|save)\s+(for\s+)?/i, /^(for|towards|toward)\s+/i];
  for (let i = 0; i < 2; i++) lead.forEach(re => { t = t.replace(re, ''); });
  t = t.replace(/^(my|a|an|the|our|some)\s+/i, '');
  for (let i = 0; i < 4; i++) t = t.replace(/[\s,]+(here|only|now|please|pls|yaar|bro|just|actually|na|hai|basically)\s*$/i, '');
  t = t.replace(/\s+/g, ' ').trim();
  if (!t) return String(text || '').trim().slice(0, 40);
  t = t[0].toUpperCase() + t.slice(1);
  if (t.length > 40) { const cut = t.slice(0, 40); t = cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)); }
  return t;
}
// "6 months", "90 days", "2 weeks", "1.5 years" or a plain number (months) -> months, or null
function parseDuration(text) {
  const t = String(text || '').toLowerCase();
  const m = t.match(/(\d+(?:\.\d+)?)\s*(day|days|d|week|weeks|wk|wks|month|months|mo|mos|year|years|yr|yrs)?\b/);
  if (!m) return null; const n = parseFloat(m[1]); const u = m[2] || 'month';
  if (/^d/.test(u)) return n / DPM; if (/^w/.test(u)) return n * 7 / DPM; if (/^y/.test(u)) return n * 12; return n;
}
const GOAL_ICONS = [
  [/wedding|marriage|shaadi|engagement|ring|honeymoon/i, '💍'], [/trip|travel|goa|vacation|holiday|flight|tour|manali|bali|europe|ladakh|kerala|dubai|abroad/i, '✈️'],
  [/laptop|macbook|computer|pc\b/i, '💻'], [/phone|iphone|mobile|gadget|camera|ps5|playstation|tv\b|headphone|watch/i, '📱'], [/bike|scooter|activa|motorcycle|royal enfield/i, '🏍️'], [/\bcar\b|vehicle|suv|swift/i, '🚗'],
  [/house|home|flat|apartment|deposit|down payment|furniture/i, '🏠'], [/emergency|rainy|safety|fund|cushion/i, '🛟'], [/education|course|mba|college|fees|study|exam|masters|degree|gre|ielts/i, '🎓'],
  [/baby|kid|child|newborn/i, '👶'], [/gift|birthday|anniversary|party/i, '🎁'], [/business|startup|shop\b|store/i, '🏪'], [/debt|loan|emi/i, '🧾'],
];
function goalIcon(name) { for (const [re, ic] of GOAL_ICONS) if (re.test(name || '')) return ic; return '🎯'; }
// tiny safe calculator for the add-expense sheet: + - * / ( ) and decimals, no eval
function calcEval(expr) {
  const s = String(expr).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-').replace(/[,\s₹]/g, ''); let i = 0;
  if (!/^[\d.+\-*/()]+$/.test(s)) return null;
  const num = () => { let neg = false; while (s[i] === '-' || s[i] === '+') { if (s[i] === '-') neg = !neg; i++; } let v; if (s[i] === '(') { i++; v = add(); if (s[i] !== ')') throw 0; i++; } else { const m = s.slice(i).match(/^\d*\.?\d+|^\d+\.?/); if (!m) throw 0; v = parseFloat(m[0]); i += m[0].length; } return neg ? -v : v; };
  const mul = () => { let v = num(); while (s[i] === '*' || s[i] === '/') { const o = s[i++]; const r = num(); v = o === '*' ? v * r : v / r; } return v; };
  const add = () => { let v = mul(); while (s[i] === '+' || s[i] === '-') { const o = s[i++]; const r = mul(); v = o === '+' ? v + r : v - r; } return v; };
  try { const v = add(); return i === s.length && isFinite(v) ? Math.round(v * 100) / 100 : null; } catch (e) { return null; }
}
// period helpers for the ledger: mode = hourly|daily|weekly|monthly|quarterly|yearly
function periodRange(mode, anchor) {
  const [y, m] = anchor.split('-').map(Number); const pad = n => String(n).padStart(2, '0'); const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  if (mode === 'daily' || mode === 'hourly') return { from: anchor, to: anchor, label: fmtDayLong(anchor) };
  if (mode === 'weekly') { const f = weekStartMon(anchor), t = addDays(f, 6); return { from: f, to: t, label: +f.slice(8) + ' ' + MN[+f.slice(5, 7) - 1].slice(0, 3) + ' – ' + +t.slice(8) + ' ' + MN[+t.slice(5, 7) - 1].slice(0, 3) }; }
  if (mode === 'quarterly') { const q = Math.floor((m - 1) / 3); const f = `${y}-${pad(q * 3 + 1)}-01`, t = addDays(`${y}-${pad(q * 3 + 4 > 12 ? 12 : q * 3 + 3)}-01`, 0); const last = `${y}-${pad(q * 3 + 3)}-${pad(daysInMonth(`${y}-${pad(q * 3 + 3)}-01`))}`; return { from: f, to: last, label: 'Q' + (q + 1) + ' ' + y }; }
  if (mode === 'yearly') return { from: `${y}-01-01`, to: `${y}-12-31`, label: String(y) };
  return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(daysInMonth(anchor))}`, label: MN[m - 1] + ' ' + y };
}
function periodStep(mode, anchor, dir) {
  const [y, m] = anchor.split('-').map(Number); const pad = n => String(n).padStart(2, '0');
  if (mode === 'daily' || mode === 'hourly') return addDays(anchor, dir);
  if (mode === 'weekly') return addDays(anchor, 7 * dir);
  const shift = mode === 'quarterly' ? 3 : mode === 'yearly' ? 12 : 1; const t = (y * 12 + (m - 1)) + dir * shift; const ny = Math.floor(t / 12), nm = t % 12 + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(+anchor.slice(8), daysInMonth(`${ny}-${pad(nm)}-01`)))}`;
}
const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDayLong = k => DOW3[dow(k)] + ', ' + +k.slice(8) + ' ' + MON3[+k.slice(5, 7) - 1] + (k.slice(0, 4) !== String(new Date().getFullYear()) ? ' ' + k.slice(0, 4) : '');
const fmtTime12 = hm => { const [h, m] = hm.split(':').map(Number); return ((h % 12) || 12) + ':' + String(m).padStart(2, '0') + ' ' + (h < 12 ? 'am' : 'pm'); };
// ==END LOGIC==

// ---------- the plan's test vectors, runnable anywhere ----------
function runLogicTests() {
  const T = [];
  const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.01 : tol);
  const add = (name, ok, detail) => T.push({ group: 'Money logic', name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const s = {
    income: 22000, cost: 26000, deadline: '2027-02-11', today: '2026-10-11',
    spends: [{ amount: 30, category: 'chai', dk: '2026-10-11' }, { amount: 90, category: 'ride', dk: '2026-10-11' }, { amount: 600, category: 'food', dk: '2026-10-10' }],
  };
  const d = derive(s);
  add('monthsLeft = 4.0411', near(d.monthsLeft, 4.0411, 0.0001), d.monthsLeft.toFixed(4));
  add('reqPerMonth = 6,433.94', near(d.reqPerMonth, 6433.94), d.reqPerMonth.toFixed(2));
  add('reqPerDay = 211.38', near(d.reqPerDay, 211.38), d.reqPerDay.toFixed(2));
  add('free = 15,566.06', near(d.free, 15566.06), d.free.toFixed(2));
  add('dailyBudget = 502.13 (31-day month)', near(d.dailyBudget, 502.13), d.dailyBudget.toFixed(2));
  add('spentToday = 120', d.spentToday === 120, d.spentToday);
  add('leftToday = 382.13', near(d.leftToday, 382.13), d.leftToday.toFixed(2));
  add('weekTotal = 720', d.weekTotal === 720, d.weekTotal);
  add('weekBudget = 3,514.92', near(d.weekBudget, 3514.92), d.weekBudget.toFixed(2));
  add('goalDays(500) = 2.37 days', near(d.goalDays(500), 2.37), d.goalDays(500).toFixed(2));
  add('verdict(250) = yes', verdict(250, d).verdict === 'yes');
  const v = verdict(1000, d);
  add('verdict(1000) = no, over 617.87, 2.9 days', v.verdict === 'no' && near(v.over, 617.87) && round1(v.goalDays) === 2.9, `${v.verdict} over ${v.over.toFixed(2)} days ${round1(v.goalDays)}`);
  add('verdict boundary: exactly 70% of left is yes', verdict(0.7 * d.leftToday, d).verdict === 'yes');
  add('verdict boundary: exactly left is meh', verdict(d.leftToday, d).verdict === 'meh');
  add('on-time at the example', d.onTime && d.delayDays < 0, 'delay ' + d.delayDays + ' days');
  // message parsing
  const p1 = route('swiggy 350'); add('parse "swiggy 350" = spend 350 food', p1.intent === 'spend' && p1.amount === 350 && p1.category === 'food');
  const p2 = route('Can I buy shoes 2k?'); add('parse "Can I buy shoes 2k?" = check 2,000', p2.intent === 'check' && p2.amount === 2000);
  const p3 = route('spent 1.5k on amazon'); add('parse "spent 1.5k on amazon" = spend 1,500 shop', p3.intent === 'spend' && p3.amount === 1500 && p3.category === 'shop');
  const p4 = route('paid 12,000 rent'); add('parse "paid 12,000 rent" = spend 12,000 other', p4.intent === 'spend' && p4.amount === 12000 && p4.category === 'other');
  add('parse "undo" = undo', route('undo').intent === 'undo');
  add('parse "how am i doing" = status', route('how am i doing').intent === 'status');
  add('parse "2 lakh" and "1.2k" suffixes', parseAmount('trip 2 lakh') === 200000 && parseAmount('zomato 1.2k') === 1200);
  add('amount 0 or negative is rejected by the parser', route('chai 0').intent !== 'spend');
  add('parser reads only the first amount (known limit)', route('chai 20 and auto 80').amount === 20);
  // edge cases from the plan
  const late = derive({ ...s, deadline: '2026-10-01' });
  add('edge: deadline already passed uses 0.25 months', late.deadlinePassed && near(late.monthsLeft, 0.25, 1e-9), 'req/mo ' + late.reqPerMonth.toFixed(0));
  const poor = derive({ ...s, income: 5000 });
  add('edge: income below saving needed gives zero budget', poor.dailyBudget === 0 && poor.leftToday === -120 && poor.noBudget, 'budget ' + poor.dailyBudget);
  const other = derive({ ...s, spends: s.spends.concat([{ amount: 9999, category: 'food', dk: '2026-09-15' }]) });
  add('edge: spends in another month do not change month totals', other.spentMTD === d.spentMTD && other.weekTotal === d.weekTotal);
  const early = derive({ ...s, today: '2026-11-02', spends: [{ amount: 5000, category: 'food', dk: '2026-11-02' }] });
  add('edge: first 3 days of a month use the planned pace', early.dom < 4 && near(early.projSpend, early.monthBudget), 'projSpend ' + early.projSpend.toFixed(0));
  add('Indian digit grouping 1,25,000', fmtINR(125000) === '₹1,25,000' && fmtINR(12345678) === '₹1,23,45,678');
  add('month length used for the daily budget (Feb 2027 = 28)', derive({ ...s, today: '2027-02-01', deadline: '2027-06-01' }).dim === 28);
  // new calculations from the design spec
  const sp = [{ amount: 400, category: 'food', dk: '2026-10-10' }, { amount: 300, category: 'food', dk: '2026-10-09' }, { amount: 50, category: 'chai', dk: '2026-10-09' }, { amount: 100, category: 'food', dk: '2026-10-02' }];
  const cp = comparePeriods(sp, '2026-10-05', '2026-10-11', '2026-09-28', '2026-10-04');
  add('compare periods: food grew by 600', cp.biggestGrowth && cp.biggestGrowth.category === 'food' && cp.biggestGrowth.diff === 600, JSON.stringify(cp.biggestGrowth));
  const wi = whatIf(s, d, 'extra_saving', { amount: 500 });
  add('what-if: saving more brings the goal earlier', wi.days_changed > 0, 'days ' + wi.days_changed);
  const wi2 = whatIf(s, d, 'one_off_spend', { amount: 5000 });
  add('what-if: a big one-off spend delays the goal', wi2.days_changed < 0, 'days ' + wi2.days_changed);
  const days = new Set(['2026-10-09', '2026-10-10', '2026-10-11']);
  const st = streakInfo(days, new Set(['2026-10-09', '2026-10-10']), '2026-10-11', '2026-10-01');
  add('streak: 3 days, milestone 3', st.current === 3 && st.milestone === 3, JSON.stringify(st));
  add('streak: today not yet logged keeps yesterday\'s streak', streakInfo(new Set(['2026-10-09', '2026-10-10']), new Set(), '2026-10-11', '2026-10-01').current === 2);
  add('streak: a gap resets it', streakInfo(new Set(['2026-10-08', '2026-10-10']), new Set(), '2026-10-11', '2026-10-01').current === 1);
  add('no-spend days count days with zero spends', st.noSpendDaysThisMonth >= 8, st.noSpendDaysThisMonth);
  const rf = recapFacts(s, d, '2026-10-05', 3);
  add('recap facts: total vs 7 x daily budget', near(rf.budget, d.dailyBudget * 7) && rf.total === 720 && rf.top_category === 'food', JSON.stringify(rf));
  add('parseWhen: kal / last friday / 5 oct', parseWhen('kal ka auto 90', '2026-10-11') === '2026-10-10' && parseWhen('last friday', '2026-10-11') === '2026-10-09' && parseWhen('on 5 oct', '2026-10-11') === '2026-10-05');
  add('timezone: 23:30 UTC on 10 Oct is already 11 Oct in India', dayKey(Date.UTC(2026, 9, 10, 23, 30), 'Asia/Kolkata') === '2026-10-11');
  add('quiet hours cross midnight', inQuietHours('23:00', '22:00', '08:00') && inQuietHours('07:59', '22:00', '08:00') && !inQuietHours('19:00', '22:00', '08:00'));
  add('goal naming: "Am saving for my wedding here only" becomes "Wedding"', cleanGoalName('Am saving for my wedding here only') === 'Wedding', cleanGoalName('Am saving for my wedding here only'));
  add('goal naming: other phrasings keep the essence', cleanGoalName("I'm saving up for a new laptop") === 'New laptop' && cleanGoalName('Goa trip') === 'Goa trip' && cleanGoalName('I want to save for my sister\'s marriage.') === "Sister's marriage" && cleanGoalName('for a bike please') === 'Bike', [cleanGoalName("I'm saving up for a new laptop"), cleanGoalName('I want to save for my sister\'s marriage.'), cleanGoalName('for a bike please')].join(' | '));
  add('goal icons: wedding, trip, laptop, bike, default', goalIcon('Wedding') === '💍' && goalIcon('Goa trip') === '✈️' && goalIcon('New laptop') === '💻' && goalIcon('Bike') === '🏍️' && goalIcon('Something odd') === '🎯');
  add('calculator: precedence, brackets, decimals, bad input', calcEval('2+3*4') === 14 && calcEval('(2+3)*4') === 20 && calcEval('450/4') === 112.5 && calcEval('120+80-30') === 170 && calcEval('2+') === null && calcEval('abc') === null);
  add('ledger periods: month, week, quarter, year ranges', periodRange('monthly', '2026-10-12').from === '2026-10-01' && periodRange('monthly', '2026-10-12').to === '2026-10-31' && periodRange('weekly', '2026-10-12').from === '2026-10-12' && periodRange('weekly', '2026-10-11').from === '2026-10-05' && periodRange('quarterly', '2026-10-12').to === '2026-12-31' && periodRange('yearly', '2026-10-12').from === '2026-01-01', JSON.stringify(periodRange('quarterly', '2026-10-12')));
  add('ledger periods: stepping across month and year ends', periodStep('monthly', '2026-12-15', 1) === '2027-01-15' && periodStep('monthly', '2026-03-31', -1) === '2026-02-28' && periodStep('quarterly', '2026-10-12', -1) === '2026-07-12' && periodStep('weekly', '2026-10-12', -1) === '2026-10-05');
  { const mg = derive({ income: 22000, today: '2026-10-11', spends: [], goals: [{ name: 'Goa', cost: 26000, deadline: '2027-02-11' }, { name: 'Laptop', cost: 48000, deadline: '2027-08-11' }] });
    const single = derive({ income: 22000, today: '2026-10-11', spends: [], goals: [{ name: 'Goa', cost: 26000, deadline: '2027-02-11' }] });
    add('several goals: required saving is the sum of each goal', near(mg.reqPerMonth, 6433.94 + 48000 / (diffDays('2027-08-11', '2026-10-11') / DPM)) && mg.goals.length === 2 && near(single.reqPerMonth, 6433.94), mg.reqPerMonth.toFixed(2));
    add('several goals: one goal gives the same numbers as before', near(single.dailyBudget, 502.13) && single.onTime && single.goals.length === 1);
    add('several goals: an overspend costs every goal the same number of days', near(mg.goalDays(500), 500 / mg.reqPerDay) && mg.goalDays(500) < d.goalDays(500));
    const mgSpend = derive({ income: 22000, today: '2026-10-20', spends: [{ amount: 9000, category: 'food', dk: '2026-10-15' }], goals: [{ name: 'Goa', cost: 26000, deadline: '2027-02-11' }, { name: 'Laptop', cost: 48000, deadline: '2027-08-11' }] });
    add('several goals: heavy spending pushes both goals late with their own status', mgSpend.goals.length === 2 && mgSpend.goals.every(g => g.delayDays == null || g.delayDays > 0) && !mgSpend.onTime, JSON.stringify(mgSpend.goals.map(g => g.delayDays)));
    const none = derive({ income: 31000, today: '2026-10-11', spends: [{ amount: 400, category: 'food', dk: '2026-10-11' }] });
    add('no goal: a plain daily budget of income / days in month', near(none.dailyBudget, 1000) && near(none.leftToday, 600) && none.reqPerMonth === 0 && none.goalDays(500) === 0 && none.onTime && !none.hasGoals, none.dailyBudget);
    const rp = recoveryPlan(derive({ income: 31000, today: '2026-10-11', spends: [{ amount: 25000, category: 'food', dk: '2026-10-11' }] }));
    add('recovery plan after an overspend: remaining month budget spread over remaining days', rp.remainingDays === 20 && near(rp.newDaily, (31000 - 25000) / 20) && rp.cutPerDay > 0, JSON.stringify(rp));
    add('durations: months, days, weeks, years, plain number', near(parseDuration('6 months'), 6) && near(parseDuration('90 days'), 90 / DPM) && near(parseDuration('2 weeks'), 14 / DPM) && near(parseDuration('1.5 years'), 18) && near(parseDuration('4.04'), 4.04) && parseDuration('soon') === null);
    add('goal naming: "Hey.. Am saving for my visa finane for dubai"', cleanGoalName('Hey.. Am saving for my visa finane for dubai') === 'Visa finane for dubai', cleanGoalName('Hey.. Am saving for my visa finane for dubai'));
  }
  return T;
}
if (typeof module !== 'undefined') module.exports = { runLogicTests };
