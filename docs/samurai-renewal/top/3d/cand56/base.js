// 場面5・6 候補の共通の土台：描画・スクロールの進み・文の出し分け・音の口
// 各案は { build(S), frame(S), sound: { init(S, o), update(S, o) } } を渡す
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SND } from '../b/sound.js';

export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const TAU = Math.PI * 2;
let seed = 5612;
export const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
export const rr = (a, b) => a + (b - a) * rnd();
export const SIG = 0xff5a24;
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// 音の部品（WebAudio）
export const A = {
  env(ctx, g, a, peak, d, t0 = ctx.currentTime) { g.gain.cancelScheduledValues(t0); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); },
  tone(o, f, type, peak, a, d, to, f2, t0) {
    const { ctx } = o; t0 = t0 ?? ctx.currentTime;
    const x = ctx.createOscillator(), g = ctx.createGain(); x.type = type; x.frequency.setValueAtTime(f, t0);
    if (f2) x.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
    x.connect(g); g.connect(to || o.sfx); A.env(ctx, g, a, peak, d, t0); x.start(t0); x.stop(t0 + a + d + 0.05); return x;
  },
  noise(o, peak, a, d, type, f, q, to, f2, t0) {
    const { ctx } = o; t0 = t0 ?? ctx.currentTime;
    const s = ctx.createBufferSource(); s.buffer = o.nbuf; s.playbackRate.value = 0.6 + Math.random() * 0.8;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t0); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + a + d);
    const g = ctx.createGain(); s.connect(fl); fl.connect(g); g.connect(to || o.sfx);
    A.env(ctx, g, a, peak, d, t0); s.start(t0, Math.random()); s.stop(t0 + a + d + 0.05);
  },
  loop(o, type, f, q, to) {   // 鳴らしっぱなしのノイズ（音量は返す gain で動かす）
    const { ctx } = o; const s = ctx.createBufferSource(); s.buffer = o.nbuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(to || o.sfx); s.start(); return { g, fl, s };
  },
  osc(o, type, f, to) { const { ctx } = o; const x = ctx.createOscillator(); x.type = type; x.frequency.value = f; const g = ctx.createGain(); g.gain.value = 0; x.connect(g); g.connect(to || o.sfx); x.start(); return { x, g }; },
  bus(o, toVerb = 0.4) {   // この案の音の出口（残響へも少し送る）
    const { ctx } = o; const g = ctx.createGain(); g.gain.value = 0; g.connect(o.sfx);
    const s = ctx.createGain(); s.gain.value = toVerb; g.connect(s); s.connect(o.verb); return g;
  },
  set(o, param, v, tc = 0.2) { param.setTargetAtTime(v, o.ctx.currentTime, tc); },
};

export async function run(C) {
  const root = document.documentElement;
  const SP = matchMedia('(max-width: 820px)').matches;
  const QS = new URLSearchParams(location.search);
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  const DPR = Math.min(devicePixelRatio || 1, C.dpr ?? (SP ? 2 : 1.5));
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !!C.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020203);
  const camera = new THREE.PerspectiveCamera(SP ? 58 : 40, innerWidth / innerHeight, 0.05, 2000);
  const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.7, 0.6, 0.82);
  composer.addPass(bloom);
  const fin = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uV: { value: 1.15 }, uG: { value: 0.05 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `uniform sampler2D tDiffuse;uniform float uT,uV,uG;varying vec2 vUv;
      float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
      void main(){vec4 c=texture2D(tDiffuse,vUv);vec2 q=vUv-.5;float v=1.-dot(q,q)*uV;c.rgb*=clamp(v,0.,1.);
      c.rgb+=(h(vUv*1000.+fract(uT)*91.)-.5)*uG*(.35+c.rgb);gl_FragColor=c;}`,
  });
  composer.addPass(fin);
  composer.addPass(new OutputPass());

  const S = { THREE, renderer, scene, camera, composer, bloom, fin, SP, p: 0, pt: 0, t: 0, dt: 0, QS, el: {} };
  window.__S = S;
  // 進み：スクロール（または ?p= で固定）
  const lockP = QS.has('p') ? +QS.get('p') : null;
  const scrollP = () => { const h = document.documentElement.scrollHeight - innerHeight; return h > 0 ? clamp(scrollY / h) : 0; };
  window.__setP = (v) => { S.forceP = v; };
  await C.build(S);

  const onR = () => {
    renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); C.resize?.(S);
  };
  addEventListener('resize', onR);

  // 文の出し分け：data-on="0.5" の要素は p がそこを越えたら .on
  const marks = [...document.querySelectorAll('[data-on]')];
  const tx = document.querySelector('.tx');
  const bar = document.getElementById('pb');
  let last = performance.now(), built = false;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    S.dt = dt; S.t += dt;
    S.pt = S.forceP ?? lockP ?? scrollP();
    S.p += (S.pt - S.p) * Math.min(1, dt * 3.2);
    if (S.forceP != null || lockP != null) S.p = S.pt;
    marks.forEach((m) => m.classList.toggle('on', S.p >= +m.dataset.on));
    if (tx) tx.classList.add('in');
    if (bar) bar.style.width = (S.p * 100).toFixed(1) + '%';
    C.frame(S);
    // 音：オンの時だけ（土台の風は止め、この場面の和音にする）
    const o = SND.out && SND.out();
    if (o) {
      try {
      if (!built) { built = true; C.sound?.init(S, o); }
      SND.scene(C.chordAt ? C.chordAt(S) : (C.chord ?? 5));
      SND.update({ noise: 0, travel: 0, vel: 0, dawn: 0, fv: 0, day: 0, tv: 0 });
      if (C.duck) o.music.gain.setTargetAtTime(0.9 - 0.5 * C.duck(S), o.ctx.currentTime, 0.8);   // 土台の和音を下げる（day は使わない＝昼の音が混ざるため）
      C.sound?.update(S, o);
      } catch (e) { console.error(e); }
    } else if (built && C.sound?.mute) C.sound.mute(S);
    fin.uniforms.uT.value = S.t;
    composer.render();
    if (!S.ready) { S.ready = true; document.getElementById('ld')?.classList.add('out'); window.__ready = true; }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
export { THREE, SND };
