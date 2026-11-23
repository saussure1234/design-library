/* 下層ページ（仮）共通：トップ c-3d-b2 の紙の節の動き（giant 見出し・MEMBER の粒子・フッターの CONTACT）をそのまま移したもの */
(()=>{
'use strict';
const TAU=Math.PI*2, DPR=Math.min(2,window.devicePixelRatio||1);
const REDUCE=matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp=(v,a=0,b=1)=>v<a?a:v>b?b:v, mix=(a,b,t)=>a+(b-a)*t;
const ss=(a,b,v)=>{const t=clamp((v-a)/(b-a));return t*t*(3-2*t)};
const ease3=t=>t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
const css=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const hex=h=>{h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]};
const C={ink:hex(css('--ink')),sig:hex(css('--sig'))};
const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
const rgbMix=(a,b,t,al)=>`rgba(${Math.round(mix(a[0],b[0],t))},${Math.round(mix(a[1],b[1],t))},${Math.round(mix(a[2],b[2],t))},${al})`;
function rng(seed){let s=seed%2147483647;if(s<=0)s+=2147483646;return()=>(s=s*16807%2147483647)/2147483647}
const P=new Uint8Array(512);{const r=rng(1977),a=[...Array(256).keys()];for(let i=255;i>0;i--){const j=(r()*(i+1))|0;[a[i],a[j]]=[a[j],a[i]]}for(let i=0;i<512;i++)P[i]=a[i&255]}
const fd=t=>t*t*t*(t*(t*6-15)+10), lp=(t,a,b)=>a+t*(b-a);
const gr=(h,x,y,z)=>{h&=15;const u=h<8?x:y,v=h<4?y:(h===12||h===14)?x:z;return((h&1)?-u:u)+((h&2)?-v:v)};
function N3(x,y,z){let X=Math.floor(x),Y=Math.floor(y),Z=Math.floor(z);x-=X;y-=Y;z-=Z;X&=255;Y&=255;Z&=255;
  const u=fd(x),v=fd(y),w=fd(z),A=P[X]+Y,AA=P[A]+Z,AB=P[A+1]+Z,B=P[X+1]+Y,BA=P[B]+Z,BB=P[B+1]+Z;
  return lp(w,lp(v,lp(u,gr(P[AA],x,y,z),gr(P[BA],x-1,y,z)),lp(u,gr(P[AB],x,y-1,z),gr(P[BB],x-1,y-1,z))),
             lp(v,lp(u,gr(P[AA+1],x,y,z-1),gr(P[BA+1],x-1,y,z-1)),lp(u,gr(P[AB+1],x,y-1,z-1),gr(P[BB+1],x-1,y-1,z-1))));}

/* メニュー */
const bg=document.querySelector('.burger');
if(bg){bg.addEventListener('click',()=>{const o=document.body.classList.toggle('mopen');bg.setAttribute('aria-expanded',o)});
  document.querySelectorAll('.gov a').forEach(a=>a.addEventListener('click',()=>document.body.classList.remove('mopen')))}

/* 見えているキャンバスだけ描く */
const pieces=[];
const io=new IntersectionObserver(es=>{for(const e of es){const p=e.target.__p;if(!p)continue;p.vis=e.isIntersecting;if(p.vis&&!p.ready)size(p)}},{rootMargin:'120px 0px'});
function piece(c,o){const p=Object.assign({c,ctx:c.getContext('2d'),vis:false,ready:false,w:0,h:0},o);c.__p=p;pieces.push(p);io.observe(c);return p}
function size(p){const r=p.c.getBoundingClientRect();if(!r.width||!r.height)return;const d=p.dpr||DPR;p.w=r.width;p.h=r.height;p.c.width=Math.round(r.width*d);p.c.height=Math.round(r.height*d);p.ctx.setTransform(d,0,0,d,0,0);p.ready=true;p.init&&p.init(p)}
let lastW=innerWidth,rz;
addEventListener('resize',()=>{clearTimeout(rz);rz=setTimeout(()=>{const wc=innerWidth!==lastW;lastW=innerWidth;for(const p of pieces){if(wc||p.anyResize){p.ready=false;if(p.vis)size(p)}}},150)});

/* ===== 節の見出し：細く縮んだ字 → 広く太く ===== */
const meas=document.getElementById('meas');
const natural=(text,fvs,ls)=>{meas.style.fontVariationSettings=fvs;meas.style.letterSpacing=ls;meas.textContent=text;return meas.getBoundingClientRect().width};
const giants=[...document.querySelectorAll('[data-wd]')];
const GFIN='"wdth" 151,"wght" 900,"opsz" 144';
/* ページ名（h1）は大きく、節の見出し（h2）はそれより一段小さく（どれがページの題か分かるように・So 11/24） */
function fitGiants(){if(!giants.length)return;const W=giants[0].parentElement.clientWidth,ratio=innerWidth<820?.8:.6;
  const fit=(list)=>list.reduce((fs,g)=>{const t=g.dataset.fitText||g.textContent.trim();return Math.min(fs,100*W*ratio/natural(t,GFIN,'-0.02em'))},96);
  const h1=giants.filter(g=>g.tagName==='H1'),h2=giants.filter(g=>g.tagName!=='H1');
  const f1=fit(h1),f2=fit(h2)*(h1.length?0.58:1);
  h1.forEach(g=>g.style.fontSize=f1.toFixed(2)+'px');h2.forEach(g=>g.style.fontSize=f2.toFixed(2)+'px')}
function drawGiants(){const vh=innerHeight;giants.forEach(g=>{const r=g.getBoundingClientRect();const t=REDUCE?1:clamp((vh-r.top)/(vh*.62));g._p=Math.max(g._p||0,t);const e=ease3(g._p);
  if(g._e===e)return;g._e=e;g.style.fontVariationSettings=`"wdth" ${(25+126*e).toFixed(1)},"wght" ${(100+800*e).toFixed(0)},"opsz" 144`})}

/* ===== MEMBER：散らばった粒子 → 集まって白黒の写真に（乗せるとカラー） ===== */
const mcs=[...document.querySelectorAll('.mc')];
mcs.forEach((card,ci)=>{const img=card.querySelector('img'),c=card.querySelector('canvas');if(!img||!c)return;
  card.addEventListener('click',e=>{if(e.target.closest('a'))return;const on=!card.classList.contains('on');mcs.forEach(m=>m.classList.remove('on'));if(on)card.classList.add('on')});
  card.addEventListener('keydown',e=>{if(e.target!==card)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();card.click()}});
  piece(c,{anyResize:true,init(p){p.dots=null;if(card.classList.contains('fin')){p.done=true;return}p.done=false;
    const go=()=>{try{const pitch=p.w<220?4.2:5,cols=Math.floor(p.w/pitch),rows=Math.floor(p.h/pitch);const o=document.createElement('canvas');o.width=cols;o.height=rows;const oc=o.getContext('2d');
        const iw=img.naturalWidth,ih=img.naturalHeight,s=Math.max(cols/iw,rows/ih),dw=iw*s,dh=ih*s;oc.drawImage(img,(cols-dw)/2,(rows-dh)/2,dw,dh);
        const d=oc.getImageData(0,0,cols,rows).data,r=rng(31+ci),dots=[],L=new Float32Array(cols*rows);let bgL=0,bn=0,mn=1;
        for(let q=0;q<cols*rows;q++){L[q]=(d[q*4]*.3+d[q*4+1]*.59+d[q*4+2]*.11)/255;mn=Math.min(mn,L[q])}
        for(let j=0;j<4;j++)for(let i=0;i<cols;i++){bgL+=L[j*cols+i];bn++}bgL=bgL/bn-.03;
        for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const l=L[j*cols+i];const dk=clamp((bgL-l)/Math.max(.2,bgL-mn));if(dk<.07)continue;
          dots.push([i*pitch+pitch/2,j*pitch+pitch/2,Math.pow(dk,.62)*pitch*.5,r()*p.w,r()*p.h,r()*.5])}
        p.dots=dots;p.k=0;card.classList.add('ht')}catch(e){p.dots=null;card.classList.remove('ht');card.classList.add('fin')}};
    if(img.complete&&img.naturalWidth)go();else img.addEventListener('load',go,{once:true})},
   draw(p,t,dt){if(!p.dots||p.done)return;const {ctx,w,h}=p;
    const r=card.getBoundingClientRect(),vh=innerHeight,g=REDUCE?2:clamp((vh*.9-r.top)/(vh*.5))*1.15;
    p.k=Math.max(p.k||0,Math.min(g,(p.k||0)+(dt||.016)/1.1));const k=p.k;ctx.clearRect(0,0,w,h);ctx.beginPath();
    for(const d of p.dots){const e=ss(d[5],d[5]+.5,k),x=mix(d[3],d[0],e),y=mix(d[4],d[1],e),rr=mix(.8,d[2],e);ctx.moveTo(x+rr,y);ctx.arc(x,y,rr,0,TAU)}
    ctx.fillStyle=rgba(C.ink,.92);ctx.fill();if(k>=1.12){p.done=true;card.classList.add('fin')}}})});

/* ===== フッター：CONTACT を横線の束で描き、乗せると揃う ===== */
const big=document.querySelector('.big');
if(big){const bigB=big.querySelector('b');let bigHov=0;
big.addEventListener('mouseenter',()=>bigHov=1);big.addEventListener('mouseleave',()=>bigHov=0);
piece(document.getElementById('ftc'),{anyResize:true,
 init(p){p.runs=null;const build=()=>{const cs=getComputedStyle(bigB),fs=parseFloat(cs.fontSize);const o=document.createElement('canvas');o.width=Math.ceil(p.w);o.height=Math.ceil(p.h);const oc=o.getContext('2d');
    oc.font=`700 ${fs}px "Space Grotesk"`;oc.letterSpacing=cs.letterSpacing;oc.textBaseline='alphabetic';oc.fillStyle='#000';
    const m=oc.measureText('CONTACT'),asc=m.actualBoundingBoxAscent||fs*.7,desc=m.actualBoundingBoxDescent||0;oc.fillText('CONTACT',0,(p.h+asc-desc)/2);
    const d=oc.getImageData(0,0,o.width,o.height).data,gap=p.w<600?4:6,runs=[];
    for(let y=Math.floor(gap/2);y<o.height;y+=gap){let s=-1;for(let x=0;x<=o.width;x++){const on=x<o.width&&d[(y*o.width+x)*4+3]>110;if(on&&s<0)s=x;if(!on&&s>=0){runs.push([s,x,y]);s=-1}}}
    p.runs=runs;p.al=0};
  (document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(build)},
 draw(p,t){if(!p.runs)return;const {ctx,w,h}=p;ctx.clearRect(0,0,w,h);p.al=mix(p.al,bigHov?1:0,.08);const J=(1-p.al)*(w<600?5:9);
  ctx.lineWidth=w<600?2:2.6;ctx.lineCap='butt';ctx.strokeStyle=rgbMix(C.ink,C.sig,p.al,1);ctx.beginPath();
  for(const r of p.runs){const n=N3(r[2]*.02,t*.45,r[0]*.0015);const dx=n*J;ctx.moveTo(r[0]+dx,r[2]);ctx.lineTo(r[1]+dx,r[2])}ctx.stroke()}})}

/* ===== 回す ===== */
let T=0,prev=performance.now();
function loop(now){requestAnimationFrame(loop);const dt=Math.max(0,Math.min(.05,(now-prev)/1000));prev=now;if(!REDUCE)T+=dt;
  drawGiants();
  for(const p of pieces)if(p.vis&&p.ready){try{p.draw(p,T,dt)}catch(e){console.warn(e)}}}
const start=()=>{fitGiants();giants.forEach(g=>g._e=-1);drawGiants()};
start();requestAnimationFrame(loop);
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(start);
addEventListener('load',start);
let rt2;addEventListener('resize',()=>{clearTimeout(rt2);rt2=setTimeout(start,150)});
})();
