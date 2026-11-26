/* ホーム STORY 01〜06 のボタン送り（候補・So 11/26「どのタイミングでスクロールするか分かりにくい。ボタンで次へ・前へ」）
   main2_nav.js（main2.js に外向けの口 window.__story を差し込んだ写し）を操作する。本線の main2.js は変えない。
   window.STORY_NAV：'a' 下中央の操作盤＋光の筋／'b' 右の縦の目次（押した場面へ跳ぶ）＋白く抜ける／'c' 画面のどこでも押すと次へ・左端で戻る＋粒が流れる（スクロールでは進まない） */
(() => {
  const V = window.STORY_NAV || 'a', N = 6;
  const SPq = matchMedia('(max-width: 820px)');
  const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content.firstChild; };
  const wait = () => (window.__story && window.__story.STOPS) ? init(window.__story) : setTimeout(wait, 120);
  wait();

  function init(S) {
    const ST = S.STOPS;
    const cur = () => { const p = S.P; let k = 0; for (let i = 0; i < ST.length; i++) if (ST[i] <= p + 0.03) k = i; return k; };   // 0＝FV・1〜6＝場面
    const inStory = () => S.gate && !S.inPaper() && S.P < 7.3;
    // 場面4で PRESS の演出が走っている間（押してから次の場面へ動き出すまで）も「動いている」扱いにする
    const busy = () => S.busy || (!!S.s4 && cur() === 4 && S.s4.tau >= 0 && S.s4.tau < (S.s4.NEXT || 3) + .4);
    window.__navBusy = busy;
    let tgt = null, tgtT = 0;
    const shown = () => (tgt != null && performance.now() - tgtT < 4600) ? tgt : cur();

    /* ---- 演出 ---- */
    const fx = $('<div class="nvfx" aria-hidden="true"></div>'); document.body.appendChild(fx);
    let pc = null, parts = [], praf = 0;
    if (V === 'c') { pc = $('<canvas class="nvpc" aria-hidden="true"></canvas>'); document.body.appendChild(pc); }
    function effect(dir, x, y) {
      if (V === 'a') { fx.className = 'nvfx'; void fx.offsetWidth; fx.className = 'nvfx streak ' + (dir > 0 ? 'fwd' : 'back'); }
      else if (V === 'b') { fx.className = 'nvfx'; void fx.offsetWidth; fx.className = 'nvfx flash'; }
      else burst(dir, x ?? innerWidth / 2, y ?? innerHeight / 2);
    }
    function burst(dir, x, y) {
      const D = Math.min(2, devicePixelRatio || 1); pc.width = innerWidth * D; pc.height = innerHeight * D;
      const n = SPq.matches ? 90 : 170;
      for (let i = 0; i < n; i++) { const a = (dir > 0 ? 0 : Math.PI) + (Math.random() - .5) * 1.7, v = 6 + Math.random() * 22;
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v * .55, life: 1, c: Math.random() < .25 ? '255,150,90' : '220,232,255' }); }
      cancelAnimationFrame(praf);
      const ctx = pc.getContext('2d');
      const step = () => { ctx.setTransform(D, 0, 0, D, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.globalCompositeOperation = 'lighter';
        parts = parts.filter((p) => p.life > 0);
        for (const p of parts) { const x0 = p.x, y0 = p.y; p.x += p.vx; p.y += p.vy; p.vx *= .95; p.vy *= .95; p.life -= .022;
          ctx.strokeStyle = `rgba(${p.c},${Math.max(0, p.life).toFixed(3)})`; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(p.x, p.y); ctx.stroke(); }
        if (parts.length) praf = requestAnimationFrame(step); else ctx.clearRect(0, 0, innerWidth, innerHeight); };
      praf = requestAnimationFrame(step);
    }

    /* ---- 送る ---- */
    function go(k, dir, x, y) {
      if (!S.gate || busy()) return false;
      const c = cur();
      if (k === c && S.P > ST[0] - 0.02) return false;
      if (k > N) { effect(1, x, y); tgt = null; S.snapTo(8.0); return true; }        // 場面6の次＝紙の節（FEATURES）
      if (k < 0) return false;
      // 場面4（問いと PRESS）から次へ＝PRESS を押したのと同じ演出で進める
      if (c === 4 && k === 5 && S.s4 && S.s4.tau < 0 && typeof S.s4.press === 'function') { effect(1, x, y); tgt = 5; tgtT = performance.now(); S.s4.press(); return true; }
      effect(dir, x, y); tgt = k; tgtT = performance.now(); S.snapTo(ST[k]); return true;
    }
    const next = (x, y) => go(Math.min(N + 1, (S.P < ST[0] - 0.02 ? 0 : cur()) + 1), 1, x, y);
    const prev = (x, y) => { const c = cur(); if (c <= 1 && S.P <= ST[1] + 0.03) return go(0, -1, x, y); return go(c - 1, -1, x, y); };

    /* ---- 部品 ---- */
    let root;
    if (V === 'a') {
      root = $(`<div class="nv nv-a" role="group" aria-label="STORY の場面送り">
        <button type="button" class="nvb nvp" aria-label="前の場面へ"><span aria-hidden="true">←</span><span class="lb">前へ</span></button>
        <span class="nvn"><b>01</b><i>/</i><span>06</span></span>
        <button type="button" class="nvb nvx" aria-label="次の場面へ"><span class="lb">次へ</span><span aria-hidden="true">→</span></button></div>`);
      root.querySelector('.nvp').addEventListener('click', () => prev());
      root.querySelector('.nvx').addEventListener('click', () => next());
    } else if (V === 'b') {
      const li = Array.from({ length: N }, (_, i) => `<li><button type="button" class="nvi" data-k="${i + 1}" aria-label="場面 ${String(i + 1).padStart(2, '0')} へ"><span class="d" aria-hidden="true"></span><span class="t">${String(i + 1).padStart(2, '0')}</span></button></li>`).join('');
      root = $(`<nav class="nv nv-b" aria-label="STORY の目次">
        <button type="button" class="nvb nvp" aria-label="前の場面へ"><span aria-hidden="true">↑</span><span class="lb">前へ</span></button>
        <ol>${li}</ol>
        <button type="button" class="nvb nvx" aria-label="次の場面へ"><span class="lb">次へ</span><span aria-hidden="true">↓</span></button></nav>`);
      root.querySelectorAll('.nvi').forEach((b) => b.addEventListener('click', () => { const k = +b.dataset.k, c = cur(); go(k, k >= c ? 1 : -1); }));
      root.querySelector('.nvp').addEventListener('click', () => prev());
      root.querySelector('.nvx').addEventListener('click', () => next());
    } else {
      root = $(`<div class="nv nv-c" aria-live="polite"><p class="toast"><span class="pc">クリックで次へ</span><span class="sp">タップで次へ</span><i>／</i><span class="pc">左の端で戻る</span><span class="sp">左の端で戻る</span></p><span class="edge l" aria-hidden="true">‹ 前へ</span></div>`);
      document.addEventListener('click', (e) => {
        if (!inStory()) return;
        if (e.target.closest('a,button,header,input,textarea,select,label,.skip3,#snd,.s4-btn,.lang,.nav')) return;
        if (e.clientX < innerWidth * 0.2) prev(e.clientX, e.clientY); else next(e.clientX, e.clientY);
      });
      document.addEventListener('pointermove', (e) => { root.classList.toggle('lz', inStory() && e.clientX < innerWidth * 0.2); }, { passive: true });
      let ht = 0; window.__navHint = (ms = 2600) => { root.classList.add('nvhint'); clearTimeout(ht); ht = setTimeout(() => root.classList.remove('nvhint'), ms); };
    }
    document.body.appendChild(root);
    document.documentElement.classList.add('nvh-' + V);

    /* ---- キー（←→）・横のスワイプ。縦の操作（↑↓・Space・縦スワイプ）は本線のまま ---- */
    addEventListener('keydown', (e) => {
      if (!inStory() || e.target.closest && e.target.closest('input,textarea,select')) return;
      if (e.code === 'ArrowRight') { if (next()) e.preventDefault(); }
      else if (e.code === 'ArrowLeft') { if (prev()) e.preventDefault(); }
      else if (V === 'c' && e.code === 'Enter' && !e.target.closest('a,button')) { if (next()) e.preventDefault(); }
    });
    let tx0 = null, ty0 = null;
    addEventListener('touchstart', (e) => { tx0 = e.touches[0].clientX; ty0 = e.touches[0].clientY; }, { passive: true });
    addEventListener('touchend', (e) => { if (tx0 == null || !inStory()) return; const t = e.changedTouches[0], dx = t.clientX - tx0, dy = t.clientY - ty0; tx0 = null;
      if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.3) { dx < 0 ? next() : prev(); } }, { passive: true });

    /* ---- 表示の更新 ---- */
    let firstHint = false;
    const ldOut = () => { const l = document.getElementById('ld'); return !l || l.classList.contains('out'); };
    const nb = root.querySelector('.nvn b'), items = [...root.querySelectorAll('.nvi')], pBtn = root.querySelector('.nvp'), xBtn = root.querySelector('.nvx');
    (function tick() {
      requestAnimationFrame(tick);
      const on = inStory(), k = shown();
      root.classList.toggle('on', on);
      document.documentElement.classList.toggle('nvh-in', on);
      if (nb) nb.textContent = String(k).padStart(2, '0');
      items.forEach((b) => { const a = +b.dataset.k === k; b.classList.toggle('cur', a); b.setAttribute('aria-current', a ? 'step' : 'false'); });
      if (pBtn) pBtn.disabled = k <= 0 || busy();
      if (xBtn) xBtn.disabled = busy();
      root.classList.toggle('busy', busy());
      if (V === 'c' && on && !firstHint && ldOut()) { firstHint = true; setTimeout(() => window.__navHint(4200), 900); }   // 読み込みの幕が上がってから最初の案内
    })();
  }
})();
