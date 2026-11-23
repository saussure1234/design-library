// 場面2・案C「砕け続ける立方体」
// 継ぎ目ひとつない黒い立方体（＝ひとつの正解）。スクロールで一角から割れ、塊はさらに小さな塊へ、
// 小さな塊は塵へと、砕けるたびに数を増やしながら闇へ散っていく。割れ目の奥に朱の光が一瞬のぞき、やがて紛れる。
import { THREE, stage, SP, makeRnd, NOISE, sstep, glowTex, sfx } from './base.js';

const S = stage({ fov: 38, fovSp: 56, bloom: [0.7, 0.5, 0.7], shift: { pc: [0.19, 0], sp: [0, -0.15] } });
const { scene, camera, st } = S;
const rnd = makeRnd(23);

const NP = SP ? 8 : 10;            // 1辺の塊の数（塊は8つの小片でできている）
const SIZE = 3.2, ps = SIZE / NP, cs = ps / 2;
const IMPACT = new THREE.Vector3(1.6, 1.6, 1.6);
const aPar = [], aOff = [], aR = [], aQ = [], aBt = [];
for (let i = 0; i < NP; i++) for (let j = 0; j < NP; j++) for (let k = 0; k < NP; k++) {
  const c = [(-SIZE / 2) + (i + 0.5) * ps, (-SIZE / 2) + (j + 0.5) * ps, (-SIZE / 2) + (k + 0.5) * ps];
  const dist = Math.hypot(c[0] - IMPACT.x, c[1] - IMPACT.y, c[2] - IMPACT.z) / (SIZE * 1.75);
  const bt = 0.04 + Math.pow(dist, 1.2) * 0.8 + rnd() * 0.06;
  const q = [rnd(), rnd(), rnd(), rnd()];
  for (let o = 0; o < 8; o++) {
    aPar.push(...c);
    aOff.push((o & 1 ? 0.5 : -0.5) * cs, (o & 2 ? 0.5 : -0.5) * cs, (o & 4 ? 0.5 : -0.5) * cs);
    aR.push(rnd(), rnd(), rnd(), rnd()); aQ.push(...q); aBt.push(bt);
  }
}
const n = aBt.length;
const box = new THREE.BoxGeometry(1, 1, 1);
const g = new THREE.InstancedBufferGeometry(); g.index = box.index;
g.setAttribute('position', box.attributes.position); g.setAttribute('normal', box.attributes.normal);
g.setAttribute('aPar', new THREE.InstancedBufferAttribute(new Float32Array(aPar), 3));
g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(aOff), 3));
g.setAttribute('aR', new THREE.InstancedBufferAttribute(new Float32Array(aR), 4));
g.setAttribute('aQ', new THREE.InstancedBufferAttribute(new Float32Array(aQ), 4));
g.setAttribute('aBt', new THREE.InstancedBufferAttribute(new Float32Array(aBt), 1));
g.instanceCount = n;

// 塊の動き（GLSL）：割れる時刻 → 塊が離れて回る → 小片に分かれて飛ぶ → 削れて小さくなる
const MOTION = `
attribute vec3 aPar; attribute vec3 aOff; attribute vec4 aR; attribute vec4 aQ; attribute float aBt;
uniform float uP, uT, uCs;
mat3 rotA(vec3 ax, float a){ ax=normalize(ax); float s=sin(a), c=cos(a), o=1.-c;
  return mat3(o*ax.x*ax.x+c, o*ax.x*ax.y+ax.z*s, o*ax.z*ax.x-ax.y*s,
              o*ax.x*ax.y-ax.z*s, o*ax.y*ax.y+c, o*ax.y*ax.z+ax.x*s,
              o*ax.z*ax.x+ax.y*s, o*ax.y*ax.z-ax.x*s, o*ax.z*ax.z+c); }
void motion(out vec3 wc, out mat3 R, out float scl, out float ac){
  float ap=max(0.,uP-aBt);
  vec3 pd=normalize(aPar*.8+(aQ.xyz-.5)*1.2+vec3(.0001));
  vec3 pc=aPar+pd*(ap*2.2+ap*ap*7.)*(.6+aQ.w*.8);
  mat3 pr=rotA(aQ.zxy-.5,ap*(1.5+aQ.w*3.));
  float bc=aBt+.07+aR.w*.14;
  ac=max(0.,uP-bc);
  vec3 cd=normalize(aOff+(aR.xyz-.5)*uCs*1.6);
  vec3 off=pr*aOff+cd*(ac*2.4+ac*ac*6.)*(.5+aR.y);
  R=rotA(aR.xyz-.5,ac*(3.+aR.w*7.)+ap*.3)*pr;
  scl=1.-smoothstep(0.,.55,ac)*(.35+.5*aR.x);
  wc=pc+off;
}`;
const U = { uP: { value: 0 }, uT: { value: 0 }, uCs: { value: cs }, uCore: { value: 0 }, uCam: { value: new THREE.Vector3() } };
const mat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `${MOTION}
    varying vec3 vN; varying vec3 vW; varying float vAc;
    void main(){ vec3 wc; mat3 R; float scl, ac; motion(wc,R,scl,ac);
      vec3 p=wc+R*(position*uCs*.985*scl);
      vN=R*normal; vW=(modelMatrix*vec4(p,1.)).xyz; vAc=ac;
      gl_Position=projectionMatrix*viewMatrix*vec4(vW,1.); }`,
  fragmentShader: `uniform vec3 uCam; uniform float uCore, uP; varying vec3 vN; varying vec3 vW; varying float vAc;
    void main(){ vec3 n=normalize(vN), v=normalize(uCam-vW);
      vec3 L=normalize(vec3(-.6,.85,.45)), L2=normalize(vec3(.8,-.2,-.6));
      float dif=max(dot(n,L),0.), spec=pow(max(dot(reflect(-L,n),v),0.),48.), rim=pow(1.-max(dot(n,v),0.),3.);
      vec3 base=vec3(.032,.034,.038);
      vec3 c=base*(.2+dif*1.5)+vec3(.78,.82,.88)*spec*.7+vec3(.42,.46,.52)*rim*.12+vec3(.3,.33,.38)*max(dot(n,L2),0.)*.05;
      // 中心の朱の光：割れ目の内側の面だけを照らす
      vec3 lc=-vW; float dl=length(lc); float ki=max(dot(n,lc/dl),0.)/(1.+dl*dl*1.6);
      c+=vec3(1.,.3,.09)*ki*uCore*2.4;
      float fog=1.-exp(-pow(length(uCam-vW)*.03,2.));
      gl_FragColor=vec4(mix(c,vec3(0.),fog),1.); }`,
});
const cubes = new THREE.Mesh(g, mat); cubes.frustumCulled = false; scene.add(cubes);

// 塵：小片が削れて出る粉。親の塊と同じ動きから、さらに外へ散る
{
  const m = SP ? 9000 : 22000, P = new Float32Array(m * 3), O = new Float32Array(m * 3), R = new Float32Array(m * 4), Q = new Float32Array(m * 4), B = new Float32Array(m);
  for (let i = 0; i < m; i++) {
    const src = (rnd() * n) | 0;
    P.set(aPar.slice(src * 3, src * 3 + 3), i * 3); O.set(aOff.slice(src * 3, src * 3 + 3), i * 3);
    R.set(aR.slice(src * 4, src * 4 + 4), i * 4); Q.set([rnd(), rnd(), rnd(), rnd()], i * 4); B[i] = aBt[src];
  }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(m * 3), 3));
  dg.setAttribute('aPar', new THREE.BufferAttribute(P, 3)); dg.setAttribute('aOff', new THREE.BufferAttribute(O, 3));
  dg.setAttribute('aR', new THREE.BufferAttribute(R, 4)); dg.setAttribute('aQ', new THREE.BufferAttribute(Q, 4)); dg.setAttribute('aBt', new THREE.BufferAttribute(B, 1));
  const dm = new THREE.ShaderMaterial({
    uniforms: { ...U, uPx: { value: 1000 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: `${MOTION} ${NOISE} uniform float uPx; varying float vA;
      void main(){ vec3 wc; mat3 R; float scl, ac; motion(wc,R,scl,ac);
        vec3 dir=normalize(aQ.xyz-.5+vec3(.0001));
        vec3 p=wc+dir*sqrt(ac)*(1.2+aQ.w*3.)+vn3(wc*.5+uT*.05)*ac*1.5;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uPx*.012/-mv.z);
        vA=smoothstep(0.,.08,ac)*(.35+.4*aQ.w)*(1.-smoothstep(25.,45.,-mv.z)); }`,
    fragmentShader: `varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.6,.63,.68)*smoothstep(.5,.1,r)*vA,1.); }`,
  });
  const dust = new THREE.Points(dg, dm); dust.frustumCulled = false; scene.add(dust);
  S.onResize((s) => { dm.uniforms.uPx.value = s.px; });
}

// 中心の朱の一点（立方体の中に隠れている）
const gt = glowTex();
const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xff5a24, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
core.scale.setScalar(0.9); scene.add(core);
const coreW = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
coreW.scale.setScalar(0.22); scene.add(coreW);

const rd = document.getElementById('rd');
let lastK = -1, lastP = 0;
const sortedBt = [...new Set(aBt)].sort((a, b) => a - b);
S.run((st) => {
  const p = st.p;
  U.uP.value = p; U.uT.value = st.t;
  const yaw = 0.78 + st.t * 0.025 + p * 0.5 + st.mx * 0.3, pitch = 0.5 - p * 0.15 + st.my * 0.2;
  const dist = (SP ? 15 : 12) + p * p * (SP ? 14 : 12);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(0, 0, 0); U.uCam.value.copy(camera.position);
  const cI = sstep(0.06, 0.3, p) * (1 - sstep(0.45, 0.85, p));
  U.uCore.value = cI; core.material.opacity = cI; coreW.material.opacity = cI;
  // 砕けた数
  let broken = 0; for (const b of sortedBt) if (p > b) broken++; else break;
  const pieces = (NP ** 3 - broken) + broken * 8;
  const k = pieces + Math.round(sstep(0.2, 1, p) * 22000);
  if (k !== lastK) { lastK = k; rd.innerHTML = `FRAGMENTS  <b>${String(k).padStart(6, '0')}</b>`; }
}, {
  chord: 2,
  base: (st) => ({ noise: 0.15 + 0.85 * st.p, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 割れる音：その瞬間に割れた塊の数だけ（上限あり）
  init(out) {
    let prev = st.p;
    return { update(s, o) {
      const a = Math.min(prev, s.p), b = Math.max(prev, s.p); prev = s.p;
      let c = 0; for (const t of sortedBt) if (t > a && t <= b) c++;
      c = Math.min(c, 6);
      for (let i = 0; i < c; i++) setTimeout(() => sfx.burst(o, 0.05 + Math.random() * 0.06, 0.03 + Math.random() * 0.05, 'bandpass', 1800 + Math.random() * 3000, 2.5), Math.random() * 120);
      if (c && Math.random() < 0.3) sfx.tone(o, 60 + Math.random() * 30, 0.08, 0.004, 0.5, 'sine');
    } };
  },
});
