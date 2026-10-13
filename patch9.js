const fs = require('fs');
let a = fs.readFileSync('src/aunty.js', 'utf8');
const anchor = "      case 'whatif': {";
if (!a.includes(anchor)) throw new Error('anchor');
a = a.replace(anchor, () => `      case 'limit_set': { const r = results[0]; if (r.error) return { text: 'Tell me the category and amount, like "set food limit 3000".', mood: 'neutral' }; return { text: r.limit_inr ? \`\${r.label} limit set to \${R(r.limit_inr)} a month. You have used \${R(r.month_spent_inr)} so far this month.\` : \`Removed the \${r.label} limit.\`, mood: 'happy', actions: [{ type: 'limit_changed' }] }; }
      case 'limits': { const r = results[0]; const w2 = r.categories.filter(x => x.limit_inr != null); if (!w2.length) return { text: 'You have not set any category limits. Say "set food limit 3000" and I will keep watch.', mood: 'neutral' }; return { text: 'This month: ' + w2.map(x => \`\${x.label} \${R(x.spent_inr)} of \${R(x.limit_inr)}\${x.status === 'over' ? ' (over)' : ''}\`).join(', ') + '.', mood: w2.some(x => x.status === 'over') ? 'judge' : 'happy', explain: true }; }
      case 'accounts': { const r = results[0]; return { text: \`Balance across \${r.accounts.length} account\${r.accounts.length > 1 ? 's' : ''}: \${R(r.total_inr)} (\${r.accounts.map(x => x.name + ' ' + R(x.balance_inr)).join(', ')}). This month: \${R(r.month_income_inr)} in, \${R(r.month_expense_inr)} out.\`, mood: 'neutral', explain: true }; }
` + anchor);
fs.writeFileSync('src/aunty.js', a);
let t = fs.readFileSync('src/tests.js', 'utf8');
const rep = (x, y) => { if (!t.includes(x)) throw new Error('missing: ' + x.slice(0, 60)); t = t.replace(x, () => y); };
rep("&& x.b.navigate === 'spend', x.b.replies[0].text);", "&& x.b.ui && x.b.ui.type === 'buttons', x.b.replies[0].text);");
rep("await chat(B, s, '1.2 lakh'); x = await chat(B, s, '120 days');", "await chat(B, s, '1.2 lakh'); x = await chat(B, s, '300 days');");
rep("addDays(B.today(B.userById(s.uid)), 122)", "addDays(B.today(B.userById(s.uid)), 300)");
rep("my father is in the hospital, paid 20000", "my father is in the hospital, spent 20000 on bills");
fs.writeFileSync('src/tests.js', t); console.log('ok');
