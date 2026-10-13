const fs = require('fs');
let u = fs.readFileSync('src/ui-phone.js', 'utf8');
const urep = (x, y) => { if (!u.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); u = u.replace(x, () => y); };
urep("const saveCfg = () => LS.set('ha_cfg', { aiDown: CFG.aiDown, llmNudges: CFG.llmNudges, injectBadNumber: CFG.injectBadNumber, injectBadRegional: CFG.injectBadRegional });", "CFG.llm = Object.assign({ enabled: false, proxyUrl: 'http://localhost:8787', model: '', timeoutMs: 15000, jsonSchema: true }, CFG.llm || {});\nB.llm = makeLLM(CFG);   // the small language model adapter; the API key lives only in llm-proxy.js\nconst saveCfg = () => LS.set('ha_cfg', { aiDown: CFG.aiDown, llmNudges: CFG.llmNudges, injectBadNumber: CFG.injectBadNumber, injectBadRegional: CFG.injectBadRegional, llm: CFG.llm });");
fs.writeFileSync('src/ui-phone.js', u);

let d = fs.readFileSync('src/ui-dash.js', 'utf8');
const drep = (x, y) => { if (!d.includes(x)) throw new Error('missing: ' + x.slice(0, 70)); d = d.replace(x, () => y); };
drep("['trace', 'Aunty trace'],", "['trace', 'Aunty trace'], ['llm', 'LLM'],");
d = d.split("trace: dTrace, nudges: dNudges").join("trace: dTrace, llm: dLlm, nudges: dNudges");
drep("if (['api', 'tests', 'about'].includes(DT.tab)) return;", "if (['api', 'tests', 'about', 'llm'].includes(DT.tab)) return;");
drep("const DACT = {", `function dLlm() {
  const c = CFG.llm, on = B.llm.configured();
  return \`<p class="small" style="color:#5A6480">Aunty works in two layers. <b>Layer 1 (always on):</b> a deterministic parser handles clear messages ("chai 30", "can I buy shoes for 2k?", "how am I doing"). <b>Layer 2 (needs your LLM and its API key):</b> messages the parser cannot understand go to a small language model, which only <i>proposes</i> an intent as JSON. Our code validates it, runs the tools, and writes the reply. The model never calculates and a spend is never saved from the model's word alone.</p>
  <div class="ctl"><div class="d"><b>Use the language model for free-form messages</b><small>Status: <span class="\${on ? 'ok' : 'warn'}">\${on ? 'linked (proxy URL set)' : 'not linked. Without it, unrecognised messages get "My language brain is not linked yet".'}</span></small></div>\${sw('llmEnabled', c.enabled)}</div>
  <div class="ctl"><div class="d"><b>LLM proxy URL</b><small>Where llm-proxy.js is running. It holds the API key, so this page never does.</small></div><input id="llmUrl" value="\${esc(c.proxyUrl)}" style="width:240px"></div>
  <div class="ctl"><div class="d"><b>Model name (optional)</b><small>Leave empty to use the proxy's LLM_MODEL.</small></div><input id="llmModel" value="\${esc(c.model)}" style="width:240px" placeholder="e.g. qwen3.5-4b"></div>
  <div class="ctl"><div class="d"><b>Ask for constrained JSON output</b><small>Turn off if your server rejects response_format.</small></div>\${sw('llmSchema', c.jsonSchema !== false)}</div>
  <div class="ctl"><div class="d"><b>Timeout (ms)</b><small>CPU models are slow. The plan's 15 s limit is a starting point.</small></div><input id="llmTimeout" type="number" value="\${c.timeoutMs}" style="width:110px"></div>
  <div><button class="dbtn pri" data-dact="llm-save">Save</button><button class="dbtn" data-dact="llm-test">Test connection</button><span id="llmOut" class="small"></span></div>
  <h3>Try a message (shows the proposal and what would run; nothing is executed or saved)</h3>
  <div class="ctl"><input id="llmMsg" style="flex:1" placeholder="e.g. pichle hafte se is hafte kitna zyada gaya" value="pichle hafte se is hafte kitna zyada gaya"><button class="dbtn" data-dact="llm-try">Interpret</button></div>
  <pre id="llmTry" style="min-height:60px">\${esc(DT.llmTry || '')}</pre>
  <h3>How to start the proxy</h3><pre>LLM_BASE_URL=http://127.0.0.1:8080/v1
LLM_API_KEY=&lt;your key&gt;
LLM_MODEL=&lt;model name&gt;
node llm-proxy.js        # refuses to start without LLM_API_KEY</pre>
  <p class="small" style="color:#5A6480">Full steps, llama.cpp commands and the production mapping are in SLM_INTEGRATION.md.</p>\`;
}
const DACT = {`);
drep("flag: async el => { const k = el.dataset.k; if (k === 'offline')", "flag: async el => { const k = el.dataset.k; if (k === 'llmEnabled') { CFG.llm.enabled = !CFG.llm.enabled; saveCfg(); dRender(); return; } if (k === 'llmSchema') { CFG.llm.jsonSchema = CFG.llm.jsonSchema === false; saveCfg(); dRender(); return; } if (k === 'offline')");
drep("  'run-tests': async () => {", `  'llm-save': () => { CFG.llm.proxyUrl = $('#llmUrl').value.trim() || 'http://localhost:8787'; CFG.llm.model = $('#llmModel').value.trim(); CFG.llm.timeoutMs = Math.max(1000, +$('#llmTimeout').value || 15000); saveCfg(); $('#llmOut').textContent = ' Saved.'; },
  'llm-test': async () => { DACT['llm-save'](); const o = $('#llmOut'); o.textContent = ' Testing...'; try { const h = await B.llm.health(); o.textContent = ' Proxy reachable (upstream ' + h.upstream + ', key configured: ' + h.keyConfigured + '). Asking the model...'; const p = await B.llm.ping(); o.textContent = ' OK: model "' + (p.model || '?') + '" replied "' + p.text + '" in ' + p.ms + ' ms.'; } catch (e) { o.textContent = ' Failed: ' + e.message + '. Is llm-proxy.js running, and is the origin allowed (ALLOW_ORIGIN)?'; } },
  'llm-try': async () => { DACT['llm-save'](); const out = $('#llmTry'); if (!App.user) { out.textContent = 'Sign in first.'; return; } const msg = $('#llmMsg').value; out.textContent = 'Asking the model...'; const c = B.ctxFor(App.user.id); try { const r = await B.llm.interpret(msg, { today: c.today, weekday: WEEKDAYS[dow(c.today)], categories: B.catsOf(App.user.id).map(x => x.slug + ' (' + x.label + ')') }); const v = B.intentToPlan(r.obj, msg, c); DT.llmTry = 'Model proposal (' + r.ms + ' ms' + (r.tokens_in ? ', ' + r.tokens_in + ' in / ' + r.tokens_out + ' out tokens' : '') + '):\\n' + JSON.stringify(r.obj, null, 2) + '\\n\\nOur validation: ' + (v.ok ? 'ACCEPTED as "' + v.plan.kind + '"\\nTools that would run: ' + (v.plan.calls.map(x => x.name + '(' + JSON.stringify(x.input) + ')').join('\\n  ') || '(none; Aunty would reply directly)') : 'REJECTED: ' + v.reason); } catch (e) { DT.llmTry = 'Failed: ' + e.message; } out.textContent = DT.llmTry; },
  'run-tests': async () => {`);
// trace tab: show the model's proposal when it was used
drep("    h += `<h3>2. Tool calls", "    if (t.slm) h += `<h3>1b. Small language model (parser did not understand)</h3><pre>\${esc(JSON.stringify(t.slm, null, 2))}</pre>`;\n    h += `<h3>2. Tool calls");
fs.writeFileSync('src/ui-dash.js', d);
console.log('dash patched');
