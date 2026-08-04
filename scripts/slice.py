# -*- coding: utf-8 -*-
"""全長スクショをセクションごとに切り分ける。

    python3 slice.py <入力DIR> <出力DIR>

やり方：各行の「色のばらつき」を測り、ばらつきが小さい行（＝余白や単色帯）が
一定以上続く場所をセクションの境目とみなして切る。
無地・真っ黒（読み込み失敗）のセクションはここで落とす。
"""
import os, re, sys, glob
from PIL import Image

Image.MAX_IMAGE_PIXELS = None

MIN_SEC_H = 300     # これより短い塊は隣に統合
GAP_MIN   = 30      # 「静かな行」がこれ以上続いたら境目候補
QUIET_STD = 9.0     # 行内のばらつきがこれ未満なら「静かな行」
MAX_SECS  = 16      # 1サイトから出しすぎない
OUT_W     = 720     # 書き出し幅


def row_std(im):
    g = im.convert("L")
    w, h = g.size
    px = g.load()
    step = max(1, w // 90)
    out = []
    for y in range(h):
        vals = [px[x, y] for x in range(0, w, step)]
        m = sum(vals) / len(vals)
        var = sum((v - m) ** 2 for v in vals) / len(vals)
        out.append(var ** 0.5)
    return out


def find_cuts(stds, h):
    quiet = [i for i, s in enumerate(stds) if s < QUIET_STD]
    if not quiet:
        return [0, h]
    runs, start, prev = [], quiet[0], quiet[0]
    for i in quiet[1:]:
        if i == prev + 1:
            prev = i
            continue
        runs.append((start, prev))
        start = prev = i
    runs.append((start, prev))

    cuts = [0]
    for a, b in runs:
        if b - a + 1 >= GAP_MIN:
            cuts.append((a + b) // 2)
    cuts.append(h)

    merged = [cuts[0]]
    for c in cuts[1:]:
        if c - merged[-1] >= MIN_SEC_H:
            merged.append(c)
    if merged[-1] != h:
        merged[-1] = h

    if len(merged) - 1 > MAX_SECS:
        sizes = sorted(((merged[i + 1] - merged[i], i) for i in range(len(merged) - 1)), reverse=True)
        keep = sorted(i for _, i in sizes[:MAX_SECS])
        merged = sorted(set([merged[i] for i in keep] + [h]))
    return merged


def looks_empty(im):
    """ほぼ無地・真っ黒（＝読み込み失敗）を弾く"""
    g = im.convert("L").resize((80, 80))
    px = list(g.getdata())
    m = sum(px) / len(px)
    sd = (sum((v - m) ** 2 for v in px) / len(px)) ** 0.5
    if sd < 13:
        return True
    if m < 42 and sd < 26:
        return True
    return False


def slice_one(path, outdir, name):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    cuts = find_cuts(row_std(im.resize((min(w, 420), h))), h)
    kept = 0
    for i in range(len(cuts) - 1):
        y0, y1 = cuts[i], cuts[i + 1]
        if y1 - y0 < 140:
            continue
        crop = im.crop((0, y0, w, y1))
        if looks_empty(crop):
            continue
        crop = crop.resize((OUT_W, max(1, int(crop.height * OUT_W / crop.width))))
        crop.save(os.path.join(outdir, f"{name}_s{i + 1:02d}.jpg"), quality=80, optimize=True)
        kept += 1
    return kept


if __name__ == "__main__":
    src, outdir = sys.argv[1], sys.argv[2]
    os.makedirs(outdir, exist_ok=True)
    files = sorted(glob.glob(os.path.join(src, "*.jpg")) + glob.glob(os.path.join(src, "*.png")))
    total = 0
    for i, p in enumerate(files, 1):
        name = re.sub(r"\.(jpg|png)$", "", os.path.basename(p))
        try:
            n = slice_one(p, outdir, name)
        except Exception as e:
            print(f"[{i}/{len(files)}] NG {name}: {type(e).__name__}", flush=True)
            continue
        total += n
        if i % 25 == 0 or i == len(files):
            print(f"[{i}/{len(files)}] 累計 {total} セクション", flush=True)
    print(f"完了: {total} セクション / {len(files)} サイト")
