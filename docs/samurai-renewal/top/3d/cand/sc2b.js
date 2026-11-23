// 場面2・案B「乱れる煙の輪」
// 闇に浮かぶ、細く整った1本の煙の輪（＝ひとつの正解）。スクロールで乱流が強まり、輪はほどけ、渦が渦を生み、
// 煙は画面いっぱいへ手に負えなく広がる。輪の中心の朱の一点は、煙に呑まれて見えなくなる。
// 描き方：画面全体の板にレイマーチ（自前の3Dノイズのテクスチャを数回引くだけ）。
import { THREE, stage, SP, makeRnd, sstep, sfx } from './base.js';

const S = stage({ dpr: 0.8, dprSp: 0.75, bloom: [0.6, 0.5, 0.7], shift: { pc: [0.19, 0], sp: [0, -0.14] }, grain: 0.05 });
const { scene, st } = S;
const rnd = makeRnd(11);

// 自前の3Dノイズ（なめらかにした乱数の箱・RGBA 4本の独立したノイズ）
const NS = 48;
const tex = (() => {
  const n = NS * NS * NS, raw = new Float32Array(n * 4);
  for (let i = 0; i < n * 4; i++) raw[i] = rnd();
  // 1回ぼかして角を取る（周期的に）
  const out = new Uint8Array(n * 4), id = (x, y, z) => (((z + NS) % NS) * NS * NS + ((y + NS) % NS) * NS + ((x + NS) % NS)) * 4;
  for (let z = 0; z < NS; z++) for (let y = 0; y < NS; y++) for (let x = 0; x < NS; x++) for (let c = 0; c < 4; c++) {
    let s = 0; for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) s += raw[id(x + dx, y + dy, z + dz) + c] * ((dx ? 1 : 2) * (dy ? 1 : 2) * (dz ? 1 : 2));
    out[id(x, y, z) + c] = Math.max(0, Math.min(255, ((s / 64 - 0.5) * 2.6 + 0.5) * 255));
  }
  const t = new THREE.Data3DTexture(out, NS, NS, NS);
  t.format = THREE.RGBAFormat; t.minFilter = t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = t.wrapR = THREE.RepeatWrapping; t.unpackAlignment = 1; t.needsUpdate = true; return t;
})();

const U = { uN: { value: tex }, uP: { value: 0 }, uT: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uShift: { value: new THREE.Vector2(SP ? 0 : 0.19, SP ? 0.14 : 0) }, uSteps: { value: SP ? 36 : 48 } };
const mat = new THREE.ShaderMaterial({
  uniforms: U, depthTest: false, depthWrite: false,
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `precision highp sampler3D;
    uniform sampler3D uN; uniform float uP, uT, uSteps; uniform vec2 uRes, uShift; varying vec2 vUv;
    mat2 rot(float a){ float c=cos(a), s=sin(a); return mat2(c,-s,s,c); }
    vec4 N(vec3 p){ return texture(uN,p); }
    float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
    float dens(vec3 p, float fine){
      float S=1.+uP*1.7;
      vec3 q=p/S;
      q.yz=rot(.42)*q.yz;
      q.xz=rot(uT*.04)*q.xz;
      float W=mix(.015,1.15,pow(uP,1.15));
      q+=(N(q*.2+vec3(0.,uT*.01,0.)).rgb*2.-1.)*W;
      q+=(N(q*.52+vec3(uT*.017,0.,.3)).rgb*2.-1.)*W*.55;
      float ring=length(vec2(length(q.xz)-1.15,q.y))-mix(.045,.42,uP);
      float n=N(q*.9+vec3(0.,0.,uT*.01)).a*.6+N(q*2.1).a*.4;
      if(fine>.5) n=n*.8+N(q*4.6+3.1).a*.2;
      float e=mix(.18,.52,uP);
      float d=smoothstep(.03,-.07,ring)*smoothstep(e,e+.22,n+.25*(1.-uP));
      float sh=smoothstep(.7,.0,abs(length(q)-mix(1.3,2.3,uP)))*smoothstep(.2,.9,uP)*smoothstep(.64,.82,n);
      return (d+sh*.5)*mix(7.,2.4,uP);
    }
    void main(){
      vec2 uv=(vUv-.5-uShift)*vec2(uRes.x/uRes.y,1.);
      vec3 ro=vec3(0.,.1,5.6+uP*1.4), rd=normalize(vec3(uv*.92,-1.7));
      float R=2.1*(1.+uP*1.5)+.6;
      float b=dot(ro,rd), c=dot(ro,ro)-R*R, disc=b*b-c;
      vec3 col=vec3(0.); float T=1.;
      vec3 L=normalize(vec3(-.55,.75,.35));
      if(disc>0.){
        float t0=max(0.,-b-sqrt(disc)), t1=-b+sqrt(disc);
        float dt=(t1-t0)/uSteps;
        float t=t0+dt*h(gl_FragCoord.xy+fract(uT)*13.);
        for(int i=0;i<80;i++){
          if(float(i)>=uSteps||T<.02) break;
          vec3 p=ro+rd*t;
          float d=dens(p,1.);
          float r2=dot(p,p);
          // 中心の朱の一点（煙の中では散って弱まる）
          col+=T*vec3(1.,.30,.09)*(exp(-r2*180.)*mix(26.,9.,smoothstep(.3,1.,uP))+d*exp(-r2*2.)*.02)*dt;
          if(d>.01){
            float sd=dens(p+L*.3,0.);
            float lit=exp(-sd*.9);
            vec3 c=vec3(.56,.59,.64)*(.01+lit*lit*.42*mix(1.,.42,uP*uP));
            float a=1.-exp(-d*dt*1.3);
            col+=T*a*c;
            T*=1.-a;
          }
          t+=dt;
        }
      }
      gl_FragColor=vec4(col,1.);
    }`,
});
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
const setRes = () => U.uRes.value.set(innerWidth, innerHeight);
S.onResize(setRes); setRes();

const rd = document.getElementById('rd');
let last = -1;
S.run((st) => {
  U.uP.value = st.p; U.uT.value = st.t;
  U.uShift.value.x = (SP ? 0 : 0.19) + st.mx * 0.02;
  const k = Math.round(st.p * 100);
  if (k !== last) { last = k; rd.innerHTML = `TURBULENCE  <b>${String(Math.round(Math.pow(st.p, 1.2) * 999)).padStart(3, '0')}</b>`; }
}, {
  chord: 2,
  base: (st) => ({ noise: 0.2 + 0.8 * st.p, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  // 低いうなり（乱れるほど太く・ざらつく）
  init(out) {
    const rum = sfx.loop(out, 'lowpass', 90, 0.8), air = sfx.loop(out, 'bandpass', 600, 0.6);
    return { update(st, o) { const t = o.ctx.currentTime, p = st.p;
      rum.g.gain.setTargetAtTime(0.05 + 0.45 * p * p, t, 0.3); rum.fl.frequency.setTargetAtTime(70 + 160 * p, t, 0.3);
      air.g.gain.setTargetAtTime(0.02 + 0.12 * p, t, 0.3); air.fl.frequency.setTargetAtTime(400 + 900 * p + Math.sin(st.t * 0.7) * 200 * p, t, 0.2); } };
  },
});
