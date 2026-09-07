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
    python3 vv.py compose <版id> --project <slug> 構成（文面・画像・アバター）を取り込む
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


# ── 構成（1本を Hook / Body1 / Body2 / CTA の4枠で見る）──────────
# ★台本の1行＝1セクション。この4つが動画の骨格で、
#   「どの枠にどの文面と、どの画像と、どのアングルのアバターを置いたか」が
#   案件をまたいで比べたい唯一の情報。だから台帳に持ってシートで並べる。
SEC = ["hook", "body1", "body2", "cta"]
SEC_LABEL = {"hook": "Hook", "body1": "Body1", "body2": "Body2", "cta": "CTA"}
# Remotion に渡す素材名 → 人が読むアングル名
ANGLE = {"video/wide.mp4": "正面", "video/close.mp4": "横"}
WORK = os.path.expanduser("~/video-edit-tool/projects")
PART_W = 420           # 構成シートに出すサムネの幅


def _thumb(src, dst, at=None):
    """静止画 or 動画の1コマを小さくして置く。at を渡すとその秒数のコマ"""
    F = ffmpeg()
    cmd = [F, "-hide_banner", "-y"]
    if at is not None:
        cmd += ["-ss", str(at)]
    cmd += ["-i", src, "-frames:v", "1", "-vf", f"scale={PART_W}:-1", "-q:v", "4", dst]
    _run(cmd, f"{os.path.basename(dst)} の書き出し", 300)


def compose_from_project(slug):
    """~/video-edit-tool/projects/<slug>/ から構成を組み立てる。

    ★セクションの切れ目は timing.json（実際にそう喋った区間）が正。
      ただし【喋り出しの位置では割らない】。絵は次の行より少し先に変わるのが普通で、
      実測でも 0.2秒ほど早い。境目は「前の行の言い終わり」と「次の行の言い出し」の
      真ん中＝無音の中央に置く。ここで割ると、実際のカット位置とちょうど一致する。
    """
    d = os.path.join(WORK, slug)
    cfg = json.load(open(os.path.join(d, "project.json"), encoding="utf-8"))
    tm = json.load(open(os.path.join(d, "timing.json"), encoding="utf-8"))
    S = tm["sections"]
    bounds = [0.0] + [(S[i - 1]["end"] + S[i]["start"]) / 2
                      for i in range(1, len(S))] + [1e9]

    secs = []
    for i, key in enumerate(SEC):
        line = cfg["lines"][i] if i < len(cfg["lines"]) else ""
        shots = []
        for sh in cfg["shots"]:
            t = sh["start"]
            if not (bounds[i] <= t < bounds[i + 1]):
                continue
            end = sh.get("end") or tm["total"] + cfg.get("tail", 0.55)
            src = sh["src"]
            if src in ANGLE:
                shots.append({"kind": "avatar", "label": ANGLE[src],
                              "dur": round(end - sh["start"], 2)})
            else:
                shots.append({"kind": "image", "file": os.path.basename(src),
                              "dur": round(end - sh["start"], 2)})
        img = next((s["file"] for s in shots if s["kind"] == "image"), None)
        secs.append({"key": key, "text": line, "chars": len(line),
                     "image": img, "shots": shots})
    return {"sections": secs, "logo": bool(cfg.get("logo")),
            "avatar": ["正面", "横"], "work": slug}


def publish_parts(vid, slug, comp):
    """構成シートに出す小さな画像を docs/video/<版id>/parts/ に置く"""
    d = os.path.join(DOCS, vid, "parts")
    os.makedirs(d, exist_ok=True)
    a = os.path.join(WORK, slug, "assets")
    for s in comp["sections"]:
        if s["image"]:
            src = os.path.join(a, s["image"])
            if os.path.exists(src):
                _thumb(src, os.path.join(d, s["image"]))
    logo = os.path.join(a, "logo.png")
    if os.path.exists(logo):
        _thumb(logo, os.path.join(d, "logo.png"))
    # アバターは2カメ。動画の中ほどの1コマを取る（頭は口が閉じていて表情が死ぬ）
    for name, out in (("wide.mp4", "avatar_wide.jpg"), ("close.mp4", "avatar_close.jpg")):
        src = os.path.join(WORK, slug, "video", name)
        if os.path.exists(src):
            _thumb(src, os.path.join(d, out), at=probe(src)["duration"] * 0.4)


def parse_tsv(path):
    """スプレッドシートから貼った台本を読む。

    1行＝1本。タブ区切りで「文面・字数・文面・字数…」と並ぶ形をそのまま受ける。
    ★空セルと数字セルは読み飛ばして、残った文字列を頭から Hook/Body1/Body2/CTA に当てる。
      列の空き方はシートによって変わるので、位置ではなく「数字でないもの」で拾う。
    ★字数はシート側の数字を信じない。文面から数え直して、食い違ったらその場で言う。
    """
    rows = []
    for n, line in enumerate(open(path, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip():
            continue
        cells = [c.strip() for c in line.split("\t")]
        texts = [c for c in cells if c and not re.fullmatch(r"[0-9]+", c)]
        nums = [int(c) for c in cells if re.fullmatch(r"[0-9]+", c)]
        if len(texts) != len(SEC):
            sys.exit(f"  ★{n}行目: 文面が{len(texts)}個。{len(SEC)}個"
                     f"（{' / '.join(SEC_LABEL[k] for k in SEC)}）で書く\n    → {texts}")
        rows.append((texts, nums))
    if not rows:
        sys.exit(f"  ★{path} に台本が無い")
    return rows


def cmd_plan(a):
    """台本だけの版をまとめて登録する。動画はまだ無い＝draft。"""
    reg = load()
    p = proj(reg, a.project)
    vs = allvers(reg)
    if a.parent and a.parent not in vs:
        sys.exit(f"  ★派生元 '{a.parent}' が台帳に無い")
    rows = parse_tsv(a.tsv)
    made = []
    for i, (texts, nums) in enumerate(rows):
        vid = a.prefix if i == 0 else f"{a.prefix}{i + 1}"
        if vid in vs:
            sys.exit(f"  ★版id '{vid}' はもうある。--prefix を変える")
        secs = []
        for j, key in enumerate(SEC):
            txt = texts[j]
            secs.append({"key": key, "text": txt, "chars": len(txt),
                         "image": None, "shots": []})
            if j < len(nums) and nums[j] != len(txt):
                say(f"    ▲ {vid} {SEC_LABEL[key]}: シートは{nums[j]}字だが"
                    f"数え直すと{len(txt)}字", "y")
        v = {"id": vid, "date": TODAY, "status": "draft", "parent": a.parent,
             "what": (a.why or "") + ("　" if a.why else "") + f"Hook「{texts[0]}」",
             "fb": [],
             "comp": {"work": None, "logo": None, "avatar": None,
                      "planned": True, "sections": secs}}
        p["versions"].append(v)
        made.append(v)
        vs[vid] = (p, v)
    save(reg)
    say(f"  ○ 台本 {len(made)}本を登録した（未公開・動画なし）", "g")
    for v in made:
        say(f"    {v['id']:<8} " + " / ".join(
            f"{s['chars']}字" for s in v["comp"]["sections"]))
        for s in v["comp"]["sections"]:
            say(f"       {SEC_LABEL[s['key']]:<6} {s['text']}")
    # 全部の版で同じ文面になっている枠＝変えていない枠。何を試しているのかを言う
    cols = {k: {v["comp"]["sections"][i]["text"] for v in made}
            for i, k in enumerate(SEC)}
    var = [SEC_LABEL[k] for k in SEC if len(cols[k]) > 1]
    fix = [SEC_LABEL[k] for k in SEC if len(cols[k]) == 1]
    if var and fix:
        say(f"    → 変えているのは {'・'.join(var)} だけ。"
            f"{'・'.join(fix)} は全本共通＝{'・'.join(var)}のA/Bになっている")


def cmd_compose(a):
    reg = load()
    vs = allvers(reg)
    if a.id not in vs:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = vs[a.id]
    if a.copy:
        if a.copy not in vs:
            sys.exit(f"  ★写し元 '{a.copy}' が台帳に無い")
        v["comp"] = json.loads(json.dumps(vs[a.copy][1].get("comp") or {}))
        save(reg)
        say(f"  ○ {a.id} の構成を {a.copy} から写した", "g")
        return
    if a.json:
        comp = json.load(open(a.json, encoding="utf-8"))
        slug = comp.get("work")
    else:
        if not os.path.isdir(os.path.join(WORK, a.project)):
            sys.exit(f"  ★作業場が無い: {os.path.join(WORK, a.project)}")
        comp = compose_from_project(a.project)
        slug = a.project
    # 素材は作業場から取る。--parts-from で別の作業場を指せる（1本目のように
    # project.json が残っていない版でも、同じアバター・同じ素材なら流用できる）
    publish_parts(a.id, a.parts_from or slug, comp)
    v["comp"] = comp
    save(reg)
    player_page(reg, p, v)
    say(f"  ○ {a.id} の構成を取り込んだ", "g")
    for s in comp["sections"]:
        chain = " → ".join((x["label"] if x["kind"] == "avatar" else x["file"])
                           + f"({x['dur']}s)" for x in s["shots"])
        say(f"    {SEC_LABEL[s['key']]:<6} {s['chars']:>2}字  {s['text']}")
        say(f"           {chain or '—'}")


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

    # ★動画がまだ無い版（型そのもの・これから作る台本）も版として持つ。
    #   台本の段階から系統に載せておかないと、あとで「どの案から派生したか」が消える。
    if getattr(a, "draft", False):
        if a.src:
            sys.exit("  ★--draft と --src は一緒に使えない")
        v = {"id": a.id, "date": TODAY, "status": "draft",
             "parent": a.parent, "what": a.why, "fb": []}
        p["versions"].append(v)
        save(reg)
        say(f"  ○ {a.id} を作った（未公開・動画なし）", "g")
        return v
    if not a.src:
        sys.exit("  ★--src が要る（動画のない版なら --draft）")
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
    return v


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
                                root=False, draft=False, why=a.what, src=src)
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
    s.add_argument("--why", required=True); s.add_argument("--src")
    s.add_argument("--draft", action="store_true",
                   help="動画のない版（型・これから作る台本）を作る")
    s.set_defaults(f=cmd_new)
    s = sub.add_parser("fb"); s.add_argument("id"); s.add_argument("--what", required=True)
    s.set_defaults(f=cmd_fb)
    s = sub.add_parser("show"); s.add_argument("id"); s.set_defaults(f=cmd_show)
    s = sub.add_parser("compose")
    s.add_argument("id")
    s.add_argument("--project", help="~/video-edit-tool/projects/<slug>")
    s.add_argument("--json", help="構成を手で書いた json（project.json が無い版用）")
    s.add_argument("--parts-from", dest="parts_from",
                   help="サムネだけ別の作業場から取る（素材が共通の時）")
    s.add_argument("--copy", help="別の版の構成をそのまま写す（型を配る時）")
    s.set_defaults(f=cmd_compose)
    s = sub.add_parser("plan", help="台本だけの版をまとめて登録（TSVを貼る）")
    s.add_argument("project")
    s.add_argument("--tsv", required=True, help="1行=1本。文面と字数がタブ区切り")
    s.add_argument("--prefix", required=True, help="版idの頭（例 mpure → mpure/mpure2/mpure3）")
    s.add_argument("--from", dest="parent", help="派生元の版id")
    s.add_argument("--why", help="what の頭に付ける説明")
    s.set_defaults(f=cmd_plan)
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
