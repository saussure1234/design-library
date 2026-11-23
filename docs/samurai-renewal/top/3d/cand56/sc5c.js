// 場面5 案C「糸が弦になる」：左右の暗がりから伸びた無数の糸が、1つの結び目を引っぱり合う（綱引き・総量は動かない）
// → 糸がほどけて1枚の織物に編まれ、交点ごとに朱が灯り、織物そのものが広がる。軋んでいた糸が、弦として鳴る
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG } from './base.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const s = {};
const M = 34;   // 1本の点の数
export default {
  chordAt: (S) => (S.p < 0.5 ? 2 : 7),
  duck: (S) => 1 - sstep(0.55, 0.85, S.p),
  build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.6; S.bloom.threshold = 0.8;
    scene.fog = new THREE.FogExp2(0x020203, 0.05);
    s.grp = new THREE.Group(); scene.add(s.grp);
    const K = SP ? 26 : 40;
    s.K = K; s.ropes = [];
    const half = K / 2;
    // 織物の目：縦横それぞれ half 本
    s.sp = SP ? 0.36 : 0.33;
    for (let j = 0; j < K; j++) {
      const side = j % 2 ? 1 : -1;
      const L = SP ? 6.5 : 9;
      const anchor = new THREE.Vector3(side * L * rr(0.85, 1.1), rr(-3.2, 3.2), rr(-3.5, 1.5));
      const pts = [], old = [];
      for (let i = 0; i < M; i++) { const f = i / (M - 1); const q = anchor.clone().lerp(new THREE.Vector3(), f); pts.push(q); old.push(q.clone()); }
      const geo = new LineGeometry(); geo.setPositions(new Float32Array(M * 3));
      const mat = new LineMaterial({ color: 0x8d939e, linewidth: SP ? 1.6 : 1.4, transparent: true, opacity: 0.9, worldUnits: false });
      const line = new Line2(geo, mat); line.frustumCulled = false; s.grp.add(line);
      const rest = anchor.length() * rr(1.0, 1.12) / (M - 1);
      // 織物での役目：偶数＝横糸 / 奇数＝縦糸
      const dir = j % 2; const idx = Math.floor(j / 2) - (half / 2 - 0.5);
      s.ropes.push({ anchor, a0: anchor.clone(), pts, old, geo, mat, line, rest, side, dir, idx, ph: rnd() * TAU, lock: 0, locked: false });
    }
    // 結び目（こぶ）：黒く濡れたかたまり
    const kg = new THREE.IcosahedronGeometry(0.55, 5);
    { const pa = kg.attributes.position; const v = new THREE.Vector3(); for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const n = 1 + 0.22 * Math.sin(v.x * 9) * Math.sin(v.y * 8 + 1) * Math.sin(v.z * 10) + 0.12 * Math.sin(v.x * 23 + v.y * 17); v.multiplyScalar(n); pa.setXYZ(i, v.x, v.y, v.z); } kg.computeVertexNormals(); }
    s.knot = new THREE.Mesh(kg, new THREE.MeshPhysicalMaterial({ color: 0x1a1c21, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05 }));
    s.grp.add(s.knot);
    scene.add(new THREE.HemisphereLight(0x5a6272, 0x000000, 0.25));
    const key = new THREE.DirectionalLight(0xdfe5ef, 1.1); key.position.set(-3, 5, 6); scene.add(key);
    const rim = new THREE.PointLight(0xb8c2d4, 30, 12, 1.5); rim.position.set(1.5, 1.5, -2); scene.add(rim);
    // 粘りのしずく（糸の上の小さな玉）
    const dg = new THREE.SphereGeometry(1, 12, 8);
    s.beads = new THREE.InstancedMesh(dg, new THREE.MeshPhysicalMaterial({ color: 0x9aa1ad, roughness: 0.1, clearcoat: 1, transmission: 0, metalness: 0 }), K * 4);
    s.beads.frustumCulled = false; s.grp.add(s.beads);
    s.beadAt = []; for (let j = 0; j < K; j++) for (let b = 0; b < 4; b++) s.beadAt.push([j, 4 + Math.floor(rnd() * (M - 8)), rr(0.025, 0.06)]);
    // 交点の朱
    const nI = (half) * (half);
    s.nodes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(2.2), transparent: true, toneMapped: false }), nI);
    s.nodes.frustumCulled = false; s.grp.add(s.nodes);
    s.nodeOrder = [];
    for (let a = 0; a < half; a++) for (let b = 0; b < half; b++) { const x = (a - (half / 2 - 0.5)) * s.sp, y = (b - (half / 2 - 0.5)) * s.sp; s.nodeOrder.push({ x, y, r: Math.hypot(x, y) }); }
    s.nodeOrder.sort((u, v) => u.r - v.r);
    s.knotPos = new THREE.Vector3(); s.ev = []; s.m4 = new THREE.Matrix4(); s.v = new THREE.Vector3(); s.tgt = new THREE.Vector3();
    s.lit = 0;
  },
  resize(S) { s.ropes.forEach((r) => r.mat.resolution.set(innerWidth, innerHeight)); },
  frame(S) {
    const { camera, t, p, SP, dt } = S;
    const k = sstep(0.4, 0.78, p);
    const half = s.K / 2;
    // 綱引き：結び目が左右へ引きずられる（急に、粘って）
    const tug = Math.tanh(2.6 * Math.sin(t * 0.55) + 0.8 * Math.sin(t * 1.7)) * 1.3;
    const jerk = Math.sin(t * 9) * 0.04 * Math.abs(Math.cos(t * 0.55));
    s.knotPos.set((tug + jerk) * (1 - k), Math.sin(t * 0.8) * 0.15 * (1 - k), 0);
    if (Math.sign(tug) !== s.lastSide && Math.abs(tug) > 0.6 && k < 0.3) { s.lastSide = Math.sign(tug); s.ev.push('jerk'); }
    s.knot.position.copy(s.knotPos);
    s.knot.scale.setScalar(Math.max(0.001, 1 - sstep(0.4, 0.6, p)));
    s.knot.rotation.set(t * 0.3, t * 0.2, 0);
    // 織物の広がり（総量が増える）
    const Rw = (half / 2) * s.sp * 1.02;
    const scaleW = 0.78 + 0.3 * sstep(0.7, 1, p);
    s.grp.rotation.y = lerp(-0.85, 0.3, k);
    const g = 1.2;
    let tension = 0;
    s.ropes.forEach((r, j) => {
      // 自分の番が来たら織物へ
      const kj = sstep(0.4 + (j / s.K) * 0.25, 0.55 + (j / s.K) * 0.25, p);
      r.lock = kj;
      if (kj > 0.97 && !r.locked) { r.locked = true; s.ev.push('pluck:' + j); }
      if (kj < 0.5) r.locked = false;
      // 引っぱる側：勝っている側の手元は後ろへ下がる
      const win = r.side * Math.sign(tug) > 0 ? 1 : 0;
      r.anchor.copy(r.a0); r.anchor.x += r.side * win * 0.8 * Math.abs(tug) * (1 - k);
      r.anchor.y += Math.sin(t * 0.9 + r.ph) * 0.15;
      // 物理（ベルレ）：両端は固定
      const P = r.pts, O = r.old;
      for (let i = 1; i < M - 1; i++) {
        const q = P[i], o = O[i];
        const vx = (q.x - o.x) * 0.96, vy = (q.y - o.y) * 0.96, vz = (q.z - o.z) * 0.96;
        o.copy(q); q.x += vx; q.y += vy - g * dt * dt; q.z += vz;
      }
      P[0].copy(r.anchor); P[M - 1].copy(s.knotPos);
      for (let it = 0; it < 14; it++) {
        for (let i = 0; i < M - 1; i++) {
          const a = P[i], b = P[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z; const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const df = (d - r.rest) / d * 0.5;
          if (i > 0) { a.x += dx * df; a.y += dy * df; a.z += dz * df; }
          if (i + 1 < M - 1) { b.x -= dx * df; b.y -= dy * df; b.z -= dz * df; }
        }
      }
      // 張り具合
      let len = 0; for (let i = 0; i < M - 1; i++) len += P[i].distanceTo(P[i + 1]);
      const ten = clamp((len / ((M - 1) * r.rest) - 0.98) * 12);
      tension = Math.max(tension, ten * (1 - k));
      // 織物の位置（横糸＝y一定 / 縦糸＝x一定、上下にくぐる）
      const arr = r.geo.attributes.instanceStart.data.array;
      const c = r.idx * s.sp * scaleW;
      const span = Math.sqrt(Math.max(0.0001, Rw * Rw * scaleW * scaleW - c * c));
      for (let i = 0; i < M; i++) {
        const f = i / (M - 1);
        const u = lerp(-span, span, f);
        const wv = Math.sin((u / (s.sp * scaleW)) * Math.PI + (r.idx % 2) * Math.PI) * 0.05 * (r.dir ? 1 : -1);
        if (r.dir === 0) s.tgt.set(u, c, wv); else s.tgt.set(c, u, wv);
        s.tgt.z += Math.sin(t * 0.8 + u * 0.6 + c) * 0.08 * kj;   // 呼吸する布
        const q = s.v.copy(P[i]).lerp(s.tgt, ease(kj));
        if (kj > 0) { P[i].lerp(s.tgt, kj * 0.5); O[i].copy(P[i]); }
        if (i < M - 1) { arr[i * 6] = q.x; arr[i * 6 + 1] = q.y; arr[i * 6 + 2] = q.z; }
        if (i > 0) { arr[(i - 1) * 6 + 3] = q.x; arr[(i - 1) * 6 + 4] = q.y; arr[(i - 1) * 6 + 5] = q.z; }
      }
      r.geo.attributes.instanceStart.data.needsUpdate = true;
      const br = 0.45 + 0.55 * ten * (1 - k) + 0.25 * kj;
      r.mat.color.setRGB(0.42 * br + 0.1, 0.45 * br + 0.1, 0.5 * br + 0.12);
      r.mat.linewidth = (SP ? 1.6 : 1.4) * (1 + 0.6 * ten * (1 - k)) + kj * 0.4;
      if (r.mat.resolution.x < 2) r.mat.resolution.set(innerWidth, innerHeight);
    });
    s.tension = tension;
    // しずく
    s.beadAt.forEach(([j, i, rad], n) => {
      const r = s.ropes[j]; const arr = r.geo.attributes.instanceStart.data.array;
      const sc = rad * (1 - r.lock) * (1 + 0.2 * Math.sin(t * 2 + n));
      s.m4.makeScale(sc, sc * 1.3, sc).setPosition(arr[i * 6], arr[i * 6 + 1] - sc * 0.6, arr[i * 6 + 2]);
      s.beads.setMatrixAt(n, s.m4);
    });
    s.beads.instanceMatrix.needsUpdate = true;
    // 交点の朱：内側から順に灯る
    const lit = Math.floor(s.nodeOrder.length * sstep(0.6, 0.96, p));
    if (lit > s.lit + 3) { s.ev.push('glow'); s.lit = lit; } if (lit < s.lit) s.lit = lit;
    s.nodeOrder.forEach((nd, n) => {
      const on = n < lit && nd.r * scaleW < Rw * scaleW * 0.98 ? 1 : 0;
      const sc = on * (0.035 + 0.015 * Math.sin(t * 3 + n)) * (SP ? 1.2 : 1);
      s.m4.makeScale(sc, sc, sc).setPosition(nd.x * scaleW, nd.y * scaleW, 0.02);
      s.nodes.setMatrixAt(n, s.m4);
    });
    s.nodes.instanceMatrix.needsUpdate = true;
    // カメラ
    const d = lerp(SP ? 15 : 12.5, SP ? 17 : 15, k);
    const yaw = lerp(0.25, -0.35, k) + Math.sin(t * 0.06) * 0.08;
    camera.position.set(Math.sin(yaw) * d, lerp(1.2, 2.2, k), Math.cos(yaw) * d);
    camera.lookAt(0, 0, 0);
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.17, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      const { ctx } = o;
      s.bus = A.bus(o, 0.35);
      // 糸の軋み：のこぎり波の摩擦（張力で強く・不規則に）
      s.cr = A.osc(o, 'sawtooth', 40, null); s.crF = ctx.createBiquadFilter(); s.crF.type = 'bandpass'; s.crF.Q.value = 8; s.crF.frequency.value = 900;
      s.cr.g.disconnect(); s.cr.g.connect(s.crF); s.crF.connect(s.bus);
      // 低い踏ん張り
      s.lo = A.osc(o, 'sawtooth', mtof(31), null); s.loF = ctx.createBiquadFilter(); s.loF.type = 'lowpass'; s.loF.frequency.value = 220; s.lo.g.disconnect(); s.lo.g.connect(s.loF); s.loF.connect(s.bus);
      s.lo2 = A.osc(o, 'sawtooth', mtof(32), s.loF);
      s.pad = [50, 57, 62, 66, 69].map((m) => A.osc(o, 'sine', mtof(m), s.bus));
      s.nc = 0;
    },
    update(S, o) {
      const { ctx } = o, t = ctx.currentTime, z = 1 - sstep(0.4, 0.7, S.p), k = sstep(0.6, 0.95, S.p);
      A.set(o, s.bus.gain, 1, 0.3);
      const ten = s.tension || 0;
      s.cr.x.frequency.setTargetAtTime(22 + ten * 40 + Math.random() * 18, t, 0.03);
      s.crF.frequency.setTargetAtTime(600 + ten * 1400 + Math.random() * 300, t, 0.05);
      A.set(o, s.cr.g.gain, (0.05 + 0.18 * ten) * z * (Math.random() < 0.7 ? 1 : 0.2), 0.04);
      A.set(o, s.lo.g.gain, 0.05 * z, 0.4); A.set(o, s.lo2.g.gain, 0.04 * z, 0.4);
      // ねばる手ざわり（細かいきしみ）
      if (z > 0.1 && t > s.nc) { s.nc = t + 0.06 + Math.random() * 0.25; A.noise(o, 0.07 * z * (0.4 + ten), 0.005, 0.05, 'bandpass', 1800 + Math.random() * 1500, 10, s.bus); }
      const PL = [50, 52, 54, 57, 59, 62, 64, 66, 69, 71, 74];
      s.ev.forEach((e) => {
        if (e === 'jerk') { A.tone(o, 90, 'sawtooth', 0.12, 0.01, 0.35, s.loF, 60); A.noise(o, 0.2, 0.01, 0.3, 'lowpass', 1600, 6, s.bus, 300); }
        else if (e.startsWith('pluck:')) {   // 糸が弦として鳴る
          const j = +e.slice(6); const f = mtof(PL[(j * 3) % PL.length]);
          A.tone(o, f, 'triangle', 0.08, 0.003, 2.4, s.bus); A.tone(o, f * 2, 'sine', 0.03, 0.003, 1.2, s.bus); A.noise(o, 0.05, 0.001, 0.02, 'highpass', 3000, 1, s.bus);
        } else if (e === 'glow') A.tone(o, mtof(86 + ((Math.random() * 3) | 0) * 2), 'sine', 0.015, 0.01, 1.6, s.bus);
      });
      s.ev.length = 0;
      s.pad.forEach((v, i) => A.set(o, v.g.gain, 0.026 * k * (1 - i * 0.1), 1));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
function ease(x) { return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
