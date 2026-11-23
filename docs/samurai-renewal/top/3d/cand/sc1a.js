// 場面1・案A「窓の灯りが入れ替わる街」
// 夜の街。窓の中にいる人の影（あたたかい灯り・それぞれ勝手に動く）が、ひと窓ずつ AI（冷たい光・バイザーの一本線・全員同じ拍で明滅）に置き換わる。
// 置き換わりは最初ぽつり、やがて加速して街じゅうへ。最後に、まだ人のままの窓がひとつだけ朱く残る。
import { THREE, stage, SP, makeRnd, sstep, mix, mtof, sfx } from './base.js';
import { clock, mkGlow, cues, snd } from './sc4k.js';

const S = stage({ fov: 40, fovSp: 58, bloom: [0.75, 0.55, 0.55], shift: { pc: [-0.16, 0], sp: [0, -0.16] }, exposure: 1, grain: 0.04, vig: 0.75 });
if (SP) S.bloom.strength = 0.6;
const { scene, camera } = S;
const CK = clock(0.6);
const T0 = 2.2, DUR = 8.5;   // 置き換わりの始まりと長さ（秒）

// ---------- 建物 ----------
const rnd = makeRnd(1201);
const towers = [];
// 主役の棟（原点・正面が +z）
towers.push({ x: 0, z: 0, w: 12, d: 10, h: 44, hero: true });
const spots = [[-15, -6], [15, -4], [-6, -22], [11, -22], [-26, -20], [27, -18], [-18, -40], [2, -44], [22, -40], [-36, -4], [38, -2], [-34, -46], [40, -46], [-46, -28], [48, -26], [-4, -66], [26, -66], [-28, -68]];
for (const [x, z] of spots) towers.push({ x: x + (rnd() - 0.5) * 3, z: z + (rnd() - 0.5) * 3, w: 8 + rnd() * 6, d: 8 + rnd() * 6, h: 16 + rnd() * 40 });
{
  const bm = new THREE.MeshBasicMaterial({ color: 0x020304 });
  for (const t of towers) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(t.w, t.h, t.d), bm); m.position.set(t.x, t.h / 2, t.z); scene.add(m);
  }
  // 地面
  const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x010101 })); g.rotation.x = -Math.PI / 2; scene.add(g);
}

// ---------- 窓 ----------
const FL = 3.2, CW = 2.4, WW = 1.55, WH = 2.05;
const off = [], rot = [], seed = [], lit = [], tsw = [];
let heroIdx = -1;
for (const t of towers) {
  const faces = [[0, 0, t.d / 2, t.w], [Math.PI, 0, -t.d / 2, t.w], [Math.PI / 2, t.w / 2, 0, t.d], [-Math.PI / 2, -t.w / 2, 0, t.d]];
  for (const [ry, fx, fz, span] of faces) {
    const cols = Math.floor((span - 1.2) / CW), floors = Math.floor((t.h - 2) / FL);
    for (let f = 0; f < floors; f++) for (let c = 0; c < cols; c++) {
      const u = (c - (cols - 1) / 2) * CW, y = 2.2 + f * FL;
      const cx = Math.cos(ry), sx = Math.sin(ry);
      const lx = u * cx, lz = -u * sx;   // 面に沿った横方向
      const nx = sx * 0.04, nz = cx * 0.04;   // 面から少し外へ
      off.push(t.x + fx + lx + nx, y, t.z + fz + lz + nz); rot.push(ry);
      seed.push(rnd());
      const on = rnd() < (t.hero ? 0.62 : 0.42) ? 1 : 0; lit.push(on);
      // 主役の窓：主役の棟・正面・中ほどの階で一つ
      if (t.hero && ry === 0 && f === 6 && c === 2) { heroIdx = lit.length - 1; lit[heroIdx] = 1; }
    }
  }
}
const NW = lit.length;
// 置き換わる順番：最初はカメラの近く（主役の棟の正面）から数枚、あとはでたらめ。数は加速（3乗）
{
  const order = [];
  for (let i = 0; i < NW; i++) if (lit[i]) {
    const x = off[i * 3], y = off[i * 3 + 1], z = off[i * 3 + 2];
    const near = (rot[i] === 0 && Math.abs(x) < 7 && z > 3 && y > 6 && y < 26) ? 1 : 0;
    order.push([i, near ? rnd() * 0.06 : rnd()]);
  }
  order.sort((a, b) => a[1] - b[1]);
  for (let i = 0; i < NW; i++) tsw.push(1e9);
  order.forEach(([i], r) => { tsw[i] = T0 + DUR * Math.pow((r + 1) / order.length, 0.42); });
  tsw[heroIdx] = 1e9;
  // 最初の1枚は主役の窓の隣の窓に、はっきり（少し早め）
}
const swSorted = tsw.filter((v) => v < 1e8).sort((a, b) => a - b);

const U = { uT: { value: 0 }, uHero: { value: 0 }, uFar: { value: 120 } };
{
  const pg = new THREE.PlaneGeometry(WW, WH);
  const g = new THREE.InstancedBufferGeometry(); g.index = pg.index; g.attributes.position = pg.attributes.position; g.attributes.uv = pg.attributes.uv;
  g.setAttribute('aOff', new THREE.InstancedBufferAttribute(new Float32Array(off), 3));
  g.setAttribute('aRot', new THREE.InstancedBufferAttribute(new Float32Array(rot), 1));
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(new Float32Array(seed), 1));
  g.setAttribute('aLit', new THREE.InstancedBufferAttribute(new Float32Array(lit), 1));
  g.setAttribute('aTs', new THREE.InstancedBufferAttribute(new Float32Array(tsw), 1));
  const hero = new Float32Array(NW); hero[heroIdx] = 1; g.setAttribute('aHero', new THREE.InstancedBufferAttribute(hero, 1));
  g.instanceCount = NW;
  const m = new THREE.ShaderMaterial({
    uniforms: U, depthWrite: true,
    vertexShader: `attribute vec3 aOff; attribute float aRot, aSeed, aLit, aTs, aHero; varying vec2 vUv; varying float vSeed, vLit, vTs, vHero, vFog;
      uniform float uFar;
      void main(){ vUv=uv; vSeed=aSeed; vLit=aLit; vTs=aTs; vHero=aHero;
        float c=cos(aRot), s=sin(aRot); vec3 p=vec3(position.x*c, position.y, -position.x*s)+aOff;
        vec4 mv=modelViewMatrix*vec4(p,1.); vFog=1.-smoothstep(uFar*.35,uFar,-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying float vSeed, vLit, vTs, vHero, vFog; uniform float uT, uHero;
      float h(float x){ return fract(sin(x*91.7)*43758.5453); }
      float smin(float a,float b,float k){ float h=clamp(.5+.5*(b-a)/k,0.,1.); return mix(b,a,h)-k*h*(1.-h); }
      float box(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
      void main(){
        vec2 uv=vUv;
        // 枠（サッシ）
        float frame=step(.04,uv.x)*step(uv.x,.96)*step(.03,uv.y)*step(uv.y,.97);
        float k=smoothstep(vTs,vTs+.18,uT);            // 0=人 1=AI
        float fl=step(vTs,uT)*exp(-(uT-vTs)*7.);       // 切り替わりの一閃
        // 人：あたたかい部屋（天井の灯りで上が明るい）・人それぞれの揺らぎ
        float sway=sin(uT*(.35+vSeed*.5)+vSeed*40.)*.09+sin(uT*1.3+vSeed*9.)*.015;
        float px=.32+h(vSeed)*.36+sway*(1.-k);
        vec2 p=uv-vec2(px,0.);
        // 人の影：机に向かう人。頭（少し縦長・首をかしげる）＋なで肩（なめらかにつなぐ）
        float tilt=sin(uT*(.5+vSeed*.4)+vSeed*17.)*.12*(1.-k);
        vec2 hp=p-vec2(.0,.60); hp=mat2(cos(tilt),-sin(tilt),sin(tilt),cos(tilt))*hp;
        float head=length(hp*vec2(1.,.82))-.088;
        float neck=box(p-vec2(0.,.47),vec2(.035,.06),.02);
        float sh=length((p-vec2(0.,.27))*vec2(.95,1.35))-.25;
        float torso=box(p-vec2(0.,.08),vec2(.22,.2),.08);
        float hum=smin(smin(head,neck,.05),smin(sh,torso,.06),.05);
        // AI の影：角ばったヘルメット＋四角い肩。目の位置に一本の光。微動だにしない
        float helm=box(p-vec2(0.,.61),vec2(.095,.11),.05);
        float shR=box(p-vec2(0.,.27),vec2(.25,.11),.03);
        float torR=box(p-vec2(0.,.08),vec2(.19,.2),.01);
        float neckR=box(p-vec2(0.,.46),vec2(.04,.06),.0);
        float rob=min(min(helm,shR),min(torR,neckR));
        float vis=(1.-smoothstep(.0,.011,abs(p.y-.625)))*step(abs(p.x),.08);
        float body=mix(hum,rob,step(.5,k));
        float sil=1.-smoothstep(-.004,.006,body);
        sil=max(sil,1.-smoothstep(.09,.1,uv.y));
        // 部屋の明るさ
        float ry=mix(.55,1.,smoothstep(.0,1.,uv.y));
        float flick=.82+.18*sin(uT*(.7+vSeed)+vSeed*30.)*sin(uT*.31+vSeed*11.);
        vec3 warm=vec3(1.,.56,.24)*mix(.55,1.,h(vSeed*3.1))*flick*ry;
        float pulse=.78+.22*sin(uT*2.4);                 // AI は全員同じ拍
        float scan=.9+.1*step(.5,fract(uv.y*22.));
        vec3 cold=vec3(.42,.72,1.)*pulse*scan*mix(.85,1.,uv.y);
        vec3 room=mix(warm,cold,k)*(1.-sil*.93);
        room+=vec3(.75,.95,1.)*2.2*vis*sil*step(.5,k)*pulse;
        room+=vec3(.8,.9,1.)*fl*.5;
        // 主役（最後まで人のまま残る窓）：だんだん朱へ
        vec3 sig=vec3(1.,.353,.141);
        room=mix(room,sig*(1.-sil*.9)*1.25*(ry+.1)*flick,vHero*uHero);
        float a=vLit*frame;
        vec3 dark=vec3(.012,.014,.018)*frame;
        vec3 col=mix(dark,room*.5,a)*vFog;
        gl_FragColor=vec4(col,1.);
      }`,
  });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; scene.add(mesh);
}
const heroPos = new THREE.Vector3(off[heroIdx * 3], off[heroIdx * 3 + 1], off[heroIdx * 3 + 2]);
const heroGlow = mkGlow(2, 0xff5a24, 0); heroGlow.position.copy(heroPos).add(new THREE.Vector3(0, 0, 0.6)); scene.add(heroGlow);

// 本線の朱い線（単体ページでは薄く）：街の手前を横切る
{
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-60, 3, 30), new THREE.Vector3(-18, 5, 14), new THREE.Vector3(8, 8, 9), new THREE.Vector3(40, 18, -10), new THREE.Vector3(90, 30, -40)]);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 0.05, 6, false), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uT: U.uT },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'varying vec2 vUv; uniform float uT; void main(){ float p=.85+.15*sin(vUv.x*30.-uT*2.); gl_FragColor=vec4(vec3(1.,.36,.14)*.55*p*smoothstep(0.,.2,vUv.x)*smoothstep(1.,.75,vUv.x),1.); }',
  }));
  m.frustumCulled = false; scene.add(m);
}

// カメラ：主役の棟の正面に寄った所から、引いて上がって街全体へ
const C0 = SP ? [new THREE.Vector3(6, 15, 33), new THREE.Vector3(0.5, 20, 0)] : [new THREE.Vector3(13, 13, 27), new THREE.Vector3(7, 17, 0)];
const C1 = SP ? [new THREE.Vector3(30, 46, 98), new THREE.Vector3(0, 16, -12)] : [new THREE.Vector3(42, 36, 82), new THREE.Vector3(2, 15, -14)];
const eio = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
let switched = 0;
S.run((st) => {
  const tau = CK.tau(st); st.tau = tau; st.ep = CK.ep;
  U.uT.value = tau;
  const k = eio(sstep(1.6, T0 + DUR + 1.2, tau));
  const pos = C0[0].clone().lerp(C1[0], k), tgt = C0[1].clone().lerp(C1[1], k);
  pos.x += st.mx * 2; pos.y -= st.my * 1.5;
  camera.position.copy(pos); camera.lookAt(tgt);
  // 主役の窓：ほかが置き換わるほど朱へ
  let n = 0; while (n < swSorted.length && swSorted[n] <= tau) n++;
  const fr = n / swSorted.length; st.fr = fr; st.newSw = n - switched; switched = n;
  U.uHero.value = sstep(0.55, 1, fr);
  heroGlow.material.opacity = sstep(0.7, 1, fr) * (0.22 + 0.06 * Math.sin(tau * 1.7));
  heroGlow.scale.setScalar(3 + 3 * k);
}, {
  chord: 0,
  base: (s) => ({ noise: 0.3, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(out) {
    // 部屋のざわめき（あたたかいこもった音）→ 置き換わるほど細く冷たい持続音へ
    const room = sfx.loop(out, 'lowpass', 380, 0.5, out.music);
    const cold = snd.hold(out, 'sine', mtof(88)), cold2 = snd.hold(out, 'sine', mtof(95));
    const warmT = snd.hold(out, 'triangle', mtof(50));
    let last = 0;
    const cue = cues([[T0 - 0.05, (o) => snd.bell(o, mtof(84), 0.03, 2.2)]]);
    return {
      update(s, o) {
        const t = o.ctx.currentTime, fr = s.fr || 0;
        room.g.gain.setTargetAtTime(0.22 * (1 - fr * 0.85), t, 0.3);
        cold.g.gain.setTargetAtTime(0.018 * fr, t, 0.4); cold2.g.gain.setTargetAtTime(0.008 * fr, t, 0.4);
        warmT.g.gain.setTargetAtTime(0.02 * sstep(0.6, 1, fr), t, 0.8);
        // 置き換わるたびに小さく「ピッ」（多いときは間引く）
        if (s.newSw > 0 && s.t - last > 0.05) { last = s.t; sfx.tone(o, 2400 + Math.random() * 900, 0.012 + 0.012 * (1 - fr), 0.002, 0.06, 'sine'); }
        cue(s.tau ?? -1, s.ep, o);
      },
    };
  },
});
