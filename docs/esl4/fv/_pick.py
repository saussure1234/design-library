# -*- coding: utf-8 -*-
"""FV候補の選択画面を作る。番号を言うだけで選べる形にする。"""
import os
HERE=os.path.dirname(os.path.abspath(__file__))
C=[("A","A_v05","045 桃山学院大学","https://www.andrew.ac.jp/",
    "高さ540pxの帯に写真2枚（不等幅57/43）。見出しが写真をまたいで白抜きで横断する",
    "写真が主役。045の一番効いている要素＝またぐ巨大文字を入れた","..%2Fref%2Fbench%2F045_www_andrew_ac_jp.png"),
   ("B","B_v07","011 UM English Lab.","https://um-english-lab.com/",
    "純白の地に、細い巨大文字と丸。丸は実測1.05em（前は1.9emで1.8倍あった）",
    "文字が主役。面を1つも作らないので白地で成立する","..%2Fref%2Fbench%2F011_um-english-lab_com.png"),
   ("C","C_v02","028 ひろがり保育プロジェクト","https://seiwagakuen.ed.jp/hhp/",
    "上に見出し／下に写真2枚（隙間93px）／右上から【弧】の帯が抜ける",
    "帯は直線ではなく弧。中心と半径を実測から連立で解いた","..%2Fref%2Fbench%2F028_seiwagakuen_ed_jp_hhp.png")]
cards="\n".join(f'''
<section class="c" id="{k}">
  <header>
    <span class="k">{k}</span>
    <div class="m">
      <b>ベンチマーク：{bn}</b>
      <a href="{bu}" target="_blank" rel="noopener">{bu}</a>
      <p class="d">{how}</p><p class="d2">{ch}</p>
    </div>
    <a class="open" href="{f}.html" target="_blank">実物を開く ↗</a>
  </header>
  <div class="row">
    <figure><figcaption>ベンチマーク</figcaption>
      <img src="{bs.replace("%2F","/")}" loading="lazy"></figure>
    <figure><figcaption>案{k}（PC）</figcaption>
      <img src="_shots/{f}_pc.png" loading="lazy"></figure>
    <figure class="sp"><figcaption>案{k}（スマホ）</figcaption>
      <img src="_shots/{f}_sp.png" loading="lazy"></figure>
  </div>
</section>''' for k,f,bn,bu,how,ch,bs in C)
html=f"""<!doctype html><html lang="ja"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>FV候補 A / B / C</title>
<style>
*{{box-sizing:border-box}}
body{{margin:0;background:#161a18;color:#e9efeb;line-height:1.75;
  font-family:"Hiragino Sans",system-ui,sans-serif}}
h1{{margin:0;font-size:18px}}
.top{{position:sticky;top:0;z-index:9;background:#12403f;padding:14px 26px;
  box-shadow:0 2px 14px rgba(0,0,0,.45)}}
.top p{{margin:2px 0 0;font-size:13px;opacity:.85}}
.c{{border-top:1px solid #2b322e;padding:24px 26px 34px}}
.c header{{display:flex;gap:18px;align-items:flex-start;margin:0 0 16px}}
.k{{font-size:34px;font-weight:900;color:#7FC9AE;line-height:1;flex:none;width:44px}}
.m{{flex:1}} .m b{{font-size:14px}}
.m a{{display:block;font-size:11px;color:#8fa39a;text-decoration:none;word-break:break-all}}
.d{{margin:6px 0 0;font-size:13px}}
.d2{{margin:2px 0 0;font-size:13px;color:#8fd8b8}}
.open{{flex:none;font-size:12px;color:#161a18;background:#7FC9AE;
  padding:8px 14px;border-radius:3px;text-decoration:none;font-weight:700}}
.row{{display:grid;grid-template-columns:1fr 1fr 300px;gap:14px;align-items:start}}
figure{{margin:0;background:#202623;border-radius:6px;overflow:hidden}}
figcaption{{font-size:11px;padding:7px 10px;color:#9db0a6}}
img{{width:100%;height:auto;display:block;border-top:1px solid #313832}}
@media(max-width:1100px){{.row{{grid-template-columns:1fr}}}}
</style></head><body>
<div class="top"><h1>FV候補 — A / B / C</h1>
<p>いずれも【シーン写真2枚＋見出し39字＋数字3つ】という同じ素材。ベンチマークだけが違う。番号を言ってください。</p></div>
{cards}
</body></html>"""
open(os.path.join(HERE,"pick.html"),"w",encoding="utf-8").write(html)
print("pick.html")
