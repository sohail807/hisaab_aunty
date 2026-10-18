# Hisaab Aunty: complete handover (read this first)

Written 18 October 2026, for a team (or an AI assistant) that knows nothing about the project. It is meant to be enough on its own. If you give only this file to an AI, it should understand the whole project, where everything lives, what was done, what works, what does not, and what to do next.

---

## 0. If you are an AI assistant, read this section first

1. **What this is.** "Hisaab Aunty" is a chat-first money coach for young Indians. A witty "Aunty" logs spends, shows what is left today, tracks goals. A small language model (SLM) that the team owns understands messy messages (English, Hinglish, typos). Plain code does all the maths.
2. **Golden rule: the model talks, code calculates.** A model never produces a rupee figure, date, or verdict. It only proposes a JSON action; validated code decides and acts. Full rules: `CLAUDE.md` (and `AGENTS.md`, same content) at the repo root. Read it before writing code.
3. **Where things are.** Code: `prototype/` (a runnable single-page prototype with a mock backend). Training: `prototype/training/`. Docs: `docs/`. GitHub: https://github.com/sohail807/hisaab_aunty (public, branch `main`). Local clone: `C:\Users\MohammedSohail\Documents\Hisaab Aunty`.
4. **Working agreements from the owner (follow these):**
   - Keep things simple and clean. Do not over-engineer. Do not create many new files.
   - **Never touch anything that is running** (a Colab run, a server on a port, a file in use, a Drive file in use). Never rename, move, overwrite or stop it. If unsure, create a new file or ask. If you need memory freed, ask first, then stop only the exact process you identified.
   - Training progress must always be saved (Drive checkpoints) so a disconnected session never restarts from zero.
   - Use real public data, not only examples we invent. Real people write in ways we did not think of.
   - Each real bug a user reports becomes a permanent automated test.
   - Be honest about results. Report numbers exactly, including when the new model is not better.
   - Notion is the project manager (`CLAUDE.md` section 11). Keep it in sync after changes. Currently the Notion connection needs re-authorisation (section 10, item 6).
   - Never put keys, tokens or passwords in GitHub or Notion.
   - The owner asked not to be shown unrequested safety lectures about the finance knowledge model. They are the product owner. One rule change is recorded and still needs lawyer and engineering sign-off (section 6).
5. **State today (18 Oct 2026):** the prototype works (415 automated checks pass), the new finance model is trained, converted, integrated and answers knowledge questions in the chat. No servers are currently running (they stop when a session ends). Start commands are in section 4.

---

## 1. The product in one page

- **Users:** young Indians (students, first jobs). **Voice:** witty, a little cheeky, mostly English with a light touch of the user's language. Teases habits, never people.
- **Core idea:** income minus rent, spread over the days of the month, gives a **daily budget**. Each spend reduces "left today". Goals are optional and there can be several; an overspend delays every goal.
- **Tabs:** Spend, Aunty (chat), Ledger, Goal. A floating **+** adds an expense or income. Aunty reacts to every entry.
- **Chat does:** log a spend ("chai 30", Hinglish "bhai swiggy pe 350 gaye"), check a purchase ("can I buy shoes for 2k?", "750 ka kurta lu ya nahi"), status, undo, queries ("is mahine kitna kharcha hua"), compare periods, goals by chat ("mujhe wedding ke liye save karna hai, around 5 lakh"), accounts, limits, streak, recap, income, correct the last spend, and (new) answer finance knowledge questions.
- **Scripted flows (never model-driven):** onboarding and goal setup (income, optional balance, rent, food, goal name, cost, deadline slider).
- **Money is stored as integer paise;** shown in Indian grouping (₹1,25,000).
- **Planned, not built:** real server (Node + Postgres), Android app (Expo), hosting. The prototype is the runnable specification for them.

---

## 2. Repository map (every file)

```
Hisaab Aunty/                         <- local path C:\Users\MohammedSohail\Documents\Hisaab Aunty
├─ CLAUDE.md, AGENTS.md               rules for AI coding assistants (golden rules, pipeline, voice, tests, definition of done)
├─ README.md                          short intro and run commands
├─ .env.example                       template for secrets (copy to .env, never commit .env)
├─ .gitignore                         ignores node_modules, .env, logs, __pycache__, last_eval_*.json
├─ docs/
│  ├─ HANDOVER.md                     THIS FILE (source of truth)
│  ├─ MODEL_PROGRESS_REPORT.md        manager report: results of both training rounds and the 100-question comparison
│  ├─ AI_BOUNDARIES.md                what the AI may and may not do; use-case matrix; decision on knowledge answers (needs sign-off)
│  ├─ SLM_INTEGRATION.md              how a small model is linked (older, still correct for the proxy idea)
│  ├─ PORTS_AND_MODELS.md             ports, models.json, how to switch models (updated for the finance model)
│  ├─ HISAAB_AUNTY_ENGINEERING_GUIDE.md  architecture, stack, timeline, design tokens (long reference)
│  ├─ TRAINING_GUIDE.md               STALE: describes the old 9-cell round-1 notebook. See section 7 here.
│  └─ TRAINING_CODE_EXPLAINED.md      STALE: line-by-line of the old notebook and train_lora.py. The code ideas still hold, cell layout changed.
└─ prototype/                         the runnable specification
   ├─ hisaab-aunty-prototype.html     BUILT single file (do not edit by hand; it is generated by build.js)
   ├─ build.js                        joins src/*.js + style.css into the one HTML; refuses a stray "</script"
   ├─ serve.js                        static server on http://localhost:5177 (serves the HTML next to it, no cache)
   ├─ run-tests.js                    runs all tests in Node (415 checks), including proxy tests with a fake model server
   ├─ llm-proxy.js                    key-holding proxy on port 8787: lists models, routes by model id, adds the key, forwards chat calls
   ├─ models.json                     registry of models (no secrets): team-finance-f16 (8082), team-model-f16 (8081), qwen3.5-4b-q4 (8080)
   ├─ blocks/*.txt                    old text snippets from earlier edits; not used by the build
   ├─ src/
   │  ├─ logic.js                     PURE money logic (==LOGIC== block): goal maths, daily budget, verdicts, amount/date parsing, goal naming
   │  ├─ backend.js                   mock server in the browser: DB over localStorage, auth, /v1 API routes, nudges, recaps, ledger
   │  ├─ aunty.js                     the Aunty engine: parser, validator, tools, goal flow, templates, guardrails, the chat turn
   │  ├─ llm.js                       model adapter: interpret (intent JSON), explain (knowledge answer), ping, models, health
   │  ├─ tests.js                     every automated check (logic, backend, Aunty, real-world cases, goals, knowledge, models)
   │  ├─ ui-phone.js                  phone UI, login screens, api() wrapper with single-flight token refresh
   │  ├─ ui-ledger.js                 Ledger tab, + button sheet with calculator, calendar, accounts, categories, limits
   │  ├─ ui-dash.js                   developer dashboard: Controls, Database, Calc engine, Aunty trace, LLM (model dropdown), Nudges, API console, Tests, Coverage
   │  └─ style.css
   └─ training/
      ├─ README.md                    STALE for training steps (round 1 flow). Still lists gen_dataset/eval_model/train_lora accurately.
      ├─ gen_dataset.js               makes the Hinglish intent data (212 templates, validator-checked, split per template)
      ├─ eval_model.js                scores a model on the 70-message intent test: valid JSON, intent, amounts, wrong writes, speed
      ├─ train_lora.py                LoRA fine-tune + merge; resumes from checkpoints; args --base --data --out --ckpt --epochs --rank ...
      ├─ train_colab.ipynb            THE Colab notebook (5 code cells) for round 2: collect data once, train, save to Drive, show answers
      ├─ fin/build_fin_data.py        builds real company-statement training data (SEC EDGAR US + Yahoo Finance India), answers computed in code
      ├─ bench/                       the 100-question fresh benchmark: ask100.js, make_fresh_stmt.py, analyze_fresh.js, fresh_stmt.json
      └─ data/                        train.jsonl (5,334) val.jsonl (871) test.jsonl (1,150): the Hinglish intent data used in round 1 and kept in round 2
```

**Build and generated files:** `hisaab-aunty-prototype.html` is generated; always edit `src/*.js` and then run `node build.js`.

---

## 3. How the app thinks (the Aunty pipeline)

File: `prototype/src/aunty.js`, function `auntyTurn`. Order must not change.

```
user message
 -> validate (1-500 chars) -> rate limit (20 per minute)
 -> scripted flow active (onboarding / goal setup)? handled by code, never the model
 -> Layer 1: deterministic parser  planPlan()  ("chai 30", "can I buy shoes for 2k", "undo", ...)
        understood  -> tools
        knowledge question -> model explains (section 6)
        not understood ("fallback") -> Layer 2
 -> Layer 2: the small model proposes ONE JSON intent (llm.interpret)
        -> intentToPlan() validator accepts or rejects -> tools (rejected = nothing runs, nothing is written)
 -> user-scoped tools + money logic produce figures
 -> reply from templates (compose) -> guardrails -> repair once -> plain template -> save + log (no message text) -> respond
```

**The 14 intents the model may propose:** `log_spend, check_purchase, status, undo, query, compare, goal_info, accounts, limits, streak, recap, ask, smalltalk, unknown`. Anything else is rejected. (A new internal route, `knowledge`, is chosen by the parser, not proposed by the model.)

**Tools** (server functions, validated): `log_spend, check_purchase, get_summary, undo_last_spend, query_spends, category_breakdown, compare_periods, what_if, get_goal_details, get_streak, get_latest_recap, get_recent_nudges, remember, list_memories, forget, set_category_limit, get_category_limits, get_accounts, checkin_today, mark_payday, log_income, set_income, edit_last_spend`.

**The parser (`planPlan`)** is a long list of rules in a fixed order. It handles English and Hinglish: filler words are stripped (`stripFiller`), amounts are read from digits ("2k", "5 lakh", "rs 750"), dates ("kal", "3 din pehle", "5th oct"), income statements ("monthly 5000 kamata hu" is income, not a spend), corrections ("5000 likh diya tha 500 hona chahiye"), loans and transfers (never saved as spends), foreign currency, negatives, settings questions, goal creation/change/name in a sentence, queries and periods, purchase questions in Hinglish ("lu ya nahi"), advice detection, and the knowledge route.

**The validator (`intentToPlan`)** enforces the contract: a spend needs its amount as digits in the user's message (words-only amounts become a question), maximum 5 spends, amount between 0 and ₹1 crore, unknown category becomes `other`, future or very old dates dropped, notes stripped, undo needs an undo word, a purchase check needs the amount typed by the user.

**Guardrails on every reply** (not applied to knowledge answers, see section 6): numbers must come from tool results, the context or the message (±₹1); regional words only from the approved list; no advice wording; no shaming; at most 3 sentences (6 for explanations), 150 words.

**Scripted goal setup** (`startGoalFlow`, `handleFlow`): steps income, balance, rent, food, goal, cost, months. A goal named in the sentence skips the goal step; an amount in the sentence ("around 5 lakh") skips the cost step; no income means income is asked first.

**Database (mock, in the browser):** tables `app_user, account, category, spend, income, goal, chat_message, checkin, device, insight, nudge, recap, refresh_token, ai_call_log`. Every query is filtered by `user_id` from the token. Spends are soft-deleted. **API routes** under `/v1`: auth (signup, login, refresh with rotation, logout, logout-all, change-password), me (get, patch, export, delete, payday), goal(s), spends (+restore), income, ledger, categories, accounts, chat (+edit, history), memories, checkins, streak, devices, nudges, recaps, summary, and dev routes.

---

## 4. Running things (commands)

All from `prototype/` unless stated. Node 20+ is needed (this PC has Node 24).

```bash
node build.js && node run-tests.js      # rebuild the page, run all 415 checks (must all pass)
node serve.js                           # page on http://localhost:5177
LLM_API_KEY=<a key you choose> LLM_DEFAULT_MODEL=team-finance-f16 node llm-proxy.js   # proxy on 8787
```

PowerShell form for the proxy:
```powershell
cd "$HOME\Documents\Hisaab Aunty\prototype"; $env:LLM_API_KEY="<key>"; $env:LLM_DEFAULT_MODEL="team-finance-f16"; node llm-proxy.js
```

Start a model server (llama.cpp, CPU build already on this PC). The `--api-key` must equal `LLM_API_KEY` above:
```powershell
cd "$HOME\Downloads\llama-b11580-bin-win-cpu-x64"
.\llama-server.exe -m "$HOME\Documents\Sent_model_finance\model-f16.gguf" --host 127.0.0.1 --port 8082 -c 4096 -t 8 -np 1 --api-key <key>
```
The finance model needs about 6 GB of free memory. This PC has 13.8 GB, so run only one full-size model at a time.

**Ports**

| Port | What |
|---|---|
| 5177 | the page (phone + dashboard) |
| 8787 | LLM proxy (holds the key, lists models at `/models`, health at `/health`) |
| 8082 | llama-server: finance model (`team-finance-f16`) |
| 8081 | llama-server: the original team model (`team-model-f16`, the GGUF in `DocumentsSent_model`) |
| 8080 | llama-server: Qwen3.5-4B Q4 test model (`qwen3.5-4b-q4`) |
| 8789, 8089 | scratch ports used only during tests / other projects. Do not rely on them. |

To check which model answers: dashboard, **LLM** tab, "In use now"; or the **Aunty trace** tab (shows the model on each message); or `curl http://127.0.0.1:8787/models`.

**Environment variables** (`.env.example`): `LLM_API_KEY` (required, the proxy refuses to start without it), `LLM_DEFAULT_MODEL`, `LLM_MODELS_FILE`, `LLM_BASE_URL`/`LLM_MODEL` (single-model mode), `PORT`, `ALLOW_ORIGIN`, `LLM_TIMEOUT_MS` (60000), `LLM_MAX_TOKENS` (400), `LLM_MAX_CONCURRENT` (2), `LLM_THINKING` (set 1 only for Qwen3.x thinking models; off by default because it is slow).

**The page uses the model through the proxy only;** the browser never holds the key.

---

## 5. The models: where they are and how they relate

Base model: **`Sent_model`**, the team's own small model (Qwen2-type architecture, about 3.1 billion parameters). Its earlier training record is not documented; the team still owes that. We did **not** shrink (quantise) it; all models are full 16-bit (`f16`).

| Model | What it is | Local path (this PC) | Google Drive (My Drive) |
|---|---|---|---|
| Original | `Sent_model`, as received | `C:\Users\MohammedSohail\Documents\Sent_model\` (`model.safetensors` 5.75 GB, tokenizer + config, and `model-f16.gguf` 5.75 GB) | `Sent_model/` |
| Round 1 | original + Hinglish intent training | `C:\Users\MohammedSohail\Documents\Sent_model_hinglish\model-f16.gguf` (only the GGUF is here; the weights are in `Downloadssent_model_hinglishmodel-001.safetensors`) | `Sent_model_hinglish/` (`model.safetensors`, tokenizer, config, `DATA_SOURCES.md`) |
| Round 2 (finance) | round 1 + finance, tax, banking, statements, English, Hindi/Hinglish training | `C:\Users\MohammedSohail\Documents\Sent_model_finance\` (config + tokenizer, `model-001.safetensors` as a hard link to the Downloads copy, `model-f16.gguf` 5.75 GB, `DATA_SOURCES.md`) | `Sent_model_finance/` (about 6 GB, with `DATA_SOURCES.md` listing every dataset) |

Other locations:
- Downloaded finance model: `C:\Users\MohammedSohail\Downloads\Sent_model_finance-20261016T054232Z-1-004\` (weights at the top, config in a `Sent_model_finance` sub-folder). The Documents copy links to this weights file; do not delete it.
- llama.cpp binaries (CPU, build b11580): `C:\Users\MohammedSohail\Downloads\llama-b11580-bin-win-cpu-x64\llama-server.exe`.
- llama.cpp source with the converter and its Python virtual environment: `C:\Users\MohammedSohail\Documents\llama.cpp-src\` (`convert_hf_to_gguf.py`, `.venv`).
- Drive training folders, under `Hisaab_work/` in My Drive: `mix` (round-1 data, old), `mix_finance` (round-2 training data and `sources.json`, `summary.txt`), `checkpoints_finance` (checkpoints; the last ones are kept), `fin_data` (the built company-statement data). Drive folder ids found by search: `Hisaab_work` 1tuvF5Cq4uY8M7Z9LWm185g8H-qUMBeyD, `mix_finance` 1UgrdpMjH-4uMS1d0kvXGPsrwLH0tJR_u, `checkpoints_finance` 1FE3fmXkLHIJNqzPmDSgRcwIl46ZLf3UR.
- Drive notebooks: `Hisaab_Aunty_train_FINAL.ipynb` is the owner's own copy used for round 1 (do not touch). Old ones were renamed `OLD_train_colab_DO_NOT_USE*.ipynb`.
- Do not copy, read or rename the big model files unless asked. Conversions read them but write only new files.

**Converting a trained model to GGUF** (needs config, tokenizer and the safetensors weights in ONE folder; this PC's converter venv has the libraries):
```powershell
$py="$HOME\Documents\llama.cpp-src\.venv\Scripts\python.exe"
& $py "$HOME\Documents\llama.cpp-src\convert_hf_to_gguf.py" "<model folder>" --outfile "<model folder>\model-f16.gguf" --outtype f16
```
Then add the model to `prototype/models.json` (new id, new port, `key_env: LLM_API_KEY`), start its llama-server, restart the proxy, press Refresh on the dashboard LLM tab.

---

## 6. The two jobs of the model in the app

1. **Intent proposal (fallback only).** If the parser does not understand a message, the model gets a narrow prompt (`SLM_PROMPT` in `llm.js`: the 14 intents, today's date and weekday, category names, nothing else; no money figures, no history) and returns one JSON object. `intentToPlan` validates it. Clear messages never reach the model.
2. **Knowledge answers (new, 16 Oct 2026).** For pure knowledge questions ("what is free cash flow?", "EMI aur SIP me kya fark hota hai?", "Section 80C kya hota hai?", "explain current ratio"), `knowQ` in the parser sends the question to `llm.explain()`: a plain chat call (prompt `KNOW_PROMPT` in `llm.js`, same system prompt the model was trained with, under 100 words). The reply is tidied (`tidyAnswer`: no markdown, repeated sentences removed, about 110 words, plus a note to double-check). **No tools, no writes, no user data go into this call.** Personal questions ("what is my budget", "what is left today"), spends ("SIP 2000" is still a payment to log) and advice asks ("should I invest in mutual funds?", "which SIP is best") do NOT use this route; advice still gets the polite decline.

**Rule change that needs sign-off:** golden rule 9 used to say Aunty refuses investment, tax, loan and insurance topics. The product owner decided Aunty should answer knowledge questions. This is recorded in `docs/AI_BOUNDARIES.md` as "Needs sign-off" (product owner decided; lawyer and engineering lead still to approve). Tests for the route are in the "Knowledge questions" group.

---

## 7. How training worked, step by step (the whole story)

### 7.1 Timeline

| Date | What happened |
|---|---|
| Early Oct | Prototype built with a mock backend and a calculation engine; web UI feedback rounds; many docs. |
| 12-13 Oct | Decided to use a small model instead of hosted ones. Team model `Sent_model` converted to GGUF (`model-f16.gguf`), served by llama.cpp, wired to the page through `llm-proxy.js`. Tested end to end (23/23 live cases passed). |
| 13-14 Oct | **Round 1:** Hinglish intent training in Colab (about 980 steps). |
| 14-16 Oct | **Round 2:** finance, tax, banking, statements, English, Hindi/Hinglish training in Colab (7,313 steps over several sessions). |
| 16 Oct | Converted, compared the three models on fresh questions, integrated the finance model into the app and added the knowledge route. |
| 18 Oct | This handover. |

Throughout, real bugs found by the owner's screenshots and by audits were fixed and turned into permanent tests (examples: income wrongly logged as spend, goals not captured from sentences, login race that logged users out, "should I buy" questions saved as spends).

### 7.2 Round 1 (Hinglish intent)

- **Data:** `training/gen_dataset.js` generates 212 phrasing templates in English, Hinglish and typos across the 14 intents. Every label is checked by the real validator. The split is per template, so test phrasings never appear in train. Output: `data/train.jsonl` (5,334), `val.jsonl` (871), `test.jsonl` (1,150). Public "do nothing" lines (Hinglish-Everyday-Conversations-1M, Banking77) teach it to say `unknown` for unrelated chat.
- **Result:** intent understanding on the local 70-message test went from 50% to 84%; in Colab's own exam it scored 93% (baseline 59%).
- **What it taught us:** the test showed the model reading "should I buy it?" ("750 ka kurta lu ya nahi") as a spend. That exposed a bug in OUR parser too, which saved such questions as spends. Fixed in code (commit 4749cda) with tests.

### 7.3 Round 2 (finance) data: about 120,000 examples, all public

Counts are exact, from `Drive/Hisaab_work/mix_finance/sources.json`. 117,022 used for training, 3,070 held back to check progress.

| Area | Examples | Source (Hugging Face dataset unless noted) |
|---|---|---|
| Finance Q&A | 14,000 | `Josephgflowers/Finance-Instruct-500k` |
| | 8,000 | `gbharti/finance-alpaca` |
| | 5,000 | `FinGPT/fingpt-fiqa_qa` |
| | 5,722 | `virattt/financial-qa-10K` (Q&A on real 10-K filings) |
| Real company statements | 20,653 | built by `training/fin/build_fin_data.py` from SEC EDGAR (S&P 500, up to 6 years) and Yahoo Finance via yfinance (NIFTY 500 list from NSE, 150 largest) |
| Income tax | 2,256 | `varshith7/income-tax-act-india` (Income Tax Act 1961, section text) |
| | 489 | `ThanniruVenkata/Income-Tax-Act-2025-Machine-Readable-Legal-Text` (the new Act, in force from 1 April 2026) |
| | 6,800 | `ligaments-dev/indian-income-tax-qa` |
| | 226 | `keerthan222/indian-tax-law-qa` |
| RBI banking | 9,000 | `Priyanshu-24/adaption-indian-finance-qa` |
| | 12,000 | `Vishva007/RBI-Circular-QA-Dataset` |
| English | 6,000 | `yahma/alpaca-cleaned` |
| | 5,000 | `databricks/databricks-dolly-15k` |
| Hindi / Hinglish | 4,000 | `ravithejads/samvaad-hi-filtered` |
| | 4,000 | `FreedomIntelligence/alpaca-gpt4-hindi` |
| | 1,012 | `smangrul/hinglish_self_instruct_v0` |
| | 8,000 | `Abhishekcr448/Hinglish-Everyday-Conversations-1M` (conversation lines as pairs) |
| Aunty's app | 5,334 | our own Hinglish intent examples (`training/data/train.jsonl`) |
| | 1,500 + 1,000 | Hinglish and Banking77 "do nothing" lines |

Not used on purpose: `Sujet-Finance-Instruct-177k` (mostly one-word labels), `AgamiAI/Indian-Income-Tax-Returns` (contains real PAN numbers and names). Dataset licences and Yahoo Finance's terms were **not reviewed**; this must happen before any commercial use.

**Company-statement data (`fin/build_fin_data.py`):** for each company-year it prints the full statement (income statement, balance sheet, cash-flow, about 26 lines), asks one of about 17 questions (current ratio, quick ratio, debt-to-equity, net debt, margins, ROE, ROA, asset turnover, days sales outstanding, cash conversion, free cash flow, payout ratio, interest coverage, revenue and income growth) and writes the worked answer with every number computed in code, so labels are always correct. Needs `SEC_USER_AGENT="Your Name your@email.com"` (the SEC requires it). Companies are split train/val/test by company.

### 7.4 How the training runs (the notebook)

Open in Colab: https://colab.research.google.com/github/sohail807/hisaab_aunty/blob/main/prototype/training/train_colab.ipynb (runtime: T4 GPU), then Runtime, Run all. Safe to re-run any time.

| Cell | What it does |
|---|---|
| 1 | Mounts Drive. Picks the base: `My Drive/Sent_model_hinglish` if present, else `Sent_model`. Sets folders: data `Hisaab_work/mix_finance`, progress `Hisaab_work/checkpoints_finance`, output `Sent_model_finance`. Settings: `EPOCHS=1`, `RANK=32`, `SEC_EMAIL`. |
| 2 | Installs transformers, peft, trl, datasets, accelerate, yfinance; removes torchao; clones the GitHub repo. |
| 3 | Collects all data **once** (each source in its own try/except; failures are skipped and listed), builds the statement data, writes `train.jsonl`, `val.jsonl`, `sources.json`, `summary.txt` to Drive. Re-runs reuse it. |
| 4 | Runs `train_lora.py`. Saves a checkpoint to Drive every 50 steps (keeps the last 2). On re-run it prints `continuing from saved progress` and resumes. At the end it merges the learning layer into a full model and writes `Sent_model_finance` straight to Drive. |
| 5 | Writes `DATA_SOURCES.md`, then prints the model's answers to eight questions to read. No pass/fail scoring (the owner asked for this). |

**Training settings (`train_lora.py`):** LoRA rank 32 (alpha 64, dropout 0.05) on all attention and MLP projections; batch 2 x 8 accumulation = 16 examples per step; learning rate 2e-4, cosine schedule, 3% warm-up; fp16 on a T4 (bf16 only on newer GPUs, because the T4's emulated bf16 crashes TRL); max length 1024 tokens; 1 pass over the data; loss counted only on the assistant's answer (prompt/completion format); evaluation every 250 steps on up to 300 held-out examples. Round 2: 7,313 steps at about 10.6 s per step, roughly 21 GPU hours, spread over several sessions. Held-out result at the end: loss 0.52, token accuracy 85.8%.

**Known setup gotchas (all solved in the notebook):** transformers 5.x is required for the tokenizer config; `warmup_ratio` does not exist in the new `SFTConfig` (computed warm-up steps are used); old Colab `torchao` breaks peft (uninstalled); on Windows the training loop cannot run (Triton kernel), so train only on Colab; Colab disconnects, so everything is checkpointed to Drive; an empty `--base` happens when a session restarts without cell 1.

---

## 8. Results (what the new model can and cannot do)

Full detail: `docs/MODEL_PROGRESS_REPORT.md`. Headline, on **100 fresh questions none of the models had seen**, same settings for all, greedy decoding, one model at a time on the same laptop:

| Test | Original | Round 1 | New (finance) |
|---|---|---|---|
| All 100 | 65% | 65% | **92%** |
| Numbers from real company statements (40; 20 new US and Indian companies; half worded in Hinglish) | 25% | 25% | **88%** |
| ...worded in Hinglish (18) | 22% | 17% | **94%** |
| Finance, tax, banking terms (60 multiple choice; half Hinglish) | 92% | 92% | **95%** |
| Aunty chat messages understood (earlier 70-message test) | 50% | 84% | **89%** |
| Wrong saves when the model is tested alone (must be 0 in the app) | 0 | 5 | 1 |

The one remaining wrong save is "4500 ka concert ticket lu ya nahi" taken as a spend by the raw model. The app's parser catches that pattern first, so users are protected, but the 0 target is not met at model level.

**It is good at:** reading statements and doing ratio arithmetic (US and Indian, English and Hinglish), basic finance, banking and tax terms, understanding Hinglish app messages with valid JSON and correct amounts.

**It is weak at (measured):** year-on-year growth calculations (0 of 3 right, near misses); recalling some tax limits as multiple choice (Section 80C, PPF tenure); some definitions in free-form answers (free cash flow, EMI vs SIP); short RBI answers; broken Hinglish when it writes finance answers; no current-year tax slabs; no live company data. It is not a CA or CFA. Live in the app (16 Oct): balance sheet and current ratio answers good; free cash flow and EMI vs SIP wrong.

**How to rerun the benchmark** (needs a model server on a port, and `LLM_API_KEY` set to the same key the server uses):
```bash
cd prototype/training/bench
LLM_API_KEY=<key> node ask100.js 8082 finance ./results      # also run for 'original' and 'round1' with their own servers
node analyze_fresh.js ./results                              # prints the comparison table
```
`fresh_stmt.json` is the fixed set of 40 statement questions. The 60 multiple-choice questions are inside `ask100.js`. The 70-message app test: `node training/eval_model.js --model <id> --n 70 --proxy http://127.0.0.1:8787` (needs the proxy and model running).

---

## 9. Tests (the safety net)

`node run-tests.js` runs 415 checks. Groups include: money logic vectors (plan numbers such as income 22,000, goal 26,000, deadline 11 Feb 2027), backend (auth, rotation, isolation, idempotency), the Aunty engine, "Real-world daily use", "No income yet", "Questions without an income", "Goals by chat", "Small language model path", "Knowledge questions", "LLM proxy" (refuses to start without a key, routes by model id, friendly errors), "Login session" (single-flight refresh). Rule: every real failure becomes a permanent test. A change is done only when tests pass.

---

## 10. Open items and recommended next steps

1. **Round 2b of training (recommended next):** add short glossary-style definitions of Indian finance, tax and banking terms in English, Hinglish and mixed sentences; free-form calculation questions in varied wordings; growth-calculation examples; longer RBI answers; a short CA-checked set of current tax limits and slabs; and a second pass over tax and RBI data. Start from `Sent_model_finance`; new Drive folders; keep the 50-step checkpoints. Re-test on a new fresh question set and keep the model only if it improves.
2. **Make the finance model the default in the app only after:** a CA reviews tax answers, and the free-cash-flow and EMI/SIP definitions are fixed. Today it is selectable and set as the proxy default only when you start the proxy that way.
3. **Sign-off** on the knowledge-answer rule change (lawyer, engineering lead).
4. **Licence and terms review** of every dataset and of Yahoo Finance data.
5. **CA Knowledge Base** (Notion database, empty on purpose): only rows marked "CA approved" may be used as facts by Aunty. The CA's name and the Sent_model training record are still owed by the team.
6. **Notion sync:** the Notion connection needs re-authorisation by the owner. Then sync: tasks, the rule-change decision, the model test results, docs links. HQ page: https://app.notion.com/p/3f84e39f4071817f94cdc175d50fa5e2 (databases: Tasks board, Decisions log, CA Knowledge Base, Model tests, Docs and links, Screens and features).
7. **Known small gaps in the parser:** "got paid 3000" marks payday but does not record the amount; "May" is not read as a month name; an old wrong entry has no warning.
8. **Stale docs:** `docs/TRAINING_GUIDE.md`, `docs/TRAINING_CODE_EXPLAINED.md` and the steps in `prototype/training/README.md` describe the old round-1 notebook; section 7 of this file is current.
9. **Later phases:** real server (Node, Fastify, Postgres), Android app (Expo), hosting decision (a VM or cloud instance running the model server and API), Account Aggregator only via a regulated partner.
10. **Speed:** on a laptop CPU a chat reply from the model takes about 6 seconds and a knowledge answer 6 to 15 seconds. A GPU host would be far faster.

---

## 11. Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Chat says "My language brain is not linked yet" | The proxy is not running or the key is missing. Start the proxy with `LLM_API_KEY` (section 4). |
| "Could not reach the language model" / "took too long" | The model server is not running on its port, or the CPU is busy. Start `llama-server`; check `curl http://127.0.0.1:8787/models`. Another heavy process on the PC slows it badly. |
| llama-server fails to load or is very slow | Not enough free memory (needs about 6 GB for an f16 3B model). Stop other large models first (ask the owner if they are theirs). |
| Page shows old behaviour after a code change | Run `node build.js`, then refresh. `serve.js` serves the file next to it with no cache. A copy of `serve.js` started from another folder serves a different (old) page. |
| Logged out everywhere | Parallel token refreshes. Fixed by the single-flight refresh in `ui-phone.js`; covered by "Login session" tests. |
| Colab: "starting fresh" instead of "continuing from saved progress" | The checkpoint folder is not found. Check `My Drive/Hisaab_work/checkpoints_finance` contains `checkpoint-NNN`. |
| Colab dataset skipped | Cell 3 lists skipped sources at the end (`SKIPPED`). Others still train. |
| `build.js` stops with `</script` | A string in the code contains the text `</script`; split it (for example `'<' + '/script'`). |
| Python not found on Windows | Use the `py` launcher. The converter has its own venv (section 5). |

---

## 12. Glossary

- **SLM:** small language model (here about 3 billion parameters, running on a laptop CPU).
- **GGUF / llama.cpp / llama-server:** the file format and program used to run the model locally with an OpenAI-style web API.
- **f16:** full 16-bit precision (not shrunk). **Quantised / Q4:** shrunk to fewer bits (not used for the team model).
- **LoRA:** training a small add-on layer instead of all weights, then merging it into the model.
- **Checkpoint:** a saved training state that lets a run resume.
- **Intent:** the action label the model proposes (for example `log_spend`).
- **Parser first:** clear messages never reach the model.
- **Wrong write:** the app would save a spend that the user did not mean. Must be 0.
- **Hinglish:** Hindi in Roman letters mixed with English.
- **EDGAR:** the US SEC's free database of company filings. **XBRL:** the structured format of those filings.
- **RBI / SEBI / IRDAI / NPCI:** Indian regulators of banks / markets / insurance / payments (UPI).
- **CA:** chartered accountant. **KYC:** know your customer. **TDS:** tax deducted at source. **80C:** a tax deduction section (old regime limit Rs 1.5 lakh).

---

## 13. Quick start for a new person (first 30 minutes)

1. Clone `https://github.com/sohail807/hisaab_aunty` (or use `C:\Users\MohammedSohail\Documents\Hisaab Aunty`). Read `CLAUDE.md`.
2. `cd prototype && node build.js && node run-tests.js` (expect 415 passed).
3. `node serve.js` and open http://localhost:5177 (sign up with any test email; the data lives in the browser).
4. To use a model: start a llama-server (section 4), then the proxy, then the dashboard LLM tab, pick the model, Save.
5. Try in the chat: `chai 30`, `arre 750 ka kurta lu ya nahi`, `mera is mahine kitna kharcha hua`, `what is a balance sheet?`.
6. Read `docs/MODEL_PROGRESS_REPORT.md` for the results and section 10 of this file for what to do next.
