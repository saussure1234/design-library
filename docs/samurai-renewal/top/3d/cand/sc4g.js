// 場面4・案G「空に届く合図」
// 本線と同じく、ノイズの粒が1点に集まり、Signal が光の柱として打ち上がる。
// 足したもの：柱の先端が上空まで昇り、頭上に広がっていた灰色のノイズの層に届く。
// 届いた所から朱い波紋が層全体へ広がり、ざわついていた層が一度だけ静まる。カメラは打ち上げを追って見上げる。
import { THREE, stage, SP, makeRnd, sstep, mix, mtof, sfx } from './base.js';
import { clock, mkGlow, mkBeam, mkLine, mkDust, mkConv, cues, snd, eOut } from './sc4k.js';

const S = stage({ fov: 42, fovSp: 62, bloom: [0.85, 0.5, 0.6], shift: { pc: [0.17, 0], sp: [0, -0.13] }, exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const { scene, camera, st } = S;
const CK = clock(0.8);
const L = 3.3, SKY = 14, HIT = L + 0.75;   // 打ち上げ・上空の層の高さ・届く時刻

const conv = mkConv(scene, SP ? 4200 : 14000);
const beam = mkBeam(scene);
const line = mkLine(scene, 0.75);
const dust = mkDust(scene);
const core = mkGlow(1, 0xff7a4a), coreW = mkGlow(1, 0xffffff); scene.add(core, coreW);
const head = mkGlow(1, 0xffd2b8), headW = mkGlow(1, 0xffffff); scene.add(head, headW);
const hitG = mkGlow(1, 0xff7a4a); hitG.position.set(0, SKY, 0); scene.add(hitG);

// 上空のノイズの層（円盤。ふだんは灰色でざわつく）
const NS = SP ? 5000 : 13000;
const U = { uT: { value: 0 }, uR: { value: -10 }, uW: { value: 0 }, uPx: { value: 1000 }, uCalm: { value: 0 } };
{
  const rnd = makeRnd(1611), a = new Float32Array(NS * 3), r4 = new Float32Array(NS);
  for (let i = 0; i < NS; i++) { const r = Math.pow(rnd(), 0.6) * 34, th = rnd() * Math.PI * 2; a.set([Math.cos(th) * r, SKY + (rnd() - 0.5) * 0.8, Math.sin(th) * r], i * 3); r4[i] = rnd(); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r4, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
    vertexShader: `attribute float aR; uniform float uT, uR, uW, uPx, uCalm; varying vec3 vC; varying float vA;
      void main(){
        vec3 p=position; float d=length(p.xz);
        float ch=1.-uCalm*smoothstep(uR,uR-6.,d);              // 波が通った内側は静まる
        p+=vec3(sin(uT*2.3+aR*40.),sin(uT*3.1+aR*70.)*.6,cos(uT*2.7+aR*55.))*.18*ch;
        float w=exp(-pow((d-uR)/1.6,2.))*uW;                   // 波の前線
        p.y+=w*.9;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.5,uPx*(.055+.06*w)/-mv.z);
        float fl=.55+.45*step(.35,fract(sin(aR*91.+floor(uT*9.+aR*7.))*43758.5));
        float warm=uCalm*smoothstep(uR,uR-5.,d)*.35;
        vC=mix(mix(vec3(.46,.5,.58)*mix(fl,1.,1.-ch), vec3(1.,.42,.18)*.9, warm), vec3(1.,.42,.18)*2.2, clamp(w,0.,1.));
        vA=(.75+ .9*w)*(1.-smoothstep(50.,85.,-mv.z))*smoothstep(34.,22.,d); }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }',
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
}
// 届いた瞬間の、層に沿った細い輪
const ring = new THREE.Mesh(new THREE.RingGeometry(0.988, 1, 200, 1), new THREE.MeshBasicMaterial({ color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
ring.rotation.x = -Math.PI / 2; ring.position.set(0, SKY, 0); scene.add(ring);
S.onResize((s) => { U.uPx.value = s.px; conv.U.uPx.value = s.px; });

const look = new THREE.Vector3();
S.run((st) => {
  const t = st.t, tau = CK.tau(st); st.tau = tau; st.ep = CK.ep;
  const c = sstep(0, 3.2, tau), pr = sstep(2.6, 3.5, tau);
  conv.U.uTime.value = t; conv.U.uConv.value = c; conv.U.uRise.value = pr;
  // 柱の先端：加速して上空の層に届き、その先の闇へ抜けていく
  const u = (tau - L) / (HIT - L);
  const hy = tau < L ? 0 : (u < 1 ? SKY * Math.pow(u, 1.4) : Math.min(80, SKY + 32 * (tau - HIT)));
  const on = sstep(L - 0.05, L + 0.25, tau);
  beam.set(hy + 0.001, on * (1 + 0.6 * Math.exp(-Math.max(0, tau - L) * 3)), 1);
  head.position.y = headW.position.y = hy;
  const hv = on * (1 - sstep(HIT + 0.6, HIT + 2.2, tau));
  head.material.opacity = hv * 0.9; headW.material.opacity = hv; head.scale.setScalar(1.5 + 1.0 * Math.exp(-Math.max(0, tau - L) * 4)); headW.scale.setScalar(0.8);
  core.scale.setScalar(0.4 + c * 4.2 + Math.sin(t * 8) * 0.2 * c); core.material.opacity = c;
  coreW.scale.setScalar(0.2 + c * 1.6); coreW.material.opacity = c;
  // 届いた後
  const a = Math.max(0, tau - HIT), hit = tau >= HIT;
  U.uT.value = t; U.uR.value = hit ? Math.min(40, 18 * Math.pow(a, 0.8)) : -10; U.uW.value = hit ? Math.exp(-a * 0.45) : 0; U.uCalm.value = hit ? 1 - sstep(4, 9, a) * 0.6 : 0;
  hitG.material.opacity = hit ? Math.exp(-a * 1.6) : 0; hitG.scale.setScalar(4 + a * 10);
  ring.scale.setScalar(Math.max(0.01, U.uR.value)); ring.material.opacity = hit ? 0.22 * Math.exp(-a * 1.4) : 0;
  line.material.uniforms.uT.value = t;
  // カメラ：打ち上げを追って見上げ、少し引く
  const up = sstep(L - 0.1, HIT + 0.25, tau);
  const yaw = 0.0 + st.mx * 0.12 + Math.sin(t * 0.05) * 0.04, d = mix(SP ? 21 : 17, SP ? 36 : 40, up) + st.p * 3;
  camera.position.set(Math.sin(yaw) * d, mix(1.2, -2, up) - st.my * 1.2, Math.cos(yaw) * d);
  look.set(0, mix(0, SP ? 7.5 : 7, up), 0); camera.lookAt(look);
  st.c = c; st.hit = hit ? Math.exp(-a * 0.4) : 0;
}, {
  chord: 4,
  base: (s) => ({ noise: 1 - (s.c || 0) * 0.8, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(out) {
    // 集まる間：ざわつき（帯域ノイズ）が細くなりながら上がっていく
    const rush = sfx.loop(out, 'bandpass', 300, 1.2, out.sfx);
    const drone = snd.hold(out, 'sine', mtof(50)), hum = snd.hold(out, 'triangle', mtof(62));
    const cue = cues([
      [L, (o) => { snd.kick(o, 110, 38, 1.6, 0.42); snd.whoosh(o, 260, 5200, 1.1, 0.32); snd.bell(o, mtof(76), 0.06, 2.4); }],
      // 上空に届く：遠い鐘と、層を渡っていく細いきらめき
      [HIT, (o) => { snd.bell(o, mtof(81), 0.11, 6); setTimeout(() => out.ctx.state === 'running' && snd.bell(o, mtof(88), 0.06, 6), 160); snd.whoosh(o, 7000, 1800, 3.2, 0.07); snd.kick(o, 70, 30, 2.2, 0.16); }],
    ]);
    return {
      update(s, o) {
        const t = o.ctx.currentTime, c = s.c || 0, tau = s.tau ?? -1, post = tau > L ? 1 : 0;
        rush.g.gain.setTargetAtTime((0.05 + 0.2 * c) * (1 - post), t, post ? 0.08 : 0.25);
        rush.fl.frequency.setTargetAtTime(300 + 2400 * c * c, t, 0.2); rush.fl.Q.value = 1.2 + 8 * c;
        drone.g.gain.setTargetAtTime(0.05 + 0.05 * c, t, 0.4); drone.o.frequency.setTargetAtTime(mtof(50) * (1 + 0.5 * c * (1 - post)), t, 0.3);
        hum.g.gain.setTargetAtTime(0.022 * post * (0.6 + 0.4 * (s.hit || 0)), t, 0.6);
        cue(tau, s.ep, o);
      },
    };
  },
});
