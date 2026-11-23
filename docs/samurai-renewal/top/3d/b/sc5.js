// 場面5「人の山」の部品（本線 main2.js に組み込む用・単体確認は c3d-sc5-a.html）
// ゼロサム：人が積み重なってできた山に、大勢がよじ登っては引きずり落とされ、転げ落ちる。
//           頂上の1人が最後に朱の光をつかんで勝ち、群れは凍りついたように止まる（不気味な勝利）
// プラスサム：山が沈み、人々が床に降りて手をつなぐ輪になり、輪の中の朱（笑顔の総量）が育つ
//
// 使い方：
//   const sc5 = await createScene5({ THREE, scene, center, quality: 'pc' | 'sp', renderer? });
//   毎フレーム sc5.update(t, dt, p)   … p＝場面の進み 0〜1（0〜0.42 ゼロサム／0.45〜0.8 輪へ／〜1 朱が育つ）
//   毎フレーム sc5.audio(SND.out(), level) … 音オフの時は out=null。level＝この場面の音量 0〜1
//   片付け sc5.dispose()
//   大きさ：center を床の中心として、山は半径約6.8・高さ約5.2（勝者と光を入れて約8.5）。カメラ約17の距離で収まる
//   光：group の中に点光源・スポットだけを置く（距離つき＝他の場面へ漏れない）。半球光・平行光は使わない
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

export async function createScene5({ THREE, scene, center, quality = 'pc', renderer = null }) {
  const SP = quality === 'sp';
  const TAU = Math.PI * 2;
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  let seed = 515;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const rr = (a, b) => a + (b - a) * rnd();
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const SIG = 0xff5a24;

  // ---------- 人の形 ----------
  const url = (f) => new URL('./sc5/' + f, import.meta.url).href;
  const ld = new GLTFLoader();
  const [gHi, gLo, gLo2] = await Promise.all(['human.glb', 'human_lo.glb', 'human_lo2.glb'].map((f) => ld.loadAsync(url(f))));
  function makeBody(g, mat) {
    const o = SkeletonUtils.clone(g.scene); const bones = {}; let mesh = null;
    o.traverse((c) => { if (c.isBone) bones[c.name] = c; if (c.isSkinnedMesh) { mesh = c; if (mat) c.material = mat; c.frustumCulled = false; } });
    const rest = {}; for (const k in bones) rest[k] = bones[k].quaternion.clone();
    const root = new THREE.Group(); root.add(o); return { root, o, bones, rest, mesh };
  }
  const ORDER = ['spine03', 'spine01', 'neck01', 'head', 'upperarm01L', 'lowerarm01L', 'upperarm01R', 'lowerarm01R', 'upperleg01L', 'lowerleg01L', 'upperleg01R', 'lowerleg01R'];
  const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _pq = new THREE.Quaternion(), _rq = new THREE.Quaternion(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _m = new THREE.Vector3(), _m2 = new THREE.Vector3();
  function aim(b, name, d) {
    const bone = b.bones[name]; if (!bone || !d) return;
    bone.getWorldQuaternion(_q); _v.set(0, 1, 0).applyQuaternion(_q);
    b.o.getWorldQuaternion(_rq); _d.copy(d).normalize().applyQuaternion(_rq);
    _q2.setFromUnitVectors(_v, _d).multiply(_q);
    bone.parent.getWorldQuaternion(_pq); bone.quaternion.copy(_pq.invert().multiply(_q2)); bone.updateMatrixWorld(true);
  }
  function pose(b, A, B, k = 0) {
    for (const n in b.rest) b.bones[n].quaternion.copy(b.rest[n]);
    b.root.updateMatrixWorld(true);
    for (const n of ORDER) {
      const a = A[n], c = B ? B[n] : null; if (!a && !c) continue;
      if (a && c) _m.copy(a).normalize().lerp(_m2.copy(c).normalize(), k); else _m.copy(a || c);
      aim(b, n, _m);
    }
  }
  // 姿勢（体の座標：+Y 上・+Z 前・+X 本人の左）
  const P = {
    CLIMB: { spine03: v3(0, 1, 0.12), spine01: v3(0, 1, 0.2), neck01: v3(0, 1, 0.05), head: v3(0, 1, -0.3), upperarm01L: v3(0.25, 1, 0.35), lowerarm01L: v3(0.1, 1, 0.3), upperarm01R: v3(-0.25, 1, 0.35), lowerarm01R: v3(-0.1, 1, 0.3), upperleg01L: v3(0.1, -0.7, 0.6), lowerleg01L: v3(0.05, -1, -0.15), upperleg01R: v3(-0.1, -0.9, 0.2), lowerleg01R: v3(-0.05, -1, -0.4) },
    CLIMB2: { spine03: v3(0, 1, 0.18), spine01: v3(0.1, 1, 0.25), neck01: v3(0, 1, 0), head: v3(0, 1, -0.4), upperarm01L: v3(0.35, 0.6, 0.6), lowerarm01L: v3(0.1, 0.2, 1), upperarm01R: v3(-0.15, 1, 0.2), lowerarm01R: v3(-0.05, 1, 0.1), upperleg01L: v3(0.1, -0.9, 0.2), lowerleg01L: v3(0.05, -1, -0.4), upperleg01R: v3(-0.1, -0.6, 0.7), lowerleg01R: v3(-0.05, -1, -0.1) },
    HEAP: { spine03: v3(0, 1, 0.05), spine01: v3(0.05, 1, 0.08), neck01: v3(0, 1, -0.1), head: v3(0, 1, -0.45), upperarm01L: v3(0.4, 1, 0.1), lowerarm01L: v3(0.2, 1, 0.2), upperarm01R: v3(-0.7, 0.4, 0.3), lowerarm01R: v3(-0.4, 0.8, 0.4), upperleg01L: v3(0.15, -1, 0.05), lowerleg01L: v3(0.1, -1, -0.2), upperleg01R: v3(-0.12, -1, 0.15), lowerleg01R: v3(-0.06, -1, -0.05) },
    HEAP2: { spine03: v3(0, 1, 0.12), spine01: v3(-0.05, 1, 0.15), neck01: v3(0, 1, 0), head: v3(0, 1, -0.3), upperarm01L: v3(0.7, 0.5, 0.35), lowerarm01L: v3(0.4, 0.9, 0.4), upperarm01R: v3(-0.35, 1, 0.15), lowerarm01R: v3(-0.15, 1, 0.25), upperleg01L: v3(0.12, -1, 0.2), lowerleg01L: v3(0.06, -1, -0.15), upperleg01R: v3(-0.15, -1, 0.02), lowerleg01R: v3(-0.1, -1, -0.25) },
    FALL: { spine03: v3(0, 1, -0.4), spine01: v3(0, 1, -0.6), neck01: v3(0, 0.6, -0.8), head: v3(0, 0.4, -1), upperarm01L: v3(0.9, 0.8, -0.3), lowerarm01L: v3(0.6, 1, 0.3), upperarm01R: v3(-0.9, 0.6, 0.2), lowerarm01R: v3(-0.5, 1, 0.5), upperleg01L: v3(0.3, -0.6, 0.7), lowerleg01L: v3(0.1, -1, 0.1), upperleg01R: v3(-0.2, -0.8, -0.4), lowerleg01R: v3(-0.1, -1, -0.2) },
    FALL2: { spine03: v3(0, 1, 0.3), spine01: v3(0.2, 1, 0.4), neck01: v3(0, 0.8, 0.6), head: v3(0, 0.5, 0.9), upperarm01L: v3(1, -0.2, 0.4), lowerarm01L: v3(0.7, 0.6, 0.6), upperarm01R: v3(-0.6, 1, -0.4), lowerarm01R: v3(-0.3, 1, 0.2), upperleg01L: v3(0.4, -0.9, -0.2), lowerleg01L: v3(0.2, -1, -0.5), upperleg01R: v3(-0.3, -0.4, 0.8), lowerleg01R: v3(-0.1, -1, 0.3) },
    TOP: { spine03: v3(0, 1, -0.05), spine01: v3(0, 1, -0.15), neck01: v3(0, 1, -0.2), head: v3(0, 1, -0.45), upperarm01L: v3(0.35, 1, -0.05), lowerarm01L: v3(0.2, 1, 0), upperarm01R: v3(-0.35, 1, -0.05), lowerarm01R: v3(-0.2, 1, 0), upperleg01L: v3(0.12, -1, 0), lowerleg01L: v3(0.06, -1, 0), upperleg01R: v3(-0.12, -1, 0), lowerleg01R: v3(-0.06, -1, 0) },
    GRAB: { spine03: v3(0, 1, -0.12), spine01: v3(0, 1, -0.28), neck01: v3(0, 1, -0.35), head: v3(0, 1, -0.7), upperarm01L: v3(0.18, 1, 0.05), lowerarm01L: v3(-0.25, 1, 0.05), upperarm01R: v3(-0.18, 1, 0.05), lowerarm01R: v3(0.25, 1, 0.05), upperleg01L: v3(0.16, -1, 0.02), lowerleg01L: v3(0.08, -1, -0.02), upperleg01R: v3(-0.16, -1, 0.02), lowerleg01R: v3(-0.08, -1, -0.02) },
    RING: { spine03: v3(0, 1, 0), spine01: v3(0, 1, 0.04), neck01: v3(0, 1, 0.1), head: v3(0, 1, 0.06), upperarm01L: v3(1, -0.5, 0.3), lowerarm01L: v3(1, -0.3, 0.42), upperarm01R: v3(-1, -0.5, 0.3), lowerarm01R: v3(-1, -0.3, 0.42), upperleg01L: v3(0.04, -1, 0), lowerleg01L: v3(0.04, -1, -0.02), upperleg01R: v3(-0.04, -1, 0), lowerleg01R: v3(-0.04, -1, -0.02) },
  };
  // 姿勢を付けた形を、骨なしの形に焼く（大勢はこれをインスタンスで並べる）
  function bake(g, A) {
    const b = makeBody(g, null); pose(b, A); b.root.updateMatrixWorld(true);
    const m = b.mesh; m.skeleton.update();
    const pos = m.geometry.attributes.position, n = pos.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(out, 3)); geo.setIndex(m.geometry.index.clone()); geo.computeVertexNormals();
    return geo;
  }
  function morphGeo(g, A, B, count) {
    const ga = bake(g, A), gb = bake(g, B);
    ga.setAttribute('posB', gb.attributes.position); ga.setAttribute('nrmB', gb.attributes.normal);
    ga.setAttribute('aMix', new THREE.InstancedBufferAttribute(new Float32Array(count), 1));
    gb.dispose(); return ga;
  }
  // 濡れた石膏（粘りの照り）。頂点を2つの姿勢の間で混ぜる
  const geos = [], mats = [];
  function wetMat(color, morph) {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0x9aa3b4), envMapIntensity: 0.6 });
    if (morph) {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 posB;\nattribute vec3 nrmB;\nattribute float aMix;')
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(normal, nrmB, aMix));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
          .replace('#include <begin_vertex>', 'vec3 transformed = mix(position, posB, aMix);');
      };
      m.customProgramCacheKey = () => 'sc5-morph';
    }
    mats.push(m); return m;
  }
  let envTex = null;
  if (renderer) {
    const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
    const pm = new THREE.PMREMGenerator(renderer); const env = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose(); envTex = env;
  }

  // ---------- 置き場 ----------
  const group = new THREE.Group(); group.position.copy(center); scene.add(group);
  const mound = new THREE.Group(); group.add(mound);   // 沈む物はすべてここ
  const H = 5.2, R = 6.8;
  const hAt = (r) => H * Math.pow(clamp(1 - r / R), 1.18);
  const dhAt = (r) => (hAt(r + 0.01) - hAt(r - 0.01)) / 0.02;
  // 斜面の上に寝そべる向き：頭＝山頂側、前＝斜面の中（うつ伏せ）
  const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _x = new THREE.Vector3(), _mm = new THREE.Matrix4(), _qq = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _ax = new THREE.Vector3();
  function slopeFrame(r, th, yaw, back, out) {
    const cx = Math.cos(th), cz = Math.sin(th), s = dhAt(Math.max(0.05, r));
    _n.set(-s * cx, 1, -s * cz).normalize();         // 面の法線
    _t.set(-cx, -s, -cz).normalize();                // 山頂へ向かう向き
    _t.applyAxisAngle(_n, yaw);
    const Z = back ? _n.clone() : _n.clone().negate();
    _x.crossVectors(_t, Z).normalize();
    const Zf = new THREE.Vector3().crossVectors(_x, _t).normalize();
    _mm.makeBasis(_x, _t, Zf); out.setFromRotationMatrix(_mm);
    return _n;
  }
  // 山の芯（黒い塊）
  {
    const pts = []; for (let i = 0; i <= 48; i++) { const r = R * 1.02 * (1 - i / 48); pts.push(new THREE.Vector2(Math.max(0.001, r), hAt(r) - 0.25)); }
    const g = new THREE.LatheGeometry(pts, SP ? 64 : 120);
    const pa = g.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const k = 0.18 * Math.sin(v.x * 2.3) * Math.sin(v.z * 2.1 + 1) * Math.sin(v.y * 3.1); pa.setY(i, Math.max(0, v.y + k)); }
    g.computeVertexNormals(); geos.push(g);
    const m = new THREE.Mesh(g, new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.3 })); mats.push(m.material);
    mound.add(m);
  }
  // 床（中は不透明＝沈んだ山を隠す・外へ向かって闇に溶ける）
  {
    const g1 = new THREE.CircleGeometry(24, 96); geos.push(g1);
    const f1 = new THREE.Mesh(g1, new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.9, metalness: 0, envMapIntensity: 0 })); mats.push(f1.material);
    f1.rotation.x = -Math.PI / 2; group.add(f1);
    const g2 = new THREE.RingGeometry(24, 70, 96, 1); geos.push(g2);
    const f2 = new THREE.Mesh(g2, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: {}, vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 vP;void main(){float r=length(vP.xy);gl_FragColor=vec4(vec3(.008),1.-smoothstep(24.,70.,r));}' }));
    mats.push(f2.material); f2.rotation.x = -Math.PI / 2; f2.position.y = -0.002; group.add(f2);
  }
  // 積み重なった人（山の表面）
  const NH = SP ? 150 : 310;
  const heapGeo = morphGeo(gLo2, P.HEAP, P.HEAP2, NH); geos.push(heapGeo);
  const heap = new THREE.InstancedMesh(heapGeo, wetMat(0x6a6e77, true), NH); heap.frustumCulled = false; mound.add(heap);
  const heapPh = new Float32Array(NH), heapSp = new Float32Array(NH);
  {
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), c = new THREE.Color();
    for (let i = 0; i < NH; i++) {
      const r = R * Math.sqrt(rr(0.004, 0.97)), th = rnd() * TAU, back = rnd() < 0.22;
      const n = slopeFrame(r, th, rr(-0.8, 0.8), back, q);
      p.set(Math.cos(th) * r, hAt(r), Math.sin(th) * r).addScaledVector(n, rr(-0.05, 0.28));
      // 足元が山頂側に来ないよう、体の中心を少し下げる
      _ax.set(0, 1, 0).applyQuaternion(q); p.addScaledVector(_ax, -0.6);
      const s = rr(0.93, 1.06); sc.setScalar(s);
      heap.setMatrixAt(i, _mm.compose(p, q, sc));
      c.setScalar(rr(0.45, 1)); heap.setColorAt(i, c);
      heapPh[i] = rnd() * TAU; heapSp[i] = rr(0.3, 0.9);
    }
    heap.instanceMatrix.needsUpdate = true; heap.instanceColor.needsUpdate = true;
  }
  // 登る人・落ちる人（同じ番号の人が状態で入れ替わる）
  const NK = SP ? 72 : 150;
  const climbGeo = morphGeo(gLo, P.CLIMB, P.CLIMB2, NK), fallGeo = morphGeo(gLo, P.FALL, P.FALL2, NK); geos.push(climbGeo, fallGeo);
  const climb = new THREE.InstancedMesh(climbGeo, wetMat(0x7d828b, true), NK); climb.frustumCulled = false; mound.add(climb);
  const fall = new THREE.InstancedMesh(fallGeo, wetMat(0x7d828b, true), NK); fall.frustumCulled = false; mound.add(fall);
  const ag = [];
  for (let i = 0; i < NK; i++) ag.push({ th: rnd() * TAU, r: rr(1.5, R + 0.4), sp: rr(0.22, 0.48), ph: rnd() * TAU, mode: 0, vr: 0, spin: 0, spinAx: rnd() < 0.5 ? 1 : -1, lie: 0, yaw: rr(-0.4, 0.4) });
  // 勝つ人（骨つき・1人）
  const hiMat = wetMat(0x80858e, false);
  const win = makeBody(gHi, hiMat); mound.add(win.root);
  // 輪になる人（骨つき）。はじめは山の表面に寝そべっている
  const NR = SP ? 18 : 28, RR = 1.45 / (2 * Math.sin(Math.PI / NR));
  const ring = [];
  for (let i = 0; i < NR; i++) {
    const b = makeBody(gHi, hiMat); group.add(b.root);
    const th = (i / NR) * TAU + 0.3, r = rr(3.2, 6.0), q = new THREE.Quaternion();
    const n = slopeFrame(r, th, rr(-0.5, 0.5), false, q);
    const p0 = new THREE.Vector3(Math.cos(th) * r, hAt(r), Math.sin(th) * r).addScaledVector(n, 0.25);
    _ax.set(0, 1, 0).applyQuaternion(q); p0.addScaledVector(_ax, -0.6);
    b.p0 = p0; b.q0 = q; b.ph = rnd() * TAU; b.joined = false; ring.push(b);
  }
  // 光：頂上だけを照らす冷たいスポット／縁の光（山の輪郭）／朱の玉
  const top = new THREE.SpotLight(0xe4ebf5, 240, 12.5, 0.24, 0.6, 1.6); top.position.set(0.5, H + 9, 1.4); top.target.position.set(0, H, 0); group.add(top, top.target);
  const rimA = new THREE.SpotLight(0x8792a6, 130, 40, 0.75, 0.8, 1.4); rimA.position.set(-9, 9, -14); rimA.target.position.set(0, 2, 0); group.add(rimA, rimA.target);
  const rimB = new THREE.SpotLight(0x5c6578, 60, 40, 0.75, 0.8, 1.4); rimB.position.set(12, 4, -8); rimB.target.position.set(0, 2, 0); group.add(rimB, rimB.target);
  const fill = new THREE.PointLight(0x39404c, 5, 26, 1.6); fill.position.set(0, 7, 12); group.add(fill);
  // 頂上の光の筋（空気中の塵）
  const coneG = new THREE.ConeGeometry(2.3, 9, 48, 1, true); coneG.translate(0, -4.5, 0); geos.push(coneG);
  const cone = new THREE.Mesh(coneG, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0.12 } },
    vertexShader: 'varying float vY;varying vec3 vN,vV;void main(){vY=position.y;vec4 w=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-w.xyz);gl_Position=projectionMatrix*w;}',
    fragmentShader: 'uniform float uA;varying float vY;varying vec3 vN,vV;void main(){float f=pow(abs(dot(vN,vV)),2.);float y=clamp(1.+vY/9.,0.,1.);gl_FragColor=vec4(vec3(.8,.85,.92)*uA*f*y*y,1.);}',
  })); mats.push(cone.material);
  cone.position.copy(top.position); cone.lookAt(new THREE.Vector3(0, H, 0).add(group.position)); cone.rotateX(-Math.PI / 2); group.add(cone);
  const glowMat = (a) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*' + a + ')*1.4+exp(-d*d*60.)*2.;gl_FragColor=vec4(vec3(1.,.36,.13)*g*uA,1.);}' });
  const orbG = new THREE.SphereGeometry(0.13, 24, 16); geos.push(orbG);
  const orb = new THREE.Mesh(orbG, new THREE.MeshBasicMaterial({ color: new THREE.Color(SIG).multiplyScalar(3), toneMapped: false })); mats.push(orb.material); group.add(orb);
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat('5.')); geos.push(halo.geometry); mats.push(halo.material); group.add(halo);
  const orbL = new THREE.PointLight(SIG, 0, 9, 1.6); group.add(orbL);
  // 輪の中心の朱（笑顔の総量）
  const warm = new THREE.PointLight(SIG, 0, 30, 1.4); warm.position.set(0, 0.6, 0); group.add(warm);
  const floorGlow = new THREE.Mesh(new THREE.CircleGeometry(1, 64), glowMat('6.')); geos.push(floorGlow.geometry); mats.push(floorGlow.material);
  floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = 0.02; group.add(floorGlow);
  if (envTex) mats.forEach((m) => { if (m.isMeshStandardMaterial) m.envMap = envTex; });

  // ---------- 動き ----------
  const ev = [];
  const st = { p: 0, crowd: 1, freeze: 0, won: false, jn: 0, fallsRecent: 0 };
  const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), tsc = new THREE.Vector3(1, 1, 1), qSpin = new THREE.Quaternion(), camLocal = new THREE.Vector3(), tmp = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const lerpAng = (a, b, t) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * t; };
  let lastT = -1;

  function update(t, dt, p) {
    dt = Math.min(dt, 0.05);
    st.p = p;
    if (ev.length > 24) ev.length = 0;
    const freeze = sstep(0.3, 0.37, p);        // 勝った瞬間から群れが止まる
    const k = sstep(0.42, 0.8, p);             // 輪へ
    const sink = sstep(0.45, 0.66, p);
    st.freeze = freeze;
    const live = 1 - freeze;
    mound.position.y = -sink * (H + 1.6);
    mound.visible = sink < 0.999;
    // 山の表面がうごめく
    const hm = heap.geometry.attributes.aMix.array;
    for (let i = 0; i < NH; i++) hm[i] = 0.5 + 0.5 * Math.sin(t * heapSp[i] * live + heapPh[i] + (1 - live) * 0);
    heap.geometry.attributes.aMix.needsUpdate = true;
    // 登る・引きずり落とされる・転げ落ちる・下で倒れている
    const cm = climb.geometry.attributes.aMix.array, fm = fall.geometry.attributes.aMix.array;
    let falling = 0, ci = 0, fi = 0;
    for (let i = 0; i < NK; i++) {
      const a = ag[i];
      if (a.mode === 0) {          // 登る
        a.r -= a.sp * dt * live * (0.7 + 0.6 * Math.max(0, Math.sin(t * 2.4 + a.ph)));
        const hz = 0.03 + 0.9 * Math.pow(1 - a.r / R, 3);
        if (live > 0.5 && (rnd() < hz * dt || a.r < 0.9)) { a.mode = 1; a.vr = rr(0.6, 1.4); a.spin = 0; if (st.fallsRecent < 3) { ev.push({ e: 'fall', h: 1 - a.r / R }); st.fallsRecent++; } }
        const n = slopeFrame(a.r, a.th, a.yaw + Math.sin(t * 1.3 + a.ph) * 0.15 * live, false, tq);
        tp.set(Math.cos(a.th) * a.r, hAt(a.r), Math.sin(a.th) * a.r).addScaledVector(n, 0.32);
        // 上体を少し起こす
        _ax.set(1, 0, 0).applyQuaternion(tq); qSpin.setFromAxisAngle(_ax, -0.35); tq.premultiply(qSpin);
        climb.setMatrixAt(ci, _mm.compose(tp, tq, tsc));
        cm[ci++] = 0.5 + 0.5 * Math.sin(t * 3.2 * live + a.ph);
      } else if (a.mode === 1) {   // 転げ落ちる
        falling++;
        a.vr += dt * 3.2 * (0.3 + live); a.r += a.vr * dt; a.spin += dt * (4 + a.vr * 1.5) * a.spinAx;
        const n = slopeFrame(Math.min(a.r, R), a.th, a.yaw, rnd() < 0, tq);
        const hh = a.r < R ? hAt(a.r) : 0;
        tp.set(Math.cos(a.th) * a.r, hh, Math.sin(a.th) * a.r).addScaledVector(n, 0.45 + Math.abs(Math.sin(a.spin)) * 0.35);
        _ax.set(-Math.sin(a.th), 0, Math.cos(a.th)); qSpin.setFromAxisAngle(_ax, a.spin); tq.premultiply(qSpin);
        fall.setMatrixAt(fi, _mm.compose(tp, tq, tsc));
        fm[fi++] = 0.5 + 0.5 * Math.sin(t * 9 + a.ph);
        if (a.r > R + rr(0.3, 2.2)) { a.mode = 2; a.lie = rr(1.5, 4); a.spin = 0; }
      } else {                     // 下で倒れている → また登りはじめる
        a.lie -= dt * live;
        tp.set(Math.cos(a.th) * a.r, 0.18, Math.sin(a.th) * a.r);
        tq.setFromAxisAngle(_ax.set(-Math.sin(a.th), 0, Math.cos(a.th)), Math.PI / 2 * a.spinAx);
        qSpin.setFromAxisAngle(_ax.set(0, 1, 0), -a.th); tq.multiply(qSpin);
        fall.setMatrixAt(fi, _mm.compose(tp, tq, tsc));
        fm[fi++] = 0.3;
        if (a.lie < 0) { a.mode = 0; a.r = R + 0.2; a.th += rr(-0.4, 0.4); a.sp = rr(0.22, 0.48); }
      }
    }
    climb.count = ci; fall.count = fi;
    climb.instanceMatrix.needsUpdate = true; fall.instanceMatrix.needsUpdate = true;
    climb.geometry.attributes.aMix.needsUpdate = true; fall.geometry.attributes.aMix.needsUpdate = true;
    st.falling = falling / NK;
    if (Math.floor(t * 2) !== Math.floor(lastT * 2)) st.fallsRecent = 0;
    lastT = t;
    // 勝つ人：最後の斜面を登り、頂上に立ち、降りてくる朱をつかんで掲げる
    const wc = sstep(0.04, 0.2, p), stand = sstep(0.18, 0.24, p), grab = sstep(0.25, 0.33, p);
    const wr = lerp(2.4, 0.0, wc);
    if (stand < 0.01) {
      const n = slopeFrame(Math.max(wr, 0.15), 1.9, 0, false, tq);
      tp.set(Math.cos(1.9) * wr, hAt(wr), Math.sin(1.9) * wr).addScaledVector(n, 0.32);
      _ax.set(1, 0, 0).applyQuaternion(tq); qSpin.setFromAxisAngle(_ax, -0.35); tq.premultiply(qSpin);
      win.root.position.copy(tp); win.root.quaternion.copy(tq);
      pose(win, P.CLIMB, P.CLIMB2, 0.5 + 0.5 * Math.sin(t * 3.2));
    } else {
      win.root.position.set(0, H - 0.12, 0);
      // 正面（カメラ側）を向く
      camLocal.set(0, 0, 1);
      win.root.quaternion.setFromAxisAngle(_ax.set(0, 1, 0), 0.25 + Math.sin(t * 0.3) * 0.05 * (1 - grab));
      const shake = (1 - grab) * 0.08 * Math.sin(t * 7);
      const Pt = { ...P.TOP, upperarm01L: v3(0.35 + shake, 1, -0.05), upperarm01R: v3(-0.35 - shake, 1, -0.05) };
      pose(win, Pt, P.GRAB, grab);
    }
    // 朱：はじめは光の筋の中に浮かぶ「1人ぶんの賞品」→ 勝者の手に降りる → 輪の中心へ
    const hand = tmp; win.root.updateMatrixWorld(true);
    if (win.bones.wristL && win.bones.wristR) { win.bones.wristL.getWorldPosition(hand); win.bones.wristR.getWorldPosition(tmpB); hand.add(tmpB).multiplyScalar(0.5); group.worldToLocal(hand); hand.y += 0.12; }
    const hang = new THREE.Vector3(0, H + 2.9 + Math.sin(t * 0.8) * 0.08, 0);
    const toRing = sstep(0.48, 0.7, p);
    const op = hang.clone().lerp(hand, grab);
    op.lerp(new THREE.Vector3(0, 0.6, 0), toRing);
    orb.position.copy(op); halo.position.copy(op);
    const orbA = lerp(0.35, 1, grab) * (1 - toRing * 0.6);
    orb.scale.setScalar(lerp(0.8, 1.25, grab) * (1 - toRing) + 0.001);
    halo.scale.setScalar(lerp(1.4, 3.2, grab) * (1 + Math.sin(t * 2.2) * 0.06)); halo.material.uniforms.uA.value = orbA * (1 - toRing);
    orbL.position.copy(op); orbL.intensity = (lerp(4, 70, grab)) * (1 - toRing);
    if (grab > 0.97 && !st.won) { st.won = true; ev.push({ e: 'win' }); }
    if (grab < 0.5) st.won = false;
    top.intensity = 240 * (1 - 0.6 * grab) * (1 - sstep(0.42, 0.6, p));
    cone.material.uniforms.uA.value = 0.12 * (1 - 0.5 * grab) * (1 - sstep(0.42, 0.6, p));
    // 輪
    let joined = 0;
    ring.forEach((b, i) => {
      const ki = sstep(0.45 + (i / NR) * 0.2, 0.58 + (i / NR) * 0.2, p);
      const ra = (i / NR) * TAU + t * 0.02 * k;
      const rp = tmpB.set(Math.cos(ra) * RR, 0, Math.sin(ra) * RR);
      const p0 = tmp.copy(b.p0); p0.y += mound.position.y * (1 - ki);
      b.root.position.copy(p0).lerp(rp, ki); b.root.position.y += Math.sin(ki * Math.PI) * 1.0;
      if (ki > 0.999) b.root.position.y = 0;
      _qa.setFromAxisAngle(_ax.set(0, 1, 0), -ra - Math.PI / 2);
      b.root.quaternion.copy(b.q0).slerp(_qa, ki);
      const br = Math.sin(t * 0.9 + i * 0.5) * 0.04;
      const Rg = { ...P.RING, upperarm01L: v3(1, -0.5 + br, 0.3), upperarm01R: v3(-1, -0.5 + br, 0.3) };
      if (ki < 0.001) pose(b, P.HEAP, P.HEAP2, (0.5 + 0.5 * Math.sin(t * 0.5 + b.ph)) * (1 - st.freeze * 0.9));
      else pose(b, P.HEAP, Rg, ki);
      b.root.visible = mound.position.y + b.p0.y > -1.2 || ki > 0.01;
      if (ki > 0.98) { joined++; if (!b.joined) { b.joined = true; ev.push({ e: 'join', i }); } }
      if (ki < 0.5) b.joined = false;
    });
    st.jn = joined / NR;
    const gw = sstep(0.6, 1, p) * (0.4 + 0.6 * st.jn);
    warm.intensity = gw * 140; floorGlow.material.uniforms.uA.value = gw * 1.1; floorGlow.scale.setScalar(1 + gw * RR * 0.9);
    // 光の向き（板はカメラへ）は呼び出し側のカメラに合わせる
    const cam = scene.userData.__cam;
    if (cam) halo.quaternion.copy(cam.quaternion);
  }
  // 板をカメラへ向けるため、カメラを渡せるようにする
  function setCamera(cam) { scene.userData.__cam = cam; }

  // ---------- 音（人の声はすべて合成） ----------
  const au = { built: false };
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const VOW = { a: [800, 1150, 2900], o: [450, 800, 2830], u: [325, 700, 2530], e: [400, 1700, 2600], i: [300, 2100, 2900] };
  const VK = Object.keys(VOW);
  function env(g, t0, a, peak, d) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function buildAudio(o) {
    const { ctx } = o; au.ctx = ctx; au.o = o;
    au.master = ctx.createGain(); au.master.gain.value = 0; au.master.connect(o.sfx);
    const sv = ctx.createGain(); sv.gain.value = 0.45; au.master.connect(sv); sv.connect(o.verb);
    au.crowd = ctx.createGain(); au.crowd.gain.value = 0; au.crowd.connect(au.master);
    au.plus = ctx.createGain(); au.plus.gain.value = 0; au.plus.connect(au.master);
    // 少し歪ませる（喉の荒さ）
    au.shaper = ctx.createWaveShaper(); { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 2.2); } au.shaper.curve = c; }
    au.shaper.connect(au.crowd);
    // うめく声の束：のこぎり波＋ビブラート → 母音の3つの帯域
    const NV = SP ? 5 : 9;
    au.voices = [];
    for (let i = 0; i < NV; i++) {
      const x = ctx.createOscillator(); x.type = 'sawtooth'; x.frequency.value = rr(85, 190);
      const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rr(4.5, 6.5); lg.gain.value = rr(2, 5); lfo.connect(lg); lg.connect(x.frequency); lfo.start();
      const g = ctx.createGain(); g.gain.value = 0;
      const fs = [0, 1, 2].map((j) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [7, 10, 12][j]; f.frequency.value = VOW.a[j]; const fg = ctx.createGain(); fg.gain.value = [1, 0.55, 0.22][j]; x.connect(f); f.connect(fg); fg.connect(g); return f; });
      const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (pan) { pan.pan.value = rr(-0.8, 0.8); g.connect(pan); pan.connect(au.shaper); } else g.connect(au.shaper);
      x.start();
      au.voices.push({ x, g, fs, next: 0, base: x.frequency.value });
    }
    // ざわめきの地
    { const s = ctx.createBufferSource(); s.buffer = o.nbuf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 1.1; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(au.crowd); s.start(); au.mur = { g, f }; }
    // 勝った後に残る、低いうなりと朱の細い音
    { const x = ctx.createOscillator(); x.type = 'sine'; x.frequency.value = 41; const g = ctx.createGain(); g.gain.value = 0; x.connect(g); g.connect(au.master); x.start(); au.sub = { x, g }; }
    { const x = ctx.createOscillator(); x.type = 'sine'; x.frequency.value = mtof(93); const g = ctx.createGain(); g.gain.value = 0; x.connect(g); g.connect(au.master); x.start(); au.hum = { x, g }; }
    // 輪の和音
    au.warmV = [62, 66, 69, 74].map((m) => { const x = ctx.createOscillator(); x.type = 'triangle'; x.frequency.value = mtof(m); const g = ctx.createGain(); g.gain.value = 0; x.connect(g); g.connect(au.plus); x.start(); return { x, g }; });
    au.nextSyl = 0; au.cheer = -1; au.built = true;
  }
  function vowel(v, name, t, tc) { const F = VOW[name]; v.fs.forEach((f, j) => f.frequency.setTargetAtTime(F[j] * rr(0.92, 1.08), t, tc)); }
  // 一度きりの声（叫び・どよめき）
  function shout(t, f0, f1, dur, peak, vname, to) {
    const { ctx } = au; const x = ctx.createOscillator(); x.type = 'sawtooth'; x.frequency.setValueAtTime(f0, t); x.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = rr(5, 7); lg.gain.value = f0 * 0.025; lfo.connect(lg); lg.connect(x.frequency);
    const g = ctx.createGain(); env(g, t, 0.04, peak, dur);
    const F = VOW[vname];
    [0, 1, 2].forEach((j) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = [6, 9, 11][j]; f.frequency.value = F[j]; const fg = ctx.createGain(); fg.gain.value = [1, 0.6, 0.3][j]; x.connect(f); f.connect(fg); fg.connect(g); });
    g.connect(to || au.shaper); x.start(t); lfo.start(t); x.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
  function noiseHit(t, peak, a, d, type, f, q, f2, to) {
    const { ctx, o } = au; const s = ctx.createBufferSource(); s.buffer = o.nbuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q; if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = ctx.createGain(); s.connect(fl); fl.connect(g); g.connect(to || au.master); env(g, t, a, peak, d); s.start(t, Math.random()); s.stop(t + a + d + 0.05);
  }
  function tone(t, f, type, peak, a, d, to, f2) {
    const { ctx } = au; const x = ctx.createOscillator(); x.type = type; x.frequency.setValueAtTime(f, t); if (f2) x.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    const g = ctx.createGain(); x.connect(g); g.connect(to || au.master); env(g, t, a, peak, d); x.start(t); x.stop(t + a + d + 0.05);
  }
  function audio(out, level = 1) {
    if (!out) { if (au.built) au.master.gain.setTargetAtTime(0, au.ctx.currentTime, 0.1); ev.length = 0; return; }
    if (!au.built) buildAudio(out);
    const t = au.ctx.currentTime, p = st.p;
    const zero = 1 - sstep(0.42, 0.6, p);
    const live = 1 - st.freeze;
    au.master.gain.setTargetAtTime(level, t, 0.2);
    // 勝った瞬間の歓声のあとは、ぴたりと静まる
    const cheering = au.cheer > 0 && t - au.cheer < 2.4;
    const crowdLv = zero * (cheering ? 1 : live);
    au.crowd.gain.setTargetAtTime(crowdLv, t, cheering ? 0.3 : 0.12);
    au.mur.g.gain.setTargetAtTime(0.07 * (0.6 + st.falling), t, 0.3); au.mur.f.frequency.setTargetAtTime(700 + Math.sin(t * 3.1) * 300, t, 0.05);
    // うめき：それぞれが勝手な節回しで、上がっては崩れる
    au.voices.forEach((v, i) => {
      if (cheering) return;
      if (t > v.next) {
        const dur = rr(0.8, 2.6);
        v.next = t + dur + rr(0.1, 1.2);
        const f = v.base * rr(0.85, 1.5);
        v.x.frequency.cancelScheduledValues(t); v.x.frequency.setValueAtTime(v.x.frequency.value, t);
        v.x.frequency.linearRampToValueAtTime(f, t + dur * 0.4); v.x.frequency.exponentialRampToValueAtTime(f * rr(0.6, 0.85), t + dur);
        vowel(v, VK[(rnd() * VK.length) | 0], t, 0.15);
        env(v.g, t, dur * 0.35, rr(0.05, 0.11), dur * 0.65);
      }
    });
    // ざわざわ（短い母音のかけら）
    if (crowdLv > 0.05 && !cheering && t > au.nextSyl) {
      au.nextSyl = t + 0.035 + Math.random() * 0.07;
      const f1 = [380, 520, 650, 780][(Math.random() * 4) | 0];
      noiseHit(t, 0.1, 0.012, 0.05 + Math.random() * 0.1, 'bandpass', f1, 9, f1 * rr(0.8, 1.2), au.crowd);
      noiseHit(t, 0.05, 0.012, 0.05 + Math.random() * 0.08, 'bandpass', f1 * rr(2, 3.4), 12, null, au.crowd);
    }
    ev.forEach((e) => {
      if (e.e === 'fall' && zero > 0.3 && live > 0.5) {   // 叫びながら落ちる＋周りのどよめき＋どさっ
        const f0 = rr(380, 620);
        shout(t, f0, f0 * 0.42, rr(0.7, 1.1), 0.13, rnd() < 0.6 ? 'a' : 'o');
        shout(t + 0.05, rr(150, 220), rr(110, 160), 1.2, 0.05, 'o');
        noiseHit(t, 0.08, 0.25, 0.6, 'bandpass', 500, 2, 2200, au.crowd);
        tone(t + 0.75, 70, 'sine', 0.3, 0.004, 0.45, au.crowd, 32); noiseHit(t + 0.75, 0.14, 0.003, 0.16, 'lowpass', 320, 1, null, au.crowd);
      } else if (e.e === 'win') {                        // 不気味な歓声：全員が同じ高さへずり上がり、ふっと消える
        au.cheer = t;
        const cl = [62, 63, 69, 70, 74, 75, 62, 69, 70];
        au.voices.forEach((v, i) => {
          v.x.frequency.cancelScheduledValues(t); v.x.frequency.setValueAtTime(v.x.frequency.value, t);
          v.x.frequency.exponentialRampToValueAtTime(mtof(cl[i % cl.length]) * rr(0.99, 1.01), t + 0.9);
          vowel(v, 'a', t, 0.2);
          v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.linearRampToValueAtTime(0.12, t + 0.9); v.g.gain.linearRampToValueAtTime(0.0001, t + 2.2);
          v.next = t + 6;
        });
        noiseHit(t, 0.12, 0.6, 1.4, 'bandpass', 1200, 0.8, 3000, au.crowd);
        tone(t, mtof(81), 'sine', 0.08, 0.005, 3.5); tone(t + 0.14, mtof(88), 'sine', 0.05, 0.005, 3.5);
      } else if (e.e === 'join') {
        const P5 = [74, 76, 78, 81, 83, 86];
        tone(t, mtof(P5[e.i % P5.length]), 'sine', 0.05, 0.01, 2.6, au.plus); tone(t, mtof(P5[e.i % P5.length] + 12), 'sine', 0.012, 0.01, 1.4, au.plus);
      }
    });
    ev.length = 0;
    // 勝った後の静けさ：低いうなりと朱の細い音だけ
    const after = st.freeze * zero;
    au.sub.g.gain.setTargetAtTime(0.09 * after, t, 0.6); au.hum.g.gain.setTargetAtTime(0.012 * after, t, 0.8);
    const k = sstep(0.5, 0.85, p);
    au.plus.gain.setTargetAtTime(1, t, 0.3);
    au.warmV.forEach((v, i) => v.g.gain.setTargetAtTime(0.022 * k * (i === 0 ? 1.3 : 1) * (0.4 + 0.6 * st.jn), t, 0.8));
  }

  function dispose() {
    scene.remove(group);
    geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose());
    [win, ...ring].forEach((b) => b.mesh && b.mesh.skeleton && b.mesh.skeleton.dispose && b.mesh.skeleton.dispose());
    if (envTex) envTex.dispose();
    if (au.built) {
      au.master.gain.setTargetAtTime(0, au.ctx.currentTime, 0.05);
      setTimeout(() => { try { au.voices.forEach((v) => v.x.stop()); au.sub.x.stop(); au.hum.x.stop(); au.warmV.forEach((v) => v.x.stop()); au.master.disconnect(); } catch (e) { /* もう止まっている */ } }, 300);
    }
  }
  update(0, 0, 0);
  return { group, update, audio, dispose, setCamera, size: { radius: R, height: H } };
}
