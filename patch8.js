const fs = require('fs'); let lines = fs.readFileSync('src/tests.js', 'utf8').split('\n');
const idx = (p) => { const i = lines.findIndex(l => l.includes(p)); if (i < 0) throw new Error('line not found: ' + p); return i; };
const setLine = (p, text) => { lines[idx(p)] = text; };
setLine("add(GG, 'first open: Aunty greets", "    add(GG, 'first open: a one-line greeting, then the income question (no long disclaimer)', h.length === 2 && /Namaste/.test(h[0].text) && !/bank passwords|financial advice/i.test(h[0].text) && /monthly income/i.test(h[1].text), h.map(m => m.text).join(' | '));");
setLine("let x = await chat(B, s, 'Goa trip'); x = await chat(B, s, 'lots');", "    let x = await chat(B, s, 'lots'); add(GG, 'invalid income gets one friendly retry, no error code', /could not read/i.test(x.b.replies[0].text) && !/error|invalid/i.test(x.b.replies[0].text) && x.b.ui === null);");
setLine("await chat(B, s, '26,000'); x = await chat(B, s, '0');", "    x = await chat(B, s, '22k'); add(GG, 'after income Aunty asks the optional bank balance and offers a Skip button', /bank account right now/.test(x.b.replies[0].text) && x.b.ui && x.b.ui.type === 'skip', JSON.stringify(x.b.ui));");
setLine("await chat(B, s, '4.04'); x = await chat(B, s, '22k');", "    await chat(B, s, '15000'); x = await chat(B, s, 'skip'); add(GG, 'rent is optional: Skip moves on to food, also with a Skip button', /food/i.test(x.b.replies[0].text) && x.b.ui.type === 'skip'); x = await chat(B, s, '3000'); add(GG, 'then the goal question, which can be skipped (the app also works for daily budgeting)', /saving for something/i.test(x.b.replies[0].text) && /track your daily/.test(x.b.replies[0].text) && x.b.ui.type === 'skip', x.b.replies[0].text);\n    x = await chat(B, s, 'Goa trip'); add(GG, 'a goal name gets a friendly acknowledgement and asks for an estimated budget', /Goa trip/.test(x.b.replies[0].text) && /estimated budget/.test(x.b.replies[0].text), x.b.replies[0].text);\n    x = await chat(B, s, 'lots'); add(GG, 'an unreadable cost gets a friendly retry', /could not read/i.test(x.b.replies[0].text));\n    x = await chat(B, s, '26,000'); add(GG, 'the months question comes with a slider widget', x.b.ui && x.b.ui.type === 'slider', JSON.stringify(x.b.ui));\n    x = await chat(B, s, '0 days'); add(GG, 'a duration under a week is refused', /at least a week/.test(x.b.replies[0].text));\n    x = await chat(B, s, '4.04');");
setLine("await chat(B, s, '15000'); x = await chat(B, s, 'skip'); add(GG, 'rent is optional: typing skip", "");
setLine("await gx('Am saving for my wedding here only');", "    await gx('60k'); await gx('skip'); await gx('20000'); await gx('skip'); const q = await gx('Am saving for my wedding here only'); await gx('4 lakh'); const fin = await gx('12 months');");
fs.writeFileSync('src/tests.js', lines.join('\n'));
let t = fs.readFileSync('src/tests.js', 'utf8');
const rep = (x, y) => { if (!t.includes(x)) throw new Error('missing: ' + x.slice(0, 60)); t = t.replace(x, () => y); };
rep("add(GG, 'four answers create the goal (26k, 4.04 months, 22k income)'", "add(GG, 'the answers create the goal (26k, 4.04 months, 22k income)'");
rep("  // ===== Aunty evaluation set =====", `  // ===== several goals, no goal, passwords, the fuming reaction =====
  { const NG = 'Goals, daily budgeting, reactions';
    const B = mk({ accessTtlMs: 1e13 }); const s = await signup(B, 'm@x.com'); const gx = async m => (await chat(B, s, m)).b;
    await gx('30k'); await gx('skip'); await gx('skip'); await gx('skip'); const nog = await gx('skip');
    add(NG, 'skipping the goal still finishes onboarding: a daily budget from income alone', /All set! That gives you ₹968 a day/.test(nog.replies[0].text) && /where your daily number comes from/.test(nog.replies[0].text) && B.goalRows(s.uid).length === 0, nog.replies[0].text);
    let sm = (await call(B, s.token, 'GET', '/v1/summary')).body;
    add(NG, 'summary works without a goal: budget, no goal, explainer, no insight card', sm.has_budget === true && sm.has_goal === false && sm.goal === null && sm.daily_budget_paise === Math.round(3000000 / 31) && sm.budget_explainer.saving_paise === 0 && sm.insight === null, JSON.stringify([sm.daily_budget_paise, sm.insight]));
    let x = await chat(B, s, 'chai 30'); add(NG, 'logging works without a goal and mentions no goal days', /left today/.test(x.b.replies[0].text) && !/days? of/.test(x.b.replies[0].text), x.b.replies[0].text);
    x = await chat(B, s, 'can I buy shoes for 2k?'); add(NG, 'purchase check works without a goal', x.tools[0].name === 'check_purchase' && !/days? of/.test(x.b.replies[0].text) && /over/.test(x.b.replies[0].text), x.b.replies[0].text);
    x = await chat(B, s, 'add another goal'); add(NG, '"add another goal" starts the goal script', x.b.flow_started === true);
    await chat(B, s, 'Hey.. Am saving for my visa finane for dubai'); await chat(B, s, '1.2 lakh'); x = await chat(B, s, '120 days');
    add(NG, 'a goal captured from a messy sentence, with a duration in days', B.goalRows(s.uid).length === 1 && B.goalRows(s.uid)[0].name === 'Visa finane for dubai' && B.goalRows(s.uid)[0].deadline === addDays(B.today(B.userById(s.uid)), 122), B.goalRows(s.uid)[0] && B.goalRows(s.uid)[0].deadline);
    add(NG, 'after a goal Aunty offers "Add another goal" and "That is all" buttons', x.b.ui && x.b.ui.type === 'buttons' && x.b.ui.options.length === 2, JSON.stringify(x.b.ui));
    x = await chat(B, s, 'add another goal'); await chat(B, s, 'new laptop'); await chat(B, s, '60k'); x = await chat(B, s, '8 months');
    add(NG, 'a second goal is added, not replaced; the reply says every spend counts against both', B.goalRows(s.uid).length === 2 && /Together your 2 goals/.test(x.b.replies[0].text) && /against all of them/.test(x.b.replies[0].text), x.b.replies[0].text);
    sm = (await call(B, s.token, 'GET', '/v1/summary')).body;
    add(NG, 'summary lists both goals, a combined name, and the explainer lines', sm.goals.length === 2 && /Visa finane for dubai & New laptop/.test(sm.goal.name) && sm.budget_explainer.goals.length === 2 && Math.abs(sm.budget_explainer.saving_paise - sm.goals.reduce((a, g) => a + g.required_per_month_paise, 0)) <= 2, JSON.stringify(sm.budget_explainer));
    x = await chat(B, s, 'that is all'); add(NG, '"that is all" gets a friendly close', /Perfect/.test(x.b.replies[0].text) && x.tools.length === 0);
    const del = await call(B, s.token, 'DELETE', '/v1/goals/' + B.goalRows(s.uid)[0].id); add(NG, 'a goal can be deleted; the other keeps working', del.status === 200 && B.goalRows(s.uid).length === 1 && del.body.goals.length === 1);
    x = await chat(B, s, 'explain my goal maths'); add(NG, 'goal maths with one goal after deleting', /Cost divided by months/.test(x.b.replies[0].text), x.b.replies[0].text);
    // the fuming reaction: big, discretionary, over today. No bills, no emergencies.
    B.cfg.injectBadNumber = false;
    x = await chat(B, s, 'i spent 5000 on party'); const pop = x.b.popup;
    add(NG, 'a big discretionary overspend makes Aunty fume: shock mood and a popup', x.b.mood === 'shock' && pop && pop.mood === 'shock' && /party/.test(pop.title), JSON.stringify(pop));
    add(NG, 'the popup shows what is over today, the goal cost in days, and a new daily plan from our code', pop && pop.stats.length === 3 && /^Over today/.test(pop.stats[0].k) && /days? of New laptop/.test(pop.stats[1].v) && /a day|for \\d+ days/.test(pop.stats[2].v), JSON.stringify(pop && pop.stats));
    add(NG, 'the chat reply also carries the cost in goal-days and the new plan, with every figure from tools', /over today/.test(x.b.replies[0].text) && /days? of/.test(x.b.replies[0].text) && /New plan/.test(x.b.replies[1].text) && x.trace.outcome === 'ok', x.b.replies.map(r => r.text).join(' || '));
    add(NG, 'the popup offers the exact spend to undo', pop && B.rawSpends(s.uid).some(r => r.id === pop.spend_id));
    x = await chat(B, s, 'spent 9000 on rent'); add(NG, 'rent stays calm: no popup, no joke', x.b.popup === null && /no stress/i.test(x.b.replies[0].text));
    x = await chat(B, s, 'my father is in the hospital, paid 20000'); add(NG, 'an emergency stays calm: no popup', x.b.popup === null && /no stress/i.test(x.b.replies[0].text));
    // manual add also gets the popup
    const mm = await call(B, s.token, 'POST', '/v1/spends', { amount_paise: 800000, category: 'shop', note: 'Sneakers', source: 'manual' }, { 'Idempotency-Key': 'sn1' });
    add(NG, 'an expense added with the + button can also trigger the popup', mm.body.aunty && mm.body.aunty.popup && /Sneakers/.test(mm.body.aunty.popup.title), JSON.stringify(mm.body.aunty && mm.body.aunty.popup));
    // profile income
    const pi = await call(B, s.token, 'PATCH', '/v1/me', { income_paise: 5000000, rent_paise: 1000000 }); add(NG, 'income and rent can be changed in settings and drive the budget', pi.status === 200 && B.ctxFor(s.uid).input.income === 40000, JSON.stringify(B.ctxFor(s.uid).input.income));
    // passwords
    const pw = async (p) => (await B.api('POST', '/v1/auth/signup', { body: { email: 'p' + Math.random() + '@x.com', password: p, age_confirmed: true, consent_version: '1' } })).status;
    add(NG, 'password rules: 8+ characters, a letter and a number are required', await pw('abcdefgh') === 400 && await pw('12345678') === 400 && await pw('abc123') === 400 && await pw('abcdef12') === 201);
  }

  // ===== Aunty evaluation set =====`);
fs.writeFileSync('src/tests.js', t); console.log('tests patched');
