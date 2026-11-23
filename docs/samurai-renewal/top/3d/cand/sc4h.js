// 場面4・案H「向きを持ちはじめるノイズ」
// 本線の「集まる→打ち上がる」はそのまま。変えたのは、集まる前のノイズの質感。
// ノイズは点ではなく、てんでばらばらの向きでチカチカ瞬く短い線。やがて一本ずつ同じ一点の方を向き、
// 瞬きが止まって流れ込み、1点に収まった瞬間、全部が真上を向いて光の柱として打ち上がる。
// 音も同じ：ざらついたノイズの帯域が少しずつ狭まり、ひとつの音程になって、打ち上げで1オクターブ上へ抜ける。
import { THREE, stage, SP, makeRnd, sstep, mix, mtof, sfx } from './base.js';
import { clock, mkGlow, mkBeam, mkLine, mkDust, cues, snd, eOut } from './sc4k.js';

const S = stage({ fov: 42, fovSp: 62, bloom: [0.85, 0.5, 0.6], shift: { pc: [0.17, 0], sp: [0, -0.13] }, exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const { scene, camera, st } = S;
const CK = clock(0.8);
const L = 3.6;

// 短い線のノイズ
const N = SP ? 1800 : 4200;
const U = { uAft: { value: 0 }, uT: { value: 0 }, uAl: { value: 0 }, uConv: { value: 0 }, uRise: { value: 0 }, uPx: { value: 1000 } };
{
  const rnd = makeRnd(3137);
  const rdir = () => { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); return [s * Math.cos(a), u, s * Math.sin(a)]; };
  const P = new Float32Array(N * 6), J = new Float32Array(N * 6), D = new Float32Array(N * 2), R = new Float32Array(N * 8), SD = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const d = rdir(), r = 2.5 + Math.pow(rnd(), 0.7) * 15, p = [d[0] * r, d[1] * r * 0.75, d[2] * r];
    const j = rdir(), jk = Math.pow(rnd(), 2) * 0.4, del = rnd(), rr = [rnd(), rnd(), rnd(), 0.35 + rnd() * 0.7];
    for (let v = 0; v < 2; v++) {
      P.set(p, (i * 2 + v) * 3); J.set([j[0] * jk, j[1] * jk, j[2] * jk], (i * 2 + v) * 3); D[i * 2 + v] = del; R.set(rr, (i * 2 + v) * 4); SD[i * 2 + v] = v;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('aJit', new THREE.BufferAttribute(J, 3));
  g.setAttribute('aDel', new THREE.BufferAttribute(D, 1)); g.setAttribute('aR', new THREE.BufferAttribute(R, 4)); g.setAttribute('aSide', new THREE.BufferAttribute(SD, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
    vertexShader: `attribute vec3 aJit; attribute float aDel, aSide; attribute vec4 aR; uniform float uT, uAl, uConv, uRise, uAft; varying vec3 vC; varying float vA;
      float h1(float x){ return fract(sin(x*127.1)*43758.5453); }
      vec3 hd(float s){ float u=h1(s)*2.-1., a=h1(s+3.7)*6.2832, q=sqrt(1.-u*u); return vec3(q*cos(a),u,q*sin(a)); }
      void main(){
        float id=aR.x*1000.+aR.y*37.;
        float k=clamp(uConv*1.45-aDel*.45,0.,1.); k=k*k*(3.-2.*k);
        // 向き：てんでばらばら（ときどき急に変わる）→ 中心へ
        float al=clamp(uAl*1.3-aR.z*.3,0.,1.); al=al*al*(3.-2.*al);
        float step_=floor(uT*(3.+aR.y*5.)+aR.z*9.);
        vec3 dR=normalize(hd(id+step_)+vec3(0.,0.,.001));
        vec3 rel=position;
        float ang=uT*.05+k*k*(2.+aDel*2.5); float s=sin(ang), c=cos(ang); rel.xz=mat2(c,-s,s,c)*rel.xz;
        vec3 jitter=(hd(id+step_*1.3+.5))*.25*(1.-al);
        vec3 ctr=mix(rel+jitter,aJit,k);
        vec3 dC=normalize(-ctr+vec3(0.,.0001,0.));
        vec3 dir=normalize(mix(dR,dC,al)+vec3(0.,.0001,0.));
        float len=aR.w*mix(.55,1.1,al)*(1.-k*.92);
        // 打ち上げ：真上を向いて伸びながら昇る
        float up=uRise*smoothstep(.72,1.,aDel)*k;
        dir=normalize(mix(dir,vec3(0.,1.,0.),clamp(uRise*2.,0.,1.)*k));
        len+=up*(2.+aR.y*5.);
        ctr.y+=up*(10.+aR.x*26.+uAft*(4.+aR.y*6.)); ctr.xz+=aJit.xz*up*5.;
        vec3 p=ctr+dir*len*(aSide-.5);
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        // 瞬き：向きがそろうほど消えなくなる
        float on=step(h1(id+step_*7.1),mix(.45,1.,al));
        vC=mix(vec3(.34,.38,.45),vec3(.75,.78,.85),al*.6+k*.4);
        vC=mix(vC,vec3(1.,.62,.42)*1.3,clamp(up*1.5,0.,1.));
        float vis=max(1.-k*.985, clamp(up*3.,0.,1.)*.55*(1.-smoothstep(.6,1.,uRise)*.4));
        vA=on*(.5+.5*al)*(1.-smoothstep(22.,40.,-mv.z))*smoothstep(4.,10.,-mv.z)*vis*(1.-smoothstep(26.,50.,ctr.y));
      }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ gl_FragColor=vec4(vC*vA,1.); }',
  });
  const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; scene.add(ls);
}
const beam = mkBeam(scene);
const line = mkLine(scene, 0.75);
mkDust(scene);
const core = mkGlow(1, 0xff7a4a), coreW = mkGlow(1, 0xffffff); scene.add(core, coreW);
const flash = mkGlow(1, 0xffffff); scene.add(flash);

S.run((st) => {
  const t = st.t, tau = CK.tau(st); st.tau = tau; st.ep = CK.ep;
  const al = sstep(0.3, 2.4, tau), c = sstep(1.0, 3.5, tau), r = sstep(L - 0.15, L + 0.9, tau);
  U.uT.value = t; U.uAl.value = al; U.uConv.value = c; U.uRise.value = r; U.uAft.value = Math.max(0, tau - L);
  const h = 60 * eOut((tau - L) / 0.9), on = sstep(L - 0.05, L + 0.2, tau);
  beam.set(h + 0.001, on * (1 + 0.7 * Math.exp(-Math.max(0, tau - L) * 3)));
  core.scale.setScalar(0.4 + c * 4.2 + Math.sin(t * 8) * 0.2 * c); core.material.opacity = c;
  coreW.scale.setScalar(0.2 + c * 1.6); coreW.material.opacity = c;
  const fl = tau > L ? Math.exp(-(tau - L) * 5) : 0; flash.scale.setScalar(2 + 5 * fl); flash.material.opacity = fl * 0.6;
  line.material.uniforms.uT.value = t;
  const yaw = st.mx * 0.12 + Math.sin(t * 0.05) * 0.04, d = (SP ? 22 : 17.5) - sstep(0, L, tau) * 1.2 + st.p * 3;
  camera.position.set(Math.sin(yaw) * d, 1.2 - st.my * 1.2 + sstep(L, L + 2, tau) * 0.6, Math.cos(yaw) * d);
  camera.lookAt(0, sstep(L, L + 2.2, tau) * 2.2, 0);
  st.al = al; st.c = c;
}, {
  chord: 4,
  base: (s) => ({ noise: 1 - (s.al || 0) * 0.85, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(out) {
    const F0 = mtof(62);
    // ノイズの帯域を狭めていくと、ひとつの音程になる
    const nb = sfx.loop(out, 'bandpass', F0, 0.6, out.music);
    const tone = snd.hold(out, 'sine', F0), tone2 = snd.hold(out, 'sine', F0 * 2);
    let last = 0;
    const cue = cues([
      [L, (o) => { snd.kick(o, 120, 36, 1.5, 0.4); snd.whoosh(o, 300, 6000, 1.0, 0.3);
        const { ctx } = o, t = ctx.currentTime;   // 音程そのものが1オクターブ上へ抜ける
        tone.o.frequency.setValueAtTime(F0, t); tone.o.frequency.exponentialRampToValueAtTime(F0 * 2, t + 0.45);
        snd.bell(o, F0 * 4, 0.05, 3.5); }],
    ]);
    return {
      update(s, o) {
        const t = o.ctx.currentTime, al = s.al || 0, tau = s.tau ?? -1, post = tau > L ? 1 : 0;
        nb.fl.Q.value = 0.6 + 70 * Math.pow(al, 2.2);
        nb.g.gain.setTargetAtTime(post ? 0 : (0.06 + 0.5 * Math.pow(al, 2)), t, post ? 0.05 : 0.2);
        tone.g.gain.setTargetAtTime(post ? 0.04 * Math.exp(-(tau - L) * 0.25) + 0.012 : 0.05 * sstep(0.6, 1, al), t, 0.15);
        if (tau < L - 0.6) tone.o.frequency.setTargetAtTime(F0, t, 0.05);
        tone2.g.gain.setTargetAtTime(post ? 0.012 : 0, t, 1.2);
        // ぱちぱち：向きがそろうほど減る
        if (!post && tau > 0 && s.t - last > 0.02 && Math.random() < 0.55 * (1 - al)) { last = s.t; sfx.burst(o, 0.05 + 0.08 * Math.random(), 0.012 + Math.random() * 0.02, 'highpass', 2500 + Math.random() * 4000, 0.8); }
        cue(tau, s.ep, o);
      },
    };
  },
});
