// 試作B2「信号を探す宇宙の航行」作り込み版 — すべて自作（three.js 本体と公式 addons のみ使用）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SND } from './sound.js';
import { createTVShow } from './tvshow.js';

const root = document.documentElement;
const ld = document.getElementById('ld'), ldt = document.getElementById('ldt');
if (root.classList.contains('nogl')) { ld?.remove(); throw new Error('no webgl'); }

const SP = matchMedia('(max-width: 820px)').matches || /iPhone|Android.+Mobile/.test(navigator.userAgent);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QS = new URLSearchParams(location.search);
const QLOCK = QS.has('q') ? +QS.get('q') : -1;
const Q = SP
  ? { rocks: 150, shards: 600, dustN: 160, dustM: 2600, dustF: 4000, conv: 4200, tvs: 36, trees: 7, depth: 7, planks: 70, haze: 10, warpTaps: 4, intro: 3200 }
  : { rocks: 380, shards: 1700, dustN: 420, dustM: 7600, dustF: 12000, conv: 14000, tvs: 84, trees: 14, depth: 8, planks: 130, haze: 22, warpTaps: 8, intro: 9000 };
// 性能の段（重い順）。測って遅ければ1段ずつ下げる
const TIERS = [
  { dpr: 1.5, taps: 24, dof: 1 },
  { dpr: 1.25, taps: 16, dof: 1 },
  { dpr: 1, taps: 10, dof: 1 },
  { dpr: 0.85, taps: 1, dof: 0 },
];
let tier = QLOCK >= 0 ? Math.min(3, QLOCK) : (SP ? 2 : 0);

// ---------- 乱数・道具 ----------
let seed = 20261123;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const randDir = () => { const u = rr(-1, 1), a = rr(0, Math.PI * 2), s = Math.sqrt(1 - u * u); return V(s * Math.cos(a), u, s * Math.sin(a)); };
const TAU = Math.PI * 2;
const FX = 1; // 光の層（被写界深度をかけない・深度では隠れる）
const fx = (o) => { o.traverse((c) => c.layers.set(FX)); return o; };

// ---------- 場面の配置 ----------
// T=主役の位置 / A=カメラが止まる位置 / M=間の通り道
const T = [V(0, 0, -34), V(4.4, 1.4, -66), V(4, 4, -150), V(-6, 0, -220), V(0, 0, -290), V(8, 3, -350), V(0, 9, -432)];
const A = [V(0, 0.5, 0), V(7.3, 1.6, -52), V(3, 2.6, -127), V(-5.2, 0.9, -209.6), V(0, 1.2, -273), V(7.6, 3.7, -334), V(-6.5, 12.8, -409)];
const M = [V(2.8, 1.3, -30), V(6, 1.6, -103), V(-3, 2.2, -182), V(-17, 3, -246), V(4, 2.2, -312), V(2, 8.5, -374)];
const camPts = []; for (let k = 0; k < 7; k++) { camPts.push(A[k]); if (k < 6) camPts.push(M[k]); }
const camCurve = new THREE.CatmullRomCurve3(camPts, false, 'catmullrom', 0.5);
const lineCurve = new THREE.CatmullRomCurve3([
  V(0, 0, -34), V(3, -0.4, -46), V(6, -0.95, -58), V(6, -0.95, -80), V(6, -0.95, -101), V(5, 0.6, -128), V(4, 1.6, -150),
  V(0, 0.8, -186), V(-2, -3.5, -204), V(-8, -2.5, -222), V(-6, 0, -226.5), V(-2, 0, -262), V(0, 0, -290), V(4, 1, -320), V(8, 2.4, -350),
  V(5, 5.2, -392), V(1, 8.4, -418), V(0, 9, -432), V(0, 11, -500), V(0, 13, -600), V(0, 15, -720)], false, 'catmullrom', 0.5);
const camSamples = camCurve.getSpacedPoints(500);
const distToPath = (p) => { let m = 1e9; for (const s of camSamples) { const d = s.distanceToSquared(p); if (d < m) m = d; } return Math.sqrt(m); };
const heroClear = [6, 12, 7, 17, 17, 12, 9];
const inHall = (p) => p.x > 0.5 && p.x < 11 && p.z < -54 && p.z > -108 && p.y > -4 && p.y < 7;
const onBridge = (p) => p.z < -405 && Math.abs(p.x) < 6 && p.y > 3 && p.y < 17;
const nearHero = (p) => { if (inHall(p) || onBridge(p)) return true; for (let k = 0; k < 7; k++) if (p.distanceTo(T[k]) < heroClear[k]) return true; return false; };

// ---------- 色（紺〜青灰の1系統＋朱は信号だけ） ----------
const FOG0 = new THREE.Color().setRGB(0.0016, 0.0022, 0.0042);   // 霧＝ほぼ黒（光がかすかに見える程度・So 11/24）
const CREAM = new THREE.Color().setRGB(0.92, 0.905, 0.85);    // 生成り（線形）
const SIG = new THREE.Color().setRGB(1, 0.30, 0.10);
const PALE = new THREE.Color().setRGB(0.62, 0.71, 0.86);      // 青灰の光

// ---------- 描画の土台 ----------
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true });
} catch (e) { root.classList.add('nogl'); ld?.remove(); throw e; }
let DPR = Math.min(devicePixelRatio || 1, TIERS[tier].dpr);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.autoClear = false;

const scene = new THREE.Scene();
const FOGD = 0.021;
scene.fog = new THREE.FogExp2(FOG0.clone(), FOGD);
const camera = new THREE.PerspectiveCamera(SP ? 62 : 46, innerWidth / innerHeight, 0.1, 1600);
camera.position.copy(A[0]);
camera.layers.enableAll();
scene.add(camera);

const U = {
  time: { value: 0 }, fogCol: { value: scene.fog.color }, fogD: { value: FOGD }, dawn: { value: 0 },
  camPos: { value: new THREE.Vector3() }, focus: { value: 20 }, px: { value: 1000 }, dpr: { value: DPR },
};

// ---------- 読み込み中（等幅の進捗） ----------
const prog = { a: 0, b: 0, c: 0, d: 0, e: 0 };
let shownPct = 0;
const ldTick = () => {
  const p = (prog.a + prog.b + prog.c + prog.d + prog.e) / 5;
  shownPct += (p - shownPct) * 0.2;
  const n = 22, f = Math.round(shownPct * n);
  if (ldt) ldt.textContent = `[${'/'.repeat(f)}${'·'.repeat(n - f)}] ${String(Math.round(shownPct * 100)).padStart(3, '0')}`;
  if (!ld.classList.contains('out')) requestAnimationFrame(ldTick);
};
requestAnimationFrame(ldTick);
const loadGLB = (url, key) => new Promise((res) => {
  new GLTFLoader().load(url, (g) => { prog[key] = 1; res(g); }, (e) => { if (e.total) prog[key] = e.loaded / e.total * 0.95; }, () => { prog[key] = 1; res(null); });
});
const fontsP = (document.fonts ? Promise.all([
  document.fonts.load('500 100px "Space Grotesk"'), document.fonts.load('400 12px "JetBrains Mono"'),
]).catch(() => {}) : Promise.resolve()).then(() => { prog.e = 1; });
const [gOld, gHand, gTV, gRock, , gPeople] = await Promise.all([
  loadGLB('3d/b/assets_b.glb', 'a'), loadGLB('3d/b/v2/hand.glb', 'b'), loadGLB('3d/b/v2/tv.glb', 'c'), loadGLB('3d/b/v2/rocks.glb', 'd'), fontsP, loadGLB('3d/b/v2/people.glb', 'e'),
]);

// ---------- 形の取り出し（v2 があれば v2、無ければ今の assets_b） ----------
const findObj = (g, name) => { if (!g) return null; let r = null; g.scene.traverse((o) => { if (!r && o.name === name) r = o; }); return r; };
const findLike = (o, re) => { if (!o) return null; let r = null; o.traverse((c) => { if (!r && c.isMesh && re.test(c.name)) r = c; }); return r; };
function geoOf(obj, rel) {
  if (!obj) return null;
  obj.updateWorldMatrix(true, true);
  const ms = []; obj.traverse((c) => { if (c.isMesh) ms.push(c); });
  if (!ms.length) return null;
  ms.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count);
  const m = ms[0]; const base = rel || obj; base.updateWorldMatrix(true, false);
  const mat = new THREE.Matrix4().copy(base.matrixWorld).invert().multiply(m.matrixWorld);
  const g = m.geometry.clone().applyMatrix4(mat);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.userData.mat = m.material;
  return g;
}
function ensureUV(g) {
  if (g.attributes.uv) return g;
  g.computeBoundingBox(); const b = g.boundingBox, p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = (p.getX(i) - b.min.x) / (b.max.x - b.min.x || 1); uv[i * 2 + 1] = (p.getY(i) - b.min.y) / (b.max.y - b.min.y || 1); }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return g;
}
// 新しい形を今の形と同じ大きさ・置き場にそろえる
function fitLike(g, ref, by = 'y') {
  g.computeBoundingBox(); ref.computeBoundingBox();
  const a = g.boundingBox, b = ref.boundingBox, sa = new THREE.Vector3(), sb = new THREE.Vector3();
  a.getSize(sa); b.getSize(sb);
  const s = sb[by] / (sa[by] || 1);
  const ca = new THREE.Vector3(), cb = new THREE.Vector3(); a.getCenter(ca); b.getCenter(cb);
  const m = new THREE.Matrix4().makeTranslation(cb.x, b.min.y, cb.z).multiply(new THREE.Matrix4().makeScale(s, s, s)).multiply(new THREE.Matrix4().makeTranslation(-ca.x, -a.min.y, -ca.z));
  return m;
}
function unitize(g, r = 1) { g.computeBoundingSphere(); g.computeBoundingBox(); const c = new THREE.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z); g.computeBoundingBox(); const s = new THREE.Vector3(); g.boundingBox.getSize(s); const k = 2 * r / Math.max(s.x, s.y, s.z); g.scale(k, k, k); return g; }
const OLD = {}; if (gOld) gOld.scene.traverse((o) => { if (o.isMesh) OLD[o.name] = o.geometry; });
const used = { hand: false, tv: false, rock: false };

// ---------- 背景：星雲（紺の1系統） ----------
const SKY_FS = `varying vec3 vD; uniform float uTime, uDawn, uBright; uniform vec3 uFog, uCream;
  float h(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
  float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }
  void main(){
    vec3 d=normalize(vD);
    float neb=fbm(d*2.1+vec3(0.,0.,uTime*.004));
    float neb2=fbm(d*5.3+vec3(3.1,1.7,uTime*.002));
    vec3 col=uFog*.62;
    col+=vec3(.022,.040,.080)*pow(neb,2.1)*2.2*uBright;
    col+=vec3(.030,.046,.075)*pow(neb2,3.2)*1.6*smoothstep(.15,-.5,d.z)*uBright;
    col+=uFog*.9*pow(1.-abs(d.y+.08),7.);
    vec3 sp=d*380.; vec3 c=floor(sp); float st=h(c);
    if(st>.9972){ float tw=.6+.4*sin(uTime*1.3+st*90.); col+=vec3(.55,.62,.78)*smoothstep(.45,.0,length(fract(sp)-.5))*tw*1.4*uBright; }
    col=mix(col,uCream*(.92+.08*d.y),uDawn);
    gl_FragColor=vec4(col,1.);
  }`;
const SKY_VS = `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const skyU = { uTime: U.time, uDawn: U.dawn, uBright: { value: 1 }, uFog: U.fogCol, uCream: { value: CREAM } };
{
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, fog: false, uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), m); sky.renderOrder = -10; sky.frustumCulled = false;
  sky.onBeforeRender = () => sky.position.copy(camera.position);
  scene.add(sky);
}

// 光（冷たい白と青だけ。朱は信号の点光源のみ）
scene.add(new THREE.HemisphereLight(0x46608f, 0x05070d, 0.16));
const key = new THREE.DirectionalLight(0xe8eef8, 0.75); key.position.set(-1, 1.3, 0.7); scene.add(key);
const rim = new THREE.DirectionalLight(0x8fb0e6, 1.25); rim.position.set(0.6, 0.4, -1); scene.add(rim);
const sigLight = new THREE.PointLight(0xff5a24, 26, 15, 1.8); scene.add(sigLight);

// 環境マップ：宇宙の星雲を PMREM で（クロームとガラスに映す）
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = (() => {
  const es = new THREE.Scene();
  const m = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { uTime: { value: 3 }, uDawn: { value: 0 }, uBright: { value: 3.2 }, uFog: { value: new THREE.Color().setRGB(.03, .05, .1) }, uCream: { value: CREAM } }, vertexShader: SKY_VS, fragmentShader: SKY_FS });
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 48, 24), m));
  const panel = (w, h, c, p) => { const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); o.position.copy(p); o.lookAt(0, 0, 0); es.add(o); };
  const W = new THREE.Color().setRGB(1.3, 1.4, 1.65), B = new THREE.Color().setRGB(.3, .42, .8);
  panel(1.4, 34, W, V(-15, 5, 6)); panel(0.7, 30, W, V(14, 4, -3)); panel(24, 0.7, W, V(0, 17, 0)); panel(22, 4, B, V(0, -11, -10)); panel(6, 10, B, V(10, 2, 13));
  return pmrem.fromScene(es, 0.02).texture;
})();

// ---------- 質感 ----------
// 石膏：柔らかい白。縁の透け（SSS 風）と表面の起毛（sheen）
function addSSS(mat, col = new THREE.Color(0.42, 0.5, 0.66), k = 1) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    prev && prev(sh, r);
    sh.uniforms.uSSS = { value: col.clone().multiplyScalar(k) };
    sh.fragmentShader = 'uniform vec3 uSSS;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `{ float ndv=clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.);
         outgoingLight += uSSS*(pow(1.-ndv,2.4)*.42 + .045) * (.6+.4*diffuseColor.r); }
       #include <opaque_fragment>`);
  };
  return mat;
}
const plaster = () => addSSS(new THREE.MeshPhysicalMaterial({ color: 0xd6dbe4, roughness: 0.84, metalness: 0, sheen: 0.7, sheenColor: new THREE.Color(0xc3d2f2), sheenRoughness: 0.5, envMap: envTex, envMapIntensity: 0.32 }));
const chrome = () => new THREE.MeshStandardMaterial({ color: 0xe2e8f2, roughness: 0.06, metalness: 1, envMap: envTex, envMapIntensity: 1.35 });

// 岩：焼いた法線（v2 の法線マップがあれば）＋細かいザラつき＋青灰の縁
const BUMP = `float rh(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float rn(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(mix(rh(i),rh(i+vec3(1,0,0)),f.x),mix(rh(i+vec3(0,1,0)),rh(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(rh(i+vec3(0,0,1)),rh(i+vec3(1,0,1)),f.x),mix(rh(i+vec3(0,1,1)),rh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float rfbm(vec3 p){ return rn(p)*.55+rn(p*2.1)*.27+rn(p*4.3)*.13+rn(p*8.7)*.05; }`;
const ROT = `attribute vec3 aAxis; attribute float aSpd; uniform float uTime;
mat3 rotAx(vec3 a,float t){ float s=sin(t),c=cos(t),oc=1.-c;
 return mat3(oc*a.x*a.x+c, oc*a.x*a.y+a.z*s, oc*a.z*a.x-a.y*s, oc*a.x*a.y-a.z*s, oc*a.y*a.y+c, oc*a.y*a.z+a.x*s, oc*a.z*a.x+a.y*s, oc*a.y*a.z-a.x*s, oc*a.z*a.z+c); }`;
function rockMaterial(rimCol, base, src, keyName) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.9, metalness: 0.06, envMap: envTex, envMapIntensity: 0.25 });
  if (src && src.normalMap) { m.normalMap = src.normalMap; m.normalScale = new THREE.Vector2(1.2, 1.2); }
  if (src && src.roughnessMap) m.roughnessMap = src.roughnessMap;
  if (src && src.aoMap) m.aoMap = src.aoMap;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uRim = { value: rimCol };
    sh.vertexShader = 'varying vec3 vRP;\n' + ROT + '\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = rotAx(aAxis,uTime*aSpd)*normal;\n#ifdef USE_TANGENT\nvec3 objectTangent = rotAx(aAxis,uTime*aSpd)*tangent.xyz;\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = rotAx(aAxis,uTime*aSpd)*position; vRP=position;');
    sh.fragmentShader = 'uniform vec3 uRim; varying vec3 vRP;\n' + BUMP + '\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float hg=rfbm(vRP*1.6); float hg2=rn(vRP*9.)*.16+rn(vRP*23.)*.07;
        { vec3 dpx=dFdx(-vViewPosition), dpy=dFdy(-vViewPosition); float dhx=dFdx(hg+hg2), dhy=dFdy(hg+hg2);
          vec3 r1=cross(dpy,normal), r2=cross(normal,dpx); float det=dot(dpx,r1);
          vec3 gr=sign(det)*(dhx*r1+dhy*r2); normal=normalize(abs(det)*normal-gr*.6); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb*=mix(.42,1.12,smoothstep(.25,.75,rfbm(vRP*1.3+7.)));`)
      .replace('#include <opaque_fragment>',
        `{ float rr=pow(1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),2.8); outgoingLight+=uRim*rr; }
         #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => keyName;
  return m;
}
function addRot(g, n, spdMax) {
  const ax = new Float32Array(n * 3), sp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = randDir(); ax.set([d.x, d.y, d.z], i * 3); sp[i] = rr(-spdMax, spdMax); }
  g.setAttribute('aAxis', new THREE.InstancedBufferAttribute(ax, 3));
  g.setAttribute('aSpd', new THREE.InstancedBufferAttribute(sp, 1));
}

// ---------- ノイズの宇宙：岩・破片（数を減らし、霧に沈める） ----------
const rockGeos = [], shardGeos = [];
let rockSrcMat = null;
if (gRock) {
  for (let i = 0; i < 8; i++) { const o = findObj(gRock, 'Rock_' + i); const g = geoOf(o); if (g) { rockGeos.push(unitize(g, 1.05)); rockSrcMat = rockSrcMat || g.userData.mat; } }
  for (let i = 0; i < 6; i++) { const o = findObj(gRock, 'Shard_' + i); const g = geoOf(o); if (g) shardGeos.push(unitize(g, 0.17)); }
  if (rockGeos.length) used.rock = true;
}
if (!rockGeos.length) for (let r = 0; r < 4; r++) rockGeos.push(OLD['Rock' + r] || new THREE.IcosahedronGeometry(1, 1));
if (!shardGeos.length) shardGeos.push(new THREE.TetrahedronGeometry(0.16, 0));
const rockMat = rockMaterial(new THREE.Color(0.07, 0.12, 0.24), 0x5d6677, rockSrcMat, 'rock');
const dummy = new THREE.Object3D();
function scatter(mesh, n, rMin, rMax, sMin, sMax, pw, clear) {
  let i = 0, tries = 0; const col = new THREE.Color();
  while (i < n && tries < n * 40) {
    tries++;
    const u = rr(-0.02, 1.0), base = camCurve.getPoint(clamp(u));
    if (u < 0) base.z += -u * 600;
    const p = base.add(randDir().multiplyScalar(rMin + Math.pow(rnd(), pw) * (rMax - rMin)));
    if (distToPath(p) < clear || nearHero(p)) continue;
    dummy.position.copy(p); dummy.rotation.set(rr(0, 6.3), rr(0, 6.3), rr(0, 6.3));
    const s = sMin + Math.pow(rnd(), 3) * (sMax - sMin) * (0.4 + 0.6 * clamp(distToPath(p) / 20));
    dummy.scale.set(s * rr(.7, 1.3), s * rr(.7, 1.3), s * rr(.7, 1.3)); dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    const g = rr(.6, 1.05); col.setRGB(g * .94, g * .97, g); mesh.setColorAt(i, col);
    i++;
  }
  mesh.count = i; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
rockGeos.forEach((g0) => {
  const g = g0.clone(); const n = Math.round(Q.rocks / rockGeos.length);
  addRot(g, n, 0.1);
  const m = new THREE.InstancedMesh(g, rockMat, n); scatter(m, n, 4.5, 52, 0.3, 3.6, 1.5, 4.2);
  m.frustumCulled = false; scene.add(m);
});
shardGeos.forEach((g0) => {
  const g = g0.clone(); const n = Math.round(Q.shards / shardGeos.length); addRot(g, n, 0.8);
  const m = new THREE.InstancedMesh(g, rockMat, n); scatter(m, n, 2.6, 34, 0.35, 1.6, 1.2, 2.6);
  m.frustumCulled = false; scene.add(m);
});

// ---------- 空気の層：もや（星雲の霧）と塵（手前・中・奥の3層） ----------
const hazeTex = (() => {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d'); const im = x.createImageData(S, S);
  const h = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
  const n2 = (px, py) => { const ix = Math.floor(px), iy = Math.floor(py), fx = px - ix, fy = py - iy, ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    return (h(ix, iy) * (1 - ux) + h(ix + 1, iy) * ux) * (1 - uy) + (h(ix, iy + 1) * (1 - ux) + h(ix + 1, iy + 1) * ux) * uy; };
  for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
    const u = i / S * 2 - 1, v = j / S * 2 - 1, r = Math.sqrt(u * u + v * v);
    let f = 0, a = .5, fr = 3; for (let o = 0; o < 5; o++) { f += a * n2(u * fr + 9, v * fr + 3); fr *= 2.1; a *= .5; }
    const al = Math.max(0, 1 - r) ** 1.6 * Math.max(0, f - .25) * 1.9;
    const k = (j * S + i) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.min(255, al * 255);
  }
  x.putImageData(im, 0, 0); const t = new THREE.CanvasTexture(c); return t;
})();
const hazes = [];
for (let i = 0; i < Q.haze; i++) {
  const u = (i + rnd()) / Q.haze;
  const p = camCurve.getPoint(u).add(V(rr(-24, 24), rr(-9, 7), rr(-30, -8)));
  const m = new THREE.SpriteMaterial({ map: hazeTex, color: new THREE.Color().setRGB(.16, .25, .45), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, rotation: rr(0, 6.3), fog: false });
  const s = new THREE.Sprite(m); s.position.copy(p); s.scale.setScalar(rr(38, 90)); fx(s); scene.add(s); hazes.push({ s, base: rr(.07, .15) * 0.22 });
}
const DUST_VS = `attribute float aSize; attribute float aSeed; uniform float uTime, uBox, uFocus, uAp, uCoc, uPx, uFogD, uAlpha, uFogK; uniform vec3 uCam;
  varying float vA; varying float vB;
  void main(){
    vec3 p=position+vec3(sin(uTime*.11+aSeed*40.),cos(uTime*.09+aSeed*23.),sin(uTime*.07+aSeed*11.))*.5;
    vec3 rel=mod(p-uCam+uBox*.5,uBox)-uBox*.5; vec3 w=uCam+rel;
    vec4 mv=viewMatrix*vec4(w,1.); float d=-mv.z; gl_Position=projectionMatrix*mv;
    float base=max(aSize*uPx/max(d,.1),1.);
    float coc=clamp(abs(d-uFocus)/max(d,.1)*uAp,0.,1.)*uCoc;
    float s=base+coc; gl_PointSize=s;
    float energy=clamp(base*base/(s*s),.025,1.);
    float edge=1.-smoothstep(.34,.5,max(max(abs(rel.x),abs(rel.y)),abs(rel.z))/uBox);
    float f=1.-exp(-pow(d*uFogD*uFogK,2.));
    vA=uAlpha*energy*edge*(1.-f)*smoothstep(.4,2.,d)*(.7+.3*sin(uTime*(.8+aSeed)+aSeed*50.));
    vB=clamp(coc/(uCoc+.001),0.,1.);
  }`;
const DUST_FS = `uniform vec3 uCol; varying float vA; varying float vB;
  void main(){ vec2 q=gl_PointCoord*2.-1.; float r=length(q); if(r>1.) discard;
    float soft=pow(1.-r,2.); float disk=smoothstep(1.,.86,r)*(.78+.22*smoothstep(.45,.96,r));
    float a=mix(soft,disk,smoothstep(.15,.6,vB));
    gl_FragColor=vec4(uCol*a*vA,1.); }`;
const dustLayers = [];
function dustLayer(n, box, sMin, sMax, alpha, coc, fogK, col) {
  const pos = new Float32Array(n * 3), sz = new Float32Array(n), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos.set([rr(0, box), rr(0, box), rr(0, box)], i * 3); sz[i] = sMin + Math.pow(rnd(), 2.2) * (sMax - sMin); sd[i] = rnd(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uBox: { value: box }, uFocus: U.focus, uAp: { value: 1.25 }, uCoc: { value: coc }, uPx: U.px, uFogD: U.fogD, uFogK: { value: fogK }, uAlpha: { value: alpha }, uCam: U.camPos, uCol: { value: col } },
    vertexShader: DUST_VS, fragmentShader: DUST_FS,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; fx(p); scene.add(p); dustLayers.push(m); return m;
}
dustLayer(Q.dustN, 18, 0.018, 0.05, 0.32, 46, 1, new THREE.Color().setRGB(.62, .72, .9));   // 手前：大きくぼけた粒
dustLayer(Q.dustM, 70, 0.022, 0.07, 0.4, 18, 1, new THREE.Color().setRGB(.7, .77, .92));  // 中：ピントの合う塵
dustLayer(Q.dustF, 230, 0.12, 0.42, 0.3, 6, 0.32, new THREE.Color().setRGB(.55, .63, .8)); // 奥：霧の向こうの星屑

// ---------- 1本の信号（朱の光の線）＝ 画面の中の朱はこれだけ ----------
const fogGLSL = `uniform vec3 uFogC; uniform float uFogD; float fogF(float d){ return 1.-exp(-pow(d*uFogD,2.)); }`;
const sigU = { uTime: U.time, uHead: { value: 0.02 }, uFogC: U.fogCol, uFogD: U.fogD };
{
  const g = new THREE.TubeGeometry(lineCurve, 1600, 0.028, 6, false);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: sigU,
    vertexShader: `varying vec2 vUv; varying float vD; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying float vD; uniform float uTime, uHead; ${fogGLSL}
      void main(){ float x=vUv.x;
        float p=pow(max(0.,sin(x*260.-uTime*5.)),24.)*1.6 + pow(max(0.,sin(x*41.-uTime*2.2)),40.)*3.;
        float vis=smoothstep(uHead+.05,uHead-.01,x);
        vec3 c=vec3(1.,.30,.10)*(2.2+p*2.5) + vec3(1.,.8,.6)*p*.8;
        gl_FragColor=vec4(c*vis*(1.-fogF(vD)*.85),1.); }`,
  });
  scene.add(fx(new THREE.Mesh(g, m)));
  const g2 = new THREE.TubeGeometry(lineCurve, 800, 0.22, 8, false);
  const m2 = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: sigU,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalMatrix*normal; vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uHead, uTime; ${fogGLSL}
      void main(){ float f=abs(dot(normalize(vN),normalize(vV))); float vis=smoothstep(uHead+.05,uHead-.01,vUv.x);
        gl_FragColor=vec4(vec3(1.,.28,.08)*pow(f,3.)*.22*vis*(1.-fogF(length(vV))*.85),1.); }`,
  });
  scene.add(fx(new THREE.Mesh(g2, m2)));
}
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, 'rgba(255,255,255,.85)'); gr.addColorStop(.35, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const mkGlow = (s, c = 0xffffff, o = 1) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.setScalar(s); return fx(sp); };
const head = mkGlow(3.2, 0xffb08a); scene.add(head);
const headCore = mkGlow(0.9, 0xffffff); scene.add(headCore);
const origin = mkGlow(5, 0xff6a3a); origin.position.copy(lineCurve.getPoint(0)); scene.add(origin);

// ---------- 場面1：石膏の手とクロームの手が並ぶ彫刻の間 ----------
const hands = [];
{
  let handG = OLD.Hand || new THREE.CapsuleGeometry(0.25, 1, 4, 8), pedG = OLD.Pedestal || new THREE.BoxGeometry(0.6, 1.4, 0.6);
  let handSrc = null;
  if (gHand) {
    const h = geoOf(findObj(gHand, 'Hand')), p = geoOf(findObj(gHand, 'Pedestal'));
    if (h) { if (OLD.Hand) h.applyMatrix4(fitLike(h, OLD.Hand, 'y')); handG = h; handSrc = h.userData.mat; used.hand = true; }
    if (p) { if (OLD.Pedestal) p.applyMatrix4(fitLike(p, OLD.Pedestal, 'y')); pedG = p; }
  }
  const NOISE = `float dh(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
    float dn(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float dfb(vec3 p){ return dn(p*4.)*.6+dn(p*9.)*.3+dn(p*21.)*.1; }`;
  const dissolve = (mat, u, isChrome) => {
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, r) => {
      sh.uniforms.uMix = u;
      sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP=position;');
      sh.fragmentShader = 'varying vec3 vOP; uniform float uMix;\n' + NOISE + '\n' + sh.fragmentShader
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float dv=dfb(vOP+vec3(0.,1.,0.)); float th=uMix*1.25-.12+(vOP.y*-.18);
          ${isChrome ? 'if(dv>th) discard;' : 'if(dv<th) discard;'}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(.55,.75,1.15)*smoothstep(.03,.0,abs(dv-th))*step(.001,uMix)*step(uMix,.999);`);
      prev && prev(sh, r);
    };
    mat.customProgramCacheKey = () => (isChrome ? 'dchrome' : 'dplaster');
  };
  // 人の立ち姿（石膏）とロボット（暗い金属）。同じ姿勢・同じ原点で、1体ずつ置き換わる（So 11/24）
  const PV = [];
  if (gPeople) for (const k of ['A', 'B', 'C']) {
    const ro = findObj(gPeople, 'Robot_' + k), h = geoOf(findObj(gPeople, 'Human_' + k)), r = geoOf(ro), gl = geoOf(findObj(gPeople, 'Robot_' + k + '_Glow'), ro);
    if (h && r) PV.push({ h, r, gl });
  }
  if (PV.length) used.people = true;
  const group = new THREE.Group(); scene.add(group);
  const rows = SP ? 11 : 14;
  for (let j = 0; j < rows; j++) {
    const x = 6 - 1.9 + (j % 2 ? 0.35 : -0.35), z = -58 - j * 3.1;
    const u = { value: 0 };
    const pl = plaster(); pl.emissive = new THREE.Color(0); dissolve(pl, u, false);
    const rb = new THREE.MeshStandardMaterial({ color: 0x6b7586, roughness: 0.26, metalness: 0.9, envMap: envTex, envMapIntensity: 3.2, vertexColors: true }); rb.emissive = new THREE.Color(0); dissolve(rb, u, true);
    const hg = new THREE.Group(); let glow = null;
    if (PV.length) {
      const v = PV[j % PV.length];
      hg.add(new THREE.Mesh(v.h, pl), new THREE.Mesh(v.r, rb));
      if (v.gl) { glow = new THREE.Mesh(v.gl, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xbfe6ff).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0 })); fx(glow); hg.add(glow); }
      hg.scale.setScalar(1.3); hg.position.set(x, -1.35, z); hg.rotation.set(0, 0.55 + (j % 3 - 1) * 0.12, 0);
    } else {
      hg.add(new THREE.Mesh(handG, pl), new THREE.Mesh(handG, rb));
      hg.scale.setScalar(1.3); hg.position.set(x, 0.4 + 0.54 * 1.3, z); hg.rotation.set(0, 0.95, 0);
    }
    group.add(hg);
    const fl = mkGlow(1.6, 0xcfe0ff, 0); fl.position.set(x, hg.position.y + (PV.length ? 1.55 * 1.3 : 0.9), z); scene.add(fl);
    hands.push({ u, j, g: hg, baseY: hg.position.y, ph: rnd() * 6, flash: fl, lit: false, glow });
  }
}


const H1SEQ = [600, 1150, 1650, 2100, 2500, 2850, 3150, 3420, 3660, 3880, 4080, 4260, 4420, 4560];   // 奥から順に。だんだん速く
let h1T0 = -1, h1Idx = 0, h1Cyc = -1;
const h1vp = mkGlow(9, 0xdfe8ff, 0); h1vp.position.set(6 - 1.9, 1.2, -58 - (SP ? 11 : 14) * 3.1 - 2); scene.add(h1vp);

// ---------- 場面2：無数に枝分かれする光の線の森（青灰の線） ----------
const forestU = { uTime: U.time, uGrow: { value: 0 }, uFogC: U.fogCol, uFogD: U.fogD };
let fGrowT = 0;
{
  // 枝分かれは止まらない：初期の木（線の途中から生える・離れて見る構図）のまま、世代を重ねて膨らみ続ける（So 11/24）
  const pos = [], ord = [], hi = [], tips = [], tipOrd = [];
  const NT = Q.trees, DEP = Q.depth + 3;
  let maxO = 0; const segsAll = [];
  for (let t = 0; t < NT; t++) {
    const rootP = lineCurve.getPoint(rr(0.24, 0.42)); const up = t % 2 ? 1 : -1;
    const d0 = V(rr(-0.6, 0.6), up * rr(0.5, 1), rr(-0.6, 0.3)).normalize();
    const grow = (p, d, len, dep, o, h) => {
      const e = p.clone().add(d.clone().multiplyScalar(len));
      segsAll.push([p, e, o, o + 1, h]); maxO = Math.max(maxO, o + 1);
      if (dep >= DEP) { tips.push(e); tipOrd.push(o + 1); return; }
      const kids = rnd() < 0.15 ? 3 : 2;
      for (let c = 0; c < kids; c++) {
        const nd = d.clone().add(randDir().multiplyScalar(rr(0.45, 0.9))).normalize();
        grow(e, nd, len * (dep < Q.depth ? rr(0.7, 0.86) : rr(0.86, 0.97)), dep + 1, o + 1, h && c === 0);   // 後の世代ほど縮まず外へ広がる
      }
    };
    grow(rootP, d0, rr(2.6, 4), 0, 0, t === 1);
  }
  for (const sg of segsAll) { pos.push(sg[0].x, sg[0].y, sg[0].z, sg[1].x, sg[1].y, sg[1].z); ord.push(sg[2] / maxO, sg[3] / maxO); hi.push(sg[4] ? 1 : 0, sg[4] ? 1 : 0); }
  for (let i = 0; i < tipOrd.length; i++) tipOrd[i] /= maxO;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOrd', new THREE.Float32BufferAttribute(ord, 1));
  g.setAttribute('aHi', new THREE.Float32BufferAttribute(hi, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: forestU,
    vertexShader: `attribute float aOrd; attribute float aHi; varying float vO; varying float vH; varying float vD;
      void main(){ vO=aOrd; vH=aHi; vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vO; varying float vH; varying float vD; uniform float uGrow, uTime; ${fogGLSL}
      void main(){ if(vO>uGrow) discard;
        float tip=smoothstep(uGrow-.12,uGrow,vO);
        float pulse=pow(max(0.,sin(vO*34.-uTime*3.)),18.);
        vec3 c=mix(vec3(.40,.52,.74),vec3(.86,.92,1.),vH);
        float a=(.30+.45*(1.-vO))*(1.+tip*2.2+pulse*1.6)*(.65+vH*1.2)*.85;
        gl_FragColor=vec4(c*a*(1.-fogF(vD)),1.); }`,
  });
  const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; scene.add(fx(ls));
  const tg = new THREE.BufferGeometry(); const tp = new Float32Array(tips.length * 3); tips.forEach((p, i) => tp.set([p.x, p.y, p.z], i * 3));
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aOrd', new THREE.Float32BufferAttribute(tipOrd, 1));
  const tm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...forestU, uPx: U.px },
    vertexShader: `attribute float aOrd; uniform float uGrow, uPx; varying float vA; varying float vD; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; vD=-mv.z;
      vA=smoothstep(uGrow-.02,uGrow-.1,aOrd); gl_PointSize=max(1.,uPx*.05/vD); }`,
    fragmentShader: `varying float vA; varying float vD; ${fogGLSL} void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.68,.78,.95)*smoothstep(.5,0.,r)*vA*1.4*(1.-fogF(vD)),1.); }`,
  });
  const tpt = new THREE.Points(tg, tm); tpt.frustumCulled = false; scene.add(fx(tpt));
}

// ---------- 場面3：砂嵐のモニターが漂う宇宙（ガラスの映り込み） ----------
const tvs = { list: [], parts: [], scrU: null };
{
  const variants = [];
  if (gTV) {
    for (const nm of ['TV_A', 'TV_B', 'TV_C', 'TV_D']) {
      const o = findObj(gTV, nm); if (!o) continue;
      const bm = findLike(o, /body/i), sm = findLike(o, /screen/i); if (!bm || !sm) continue;
      const b = geoOf(bm, o), s = ensureUV(geoOf(sm, o));
      b.computeBoundingBox(); s.computeBoundingBox();
      const cb = new THREE.Vector3(), cs = new THREE.Vector3(); b.boundingBox.getCenter(cb); s.boundingBox.getCenter(cs);
      if (cs.z < cb.z) { b.rotateY(Math.PI); s.rotateY(Math.PI); }
      if (OLD.TV) { const m = fitLike(b, OLD.TV, 'x'); b.applyMatrix4(m); s.applyMatrix4(m); }
      else { const k = 1.18 / (b.boundingBox.max.x - b.boundingBox.min.x); b.scale(k, k, k); s.scale(k, k, k); }
      variants.push({ b, s, src: b.userData.mat });
    }
    if (variants.length) used.tv = true;
  }
  if (!variants.length) variants.push({ b: OLD.TV || new THREE.BoxGeometry(1.2, 0.9, 1), s: ensureUV(OLD.Screen || new THREE.PlaneGeometry(0.98, 0.7).translate(0, 0, 0.5)) });
  // 置き場：1台を大きく正面に（番組を流す主役）。ほかは手前から奥まで立体的にごちゃごちゃ散らばる
  const eye = camCurve.getPoint(3 / 6);
  const wq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(eye, T[3], V(0, 1, 0)));
  const R = V(1, 0, 0).applyQuaternion(wq), Up = V(0, 1, 0).applyQuaternion(wq), N = V(0, 0, 1).applyQuaternion(wq);
  const dW = eye.distanceTo(T[3]), tvW = 1.18;
  tvs.wall = { R, Up, N };
  const bb = variants[0].b.boundingBox || (variants[0].b.computeBoundingBox(), variants[0].b.boundingBox); const cy0 = (bb.min.y + bb.max.y) / 2;
  const push = (p, s, q, hero) => {
    p = p.clone().addScaledVector(V(0, 1, 0).applyQuaternion(q), -cy0 * s);   // 箱の中心を置き場に合わせる
    const off = p.clone().sub(T[3]); off.addScaledVector(N, -off.dot(N));
    const sd = V(off.dot(R) / dW, -off.dot(Up) / dW, 0);
    tvs.list.push({ p, s, q, out: off.lengthSq() > 1e-4 ? off.normalize() : randDir(), outD: rr(14, 34), ax: randDir(), sp: hero ? 0 : rr(-0.06, 0.06), ph: rnd() * 6, v: tvs.list.length % variants.length, k: 0,
      d: Math.hypot(sd.x, sd.y * 0.66), st: { k: hero ? 0 : (rnd() < 0.85 ? 0 : -1), until: 0, tr: 0, trT: 0, next: 0, wave: 0 } });
  };
  push(T[3].clone(), dW * 0.27 / tvW, wq.clone(), true);
  const cnt = SP ? 46 : 78; let tries = 0;
  while (tvs.list.length < cnt + 1 && tries++ < 5000) {
    const z = rr(-34, 3);                                   // 正面のテレビの面からの奥行き（＋が手前）
    const spread = 7 + Math.max(0, -z) * 0.75;
    const x = rr(-spread, spread) * 1.25, y = rr(-spread, spread) * 0.72;
    if (z > -4 && Math.abs(x) < dW * 0.6 && Math.abs(y) < dW * 0.42) continue;   // 主役の前をふさがない
    const p = T[3].clone().addScaledVector(R, x).addScaledVector(Up, y).addScaledVector(N, z);
    if (p.distanceTo(eye) < 5) continue;
    if (tvs.list.some((o) => o.p.distanceTo(p) < (o.s + 1.6) * 0.75)) continue;
    const q = wq.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-.5, .5), rr(-.8, .8), rr(-.45, .45))));
    push(p, rr(0.9, 2.6), q, false);
  }
  const scrU = { uTime: U.time, uOn: { value: 0 }, uFogC: U.fogCol, uFogD: U.fogD };
  tvs.scrU = scrU;
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x2b3343, roughness: 0.42, metalness: 0.25, envMap: envTex, envMapIntensity: 0.8 });
  const glassM = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.05, metalness: 0, envMap: envTex, envMapIntensity: 3.2, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const scrM = new THREE.ShaderMaterial({
    uniforms: scrU,
    vertexShader: `attribute float aSeed; attribute float aSp; attribute vec4 aSt; varying vec2 vUv; varying float vS; varying float vP; varying vec4 vSt; varying float vD; varying vec3 vN; varying vec3 vV;
      void main(){ vUv=uv; vS=aSeed; vP=aSp; vSt=aSt; vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vD=-mv.z; vV=-mv.xyz; vN=normalize(normalMatrix*mat3(instanceMatrix)*normal); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying float vS; varying float vP; varying vec4 vSt; varying float vD; varying vec3 vN; varying vec3 vV; uniform float uTime, uOn; ${fogGLSL}
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      vec3 snow(vec2 uv,float k){ float t=floor(uTime*15.+vS*7.); float n=h(floor(uv*vec2(96.,72.))+t*1.37+vS*91.);
        return vec3(.9,.95,1.)*(60.+n*195.)/255.*k; }
      void main(){
        vec2 uv=vUv; float kind=vSt.x, tr=vSt.y, e=vSt.z, wave=vSt.w;
        vec3 c;
        if(kind<.5) c=snow(uv,.5+h(vec2(floor(uTime*15.),vS))*.25);
        else if(kind<1.5){ c=vec3(3.,5.,10.)/255.*.95+vec3(120.,140.,170.)/255.*.1*smoothstep(.5,0.,(uv.x+1.-uv.y)*.5); }
        else if(kind<2.5){ c=snow(uv,.55); float by=fract(uTime*.11+vS)*1.4-.2; float yy=1.-uv.y; c*=1.-.55*step(by,yy)*step(yy,by+.18); c+=.18*step(by-.04,yy)*step(yy,by); }
        else if(kind<3.5){ c=vec3(8.,12.,22.)/255.*.92+vec3(150.,170.,210.)/255.*(.08+h(vec2(floor(uTime*15.),vS))*.1)*step(.66,fract((1.-uv.y)*24.)); }
        else if(kind<4.5){ float b=floor(uv.x*7.); vec3 bc=b<1.?vec3(.75):b<2.?vec3(.75,.75,0.):b<3.?vec3(0.,.75,.75):b<4.?vec3(0.,.75,0.):b<5.?vec3(.75,0.,.75):b<6.?vec3(.75,0.,0.):vec3(0.,0.,.75);
          c=(1.-uv.y)<.72?bc*.38:vec3(16.,16.,24.)/255.; }
        else c=vec3(18.,38.,120.)/255.*(.55+h(vec2(floor(uTime*15.),vS))*.06);
        if(tr>.5&&tr<1.5){ c=vec3(2.,3.,8.)/255.; float lh=max(.02,1.-min(1.,e*1.6)), lw=e<.6?1.:1.-(e-.6)/.4;
          if(abs(uv.y-.5)<lh*.5&&abs(uv.x-.5)<lw*.5) c=vec3(.92,.95,1.); }
        else if(tr>1.5&&tr<2.5) c=mix(c,vec3(.94,.96,1.),.95-e*.5);
        else if(tr>2.5) c=mix(c,vec3(.9,.92,1.),.5);
        if(wave>.5){ float y=uv.y-.5-sin(uv.x*6.283*1.2+uTime*3.85)*.16; c=vec3(2.,4.,10.)/255.+vec3(1.,.42,.18)*(exp(-pow(y*40.,2.))*1.6+exp(-pow(y*8.,2.))*.35); }
        if(vP>.5){ float y=uv.y-.5-.03*sin(uv.x*14.+uTime*2.2)*smoothstep(.0,.5,uv.x)*smoothstep(1.,.5,uv.x);
          float l=exp(-pow(y*70.,2.))*2.6+exp(-pow(y*14.,2.))*.5;
          c=mix(snow(uv,.5)*.14,vec3(1.,.35,.12)*l*3.+snow(uv,.5)*.04,uOn); }
        float vg=smoothstep(.85,.35,length((uv-.5)*vec2(1.,1.2)));
        c*=(.55+.45*vg)*(.35+.65*uOn)*(vP>.5?1.:.8);
        float fr=pow(1.-clamp(abs(dot(normalize(vN),normalize(vV))),0.,1.),3.);
        float band=smoothstep(.06,.0,abs(uv.x*.7+uv.y-1.05))*.5+smoothstep(.2,.0,abs(uv.x*.7+uv.y-1.3))*.15;
        c+=vec3(.55,.65,.85)*(band*.16+fr*.3);
        gl_FragColor=vec4(c*(1.-fogF(vD)),1.);
      }`,
  });
  variants.forEach((vt, vi) => {
    const items = tvs.list.filter((x) => x.v === vi); const cnt = Math.max(1, items.length);
    const sg = vt.s.clone();
    const sd = new Float32Array(cnt), spc = new Float32Array(cnt), sst = new Float32Array(cnt * 4);
    items.forEach((it, k) => { it.k = k; sd[k] = rnd(); spc[k] = it === tvs.list[0] ? 1 : 0; });
    sg.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1)); sg.setAttribute('aSp', new THREE.InstancedBufferAttribute(spc, 1));
    const aSt = new THREE.InstancedBufferAttribute(sst, 4); aSt.setUsage(THREE.DynamicDrawUsage); sg.setAttribute('aSt', aSt);
    let bm = bodyM;
    if (vt.src && (vt.src.normalMap || vt.src.roughnessMap)) { bm = bodyM.clone(); bm.normalMap = vt.src.normalMap || null; bm.roughnessMap = vt.src.roughnessMap || null; }
    const body = new THREE.InstancedMesh(vt.b, bm, cnt), scr = new THREE.InstancedMesh(sg, scrM, cnt), gl = new THREE.InstancedMesh(vt.s, glassM, cnt);
    body.count = scr.count = gl.count = items.length;
    body.frustumCulled = scr.frustumCulled = gl.frustumCulled = false;
    scene.add(body, scr, gl);
    tvs.parts.push({ items, meshes: [body, scr, gl], aSt });
    if (items.includes(tvs.list[0])) tvs.heroScr = vt.s;
  });
}
// 主役のテレビの画面：昔のカートゥーン調の番組を次々に流す（絵と音は tvshow.js）
const tvShow = createTVShow({ width: 640, height: 480 });
const tvTex = new THREE.CanvasTexture(tvShow.canvas); tvTex.colorSpace = THREE.SRGBColorSpace; tvTex.anisotropy = 4; tvTex.flipY = false;   // 画面の UV が上下逆なので戻す
const tvShowMesh = new THREE.Mesh(tvs.heroScr, new THREE.MeshBasicMaterial({ map: tvTex, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
tvShowMesh.matrixAutoUpdate = false; tvShowMesh.frustumCulled = false; scene.add(tvShowMesh);
const tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(), tmpP = new THREE.Vector3();
const TV_KINDS = [...Array(23).fill(0), 1, 1, 1, 1, 2, 2, 3, 3, 4, 5];
const tvPick = () => TV_KINDS[(Math.random() * TV_KINDS.length) | 0];
tvs.list.forEach((v, i) => { if (i && v.st.k < 0) v.st.k = tvPick(); });
let tvLast = 0, tvRipple = 0;
function updateTVs(t, Ps = 3) {
  const out = sstep(3.58, 3.98, Ps) + (1 - sstep(2.1, 2.6, Ps));   // 来る前と抜けた後は散っている
  const now = t * 1000, doSt = now - tvLast > 66; if (doSt) tvLast = now;
  if (doSt && now > tvRipple) { tvRipple = now + 6000; tvs.list.forEach((v) => { v.st.wave = now + 200 + v.d * 2600; }); SND.wave(); }
  for (const part of tvs.parts) {
    for (const v of part.items) {
      const o = Math.pow(clamp(out), 1.6);
      tmpQ.setFromAxisAngle(v.ax, Math.sin(t * 0.3 + v.ph) * (v.sp ? 0.1 : 0.015) + t * v.sp + o * 2.2).premultiply(v.q);
      tmpP.copy(v.p).addScaledVector(v.out, o * v.outD); tmpP.y += Math.sin(t * 0.4 + v.ph) * (v.sp ? 0.25 : 0.03);
      tmpM.compose(tmpP, tmpQ, tmpS.setScalar(v.s));
      for (const m of part.meshes) m.setMatrixAt(v.k, tmpM);
      if (v === tvs.list[0]) { tvShowMesh.matrix.copy(tmpM); tvShowMesh.matrixWorldNeedsUpdate = true; }
      if (doSt) {
        const s = v.st, hero = v === tvs.list[0];
        if (!hero && !s.tr && now > s.until && Math.random() < 0.03) { const nk = tvPick(); if (nk !== s.k) { s.tr = nk === 1 ? 1 : (s.k === 1 ? 2 : 3); s.trT = now; s.next = nk; } s.until = now + 1200 + Math.random() * 3800; }
        let e = 0; if (s.tr) { e = (now - s.trT) / 320; if (e >= 1) { s.k = s.next; s.tr = 0; e = 0; } }
        const w = s.wave && now > s.wave && now < s.wave + 1100 ? 1 : 0;
        part.aSt.array.set([s.k, s.tr, Math.min(1, e), w], v.k * 4);
      }
    }
    for (const m of part.meshes) m.instanceMatrix.needsUpdate = true;
    if (doSt) part.aSt.needsUpdate = true;
  }
}
updateTVs(0);

// ---------- 場面4：ノイズの粒子が1点に収束して Signal が立ち上がる ----------
const convU = { uTime: U.time, uConv: { value: 0 }, uC: { value: T[4] }, uPx: U.px, uFogC: U.fogCol, uFogD: U.fogD };
{
  const n = Q.conv, pos = new Float32Array(n * 3), jit = new Float32Array(n * 3), del = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = randDir(), r = 2.5 + Math.pow(rnd(), 0.7) * 15;
    pos.set([T[4].x + d.x * r, T[4].y + d.y * r * 0.75, T[4].z + d.z * r], i * 3);
    const j = randDir().multiplyScalar(Math.pow(rnd(), 2)); jit.set([j.x * 0.4, j.y * 0.4, j.z * 0.4], i * 3); del[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aJit', new THREE.BufferAttribute(jit, 3)); g.setAttribute('aDel', new THREE.BufferAttribute(del, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: convU,
    vertexShader: `attribute vec3 aJit; attribute float aDel; uniform float uTime, uConv, uPx; uniform vec3 uC; varying vec3 vC; varying float vA; ${fogGLSL}
      void main(){
        float k=clamp(uConv*1.45-aDel*.45,0.,1.); k=k*k*(3.-2.*k);
        vec3 rel=position-uC;
        float ang=uTime*.06+k*k*(2.5+aDel*3.);
        float s=sin(ang), c=cos(ang); rel.xz=mat2(c,-s,s,c)*rel.xz;
        vec3 jitter=vec3(sin(uTime*7.+aDel*90.),cos(uTime*6.+aDel*70.),sin(uTime*8.+aDel*30.))*.12*(1.-k);
        vec3 p=uC+mix(rel+jitter*8.,aJit,k);
        float rise=smoothstep(.82,1.,uConv); p.y+=rise*pow(aDel,3.)*16.*k;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uPx*(.022+.012*(1.-k))/-mv.z);
        vC=mix(vec3(.50,.58,.74),vec3(.92,.95,1.),k); vA=(.42+.58*k)*(1.-fogF(-mv.z)); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }`,
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(fx(p));
}
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 12, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uA; void main(){ gl_FragColor=vec4(vec3(1.,.42,.18)*4.*uA*smoothstep(1.,.0,vUv.y),1.); }`,
}));
beam.position.copy(T[4]); beam.scale.set(1, 0.001, 1); scene.add(fx(beam));
const core = mkGlow(1, 0xff7a4a, 1); core.position.copy(T[4]); scene.add(core);
const coreW = mkGlow(1, 0xffffff, 1); coreW.position.copy(T[4]); scene.add(coreW);

// ---------- 場面4（差し替え・案B）：ノイズの海のチューニング ----------
// 奥から手前へ流れる波形の列。目盛りが左右に探り、合うとノイズが静まり、ずっとそこにあった朱い稜線（Signal）が立つ
const tuneU = { uT: { value: 0 }, uR: { value: 0 }, uSpd: { value: 5.5 }, uXc: { value: -6 }, uBw: { value: 0.9 }, uLock: { value: 0 }, uNear: { value: 0 }, uX0: { value: 0 }, uVis: { value: 0 } };
const tune = { group: new THREE.Group(), cur: null, curV: null, T: 0, locked: false };
{
  const R = SP ? 64 : 96, NS = SP ? 170 : 260, X0 = 0.15, XW = 7.5, Z0 = -40, Z1 = 3;   // 稜線をシグナルの線にそろえる
  tuneU.uR.value = R; tuneU.uX0.value = X0; tune.X0 = X0; tune.XW = XW;
  const COMMON = `
uniform float uT, uR, uSpd, uXc, uBw, uLock, uNear, uX0, uVis;
float hh(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(hh(i),hh(i+vec2(1,0)),f.x),mix(hh(i+vec2(0,1)),hh(i+vec2(1,1)),f.x),f.y); }
void rowOf(float k, out float u, out float id){ float s=uT*uSpd; u=k+fract(s); float i=mod(k-floor(s),uR); id=i+uR*floor((i+s)/uR); }
float zOf(float u){ return mix(${Z0.toFixed(1)}, ${Z1.toFixed(1)}, u/uR); }
float band(float x){ return exp(-pow((x-uXc)/uBw,2.)); }
float sigAmp(){ return .14+.7*uNear*(1.-uLock)+1.45*uLock; }
float height(float x, float si, float id){
  float n=pow(hh(vec2(si,id)),3.)*1.5 + vn(vec2(x*1.3,id*.35))*.55 + vn(vec2(x*5.,id*.9))*.25;
  float att=mix(1., mix(.07,.22,band(x)), uLock);
  float s=exp(-pow((x-uX0)/.16,2.))*sigAmp()*(.85+.15*sin(id*.7));
  return n*.42*att + s;
}
float fade(float u){ return smoothstep(0.,uR*.18,u)*(1.-smoothstep(uR*.86,uR,u)); }`;
  const pos = [], row = [], si = [], fill = [], frow = [], fsi = [], top = [];
  for (let k = 0; k < R; k++) {
    for (let j = 0; j < NS - 1; j++) {
      const xa = -XW + (2 * XW) * j / (NS - 1), xb = -XW + (2 * XW) * (j + 1) / (NS - 1);
      pos.push(xa, 0, 0, xb, 0, 0); row.push(k, k); si.push(j, j + 1);
      for (const q of [[xa, 1, j], [xb, 1, j + 1], [xa, 0, j], [xb, 1, j + 1], [xb, 0, j + 1], [xa, 0, j]]) { fill.push(q[0], 0, 0); top.push(q[1]); fsi.push(q[2]); frow.push(k); }
    }
  }
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); lg.setAttribute('aK', new THREE.Float32BufferAttribute(row, 1)); lg.setAttribute('aS', new THREE.Float32BufferAttribute(si, 1));
  const lm = new THREE.ShaderMaterial({ uniforms: tuneU,
    vertexShader: `${COMMON} attribute float aK; attribute float aS; varying vec3 vC;
      void main(){ float u,id; rowOf(aK,u,id); float x=position.x; float y=height(x,aS,id);
        vec3 p=vec3(x,y,zOf(u)); vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        float fd=fade(u)*(1.-smoothstep(20.,46.,-mv.z))*uVis;
        vec3 g=vec3(.50,.53,.58)*(.55+.9*band(x)*(1.-uLock*.6))*.7;
        float sw=exp(-pow((x-uX0)/.32,2.))*clamp(uLock+uNear*.35,0.,1.);
        vC=mix(g,vec3(1.,.30,.09)*2.2,sw)*fd; }`,
    fragmentShader: 'varying vec3 vC; void main(){ gl_FragColor=vec4(vC,1.); }' });
  const lines = new THREE.LineSegments(lg, lm); lines.frustumCulled = false; lines.renderOrder = 2; tune.group.add(fx(lines));
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3)); fg.setAttribute('aK', new THREE.Float32BufferAttribute(frow, 1)); fg.setAttribute('aS', new THREE.Float32BufferAttribute(fsi, 1)); fg.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1));
  const fm = new THREE.ShaderMaterial({ uniforms: tuneU, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 2, side: THREE.DoubleSide,
    vertexShader: `${COMMON} attribute float aK; attribute float aS; attribute float aTop;
      void main(){ float u,id; rowOf(aK,u,id); float x=position.x; float y=aTop>.5?height(x,aS,id):-.2;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(x,y,zOf(u),1.); }`,
    fragmentShader: 'void main(){ gl_FragColor=vec4(0.,0.,0.,1.); }' });
  const fillM = new THREE.Mesh(fg, fm); fillM.frustumCulled = false; fillM.renderOrder = 1; tune.group.add(fillM);
  tune.cur = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, -0.15, Z0 + 4), V(0, -0.15, Z1 - 2)]), new THREE.LineBasicMaterial({ color: 0xd9dde3, transparent: true, opacity: 0.6, fog: false }));
  tune.curV = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(0, -0.15, -9), V(0, 3.4, -9)]), new THREE.LineBasicMaterial({ color: 0xd9dde3, transparent: true, opacity: 0.35, fog: false }));
  tune.group.add(fx(tune.cur), fx(tune.curV));
  // 置き方：候補のカメラ（0,3,7.2 → 0.4,0.2,-12 を見る）が、本線の場面4のカメラ位置に重なるように
  const eye4 = camCurve.getPoint(4 / 6), camL = V(0, SP ? 3.6 : 3.0, SP ? 9 : 7.2), lookL = V(0.4, 0.2, -12);
  const dirL = lookL.clone().sub(camL).normalize(), dirW = T[4].clone().sub(eye4).normalize();
  const yaw = Math.atan2(dirW.x, -dirW.z) - Math.atan2(dirL.x, -dirL.z);
  tune.group.rotation.y = -yaw;
  tune.group.position.copy(eye4).sub(camL.clone().applyAxisAngle(V(0, 1, 0), -yaw));
  tune.group.position.y += (T[4].y - eye4.y) - (lookL.y - camL.y) * (eye4.distanceTo(T[4]) / camL.distanceTo(lookL));
  scene.add(tune.group);
}

// ---------- 場面5：ゼロサム（決まった円を奪い合う）とプラスサム（輪そのものが育つ） ----------
const s5 = {};
{
  const C5 = T[5];
  // ゼロサム：10切れの円盤。境目が行き来し、取られた切れが反対側へ滑る。円の大きさは変わらない
  const zs = new THREE.Group(); zs.position.copy(C5).add(V(-3.6, 0.3, -1.0)); zs.rotation.set(0.38, 0.55, 0.05); zs.scale.setScalar(1.12); scene.add(zs);
  const n = 10, R0 = 0.42, R1 = 2.25, gap = 0.035, wedges = [];
  const pl = plaster(), ch = chrome();
  for (let i = 0; i < n; i++) {
    const a0 = i / n * TAU + gap, a1 = (i + 1) / n * TAU - gap;
    const sh = new THREE.Shape(); sh.absarc(0, 0, R1, a0, a1, false); sh.absarc(0, 0, R0, a1, a0, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.34, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 18 }); g.translate(0, 0, -0.17);
    const m = new THREE.Mesh(g, pl); zs.add(m);
    wedges.push({ m, mid: (i + 0.5) / n * TAU, off: new THREE.Vector3() });
  }
  const bound = new THREE.Mesh(new THREE.TorusGeometry(R1 + 0.32, 0.01, 6, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(.5, .6, .8), transparent: true, opacity: .55, blending: THREE.AdditiveBlending, depthWrite: false }));
  zs.add(fx(bound));
  // プラスサム：一緒に取り組む粒が手をつなぎ、輪が育つ。中心の光（笑顔の総量）が増える
  const ps = new THREE.Group(); ps.position.copy(C5).add(V(3.6, -0.1, 0.4)); ps.rotation.set(0.15, -0.3, 0); ps.scale.setScalar(1.12); scene.add(ps);
  const N = 16, orbs = [];
  const orbG = new THREE.SphereGeometry(1, 40, 20), orbM = plaster();
  for (let i = 0; i < N; i++) { const o = new THREE.Mesh(orbG, orbM); ps.add(o); orbs.push(o); }
  const lineG = new THREE.BufferGeometry(); lineG.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 4 * 3), 3));
  const lineM = new THREE.LineBasicMaterial({ color: new THREE.Color().setRGB(.62, .72, .92), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const lines = new THREE.LineSegments(lineG, lineM); lines.frustumCulled = false; ps.add(fx(lines));
  const trail = [];
  for (let i = 0; i < 3; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1, 0.008, 6, 160), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(.45, .55, .75), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); ps.add(fx(t)); trail.push(t); }
  const center = mkGlow(1, 0xdfe8ff, 1); ps.add(center);
  if (SP) { zs.scale.setScalar(0.78); ps.scale.setScalar(0.78); zs.position.x += 1.2; ps.position.x -= 1.0; zs.position.y += 1.4; ps.position.y -= 0.4; }
  Object.assign(s5, { zs, wedges, pl, ch, ps, orbs, lineG, lineM, trail, center, bound, phi: Math.PI });
}

// ---------- 場面6：ばらばらの短い板（個別最適）が、1本の長い橋（全体最適）に揃い、遠い光へ ----------
const s6 = { planks: null, items: [] };
const farStar = mkGlow(70, 0xe9eeff, 1); farStar.position.copy(lineCurve.getPoint(1)); scene.add(farStar);
{
  const L = lineCurve.getLength(), sp = 2.1, du = sp / L;
  let u0 = 0; { let best = 1e9; for (let u = 0.3; u < 1; u += 0.0005) { const z = lineCurve.getPointAt(u).z; const d = Math.abs(z + 412); if (d < best) { best = d; u0 = u; } } }
  const g = new THREE.BoxGeometry(1.0, 0.13, sp - 0.42);
  const mat = plaster(); mat.color.set(0xaab3c2);
  const n = Q.planks;
  const mesh = new THREE.InstancedMesh(g, mat, n); mesh.frustumCulled = false; scene.add(mesh); s6.planks = mesh;
  const up = V(0, 1, 0), mtx = new THREE.Matrix4();
  for (let j = 0; j < n; j++) {
    const u = u0 + j * du; if (u > 0.995) { mesh.count = j; break; }
    const p = lineCurve.getPointAt(u).add(V(0, -0.34, 0)), tng = lineCurve.getTangentAt(u);
    mtx.lookAt(V(0, 0, 0), tng, up); const qA = new THREE.Quaternion().setFromRotationMatrix(mtx);
    const pS = p.clone().add(randDir().multiplyScalar(rr(2.5, 8))).add(V(rr(-2, 2), rr(-2.5, 2.5), 0));
    const qS = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-1.2, 1.2), rr(-1.6, 1.6), rr(-1, 1)));
    s6.items.push({ pA: p, qA, pS, qS, d: Math.min(0.55, j / 70 * 0.55) + rr(0, 0.06), ph: rnd() * 6, k: -1 });
  }
  // 設計の基準線（点線）：揃う前から、全体の行き先だけは見えている
  const pts = []; for (let u = u0; u <= 1; u += 0.002) pts.push(lineCurve.getPointAt(u).add(V(0, -0.34, 0)));
  const gl = new THREE.BufferGeometry().setFromPoints(pts);
  const guide = new THREE.Line(gl, new THREE.LineDashedMaterial({ color: new THREE.Color().setRGB(.55, .65, .85), dashSize: .5, gapSize: .45, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  guide.computeLineDistances(); guide.frustumCulled = false; scene.add(fx(guide)); s6.guide = guide;
}
const tmpQ2 = new THREE.Quaternion();
function updatePlanks(l6, t) {
  const m = s6.planks;
  s6.items.forEach((it, j) => {
    const k = ease(sstep(it.d, it.d + 0.38, l6));
    if (Math.abs(k - it.k) < 1e-4 && (k === 1)) return;
    it.k = k;
    tmpP.copy(it.pS).lerp(it.pA, k); tmpP.y += Math.sin(t * 0.5 + it.ph) * 0.18 * (1 - k);
    tmpQ2.copy(it.qS).slerp(it.qA, k);
    tmpM.compose(tmpP, tmpQ2, tmpS.set(1, 1, 1)); m.setMatrixAt(j, tmpM);
  });
  m.instanceMatrix.needsUpdate = true;
}
updatePlanks(0, 0);

// ---------- FV：今のサイトの粒の来方をコードで再現（真っ黒に白い粒）→ 文字がそろうと粒が止まり波紋 → 宇宙へ ----------
// 速さ・数・形は今のサイトの映像（home-hero.mp4）を実測して合わせた：中心から外へ半径に比例して広がる（毎秒 約22%）、
// 見えている粒は1コマ 15〜30 個、短い光の粒と細く長い筋が混ざる。
const fvx = document.getElementById('fvx'), fvSum = document.getElementById('fsum'), fvv = document.getElementById('fvv');
const tmpFv = new THREE.Vector3();
let fvDark = 0;
const fvFlash = (() => { const d = document.createElement('div'); d.setAttribute('aria-hidden', 'true'); d.style.cssText = 'position:fixed;inset:0;z-index:5;pointer-events:none;opacity:0;background:radial-gradient(circle at 50% 50%,rgba(235,248,255,1) 0%,rgba(167,228,255,.55) 30%,rgba(0,0,0,0) 70%)'; document.body.appendChild(d); return d; })();
// 本線（初期の FV：top-v2）と同じ粒：中心から放射状に手前へ、手前ほど大きく尾を引く。紫〜桃の混ざる色。
// 文字がそろうと急に遅くなり、水色の波紋が広がる。背景は真っ黒（So 11/24「初期の FV が良かった」）
const TR = (new URLSearchParams(location.search).get('tr') || 'a').toLowerCase();   // FV→場面1 のつなぎ方の案
const FVP = (() => {
  const cv = document.getElementById('fvc'), ctx = cv.getContext('2d');
  const PAL = [[255,255,255],[255,255,255],[205,224,255],[160,200,255],[188,170,255],[214,198,255],[255,150,214],[255,214,160]];
  const W8 = [5,3,4,3,3,2,1,1];
  const pick = () => { let t = Math.random() * W8.reduce((x, y) => x + y, 0); for (let i = 0; i < PAL.length; i++) { t -= W8[i]; if (t <= 0) return PAL[i]; } return PAL[0]; };
  let W = 0, H = 0, D = 1, P = [];
  const SPR = (() => { const o = document.createElement('canvas'); o.width = o.height = 64; const g = o.getContext('2d');
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.28, 'rgba(255,255,255,.9)'); r.addColorStop(.55, 'rgba(255,255,255,.22)'); r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, 64, 64); return o; })();
  const tint = new Map();
  const sprite = c => { const k = c.join(','); if (tint.has(k)) return tint.get(k); const o = document.createElement('canvas'); o.width = o.height = 64; const g = o.getContext('2d');
    g.drawImage(SPR, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = `rgb(${k})`; g.fillRect(0, 0, 64, 64); tint.set(k, o); return o; };
  const spawn = (q, far) => { const a = Math.random() * 6.283, r = .03 + Math.pow(Math.random(), .85) * 1.1; q.x = Math.cos(a) * r; q.y = Math.sin(a) * r; q.z = far ? .7 + Math.random() * .3 : .06 + Math.random() * .94; q.c = pick(); q.tw = Math.random() * 6.3; q.s = Math.random() * .6 + .7; return q; };
  const fit = () => { D = Math.min(1.5, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * D); cv.height = Math.round(H * D); ctx.setTransform(D, 0, 0, D, 0, 0);
    const n = W < 820 ? 170 : 330; P = Array.from({ length: n }, () => spawn({}, false)); };
  fit(); addEventListener('resize', fit);
  let nz = 1, tt = 0, gx = .5, gy = .5, RG = [], lastR = -9999;
  const st = { cx: 0, cy: 0 };
  function draw(dtS, NOISE, boost, opaque) {
    const dt = dtS * 1000; nz += (NOISE - nz) * (1 - Math.pow(1 - .08, dt / 33)); tt += dt;
    gx += (.5 + FV.mx - gx) * .04; gy += (.5 + FV.my - gy) * .04;
    ctx.globalCompositeOperation = 'source-over';
    if (opaque) { ctx.fillStyle = '#02030a'; ctx.fillRect(0, 0, W, H); } else ctx.clearRect(0, 0, W, H);
    const cx = W * (.5 + (gx - .5) * .12), cy = H * (.5 + (gy - .5) * .12), f = Math.min(W, H) * .55, big = W < 820 ? .78 : 1;
    st.cx = cx; st.cy = cy;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * .6);
    g.addColorStop(0, `rgba(70,60,150,${(.05 + .05 * nz) * opaque})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    const v = (.00012 + .00014 * nz) * dt * boost, TRL = 300 + 200 * nz + 400 * (boost - 1);
    for (const q of P) {
      q.z -= v;
      if (q.z < .05) { spawn(q, true); continue; }
      const sx = cx + q.x / q.z * f, sy = cy + q.y / q.z * f;
      if (sx < -60 || sy < -60 || sx > W + 60 || sy > H + 60) { spawn(q, true); continue; }
      const near = 1 - q.z, tw = .7 + .3 * Math.sin(tt * .0016 * q.s + q.tw);
      const al = Math.min(.95, (.22 + .78 * near * near) * tw);
      const [r, gg, b] = q.c;
      const rad = (.8 + 6.2 * Math.pow(near, 1.7)) * q.s * big;
      const zb = Math.min(1.2, q.z + v / Math.max(dt, 1) * TRL), bx = cx + q.x / zb * f, by = cy + q.y / zb * f;
      if (near > .35 || boost > 1.2) {
        const lg = ctx.createLinearGradient(bx, by, sx, sy); lg.addColorStop(0, `rgba(${r},${gg},${b},0)`); lg.addColorStop(1, `rgba(${r},${gg},${b},${al * .5})`);
        ctx.strokeStyle = lg; ctx.lineWidth = rad * 1.1; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(sx, sy); ctx.stroke();
      }
      if (rad < 1.4) { ctx.fillStyle = `rgba(${r},${gg},${b},${al})`; ctx.fillRect(sx - rad * .7, sy - rad * .7, rad * 1.4, rad * 1.4); }
      else { ctx.globalAlpha = al; const d = rad * 3.2; ctx.drawImage(sprite(q.c), sx - d / 2, sy - d / 2, d, d); ctx.globalAlpha = 1; }
    }
    // 水色の波紋（文字がそろった合図）
    const S = 1 - nz;
    if (S < .02) RG = [];
    else if (tt - lastR > 1500) { lastR = tt; RG.push({ r: 0 }); }
    const rx = W * .5, ry = H * .42, M = Math.hypot(W, H) * .6, n = W < 820 ? 110 : 160;
    RG = RG.filter(o => { o.r += 2.2 * dt / 33; const a = (1 - o.r / M) * .7 * S; if (a <= 0) return false;
      for (let i = 0; i < n; i++) { const th = i / n * 6.283, jr = o.r + (Math.random() - .5) * 26 * nz * nz;
        ctx.fillStyle = i % 7 ? `rgba(167,228,255,${a})` : `rgba(214,243,255,${a})`;
        ctx.fillRect(rx + Math.cos(th) * jr, ry + Math.sin(th) * jr * .62, 2, 2); }
      return true; });
    ctx.globalCompositeOperation = 'source-over';
  }
  return { draw, st, get nz() { return nz; } };
})();
const fvWords = [...fvx.querySelectorAll('.wd')];
fvWords.forEach((w) => { const tx = w.textContent; w.textContent = ''; [...tx].forEach((c) => { const sp = document.createElement('span'); sp.className = 'ch'; sp.textContent = c; w.appendChild(sp); }); });
const FV = { nz: 1, A: [], B: [], F: 100, mx: 0, my: 0, cx: 0, cy: 0, locked: false };
// FV はカーソルで動かさない（So 11/24）
function fvLayout() {
  const W = innerWidth, H = innerHeight, sp = W <= 820;
  fvWords.forEach((w) => { w.style.fontSize = '100px'; w.style.transform = 'none'; });
  const ws = fvWords.map((w) => w.offsetWidth), gap = 28, total = ws[0] + ws[1] + ws[2] + gap * 2;
  const target = sp ? W * 0.9 : Math.min(W * 0.72, 1100);
  FV.F = 100 * target / total; fvWords.forEach((w) => { w.style.fontSize = FV.F + 'px'; });
  const k = FV.F / 100, wsF = ws.map((v) => v * k), gF = gap * k, tot = wsF[0] + wsF[1] + wsF[2] + gF * 2, x0 = (W - tot) / 2, yB = H * 0.42 - FV.F * 0.5;
  FV.B = [{ x: x0, y: yB, s: 1 }, { x: x0 + wsF[0] + gF, y: yB, s: 1 }, { x: x0 + wsF[0] + wsF[1] + gF * 2, y: yB, s: 1 }];
  FV.A = sp ? [{ x: W * 0.05, y: H * 0.13, s: 2.0 }, { x: W * 0.95 - wsF[1] * 1.55, y: H * 0.36, s: 1.55 }, { x: W * 0.04, y: H * 0.55, s: 2.05 }]
    : [{ x: W * 0.16, y: H * 0.17, s: 1.15 }, { x: W * 0.36, y: H * 0.39, s: 1.15 }, { x: W * 0.84 - wsF[2] * 1.15, y: H * 0.6, s: 1.15 }];
  fvSum.style.top = (yB + FV.F * 1.25) + 'px';
}
function fvFrame(dt, t, Ps) {
  // 文字：散らばった3語がスクロールで1列にそろう → 副題
  const p = RM ? 1 : clamp(Ps / 0.45), e = ease(p);
  FV.cx += (FV.mx - FV.cx) * 0.05; FV.cy += (FV.my - FV.cy) * 0.05;
  if (FV.A.length) fvWords.forEach((w, i) => { const a = FV.A[i], b = FV.B[i], d = [26, 48, 18][i] * (1 - e);
    w.style.transform = `translate3d(${a.x + (b.x - a.x) * e - FV.cx * d}px,${a.y + (b.y - a.y) * e - FV.cy * d}px,0) scale(${a.s + (b.s - a.s) * e})`; });
  const sv = clamp((p - 0.7) / 0.25); fvSum.style.opacity = sv; fvSum.style.transform = `translateY(${(1 - sv) * 14}px)`;
  const out = 1 - sstep(0.62, 0.8, Ps);
  fvx.style.opacity = out; fvx.style.visibility = out < 0.01 ? 'hidden' : 'visible';
  hint.style.opacity = 1 - clamp(p / 0.2);
  FV.nz = RM ? 0 : FVP.nz;
  if (!FV.locked && e > 0.985) { FV.locked = true; SND.lock(); } else if (FV.locked && e < 0.6) FV.locked = false;
  // 粒の層と、場面1へのつなぎ（案 a〜d）
  const k = sstep(0.55, 0.95, Ps);          // つなぎの進み
  let vo = 1 - k, boost = 1, opaque = 1, mask = '', flash = 0, scale = 1;
  if (TR === 'a') {          // a 光へ飛び込む：止まっていた粒が再び加速して手前へ流れ、白い光を抜けると宇宙
    boost = 1 + 7 * sstep(0.55, 0.85, Ps); scale = 1 + 0.5 * k * k; vo = 1 - sstep(0.8, 0.95, Ps); flash = Math.sin(Math.PI * sstep(0.78, 0.98, Ps)) * 0.85;
  } else if (TR === 'b') {   // b 波紋がひらく：水色の輪が広がり、輪の内側から宇宙が見えてくる
    const R = Math.hypot(innerWidth, innerHeight) * 0.75 * sstep(0.58, 0.95, Ps);
    vo = 1; mask = R > 1 ? `radial-gradient(circle at 50% 42%, transparent ${R}px, #000 ${R + 60}px)` : '';
    if (Ps > 0.97) vo = 0;
  } else if (TR === 'c') {   // c 粒が星になる：粒はその場で止まって残り、黒い地だけが溶けて宇宙が現れる
    opaque = 1 - sstep(0.55, 0.85, Ps); vo = 1 - sstep(0.85, 1.05, Ps);
  } else {                   // d ゆっくり暗転：粒と文字がゆっくり闇に沈み、闇の奥から宇宙が明けてくる
    vo = 1 - sstep(0.55, 0.78, Ps); opaque = 1;
  }
  fvv.style.opacity = vo; fvv.style.visibility = vo < 0.01 ? 'hidden' : 'visible';
  fvv.style.transform = scale !== 1 ? `scale(${scale})` : '';
  fvv.style.webkitMaskImage = fvv.style.maskImage = mask;
  fvFlash.style.opacity = flash;
  if (vo > 0.01) FVP.draw(dt, RM ? 0 : 1 - e, boost, opaque);
  // 3D 側：FV の間は朱を出さない。d は闇から明ける
  { const oa = sstep(1.0, 1.35, Ps); origin.visible = head.visible = headCore.visible = oa > 0.01; origin.material.opacity = head.material.opacity = headCore.material.opacity = oa; sigLight.intensity = 26 * oa; }
  fvDark = TR === 'd' ? 1 - sstep(0.72, 1.05, Ps) : 0;
}
// ---------- 入口の画面：音あり／音なしを選んでから始まる ----------
const gate = document.getElementById('gate');
let gateDone = false;
root.style.overflow = 'hidden';
function enter(withSound) {
  if (gateDone) return; gateDone = true;
  SND.set(withSound);
  gate.classList.add('out'); root.style.overflow = '';
  setTimeout(() => fvx.classList.add('ready'), 250);
}
gate.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => enter(b.dataset.s === '1')));
// ---------- STORY：1回のスクロールで次の場面まで進む（途中で止まらない） ----------
const STOPS = [0.5, 1.55, 2.55, 3.55, 4.55, 5.55, 6.55];
let snapBusy = false, snapRaf = 0, wheelAcc = 0, wheelT = 0, lastSnap = 0;
function snapTo(pT) {
  const y0 = scrollY, y1 = toY(pT), t0 = performance.now(), dur = 4200;   // 場面の切り替えはゆっくり（So 11/24）
  snapBusy = true; lastSnap = t0; cancelAnimationFrame(snapRaf);
  const step = (now) => { const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    scrollTo(0, y0 + (y1 - y0) * e); if (k < 1) snapRaf = requestAnimationFrame(step); else setTimeout(() => { snapBusy = false; }, 120); };
  snapRaf = requestAnimationFrame(step);
}
function snapDir(dir) {
  const p = P;
  if (dir > 0) {
    if (p < STOPS[0] - 0.02) return false;               // FV の文字がそろうまでは普通にスクロール
    if (p >= STOPS[STOPS.length - 1] - 0.02) { if (p < 7) { snapTo(7.02); return true; } return false; }
    const nx = STOPS.find((q) => q > p + 0.03); snapTo(nx); return true;
  } else {
    if (p <= STOPS[0] + 0.03) return false;
    if (p > 7.05) return false;                           // 夜明け以降は普通に戻る
    const pv = [...STOPS].reverse().find((q) => q < p - 0.03); snapTo(pv ?? 0); return true;
  }
}
addEventListener('wheel', (e) => {
  if (!gateDone) return;
  const inStory = P > STOPS[0] - 0.02 && P < 7.05;
  if (!inStory && !snapBusy) return;
  e.preventDefault();
  const now = performance.now();
  if (snapBusy || now - lastSnap < 4500 && now - wheelT < 220) { wheelT = now; return; }  // 慣性の続きは捨てる
  wheelT = now; wheelAcc += e.deltaY;
  if (Math.abs(wheelAcc) > 18) { const d = Math.sign(wheelAcc); wheelAcc = 0; if (!snapDir(d)) { scrollBy(0, d * 60); } }
}, { passive: false });
let tY = null;
addEventListener('touchstart', (e) => { tY = e.touches[0].clientY; }, { passive: true });
addEventListener('touchmove', (e) => { if (gateDone && (snapBusy || (P > STOPS[0] - 0.02 && P < 7.05))) e.preventDefault(); }, { passive: false });
addEventListener('touchend', (e) => {
  if (tY == null || snapBusy) return; const dy = tY - (e.changedTouches[0]?.clientY ?? tY); tY = null;
  if (P > STOPS[0] - 0.02 && P < 7.05 && Math.abs(dy) > 30) snapDir(Math.sign(dy));
}, { passive: true });
addEventListener('keydown', (e) => {
  if (!gateDone || snapBusy && /Arrow|Page|Space/.test(e.code)) { if (snapBusy) e.preventDefault(); return; }
  const d = ['ArrowDown', 'PageDown', 'Space'].includes(e.code) ? 1 : ['ArrowUp', 'PageUp'].includes(e.code) ? -1 : 0;
  if (d && P > STOPS[0] - 0.02 && P < 7.05 && snapDir(d)) e.preventDefault();
});
// ---------- STORY をスキップ ----------
const skip3 = document.getElementById('skip3');
skip3.addEventListener('click', (e) => { e.preventDefault(); cancelAnimationFrame(snapRaf); snapBusy = false; const el = document.getElementById('paper'); scrollTo(0, el.getBoundingClientRect().top + scrollY); });

// ---------- 仕上げ：自前の被写界深度＋光の層の合成 → ブルーム → 色調 → 壊して繋ぐ ----------
const mkRT = () => new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: true });
const rtS = mkRT(), rtF = mkRT();
const depthTex = new THREE.DepthTexture(1, 1); depthTex.type = THREE.UnsignedIntType;
rtS.depthTexture = depthTex; rtF.depthTexture = depthTex;   // 光の層は不透明の層の深度で隠れる
const composer = new EffectComposer(renderer);
const dofPass = new ShaderPass({
  defines: { TAPS: TIERS[tier].taps },
  uniforms: { tCol: { value: rtS.texture }, tDep: { value: depthTex }, tFx: { value: rtF.texture }, uRes: { value: new THREE.Vector2(1, 1) },
    uFocus: U.focus, uAp: { value: 1.15 }, uMax: { value: 12 }, uSky: { value: 3 }, uNear: { value: camera.near }, uFar: { value: camera.far }, uOn: { value: TIERS[tier].dof } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tCol, tDep, tFx; uniform vec2 uRes; uniform float uFocus, uAp, uMax, uSky, uNear, uFar, uOn; varying vec2 vUv;
    float lin(float d){ float z=d*2.-1.; return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear)); }
    float coc(vec2 uv){ float d=texture2D(tDep,uv).x; if(d>.99999) return uSky; float z=lin(d); return clamp(abs(z-uFocus)/z*uAp,0.,1.)*uMax; }
    void main(){
      vec3 c=texture2D(tCol,vUv).rgb;
      if(uOn>.5){
        float cc=coc(vUv);
        if(cc>.75){
          vec3 s=c; float w=1.; vec2 px=1./uRes;
          for(int i=0;i<TAPS;i++){ float fi=float(i)+.5; float r=sqrt(fi/float(TAPS))*cc; float a=fi*2.39996323;
            vec2 uv=vUv+vec2(cos(a),sin(a))*r*px;
            float ww=smoothstep(r-1.5,r+.5,coc(uv));
            s+=texture2D(tCol,uv).rgb*ww; w+=ww; }
          c=s/w;
        }
      }
      c+=texture2D(tFx,vUv).rgb;
      gl_FragColor=vec4(c,1.);
    }`,
}, 'tUnused');
dofPass.uniforms.tCol.value = rtS.texture; dofPass.uniforms.tDep.value = depthTex; dofPass.uniforms.tFx.value = rtF.texture;
composer.addPass(dofPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.75, 0.55, 0.8); composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.002 }, uWarp: { value: 0 }, uGrain: { value: 0.05 }, uVig: { value: 0.6 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) },
    uFade: { value: 0 }, uGl: { value: 0 }, uDawn: { value: 0 }, uPaper: { value: new THREE.Vector3(246 / 255, 244 / 255, 238 / 255) } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `#define TAPS ${Q.warpTaps}
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uWarp, uGrain, uVig, uFade, uGl, uDawn; uniform vec2 uRes; uniform vec3 uPaper; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 uv=vUv; float g=uGl; float hs=0.;
      if(g>.002){
        float t=floor(uTime*30.);
        // 1) ブロック状のずれ
        vec2 bs=vec2(14.,8.)*(1.+floor(h(vec2(t,3.))*3.)); vec2 b=floor(uv*bs);
        if(h(b+vec2(t*1.3,t*.7))<g*.5){ uv.x+=(h(b+t)-.5)*.24*g; uv.y+=(h(b.yx+t*2.)-.5)*.03*g; hs=1.; }
        // 2) 縦の引き伸ばし（縦の帯の中だけ、1点の色が上下に伸びる）
        float cx=floor(uv.x*64.); if(h(vec2(cx,t*.31+7.))<g*.42){ float a=h(vec2(cx,t+11.)); uv.y=a+(uv.y-a)*mix(1.,.025,g); }
        // 3) 横の裂け目
        float ry=floor(uv.y*110.); if(h(vec2(ry,t*.5))<g*.1) uv.x+=(h(vec2(ry,t))-.5)*.45*g;
      }
      vec2 d=uv-.5; float rr=length(d*vec2(uRes.x/uRes.y,1.))/.9;
      float split=uGl*.022+hs*uGl*.012;
      vec3 c=vec3(0.);
      for(int i=0;i<TAPS;i++){ float tt=float(i)/float(TAPS); float s=1.-uWarp*tt*.06*rr; float ca=uCA*(.4+rr);
        c.r+=texture2D(tDiffuse,.5+d*(s+ca)+vec2(split,0.)).r; c.g+=texture2D(tDiffuse,.5+d*s).g; c.b+=texture2D(tDiffuse,.5+d*(s-ca)-vec2(split,0.)).b; }
      c/=float(TAPS);
      c*=1.+g*.35*(step(.5,fract(gl_FragCoord.y*.5))-.5);
      c*=1.-uVig*pow(clamp(rr,0.,1.4),2.4);
      c+=(h(vUv*uRes+fract(uTime*7.)*91.)-.5)*uGrain;
      c=mix(c,uPaper,uDawn);
      c=mix(c,vec3(0.),uFade);
      gl_FragColor=vec4(c,1.);
    }`,
});
composer.addPass(finalPass);

// ---------- 画面の文字（乱数から解ける表示） ----------
const GL = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789#%&*+=<>/ABCDEFGHJKLMNPQRSTUVWXYZ';
function splitChars(el) {
  const walk = (n) => {
    [...n.childNodes].forEach((c) => {
      if (c.nodeType === 3) {
        const f = document.createDocumentFragment();
        for (const ch of c.textContent) { if (ch === '\n') continue; const s = document.createElement('span'); s.className = 'c'; s.textContent = ch; s.dataset.ch = ch; f.appendChild(s); }
        c.replaceWith(f);
      } else if (c.nodeType === 1 && c.tagName !== 'WBR' && c.tagName !== 'A') walk(c);
    });
  };
  walk(el); return [...el.querySelectorAll('.c')];
}
const panels = [...document.querySelectorAll('.tx')].map((el) => ({ el, i: +el.dataset.i, chars: splitChars(el), shown: false, timer: 0 }));
function reveal(p) {
  p.shown = true; const cs = p.chars; const N = cs.length; const t0 = performance.now(); const dur = Math.min(1400, 380 + N * 6);
  cancelAnimationFrame(p.timer);
  const step = () => {
    const e = performance.now() - t0;
    for (let i = 0; i < N; i++) {
      const at = (i / N) * dur * 0.8, c = cs[i];
      if (e >= at + 140) { if (c.textContent !== c.dataset.ch) c.textContent = c.dataset.ch; c.classList.add('on'); }
      else if (e >= at) { c.classList.add('on'); if (/\S/.test(c.dataset.ch)) { c.textContent = GL[(Math.random() * GL.length) | 0]; SND.tick(); } }
    }
    if (e < dur + 160) p.timer = requestAnimationFrame(step);
  };
  if (RM) cs.forEach((c) => c.classList.add('on')); else step();
}
function hide(p) { p.shown = false; cancelAnimationFrame(p.timer); p.chars.forEach((c) => { c.classList.remove('on'); c.textContent = c.dataset.ch; }); }

// HUD
const hud = document.getElementById('hud');
const tag = document.getElementById('tag'), ll = document.getElementById('ll'), lc = document.getElementById('lc');
const pn = document.getElementById('pn'), pb = document.getElementById('pb'), gauge = document.getElementById('gauge'), tk = document.getElementById('tk'), pc = document.getElementById('pc');
const hint = document.getElementById('hint');
let tagScene = -1, tagT0 = 0;

// ---------- スクロールとカメラ ----------
const secs = [...document.querySelectorAll('#scroller > .sc')];   // 0〜6＝場面、7＝夜明け
let secTop = [], secH = [];
const measure = () => { secTop = secs.map((s) => s.getBoundingClientRect().top + scrollY); secH = secs.map((s) => s.offsetHeight); };
const PMAX = secs.length;
let P = 0, Ps = 0, vel = 0, lastPs = 0;
const readScroll = () => {
  const y = scrollY; let p = PMAX;
  for (let i = 0; i < secs.length; i++) if (y < secTop[i] + secH[i]) { p = i + Math.max(0, y - secTop[i]) / secH[i]; break; }
  P = p;
  root.classList.toggle('day', P > 7.12);
};
const toY = (p) => { const i = Math.min(secs.length - 1, Math.floor(p)); return secTop[i] + (p - i) * secH[i]; };
measure(); addEventListener('scroll', readScroll, { passive: true }); readScroll(); Ps = P;
const mouse = { x: 0, y: 0, sx: 0, sy: 0 };
addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; }, { passive: true });

function camS(P) {
  const k = Math.floor(P), x = P - k;
  let s;
  if (x < 0.35) s = k === 0 ? 0 : k - 1 + ease((x + 0.25) / 0.6);
  else if (x < 0.75) s = k;
  else s = k + ease((x - 0.75) / 0.6);
  return Math.min(s, 6);
}
const tmpV = new THREE.Vector3(), look = new THREE.Vector3(), lookS = new THREE.Vector3().copy(T[0]);
const sideOf = [0, 1, -1, 1, -1, -1, -1, 0];
const spOff = [0, .12, -.04, .12, .1, .12, .14, 0];
const DAWN_POS = V(0, 10.6, -468);
let viewShift = 0;

function sizeTargets() {
  const w = Math.round(innerWidth * DPR), h = Math.round(innerHeight * DPR);
  rtS.setSize(w, h); rtF.setSize(w, h); depthTex.image.width = w; depthTex.image.height = h;
  dofPass.uniforms.uRes.value.set(w, h); dofPass.uniforms.uMax.value = (SP ? 8 : 12) * DPR; dofPass.uniforms.uSky.value = 3 * DPR;
}
function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.fov = w < 820 ? 62 : 46; camera.updateProjectionMatrix();
  renderer.setPixelRatio(DPR); renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h);
  sizeTargets();
  finalPass.uniforms.uRes.value.set(w, h); U.dpr.value = DPR;
  U.px.value = h * DPR * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  dustLayers[0].uniforms.uCoc.value = 46 * DPR; dustLayers[1].uniforms.uCoc.value = 18 * DPR; dustLayers[2].uniforms.uCoc.value = 6 * DPR;
  measure(); readScroll(); fvLayout();
}
addEventListener('resize', onResize);
function applyTier() {
  const tt = TIERS[tier];
  DPR = Math.min(devicePixelRatio || 1, tt.dpr);
  dofPass.material.defines.TAPS = tt.taps; dofPass.material.needsUpdate = true; dofPass.uniforms.uOn.value = tt.dof;
  onResize();
}

function renderScene() {
  renderer.setRenderTarget(rtS); renderer.setClearColor(0x000000, 1); renderer.clear(true, true, false);
  camera.layers.set(0); renderer.render(scene, camera);
  renderer.setRenderTarget(rtF); renderer.clear(true, false, false);
  camera.layers.set(FX); renderer.render(scene, camera);
  camera.layers.enableAll();
  renderer.setRenderTarget(null);
}

const clock = new THREE.Clock();
let fr = 0, acc = 0, warm = 0, checks = 0, lastScene = 0, glT0 = -9, glAmp = 0;
const fpsLog = [];
function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05); const t = clock.elapsedTime;
  U.time.value = t;
  Ps += (P - Ps) * (1 - Math.pow(0.0009, dt));
  if (Math.abs(P - Ps) < 1e-4) Ps = P;
  vel = (Ps - lastPs) / Math.max(dt, 1e-3); lastPs = Ps;
  const k = Math.min(7, Math.floor(Ps)), x = Ps - k, kk = Math.min(6, k);
  const dawn = sstep(6.9, 7.45, Ps);

  // 全部が生成りになったら描かない
  const hidden = Ps > 7.8;
  canvas.style.visibility = hidden ? 'hidden' : 'visible';
  hud.style.opacity = 1 - sstep(0.05, 0.5, dawn);
  if (hidden) { SND.update({ noise: 0, travel: 0, vel: 0, dawn: 1, fv: 0, day: 1, tv: 0 }); return; }

  // カメラ
  const s = camS(Ps); const sf = s - Math.floor(s); const travel = Math.sin(Math.PI * clamp(sf)) * (s < 6 ? 1 : 0);
  const pos = camCurve.getPoint(s / 6);
  const drift = Math.sin(Math.PI * clamp((x - 0.05) / 0.95)) * 1.4 * (k < 7 ? 1 : 0);
  const tgtA = T[Math.floor(s)], tgtB = T[Math.min(6, Math.ceil(s))];
  look.copy(tgtA).lerp(tgtB, ease(sf));
  pos.add(tmpV.copy(T[kk]).sub(pos).normalize().multiplyScalar(drift * (1 - dawn)));
  const tan = camCurve.getTangent(clamp(s / 6, 0, 1));
  look.lerp(tmpV.copy(pos).add(tan.multiplyScalar(20)), travel * 0.65);
  if (dawn > 0) { const e = ease(dawn); pos.lerp(DAWN_POS, e); look.lerp(farStar.position, e); }
  mouse.sx += (mouse.x - mouse.sx) * 0.04; mouse.sy += (mouse.y - mouse.sy) * 0.04;
  camera.position.copy(pos).add(tmpV.set(mouse.sx * 0.9, -mouse.sy * 0.6, 0));
  lookS.lerp(look, 0.12);
  camera.lookAt(lookS);
  camera.rotateZ(Math.sin(t * 0.21) * 0.012 + travel * 0.05 * Math.sign(vel || 1));
  const sideT = (innerWidth < 820) ? 0 : sideOf[k] * (1 - travel) * sstep(0.1, 0.4, x) * (1 - dawn);
  viewShift += (sideT - viewShift) * 0.06;
  if (innerWidth < 820) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * spOff[k] * (1 - travel) * (1 - dawn), innerWidth, innerHeight);
  else camera.setViewOffset(innerWidth, innerHeight, viewShift * innerWidth * 0.15, 0, innerWidth, innerHeight);
  U.camPos.value.copy(camera.position);

  // 場面の切り替え＝壊して繋ぐ（短く・強く）
  const sc = Math.round(s);
  if (sc !== lastScene) { lastScene = sc; glT0 = t; glAmp = 1; SND.glitch(); SND.scene(sc); }
  if (dawn > 0.3) SND.scene(7);
  const ge = t - glT0;
  let gl = ge < 0.42 ? glAmp * Math.pow(1 - ge / 0.42, 1.6) * (0.6 + 0.4 * Math.sin(ge * 60)) : 0;

  // 信号の頭・光
  const lineU = clamp(0.012 + Ps / 6.6 * 0.86);
  sigU.uHead.value += (Math.max(lineU, 0.06) - sigU.uHead.value) * 0.05;
  head.position.copy(lineCurve.getPoint(clamp(sigU.uHead.value)));
  headCore.position.copy(head.position);
  head.scale.setScalar(2.6 + Math.sin(t * 3) * 0.4);
  origin.scale.setScalar(4 + Math.sin(t * 2.2) * 0.8);
  sigLight.position.copy(lineCurve.getPoint(clamp(sigU.uHead.value - 0.01)));

  // もや：近すぎ・遠すぎは消す
  for (const hz of hazes) { const d = hz.s.position.distanceTo(camera.position); hz.s.material.opacity = hz.base * sstep(6, 26, d) * (1 - sstep(150, 230, d)) * (1 - dawn); }

  // 場面1：手の置き換え（本線と同じ周期：奥の手から1本ずつ AI に置き換わり、全部が人の手へ戻る を繰り返す）
  const on1 = Math.abs(Ps - 1) < 0.62;
  if (on1 && h1T0 < 0) { h1T0 = t; h1Idx = 0; h1Cyc = -1; }
  if (!on1) h1T0 = -1;
  const CYC1 = 9000, BACK1 = 6800, hc = on1 ? (t - h1T0) * 1000 : 0, cyc = Math.floor(hc / CYC1), ht = hc % CYC1;
  if (on1 && cyc !== h1Cyc) { h1Cyc = cyc; h1Idx = 0; }
  hands.forEach((h) => {
    const order = hands.length - 1 - h.j;            // 0＝一番奥
    const at = H1SEQ[Math.min(H1SEQ.length - 1, Math.round(order / Math.max(1, hands.length - 1) * (H1SEQ.length - 1)))];
    const tgt = on1 && ht >= at && ht < BACK1 ? 1 : 0;
    if (on1 && tgt && !h.lit) { h.lit = true; h.fl = t; SND.swap(order / hands.length); }
    if (!tgt && h.lit) { h.lit = false; }
    SND.person(h.j, hands.length, h.u.value > 0.5, on1 ? 1 - sstep(0.25, 0.6, Math.abs(Ps - 1.55)) : 0);
    if (h.glow) h.glow.material.opacity = sstep(0.6, 1, h.u.value) * (0.8 + 0.2 * Math.sin(t * 9 + h.j));
    h.u.value += (tgt - h.u.value) * (tgt ? 0.32 : 0.06);
    h.g.position.y = h.baseY + Math.sin(t * 0.5 + h.ph) * 0.05;
    const fe = (t - (h.fl ?? -9)) / 0.7;
    h.flash.material.opacity = fe < 1 ? (fe < 0.25 ? fe / 0.25 : 1 - (fe - 0.25) / 0.75) * 0.9 : 0;
    h.flash.scale.setScalar(1.2 + 2.2 * clamp(fe));
  });
  h1vp.material.opacity = on1 ? (ht < 400 ? ht / 400 : ht < 5600 ? 0.9 : Math.max(0, 1 - (ht - 5600) / 1100)) * 0.6 : 0;
  // 場面2：枝が伸びる
  { const in2 = Math.abs(Ps - 2) < 0.75; const base = sstep(-0.45, 0.4, Ps - 2) * 0.32;   // ×2.2 で初期の木（世代8/11≒0.7）まで
    if (in2) fGrowT += dt / 80;                       // 着いた時は初期の木の大きさ、そこから約80秒で画面が埋まる
    forestU.uGrow.value = Math.min(1.02, base * 2.2 + fGrowT * 0.32) * (Ps > 1.2 ? 1 : 0); }
  // 場面3：テレビ
  if (Math.abs(Ps - 3) < 1.6) updateTVs(t, Ps);
  { const near3 = Math.abs(Ps - 3) < 1.2; tvShowMesh.visible = near3;
    const d3 = Math.abs(Ps - 3.55); tvShow.setLevel(near3 ? Math.max(1 - sstep(0.12, 0.4, d3), 0.06 * (1 - sstep(0.6, 1.1, d3))) : 0);
    if (near3) { tvShow.update(t, dt); tvTex.needsUpdate = true; } }
  tvs.scrU.uOn.value = 0.25 + 0.75 * sstep(-0.4, 0.3, Ps - 3);
  // 場面4（案B）：着いたら時間で目盛りが探り、約4.5秒で合う
  { const at4 = Math.abs(Ps - 4.55) < 0.32; const vis4 = 1 - sstep(0.55, 0.95, Math.abs(Ps - 4.5));
    tune.group.visible = false && vis4 > 0.01;   // 初期の案に戻した（So 11/24） tuneU.uVis.value = vis4; tuneU.uT.value = t;
    if (at4) tune.T = Math.min(1, tune.T + dt / 4.5); else if (Math.abs(Ps - 4.5) > 0.9) tune.T = 0;
    const keys = [-6.2, 3.8, -2.2, tune.X0 + 1.1, tune.X0 - 0.35, tune.X0];
    const uu = clamp(tune.T / 0.74) * (keys.length - 1), ki = Math.min(keys.length - 2, Math.floor(uu)), kf = uu - ki, ke = kf * kf * (3 - 2 * kf);
    const xc = keys[ki] + (keys[ki + 1] - keys[ki]) * ke + mouse.sx * 1.2 * (1 - sstep(0.74, 0.86, tune.T));
    const lock = sstep(0.74, 0.88, tune.T);
    tuneU.uXc.value = xc; tuneU.uLock.value = lock; tuneU.uNear.value = Math.exp(-Math.pow((xc - tune.X0) / 0.9, 2)); tuneU.uBw.value = 0.9 + (0.45 - 0.9) * lock;
    tune.cur.position.x = tune.curV.position.x = xc;
    tune.cur.material.opacity = 0.55 * (1 - lock * 0.7) * vis4; tune.curV.material.opacity = 0.3 * (1 - lock) * vis4;
    if (false && !tune.locked && lock > 0.6) { tune.locked = true; SND.lock(); } else if (tune.locked && lock < 0.2) tune.locked = false;
    SND.radio({ on: 0 * vis4 * (at4 ? 1 : 0.4), x: (xc + tune.XW) / (2 * tune.XW), lock, near: tuneU.uNear.value, t }); }
  // 場面4：収束（旧案は隠す）
  // 止まる位置に着いてから時間で集まり、打ち上がる（約4.5秒）
  const conv = Math.max(sstep(0.0, 0.7, tune.T), sstep(-0.3, 0.5, Ps - 4) * 0.35);
  convU.uConv.value = conv;
  const rise = sstep(0.72, 0.95, tune.T);
  beam.scale.y = 0.001 + rise * 60; beam.material.uniforms.uA.value = rise;
  core.scale.setScalar(0.4 + conv * 4.2 + Math.sin(t * 8) * 0.2 * conv); core.material.opacity = conv;
  coreW.scale.setScalar(0.2 + conv * 1.6); coreW.material.opacity = conv;
  const gv = Math.abs(Ps - 4.5) < 0.5 ? 1 : 0; gauge.style.opacity = gv;
  if (gv) { const pct = Math.round(conv * 100); pc.textContent = String(pct).padStart(3, '0'); tk.style.left = pct * 1.4 * (innerWidth < 820 ? 80 / 140 : 1) + 'px'; }
  // 場面5
  if (Math.abs(Ps - 5) < 1.6) {
    const l5 = sstep(-0.1, 0.7, Ps - 5);
    s5.phi = Math.PI + Math.sin(t * 0.55) * 1.9;
    const dirA = V(-1, 0.15, 0), dirB = V(1, -0.15, 0);
    s5.wedges.forEach((w) => {
      let a = w.mid - s5.phi; a = Math.atan2(Math.sin(a), Math.cos(a));
      const toA = a < 0;
      w.m.material = toA ? s5.pl : s5.ch;
      const out = V(Math.cos(w.mid), Math.sin(w.mid), 0).multiplyScalar(0.14);
      const tgt = (toA ? dirA : dirB).clone().multiplyScalar(0.34).add(out);
      w.off.lerp(tgt, 0.06); w.m.position.copy(w.off);
    });
    s5.zs.rotation.z = Math.sin(t * 0.2) * 0.08;
    const N = s5.orbs.length, R = 1.05 + l5 * 1.7, joined = 4 + l5 * (N - 4);
    const pa = s5.lineG.attributes.position.array; let q = 0;
    s5.orbs.forEach((o, i) => {
      const vis = clamp(joined - i); const ang = i / N * TAU + t * 0.06;
      o.position.set(Math.cos(ang) * R, Math.sin(ang) * R, Math.sin(t * 0.8 + i) * 0.05);
      o.scale.setScalar((0.13 + l5 * 0.1) * vis + 0.0001);
    });
    for (let i = 0; i < N; i++) {
      const a = s5.orbs[i].position, b = s5.orbs[(i + 1) % N].position, va = clamp(joined - i), vb = clamp(joined - (i + 1) % N);
      const on = Math.min(va, vb) > 0.5 && (i + 1 < N || joined >= N - 0.01);
      if (on) { pa.set([a.x, a.y, a.z, b.x, b.y, b.z], q); } else pa.fill(0, q, q + 6);
      q += 6;
      if (va > 0.5) pa.set([a.x * 0.12, a.y * 0.12, 0, a.x, a.y, a.z], q); else pa.fill(0, q, q + 6);
      q += 6;
    }
    s5.lineG.attributes.position.needsUpdate = true;
    s5.lineM.opacity = 0.25 + l5 * 0.6;
    s5.trail.forEach((tr, i) => { const rr2 = 1.05 + (i + 1) / 4 * 1.7; tr.scale.setScalar(rr2); tr.material.opacity = l5 > (i + 1) / 4 ? 0.35 : 0; });
    s5.center.scale.setScalar(0.6 + l5 * 3.6 + Math.sin(t * 2) * 0.1); s5.center.material.opacity = 0.35 + l5 * 0.65;
    s5.ps.rotation.z = t * 0.03;
  }
  // 場面6：板が揃って橋になる
  const l6 = sstep(0.12, 0.95, Ps - 6);
  if (Ps > 4.8) updatePlanks(l6, t);
  s6.guide.material.opacity = (0.15 + 0.4 * sstep(-0.6, 0, Ps - 6)) * (1 - sstep(0.5, 1, l6) * 0.6) * (1 - dawn);
  farStar.scale.setScalar(70 + dawn * 520); farStar.material.opacity = 0.85;

  // 夜明け：霧が明るくなり、露出が上がり、最後は生成りの紙と同じ色に
  U.dawn.value = sstep(0.1, 0.9, dawn);
  scene.fog.color.copy(FOG0).lerp(CREAM, sstep(0.0, 0.85, dawn));
  U.fogD.value = scene.fog.density = FOGD * (1 + dawn * 2.2);
  renderer.toneMappingExposure = 0.78 + dawn * 1.62;
  skyU.uBright.value = 0.28 + dawn * 0.12;

  // FV（映像・文字）
  fvFrame(dt, t, Ps);
  skip3.classList.toggle('show', P > 0.6 && P < 6.95);
  SND.update({ noise: FV.nz, travel, vel, dawn, fv: 1 - sstep(0.62, 0.9, Ps), day: 0, tv: 1 - sstep(0.35, 0.7, Math.abs(Ps - 3)) });
  panels.forEach((p) => {
    const v = sstep(p.i + 0.2, 0.34 + p.i, Ps) * (1 - sstep(p.i + 0.84, p.i + 0.97, Ps));
    p.el.style.opacity = v;
    const off = (1 - v) * 18;
    p.el.style.transform = innerWidth < 820 ? `translateY(${off}px)` : `translateY(calc(-50% + ${off}px))`;
    p.el.style.filter = v < 0.99 ? `blur(${(1 - v) * 6}px)` : 'none';
    p.el.style.pointerEvents = v > 0.6 ? 'auto' : 'none';
    if (v > 0.35 && !p.shown) reveal(p); if (v < 0.02 && p.shown) hide(p);
  });
  // HUD：場面番号と引き出し線
  pn.textContent = String(Math.min(6, Math.max(0, Math.round(Ps - 0.3)))).padStart(2, '0');
  pb.style.width = clamp(Ps / 6.9) * 100 + '%';
  const tagOn = k >= 1 && k <= 6 && x > 0.3 && x < 0.86 && innerWidth >= 820;
  if (tagOn) {
    tmpV.copy(T[k]).project(camera);
    const sx = (tmpV.x * 0.5 + 0.5) * innerWidth, sy = (-tmpV.y * 0.5 + 0.5) * innerHeight;
    const lx = sx + (sideOf[k] > 0 ? -190 : 130), ly = sy - 140;
    if (tagScene !== k) { tagScene = k; tagT0 = t; }
    const raw = `${String(k).padStart(2, '0')} / 06\n x ${T[k].x.toFixed(2)}  y ${T[k].y.toFixed(2)}\n z ${T[k].z.toFixed(2)}  d ${camera.position.distanceTo(T[k]).toFixed(2)}`;
    const e = clamp((t - tagT0) / 0.7);
    tag.textContent = [...raw].map((ch, i) => (ch === '\n' || ch === ' ' || i / raw.length < e) ? ch : GL[(Math.random() * 36 + 25) | 0]).join('');
    tag.style.transform = `translate(${lx + 8}px, ${ly - 42}px)`; tag.style.opacity = 1;
    ll.setAttribute('x1', sx); ll.setAttribute('y1', sy); ll.setAttribute('x2', lx); ll.setAttribute('y2', ly);
    lc.setAttribute('cx', sx); lc.setAttribute('cy', sy); ll.style.opacity = lc.style.opacity = 1;
  } else { tag.style.opacity = 0; ll.style.opacity = lc.style.opacity = 0; tagScene = -1; }

  // ピント：止まっている間は主役、移動中は手前寄り
  const fTarget = k >= 7 ? 40 : camera.position.distanceTo(T[kk]) * (1 - travel) + 14 * travel;
  U.focus.value += (fTarget - U.focus.value) * 0.1;
  dofPass.uniforms.uFocus.value = U.focus.value;
  dofPass.uniforms.uAp.value = 1.15 * (1 - dawn);
  finalPass.uniforms.uTime.value = t;
  finalPass.uniforms.uGl.value = RM ? 0 : gl;
  finalPass.uniforms.uFade.value = Math.max(finalPass.uniforms.uFade.value * 0, fvDark);
  finalPass.uniforms.uCA.value = RM ? 0.001 : 0.002 + Math.min(Math.abs(vel) * 0.008, 0.012) + travel * 0.004;
  finalPass.uniforms.uWarp.value = RM ? 0 : travel * 1.0 + Math.min(Math.abs(vel) * 0.6, 1.0);
  finalPass.uniforms.uDawn.value = sstep(0.55, 1, dawn);
  finalPass.uniforms.uVig.value = 0.9 * (1 - dawn);
  finalPass.uniforms.uGrain.value = 0.05 * (1 - dawn * 0.7);
  bloom.strength = 0.72 + travel * 0.3 + dawn * 0.8;

  renderScene();
  composer.render(dt);

  // 遅い端末では段を下げる（一度下げたら戻さない）
  if (document.visibilityState === 'visible') {
    warm++;
    if (warm > 90) { fr++; acc += dt; if (fr === 90) { const avg = acc / fr; fpsLog.push(Math.round(1 / avg)); if (QLOCK < 0 && avg > 1 / 50 && tier < 3) { tier++; applyTier(); } fr = 0; acc = 0; checks++; } }
  }
}

// ---------- 起動 ----------
onResize();
updateTVs(0);
renderer.compile(scene, camera);
renderScene(); composer.render(0.016);
fvWords.forEach((w, i) => w.querySelectorAll('.ch').forEach((c, j) => { c.style.transitionDelay = (0.2 + i * 0.22 + j * 0.045) + 's'; }));
(document.fonts ? document.fonts.ready : Promise.resolve()).then(() => { fvLayout(); measure(); readScroll(); });
requestAnimationFrame(frame);
setTimeout(() => {
  ld.classList.add('out');
  if (RM) enter(false);
}, 250);
window.__b = {
  get P() { return Ps; }, setP(v) { P = v; Ps = v; lastPs = v; }, toY, measure, renderer, used,
  get tier() { return tier; }, setTier(n) { tier = n; applyTier(); }, fps: fpsLog, setGrow(v) { fGrowT = v; },
};
