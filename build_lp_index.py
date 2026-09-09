#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lp-registry.json / video-registry.json / lp-flow.json から版管理ツールを生成する。

  python3 build_lp_index.py          … docs/lp/index.html を作る
  python3 build_lp_index.py --open   … 作ってブラウザで開く

★画面の作り
    左： LP案件 ／ 動画案件 ／ しくみ（LP制作フロー / Claudeスキル）
    右： 案件 → 版一覧・派生図・FB履歴
         しくみ → フローの各ステップと、そこで動くスキル・過去の事故

★LPと動画は【同じリンク・別タブ】。ページは1枚（docs/lp/index.html）で、
  台帳だけ2つに分かれている（lpv.py が LP、vv.py が動画を触る）。
  動画の実体（mp4・ポスター・再生ページ）は docs/video/<版id>/ にあり、
  この画面からは相対リンク ../video/<版id>/ で開く。

★台帳が正。ページは毎回そこから作り直す。生成物を直接編集しないこと。次の生成で消える。
★スキル一覧は ~/.claude/skills/*/SKILL.md の frontmatter から拾う。
  拾うのは name / description / user-invocable だけ。本文は載せない
  （このリポジトリは公開なので、案件の中身を書き出さない）。
★このページは noindex（検索避け）。リンクを知っている人だけが見る想定。
"""
import json, os, re, subprocess, sys

R = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(R, "lp-registry.json")
VREG = os.path.join(R, "video-registry.json")
FLOW = os.path.join(R, "lp-flow.json")
SKILLS_DIR = os.path.expanduser("~/.claude/skills")
OUT_DIR = os.path.join(R, "docs", "lp")
OUT = os.path.join(OUT_DIR, "index.html")


def blocklist():
    """公開してはいけない語（顧客名など）。git管理外の .publish-blocklist に置く。"""
    f = os.path.join(R, ".publish-blocklist")
    if not os.path.exists(f):
        print("  ▲ .publish-blocklist が無い。顧客名の検査をしていない")
        return []
    return [l.strip() for l in open(f, encoding="utf-8")
            if l.strip() and not l.startswith("#")]


def scan_block(d, words):
    """フォルダ配下に禁止語が入っているか。入っていれば (ファイル, 語) を返す。"""
    hit = []
    for root, _, fs in os.walk(d):
        for fn in fs:
            p = os.path.join(root, fn)
            try:
                t = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for w in words:
                if w in t:
                    hit.append((os.path.relpath(p, d), w))
    return hit


def read_skills(pack=True):
    """~/.claude/skills から name / description / user-invocable だけ拾う。

    自作スキル（user-invocable: true）は【1本の zip にまとめて】配る。
    ★スキルごとにボタンを置くと、工程の詳細にまで出てきて煩い。入手口は1つでいい。
    ★禁止語を1語でも含むものは束から外す。公開リポなので取り返しがつかない。
    """
    import shutil, zipfile
    out, words, ok = [], blocklist(), []
    zdir = os.path.join(OUT_DIR, "skills")
    if not os.path.isdir(SKILLS_DIR):
        return out, None
    for n in sorted(os.listdir(SKILLS_DIR)):
        d = os.path.join(SKILLS_DIR, n)
        f = os.path.join(d, "SKILL.md")
        if not os.path.isfile(f):
            continue
        m = re.match(r"---\n(.*?)\n---", open(f, encoding="utf-8").read(), re.S)
        fm = m.group(1) if m else ""
        g = lambda k: (re.search(rf"^{k}:\s*(.+)$", fm, re.M) or [None, ""])[1].strip().strip('"')
        s = {"id": n, "name": g("name") or n, "desc": g("description"),
             "mine": g("user-invocable") == "true", "blocked": 0}
        if pack and s["mine"]:
            hit = scan_block(d, words)
            if hit:
                s["blocked"] = len(hit)
                print(f"  ▲ {n}: 禁止語を含むので束に入れない → " +
                      ", ".join(f"{a}:「{b}」" for a, b in hit[:4]))
            else:
                ok.append((n, d))
        out.append(s)

    bundle = None
    if pack and ok:
        if os.path.isdir(zdir):
            shutil.rmtree(zdir)          # 古い個別zipを残さない
        os.makedirs(zdir, exist_ok=True)
        zp = os.path.join(zdir, "lp-skills.zip")
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for n, d in ok:
                for root, _, fs in os.walk(d):
                    for fn in fs:
                        p = os.path.join(root, fn)
                        z.write(p, os.path.join(n, os.path.relpath(p, d)))
        bundle = {"path": "skills/lp-skills.zip", "n": len(ok),
                  "kb": round(os.path.getsize(zp) / 1024),
                  "ids": [n for n, _ in ok]}
    return out, bundle

CSS = """
/* ── 雰囲気テンプレの画面 ───────────────────────── */
.tb{border-collapse:collapse;width:100%;margin:0 0 22px;font-size:12.5px;line-height:1.6}
.tb th,.tb td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.tb th{color:var(--live);font-weight:800;white-space:nowrap;background:rgba(0,0,0,.02)}
.tb td.k{color:var(--live);font-weight:800;white-space:nowrap;width:120px}
.tb code{font-size:11.5px}
.mh{font-size:15px;margin:34px 0 4px;padding-top:20px;border-top:2px solid var(--line)}
.mh .cl{font-size:12px;font-weight:400}
.ul{margin:6px 0 20px;padding-left:20px;font-size:12.5px;line-height:1.85}
.ul.bad li{color:var(--bad,#b4342a)}

*{box-sizing:border-box;margin:0}
:root{
  --bg:#f5f6f8; --panel:#fff; --line:#e3e6ea; --ink:#1f2937; --mute:#6b7280;
  --live:#00B21F; --frozen:#94a3b8; --review:#f59e0b; --draft:#cbd5e1; --bad:#dc2626;
}
html,body{height:100%}
body{font-family:"Hiragino Sans","Yu Gothic",Meiryo,sans-serif;background:var(--bg);
  color:var(--ink);line-height:1.65;font-size:14px}
.app{display:flex;min-height:100vh}

/* ── 左：サイドバー ─────────────────────────── */
.side{width:248px;flex:none;background:#111827;color:#e5e7eb;padding:20px 0;
  position:sticky;top:0;height:100vh;overflow:auto}
.side h1{font-size:15px;padding:0 18px 14px;border-bottom:1px solid #263041;color:#fff}
.side .cap{font-size:10.5px;letter-spacing:.14em;color:#7d8797;padding:16px 18px 6px}
.side a{display:block;padding:9px 18px;color:#cbd5e1;text-decoration:none;font-size:13.5px;
  border-left:3px solid transparent;cursor:pointer}
.side a:hover{background:#1b2433;color:#fff}
.side a.on{background:#1b2433;color:#fff;border-left-color:var(--live);font-weight:700}
.side .n{float:right;font-size:11px;background:#374151;border-radius:999px;padding:1px 8px;color:#e5e7eb}
.side .n.bad{background:var(--bad);color:#fff}
.side .foot{font-size:11px;color:#6b7280;padding:18px;border-top:1px solid #263041;margin-top:14px}

/* ── 右：本体 ──────────────────────────────── */
.main{flex:1;min-width:0;padding:22px 26px 70px}
.head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap}
.head h2{font-size:20px}
.head .cl{font-size:12.5px;color:var(--mute)}
.head .mainlink{font-size:12.5px}
.note{font-size:12.5px;color:var(--mute);margin-top:2px}
.tabs{display:flex;gap:4px;margin:18px 0 0;border-bottom:2px solid var(--line)}
.tabs button{border:0;background:none;font:inherit;font-size:13.5px;padding:9px 16px;
  cursor:pointer;color:var(--mute);border-bottom:2px solid transparent;margin-bottom:-2px}
.tabs button.on{color:var(--ink);font-weight:800;border-bottom-color:var(--live)}
.pane{background:var(--panel);border:1px solid var(--line);border-top:0;
  border-radius:0 0 10px 10px;padding:18px}

/* 版一覧の表 */
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;font-size:11.5px;color:var(--mute);font-weight:700;
  padding:6px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid #f0f2f4;vertical-align:top}
tr:hover td{background:#fafbfc}
.lk{font-weight:800;color:#0b64c8;text-decoration:none}
.lk:hover{text-decoration:underline}
.lk.dead{color:#9ca3af}
.pill{display:inline-block;font-size:10.5px;font-weight:800;color:#fff;
  border-radius:999px;padding:1px 8px;white-space:nowrap}
.mg{display:inline-block;font-size:10.5px;font-weight:700;border-radius:999px;
  padding:1px 8px;border:1px solid;white-space:nowrap}
.mg.y{color:#047a20;border-color:#a7e0b5;background:#f1fbf3}
.mg.n{color:#b91c1c;border-color:#fecaca;background:#fef2f2}
.warn{color:#b91c1c;font-size:12px;margin-top:4px}
.mainmark{background:#111827;color:#fff;font-size:10px;border-radius:3px;padding:1px 5px;margin-left:5px}

/* 動画の版一覧＝サムネイルの札。動画は見出しだけでは区別がつかない。
   ★一覧に <video> は置かない。開いた瞬間に全件読みに行って数十MB落ちる。
     静止画だけ出して、再生は版ごとのページ（docs/video/<id>/）へ送る。 */
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(268px,1fr));gap:16px}
.card{border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fff;
  display:flex;flex-direction:column;border-top:4px solid var(--c)}
.card .th{position:relative;display:block;aspect-ratio:16/9;background:#111;
  text-decoration:none;overflow:hidden}
.card .th img{width:100%;height:100%;object-fit:cover;display:block}
.card .th .play{position:absolute;inset:0;display:grid;place-items:center;
  color:#fff;font-size:34px;text-shadow:0 2px 10px rgba(0,0,0,.6);opacity:.9}
.card .th .len{position:absolute;right:7px;bottom:6px;background:rgba(0,0,0,.72);
  color:#fff;font-size:11px;font-weight:700;border-radius:4px;padding:1px 6px}
.card .th.none{display:grid;place-items:center;background:#e5e7eb;color:#9ca3af;font-size:12px}
.card .bd{padding:11px 13px 13px;flex:1}
.card .t{font-size:13.5px;font-weight:800}
.card .d{font-size:10.5px;color:var(--mute);margin-top:1px}
.card .w{font-size:12.5px;margin-top:6px}
.card .ft{font-size:11px;color:var(--mute);margin-top:7px;display:flex;
  gap:8px;flex-wrap:wrap;align-items:center}

/* 構成シート＝1本を Hook/Body1/Body2/CTA の4枠で横に並べて、版どうしを縦に比べる。
   ★これは表。カードで並べると「同じ枠の文面どうし」が縦に揃わず、比べられなくなる。
   ★横に長いので、版の列だけ固定して中身を横スクロールさせる。 */
.sheetwrap{overflow-x:auto;border:1px solid var(--line);border-radius:9px;background:#fff}
table.sheet{border-collapse:separate;border-spacing:0;font-size:12.5px;min-width:1080px}
table.sheet th,table.sheet td{border-bottom:1px solid #eef0f3;border-right:1px solid #f2f4f6;
  padding:8px 10px;vertical-align:top}
table.sheet thead th{position:sticky;top:0;z-index:3;background:#f8fafc;font-size:11.5px;
  color:var(--mute);white-space:nowrap;border-bottom:2px solid var(--line)}
table.sheet .vcol{position:sticky;left:0;z-index:2;background:#fff;width:150px;min-width:150px}
table.sheet thead .vcol{z-index:4;background:#f8fafc}
table.sheet tr:hover td{background:#fbfcfd}
table.sheet tr:hover .vcol{background:#fbfcfd}
.sheet .sec{width:238px;min-width:238px}
/* 動画列。押すまでは静止画だけ（勝手に読み込ませない） */
.sheet .play{width:250px;min-width:250px}
.sheet thead th.play{text-align:left}
.vbox{position:relative;width:100%;aspect-ratio:16/9;border-radius:6px;overflow:hidden;
  background:#0d1117;cursor:pointer}
.vbox img,.vbox video{width:100%;height:100%;object-fit:cover;display:block}
.vbox video{cursor:auto;object-fit:contain;background:#000}
.vbox .pbtn{position:absolute;inset:0;display:grid;place-items:center;color:#fff;
  font-size:30px;text-shadow:0 2px 12px rgba(0,0,0,.65);opacity:.92}
.vbox:hover .pbtn{opacity:1;transform:scale(1.08);transition:.15s}
.vbox .plen{position:absolute;right:6px;bottom:5px;background:rgba(0,0,0,.72);color:#fff;
  font-size:11px;font-weight:700;border-radius:4px;padding:1px 6px}
.sheet .sm{width:96px;min-width:96px}
.sheet .av{width:172px;min-width:172px}
.sheet .th{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:5px;
  background:#eef0f3;margin-bottom:6px}
/* 素材の落とし口。サムネ自体は押せない（意図せず数MB落とさないため） */
.thw{position:relative}
a.dl{position:absolute;right:4px;top:4px;background:rgba(8,12,18,.78);color:#fff;
  font-size:10px;font-weight:700;line-height:1;border-radius:4px;padding:3px 6px;
  text-decoration:none;opacity:.55;transition:.12s}
.thw:hover a.dl{opacity:1;background:#111827}
a.dl:hover{transform:translateY(-1px)}
.vdl{font-size:11px;color:var(--mute);margin-top:6px;position:relative;padding-right:52px}
.vdl a.dl{position:absolute;right:0;top:-2px;opacity:.75}
.sheet .noimg{display:grid;place-items:center;width:100%;aspect-ratio:16/9;border-radius:5px;
  background:#f3f5f7;color:#aab1ba;font-size:11px;margin-bottom:6px;
  border:1px dashed #dfe3e8}
.sheet .tx{line-height:1.55}
.sheet .ch{color:var(--mute);font-size:11px;margin-top:3px}
.sheet .ch b{color:var(--ink)}
.sheet .chain{margin-top:6px;display:flex;gap:3px;flex-wrap:wrap}
.sheet .sh{font-size:10px;border-radius:4px;padding:1px 6px;white-space:nowrap;
  border:1px solid #dfe3e8;color:#5b636d;background:#f8fafc}
.sheet .sh.img{background:#eef7f1;border-color:#bfe3cc;color:#1f7a44}
.sheet .rule{color:#78350f;background:#fffbeb;border-left:3px solid var(--review);
  border-radius:0 6px 6px 0;padding:7px 9px;font-size:11.5px;line-height:1.55}
.sheet .avpair{display:flex;gap:6px}
.sheet .avpair figure{margin:0;flex:1}
.sheet .avpair figcaption{font-size:10px;color:var(--mute);text-align:center;margin-top:2px}
.sheet .logo{display:block;width:100%;border-radius:4px;background:#fff;
  border:1px solid #eef0f3;padding:6px}
.sheet .vid{font-weight:800;font-size:13px}
.sheet .vmeta{font-size:10.5px;color:var(--mute);margin-top:2px}
.sheet tr.planned .tx{color:#4b5563}
.sheet .todo-pill{display:inline-block;font-size:10px;font-weight:800;border-radius:999px;
  padding:1px 7px;background:#eef2f7;border:1px solid #dbe2ea;color:#5b636d;margin-top:3px}
.sheet tr.tmpl td{background:#fffdf5}
.sheet tr.tmpl:hover td,.sheet tr.tmpl:hover .vcol{background:#fffaeb}
.sheet tr.tmpl .vcol{background:#fffdf5}

/* 派生図 */
.graph{position:relative;overflow-x:auto;padding:8px 4px 4px}
.gcanvas{position:relative;z-index:1}
/* ★節は絶対配置。縦位置は graphPane が計算する（列の頭から詰めない）。
   高さを固定しているのは、段の間隔と衝突させないため。 */
.gnode{position:absolute;width:212px;height:100px;overflow:hidden;
  border:1px solid var(--line);border-left:4px solid var(--c);
  background:var(--b);border-radius:8px;padding:9px 11px}
.gnode .t{font-weight:800;font-size:13.5px}
.gnode .d{font-size:10.5px;color:var(--mute)}
.gnode .w{font-size:11.5px;margin-top:4px;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.gnode .ext{font-size:10.5px;color:#0b64c8;margin-top:2px}
.gnode.hasext .w{-webkit-line-clamp:1}   /* 由来の1行が増えるぶん本文を1行に */
.gsvg{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}

/* FB履歴 */
.fbrow{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:10px 4px;
  border-bottom:1px solid #f0f2f4}
.fbrow .dt{font-size:12px;color:var(--mute)}
.fbrow .wh{font-size:13.5px}
.fbrow .to{font-size:11.5px;color:var(--mute);margin-top:2px}

/* LP制作フロー ─ 派生図と同じ描き方（節＋SVGの線）*/
.fbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:12.5px}
.fleg{color:var(--mute);font-size:11.5px}
.fleg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 5px 0 14px}
.fleg i.ok{background:var(--live)} .fleg i.miss{background:var(--bad)}
.fleg i.none{background:var(--review)}

.fgraph{position:relative;overflow-x:auto;padding:6px 4px 10px;margin-top:14px}
.fcanvas{position:relative;z-index:1}
.fsvg{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}
.fgl{position:absolute;top:0;width:252px;border-bottom:2px solid #111827;padding-bottom:6px}
.fgt{font-size:13px;font-weight:800}
.fgt span{font-weight:400;font-size:11px;color:var(--mute);margin-left:7px}
.fgs{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px}
.fgs .sk{font-size:10px;padding:2px 7px}

.fnode{position:absolute;width:252px;height:44px;display:flex;align-items:center;gap:9px;
  background:#fff;border:1px solid var(--line);border-left:5px solid var(--live);
  border-radius:9px;padding:0 12px;cursor:pointer}
.fnode.miss{border-left-color:var(--bad)}
.fnode.none{border-left-color:var(--review)}
.fnode:hover{border-color:#94a3b8;box-shadow:0 1px 6px rgba(0,0,0,.07)}
.fnode.on{background:#111827;border-color:#111827}
.fnode.on .fnm{color:#fff}
.fnode.on .fno{background:#fff;color:#111827}
.fnm{font-size:13px;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fno{width:22px;height:22px;flex:none;border-radius:50%;background:#111827;color:#fff;
  font-size:11.5px;font-weight:800;display:grid;place-items:center}

.fdp{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px;
  margin-top:16px;min-height:64px}
.fdph{color:var(--mute);font-size:12.5px}
.fdh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fdh h3{font-size:15px}
.fdw{font-size:13px;margin:7px 0 8px}
.fm{font-size:12px;color:var(--mute);margin-bottom:3px}
.fm i{font-style:normal;font-weight:700;margin-right:7px;color:#9ca3af}

.frisk,.fgap{font-size:12.5px;margin-top:8px;padding:8px 11px;border-radius:0 7px 7px 0;line-height:1.6}
.frisk{background:#fef2f2;border-left:3px solid var(--bad);color:#7f1d1d}
.fgap{background:#fffbeb;border-left:3px solid var(--review);color:#78350f}
.frisk b,.fgap b{display:block;font-size:11px;letter-spacing:.06em;margin-bottom:2px}
.sk{font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;border:1px solid}
.sk.have{background:#f1fbf3;border-color:#a7e0b5;color:#047a20}
.sk.miss{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
.sk.none{background:#f8fafc;border-color:var(--line);color:#9ca3af}
.sd{color:var(--mute);font-size:12px}
tr.rmiss{background:#fef2f2}
.ghd{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:22px 0 8px;
  padding-bottom:6px;border-bottom:2px solid #111827}
.ghd h3{font-size:16px}
.ghd span{font-size:12px;color:var(--mute)}
.ghdb{margin-left:auto}
.dlb{font-size:12px;font-weight:800;text-decoration:none;border-radius:7px;
  padding:6px 14px;background:#111827;color:#fff;white-space:nowrap}
.dlb:hover{background:#374151}

.upd{font-size:11.5px;color:var(--mute);margin-top:4px;
  border-left:2px solid var(--line);padding-left:8px}
.upd ul{margin:2px 0 0 14px}
.glo{margin-top:14px;border:1px solid var(--line);border-radius:9px;background:#fafbfc}
.glo summary{cursor:pointer;font-size:12.5px;font-weight:700;padding:9px 14px;color:var(--mute)}
.glo summary:hover{color:var(--ink)}
.glo dl{display:grid;grid-template-columns:88px 1fr;gap:5px 14px;padding:2px 16px 14px;font-size:12.5px}
.glo dt{font-weight:800}
.glo dd{color:var(--mute)}

.todo{background:#fff;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:16px}
.todo h3{font-size:14px;color:#b91c1c;margin-bottom:6px}
.todo li{margin-left:18px;font-size:13px;margin-top:4px}
.rules{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px;font-size:12.5px}
/* 見出しの b だけ block にする。li の中の b まで block にすると箇条書きが崩れる */
.rules>b{display:block;margin-bottom:4px}
.rules li{margin-left:18px}
@media(max-width:820px){
  .app{flex-direction:column}
  .side{width:auto;height:auto;position:static}
  .main{padding:16px}
  /* 幅が足りないのでブラケットは畳み、担当スキルを箱の中に出す */
  .lane{grid-template-columns:1fr}
  .brk{display:none}
  .skm{display:inline}
  .lnk{margin-left:calc(50% - 1px)}
}
"""

JS = """
// ★状態は3つ。shown（クライアントに見せた）になったリンクはそこで凍る。
//   以降の直しは自動で新しいリンクへ逃がす（lpv.py / vv.py update がやる）。
const S={shown:['クライアントに提示','var(--live)','#f1fbf3'],
         internal:['自分の確認用','var(--review)','#fffbeb'],
         draft:['未公開','var(--draft)','#fff']};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ★LPと動画は【同じリンク・別タブ】。画面は1枚、台帳は2つ（lp-registry / video-registry）。
//   版の探し方（親の解決・リンクの組み立て）が台帳ごとに違うので、台帳ごとに小さな箱を作り、
//   描画側は箱を渡されればどちらでも同じ関数で描けるようにしてある。
function mkreg(reg,kind){
  const ALL={}, OWNER={};
  (reg.projects||[]).forEach(p=>p.versions.forEach(v=>{ALL[v.id]=v;OWNER[v.id]=p;}));
  // 版は design-library の下にあるとは限らない（別リポ・別ドメインに出す案件がある）。
  // 台帳に url があればそれを使う。無い時だけ組み立てる。
  // 動画は mp4 とポスターが docs/video/<id>/ にあるので【相対】で指す。
  // 絶対URLにすると、手元で開いた時にサムネイルが出ない。
  const url = kind==='vid'
    ? id=>{const v=ALL[id];return (v&&v.url)||'../video/'+id+'/';}
    : id=>{const v=ALL[id];return (v&&v.url)||reg.base_url+id+'/';};
  return {kind,reg,ALL,OWNER,url};
}
const MOODS=DATA.moods||null;
const LP=mkreg(DATA,'lp');
const VID=(DATA.videos&&(DATA.videos.projects||[]).length)?mkreg(DATA.videos,'vid'):null;

// cur は "lp:<案件id>" / "vid:<案件id>" / "__flow__"。
// ★LPと動画で案件idがぶつかっても混ざらないよう、頭に台帳の種別を付けている。
let cur='lp:'+DATA.projects[0].id, tab='graph';   // 最初に見たいのは系統。表は後

// ★開いている場所を URL に持たせる。
//   これが無いと、リロードのたびに先頭のLP案件へ戻される（毎回やり直しで面倒）。
//   ついでにリンクを送れば相手も同じ場所が開く。
const TABS=['sheet','list','graph','fb'];
function exists(id){
  if(id==='__flow__'||id==='__moods__') return true;
  const kind=id.slice(0,4)==='vid:'?VID:LP, pid=id.slice(id.indexOf(':')+1);
  return !!(kind && kind.reg.projects.some(p=>p.id===pid));
}
function readHash(){
  const h=decodeURIComponent((location.hash||'').replace(/^#/,''));
  if(!h) return false;
  const i=h.lastIndexOf('/');
  const id=i<0?h:h.slice(0,i), tb=i<0?'':h.slice(i+1);
  if(!exists(id)) return false;
  cur=id;
  // タブは「その画面に在るもの」だけ。無ければ既定に落とす
  const okTabs = (id==='__flow__'||id==='__moods__') ? [] : (id.slice(0,4)==='vid:'?TABS:TABS.filter(x=>x!=='sheet'));
  tab = okTabs.includes(tb) ? tb : (id.slice(0,4)==='vid:'?'sheet':'graph');
  return true;
}
function writeHash(){
  const h = (cur==='__flow__'||cur==='__moods__') ? cur : cur+'/'+tab;
  if(decodeURIComponent((location.hash||'').replace(/^#/,''))!==h)
    history.replaceState(null,'','#'+encodeURIComponent(h));
}
const RG=()=>cur.slice(0,4)==='vid:'?VID:LP;
const PID=()=>cur.slice(cur.indexOf(':')+1);
// フッタの「更新」は2つの台帳の新しいほう。LPの日付だけ出すと、動画だけ更新した日に嘘になる
const UPDATED=[DATA.updated, VID&&VID.reg.updated].filter(Boolean).sort().pop();

function alerts(p){return p.versions.filter(v=>v.alert);}
const mmss=s=>{s=Math.round(s||0);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const mbs=b=>(b?(b/1e6).toFixed(1)+'MB':'');
const vsec=p=>p.versions.reduce((x,v)=>x+((v.media&&v.media.duration)||0),0);

const SK={}; (DATA.skills||[]).forEach(s=>SK[s.id]=s);
const STEPS=(DATA.flow&&DATA.flow.steps)||[];
// フローが呼んでいるのに実物が無いスキル＝次に作るもの
const MISSING=[...new Set(STEPS.filter(s=>s.skill&&!SK[s.skill]).map(s=>s.skill))];

// ── 雰囲気テンプレ ─────────────────────────────────────
// ★実物（HTML・スクショ）はここに置かない。このページは公開なので、
//   載せるのは仕様の数字だけ。実物は手元の localhost からだけ開ける。
function moodsPane(){
  const M=MOODS, T=M.types;
  const cmp=`<table class="tb"><tr><th></th>${T.map(t=>`<th>${esc(t.name)}</th>`).join('')}</tr>
    <tr><td class="k">向く案件</td>${T.map(t=>`<td>${esc(t.note)}</td>`).join('')}</tr>
    <tr><td class="k">節数</td>${T.map(t=>`<td>${t.sections}</td>`).join('')}</tr>
    <tr><td class="k">必要な画像</td>${T.map(t=>`<td><b>${t.images}枚</b></td>`).join('')}</tr>
    <tr><td class="k">見出し</td>${T.map(t=>`<td>${esc(t.h1)}</td>`).join('')}</tr>
    <tr><td class="k">写真の扱い</td>${T.map(t=>`<td>${esc(t.photo)}</td>`).join('')}</tr>
    <tr><td class="k">手元の場所</td>${T.map(t=>`<td><code>${esc(t.path)}</code></td>`).join('')}</tr></table>`;

  const blocks = T.map(t=>{
    const moods=`<table class="tb"><tr><th>雰囲気</th><th>言葉</th><th>見出しの書体</th>
      <th>h1</th><th>h2/太さ</th><th>余白</th><th>角丸</th><th>桁</th></tr>
      ${t.moods.map(m=>`<tr><td><b>${esc(m.name)}</b></td><td>${esc(m.words)}</td>
        <td>${esc(m.head)}</td><td>${m.h1}</td><td>${esc(String(m.h2))}</td>
        <td>${esc(String(m.pad))}</td><td>${esc(m.radius)}</td><td>${esc(m.cols)}</td></tr>`).join('')}</table>`;
    const copy=`<table class="tb"><tr><th>場所</th><th>級数</th><th>字数</th><th>個数</th></tr>
      ${t.copy.map(c=>`<tr><td>${esc(c.place)}</td><td>${esc(c.size)}</td>
        <td>${esc(c.chars)}</td><td>${c.count}</td></tr>`).join('')}</table>`;
    const asset=`<table class="tb"><tr><th>場所</th><th>枚数</th><th>条件</th></tr>
      ${t.assets.map(a=>`<tr><td>${esc(a.place)}</td><td>${a.n}</td><td>${esc(a.cond)}</td></tr>`).join('')}</table>`;
    return `<h3 class="mh">${esc(t.name)}　<span class="cl">${esc(t.note)}</span></h3>
      <p class="note">雰囲気の振り分け</p>${moods}
      <p class="note">受け入れ仕様 ── 文字（工程6でコピーを書くときの上限）</p>${copy}
      <p class="note">受け入れ仕様 ── 画像</p>${asset}
      <p class="note"><a href="${esc(t.url)}" target="_blank">手元で開く → ${esc(t.url)}</a></p>`;
  }).join('');

  return `<div class="head"><h2>雰囲気テンプレ</h2>
      <span class="cl">選ぶ基準は業種ではなく「素材が何枚あるか」</span></div>
    <p class="note">実物は手元の <code>${esc(M.local.root)}</code> にある。
      このページは公開なので、載せているのは仕様の数字だけ。<br>
      見るには <code>${esc(M.local.serve)}</code> を叩いてから、下のリンクを開く。</p>
    ${cmp}
    ${blocks}
    <h3 class="mh">守ること</h3>
    <ul class="ul">${M.rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
    <h3 class="mh">まだやっていないこと</h3>
    <ul class="ul bad">${M.gaps.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>`;
}

function sidebar(){
  const tot=DATA.projects.reduce((a,p)=>a+alerts(p).length,0)
    +(VID?VID.reg.projects.reduce((a,p)=>a+alerts(p).length,0):0);
  const gaps=STEPS.filter(s=>s.gap).length;
  const row=(k,p)=>{const n=alerts(p).length, id=k+':'+p.id;
    return `<a data-p="${id}" class="${id===cur?'on':''}">${esc(p.name)}
      <span class="n ${n?'bad':''}">${n||p.versions.length}</span></a>`;};
  return `<h1>版管理</h1>
  <div class="cap">LP</div>
  ${DATA.projects.map(p=>row('lp',p)).join('')}
  ${VID?`<div class="cap">動画</div>
    ${VID.reg.projects.map(p=>row('vid',p)).join('')}`:''}
  <div class="cap">しくみ</div>
  <a data-p="__flow__" class="${cur==='__flow__'?'on':''}">LP制作フローとスキル
    <span class="n ${gaps||MISSING.length?'bad':''}">${gaps?gaps+'欠':STEPS.length}</span></a>
  ${MOODS?`<a data-p="__moods__" class="${cur==='__moods__'?'on':''}">雰囲気テンプレ
    <span class="n">${MOODS.types.length}</span></a>`:''}
  <div class="foot">要対応 ${tot} 件<br>更新 ${esc(UPDATED)}<br>
  台帳 lp-registry.json${VID?'<br>　　 video-registry.json':''}</div>`;
}

/* ── LP制作フロー ───────────────────────────────────────── */
function skillTag(id){
  if(!id)return '<span class="sk none">スキルなし</span>';
  if(!SK[id])return `<span class="sk miss">${esc(id)}／未作成</span>`;
  return `<span class="sk have">${esc(id)}</span>`;
}
// ★入手口は1つだけ。スキルごとにボタンを置くと工程の詳細にまで出てきて煩い。
function dlAll(){
  const b=DATA.bundle;
  if(!b)return '';
  return `<a class="dlb" href="${b.path}" download>⇩ スキル${b.n}本をまとめて取得（${b.kb}KB）</a>`;
}

/* 派生図と同じ描き方でフローを描く。
   ★節は【番号と工程名だけ】。何をやるかも事故も、押すまで出さない。
     16工程ぶんの説明を最初から並べると読む気が失せる（前の版で却下された）。
   ★列＝大きな塊（提案／制作／公開・管理）。線は SVG のベジェで引く。 */
const FN={}; STEPS.forEach(s=>FN[s.n]=s);
const FW=252, FGX=76, FRH=58, FTOP=58;   // FTOP は見出し2行ぶん   // 節の幅 / 列間 / 段の高さ / 見出しの分の余白

function flowPane(){
  if(!STEPS.length)return '<p style="color:var(--mute)">lp-flow.json がありません。</p>';
  const GR=(DATA.flow.groups||[{id:null,name:''}]);
  const pos={};
  let nodes='', heads='', maxR=0;
  GR.forEach((g,c)=>{
    const st=STEPS.filter(s=>s.group===g.id);
    if(!st.length)return;
    // ★どのスキルがこの塊を受け持つかを見出しに出す。
    //   工程ごとのバッジだけだと「この塊は誰の担当か」が読み取れない。
    const sk=[]; st.forEach(s=>{ if(!sk.includes(s.skill)) sk.push(s.skill); });
    const chips=sk.map(id=>id
      ? `<span class="sk ${SK[id]?'have':'miss'}">${esc(id)}${SK[id]?'':'／未作成'}</span>`
      : '<span class="sk none">型なし</span>').join('');
    heads+=`<div class="fgl" style="left:${c*(FW+FGX)}px">
      <div class="fgt">${esc(g.name)}<span>${st.length}工程</span></div>
      <div class="fgs">${chips}</div></div>`;
    st.forEach((s,r)=>{
      pos[s.n]=[c,r]; maxR=Math.max(maxR,r);
      const st8=s.skill?(SK[s.skill]?'ok':'miss'):'none';
      nodes+=`<div class="fnode ${st8}" id="f-${s.n}" data-step="${s.n}"
        style="left:${c*(FW+FGX)}px;top:${FTOP+r*FRH}px">
        <span class="fno">${s.n}</span><span class="fnm">${esc(s.name)}</span></div>`;
    });
  });
  FLOWPOS=pos;
  const g=STEPS.filter(s=>s.gap).length;
  const have=STEPS.filter(s=>s.skill&&SK[s.skill]).length;
  const W=GR.length*(FW+FGX)-FGX, H=FTOP+(maxR+1)*FRH;
  return `<div class="fbar">
      <span>全${STEPS.length}工程 ／ スキルで型になっているのは ${have}
      ${g?`／ <b style="color:var(--bad)">型が無い工程 ${g}</b>`:''}</span>
      <span class="fleg"><i class="ok"></i>スキルあり<i class="miss"></i>未作成<i class="none"></i>型なし</span>
    </div>
    <div class="fgraph"><svg class="fsvg"></svg>
      <div class="fcanvas" style="width:${W}px;height:${H}px">${heads}${nodes}</div></div>
    <div class="fdp" id="fdp"><p class="fdph">工程を押すと、何をやるか・出るもの・過去にそこで何をやらかしたかが出ます。</p></div>
    <div class="ghd" style="margin-top:26px"><h3>スキル一覧</h3>
      <span>~/.claude/skills/ の中身。展開先も同じ場所</span>
      <span class="ghdb">${dlAll()}</span></div>
    ${skillTable()}`;
}

let FLOWPOS={};
function drawFlow(){
  const wrap=document.querySelector('.fgraph'); if(!wrap)return;
  const svg=wrap.querySelector('.fsvg'), R=wrap.getBoundingClientRect();
  svg.setAttribute('width',wrap.scrollWidth); svg.setAttribute('height',wrap.scrollHeight);
  let d='<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">'
       +'<path d="M0 0 L7 3.5 L0 7 z" fill="#cbd5e1"/></marker></defs>';
  for(let i=0;i<STEPS.length-1;i++){
    const a=document.getElementById('f-'+STEPS[i].n), b=document.getElementById('f-'+STEPS[i+1].n);
    if(!a||!b)continue;
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    const L=x=>x-R.left+wrap.scrollLeft, T=y=>y-R.top+wrap.scrollTop;
    const same=FLOWPOS[STEPS[i].n][0]===FLOWPOS[STEPS[i+1].n][0];
    let p;
    if(same){   // 同じ塊の中は真下へ
      const x=L(ra.left+ra.width/2);
      p=`M${x} ${T(ra.bottom)} L${x} ${T(rb.top)-3}`;
    }else{      // 塊をまたぐ時は右へ回す
      const x1=L(ra.right), y1=T(ra.top+ra.height/2);
      const x2=L(rb.left)-3, y2=T(rb.top+rb.height/2), mx=(x1+x2)/2;
      p=`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
    }
    d+=`<path d="${p}" fill="none" stroke="#cbd5e1" stroke-width="2" marker-end="url(#ah)"/>`;
  }
  svg.innerHTML=d;
}

function showStep(n){
  const s=FN[n]; if(!s)return;
  document.querySelectorAll('.fnode').forEach(x=>x.classList.toggle('on',+x.dataset.step===n));
  document.getElementById('fdp').innerHTML=`
    <div class="fdh"><span class="fno">${s.n}</span><h3>${esc(s.name)}</h3>
      ${skillTag(s.skill)}</div>
    <p class="fdw">${esc(s.what)}</p>
    ${s.tool?`<div class="fm"><i>道具</i>${esc(s.tool)}</div>`:''}
    ${s.out?`<div class="fm"><i>出るもの</i>${esc(s.out)}</div>`:''}
    ${s.risk?`<div class="frisk"><b>過去の事故</b>${esc(s.risk)}</div>`:''}
    ${s.gap?`<div class="fgap"><b>足りない</b>${esc(s.gap)}</div>`:''}`;
}

function skillTable(){
  const list=DATA.skills||[];
  if(!list.length)return '<p style="color:var(--mute)">スキルが見つかりません。</p>';
  const miss=MISSING.map(id=>{
    const at=STEPS.filter(s=>s.skill===id).map(s=>s.n+'. '+s.name).join(' / ');
    return `<tr class="rmiss"><td><b>${esc(id)}</b></td>
      <td><span class="pill" style="background:var(--bad)">未作成</span></td>
      <td>フローが呼んでいるのに ~/.claude/skills/ に無い</td>
      <td>${esc(at)}</td></tr>`}).join('');
  const rows=list.map(s=>{
    const at=STEPS.filter(x=>x.skill===s.id);
    return `<tr>
      <td><b>${esc(s.id)}</b></td>
      <td>${s.mine?'<span class="pill" style="background:var(--live)">自作</span>'
                  :'<span class="pill" style="background:#94a3b8">既製</span>'}</td>
      <td class="sd">${esc(s.desc).slice(0,150)}</td>
      <td>${at.length?at.map(x=>esc(x.n+'. '+x.name)).join('<br>')
                     :'<span style="color:#9ca3af">フロー未接続</span>'}</td></tr>`}).join('');
  const gaps=STEPS.filter(s=>!s.skill&&s.gap);
  const bl=list.filter(s=>s.mine&&s.blocked).map(s=>s.id);
  return `<table><thead><tr><th>スキル</th><th>種別</th><th>説明</th>
      <th>フローのどこで動くか</th></tr></thead><tbody>${miss}${rows}</tbody></table>
    <p class="note" style="margin-top:8px">zip は <code>~/.claude/skills/</code> に展開すれば使える。
      ${bl.length?`<b style="color:var(--bad)">${bl.map(esc).join(' / ')} は案件名を含むため束に入れていない。</b>`:''}</p>
    ${gaps.length?`<div class="todo" style="margin-top:16px"><h3>スキルにすべき工程 ${gaps.length}件</h3><ul>${
      gaps.map(s=>`<li><b>${s.n}. ${esc(s.name)}</b> … ${esc(s.gap)}</li>`).join('')}</ul></div>`:''}`;
}

function linkCell(v,R){
  return v.status==='draft'
    ? `<span class="lk dead">${esc(v.id)}/</span>`
    : `<a class="lk" href="${R.url(v.id)}" target="_blank" rel="noopener">${esc(v.id)}/ ↗</a>`;
}

/* ── 版一覧：LPは表、動画は札 ─────────────────────────── */
function listPane(p,R){
  if(!p.versions.length)return '<p style="color:var(--mute)">まだ版がありません。'
    +`<br>${R.kind==='vid'?'vv.py':'lpv.py'} new で最初の版を登録してください。</p>`;
  if(R.kind==='vid')return vListPane(p,R);
  const rows=p.versions.map(v=>{
    const [lab,c]=S[v.status]||S.draft;
    return `<tr>
      <td>${linkCell(v,R)}</td>
      <td><span class="pill" style="background:${c}">${lab}</span></td>
      <td>${v.parent?esc(v.parent):'<span style="color:#9ca3af">初版</span>'}</td>
      <td>${esc(v.what)}
        ${(v.updates||[]).length?`<div class="upd">同じリンクのまま ${v.updates.length}回 直した
          <ul>${v.updates.map(u=>`<li>${esc(u.date)} ${esc(u.what)}</li>`).join('')}</ul></div>`:''}
        ${v.alert?`<div class="warn">▲ ${esc(v.alert)}</div>`:''}</td>
      <td style="color:var(--mute);white-space:nowrap">${esc(v.date)}
        ${v.shown_on?`<div style="font-size:11px">提示 ${esc(v.shown_on)}</div>`:''}</td></tr>`}).join('');
  return `<table><thead><tr><th>リンク</th><th>状態</th><th>派生元</th>
    <th>変更内容と更新</th><th>日付</th></tr></thead><tbody>${rows}</tbody></table>
    ${glossary('lp')}`;
}

function thumb(v,R){
  const m=v.media||{};
  if(v.status==='draft')  return '<span class="th none">未公開</span>';
  if(v.url)               return `<a class="th none" href="${R.url(v.id)}"
                                    target="_blank" rel="noopener">別リポで公開 ↗</a>`;
  return `<a class="th" href="${R.url(v.id)}" target="_blank" rel="noopener">
    <img src="../video/${esc(v.id)}/poster.jpg" alt="" loading="lazy">
    <span class="play">▶</span><span class="len">${mmss(m.duration)}</span></a>`;
}

/* ── 構成シート ──────────────────────────────────────────────
   横軸＝Hook / Body1 / Body2 / CTA ＋ ロゴ ＋ アバター（2カメ）
   縦軸＝版。大元のテンプレを一番上に置いて、その下に各本を並べる。
   ★1枠に「文面・字数・使った画像・ショットの並び」を全部入れる。
     文面だけの表にすると、結局どの画像とどのアングルを当てたかを動画で確認しに戻ることになる。 */
const SECS=[['hook','Hook','つかみ'],['body1','Body1','何が分かるか'],
            ['body2','Body2','どう使えるか'],['cta','CTA','行動']];

/* 素材の落とし口。サムネの角に小さく ⇩ を出す。
   ★サムネ自体をリンクにしない。押すつもりが無いのに数MB落ちるのは事故。 */
const mbs2=b=>(b>=1e6?(b/1e6).toFixed(1)+'MB':Math.round(b/1e3)+'KB');
function dl(v,role){
  const f=v.comp&&v.comp.files&&v.comp.files[role];
  if(!f)return '';
  const t=esc(f.label)+'　'+mbs2(f.bytes)+(f.compressed?'（圧縮版）':'');
  return `<a class="dl" download href="../video/${esc(v.id)}/files/${esc(f.name)}"
     title="${t}">⇩ ${mbs2(f.bytes)}</a>`;
}

function secCell(v,s){
  if(!s)return '<td class="sec"><span style="color:#9ca3af">—</span></td>';
  if(s.rule)return `<td class="sec"><div class="rule">${esc(s.rule)}</div>
    <div class="tx" style="color:var(--mute);margin-top:6px">${esc(s.text||'')}</div></td>`;
  const planned=v.comp&&v.comp.planned;      // まだ作っていない＝素材が決まっていない
  const img=s.image
    ? `<div class="thw"><img class="th" src="../video/${esc(v.id)}/parts/${esc(s.thumb||s.image)}"
         alt="" loading="lazy">${dl(v,s.key)}</div>`
    : `<div class="noimg">${planned?'素材未定':'画像なし（アバターのみ）'}</div>`;
  const chain=(s.shots||[]).map(x=>x.kind==='image'
    ? `<span class="sh img">${esc(x.file)} ${x.dur}s</span>`
    : `<span class="sh">${esc(x.label)} ${x.dur}s</span>`).join('');
  return `<td class="sec">${img}
    <div class="tx">${esc(s.text||'')}</div>
    ${s.chars?`<div class="ch"><b>${s.chars}</b>字</div>`:''}
    <div class="chain">${chain}</div></td>`;
}

/* シートの中で再生する。
   ★<video> は【押した時に作る】。最初から置くと開いただけで全件（1本6MB）読みに行く。
     ポスターだけ出して、クリックで player を差し込む。 */
function playCell(v,tmpl){
  if(tmpl) return '<td class="play"><span style="color:#9ca3af">—</span></td>';
  if(v.status==='draft'||v.url)
    return '<td class="play"><span style="color:#9ca3af">未制作</span></td>';
  const d=v.media&&v.media.duration ? mmss(v.media.duration) : '';
  return `<td class="play"><div class="vbox" data-play="${esc(v.id)}">
      <img src="../video/${esc(v.id)}/poster.jpg" alt="" loading="lazy">
      <span class="pbtn">▶</span><span class="plen">${d}</span>
    </div></td>`;
}

function sheetPane(p,R){
  if(!p.versions.length)return '<p style="color:var(--mute)">まだ版がありません。</p>';
  const withComp=p.versions.filter(v=>v.comp);
  if(!withComp.length)return '<p style="color:var(--mute)">構成が未登録です。'
    +'<br><code>vv.py compose &lt;版id&gt; --project &lt;作業場&gt;</code> で取り込んでください。</p>';
  const rows=p.versions.map(v=>{
    const c=v.comp;
    if(!c)return '';
    const tmpl=!!c.template;
    const by={}; (c.sections||[]).forEach(s=>by[s.key]=s);
    const parts=`../video/${esc(v.id)}/parts/`;
    const planned=!!c.planned;
    return `<tr class="${tmpl?'tmpl':''}${planned?' planned':''}">
      <td class="vcol">
        <div class="vid">${tmpl?'テンプレ':linkCell(v,R)}</div>
        <div class="vmeta">${esc(v.date)}${v.media&&v.media.duration?' · '+mmss(v.media.duration):''}
          ${planned?'<br><span class="todo-pill">台本のみ</span>':''}</div>
        ${dl(v,'voice')?`<div class="vdl">音声 ${dl(v,'voice')}</div>`:''}
      </td>
      ${playCell(v,tmpl)}
      ${SECS.map(([k])=>secCell(v,by[k])).join('')}
      ${tmpl
        // テンプレの行に素材のサムネは出さない。型そのものには素材が無い
        ? `<td class="sm"><div class="rule">全カット左上に固定</div></td>
           <td class="av"><div class="rule">正面（引き）と横（寄り）の2カメ。
             セクションをまたいで交代させる</div></td>`
        // 素材が入っていれば未制作でも出す。「まだ編集していない」と「素材が無い」は別
        : (!c.logo && !c.avatar)
        ? `<td class="sm"><span style="color:#9ca3af">未定</span></td>
           <td class="av"><span style="color:#9ca3af">未定</span></td>`
        : `<td class="sm">${c.logo?`<div class="thw"><img class="logo" src="${parts}logo.png"
              alt="ロゴ" loading="lazy">${dl(v,'logo')}</div>`
                                  :'<span style="color:#9ca3af">—</span>'}</td>
           <td class="av"><div class="avpair">
            <figure><div class="thw"><img class="th" style="margin:0" src="${parts}avatar_wide.jpg"
                alt="" loading="lazy">${dl(v,'wide')}</div>
              <figcaption>正面</figcaption></figure>
            <figure><div class="thw"><img class="th" style="margin:0" src="${parts}avatar_close.jpg"
                alt="" loading="lazy">${dl(v,'close')}</div>
              <figcaption>横</figcaption></figure>
           </div></td>`}</tr>`}).join('');
  return `<p class="note" style="margin:0 0 10px">
      台本の1行が1枠。緑のタグが画像、白がアバター、数字はその画になっている秒数。
      一番上がテンプレ（守るべき型）で、その下が実際の各本。
      <b>⇩ を押すとその素材が落ちる</b>（動画は原本ではなく圧縮版。原本は ~/video-edit-tool/projects/ に）。</p>
    <div class="sheetwrap"><table class="sheet"><thead><tr>
      <th class="vcol">版</th><th class="play">動画</th>
      ${SECS.map(([,l,h])=>`<th class="sec">${l}<span style="font-weight:400;color:#9ca3af">　${h}</span></th>`).join('')}
      <th class="sm">ロゴ</th><th class="av">アバター（2カメ）</th>
    </tr></thead><tbody>${rows}</tbody></table></div>`;
}

function vListPane(p,R){
  const cards=p.versions.map(v=>{
    const [lab,c]=S[v.status]||S.draft, m=v.media||{};
    return `<div class="card" style="--c:${c}">
      ${thumb(v,R)}
      <div class="bd">
        <div class="t">${linkCell(v,R)}</div>
        <div class="d">${esc(v.date)} · <span class="pill" style="background:${c}">${lab}</span></div>
        <div class="w">${esc(v.what)}</div>
        ${v.alert?`<div class="warn">▲ ${esc(v.alert)}</div>`:''}
        <div class="ft">
          <span>${esc(m.size||'')}</span><span>${mbs(m.bytes)}</span>
          <span>派生元 ${v.parent?esc(v.parent):'—'}</span>
          ${(v.fb||[]).length?`<span>FB${v.fb.length}件</span>`:''}
        </div>
      </div></div>`}).join('');
  return `<div class="cards">${cards}</div>${glossary('vid')}`;
}

/* ★用語は説明を画面に置く。頭の中にしか無い言葉は、3日で意味が分からなくなる。 */
function glossary(kind){
  const G=[
   ['未公開','まだリンクを作っていない。作りかけ'],
   ['自分の確認用','リンクはあるが、まだクライアントには渡していない。ここは何度でも直してよい'],
   ['クライアントに提示','渡した。<b>このリンクはここで凍る</b>。以降の直しは自動で新しいリンクへ逃がす'],
   ['派生元','そのリンクを作るとき、どのリンクをコピーして始めたか。ここが抜けると系統が追えなくなる'],
  ];
  if(kind==='vid')G.push(['原本','ここにあるのは web用に圧縮したもの（CRF26）。'
    +'原本と編集データは <code>~/video-edit-tool/projects/</code> が正']);
  else G.push(['更新','<b>同じリンクのまま</b>中身を直した回数。提示前のリンクだけ増える']);
  return `<details class="glo"><summary>用語の意味</summary><dl>${
    G.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></details>`;
}

function graphPane(p,R){
  if(!p.versions.length)return '<p style="color:var(--mute)">まだ版がありません。</p>';
  const NW=212, GX=64, RH=116;              // 節の幅 / 横の間隔 / 1段の高さ
  const by={}; p.versions.forEach(v=>by[v.id]=v);
  // 親が別プロジェクトにいる場合（例：小学生向けの親はオンライン校の版）は根として扱う
  const par=v=>(v.parent&&by[v.parent])||null;

  // 横位置＝世代
  // ★循環（a→b→a）を踏むと無限再帰でページごと固まる。必ず seen で止める。
  const depth={};
  const d=(v,seen)=>{
    if(depth[v.id]!=null)return depth[v.id];
    seen=seen||{};
    if(seen[v.id])throw new Error('派生元が循環しています：'+v.id);
    seen[v.id]=1;
    const pa=par(v); return depth[v.id]=pa?d(pa,seen)+1:0;};
  try{ p.versions.forEach(v=>d(v)); }
  catch(e){ return `<p style="color:var(--bad);font-weight:700">▲ ${esc(e.message)}<br>
    <span style="font-weight:400;font-size:12.5px">台帳の parent を直してください。</span></p>`; }

  const kids={};
  p.versions.forEach(v=>{const pa=par(v); if(pa)(kids[pa.id]=kids[pa.id]||[]).push(v);});

  // ★縦位置：葉を上から1段ずつ積み、親は【最初の子と同じ高さ】に置く。
  //   ・世代ごとに列の頭から詰めると、子が必ず親より上に来る（前の実装の不具合）
  //   ・子の"中央"に置くのも駄目。枝分かれのたびに先頭の子が親より上に出る
  //   この置き方だと最初の系統が一番上を真横に走り、派生は必ず下へ垂れる。
  const row={}; let slot=0;
  const place=v=>{
    if(row[v.id]!=null)return row[v.id];
    const c=kids[v.id]||[];
    if(!c.length)return row[v.id]=slot++;
    return row[v.id]=c.map(place)[0];
  };
  p.versions.filter(v=>!par(v)).forEach(place);
  p.versions.forEach(place);                // 取りこぼし（循環など）の保険

  const maxD=Math.max(...p.versions.map(v=>depth[v.id]));
  const maxR=Math.max(...p.versions.map(v=>row[v.id]));
  const nodes=p.versions.map(v=>{const [lab,c,b]=S[v.status]||S.draft;
    // 親が別案件にいる版は、この図では根に見える。由来が消えるので明示する。
    const out=v.parent&&!by[v.parent]&&R.ALL[v.parent];
    const ext=out?`<div class="ext">← ${esc(R.OWNER[v.parent].name)} の ${esc(v.parent)} から</div>`:'';
    const m=v.media||{};
    const sub=R.kind==='vid'
      ? (m.duration?` · ${mmss(m.duration)}`:'')
      : ((v.updates||[]).length?` · <b>更新${v.updates.length}回</b>`:'');
    return `<div class="gnode${out?' hasext':''}" id="g-${v.id}" style="--c:${c};--b:${b};`
      +`left:${depth[v.id]*(NW+GX)}px;top:${(row[v.id]*RH).toFixed(1)}px">
      <div class="t">${linkCell(v,R)}</div>
      <div class="d">${esc(v.date)} · ${lab}${sub}</div>
      ${ext}<div class="w">${esc(v.what)}</div></div>`}).join('');
  // 世代が深いと画面に入り切らない。畳むと系統が読めなくなるので幅は変えず、断り書きだけ出す
  const hint=maxD>=5?`<p class="note" style="margin-bottom:8px">
    ${maxD+1}世代あります。図は右に続くので横にスクロールしてください。</p>`:'';
  return `${hint}<div class="graph"><svg class="gsvg"></svg>
    <div class="gcanvas" style="width:${(maxD+1)*(NW+GX)-GX}px;height:${maxR*RH+108}px">${nodes}</div></div>`;
}

function drawLines(p){
  const wrap=document.querySelector('.graph'); if(!wrap)return;
  const svg=wrap.querySelector('.gsvg'); const R=wrap.getBoundingClientRect();
  svg.setAttribute('width',wrap.scrollWidth); svg.setAttribute('height',wrap.scrollHeight);
  let d='';
  p.versions.forEach(v=>{
    if(!v.parent)return;
    const a=document.getElementById('g-'+v.parent), b=document.getElementById('g-'+v.id);
    if(!a||!b)return;
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    const x1=ra.right-R.left+wrap.scrollLeft, y1=ra.top-R.top+ra.height/2+wrap.scrollTop;
    const x2=rb.left-R.left+wrap.scrollLeft,  y2=rb.top-R.top+rb.height/2+wrap.scrollTop;
    const mx=(x1+x2)/2;
    d+=`<path d="M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}"
         fill="none" stroke="#cbd5e1" stroke-width="2"/>`;
  });
  svg.innerHTML=d;
}

function fbPane(p){
  const all=[];
  p.versions.forEach(v=>(v.fb||[]).forEach(f=>all.push({...f,ver:v})));
  all.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
  if(!all.length)return '<p style="color:var(--mute)">記録されたFBはありません。</p>';
  return all.map(f=>`<div class="fbrow"><div class="dt">${esc(f.date)}<br>
    <span style="font-size:11px">${esc(f.from||'')}</span></div>
    <div><div class="wh">${esc(f.what)}</div>
    <div class="to">→ ${esc(f.ver.id)} で対応</div>
    </div></div>`).join('');
}

function rules(kind){
  const cli=kind==='vid'?'vv.py':'lpv.py';
  const last=kind==='vid'
    ? 'ここにあるのは web用の圧縮版。<b>原本と編集データは ~/video-edit-tool/projects/ が正</b>'
    : '作業は git の docs/ 配下で行う。Desktopの複製フォルダを正にしない';
  return `<div class="rules" style="margin-top:16px"><b>運用ルール</b><ol>
      <li>FBが来たら<b>直す前に</b>台帳へ1行足す（<code>${cli} fb</code>）</li>
      <li><b>渡す前</b>のリンクは、同じリンクの中身を直して update に記録する</li>
      <li><b>渡した後</b>のリンクは直さない。update すると自動で新しいリンクが出る</li>
      <li>クライアントに渡したら <code>${cli} show &lt;id&gt;</code> を打つ。打った時点で凍る</li>
      <li>${last}</li>
      ${kind==='vid'?'<li>文面と画像を変えたら <code>vv.py compose &lt;id&gt; --project &lt;作業場&gt;</code> で構成を取り直す</li>':''}
    </ol></div>`;
}

function render(){
  writeHash();
  document.querySelector('.side').innerHTML=sidebar();
  // 「しくみ」の画面は案件に属さないので、先に分岐して描き切る
  if(cur==='__moods__'){
    document.querySelector('.main').innerHTML = moodsPane();
    return;
  }
  if(cur==='__flow__'){
    document.querySelector('.main').innerHTML=`
      <div class="head"><h2>LP制作フローとスキル</h2>
        <span class="cl">問い合わせを受けてから、直して見せ続けるまで</span></div>
      <p class="note">各工程で動くスキルと、過去にそこで何をやらかしたかを1枚にしてある。
        定義は lp-flow.json、説明は各 SKILL.md の先頭から。
        案件の中身は載せない（このリポジトリは公開）。</p>
      <div class="pane">${flowPane()}</div>`;
    // 派生図と同じ理由で rAF に頼らない（背面タブだと発火しない）
    setTimeout(drawFlow,0);
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(drawFlow);
    addEventListener('load',drawFlow,{once:true});
    return;
  }
  const R=RG(), p=R.reg.projects.find(x=>x.id===PID());
  if(!p){document.querySelector('.main').innerHTML=
    '<p class="note">案件が見つかりません。</p>';return;}
  const al=alerts(p);
  const todo=al.length?`<div class="todo"><h3>要対応 ${al.length}件</h3><ul>${
    al.map(v=>`<li><b>${esc(v.id)}</b> … ${esc(v.alert)}</li>`).join('')}</ul></div>`:'';
  const body = tab==='sheet'?sheetPane(p,R)
             : tab==='list' ?listPane(p,R)
             : tab==='graph'?graphPane(p,R) : fbPane(p);
  // テンプレは「未制作の本数」に数えない。作る対象ではなく型なので
  const nd = p.versions.filter(v=>v.status==='draft'&&!(v.comp&&v.comp.template)).length;
  const nmade = p.versions.filter(v=>v.status!=='draft').length;
  const count = R.kind==='vid'
    ? `${nmade}本 / 計 ${mmss(vsec(p))}` + (nd?`　未制作 ${nd}`:'')
    : `リンク ${p.versions.length}本`;
  document.querySelector('.main').innerHTML=`
    <div class="head"><h2>${esc(p.name)}</h2>
      <span class="cl">${esc(p.client||'')}</span>
      <span class="mainlink">${count}</span>
    </div>
    <p class="note">${esc(p.note||'')}</p>
    ${todo}
    <div class="tabs">
      ${R.kind==='vid'?`<button data-t="sheet" class="${tab==='sheet'?'on':''}">構成</button>`:''}
      <button data-t="list" class="${tab==='list'?'on':''}">版一覧</button>
      <button data-t="graph" class="${tab==='graph'?'on':''}">派生図</button>
      <button data-t="fb" class="${tab==='fb'?'on':''}">FB履歴</button>
    </div><div class="pane">${body}</div>
    ${rules(R.kind)}`;
  // ★requestAnimationFrame は【タブが非表示だと発火しない】。
  //   背面タブで開くと線が引かれない事故になるので rAF に依存しない。
  if(tab==='graph'){ setTimeout(()=>drawLines(p),0);
    // Webフォントの読み込みで箱の高さが動くので、確定後にもう一度引く
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>drawLines(p));
    addEventListener('load',()=>drawLines(p),{once:true}); }
}

document.addEventListener('click',e=>{
  const a=e.target.closest('.side a[data-p]');
  // 動画は構成シートが先（ここで文面と画像を管理する）。LPは系統が先
  if(a){cur=a.dataset.p;tab=cur.slice(0,4)==='vid:'?'sheet':'graph';render();return;}
  const b=e.target.closest('.tabs button'); if(b){tab=b.dataset.t;render();return;}
  // シートの中の再生。押されたセルだけ <video> に差し替える
  const pc=e.target.closest('.vbox[data-play]');
  if(pc){
    const id=pc.dataset.play;
    pc.removeAttribute('data-play');
    pc.innerHTML=`<video src="../video/${id}/ad.mp4" poster="../video/${id}/poster.jpg"
      controls autoplay playsinline preload="metadata"></video>`;
    const vd=pc.querySelector('video');
    // 音が重ならないよう、再生し始めたら他は止める
    vd.addEventListener('play',()=>document.querySelectorAll('.vbox video').forEach(o=>{
      if(o!==vd) o.pause();}));
    return;
  }
  // フローの節を押したら、下の欄に詳細を出す（図は描き直さない）
  const fn=e.target.closest('.fnode');
  if(fn){showStep(+fn.dataset.step);}
});
addEventListener('hashchange',()=>{ if(readHash()) render(); else writeHash(); });   // 壊れたURLは黙って今の場所に直す
addEventListener('resize',()=>{
  if(cur==='__flow__')return drawFlow();
  if(tab==='graph'){const R=RG();drawLines(R.reg.projects.find(x=>x.id===PID()));}});
readHash();          // URLに書いてあればそこを開く
render();
"""


def main():
    reg = json.load(open(REG, encoding="utf-8"))
    vreg = json.load(open(VREG, encoding="utf-8")) if os.path.exists(VREG) else None
    # ★おかしい台帳から画面を作らない。間違った図が出るほうが、出ないより危ない。
    #   lpv.py build 経由でなく、これを直接叩かれた時のための保険。
    if os.environ.get("LPV_CHECKED") != "1":   # lpv.py build 経由なら検査済み
        try:
            import lpv
            if lpv.check(reg):
                sys.exit("\n  ★台帳にエラーがあるので生成しない（詳細は lpv.py check）")
        except ImportError:
            print("  ▲ lpv.py が無いので台帳を検査していない")
    # ★動画の台帳が壊れていても LP の画面は作る。
    #   動画のせいで LP の作業が止まるのは筋が悪いので、動画だけ落として警告する。
    if vreg and os.environ.get("VV_CHECKED") != "1":
        try:
            import vv
            if vv.check(vreg):
                print("  ▲ 動画の台帳にエラー。動画は載せずに生成する（詳細は vv.py check）")
                vreg = None
        except ImportError:
            print("  ▲ vv.py が無いので動画の台帳を検査していない")
    reg.pop("_readme", None)
    flow = json.load(open(FLOW, encoding="utf-8")) if os.path.exists(FLOW) else {"steps": []}
    flow.pop("_readme", None)
    reg["flow"] = flow
    reg["skills"], reg["bundle"] = read_skills()
    # ★雰囲気テンプレ。実物（HTML・スクショ）は手元の ~/lp-moods/ にあり、ここには載せない。
    #   このリポジトリは公開なので、載せるのは仕様の数字だけ
    mp = os.path.join(R, "lp-moods.json")
    if os.path.exists(mp):
        moods = json.load(open(mp, encoding="utf-8"))
        moods.pop("_readme", None)
        reg["moods"] = moods
    if vreg:
        vreg.pop("_readme", None)
        # ★台帳は丸ごと DATA として公開ページに焼き込まれる。
        #   画面が使わない内部の値は落とす。source は原本の【手元の絶対パス】なので、
        #   残すと /Users/<ユーザー名>/… が公開HTMLに載る。
        for p in vreg.get("projects", []):
            for v in p.get("versions", []):
                v.pop("source", None)
        reg["videos"] = vreg
    doc = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- ★検索避け。リンクを知っている人だけが見る想定 -->
<meta name="robots" content="noindex,nofollow,noarchive">
<title>版管理（LP / 動画）</title>
<style>{CSS}</style>
</head>
<body>
<div class="app"><nav class="side"></nav><main class="main"></main></div>
<script>const DATA={json.dumps(reg, ensure_ascii=False)};</script>
<script>{JS}</script>
</body></html>"""
    os.makedirs(OUT_DIR, exist_ok=True)
    open(OUT, "w", encoding="utf-8").write(doc)
    n = sum(len(p["versions"]) for p in reg["projects"])
    a = sum(len([v for v in p["versions"] if v.get("alert")]) for p in reg["projects"])
    vn = sum(len(p["versions"]) for p in (vreg or {}).get("projects", []))
    print(f"  生成: docs/lp/index.html（LP {len(reg['projects'])}案件 / {n}版 / 要対応 {a}件"
          + (f" ／ 動画 {len(vreg['projects'])}案件 / {vn}版" if vreg else "") + "）")
    if "--open" in sys.argv:
        subprocess.run(["open", OUT])


if __name__ == "__main__":
    main()
