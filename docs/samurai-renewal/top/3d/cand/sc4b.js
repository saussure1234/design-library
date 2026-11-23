// 場面4・案B「ノイズの海のチューニング」
// 闇の中を、ざわつく波形の列（ノイズのスペクトル）が奥から手前へ流れてくる。
// スクロールで目盛り（白い縦の筋）が左右に探り、ある1点で合うと、ノイズが静まり、
// ずっとそこにあった1本の朱い稜線（Signal）が奥から手前まで立ち上がる。音もラジオの同調のように変わる。
import { THREE, stage, SP, makeRnd, sstep, clamp, mix, sfx, mtof } from './base.js';

const S = stage({ fov: 40, fovSp: 58, bloom: [0.85, 0.4, 0.55], shift: { pc: [0.16, 0.04], sp: [0, -0.12] } });
const { scene, camera, st } = S;

const R = SP ? 64 : 96, NS = SP ? 170 : 260;
const X0 = SP ? 0.4 : 1.8;           // Signal のある位置
const XW = 7.5, Z0 = -40, Z1 = 3, SPD = 5.5;

const COMMON = `
uniform float uT, uR, uSpd, uXc, uBw, uLock, uNear, uX0, uP;
float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
// 列（スロット k）→ 位置 u と、その列の通し番号
void rowOf(float k, out float u, out float id){ float s=uT*uSpd; u=k+fract(s); float i=mod(k-floor(s),uR); id=i+uR*floor((i+s)/uR); }
float zOf(float u){ return mix(${Z0.toFixed(1)}, ${Z1.toFixed(1)}, u/uR); }
float band(float x){ return exp(-pow((x-uXc)/uBw,2.)); }
float sigAmp(){ return .14+.7*uNear*(1.-uLock)+1.45*uLock; }
float height(float x, float si, float id){
  float n=pow(hh(vec2(si,id)),3.)*1.5 + vn(vec2(x*1.3,id*.35))*.55 + vn(vec2(x*5.,id*.9))*.25;
  float att=mix(1., mix(.07,.22,band(x)), uLock);
  float s=exp(-pow((x-uX0)/.16,2.))*sigAmp()*(.85+.15*sin(id*.7));
  return n*.42*att + s;
}
float fade(float u){ return smoothstep(0.,uR*.18,u)*(1.-smoothstep(uR*.86,uR,u)); }
`;
const U = { uT: { value: 0 }, uR: { value: R }, uSpd: { value: SPD }, uXc: { value: -6 }, uBw: { value: 0.9 }, uLock: { value: 0 }, uNear: { value: 0 }, uX0: { value: X0 }, uP: { value: 0 } };

// 1) 波形の線（列×点）
{
  const pos = [], row = [], si = [], fill = [], frow = [], fsi = [], top = [];
  for (let k = 0; k < R; k++) {
    for (let j = 0; j < NS - 1; j++) {
      const xa = -XW + (2 * XW) * j / (NS - 1), xb = -XW + (2 * XW) * (j + 1) / (NS - 1);
      pos.push(xa, 0, 0, xb, 0, 0); row.push(k, k); si.push(j, j + 1);
    }
    // 下を黒で塗る帯（手前の列が奥の列を隠す）
    for (let j = 0; j < NS - 1; j++) {
      const xa = -XW + (2 * XW) * j / (NS - 1), xb = -XW + (2 * XW) * (j + 1) / (NS - 1);
      const quad = [[xa, 1, j], [xb, 1, j + 1], [xa, 0, j], [xb, 1, j + 1], [xb, 0, j + 1], [xa, 0, j]];
      for (const q of quad) { fill.push(q[0], 0, 0); top.push(q[1]); fsi.push(q[2]); frow.push(k); }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('aK', new THREE.Float32BufferAttribute(row, 1)); lg.setAttribute('aS', new THREE.Float32BufferAttribute(si, 1));
  const lm = new THREE.ShaderMaterial({
    uniforms: U,
    vertexShader: `${COMMON} attribute float aK; attribute float aS; varying vec3 vC;
      void main(){ float u,id; rowOf(aK,u,id); float x=position.x; float y=height(x,aS,id);
        vec3 p=vec3(x,y,zOf(u)); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float fd=fade(u)*(1.-smoothstep(20.,46.,-mv.z));
        vec3 g=vec3(.50,.53,.58)*(.55+.9*band(x)*(1.-uLock*.6));
        float sw=exp(-pow((x-uX0)/.32,2.))*clamp(uLock+uNear*.35,0.,1.);
        vC=mix(g,vec3(1.,.30,.09)*2.2,sw)*fd; }`,
    fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.); }',
  });
  const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; lines.renderOrder = 2; scene.add(lines);
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3)); fg.setAttribute('aK', new THREE.Float32BufferAttribute(frow, 1)); fg.setAttribute('aS', new THREE.Float32BufferAttribute(fsi, 1)); fg.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  const fm = new THREE.ShaderMaterial({
    uniforms: U, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2, side: THREE.DoubleSide,
    vertexShader: `${COMMON} attribute float aK; attribute float aS; attribute float aTop;
      void main(){ float u,id; rowOf(aK,u,id); float x=position.x; float y=aTop>.5?height(x,aS,id):-.2;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(x,y,zOf(u),1.); }`,
    fragmentShader: 'void main(){ gl_FragColor=vec4(0.,0.,0.,1.); }',
  });
  const fillM = new THREE.Mesh(fg, fm); fillM.frustumCulled = false; fillM.renderOrder = 1; scene.add(fillM);
}

// 2) 目盛り（今どこを聴いているか）：床を奥へ走る細い線
const cur = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.15, Z0 + 4), new THREE.Vector3(0, -0.15, Z1 - 2)]),
  new THREE.LineBasicMaterial({ color: 0xd9dde3, transparent: true, opacity: 0.6 }));
scene.add(cur);
const curV = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -0.15, -9), new THREE.Vector3(0, 3.4, -9)]),
  new THREE.LineBasicMaterial({ color: 0xd9dde3, transparent: true, opacity: 0.35 }));
scene.add(curV);

camera.position.set(0, SP ? 3.6 : 3.0, SP ? 9 : 7.2);
camera.lookAt(0.4, 0.2, -12);

// 目盛りの動き（スクロール）：左から探り、行き過ぎて戻り、合う
const keys = [-6.2, 3.8, -2.2, X0 + 1.1, X0 - 0.35, X0];
const tune = (p) => {
  const u = clamp(p / 0.74) * (keys.length - 1), i = Math.min(keys.length - 2, Math.floor(u)), f = u - i;
  const e = f * f * (3 - 2 * f); return mix(keys[i], keys[i + 1], e);
};
const rd = document.getElementById('rd');
let lastMsg = '', locked = false;

S.run((st) => {
  const p = st.p;
  const xc = tune(p) + st.mx * 1.2 * (1 - sstep(0.74, 0.86, p));
  const lock = sstep(0.74, 0.88, p);
  U.uT.value = st.t; U.uP.value = p; U.uXc.value = xc; U.uLock.value = lock;
  U.uNear.value = Math.exp(-Math.pow((xc - X0) / 0.9, 2));
  U.uBw.value = mix(1.0, 0.45, lock);
  cur.position.x = xc; curV.position.x = xc;
  cur.material.opacity = 0.55 * (1 - lock * 0.7); curV.material.opacity = 0.3 * (1 - lock);
  const f = 87.5 + (xc + XW) / (2 * XW) * 20.5;
  const msg = lock > 0.5 ? `<span class="s">SIGNAL</span>  <b>${f.toFixed(1)}</b>` : `TUNING  <b>${f.toFixed(1)}</b>`;
  if (msg !== lastMsg) { lastMsg = msg; rd.innerHTML = msg; }
  if (!locked && lock > 0.6) { locked = true; window.SND?.lock(); } else if (locked && lock < 0.2) locked = false;
  st.xc = xc; st.lock = lock; st.near = U.uNear.value;
}, {
  chord: 4,
  base: (st) => ({ noise: 1 - (st.lock || 0), travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // ラジオの同調：目盛りの位置で帯域を絞った雑音 → 合うと澄んだ正弦波
  init(out) {
    const hiss = sfx.loop(out, 'bandpass', 900, 4, out.sfx);
    const o = out.ctx.createOscillator(), g = out.ctx.createGain(); o.type = 'sine'; o.frequency.value = mtof(81); g.gain.value = 0; o.connect(g); g.connect(out.music); o.start();
    let acc = 0;
    return { update(s, x) {
      const t = x.ctx.currentTime, lock = s.lock || 0, near = s.near || 0;
      hiss.g.gain.setTargetAtTime(0.22 * (1 - lock * 0.9), t, 0.08);
      hiss.fl.frequency.setTargetAtTime(300 + ((s.xc ?? 0) + XW) / (2 * XW) * 2800, t, 0.05);
      o.detune.setTargetAtTime((1 - lock) * (1 - near) * 300 * Math.sin(s.t * 3), t, 0.05);
      g.gain.setTargetAtTime(0.06 * Math.max(near * 0.5 * (1 - lock), lock), t, 0.15);
      acc += s.dt * 18 * (1 - lock);
      while (acc > 1) { acc -= 1; sfx.burst(x, 0.02 + Math.random() * 0.04, 0.008, 'highpass', 2500 + Math.random() * 4000, 1); }
    } };
  },
});
