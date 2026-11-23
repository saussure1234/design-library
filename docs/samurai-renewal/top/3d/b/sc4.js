// 場面4「芯を押す」の部品（本線 main2.js に組み込む用・単体確認は c3d-sc4-j.html）
// 問い「では、SignalとNoiseを見極める要素はどこに存在するのでしょうか。」を画面中央に、その下の芯の位置に PRESS ボタン。
// 押す → 問いの Signal が朱に灯り、文はフェードアウト → ノイズの粒が芯へ集まる → 光の柱が打ち上がる
//      → 先端が上空のノイズの層に届いて朱い波紋が広がる → onNext()（本線は場面5へ送る）
// 文字の動き：初期の版（top-v2.html の場面4）と同じ。Noise は N・o・i・s・e が1文字ずつ形（Roboto Flex の幅・太さ・傾き）を変えながら揺れ・にじむ。
//            Signal は押すまで白、押した瞬間（見極めた時）に朱へ。
//
// 使い方：
//   const s4 = createScene4({ THREE, scene, center, camera, quality: 'pc' | 'sp', root, onNext, renderer?, layer? });
//   毎フレーム s4.update(t, dt, active)   … active＝場面4に居る間 true（false の間は group と文・ボタンを隠す。離れて0.6秒で最初に戻る）
//   毎フレーム s4.audio(SND.out(), level) … 音オフの時は out=null。level＝この場面の音量 0〜1
//   s4.reset() 最初に戻す／s4.dispose() 片付け
//   s4.lookUp … 0〜1。打ち上げを追ってカメラを少し見上げたい時の目安（使わなくても全部画面に収まる）
//   s4.press() … PRESS を押したのと同じ（確認・撮影用）／s4.setHover(0|1)／s4.tau（押してからの秒・押す前は -1）／s4.NEXT（onNext を呼ぶ秒）
// 大きさ：center＝芯の位置。上空の層は芯の上 7.2（スマホ 10）・半径約10。
//        カメラは芯から約17離れ、芯の上 2.6（スマホ 3.6）を見る（s4.lookTarget）と、芯が画面の下寄り（約67%）・層が上端近くに収まる（見上げなし。PC 縦画角46°／スマホ62°で確認）
//        問いは「芯の画面位置の 27%（スマホ 31%）上」に置くので、カメラが別の所を見ていても問いはボタンの上に来る
// root：画面全体を覆う DOM（position:fixed; inset:0 を想定）。中に問いとボタンを作る。ボタンは芯の位置を毎フレーム画面に投影して追従する
// layer：描画する層（本線は光の層 FX=1）。既定 1
export function createScene4({ THREE, scene, center, camera, quality = 'pc', root, onNext = () => {}, renderer = null, layer = 1 }) {
  const SP = quality === 'sp';
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const mix = (a, b, k) => a + (b - a) * k;
  const eOut = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 4242;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const randDir = () => { const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u); return new THREE.Vector3(s * Math.cos(a), u, s * Math.sin(a)); };

  // 時間の割り振り（押してからの秒）
  const L = 1.3, RISE = 0.55, HIT = L + RISE, NEXT = HIT + 0.9;
  const CORE_Y = 0, SKY = SP ? 10 : 7.2, SKY_R = 10.5, LIFT = SP ? 3.6 : 2.6;   // 芯＝center。層は芯の上 SKY。LIFT＝カメラの見る点を芯から上げる量の目安

  const group = new THREE.Group(); group.position.copy(center); scene.add(group);
  const geos = [], mats = [], texs = [];
  const add = (o) => { o.traverse((c) => c.layers.set(layer)); group.add(o); return o; };

  // 発光の丸
  const gc = document.createElement('canvas'); gc.width = gc.height = 128; { const x = gc.getContext('2d'); const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); for (let i = 0; i <= 10; i++) { const r = i / 10; g.addColorStop(r, `rgba(255,255,255,${Math.pow(1 - r, 2.2)})`); } x.fillStyle = g; x.fillRect(0, 0, 128, 128); }
  const glowTex = new THREE.CanvasTexture(gc); glowTex.colorSpace = THREE.SRGBColorSpace; texs.push(glowTex);
  const mkGlow = (c) => { const m = new THREE.SpriteMaterial({ map: glowTex, color: c, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, fog: false }); mats.push(m); return add(new THREE.Sprite(m)); };

  // ---------- ノイズの粒（芯へ集まり、打ち上げで一部が昇る） ----------
  const PX = { value: 1000 };
  const CU = { uTime: { value: 0 }, uConv: { value: 0 }, uRise: { value: 0 }, uPx: PX, uC: { value: new THREE.Vector3(0, CORE_Y, 0) } };
  {
    const n = SP ? 4200 : 13000, pos = new Float32Array(n * 3), jit = new Float32Array(n * 3), del = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = randDir(), r = 2.5 + Math.pow(rnd(), 0.7) * 15;
      pos.set([d.x * r, CORE_Y + d.y * r * 0.75, d.z * r], i * 3);
      const j = randDir().multiplyScalar(Math.pow(rnd(), 2)); jit.set([j.x * 0.4, j.y * 0.4, j.z * 0.4], i * 3); del[i] = rnd();
    }
    const g = new THREE.BufferGeometry(); geos.push(g);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aJit', new THREE.BufferAttribute(jit, 3)); g.setAttribute('aDel', new THREE.BufferAttribute(del, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: CU, fog: false,
      vertexShader: `attribute vec3 aJit; attribute float aDel; uniform float uTime, uConv, uRise, uPx; uniform vec3 uC; varying vec3 vC; varying float vA;
        void main(){
          float k=clamp(uConv*1.45-aDel*.45,0.,1.); k=k*k*(3.-2.*k);
          vec3 rel=position-uC;
          float ang=uTime*.06+k*k*(2.5+aDel*3.); float s=sin(ang), c=cos(ang); rel.xz=mat2(c,-s,s,c)*rel.xz;
          vec3 jitter=vec3(sin(uTime*7.+aDel*90.),cos(uTime*6.+aDel*70.),sin(uTime*8.+aDel*30.))*.12*(1.-k);
          vec3 p=uC+mix(rel+jitter*8.,aJit,k);
          p.y+=uRise*pow(aDel,3.)*12.*k;
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=max(1.,uPx*(.022+.012*(1.-k))/-mv.z);
          vC=mix(vec3(.50,.58,.74),vec3(.92,.95,1.),k); vA=(.42+.58*k)*(1.-smoothstep(22.,40.,-mv.z))*smoothstep(1.5,4.,-mv.z); }`,
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }',
    }); mats.push(m);
    const p = new THREE.Points(g, m); p.frustumCulled = false; add(p);
  }

  // ---------- 光の柱（細い芯＋外側のかすかな柱） ----------
  const beams = [[0.05, 3.2, false], [0.3, 0.05, true]].map(([r, k, soft]) => {
    const g = new THREE.CylinderGeometry(r, r, 1, 16, 1, true).translate(0, 0.5, 0); geos.push(g);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uA: { value: 0 } }, fog: false,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
      fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uA;
        void main(){ float rim=${soft ? 'pow(abs(dot(vN,vV)),2.)' : '1.'}; float f=smoothstep(1.,0.,vUv.y);
          gl_FragColor=vec4(vec3(1.,.42,.18)*${k.toFixed(2)}*uA*f*rim,1.); }`,
    }); mats.push(m);
    const b = new THREE.Mesh(g, m); b.position.y = CORE_Y; b.scale.y = 0.001; b.frustumCulled = false; return add(b);
  });
  const core = mkGlow(0xff7a4a), coreW = mkGlow(0xffffff), flash = mkGlow(0xffffff), head = mkGlow(0xffd2b8), headW = mkGlow(0xffffff), hitG = mkGlow(0xff7a4a);
  [core, coreW, flash].forEach((s) => s.position.set(0, CORE_Y, 0)); hitG.position.set(0, SKY, 0);

  // ---------- 上空のノイズの層と波紋 ----------
  const SU = { uT: { value: 0 }, uR: { value: -10 }, uW: { value: 0 }, uPx: PX, uCalm: { value: 0 }, uVis: { value: 0 } };
  {
    const n = SP ? 4000 : 9000, a = new Float32Array(n * 3), r4 = new Float32Array(n);
    for (let i = 0; i < n; i++) { const r = Math.pow(rnd(), 0.6) * SKY_R, th = rnd() * Math.PI * 2; a.set([Math.cos(th) * r, SKY + (rnd() - 0.5) * 0.4, Math.sin(th) * r], i * 3); r4[i] = rnd(); }
    const g = new THREE.BufferGeometry(); geos.push(g); g.setAttribute('position', new THREE.BufferAttribute(a, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r4, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: SU, fog: false,
      vertexShader: `attribute float aR; uniform float uT, uR, uW, uPx, uCalm, uVis; varying vec3 vC; varying float vA;
        void main(){
          vec3 p=position; float d=length(p.xz);
          float ch=1.-uCalm*smoothstep(uR,uR-3.,d);
          p+=vec3(sin(uT*2.3+aR*40.),sin(uT*3.1+aR*70.)*.6,cos(uT*2.7+aR*55.))*.1*ch;
          float w=exp(-pow((d-uR)/.8,2.))*uW;
          p.y+=w*.45;
          vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
          gl_PointSize=max(1.5,uPx*(.04+.05*w)/-mv.z);
          float fl=.55+.45*step(.35,fract(sin(aR*91.+floor(uT*9.+aR*7.))*43758.5));
          float warm=uCalm*smoothstep(uR,uR-3.,d)*.35;
          vC=mix(mix(vec3(.46,.5,.58)*mix(fl,1.,1.-ch), vec3(1.,.42,.18)*.9, warm), vec3(1.,.42,.18)*2.2, clamp(w,0.,1.));
          vA=uVis*(.55+.9*w)*smoothstep(SKY_R_,SKY_R_*.65,d)*smoothstep(4.,9.,-mv.z); }`.replace(/SKY_R_/g, SKY_R.toFixed(1)),
      fragmentShader: 'varying vec3 vC; varying float vA; void main(){ float r=length(gl_PointCoord-.5); gl_FragColor=vec4(vC*smoothstep(.5,0.,r)*vA,1.); }',
    }); mats.push(m);
    const p = new THREE.Points(g, m); p.frustumCulled = false; add(p);
  }
  const ringG = new THREE.RingGeometry(0.985, 1, 200, 1); geos.push(ringG);
  const ringM = new THREE.MeshBasicMaterial({ color: 0xff5a24, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }); mats.push(ringM);
  const ring = add(new THREE.Mesh(ringG, ringM)); ring.rotation.x = -Math.PI / 2; ring.position.y = SKY;

  // ---------- 文とボタン（root の中） ----------
  const css = document.createElement('style');
  css.textContent = `
.s4{position:absolute;inset:0;pointer-events:none}
.s4-q{position:absolute;left:50%;top:${SP ? 36 : 40}%;width:max-content;max-width:96vw;font-size:${SP ? '17px' : 'clamp(24px,2.4vw,36px)'};transform:translate(-50%,-50%);text-align:center;pointer-events:none}
.s4-q::before{content:"";position:absolute;inset:-50px -70px;background:radial-gradient(closest-side,rgba(0,0,0,.6),rgba(0,0,0,0));z-index:-1}
.s4-q .ln{display:block;white-space:nowrap}
.s4-q .t{margin:0;font-weight:500;line-height:1.75;letter-spacing:.05em;color:rgba(238,240,244,.95)}
.s4-q .nb{white-space:nowrap}
.s4-q em{font-style:normal}
.s4-q .sig,.s4-q .nz{font-family:"Roboto Flex",system-ui,sans-serif;letter-spacing:0;transition:color .5s}
.s4-q .sig{color:#fff}
.s4-q.locked .sig{color:#ff5a24;text-shadow:0 0 .5em rgba(255,90,36,.45)}
.s4-q .nz{color:rgba(239,232,216,.7)}
.s4-q .nz i{font-style:normal;display:inline-block;inline-size:.62em;text-align:center;animation:s4nzv 2.2s steps(7) infinite,s4jit 1.7s steps(5) infinite}
.s4-q .nz i:nth-child(1){inline-size:.78em;animation-duration:2.6s,1.5s;animation-delay:-.3s,-.2s}
.s4-q .nz i:nth-child(2){animation-duration:1.9s,2.1s;animation-delay:-1.1s,-.7s}
.s4-q .nz i:nth-child(3){inline-size:.34em;animation-duration:2.4s,1.3s;animation-delay:-.6s,-1s}
.s4-q .nz i:nth-child(4){inline-size:.56em;animation-duration:1.7s,1.9s;animation-delay:-1.5s,-.4s}
.s4-q .nz i:nth-child(5){animation-duration:2.9s,1.6s;animation-delay:-.8s,-1.2s}
@keyframes s4jit{0%{transform:translate(0,0) rotate(0);filter:blur(0);opacity:1}20%{transform:translate(.08em,-.14em) rotate(7deg);filter:blur(1.4px);opacity:.75}40%{transform:translate(-.06em,.1em) rotate(-5deg);filter:blur(.4px);opacity:.9}60%{transform:translate(.04em,.16em) rotate(3deg);filter:blur(1.8px);opacity:.62}80%{transform:translate(-.1em,-.05em) rotate(-8deg);filter:blur(.8px);opacity:.8}100%{transform:translate(0,0) rotate(0);filter:blur(0);opacity:1}}
@keyframes s4nzv{0%{font-variation-settings:"wdth" 25,"wght" 900,"slnt" 0,"opsz" 144}25%{font-variation-settings:"wdth" 140,"wght" 140,"slnt" -10,"opsz" 144}50%{font-variation-settings:"wdth" 60,"wght" 1000,"slnt" -4,"opsz" 144}75%{font-variation-settings:"wdth" 120,"wght" 300,"slnt" -10,"opsz" 144}100%{font-variation-settings:"wdth" 25,"wght" 900,"slnt" 0,"opsz" 144}}
@media (prefers-reduced-motion:reduce){.s4-q .nz i{animation:none}}
.s4-btn{position:absolute;left:0;top:0;display:grid;place-items:center;width:84px;height:84px;margin:-42px 0 0 -42px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;color:#fff;pointer-events:auto;-webkit-tap-highlight-color:transparent;transition:opacity .5s}
.s4-btn .rg{position:absolute;inset:0;border-radius:50%;border:1.5px solid rgba(255,255,255,.6);transition:transform .5s cubic-bezier(.2,.8,.2,1),border-color .4s,opacity .4s}
.s4-btn .rg2{position:absolute;inset:-14px;border-radius:50%;border:1px solid rgba(255,90,36,0);animation:s4breathe 2.6s ease-in-out infinite}
@keyframes s4breathe{0%,100%{transform:scale(.92);border-color:rgba(255,90,36,0)}50%{transform:scale(1.04);border-color:rgba(255,90,36,.35)}}
.s4-btn .dt{width:13px;height:13px;border-radius:50%;background:#ff5a24;box-shadow:0 0 14px 3px rgba(255,90,36,.75);transition:transform .35s}
.s4-btn .lb{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:18px;white-space:nowrap;font:600 15px/1 "Space Grotesk","JetBrains Mono",system-ui,sans-serif;letter-spacing:.34em;padding:13px 22px 13px calc(22px + .34em);border:1px solid rgba(255,255,255,.75);border-radius:999px;background:rgba(255,90,36,.14);color:#fff;box-shadow:0 0 22px rgba(255,90,36,.35);animation:s4lb 2.2s ease-in-out infinite;transition:color .3s,opacity .3s,background .3s,border-color .3s}
@keyframes s4lb{0%,100%{box-shadow:0 0 14px rgba(255,90,36,.25)}50%{box-shadow:0 0 30px rgba(255,90,36,.6)}}
.s4-btn:hover .rg,.s4-btn.hov .rg,.s4-btn:focus-visible .rg{transform:scale(.62);border-color:rgba(255,90,36,.85)}
.s4-btn:hover .dt,.s4-btn.hov .dt{transform:scale(1.5)}
.s4-btn:hover .lb,.s4-btn.hov .lb{background:#ff5a24;border-color:#ff5a24}
.s4-btn:focus{outline:none}.s4-btn:focus-visible .rg2{border-color:rgba(255,255,255,.5)}
.s4.pressed .s4-btn{pointer-events:none}
.s4.pressed .s4-btn .rg{transform:scale(.08);opacity:0;transition-duration:1.1s}
.s4.pressed .s4-btn .rg2{animation:none;opacity:0}
.s4.pressed .s4-btn .lb{opacity:0}
.s4.pressed .s4-btn .dt{transform:scale(2.4)}
`;
  document.head.appendChild(css);
  const box = document.createElement('div'); box.className = 's4';
  box.innerHTML = '<div class="s4-q"><p class="t"><span class="ln">では、<em class="sig">Signal</em>と<em class="nz"><i>N</i><i>o</i><i>i</i><i>s</i><i>e</i></em>を見極める要素は</span><span class="ln">どこに存在するのでしょうか。</span></p></div>'
    + '<button class="s4-btn" type="button" aria-label="PRESS（次の場面へ進む）"><span class="rg2"></span><span class="rg"></span><span class="dt"></span><span class="lb">PRESS</span></button>';
  root.appendChild(box);
  const qEl = box.querySelector('.s4-q'), btn = box.querySelector('.s4-btn'), dot = btn.querySelector('.dt');

  // ---------- 状態 ----------
  const S = { t: 0, pT: null, hov: 0, hovS: 0, nextDone: false, offT: 0, ep: 0, lastOut: null, level: 1 };
  const sndOut = () => (window.SND?.out ? window.SND.out() : S.lastOut) || null;
  function press() {
    if (S.pT != null) return; S.pT = S.t; S.ep++; box.classList.add('pressed');
    const o = sndOut(); if (o) { const k = S.level; burst(o, 0.12 * k, 0.03, 'highpass', 3000, 0.8); tone(o, mtof(88), 0.05 * k, 0.002, 0.25, 'sine'); kick(o, 90, 50, 0.25, 0.18 * k); }
  }
  function setHover(v) {
    if (v && !S.hov && S.pT == null) { const o = sndOut(); if (o) { const k = S.level; whoosh(o, 500, 1400, 0.7, 0.05 * k); tone(o, mtof(76), 0.03 * k, 0.03, 0.9, 'sine', o.music, mtof(81)); } }
    S.hov = v ? 1 : 0;
  }
  function reset() { S.pT = null; S.nextDone = false; box.classList.remove('pressed'); qEl.classList.remove('locked'); }
  btn.addEventListener('click', (e) => { e.stopPropagation(); press(); });
  btn.addEventListener('pointerenter', () => setHover(1)); btn.addEventListener('pointerleave', () => setHover(0));
  btn.addEventListener('focus', () => setHover(1)); btn.addEventListener('blur', () => setHover(0));

  const _v = new THREE.Vector3();
  const api = { group, NEXT, tau: -1, lookUp: 0, lookTarget: center.clone().add(new THREE.Vector3(0, LIFT, 0)), press, setHover, reset };

  function update(t, dt, active) {
    S.t = t;
    group.visible = !!active;
    box.style.visibility = active ? 'visible' : 'hidden';
    if (!active) { if (S.pT != null && (S.offT += dt) > 0.6) reset(); return; }
    S.offT = 0;
    const tau = S.pT == null ? -1 : t - S.pT; api.tau = tau;
    S.hovS += (S.hov - S.hovS) * Math.min(1, dt * 5);
    btn.classList.toggle('hov', S.hov > 0 && tau < 0);
    PX.value = (renderer ? renderer.getPixelRatio() : Math.min(devicePixelRatio || 1, 1.5)) * innerHeight * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // 集まる → 打ち上げ
    const c = Math.max(0.12 * S.hovS, sstep(0, 1.2, tau));
    CU.uTime.value = t; CU.uConv.value = c; CU.uRise.value = sstep(L - 0.5, L + 0.4, tau);
    const a0 = Math.max(0, tau - L), post = tau >= L;
    const u = a0 / RISE, top = SKY - CORE_Y;
    const hy = !post ? 0 : (u < 1 ? top * Math.pow(u, 1.4) : Math.min(40, top + 30 * (tau - HIT)));
    const on = sstep(L - 0.05, L + 0.2, tau);
    beams.forEach((b) => { b.scale.y = hy + 0.001; b.material.uniforms.uA.value = on * (1 + 0.7 * Math.exp(-a0 * 3)); });
    head.position.y = headW.position.y = CORE_Y + hy;
    const hv = on * (1 - sstep(HIT + 0.5, HIT + 1.8, tau));
    head.material.opacity = hv * 0.9; headW.material.opacity = hv; head.scale.setScalar(1.2 + Math.exp(-a0 * 4)); headW.scale.setScalar(0.6);
    const cc = sstep(0.2, 1.2, tau);
    core.scale.setScalar(post ? 3 : 0.5 + cc * 3.4 + Math.sin(t * 8) * 0.2 * cc); core.material.opacity = post ? 1 : Math.max(0.25, cc);
    coreW.scale.setScalar(post ? 1.3 : 0.25 + cc * 1.3); coreW.material.opacity = post ? 1 : Math.max(0.2, cc);
    const fl = post ? Math.exp(-a0 * 4) : 0; flash.scale.setScalar(2 + 5 * (1 - fl)); flash.material.opacity = fl * 0.55;
    // 上空の層：押す前はごくかすか、打ち上げで見えてくる
    const a = Math.max(0, tau - HIT), hit = tau >= HIT;
    SU.uT.value = t; SU.uVis.value = 0.35 + 0.65 * sstep(L, HIT, tau);
    SU.uR.value = hit ? Math.min(SKY_R, 7 * Math.pow(a, 0.8)) : -10; SU.uW.value = hit ? Math.exp(-a * 0.5) : 0; SU.uCalm.value = hit ? 1 - sstep(4, 9, a) * 0.6 : 0;
    hitG.material.opacity = hit ? Math.exp(-a * 1.8) : 0; hitG.scale.setScalar(2.5 + a * 6);
    ring.scale.setScalar(Math.max(0.01, SU.uR.value)); ringM.opacity = hit ? 0.3 * Math.exp(-a * 1.3) : 0;
    api.lookUp = sstep(L - 0.1, HIT + 0.3, tau);
    // 文：押した瞬間 Signal が朱に灯り、少し置いて消える
    qEl.classList.toggle('locked', tau >= 0);
    qEl.style.opacity = (1 - sstep(0.45, 1.25, tau)).toFixed(3);
    dot.style.opacity = (1 - sstep(0.7, 1.05, tau)).toFixed(3);   // 押した点は、粒が集まりきる頃に3Dの芯へ溶ける
    // ボタンを芯の位置へ（画面に投影）
    _v.set(0, CORE_Y, 0).add(group.position).project(camera);
    const bx = (_v.x + 1) / 2 * innerWidth, by = (1 - _v.y) / 2 * innerHeight;
    btn.style.transform = `translate(${bx.toFixed(1)}px,${by.toFixed(1)}px)`;
    qEl.style.top = Math.max(innerHeight * 0.16, by - innerHeight * (SP ? 0.31 : 0.27)).toFixed(1) + 'px';
    if (!S.nextDone && tau >= NEXT) { S.nextDone = true; onNext(); }
    S.c = c; S.tau = tau;
  }

  // ---------- 音 ----------
  // 押す前：ごく小さい息。押してから：集まるうなり → 打ち上げ（低い一撃＋上へ抜ける風切り＋短い鐘）→ 層に届く（遠い鐘2音＋きらめき）→ 次へ（下へ抜ける空気）
  function tone(o, f, peak, a, d, type = 'sine', dest, f2) { const { ctx } = o; const x = ctx.createOscillator(), g = ctx.createGain(); x.type = type; x.frequency.value = f; const t = ctx.currentTime; if (f2) x.frequency.exponentialRampToValueAtTime(f2, t + a + d); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); x.connect(g); g.connect(dest || o.sfx); x.start(t); x.stop(t + a + d + 0.05); }
  function burst(o, peak, dur, type, f, q) { const { ctx, nbuf } = o; const s = ctx.createBufferSource(); s.buffer = nbuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = ctx.createGain(); const t = ctx.currentTime; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.004 + dur); s.connect(fl); fl.connect(g); g.connect(o.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  function whoosh(o, f1, f2, dur, peak) { const { ctx, nbuf } = o; const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.4; const g = ctx.createGain(); const t = ctx.currentTime; fl.frequency.setValueAtTime(f1, t); fl.frequency.exponentialRampToValueAtTime(f2, t + dur); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + dur * 0.18); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(o.sfx); s.start(t, Math.random()); s.stop(t + dur + 0.05); }
  function kick(o, f1, f2, dur, peak) { const { ctx } = o; const x = ctx.createOscillator(), g = ctx.createGain(); const t = ctx.currentTime; x.frequency.setValueAtTime(f1, t); x.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.6); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); x.connect(g); g.connect(o.music); x.start(t); x.stop(t + dur + 0.05); }
  function bell(o, f, peak, dur) { const { ctx } = o; const t = ctx.currentTime; [[1, 1], [2.76, 0.35], [5.4, 0.12]].forEach(([r, k]) => { const x = ctx.createOscillator(), g = ctx.createGain(); x.frequency.value = f * r; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(peak * k, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + dur / Math.sqrt(r)); x.connect(g); g.connect(o.music); if (o.verb) g.connect(o.verb); x.start(t); x.stop(t + dur + 0.05); }); }
  let au = null;
  function audio(out, level = 1) {
    S.lastOut = out; S.level = level;
    if (!out) return;
    if (!au || au.ctx !== out.ctx) {
      const { ctx, nbuf } = out;
      const bus = ctx.createGain(); bus.gain.value = 0; bus.connect(out.music);
      const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 300; fl.Q.value = 1.2;
      const rg = ctx.createGain(); rg.gain.value = 0; s.connect(fl); fl.connect(rg); rg.connect(bus); s.start();
      const dr = ctx.createOscillator(); dr.frequency.value = mtof(50); const dg = ctx.createGain(); dg.gain.value = 0; dr.connect(dg); dg.connect(bus); dr.start();
      const hm = ctx.createOscillator(); hm.type = 'triangle'; hm.frequency.value = mtof(62); const hg = ctx.createGain(); hg.gain.value = 0; hm.connect(hg); hg.connect(bus); hm.start();
      au = { ctx, bus, fl, rg, dr, dg, hg, nodes: [s, dr, hm], ep: -1, fired: new Set() };
    }
    const t = au.ctx.currentTime, tau = S.tau ?? -1, c = S.c || 0, pre = tau < L ? 1 : 0;
    au.bus.gain.setTargetAtTime(level, t, 0.15);
    au.rg.gain.setTargetAtTime(tau >= 0 ? (0.04 + 0.24 * c) * pre : 0.015 + 0.03 * c, t, pre ? 0.12 : 0.06);
    au.fl.frequency.setTargetAtTime(300 + 2600 * c * c, t, 0.12); au.fl.Q.value = 1.2 + 8 * c;
    au.dg.gain.setTargetAtTime((tau >= 0 ? 0.04 + 0.05 * c : 0.02) * (tau >= NEXT ? 0.4 : 1), t, 0.4); au.dr.frequency.setTargetAtTime(mtof(50) * (1 + 0.5 * c * pre), t, 0.3);
    au.hg.gain.setTargetAtTime(tau >= L ? 0.022 * (tau >= NEXT ? 0.5 : 1) : 0, t, 0.6);
    if (au.ep !== S.ep) { au.ep = S.ep; au.fired = new Set(); }
    const cue = (at, fn) => { if (tau >= at && !au.fired.has(at)) { au.fired.add(at); if (tau - at < 0.3) fn(); } };
    const k = level;
    cue(L, () => { kick(out, 110, 38, 1.6, 0.42 * k); whoosh(out, 260, 5200, 1.1, 0.32 * k); bell(out, mtof(76), 0.06 * k, 2.4); });
    cue(HIT, () => { bell(out, mtof(81), 0.11 * k, 6); setTimeout(() => au && au.ctx.state === 'running' && bell(out, mtof(88), 0.06 * k, 6), 160); whoosh(out, 7000, 1800, 3.2, 0.07 * k); kick(out, 70, 30, 2.2, 0.16 * k); });
    cue(NEXT, () => whoosh(out, 2200, 260, 1.9, 0.08 * k));
  }

  function dispose() {
    scene.remove(group); geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); texs.forEach((x) => x.dispose());
    box.remove(); css.remove();
    if (au) { au.nodes.forEach((n) => { try { n.stop(); } catch (e) { /* 既に止まっている */ } }); au.bus.disconnect(); au = null; }
  }
  return Object.assign(api, { update, audio, dispose });
}
