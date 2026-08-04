# -*- coding: utf-8 -*-
"""参考サイトを「アニメーションが解けきった状態」で全長撮影する。

    python3 shoot.py <list.tsv> [--out DIR] [--par 4] [--port 9333] [--sp]

list.tsv は  name<TAB>url  の行。既に出力がある名前は飛ばす（＝中断しても再開できる）。

なぜ手間をかけるか:
  ふつうに撮ると (1) Webフォントが当たる前 (2) 画像が読めていない
  (3) スクロールで出てくる要素が薄いまま (4) 動画が黒 で写る。
  ここでは、それぞれを待って・起こして・確定させてから撮る。

撮り方は「タイル貼り」。ビューポートぶんを撮りながら実際にスクロールして繋ぐ。
captureBeyondViewport はスクロールしないので、スクロール表示のサイトが空で写る。
"""
import asyncio, base64, io, json, os, sys, time, urllib.request, argparse
import websockets
from PIL import Image, ImageChops

Image.MAX_IMAGE_PIXELS = None

MAX_H = 30000          # これ以上長いページは切る
NAV_TIMEOUT = 45       # 読み込みを待つ上限（秒）
SITE_TIMEOUT = 260     # 1サイトにかける上限（秒）
STABLE_TRIES = 3       # 「まだ動いている」判定のやり直し回数
STABLE_WAIT = 0.7      # 2回撮る間隔（秒）
STABLE_DIFF = 0.004    # 差がこの割合を超えたら動いているとみなす


# ── CDP ─────────────────────────────────────────────
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


# ── ページの中で走らせるもの ────────────────────────
# 1) 準備が整うのを待つ：Webフォント／画像のデコード／2フレーム
JS_READY = """
(async () => {
  try { await document.fonts.ready } catch(e) {}
  const imgs = [...document.images].filter(i => !i.complete);
  await Promise.race([
    Promise.all(imgs.map(i => i.decode().catch(()=>{}))),
    new Promise(r => setTimeout(r, 6000)),
  ]);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return document.documentElement.scrollHeight;
})()"""

# 2) ゆっくり流して「スクロールで出てくるもの」を起こす（往復する）
JS_WAKE = """
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const step = Math.max(320, Math.round(window.innerHeight * 0.55));
  const h = () => document.documentElement.scrollHeight;
  for (let y = 0; y < h(); y += step) { window.scrollTo(0, y); await sleep(130); }
  window.scrollTo(0, h()); await sleep(500);
  window.scrollTo(0, 0);   await sleep(500);
  return h();
})()"""

# 3) 動きを確定させる：transitionを止め、薄いままの要素を出し、動画をposterに
#    ・transform は触らない（レイアウトが壊れる）
#    ・メニュー/モーダルは開かない（被さる）
JS_SETTLE = """
(async () => {
  const st = document.createElement('style');
  st.textContent =
    '*,*::before,*::after{animation-duration:.001s!important;animation-delay:0s!important;' +
    'animation-iteration-count:1!important;transition:none!important;' +
    'scroll-behavior:auto!important}';
  document.documentElement.appendChild(st);

  document.querySelectorAll('video').forEach(v => {
    if (v.poster) {
      const i = new Image(); i.src = v.poster;
      i.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
      try { v.replaceWith(i) } catch(e) {}
    } else { v.style.visibility = 'hidden' }
  });

  const SKIP = 'nav,header,[class*="menu"],[class*="Menu"],[class*="nav"],[class*="Nav"],' +
               '[class*="drawer"],[class*="modal"],[class*="Modal"],[class*="popup"],' +
               '[class*="overlay"],[role="dialog"],[aria-hidden="true"]';
  document.querySelectorAll('body *').forEach(el => {
    if (el.closest(SKIP)) return;
    const cs = getComputedStyle(el);
    const o = parseFloat(cs.opacity);
    if (!isNaN(o) && o < .98) el.style.setProperty('opacity','1','important');
    if (cs.visibility === 'hidden' && el.offsetHeight > 0)
      el.style.setProperty('visibility','visible','important');
  });
  await new Promise(r => setTimeout(r, 450));
  return 1;
})()"""

# 4) 2枚目以降のタイルでは、画面に貼り付いたまま動かないもの（fixed）だけ隠す。
#    ・sticky は content の一部なので消さない（消すと背景が抜けて白地に白文字になる）
#    ・画面の大半を覆う fixed は「背景レイヤー」なので残す
JS_HIDE_FIXED = """
(() => {
  const vw = innerWidth, vh = innerHeight, area = vw * vh;
  let n = 0;
  document.querySelectorAll('body *').forEach(el => {
    if (getComputedStyle(el).position !== 'fixed') return;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > area * 0.7) return;   // 背景レイヤーは残す
    el.style.setProperty('visibility','hidden','important');
    n++;
  });
  return n;
})()"""

JS_SCROLL_TO = "(y => { window.scrollTo(0, y); return window.scrollY })"


def diff_ratio(a: Image.Image, b: Image.Image) -> float:
    """2枚の違いの割合。小さいほど「止まっている」"""
    a = a.convert("L").resize((160, 100))
    b = b.convert("L").resize((160, 100))
    d = ImageChops.difference(a, b)
    hist = d.histogram()
    changed = sum(hist[24:])           # 24階調以上ずれた画素
    return changed / float(160 * 100)


class Shooter:
    def __init__(self, port, out, w, h, mobile, quality):
        self.port, self.out = port, out
        self.w, self.h, self.mobile, self.quality = w, h, mobile, quality

    async def shot_viewport(self, ws):
        r = await cdp(ws, "Page.captureScreenshot", {"format": "png"})
        return Image.open(io.BytesIO(base64.b64decode(r["data"]))).convert("RGB")

    async def wait_stable(self, ws):
        """同じ画面を2回撮って、違えばまだ動いている。落ち着くまで待つ"""
        prev = await self.shot_viewport(ws)
        for _ in range(STABLE_TRIES):
            await asyncio.sleep(STABLE_WAIT)
            cur = await self.shot_viewport(ws)
            if diff_ratio(prev, cur) <= STABLE_DIFF:
                return True
            prev = cur
        return False

    async def one(self, name, url):
        path = os.path.join(self.out, f"{name}.jpg")
        if os.path.exists(path):
            return f"SKIP {name}"
        t = http(self.port, "/json/new?about:blank")
        tid = t["id"]
        try:
            async with websockets.connect(t["webSocketDebuggerUrl"],
                                          max_size=300 * 1024 * 1024, open_timeout=20) as ws:
                await cdp(ws, "Page.enable")
                await cdp(ws, "Emulation.setDeviceMetricsOverride", {
                    "width": self.w, "height": self.h, "deviceScaleFactor": 1,
                    "mobile": self.mobile, "screenWidth": self.w, "screenHeight": self.h,
                })
                ua = ("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 "
                      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1") if self.mobile else \
                     ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
                      "(KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36")
                await cdp(ws, "Emulation.setUserAgentOverride", {"userAgent": ua})
                await cdp(ws, "Page.navigate", {"url": url})

                t0 = time.time()
                while time.time() - t0 < NAV_TIMEOUT:
                    try:
                        msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                    except asyncio.TimeoutError:
                        continue
                    if msg.get("method") == "Page.loadEventFired":
                        break

                await cdp(ws, "Runtime.evaluate", {"expression": JS_READY, "awaitPromise": True})
                await cdp(ws, "Runtime.evaluate", {"expression": JS_WAKE, "awaitPromise": True})
                await cdp(ws, "Runtime.evaluate", {"expression": JS_SETTLE, "awaitPromise": True})

                m = await cdp(ws, "Page.getLayoutMetrics")
                css = m.get("cssContentSize") or m.get("contentSize")
                full = min(int(css["height"]), MAX_H)
                # 1画面ぶんしか無い＝まだ描けていない可能性。一度だけ待って測り直す
                if full <= self.h + 8:
                    await asyncio.sleep(2.5)
                    await cdp(ws, "Runtime.evaluate", {"expression": JS_READY, "awaitPromise": True})
                    m = await cdp(ws, "Page.getLayoutMetrics")
                    css = m.get("cssContentSize") or m.get("contentSize")
                    full = min(int(css["height"]), MAX_H)
                calm = True

                # タイルを貼る（実際にスクロールするので、出てくる要素も写る）
                sheet = Image.new("RGB", (self.w, full), "white")
                y, first = 0, True
                while y < full:
                    await cdp(ws, "Runtime.evaluate",
                              {"expression": f"({JS_SCROLL_TO})({y})"})
                    await asyncio.sleep(.30 if first else .20)
                    if first:
                        calm = await self.wait_stable(ws)
                    tile = await self.shot_viewport(ws)
                    sheet.paste(tile, (0, y))
                    if first:
                        await cdp(ws, "Runtime.evaluate", {"expression": JS_HIDE_FIXED})
                        first = False
                    y += self.h
                # 最下端はスクロール上限で止まるので、実位置に貼り直す
                if full > self.h:
                    r = await cdp(ws, "Runtime.evaluate",
                                  {"expression": f"({JS_SCROLL_TO})({full})", "returnByValue": True})
                    ry = int(r.get("result", {}).get("value") or 0)
                    await asyncio.sleep(.3)
                    sheet.paste(await self.shot_viewport(ws), (0, min(ry, full - self.h)))

                sheet.save(path, quality=self.quality, optimize=True)
                kb = os.path.getsize(path) // 1024
                return f"{'OK  ' if calm else 'WARN'} {name}  {full}px  {kb}KB{'' if calm else '  (動きが残った)'}"
        finally:
            try:
                http(self.port, f"/json/close/{tid}")
            except Exception:
                pass


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list")
    ap.add_argument("--out", default=os.path.expanduser("~/design-library/_raw/pc"))
    ap.add_argument("--par", type=int, default=4)
    ap.add_argument("--port", type=int, default=9333)
    ap.add_argument("--sp", action="store_true", help="スマホ(390x844)で撮る")
    a = ap.parse_args()

    os.makedirs(a.out, exist_ok=True)
    rows = []
    for line in open(a.list, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        parts = line.split("\t")
        if len(parts) < 2:
            parts = line.split(None, 1)
        if len(parts) >= 2:
            rows.append((parts[0].strip(), parts[1].strip()))

    sh = Shooter(a.port, a.out, 390 if a.sp else 1440, 844 if a.sp else 900, a.sp, 82)
    sem = asyncio.Semaphore(a.par)
    done = [0]

    async def run(i, name, url):
        async with sem:
            try:
                msg = await asyncio.wait_for(sh.one(name, url), timeout=SITE_TIMEOUT)
            except Exception as e:
                msg = f"NG   {name}  {type(e).__name__}: {str(e)[:70]}"
            done[0] += 1
            print(f"[{done[0]}/{len(rows)}] {msg}", flush=True)

    await asyncio.gather(*(run(i, n, u) for i, (n, u) in enumerate(rows)))


if __name__ == "__main__":
    asyncio.run(main())
