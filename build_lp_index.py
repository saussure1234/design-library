#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lp-registry.json から LPの版一覧ページを生成する。

  python3 build_lp_index.py          … docs/lp/index.html を作る
  python3 build_lp_index.py --open   … 作ってブラウザで開く

★このページは noindex（検索避け）。リンクを知っている人だけが見る想定。
★台帳（lp-registry.json）が正。ページは毎回そこから作り直す。
  ページを直接編集しないこと。次の生成で消える。
"""
import json, os, subprocess, sys, html

R = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(R, "lp-registry.json")
OUT_DIR = os.path.join(R, "docs", "lp")
OUT = os.path.join(OUT_DIR, "index.html")

STATUS = {
    "live":   ("本番",   "#00B21F", "#f1fbf3"),
    "frozen": ("凍結",   "#94a3b8", "#f8fafc"),
    "review": ("確認用", "#f59e0b", "#fffbeb"),
    "draft":  ("未公開", "#cbd5e1", "#ffffff"),
}


def esc(s):
    return html.escape(str(s), quote=True)


def build_tree(versions):
    """parent を辿って表示順と深さを決める。親が先、子はその直後。"""
    by_id = {v["id"]: v for v in versions}
    children = {}
    roots = []
    for v in versions:
        p = v.get("parent")
        if p and p in by_id:
            children.setdefault(p, []).append(v)
        else:
            roots.append(v)
    order = []

    def walk(v, depth):
        order.append((v, depth))
        for c in children.get(v["id"], []):
            walk(c, depth + 1)

    for r in roots:
        walk(r, 0)
    # ツリーに載らなかったもの（親が別プロジェクトにいる等）は末尾に
    seen = {v["id"] for v, _ in order}
    for v in versions:
        if v["id"] not in seen:
            order.append((v, 0))
    return order


def render_version(v, depth, base, main_id):
    lab, col, bg = STATUS.get(v.get("status", "draft"), STATUS["draft"])
    url = base + v["id"] + "/"
    is_main = v["id"] == main_id
    merged = v.get("merged")
    alert = v.get("alert")
    fbs = v.get("fb") or []

    badge = f'<span class="badge" style="--c:{col}">{lab}</span>'
    main_badge = '<span class="badge badge--main">本線</span>' if is_main else ""
    merge_badge = ('<span class="merge merge--yes">本線に反映済</span>' if merged
                   else '<span class="merge merge--no">本線に未反映</span>')
    if v.get("status") == "draft":
        merge_badge = '<span class="merge merge--no">未公開</span>'
        link = f'<span class="link link--dead">{esc(v["id"])}/（未commit）</span>'
    else:
        link = f'<a class="link" href="{esc(url)}" target="_blank" rel="noopener">{esc(v["id"])}/ ↗</a>'

    fb_html = ""
    if fbs:
        items = "".join(
            f'<li><span class="fb-d">{esc(f.get("date",""))}</span>'
            f'<span class="fb-w">{esc(f.get("what",""))}</span></li>' for f in fbs)
        fb_html = f'<ul class="fb">{items}</ul>'

    alert_html = f'<p class="alert">{esc(alert)}</p>' if alert else ""
    parent = v.get("parent")
    parent_html = (f'<span class="from">← {esc(parent)} から</span>' if parent
                   else '<span class="from">← 初版</span>')

    return f'''<div class="node depth-{depth}" style="--bg:{bg};--c:{col}">
  <div class="node__head">{link}{badge}{main_badge}{merge_badge}</div>
  <div class="node__meta">{esc(v.get("date",""))}　{parent_html}</div>
  <p class="node__what">{esc(v.get("what",""))}</p>
  {fb_html}{alert_html}
</div>'''


def main():
    reg = json.load(open(REG, encoding="utf-8"))
    base = reg["base_url"]

    # 要対応：本線に未反映の確認用／用途不明／本線が古い
    todos = []
    for p in reg["projects"]:
        for v in p["versions"]:
            if v.get("alert"):
                todos.append((p["name"], v["id"], v["alert"]))

    proj_html = []
    for p in reg["projects"]:
        rows = "".join(render_version(v, d, base, p.get("main"))
                       for v, d in build_tree(p["versions"]))
        main_txt = (f'本線：<a href="{base}{p["main"]}/" target="_blank" rel="noopener">{p["main"]}/</a>'
                    if p.get("main") else '本線：未設定')
        proj_html.append(f'''<section class="proj">
  <h2>{esc(p["name"])}</h2>
  <p class="proj__meta">{esc(p.get("client",""))}　|　{main_txt}　|　{esc(p.get("note",""))}</p>
  <div class="tree">{rows}</div>
</section>''')

    todo_html = ""
    if todos:
        li = "".join(f'<li><b>{esc(pid)}</b>（{esc(name)}）… {esc(msg)}</li>'
                     for name, pid, msg in todos)
        todo_html = f'<section class="todo"><h2>要対応</h2><ul>{li}</ul></section>'

    doc = f'''<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- ★検索避け。リンクを知っている人だけが見る想定 -->
<meta name="robots" content="noindex,nofollow,noarchive">
<title>LP 版管理</title>
<style>
*{{box-sizing:border-box;margin:0}}
body{{font-family:"Hiragino Sans","Yu Gothic",Meiryo,sans-serif;background:#f6f7f9;color:#1f2937;
  line-height:1.7;padding:32px 20px 80px}}
.wrap{{max-width:960px;margin:0 auto}}
h1{{font-size:23px}}
.sub{{font-size:13px;color:#6b7280;margin:4px 0 26px}}
.rules{{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 18px;font-size:13px;margin-bottom:26px}}
.rules b{{display:block;margin-bottom:4px;font-size:13.5px}}
.rules li{{margin-left:18px}}
.proj{{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:20px 22px;margin-bottom:20px}}
.proj h2{{font-size:18px}}
.proj__meta{{font-size:12.5px;color:#6b7280;margin:2px 0 16px}}
.tree{{display:flex;flex-direction:column;gap:9px}}
.node{{border:1px solid #e5e7eb;border-left:4px solid var(--c);background:var(--bg);
  border-radius:8px;padding:10px 14px}}
.depth-1{{margin-left:34px}} .depth-2{{margin-left:68px}} .depth-3{{margin-left:102px}}
.node__head{{display:flex;align-items:center;gap:8px;flex-wrap:wrap}}
.link{{font-weight:800;font-size:15px;color:#0b64c8;text-decoration:none}}
.link:hover{{text-decoration:underline}}
.link--dead{{color:#9ca3af;font-weight:700;font-size:15px}}
.badge{{font-size:11px;font-weight:800;color:#fff;background:var(--c);
  border-radius:999px;padding:2px 9px}}
.badge--main{{background:#111827}}
.merge{{font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px;border:1px solid}}
.merge--yes{{color:#047a20;border-color:#a7e0b5;background:#f1fbf3}}
.merge--no{{color:#b91c1c;border-color:#fecaca;background:#fef2f2}}
.node__meta{{font-size:11.5px;color:#6b7280;margin-top:3px}}
.from{{color:#9ca3af}}
.node__what{{font-size:13.5px;margin-top:5px}}
.fb{{margin:7px 0 0 0;list-style:none;font-size:12.5px}}
.fb li{{background:#fff;border:1px dashed #d1d5db;border-radius:6px;padding:4px 9px;margin-top:4px}}
.fb-d{{color:#6b7280;margin-right:8px}}
.alert{{margin-top:7px;font-size:12.5px;color:#b91c1c;background:#fef2f2;
  border-left:3px solid #dc2626;border-radius:0 6px 6px 0;padding:6px 10px}}
.todo{{background:#fff;border:1px solid #fecaca;border-radius:12px;padding:18px 22px}}
.todo h2{{font-size:17px;color:#b91c1c}}
.todo li{{margin-left:18px;font-size:13.5px;margin-top:6px}}
@media(max-width:640px){{
  .depth-1,.depth-2,.depth-3{{margin-left:14px}}
}}
</style>
</head>
<body><div class="wrap">
<h1>LP 版管理</h1>
<p class="sub">更新 {esc(reg.get("updated",""))}　|　台帳 <code>lp-registry.json</code> から自動生成（このページは直接編集しない）</p>

<div class="rules"><b>運用ルール</b>
<ol>
<li>FBが来たら<b>直す前に</b>台帳へ1行足す</li>
<li>新しいリンクを作ったら<b>必ず派生元を書く</b></li>
<li><b>完了＝本線に取り込まれた状態</b>。確認用リンクの完成は完了ではない</li>
<li>作業は git の <code>docs/</code> 配下で行う。Desktopの複製フォルダを正にしない</li>
</ol></div>

{todo_html}
{"".join(proj_html)}
</div></body></html>'''

    os.makedirs(OUT_DIR, exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(doc)
    n = sum(len(p["versions"]) for p in reg["projects"])
    print(f"  生成: docs/lp/index.html（{len(reg['projects'])}案件 / {n}版 / 要対応 {len(todos)}件）")
    if "--open" in sys.argv:
        subprocess.run(["open", OUT])


if __name__ == "__main__":
    main()
