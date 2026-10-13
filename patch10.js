const fs = require('fs'); let u = fs.readFileSync('src/ui-phone.js', 'utf8');
const blk = (n) => fs.readFileSync('blocks/' + n + '.txt', 'utf8');
const rep = (x, y) => { if (!u.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); u = u.replace(x, () => y); };
const swap = (s, e, text) => { const i = u.indexOf(s), j = u.indexOf(e, i + 1); if (i < 0 || j < 0) throw new Error('marker: ' + s.slice(0, 40) + ' | ' + e.slice(0, 40)); u = u.slice(0, i) + text + u.slice(j); };

swap("function showWelcome() {", "async function doLogin(", blk('auth') + '\n');
swap("function renderGoal() {", "function renderWidgetPreview()", blk('goal') + '\n');
rep("// ==END UI-PHONE==", blk('extras') + "// ==END UI-PHONE==");
// first open: Aunty types her messages one by one
rep("  await loadCats(); await loadChat(); await refreshSummary(); switchTab('chat');", "  await loadCats();\n  if (App.freshSignup) { await refreshSummary(); switchTab('chat'); await introChat(); } else { await loadChat(); await refreshSummary(); switchTab('chat'); renderLastWidget(); }");
rep("f.scrollTop = sc || f.scrollHeight;", "f.scrollTop = sc || f.scrollHeight; renderLastWidget();");
rep("if (m.meta && m.meta.flow) el.dataset.flow = '1';", "if (m.meta && m.meta.flow) el.dataset.flow = '1'; if (m.meta && m.meta.ui) el.dataset.ui = JSON.stringify(m.meta.ui);");
// growing text box
rep("<input id=\"chatIn\" autocomplete=\"off\" maxlength=\"500\" placeholder=\"Tell Aunty what you spent...\" aria-label=\"Message\">", "<textarea id=\"chatIn\" rows=\"1\" autocomplete=\"off\" maxlength=\"500\" placeholder=\"Tell Aunty what you spent...\" aria-label=\"Message\"></textarea>");
rep("if (!t) return; i.value = ''; if (App.editing)", "if (!t) return; i.value = ''; autoGrow(i); if (App.editing)");
rep("const i = $('#chatIn'); i.value = text; i.focus(); $('#editBanner')", "const i = $('#chatIn'); i.value = text; autoGrow(i); i.focus(); $('#editBanner')");
rep("const i = $('#chatIn'); if (i) i.value = ''; const b = $('#editBanner');", "const i = $('#chatIn'); if (i) { i.value = ''; autoGrow(i); } const b = $('#editBanner');");
// widgets and popup
rep("const ce = $('#chatEmpty'); if (ce) ce.remove(); hideChips();", "const ce = $('#chatEmpty'); if (ce) ce.remove(); hideChips(); document.querySelectorAll('.wgt').forEach(w => w.remove());");
rep("markEditable(); if (r.body.summary_changed) await refreshSummary();", "markEditable(); renderLastWidget(); if (r.body.popup) setTimeout(() => showFume(r.body.popup), 450); if (r.body.summary_changed) await refreshSummary();");
// spend tab: a daily number without a goal, and where the number comes from
rep("if (!s.has_goal) { arc.style.strokeDashoffset = 100; g.classList.remove('over'); $('#bigNum').textContent = '—'; $('#gLbl').textContent = 'no goal yet'; $('#gSub').textContent = 'Set a goal to see today\\'s number'; $('#gTag').innerHTML = ''; }", "if (!s.has_budget) { arc.style.strokeDashoffset = 100; g.classList.remove('over'); $('#bigNum').textContent = '—'; $('#gLbl').textContent = 'no daily number yet'; $('#gSub').textContent = 'Tell Aunty your monthly income'; $('#gTag').innerHTML = ''; }");
rep("$('#gSub').textContent = `${fmtINR(s.spent_today_paise / 100)} spent of ${fmtINR(bud)} a day`;", "$('#gSub').innerHTML = `${fmtINR(s.spent_today_paise / 100)} spent of ${fmtINR(bud)} a day <button class=\"info\" data-act=\"budget-info\" aria-label=\"How is this calculated?\">&#9432; how?</button>`;");
rep("`<div class=\"v\">No goal</div><button class=\"lnk small\" data-act=\"start-goal\">Set one</button>`", "`<div class=\"v\">No goal</div><button class=\"lnk small\" data-act=\"add-goal\">Add one</button>`");
rep("s.spent_today_paise === 0 && s.has_goal)", "s.spent_today_paise === 0 && s.has_budget)");
rep("'needs a goal'}", "'needs your income'}");
rep("sub.textContent = s.goal ? (s.goal.icon || '🎯') + ' ' + s.goal.name + ' goal' : 'No goal yet';", "sub.textContent = s.goal ? (s.goal.icon || '🎯') + ' ' + s.goal.name + (s.goal.count > 1 ? ' goals' : ' goal') : (s.has_budget ? 'Daily budget' : 'Setting up');");
// settings: income, rent, goals
rep("const nt = u.nudge_types;", "const nt = u.nudge_types; const bx = App.summary.budget_explainer, ng = App.summary.goals.length;");
swap("  <h2>Goal</h2>", "  <h2>Nudges</h2>", "  <h2>Budget and goals</h2><div class=\"card\" style=\"margin-top:0\"><div class=\"srow\"><span class=\"sp\">Monthly income</span><button class=\"btn sm sec\" data-act=\"change-income\">${bx ? money(bx.income_paise) : 'Set'}</button></div><div class=\"srow\"><span class=\"sp\">Rent and fixed bills</span><button class=\"btn sm sec\" data-act=\"change-rent\">${bx ? money(bx.rent_paise) : 'Set'}</button></div><div class=\"srow\"><span class=\"sp\">${ng ? ng + (ng > 1 ? ' goals' : ' goal') : 'No goals yet'}</span><button class=\"btn sm sec\" data-act=\"add-goal\">Add</button> <button class=\"btn sm sec\" data-act=\"manage-goals\">Manage</button></div></div>\n");
rep("App.lastEmail = d.email; showSignup(3);", "App.lastEmail = d.email; App.freshSignup = true; showSignup(3);");
fs.writeFileSync('src/ui-phone.js', u);

// demo seed: income on the profile, a second goal
let d = fs.readFileSync('src/ui-dash.js', 'utf8');
const drep = (x, y) => { if (!d.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); d = d.replace(x, () => y); };
drep("  B.setGoal(uid, { name: 'Goa trip', cost_paise: 2600000, deadline: monthsToDeadline(today, 4.04), free_income_paise: 2200000 });", "  DB.update('app_user', u, { income_paise: 2200000, rent_paise: null });\n  B.setGoal(uid, { name: 'Goa trip', cost_paise: 2600000, deadline: monthsToDeadline(today, 4.04), free_income_paise: 2200000 });\n  B.addGoal(uid, { name: 'New laptop', cost_paise: 4800000, deadline: monthsToDeadline(today, 12), free_income_paise: 2200000 });");
drep("DB.remove('spend', r => r.user_id === uid); B.setGoal(uid, { name: 'Goa trip'", "DB.remove('spend', r => r.user_id === uid); DB.update('app_user', B.userById(uid), { income_paise: 2200000, rent_paise: null }); B.setGoal(uid, { name: 'Goa trip'");
fs.writeFileSync('src/ui-dash.js', d);
console.log('ui patched');
