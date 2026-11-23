// 場面2・4 候補の共通の土台：描画・仕上げ（ブルーム→色調→粒子感と周辺減光）・スクロールの進み・音の口
// すべて自作。three.js 本体と公式 addons だけを使う。
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SND } from '../b/sound.js';

export { THREE };
export const SP = matchMedia('(max-width: 820px)').matches || /iPhone|Android.+Mobile/.test(navigator.userAgent);
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
export const mix = (a, b, k) => a + (b - a) * k;
export const SIG = new THREE.Color(0xff5a24);

// 乱数（毎回同じ並び）
export function makeRnd(seed = 20261124) {
  return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// GLSL：自前の値ノイズ
export const NOISE = `
float h31(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
float vnoise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z); }
vec3 vn3(vec3 p){ return vec3(vnoise(p),vnoise(p+vec3(31.4,7.1,2.9)),vnoise(p+vec3(5.3,63.2,17.7)))*2.-1.; }
`;

// 丸い点（ぼかしの縁つき）の発光テクスチャ
export function glowTex(size = 128, k = 2.2) {
  const c = document.createElement('canvas'); c.width = c.height = size; const x = c.getContext('2d');
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 10; i++) { const r = i / 10; g.addColorStop(r, `rgba(255,255,255,${Math.pow(1 - r, k)})`); }
  x.fillStyle = g; x.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * stage(opts) … 描画の土台を作る
 * opts: fov, dpr, bloom:[強さ,半径,しきい値], shift:{pc:[x,y], sp:[x,y]}（画面の中心をずらす割合）, grain, vig
 * 戻り値の st：p（0〜1 の進み・なめらか）, t（秒）, dt, mx/my（マウス -0.5〜0.5・なめらか）, px（点の大きさの係数）
 */
export function stage(opts = {}) {
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !SP, powerPreference: 'high-performance', stencil: false });
  const DPR = Math.min(devicePixelRatio || 1, SP ? (opts.dprSp ?? 1.5) : (opts.dpr ?? 1.5));
  renderer.setPixelRatio(DPR);
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = opts.exposure ?? 1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 1);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const camera = new THREE.PerspectiveCamera(SP ? (opts.fovSp ?? 60) : (opts.fov ?? 42), innerWidth / innerHeight, 0.05, 400);

  const composer = new EffectComposer(renderer);
  composer.setPixelRatio(DPR);
  const rp = new RenderPass(scene, camera); composer.addPass(rp);
  const b = opts.bloom || [0.8, 0.5, 0.75];
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), b[0], b[1], b[2]); composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const fin = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(innerWidth, innerHeight) }, uGrain: { value: opts.grain ?? 0.045 }, uVig: { value: opts.vig ?? 0.7 }, uCA: { value: 0.0018 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uGrain, uVig, uCA; uniform vec2 uRes; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
      void main(){ vec2 d=vUv-.5; float rr=length(d*vec2(uRes.x/uRes.y,1.))/.9; float ca=uCA*(.3+rr);
        vec3 c=vec3(texture2D(tDiffuse,.5+d*(1.+ca)).r, texture2D(tDiffuse,vUv).g, texture2D(tDiffuse,.5+d*(1.-ca)).b);
        c*=1.-uVig*pow(clamp(rr,0.,1.4),2.6);
        c+=(h(vUv*uRes+fract(uTime*7.)*91.)-.5)*uGrain;
        gl_FragColor=vec4(max(c,0.),1.); }`,
  });
  composer.addPass(fin);

  const st = { p: 0, P: 0, t: 0, dt: 0, mx: 0, my: 0, px: 1000, w: innerWidth, h: innerHeight, DPR, SP, moved: false };
  const shift = SP ? (opts.shift?.sp || [0, 0]) : (opts.shift?.pc || [0, 0]);

  function resize() {
    const w = innerWidth, h = innerHeight; st.w = w; st.h = h;
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // 文字の反対側へ絵の中心をずらす
    camera.setViewOffset(w, h, -shift[0] * w, -shift[1] * h, w, h);
    renderer.setSize(w, h, false); composer.setSize(w, h); bloom.setSize(w * DPR, h * DPR);
    fin.uniforms.uRes.value.set(w, h);
    st.px = h * DPR * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    hooks.forEach((f) => f.resize && f.resize(st));
  }
  const hooks = [];
  addEventListener('resize', resize);

  // スクロールの進み（0〜1）
  const sc = document.getElementById('scroller');
  const readP = () => clamp(scrollY / Math.max(1, document.documentElement.scrollHeight - innerHeight));
  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; st.moved = true; }, { passive: true });
  const pb = document.getElementById('pb'), hint = document.getElementById('hint');

  return {
    THREE, renderer, scene, camera, composer, bloom, fin, st,
    /** frame(st) を毎コマ呼ぶ。sound は { init(out)→{update(st,out)}, chord } */
    run(frame, sound) {
      resize();
      document.body.classList.add('ready');
      const t0 = performance.now();
      let last = t0, snd = null, sndCtx = null;
      SND.scene(sound?.chord ?? 2);
      const loop = (now) => {
        requestAnimationFrame(loop);
        const dt = Math.min(0.05, (now - last) / 1000); last = now; st.dt = dt;
        st.t = (window.__T != null) ? window.__T : Math.max(0, (now - t0) / 1000);
        const target = (window.__P != null) ? window.__P : readP();
        st.P = target;
        st.p = (window.__P != null) ? target : st.p + (target - st.p) * Math.min(1, dt * 3.2);
        st.mx += (mouse.x - st.mx) * Math.min(1, dt * 3); st.my += (mouse.y - st.my) * Math.min(1, dt * 3);
        if (window.__P != null) { st.mx = 0; st.my = 0; }
        if (pb) pb.style.width = (st.p * 100).toFixed(1) + '%';
        if (hint) hint.style.opacity = st.p > 0.04 ? 0 : 1;
        frame(st);
        fin.uniforms.uTime.value = st.t;
        composer.render();
        // 音：オンの時だけ合成する（オフなら作らない・止める）
        const out = SND.out();
        if (sound) {
          if (out && (!snd || sndCtx !== out.ctx)) { snd = sound.init(out); sndCtx = out.ctx; }
          if (snd) snd.update(st, out);
        }
        if (sound?.base) SND.update(sound.base(st));
      };
      requestAnimationFrame(loop);
    },
    onResize(f) { hooks.push(f); },
  };
}

// 小さな効果音の道具（out は SND.out() の戻り値）
export const sfx = {
  tone(out, f, peak, a, d, type = 'sine', dest, f2) {
    const { ctx } = out; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
    const t = ctx.currentTime; if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    o.connect(g); g.connect(dest || out.sfx); o.start(t); o.stop(t + a + d + 0.05);
  },
  burst(out, peak, dur, type, f, q, dest) {
    const { ctx, nbuf } = out; const s = ctx.createBufferSource(); s.buffer = nbuf; s.playbackRate.value = 0.3 + Math.random() * 0.6;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || out.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  loop(out, type, f, q, dest) {
    const { ctx, nbuf } = out; const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0; s.connect(fl); fl.connect(g); g.connect(dest || out.music); s.start();
    return { g, fl };
  },
};
export const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
