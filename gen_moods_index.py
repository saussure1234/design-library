#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lp-moods.json（ダッシュボードの雛形一覧）を実態から作り直す。

★なぜ生成にするか（2026-09-11）
  手で書いていたので実態とズレた。B型は部品化して6雰囲気になったのに1本のまま、
  F型（採用）を足しても画面に出なかった。
  型と雰囲気の実体は build.py（並び）と tokens/（見た目）と docs/lp/moods/（公開物）。
  この3つから作る。

🚨 手で書いた欄は作り直しで消さない（2026-09-14）
  9/11 に生成へ切り替えたとき、受け入れ仕様（copy / assets / images / photo）を
  引き継がずに捨てた。画面はそれがある前提で .map していたので例外で止まり、
  雰囲気テンプレの画面が【3日間まっ白】だった。誰も気づかなかった。
  → 生成しない欄は KEEP で前の値を持ち越す。構成（structure）が無い型は ROLE から作る。
"""
import datetime
import glob
import importlib.util
import io
import json
import os
import re
import sys

R = os.path.dirname(os.path.abspath(__file__))
LP = os.path.expanduser("~/lp-moods")
DOCS = os.path.join(R, "docs", "lp", "moods")
MOODNAME = {"01_genki": ("01 元気", "熱い・力強い・躍動感"),
            "02_yawaraka": ("02 やわらか", "温かい・やさしい・和モダン"),
            "03_seijitsu": ("03 誠実", "実直・信頼感・整然・職人"),
            "04_cool": ("04 クール", "静か・上品・都会的"),
            "05_ochitsuki": ("05 落ち着き", "重心が低い・格式・老舗"),
            "06_pop": ("06 ポップ", "楽しい・かわいい・軽やか")}


def tok(mood, key):
    f = os.path.join(LP, "tokens", mood + ".css")
    if not os.path.exists(f):
        return None
    m = re.search(re.escape(key) + r":\s*([^;]+);", io.open(f, encoding="utf-8").read())
    return m.group(1).strip() if m else None


def px(v):
    m = re.search(r"(\d+)px\s*\)?\s*$", v or "")
    return int(m.group(1)) if m else None


def cols(v):
    """--fv-cols の「minmax(0,12fr) minmax(0,8fr)」→「12:8」"""
    fr = re.findall(r"(\d+)fr", v or "")
    return ":".join(fr) if fr else None


# 生成しない欄。作り直しても前の値を持ち越す（structure は並びと照合してから）
KEEP = ("note", "url", "copy", "assets", "images", "photo", "measured")


def main():
    sys.argv = ["build.py"]
    spec = importlib.util.spec_from_file_location("b", os.path.join(LP, "build.py"))
    b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b)

    old = {}
    op = os.path.join(R, "lp-moods.json")
    if os.path.exists(op):
        o = json.load(io.open(op, encoding="utf-8"))
        old = {t.get("key") or t.get("id"): t for t in o.get("types", [])}
        head = {k: v for k, v in o.items() if k != "types"}
    else:
        head = {"_readme": [], "updated": "", "local": ""}

    types = []
    for key in sorted(b.TYPES):
        spec_t = b.TYPES[key]
        moods = []
        for m in sorted(MOODNAME):
            if not os.path.isfile(os.path.join(DOCS, key, m, "index.html")):
                continue
            nm, words = MOODNAME[m]
            moods.append({"id": m, "name": nm, "words": words,
                          "head": (tok(m, "--font-head") or "").split(",")[0].strip('"'),
                          "h1": px(tok(m, "--h1")),
                          "h2": f'{px(tok(m, "--h2"))}/{tok(m, "--h2-w")}',
                          "pad": px(tok(m, "--sec-y")),
                          "radius": f'{tok(m, "--r-s")} / {tok(m, "--r-l")}',
                          "cols": cols(tok(m, "--fv-cols")),
                          "color": tok(m, "--blue"), "bg": tok(m, "--bg"),
                          "ls": tok(m, "--h2-ls")})
        if not moods:
            # 公開用の複製（docs/lp/moods/<型>/）が無い型は載せない。載せると中身の無いタブになる
            print(f"  ・{key} {spec_t['name']} は公開用の複製が無いので載せない")
            continue
        prev = old.get(key, {})
        t = {k: prev[k] for k in KEEP if prev.get(k) not in (None, "", [])}
        # 🚨 構成は「並び（order）と部品が1つずつ一致する」ときだけ持ち越す。
        #    B型は実物15節→部品11節に作り替えたのに、実物の15節の表が残っていた（2026-09-11〜14）
        st = prev.get("structure") or []
        if [s.get("part") for s in st] == list(spec_t["order"]):
            t["structure"] = st
        else:
            role = getattr(b, "ROLE", {})
            t["structure"] = [{"n": i + 1, "role": role.get(p, (p, ""))[0],
                               "note": role.get(p, ("", ""))[1], "part": p}
                              for i, p in enumerate(spec_t["order"])]
        t.update({
            "id": key, "key": key,
            "name": spec_t["name"],
            "sections": len(spec_t["order"]),
            "order": spec_t["order"],
            "path": "~/lp-moods/",
            "moods": moods,
        })
        t.setdefault("note", "")
        t.setdefault("url", "")
        types.append(t)
    # 実物版（部品ではないもの）
    for extra in sorted(glob.glob(os.path.join(DOCS, "*_ref", "*", "index.html"))):
        k = extra.split(os.sep)[-3]
        m = extra.split(os.sep)[-2]
        prev = old.get(k, {})
        t = {x: prev[x] for x in KEEP + ("structure",) if prev.get(x) not in (None, "", [])}
        t.update({"id": k, "key": k, "name": f"{k[0].upper()}型（実物・部品化していない版）",
                  "note": "部品から組んだものではなく、実案件のコピーを無名化したもの",
                  "sections": len(t["structure"]) if t.get("structure") else None,
                  "path": "~/lp-moods/b_sharesec/", "url": "",
                  "moods": [{"id": m, "name": m, "words": ""}]})
        types.append(t)
    head["updated"] = datetime.date.today().isoformat()
    head["types"] = types
    io.open(op, "w", encoding="utf-8").write(json.dumps(head, ensure_ascii=False, indent=1) + "\n")
    n = sum(len(t["moods"]) for t in types)
    print(f"  ○ lp-moods.json: 型 {len(types)} / 雛形 {n}本")
    for t in types:
        print(f"     {t['key']:<6} {t['name'][:30]:<32} 雰囲気{len(t['moods'])}  節{t['sections']}")


if __name__ == "__main__":
    main()
