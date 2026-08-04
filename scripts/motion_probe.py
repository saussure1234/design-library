# -*- coding: utf-8 -*-
"""サイトから「挙動」を採取する。

    python3 motion_probe.py <list.tsv> [--out DIR] [--par 4] [--port 9333]

静止画のスクショからは動きが取れない。しかし
「スクロールすると加速する」「右から左へ永遠スライドする」のような
挙動の言語化こそが、実装を一意に決める最短の指示になる。

ここでは実ページから次を採取する:
  ・使っているアニメーション系ライブラリ
  ・@keyframes の中身（何がどこからどこへ動くか）
  ・transform / opacity に transition を持つ要素の数・時間・イージング
  ・スクロールで固定される区間（sticky / 背景固定）
  ・無限ループしているもの（マーキー等）
  ・スクロール連動の有無（IntersectionObserver / scroll ハンドラ）
  ・実測：上・中・下へスクロールしたときに、どの要素がどれだけ動いたか
"""
import asyncio, json, os, sys, time, urllib.request, argparse
import websockets

NAV_TIMEOUT = 25
SITE_TIMEOUT = 90


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


JS_PROBE = r"""
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {};

  // ── 1. ライブラリの検出 ───────────────────────────
  const libs = [];
  const w = window;
  if (w.gsap || w.TweenMax) libs.push('GSAP');
  if (w.ScrollTrigger || (w.gsap && w.gsap.plugins && w.gsap.plugins.scrollTrigger)) libs.push('ScrollTrigger');
  if (w.Lenis || w.lenis) libs.push('Lenis');
  if (w.LocomotiveScroll) libs.push('Locomotive');
  if (w.AOS) libs.push('AOS');
  if (w.Swiper) libs.push('Swiper');
  if (w.Splide) libs.push('Splide');
  if (w.barba) libs.push('Barba');
  if (w.SplitType || w.SplitText) libs.push('SplitText');
  if (document.querySelector('[data-framer-name]')) libs.push('Framer');
  if (document.querySelector('script[src*="three"]') || w.THREE) libs.push('Three.js');
  for (const s of document.scripts) {
    const u = (s.src || '').toLowerCase();
    if (u.includes('gsap') && !libs.includes('GSAP')) libs.push('GSAP');
    if (u.includes('lenis') && !libs.includes('Lenis')) libs.push('Lenis');
    if (u.includes('swiper') && !libs.includes('Swiper')) libs.push('Swiper');
    if (u.includes('aos') && !libs.includes('AOS')) libs.push('AOS');
    if (u.includes('lottie')) libs.push('Lottie');
    if (u.includes('rellax')) libs.push('Rellax');
    if (u.includes('scrollreveal')) libs.push('ScrollReveal');
  }
  out.libs = [...new Set(libs)];

  // ── 2. @keyframes を読む ─────────────────────────
  const kf = [];
  for (const ss of document.styleSheets) {
    let rules;
    try { rules = ss.cssRules } catch (e) { continue }   // 別オリジンは読めない
    if (!rules) continue;
    for (const r of rules) {
      if (r.type !== CSSRule.KEYFRAMES_RULE) continue;
      const steps = [];
      for (const k of r.cssRules) {
        const s = k.style;
        const bits = [];
        for (const p of ['transform', 'opacity', 'clip-path', 'filter', 'width', 'stroke-dashoffset']) {
          const v = s.getPropertyValue(p);
          if (v) bits.push(p + ':' + v.trim());
        }
        if (bits.length) steps.push(k.keyText + ' { ' + bits.join('; ') + ' }');
      }
      if (steps.length) kf.push({ name: r.name, steps: steps.slice(0, 6) });
      if (kf.length >= 24) break;
    }
    if (kf.length >= 24) break;
  }
  out.keyframes = kf;

  // ── 3. transition を持つ要素を集計 ────────────────
  const trans = {};
  const all = [...document.querySelectorAll('body *')].slice(0, 4000);
  const infinite = [];
  const sticky = [];
  for (const el of all) {
    const cs = getComputedStyle(el);
    const tp = cs.transitionProperty;
    if (tp && tp !== 'none' && tp !== 'all' &&
        (tp.includes('transform') || tp.includes('opacity') || tp.includes('clip-path'))) {
      const k = tp + ' | ' + cs.transitionDuration + ' | ' + cs.transitionTimingFunction;
      trans[k] = (trans[k] || 0) + 1;
    }
    if (cs.animationIterationCount === 'infinite' && cs.animationName !== 'none') {
      infinite.push({
        name: cs.animationName, dur: cs.animationDuration,
        timing: cs.animationTimingFunction,
        w: Math.round(el.getBoundingClientRect().width),
      });
    }
    if (cs.position === 'sticky') {
      const r = el.getBoundingClientRect();
      if (r.height > 80) sticky.push({ top: cs.top, h: Math.round(r.height), tag: el.tagName.toLowerCase() });
    }
    if (cs.backgroundAttachment === 'fixed') {
      out.bgFixed = (out.bgFixed || 0) + 1;
    }
  }
  out.transitions = Object.entries(trans).sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([k, n]) => ({ spec: k, count: n }));
  out.infinite = infinite.slice(0, 8);
  out.sticky = sticky.slice(0, 8);

  // ── 4. スクロール連動の有無 ───────────────────────
  out.hasIO = typeof IntersectionObserver === 'function' &&
              !!document.querySelector('[class*="inview"],[class*="in-view"],[class*="is-show"],[class*="is-visible"],[class*="reveal"],[data-aos],[class*="fadein"],[class*="fade-in"]');
  out.revealClassSample = [...new Set([...document.querySelectorAll(
      '[class*="inview"],[class*="in-view"],[class*="is-show"],[class*="is-visible"],[class*="reveal"],[data-aos],[class*="fadein"]')]
      .slice(0, 40).flatMap(e => [...e.classList]).filter(c => /inview|in-view|is-show|is-visible|reveal|fade/i.test(c)))].slice(0, 8);

  // ── 5. 実測：スクロールで何がどれだけ動いたか ──────
  // 画面内の大きめの要素に印を付け、上→中→下で位置を測って差を取る
  const marks = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 200 && r.height > 120;
  }).slice(0, 120);
  const snap = () => marks.map(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { y: r.top + scrollY, x: r.left, o: parseFloat(cs.opacity), t: cs.transform };
  });
  window.scrollTo(0, 0); await sleep(500);
  const a = snap();
  const H = document.documentElement.scrollHeight;
  window.scrollTo(0, Math.round(H * 0.35)); await sleep(700);
  const b = snap();

  let parallax = 0, revealed = 0, transformed = 0;
  const delta = Math.round(H * 0.35);
  for (let i = 0; i < marks.length; i++) {
    if (!a[i] || !b[i]) continue;
    // ページ内絶対位置がスクロール量に対してずれる＝視差
    const shift = Math.abs((b[i].y - a[i].y));
    if (shift > 12 && shift < delta * 0.9) parallax++;
    if (a[i].o < 0.9 && b[i].o > 0.95) revealed++;
    if (a[i].t !== b[i].t && b[i].t !== 'none') transformed++;
  }
  out.measured = { sampled: marks.length, parallax, revealed, transformed, scrolledBy: delta };
  window.scrollTo(0, 0);
  return out;
})()"""


async def one(port, out_dir, name, url):
    path = os.path.join(out_dir, f"{name}.json")
    if os.path.exists(path):
        return f"SKIP {name}"
    t = await asyncio.to_thread(http, port, "/json/new?about:blank")
    tid = t["id"]
    try:
        async with websockets.connect(t["webSocketDebuggerUrl"], max_size=60 * 1024 * 1024,
                                      open_timeout=20) as ws:
            await cdp(ws, "Page.enable")
            await cdp(ws, "Emulation.setDeviceMetricsOverride", {
                "width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
            await cdp(ws, "Page.navigate", {"url": url})
            t0 = time.time()
            while time.time() - t0 < NAV_TIMEOUT:
                try:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                except asyncio.TimeoutError:
                    continue
                if msg.get("method") == "Page.loadEventFired":
                    break
            await asyncio.sleep(1.4)
            r = await cdp(ws, "Runtime.evaluate",
                          {"expression": JS_PROBE, "awaitPromise": True, "returnByValue": True})
            data = (r.get("result") or {}).get("value")
            if not data:
                return f"NG   {name}  空"
            data["_url"] = url
            await asyncio.to_thread(
                lambda: open(path, "w", encoding="utf-8").write(
                    json.dumps(data, ensure_ascii=False, indent=1)))
            m = data.get("measured", {})
            return (f"OK   {name}  libs={','.join(data.get('libs') or []) or '-'}  "
                    f"kf={len(data.get('keyframes') or [])}  sticky={len(data.get('sticky') or [])}  "
                    f"視差={m.get('parallax')}  出現={m.get('revealed')}")
    finally:
        try:
            await asyncio.to_thread(http, port, f"/json/close/{tid}")
        except Exception:
            pass


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list")
    ap.add_argument("--out", default=os.path.expanduser("~/design-library/_raw/motion"))
    ap.add_argument("--par", type=int, default=4)
    ap.add_argument("--port", type=int, default=9333)
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)

    rows = []
    for line in open(a.list, encoding="utf-8"):
        p = line.rstrip("\n").split("\t")
        if len(p) >= 2:
            rows.append((p[0].strip(), p[1].strip()))

    sem = asyncio.Semaphore(a.par)
    done = [0]

    async def run(n, u):
        async with sem:
            try:
                msg = await asyncio.wait_for(one(a.port, a.out, n, u), timeout=SITE_TIMEOUT)
            except Exception as e:
                msg = f"NG   {n}  {type(e).__name__}"
            done[0] += 1
            print(f"[{done[0]}/{len(rows)}] {msg}", flush=True)

    await asyncio.gather(*(run(n, u) for n, u in rows))


if __name__ == "__main__":
    asyncio.run(main())
