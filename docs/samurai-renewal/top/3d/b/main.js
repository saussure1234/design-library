// 試作B「信号を探す宇宙の航行」— すべて自作（three.js 本体と公式 addons のみ使用）
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const root = document.documentElement;
if (root.classList.contains('nogl')) { document.getElementById('ld')?.remove(); throw new Error('no webgl'); }

const SP = matchMedia('(max-width: 820px)').matches || /iPhone|Android.+Mobile/.test(navigator.userAgent);
const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
const Q = SP
  ? { rocks: 260, shards: 1400, dust: 9000, conv: 5000, tvs: 46, trees: 8, depth: 7, dpr: 1.5, bokeh: false, taps: 4 }
  : { rocks: 900, shards: 5200, dust: 42000, conv: 16000, tvs: 120, trees: 16, depth: 8, dpr: 1.5, bokeh: true, taps: 8 };

// ---------- 乱数 ----------
let seed = 20261123;
const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rr = (a, b) => a + (b - a) * rnd();
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const ease = (t) => { t = clamp(t); return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const randDir = () => { const u = rr(-1, 1), a = rr(0, Math.PI * 2), s = Math.sqrt(1 - u * u); return V(s * Math.cos(a), u, s * Math.sin(a)); };

// ---------- 場面の配置 ----------
// T=主役の位置 / A=カメラが止まる位置 / M=間の通り道
const T = [V(0, 0, -34), V(4.4, 1.4, -66), V(4, 4, -150), V(-6, 0, -220), V(0, 0, -290), V(8, 3, -350), V(0, 9, -432)];
const A = [V(0, 0.5, 0), V(7.3, 1.6, -52), V(3, 2.6, -127), V(-5.2, 0.9, -209.6), V(0, 1.2, -273), V(7.4, 3.9, -328), V(0, 8.6, -398)];
const M = [V(2.8, 1.3, -30), V(6, 1.6, -103), V(-3, 2.2, -182), V(-17, 3, -246), V(4, 2.2, -312), V(5, 7, -372)];
const camPts = []; for (let k = 0; k < 7; k++) { camPts.push(A[k]); if (k < 6) camPts.push(M[k]); }
const camCurve = new THREE.CatmullRomCurve3(camPts, false, 'catmullrom', 0.5);
const lineCurve = new THREE.CatmullRomCurve3([
  V(0, 0, -34), V(3, -0.4, -46), V(6, -0.95, -58), V(6, -0.95, -80), V(6, -0.95, -101), V(5, 0.6, -128), V(4, 1.6, -150),
  V(0, 0.8, -186), V(-2, -3.5, -204), V(-8, -2.5, -222), V(-6, 0, -226.5), V(-2, 0, -262), V(0, 0, -290), V(4, 1, -320), V(8, 2.4, -350),
  V(5, 5.2, -392), V(0, 9, -432), V(0, 12, -520), V(0, 15, -720)], false, 'catmullrom', 0.5);
const camSamples = camCurve.getSpacedPoints(500);
const distToPath = (p) => { let m = 1e9; for (const s of camSamples) { const d = s.distanceToSquared(p); if (d < m) m = d; } return Math.sqrt(m); };
const heroClear = [5, 12, 7, 17, 17, 11, 7];
const inHall = (p) => p.x > 0.5 && p.x < 11 && p.z < -54 && p.z > -108 && p.y > -4 && p.y < 7;
const nearHero = (p) => { if (inHall(p)) return true; for (let k = 0; k < 7; k++) if (p.distanceTo(T[k]) < heroClear[k]) return true; return false; };

// ---------- 描画の土台 ----------
const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
} catch (e) { root.classList.add('nogl'); document.getElementById('ld')?.remove(); throw e; }
let DPR = Math.min(devicePixelRatio || 1, Q.dpr);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const FOG = new THREE.Color(0x05080f);
scene.fog = new THREE.FogExp2(FOG, 0.0115);
const camera = new THREE.PerspectiveCamera(SP ? 62 : 46, innerWidth / innerHeight, 0.1, 1600);
camera.position.copy(A[0]);

const U = { time: { value: 0 } };

// 背景：星雲と遠い星（球の内側に描く）
{
  const g = new THREE.SphereGeometry(900, 48, 24);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: U.time },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 vD; uniform float uTime;
      float h(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
      float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }
      void main(){
        vec3 d=normalize(vD);
        float neb=fbm(d*2.2+vec3(0.,0.,uTime*.004));
        float neb2=fbm(d*4.5+vec3(3.1,1.7,0.));
        vec3 col=vec3(.006,.009,.018);
        col+=vec3(.03,.07,.13)*pow(neb,2.2)*1.6;
        col+=vec3(.12,.04,.02)*pow(neb2,4.)*smoothstep(.2,-.6,d.z)*1.2;
        col+=vec3(.05,.08,.12)*pow(1.-abs(d.y),6.)*.6;   // 天の川のような帯
        vec3 sp=d*420.; vec3 c=floor(sp); float st=h(c);
        if(st>.9965){ float tw=.6+.4*sin(uTime*1.5+st*90.); col+=vec3(.8,.85,1.)*smoothstep(.5,.0,length(fract(sp)-.5))*tw*1.8; }
        gl_FragColor=vec4(col,1.);
      }`
  });
  scene.add(new THREE.Mesh(g, m));
}

// 光
scene.add(new THREE.HemisphereLight(0x3d5683, 0x07070c, 0.9));
const key = new THREE.DirectionalLight(0xfff0e2, 2.6); key.position.set(-1, 1.3, 0.7); scene.add(key);
const rim = new THREE.DirectionalLight(0x79b4ff, 2.2); rim.position.set(0.6, 0.4, -1); scene.add(rim);
const sigLight = new THREE.PointLight(0xff5a24, 60, 26, 1.6); scene.add(sigLight);

// クロームを映すための映り込み（自作の小さな光の部屋）
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = (() => {
  const es = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: `varying vec3 v; void main(){ v=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec3 v; void main(){ vec3 c=mix(vec3(.01,.012,.02),vec3(.10,.14,.24),smoothstep(-.3,1.,v.y)); gl_FragColor=vec4(c,1.); }` }));
  es.add(sky);
  const strip = (w, h, col, pos, rotY) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.copy(pos); m.lookAt(0, 0, 0); es.add(m); };
  const W = new THREE.Color().setRGB(2.2, 2.2, 2.4), O = new THREE.Color().setRGB(3, .8, .3), B = new THREE.Color().setRGB(.5, .9, 1.8);
  strip(1.2, 30, W, V(-14, 4, 6)); strip(0.8, 30, W, V(14, 4, -2)); strip(20, 0.8, W, V(0, 16, 0)); strip(2, 18, O, V(8, 0, 14)); strip(18, 3, B, V(0, -10, -12));
  const t = pmrem.fromScene(es, 0.03).texture; return t;
})();

// ---------- 素材（Blender で作った glb） ----------
const loaderBar = document.querySelector('#ld i');
const gltf = await new Promise((res) => {
  new GLTFLoader().load('3d/b/assets_b.glb', res, (e) => { if (e.total) loaderBar.style.setProperty('--p', e.loaded / e.total); }, () => res(null));
});
const G = {};
if (gltf) gltf.scene.traverse((o) => { if (o.isMesh) G[o.name] = o.geometry; });
const geo = (n, fb) => G[n] || fb;

// ---------- シェーダの差し込み（回る破片・縁の光） ----------
const BUMP = `float rh(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float rn(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
 return mix(mix(mix(rh(i),rh(i+vec3(1,0,0)),f.x),mix(rh(i+vec3(0,1,0)),rh(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(rh(i+vec3(0,0,1)),rh(i+vec3(1,0,1)),f.x),mix(rh(i+vec3(0,1,1)),rh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float rfbm(vec3 p){ return rn(p)*.55+rn(p*2.1)*.27+rn(p*4.3)*.13+rn(p*8.7)*.05; }`;
const ROT = `attribute vec3 aAxis; attribute float aSpd; uniform float uTime;
mat3 rotAx(vec3 a,float t){ float s=sin(t),c=cos(t),oc=1.-c;
 return mat3(oc*a.x*a.x+c, oc*a.x*a.y+a.z*s, oc*a.z*a.x-a.y*s, oc*a.x*a.y-a.z*s, oc*a.y*a.y+c, oc*a.y*a.z+a.x*s, oc*a.z*a.x+a.y*s, oc*a.y*a.z-a.x*s, oc*a.z*a.z+c); }`;
function rockMaterial(rimCol, base) {
  const m = new THREE.MeshStandardMaterial({ color: base, roughness: 0.88, metalness: 0.08 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.time; sh.uniforms.uRim = { value: rimCol };
    sh.vertexShader = ROT + '\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = rotAx(aAxis,uTime*aSpd)*normal;')
      .replace('#include <begin_vertex>', 'vec3 transformed = rotAx(aAxis,uTime*aSpd)*position; vRP=position;');
    sh.vertexShader = 'varying vec3 vRP;\n' + sh.vertexShader;
    sh.fragmentShader = 'uniform vec3 uRim; varying vec3 vRP;\n' + BUMP + '\n' + sh.fragmentShader
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        float hg=rfbm(vRP*1.5); float hg2=rn(vRP*5.5)*.18;
        { vec3 dpx=dFdx(-vViewPosition), dpy=dFdy(-vViewPosition); float dhx=dFdx(hg+hg2), dhy=dFdy(hg+hg2);
          vec3 r1=cross(dpy,normal), r2=cross(normal,dpx); float det=dot(dpx,r1);
          vec3 gr=sign(det)*(dhx*r1+dhy*r2); normal=normalize(abs(det)*normal-gr*.55); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb*=mix(.45,1.15,smoothstep(.25,.75,rfbm(vRP*1.3+7.)));`)
      .replace('#include <opaque_fragment>',
      `{ float rr=pow(1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),2.6); outgoingLight+=uRim*rr; }
       #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'rock';
  return m;
}
function addRot(g, n, spdMax) {
  const ax = new Float32Array(n * 3), sp = new Float32Array(n);
  for (let i = 0; i < n; i++) { const d = randDir(); ax.set([d.x, d.y, d.z], i * 3); sp[i] = rr(-spdMax, spdMax); }
  g.setAttribute('aAxis', new THREE.InstancedBufferAttribute(ax, 3));
  g.setAttribute('aSpd', new THREE.InstancedBufferAttribute(sp, 1));
}

// ---------- ノイズの宇宙：岩・破片 ----------
const rockMat = rockMaterial(new THREE.Color(0.10, 0.17, 0.32), 0x4a4f5c);
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
    const g = rr(.55, 1.05); col.setRGB(g * rr(.9, 1), g * rr(.92, 1), g); mesh.setColorAt(i, col);
    i++;
  }
  mesh.count = i; mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
const rockMeshes = [];
for (let r = 0; r < 4; r++) {
  const g = geo('Rock' + r, new THREE.IcosahedronGeometry(1, 1)).clone(); const n = Math.round(Q.rocks / 4);
  addRot(g, n, 0.12);
  const m = new THREE.InstancedMesh(g, rockMat, n); scatter(m, n, 3.5, 46, 0.25, 3.4, 1.6, 3.2);
  m.frustumCulled = false; scene.add(m); rockMeshes.push(m);
}
{
  const g = new THREE.TetrahedronGeometry(0.16, 0); addRot(g, Q.shards, 0.9);
  const m = new THREE.InstancedMesh(g, rockMat, Q.shards); scatter(m, Q.shards, 2.4, 30, 0.3, 1.6, 1.2, 2.2);
  m.frustumCulled = false; scene.add(m);
}

// ---------- 漂う粒子（電波の粒） ----------
{
  const n = Q.dust, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), sz = new Float32Array(n), sd = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const u = rnd(), b = camCurve.getPoint(u).add(randDir().multiplyScalar(1.5 + Math.pow(rnd(), 1.4) * 60));
    pos.set([b.x, b.y, b.z], i * 3);
    const hot = rnd() < 0.035, cyan = rnd() < 0.25;
    const c = hot ? [1, .38, .14] : cyan ? [.55, .82, 1] : [.78, .82, .92];
    col.set(c, i * 3); sz[i] = hot ? rr(2.5, 5) : rr(0.8, 3.2); sd[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uScale: { value: innerHeight * 0.5 * DPR } },
    vertexShader: `attribute vec3 aCol; attribute float aSize; attribute float aSeed; uniform float uTime, uScale; varying vec3 vC; varying float vA;
      void main(){ vec3 p=position; p.x+=sin(uTime*.13+aSeed*40.)*.7; p.y+=cos(uTime*.11+aSeed*23.)*.7; p.z+=sin(uTime*.09+aSeed*11.)*.5;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv; float d=-mv.z;
        gl_PointSize=max(1.,aSize*uScale*.012/d*6.);
        vA=smoothstep(170.,25.,d)*smoothstep(.4,2.5,d)*(.55+.45*sin(uTime*(1.+aSeed*2.)+aSeed*60.)); vC=aCol; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); float a=smoothstep(.5,.0,r); a*=a; gl_FragColor=vec4(vC*a*vA*1.4,1.); }`
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; scene.add(pts); U.dustScale = m.uniforms.uScale;
}

// ---------- 1本の信号（朱の光の線） ----------
const sigU = { uTime: U.time, uHead: { value: 0.02 } };
{
  const g = new THREE.TubeGeometry(lineCurve, 1400, 0.028, 6, false);
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: sigU,
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `varying vec2 vUv; uniform float uTime, uHead;
      void main(){ float x=vUv.x;
        float p=pow(max(0.,sin(x*260.-uTime*5.)),24.)*1.6 + pow(max(0.,sin(x*41.-uTime*2.2)),40.)*3.;
        float vis=smoothstep(uHead+.05,uHead-.01,x);
        vec3 c=vec3(1.,.30,.10)*(2.2+p*2.5) + vec3(1.,.8,.6)*p*.8;
        gl_FragColor=vec4(c*vis,1.); }`
  });
  scene.add(new THREE.Mesh(g, m));
  // 光のにじみ（太い薄い管）
  const g2 = new THREE.TubeGeometry(lineCurve, 700, 0.22, 8, false);
  const m2 = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: sigU,
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalMatrix*normal; vV=-mv.xyz; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uHead, uTime;
      void main(){ float f=abs(dot(normalize(vN),normalize(vV))); float vis=smoothstep(uHead+.05,uHead-.01,vUv.x);
        gl_FragColor=vec4(vec3(1.,.28,.08)*pow(f,3.)*.22*vis,1.); }`
  });
  scene.add(new THREE.Mesh(g2, m2));
}
// 信号の頭の光
const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.12, 'rgba(255,190,150,.9)'); gr.addColorStop(.35, 'rgba(255,90,36,.28)'); gr.addColorStop(1, 'rgba(255,90,36,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const mkGlow = (s, c = 0xffffff, o = 1) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending })); sp.scale.setScalar(s); return sp; };
const head = mkGlow(3.2); scene.add(head);
const origin = mkGlow(5); origin.position.copy(lineCurve.getPoint(0)); scene.add(origin);

// ---------- 場面1：石膏の手とクロームの手が浮かぶ彫刻の間 ----------
const hands = [];
{
  const handG = geo('Hand', new THREE.CapsuleGeometry(0.25, 1, 4, 8));
  const pedG = geo('Pedestal', new THREE.BoxGeometry(0.6, 1.4, 0.6));
  const NOISE = `float dh(vec3 p){ return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453); }
    float dn(vec3 p){ vec3 i=floor(p),f=fract(p); f=f*f*(3.-2.*f);
      return mix(mix(mix(dh(i),dh(i+vec3(1,0,0)),f.x),mix(dh(i+vec3(0,1,0)),dh(i+vec3(1,1,0)),f.x),f.y),
                 mix(mix(dh(i+vec3(0,0,1)),dh(i+vec3(1,0,1)),f.x),mix(dh(i+vec3(0,1,1)),dh(i+vec3(1,1,1)),f.x),f.y),f.z); }
    float dfb(vec3 p){ return dn(p*4.)*.6+dn(p*9.)*.3+dn(p*21.)*.1; }`;
  const dissolve = (mat, u, chrome) => {
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uMix = u;
      sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP=position;');
      sh.fragmentShader = 'varying vec3 vOP; uniform float uMix;\n' + NOISE + '\n' + sh.fragmentShader
        .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          float dv=dfb(vOP+vec3(0.,1.,0.)); float th=uMix*1.25-.12+ (vOP.y*-.18);
          ${chrome ? 'if(dv>th) discard;' : 'if(dv<th) discard;'}`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += vec3(4.,1.1,.35)*smoothstep(.05,.0,abs(dv-th))*step(.001,uMix)*step(uMix,.999);`);
    };
    mat.customProgramCacheKey = () => chrome ? 'dchrome' : 'dplaster';
  };
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x8e8e8c, roughness: 0.8, metalness: 0, envMap: envTex, envMapIntensity: 0.2 });
  const group = new THREE.Group(); scene.add(group);
  const rows = SP ? 12 : 16;
  for (let side = -1; side <= -1; side += 2) for (let j = 0; j < rows; j++) {
    const x = 6 + side * 1.9, z = -58 - j * 2.9;
    const ped = new THREE.Mesh(pedG, pedMat); ped.position.set(x, -0.3, z); group.add(ped);
    const u = { value: 0 };
    const pl = new THREE.MeshStandardMaterial({ color: 0xcdc8be, roughness: 0.86, metalness: 0, envMap: envTex, envMapIntensity: 0.22, emissive: 0x000000 });
    const ch = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.12, metalness: 1, envMap: envTex, envMapIntensity: 0.75, emissive: 0x000000 });
    dissolve(pl, u, false); dissolve(ch, u, true);
    const h1 = new THREE.Mesh(handG, pl), h2 = new THREE.Mesh(handG, ch);
    const hg = new THREE.Group(); hg.add(h1, h2);
    hg.scale.setScalar(1.3); hg.position.set(x, 0.4 + 0.54 * 1.3, z); hg.rotation.set(0, 0.95, 0);
    group.add(hg);
    hands.push({ u, j, side, g: hg, ped, x, z, baseY: hg.position.y, ph: rnd() * 6 });
  }
}

// ---------- 場面2：無数に枝分かれする光の線の森 ----------
const forestU = { uTime: U.time, uGrow: { value: 0 } };
{
  const pos = [], ord = [], hi = [], tips = [], tipOrd = [];
  for (let t = 0; t < Q.trees; t++) {
    const u = rr(0.24, 0.42);
    const rootP = lineCurve.getPoint(u);
    const segs = [];
    const grow = (p, d, len, dep, o, h) => {
      const e = p.clone().add(d.clone().multiplyScalar(len));
      segs.push([p, e, o, o + len, h]);
      if (dep >= Q.depth) { tips.push(e); tipOrd.push(o + len); return; }
      const kids = rnd() < 0.28 ? 3 : 2;
      for (let c = 0; c < kids; c++) {
        const nd = d.clone().add(randDir().multiplyScalar(rr(0.45, 0.9))).normalize();
        grow(e, nd, len * rr(0.7, 0.86), dep + 1, o + len, h && c === 0);
      }
    };
    const up = t % 2 ? 1 : -1;
    const d0 = V(rr(-0.6, 0.6), up * rr(0.5, 1), rr(-0.6, 0.3)).normalize();
    const start = tips.length;
    grow(rootP, d0, rr(2.6, 4), 0, 0, t === 1);
    let mx = 0; for (const s of segs) mx = Math.max(mx, s[3]);
    for (let i = start; i < tipOrd.length; i++) tipOrd[i] /= mx;
    for (const s of segs) { pos.push(s[0].x, s[0].y, s[0].z, s[1].x, s[1].y, s[1].z); ord.push(s[2] / mx, s[3] / mx); hi.push(s[4] ? 1 : 0, s[4] ? 1 : 0); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOrd', new THREE.Float32BufferAttribute(ord, 1));
  g.setAttribute('aHi', new THREE.Float32BufferAttribute(hi, 1));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: forestU,
    vertexShader: `attribute float aOrd; attribute float aHi; varying float vO; varying float vH; varying float vD;
      void main(){ vO=aOrd; vH=aHi; vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vO; varying float vH; varying float vD; uniform float uGrow, uTime;
      void main(){ if(vO>uGrow) discard;
        float tip=smoothstep(uGrow-.12,uGrow,vO);
        float pulse=pow(max(0.,sin(vO*34.-uTime*3.)),18.);
        vec3 c=mix(vec3(.42,.75,1.),vec3(1.,.32,.1),vH);
        float a=(.42+.6*(1.-vO))*(1.+tip*2.5+pulse*1.8)*(.6+vH*1.6)*smoothstep(90.,6.,vD);
        gl_FragColor=vec4(c*a,1.); }`
  });
  const ls = new THREE.LineSegments(g, m); ls.frustumCulled = false; scene.add(ls);
  const tg = new THREE.BufferGeometry(); const tp = new Float32Array(tips.length * 3); tips.forEach((p, i) => tp.set([p.x, p.y, p.z], i * 3));
  tg.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tg.setAttribute('aOrd', new THREE.Float32BufferAttribute(tipOrd, 1));
  const tm = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...forestU, uScale: U.dustScale },
    vertexShader: `attribute float aOrd; uniform float uGrow, uScale; varying float vA; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv;
      vA=smoothstep(uGrow-.02,uGrow-.1,aOrd)*smoothstep(90.,6.,-mv.z); gl_PointSize=max(1.,uScale*.09/-mv.z*3.); }`,
    fragmentShader: `varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vec3(.7,.9,1.)*smoothstep(.5,0.,r)*vA*1.5,1.); }`
  });
  const tpt = new THREE.Points(tg, tm); tpt.frustumCulled = false; scene.add(tpt);
}

// ---------- 場面3：砂嵐のモニターが漂う宇宙 ----------
const tvs = { list: [], body: null, screen: null };
{
  const bodyG = geo('TV', new THREE.BoxGeometry(1.2, 0.9, 1)).clone();
  const scrG = geo('Screen', new THREE.PlaneGeometry(0.98, 0.7).translate(0, 0, 0.5)).clone();
  const n = Q.tvs;
  const sd = new Float32Array(n), spc = new Float32Array(n);
  for (let i = 0; i < n; i++) { sd[i] = rnd(); spc[i] = i === 0 ? 1 : 0; }
  scrG.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
  scrG.setAttribute('aSp', new THREE.InstancedBufferAttribute(spc, 1));
  const bodyM = new THREE.MeshStandardMaterial({ color: 0x23252b, roughness: 0.45, metalness: 0.2, envMap: envTex, envMapIntensity: 0.7 });
  const scrM = new THREE.ShaderMaterial({
    uniforms: { uTime: U.time, uOn: { value: 0 } },
    vertexShader: `attribute float aSeed; attribute float aSp; varying vec2 vUv; varying float vS; varying float vP; varying float vD;
      void main(){ vUv=uv; vS=aSeed; vP=aSp; vec4 mv=modelViewMatrix*instanceMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying float vS; varying float vP; varying float vD; uniform float uTime, uOn;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){
        vec2 uv=vUv; float t=floor(uTime*20.+vS*7.);
        float n=h(floor(uv*vec2(150.,110.))+t*1.37+vS*91.);
        float roll=smoothstep(.0,.04,abs(fract(uv.y*1.-uTime*.25-vS)-.5));
        vec3 c=vec3(n*.9+.05)*(.75+.25*sin(uv.y*520.))*(.82+.18*roll);
        c*=vec3(.82,.9,1.);
        if(vP>.5){ float y=uv.y-.5-.03*sin(uv.x*14.+uTime*2.2)*smoothstep(.0,.5,uv.x)*smoothstep(1.,.5,uv.x);
          float l=exp(-pow(y*70.,2.))*2.6+exp(-pow(y*14.,2.))*.5;
          c=mix(c*.18,vec3(1.,.35,.12)*l*3.+c*.05,uOn); }
        float vg=smoothstep(.75,.35,length((uv-.5)*vec2(1.,1.25)));
        float far=smoothstep(110.,20.,vD);
        float lum=vP>.5?1.:.42; gl_FragColor=vec4(c*vg*(.35+.65*uOn)*lum*far,1.);
      }`
  });
  const body = new THREE.InstancedMesh(bodyG, bodyM, n), scr = new THREE.InstancedMesh(scrG, scrM, n);
  body.frustumCulled = scr.frustumCulled = false;
  let i = 0, tries = 0;
  while (i < n && tries < 5000) {
    tries++;
    let p, s, rot;
    if (i === 0) { p = T[3].clone(); s = 2.3; rot = new THREE.Euler(0, 0, 0); }
    else {
      p = T[3].clone().add(V(rr(-24, 24), rr(-11, 11), rr(-22, 16)));
      if (distToPath(p) < 3.2 || p.distanceTo(T[3]) < 3.4) continue;
      s = rr(1.1, 2.2); rot = new THREE.Euler(rr(-.35, .35), rr(-.6, .6), rr(-.3, .3));
    }
    tvs.list.push({ p, s, q: new THREE.Quaternion().setFromEuler(rot), ax: randDir(), sp: i === 0 ? 0 : rr(-.08, .08), ph: rnd() * 6 });
    i++;
  }
  body.count = scr.count = i;
  tvs.body = body; tvs.screen = scr; tvs.scrU = scrM.uniforms;
  scene.add(body, scr);
}
const tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3();
function updateTVs(t) {
  tvs.list.forEach((v, i) => {
    tmpQ.setFromAxisAngle(v.ax, Math.sin(t * 0.3 + v.ph) * 0.12 + t * v.sp).premultiply(v.q);
    const p = v.p.clone(); p.y += Math.sin(t * 0.4 + v.ph) * (i ? 0.25 : 0.06);
    tmpM.compose(p, tmpQ, tmpS.setScalar(v.s));
    tvs.body.setMatrixAt(i, tmpM); tvs.screen.setMatrixAt(i, tmpM);
  });
  tvs.body.instanceMatrix.needsUpdate = tvs.screen.instanceMatrix.needsUpdate = true;
}
updateTVs(0);

// ---------- 場面4：ノイズの粒子が1点に収束して Signal が立ち上がる ----------
const convU = { uTime: U.time, uConv: { value: 0 }, uC: { value: T[4] }, uScale: U.dustScale };
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
    vertexShader: `attribute vec3 aJit; attribute float aDel; uniform float uTime, uConv, uScale; uniform vec3 uC; varying vec3 vC; varying float vA;
      void main(){
        float k=clamp(uConv*1.45-aDel*.45,0.,1.); k=k*k*(3.-2.*k);
        vec3 rel=position-uC;
        float ang=uTime*.06+k*k*(2.5+aDel*3.);
        float s=sin(ang), c=cos(ang); rel.xz=mat2(c,-s,s,c)*rel.xz;
        vec3 jitter=vec3(sin(uTime*7.+aDel*90.),cos(uTime*6.+aDel*70.),sin(uTime*8.+aDel*30.))*.12*(1.-k);
        vec3 p=uC+mix(rel+jitter*8.,aJit,k);
        float rise=smoothstep(.82,1.,uConv); p.y+=rise*pow(aDel,3.)*16.*k; p.xz*=1.;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uScale*(.05+.03*(1.-k))/-mv.z*3.);
        vC=mix(vec3(.62,.68,.8),vec3(1.,.36,.12),k); vA=(.45+.55*k)*smoothstep(120.,4.,-mv.z); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }`
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
}
const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 12, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vUv; uniform float uA; void main(){ gl_FragColor=vec4(vec3(1.,.42,.18)*4.*uA*smoothstep(1.,.0,vUv.y),1.); }`
}));
beam.position.copy(T[4]); beam.scale.set(1, 0.001, 1); scene.add(beam);
const core = mkGlow(1, 0xffffff, 1); core.position.copy(T[4]); scene.add(core);

// ---------- 場面5：ゼロサムとプラスサム ----------
const s5 = {};
{
  const orbM = new THREE.MeshStandardMaterial({ color: 0xbfc6d4, roughness: 0.15, metalness: 1, envMap: envTex, envMapIntensity: 1.3 });
  const L = new THREE.Group(); L.position.copy(T[5]).add(V(-4.8, 0.3, 0)); L.scale.setScalar(1.35); scene.add(L);
  const beamL = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 6, 8).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa2b2, metalness: 1, roughness: .3, envMap: envTex }));
  const pivot = new THREE.Group(); pivot.add(beamL); L.add(pivot);
  const a = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), orbM), b = a.clone(); a.position.x = -3; b.position.x = 3; pivot.add(a, b);
  const fulcrum = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 3), new THREE.MeshStandardMaterial({ color: 0x8a909c, metalness: .8, roughness: .35, envMap: envTex }));
  fulcrum.position.y = -0.4; L.add(fulcrum);
  const R = new THREE.Group(); R.position.copy(T[5]).add(V(4.8, 0, 0)); scene.add(R);
  const orbs = [], n = 18, rad = 2.8;
  const hot = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .2, metalness: .3, emissive: 0xff5a24, emissiveIntensity: 0, envMap: envTex });
  for (let i = 0; i < n; i++) { const o = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), hot); const ang = i / n * Math.PI * 2; o.position.set(Math.cos(ang) * rad, Math.sin(ang) * rad, 0); R.add(o); orbs.push(o); }
  const lp = []; for (let i = 0; i < n; i++) { const p = orbs[i].position, q = orbs[(i + 1) % n].position; lp.push(p.x, p.y, 0, q.x, q.y, 0, p.x, p.y, 0, 0, 0, 0); }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const lm = new THREE.LineBasicMaterial({ color: 0xff7a4a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  R.add(new THREE.LineSegments(lg, lm));
  const center = mkGlow(1, 0xffffff, 1); R.add(center);
  Object.assign(s5, { pivot, a, b, orbs, hot, lm, center, R, L });
}

// ---------- 場面6：長期的な全体最適へ（輪と遠い光） ----------
const rings = [];
{
  for (let i = 0; i < 4; i++) {
    const r = 9 + i * 4.2;
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, i === 0 ? 0.06 : 0.025, 8, 220), new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(i === 0 ? 3 : 0.9, i === 0 ? 1.0 : 1.1, i === 0 ? 0.35 : 1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.copy(T[6]); m.rotation.set(rr(-.25, .25) + (i ? 0.5 * (i % 2 ? 1 : -1) : 0), rr(-.3, .3), 0); scene.add(m); rings.push(m);
  }
}
const farStar = mkGlow(60, 0xffd2b8, 1); farStar.position.copy(lineCurve.getPoint(1)); scene.add(farStar);

// ---------- 仕上げ（ポストエフェクト） ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(DPR); composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
let bokeh = null;
if (Q.bokeh) { bokeh = new BokehPass(scene, camera, { focus: 20, aperture: 0.00022, maxblur: 0.0045 }); composer.addPass(bokeh); }
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.78); composer.addPass(bloom);
composer.addPass(new OutputPass());
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uCA: { value: 0.003 }, uWarp: { value: 0 }, uGrain: { value: 0.055 }, uVig: { value: 0.55 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uFade: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `#define TAPS ${Q.taps}
    uniform sampler2D tDiffuse; uniform float uTime, uCA, uWarp, uGrain, uVig, uFade; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    void main(){
      vec2 d=vUv-.5; float r=length(d*vec2(uRes.x/uRes.y,1.))/.9;
      vec3 c=vec3(0.);
      for(int i=0;i<TAPS;i++){ float t=float(i)/float(TAPS); float s=1.-uWarp*t*.06*r; float ca=uCA*(.4+r);
        c.r+=texture2D(tDiffuse,.5+d*(s+ca)).r; c.g+=texture2D(tDiffuse,.5+d*s).g; c.b+=texture2D(tDiffuse,.5+d*(s-ca)).b; }
      c/=float(TAPS);
      c*=1.-uVig*pow(clamp(r,0.,1.4),2.4);
      c+=(h(vUv*uRes+fract(uTime*7.)*91.)-.5)*uGrain;
      c=mix(c,vec3(0.),uFade);
      gl_FragColor=vec4(c,1.);
    }`
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
const fvx = document.getElementById('fvx');
const fvChars = splitChars(fvx); fvChars.forEach((c) => c.classList.add('on'));
function reveal(p) {
  p.shown = true; const cs = p.chars; const N = cs.length; const t0 = performance.now(); const dur = Math.min(1400, 380 + N * 6);
  cancelAnimationFrame(p.timer);
  const step = () => {
    const e = performance.now() - t0;
    for (let i = 0; i < N; i++) {
      const at = (i / N) * dur * 0.8, c = cs[i];
      if (e >= at + 140) { if (c.textContent !== c.dataset.ch) c.textContent = c.dataset.ch; c.classList.add('on'); }
      else if (e >= at) { c.classList.add('on'); if (/\S/.test(c.dataset.ch)) c.textContent = GL[(Math.random() * GL.length) | 0]; }
    }
    if (e < dur + 160) p.timer = requestAnimationFrame(step);
  };
  if (RM) cs.forEach((c) => c.classList.add('on')); else step();
}
function hide(p) { p.shown = false; cancelAnimationFrame(p.timer); p.chars.forEach((c) => { c.classList.remove('on'); c.textContent = c.dataset.ch; }); }

// HUD
const tag = document.getElementById('tag'), ll = document.getElementById('ll'), lc = document.getElementById('lc');
const pn = document.getElementById('pn'), pb = document.getElementById('pb'), gauge = document.getElementById('gauge'), tk = document.getElementById('tk'), pc = document.getElementById('pc');
const hint = document.getElementById('hint');
let tagScene = -1, tagT0 = 0;

// ---------- スクロールとカメラ ----------
const SCN = 7;
let P = 0, Ps = 0, vel = 0, lastPs = 0;
const readScroll = () => { const max = document.documentElement.scrollHeight - innerHeight; P = max > 0 ? (scrollY / max) * (SCN - 0.08) : 0; };
addEventListener('scroll', readScroll, { passive: true }); readScroll(); Ps = P;
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
const sideOf = [0, 1, -1, 1, -1, -1, -1];   // 文字が左(-1)なら主役を右へ
let viewShift = 0;

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h; camera.fov = w < 820 ? 62 : 46; camera.updateProjectionMatrix();
  renderer.setSize(w, h, false); composer.setPixelRatio(DPR); composer.setSize(w, h);
  finalPass.uniforms.uRes.value.set(w, h); U.dustScale.value = h * 0.5 * DPR;
}
addEventListener('resize', onResize);

const clock = new THREE.Clock();
let frames = 0, acc = 0, adapted = false;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.05); const t = clock.elapsedTime;
  U.time.value = t;
  Ps += (P - Ps) * (1 - Math.pow(0.0009, dt));
  vel = (Ps - lastPs) / Math.max(dt, 1e-3); lastPs = Ps;
  const k = Math.min(6, Math.floor(Ps)), x = Ps - k;

  // カメラ
  const s = camS(Ps); const sf = s - Math.floor(s); const travel = Math.sin(Math.PI * clamp(sf)) * (s < 6 ? 1 : 0);
  const pos = camCurve.getPoint(s / 6);
  const drift = Math.sin(Math.PI * clamp((x - 0.05) / 0.95)) * 1.4;
  const tgtA = T[Math.floor(s)], tgtB = T[Math.min(6, Math.ceil(s))];
  look.copy(tgtA).lerp(tgtB, ease(sf));
  pos.add(tmpV.copy(T[k]).sub(pos).normalize().multiplyScalar(drift));
  const tan = camCurve.getTangent(clamp(s / 6, 0, 1));
  look.lerp(tmpV.copy(pos).add(tan.multiplyScalar(20)), travel * 0.65);
  mouse.sx += (mouse.x - mouse.sx) * 0.04; mouse.sy += (mouse.y - mouse.sy) * 0.04;
  camera.position.copy(pos).add(tmpV.set(mouse.sx * 0.9, -mouse.sy * 0.6, 0));
  lookS.lerp(look, 0.12);
  camera.lookAt(lookS);
  camera.rotateZ(Math.sin(t * 0.21) * 0.012 + travel * 0.05 * Math.sign(vel || 1));
  // 主役を文字の反対側へずらす
  const sideT = (innerWidth < 820) ? 0 : sideOf[k] * (1 - travel) * sstep(0.1, 0.4, x);
  viewShift += (sideT - viewShift) * 0.06;
  if (innerWidth < 820) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * [0, .12, -.04, .12, .1, .1, .12][k] * (1 - travel), innerWidth, innerHeight);
  else camera.setViewOffset(innerWidth, innerHeight, viewShift * innerWidth * 0.15, 0, innerWidth, innerHeight);

  // 信号の頭・光
  const lineU = clamp(0.012 + Ps / 6.6 * 0.86);
  sigU.uHead.value += (Math.max(lineU, 0.06) - sigU.uHead.value) * 0.05;
  head.position.copy(lineCurve.getPoint(clamp(sigU.uHead.value)));
  head.scale.setScalar(2.6 + Math.sin(t * 3) * 0.4);
  origin.scale.setScalar(4 + Math.sin(t * 2.2) * 0.8);
  sigLight.position.copy(lineCurve.getPoint(clamp(sigU.uHead.value - 0.01)));

  // 場面1：手の置き換え
  const l1 = Ps - 1;
  hands.forEach((h) => {
    const jj = hands.length - 1 - h.j; const target = sstep(0.05 + jj * 0.032, 0.2 + jj * 0.032, l1);
    h.u.value += (target - h.u.value) * 0.08;
    h.g.position.y = h.baseY + Math.sin(t * 0.5 + h.ph) * 0.05;
  });
  // 場面2：枝が伸びる
  forestU.uGrow.value = sstep(-0.45, 0.62, Ps - 2) * 1.02;
  // 場面3：テレビ
  if (Math.abs(Ps - 3) < 1.6) updateTVs(t);
  tvs.scrU.uOn.value = 0.25 + 0.75 * sstep(-0.4, 0.3, Ps - 3);
  // 場面4：収束
  const conv = sstep(0.05, 0.72, Ps - 4); convU.uConv.value = conv;
  const rise = sstep(0.72, 0.95, Ps - 4) + (Ps > 5 ? 0 : 0);
  beam.scale.y = 0.001 + rise * 60; beam.material.uniforms.uA.value = rise;
  core.scale.setScalar(0.5 + conv * 5 + Math.sin(t * 8) * 0.2 * conv); core.material.opacity = conv;
  const gv = Math.abs(Ps - 4.5) < 0.5 ? 1 : 0; gauge.style.opacity = gv;
  if (gv) { const pct = Math.round(conv * 100); pc.textContent = String(pct).padStart(3, '0'); tk.style.left = pct * 1.4 * (innerWidth < 820 ? 80 / 140 : 1) + 'px'; }
  // 場面5
  const l5 = sstep(0.05, 0.7, Ps - 5);
  const sw = Math.sin(t * 0.8);
  s5.pivot.rotation.z = sw * 0.32; s5.a.scale.setScalar(0.35 + 0.28 * (1 + sw) * 0.5 + 0.15); s5.b.scale.setScalar(0.35 + 0.28 * (1 - sw) * 0.5 + 0.15);
  s5.orbs.forEach((o, i) => o.scale.setScalar(0.12 + l5 * 0.26 + Math.sin(t * 2 + i) * 0.015));
  s5.hot.emissiveIntensity = l5 * 1.1; s5.lm.opacity = l5 * 0.8; s5.center.scale.setScalar(0.2 + l5 * 3.2); s5.R.rotation.z = t * 0.08;
  // 場面6
  const l6 = sstep(-0.3, 0.5, Ps - 6);
  rings.forEach((r, i) => { r.material.opacity = l6 * (i ? 0.55 : 1); r.rotation.z = t * (0.03 + i * 0.01) * (i % 2 ? -1 : 1); });

  // 文字
  fvx.style.opacity = 1 - sstep(0.45, 0.7, Ps);
  fvx.style.transform = `translateY(${-sstep(0.4, 0.75, Ps) * 40}px)`;
  hint.style.opacity = 1 - sstep(0.05, 0.25, Ps);
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
  const tagOn = k >= 1 && x > 0.3 && x < 0.86 && innerWidth >= 820;
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

  // 仕上げ
  if (bokeh) bokeh.uniforms.focus.value = camera.position.distanceTo(T[k]) * (1 - travel) + 14 * travel;
  finalPass.uniforms.uTime.value = t;
  finalPass.uniforms.uCA.value = RM ? 0.001 : 0.0025 + Math.min(Math.abs(vel) * 0.012, 0.018) + travel * 0.006;
  finalPass.uniforms.uWarp.value = RM ? 0 : travel * 1.2 + Math.min(Math.abs(vel) * 0.8, 1.2);
  bloom.strength = 0.85 + travel * 0.35;
  composer.render(dt);

  // 遅い端末では解像度を下げる
  if (!adapted) { frames++; acc += dt; if (frames === 120) { adapted = true; if (acc / frames > 1 / 40) { DPR = 1; if (bokeh) { bokeh.enabled = false; } onResize(); } } }
  requestAnimationFrame(frame);
}
onResize();
requestAnimationFrame(frame);
setTimeout(() => document.getElementById('ld').classList.add('out'), 300);
window.__b = { get P() { return Ps; }, setP(v) { P = v; Ps = v; lastPs = v; }, renderer };
