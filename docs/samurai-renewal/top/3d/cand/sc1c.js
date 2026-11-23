// 場面1・案C「手渡しの列が速くなる」
// 一列に並んだ人が、朱い灯り（＝誰かの役に立つ営み）を、隣の人へ一つずつ手渡していく。人は受け取って少し抱え、ふわりと渡す。
// その列の人が一人ずつ AI（黒い金属・目に一本の光）に置き換わる。AI の所では灯りは止まらず一瞬で通り抜ける。
// 置き換わるほど灯りの数と速さが増し、最後は列全体が一本の朱い光の流れ（本線の線）になる。
import { THREE, stage, SP, makeRnd, sstep, mix, mtof, sfx, NOISE, glowTex } from './base.js';
import { clock, cues, snd } from './sc4k.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S = stage({ fov: 36, fovSp: 54, bloom: [0.6, 0.45, 0.7], shift: { pc: [-0.15, 0.02], sp: [0, -0.16] }, exposure: 1, grain: 0.045, vig: 0.8 });
if (SP) S.bloom.strength = 0.5;
const { scene, camera, renderer } = S;
const CK = clock(0.6);
const NF = SP ? 6 : 8;            // 列の人数
const T0 = 3.0, DUR = 7.5;        // 置き換わりの始まりと長さ
const GAP = 1.05;

const gltf = await new Promise((res) => new GLTFLoader().load('3d/b/v2/people.glb', res, undefined, () => res(null)));
const find = (n) => { let r = null; gltf?.scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const meshOf = (o) => { let m = null; o?.traverse((c) => { if (!m && c.isMesh) m = c; }); return m; };
const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

// ---------- 列 ----------
const rnd = makeRnd(5150);
const SHIRT = [[.46, .43, .40], [.30, .36, .44], [.44, .38, .30], [.40, .40, .42], [.36, .30, .28]];
function hook(mat, u, isRobot, shirt, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uMix = u;
    sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP=position;');
    sh.fragmentShader = 'varying vec3 vOP; uniform float uMix;\n' + NOISE + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dv=vnoise(vOP*vec3(9.,9.,9.))*.7+vnoise(vOP*23.)*.3; float th=uMix*1.3-.15+(1.75-vOP.y)*.0;
        ${isRobot ? 'if(dv>th) discard;' : 'if(dv<th) discard;'}`)
      .replace('#include <color_fragment>', isRobot ? '#include <color_fragment>' : `#include <color_fragment>
        { float y=vOP.y; float hand=step(.21,abs(vOP.x))*step(.62,y)*step(y,.98);
          vec3 c = y>1.655 ? vec3(.055,.045,.04) : y>1.47 ? vec3(.70,.50,.40) : y>.93 ? vec3(${shirt.join(',')}) : y>.07 ? vec3(.14,.15,.18) : vec3(.05);
          if(hand>.5) c=vec3(.68,.48,.38);
          diffuseColor.rgb=c; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(.45,.75,1.2)*1.4*smoothstep(.035,.0,abs(dv-th))*step(.001,uMix)*step(uMix,.999);`);
  };
  mat.customProgramCacheKey = () => key;
}
const figs = [];
{
  const kinds = ['A', 'B', 'A', 'C', 'B', 'A', 'B', 'A'];
  for (let i = 0; i < NF; i++) {
    const k = kinds[i % kinds.length];
    const h = meshOf(find('Human_' + k)), r = meshOf(find('Robot_' + k)), gl = meshOf(find('Robot_' + k + '_Glow'));
    const u = { value: 0 };
    const g = new THREE.Group();
    const x = (i - (NF - 1) / 2) * GAP, z = Math.sin(i * 0.9) * 0.12;
    g.position.set(x, 0, z);
    g.rotation.y = 0.15 + (rnd() - 0.5) * 0.3;   // 前を向いて横一列（バケツリレーの形）
    if (h && r) {
      const hm = new THREE.MeshStandardMaterial({ roughness: 0.82 }); hook(hm, u, false, SHIRT[i % SHIRT.length], 'sc1c-h' + (i % SHIRT.length));
      const rm = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.24, metalness: 0.95, envMap: env, envMapIntensity: 0.5, vertexColors: !!r.geometry.attributes.color }); hook(rm, u, true, null, 'sc1c-r');
      g.add(new THREE.Mesh(h.geometry, hm), new THREE.Mesh(r.geometry, rm));
      if (gl) { const vm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe6ff).multiplyScalar(2.4), toneMapped: false, transparent: true, opacity: 0 }); g.add(new THREE.Mesh(gl.geometry, vm)); g.userData.visor = vm; }
    }
    scene.add(g);
    figs.push({ g, u, ts: 1e9, ph: rnd() * 6 });
  }
  // 置き換わる順：でたらめ。間隔はだんだん詰まる
  const ord = figs.map((_, i) => [i, rnd()]).sort((a, b) => a[1] - b[1]).map((a) => a[0]);
  ord.forEach((fi, k) => { figs[fi].ts = T0 + DUR * Math.sqrt((k + 0.6) / NF); });
}
// 灯りを受け渡す位置（胸の前）
const hold = (i) => { const f = figs[i].g; const d = new THREE.Vector3(Math.sin(f.rotation.y), 0, Math.cos(f.rotation.y)); return f.position.clone().addScaledVector(d, 0.28).setY(1.08); };
const P = []; P.push(hold(0).add(new THREE.Vector3(-GAP * 2.5, 0.15, 0.1)));
for (let i = 0; i < NF; i++) P.push(hold(i));
P.push(hold(NF - 1).add(new THREE.Vector3(GAP * 4, 0.4, -0.6)));

// 光：かすかな主光＋冷たい輪郭光
{
  const key = new THREE.SpotLight(0xffc49a, 10, 18, 0.7, 0.8, 1.3); key.position.set(-2, 4.2, 4); key.target.position.set(0, 1, 0); scene.add(key, key.target);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 0.7); rim.position.set(2.5, 2.4, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 0.35); rim2.position.set(-3, 1.6, -2.5); scene.add(rim2);
  scene.add(new THREE.AmbientLight(0xffffff, 0.035));
  // 床の光だまり（列に沿って）
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(NF * GAP + 3, 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x26262a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; scene.add(m);
}

// ---------- 灯り ----------
// 1つの灯りの道のり：生まれてから、各人のところで「抱える（人は長く・AIは一瞬）」→「次へ渡る（人はふわり・AIはまっすぐ速く）」
const isAI = (i, t) => i >= 1 && i <= NF && t > figs[i - 1].ts + 0.45;
const ent = { t: 0 };
function posAt(s, t, out) {
  // s＝生まれた時刻。P[0]→P[1]→…→P[NF+1]
  let tt = s, i = 0;
  if (t < s) return null;
  while (i < P.length - 1) {
    const ai = isAI(i, tt);
    const dwell = i === 0 ? 0 : (ai ? 0.03 : 0.85);
    if (t < tt + dwell) { out.copy(P[i]); if (!ai && i > 0) out.y += Math.sin((t - tt) * 5) * 0.012; out.w = i; return out; }
    tt += dwell;
    const aiN = isAI(i + 1, tt) || (i === 0 && isAI(1, tt)), aiC = ai || i === 0;
    const fast = (aiC && aiN) || (i === 0 && aiN) || (i === NF && ai);
    const hop = i === 0 ? (aiN ? 0.25 : 1.1) : (fast ? 0.09 : 0.6);
    if (t < tt + hop) {
      const k = (t - tt) / hop, e = fast ? k : k * k * (3 - 2 * k);
      out.copy(P[i]).lerp(P[i + 1], e); if (!fast) out.y += Math.sin(Math.PI * e) * 0.22; out.w = i + 0.5; return out;
    }
    tt += hop; i++;
  }
  return null;
}
const MAXL = 90, TR = 10;
const L = [];   // 生まれた時刻
const pg = new THREE.BufferGeometry();
const pp = new Float32Array(MAXL * TR * 3), pa = new Float32Array(MAXL * TR), ps = new Float32Array(MAXL * TR);
pg.setAttribute('position', new THREE.BufferAttribute(pp, 3)); pg.setAttribute('aA', new THREE.BufferAttribute(pa, 1)); pg.setAttribute('aS', new THREE.BufferAttribute(ps, 1));
const GU = { uTex: { value: glowTex(64, 1.6) }, uPx: { value: 1000 } };
const pts = new THREE.Points(pg, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, uniforms: GU,
  vertexShader: 'attribute float aA, aS; uniform float uPx; varying float vA; void main(){ vA=aA; vec4 mv=modelViewMatrix*vec4(position,1.); gl_Position=projectionMatrix*mv; gl_PointSize=aS*uPx*.11/-mv.z; }',
  fragmentShader: 'uniform sampler2D uTex; varying float vA; void main(){ float g=texture2D(uTex,gl_PointCoord).r; vec3 c=mix(vec3(1.,.353,.141),vec3(1.,.85,.7),pow(g,4.)*.8); gl_FragColor=vec4(c*g*vA,1.); }',
}));
pts.frustumCulled = false; scene.add(pts);
S.onResize((st) => { GU.uPx.value = st.px; }); GU.uPx.value = S.st.px;

const CAM = SP
  ? [[-6.0, 1.75, 4.6, 0.2, 1.0, 0], [-7.6, 2.5, 6.4, 0.6, 0.9, 0]]
  : [[-6.3, 1.5, 2.5, 0.2, 1.08, -0.2], [-7.6, 2.0, 4.3, 0.8, 0.98, 0]];
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
let nextSpawn = 0, lastEp = -1, events = { hand: 0, tick: 0, conv: 0 };
const v = new THREE.Vector3(); v.w = 0;
const prevW = new Map();
S.run((st) => {
  const tau = CK.tau(st); st.tau = tau; st.ep = CK.ep;
  if (CK.ep !== lastEp) { lastEp = CK.ep; L.length = 0; nextSpawn = -0.4; prevW.clear(); }
  // 置き換わり
  let nAI = 0;
  for (const f of figs) {
    const m = sstep(f.ts, f.ts + 0.9, tau); if (m > 0.5) nAI++;
    if (f.u.value < 0.5 && m >= 0.5) events.conv++;
    f.u.value = m;
    if (f.g.userData.visor) f.g.userData.visor.opacity = sstep(0.55, 1, m) * (0.85 + 0.15 * Math.sin(tau * 2.2));
    // 人はかすかに揺れる（呼吸・体重移動）。AI は止まる
    f.g.rotation.z = Math.sin(tau * 0.8 + f.ph) * 0.012 * (1 - m);
  }
  const fr = nAI / NF; st.fr = fr;
  // 灯りを生む：AI が増えるほど間隔が詰まる（スクショ用に時刻から決める）
  const iv = (x) => mix(2.3, 0.075, Math.pow(x, 1.3));
  if (window.__T != null) {   // 撮影：時刻から遡って並べ直す
    L.length = 0; let s = -0.4; while (s <= tau) { L.push(s); const fA = figs.filter((f) => f.ts + 0.45 < s).length / NF; s += iv(fA); }
  } else {
    while (nextSpawn <= tau) { L.push(nextSpawn); const fA = figs.filter((f) => f.ts + 0.45 < nextSpawn).length / NF; nextSpawn += iv(fA); }
  }
  // 描く
  let n = 0;
  const keep = [];
  for (const s of L) {
    const p0 = posAt(s, tau, v);
    if (!p0) continue;
    keep.push(s);
    const w = v.w, pw = prevW.get(s);
    if (pw != null && Math.floor(pw) !== Math.floor(w) && Number.isInteger(w) && w >= 1 && w <= NF) { if (isAI(w, tau)) events.tick++; else events.hand++; }
    prevW.set(s, w);
    for (let k = 0; k < TR && n < MAXL * TR; k++) {
      const q = posAt(s, tau - k * 0.016, v); if (!q) break;
      pp.set([v.x, v.y, v.z], n * 3); pa[n] = k === 0 ? 1 : 0.5 * (1 - k / TR); ps[n] = k === 0 ? 1 : 0.6; n++;
    }
  }
  if (keep.length < L.length && window.__T == null) { L.length = 0; L.push(...keep); }
  pg.setDrawRange(0, n); pg.attributes.position.needsUpdate = true; pg.attributes.aA.needsUpdate = true; pg.attributes.aS.needsUpdate = true;
  st.ev = events;
  const kc = eio(sstep(0.3, T0 + DUR + 1.5, tau)), a = CAM[0], b = CAM[1];
  camera.position.set(mix(a[0], b[0], kc) + st.mx * 0.5, mix(a[1], b[1], kc) - st.my * 0.3, mix(a[2], b[2], kc));
  camera.lookAt(mix(a[3], b[3], kc), mix(a[4], b[4], kc), mix(a[5], b[5], kc));
}, {
  chord: 3,
  base: () => ({ noise: 0.25, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(out) {
    const seen = { hand: 0, tick: 0, conv: 0 };
    const flow = sfx.loop(out, 'bandpass', 1800, 2.5, out.music);   // 灯りの流れ（増えるほど聞こえる）
    const HAND = [60, 62, 64, 67, 69].map(mtof);
    let lastTick = 0;
    return {
      update(s, o) {
        const t = o.ctx.currentTime, ev = s.ev || seen;
        flow.g.gain.setTargetAtTime(0.05 * Math.pow(s.fr || 0, 1.5), t, 0.3);
        if (ev.hand > seen.hand) { seen.hand = ev.hand; sfx.tone(o, HAND[(Math.random() * HAND.length) | 0], 0.03, 0.02, 0.9, 'triangle'); }
        if (ev.tick > seen.tick) { seen.tick = ev.tick; if (s.t - lastTick > 0.045) { lastTick = s.t; sfx.tone(o, 2600 + Math.random() * 600, 0.008, 0.001, 0.04, 'sine'); } }
        if (ev.conv > seen.conv) { seen.conv = ev.conv; snd.bell(o, mtof(88), 0.018, 1.8); }
      },
    };
  },
});
