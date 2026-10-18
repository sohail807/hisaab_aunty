// node analyze_fresh.js [folderWithResults] : prints the comparison table for original, round1 and finance result files
const fs = require('fs'), path = require('path'), dir = process.argv[2] || process.cwd();
const M = { original: 'Original', round1: 'Round 1', finance: 'New (finance)' }, R = {};
for (const k of Object.keys(M)) R[k] = JSON.parse(fs.readFileSync(path.join(dir, 'fresh_' + k + '.json'), 'utf8'));
const cnt = (rows, f) => { const s = rows.filter(f); return { n: s.length, ok: s.filter(r => r.right).length }; };
const fmt = (c) => `${c.ok}/${c.n} (${c.n ? Math.round(100 * c.ok / c.n) : 0}%)`;
const rows = [
  ['ALL 100 questions', r => true], ['Statements (numbers), 40', r => r.type === 'stmt'], ['  worded in English', r => r.type === 'stmt' && r.lang === 'english'], ['  worded in Hinglish', r => r.type === 'stmt' && r.lang === 'hinglish'],
  ['  US companies', r => r.type === 'stmt' && r.market === 'USD'], ['  Indian companies', r => r.type === 'stmt' && r.market === 'INR'],
  ['Term questions (multiple choice), 60', r => r.type === 'mcq'], ['  English', r => r.type === 'mcq' && r.lang === 'en'], ['  Hinglish', r => r.type === 'mcq' && r.lang === 'hi'],
  ['  finance basics', r => r.type === 'mcq' && r.area === 'finance'], ['  banking', r => r.type === 'mcq' && r.area === 'banking'], ['  tax', r => r.type === 'mcq' && r.area === 'tax'], ['  statement terms', r => r.type === 'mcq' && r.area === 'statements'],
];
console.log('| Test | ' + Object.values(M).join(' | ') + ' |'); console.log('|---|---|---|---|');
for (const [name, f] of rows) console.log(`| ${name} | ${Object.keys(M).map(k => fmt(cnt(R[k], f))).join(' | ')} |`);
console.log('\nmodel gave no letter (MCQ):', Object.keys(M).map(k => k + ' ' + R[k].filter(r => r.type === 'mcq' && !r.got).length).join(', '));
const mq = R.finance.filter(r => r.type === 'mcq');
console.log('\nMCQ the NEW model got wrong:'); mq.forEach((r, i) => { if (!r.right) console.log('  -', r.q, '| original:', R.original.filter(x => x.type === 'mcq')[i].right ? 'right' : 'wrong', '| round1:', R.round1.filter(x => x.type === 'mcq')[i].right ? 'right' : 'wrong'); });
console.log('\nMCQ the NEW model got right but BOTH others wrong:', mq.filter((r, i) => r.right && !R.original.filter(x => x.type === 'mcq')[i].right && !R.round1.filter(x => x.type === 'mcq')[i].right).length);
console.log('MCQ the NEW model got wrong but BOTH others right:', mq.filter((r, i) => !r.right && R.original.filter(x => x.type === 'mcq')[i].right && R.round1.filter(x => x.type === 'mcq')[i].right).length);
