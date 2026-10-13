const fs = require('fs'); let t = fs.readFileSync('src/tests.js', 'utf8');
const rep = (x, y) => { if (!t.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); t = t.replace(x, () => y); };
rep("await chat(B, s, '4.04'); x = await chat(B, s, '22k');", "await chat(B, s, '4.04'); x = await chat(B, s, '22k'); add(GG, 'after income Aunty asks the optional questions (bank balance, rent, food)', /bank account right now/.test(x.b.replies[0].text) && /skip/.test(x.b.replies[0].text), x.b.replies[0].text);\n    await chat(B, s, '15000'); x = await chat(B, s, 'skip'); add(GG, 'rent is optional: typing skip moves on to food', /food/i.test(x.b.replies[0].text)); x = await chat(B, s, '3000');");
rep("    add(GG, 'summary reply states monthly saving", "    add(GG, 'optional answers are stored: bank balance on the account, food limit on the category', B.accountsOf(s.uid).length === 1 && B.accountBalance(s.uid, B.accountsOf(s.uid)[0]) === 1500000 && B.catsOf(s.uid).find(c => c.slug === 'food').limit_paise === 300000);\n    add(GG, 'summary reply states monthly saving");
rep("  // ===== Aunty evaluation set =====", `  // ===== goal naming, ledger, accounts, categories, limits, editing =====
  { const NW = 'Ledger, accounts, limits, editing';
    const B = mk(); const s = await signup(B, 'w@x.com'); const gx = async m => (await chat(B, s, m)).b;
    await gx('Am saving for my wedding here only'); const q = await gx('5 lakh'); await gx('12 months'); await gx('60k'); await gx('skip'); await gx('20000'); const fin = await gx('skip');
    const g = B.goalOf(s.uid);
    add(NW, 'goal name captures the essence: "Am saving for my wedding here only" becomes Wedding with a ring icon', g.name === 'Wedding' && g.icon === '💍', g.name + ' ' + g.icon);
    add(NW, 'rent is subtracted: income 60k minus rent 20k gives free income 40k', g.free_income_paise === 4000000 && g.income_paise === 6000000 && g.rent_paise === 2000000);
    add(NW, 'the final summary mentions the icon, goal and rent', /💍 Done! Wedding/.test(fin.replies[0].text) && /Rent ₹20,000 is set aside/.test(fin.replies[0].text), fin.replies[0].text);
    B.cfg.accessTtlMs = 1e13;
    // categories and limits
    let r = await call(B, s.token, 'GET', '/v1/categories'); add(NW, 'five default categories with icons, no limits', r.body.categories.length === 5 && r.body.categories.every(c => c.icon && c.limit_paise == null));
    r = await call(B, s.token, 'POST', '/v1/categories', { label: 'Gym', icon: '🏋️', limit_paise: 150000 }); add(NW, 'a custom category can be added with a limit', r.status === 201 && r.body.category.slug === 'gym');
    add(NW, 'duplicate category names are refused', (await call(B, s.token, 'POST', '/v1/categories', { label: 'gym' })).status === 409);
    add(NW, 'built-in categories cannot be deleted', (await call(B, s.token, 'DELETE', '/v1/categories/food')).status === 409);
    r = await call(B, s.token, 'PATCH', '/v1/categories/food', { limit_paise: 100000 }); add(NW, 'a monthly limit can be set on a category', r.body.category.limit_paise === 100000);
    // adding an expense from the + button: Aunty speaks up, with limit awareness
    const acc2 = (await call(B, s.token, 'POST', '/v1/accounts', { name: 'Cash', type: 'cash', opening_paise: 500000 })).body.account;
    add(NW, 'multiple accounts: a second account is created with an opening balance', acc2 && B.accountsOf(s.uid).length === 2 && acc2.balance_paise === 500000);
    const e1 = await call(B, s.token, 'POST', '/v1/spends', { amount_paise: 85000, category: 'food', note: 'Dinner at Social', memo: 'with team', account_id: acc2.id, source: 'manual' }, { 'Idempotency-Key': 'e1' });
    add(NW, 'adding an expense through POST /spends makes Aunty speak up (and stores her message)', e1.status === 201 && e1.body.aunty && /Dinner at Social/.test(e1.body.aunty.text) && B.db.where('chat_message', m => m.user_id === s.uid && m.meta && m.meta.source === 'add_sheet').length === 1, e1.body.aunty && e1.body.aunty.text);
    const e2 = await call(B, s.token, 'POST', '/v1/spends', { amount_paise: 30000, category: 'food', note: 'Zomato', source: 'manual' }, { 'Idempotency-Key': 'e2' });
    add(NW, 'Aunty mentions the category limit when it is crossed', /over your Food delivery limit of ₹1,000/.test(e2.body.aunty.text) && e2.body.aunty.mood === 'judge', e2.body.aunty.text);
    const e3 = await call(B, s.token, 'POST', '/v1/spends', { amount_paise: 12000, category: 'gym', note: 'Protein', source: 'manual' }, { 'Idempotency-Key': 'e3' }); add(NW, 'custom categories work in spends', e3.status === 201 && B.rawSpends(s.uid).some(x => x.category === 'gym'));
    add(NW, 'unknown categories are refused', (await call(B, s.token, 'POST', '/v1/spends', { amount_paise: 100, category: 'nope' }, { 'Idempotency-Key': 'e4' })).status === 400);
    add(NW, 'account balances move with expenses', (await call(B, s.token, 'GET', '/v1/accounts')).body.accounts.find(a => a.name === 'Cash').balance_paise === 500000 - 85000);
    const inc = await call(B, s.token, 'POST', '/v1/income', { amount_paise: 6000000, title: 'Salary', account_id: B.accountsOf(s.uid)[0].id }, { 'Idempotency-Key': 'i1' });
    add(NW, 'income can be added; Aunty reminds the user to move the goal saving first', inc.status === 201 && /Move ₹/.test(inc.body.aunty.text) && /Wedding fund/.test(inc.body.aunty.text), inc.body.aunty && inc.body.aunty.text);
    add(NW, 'a retried income (same key) is not saved twice', (await call(B, s.token, 'POST', '/v1/income', { amount_paise: 6000000, title: 'Salary' }, { 'Idempotency-Key': 'i1' })).body.duplicate === true && B.db.where('income', x => x.user_id === s.uid).length === 1);
    const today = B.today(B.userById(s.uid)); const lg = (await call(B, s.token, 'GET', '/v1/ledger?from=' + today.slice(0, 7) + '-01&to=' + today)).body;
    add(NW, 'ledger totals: income, expense and net for the month', lg.income_paise === 6000000 && lg.expense_paise === 85000 + 30000 + 12000 && lg.net_paise === 6000000 - 127000, JSON.stringify([lg.income_paise, lg.expense_paise]));
    add(NW, 'ledger rows carry title, category, account, time and sign data', lg.entries.length === 4 && lg.entries.every(x => x.title && x.category && x.hm && x.account_name && x.icon) && lg.entries.find(x => x.title === 'Dinner at Social').account_name === 'Cash', JSON.stringify(lg.entries[0]));
    add(NW, 'ledger is newest first', lg.entries.every((x, i) => i === 0 || lg.entries[i - 1].at >= x.at));
    const sm = (await call(B, s.token, 'GET', '/v1/summary')).body; add(NW, 'summary reports total balance and this month\\'s income and expense', sm.month_income_paise === 6000000 && sm.month_expense_paise === 127000 && sm.balance_paise === 0 + 6000000 - 127000, JSON.stringify([sm.balance_paise, sm.month_income_paise]));
    // edit and delete from the ledger
    const ed = await call(B, s.token, 'PATCH', '/v1/spends/' + e1.body.spend.id, { amount_paise: 90000, note: 'Dinner' }); add(NW, 'an expense can be edited', ed.status === 200 && ed.body.spend.amount_paise === 90000 && ed.body.spend.note === 'Dinner');
    const di = await call(B, s.token, 'DELETE', '/v1/income/' + inc.body.income.id); add(NW, 'income can be deleted (soft) and leaves the ledger', di.status === 200 && (await call(B, s.token, 'GET', '/v1/ledger?from=' + today.slice(0, 7) + '-01&to=' + today)).body.income_paise === 0);
    const delAcc = await call(B, s.token, 'DELETE', '/v1/accounts/' + acc2.id); add(NW, 'deleting an account moves its entries and balance to another account', delAcc.status === 200 && B.accountsOf(s.uid).length === 1 && B.db.where('spend', x => x.user_id === s.uid && x.account_id === acc2.id).length === 0);
    add(NW, 'the last account cannot be deleted', (await call(B, s.token, 'DELETE', '/v1/accounts/' + B.accountsOf(s.uid)[0].id)).status === 409);
    // isolation for the new tables
    const o = await signup(B, 'o@x.com'); add(NW, 'another user cannot read or touch these accounts, categories, income or ledger', (await call(B, o.token, 'DELETE', '/v1/accounts/' + B.accountsOf(s.uid)[0].id)).status === 404 && (await call(B, o.token, 'PATCH', '/v1/spends/' + e1.body.spend.id, { note: 'x' })).status === 404 && (await call(B, o.token, 'DELETE', '/v1/income/' + inc.body.income.id)).status === 404 && (await call(B, o.token, 'GET', '/v1/categories')).body.categories.every(c => !c.custom) && (await call(B, o.token, 'GET', '/v1/ledger?from=2026-01-01&to=2026-12-31')).body.entries.length === 0);
    // chat: limits, accounts, custom category, editing the last message
    let x = await chat(B, s, 'set food limit 4000'); add(NW, 'chat: "set food limit 4000" runs set_category_limit', x.tools[0].name === 'set_category_limit' && x.tools[0].input.amount_inr === 4000 && B.catsOf(s.uid).find(c => c.slug === 'food').limit_paise === 400000, x.b.replies[0].text);
    x = await chat(B, s, 'what are my limits'); add(NW, 'chat: limits question lists category usage', x.tools[0].name === 'get_category_limits' && /Food delivery ₹1,150 of ₹4,000/.test(x.b.replies[0].text), x.b.replies[0].text);
    x = await chat(B, s, 'what is my balance'); add(NW, 'chat: balance question uses get_accounts', x.tools[0].name === 'get_accounts' && /Balance across/.test(x.b.replies[0].text), x.b.replies[0].text);
    x = await chat(B, s, 'gym 800'); add(NW, 'chat logs a spend into the user\\'s custom category', x.tools[0].input.category === 'gym' && x.tools[0].result.category_label === 'Gym', JSON.stringify(x.tools[0].input));
    const n0 = B.rawSpends(s.uid).length; x = await chat(B, s, 'chai 20'); const mid = B.db.where('chat_message', m => m.user_id === s.uid && m.role === 'user').pop().id;
    add(NW, 'before editing: one more spend logged', B.rawSpends(s.uid).length === n0 + 1);
    let ee = await call(B, s.token, 'POST', '/v1/chat/' + mid + '/edit', { message: 'chai 50' });
    add(NW, 'editing the last message undoes its spend and logs the corrected one', ee.status === 200 && B.rawSpends(s.uid).length === n0 + 1 && B.rawSpends(s.uid).some(r => r.amount_paise === 5000) && !B.rawSpends(s.uid).some(r => r.amount_paise === 2000), ee.status + ' ' + JSON.stringify(ee.body.error || ''));
    const hist = (await call(B, s.token, 'GET', '/v1/chat/history')).body.messages; add(NW, 'the edited message shows the new text and only one reply follows it', hist.filter(m => m.text === 'chai 20').length === 0 && hist[hist.length - 2].text === 'chai 50' && hist[hist.length - 1].role === 'aunty');
    const old = B.db.where('chat_message', m => m.user_id === s.uid && m.role === 'user')[0]; add(NW, 'only the latest message can be edited', (await call(B, s.token, 'POST', '/v1/chat/' + old.id + '/edit', { message: 'x' })).status === 400);
  }

  // ===== Aunty evaluation set =====`);
fs.writeFileSync('src/tests.js', t); console.log('ok');
