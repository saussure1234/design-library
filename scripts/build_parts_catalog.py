# -*- coding: utf-8 -*-
"""実装済みパーツを「見て選べる」カタログにする。

parts/<type>/<id>/ を走査し
  ・単体プレビュー docs/p/<type>__<id>.html  （実際に動くHTML）
  ・一覧      docs/parts.html            （iframeで実物を並べ、IDをコピーできる）
を書き出す。

各パーツに demo.json（表示用のダミー内容）を置くと、それで描画する。
meta.json の refs に参考セクションIDを書いておくと、一覧に「元ネタ」も並ぶ。
"""
import os, sys, json, glob, html, shutil

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
from build import render, load_part, RUNTIME_JS   # noqa: E402

PARTS = os.path.join(ROOT, "parts")
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(DOCS, "p")
DEMO_IMG = os.path.join(DOCS, "demo")

TYPE_JA = {
    "hero": "ファーストビュー", "problem": "悩み・こんな方へ", "value": "提供価値",
    "features": "強み・特徴", "numbers": "実績の数字", "flow": "流れ・ステップ",
    "voice": "お客様の声", "curriculum": "コース・内容", "member": "講師・スタッフ",
    "price": "料金", "compare": "比較", "faq": "よくある質問", "cta": "CTA・申込",
    "gallery": "写真の見せ場", "message": "メッセージ", "access": "アクセス",
    "news": "お知らせ", "nav": "ヘッダー", "footer": "フッター",
}


def build_preview(pid, meta, demo):
    tok = open(os.path.join(PARTS, "_tokens.css"), encoding="utf-8").read()
    base = open(os.path.join(PARTS, "_base.css"), encoding="utf-8").read()
    html_t, css, _ = load_part(pid)
    body = render(html_t, demo)
    return f"""<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>{html.escape(meta.get('name', pid))}</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&display=swap" rel="stylesheet">
<style>{tok}
{base}
{css}
body{{background:#fff}}</style></head><body>
{body}
<script>{RUNTIME_JS}</script></body></html>"""


def main():
    os.makedirs(OUT, exist_ok=True)
    rows = []
    for metap in sorted(glob.glob(os.path.join(PARTS, "*", "*", "meta.json"))):
        d = os.path.dirname(metap)
        pid = os.path.relpath(d, PARTS).replace(os.sep, "/")
        meta = json.load(open(metap, encoding="utf-8"))
        demop = os.path.join(d, "demo.json")
        if not os.path.exists(demop):
            print(f"  demo.json なし → 飛ばす: {pid}")
            continue
        demo = json.load(open(demop, encoding="utf-8"))
        slug = pid.replace("/", "__")
        open(os.path.join(OUT, slug + ".html"), "w", encoding="utf-8").write(
            build_preview(pid, meta, demo))
        rows.append((pid, slug, meta))
    print(f"パーツ {len(rows)} 個")

    types = []
    for _, _, m in rows:
        t = m.get("type", "other")
        if t not in types:
            types.append(t)

    def card(pid, slug, m):
        refs = "".join(
            f'<a class="ref" href="./refs/{r}.jpg" target="_blank" rel="noopener">{html.escape(r)}</a>'
            for r in (m.get("refs") or [])[:4])
        when = "".join(f"<li>{html.escape(w)}</li>" for w in (m.get("when") or []))
        avoid = "".join(f"<li>{html.escape(a)}</li>" for a in (m.get("avoid") or []))
        ver = '<span class="ok">検証済</span>' if m.get("verified") else '<span class="ng">未検証</span>'
        return f"""<article class="p" data-type="{html.escape(m.get('type',''))}" data-q="{html.escape(pid+' '+m.get('name',''))}">
  <div class="p__frame"><iframe src="./p/{slug}.html" loading="lazy" title="{html.escape(m.get('name',pid))}"></iframe>
    <div class="p__zoom"><button class="wide" data-src="./p/{slug}.html">PCで見る</button><button class="narrow" data-src="./p/{slug}.html">スマホで見る</button></div>
  </div>
  <div class="p__body">
    <div class="p__top"><button class="id" data-id="{html.escape(pid)}">{html.escape(pid)}</button>{ver}</div>
    <h3>{html.escape(m.get('name',''))}</h3>
    <p class="int">{html.escape(m.get('intent',''))}</p>
    {'<p class="lbl">向く</p><ul class="when">'+when+'</ul>' if when else ''}
    {'<p class="lbl">向かない</p><ul class="avoid">'+avoid+'</ul>' if avoid else ''}
    {'<p class="lbl">元ネタ</p><p class="refs">'+refs+'</p>' if refs else ''}
  </div>
</article>"""

    cards = "\n".join(card(p, s, m) for p, s, m in rows)
    chips = "".join(
        f'<button class="f" data-f="{html.escape(t)}">{html.escape(TYPE_JA.get(t,t))}</button>'
        for t in types)

    page = f"""<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>パーツカタログ｜実装済み {len(rows)} 型</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700;900&display=swap" rel="stylesheet">
<style>
*{{box-sizing:border-box}}body{{margin:0;font-family:"Noto Sans JP",sans-serif;background:#F1F1F1;color:#111}}
header{{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #DDD;padding:14px 18px}}
.in{{max-width:1500px;margin:0 auto}}h1{{margin:0 0 4px;font-size:17px;font-weight:900}}
p.s{{margin:0 0 10px;font-size:12.5px;color:#555;line-height:1.7}}
.f{{border:1px solid #D5D5D5;background:#fff;border-radius:999px;padding:5px 13px;font:700 12px/1 inherit;cursor:pointer;margin:0 5px 5px 0}}
.f.on{{background:#111;color:#fff;border-color:#111}}
#q{{border:1px solid #D5D5D5;border-radius:999px;padding:6px 14px;font-size:12.5px;width:220px;margin-right:8px;font-family:inherit}}
.grid{{max-width:1500px;margin:0 auto;padding:18px;display:grid;gap:18px;grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}}
.p{{background:#fff;border:1px solid #DDD;border-radius:10px;overflow:hidden;display:flex;flex-direction:column}}
.p[hidden]{{display:none}}
.p__frame{{position:relative;height:330px;background:#fff;border-bottom:1px solid #EEE;overflow:hidden}}
.p__frame iframe{{width:1440px;height:1100px;border:0;transform:scale(.29);transform-origin:0 0;pointer-events:none}}
.p__zoom{{position:absolute;right:8px;bottom:8px;display:flex;gap:6px;opacity:0;transition:opacity .15s}}
.p__frame:hover .p__zoom{{opacity:1}}
.p__zoom button{{border:0;background:rgba(17,17,17,.86);color:#fff;font:700 11px/1 inherit;padding:7px 11px;border-radius:5px;cursor:pointer}}
.p__body{{padding:12px 14px 16px}}
.p__top{{display:flex;align-items:center;gap:8px;margin-bottom:6px}}
.id{{font-family:ui-monospace,monospace;font-size:11px;font-weight:700;background:#EFEFEF;border:0;border-radius:4px;padding:4px 8px;cursor:pointer}}
.id.ok{{background:#00B220;color:#fff}}
.ok,.ng{{font-size:10.5px;font-weight:700;padding:3px 7px;border-radius:4px}}
.ok{{background:#E9F7EB;color:#0A7A21}} .ng{{background:#FFF1E5;color:#B85C00}}
h3{{margin:0 0 4px;font-size:14.5px;font-weight:900}}
.int{{margin:0 0 8px;font-size:12px;color:#555;line-height:1.7}}
.lbl{{margin:8px 0 2px;font-size:10.5px;font-weight:900;color:#888;letter-spacing:.06em}}
ul{{margin:0;padding-left:1.1em;font-size:11.5px;color:#555;line-height:1.75}}
.avoid{{color:#96603A}}
.refs{{margin:0;display:flex;gap:5px;flex-wrap:wrap}}
.ref{{font-family:ui-monospace,monospace;font-size:10.5px;background:#EEF4FF;color:#0F62FE;padding:3px 7px;border-radius:4px;text-decoration:none}}
dialog{{border:0;padding:0;width:min(96vw,1480px);height:92vh;border-radius:10px;overflow:hidden}}
dialog.sp{{width:404px}}
dialog::backdrop{{background:rgba(0,0,0,.8)}}
dialog iframe{{width:100%;height:100%;border:0}}
</style></head><body>
<header><div class="in">
<h1>パーツカタログ｜実装済み {len(rows)} 型</h1>
<p class="s">これは<strong>実際に動くHTML</strong>です（スクショではありません）。<strong>IDをクリックでコピー</strong>→「このIDで組んで」と指示すれば、そのままLPに載ります。<br>枠にカーソルを乗せると<strong>PC / スマホ</strong>で原寸確認できます。</p>
<div><input id="q" placeholder="名前・IDで検索"><button class="f on" data-f="all">すべて</button>{chips}</div>
</div></header>
<div class="grid">{cards}</div>
<dialog id="d"><iframe id="di" title="プレビュー"></iframe></dialog>
<script>
var d=document.getElementById('d'), di=document.getElementById('di');
document.querySelectorAll('.p__zoom button').forEach(function(b){{b.addEventListener('click',function(){{
  d.className = b.classList.contains('narrow') ? 'sp' : '';
  di.src=b.dataset.src; d.showModal();}});}});
d.addEventListener('close',function(){{di.src='about:blank'}});
d.addEventListener('click',function(e){{if(e.target===d) d.close()}});
document.querySelectorAll('.id').forEach(function(b){{b.addEventListener('click',function(){{
  navigator.clipboard.writeText(b.dataset.id);b.classList.add('ok');setTimeout(function(){{b.classList.remove('ok')}},900);}});}});
function apply(){{
  var t=document.querySelector('.f.on').dataset.f, q=document.getElementById('q').value.trim().toLowerCase();
  document.querySelectorAll('.p').forEach(function(c){{
    c.hidden = !((t==='all'||c.dataset.type===t) && (!q||c.dataset.q.toLowerCase().indexOf(q)>=0));
  }});
}}
document.querySelectorAll('.f').forEach(function(f){{f.addEventListener('click',function(){{
  document.querySelectorAll('.f').forEach(function(o){{o.classList.remove('on')}});f.classList.add('on');apply();}});}});
document.getElementById('q').addEventListener('input',apply);
</script></body></html>"""
    open(os.path.join(DOCS, "parts.html"), "w", encoding="utf-8").write(page)
    print("→ docs/parts.html")


if __name__ == "__main__":
    main()
