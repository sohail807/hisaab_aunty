// node ask100.js <port> <label> [outDir] : (needs LLM_API_KEY if llama-server was started with --api-key) the same 100 fresh questions for one model, 4 at a time. 40 statements (numbers) + 60 multiple choice (terms).
const fs = require('fs'), path = require('path'), dir = __dirname, port = process.argv[2], label = process.argv[3], outDir = process.argv[4] || process.cwd();
const ST = JSON.parse(fs.readFileSync(path.join(dir, 'fresh_stmt.json'), 'utf8'));
// [language, area, question, right answer, three wrong answers]
const MC = [
['en','banking','What does UPI stand for?','Unified Payments Interface','Universal Payment Instrument','United Payments Index','Unique Personal Identity'],
['en','banking','What does NEFT stand for?','National Electronic Funds Transfer','National Equity Fund Trust','Net Electronic Fee Transfer','New Entry Funds Tracker'],
['en','finance','What does EMI stand for?','Equated Monthly Installment','Estimated Monthly Interest','Equal Money Investment','Electronic Money Instrument'],
['en','finance','A SIP in mutual funds means:','investing a fixed amount at regular intervals','investing one lump sum only','taking a bank loan','paying a government tax'],
['en','statements','Working capital is:','current assets minus current liabilities','total assets minus total liabilities','revenue minus cost of goods sold','cash plus inventory'],
['en','statements','A current ratio below 1 means:','current liabilities are higher than current assets','the company is very profitable','the company has no debt','the company pays high dividends'],
['en','statements','Gross profit is:','revenue minus cost of goods sold','revenue minus all taxes','net income plus depreciation','assets minus liabilities'],
['en','statements','The accounting equation is:','Assets = Liabilities + Equity','Assets = Revenue - Expenses','Equity = Assets + Liabilities','Liabilities = Assets + Equity'],
['en','statements','Which statement shows cash coming in and going out?','The cash flow statement','The balance sheet','The auditor report','The share register'],
['en','statements','Free cash flow is:','operating cash flow minus capital expenditure','net income plus dividends','revenue minus tax','total assets minus liabilities'],
['en','statements','EBITDA stands for:','earnings before interest, taxes, depreciation and amortization','estimated balance of income, tax, debt and assets','earnings based on investment, trade, debt and accounts','equity before interest, tax and dividends'],
['en','statements','The debt-to-equity ratio compares:','total liabilities with shareholders equity','revenue with assets','profit with revenue','cash with debt'],
['en','statements','Retained earnings are:','profits kept in the business instead of paid as dividends','cash held in the bank','money borrowed from lenders','the share capital raised'],
['en','banking','KYC stands for:','Know Your Customer','Keep Your Cash','Key Yearly Charges','Know Your Credit'],
['en','banking','The repo rate is the rate at which:','the RBI lends money to commercial banks','banks lend home loans to customers','banks pay interest to depositors','the government borrows from citizens'],
['en','banking','A CIBIL score is:','a credit score between 300 and 900','a tax identification code','a bank branch code','an insurance premium rate'],
['en','tax','GST stands for:','Goods and Services Tax','General Sales Tax','Government Savings Tax','Gross Sales Turnover'],
['en','tax','TDS stands for:','Tax Deducted at Source','Total Deposit Scheme','Tax Due Statement','Transfer of Deposit Slip'],
['en','tax','The maximum deduction under Section 80C (old regime) is:','Rs 1.5 lakh','Rs 5 lakh','Rs 50,000','Rs 10 lakh'],
['en','tax','ITR stands for:','Income Tax Return','Interest Tax Rate','Investment Tracking Report','Indian Tax Receipt'],
['en','tax','A PAN card is issued by:','the Income Tax Department','the RBI','SEBI','UIDAI'],
['en','banking','The Indian stock market is regulated by:','SEBI','RBI','IRDAI','NPCI'],
['en','banking','Insurance companies in India are regulated by:','IRDAI','SEBI','NABARD','NPCI'],
['en','banking','UPI is operated by:','NPCI','SEBI','NABARD','the Income Tax Department'],
['en','finance','The usual tenure of a PPF account is:','15 years','3 years','1 year','30 years'],
['en','finance','Inflation means:','a general rise in prices over time','a fall in prices','a rise in interest rates only','a fall in share prices'],
['en','finance','The NAV of a mutual fund is:','the net asset value of one unit','the new account value','the national average value','the net annual variance'],
['en','statements','Which of these is a liability on a balance sheet?','a loan taken from a bank','cash in hand','inventory','machinery'],
['en','statements','Depreciation is:','spreading the cost of an asset over its useful life','a type of income tax','interest on a loan','the sale of an asset'],
['en','banking','RTGS is mainly used for:','large-value real-time transfers','small coin payments','printing cheques','filing taxes'],
['hi','finance','SIP ka matlab kya hai?','har mahine ek fixed amount mutual fund me invest karna','bank se loan lena','tax bharna','share bechna'],
['hi','finance','EMI kya hota hai?','loan ki fixed monthly kisht','mutual fund ka naam','tax ka form','bank ka khata'],
['hi','finance','FD (Fixed Deposit) kya hoti hai?','ek fixed samay ke liye bank me jama paisa, fixed byaaj ke saath','share market me lagaya paisa','bina byaaj ka khata','tax maaf karne ki scheme'],
['hi','statements','Current ratio 1 se kam ho to iska matlab kya hai?','short-term liabilities current assets se zyada hain','company bahut profitable hai','company pe koi karz nahi','company dividend degi'],
['hi','statements','Balance sheet kya dikhati hai?','ek tarikh par company ke assets, liabilities aur equity','ek saal ki kamai aur kharch','sirf cash ka aana-jaana','employees ki list'],
['hi','statements','Cash flow statement kya batata hai?','cash ka aana aur jaana','company ke assets ki list','share ka bhav','directors ke naam'],
['hi','statements','Net profit margin kaise nikalte hain?','net income ko revenue se divide karke','assets ko liabilities se divide karke','revenue me tax ghata ke','cash ko debt se divide karke'],
['hi','tax','TDS kya hai?','source par hi kaata gaya tax','tax refund','bank ka charge','loan ki kisht'],
['hi','tax','Section 80C me (old regime) kitni limit hai?','Rs 1.5 lakh','Rs 3 lakh','Rs 25,000','koi limit nahi'],
['hi','tax','ITR kya hai?','Income Tax Return, saal bhar ki income ki jankari tax department ko dena','insurance ka form','bank ki loan application','share ka certificate'],
['hi','banking','KYC kyun kiya jata hai?','customer ki pehchaan verify karne ke liye','loan maaf karne ke liye','tax kam karne ke liye','byaaj badhane ke liye'],
['hi','banking','Repo rate kya hai?','jis rate par RBI banks ko udhaar deta hai','jis rate par bank FD deta hai','customer ke home loan ka rate','share market ka index'],
['hi','banking','CIBIL score ka use kya hai?','loan ya credit card dene se pehle credit history check karna','tax calculate karna','bank branch dhundhna','insurance claim karna'],
['hi','finance','Inflation badhne par paise ki value kya hoti hai?','kam hoti hai','badhti hai','same rehti hai','double ho jati hai'],
['hi','finance','Mutual fund me NAV ka matlab kya hai?','ek unit ki net asset value','naya annual byaaj','new account verification','national average value'],
['hi','statements','Free cash flow kaise nikalte hain?','operating cash flow minus capital expenditure','net income plus tax','revenue minus assets','debt minus equity'],
['hi','statements','Debt-to-equity ratio zyada ho to kya matlab hai?','company karz par zyada nirbhar hai','company bina karz ke hai','company ka profit zyada hai','dividend pakka hai'],
['hi','statements','Depreciation kya hai?','asset ki keemat ko uski life me baantna','naya loan lena','tax refund milna','share ka bhav girna'],
['hi','statements','Retained earnings kya hoti hain?','wo profit jo company ne dividend na dekar rakh liya','bank me rakhi FD','loan ki raashi','share capital'],
['hi','statements','Gross profit kya hota hai?','revenue minus cost of goods sold','revenue plus tax','net income minus interest','assets minus loans'],
['hi','finance','PPF ki avadhi (maturity) kitni hoti hai?','15 saal','3 saal','1 saal','30 saal'],
['hi','tax','Form 16 kaun deta hai?','employer (naukri dene wali company)','RBI','SEBI','IRDAI'],
['hi','tax','GST ka full form kya hai?','Goods and Services Tax','General Saving Tax','Gross Sales Total','Government Sales Tariff'],
['hi','banking','RTGS kab use karte hain?','badi raashi turant bhejne ke liye','chhote cash payments ke liye','tax refund ke liye','loan maaf karne ke liye'],
['hi','banking','SEBI kiska regulator hai?','share market ka','banks ka','insurance ka','petrol pumps ka'],
['hi','statements','Working capital kya hai?','current assets minus current liabilities','total assets plus loans','revenue minus tax','equity minus debt'],
['hi','statements','Interest coverage ratio kya batata hai?','operating income se interest kitni baar chukaya ja sakta hai','share ka bhav','kitna tax dena hai','kitna cash bacha hai'],
['hi','finance','Dividend kya hota hai?','company ke profit me se shareholders ko diya gaya hissa','bank ka loan','tax ka ek type','insurance premium'],
['hi','banking','Insurance ka regulator kaun hai?','IRDAI','SEBI','RBI','NPCI'],
['hi','statements','EBITDA ka matlab kya hai?','interest, tax, depreciation aur amortization se pehle ki kamai','net profit after tax','total debt','equity ka bhav'],
];
let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;   // same shuffle for every model
const MCQ = MC.map(([lang, area, q, right, ...wrong]) => { const opts = [right, ...wrong].map((t, i) => ({ t, ok: i === 0 })); for (let i = 3; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]]; } return { lang, area, q, opts, letter: 'ABCD'[opts.findIndex(o => o.ok)] }; });
const SYS = 'You are a knowledgeable, careful assistant for money and finance. Answer clearly in the language the user writes in (English or Hinglish) and show your working for any calculation.';
const http = require('http');   // plain http: no 5-minute built-in timeout (slow CPU answers can take a while)
const post = (body) => new Promise((resolve, reject) => { const req = http.request({ host: '127.0.0.1', port, path: '/v1/chat/completions', method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + (process.env.LLM_API_KEY || '') }, timeout: 0 }, res => { let s = ''; res.on('data', c => s += c); res.on('end', () => { try { resolve(JSON.parse(s)); } catch (e) { reject(e); } }); }); req.on('error', reject); req.end(JSON.stringify(body)); });
const ask = async (system, user, max) => { const t0 = Date.now(); const j = await post({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: 0, max_tokens: max }); return { text: (j.choices && j.choices[0].message.content || '').trim(), ms: Date.now() - t0 }; };
const num = (s) => { const m = s.match(/Answer:\s*\**\s*(-?[\d,]*\.?\d+)/i) || [...s.matchAll(/(-?[\d,]*\.?\d+)/g)].slice(-1)[0]; return m ? parseFloat(m[1].replace(/,/g, '')) : null; };
const jobs = [...ST.items.map((it) => async () => { const a = await ask(ST.system, it.user, 200), v = num(a.text), tol = it.pct ? 0.15 : Math.max(0.02, Math.abs(it.truth) * 0.005); return { type: 'stmt', lang: it.lang, market: it.market, co: it.co, truth: it.truth, model: v, right: v !== null && Math.abs(v - it.truth) <= tol, text: a.text }; }),
  ...MCQ.map(m => async () => { const a = await ask(SYS, m.q + '\n' + m.opts.map((o, i) => 'ABCD'[i] + ') ' + o.t).join('\n') + '\nAnswer with only the letter of the correct option.', 6), g = (a.text.match(/[ABCD]/) || [])[0]; return { type: 'mcq', lang: m.lang, area: m.area, q: m.q, want: m.letter, got: g || null, right: g === m.letter }; })];
(async () => { const res = new Array(jobs.length); let next = 0, done = 0;
  const worker = async () => { while (next < jobs.length) { const i = next++; res[i] = await jobs[i](); if (++done % 10 === 0) console.log(label, done + '/' + jobs.length); } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  fs.writeFileSync(path.join(outDir, 'fresh_' + label + '.json'), JSON.stringify(res, null, 1)); console.log(label, 'DONE'); })().catch(e => { console.log('FAILED', e); process.exit(1); });
