// 試作A「信号の結晶」 — three.js 本体と公式 addons だけを使い、シェーダはすべて自作
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const $ = (s) => document.querySelector(s);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const Q = new URLSearchParams(location.search);
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

function isNarrow() { return innerWidth < 760; }
let tier = (isNarrow() || matchMedia('(pointer:coarse)').matches) ? 'low' : 'high';
if (Q.get('q')) tier = Q.get('q');
const TIERS = {
  high: { dpr: Math.min(devicePixelRatio, 1.75), text: 24000, stars: 9000, noise: 34000, dust: 4000, bloom: true },
  low:  { dpr: Math.min(devicePixelRatio, 1.25), text: 9000,  stars: 3500, noise: 11000, dust: 1500, bloom: true },
  lite: { dpr: 1, text: 6000, stars: 2500, noise: 6000, dust: 800, bloom: false },
};
let T = TIERS[tier] || TIERS.high;

// ---------- 読み込みの表示 ----------
const ld = { bar: $('#ldbar'), pc: $('#ldpc'), el: $('#loader'), v: 0 };
function setLoad(v) {
  ld.v = Math.max(ld.v, v);
  const n = 10, s = [];
  for (let i = 0; i < n; i++) { const k = ld.v * n - i; s.push(k > 0.9 ? '+' : k > 0.45 ? '=' : '-'); }
  ld.bar.textContent = s.join('');
  ld.pc.textContent = String(Math.round(ld.v * 100)).padStart(3, '0');
}
function fail() { document.documentElement.classList.add('nogl'); ld.el.classList.add('done'); }

// ---------- 文字のスクランブル（等幅の表示と本文） ----------
const POOL_L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/_-+=<>#';
const POOL_J = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン';
const scrs = new Map();
function scr(el, dur) {
  let s = scrs.get(el);
  if (!s) {
    const nodes = []; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) nodes.push({ n: w.currentNode, o: w.currentNode.nodeValue });
    s = { nodes, len: nodes.reduce((a, b) => a + b.o.length, 0), t0: -1, dur: 0 };
    scrs.set(el, s);
  }
  if (reduced) return;
  s.dur = dur || Math.min(1500, 320 + s.len * 9);
  s.t0 = performance.now();
}
function setText(el, txt) { scrs.delete(el); el.textContent = txt; scr(el, 600); }
function tickScr(now) {
  for (const s of scrs.values()) {
    if (s.t0 < 0) continue;
    const t = (now - s.t0) / s.dur;
    let idx = 0;
    for (const nd of s.nodes) {
      if (t >= 1.15) { nd.n.nodeValue = nd.o; idx += nd.o.length; continue; }
      let out = '';
      for (let i = 0; i < nd.o.length; i++, idx++) {
        const ch = nd.o[i];
        const rv = (idx / Math.max(1, s.len)) * 0.85 + 0.12;
        if (t >= rv || /[\s、。・「」“”（）,.]/.test(ch)) out += ch;
        else if (t < rv - 0.5) out += ch.charCodeAt(0) > 0x2e80 ? '　' : ' ';
        else { const cj = ch.charCodeAt(0) > 0x2e80; const p = cj ? POOL_J : POOL_L; out += p[(Math.random() * p.length) | 0]; }
      }
      nd.n.nodeValue = out;
    }
    if (t >= 1.15) s.t0 = -1;
  }
}

// ---------- 本体 ----------
async function main() {
  const canvas = $('#gl');
  if (document.documentElement.classList.contains('nogl')) { fail(); return; }
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false });
  } catch (e) { fail(); return; }
  setLoad(0.05);
  renderer.setPixelRatio(T.dpr);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03050c, 0.03);
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 900);
  camera.position.set(0, 0, 14);

  // 映り込み用の環境（暗い部屋に細長い光の帯を数本）
  {
    const s = new THREE.Scene();
    s.background = new THREE.Color(0x020308);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const add = (c, k, p, sc) => { const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k) })); m.position.set(...p); m.scale.set(...sc); s.add(m); };
    add(0xffffff, 3.5, [0, 9, -2], [14, 0.4, 1.6]);
    add(0xc8efff, 2.2, [-10, 1, -2], [0.4, 9, 3]);
    add(0xffffff, 2.6, [10, 3, 5], [0.4, 6, 1.0]);
    add(0xef4519, 1.4, [0, -7, -9], [10, 0.4, 0.6]);
    add(0x7f8cff, 1.6, [6, -2, -11], [7, 3, 0.4]);
    add(0xffffff, 3, [-4, 4, 10], [5, 0.3, 0.3]);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(s, 0.015).texture;
    pm.dispose();
  }

  // ---------- 星雲（背景の球） ----------
  const neb = new THREE.Mesh(new THREE.SphereGeometry(420, 48, 32), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: 0 } },
    vertexShader: `varying vec3 vD; void main(){ vD=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position=p.xyww; }`,
    fragmentShader: `uniform float uT; varying vec3 vD;
      float h(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float n(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*n(p);p*=2.03;a*=.5;}return s;}
      void main(){ vec3 d=normalize(vD);
        float f=fbm(d*2.1+vec3(0.,0.,uT*.004)); float g=fbm(d*4.7+f*1.7);
        vec3 c=vec3(.003,.005,.013);
        c+=vec3(.020,.032,.085)*smoothstep(.42,.86,f);
        c+=vec3(.045,.030,.090)*smoothstep(.56,.95,g)*.9;
        float band=exp(-pow(d.y*2.6+(f-.5)*1.4,2.)*2.);
        c+=vec3(.022,.03,.06)*band;
        c+=vec3(.16,.04,.01)*pow(max(0.,dot(d,normalize(vec3(.35,-.12,-1.)))),22.)*.7;
        gl_FragColor=vec4(c,1.); }`,
  }));
  neb.renderOrder = -10;
  scene.add(neb);

  // ---------- 星（3層・ぼけ付き） ----------
  const ptScale = () => (innerHeight * T.dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
  const starMat = new THREE.ShaderMaterial({
    transparent: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uS: { value: ptScale() } },
    vertexShader: `attribute float aS; attribute float aP; attribute vec3 aC; uniform float uT,uS; varying float vA; varying vec3 vC; varying float vB;
      void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); float d=-mv.z;
        float tw=.6+.4*sin(uT*(.7+aP*2.3)+aP*50.);
        float near=1.-smoothstep(2.5,12.,d);
        gl_PointSize=clamp(aS*uS/d*(1.+near*3.),1.,90.);
        vA=tw*smoothstep(.6,3.,d)*(1.-smoothstep(150.,260.,d))*(1.-near*.75);
        vB=near; vC=aC; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC; varying float vB;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c);
        float core=smoothstep(.5,0.,d); core*=core; float ring=smoothstep(.5,.42,d)*smoothstep(.3,.45,d);
        float a=mix(core+smoothstep(.1,0.,d), core*.5+ring*.35, vB);
        gl_FragColor=vec4(vC*a*vA,1.); }`,
  });
  function makeStars(n) {
    const p = new Float32Array(n * 3), s = new Float32Array(n), ph = new Float32Array(n), c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const layer = Math.random();
      const r = layer < 0.12 ? 1.5 + Math.random() * 6 : 7 + Math.pow(Math.random(), 0.7) * 80;
      const a = Math.random() * Math.PI * 2;
      p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = Math.sin(a) * r * 0.75; p[i * 3 + 2] = 30 - Math.random() * 200;
      s[i] = layer < 0.12 ? 0.02 + Math.random() * 0.03 : 0.04 + Math.pow(Math.random(), 3) * 0.22;
      ph[i] = Math.random();
      const w = Math.random(); const k = 0.5 + Math.random() * 1.3;
      const col = w < 0.06 ? [1.0, 0.55, 0.35] : w < 0.3 ? [0.75, 0.88, 1.0] : [0.92, 0.95, 1.0];
      c[i * 3] = col[0] * k; c[i * 3 + 1] = col[1] * k; c[i * 3 + 2] = col[2] * k;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
    g.setAttribute('aP', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aC', new THREE.BufferAttribute(c, 3));
    const pts = new THREE.Points(g, starMat); pts.frustumCulled = false; return pts;
  }
  scene.add(makeStars(T.stars));
  setLoad(0.15);

  // ---------- 形（Blender で作った glb） ----------
  let geo = {};
  try {
    const gltf = await new GLTFLoader().loadAsync('3d/a/crystals.glb', (e) => { if (e.total) setLoad(0.15 + 0.45 * e.loaded / e.total); });
    gltf.scene.traverse((o) => { if (o.isMesh) geo[o.name] = { g: o.geometry, p: o.position.clone() }; });
  } catch (e) { console.warn('glb', e); }
  const fb = () => { const g = new THREE.OctahedronGeometry(0.6, 0); g.scale(1, 2.4, 1); return g; };
  for (const k of ['hero', 'c0', 'c1', 'c2', 'c3', 'c4', 'c5']) {
    if (geo[k]) geo[k].g.rotateX(-Math.PI / 2); else geo[k] = { g: fb(), p: new THREE.Vector3() };
  }
  if (geo.prism) geo.prism.g.rotateX(Math.PI / 2); else geo.prism = { g: new THREE.CylinderGeometry(0.6, 0.6, 2.2, 3).rotateX(Math.PI / 2), p: new THREE.Vector3() };
  setLoad(0.65);

  const glass = (o = {}) => new THREE.MeshPhysicalMaterial(Object.assign({
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 1.6, ior: 1.62, dispersion: 5,
    attenuationColor: new THREE.Color(0xb9e2ff), attenuationDistance: 3.2, envMapIntensity: 3.0,
    specularIntensity: 1, clearcoat: 0.5, clearcoatRoughness: 0.04, iridescence: 0.2, iridescenceIOR: 1.25,
  }, o));
  const rim = (m, col, k) => {
    m.userData.rim = { value: new THREE.Color(col).multiplyScalar(k) };
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uRim = m.userData.rim;
      sh.fragmentShader = 'uniform vec3 uRim;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n float frs = 1.0 - abs(dot(normalize(normal), normalize(-vViewPosition)));\n totalEmissiveRadiance += uRim * pow(frs, 2.6);');
    };
    m.customProgramCacheKey = () => 'rim';
    return m;
  };

  // ---------- 灯り ----------
  scene.add(new THREE.HemisphereLight(0x9fb6ff, 0x05070f, 0.35));
  const key = new THREE.DirectionalLight(0xdfe8ff, 1.4); key.position.set(-3, 6, 4); scene.add(key);

  // ================= FV：文字の粒と主結晶 =================
  const G0 = new THREE.Group(); G0.userData.r = [-22, 99]; scene.add(G0);
  const hero = new THREE.Mesh(geo.hero.g, rim(glass({ side: THREE.DoubleSide, thickness: 2.4, dispersion: 7 }), 0xc8efff, 0.35));
  hero.position.set(0, 0, -9); hero.scale.setScalar(2.5); hero.rotation.set(0.2, 0.4, 0.5);
  G0.add(hero);
  const heroGlow = new THREE.PointLight(0xc8efff, 0, 12, 1.5); heroGlow.position.set(0, 0, -9); G0.add(heroGlow);

  const textMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uForm: { value: reduced ? 1 : 0 }, uScatter: { value: 0 }, uS: { value: ptScale() }, uM: { value: new THREE.Vector3(99, 99, 0) }, uB: { value: 1 } },
    vertexShader: `attribute vec3 aStart; attribute vec4 aR; attribute float aDot;
      uniform float uT,uForm,uScatter,uS,uB; uniform vec3 uM; varying float vA; varying float vDot;
      void main(){
        float st=aR.x*.5; float f=smoothstep(st,st+.5,uForm);
        vec3 p=mix(aStart,position,f);
        float an=(1.-f)*(2.5+aR.y*3.);
        p.xy=mat2(cos(an),-sin(an),sin(an),cos(an))*p.xy;
        p+=vec3(sin(uT*.8+aR.y*31.),cos(uT*1.05+aR.z*29.),sin(uT*.6+aR.w*27.))*.014*f;
        vec2 dm=p.xy-uM.xy; float dl=length(dm);
        float push=exp(-dl*dl*2.4)*f*(1.-uScatter);
        p.xy+=dm/(dl+1e-3)*.5*push; p.z+=.6*push;
        float s=uScatter;
        vec3 dir=normalize(vec3(position.xy*.22,0.)+(aR.xyz-.5)*vec3(2.,2.,1.));
        p+=dir*s*s*(3.+aR.w*20.)+vec3(0.,0.,s*(1.5+aR.w*13.));
        vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z;
        gl_PointSize=clamp((aDot>.5?2.4:1.)*(.03+aR.w*.03)*uS/d*(1.+s*2.),1.,40.);
        vA=(.25+.75*f)*(1.-smoothstep(.7,1.,s))*smoothstep(1.2,4.5,d)*uB*(1.+push*1.5)/(1.+s*2.5);
        vDot=aDot; gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; varying float vDot;
      void main(){ vec2 c=gl_PointCoord-.5; float d=length(c); float a=smoothstep(.5,.0,d); a*=a;
        vec3 col=mix(vec3(.62,.74,1.)*.9, vec3(3.2,.62,.16), vDot);
        gl_FragColor=vec4(col*a*vA,1.); }`,
  });
  let textPts = null, textLayout = '';
  async function buildText() {
    const narrow = isNarrow();
    const lay = narrow ? 'sp' : 'pc';
    if (lay === textLayout) return; textLayout = lay;
    const lines = narrow ? ['find', 'the', 'signal.'] : ['find the signal.'];
    try { await document.fonts.load('300 200px "Bricolage Grotesque"'); } catch (e) {}
    const fs = 220, lh = fs * 0.98, pad = 30;
    const c = document.createElement('canvas'); const g = c.getContext('2d', { willReadFrequently: true });
    const font = `300 ${fs}px "Bricolage Grotesque", "Inter Tight", sans-serif`;
    g.font = font; const ws = lines.map((l) => g.measureText(l).width);
    const W = Math.ceil(Math.max(...ws)) + pad * 2, H = Math.ceil(lh * lines.length) + pad * 2;
    c.width = W; c.height = H; g.font = font; g.textBaseline = 'middle';
    lines.forEach((l, i) => {
      const x = (W - ws[i]) / 2, y = pad + lh * (i + 0.5);
      g.fillStyle = '#fff'; g.fillText(l, x, y);
      if (l.endsWith('.')) { g.fillStyle = '#f00'; g.fillText('.', x + g.measureText(l.slice(0, -1)).width, y); }
    });
    const d = g.getImageData(0, 0, W, H).data; const cand = [];
    for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * 4; if (d[i] > 120) cand.push(x, y, d[i + 1] < 90 ? 1 : 0); }
    const total = cand.length / 3, n = T.text;
    const widthW = narrow ? 3.7 : 11.4; const sc = widthW / W;
    const pos = new Float32Array(n * 3), st = new Float32Array(n * 3), r = new Float32Array(n * 4), dot = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = ((Math.random() * total) | 0) * 3;
      pos[i * 3] = (cand[k] - W / 2 + (Math.random() - 0.5) * 2) * sc;
      pos[i * 3 + 1] = -(cand[k + 1] - H / 2 + (Math.random() - 0.5) * 2) * sc;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.12;
      dot[i] = cand[k + 2];
      const u = Math.random() * Math.PI * 2, v = Math.acos(2 * Math.random() - 1), rr = 6 + Math.random() * 16;
      st[i * 3] = Math.sin(v) * Math.cos(u) * rr; st[i * 3 + 1] = Math.sin(v) * Math.sin(u) * rr * 0.7; st[i * 3 + 2] = Math.cos(v) * rr - 6;
      r[i * 4] = Math.random(); r[i * 4 + 1] = Math.random(); r[i * 4 + 2] = Math.random(); r[i * 4 + 3] = Math.random();
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gg.setAttribute('aStart', new THREE.BufferAttribute(st, 3));
    gg.setAttribute('aR', new THREE.BufferAttribute(r, 4)); gg.setAttribute('aDot', new THREE.BufferAttribute(dot, 1));
    if (textPts) { G0.remove(textPts); textPts.geometry.dispose(); }
    textPts = new THREE.Points(gg, textMat); textPts.frustumCulled = false; textPts.position.y = narrow ? 0.9 : 0.35;
    G0.add(textPts);
  }
  await buildText();
  setLoad(0.75);

  // ================= 場面1：石膏の結晶が、ガラスへ置き換わっていく回廊 =================
  const G1 = new THREE.Group(); G1.userData.r = [-55, -5]; scene.add(G1);
  const plaster = new THREE.MeshStandardMaterial({ color: 0xd8d4cb, roughness: 0.88, metalness: 0 });
  const pedMat = new THREE.MeshStandardMaterial({ color: 0x0b0e18, roughness: 0.55, metalness: 0.2 });
  const pedGeo = new THREE.BoxGeometry(0.62, 4, 0.62);
  const g1Glass = rim(glass({ dispersion: 5, thickness: 1.0, roughness: 0.12, envMapIntensity: 4.2, attenuationDistance: 6 }), 0xc8efff, 1.1);
  const hall = [];
  const variants = ['c0', 'c1', 'c2', 'c3', 'c4', 'c5'];
  let vi = 0;
  for (let k = 0; k < 13; k++) for (const side of [-1, 1]) for (const row of [0, 1]) {
    const z = -19 - k * 3.1 - row * 1.4, x = side * (2.3 + row * 1.9);
    const top = -1.25 + row * 0.35 + (Math.random() - 0.5) * 0.3;
    const ped = new THREE.Mesh(pedGeo, pedMat); ped.position.set(x, top - 2, z); G1.add(ped);
    const g = geo[variants[vi++ % 6]].g;
    const m1 = new THREE.Mesh(g, plaster), m2 = new THREE.Mesh(g, g1Glass);
    const s = 0.55 + Math.random() * 0.25;
    for (const m of [m1, m2]) { m.position.set(x, top + 0.75 * s * 1.4, z); m.rotation.set((Math.random() - 0.5) * 0.3, Math.random() * 6, (Math.random() - 0.5) * 0.3); G1.add(m); }
    hall.push({ m1, m2, z, s, ry: m1.rotation.y });
  }
  const hallLight = new THREE.PointLight(0xfff1e0, 120, 70, 1.6); hallLight.position.set(0, 1.2, -62); G1.add(hallLight);
  const glowTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,.55)'); gr.addColorStop(0.5, 'rgba(255,255,255,.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sprite = (col, k, s) => { const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(col).multiplyScalar(k), blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); m.scale.setScalar(s); return m; };
  const hallEnd = sprite(0xdfeaff, 0.9, 6); hallEnd.position.set(0, 0.6, -66); G1.add(hallEnd);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(26, 80), new THREE.MeshStandardMaterial({ color: 0x05070e, roughness: 0.55, metalness: 0.4 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, -3.3, -40); G1.add(floor);

  // ================= 場面2：割れて散る結晶（無数の“もっともらしさ”） =================
  const G2 = new THREE.Group(); G2.userData.r = [-92, -44]; scene.add(G2);
  const shardRoot = new THREE.Group(); shardRoot.position.set(0, -0.6, -72); shardRoot.scale.setScalar(1.75); shardRoot.rotation.set(-Math.PI / 2 + 0.25, 0.3, 0.6); G2.add(shardRoot);
  const shardMat = rim(glass({ dispersion: 6, thickness: 0.9, roughness: 0.05, envMapIntensity: 3.6 }), 0xc8efff, 0.9);
  const ghostMat = new THREE.LineBasicMaterial({ color: new THREE.Color(0xc8efff).multiplyScalar(1.4), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false });
  const shards = [];
  Object.keys(geo).filter((k) => k.startsWith('shard_')).sort().forEach((k, i) => {
    const { g, p } = geo[k];
    const m = new THREE.Mesh(g, shardMat); m.position.copy(p); shardRoot.add(m);
    const dir = p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6)).normalize();
    const ax = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const ghosts = [];
    for (let j = 0; j < 2; j++) { const l = new THREE.LineSegments(new THREE.EdgesGeometry(g, 25), ghostMat); l.position.copy(p); shardRoot.add(l); ghosts.push(l); }
    shards.push({ m, p: p.clone(), dir, ax, r: Math.random(), ghosts, i });
  });
  const core2 = sprite(0xc8efff, 1.3, 0.1); core2.position.set(0, 0, -72); G2.add(core2);
  const back2 = sprite(0x4a66c8, 0.7, 30); back2.position.set(0, 0, -86); G2.add(back2);
  const coreLight = new THREE.PointLight(0xc8efff, 0, 14, 2); coreLight.position.set(0, 0, -72); G2.add(coreLight);
  // 散る粒（エントロピー）
  const dustMat = new THREE.ShaderMaterial({
    transparent: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uE: { value: 0 }, uS: { value: ptScale() } },
    vertexShader: `attribute vec4 aR; uniform float uT,uE,uS; varying float vA;
      void main(){ float r=.4+aR.x*(1.+uE*9.); float a=aR.y*6.2832+uT*(.15+aR.z*.4)*(aR.w>.5?1.:-1.);
        float b=(aR.z-.5)*3.1416*(.3+uE*.7);
        vec3 p=position+vec3(cos(a)*cos(b)*r, sin(b)*r*.8, sin(a)*cos(b)*r);
        vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z;
        gl_PointSize=clamp((.03+aR.w*.04)*uS/d,1.,24.); vA=(.25+uE*.9)*smoothstep(.5,2.,d);
        gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vec3(.7,.82,1.)*a*a*vA,1.); }`,
  });
  {
    const n = T.dust, p = new Float32Array(n * 3), r = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { p[i * 3 + 2] = -72; r[i * 4] = Math.random(); r[i * 4 + 1] = Math.random(); r[i * 4 + 2] = Math.random(); r[i * 4 + 3] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
    const d = new THREE.Points(g, dustMat); d.frustumCulled = false; G2.add(d);
  }

  // ================= 場面3：ノイズの中を、結晶を通った一本の信号が貫く =================
  const G3 = new THREE.Group(); G3.userData.r = [-140, -76]; scene.add(G3);
  const prism = new THREE.Mesh(geo.prism.g, rim(glass({ dispersion: 12, thickness: 1.8, ior: 1.7 }), 0xffffff, 0.4));
  prism.position.set(0, 0, -104); prism.scale.setScalar(1.55); G3.add(prism);
  const noiseMat = new THREE.ShaderMaterial({
    transparent: false, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uT: { value: 0 }, uP: { value: 0 }, uS: { value: ptScale() } },
    vertexShader: `attribute vec4 aR; uniform float uT,uP,uS; varying float vA; varying vec3 vC;
      float h(float x){return fract(sin(x*127.1)*43758.5453);}
      void main(){ float k=smoothstep(aR.x*.75,aR.x*.75+.25,uP);
        float fr=floor(uT*14.+aR.y*13.);
        vec3 j=(vec3(h(aR.y*91.+fr),h(aR.z*57.+fr),h(aR.w*33.+fr))-.5)*.22;
        vec3 base=position+j*(1.-k);
        float fl=fract(aR.w+uT*(.035+aR.z*.03));
        float x=mix(-17.,17.,fl);
        vec3 on=vec3(x,(aR.y-.5)*.06*(1.+abs(x)*.05),-104.+(aR.z-.5)*.06);
        vec3 p=mix(base,on,k);
        vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z;
        float flick=step(.35,h(aR.x*17.+fr));
        gl_PointSize=clamp((.028+aR.w*.03)*uS/d*(1.+k*.6),1.,18.);
        vA=mix(.35*flick*(1.-uP*.65),1.2,k)*smoothstep(.5,2.,d);
        vec3 sig=x>0.?vec3(2.6,.62,.2):vec3(.9,1.15,1.6);
        vC=mix(vec3(.55,.58,.66),sig,k); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d=length(gl_PointCoord-.5); float a=smoothstep(.5,0.,d); gl_FragColor=vec4(vC*a*a*vA,1.); }`,
  });
  {
    const n = T.noise, p = new Float32Array(n * 3), r = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 34; p[i * 3 + 1] = (Math.random() - 0.5) * 15; p[i * 3 + 2] = -104 + (Math.random() - 0.5) * 18;
      r[i * 4] = Math.random(); r[i * 4 + 1] = Math.random(); r[i * 4 + 2] = Math.random(); r[i * 4 + 3] = Math.random();
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r, 4));
    const d = new THREE.Points(g, noiseMat); d.frustumCulled = false; G3.add(d);
  }
  const beamMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uO: { value: 0 }, uT: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform float uO,uT; varying vec2 vUv;
      void main(){ float y=vUv.y-.5; float x=vUv.x;
        float core=exp(-pow(y*260.,2.))*3.; float halo=exp(-pow(y*26.,2.))*.5; float wide=exp(-pow(y*7.,2.))*.08;
        vec3 L=vec3(.85,1.,1.4), R=vec3(2.8,.6,.17);
        vec3 c=mix(L,R,smoothstep(.49,.53,x));
        float ends=smoothstep(0.,.18,x)*smoothstep(1.,.75,x);
        float puls=.85+.15*sin(x*60.-uT*6.);
        gl_FragColor=vec4(c*(core+halo*puls+wide)*ends*uO,1.); }`,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(36, 2.4), beamMat); beam.position.set(0, 0, -104); G3.add(beam);
  const prismFlare = sprite(0xffffff, 1.0, 0.1); prismFlare.position.set(0.15, 0, -103.6); G3.add(prismFlare);

  // ---------- 後処理（光のにじみ＋色収差・速いスクロールの時だけ画面が崩れる） ----------
  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(T.dpr); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.45, 0.95);
  bloom.enabled = T.bloom; composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fin = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uCA: { value: 0.0022 }, uSm: { value: 0 }, uFl: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uGr: { value: 0.03 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uT,uCA,uSm,uFl,uGr; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      void main(){ vec2 uv=vUv; vec2 c=uv-.5; float fr=floor(uT*16.);
        float row=floor(uv.y*26.); float b=step(1.-uSm*.5,h(vec2(row,fr)));
        uv.x+=b*(h(vec2(row,fr+3.))-.5)*.1*uSm;
        float col=floor(uv.x*70.); float s=step(1.-uSm*.4,h(vec2(col,fr+9.)));
        uv.y=mix(uv.y,uv.y*.15+h(vec2(col,fr))*.85,s*.5*uSm);
        float ca=uCA*(.35+dot(c,c)*3.2)+uSm*.014+uFl*.028;
        vec2 dir=normalize(c+1e-5)*ca;
        vec3 o=vec3(texture2D(tDiffuse,uv+dir).r,texture2D(tDiffuse,uv).g,texture2D(tDiffuse,uv-dir).b);
        o+=uFl*vec3(.42,.5,.62)*smoothstep(.85,0.,length(c));
        float v=smoothstep(1.1,.25,length(c*vec2(1.,.9))*1.3); o*=mix(.5,1.,v);
        o+=(h(uv*uRes+fract(uT*.37)*97.)-.5)*uGr;
        gl_FragColor=vec4(o,1.); }`,
  });
  composer.addPass(fin);

  // ---------- スクロール → カメラの道筋 ----------
  const el = (id) => document.getElementById(id);
  let K = [], pathP, pathT, secs;
  function layout() {
    const vh = innerHeight, top = (id) => el(id).offsetTop, hh = (id) => el(id).offsetHeight;
    const fvEnd = hh('fv') - vh;
    K = [
      { y: 0, p: [0, 0, 14], t: [0, 0, 0], o: 0, e: 1 },
      { y: fvEnd * 0.3, p: [0, 0.1, 12.6], t: [0, 0, -1], o: 0, e: 1 },
      { y: top('sthead') + hh('sthead') * 0.5 - vh * 0.5, p: [0, 0, -9], t: [0, -0.1, -24], o: 0, e: 1 },
      { y: top('s1') + vh * 0.15, p: [0.1, 0.5, -16], t: [0.2, -0.5, -40], o: 1, e: 0 },
      { y: top('s1') + hh('s1') - vh * 0.9, p: [-0.1, 0.7, -33], t: [0.2, -0.4, -62], o: 1, e: 1 },
      { y: top('s2') + vh * 0.15, p: [-3.4, 0.6, -60.5], t: [0, 0, -72], o: 1, e: 0 },
      { y: top('s2') + hh('s2') - vh * 0.9, p: [3.0, 1.9, -61.5], t: [0, 0, -72], o: 1, e: 1 },
      { y: top('s3') + vh * 0.15, p: [-3.2, 1.1, -92], t: [0, 0, -104], o: 1, e: 0 },
      { y: top('s3') + hh('s3') - vh * 0.9, p: [1.0, 0.35, -93.5], t: [0.6, 0, -104], o: 1, e: 1 },
      { y: top('benefit') + vh * 0.2, p: [-1, 4.2, -95], t: [5, -1.5, -124], o: 0.2, e: 1 },
    ];
    pathP = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(...k.p)), false, 'centripetal');
    pathT = new THREE.CatmullRomCurve3(K.map((k) => new THREE.Vector3(...k.t)), false, 'centripetal');
    secs = ['fv', 'sthead', 's1', 's2', 's3'].map((id) => ({ id, el: el(id), top: top(id), h: hh(id) }));
  }
  layout();
  function keyAt(y) {
    let i = 0; while (i < K.length - 2 && y > K[i + 1].y) i++;
    let s = clamp((y - K[i].y) / Math.max(1, K[i + 1].y - K[i].y));
    if (K[i].e) s = s * s * (3 - 2 * s);
    return { u: (i + s) / (K.length - 1), o: lerp(K[i].o, K[i + 1].o, s) };
  }
  const local = (id, y) => { const s = secs.find((q) => q.id === id); return clamp((y - s.top) / Math.max(1, s.h - innerHeight)); };

  // ---------- 入力 ----------
  const mouse = new THREE.Vector2(0, 0), mouseS = new THREE.Vector2(0, 0); let hasMouse = false;
  addEventListener('pointermove', (e) => { hasMouse = true; mouse.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1); });
  let ys = scrollY, yPrev = scrollY, vel = 0;
  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    for (const m of [starMat, textMat, dustMat, noiseMat]) m.uniforms.uS.value = ptScale();
    fin.uniforms.uRes.value.set(innerWidth, innerHeight);
    layout(); buildText();
  });

  // ---------- 文字（DOM）の出し入れ ----------
  const cards = ['s1', 's2', 's3'].map((id) => ({ id, el: el(id).querySelector('.card'), on: false }));
  const shd = $('#shd'), sum = $('#sum'), hint = $('#hint');
  const hudWrap = [...document.querySelectorAll('.hud')]; const hudSec = $('#hudsec'), hudBar = $('#hudbar'), hudPc = $('#hudpc');
  let hudLabel = '';
  const tagsEl = $('#tags'), tagSvg = $('#tagsvg');
  const tagIdx = [3, 8, 14, 19, 24, 27].filter((i) => i < shards.length);
  const tagNodes = tagIdx.map((i) => { const s = document.createElement('span'); s.textContent = 'S_' + String(i).padStart(2, '0'); tagsEl.appendChild(s); const l = document.createElementNS('http://www.w3.org/2000/svg', 'polyline'); l.setAttribute('fill', 'none'); l.setAttribute('stroke', 'rgba(200,239,255,.55)'); l.setAttribute('stroke-width', '1'); tagSvg.appendChild(l); return { s, l, i }; });
  document.querySelectorAll('[data-scr]').forEach((e) => scr(e, 900));

  // ---------- 最初の1枚の前に準備 ----------
  try { await renderer.compileAsync(scene, camera); } catch (e) {}
  setLoad(1);
  await new Promise((r) => setTimeout(r, 250));
  ld.el.classList.add('done');
  const t0 = performance.now();
  const clock = new THREE.Clock();
  const tmpV = new THREE.Vector3(), tgt = new THREE.Vector3(), camBase = new THREE.Vector3();
  let frames = 0, acc = 0, stepped = 0;
  window.__c3d = { get fps() { return frames ? 1000 * frames / acc : 0; }, tier: () => tier, scene, bloom, hero, textPts: () => textPts, heroGlow, key };

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05), now = performance.now(), t = (now - t0) / 1000;
    // スクロールのなめらか化と速さ
    ys += (scrollY - ys) * (1 - Math.exp(-dt * 7));
    if (Math.abs(scrollY - ys) < 0.5) ys = scrollY;
    vel = lerp(vel, (ys - yPrev) / Math.max(dt, 1e-3) / innerHeight, 0.2); yPrev = ys;
    mouseS.lerp(mouse, 1 - Math.exp(-dt * 3));

    const k = keyAt(ys);
    pathP.getPoint(k.u, camBase); pathT.getPoint(k.u, tgt);
    camera.position.copy(camBase);
    camera.position.x += mouseS.x * 0.35; camera.position.y += mouseS.y * 0.2;
    camera.lookAt(tgt);
    // 構図：物語の場面では物を右（スマホは上）へ寄せる
    const narrow = isNarrow(), W = innerWidth, H = innerHeight;
    if (narrow) camera.setViewOffset(W, H, 0, H * 0.13 * k.o, W, H); else camera.setViewOffset(W, H, -W * 0.14 * k.o, 0, W, H);

    const yv = ys;
    // FV
    const form = reduced ? 1 : sstep(0.0, 3.2, t);
    textMat.uniforms.uForm.value = form;
    const scat = clamp((yv - K[1].y * 0.6) / (K[2].y - K[1].y * 0.6));
    textMat.uniforms.uScatter.value = scat;
    // マウスを z=0 の面へ
    tmpV.set(mouseS.x, mouseS.y, 0.5).unproject(camera).sub(camera.position).normalize();
    const dz = (0 - camera.position.z) / (tmpV.z || -1);
    if (hasMouse) textMat.uniforms.uM.value.copy(camera.position).addScaledVector(tmpV, dz).sub(textPts.position);
    hero.rotation.y += dt * 0.12; hero.rotation.x = 0.2 + Math.sin(t * 0.3) * 0.08;
    sum.style.opacity = String(form > 0.7 ? 1 - sstep(0, innerHeight * 0.45, yv) : 0);
    hint.style.opacity = String(form > 0.9 ? 1 - sstep(0, innerHeight * 0.2, yv) : 0);
    const dHero = camera.position.distanceTo(hero.position);
    const inside = 1 - sstep(1.0, 3.2, dHero);
    heroGlow.intensity = 6 + inside * 30;
    hero.visible = dHero > 1.7;
    // STORY の見出し
    const ph = local('sthead', yv);
    shd.style.opacity = String(sstep(0.2, 0.45, ph) * (1 - sstep(0.75, 0.98, ph)));
    shd.style.transform = `scale(${1 + ph * 0.08})`;

    // 場面1
    const p1 = local('s1', yv);
    const front = lerp(-70, -12, sstep(0.05, 0.78, p1));
    for (const h of hall) {
      const cv = clamp((front - h.z) / 4.5);
      const e = cv * cv * (3 - 2 * cv);
      h.m1.scale.setScalar(h.s * Math.max(0.0001, 1 - e));
      const pop = e < 1 ? e * (1 + Math.sin(e * Math.PI) * 0.35) : 1;
      h.m2.scale.setScalar(h.s * Math.max(0.0001, pop));
      h.m2.visible = e > 0.001; h.m1.visible = e < 0.999;
      h.m2.rotation.y = h.ry + e * Math.PI * 0.75 + t * 0.15;
    }
    // 場面2
    const p2 = local('s2', yv);
    const ex = sstep(0.1, 0.8, p2);
    shardRoot.rotation.z = 0.6 + t * 0.06;
    for (const s of shards) {
      const d = ex * (0.22 + s.r * 0.95);
      s.m.position.copy(s.p).addScaledVector(s.dir, d);
      s.m.setRotationFromAxisAngle(s.ax, ex * (0.6 + s.r * 2.2) + Math.sin(t * 0.5 + s.r * 9) * 0.03 * ex);
      s.ghosts.forEach((g, j) => { g.position.copy(s.p).addScaledVector(s.dir, d * (1.25 + j * 0.35) + 0.05 * j); g.quaternion.copy(s.m.quaternion); g.rotateOnAxis(s.ax, 0.25 * (j + 1) * ex); });
    }
    ghostMat.opacity = ex * 0.4;
    dustMat.uniforms.uE.value = ex;
    core2.scale.setScalar(0.1 + sstep(0.05, 0.5, p2) * 2.2 * (1 - ex * 0.5));
    coreLight.intensity = sstep(0.05, 0.5, p2) * 3;
    // 破片の番号
    const tagO = sstep(0.25, 0.45, p2) * (1 - sstep(0.85, 0.97, p2));
    tagsEl.style.opacity = String(tagO);
    if (tagO > 0.01) {
      for (const tn of tagNodes) {
        shards[tn.i].m.getWorldPosition(tmpV); tmpV.project(camera);
        const x = (tmpV.x * 0.5 + 0.5) * W, y = (-tmpV.y * 0.5 + 0.5) * H;
        const lx = x + 46, ly = y - 34;
        tn.s.style.transform = `translate(${lx + 4}px,${ly - 12}px)`;
        tn.l.setAttribute('points', `${x},${y} ${x + 16},${ly} ${lx + 70},${ly}`);
        const ok = tmpV.z < 1 && ly > 110 && ly < H - 70 && lx < W - 130 && x > 20; tn.s.style.visibility = tn.l.style.visibility = ok ? 'visible' : 'hidden';
      }
    }
    // 場面3
    const p3 = local('s3', yv);
    noiseMat.uniforms.uP.value = sstep(0.12, 0.85, p3);
    beamMat.uniforms.uO.value = sstep(0.05, 0.4, p3);
    prism.rotation.z = t * 0.1; prism.rotation.y = Math.sin(t * 0.4) * 0.25;
    prismFlare.scale.setScalar(0.1 + sstep(0.1, 0.5, p3) * 3.5);

    // 場面ごとの表示を軽くする（近い場面だけ描く）
    for (const g of [G0, G1, G2, G3]) { const z = camera.position.z; g.visible = z > g.userData.r[0] && z < g.userData.r[1]; }

    // 文字
    for (const c of cards) {
      const p = local(c.id, yv);
      const o = sstep(0.02, 0.14, p) * (1 - sstep(0.84, 0.97, p));
      c.el.style.opacity = String(o);
      c.el.style.translate = `0 ${(1 - sstep(0.02, 0.14, p)) * 24 - sstep(0.84, 0.97, p) * 24}px`;
      if (o > 0.05 && !c.on) { c.on = true; c.el.querySelectorAll('[data-scr],.t').forEach((e) => scr(e)); }
      if (o <= 0.01) c.on = false;
    }
    const bTop = el('benefit').offsetTop;
    const lbl = yv < secs[1].top - innerHeight * 0.3 ? 'find the signal.' : yv < secs[2].top - innerHeight * 0.2 ? 'STORY' : yv < secs[3].top ? 'STORY 01 / 06' : yv < secs[4].top ? 'STORY 02 / 06' : yv < bTop - innerHeight * 0.5 ? 'STORY 03 / 06' : 'FEATURES';
    if (lbl !== hudLabel) { hudLabel = lbl; setText(hudSec, lbl); }
    const tot = clamp(yv / Math.max(1, document.documentElement.scrollHeight - innerHeight));
    hudBar.style.transform = `scaleX(${tot})`;
    hudWrap.forEach((h) => { h.style.opacity = String(1 - sstep(bTop - innerHeight * 0.9, bTop - innerHeight * 0.5, yv)); });
    hudPc.textContent = String(Math.round(tot * 100)).padStart(3, '0');

    // 後処理
    fin.uniforms.uT.value = t;
    const sm = reduced ? 0 : clamp(Math.abs(vel) * 0.55 - 0.35, 0, 1);
    fin.uniforms.uSm.value = lerp(fin.uniforms.uSm.value, sm, 0.25);
    fin.uniforms.uFl.value = inside * 0.75;
    for (const m of [starMat, textMat, dustMat, noiseMat, beamMat]) m.uniforms.uT.value = t;
    neb.position.copy(camera.position); neb.material.uniforms.uT.value = t;

    tickScr(now);
    composer.render(dt);

    // 重い時は自動で軽くする（PC→少し軽く→簡略版）
    frames++; acc += dt * 1000;
    if (frames >= 120) {
      const ms = acc / frames;
      if (ms > 26 && stepped < 2 && !Q.get('q')) {
        stepped++;
        if (stepped === 1) { renderer.setPixelRatio(1); composer.setPixelRatio(1); composer.setSize(innerWidth, innerHeight); }
        else { bloom.enabled = false; tier = 'lite'; }
      }
      window.__c3d.ms = ms; frames = 0; acc = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
main().catch((e) => { console.error(e); fail(); });
