#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""公開してはいけない語が、実際に公開されるファイルに入っていないか調べる。

  ★なぜ独立させたか
    このチェックは元々 lpv.py の中にあり、対象は lp-registry.json と lp-flow.json の2つだけだった。
    動画の台帳（video-registry.json）を足し、vv.py からも push できるようにした時点で、
    「押す口は2つ、ガードは1つ、しかも見ている先が古い」という穴になった。
    ガードは【押す口ごと】ではなく【1つ】に置き、押す口はどちらもこれを呼ぶ。

  ★調べる先は "台帳" ではなく "実際に配られるファイル"。
    台帳を綺麗にしても、生成されたHTMLに焼き込まれていたら意味がない。
    だから docs/lp/index.html と docs/video/*/index.html も読む。

  ★生成のあと、push の前に呼ぶこと。
"""
import os
import re

# 金額。3桁以上の数字＋円（1,000円 / 200000円）。
# ★ここだけは .publish-blocklist が空でも効く。金額は例外なく出さない。
MONEY = re.compile(r"[0-9][0-9,]{2,}\s*円")
# ★数字が全部ゼロのものは金額ではなく伏せ字（サンプル会社概要の「0,000,000円」など）。
#   本物の金額が全部ゼロになることはないので、これだけは通す。
#   ★ここを緩めるときは「本物が誤って通らないか」を必ず考える。
MONEY_DUMMY = re.compile(r"^[0,]+\s*円$")
# 手元の絶対パス。ユーザー名がURLごと公開ページに載る
LOCALPATH = re.compile(r"/Users/[A-Za-z0-9._-]+/")


def words(root):
    """公開してはいけない語（他案件の顧客名など）。git管理外の .publish-blocklist に置く。"""
    f = os.path.join(root, ".publish-blocklist")
    if not os.path.exists(f):
        return None                      # None = リストが無い（呼び側で警告する）
    return [l.strip() for l in open(f, encoding="utf-8")
            if l.strip() and not l.startswith("#")]


def targets(root):
    """実際に公開されるテキスト。ここに無いものは検査していない＝穴になる。"""
    out = []
    for f in ("lp-registry.json", "lp-flow.json", "video-registry.json"):
        p = os.path.join(root, f)
        if os.path.exists(p):
            out.append(p)
    for sub in ("lp", "video"):
        d = os.path.join(root, "docs", sub)
        for dp, _, fs in os.walk(d):
            for fn in fs:
                if fn.endswith(".html"):
                    out.append(os.path.join(dp, fn))
    return out


def scan(root):
    """(相対パス, [見つかった理由]) の一覧を返す。空なら公開してよい。"""
    ws = words(root)
    bad = []
    for p in targets(root):
        try:
            t = open(p, encoding="utf-8", errors="ignore").read()
        except OSError:
            continue
        hit = sorted({w for w in (ws or []) if w in t})
        for m in MONEY.finditer(t):
            if MONEY_DUMMY.match(m.group(0)):
                continue                      # 伏せ字（0,000,000円）は金額ではない
            hit.append(f"金額らしき記述「{m.group(0)}」")
            break
        m = LOCALPATH.search(t)
        if m:
            hit.append(f"手元の絶対パス「{m.group(0)}…」")
        if hit:
            bad.append((os.path.relpath(p, root), hit))
    return bad, ws


def enforce(root, say, quit_):
    """検査して、駄目なら quit_ で止める。lpv.py / vv.py の push 直前から呼ぶ。"""
    bad, ws = scan(root)
    if ws is None:
        say("  ▲ .publish-blocklist が無い。顧客名の検査をしていない（金額と絶対パスは検査した）", "y")
    for f, hit in bad:
        say(f"  ✗ {f} → " + " / ".join(hit), "r")
    if bad:
        quit_("\n  ★このリポジトリは公開。顧客名・金額・手元のパスは消してから push する\n"
              "    （許す語を増やすなら .publish-blocklist を編集）")


if __name__ == "__main__":
    import sys
    R = os.path.dirname(os.path.abspath(__file__))
    bad, ws = scan(R)
    if ws is None:
        print("  ▲ .publish-blocklist が無い")
    for f, hit in bad:
        print(f"  ✗ {f} → " + " / ".join(hit))
    print("  ○ 公開してよい" if not bad else f"\n  ★{len(bad)}件。push しない")
    sys.exit(1 if bad else 0)
