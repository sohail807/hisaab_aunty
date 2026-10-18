import importlib.util, json, os, random, re, sys, time, requests   # python make_fresh_stmt.py <outDir>   (the committed fresh_stmt.json is the fixed question set; regenerate only to make a new one)
spec = importlib.util.spec_from_file_location("bf", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "fin", "build_fin_data.py"))
bf = importlib.util.module_from_spec(spec); spec.loader.exec_module(bf)
hdr = {"User-Agent": os.environ.get("SEC_USER_AGENT", "HisaabAunty Research research@example.com")}
tick = requests.get("https://www.sec.gov/files/company_tickers.json", headers=hdr, timeout=40).json()
cik = {}
for v in tick.values(): cik.setdefault(v["ticker"], v["cik_str"])
rng = random.Random(2026); cos = []
for t in "RBLX TWLO OKTA NET ASAN BILL SOFI AFRM UPST HIMS GTLB PATH".split():
    try:
        co = bf.us_company_years(t, cik[t], hdr, 4); time.sleep(0.2)
        if co and co["years"]: cos.append(co); print("US", t, co["name"])
    except Exception as e: print("skip", t, repr(e)[:50])
for t in "CDSL MAZDOCK SYNGENE ABCAPITAL CESC KPITTECH TATAELXSI LAURUSLABS CROMPTON PERSISTENT ZENSARTECH SONACOMS".split():
    try:
        co = bf.in_company_years(t, 4); time.sleep(1)
        if co and co["years"]: cos.append(co); print("IN", t, co["name"])
    except Exception as e: print("skip", t, repr(e)[:50])
HIN = [(r"current ratio", "Is company ka current ratio kitna hai? Formula aur working ke saath batao."), (r"debt-to-equity", "Debt-to-equity ratio kitna hai? Working dikhao."),
       (r"net profit margin", "Net profit margin kitna hai? Working ke saath batao."), (r"gross margin", "Gross margin kitna hai? Working ke saath batao."),
       (r"operating margin", "Operating margin kitna hai? Working ke saath batao."), (r"\(ROE\)", "ROE (return on equity) kitna hai? Working dikhao."),
       (r"\(ROA\)", "ROA (return on assets) kitna hai? Working dikhao."), (r"asset turnover", "Asset turnover ratio kitna hai? Working dikhao."),
       (r"free cash flow", "Free cash flow kitna hai? Working ke saath batao.")]
items = []
for co in cos:
    ys = sorted(co["years"])
    for i, y in enumerate(ys):
        qs = [(q, a) for q, a in bf.questions(co, y, ys[i-1] if i else None) if re.search(r"Answer:\s*-?[\d,\.]+", a)]
        rng.shuffle(qs)
        for q, a in qs[:2]:
            hin = None
            for pat, txt in HIN:
                if re.search(pat, q, re.I): hin = txt
            lang = "hinglish" if hin and rng.random() < 0.55 else "english"
            items.append({"type": "stmt", "lang": lang, "co": co["name"], "market": co["ccy"], "year": y, "user": bf.table(co, y, 0) + "\n\nQuestion: " + (hin if lang == "hinglish" else q), "truth": float(re.search(r"Answer:\s*(-?[\d,\.]+)", a).group(1).replace(",", "")), "pct": "%" in a.split("Answer:")[-1]})
rng.shuffle(items)
eng = [x for x in items if x["lang"] == "english"][:22]; hing = [x for x in items if x["lang"] == "hinglish"][:18]
out = eng + hing
json.dump({"system": bf.SYSTEM, "items": out}, open(sys.argv[1] + "/fresh_stmt.json", "w"), ensure_ascii=False, indent=1)
print(len(out), "statement questions:", len(eng), "english,", len(hing), "hinglish;", len({x["co"] for x in out}), "companies")
