#!/bin/bash
# Chrome を4台に分散して撮る。中断しても再開できる（撮れているものは飛ばす）
set -e
LIB="$HOME/design-library"
LIST="${1:-$LIB/lists/all.tsv}"
PAR="${2:-2}"
cd "$LIB"
mkdir -p _raw/shards _raw/pc
# 未撮影ぶんだけを4等分
python3 - "$LIST" <<'PY'
import sys,os,pathlib
lib=os.path.expanduser('~/design-library')
rows=[l for l in open(sys.argv[1],encoding='utf-8').read().splitlines() if l.strip()]
todo=[l for l in rows if not os.path.exists(f"{lib}/_raw/pc/{l.split(chr(9))[0]}.jpg")]
for i in range(4):
    pathlib.Path(f"{lib}/_raw/shards/s{i}.tsv").write_text("\n".join(todo[i::4])+"\n",encoding='utf-8')
print(f"未撮影 {len(todo)} 件を4分割")
PY
i=0
for P in 9333 9334 9335 9336; do
  nohup python3 scripts/shoot.py "_raw/shards/s$i.tsv" --port $P --par $PAR >> "_raw/shoot_$P.log" 2>&1 &
  i=$((i+1))
done
echo "4台で開始（各 par=$PAR）"
