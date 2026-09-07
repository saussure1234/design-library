#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lp-registry.json から LP版管理ツールを生成する。

  python3 build_lp_index.py          … docs/lp/index.html を作る
  python3 build_lp_index.py --open   … 作ってブラウザで開く

★画面の作り
    左： プロジェクトのサイドバー（要対応の件数つき）
    右： タブ ─ 版一覧（表）／派生図（線で結んだ図）／FB履歴

★台帳（lp-registry.json）が正。ページは毎回そこから作り直す。
  生成物を直接編集しないこと。次の生成で消える。
★このページは noindex（検索避け）。リンクを知っている人だけが見る想定。
"""
import json, os, subprocess, sys

R = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(R, "lp-registry.json")
OUT_DIR = os.path.join(R, "docs", "lp")
OUT = os.path.join(OUT_DIR, "index.html")

CSS = """
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
.gsvg{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}

/* FB履歴 */
.fbrow{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:10px 4px;
  border-bottom:1px solid #f0f2f4}
.fbrow .dt{font-size:12px;color:var(--mute)}
.fbrow .wh{font-size:13.5px}
.fbrow .to{font-size:11.5px;color:var(--mute);margin-top:2px}

.todo{background:#fff;border:1px solid #fecaca;border-radius:10px;padding:14px 18px;margin-bottom:16px}
.todo h3{font-size:14px;color:#b91c1c;margin-bottom:6px}
.todo li{margin-left:18px;font-size:13px;margin-top:4px}
.rules{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 18px;font-size:12.5px}
.rules b{display:block;margin-bottom:4px}
.rules li{margin-left:18px}
@media(max-width:820px){
  .app{flex-direction:column}
  .side{width:auto;height:auto;position:static}
  .main{padding:16px}
}
"""

JS = """
const S={live:['本番','var(--live)','#f1fbf3'],frozen:['凍結','var(--frozen)','#f8fafc'],
         review:['確認用','var(--review)','#fffbeb'],draft:['未公開','var(--draft)','#fff']};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cur=DATA.projects[0].id, tab='list';

function alerts(p){return p.versions.filter(v=>v.alert);}
function url(id){return DATA.base_url+id+'/';}

function sidebar(){
  const tot=DATA.projects.reduce((a,p)=>a+alerts(p).length,0);
  return `<h1>LP 版管理</h1>
  <div class="cap">プロジェクト</div>
  ${DATA.projects.map(p=>{const n=alerts(p).length;
    return `<a data-p="${p.id}" class="${p.id===cur?'on':''}">${esc(p.name)}
      <span class="n ${n?'bad':''}">${n||p.versions.length}</span></a>`}).join('')}
  <div class="foot">要対応 ${tot} 件<br>更新 ${esc(DATA.updated)}<br>
  台帳 lp-registry.json</div>`;
}

function linkCell(v){
  return v.status==='draft'
    ? `<span class="lk dead">${esc(v.id)}/</span>`
    : `<a class="lk" href="${url(v.id)}" target="_blank" rel="noopener">${esc(v.id)}/ ↗</a>`;
}

function listPane(p){
  const rows=p.versions.map(v=>{
    const [lab,c]=S[v.status]||S.draft;
    const mg=v.status==='draft'?'<span class="mg n">未公開</span>'
      :(v.merged?'<span class="mg y">反映済</span>':'<span class="mg n">未反映</span>');
    return `<tr>
      <td>${linkCell(v)}${p.main===v.id?'<span class="mainmark">本線</span>':''}</td>
      <td><span class="pill" style="background:${c}">${lab}</span></td>
      <td>${v.parent?esc(v.parent):'<span style="color:#9ca3af">初版</span>'}</td>
      <td>${esc(v.what)}${v.alert?`<div class="warn">▲ ${esc(v.alert)}</div>`:''}</td>
      <td>${mg}</td><td style="color:var(--mute);white-space:nowrap">${esc(v.date)}</td></tr>`}).join('');
  return `<table><thead><tr><th>リンク</th><th>状態</th><th>派生元</th>
    <th>変更内容</th><th>本線</th><th>日付</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function graphPane(p){
  const NW=212, GX=64, RH=116;              // 節の幅 / 横の間隔 / 1段の高さ
  const by={}; p.versions.forEach(v=>by[v.id]=v);
  // 親が別プロジェクトにいる場合（例：小学生向けの親はオンライン校の版）は根として扱う
  const par=v=>(v.parent&&by[v.parent])||null;

  // 横位置＝世代
  const depth={};
  const d=v=>{if(depth[v.id]!=null)return depth[v.id];
    const pa=par(v); return depth[v.id]=pa?d(pa)+1:0;};
  p.versions.forEach(d);

  const kids={};
  p.versions.forEach(v=>{const pa=par(v); if(pa)(kids[pa.id]=kids[pa.id]||[]).push(v);});

  // ★縦位置：葉を上から1段ずつ積み、親は【最初の子と同じ高さ】に置く。
  //   ・世代ごとに列の頭から詰めると、子が必ず親より上に来る（旧版の不具合）
  //   ・子の"中央"に置くのも駄目。枝分かれのたびに先頭の子が親より上に出る
  //   この置き方だと本線が一番上を真横に走り、派生は必ず下へ垂れる。
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
    return `<div class="gnode" id="g-${v.id}" style="--c:${c};--b:${b};`
      +`left:${depth[v.id]*(NW+GX)}px;top:${(row[v.id]*RH).toFixed(1)}px">
      <div class="t">${linkCell(v)}</div>
      <div class="d">${esc(v.date)} · ${lab}${v.merged?'':' · <span style="color:var(--bad)">本線未反映</span>'}</div>
      <div class="w">${esc(v.what)}</div></div>`}).join('');
  return `<div class="graph"><svg class="gsvg"></svg>
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
    <div class="to">→ ${esc(f.ver.id)} で対応　${f.ver.merged?'（本線に反映済）':'（本線に未反映）'}</div>
    </div></div>`).join('');
}

function render(){
  document.querySelector('.side').innerHTML=sidebar();
  const p=DATA.projects.find(x=>x.id===cur);
  const al=alerts(p);
  const todo=al.length?`<div class="todo"><h3>要対応 ${al.length}件</h3><ul>${
    al.map(v=>`<li><b>${esc(v.id)}</b> … ${esc(v.alert)}</li>`).join('')}</ul></div>`:'';
  const body = tab==='list'?listPane(p) : tab==='graph'?graphPane(p) : fbPane(p);
  document.querySelector('.main').innerHTML=`
    <div class="head"><h2>${esc(p.name)}</h2>
      <span class="cl">${esc(p.client||'')}</span>
      <span class="mainlink">本線：${p.main?`<a class="lk" href="${url(p.main)}" target="_blank" rel="noopener">${esc(p.main)}/ ↗</a>`:'<span style="color:var(--bad)">未設定</span>'}</span>
    </div>
    <p class="note">${esc(p.note||'')}</p>
    ${todo}
    <div class="tabs">
      <button data-t="list" class="${tab==='list'?'on':''}">版一覧</button>
      <button data-t="graph" class="${tab==='graph'?'on':''}">派生図</button>
      <button data-t="fb" class="${tab==='fb'?'on':''}">FB履歴</button>
    </div><div class="pane">${body}</div>
    <div class="rules" style="margin-top:16px"><b>運用ルール</b><ol>
      <li>FBが来たら<b>直す前に</b>台帳へ1行足す</li>
      <li>新しいリンクを作ったら<b>必ず派生元を書く</b></li>
      <li><b>完了＝本線に取り込まれた状態</b>。確認用リンクの完成は完了ではない</li>
      <li>作業は git の docs/ 配下で行う。Desktopの複製フォルダを正にしない</li>
    </ol></div>`;
  // ★requestAnimationFrame は【タブが非表示だと発火しない】。
  //   背面タブで開くと線が引かれない事故になるので rAF に依存しない。
  if(tab==='graph'){ setTimeout(()=>drawLines(p),0);
    // Webフォントの読み込みで箱の高さが動くので、確定後にもう一度引く
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(()=>drawLines(p));
    addEventListener('load',()=>drawLines(p),{once:true}); }
}

document.addEventListener('click',e=>{
  const a=e.target.closest('.side a'); if(a){cur=a.dataset.p;tab='list';render();return;}
  const b=e.target.closest('.tabs button'); if(b){tab=b.dataset.t;render();}
});
addEventListener('resize',()=>{if(tab==='graph')drawLines(DATA.projects.find(x=>x.id===cur));});
render();
"""


def main():
    reg = json.load(open(REG, encoding="utf-8"))
    reg.pop("_readme", None)
    doc = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<!-- ★検索避け。リンクを知っている人だけが見る想定 -->
<meta name="robots" content="noindex,nofollow,noarchive">
<title>LP 版管理</title>
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
    print(f"  生成: docs/lp/index.html（{len(reg['projects'])}案件 / {n}版 / 要対応 {a}件）")
    if "--open" in sys.argv:
        subprocess.run(["open", OUT])


if __name__ == "__main__":
    main()
