#!/usr/bin/env python3
"""esl5 の検証。目で見る前に必ずこれを通す。

■ 過去にやらかした欠陥（全部ここで潰してある）
  ・スクショを見ずに数字だけで判断        → 必ず画像も保存して目で見る
  ・衝突のペアを測り忘れる                → 全ペア総当たり
  ・親子の重なりを衝突と誤検知            → 祖先-子孫は除外
  ・★<p>の箱で測って誤検知                → Range.getClientRects() で「文字の実体」を測る
                                            （ブロック要素の箱は列幅いっぱいに広がるので嘘になる）
  ・deviceScaleFactor=2 で撮って1倍のつもりで切る → 必ず1で撮る
  ・mobileフラグが残る                    → 毎回 clear してから設定
  ・★他のスクリプトと同じタブを取り合う   → 専用タブを開いて使い、最後に閉じる

使い方:  python3 check.py [ファイル名 ...]      既定は index / fv_a / fv_b
"""
import asyncio, json, base64, time, sys, os, urllib.request, io
import websockets
from PIL import Image

CDP = "http://127.0.0.1:9350"
ORIGIN = "http://localhost:8788/esl5"
OUT = os.path.dirname(os.path.abspath(__file__)) + "/_shot"
SIZES = ((1440, 900, "PC"), (1440, 720, "PC狭"), (1280, 800, "ノートPC"),
         (1160, 800, "小PC"), (1024, 768, "タブ"), (390, 844, "SP"))

PROBE = r"""(()=>{
  const de=document.documentElement, O={};
  /* ── 文字の実体を測る。ブロック要素の箱ではなく Range の矩形を使う ── */
  function inkRects(el){
    const r=document.createRange(); r.selectNodeContents(el);
    return [...r.getClientRects()].filter(b=>b.width>0.5&&b.height>0.5);
  }
  const TXT='h1,h2,h3,h4,p,a,li,span,figcaption';
  const texts=[];
  document.querySelectorAll(TXT).forEach(e=>{
    if(!e.offsetParent&&getComputedStyle(e).position!=='fixed')return;
    if(!e.textContent.trim())return;
    if([...e.children].some(c=>c.matches(TXT)))return;      /* 末端だけ */
    inkRects(e).forEach(b=>texts.push({n:'.'+(typeof e.className==='string'&&e.className?e.className.trim().split(/\s+/)[0]:e.tagName),b,e}));
  });
  /* 画像・装飾は箱で測ってよい */
  const boxes=[];
  document.querySelectorAll('img,.dc,.fv-circle,.square-img,.rate-circle').forEach(e=>{
    if(!e.offsetParent)return; if(getComputedStyle(e).display==='none')return;
    const b=e.getBoundingClientRect(); if(b.width<1)return;
    boxes.push({n:'.'+(typeof e.className==='string'&&e.className?e.className.trim().split(/\s+/)[0]:e.tagName),b,e});
  });
  const all=texts.concat(boxes);
  const isDecor=o=>o.e.classList.contains('dc');
  const isOpaque=o=>o.e.tagName==='IMG'||o.e.classList.contains('fv-circle')||o.e.classList.contains('square-img');
  const hits=[];
  for(let i=0;i<all.length;i++)for(let j=i+1;j<all.length;j++){
    const A=all[i],B=all[j];
    if(A.e===B.e||A.e.contains(B.e)||B.e.contains(A.e))continue;   /* 祖先-子孫は除外 */
    /* ★装飾 × 不透明な写真 は「意図した背面の重なり」。ここでは弾かず、下の覆われ率で見る */
    if((isDecor(A)&&isOpaque(B))||(isDecor(B)&&isOpaque(A)))continue;
    const w=Math.min(A.b.right,B.b.right)-Math.max(A.b.left,B.b.left);
    const h=Math.min(A.b.bottom,B.b.bottom)-Math.max(A.b.top,B.b.top);
    if(w>1&&h>1)hits.push(A.n+'×'+B.n+'='+Math.round(w*h));
  }
  O.collide=[...new Set(hits)];
  /* ★装飾が写真に飲まれて消えていないか。
     ★円(border-radius:50%)を四角い箱で測ると「100%覆われ」と嘘をつく。点を撒いて実形で判定する */
  /* ★丸くクリップされた親(.fv-circle)の中の<img>を別要素として四角で数えると
        「100%覆われ」と嘘をつく。親が既に対象なら子は飛ばす */
  const opaqueEls=boxes.filter(isOpaque);
  const opaques=opaqueEls
    .filter(P=>!opaqueEls.some(Q=>Q.e!==P.e&&Q.e.contains(P.e)))
    .map(P=>{
      const r=getComputedStyle(P.e).borderRadius;
      return {b:P.b,round:/%/.test(r)&&parseFloat(r)>=50};
    });
  function covered(x,y){
    return opaques.some(P=>{
      if(!P.round)return x>=P.b.left&&x<=P.b.right&&y>=P.b.top&&y<=P.b.bottom;
      const cx=(P.b.left+P.b.right)/2, cy=(P.b.top+P.b.bottom)/2;
      const rx=P.b.width/2, ry=P.b.height/2;
      return ((x-cx)/rx)**2+((y-cy)/ry)**2<=1;
    });
  }
  O.buried=[];
  boxes.filter(isDecor).forEach(D=>{
    let hit=0,tot=0;
    for(let i=0;i<12;i++)for(let j=0;j<12;j++){
      const x=D.b.left+D.b.width*(i+0.5)/12, y=D.b.top+D.b.height*(j+0.5)/12;
      tot++; if(covered(x,y))hit++;
    }
    const pct=Math.round(hit/tot*100);
    if(pct>60)O.buried.push(D.e.className.split(' ')[1]+':'+pct+'%覆われ');
  });
  O.hscroll=de.scrollWidth-de.clientWidth;
  O.overflow=[...new Set([...document.querySelectorAll('*')].map(e=>({e,r:e.getBoundingClientRect()}))
    .filter(o=>o.r.width>0&&(o.r.right>de.clientWidth+1||o.r.left<-1))
    .map(o=>o.e.tagName+'.'+(typeof o.e.className==='string'?o.e.className.trim().split(/\s+/)[0]:'')))].slice(0,5);
  const D=[...document.querySelectorAll('.dc')].filter(e=>e.offsetParent&&getComputedStyle(e).display!=='none');
  O.decor=D.length; O.decorSvg=D.filter(d=>d.querySelector('svg')).length;
  O.decorSizes=D.map(d=>d.className.split(' ')[1]+':'+Math.round(d.getBoundingClientRect().width));
  O.bodyBg=getComputedStyle(document.body).backgroundColor;
  return JSON.stringify(O);
})()"""


async def main(files):
    os.makedirs(OUT, exist_ok=True)
    req = urllib.request.Request(CDP + "/json/new?about:blank", method="PUT")
    page = json.load(urllib.request.urlopen(req)); tid = page["id"]
    bad = 0
    try:
        async with websockets.connect(page["webSocketDebuggerUrl"], max_size=None) as ws:
            n = [0]
            async def cdp(m, p=None, to=60):
                n[0] += 1; mid = n[0]
                await ws.send(json.dumps({"id": mid, "method": m, "params": p or {}}))
                end = time.time() + to
                while time.time() < end:
                    try: r = json.loads(await asyncio.wait_for(ws.recv(), timeout=to))
                    except asyncio.TimeoutError: return {}
                    if r.get("id") == mid: return r.get("result", {})
                return {}
            await cdp("Page.enable"); await cdp("Runtime.enable")
            for f in files:
                print("  ── %s" % f)
                for W, H, tag in SIZES:
                    await cdp("Emulation.clearDeviceMetricsOverride")     # ★毎回clear
                    await cdp("Emulation.setDeviceMetricsOverride",
                              {"width": W, "height": H, "deviceScaleFactor": 1, "mobile": W < 800})
                    await cdp("Page.navigate", {"url": "%s/%s.html?v=%d" % (ORIGIN, f, int(time.time()*1000))})
                    await asyncio.sleep(3.4)
                    r = await cdp("Runtime.evaluate", {"expression": PROBE, "returnByValue": True})
                    d = json.loads((r.get("result") or {}).get("value") or "{}")
                    ok = (not d.get("collide") and d.get("hscroll") == 0
                          and not d.get("overflow") and d.get("decor") == d.get("decorSvg")
                          and not d.get("buried"))
                    if not ok: bad += 1
                    print("     %-8s 装飾%d/SVG%d 衝突:%-26s 横スク:%2dpx はみ出し:%-14s %s" % (
                        tag, d.get("decor", 0), d.get("decorSvg", 0),
                        "なし" if not d.get("collide") else "★" + ",".join(d["collide"][:2]),
                        d.get("hscroll", 0),
                        "なし" if not d.get("overflow") else "★" + ",".join(d["overflow"][:2]),
                        "OK" if ok else "★NG"))
                    if d.get("buried"):
                        print("            埋没: %s" % ", ".join(d["buried"]))
                    if d.get("collide"):
                        for x in d["collide"][:6]: print("           ", x)
                    if tag in ("PC", "SP"):                              # ★必ず画像も残す
                        s = await cdp("Page.captureScreenshot", {"format": "png"})
                        Image.open(io.BytesIO(base64.b64decode(s["data"]))).convert("RGB") \
                             .save("%s/%s_%s.png" % (OUT, f, tag))
                    if tag == "PC" and d.get("decorSizes"):
                        print("           大きさ: %s / 地: %s" % (", ".join(d["decorSizes"]), d.get("bodyBg")))
            print("\n  ▶ NG %d件 / %d通り   スクショ: %s" % (bad, len(files) * len(SIZES), OUT))
    finally:
        try: urllib.request.urlopen(CDP + "/json/close/" + tid).read()
        except Exception: pass
    return bad


if __name__ == "__main__":
    fs = sys.argv[1:] or ["index", "fv_a", "fv_b"]
    sys.exit(1 if asyncio.run(main(fs)) else 0)
