// 場面6 案G「砂鉄」：宙に浮く無数の小さな針（砂鉄）が、それぞれ近くに出ては消える小さな磁石に引かれ、ばらばらの向きでぴくぴく向きを変える（短期・個別最適）
// → 小さな磁石が消え、遠い1つの大きな磁極の場に全部の針が向きをそろえる。一本一本は小さいまま、全部で1つの大きな力線の模様になり、磁極に朱が灯る（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';

const CH = [60, 64, 67, 71, 74, 79];
const s = {};
export default {
  chordAt: (S) => (S.p < 0.5 ? 2 : 6),
  duck: (S) => 1 - sstep(0.5, 0.85, S.p),
  build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.55; S.bloom.threshold = 0.4; S.bloom.radius = 0.4;
    // 針を並べる面（カメラに向いた縦の面、少し奥行きを持たせる）
    const X = SP ? [-4.2, 4.2] : [-2.2, 13.2], Y = SP ? [-4.5, 7.5] : [-5.2, 5.2];
    const NX = SP ? 46 : 86, NY = SP ? 66 : 58, N = NX * NY;
    s.N = N; s.X = X; s.Y = Y;
    s.A = SP ? new THREE.Vector2(-0.6, 2.6) : new THREE.Vector2(6.0, 0.3);    // 朱の磁極
    s.B = SP ? new THREE.Vector2(1.2, -1.4) : new THREE.Vector2(11.2, -0.5);  // 対になる磁極（印は出さない）
    const g = new THREE.BoxGeometry(SP ? 0.2 : 0.17, 0.011, 0.011);
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: true });
    s.mesh = new THREE.InstancedMesh(g, m, N); s.mesh.frustumCulled = false; scene.add(s.mesh);
    s.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    s.px = new Float32Array(N); s.py = new Float32Array(N); s.pz = new Float32Array(N); s.ang = new Float32Array(N); s.rs = new Float32Array(N); s.ph = new Float32Array(N);
    let i = 0;
    for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++, i++) {
      s.px[i] = lerp(X[0], X[1], (x + rnd()) / NX); s.py[i] = lerp(Y[0], Y[1], (y + rnd()) / NY); s.pz[i] = rr(-0.6, 0.6);
      s.ang[i] = rnd() * TAU; s.rs[i] = rr(2.5, 9); s.ph[i] = rnd() * TAU;
    }
    // 端と文の側をぼかす（四角い縁を見せない）
    s.edge = new Float32Array(N);
    for (let j = 0; j < N; j++) { const ex = Math.min(clamp((s.px[j] - X[0]) / (SP ? 1.5 : 5)), clamp((X[1] - s.px[j]) / 2.5)), ey = Math.min(clamp((s.py[j] - Y[0]) / 2), clamp((Y[1] - s.py[j]) / 2)); s.edge[j] = Math.pow(ex * ey, 0.8); }
    // 小さな磁石：出ては消える
    const NM = SP ? 10 : 16;
    s.M = Array.from({ length: NM }, () => newMag({}, 0));
    s.M.forEach((q) => { q.life = rr(0, q.max); });
    // 朱
    s.core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(2), toneMapped: false }));
    s.core.position.set(s.A.x, s.A.y, 0.1); scene.add(s.core);
    s.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*70.)*.9+exp(-d*d*6.)*.08;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    s.glow.scale.setScalar(6); s.glow.position.copy(s.core.position); scene.add(s.glow);
    s.m4 = new THREE.Matrix4(); s.q = new THREE.Quaternion(); s.v = new THREE.Vector3(); s.one = new THREE.Vector3(1, 1, 1); s.z = new THREE.Vector3(0, 0, 1);
    s.ev = []; s.sigOn = false; s.turn = 0;
  },
  frame(S) {
    const { camera, t, p, SP } = S;
    const dt = Math.min(S.dt, 0.033);
    const k = sstep(0.28, 0.72, p);
    s.k = k;
    // 小さな磁石の寿命（ばらばらの時だけ生まれる）
    s.M.forEach((q) => {
      q.life += dt;
      if (q.life > q.max) { newMag(q, k); if (k < 0.5 && rnd() < 0.6) s.ev.push({ mag: q.sg }); }
      q.a = Math.sin(Math.PI * clamp(q.life / q.max)) * (1 - k) * q.st;
    });
    const A2 = s.A, B2 = s.B, col = s.mesh.instanceColor.array;
    let turn = 0;
    for (let i = 0; i < s.N; i++) {
      const x = s.px[i], y = s.py[i];
      // 局所：近くの小さな磁石の場（ばらばら）
      let lx = 0, ly = 0, near = 0;
      for (let j = 0; j < s.M.length; j++) {
        const q = s.M[j]; if (q.a <= 0.001) continue;
        const dx = x - q.x, dy = y - q.y, r2 = dx * dx + dy * dy + 0.05, f = q.a * q.sg / r2;
        lx += dx * f; ly += dy * f; near = Math.max(near, q.a * Math.exp(-r2 * 0.9));
      }
      // 全体：1つの大きな磁極の場（双極子）
      const ax = x - A2.x, ay = y - A2.y, bx = x - B2.x, by = y - B2.y;
      const ra = ax * ax + ay * ay + 0.02, rb = bx * bx + by * by + 0.02;
      const gx = ax / ra - bx / rb, gy = ay / ra - by / rb;
      const ll = Math.hypot(lx, ly) + 1e-6, gl = Math.hypot(gx, gy) + 1e-6;
      const wl = (1 - k) * Math.min(1, ll * 3);
      const tx = (lx / ll) * wl + (gx / gl) * k, ty = (ly / ll) * wl + (gy / gl) * k;
      // 針はそれぞれの速さで向きを合わせる（ばらばらの時は震え、そろうと静かに）
      let ta = Math.atan2(ty, tx);
      if (wl + k < 0.05) ta = s.ang[i] + Math.sin(t * 0.7 + s.ph[i]) * 0.02;
      let d = ta - s.ang[i]; d = Math.atan2(Math.sin(d), Math.cos(d));
      // 砂鉄は向きが180度どちらでもよい
      if (d > Math.PI / 2) d -= Math.PI; else if (d < -Math.PI / 2) d += Math.PI;
      const sp = lerp(s.rs[i], 3, k);
      const step = d * Math.min(1, dt * sp);
      s.ang[i] += step + (1 - k) * Math.sin(t * 9 + s.ph[i]) * 0.012;
      turn += Math.abs(step);
      // 明るさ：ばらばらの時は小さな磁石のまわりだけ → そろうと力線の筋が浮かぶ
      const psi = Math.atan2(ay, ax) - Math.atan2(by, bx);
      const line = Math.pow(0.5 + 0.5 * Math.cos(psi * 9), 10);
      const fall = Math.exp(-Math.sqrt(ra) * 0.08);
      const edge = s.edge[i];
      const b = edge * (0.025 + near * 0.5 * (1 - k) + k * (0.02 + line * 0.4 * fall + Math.min(0.12, 0.04 / ra)));
      col[i * 3] = b; col[i * 3 + 1] = b * 1.03; col[i * 3 + 2] = b * 1.1;
      s.q.setFromAxisAngle(s.z, s.ang[i]);
      s.v.set(x, y, s.pz[i] * (1 - k * 0.7));
      s.m4.compose(s.v, s.q, s.one); s.mesh.setMatrixAt(i, s.m4);
    }
    s.turn = turn / s.N;
    s.mesh.instanceMatrix.needsUpdate = true; s.mesh.instanceColor.needsUpdate = true;
    // 朱
    const hv = sstep(0.7, 0.92, p);
    s.core.scale.setScalar(Math.max(0.001, hv));
    s.glow.lookAt(camera.position); s.glow.material.uniforms.uA.value = hv;
    if (hv > 0.5 && !s.sigOn) { s.sigOn = true; s.ev.push({ sig: 1 }); } if (hv < 0.2) s.sigOn = false;
    // カメラ：面を少し斜めから → 正面に回り込み、模様を見せる
    if (SP) {
      camera.position.set(lerp(1.5, 0.2, k), lerp(-1, 1.2, k), lerp(15, 14, k));
      camera.lookAt(0, 1.6, 0);
      camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    } else {
      camera.position.set(lerp(1.6, 6.2, k) + Math.sin(t * 0.05) * 0.4, lerp(-1.6, 0.1, k), lerp(14.5, 15.5, k));
      camera.lookAt(lerp(6.6, 6.6, k), 0, 0);
      camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.14, 0, innerWidth, innerHeight);
    }
  },
  sound: {
    init(S, o) {
      s.bus = A.bus(o, 0.5);
      s.fz = A.loop(o, 'bandpass', 5200, 4, s.bus);           // 針の擦れ（さらさら）
      s.hum = CH.slice(0, 4).map((m) => A.osc(o, 'sine', mtof(m - 12), s.bus));   // 1つの場の唸り（和音）
      s.trem = o.ctx.createOscillator(); s.trem.frequency.value = 0.25; const tg = o.ctx.createGain(); tg.gain.value = 0.006; s.trem.connect(tg); s.hum.forEach((h) => tg.connect(h.g.gain)); s.trem.start();
    },
    update(S, o) {
      const k = s.k || 0;
      A.set(o, s.bus.gain, 1, 0.3);
      A.set(o, s.fz.g.gain, Math.min(0.08, (s.turn || 0) * 1.6) * (1 - k * 0.7), 0.08);
      s.ev.forEach((e) => {
        if (e.sig) { SND.lock && SND.lock(); return; }
        if (e.mag) {   // 小さな磁石が現れて針が一斉にピンと向く：細い金属の音（高さはばらばら）
          const f = rr(2600, 6200);
          A.tone(o, f, 'sine', 0.014, 0.001, 0.18, s.bus);
          A.noise(o, 0.03, 0.001, 0.03, 'highpass', 4000, 1, s.bus);
        }
      });
      s.ev.length = 0;
      s.hum.forEach((h, i) => A.set(o, h.g.gain, 0.026 * sstep(0.35 + i * 0.08, 0.85, k) * (1 - i * 0.12), 1));
      // そろい切った瞬間、ひとつの澄んだ和音
      if (k > 0.96 && !s.rang) { s.rang = true; CH.forEach((m, i) => A.tone(o, mtof(m + 12), 'sine', 0.02, 0.02 + i * 0.03, 4, s.bus)); }
      if (k < 0.8) s.rang = false;
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
function newMag(q, k) {
  q.x = rr(s.X ? s.X[0] + 1 : 0, s.X ? s.X[1] - 1 : 1); q.y = rr(s.Y ? s.Y[0] + 1 : 0, s.Y ? s.Y[1] - 1 : 1);
  q.sg = rnd() < 0.5 ? -1 : 1; q.st = rr(0.5, 1); q.life = 0; q.max = rr(1.4, 3.4); q.a = 0;
  return q;
}
