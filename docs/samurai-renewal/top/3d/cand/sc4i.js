// 場面4・案I「息をのむ一拍」
// 本線の「集まる→打ち上がる」の間に、一拍の“溜め”を入れた案。
// 集まりきった瞬間、すべてが止まり、光も音も引いて、芯だけが小さく一度だけ脈打つ。
// 次の瞬間に打ち上がる：閃光、柱が一気に立ち、残っていたノイズが衝撃の輪で外へ吹き払われる。その後は柱に火の粉が昇り続ける。
import { THREE, stage, SP, makeRnd, sstep, mix, mtof, sfx } from './base.js';
import { clock, mkGlow, mkBeam, mkLine, mkDust, mkConv, cues, snd, eOut } from './sc4k.js';

const S = stage({ fov: 42, fovSp: 62, bloom: [0.85, 0.5, 0.6], shift: { pc: [0.17, 0], sp: [0, -0.13] }, exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const { scene, camera, st, renderer } = S;
const CK = clock(0.8);
const H0 = 2.85, BEAT = 3.45, L = 4.0;   // 止まる・脈打つ・打ち上げ

const conv = mkConv(scene, SP ? 4200 : 13000);
const beam = mkBeam(scene);
const line = mkLine(scene, 0.75);
const dust = mkDust(scene);
const core = mkGlow(1, 0xff7a4a), coreW = mkGlow(1, 0xffffff), flash = mkGlow(1, 0xffffff); scene.add(core, coreW, flash);

// 集まりきらなかったノイズ（周りに残る粒）。打ち上げの衝撃で外へ吹き払われる
const NR = SP ? 1800 : 5000;
const RU = { uT: { value: 0 }, uHT: { value: 0 }, uHold: { value: 0 }, uR: { value: -5 }, uK: { value: 0 }, uDim: { value: 1 }, uPx: { value: 1000 } };
{
  const rnd = makeRnd(8081), a = new Float32Array(NR * 3), r4 = new Float32Array(NR);
  for (let i = 0; i < NR; i++) {
    const th = rnd() * Math.PI * 2, r = 4 + Math.pow(rnd(), 0.8) * 26;
    a.set([Math.cos(th) * r, (rnd() - 0.5) * (2 + r * 0.35), Math.sin(th) * r], i * 3); r4[i] = rnd();
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r4, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: RU,
    vertexShader: `attribute float aR; uniform float uT, uHT, uHold, uR, uK, uDim, uPx; varying vec3 vC; varying float vA;
      void main(){
        float tt=mix(uT,uHT,uHold);
        vec3 p=position; float d=length(p.xz);
        p+=vec3(sin(tt*1.7+aR*50.),sin(tt*2.1+aR*80.)*.5,cos(tt*1.9+aR*30.))*.25;
        float past=smoothstep(d-1.,d+2.,uR);                 // 波が通り過ぎた
        float fr=exp(-pow((d-uR)/1.8,2.))*uK;                // 波の前線
        p.xz*=1.+past*uK*(.6+aR*.8)*min(1.,(uR-d)/14.+.2);
        p.y+=fr*.6;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uPx*(.03+.012*fr)/-mv.z);
        vC=mix(vec3(.44,.5,.6),vec3(1.,.42,.18)*1.6,clamp(fr,0.,1.));
        vA=(.4+fr)*uDim*(1.-past*uK*.75)*(1.-smoothstep(25.,55.,-mv.z))*smoothstep(3.,7.,-mv.z); }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }',
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
}
// 衝撃の輪（水平）
const ring = new THREE.Mesh(new THREE.RingGeometry(0.985, 1, 200, 1), new THREE.MeshBasicMaterial({ color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; scene.add(ring);
// 柱に昇り続ける火の粉
const NE = SP ? 160 : 360;
const EU = { uT: { value: 0 }, uA: { value: 0 }, uPx: { value: 1000 } };
{
  const rnd = makeRnd(77), a = new Float32Array(NE * 3);
  for (let i = 0; i < NE; i++) a.set([rnd(), rnd(), rnd()], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: EU,
    vertexShader: `uniform float uT, uA, uPx; varying float vA;
      void main(){ vec3 r=position; float f=fract(uT*(.05+.08*r.y)+r.x);
        float rad=(.15+r.z*.9)*(1.-f*.5);
        vec3 p=vec3(cos(r.x*40.+uT*.6)*rad, f*42., sin(r.x*40.+uT*.6)*rad);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uPx*.03/-mv.z); vA=uA*smoothstep(0.,.06,f)*(1.-f)*(.5+.5*sin(uT*9.+r.y*60.)); }`,
    fragmentShader: 'varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(1.,.5,.25)*1.6*smoothstep(.5,0.,r)*vA,1.); }',
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
}
S.onResize((s) => { conv.U.uPx.value = s.px; RU.uPx.value = s.px; EU.uPx.value = s.px; });

let holdT = 0;
S.run((st) => {
  const t = st.t, tau = CK.tau(st); st.tau = tau; st.ep = CK.ep;
  const c = sstep(0, H0, tau);
  const hold = tau >= H0 && tau < L ? 1 : 0, a = Math.max(0, tau - L), post = tau >= L ? 1 : 0;
  if (tau < H0) holdT = t;
  // 止まる間：粒は止まり、周りは暗く引く
  const dim = 1 - 0.7 * sstep(H0, H0 + 0.35, tau) * (1 - sstep(L, L + 0.1, tau));
  conv.U.uTime.value = t; conv.U.uConv.value = c; conv.U.uHold.value = hold; conv.U.uHT.value = holdT;
  conv.U.uRise.value = sstep(L, L + 0.8, tau); conv.U.uDim.value = dim * (post ? 1 - sstep(L + 0.5, L + 3, tau) * 0.5 : 1);
  RU.uT.value = t; RU.uHT.value = holdT; RU.uHold.value = hold; RU.uDim.value = dim;
  RU.uR.value = post ? 34 * Math.pow(a, 0.55) : -5; RU.uK.value = post ? 1 : 0;
  ring.scale.setScalar(Math.max(0.01, RU.uR.value)); ring.material.opacity = post ? 0.45 * Math.exp(-a * 1.3) * (1 - sstep(7, 12, RU.uR.value)) : 0;
  // 芯：集まる→ぐっと縮んで小さな点に→一度だけ脈打つ→打ち上げで開く
  const squeeze = sstep(H0, H0 + 0.5, tau) * (1 - post);
  const beat = Math.exp(-Math.pow((tau - BEAT) / 0.07, 2));
  conv.U.uSq.value = squeeze * (1 - beat * 0.5);
  const cs = (0.4 + c * 4.2 + Math.sin(t * 8) * 0.2 * c * (1 - squeeze)) * mix(1, 0.14, squeeze) * (1 + beat * 2.2);
  core.scale.setScalar(post ? 3.2 + 2.5 * Math.exp(-a * 2) : cs); core.material.opacity = c * (post ? 1 : mix(1, 0.35, squeeze) * (1 + beat));
  coreW.scale.setScalar(post ? 1.5 : (0.2 + c * 1.6) * mix(1, 0.3, squeeze) * (1 + beat * 1.2)); coreW.material.opacity = c * (post ? 1 : mix(1, 0.45, squeeze) * (1 + beat));
  // 打ち上げ：ほぼ一瞬で立つ
  beam.set(0.001 + 70 * eOut(a / 0.35) * post, post * (1 + 1.4 * Math.exp(-a * 2.5)) * (0.92 + 0.08 * Math.sin(t * 2.2)));
  const fl = post ? Math.exp(-a * 3.5) : 0; flash.scale.setScalar(3 + 9 * (1 - fl)); flash.material.opacity = fl * 0.7;
  renderer.toneMappingExposure = 0.95 * (1 + fl * 0.5);
  EU.uT.value = t; EU.uA.value = sstep(L + 0.3, L + 2, tau);
  line.material.uniforms.uA.value = mix(1, 0.35, sstep(H0, H0 + 0.35, tau) * (1 - post)); line.material.uniforms.uT.value = t;
  dust.material.opacity = dim;
  // カメラ：溜めの間だけほんの少し寄り、打ち上げで揺れて引く
  const shake = post ? Math.exp(-a * 5) * 0.22 : 0;
  const yaw = st.mx * 0.12 + Math.sin(t * 0.05) * 0.04;
  const d = (SP ? 22 : 17) - sstep(H0, L, tau) * 1.4 * (1 - post) + sstep(L, L + 2.5, tau) * 2 + st.p * 3;
  camera.position.set(Math.sin(yaw) * d + Math.sin(t * 61) * shake, 1.2 - st.my * 1.2 + Math.cos(t * 53) * shake + sstep(L, L + 3, tau) * 0.5, Math.cos(yaw) * d);
  camera.lookAt(0, sstep(L, L + 3, tau) * 2.4, 0);
  st.c = c; st.hold = hold; st.post = post;
}, {
  chord: 4,
  base: (s) => ({ noise: s.hold ? 0 : (1 - (s.c || 0) * 0.7) * (s.post ? 0.3 : 1), travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(out) {
    // 溜め：低いうなりが上がり、刻みが速くなる → 無音 → 一拍 → 打ち上げ
    const drone = snd.hold(out, 'sawtooth', mtof(38));
    const { ctx } = out; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 200; lp.Q.value = 2;
    drone.g.disconnect(); drone.o.disconnect(); drone.o.connect(lp); lp.connect(drone.g); drone.g.connect(out.music);
    const hum = snd.hold(out, 'sine', mtof(57)), hum2 = snd.hold(out, 'sine', mtof(64));
    let nextTick = 0;
    const cue = cues([
      [BEAT, (o) => { snd.kick(o, 70, 42, 0.6, 0.3); }],
      [L, (o) => { snd.kick(o, 150, 30, 2.6, 0.55); sfx.burst(o, 0.38, 0.7, 'lowpass', 1100, 0.7); snd.whoosh(o, 180, 7000, 1.5, 0.34);
        snd.bell(o, mtof(81), 0.1, 6); snd.bell(o, mtof(69), 0.07, 7); }],
    ]);
    return {
      update(s, o) {
        const t = o.ctx.currentTime, c = s.c || 0, tau = s.tau ?? -1, pre = tau < H0 && tau > 0 ? 1 : 0;
        drone.g.gain.setTargetAtTime(pre ? 0.03 + 0.09 * c : 0, t, pre ? 0.2 : 0.03);
        drone.o.frequency.setTargetAtTime(mtof(38) * (1 + 0.5 * c), t, 0.2); lp.frequency.setTargetAtTime(200 + 1800 * c * c, t, 0.2);
        hum.g.gain.setTargetAtTime(s.post ? 0.03 : 0, t, s.post ? 0.8 : 0.05); hum2.g.gain.setTargetAtTime(s.post ? 0.016 : 0, t, 1.5);
        // 刻み：集まるほど速くなる（止まると消える）
        if (pre && s.t >= nextTick) { nextTick = s.t + mix(0.55, 0.07, Math.pow(c, 1.3)); sfx.tone(o, mtof(93), 0.03 + 0.03 * c, 0.002, 0.06, 'sine'); }
        if (!pre) nextTick = 0;
        cue(tau, s.ep, o);
      },
    };
  },
});
