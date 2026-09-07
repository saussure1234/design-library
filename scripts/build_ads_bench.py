# -*- coding: utf-8 -*-
"""ADS案件のベンチマーク比較シートを組む。

    python3 build_ads_bench.py

_raw/adsbench/*.jpg（全長）の頭 900px を切って FV だけを並べる。
数字は scripts/features.py と同じ取り方をする（別々の測り方をすると比較にならない）。

出力： _raw/adsbench/sheet.html （ローカル専用。design-library は public なので公開しない）
"""
import json
import os
import sys

from PIL import Image

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__))))
from features import feats  # noqa: E402

Image.MAX_IMAGE_PIXELS = None

LIB = os.path.expanduser('~/design-library')
SRC = os.path.join(LIB, '_raw/adsbench')
FV = os.path.join(SRC, 'fv')
VIEW_H = 900          # 1440x900 の1画面ぶん＝FV

# key → 表示名。ADSの2本は比較の基準なので先頭に置く
NAMES = {
    'ads_gc_co_jp':                  ('★ ADS 現行サイト', '比較の基準'),
    'ads_lp_preview':                ('★ ADS 私の版', '比較の基準'),
    'sasaki_shiko_co_jp':            ('佐々木紙工', '紙加工・BtoB'),
    'artie_co_jp':                   ('版画工房アーティー', '版画＝刷り物'),
    'www_delfonics_com':             ('DELFONICS', '文具・紙もの'),
    'rollbahn_jp_25th':              ('Rollbahn 25周年', 'ノート'),
    'sobajima_jp_120th_anniversary': ('側島製罐 120周年', '缶・BtoB'),
    'nakamura_seihakusho_co_jp':     ('中村製箔所', '金箔・BtoB'),
    'www_ando_shippo_co_jp':         ('安藤七宝店', '七宝焼'),
    'tamagaway_jp':                  ('玉川釉薬', '釉薬・製造'),
    'terada_knit_co_jp':             ('寺田ニット', 'ニット・製造'),
    'furu1940_co_jp':                ('古川製作所', '包装機械・BtoB'),
    'www_dnp_ds_co_jp':              ('DNPデジタルソリューションズ', '印刷大手のBtoB'),
    'kyoshin_elle_com':              ('協進エル', '革材料・BtoB'),
    'www_seiban_co_jp':              ('セイバン', 'ランドセル'),
    'www_kokuyo_com_furniture_brand_anyway': ('コクヨ Any way', '家具'),
    'www_graf_d3_com':               ('graf', '家具・デザイン'),
}
ORDER = list(NAMES)


def main():
    os.makedirs(FV, exist_ok=True)
    rows = []
    for key in ORDER:
        src = os.path.join(SRC, key + '.jpg')
        if not os.path.exists(src):
            continue
        im = Image.open(src)
        w, h = im.size
        crop = im.crop((0, 0, w, min(VIEW_H, h)))
        out = os.path.join(FV, key + '.jpg')
        crop.save(out, quality=88)
        f = feats(out)
        name, note = NAMES[key]
        rows.append({'key': key, 'name': name, 'note': note, 'img': 'fv/' + key + '.jpg',
                     'pageH': h, **f})

    # 素材の構成が一致しているか＝ADS現行との距離。写真率と文字密度で見る
    base = next((r for r in rows if r['key'] == 'ads_gc_co_jp'), None)
    for r in rows:
        if base and not r['key'].startswith('ads_'):
            r['dist'] = round(abs(r['photo'] - base['photo']) * 2 + abs(r['ink'] - base['ink']) / 6, 3)
        else:
            r['dist'] = -1

    cards = []
    for r in rows:
        star = r['dist'] < 0
        cards.append(f"""
    <figure class="c{' c--base' if star else ''}">
      <img src="{r['img']}" alt="{r['name']}" loading="lazy">
      <figcaption>
        <b>{r['name']}</b><span class="note">{r['note']}</span>
        <dl>
          <div><dt>写真率</dt><dd>{r['photo']:.2f}</dd></div>
          <div><dt>文字密度</dt><dd>{r['ink']:.1f}</dd></div>
          <div><dt>彩度</dt><dd>{r['chroma']:.0f}</dd></div>
          <div><dt>明るさ</dt><dd>{r['bright']:.0f}</dd></div>
          <div><dt>段組</dt><dd>{r['cols']}</dd></div>
          <div><dt>全長</dt><dd>{r['pageH']:,}px</dd></div>
        </dl>
      </figcaption>
    </figure>""")

    html = """<!doctype html><html lang="ja"><head><meta charset="utf-8">
<title>ADS ベンチマーク比較（FV）</title>
<style>
 :root{--ink:#1a1a1a; --sub:#5a5a5a; --line:#e2e0dd; --paper:#f4f3f1; --brand:#aa1b45}
 *{box-sizing:border-box}
 body{margin:0; background:var(--paper); color:var(--ink);
      font:15px/1.7 "Hiragino Sans","Noto Sans JP",system-ui,sans-serif}
 header{padding:40px clamp(20px,4vw,56px) 24px; border-bottom:1px solid var(--line); background:#fff}
 h1{margin:0 0 10px; font-size:22px; letter-spacing:.02em}
 header p{margin:0; color:var(--sub); font-size:13.5px; max-width:78ch}
 main{padding:clamp(20px,3.4vw,44px); display:grid; gap:clamp(20px,2.6vw,34px);
      grid-template-columns:repeat(auto-fill,minmax(430px,1fr))}
 .c{margin:0; background:#fff; border:1px solid var(--line); border-radius:3px; overflow:hidden}
 .c--base{border:2px solid var(--brand)}
 .c img{display:block; width:100%; height:auto; border-bottom:1px solid var(--line)}
 figcaption{padding:14px 16px 16px}
 figcaption b{font-size:15px}
 .note{margin-left:.7em; color:var(--sub); font-size:12.5px}
 dl{display:flex; flex-wrap:wrap; gap:4px 18px; margin:10px 0 0}
 dl div{display:flex; gap:6px; align-items:baseline}
 dt{color:var(--sub); font-size:11.5px}
 dd{margin:0; font-size:13px; font-variant-numeric:tabular-nums}
</style></head><body>
<header>
  <h1>ADS ベンチマーク比較 ── FVだけ</h1>
  <p>MUUUUU.ORG 掲載1,100本から、ADSの一番強い札「刷り上がった紙もの＝物が主役」で構成が一致するものを引いた。
     数字は全部いまここで測ったもの（写真率＝写真らしい面積の割合／文字密度＝細かい濃淡の変化／彩度＝色の鮮やかさ）。
     赤枠の2枚がADS。<b>他社のコードは読まない。見るのは画面だけ。</b></p>
</header>
<main>""" + ''.join(cards) + """
</main></body></html>"""

    p = os.path.join(SRC, 'sheet.html')
    open(p, 'w', encoding='utf-8').write(html)
    print(f'{len(rows)}枚 → {p}')
    for r in rows:
        d = '' if r['dist'] < 0 else f"距離{r['dist']:.2f}"
        print(f"  {r['name'][:22]:24} 写真{r['photo']:.2f} 文字{r['ink']:5.1f} "
              f"彩度{r['chroma']:5.1f} 明{r['bright']:5.1f} 段{r['cols']} {d}")


if __name__ == '__main__':
    raise SystemExit(main())
