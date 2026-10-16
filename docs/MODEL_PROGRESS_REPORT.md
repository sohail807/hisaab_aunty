# Hisaab Aunty: language model progress report

Period: 14 to 16 October 2026. Prepared for: project manager.

## 1. Summary

- We took our own small language model (about 3 billion parameters, called `Sent_model`) and taught it in two rounds. Round 1 taught it how Indians really write to a money app (Hinglish). Round 2 taught it finance, Indian income tax, RBI banking rules and how to read company financial statements.
- **Round 2 training is finished.** It trained on about 117,000 examples from public data and took about 21 hours of GPU time (7,313 steps), spread over several Google Colab sessions. Progress was saved to Google Drive every 50 steps, so no session loss cost us more than about 9 minutes.
- **Where it is clearly better:** reading real company statements (46% right to 75% right on companies it never saw), Indian income-tax rules, and understanding the messages Aunty's chat must act on (50% to 89%).
- **Where it is not yet better:** a few basic finance terms (free cash flow, EMI vs SIP) and step-by-step reasoning when a question is worded differently. These are fixable with more targeted data (section 8).
- **Not yet in the app.** The new model is converted and tested locally, but we have not made it Aunty's default. The app still protects users with its own checks (section 7).

## 2. Goal

Make one model that knows Indian money and finance terms, whether a user types them in English, Hinglish or a mix, and that can read financial statements the way an analyst does. The model's job in the app is to understand the user. All money figures in the app come from code, not from the model.

## 3. What was built

| Step | What | Result |
|---|---|---|
| Round 1 (14 Oct) | Hinglish intent training on our own examples plus public chat data | Understanding of app messages went from 50% to 84% in our local test |
| Round 2 (14 to 16 Oct) | Finance, tax, banking and statements training on public data | See sections 5 and 6 |
| Data builder | A script that pulls real company statements (US: SEC EDGAR, India: Yahoo Finance) and writes worked answers where every number is computed in code | 20,653 examples from about 500 US and 150 Indian companies |
| Training notebook | One Google Colab notebook that collects the data once, trains, saves progress to Drive and resumes after a disconnect | Used for the whole run |

Everything is in our GitHub repo (`prototype/training`).

## 4. Data used (all public, about 120,000 examples)

| Area | Examples | Sources |
|---|---|---|
| Finance Q&A with worked answers | 32,722 | Finance-Instruct-500k, finance-alpaca, FiQA, financial-qa-10K (Q&A on real 10-K filings) |
| Real company financial statements (income statement, balance sheet, cash flow) | 20,653 | SEC EDGAR (S&P 500) and Yahoo Finance (NIFTY). Answers computed in code |
| Indian income tax | 9,771 | Income Tax Act 1961 (2,256 sections), Income-tax Act 2025 (489 sections, the current law, in force from 1 April 2026), two tax Q&A sets |
| RBI banking regulation | 21,000 | RBI explained Q&A, and Q&A on real RBI circulars |
| English instructions | 11,000 | alpaca-cleaned, Dolly-15k |
| Hindi and Hinglish | 17,012 | alpaca-gpt4-hindi, samvaad-hi, hinglish_self_instruct, Hinglish everyday conversations |
| Aunty's own app messages | 7,834 | Our GitHub Hinglish examples and "do nothing" lines |

All of these loaded; nothing was skipped. Exact counts are saved in Drive (`mix_finance/sources.json`).

## 5. How training worked (in simple terms)

- The model reads a question, tries to write the answer, and is corrected on every word of the answer. It learns from full written answers, not only labels.
- It uses a small learning layer on top of the model (called LoRA), so we do not retrain all 3 billion parameters.
- 7,313 steps of 16 examples each, one pass over all the data. A free Google GPU (T4) did the work.
- Progress was saved to Google Drive every 50 steps and training resumed after each disconnect. This is the fix for the earlier problem where a disconnect meant starting over.
- On held-out examples at the end: loss 0.52 and 85.8% word-by-word accuracy. Training loss fell from about 1.4 at the start to about 1.0 on average.

## 6. Results: comparison of three models

We tested the original model, round 1, and the new round 2 finance model with the same settings and the same questions. Models were tested one at a time on the same laptop.

| Test | Original | Round 1 (Hinglish) | Round 2 (Finance) |
|---|---|---|---|
| **A. Reading real company statements.** 24 questions from 16 US and Indian companies the model never saw. Answers are computed in code | 11 of 24 (46%) | 11 of 24 (46%) | **18 of 24 (75%)** |
| ...Indian companies only (10 questions) | 3 of 10 | not split | **8 of 10** |
| ...misses by round 2 | | | all close (within 1 to 10%), none wild |
| **B. Understanding Aunty's chat messages.** 70 messages the model never saw | 50% | 84% | **89%** |
| Valid structured reply | not recorded | 100% | 100% |
| Right amounts on spend messages | 88% | 100% | 100% |
| Wrong saves when tested alone (should be 0) | 0 | 5 | 1 |
| Median reply time for a chat message | 8 s | 5.7 s | 6.4 s |
| Average time for a statement answer | 38 s | 38 s | **22 s** |

**Why the original model is not at 0% in test A.** It already knows basic finance from its general training, and many questions state the formula in the question itself, so a general model can divide the numbers about half the time. The original did well on one-step ratios (asset turnover 3 of 3, debt-to-equity 2 of 2) and scored 0 on the multi-step ones (revenue growth 0 of 3, cash conversion 0 of 3, quick ratio 0 of 2). The training effect is the move from 46% to 75%, and from 3 of 10 to 8 of 10 on Indian companies.

**C. Eight general questions** (judged by us; accuracy of tax figures should be confirmed by a CA):

| Question | Original | Round 1 | Round 2 |
|---|---|---|---|
| Balance sheet vs cash flow statement | Good | Good | Good |
| Current ratio from two numbers | Good | Good | Good |
| What is free cash flow | Right formula | Wrong | Wrong |
| EMI vs SIP, in Hinglish | Poor | Best of three | Poor |
| Is profit backed by cash (given two numbers) | Right | Right | Wrong |
| Section 80C | Generic | Long list, some wrong items | Right limit (Rs 1.5 lakh), old regime |
| TDS on professional fees, Section 194J | Wrong | Wrong | 10% (matches our recollection) |
| RBI expectations for KYC | Detailed | Detailed | Too short |

## 7. What the model can do now

- Explain core finance ideas clearly in English, and follow questions asked in Hinglish.
- Read a real company statement (income statement, balance sheet, cash flow) and work out ratios with the steps shown: liquidity, leverage, margins, returns, cash conversion, free cash flow, growth. About 75% correct on companies it has never seen, and the misses are close.
- Know parts of Indian income tax (Section 80C limit, TDS rate on professional fees) and the text of the new Income-tax Act 2025.
- Understand about 89% of the messages Aunty's chat gets, return a valid structured reply every time and read amounts correctly every time.

**What keeps users safe in the app:** the model only proposes. A parser reads clear messages first, and a validator checks every proposal before anything is saved. Money is never written unless the amount is in the message as digits. The one wrong save in test B ("4500 ka concert ticket lu ya nahi" taken as a spend) is caught by the parser before the model is ever asked. The app's 399 automated checks pass.

## 8. What it cannot do yet, and why

- **Some basic terms are shaky** (free cash flow, EMI vs SIP). Round 2 data had few clear definitions of everyday terms.
- **Reasoning when a question is worded differently** (profit vs cash). Most statement examples came from fixed templates.
- **Detailed RBI answers.** The new model answers in one sentence where older models gave a detailed list.
- **Hinglish finance answers are not fluent.** It understands Hinglish questions but writes finance answers in broken Hinglish.
- **No current-year tax slabs or deductions.** The Act text is in the data, but no Budget slab tables are.
- **No live company data.** It learned how to read statements, not each company's latest figures.
- **It is not a CA or a CFA.** At this size (3 billion parameters), exact facts are recalled unevenly after one pass.

## 9. Risks and open items

- **Test size.** The tests are small (24 statement questions, 8 general questions, 70 chat messages). Please read the numbers as a first indication, not a final grade.
- **Data quality.** Some Q&A sets (tax and RBI) look machine-written, and we have not checked their accuracy.
- **Licences.** Dataset licences and the Yahoo Finance terms have not been reviewed. This must be done before any commercial release.
- **Tax accuracy.** Tax answers need a CA review before users rely on them.
- **Speed.** On a laptop CPU a chat reply takes about 6 seconds and a long answer 20 to 60 seconds. A hosted GPU would be much faster.

## 10. Next steps

1. **Round 2b: term awareness.** Add short, clear definitions of Indian finance, tax and banking terms (TDS, ITR, EMI, SIP, FD, NEFT, UPI, CIBIL, GST, free cash flow and more), explained in English, Hinglish and mixed in the same answer. Add long worked-reasoning answers in different wordings, and a second pass over the tax and RBI data.
2. **Check again** against the same tests and keep the new model only if it improves.
3. **Connect to the app.** Add the finance model to the model list, test the app end to end, and make it the default only if it passes.
4. **CA review.** Fill the CA Knowledge Base and have a CA check the tax answers and a set of current rules (slabs and deductions).
5. **Licence and terms review** of every data source, and a decision on hosting.

## 11. Where everything is

- Code, notebook and data scripts: github.com/sohail807/hisaab_aunty (`prototype/training`).
- Trained model: Google Drive, `Sent_model_finance` (about 6 GB), with a credits file listing every dataset (`DATA_SOURCES.md`).
- Training data and progress: Google Drive, `Hisaab_work` (`mix_finance`, `checkpoints_finance`).
