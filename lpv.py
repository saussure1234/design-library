#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""LP 版管理（lp-registry.json）を操作する唯一の入口。

  ★なぜ CLI にしたか
    台帳を手で書く運用は必ず破綻する。2026-08-31 に esl6 を esl3 から作った時、
    その場で「親は esl3」と書く動機はどこにも無かった。結果、本線 esl2 が
    8/17 で止まったまま放置され、クライアントは古い版を見続けた。
    だから台帳は【人が書くもの】ではなく【版を作る操作の副産物】にする。
    版のディレクトリは lpv.py new でしか作らない。cp -r で作らない。

  使い方
    python3 lpv.py ls [案件id]                     いま何がどうなっているか
    python3 lpv.py new-project <案件id> --name ... --client ...
    python3 lpv.py new <版id> -p <案件id> --from <派生元> --why "..." [--src DIR]
    python3 lpv.py fb <版id> --who 施主 --what "..."      ★直す前に打つ
    python3 lpv.py merge <版id>                    本線に取り込んだ
    python3 lpv.py check                           台帳の検査だけ
    python3 lpv.py build [--push]                  検査→ツール生成→(--pushで公開)

  ★ new は --from を必ず要求する。省略できない（--root は初版のときだけ）。
  ★ --from が案件の本線(main)と違うときは止まる。--branch を付けない限り進まない。
    これが 8/31 に止めたかった一点。
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(ROOT, "lp-registry.json")
DOCS = os.path.join(ROOT, "docs")
STATUS = ["live", "frozen", "review", "draft"]
TODAY = datetime.date.today().isoformat()

C = {"r": "\033[31m", "y": "\033[33m", "g": "\033[32m", "b": "\033[1m", "_": "\033[0m"}
def say(s, c=None): print((C[c] + s + C["_"]) if c and sys.stdout.isatty() else s)


# ── 台帳の読み書き ────────────────────────────────────────────
def load():
    return json.load(open(REG, encoding="utf-8"))


def save(reg):
    reg["updated"] = TODAY
    with open(REG, "w", encoding="utf-8") as f:
        json.dump(reg, f, ensure_ascii=False, indent=2)
        f.write("\n")


def proj(reg, pid):
    for p in reg["projects"]:
        if p["id"] == pid:
            return p
    sys.exit(f"  ★案件 '{pid}' が台帳に無い。lpv.py ls で一覧を見るか new-project で作る")


def allvers(reg):
    """版id → (案件, 版)"""
    return {v["id"]: (p, v) for p in reg["projects"] for v in p["versions"]}


def vurl(reg, v):
    return v.get("url") or reg["base_url"] + v["id"] + "/"


# ── 検査 ──────────────────────────────────────────────────────
def check(reg, quiet=False):
    """台帳のおかしい所を全部出す。戻り値は致命的エラーの件数。"""
    err, warn = [], []
    seen = {}
    for p in reg["projects"]:
        ids = [v["id"] for v in p["versions"]]
        for v in p["versions"]:
            i = v["id"]
            if i in seen:
                err.append(f"版id '{i}' が重複（{seen[i]} と {p['id']}）")
            seen[i] = p["id"]
            if v.get("status") not in STATUS:
                err.append(f"{i}: status '{v.get('status')}' は語彙外（{'/'.join(STATUS)}）")
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", str(v.get("date", ""))):
                err.append(f"{i}: date が YYYY-MM-DD でない → {v.get('date')!r}")
            if not v.get("what"):
                warn.append(f"{i}: what（変更内容）が空。後から誰も用途を思い出せない")
            # 派生元
            if v.get("parent") is None:
                pass
            elif v["parent"] not in ids and v["parent"] not in seen:
                warn.append(f"{i}: 派生元 '{v['parent']}' が台帳に無い（別案件なら先に登録する）")
            # 公開先の実在
            if not v.get("url") and v.get("status") != "draft":
                if not os.path.exists(os.path.join(DOCS, i, "index.html")):
                    err.append(f"{i}: docs/{i}/index.html が無い。url を書くか版を置く")
        # 循環（a→b→a）。これを見逃すと管理ツールが無限再帰でページごと固まる
        by = {v["id"]: v for v in p["versions"]}
        cyc = set()
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
        # 本線
        if not p.get("main"):
            warn.append(f"{p['id']}: 本線(main)が未設定")
        elif p["main"] not in ids:
            err.append(f"{p['id']}: 本線 '{p['main']}' が版一覧に無い")
        for v in p["versions"]:
            if v.get("status") == "live" and not v.get("merged"):
                warn.append(f"{v['id']}: 本番(live)なのに merged:false")

    if not quiet:
        for e in err:
            say("  ✗ " + e, "r")
        for w in warn:
            say("  ▲ " + w, "y")
        if not err and not warn:
            say("  ○ 台帳に問題なし", "g")
    return len(err)


# ── 各コマンド ────────────────────────────────────────────────
def cmd_ls(a):
    reg = load()
    for p in reg["projects"]:
        if a.project and p["id"] != a.project:
            continue
        main = p.get("main") or "—"
        say(f"\n■ {p['name']}  [{p['id']}]  本線: {main}", "b")
        for v in p["versions"]:
            m = "反映済" if v.get("merged") else "未反映"
            head = "◀本線" if v["id"] == p.get("main") else "     "
            say(f"   {head} {v['id']:<16} {v.get('status','?'):<7} {m:<5} "
                f"親={v.get('parent') or '初版':<10} {v.get('date','')}  {v.get('what','')[:34]}")
            if v.get("alert"):
                say(f"          ▲ {v['alert']}", "y")
        n = len([v for v in p["versions"] if not v.get("merged")])
        if n:
            say(f"   → 本線未反映が {n} 件。どれを取り込むか決まったら lpv.py merge <版id>", "y")


def cmd_new_project(a):
    reg = load()
    if any(p["id"] == a.id for p in reg["projects"]):
        sys.exit(f"  ★案件 '{a.id}' はもうある")
    reg["projects"].append({"id": a.id, "name": a.name, "client": a.client,
                            "main": None, "note": a.note or "", "versions": []})
    save(reg)
    say(f"  ○ 案件を作った: {a.name} [{a.id}]", "g")
    say(f"    次: python3 lpv.py new <版id> -p {a.id} --root --why \"初版\" --src <フォルダ>")


def cmd_new(a):
    reg = load()
    p = proj(reg, a.project)
    av = allvers(reg)
    if a.id in av:
        sys.exit(f"  ★版id '{a.id}' はもう使われている（{av[a.id][0]['id']}）")
    if not re.fullmatch(r"[a-z0-9][a-z0-9._-]*", a.id):
        sys.exit("  ★版idは英小文字・数字・- _ . のみ（URLになるので）")

    # ── 派生元の決定。ここが台帳の生命線なので省略させない ──
    if a.root:
        parent = None
    else:
        if not a.frm:
            sys.exit("  ★--from <派生元の版id> が要る。初版なら --root")
        if a.frm not in av:
            sys.exit(f"  ★派生元 '{a.frm}' が台帳に無い。lpv.py ls で確認する")
        parent = a.frm
        # ★8/31 のミスを止める一点
        if p.get("main") and parent != p["main"] and not a.branch:
            say(f"\n  ▲ 本線は '{p['main']}' なのに、'{parent}' から派生させようとしている。", "y")
            say("    このまま進めると本線から外れた枝で作業が続き、", "y")
            say("    施主が見ているリンクだけ古いまま取り残される（前回これで事故った）。", "y")
            say("\n    本当に枝を伸ばすなら --branch を付けて実行し直す。")
            say(f"    本線を乗り換えるなら先に：python3 lpv.py merge {parent}")
            sys.exit(1)

    # ── 中身を用意する ──
    dst = os.path.join(DOCS, a.id)
    src = a.src or (os.path.join(DOCS, parent) if parent and
                    os.path.isdir(os.path.join(DOCS, parent)) else None)
    if a.url:
        say(f"  ・公開先は外部: {a.url}（ファイルは複製しない）")
    elif os.path.exists(dst):
        say(f"  ・docs/{a.id}/ はもうある。中身はそのまま使う", "y")
    elif src and os.path.isdir(src):
        shutil.copytree(src, dst)
        n = sum(len(f) for _, _, f in os.walk(dst))
        say(f"  ・{os.path.relpath(src, ROOT)} → docs/{a.id}/ に複製（{n}ファイル）")
    else:
        sys.exit("  ★中身が無い。--src <フォルダ> か --url <外部URL> を指定する")

    v = {"id": a.id, "date": a.date or TODAY, "status": a.status,
         "parent": parent, "what": a.why, "merged": False, "fb": []}
    if a.url:
        v["url"] = a.url
    if parent and p.get("main") and parent != p["main"]:
        v["alert"] = f"本線 {p['main']} ではなく {parent} から派生した枝"
    p["versions"].append(v)
    # 案件の最初の版が本番なら、それが本線。ここで決めておかないと main 未設定のまま残る
    if not p.get("main") and a.status == "live":
        p["main"] = a.id
        v["merged"] = True
        say(f"  ・案件 {p['id']} の本線を {a.id} にした（最初の本番版）")
    save(reg)

    say(f"\n  ○ 版を登録した: {a.id}  （親 {parent or '初版'} / {a.status} / 本線未反映）", "g")
    say(f"    {vurl(reg, v)}")
    say(f"    次: python3 lpv.py build --push で公開＆管理ツールに反映")


def cmd_fb(a):
    reg = load()
    av = allvers(reg)
    if a.id not in av:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    _, v = av[a.id]
    v.setdefault("fb", []).append({"date": a.date or TODAY, "from": a.who, "what": a.what})
    save(reg)
    say(f"  ○ FBを記録: {a.id} ← {a.who}「{a.what}」", "g")
    say(f"    次: 直す前にこれで良い。直したら新しい版を作る →")
    say(f"    python3 lpv.py new <新しい版id> -p {av[a.id][0]['id']} --from {a.id} --why \"...\"")


def cmd_merge(a):
    reg = load()
    av = allvers(reg)
    if a.id not in av:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = av[a.id]
    old = p.get("main")
    v["merged"] = True
    v["status"] = "live"
    v.pop("alert", None)
    p["main"] = a.id
    for o in p["versions"]:
        if o["id"] != a.id and o.get("status") == "live":
            o["status"] = "frozen"
            o.pop("alert", None)
    save(reg)
    say(f"  ○ 本線を {old or '—'} → {a.id} にした。{a.id} は反映済み・本番", "g")
    say(f"    施主に渡すリンクはこれ: {vurl(reg, v)}")


def cmd_check(a):
    sys.exit(1 if check(load()) else 0)


def cmd_build(a):
    reg = load()
    say("── 台帳の検査 ──")
    if check(reg):
        sys.exit("\n  ★エラーがあるので生成しない。上を直してからやり直す")
    r = subprocess.run([sys.executable, os.path.join(ROOT, "build_lp_index.py")],
                       cwd=ROOT, capture_output=True, text=True)
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode:
        sys.exit("  ★生成に失敗")
    if not a.push:
        say("\n  （公開していない。--push で commit & push）")
        return
    subprocess.run(["git", "add", "-A"], cwd=ROOT, check=True)
    st = subprocess.run(["git", "status", "--porcelain"], cwd=ROOT,
                        capture_output=True, text=True).stdout.strip()
    if not st:
        say("  ・変更なし"); return
    subprocess.run(["git", "commit", "-q", "-m", a.msg or f"LP版管理を更新 ({TODAY})"],
                   cwd=ROOT, check=True)
    subprocess.run(["git", "push", "-q", "origin", "main"], cwd=ROOT, check=True)
    say(f"\n  ○ 公開した: {reg['base_url']}lp/", "g")


# ── 引数 ──────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="LP 版管理", formatter_class=argparse.RawTextHelpFormatter)
    sp = ap.add_subparsers(dest="cmd", required=True)

    s = sp.add_parser("ls", help="現状を出す")
    s.add_argument("project", nargs="?")
    s.set_defaults(f=cmd_ls)

    s = sp.add_parser("new-project", help="案件を作る")
    s.add_argument("id"); s.add_argument("--name", required=True)
    s.add_argument("--client", required=True); s.add_argument("--note")
    s.set_defaults(f=cmd_new_project)

    s = sp.add_parser("new", help="版を作る（派生元は省略できない）")
    s.add_argument("id")
    s.add_argument("-p", "--project", required=True)
    s.add_argument("--from", dest="frm", help="派生元の版id")
    s.add_argument("--root", action="store_true", help="初版（派生元なし）")
    s.add_argument("--branch", action="store_true", help="本線以外から派生させることを承知した")
    s.add_argument("--why", required=True, help="何を変えたか。後で用途不明にならないように")
    s.add_argument("--src", help="中身のフォルダ。省略時は派生元を複製")
    s.add_argument("--url", help="design-library 以外に公開する場合の実URL")
    s.add_argument("--status", default="review", choices=STATUS)
    s.add_argument("--date")
    s.set_defaults(f=cmd_new)

    s = sp.add_parser("fb", help="FBを記録する（直す前に打つ）")
    s.add_argument("id"); s.add_argument("--who", default="施主")
    s.add_argument("--what", required=True); s.add_argument("--date")
    s.set_defaults(f=cmd_fb)

    s = sp.add_parser("merge", help="本線に取り込んだ")
    s.add_argument("id"); s.set_defaults(f=cmd_merge)

    s = sp.add_parser("check", help="台帳の検査だけ")
    s.set_defaults(f=cmd_check)

    s = sp.add_parser("build", help="検査→生成→(--pushで公開)")
    s.add_argument("--push", action="store_true")
    s.add_argument("-m", "--msg")
    s.set_defaults(f=cmd_build)

    a = ap.parse_args()
    a.f(a)


if __name__ == "__main__":
    main()
