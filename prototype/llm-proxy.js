#!/usr/bin/env node
// Hisaab Aunty LLM proxy. Keeps API keys on the server side and forwards chat requests to OpenAI-compatible
// endpoints (llama.cpp llama-server, vLLM, Ollama /v1, or a hosted gateway).
//
// Two ways to configure it:
//  1. Several models: a models.json file (no secrets inside; keys come from environment variables). The page shows them in a dropdown.
//       [{ "id": "team-f16", "label": "Team model", "base_url": "http://127.0.0.1:8081/v1", "model": "team-model-f16", "key_env": "LLM_API_KEY" }]
//       LLM_API_KEY=your-key node llm-proxy.js          (LLM_MODELS_FILE=path overrides the file location; LLM_DEFAULT_MODEL picks the default id)
//  2. One model: LLM_BASE_URL=http://127.0.0.1:8080/v1 LLM_API_KEY=your-key LLM_MODEL=qwen3.5-4b node llm-proxy.js
//
// Every key is REQUIRED: the proxy refuses to start if one is missing. No message text is ever logged.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = +process.env.PORT || 8787, ORIGINS = (process.env.ALLOW_ORIGIN || 'http://localhost:5177').split(',').map(s => s.trim());
const TIMEOUT = +process.env.LLM_TIMEOUT_MS || 60000, MAX_TOKENS = +process.env.LLM_MAX_TOKENS || 400;
const fail = (m) => { console.error('Hisaab Aunty LLM proxy: ' + m); process.exit(1); };

// ---- model registry ----
let REG = [];
const file = process.env.LLM_MODELS_FILE || path.join(__dirname, 'models.json');
if (!process.env.LLM_BASE_URL && fs.existsSync(file)) {
  let list; try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { fail(file + ' is not valid JSON.'); }
  if (!Array.isArray(list) || !list.length) fail(file + ' must be a non-empty list of models.');
  for (const m of list) {
    if (!m.id || !m.base_url) fail('every model in ' + file + ' needs an "id" and a "base_url".');
    const key = process.env[m.key_env || 'LLM_API_KEY'] || '';
    if (!key) fail('the key for model "' + m.id + '" is missing: set the ' + (m.key_env || 'LLM_API_KEY') + ' environment variable.');
    REG.push({ id: String(m.id), label: String(m.label || m.id), base: String(m.base_url).replace(/\/$/, ''), model: m.model ? String(m.model) : '', key });
  }
} else {
  const base = (process.env.LLM_BASE_URL || '').replace(/\/$/, ''), key = process.env.LLM_API_KEY || '';
  if (!base || !key) fail('LLM_BASE_URL and LLM_API_KEY are required (or provide a models.json with LLM_API_KEY set).\n  Example: LLM_BASE_URL=http://127.0.0.1:8080/v1 LLM_API_KEY=... node llm-proxy.js');
  const model = process.env.LLM_MODEL || '';
  REG.push({ id: model || 'default', label: model || 'default model', base, model, key });
}
const SINGLE = REG.length === 1 && !!process.env.LLM_BASE_URL;   // single-model mode forces the configured model name, as before
const DEFAULT_ID = (REG.find(m => m.id === process.env.LLM_DEFAULT_MODEL) || REG[0]).id;
const pick = (id) => REG.find(m => m.id === id) || REG.find(m => m.id === DEFAULT_ID);

let busy = 0; const MAX_CONCURRENT = +process.env.LLM_MAX_CONCURRENT || 2;   // a small CPU model should serve very few requests at once
const corsHeaders = (origin) => (origin && ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {});
const send = (res, status, body, origin) => { res.writeHead(status, { 'content-type': 'application/json', ...corsHeaders(origin) }); res.end(JSON.stringify(body)); };
async function isUp(m) {   // reachable = the server answers at all (any HTTP status)
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
  try { await fetch(m.base.replace(/\/v1$/, '') + '/health', { signal: ctl.signal }); return true; } catch (e) { return false; } finally { clearTimeout(t); }
}
http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': ORIGINS.includes(origin) ? origin : '', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') { const d = pick(DEFAULT_ID); return send(res, 200, { ok: true, upstream: new URL(d.base).host, model: d.id, models: REG.length, keyConfigured: true, busy }, origin); }
  if (req.method === 'GET' && req.url === '/models') {   // ids and labels only: never keys or internal addresses
    const up = await Promise.all(REG.map(isUp));
    return send(res, 200, { default: DEFAULT_ID, models: REG.map((m, i) => ({ id: m.id, label: m.label, online: up[i], default: m.id === DEFAULT_ID })) }, origin);
  }
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    if (busy >= MAX_CONCURRENT) return send(res, 429, { error: { message: 'The language model is busy. Try again in a moment.' } }, origin);
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 64 * 1024) return send(res, 413, { error: { message: 'Request too large.' } }, origin); }
    let body; try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { error: { message: 'Bad JSON.' } }, origin); }
    const m = pick(SINGLE ? DEFAULT_ID : body.model);
    body.stream = false; if (process.env.LLM_THINKING !== '1') body.chat_template_kwargs = { enable_thinking: false };   // Qwen3.x "thinking" is far too slow on CPU; set LLM_THINKING=1 to allow it
    body.max_tokens = Math.min(+body.max_tokens || MAX_TOKENS, MAX_TOKENS); if (m.model) body.model = m.model; else delete body.model;
    busy++; const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const up = await fetch(m.base + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + m.key }, body: JSON.stringify(body), signal: ctl.signal });
      let text = await up.text(); try { const j = JSON.parse(text); j.hisaab_model = m.id; text = JSON.stringify(j); } catch (e) { /* leave non-JSON replies as they are */ }
      res.writeHead(up.status, { 'content-type': 'application/json', ...corsHeaders(origin) }); res.end(text);
    } catch (e) { send(res, 502, { error: { message: e.name === 'AbortError' ? 'The language model took too long.' : 'Could not reach the language model "' + m.label + '". Is it running?' } }, origin); }
    finally { clearTimeout(t); busy--; }
    return;
  }
  send(res, 404, { error: { message: 'Not found.' } }, origin);
}).listen(PORT, '127.0.0.1', () => console.log(`Hisaab Aunty LLM proxy on http://127.0.0.1:${PORT} with ${REG.length} model(s): ${REG.map(m => m.id).join(', ')} (default ${DEFAULT_ID}; keys loaded)`));
