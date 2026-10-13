// Scores a model on the held-out Hinglish test set, through the same proxy and the same adapter the app uses.
//   node training/eval_model.js --model team-model-f16 --n 60 [--proxy http://127.0.0.1:8787] [--file test]
// Reports: valid JSON, right intent, right amounts, WRONG WRITES (the validator would save something the label does not), latency.
const vm = require('vm'), fs = require('fs'), path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const MODEL = arg('model', ''), N = +arg('n', 60), PROXY = arg('proxy', 'http://127.0.0.1:8787'), FILE = arg('file', 'test'), root = path.join(__dirname, '..');
vm.runInThisContext(['logic', 'backend', 'aunty', 'llm'].map(f => fs.readFileSync(path.join(root, 'src', f + '.js'), 'utf8')).join('\n') + '\nglobalThis.__e={createBackend,createDB,installAunty,makeLLM};');
const { createBackend, createDB, installAunty, makeLLM } = __e;
(async () => {
  const rows = fs.readFileSync(path.join(__dirname, 'data', FILE + '.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const step = Math.max(1, Math.floor(rows.length / N)), sample = rows.filter((r, i) => i % step === 0).slice(0, N);   // even spread across the file
  const cfg = { llm: { enabled: true, proxyUrl: PROXY, model: MODEL, timeoutMs: 90000, jsonSchema: true } }, llm = makeLLM(cfg);
  const B = createBackend({ db: createDB(null), clock: { t: Date.UTC(2026, 9, 11, 6, 30), now() { return this.t; } }, cfg: {} }); installAunty(B);
  const sr = await B.api('POST', '/v1/auth/signup', { body: { email: 'v@x.com', password: 'secret123', name: 'Priya', city: 'Pune', region_flavour: 'none', age_confirmed: true, consent_version: '2026-10' } });
  const uid = sr.body.user.id; B.setGoal(uid, { name: 'Goa trip', cost_paise: 2600000, deadline: '2027-02-11', free_income_paise: 2200000 }); const base = B.ctxFor(uid);
  const R = { n: 0, json: 0, intent: 0, amounts: 0, amountsOf: 0, wrongWrites: 0, wrongWriteList: [], ms: [], byIntent: {}, misses: [], errors: 0 };
  for (const r of sample) {
    const sys = r.messages[0].content, msg = r.messages[1].content, gold = JSON.parse(r.messages[2].content);
    const today = (sys.match(/Today is (\d{4}-\d{2}-\d{2})/) || [])[1], wk = (sys.match(/\((\w+)\)\. Categories/) || [])[1];
    R.n++; const bi = R.byIntent[gold.intent] = R.byIntent[gold.intent] || { n: 0, ok: 0 }; bi.n++;
    let o; try { o = await llm.interpret(msg, { today, weekday: wk, categories: ['food (Food delivery)', 'chai (Chai & coffee)', 'ride (Auto & cab)', 'shop (Shopping)', 'other (Other)'] }); } catch (e) { R.errors++; console.log('ERR', e.message); continue; }
    R.ms.push(o.ms); const got = o.obj; if (got && typeof got === 'object') R.json++;
    const okIntent = !!got && got.intent === gold.intent; if (okIntent) { R.intent++; bi.ok++; } else R.misses.push({ msg, gold: gold.intent, got: got ? got.intent : '(no JSON)' });
    if (gold.intent === 'log_spend') { R.amountsOf++; const g = gold.spends.map(s => s.amount_inr).sort((a, b) => a - b).join(), m = got && Array.isArray(got.spends) ? got.spends.map(s => Number(s.amount_inr)).sort((a, b) => a - b).join() : ''; if (okIntent && g === m) R.amounts++; }
    // a "wrong write": the validator would actually save something that the correct label would not
    if (got && got.intent === 'log_spend') {
      const v = B.intentToPlan(JSON.parse(JSON.stringify(got)), msg, Object.assign({}, base, { today })); const saves = v.ok && v.plan.kind === 'log' ? v.plan.calls.map(c => c.input.amount_inr).sort((a, b) => a - b).join() : null;
      const goldSaves = gold.intent === 'log_spend' ? gold.spends.map(s => s.amount_inr).sort((a, b) => a - b).join() : null;
      if (saves !== null && saves !== goldSaves) { R.wrongWrites++; R.wrongWriteList.push({ msg, gold: gold.intent === 'log_spend' ? goldSaves : gold.intent, saves }); }
    }
    if (R.n % 10 === 0) console.log(R.n + '/' + sample.length + ' done...');
  }
  const pct = (a, b) => (b ? Math.round(100 * a / b) + '%' : 'n/a'), srt = R.ms.slice().sort((a, b) => a - b), med = srt[Math.floor(srt.length / 2)] || 0, p90 = srt[Math.floor(srt.length * 0.9)] || 0;
  console.log('\nMODEL:', MODEL || '(proxy default)', '| messages:', R.n, '| errors/timeouts:', R.errors);
  console.log('valid JSON      :', pct(R.json, R.n));
  console.log('right intent    :', pct(R.intent, R.n));
  console.log('right amounts   :', pct(R.amounts, R.amountsOf), '(spend messages only)');
  console.log('WRONG WRITES    :', R.wrongWrites, '(must be 0)');
  console.log('latency         : median', med, 'ms, 90th percentile', p90, 'ms');
  console.log('by intent       :', Object.entries(R.byIntent).map(([k, v]) => k + ' ' + v.ok + '/' + v.n).join(' | '));
  if (R.wrongWriteList.length) console.log('wrong writes:', JSON.stringify(R.wrongWriteList.slice(0, 8), null, 1));
  console.log('sample misses   :', JSON.stringify(R.misses.slice(0, 12)));
  fs.writeFileSync(path.join(__dirname, 'data', 'last_eval_' + (MODEL || 'default').replace(/[^\w.-]/g, '_') + '.json'), JSON.stringify({ model: MODEL, n: R.n, jsonPct: R.json / R.n, intentPct: R.intent / R.n, amountsPct: R.amountsOf ? R.amounts / R.amountsOf : null, wrongWrites: R.wrongWrites, medianMs: med, p90Ms: p90, misses: R.misses }, null, 1));
  process.exit(0);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
