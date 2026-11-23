// 場面4 ボタン版の共通の絵：案G「空に届く合図」を、ボタンで動かせる形にしたもの
// 集まる（c）→ 打ち上げ（L）→ 先端が上空のノイズの層に届く（HIT）→ 朱い波紋が層に広がる。カメラは打ち上げを追って見上げる。
// 押す前の芯の位置は画面の下寄り（ボタンの位置）に置く：shift で調整
import { THREE, SP, makeRnd, sstep, mix } from './base.js';
import { mkGlow, mkBeam, mkLine, mkDust, mkConv } from './sc4k.js';

export const SKY = 14, RISE = 0.75;   // 層の高さ・先端が層に届くまでの秒

export function mkSky(S, { lineK = 0.6 } = {}) {
  const { scene, camera } = S;
  const conv = mkConv(scene, SP ? 4200 : 13000);
  const beam = mkBeam(scene);
  const line = mkLine(scene, lineK);
  const dust = mkDust(scene);
  const core = mkGlow(1, 0xff7a4a), coreW = mkGlow(1, 0xffffff), flash = mkGlow(1, 0xffffff); scene.add(core, coreW, flash);
  const head = mkGlow(1, 0xffd2b8), headW = mkGlow(1, 0xffffff); scene.add(head, headW);
  const hitG = mkGlow(1, 0xff7a4a); hitG.position.set(0, SKY, 0); scene.add(hitG);
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
          float ch=1.-uCalm*smoothstep(uR,uR-6.,d);
          p+=vec3(sin(uT*2.3+aR*40.),sin(uT*3.1+aR*70.)*.6,cos(uT*2.7+aR*55.))*.18*ch;
          float w=exp(-pow((d-uR)/1.6,2.))*uW;
          p.y+=w*.9;
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=max(1.5,uPx*(.055+.06*w)/-mv.z);
          float fl=.55+.45*step(.35,fract(sin(aR*91.+floor(uT*9.+aR*7.))*43758.5));
          float warm=uCalm*smoothstep(uR,uR-5.,d)*.35;
          vC=mix(mix(vec3(.46,.5,.58)*mix(fl,1.,1.-ch), vec3(1.,.42,.18)*.9, warm), vec3(1.,.42,.18)*2.2, clamp(w,0.,1.));
          vA=(.75+.9*w)*(1.-smoothstep(50.,85.,-mv.z))*smoothstep(34.,22.,d); }`,
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }',
    });
    const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.988, 1, 200, 1), new THREE.MeshBasicMaterial({ color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.set(0, SKY, 0); scene.add(ring);
  S.onResize((s) => { U.uPx.value = s.px; conv.U.uPx.value = s.px; });
  const look = new THREE.Vector3();

  /**
   * o: { tau（押してからの秒・押す前は負）, c（集まり 0〜1）, L（打ち上げの秒）, hold（芯を縮める 0〜1・任意）, beat（脈 0〜1・任意）, upEnd（見上げ終わり）}
   */
  function update(st, o) {
    const t = st.t, tau = o.tau, c = o.c, L = o.L, HIT = L + RISE;
    const sq = o.hold || 0, beat = o.beat || 0;
    conv.U.uTime.value = t; conv.U.uConv.value = c; conv.U.uRise.value = sstep(L - 0.6, L + 0.3, tau);
    conv.U.uSq.value = sq * (1 - beat * 0.5); conv.U.uDim.value = 1 - 0.7 * sq;
    const u = (tau - L) / RISE;
    const hy = tau < L ? 0 : (u < 1 ? SKY * Math.pow(u, 1.4) : Math.min(80, SKY + 32 * (tau - HIT)));
    const on = sstep(L - 0.05, L + 0.2, tau), a0 = Math.max(0, tau - L);
    beam.set(hy + 0.001, on * (1 + 0.7 * Math.exp(-a0 * 3)));
    head.position.y = headW.position.y = hy;
    const hv = on * (1 - sstep(HIT + 0.6, HIT + 2.2, tau));
    head.material.opacity = hv * 0.9; headW.material.opacity = hv; head.scale.setScalar(1.5 + Math.exp(-a0 * 4)); headW.scale.setScalar(0.8);
    const cc = c * (1 - sq * 0.86) * (1 + beat * 2);
    core.scale.setScalar(tau >= L ? 3.4 : 0.4 + cc * 4 + Math.sin(t * 8) * 0.2 * c * (1 - sq)); core.material.opacity = tau >= L ? 1 : c * mix(1, 0.4, sq);
    coreW.scale.setScalar(tau >= L ? 1.5 : 0.2 + c * 1.5 * (1 - sq * 0.7) * (1 + beat)); coreW.material.opacity = tau >= L ? 1 : c;
    const fl = tau >= L ? Math.exp(-a0 * 4) : 0; flash.scale.setScalar(2 + 6 * (1 - fl)); flash.material.opacity = fl * 0.55;
    const a = Math.max(0, tau - HIT), hit = tau >= HIT;
    U.uT.value = t; U.uR.value = hit ? Math.min(40, 18 * Math.pow(a, 0.8)) : -10; U.uW.value = hit ? Math.exp(-a * 0.45) : 0; U.uCalm.value = hit ? 1 - sstep(4, 9, a) * 0.6 : 0;
    hitG.material.opacity = hit ? Math.exp(-a * 1.6) : 0; hitG.scale.setScalar(4 + a * 10);
    ring.scale.setScalar(Math.max(0.01, U.uR.value)); ring.material.opacity = hit ? 0.22 * Math.exp(-a * 1.4) : 0;
    line.material.uniforms.uT.value = t; line.material.uniforms.uA.value = 1 - 0.6 * sq;
    dust.material.opacity = 1 - 0.7 * sq;
    const up = sstep(L - 0.1, HIT + 0.25, tau);
    const yaw = st.mx * 0.1 + Math.sin(t * 0.05) * 0.04, d = mix(SP ? 21 : 17, SP ? 36 : 40, up) - c * 0.8 * (1 - up);
    camera.position.set(Math.sin(yaw) * d, mix(1.2, -2, up) - st.my * 0.8, Math.cos(yaw) * d);
    look.set(0, mix(0, SP ? 7.5 : 7, up), 0); camera.lookAt(look);
    // 押す前は芯をボタンの位置（画面下寄り）に、見上げるにつれて画面の中心へ
    const sy = mix(o.sy0 || 0, o.sy1 || 0, up); camera.setViewOffset(st.w, st.h, 0, -sy * st.h, st.w, st.h);
    return { hit: hit ? Math.exp(-a * 0.4) : 0, HIT };
  }
  return { update, conv };
}

// 共通の音（案Gと同じ骨格）：集まる間のうなり → 打ち上げ（一撃＋風切り＋短い鐘）→ 層に届く（遠い鐘2音＋きらめき）→ 次へ（下へ抜ける空気）
import { sfx, mtof } from './base.js';
import { cues, snd } from './sc4k.js';
export function skySound(o, { L, GO, gather = true }) {
  const HIT = L + RISE;
  const rush = sfx.loop(o, 'bandpass', 300, 1.2, o.sfx);
  const drone = snd.hold(o, 'sine', mtof(50)), hum = snd.hold(o, 'triangle', mtof(62));
  const cue = cues([
    [L, (x) => { snd.kick(x, 110, 38, 1.6, 0.42); snd.whoosh(x, 260, 5200, 1.1, 0.32); snd.bell(x, mtof(76), 0.06, 2.4); }],
    [HIT, (x) => { snd.bell(x, mtof(81), 0.11, 6); setTimeout(() => x.ctx.state === 'running' && snd.bell(x, mtof(88), 0.06, 6), 160); snd.whoosh(x, 7000, 1800, 3.2, 0.07); snd.kick(x, 70, 30, 2.2, 0.16); }],
    [GO, (x) => { snd.whoosh(x, 2200, 260, 1.9, 0.08); }],
  ]);
  return (s, x, c) => {
    const t = x.ctx.currentTime, tau = s.tau ?? -1, pre = tau < L ? 1 : 0;
    rush.g.gain.setTargetAtTime(gather ? (0.03 + 0.22 * c) * pre : 0, t, pre ? 0.2 : 0.06);
    rush.fl.frequency.setTargetAtTime(300 + 2600 * c * c, t, 0.15); rush.fl.Q.value = 1.2 + 8 * c;
    drone.g.gain.setTargetAtTime((0.04 + 0.05 * c) * (tau >= GO ? 0.4 : 1), t, 0.4); drone.o.frequency.setTargetAtTime(mtof(50) * (1 + 0.5 * c * pre), t, 0.3);
    hum.g.gain.setTargetAtTime(0.022 * (1 - pre) * (tau >= GO ? 0.5 : 1), t, 0.6);
    cue(tau, s.ep, x);
  };
}
