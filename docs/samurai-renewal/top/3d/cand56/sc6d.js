// 場面6 案D「星座→球」：暗闇に小さな三角（3つの星を結んだ小さな星座）が無数に浮かび、それぞれ勝手に回り、勝手に瞬く（短期・個別最適）
// → 1枚ずつ向きをそろえて寄り合い、全部が1つの大きな球の面になる。球はゆっくり1つの向きに回り、中心に朱が灯る（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';

const R = 3.1;                     // 球の半径
const CH = [48, 55, 60, 62, 64, 67, 72, 74, 76, 79];   // そろった後の音（Cadd9 の音だけ）
const s = {};
export default {
  chordAt: (S) => (S.p < 0.5 ? 2 : 6),
  duck: (S) => 1 - sstep(0.5, 0.85, S.p),
  build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.6; S.bloom.threshold = 0.45; S.bloom.radius = 0.45;
    // 球の面（正二十面体を細かく割った三角 180 枚）
    const ico = new THREE.IcosahedronGeometry(R, 2);
    const pa = ico.attributes.position.array, NT = pa.length / 9;
    s.NT = NT; s.T = [];
    for (let i = 0; i < NT; i++) {
      const v = [0, 1, 2].map((j) => new THREE.Vector3(pa[i * 9 + j * 3], pa[i * 9 + j * 3 + 1], pa[i * 9 + j * 3 + 2]));
      const c = v[0].clone().add(v[1]).add(v[2]).multiplyScalar(1 / 3);
      const loc = v.map((x) => x.clone().sub(c));
      // ばらばらの時の居場所：球より広い空間に散らばる
      const free = SP ? new THREE.Vector3(rr(-4.5, 4.5), rr(-5, 6.5), rr(-7, 2)) : new THREE.Vector3(rr(-2.2, 10), rr(-4.5, 4.5), rr(-8, 2.5));
      const ax = new THREE.Vector3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
      // 組み上がる順番：上の極から下へ（結晶が育つように）
      const ord = (1 - c.clone().normalize().dot(new THREE.Vector3(0.3, 0.9, 0.3).normalize())) / 2;
      s.T.push({ c, loc, free, ax, w: rr(0.6, 2.2) * (rnd() < 0.5 ? -1 : 1), ph: rnd() * TAU, fr: rr(0.7, 2.6), ord: ord * 0.85 + rnd() * 0.15, locked: false, last: 0 });
    }
    // 線（三角の3辺）と星（頂点）。毎フレーム CPU で位置を書き換える
    const lp = new Float32Array(NT * 6 * 3), lc = new Float32Array(NT * 6 * 3);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('color', new THREE.BufferAttribute(lc, 3));
    s.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    s.lines.frustumCulled = false; scene.add(s.lines); s.lp = lp; s.lc = lc;
    const pp = new Float32Array(NT * 3 * 3), pb = new Float32Array(NT * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('b', new THREE.BufferAttribute(pb, 1));
    s.pts = new THREE.Points(pg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uS: { value: SP ? 34 : 30 } },
      vertexShader: 'attribute float b;varying float vB;uniform float uS;void main(){vB=b;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=uS*(.35+b)/-mv.z;gl_Position=projectionMatrix*mv;}',
      fragmentShader: 'varying float vB;void main(){float d=length(gl_PointCoord-.5)*2.;float g=exp(-d*d*9.)*1.2+exp(-d*d*2.)*.15;gl_FragColor=vec4(vec3(.86,.89,.95)*g*vB,1.);}',
    }));
    s.pts.frustumCulled = false; scene.add(s.pts); s.pp = pp; s.pb = pb;
    // 面：組み上がった後にだけ、かすかに灰色の膜が張る
    const fp = new Float32Array(NT * 9);
    const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    s.face = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ color: 0x8a909c, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.face.frustumCulled = false; scene.add(s.face); s.fp = fp; s.fa = new Float32Array(NT);
    // 中心の朱
    s.core = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(2.2), toneMapped: false }));
    scene.add(s.core);
    s.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*60.)*.9+exp(-d*d*6.)*.08;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    s.glow.scale.setScalar(7); scene.add(s.glow);
    // 遠くの塵（奥行きのため）
    const dn = SP ? 500 : 900, dp = new Float32Array(dn * 3);
    for (let i = 0; i < dn; i++) { dp[i * 3] = rr(-40, 40); dp[i * 3 + 1] = rr(-25, 25); dp[i * 3 + 2] = rr(-60, -12); }
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    scene.add(new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x3a3f48, size: 0.06, sizeAttenuation: true })));
    s.root = new THREE.Group(); s.rq = new THREE.Quaternion(); s.q = new THREE.Quaternion(); s.qi = new THREE.Quaternion(); s.v = new THREE.Vector3(); s.cp = new THREE.Vector3();
    s.ev = []; s.rot = 0; s.sigOn = false;
  },
  frame(S) {
    const { camera, t, p, SP, dt } = S;
    const k = sstep(0.28, 0.72, p);          // 全体のそろい具合
    s.k = k;
    s.rot += dt * lerp(0.03, 0.09, k);
    s.rq.setFromAxisAngle(s.v.set(0.18, 1, 0.08).normalize(), s.rot);
    const ctr = s.cp.set(SP ? 0 : 2.4, SP ? 1.4 : 0.1, 0);
    let nl = 0;
    s.T.forEach((T, i) => {
      // この三角がそろう度合い（上から順に）
      const a0 = 0.26 + T.ord * 0.38, kt = sstep(a0, a0 + 0.12, p);
      const e = kt * kt * (3 - 2 * kt);
      // ばらばら：自分の軸で回り、ふらふら漂う
      s.q.setFromAxisAngle(T.ax, t * T.w + T.ph);
      const fx = T.free.x + Math.sin(t * 0.2 + T.ph) * 0.4, fy = T.free.y + Math.cos(t * 0.17 + T.ph * 1.3) * 0.4, fz = T.free.z;
      s.qi.copy(s.rq); s.q.slerp(s.qi, e);
      const cf = s.v.copy(T.c).applyQuaternion(s.rq).add(ctr);
      const px = lerp(fx, cf.x, e) , py = lerp(fy, cf.y, e) + Math.sin(e * Math.PI) * 0.6, pz = lerp(fz, cf.z, e);
      // 瞬き：ばらばらの時はそれぞれのリズムで、そろうと全体で1つの息
      const own = Math.pow(0.5 + 0.5 * Math.sin(t * T.fr * 2.2 + T.ph), 6);
      const whole = 0.55 + 0.25 * Math.sin(t * 0.9);
      const b = lerp(0.12 + own * 0.9, whole, e);
      if (own > 0.92 && T.last < 0.92 && e < 0.4 && rnd() < 0.35) s.ev.push('tw:' + i);
      T.last = own;
      if (kt > 0.97 && !T.locked) { T.locked = true; s.ev.push('lk:' + i); } else if (kt < 0.5) T.locked = false;
      if (T.locked) nl++;
      const wv = [];
      for (let j = 0; j < 3; j++) { const w = s.v.copy(T.loc[j]).applyQuaternion(s.q); wv.push([px + w.x, py + w.y, pz + w.z]); }
      for (let j = 0; j < 3; j++) {
        const o = (i * 3 + j) * 3; s.pp[o] = wv[j][0]; s.pp[o + 1] = wv[j][1]; s.pp[o + 2] = wv[j][2]; s.pb[i * 3 + j] = b * lerp(0.8, 0.4, e);
        const a = wv[j], c = wv[(j + 1) % 3], lo = (i * 6 + j * 2) * 3;
        s.lp.set(a, lo); s.lp.set(c, lo + 3);
        const lb = b * lerp(0.26, 0.16, e);
        for (let q = 0; q < 6; q++) s.lc[lo + q] = lb * (q % 3 === 2 ? 1.08 : 1);
        s.fp.set(a, i * 9 + j * 3);
      }
    });
    s.nl = nl / s.NT;
    s.lines.geometry.attributes.position.needsUpdate = true; s.lines.geometry.attributes.color.needsUpdate = true;
    s.pts.geometry.attributes.position.needsUpdate = true; s.pts.geometry.attributes.b.needsUpdate = true;
    s.face.geometry.attributes.position.needsUpdate = true;
    s.face.material.opacity = 0.035 * sstep(0.62, 0.9, p);
    // 朱
    const hv = sstep(0.7, 0.92, p);
    s.core.position.copy(ctr); s.core.scale.setScalar(Math.max(0.001, hv * (1 + 0.06 * Math.sin(t * 2))));
    s.glow.position.copy(ctr); s.glow.lookAt(camera.position); s.glow.material.uniforms.uA.value = hv;
    if (hv > 0.5 && !s.sigOn) { s.sigOn = true; s.ev.push('sig'); } if (hv < 0.2) s.sigOn = false;
    // カメラ：散らばりを広く見る → 球へ少し寄る
    const d = lerp(SP ? 19 : 15.5, SP ? 15.5 : 12.2, k);
    camera.position.set(lerp(-1.5, 0.8, k) + Math.sin(t * 0.05) * 0.5, lerp(1.2, 0.5, k), d);
    camera.lookAt(lerp(SP ? 0 : 2.2, ctr.x * 0.55, k), lerp(SP ? 1.4 : 0, ctr.y, k), 0);
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.12, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      s.bus = A.bus(o, 0.55);
      s.pad = CH.slice(0, 6).map((m) => A.osc(o, 'sine', mtof(m), s.bus));
      s.air = A.loop(o, 'bandpass', 3200, 0.8, s.bus);
    },
    update(S, o) {
      const k = s.k || 0;
      A.set(o, s.bus.gain, 1, 0.3);
      A.set(o, s.air.g.gain, 0.012 * (1 - k), 0.5);
      s.ev.forEach((e) => {
        if (e.startsWith('tw:')) {           // ばらばらの瞬き：音階に乗らない細い音（少しずつ音階へ寄る）
          const raw = 72 + rnd() * 26, q = CH.reduce((a, m) => (Math.abs(m + 12 - raw) < Math.abs(a - raw) ? m + 12 : a), 999);
          const m = lerp(raw, q, sstep(0.1, 0.5, k));
          A.tone(o, mtof(m), 'sine', 0.018, 0.003, rr(0.25, 0.6), s.bus);
        } else if (e.startsWith('lk:')) {    // 1枚はまるたび：和音の音が1つ足される
          if (rnd() < 0.5) { const m = CH[(+e.slice(3)) % CH.length] + 12; A.tone(o, mtof(m), 'triangle', 0.022, 0.01, 1.6, s.bus); }
        } else if (e === 'sig') { SND.lock && SND.lock(); }
      });
      s.ev.length = 0;
      // 組み上がった数だけ、ひとつの響き（和音）が太くなる
      const nl = s.nl || 0;
      s.pad.forEach((v, i) => A.set(o, v.g.gain, 0.022 * sstep(i / 8, i / 8 + 0.35, nl) * (1 - i * 0.08), 0.8));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
