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
    python3 lpv.py fb <版id> --what "..."           ★直す前に打つ
    python3 lpv.py update <版id> --what "..."       小さい直し
    python3 lpv.py show <版id>                     クライアントに見せた（ここで凍る）
    python3 lpv.py check                           台帳の検査だけ
    python3 lpv.py build [--push]                  検査→ツール生成→(--pushで公開)

  ★ 状態は3つ。
      未公開            まだリンクが無い
      公開（自分用）    リンクはあるが、自分の確認用
      公開（クライアント） 見せた。★ここでそのリンクは凍る
    見せたリンクを update すると、自動で新しいリンクを作ってそちらへ逃がす。
    クライアントが見ている最中に中身が変わるのが一番まずいため。
  ★ new は --from を必ず要求する。省略できない（--root は初版のときだけ）。
    これを書かせるのが台帳の目的。どこから枝が伸びたかを後から追えるようにする。
"""
import argparse, datetime, json, os, re, shutil, subprocess, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(ROOT, "lp-registry.json")
DOCS = os.path.join(ROOT, "docs")
# ★状態は3つ。draft→internal→shown と一方通行で進む。
#   shown（クライアントに見せた）になったリンクは、そこで凍る。
#   以降の直しは自動で新しいリンクへ逃がす（update が勝手に new する）。
STATUS = ["draft", "internal", "shown"]
LABEL = {"draft": "未公開", "internal": "公開（自分用）", "shown": "公開（クライアント）"}
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

    if not quiet:
        for e in err:
            say("  ✗ " + e, "r")
        for w in warn:
            say("  ▲ " + w, "y")
        if not err and not warn:
            say("  ○ 台帳に問題なし", "g")
    return len(err)


# ── 各コマンド ────────────────────────────────────────────────
FLOW = os.path.join(ROOT, "lp-flow.json")


def steps():
    """16工程を読む。無ければ空。"""
    try:
        return json.load(open(FLOW, encoding="utf-8"))["steps"]
    except Exception:
        return []


def step_label(n):
    """台帳の工程番号を「工程6：LP構成案を作る」の形にする。"""
    if n is None:
        return "工程：未記録"
    for s in steps():
        if s.get("n") == n:
            return f"工程{n}：{s.get('name','')}"
    return f"工程{n}"


def cmd_step(a):
    reg = load()
    p = next((x for x in reg["projects"] if x["id"] == a.project), None)
    if not p:
        sys.exit(f"  ★案件 '{a.project}' が台帳に無い")
    if a.n is None:
        say(f"  {p['name']}  {step_label(p.get('step'))}")
        nxt = p.get("step")
        if nxt is not None:
            say(f"    次: {step_label(nxt + 1)}")
        return
    ss = steps()
    if ss and not any(s.get("n") == a.n for s in ss):
        sys.exit(f"  ★工程 {a.n} は lp-flow.json に無い（0〜{max(s['n'] for s in ss)}）")
    p["step"] = a.n
    save(reg)
    say(f"  ○ {p['name']} → {step_label(a.n)}", "g")
    cur = next((s for s in ss if s.get("n") == a.n), None)
    if cur:
        say(f"    出来上がるもの: {cur.get('out') or '-'}")
        if cur.get("skill"):
            say(f"    使う手順書: ~/.claude/skills/{cur['skill']}/")


def cmd_ls(a):
    reg = load()
    for p in reg["projects"]:
        if a.project and p["id"] != a.project:
            continue
        say(f"\n■ {p['name']}  [{p['id']}]  リンク {len(p['versions'])}本"
            + ("   " + step_label(p.get("step")) if p.get("step") is not None else "   工程：未記録"), "b")
        for v in p["versions"]:
            u = f"更新{len(v['updates'])}回" if v.get("updates") else ""
            say(f"   {v['id']:<16} {LABEL.get(v.get('status'),'?'):<16} "
                f"親={v.get('parent') or '初版':<10} {v.get('date','')} {u:<7} {v.get('what','')[:32]}")
            if v.get("alert"):
                say(f"       ▲ {v['alert']}", "y")


def cmd_new_project(a):
    reg = load()
    if any(p["id"] == a.id for p in reg["projects"]):
        sys.exit(f"  ★案件 '{a.id}' はもうある")
    reg["projects"].append({"id": a.id, "name": a.name, "client": a.client,
                            "note": a.note or "", "versions": []})
    save(reg)
    say(f"  ○ 案件を作った: {a.name} [{a.id}]", "g")
    say(f"    次: python3 lpv.py new <版id> -p {a.id} --root --why \"初版\" --src <フォルダ>")


def cmd_rename_project(a):
    """案件の表示名などを直す。台帳を手で開かないための入口。"""
    reg = load()
    p = proj(reg, a.id)
    for k in ("name", "client", "note"):
        v = getattr(a, k)
        if v is not None:
            old = p.get(k, "")
            p[k] = v
            say(f"  ○ {k}: {old} → {v}", "g")
    save(reg)


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
        # ★リンクを増やすのは「別案として並べて見せる」時だけ。
        #   小さい直しでリンクが増えると、クライアントはどれを見ればいいか分からなくなる。
        if not a.alt:
            say(f"\n  ▲ 新しいリンクを作ろうとしている（{parent} から）。", "y")
            say("    小さい直しなら、リンクを増やさずに中身を直す：", "y")
            say(f"      python3 lpv.py update {parent} --what \"...\"")
            say("\n    別案として並べて見せるなら --alt を付けて実行し直す。")
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
         "parent": parent, "what": a.why, "updates": [], "fb": []}
    if a.url:
        v["url"] = a.url
    if a.alert:
        v["alert"] = a.alert
    p["versions"].append(v)
    save(reg)

    say(f"\n  ○ リンクを登録した: {a.id}  （派生元 {parent or '初版'} / "
        f"{'公開' if a.status == 'live' else '未公開'}）", "g")
    say(f"    {vurl(reg, v)}")
    say(f"    次: python3 lpv.py build --push で公開＆管理ツールに反映")


def cmd_fb(a):
    reg = load()
    av = allvers(reg)
    if a.id not in av:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    _, v = av[a.id]
    v.setdefault("fb", []).append({"date": a.date or TODAY, "what": a.what})
    save(reg)
    say(f"  ○ FBを記録: {a.id} ←「{a.what}」", "g")
    say("    次はどっちか：")
    say(f"      小さい直し（同じリンクのまま）… lpv.py update {a.id} --what \"...\"")
    say(f"      別案として見せる（新しいリンク）… lpv.py new <新id> -p {av[a.id][0]['id']} --from {a.id} --alt --why \"...\"")


def next_id(cur, taken):
    """esl12 → esl13 のように連番を進める。数字で終わらないものは -2, -3 と足す。"""
    m = re.match(r"^(.*?)(\d+)$", cur)
    if m:
        head, n = m.group(1), int(m.group(2))
        while f"{head}{n+1}" in taken:
            n += 1
        return f"{head}{n+1}"
    i = 2
    while f"{cur}-{i}" in taken:
        i += 1
    return f"{cur}-{i}"


def cmd_show(a):
    """クライアントに見せた、と記録する。ここから先そのリンクは凍る。"""
    reg = load(); av = allvers(reg)
    if a.id not in av:
        sys.exit(f"  ★'{a.id}' が台帳に無い")
    p, v = av[a.id]
    if v.get("status") == "draft":
        sys.exit(f"  ★{a.id} は未公開。まだリンクが無い")
    v["status"] = "shown"
    v.setdefault("shown_on", a.date or TODAY)
    save(reg)
    say(f"  ○ {a.id} を「クライアントに見せた」にした（{v['shown_on']}）", "g")
    say(f"    {vurl(reg, v)}")
    say("  ・このリンクはここで凍る。次に直すと自動で新しいリンクが出る", "y")


def cmd_update(a):
    """同じリンクのまま中身を直した。★新しいリンクは作らない。

    小さい直しでリンクを増やすと、クライアントは「どれを見ればいいのか」が分からなくなる。
    リンクを増やすのは【別案として並べて見せたい時】だけ。
    """
    reg = load()
    av = allvers(reg)
    if a.id not in av:
        sys.exit(f"  ★版 '{a.id}' が台帳に無い")
    p, v = av[a.id]

    # ★クライアントに見せたリンクは直さない。見ている最中に中身が変わるのが一番まずい。
    #   指示が無ければ自動で新しいリンクへ逃がす。
    if v.get("status") == "shown" and not a.same:
        nid = next_id(a.id, set(av))
        src = os.path.join(DOCS, a.id)
        if v.get("url"):
            sys.exit(f"  ★{a.id} は外部URL（{v['url']}）。新しいリンク先を決めてから "
                     f"lpv.py new を使う")
        if not os.path.isdir(src):
            sys.exit(f"  ★docs/{a.id}/ が無いので複製できない")
        shutil.copytree(src, os.path.join(DOCS, nid))
        p["versions"].append({"id": nid, "date": a.date or TODAY, "status": "internal",
                              "parent": a.id, "what": a.what, "updates": [], "fb": []})
        save(reg)
        say(f"\n  ▲ {a.id} はクライアントに見せたリンク。中身は直さない。", "y")
        say(f"  ○ 新しいリンクを作った: {nid}（派生元 {a.id} / 公開（自分用））", "g")
        say(f"    {vurl(reg, {'id': nid})}")
        say(f"    docs/{nid}/ を直してから lpv.py build --push")
        say(f"    ※どうしても同じリンクを直すなら --same（クライアントの目の前で中身が変わる）")
        return

    v.setdefault("updates", []).append({"date": a.date or TODAY, "what": a.what})
    v["date"] = a.date or TODAY
    save(reg)
    n = len(v["updates"])
    say(f"  ○ {a.id} を更新（通算 {n} 回目）: {a.what}", "g")
    say(f"    リンクは同じ: {vurl(reg, v)}")
    if v.get("status") == "shown":
        say("  ▲ クライアントに見せたリンクの中身を直した。相手の見え方が変わる", "y")


def cmd_rm(a):
    """リンクを台帳から外す。★docs/ のファイルは消さない（開ける状態のまま殺さない）。"""
    reg = load()
    av = allvers(reg)
    if a.id not in av:
        sys.exit(f"  ★'{a.id}' が台帳に無い")
    p, v = av[a.id]
    kids = [x["id"] for x in p["versions"] if x.get("parent") == a.id]
    if kids and not a.force:
        sys.exit(f"  ★{a.id} を派生元にしているリンクがある → {', '.join(kids)}\n"
                 f"    先にそちらの派生元を直すか、--force で祖父につなぎ直して外す")
    for x in p["versions"]:
        if x.get("parent") == a.id:
            x["parent"] = v.get("parent")
    p["versions"] = [x for x in p["versions"] if x["id"] != a.id]
    save(reg)
    say(f"  ○ 台帳から外した: {a.id}", "g")
    if os.path.isdir(os.path.join(DOCS, a.id)):
        say(f"  ・docs/{a.id}/ は残っている。リンクは生きたまま：{vurl(reg, v)}")
        say("  ・本当に消すなら手で: git rm -r docs/" + a.id, "y")


def cmd_rm_project(a):
    """案件を台帳から外す。★docs/ のファイルは消さない。"""
    reg = load()
    p = proj(reg, a.id)
    ids = [v["id"] for v in p["versions"]]
    reg["projects"] = [x for x in reg["projects"] if x["id"] != a.id]
    save(reg)
    say(f"  ○ 台帳から外した: {p['name']} [{a.id}]（リンク {len(ids)}本）", "g")
    for i in ids:
        if os.path.isdir(os.path.join(DOCS, i)):
            say(f"      docs/{i}/  → {vurl(reg, {'id': i})}")
    if ids:
        say("  ・公開ファイルは残っている。本当に消すなら手で: git rm -r docs/<id>", "y")


def cmd_check(a):
    sys.exit(1 if check(load()) else 0)


def cmd_build(a):
    reg = load()
    say("── 台帳の検査 ──")
    if check(reg):
        sys.exit("\n  ★エラーがあるので生成しない。上を直してからやり直す")
    r = subprocess.run([sys.executable, os.path.join(ROOT, "build_lp_index.py")],
                       cwd=ROOT, capture_output=True, text=True,
                       env={**os.environ, "LPV_CHECKED": "1"})
    print(r.stdout.strip() or r.stderr.strip())
    if r.returncode:
        sys.exit("  ★生成に失敗")
    if not a.push:
        say("\n  （公開していない。--push で commit & push）")
        return
    # ★このリポジトリは公開。顧客名・金額・手元のパスが入っていたら push させない。
    #   検査は publish_guard に一本化してある（押す口は lpv.py と vv.py の2つ、ガードは1つ）。
    #   生成の【あと】に走らせるのが肝。台帳を綺麗にしても、生成物に焼き込まれていたら意味がない。
    say("── 公開前の検査 ──")
    import publish_guard
    publish_guard.enforce(ROOT, say, sys.exit)
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

    s = sp.add_parser("rename-project", help="案件の名前・クライアント・メモを直す")
    s.add_argument("id"); s.add_argument("--name"); s.add_argument("--client"); s.add_argument("--note")
    s.set_defaults(f=cmd_rename_project)

    s = sp.add_parser("new", help="リンクを作る（派生元は省略できない）")
    s.add_argument("id")
    s.add_argument("-p", "--project", required=True)
    s.add_argument("--from", dest="frm", help="派生元の版id")
    s.add_argument("--root", action="store_true", help="初版（派生元なし）")
    s.add_argument("--alt", action="store_true",
                   help="別案として新しいリンクを増やすことを承知した（小さい直しは update）")
    s.add_argument("--why", required=True, help="何を変えたか。後で用途不明にならないように")
    s.add_argument("--src", help="中身のフォルダ。省略時は派生元を複製")
    s.add_argument("--url", help="design-library 以外に公開する場合の実URL")
    s.add_argument("--status", default="internal", choices=STATUS)  # まず自分用。渡したら show
    s.add_argument("--alert", help="管理画面の上に赤く出す注意書き（※要確認など）")
    s.add_argument("--date")
    s.set_defaults(f=cmd_new)

    s = sp.add_parser("fb", help="FBを記録する（直す前に打つ）")
    s.add_argument("id")
    s.add_argument("--what", required=True); s.add_argument("--date")
    s.set_defaults(f=cmd_fb)

    s = sp.add_parser("show", help="クライアントに見せた（ここからそのリンクは凍る）")
    s.add_argument("id"); s.add_argument("--date"); s.set_defaults(f=cmd_show)

    s = sp.add_parser("update", help="中身を直した。見せたリンクなら自動で新しいリンクを作る")
    s.add_argument("id"); s.add_argument("--what", required=True); s.add_argument("--date")
    s.add_argument("--same", action="store_true",
                   help="見せたリンクでも同じリンクの中身を直す（相手の見え方が変わる）")
    s.set_defaults(f=cmd_update)

    s = sp.add_parser("rm", help="版を台帳から外す（公開ファイルは消さない）")
    s.add_argument("id"); s.add_argument("--force", action="store_true",
                                         help="子がいても外す（子の派生元は祖父に付け替える）")
    s.set_defaults(f=cmd_rm)

    s = sp.add_parser("rm-project", help="案件を台帳から外す（公開ファイルは消さない）")
    s.add_argument("id"); s.set_defaults(f=cmd_rm_project)

    s = sp.add_parser("step", help="いまの工程を見る／記録する")
    s.add_argument("project")
    s.add_argument("n", nargs="?", type=int)
    s.set_defaults(f=cmd_step)

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
