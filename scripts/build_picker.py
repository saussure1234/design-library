# -*- coding: utf-8 -*-
"""ESLの各セクションに「実際の原稿が入る型」だけを並べた選択ページを作る。

判定（sections_fit.json）で得た
  fits      … 構造として使えるESLセクション
  units     … 繰り返し単位の数
  unitPhoto … 各単位に写真があるか
  textAmt   … 1単位あたりの文字量
を、ESLの原稿の実寸と突き合わせて絞る。質のスコアは順位づけに使わない。
"""
import csv, html, json, os, re, shutil

LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(LIB, "docs")
SRC = os.path.join(LIB, "_raw", "allsections")
OUT = os.path.join(DOCS, "pick")
N = 60          # 1セクションあたりの掲載上限

# ESLの原稿の実寸。ここに合わないものは出さない。
#   need(x) -> True なら候補
SPEC = {
 "01": ("FV",
   "前置き1行＋見出し2行（35字）＋実績数字2つ＋CTA＋補助1行＋写真2枚（横に区切って1枚に）＋注記1行",
   lambda x: True),
 "02": ("CTA（4箇所で使い回す）",
   "ボタン「無料体験レッスンはこちら」＋補助1行「いつまでに2級合格できるかレッスン後にご案内します」だけ",
   lambda x: x["textAmt"] in ("none","short") and x["units"] <= 3),
 "03": ("4つの特徴",
   "4項目・写真なし。1項目＝番号＋見出し10字（例：高い英検合格率を実現）＋説明24字＋詳細リンク",
   lambda x: 3 <= x["units"] <= 6 and x["textAmt"] in ("none","short","medium")),
 "04": ("POINT1〜4の詳細",
   "4項目・左右交互・各項目に写真1枚。見出し3行＋本文200〜300字",
   lambda x: x["unitPhoto"] and x["textAmt"] in ("medium","long") and x["units"] <= 4),
 "05": ("英検合格率",
   "同じ単位の数値が5つ（5級100% 4級88% 3級86% 準2級64% 2級75%）＋注記1行",
   lambda x: x["units"] >= 3 and x["textAmt"] in ("none","short")),
 "06": ("レッスンの様子",
   "動画サムネイル2枚＋各キャプション2行（小3男子 初学者／ハシモトカズマくん）",
   lambda x: x["unitPhoto"] and 2 <= x["units"] <= 4 and x["textAmt"] in ("none","short")),
 "09": ("スクールマネジャー紹介",
   "2人・縦に並ぶ。1人＝顔写真（円）＋肩書＋氏名＋指導歴＋本文400〜600字",
   lambda x: x["unitPhoto"] and x["textAmt"] == "long" and x["units"] <= 3),
 "10": ("講師紹介",
   "3人並列。1人＝顔写真＋氏名＋英語レベル＋海外経験（箇条書き）＋コメント80〜120字",
   lambda x: x["unitPhoto"] and 3 <= x["units"] <= 4 and x["textAmt"] in ("short","medium")),
 "12": ("保護者さまの声",
   "2件・1件＝見出し25〜40字＋本文300〜500字。うち1件に講師コメント400字が入れ子",
   lambda x: x["textAmt"] == "long" and x["units"] <= 3),
 "13": ("中学受験合格実績",
   "学校名6件を並べるだけ（最長17字「東京学芸大学附属国際中等教育学校」）＋「※一部」",
   lambda x: x["units"] >= 4 and x["textAmt"] in ("none","short") and not x["unitPhoto"]),
 "14": ("他社との違い",
   "7行×3列の表。セルは記号でなく文章（最長35字）",
   lambda x: x["units"] >= 3 or x["kind"] == "compare"),
 "15": ("教室紹介（2拠点タブ）",
   "2拠点をタブで切替。1拠点＝写真＋定義リスト7行＋料金3プラン＋時間割＋（渋谷のみ）挨拶500〜800字",
   lambda x: x["unitPhoto"] or x["kind"] in ("access","price")),
 "17": ("フッター",
   "電話＋受付時間＋事業導線2＋注目記事5＋法務2＋コピーライト＋商標注記（長文）",
   lambda x: True),
}


def sites():
    m = {}
    for p in (os.path.join(LIB, "harvest_sites.csv"), os.path.join(LIB, "index.csv")):
        if not os.path.exists(p): continue
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            u = (r.get("url") or "").strip()
            n = (r.get("name") or r.get("site") or "").strip()
            if not u.startswith("http"): continue
            d = re.sub(r"^https?://(www\.)?", "", u).split("/")[0].lower()
            m.setdefault(re.sub(r"[^0-9a-zA-Z]+", "_", d)[:36], (n, u))
    return m


def main():
    R = json.load(open(os.path.join(LIB, "sections_fit.json"), encoding="utf-8"))
    SITE = sites()
    os.makedirs(OUT, exist_ok=True)
    blocks, copied = [], set()

    for no, (name, spec, need) in SPEC.items():
        c = []
        for x in R:
            if no not in (x.get("fits") or []): continue
            try:
                if not need(x): continue
            except Exception: continue
            c.append(x)
        # 同じサイトが並ばないよう散らす。順位は「構造の一致度」＝繰り返し数がESLに近い順
        want = {"03": 4, "04": 4, "05": 5, "06": 2, "09": 2, "10": 3, "12": 2, "13": 6, "14": 7}.get(no)
        def key(x):
            d = abs((x["units"] or 0) - want) if want else 0
            return (d, -(x.get("quality") or 0))
        c.sort(key=key)
        picked, per = [], {}
        for x in c:
            sl = x["id"].rsplit("_s", 1)[0]
            if per.get(sl, 0) >= 1: continue
            per[sl] = 1; picked.append(x)
            if len(picked) >= N: break

        cards = []
        for j, x in enumerate(picked, 1):
            k = x["id"]
            if k not in copied:
                src = os.path.join(SRC, k + ".jpg")
                if os.path.exists(src):
                    try:
                        from PIL import Image
                        im = Image.open(src).convert("RGB")
                        if im.width > 460:
                            im = im.resize((460, round(im.height * 460 / im.width)), Image.LANCZOS)
                        if im.height > 620:
                            im = im.crop((0, 0, im.width, 620))
                        im.save(os.path.join(OUT, k + ".jpg"), quality=78, optimize=True)
                    except Exception:
                        shutil.copy(src, os.path.join(OUT, k + ".jpg"))
                    copied.add(k)
            nm, url = SITE.get(k.rsplit("_s", 1)[0], (k.rsplit("_s", 1)[0], ""))
            ph = "写真あり" if x["unitPhoto"] else "写真なし"
            u = f'{x["units"]}個' if x["units"] else "繰り返しなし"
            cards.append(f'''<figure class="c">
  <div class="c__no">{no}-{j}</div>
  <img src="./pick/{k}.jpg" alt="{html.escape(nm)}" loading="lazy">
  <figcaption>
    <span class="m">{u}・{ph}・文字{x["textAmt"]}</span>
    <button class="id" data-id="{k}">{k}</button>
    <span class="st">{html.escape(nm)}</span>
    {f'<a href="{html.escape(url)}" target="_blank" rel="noopener">↗</a>' if url else ''}
  </figcaption>
</figure>''')

        blocks.append(f'''<section class="s" id="s{no}">
  <h2><span>{no}</span>{html.escape(name)}</h2>
  <p class="spec"><b>入れる内容</b>{html.escape(spec)}</p>
  <p class="hint">この分量が入る型だけを出しています（{len(picked)}件）。「<b>{no}-7</b>」のように番号を言ってください。良いものが無ければ「{no} 無し」。</p>
  <div class="grid">{''.join(cards)}</div>
</section>''')
        print(f"  {no} {name}: {len(picked)}件（母数 {len(c)}）")

    nav = "".join(f'<a href="#s{no}">{no} {html.escape(v[0].split("（")[0])}</a>' for no, v in SPEC.items())
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
.s h2{{display:flex;align-items:center;gap:10px;font-size:20px;font-weight:900;margin:0 0 8px}}
.s h2 span{{background:#111;color:#fff;border-radius:6px;font-size:13px;padding:3px 9px;font-family:ui-monospace,monospace}}
.spec{{margin:0 0 4px;font-size:13px;color:#222;background:#fff;border-left:4px solid #00B21F;padding:10px 14px;border-radius:0 6px 6px 0}}
.spec b{{display:inline-block;font-size:11px;color:#00B21F;margin-right:10px}}
.hint{{margin:6px 0 16px;font-size:12.5px;color:#666}}
.grid{{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}}
.c{{margin:0;position:relative;background:#fff;border:1px solid #DDD;border-radius:10px;overflow:hidden}}
.c__no{{position:absolute;left:9px;top:9px;z-index:2;background:rgba(17,17,17,.9);color:#fff;
  font-family:ui-monospace,monospace;font-size:12.5px;font-weight:700;border-radius:6px;padding:3px 9px}}
.c img{{width:100%;display:block;max-height:440px;object-fit:cover;object-position:top;cursor:zoom-in}}
figcaption{{padding:7px 10px;font-size:11px;border-top:1px solid #EEE;display:flex;flex-wrap:wrap;align-items:center;gap:6px}}
.m{{flex:0 0 100%;font-size:10.5px;color:#00874F;font-weight:700}}
.id{{font-family:ui-monospace,monospace;font-size:10.5px;font-weight:700;background:#EFEFEF;border:0;border-radius:5px;padding:3px 7px;cursor:pointer}}
.id.ok{{background:#00B21F;color:#fff}}
.st{{color:#666;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
figcaption a{{color:#0F62FE;text-decoration:none;font-weight:700}}
dialog{{border:0;padding:0;max-width:96vw;max-height:94vh;border-radius:10px;overflow:auto}}
dialog::backdrop{{background:rgba(0,0,0,.82)}} dialog img{{max-width:min(1280px,94vw);display:block}}
</style></head><body>
<header><div class="in">
<h1>ESL club｜セクションごとの目標を選ぶ</h1>
<p class="lead">教育・スクール系 295サイト・2,356セクションを1枚ずつ見て、<b>ESLの原稿がそのまま入る型だけ</b>を残しました。<br>
各セクションの緑の枠が「入れる内容」です。<b>番号（例：04-6）を言うだけ</b>で、その通りに作ります。</p>
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
    print(f"→ docs/pick.html（画像 {len(copied)}枚）")


main()
