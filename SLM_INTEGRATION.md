# Linking a small language model (SLM) to Hisaab Aunty

**Status:** built and tested in the prototype with a fake model. **Not yet run against a real model.** I have not benchmarked any SLM, and I have not verified the model names in the assessment you pasted (Qwen3.5-4B and others). Treat them as candidates for your own evaluation.

## 1. The idea in one picture

```
 message ─► Layer 1: deterministic parser  ──(understood)──► tools ─► templates ─► reply
                       │
                (not understood)
                       ▼
            Layer 2: small language model  ── proposes JSON intent only
                       │
                       ▼
            our validator (intentToPlan) ── rejects anything odd
                       │
                       ▼
            user-scoped tools + money logic ─► templates ─► guardrails ─► reply
```

- **The model never calculates, never writes to the database, and never writes the reply.** It only turns an unusual message into one of 14 intents.
- **Parser first.** "chai 30", "can I buy shoes for 2k?", "how am I doing", "undo" never reach the model, so they stay instant and free.
- **A financial write needs digits in the user's own message.** If the model proposes ₹50 from "fifty rupees ki coffee", Aunty asks the user to confirm with digits and saves nothing.
- **No key, no free-form chat.** Without a linked model, an unrecognised message gets a friendly "My language brain is not linked yet… ask your admin to add the LLM API key". Clear messages keep working.

## 2. What is in the code

| File | What it does |
|---|---|
| `src/llm.js` | The provider adapter (`makeLLM`): the narrow intent prompt (`SLM_PROMPT`), the JSON schema, `interpret()`, `ping()`, `health()`. Speaks the OpenAI-compatible `/v1/chat/completions` API. |
| `src/aunty.js` | `intentToPlan()` validates a proposal. `auntyTurn()` routes: parser first, model second, safe fallback third. |
| `llm-proxy.js` | A small proxy that **holds the API key**. It refuses to start without `LLM_API_KEY`. The browser never sees the key. |
| `.env.example` | The variables the proxy (and later the real server) reads. |
| Dashboard, **LLM** tab | Enter the proxy URL, test the connection, and try a message to see the proposal and what would run. |

## 3. How to use it (step by step)

### Step 1: run your model behind an OpenAI-compatible endpoint
Your team's model server may already do this. If you want to run a small model yourself with **llama.cpp**:

```bash
llama-server -m ./your-model-q4_k_m.gguf --host 127.0.0.1 --port 8080 -c 4096 -t 4 --api-key YOUR_KEY
```

Flags change between versions: check `llama-server --help`. Use a 4-bit quantised GGUF, a 4K to 8K context, and one or two parallel requests on a CPU machine. Ollama also exposes `/v1` and works the same way.

### Step 2: start the proxy (the key lives here, not in the page)
```bash
LLM_BASE_URL=http://127.0.0.1:8080/v1 LLM_API_KEY=YOUR_KEY LLM_MODEL=your-model-name node llm-proxy.js
```
On Windows PowerShell:
```powershell
$env:LLM_BASE_URL="http://127.0.0.1:8080/v1"; $env:LLM_API_KEY="YOUR_KEY"; $env:LLM_MODEL="your-model-name"; node llm-proxy.js
```
It listens on `http://127.0.0.1:8787`. If your team's endpoint is hosted, use its URL as `LLM_BASE_URL` and the team's key as `LLM_API_KEY`.

### Step 3: link it in the prototype
Open the prototype, go to the dashboard **LLM** tab, keep the proxy URL `http://localhost:8787`, switch the toggle on, press **Save**, then **Test connection**. Use **Interpret** to try messages the parser cannot handle, such as "pichle hafte se is hafte kitna zyada gaya". You will see the model's JSON, whether our validator accepted it, and which tools would run.

### Step 4: use it in chat
Type the same message in the phone's chat. The **Aunty trace** tab now has a "Small language model" section showing the proposal, the decision, tokens and milliseconds.

## 4. Do not put the key in the app
The prototype runs in a browser, so a key typed into it would be visible to anyone with the page. That is why the key is only in the proxy's environment. In the real build, the Fastify server reads `LLM_API_KEY` from its secret store and calls the endpoint directly. The Android app never holds it.

## 5. Moving this into the real server
`src/llm.js` becomes `apps/server/src/aunty/providers/openai-compatible.ts` behind one interface, so Claude and a small model are interchangeable:

```ts
export interface AuntyProvider {
  configured(): boolean;
  interpret(msg: string, ctx: { today: string; weekday: string; categories: string[] }): Promise<{ obj: unknown; ms: number; model: string; tokensIn?: number; tokensOut?: number }>;
}
```

- `intentToPlan` moves to `apps/server/src/aunty/intents.ts` with Zod schemas instead of hand checks. Keep every rule in the tests.
- Environment variables: `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`, `LLM_TIMEOUT_MS`, `LLM_MAX_CONCURRENT`.
- Run inference as a **separate private service** (8 to 16 GB CPU machine to start). The 512 MB to 1 GB API tasks in the hosting plan cannot hold a model.
- Keep concurrency low and queue requests. A CPU model reads a prompt slowly, so keep the prompt short (the narrow intent prompt is about 350 tokens, not the 3,500 of the Claude design) and cap the reply at 220 tokens.
- Switching from Claude is not just changing `CHAT_MODEL`: message format, tool calling, streaming and errors differ, which is why the adapter exists.

## 6. What to evaluate before choosing a model
Use the evaluation set in the engineering guide plus realistic Hinglish, corrections, dates and ambiguous amounts. For each candidate measure:

| Measure | Why |
|---|---|
| Intent accuracy and valid-JSON rate | Core job |
| Wrong writes (must be zero) | Our validator should block them; count how often it has to |
| Unsupported figures in replies | Replies come from templates, so this should be zero |
| Hinglish and typo handling | The reason for using a model at all |
| Fallback frequency | How often it says "not sure" |
| End-to-end latency, alone and with 2 to 5 concurrent users | The plan's 15 s limit |

Start without fine-tuning. Decide the model after the numbers, not before.

## 7. Safety rules that stay in force
Every tool is scoped to the signed-in user. Notes from the model are stripped of symbols. Unknown categories become "other", future dates are dropped, amounts are capped, at most five spends per message, rejected output runs nothing, and model errors fall back to a kind message while the parser keeps working. Logs record tokens and latency, never message text or the key.
