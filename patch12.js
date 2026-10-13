const fs = require('fs'); let t = fs.readFileSync('src/tests.js', 'utf8');
const rep = (x, y) => { if (!t.includes(x)) throw new Error('missing: ' + x.slice(0, 60)); t = t.replace(x, () => y); };
rep("add(EV, '480 characters of random text: short reply asking what to log', nTools(x) === 0 && x.b.replies[0].text.length < 200, x.b.replies[0].text.length);", "add(EV, '480 characters of random text: no tool, no write, a short friendly reply', nTools(x) === 0 && x.b.replies[0].text.length < 260, x.b.replies[0].text.length);");
rep("  // ===== Aunty evaluation set =====", `  // ===== small language model: parser first, the model only proposes, our code validates =====
  { const SL = 'Small language model path';
    const mkLLM = (fn) => { const calls = { n: 0 }; return { calls, configured: () => true, interpret: async (msg, ctx) => { calls.n++; const obj = await fn(msg, ctx); return { obj, ms: 120, model: 'fake-slm', tokens_in: 310, tokens_out: 40 }; } }; };
    const setup = async (llm) => { const B = mk({ accessTtlMs: 1e13 }); if (llm !== undefined) B.llm = llm; const s = await signup(B, 'slm' + Math.random() + '@x.com'); goal(B, s.uid); B.db.update('app_user', B.userById(s.uid), { flow: null, income_paise: 2200000 }); spend(B, s.uid, 400, 'food', 8); spend(B, s.uid, 900, 'food', 1); return { B, s }; };
    // 1. no model linked: the API key is required for free-form chat
    { const { B, s } = await setup(); let x = await chat(B, s, 'pichle hafte se is hafte kitna zyada gaya');
      add(SL, 'without a linked LLM, free-form chat says the API key is needed and does nothing else', x.tools.length === 0 && /not linked yet/.test(x.b.replies[0].text) && /API key/.test(x.b.replies[0].text) && B.db.where('ai_call_log', l => l.outcome === 'llm_not_linked').length === 1, x.b.replies[0].text);
      x = await chat(B, s, 'chai 30'); add(SL, 'without a linked LLM, clear messages still work through the parser', x.tools[0].name === 'log_spend' && x.b.summary_changed);
      add(SL, 'a model-less server still passes the "ask the user" cases', (await chat(B, s, 'paid Rohan')).b.replies[0].text.includes('How much')); }
    // 2. parser first: clear messages never reach the model
    { const llm = mkLLM(async () => ({ intent: 'unknown' })); const { B, s } = await setup(llm);
      await chat(B, s, 'chai 30'); await chat(B, s, 'how am i doing'); await chat(B, s, 'can I buy shoes for 2k?'); await chat(B, s, 'undo');
      add(SL, 'parser first: spends, status, purchase checks and undo never call the model', llm.calls.n === 0, 'model calls: ' + llm.calls.n); }
    // 3. the model understands what the parser cannot; our code still runs the tools
    { const llm = mkLLM(async () => ({ intent: 'compare', period: 'week' })); const { B, s } = await setup(llm); const x = await chat(B, s, 'pichle hafte se is hafte kitna zyada gaya');
      add(SL, 'a free-form question is turned into a validated intent, run through our tools, and answered from tool results', llm.calls.n === 1 && x.tools[0].name === 'compare_periods' && /Biggest rise/.test(x.b.replies[0].text) && x.trace.outcome === 'ok' && x.trace.slm.accepted, x.b.replies[0].text);
      add(SL, 'the model call is logged with tokens and no message text', B.db.where('ai_call_log', l => l.purpose === 'chat_slm').length === 1 && B.db.where('ai_call_log', l => l.purpose === 'chat_slm')[0].model === 'fake-slm' && !('text' in B.db.where('ai_call_log', l => l.purpose === 'chat_slm')[0])); }
    // 4. a financial write needs the amount in the user's own message as digits
    { const llm = mkLLM(async () => ({ intent: 'log_spend', spends: [{ amount_inr: 50, category: 'chai', note: 'coffee', when: '2026-10-10' }] })); const { B, s } = await setup(llm); const n0 = B.rawSpends(s.uid).length; const x = await chat(B, s, 'fifty rupees ki coffee kal');
      add(SL, 'the model proposes a spend from words only: Aunty asks for confirmation in digits and saves nothing', B.rawSpends(s.uid).length === n0 && x.tools.length === 0 && /Did you mean ₹50 for coffee\\?/.test(x.b.replies[0].text) && x.trace.outcome === 'ok', x.b.replies[0].text); }
    // 5. hostile or broken model output is rejected
    for (const [name, out] of [['an unknown intent', { intent: 'delete_everything' }], ['a negative amount', { intent: 'log_spend', spends: [{ amount_inr: -500, category: 'food' }] }], ['an absurd amount', { intent: 'log_spend', spends: [{ amount_inr: 1e9, category: 'food' }] }], ['no JSON at all', null], ['an array', [1, 2]], ['smalltalk', { intent: 'smalltalk' }]]) {
      const llm = mkLLM(async () => out); const { B, s } = await setup(llm); const n0 = B.rawSpends(s.uid).length; const x = await chat(B, s, 'kuch bhi bol raha hu bhai');
      add(SL, 'rejected model output (' + name + '): no tool runs and nothing is written', x.tools.length === 0 && B.rawSpends(s.uid).length === n0 && /not sure what you meant/.test(x.b.replies[0].text) && B.db.where('ai_call_log', l => l.outcome === 'rejected').length === 1, x.b.replies[0].text);
    }
    // 6. the model is down or slow
    { const llm = mkLLM(async () => { throw new Error('the language model took too long'); }); const { B, s } = await setup(llm); const x = await chat(B, s, 'kuch bhi bol raha hu bhai');
      add(SL, 'if the model errors or times out, Aunty says so kindly and the simple parser keeps working', /Aunty is thinking/.test(x.b.replies[0].text) && B.db.where('ai_call_log', l => l.outcome === 'ai_error').length === 1 && (await chat(B, s, 'chai 20')).tools[0].name === 'log_spend'); }
    // 7. validator unit checks
    { const { B, s } = await setup(); const c = B.ctxFor(s.uid); const V = (o, m) => B.intentToPlan(o, m || 'x', c);
      add(SL, 'validator: notes are stripped of markup and instructions-looking symbols', V({ intent: 'log_spend', spends: [{ amount_inr: 90, category: 'ride', note: '<script>alert(1)</script> auto' }] }, 'auto 90').plan.calls[0].input.note === 'scriptalert1script auto');
      add(SL, 'validator: unknown categories fall back to other; future dates are dropped', V({ intent: 'log_spend', spends: [{ amount_inr: 90, category: 'gold bars', when: '2099-01-01' }] }, 'x 90').plan.calls[0].input.category === 'other' && !('when' in V({ intent: 'log_spend', spends: [{ amount_inr: 90, category: 'ride', when: '2099-01-01' }] }, 'x 90').plan.calls[0].input));
      add(SL, 'validator: read-only intents map to the right tools', V({ intent: 'status', period: 'month' }).plan.calls[0].input.period === 'month' && V({ intent: 'query', mode: 'biggest', period: 'this week' }).plan.calls[0].name === 'query_spends' && V({ intent: 'goal_info' }).plan.calls[0].name === 'get_goal_details' && V({ intent: 'accounts' }).plan.calls[0].name === 'get_accounts');
      add(SL, 'validator: at most five spends and no spends at all are handled', V({ intent: 'log_spend', spends: [] }).ok === false && V({ intent: 'log_spend', spends: Array.from({ length: 9 }, () => ({ amount_inr: 10, category: 'chai' })) }, '10').plan.calls.length === 5);
      add(SL, 'validator: a clarifying question must be present', V({ intent: 'ask', question: '' }).ok === false && V({ intent: 'ask', question: 'What was it for?' }).plan.kind === 'slm_ask'); }
  }

  // ===== Aunty evaluation set =====`);
fs.writeFileSync('src/tests.js', t); console.log('tests patched');
