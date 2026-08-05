# -*- coding: utf-8 -*-
"""参考サイトから「実際の数値」を採取する。

    python3 measure.py <list.tsv> [--out DIR] [--par 3] [--port 9333]

画像を見て「上辺を弧にする」と書くだけでは実装は決まらない。
弧の起伏が何px か、影が何px・不透明度何%か、ボタンの上の余白が何px か——
そこまで持って初めて再現できる。

ここでは実ページの getComputedStyle と getBoundingClientRect から次を採る:
  ・面（カード/パネル）ごとの 背景色・輝度L・角丸・境界線・影の実値・内側余白
  ・見出し/本文/ボタン の 級数・太さ・行間・字間・色・コントラスト比
  ・ボタンの 高さ・左右padding・角丸・影・【直前の要素との距離】
  ・隣り合うセクションの 背景色と輝度差
  ・要素間の縦の間隔（実測ヒストグラム）
"""
import asyncio, json, os, time, urllib.request, argparse
import websockets

NAV_TIMEOUT = 30
SITE_TIMEOUT = 110


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


JS_MEASURE = r"""
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 全体をひと通り流して、遅延表示を起こす
  const H = () => document.documentElement.scrollHeight;
  for (let y = 0; y < H(); y += Math.round(innerHeight * .6)) { scrollTo(0, y); await sleep(70); }
  scrollTo(0, 0); await sleep(300);

  // ── 色の道具 ───────────────────────────────
  const rgb = s => {
    const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/);
    return m ? { r:+m[1], g:+m[2], b:+m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lin = c => { c /= 255; return c <= .03928 ? c/12.92 : Math.pow((c+.055)/1.055, 2.4) };
  const lum = c => c ? .2126*lin(c.r) + .7152*lin(c.g) + .0722*lin(c.b) : null;
  const L   = c => c ? Math.round(.299*c.r + .587*c.g + .114*c.b) : null;  // 見た目の明るさ0-255
  const hex = c => c ? '#' + [c.r,c.g,c.b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('') : null;
  const ratio = (a,b) => { if(!a||!b) return null;
    const l1=lum(a), l2=lum(b); return Math.round(((Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05))*100)/100 };
  // 背景が transparent の要素は、祖先をたどって実際に見えている色を探す
  const bgOf = el => { let n = el;
    for (let i=0;i<12 && n;i++){ const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && c.a > .1) return c; n = n.parentElement; }
    return {r:255,g:255,b:255,a:1} };
  const px = v => Math.round(parseFloat(v) || 0);

  const vis = el => { const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 8 && r.height > 8 && cs.display !== 'none' && cs.visibility !== 'hidden'
           && parseFloat(cs.opacity) > .05 };

  const out = { url: location.href, w: innerWidth, pageH: H() };

  // ── 1. ボタン ─────────────────────────────
  const btns = [];
  document.querySelectorAll('a,button,[role="button"]').forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const bg = rgb(cs.backgroundColor);
    const looksBtn = (bg && bg.a > .5 && r.height >= 28 && r.width >= 70)
                  || (cs.borderTopWidth !== '0px' && r.height >= 32 && r.width >= 90);
    if (!looksBtn) return;
    // 直前の要素との縦の距離（「ボタンが箱のすぐ下」を測る）
    let gapAbove = null, prevTag = null;
    let p = el.parentElement, node = el;
    while (p && gapAbove === null) {
      let s = node.previousElementSibling;
      while (s && !vis(s)) s = s.previousElementSibling;
      if (s) { const sr = s.getBoundingClientRect();
        gapAbove = Math.round(r.top - sr.bottom); prevTag = s.tagName.toLowerCase(); break }
      node = p; p = p.parentElement;
    }
    btns.push({
      text: (el.innerText||'').replace(/\s+/g,' ').trim().slice(0,24),
      w: Math.round(r.width), h: Math.round(r.height),
      padX: px(cs.paddingLeft), radius: cs.borderRadius.split(' ')[0],
      bg: hex(bg), fg: hex(rgb(cs.color)),
      contrast: ratio(rgb(cs.color), bg),
      fs: px(cs.fontSize), fw: cs.fontWeight, ls: cs.letterSpacing,
      shadow: cs.boxShadow === 'none' ? null : cs.boxShadow.slice(0,80),
      border: cs.borderTopWidth === '0px' ? null : `${cs.borderTopWidth} ${cs.borderTopColor}`,
      gapAbove, prevTag,
    });
  });
  out.buttons = btns.slice(0, 24);

  // ── 2. 面（カード・パネル） ─────────────────
  const panels = [];
  document.querySelectorAll('section,article,div,li,figure').forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (r.width < 160 || r.height < 90 || r.width > innerWidth * 1.02) return;
    const own = rgb(cs.backgroundColor);
    const hasBg = own && own.a > .1;
    const hasBorder = cs.borderTopWidth !== '0px' || cs.borderLeftWidth !== '0px';
    const hasShadow = cs.boxShadow !== 'none';
    const hasRadius = px(cs.borderTopLeftRadius) > 0;
    if (!(hasBg || hasBorder || hasShadow || hasRadius)) return;
    const parentBg = el.parentElement ? bgOf(el.parentElement) : {r:255,g:255,b:255,a:1};
    panels.push({
      tag: el.tagName.toLowerCase(),
      w: Math.round(r.width), h: Math.round(r.height),
      bg: hasBg ? hex(own) : null, bgL: hasBg ? L(own) : null,
      parentBg: hex(parentBg), parentL: L(parentBg),
      dL: hasBg ? Math.abs(L(own) - L(parentBg)) : null,     // 親との輝度差
      radius: cs.borderRadius.replace(/px/g,'').slice(0,40),
      border: hasBorder ? `${px(cs.borderTopWidth)}px ${hex(rgb(cs.borderTopColor))}` : null,
      shadow: hasShadow ? cs.boxShadow.slice(0,90) : null,
      padT: px(cs.paddingTop), padX: px(cs.paddingLeft),
    });
  });
  // 同じ見た目の面は1つにまとめる
  const key = p => [p.bg,p.radius,p.border,p.shadow,p.padT,p.padX].join('|');
  const seen = {};
  panels.forEach(p => { const k = key(p); if (!seen[k]) seen[k] = {...p, n:0}; seen[k].n++ });
  out.panels = Object.values(seen).sort((a,b)=>b.n-a.n).slice(0, 18);

  // ── 3. 文字 ───────────────────────────────
  const texts = [];
  document.querySelectorAll('h1,h2,h3,h4,p,li,dd,dt,span').forEach(el => {
    if (!vis(el)) return;
    const t = (el.innerText||'').trim();
    if (t.length < 4 || el.children.length > 3) return;
    const cs = getComputedStyle(el);
    const bg = bgOf(el), fg = rgb(cs.color);
    texts.push({ tag: el.tagName.toLowerCase(),
      fs: px(cs.fontSize), fw: cs.fontWeight,
      lh: Math.round((parseFloat(cs.lineHeight)/parseFloat(cs.fontSize))*100)/100 || null,
      ls: cs.letterSpacing === 'normal' ? 0 : Math.round(parseFloat(cs.letterSpacing)*1000)/1000,
      color: hex(fg), contrast: ratio(fg, bg),
      chars: t.length });
  });
  const byTag = {};
  texts.forEach(t => { (byTag[t.tag] = byTag[t.tag] || []).push(t) });
  out.text = {};
  for (const [k, arr] of Object.entries(byTag)) {
    const s = [...arr].sort((a,b)=>b.fs-a.fs);
    const mid = s[Math.floor(s.length/2)];
    out.text[k] = { n: arr.length, maxFs: s[0].fs, medFs: mid.fs, medFw: mid.fw,
                    medLh: mid.lh, medLs: mid.ls,
                    minContrast: Math.min(...arr.map(x=>x.contrast||99)) };
  }

  // ── 4. セクションの地と、隣り合う輝度差 ──────
  const secs = [];
  document.querySelectorAll('body > *, body > * > section, main > section, main > div').forEach(el => {
    if (!vis(el)) return;
    const r = el.getBoundingClientRect();
    if (r.height < 200 || r.width < innerWidth * .8) return;
    const c = bgOf(el);
    secs.push({ top: Math.round(r.top + scrollY), h: Math.round(r.height), bg: hex(c), L: L(c) });
  });
  secs.sort((a,b)=>a.top-b.top);
  const steps = [];
  for (let i=1;i<secs.length;i++) steps.push(Math.abs(secs[i].L - secs[i-1].L));
  out.sections = { n: secs.length, list: secs.slice(0,24),
    stepMed: steps.length ? steps.sort((a,b)=>a-b)[Math.floor(steps.length/2)] : null,
    stepZero: steps.filter(s=>s<2).length };

  // ── 5. 縦の間隔（何px刻みで設計されているか） ──
  const gaps = [];
  document.querySelectorAll('section,div,article').forEach(el => {
    if (!vis(el)) return;
    const kids = [...el.children].filter(vis);
    for (let i=1;i<kids.length;i++){
      const a = kids[i-1].getBoundingClientRect(), b = kids[i].getBoundingClientRect();
      const g = Math.round(b.top - a.bottom);
      if (g > 0 && g < 400) gaps.push(g);
    }
  });
  const hist = {};
  gaps.forEach(g => { const k = Math.round(g/4)*4; hist[k] = (hist[k]||0)+1 });
  out.gaps = { n: gaps.length,
    top: Object.entries(hist).sort((a,b)=>b[1]-a[1]).slice(0,12).map(([k,v])=>({px:+k,n:v})) };

  return out;
})()"""


async def one(port, out_dir, name, url):
    path = os.path.join(out_dir, f"{name}.json")
    if os.path.exists(path):
        return f"SKIP {name}"
    t = await asyncio.to_thread(http, port, "/json/new?about:blank")
    tid = t["id"]
    try:
        async with websockets.connect(t["webSocketDebuggerUrl"], max_size=80 * 1024 * 1024,
                                      open_timeout=20) as ws:
            await cdp(ws, "Page.enable")
            await cdp(ws, "Emulation.setDeviceMetricsOverride",
                      {"width": 1440, "height": 900, "deviceScaleFactor": 1, "mobile": False})
            await cdp(ws, "Page.navigate", {"url": url})
            t0 = time.time()
            while time.time() - t0 < NAV_TIMEOUT:
                try:
                    msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=2))
                except asyncio.TimeoutError:
                    continue
                if msg.get("method") == "Page.loadEventFired":
                    break
            await asyncio.sleep(1.2)
            r = await cdp(ws, "Runtime.evaluate",
                          {"expression": JS_MEASURE, "awaitPromise": True, "returnByValue": True})
            d = (r.get("result") or {}).get("value")
            if not d:
                return f"NG   {name} 空"
            await asyncio.to_thread(
                lambda: open(path, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1)))
            b = d.get("buttons") or []
            gaps = [x["gapAbove"] for x in b if x.get("gapAbove") is not None]
            return (f"OK   {name}  面{len(d.get('panels') or [])}  ボタン{len(b)}  "
                    f"ボタン上の余白中央値={sorted(gaps)[len(gaps)//2] if gaps else '-'}  "
                    f"段差中央値={d.get('sections',{}).get('stepMed')}")
    finally:
        try:
            await asyncio.to_thread(http, port, f"/json/close/{tid}")
        except Exception:
            pass


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list")
    ap.add_argument("--out", default=os.path.expanduser("~/design-library/_raw/measure"))
    ap.add_argument("--par", type=int, default=3)
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
