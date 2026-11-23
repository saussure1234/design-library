/* svc-real.js — SERVICE 第3ラウンド：製図の枠（ペン先が描き進む線）の中に、実物の画面・映像をはめる。
   使い方：
     <div class="fig"> の中に <div class="scr" data-dev="monitor|laptop|tablet|browser|film" data-lead="fx,fy,dir[,sig];..." data-dim="b,r|l">
       （中に <video data-src data-t0>）を置き、SvcReal.fig(figEl) を呼ぶ。
     const c = SvcReal.fig(el, {auto:true});  c.restart() / c.set(0..1)
     SvcReal.videos();  SvcReal.sync();   … 動画は「画面に入っている・場面が act・枠が描き終わった」時だけ再生
     SvcReal.stretch(els);  SvcReal.replay(el)  … 見出しを「細く縮んだ字 → 広く太く」（英字＝Roboto Flex の幅軸、和文＝Noto Sans JP の太さ＋横の伸び）
   文字は1つも描かない（線と記号だけ）。 */
(function () {
  'use strict';
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const mix = (a, b, t) => a + (b - a) * t;
  const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  /* 色は紙の節（.paper）があればそこから読む（3D版はページ全体の --ink が白なので） */
  const cs0 = getComputedStyle(document.querySelector('.paper') || document.documentElement);
  const hex = (n, d) => { let h = ((cs0.getPropertyValue(n) || '').trim() || d).replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); };
  const COL = { ink: hex('--ink', '#151513'), sig: hex('--sig', '#ef4519') };
  const ST = {
    ink: { c: 'ink', a: .82, w: 1 },
    thin: { c: 'ink', a: .5, w: .8 },
    faint: { c: 'ink', a: .32, w: .8 },
    dash: { c: 'ink', a: .42, w: .8, d: [3, 3] },
    cl: { c: 'ink', a: .42, w: .8, d: [10, 3, 2, 3] },
    sig: { c: 'sig', a: 1, w: 1.3 }
  };

  /* ---------- 線の部品（px 座標の折れ線の列を作る） ---------- */
  function Plan() {
    const L = [];
    const add = (pts, st, o = {}) => { L.push(Object.assign({ pts, st }, o)); return L[L.length - 1]; };
    const P = {
      L,
      ln: (x1, y1, x2, y2, st = 'ink', o) => add([[x1, y1], [x2, y2]], st, o),
      pl: (pts, st = 'ink', o) => add(pts, st, o),
      rc: (x, y, w, h, st = 'ink', o) => add([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], st, o),
      /* 製図の枠：角で線が少しはみ出す */
      fr: (x, y, w, h, st = 'ink', ov = 5, o = {}) => {
        add([[x - ov, y], [x + w + ov, y]], st); add([[x + w, y - ov], [x + w, y + h + ov]], st);
        add([[x + w + ov, y + h], [x - ov, y + h]], st); return add([[x, y + h + ov], [x, y - ov]], st, o);
      },
      rr: (x, y, w, h, r, st = 'ink', o) => {
        const pts = [], q = (cx, cy, a0) => { for (let i = 0; i <= 6; i++) { const a = a0 + i / 6 * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
        q(x + w - r, y + r, -Math.PI / 2); q(x + w - r, y + h - r, 0); q(x + r, y + h - r, Math.PI / 2); q(x + r, y + r, Math.PI); pts.push(pts[0]);
        return add(pts, st, o);
      },
      circ: (cx, cy, r, st = 'ink', o) => { const pts = []; for (let i = 0; i <= 24; i++) { const a = -Math.PI / 2 + i / 24 * TAU; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return add(pts, st, o); },
      dot: (x, y, r, st = 'ink', sq) => add([[x, y]], st, { dot: r, sq }),
      target: (x, y, r = 5) => { P.circ(x, y, r, 'thin'); P.ln(x - r - 4, y, x + r + 4, y, 'thin'); P.ln(x, y - r - 4, x, y + r + 4, 'thin'); },
      tick: (x, y, z = 4) => P.ln(x - z, y + z, x + z, y - z, 'ink'),
      /* 寸法線（横）：引出線＋寸法線＋端の斜め線。数字は入れない */
      dimH: (x1, x2, yRef, y) => { const s = y > yRef ? 1 : -1; P.ln(x1, yRef + 4 * s, x1, y + 6 * s, 'faint'); P.ln(x2, yRef + 4 * s, x2, y + 6 * s, 'faint'); P.ln(x1 - 8, y, x2 + 8, y, 'thin'); P.tick(x1, y); P.tick(x2, y); },
      dimV: (y1, y2, xRef, x) => { const s = x > xRef ? 1 : -1; P.ln(xRef + 4 * s, y1, x + 6 * s, y1, 'faint'); P.ln(xRef + 4 * s, y2, x + 6 * s, y2, 'faint'); P.ln(x, y1 - 8, x, y2 + 8, 'thin'); P.tick(x, y1); P.tick(x, y2); },
      /* 中心線（枠の外だけに出す一点鎖線） */
      cmark: (B, ext = 20) => { const cx = B.x + B.w / 2, cy = B.y + B.h / 2; P.ln(B.x - ext, cy, B.x - 3, cy, 'cl'); P.ln(B.x + B.w + 3, cy, B.x + B.w + ext, cy, 'cl'); P.ln(cx, B.y - ext, cx, B.y - 3, 'cl'); }
    };
    return P;
  }

  /* ---------- 機器の線画（画面の矩形 s のまわりに描く）。返り値＝外形 B ---------- */
  function device(P, s, kind, on) {
    const { x, y, w, h } = s; let B;
    if (kind === 'monitor') {
      const b = Math.max(7, w * .02), cb = b * 1.9;
      B = { x: x - b, y: y - b, w: w + b * 2, h: h + b + cb };
      P.fr(B.x, B.y, B.w, B.h, 'ink', 5); P.rc(x, y, w, h, 'thin', { done: on });
      P.ln(B.x, y + h + 1, B.x + B.w, y + h + 1, 'faint');
      const cx = x + w / 2, nk = Math.max(5, w * .03), fy = B.y + B.h + Math.max(16, h * .13);
      P.pl([[cx - nk, B.y + B.h], [cx - nk * .8, fy], [cx + nk * .8, fy], [cx + nk, B.y + B.h]], 'ink');
      P.ln(cx - w * .15, fy, cx + w * .15, fy, 'ink'); P.ln(cx - w * .13, fy + 3, cx + w * .13, fy + 3, 'faint');
      B.foot = fy + 3;
    } else if (kind === 'laptop') {
      const b = Math.max(6, w * .022);
      B = { x: x - b, y: y - b, w: w + b * 2, h: h + b * 2.3 };
      P.rr(B.x, B.y, B.w, B.h, Math.min(8, b), 'ink'); P.rc(x, y, w, h, 'thin', { done: on });
      P.circ(x + w / 2, B.y + b / 2, 1.6, 'thin');
      const by = B.y + B.h, d = Math.max(12, h * .06), ex = w * .07;
      P.pl([[B.x, by], [B.x - ex, by + d], [B.x + B.w + ex, by + d], [B.x + B.w, by]], 'ink');
      P.ln(B.x - ex, by + d + 3, B.x + B.w + ex, by + d + 3, 'faint');
      P.pl([[x + w / 2 - w * .07, by + d], [x + w / 2 - w * .065, by + d - 3], [x + w / 2 + w * .065, by + d - 3], [x + w / 2 + w * .07, by + d]], 'thin');
      B.foot = by + d + 3; B.x2 = B.x - ex; B.w2 = B.w + ex * 2;
    } else if (kind === 'tablet') {
      const b = Math.max(6, w * .055);
      B = { x: x - b, y: y - b * 1.6, w: w + b * 2, h: h + b * 1.6 + b * 2.4 };
      P.rr(B.x, B.y, B.w, B.h, b * 1.4, 'ink'); P.rc(x, y, w, h, 'thin', { done: on });
      P.circ(x + w / 2, B.y + b * .8, 1.6, 'thin'); P.circ(x + w / 2, y + h + b * 1.2, b * .55, 'thin');
    } else if (kind === 'browser') {
      const cb = clamp(h * .06, 14, 24);
      B = { x: x - 1, y: y - cb, w: w + 2, h: h + cb + 1 };
      P.fr(B.x, B.y, B.w, B.h, 'ink', 6); P.ln(B.x, y, B.x + B.w, y, 'ink', { done: on });
      for (let i = 0; i < 3; i++) P.circ(B.x + cb * .55 + i * cb * .55, B.y + cb / 2, cb * .14, 'thin');
      P.rr(B.x + cb * 2.4, B.y + cb * .28, w * .4, cb * .44, cb * .2, 'faint');
      P.ln(B.x + B.w - cb * 1.2, B.y + cb * .5, B.x + B.w - cb * .6, B.y + cb * .5, 'faint');
    } else if (kind === 'film') {
      const fh = clamp(h * .085, 14, 30), sx = Math.max(6, w * .012);
      B = { x: x - sx, y: y - fh, w: w + sx * 2, h: h + fh * 2 };
      P.fr(B.x, B.y, B.w, B.h, 'ink', 6); P.rc(x, y, w, h, 'thin', { done: on });
      const hw = fh * .42, hh = fh * .36, step = fh * 1.05, n = Math.floor((B.w - fh * .6) / step);
      const ox = B.x + (B.w - (n - 1) * step) / 2;
      for (let i = 0; i < n; i++) { const cx = ox + i * step; P.rc(cx - hw / 2, B.y + (fh - hh) / 2, hw, hh, 'faint'); P.rc(cx - hw / 2, y + h + (fh - hh) / 2, hw, hh, 'faint'); }
    } else {
      B = { x, y, w, h }; P.fr(x, y, w, h, 'ink', 5, { done: on });
    }
    return B;
  }

  /* ---------- 3C の図：Customer／Competitor／Company の3つの円 → 矢印で画面へ ----------
     <div class="c3" data-to="0" data-flow="e" data-flow-sp="s"> の中に <span class="c3l" data-k="0|1|2">ラベル</span>。
     k=0 上の円・1 左下・2 右下。ラベルは引出線を描き終えたら出す（class "on"）。data-to＝矢印の先の .scr の番号 */
  const SPQ = matchMedia('(max-width:760px)');
  function venn(P, c, fr, Bs) {
    const rc = c.getBoundingClientRect();
    const bx = rc.left - fr.left, by = rc.top - fr.top, s = rc.width;
    const r = s * .25, d = s * .15, cx = bx + s * .5, cy = by + s * .55;
    const C = [[cx, cy - d], [cx - d * .866, cy + d * .5], [cx + d * .866, cy + d * .5]];
    const a0 = [-Math.PI / 2, Math.PI * .75, Math.PI * .25];
    C.forEach(([x, y], k) => { const pts = []; for (let i = 0; i <= 64; i++) { const a = a0[k] + i / 64 * TAU; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } P.pl(pts, 'ink'); });
    const lab = k => c.querySelector('.c3l[data-k="' + k + '"]');
    const put = (k, x, y, tf) => { const e = lab(k); if (!e) return null; e.style.left = (x - bx).toFixed(1) + 'px'; e.style.top = (y - by).toFixed(1) + 'px'; e.style.transform = tf; return e; };
    /* 引出線：上は真上へ、左下・右下は斜めに出して棚を付ける */
    { const x = C[0][0], y = C[0][1] - r, L = 14; P.dot(x, y, 2.2, 'ink'); P.ln(x, y, x, y - L, 'ink', { done: put(0, x, y - L - 5, 'translate(-50%,-100%)') }); }
    /* 下の2つ：diag＝斜めに出して棚（横に余裕がある時）／down＝真下に下ろしてラベルを中央に（右に画面がある時） */
    const mode = (SPQ.matches && c.dataset.labSp) || c.dataset.lab || 'diag';
    [[1, -1], [2, 1]].forEach(([k, sg]) => {
      if (mode === 'down') {
        const a = Math.PI / 2 - sg * Math.PI / 6, x = C[k][0] + Math.cos(a) * r, y = C[k][1] + Math.sin(a) * r, L = 18;
        P.dot(x, y, 2.2, 'ink'); P.ln(x, y, x, y + L, 'ink', { done: put(k, x, y + L + 5, 'translate(-50%,0)') });
        return;
      }
      const a = Math.PI / 2 - sg * Math.PI / 4, x = C[k][0] + Math.cos(a) * r, y = C[k][1] + Math.sin(a) * r, q = 13, sh = 14;
      P.dot(x, y, 2.2, 'ink'); P.ln(x, y, x + sg * q, y + q, 'ink');
      P.ln(x + sg * q, y + q, x + sg * (q + sh), y + q, 'ink', { done: put(k, x + sg * (q + sh + 5), y + q, sg < 0 ? 'translate(-100%,-50%)' : 'translate(0,-50%)') });
    });
    P.dot(cx, cy, 3.2, 'sig', true);
    /* 矢印：3C → 画面 */
    const B = Bs[+(c.dataset.to || 0)]; if (!B) return;
    const flow = (SPQ.matches && c.dataset.flowSp) || c.dataset.flow || 'e', h = 6;
    if (flow === 's') {
      const x0 = cx, y0 = C[1][1] + r * .86 + 8, x1 = clamp(cx, B.x + 10, B.x + B.w - 10), y1 = B.y - 12;
      P.pl(Math.abs(x1 - x0) < 1 ? [[x0, y0], [x1, y1]] : [[x0, y0], [x0, (y0 + y1) / 2], [x1, (y0 + y1) / 2], [x1, y1]], 'ink');
      P.pl([[x1 - h * .7, y1 - h], [x1, y1], [x1 + h * .7, y1 - h]], 'ink');
    } else {
      const x0 = C[2][0] + r + 8, y0 = cy, x1 = B.x - 12, y1 = clamp(cy, B.y + 10, B.y + B.h - 10);
      P.pl(Math.abs(y1 - y0) < 1 ? [[x0, y0], [x1, y1]] : [[x0, y0], [(x0 + x1) / 2, y0], [(x0 + x1) / 2, y1], [x1, y1]], 'ink');
      P.pl([[x1 - h, y1 - h * .7], [x1, y1], [x1 - h, y1 + h * .7]], 'ink');
    }
  }

  /* ---------- 1つの図：計測 → 線の列 → 時間で描き進む ---------- */
  const figs = [];
  function fig(el, o = {}) {
    let cv = el.querySelector(':scope>canvas.pen');
    if (!cv) { cv = document.createElement('canvas'); cv.className = 'pen'; cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv); }
    const ctx = cv.getContext('2d');
    const S = { el, cv, ctx, items: [], tot: 1, u: REDUCE ? 1 : 0, t0: 0, dur: 2.4, run: false, vis: false, started: false, w: 0, h: 0 };
    const scrs = [...el.querySelectorAll('.scr')];
    function build() {
      const fr = el.getBoundingClientRect(); S.w = fr.width; S.h = fr.height;
      cv.width = Math.round(S.w * DPR); cv.height = Math.round(S.h * DPR);
      const P = Plan();
      if (el.dataset.reg !== 'no') { const m = 14; [[m, m], [S.w - m, m], [m, S.h - m], [S.w - m, S.h - m]].forEach(([a, b]) => P.target(a, b, 4)); }
      const leads = [], n0 = P.L.length, Bs = [];
      scrs.forEach(sc => {
        const r = sc.getBoundingClientRect();
        const s = { x: r.left - fr.left, y: r.top - fr.top, w: r.width, h: r.height };
        const B = device(P, s, sc.dataset.dev || 'frame', sc); Bs.push(B);
        P.cmark(B, 18);
        const dim = (sc.dataset.dim || 'b').split(',');
        const bot = B.foot || (B.y + B.h);
        const bx = B.x2 != null ? B.x2 : B.x, bw = B.w2 != null ? B.w2 : B.w;
        if (dim.includes('b')) P.dimH(bx, bx + bw, bot, bot + 20);
        if (dim.includes('t')) P.dimH(B.x, B.x + B.w, B.y, B.y - 20);
        if (dim.includes('r')) P.dimV(B.y, B.y + B.h, B.x + B.w, B.x + B.w + 20);
        if (dim.includes('l')) P.dimV(B.y, B.y + B.h, B.x, B.x - 20);
        (sc.dataset.lead || '').split(';').filter(Boolean).forEach(spec => leads.push({ spec, s, B }));
      });
      /* 引出線：画面の要所 → 機器の外へ。朱は最後の1本だけ */
      leads.sort((a, b) => (a.spec.includes('sig') ? 1 : 0) - (b.spec.includes('sig') ? 1 : 0));
      leads.forEach(({ spec, s, B }) => {
        const [fx, fy, dir = 'n', sg] = spec.split(','), st = sg === 'sig' ? 'sig' : 'ink';
        const px = s.x + s.w * +fx, py = s.y + s.h * +fy, gap = 26;
        let ex = px, ey = py, sh = 0;
        if (dir.includes('n')) ey = B.y - gap; if (dir.includes('s')) ey = (B.foot || B.y + B.h) + gap;
        if (dir === 'e') ex = B.x + B.w + gap; if (dir === 'w') ex = B.x - gap;
        if (dir.length === 2) { const dy = Math.abs(ey - py) * .45; ex = px + (dir[1] === 'e' ? dy : -dy); sh = dir[1] === 'e' ? 22 : -22; }
        else if (dir === 'n' || dir === 's') sh = 0;
        P.dot(px, py, st === 'sig' ? 3.2 : 2.4, st, st === 'sig');
        P.ln(px, py, ex, ey, st);
        if (sh) P.ln(ex, ey, ex + sh, ey, st);
        P.circ(ex + sh + Math.sign(sh || 0) * 3.5, ey, 3.5, st);
      });
      /* 3C の図（.c3）：先に描く（事業理解 → 画面の順に読めるように） */
      const c3s = [...el.querySelectorAll('.c3')];
      if (c3s.length) { const Q = Plan(); c3s.forEach(c => venn(Q, c, fr, Bs)); P.L.splice(n0, 0, ...Q.L); }
      let tot = 0;
      P.L.forEach(it => {
        let l = 0; for (let i = 1; i < it.pts.length; i++) l += Math.hypot(it.pts[i][0] - it.pts[i - 1][0], it.pts[i][1] - it.pts[i - 1][1]);
        it.len = it.dot ? 14 : Math.max(1, l); it.c0 = tot; tot += it.len;
      });
      S.items = P.L; S.tot = tot; S.dur = clamp(tot / 1500, 1.6, 3.2);
      draw();
    }
    function draw() {
      const { ctx } = S; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, S.w, S.h);
      const len = S.u * S.tot; let tip = null;
      ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
      for (const it of S.items) {
        if (it.c0 >= len) { if (it.done && it.done.classList.contains('on') && S.u < 1) it.done.classList.remove('on'); continue; }
        const st = ST[it.st]; const k = clamp((len - it.c0) / it.len);
        if (it.dot) {
          const [x, y] = it.pts[0], r = it.dot * eio(k);
          ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.beginPath(); ctx.arc(x, y, r + 1.6, 0, TAU); ctx.fill();
          ctx.fillStyle = `rgba(${COL[st.c]},${st.a})`;
          if (it.sq) ctx.fillRect(x - r, y - r, r * 2, r * 2); else { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
          continue;
        }
        ctx.strokeStyle = `rgba(${COL[st.c]},${st.a})`; ctx.lineWidth = st.w; ctx.setLineDash(st.d || []);
        let rem = it.len * k; const p = it.pts; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); let x = p[0][0], y = p[0][1];
        for (let i = 1; i < p.length; i++) {
          const d = Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]);
          if (rem >= d) { x = p[i][0]; y = p[i][1]; ctx.lineTo(x, y); rem -= d; }
          else { const f = d ? rem / d : 0; x = mix(p[i - 1][0], p[i][0], f); y = mix(p[i - 1][1], p[i][1], f); ctx.lineTo(x, y); break; }
        }
        ctx.stroke();
        if (k < 1) tip = [x, y];
        else if (it.done && !it.done.classList.contains('on')) { it.done.classList.add('on'); sync(); }
      }
      if (tip && S.u < 1) { /* ペン先 */
        const [x, y] = tip, r = 3.2; ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = `rgba(${COL.ink},.9)`;
        ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x - r * 2.4, y); ctx.lineTo(x + r * 2.4, y); ctx.moveTo(x, y - r * 2.4); ctx.lineTo(x, y + r * 2.4); ctx.stroke();
      }
      if (S.u >= 1) S.items.forEach(it => { if (it.done && !it.done.classList.contains('on')) { it.done.classList.add('on'); sync(); } });
    }
    S.build = build; S.draw = draw;
    const ctl = {
      restart() { if (REDUCE) { S.u = 1; draw(); return; } S.u = 0; S.t0 = performance.now(); S.run = true; S.started = true; scrs.forEach(s => s.classList.remove('on')); kick(); },
      set(u) { S.run = false; S.u = clamp(u); draw(); },
      get u() { return S.u; }, el
    };
    S.ctl = ctl; figs.push(S);
    ro.observe(el);
    if (o.auto !== false) io.observe(el);
    build();
    if (REDUCE) { S.u = 1; draw(); }
    return ctl;
  }
  let raf = 0;
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  function loop(now) {
    raf = 0; let any = false;
    figs.forEach(S => { if (!S.run) return; S.u = clamp((now - S.t0) / 1000 / S.dur); S.draw(); if (S.u >= 1) S.run = false; else any = true; });
    if (any) kick();
  }
  const io = new IntersectionObserver(es => es.forEach(e => {
    const S = figs.find(f => f.el === e.target); if (!S) return;
    S.vis = e.isIntersecting;
    if (e.isIntersecting && !S.started) S.ctl.restart();
  }), { threshold: .28 });
  const ro = new ResizeObserver(es => es.forEach(e => { const S = figs.find(f => f.el === e.target); if (S && e.contentRect.width) S.build(); }));

  /* ---------- 動画：画面に入った時だけ再生、画面外で止める ---------- */
  const vids = [];
  function want(v) {
    const sc = v.closest('[data-scene]'), scr = v.closest('.scr');
    return v._vis && (!sc || sc.classList.contains('act')) && (!scr || scr.classList.contains('on')) && !REDUCE;
  }
  function upd(v) {
    if (want(v)) {
      if (!v.getAttribute('src')) { v.preload = 'auto'; v.src = v.dataset.src; }
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    } else if (!v.paused) v.pause();
  }
  function sync() { vids.forEach(upd); }
  const vio = new IntersectionObserver(es => es.forEach(e => { e.target._vis = e.isIntersecting; upd(e.target); }), { threshold: .15 });
  function videos(root = document) {
    root.querySelectorAll('video[data-src]').forEach(v => {
      if (vids.includes(v)) return; vids.push(v);
      v.muted = true; v.playsInline = true; v.loop = false;
      const t0 = +v.dataset.t0 || 0;
      /* 頭を飛ばす動画は、飛ばし終えて再生が始まるまで隠す（下に同じ切り出しの静止画を敷いてある） */
      if (t0) { v.classList.add('wait'); v.addEventListener('timeupdate', () => { if (v.currentTime >= t0 - .05 && !v.paused) v.classList.remove('wait'); }); }
      v.addEventListener('loadedmetadata', () => { if (t0 && v.currentTime < t0) v.currentTime = t0; });
      v.addEventListener('ended', () => { v.currentTime = t0; if (want(v)) { const p = v.play(); if (p && p.catch) p.catch(() => {}); } });
      vio.observe(v);
    });
  }

  /* ---------- 見出し：細く縮んだ字 → 広く太く ---------- */
  const meas = document.createElement('span');
  meas.setAttribute('aria-hidden', 'true');
  meas.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden;font-size:100px;line-height:1';
  const sels = [];
  function fitOne(h) {
    if (!meas.parentNode) document.body.appendChild(meas);
    const cs = getComputedStyle(h), jp = !!h.dataset.jp;
    meas.style.fontFamily = cs.fontFamily; meas.style.letterSpacing = jp ? '0em' : '-0.02em';
    meas.style.fontVariationSettings = jp ? '"wght" 800' : '"wdth" 151,"wght" 900,"opsz" 144';
    meas.textContent = h.textContent.trim();
    const box = ((h.clientWidth || h.parentElement.clientWidth) - (parseFloat(h.dataset.inset) || 0)) * (parseFloat(h.dataset.fitw) || 1);
    const mx = (innerWidth <= 760 && h.dataset.maxSp) ? parseFloat(h.dataset.maxSp) : (parseFloat(h.dataset.max) || 96);
    const fs = Math.min(mx, 100 * box / meas.getBoundingClientRect().width * .985);
    h.style.fontSize = fs.toFixed(1) + 'px';
  }
  function paint(h) {
    const e = eio(h._p || 0);
    if (h.dataset.jp) { h.style.fontVariationSettings = `"wght" ${(100 + 700 * e).toFixed(0)}`; h.style.transform = `scaleX(${(.42 + .58 * e).toFixed(3)})`; }
    else h.style.fontVariationSettings = `"wdth" ${mix(25, 151, e).toFixed(1)},"wght" ${mix(100, 900, e).toFixed(0)},"opsz" 144`;
  }
  let lt = 0, sq = 0, more = false;
  function supd() {
    const vh = innerHeight, now = performance.now(), dt = lt ? Math.min(.05, (now - lt) / 1000) : 0; lt = now; more = false;
    sels.forEach(h => {
      if (!h.dataset.manual) { const r = h.getBoundingClientRect(); const p = REDUCE ? 1 : clamp((vh * .95 - r.top) / (vh * .45)); h._g = Math.max(h._g || 0, p); }
      h._p = h._p == null ? 0 : h._p; h._p = REDUCE ? h._g : Math.min(h._g || 0, h._p + dt / 1.3);
      if (h._p < (h._g || 0)) more = true; paint(h);
    });
    if (more) sreq(); else lt = 0;
  }
  function sreq() { if (!sq) sq = requestAnimationFrame(() => { sq = 0; supd(); }); }
  function stretch(els) {
    [...els].forEach(h => { sels.push(h); h._p = REDUCE ? 1 : 0; h._g = REDUCE ? 1 : 0; paint(h); });
    const fitAll = () => sels.forEach(fitOne);
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { fitAll(); sreq(); });
    fitAll(); sreq();
    if (!stretch._on) { stretch._on = 1; addEventListener('scroll', sreq, { passive: true }); let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { sels.forEach(fitOne); sreq(); }, 120); }); }
  }
  function replay(h) { if (REDUCE) return; h._p = 0; h._g = 1; lt = 0; paint(h); sreq(); }
  function refit() { sels.forEach(fitOne); }

  window.SvcReal = { fig, videos, sync, stretch, replay, refit, REDUCE };
})();
