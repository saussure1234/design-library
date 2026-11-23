// 場面4・案D「点がつながる一本の筋」
// 闇に、同じ灰色の点が無数に浮かんでいる。どれも同じに見える。
// スクロールで、ある点から次の点へ朱い線がつながり始める。つながる点は奥へ奥へと一本の筋を描き、
// 残りの点は、どこにもつながらないまま闇に沈む。手がかりは「前後とつながっているか（一貫性）」。
import { THREE, stage, SP, makeRnd, sstep, clamp, glowTex, sfx, mtof } from './base.js';

const S = stage({ fov: 50, fovSp: 66, bloom: [0.75, 0.45, 0.55], shift: { pc: [0.16, 0], sp: [0, -0.14] }, exposure: 0.85 });
const { scene, camera, st } = S;
const rnd = makeRnd(131);

// つながる点の並び（手前の左下から奥の右上へ。点の間はばらばら）
const path = new THREE.CatmullRomCurve3(SP
  ? [new THREE.Vector3(-1.2, -4, 2), new THREE.Vector3(1.5, -1.5, -6), new THREE.Vector3(-1, 1, -16), new THREE.Vector3(1.8, 3, -28), new THREE.Vector3(0, 5, -44)]
  : [new THREE.Vector3(-2.5, -3.4, 2), new THREE.Vector3(1.8, -2.3, -6), new THREE.Vector3(4.2, -0.8, -15), new THREE.Vector3(2.6, 0.3, -26), new THREE.Vector3(5, 1, -40), new THREE.Vector3(6, 1.4, -56)]);
const NSIG = 34, sigPts = [];
{ let u = 0; for (let i = 0; i < NSIG; i++) { u = i / (NSIG - 1); const q = path.getPoint(Math.pow(u, 0.85)); q.x += (rnd() - 0.5) * 0.5; q.y += (rnd() - 0.5) * 0.5; sigPts.push(q); } }

// 点（ノイズとつながる点を同じ姿で）
const NN = SP ? 4200 : 9000, n = NN + NSIG;
const pos = new Float32Array(n * 3), aR = new Float32Array(n * 2);
for (let i = 0; i < NN; i++) { pos.set([(rnd() * 2 - 1) * 16, (rnd() * 2 - 1) * 10, 6 - rnd() * 64], i * 3); aR.set([rnd(), -1], i * 2); }
sigPts.forEach((q, i) => { pos.set([q.x, q.y, q.z], (NN + i) * 3); aR.set([rnd(), i], (NN + i) * 2); });
const U = { uT: { value: 0 }, uP: { value: 0 }, uPx: { value: 1000 }, uHead: { value: -1 } };
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.BufferAttribute(aR, 2));
const pts = new THREE.Points(g, new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute vec2 aR; uniform float uT, uP, uPx, uHead; varying vec3 vC;
    void main(){
      vec3 p=position+vec3(sin(uT*.2+aR.x*30.),cos(uT*.17+aR.x*20.),0.)*.06;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      float isS=step(0.,aR.y);
      float on=isS*smoothstep(aR.y-.2,aR.y+.6,uHead);          // つながった点
      float sink=1.-(1.-isS)*smoothstep(.25,.95,uP)*.65;     // つながらない点は沈む
      gl_PointSize=max(1.,uPx*(.028+.03*on)/-mv.z);
      float fog=1.-smoothstep(24.,60.,-mv.z);
      vC=mix(vec3(.46,.49,.54)*(.55+.45*aR.x)*sink, vec3(1.,.3,.09)*2.2, on)*fog;
    }`,
  fragmentShader: `varying vec3 vC; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,.08,r),1.); }`,
}));
pts.frustumCulled = false; scene.add(pts);
S.onResize((s) => { U.uPx.value = s.px; });

// 朱い線（点から点へ。先端は少しずつ伸びる）
const lp = new Float32Array(NSIG * 3); sigPts.forEach((q, i) => lp.set([q.x, q.y, q.z], i * 3));
const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lp, 3));
const line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: new THREE.Color(1, 0.3, 0.09).multiplyScalar(1.6), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
line.frustumCulled = false; scene.add(line);
const gt = glowTex();
const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xff5a24, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); head.scale.setScalar(0.9); scene.add(head);

let lastIdx = -1;
S.run((st) => {
  const p = st.p, t = st.t;
  const h = sstep(0.12, 0.88, p) * (NSIG - 1);           // 何番目の点まで来たか（小数）
  U.uT.value = t; U.uP.value = p; U.uHead.value = p < 0.12 ? -1 : h;
  const i = Math.floor(h), f = h - i;
  const a = sigPts[i], b = sigPts[Math.min(NSIG - 1, i + 1)];
  const tip = a.clone().lerp(b, f);
  lp.set([tip.x, tip.y, tip.z], Math.min(NSIG - 1, i + 1) * 3);
  for (let k = i + 2; k < NSIG; k++) lp.set([tip.x, tip.y, tip.z], k * 3);
  for (let k = 0; k <= i; k++) lp.set([sigPts[k].x, sigPts[k].y, sigPts[k].z], k * 3);
  lg.attributes.position.needsUpdate = true;
  lg.setDrawRange(0, p < 0.12 ? 0 : Math.min(NSIG, i + 2));
  head.position.copy(tip); head.material.opacity = p < 0.12 ? 0 : 0.9 * (1 - sstep(0.9, 1, p) * 0.4);
  // カメラ：つながった先へ少しずつ進み、筋の伸びる先を見る
  const cz = 9 - sstep(0.1, 1, p) * 10;
  camera.position.set(-0.5 + st.mx * 1.2, 0.4 - st.my * 0.8, cz);
  camera.lookAt(1.2 + st.mx * 0.6, -0.4, -30);
  st.idx = p < 0.12 ? -1 : i; st.lk = sstep(0.12, 0.88, p);
}, {
  chord: 4,
  base: (st) => ({ noise: 1 - (st.lk || 0) * 0.9, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 点がつながるたびに、五音の階段を1段ずつ上る
  init(out) {
    const PEN = [62, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88];
    return { update(s, o) {
      if (s.idx !== lastIdx) {
        if (s.idx > lastIdx && s.idx >= 0) sfx.tone(o, mtof(PEN[Math.min(PEN.length - 1, Math.floor(s.idx / 3))]), 0.05, 0.004, 1.6, 'sine', o.music);
        lastIdx = s.idx;
      }
    } };
  },
});
