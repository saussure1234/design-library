/* あしらい散布：各セクションの左右の余白に、星・ドット・くるくるを少しだけ足す。
   ★esl6のHTML/CSSは触らず、JSで .kx-acc 要素を後付けする（波の擬似要素と競合しない）。
   ★コンテンツ列（中央〜1200px）には置かない。左右のガター（外側の余白）だけ。 */
(function(){
  var G='%2300b53a', Y='%23ffee02';                 // 緑 / 黄
  function svg(inner,w,h){return "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='"+w+"' height='"+h+"' viewBox='0 0 "+w+" "+h+"'>"+inner+"</svg>";}
  var star=function(c){return svg("<path d='M22,3 l5,12 13,1 -10,9 3,13 -11,-7 -11,7 3,-13 -10,-9 13,-1 z' fill='none' stroke='"+c+"' stroke-width='3' stroke-linejoin='round'/>",44,44);};
  var starF=function(c){return svg("<path d='M18,2 l4,10 11,1 -8,7 2,11 -9,-6 -9,6 2,-11 -8,-7 11,-1 z' fill='"+c+"'/>",36,36);};
  var dots=function(c){return svg("<g fill='"+c+"'><circle cx='6' cy='6' r='4'/><circle cx='20' cy='10' r='4'/><circle cx='10' cy='22' r='4'/><circle cx='26' cy='24' r='4'/></g>",34,34);};
  var ring=function(c){return svg("<circle cx='13' cy='13' r='10' fill='none' stroke='"+c+"' stroke-width='3'/>",26,26);};
  var curl=function(c){return svg("<path d='M4,20 C4,8 20,8 20,16 C20,22 12,22 12,15 C12,7 24,5 30,12' fill='none' stroke='"+c+"' stroke-width='3' stroke-linecap='round'/>",34,28);};
  var lines=function(c){return svg("<g stroke='"+c+"' stroke-width='3' stroke-linecap='round'><path d='M4,20 L9,6'/><path d='M14,22 L17,5'/><path d='M24,20 L30,7'/></g>",34,28);};

  var KIT=[star(G),star(Y),starF(Y),dots(G),dots(Y),ring(G),curl(Y),curl(G),lines(G)];
  function pick(i){return KIT[i%KIT.length];}

  function acc(url,w,h){
    var s=document.createElement('span'); s.className='kx-acc';
    s.style.width=w+'px'; s.style.height=h+'px';
    s.innerHTML="<img src=\""+url+"\" width='"+w+"' height='"+h+"' alt='' aria-hidden='true'>";
    return s;
  }
  // 1セクションに置く配置（左右ガター中心、コンテンツに被らない）
  var SPOTS=[
    {side:'left', xs:'12px',  top:'8%',  w:42,h:42},
    {side:'left', xs:'40px',  top:'34%', w:30,h:30},
    {side:'right',xs:'16px',  top:'12%', w:38,h:38},
    {side:'right',xs:'48px',  top:'62%', w:32,h:32},
    {side:'left', xs:'24px',  top:'78%', w:28,h:28},
    {side:'right',xs:'20px',  top:'84%', w:34,h:28}
  ];

  function run(){
    // 対象セクション（大きいトーン帯）。FVは別で装飾済みなので除く。
    var secs=document.querySelectorAll('.grad-band,.tone-brand,.tone-base,.tone-ink');
    var k=0;
    secs.forEach(function(sec){
      var r=sec.getBoundingClientRect();
      if(r.height<420) return;                 // 小さい帯はスキップ
      if(getComputedStyle(sec).position==='static') sec.style.position='relative';
      // このセクションだけ4個ほど
      var n=(r.height>1400)?6:4;
      for(var j=0;j<n;j++){
        var sp=SPOTS[j%SPOTS.length];
        var a=acc(pick(k++), sp.w, sp.h);
        a.style[sp.side]=sp.xs; a.style.top=sp.top;
        sec.appendChild(a);
      }
    });
  }
  if(document.readyState!=='loading') setTimeout(run,200);
  else addEventListener('DOMContentLoaded',function(){setTimeout(run,200);});
})();
