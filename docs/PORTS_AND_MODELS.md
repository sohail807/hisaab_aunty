# Ports and models (local prototype)

```
Browser page (5177)  ->  LLM proxy (8787)  ->  llama-server for each model (8080, 8081, ...)
```

| Port | What | Started with | Holds a key? |
|---|---|---|---|
| 5177 | The prototype page (phone + dashboard) | `node serve.js` in `prototype/` | no |
| 8787 | LLM proxy: lists models, adds the key, forwards the call | `LLM_API_KEY=... node llm-proxy.js` | yes (from the environment) |
| 8081 | llama-server running the team model `model-f16.gguf` | `llama-server.exe -m ...model-f16.gguf --port 8081 --api-key ...` | checks the key |
| 8080 | llama-server running Qwen3.5-4B Q4_K_M (test model) | same, `--port 8080` | checks the key |

## Which model is in use?
- Dashboard, **LLM** tab, **Model** dropdown: "In use now" names it. The dropdown reads `prototype/models.json` through the proxy and marks each model online or offline.
- The phone chat and the dashboard use the SAME choice. "Proxy default" means the `LLM_DEFAULT_MODEL` of the proxy (or the first model in `models.json`).
- **Aunty trace** tab, "Small language model" section: the `model` field shows which model answered that message.
- Terminal: `curl http://127.0.0.1:8787/health` shows the default; `curl http://127.0.0.1:8787/models` lists all and whether each is online.

## Switching or adding a model
1. Start its llama-server on a free port.
2. Add one entry to `prototype/models.json` (id, label, base_url, model, key_env). No secrets in that file.
3. Restart the proxy, press **Refresh** in the dashboard, pick the model, press **Save**.

## What changed when the team model replaced Qwen
- The proxy used to know one upstream (env variables). It now reads `models.json` (several models, one key variable each) and routes by the id the page sends. The old single-model env variables still work.
- The proxy turns Qwen "thinking" off by default (`LLM_THINKING=1` turns it on); thinking made each call take over 20 s.
- The proxy timeout is 60 s, the page timeout default is 60 s, because CPU models are slow.
- The validator (`intentToPlan`) now accepts amounts sent as text (`"450.0"`) and rejects a purchase check whose amount the user never typed.
- `serve.js` always serves the file next to it and sends no-cache. (An old copy of it, started from another folder, had been serving an outdated page.)
