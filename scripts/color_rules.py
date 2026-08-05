# -*- coding: utf-8 -*-
"""「色をどう使っているか」を、色が変わっても再現できる形で採る。

    python3 color_rules.py <list.tsv> [--out DIR] [--par 3] [--port 9333]

「#00B220 を使っている」では再現できない。必要なのは
  ・ブランド色がページ面積の何%を占めるか
  ・そのうち何%が「押せる場所」か
  ・地は何段あり、base から何段暗いか
  ・ブランド色から派生した淡色を何個持ち、base との差は何か
  ・彩度のある色は何種類か
——という【比と役割】。これなら色が変わっても同じ設計を再現できる。
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


JS = r"""
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const H = () => document.documentElement.scrollHeight;
  for (let y = 0; y < H(); y += Math.round(innerHeight * .6)) { scrollTo(0, y); await sleep(70); }
  scrollTo(0, 0); await sleep(300);

  const parse = s => { const m = String(s).match(/rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?/);
    return m ? {r:+m[1],g:+m[2],b:+m[3],a:m[4]===undefined?1:+m[4]} : null };
  const L   = c => Math.round(.299*c.r + .587*c.g + .114*c.b);
  const hex = c => '#'+[c.r,c.g,c.b].map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
  // HSL：彩度と色相を出して「無彩色／有彩色」を分ける
  const hsl = c => { const r=c.r/255,g=c.g/255,b=c.b/255;
    const mx=Math.max(r,g,b), mn=Math.min(r,g,b), d=mx-mn, l=(mx+mn)/2;
    let h=0,s=0;
    if(d){ s = l>.5 ? d/(2-mx-mn) : d/(mx+mn);
      h = mx===r ? ((g-b)/d + (g<b?6:0)) : mx===g ? ((b-r)/d+2) : ((r-g)/d+4); h*=60 }
    return {h:Math.round(h), s:Math.round(s*100), l:Math.round(l*100)} };
  const vis = el => { const r=el.getBoundingClientRect(), cs=getComputedStyle(el);
    return r.width>4 && r.height>4 && cs.display!=='none' && cs.visibility!=='hidden'
           && parseFloat(cs.opacity)>.05 };

  // ── 1. 塗られている色を面積で集計（親に隠れる分は差し引かない粗い近似）──
  const area = {};        // hex -> px^2
  const roles = {};       // hex -> {cta,bg,text,border,icon}
  const bump = (h, k, v) => { area[h]=(area[h]||0)+v;
    roles[h]=roles[h]||{cta:0,bg:0,text:0,border:0,icon:0}; roles[h][k]+=v };

  document.querySelectorAll('body *').forEach(el => {
    if (!vis(el)) return;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const a = Math.round(r.width * r.height);
    if (a < 40) return;
    const bg = parse(cs.backgroundColor);
    if (bg && bg.a > .5) {
      const clickable = el.matches('a,button,[role="button"]') ||
                        !!el.closest('a,button,[role="button"]');
      bump(hex(bg), clickable && r.height < 120 && r.width < 640 ? 'cta' : 'bg', a);
    }
    const bw = parseFloat(cs.borderTopWidth)||0;
    if (bw > 0) { const bc = parse(cs.borderTopColor);
      if (bc && bc.a > .3) bump(hex(bc), 'border', Math.round((r.width+r.height)*2*bw)) }
    // svg のアイコン
    if (el.tagName.toLowerCase()==='svg') { const f=parse(cs.fill||cs.color);
      if (f && f.a>.3) bump(hex(f),'icon',a) }
    // 文字：字数×級数で面積を近似
    const t=(el.childNodes.length && [...el.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()))
            ? el.innerText.trim() : '';
    if (t) { const fg=parse(cs.color);
      if (fg && fg.a>.3) bump(hex(fg),'text', Math.round(Math.min(t.length,200)*parseFloat(cs.fontSize)*.55)) }
  });

  const total = Object.values(area).reduce((a,b)=>a+b,0) || 1;
  const list = Object.entries(area).map(([h,v]) => {
    const c = parse('rgb('+[1,3,5].map(i=>parseInt(h.slice(i,i+2),16)).join(',')+')');
    return { hex:h, pct: Math.round(v/total*1000)/10, ...hsl(c), L:L(c), roles:roles[h] };
  }).sort((a,b)=>b.pct-a.pct);

  // ── 2. 無彩色（地・文字）と有彩色（ブランド・差し色）に分ける ──
  const chromatic = list.filter(x => x.s >= 18 && x.l >= 8 && x.l <= 92);
  const neutral   = list.filter(x => x.s <  18 || x.l < 8 || x.l > 92);

  // 地：bg 用途で面積の大きい無彩色＋淡色
  const grounds = list.filter(x => x.roles.bg > x.roles.text && x.pct >= .5)
                      .sort((a,b)=>b.pct-a.pct).slice(0,8);
  const baseL = grounds.length ? grounds[0].L : 255;

  // ブランド色：有彩色のうち、CTAに使われている面積が最大のもの
  const byCta = [...chromatic].sort((a,b)=>b.roles.cta - a.roles.cta);
  const brand = (byCta[0] && byCta[0].roles.cta > 0) ? byCta[0]
              : (chromatic.sort((a,b)=>b.pct-a.pct)[0] || null);

  // ブランド色と同系（色相±25度）の色＝派生の濃淡
  const fam = brand ? list.filter(x => x.s >= 6 &&
      (Math.abs(((x.h - brand.h + 540) % 360) - 180) > 155)) : [];
  const famSorted = fam.sort((a,b)=>b.pct-a.pct);

  // 差し色：ブランドと色相が離れた有彩色
  const accents = brand ? chromatic.filter(x =>
      Math.abs(((x.h - brand.h + 540) % 360) - 180) <= 155 && x.pct >= .1) : [];

  const sum = arr => Math.round(arr.reduce((a,b)=>a+b.pct,0)*10)/10;
  const brandAll = famSorted;
  const brandCtaArea = brandAll.reduce((a,b)=>a+b.roles.cta,0);
  const brandBgArea  = brandAll.reduce((a,b)=>a+b.roles.bg,0);
  const brandTxtArea = brandAll.reduce((a,b)=>a+b.roles.text,0);
  const bTot = brandCtaArea + brandBgArea + brandTxtArea || 1;

  return {
    url: location.href,
    top: list.slice(0, 14),
    baseL,
    grounds: grounds.map(g => ({hex:g.hex, L:g.L, s:g.s, pct:g.pct, dFromBase: baseL - g.L})),
    groundSteps: grounds.length,
    darkGroundPct: sum(grounds.filter(g=>g.L<120)),
    brand: brand ? {hex:brand.hex, h:brand.h, s:brand.s, l:brand.l, L:brand.L, pct:brand.pct} : null,
    brandFamilyCount: brandAll.length,
    brandFamily: brandAll.slice(0,8).map(x=>({hex:x.hex,L:x.L,s:x.s,pct:x.pct,dFromBase:baseL-x.L})),
    brandTotalPct: sum(brandAll),
    brandRoleMix: { cta: Math.round(brandCtaArea/bTot*100),
                    bg:  Math.round(brandBgArea /bTot*100),
                    text:Math.round(brandTxtArea/bTot*100) },
    accentCount: accents.length,
    accentTotalPct: sum(accents),
    accents: accents.slice(0,4).map(x=>({hex:x.hex,h:x.h,s:x.s,pct:x.pct})),
    chromaticTotalPct: sum(chromatic),
    neutralTotalPct: sum(neutral),
  };
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
                          {"expression": JS, "awaitPromise": True, "returnByValue": True})
            d = (r.get("result") or {}).get("value")
            if not d:
                return f"NG   {name} 空"
            await asyncio.to_thread(
                lambda: open(path, "w", encoding="utf-8").write(json.dumps(d, ensure_ascii=False, indent=1)))
            b = d.get("brand") or {}
            return (f"OK   {name}  地{d.get('groundSteps')}段 baseL={d.get('baseL')}  "
                    f"ブランド{b.get('hex','-')} {d.get('brandTotalPct')}%  "
                    f"用途[CTA{d['brandRoleMix']['cta']}/面{d['brandRoleMix']['bg']}/字{d['brandRoleMix']['text']}]  "
                    f"差し色{d.get('accentCount')}種")
    finally:
        try:
            await asyncio.to_thread(http, port, f"/json/close/{tid}")
        except Exception:
            pass


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("list")
    ap.add_argument("--out", default=os.path.expanduser("~/design-library/_raw/color"))
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
