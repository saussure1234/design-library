// 場面4・案F「風化して残る芯」
// 闇に、灰色の砂でできた大きな塊が浮かんでいる。スクロール＝時間が経つほど、外側から砂がほどけ、
// 風に流されて消えていく。最後に残るのは、塊の奥にずっとあった小さな朱い芯（Signal）だけ。
// 手がかりは「時間が経っても残るか（一時的なノイズ／本質的なシグナル）」。
import { THREE, stage, SP, makeRnd, NOISE, sstep, glowTex, sfx, mtof } from './base.js';

const S = stage({ fov: 40, fovSp: 58, bloom: [0.8, 0.5, 0.5], shift: { pc: [0.18, 0], sp: [0, -0.14] }, exposure: 0.85 });
const { scene, camera, st } = S;
const rnd = makeRnd(577);

// 砂の塊（ゆがんだ球の中にぎっしり）
const N = SP ? 34000 : 80000, RAD = 2.6;
const pos = new Float32Array(N * 3), aR = new Float32Array(N * 4);
for (let i = 0; i < N; i++) {
  let x, y, z, r;
  do { x = rnd() * 2 - 1; y = rnd() * 2 - 1; z = rnd() * 2 - 1; r = Math.hypot(x, y, z); } while (r > 1);
  const k = Math.pow(rnd(), 0.18);   // 表面寄りに多く
  const d = Math.hypot(x, y, z) || 1;
  const rr = k * RAD * (0.82 + 0.18 * Math.sin(x * 3 + y * 2) * Math.cos(z * 2.5));
  pos.set([x / d * rr, y / d * rr * 0.92, z / d * rr], i * 3);
  aR.set([rnd(), rnd(), rnd(), rr / RAD], i * 4);
}
const U = { uP: { value: 0 }, uT: { value: 0 }, uPx: { value: 1000 } };
const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.BufferAttribute(aR, 4));
const sand = new THREE.Points(g, new THREE.ShaderMaterial({
  uniforms: U, depthWrite: true, transparent: false,
  vertexShader: `attribute vec4 aR; uniform float uP, uT, uPx; varying float vL; varying float vA; ${NOISE}
    void main(){
      // ほどける時刻：外側・風上ほど早い（芯のまわりは最後まで残る）
      float wind=dot(normalize(position+.0001),normalize(vec3(-1.,.25,.2)))*.5+.5;
      float life=.08+(1.-aR.w)*.62+(1.-wind)*.16+aR.x*.12;
      float age=max(0.,uP-life);
      vec3 p=position;
      p+=vn3(position*1.6+uT*.05)*.015;
      vec3 w=vec3(1.,.18+aR.y*.3,-.15+aR.z*.3);
      p+=w*(age*5.+age*age*16.)+vn3(position*.7+vec3(age*2.,0.,uT*.03))*age*3.;
      vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
      gl_PointSize=max(1.5,uPx*.045*(1.-smoothstep(0.,.3,age)*.6)/-mv.z);
      vA=1.-smoothstep(.02,.22,age);
      vec3 n=normalize(position+.0001);
      vL=.07+.6*pow(max(0.,dot(n,normalize(vec3(-.5,.8,.45)))),1.5);
      if(vA<.01) gl_Position=vec4(2.,2.,2.,1.);
    }`,
  fragmentShader: `varying float vL; varying float vA; float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){ float r=length(gl_PointCoord-.5); if(r>.5) discard;
      // ほどけかけの粒はまばらに抜く（透明の代わり）
      if(h(gl_FragCoord.xy)>vA) discard;
      gl_FragColor=vec4(vec3(.2,.21,.23)*vL,1.); }`,
}));
sand.frustumCulled = false; scene.add(sand);
S.onResize((s) => { U.uPx.value = s.px; });

// 芯（最初から奥にある。砂に隠れているだけ）
const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: 0x24262a, roughness: 0.4, metalness: 0.3, flatShading: true, emissive: 0xff5a24, emissiveIntensity: 0.7 }));
core.scale.set(1, 1.7, 1); scene.add(core);
scene.add(new THREE.HemisphereLight(0x8c929c, 0x000000, 0.25));
const gt = glowTex();
const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: 0xff5a24, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true }));
halo.scale.setScalar(1.4); scene.add(halo);

// 流れていった砂の、遠くの細い塵
{
  const n = SP ? 500 : 1200, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([(rnd() * 2 - 1) * 40, (rnd() * 2 - 1) * 24, -10 - rnd() * 40], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x3a3d42, size: 1, sizeAttenuation: false })));
}

S.run((st) => {
  const p = st.p, t = st.t;
  U.uP.value = p; U.uT.value = t;
  core.rotation.set(0.35, t * 0.4, 0.2);
  const reveal = sstep(0.55, 0.95, p);
  halo.material.opacity = 0.2 + reveal * 0.4; halo.scale.setScalar(1.2 + reveal * 0.6 + Math.sin(t * 1.3) * 0.05);
  const yaw = 0.35 + t * 0.02 + st.mx * 0.3, pitch = 0.18 - st.my * 0.2;
  const dist = (SP ? 13 : 10.5) - reveal * (SP ? 3 : 3.5);
  camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
  camera.lookAt(0, 0, 0);
  st.er = sstep(0.08, 0.6, p) * (1 - sstep(0.8, 1, p)); st.rv = reveal;
}, {
  chord: 4,
  base: (st) => ({ noise: 1 - (st.rv || 0) * 0.9, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 砂が流れる風（ほどける量に合わせて）と、最後に残る芯の小さな持続音
  init(out) {
    const wind = sfx.loop(out, 'bandpass', 700, 0.8, out.sfx);
    const { ctx } = out; const g2 = ctx.createGain(); g2.gain.value = 0; g2.connect(out.music);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = mtof(74); o.connect(g2); o.start();
    return { update(s, x) { const t = x.ctx.currentTime;
      wind.g.gain.setTargetAtTime(0.03 + 0.25 * (s.er || 0), t, 0.2); wind.fl.frequency.setTargetAtTime(500 + 1400 * (s.er || 0) + Math.sin(s.t * 0.6) * 200, t, 0.2);
      g2.gain.setTargetAtTime(0.045 * (s.rv || 0), t, 0.4); } };
  },
});
