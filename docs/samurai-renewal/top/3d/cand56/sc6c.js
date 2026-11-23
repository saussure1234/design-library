// 場面6 案C「歯車」：大小の歯車が宙でばらばらに、それぞれの速さで空回りし、ぶつかって軋む（短期・個別最適）
// → 1つずつ噛み合う位置へ収まり、小さな速い歯車から大きな遅い歯車へ力が渡り、全体がゆっくり1つの時を刻む。軸の朱が灯る（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const MOD = 0.095;   // 歯の大きさ（全部同じなので噛み合う）
function gearGeo(n) {
  const rp = MOD * n / 2, ro = rp + MOD * 0.95, ri = rp - MOD * 1.15, hole = Math.max(0.12, rp * 0.18);
  const sh = new THREE.Shape();
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, w = TAU / n;
    const pts = [[ri, a - w * 0.5], [ri, a - w * 0.27], [ro, a - w * 0.16], [ro, a + w * 0.16], [ri, a + w * 0.27]];
    pts.forEach(([r, aa], j) => { const x = Math.cos(aa) * r, y = Math.sin(aa) * r; if (k === 0 && j === 0) sh.moveTo(x, y); else sh.lineTo(x, y); });
  }
  sh.closePath();
  const h = new THREE.Path(); h.absarc(0, 0, hole, 0, TAU, true); sh.holes.push(h);
  // 大きい歯車は肉抜き（スポーク）
  if (n >= 30) {
    const sp = 5, r1 = hole + rp * 0.18, r2 = ri - rp * 0.12;
    for (let k = 0; k < sp; k++) {
      const a0 = (k / sp) * TAU + 0.16, a1 = ((k + 1) / sp) * TAU - 0.16;
      const p = new THREE.Path(); p.absarc(0, 0, r2, a0, a1, false); p.absarc(0, 0, r1, a1 - 0.08, a0 + 0.08, true); p.closePath(); sh.holes.push(p);
    }
  }
  const depth = 0.12 + Math.min(0.16, n * 0.0025);
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return { g, rp };
}
const s = {};
export default {
  chordAt: (S) => (S.p < 0.55 ? 2 : 6),
  duck: (S) => 1 - sstep(0.55, 0.85, S.p),
  build(S) {
    const { scene, renderer, SP } = S;
    S.bloom.strength = 0.55; S.bloom.threshold = 0.8;
    scene.fog = new THREE.FogExp2(0x020203, 0.03);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4f58, metalness: 0.8, roughness: 0.36, envMapIntensity: 0.5 });
    scene.add(new THREE.HemisphereLight(0x4a5262, 0x000000, 0.15));
    const key = new THREE.DirectionalLight(0xdfe5ee, 2.2); key.position.set(-5, 6, 7); scene.add(key);
    const rim = new THREE.DirectionalLight(0x8e98ab, 1.2); rim.position.set(6, 2, -6); scene.add(rim);
    // 歯車の列：大きい1つ（右）へ向かって、小さい速い歯車から順に噛み合う
    const teeth = SP ? [56, 12, 22, 10, 18, 9] : [64, 12, 24, 10, 20, 9, 14];
    const dirs = SP ? [0, 2.0, 1.75, 2.2, 1.8, 2.15] : [0, 2.45, 2.25, 2.6, 2.3, 2.55, 2.35];   // 1つ前からの向き（ラジアン）
    s.G = [];
    const base = new THREE.Vector3(SP ? 0.5 : 3.6, SP ? -0.4 : -2.4, 0);
    teeth.forEach((n, j) => {
      const { g, rp } = gearGeo(n);
      const m = new THREE.Mesh(g, mat); scene.add(m);
      const G = { m, n, rp, parent: j ? j - 1 : -1, th: dirs[j], slot: new THREE.Vector3(), free: new THREE.Vector3(rr(-0.5, 9), rr(-3.5, 4), rr(-6, 2)), freeRot: new THREE.Euler(rr(-1.2, 1.2), rr(-1.2, 1.2), 0), w: rr(2, 7) * (rnd() < 0.5 ? -1 : 1) / Math.sqrt(n / 10), phi: 0, ph: rnd() * TAU };
      if (j === 0) G.slot.copy(base);
      else { const P = s.G[j - 1]; G.slot.set(P.slot.x + Math.cos(G.th) * (P.rp + rp), P.slot.y + Math.sin(G.th) * (P.rp + rp), 0); }
      if (SP) G.free.set(rr(-3.5, 3.5), rr(-2, 6), rr(-6, 1));
      s.G.push(G);
    });
    // 大きい歯車の軸の朱と、ゆっくり回る長い針
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(3), toneMapped: false }));
    scene.add(hub); s.hub = hub;
    const hg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*30.)*1.6+exp(-d*d*4.)*.3;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    hg.scale.setScalar(5); scene.add(hg); s.hubG = hg;
    const handG = new THREE.BoxGeometry(0.05, 1, 0.03); handG.translate(0, 0.5, 0);
    s.hand = new THREE.Mesh(handG, new THREE.MeshBasicMaterial({ color: 0xc9ced8, transparent: true, opacity: 0 })); scene.add(s.hand);
    // 火花（ぶつかった所の白い粒）
    s.spk = new THREE.InstancedMesh(new THREE.SphereGeometry(0.02, 6, 4), new THREE.MeshBasicMaterial({ color: 0xe8ecf4, toneMapped: false }), 80);
    s.spk.frustumCulled = false; scene.add(s.spk); s.sp = []; for (let i = 0; i < 80; i++) s.sp.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), life: 0 });
    s.m4 = new THREE.Matrix4(); s.ev = []; s.e = new THREE.Euler(); s.q = new THREE.Quaternion(); s.q2 = new THREE.Quaternion(); s.ticks = s.G.map(() => 0); s.bigTick = 0;
    s.trainPhi = 0;
  },
  frame(S) {
    const { camera, t, p, SP, dt } = S;
    const k = sstep(0.3, 0.75, p);
    s.k = k;
    // 列の回転：大きい歯車がゆっくり、他は歯数の比で決まる
    const big = s.G[0];
    s.trainPhi += dt * 0.12 * sstep(0.4, 0.9, p) + dt * 0.02;
    const train = [s.trainPhi];
    for (let j = 1; j < s.G.length; j++) {
      const G = s.G[j], P = s.G[j - 1], th = G.th;
      const ai = (th - train[j - 1]) * P.n / TAU;
      train.push(th + Math.PI - (TAU / G.n) * (0.5 - ai));
    }
    let grind = 0;
    s.G.forEach((G, j) => {
      const kj = sstep(0.3 + j * 0.03, 0.5 + j * 0.03, p);
      G.kj = kj;
      // ばらばら：それぞれの速さで回り、ときどき引っかかって震える
      const stick = Math.max(0, Math.sin(t * 1.3 + G.ph)) > 0.92 ? 1 : 0;
      G.phi += dt * G.w * (1 - stick * 0.9);
      const jit = stick * 0.04 * (1 - kj);
      if (stick && kj < 0.3) { grind = Math.max(grind, 1); if (rnd() < 0.15) spark(G); }
      const pos = G.free.clone().lerp(G.slot, ease(kj));
      pos.z += Math.sin(kj * Math.PI) * 1.2;
      G.m.position.set(pos.x + (rnd() - 0.5) * jit, pos.y + (rnd() - 0.5) * jit, pos.z);
      s.e.set(G.freeRot.x + Math.sin(t * 0.3 + G.ph) * 0.2, G.freeRot.y + Math.cos(t * 0.25 + G.ph) * 0.2, 0);
      s.q.setFromEuler(s.e); s.q2.identity(); s.q.slerp(s.q2, ease(kj));
      G.m.quaternion.copy(s.q);
      const ang = kj > 0.999 ? train[j] : lerpAng(G.phi, train[j], ease(kj));
      G.m.rotateZ(ang);
      // 歯が1枚通るたびに刻む音
      const tc = Math.floor((kj > 0.5 ? train[j] : G.phi) * G.n / TAU);
      if (tc !== s.ticks[j]) { if (kj < 0.5 && rnd() < 0.5) s.ev.push('tick:' + j); s.ticks[j] = tc; }
    });
    s.grind = grind * (1 - k);
    // 大きい歯車が刻む大きな時
    const bt = Math.floor(s.trainPhi * big.n / TAU / 2);
    if (bt !== s.bigTick) { s.bigTick = bt; if (k > 0.5) s.ev.push('big'); }
    // 軸の朱と針
    const hv = sstep(0.62, 0.92, p);
    s.hub.position.copy(big.m.position); s.hub.position.z += 0.3; s.hub.scale.setScalar(Math.max(0.001, hv));
    s.hubG.position.copy(s.hub.position); s.hubG.material.uniforms.uA.value = hv; s.hubG.lookAt(camera.position);
    s.hand.position.copy(s.hub.position); s.hand.rotation.set(0, 0, -s.trainPhi * 0.6 + 0.8); s.hand.scale.set(1, big.rp * 0.92 * hv + 0.001, 1); s.hand.material.opacity = hv * 0.8;
    if (hv > 0.5 && !s.hubOn) { s.hubOn = true; s.ev.push('sig'); } if (hv < 0.2) s.hubOn = false;
    // 火花
    s.sp.forEach((q, i) => {
      if (q.life > 0) { q.life -= dt; q.v.y -= dt * 4; q.p.addScaledVector(q.v, dt); }
      const sc = q.life > 0 ? q.life * 2 : 0;
      s.m4.makeScale(sc, sc, sc).setPosition(q.p); s.spk.setMatrixAt(i, s.m4);
    });
    s.spk.instanceMatrix.needsUpdate = true;
    // カメラ
    const d = lerp(SP ? 17 : 13, SP ? 15 : 12, k);
    camera.position.set(lerp(-2, 0.6, k) + Math.sin(t * 0.06) * 0.6, lerp(1.5, 0.4, k), d);
    camera.lookAt(lerp(SP ? 0 : 3, SP ? 0.1 : 1.2, k), lerp(SP ? 2 : 0.3, SP ? 1.9 : 0.4, k), 0);
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.18, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.15, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      s.bus = A.bus(o, 0.35);
      s.gr = A.loop(o, 'bandpass', 1400, 3, s.bus);  // 擦れる音
      s.pad = [48, 55, 60, 64, 67].map((m) => A.osc(o, 'triangle', mtof(m), s.bus));
      s.lo = A.osc(o, 'sine', mtof(36), s.bus);
    },
    update(S, o) {
      const { ctx } = o, t = ctx.currentTime, k = s.k || 0;
      A.set(o, s.bus.gain, 1, 0.3);
      A.set(o, s.gr.g.gain, 0.12 * (s.grind || 0) + 0.015 * (1 - k), 0.05);
      s.gr.fl.frequency.setTargetAtTime(900 + Math.random() * 1600, t, 0.03);
      s.ev.forEach((e) => {
        if (e.startsWith('tick:')) {   // 歯車ごとに違う高さのカチ（ばらばらの拍）
          const j = +e.slice(5), f = 1400 + (s.G[j].n < 15 ? 2400 : 900) + j * 210;
          A.noise(o, 0.07, 0.001, 0.012, 'bandpass', f, 14, s.bus);
        } else if (e === 'big') {      // 全体の時：低いコトン＋鐘
          A.tone(o, 110, 'sine', 0.22, 0.003, 0.4, s.bus, 70);
          A.noise(o, 0.12, 0.001, 0.05, 'bandpass', 700, 6, s.bus);
          if (s.bigTick % 4 === 0) { A.tone(o, mtof(60), 'sine', 0.05, 0.01, 4, s.bus); A.tone(o, mtof(60) * 2.76, 'sine', 0.015, 0.01, 2.5, s.bus); }
        } else if (e === 'sig') { SND.lock && SND.lock(); }
      });
      s.ev.length = 0;
      A.set(o, s.lo.g.gain, 0.05 * k, 1);
      s.pad.forEach((v, i) => A.set(o, v.g.gain, 0.02 * sstep(0.55, 1, S.p) * (1 - i * 0.12), 1.2));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
function spark(G) {
  const q = s.sp.find((x) => x.life <= 0); if (!q) return;
  q.p.copy(G.m.position).add(new THREE.Vector3(Math.cos(G.phi), Math.sin(G.phi), 0).multiplyScalar(G.rp + 0.1));
  q.v.set(rr(-2, 2), rr(0, 3), rr(-1, 1)); q.life = rr(0.2, 0.5);
}
function ease(x) { x = clamp(x); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; }
function lerpAng(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
