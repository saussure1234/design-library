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
  // ★演出を出し切る【前】に記録する。画面より下にある .fx が最初から opacity:1 で
  //   変形も無いなら、スクロールしても何も起きない＝動きが効いていない。
  //   （「リロードすると小学生で英検2級がデフォルトで表示される」で実際に起きた）
  var pre=[];
  document.querySelectorAll(".fx").forEach(function(e){
    var r=e.getBoundingClientRect();
    if(r.top < innerHeight || r.width<4 || r.height<4) return;   // 画面内は出ていて当然
    var s=getComputedStyle(e);
    if(parseFloat(s.opacity)>0.95 && s.transform==="none" && s.clipPath==="none" && pre.length<6)
      pre.push((String(e.className||"").split(" ")[0]||e.tagName)
        +"「"+e.textContent.trim().slice(0,14)+"」");
  });
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
    // ★短いコピーで最終行が1〜2文字だけ落ちる「孤立行」。
    //   実機で「改行が意味わからん」と言われる原因。本文の長文は自然なので除外。
    var orphan=[];
    document.querySelectorAll("body *").forEach(function(e){
      var s=getComputedStyle(e);
      if(s.display==="none"||s.visibility==="hidden") return;
      // 見るのは段落と見出しだけ。li/td/span は器の都合で折れるのが自然
      if(!/^(P|H1|H2|H3|H4)$/.test(e.tagName)) return;
      var t=""; e.childNodes.forEach(function(n){ if(n.nodeType===3) t+=n.nodeValue });
      t=t.trim();
      if(t.length<8 || t.length>40) return;          // 本文の長文は対象外
      // 長文が <span>/<br> で区切られていると、断片だけ短く見える。親で判定して除く
      if(e.parentElement && e.parentElement.textContent.trim().length > 80) return;
      var rg=document.createRange(); rg.selectNodeContents(e);
      var rs=[].slice.call(rg.getClientRects()).filter(function(r){return r.width>1&&r.height>1});
      if(rs.length<2) return;
      var ws=rs.map(function(r){return r.width});
      var mx=Math.max.apply(null,ws), last=ws[ws.length-1];
      // 狭い器（カード・表のセル）の中で折れるのは自然。広い場所のものだけ見る
      if(mx < W*0.55) return;
      if(e.closest("table")) return;                 // 表の中は器の都合で折れる
      if(last < mx*0.22 && orphan.length<6)
        orphan.push("「"+t.slice(0,18)+"」最終行"+Math.round(last)+"/"+Math.round(mx)+"px");
    });
    if(orphan.length) out.push("最終行が1〜2文字だけ落ちている: "+orphan.join(" / "));

    // ★同じ役割で横に並ぶ要素（比較表の見出し・カード）の【中身の大きさ】が揃っているか。
    //   ロゴだけ極端に小さい、注記だけ大きい、を拾う。過去FBで最多の観点。
    var scale=[];
    function inner(e){                       // その要素の「中身の実寸」
      var im=e.querySelector("img,svg");
      if(im) return im.getBoundingClientRect().height;
      return parseFloat(getComputedStyle(e).fontSize)||0;
    }
    document.querySelectorAll("body *").forEach(function(par){
      var ch=[].slice.call(par.children).filter(function(c){
        var s=getComputedStyle(c); if(s.display==="none") return false;
        var r=c.getBoundingClientRect(); return r.width>20&&r.height>10;
      });
      if(ch.length<2||ch.length>6) return;
      // ★役割が同じもの同士でだけ比べる。ロゴとボタンのように役目が違うものは対象外
      var key=function(c){var s=String(c.className||"").split(" ")[0];return s.replace(/--.*$/,"")||c.tagName};
      var k0=key(ch[0]); if(!ch.every(function(c){return key(c)===k0})) return;
      var top=ch[0].getBoundingClientRect().top;
      if(!ch.every(function(c){return Math.abs(c.getBoundingClientRect().top-top)<12})) return; // 横並びだけ
      var vs=ch.map(inner).filter(function(v){return v>0});
      if(vs.length<2) return;
      var mx=Math.max.apply(null,vs), mn=Math.min.apply(null,vs);
      if(mx/mn>1.8 && scale.length<5){
        var sm=ch[vs.indexOf(mn)];
        scale.push((sm.className&&String(sm.className).split(" ")[0]||sm.tagName)
          +"「"+(sm.textContent.trim().slice(0,10)||"画像")+"」"+Math.round(mn)+"px ／ 隣は"+Math.round(mx)+"px");
      }
    });
    if(scale.length) out.push("［参考］横に並ぶ要素で大きさに差: "+scale.join(" / "));

    // ★文字が読めない：何かに覆われている／地と同系色で沈んでいる
    function lum(c){
      var m=c.match(/\d+/g); if(!m) return null;
      var v=m.slice(0,3).map(function(x){x/=255;return x<=.03928?x/12.92:Math.pow((x+.055)/1.055,2.4)});
      return .2126*v[0]+.7152*v[1]+.0722*v[2];
    }
    // ★背景がグラデーションや画像だと色で判定できない（白文字がオレンジのボタンに
    //   乗っているのに「白地に白」と誤判定した）。そういう要素は見送る。
    function bg(e){
      for(var p=e;p;p=p.parentElement){
        var s=getComputedStyle(p);
        if(s.backgroundImage&&s.backgroundImage!=="none") return null;
        var c=s.backgroundColor;
        if(c&&c!=="rgba(0, 0, 0, 0)"&&!/, 0\)$/.test(c)) return c;
      }
      return "rgb(255,255,255)";
    }
    var unread=[];
    document.querySelectorAll("body *").forEach(function(e){
      if(!/^(P|H1|H2|H3|H4|SPAN|A|LI|EM|B|STRONG)$/.test(e.tagName)) return;
      var s=getComputedStyle(e);
      if(s.display==="none"||s.visibility==="hidden"||parseFloat(s.opacity)<0.9) return;
      var t=""; e.childNodes.forEach(function(n){ if(n.nodeType===3) t+=n.nodeValue });
      t=t.trim(); if(t.length<3) return;
      var r=e.getBoundingClientRect();
      if(r.width<8||r.height<8) return;
      var bgc=bg(e); if(bgc===null) return;
      var f=lum(s.color), b=lum(bgc);
      if(f!==null&&b!==null){
        var cr=(Math.max(f,b)+.05)/(Math.min(f,b)+.05);
        if(cr<1.35&&unread.length<5) unread.push("「"+t.slice(0,12)+"」地と同系色（比 "+cr.toFixed(1)+"）");
      }
    });
    if(unread.length) out.push("［参考］地と近い色の文字: "+unread.join(" / "));
    if(pre.length) out.push("最初から見えている（スクロール演出が効いていない）: "+pre.join(" / "));
    if(over.length) out.push("文字が画面外へ: "+over.join(" / "));
    if(clip.length) out.push("文字が切れている: "+clip.join(" / "));

    /* ★ここから下は soft（幅の合否は変えない。見立てとして出すだけ） */
    var soft=[];

    // ★明示的な <br> で切ったコピーの「余り」。
    //   Chrome でぴったり収まっていても、実機Safariは字が数%広いので溢れて1行増える。
    //   実際に3回起きている（「から、」が行頭／CTA注記が3行／4行に割れる）。
    var tight=[];
    document.querySelectorAll("p,span,h1,h2,h3,h4").forEach(function(e){
      if(!e.querySelector("br")) return;
      var s=getComputedStyle(e);
      if(s.display==="none"||s.visibility==="hidden") return;
      var par=e.parentElement; if(!par) return;
      var ps=getComputedStyle(par);
      var avail=par.getBoundingClientRect().width
              - parseFloat(ps.paddingLeft) - parseFloat(ps.paddingRight);
      // ★狭い器（カード・表のセル）の中で折れるのは自然。広い場所の短いコピーだけ見る。
      //   （orphan-line で同じ誤検出を踏んだので、同じ物差しを使う）
      if(avail < W*0.45) return;
      if(e.closest("table")) return;
      if(e.textContent.trim().length > 60) return;   // 本文の長文は対象外
      // ★display:none の <br>（幅ごとに出し分けている改行）は改行しない。
      //   これを数えると「実際は1行なのに2つに割れている」と誤って測る。
      var segs=[], cur="";
      e.childNodes.forEach(function(n){
        if(n.nodeName==="BR" && getComputedStyle(n).display!=="none"){ segs.push(cur); cur=""; }
        else cur+=n.textContent;
      });
      segs.push(cur);
      segs=segs.map(function(x){return x.trim()}).filter(Boolean);
      if(segs.length<2) return;
      var m=document.createElement("span");
      m.style.cssText="position:absolute;visibility:hidden;white-space:nowrap;left:-9999px";
      m.style.fontFamily=s.fontFamily; m.style.fontSize=s.fontSize;
      m.style.fontWeight=s.fontWeight; m.style.letterSpacing=s.letterSpacing;
      document.body.appendChild(m);
      segs.forEach(function(tx){
        m.textContent=tx;
        var w=m.getBoundingClientRect().width, sl=(avail-w)/avail;
        if(sl<0.10 && tight.length<6)
          tight.push("「"+tx.slice(0,14)+"」"+Math.round(w)+"/"+Math.round(avail)
                     +"px（余り"+Math.round(sl*100)+"%）");
      });
      m.remove();
    });
    if(tight.length) soft.push("明示改行の余りが1割未満＝実機Safariで1行増える: "+tight.join(" / "));

    // ★埋め込み動画が小さいと、YouTube は右側のボタン（全画面・設定）を落とす。
    //   「スマホで大きい画面にするボタンが無い」の正体。
    var vid=[];
    document.querySelectorAll("[data-yt],iframe").forEach(function(e){
      var r=e.getBoundingClientRect();
      if(r.width<4) return;
      var why=[];
      if(r.width<280) why.push("幅"+Math.round(r.width)+"px（280px未満だと全画面ボタンが出ない）");
      var al=e.getAttribute&&e.getAttribute("allow");
      if(e.tagName==="IFRAME" && al && al.indexOf("fullscreen")<0)
        why.push("allow に fullscreen が無い");
      if(why.length && vid.length<4) vid.push(why.join(" / "));
    });
    if(vid.length) soft.push("動画の全画面ボタンが出ない条件: "+vid.join(" ／ "));
    // ── 高さ・位置の揃い（2026-09-11 実装）
    //   きっかけ：SHAREの比較2箱が 左243.7 / 右363.1 で119.4px違っていたのに、
    //   この項目は「未判定」しか出しておらず、見つけたのは人だった。
    //   物差し：同じ親の直下で横に並ぶ（＝縦位置が重なる）兄弟の、上端と下端の差。
    //   🚨 4px までは字送りの丸めで出るので通す。5px 以上を拾う。
    //   🚨 grid/flex で意図的に高さを変えている列（align-items:start 等）も拾う。
    //      それが今回の SHARE の原因そのものだったので、除外しない。
    //   🚨 最初に書いた版は「上限6件」で先に雑音が埋まり、本命の119pxに届かなかった。
    //      2つ直した：①同種の兄弟だけ見る（タグ＋第1クラスが全員そろっているもの。
    //      アイコンと本文のような別物の対を除ける）②全部集めて差の大きい順に並べる。
    //   🚨 閾値は8px。過去FBの実測が 19px（人・AIの開始点）と 119px（比較の2箱）なので、
    //      5pxだと字送りの丸めまで拾って雑音になる。
    var alignAll=[];
    document.querySelectorAll("body *").forEach(function(par){
      var ks=[].slice.call(par.children).filter(function(e){
        if(e instanceof SVGElement) return false;
        var s=getComputedStyle(e);
        if(s.display==="none"||s.visibility==="hidden"||s.position==="absolute") return false;
        var r=e.getBoundingClientRect();
        return r.width>60 && r.height>40;
      });
      if(ks.length<2 || ks.length>6) return;
      var key=function(e){return e.tagName+"."+nm(e)};
      var kinds={}; ks.forEach(function(e){kinds[key(e)]=1});
      if(Object.keys(kinds).length!==1) return;                    // 同種でないものの対は見ない
      var rs=ks.map(function(e){return e.getBoundingClientRect()});
      // 横に並んでいる＝縦の範囲が重なっている、かつ左端が違う
      for(var i=1;i<rs.length;i++){
        if(rs[i].left <= rs[i-1].left + 4) return;                 // 縦積み
        if(rs[i].top > rs[i-1].bottom - 8) return;                 // 段が違う
      }
      var tops=rs.map(function(r){return r.top}), bots=rs.map(function(r){return r.bottom});
      var dt=Math.max.apply(null,tops)-Math.min.apply(null,tops);
      var db=Math.max.apply(null,bots)-Math.min.apply(null,bots);
      var d=Math.max(dt,db);
      if(d>=8) alignAll.push({d:d, s:nm(par)+" の"+ks.length+"つ("+key(ks[0])+"): 上端差"
        +Math.round(dt)+"px / 下端差"+Math.round(db)+"px"});
    });
    alignAll.sort(function(a,b){return b.d-a.d});
    var align=alignAll.slice(0,6).map(function(x){return x.s});
    //   🚨 out（＝リンクを止める）に入れてはいけない。棒グラフのように「高さが違うことが
    //      意味を持つ」並びがあり、実際に /4 で bars の72px差を誤検出した。
    //      止めるのは「機械が実測で崩れている」ものだけ（checklist の決めごと）。
    //      ここは見立てとして出し、直すかどうかは人が決める。
    if(align.length) soft.push("横に並ぶ要素の高さ・位置がそろっていない（差の大きい順）: "+align.join(" / "));

    // ── 地との差（罫・枠だけ。2026-09-11 追加）
    //   きっかけ：見出し下の .s-notch が白地に対して比1.26で、実質見えていなかった。
    //   🚨 文字のコントラストは上の unread（閾値1.35）で既に見ている。ここを4.5に
    //      上げようとして25件の偽陽性を出した（濃色地がグラデーションで backgroundColor が
    //      透明なため、白文字を「白地に白」と誤判定した）。既存の bg() は
    //      グラデーションのとき null を返して判定を見送る作りなので、それを使う。
    //   🚨 既存が見ているのは文字要素（P/H1-H4/SPAN/A/LI/EM/B/STRONG）だけ。
    //      1pxの罫・<i>・<hr> は対象外だった。そこがまさに抜けていた穴。
    //   物差し：高さ4px以下・幅24px以上の面（＝罫）で、地との比が1.35未満。
    //   🚨 最初 3.0（WCAG 1.4.11）にしたら11件出て、全部「本物だが普通の設計」だった
    //      （#cdd4dc の罫を白地に＝比1.5。薄い1px罫は正常な組み方）。
    //      3.0 は「部品や状態を見分けるための線」の基準で、装飾の区切り罫には厳しすぎる。
    //      既存の文字判定（unread）が使っている 1.35 に合わせる。ここは
    //      「意味を持っているのに見えていない」ものだけを拾いたい（.s-notch は1.26）。
    var lowc=[];
    document.querySelectorAll("hr, i, span, div, li").forEach(function(e){
      if(lowc.length>=6) return;
      if(e instanceof SVGElement) return;
      var s=getComputedStyle(e);
      if(s.display==="none"||s.visibility==="hidden"||parseFloat(s.opacity)<0.5) return;
      var r=e.getBoundingClientRect();
      if(r.height>4 || r.height<1 || r.width<24) return;      // 罫だけ
      if(e.textContent.trim()) return;                        // 文字があるものは罫ではない
      var c=s.backgroundColor;
      if(!c || c==="rgba(0, 0, 0, 0)" || /, 0\)$/.test(c)) return;
      var bgc=bg(e.parentElement||e); if(bgc===null) return;  // グラデーションは見送る
      var f=lum(c), b=lum(bgc);
      if(f===null||b===null) return;
      var cr=(Math.max(f,b)+0.05)/(Math.min(f,b)+0.05);
      if(cr<1.35) lowc.push("罫 "+nm(e)+"（幅"+Math.round(r.width)+"px）比"+cr.toFixed(2)+"（地とほぼ同じ＝見えていない）");
    });
    if(lowc.length) soft.push("地との差が小さくて沈んでいる罫: "+lowc.join(" / "));

    // ★判定は画像からしか読めないので、項目ごとに16pxの色マーカーを左上に並べる。
    //   緑=通過 / 赤=要対応。順は resp / orphan / br / embed / align / contrast。
    var FLAGS=[
      out.some(function(x){return /横スクロール|画面外|切れている/.test(x)}),
      out.some(function(x){return /最終行が1〜2文字/.test(x)}),
      soft.some(function(x){return /明示改行の余り/.test(x)}),
      soft.some(function(x){return /全画面ボタン/.test(x)}),
      soft.some(function(x){return /高さ・位置がそろっていない/.test(x)}),
      soft.some(function(x){return /地との差が小さくて/.test(x)}),
    ];
    var fl=document.createElement("div");
    fl.style.cssText="position:absolute;left:0;top:0;z-index:2147483647;display:flex";
    FLAGS.forEach(function(bad){
      var s=document.createElement("i");
      s.style.cssText="width:16px;height:16px;display:block;background:"+(bad?"#e00000":"#00a000");
      fl.appendChild(s);
    });
    document.body.appendChild(fl);

    var d=document.createElement("div");
    d.id="__chk";
    d.setAttribute("data-result", JSON.stringify(out));
    d.style.cssText="position:absolute;left:0;top:16px;z-index:2147483646;background:"+
      (out.length?"#c00":"#063")+";color:#fff;font:12px/1.5 monospace;padding:6px;max-width:100%;white-space:pre-wrap";
    d.textContent=(out.length? "NG " : "OK ")+W+"px\\n"+out.concat(
      soft.map(function(x){return "［見立て］"+x})).join("\\n");
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


def read_flags(png):
    """左上に並べた16pxの色マーカーを読む。
    順は resp / orphan / br-margin / embed / alignment / contrast（probe の FLAGS と同じ）。"""
    px = Image.open(png).convert("RGB").load()
    out = []
    for i in range(6):
        c = px[i * 16 + 8, 8]
        out.append("ng" if (c[0] > 150 and c[1] < 90) else ("ok" if (c[1] > 110 and c[0] < 90) else "?"))
    return out


def read_badge(png, w):
    """左上に描かせた判定バッジを読む。赤(#c00)ならNG、緑(#063)ならOK。"""
    px = Image.open(png).convert("RGB").load()
    hits = [px[x, y] for y in range(18, 56, 4) for x in range(2, min(60, w), 4)]
    ng = sum(1 for c in hits if c[0] > 150 and c[1] < 80 and c[2] < 80)
    ok = sum(1 for c in hits if c[0] < 60 and 80 < c[1] < 150 and c[2] < 90)
    return "NG" if ng > ok else ("OK" if ok else "?")


# ══════════════════════════════════════════════════════════════════
#  チェックリスト（checklist.json）に沿った判定
#  ここが「学習するシステム」の本体。指摘が来たら項目を足す。
# ══════════════════════════════════════════════════════════════════
ROOT = os.path.dirname(os.path.abspath(__file__))


def _reg():
    try:
        return json.load(open(os.path.join(ROOT, "lp-registry.json"), encoding="utf-8"))
    except Exception:
        return {"projects": []}


def find_version(vid):
    """版idから、その案件と版の記録を引く。"""
    for p in _reg().get("projects", []):
        for v in p.get("versions", []):
            if v["id"] == vid:
                return p, v
    return None, None


def plain(html):
    """タグを落として本文だけにする。突き合わせ用。"""
    h = re.sub(r"(?is)<(script|style|svg)[^>]*>.*?</\1>", " ", html)
    h = re.sub(r"(?s)<!--.*?-->", " ", h)
    h = re.sub(r"<[^>]+>", "\n", h)
    h = h.replace("&nbsp;", " ").replace("&amp;", "&").replace("&#39;", "'")
    return [x.strip() for x in h.split("\n") if x.strip()]


def check_wording(lines):
    """表記ゆれ。過去FBで3回指摘された。"""
    bad = []
    for w in ("お子様", "保護者様", "生徒様"):
        n = sum(l.count(w) for l in lines)
        if n:
            bad.append(f"{w} ×{n}")
    return ("ng", " / ".join(bad)) if bad else ("ok", "「さま」に統一されている")


def check_script(lines, sp):
    """原稿との突き合わせ。原稿にあってLPに無い文を出す。"""
    if not sp or not os.path.exists(sp):
        return ("skip", "原稿が未登録（lpv.py script <案件> --new）")
    raw = open(sp, encoding="utf-8").read()
    raw = raw.split("## v1 からの変更")[0].split("## v2 からの変更")[0]
    src = [x.strip() for x in raw.split("\n")]
    body = "".join(lines)
    miss = []
    for s in src:
        s = re.sub(r"^[-#\s*]+", "", s).strip()
        # ★見出し・ラベル・注記は「LPにそのまま出る文」ではないので対象外
        if len(s) < 20 or s.startswith(("（", "注記", "見出し", "受領", "反映先", "現状のLP")):
            continue
        if "：" in s[:12]:              # 「補助コピー：」「ボタン：」など
            s = s.split("：", 1)[1].strip()
        if s.startswith("ESL club オンライン校") and "原稿" in s:
            continue
        if len(s) < 20:
            continue
        # ★原稿の「POINT1　見出し｜リード」は、LPでは別々の要素に分かれる。
        #   区切って、それぞれがLPにあるかを見る。
        parts = [x for x in re.split(r"[｜|／/　]", s) if len(re.sub(r"[\s　]", "", x)) >= 12]
        parts = parts or [s]
        nb = re.sub(r"[\s　]", "", body)
        for q in parts:
            core = re.sub(r"[\s　]", "", re.sub(r"^POINT\d+", "", q))
            if core[:22] and core[:22] not in nb:
                miss.append(q.strip()[:36])
    if miss:
        return ("ng", f"原稿にあってLPに無い: " + " / ".join(miss[:4]))
    return ("ok", f"原稿（{os.path.basename(sp)}）の文はすべてLPにある")


def check_self(html):
    """ページ内の不一致。POINT の一覧と詳細で見出しが違わないか。"""
    li = re.findall(r'<li class="fnc__item.*?</li>', html, re.S)
    ti = re.findall(r'<h3 class="vhr__title">(.*?)</h3>', html, re.S)
    if not li or not ti:
        return ("skip", "対象の型ではない")
    bad = []
    for i, (a, b) in enumerate(zip(li, ti), 1):
        at = [x.strip() for x in re.sub(r"<[^>]+>", "\n", a).split("\n") if x.strip()]
        at = [x for x in at if not re.fullmatch(r"0?\d+", x)]   # 「01」などの番号は見出しではない
        head = at[0] if at else ""
        det = re.sub(r"<[^>]+>", "", b).strip()
        if head and det and head != det:
            bad.append(f"POINT{i}: 一覧「{head}」/ 詳細「{det}」")
    return ("ng", " / ".join(bad)) if bad else ("ok", f"一覧と詳細の見出しが一致（{len(ti)}件）")


def check_links(html, base):
    """画像の実在と YouTube の再生可否。"""
    miss = []
    for u in set(re.findall(r'(?:src|href)="((?!http|#|mailto:|tel:|data:|/)[^"]+)"', html)):
        u = u.split("?")[0]
        if u.endswith((".html", "/")) or not os.path.splitext(u)[1]:
            continue
        if not os.path.isfile(os.path.join(base, u)):
            miss.append(u)
    dead = []
    for yid in set(re.findall(r'data-yt="([^"]+)"', html)):
        try:
            r = subprocess.run(["curl", "-s", "-o", "/dev/null", "-w", "%{http_code}",
                                f"https://www.youtube.com/oembed?url=https://youtu.be/{yid}&format=json"],
                               capture_output=True, text=True, timeout=20)
            if r.stdout.strip() != "200":
                dead.append(f"{yid}({r.stdout.strip()})")
        except Exception:
            dead.append(f"{yid}(確認できず)")
    msg = []
    if miss: msg.append("見つからないファイル: " + " / ".join(miss[:4]))
    if dead: msg.append("再生できない動画: " + " / ".join(dead))
    return ("ng", " ／ ".join(msg)) if msg else ("ok", "画像・動画とも生きている")


def check_lineage(vid):
    """先祖返り。派生元が、その案件で一番あとにFBを反映した版か。"""
    p, v = find_version(vid)
    if not p or not v or not v.get("parent"):
        return ("skip", "派生元が無い（初版）")
    ids = [x["id"] for x in p["versions"]]
    par = v["parent"]
    later = [x for x in p["versions"]
             if x.get("fb") and x["id"] != vid and ids.index(x["id"]) > ids.index(par)] if par in ids else []
    if later:
        return ("ng", f"派生元 {par} より後に FB を持つ版がある: " + ", ".join(x["id"] for x in later))
    return ("ok", f"派生元 {par} は最新のFB反映版")


def check_publish(html):
    """公開前の設定。noindex の外し忘れ・OGP・favicon・計測タグ。"""
    bad, warn = [], []
    # ★提示用のリンクでは noindex が入っているのが正しい。本番公開の直前に外す。
    noindex = bool(re.search(r'<meta[^>]+name=["\']robots["\'][^>]*noindex', html, re.I))
    for k, label in (("og:title", "OGPタイトル"), ("og:image", "OGP画像"), ("og:description", "OGP説明")):
        if f'property="{k}"' not in html and f"property='{k}'" not in html:
            warn.append(label)
    if 'rel="icon"' not in html and "rel='icon'" not in html and 'rel="shortcut icon"' not in html:
        warn.append("favicon")
    if not re.search(r"gtag\(|googletagmanager|GTM-|analytics", html, re.I):
        warn.append("計測タグ")
    msg = []
    msg.append("noindex あり＝提示用。本番公開の前に外す" if noindex else "noindex なし＝本番公開できる状態")
    if warn:
        msg.append("未設定: " + " / ".join(warn) + "（提示用なら不要）")
    return ("warn" if (noindex or warn) else "ok", " ／ ".join(msg))


def check_secrets(src):
    """公開リポに出してはいけないもの。publish_guard と同じ観点を1ファイルで見る。"""
    html = open(src, encoding="utf-8").read()
    hit = []
    for m in re.finditer(r"[0-9][0-9,]{2,}\s*円", html):
        hit.append(f"金額「{m.group(0)}」")
    for m in re.finditer(r"/Users/[A-Za-z0-9_.-]+/", html):
        hit.append(f"手元のパス「{m.group(0)}」")
    for m in re.finditer(r"(sk-[A-Za-z0-9]{16,}|AIza[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,})", html):
        hit.append("APIキーらしき文字列")
    # 金額は料金表のあるLPでは正しい。ページに「料金」があれば許す
    if hit and all(h.startswith("金額") for h in hit) and re.search(r"料金|入会金|税込", html):
        return ("ok", f"金額はあるが料金表のページ（{len(hit)}件）。手元のパス・鍵は無い")
    return ("ng", " / ".join(sorted(set(hit))[:5])) if hit else ("ok", "金額・手元のパス・鍵とも無い")


def check_motion(html):
    """動き。出る順が DOM の順になっているか（data-d が並べ替えで取り残されていないか）。

    ★実際に起きた事故：カードを並べ替えたのに data-d が元のカードに付いたままで、
      「4つの特徴」が 3→4→1→2 の順に出た。目では気づきにくいので機械で見る。
    ★見るのは【同じ親の兄弟どうし】だけ。見出しと一覧のように役目が違うものは
      別の束なので、まとめて比べると誤検出になる（セクション単位で見て実際に外した）。
    """
    from html.parser import HTMLParser

    VOID = {"br", "img", "hr", "input", "meta", "link", "source", "area", "base", "col",
            "embed", "param", "track", "wbr"}

    class P(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.stack = [("#root", 0)]
            self.nid = 0
            self.groups = {}     # 親の識別子 → [(出現順, data-d, 目印)]

        def handle_starttag(self, tag, attrs):
            a = dict(attrs)
            self.nid += 1
            if "data-d" in a:
                try:
                    d = int(str(a["data-d"]).strip())
                except ValueError:
                    d = None
                if d is not None:
                    key = self.stack[-1]
                    lab = (a.get("class") or tag).split(" ")[0]
                    self.groups.setdefault(key, []).append((self.nid, d, lab))
            if tag not in VOID:
                self.stack.append((a.get("class", tag).split(" ")[0], self.nid))

        def handle_startendtag(self, tag, attrs):
            self.handle_starttag(tag, attrs)

        def handle_endtag(self, tag):
            if len(self.stack) > 1 and tag not in VOID:
                self.stack.pop()

    p = P()
    p.feed(html)
    total = sum(len(v) for v in p.groups.values())
    if not total:
        return ("ok", "data-d による順番指定は無い（順番の事故は起きない作り）")
    bad = []
    for (pname, _), items in p.groups.items():
        if len(items) < 2:
            continue
        ds = [d for _, d, _ in items]
        if ds != sorted(ds):
            labs = [lab for _, _, lab in items]
            bad.append(f"{pname} の中：{'→'.join(map(str, ds))}（並びは {'／'.join(labs[:4])}）")
    if bad:
        return ("ng", "出る順が DOM の順と違う: " + " / ".join(bad[:4]))
    return ("ok", f"出る順は DOM の順（data-d {total}箇所）。"
                  f"最初から見えていないかは5幅の撮影で判定")


def check_sibling(vid):
    """同じクライアントの別LPと、共通部分の文言が食い違っていないか。

    ★実際に起きた事故：「フッターの（明光ネットワークジャパン）はいらない」を
      小学生向け(esl17)だけに反映し、オンライン校(esl16)に入れ忘れた。
      同じ施主の別LPは共通部品を使い回すので、片方だけ直すと必ずずれる。
    ★見るのはフッターの法的リンク（会社概要・プライバシーポリシー等）だけ。
      本文まで比べると、そもそも別のLPなので差だらけになって使えない。
    """
    reg = _reg()
    if not reg:
        return ("skip", "台帳が読めない")
    me = next(((pr, v) for pr in reg["projects"] for v in pr["versions"]
               if v["id"] == vid), None)
    if not me:
        return ("skip", "この版が台帳に無い")
    mypro, _ = me
    client = mypro.get("client")
    if not client:
        return ("skip", "クライアント名が台帳に無い")

    def legal(vid_):
        f = os.path.join(ROOT, "docs", vid_, "index.html")
        if not os.path.isfile(f):
            return None
        h = open(f, encoding="utf-8").read()
        return re.findall(r'class="ftc__legal-a"[^>]*>([^<]+)<', h)

    mine = legal(vid)
    if not mine:
        return ("skip", "フッターの法的リンクが見つからない（この作りではない）")

    diff = []
    for pr in reg["projects"]:
        if pr.get("client") != client or pr["id"] == mypro["id"]:
            continue
        live = [v for v in pr["versions"] if v.get("status") in ("shown", "internal")]
        if not live:
            continue
        other = live[-1]
        got = legal(other["id"])
        if got and got != mine:
            frozen = "（クライアントに提示中なので直せない）" if other["status"] == "shown" else ""
            diff.append(f"{pr['name']} の {other['id']}: "
                        f"{' / '.join(got)}{frozen}")
    if diff:
        return ("ng", f"フッターの表記が別LPと違う（こちらは {' / '.join(mine)}）: "
                      + " ／ ".join(diff))
    return ("ok", f"同じ施主の別LPとフッターの表記が揃っている（{' / '.join(mine)}）")


def run_checklist(src, vid, out_json):
    """checklist.json に沿って判定し、結果を JSON で残す。"""
    try:
        cl = json.load(open(os.path.join(ROOT, "checklist.json"), encoding="utf-8"))["items"]
    except Exception:
        return None
    html = open(src, encoding="utf-8").read()
    lines = plain(html)
    base = os.path.dirname(src)
    p, v = find_version(vid)
    # ★原稿は「この版に記録されたもの」。無ければ派生元をたどる。
    #   最新の原稿を勝手に当てない（原稿が来る前の版と比べると、差分が全部嘘になる）。
    sp = None
    if p and v:
        by, cur, seen = {x["id"]: x for x in p["versions"]}, v, set()
        while cur and cur["id"] not in seen:
            if cur.get("script"):
                sp = os.path.join(ROOT, "scripts", p["id"], cur["script"] + ".md")
                break
            seen.add(cur["id"])
            cur = by.get(cur.get("parent"))

    fns = {"wording": lambda: check_wording(lines),
           "script-diff": lambda: check_script(lines, sp),
           "self-consistency": lambda: check_self(html),
           "links": lambda: check_links(html, base),
           "lineage": lambda: check_lineage(vid),
           "sibling": lambda: check_sibling(vid),
           "motion": lambda: check_motion(html),
           "publish": lambda: check_publish(html),
           "secrets": lambda: check_secrets(src)}
    res = []
    for it in cl:
        if it["id"] in fns:
            st, msg = fns[it["id"]]()
        elif it["id"] in ("responsive", "orphan-line"):
            st, msg = ("pending", "5幅の撮影で判定")
        elif it["by"] == "human":
            st, msg = ("human", it["what"])
        elif it["by"] == "claude":
            st, msg = ("claude", "私が意味を見る（context/<案件>.md を前提に）")
        else:
            st, msg = ("todo", "自動判定はこれから")
        res.append({"id": it["id"], "group": it["group"], "name": it["name"],
                    "by": it["by"], "state": st, "msg": msg})
    return res


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
    shot_flags = []
    try:
        for w in WIDTHS:
            png = os.path.join(tmp, f"{w}.png")
            if not shoot(side, png, w):
                say(f"  {w:>5}px  撮影に3回失敗（後で手で見る）", "y")
                ng.append(f"{w}px 撮影失敗")
                continue
            v = read_badge(png, w)
            shot_flags.append(read_flags(png))
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

    # ★レビュー画面（原稿・実物・指摘の3列）が使う 1440px の全体像を版の隣に残す
    wide = dict(shots).get(1440)
    if wide:
        im = Image.open(wide).convert("RGB")
        w = 720
        im.resize((w, int(im.height * w / im.width)), Image.LANCZOS)\
          .save(os.path.join(os.path.dirname(src), "_shot.jpg"), quality=82, optimize=True)
        say("  ○ 実物の縦長スクショ: _shot.jpg", "g")

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

    # ── チェックリストの判定を JSON で残す（画面がこれを読む） ──
    vid = os.path.basename(os.path.dirname(src))
    items = run_checklist(src, vid, None)
    try:
        cl_items = json.load(open(os.path.join(ROOT, "checklist.json"),
                                  encoding="utf-8"))["items"]
    except Exception:
        cl_items = []
    if items:
        # 撮影で得たフラグ（5幅ぶん）を項目へ振り分ける。1幅でも ng なら ng
        order = ["responsive", "orphan-line", "br-margin", "embed-controls",
                 "alignment", "contrast"]
        # 🚨 マーカーが読めない（"?"）のを「ok」にしてはいけない。
        #    probe が途中で例外を投げるとマーカーが描かれず、全項目が緑に見える。
        #    2026-09-11 に実際に踏んだ（alignment を足した直後、6件の上限で
        #    本命に届かず＝別の原因だったが、読めない時に通す作りは同じ穴）。
        okmsg = {"responsive": "5幅とも崩れなし", "orphan-line": "孤立した行なし",
                 "br-margin": "明示改行はどの区間も1割以上の余りがある（実機で溢れにくい）",
                 "embed-controls": "動画は280px以上あり、allow に fullscreen も入っている",
                 "alignment": "横に並ぶ要素の上端・下端は5px以内でそろっている",
                 "contrast": "文字は4.5以上、罫・枠は3.0以上の差がある"}
        for k, name in enumerate(order):
            st = "ok"
            unknown = False
            for f in shot_flags:
                if k >= len(f) or f[k] == "?":
                    unknown = True
                elif f[k] == "ng":
                    st = "ng"; break
            if st == "ok" and unknown:
                st = "pending"
            for it in items:
                if it["id"] == name:
                    it["state"] = st if shot_flags else "skip"
                    it["msg"] = (okmsg[name] if st == "ok" else
                                 "★判定できていない（画面の左上にマーカーが出ていない＝"
                                 "計測が途中で落ちた可能性）" if st == "pending" else
                                 "5幅のいずれかで検出（まとめ画像の左上を見る）")
        # ★私が画像を見て書いた「どこ・何が・どう直すか」を、再実行で消さない。
        #   ただしページが変わっていたら見直しが必要なので、その時だけ捨てて claude に戻す。
        import hashlib
        dst = os.path.join(os.path.dirname(src), "_check.json")
        sig = hashlib.sha1(open(src, "rb").read()).hexdigest()[:12]
        keep = {}
        if os.path.exists(dst):
            try:
                old_ = json.load(open(dst, encoding="utf-8"))
                if old_.get("sig") == sig:            # ページが変わっていない
                    for it in old_.get("items", []):
                        if it.get("by") == "claude" and (it.get("what") or it.get("how")):
                            keep[it["id"]] = it
            except Exception:
                pass
        for it in items:
            k = keep.get(it["id"])
            if not k:
                continue
            it["state"] = k.get("state", it["state"])
            for f in ("where", "what", "how"):
                if k.get(f):
                    it[f] = k[f]
        n_keep = len(keep)
        out = {"version": vid, "sig": sig,
               "at": __import__("datetime").datetime.now().strftime("%Y-%m-%d %H:%M"),
               "items": items}
        json.dump(out, open(dst, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
        say("\n── チェックリスト ──", "b")
        mark = {"ok": ("○", "g"), "ng": ("✗", "r"), "warn": ("△", "y"), "skip": ("−", "y"),
                "todo": ("…", "y"), "human": ("□", "y"), "claude": ("◇", "y")}
        for it in items:
            m, c = mark.get(it["state"], ("?", ""))
            txt = it.get("what") or it.get("how") or it["msg"]
            say(f"  {m} {it['name']:<16} {txt[:62]}", c)
        if n_keep:
            say(f"\n  ・前回私が見た判定 {n_keep}件はそのまま残した（ページが変わっていないため）")
        else:
            need = [i["name"] for i in items if i["state"] == "claude"]
            if need:
                say(f"\n  ▲ 私が画像を見て埋める項目が {len(need)}件（{'・'.join(need)}）。"
                    f"\n    _shot.jpg を見て _check.json に where/what/how を書く。"
                    f"\n    それをしないと画面に「私が意味を見る」としか出ず、So には何も伝わらない", "y")
        # ★止めるのは【機械が測ったもの】だけ。
        #   私が画像を見て「こうした方がよい」と思ったものは提案であって、
        #   直す必要が無い可能性がある。判断は So。勝手に止めない・勝手に直さない。
        # ★止めるのは【実測で崩れているもの】だけ。
        #   blocking:false（実機で溢れそう、などの予測）は見立てとして出すに留める。
        blk = {i["id"] for i in cl_items if i.get("blocking", True)}
        bad  = [i for i in items if i["state"] == "ng"
                and i["by"] == "machine" and i["id"] in blk]
        mine = [i for i in items if i["state"] == "ng"
                and (i["by"] != "machine" or i["id"] not in blk)]
        ng = [x for x in ng if "px NG" not in x]      # 内訳は下のリストで出す
        if bad:
            ng.append("チェックリスト " + "・".join(i["name"] for i in bad))
        if mine:
            say("\n  ◇ 直した方がよさそう（止めない。直すかはあなたが決める）", "y")
            for i in mine:
                say(f"     ・{i['name']}：{(i.get('what') or i['msg'])[:70]}")
                if i.get("how"):
                    say(f"       → {i['how'][:110]}")

    if ng:
        say("\n  ★通っていない: " + " / ".join(ng), "r")
        say("  直してから出す。この状態でリンクを渡さない。", "r")
        sys.exit(1)
    say("\n  ○ 機械の判定は全部通った。リンクを渡してよい。", "g")
    say("    レビュー: https://saussure1234.github.io/design-library/lp/review.html"
        f"?v={os.path.basename(os.path.dirname(src))}")


if __name__ == "__main__":
    main()
