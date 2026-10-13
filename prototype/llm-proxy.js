#!/usr/bin/env node
// Hisaab Aunty LLM proxy. Keeps the API key on the server side and forwards chat requests to your team's
// OpenAI-compatible endpoint (llama.cpp llama-server, vLLM, Ollama /v1, or a hosted gateway).
//
//   LLM_BASE_URL=http://127.0.0.1:8080/v1  LLM_API_KEY=your-key  LLM_MODEL=qwen3.5-4b  node llm-proxy.js
//
// The key is REQUIRED: the proxy refuses to start without it. No message text is ever logged.
const http = require('http');
const BASE = (process.env.LLM_BASE_URL || '').replace(/\/$/, ''), KEY = process.env.LLM_API_KEY || '', MODEL = process.env.LLM_MODEL || '';
const PORT = +process.env.PORT || 8787, ORIGINS = (process.env.ALLOW_ORIGIN || 'http://localhost:5177').split(',').map(s => s.trim());
const TIMEOUT = +process.env.LLM_TIMEOUT_MS || 20000, MAX_TOKENS = +process.env.LLM_MAX_TOKENS || 400;
if (!BASE || !KEY) {
  console.error('Hisaab Aunty LLM proxy: LLM_BASE_URL and LLM_API_KEY are required.\n  Example: LLM_BASE_URL=http://127.0.0.1:8080/v1 LLM_API_KEY=... node llm-proxy.js');
  process.exit(1);
}
let busy = 0; const MAX_CONCURRENT = +process.env.LLM_MAX_CONCURRENT || 2;   // a small CPU model should serve very few requests at once
const send = (res, status, body, origin) => { const h = { 'content-type': 'application/json' }; if (origin && ORIGINS.includes(origin)) { h['access-control-allow-origin'] = origin; h['vary'] = 'origin'; } res.writeHead(status, h); res.end(JSON.stringify(body)); };
http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (req.method === 'OPTIONS') { res.writeHead(204, { 'access-control-allow-origin': ORIGINS.includes(origin) ? origin : '', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '600' }); return res.end(); }
  if (req.method === 'GET' && req.url === '/health') return send(res, 200, { ok: true, upstream: new URL(BASE).host, model: MODEL || '(from request)', keyConfigured: true, busy }, origin);
  if (req.method === 'POST' && req.url === '/v1/chat/completions') {
    if (busy >= MAX_CONCURRENT) return send(res, 429, { error: { message: 'The language model is busy. Try again in a moment.' } }, origin);
    let raw = ''; for await (const c of req) { raw += c; if (raw.length > 64 * 1024) return send(res, 413, { error: { message: 'Request too large.' } }, origin); }
    let body; try { body = JSON.parse(raw); } catch (e) { return send(res, 400, { error: { message: 'Bad JSON.' } }, origin); }
    body.stream = false; if (process.env.LLM_THINKING !== '1') body.chat_template_kwargs = { enable_thinking: false };   // Qwen3.x "thinking" is far too slow on CPU; set LLM_THINKING=1 to allow it
body.max_tokens = Math.min(+body.max_tokens || MAX_TOKENS, MAX_TOKENS); if (MODEL) body.model = MODEL; if (!body.model) delete body.model;
    busy++; const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIMEOUT);
    try {
      const up = await fetch(BASE + '/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + KEY }, body: JSON.stringify(body), signal: ctl.signal });
      const text = await up.text(); res.writeHead(up.status, { 'content-type': 'application/json', ...(ORIGINS.includes(origin) ? { 'access-control-allow-origin': origin, vary: 'origin' } : {}) }); res.end(text);
    } catch (e) { send(res, 502, { error: { message: e.name === 'AbortError' ? 'The language model took too long.' : 'Could not reach the language model.' } }, origin); }
    finally { clearTimeout(t); busy--; }
    return;
  }
  send(res, 404, { error: { message: 'Not found.' } }, origin);
}).listen(PORT, '127.0.0.1', () => console.log(`Hisaab Aunty LLM proxy on http://127.0.0.1:${PORT} -> ${new URL(BASE).host} (key loaded, model ${MODEL || 'from request'})`));
