# -*- coding: utf-8 -*-
"""キット定義（色・書体・使うパーツの並び）＋ 原稿 から LP を1枚に組み立てる。

    python3 build.py kits/eslclub.json -o ~/Desktop/ESLclub_LP/build/index.html

キットを書き換えるだけでセクションの差し替え・並べ替えができる。
「この2番目のセクションを別の型にして」＝ kit の parts[1] を書き換えるだけ。
"""
import json, os, re, sys, argparse

ROOT = os.path.dirname(os.path.abspath(__file__))
PARTS = os.path.join(ROOT, "parts")


# ── 最小テンプレート展開 ────────────────────────────────
# {{key}}            … 置換（HTMLはそのまま入る。原稿側で <br> 等を使える）
# {{#list}}...{{/list}} … 繰り返し。中では {{.key}} で要素のキーを参照
# {{?key}}...{{/key}}   … key が真なら出す
def render(tpl, data):
    def section(m):
        kind, key, body = m.group(1), m.group(2), m.group(3)
        val = data.get(key)
        if kind == "#":
            if not isinstance(val, list):
                return ""
            out = []
            for i, item in enumerate(val):
                d = dict(data)
                if isinstance(item, dict):
                    d.update({f".{k}": v for k, v in item.items()})
                else:
                    d["."] = item
                d[".i"] = i + 1
                d[".i0"] = i
                d[".d"] = i * 90          # stagger 用の遅延(ms)
                out.append(render(body, d))
            return "".join(out)
        return render(body, data) if val else ""

    prev = None
    while prev != tpl:
        prev = tpl
        tpl = re.sub(r"\{\{([#?])([\w.\-]+)\}\}(.*?)\{\{/\2\}\}", section, tpl, flags=re.S)

    def var(m):
        v = data.get(m.group(1), "")
        return "" if v is None else str(v)

    return re.sub(r"\{\{([\w.\-]+)\}\}", var, tpl)


def load_part(pid):
    """parts/<type>/<id>/ から html / css / meta を読む"""
    d = os.path.join(PARTS, pid)
    if not os.path.isdir(d):
        sys.exit(f"パーツが無い: {pid}  ({d})")
    html = open(os.path.join(d, "part.html"), encoding="utf-8").read()
    cssp = os.path.join(d, "part.css")
    css = open(cssp, encoding="utf-8").read() if os.path.exists(cssp) else ""
    metap = os.path.join(d, "meta.json")
    meta = json.load(open(metap, encoding="utf-8")) if os.path.exists(metap) else {}
    return html, css, meta


def tokens_css(tokens):
    if not tokens:
        return ""
    body = "".join(f"  --{k}:{v};\n" for k, v in tokens.items())
    return ":root{\n" + body + "}\n"


RUNTIME_JS = """
document.documentElement.classList.add('js');

/* スクロール表示：画面に入ったら .hh-in を付ける（IO不使用） */
(function(){
  var els=[].slice.call(document.querySelectorAll('.fx'));
  if(!els.length) return;
  document.body.classList.add('fx-on');
  var scrolled=false, ticking=false;
  function show(el){
    var d=parseInt(el.dataset.d||'0',10);
    if(d) setTimeout(function(){el.classList.add('hh-in')},d);
    else el.classList.add('hh-in');
  }
  function check(){
    ticking=false;
    var vh=window.innerHeight, i;
    for(i=els.length-1;i>=0;i--){
      var el=els[i], r=el.getBoundingClientRect();
      if(r.top < vh*0.88 && r.bottom > 0){ show(el); els.splice(i,1); }
    }
  }
  function onScroll(){ scrolled=true; if(!ticking){ ticking=true; requestAnimationFrame(check); } }
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('resize',onScroll,{passive:true});
  check();                                   /* 初期表示分 */
  /* 保険：20秒たっても一度もスクロールされなければ全部出す */
  setTimeout(function(){ if(!scrolled){ els.forEach(function(e){e.classList.add('hh-in')}); els.length=0; } },20000);
})();

/* ── POINT3と動画：スクロールに連れて左右へ割れる ────────
   節に入った時点では、他のPOINTと同じ位置（中央）。そこからスクロールするほど
   0→1 で --pp が上がり、箱が左へ寄って動画が右から出てくる。
   スクロール量に紐づけているので、戻せばそのまま巻き戻る。
   このJSが動かなくても、CSSの隠しは .fx-on 配下なので中身は消えない。 */
(function(){
  var row=document.querySelector('.fx[data-fx="pair"]');
  if(!row) return;
  var box=row.querySelector('.pmp__box') || row;
  var ticking=false, last=-1;
  function update(){
    ticking=false;
    try{
      var r=box.getBoundingClientRect(), vh=window.innerHeight;
      /* 箱の頭が画面の42%から2%まで上がるあいだ（vhの4割ぶんのスクロール）で 0→1 */
      var p=(vh*0.42 - r.top)/(vh*0.40);
      p = p<0 ? 0 : (p>1 ? 1 : p);
      if(Math.abs(p-last) < 0.004) return;
      last=p;
      row.style.setProperty('--pp', p.toFixed(3));
      row.classList.toggle('is-split', p > 0.985);
    }catch(e){ row.style.setProperty('--pp','1'); }
  }
  function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(update); } }
  addEventListener('scroll',onScroll,{passive:true});
  addEventListener('resize',onScroll,{passive:true});
  update();
})();

/* ── 数字のカウントアップ ──────────────────────
   data-count を持つ要素が画面に入ったら 0 から実値まで回す。
   同時にドーナツのリング（--p）も 0% から実値へ描く。
   JSが動かなければ最終状態がそのまま出る（中身は消えない）。 */
(function(){
  var ns=[].slice.call(document.querySelectorAll('[data-count]'));
  if(!ns.length) return;
  var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  function ease(t){ return 1-Math.pow(1-t,3); }
  function run(el){
    var to=parseFloat(el.dataset.count), dur=900+Math.min(600,to*6);
    var ring=el.closest('[style*="--p"]'), pTo=null;
    if(ring){ var mm=/--p:\s*([\d.]+)%/.exec(ring.getAttribute('style')||''); if(mm) pTo=parseFloat(mm[1]); }
    if(reduce){ el.textContent=to; return; }
    if(pTo!=null) ring.style.setProperty('--p','0%');
    var t0=null;
    function step(t){
      if(!t0) t0=t;
      var k=Math.min(1,(t-t0)/dur), e=ease(k);
      el.textContent=Math.round(to*e);
      if(pTo!=null) ring.style.setProperty('--p',(pTo*e).toFixed(1)+'%');
      if(k<1) requestAnimationFrame(step);
      else { el.textContent=to; if(pTo!=null) ring.style.setProperty('--p',pTo+'%'); }
    }
    requestAnimationFrame(step);
  }
  function check(){
    var vh=innerHeight;
    for(var i=ns.length-1;i>=0;i--){
      var r=ns[i].getBoundingClientRect();
      if(r.top<vh*0.86 && r.bottom>0){ run(ns[i]); ns.splice(i,1); }
    }
  }
  addEventListener('scroll',check,{passive:true}); addEventListener('resize',check,{passive:true});
  check();
})();

/* ── 見出しの行マスク ────────────────────────
   .sec-head__ja を1行ずつ下からせり上げる。
   実際に折り返した位置で割るため、描画後に測ってから分ける。 */
(function(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  var hs=[].slice.call(document.querySelectorAll('.sec-head__ja'));
  if(!hs.length) return;
  hs.forEach(function(h){
    /* 見出しが無い節は、見出しブロックごと消す（装飾線だけ残るのを防ぐ） */
    if(!h.textContent.trim()){
      var head=h.closest('.sec-head'); if(head) head.style.display='none';
      return;
    }
    if(h.querySelector('img,svg')) return;
    h.classList.add('lm');
    var html=h.innerHTML;
    /* <br> で区切られた行だけを対象にする（DOMを壊さない範囲） */
    var parts=html.split(/<br\s*\/?>/i);
    if(parts.length<2) parts=[html];
    h.innerHTML=parts.map(function(x){
      return '<span class="lm__l"><span class="lm__i">'+x+'</span></span>';
    }).join('');
  });
  var left=hs.slice();
  function check(){
    var vh=innerHeight;
    for(var i=left.length-1;i>=0;i--){
      var r=left[i].getBoundingClientRect();
      if(r.top<vh*0.9 && r.bottom>0){ left[i].classList.add('lm-in'); left.splice(i,1); }
    }
  }
  addEventListener('scroll',check,{passive:true}); addEventListener('resize',check,{passive:true});
  check();
})();

/* ── SVGの線を描く（ストローク） ──────────────
   .dw を持つ path/line を、画面に入ったら描き足す。 */
(function(){
  if(matchMedia('(prefers-reduced-motion:reduce)').matches) return;
  var ps=[].slice.call(document.querySelectorAll('.dw path,.dw line,.dw circle,.dw polyline'));
  if(!ps.length) return;
  ps.forEach(function(p){
    try{
      var L=p.getTotalLength?p.getTotalLength():0;
      if(!L) return;
      p.style.strokeDasharray=L; p.style.strokeDashoffset=L;
      p.style.transition='stroke-dashoffset 1.1s cubic-bezier(.22,.61,.36,1)';
    }catch(e){}
  });
  var left=ps.slice();
  function check(){
    var vh=innerHeight;
    for(var i=left.length-1;i>=0;i--){
      var el=left[i], r=el.getBoundingClientRect();
      if(r.top<vh*0.92 && r.bottom>0){
        el.style.transitionDelay=(i%5)*70+'ms';
        el.style.strokeDashoffset='0';
        left.splice(i,1);
      }
    }
  }
  addEventListener('scroll',check,{passive:true}); addEventListener('resize',check,{passive:true});
  setTimeout(check,120);
})();

/* ── 動画をその場で再生 ─────────────────────
   サムネイルを押したら YouTube の埋め込みに差し替える。
   最初から iframe を置くと読み込みが重く、外部に足跡も残るため押されてから作る。 */
(function(){
  document.querySelectorAll('[data-yt]').forEach(function(b){
    b.addEventListener('click',function(){
      var id=b.dataset.yt; if(!id||b.classList.contains('is-play')) return;
      var f=document.createElement('iframe');
      /* origin は http(s) のときだけ付ける。file:// だと origin=null になり
         YouTube が「エラー153」で再生を拒否する */
      var q='autoplay=1&rel=0&playsinline=1';
      if(location.protocol==='http:'||location.protocol==='https:') q+='&origin='+encodeURIComponent(location.origin);
      f.src='https://www.youtube-nocookie.com/embed/'+id+'?'+q;
      f.referrerPolicy='strict-origin-when-cross-origin';
      f.title=b.getAttribute('aria-label')||'';
      f.allow='accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture';
      f.setAttribute('allowfullscreen','');
      b.innerHTML=''; b.appendChild(f); b.classList.add('is-play');
      /* 埋め込みが拒否された場合の逃げ道（エラー153など）を必ず出す */
      var esc=document.createElement('a');
      esc.href='https://www.youtube.com/watch?v='+id;
      esc.target='_blank'; esc.rel='noopener';
      esc.className='gvb__esc'; esc.textContent='YouTubeで見る';
      b.parentNode.appendChild(esc);
    });
  });
})();


/* 固定ヘッダー：下スクロールで隠し、上スクロールで出す */
(function(){
  var h=document.querySelector('.hdr'); if(!h) return;
  function setH(){ document.documentElement.style.setProperty('--hdr-h', h.offsetHeight+'px'); }
  setH(); addEventListener('resize',setH,{passive:true});
  var last=0, ticking=false;
  function frame(){
    ticking=false;
    var y=window.pageYOffset||0;
    h.classList.toggle('is-stuck', y>4);
    last=y;
  }
  addEventListener('scroll',function(){ if(!ticking){ ticking=true; requestAnimationFrame(frame); } },{passive:true});
  frame();
})();

/* ── FV背景「成長の曲線」──────────────────────
   3枚をそれぞれ違う速さで下へ動かす（奥ほど遅い＝奥行き）。
   scrollY × speed の1次式のまま。加速させない。
   独自の背景を持つ最初のセクションの手前でクリップして消す。 */
(function(){
  var growth=document.getElementById('growth'); if(!growth) return;
  var reduce=matchMedia('(prefers-reduced-motion:reduce)').matches;
  var layers=[].slice.call(growth.querySelectorAll('.gl'));
  var stop=document.querySelector('.hbc') ?
           (document.querySelector('.hbc').closest('div')||{}).nextElementSibling : null;
  var ticking=false;
  function frame(){
    ticking=false;
    var y=window.pageYOffset||0;
    if(!reduce){
      layers.forEach(function(el){
        var sp=parseFloat(el.getAttribute('data-speed'))||0.3;
        el.style.transform='translate3d(0,'+(y*sp)+'px,0)';
      });
    }
    if(stop){
      var top=stop.getBoundingClientRect().top;
      growth.style.clipPath='inset(0 0 '+Math.max(0, innerHeight-top)+'px 0)';
    }
  }
  addEventListener('scroll',function(){ if(!ticking){ ticking=true; requestAnimationFrame(frame); } },{passive:true});
  addEventListener('resize',frame);
  frame();
  requestAnimationFrame(function(){ growth.classList.add('is-ready'); });
})();

/* ── 長文のドロップダウン ─────────────────────
   高さを実測してから animate するので、中身が変わっても滑らかに開く。
   JSが動かない場合は全文が出たまま（読めなくならない）。 */
(function(){
  var COLLAPSED = 128;                      /* たたんだときに見せる高さ(px) */
  document.querySelectorAll('.mbl__more').forEach(function(btn){
    var fold = btn.previousElementSibling;
    if(!fold || !fold.classList.contains('mbl__fold')) return;
    var full = fold.scrollHeight;
    if(full <= COLLAPSED + 40){ btn.style.display='none'; return; }   /* 短ければ畳まない */
    var open = false;
    fold.style.height = COLLAPSED + 'px';
    fold.dataset.folded = '1';
    var t = btn.querySelector('.mbl__more-t');
    function set(o){
      open = o;
      full = fold.firstElementChild.getBoundingClientRect().height;
      fold.style.height = (o ? full : COLLAPSED) + 'px';
      fold.dataset.folded = o ? '0' : '1';
      btn.setAttribute('aria-expanded', o ? 'true' : 'false');
      if(t) t.textContent = o ? (t.dataset.close || '閉じる') : (t.dataset.open || '続きを読む');
    }
    btn.addEventListener('click', function(){ set(!open); });
    addEventListener('resize', function(){ if(open) set(true); }, {passive:true});
  });
})();
"""


def build(kit_path, out_path):
    kit = json.load(open(kit_path, encoding="utf-8"))
    content = kit.get("content", {})
    if isinstance(content, str):                       # 別ファイル参照
        p = content if os.path.isabs(content) else os.path.join(os.path.dirname(kit_path), content)
        content = json.load(open(p, encoding="utf-8"))

    base_css = open(os.path.join(PARTS, "_base.css"), encoding="utf-8").read()
    tok_css = open(os.path.join(PARTS, "_tokens.css"), encoding="utf-8").read()

    css_chunks, html_chunks, used = [], [], []
    open_group = None
    for i, s in enumerate(kit["parts"]):
        pid = s["part"] if isinstance(s, dict) else s
        data = dict(content.get("_common", {}))
        if isinstance(s, dict):
            data.update(content.get(s.get("data", ""), {}))
            data.update(s.get("inline", {}))
        html, css, meta = load_part(pid)
        css_chunks.append(f"/* ===== {pid} ===== */\n{css}")
        body = render(html, data)
        # 同じ group の節はひとつの面でくくる（地と装飾を通しで共有する）
        grp = s.get("group") if isinstance(s, dict) else None
        if grp != open_group:
            if open_group is not None:
                html_chunks.append("</div>")
            if grp:
                gcls = [f'tone-{s.get("groupTone", "blob")}']
                gbg = ""
                if s.get("groupBg") == "growth":
                    gcls.append("bg-growth")
                    # グループは縦に長い。潰れないよう縦長の viewBox で引く
                    gbg = ('<span class="gbg" aria-hidden="true">'
                           '<svg viewBox="0 0 1440 2600" preserveAspectRatio="none">'
                           '<path class="b1" d="M-80 2560 C 420 2430, 980 1560, 1560 240"/>'
                           '<path class="b2" d="M-80 2700 C 460 2560, 1020 1760, 1560 520"/>'
                           '<path class="b3" d="M-80 2820 C 500 2700, 1060 2020, 1560 820"/>'
                           '</svg></span>')
                html_chunks.append(f'<div class="{" ".join(gcls)}">{gbg}')
            open_group = grp
        tone = None if grp else (s.get("tone") if isinstance(s, dict) else None)
        wave = s.get("wave") if isinstance(s, dict) else None   # "top" / "bottom" / "both"
        st = s.get("style") if isinstance(s, dict) else None
        hill = s.get("hill") if isinstance(s, dict) else None
        if tone or wave or st or hill:
            cls = [f"tone-{tone}"] if tone else []
            if hill == "top": cls.append("hill-top")
            if (s.get("bg") if isinstance(s, dict) else None) == "growth": cls.append("bg-growth")
            if wave in ("top", "both"): cls.append("wave-top")
            if wave in ("bottom", "both"): cls.append("wave-bottom")
            sattr = f' style="{st}"' if st else ""
            cattr = f' class="{" ".join(cls)}"' if cls else ""
            bg_svg = ('<span class="gbg" aria-hidden="true">'
                      '<svg viewBox="0 0 1440 900" preserveAspectRatio="none">'
                      '<path class="b1" d="M-80 1010 C 420 998, 980 760, 1560 300"/>'
                      '<path class="b2" d="M-80 1090 C 460 1074, 1020 826, 1560 424"/>'
                      '<path class="b3" d="M-80 1160 C 500 1146, 1060 960, 1560 560"/>'
                      '</svg></span>\n') if (s.get("bg") if isinstance(s, dict) else None) == "growth" else ""
            hill_svg = ('<span class="hill" aria-hidden="true">'
                        '<svg viewBox="0 0 1440 120" preserveAspectRatio="none">'
                        '<path d="M0 120 L0 78 C 78 18, 176 0, 286 16 '
                        'C 600 62, 1010 102, 1440 108 L1440 120 Z"/>'
                        '</svg></span>\n') if hill == "top" else ""
            body = f'<div{cattr}{sattr}>\n{hill_svg}{bg_svg}{body}\n</div>'
        # 節への飛び先。高さ0なので、どこに挟んでも見た目は変わらない
        anc = s.get("anchor") if isinstance(s, dict) else None
        if anc:
            body = f'<span class="anc" id="{anc}" aria-hidden="true"></span>\n' + body
        html_chunks.append(f"<!-- {pid} ({tone or 'base'}) -->\n" + body)
        used.append(f"{pid} ({meta.get('name', '')})")
    if open_group is not None:
        html_chunks.append("</div>")

    page = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="{kit.get('robots', 'noindex,nofollow')}">
<title>{kit.get('title', '')}</title>
<meta name="description" content="{kit.get('description', '')}">
{kit.get('head', '')}
<style>
{tok_css}
{tokens_css(kit.get('tokens'))}
{base_css}
{chr(10).join(css_chunks)}
</style>
</head>
<body>
<!-- FV背景「成長の曲線」。body直下・fixed で、スクロールについてくる -->
<div id="growth" aria-hidden="true">
  <div class="gl" data-speed="0.30">
    <svg viewBox="0 0 1440 1584" preserveAspectRatio="none">
      <path class="gr1" d="M-80 1182 C 420 1172, 980 992, 1560 552"/>
      <path class="gm1" d="M-120 1150 C 380 1130, 860 1060, 1560 960"/>
    </svg>
  </div>
  <div class="gl" data-speed="0.40">
    <svg viewBox="0 0 1440 1584" preserveAspectRatio="none">
      <path class="gr2" d="M-80 1252 C 460 1232, 1020 1042, 1560 662"/>
      <path class="gm2" d="M-120 1216 C 400 1200, 880 1140, 1560 1050"/>
    </svg>
  </div>
  <div class="gl" data-speed="0.52">
    <svg viewBox="0 0 1440 1584" preserveAspectRatio="none">
      <path class="gr3" d="M-80 1312 C 500 1297, 1060 1152, 1560 792"/>
    </svg>
  </div>
</div>
<header class="hdr">
  <a class="hdr__logo" href="#top" aria-label="ESL club"><img src="img/logo.svg" alt="ESL club"></a>
  <a class="btn btn--sm hdr__cta" href="https://eslclub.jp/trial/">無料体験レッスンはこちら</a>
</header>
{chr(10).join(html_chunks)}
<script>{RUNTIME_JS}</script>
</body>
</html>
"""
    os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
    open(out_path, "w", encoding="utf-8").write(page)
    print(f"→ {out_path}  ({len(page)//1024}KB)")
    for u in used:
        print("   ", u)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("kit")
    ap.add_argument("-o", "--out", required=True)
    a = ap.parse_args()
    build(a.kit, a.out)
