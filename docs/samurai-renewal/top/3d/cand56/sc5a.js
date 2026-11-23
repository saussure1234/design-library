// 場面5 案A「人の山」：黒い柱に人がしがみつき、上の1人ぶんの光を奪い合う（ゼロサム）
// → 柱が沈み、全員が床に降りて手をつなぐ輪になる。輪の中の朱の光（笑顔の総量）が育つ（プラスサム）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG } from './base.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadHuman, makeBody, pose, v3 } from './human.js';

const CLIMB = {   // 柱にしがみついて上へ手を伸ばす
  spine03: v3(0, 1, 0.12), spine01: v3(0, 1, 0.2), neck01: v3(0, 1, 0.05), head: v3(0, 1, -0.25),
  upperarm01L: v3(0.25, 1, 0.35), lowerarm01L: v3(0.1, 1, 0.3), upperarm01R: v3(-0.25, 1, 0.35), lowerarm01R: v3(-0.1, 1, 0.3),
  upperleg01L: v3(0.1, -0.7, 0.6), lowerleg01L: v3(0.05, -1, -0.15), upperleg01R: v3(-0.1, -0.9, 0.2), lowerleg01R: v3(-0.05, -1, -0.4),
};
const CLIMB2 = {  // もう片方の手足（交互に動かす）
  spine03: v3(0, 1, 0.18), spine01: v3(0.1, 1, 0.25), neck01: v3(0, 1, 0), head: v3(0, 1, -0.35),
  upperarm01L: v3(0.35, 0.6, 0.6), lowerarm01L: v3(0.1, 0.2, 1), upperarm01R: v3(-0.15, 1, 0.2), lowerarm01R: v3(-0.05, 1, 0.1),
  upperleg01L: v3(0.1, -0.9, 0.2), lowerleg01L: v3(0.05, -1, -0.4), upperleg01R: v3(-0.1, -0.6, 0.7), lowerleg01R: v3(-0.05, -1, -0.1),
};
const TOP = {     // 頂上：光に向かって両手を上げる
  spine03: v3(0, 1, -0.05), spine01: v3(0, 1, -0.15), neck01: v3(0, 1, -0.2), head: v3(0, 1, -0.4),
  upperarm01L: v3(0.35, 1, -0.05), lowerarm01L: v3(0.2, 1, 0), upperarm01R: v3(-0.35, 1, -0.05), lowerarm01R: v3(-0.2, 1, 0),
  upperleg01L: v3(0.08, -1, 0), lowerleg01L: v3(0.05, -1, 0), upperleg01R: v3(-0.08, -1, 0), lowerleg01R: v3(-0.05, -1, 0),
};
const FALL = {    // 引きずり落とされる
  spine03: v3(0, 1, -0.4), spine01: v3(0, 1, -0.6), neck01: v3(0, 0.6, -0.8), head: v3(0, 0.4, -1),
  upperarm01L: v3(0.9, 0.8, -0.3), lowerarm01L: v3(0.6, 1, 0.3), upperarm01R: v3(-0.9, 0.6, 0.2), lowerarm01R: v3(-0.5, 1, 0.5),
  upperleg01L: v3(0.3, -0.6, 0.7), lowerleg01L: v3(0.1, -1, 0.1), upperleg01R: v3(-0.2, -0.8, -0.4), lowerleg01R: v3(-0.1, -1, -0.2),
};
const RING = {    // 隣と手をつなぐ
  spine03: v3(0, 1, 0), spine01: v3(0, 1, 0.04), neck01: v3(0, 1, 0.1), head: v3(0, 1, 0.06),
  upperarm01L: v3(1, -0.5, 0.3), lowerarm01L: v3(1, -0.3, 0.42), upperarm01R: v3(-1, -0.5, 0.3), lowerarm01R: v3(-1, -0.3, 0.42),
  upperleg01L: v3(0.04, -1, 0), lowerleg01L: v3(0.04, -1, -0.02), upperleg01R: v3(-0.04, -1, 0), lowerleg01R: v3(-0.04, -1, -0.02),
};
const mix = (P, Q, k) => { const o = {}; for (const n in P) o[n] = P[n].clone().normalize().lerp(Q[n].clone().normalize(), k); return o; };

const PH = 6.6, PR = 0.85;    // 柱の高さ・太さ
const s = {};
export default {
  shadows: true,
  chordAt: (S) => (S.p < 0.5 ? 4 : 7),
  duck: (S) => 1 - sstep(0.5, 0.75, S.p),
  async build(S) {
    const { scene, renderer, SP } = S;
    scene.fog = new THREE.FogExp2(0x020203, 0.035);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
    S.bloom.strength = 0.55; S.bloom.threshold = 0.85;
    const g = await loadHuman();
    // 濡れた石膏（粘りの照り）
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x777b84, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 0.6, sheen: 0.4, sheenColor: new THREE.Color(0x9aa3b4) });
    s.mat = mat;
    const N = SP ? 18 : 28;
    s.bodies = [];
    for (let i = 0; i < N; i++) {
      const b = makeBody(g, mat); scene.add(b.root);
      b.ph = rnd() * TAU; b.sp = rr(0.7, 1.3); b.lean = rr(-0.25, 0.25);
      b.ringI = i; s.bodies.push(b);
    }
    s.N = N;
    // 柱（黒い石・上に1人ぶんの台）
    const pmat = new THREE.MeshPhysicalMaterial({ color: 0x07080a, roughness: 0.22, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.5 });
    s.pillar = new THREE.Group(); scene.add(s.pillar);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(PR * 0.86, PR * 1.1, PH, 48, 1), pmat); col.position.y = PH / 2; col.castShadow = col.receiveShadow = true; s.pillar.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(PR * 1.0, PR * 0.86, 0.14, 48), pmat); cap.position.y = PH + 0.07; cap.receiveShadow = true; s.pillar.add(cap);
    // 床（黒い水面のような照り）
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 96), new THREE.MeshStandardMaterial({ color: 0x060607, roughness: 0.6, metalness: 0, envMapIntensity: 0 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    // 光：頂上だけを照らす冷たいスポット（1人ぶん）
    scene.add(new THREE.HemisphereLight(0x3a4250, 0x000000, 0.05));
    const top = new THREE.SpotLight(0xe4ebf5, 260, 12.5, 0.2, 0.55, 1.6); top.position.set(0.4, PH + 9, 1.2); top.target.position.set(0, PH, 0);
    top.castShadow = true; top.shadow.mapSize.set(1024, 1024); top.shadow.bias = -0.0004; scene.add(top, top.target); s.top = top;
    // 縁の光（体の輪郭を出す冷たい灰）
    const rim = new THREE.DirectionalLight(0x8792a6, 0.55); rim.position.set(-6, 5, -8); scene.add(rim); s.rim = rim;
    const rim2 = new THREE.DirectionalLight(0x5c6578, 0.35); rim2.position.set(7, 2, -4); scene.add(rim2);
    // 頂上の光の筋（空気中の塵）
    const coneG = new THREE.ConeGeometry(1.9, 9, 48, 1, true); coneG.translate(0, -4.5, 0);
    const cone = new THREE.Mesh(coneG, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0.12 } },
      vertexShader: 'varying float vY;varying vec3 vN,vV;void main(){vY=position.y;vec4 w=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-w.xyz);gl_Position=projectionMatrix*w;}',
      fragmentShader: 'uniform float uA;varying float vY;varying vec3 vN,vV;void main(){float f=pow(abs(dot(vN,vV)),2.);float y=clamp(1.+vY/9.,0.,1.);gl_FragColor=vec4(vec3(.8,.85,.92)*uA*f*y*y,1.);}',
    }));
    cone.position.set(0.4, PH + 9, 1.2); cone.lookAt(0, PH, 0); cone.rotateX(-Math.PI / 2); scene.add(cone); s.cone = cone;
    // 輪の中心の朱（笑顔の総量）
    s.warm = new THREE.PointLight(SIG, 0, 30, 1.4); s.warm.position.set(0, 0.6, 0); scene.add(s.warm);
    const gl = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*6.)*1.4+exp(-d*d*60.)*2.;gl_FragColor=vec4(vec3(1.,.36,.13)*g*uA,1.);}',
    }));
    gl.rotation.x = -Math.PI / 2; gl.position.y = 0.02; scene.add(gl); s.glow = gl;
    s.joinT = new Array(N).fill(0);
    s.R = 1.45 / (2 * Math.sin(Math.PI / N));
    s.look = new THREE.Vector3(); s.cam = new THREE.Vector3();
    s.lastFall = -1;
  },
  frame(S) {
    const { camera, t, p, SP } = S;
    const k = sstep(0.42, 0.8, p);           // ゼロサム→プラスサム
    const N = s.N;
    s.events = s.events || [];
    // 柱が沈む
    s.pillar.position.y = -k * (PH + 0.3);
    s.top.intensity = 260 * (1 - sstep(0.4, 0.62, p));
    s.cone.material.uniforms.uA.value = 0.12 * (1 - sstep(0.4, 0.6, p));
    const climbT = t * 0.011 * (1 - k);
    s.clock = (s.clock || 0) + S.dt * 0.011 * (1 - k * 0.98);
    const tmp = new THREE.Vector3(), tmpB = new THREE.Vector3();
    s.bodies.forEach((b, i) => {
      // 自分の番号ごとに少し遅れて輪へ
      const ki = sstep(0.42 + (i / N) * 0.22, 0.56 + (i / N) * 0.22, p);
      // 柱の上の位置：らせん上を登り、頂上で立ち、引きずり落とされて下へ戻る
      const u = (i / N + s.clock) % 1;
      const ang = i * 2.399 + u * 2.2;
      let pos, P, rotY, tiltX = 0, roll = 0;
      const wig = Math.sin(t * 2.2 * b.sp + b.ph), wig2 = Math.sin(t * 1.3 * b.sp + b.ph * 1.7);
      if (u < 0.9) {
        const hh = 0.05 + (u / 0.9) * (PH - 1.55);
        const rad = PR + 0.3 + Math.sin(u * 30 + b.ph) * 0.06;
        pos = tmp.set(Math.cos(ang) * rad, hh, Math.sin(ang) * rad);
        rotY = -ang - Math.PI / 2;   // 柱の方を向く
        tiltX = 0.22 + wig2 * 0.05; roll = b.lean * 0.4 + wig * 0.05;
        P = mix(CLIMB, CLIMB2, 0.5 + 0.5 * wig);
      } else if (u < 0.955) {      // 頂上
        const a2 = ang;
        pos = tmp.set(Math.cos(a2) * 0.15, PH + 0.14, Math.sin(a2) * 0.15);
        rotY = -a2 + Math.PI / 2 + 0.6; P = mix(TOP, CLIMB2, 0.15 + 0.1 * wig);
      } else {                     // 落ちる（外へ放物線）
        const f = (u - 0.955) / 0.045;
        if (b.fallId !== Math.floor((i / N + s.clock))) { b.fallId = Math.floor((i / N + s.clock)); if (k < 0.3) s.events.push('fall'); }
        const out = 0.2 + f * 3.0;
        pos = tmp.set(Math.cos(ang) * out, PH + 0.14 + f * 0.8 - f * f * (PH + 0.8), Math.sin(ang) * out);
        rotY = -ang + Math.PI / 2; tiltX = -f * 2.2; roll = f * 1.4; P = FALL;
      }
      // 輪の位置
      const ra = (b.ringI / N) * TAU + t * 0.02 * k;
      const R = s.R * (0.92 + 0.08 * k);
      const ring = tmpB.set(Math.cos(ra) * R, 0, Math.sin(ra) * R);
      const ringRot = -ra - Math.PI / 2;
      // 混ぜる（途中は少し宙を通る）
      b.root.position.copy(pos).lerp(ring, ki); b.root.position.y += Math.sin(ki * Math.PI) * 1.2 - 0 * ki;
      if (ki > 0.999) b.root.position.y = 0;
      const ry = lerpAng(rotY, ringRot, ki);
      b.root.rotation.set(0, 0, 0); b.root.rotateY(ry); b.root.rotateX(tiltX * (1 - ki)); b.root.rotateZ(roll * (1 - ki));
      const R2 = { ...RING };
      // つないだ手が少し揺れる（呼吸）
      const br = Math.sin(t * 0.9 + i * 0.5) * 0.04;
      R2.upperarm01L = v3(1, -0.5 + br, 0.3); R2.upperarm01R = v3(-1, -0.5 + br, 0.3);
      pose(b, P, R2, ki);
      if (ki > 0.98 && !s.joinT[i]) { s.joinT[i] = 1; s.events.push('join:' + i); }
      if (ki < 0.5) s.joinT[i] = 0;
    });
    // 中心の朱が育つ
    const joined = s.joinT.reduce((a, c) => a + c, 0) / N;
    s.jn = joined;
    const gw = sstep(0.6, 1, p) * (0.4 + 0.6 * joined);
    s.warm.intensity = gw * 140;
    s.glow.material.uniforms.uA.value = gw * 1.1;
    s.glow.scale.setScalar(1 + gw * s.R * 0.9);
    // カメラ：下から柱を見上げる → 上から輪を見下ろす
    const orb = t * 0.035;
    const d0 = SP ? 19 : 16.5, d1 = SP ? 23 : 18;
    const dist = lerp(d0, d1, k), h = lerp(2.2, 11, k);
    s.cam.set(Math.sin(orb) * dist, h, Math.cos(orb) * dist);
    camera.position.copy(s.cam);
    s.look.set(0, lerp(PH * 0.56, 0.4, k), 0);
    camera.lookAt(s.look);
    // 文字の側（左）を空ける：PC は主役を右へ、スマホは上へ
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * lerp(0.2, 0.16, k), innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.17, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      const { ctx } = o;
      s.bus = A.bus(o, 0.35);
      // 張りつめたうなり（半音でぶつかる低音）
      s.dr = [A.osc(o, 'sawtooth', mtof(38), null), A.osc(o, 'sawtooth', mtof(39), null)];
      s.drF = ctx.createBiquadFilter(); s.drF.type = 'lowpass'; s.drF.frequency.value = 260; s.drF.Q.value = 2;
      s.dr.forEach((d) => { d.g.disconnect(); d.g.connect(s.drF); }); s.drF.connect(s.bus);
      // うめき（人の声に近い低いのこぎり波・ビブラート）
      s.moan = A.osc(o, 'sawtooth', 110, null); s.moanF = ctx.createBiquadFilter(); s.moanF.type = 'bandpass'; s.moanF.frequency.value = 520; s.moanF.Q.value = 3;
      s.moan.g.disconnect(); s.moan.g.connect(s.moanF); s.moanF.connect(s.bus);
      // ざわめきの地（帯域ノイズ）
      s.mur = A.loop(o, 'bandpass', 900, 1.2, s.bus);
      // 輪の和音
      s.warmV = [62, 66, 69, 74].map((m) => A.osc(o, 'triangle', mtof(m), s.bus));
      s.nextSyl = 0; s.nextCreak = 0; s.nextSq = 0;
    },
    update(S, o) {
      const { ctx } = o, t = ctx.currentTime, p = S.p, z = 1 - sstep(0.42, 0.75, p), k = sstep(0.5, 0.85, p);
      A.set(o, s.bus.gain, 1, 0.3);
      s.dr.forEach((d) => A.set(o, d.g.gain, 0.05 * z, 0.4));
      s.moan.x.frequency.setTargetAtTime(100 + Math.sin(S.t * 0.7) * 14 + Math.sin(S.t * 5.3) * 4, t, 0.1);
      A.set(o, s.moan.g.gain, 0.05 * z * (0.5 + 0.5 * Math.sin(S.t * 0.37)), 0.3);
      A.set(o, s.mur.g.gain, 0.09 * z, 0.4);
      s.mur.fl.frequency.setTargetAtTime(700 + Math.sin(S.t * 3.1) * 300, t, 0.05);
      // ざわめき：短い「音節」をばらばらに（母音の帯域）
      if (z > 0.05 && t > s.nextSyl) {
        s.nextSyl = t + 0.03 + Math.random() * 0.07;
        const f1 = [380, 520, 650, 780][(Math.random() * 4) | 0], f2 = f1 * (2 + Math.random() * 1.6);
        A.noise(o, 0.11 * z, 0.015, 0.06 + Math.random() * 0.12, 'bandpass', f1, 9, s.bus, f1 * (0.8 + Math.random() * 0.4));
        A.noise(o, 0.06 * z, 0.015, 0.05 + Math.random() * 0.1, 'bandpass', f2, 12, s.bus);
      }
      // 軋み（登る体がこすれる）
      if (z > 0.1 && t > s.nextCreak) {
        s.nextCreak = t + 0.5 + Math.random() * 1.4;
        const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 500 + Math.random() * 500; fl.Q.value = 7; fl.connect(s.bus);
        A.tone(o, 28 + Math.random() * 12, 'sawtooth', 0.22 * z, 0.08, 0.5 + Math.random() * 0.4, fl, 45 + Math.random() * 30);
      }
      // ねちょっとした音（共鳴の強いローパスを速く開閉）
      if (z > 0.1 && t > s.nextSq) {
        s.nextSq = t + 0.25 + Math.random() * 0.9;
        A.noise(o, 0.2 * z, 0.01, 0.12, 'lowpass', 260, 18, s.bus, 1300 + Math.random() * 800);
        A.noise(o, 0.12 * z, 0.06, 0.1, 'lowpass', 900, 16, s.bus, 180);
      }
      // 出来事
      (s.events || []).forEach((e) => {
        if (e === 'fall') {
          A.tone(o, 380, 'sine', 0.06, 0.02, 0.9, s.bus, 90);
          A.noise(o, 0.12, 0.3, 0.6, 'bandpass', 600, 2, s.bus, 2600);   // ざわめきが沸く
          setTimeout(() => { A.tone(o, 70, 'sine', 0.35, 0.005, 0.5, s.bus, 32); A.noise(o, 0.2, 0.003, 0.18, 'lowpass', 300, 1, s.bus); }, 650);
        } else if (e.startsWith('join:')) {
          const i = +e.slice(5); const P = [74, 76, 78, 81, 83, 86];
          A.tone(o, mtof(P[i % P.length]), 'sine', 0.05, 0.01, 2.6, s.bus);
          A.tone(o, mtof(P[i % P.length] + 12), 'sine', 0.012, 0.01, 1.4, s.bus);
        }
      });
      s.events = [];
      s.warmV.forEach((v, i) => A.set(o, v.g.gain, 0.022 * k * (i === 0 ? 1.3 : 1) * (0.4 + 0.6 * (s.jn || 0)), 0.8));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.events = []; },
  },
};
function lerpAng(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
