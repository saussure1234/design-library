// 場面6 案F「石垣」：大きさも形も違う小さな石が、暗闇でそれぞれ勝手に転がり、漂っている（短期・個別最適）
// → 下の段から1つずつ収まり、互いに支え合って、1枚の大きな反りのある石垣（扇の勾配）になる。いちばん上に朱が1つ灯る（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';

const CH = [36, 43, 48, 52, 55];   // 石垣が鳴らす低い和音（C）
function rockGeo(seed) {
  const g = new THREE.BoxGeometry(1, 1, 1, 3, 3, 2), p = g.attributes.position, v = new THREE.Vector3();
  const ph = [rr(0, 9), rr(0, 9), rr(0, 9)];
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    // 角を丸めて、表面をでこぼこに
    const r = v.clone().normalize().multiplyScalar(0.62);
    v.lerp(r, 0.22);
    const n = Math.sin(v.x * 5 + ph[0]) * Math.sin(v.y * 4 + ph[1]) * Math.sin(v.z * 3 + ph[2] + seed);
    v.multiplyScalar(1 + n * 0.09);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
const s = {};
export default {
  chordAt: (S) => (S.p < 0.5 ? 4 : 6),
  duck: (S) => 1 - sstep(0.5, 0.85, S.p),
  build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.5; S.bloom.threshold = 0.7;
    scene.fog = new THREE.FogExp2(0x020203, SP ? 0.026 : 0.028);
    scene.add(new THREE.HemisphereLight(0x3c4352, 0x000000, 0.25));
    const key = new THREE.DirectionalLight(0xdfe4ec, 1.7); key.position.set(-7, 9, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8e98ab, 1.4); rim.position.set(9, 4, -5); scene.add(rim);
    // 石垣の形：幅 W・高さ H、下ほど手前へ張り出し、上は垂直に立つ（扇の勾配）
    const W = SP ? 6.4 : 10.5, H = SP ? 6.2 : 6.0, X0 = SP ? -3.2 : 0.2, Y0 = SP ? -1.5 : -3.0;
    const zOf = (y) => 3.4 * Math.pow(1 - clamp((y - Y0) / H), 2);
    const tilt = (y) => Math.atan(2 * 3.4 * (1 - clamp((y - Y0) / H)) / H);
    s.W = W; s.H = H; s.X0 = X0; s.Y0 = Y0;
    const stones = [];
    let y = Y0, row = 0;
    while (y < Y0 + H - 0.2) {
      const rh = Math.min(rr(0.42, 0.95) * lerp(1.2, 0.8, (y - Y0) / H), Y0 + H - y);
      let x = X0 - rr(0, 0.5);
      while (x < X0 + W) {
        const w = Math.min(rr(0.45, 1.5) * (rh / 0.6), X0 + W - x + 0.3);
        if (w < 0.3) break;
        const cy = y + rh / 2;
        const hh = rh * rr(0.82, 0.97), oy = rr(-0.04, 0.04);
        stones.push({ x: x + w / 2 + rr(-0.03, 0.03), y: cy + oy, z: zOf(cy) + rr(-0.06, 0.1), w: w * rr(0.9, 0.96), h: hh, d: rr(0.75, 1.0), tl: tilt(cy), rz: rr(-0.06, 0.06), row });
        x += w;
      }
      y += rh; row++;
    }
    s.rows = row;
    const NV = 5, geos = Array.from({ length: NV }, (_, i) => rockGeo(i));
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.05, flatShading: true });
    s.meshes = geos.map((g, i) => { const m = new THREE.InstancedMesh(g, mat, Math.ceil(stones.length / NV) + 1); m.count = 0; m.frustumCulled = false; scene.add(m); return m; });
    s.S = stones.map((st, i) => {
      const v = i % NV, m = s.meshes[v], idx = m.count++;
      const fr = SP ? new THREE.Vector3(rr(-4.5, 4.5), rr(-3, 8), rr(-6, 3)) : new THREE.Vector3(rr(-2.5, 13), rr(-4.5, 5.5), rr(-8, 4));
      const sc = rr(0.55, 0.8);   // ばらばらの時は小さく見える（遠く・小さく）
      return { ...st, m, idx, fr, sc, ax: new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize(), w0: rr(0.3, 1.2) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * TAU,
        ord: (st.row + rnd() * 0.9) / row, landed: false, yaw: rr(-0.04, 0.04) };
    });
    const col = new THREE.Color();
    s.S.forEach((st) => { const g = rr(0.17, 0.3); col.setRGB(g, g * 1.01, g * 1.05); st.m.setColorAt(st.idx, col); });
    s.meshes.forEach((m) => m.instanceColor && (m.instanceColor.needsUpdate = true));
    // 石垣全体を斜めに置き、端の反り（扇の勾配）が見えるようにする
    s.grp = new THREE.Group(); s.grp.rotation.y = SP ? -0.75 : -1.0; s.grp.position.set(SP ? 1.2 : 2.6, 0, SP ? -5 : -8); scene.add(s.grp);
    s.meshes.forEach((m) => s.grp.add(m));
    // 天端の朱
    s.top = new THREE.Vector3(X0 + W * 0.55, Y0 + H + 0.32, 0);
    s.core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(2), toneMapped: false }));
    s.core.position.copy(s.top); s.grp.add(s.core);
    s.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*70.)*.9+exp(-d*d*6.)*.08;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    s.glow.scale.setScalar(6); s.glow.position.copy(s.top); s.grp.add(s.glow);
    s.warm = new THREE.PointLight(0xff5a24, 0, 7, 1.6); s.warm.position.copy(s.top).add(new THREE.Vector3(0, 0.2, 0.6)); s.grp.add(s.warm);
    // 舞う砂粒（着地の時に少し跳ねる）
    s.dust = new THREE.InstancedMesh(new THREE.SphereGeometry(0.015, 5, 3), new THREE.MeshBasicMaterial({ color: 0x9aa0aa }), 120);
    s.dust.frustumCulled = false; s.grp.add(s.dust); s.du = Array.from({ length: 120 }, () => ({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 }));
    s.m4 = new THREE.Matrix4(); s.q = new THREE.Quaternion(); s.q2 = new THREE.Quaternion(); s.e = new THREE.Euler(); s.sv = new THREE.Vector3(); s.pv = new THREE.Vector3();
    s.ev = []; s.sigOn = false; s.done = 0;
  },
  frame(S) {
    const { camera, t, p, SP, dt } = S;
    const k = sstep(0.26, 0.74, p);
    s.k = k;
    let nd = 0;
    s.S.forEach((st) => {
      const a0 = 0.24 + st.ord * 0.44, kt = clamp((p - a0) / 0.07);
      // 飛んでくる：最後に少し沈んで収まる
      const e = kt < 1 ? 1 - Math.pow(1 - kt, 3) : 1;
      const settle = kt > 0.8 && kt < 1 ? Math.sin((kt - 0.8) / 0.2 * Math.PI) * 0.06 : 0;
      // ばらばら：それぞれの軸で転がり、それぞれの速さで漂う
      s.q.setFromAxisAngle(st.ax, t * st.w0 + st.ph);
      s.e.set(-st.tl, st.yaw, st.rz); s.q2.setFromEuler(s.e);
      s.q.slerp(s.q2, e);
      const fx = st.fr.x + Math.sin(t * 0.13 + st.ph) * 0.5, fy = st.fr.y + Math.sin(t * 0.21 + st.ph * 2) * 0.35, fz = st.fr.z;
      const arc = Math.sin(e * Math.PI) * 1.4;
      s.pv.set(lerp(fx, st.x, e), lerp(fy, st.y, e) + arc - settle, lerp(fz, st.z, e) + arc * 0.4);
      const sc = lerp(st.sc, 1, e);
      s.sv.set(st.w * sc, st.h * sc, st.d * sc);
      s.m4.compose(s.pv, s.q, s.sv); st.m.setMatrixAt(st.idx, s.m4);
      if (kt >= 1 && !st.landed) { st.landed = true; s.ev.push({ land: st.row }); puff(st); }
      if (kt < 0.5) st.landed = false;
      if (st.landed) nd++;
      // ばらばらの時：ときどき小石が擦れる音
      if (e < 0.05 && rnd() < 0.0018) s.ev.push({ click: 1 });
    });
    s.meshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    s.done = nd / s.S.length;
    // 砂粒
    s.du.forEach((q, i) => {
      if (q.life > 0) { q.life -= dt; q.v.y -= dt * 3; q.p.addScaledVector(q.v, dt); }
      const c = q.life > 0 ? Math.min(1, q.life * 2) : 0;
      s.m4.makeScale(c, c, c).setPosition(q.p); s.dust.setMatrixAt(i, s.m4);
    });
    s.dust.instanceMatrix.needsUpdate = true;
    // 朱
    const hv = sstep(0.72, 0.92, p);
    s.core.scale.setScalar(Math.max(0.001, hv * (1 + 0.08 * Math.sin(t * 2.3) + 0.04 * Math.sin(t * 7.1))));
    s.glow.lookAt(camera.position); s.glow.material.uniforms.uA.value = hv;
    s.warm.intensity = hv * 3.5;
    if (hv > 0.5 && !s.sigOn) { s.sigOn = true; s.ev.push({ sig: 1 }); } if (hv < 0.2) s.sigOn = false;
    // カメラ：散らばりを見渡す → 石垣を下から見上げる
    if (SP) {
      camera.position.set(lerp(0.5, 1.2, k) + Math.sin(t * 0.05) * 0.3, lerp(1.5, -0.6, k), lerp(20, 19, k));
      camera.lookAt(0, lerp(2.2, 2.0, k), 0);
      camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    } else {
      camera.position.set(lerp(-1, -1.5, k) + Math.sin(t * 0.05) * 0.4, lerp(1.6, -0.4, k), lerp(17, 17.5, k));
      camera.lookAt(lerp(4.5, 4.8, k), lerp(0.4, 0.8, k), lerp(-2, -3, k));
      camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.12, 0, innerWidth, innerHeight);
    }
  },
  sound: {
    init(S, o) {
      s.bus = A.bus(o, 0.5);
      s.drone = CH.map((m) => A.osc(o, 'sine', mtof(m), s.bus));
      s.lastLand = 0; s.rowsDone = new Set();
    },
    update(S, o) {
      const { ctx } = o, now = ctx.currentTime;
      A.set(o, s.bus.gain, 1, 0.3);
      s.ev.forEach((e) => {
        if (e.sig) { SND.lock && SND.lock(); return; }
        if (e.click) { A.noise(o, 0.05, 0.001, 0.02, 'bandpass', rr(2200, 5200), 6, s.bus); return; }
        if (e.land != null) {
          if (now - s.lastLand < 0.035) return; s.lastLand = now;
          // 着地の「ゴトッ」：はじめは高さも強さもばらばら → 段が上がるほど低い音へそろう
          const f = lerp(rr(70, 160), mtof(CH[0] + 12), sstep(0.2, 0.8, s.done || 0));
          A.tone(o, f, 'sine', 0.16, 0.003, 0.35, s.bus, f * 0.6);
          A.noise(o, 0.07, 0.002, 0.08, 'lowpass', 700, 0.8, s.bus);
          // 1段そろうごとに、和音の音が1つ鳴る
          const r = e.land;
          if (!s.rowsDone.has(r) && countRow(r) >= 0.95) { s.rowsDone.add(r); A.tone(o, mtof(CH[r % CH.length] + 24), 'sine', 0.03, 0.01, 3.5, s.bus); }
        }
      });
      s.ev.length = 0;
      // 石垣ができあがるほど、低い和音がひとつの響きとして太くなる
      const d = s.done || 0;
      s.drone.forEach((v, i) => A.set(o, v.g.gain, 0.03 * sstep(i * 0.15, i * 0.15 + 0.4, d) * (1 - i * 0.1), 0.8));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
function countRow(r) { let a = 0, b = 0; s.S.forEach((st) => { if (st.row === r) { a++; if (st.landed) b++; } }); return a ? b / a : 0; }
function puff(st) {
  for (let n = 0; n < 3; n++) {
    const q = s.du.find((x) => x.life <= 0); if (!q) return;
    q.p.set(st.x + rr(-st.w / 2, st.w / 2), st.y - st.h / 2, st.z + 0.4); q.v.set(rr(-0.6, 0.6), rr(0.2, 1.2), rr(0, 0.8)); q.life = rr(0.3, 0.7);
  }
}
