// 場面6 案E「波紋」：暗い水面のあちこちに小さな滴が勝手に落ち、それぞれ小さな輪を立てては打ち消し合う（短期・個別最適）
// → 滴が少しずつ同じ場所・同じ拍に寄り、小さな輪が重なって1つの大きな輪になる。水面全体が1つの大きな同心円で呼吸し、中心に朱が灯る（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';

const N = 28;                 // 同時に立つ輪の数
const BEAT = 1.7;             // そろった後の拍（秒）
const CH = [60, 64, 67, 72, 74, 76, 79, 84];
const s = {};
export default {
  chordAt: (S) => (S.p < 0.5 ? 2 : 6),
  duck: (S) => 1 - sstep(0.5, 0.85, S.p),
  build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.55; S.bloom.threshold = 0.35; S.bloom.radius = 0.4;
    s.C = SP ? new THREE.Vector2(0, -3) : new THREE.Vector2(3.5, -4);
    const GX = SP ? 220 : 340, GZ = SP ? 260 : 300;
    const x0 = SP ? -12 : -16, x1 = SP ? 12 : 26, z0 = SP ? -34 : -34, z1 = SP ? 8 : 8;
    s.box = [SP ? x0 + 3 : -5, x1 - 4, z0 + 16, z1 - 1];
    const pos = new Float32Array(GX * GZ * 3);
    let o = 0;
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
      pos[o++] = lerp(x0, x1, i / (GX - 1)) + (rnd() - 0.5) * 0.04; pos[o++] = 0; pos[o++] = lerp(z0, z1, j / (GZ - 1)) + (rnd() - 0.5) * 0.04;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    s.uS = Array.from({ length: N }, () => new THREE.Vector4(0, 0, -99, 0));
    s.uP = Array.from({ length: N }, () => new THREE.Vector4(1, 0.3, 1, 10));
    s.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uS: { value: s.uS }, uP: { value: s.uP }, uT: { value: 0 }, uC: { value: s.C }, uHv: { value: 0 }, uPx: { value: SP ? 2.4 : 1.6 } },
      vertexShader: `
        uniform vec4 uS[${N}]; uniform vec4 uP[${N}]; uniform float uT, uHv, uPx; uniform vec2 uC;
        varying float vB; varying float vR;
        float H(vec2 q, out float fl){
          float h = 0.; fl = 0.;
          for (int i = 0; i < ${N}; i++) {
            vec4 s = uS[i]; vec4 P = uP[i];
            float age = uT - s.z; if (age < 0. || age > 14.) continue;
            float d = length(q - s.xy); float x = d - age * P.x;
            float w = P.y + age * 0.05;
            h += s.w * exp(-x * x / (w * w)) * cos(x * P.w) * exp(-age * P.z);
            fl += exp(-d * d * 10.) * exp(-age * 7.) * s.w * 10.;
          }
          return h;
        }
        void main(){
          vec2 q = position.xz; float fl, f2, f3;
          float h = H(q, fl);
          float hx = H(q + vec2(.07, 0.), f2), hz = H(q + vec2(0., .07), f3);
          float sl = length(vec2(hx - h, hz - h)) / .07;
          vec3 p = vec3(q.x, h, q.y);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_PointSize = uPx * (14. / -mv.z) + 0.6;
          gl_Position = projectionMatrix * mv;
          vB = .035 + clamp(sl * 1.4, 0., 1.) * .75 + min(fl, 1.5);
          float dc = length(q - uC);
          vR = uHv * exp(-dc * dc * .03) * (.5 + clamp(sl * 2., 0., 1.));
          vB *= smoothstep(52., 12., -mv.z);
        }`,
      fragmentShader: `varying float vB; varying float vR;
        void main(){ float d = length(gl_PointCoord - .5) * 2.; float a = smoothstep(1., .2, d);
          vec3 c = mix(vec3(.82, .86, .93), vec3(1., .36, .14), clamp(vR, 0., 1.));
          gl_FragColor = vec4(c * vB * a, 1.); }`,
    });
    s.pts = new THREE.Points(g, s.mat); s.pts.frustumCulled = false; scene.add(s.pts);
    // 中心の朱（水面の少し上）
    s.core = new THREE.Mesh(new THREE.SphereGeometry(0.06, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(1.6), toneMapped: false }));
    scene.add(s.core);
    s.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*80.)*.7+exp(-d*d*7.)*.06;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    s.glow.scale.setScalar(6); scene.add(s.glow);
    s.next = s.uS.map(() => rr(0, 2)); s.ev = []; s.sigOn = false; s.lastBeat = -1;
  },
  frame(S) {
    const { camera, t, p, SP } = S;
    const k = sstep(0.26, 0.74, p);
    s.k = k;
    s.mat.uniforms.uT.value = t;
    const beat = Math.floor(t / BEAT);
    // 滴を落とす：ばらばら（どこでも・いつでも・小さい）→ 中心へ・拍の頭に・大きく
    s.uS.forEach((u, i) => {
      if (t < s.next[i]) return;
      const P = s.uP[i];
      const onBeat = rnd() < k * 1.15;
      let t0 = t;
      if (onBeat) { t0 = (beat + 1) * BEAT; }
      // 場所：ばらばら → 中心のまわりへ寄る（そろい切ると中心1点）
      const rx = rr(s.box[0], s.box[1]), rz = rr(s.box[2], s.box[3]);
      const pull = Math.pow(k, 0.8), spread = lerp(1, 0.03, k);
      u.x = lerp(rx, s.C.x + (rx - s.C.x) * spread * 0.25, pull); u.y = lerp(rz, s.C.y + (rz - s.C.y) * spread * 0.25, pull);
      u.z = t0;
      // 大きさ：小さく速く消える → 大きくゆっくり広がる
      const big = k * k;
      u.w = lerp(rr(0.1, 0.2), 0.13, big) * (onBeat ? 1 : lerp(1, 0.4, k));
      P.set(lerp(rr(0.9, 1.5), 2.3, big), lerp(0.22, 0.9, big), lerp(rr(0.9, 1.4), 0.16, big), lerp(rr(9, 14), 3.2, big));
      // 次の滴まで：ばらばらの時は不規則に、そろうと拍ごと
      s.next[i] = onBeat ? t0 + BEAT * lerp(1, Math.max(1, Math.round(N * 0.35 * k * k)), k) - 0.05 : t + rr(0.4, 1.8) * lerp(1, 3, k);
      s.ev.push({ t0, w: u.w, onBeat, big });
    });
    // 朱
    const hv = sstep(0.7, 0.92, p);
    s.mat.uniforms.uHv.value = hv;
    s.core.position.set(s.C.x, 0.35 + 0.05 * Math.sin(t * 1.3), s.C.y); s.core.scale.setScalar(Math.max(0.001, hv));
    s.glow.position.copy(s.core.position); s.glow.lookAt(camera.position); s.glow.material.uniforms.uA.value = hv;
    if (hv > 0.5 && !s.sigOn) { s.sigOn = true; s.ev.push({ sig: 1 }); } if (hv < 0.2) s.sigOn = false;
    // カメラ：低い位置から水面をなめる → 少し上がって同心円を見せる
    const cy = lerp(SP ? 5.5 : 4.2, SP ? 7.5 : 5.6, k), cz = lerp(SP ? 13 : 12, SP ? 11 : 10.5, k);
    camera.position.set((SP ? 0 : 1.2) + Math.sin(t * 0.05) * 0.4, cy, cz);
    camera.lookAt(SP ? 0 : 2.4, 0, lerp(-6, -5, k));
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.16, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.12, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      s.bus = A.bus(o, 0.6);
      s.lo = A.osc(o, 'sine', mtof(36), s.bus);
      s.pad = [48, 55, 64, 67].map((m) => A.osc(o, 'sine', mtof(m), s.bus));
    },
    update(S, o) {
      const { ctx } = o, now = ctx.currentTime, tS = S.t, k = s.k || 0;
      A.set(o, s.bus.gain, 1, 0.3);
      s.ev.forEach((e) => {
        if (e.sig) { SND.lock && SND.lock(); return; }
        const at = now + Math.max(0, e.t0 - tS);
        if (!e.onBeat || e.big < 0.5) {
          // 小さな滴：音階に乗らない「ポッ」（そろうにつれ和音の音へ寄る）
          const raw = 76 + rnd() * 22, q = CH.reduce((a, m) => (Math.abs(m + 12 - raw) < Math.abs(a - raw) ? m + 12 : a), 999);
          const m = lerp(raw, q, sstep(0.15, 0.6, k)), f = mtof(m);
          A.tone(o, f * 0.7, 'sine', 0.03 * (e.onBeat ? 0.8 : 1), 0.002, 0.11, s.bus, f * 1.25, at);
        } else {
          if (Math.abs(e.t0 - (s.lastBig ?? -9)) < 0.01) return; s.lastBig = e.t0;
          // 大きな滴：低い「ドゥン」＋澄んだ鐘（拍の頭で1つ）
          A.tone(o, mtof(48), 'sine', 0.12 * e.big, 0.01, 2.4, s.bus, mtof(43), at);
          A.tone(o, mtof(72), 'sine', 0.03 * e.big, 0.005, 3.2, s.bus, null, at);
          A.tone(o, mtof(72) * 2.76, 'sine', 0.008 * e.big, 0.005, 1.6, s.bus, null, at);
        }
      });
      s.ev.length = 0;
      A.set(o, s.lo.g.gain, 0.05 * sstep(0.5, 1, k), 1.2);
      s.pad.forEach((v, i) => A.set(o, v.g.gain, 0.016 * sstep(0.55 + i * 0.08, 0.95, k), 1.2));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
