#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""動画の版管理（video-registry.json）を操作する唯一の入口。

  ★なぜ CLI にしたか
    LP側（lpv.py）と同じ理由。台帳を手で書く運用は必ず破綻する。
    台帳は【人が書くもの】ではなく【版を作る操作の副産物】にする。
    版のディレクトリは vv.py new でしか作らない。cp -r で作らない。

  ★LP と違うところ
    動画は1本17MBある。そのままリポジトリへ入れると履歴が永久に膨らむ。
    だから公開用は web向けに圧縮（CRF26・原本の約23%・PSNR43dB＝実質劣化なし）し、
    原本は作業場（~/video-edit-tool/projects/<slug>/）に残す。

  使い方
    python3 vv.py ls [案件id]                    いま何がどうなっているか
    python3 vv.py new-project <案件id> --name ... --client ...
    python3 vv.py new <版id> -p <案件id> --from <派生元> --why "..." --src <mp4>
    python3 vv.py fb <版id> --what "..."          ★直す前に打つ
    python3 vv.py update <版id> --what "..." [--src <mp4>]   小さい直し
    python3 vv.py show <版id>                    クライアントに見せた（ここで凍る）
    python3 vv.py check                          台帳と容量の検査だけ
    python3 vv.py build [--push]                 検査→ダッシュボード生成→(--pushで公開)

  ★画面はLPと同じ1枚（docs/lp/index.html）の「動画」タブ。専用ページは作らない。
    ここが作るのは docs/video/<版id>/ の実体（ad.mp4 / poster.jpg / 再生ページ）だけ。
"""
import argparse
import datetime
import json
import os
import re
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(ROOT, "video-registry.json")
DOCS = os.path.join(ROOT, "docs", "video")

STATUS = ["draft", "internal", "shown"]
LABEL = {"draft": "未公開", "internal": "公開（自分用）", "shown": "公開（クライアント）"}
TODAY = datetime.date.today().isoformat()

# 公開用エンコード。CRF26で原本の約23%・PSNR43dB（実質劣化なし）
CRF = 26
# docs/video がこれを超えたら警告する。GitHub Pages は公開サイト1GBが上限
WARN_MB = 250

C = {"r": "\033[31m", "y": "\033[33m", "g": "\033[32m", "b": "\033[1m", "_": "\033[0m"}


def say(s, c=None):
    print((C[c] + s + C["_"]) if c and sys.stdout.isatty() else s)


def tilde(path):
    """原本の場所は ~ 起点で持つ。
    ★台帳はそのまま公開リポジトリに入る。絶対パスで持つと /Users/<ユーザー名>/ が世に出る。
    """
    return "~/" + os.path.relpath(os.path.abspath(path), os.path.expanduser("~"))


def ffmpeg():
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


# ── 台帳の読み書き ────────────────────────────────────────────
def load():
    return json.load(open(REG, encoding="utf-8"))


def save(reg):
    reg["updated"] = TODAY
    with open(REG, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=1)


def proj(reg, pid):
    for p in reg["projects"]:
        if p["id"] == pid:
            return p
    sys.exit(f"  ★案件 '{pid}' が台帳に無い。vv.py ls で一覧を見るか new-project で作る")


def allvers(reg):
    return {v["id"]: (p, v) for p in reg["projects"] for v in p["versions"]}


def vurl(reg, v):
    return v.get("url") or reg["base_url"] + v["id"] + "/"


def probe(path):
    """尺・解像度・容量を読む"""
    out = subprocess.run([ffmpeg(), "-hide_banner", "-i", path],
                         capture_output=True, text=True).stderr
    d = re.search(r"Duration: (\d+):(\d+):([\d.]+)", out)
    v = re.search(r"(\d{3,4})x(\d{3,4})", out)
    dur = (int(d.group(1)) * 3600 + int(d.group(2)) * 60 + float(d.group(3))) if d else 0.0
    return {
        "duration": round(dur, 2),
        "size": f"{v.group(1)}x{v.group(2)}" if v else "?",
        "bytes": os.path.getsize(path),
    }


# ── 公開物を置く ──────────────────────────────────────────────
def _run(cmd, what, timeout):
    """ffmpeg を回して、失敗したらそこで止める。

    ★終了コードを見ないと、失敗したエンコードが「成功」として台帳に載る。
      しかも ffmpeg の -y は出力を開いた瞬間に既存ファイルを 0 バイトに切り詰めるので、
      直接 ad.mp4 へ書かせると【公開中の動画を壊した上で】通過してしまう。
      だから出力は必ず一時ファイルにして、成功した時だけ差し替える（下の publish_files）。
    """
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        tail = "\n".join((r.stderr or "").strip().splitlines()[-6:])
        sys.exit(f"  ★{what}に失敗（ffmpeg 終了コード {r.returncode}）\n{tail}")


def publish_files(vid, src):
    """web用に圧縮した mp4 と、静止画（ポスター）を置く。

    ★成功するまで既存ファイルに触らない。途中で落ちても、前に公開したものはそのまま残る。
    """
    d = os.path.join(DOCS, vid)
    os.makedirs(d, exist_ok=True)
    mp4 = os.path.join(d, "ad.mp4")
    poster = os.path.join(d, "poster.jpg")
    tmp4, tjpg = mp4 + ".tmp.mp4", poster + ".tmp.jpg"
    F = ffmpeg()
    info = probe(src)
    if info["duration"] <= 0:
        sys.exit(f"  ★元動画の尺が読めない: {src}")
    try:
        _run([F, "-hide_banner", "-y", "-i", src,
              "-c:v", "libx264", "-crf", str(CRF), "-preset", "slow",
              "-pix_fmt", "yuv420p", "-movflags", "+faststart",
              "-c:a", "aac", "-b:a", "128k", tmp4], "圧縮", 1800)
        # ポスターは冒頭ではなく中盤から取る（冒頭は暗い/切替中のことが多い）
        _run([F, "-hide_banner", "-y", "-ss", str(round(info["duration"] * 0.35, 2)),
              "-i", src, "-frames:v", "1", "-vf", "scale=960:-1", "-q:v", "3", tjpg],
             "ポスター生成", 600)
        meta = probe(tmp4)
        if meta["duration"] <= 0 or meta["bytes"] < 10000:
            sys.exit(f"  ★圧縮結果が壊れている（{meta['bytes']}バイト / {meta['duration']}秒）")
        os.replace(tmp4, mp4)
        os.replace(tjpg, poster)
    finally:
        for t in (tmp4, tjpg):
            if os.path.exists(t):
                os.remove(t)
    return mp4, poster, probe(mp4)


def esc(s):
    """台帳の文字をHTMLに置くときは必ず通す。
    ★台帳には「CTAの<b>色</b>を直す」のような普通の文が入る。素で埋めるとページが壊れる。
    """
    return (str(s if s is not None else "")
            .replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def player_page(reg, p, v):
    """版ごとの再生ページ。リンクを開いた人はこれを見る"""
    d = os.path.join(DOCS, v["id"])
    os.makedirs(d, exist_ok=True)
    meta = v.get("media", {})
    html = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>{esc(p['name'])} — {esc(v['id'])}</title>
<style>
 :root{{color-scheme:dark}}
 *{{box-sizing:border-box}}
 body{{margin:0;background:#0d0f12;color:#e8eaed;
   font:15px/1.7 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif}}
 .wrap{{max-width:1000px;margin:0 auto;padding:32px 20px 64px}}
 a{{color:#7fd4c1}}
 h1{{font-size:20px;margin:0 0 4px;font-weight:700}}
 .sub{{color:#8b929c;font-size:13px;margin:0 0 20px}}
 video{{width:100%;border-radius:10px;background:#000;display:block}}
 .meta{{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 0}}
 .chip{{background:#1b1f26;border:1px solid #2a3038;border-radius:999px;
   padding:4px 12px;font-size:12px;color:#aeb6c0}}
 .what{{margin:20px 0 0;padding:14px 16px;background:#151920;
   border-left:3px solid #7fd4c1;border-radius:0 8px 8px 0}}
 .fb{{margin:22px 0 0}}
 .fb h2{{font-size:13px;color:#8b929c;font-weight:600;margin:0 0 8px}}
 .fb li{{margin:0 0 6px}}
 .back{{display:inline-block;margin:26px 0 0;font-size:13px}}
</style></head><body><div class="wrap">
<h1>{esc(p['name'])}</h1>
<p class="sub">{esc(v['id'])} ・ {esc(v['date'])} ・ {LABEL[v['status']]}</p>
<video src="ad.mp4" poster="poster.jpg" controls playsinline preload="metadata"></video>
<div class="meta">
 <span class="chip">{meta.get('duration','?')}秒</span>
 <span class="chip">{esc(meta.get('size','?'))}</span>
 <span class="chip">{round(meta.get('bytes',0)/1e6,1)}MB</span>
 {'<span class="chip">派生元 ' + esc(v['parent']) + '</span>' if v.get('parent') else ''}
</div>
<div class="what">{esc(v.get('what',''))}</div>
{_fb_html(v)}
<a class="back" href="../../lp/">← 版管理へ</a>
</div></body></html>"""
    with open(os.path.join(d, "index.html"), "w", encoding="utf-8") as f:
        f.write(html)


def _fb_html(v):
    fb = v.get("fb", [])
    if not fb:
        return ""
    li = "".join(f"<li>{esc(x['date'])}　{esc(x['what'])}</li>" for x in fb)
    return f'<div class="fb"><h2>もらったFB {len(fb)}件</h2><ul>{li}</ul></div>'


# ── 検査 ──────────────────────────────────────────────────────
def check(reg, quiet=False):
    err, warn = [], []
    # ★親の存在確認は【先に全部の版idを集めてから】。走査しながら積んだ集合で判定すると、
    #   親が後ろの案件にいるだけで誤警告する（案件の並び順で結果が変わってしまう）。
    known = {v["id"]: p["id"] for p in reg["projects"] for v in p["versions"]}
    seen = {}
    for p in reg["projects"]:
        for v in p["versions"]:
            i = v["id"]
            if i in seen:
                err.append(f"版id '{i}' が重複（{seen[i]} と {p['id']}）")
            seen[i] = p["id"]
            if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", str(i)):
                err.append(f"版id '{i}' は英小文字・数字・- _ . のみ（URLになるので）")
            if v.get("status") not in STATUS:
                err.append(f"{i}: status '{v.get('status')}' は語彙外（{'/'.join(STATUS)}）")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v.get("date", ""))):
                err.append(f"{i}: date が YYYY-MM-DD でない → {v.get('date')!r}")
            if not v.get("what"):
                warn.append(f"{i}: what（変更内容）が空。後から誰も用途を思い出せない")
            if v.get("parent") and v["parent"] not in known:
                warn.append(f"{i}: 派生元 '{v['parent']}' が台帳に無い")
            if not v.get("url") and v.get("status") != "draft":
                d = os.path.join(DOCS, i)
                for need in ("ad.mp4", "poster.jpg", "index.html"):
                    if not os.path.exists(os.path.join(d, need)):
                        err.append(f"{i}: docs/video/{i}/{need} が無い。url を書くか版を置き直す")
                m = v.get("media") or {}
                if m.get("duration", 0) <= 0:
                    err.append(f"{i}: media.duration が 0。圧縮が途中で落ちた版の可能性がある")
        by = {v["id"]: v for v in p["versions"]}
        cyc = set()
        # ここは案件内だけ辿る（by が案件内の辞書なので、外に出た時点で while が止まる）
        for v in p["versions"]:
            path, cur = [], v
            while cur:
                if cur["id"] in path:
                    cyc.add(" → ".join(path[path.index(cur["id"]):] + [cur["id"]]))
                    break
                path.append(cur["id"])
                cur = by.get(cur.get("parent"))
        for c in sorted(cyc):
            err.append(f"派生元が循環している: {c}")

    # 容量。動画は放っておくとリポジトリを潰す
    mb = 0
    if os.path.isdir(DOCS):
        mb = sum(os.path.getsize(os.path.join(dp, f))
                 for dp, _, fs in os.walk(DOCS) for f in fs) / 1e6
    if mb > WARN_MB:
        warn.append(f"docs/video が {mb:.0f}MB（目安 {WARN_MB}MB）。"
                    "古い draft/internal を rm するか、案件ごと別リポへ逃がす")

    # ★git管理外だとリンクは手元でしか開けない。
    #   「公開したつもりで渡したら404」を防ぐため、毎回はっきり言う
    if subprocess.run(["git", "-C", ROOT, "check-ignore", "-q", "docs/video"],
                      capture_output=True).returncode == 0:
        warn.append("docs/video/ が .gitignore に入っている＝世に出ない。"
                    "リンクは手元専用。公開するなら .gitignore の該当行を消す")

    if not quiet:
        for e in err:
            say("  ✗ " + e, "r")
        for w in warn:
            say("  ▲ " + w, "y")
        if not err and not warn:
            say(f"  ○ 台帳に問題なし（docs/video {mb:.0f}MB）", "g")
    return len(err)


# ── 各コマンド ────────────────────────────────────────────────
def cmd_ls(a):
    reg = load()
    for p in reg["projects"]:
        if a.project and p["id"] != a.project:
            continue
        say(f"\n■ {p['name']}（{p.get('client','')}）", "b")
        if p.get("note"):
            say(f"   {p['note']}")
        for v in p["versions"]:
            m = v.get("media", {})
            mark = {"draft": " ", "internal": "・", "shown": "★"}[v["status"]]
            say(f"   {mark} {v['id']:<14} {v['date']}  {LABEL[v['status']]:<16}"
                f" 親={v.get('parent') or '—'}  FB{len(v.get('fb',[]))}件"
                f"  {m.get('duration','?')}秒 {round(m.get('bytes',0)/1e6,1)}MB")
            say(f"       {v.get('what','')}")
            if v["status"] != "draft":
                say(f"       {vurl(reg, v)}")
    print()


def cmd_new_project(a):
    reg = load()
    if any(p["id"] == a.id for p in reg["projects"]):
        sys.exit(f"  ★案件 '{a.id}' はもうある")
    reg["projects"].append({"id": a.id, "name": a.name, "client": a.client,
                            "note": a.note or "", "versions": []})
    save(reg)
    say(f"  ○ 案件 '{a.id}' を作った", "g")


def cmd_new(a):
    reg = load()
    p = proj(reg, a.project)
    vs = allvers(reg)
    if a.id in vs:
        sys.exit(f"  ★版id '{a.id}' はもうある")
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", a.id):
        sys.exit("  ★版idは英小文字・数字・- _ . のみ（そのままURLとフォルダ名になる）")
    if not a.root and not a.parent:
        sys.exit("  ★--from（派生元）が要る。初版なら --root を付ける")
    if a.parent and a.parent not in vs:
        sys.exit(f"  ★派生元 '{a.parent}' が台帳に無い")
    if not os.path.exists(a.src):
        sys.exit(f"  ★元動画が無い: {a.src}")

    say(f"  … {a.src} を web用に圧縮中（CRF{CRF}）")
    mp4, poster, meta = publish_files(a.id, a.src)
    v = {"id": a.id, "date": TODAY, "status": "internal",
         "parent": a.parent, "what": a.why, "fb": [],
         "source": tilde(a.src), "media": meta}
    p["versions"].append(v)
    save(reg)
    player_page(reg, p, v)
    say(f"  ○ {a.id} を作った  {meta['duration']}秒 "
        f"{round(meta['bytes']/1e6,1)}MB（原本 {round(os.path.getsize(a.src)/1e6,1)}MB）", "g")
    say(f"    {vurl(reg, v)}")


def cmd_fb(a):
    reg = load()
    vs = allvers(reg)
    if a.id not in vs:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = vs[a.id]
    v.setdefault("fb", []).append({"date": TODAY, "what": a.what})
    save(reg)
    player_page(reg, p, v)
    say(f"  ○ {a.id} にFBを1件足した（計{len(v['fb'])}件）", "g")
    if v["status"] == "shown":
        say("    ★このリンクはクライアントに見せている。直すと新しいリンクになる", "y")


def cmd_show(a):
    reg = load()
    vs = allvers(reg)
    if a.id not in vs:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = vs[a.id]
    v["status"] = "shown"
    save(reg)
    player_page(reg, p, v)
    say(f"  ○ {a.id} を『クライアントに見せた』にした。ここで凍る", "g")
    say(f"    {vurl(reg, v)}")


def cmd_update(a):
    """小さい直し。shown なら自動で新しい版へ逃がす"""
    reg = load()
    vs = allvers(reg)
    if a.id not in vs:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = vs[a.id]
    if v["status"] == "shown":
        base = re.sub(r"\d+$", "", v["id"]) or v["id"]
        n = 2
        while f"{base}{n}" in vs:
            n += 1
        nid = f"{base}{n}"
        say(f"  ▲ {a.id} はクライアントに見せている。{nid} を新しく作ってそちらへ逃がす", "y")
        # ★source を黙って使い回さない。多くの案件で source は out/latest.mp4＝
        #   毎回上書きされる1枠なので、記録した時と中身が違う。
        #   「凍った版を直す」＝新しい動画があるはずなので、必ず明示させる。
        if not a.src:
            sys.exit(f"  ★--src で新しい動画を渡す\n"
                     f"    （前回の元動画は {v.get('source') or '不明'} だが、"
                     f"そこは上書きされている可能性がある）")
        src = a.src
        if not os.path.exists(src):
            sys.exit(f"  ★元動画が無い: {src}")
        ns = argparse.Namespace(id=nid, project=p["id"], parent=v["id"],
                                root=False, why=a.what, src=src)
        return cmd_new(ns)
    if a.src:
        if not os.path.exists(a.src):
            sys.exit(f"  ★元動画が無い: {a.src}")
        say(f"  … 差し替え中")
        _, _, meta = publish_files(v["id"], a.src)
        v["media"] = meta
        v["source"] = tilde(a.src)
    v["what"] = a.what
    v["date"] = TODAY
    save(reg)
    player_page(reg, p, v)
    say(f"  ○ {a.id} を更新（リンクはそのまま）", "g")


def cmd_rm(a):
    reg = load()
    vs = allvers(reg)
    if a.id not in vs:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = vs[a.id]
    if v["status"] == "shown" and not a.force:
        sys.exit("  ★クライアントに見せた版は消さない。どうしてもなら --force")
    p["versions"] = [x for x in p["versions"] if x["id"] != a.id]
    save(reg)
    d = os.path.join(DOCS, a.id)
    if os.path.isdir(d):
        shutil.rmtree(d)
    say(f"  ○ {a.id} を消した", "g")


def cmd_check(a):
    sys.exit(1 if check(load()) else 0)


def cmd_build(a):
    reg = load()
    if check(reg):
        sys.exit("  ★台帳にエラーがある。直してから")
    # 再生ページを全部作り直す
    for p in reg["projects"]:
        for v in p["versions"]:
            if v["status"] != "draft" and not v.get("url"):
                player_page(reg, p, v)
    # 画面はLPと共通の1枚。動画専用のページは作らない
    env = dict(os.environ, VV_CHECKED="1")     # 上で検査済み。二度打たない
    r = subprocess.run([sys.executable, os.path.join(ROOT, "build_lp_index.py")],
                       capture_output=True, text=True, env=env)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode:
        sys.exit("  ★生成に失敗。push しない")
    if not a.push:
        say("\n  （公開していない。--push で commit & push）")
        return
    # ★このリポジトリは公開。lpv.py と同じガードをここでも通す。
    #   押す口が2つあるのにガードが片方にしか無い、が今回いちばん危なかった穴。
    say("── 公開前の検査 ──")
    import publish_guard
    publish_guard.enforce(ROOT, say, sys.exit)
    say("  … push", "b")
    for cmd in (["git", "-C", ROOT, "add", "-A"],):
        if subprocess.run(cmd).returncode:
            sys.exit("  ★git add に失敗")
    st = subprocess.run(["git", "-C", ROOT, "status", "--porcelain"],
                        capture_output=True, text=True).stdout.strip()
    if not st:
        say("  ・変更なし"); return
    if subprocess.run(["git", "-C", ROOT, "commit", "-q", "-m",
                       f"動画の版を更新 ({TODAY})\n\n"
                       "Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"]).returncode:
        sys.exit("  ★commit に失敗")
    if subprocess.run(["git", "-C", ROOT, "push", "-q", "origin", "main"]).returncode:
        sys.exit("  ★push に失敗（手元は commit 済み。原因を直して git push）")
    say(f"\n  ○ 公開した: {reg['base_url'].rsplit('/video/',1)[0]}/lp/", "g")


def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("ls"); s.add_argument("project", nargs="?"); s.set_defaults(f=cmd_ls)
    s = sub.add_parser("new-project")
    s.add_argument("id"); s.add_argument("--name", required=True)
    s.add_argument("--client", required=True); s.add_argument("--note")
    s.set_defaults(f=cmd_new_project)
    s = sub.add_parser("new")
    s.add_argument("id"); s.add_argument("-p", "--project", required=True)
    s.add_argument("--from", dest="parent"); s.add_argument("--root", action="store_true")
    s.add_argument("--why", required=True); s.add_argument("--src", required=True)
    s.set_defaults(f=cmd_new)
    s = sub.add_parser("fb"); s.add_argument("id"); s.add_argument("--what", required=True)
    s.set_defaults(f=cmd_fb)
    s = sub.add_parser("show"); s.add_argument("id"); s.set_defaults(f=cmd_show)
    s = sub.add_parser("update")
    s.add_argument("id"); s.add_argument("--what", required=True); s.add_argument("--src")
    s.set_defaults(f=cmd_update)
    s = sub.add_parser("rm"); s.add_argument("id"); s.add_argument("--force", action="store_true")
    s.set_defaults(f=cmd_rm)
    s = sub.add_parser("check"); s.set_defaults(f=cmd_check)
    s = sub.add_parser("build"); s.add_argument("--push", action="store_true")
    s.set_defaults(f=cmd_build)

    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
