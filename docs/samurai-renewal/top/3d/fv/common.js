// FV 候補（c3d-fv-a〜c）の共通部品：場面1の頭の宇宙（岩・塵・朱の線）・3語の並び・場面1の文・音の小道具
// すべて自作。three.js 本体と公式 addons のみ。本線（main2.js）の作りを参考に簡易に再現。
import { THREE, SP, clamp, sstep, mix, stage, sfx, mtof, glowTex, makeRnd } from '../cand/base.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SND } from '../b/sound.js';
export { THREE, SP, clamp, sstep, mix, stage, sfx, mtof, glowTex, makeRnd, SND };
export const ease = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const V = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------- 場面1の頭：暗い宇宙・岩・塵・奥へ伸びる朱の線 ----------
export function createSpace(S, opt = {}) {
  const { scene } = S;
  const rnd = makeRnd(opt.seed ?? 20261124);
  const rr = (a, b) => a + (b - a) * rnd();
  const FOG = new THREE.Color().setRGB(0.0016, 0.0022, 0.0042);
  const FOGD = opt.fogD ?? 0.024;
  scene.fog = new THREE.FogExp2(FOG.clone(), FOGD);
  const U = { uT: { value: 0 }, uVis: { value: 0 }, uFogC: { value: FOG }, uFogD: { value: FOGD } };
  const root = new THREE.Group(); scene.add(root);
  const curve = new THREE.CatmullRomCurve3(opt.curve || [
    V(-1.2, -1.45, -5), V(-1.3, -1.1, -14), V(-1.9, -0.75, -28), V(-2.6, -0.35, -48), V(-3.0, 0.1, -74), V(-2.5, 0.6, -110), V(-0.9, 1.1, -160), V(0.4, 1.7, -240),
  ], false, 'catmullrom', 0.5);
  const fogGLSL = 'uniform vec3 uFogC; uniform float uFogD; float fogF(float d){ return 1.-exp(-pow(d*uFogD,2.)); }';

  // 背景：かすかな星雲と星（紺の1系統）
  {
    const m = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: U,
      vertexShader: 'varying vec3 vD; void main(){ vD=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: `varying vec3 vD; uniform float uT, uVis;
        float h(vec3 p){ return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453); }
        float n3(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }
        void main(){ vec3 d=normalize(vD);
          float nb=fbm(d*2.1+vec3(0.,0.,uT*.004)), nb2=fbm(d*5.3+vec3(3.1,1.7,uT*.002));
          vec3 c=vec3(.022,.040,.080)*pow(nb,2.1)*2.0 + vec3(.030,.046,.075)*pow(nb2,3.2)*1.4*smoothstep(.15,-.5,d.z);
          vec3 sp=d*380.; vec3 ce=floor(sp); float st=h(ce);
          if(st>.9972){ float tw=.6+.4*sin(uT*1.3+st*90.); c+=vec3(.55,.62,.78)*smoothstep(.45,.0,length(fract(sp)-.5))*tw*1.3; }
          gl_FragColor=vec4(c*uVis,1.); }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 40, 20), m); sky.renderOrder = -10; sky.frustumCulled = false;
    sky.onBeforeRender = (r, s, cam) => sky.position.copy(cam.position);
    root.add(sky);
  }
  // 光：冷たい白と青。朱は線の点光源だけ
  const key = new THREE.DirectionalLight(0xe8eef8, 0.75); key.position.set(-1, 1.3, 0.7); root.add(key);
  const rim = new THREE.DirectionalLight(0x8fb0e6, 1.25); rim.position.set(0.6, 0.4, -1); root.add(rim);
  const sigLight = new THREE.PointLight(0xff5a24, 0, 16, 1.8); root.add(sigLight);

  // 岩（v2 の岩モデル。読めなければ多面体）
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x5d6677, roughness: 0.9, metalness: 0.06 });
  rockMat.onBeforeCompile = (sh) => {
    sh.uniforms.uVis = U.uVis;
    sh.fragmentShader = 'uniform float uVis;\n' + sh.fragmentShader.replace('#include <opaque_fragment>',
      `{ float rr=pow(1.-clamp(abs(dot(normal,normalize(vViewPosition))),0.,1.),2.8); outgoingLight+=vec3(.05,.085,.17)*rr; }
       outgoingLight*=uVis;
       #include <opaque_fragment>`);
  };
  const distToCurve = (() => { const pts = curve.getSpacedPoints(300); return (p) => { let m = 1e9; for (const s of pts) { const d = s.distanceToSquared(p); if (d < m) m = d; } return Math.sqrt(m); }; })();
  const camLine = opt.camClear || ((p) => Math.hypot(p.x, p.y) < 2.2 && p.z > -16);
  const scatter = (geos, n, rMin, rMax, sMin, sMax, clear) => {
    const dummy = new THREE.Object3D(), per = Math.ceil(n / geos.length);
    geos.forEach((g) => {
      const m = new THREE.InstancedMesh(g, rockMat, per); let i = 0, tries = 0;
      while (i < per && tries < per * 50) {
        tries++;
        const u = rr(0, 1), base = curve.getPoint(u); base.z += rr(-6, 10);
        const a = rr(0, 6.283), r = rMin + Math.pow(rnd(), 1.4) * (rMax - rMin);
        const p = base.add(V(Math.cos(a) * r, Math.sin(a) * r * 0.75, rr(-3, 3)));
        if (distToCurve(p) < clear || camLine(p) || p.z > 4) continue;
        dummy.position.copy(p); dummy.rotation.set(rr(0, 6.3), rr(0, 6.3), rr(0, 6.3));
        const s = sMin + Math.pow(rnd(), 3) * (sMax - sMin) * (0.4 + 0.6 * clamp(distToCurve(p) / 16));
        const sn = s * clamp((-p.z + 2) / 22, 0.25, 1);
        dummy.scale.set(sn * rr(.7, 1.3), sn * rr(.7, 1.3), sn * rr(.7, 1.3)); dummy.updateMatrix(); m.setMatrixAt(i++, dummy.matrix);
      }
      m.count = i; m.instanceMatrix.needsUpdate = true; m.frustumCulled = false; root.add(m); rocks.push(m);
    });
  };
  const rocks = [];
  const unitize = (g, r) => { g.computeBoundingBox(); const c = new THREE.Vector3(), s = new THREE.Vector3(); g.boundingBox.getCenter(c); g.translate(-c.x, -c.y, -c.z); g.computeBoundingBox(); g.boundingBox.getSize(s); const k = 2 * r / Math.max(s.x, s.y, s.z); g.scale(k, k, k); return g; };
  const geoOf = (o) => { if (!o) return null; o.updateWorldMatrix(true, true); const ms = []; o.traverse((c) => { if (c.isMesh) ms.push(c); }); if (!ms.length) return null; ms.sort((a, b) => b.geometry.attributes.position.count - a.geometry.attributes.position.count); const g = ms[0].geometry.clone(); if (!g.attributes.normal) g.computeVertexNormals(); g.userData.mat = ms[0].material; return g; };
  const nR = SP ? 110 : 260, nS = SP ? 320 : 900;
  const ready = new Promise((res) => {
    new GLTFLoader().load('3d/b/v2/rocks.glb', (gl) => {
      const find = (n) => { let r = null; gl.scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
      const rg = [], sg = [];
      for (let i = 0; i < 8; i++) { const g = geoOf(find('Rock_' + i)); if (g) { if (!rockMat.normalMap && g.userData.mat?.normalMap) { rockMat.normalMap = g.userData.mat.normalMap; rockMat.normalScale = new THREE.Vector2(1.2, 1.2); rockMat.needsUpdate = true; } rg.push(unitize(g, 1.05)); } }
      for (let i = 0; i < 6; i++) { const g = geoOf(find('Shard_' + i)); if (g) sg.push(unitize(g, 0.17)); }
      scatter(rg.length ? rg : [new THREE.IcosahedronGeometry(1, 1)], nR, 3.5, 34, 0.3, 3.4, 3.4);
      scatter(sg.length ? sg : [new THREE.TetrahedronGeometry(0.16, 0)], nS, 2.2, 24, 0.35, 1.6, 2.0);
      res();
    }, undefined, () => { scatter([new THREE.IcosahedronGeometry(1, 1)], nR, 3.5, 34, 0.3, 3.4, 3.4); res(); });
  });

  // 塵（3層の代わりに1層・距離で大きさ）
  {
    const n = SP ? 2200 : 6000, pos = new Float32Array(n * 3), sz = new Float32Array(n), sd = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos.set([rr(-40, 40), rr(-22, 22), rr(-170, 8)], i * 3); sz[i] = 0.02 + Math.pow(rnd(), 2.4) * 0.07; sd[i] = rnd(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); g.setAttribute('aSeed', new THREE.BufferAttribute(sd, 1));
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { ...U, uPx: { value: 1000 } },
      vertexShader: `attribute float aSize, aSeed; uniform float uT, uPx, uVis; varying float vA; ${fogGLSL}
        void main(){ vec3 p=position+vec3(sin(uT*.11+aSeed*40.),cos(uT*.09+aSeed*23.),0.)*.4; vec4 mv=modelViewMatrix*vec4(p,1.); float d=-mv.z;
          gl_Position=projectionMatrix*mv; gl_PointSize=max(aSize*uPx/max(d,.1),1.);
          vA=uVis*.42*(1.-fogF(d*.55))*smoothstep(.3,2.,d)*(.7+.3*sin(uT*(.8+aSeed)+aSeed*50.)); }`,
      fragmentShader: 'varying float vA; void main(){ float r=length(gl_PointCoord*2.-1.); if(r>1.) discard; gl_FragColor=vec4(vec3(.62,.71,.9)*pow(1.-r,1.6)*vA,1.); }',
    });
    const pts = new THREE.Points(g, m); pts.frustumCulled = false; root.add(pts); S.onResize?.((st) => { m.uniforms.uPx.value = st.px; });
    U.dustPx = m.uniforms.uPx;
  }

  // 朱の線（奥へ伸びる）
  const head = { value: 0 };
  const LU = { ...U, uHead: head };
  {
    const g = new THREE.TubeGeometry(curve, 1200, 0.026, 6, false);
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: LU,
      vertexShader: 'varying vec2 vUv; varying float vD; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vD=-mv.z; gl_Position=projectionMatrix*mv; }',
      fragmentShader: `varying vec2 vUv; varying float vD; uniform float uT, uHead; ${fogGLSL}
        void main(){ float x=vUv.x;
          float p=pow(max(0.,sin(x*260.-uT*5.)),24.)*1.6 + pow(max(0.,sin(x*41.-uT*2.2)),40.)*3.;
          float vis=smoothstep(uHead+.012,uHead-.004,x)*step(.002,uHead);
          vec3 c=vec3(1.,.30,.10)*(2.2+p*2.5)+vec3(1.,.8,.6)*p*.8;
          gl_FragColor=vec4(c*vis*(1.-fogF(vD)*.85)*mix(.35,1.,smoothstep(3.,10.,vD)),1.); }`,
    });
    const g2 = new THREE.TubeGeometry(curve, 600, 0.2, 8, false);
    const m2 = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: LU,
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalMatrix*normal; vV=-mv.xyz; gl_Position=projectionMatrix*mv; }',
      fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uHead; ${fogGLSL}
        void main(){ float f=abs(dot(normalize(vN),normalize(vV))); float vis=smoothstep(uHead+.012,uHead-.004,vUv.x)*step(.002,uHead);
          gl_FragColor=vec4(vec3(1.,.28,.08)*pow(f,3.)*.22*vis*(1.-fogF(length(vV))*.85)*smoothstep(3.,12.,length(vV)),1.); }`,
    });
    root.add(new THREE.Mesh(g, m)); root.add(new THREE.Mesh(g2, m2));
  }
  const gt = glowTex(128, 2.2);
  const glow = (s, c) => { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: gt, color: c, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); sp.scale.setScalar(s); root.add(sp); return sp; };
  const hGlow = glow(2.4, 0xffb08a), hCore = glow(0.7, 0xffffff);

  return {
    root, curve, U, ready, rocks,
    /** vis＝宇宙の明るさ（0〜1）、hd＝線の先端（0〜1）、t＝秒 */
    update(vis, hd, t) {
      U.uT.value = t; U.uVis.value = vis; head.value = hd;
      const hp = curve.getPointAt(clamp(hd, 0, 1));
      const on = hd > 0.003 ? 1 : 0;
      hGlow.position.copy(hp); hCore.position.copy(hp);
      const fl = (0.85 + 0.15 * Math.sin(t * 9.0)) * sstep(3, 14, hp.distanceTo(S.camera.position));   // 手前では光を抑える（オレンジの大きな光から始めない）
      hGlow.material.opacity = on * 0.85 * fl; hCore.material.opacity = on * fl;
      sigLight.position.copy(hp); sigLight.intensity = on * 24;
      key.intensity = 0.75 * vis; rim.intensity = 1.25 * vis;
    },
  };
}

// ---------- 3語：1列にそろった位置（本線 fvLayout と同じ寸法） ----------
export function layoutWords(ws, sum) {
  const W = innerWidth, H = innerHeight, sp = W <= 820;
  ws.forEach((w) => { w.style.fontSize = '100px'; w.style.transform = 'none'; });
  const wid = ws.map((w) => w.offsetWidth), gap = 28, total = wid[0] + wid[1] + wid[2] + gap * 2;
  const target = sp ? W * 0.9 : Math.min(W * 0.72, 1100);
  const F = 100 * target / total; ws.forEach((w) => { w.style.fontSize = F + 'px'; });
  const k = F / 100, wF = wid.map((v) => v * k), gF = gap * k, tot = wF[0] + wF[1] + wF[2] + gF * 2, x0 = (W - tot) / 2, yB = H * 0.42 - F * 0.5;
  const B = [{ x: x0, y: yB }, { x: x0 + wF[0] + gF, y: yB }, { x: x0 + wF[0] + wF[1] + gF * 2, y: yB }];
  if (sum) sum.style.top = (yB + F * 1.32) + 'px';
  return { F, B, wF, yB, W, H, sp };
}

// ---------- 場面1の文：1文字ずつ出る ----------
export function scene1Text() {
  const el = document.getElementById('tx1');
  const t = el.querySelector('.t');
  const chars = [];
  const walk = (n) => {
    [...n.childNodes].forEach((c) => {
      if (c.nodeType === 3) { const f = document.createDocumentFragment(); [...c.textContent].forEach((ch) => { const s = document.createElement('span'); s.className = 'c'; s.textContent = ch; f.appendChild(s); chars.push(s); }); n.replaceChild(f, c); }
      else if (c.nodeType === 1) walk(c);
    });
  };
  walk(t);
  let shown = -1;
  return (k) => {
    el.style.opacity = sstep(0, 0.08, k);
    el.style.transform = (innerWidth <= 820 ? '' : 'translateY(-50%) ') + `translateY(${(1 - easeOut(k * 3)) * 16}px)`;
    const n = Math.round(clamp(k) * chars.length);
    if (n === shown) return; shown = n;
    chars.forEach((c, i) => { c.style.opacity = i < n ? 1 : 0; });
  };
}

// ---------- 音の小道具 ----------
// 3語がそろった瞬間：澄んだ2音＋低いふくらみ（本線の「ピロン」と同じ高さ）
export function lockSound(out, k = 1) {
  if (!out) return;
  sfx.tone(out, mtof(81), 0.08 * k, 0.004, 2.4, 'sine', out.music);
  setTimeout(() => SND.out() && sfx.tone(out, mtof(88), 0.05 * k, 0.004, 2.8, 'sine', out.music), 140);
  sfx.tone(out, mtof(45), 0.09 * k, 0.03, 1.6, 'sine', out.music, mtof(45) * 0.98);
}
// 宇宙へ抜ける：低い響き＋上がる風
export function openSound(out, up = true) {
  if (!out) return;
  const { ctx, nbuf } = out, t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
  const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.6;
  fl.frequency.setValueAtTime(up ? 260 : 2600, t); fl.frequency.exponentialRampToValueAtTime(up ? 3200 : 240, t + 1.8);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
  s.connect(fl); fl.connect(g); g.connect(out.sfx); s.start(t); s.stop(t + 2.5);
  sfx.tone(out, 55, 0.12, 0.05, 2.2, 'sine', out.music, 41);
}
// しきい値をまたいだ時だけ1回（戻れば再び鳴る）
export function edge() { let was = false; return (v) => { const r = v && !was; was = v; return r; }; }
