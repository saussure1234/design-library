# -*- coding: utf-8 -*-
"""切り出したセクションを「選べるカタログ」にする。

    python3 build_catalog.py

読むもの:  _raw/pc/*.jpg（全長）  _raw/sections/*.jpg（セクション）
           lists/all.tsv（name→URL）  harvest_sites.csv（社名・業種）
書くもの:  docs/full/*.jpg  docs/refs/*.jpg  docs/index.html  index.csv
"""
import csv, glob, html, os, re, shutil
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

LIB  = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW  = os.path.join(LIB, "_raw", "pc")
SEC  = os.path.join(LIB, "_raw", "sections")
DOCS = os.path.join(LIB, "docs")
IMG  = os.path.join(DOCS, "refs")
FIMG = os.path.join(DOCS, "full")

FULL_W = 900     # 全画面ビューの幅
CAT_FALLBACK = "その他"


def load_meta():
    """name -> (社名, URL, カテゴリ)"""
    url_of = {}
    p = os.path.join(LIB, "lists", "all.tsv")
    if os.path.exists(p):
        for line in open(p, encoding="utf-8"):
            parts = line.rstrip("\n").split("\t")
            if len(parts) >= 2:
                url_of[parts[0].strip()] = parts[1].strip()

    def dom(u):
        return re.sub(r"^https?://(www\.)?", "", u or "").split("/")[0].lower()

    by_dom = {}
    p = os.path.join(LIB, "harvest_sites.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            by_dom[dom(r.get("url", ""))] = (r.get("name", ""), r.get("industry", "") or CAT_FALLBACK)

    # 最初に手で分類した49サイトはそちらを優先
    hand = {}
    p = os.path.join(LIB, "index.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            sid = r.get("id", "").rsplit("_s", 1)[0]
            if sid and sid not in hand:
                hand[sid] = (r.get("site", ""), r.get("category", ""))

    meta = {}
    for name, u in url_of.items():
        nm, cat = by_dom.get(dom(u), ("", CAT_FALLBACK))
        if name in hand and hand[name][0]:
            nm = hand[name][0]
            cat = hand[name][1] or cat
        meta[name] = (nm or dom(u), u, cat or CAT_FALLBACK)
    return meta


def main():
    for d in (IMG, FIMG):
        shutil.rmtree(d, ignore_errors=True)
        os.makedirs(d, exist_ok=True)

    meta = load_meta()

    # 全画面ビュー
    fulls = {}
    srcs = sorted(glob.glob(os.path.join(RAW, "*.jpg")))
    for i, p in enumerate(srcs, 1):
        site = os.path.basename(p)[:-4]
        try:
            im = Image.open(p).convert("RGB")
            im = im.resize((FULL_W, max(1, int(im.height * FULL_W / im.width))))
            im.save(os.path.join(FIMG, f"{site}.jpg"), quality=72, optimize=True)
            fulls[site] = f"./full/{site}.jpg"
        except Exception:
            pass
        if i % 100 == 0:
            print(f"  全画面 {i}/{len(srcs)}", flush=True)

    # セクション
    def key(p):
        m = re.match(r"(.+)_s(\d+)\.jpg$", os.path.basename(p))
        return (m.group(1), int(m.group(2))) if m else (os.path.basename(p), 0)

    rows = []
    for p in sorted(glob.glob(os.path.join(SEC, "*.jpg")), key=key):
        base = os.path.basename(p)
        sid = base[:-4]
        site = sid.rsplit("_s", 1)[0]
        nm, url, cat = meta.get(site, (site, "", CAT_FALLBACK))
        shutil.copy(p, os.path.join(IMG, base))
        rows.append((sid, site, nm, url, cat, base))

    with open(os.path.join(LIB, "index.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "site", "url", "category", "image", "picked", "note"])
        for sid, _s, n, u, c, img in rows:
            w.writerow([sid, n, u, c, img, "", ""])

    cats = []
    for r in rows:
        if r[4] not in cats:
            cats.append(r[4])

    cards = "\n".join(
        f'<figure class="c" data-cat="{html.escape(c)}" data-site="{html.escape(n)}">'
        f'<img src="./refs/{img}" alt="{html.escape(n)} {sid}" loading="lazy">'
        f'<figcaption><button class="id" data-id="{sid}">{sid}</button>'
        f'<span>{html.escape(n)}</span>'
        f'<a class="fl" href="{fulls.get(s, "#")}" target="_blank" rel="noopener" title="全画面">全</a>'
        f'<a href="{html.escape(u)}" target="_blank" rel="noopener" title="実サイト">↗</a>'
        f"</figcaption></figure>"
        for sid, s, n, u, c, img in rows
    )
    chips = "".join(f'<button class="f" data-f="{html.escape(c)}">{html.escape(c)}</button>' for c in cats)

    page = f"""<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>デザイン資産カタログ｜{len(rows)}セクション</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:"Noto Sans JP",sans-serif;background:#F1F1F1;color:#111}}
header{{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #DDD;padding:14px 18px}}
.in{{max-width:1600px;margin:0 auto}}h1{{margin:0 0 4px;font-size:17px;font-weight:900}}
p.s{{margin:0 0 10px;font-size:12.5px;color:#555}}
.f{{border:1px solid #D5D5D5;background:#fff;border-radius:999px;padding:5px 13px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer;margin:0 5px 5px 0}}
.f.on{{background:#111;color:#fff;border-color:#111}}
#q{{border:1px solid #D5D5D5;border-radius:999px;padding:6px 14px;font-family:inherit;font-size:12.5px;width:220px;margin-right:8px}}
#n{{font-size:12px;color:#666;margin-left:6px}}
.grid{{max-width:1600px;margin:0 auto;padding:18px;display:grid;gap:16px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}}
.c{{margin:0;background:#fff;border:1px solid #DDD;border-radius:8px;overflow:hidden;display:flex;flex-direction:column}}
.c[hidden]{{display:none}}
.c img{{width:100%;display:block;max-height:460px;object-fit:cover;object-position:top;cursor:zoom-in}}
figcaption{{display:flex;align-items:center;gap:7px;padding:8px 10px;font-size:11.5px;border-top:1px solid #EEE}}
.id{{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;background:#EFEFEF;border:0;border-radius:4px;padding:3px 7px;cursor:pointer}}
.id.ok{{background:#00B220;color:#fff}}
figcaption span{{color:#555;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
figcaption a{{text-decoration:none;color:#0F62FE;font-weight:700}}
.fl{{background:#EEF4FF;border-radius:4px;padding:3px 7px}}
dialog{{border:0;padding:0;max-width:96vw;max-height:94vh;border-radius:10px;overflow:auto}}
dialog::backdrop{{background:rgba(0,0,0,.78)}} dialog img{{max-width:min(1280px,94vw);display:block}}
</style></head><body>
<header><div class="in">
<h1>デザイン資産カタログ（PC 1440px）｜{len(rows)}セクション / {len(fulls)}サイト</h1>
<p class="s">IDをクリックでコピー →「このIDのここを真似して」と指示してください。<strong>「全」</strong>でそのサイトの全画面。</p>
<div><input id="q" placeholder="サイト名で検索"><button class="f on" data-f="all">すべて</button>{chips}<span id="n"></span></div>
</div></header>
<div class="grid">{cards}</div>
<dialog id="d"><img id="di" alt=""></dialog>
<script>
document.querySelectorAll('.c img').forEach(function(i){{i.addEventListener('click',function(){{
  document.getElementById('di').src=i.src;document.getElementById('d').showModal();}});}});
document.getElementById('d').addEventListener('click',function(){{this.close();}});
document.querySelectorAll('.id').forEach(function(b){{b.addEventListener('click',function(){{
  navigator.clipboard.writeText(b.dataset.id);b.classList.add('ok');setTimeout(function(){{b.classList.remove('ok')}},900);}});}});
function apply(){{
  var cat=document.querySelector('.f.on').dataset.f, q=document.getElementById('q').value.trim(), n=0;
  document.querySelectorAll('.c').forEach(function(c){{
    var ok = (cat==='all'||c.dataset.cat===cat) && (!q || c.dataset.site.indexOf(q)>=0);
    c.hidden = !ok; if(ok) n++;
  }});
  document.getElementById('n').textContent = n + '件';
}}
document.querySelectorAll('.f').forEach(function(f){{f.addEventListener('click',function(){{
  document.querySelectorAll('.f').forEach(function(o){{o.classList.remove('on')}});f.classList.add('on');apply();}});}});
document.getElementById('q').addEventListener('input',apply);
apply();
</script></body></html>"""
    open(os.path.join(DOCS, "index.html"), "w", encoding="utf-8").write(page)
    open(os.path.join(DOCS, "robots.txt"), "w").write("User-agent: *\nDisallow: /\n")
    open(os.path.join(DOCS, ".nojekyll"), "w").write("")
    print(f"セクション {len(rows)} / サイト {len(fulls)} / カテゴリ {cats}")


if __name__ == "__main__":
    main()
