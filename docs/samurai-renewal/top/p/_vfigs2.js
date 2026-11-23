/* VALUES の図・第2弾（D/E/F）：説明なしで一瞬で意味が分かる絵。原文の説明文の中身をそのまま絵にする。
   <canvas data-f="fun-d"> など。画面に入ると左から製図のペンで描かれ（1.4秒）、その後も動き続ける。
   人は建築図面の添景（線だけの人）。かわいい調にしない。朱は各図1点。見えている図だけ動かす。reduced-motion は1枚で止める。 */
(()=>{
'use strict';
const TAU=Math.PI*2,DPR=Math.min(2,window.devicePixelRatio||1);
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v,mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const eio=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const INK='21,21,19',SIG='239,69,25',CARD='251,250,246';
const ink=a=>`rgba(${INK},${a})`,sig=a=>`rgba(${SIG},${a})`,card=a=>`rgba(${CARD},${a})`;
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x)};
function rng(seed){let s=seed%2147483647;if(s<=0)s+=2147483646;return()=>(s=s*16807%2147483647)/2147483647}
const NZ=(()=>{const r=rng(77),v=[];for(let i=0;i<512;i++)v.push(r()*2-1);return x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return mix(v[i&511],v[(i+1)&511],u)}})();
const L=(ctx,a,w,dash)=>{ctx.strokeStyle=ink(a);ctx.lineWidth=w||1;ctx.setLineDash(dash||[]);ctx.lineCap='round';ctx.lineJoin='round'};
const seg=(ctx,pts)=>{ctx.beginPath();pts.forEach((q,i)=>i?ctx.lineTo(q[0],q[1]):ctx.moveTo(q[0],q[1]));ctx.stroke()};
const sq=(ctx,x,y,s,c)=>{ctx.fillStyle=c;ctx.fillRect(x-s/2,y-s/2,s,s)};
const circ=(ctx,x,y,r,fill)=>{ctx.beginPath();ctx.arc(x,y,r,0,TAU);if(fill){ctx.fillStyle=fill;ctx.fill()}ctx.stroke()};
const ph=(t,P)=>((t%P)+P)%P/P;
/* 物語の繰り返し：前の状態 → 変わる → 後の状態を長く保つ → 戻る。m は 0（前）〜1（後）、u は周期の中の位置 */
const story=(t,t0,P)=>{if(t<t0)return{m:0,u:0};const u=ph(t-t0,P);return{m:eio(ss(.06,.22,u)*(1-ss(.9,.99,u))),u}};

/* 線だけの人（建築図面の添景）。足元 (x,y)、背丈 H。o：aL/aR＝腕の角度（0＝下、π＝真上）、ref＝向き(1/-1)、kn＝膝、sit＝座る、tie＝ネクタイ */
function person(ctx,x,y,H,o={}){const aL=o.aL??.15,aR=o.aR??.15,sit=o.sit||0,al=o.a??.62;L(ctx,al,1.15);
  const hip=[x,y-H*mix(.47,.3,sit)],sh=[x,hip[1]-H*.32],hr=H*.085,hc=[x,sh[1]-H*.05-hr];
  circ(ctx,hc[0],hc[1],hr,card(1));
  seg(ctx,[[sh[0],sh[1]],[hip[0],hip[1]]]);
  const arm=(a,s)=>{const l=H*.17;const e=[sh[0]+s*Math.sin(a)*l,sh[1]+Math.cos(a)*l];const b=a+(o.bend||0)*s;return[e,[e[0]+s*Math.sin(b)*l,e[1]+Math.cos(b)*l]]};
  const [e1,h1]=arm(aL,-1),[e2,h2]=arm(aR,1);seg(ctx,[h1,e1,sh,e2,h2]);
  if(sit){const d=o.ref||1;seg(ctx,[[hip[0],hip[1]],[hip[0]+d*H*.2,hip[1]],[hip[0]+d*H*.2,y]])}
  else{const k=o.kn||0,sp=H*.08;seg(ctx,[[x-sp,y],[x-sp*.5+k*H*.04,hip[1]+H*.24],[hip[0],hip[1]],[x+sp*.5+k*H*.04,hip[1]+H*.24],[x+sp,y]])}
  if(o.tie){L(ctx,al,1);seg(ctx,[[sh[0],sh[1]+2],[sh[0],sh[1]+H*.12]])}
  return{hands:[h1,h2],head:hc,sh}}

/* =================== FUN (PLAY)：世界で1番楽しそうに働くチームを目指す =================== */
/* D：乾杯。3方向から腕とグラスが寄って真ん中で当たる。当たった所に朱の点と小さな光の線 */
function funD(p,t){const {ctx,w,h}=p;const cx=w/2,cy=h*.46,P=3.6,f=ph(t-1.4,P),go=t<1.4?0:ss(0,.32,f)*(1-ss(.72,1,f)),hit=t>1.4&&f>.3&&f<.62;
  const G=[[-1,.15],[1,.15],[0,1]];
  G.forEach(([dx,lo],i)=>{const ang=i===2?-Math.PI/2:Math.atan2(-(h*.55),dx*w*.4);const far=i===2?[cx,h*1.05]:[cx+dx*w*.5,h*1.0];
    const near=[mix(far[0],cx+(i===2?0:dx*h*.11),mix(.62,1,go)),mix(far[1],cy+h*(i===2?.17:.06),mix(.62,1,go))];
    const tilt=(i===2?0:dx*mix(.5,.32,go));const gw=h*.14,gh=h*.25;
    ctx.save();ctx.translate(near[0],near[1]);ctx.rotate(tilt);
    L(ctx,.6,1.1);ctx.fillStyle=card(1);ctx.beginPath();ctx.moveTo(-gw/2,-gh);ctx.lineTo(gw/2,-gh);ctx.lineTo(gw*.36,0);ctx.lineTo(-gw*.36,0);ctx.closePath();ctx.fill();ctx.stroke();
    const lv=-gh*.62+Math.sin(t*6+i)*(hit?2:.6);L(ctx,.45,.9);seg(ctx,[[-gw*.44,lv],[gw*.44,lv]]);
    ctx.restore();
    /* 腕：グラスの下から画面の外へ */
    L(ctx,.55,1.1);const hx=near[0]-Math.sin(tilt)*0,hy=near[1];seg(ctx,[[hx,hy],[mix(hx,far[0],.5)+(i===2?0:-dx*8),mix(hy,far[1],.5)],[far[0],far[1]]])});
  if(hit){const k=ss(.3,.36,f)*(1-ss(.5,.62,f));L(ctx,.6*k,1);ctx.beginPath();for(let i=0;i<7;i++){const a=-Math.PI/2+(i-3)*.42;ctx.moveTo(cx+Math.cos(a)*h*.07,cy-h*.17+Math.sin(a)*h*.07);ctx.lineTo(cx+Math.cos(a)*h*(.07+.07*k),cy-h*.17+Math.sin(a)*h*(.07+.07*k))}ctx.stroke()}
  sq(ctx,cx,cy-h*.15,8,sig(hit?1:.0))}
/* E：キャッチボール。並んだ人の間を球が行き来し、受ける人が腕を上げる */
function funE(p,t){const {ctx,w,h}=p;const gy=h*.9,H=h*.5,n=5,xs=[...Array(n)].map((_,i)=>w*(.14+.72*i/(n-1)));
  L(ctx,.4,.9);seg(ctx,[[w*.04,gy],[w*.96,gy]]);
  const P=1.5,c=Math.floor(Math.max(0,t-1.2)/P),f=ph(t-1.2,P),a=Math.floor(hash(c)*n),b=(a+1+Math.floor(hash(c+7)*(n-1)))%n,from=t<1.2?2:a,to=t<1.2?2:b;
  xs.forEach((x,i)=>{const catchUp=i===to?ss(.55,.9,f):0,throwUp=i===from?1-ss(0,.25,f):0,up=Math.max(catchUp,throwUp);person(ctx,x,gy,H,{aL:mix(.2,2.7,up),aR:mix(.2,2.7,up),bend:-.2})});
  if(t>=1.2){const x0=xs[from],x1=xs[to],hy=gy-H*1.02,top=hy-h*mix(.2,.3,Math.abs(to-from)/4),e=eio(f),x=mix(x0,x1,e),y=(1-e)*(1-e)*hy+2*(1-e)*e*(top-h*.1)+e*e*hy;
    L(ctx,.3,.9,[2,4]);ctx.beginPath();for(let i=0;i<=20;i++){const s=i/20*e;const xx=mix(x0,x1,s),yy=(1-s)*(1-s)*hy+2*(1-s)*s*(top-h*.1)+s*s*hy;i?ctx.lineTo(xx,yy):ctx.moveTo(xx,yy)}ctx.stroke();ctx.setLineDash([]);
    ctx.fillStyle=sig(1);ctx.beginPath();ctx.arc(x,y,5,0,TAU);ctx.fill()}}
/* F：ハイタッチ。2人が走り寄って跳び、手が合う所に朱の点。後ろで2人が腕を上げて喜ぶ */
function funF(p,t){const {ctx,w,h}=p;const gy=h*.9,H=h*.52,P=3.4,f=ph(t-1.3,P),run=t<1.3?0:ss(0,.35,f)*(1-ss(.8,1,f)),jump=t<1.3?0:Math.sin(clamp((f-.3)/.32)*Math.PI);
  L(ctx,.4,.9);seg(ctx,[[w*.04,gy],[w*.96,gy]]);
  [[.18,1],[.82,-1]].forEach(([bx],i)=>{const s=i?-1:1;const x=w*bx+s*mix(0,w*.2,run)-(i?0:0);const yy=gy-jump*h*.12;const up=ss(.25,.4,f)*(1-ss(.65,.8,f));
    person(ctx,x,yy,H,i?{aL:mix(.3,2.6,up),aR:.4,kn:jump}:{aR:mix(.3,2.6,up),aL:.4,kn:jump})});
  [.4,.6].forEach((bx,i)=>{const bob=Math.max(0,Math.sin(t*3.2+i*1.7));person(ctx,w*bx,gy-bob*h*.03,H*.72,{aL:2.5+bob*.2,aR:2.5+bob*.2,a:.38})});
  const hit=t>1.3&&f>.38&&f<.62;if(hit){const cx=w/2,cy=gy-jump*h*.12-H*1.02;L(ctx,.55,1);ctx.beginPath();for(let i=0;i<6;i++){const a=-Math.PI/2+(i-2.5)*.5;ctx.moveTo(cx+Math.cos(a)*10,cy+Math.sin(a)*10);ctx.lineTo(cx+Math.cos(a)*18,cy+Math.sin(a)*18)}ctx.stroke();sq(ctx,cx,cy,8,sig(1))}}

/* =================== Free：各自の責任感の下、場所や時間に捉われず自由に裁量を持って働く =================== */
/* D：鳥かごの扉が開いて、鳥が1羽ずつ外へ飛び立っていく */
function bird(ctx,x,y,s,flap,c){ctx.strokeStyle=c;ctx.lineWidth=1.3;ctx.beginPath();const a=.35+.5*flap;ctx.moveTo(x-s,y-s*a);ctx.quadraticCurveTo(x-s*.45,y-s*a*.2,x,y);ctx.quadraticCurveTo(x+s*.45,y-s*a*.2,x+s,y-s*a);ctx.stroke()}
function freeD(p,t){const {ctx,w,h}=p;const cx=w*.3,base=h*.88,cw=h*.42,top=h*.22,dt=ss(.9,1.8,t);
  L(ctx,.6,1.1);ctx.beginPath();ctx.ellipse(cx,top+cw*.35,cw*.5,cw*.35,0,Math.PI,TAU);ctx.stroke();
  seg(ctx,[[cx-cw*.62,base],[cx+cw*.62,base]]);L(ctx,.45,.9);
  const n=9;for(let i=0;i<n;i++){const x=cx-cw*.5+cw*i/(n-1),dy=cw*.35*(1-Math.sqrt(Math.max(0,1-Math.pow((x-cx)/(cw*.5),2))));seg(ctx,[[x,top+dy],[x,base]])}
  L(ctx,.6,1);seg(ctx,[[cx-cw*.5,top+cw*.35],[cx-cw*.5,base]]);seg(ctx,[[cx-cw*.52,base-h*.12],[cx+cw*.52,base-h*.12]]);
  /* 扉：右側。蝶番は右端、開くと手前に振れて細くなる */
  const dx0=cx+cw*.5,dw=cw*.36,dy0=base-h*.12-h*.3,dy1=base-h*.12,op=Math.cos(dt*1.25);
  ctx.fillStyle=card(1);ctx.fillRect(dx0-dw,dy0,dw,dy1-dy0);L(ctx,.5,.9);seg(ctx,[[dx0-dw,dy0],[dx0-dw,dy1]]);
  L(ctx,.6,1.1);const ex=dx0-dw*op+dt*dw*.15;ctx.beginPath();ctx.moveTo(dx0,dy0);ctx.lineTo(ex,dy0-dt*6);ctx.lineTo(ex,dy1+dt*6);ctx.lineTo(dx0,dy1);ctx.stroke();
  L(ctx,.4,.8);for(let i=1;i<4;i++){const x=mix(dx0,ex,i/4);seg(ctx,[[x,dy0-dt*6*i/4],[x,dy1+dt*6*i/4]])}
  /* 鳥：扉から出て右上へ */
  if(t>1.8){const P=2.6;for(let j=0;j<3;j++){const tt=t-1.8-j*P*.34;if(tt<0)continue;const f=ph(tt,P*1.02),x=mix(cx+cw*.25,w*1.08,eio(f)),y=mix(base-h*.3,h*.08,Math.pow(f,.8))+Math.sin(f*9+j)*h*.03;
    const fl=.5+.5*Math.sin(t*14+j*2);bird(ctx,x,y,h*.055,fl,j===0?sig(1):ink(.6))}}}
/* E：凧あげ。人が糸を持ち（責任）、凧は高く自由に風に揺れる */
function freeE(p,t){const {ctx,w,h}=p;const gy=h*.92,H=h*.42,px=w*.18;L(ctx,.4,.9);seg(ctx,[[w*.04,gy],[w*.96,gy]]);
  const me=person(ctx,px,gy,H,{aR:2.1,aL:.3});const hand=me.hands[1];
  const rise=ss(.6,2.2,t),kx=mix(px+w*.12,w*.72,rise)+NZ(t*.35)*w*.06,ky=mix(gy-H,h*.16,rise)+NZ(t*.42+20)*h*.06,rot=NZ(t*.5+40)*.35;
  L(ctx,.45,.9);ctx.beginPath();ctx.moveTo(hand[0],hand[1]);ctx.quadraticCurveTo(mix(hand[0],kx,.6),mix(hand[1],ky,.15)+h*.12,kx,ky+h*.06);ctx.stroke();
  ctx.save();ctx.translate(kx,ky);ctx.rotate(rot);const s=h*.09;L(ctx,.65,1.1);ctx.fillStyle=card(1);ctx.beginPath();ctx.moveTo(0,-s);ctx.lineTo(s*.7,0);ctx.lineTo(0,s*1.3);ctx.lineTo(-s*.7,0);ctx.closePath();ctx.fill();ctx.stroke();
  L(ctx,.4,.8);seg(ctx,[[0,-s],[0,s*1.3]]);seg(ctx,[[-s*.7,0],[s*.7,0]]);
  L(ctx,.45,.9);ctx.beginPath();ctx.moveTo(0,s*1.3);for(let i=1;i<=12;i++){const yy=s*1.3+i*s*.18,xx=Math.sin(t*4-i*.7)*s*.18;ctx.lineTo(xx,yy)}ctx.stroke();
  sq(ctx,0,0,7,sig(1));ctx.restore();
  /* 風 */
  L(ctx,.25,.8);ctx.beginPath();for(let i=0;i<5;i++){const y=h*(.2+.12*i),x=((t*w*.12+i*w*.31)%(w*1.2))-w*.1;ctx.moveTo(x,y);ctx.lineTo(x+w*.06,y)}ctx.stroke()}
/* F：ノートPCが、会社・家・カフェ（の地図ピン）を自由に行き来し、時計の針は回り続ける */
function freeF(p,t){const {ctx,w,h}=p;const gy=h*.86;L(ctx,.4,.9);seg(ctx,[[w*.04,gy],[w*.96,gy]]);
  const S=h*.2,P=[[w*.38,'bld'],[w*.6,'house'],[w*.82,'cafe']];
  P.forEach(([x,k])=>{L(ctx,.55,1);if(k==='bld'){ctx.strokeRect(x-S*.35,gy-S*1.3,S*.7,S*1.3);L(ctx,.35,.8);for(let r=0;r<4;r++)for(let c=0;c<2;c++)ctx.strokeRect(x-S*.22+c*S*.26,gy-S*1.18+r*S*.28,S*.16,S*.16)}
    else if(k==='house'){seg(ctx,[[x-S*.45,gy],[x-S*.45,gy-S*.6],[x,gy-S*1.0],[x+S*.45,gy-S*.6],[x+S*.45,gy]]);L(ctx,.35,.8);ctx.strokeRect(x-S*.1,gy-S*.32,S*.2,S*.32)}
    else{seg(ctx,[[x-S*.5,gy-S*.7],[x+S*.5,gy-S*.7]]);seg(ctx,[[x-S*.42,gy-S*.7],[x-S*.36,gy-S*.95],[x+S*.36,gy-S*.95],[x+S*.42,gy-S*.7]]);seg(ctx,[[x,gy-S*.7],[x,gy]]);L(ctx,.35,.8);seg(ctx,[[x-S*.25,gy],[x+S*.25,gy]])}});
  /* 時計 */
  const cx=w*.14,cy=h*.42,r=h*.22;L(ctx,.6,1.1);circ(ctx,cx,cy,r);L(ctx,.45,.9);ctx.beginPath();for(let i=0;i<12;i++){const a=i*TAU/12;ctx.moveTo(cx+Math.cos(a)*r*.82,cy+Math.sin(a)*r*.82);ctx.lineTo(cx+Math.cos(a)*r*.94,cy+Math.sin(a)*r*.94)}ctx.stroke();
  const am=t*1.2,ah=t*.1;L(ctx,.7,1.3);seg(ctx,[[cx,cy],[cx+Math.sin(ah)*r*.5,cy-Math.cos(ah)*r*.5]]);L(ctx,.6,1);seg(ctx,[[cx,cy],[cx+Math.sin(am)*r*.75,cy-Math.cos(am)*r*.75]]);
  /* PC：ピンからピンへ */
  const Pd=2.2,c=Math.floor(Math.max(0,t-1.2)/Pd),f=ph(t-1.2,Pd),a=t<1.2?0:c%3,b=(a+1)%3,e=eio(clamp((f-.55)/.45)),x=mix(P[a][0],P[b][0],e),top=gy-S*1.3-h*.2,y=top-Math.sin(e*Math.PI)*h*.1;
  const lw=h*.13;L(ctx,.65,1.1);ctx.fillStyle=card(1);ctx.fillRect(x-lw/2,y-lw*.62,lw,lw*.62);ctx.strokeRect(x-lw/2,y-lw*.62,lw,lw*.62);seg(ctx,[[x-lw*.62,y],[x+lw*.62,y]]);
  L(ctx,.35,.8,[2,3]);seg(ctx,[[x,y+3],[x,top+h*.14]]);ctx.setLineDash([]);sq(ctx,x,top+h*.15,7,sig(1))}

/* =================== Flat：年齢や役職などの上下関係なく接する =================== */
/* D：ピラミッド型の組織図が、横並びの輪（全員がつながった円）に変わり、ゆっくり回る */
function flatD(p,t){const {ctx,w,h}=p;const n=7,m=story(t,1.2,9).m,cx=w/2,cy=h*.52,R=h*.34,rot=t*.12;
  const tree=[[.5,.12],[.32,.45],[.68,.45],[.2,.82],[.4,.82],[.6,.82],[.8,.82]];
  const pos=tree.map((q,i)=>{const a=-Math.PI/2+i*TAU/n+rot;return[mix(cx+(q[0]-.5)*Math.min(w,h*2.4)*.9,cx+Math.cos(a)*R,m),mix(h*q[1]+h*.03,cy+Math.sin(a)*R,m)]});
  L(ctx,.5*(1-m),1);[[0,1],[0,2],[1,3],[1,4],[2,5],[2,6]].forEach(([a,b])=>{const A=pos[a],B=pos[b],my=(A[1]+B[1])/2;seg(ctx,[A,[A[0],my],[B[0],my],B])});
  if(m>0){L(ctx,.3*m,.8);ctx.beginPath();for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){ctx.moveTo(pos[i][0],pos[i][1]);ctx.lineTo(pos[j][0],pos[j][1])}ctx.stroke();L(ctx,.55*m,1);ctx.beginPath();ctx.arc(cx,cy,R,0,TAU);ctx.stroke()}
  pos.forEach((q,i)=>{const s=mix(i===0?h*.11:h*.08,h*.08,m);ctx.fillStyle=card(1);ctx.fillRect(q[0]-s*.8,q[1]-s/2,s*1.6,s);L(ctx,.65,1.1);ctx.strokeRect(q[0]-s*.8,q[1]-s/2,s*1.6,s)});
  sq(ctx,pos[3][0],pos[3][1],7,sig(1))}
/* E：段差の階段が平らな床になり、上の段にいた人と下の段にいた人が同じ高さで握手する */
function flatE(p,t){const {ctx,w,h}=p;const gy=h*.92,H=h*.48,S=story(t,1.2,9),u=S.u,m=S.m,stepH=h*.12*(1-m),x0=w*.2,x1=w*.8;
  const steps=4,sw=(x1-x0)/steps;L(ctx,.55,1.1);ctx.beginPath();ctx.moveTo(w*.04,gy-stepH*steps);
  for(let i=0;i<steps;i++){const y=gy-stepH*(steps-i);ctx.lineTo(x0+sw*i,y);ctx.lineTo(x0+sw*i,y+stepH)}ctx.lineTo(w*.96,gy);ctx.stroke();
  const close=t<1.2?0:eio(ss(.22,.34,u)*(1-ss(.84,.9,u))),lx=mix(w*.12,w*.43,close),rx=mix(w*.88,w*.57,close),ly=gy-stepH*steps;
  const meet=t<1.2?0:ss(.32,.36,u)*(1-ss(.82,.84,u)),shake=meet>.9?Math.sin(t*7)*.12:0;
  person(ctx,lx,ly,H*1.06,{aR:mix(.2,1.35+shake,meet),aL:.15,tie:1});person(ctx,rx,gy,H*.96,{aL:mix(.2,1.35-shake,meet),aR:.15});
  if(meet>.9){const hx=(lx+rx)/2,hy=gy-H*.66+Math.sin(t*7)*2;sq(ctx,hx,hy,7,sig(1))}}
/* F：上座のある長い机が、上座のない丸い机に変わる（真上から）。話す番が席から席へ回る */
function flatF(p,t){const {ctx,w,h}=p;const cx=w/2,cy=h/2,m=story(t,1.2,10).m,n=8,R=h*.27,tw=Math.min(w*.62,h*1.6),th=h*.3;
  /* 机 */
  L(ctx,.6,1.1);const rw=mix(tw,R*2,m),rh=mix(th,R*2,m),rr=mix(4,R,m);ctx.beginPath();ctx.roundRect(cx-rw/2,cy-rh/2,rw,rh,rr);ctx.stroke();
  /* 席：長机＝片側3・反対3・上座1（大きい）→ 丸机＝8席均等 */
  const longP=[[-.3,-1],[0,-1],[.3,-1],[-.3,1],[0,1],[.3,1],[-.62,0],[.62,0]].map(([u,v],i)=>i===6?[cx-tw/2-h*.11,cy]:i===7?[cx+tw/2+h*.11,cy]:[cx+u*tw,cy+v*(th/2+h*.1)]);
  const P=Math.max(0,t-2.6),turn=Math.floor(P/1.1)%n;
  longP.forEach((q,i)=>{const a=-Math.PI/2+i*TAU/n,rq=[cx+Math.cos(a)*(R+h*.11),cy+Math.sin(a)*(R+h*.11)],x=mix(q[0],rq[0],m),y=mix(q[1],rq[1],m),s=mix(i===6?h*.16:h*.09,h*.09,m)*(i===7?mix(0,1,m):1);if(s<1)return;
    L(ctx,.55,1);ctx.fillStyle=card(1);ctx.fillRect(x-s/2,y-s/2,s,s);ctx.strokeRect(x-s/2,y-s/2,s,s);L(ctx,.6,1);circ(ctx,x,y,s*.26);
    if(i===6&&m<.6){L(ctx,.6*(1-m/.6),1);ctx.strokeRect(x-s/2-3,y-s/2-3,s+6,s+6)}
    if(m>.99&&i===turn){const k=ph(P,1.1);L(ctx,.5*(1-k),.9);ctx.beginPath();ctx.arc(x,y,s*.6+k*h*.08,0,TAU);ctx.stroke();sq(ctx,mix(x,cx,.28),mix(y,cy,.28),7,sig(1))}})}

/* =================== Open：チーム内では本音で向き合い、人格は否定しない =================== */
/* D：閉じたドアが開いて、中から光が床に差し込む */
function openD(p,t){const {ctx,w,h}=p;const gy=h*.9,fx=w*.42,fw=h*.34,fh=h*.7,fy=gy-fh,op=story(t,1.1,8).m*(.95+.05*Math.sin(t*.8));
  L(ctx,.4,.9);seg(ctx,[[w*.04,gy],[w*.96,gy]]);
  /* 光（床に広がる台形の斜線）。開き具合に合わせて広がり、ゆっくり揺らぐ */
  if(op>0){const spread=op*w*.32,a=.32*op;L(ctx,a,.8);ctx.beginPath();const N=16;for(let i=0;i<=N;i++){const s=i/N,x0=mix(fx,fx+fw,s),x1=mix(fx-spread*.25,fx+fw+spread,s),wob=Math.sin(t*1.3+i)*.06+.94;ctx.moveTo(x0,gy);ctx.lineTo(mix(x0,x1,wob),gy+h*.08)}ctx.stroke();
    L(ctx,.22*op,.8);ctx.beginPath();for(let i=0;i<6;i++){const y=fy+fh*(.15+.13*i);ctx.moveTo(fx+fw*.15,y);ctx.lineTo(fx+fw*.15+(fw*.9+spread*.4)*op,y+(i-2.5)*h*.02)}ctx.stroke()}
  L(ctx,.65,1.2);ctx.strokeRect(fx,fy,fw,fh);
  /* 扉：左の蝶番で手前に開く */
  const ex=fx+fw*Math.cos(op*1.25),skew=op*h*.07;ctx.fillStyle=card(1);ctx.beginPath();ctx.moveTo(fx,fy);ctx.lineTo(ex-fw*.0,fy-skew);ctx.lineTo(ex,gy+skew);ctx.lineTo(fx,gy);ctx.closePath();ctx.fill();L(ctx,.65,1.1);ctx.stroke();
  const kx=mix(fx,ex,.82),ky=fy+fh*.55;sq(ctx,kx,ky,6,sig(1))}
/* E：2人が机を挟んで向き合い、交互に話す（吹き出しが行き来する） */
function openE(p,t){const {ctx,w,h}=p;const gy=h*.92,H=h*.56,lx=w*.3,rx=w*.7;L(ctx,.4,.9);seg(ctx,[[w*.04,gy],[w*.96,gy]]);
  L(ctx,.55,1.1);seg(ctx,[[w*.4,gy-H*.36],[w*.6,gy-H*.36]]);seg(ctx,[[w*.5,gy-H*.36],[w*.5,gy]]);
  const P=2.4,c=Math.floor(Math.max(0,t-1.2)/P),f=ph(t-1.2,P),sp=c%2;
  const A=person(ctx,lx,gy,H,{sit:1,ref:-1,aR:1.2,bend:.4}),B=person(ctx,rx,gy,H,{sit:1,ref:1,aL:1.2,bend:.4});
  L(ctx,.5,1);seg(ctx,[[lx-H*.2,gy-H*.3],[lx-H*.2,gy]]);seg(ctx,[[rx+H*.2,gy-H*.3],[rx+H*.2,gy]]);
  if(t>1.2){const who=sp?B:A,d=sp?-1:1,k=ss(0,.15,f)*(1-ss(.85,1,f)),bw=h*.32,bh=h*.17,bx=who.head[0]+d*h*.12,by=who.head[1]-h*.3;
    const x0=d>0?bx:bx-bw;L(ctx,.6*k,1);ctx.fillStyle=card(k);ctx.beginPath();ctx.roundRect(x0,by-bh/2,bw,bh,4);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(bx+d*h*.04,by+bh/2);ctx.lineTo(who.head[0]+d*h*.05,who.head[1]-h*.08);ctx.lineTo(bx+d*h*.1,by+bh/2);ctx.stroke();
    L(ctx,.4*k,1);const nl=3;for(let i=0;i<nl;i++){const ww=bw*(.7-.18*(i===nl-1))*ss(.1+i*.12,.3+i*.12,f);seg(ctx,[[x0+bw*.12,by-bh*.22+i*bh*.22],[x0+bw*.12+ww,by-bh*.22+i*bh*.22]])}
    /* 聞いている側はうなずく */
    const L2=sp?A:B;sq(ctx,x0+bw-10,by-bh/2+10,6,sig(k))}}
/* F：南京錠の鍵が外れて、つるが開く。しばらく開いたまま、また閉じてまた開く */
function openF(p,t){const {ctx,w,h}=p;const cx=w/2,bw=h*.42,bh=h*.34,by=h*.5,P=5,f=t<1.2?0:ph(t-1.2,P);
  const lift=ss(.08,.2,f)*(1-ss(.86,.96,f)),swing=ss(.2,.34,f)*(1-ss(.76,.86,f));
  /* つる：左の脚を軸に、上がって右へ回る */
  const r=bw*.3,legL=cx-r,legR=cx+r,top=by-h*.16-lift*h*.12;ctx.save();ctx.translate(legL,by);ctx.rotate(-swing*.9);ctx.translate(-legL,-by);
  L(ctx,.65,h*.035);ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(legL,by-lift*h*.12);ctx.lineTo(legL,top);ctx.arc(cx,top,r,Math.PI,0);ctx.lineTo(legR,by-lift*h*.12-(1-lift)*0+ (lift>0?0:0));ctx.stroke();ctx.restore();
  L(ctx,.65,1.2);ctx.fillStyle=card(1);ctx.beginPath();ctx.roundRect(cx-bw/2,by,bw,bh,6);ctx.fill();ctx.stroke();
  /* 鍵穴と鍵 */
  const kh=by+bh*.42;sq(ctx,cx,kh,8,sig(1));ctx.fillStyle=ink(.6);ctx.fillRect(cx-1.5,kh+3,3,bh*.22);
  const turn=ss(0,.08,f)*(1-ss(.96,1,f));L(ctx,.55,1);const kx=cx+bw*.56,ky=kh;ctx.save();ctx.translate(kx,ky);ctx.scale(1,Math.cos(turn*1.5)||.01);seg(ctx,[[-bw*.06,0],[bw*.28,0]]);circ(ctx,bw*.36,0,h*.05);ctx.restore();
  /* 開いた瞬間の小さな線 */
  const pop=ss(.18,.22,f)*(1-ss(.26,.34,f));if(pop>0){L(ctx,.5*pop,1);ctx.beginPath();for(let i=0;i<4;i++){const a=-Math.PI/2-.6+i*.4;ctx.moveTo(legR+Math.cos(a)*14,by-6+Math.sin(a)*14);ctx.lineTo(legR+Math.cos(a)*24,by-6+Math.sin(a)*24)}ctx.stroke()}}

/* =================== Optimization：全体最適視点で判断する =================== */
/* D：絡まった線がほどけて、まっすぐ平行にそろう。そろった線を信号が流れる */
function optD(p,t){const {ctx,w,h}=p;const n=5,xl=w*.12,xr=w*.88,m=story(t,1.1,8).m;
  L(ctx,.65,1.1);ctx.strokeRect(xl-h*.06,h*.18,h*.06,h*.64);ctx.strokeRect(xr,h*.18,h*.06,h*.64);
  if(!p.tg){const r=rng(9);p.tg=[...Array(n)].map(()=>[...Array(5)].map(()=>[r(),r()]))}
  for(let i=0;i<n;i++){const y=h*(.26+.12*i*(4/(n-1))*.98),pts=[];const ya=y,yb=h*(.26+.12*((i*3)%n)*(4/(n-1))*.98);
    for(let j=0;j<=60;j++){const s=j/60,x=mix(xl,xr,s);const tang=[0,1].map(k=>0);let ty=mix(ya,yb,s);
      const wob=Math.sin(s*Math.PI)*(Math.sin(s*TAU*1.5+i*2.1)*h*.22+Math.sin(s*TAU*3.2+i)*h*.08),wx=Math.sin(s*Math.PI)*Math.sin(s*TAU*2+i*1.3)*w*.06;
      pts.push([x+wx*(1-m),mix(ty+wob,y,m)])}
    L(ctx,.55,1);seg(ctx,pts);
    if(m>.99){const k=ph(t*.45+i*.21,1),q=pts[Math.floor(k*60)];if(i===2)sq(ctx,q[0],q[1],7,sig(1));else{ctx.fillStyle=ink(.75);ctx.fillRect(q[0]-2.5,q[1]-2.5,5,5)}}}}
/* E：地図の上で、くねくねした遠回りの道が消え、まっすぐな近道に変わる。近道を点が往復する */
function optE(p,t){const {ctx,w,h}=p;const A=[w*.16,h*.78],B=[w*.84,h*.24],g=h*.14;
  L(ctx,.12,.8);ctx.beginPath();for(let x=w*.06;x<w*.95;x+=g){ctx.moveTo(x,h*.08);ctx.lineTo(x,h*.92)}for(let y=h*.08;y<h*.93;y+=g){ctx.moveTo(w*.06,y);ctx.lineTo(w*.94,y)}ctx.stroke();
  const m=story(t,1.4,8).m,fade=1-m*.75;
  const long=[[A[0],A[1]],[A[0],h*.92-g*.4],[w*.36,h*.92-g*.4],[w*.36,h*.12],[w*.56,h*.12],[w*.56,h*.66],[w*.72,h*.66],[w*.72,h*.12],[B[0],h*.12],[B[0],B[1]]];
  L(ctx,.5*fade,1,[4,4]);seg(ctx,long);ctx.setLineDash([]);
  const sk=m;if(sk>0){L(ctx,.65,1.4);seg(ctx,[A,[mix(A[0],B[0],sk),mix(A[1],B[1],sk)]])}
  L(ctx,.65,1.1);ctx.fillStyle=card(1);ctx.fillRect(A[0]-6,A[1]-6,12,12);ctx.strokeRect(A[0]-6,A[1]-6,12,12);
  seg(ctx,[[B[0],B[1]],[B[0],B[1]-h*.16]]);ctx.beginPath();ctx.moveTo(B[0],B[1]-h*.16);ctx.lineTo(B[0]+h*.1,B[1]-h*.12);ctx.lineTo(B[0],B[1]-h*.08);ctx.stroke();
  if(m>.99){const k=eio(ph(t,2.4));sq(ctx,mix(A[0],B[0],k),mix(A[1],B[1],k),8,sig(1))}}
/* F：ばらばらだった歯車が寄ってかみ合い、全部が一緒に回る */
function gear(ctx,x,y,r,n,a){const ro=r,ri=r*.82;ctx.beginPath();for(let i=0;i<n;i++){const b=a+i*TAU/n,d=TAU/n;
  ctx.lineTo(x+Math.cos(b)*ri,y+Math.sin(b)*ri);ctx.lineTo(x+Math.cos(b+d*.15)*ro,y+Math.sin(b+d*.15)*ro);ctx.lineTo(x+Math.cos(b+d*.45)*ro,y+Math.sin(b+d*.45)*ro);ctx.lineTo(x+Math.cos(b+d*.6)*ri,y+Math.sin(b+d*.6)*ri)}
  ctx.closePath();ctx.fillStyle=card(1);ctx.fill();ctx.stroke();circ(ctx,x,y,r*.22)}
function optF(p,t){const {ctx,w,h}=p;const m=story(t,1.1,9).m,k=h*.3,M=1.0;
  /* 歯の大きさをそろえる：半径 ∝ 歯数 */
  const G=[[12,0],[20,0],[9,0],[16,0]].map(([n])=>({n,r:n*h*.0145}));
  const cx=w/2,cy=h*.52;G[1].x=cx-h*.06;G[1].y=cy;G[0].x=G[1].x-(G[0].r+G[1].r)*.92*Math.cos(.5);G[0].y=cy-(G[0].r+G[1].r)*.92*Math.sin(.5);
  G[2].x=G[1].x+(G[1].r+G[2].r)*.92*Math.cos(-.7);G[2].y=cy-(G[1].r+G[2].r)*.92*Math.sin(-.7);G[3].x=G[2].x+(G[2].r+G[3].r)*.92*Math.cos(.5);G[3].y=G[2].y-(G[2].r+G[3].r)*.92*Math.sin(.5);
  const off=[[-.16,-.2],[0,0],[.06,.24],[.2,-.06]];const run=ss(.97,1,m);p.ga=(p.ga||0)+(p.dt||.016)*.9*run;const base=p.ga;
  let ang=[0,0,0,0];ang[1]=base;ang[0]=-base*G[1].n/G[0].n+Math.PI/G[0].n;ang[2]=-base*G[1].n/G[2].n+Math.PI/G[2].n*.5;ang[3]=base*G[1].n/G[3].n;
  G.forEach((g,i)=>{const x=g.x+off[i][0]*w*(1-m),y=g.y+off[i][1]*h*(1-m);L(ctx,.6,1.1);gear(ctx,x,y,g.r,g.n,ang[i]+(1-m)*i);if(i===1)sq(ctx,x,y,7,sig(1))})}

const ART={'fun-d':funD,'fun-e':funE,'fun-f':funF,'free-d':freeD,'free-e':freeE,'free-f':freeF,'flat-d':flatD,'flat-e':flatE,'flat-f':flatF,
  'open-d':openD,'open-e':openE,'open-f':openF,'opt-d':optD,'opt-e':optE,'opt-f':optF};
window.VFIGS2=ART;
const items=[];let T=0;const REV=1.4;
function size(p){const r=p.c.getBoundingClientRect();if(!r.width||!r.height)return;p.w=r.width;p.h=r.height;p.c.width=Math.round(r.width*DPR);p.c.height=Math.round(r.height*DPR);p.ctx.setTransform(DPR,0,0,DPR,0,0);p.tg=null;p.ready=true}
function frame(p){const {ctx,w,h}=p;const tt=REDUCE?6:p.t0==null?0:T-p.t0,rev=REDUCE?1:p.t0==null?0:clamp(tt/REV);if(rev>=1)p.done=true;
  ctx.clearRect(0,0,w,h);if(rev<=0)return;ctx.save();if(rev<1){ctx.beginPath();ctx.rect(0,0,w*eio(rev),h);ctx.clip()}
  try{p.fn(p,tt)}catch(e){console.warn(p.k,e)}ctx.restore();ctx.setLineDash([]);
  if(rev<1){const x=w*eio(rev);ctx.strokeStyle=ink(.5);ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke()}}
const ro=new ResizeObserver(es=>es.forEach(e=>{const p=e.target.__f;if(p){size(p);if(REDUCE&&p.ready)frame(p)}}));
const io=new IntersectionObserver(es=>es.forEach(e=>{const p=e.target.__f;if(!p)return;p.vis=e.isIntersecting;if(e.isIntersecting&&p.t0==null&&e.intersectionRatio>=.3)p.t0=T;if(REDUCE&&p.vis&&p.ready)frame(p)}),{threshold:[0,.3]});
document.querySelectorAll('canvas[data-f]').forEach(c=>{const k=c.dataset.f;if(!ART[k])return;const p={c,k,ctx:c.getContext('2d'),fn:ART[k],t0:null};c.__f=p;items.push(p);ro.observe(c);io.observe(c)});
window.__vfigs=()=>items.map(p=>({k:p.k,started:p.t0!=null,done:!!p.done}));
if(REDUCE)return;
let prev=performance.now();
function loop(now){requestAnimationFrame(loop);const dt=Math.min(.05,(now-prev)/1000);prev=now;T+=dt;for(const p of items)if(p.ready&&p.vis){p.dt=dt;frame(p)}}
requestAnimationFrame(loop);
})();
