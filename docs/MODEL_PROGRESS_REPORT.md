# Hisaab Aunty: language model progress report

Period: 14 to 16 October 2026. Prepared for: project manager.

## 1. Summary

We took our own small language model (about 3 billion parameters, `Sent_model`) and taught it in two rounds. Round 1 taught it how Indians really write to a money app (Hinglish). Round 2 taught it finance, Indian income tax, RBI banking rules, and how to read company financial statements (balance sheet, income statement, cash flow) of large US and Indian companies. Round 2 trained on about 117,000 examples from public data and is finished.

We then tested the original model, round 1 and the new model on **100 brand-new questions** that none of them had seen, with the same settings for all three.

| | Original | Round 1 | **New model** |
|---|---|---|---|
| **All 100 fresh questions** | 65% | 65% | **92%** |
| Working out numbers from real company statements (40 questions, 20 new companies) | 25% | 25% | **88%** |
| ...of which questions worded in Hinglish (18) | 22% | 17% | **94%** |
| Knowing finance, tax and banking terms (60 multiple-choice questions, half Hinglish) | 92% | 92% | **95%** |
| Understanding Aunty's chat messages (earlier test, 70 messages) | 50% | 84% | **89%** |

**In one line:** the new model is far better at reading company statements and doing the finance arithmetic, including when the question is in Hinglish. On knowing terms it is slightly better, but the older models already knew most of them. It is not yet in the app.

## 2. Goal

One model that knows Indian money and finance terms whether a user writes in English, Hinglish or a mix, and that can read financial statements the way an analyst does. English, Hinglish and finance are one pool of knowledge, not separate tracks. In the app the model only proposes; all money figures come from code.

## 3. What was built

| Step | What | Result |
|---|---|---|
| Round 1 (14 Oct) | Hinglish intent training on our own examples plus public chat data | Chat understanding 50% to 84% |
| Round 2 (14 to 16 Oct) | Finance, tax, banking and statements training on public data | Sections 1 and 5 |
| Data builder | A script that pulls real company statements (US: SEC EDGAR, India: Yahoo Finance) and writes worked answers with every number computed in code | 20,653 examples from about 500 US and 150 Indian companies |
| Training notebook | One Google Colab notebook: collects the data once, trains, saves progress to Drive, resumes after a disconnect | Used for the whole run |

All code is in our GitHub repo (`prototype/training`).

## 4. Data used (all public, about 120,000 examples)

| Area | Examples | Sources |
|---|---|---|
| Finance Q&A with worked answers | 32,722 | Finance-Instruct-500k, finance-alpaca, FiQA, financial-qa-10K (Q&A on real 10-K filings) |
| Real company financial statements | 20,653 | SEC EDGAR (S&P 500) and Yahoo Finance (NIFTY). Answers computed in code |
| Indian income tax | 9,771 | Income Tax Act 1961 (2,256 sections), Income-tax Act 2025 (489 sections, in force from 1 April 2026), two tax Q&A sets |
| RBI banking regulation | 21,000 | RBI explained Q&A, and Q&A on real RBI circulars |
| English instructions | 11,000 | alpaca-cleaned, Dolly-15k |
| Hindi and Hinglish | 17,012 | alpaca-gpt4-hindi, samvaad-hi, hinglish_self_instruct, Hinglish everyday conversations |
| Aunty's own app messages | 7,834 | Our GitHub Hinglish examples and "do nothing" lines |

All sources loaded and nothing was skipped. Exact counts are saved in Drive (`mix_finance/sources.json`).

## 5. Results in detail

### 5.1 Fresh 100-question test (main evidence)

| Test | Original | Round 1 | New model |
|---|---|---|---|
| **All 100** | 65 | 65 | **92** |
| **Statements: numbers (40)** | 10 (25%) | 10 (25%) | **35 (88%)** |
| worded in English (22) | 6 | 7 | 18 |
| worded in Hinglish (18) | 4 | 3 | **17** |
| US companies (19) | 5 | 3 | 17 |
| Indian companies (21) | 5 | 7 | **18** |
| **Terms: multiple choice (60)** | 55 (92%) | 55 (92%) | 57 (95%) |
| English (30) | 28 | 27 | 28 |
| Hinglish (30) | 27 | 28 | 29 |
| finance basics (12) | 10 | 11 | 11 |
| banking (15) | 14 | 14 | 15 |
| tax (10) | 8 | 7 | 8 |
| statement terms (23) | 23 | 23 | 23 |

How to read it:
- **The big gain is working with numbers.** On statements from companies it never saw, the new model gets 35 of 40 right. The older models get 10. Where the older models failed, they gave wildly wrong numbers (for example 14,246 instead of 7.3% growth), mixed up percentages and decimals, or invented web links.
- **Hinglish is covered.** When the question was asked in Hinglish, the new model still got 17 of 18, so it understands the finance terms in Hinglish too.
- **Term knowledge improved only a little.** The older models already knew most of these terms (92%), so there was little room. The new model gets 95%, and was right on 2 questions where both others were wrong, and wrong on none where both others were right.

### 5.2 Earlier tests (also on questions the model had not trained on)

| Test | Original | Round 1 | New model |
|---|---|---|---|
| Statement questions (24, 16 other companies) | 11 | 11 | 18 |
| Aunty chat messages understood (70) | 50% | 84% | 89% |
| Valid structured reply / right amounts | n/a / 88% | 100% / 100% | 100% / 100% |
| Wrong saves when tested alone (should be 0) | 0 | 5 | 1 |
| Time to answer a statement question | 38 s | 38 s | 22 s |

The one wrong save is "4500 ka concert ticket lu ya nahi" (a "should I buy it?" question) read as a spend. The app's parser catches that pattern before the model is asked.

## 6. What the model is aware of now

- **Finance and statement terms:** balance sheet, cash flow, current ratio, quick ratio, debt-to-equity, margins, ROE, ROA, asset turnover, free cash flow, payout ratio, net debt, days sales outstanding, working capital, EBITDA, retained earnings, depreciation. It works these out step by step from a real statement.
- **Indian banking and payments:** UPI, NEFT, RTGS, KYC, repo rate, CIBIL, and who regulates what (RBI, SEBI, IRDAI, NPCI).
- **Indian tax terms:** GST, TDS, ITR, PAN, Form 16, Section 80C and the text of the new Income-tax Act 2025.
- **Language:** it follows questions in English, Hinglish and mixed.
- **Aunty's chat:** it understands about 89% of the messages the app must act on.

## 7. What can still be improved

| Gap | Evidence | Plan |
|---|---|---|
| Year-on-year growth calculations | 0 of 3 right (close, for example 7.8 instead of 7.3) | More growth and change-over-time worked examples |
| Tax limits recalled wrongly | Missed the Section 80C limit and the PPF tenure as multiple choice, even though it gave the right 80C limit when asked to explain | Short CA-checked set of current limits and rules, learned several times |
| A few basic ideas in free-form answers (free cash flow, EMI vs SIP, profit vs cash) | Earlier 8-question test | Glossary-style definitions in English, Hinglish and mixed |
| Detailed RBI answers | One-sentence answers where older models gave a list | Longer RBI answers in training |
| Fluent Hinglish finance answers | Understands Hinglish, writes finance answers in broken Hinglish | Clean Hinglish finance explanations |
| Current-year tax slabs and deductions | Not in the data | Official Budget figures, checked by the CA |

## 8. Safety in the app

The model only proposes. A parser reads clear messages first, and a validator checks every proposal before anything is saved. Money is never written unless the amount is in the message as digits, and all rupee figures come from code. The app's 399 automated checks pass.

## 9. Risks and open items

- **Test size and authorship.** The fresh test has 100 questions, which I wrote. The multiple-choice part is easy (25% by chance), so it cannot show large gains. Please treat numbers as a strong first indication.
- **Data quality.** Some tax and RBI Q&A sets look machine-written and have not been checked for accuracy.
- **Licences and terms.** Dataset licences and Yahoo Finance's terms have not been reviewed. This must be done before any commercial release.
- **Tax accuracy.** A CA must review tax answers before users rely on them.
- **Speed.** On a laptop CPU a chat reply takes about 6 seconds and a statement answer about 20 seconds. A hosted GPU would be much faster.

## 10. Next steps

1. **Round 2b:** add the glossary-style term definitions, growth-calculation examples, longer RBI answers and a short CA-checked set of current tax rules, then a second pass over the tax and RBI data.
2. **Re-test** on a second fresh set of questions and keep the new round only if it improves.
3. **Connect to the app:** add the model to the app's model list, test the chat end to end, and make it the default only if it passes.
4. **CA review** of tax answers and the knowledge base.
5. **Licence and terms review** of every source, and a hosting decision.

## 11. How the tests were done

- **Statement questions:** real statements of 20 companies not used in training, 12 US and Indian technology and consumer companies (for example Roblox, Twilio, Okta, Cloudflare, Tata Elxsi, KPIT, Persistent). The correct answer is computed in code. A model answer counts as right if it is within about 0.5% (or 0.15 percentage points for percentages).
- **Term questions:** 60 multiple-choice questions with four options each, shuffled the same way for every model, answered with a single letter.
- **Settings:** the same prompts, greedy decoding (no randomness) and the same laptop for all three models, one model at a time.

## 12. Where everything is

- Code, notebook and data scripts: github.com/sohail807/hisaab_aunty (`prototype/training`).
- Trained model: Google Drive, `Sent_model_finance` (about 6 GB), with a credits file listing every dataset (`DATA_SOURCES.md`).
- Training data and progress: Google Drive, `Hisaab_work` (`mix_finance`, `checkpoints_finance`).
