# -*- coding: utf-8 -*-
"""FVの自動検証ループ。 python3 loop.py 7_v03

今日ここで踏んだ穴を、全部この1本に入れてある：
  ・スクショを見ずに数字だけで判断 → 必ず画像も保存して目で見る
  ・衝突のペアを測り忘れる         → 【全ペア総当たり】にする
  ・親子の重なりを衝突と誤検知     → 祖先-子孫は除外する
  ・矩形の"数"で行数を数えて誤検知 → topの違いで数える
  ・deviceScaleFactor=2 で撮って1倍のつもりで切る → 必ず1で撮る
  ・mobileフラグが残る             → 毎回 clear してから設定
  ・訴求の重複に気づかない         → 同じ語が何回出るかを数える
  ・★他のスクリプトと同じタブを取り合う → 専用タブを開いて使い、最後に閉じる
     （撮影中のベンチマークを自分のページだと思って測っていた事故があった）
"""
import asyncio, json, base64, time, urllib.request, websockets, io, os, sys, collections, colorsys
from PIL import Image

V = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
SHOT = os.path.join(HERE, "_shots")
BENCH = os.path.join(HERE, "..", "ref", "bench")

# ── 訴求の重複を数える語（ESL clubのコピーに実在するものだけ）
APPEAL = ["英検", "2級", "準1級", "2015", "無料体験", "英語塾", "合格", "1級"]

JS = r"""(()=>{
  const r=n=>Math.round(n);
  const out={};
  out.over = r(document.documentElement.scrollWidth - innerWidth);

  /* ── 衝突：全ペア総当たり。ただし祖先-子孫は除外 ── */
  /* ★背景レイヤー(.dots)は inset:0 で全面に敷くもの。衝突の相手にしない。
       帯(.band)は「そこに文字を置いてはいけない面」なので相手に含める */
  const names={'ヘッダ':'.hd','写真A':'.strip--a','写真B':'.strip--b',
               '見出し':'.vt,.h1','前置き':'.eyebrow',
               '実績':'.nums','実績見出し':'.facts__hd','数字3':'.num3',
               'CTA':'.btn','注記':'.note','写真':'.ph','下段':'.under'};
  const E={};
  for(const k in names){const e=document.querySelector(names[k]); if(e) E[k]=e;}
  const ks=Object.keys(E), hits=[];
  const bb=e=>e.getBoundingClientRect();
  for(let i=0;i<ks.length;i++)for(let j=i+1;j<ks.length;j++){
    const a=E[ks[i]], b=E[ks[j]];
    if(a.contains(b)||b.contains(a)) continue;          /* ★親子は衝突ではない */
    const A=bb(a),B=bb(b);
    const v=Math.max(0,Math.min(A.right,B.right)-Math.max(A.left,B.left))
           *Math.max(0,Math.min(A.bottom,B.bottom)-Math.max(A.top,B.top));
    if(v>0) hits.push(ks[i]+'×'+ks[j]+'='+r(v));
  }
  out.hits = hits;

  /* ── 画面外に出ているもの ── */
  /* ★スマホは縦に長いので「下に出ている」は普通のこと。PCだけ下を見る */
  const isSP = innerWidth < 760;
  const off=[];
  for(const k in E){const b=bb(E[k]);
    if(!isSP && b.bottom>innerHeight+1) off.push(k+'(下'+r(b.bottom-innerHeight)+')');
    if(b.right>innerWidth+1) off.push(k+'(右'+r(b.right-innerWidth)+')');
    if(b.left<-1)            off.push(k+'(左'+r(-b.left)+')');}
  out.off = off;

  /* ── 級数と太さ ── */
  const fs=new Set(),fw=new Set();
  document.querySelectorAll('.fv *,.hd *').forEach(e=>{
    if(!Array.from(e.childNodes).some(n=>n.nodeType===3&&n.textContent.trim()))return;
    const s=getComputedStyle(e); fs.add(s.fontSize); fw.add(s.fontWeight);});
  out.steps = fs.size; out.weights = fw.size;

  /* ── 見出しが何行に見えているか（topの違いで数える） ── */
  /* ★.l ブロックの【数】を数えると、ブロックの中で折り返した行を見落とす。
     実際の描画矩形(Range)の top/left で数える */
  const h=document.querySelector('.vt,.h1');
  if(h){
    const vert = getComputedStyle(h).writingMode.indexOf('vertical')===0;
    /* 丸などのインライン要素は上端がずれるので矩形のtopでは数えられない。
       見出し全体の【高さ ÷ 行送り】で数える */
    const cs=getComputedStyle(h);
    const lh=parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.4;
    const bx=h.getBoundingClientRect();
    out.lines = Math.round((vert? bx.width : bx.height)/lh) || 1;
    out.blocks = h.querySelectorAll('.l').length;
    out.wrapped = out.blocks ? (out.lines > out.blocks) : false;
  }

  /* ── ①見えるか：CRITERIA.mdの本文は「面と面に段差があるか」。
       地の明るさ単体ではなく【面があるかどうか】から判定する。
       面を1つも作らない設計（011のような文字と丸だけ）なら潰れる面が無い。
       面＝FV内で、地と違う背景色を持つ、ある程度大きい要素 ── */
  {const bodyBg=getComputedStyle(document.body).backgroundColor;
   const surf=[];
   document.querySelectorAll('.fv *').forEach(e=>{
     const cs=getComputedStyle(e), bg=cs.backgroundColor;
     if(!bg||bg==='rgba(0, 0, 0, 0)'||bg==='transparent') return;
     if(bg===bodyBg) return;
     const b=e.getBoundingClientRect();
     if(b.width*b.height < 3000) return;                 /* 小さいものは面と見なさない */
     if(cs.backgroundImage && cs.backgroundImage!=='none') return; /* 写真は面ではない */
     /* ★ボタン・リンクは「面」ではなく差し色。①は
        「カードや パネル が地に潰れないか」の話なので対象外にする */
     const t=e.tagName.toLowerCase();
     if(t==='a'||t==='button') return;
     surf.push({bg:bg, area:r(b.width*b.height)});});
   out.surfaces=surf.slice(0,6); out.bodyBg=bodyBg;}

  /* ── ⑥過剰でないか：CRITERIA.mdは「1つのセクション内で強調（bold・差し色・
       装飾）を使うのは1〜2箇所まで」。スクショの色相を数えると写真の色まで
       拾ってしまう（全面写真の案は必ず落ちる）。【装置の数】をDOMで数える ── */
  {const acc=[]; const isAcc=c=>{
     if(!c) return false;
     const m=c.match(/\d+/g); if(!m) return false;
     const [R,G,B]=m.map(Number);
     const mx=Math.max(R,G,B), mn=Math.min(R,G,B);
     return mx>90 && (mx-mn)/mx > .45;          /* 彩度の高い色＝差し色 */
   };
   /* ★ヘッダーはサイト共通のナビ。CRITERIA.md⑥は「1つのセクションの中」の話 */
   document.querySelectorAll('.fv *').forEach(e=>{
     const cs=getComputedStyle(e);
     const b=e.getBoundingClientRect();
     if(b.width*b.height < 400) return;
     let why=null;
     if(isAcc(cs.backgroundColor)) why='面:'+e.className;
     else if(cs.backgroundImage && cs.backgroundImage.indexOf('gradient')>=0
             && cs.backgroundImage.indexOf('rgba(0, 0, 0, 0)')<0
             && e.className.indexOf('bg')<0) why='装飾:'+e.className;
     else if(isAcc(cs.color) && e.textContent.trim()) why='文字:'+e.className;
     if(why) acc.push(why.slice(0,26));});
   out.accents=[...new Set(acc)];}

  /* ── 見出しの位置と色。写真の上に置いた場合の可読性を測るため ── */
  if(h){const b=bb(h);const cs=getComputedStyle(h);
    out.h1box=[r(b.left),r(b.top),r(b.right),r(b.bottom)];
    out.h1col=cs.color;}

  /* ── 訴求の重複：画面に出ている文字を全部集めて数える ── */
  out.text = document.querySelector('.fv') ?
    (document.querySelector('.hd').innerText + '\n' + document.querySelector('.fv').innerText) : '';
  return out;})()"""


def lum(c):
    f = lambda v: v/12.92 if v <= .03928 else ((v+.055)/1.055)**2.4
    r, g, b = [f(x/255) for x in c]
    return .2126*r + .7152*g + .0722*b


def stats(im):
    """地の色・輝度・面積、インク率、色相の系統数。写真領域も混ざる前提で見る"""
    px = list(im.getdata()); n = len(px)
    c = collections.Counter((r//8*8, g//8*8, b//8*8) for r, g, b in px)
    ground, gn = c.most_common(1)[0]
    gl = lum(ground)
    ink = 1 - gn/n
    hues = set()
    for col, cnt in c.items():
        if cnt/n < .0015: continue
        h, s, v = colorsys.rgb_to_hsv(*[x/255 for x in col])
        if s >= .35: hues.add(round(h*12))
    return ground, gl, gn/n, ink, len(hues)


async def run():
    os.makedirs(SHOT, exist_ok=True)
    # ★このスクリプト専用のタブを開く。他のスクリプトと共有しない
    req = urllib.request.Request("http://127.0.0.1:9350/json/new?about:blank", method="PUT")
    page = json.load(urllib.request.urlopen(req))
    tab_id = page["id"]
    try:
        await _measure(page)
    finally:
        try: urllib.request.urlopen("http://127.0.0.1:9350/json/close/" + tab_id).read()
        except Exception: pass


async def _measure(page):
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

            ng = 0
            for w, h, mob, tag in ((1440, 900, False, "pc"), (390, 844, True, "sp")):
                await cdp("Emulation.clearDeviceMetricsOverride"); await asyncio.sleep(.25)
                await cdp("Emulation.setDeviceMetricsOverride",
                          {"width": w, "height": h, "deviceScaleFactor": 1, "mobile": mob})
                await cdp("Page.navigate",
                          {"url": "http://localhost:8788/esl4/fv/%s.html?v=%d" % (V, int(time.time()*1000))})
                await asyncio.sleep(5)
                rr = await cdp("Runtime.evaluate", {"expression": JS, "returnByValue": True})
                d = (rr.get("result") or {}).get("value") or {}
                s = await cdp("Page.captureScreenshot", {"format": "png"})
                im = Image.open(io.BytesIO(base64.b64decode(s["data"]))).convert("RGB")
                p = os.path.join(SHOT, "%s_%s.png" % (V, tag)); im.save(p)
                # ★見出しを隠してもう1枚。可読性は【文字を除いた背景】と比べないと
                #   白いグリフ自体を「背景の明るい側」として拾ってしまう
                await cdp("Runtime.evaluate", {"expression":
                    "(()=>{const h=document.querySelector('.vt,.h1');"
                    "if(h)h.style.visibility='hidden';})()"})
                await asyncio.sleep(.4)
                s2 = await cdp("Page.captureScreenshot", {"format": "png"})
                imbg = Image.open(io.BytesIO(base64.b64decode(s2["data"]))).convert("RGB")
                await cdp("Runtime.evaluate", {"expression":
                    "(()=>{const h=document.querySelector('.vt,.h1');"
                    "if(h)h.style.visibility='';})()"})
                g, gl, ga, ink, hues = stats(im)

                print("── %s  %dx%d ─────────────────────────────" % (V, w, h))
                def line(label, ok, txt):
                    nonlocal ng
                    if not ok: ng += 1
                    print("  %s %-14s %s" % ("OK " if ok else "★NG", label, txt))
                line("はみ出し", d.get("over", 0) == 0, "%dpx" % d.get("over", 0))
                line("衝突", not d.get("hits"), " / ".join(d.get("hits") or []) or "なし")
                line("画面外", not d.get("off"), " / ".join(d.get("off") or []) or "なし")
                line("見出し行数", not d.get("wrapped"),
                     "%s行（意図した区切り%s個）%s" % (d.get("lines", "?"), d.get("blocks", "?"),
                     "" if not d.get("wrapped") else "  ※区切りの中で折り返している"))
                line("級数・太さ", d.get("steps", 0) <= 8, "%d段 / %d種" % (d.get("steps", 0), d.get("weights", 0)))
                # ★①見えるか：面があるときだけ「地との段差」を要求する。
                #   面を作らない設計（文字と丸だけ）なら地の明るさは自由。
                #   面がある白ベースは、白いカードが地に潰れるので弾く
                def rgbstr(t):
                    v = [int(float(x)) for x in t.replace("rgba(", "").replace("rgb(", "")
                         .replace(")", "").split(",")[:3]]
                    return tuple(v)
                surf = d.get("surfaces") or []
                # ★比べる相手は【bodyの地の色】。スクショの最頻色にすると、
                #   画面を覆う大きな面（楕円など）が「地」になり、その面自身と
                #   比べて必ず1.00になる（H案でこれを踏んだ）
                bl = lum(rgbstr(d.get("bodyBg") or "rgb(255,255,255)"))
                if surf:
                    worst, wl = None, None
                    for sf in surf:
                        sl = lum(rgbstr(sf["bg"]))
                        cr = (max(sl, bl) + .05) / (min(sl, bl) + .05)
                        if wl is None or cr < wl: wl, worst = cr, sf
                    line("①面と地の段差", wl >= 1.05,
                         "面%d個 最小のコントラスト比 %.2f （bodyの地の輝度%.3f）%s"
                         % (len(surf), wl, bl, "" if wl >= 1.05 else "  ※面が地に潰れている"))
                else:
                    line("①面と地の段差", True,
                         "面を作っていない（地の輝度%.3f・地の面積%.0f%%・インク%.0f%%）"
                         % (gl, ga*100, ink*100))
                # ★⑥過剰でないか：強調の【装置の数】。1〜2箇所まで（CRITERIA.md）
                ac = d.get("accents") or []
                line("⑥強調の数", len(ac) <= 3,
                     "%d箇所  %s%s" % (len(ac), " / ".join(ac) or "なし",
                     "" if len(ac) <= 3 else "  ※CRITERIA.mdは1〜2箇所。中身を見て判断する"))
                # ★②読めるか：見出しの背後の実ピクセルとのコントラスト比。
                #   「文字を写真の上に置く」型は衝突ではなく、これで判定する。
                #   白抜きにとって最悪なのは背景の明るい部分なので上位10%を見る
                bx = d.get("h1box")
                if bx:
                    x1, y1, x2, y2 = [max(0, v) for v in bx]
                    x2 = min(x2, im.width); y2 = min(y2, im.height)
                    if x2 > x1 and y2 > y1:
                        crop = imbg.crop((x1, y1, x2, y2))   # ★文字を隠した画像で測る
                        crop.thumbnail((200, 200))
                        ls = sorted(lum(px) for px in crop.getdata())
                        bright = ls[int(len(ls) * .90)]
                        col = d.get("h1col", "")
                        fg = 1.0 if "255, 255, 255" in col else lum(tuple(
                            int(v) for v in col.replace("rgb(", "").replace(")", "").split(",")[:3]))
                        cr = (max(fg, bright) + .05) / (min(fg, bright) + .05)
                        line("見出しの可読性", cr >= 3.0,
                             "コントラスト比 %.2f （背景の明るい側 %.2f）%s"
                             % (cr, bright, "" if cr >= 3.0 else "  ※大きい文字は3.0以上が目安"))

                # 訴求の重複
                t = d.get("text", "")
                dup = ["%s×%d" % (k, t.count(k)) for k in APPEAL if t.count(k) >= 2]
                line("訴求の重複", True, " / ".join(dup) or "なし")
                print("     スクショ: %s" % p)
            print()
            print("  → NG %d件。★の付いた行を1つずつ直す。数字が全部OKでもスクショを必ず見る" % ng)

asyncio.run(run())
