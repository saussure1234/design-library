// 場面5「人の塔」の部品（本線 main2.js に組み込む用・単体確認は c3d-sc5-a.html）
// ゼロサム：人が積み重なって高く伸びた塔に、大勢がよじ登っては引きずり落とされ、宙を回って落ちる。頂上の1人が両手を上げて喜ぶ
// → 塔が崩れ（地鳴り・叫び・どよめき）、人々が床に倒れる → 起き上がって手をつなぐ輪 → 輪の中心に朱（笑顔の総量）が灯って育つ
//
// 使い方：
//   const sc5 = await createScene5({ THREE, scene, center, quality: 'pc' | 'sp', renderer? });
//   毎フレーム const v = sc5.update(t, dt, p)   … p＝場面の進み 0〜1。戻り値 v＝カメラの目安 { lookY, camHeight }（center からの高さ）
//       0〜0.2 塔に群がる・登る・落ちる／0.2〜0.42 頂上の人が喜ぶ／0.42〜0.6 塔が崩れる／0.6〜0.82 起き上がって輪へ／0.74〜1 中心の朱が育つ
//   毎フレーム sc5.audio(SND.out(), level) … 音オフの時は out=null。level＝この場面の音量 0〜1
//       輪の段（p 0.5〜0.78）で lookY 5→0.8・camHeight 3→9.5 に下がる/上がる。これに合わせると輪が画面の中ほどに来る
//   sc5.setCamera(camera) は互換のため残してある（呼ばなくてよい）／片付け sc5.dispose()
//   大きさ：center を床の中心として、塔は高さ約8.2（頂上の人を入れて約10）・裾の半径約2.5。輪は半径約5.3（PC 23人）・約4.7（スマホ 17人）。カメラ約17の距離で収まる
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
      const a = A ? A[n] : null, c = B ? B[n] : null; if (!a && !c) continue;
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
  const mirror = (A) => { const o = {}; for (const n in A) { const m = n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n; o[m] = v3(-A[n].x, A[n].y, A[n].z); } return o; };
  const mixP = (A, B, k) => { const o = {}; for (const n in A) o[n] = B && B[n] ? A[n].clone().normalize().lerp(B[n].clone().normalize(), k) : A[n].clone(); return o; };
  // 登る：左手を上へ掛け右膝を上げる → 中間 → 右手・左膝 → 中間（交互）
  P.C1 = { spine03: v3(0, 1, 0.15), spine01: v3(0.08, 1, 0.2), neck01: v3(0, 1, 0.05), head: v3(0.1, 1, -0.25), upperarm01L: v3(0.2, 1, 0.3), lowerarm01L: v3(0.08, 1, 0.15), upperarm01R: v3(-0.45, 0.1, 0.7), lowerarm01R: v3(-0.1, 0.9, 0.5), upperleg01L: v3(0.08, -1, 0.05), lowerleg01L: v3(0.05, -1, -0.25), upperleg01R: v3(-0.12, -0.25, 0.95), lowerleg01R: v3(-0.05, -1, 0.05) };
  P.C2 = { spine03: v3(0, 1, 0.2), spine01: v3(-0.03, 1, 0.25), neck01: v3(0, 1, 0.05), head: v3(-0.05, 1, -0.3), upperarm01L: v3(0.3, 0.7, 0.6), lowerarm01L: v3(0.1, 1, 0.35), upperarm01R: v3(-0.35, 0.6, 0.6), lowerarm01R: v3(-0.1, 1, 0.35), upperleg01L: v3(0.12, -0.75, 0.55), lowerleg01L: v3(0.05, -1, -0.1), upperleg01R: v3(-0.12, -0.65, 0.65), lowerleg01R: v3(-0.05, -1, -0.12) };
  P.C3 = mirror(P.C1); P.C4 = mirror(P.C2);
  // 落ちる：手足をばたつかせる3つの形と、地面に崩れた形
  P.F1 = P.FALL; P.F2 = P.FALL2;
  P.F3 = { spine03: v3(0, 1, -0.2), spine01: v3(-0.2, 1, -0.3), neck01: v3(0, 1, -0.4), head: v3(0, 0.7, -0.7), upperarm01L: v3(0.7, 1, 0.4), lowerarm01L: v3(0.2, 1, -0.3), upperarm01R: v3(-0.8, 0.9, -0.2), lowerarm01R: v3(-1, 0.6, 0.4), upperleg01L: v3(0.5, -0.8, 0.3), lowerleg01L: v3(0.3, -1, -0.4), upperleg01R: v3(-0.4, -0.7, -0.5), lowerleg01R: v3(-0.2, -1, 0.2) };
  P.LIE = { spine03: v3(0, 1, 0.05), spine01: v3(0.1, 1, 0.1), neck01: v3(0.1, 1, 0), head: v3(0.3, 1, 0.1), upperarm01L: v3(0.9, -0.1, 0.2), lowerarm01L: v3(0.6, 0.5, 0.4), upperarm01R: v3(-0.5, -1, 0.2), lowerarm01R: v3(-0.3, -1, 0.5), upperleg01L: v3(0.25, -1, 0.35), lowerleg01L: v3(0.1, -1, -0.4), upperleg01R: v3(-0.1, -1, -0.05), lowerleg01R: v3(-0.08, -1, 0) };
  // 起き上がる・立つ・歩く
  P.CROUCH = { spine03: v3(0, 1, 0.45), spine01: v3(0, 1, 0.5), neck01: v3(0, 1, 0.2), head: v3(0, 1, 0), upperarm01L: v3(0.25, -1, 0.45), lowerarm01L: v3(0.15, -0.6, 0.9), upperarm01R: v3(-0.25, -1, 0.45), lowerarm01R: v3(-0.15, -0.6, 0.9), upperleg01L: v3(0.15, -0.35, 0.95), lowerleg01L: v3(0.05, -1, -0.35), upperleg01R: v3(-0.15, -0.35, 0.95), lowerleg01R: v3(-0.05, -1, -0.35) };
  P.W1 = { spine03: v3(0, 1, 0.08), spine01: v3(0, 1, 0.1), neck01: v3(0, 1, 0.05), head: v3(0, 1, 0.05), upperarm01L: v3(0.15, -1, -0.35), lowerarm01L: v3(0.1, -1, -0.1), upperarm01R: v3(-0.15, -1, 0.4), lowerarm01R: v3(-0.1, -0.7, 0.7), upperleg01L: v3(0.05, -1, 0.5), lowerleg01L: v3(0.03, -1, 0.15), upperleg01R: v3(-0.05, -1, -0.35), lowerleg01R: v3(-0.03, -1, -0.7) };
  P.W2 = mirror(P.W1);
  // 喜ぶ：沈んで → 両手を突き上げて跳ねる
  P.JOY = { spine03: v3(0, 1, -0.12), spine01: v3(0, 1, -0.2), neck01: v3(0, 1, -0.3), head: v3(0, 1, -0.6), upperarm01L: v3(0.55, 1, 0.05), lowerarm01L: v3(0.35, 1, -0.05), upperarm01R: v3(-0.55, 1, 0.05), lowerarm01R: v3(-0.35, 1, -0.05), upperleg01L: v3(0.1, -1, 0.05), lowerleg01L: v3(0.06, -1, -0.05), upperleg01R: v3(-0.1, -1, 0.05), lowerleg01R: v3(-0.06, -1, -0.05) };
  P.JOYD = { spine03: v3(0, 1, 0.15), spine01: v3(0, 1, 0.12), neck01: v3(0, 1, 0), head: v3(0, 1, -0.25), upperarm01L: v3(0.85, 0.55, 0.15), lowerarm01L: v3(0.15, 1, 0.1), upperarm01R: v3(-0.85, 0.55, 0.15), lowerarm01R: v3(-0.15, 1, 0.1), upperleg01L: v3(0.14, -0.6, 0.8), lowerleg01L: v3(0.06, -1, -0.32), upperleg01R: v3(-0.14, -0.6, 0.8), lowerleg01R: v3(-0.06, -1, -0.32) };
  // 姿勢を付けた形を、骨なしの形に焼く（大勢はこれをインスタンスで並べる）
  function bake(g, A) {
    const b = makeBody(g, null); pose(b, A); b.root.updateMatrixWorld(true);
    const m = b.mesh; m.skeleton.update();
    const pos = m.geometry.attributes.position, n = pos.count, out = new Float32Array(n * 3), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, i); m.applyBoneTransform(i, v); v.applyMatrix4(m.matrixWorld); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(out, 3)); geo.setIndex(m.geometry.index.clone()); geo.computeVertexNormals();
    return geo;
  }
  function morphGeo(g, keys, count) {     // 4つの姿勢を持つ形。aW（インスタンスごとの重み）で混ぜる
    const gs = keys.map((K) => bake(g, K)), ga = gs[0];
    for (let j = 1; j < 4; j++) { ga.setAttribute('p' + j, gs[j].attributes.position); ga.setAttribute('n' + j, gs[j].attributes.normal); }
    ga.setAttribute('aW', new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4));
    for (let j = 1; j < 4; j++) gs[j].dispose();
    return ga;
  }
  // 濡れた石膏（粘りの照り）。頂点を4つの姿勢の間で混ぜる
  const geos = [], mats = [];
  function wetMat(color, morph) {
    const m = new THREE.MeshPhysicalMaterial({ color, roughness: 0.42, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0x9aa3b4), envMapIntensity: 0.6 });
    if (morph) {
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec3 p1, p2, p3, n1, n2, n3;\nattribute vec4 aW;')
          .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(normal * aW.x + n1 * aW.y + n2 * aW.z + n3 * aW.w);\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
          .replace('#include <begin_vertex>', 'vec3 transformed = position * aW.x + p1 * aW.y + p2 * aW.z + p3 * aW.w;');
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
  const H = 8.2;                                         // 塔の高さ（頂上の人を入れて約10）
  const rAt = (y) => lerp(2.15, 0.48, Math.pow(clamp(y / H), 0.85));
  const drAt = (y) => (rAt(y + 0.01) - rAt(y - 0.01)) / 0.02;
  const _n = new THREE.Vector3(), _t = new THREE.Vector3(), _x = new THREE.Vector3(), _mm = new THREE.Matrix4(), _qa = new THREE.Quaternion(), _ax = new THREE.Vector3(), _zf = new THREE.Vector3(), _zz = new THREE.Vector3();
  // 塔の面にしがみつく向き：頭＝上、前＝塔の中（back=true は背中を塔に）
  function towerFrame(y, th, yaw, back, out) {
    const cx = Math.cos(th), cz = Math.sin(th), d = drAt(Math.max(0.05, Math.min(H - 0.05, y)));
    _n.set(cx, -d, cz).normalize();
    _t.set(cx * d, 1, cz * d).normalize(); _t.applyAxisAngle(_n, yaw);
    _zz.copy(_n); if (!back) _zz.negate();
    _x.crossVectors(_t, _zz).normalize(); _zf.crossVectors(_x, _t).normalize();
    _mm.makeBasis(_x, _t, _zf); out.setFromRotationMatrix(_mm);
    return _n;
  }
  const surf = (y, th, off, out) => { const r = rAt(y) + off; return out.set(Math.cos(th) * r, y, Math.sin(th) * r); };
  // 床に倒れた向き
  function lieQuat(a, up, out) {
    _t.set(Math.cos(a), 0, Math.sin(a)); _zz.set(0, up ? 1 : -1, 0);
    _x.crossVectors(_t, _zz).normalize(); _zf.crossVectors(_x, _t).normalize();
    _mm.makeBasis(_x, _t, _zf); return out.setFromRotationMatrix(_mm);
  }
  // 崩れる軌跡：塔の上の位置 → 床。s=0〜1
  const easeOut = (s) => 1 - (1 - s) * (1 - s);
  function collapseAt(c0, out, outQ) {   // c0={p0,q0,l,ql,dl,du,spin,ax}
    const s = clamp((st.c - c0.dl) / c0.du);
    out.set(lerp(c0.p0.x, c0.l.x, easeOut(s)), lerp(c0.p0.y, c0.l.y, s * s) + Math.sin(s * Math.PI) * 0.6, lerp(c0.p0.z, c0.l.z, easeOut(s)));
    outQ.copy(c0.q0).slerp(c0.ql, s);
    if (c0.spin) { _qa.setFromAxisAngle(c0.ax, c0.spin * s); outQ.premultiply(_qa); }
    return s;
  }
  function mkCollapse(p0, q0, y) {
    const th = Math.atan2(p0.z, p0.x) + rr(-0.5, 0.5), rad = rAt(Math.max(0, y)) + rr(0.8, 2.2 + y * 0.6);
    const l = new THREE.Vector3(Math.cos(th) * rad, 0.16, Math.sin(th) * rad);
    return { p0: p0.clone(), q0: q0.clone(), l, ql: lieQuat(rnd() * TAU, rnd() < 0.4, new THREE.Quaternion()), dl: rr(0, 0.3) + 0.25 * (y / H), du: rr(0.32, 0.48), spin: TAU * Math.round(rr(-1.4, 1.4)), ax: new THREE.Vector3(-Math.sin(th), 0, Math.cos(th)) };
  }
  // 塔の芯（黒い塊・人の隙間を埋める）
  const coreG = (() => {
    const pts = []; for (let i = 0; i <= 40; i++) { const y = H * i / 40; pts.push(new THREE.Vector2(Math.max(0.01, rAt(y) - 0.32), y)); }
    pts.push(new THREE.Vector2(0.001, H));
    const g = new THREE.LatheGeometry(pts, SP ? 48 : 96);
    const pa = g.attributes.position; const v = new THREE.Vector3();
    for (let i = 0; i < pa.count; i++) { v.fromBufferAttribute(pa, i); const k = 1 + 0.08 * Math.sin(v.y * 3.1) * Math.sin(Math.atan2(v.z, v.x) * 5 + v.y); pa.setX(i, v.x * k); pa.setZ(i, v.z * k); }
    g.computeVertexNormals(); geos.push(g); return g;
  })();
  const core = new THREE.Mesh(coreG, new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 0.3 })); mats.push(core.material);
  group.add(core);
  // 床（中は不透明＝沈んだ物を隠す・外へ向かって闇に溶ける）
  {
    const g1 = new THREE.CircleGeometry(24, 96); geos.push(g1);
    const f1 = new THREE.Mesh(g1, new THREE.MeshStandardMaterial({ color: 0x030304, roughness: 0.9, metalness: 0, envMapIntensity: 0 })); mats.push(f1.material);
    f1.rotation.x = -Math.PI / 2; group.add(f1);
    const g2 = new THREE.RingGeometry(24, 70, 96, 1); geos.push(g2);
    const f2 = new THREE.Mesh(g2, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: {}, vertexShader: 'varying vec3 vP;void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 vP;void main(){float r=length(vP.xy);gl_FragColor=vec4(vec3(.008),1.-smoothstep(24.,70.,r));}' }));
    mats.push(f2.material); f2.rotation.x = -Math.PI / 2; f2.position.y = -0.002; group.add(f2);
  }
  // 積み重なった人（塔の面）。形＝[うごめく2つ, 落ちてばたつく2つ]
  const NH = SP ? 120 : 220;
  const heapGeo = morphGeo(gLo2, [P.HEAP, P.HEAP2, P.F1, P.F2], NH); geos.push(heapGeo);
  const heap = new THREE.InstancedMesh(heapGeo, wetMat(0x6a6e77, true), NH); heap.frustumCulled = false; group.add(heap);
  const heapPh = new Float32Array(NH), heapSp = new Float32Array(NH), heapC = [];
  {
    const q = new THREE.Quaternion(), p = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < NH; i++) {
      const y = H * Math.pow(rnd(), 1.25) * 0.97, th = rnd() * TAU, back = rnd() < 0.25;
      towerFrame(y, th, rr(-0.6, 0.6), back, q);
      surf(y, th, rr(-0.12, 0.2), p);
      _ax.set(0, 1, 0).applyQuaternion(q); p.addScaledVector(_ax, -0.75);
      heapC.push(mkCollapse(p, q, y)); heapC[i].s = rr(0.93, 1.06);
      c.setScalar(rr(0.45, 1)); heap.setColorAt(i, c);
      heapPh[i] = rnd() * TAU; heapSp[i] = rr(0.3, 0.9);
    }
    heap.instanceColor.needsUpdate = true;
  }
  // 登る人（手足を交互に掛ける4つの形）・落ちる人（ばたつく3つの形＋崩れて倒れた形）
  const NK = SP ? 48 : 96;
  const climbGeo = morphGeo(gLo, [P.C1, P.C2, P.C3, P.C4], NK), fallGeo = morphGeo(gLo, [P.F1, P.F2, P.F3, P.LIE], NK); geos.push(climbGeo, fallGeo);
  const climb = new THREE.InstancedMesh(climbGeo, wetMat(0x7d828b, true), NK); climb.frustumCulled = false; group.add(climb);
  const fall = new THREE.InstancedMesh(fallGeo, wetMat(0x7d828b, true), NK); fall.frustumCulled = false; group.add(fall);
  const ag = [];
  for (let i = 0; i < NK; i++) ag.push({ th: rnd() * TAU, y: rr(0, H * 0.8), sp: rr(0.35, 0.65), ph: rnd() * TAU, cy: rnd() * 4, mode: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), q: new THREE.Quaternion(), qf: new THREE.Quaternion(), qt: new THREE.Quaternion(), spinAx: new THREE.Vector3(), spinW: 0, land: 0, lie: 0, yaw: rr(-0.4, 0.4), col: null });
  // 頂上の人（骨つき）
  const hiMat = wetMat(0x80858e, false);
  const win = makeBody(gHi, hiMat); group.add(win.root);
  const winTop = new THREE.Vector3(0, H - 0.05, 0);
  const winC = mkCollapse(winTop, new THREE.Quaternion(), H); winC.dl = 0.05; winC.du = 0.5; winC.l.set(1.2, 0.16, 4.2);
  // 輪になる人（骨つき）。はじめは塔の一部
  const NR = SP ? 16 : 22, NRR = NR + 1, RR = 1.45 / (2 * Math.sin(Math.PI / NRR));
  const ring = [];
  for (let i = 0; i < NR; i++) {
    const b = makeBody(gHi, hiMat); group.add(b.root);
    const y = rr(0.6, H - 2.2), th = (i / NR) * TAU + 0.3, q = new THREE.Quaternion(), p0 = new THREE.Vector3();
    towerFrame(y, th, rr(-0.4, 0.4), false, q); surf(y, th, 0.22, p0);
    _ax.set(0, 1, 0).applyQuaternion(q); p0.addScaledVector(_ax, -0.75);
    b.col = mkCollapse(p0, q, y); b.ph = rnd() * TAU; b.joined = false; ring.push(b);
  }
  win.col = winC; win.ph = 0; win.joined = false;
  const members = [...ring, win];       // 頂上の人も最後は輪に入る
  members.forEach((b) => { b.qW = new THREE.Quaternion(); b.qR = new THREE.Quaternion(); });
  // 光：頂上だけを照らす冷たいスポット／縁の光／輪の中心の朱
  const top = new THREE.SpotLight(0xe4ebf5, 240, 13, 0.22, 0.6, 1.6); top.position.set(0.5, H + 8, 1.4); top.target.position.set(0, H, 0); group.add(top, top.target);
  const rimA = new THREE.SpotLight(0x8792a6, 150, 40, 0.75, 0.8, 1.4); rimA.position.set(-9, 11, -14); rimA.target.position.set(0, 3, 0); group.add(rimA, rimA.target);
  const rimB = new THREE.SpotLight(0x5c6578, 70, 40, 0.75, 0.8, 1.4); rimB.position.set(12, 5, -8); rimB.target.position.set(0, 3, 0); group.add(rimB, rimB.target);
  const fill = new THREE.PointLight(0x39404c, 5, 26, 1.6); fill.position.set(0, 8, 12); group.add(fill);
  const coneG = new THREE.ConeGeometry(2.0, 8, 48, 1, true); coneG.translate(0, -4, 0); geos.push(coneG);
  const cone = new THREE.Mesh(coneG, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0.12 } },
    vertexShader: 'varying float vY;varying vec3 vN,vV;void main(){vY=position.y;vec4 w=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-w.xyz);gl_Position=projectionMatrix*w;}',
    fragmentShader: 'uniform float uA;varying float vY;varying vec3 vN,vV;void main(){float f=pow(abs(dot(vN,vV)),2.);float y=clamp(1.+vY/8.,0.,1.);gl_FragColor=vec4(vec3(.8,.85,.92)*uA*f*y*y,1.);}',
  })); mats.push(cone.material);
  cone.position.copy(top.position); cone.lookAt(new THREE.Vector3(0, H, 0).add(group.position)); cone.rotateX(-Math.PI / 2); group.add(cone);
  const glowMat = (a) => new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
    vertexShader: 'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: 'uniform float uA;varying vec2 vU;void main(){float d=length(vU-.5)*2.;float g=exp(-d*d*' + a + ')*1.4+exp(-d*d*60.)*2.;gl_FragColor=vec4(vec3(1.,.36,.13)*g*uA,1.);}' });
  const warm = new THREE.PointLight(SIG, 0, 30, 1.4); warm.position.set(0, 0.6, 0); group.add(warm);
  const floorGlow = new THREE.Mesh(new THREE.CircleGeometry(1, 64), glowMat('6.')); geos.push(floorGlow.geometry); mats.push(floorGlow.material);
  floorGlow.rotation.x = -Math.PI / 2; floorGlow.position.y = 0.02; group.add(floorGlow);
  if (envTex) mats.forEach((m) => { if (m.isMeshStandardMaterial) m.envMap = envTex; });

  // ---------- 動き ----------
  const ev = [];
  const st = { p: 0, c: 0, jn: 0, falling: 0, fallsRecent: 0, cheer: false, collapsed: false, landed: 0 };
  const tq = new THREE.Quaternion(), tp = new THREE.Vector3(), tsc = new THREE.Vector3(1, 1, 1), qSpin = new THREE.Quaternion(), tmp = new THREE.Vector3(), tmpB = new THREE.Vector3();
  let lastT = -1, lastLand = 0;
  const G = 7;   // 落ちる速さ（少し遅く＝不気味に）
  const sm = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const W = [0, 0, 0, 0];
  // n 個の形を順にめぐる重み（u は形の番号の単位）
  function cyc(u, n) { W[0] = W[1] = W[2] = W[3] = 0; const fu = ((u % n) + n) % n, k0 = Math.floor(fu), f = sm(fu - k0); W[k0] += 1 - f; W[(k0 + 1) % n] += f; return W; }
  function putW(arr, i, w, to, l) {   // to=倒れた形の番号, l=そこへ寄せる量
    let a = w[0], b = w[1], c = w[2], d = w[3];
    if (l > 0) { a *= 1 - l; b *= 1 - l; c *= 1 - l; d *= 1 - l; if (to === 0) a += l; else d += l; }
    arr[i * 4] = a; arr[i * 4 + 1] = b; arr[i * 4 + 2] = c; arr[i * 4 + 3] = d;
  }
  // 着地：少し弾んでから崩れる（s が 1 になった後の進み）
  const settleOf = (C) => clamp((st.c - C.dl - C.du) / 0.07);
  const FLAIL = [P.F1, P.F2, P.F3];
  const WMID = mixP(P.W1, P.W2, 0.5);
  const CL = [P.C1, P.C2, P.C3, P.C4];
  const view = { lookY: 5, camHeight: 3 };

  function update(t, dt, p) {
    dt = Math.min(dt, 0.05);
    st.p = p;
    if (ev.length > 24) ev.length = 0;
    const cheer = sstep(0.2, 0.27, p);            // 頂上の人が喜ぶ
    st.c = clamp((p - 0.42) / 0.18);              // 塔が崩れる（0.42〜0.60）
    const c = st.c;
    const k = sstep(0.42, 0.8, p);
    const sinkD = sstep(0.6, 0.74, p);            // 崩れた人は床へ沈む
    const live = 1 - sstep(0.4, 0.43, p);
    if (cheer > 0.9 && !st.cheer) { st.cheer = true; ev.push({ e: 'cheer' }); } if (cheer < 0.5) st.cheer = false;
    if (c > 0.02 && !st.collapsed) { st.collapsed = true; ev.push({ e: 'collapse' }); } if (c <= 0) st.collapsed = false;
    core.scale.set(1 + c * 0.6, Math.max(0.001, 1 - c), 1 + c * 0.6); core.visible = c < 0.999;
    // 塔の面の人：うごめく → 崩落でばたつきながら落ち、着地で崩れる
    const hw = heap.geometry.attributes.aW.array;
    let landed = 0;
    for (let i = 0; i < NH; i++) {
      const C = heapC[i];
      if (c <= 0) {
        const m = 0.5 + 0.5 * Math.sin(t * heapSp[i] * live + heapPh[i]);
        W[0] = 1 - m; W[1] = m; W[2] = W[3] = 0; putW(hw, i, W, 0, 0);
        tp.copy(C.p0); tq.copy(C.q0);
      } else {
        const s = collapseAt(C, tp, tq);
        const f = 0.5 + 0.5 * Math.sin(t * 9 + heapPh[i]);
        W[0] = W[1] = 0; W[2] = 1 - f; W[3] = f;
        let l = 0;
        if (s >= 1) { landed++; const sl = settleOf(C); l = sm(sl); tp.y += Math.sin(sl * Math.PI) * 0.2; }
        putW(hw, i, W, 0, l);
      }
      tp.y -= sinkD * 1.2;
      tsc.setScalar(C.s); heap.setMatrixAt(i, _mm.compose(tp, tq, tsc));
    }
    tsc.setScalar(1);
    heap.instanceMatrix.needsUpdate = true; heap.geometry.attributes.aW.needsUpdate = true;
    // 登る（手足を交互に）・引きずり落とされる（ばたつきながら回る）・着地で崩れる・倒れている
    const cw = climb.geometry.attributes.aW.array, fw = fall.geometry.attributes.aW.array;
    let falling = 0, ci = 0, fi = 0;
    for (let i = 0; i < NK; i++) {
      const a = ag[i];
      if (c > 0) {
        if (!a.col) { const yy = a.mode === 0 ? a.y : a.pos.y; a.col = mkCollapse(a.mode === 0 ? surf(a.y, a.th, 0.32, tmp) : a.pos, a.q, Math.max(0, yy)); a.col.dl *= 0.6; }
        const s = collapseAt(a.col, tp, tq);
        let l = 0;
        if (s >= 1) { landed++; const sl = settleOf(a.col); l = sm(sl); tp.y += Math.sin(sl * Math.PI) * 0.2; }
        tp.y -= sinkD * 1.2;
        fall.setMatrixAt(fi, _mm.compose(tp, tq, tsc)); putW(fw, fi++, cyc(t * 6 + a.ph, 3), 3, l);
        continue;
      }
      if (a.col) { a.col = null; a.mode = 2; a.land = 1; a.lie = rr(0.5, 2); a.pos.set(Math.cos(a.th) * 3.5, 0.16, Math.sin(a.th) * 3.5); lieQuat(a.th, false, a.qt); a.qf.copy(a.qt); }
      if (a.mode === 0) {          // 登る：手を掛けて体を引き上げる時に上がる
        const du = dt * 1.5 * (0.7 + a.sp);
        a.cy += du;
        const push = Math.sin(Math.PI * (a.cy % 1));
        a.y += a.sp * dt * (0.25 + 1.4 * push);
        const hz = 0.02 + 0.8 * Math.pow(a.y / H, 3);
        const sway = Math.sin(a.cy * Math.PI * 0.5) * 0.14;
        const n = towerFrame(a.y, a.th, a.yaw + sway, false, tq);
        surf(a.y, a.th, 0.32, tp);
        _ax.set(1, 0, 0).applyQuaternion(tq); qSpin.setFromAxisAngle(_ax, -0.3 - 0.08 * push); tq.premultiply(qSpin);
        a.q.copy(tq);
        if (rnd() < hz * dt || a.y > H - 1.3) {
          a.mode = 1; a.pos.copy(tp); a.vel.copy(n).multiplyScalar(rr(1.2, 2.6)); a.vel.y = rr(0.5, 1.8);
          _ax.set(rr(-1, 1), rr(-0.3, 0.3), rr(-1, 1)).normalize(); a.spinAx.set(-Math.sin(a.th), 0, Math.cos(a.th)).lerp(_ax, 0.35).normalize(); a.spinW = rr(2.5, 6) * (rnd() < 0.5 ? 1 : -1);
          if (st.fallsRecent < 3) { ev.push({ e: 'fall', h: a.y / H }); st.fallsRecent++; }
        }
        climb.setMatrixAt(ci, _mm.compose(tp, tq, tsc)); putW(cw, ci++, cyc(a.cy, 4), 0, 0);
      } else if (a.mode === 1) {   // 宙を回りながら落ちる
        falling++;
        a.vel.y -= G * dt; a.pos.addScaledVector(a.vel, dt);
        qSpin.setFromAxisAngle(a.spinAx, a.spinW * dt); a.q.premultiply(qSpin);
        if (a.pos.y < 0.25) {
          a.mode = 2; a.land = 0; a.lie = rr(1.2, 3.5); a.pos.y = 0.16; a.qf.copy(a.q); lieQuat(rnd() * TAU, rnd() < 0.5, a.qt);
          if (t - lastLand > 0.25) { lastLand = t; ev.push({ e: 'thud' }); }
        }
        fall.setMatrixAt(fi, _mm.compose(a.pos, a.q, tsc)); putW(fw, fi++, cyc(t * 7 + a.ph, 3), 3, 0);
      } else {                     // 着地で弾んで崩れる → しばらく倒れている → また塔へ
        a.land += dt;
        const l = sm(a.land / 0.35);
        tq.copy(a.qf).slerp(a.qt, l); tp.copy(a.pos); tp.y += Math.sin(Math.min(1, a.land / 0.35) * Math.PI) * 0.22 * (1 - l);
        a.lie -= dt;
        fall.setMatrixAt(fi, _mm.compose(tp, tq, tsc)); putW(fw, fi++, cyc(t * 7 + a.ph, 3), 3, l * (0.94 + 0.06 * Math.sin(t * 3 + a.ph)));
        if (a.lie < 0) { a.mode = 0; a.y = 0.1; a.th = rnd() * TAU; a.sp = rr(0.35, 0.65); }
      }
    }
    climb.count = ci; fall.count = fi;
    climb.instanceMatrix.needsUpdate = true; fall.instanceMatrix.needsUpdate = true;
    climb.geometry.attributes.aW.needsUpdate = true; fall.geometry.attributes.aW.needsUpdate = true;
    st.falling = falling / NK;
    st.landRate = Math.max(0, landed - st.landed); st.landed = landed;
    if (Math.floor(t * 2) !== Math.floor(lastT * 2)) st.fallsRecent = 0;
    lastT = t;
    // 頂上の人：手足を交互に掛けて最後のひと登り → 立ち上がる → 沈んでは跳ね、両手を突き上げる
    const wc = sstep(0.04, 0.18, p), stand = sstep(0.17, 0.22, p);
    const wPos = tmpB, wQ = tq;
    let wDrop = 0;
    if (stand < 0.01) {
      const wy = lerp(H - 2.6, H - 0.3, wc);
      towerFrame(wy, 1.75, Math.sin(t * 2.3) * 0.12, false, wQ); surf(wy, 1.75, 0.3, wPos);
      _ax.set(1, 0, 0).applyQuaternion(wQ); qSpin.setFromAxisAngle(_ax, -0.3); wQ.premultiply(qSpin);
      const u = t * 2.2, k0 = Math.floor(u) % 4;
      pose(win, CL[k0], CL[(k0 + 1) % 4], sm(u % 1));
    } else {
      wPos.copy(winTop);
      wQ.setFromAxisAngle(_ax.set(0, 1, 0), 0.25 + Math.sin(t * 0.9) * 0.15 * cheer);
      const u = (t * 1.5) % 1;
      const up = sstep(0.2, 0.42, u) * (1 - sstep(0.72, 0.95, u));    // 0=沈む 1=伸び上がる
      const jump = u > 0.38 && u < 0.78 ? Math.sin((u - 0.38) / 0.4 * Math.PI) * 0.32 : 0;
      const Pj = mixP(P.JOYD, P.JOY, up);
      if (stand < 1) pose(win, P.CROUCH, Pj, stand); else pose(win, mixP(P.JOY, Pj, cheer), null, 0);
      wDrop = -0.28 * (1 - up) * cheer - 0.3 * (1 - stand);
      wPos.y += (jump * cheer) + wDrop;
    }
    winC.p0.copy(winTop); winC.q0.copy(_qa.setFromAxisAngle(_ax.set(0, 1, 0), 0.25));
    top.intensity = 240 * (1 - sstep(0.42, 0.55, p));
    cone.material.uniforms.uA.value = 0.12 * (1 - sstep(0.42, 0.55, p));
    // 輪：崩れて倒れた所から起き上がり、歩いて集まり、向き直って手をつなぐ
    let joined = 0;
    members.forEach((b, i) => {
      const isWin = b === win;
      const ki = clamp((p - (0.6 + (i / NRR) * 0.1)) / 0.12);
      const ra = (i / NRR) * TAU + t * 0.02 * k;
      const rp = tmp.set(Math.cos(ra) * RR, 0, Math.sin(ra) * RR);
      if (c <= 0) {
        if (isWin) { b.root.position.copy(wPos); b.root.quaternion.copy(wQ); }
        else { b.root.position.copy(b.col.p0); b.root.quaternion.copy(b.col.q0); pose(b, P.HEAP, P.HEAP2, 0.5 + 0.5 * Math.sin(t * 0.5 + b.ph)); }
      } else if (ki <= 0) {     // 崩落：ばたつきながら落ち、着地で崩れる
        const s = collapseAt(b.col, b.root.position, b.root.quaternion);
        if (s < 1) { const u = t * 6 + b.ph, k0 = Math.floor(u) % 3; pose(b, FLAIL[k0], FLAIL[(k0 + 1) % 3], sm(u % 1)); }
        else { const sl = settleOf(b.col); b.root.position.y += Math.sin(sl * Math.PI) * 0.2; pose(b, P.F2, P.LIE, sm(sl)); }
      } else {
        const L = b.col.l;
        const gu = clamp(ki / 0.25), wk = clamp((ki - 0.25) / 0.6), fk = sm((ki - 0.85) / 0.15);
        const dx = rp.x - L.x, dz = rp.z - L.z, dist = Math.hypot(dx, dz);
        b.qW.setFromAxisAngle(_ax.set(0, 1, 0), Math.atan2(dx, dz));
        b.qR.setFromAxisAngle(_ax.set(0, 1, 0), -ra - Math.PI / 2);
        if (gu < 1) {             // 起き上がる：倒れた形 → しゃがむ → 立つ
          b.root.position.set(L.x, lerp(0.16, 0, sm(gu)), L.z);
          b.root.quaternion.copy(b.col.ql).slerp(b.qW, sm(gu * 1.3));
          if (gu < 0.55) { pose(b, P.LIE, P.CROUCH, sm(gu / 0.55)); b.root.position.y -= 0.3 * sm(gu / 0.55); }
          else { pose(b, P.CROUCH, WMID, sm((gu - 0.55) / 0.45)); b.root.position.y -= 0.3 * (1 - sm((gu - 0.55) / 0.45)); }
        } else if (fk <= 0) {     // 歩く（腕と脚を交互に振る・上下に弾む）
          const e = sm(wk);
          b.root.position.set(lerp(L.x, rp.x, e), 0, lerp(L.z, rp.z, e));
          const ph = dist * e * 1.7;
          b.root.position.y = -0.05 + 0.05 * Math.abs(Math.cos(ph * Math.PI));
          b.root.quaternion.copy(b.qW);
          pose(b, P.W1, P.W2, 0.5 + 0.5 * Math.sin(ph * Math.PI) * Math.min(1, dist * 2) * (1 - sstep(0.85, 1, wk)));
        } else {                  // 中心へ向き直り、手を伸ばしてつなぐ
          b.root.position.copy(rp);
          b.root.quaternion.copy(b.qW).slerp(b.qR, fk);
          const Rg = { ...P.RING, upperarm01L: v3(1, -0.5 + Math.sin(t * 0.9 + i * 0.5) * 0.04, 0.3), upperarm01R: v3(-1, -0.5 + Math.sin(t * 0.9 + i * 0.5) * 0.04, 0.3) };
          pose(b, WMID, Rg, fk);
        }
      }
      if (ki > 0.98) { joined++; if (!b.joined) { b.joined = true; ev.push({ e: 'join', i }); } }
      if (ki < 0.5) b.joined = false;
    });
    st.jn = joined / NRR;
    const gw = sstep(0.74, 1, p) * (0.3 + 0.7 * st.jn);
    warm.intensity = gw * 140; floorGlow.material.uniforms.uA.value = gw * 1.1; floorGlow.scale.setScalar(1 + gw * RR * 0.9);
    // カメラの目安（center からの高さ）：塔の段＝塔の中ほど、輪の段＝輪が画面の中ほどに来る高さ
    const kv = sstep(0.5, 0.78, p);
    view.lookY = lerp(5, 0.8, kv); view.camHeight = lerp(3, 9.5, kv);
    return view;
  }
  function setCamera(cam) { scene.userData.__cam = cam; }   // 互換のため残す（今は使わない）

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
    au.master.gain.setTargetAtTime(level, t, 0.2);
    // 群衆：塔の間はうめき・ざわめき。崩落で叫びが増え、倒れたあとは静まる
    const crowdLv = 1 - sstep(0.62, 0.72, p);
    const panic = sstep(0.42, 0.46, p) * (1 - sstep(0.58, 0.66, p));
    au.crowd.gain.setTargetAtTime(crowdLv, t, 0.2);
    au.mur.g.gain.setTargetAtTime(0.07 * (0.6 + st.falling) + 0.12 * panic, t, 0.3); au.mur.f.frequency.setTargetAtTime(700 + Math.sin(t * 3.1) * 300 + panic * 500, t, 0.05);
    au.voices.forEach((v) => {
      if (t > v.next) {
        const dur = rr(0.8, 2.6) * (1 - panic * 0.6);
        v.next = t + dur + rr(0.1, 1.2) * (1 - panic * 0.8);
        const f = v.base * rr(0.85, 1.5) * (1 + panic * 1.2);
        v.x.frequency.cancelScheduledValues(t); v.x.frequency.setValueAtTime(v.x.frequency.value, t);
        v.x.frequency.linearRampToValueAtTime(f, t + dur * 0.4); v.x.frequency.exponentialRampToValueAtTime(f * rr(0.6, 0.85), t + dur);
        vowel(v, panic > 0.3 ? 'a' : VK[(rnd() * VK.length) | 0], t, 0.15);
        env(v.g, t, dur * 0.35, rr(0.05, 0.11) * (1 + panic * 0.5), dur * 0.65);
      }
    });
    if (crowdLv > 0.05 && t > au.nextSyl) {
      au.nextSyl = t + 0.035 + Math.random() * 0.07;
      const f1 = [380, 520, 650, 780][(Math.random() * 4) | 0];
      noiseHit(t, 0.1, 0.012, 0.05 + Math.random() * 0.1, 'bandpass', f1, 9, f1 * rr(0.8, 1.2), au.crowd);
      noiseHit(t, 0.05, 0.012, 0.05 + Math.random() * 0.08, 'bandpass', f1 * rr(2, 3.4), 12, null, au.crowd);
    }
    // 崩落の間：どさどさと落ちる音、ときどき叫び
    if (panic > 0.1 && st.landRate > 0 && t > (au.nextThud || 0)) {
      au.nextThud = t + 0.06 + Math.random() * 0.08;
      tone(t, rr(55, 85), 'sine', 0.22, 0.004, 0.35, au.crowd, 30); noiseHit(t, 0.1, 0.003, 0.14, 'lowpass', 300, 1, null, au.crowd);
    }
    if (panic > 0.2 && t > (au.nextScream || 0)) { au.nextScream = t + rr(0.15, 0.45); const f0 = rr(420, 700); shout(t, f0, f0 * rr(0.4, 0.6), rr(0.6, 1.0), 0.09, rnd() < 0.7 ? 'a' : 'e'); }
    ev.forEach((e) => {
      if (e.e === 'fall' && p < 0.42) {   // 叫びながら落ちる＋周りのどよめき
        const f0 = rr(380, 620);
        shout(t, f0, f0 * 0.42, rr(0.7, 1.1), 0.13, rnd() < 0.6 ? 'a' : 'o');
        shout(t + 0.05, rr(150, 220), rr(110, 160), 1.2, 0.05, 'o');
        noiseHit(t, 0.08, 0.25, 0.6, 'bandpass', 500, 2, 2200, au.crowd);
      } else if (e.e === 'thud' && p < 0.42) {
        tone(t, 70, 'sine', 0.3, 0.004, 0.45, au.crowd, 32); noiseHit(t, 0.14, 0.003, 0.16, 'lowpass', 320, 1, null, au.crowd);
      } else if (e.e === 'cheer') {      // 頂上の人の勝ちどき（ひとりの声が上がる）＋下のざわめきが沸く
        shout(t, 180, 330, 1.4, 0.16, 'o'); shout(t + 0.9, 220, 380, 1.2, 0.13, 'a'); shout(t + 1.9, 240, 400, 1.6, 0.12, 'a');
        noiseHit(t + 0.3, 0.1, 0.8, 1.8, 'bandpass', 900, 0.8, 2400, au.crowd);
      } else if (e.e === 'collapse') {   // 崩落：低い地鳴り＋軋み＋割れる音＋どよめき
        noiseHit(t, 0.5, 0.3, 3.2, 'lowpass', 180, 2, 60);
        tone(t, 46, 'sawtooth', 0.12, 0.4, 2.8, null, 28);
        for (let j = 0; j < 7; j++) noiseHit(t + j * rr(0.08, 0.22), 0.18, 0.002, 0.08, 'bandpass', rr(1200, 3200), 6);
        const fl = au.ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 650; fl.Q.value = 6; fl.connect(au.master);
        tone(t, 26, 'sawtooth', 0.35, 0.1, 1.2, fl, 55);
        noiseHit(t + 0.1, 0.18, 0.4, 1.6, 'bandpass', 700, 1.5, 2600, au.crowd);
      } else if (e.e === 'join') {
        const P5 = [74, 76, 78, 81, 83, 86];
        tone(t, mtof(P5[e.i % P5.length]), 'sine', 0.05, 0.01, 2.6, au.plus); tone(t, mtof(P5[e.i % P5.length] + 12), 'sine', 0.012, 0.01, 1.4, au.plus);
      }
    });
    ev.length = 0;
    // 崩れたあとの静けさ（低いうなり）
    const after = sstep(0.58, 0.64, p) * (1 - sstep(0.7, 0.8, p));
    au.sub.g.gain.setTargetAtTime(0.08 * after, t, 0.6); au.hum.g.gain.setTargetAtTime(0, t, 0.3);
    const k = sstep(0.7, 0.92, p);
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
  return { group, update, audio, dispose, setCamera, size: { radius: 2.5, height: H, ring: RR } };
}
