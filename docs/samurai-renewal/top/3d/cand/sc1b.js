// 場面1・案B「ひとりの輪郭が組み替わる」
// 闇に立つひとりの人（あたたかい肌と服・かすかに呼吸している）。頭の上から一本の冷たい線が降りてきて、
// 線が通った所から人の表面が粒になってほどけ、同じ姿勢の AI（黒い金属・目に一本の光）に組み替わっていく。
// 先に頭（考えること）、次に手と体（実行すること）。寄りから始めて、終わりに全身まで引く。
import { THREE, stage, SP, makeRnd, sstep, mix, mtof, sfx, NOISE } from './base.js';
import { clock, mkGlow, cues, snd } from './sc4k.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const S = stage({ fov: 34, fovSp: 50, bloom: [0.55, 0.45, 0.82], shift: { pc: [-0.17, 0], sp: [0, -0.17] }, exposure: 1, grain: 0.045, vig: 0.8 });
if (SP) S.bloom.strength = 0.55;
const { scene, camera, renderer } = S;
const CK = clock(0.6);
const TS = 1.6, TE = 9.6;   // 線が頭から足まで降りる時間
const TOP = 1.8, BOT = -0.05;

const gltf = await new Promise((res) => new GLTFLoader().load('3d/b/v2/people.glb', res, undefined, () => res(null)));
const find = (n) => { let r = null; gltf?.scene.traverse((o) => { if (!r && o.name === n) r = o; }); return r; };
const meshOf = (o) => { let m = null; o?.traverse((c) => { if (!m && c.isMesh) m = c; }); return m; };
const hm = meshOf(find('Human_A')), rm = meshOf(find('Robot_A')), gm = meshOf(find('Robot_A_Glow'));

const env = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
const U = { uCut: { value: TOP + 0.2 }, uT: { value: 0 } };
const cutGLSL = `float cutN=uCut+(vnoise(vOP*vec3(18.,22.,18.))-.5)*.045;`;
function hook(mat, isRobot, key) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCut = U.uCut; sh.uniforms.uT = U.uT;
    sh.vertexShader = 'varying vec3 vOP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vOP=position;');
    sh.fragmentShader = 'varying vec3 vOP; uniform float uCut, uT;\n' + NOISE + sh.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        ${cutGLSL} ${isRobot ? 'if(vOP.y<cutN) discard;' : 'if(vOP.y>cutN) discard;'}`)
      .replace('#include <color_fragment>', isRobot ? '#include <color_fragment>' : `#include <color_fragment>
        { float y=vOP.y; float hand=step(.21,abs(vOP.x))*step(.62,y)*step(y,.98);
          vec3 c = y>1.655 ? vec3(.055,.045,.04) : y>1.47 ? vec3(.74,.53,.42) : y>.93 ? vec3(.46,.43,.40) : y>.07 ? vec3(.16,.17,.2) : vec3(.05);
          if(hand>.5) c=vec3(.72,.51,.40);
          diffuseColor.rgb=c; }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(.45,.75,1.2)*${isRobot ? '1.1' : '1.5'}*smoothstep(.022,.0,abs(vOP.y-cutN))*step(uCut,${TOP.toFixed(2)})*step(${BOT.toFixed(2)},uCut);`);
  };
  mat.customProgramCacheKey = () => key;
}
const fig = new THREE.Group(); scene.add(fig);
let hGeo = null, rGeo = null;
if (hm && rm) {
  hGeo = hm.geometry; rGeo = rm.geometry;
  const hMat = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0 });
  hook(hMat, false, 'sc1b-h');
  const rMat = new THREE.MeshStandardMaterial({ color: 0x5d646e, roughness: 0.24, metalness: 0.95, envMap: env, envMapIntensity: 0.5, vertexColors: !!rGeo.attributes.color });
  hook(rMat, true, 'sc1b-r');
  fig.add(new THREE.Mesh(hGeo, hMat), new THREE.Mesh(rGeo, rMat));
  if (gm) {
    const vm = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9fe6ff).multiplyScalar(2.6), toneMapped: false, transparent: true, opacity: 0 });
    const v = new THREE.Mesh(gm.geometry, vm); fig.add(v); fig.userData.visor = v;
  }
}
// 光：人の肌が見えるあたたかい主光（左上前）＋冷たい輪郭光（右後ろ）
{
  const key = new THREE.SpotLight(0xffc49a, 9, 12, 0.5, 0.75, 1.4); key.position.set(-1.6, 3.2, 2.6); key.target.position.set(0, 1.2, 0); scene.add(key, key.target);
  const fill = new THREE.PointLight(0xffd9bf, 0.45, 8, 1.5); fill.position.set(1.8, 1.2, 2.4); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 0.9); rim.position.set(2.5, 2.4, -3); scene.add(rim);
  const rim2 = new THREE.DirectionalLight(0xffffff, 0.5); rim2.position.set(-2.6, 1.6, -2.5); scene.add(rim2);
  scene.add(new THREE.AmbientLight(0xffffff, 0.04));
}
// 足元のかすかな光だまり
{
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x2a2a2e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; scene.add(m);
}

// ---------- ほどけて組み替わる粒 ----------
const N = SP ? 14000 : 32000;
const PU = { uCut: U.uCut, uT: U.uT, uPx: { value: 1000 } };
if (hGeo && rGeo) {
  const rnd = makeRnd(77);
  const sample = (geo) => {
    const s = new MeshSurfaceSampler(new THREE.Mesh(geo)).setRandomGenerator(rnd).build(); const v = new THREE.Vector3(), out = [];
    for (let i = 0; i < N; i++) { s.sample(v); out.push([v.x, v.y, v.z]); }
    return out.sort((a, b) => a[1] - b[1]);   // 高さでそろえて、同じ高さどうしを結ぶ（近い所へ移る）
  };
  const A = sample(hGeo), B = sample(rGeo);
  const pa = new Float32Array(N * 3), pb = new Float32Array(N * 3), r4 = new Float32Array(N * 4);
  for (let i = 0; i < N; i++) { pa.set(A[i], i * 3); pb.set(B[i], i * 3); r4.set([rnd(), rnd(), rnd(), rnd()], i * 4); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pa, 3)); g.setAttribute('aTo', new THREE.BufferAttribute(pb, 3)); g.setAttribute('aR', new THREE.BufferAttribute(r4, 4));
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: PU,
    vertexShader: `attribute vec3 aTo; attribute vec4 aR; uniform float uCut, uT, uPx; varying vec3 vC; varying float vA;
      ${NOISE}
      void main(){
        // 線が通る少し前にほどけ、通ったあと少しして AI の表面に収まる
        float q=clamp((position.y+.05+aR.x*.06-uCut)/(.34+aR.y*.18),0.,1.);
        float e=q*q*(3.-2.*q);
        vec3 out_=normalize(vec3(position.x,0.,position.z)+vec3(0.,0.,.001));
        vec3 drift=vn3(position*3.+vec3(0.,uT*.6,0.))*.09+out_*(.05+aR.z*.11)+vec3(0.,.015+aR.w*.04,0.);
        float arc=sin(3.14159*e);
        vec3 p=mix(position,aTo,e)+drift*arc;
        vec4 mv=modelViewMatrix*vec4(p,1.); gl_Position=projectionMatrix*mv;
        gl_PointSize=max(1.,(1.2+aR.z*1.8)*uPx*.0045/-mv.z);
        vC=mix(vec3(1.,.66,.42),vec3(.5,.82,1.2),smoothstep(.15,.75,e));
        vA=arc*(.55+.45*aR.w);
      }`,
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-.5; float r=dot(d,d); if(r>.25) discard; gl_FragColor=vec4(vC*vA*(1.-r*4.)*.8,1.); }',
  });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; fig.add(pts);
}

// 本線の朱い線（薄く）：人物の奥を斜めに通る
{
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-9, -1.5, -6), new THREE.Vector3(-3, 0.6, -2.6), new THREE.Vector3(0.6, 1.5, -1.4), new THREE.Vector3(4, 2.4, -2.5), new THREE.Vector3(12, 4.5, -7)]);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.008, 6, false), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: U.uT },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; uniform float uT; void main(){ float p=.85+.15*sin(vUv.x*30.-uT*2.); gl_FragColor=vec4(vec3(1.,.36,.14)*.38*p*smoothstep(0.,.25,vUv.x)*smoothstep(1.,.7,vUv.x),1.); }',
  }));
  m.frustumCulled = false; scene.add(m);
}
// 遠くの塵
{
  const rnd = makeRnd(9), n = SP ? 500 : 1200, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([(rnd() * 2 - 1) * 14, rnd() * 7 - 1, -3 - rnd() * 14], i * 3);
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x2a2d33, size: 1, sizeAttenuation: false })));
}

const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const CAM = SP
  ? [[0.75, 1.5, 2.3, 0, 1.38, 0], [1.4, 1.05, 5.4, 0, 0.92, 0]]
  : [[0.85, 1.56, 1.55, 0, 1.47, 0], [1.75, 1.12, 4.3, 0, 0.93, 0]];
S.onResize((st) => { PU.uPx.value = st.px; });
PU.uPx.value = S.st.px;
let prevCut = TOP;
S.run((st) => {
  const tau = CK.tau(st); st.tau = tau; st.ep = CK.ep;
  U.uT.value = tau;
  const s = sstep(TS, TE, tau);
  // 頭（考えること）は少しゆっくり、体は速く
  const cut = tau < TS ? TOP + 0.2 : mix(TOP, BOT - 0.4, Math.pow(s, 1.15));
  U.uCut.value = cut;
  st.speed = Math.max(0, prevCut - cut) / Math.max(0.001, st.dt); prevCut = cut;
  st.cut = cut;
  const v = fig.userData.visor; if (v) v.material.opacity = sstep(1.64, 1.56, cut) * (0.85 + 0.15 * Math.sin(tau * 2.2));
  // 人のうちは呼吸。AI になった所から止まる
  fig.scale.set(1, 1 + 0.004 * Math.sin(tau * 1.6) * sstep(BOT, TOP, cut), 1);
  const k = eio(sstep(0.4, TE + 1.0, tau)), a = CAM[0], b = CAM[1];
  camera.position.set(mix(a[0], b[0], k) + st.mx * 0.3, mix(a[1], b[1], k) - st.my * 0.2, mix(a[2], b[2], k));
  camera.lookAt(mix(a[3], b[3], k), mix(a[4], b[4], k), mix(a[5], b[5], k));
}, {
  chord: 1,
  base: () => ({ noise: 0.25, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(out) {
    const breath = sfx.loop(out, 'bandpass', 520, 0.8, out.music);   // 人の気配（ゆっくり息づく）
    const drone = snd.hold(out, 'sine', mtof(45)), hi = snd.hold(out, 'sine', mtof(93));
    let last = 0;
    const cue = cues([[TS + 0.9, (o) => snd.bell(o, mtof(88), 0.028, 2.6)]]);   // 目に光が入る
    return {
      update(s, o) {
        const t = o.ctx.currentTime, k = sstep(TOP, BOT, s.cut ?? TOP), act = s.cut < TOP && s.cut > BOT - 0.3 ? 1 : 0;
        breath.g.gain.setTargetAtTime(0.14 * (1 - k) * (0.55 + 0.45 * Math.sin(s.t * 1.6)), t, 0.2);
        drone.g.gain.setTargetAtTime(0.05 * k, t, 0.6); hi.g.gain.setTargetAtTime(0.006 * k, t, 0.6);
        // 粒がほどける音：さらさら（線が動いている間だけ）
        if (act && s.t - last > 0.025 && Math.random() < 0.6) { last = s.t; sfx.burst(o, 0.025 + 0.03 * Math.random(), 0.01 + Math.random() * 0.02, 'highpass', 4000 + Math.random() * 4000, 0.7); }
        cue(s.tau ?? -1, s.ep, o);
      },
    };
  },
});
