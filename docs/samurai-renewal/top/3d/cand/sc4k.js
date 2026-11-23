// 場面4 G/H/I の共通部品：本線（main2.js 場面4）の「集まる→打ち上がる」を、単独ページ用に組み直したもの
// 中心＝原点。カメラは本線と同じく中心から約17離れて見る。すべて自作。
import { THREE, SP, glowTex, makeRnd, clamp } from './base.js';

export const ease = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
export const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);

// 時計：読み込みから delay 秒後に始まる。画面をクリックすると最初から（リンクとボタンは除く）
export function clock(delay = 0.8) {
  const c = { t0: delay, ep: 0, now: 0 };
  addEventListener('pointerdown', (e) => { if (e.target.closest('a,button')) return; c.t0 = c.now + 0.3; c.ep++; });
  c.tau = (st) => { c.now = st.t; return st.t - c.t0; };
  return c;
}

const GT = { t: null };
export function mkGlow(s, c = 0xffffff, o = 1) {
  GT.t = GT.t || glowTex(128, 2.2);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: GT.t, color: c, transparent: true, opacity: o, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  sp.scale.setScalar(s); return sp;
}

// 光の柱：芯の細い柱＋外側のかすかな柱。uA＝明るさ、scale.y＝高さ
export function mkBeam(scene) {
  const mk = (r, k, soft) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 16, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0 }, uTop: { value: 1 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uA, uTop;
        void main(){ float rim=${soft ? 'pow(abs(dot(vN,vV)),2.)' : '1.'};
          float f=smoothstep(1.,.0,vUv.y)*smoothstep(0.,.03,vUv.y+.03)*smoothstep(uTop,uTop-.08,vUv.y);
          gl_FragColor=vec4(vec3(1.,.42,.18)*${k.toFixed(2)}*uA*f*rim,1.); }`,
    }));
    m.scale.set(1, 0.001, 1); m.frustumCulled = false; scene.add(m); return m;
  };
  const a = mk(0.05, 3.2, false), b = mk(0.3, 0.05, true);
  return {
    set(h, A, top = 1) { [a, b].forEach((m) => { m.scale.y = Math.max(0.001, h); m.material.uniforms.uA.value = A; m.material.uniforms.uTop.value = top; }); },
  };
}

// 本線のつなぎ：左下手前から芯へ入ってくる朱い線（ここでは控えめに）
export function mkLine(scene, k = 1.1) {
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-34, -15, 14), new THREE.Vector3(-16, -7.5, 7), new THREE.Vector3(-6, -2.6, 2.6), new THREE.Vector3(0, 0, 0)]);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 0.035, 8, false), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uA: { value: 1 }, uT: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: `varying vec2 vUv; uniform float uA, uT; void main(){
      float pulse=.88+.12*sin(vUv.x*18.-uT*2.);
      gl_FragColor=vec4(vec3(1.,.42,.18)*${k.toFixed(2)}*uA*pulse*smoothstep(0.,.5,vUv.x),1.); }`,
  }));
  m.frustumCulled = false; scene.add(m); return m;
}

// 遠くのかすかな塵（奥行き）
export function mkDust(scene, n = SP ? 600 : 1500, seed = 91) {
  const rnd = makeRnd(seed), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([(rnd() * 2 - 1) * 60, (rnd() * 2 - 0.6) * 40, -15 - rnd() * 60], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  const m = new THREE.PointsMaterial({ color: 0x34373d, size: 1, sizeAttenuation: false, transparent: true, opacity: 1, depthWrite: false });
  const p = new THREE.Points(g, m); scene.add(p); return p;
}

// 本線と同じ収束の粒。uConv＝集まり具合、uRise＝打ち上げで上へ飛ぶ量、uHold＝止める（I）、uDim＝暗くする
export function mkConv(scene, n, seed = 4242) {
  const rnd = makeRnd(seed);
  const randDir = () => { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)); };
  const pos = new Float32Array(n * 3), jit = new Float32Array(n * 3), del = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = randDir(), r = 2.5 + Math.pow(rnd(), 0.7) * 15;
    pos.set([d.x * r, d.y * r * 0.75, d.z * r], i * 3);
    const j = randDir().multiplyScalar(Math.pow(rnd(), 2)); jit.set([j.x * 0.4, j.y * 0.4, j.z * 0.4], i * 3); del[i] = rnd();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aJit', new THREE.BufferAttribute(jit, 3)); g.setAttribute('aDel', new THREE.BufferAttribute(del, 1));
  const U = { uTime: { value: 0 }, uConv: { value: 0 }, uRise: { value: 0 }, uHold: { value: 0 }, uHT: { value: 0 }, uDim: { value: 1 }, uSq: { value: 0 }, uPx: { value: 1000 } };
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: U,
    vertexShader: `attribute vec3 aJit; attribute float aDel; uniform float uTime, uConv, uRise, uHold, uHT, uDim, uSq, uPx; varying vec3 vC; varying float vA;
      void main(){
        float tt=mix(uTime,uHT,uHold);
        float k=clamp(uConv*1.45-aDel*.45,0.,1.); k=k*k*(3.-2.*k);
        vec3 rel=position;
        float ang=tt*.06+k*k*(2.5+aDel*3.);
        float s=sin(ang), c=cos(ang); rel.xz=mat2(c,-s,s,c)*rel.xz;
        vec3 jitter=vec3(sin(tt*7.+aDel*90.),cos(tt*6.+aDel*70.),sin(tt*8.+aDel*30.))*.12*(1.-k);
        vec3 p=mix(rel+jitter*8.,aJit*(1.-uSq*.85),k);
        p.y+=uRise*pow(aDel,3.)*16.*k;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,uPx*(.022+.012*(1.-k))/-mv.z);
        vC=mix(vec3(.50,.58,.74),vec3(.92,.95,1.),k); vA=(.42+.58*k)*uDim*(1.-uSq*.985*k)*(1.-smoothstep(22.,40.,-mv.z)); }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }',
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; scene.add(p);
  return { U, p };
}

// 音：一度だけ鳴らす合図（時刻をまたいだら鳴る。リプレイで鳴らし直す）
export function cues(list) {
  let ep = -1, fired = new Set(), lastTau = -1e9;
  return (tau, epoch, out) => {
    if (epoch !== ep) { ep = epoch; fired = new Set(); lastTau = -1e9; }
    for (const [at, fn] of list) if (!fired.has(at) && tau >= at) { fired.add(at); if (tau - at < 0.25) fn(out); }
    lastTau = tau;
  };
}

// 打ち上げの音の部品
export const snd = {
  // 上へ抜ける風切り（帯域を f1→f2 へ）
  whoosh(out, f1, f2, dur, peak, dest) {
    const { ctx, nbuf } = out; const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.4; const g = ctx.createGain(); const t = ctx.currentTime;
    fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest || out.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  },
  // 低い一撃（f1→f2 へ落ちる正弦）
  kick(out, f1, f2, dur, peak, dest) {
    const { ctx } = out; const o = ctx.createOscillator(), g = ctx.createGain(); const t = ctx.currentTime; o.type = 'sine';
    o.frequency.setValueAtTime(f1, t); o.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || out.music); o.start(t); o.stop(t + dur + 0.05);
  },
  // 澄んだ鐘（倍音2つ・長い余韻は残響へ）
  bell(out, f, peak, dur, dest) {
    const { ctx } = out; const t = ctx.currentTime;
    [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([r, a]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f * r;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak * a, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / r ** 0.5);
      o.connect(g); g.connect(dest || out.music); if (out.verb) g.connect(out.verb); o.start(t); o.stop(t + dur + 0.05);
    });
  },
  // 鳴り続ける音（gain と frequency を外から動かす）
  hold(out, type, f, dest) {
    const { ctx } = out; const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f; g.gain.value = 0;
    o.connect(g); g.connect(dest || out.music); o.start(); return { o, g };
  },
};
