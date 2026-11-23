/* svc-draw.js — SERVICE（事業内容）の4つの動く絵。製図のトーン（生成りの紙・鉛筆の細い線・墨＋朱1点）。
   使い方：
     const ctl = SvcDraw.mount(canvas, 's2a' | 'hh' | 'hhr' | 'vp', {mode:'loop'|'scrub', offset:秒, grid:true});
     ctl.set(0..1)   … scrub のとき描き上がりの進み具合を外から渡す
     ctl.restart()   … loop のとき最初から描き直す
     SvcDraw.stretch(要素の配列, {fit:true})  … 見出しを「細く縮んだ字 → 広く太く」伸ばす（Roboto Flex）
   画面外の絵は描かない。見えている絵が1枚も無いときは requestAnimationFrame 自体を止める。 */
(function () {
  'use strict';
  const TAU = Math.PI * 2;
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const mix = (a, b, t) => a + (b - a) * t;
  const sg = (u, a, b) => clamp((u - a) / (b - a));
  const eo = t => 1 - Math.pow(1 - t, 3);
  const eio = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const W0 = 480, H0 = 320; /* 絵の設計寸法 */

  function colors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n, d) => (cs.getPropertyValue(n) || '').trim() || d;
    const hex = h => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(','); };
    return { ink: hex(g('--ink', '#151513')), sig: hex(g('--sig', '#ef4519')), line: hex(g('--line', '#dcd8cd')), mute: hex(g('--mute', '#6f6d69')) };
  }

  /* ---------- 製図の道具（設計寸法の座標で描く。線の太さは画面のpxで一定） ---------- */
  function Pen(ctx, s, col) {
    const g = { ctx, s, col, tip: null };
    const st = (c, a, w, d) => { ctx.strokeStyle = `rgba(${col[c]},${a})`; ctx.lineWidth = w / s; ctx.setLineDash(d ? d.map(v => v / s) : []); };
    g.ink = (a = .82, w = 1) => st('ink', a, w);
    g.thin = (a = .5, w = .8) => st('ink', a, w);
    g.dash = (a = .4, w = .8, d = [3, 3]) => st('ink', a, w, d);
    g.sig = (a = 1, w = 1.5, d) => st('sig', a, w, d);
    g.fill = (c, a) => { ctx.fillStyle = `rgba(${col[c]},${a})`; };
    g.pl = (pts, k, close) => {
      if (k <= 0) return null;
      if (close) pts = pts.concat([pts[0]]);
      const L = []; let tot = 0;
      for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); L.push(d); tot += d; }
      let rem = tot * clamp(k), x = pts[0][0], y = pts[0][1];
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let i = 1; i < pts.length; i++) {
        const d = L[i - 1];
        if (rem >= d) { x = pts[i][0]; y = pts[i][1]; ctx.lineTo(x, y); rem -= d; }
        else { const f = d ? rem / d : 0; x = mix(pts[i - 1][0], pts[i][0], f); y = mix(pts[i - 1][1], pts[i][1], f); ctx.lineTo(x, y); break; }
      }
      ctx.stroke(); if (k < 1) g.tip = [x, y];
      return [x, y];
    };
    g.ln = (x1, y1, x2, y2, k) => g.pl([[x1, y1], [x2, y2]], k);
    g.rc = (x, y, w, h, k) => g.pl([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], k, true);
    /* 製図の枠：角で線が少しはみ出す */
    g.frame = (x, y, w, h, k, o = 4) => {
      const q = [[x - o, y, x + w + o, y], [x + w, y - o, x + w, y + h + o], [x + w + o, y + h, x - o, y + h], [x, y + h + o, x, y - o]];
      for (let i = 0; i < 4; i++) { const kk = clamp(k * 4 - i); if (kk > 0) g.ln(q[i][0], q[i][1], q[i][2], q[i][3], kk); }
    };
    g.arc = (cx, cy, r, a0, a1, k) => {
      if (k <= 0) return; const a = a0 + (a1 - a0) * clamp(k);
      ctx.beginPath(); ctx.arc(cx, cy, r, a0, a, a1 < a0); ctx.stroke();
      if (k < 1) g.tip = [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
    };
    g.circ = (cx, cy, r, k, a0 = -Math.PI / 2) => g.arc(cx, cy, r, a0, a0 + TAU, k);
    g.sq = (x, y, z) => ctx.fillRect(x - z / 2, y - z / 2, z, z);
    g.dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
    g.hatch = (x, y, w, h, k, gap = 5) => {
      if (k <= 0) return; ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); ctx.beginPath();
      const n = Math.ceil((w + h) / gap), m = Math.ceil(n * clamp(k));
      for (let i = 0; i < m; i++) { const o = i * gap; ctx.moveTo(x + o, y); ctx.lineTo(x + o - h, y + h); }
      ctx.stroke(); ctx.restore();
    };
    g.head = (x, y, ang, z = 6) => { /* 矢じり（線） */
      ctx.beginPath(); ctx.setLineDash([]);
      ctx.moveTo(x + Math.cos(ang + 2.6) * z, y + Math.sin(ang + 2.6) * z); ctx.lineTo(x, y); ctx.lineTo(x + Math.cos(ang - 2.6) * z, y + Math.sin(ang - 2.6) * z); ctx.stroke();
    };
    g.label = (str, x, y, size = 9, a = .62, align = 'left') => {
      ctx.font = `500 ${size / s}px "JetBrains Mono",ui-monospace,Menlo,monospace`; ctx.textAlign = align; ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(${col.ink},${a})`; ctx.fillText(str, x, y);
    };
    g.target = (x, y, r, k) => { /* 位置合わせの印 */
      g.circ(x, y, r, k); g.ln(x - r - 4, y, x + r + 4, y, k); g.ln(x, y - r - 4, x, y + r + 4, k);
    };
    g.pen = () => { /* ペン先（プロッタのヘッド） */
      if (!g.tip) return; const [x, y] = g.tip, r = 3.2 / s;
      ctx.setLineDash([]); ctx.lineWidth = 1 / s; ctx.strokeStyle = `rgba(${col.ink},.9)`;
      ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.moveTo(x - r * 2.4, y); ctx.lineTo(x + r * 2.4, y); ctx.moveTo(x, y - r * 2.4); ctx.lineTo(x, y + r * 2.4); ctx.stroke();
    };
    return g;
  }
  const bz = (p, t) => { const m = 1 - t; return [m * m * m * p[0][0] + 3 * m * m * t * p[1][0] + 3 * m * t * t * p[2][0] + t * t * t * p[3][0], m * m * m * p[0][1] + 3 * m * m * t * p[1][1] + 3 * m * t * t * p[2][1] + t * t * t * p[3][1]]; };
  const bzPts = (p, n = 28) => { const a = []; for (let i = 0; i <= n; i++) a.push(bz(p, i / n)); return a; };
  function noise1(x) { const i = Math.floor(x), f = x - i, h = n => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }; const u = f * f * (3 - 2 * f); return mix(h(i), h(i + 1), u); }

  /* ======================================================================
     01 Strategy2Action
     3C（顧客・競合・自社）の円 → 重なりに朱の1点（ボトルネック）→ KPIツリーが枝分かれ
     → 選んだ1本の枝が朱になり、実行の矢印（4つのステップ）が伸びる → ダッシュボードの枠に棒と折れ線が上がる
     ====================================================================== */
  function drawS2A(g, u, t) {
    const { ctx } = g;
    const V = [[94, 130], [142, 130], [118, 172]], R = 44;
    g.dash(.34, .8);
    V.forEach((c, i) => { const k = sg(u, i * .05, .05 + i * .05); g.ln(c[0] - 5, c[1], c[0] + 5, c[1], k); g.ln(c[0], c[1] - 5, c[0], c[1] + 5, k); });
    g.ink(.82, 1);
    V.forEach((c, i) => g.circ(c[0], c[1], R, eio(sg(u, .02 + i * .06, .13 + i * .06)), -Math.PI / 2 + i * 2.1));
    /* 3つの重なりに朱の点 */
    const X = [118, 145], kp = sg(u, .21, .25);
    if (kp > 0) {
      g.fill('sig', kp); g.sq(X[0], X[1], 7);
      const pu = (t * .6) % 1; g.sig((1 - pu) * .7 * kp, 1); ctx.beginPath(); ctx.arc(X[0], X[1], 6 + pu * 22, 0, TAU); ctx.stroke();
    }
    /* KPIツリー */
    const root = [194, 145], n1 = [[232, 108], [232, 182]], lv = [[270, 90], [270, 126], [270, 164], [270, 200]];
    const el = (a, b, k) => { const mx = (a[0] + b[0]) / 2; g.pl([[a[0] + 4, a[1]], [mx, a[1]], [mx, b[1]], [b[0] - 4, b[1]]], k); };
    const box = (n, k) => g.rc(n[0] - 4, n[1] - 4, 8, 8, k);
    g.sig(1, 1.4); g.ln(X[0] + 5, X[1], root[0] - 4, root[1], sg(u, .25, .3));
    g.ink(.82, 1); box(root, sg(u, .3, .32));
    n1.forEach(n => { g.ink(.8, 1); el(root, n, sg(u, .32, .38)); box(n, sg(u, .37, .39)); });
    lv.forEach((n, i) => { g.ink(.78, 1); el(n1[i >> 1], n, sg(u, .39 + i * .015, .44 + i * .015)); box(n, sg(u, .44 + i * .015, .46 + i * .015)); });
    const kh = sg(u, .5, .56);
    if (kh > 0) { g.sig(1, 1.5); el(root, n1[0], clamp(kh * 2)); el(n1[0], lv[1], clamp(kh * 2 - 1)); if (kh >= 1) { g.fill('sig', 1); g.sq(lv[1][0], lv[1][1], 5); } }
    /* 実行の矢印と4つのステップ */
    const ax0 = 280, ax1 = 328, ay = 126, ka = sg(u, .56, .63);
    g.sig(1, 1.5); g.ln(ax0, ay, ax1, ay, ka); if (ka >= 1) g.head(ax1, ay, 0, 6);
    g.thin(.55, .8); for (let i = 0; i < 4; i++) { const k = sg(u, .58 + i * .012, .6 + i * .012), x = ax0 + 8 + i * 10; g.ln(x, ay - 5, x, ay + 5, k); }
    /* ダッシュボード */
    const dx = 336, dy = 62, dw = 120, dh = 172;
    g.ink(.85, 1); g.frame(dx, dy, dw, dh, sg(u, .6, .7));
    g.thin(.5, .8); g.ln(dx, dy + 14, dx + dw, dy + 14, sg(u, .68, .71));
    if (u > .7) { g.fill('ink', .55 * sg(u, .7, .72)); for (let i = 0; i < 3; i++) g.dot(dx + 7 + i * 6, dy + 7, 1.6); }
    for (let i = 0; i < 3; i++) { /* 指標のカード */
      const k = sg(u, .71 + i * .015, .74 + i * .015), cx = dx + 8 + i * 37;
      g.thin(.55, .8); g.rc(cx, dy + 22, 31, 22, k);
      g.ink(.75, 2); g.ln(cx + 5, dy + 30, cx + 5 + [14, 18, 11][i], dy + 30, sg(u, .74 + i * .015, .77 + i * .015));
      g.thin(.4, .8); g.ln(cx + 5, dy + 37, cx + 24, dy + 37, sg(u, .75 + i * .015, .78 + i * .015));
    }
    const bx = dx + 12, base = dy + dh - 14, hs = [20, 26, 24, 36, 44, 56, 74];
    g.thin(.5, .8); g.ln(dx + 8, base, dx + dw - 8, base, sg(u, .74, .78));
    for (let i = 0; i < 4; i++) { g.ln(dx + 8, base - i * 22, dx + 11, base - i * 22, sg(u, .76, .78)); }
    const tops = [];
    hs.forEach((h, i) => {
      const k = eo(sg(u, .77 + i * .02, .85 + i * .02));
      const hh = h * k + (u >= 1 ? Math.sin(t * 1.3 + i * .9) * 1.4 : 0), x = bx + i * 14;
      tops.push([x + 4.5, base - hh - 8]);
      if (k <= 0) return;
      g.ink(.75, 1); g.rc(x, base - hh, 9, hh, 1);
      g.thin(.28, .7); g.hatch(x, base - hh, 9, hh, 1, 3.2);
    });
    const kl = sg(u, .9, .98);
    if (kl > 0) {
      g.ink(.85, 1); g.pl(tops, kl);
      if (kl >= 1) { const e = tops[tops.length - 1]; g.fill('sig', 1); g.sq(e[0], e[1], 6); const pu = (t * .6 + .5) % 1; g.sig((1 - pu) * .7, 1); ctx.beginPath(); ctx.arc(e[0], e[1], 5 + pu * 16, 0, TAU); ctx.stroke(); }
    }
  }

  /* ======================================================================
     02 HookHack
     LPの設計図 → 5分の時計の針が1周（LPから5分）→ 6コマの絵コンテ（縦動画）が描かれる
     → 絵コンテからLPへ戻る点線の輪（検証から改善まで＝PDCA）
     ====================================================================== */
  function drawHH(g, u, t) {
    const { ctx } = g;
    const lx = 30, ly = 38, lw = 92, lh = 236;
    g.ink(.85, 1); g.frame(lx, ly, lw, lh, sg(u, 0, .08));
    g.thin(.5, .8); g.ln(lx, ly + 12, lx + lw, ly + 12, sg(u, .06, .09));
    if (u > .08) { g.fill('ink', .5 * sg(u, .08, .1)); for (let i = 0; i < 3; i++) g.dot(lx + 7 + i * 6, ly + 6, 1.5); }
    g.ink(.7, .9); g.rc(lx + 8, ly + 20, lw - 16, 54, sg(u, .08, .12));
    g.thin(.35, .8); g.ln(lx + 8, ly + 20, lx + lw - 8, ly + 74, sg(u, .11, .13)); g.ln(lx + lw - 8, ly + 20, lx + 8, ly + 74, sg(u, .12, .14));
    g.ink(.8, 2.4); g.ln(lx + 8, ly + 86, lx + 70, ly + 86, sg(u, .12, .14)); g.ln(lx + 8, ly + 95, lx + 52, ly + 95, sg(u, .13, .15));
    g.thin(.45, .8); [74, 68, 76, 50].forEach((w, i) => g.ln(lx + 8, ly + 108 + i * 6, lx + 8 + w, ly + 108 + i * 6, sg(u, .14 + i * .006, .16 + i * .006)));
    g.ink(.75, 1); g.rc(lx + 8, ly + 140, 44, 13, sg(u, .16, .18));
    for (let i = 0; i < 3; i++) { const x = lx + 8 + i * 26; g.thin(.55, .8); g.rc(x, ly + 166, 22, 22, sg(u, .17 + i * .008, .19 + i * .008)); g.circ(x + 11, ly + 177, 5, sg(u, .18 + i * .008, .2 + i * .008)); }
    g.thin(.45, .8); [70, 60, 72].forEach((w, i) => g.ln(lx + 8, ly + 200 + i * 6, lx + 8 + w, ly + 200 + i * 6, sg(u, .19, .21)));
    g.thin(.3, .7); g.hatch(lx + 8, ly + 220, lw - 16, 10, sg(u, .2, .23), 3.5); g.thin(.55, .8); g.rc(lx + 8, ly + 220, lw - 16, 10, sg(u, .2, .22));

    /* 5分の時計 */
    const cx = 232, cy = 150, R = 46;
    g.ink(.85, 1); g.circ(cx, cy, R, sg(u, .2, .3));
    g.dash(.3, .8, [2, 3]); g.circ(cx, cy, R - 7, sg(u, .24, .32));
    g.ink(.8, 1); g.rc(cx - 6, cy - R - 11, 12, 6, sg(u, .28, .3)); g.ln(cx, cy - R - 5, cx, cy - R, sg(u, .29, .31));
    g.ln(cx + R * .72, cy - R * .72, cx + R * .72 + 6, cy - R * .72 - 6, sg(u, .29, .31));
    const kt = sg(u, .28, .34);
    for (let i = 0; i < 25; i++) {
      const a = -Math.PI / 2 + i / 25 * TAU, big = i % 5 === 0, k = clamp(kt * 25 - i);
      if (k <= 0) continue; const r1 = R - 2, r0 = big ? R - 11 : R - 6;
      g.ink(big ? .85 : .45, big ? 1.2 : .8); g.ln(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0, cx + Math.cos(a) * r1, cy + Math.sin(a) * r1, k);
      if (big && k >= 1) g.label(String(i / 5 === 0 ? 5 : i / 5), cx + Math.cos(a) * (R + (i ? 9 : 20)), cy + Math.sin(a) * (R + (i ? 9 : 20)), 8.5, .7, 'center');
    }
    const kh = eio(sg(u, .34, .62)), ah = -Math.PI / 2 + kh * TAU;
    if (u > .33) {
      if (kh > 0) { g.fill('sig', .06); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R - 7, -Math.PI / 2, ah); ctx.closePath(); ctx.fill(); g.sig(.9, 1.2); g.arc(cx, cy, R - 7, -Math.PI / 2, ah, 1); }
      g.sig(1, 1.6); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(ah) * (R - 12), cy + Math.sin(ah) * (R - 12)); ctx.stroke();
      g.fill('ink', .9); g.dot(cx, cy, 2.4);
    }
    /* LP → 時計 → 絵コンテ の流れ */
    const fl = [0, 1, 2].map(i => [[lx + lw + 6, ly + 50 + i * 70], [lx + lw + 44, ly + 50 + i * 70], [cx - R - 40, cy - 14 + i * 14], [cx - R - 6, cy - 14 + i * 14]]);
    g.dash(.38, .8, [3, 3]); fl.forEach((p, i) => g.pl(bzPts(p), sg(u, .26 + i * .015, .32 + i * .015)));
    const fx0 = 314, fy0 = 46, fw = 40, fh = 71, gx = 9, gy = 12;
    const fr = []; for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) fr.push([fx0 + c * (fw + gx), fy0 + r * (fh + gy)]);
    const fo = [0, 1, 2].map(i => [[cx + R + 6, cy - 14 + i * 14], [cx + R + 30, cy - 14 + i * 14], [fx0 - 30, fy0 + 40 + i * 50], [fx0 - 6, fy0 + 40 + i * 50]]);
    g.dash(.38, .8, [3, 3]); fo.forEach((p, i) => g.pl(bzPts(p), sg(u, .6 + i * .015, .65 + i * .015)));
    const flowA = u < .62 ? sg(u, .3, .34) : 1 - sg(u, .62, .66), flowB = sg(u, .64, .68);
    g.fill('ink', .8);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const q = ((t * .55 + i * .33 + j * .5) % 1);
      if (flowA > 0) { g.fill('ink', .8 * flowA); const p = bz(fl[i], q); g.sq(p[0], p[1], 2.6); }
      if (flowB > 0) { g.fill('ink', .8 * flowB); const p = bz(fo[i], q); g.sq(p[0], p[1], 2.6); }
    }
    /* 絵コンテ6コマ */
    fr.forEach((f, i) => {
      const [x, y] = f, k = sg(u, .64 + i * .035, .68 + i * .035), kk = sg(u, .66 + i * .035, .72 + i * .035), mx = x + fw / 2;
      g.ink(.85, 1); g.rc(x, y, fw, fh, k);
      if (kk <= 0) return;
      g.thin(.6, .8);
      if (i === 0) { g.circ(mx, y + 24, 8, kk); g.pl([[x + 8, y + 50], [x + 12, y + 38], [mx, y + 34], [x + fw - 12, y + 38], [x + fw - 8, y + 50]], kk); }
      else if (i === 1) { g.pl([[mx - 5, y + 14], [mx + 5, y + 14], [mx + 5, y + 20], [mx + 9, y + 25], [mx + 9, y + 52], [mx - 9, y + 52], [mx - 9, y + 25], [mx - 5, y + 20]], kk, true); g.ln(mx - 9, y + 34, mx + 9, y + 34, kk); }
      else if (i === 2) { g.ink(.8, 2.2); g.ln(x + 6, y + 22, x + fw - 6, y + 22, kk); g.ln(x + 6, y + 30, x + fw - 12, y + 30, kk); g.thin(.5, .8); g.ln(x + 6, y + 40, x + fw - 8, y + 40, kk); }
      else if (i === 3) { g.ln(x + 4, y + fh - 8, x + fw - 4, y + 10, kk); g.circ(x + 13, y + 22, 5, kk); g.rc(x + fw - 17, y + 40, 10, 10, kk); }
      else if (i === 4) { g.pl([[x + 6, y + 50], [x + 14, y + 40], [x + 21, y + 44], [x + 33, y + 22]], kk); g.head(x + 33, y + 22, -1.07, 5); g.ln(x + 6, y + 54, x + fw - 6, y + 54, kk); }
      else { g.rc(x + 7, y + 44, fw - 14, 10, kk); g.pl([[mx - 5, y + 17], [mx + 7, y + 25], [mx - 5, y + 33]], kk, true); }
      g.thin(.5, .8); g.ink(.8, 2); g.ln(x + 6, y + fh - 8, x + 6 + (i % 2 ? 18 : 24), y + fh - 8, kk); /* テロップ */
    });
    /* 絵コンテ → LP に戻る輪（PDCA） */
    const loop = [[fx0 + fw * 1.5 + gx, fy0 + 2 * fh + gy + 8], [fx0 + 60, 300], [lx + lw + 70, 312], [lx + lw / 2, ly + lh + 6]];
    const kl = sg(u, .86, .96);
    g.dash(.5, .9, [4, 3]); g.pl(bzPts(loop, 36), kl);
    if (kl >= 1) { g.thin(.7, 1); const a = bz(loop, .97), b = loop[3]; g.head(b[0], b[1], Math.atan2(b[1] - a[1], b[0] - a[0]), 6); }
    if (u >= .96) { const q = (t * .25) % 1, p = bz(loop, q); g.fill('ink', .8); g.sq(p[0], p[1], 3); }
  }

  /* ======================================================================
     03 HookHacker
     AI（HookHack）が点線で骨組みを出す → 右のインドネシア（ID）から伸びる墨の線が1ブロックずつ実装
     → 左の日本（JP）から伸びる朱の線が「朱入れ」（直しの丸とチェック）→ LPの設計図が組み上がる
     ====================================================================== */
  const HB = [
    { x: 172, y: 64, w: 136, h: 58, t: 'hero' }, { x: 172, y: 132, w: 110, h: 18, t: 'head' },
    { x: 172, y: 156, w: 126, h: 16, t: 'txt' }, { x: 172, y: 180, w: 46, h: 13, t: 'btn' },
    { x: 172, y: 204, w: 40, h: 40, t: 'card' }, { x: 220, y: 204, w: 40, h: 40, t: 'card' }, { x: 268, y: 204, w: 40, h: 40, t: 'card' },
    { x: 172, y: 254, w: 136, h: 16, t: 'band' }, { x: 160, y: 280, w: 160, h: 16, t: 'foot' }
  ];
  function drawHHR(g, u, t) {
    const { ctx } = g;
    const fx = 160, fy = 44, fw = 160, fh = 252;
    g.ink(.85, 1); g.frame(fx, fy, fw, fh, sg(u, 0, .08));
    g.thin(.5, .8); g.ln(fx, fy + 11, fx + fw, fy + 11, sg(u, .06, .09));
    if (u > .08) { g.fill('ink', .5); for (let i = 0; i < 3; i++) g.dot(fx + 7 + i * 6, fy + 5.5, 1.5); }
    /* AI の点 */
    const ai = [240, 16], kA = sg(u, .06, .1);
    if (kA > 0) {
      g.ink(.85, 1); g.circ(ai[0], ai[1], 7, kA);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4 + t * .4; g.ln(ai[0] - Math.cos(a) * 4, ai[1] - Math.sin(a) * 4, ai[0] + Math.cos(a) * 4, ai[1] + Math.sin(a) * 4, kA); }
      g.label('AI', ai[0] + 13, ai[1], 9, .72 * kA);
      g.dash(.32, .8, [2, 3]); g.ln(ai[0] - 4, ai[1] + 8, fx + 8, fy + 16, sg(u, .1, .14)); g.ln(ai[0] + 4, ai[1] + 8, fx + fw - 8, fy + 16, sg(u, .1, .14));
    }
    /* 骨組み（点線） */
    HB.forEach((b, i) => {
      const k = sg(u, .13 + i * .018, .16 + i * .018), done = sg(u, .36 + i * .036, .4 + i * .036);
      if (done < 1) { g.dash(.42 * (1 - done * .6), .8, [3, 2]); g.rc(b.x, b.y, b.w, b.h, k); }
    });
    /* インドネシア（ID）から伸びる線と実装 */
    const ID = [452, 170], JP = [28, 170];
    const kI = sg(u, .3, .36);
    if (kI > 0) { g.ink(.85, 1); g.target(ID[0], ID[1], 4, kI); g.label('ID', ID[0], ID[1] + 16, 9, .72 * kI, 'center'); }
    let head = null;
    HB.forEach((b, i) => {
      const k = sg(u, .36 + i * .036, .4 + i * .036); if (k <= 0) return;
      if (k < 1) head = [b.x + b.w, b.y + b.h / 2];
      g.ink(.82, 1); g.rc(b.x, b.y, b.w, b.h, k);
      const kk = sg(u, .38 + i * .036, .43 + i * .036); if (kk <= 0) return;
      if (b.t === 'hero') { g.thin(.35, .8); g.ln(b.x, b.y, b.x + b.w, b.y + b.h, kk); g.ln(b.x + b.w, b.y, b.x, b.y + b.h, kk); g.thin(.22, .7); g.hatch(b.x + b.w * .62, b.y, b.w * .38, b.h, kk, 3.5); }
      else if (b.t === 'head') { g.ink(.85, 2.4); g.ln(b.x + 4, b.y + 6, b.x + b.w - 14, b.y + 6, kk); g.ln(b.x + 4, b.y + 13, b.x + b.w - 50, b.y + 13, kk); }
      else if (b.t === 'txt') { g.thin(.5, .8); g.ln(b.x + 4, b.y + 5, b.x + b.w - 6, b.y + 5, kk); g.ln(b.x + 4, b.y + 11, b.x + b.w - 30, b.y + 11, kk); }
      else if (b.t === 'btn') { g.ink(.8, 1.8); g.ln(b.x + 8, b.y + 6.5, b.x + b.w - 12, b.y + 6.5, kk); }
      else if (b.t === 'card') { g.thin(.6, .8); g.circ(b.x + b.w / 2, b.y + 14, 7, kk); g.ln(b.x + 8, b.y + 28, b.x + b.w - 8, b.y + 28, kk); g.ln(b.x + 11, b.y + 33, b.x + b.w - 11, b.y + 33, kk); }
      else if (b.t === 'band') { g.thin(.28, .7); g.hatch(b.x, b.y, b.w, b.h, kk, 3.5); }
      else { g.thin(.45, .8); for (let j = 0; j < 4; j++) g.ln(b.x + 10 + j * 36, b.y + 8, b.x + 30 + j * 36, b.y + 8, kk); }
    });
    if (kI > 0) {
      const end = head || (u < .7 ? [fx + fw, ID[1]] : null);
      g.ink(.6, .9);
      if (end) { g.pl([[ID[0] - 6, ID[1]], [mix(ID[0], end[0], .5), ID[1]], [mix(ID[0], end[0], .5), end[1]], [end[0] + 2, end[1]]], kI); if (head) g.tip = [head[0] + 2, head[1]]; }
      else { g.pl([[ID[0] - 6, ID[1]], [fx + fw + 2, ID[1]]], 1); }
    }
    /* 日本（JP）から伸びる朱の線と朱入れ */
    const kJ = sg(u, .74, .79);
    if (kJ > 0) {
      g.ink(.85, 1); g.target(JP[0], JP[1], 4, kJ); g.label('JP', JP[0], JP[1] + 16, 9, .72 * kJ, 'center');
      g.sig(1, 1.3); g.pl([[JP[0] + 6, JP[1]], [fx - 2, JP[1]]], kJ);
      const b = HB[3], kc = sg(u, .79, .85);
      g.sig(1, 1.4); g.pl(bzPts([[fx - 2, JP[1]], [fx + 10, JP[1] + 8], [b.x - 8, b.y + 6], [b.x - 4, b.y + b.h / 2]], 16), kc);
      if (kc > 0) { ctx.save(); ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.scale(1, .46); g.sig(1, 1.4); g.arc(0, 0, b.w / 2 + 9, Math.PI, Math.PI + TAU * .96, sg(u, .82, .88)); ctx.restore(); }
      [[HB[0].x + HB[0].w - 10, HB[0].y + 10], [HB[1].x + HB[1].w + 8, HB[1].y + 9], [HB[6].x + HB[6].w - 9, HB[6].y + 9]].forEach((p, i) => {
        g.sig(1, 1.5); g.pl([[p[0] - 5, p[1]], [p[0] - 1.5, p[1] + 4], [p[0] + 5, p[1] - 5]], sg(u, .88 + i * .03, .91 + i * .03));
      });
    }
    /* やり取り：線の上を行き来する点 */
    if (u >= 1) {
      const q = (t * .3) % 1, qi = Math.abs(1 - q * 2);
      g.fill('ink', .85); g.sq(mix(ID[0] - 6, fx + fw + 2, qi), ID[1], 3);
      g.fill('sig', 1); g.sq(mix(JP[0] + 6, fx - 2, 1 - qi), JP[1], 3);
    }
  }

  /* ======================================================================
     04 動画制作
     企画（絵コンテの紙）→ 撮影（フィルムカメラの線画。録画中は朱の点とリールが回る。視野の点線の先に人）
     → 編集（フィルムのコマが並ぶタイムライン、音の波形、朱の再生ヘッドが走る）
     ====================================================================== */
  function drawVP(g, u, t) {
    const { ctx } = g;
    /* 企画の紙 */
    const px = 22, py = 40, pw = 90, ph = 112;
    g.ink(.85, 1); g.frame(px, py, pw, ph, sg(u, 0, .07), 3);
    for (let i = 0; i < 3; i++) {
      const y = py + 12 + i * 32, k = sg(u, .06 + i * .02, .09 + i * .02);
      g.thin(.6, .8); g.rc(px + 8, y, 30, 22, k);
      g.thin(.35, .7); g.ln(px + 8, y, px + 38, y + 22, sg(u, .08 + i * .02, .1 + i * .02));
      g.thin(.5, .8); g.ln(px + 44, y + 5, px + pw - 8, y + 5, k); g.ln(px + 44, y + 11, px + pw - 14, y + 11, k); g.ln(px + 44, y + 17, px + pw - 22, y + 17, k);
    }
    g.dash(.45, .8); g.ln(px + pw + 6, py + 56, 150, 108, sg(u, .14, .18)); if (u > .18) { g.thin(.6, .9); g.head(150, 108, Math.atan2(108 - py - 56, 150 - px - pw - 6), 5); }
    /* カメラ */
    const cb = [162, 92, 86, 54];
    g.ink(.85, 1); g.rc(cb[0], cb[1], cb[2], cb[3], sg(u, .17, .23));
    g.ink(.8, 1); g.rc(148, 100, 14, 18, sg(u, .22, .24));
    g.rc(248, 102, 34, 34, sg(u, .23, .26));
    g.thin(.55, .8); [258, 266, 274].forEach((x, i) => g.ln(x, 102, x, 136, sg(u, .25 + i * .008, .27 + i * .008)));
    g.ink(.8, 1); g.pl([[282, 98], [300, 86], [300, 152], [282, 140]], sg(u, .26, .3), true);
    const rec = u > .3 && u < .7;
    const reels = [[186, 70], [224, 70]], rr = 16;
    reels.forEach((c, i) => {
      g.ink(.8, 1); g.circ(c[0], c[1], rr, sg(u, .27 + i * .02, .31 + i * .02));
      g.thin(.5, .8); g.circ(c[0], c[1], 3, sg(u, .3, .31));
      const ks = sg(u, .31, .33); if (ks <= 0) return;
      const sp = (rec ? t * 2.4 : t * .2) + i;
      for (let j = 0; j < 3; j++) { const a = sp + j * TAU / 3; g.ln(c[0] + Math.cos(a) * 4, c[1] + Math.sin(a) * 4, c[0] + Math.cos(a) * (rr - 3), c[1] + Math.sin(a) * (rr - 3), ks); }
      g.thin(.6, .8); g.ln(c[0], c[1] + rr, c[0], cb[1], ks);
    });
    g.ink(.8, 1); g.rc(193, 146, 24, 8, sg(u, .28, .3));
    const lg = [[205, 154, 176, 214], [205, 154, 234, 214], [205, 154, 205, 218]];
    lg.forEach((l, i) => { g.ink(.78, 1); g.ln(l[0], l[1], l[2], l[3], sg(u, .29 + i * .01, .33 + i * .01)); });
    g.thin(.45, .8); g.ln(189, 190, 221, 190, sg(u, .33, .35));
    if (u > .3) { const on = rec && Math.sin(t * 6) > -.3; g.fill(on ? 'sig' : 'ink', on ? 1 : .35); g.dot(238, 100, 3); }
    /* 視野と人 */
    const kv = sg(u, .34, .42);
    g.dash(.4, .8, [3, 3]); g.ln(300, 86, 400, 58, kv); g.ln(300, 152, 400, 178, kv);
    const sx = 430, kp = sg(u, .4, .5);
    g.ink(.85, 1); g.circ(sx, 98, 13, kp); g.pl([[404, 168], [408, 138], [sx, 124], [452, 138], [456, 168]], sg(u, .44, .52));
    g.thin(.5, .8); const cm = (x, y, dx, dy, k) => { g.ln(x, y, x + dx, y, k); g.ln(x, y, x, y + dy, k); };
    const kc = sg(u, .5, .54); cm(398, 62, 10, 10, kc); cm(462, 62, -10, 10, kc); cm(398, 174, 10, -10, kc); cm(462, 174, -10, -10, kc);
    g.dash(.45, .8); g.ln(256, 150, 300, 222, sg(u, .52, .56)); if (u > .56) { g.thin(.6, .9); g.head(300, 222, Math.atan2(72, 44), 5); }
    /* 編集のタイムライン */
    const tx0 = 22, tx1 = 458, ty = 232;
    g.ink(.8, 1); g.ln(tx0, ty, tx1, ty, sg(u, .54, .6));
    for (let x = tx0, i = 0; x <= tx1; x += 12, i++) { const k = sg(u, .56 + i * .002, .58 + i * .002); g.thin(i % 4 ? .4 : .7, .8); g.ln(x, ty, x, ty + (i % 4 ? 3 : 6), k); }
    g.dash(.25, .7, [2, 3]); g.ln(tx0, 272, tx1, 272, sg(u, .58, .62));
    const clips = [[26, 80], [110, 62], [176, 104], [284, 70], [358, 96]], cy0 = 242, ch = 24;
    clips.forEach((c, i) => {
      const k = sg(u, .6 + i * .035, .64 + i * .035); if (k <= 0) return;
      const drop = (1 - eo(k)) * -14, y = cy0 + drop;
      ctx.globalAlpha = k;
      g.ink(.82, 1); g.rc(c[0], y, c[1] - 4, ch, 1);
      g.fill('ink', .55); for (let x = c[0] + 3; x < c[0] + c[1] - 7; x += 6) { ctx.fillRect(x, y + 2, 2.4, 2.4); ctx.fillRect(x, y + ch - 4.4, 2.4, 2.4); }
      g.thin(.4, .7); for (let x = c[0] + 18; x < c[0] + c[1] - 8; x += 18) g.ln(x, y + 6, x, y + ch - 6, 1);
      ctx.globalAlpha = 1;
    });
    const kw = sg(u, .74, .86);
    if (kw > 0) {
      g.thin(.55, .8); ctx.beginPath();
      for (let x = tx0 + 4; x < tx0 + 4 + (tx1 - tx0 - 8) * kw; x += 3) { const a = 2 + noise1(x * .09) * 9 * (.4 + .6 * noise1(x * .013 + 3)); ctx.moveTo(x, 284 - a); ctx.lineTo(x, 284 + a); }
      ctx.stroke();
    }
    const kh = sg(u, .84, .9);
    if (kh > 0) {
      const ph2 = u < 1 ? sg(u, .84, 1) * .25 : (.25 + t * .07) % 1, x = tx0 + (tx1 - tx0) * ph2;
      g.sig(kh, 1.4); g.ln(x, ty - 6, x, 298, 1); g.fill('sig', kh); ctx.beginPath(); ctx.moveTo(x - 4, ty - 10); ctx.lineTo(x + 4, ty - 10); ctx.lineTo(x, ty - 4); ctx.closePath(); ctx.fill();
    }
  }

  const DRAW = { s2a: { f: drawS2A, T: 12 }, hh: { f: drawHH, T: 11 }, hhr: { f: drawHHR, T: 12 }, vp: { f: drawVP, T: 12 } };

  /* ---------- 実行係：見えている絵だけ 60fps で描く ---------- */
  const list = [];
  let raf = 0, last = 0, T = 0;
  const io = new IntersectionObserver(es => { for (const e of es) { const s = e.target.__svc; if (s) s.vis = e.isIntersecting; } kick(); }, { rootMargin: '80px 0px' });
  const ro = new ResizeObserver(es => { for (const e of es) { const s = e.target.__svc; if (s) s.dirty = true; } kick(); });
  function kick() { if (!raf && list.some(s => s.vis)) { last = performance.now(); raf = requestAnimationFrame(loop); } }
  function loop(now) {
    raf = 0; const dt = Math.min(.05, (now - last) / 1000); last = now; if (!REDUCE) T += dt;
    let any = false;
    for (const s of list) { if (!s.vis) continue; any = true; render(s); }
    if (any) raf = requestAnimationFrame(loop);
  }
  function size(s) {
    const r = s.c.getBoundingClientRect(); if (!r.width || !r.height) return false;
    s.w = r.width; s.h = r.height; s.c.width = Math.round(r.width * DPR); s.c.height = Math.round(r.height * DPR); s.dirty = false; return true;
  }
  function render(s) {
    if (s.dirty && !size(s)) return; if (!s.w) return;
    const { ctx, w, h } = s;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, w, h);
    if (s.grid) { /* 方眼（製図台） */
      const gp = w < 420 ? 16 : 20; ctx.lineWidth = 1; ctx.beginPath();
      for (let x = (w % gp) / 2; x <= w; x += gp) { ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, h); }
      for (let y = (h % gp) / 2; y <= h; y += gp) { ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(w, Math.round(y) + .5); }
      ctx.strokeStyle = `rgba(${s.col.line},.55)`; ctx.stroke();
    }
    const sc = Math.min(w / W0, h / H0) * (1 - s.pad * 2), ox = (w - W0 * sc) / 2, oy = (h - H0 * sc) / 2;
    ctx.setTransform(DPR * sc, 0, 0, DPR * sc, DPR * ox, DPR * oy);
    let u, alpha = 1, t = T + s.offset;
    if (s.mode === 'scrub' || REDUCE) { u = REDUCE && s.mode !== 'scrub' ? 1 : s.p; }
    else {
      const D = s.d.T, c = (t - s.t0) % D;
      u = clamp(c / (D * .72)); alpha = 1 - sg(c, D - 1.1, D - .15);
    }
    const g = Pen(ctx, sc, s.col);
    ctx.globalAlpha = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.save(); if (alpha < 1) { ctx.globalAlpha = alpha; } s.d.f(g, u, t); ctx.restore();
    if (u > 0 && u < 1 && alpha >= 1) g.pen();
    s.u = u;
  }
  function mount(canvas, name, o = {}) {
    const d = DRAW[name]; if (!d) throw new Error('svc-draw: unknown ' + name);
    const s = { c: canvas, ctx: canvas.getContext('2d'), d, name, mode: o.mode || 'loop', p: 0, vis: false, dirty: true, w: 0, h: 0,
      offset: o.offset || 0, t0: 0, grid: o.grid !== false, pad: o.pad == null ? .04 : o.pad, col: colors(), u: 0 };
    s.t0 = (T + s.offset) - (o.start || 0);
    canvas.__svc = s; list.push(s); io.observe(canvas); ro.observe(canvas);
    return {
      set(p) { s.mode = 'scrub'; s.p = clamp(p); kick(); },
      loop() { s.mode = 'loop'; s.t0 = T + s.offset; kick(); },
      restart() { s.t0 = T + s.offset; kick(); },
      get u() { return s.u; }, el: canvas, name
    };
  }

  /* ---------- 見出し：細く縮んだ字 → 広く太く伸びる（c-all-type と同じ動き） ---------- */
  const FIN = '"wdth" 151,"wght" 900,"opsz" 144';
  let meas = null;
  function natural(el, text) {
    if (!meas) { meas = document.createElement('span'); meas.setAttribute('aria-hidden', 'true'); meas.style.cssText = 'position:absolute;left:-9999px;top:0;white-space:nowrap;visibility:hidden;font-size:100px;line-height:1;'; document.body.appendChild(meas); }
    const cs = getComputedStyle(el); meas.style.fontFamily = cs.fontFamily; meas.style.letterSpacing = el.dataset.ls || '-0.02em';
    meas.style.fontVariationSettings = el.dataset.fin || FIN; meas.textContent = text; return meas.getBoundingClientRect().width;
  }
  function stretch(els, o = {}) {
    els = [...els]; if (!els.length) return;
    const fit = () => els.forEach(el => {
      if (el.dataset.fit === 'no') return;
      const box = el.parentElement.clientWidth * (parseFloat(el.dataset.fitw) || 1), n = natural(el, el.dataset.fitText || el.textContent.trim());
      let fs = 100 * box / n * .985; const mx = parseFloat(el.dataset.max) || 1e9; el.style.fontSize = Math.min(fs, mx).toFixed(2) + 'px';
    });
    const from = o.from || [25, 100], to = o.to || [151, 900];
    let lt = 0;
    const upd = () => {
      const vh = innerHeight, now = performance.now(), dt = lt ? Math.min(.05, (now - lt) / 1000) : 0; lt = now;
      els.forEach(el => {
        const r = el.getBoundingClientRect(); let p = REDUCE ? 1 : clamp((vh * (o.start || .96) - r.top) / (vh * (o.len || .5)));
        if (el.__force != null) p = Math.max(p, el.__force);
        el._g = Math.max(el._g || 0, p); /* 目標（一度伸びたら戻さない） */
        el._p = el._p == null ? 0 : el._p; el._p = REDUCE ? el._g : Math.min(el._g, el._p + dt / 1.5); if (el._p < el._g) more = true;
        const e = eio(el._p);
        el.style.fontVariationSettings = `"wdth" ${mix(from[0], to[0], e).toFixed(1)},"wght" ${mix(from[1], to[1], e).toFixed(0)},"opsz" 144`;
      });
      if (more) req();
    };
    let q = 0, more = false; const req = () => { if (!q) q = requestAnimationFrame(() => { q = 0; more = false; upd(); }); };
    addEventListener('scroll', req, { passive: true });
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { fit(); req(); }, 120); });
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { fit(); req(); });
    fit(); req();
    return { update: req, fit };
  }

  window.SvcDraw = { mount, stretch, s2a: drawS2A, hh: drawHH, hhr: drawHHR, vp: drawVP, names: ['s2a', 'hh', 'hhr', 'vp'] };
})();
