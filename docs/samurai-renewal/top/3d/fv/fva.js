// FV 案A「同調する一本の波」
// 真っ黒に、ノイズの波形（オシロの線）が何十本も震えている。3語は1列にあるが、電波が合っていないように揺れて二重に見える。
// スクロール＝つまみを回す：find → the → signal. の順に像が合い、波形が1本に寄って澄んだ水色の正弦波になる（そろった瞬間に澄んだ2音）。
// つなぎ：波が平らな1本の線になり、その線が手前から奥へ倒れ込んで宇宙の奥行きになる。倒れながら水色→朱に変わり、
// 闇から岩と塵が明けてきて、朱の線がそのまま場面1の奥へ伸びていく。
import { THREE, SP, clamp, sstep, mix, stage, sfx, mtof, SND, ease, V, createSpace, layoutWords, scene1Text, lockSound, openSound, edge } from './common.js';

await Promise.race([document.fonts.load('250 100px "Bricolage Grotesque"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
const S = stage({ fov: 46, fovSp: 62, bloom: [0.75, 0.45, 0.22], grain: 0.03, vig: 0.5, exposure: 0.85, dpr: 1.5, dprSp: 2 });
const { scene, camera, st } = S;
const space = createSpace(S);
const D = 10;
let hh = 1, hw = 1;
const fit = () => { hh = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); hw = hh * innerWidth / innerHeight; };

// ---------- ノイズの波形（何十本もの細い線） ----------
const NR = SP ? 15 : 24, NM = SP ? 160 : 260;
const TU = { uT: { value: 0 }, uTune: { value: 0 }, uHW: { value: 1 }, uHH: { value: 1 }, uY: { value: 0 }, uOut: { value: 1 } };
{
  const n = NR * (NM - 1) * 2, aU = new Float32Array(n), aRow = new Float32Array(n), aSd = new Float32Array(n), pos = new Float32Array(n * 3);
  let k = 0;
  for (let r = 0; r < NR; r++) { const sd = Math.random(); for (let i = 0; i < NM - 1; i++) for (const j of [i, i + 1]) { aU[k] = j / (NM - 1); aRow[k] = (r + 0.5) / NR; aSd[k] = sd; k++; } }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aU', new THREE.BufferAttribute(aU, 1)); g.setAttribute('aRow', new THREE.BufferAttribute(aRow, 1)); g.setAttribute('aSd', new THREE.BufferAttribute(aSd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: TU, fog: false,
    vertexShader: `attribute float aU, aRow, aSd; uniform float uT, uTune, uHW, uHH, uY; varying float vA; varying float vSd;
      float h(float x){ return fract(sin(x*127.1)*43758.5453); }
      float vn(float x){ float i=floor(x), f=fract(x); f=f*f*(3.-2.*f); return mix(h(i),h(i+1.),f)*2.-1.; }
      void main(){
        float x=(aU*2.-1.)*uHW*1.08;
        float base=(aRow*2.-1.)*uHH*.86;
        float k=uTune*uTune*(3.-2.*uTune);
        float y=mix(base,uY,k);
        float t=uT*(.7+aSd*.9);
        float w=vn(aU*9.+t*1.3+aSd*50.)*.55 + vn(aU*31.-t*2.7+aSd*20.)*.3 + sin(aU*(20.+aSd*40.)+t*3.+aSd*9.)*.18;
        float crack=(h(floor(aU*140.)+floor(uT*24.)*7.1+aSd*91.)-.5)*step(.86,h(floor(aU*14.)+floor(uT*3.)+aSd*13.))*1.6;
        float amp=uHH*.045*(1.-k)*(.6+.8*aSd);
        y+=(w+crack)*amp;
        vA=(.1+.16*aSd)*(1.-k)*smoothstep(0.,.08,aU)*smoothstep(1.,.92,aU); vSd=aSd;
        gl_Position=projectionMatrix*viewMatrix*vec4(x,y,-${D.toFixed(1)},1.); }`,
    fragmentShader: `varying float vA; varying float vSd; uniform float uOut;
      void main(){ vec3 c=mix(vec3(.55,.62,.8),vec3(.74,.66,1.),step(.8,vSd)); gl_FragColor=vec4(c*vA*uOut,1.); }`,
  });
  const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; scene.add(ls);
}

// ---------- 主役の1本（帯：CPU で毎コマ） ----------
const MM = SP ? 220 : 360;
const deep = Array.from({ length: MM }, (_, i) => space.curve.getPointAt(i / (MM - 1) * 0.33));
const ph = Array.from({ length: 4 }, () => Math.random() * 6.283);
function ribbon(wid, alphaK) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(MM * 2 * 3), col = new Float32Array(MM * 2 * 3), idx = [];
  for (let i = 0; i < MM - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  g.setIndex(idx); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh);
  return { g, pos, col, wid, alphaK };
}
const rbCore = ribbon(0.8, 1), rbHalo = ribbon(5, 0.07);   // 幅は px（半分）
const P = Array.from({ length: MM }, () => new THREE.Vector3());
const tmpT = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3();
const CY = new THREE.Color(0.78, 0.94, 1.0), GR = new THREE.Color(0.55, 0.62, 0.8), SG = new THREE.Color(1, 0.3, 0.1), cc = new THREE.Color();
function updateRibbon(t, tune, flat, morph, out, yW) {
  const amp = hh * 0.045 * (1 - tune), sAmp = hh * (SP ? 0.012 : 0.016) * tune * (1 - flat), mk = ease(morph), pxW = 2 * hh / innerHeight;
  for (let i = 0; i < MM; i++) {
    const u = i / (MM - 1);
    const nz = Math.sin(u * 23 + t * 2.1 + ph[0]) * 0.4 + Math.sin(u * 57 - t * 3.3 + ph[1]) * 0.25 + Math.sin(u * 131 + t * 5.1 + ph[2]) * 0.15 + (Math.random() - 0.5) * 0.35;
    const env = sstep(0, 0.1, u) * sstep(1, 0.9, u);
    const y = yW + nz * amp + Math.sin(u * 6.283 * (SP ? 4 : 7) - t * 2.4) * sAmp * env;
    const x = (u * 2 - 1) * hw * 1.08;
    const mu = clamp(mk * 1.25 - (1 - u) * 0.25);   // 奥側（右端）から先に倒れる
    const me = mu * mu * (3 - 2 * mu);
    P[i].set(mix(x, deep[i].x, me), mix(y, deep[i].y, me), mix(-D, deep[i].z, me));
  }
  for (const rb of [rbCore, rbHalo]) {
    for (let i = 0; i < MM; i++) {
      const a = P[Math.max(0, i - 1)], b = P[Math.min(MM - 1, i + 1)];
      tmpT.subVectors(b, a).normalize(); tmpV.subVectors(P[i], camera.position).normalize();
      tmpS.crossVectors(tmpT, tmpV).normalize().multiplyScalar(rb.wid * pxW * (1 + 0.6 * mk) * Math.max(0.3, Math.min(1.4, -P[i].z / D)));
      rb.pos.set([P[i].x + tmpS.x, P[i].y + tmpS.y, P[i].z + tmpS.z, P[i].x - tmpS.x, P[i].y - tmpS.y, P[i].z - tmpS.z], i * 6);
      const u = i / (MM - 1), edgeA = mix(sstep(0, 0.08, u) * sstep(1, 0.92, u), 1, mk);
      cc.copy(GR).lerp(CY, tune).lerp(SG, sstep(0.15, 0.7, mk));
      const br = (0.22 + 0.78 * tune * tune) * (tune < 1 ? 0.75 + 0.25 * Math.random() : 1) * edgeA * out * rb.alphaK * (1 + 0.8 * mk) * (1 - 0.35 * flat * (1 - mk));
      rb.col.set([cc.r * br, cc.g * br, cc.b * br, cc.r * br, cc.g * br, cc.b * br], i * 6);
    }
    rb.g.attributes.position.needsUpdate = true; rb.g.attributes.color.needsUpdate = true;
  }
}

// ---------- 3語 ----------
const fvx = document.getElementById('fvx'), sum = document.getElementById('fsum');
const ws = [...fvx.querySelectorAll('.wd')];
let L = null;
const ghosts = ws.map((w) => [['rgba(188,170,255,.9)'], ['rgba(255,150,214,.8)']].map(([c]) => { const g = document.createElement('span'); g.className = 'gh'; g.textContent = w.textContent; g.style.color = c; g.setAttribute('aria-hidden', 'true'); return g; }));
const relayout = () => { ghosts.forEach((gs) => gs.forEach((g) => g.remove())); L = layoutWords(ws, sum); sum.style.top = (L.yB + L.F * (L.sp ? 1.75 : 1.5)) + 'px'; ws.forEach((w, i) => ghosts[i].forEach((g) => w.appendChild(g))); fit(); TU.uHW.value = hw; TU.uHH.value = hh; };
relayout(); S.onResize(relayout);
// 書体が後から届いた時も測り直す（3語の幅がずれないように）
document.fonts?.ready.then(() => relayout()); document.fonts?.addEventListener?.('loadingdone', () => relayout());
const WIN = [[0.05, 0.15], [0.13, 0.24], [0.21, 0.34]];
const wordEdges = ws.map(() => edge()), lockEdge = edge(), openEdge = edge();
const tx1 = scene1Text();
const jit = ws.map(() => ({ x: 0, n: 0 }));
let lastP = 0;
const look = new THREE.Vector3();

S.run((st) => {
  const p = st.p, t = st.t;
  // つまみ（同調）
  const tw = WIN.map(([a, b]) => sstep(a, b, p));
  const tune = sstep(0.04, 0.34, p);
  const locked = tw[2] > 0.999;
  // 3語：合っていない間は揺れて二重に見える
  const out = 1 - sstep(0.5, 0.58, p);
  ws.forEach((w, i) => {
    const k = tw[i], J = jit[i];
    if (k < 1) { if (Math.random() < 0.18) J.x = (Math.random() - 0.5) * L.F * 0.5 * (1 - k); J.x *= 0.86; J.n = Math.random(); } else { J.x = 0; J.n = 0; }
    const y = L.B[i].y - (1 - out) * 24;
    w.style.transform = `translate3d(${L.B[i].x + J.x}px,${y}px,0)`;
    w.style.opacity = ((0.24 + 0.76 * k) * (k < 1 ? 0.65 + 0.35 * J.n : 1) * out).toFixed(3);
    const bl = (1 - k) * L.F * 0.035;
    w.style.filter = bl > 0.2 ? `blur(${bl.toFixed(1)}px)` : 'none';
    ghosts[i][0].style.transform = `translateX(${(-(1 - k) * L.F * 0.14 + (Math.random() - 0.5) * (1 - k) * 8).toFixed(1)}px)`;
    ghosts[i][1].style.transform = `translateX(${((1 - k) * L.F * 0.1).toFixed(1)}px)`;
    ghosts[i][0].style.opacity = ghosts[i][1].style.opacity = ((1 - k) * 0.55).toFixed(3);
    if (wordEdges[i](k > 0.999) && i < 2) { const o = SND.out(); if (o) { sfx.tone(o, mtof([76, 79][i]), 0.035, 0.003, 0.5, 'triangle', o.music); sfx.burst(o, 0.03, 0.04, 'highpass', 5000, 1); } }
  });
  ws[2].classList.toggle('lit', locked);
  if (lockEdge(locked)) lockSound(SND.out());
  sum.style.opacity = (sstep(0.36, 0.44, p) * out).toFixed(3);
  sum.style.transform = `translateY(${((1 - sstep(0.36, 0.44, p)) * 14 - (1 - out) * 24).toFixed(1)}px)`;

  // 波形と主役の線
  TU.uT.value = t; TU.uTune.value = tune; TU.uOut.value = 1 - sstep(0.4, 0.5, p);
  const yScreen = L.yB + L.F * (L.sp ? 1.32 : 1.12);
  const yW = (innerHeight / 2 - yScreen) / innerHeight * 2 * hh;
  TU.uY.value = yW;
  const flat = sstep(0.5, 0.6, p), morph = sstep(0.56, 0.8, p);
  const rOut = 1 - sstep(0.79, 0.83, p);
  updateRibbon(t, tune, flat, morph, rOut, yW);
  if (openEdge(morph > 0.02)) openSound(SND.out(), true);

  // 宇宙（場面1の頭）
  const vis = sstep(0.62, 0.95, p);
  const hd = p < 0.79 ? 0 : mix(0.33, 1, ease(sstep(0.8, 1.0, p)));
  space.update(vis, hd, t);
  const cam = sstep(0.78, 1.0, p);
  camera.position.set(0.35 * cam, (SP ? 0.6 : 0.25) * cam, -4.5 * ease(cam));
  look.set(mix(0, -1.4, cam), mix(0, SP ? -1.2 : -0.2, cam), -60);
  camera.lookAt(look);
  tx1(sstep(0.84, 1.0, p));

  // 音（土台の和音・ラジオの同調）
  SND.scene(p > 0.66 ? 1 : 0);
  SND.radio({ on: 1 - sstep(0.46, 0.56, p), x: tune, lock: locked ? 1 : tune * 0.6, near: tune, t });
  const vel = (p - lastP) / Math.max(st.dt, 1e-3); lastP = p;
  SND.update({ noise: 1 - tune, fv: 1 - sstep(0.5, 0.8, p), travel: cam * 0.5, vel: vel * 2, dawn: 0, day: 0, tv: 0 });
}, { chord: 0, init: () => ({ update() {} }) });
