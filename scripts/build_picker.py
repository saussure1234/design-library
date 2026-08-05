# -*- coding: utf-8 -*-
"""ESLのセクションごとに「目標の候補」を並べた選択ページを作る。

    python3 build_picker.py

9,649セクション（953サイト）から、各セクションの中身に構造が合うものだけを
機械的に絞って並べる。業種は問わない。ユーザーは番号を言うだけでよい。
"""
import csv, json, os, re, shutil, html

LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(LIB, "docs")
SRC = os.path.join(LIB, "_raw", "allsections")
OUT = os.path.join(DOCS, "pick")

N_PER = 24   # 1セクションあたりの候補数


# サービス系だけを候補にする。商品・食品・ECは外す。
ALLOW = {"教育", "BtoB", "コーポレート", "採用", "医療", "士業", "不動産", "メディア",
         "サービス", "金融", "福祉", "美容", "ブライダル", "フィットネス", "自治体",
         "公共", "団体", "文化施設", "スポーツ", "建設", "建築", "製造", "地域・自治体",
         "既存"}
DENY = {"EC", "飲食", "食品", "小売", "店舗", "ブランド", "観光", "宿泊",
        "レジャー", "エンタメ", "イベント", "文化"}


def industries():
    """サイトのスラッグ → 業種"""
    m = {}
    p = os.path.join(LIB, "harvest_sites.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            u = (r.get("url") or "").strip()
            if not u.startswith("http"):
                continue
            d = re.sub(r"^https?://(www\.)?", "", u).split("/")[0].lower()
            m[re.sub(r"[^0-9a-zA-Z]+", "_", d)[:36]] = (r.get("industry") or "").strip()
    # 最初に集めた49サイト（教育・キッズ・表現）は既存として通す
    p2 = os.path.join(LIB, "index.csv")
    if os.path.exists(p2):
        for r in csv.DictReader(open(p2, encoding="utf-8-sig")):
            sid = r.get("id", "")
            if sid:
                m.setdefault(sid.rsplit("_s", 1)[0], "既存")
    return m


def load():
    F = json.load(open(os.path.join(LIB, "_raw", "features.json"), encoding="utf-8"))
    pos = json.load(open(os.path.join(LIB, "_raw", "pos.json"), encoding="utf-8"))
    site = {}
    for p in (os.path.join(LIB, "harvest_sites.csv"), os.path.join(LIB, "index.csv")):
        if not os.path.exists(p):
            continue
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            u = (r.get("url") or "").strip()
            n = (r.get("name") or r.get("site") or "").strip()
            if not u.startswith("http"):
                continue
            d = re.sub(r"^https?://(www\.)?", "", u).split("/")[0].lower()
            slug = re.sub(r"[^0-9a-zA-Z]+", "_", d)[:36]
            site.setdefault(slug, (n, u))
    return F, pos, site, industries()


# セクションごとの条件。fn(f, i, n) -> スコア（高いほど候補）／None なら除外
def rules():
    def hero(f, i, n):
        if i != 0: return None
        return f["photo"] * 60 + f["chroma"] * .6 + (12 if f["ratio"] > 1.6 else 0)

    def cta(f, i, n):
        if not (0.25 < i / max(1, n - 1) < 1.0): return None
        if f["ratio"] < 2.0: return None
        if f["ink"] > 9: return None
        return f["chroma"] * 1.4 + (18 if f["dark"] else 0) + (10 if f["cols"] <= 2 else 0)

    def cards3(f, i, n):
        if f["cols"] < 3: return None
        if f["table"] > .95: return None
        return f["photo"] * 30 + f["chroma"] * .7 + (10 if 1.4 < f["ratio"] < 4 else 0)

    def altrow(f, i, n):
        if f["cols"] > 2: return None
        if f["photo"] < .18: return None
        return f["photo"] * 55 + (12 if 1.2 < f["ratio"] < 3.2 else 0) + f["chroma"] * .4

    def numbers(f, i, n):
        if f["ink"] < 3: return None
        if f["photo"] > .45: return None
        return f["chroma"] * 1.1 + (14 if f["cols"] >= 3 else 0) + (10 if f["ratio"] > 1.8 else 0)

    def gallery(f, i, n):
        if f["photo"] < .45: return None
        return f["photo"] * 70 + (10 if f["cols"] >= 2 else 0)

    def longtext(f, i, n):
        if f["photo"] > .40: return None
        if f["ink"] < 5.5: return None
        return f["ink"] * 3 + (12 if f["cols"] <= 2 else 0) + (8 if f["ratio"] < 2.4 else 0)

    def people(f, i, n):
        if f["cols"] < 3: return None
        if f["photo"] < .30: return None
        return f["photo"] * 55 + (10 if 1.5 < f["ratio"] < 3.6 else 0)

    def chips(f, i, n):
        if f["photo"] > .28: return None
        if f["ratio"] < 2.0: return None
        return f["chroma"] * 1.0 + (14 if f["cols"] >= 3 else 0) + f["ink"]

    def table(f, i, n):
        if f["table"] < .92: return None
        if f["photo"] > .30: return None
        return f["table"] * 30 + (14 if f["cols"] >= 3 else 0) + f["ink"] * 1.5

    def access(f, i, n):
        if i / max(1, n - 1) < .45: return None
        return f["photo"] * 30 + f["table"] * 12 + (10 if f["cols"] >= 2 else 0)

    def footer(f, i, n):
        if i < n - 2: return None
        return (20 if f["dark"] else 0) + f["ink"] * 2 + (10 if f["cols"] >= 3 else 0)

    return [
        ("01", "FV", hero),
        ("02", "CTA（4箇所すべてに適用）", cta),
        ("03", "4つの特徴（並列のカード）", cards3),
        ("04", "POINT1〜4の詳細（写真＋長め本文の交互）", altrow),
        ("05", "英検合格率（5つの数値）", numbers),
        ("06", "レッスンの様子（写真・動画2枚）", gallery),
        ("09", "スクールマネジャー紹介（長文）", longtext),
        ("10", "講師紹介（3名・カード）", people),
        ("12", "保護者さまの声（長文）", longtext),
        ("13", "中学受験合格実績（校名6件の並び）", chips),
        ("14", "他社との違い（表）", table),
        ("15", "教室紹介（拠点情報）", access),
        ("17", "フッター", footer),
    ]


def main():
    F, pos, site, IND = load()
    os.makedirs(OUT, exist_ok=True)
    used = set()
    blocks = []

    for no, name, fn in rules():
        cand = []
        for k, f in F.items():
            if f["ink"] < 2.2 or not (0.7 < f["ratio"] < 9) or f["h"] < 150:
                continue
            g = IND.get(k.rsplit("_s", 1)[0], "")
            if g in DENY or g not in ALLOW:      # サービス系だけ
                continue
            i, n = pos.get(k, (0, 1))
            s = fn(f, i, n)
            if s is None:
                continue
            cand.append((s, k))
        cand.sort(reverse=True)
        # 同じサイトが並ばないように散らす
        picked, per = [], {}
        for s, k in cand:
            sl = k.rsplit("_s", 1)[0]
            if per.get(sl, 0) >= 1:
                continue
            per[sl] = per.get(sl, 0) + 1
            picked.append(k)
            if len(picked) >= N_PER:
                break

        cards = []
        for j, k in enumerate(picked, 1):
            if k not in used:
                shutil.copy(os.path.join(SRC, k + ".jpg"), os.path.join(OUT, k + ".jpg"))
                used.add(k)
            sl = k.rsplit("_s", 1)[0]
            nm, url = site.get(sl, (sl, ""))
            cards.append(f'''<figure class="c">
  <div class="c__no">{no}-{j}</div>
  <img src="./pick/{k}.jpg" alt="{html.escape(nm)}" loading="lazy">
  <figcaption><button class="id" data-id="{k}">{k}</button>
    <span>{html.escape(nm)}</span>
    {f'<a href="{html.escape(url)}" target="_blank" rel="noopener">↗</a>' if url else ''}
  </figcaption>
</figure>''')

        blocks.append(f'''<section class="s" id="s{no}">
  <h2><span>{no}</span>{html.escape(name)}</h2>
  <p class="hint">この中から1つ選んで「<b>{no}-7</b>」のように番号だけ言ってください。良いものが無ければ「{no} 無し」で別案を出します。</p>
  <div class="grid">{''.join(cards)}</div>
</section>''')
        print(f"  {no} {name}: {len(picked)}件")

    nav = "".join(f'<a href="#s{no}">{no} {html.escape(nm.split("（")[0])}</a>' for no, nm, _ in rules())
    page = f'''<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>ESL club｜セクションごとの目標を選ぶ</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:"Noto Sans JP",sans-serif;background:#F2F2F2;color:#151515;line-height:1.8}}
header{{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #DDD;padding:14px 20px}}
.in{{max-width:1800px;margin:0 auto}}
h1{{margin:0 0 6px;font-size:19px;font-weight:900}}
p.lead{{margin:0 0 10px;font-size:13px;color:#555}}
nav{{display:flex;flex-wrap:wrap;gap:5px}}
nav a{{font-size:11.5px;font-weight:700;color:#333;background:#F0F0F0;border-radius:999px;padding:4px 11px;text-decoration:none}}
nav a:hover{{background:#111;color:#fff}}
.s{{max-width:1800px;margin:0 auto;padding:34px 20px 10px}}
.s h2{{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;margin:0 0 4px}}
.s h2 span{{background:#111;color:#fff;border-radius:6px;font-size:13px;padding:3px 9px;font-family:ui-monospace,monospace}}
.hint{{margin:0 0 16px;font-size:12.5px;color:#666}}
.grid{{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}}
.c{{margin:0;position:relative;background:#fff;border:1px solid #DDD;border-radius:10px;overflow:hidden}}
.c__no{{position:absolute;left:9px;top:9px;z-index:2;background:rgba(17,17,17,.9);color:#fff;
  font-family:ui-monospace,monospace;font-size:12.5px;font-weight:700;border-radius:6px;padding:3px 9px}}
.c img{{width:100%;display:block;max-height:460px;object-fit:cover;object-position:top;cursor:zoom-in}}
figcaption{{display:flex;align-items:center;gap:6px;padding:7px 10px;font-size:11px;border-top:1px solid #EEE}}
.id{{font-family:ui-monospace,monospace;font-size:10.5px;font-weight:700;background:#EFEFEF;border:0;border-radius:5px;padding:3px 7px;cursor:pointer}}
.id.ok{{background:#00B21F;color:#fff}}
figcaption span{{color:#666;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
figcaption a{{color:#0F62FE;text-decoration:none;font-weight:700}}
dialog{{border:0;padding:0;max-width:96vw;max-height:94vh;border-radius:10px;overflow:auto}}
dialog::backdrop{{background:rgba(0,0,0,.82)}} dialog img{{max-width:min(1280px,94vw);display:block}}
</style></head><body>
<header><div class="in">
<h1>ESL club｜セクションごとの目標を選ぶ</h1>
<p class="lead">サービス系のサイトだけに絞って（商品・食品・ECは除外）、各セクションの中身に構造が合うものを出しています。<br>
<b>番号（例：03-7）を言うだけ</b>で、そのデザインに一致するよう作ります。良いものが無ければ「03 無し」で別案を出します。</p>
<nav>{nav}</nav>
</div></header>
{''.join(blocks)}
<div style="height:60px"></div>
<dialog id="d"><img id="di" alt=""></dialog>
<script>
document.querySelectorAll('.c img').forEach(function(i){{i.addEventListener('click',function(){{
  document.getElementById('di').src=i.src;document.getElementById('d').showModal();}});}});
document.getElementById('d').addEventListener('click',function(){{this.close();}});
document.querySelectorAll('.id').forEach(function(b){{b.addEventListener('click',function(){{
  navigator.clipboard.writeText(b.dataset.id);b.classList.add('ok');
  setTimeout(function(){{b.classList.remove('ok')}},900);}});}});
</script></body></html>'''
    open(os.path.join(DOCS, "pick.html"), "w", encoding="utf-8").write(page)
    print(f"→ docs/pick.html  （画像 {len(used)}枚）")


if __name__ == "__main__":
    main()
