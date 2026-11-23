/* VALUES の図・各語3案（A＝今の図を動き続ける形に、B・C＝新しい案）。<canvas data-f="fun-a"> など。
   画面に入ると線で描かれ（D：0→1）、描き終わった後も動き続ける。動かすのは見えている canvas だけ。
   prefers-reduced-motion では描き終わった1枚で止める。朱は各図1点。文字は描かない。 */
(()=>{
'use strict';
const TAU=Math.PI*2, DPR=Math.min(2,window.devicePixelRatio||1);
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v, mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const INK='21,21,19',SIG='239,69,25',CARD='251,250,246';
const ink=a=>`rgba(${INK},${a})`,sig=a=>`rgba(${SIG},${a})`;
function rng(seed){let s=seed%2147483647;if(s<=0)s+=2147483646;return()=>(s=s*16807%2147483647)/2147483647}
const hash=n=>{let x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
const NZ=(()=>{const r=rng(77),v=[];for(let i=0;i<512;i++)v.push(r()*2-1);return x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return mix(v[i&511],v[(i+1)&511],u)}})();
function cum(pts){const L=[0];for(let i=1;i<pts.length;i++)L.push(L[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return L}
function part(ctx,pts,k,L){if(k<=0||pts.length<2)return null;L=L||cum(pts);const d=L[L.length-1]*Math.min(1,k);ctx.moveTo(pts[0][0],pts[0][1]);
  for(let i=1;i<pts.length;i++){if(L[i]<=d){ctx.lineTo(pts[i][0],pts[i][1]);continue}const f=(d-L[i-1])/((L[i]-L[i-1])||1),x=mix(pts[i-1][0],pts[i][0],f),y=mix(pts[i-1][1],pts[i][1],f);ctx.lineTo(x,y);return[x,y]}
  const q=pts[pts.length-1];return[q[0],q[1]]}
const sq=(ctx,x,y,s,c)=>{ctx.fillStyle=c;ctx.fillRect(x-s/2,y-s/2,s,s)};
const hollow=(ctx,x,y,s,a)=>{ctx.fillStyle=`rgba(${CARD},1)`;ctx.fillRect(x-s/2,y-s/2,s,s);ctx.strokeStyle=ink(a);ctx.lineWidth=1;ctx.strokeRect(x-s/2,y-s/2,s,s)};
const line=(ctx,a,w,dash)=>{ctx.strokeStyle=ink(a);ctx.lineWidth=w||1;ctx.setLineDash(dash||[])};
function catmull(P,n){const out=[];for(let i=0;i<P.length-1;i++){const p0=P[i-1]||P[i],p1=P[i],p2=P[i+1],p3=P[i+2]||P[i+1];
  for(let j=0;j<n;j++){const t=j/n,t2=t*t,t3=t2*t;out.push([0,1].map(k=>.5*((2*p1[k])+(-p0[k]+p2[k])*t+(2*p0[k]-5*p1[k]+4*p2[k]-p3[k])*t2+(-p0[k]+3*p1[k]-3*p2[k]+p3[k])*t3)))}}
  out.push(P[P.length-1]);return out}
const since=p=>p.dDone==null?0:p.T-p.dDone;   /* 描き終えてからの秒数 */

/* =================== FUN (PLAY) =================== */
/* A：スピログラフ。歯車が輪の内側を転がって花びらを描き、描き終えた後も歯車が回り続ける */
function funA(p,t,D){const {ctx,w,h}=p;
  const R=10,r=3,d=2.3,s=Math.min(w,h)*.46/(R-r+d),cx=w/2,cy=h/2,TH=TAU*3,N=720;
  if(!p.pts){p.pts=[];for(let i=0;i<=N;i++){const a=TH*i/N;p.pts.push([cx+s*((R-r)*Math.cos(a)+d*Math.cos((R-r)/r*a)),cy+s*((R-r)*Math.sin(a)-d*Math.sin((R-r)/r*a))])}p.L=cum(p.pts)}
  const ring=ss(0,.18,D);line(ctx,.3*ring,.8,[3,4]);ctx.beginPath();ctx.arc(cx,cy,R*s,-Math.PI/2,-Math.PI/2+TAU*ring);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(cx-6,cy);ctx.lineTo(cx+6,cy);ctx.moveTo(cx,cy-6);ctx.lineTo(cx,cy+6);ctx.stroke();
  const k=clamp((D-.08)/.92),done=D>=1;if(k<=0)return;
  line(ctx,.55);ctx.beginPath();part(ctx,p.pts,done?1:eio(k),p.L);ctx.stroke();
  const a=done?TH+since(p)*.32:TH*eio(k);
  const gx=cx+s*(R-r)*Math.cos(a),gy=cy+s*(R-r)*Math.sin(a),px=gx+s*d*Math.cos((R-r)/r*a),py=gy-s*d*Math.sin((R-r)/r*a);
  line(ctx,.42,.8);ctx.beginPath();ctx.arc(gx,gy,r*s,0,TAU);ctx.stroke();
  ctx.beginPath();const sp=-(R-r)/r*a;for(let i=0;i<10;i++){const b=sp+i*TAU/10;ctx.moveTo(gx+Math.cos(b)*r*s*.86,gy+Math.sin(b)*r*s*.86);ctx.lineTo(gx+Math.cos(b)*r*s,gy+Math.sin(b)*r*s)}ctx.stroke();
  line(ctx,.6);ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(px,py);ctx.stroke();ctx.fillStyle=ink(.8);ctx.fillRect(gx-1.5,gy-1.5,3,3);
  sq(ctx,px,py,8,sig(1))}
/* B：はずむ球。床に目盛り、球が弾むたびに点線の放物線が残り、古い線から消える */
function funB(p,t,D){const {ctx,w,h}=p;const fy=h*.84,bw=Math.max(70,w*.16),vx=bw*.85;
  line(ctx,.45);ctx.beginPath();part(ctx,[[w*.04,fy],[w*.96,fy]],ss(0,.35,D));ctx.stroke();
  if(D<.35)return;const T=since(p),u=(D<1?(D-.35)/.65*bw*.99:bw*.99+T*vx),span=Math.max(1,Math.floor(w*.92/bw))*bw;
  const H=k=>h*(.3+.38*hash(k)),k0=Math.floor(u/bw);
  for(let j=0;j<5;j++){const k=k0-j;if(k<0)break;const xs=w*.04+(k*bw)%span;const f=j===0?(u/bw-k):1;const Hk=H(k);
    const pts=[];for(let i=0;i<=24;i++){const q=i/24*f;pts.push([xs+q*bw,fy-4*Hk*q*(1-q)])}
    line(ctx,(j===0?.5:.42*(1-j/5)),.9,[3,4]);ctx.beginPath();part(ctx,pts,1);ctx.stroke();ctx.setLineDash([]);
    line(ctx,.5*(1-j/5));ctx.beginPath();ctx.moveTo(xs,fy);ctx.lineTo(xs,fy+6);ctx.stroke();
    if(j===0){const x=xs+f*bw,y=fy-4*Hk*f*(1-f);sq(ctx,x,y-4,9,sig(1))}}}
/* C：振り子の波。長さの違う振り子が少しずつずれて揺れ、波・ほどけ・そろいを繰り返す（60秒で一巡） */
function funC(p,t,D){const {ctx,w,h}=p;const n=15,x0=w*.1,x1=w*.9,top=h*.12,cy=h*.6,A=h*.26;
  line(ctx,.55);ctx.beginPath();part(ctx,[[x0-10,top],[x1+10,top]],ss(0,.3,D));ctx.stroke();
  const T=since(p)+3,e=ss(.25,1,D),ys=[];
  for(let i=0;i<n;i++){const x=mix(x0,x1,i/(n-1)),per=60/(30+i),y=cy+A*e*Math.cos(TAU*T/per);ys.push([x,y]);
    const kk=clamp((D*1.5-.3-i*.04)/.3);if(kk<=0)continue;line(ctx,.3);ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x,mix(top,y,kk));ctx.stroke()}
  if(e>0){line(ctx,.25*e,.8,[2,4]);ctx.beginPath();ys.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke();ctx.setLineDash([]);
    ys.forEach((q,i)=>{if(i===7)return;ctx.fillStyle=ink(.85*e);ctx.beginPath();ctx.arc(q[0],q[1],3.2,0,TAU);ctx.fill()});sq(ctx,ys[7][0],ys[7][1],8,sig(e))}}

/* =================== Free =================== */
/* A：点線の囲いの口から1本の線が出て外を自由に伸び、先が風のように揺れ続ける */
function freeA(p,t,D){const {ctx,w,h}=p;const bx=w*.08,by=h*.2,bw=w*.3,bh=h*.6,gy0=h*.42,gy1=h*.58;
  line(ctx,.42,.8,[3,4]);ctx.beginPath();part(ctx,[[bx+bw,gy0],[bx+bw,by],[bx,by],[bx,by+bh],[bx+bw,by+bh],[bx+bw,gy1]],ss(0,.22,D));ctx.stroke();ctx.setLineDash([]);
  if(D>=.22){line(ctx,.3);ctx.beginPath();for(let i=1;i<6;i++){const x=bx+bw*i/6;ctx.moveTo(x,by);ctx.lineTo(x,by+5)}ctx.stroke()}
  if(!p.base)p.base=catmull([[.2,.56],[.27,.36],[.33,.5],[.25,.64],[.38,.5],[.52,.3],[.66,.66],[.8,.34],[.93,.47]].map(q=>[q[0]*w,q[1]*h]),24);
  const n=p.base.length,tt=since(p),pts=p.base.map((q,i)=>{const s=i/(n-1),e=Math.pow(clamp((s-.45)/.55),1.6);return[q[0]+NZ(s*4+tt*.35+40)*h*.05*e,q[1]+NZ(s*3+tt*.32)*h*.16*e]});
  line(ctx,.55);ctx.beginPath();const tip=part(ctx,pts,D>=1?1:eio(clamp((D-.18)/.82)));ctx.stroke();
  sq(ctx,pts[0][0],pts[0][1],5,ink(.8));if(tip)sq(ctx,tip[0],tip[1],8,sig(1))}
/* B：決まった席（格子の点）から、いくつかの点が席を離れて自由に動き回る。空いた席は白抜き */
function freeB(p,t,D){const {ctx,w,h}=p;const C=7,R=4,gx=i=>w*(.12+.76*i/(C-1)),gy=j=>h*(.2+.6*j/(R-1));
  if(!p.rm){const r=rng(5);p.rm=[[1,1],[4,0],[5,2],[2,3],[6,3]].map((s,i)=>({s,ph:r()*50,tr:[]}))}
  const g=ss(0,.35,D),away=ss(.4,1,D),T=since(p)+(D<1?0:0),tt=T+(D<1?(D-.4)*2:0);
  for(let j=0;j<R;j++)for(let i=0;i<C;i++){const kk=clamp((g*1.6-(i+j)*.06));if(kk<=0)continue;const isR=p.rm.some(m=>m.s[0]===i&&m.s[1]===j);
    if(isR&&away>.05)hollow(ctx,gx(i),gy(j),6,.55*kk);else{ctx.fillStyle=ink(.55*kk);ctx.fillRect(gx(i)-2,gy(j)-2,4,4)}}
  p.rm.forEach((m,i)=>{const sx=gx(m.s[0]),sy=gy(m.s[1]);const wx=w*(.5+.44*NZ(tt*.11+m.ph)),wy=h*(.5+.42*NZ(tt*.09+m.ph+90));
    const x=mix(sx,wx,away),y=mix(sy,wy,away);if(away>0){m.tr.push([x,y]);if(m.tr.length>70)m.tr.shift()}
    if(m.tr.length>1){line(ctx,.22,.8);ctx.beginPath();m.tr.forEach((q,k)=>k?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke()}
    if(away>0){if(i===0)sq(ctx,x,y,8,sig(1));else{ctx.fillStyle=ink(.85);ctx.fillRect(x-3,y-3,6,6)}}})}
/* C：線だけの地球儀がゆっくり回り、1つの点が大圏を旅し続ける（場所に捉われず） */
function freeC(p,t,D){const {ctx,w,h}=p;const r=Math.min(w*.3,h*.44),cx=w/2,cy=h/2,tilt=.38,rot=since(p)*.12+.6,ct=Math.cos(tilt),st=Math.sin(tilt);
  const P=(lat,lon)=>{const x=Math.cos(lat)*Math.sin(lon),y=Math.sin(lat),z=Math.cos(lat)*Math.cos(lon);const y2=y*ct-z*st,z2=y*st+z*ct;return[cx+r*x,cy-r*y2,z2]};
  const k=ss(0,.6,D);line(ctx,.55);ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+TAU*k);ctx.stroke();
  const a=ss(.3,.9,D);if(a<=0)return;
  const curve=f=>{const fr=[],bk=[];let prev=null;for(let i=0;i<=48;i++){const q=f(i/48);const seg=q[2]>=0?fr:bk;if(prev&&(prev[2]>=0)!==(q[2]>=0))seg.push(null);seg.push(q);prev=q}return[fr,bk]};
  const stroke=(arr,al)=>{line(ctx,al,.8);ctx.beginPath();let m=true;for(const q of arr){if(!q){m=true;continue}m?ctx.moveTo(q[0],q[1]):ctx.lineTo(q[0],q[1]);m=false}ctx.stroke()};
  for(let i=0;i<6;i++){const [f,b]=curve(s=>P(-Math.PI/2+Math.PI*s,i*Math.PI/6+rot));stroke(f,.4*a);stroke(b,.1*a)}
  for(let j=1;j<5;j++){const lat=-Math.PI/2+Math.PI*j/5;const [f,b]=curve(s=>P(lat,TAU*s+rot));stroke(f,.32*a);stroke(b,.08*a)}
  /* 旅する点：赤道から傾いた大圏 */
  const tr=since(p)*.9+2,G=s=>P(.62*Math.sin(s*.7+.4),1.15*Math.sin(s*.45));
  line(ctx,.35*a,.8,[2,3]);ctx.beginPath();let first=true;for(let i=0;i<=40;i++){const q=G(tr-3+3*i/40);if(q[2]<0){first=true;continue}first?ctx.moveTo(q[0],q[1]):ctx.lineTo(q[0],q[1]);first=false}ctx.stroke();ctx.setLineDash([]);
  const q=G(tr);sq(ctx,q[0],q[1],8,sig(a*(q[2]>=0?1:.35)))}

/* =================== Flat =================== */
/* A：7本の柱がそろう。そろった後も、ときどき1本が上下にずれ、また同じ高さへ戻る。水準器の泡がずれに合わせて動く */
function flatA(p,t,D){const {ctx,w,h}=p;const n=7,x0=w*.12,x1=w*.88,g=(x1-x0)/n,bw=g*.5,base=h*.86,hf=h*.36;
  if(!p.hi){const r=rng(12);p.hi=[];for(let i=0;i<n;i++)p.hi.push(.14+r()*.5);p.hi[3]=.66;p.hi[1]=.18}
  const draw=clamp(D/.5),lev=eio(clamp((D-.5)/.5)),T=since(p),P=3.4,c=Math.floor(T/P),f=T/P-c,idx=Math.floor(hash(c+3)*n),sgn=hash(c+9)<.5?-1:1;
  const dev=D<1?0:sgn*h*(.08+.1*hash(c))*(f<.18?ss(0,.18,f):1-ss(.25,.8,f));
  line(ctx,.4,.8);ctx.beginPath();ctx.moveTo(w*.06,base);ctx.lineTo(w*.06+w*.88*ss(0,.2,D),base);ctx.stroke();
  line(ctx,.55);ctx.beginPath();
  for(let i=0;i<n;i++){const kk=clamp((draw*1.4-i*.06)/.6);if(kk<=0)continue;const x=x0+g*i+(g-bw)/2,hh=mix(p.hi[i]*h,hf,lev)+(i===idx?dev:0)+(D>=1?Math.sin(T*1.6+i*.9)*1:0);part(ctx,[[x,base],[x,base-hh],[x+bw,base-hh],[x+bw,base]],kk)}
  ctx.stroke();
  if(lev>0){line(ctx,.42*lev,.8,[3,4]);ctx.beginPath();ctx.moveTo(w*.06,base-hf);ctx.lineTo(w*.94,base-hf);ctx.stroke();ctx.setLineDash([])}
  const lw=Math.min(w*.34,170),lh=14,lx=w/2-lw/2,ly=h*.08,la=ss(.1,.35,D);if(la<=0)return;
  line(ctx,.55*la);ctx.strokeRect(lx,ly,lw,lh);ctx.beginPath();ctx.moveTo(w/2-lh*.8,ly);ctx.lineTo(w/2-lh*.8,ly+lh);ctx.moveTo(w/2+lh*.8,ly);ctx.lineTo(w/2+lh*.8,ly+lh);ctx.stroke();
  const off=(1-lev)*lw*.36+dev/h*lw*.9*((idx-(n-1)/2)/((n-1)/2)||.4);sq(ctx,w/2+clamp(off,-lw/2+6,lw/2-6),ly+lh/2,8,sig(la))}
/* B：上下の木（組織図）がたたまれて1列に並び、横の線で全員がつながる。点が誰から誰へも同じ道で行き来する */
function flatB(p,t,D){const {ctx,w,h}=p;
  const tree=[[.5,.16],[.3,.42],[.7,.42],[.18,.7],[.42,.7],[.58,.7],[.82,.7]],E=[[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]];
  const n=7,row=i=>[.1+.8*i/(n-1),.62],m=eio(clamp((D-.42)/.5)),RI=[3,1,5,0,2,4,6],pos=tree.map((q,i)=>{const r=row(RI[i]);return[w*mix(q[0],r[0],m),h*mix(q[1],r[1],m)]});
  /* 木の線（たたまれると消える） */
  const kd=clamp(D/.4);line(ctx,.5*(1-m));ctx.beginPath();E.forEach(([a,b],j)=>{const kk=clamp(kd*1.5-j*.1);if(kk>0)part(ctx,[pos[a],[pos[a][0],mix(pos[a][1],pos[b][1],.5)],[pos[b][0],mix(pos[a][1],pos[b][1],.5)],pos[b]],kk)});ctx.stroke();
  /* 並んだ後：床の線と、隣どうしの弧 */
  if(m>0){const y=pos[0][1];line(ctx,.4*m);ctx.beginPath();ctx.moveTo(w*.06,y+18);ctx.lineTo(w*.94,y+18);ctx.stroke();
    const order=[...pos].sort((a,b)=>a[0]-b[0]);line(ctx,.22*m,.8);ctx.beginPath();
    for(let i=0;i<n;i++)for(let j=i+1;j<Math.min(n,i+3);j++){const a=order[i],b=order[j],cx=(a[0]+b[0])/2,r=(b[0]-a[0])/2;ctx.moveTo(b[0],a[1]);ctx.arc(cx,a[1],r,0,Math.PI,true)}ctx.stroke();
    /* 行き来する点 */
    if(D>=1){const T=since(p),c=Math.floor(T/1.3),f=ss(0,1,T/1.3-c),a=Math.floor(hash(c)*n),st=1+Math.floor(hash(c+5)*2),bb=a+st<n?a+st:a-st,A=order[Math.min(a,bb)],B=order[Math.max(a,bb)],dir=a<bb?1:-1;
      if(A!==B){const cx=(A[0]+B[0])/2,r=(B[0]-A[0])/2,ang=Math.PI+(dir>0?f:1-f)*Math.PI;sq(ctx,cx+r*Math.cos(ang),A[1]+r*Math.sin(ang),8,sig(1))}}}
  pos.forEach(q=>hollow(ctx,q[0],q[1],9,.75*ss(0,.25,D)))}
/* C：連通管。形の違う5つの器の水面が同じ高さにそろい、ゆるやかに波打つ。1つの器に朱の浮き */
function flatC(p,t,D){const {ctx,w,h}=p;const base=h*.86,top=h*.16,tube=10,L=h*.5;
  const V=[[.1,.15,.1,.15],[.26,.31,.2,.37],[.45,.57,.45,.57],[.66,.78,.7,.74],[.86,.91,.9,.95]]; /* 底の左右・口の左右 */
  const X=(v,y)=>{const f=(base-y)/(base-top);return[w*mix(v[0],v[2],f),w*mix(v[1],v[3],f)]};
  const k=clamp(D/.5),T=since(p),lev=mix(base-4,L,eio(clamp((D-.45)/.55)))+(D>=1?Math.sin(T*.9)*2:0);
  /* 水 */
  if(D>.45){ctx.fillStyle=ink(.06);V.forEach((v,i)=>{ctx.beginPath();const N=12,[l0,r0]=X(v,lev);for(let j=0;j<=N;j++){const x=mix(l0,r0,j/N);ctx.lineTo(x,lev+Math.sin(x*.05+T*2.2)*1.6)}const [lb,rb]=X(v,base);ctx.lineTo(rb,base);ctx.lineTo(lb,base);ctx.fill()});
    ctx.fillRect(w*V[0][0],base,w*(V[4][1]-V[0][0]),tube);
    line(ctx,.55);ctx.beginPath();V.forEach(v=>{const [l0,r0]=X(v,lev);for(let j=0;j<=12;j++){const x=mix(l0,r0,j/12),y=lev+Math.sin(x*.05+T*2.2)*1.6;j?ctx.lineTo(x,y):ctx.moveTo(x,y)}});ctx.stroke();
    const v=V[2],[l0,r0]=X(v,lev),fx=(l0+r0)/2+Math.sin(T*.7)*(r0-l0)*.18;sq(ctx,fx,lev+Math.sin(fx*.05+T*2.2)*1.6-3,8,sig(1))}
  /* 器と管 */
  line(ctx,.55);ctx.beginPath();V.forEach((v,i)=>{const kk=clamp(k*1.6-i*.12);if(kk<=0)return;const [lb,rb]=X(v,base),[lt,rt]=X(v,top);part(ctx,[[lt,top],[lb,base]],kk);part(ctx,[[rt,top],[rb,base]],kk)});
  part(ctx,[[w*V[0][0],base+tube],[w*V[4][1],base+tube]],k);ctx.stroke();
  line(ctx,.4,.8);ctx.beginPath();for(let i=0;i<4;i++){const a=X(V[i],base)[1],b=X(V[i+1],base)[0];ctx.moveTo(a,base);ctx.lineTo(mix(a,b,k),base)}ctx.stroke();
  if(D>.45){line(ctx,.35,.8,[3,4]);ctx.beginPath();ctx.moveTo(w*.03,L);ctx.lineTo(w*.97,L);ctx.stroke();ctx.setLineDash([])}}

/* =================== Open =================== */
/* A：箱の4枚の壁が外へ倒れて展開図になる。開いたままの時間が長く、ときどき箱に戻ってはまた開く */
function openA(p,t,D){const {ctx,w,h}=p;const a=Math.min(w,h)*.25,cx=w/2-a*.1,cy=h/2+a*.12,ob=.42,P=(x,y,z)=>[x+z*ob,y-z*ob];
  const T=since(p),cyc=9,f=(T%cyc)/cyc,fold=D<1?0:ss(.5,.66,f)*(1-ss(.74,.92,f));
  const ang=D<.42?Math.PI/2:Math.PI/2*Math.max(1-eio(clamp((D-.42)/.58)),fold);
  const c=Math.cos(ang),s=Math.sin(ang),A=a/2;
  const B=[[cx-A,cy-A],[cx+A,cy-A],[cx+A,cy+A],[cx-A,cy+A],[cx-A,cy-A]].map(q=>P(q[0],q[1],0));
  const W=[[[cx-A,cy-A,0],[cx+A,cy-A,0],[cx+A,cy-A-a*c,a*s],[cx-A,cy-A-a*c,a*s]],[[cx+A,cy-A,0],[cx+A,cy+A,0],[cx+A+a*c,cy+A,a*s],[cx+A+a*c,cy-A,a*s]],
           [[cx+A,cy+A,0],[cx-A,cy+A,0],[cx-A,cy+A+a*c,a*s],[cx+A,cy+A+a*c,a*s]],[[cx-A,cy+A,0],[cx-A,cy-A,0],[cx-A-a*c,cy-A,a*s],[cx-A-a*c,cy+A,a*s]]].map(q=>q.map(v=>P(v[0],v[1],v[2])));
  const k0=clamp(D/.42);line(ctx,.55);ctx.beginPath();part(ctx,B,D>=.42?1:clamp(k0/.4));ctx.stroke();
  W.forEach((q,i)=>{const kk=D>=.42?1:clamp((k0-.3-i*.12)/.34);if(kk<=0)return;ctx.beginPath();part(ctx,[q[1],q[2],q[3],q[0]],kk);ctx.stroke()});
  const fl=clamp((D-.5)/.3)*(1-fold);if(fl>0){line(ctx,.5*fl,.8,[3,3]);ctx.beginPath();part(ctx,B,1);ctx.stroke();ctx.setLineDash([])}
  if(D>=.2)sq(ctx,...P(cx,cy,0),8,sig(ss(.2,.4,D)))}
/* B：絞り（アイリス）。6枚の羽根がゆっくり開いていき、開いた状態でわずかに呼吸する */
function openB(p,t,D){const {ctx,w,h}=p;const R=Math.min(w,h)*.4,cx=w/2,cy=h/2,T=since(p);
  const k=ss(0,.35,D);line(ctx,.55);ctx.beginPath();ctx.arc(cx,cy,R,-Math.PI/2,-Math.PI/2+TAU*k);ctx.stroke();
  line(ctx,.3*k,.8);ctx.beginPath();ctx.arc(cx,cy,R*1.07,0,TAU);ctx.stroke();
  const op=D<1?mix(.12,.78,eio(clamp((D-.3)/.7))):.66+.12*Math.sin(T*.55);if(D<.3)return;
  const ap=R*op,rot=(1-op)*1.4+.2,V=[];for(let i=0;i<6;i++){const an=rot+i*TAU/6;V.push([cx+ap*Math.cos(an),cy+ap*Math.sin(an)])}
  line(ctx,.55*ss(.3,.5,D));ctx.beginPath();
  for(let i=0;i<6;i++){const a=V[i],b=V[(i+1)%6],dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L;
    /* a→b を延ばして外の円と交わる所まで */
    const fx=a[0]-cx,fy=a[1]-cy,B2=fx*ux+fy*uy,C2=fx*fx+fy*fy-R*R,tt=-B2+Math.sqrt(Math.max(0,B2*B2-C2));ctx.moveTo(a[0],a[1]);ctx.lineTo(a[0]+ux*tt,a[1]+uy*tt)}
  ctx.stroke();line(ctx,.25,.8);ctx.beginPath();V.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.closePath();ctx.stroke();
  sq(ctx,cx,cy,8,sig(ss(.4,.6,D)))}
/* C：向き合う2つ。両側から交互に弧（声）が出て、相手まで届く。真ん中の線上で出会う所に朱の点 */
function openC(p,t,D){const {ctx,w,h}=p;const cy=h*.52,xl=w*.16,xr=w*.84,s=Math.min(w,h)*.13,T=since(p);
  const k=ss(0,.35,D);line(ctx,.55);
  [[xl,1],[xr,-1]].forEach(([x,dir])=>{ctx.beginPath();part(ctx,[[x-dir*s*.2,cy-s],[x-dir*s*.2,cy+s],[x-dir*s*.9,cy+s],[x-dir*s*.9,cy-s],[x-dir*s*.2,cy-s]],k);ctx.stroke()});
  line(ctx,.3*k,.8,[3,4]);ctx.beginPath();ctx.moveTo(w/2,cy-h*.32);ctx.lineTo(w/2,cy+h*.32);ctx.moveTo(xl,cy);ctx.lineTo(xr,cy);ctx.stroke();ctx.setLineDash([]);
  const e=ss(.3,1,D);if(e<=0)return;const gap=(xr-xl)/7,spd=gap*.55,span=xr-xl;
  [[xl,1,0],[xr,-1,gap/2]].forEach(([x0,dir,off])=>{for(let i=0;i<8;i++){const d=((T*spd+off+i*gap)%span);const x=x0+dir*d,rr=s*.6+d*.35,al=.5*e*ss(0,gap*.6,d)*(1-ss(span*.7,span,d));if(al<.01)continue;
    line(ctx,al,.9);ctx.beginPath();const c=x-dir*rr;ctx.arc(c,cy,rr,dir>0?-.35:Math.PI-.35,dir>0?.35:Math.PI+.35);ctx.stroke()}});
  sq(ctx,w/2,cy,8,sig(e))}

/* =================== Optimization =================== */
function optCurve(p,w,h){if(p.cv)return;const N=220,raw=[];for(let i=0;i<=N;i++){const u=i/N;raw.push(.18*Math.sin(u*TAU*1.25+.6)+.1*Math.sin(u*TAU*3.2+1.1)+.05*Math.sin(u*TAU*5.6+.3)-.26*Math.exp(-Math.pow((u-.7)/.07,2)))}
  const mn=Math.min(...raw),mx=Math.max(...raw);p.cv=raw.map((v,i)=>[w*(.06+.88*i/N),h*(.22+.6*(1-(v-mn)/(mx-mn)))]);
  p.loc=[];for(let i=2;i<N-1;i++)if(p.cv[i][1]>p.cv[i-1][1]&&p.cv[i][1]>=p.cv[i+1][1])p.loc.push(i);p.gi=p.loc.reduce((b,i)=>p.cv[i][1]>p.cv[b][1]?i:b,p.loc[0]);p.top=Math.min(...p.cv.map(q=>q[1]))}
/* A：山と谷の線。小さな谷の中を玉が行き来し（部分最適）、上から水平線が何度も下りてきて、いちばん低い谷を指す */
function optA(p,t,D){const {ctx,w,h}=p;optCurve(p,w,h);const cv=p.cv,axY=h*.9,T=since(p);
  line(ctx,.35,.8);ctx.beginPath();ctx.moveTo(w*.06,axY);ctx.lineTo(w*.06+w*.88*ss(0,.2,D),axY);ctx.stroke();
  line(ctx,.55);ctx.beginPath();part(ctx,cv,eio(clamp(D/.42)));ctx.stroke();
  const others=p.loc.filter(i=>i!==p.gi);others.forEach((i,j)=>{const a=ss(.42+j*.06,.5+j*.06,D);if(a>0)hollow(ctx,cv[i][0],cv[i][1],7,.7*a)});
  /* 部分最適の谷を行き来する玉 */
  if(D>=1&&others.length){const i0=others[0],sw=Math.round(9*Math.sin(T*1.7)),q=cv[clamp(i0+sw,0,cv.length-1)];ctx.fillStyle=ink(.8);ctx.beginPath();ctx.arc(q[0],q[1]-4,3.2,0,TAU);ctx.fill()}
  const sc=D<1?clamp((D-.62)/.33):ss(.1,.6,(T%6)/6);if(sc>0){const y=mix(p.top-12,cv[p.gi][1],eio(sc)),al=D<1?.45:.45*(1-ss(.8,1,(T%6)/6));line(ctx,al,.8,[3,4]);ctx.beginPath();ctx.moveTo(w*.04,y);ctx.lineTo(w*.96,y);ctx.stroke();ctx.setLineDash([])}
  if(D>=.95){const a=ss(.95,1,D),x=cv[p.gi][0],y=cv[p.gi][1];line(ctx,.4*a,.8,[2,3]);ctx.beginPath();ctx.moveTo(x,y+6);ctx.lineTo(x,axY);ctx.stroke();ctx.setLineDash([]);
    line(ctx,.6*a);ctx.beginPath();ctx.moveTo(x,axY-4);ctx.lineTo(x,axY+4);ctx.stroke();sq(ctx,x,y,8,sig(a))}}
/* B：ばらばらの向きの矢印が、全体で1つの流れの向きにそろう。そろった流れに沿って粒が流れ続ける */
function optB(p,t,D){const {ctx,w,h}=p;const C=11,R=5,T=since(p);
  const fld=(x,y)=>.32*Math.sin(y/h*3.1+x/w*2.2)-.12;
  if(!p.ar){const r=rng(21);p.ar=[];for(let j=0;j<R;j++)for(let i=0;i<C;i++)p.ar.push({x:w*(.08+.84*i/(C-1)),y:h*(.16+.68*j/(R-1)),a0:r()*TAU});
    p.pt=[];for(let i=0;i<9;i++)p.pt.push({x:r()*w,y:h*(.1+.8*r()),tr:[]})}
  const al=eio(clamp((D-.35)/.65)),c=Math.floor(T/4),pk=Math.floor(hash(c)*p.ar.length),pf=(T%4)/4,wob=D>=1?(1-ss(0,.7,pf))*Math.sin(pf*18)*1.2:0;
  line(ctx,.55);ctx.beginPath();
  p.ar.forEach((q,i)=>{const kk=clamp(D*3-i*.02);if(kk<=0)return;let a=mix(q.a0,fld(q.x,q.y)+Math.round((q.a0-fld(q.x,q.y))/TAU)*TAU,al);if(i===pk)a+=wob;
    const L=Math.min(w,h)*.045*kk,dx=Math.cos(a)*L,dy=Math.sin(a)*L;ctx.moveTo(q.x-dx,q.y-dy);ctx.lineTo(q.x+dx,q.y+dy);
    ctx.moveTo(q.x+dx,q.y+dy);ctx.lineTo(q.x+dx-Math.cos(a-.5)*4,q.y+dy-Math.sin(a-.5)*4);ctx.moveTo(q.x+dx,q.y+dy);ctx.lineTo(q.x+dx-Math.cos(a+.5)*4,q.y+dy-Math.sin(a+.5)*4)});
  ctx.stroke();
  if(D<1)return;const dt=Math.min(.05,p.dt||.016);
  p.pt.forEach((q,i)=>{const a=fld(q.x,q.y);q.x+=Math.cos(a)*w*.07*dt;q.y+=Math.sin(a)*w*.07*dt;q.tr.push([q.x,q.y]);if(q.tr.length>28)q.tr.shift();
    if(q.x>w+10||q.y<-10||q.y>h+10){q.x=-10;q.y=h*(.1+.8*hash(T+i));q.tr=[]}
    if(q.tr.length>1){line(ctx,.3,.9);ctx.beginPath();q.tr.forEach((r,k)=>k?ctx.lineTo(r[0],r[1]):ctx.moveTo(r[0],r[1]));ctx.stroke()}
    if(i===0)sq(ctx,q.x,q.y,8,sig(1));else{ctx.fillStyle=ink(.8);ctx.fillRect(q.x-2,q.y-2,4,4)}})}
/* C：等高線の地形。あちこちから下り始めた道が、小さな窪み（部分最適）に止まると、いちばん深い窪みへ跳ぶ。何度も繰り返す */
function optC(p,t,D){const {ctx,w,h}=p;const T=since(p);
  const F=(u,v)=>-1*Math.exp(-((u-.7)**2+(v-.58)**2)/.035)-.62*Math.exp(-((u-.27)**2+(v-.36)**2)/.02)-.35*Math.exp(-((u-.4)**2+(v-.8)**2)/.012)+.18*v*v+.1*(u-.5)**2;
  const X=u=>w*(.04+.92*u),Y=v=>h*(.06+.88*v);
  if(!p.seg){const G=64,Gy=Math.round(G*h/w)+8,val=[];let mn=1e9,mx=-1e9;
    for(let j=0;j<=Gy;j++){val.push([]);for(let i=0;i<=G;i++){const f=F(i/G,j/Gy);val[j].push(f);mn=Math.min(mn,f);mx=Math.max(mx,f)}}
    p.seg=[];for(let l=1;l<=9;l++){const L=mix(mn,mx,l/10)*1;const S=[];
      for(let j=0;j<Gy;j++)for(let i=0;i<G;i++){const a=val[j][i],b=val[j][i+1],c=val[j+1][i+1],d=val[j+1][i];const pts=[];
        const ed=(v1,v2,x1,y1,x2,y2)=>{if((v1<L)!==(v2<L)){const f=(L-v1)/(v2-v1);pts.push([X(mix(x1,x2,f)/G),Y(mix(y1,y2,f)/Gy)])}};
        ed(a,b,i,j,i+1,j);ed(b,c,i+1,j,i+1,j+1);ed(c,d,i+1,j+1,i,j+1);ed(d,a,i,j+1,i,j);if(pts.length>=2)S.push(pts[0],pts[1]);if(pts.length===4)S.push(pts[2],pts[3])}
      p.seg.push(S)}
    p.gmin=[.7,.58]}
  const k=ss(0,.5,D);p.seg.forEach((S,l)=>{const kk=clamp(k*1.8-l*.08);if(kk<=0)return;line(ctx,(l<3?.42:.24)*kk,.8);ctx.beginPath();for(let i=0;i<S.length;i+=2){ctx.moveTo(S[i][0],S[i][1]);ctx.lineTo(S[i+1][0],S[i+1][1])}ctx.stroke()});
  const gx=X(p.gmin[0]),gy=Y(p.gmin[1]);
  if(D>=.5){const CY=5.5,c=Math.floor(T/CY),f=(T%CY)/CY;
    if(p.c!==c){p.c=c;const a=hash(c*3+1)*TAU;let u=.5+.47*Math.cos(a),v=.5+.47*Math.sin(a);u=clamp(u,.03,.97);v=clamp(v,.03,.97);const path=[[u,v]];
      for(let s=0;s<400;s++){const e=.002,gu=(F(u+e,v)-F(u-e,v))/(2*e),gv=(F(u,v+e)-F(u,v-e))/(2*e),gl=Math.hypot(gu,gv);if(gl<.02)break;u-=gu/gl*.008;v-=gv/gl*.008;path.push([u,v])}
      p.path=path.map(q=>[X(q[0]),Y(q[1])]);const end=path[path.length-1];p.local=Math.hypot(end[0]-p.gmin[0],end[1]-p.gmin[1])>.06}
    const fade=1-ss(.85,1,f),kp=D<1?0:ss(0,.5,f);
    if(kp>0){line(ctx,.6*fade,1);ctx.beginPath();const tip=part(ctx,p.path,kp);ctx.stroke();if(tip){ctx.fillStyle=ink(.85*fade);ctx.fillRect(tip[0]-2.5,tip[1]-2.5,5,5)}
      const e=p.path[p.path.length-1];if(p.local&&f>.5){hollow(ctx,e[0],e[1],8,.75*fade);const kj=ss(.55,.75,f);line(ctx,.5*fade,.9,[3,4]);ctx.beginPath();ctx.moveTo(e[0],e[1]);const mx2=(e[0]+gx)/2,my2=Math.min(e[1],gy)-h*.18;
        const J=[];for(let i=0;i<=20;i++){const s=i/20;J.push([(1-s)*(1-s)*e[0]+2*(1-s)*s*mx2+s*s*gx,(1-s)*(1-s)*e[1]+2*(1-s)*s*my2+s*s*gy])}part(ctx,J,kj);ctx.stroke();ctx.setLineDash([])}}
    sq(ctx,gx,gy,8,sig(ss(.5,.7,D)))}}

const ART={'fun-a':funA,'fun-b':funB,'fun-c':funC,'free-a':freeA,'free-b':freeB,'free-c':freeC,'flat-a':flatA,'flat-b':flatB,'flat-c':flatC,
  'open-a':openA,'open-b':openB,'open-c':openC,'opt-a':optA,'opt-b':optB,'opt-c':optC};
window.VFIGS=ART;
const items=[];let T=0;
function size(p){const r=p.c.getBoundingClientRect();if(!r.width||!r.height)return;p.w=r.width;p.h=r.height;p.c.width=Math.round(r.width*DPR);p.c.height=Math.round(r.height*DPR);
  p.ctx.setTransform(DPR,0,0,DPR,0,0);p.pts=p.base=p.cv=p.seg=p.ar=p.rm=p.hi=null;p.c2=null;p.ready=true;p.dirty=true}
function frame(p){const D=REDUCE?1:p.t0==null?0:clamp((T-p.t0)/p.dur);if(D>=1&&p.dDone==null)p.dDone=REDUCE?T-8:T;p.T=T;
  p.ctx.clearRect(0,0,p.w,p.h);p.ctx.setLineDash([]);try{p.fn(p,T,D)}catch(e){console.warn(p.k,e)}}
const ro=new ResizeObserver(es=>es.forEach(e=>{const p=e.target.__f;if(p){size(p);if(REDUCE&&p.ready)frame(p)}}));
const io=new IntersectionObserver(es=>es.forEach(e=>{const p=e.target.__f;if(!p)return;p.vis=e.isIntersecting;
  if(e.isIntersecting&&p.t0==null&&e.intersectionRatio>=.3)p.t0=T+(+p.c.dataset.delay||0);if(REDUCE&&p.vis&&p.ready)frame(p)}),{threshold:[0,.3]});
document.querySelectorAll('canvas[data-f]').forEach(c=>{const k=c.dataset.f;if(!ART[k])return;const p={c,k,ctx:c.getContext('2d'),fn:ART[k],t0:null,dur:2.8,dDone:null};c.__f=p;items.push(p);ro.observe(c);io.observe(c)});
if(REDUCE)return;
let prev=performance.now();
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-prev)/1000);prev=now;T+=dt;
  for(const p of items){if(!p.ready||!p.vis)continue;p.dt=dt;frame(p)}}
requestAnimationFrame(loop);
window.__vfigs=()=>items.map(p=>({k:p.k,started:p.t0!=null,done:p.dDone!=null}));
})();
