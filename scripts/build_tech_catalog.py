# -*- coding: utf-8 -*-
"""工夫（引き出し）のカタログを作る。

    python3 build_tech_catalog.py

techniques/<lens>/<id>/{tech.json, demo.html} を読み、
・実際にレンダリングされたデモ
・「普通ならこうする」との対比
・そのままコピーできるCSS
を1ページに並べる。IDをクリックでコピー→「このIDを使って」と指示できる。
"""
import glob, html, json, os, re

LIB = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(LIB, "docs")
OUT_T = os.path.join(DOCS, "t")
IMG_REFS = os.path.join(DOCS, "refs")

LENS_JA = {"type": "文字", "overlap": "かさなり", "rule": "罫と枠", "shape": "かたち",
           "space": "余白", "color": "色", "edge": "境界", "flow": "視線"}


def load_refs():
    """セクションID → (サイト名, 実サイトURL, 画像の有無)"""
    import csv
    m = {}
    p = os.path.join(LIB, "index.csv")
    if os.path.exists(p):
        for r in csv.DictReader(open(p, encoding="utf-8-sig")):
            m[r["id"]] = (r.get("site", ""), r.get("url", ""))
    return m


def main():
    os.makedirs(OUT_T, exist_ok=True)
    REFS = load_refs()
    tokens = open(os.path.join(LIB, "parts", "_tokens.css"), encoding="utf-8").read()
    base = open(os.path.join(LIB, "parts", "_base.css"), encoding="utf-8").read()

    items = []
    for tj in sorted(glob.glob(os.path.join(LIB, "techniques", "*", "*", "tech.json"))):
        d = os.path.dirname(tj)
        lens_slug = os.path.basename(os.path.dirname(d))
        slug = os.path.basename(d)
        tid = f"{lens_slug}/{slug}"
        try:
            meta = json.load(open(tj, encoding="utf-8"))
        except Exception:
            continue
        demo_p = os.path.join(d, "demo.html")
        demo = open(demo_p, encoding="utf-8").read() if os.path.exists(demo_p) else ""
        # デモは単体で開ける完全なHTMLにして書き出す（文字化けと写真パスを解決）
        demo = demo.replace("../../../docs/demo/", "../demo/")
        page = f"""<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>{tokens}
{base}
body{{padding:0;margin:0;background:var(--c-bg)}}</style></head>
<body>{demo}</body></html>"""
        fname = f"{lens_slug}__{slug}.html"
        open(os.path.join(OUT_T, fname), "w", encoding="utf-8").write(page)
        items.append({
            "id": tid, "file": f"./t/{fname}", "lens": lens_slug,
            "lensJa": LENS_JA.get(lens_slug, lens_slug),
            "name": meta.get("name", slug),
            "ordinary": meta.get("ordinary", ""),
            "actual": meta.get("actual", ""),
            "why": meta.get("why", ""),
            "css": meta.get("css", ""),
            "applies": meta.get("appliesTo") or [],
            "impact": meta.get("impact", 0), "effort": meta.get("effort", 0),
            "sources": meta.get("sources") or [],
        })

    items.sort(key=lambda x: (x["lens"], -x["impact"], x["effort"]))

    def card(t):
        ap = "".join(f'<i>{html.escape(a)}</i>' for a in t["applies"][:6])
        # ★ 主役は「元のLPの実スクショ」。抽象図とコードは折りたたみに落とす
        shots = []
        for sid in t["sources"][:3]:
            img = os.path.join(IMG_REFS, f"{sid}.jpg")
            if not os.path.exists(img):
                continue
            site, url = REFS.get(sid, ("", ""))
            shots.append(
                f'<figure class="sh"><img src="./refs/{sid}.jpg" loading="lazy" alt="{html.escape(site)} {sid}">'
                f'<figcaption><b>{html.escape(site or sid)}</b>'
                f'<code>{sid}</code>'
                + (f'<a href="{html.escape(url)}" target="_blank" rel="noopener">実サイト ↗</a>' if url else '')
                + '</figcaption></figure>')
        shots_html = ('<div class="shots">' + "".join(shots) + '</div>') if shots else \
                     '<div class="noshot">元スクショなし</div>'
        return f'''<article class="t" data-lens="{t['lens']}" data-applies="{html.escape(' '.join(t['applies']))}"
  data-q="{html.escape(t['name'] + ' ' + t['id'] + ' ' + t['actual'])}">
  <div class="t__head">
    <button class="id" data-id="{t['id']}">{t['id']}</button>
    <span class="lens">{t['lensJa']}</span>
    <h3>{html.escape(t['name'])}</h3>
  </div>
  {shots_html}
  <div class="t__body">
    <dl>
      <dt>普通なら</dt><dd class="ord">{html.escape(t['ordinary'])}</dd>
      <dt>ここでは</dt><dd class="act">{html.escape(t['actual'])}</dd>
    </dl>
    <details>
      <summary>作った見本とコードを見る（効き{t['impact']} / 手間{t['effort']}）</summary>
      <div class="t__demo"><iframe src="{t['file']}" loading="lazy" title="{html.escape(t['name'])}"></iframe></div>
      <p class="mini"><a href="{t['file']}" target="_blank" rel="noopener">見本を単体で開く ↗</a></p>
      {f'<dl class="why"><dt>効く理由</dt><dd>{html.escape(t["why"])}</dd></dl>' if t['why'] else ''}
      {f'<pre><code>{html.escape(t["css"])}</code></pre>' if t['css'] else ''}
    </details>
    <p class="foot">{ap}</p>
  </div>
</article>'''

    lenses = []
    for t in items:
        if t["lensJa"] not in [l[1] for l in lenses]:
            lenses.append((t["lens"], t["lensJa"]))
    applies = sorted({a for t in items for a in t["applies"]})

    chips = "".join(f'<button class="f" data-f="{s}">{j}</button>' for s, j in lenses)
    achips = "".join(f'<button class="a" data-a="{html.escape(a)}">{html.escape(a)}</button>' for a in applies)

    page = f'''<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>工夫カタログ｜{len(items)}件の引き出し</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:"Noto Sans JP",sans-serif;background:#EFEFEF;color:#151515;line-height:1.85}}
header{{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #DDD;padding:14px 20px}}
.in{{max-width:1700px;margin:0 auto}}
h1{{margin:0 0 4px;font-size:18px;font-weight:900}}
p.s{{margin:0 0 10px;font-size:12.5px;color:#555}}
.row{{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px}}
.row b{{font-size:11px;color:#888;margin-right:4px;font-weight:700}}
.f,.a{{border:1px solid #D5D5D5;background:#fff;border-radius:999px;padding:4px 12px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}}
.f.on,.a.on{{background:#111;color:#fff;border-color:#111}}
#q{{border:1px solid #D5D5D5;border-radius:999px;padding:6px 14px;font-family:inherit;font-size:12.5px;width:240px}}
#n{{font-size:12px;color:#666}}
.grid{{max-width:1700px;margin:0 auto;padding:18px;display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(520px,1fr))}}
.t{{background:#fff;border:1px solid #DDD;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}}
.t[hidden]{{display:none}}
/* 主役＝元のLPの実スクショ */
.shots{{display:flex;gap:2px;background:#E4E4E4;border-bottom:1px solid #DDD}}
.sh{{margin:0;flex:1;min-width:0;background:#fff;display:flex;flex-direction:column}}
.sh img{{width:100%;display:block;max-height:560px;object-fit:cover;object-position:top;cursor:zoom-in}}
.sh figcaption{{display:flex;align-items:center;gap:6px;padding:6px 8px;font-size:10.5px;color:#777;border-top:1px solid #F0F0F0}}
.sh figcaption b{{color:#222;font-weight:700;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}}
.sh figcaption code{{font-family:ui-monospace,monospace;font-size:9.5px;color:#9A9A9A}}
.sh figcaption a{{margin-left:auto;color:#0F62FE;text-decoration:none;font-weight:700;white-space:nowrap}}
.noshot{{padding:40px;text-align:center;color:#AAA;font-size:12px;background:#F7F7F7;border-bottom:1px solid #DDD}}
details{{margin:10px 0 8px;border-top:1px solid #EEE;padding-top:8px}}
summary{{cursor:pointer;font-size:12px;font-weight:700;color:#0F62FE;list-style:none}}
summary::-webkit-details-marker{{display:none}}
summary::before{{content:"▸ ";color:#999}}
details[open] summary::before{{content:"▾ "}}
.mini{{margin:6px 0 0;font-size:11px}}
.mini a{{color:#0F62FE;text-decoration:none;font-weight:700}}
.t__demo{{margin-top:8px;background:#fff;border:1px solid #EEE;border-radius:6px;height:420px;overflow:hidden}}
.t__demo iframe{{width:100%;height:100%;border:0;display:block}}
.t__body{{padding:14px 16px 16px}}
.t__head{{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px 14px 10px}}
.t__head h3{{flex:0 0 100%;margin:2px 0 0}}
.id{{font-family:ui-monospace,monospace;font-size:11.5px;font-weight:700;background:#EFEFEF;border:0;border-radius:5px;padding:3px 8px;cursor:pointer}}
.id.ok{{background:#00B220;color:#fff}}
.lens{{font-size:11px;font-weight:700;color:#fff;background:#666;border-radius:4px;padding:2px 8px}}
.mi{{font-size:11px;color:#888}}
.open{{margin-left:auto;font-size:11.5px;color:#0F62FE;text-decoration:none;font-weight:700}}
h3{{margin:0 0 8px;font-size:15.5px;font-weight:900;line-height:1.5}}
dl{{margin:0 0 10px;display:grid;grid-template-columns:64px 1fr;gap:2px 10px;font-size:12.5px}}
dt{{color:#888;font-weight:700;font-size:11.5px;padding-top:2px}}
dd{{margin:0;line-height:1.75}}
.ord{{color:#8A8A8A}}
.act{{color:#111;font-weight:600}}
pre{{margin:0 0 8px;background:#151515;color:#E6E6E6;border-radius:6px;padding:10px 12px;overflow-x:auto}}
code{{font-family:ui-monospace,monospace;font-size:11.5px;line-height:1.7;white-space:pre-wrap;word-break:break-all}}
.foot{{margin:0;font-size:11px;color:#999;display:flex;flex-wrap:wrap;gap:5px;align-items:center}}
.foot i{{font-style:normal;background:#F1F1F1;border-radius:4px;padding:2px 7px;color:#555;font-weight:700}}
.src{{margin-left:auto;font-family:ui-monospace,monospace;font-size:10.5px}}
dialog{{border:0;padding:0;max-width:96vw;max-height:94vh;border-radius:10px;overflow:auto}}
dialog::backdrop{{background:rgba(0,0,0,.8)}} dialog img{{max-width:min(1100px,94vw);display:block}}
</style></head><body>
<header><div class="in">
<h1>工夫カタログ｜{len(items)}件の引き出し</h1>
<p class="s"><strong>大きい画像＝実際のサイトのスクショ</strong>（これを見て選んでください）。折りたたみの中は、俺が実装した見本とコードです。<strong>IDをクリックでコピー</strong>→「このIDをここに使って」と指示してください。</p>
<div class="row"><b>観点</b><button class="f on" data-f="all">すべて</button>{chips}
  <input id="q" placeholder="検索（名前・内容）"><span id="n"></span></div>
<div class="row"><b>使う場所</b><button class="a on" data-a="all">すべて</button>{achips}</div>
</div></header>
<div class="grid">{"".join(card(t) for t in items)}</div>
<dialog id="dlg"><img id="dimg" alt=""></dialog>
<script>
document.querySelectorAll('.sh img').forEach(function(i){{i.addEventListener('click',function(){{
  document.getElementById('dimg').src=i.src;document.getElementById('dlg').showModal();}});}});
document.getElementById('dlg').addEventListener('click',function(){{this.close();}});
document.querySelectorAll('.id').forEach(function(b){{b.addEventListener('click',function(){{
  navigator.clipboard.writeText(b.dataset.id);b.classList.add('ok');setTimeout(function(){{b.classList.remove('ok')}},900);}});}});
function apply(){{
  var L=document.querySelector('.f.on').dataset.f,
      A=document.querySelector('.a.on').dataset.a,
      q=document.getElementById('q').value.trim().toLowerCase(), n=0;
  document.querySelectorAll('.t').forEach(function(c){{
    var ok=(L==='all'||c.dataset.lens===L)
        && (A==='all'||(' '+c.dataset.applies+' ').indexOf(' '+A+' ')>=0)
        && (!q||c.dataset.q.toLowerCase().indexOf(q)>=0);
    c.hidden=!ok; if(ok)n++;
  }});
  document.getElementById('n').textContent=n+'件';
}}
document.querySelectorAll('.f').forEach(function(f){{f.addEventListener('click',function(){{
  document.querySelectorAll('.f').forEach(function(o){{o.classList.remove('on')}});f.classList.add('on');apply();}});}});
document.querySelectorAll('.a').forEach(function(f){{f.addEventListener('click',function(){{
  document.querySelectorAll('.a').forEach(function(o){{o.classList.remove('on')}});f.classList.add('on');apply();}});}});
document.getElementById('q').addEventListener('input',apply);
apply();
</script></body></html>'''
    open(os.path.join(DOCS, "techniques.html"), "w", encoding="utf-8").write(page)

    # シートに貼れる一覧も出す
    import csv
    with open(os.path.join(LIB, "techniques_impl.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["id", "観点", "名前", "普通なら", "ここでは", "効く理由", "CSS", "使う場所", "効き", "手間", "出典"])
        for t in items:
            w.writerow([t["id"], t["lensJa"], t["name"], t["ordinary"], t["actual"], t["why"],
                        t["css"], " ".join(t["applies"]), t["impact"], t["effort"], " ".join(t["sources"])])
    print(f"工夫 {len(items)} 件 → docs/techniques.html / techniques_impl.csv")


if __name__ == "__main__":
    main()
