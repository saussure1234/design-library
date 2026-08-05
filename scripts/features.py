# -*- coding: utf-8 -*-
"""切り出したセクション画像から、選ぶための手がかりを機械的に取る。

    python3 features.py <セクションDIR> <出力.json>

エージェントに分類させると数千枚では現実的でないので、
画像処理だけで「何が写っているか」の当たりを付ける。

取るもの:
  cols     … 縦の切れ目の数（1カラム／2カラム／3カラム…）
  photo    … 写真らしい領域の割合（局所の細かさで判定）
  table    … 横罫が等間隔に並んでいるか（表・リスト）
  dark     … 暗い面かどうか
  ink      … 文字の密度
  chroma   … 色の鮮やかさ
  ratio    … 横縦比
  bright   … 平均の明るさ
"""
import json, os, sys, glob
import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None


def feats(path):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    small = im.resize((240, max(40, min(600, int(240 * H / W)))))
    a = np.asarray(small, dtype=np.int16)
    g = a.mean(axis=2)
    h, w = g.shape

    bright = float(g.mean())
    # 彩度
    mx = a.max(axis=2); mn = a.min(axis=2)
    chroma = float((mx - mn).mean())

    # 文字の密度：細かい濃淡の変化
    dx = np.abs(np.diff(g, axis=1)).mean()
    dy = np.abs(np.diff(g, axis=0)).mean()
    ink = float((dx + dy) / 2)

    # 写真らしさ：局所の分散が高く、かつ色が乗っている領域
    bs = 12
    rich = 0; tot = 0
    for y in range(0, h - bs, bs):
        for x in range(0, w - bs, bs):
            blk = a[y:y+bs, x:x+bs]
            tot += 1
            if blk.std() > 22 and (blk.max(axis=2) - blk.min(axis=2)).mean() > 14:
                rich += 1
    photo = round(rich / max(1, tot), 3)

    # 縦の切れ目：列方向に「ずっと同じ色」の細い帯が何本あるか
    colvar = g.std(axis=0)
    quiet = colvar < (colvar.mean() * 0.35)
    runs, st = [], None
    for i, q in enumerate(quiet):
        if q and st is None: st = i
        elif not q and st is not None:
            if i - st >= 2: runs.append((st, i))
            st = None
    inner = [r for r in runs if 12 < r[0] < w - 12]
    cols = len(inner) + 1

    # 横罫：行方向に急に暗くなる線が等間隔にあるか
    rowmean = g.mean(axis=1)
    d = np.abs(np.diff(rowmean))
    lines = int((d > d.mean() * 3).sum())
    table = round(min(1.0, lines / max(6, h / 12)), 3)

    return dict(w=W, h=H, ratio=round(W / max(1, H), 2),
                bright=round(bright, 1), chroma=round(chroma, 1),
                ink=round(ink, 2), photo=photo, cols=min(cols, 6), table=table,
                dark=bool(bright < 120))


def main():
    src, out = sys.argv[1], sys.argv[2]
    files = sorted(glob.glob(os.path.join(src, "*.jpg")))
    res = {}
    for i, p in enumerate(files, 1):
        n = os.path.basename(p)[:-4]
        try:
            res[n] = feats(p)
        except Exception:
            continue
        if i % 400 == 0:
            print(f"[{i}/{len(files)}]", flush=True)
    json.dump(res, open(out, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"完了 {len(res)} 件 → {out}")


if __name__ == "__main__":
    main()
