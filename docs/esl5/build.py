#!/usr/bin/env python3
"""index.html から装飾2案（fv_a / fv_b）を生成する。
土台を直したら必ずこれを再実行する。直接 fv_a.html を編集しない。

■ 数値の根拠（全部 ref/bench/ の実測。DECOR.md 参照）
  ・019 スピークバディの吹き出し … 幅 = 画面の 2.6〜7.2%（中央値3.8%）、9個以上を散らす
  ・036 LITALICO の緑の五角形    … 幅 170px = 画面の 11.8%、不透明100%のベタ、
                                    写真には重ねずセクション境界から生えて下端で切れる
  ・020 5歳児健診の紙飛行機      … 黒2pxの輪郭線が必須＝線画イラストの世界観が前提。
                                    実写のESL clubには移植できないので不採用（実測で判断）

■ 衝突を構造的に避ける設計
  %指定の絶対配置は画面高が変わると本文にぶつかる（実測済み）。
  ・吹き出し → 写真カラム .fv-visual に px で紐づけ、円の外周のうち
               .fv-vertical（右側）を避けた角度にだけ置く
  ・五角形   → .features の上端に px で紐づけ（そこにテキストは無い）
"""
import re, os, sys, math

HERE = os.path.dirname(os.path.abspath(__file__))
base = open(os.path.join(HERE, "index.html"), encoding="utf-8").read()

COMMON = """
/* ══════ 装飾レイヤー（ベンチマーク実測・DECOR.md 参照） ══════ */
.fv{overflow:visible}
.fv-visual{position:relative}
.fv-circle{position:relative;z-index:1}
.fv-vertical{position:relative;z-index:1}
.dc{position:absolute;z-index:0;pointer-events:none}
.dc svg{display:block;width:100%;height:100%}
@media (prefers-reduced-motion:reduce){.dc{display:none}}
"""

# ── 案A：吹き出しの群（019 スピークバディ型）＋クリーム地（014京進・020健診型）
#    円(400px)の外周 半径230 に、右側(.fv-vertical)を避けた角度で5個。大きさはバラす。
CIRCLE_R = 230
CX, CY = 216, 200          # .fv-visual 内での円の中心
BUBBLES = [                # (角度°, 直径px)  ※角度は 0°=右, 90°=下
    (-108, 62),
    (-152, 46),
    ( 168, 70),
    ( 132, 50),
    (  96, 40),
]
def bubble_css():
    out = []
    for i, (deg, d) in enumerate(BUBBLES, 1):
        t = math.radians(deg)
        x = CX + CIRCLE_R * math.cos(t) - d / 2
        y = CY + CIRCLE_R * math.sin(t) - d / 2
        out.append(".dc-b%d{left:%dpx;top:%dpx;width:%dpx;height:%dpx}" % (i, round(x), round(y), d, d))
    return "\n".join(out)

A_CSS = COMMON + """
body{background:#FDF7EE}
.fv{background:linear-gradient(180deg,#FDF7EE 0%,#FFFBF5 100%)}
.features{background:#FFFBF5}
""" + bubble_css() + """
@media (max-width:1080px){.dc-b2,.dc-b4{display:none}}
@media (max-width:820px){.dc{display:none}}
"""
# ★白い吹き出しはクリーム地に埋もれて「汚れ」に見えた（実写で確認）。緑の濃淡3段にする
BUBBLE_TONE = ["bubble-green", "bubble-mid", "bubble-green", "bubble-pale", "bubble-mid"]
A_HTML = "".join(
    '      <div class="dc dc-b%d" data-lot="%s" aria-hidden="true"></div>\n' % (i, BUBBLE_TONE[i - 1])
    for i in range(1, len(BUBBLES) + 1))

# ── 案B：緑の不定形五角形（036 LITALICO型）／白地のまま
#    幅は画面の11.8%、ベタ100%、.features の上端から上へ生やして FV との境界で見せる
B_CSS = COMMON + """
.features{position:relative}
/* ★ overflow:hidden を付けると top:-104px の部分が切られて五角形が消える。付けない。
   ★ right:-2% は画面外にはみ出す。内側に入れる。 */
.dc-pent1{left:46%; top:-96px; width:11.8vw;min-width:130px;max-width:190px;aspect-ratio:1/1;height:auto}
.dc-pent2{right:3%; top:-44px; width:7vw;  min-width:80px; max-width:120px;aspect-ratio:1/1;height:auto}
@media (max-width:820px){.dc-pent2{display:none}.dc-pent1{top:-64px;left:52%}}
"""
B_HTML = """      <div class="dc dc-pent1" data-lot="blob-green" aria-hidden="true"></div>
      <div class="dc dc-pent2" data-lot="blob-green" aria-hidden="true"></div>
"""

JS = """
<script src="./vendor/lottie_light.min.js"></script>
<script>
document.querySelectorAll('[data-lot]').forEach(function(el){
  lottie.loadAnimation({container:el,renderer:'svg',loop:true,autoplay:true,
                        path:'./lottie/own/'+el.dataset.lot+'.json'});
});
</script>
"""


def build(name, css, html, anchor):
    s = base
    s = s[:s.rindex("</style>")] + css + s[s.rindex("</style>"):]
    m = re.search(anchor, s)
    if not m:
        sys.exit("★ アンカーが見つからない: %s" % anchor)
    s = s[:m.end()] + html + s[m.end():]
    s = s[:s.rindex("</body>")] + JS + s[s.rindex("</body>"):]
    p = os.path.join(HERE, name)
    open(p, "w", encoding="utf-8").write(s)
    print("  %-12s %dKB  装飾%d個" % (name, len(s.encode()) // 1024, html.count("<div")))


if __name__ == "__main__":
    build("fv_a.html", A_CSS, A_HTML, r'<div class="fv-visual">\n')
    build("fv_b.html", B_CSS, B_HTML, r'<section class="section features" id="features">\n')
