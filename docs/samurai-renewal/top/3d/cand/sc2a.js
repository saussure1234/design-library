// 場面2・案A「拡散する格子」
// 正確に並んだ点の格子（＝ひとつの正解）が、スクロールで溶け、分裂して数を増やしながら闇へ散っていく。
// 中心の朱の一点（ひとつの正解）は、増えた灰色の点に紛れて見えなくなる。
import { THREE, stage, SP, makeRnd, NOISE, sstep, clamp, glowTex, sfx } from './base.js';

const S = stage({ fov: 40, fovSp: 58, bloom: [0.7, 0.45, 0.6], shift: { pc: [0.19, 0], sp: [0, -0.16] } });
const { scene, camera, st } = S;
const rnd = makeRnd(7);

const N = SP ? 13 : 18;            // 1辺の点の数
const GEN = [0.0, 0.16, 0.34, 0.34, 0.52, 0.52, 0.52, 0.52];   // 分裂して生まれる時刻（1→2→4→8倍）
const base = [], rr = [], born = [];
const half = 2.1, step = (half * 2) / (N - 1);
for (let g = 0; g < GEN.length; g++) {
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) for (let k = 0; k < N; k++) {
    base.push(-half + i * step, -half + j * step, -half + k * step);
    rr.push(rnd(), rnd(), rnd(), rnd());
    born.push(GEN[g] + (g ? rnd() * 0.08 : 0));
  }
}
const g = new THREE.BufferGeometry();
g.setAttribute('position', new THREE.Float32BufferAttribute(base, 3));
g.setAttribute('aR', new THREE.Float32BufferAttribute(rr, 4));
g.setAttribute('aB', new THREE.Float32BufferAttribute(born, 1));
const U = { uP: { value: 0 }, uT: { value: 0 }, uPx: { value: 1000 } };
const mat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
  vertexShader: `attribute vec4 aR; attribute float aB; uniform float uP, uT, uPx; varying float vA; varying float vH;
    ${NOISE}
    void main(){
      // 崩れは片隅から始まり、格子を横切って広がる（1コマの中に秩序と混沌が並ぶ）
      float d=clamp(dot(position,normalize(vec3(-1.,.35,.45)))/4.2+.5,0.,1.);
      float q=clamp(uP*1.4-d*.55,0.,1.);
      float age=max(0.,q-aB);
      float on=step(aB,q)*(aB<.001?1.:smoothstep(0.,.05,age));
      float m=smoothstep(.02,1.,q);
      vec3 p=position;
      p+=vn3(position*.45+vec3(uT*.06,0.,0.))*(.012+1.1*smoothstep(.03,.32,q));
      float fl=pow(smoothstep(.12,1.,q),1.4)*1.9;
      vec3 o=vec3(0.); for(int i=0;i<6;i++){ p+=vn3(p*.26+vec3(1.7,uT*.015,4.1))*fl; o+=vn3(o*.26+vec3(1.7,uT*.015,4.1))*fl*.7; } p-=o;
      vec3 dir=normalize(aR.xyz*2.-1.+.0001);
      float ag2=max(0.,q-max(aB,.3)); p+=dir*(sqrt(ag2)*aR.w*2.4+step(.001,aB)*.06*on);
      p*=1.+m*.6;
      vec4 mv=modelViewMatrix*vec4(p,1.);
      gl_Position=projectionMatrix*mv;
      float order=1.-smoothstep(.0,.2,q);
      gl_PointSize=max(1.2,uPx*(.021+.01*order+.01*m)/-mv.z);
      vA=on*(.5+.5*order)*(1.-smoothstep(20.,44.,-mv.z))*mix(1.,.6,m);
      vH=aR.w;
    }`,
  fragmentShader: `varying float vA; varying float vH; void main(){ float r=length(gl_PointCoord-.5); float a=smoothstep(.5,.1,r);
    vec3 c=mix(vec3(.62,.65,.70),vec3(.86,.88,.91),vH);
    gl_FragColor=vec4(c*a*vA,1.); }`,
});
const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts);

// 格子の枠（秩序のあいだだけ見える細い線）
const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(half * 2 + step, half * 2 + step, half * 2 + step)),
  new THREE.LineBasicMaterial({ color: 0x9aa0a8, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
scene.add(box);

// ひとつの正解（朱の一点）
const gt = glowTex();
const mk = (s, c) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: c, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); sp.scale.setScalar(s); scene.add(sp); return sp; };
const core = mk(1.4, 0xff5a24), coreW = mk(0.3, 0xffffff);

// 背景の冷たい灰色の塵
{
  const n = SP ? 700 : 1600, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const u = rnd() * 2 - 1, t = rnd() * 6.283, r = 30 + rnd() * 60, s = Math.sqrt(1 - u * u); a.set([s * Math.cos(t) * r, u * r, s * Math.sin(t) * r], i * 3); }
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x5b6068, size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.6 })));
}

const rd = document.getElementById('rd');
const total = N * N * N;
let lastCnt = -1;

S.run((st) => {
  const p = st.p;
  U.uP.value = p; U.uT.value = st.t; U.uPx.value = st.px;
  // 格子をゆっくり回し、広がるほど引いて見る
  const yaw = 0.62 + st.t * 0.03 + p * 0.9 + st.mx * 0.25, pitch = 0.42 - p * 0.18 + st.my * 0.15;
  const dist = (SP ? 13.5 : 10.5) + p * p * (SP ? 16 : 12);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(0, 0, 0);
  box.material.opacity = 0.32 * (1 - sstep(0.0, 0.14, p));
  const c = 1 - sstep(0.34, 0.66, p);
  core.material.opacity = c; coreW.material.opacity = c;
  core.scale.setScalar(1.3 + Math.sin(st.t * 2.4) * 0.12);
  // 状態の数（生まれた点の数）
  const W = Math.round(total * (1 + 7 * sstep(0.08, 0.95, p)));
  if (W !== lastCnt) { lastCnt = W; rd.innerHTML = `STATES  <b>${String(W).padStart(6, '0')}</b>\nS = k·ln W  <b>${Math.log(W).toFixed(2)}</b>`; }
}, {
  chord: 2,
  base: (st) => ({ noise: 0.15 + 0.85 * st.p, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 粒がはじける小さな音：広がるほど密に
  init(out) { let acc = 0; return { update(st, o) { acc += st.dt * (st.p * st.p * 38); while (acc > 1) { acc -= 1; sfx.burst(o, 0.02 + Math.random() * 0.03, 0.012, 'highpass', 3500 + Math.random() * 5000, 1.4); } } }; },
});
