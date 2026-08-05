# -*- coding: utf-8 -*-
"""目標のスクショに、自分で書いたHTMLがどれだけ一致しているかを測る。

    python3 repro.py <target.jpg> <mine.html> [--w 1440] [--out DIR] [--port 9333]

分析して言葉にするのではなく、【同じ絵になるまで直す】ためのループ。
・目標画像と同じ幅でHTMLを描画して撮る
・上端を合わせて重ね、ズレを数値で出す
・どこがズレているかを赤いヒートマップで出す

score が 0 に近いほど一致。作業中は
  1) score を見る  2) diff.png のどこが赤いか見る  3) そこだけ直す
を繰り返す。
"""
import argparse, asyncio, base64, io, json, os, time, urllib.request
import websockets
from PIL import Image, ImageChops, ImageDraw

Image.MAX_IMAGE_PIXELS = None


async def cdp(ws, method, params=None, _id=[0]):
    _id[0] += 1
    i = _id[0]
    await ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        r = json.loads(await ws.recv())
        if r.get("id") == i:
            if "error" in r:
                raise RuntimeError(f"{method}: {r['error']}")
            return r.get("result", {})


def http(port, path, method="PUT"):
    req = urllib.request.Request(f"http://127.0.0.1:{port}{path}", method=method)
    return json.loads(urllib.request.urlopen(req, timeout=12).read())


async def shoot_html(port, url, w, h):
    t = await asyncio.to_thread(http, port, "/json/new?about:blank")
    tid = t["id"]
    try:
        async with websockets.connect(t["webSocketDebuggerUrl"], max_size=200 * 1024 * 1024,
                                      open_timeout=20) as ws:
            await cdp(ws, "Page.enable")
            await cdp(ws, "Emulation.setDeviceMetricsOverride",
                      {"width": w, "height": 900, "deviceScaleFactor": 1, "mobile": False})
            await cdp(ws, "Page.navigate", {"url": url})
            t0 = time.time()
            while time.time() - t0 < 20:
                try:
                    m = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                except asyncio.TimeoutError:
                    continue
                if m.get("method") == "Page.loadEventFired":
                    break
            await cdp(ws, "Runtime.evaluate", {"expression": """
                (async()=>{ try{await document.fonts.ready}catch(e){}
                  const im=[...document.images].filter(i=>!i.complete);
                  await Promise.race([Promise.all(im.map(i=>i.decode().catch(()=>{}))),
                                      new Promise(r=>setTimeout(r,5000))]);
                  await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
                  return 1})()""", "awaitPromise": True})
            mm = await cdp(ws, "Page.getLayoutMetrics")
            css = mm.get("cssContentSize") or mm.get("contentSize")
            full = min(int(css["height"]), max(h * 2, 6000))
            r = await cdp(ws, "Page.captureScreenshot", {
                "format": "png", "captureBeyondViewport": True,
                "clip": {"x": 0, "y": 0, "width": w, "height": full, "scale": 1}})
            return Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")
    finally:
        try:
            await asyncio.to_thread(http, port, f"/json/close/{tid}")
        except Exception:
            pass


def compare(target: Image.Image, mine: Image.Image, outdir: str):
    os.makedirs(outdir, exist_ok=True)
    w = target.width
    if mine.width != w:
        mine = mine.resize((w, round(mine.height * w / mine.width)), Image.LANCZOS)
    h = min(target.height, mine.height)
    t = target.crop((0, 0, w, h))
    m = mine.crop((0, 0, w, h))

    diff = ImageChops.difference(t, m).convert("L")
    px = list(diff.getdata())
    n = len(px)
    mean = sum(px) / n
    over16 = sum(1 for v in px if v > 16) / n * 100
    over48 = sum(1 for v in px if v > 48) / n * 100

    # 赤いヒートマップ（ズレの大きいところほど濃い赤）
    heat = Image.new("RGB", (w, h), (0, 0, 0))
    hp = heat.load(); dp = diff.load()
    for y in range(0, h):
        for x in range(0, w, 1):
            v = dp[x, y]
            if v > 12:
                hp[x, y] = (min(255, 60 + v), 0, 0)
    over = Image.blend(t.convert("RGB"), heat, .55)

    # 横に3枚並べる：目標 / 自分 / ズレ
    sh = Image.new("RGB", (w * 3 + 24, h), (24, 24, 24))
    sh.paste(t, (0, 0)); sh.paste(m, (w + 12, 0)); sh.paste(over, (w * 2 + 24, 0))
    d = ImageDraw.Draw(sh)
    for i, lab in enumerate(["TARGET", "MINE", "DIFF"]):
        d.rectangle([i * (w + 12), 0, i * (w + 12) + 96, 26], fill=(0, 0, 0))
        d.text((8 + i * (w + 12), 7), lab, fill=(255, 255, 255))
    sh.save(os.path.join(outdir, "compare.jpg"), quality=88)
    diff.save(os.path.join(outdir, "diff.png"))
    m.save(os.path.join(outdir, "mine.png"))

    # 帯ごとのズレ（どの高さが悪いか）
    band = max(40, h // 24)
    rows = []
    for y in range(0, h, band):
        seg = [dp[x, yy] for yy in range(y, min(y + band, h), 4) for x in range(0, w, 8)]
        rows.append((y, round(sum(seg) / len(seg), 1)))
    worst = sorted(rows, key=lambda r: -r[1])[:6]
    return dict(score=round(mean, 2), over16=round(over16, 1), over48=round(over48, 1),
                h=h, worst=worst)


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("target")
    ap.add_argument("html")
    ap.add_argument("--w", type=int, default=1440)
    ap.add_argument("--out", default="/tmp/repro")
    ap.add_argument("--port", type=int, default=9333)
    a = ap.parse_args()

    target = Image.open(a.target).convert("RGB")
    if target.width != a.w:
        target = target.resize((a.w, round(target.height * a.w / target.width)), Image.LANCZOS)
    url = a.html if a.html.startswith("http") else "file://" + os.path.abspath(a.html)
    mine = await shoot_html(a.port, url, a.w, target.height)
    r = compare(target, mine, a.out)
    print(f"score={r['score']}  ズレ16超={r['over16']}%  ズレ48超={r['over48']}%  高さ={r['h']}px")
    print("ズレの大きい帯（y, 平均差）:", r["worst"])
    print(f"→ {a.out}/compare.jpg （左=目標 中=自分 右=ズレ）")


if __name__ == "__main__":
    asyncio.run(main())
