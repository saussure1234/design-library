#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lp-moods.json（ダッシュボードの雛形一覧）を実態から作り直す。

★なぜ生成にするか（2026-09-11）
  手で書いていたので実態とズレた。B型は部品化して6雰囲気になったのに1本のまま、
  F型（採用）を足しても画面に出なかった。
  型と雰囲気の実体は build.py（並び）と tokens/（見た目）と docs/lp/moods/（公開物）。
  この3つから作る。
"""
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
                          "h1": px(tok(m, "--h1")), "pad": px(tok(m, "--sec-y")),
                          "radius": f'{tok(m, "--r-s")} / {tok(m, "--r-l")}',
                          "color": tok(m, "--blue"), "bg": tok(m, "--bg"),
                          "ls": tok(m, "--h2-ls")})
        prev = old.get(key, {})
        types.append({
            "id": key, "key": key,
            "name": spec_t["name"],
            "note": prev.get("note", ""),
            "sections": len(spec_t["order"]),
            "order": spec_t["order"],
            "structure": prev.get("structure"),
            "path": "~/lp-moods/", "url": prev.get("url", ""),
            "moods": moods,
        })
    # 実物版（部品ではないもの）
    for extra in sorted(glob.glob(os.path.join(DOCS, "*_ref", "*", "index.html"))):
        k = extra.split(os.sep)[-3]
        m = extra.split(os.sep)[-2]
        types.append({"id": k, "key": k, "name": f"{k[0].upper()}型（実物・部品化していない版）",
                      "note": "部品から組んだものではなく、実案件のコピーを無名化したもの",
                      "sections": None, "path": "~/lp-moods/b_sharesec/", "url": "",
                      "moods": [{"id": m, "name": m, "words": ""}]})
    head["updated"] = "2026-09-11"
    head["types"] = types
    io.open(op, "w", encoding="utf-8").write(json.dumps(head, ensure_ascii=False, indent=1) + "\n")
    n = sum(len(t["moods"]) for t in types)
    print(f"  ○ lp-moods.json: 型 {len(types)} / 雛形 {n}本")
    for t in types:
        print(f"     {t['key']:<6} {t['name'][:30]:<32} 雰囲気{len(t['moods'])}  節{t['sections']}")


if __name__ == "__main__":
    main()
