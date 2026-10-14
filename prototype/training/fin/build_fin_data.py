"""
Build analyst training data from REAL company financial statements.

  US    : SEC EDGAR "company facts" (the companies' own 10-K filings, free, US government data)
  India : Yahoo Finance via the yfinance library (optional, --india). CHECK THEIR TERMS before commercial use.

For each company-year we show the statement lines, ask a question, and write a worked answer.
Every number in the answer is computed here in code from the real figures, so the answers are always right.

  SEC_USER_AGENT="YourName your@email.com" python build_fin_data.py --out ./fin_data [--india] [--years 4]

SEC asks every user to identify themselves in SEC_USER_AGENT. Companies are split into train / val / test
(never the same company in two sets), so the test shows if the model can read statements it has never seen.
Output: train.jsonl, val.jsonl, test.jsonl (chat format, same as the intent data) and sources.json.
"""
import argparse, json, os, random, sys, time
import requests

US_TICKERS = ("AAPL MSFT GOOGL AMZN NVDA META TSLA JPM WFC C GS MS WMT COST HD TGT LOW XOM CVX COP JNJ PFE MRK ABBV LLY UNH "
              "PG KO PEP MDLZ MCD SBUX NKE DIS NFLX CMCSA T VZ INTC CSCO ORCL IBM ADBE CRM QCOM TXN BA GE CAT DE MMM HON UPS FDX F GM").split()
IN_TICKERS = ("RELIANCE TCS INFY HDFCBANK ICICIBANK SBIN BHARTIARTL ITC LT HINDUNILVR KOTAKBANK AXISBANK ASIANPAINT MARUTI SUNPHARMA "
              "TITAN BAJFINANCE NESTLEIND ULTRACEMCO WIPRO HCLTECH ONGC NTPC POWERGRID TATASTEEL TATAMOTORS M&M ADANIENT COALINDIA "
              "JSWSTEEL BRITANNIA DRREDDY CIPLA EICHERMOT HEROMOTOCO GRASIM TECHM").split()

# internal key -> list of us-gaap tags to try, in order
US_TAGS = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "gross_profit": ["GrossProfit"], "operating_income": ["OperatingIncomeLoss"], "net_income": ["NetIncomeLoss"],
    "interest_expense": ["InterestExpense", "InterestExpenseNonoperating"],
    "current_assets": ["AssetsCurrent"], "total_assets": ["Assets"], "cash": ["CashAndCashEquivalentsAtCarryingValue"],
    "current_liabilities": ["LiabilitiesCurrent"], "total_liabilities": ["Liabilities"], "equity": ["StockholdersEquity"],
    "op_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "capex": ["PaymentsToAcquirePropertyPlantAndEquipment", "PaymentsToAcquireProductiveAssets"],
}
# internal key -> yfinance row names (statement, name)
IN_ROWS = {
    "revenue": ("income", "Total Revenue"), "gross_profit": ("income", "Gross Profit"), "operating_income": ("income", "Operating Income"),
    "net_income": ("income", "Net Income"), "interest_expense": ("income", "Interest Expense"),
    "current_assets": ("balance", "Current Assets"), "total_assets": ("balance", "Total Assets"), "cash": ("balance", "Cash And Cash Equivalents"),
    "current_liabilities": ("balance", "Current Liabilities"), "total_liabilities": ("balance", "Total Liabilities Net Minority Interest"),
    "equity": ("balance", "Stockholders Equity"), "op_cash_flow": ("cash", "Operating Cash Flow"), "capex": ("cash", "Capital Expenditure"),
}
LABEL = {
    "revenue": "Revenue", "gross_profit": "Gross profit", "operating_income": "Operating income", "net_income": "Net income",
    "interest_expense": "Interest expense", "current_assets": "Total current assets", "total_assets": "Total assets", "cash": "Cash and equivalents",
    "current_liabilities": "Total current liabilities", "total_liabilities": "Total liabilities", "equity": "Total shareholders' equity",
    "op_cash_flow": "Net cash from operating activities", "capex": "Capital expenditure",
}
ORDER = ["revenue", "gross_profit", "operating_income", "interest_expense", "net_income", "cash", "current_assets", "total_assets",
         "current_liabilities", "total_liabilities", "equity", "op_cash_flow", "capex"]


# ---------------- real data: US (SEC EDGAR) ----------------
def us_company_years(ticker, cik, hdr, years):
    r = requests.get(f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik:010d}.json", headers=hdr, timeout=40)
    if r.status_code != 200:
        return None
    j = r.json(); facts = j.get("facts", {}).get("us-gaap", {}); by_year = {}
    for key, tags in US_TAGS.items():
        for tag in tags:
            units = facts.get(tag, {}).get("units", {}).get("USD")
            if not units:
                continue
            best = {}
            for u in units:   # full-year figures from the 10-K only
                if u.get("form") != "10-K" or u.get("fp") != "FY":
                    continue
                if "start" in u:   # flow items must span about a year
                    d = (time.mktime(time.strptime(u["end"], "%Y-%m-%d")) - time.mktime(time.strptime(u["start"], "%Y-%m-%d"))) / 86400
                    if not 350 <= d <= 380:
                        continue
                if u["end"] not in best or u["filed"] > best[u["end"]]["filed"]:
                    best[u["end"]] = u
            for end, u in best.items():
                by_year.setdefault(end, {}).setdefault(key, u["val"])
            if best:
                break
    ends = sorted(by_year)[-years:]
    return {"name": " ".join(j.get("entityName", ticker).split()).title() if j.get("entityName", "").isupper() else " ".join(j.get("entityName", ticker).split()), "ccy": "USD", "unit": 1e6, "unit_name": "million", "years": {e[:4]: by_year[e] for e in ends}, "source": "SEC EDGAR"}


# ---------------- real data: India (Yahoo Finance) ----------------
def in_company_years(ticker, years):
    import yfinance as yf
    t = yf.Ticker(ticker + ".NS"); frames = {"income": t.financials, "balance": t.balance_sheet, "cash": t.cashflow}
    if frames["income"] is None or frames["income"].empty:
        return None
    by_year = {}
    for key, (st, row) in IN_ROWS.items():
        df = frames[st]
        if df is None or row not in df.index:
            continue
        for col, v in df.loc[row].items():
            if v == v and v is not None:
                by_year.setdefault(str(col)[:4], {})[key] = abs(float(v)) if key == "capex" else float(v)
    ys = sorted(by_year)[-years:]
    info = {}
    try:
        info = t.info or {}
    except Exception:
        pass
    return {"name": info.get("longName") or ticker, "ccy": "INR", "unit": 1e7, "unit_name": "crore", "years": {y: by_year[y] for y in ys}, "source": "Yahoo Finance"}


# ---------------- questions and worked answers (all numbers computed here) ----------------
def f2(x): return f"{x:,.2f}"
def pct(x): return f"{x*100:,.1f}%"

def table(co, y, shown, style):
    u, unit = co["unit"], co["unit_name"]
    head = f"{co['name']} - financial statements, fiscal year {y} ({co['ccy']} {unit}s)"
    rows = [(LABEL[k], co["years"][y][k] / u) for k in ORDER if k in co["years"][y] and k in shown]
    if style == 0:
        return head + "\n" + "\n".join(f"{n}: {v:,.1f}" for n, v in rows)
    return head + "\n" + "\n".join(f"| {n} | {v:,.1f} |" for n, v in rows)

def verdict_ratio(name, v):
    return {
        "current": "above 1, so short-term assets cover short-term liabilities" if v >= 1 else "below 1, so short-term liabilities are higher than short-term assets",
        "de": "liabilities are lower than equity, a lightly geared balance sheet" if v < 1 else "liabilities are higher than equity, so the company leans on borrowed money",
    }[name]

def questions(co, y, prev):
    """yield (needed_keys, question, worked_answer) tuples for one company-year"""
    d = {k: v / co["unit"] for k, v in co["years"][y].items()}; u = f"{co['ccy']} {co['unit_name']}s"
    p = {k: v / co["unit"] for k, v in co["years"][prev].items()} if prev else None
    out = []
    if "current_assets" in d and d.get("current_liabilities"):
        v = d["current_assets"] / d["current_liabilities"]
        out.append((["current_assets", "current_liabilities"], "What is the current ratio, and what does it say about liquidity?",
                    f"Current ratio = total current assets / total current liabilities\n= {f2(d['current_assets'])} / {f2(d['current_liabilities'])} = {f2(v)}\nThe ratio is {verdict_ratio('current', v)}.\nAnswer: {f2(v)}"))
    if "total_liabilities" in d and d.get("equity", 0) > 0:
        v = d["total_liabilities"] / d["equity"]
        out.append((["total_liabilities", "equity"], "Work out the debt-to-equity ratio (total liabilities / shareholders' equity) and say what it means.",
                    f"Debt-to-equity = total liabilities / shareholders' equity\n= {f2(d['total_liabilities'])} / {f2(d['equity'])} = {f2(v)}\nIn this case {verdict_ratio('de', v)}.\nAnswer: {f2(v)}"))
    if "net_income" in d and d.get("revenue"):
        v = d["net_income"] / d["revenue"]
        out.append((["net_income", "revenue"], "What is the net profit margin?",
                    f"Net profit margin = net income / revenue\n= {f2(d['net_income'])} / {f2(d['revenue'])} = {pct(v)}\nFor every 100 of revenue the company keeps about {v*100:,.1f} as profit.\nAnswer: {pct(v)}"))
    if "gross_profit" in d and d.get("revenue"):
        v = d["gross_profit"] / d["revenue"]
        out.append((["gross_profit", "revenue"], "Calculate the gross margin.", f"Gross margin = gross profit / revenue\n= {f2(d['gross_profit'])} / {f2(d['revenue'])} = {pct(v)}\nAnswer: {pct(v)}"))
    if "operating_income" in d and d.get("revenue"):
        v = d["operating_income"] / d["revenue"]
        out.append((["operating_income", "revenue"], "What is the operating margin?", f"Operating margin = operating income / revenue\n= {f2(d['operating_income'])} / {f2(d['revenue'])} = {pct(v)}\nAnswer: {pct(v)}"))
    if "net_income" in d and d.get("equity", 0) > 0:
        v = d["net_income"] / d["equity"]
        out.append((["net_income", "equity"], "Compute the return on equity (ROE).",
                    f"ROE = net income / shareholders' equity\n= {f2(d['net_income'])} / {f2(d['equity'])} = {pct(v)}\n(Using year-end equity, not the average.)\nAnswer: {pct(v)}"))
    if "net_income" in d and d.get("total_assets"):
        v = d["net_income"] / d["total_assets"]
        out.append((["net_income", "total_assets"], "Compute the return on assets (ROA).", f"ROA = net income / total assets\n= {f2(d['net_income'])} / {f2(d['total_assets'])} = {pct(v)}\nAnswer: {pct(v)}"))
    if "op_cash_flow" in d and "net_income" in d and d["net_income"] > 0:
        v = d["op_cash_flow"] / d["net_income"]
        word = "Profit is well backed by cash." if v >= 1 else "Cash from operations is lower than profit, so part of the profit is not yet in cash."
        out.append((["op_cash_flow", "net_income"], "Is the net income backed by operating cash flow? Give the cash conversion ratio.",
                    f"Cash conversion = operating cash flow / net income\n= {f2(d['op_cash_flow'])} / {f2(d['net_income'])} = {f2(v)}\n{word}\nAnswer: {f2(v)}"))
    if "op_cash_flow" in d and "capex" in d:
        v = d["op_cash_flow"] - d["capex"]
        out.append((["op_cash_flow", "capex"], f"What is the free cash flow ({u})?", f"Free cash flow = operating cash flow - capital expenditure\n= {f2(d['op_cash_flow'])} - {f2(d['capex'])} = {f2(v)}\n{'Positive: the business funds its investment and has cash left over.' if v >= 0 else 'Negative: the business spent more than its operations brought in.'}\nAnswer: {f2(v)}"))
    if "operating_income" in d and d.get("interest_expense"):
        v = d["operating_income"] / abs(d["interest_expense"])
        out.append((["operating_income", "interest_expense"], "What is the interest coverage ratio?",
                    f"Interest coverage = operating income / interest expense\n= {f2(d['operating_income'])} / {f2(abs(d['interest_expense']))} = {f2(v)}x\nThe company earns {f2(v)} times its interest bill from operations.\nAnswer: {f2(v)}"))
    if p and "revenue" in d and p.get("revenue"):
        v = (d["revenue"] - p["revenue"]) / p["revenue"]
        out.append((["revenue"], f"Revenue was {f2(p['revenue'])} the previous year. What was the year-on-year revenue growth?",
                    f"Growth = (this year - last year) / last year\n= ({f2(d['revenue'])} - {f2(p['revenue'])}) / {f2(p['revenue'])} = {pct(v)}\nAnswer: {pct(v)}"))
    if p and "net_income" in d and p.get("net_income", 0) > 0:
        v = (d["net_income"] - p["net_income"]) / p["net_income"]
        out.append((["net_income"], f"Net income was {f2(p['net_income'])} the previous year. How much did it grow or fall?",
                    f"Change = (this year - last year) / last year\n= ({f2(d['net_income'])} - {f2(p['net_income'])}) / {f2(p['net_income'])} = {pct(v)}\nAnswer: {pct(v)}"))
    return out

SYSTEM = "You are a careful financial analyst. Read the statement, show the formula and the working, and finish with a line starting 'Answer:'."

def make_rows(co, rng):
    rows = []; ys = sorted(co["years"])
    for i, y in enumerate(ys):
        prev = ys[i - 1] if i else None
        for need, q, a in questions(co, y, prev):
            shown = set(need) | set(rng.sample([k for k in ORDER if k in co["years"][y]], k=min(4, len(co["years"][y]))))   # extra lines are noise to ignore
            text = table(co, y, shown, rng.randint(0, 1)) + "\n\nQuestion: " + q
            rows.append({"id": f"{co['source']}:{co['name']}:{y}", "messages": [{"role": "system", "content": SYSTEM}, {"role": "user", "content": text}, {"role": "assistant", "content": a}]})
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="./fin_data"); ap.add_argument("--india", action="store_true"); ap.add_argument("--years", type=int, default=4)
    ap.add_argument("--us_max", type=int, default=len(US_TICKERS)); ap.add_argument("--in_max", type=int, default=len(IN_TICKERS)); ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args(); rng = random.Random(a.seed); os.makedirs(a.out, exist_ok=True)
    cos = []
    ua = os.environ.get("SEC_USER_AGENT")
    if not ua or "@" not in ua:
        sys.exit('Set SEC_USER_AGENT first, e.g.  SEC_USER_AGENT="Your Name you@email.com"  (the SEC requires it)')
    hdr = {"User-Agent": ua}
    tick = requests.get("https://www.sec.gov/files/company_tickers.json", headers=hdr, timeout=40).json()
    cik = {}
    for v in tick.values(): cik.setdefault(v["ticker"], v["cik_str"])   # the file lists the main company first
    for t in US_TICKERS[:a.us_max]:
        if t not in cik: continue
        try: co = us_company_years(t, cik[t], hdr, a.years)
        except Exception as e: print("skip", t, repr(e)[:80]); continue
        time.sleep(0.15)   # SEC allows 10 requests a second; stay far below
        if co and co["years"]: cos.append(co); print("US ", t, co["name"], list(co["years"]))
    if a.india:
        for t in IN_TICKERS[:a.in_max]:
            try: co = in_company_years(t, a.years)
            except Exception as e: print("skip", t, repr(e)[:80]); continue
            if co and co["years"]: cos.append(co); print("IN ", t, co["name"], list(co["years"])); time.sleep(1)
    rng.shuffle(cos)
    n = len(cos); cut1, cut2 = int(n * 0.8), int(n * 0.9)   # split by company, never by example
    parts = {"train": cos[:cut1], "val": cos[cut1:cut2], "test": cos[cut2:]}
    for name, lst in parts.items():
        rows = [r for co in lst for r in make_rows(co, rng)]; rng.shuffle(rows)
        open(os.path.join(a.out, name + ".jsonl"), "w", encoding="utf-8").write("\n".join(json.dumps(r, ensure_ascii=False) for r in rows) + "\n")
        print(name, len(lst), "companies,", len(rows), "examples")
    json.dump({"sources": sorted({c["source"] for c in cos}), "companies": [c["name"] for c in cos]}, open(os.path.join(a.out, "sources.json"), "w"), indent=1)

if __name__ == "__main__":
    main()
