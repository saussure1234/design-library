// 場面4・案E「見る角度でそろう破片」
// 闇に、短い灰色の線の破片が無数に散らばっている。どこから見てもでたらめ。
// スクロールで視点が回り込み、ある1つの角度に立った瞬間だけ、散らばっていた破片の一部が
// 1本のなめらかな波（Signal）に重なって朱く灯る。手がかりは「どこに立って見るか（視点・立場）」。
import { THREE, stage, SP, makeRnd, sstep, clamp, mix, sfx, mtof } from './base.js';

const S = stage({ fov: 42, fovSp: 60, bloom: [0.8, 0.45, 0.5], shift: { pc: [0.17, 0], sp: [0, -0.13] }, exposure: 0.85 });
const { scene, camera, st } = S;
const rnd = makeRnd(313);

const V = new THREE.Vector3(0, 0, 12);          // 波がそろって見える、ただ1つの立ち位置
const WX = SP ? 2.2 : 3.6, WA = SP ? 0.55 : 0.75;
const wave = (x) => Math.sin(x * 2.1) * WA * (0.55 + 0.45 * Math.cos(x * 0.5));

// 波の破片：波の上の短い区間を、V から見た視線の上で、ばらばらの奥行きへ飛ばす
const sig = [], noi = [];
const NSEG = 150;
for (let i = 0; i < NSEG; i++) {
  const x0 = -WX + 2 * WX * (i / NSEG) + (rnd() - 0.5) * 0.02, x1 = x0 + 2 * WX / NSEG * (1.6 + rnd() * 1.4);
  const s = 0.35 + Math.pow(rnd(), 0.8) * 1.9;   // 視線上のどこに置くか（1＝波の面）
  for (const x of [x0, Math.min(x1, WX)]) {
    const Q = new THREE.Vector3(x, wave(x), 0);
    sig.push(V.clone().add(Q.sub(V).multiplyScalar(s)));
  }
}
// ノイズの破片：同じ長さ・同じ明るさで、同じ空間にでたらめに
const NNO = SP ? 800 : 1500;
for (let i = 0; i < NNO; i++) {
  const c = new THREE.Vector3((rnd() * 2 - 1) * 9, (rnd() * 2 - 1) * 6, 6 - rnd() * 26);
  const d = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(0.08 + rnd() * 0.32);
  noi.push(c.clone().sub(d), c.clone().add(d));
}
const mkLines = (arr, col) => {
  const g = new THREE.BufferGeometry().setFromPoints(arr);
  const m = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  const l = new THREE.LineSegments(g, m); l.frustumCulled = false; scene.add(l); return l;
};
const GRAY = new THREE.Color(0.2, 0.21, 0.23);
const noiL = mkLines(noi, GRAY.clone());
const sigL = mkLines(sig, GRAY.clone());
// 端の小さな粒（破片の両端。線より少し見えやすく）
const dotG = new THREE.BufferGeometry().setFromPoints([...noi, ...sig]);
const dotU = { uPx: { value: 1000 }, uK: { value: 0 }, uN: { value: noi.length } };
const vid = new Float32Array(noi.length + sig.length).map((_, i) => i); dotG.setAttribute('aI', new THREE.BufferAttribute(vid, 1));
const dots = new THREE.Points(dotG, new THREE.ShaderMaterial({
  uniforms: dotU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float aI; uniform float uPx, uK, uN; varying vec3 vC; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
    float s=step(uN,aI); gl_PointSize=max(1.,uPx*.03/-mv.z);
    vC=mix(vec3(.26,.28,.31), vec3(1.,.3,.09)*1.8, s*uK)*(1.-smoothstep(16.,34.,-mv.z)); }`,
  fragmentShader: `varying vec3 vC; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,.1,r),1.); }`,
}));
dots.frustumCulled = false; scene.add(dots);
S.onResize((s) => { dotU.uPx.value = s.px; });

// 視点の道筋：横から回り込み、上下に揺れ、最後に V に立つ
const R = V.length();
const SIGC = new THREE.Color(1, 0.3, 0.09).multiplyScalar(1.7);
S.run((st) => {
  const p = st.p, t = st.t;
  const u = sstep(0, 0.8, p);
  const yaw = mix(1.25, 0, u) + Math.sin(u * Math.PI) * 0.25 + st.mx * 0.35 * (1 - sstep(0.75, 0.85, p));
  const pitch = mix(0.55, 0, u) - Math.sin(u * Math.PI * 2) * 0.12 - st.my * 0.25 * (1 - sstep(0.75, 0.85, p));
  const drift = (1 - u) * 0.02 * Math.sin(t * 0.4);
  camera.position.set(Math.sin(yaw + drift) * Math.cos(pitch) * R, Math.sin(pitch) * R, Math.cos(yaw + drift) * Math.cos(pitch) * R);
  camera.lookAt(0, 0, 0);
  // どれだけ V に近いか（角度）
  const ang = camera.position.angleTo(V);
  const k = 1 - sstep(0.004, 0.06, ang);
  sigL.material.color.copy(GRAY).lerp(SIGC, k);
  noiL.material.color.copy(GRAY).multiplyScalar(1 - k * 0.55);
  dotU.uK.value = k;
  st.k = k; st.ang = ang;
}, {
  chord: 4,
  base: (st) => ({ noise: 1 - (st.k || 0) * 0.9, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 2つの音のずれ：視点がずれているほどうなり、そろうと1つの澄んだ音になる
  init(out) {
    const { ctx } = out; const g = ctx.createGain(); g.gain.value = 0; g.connect(out.music);
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(); o1.type = o2.type = 'sine'; o1.frequency.value = o2.frequency.value = mtof(76);
    o1.connect(g); o2.connect(g); o1.start(); o2.start();
    return { update(s, x) { const t = x.ctx.currentTime, a = clamp(s.ang ?? 1, 0, 1.4);
      o2.detune.setTargetAtTime(a * 140, t, 0.08);
      g.gain.setTargetAtTime(0.018 + 0.04 * (s.k || 0), t, 0.2); } };
  },
});
