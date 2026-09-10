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


SCRIPTS = os.path.join(ROOT, "scripts")


def script_dir(pid):
    return os.path.join(SCRIPTS, pid)


def script_versions(pid):
    """その案件の原稿の版を新しい順で返す。v1.md, v2.md ... """
    d = script_dir(pid)
    if not os.path.isdir(d):
        return []
    vs = [f[:-3] for f in os.listdir(d) if re.fullmatch(r"v\d+\.md", f)]
    return sorted(vs, key=lambda s: int(s[1:]), reverse=True)


def cmd_script(a):
    """原稿を版で管理する。台帳が正、原稿は scripts/<案件id>/vN.md。"""
    reg = load()
    p = next((x for x in reg["projects"] if x["id"] == a.project), None)
    if not p:
        sys.exit(f"  ★案件 '{a.project}' が台帳に無い")
    d = script_dir(a.project)
    vs = script_versions(a.project)

    # ★どのリンクがどの原稿から出来たか、だけを記録する。
    #   update と違って更新履歴を増やさない（後から系統を書き足すのが目的なので）。
    if a.set:
        vid, sn = a.set
        v = next((x for x in p["versions"] if x["id"] == vid), None)
        if not v:
            sys.exit(f"  ★版 '{vid}' は {p['name']} に無い")
        if sn not in vs:
            sys.exit(f"  ★原稿 '{sn}' が無い（あるのは {', '.join(vs) or 'なし'}）")
        v["script"] = sn
        save(reg)
        say(f"  ○ {vid} は原稿 {sn} から出来た、と記録した", "g")
        return

    if a.new:
        os.makedirs(d, exist_ok=True)
        nxt = f"v{(int(vs[0][1:]) + 1) if vs else 1}"
        path = os.path.join(d, nxt + ".md")
        if a.file:
            shutil.copy(os.path.expanduser(a.file), path)
        else:
            base = open(os.path.join(d, vs[0] + ".md"), encoding="utf-8").read() if vs else ""
            open(path, "w", encoding="utf-8").write(base)
            subprocess.run([os.environ.get("EDITOR", "open"), path])
        say(f"  ○ 原稿 {nxt} を作った: {path}", "g")
        say(f"    次: lpv.py update <版id> --script {nxt} で、どのリンクがこの原稿から出来たかを残す")
        return

    if not vs:
        say(f"  原稿はまだ無い。作る: lpv.py script {a.project} --new", "y")
        return
    say(f"\n■ {p['name']} の原稿  {len(vs)}版", "b")
    used = {}
    for v in p["versions"]:
        if v.get("script"):
            used.setdefault(v["script"], []).append(v["id"])
    for v in vs:
        say(f"   {v:<5} {os.path.join(d, v + '.md')}"
            + (f"   → {', '.join(used.get(v, []))}" if used.get(v) else "   （まだどのリンクにも紐づいていない）"))


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



# ── doctor ─────────────────────────────────────────────────
# ★台帳（言っていること）と実態（起きていること）を突き合わせる。
#   2026-09-10 に、これが無かったせいで4件やらかした：
#     ・手元が29コミット古いのに気づかず「提示版」だと思い込んだ
#     ・curl に -L を付けず 181KB と誤読して「別物」と断定した
#     ・新リンクの派生元を、作業用ではなく提示中の版にした
#   どれも「1つの情報源だけ見て裏を取らずに断定した」。人が気をつけても再発する。
LOCALS = {                      # 案件id → 手元の作業フォルダ（あるものだけ）
    "sharesec":     ["~/sharesec-lp", "~/sharesec-lp-v3", "~/sharesec-lp-v4"],
    # 🚨 ~/ads-redesign 自体は remote を持たない（作業用）。git の遅れが出るのは
    #    deploy 先の .deploy/ads-lp-preview なので、そちらも見る
    "ads-redesign": ["~/ads-redesign", "~/ads-redesign/.deploy/ads-lp-preview"],
}


def _sh(cmd, cwd=None):
    try:
        r = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=60)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except Exception as e:
        return 1, "", str(e)[:120]


def _fetch(url):
    """必ずリダイレクトを追う。-L を落とすと別物に見える（2026-09-10 の誤り）"""
    code, out, _ = _sh(["curl", "-sL", "-o", "-", "-w", "\n@@%{http_code}", url])
    if code or "@@" not in out:
        return None, None
    body, _, status = out.rpartition("@@")
    return status.strip(), len(body.encode())


def cmd_doctor(a):
    reg = load()
    projs = [p for p in reg["projects"] if not a.project or p["id"] == a.project]
    if not projs:
        sys.exit(f"  ★そんな案件は無い: {a.project}")
    bad = 0
    for p in projs:
        say(f"\n■ {p['name']}  [{p['id']}]", "b")

        # ① 手元のgitが remote より遅れていないか
        for d in LOCALS.get(p["id"], []):
            d = os.path.expanduser(d)
            if not os.path.isdir(os.path.join(d, ".git")):
                continue
            _sh(["git", "fetch", "-q", "origin"], cwd=d)
            br = _sh(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=d)[1] or "main"
            code, out, _ = _sh(["git", "rev-list", "--left-right", "--count",
                                f"HEAD...origin/{br}"], cwd=d)
            ahead, behind = (out.split() + ["?", "?"])[:2] if code == 0 else ("?", "?")
            dirty = _sh(["git", "status", "--short"], cwd=d)[1]
            nm = d.replace(os.path.expanduser("~"), "~")
            if behind not in ("0", "?") :
                say(f"  ✗ {nm}  remote より {behind} コミット遅れている（先に git pull）", "r"); bad += 1
            elif ahead not in ("0", "?") and int(ahead) > 0:
                say(f"  △ {nm}  未pushが {ahead} コミット", "y")
            else:
                say(f"  ○ {nm}  remote と同じ", "g")
            if dirty:
                say(f"    … 未コミットの変更 {len(dirty.splitlines())} 件", "y")

        # ② 公開ページが生きているか・手元と同じ中身か
        for v in p["versions"]:
            url = v.get("url") or (reg["base_url"] + v["id"] + "/")
            st, size = _fetch(url)
            mark, col = ("○", "g")
            if st != "200":
                mark, col = ("✗", "r"); bad += 1
            tag = {"shown": "クライアントに提示中", "internal": "自分の確認用",
                   "draft": "未公開"}.get(v.get("status"), v.get("status"))
            say(f"  {mark} {v['id']:<18} {st or '接続できない'}  {size or 0:>7} bytes  {tag}", col)

        # ③ 台帳の派生元が実在するか・自分を指していないか
        ids = {v["id"] for v in p["versions"]}
        for v in p["versions"]:
            par = v.get("parent")
            if par and par not in ids:
                say(f"  ✗ {v['id']} の派生元 {par} が台帳に無い", "r"); bad += 1
            if par == v["id"]:
                say(f"  ✗ {v['id']} の派生元が自分自身", "r"); bad += 1

        # ④ 提示中（shown）の版に、まだ返していないFBが残っていないか
        for v in p["versions"]:
            if v.get("status") == "shown" and v.get("fb"):
                # 🚨 子だけでなく子孫をぜんぶ辿る。preview→preview2→preview3 のように
                #    1段はさむと、子だけ見ていては「反映した版が無い」と誤検出する
                desc, stack = [], [v["id"]]
                while stack:
                    cur = stack.pop()
                    for x in p["versions"]:
                        if x.get("parent") == cur and x not in desc:
                            desc.append(x); stack.append(x["id"])
                last_fb = max(f.get("date", "") for f in v["fb"])
                after = [x for x in desc if x.get("date", "") >= last_fb]
                if not after:
                    say(f"  ✗ {v['id']} にFB {len(v['fb'])}件。反映した版が無い", "r"); bad += 1
                else:
                    say(f"  ○ {v['id']} のFB {len(v['fb'])}件 → {after[-1]['id']} で反映", "g")

    if bad:
        say(f"\n  ★食い違い {bad} 件。直してから作業を始める。", "r")
        sys.exit(1)
    say("\n  ○ 台帳と実態は一致している。作業を始めてよい。", "g")


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
    s.add_argument("--script", help="この版のもとになった原稿（v1 / v2 …）")
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
    s.add_argument("--script", help="この版のもとになった原稿（v1 / v2 …）")
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

    s = sp.add_parser("script", help="原稿を版で管理する（vN.md）")
    s.add_argument("project")
    s.add_argument("--new", action="store_true", help="新しい版を作る（前の版を写して開く）")
    s.add_argument("--file", help="原稿のファイルを取り込む")
    s.add_argument("--set", nargs=2, metavar=("版id", "vN"),
                   help="どのリンクがどの原稿から出来たかを記録する（更新履歴は増やさない）")
    s.set_defaults(f=cmd_script)

    s = sp.add_parser("step", help="いまの工程を見る／記録する")
    s.add_argument("project")
    s.add_argument("n", nargs="?", type=int)
    s.set_defaults(f=cmd_step)

    s = sp.add_parser("doctor", help="台帳と実態の食い違いを出す（作業を始める前に叩く）")
    s.add_argument("project", nargs="?")
    s.set_defaults(f=cmd_doctor)
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
