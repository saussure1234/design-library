// 場面5 案B「粘る液」：黒い粘液の3つの塊が糸を引いて奪い合う（総量は一定）
// → 塊が寄り合って1つに溶け、総量そのものが増え、内側から朱の光が透ける
import { THREE, clamp, sstep, lerp, TAU, A, mtof, SIG } from './base.js';

const FRAG = /* glsl */`
precision highp float;
uniform vec2 uRes; uniform float uT, uK, uE; uniform mat4 uInvProj, uCamW; uniform vec3 uCam;
uniform vec4 uB[3];            // 塊：中心xyz・半径
uniform vec4 uS[6];            // 糸：x=どの組(0..2) y=切れ具合(0..1) z=太さ w=ずれ
uniform vec4 uD[6];            // しずく：xyz・半径
uniform float uCore;           // 内の光の大きさ
varying vec2 vUv;
float smin(float a, float b, float k){ float h = clamp(.5 + .5*(b-a)/k, 0., 1.); return mix(b, a, h) - k*h*(1.-h); }
float capT(vec3 p, vec3 a, vec3 b, float ra, float rm, float rb){
  vec3 pa = p-a, ba = b-a; float h = clamp(dot(pa,ba)/dot(ba,ba), 0., 1.);
  float r = mix(mix(ra, rb, h), rm, 4.*h*(1.-h));
  return length(pa - ba*h) - r;
}
vec3 bp(int i){ return i==0 ? uB[0].xyz : (i==1 ? uB[1].xyz : uB[2].xyz); }
float map(vec3 p){
  float d = 1e5;
  for(int i=0;i<3;i++){ d = smin(d, length(p-uB[i].xyz)-uB[i].w, .7 + uK*.45); }
  for(int j=0;j<6;j++){
    vec4 s = uS[j]; if(s.z < .002) continue;
    int pi = int(s.x+.5); vec3 a = bp(pi), b = bp(pi==2?0:pi+1);
    vec3 off = normalize(cross(b-a, vec3(0.,1.,0.)) + vec3(0.,.001,0.)) * s.w + vec3(0., s.w*.6, 0.);
    vec3 m = (a+b)*.5 + off + vec3(0., -.6 - .45*s.y, 0.);   // 垂れる
    float br = s.y;   // 0=つながる 1=切れて縮む
    vec3 a2 = mix(m, a, br*br), b2 = mix(m, b, br*br);
    float r = s.z*(1.-br*.6);
    d = smin(d, capT(p, a, a2, r*2.4, r*.5, r*1.1), .35);
    d = smin(d, capT(p, b, b2, r*2.4, r*.5, r*1.1), .35);
  }
  for(int j=0;j<6;j++){ if(uD[j].w > .001) d = smin(d, length(p-uD[j].xyz)-uD[j].w, .25); }
  float w = (1.-uK*.75);
  d += .06*w*sin(2.3*p.x+uT*1.3)*sin(2.1*p.y-uT*1.1)*sin(2.6*p.z+uT*.7) + .02*w*sin(7.*p.x-uT*2.)*sin(6.*p.y+uT*1.7);
  return d;
}
vec3 nrm(vec3 p){ vec2 e = vec2(.0015,0.); return normalize(vec3(map(p+e.xyy)-map(p-e.xyy), map(p+e.yxy)-map(p-e.yxy), map(p+e.yyx)-map(p-e.yyx))); }
// 写り込み：暗い部屋に細長い窓が2本（濡れた照りだけを出す）
vec3 envc(vec3 r){
  float a = smoothstep(.93,.99, dot(r, normalize(vec3(-.5,.8,.35))));
  float b = smoothstep(.96,.995, dot(r, normalize(vec3(.7,.25,-.65))));
  float strip = smoothstep(.02,.0, abs(r.y-.55)) * smoothstep(-.2,.6,r.x) * .25;
  return vec3(.80,.84,.90)*(a*1.4 + strip) + vec3(.55,.6,.7)*b*.8 + vec3(.012,.013,.016)*(r.y*.5+.5);
}
void main(){
  vec2 ndc = vUv*2.-1.;
  vec4 v = uInvProj * vec4(ndc, 1., 1.); v /= v.w;
  vec3 rd = normalize((uCamW * vec4(v.xyz, 0.)).xyz), ro = uCam;
  float t = 0., d, glow = 0.; bool hit = false;
  for(int i=0;i<96;i++){
    vec3 p = ro + rd*t; d = map(p);
    float dc = length(p) - uCore*.5; glow += exp(-max(dc,0.)*2.2)*.012*uE;
    if(d < .0015*t){ hit = true; break; }
    t += d*.85; if(t > 40.) break;
  }
  vec3 col = vec3(.006,.006,.008);
  if(hit){
    vec3 p = ro + rd*t, n = nrm(p), r = reflect(rd, n);
    float fr = .04 + .96*pow(1.-max(dot(-rd,n),0.), 5.);
    vec3 base = mix(vec3(.010,.010,.012), vec3(.05,.052,.058), uK*.5);
    vec3 l1 = normalize(vec3(-.6,.9,.5));
    float spec = pow(max(dot(r,l1),0.), 90.)*2.2 + pow(max(dot(r,normalize(vec3(.8,.2,-.6))),0.), 40.)*.5;
    col = base*(.2+.8*max(dot(n,l1),0.)) + envc(r)*fr*1.3 + vec3(.85,.88,.95)*spec;
    // 内からの光：皮の薄い所ほど透ける
    float inner = length(p);
    float th = max(inner - uCore*.55, 0.);
    float nv = sin(3.2*p.x+uT*.25)*sin(3.6*p.y-uT*.2)*sin(3.0*p.z+uT*.15) + .5*sin(7.*p.x+1.)*sin(6.5*p.y)*sin(7.5*p.z-uT*.3);
    float vein = smoothstep(-.2, .9, nv);
    float thin = pow(max(dot(n,-rd),0.), 2.5);
    vec3 em = vec3(1.,.33,.12) * exp(-th*1.6) * uE * thin * (.55 + vein*.9) * (1.1 + .15*sin(uT*1.4));
    col += em * (.3 + .7*(1.-fr));
  }
  col += vec3(1.,.35,.13)*glow*.6;
  gl_FragColor = vec4(col, 1.);
}`;

const s = {};
export default {
  dpr: 1,
  chordAt: (S) => (S.p < 0.5 ? 4 : 7),
  duck: (S) => 1 - sstep(0.5, 0.78, S.p),
  build(S) {
    const { scene } = S;
    S.bloom.strength = 0.8; S.bloom.threshold = 0.7; S.bloom.radius = 0.7;
    s.u = {
      uRes: { value: new THREE.Vector2() }, uT: { value: 0 }, uK: { value: 0 }, uE: { value: 0 },
      uInvProj: { value: new THREE.Matrix4() }, uCamW: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
      uB: { value: [0, 1, 2].map(() => new THREE.Vector4()) }, uS: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()) },
      uD: { value: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector4()) }, uCore: { value: 0 },
    };
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
      uniforms: s.u, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
      fragmentShader: FRAG,
    }));
    q.frustumCulled = false; scene.add(q);
    s.str = [0, 1, 2, 3, 4, 5].map((j) => ({ pair: j % 3, ph: j * 0.37 + (j > 2 ? 0.5 : 0), rate: 0.11 + (j % 3) * 0.025, off: (j > 2 ? -0.28 : 0.22), snapped: false }));
    s.drops = [0, 1, 2, 3, 4, 5].map((j) => ({ ph: j / 6, from: j % 3, rate: 0.16 + j * 0.013 }));
    s.ev = [];
    s.look = new THREE.Vector3();
  },
  frame(S) {
    const { camera, t, p, SP } = S;
    const k = sstep(0.4, 0.82, p);
    const u = s.u;
    // 塊：取り分が回る（体積の合計は一定）→ プラスサムで合計が増える
    const w = [0, 1, 2].map((i) => Math.exp(1.6 * Math.sin(t * 0.42 + i * TAU / 3) + 0.6 * Math.sin(t * 1.1 + i * 2.1)));
    const ws = w[0] + w[1] + w[2];
    const Vt = 1.9 * (1 + k * 2.6);
    s.share = w.map((x) => x / ws);
    for (let i = 0; i < 3; i++) {
      const a = i * TAU / 3 + 0.5 + Math.sin(t * 0.3) * 0.1;
      const pull = 1 + 0.18 * Math.sin(t * 0.8 + i * 1.7);
      const R = 2.05 * pull * (1 - k) + 0.95 * k;
      const share = lerp(s.share[i], 1 / 3, k);
      const r = Math.cbrt(share * Vt) * (1 - k) + Math.cbrt(Vt / 3) * 0.82 * k;
      u.uB.value[i].set(Math.cos(a) * R, Math.sin(a) * R * 0.75 + 0.1, Math.sin(a * 2) * 0.4 * (1 - k), r);
    }
    // 糸：伸びて細り、切れて縮み、またつながる
    s.str.forEach((st, j) => {
      const f = (t * st.rate + st.ph) % 1;
      const br = sstep(0.72, 0.95, f);
      if (f > 0.74 && !st.snapped && k < 0.4) { st.snapped = true; s.ev.push('snap'); }
      if (f < 0.1) st.snapped = false;
      const thick = (0.17 * (1 - sstep(0.0, 0.72, f) * 0.55) * sstep(0.0, 0.08, f)) * (1 - k * 0.2) + k * 0.1;
      u.uS.value[j].set(st.pair, br * (1 - k), thick, st.off * (1 - k));
    });
    // しずく：塊から垂れて落ちる
    s.drops.forEach((d, j) => {
      const f = (t * d.rate + d.ph) % 1;
      const b = u.uB.value[d.from];
      const y = b.y - b.w * 0.85 - f * f * 3.2;
      const rad = 0.13 * Math.sin(Math.min(1, f * 3) * Math.PI * 0.5) * (1 - f * 0.4) * (1 - k);
      u.uD.value[j].set(b.x + Math.sin(j * 2.3) * b.w * 0.35, y, b.z, rad);
      if (f > 0.97 && !d.fell && k < 0.4) { d.fell = true; s.ev.push('drip'); }
      if (f < 0.5) d.fell = false;
    });
    u.uCore.value = k * Math.cbrt(Vt) * 1.05;
    u.uE.value = sstep(0.55, 1, p);
    u.uK.value = k; u.uT.value = t;
    // カメラ
    const d = lerp(SP ? 12.5 : 9.5, SP ? 13.5 : 10.5, k);
    camera.position.set(Math.sin(t * 0.05) * d * 0.25, 0.6 + Math.sin(t * 0.07) * 0.3, d);
    camera.lookAt(0, 0, 0);
    if (SP) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * 0.2, innerWidth, innerHeight);
    else camera.setViewOffset(innerWidth, innerHeight, -innerWidth * 0.17, 0, innerWidth, innerHeight);
    camera.updateMatrixWorld();
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamW.value.copy(camera.matrixWorld); u.uCam.value.copy(camera.position);
    s.k = k;
  },
  sound: {
    init(S, o) {
      const { ctx } = o;
      s.bus = A.bus(o, 0.3);
      // ぬめる低音：ゆれる低いサイン＋泡立つローパスノイズ
      s.low = A.osc(o, 'sine', 48, s.bus);
      s.gl = A.loop(o, 'lowpass', 160, 14, s.bus);
      // 伸びる糸の「ぎゅー」：張力で音程が上がる
      s.stO = A.osc(o, 'sawtooth', 180, null); s.stF = ctx.createBiquadFilter(); s.stF.type = 'bandpass'; s.stF.Q.value = 9; s.stF.frequency.value = 700;
      s.stO.g.disconnect(); s.stO.g.connect(s.stF); s.stF.connect(s.bus);
      s.warmV = [50, 57, 62, 66, 69].map((m) => A.osc(o, 'sine', mtof(m), s.bus));
      s.core = A.osc(o, 'triangle', mtof(74), s.bus);
      s.nb = 0;
    },
    update(S, o) {
      const { ctx } = o, t = ctx.currentTime, z = 1 - sstep(0.4, 0.75, S.p), k = sstep(0.5, 0.9, S.p);
      A.set(o, s.bus.gain, 1, 0.3);
      s.low.x.frequency.setTargetAtTime(44 + Math.sin(S.t * 0.6) * 6 + k * 10, t, 0.2);
      A.set(o, s.low.g.gain, 0.16 * (0.5 + 0.5 * z), 0.4);
      s.gl.fl.frequency.setTargetAtTime(140 + Math.abs(Math.sin(S.t * 2.3) * Math.sin(S.t * 3.7)) * 520, t, 0.04);
      A.set(o, s.gl.g.gain, 0.22 * z, 0.3);
      // 張力：いちばん伸びた糸
      let ten = 0;
      const fs = (S.t * 0.11) % 1; ten = Math.max(0, Math.sin(S.t * 0.8)) * 0.5 + 0.5 * sstep(0.3, 0.74, fs);
      s.stO.x.frequency.setTargetAtTime(90 + ten * 260 + Math.sin(S.t * 31) * 6, t, 0.08);
      s.stF.frequency.setTargetAtTime(400 + ten * 1200, t, 0.08);
      A.set(o, s.stO.g.gain, 0.05 * z * ten, 0.15);
      // 泡（ぼこっ）
      if (z > 0.1 && t > s.nb) { s.nb = t + 0.12 + Math.random() * 0.5; A.tone(o, 260 + Math.random() * 300, 'sine', 0.07 * z, 0.005, 0.09, s.bus, 110); }
      s.ev.forEach((e) => {
        if (e === 'snap') {   // ぷつっ＋ねちゃっ
          A.noise(o, 0.35, 0.002, 0.04, 'highpass', 2500, 1, s.bus);
          A.tone(o, 160, 'sine', 0.3, 0.003, 0.25, s.bus, 55);
          A.noise(o, 0.25, 0.01, 0.22, 'lowpass', 2200, 14, s.bus, 160);
        } else if (e === 'drip') {
          A.tone(o, 900, 'sine', 0.1, 0.002, 0.12, s.bus, 300);
        }
      });
      s.ev.length = 0;
      s.warmV.forEach((v, i) => A.set(o, v.g.gain, 0.03 * k * (1 - i * 0.12), 1));
      s.core.x.frequency.setTargetAtTime(mtof(74) * (1 + Math.sin(S.t * 5) * 0.003), t, 0.1);
      A.set(o, s.core.g.gain, 0.02 * sstep(0.75, 1, S.p), 1);
    },
    mute() { if (s.bus) s.bus.gain.value = 0; s.ev.length = 0; },
  },
};
