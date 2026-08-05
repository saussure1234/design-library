# -*- coding: utf-8 -*-
"""ESLのセクションごとに「目標の候補」を並べた選択ページを作る。

    python3 build_picker.py

やること:
  ESLの各セクションに対して、資料ライブラリから構造の合う候補を集め、
  実スクショを大きく並べる。ユーザーは番号を言うだけでよい。
"""
import csv, glob, html, json, os

LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(LIB, "docs")

# ESLのセクション → 候補の絞り込み条件
#   types  : ライブラリの type
#   layouts: 含まれていれば優先（構造が合うもの）
#   drop   : 含まれていたら外す
SECTIONS = [
    ("01", "FV", ["hero"], ["photo", "split", "card", "type"], []),
    ("02", "CTA（4箇所すべてに適用）", ["cta"], [], []),
    ("03", "4つの特徴", ["features"], ["3col", "4col", "card", "grid", "icon"], ["table"]),
    ("04", "POINT1〜4の詳細", ["features", "value"], ["alternating", "2col", "row", "offset", "photo"], ["3col"]),
    ("05", "英検合格率（5つの数値）", ["numbers"], ["donut", "bar", "chart", "big-number", "row"], []),
    ("06", "レッスンの様子（動画2本）", ["gallery"], ["pair", "offset", "rail", "band", "grid"], []),
    ("09", "スクールマネジャー紹介（長文）", ["member", "message"], ["text", "photo", "letter", "portrait", "overlap"], ["3col", "4col"]),
    ("10", "講師紹介（3名・カード）", ["member"], ["3col", "4col", "card", "grid", "row"], []),
    ("12", "保護者さまの声（長文）", ["voice"], [], []),
    ("13", "中学受験合格実績（校名6件）", ["numbers", "gallery"], ["chip", "row", "list", "logo", "tile"], ["donut", "chart"]),
    ("14", "他社との違い（7行×3列）", ["compare"], [], []),
    ("15", "教室紹介（2拠点タブ）", ["access"], [], []),
    ("17", "フッター", ["footer"], [], []),
]


def main():
    S = json.load(open(os.path.join(LIB, "sections_classified.json"), encoding="utf-8"))
    meta = {}
    for r in csv.DictReader(open(os.path.join(LIB, "index.csv"), encoding="utf-8-sig")):
        meta[r["id"]] = (r.get("site", ""), r.get("url", ""))

    def pick(types, layouts, drop, n=8):
        c = [s for s in S if s["type"] in types]
        c = [s for s in c if os.path.exists(os.path.join(DOCS, "refs", s["id"] + ".jpg"))]
        def score(s):
            lay = (s.get("layout") or "").lower()
            if any(d in lay for d in drop):
                return -99
            hit = sum(1 for k in layouts if k in lay)
            return s.get("quality", 0) * 10 + hit * 3
        c = [s for s in c if score(s) > -50]
        c.sort(key=score, reverse=True)
        # 同じサイトばかりにならないよう散らす
        out, used = [], {}
        for s in c:
            site = meta.get(s["id"], ("", ""))[0]
            if used.get(site, 0) >= 2:
                continue
            used[site] = used.get(site, 0) + 1
            out.append(s)
            if len(out) >= n:
                break
        return out

    blocks = []
    for no, name, types, layouts, drop in SECTIONS:
        cands = pick(types, layouts, drop)
        cards = []
        for i, s in enumerate(cands, 1):
            site, url = meta.get(s["id"], ("?", ""))
            cards.append(f'''<figure class="c">
  <div class="c__no">{no}-{i}</div>
  <img src="./refs/{s['id']}.jpg" alt="{html.escape(site)}" loading="lazy">
  <figcaption>
    <button class="id" data-id="{s['id']}">{s['id']}</button>
    <span>{html.escape(site)}</span>
    <b>q{s.get('quality')}</b>
    {f'<a href="{html.escape(url)}" target="_blank" rel="noopener">実サイト ↗</a>' if url else ''}
  </figcaption>
</figure>''')
        blocks.append(f'''<section class="s" id="s{no}">
  <h2><span>{no}</span>{html.escape(name)}</h2>
  <p class="hint">この中から1つ選んで「<b>{no}-3</b>」のように番号だけ言ってください。<br>
  ここに無いものが良ければ、スクショを貼るかURLを言ってもらえれば足します。</p>
  <div class="grid">{''.join(cards)}</div>
</section>''')

    nav = "".join(f'<a href="#s{no}">{no} {html.escape(name.split("（")[0])}</a>'
                  for no, name, *_ in SECTIONS)

    page = f'''<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>ESL club｜セクションごとの目標を選ぶ</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:"Noto Sans JP",sans-serif;background:#F2F2F2;color:#151515;line-height:1.8}}
header{{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #DDD;padding:14px 20px}}
.in{{max-width:1700px;margin:0 auto}}
h1{{margin:0 0 6px;font-size:19px;font-weight:900}}
p.lead{{margin:0 0 10px;font-size:13px;color:#555}}
nav{{display:flex;flex-wrap:wrap;gap:5px}}
nav a{{font-size:11.5px;font-weight:700;color:#333;background:#F0F0F0;border-radius:999px;
  padding:4px 11px;text-decoration:none}}
nav a:hover{{background:#111;color:#fff}}
.s{{max-width:1700px;margin:0 auto;padding:34px 20px 10px}}
.s h2{{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;margin:0 0 4px}}
.s h2 span{{background:#111;color:#fff;border-radius:6px;font-size:13px;padding:3px 9px;font-family:ui-monospace,monospace}}
.hint{{margin:0 0 16px;font-size:12.5px;color:#666}}
.grid{{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(400px,1fr))}}
.c{{margin:0;position:relative;background:#fff;border:1px solid #DDD;border-radius:10px;overflow:hidden}}
.c__no{{position:absolute;left:10px;top:10px;z-index:2;background:rgba(17,17,17,.88);color:#fff;
  font-family:ui-monospace,monospace;font-size:13px;font-weight:700;border-radius:6px;padding:4px 10px}}
.c img{{width:100%;display:block;max-height:520px;object-fit:cover;object-position:top;cursor:zoom-in}}
figcaption{{display:flex;align-items:center;gap:7px;padding:8px 11px;font-size:11.5px;border-top:1px solid #EEE}}
.id{{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;background:#EFEFEF;border:0;
  border-radius:5px;padding:3px 8px;cursor:pointer}}
.id.ok{{background:#00B21F;color:#fff}}
figcaption span{{color:#555;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
figcaption b{{color:#888;font-weight:700}}
figcaption a{{color:#0F62FE;text-decoration:none;font-weight:700;white-space:nowrap}}
dialog{{border:0;padding:0;max-width:96vw;max-height:94vh;border-radius:10px;overflow:auto}}
dialog::backdrop{{background:rgba(0,0,0,.82)}} dialog img{{max-width:min(1280px,94vw);display:block}}
</style></head><body>
<header><div class="in">
<h1>ESL club｜セクションごとの目標を選ぶ</h1>
<p class="lead">各セクションの候補です。<b>番号（例：03-2）を言うだけ</b>で、そのデザインに一致するよう作ります。<br>
候補に良いものが無ければ、スクショを貼るかURLを言ってください。追加します。</p>
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
    print("→ docs/pick.html")
    for no, name, types, layouts, drop in SECTIONS:
        print(f"  {no} {name}: {len(pick(types, layouts, drop))}件")


if __name__ == "__main__":
    main()
