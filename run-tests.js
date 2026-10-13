const vm = require('vm'), fs = require('fs'), http = require('http'), { spawn, spawnSync } = require('child_process');
const files = ['logic', 'backend', 'aunty', 'llm', 'tests'].map(f => fs.readFileSync('src/' + f + '.js', 'utf8')).join('\n');
vm.runInThisContext(files + '\nglobalThis.__t={runLogicTests,runBackendTests,makeLLM};');

// end-to-end check of the LLM proxy against a fake OpenAI-compatible upstream (Node only)
async function proxyTests() {
  const T = []; const add = (name, ok, detail) => T.push({ group: 'LLM proxy', name, ok: !!ok, detail: detail == null ? '' : String(detail) });
  const noKey = spawnSync(process.execPath, ['llm-proxy.js'], { env: { PATH: process.env.PATH, LLM_BASE_URL: 'http://127.0.0.1:1/v1' }, encoding: 'utf8' });
  add('the proxy refuses to start without LLM_API_KEY', noKey.status === 1 && /LLM_API_KEY/.test(noKey.stderr), noKey.stderr.slice(0, 80));
  let seen = null;
  const up = http.createServer((q, s) => { let b = ''; q.on('data', c => b += c); q.on('end', () => { seen = { auth: q.headers.authorization, url: q.url, body: JSON.parse(b) }; s.setHeader('content-type', 'application/json'); s.end(JSON.stringify({ model: 'qwen-test', usage: { prompt_tokens: 321, completion_tokens: 21 }, choices: [{ message: { content: 'Sure: {"intent":"status","period":"week"}' } }] })); }); });
  await new Promise(r => up.listen(0, '127.0.0.1', r)); const upPort = up.address().port;
  const proxy = spawn(process.execPath, ['llm-proxy.js'], { env: { PATH: process.env.PATH, LLM_BASE_URL: `http://127.0.0.1:${upPort}/v1`, LLM_API_KEY: 'secret-test-key', LLM_MODEL: 'qwen-test', PORT: '8791', ALLOW_ORIGIN: 'http://localhost:5177' }, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = ''; proxy.stdout.on('data', d => out += d); proxy.stderr.on('data', d => out += d);
  await new Promise(r => { const t = setInterval(() => { if (/LLM proxy on/.test(out)) { clearInterval(t); r(); } }, 50); });
  try {
    const llm = __t.makeLLM({ llm: { enabled: true, proxyUrl: 'http://127.0.0.1:8791', model: '' } });
    const h = await llm.health(); add('health reports the key is configured but never returns it', h.ok && h.keyConfigured === true && !JSON.stringify(h).includes('secret-test-key'), JSON.stringify(h));
    const r = await llm.interpret('is hafte kitna gaya', { today: '2026-10-12', weekday: 'monday', categories: ['food (Food delivery)'] });
    add('interpret: the proxy adds the Authorization header, the browser never sends a key', seen && seen.auth === 'Bearer secret-test-key' && seen.url === '/v1/chat/completions', JSON.stringify(seen && seen.auth));
    add('interpret: parses the JSON object out of the model text and reports tokens', r.obj && r.obj.intent === 'status' && r.tokens_in === 321 && r.model === 'qwen-test', JSON.stringify(r.obj));
    add('interpret: asks for temperature 0, a small token cap, no streaming, and a JSON schema', seen.body.temperature === 0 && seen.body.max_tokens <= 220 && seen.body.stream === false && seen.body.response_format && seen.body.response_format.type === 'json_schema' && seen.body.messages[0].role === 'system' && seen.body.messages[1].content === 'is hafte kitna gaya');
    add('interpret: the model only sees the narrow intent prompt, today, categories (no 20-tool list, no money figures)', /Today is 2026-10-12/.test(seen.body.messages[0].content) && !/log_spend\(/.test(seen.body.messages[0].content) && !seen.body.tools);
    add('the proxy forces the configured model name', seen.body.model === 'qwen-test');
    const bad = await fetch('http://127.0.0.1:8791/nope'); add('unknown paths are 404', bad.status === 404);
    const cors = await fetch('http://127.0.0.1:8791/health', { headers: { origin: 'http://evil.example' } }); add('CORS: other origins get no allow header', !cors.headers.get('access-control-allow-origin'));
    const ok = await fetch('http://127.0.0.1:8791/health', { headers: { origin: 'http://localhost:5177' } }); add('CORS: the prototype origin is allowed', ok.headers.get('access-control-allow-origin') === 'http://localhost:5177');
    add('the proxy never logs message text or the key', !/is hafte kitna gaya|secret-test-key/.test(out), out.slice(0, 120));
  } catch (e) { add('proxy end-to-end run', false, e.stack); }
  await new Promise(res => { proxy.once('exit', res); proxy.kill(); }); up.closeAllConnections && up.closeAllConnections(); up.close(); return T;
}
(async () => {
  const a = __t.runLogicTests(), b = await __t.runBackendTests(), c = await proxyTests(); const all = a.concat(b, c);
  all.filter(t => !t.ok).forEach(t => console.log('FAIL [' + t.group + '] ' + t.name + '\n     -> ' + t.detail));
  console.log(all.filter(t => t.ok).length + '/' + all.length + ' passed');
  setTimeout(() => process.exit(0), 200);
})().catch(e => { console.log('CRASH', e); process.exit(1); });
