/* VALUES の5つの絵（FEATURES と同じ「製図の線がスクロールで描かれる」型）。文字は描かない（線と記号だけ）。
   <canvas data-v="fun|free|flat|open|opt">。[data-vgroup] が画面に入ると FUN から描き始め、続いて4つを順に描く。
   朱は各絵に1点（ペン先・泡・底の中心・答えの点）だけ。かざしても光らない。 */
(()=>{
'use strict';
const TAU=Math.PI*2, DPR=Math.min(2,window.devicePixelRatio||1);
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v, mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const INK='21,21,19', SIG='239,69,25', CARD='251,250,246';
const ink=a=>`rgba(${INK},${a})`, sig=a=>`rgba(${SIG},${a})`;
function rng(seed){let s=seed%2147483647;if(s<=0)s+=2147483646;return()=>(s=s*16807%2147483647)/2147483647}
/* なめらかな揺らぎ（1次元の値ノイズ） */
const NZ=(()=>{const r=rng(77),v=[];for(let i=0;i<512;i++)v.push(r()*2-1);return x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return mix(v[i&511],v[(i+1)&511],u)}})();
function cum(pts){const L=[0];for(let i=1;i<pts.length;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return L}
/* 折れ線を長さの割合 k まで描く。先端の位置を返す */
function part(ctx,pts,k,L){if(k<=0||pts.length<2)return null;L=L||cum(pts);const d=L[L.length-1]*Math.min(1,k);ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++){if(L[i]<=d){ctx.lineTo(pts[i][0],pts[i][1]);continue}const f=(d-L[i-1])/((L[i]-L[i-1])||1),x=mix(pts[i-1][0],pts[i][0],f),y=mix(pts[i-1][1],pts[i][1],f);ctx.lineTo(x,y);return[x,y]}
  const q=pts[pts.length-1];return[q[0],q[1]]}
const sq=(ctx,x,y,s,c)=>{ctx.fillStyle=c;ctx.fillRect(x-s/2,y-s/2,s,s)};
const hollow=(ctx,x,y,s,a)=>{ctx.fillStyle=`rgba(${CARD},1)`;ctx.fillRect(x-s/2,y-s/2,s,s);ctx.strokeStyle=ink(a);ctx.strokeRect(x-s/2,y-s/2,s,s)};
function catmull(P,n){const out=[];for(let i=0;i<P.length-1;i++){const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||P[i+1];
  for(let j=0;j<n;j++){const t=j/n,t2=t*t,t3=t2*t;out.push([0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)))}}
  out.push(P[P.length-1]);return out}

/* ===== FUN (PLAY)：スピログラフ。歯車が輪の内側を転がり、ペン先が10枚の花びらを描く。描き終えても歯車はゆっくり回り続ける ===== */
function fun(p,t,D){const {ctx,w,h}=p;ctx.clearRect(0,0,w,h);
  const R=10,r=3,d=2.3,s=Math.min(w,h)*.46/(R-r+d),cx=w/2,cy=h/2,TH=TAU*3,N=720;
  if(!p.pts||p.s!==s){p.s=s;p.pts=[];for(let i=0;i<=N;i++){const a=TH*i/N;p.pts.push([cx+s*((R-r)*Math.cos(a)+d*Math.cos((R-r)/r*a)),cy+s*((R-r)*Math.sin(a)-d*Math.sin((R-r)/r*a))])}p.L=cum(p.pts)}
  /* 外の輪（点線）と中心の十字 */
  const ring=ss(0,.18,D);ctx.lineWidth=.8;ctx.setLineDash([3,4]);ctx.strokeStyle=ink(.3*ring);ctx.beginPath();ctx.arc(cx,cy,R*s,-Math.PI/2,-Math.PI/2+TAU*ring);ctx.stroke();ctx.setLineDash([]);
  ctx.strokeStyle=ink(.3*ring);ctx.beginPath();ctx.moveTo(cx-6,cy);ctx.lineTo(cx+6,cy);ctx.moveTo(cx,cy-6);ctx.lineTo(cx,cy+6);ctx.stroke();
  const k=clamp((D-.08)/.92),done=D>=1;
  ctx.lineWidth=1;ctx.strokeStyle=ink(.55);ctx.beginPath();part(ctx,p.pts,done?1:eio(k),p.L);ctx.stroke();
  /* 歯車とペン */
  const a=done?TH*eio(1)+(t-p.dDone)*.32:TH*eio(k);if(k<=0&&!done)return;
  const gx=cx+s*(R-r)*Math.cos(a),gy=cy+s*(R-r)*Math.sin(a),px=gx+s*d*Math.cos((R-r)/r*a),py=gy-s*d*Math.sin((R-r)/r*a);
  ctx.strokeStyle=ink(.42);ctx.lineWidth=.8;ctx.beginPath();ctx.arc(gx,gy,r*s,0,TAU);ctx.stroke();
  ctx.beginPath();const sp=-(R-r)/r*a;for(let i=0;i<10;i++){const b=sp+i*TAU/10;ctx.moveTo(gx+Math.cos(b)*r*s*.86,gy+Math.sin(b)*r*s*.86);ctx.lineTo(gx+Math.cos(b)*r*s,gy+Math.sin(b)*r*s)}ctx.stroke();
  ctx.strokeStyle=ink(.6);ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(px,py);ctx.stroke();
  ctx.fillStyle=ink(.8);ctx.fillRect(gx-1.5,gy-1.5,3,3);
  sq(ctx,px,py,8,sig(1))}

/* ===== Free：点線の枠（場所・時間の囲い）の中から1本の線が出て、枠の外を自由に伸びていく。描き終えても先は風のように揺れる ===== */
function free(p,t,D){const {ctx,w,h}=p;ctx.clearRect(0,0,w,h);
  const bx=w*.08,by=h*.2,bw=w*.3,bh=h*.6,gy0=h*.42,gy1=h*.58;
  const fr=ss(0,.22,D);ctx.lineWidth=.8;ctx.setLineDash([3,4]);ctx.strokeStyle=ink(.42);ctx.beginPath();
  const box=[[bx+bw,gy0],[bx+bw,by],[bx,by],[bx,by+bh],[bx+bw,by+bh],[bx+bw,gy1]];part(ctx,box,fr);ctx.stroke();ctx.setLineDash([]);
  /* 枠の目盛り（時間） */
  if(fr>=1){ctx.strokeStyle=ink(.3);ctx.beginPath();for(let i=1;i<6;i++){const x=bx+bw*i/6;ctx.moveTo(x,by);ctx.lineTo(x,by+5)}ctx.stroke()}
  const C=[[.2,.56],[.27,.36],[.33,.5],[.25,.64],[.38,.5],[.52,.3],[.66,.66],[.8,.34],[.93,.47]].map(q=>[q[0]*w,q[1]*h]);
  if(!p.base||p.w0!==w||p.h0!==h){p.w0=w;p.h0=h;p.base=catmull(C,24)}
  const n=p.base.length,tt=D>=1?t-p.dDone:0,pts=p.base.map((q,i)=>{const s=i/(n-1),e=Math.pow(clamp((s-.5)/.5),2);return[q[0]+NZ(s*4+tt*.35+40)*h*.03*e,q[1]+NZ(s*3+tt*.3)*h*.1*e]});
  const k=clamp((D-.18)/.82);ctx.lineWidth=1;ctx.strokeStyle=ink(.55);ctx.beginPath();const tip=part(ctx,pts,D>=1?1:eio(k));ctx.stroke();
  sq(ctx,pts[0][0],pts[0][1],5,ink(.8));if(tip)sq(ctx,tip[0],tip[1],8,sig(1))}

/* ===== Flat：高さの違う7本の柱が、同じ高さにそろう。上の水準器の泡が真ん中に来る。描き終えても柱の頭は水面のようにわずかに揺れる ===== */
function flat(p,t,D){const {ctx,w,h}=p;ctx.clearRect(0,0,w,h);
  const n=7,x0=w*.12,x1=w*.88,g=(x1-x0)/n,bw=g*.5,base=h*.86,hf=h*.36;
  if(!p.hi){const r=rng(12);p.hi=[];for(let i=0;i<n;i++)p.hi.push(.14+r()*.5);p.hi[3]=.66;p.hi[1]=.18}
  const draw=clamp(D/.5),lev=eio(clamp((D-.5)/.5)),tt=D>=1?t-p.dDone:0;
  ctx.lineWidth=.8;ctx.strokeStyle=ink(.4);ctx.beginPath();ctx.moveTo(w*.06,base);ctx.lineTo(w*.06+(w*.88)*ss(0,.2,D),base);ctx.stroke();
  ctx.lineWidth=1;ctx.strokeStyle=ink(.55);ctx.beginPath();
  for(let i=0;i<n;i++){const kk=clamp((draw*1.4-i*.06)/.6);if(kk<=0)continue;const x=x0+g*i+(g-bw)/2,hh=mix(p.hi[i]*h,hf,lev)+(D>=1?Math.sin(tt*1.6+i*.9)*1.2:0);
    part(ctx,[[x,base],[x,base-hh],[x+bw,base-hh],[x+bw,base]],kk)}
  ctx.stroke();
  if(lev>0){ctx.setLineDash([3,4]);ctx.lineWidth=.8;ctx.strokeStyle=ink(.42*lev);ctx.beginPath();ctx.moveTo(w*.06,base-hf);ctx.lineTo(w*.94,base-hf);ctx.stroke();ctx.setLineDash([])}
  /* 水準器 */
  const lw=Math.min(w*.34,170),lh=14,lx=w/2-lw/2,ly=h*.1,la=ss(.1,.35,D);if(la<=0)return;
  ctx.lineWidth=1;ctx.strokeStyle=ink(.55*la);ctx.strokeRect(lx,ly,lw,lh);ctx.beginPath();ctx.moveTo(w/2-lh*.8,ly);ctx.lineTo(w/2-lh*.8,ly+lh);ctx.moveTo(w/2+lh*.8,ly);ctx.lineTo(w/2+lh*.8,ly+lh);ctx.stroke();
  const off=(1-lev)*lw*.36+(D>=1?Math.sin(tt*1.6)*.6:0);sq(ctx,w/2+off,ly+lh/2,8,sig(la))}

/* ===== Open：立ち上がった4つの壁（箱）が外へ倒れて、1枚の展開図になる。中まで全部見える。描き終えても壁はわずかに呼吸する ===== */
function open(p,t,D){const {ctx,w,h}=p;ctx.clearRect(0,0,w,h);
  const a=Math.min(w,h)*.25,cx=w/2-a*.1,cy=h/2+a*.12,ob=.42,P=(x,y,z)=>[x+z*ob,y-z*ob];
  const tt=D>=1?t-p.dDone:0,ang=D<.42?Math.PI/2:Math.PI/2*(1-eio(clamp((D-.42)/.58)))+(D>=1?(.5-.5*Math.cos(tt*.8))*.07:0);
  const c=Math.cos(ang),s=Math.sin(ang),A=a/2;
  /* 底面 */
  const B=[[cx-A,cy-A],[cx+A,cy-A],[cx+A,cy+A],[cx-A,cy+A],[cx-A,cy-A]].map(q=>P(q[0],q[1],0));
  /* 4枚の壁：根元の2点と先の2点 */
  const W=[[[cx-A,cy-A,0],[cx+A,cy-A,0],[cx+A,cy-A-a*c,a*s],[cx-A,cy-A-a*c,a*s]],
           [[cx+A,cy-A,0],[cx+A,cy+A,0],[cx+A+a*c,cy+A,a*s],[cx+A+a*c,cy-A,a*s]],
           [[cx+A,cy+A,0],[cx-A,cy+A,0],[cx-A,cy+A+a*c,a*s],[cx+A,cy+A+a*c,a*s]],
           [[cx-A,cy+A,0],[cx-A,cy-A,0],[cx-A-a*c,cy-A,a*s],[cx-A-a*c,cy+A,a*s]]].map(q=>q.map(v=>P(v[0],v[1],v[2])));
  const k0=clamp(D/.42);
  ctx.lineWidth=1;ctx.strokeStyle=ink(.55);ctx.beginPath();part(ctx,B,D>=.42?1:clamp(k0/.4));ctx.stroke();
  W.forEach((q,i)=>{const kk=D>=.42?1:clamp((k0-.3-i*.12)/.34);if(kk<=0)return;ctx.beginPath();part(ctx,[q[1],q[2],q[3],q[0]],kk);ctx.stroke()});
  /* 折り目（倒れ始めたら点線に） */
  const fl=clamp((D-.5)/.3);if(fl>0){ctx.setLineDash([3,3]);ctx.lineWidth=.8;ctx.strokeStyle=ink(.5*fl);ctx.beginPath();part(ctx,B,1);ctx.stroke();ctx.setLineDash([])}
  if(D>=.2)sq(ctx,...P(cx,cy,0),8,sig(ss(.2,.4,D)))}

/* ===== Optimization：山と谷の続く線。小さな谷（部分最適）に印が付き、上から水平の線が下りてきて、全体でいちばん低い谷に朱の点が付く ===== */
function opt(p,t,D){const {ctx,w,h}=p;ctx.clearRect(0,0,w,h);
  if(!p.cv||p.w0!==w||p.h0!==h){p.w0=w;p.h0=h;const N=220,raw=[];
    for(let i=0;i<=N;i++){const u=i/N;raw.push(.18*Math.sin(u*TAU*1.25+.6)+.1*Math.sin(u*TAU*3.2+1.1)+.05*Math.sin(u*TAU*5.6+.3)-.26*Math.exp(-Math.pow((u-.7)/.07,2)))}
    const mn=Math.min(...raw),mx=Math.max(...raw);p.cv=raw.map((v,i)=>[w*(.06+.88*i/N),h*(.22+.6*(1-(v-mn)/(mx-mn)))]);
    p.loc=[];for(let i=2;i<N-1;i++)if(p.cv[i][1]>p.cv[i-1][1]&&p.cv[i][1]>=p.cv[i+1][1])p.loc.push(i);
    p.gi=p.loc.reduce((b,i)=>p.cv[i][1]>p.cv[b][1]?i:b,p.loc[0]);p.top=Math.min(...p.cv.map(q=>q[1]))}
  const cv=p.cv,axY=h*.9;
  ctx.lineWidth=.8;ctx.strokeStyle=ink(.35);ctx.beginPath();ctx.moveTo(w*.06,axY);ctx.lineTo(w*.06+w*.88*ss(0,.2,D),axY);ctx.stroke();
  ctx.lineWidth=1;ctx.strokeStyle=ink(.55);ctx.beginPath();part(ctx,cv,eio(clamp(D/.42)));ctx.stroke();
  /* 部分最適の印 */
  const others=p.loc.filter(i=>i!==p.gi);others.forEach((i,j)=>{const a=ss(.42+j*.06,.5+j*.06,D);if(a>0)hollow(ctx,cv[i][0],cv[i][1],7,.7*a)});
  /* 上から下りてくる水平線 */
  const sc=clamp((D-.62)/.33);if(sc>0){const y=mix(p.top-12,cv[p.gi][1],eio(sc));ctx.setLineDash([3,4]);ctx.lineWidth=.8;ctx.strokeStyle=ink(.45);ctx.beginPath();ctx.moveTo(w*.04,y);ctx.lineTo(w*.96,y);ctx.stroke();ctx.setLineDash([])}
  if(D>=.95){const a=ss(.95,1,D),x=cv[p.gi][0],y=cv[p.gi][1];ctx.setLineDash([2,3]);ctx.strokeStyle=ink(.4*a);ctx.beginPath();ctx.moveTo(x,y+6);ctx.lineTo(x,axY);ctx.stroke();ctx.setLineDash([]);
    ctx.strokeStyle=ink(.6*a);ctx.beginPath();ctx.moveTo(x,axY-4);ctx.lineTo(x,axY+4);ctx.stroke();sq(ctx,x,y,8,sig(a))}}

const ART={fun,free,flat,open,opt};
const DUR={fun:3.4,free:3,flat:2.8,open:3,opt:3.2};
const items=[];
function size(p){const r=p.c.getBoundingClientRect();if(!r.width||!r.height)return;p.w=r.width;p.h=r.height;p.c.width=Math.round(r.width*DPR);p.c.height=Math.round(r.height*DPR);p.ctx.setTransform(DPR,0,0,DPR,0,0);p.pts=p.base=p.cv=null;p.ready=true}
const ro=new ResizeObserver(es=>es.forEach(e=>{const p=e.target.__v;if(p)size(p)}));
const vis=new IntersectionObserver(es=>es.forEach(e=>{const p=e.target.__v;if(p)p.vis=e.isIntersecting}),{rootMargin:'80px 0px'});
let T=0;
document.querySelectorAll('[data-vgroup]').forEach(g=>{
  const cs=[...g.querySelectorAll('canvas[data-v]')];
  /* 順番：FUN が最初。残りは data-o（1〜4）の順 */
  cs.forEach(c=>{const k=c.dataset.v,o=+(c.dataset.o||0),p={c,k,ctx:c.getContext('2d'),fn:ART[k],t0:null,delay:k==='fun'?0:1.5+(o-1)*.35,dur:DUR[k],dDone:null};c.__v=p;items.push(p);ro.observe(c);vis.observe(c);size(p)});
  new IntersectionObserver((es,ob)=>es.forEach(e=>{if(e.isIntersecting){cs.forEach(c=>c.__v.t0=T+c.__v.delay);ob.disconnect()}}),{threshold:.22}).observe(g)});
let prev=performance.now();
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-prev)/1000);prev=now;T+=dt;
  for(const p of items){if(!p.ready||!p.vis)continue;const D=REDUCE?1:p.t0==null?0:clamp((T-p.t0)/p.dur);if(D>=1&&p.dDone==null)p.dDone=T;try{p.fn(p,REDUCE?0:T,D)}catch(e){console.warn(e)}}}
requestAnimationFrame(loop);
window.__values=()=>items.map(p=>({k:p.k,t0:p.t0,done:p.dDone!=null}));
})();
