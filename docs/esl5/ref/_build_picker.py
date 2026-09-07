# -*- coding: utf-8 -*-
"""撮れたベンチマークを【実寸に近い大きさ】で並べた選択画面を作る。
   ★小さいサムネ一覧にしない。前に各300pxの一覧で見て、5本中3本のラベルと中身を取り違えた。
     1枚700px＋クリックで原寸、にする。"""
import json, os, re, glob

HERE = os.path.dirname(os.path.abspath(__file__))
L = json.load(open(os.path.join(HERE, "_list.json"), encoding="utf-8"))

rows = []
for p in sorted(glob.glob(os.path.join(HERE, "bench", "*.png"))):
    b = os.path.basename(p)
    m = re.match(r"^(\d{3})_", b)
    if not m:
        continue
    i = int(m.group(1))
    o = next((x for x in L if int(x.get("key","-1"))==i), {})
    rows.append((i, b, o.get("name", "?"), o.get("url", "")))

cards = "\n".join(
    f'''  <figure class="c" id="b{i}">
    <figcaption><span class="n">{i:03d}</span>
      <b>{name}</b>
      <a href="{url}" target="_blank" rel="noopener">{url}</a></figcaption>
    <a href="bench/{b}" target="_blank"><img src="bench/{b}" alt="{i:03d}" loading="lazy"></a>
  </figure>''' for i, b, name, url in rows)

html = f"""<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>小学生向けベンチマーク（{len(rows)}本）</title>
<style>
*{{box-sizing:border-box}}
body{{margin:0;background:#1a1d1c;color:#e8ece9;
  font-family:"Hiragino Sans",system-ui,sans-serif;line-height:1.7}}
header{{position:sticky;top:0;z-index:9;background:#12403f;padding:14px 24px;
  box-shadow:0 2px 12px rgba(0,0,0,.4)}}
header h1{{margin:0;font-size:17px;font-weight:800}}
header p{{margin:2px 0 0;font-size:13px;opacity:.8}}
main{{display:grid;grid-template-columns:repeat(auto-fill,minmax(700px,1fr));
  gap:28px;padding:24px}}
.c{{margin:0;background:#222725;border-radius:10px;overflow:hidden}}
figcaption{{display:flex;align-items:baseline;gap:10px;padding:10px 14px;flex-wrap:wrap}}
.n{{font-size:20px;font-weight:900;color:#7FC9AE;font-variant-numeric:tabular-nums}}
figcaption b{{font-size:14px}}
figcaption a{{font-size:11px;color:#8fa39a;text-decoration:none;word-break:break-all}}
.c img{{width:100%;height:auto;display:block;border-top:1px solid #333}}
@media(max-width:760px){{main{{grid-template-columns:1fr;padding:12px;gap:16px}}}}
</style></head><body>
<header>
  <h1>ベンチマークを選ぶ — {len(rows)}本</h1>
  <p>気になった番号を言ってください（例：「012」）。画像をクリックで原寸、URLで実物。</p>
</header>
<main>
{cards}
</main>
</body></html>"""

out = os.path.join(HERE, "picker.html")
open(out, "w", encoding="utf-8").write(html)
print("%s（%d本）" % (out, len(rows)))
