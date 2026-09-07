# -*- coding: utf-8 -*-
"""ベンチマークのFVを撮る（ESL club 小学生向け用）。
   ★ESL clubの61本は教育LPで、素材の構成が違うので使えない。
   ★deviceScaleFactor=1 で撮る（2で撮ると2倍画像になり、1倍のつもりで切ると左上1/4だけ見て誤読する）
   ★clearDeviceMetricsOverride を毎回先に呼ぶ（mobileフラグが残る）
   ★失敗判定は「真っ黒か」ではなく【一色に潰れているか】（暗いデザインを弾かないため）"""
import asyncio, json, base64, time, urllib.request, websockets, io, os, collections, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
OUT  = os.path.join(HERE, "bench")
LIST = os.path.join(HERE, "_list.json")
S, E = int(sys.argv[1]), int(sys.argv[2])

def looks_loaded(im):
    t = im.copy(); t.thumbnail((140, 140))
    c = collections.Counter((r//16*16, g//16*16, b//16*16) for r, g, b in t.getdata())
    n = t.width * t.height
    top = c.most_common(1)[0][1] / n
    kinds = sum(1 for _, v in c.items() if v / n >= 0.004)
    return top < 0.94 and kinds >= 4

def slug(u):
    return (u.replace("https://", "").replace("http://", "")
             .rstrip("/").replace("/", "_").replace(".", "_").replace(":", "")[:60])

async def run():
    os.makedirs(OUT, exist_ok=True)
    L = json.load(open(LIST, encoding="utf-8"))
    tabs = json.load(urllib.request.urlopen("http://127.0.0.1:9350/json/list"))
    page = [t for t in tabs if t.get("type") == "page"][0]
    async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
        n = [0]
        async def cdp(m, p=None, to=40):
            n[0] += 1; mid = n[0]
            await ws.send(json.dumps({"id": mid, "method": m, "params": p or {}}))
            end = time.time() + to
            while time.time() < end:
                try:
                    r = json.loads(await asyncio.wait_for(ws.recv(), timeout=to))
                except asyncio.TimeoutError:
                    return {}
                if r.get("id") == mid:
                    return r.get("result", {})
            return {}
        await cdp("Page.enable"); await cdp("Runtime.enable")
        ok = ng = 0
        for i, o in enumerate(L[S:E], S):
            p = os.path.join(OUT, "%03d_%s.png" % (i, slug(o["url"])))
            if os.path.exists(p):
                ok += 1; continue
            await cdp("Emulation.clearDeviceMetricsOverride"); await asyncio.sleep(0.18)
            await cdp("Emulation.setDeviceMetricsOverride",
                      {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
            await cdp("Page.navigate", {"url": o["url"]}, to=30)
            await asyncio.sleep(6.5)
            im = None
            for _ in range(2):
                s = await cdp("Page.captureScreenshot", {"format": "png"}, to=30)
                if not s.get("data"):
                    await asyncio.sleep(1.5); continue
                c = Image.open(io.BytesIO(base64.b64decode(s["data"]))).convert("RGB")
                if looks_loaded(c):
                    im = c; break
                await asyncio.sleep(2)
            if im is None:
                ng += 1; continue
            im.save(p); ok += 1
        print("%d〜%d 撮れた%d 失敗%d" % (S, E, ok, ng))

asyncio.run(run())
