// 場面6 案B「群れ」：暗闇の無数の鳥が、それぞれ目の前に出ては消える小さな餌へ突っ込む（短期・個別最適）
// → 餌が消え、群れが1つの大きなうねりになって呼吸し、やがて長い帯となって遠い朱（シグナル）へ流れる（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';

const SIGPOS = new THREE.Vector3(-2, 3, -90);
const s = {};
export default {
  chordAt: (S) => (S.p < 0.55 ? 1 : 7),
  duck: (S) => 1 - sstep(0.55, 0.85, S.p),
  build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.7; S.bloom.threshold = 0.6;
    scene.fog = new THREE.FogExp2(0x020203, 0.022);
    const N = SP ? 1400 : 3000;
    s.N = N;
    // 鳥：細い三角（翼）
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, -0.07, 0, -0.04, 0, 0.01, -0.02, 0, 0, 0.1, 0, 0.01, -0.02, 0.07, 0, -0.04], 3));
    g.computeVertexNormals();
    const m = new THREE.MeshBasicMaterial({ color: 0x868c97, side: THREE.DoubleSide, fog: true });
    s.birds = new THREE.InstancedMesh(g, m, N); s.birds.frustumCulled = false; scene.add(s.birds);
    s.pos = new Float32Array(N * 3); s.vel = new Float32Array(N * 3); s.bait = new Int16Array(N); s.u = new Float32Array(N); s.off = new Float32Array(N * 3); s.orb = new Float32Array(N * 2);
    // 餌：出ては消える小さな点
    const NB = SP ? 20 : 32;
    s.baits = [];
    const bm = new THREE.MeshBasicMaterial({ color: 0xdfe4ec, transparent: true });
    for (let j = 0; j < NB; j++) {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 6), bm.clone()); scene.add(mesh);
      const b = { mesh, p: new THREE.Vector3(), life: 0, max: 1, alive: false };
      spawn(b, SP); b.life = rr(0, b.max); s.baits.push(b);
    }
    for (let i = 0; i < N; i++) {
      s.bait[i] = (rnd() * NB) | 0;
      const b = s.baits[s.bait[i]].p;
      s.pos[i * 3] = b.x + rr(-1, 1); s.pos[i * 3 + 1] = b.y + rr(-1, 1); s.pos[i * 3 + 2] = b.z + rr(-1, 1);
      s.u[i] = rnd();
      // 群れの断面でのずれ（中心ほど密）
      const r = Math.pow(rnd(), 0.6), a = rnd() * TAU;
      s.off[i * 3] = Math.cos(a) * r; s.off[i * 3 + 1] = Math.sin(a) * r; s.off[i * 3 + 2] = rr(-1, 1);
      s.orb[i * 2] = rr(0.12, 0.55); s.orb[i * 2 + 1] = rr(2, 5) * (rnd() < 0.5 ? -1 : 1);
    }
    // 朱
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*50.)*3.+exp(-d*d*5.)*.45;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    sg.position.copy(SIGPOS); sg.scale.setScalar(26); scene.add(sg); s.sig = sg;
    s.m4 = new THREE.Matrix4(); s.q = new THREE.Quaternion(); s.v = new THREE.Vector3(); s.z = new THREE.Vector3(0, 0, 1); s.one = new THREE.Vector3(1, 1, 1);
    s.ev = []; s.sigOn = false;
  },
  frame(S) {
    const { camera, t, p, SP } = S;
    const dt = Math.min(S.dt, 0.033);
    const k = sstep(0.32, 0.7, p), st = sstep(0.68, 0.95, p);   // k=群れになる / st=帯になって流れる
    s.k = k; s.st = st;
    // 餌の寿命
    s.baits.forEach((b) => {
      b.life += dt;
      if (b.life > b.max) { spawn(b, SP); if (k < 0.3 && rnd() < 0.35) s.ev.push('bait'); }
      const f = b.life / b.max;
      b.mesh.position.copy(b.p);
      b.mesh.material.opacity = Math.sin(Math.PI * clamp(f)) * (1 - k);
      b.mesh.scale.setScalar(1 + Math.sin(t * 20 + b.max) * 0.2);
    });
    const N = s.N, P = s.pos, Vv = s.vel;
    const tgt = s.v;
    let speedSum = 0;
    for (let i = 0; i < N; i++) {
      const i3 = i * 3;
      // 個別：自分の餌のまわりを小さく速く回る。餌が消えたら近くの別の餌へ乗り換え
      let bi = s.bait[i]; const bb = s.baits[bi];
      if (bb.life < dt * 1.5 && k < 0.5) { bi = (rnd() * s.baits.length) | 0; s.bait[i] = bi; }
      const B = s.baits[bi].p, R = s.orb[i * 2], w = s.orb[i * 2 + 1];
      const ang = t * w + i;
      let tx = B.x + Math.cos(ang) * R, ty = B.y + Math.sin(ang * 1.3) * R * 0.6, tz = B.z + Math.sin(ang) * R;
      // 全体：1つの大きなうねり（時間とともに形を変える帯）→ 遠くへ流れる
      if (k > 0) {
        s.u[i] = (s.u[i] + dt * lerp(0.02, 0.05, st)) % 1;
        const u = s.u[i];
        const a = u * TAU;
        // うねり（閉じた輪がゆっくり捻れる）
        const cx = Math.sin(a + t * 0.12) * 7 + Math.sin(a * 2 - t * 0.2) * 2.2;
        const cy = Math.sin(a * 2 + t * 0.17) * 2.4 + 1.5;
        const cz = Math.cos(a + t * 0.1) * 4.5 - 4;
        // 帯（手前から地平の朱へ）
        const sx = lerp(5, SIGPOS.x, u) + Math.sin(u * 9 - t * 0.9) * 2.2 * (1 - u);
        const sy = lerp(-1, SIGPOS.y, u) + Math.sin(u * 7 + t * 0.7) * 1.2 * (1 - u);
        const sz = lerp(6, SIGPOS.z, u * u * 0.4 + u * 0.6);
        const thick = lerp(lerp(1.4, 2.4, 0.5 + 0.5 * Math.sin(a * 3 + t * 0.6)), lerp(1.6, 0.25, u), st);
        const ox = s.off[i3] * thick, oy = s.off[i3 + 1] * thick * 0.6, oz = s.off[i3 + 2] * thick;
        const fx = lerp(cx, sx, st) + ox, fy = lerp(cy, sy, st) + oy, fz = lerp(cz, sz, st) + oz;
        tx = lerp(tx, fx, k); ty = lerp(ty, fy, k); tz = lerp(tz, fz, k);
      }
      // 追いかけ（個別は急に・全体はなめらかに）
      const acc = lerp(28, 6, k), damp = lerp(0.86, 0.94, k);
      Vv[i3] = (Vv[i3] + (tx - P[i3]) * acc * dt) * damp;
      Vv[i3 + 1] = (Vv[i3 + 1] + (ty - P[i3 + 1]) * acc * dt) * damp;
      Vv[i3 + 2] = (Vv[i3 + 2] + (tz - P[i3 + 2]) * acc * dt) * damp;
      P[i3] += Vv[i3] * dt; P[i3 + 1] += Vv[i3 + 1] * dt; P[i3 + 2] += Vv[i3 + 2] * dt;
      const sp = Math.hypot(Vv[i3], Vv[i3 + 1], Vv[i3 + 2]); speedSum += sp;
      tgt.set(Vv[i3], Vv[i3 + 1], Vv[i3 + 2]).multiplyScalar(1 / (sp || 1));
      s.q.setFromUnitVectors(s.z, tgt);
      // 羽ばたき（大きさの揺れ）
      const fl = 1 + 0.25 * Math.sin(t * 22 + i * 1.7);
      s.one.set(fl, 1, 1 + Math.min(sp * 0.04, 0.8));
      s.m4.compose(tgt.set(P[i3], P[i3 + 1], P[i3 + 2]), s.q, s.one);
      s.birds.setMatrixAt(i, s.m4);
    }
    s.birds.instanceMatrix.needsUpdate = true;
    s.speed = speedSum / N;
    const sv = sstep(0.75, 0.97, p);
    s.sig.material.uniforms.uA.value = sv; s.sig.lookAt(camera.position);
    if (sv > 0.5 && !s.sigOn) { s.sigOn = true; s.ev.push('sig'); } if (sv < 0.2) s.sigOn = false;
    // カメラ
    const d = SP ? 24 : 19;
    camera.position.set(lerp(2, 7, st) + Math.sin(t * 0.05) * 1.5, lerp(3, 2.2, st), lerp(d, d * 0.62, st));
    camera.lookAt(lerp(0, -1, st), lerp(0.5, 1.5, st), lerp(-3, -30, st));
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.16, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      s.bus = A.bus(o, 0.35);
      s.br = A.loop(o, 'bandpass', 700, 0.8, s.bus);   // 群れの息（うねりに合わせた風）
      s.pad = [50, 57, 62, 66, 69, 74].map((m) => A.osc(o, 'sine', mtof(m), s.bus));
      s.nf = 0; s.nc = 0;
    },
    update(S, o) {
      const { ctx } = o, t = ctx.currentTime, k = s.k || 0, st = s.st || 0, z = 1 - k;
      A.set(o, s.bus.gain, 1, 0.3);
      // 羽音：ばらばらの細かい粒（個別）
      if (t > s.nf) {
        s.nf = t + lerp(0.008, 0.05, k);
        A.noise(o, (0.05 + 0.04 * Math.random()) * lerp(1, 0.25, k), 0.002, 0.02 + Math.random() * 0.03, 'bandpass', 2500 + Math.random() * 4000, 3, s.bus);
      }
      // 小さな鳴き声（ばらばらの音程で上下）
      if (z > 0.2 && t > s.nc) { s.nc = t + 0.08 + Math.random() * 0.3; const f = 1800 + Math.random() * 2400; A.tone(o, f, 'sine', 0.025 * z, 0.005, 0.07, s.bus, f * (Math.random() < 0.5 ? 0.6 : 1.5)); }
      // 群れの息：1つのうねりで大きく吸って吐く
      const breath = 0.5 + 0.5 * Math.sin(S.t * 0.6);
      A.set(o, s.br.g.gain, k * (0.05 + 0.13 * breath), 0.15);
      s.br.fl.frequency.setTargetAtTime(400 + breath * 1100 + st * 400, t, 0.2);
      s.ev.forEach((e) => {
        if (e === 'bait') A.tone(o, 2600 + Math.random() * 1500, 'sine', 0.03, 0.002, 0.05, s.bus);
        else if (e === 'sig') { SND.lock && SND.lock(); }
      });
      s.ev.length = 0;
      s.pad.forEach((v, i) => A.set(o, v.g.gain, 0.022 * sstep(0.5, 1, S.p) * (1 - i * 0.1), 1.2));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
function spawn(b, SP) {
  b.p.set(SP ? rr(-5, 5) : rr(-3, 10), rr(-3.5, 4.5), rr(-9, 3));
  b.life = 0; b.max = rr(0.8, 2.6);
}
