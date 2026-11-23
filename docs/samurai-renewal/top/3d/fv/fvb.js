// FV 案B「ノイズの文字の海」
// 真っ黒な画面いっぱいに、小さな等幅の英単語（trend / buzz / viral / hype …＝一時的なノイズ）が何十列も左右に流れている。
// スクロールすると列の流れが止まり、その中に混ざっていた find・the・signal. だけが順に光る（スロットの絵柄がそろうように、3語の列だけ目当ての位置で止まる）。
// 光った3語が文字の海から浮き上がって大きくなり、中央で1列にそろう（そろった瞬間に澄んだ2音）。
// つなぎ：残ったノイズの文字が1文字ずつほどけて奥行きの中へ散り、そのまま宇宙の塵になる。闇から岩が明け、朱の線が奥へ伸びる。
import { THREE, SP, clamp, sstep, mix, stage, sfx, mtof, SND, ease, easeOut, V, makeRnd, createSpace, layoutWords, scene1Text, lockSound, openSound, edge } from './common.js';

await Promise.race([Promise.all([document.fonts.load('250 100px "Bricolage Grotesque"'), document.fonts.load('400 48px "JetBrains Mono"')]), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
const S = stage({ fov: 46, fovSp: 62, bloom: [0.6, 0.4, 0.3], grain: 0.03, vig: 0.5, exposure: 0.9, dpr: 1.5, dprSp: 2 });
const { scene, camera } = S;
const space = createSpace(S);
const D = 10;
const rnd = makeRnd(1124);

// ---------- 文字の型（等幅・自前で描く） ----------
const CH = "abcdefghijklmnopqrstuvwxyz0123456789#%.+-/:@!?&$'";
const G = 7, CELL = 64;
const atlas = (() => {
  const c = document.createElement('canvas'); c.width = c.height = G * CELL; const x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.flipY = false; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 4;
  const draw = () => { x.clearRect(0, 0, c.width, c.height); x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = '400 34px "JetBrains Mono", ui-monospace, Menlo, monospace';
    [...CH].forEach((ch, i) => x.fillText(ch, (i % G + 0.5) * CELL, (Math.floor(i / G) + 0.52) * CELL)); t.needsUpdate = true; };
  draw(); document.fonts?.ready.then(draw); return t;
})();

// ---------- 文字の海 ----------
const NOISE = ['trend', 'buzz', 'hype', 'viral', 'click', 'views', 'likes', 'rumor', 'update', 'breaking', 'now', 'new', 'best', 'top10', 'sale', '50%off', 'ranking', 'follow', 'share', '#ad', 'fomo', 'growth', 'hack', 'must-see', 'latest', 'news', 'feed', 'alert', 'boost', 'reach', 'score', 'kpi', 'ctr', 'roi', 'seo', 'faster', 'more', 'free', 'limited', 'today', 'hot', 'win', 'quick', 'repost', 'sponsored', 'live', 'buzzword', '#trending', 'ads', 'promo', 'tips', 'top', 'cheap', 'deal', 'wow', 'omg', 'react', 'scroll', 'swipe', 'notify', 'urgent', 'only-today', '+1', '99%', 'next', 'more!', 'shock'];
const FS = SP ? 11 : 13, CW = FS * 0.6, RH = SP ? 24 : 30;
let W = innerWidth, H = innerHeight;
const ROWS = Math.min(64, Math.ceil(H / RH) + 1), MARG = 24 * CW;
const COLS = Math.ceil((W + MARG * 2) / CW);
const WRAP = COLS * CW;
const TGT = ['find', 'the', 'signal.'];
// 3語が止まる場所（画面の割合）：散らばった位置
const SPOT = SP ? [[0.1, 0.24], [0.56, 0.5], [0.3, 0.7]] : [[0.13, 0.27], [0.55, 0.58], [0.68, 0.19]];
const tRow = SPOT.map(([, fy]) => Math.max(0, Math.min(ROWS - 1, Math.round(fy * H / RH - 0.5))));
const tCol = TGT.map(() => 0);
const rowSpd = Array.from({ length: ROWS }, (_, r) => (r % 2 ? -1 : 1) * (14 + rnd() * 46));
const free = Array.from({ length: ROWS }, () => rnd() * WRAP);
const offs = new Float32Array(64);
const ax = [], arow = [], ach = [], asd = [], ahit = [], abr = [], asc = [];
for (let r = 0; r < ROWS; r++) {
  let col = Math.floor(rnd() * 4);
  const ti = tRow.indexOf(r);
  const ins = ti >= 0 ? Math.floor(COLS * (0.3 + 0.4 * rnd())) : -1;
  while (col < COLS) {
    let wd, hit = 0;
    if (ins >= 0 && col >= ins && !tCol[ti]) { wd = TGT[ti]; hit = ti + 1; tCol[ti] = col || 1; }
    else wd = NOISE[Math.floor(rnd() * NOISE.length)];
    if (col + wd.length >= COLS) break;
    const br = hit ? 0.3 : (rnd() < 0.08 ? 0.42 : 0.1 + rnd() * 0.16);
    [...wd].forEach((c, j) => {
      const ci = CH.indexOf(c); if (ci < 0) return;
      ax.push((col + j) * CW); arow.push(r); ach.push(ci); asd.push(rnd()); ahit.push(hit); abr.push(br);
      // 散る先：場面1の空間（奥行き）
      const z = rnd() < 0.18 ? -2.5 - rnd() * 7 : -6 - Math.pow(rnd(), 1.3) * 150, a = rnd() * 6.283, rad = 1.5 + Math.pow(rnd(), 0.8) * (8 + -z * 0.28);
      asc.push(Math.cos(a) * rad, Math.sin(a) * rad * 0.7, z);
    });
    col += wd.length + 1 + (rnd() < 0.2 ? 2 : 0);
  }
}
const N = ax.length;
const FU = {
  uOff: { value: offs }, uWrap: { value: WRAP }, uMarg: { value: MARG }, uRH: { value: RH }, uW: { value: W }, uH: { value: H }, uPxW: { value: 0.01 }, uD: { value: D },
  uGS: { value: FS * 1.5 }, uPx: { value: 1000 }, uScat: { value: 0 }, uDim: { value: 1 }, uHit: { value: new THREE.Vector3() }, uHitOut: { value: 0 }, uT: { value: 0 }, uAtlas: { value: atlas }, uIn: { value: 0 },
};
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
  const A = (n, a, k = 1) => g.setAttribute(n, new THREE.BufferAttribute(new Float32Array(a), k));
  A('aX', ax); A('aRow', arow); A('aCh', ach); A('aSd', asd); A('aHit', ahit); A('aBr', abr); A('aSc', asc, 3);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: FU, fog: false,
    vertexShader: `attribute float aX, aRow, aCh, aSd, aHit, aBr; attribute vec3 aSc;
      uniform float uOff[64]; uniform float uWrap, uMarg, uRH, uW, uH, uPxW, uD, uGS, uPx, uScat, uDim, uHitOut, uT, uIn; uniform vec3 uHit;
      varying vec2 vC; varying vec3 vCol; varying float vA;
      void main(){
        float off=uOff[int(aRow)];
        float xp=mod(aX+off,uWrap)-uMarg, yp=(aRow+.5)*uRH;
        vec3 fp=vec3((xp-uW*.5)*uPxW,(uH*.5-yp)*uPxW,-uD);
        float k=clamp(uScat*1.45-aSd*.45,0.,1.); k=k*k*(3.-2.*k);
        vec3 sc=aSc+vec3(sin(uT*.2+aSd*30.),cos(uT*.17+aSd*20.),0.)*.3;
        vec3 p=mix(fp,sc,k);
        vec4 mv=viewMatrix*vec4(p,1.); float d=-mv.z; gl_Position=projectionMatrix*mv;
        gl_PointSize=min(uGS*uPxW*uPx/max(d,.1)*mix(1.,.9,k),uPx*.09);
        float hi=aHit>2.5?uHit.z:aHit>1.5?uHit.y:aHit>.5?uHit.x:0.;
        vec3 base=vec3(.62,.68,.82);
        vec3 hc=aHit>2.5?vec3(.78,.94,1.):vec3(1.);
        vCol=mix(base*aBr*mix(uDim,1.8,k),hc*1.25,hi)*(aHit>.5?1.-uHitOut:1.);
        float fl=.82+.18*sin(uT*(1.5+aSd*3.)+aSd*40.);
        float fog=1.-exp(-pow(d*.022,2.));
        vA=mix(fl,1.,hi)*mix(1.,.9*(1.-fog)*smoothstep(.5,3.,d),k)*uIn*step(-uMarg+1.,xp)*step(xp,uW+uMarg-1.)*mix(smoothstep(58.,120.,yp)*smoothstep(uH-10.,uH-90.,yp),1.,k);
        vC=vec2(mod(aCh,${G}.),floor(aCh/${G}.));
      }`,
    fragmentShader: `uniform sampler2D uAtlas; varying vec2 vC; varying vec3 vCol; varying float vA;
      void main(){ vec2 uv=(vC+gl_PointCoord)/${G}.; float a=texture2D(uAtlas,uv).a; if(a<.02) discard; gl_FragColor=vec4(vCol*a*vA,1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
}

// ---------- 3語 ----------
const fvx = document.getElementById('fvx'), sum = document.getElementById('fsum');
const ws = [...fvx.querySelectorAll('.wd')];
let L = null, hh = 1;
const relayout = () => {
  L = layoutWords(ws, sum);
  hh = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  FU.uPxW.value = 2 * hh / innerHeight; FU.uW.value = innerWidth; FU.uH.value = innerHeight;
};
relayout(); S.onResize(relayout);
// 書体が後から届いた時も測り直す（3語の幅がずれないように）
document.fonts?.ready.then(() => relayout()); document.fonts?.addEventListener?.('loadingdone', () => relayout()); S.onResize((st) => { FU.uPx.value = st.px; });
// 3語の列が止まる「ずれ」：その語の先頭が SPOT の x に来る値
const tOff = TGT.map((_, i) => SPOT[i][0] * innerWidth + MARG - tCol[i] * CW);
const wrapD = (d, dir) => { d = ((d % WRAP) + WRAP) % WRAP; return dir > 0 ? d : d - WRAP; };
const hitEdges = TGT.map(() => edge()), lockEdge = edge(), scatEdge = edge(), stopEdge = edge();
const tx1 = scene1Text();
const look = new THREE.Vector3();
let lastP = 0;

S.run((st) => {
  const p = st.p, t = st.t, dt = st.dt;
  FU.uT.value = t; FU.uIn.value = Math.min(1, t / 1.2);
  // 流れ → 止まる（3語の列だけ目当ての位置へ寄せる）
  const calm = sstep(0.02, 0.12, p), snap = sstep(0.02, 0.13, p);
  for (let r = 0; r < ROWS; r++) {
    free[r] += rowSpd[r] * dt * (1 - calm);
    const ti = tRow.indexOf(r);
    offs[r] = ti >= 0 ? free[r] + wrapD(tOff[ti] - free[r], rowSpd[r]) * snap : free[r];
  }
  if (calm < 0.95 && Math.random() < 0.4 * (1 - calm)) SND.tick();
  if (stopEdge(calm > 0.98)) { const o = SND.out(); if (o) sfx.tone(o, 82, 0.08, 0.004, 0.35, 'sine', o.music, 60); }
  // 3語が光る（順に）
  const hit = TGT.map((_, i) => sstep(0.13 + 0.03 * i, 0.16 + 0.03 * i, p));
  FU.uHit.value.set(hit[0], hit[1], hit[2]);
  FU.uDim.value = 1 - 0.72 * sstep(0.12, 0.22, p);
  hit.forEach((h, i) => { if (hitEdges[i](h > 0.5)) { const o = SND.out(); if (o) { sfx.tone(o, mtof([74, 79, 86][i]), 0.04, 0.003, 0.9, 'sine', o.music); sfx.burst(o, 0.02, 0.03, 'highpass', 6000, 1); } } });
  // 浮き上がって中央で1列に
  const out = 1 - sstep(0.5, 0.58, p);
  FU.uHitOut.value = sstep(0.21, 0.27, p);
  let all = 1;
  ws.forEach((w, i) => {
    const e = ease(sstep(0.21 + 0.015 * i, 0.35, p)); all = Math.min(all, e);
    const x0 = SPOT[i][0] * innerWidth, y0 = (tRow[i] + 0.5) * RH - FS * 0.62;
    const s0 = FS * 1.08 / L.F;
    const s = mix(s0, 1, e), x = mix(x0, L.B[i].x, e), y = mix(y0, L.B[i].y, e) - (1 - out) * 24;
    w.style.transform = `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) scale(${s.toFixed(4)})`;
    w.style.opacity = (sstep(0.2, 0.25, p) * out).toFixed(3);
  });
  const locked = all > 0.999;
  ws[2].classList.toggle('lit', locked);
  if (lockEdge(locked)) lockSound(SND.out());
  sum.style.opacity = (sstep(0.37, 0.45, p) * out).toFixed(3);
  sum.style.transform = `translateY(${((1 - sstep(0.37, 0.45, p)) * 14 - (1 - out) * 24).toFixed(1)}px)`;

  // つなぎ：文字がほどけて奥へ散る＝宇宙の塵に
  const sc = sstep(0.5, 0.74, p);
  FU.uScat.value = sc;
  if (scatEdge(sc > 0.02)) openSound(SND.out(), true);
  const vis = sstep(0.56, 0.88, p);
  space.update(vis, p < 0.72 ? 0 : ease(sstep(0.72, 1.0, p)), t);
  const cam = sstep(0.55, 1.0, p);
  camera.position.set(0.35 * cam, (SP ? 0.6 : 0.25) * cam, -5.5 * ease(cam));
  look.set(mix(0, -1.4, cam), mix(0, SP ? -1.2 : -0.2, cam), -60);
  camera.lookAt(look);
  tx1(sstep(0.84, 1.0, p));

  SND.scene(p > 0.66 ? 1 : 0);
  const vel = (p - lastP) / Math.max(dt, 1e-3); lastP = p;
  SND.update({ noise: 1 - calm * 0.8 - 0.2 * (locked ? 1 : 0), fv: 1 - sstep(0.5, 0.8, p), travel: cam * 0.5, vel: vel * 2, dawn: 0, day: 0, tv: 0 });
}, { chord: 0, init: () => ({ update() {} }) });
