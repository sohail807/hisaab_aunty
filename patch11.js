const fs = require('fs'); let a = fs.readFileSync('src/aunty.js', 'utf8');
const rep = (x, y) => { if (!a.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); a = a.replace(x, () => y); };

// 1. the validator that sits between a small language model and our tools
rep("  // ---------- the mock \"model\": writes the reply from tool results", `  // ---------- small language model: it only PROPOSES an intent. Our code validates it before anything runs. ----------
  const INTENTS = ['log_spend', 'check_purchase', 'status', 'undo', 'query', 'compare', 'goal_info', 'accounts', 'limits', 'streak', 'recap', 'ask', 'smalltalk', 'unknown'];
  function intentToPlan(o, msg, c) {
    const bad = (reason) => ({ ok: false, reason });
    if (!o || typeof o !== 'object' || Array.isArray(o)) return bad('the model did not return an object');
    if (!INTENTS.includes(o.intent)) return bad('unknown intent: ' + String(o.intent).slice(0, 30));
    const today = c.today, uid = c.user.id, cats = B.catsOf(uid).map(x => x.slug), digits = findAmounts(msg).map(x => x.value);
    const P = (kind, extra) => ({ ok: true, plan: Object.assign({ kind, calls: [], fromModel: true }, extra || {}) });
    const num = v => (typeof v === 'number' && isFinite(v) ? v : NaN);
    const day = v => (typeof v === 'string' && /^\\d{4}-\\d{2}-\\d{2}/.test(v) && v.slice(0, 10) <= today && v.slice(0, 10) >= addDays(today, -400)) ? v.slice(0, 10) : undefined;
    const cat = v => (cats.includes(v) ? v : null);
    const per = (txt, dflt) => parsePeriod(String(txt || '').toLowerCase(), today) || dflt;
    switch (o.intent) {
      case 'log_spend': {
        const list = Array.isArray(o.spends) ? o.spends.slice(0, 5) : []; if (!list.length) return bad('no spends in the proposal');
        const calls = []; let unconfirmed = null;
        for (const s of list) {
          const amt = num(s && s.amount_inr); if (!(amt > 0 && amt <= 1e7)) return bad('bad amount in the proposal');
          const note = String((s && s.note) || '').replace(/[^\\p{L}\\p{N} -]/gu, '').trim().slice(0, 40);
          // a financial write needs the amount to be in the user's own message as digits; otherwise ask the user to confirm
          if (!digits.some(d => Math.abs(d - amt) < 0.01)) { unconfirmed = unconfirmed || { amount: amt, note }; continue; }
          const when = day(s && s.when); calls.push({ name: 'log_spend', input: Object.assign({ amount_inr: amt, category: cat(s.category) || 'other', note: note || cat(s.category) || 'spend' }, when ? { when } : {}) });
        }
        if (unconfirmed) return P('slm_confirm', { ask: unconfirmed, allow: [unconfirmed.amount] });
        return P('log', { calls, serious: /\\b(emergency|hospital|rent short)\\b/i.test(msg) });
      }
      case 'check_purchase': { const amt = num(o.amount_inr); if (!(amt > 0 && amt <= 1e8)) return bad('bad amount'); return P('check', { calls: [{ name: 'check_purchase', input: { amount_inr: amt, label: String(o.label || '').replace(/[^\\p{L}\\p{N} -]/gu, '').slice(0, 40) } }] }); }
      case 'status': { const p = ['today', 'week', 'month', 'goal'].includes(o.period) ? o.period : 'today'; return P('status', { period: p, calls: [{ name: 'get_summary', input: { period: p } }].concat(p === 'today' ? [{ name: 'get_summary', input: { period: 'week' } }] : []) }); }
      case 'undo': return P('undo', { calls: [{ name: 'undo_last_spend', input: {} }] });
      case 'query': {
        const p = per(o.period, { from: today.slice(0, 7) + '-01', to: today, label: 'this month' }), k = cat(o.category), mode = ['total', 'biggest', 'list'].includes(o.mode) ? o.mode : 'total';
        if (mode === 'total' && !k) return P('breakdown', { period: p, calls: [{ name: 'category_breakdown', input: { from: p.from, to: p.to } }] });
        return P('query', { period: p, mode, calls: [{ name: 'query_spends', input: { from: p.from, to: p.to, category: k || undefined, sort: mode === 'list' ? 'newest' : 'largest', limit: mode === 'list' ? 8 : 3 } }] });
      }
      case 'compare': {
        if (/month/i.test(String(o.period || ''))) { const first = today.slice(0, 7) + '-01', pm = addDays(first, -1).slice(0, 7) + '-01'; return P('compare', { calls: [{ name: 'compare_periods', input: { a_from: first, a_to: today, b_from: pm, b_to: addDays(pm, +today.slice(8) - 1) } }], labels: ['this month so far', 'the same days last month'] }); }
        return P('compare', { calls: [{ name: 'compare_periods', input: { a_from: addDays(today, -6), a_to: today, b_from: addDays(today, -13), b_to: addDays(today, -7) } }], labels: ['the last 7 days', 'the 7 days before'] });
      }
      case 'goal_info': return P('goal_explain', { calls: [{ name: 'get_goal_details', input: {} }] });
      case 'accounts': return P('accounts', { calls: [{ name: 'get_accounts', input: {} }] });
      case 'limits': return P('limits', { calls: [{ name: 'get_category_limits', input: {} }] });
      case 'streak': return P('streak', { calls: [{ name: 'get_streak', input: {} }] });
      case 'recap': return P('recap', { calls: [{ name: 'get_latest_recap', input: {} }] });
      case 'ask': { const q = String(o.question || '').replace(/\\s+/g, ' ').trim().slice(0, 160); if (q.length < 3) return bad('empty question'); return P('slm_ask', { question: q }); }
      default: return bad('no actionable intent');
    }
  }
  B.intentToPlan = intentToPlan;
  // ---------- the mock "model": writes the reply from tool results`);

// 2. routing: parser first, small model only for what the parser could not understand
rep("    const plan = planPlan(msg, c0, turn);\n    turn.trace.plan = plan.kind;", `    let plan = planPlan(msg, c0, turn);
    if (plan.kind === 'fallback') {                      // the deterministic parser did not understand: ask the language model, if one is linked
      if (!B.llm || !B.llm.configured()) { plan = { kind: 'no_brain', calls: [] }; B.logAI(uid, 'chat', 'none', msg, '', 1, 'llm_not_linked'); }
      else {
        const t1 = performance.now();
        try {
          const r = await B.llm.interpret(msg, { today: c0.today, weekday: WEEKDAYS[dow(c0.today)], categories: B.catsOf(uid).map(x => x.slug + ' (' + x.label + ')') });
          const v = intentToPlan(r.obj, msg, c0); const ms = r.ms || Math.round(performance.now() - t1);
          turn.trace.slm = { proposal: r.obj, accepted: v.ok, reason: v.reason || null, ms, tokens_in: r.tokens_in || null, tokens_out: r.tokens_out || null, model: r.model || null };
          B.logAI(uid, 'chat_slm', r.model || 'slm', msg, JSON.stringify(r.obj || {}), ms, v.ok ? 'ok' : 'rejected');
          plan = v.ok ? v.plan : { kind: 'fallback_unsure', calls: [] };
        } catch (e) { turn.trace.slm = { error: String(e.message || e).slice(0, 120), accepted: false }; B.logAI(uid, 'chat_slm', 'slm', msg, '', Math.round(performance.now() - t1), 'ai_error'); plan = { kind: 'slm_down', calls: [] }; }
      }
    }
    turn.trace.plan = plan.kind;`);
rep("const allowed = allowedNumbers(results, ctxText, msg, mem);", "const allowed = allowedNumbers(results.concat([{ allow: plan.allow || [] }]), ctxText, msg, mem);");
// 3. replies for the new situations
rep("      case 'fallback': return {", `      case 'no_brain': return { text: 'My language brain is not linked yet, so I only understand simple messages like "chai 30", "can I buy shoes for 2k?" or "how am I doing?". Ask your admin to add the LLM API key to unlock free-form chat.', mood: 'neutral' };
      case 'fallback_unsure': return { text: 'I am not sure what you meant, and I do not want to guess with your money. Try "chai 30", or ask how you are doing.', mood: 'neutral' };
      case 'slm_down': return { text: 'Aunty is thinking, try again in a moment. Simple messages like "chai 30" still work.', mood: 'neutral' };
      case 'slm_ask': return { text: plan.question, mood: 'neutral' };
      case 'slm_confirm': return { text: \`Did you mean \${R(plan.ask.amount)}\${plan.ask.note ? ' for ' + plan.ask.note : ''}? Type the amount in digits, like "\${plan.ask.note || 'spend'} \${plan.ask.amount}", and I will log it.\`, mood: 'neutral' };
      case 'fallback': return {`);
fs.writeFileSync('src/aunty.js', a); console.log('aunty patched');
