# -*- coding: utf-8 -*-
"""LPをクライアントに見せる前の機械チェック。

    python3 ~/design-library/check.py <index.html>            5幅で撮って判定
    python3 ~/design-library/check.py <index.html> --ref a.png  選んだ案と並べた画像も作る

★これを通さないとリンクを渡さない（~/.claude/CLAUDE.md のルール）。

判定するのは3つ。目で見て気づけないもの、目で見なくても分かるものだけ。
    ① 横スクロールが出ていないか        document.scrollWidth > innerWidth
    ② 版面からはみ出した要素が無いか      要素の右端 > 画面幅
    ③ 文字が器から溢れて切れていないか    scrollWidth > clientWidth の要素

★撮影は失敗する（画面が1色で塗り潰された画像になる）。
  実測で何度も踏んだので、1色判定で自動リトライする。
★スクロール連動アニメーション（.fx / .hh-in）は headless では発火しないことがある。
  中身が透明のまま撮れて「崩れている」と誤読するので、強制的に .hh-in を付けてから撮る。
"""
import argparse, json, os, re, shutil, subprocess, sys, tempfile
from PIL import Image

WIDTHS = [1440, 1024, 900, 600, 375]
SHOT = os.path.expanduser("~/Desktop/ESL_shogaku_LP/tools/shot.py")
C = {"g": "\033[32m", "y": "\033[33m", "r": "\033[31m", "b": "\033[1m", "": ""}


def say(s, c=""):
    print(f"{C.get(c,'')}{s}\033[0m" if c else s)


def prep(src, tmp):
    """撮影用のコピーを作る。アニメーションを最後まで進め、計測結果を画面に描かせる。"""
    h = open(src, encoding="utf-8").read()
    probe = """
<script>
addEventListener("load",function(){
  // 画面に入ったとき出る演出を全部出し切る（headless では発火しないことがある）
  setInterval(function(){document.querySelectorAll(".fx").forEach(function(e){e.classList.add("hh-in")})},60);
  setTimeout(function(){
    var W=innerWidth, out=[];
    if(document.documentElement.scrollWidth > W+1)
      out.push("横スクロール scrollWidth="+document.documentElement.scrollWidth+" > "+W);
    var over=[], clip=[];
    function nm(e){
      var c = e.className;
      if (c && c.baseVal !== undefined) c = c.baseVal;   // SVG は SVGAnimatedString
      return (String(c || "").trim().split(/\s+/)[0] || e.tagName);
    }
    // 横スクロールできる器（比較表など）の中は、はみ出していて正常
    function scrollable(e){
      for (var p=e.parentElement; p; p=p.parentElement){
        var s=getComputedStyle(p);
        if (s.overflowX==="auto" || s.overflowX==="scroll") return true;
      }
      return false;
    }
    document.querySelectorAll("body *").forEach(function(e){
      if (e instanceof SVGElement) return;               // 装飾のSVGは対象外
      var s = getComputedStyle(e);
      if (s.position==="fixed" || s.display==="none" || s.visibility==="hidden" || s.opacity==="0") return;
      // ★見るのは「文字を直接持つ要素」だけ。
      //   器や装飾は画面いっぱいに広げたり中身を切ったりするのが正しいので、拾うと誤検出になる。
      var txt = "";
      e.childNodes.forEach(function(n){ if (n.nodeType===3) txt += n.nodeValue; });
      if (!txt.trim()) return;
      var r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return;
      if (r.right > W + 1 && !scrollable(e) && over.length < 6)
        over.push(nm(e) + "「" + txt.trim().slice(0,12) + "」右端" + Math.round(r.right));
      var hid = (s.overflow==="hidden" || s.overflowY==="hidden" || s.overflowX==="hidden");
      if (hid && !scrollable(e) && (e.scrollHeight > e.clientHeight + 4 || e.scrollWidth > e.clientWidth + 4) && clip.length < 6)
        clip.push(nm(e) + "「" + txt.trim().slice(0,12) + "」が枠から溢れて切れている");
    });
    if(over.length) out.push("文字が画面外へ: "+over.join(" / "));
    if(clip.length) out.push("文字が切れている: "+clip.join(" / "));
    var d=document.createElement("div");
    d.id="__chk";
    d.setAttribute("data-result", JSON.stringify(out));
    d.style.cssText="position:absolute;left:0;top:0;z-index:2147483647;background:"+
      (out.length?"#c00":"#063")+";color:#fff;font:12px/1.5 monospace;padding:6px;max-width:100%;white-space:pre-wrap";
    d.textContent=(out.length? "NG " : "OK ")+W+"px\\n"+out.join("\\n");
    document.body.appendChild(d);
  },2600);
});
</script>"""
    open(tmp, "w", encoding="utf-8").write(h.replace("</body>", probe + "\n</body>"))


def flat(png, w):
    """撮影が失敗して1色で塗り潰された画像になっていないか。"""
    im = Image.open(png).convert("RGB")
    px = im.load()
    n = sum(1 for y in range(600, min(im.height, 9000), 300)
            if len({px[x, y] for x in range(5, min(w, im.width) - 5, 60)}) <= 2)
    return n > 20


def shoot(page, out, w, h=20000):
    """iframe に入れて実幅で撮る（Chrome のウィンドウは500px未満にできないため）。"""
    d = os.path.dirname(out)
    wrap = os.path.join(d, f"_w{w}.html")
    open(wrap, "w", encoding="utf-8").write(
        f'<body style="margin:0;background:#bbb">'
        f'<iframe src="file://{page}" style="width:{w}px;height:{h}px;border:0;display:block"></iframe></body>')
    for _ in range(3):
        subprocess.run([sys.executable, SHOT, wrap, out, "--size", f"{w+30}x{h}", "--wait", "17000"],
                       capture_output=True)
        if os.path.exists(out) and not flat(out, w):
            return True
    return False


def read_badge(png, w):
    """左上に描かせた判定バッジを読む。赤(#c00)ならNG、緑(#063)ならOK。"""
    px = Image.open(png).convert("RGB").load()
    hits = [px[x, y] for y in range(2, 40, 4) for x in range(2, min(60, w), 4)]
    ng = sum(1 for c in hits if c[0] > 150 and c[1] < 80 and c[2] < 80)
    ok = sum(1 for c in hits if c[0] < 60 and 80 < c[1] < 150 and c[2] < 90)
    return "NG" if ng > ok else ("OK" if ok else "?")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("html")
    ap.add_argument("--ref", help="選んだデザイン案の画像。実装と並べた画像を作る")
    ap.add_argument("--out", default=os.path.expanduser("~/Desktop/lp_check.png"))
    a = ap.parse_args()

    src = os.path.abspath(os.path.expanduser(a.html))
    if not os.path.exists(src):
        sys.exit(f"  ★ファイルが無い: {src}")
    if not os.path.exists(SHOT):
        sys.exit(f"  ★撮影スクリプトが無い: {SHOT}")

    tmp = tempfile.mkdtemp(prefix="lpcheck_")
    page = os.path.join(tmp, "page.html")
    prep(src, page)
    # 相対パスの画像を読ませるため、元の隣に置く
    side = os.path.join(os.path.dirname(src), "_check_tmp.html")
    shutil.copy(page, side)

    say(f"\n■ {os.path.basename(os.path.dirname(src))} を {len(WIDTHS)}幅で検査", "b")
    shots, ng = [], []
    try:
        for w in WIDTHS:
            png = os.path.join(tmp, f"{w}.png")
            if not shoot(side, png, w):
                say(f"  {w:>5}px  撮影に3回失敗（後で手で見る）", "y")
                ng.append(f"{w}px 撮影失敗")
                continue
            v = read_badge(png, w)
            say(f"  {w:>5}px  {v}", "g" if v == "OK" else ("r" if v == "NG" else "y"))
            if v != "OK":
                ng.append(f"{w}px {v}")
            shots.append((w, png))
    finally:
        if os.path.exists(side):
            os.remove(side)

    if not shots:
        sys.exit("  ★1枚も撮れなかった")

    # 5枚を1枚にまとめる（あなたが目で見るのはこれだけ）
    tw = 380
    tiles = []
    for w, png in shots:
        im = Image.open(png).convert("RGB")
        # 中身の下端まで
        px = im.load()
        last = im.height - 1
        for y in range(im.height - 1, 0, -60):
            if any(sum(px[x, y]) < 700 for x in range(0, min(w, im.width), 40)):
                last = y
                break
        im = im.crop((0, 0, min(w, im.width), min(last + 60, im.height)))
        tiles.append((w, im.resize((tw, int(im.height * tw / im.width)), Image.LANCZOS)))
    H = max(t.height for _, t in tiles) + 26
    sheet = Image.new("RGB", (tw * len(tiles) + 8 * (len(tiles) - 1), H), (222, 224, 228))
    from PIL import ImageDraw
    d = ImageDraw.Draw(sheet)
    x = 0
    for w, t in tiles:
        d.text((x + 4, 6), f"{w}px", fill=(15, 15, 15))
        sheet.paste(t, (x, 24))
        x += tw + 8
    sheet.save(a.out)
    say(f"\n  ○ まとめ画像: {a.out}", "g")

    if a.ref and os.path.exists(os.path.expanduser(a.ref)):
        ref = Image.open(os.path.expanduser(a.ref)).convert("RGB")
        big = Image.open(shots[0][1]).convert("RGB").crop((0, 0, WIDTHS[0], min(4600, Image.open(shots[0][1]).height)))
        cw = 620
        A = ref.resize((cw, int(ref.height * cw / ref.width)), Image.LANCZOS)
        B = big.resize((cw, int(big.height * cw / big.width)), Image.LANCZOS)
        cmp_ = Image.new("RGB", (cw * 2 + 10, max(A.height, B.height) + 24), (222, 224, 228))
        dd = ImageDraw.Draw(cmp_)
        dd.text((4, 6), "選んだ案", fill=(15, 15, 15))
        dd.text((cw + 14, 6), "実装", fill=(15, 15, 15))
        cmp_.paste(A, (0, 24)); cmp_.paste(B, (cw + 10, 24))
        p2 = a.out.replace(".png", "_ref.png")
        cmp_.save(p2)
        say(f"  ○ 案との比較: {p2}", "g")

    if ng:
        say("\n  ★通っていない: " + " / ".join(ng), "r")
        say("  直してから出す。この状態でリンクを渡さない。", "r")
        sys.exit(1)
    say("\n  ○ 5幅とも通った。リンクを渡してよい。", "g")


if __name__ == "__main__":
    main()
