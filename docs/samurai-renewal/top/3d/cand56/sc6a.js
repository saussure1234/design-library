// 場面6 案A「足元の灯り」：真っ暗な野で、一人ひとりが額の灯りで自分の足元だけを照らしている（短期・個別最適）
// → 顔が上がり、全員が同じ遠くを向くと、短い灯りが1本の長い道になり、地平の朱（シグナル）まで届く（長期・全体最適）
import { THREE, clamp, sstep, lerp, TAU, rnd, rr, A, mtof, SIG, SND } from './base.js';
import { loadHuman, makeBody, pose, v3 } from './human.js';

const STAND = {
  spine03: v3(0, 1, 0.02), spine01: v3(0, 1, 0.06),
  upperarm01L: v3(0.22, -1, 0.02), lowerarm01L: v3(0.14, -1, 0.2), upperarm01R: v3(-0.22, -1, 0.02), lowerarm01R: v3(-0.14, -1, 0.2),
  upperleg01L: v3(0.05, -1, 0), lowerleg01L: v3(0.04, -1, -0.02), upperleg01R: v3(-0.05, -1, 0), lowerleg01R: v3(-0.04, -1, -0.02),
};
const SIGPOS = new THREE.Vector3(0, 1.4, -150);
const s = {};
const coneMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { uA: { value: 0.5 }, uL: { value: 1 } },
  vertexShader: 'varying vec3 vP,vN,vV;void main(){vP=position;vec4 w=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-w.xyz);gl_Position=projectionMatrix*w;}',
  fragmentShader: 'uniform float uA,uL;varying vec3 vP,vN,vV;void main(){float f=pow(abs(dot(vN,vV)),1.6);float z=clamp(vP.z,0.,1.);float fall=exp(-z*2.2*uL)*(1.-z);gl_FragColor=vec4(vec3(.86,.9,.96)*uA*f*fall,1.);}',
});
const poolMat = () => new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uA: { value: 1 }, uW: { value: 1 } },
  vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
  fragmentShader: 'uniform float uA,uW;varying vec2 vU;void main(){float x=(vU.x-.5)*2.;float y=vU.y;float w=mix(.6,1.,y);float g=exp(-x*x/(w*w)*3.)*smoothstep(0.,.12,y)*smoothstep(1.,.55,y);gl_FragColor=vec4(vec3(.72,.76,.84)*g*uA,1.);}',
});

export default {
  chordAt: (S) => (S.p < 0.55 ? 3 : 7),
  duck: (S) => 1 - sstep(0.55, 0.85, S.p),
  async build(S) {
    const { scene, SP } = S;
    S.bloom.strength = 0.75; S.bloom.threshold = 0.55; S.bloom.radius = 0.75;
    scene.fog = new THREE.FogExp2(0x020203, 0.018);
    const g = await loadHuman();
    const mat = new THREE.MeshStandardMaterial({ color: 0x2b2e35, roughness: 0.62, metalness: 0.05 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.92 }));
    floor.rotation.x = -Math.PI / 2; scene.add(floor);
    scene.add(new THREE.HemisphereLight(0x46505f, 0x000000, 0.22));
    const moon = new THREE.DirectionalLight(0x9aa6bb, 0.35); moon.position.set(-4, 6, -10); scene.add(moon);
    const N = SP ? 15 : 24;
    s.ppl = [];
    const cg = new THREE.ConeGeometry(1, 1, 40, 1, true); cg.translate(0, -0.5, 0); cg.rotateX(-Math.PI / 2);
    for (let i = 0; i < N; i++) {
      const b = makeBody(g, mat); scene.add(b.root);
      // ばらばらの位置（後で同じ向きの列になる）
      const x = SP ? rr(-5.5, 5.5) : rr(-4.5, 10), z = rr(-12, 3);
      b.root.position.set(x, 0, z);
      b.yaw0 = rnd() * TAU; b.ph = rnd() * TAU; b.sp = rr(0.6, 1.4);
      const cone = new THREE.Mesh(cg, coneMat()); cone.frustumCulled = false; scene.add(cone);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), poolMat()); pool.frustumCulled = false; scene.add(pool);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }));
      scene.add(lamp);
      s.ppl.push({ b, cone, pool, lamp, x, z, next: rr(0, 3), look: rr(-1, 1), tgtLook: 0, flick: 1 });
    }
    // 地平の朱
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader: 'uniform float uA;varying vec2 vU;void main(){vec2 q=vU-.5;float d=length(q)*2.;float g=exp(-d*d*40.)*3.+exp(-d*d*4.)*.5+exp(-q.y*q.y*900.)*exp(-q.x*q.x*6.)*.6;gl_FragColor=vec4(vec3(1.,.35,.14)*g*uA,1.);}',
    }));
    sg.position.copy(SIGPOS); sg.scale.set(40, 40, 1); scene.add(sg); s.sig = sg;
    s.tmp = new THREE.Vector3(); s.dir = new THREE.Vector3(); s.hp = new THREE.Vector3(); s.ev = []; s.sigOn = false;
  },
  frame(S) {
    const { camera, t, p, SP, dt } = S;
    const k = sstep(0.35, 0.78, p);
    s.k = k;
    s.ppl.forEach((q, i) => {
      const b = q.b;
      const ki = sstep(0.35 + (i / s.ppl.length) * 0.2, 0.55 + (i / s.ppl.length) * 0.2, p);
      q.ki = ki;
      // 自分の足元を見回す：ときどき向きを変える（その度にカチッ）
      if (t > q.next) { q.next = t + rr(1.2, 3.5); q.tgtLook = rr(-1.2, 1.2); if (ki < 0.3) s.ev.push('click:' + i); }
      q.look += (q.tgtLook - q.look) * Math.min(1, dt * 3);
      const yaw = lerpAng(q.b.yaw0 + q.look * 0.5, Math.PI + Math.atan2(q.x * 0.04, 1) * 0, ki);
      // 列へ：横に少し寄る
      const px = lerp(q.x, q.x * 0.75, ki), pz = q.z;
      b.root.position.set(px, 0, pz);
      b.root.rotation.set(0, yaw, 0);
      // 頭の傾き：下（足元）→ 前（地平）
      const down = lerp(1.0 + Math.sin(t * 0.7 * q.b.sp + q.b.ph) * 0.12, 0.03, ki);
      const side = q.look * 0.35 * (1 - ki);
      const P = { ...STAND, neck01: v3(side * 0.5, Math.cos(down * 0.6), Math.sin(down * 0.6)), head: v3(side, Math.cos(down), Math.sin(down)) };
      pose(b, P, null, 0);
      // 灯り：頭の位置から、顔の向きへ
      b.bones.head.getWorldPosition(s.hp); s.hp.y += 0.08;
      s.dir.set(Math.sin(yaw + side * 0.8) * Math.cos(down), -Math.sin(down), Math.cos(yaw + side * 0.8) * Math.cos(down)).normalize();
      if (ki > 0) {   // 揃うほど地平の朱へ向く
        const toSig = s.tmp.copy(SIGPOS).sub(s.hp).normalize();
        s.dir.lerp(toSig, ki * ki).normalize();
      }
      s.hp.addScaledVector(s.dir, 0.12);
      q.lamp.position.copy(s.hp);
      const len = lerp(2.6, 150, Math.pow(ki, 2.2));
      const rad = lerp(0.85, 2.2, ki);
      q.flick = 0.85 + 0.15 * Math.sin(t * 13 + i * 3) * Math.sin(t * 7.3 + i) * (1 - ki);
      q.cone.position.copy(s.hp); q.cone.lookAt(s.tmp.copy(s.hp).add(s.dir)); q.cone.scale.set(rad, rad, len);
      q.cone.material.uniforms.uA.value = lerp(0.32, 0.075, ki) * q.flick;
      q.cone.material.uniforms.uL.value = lerp(1, 0.35, ki);
      // 地面の灯り：足元の丸 → 遠くへ伸びる帯
      let hit;
      if (s.dir.y < -0.02) hit = Math.min(len, -s.hp.y / s.dir.y); else hit = len;
      const gx = s.dir.x, gz = s.dir.z, gl = Math.hypot(gx, gz) || 1;
      const L = Math.max(0.6, hit * gl);
      q.pool.position.set(s.hp.x + gx / gl * L * 0.5, 0.01, s.hp.z + gz / gl * L * 0.5);
      q.pool.rotation.set(-Math.PI / 2, 0, -Math.atan2(gx, -gz));
      q.pool.scale.set(lerp(1.3, 2.4, ki), L * lerp(1.25, 1, ki), 1);
      q.pool.material.uniforms.uA.value = lerp(0.55, 0.22, ki) * q.flick;
    });
    const sv = sstep(0.62, 0.92, p);
    s.sig.material.uniforms.uA.value = sv * (1 + 0.1 * Math.sin(t * 2));
    s.sig.lookAt(camera.position);
    if (sv > 0.5 && !s.sigOn) { s.sigOn = true; s.ev.push('sig'); } if (sv < 0.2) s.sigOn = false;
    // カメラ：上から足元の灯りの群れ → 後ろから地平へ伸びる道
    const h = lerp(SP ? 17 : 13, SP ? 5.5 : 4.2, k), back = lerp(SP ? 13 : 11, SP ? 15 : 13, k);
    camera.position.set(Math.sin(t * 0.04) * 1.5, h, back);
    camera.lookAt(0, 0, lerp(-5, -40, k));
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.18, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.15, 0, innerWidth, innerHeight);
  },
  sound: {
    init(S, o) {
      const { ctx } = o;
      s.bus = A.bus(o, 0.4);
      s.hum = A.osc(o, 'sine', mtof(45), s.bus);
      s.drone = [57, 64, 69, 76].map((m) => A.osc(o, 'triangle', mtof(m), s.bus));
      s.nextBeat = 0; s.beat = 0;
    },
    update(S, o) {
      const { ctx } = o, t = ctx.currentTime, k = s.k || 0;
      A.set(o, s.bus.gain, 1, 0.3);
      A.set(o, s.hum.g.gain, 0.06 * (1 - k * 0.5), 0.5);
      const PEN = [69, 71, 74, 76, 78, 81, 83];
      s.ev.forEach((e) => {
        if (e.startsWith('click:')) {   // 各自のスイッチと、ばらばらの小さな音
          const i = +e.slice(6);
          A.noise(o, 0.12, 0.001, 0.015, 'highpass', 3500, 1, s.bus);
          A.tone(o, mtof(PEN[(i * 5 + ((Math.random() * 3) | 0)) % PEN.length]) * (1 + (Math.random() - 0.5) * 0.06), 'square', 0.012, 0.003, 0.12, s.bus);
        } else if (e === 'sig') { SND.lock && SND.lock(); A.tone(o, mtof(93), 'sine', 0.03, 0.01, 3, s.bus); }
      });
      s.ev.length = 0;
      // 揃うほど、ばらばらだった音が1つの拍にそろう
      if (k > 0.15 && t > s.nextBeat) {
        s.nextBeat = t + 0.9 - k * 0.15; s.beat++;
        const n = Math.round(lerp(1, 4, k));
        for (let j = 0; j < n; j++) A.tone(o, mtof([57, 64, 69, 76][j]), 'sine', 0.02 * k, 0.005, 0.9, s.bus, null, t + j * 0.002);
      }
      s.drone.forEach((v, i) => A.set(o, v.g.gain, 0.02 * sstep(0.5, 1, S.p) * (1 - i * 0.15), 1.2));
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
function lerpAng(a, b, t) { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; }
