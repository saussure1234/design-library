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
    for i, s in enumerate(kit["parts"]):
        pid = s["part"] if isinstance(s, dict) else s
        data = dict(content.get("_common", {}))
        if isinstance(s, dict):
            data.update(content.get(s.get("data", ""), {}))
            data.update(s.get("inline", {}))
        html, css, meta = load_part(pid)
        css_chunks.append(f"/* ===== {pid} ===== */\n{css}")
        html_chunks.append(f"<!-- {pid} -->\n" + render(html, data))
        used.append(f"{pid} ({meta.get('name', '')})")

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
