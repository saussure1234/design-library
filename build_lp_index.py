#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""lp-registry.json / lp-flow.json から LP版管理ツールを生成する。

  python3 build_lp_index.py          … docs/lp/index.html を作る
  python3 build_lp_index.py --open   … 作ってブラウザで開く

★画面の作り
    左： プロジェクト（要対応の件数つき）＋ しくみ（LP制作フロー / Claudeスキル）
    右： 案件 → 版一覧・派生図・FB履歴
         しくみ → フローの各ステップと、そこで動くスキル・過去の事故

★台帳（lp-registry.json）が正。ページは毎回そこから作り直す。
  生成物を直接編集しないこと。次の生成で消える。
★スキル一覧は ~/.claude/skills/*/SKILL.md の frontmatter から拾う。
  拾うのは name / description / user-invocable だけ。本文は載せない
  （このリポジトリは公開なので、案件の中身を書き出さない）。
★このページは noindex（検索避け）。リンクを知っている人だけが見る想定。
"""
import json, os, re, subprocess, sys

R = os.path.dirname(os.path.abspath(__file__))
REG = os.path.join(R, "lp-registry.json")
FLOW = os.path.join(R, "lp-flow.json")
SKILLS_DIR = os.path.expanduser("~/.claude/skills")
OUT_DIR = os.path.join(R, "docs", "lp")
OUT = os.path.join(OUT_DIR, "index.html")


def blocklist():
    """公開してはいけない語（顧客名など）。git管理外の .publish-blocklist に置く。"""
    f = os.path.join(R, ".publish-blocklist")
    if not os.path.exists(f):
        print("  ▲ .publish-blocklist が無い。顧客名の検査をしていない")
        return []
    return [l.strip() for l in open(f, encoding="utf-8")
            if l.strip() and not l.startswith("#")]


def scan_block(d, words):
    """フォルダ配下に禁止語が入っているか。入っていれば (ファイル, 語) を返す。"""
    hit = []
    for root, _, fs in os.walk(d):
        for fn in fs:
            p = os.path.join(root, fn)
            try:
                t = open(p, encoding="utf-8", errors="ignore").read()
            except OSError:
                continue
            for w in words:
                if w in t:
                    hit.append((os.path.relpath(p, d), w))
    return hit


def read_skills(pack=True):
    """~/.claude/skills から name / description / user-invocable だけ拾う。

    自作スキル（user-invocable: true）は【1本の zip にまとめて】配る。
    ★スキルごとにボタンを置くと、工程の詳細にまで出てきて煩い。入手口は1つでいい。
    ★禁止語を1語でも含むものは束から外す。公開リポなので取り返しがつかない。
    """
    import shutil, zipfile
    out, words, ok = [], blocklist(), []
    zdir = os.path.join(OUT_DIR, "skills")
    if not os.path.isdir(SKILLS_DIR):
        return out, None
    for n in sorted(os.listdir(SKILLS_DIR)):
        d = os.path.join(SKILLS_DIR, n)
        f = os.path.join(d, "SKILL.md")
        if not os.path.isfile(f):
            continue
        m = re.match(r"---\n(.*?)\n---", open(f, encoding="utf-8").read(), re.S)
        fm = m.group(1) if m else ""
        g = lambda k: (re.search(rf"^{k}:\s*(.+)$", fm, re.M) or [None, ""])[1].strip().strip('"')
        s = {"id": n, "name": g("name") or n, "desc": g("description"),
             "mine": g("user-invocable") == "true", "blocked": 0}
        if pack and s["mine"]:
            hit = scan_block(d, words)
            if hit:
                s["blocked"] = len(hit)
                print(f"  ▲ {n}: 禁止語を含むので束に入れない → " +
                      ", ".join(f"{a}:「{b}」" for a, b in hit[:4]))
            else:
                ok.append((n, d))
        out.append(s)

    bundle = None
    if pack and ok:
        if os.path.isdir(zdir):
            shutil.rmtree(zdir)          # 古い個別zipを残さない
        os.makedirs(zdir, exist_ok=True)
        zp = os.path.join(zdir, "lp-skills.zip")
        with zipfile.ZipFile(zp, "w", zipfile.ZIP_DEFLATED) as z:
            for n, d in ok:
                for root, _, fs in os.walk(d):
                    for fn in fs:
                        p = os.path.join(root, fn)
                        z.write(p, os.path.join(n, os.path.relpath(p, d)))
        bundle = {"path": "skills/lp-skills.zip", "n": len(ok),
                  "kb": round(os.path.getsize(zp) / 1024),
                  "ids": [n for n, _ in ok]}
    return out, bundle

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
.gnode .ext{font-size:10.5px;color:#0b64c8;margin-top:2px}
.gnode.hasext .w{-webkit-line-clamp:1}   /* 由来の1行が増えるぶん本文を1行に */
.gsvg{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}

/* FB履歴 */
.fbrow{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:10px 4px;
  border-bottom:1px solid #f0f2f4}
.fbrow .dt{font-size:12px;color:var(--mute)}
.fbrow .wh{font-size:13.5px}
.fbrow .to{font-size:11.5px;color:var(--mute);margin-top:2px}

/* LP制作フロー ─ 派生図と同じ描き方（節＋SVGの線）*/
.fbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;
  background:#fff;border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:12.5px}
.fleg{color:var(--mute);font-size:11.5px}
.fleg i{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 5px 0 14px}
.fleg i.ok{background:var(--live)} .fleg i.miss{background:var(--bad)}
.fleg i.none{background:var(--review)}

.fgraph{position:relative;overflow-x:auto;padding:6px 4px 10px;margin-top:14px}
.fcanvas{position:relative;z-index:1}
.fsvg{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:visible}
.fgl{position:absolute;top:0;width:252px;font-size:13px;font-weight:800;
  border-bottom:2px solid #111827;padding-bottom:6px}
.fgl span{font-weight:400;font-size:11px;color:var(--mute);margin-left:7px}

.fnode{position:absolute;width:252px;height:44px;display:flex;align-items:center;gap:9px;
  background:#fff;border:1px solid var(--line);border-left:5px solid var(--live);
  border-radius:9px;padding:0 12px;cursor:pointer}
.fnode.miss{border-left-color:var(--bad)}
.fnode.none{border-left-color:var(--review)}
.fnode:hover{border-color:#94a3b8;box-shadow:0 1px 6px rgba(0,0,0,.07)}
.fnode.on{background:#111827;border-color:#111827}
.fnode.on .fnm{color:#fff}
.fnode.on .fno{background:#fff;color:#111827}
.fnm{font-size:13px;font-weight:700;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.fno{width:22px;height:22px;flex:none;border-radius:50%;background:#111827;color:#fff;
  font-size:11.5px;font-weight:800;display:grid;place-items:center}

.fdp{background:#fff;border:1px solid var(--line);border-radius:10px;padding:14px 16px;
  margin-top:16px;min-height:64px}
.fdph{color:var(--mute);font-size:12.5px}
.fdh{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.fdh h3{font-size:15px}
.fdw{font-size:13px;margin:7px 0 8px}
.fm{font-size:12px;color:var(--mute);margin-bottom:3px}
.fm i{font-style:normal;font-weight:700;margin-right:7px;color:#9ca3af}

.frisk,.fgap{font-size:12.5px;margin-top:8px;padding:8px 11px;border-radius:0 7px 7px 0;line-height:1.6}
.frisk{background:#fef2f2;border-left:3px solid var(--bad);color:#7f1d1d}
.fgap{background:#fffbeb;border-left:3px solid var(--review);color:#78350f}
.frisk b,.fgap b{display:block;font-size:11px;letter-spacing:.06em;margin-bottom:2px}
.sk{font-size:11px;font-weight:800;border-radius:999px;padding:3px 10px;border:1px solid}
.sk.have{background:#f1fbf3;border-color:#a7e0b5;color:#047a20}
.sk.miss{background:#fef2f2;border-color:#fecaca;color:#b91c1c}
.sk.none{background:#f8fafc;border-color:var(--line);color:#9ca3af}
.sd{color:var(--mute);font-size:12px}
tr.rmiss{background:#fef2f2}
.ghd{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:22px 0 8px;
  padding-bottom:6px;border-bottom:2px solid #111827}
.ghd h3{font-size:16px}
.ghd span{font-size:12px;color:var(--mute)}
.ghdb{margin-left:auto}
.dlb{font-size:12px;font-weight:800;text-decoration:none;border-radius:7px;
  padding:6px 14px;background:#111827;color:#fff;white-space:nowrap}
.dlb:hover{background:#374151}

.glo{margin-top:14px;border:1px solid var(--line);border-radius:9px;background:#fafbfc}
.glo summary{cursor:pointer;font-size:12.5px;font-weight:700;padding:9px 14px;color:var(--mute)}
.glo summary:hover{color:var(--ink)}
.glo dl{display:grid;grid-template-columns:88px 1fr;gap:5px 14px;padding:2px 16px 14px;font-size:12.5px}
.glo dt{font-weight:800}
.glo dd{color:var(--mute)}

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
  /* 幅が足りないのでブラケットは畳み、担当スキルを箱の中に出す */
  .lane{grid-template-columns:1fr}
  .brk{display:none}
  .skm{display:inline}
  .lnk{margin-left:calc(50% - 1px)}
}
"""

JS = """
const S={live:['公開中','var(--live)','#f1fbf3'],frozen:['旧版','var(--frozen)','#f8fafc'],
         review:['確認待ち','var(--review)','#fffbeb'],draft:['作りかけ','var(--draft)','#fff']};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let cur=DATA.projects[0].id, tab='graph';   // 最初に見たいのは系統。表は後

function alerts(p){return p.versions.filter(v=>v.alert);}

// 版は design-library の下にあるとは限らない（別リポ・別ドメインに出す案件がある）。
// 台帳に url があればそれを使い、無い時だけ base_url + id で組み立てる。
const ALL={}, OWNER={};
DATA.projects.forEach(p=>p.versions.forEach(v=>{ALL[v.id]=v;OWNER[v.id]=p;}));
function url(id){const v=ALL[id];return (v&&v.url)||DATA.base_url+id+'/';}

const SK={}; (DATA.skills||[]).forEach(s=>SK[s.id]=s);
const STEPS=(DATA.flow&&DATA.flow.steps)||[];
// フローが呼んでいるのに実物が無いスキル＝次に作るもの
const MISSING=[...new Set(STEPS.filter(s=>s.skill&&!SK[s.skill]).map(s=>s.skill))];

function sidebar(){
  const tot=DATA.projects.reduce((a,p)=>a+alerts(p).length,0);
  const gaps=STEPS.filter(s=>s.gap).length;
  return `<h1>LP 版管理</h1>
  <div class="cap">プロジェクト</div>
  ${DATA.projects.map(p=>{const n=alerts(p).length;
    return `<a data-p="${p.id}" class="${p.id===cur?'on':''}">${esc(p.name)}
      <span class="n ${n?'bad':''}">${n||p.versions.length}</span></a>`}).join('')}
  <div class="cap">しくみ</div>
  <a data-p="__flow__" class="${cur==='__flow__'?'on':''}">LP制作フローとスキル
    <span class="n ${gaps||MISSING.length?'bad':''}">${gaps?gaps+'欠':STEPS.length}</span></a>
  <div class="foot">要対応 ${tot} 件<br>更新 ${esc(DATA.updated)}<br>
  台帳 lp-registry.json</div>`;
}

/* ── LP制作フロー ───────────────────────────────────────── */
function skillTag(id){
  if(!id)return '<span class="sk none">スキルなし</span>';
  if(!SK[id])return `<span class="sk miss">${esc(id)}／未作成</span>`;
  return `<span class="sk have">${esc(id)}</span>`;
}
// ★入手口は1つだけ。スキルごとにボタンを置くと工程の詳細にまで出てきて煩い。
function dlAll(){
  const b=DATA.bundle;
  if(!b)return '';
  return `<a class="dlb" href="${b.path}" download>⇩ スキル${b.n}本をまとめて取得（${b.kb}KB）</a>`;
}

/* 派生図と同じ描き方でフローを描く。
   ★節は【番号と工程名だけ】。何をやるかも事故も、押すまで出さない。
     16工程ぶんの説明を最初から並べると読む気が失せる（前の版で却下された）。
   ★列＝大きな塊（提案／制作／公開・管理）。線は SVG のベジェで引く。 */
const FN={}; STEPS.forEach(s=>FN[s.n]=s);
const FW=252, FGX=76, FRH=58, FTOP=32;   // 節の幅 / 列間 / 段の高さ / 見出しの分の余白

function flowPane(){
  if(!STEPS.length)return '<p style="color:var(--mute)">lp-flow.json がありません。</p>';
  const GR=(DATA.flow.groups||[{id:null,name:''}]);
  const pos={};
  let nodes='', heads='', maxR=0;
  GR.forEach((g,c)=>{
    const st=STEPS.filter(s=>s.group===g.id);
    if(!st.length)return;
    heads+=`<div class="fgl" style="left:${c*(FW+FGX)}px">${esc(g.name)}
      <span>${st.length}工程</span></div>`;
    st.forEach((s,r)=>{
      pos[s.n]=[c,r]; maxR=Math.max(maxR,r);
      const st8=s.skill?(SK[s.skill]?'ok':'miss'):'none';
      nodes+=`<div class="fnode ${st8}" id="f-${s.n}" data-step="${s.n}"
        style="left:${c*(FW+FGX)}px;top:${FTOP+r*FRH}px">
        <span class="fno">${s.n}</span><span class="fnm">${esc(s.name)}</span></div>`;
    });
  });
  FLOWPOS=pos;
  const g=STEPS.filter(s=>s.gap).length;
  const have=STEPS.filter(s=>s.skill&&SK[s.skill]).length;
  const W=GR.length*(FW+FGX)-FGX, H=FTOP+(maxR+1)*FRH;
  return `<div class="fbar">
      <span>全${STEPS.length}工程 ／ スキルで型になっているのは ${have}
      ${g?`／ <b style="color:var(--bad)">型が無い工程 ${g}</b>`:''}</span>
      <span class="fleg"><i class="ok"></i>スキルあり<i class="miss"></i>未作成<i class="none"></i>型なし</span>
    </div>
    <div class="fgraph"><svg class="fsvg"></svg>
      <div class="fcanvas" style="width:${W}px;height:${H}px">${heads}${nodes}</div></div>
    <div class="fdp" id="fdp"><p class="fdph">工程を押すと、何をやるか・出るもの・過去にそこで何をやらかしたかが出ます。</p></div>
    <div class="ghd" style="margin-top:26px"><h3>スキル一覧</h3>
      <span>~/.claude/skills/ の中身。展開先も同じ場所</span>
      <span class="ghdb">${dlAll()}</span></div>
    ${skillTable()}`;
}

let FLOWPOS={};
function drawFlow(){
  const wrap=document.querySelector('.fgraph'); if(!wrap)return;
  const svg=wrap.querySelector('.fsvg'), R=wrap.getBoundingClientRect();
  svg.setAttribute('width',wrap.scrollWidth); svg.setAttribute('height',wrap.scrollHeight);
  let d='<defs><marker id="ah" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">'
       +'<path d="M0 0 L7 3.5 L0 7 z" fill="#cbd5e1"/></marker></defs>';
  for(let i=0;i<STEPS.length-1;i++){
    const a=document.getElementById('f-'+STEPS[i].n), b=document.getElementById('f-'+STEPS[i+1].n);
    if(!a||!b)continue;
    const ra=a.getBoundingClientRect(), rb=b.getBoundingClientRect();
    const L=x=>x-R.left+wrap.scrollLeft, T=y=>y-R.top+wrap.scrollTop;
    const same=FLOWPOS[STEPS[i].n][0]===FLOWPOS[STEPS[i+1].n][0];
    let p;
    if(same){   // 同じ塊の中は真下へ
      const x=L(ra.left+ra.width/2);
      p=`M${x} ${T(ra.bottom)} L${x} ${T(rb.top)-3}`;
    }else{      // 塊をまたぐ時は右へ回す
      const x1=L(ra.right), y1=T(ra.top+ra.height/2);
      const x2=L(rb.left)-3, y2=T(rb.top+rb.height/2), mx=(x1+x2)/2;
      p=`M${x1} ${y1} C${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
    }
    d+=`<path d="${p}" fill="none" stroke="#cbd5e1" stroke-width="2" marker-end="url(#ah)"/>`;
  }
  svg.innerHTML=d;
}

function showStep(n){
  const s=FN[n]; if(!s)return;
  document.querySelectorAll('.fnode').forEach(x=>x.classList.toggle('on',+x.dataset.step===n));
  document.getElementById('fdp').innerHTML=`
    <div class="fdh"><span class="fno">${s.n}</span><h3>${esc(s.name)}</h3>
      ${skillTag(s.skill)}</div>
    <p class="fdw">${esc(s.what)}</p>
    ${s.tool?`<div class="fm"><i>道具</i>${esc(s.tool)}</div>`:''}
    ${s.out?`<div class="fm"><i>出るもの</i>${esc(s.out)}</div>`:''}
    ${s.risk?`<div class="frisk"><b>過去の事故</b>${esc(s.risk)}</div>`:''}
    ${s.gap?`<div class="fgap"><b>足りない</b>${esc(s.gap)}</div>`:''}`;
}

function skillTable(){
  const list=DATA.skills||[];
  if(!list.length)return '<p style="color:var(--mute)">スキルが見つかりません。</p>';
  const miss=MISSING.map(id=>{
    const at=STEPS.filter(s=>s.skill===id).map(s=>s.n+'. '+s.name).join(' / ');
    return `<tr class="rmiss"><td><b>${esc(id)}</b></td>
      <td><span class="pill" style="background:var(--bad)">未作成</span></td>
      <td>フローが呼んでいるのに ~/.claude/skills/ に無い</td>
      <td>${esc(at)}</td></tr>`}).join('');
  const rows=list.map(s=>{
    const at=STEPS.filter(x=>x.skill===s.id);
    return `<tr>
      <td><b>${esc(s.id)}</b></td>
      <td>${s.mine?'<span class="pill" style="background:var(--live)">自作</span>'
                  :'<span class="pill" style="background:#94a3b8">既製</span>'}</td>
      <td class="sd">${esc(s.desc).slice(0,150)}</td>
      <td>${at.length?at.map(x=>esc(x.n+'. '+x.name)).join('<br>')
                     :'<span style="color:#9ca3af">フロー未接続</span>'}</td></tr>`}).join('');
  const gaps=STEPS.filter(s=>!s.skill&&s.gap);
  const bl=list.filter(s=>s.mine&&s.blocked).map(s=>s.id);
  return `<table><thead><tr><th>スキル</th><th>種別</th><th>説明</th>
      <th>フローのどこで動くか</th></tr></thead><tbody>${miss}${rows}</tbody></table>
    <p class="note" style="margin-top:8px">zip は <code>~/.claude/skills/</code> に展開すれば使える。
      ${bl.length?`<b style="color:var(--bad)">${bl.map(esc).join(' / ')} は案件名を含むため束に入れていない。</b>`:''}</p>
    ${gaps.length?`<div class="todo" style="margin-top:16px"><h3>スキルにすべき工程 ${gaps.length}件</h3><ul>${
      gaps.map(s=>`<li><b>${s.n}. ${esc(s.name)}</b> … ${esc(s.gap)}</li>`).join('')}</ul></div>`:''}`;
}

function linkCell(v){
  return v.status==='draft'
    ? `<span class="lk dead">${esc(v.id)}/</span>`
    : `<a class="lk" href="${url(v.id)}" target="_blank" rel="noopener">${esc(v.id)}/ ↗</a>`;
}

function listPane(p){
  if(!p.versions.length)return '<p style="color:var(--mute)">まだ版がありません。'
    +'<br>lpv.py new で最初の版を登録してください。</p>';
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
    <th>変更内容</th><th>完了</th><th>日付</th></tr></thead><tbody>${rows}</tbody></table>
    ${glossary()}`;
}

/* ★用語は説明を画面に置く。頭の中にしか無い言葉は、3日で意味が分からなくなる。 */
function glossary(){
  const G=[
   ['本線','いま施主に渡しているリンク。案件につき1本だけ'],
   ['派生元','その版を作るとき、どの版をコピーして始めたか。ここが抜けると系統が追えなくなる'],
   ['公開中','本線として出している版'],
   ['旧版','かつて本線だった、または役目を終えた版。上書きしない（渡した相手がまだ見ている）'],
   ['確認待ち','施主に見せて返事を待っている使い捨てのリンク。採用されなければ捨てる'],
   ['作りかけ','まだ誰にも渡していない。公開もしていない'],
   ['反映済','本線に取り込まれた＝<b>完了</b>'],
   ['未反映','まだ本線になっていない。<b>リンクが出来ただけでは完了ではない</b>（これで事故った）'],
  ];
  return `<details class="glo"><summary>用語の意味</summary><dl>${
    G.map(([k,v])=>`<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></details>`;
}

function graphPane(p){
  if(!p.versions.length)return '<p style="color:var(--mute)">まだ版がありません。</p>';
  const NW=212, GX=64, RH=116;              // 節の幅 / 横の間隔 / 1段の高さ
  const by={}; p.versions.forEach(v=>by[v.id]=v);
  // 親が別プロジェクトにいる場合（例：小学生向けの親はオンライン校の版）は根として扱う
  const par=v=>(v.parent&&by[v.parent])||null;

  // 横位置＝世代
  // ★循環（a→b→a）を踏むと無限再帰でページごと固まる。必ず seen で止める。
  const depth={};
  const d=(v,seen)=>{
    if(depth[v.id]!=null)return depth[v.id];
    seen=seen||{};
    if(seen[v.id])throw new Error('派生元が循環しています：'+v.id);
    seen[v.id]=1;
    const pa=par(v); return depth[v.id]=pa?d(pa,seen)+1:0;};
  try{ p.versions.forEach(v=>d(v)); }
  catch(e){ return `<p style="color:var(--bad);font-weight:700">▲ ${esc(e.message)}<br>
    <span style="font-weight:400;font-size:12.5px">lp-registry.json の parent を直してください。</span></p>`; }

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
    // 親が別案件にいる版は、この図では根に見える。由来が消えるので明示する。
    const out=v.parent&&!by[v.parent]&&ALL[v.parent];
    const ext=out?`<div class="ext">← ${esc(OWNER[v.parent].name)} の ${esc(v.parent)} から</div>`:'';
    return `<div class="gnode${out?' hasext':''}" id="g-${v.id}" style="--c:${c};--b:${b};`
      +`left:${depth[v.id]*(NW+GX)}px;top:${(row[v.id]*RH).toFixed(1)}px">
      <div class="t">${linkCell(v)}</div>
      <div class="d">${esc(v.date)} · ${lab}${v.merged?'':' · <span style="color:var(--bad)">本線未反映</span>'}</div>
      ${ext}<div class="w">${esc(v.what)}</div></div>`}).join('');
  // 世代が深いと画面に入り切らない。畳むと系統が読めなくなるので幅は変えず、断り書きだけ出す
  const hint=maxD>=5?`<p class="note" style="margin-bottom:8px">
    ${maxD+1}世代あります。図は右に続くので横にスクロールしてください。</p>`:'';
  return `${hint}<div class="graph"><svg class="gsvg"></svg>
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
  // 「しくみ」の画面は案件に属さないので、先に分岐して描き切る
  if(cur==='__flow__'){
    document.querySelector('.main').innerHTML=`
      <div class="head"><h2>LP制作フローとスキル</h2>
        <span class="cl">問い合わせを受けてから、本線に取り込むまで</span></div>
      <p class="note">各工程で動くスキルと、過去にそこで何をやらかしたかを1枚にしてある。
        定義は lp-flow.json、説明は各 SKILL.md の先頭から。
        案件の中身は載せない（このリポジトリは公開）。</p>
      <div class="pane">${flowPane()}</div>`;
    // 派生図と同じ理由で rAF に頼らない（背面タブだと発火しない）
    setTimeout(drawFlow,0);
    if(document.fonts&&document.fonts.ready) document.fonts.ready.then(drawFlow);
    addEventListener('load',drawFlow,{once:true});
    return;
  }
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
  const a=e.target.closest('.side a'); if(a){cur=a.dataset.p;tab='graph';render();return;}
  const b=e.target.closest('.tabs button'); if(b){tab=b.dataset.t;render();return;}
  // フローの節を押したら、下の欄に詳細を出す（図は描き直さない）
  const fn=e.target.closest('.fnode');
  if(fn){showStep(+fn.dataset.step);}
});
addEventListener('resize',()=>{
  if(cur==='__flow__')return drawFlow();
  if(tab==='graph')drawLines(DATA.projects.find(x=>x.id===cur));});
render();
"""


def main():
    reg = json.load(open(REG, encoding="utf-8"))
    # ★おかしい台帳から画面を作らない。間違った図が出るほうが、出ないより危ない。
    #   lpv.py build 経由でなく、これを直接叩かれた時のための保険。
    if os.environ.get("LPV_CHECKED") != "1":   # lpv.py build 経由なら検査済み
        try:
            import lpv
            if lpv.check(reg):
                sys.exit("\n  ★台帳にエラーがあるので生成しない（詳細は lpv.py check）")
        except ImportError:
            print("  ▲ lpv.py が無いので台帳を検査していない")
    reg.pop("_readme", None)
    flow = json.load(open(FLOW, encoding="utf-8")) if os.path.exists(FLOW) else {"steps": []}
    flow.pop("_readme", None)
    reg["flow"] = flow
    reg["skills"], reg["bundle"] = read_skills()
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
