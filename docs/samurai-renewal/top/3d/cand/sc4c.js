// 場面4・案C「同じ拍で瞬く一点」
// 真っ暗な空に、無数の灰色の点がでたらめに瞬いている（ノイズ）。その中にひとつだけ、同じ拍で瞬き続ける点がある。
// スクロール＝観測を重ねるほど、でたらめな瞬きは均されて静まり、同じ拍の一点だけが残って朱く脈打つ（Signal）。
// 右下の小さな波形は「拍に合わせて重ねた明るさ」：最初はノイズ、重ねるほど1本の山が立つ。
import { THREE, stage, SP, makeRnd, sstep, clamp, glowTex, sfx, mtof } from './base.js';

const S = stage({ fov: 46, fovSp: 64, bloom: [1.0, 0.55, 0.5], shift: { pc: [0.17, 0], sp: [0, -0.16] } });
const { scene, camera, st } = S;
const rnd = makeRnd(97);
const PER = 1.6;                       // 拍の周期（秒）
const TGT = new THREE.Vector3(SP ? 0.3 : 1.6, SP ? 1.4 : 0.2, -14);

// 瞬く点（ノイズ）
const U = { uT: { value: 0 }, uP: { value: 0 }, uPx: { value: 1000 } };
{
  const n = SP ? 4500 : 11000, a = new Float32Array(n * 3), r = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    let p; do { p = [(rnd() * 2 - 1) * 26, (rnd() * 2 - 1) * 15, -6 - rnd() * 40]; } while (Math.hypot(p[0] - TGT.x, p[1] - TGT.y, p[2] - TGT.z) < 1.2);
    a.set(p, i * 3); r.set([rnd(), rnd(), rnd(), rnd()], i * 4);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `attribute vec4 aR; uniform float uT, uP, uPx; varying float vA;
      float hh(float x){ return fract(sin(x*127.1)*43758.5453); }
      void main(){
        // でたらめな瞬き：点ごとに違う速さで、ときどき強く光る
        float rate=1.5+aR.x*5.;
        float k=floor(uT*rate+aR.y*50.), f=fract(uT*rate+aR.y*50.);
        float flash=pow(hh(k+aR.z*91.),5.)*exp(-f*2.5);
        float calm=smoothstep(.12,.85,uP);
        float a=mix(.5+flash*6.,.22,calm)*(.4+.6*aR.w);
        vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.2,uPx*(.045+.09*flash*(1.-calm))/-mv.z);
        vA=a*(1.-smoothstep(30.,48.,-mv.z));
      }`,
    fragmentShader: `varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.66,.69,.74)*smoothstep(.5,.05,r)*vA,1.); }`,
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts);
}
S.onResize((s) => { U.uPx.value = s.px; });

// 同じ拍の一点
const gt = glowTex(128, 2.6);
const mk = (c, s) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(s); sp.position.copy(TGT); scene.add(sp); return sp; };
const pg = mk(0xbfc4cc, 0.6), ps = mk(0xff5a24, 2.4), pw = mk(0xffffff, 0.35);
// 拍ごとに広がる輪（空間の中の薄い円）
const rings = [0, 1, 2, 3].map(() => {
  const r = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 128), new THREE.MeshBasicMaterial({ color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  r.position.copy(TGT); scene.add(r); return r;
});

const pulse = (t) => { const f = ((t / PER) % 1 + 1) % 1; return Math.exp(-f * 9) + 0.25 * Math.exp(-Math.pow((f - 0.18) * 14, 2)); };

// 右下の「拍に合わせて重ねた明るさ」
const hud = document.getElementById('hud');
const cv = document.createElement('canvas'); hud.appendChild(cv);
const cx = cv.getContext('2d');
const rd = document.getElementById('rd');
const NB = 64, noiseTbl = Array.from({ length: 40 }, () => Array.from({ length: NB }, () => rnd()));
function drawProfile(p, t) {
  if (SP) return;
  const W = 220, H = 64, d = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== W * d) { cv.width = W * d; cv.height = H * d; }
  cx.setTransform(d, 0, 0, d, 0, 0); cx.clearRect(0, 0, W, H);
  const folds = Math.round(1 + Math.pow(p, 2) * 2047);
  const nAmp = 1 / Math.sqrt(folds);       // 重ねるほど雑音は 1/√N で小さくなる
  const row = noiseTbl[Math.floor(t * 6) % noiseTbl.length];
  const ys = [];
  for (let i = 0; i < NB; i++) {
    const ph = i / NB; const sigv = Math.exp(-Math.pow((ph - 0.5) * 16, 2)) * 0.35;
    const nz = (row[i] - 0.5) * 1.6 * nAmp + (noiseTbl[(i * 7) % 40][i] - 0.5) * 0.5 * nAmp;
    ys.push(sigv + nz);
  }
  cx.strokeStyle = 'rgba(255,255,255,.14)'; cx.lineWidth = 1; cx.beginPath(); cx.moveTo(0, H - 8.5); cx.lineTo(W, H - 8.5); cx.stroke();
  const sigA = sstep(0.3, 0.8, p);
  cx.lineWidth = 1.2; cx.beginPath();
  ys.forEach((y, i) => { const X = i / (NB - 1) * W, Y = H - 10 - clamp(y + 0.3, 0, 1.15) * 42; i ? cx.lineTo(X, Y) : cx.moveTo(X, Y); });
  cx.strokeStyle = `rgba(${Math.round(210 + 45 * sigA)},${Math.round(214 - 124 * sigA)},${Math.round(222 - 186 * sigA)},.9)`; cx.stroke();
  const msg = `FOLDED ×<b>${String(folds).padStart(4, '0')}</b>   PERIOD ${sigA > 0.5 ? `<span class="s">${PER.toFixed(3)}s</span>` : '—.———s'}`;
  if (rd.innerHTML !== msg) rd.innerHTML = msg;
}

let lastBeat = -1;
S.run((st) => {
  const p = st.p, t = st.t;
  U.uT.value = t; U.uP.value = p;
  const sigA = sstep(0.3, 0.8, p);
  const b = pulse(t);
  // 最初は周りの点と同じ灰色・同じ大きさ。重ねるほど朱く、強く脈打つ
  pg.material.opacity = (0.35 + b * 1.4) * (1 - sigA);
  pg.scale.setScalar(0.35 + b * 0.5);
  ps.material.opacity = sigA * (0.35 + b * 0.9); ps.scale.setScalar(1.6 + b * 2.6 * sigA);
  pw.material.opacity = sigA * (0.4 + b * 0.6); pw.scale.setScalar(0.22 + b * 0.18);
  rings.forEach((r, i) => {
    // 直近4拍ぶんの輪：i 拍前に生まれた輪ほど大きく薄い
    const age = ((t / PER) % 1) + i;
    r.scale.setScalar(0.3 + Math.pow(age, 0.8) * 1.9); r.material.opacity = sigA * Math.pow(Math.max(0, 1 - age / 3.2), 2) * 0.42; r.quaternion.copy(camera.quaternion);
  });
  // 観測を重ねるほど少しずつ寄る
  const z = 9 - sstep(0.2, 1, p) * 9;
  camera.position.set(st.mx * 0.8 + TGT.x * sstep(0.3, 1, p) * 0.4, st.my * -0.5 + TGT.y * sstep(0.3, 1, p) * 0.4, z);
  camera.lookAt(TGT.x * 0.5, TGT.y * 0.5, -14);
  drawProfile(p, t);
  st.beat = Math.floor(t / PER); st.sigA = sigA;
}, {
  chord: 4,
  base: (st) => ({ noise: 1 - (st.sigA || 0) * 0.9, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // でたらめな小さな音（ノイズ）と、拍に合った澄んだ音（Signal）
  init(out) {
    let acc = 0, last = -1;
    return { update(s, o) {
      const a = s.sigA || 0;
      acc += s.dt * 26 * (1 - a * 0.85);
      while (acc > 1) { acc -= 1; sfx.tone(o, 1800 + Math.random() * 3200, 0.006 + Math.random() * 0.012, 0.002, 0.05); }
      if (s.beat !== last) { last = s.beat; sfx.tone(o, mtof(81), 0.02 + 0.08 * a, 0.004, 1.4, 'sine', o.music); if (a > 0.5) sfx.tone(o, mtof(69), 0.03 * a, 0.004, 1.8, 'sine', o.music); }
    } };
  },
});
