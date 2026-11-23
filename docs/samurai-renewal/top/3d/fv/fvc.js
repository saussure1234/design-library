// FV 案C「ピント送り」
// 真っ黒に、ピントの合っていない光の玉（ボケ）がいくつも浮かぶ。3語も同じようにぼけていて読めない（signal. だけ水色のにじみ）。
// スクロール＝レンズのピントリングを回す（カチカチという手応えの音）：光の玉が縮んで小さな星になり、
// find → the → signal. の順にピントが合って文字がくっきり立つ（そろった瞬間に澄んだ2音）。手前のノイズはぼけたまま残る。
// つなぎ：ピントをさらに奥へ送る（ラックフォーカス）。3語は手前のボケになって溶け、奥の闇でぼやけていた岩と朱の線にピントが来て、
// そのまま場面1の空間になる。
import { THREE, SP, clamp, sstep, mix, stage, sfx, mtof, SND, ease, V, makeRnd, createSpace, layoutWords, scene1Text, lockSound, openSound, edge } from './common.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';

await Promise.race([document.fonts.load('250 100px "Bricolage Grotesque"'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
const S = stage({ fov: 46, fovSp: 62, bloom: [0.7, 0.5, 0.25], grain: 0.035, vig: 0.55, exposure: 0.9, dpr: 1.5, dprSp: 2 });
const { scene, camera, composer } = S;
const space = createSpace(S);
const rnd = makeRnd(77);
const rr = (a, b) => a + (b - a) * rnd();

// 被写界深度（つなぎの間だけ動かす）
const bokeh = new BokehPass(scene, camera, { focus: 12, aperture: 0.004, maxblur: 0.012 });
bokeh.enabled = false; composer.insertPass(bokeh, 1);

// ---------- 光の玉（ボケ） ----------
const NB = SP ? 90 : 160;
const BU = { uF: { value: 0.6 }, uK: { value: 40 }, uPx: { value: 1000 }, uDpr: { value: S.st.DPR }, uT: { value: 0 }, uA: { value: 1 }, uIn: { value: 0 } };
{
  const pos = new Float32Array(NB * 3), col = new Float32Array(NB * 3), sz = new Float32Array(NB), sd = new Float32Array(NB);
  const PAL = [[0.62, 0.71, 0.86], [0.62, 0.71, 0.86], [0.7, 0.76, 0.9], [0.74, 0.66, 1.0], [0.86, 0.8, 1.0], [0.78, 0.94, 1.0], [1.0, 0.86, 0.72]];
  for (let i = 0; i < NB; i++) {
    const near = rnd() < 0.22, z = near ? -rr(2.2, 7) : -rr(14, 80);
    const sp = -z * Math.tan(THREE.MathUtils.degToRad(SP ? 31 : 23));
    pos.set([rr(-1.1, 1.1) * sp * (SP ? 0.6 : 1.7), rr(-1.05, 1.05) * sp, z], i * 3);
    const c = PAL[Math.floor(rnd() * PAL.length)]; col.set(c, i * 3);
    sz[i] = rr(0.6, 1.8) * (near ? 0.6 : 1); sd[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSz', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aSd', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: BU, fog: false,
    vertexShader: `attribute vec3 aCol; attribute float aSz, aSd; uniform float uF, uK, uPx, uDpr, uT, uA, uIn;
      varying vec3 vC; varying float vA; varying float vB;
      void main(){
        vec3 p=position+vec3(sin(uT*.13+aSd*40.),cos(uT*.11+aSd*23.),0.)*.12;
        vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z; gl_Position=projectionMatrix*mv;
        float base=aSz*1.6*uDpr;
        float coc=abs(1./max(d,.1)-1./uF)*uK*uDpr;
        coc=min(coc,uPx*.16);
        float s=base+coc; gl_PointSize=s;
        float e=clamp((base*base)/(s*s)*1.8,.03,1.);
        vA=e*uA*uIn*(.75+.25*sin(uT*(.6+aSd)+aSd*50.))*smoothstep(.5,2.,d);
        vB=clamp(coc/(base*3.+.001),0.,1.); vC=aCol; }`,
    fragmentShader: `varying vec3 vC; varying float vA; varying float vB;
      void main(){ vec2 q=gl_PointCoord*2.-1.; float r=length(q); if(r>1.) discard;
        float soft=pow(1.-r,2.);
        float disk=smoothstep(1.,.9,r)*(.7+.3*smoothstep(.55,.95,r));
        float a=mix(soft,disk,smoothstep(.1,.6,vB));
        gl_FragColor=vec4(vC*a*vA,1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
  S.onResize((st) => { BU.uPx.value = st.px; });
}

// ---------- 3語 ----------
const fvx = document.getElementById('fvx'), sum = document.getElementById('fsum');
const ws = [...fvx.querySelectorAll('.wd')];
let L = null;
const relayout = () => { L = layoutWords(ws, sum); };
relayout(); S.onResize(relayout);
// 書体が後から届いた時も測り直す（3語の幅がずれないように）
document.fonts?.ready.then(() => relayout()); document.fonts?.addEventListener?.('loadingdone', () => relayout());
const WU = [0.45, 0.72, 1.0];        // ピントリングがここまで回ると、その語が合う（合った語は離さない）
const lockE = WU.map(() => edge()), lockAll = edge(), rackE = edge();
const tx1 = scene1Text();
const look = new THREE.Vector3();
let lastF = 0.6, clickAcc = 0, lastP = 0;

S.run((st) => {
  const p = st.p, t = st.t;
  BU.uT.value = t; BU.uIn.value = Math.min(1, t / 1.5);
  // ピント：0.6 → 12（3語の面）→ さらに奥へ（つなぎ）
  const u = sstep(0.04, 0.34, p), rack = sstep(0.5, 0.8, p);
  const f = rack > 0 ? mix(12, 46, ease(rack)) : 1 / mix(1 / 0.6, 1 / 12, Math.pow(u, 0.7));
  BU.uF.value = f;
  BU.uK.value = SP ? 28 : 40;
  BU.uA.value = 1 - 0.45 * sstep(0.7, 1.0, p);
  // 3語：ピントが通った語からくっきり
  const out = 1 - sstep(0.52, 0.63, p);
  let allIn = true;
  ws.forEach((w, i) => {
    const inF = u >= WU[i] - 0.001 || rack > 0;
    if (!inF) allIn = false;
    let bl = inF ? 0 : L.F * 0.17 * Math.pow(1 - u / WU[i], 1.2);
    bl += sstep(0.5, 0.66, p) * L.F * 0.3;    // つなぎ：手前のボケになって溶ける
    const sc = 1 + bl / L.F * 0.25 + sstep(0.5, 0.66, p) * 0.1;
    const cx = L.B[i].x, cy = L.B[i].y;
    w.style.transform = `translate3d(${cx.toFixed(1)}px,${cy.toFixed(1)}px,0) scale(${sc.toFixed(4)})`;
    w.style.filter = bl > 0.3 ? `blur(${bl.toFixed(1)}px)` : 'none';
    w.style.opacity = ((inF ? 1 : 0.6 + 0.4 * Math.max(0, 1 - bl / (L.F * 0.17))) * out).toFixed(3);
    if (lockE[i](inF && rack === 0) && i < 2) { const o = SND.out(); if (o) sfx.tone(o, mtof([76, 79][i]), 0.035, 0.004, 0.8, 'sine', o.music); }
  });
  ws[2].classList.toggle('lit', allIn);
  if (lockAll(allIn && rack === 0 && p > 0.3)) lockSound(SND.out());
  const sv = sstep(0.36, 0.44, p);
  sum.style.opacity = (sv * out).toFixed(3);
  const sb = (1 - sv) * 6 + sstep(0.5, 0.66, p) * 14;
  sum.style.filter = sb > 0.2 ? `blur(${sb.toFixed(1)}px)` : 'none';

  // ピントリングのカチカチ（ピントが動いた分だけ）
  clickAcc += Math.abs(f - lastF); lastF = f;
  const step = f < 12 ? 0.35 : 2.4;
  if (clickAcc > step) { clickAcc = 0; const o = SND.out(); if (o) { sfx.burst(o, 0.05, 0.012, 'highpass', 3800, 1.2); sfx.tone(o, 2100, 0.008, 0.001, 0.02, 'square'); } }

  // つなぎ：奥にピントが来る（岩と朱の線）
  if (rackE(rack > 0.02)) openSound(SND.out(), false);
  const vis = sstep(0.5, 0.8, p);
  bokeh.enabled = p > 0.48 && p < 0.9;
  bokeh.uniforms.focus.value = f;
  bokeh.uniforms.aperture.value = (SP ? 0.008 : 0.006) * (1 - sstep(0.8, 0.9, p));
  space.update(vis, p < 0.7 ? 0 : ease(sstep(0.7, 1.0, p)), t);
  const cam = sstep(0.7, 1.0, p);
  camera.position.set(0.35 * cam, (SP ? 0.6 : 0.25) * cam, -4.5 * ease(cam));
  look.set(mix(0, -1.4, cam), mix(0, SP ? -1.2 : -0.2, cam), -60);
  camera.lookAt(look);
  tx1(sstep(0.84, 1.0, p));

  SND.scene(p > 0.62 ? 1 : 0);
  const vel = (p - lastP) / Math.max(st.dt, 1e-3); lastP = p;
  SND.update({ noise: 1 - u, fv: 1 - sstep(0.5, 0.8, p), travel: cam * 0.5, vel: vel * 2, dawn: 0, day: 0, tv: 0 });
}, { chord: 0, init: () => ({ update() {} }) });
