// 場面4・案A「闇を掃く一筋の光」
// 真っ暗な空間に、無数の破片（ノイズ）が漂っている。見えるのは光が当たった所だけ。
// 一筋のサーチライトが闇を掃き、照らしては通り過ぎ、最後にひとつだけ朱く応える破片（Signal）で止まる。
// PC ではマウスで光を少し振れる。
import { THREE, stage, SP, makeRnd, sstep, clamp, glowTex, sfx } from './base.js';

const S = stage({ fov: 44, fovSp: 62, bloom: [0.9, 0.55, 0.62], shift: { pc: [0.17, 0], sp: [0, -0.15] }, exposure: 1.1 });
const { scene, camera, st } = S;
const rnd = makeRnd(41);

camera.position.set(0, 0.4, 9); camera.lookAt(0, 0, -12);
scene.add(new THREE.HemisphereLight(0x7d8590, 0x000000, 0.06));

const TGT = new THREE.Vector3(SP ? 0.6 : 2.4, SP ? 1.2 : -0.3, -12);
const SRC = new THREE.Vector3(10, 10, 3);
const ANG = 0.105;

// 破片（ノイズ）
const NSH = SP ? 520 : 1000;
const shGeo = new THREE.IcosahedronGeometry(1, 0);
const shMat = new THREE.MeshStandardMaterial({ color: 0x8c919a, roughness: 0.5, metalness: 0.35, flatShading: true });
const shards = new THREE.InstancedMesh(shGeo, shMat, NSH);
const sh = [];
for (let i = 0; i < NSH; i++) {
  let p;
  do { p = new THREE.Vector3((rnd() * 2 - 1) * 16, (rnd() * 2 - 1) * 9, -4 - rnd() * 34); } while (p.distanceTo(TGT) < 1.6);
  const s = 0.06 + Math.pow(rnd(), 2.2) * 0.5;
  sh.push({ p, s: new THREE.Vector3(s * (0.5 + rnd()), s * (0.3 + rnd() * 0.6), s * (0.5 + rnd())), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 6, rnd() * 6, rnd() * 6)), ax: new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), w: 0.05 + rnd() * 0.25, ph: rnd() * 6 });
}
scene.add(shards);
const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), pp = new THREE.Vector3();
function placeShards(t) {
  sh.forEach((o, i) => {
    qq.setFromAxisAngle(o.ax, t * o.w + o.ph).multiply(o.q);
    pp.copy(o.p); pp.y += Math.sin(t * 0.2 + o.ph) * 0.15;
    m4.compose(pp, qq, o.s); shards.setMatrixAt(i, m4);
  });
  shards.instanceMatrix.needsUpdate = true;
}

// Signal：ひとつだけ形の違う破片。照らされると朱く応える
const sig = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 0.4, flatShading: true, emissive: 0xff5a24, emissiveIntensity: 0 }));
sig.position.copy(TGT); scene.add(sig);
const sigLight = new THREE.PointLight(0xff5a24, 0, 6, 1.6); sigLight.position.copy(TGT); scene.add(sigLight);
const gt = glowTex();
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
halo.position.copy(TGT); halo.scale.setScalar(3.2); scene.add(halo);
// 見つけた合図の輪（広がって消える）
const rings = [0, 1, 2].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.98, 1, 96), new THREE.MeshBasicMaterial({ color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  r.position.copy(TGT); scene.add(r); return r;
});

// サーチライト（本物の照明＋目に見える光の筋）
const spot = new THREE.SpotLight(0xe6ebf2, 340, 0, ANG, 0.45, 1.25);
spot.position.copy(SRC); scene.add(spot); scene.add(spot.target);
const LEN = 46;
const coneGeo = new THREE.ConeGeometry(1, 1, 64, 1, true).translate(0, -0.5, 0).rotateX(Math.PI / 2); // 先端が原点・-z へ伸びる
const coneU = { uLen: { value: LEN } };
const cone = new THREE.Mesh(coneGeo, new THREE.ShaderMaterial({
  uniforms: coneU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: `varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ vZ=-position.z; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying float vZ; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(abs(dot(vN,vV)),2.2); float a=pow(1.-vZ,1.6)*smoothstep(0.,.04,vZ);
    gl_FragColor=vec4(vec3(.78,.82,.88)*f*a*.16,1.); }`,
}));
cone.scale.set(LEN * Math.tan(ANG) * 1.05, LEN * Math.tan(ANG) * 1.05, LEN); cone.position.copy(SRC); scene.add(cone);

// 光の中だけで光る塵
const dustU = { uSrc: { value: SRC }, uDir: { value: new THREE.Vector3(0, 0, -1) }, uCos: { value: Math.cos(ANG) }, uPx: { value: 1000 }, uT: { value: 0 } };
{
  const n = SP ? 7000 : 16000, a = new Float32Array(n * 3), r = new Float32Array(n);
  for (let i = 0; i < n; i++) { a.set([(rnd() * 2 - 1) * 18, (rnd() * 2 - 1) * 11, 4 - rnd() * 40], i * 3); r[i] = rnd(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: dustU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute float aR; uniform vec3 uSrc, uDir; uniform float uCos, uPx, uT; varying float vA;
      void main(){ vec3 p=position+vec3(sin(uT*.13+aR*40.),cos(uT*.11+aR*30.),sin(uT*.09+aR*20.))*.4;
        vec3 d=p-uSrc; float L=length(d); float c=dot(d/L,uDir);
        float inb=smoothstep(uCos-.012,uCos+.02,c)/(1.+L*.03);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uPx*.016/-mv.z); vA=(.04+inb*1.6)*(.4+.6*aR); }`,
    fragmentShader: `varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.72,.76,.82)*smoothstep(.5,.1,r)*vA,1.); }`,
  }));
  pts.frustumCulled = false; scene.add(pts);
}
S.onResize((s) => { dustU.uPx.value = s.px; });

// 光の向きの道筋（スクロール）：空を掃く → 破片をなめる → 一度通り過ぎる → 戻って Signal で止まる
const aims = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-9, -6, -20), new THREE.Vector3(-6, 3, -24), new THREE.Vector3(-1, -4, -18),
  new THREE.Vector3(6.5, 2.5, -22), new THREE.Vector3(7, -3.5, -14), TGT.clone(),
], false, 'catmullrom', 0.5);
const aim = new THREE.Vector3(), dir = new THREE.Vector3(), tv = new THREE.Vector3();
const rd = document.getElementById('rd');
let locked = false, lastMsg = '';

S.run((st) => {
  const p = st.p, t = st.t;
  placeShards(t);
  const u = clamp(p / 0.8); const ue = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  aims.getPoint(ue, aim);
  const lock = sstep(0.8, 0.9, p);
  aim.x += st.mx * 9 * (1 - lock) + Math.sin(t * 0.7) * 0.25 * (1 - lock); aim.y -= st.my * 6 * (1 - lock);
  spot.target.position.copy(aim);
  dir.copy(aim).sub(SRC).normalize();
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
  dustU.uDir.value.copy(dir); dustU.uT.value = t;
  // Signal がどれだけ光の中にあるか
  tv.copy(TGT).sub(SRC).normalize();
  const inb = sstep(Math.cos(ANG * 1.25), Math.cos(ANG * 0.5), tv.dot(dir));
  const glow = Math.max(inb * 0.9, lock);
  sig.material.emissiveIntensity = glow * 5;
  sig.rotation.set(t * 0.3, t * 0.45, 0);
  sigLight.intensity = lock * 6;
  halo.material.opacity = glow * 0.85; halo.scale.setScalar(2.6 + Math.sin(t * 3) * 0.15 * lock);
  rings.forEach((r, i) => { const k = ((t * 0.45 + i / 3) % 1); r.scale.setScalar(0.7 + k * 3.2); r.material.opacity = lock * (1 - k) * 0.55; r.quaternion.copy(camera.quaternion); });
  // 読み取り
  const msg = lock > 0.5 ? `<span class="s">SIGNAL</span>  <b>LOCKED</b>` : `SCANNING  <b>${String(Math.round(ue * 999)).padStart(3, '0')}</b>`;
  if (msg !== lastMsg) { lastMsg = msg; rd.innerHTML = msg; }
  if (!locked && lock > 0.6) { locked = true; window.SND?.lock(); } else if (locked && lock < 0.2) locked = false;
}, {
  chord: 4,
  base: (st) => ({ noise: 1 - sstep(0.8, 0.95, st.p) * 0.9, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 光が動くと鳴る細い風（速いほど高く）
  init(out) {
    const sw = sfx.loop(out, 'bandpass', 800, 3, out.sfx); let prev = 0;
    return { update(s, o) { const v = Math.abs(s.p - prev) / Math.max(1e-3, s.dt); prev = s.p; const t = o.ctx.currentTime;
      sw.g.gain.setTargetAtTime(Math.min(0.25, v * 0.6), t, 0.1); sw.fl.frequency.setTargetAtTime(500 + Math.min(3000, v * 4000), t, 0.1); } };
  },
});
