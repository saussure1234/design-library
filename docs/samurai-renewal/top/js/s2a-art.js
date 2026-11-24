/* Strategy2Action 候補ページ（p/s2a-*.html）の動く絵。トップの FEATURES と同じ文法：
   画面に入ると細い線で描かれていき（D：0→1）、描き終わると小さく動き続ける。色は線＝canvas の color、要所の1点＝--acc。
   絵の種類は2系統：abs（抽象：流れ・点・線の図形）／con（具体：グラフ・書類・建物・チェック表などの絵）。
   既定は body[data-art]、URL の ?art=abs|con で切り替えて見られる。動きを減らす設定では、止まった完成形を出す。 */
(() => {
'use strict';
const TAU = Math.PI * 2, DPR = Math.min(2, window.devicePixelRatio || 1);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v, mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) };
const fr = x => x - Math.floor(x);
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const q = new URLSearchParams(location.search).get('art');
const MODE = q === 'abs' || q === 'con' ? q : (document.body.dataset.art || 'abs');
const DUR = 2.8;
const rgbOf = s => { const m = String(s).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : [21, 21, 19] };
const hexOf = s => { s = String(s).trim(); if (!s) return null; if (s[0] === '#') { const h = s.slice(1); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)) } return rgbOf(s) };

/* ---- 線の道具 ---- */
function poly(ctx, pts, k) {   /* 折れ線を長さの割合 k まで。ペン先を返す */
  if (k <= 0 || pts.length < 2) return null;
  let L = 0; const sg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); sg.push(d); L += d }
  let r = L * Math.min(1, k); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { if (r >= sg[i - 1]) { ctx.lineTo(pts[i][0], pts[i][1]); r -= sg[i - 1]; continue }
    const f = r / (sg[i - 1] || 1), x = mix(pts[i - 1][0], pts[i][0], f), y = mix(pts[i - 1][1], pts[i][1], f); ctx.lineTo(x, y); return [x, y] }
  return pts[pts.length - 1];
}
function along(pts, s) {      /* 折れ線上の割合 s の位置 */
  let L = 0; const sg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); sg.push(d); L += d }
  let r = L * clamp(s); for (let i = 1; i < pts.length; i++) { if (r > sg[i - 1]) { r -= sg[i - 1]; continue } const f = r / (sg[i - 1] || 1); return [mix(pts[i - 1][0], pts[i][0], f), mix(pts[i - 1][1], pts[i][1], f)] }
  return pts[pts.length - 1];
}
const rect = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
const bez = (a, b, c, d, n = 28) => { const o = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; o.push([u*u*u*a[0] + 3*u*u*t*b[0] + 3*u*t*t*c[0] + t*t*t*d[0], u*u*u*a[1] + 3*u*u*t*b[1] + 3*u*t*t*c[1] + t*t*t*d[1]]) } return o };
const K = (D, a, b) => clamp((D - a) / (b - a));
function S(g, al, lw, fn, dash) { const c = g.ctx; c.beginPath(); fn(c); c.lineWidth = lw || 1; c.strokeStyle = g.ink(al); if (dash) c.setLineDash(dash); c.stroke(); if (dash) c.setLineDash([]) }
function SA(g, al, lw, fn) { const c = g.ctx; c.beginPath(); fn(c); c.lineWidth = lw || 1; c.strokeStyle = g.acc(al); c.stroke() }
const sq = (g, x, y, s, col) => { g.ctx.fillStyle = col; g.ctx.fillRect(x - s / 2, y - s / 2, s, s) };
const box = (g, x, y, s, al, fill) => { const c = g.ctx; if (fill) { c.fillStyle = fill; c.fillRect(x - s / 2, y - s / 2, s, s) } c.lineWidth = 1; c.strokeStyle = g.ink(al); c.strokeRect(x - s / 2 + .5, y - s / 2 + .5, s - 1, s - 1) };
function ring(g, x, y, t, r0, r1, per) { const f = fr(t / per); const c = g.ctx; c.beginPath(); c.arc(x, y, mix(r0, r1, f), 0, TAU); c.lineWidth = 1; c.strokeStyle = g.acc(.55 * (1 - f)); c.stroke() }

/* ================= 抽象（abs） ================= */
const ABS = {
  /* PROBLEM 01：何本もの流れが1か所で細くなり、粒がそこで詰まる（どこが詰まりかはまだ点でしか見えない） */
  p1(g) { const { w, h, t, D, L } = g, N = 7, nx = .6, cy = h * .5, sp = h * .085, x0 = w * .05, x1 = w * .95;
    const Y = (i, u) => { const f = u < .28 ? 1 : u < nx ? mix(1, .1, ss(.28, nx, u)) : mix(.1, .5, ss(nx, 1, u)); return cy + (i - (N - 1) / 2) * sp * f };
    const X = u => mix(x0, x1, u);
    for (let i = 0; i < N; i++) { const pts = []; for (let j = 0; j <= 48; j++) pts.push([X(j / 48), Y(i, j / 48)]); S(g, .34, 1, c => poly(c, pts, clamp(D * 1.35 - i * .05))) }
    if (L > 0) { g.ctx.fillStyle = g.ink(.78 * L);
      for (let i = 0; i < N; i++) for (let j = 0; j < 6; j++) { const s = fr(t * .06 + j / 6 + i * .137), u = s - .8 * Math.sin(TAU * (s - nx)) / TAU; if (u < 0 || u > 1) continue; g.ctx.fillRect(X(u) - 1.3, Y(i, u) - 1.3, 2.6, 2.6) }
      ring(g, X(nx), cy, t, 5, 26, 2.2) }
    if (D > .6) sq(g, X(nx), cy, 8, g.acc(ss(.6, .9, D))) },
  /* PROBLEM 02：4本の棒の長さが入れ替わり続け、先頭（朱）がどれか定まらない */
  p2(g) { const { w, h, t, D, L } = g, x0 = w * .14, tx = x0 + w * .64;
    S(g, .5, 1, c => poly(c, [[x0, h * .1], [x0, h * .9]], K(D, 0, .3)));
    S(g, .28, 1, c => poly(c, [[tx, h * .08], [tx, h * .92]], K(D, .2, .55)), [3, 4]);
    const ln = []; for (let i = 0; i < 4; i++) ln.push(w * (.42 + .2 * Math.sin(t * (.42 + i * .09) * L + i * 1.9)) * ss(.25 + i * .08, .8 + i * .05, D));
    const top = ln.indexOf(Math.max(...ln));
    ln.forEach((l, i) => { const y = h * (.2 + .2 * i), bh = Math.max(6, h * .07); g.ctx.fillStyle = g.ink(.08); g.ctx.fillRect(x0, y - bh / 2, l, bh);
      S(g, .55, 1, c => c.rect(x0 + .5, y - bh / 2 + .5, Math.max(0, l - 1), bh - 1)); if (l > 4) sq(g, x0 + l, y, 7, i === top && L > 0 ? g.acc(1) : g.ink(.8)) }) },
  /* PROBLEM 03：揺れる信号が何層も重なり、どれが本当の動きか読み取れない */
  p3(g) { const { w, h, t, D, L } = g, x0 = w * .06, x1 = w * .94;
    S(g, .3, 1, c => poly(c, [[x0, h * .82], [x1, h * .82]], K(D, 0, .3)));
    for (let k = 0; k < 5; k++) { const pts = []; for (let j = 0; j <= 80; j++) { const u = j / 80, x = mix(x0, x1, u), ph = t * .5 * L + k * 1.3;
        pts.push([x, h * (.48 + .06 * (k - 2)) + h * .13 * (Math.sin(u * 9 + ph) * .5 + Math.sin(u * 23 - ph * 1.7 + k) * .3 + Math.sin(u * 4.3 + k * 2) * .4)]) }
      S(g, k === 2 ? .62 : .18, 1, c => poly(c, pts, K(D, .1 + k * .07, .75 + k * .05))) }
    if (L > 0) { const s = fr(t * .09), x = mix(x0, x1, s); S(g, .22 * L, 1, c => { c.moveTo(x, h * .12); c.lineTo(x, h * .82) }, [2, 3]) } },
  /* REASON 01：左右2列の点（事業会社／ベンダー、マーケ／営業）を1本の線が縫い、朱の点がその線を往復する */
  r1(g) { const { w, h, t, D, L } = g, xl = w * .28, xr = w * .72, ys = [.16, .38, .6, .82].map(v => v * h);
    S(g, .18, 1, c => { poly(c, [[xl, ys[0]], [xl, ys[3]]], K(D, 0, .4)); poly(c, [[xr, ys[0]], [xr, ys[3]]], K(D, 0, .4)) }, [2, 4]);
    let path = []; for (let i = 0; i < 4; i++) { const a = [xl, ys[i]], b = [xr, ys[i]]; const seg = i % 2 ? bez(b, [b[0] - w * .06, b[1] + h * .1], [a[0] + w * .06, a[1] - h * .1], a) : bez(a, [a[0] + w * .1, a[1] - h * .08], [b[0] - w * .1, b[1] + h * .08], b);
      path = path.concat(seg); if (i < 3) { const e = seg[seg.length - 1]; path = path.concat(bez(e, [e[0] + (i % 2 ? -w * .1 : w * .1), e[1]], [e[0] + (i % 2 ? -w * .1 : w * .1), ys[i + 1]], [e[0], ys[i + 1]], 14)) } }
    S(g, .55, 1, c => poly(c, path, K(D, .15, 1)));
    ys.forEach((y, i) => { box(g, xl, y, 9, .7 * K(D, i * .08, .3 + i * .08), g.bg); box(g, xr, y, 9, .7 * K(D, i * .08, .3 + i * .08), g.bg) });
    if (L > 0) { const s = fr(t * .07), u = s < .5 ? s * 2 : 2 - s * 2; for (let i = 0; i < 8; i++) { const p = along(path, clamp(u - (s < .5 ? 1 : -1) * i * .006)); g.ctx.fillStyle = g.acc(L * (1 - i / 8) * .9); g.ctx.fillRect(p[0] - 2, p[1] - 2, 4, 4) }
      const p = along(path, u); sq(g, p[0], p[1], 8, g.acc(L)) } },
  /* REASON 02：方眼のマスを走査線がなぞると、あとから一気に埋まっていく（AIと自社ツールでの効率化） */
  r2(g) { const { w, h, t, D, L } = g, C = 9, R = 5, cs = Math.min(w * .84 / C, h * .74 / R), ox = (w - cs * C) / 2, oy = (h - cs * R) / 2;
    const per = 3.6, f = fr(t / per), sx = ox + (cs * C + cs * 2) * f - cs;
    for (let j = 0; j < R; j++) for (let i = 0; i < C; i++) { const x = ox + i * cs, y = oy + j * cs, k = K(D, (i + j) * .03, (i + j) * .03 + .35); if (k <= 0) continue;
      g.ctx.lineWidth = 1; g.ctx.strokeStyle = g.ink(.28 * k); g.ctx.strokeRect(x + 2.5, y + 2.5, cs - 5, cs - 5);
      if (L > 0) { const a = ss(0, cs * .8, sx - (x + cs / 2 + ((i * 7 + j * 3) % 5) * 2)) * (1 - ss(.86, 1, f)); if (a > 0) { g.ctx.fillStyle = g.ink(.6 * a * L); g.ctx.fillRect(x + 5, y + 5, cs - 10, cs - 10) } } }
    if (L > 0) { S(g, .5 * L, 1, c => { c.moveTo(sx, oy - 8); c.lineTo(sx, oy + cs * R + 8) }); sq(g, sx, oy - 10, 7, g.acc(L)) } },
  /* REASON 03：1つの窓口（朱）から8つの施策へ線が伸び、選ばれた施策だけが入れ替わりで灯る */
  r3(g) { const { w, h, t, D, L } = g, hx = w * .16, hy = h * .5, tx = w * .84;
    const SET = [[0, 5], [0, 2, 5], [1, 3, 5, 6], [0, 5, 7], [2, 4, 6]], ph = t / 2.6, a = Math.floor(ph) % SET.length, b = (a + 1) % SET.length, f = ss(.75, 1, fr(ph));
    for (let i = 0; i < 8; i++) { const y = h * (.08 + .84 * i / 7), lit = L > 0 ? mix(SET[a].includes(i) ? 1 : 0, SET[b].includes(i) ? 1 : 0, f) * L : (i === 0 || i === 5 ? 1 : 0) * ss(.8, 1, D);
      const pts = bez([hx, hy], [w * .45, hy], [w * .5, y], [tx, y], 30);
      S(g, .16 + .44 * lit, 1, c => poly(c, pts, K(D, .1 + i * .04, .6 + i * .04)));
      if (K(D, .5 + i * .04, .7 + i * .04) > 0) box(g, tx, y, 9, .7, lit > .02 ? g.ink(.85 * lit) : g.bg);
      if (lit > .3 && L > 0) { const p = along(pts, fr(t * .35 + i * .21)); g.ctx.fillStyle = g.ink(.8 * lit); g.ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3) } }
    sq(g, hx, hy, 10, g.acc(ss(0, .3, D))); if (L > 0) ring(g, hx, hy, t, 6, 22, 2.6) },
  /* STEP 01：顧客・競合・自社の3つの円が重なり、重なりの真ん中（朱）が改善の方針 */
  s1(g) { const { w, h, t, D, L } = g, cx = w * .5, cy = h * .52, r = Math.min(w, h) * .27;
    for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + k * TAU / 3 + t * .12 * L, d = r * (.6 + .06 * Math.sin(t * .7 + k) * L), x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      S(g, .5, 1, c => { const kk = K(D, k * .12, .6 + k * .12); if (kk > 0) { c.moveTo(x + r * Math.cos(a), y + r * Math.sin(a)); c.arc(x, y, r, a, a + TAU * kk) } });
      if (D > .7) { g.ctx.fillStyle = g.ink(.035); g.ctx.beginPath(); g.ctx.arc(x, y, r, 0, TAU); g.ctx.fill() } }
    if (D > .7) { sq(g, cx, cy, 9, g.acc(ss(.7, .95, D))); if (L > 0) ring(g, cx, cy, t, 6, r * .55, 2.4) } },
  /* STEP 02：高さのばらばらな棒が、並べ替わって順序がそろう（そろった状態でしばらく止まる） */
  s2(g) { const { w, h, t, D, L } = g, H = [.35, .82, .52, .96, .22, .66], N = 6, bw = w * .78 / N, ox = w * .11, by = h * .88;
    const srt = H.map((v, i) => i).sort((a, b) => H[b] - H[a]), pos = []; srt.forEach((i, r) => pos[i] = r);
    const c = fr(t / 7), m = L > 0 ? ease(ss(.08, .3, c)) * (1 - ease(ss(.86, 1, c))) : 1;
    S(g, .5, 1, cc => poly(cc, [[w * .06, by], [w * .94, by]], K(D, 0, .3)));
    H.forEach((v, i) => { const x = ox + mix(i, pos[i], m) * bw + bw * .18, bh = v * h * .7 * ss(.15 + i * .06, .65 + i * .06, D), y = by - bh;
      g.ctx.fillStyle = pos[i] === 0 && m > .5 ? g.acc(.9 * ss(.5, 1, m)) : g.ink(.08); g.ctx.fillRect(x, y, bw * .64, bh);
      S(g, .58, 1, cc => cc.rect(x + .5, y + .5, bw * .64 - 1, Math.max(0, bh - 1))) }) },
  /* STEP 03：1本の流れが分かれ目で2つの道に分かれていく（右＝弊社は朱、左＝貴社） */
  s3(g) { const { w, h, t, D, L } = g, top = [w * .5, h * .06], j = [w * .5, h * .4];
    const Lp = [top, ...bez(j, [w * .5, h * .62], [w * .24, h * .6], [w * .24, h * .9], 20)], Rp = [top, ...bez(j, [w * .5, h * .62], [w * .76, h * .6], [w * .76, h * .9], 20)];
    S(g, .45, 1, c => poly(c, Lp, K(D, 0, .7))); SA(g, .7, 1, c => poly(c, Rp, K(D, .1, .8)));
    [[w * .24, Lp], [w * .76, Rp]].forEach(([x], k) => { if (D > .7) S(g, .55 * ss(.7, .9, D), 1, c => c.rect(x - w * .1, h * .9, w * .2, h * .06)) });
    if (L > 0) for (let i = 0; i < 9; i++) { const s = fr(t * .16 + i / 9), side = (i * 5 + 2) % 3 === 0 ? 0 : 1, p = along(side ? Rp : Lp, s);
      sq(g, p[0], p[1], s < .4 ? 4 : 5, side ? g.acc(.95 * L) : g.ink(.8 * L)) }
    box(g, j[0], j[1], 9, .7 * ss(.3, .6, D), g.bg) },
  /* STEP 04：KPIツリー。上から数字が流れ、末端の1か所（朱）がボトルネック */
  s4(g) { const { w, h, t, D, L } = g, R = [w * .5, h * .12], A = [[w * .29, h * .42], [w * .71, h * .42]], B = [[w * .15, h * .7], [w * .38, h * .7], [w * .62, h * .7], [w * .85, h * .7]];
    const ed = []; A.forEach(a => ed.push([R, [R[0], h * .27], [a[0], h * .27], a])); B.forEach((b, i) => { const a = A[i >> 1]; ed.push([a, [a[0], h * .56], [b[0], h * .56], b]) });
    ed.forEach((e, i) => S(g, .45, 1, c => poly(c, e, K(D, i < 2 ? 0 : .3, i < 2 ? .4 : .72))));
    if (L > 0) ed.forEach((e, i) => { const s = fr(t * .3 + i * .17); if (i >= 2 || s < .9) { const p = along(e, s); g.ctx.fillStyle = g.ink(.7 * L); g.ctx.fillRect(p[0] - 1.5, p[1] - 1.5, 3, 3) } });
    B.forEach((b, i) => { const v = (i === 2 ? .25 : .62 + .1 * i % .3) + .06 * Math.sin(t * 1.1 + i) * L, k = K(D, .6, 1), bh = h * .16 * v * k;
      if (k > 0) { g.ctx.fillStyle = i === 2 ? g.acc(.95) : g.ink(.5); g.ctx.fillRect(b[0] - 3, h * .96 - bh, 6, bh) } });
    S(g, .3, 1, c => poly(c, [[w * .06, h * .96], [w * .94, h * .96]], K(D, .55, .85)));
    [R, ...A, ...B].forEach((p, i) => { const k = K(D, i === 0 ? 0 : i < 3 ? .3 : .6, i === 0 ? .2 : i < 3 ? .5 : .8); if (k > 0) box(g, p[0], p[1], 10, .75 * k, i === 5 ? g.acc(k) : g.bg) });
    if (L > 0) ring(g, B[2][0], B[2][1], t, 6, 24, 2.2) },
  /* LLMO：4つの情報源から点が集まり、1つの答え（朱の線）になって上へ届く */
  llmo(g) { const { w, h, t, D, L } = g, top = [w * .5, h * .1], ai = [w * .5, h * .46], src = [.12, .37, .63, .88].map(x => [w * x, h * .86]);
    const ups = src.map(s => bez(s, [s[0], h * .66], [ai[0], h * .7], ai, 30));
    ups.forEach((u, i) => S(g, .42, 1, c => poly(c, u, K(D, .05 + i * .05, .55 + i * .05))));
    const one = [ai, top]; SA(g, .9, 1.4, c => poly(c, one, K(D, .6, .85)));
    for (let k = 1; k <= 3; k++) S(g, (.2 - k * .04) * ss(.5, .9, D), 1, c => { c.moveTo(ai[0] + 18 * k + 8, ai[1]); c.arc(ai[0], ai[1], 18 * k + 8 + (L > 0 ? 3 * Math.sin(t * 1.2 - k) : 0), 0, TAU) });
    if (L > 0) { ups.forEach((u, i) => { for (let j = 0; j < 3; j++) { const p = along(u, fr(t * .22 + j / 3 + i * .13)); g.ctx.fillStyle = g.ink(.75 * L); g.ctx.fillRect(p[0] - 1.6, p[1] - 1.6, 3.2, 3.2) } });
      const s = fr(t * .4), p = along(one, s); sq(g, p[0], p[1], 6, g.acc(L * (1 - ss(.85, 1, s)))) }
    src.forEach((s, i) => { const k = K(D, i * .05, .25 + i * .05); if (k > 0) box(g, s[0], s[1], 12, .75 * k, g.bg) });
    box(g, ai[0], ai[1], 16, .85 * ss(.4, .6, D), g.ink(.88 * ss(.4, .6, D)));
    if (D > .8) box(g, top[0], top[1], 12, .8, g.acc(ss(.8, 1, D))) },
};

/* ================= 具体（con） ================= */
const CON = {
  /* PROBLEM 01：目標の点線に届かない棒グラフ。虫めがねが探し回り、重なった棒だけが朱になる（そこがボトルネック） */
  p1(g) { const { w, h, t, D, L } = g, x0 = w * .1, x1 = w * .9, y0 = h * .1, y1 = h * .86, H = [.56, .62, .3, .58, .66], bw = (x1 - x0) / 5;
    S(g, .55, 1, c => poly(c, [[x0, y0], [x0, y1], [x1, y1]], K(D, 0, .3)));
    const ty = y1 - (y1 - y0) * .84; S(g, .45, 1, c => poly(c, [[x0, ty], [x1, ty]], K(D, .2, .5)), [4, 4]);
    const lx = L > 0 ? mix(x0 + bw * .6, x1 - bw * .6, .5 + .5 * Math.sin(t * .55)) : x0 + bw * 2.5, ly = y1 - (y1 - y0) * .38, lr = Math.min(h * .17, w * .12);
    H.forEach((v, i) => { const x = x0 + bw * i + bw * .22, bh = (y1 - y0) * v * ss(.25 + i * .07, .7 + i * .05, D), y = y1 - bh, hit = L > 0 && Math.abs(lx - (x + bw * .28)) < lr * .9 && i === 2;
      g.ctx.fillStyle = hit ? g.acc(.95) : g.ink(.1); g.ctx.fillRect(x, y, bw * .56, bh); S(g, .55, 1, c => c.rect(x + .5, y + .5, bw * .56 - 1, Math.max(0, bh - 1))) });
    if (D > .6) { const a = ss(.6, .9, D); S(g, .75 * a, 1.3, c => { c.moveTo(lx + lr, ly); c.arc(lx, ly, lr, 0, TAU); c.moveTo(lx + lr * .72, ly + lr * .72); c.lineTo(lx + lr * 1.5, ly + lr * 1.5) });
      S(g, .75 * a, 3, c => { c.moveTo(lx + lr * 1.1, ly + lr * 1.1); c.lineTo(lx + lr * 1.5, ly + lr * 1.5) }) } },
  /* PROBLEM 02：施策の札が3枚、入れ替わり続ける。1番目の印（朱）はそこに残ったまま */
  p2(g) { const { w, h, t, D, L } = g, cw = w * .58, ch = h * .2, x = w * .26, Y = i => h * (.12 + .29 * i);
    const ph = t / 2.4, n = Math.floor(ph), f = L > 0 ? ease(ss(.55, 1, fr(ph))) : 0, PERM = [[0, 1, 2], [1, 0, 2], [1, 2, 0], [2, 1, 0], [2, 0, 1], [0, 2, 1]];
    const cur = L > 0 ? PERM[n % 6] : PERM[0], nxt = L > 0 ? PERM[(n + 1) % 6] : PERM[0];
    for (let c = 0; c < 3; c++) { const a = cur.indexOf(c), b = nxt.indexOf(c), y = mix(Y(a), Y(b), f), dx = Math.sin(f * Math.PI) * (a === b ? 0 : (b > a ? 1 : -1)) * w * .05, k = K(D, c * .12, .55 + c * .12);
      const cx = x + dx; S(g, .6, 1, cc => poly(cc, rect(cx, y, cw, ch), k));
      if (k > .5) { const a2 = ss(.5, 1, k), s = ch * .42, ix = cx + ch * .5, iy = y + ch / 2;
        S(g, .65 * a2, 1, cc => { if (c === 0) { cc.moveTo(ix + s / 2, iy); cc.arc(ix, iy, s / 2, 0, TAU) } else if (c === 1) { cc.moveTo(ix, iy - s / 2); cc.lineTo(ix + s / 2, iy + s / 2); cc.lineTo(ix - s / 2, iy + s / 2); cc.closePath() } else cc.rect(ix - s / 2, iy - s / 2, s, s) });
        S(g, .35 * a2, 1, cc => { cc.moveTo(cx + ch, y + ch * .4); cc.lineTo(cx + cw * .82, y + ch * .4); cc.moveTo(cx + ch, y + ch * .64); cc.lineTo(cx + cw * .6, y + ch * .64) }) } }
    for (let i = 0; i < 3; i++) { const k = K(D, .5 + i * .1, .8 + i * .1); if (k > 0) { g.ctx.fillStyle = i === 0 ? g.acc(k) : g.ink(.45 * k); const s = i === 0 ? 9 : 6; g.ctx.fillRect(w * .14 - s / 2, Y(i) + ch / 2 - s / 2, s, s) } }
    if (L > 0) S(g, .3 * L, 1, c => { c.moveTo(w * .14, Y(0) + ch); c.lineTo(w * .14, Y(2)) }, [2, 3]) },
  /* PROBLEM 03：レポートが次々に届いて積み上がる。いちばん上の未読の印（朱） */
  p3(g) { const { w, h, t, D, L } = g, sw = w * .44, sh = h * .66, per = 3.2, ph = L > 0 ? t / per : 0, n = Math.floor(ph), f = L > 0 ? ease(ss(0, .45, fr(ph))) : 1;
    const slot = j => [w * .16 + j * w * .085, h * .2 + j * h * .05];
    for (let j = -1; j < 3; j++) { const id = n + j, pos = j + 1 - f;   /* pos：0=いちばん奥 … 2=手前。3 は入ってくる途中 */
      if (pos < -.99) continue; const [sx, sy] = pos >= 2 ? [mix(slot(2)[0], w * 1.05, pos - 2), slot(2)[1]] : slot(Math.max(0, pos)), a = pos < 0 ? 1 + pos : 1, k = j < 2 ? K(D, (j + 1) * .15, .55 + (j + 1) * .15) : 1;
      if (j === 2 && L <= 0) continue;
      g.ctx.fillStyle = g.bg; g.ctx.fillRect(sx, sy, sw, sh);
      S(g, .62 * a, 1, c => poly(c, rect(sx, sy, sw, sh), k));
      if (k > .5) { const a2 = a * ss(.5, 1, k); S(g, .32 * a2, 1, c => { for (let r = 0; r < 3; r++) { c.moveTo(sx + sw * .12, sy + sh * (.16 + r * .1)); c.lineTo(sx + sw * (r === 2 ? .55 : .86), sy + sh * (.16 + r * .1)) } });
        const pts = []; for (let i = 0; i <= 8; i++) pts.push([sx + sw * (.12 + .76 * i / 8), sy + sh * (.78 - .2 * Math.abs(Math.sin(i * 1.7 + id * 2.3)))]); S(g, .55 * a2, 1, c => poly(c, pts, 1));
        if (j === 1 + (f > .5 ? 1 : 0) || (L <= 0 && j === 1)) sq(g, sx + sw - 10, sy + 10, 7, g.acc(a2)) } } },
  /* REASON 01：事業会社のビル（左）と、ベンダーの工房（右）。2つを結ぶ道を朱の点が行き来する */
  r1(g) { const { w, h, t, D, L } = g, gy = h * .9, bx = w * .1, bw2 = w * .26, by = h * .14, fx = w * .62, fw = w * .3, fy = h * .46;
    S(g, .5, 1, c => poly(c, [[w * .03, gy], [w * .97, gy]], K(D, 0, .3)));
    S(g, .6, 1, c => poly(c, [[bx, gy], [bx, by], [bx + bw2, by], [bx + bw2, gy]], K(D, .1, .55)));
    const roof = [[fx, gy], [fx, fy]]; for (let i = 0; i < 3; i++) { roof.push([fx + fw * (i + 1) / 3, fy - h * .1]); roof.push([fx + fw * (i + 1) / 3, fy]) } roof.push([fx + fw, gy]);
    S(g, .6, 1, c => poly(c, roof, K(D, .2, .65)));
    for (let j = 0; j < 6; j++) for (let i = 0; i < 3; i++) { const k = K(D, .45 + (i + j) * .03, .6 + (i + j) * .03); if (k <= 0) continue; const x = bx + bw2 * (.18 + i * .25), y = by + h * (.06 + j * .1), on = L > 0 && fr(t * .23 + (i * 3 + j * 7) * .137) < .35;
      g.ctx.fillStyle = on ? g.ink(.55 * L) : g.bg; g.ctx.fillRect(x, y, bw2 * .14, h * .05); g.ctx.lineWidth = 1; g.ctx.strokeStyle = g.ink(.45 * k); g.ctx.strokeRect(x + .5, y + .5, bw2 * .14 - 1, h * .05 - 1) }
    S(g, .5, 1, c => poly(c, rect(fx + fw * .38, gy - h * .2, fw * .24, h * .2), K(D, .55, .75)));
    const arc = bez([bx + bw2, h * .36], [w * .5, h * .12], [w * .55, h * .3], [fx + fw * .15, fy + h * .02], 30), road = [[bx + bw2, gy - 4], [fx, gy - 4]];
    S(g, .4, 1, c => poly(c, arc, K(D, .6, .95)), [3, 4]);
    if (L > 0) { const s = fr(t * .12), u = s < .5 ? ease(s * 2) : ease(2 - s * 2), p = along(arc, u); sq(g, p[0], p[1], 8, g.acc(L));
      const s2 = fr(t * .12 + .5), u2 = s2 < .5 ? ease(s2 * 2) : ease(2 - s2 * 2), p2 = along(road, u2); sq(g, p2[0], p2[1] - 2, 6, g.ink(.8 * L)) } },
  /* REASON 02：歯車が回り、チップ（AI）へ回路を信号が走る */
  r2(g) { const { w, h, t, D, L } = g, cx = w * .56, cy = h * .5, s = Math.min(h * .36, w * .26);
    S(g, .7, 1.2, c => poly(c, rect(cx - s / 2, cy - s / 2, s, s), K(D, 0, .35)));
    S(g, .45, 1, c => poly(c, rect(cx - s * .28, cy - s * .28, s * .56, s * .56), K(D, .2, .45)));
    const tr = []; for (let i = 0; i < 4; i++) { const o = s * (-.3 + i * .2);
      tr.push([[cx + s / 2, cy + o], [cx + s / 2 + w * .08, cy + o], [cx + s / 2 + w * .1, cy + o * 1.8], [w * .97, cy + o * 1.8]]);
      tr.push([[cx + o, cy - s / 2], [cx + o, cy - s / 2 - h * .1], [cx + o * 1.6, h * .03]]);
      tr.push([[cx + o, cy + s / 2], [cx + o, cy + s / 2 + h * .1], [cx + o * 1.6, h * .97]]) }
    tr.forEach((p, i) => S(g, .38, 1, c => poly(c, p, K(D, .3 + i * .02, .7 + i * .02))));
    if (L > 0) tr.forEach((p, i) => { const u = 1 - fr(t * .3 + i * .29), q = along(p, u); g.ctx.fillStyle = i % 5 === 1 ? g.acc(L) : g.ink(.8 * L); g.ctx.fillRect(q[0] - 2, q[1] - 2, 4, 4) });
    const gx = w * .2, gy = h * .5, R = Math.min(h * .25, w * .14), a0 = t * .5 * L, gp = [];
    for (let i = 0; i <= 120; i++) { const a = a0 + i / 120 * TAU, tooth = fr(i / 120 * 10) < .5 ? 1 : .8; gp.push([gx + Math.cos(a) * R * tooth, gy + Math.sin(a) * R * tooth]) }
    S(g, .6, 1, c => poly(c, gp, K(D, .1, .7))); S(g, .5, 1, c => { const k = K(D, .5, .8); if (k > 0) { c.moveTo(gx + R * .35, gy); c.arc(gx, gy, R * .35, 0, TAU * k) } });
    S(g, .35, 1, c => poly(c, [[gx + R, gy], [cx - s / 2, gy]], K(D, .6, .8)), [3, 3]);
    if (D > .8) sq(g, cx, cy, 8, g.acc(ss(.8, 1, D))) },
  /* REASON 03：施策のチェック表。広告運用・LLMO にレ点（朱）、ほかの項目にも順にレ点が入っては外れる */
  r3(g) { const { w, h, t, D, L } = g, rows = 4, cols = 2, cw = w * .42, rh = h * .2, ox = w * .07, oy = h * .12, bs = Math.min(rh * .5, 14);
    const on = L > 0 ? [0, 5, 1 + (Math.floor(t / 1.6) % 6 < 3 ? Math.floor(t / 1.6) % 6 : -99)] : [0, 5];
    for (let i = 0; i < 8; i++) { const c = i < 4 ? 0 : 1, r = i % 4, x = ox + c * (cw + w * .04), y = oy + r * rh, k = K(D, i * .06, .4 + i * .06); if (k <= 0) continue;
      S(g, .3, 1, cc => poly(cc, rect(x, y, cw, rh * .78), k));
      const bx = x + rh * .39, by = y + rh * .39, ck = on.includes(i);
      g.ctx.fillStyle = ck ? g.acc(1) : g.bg; g.ctx.fillRect(bx - bs / 2, by - bs / 2, bs, bs); g.ctx.lineWidth = 1; g.ctx.strokeStyle = ck ? g.acc(1) : g.ink(.6); g.ctx.strokeRect(bx - bs / 2 + .5, by - bs / 2 + .5, bs - 1, bs - 1);
      if (ck) { g.ctx.beginPath(); g.ctx.moveTo(bx - bs * .25, by); g.ctx.lineTo(bx - bs * .05, by + bs * .2); g.ctx.lineTo(bx + bs * .28, by - bs * .22); g.ctx.strokeStyle = g.bgc(1); g.ctx.lineWidth = 1.6; g.ctx.stroke() }
      S(g, .4 * ss(.5, 1, k), 1, cc => { cc.moveTo(bx + bs, by); cc.lineTo(x + cw * (.55 + .3 * ((i * 37) % 10) / 10), by) }) } },
  /* STEP 01：顧客・競合・自社（袋・旗・ビル）を虫めがねが順に見て、真ん中に方針（朱）を置く */
  s1(g) { const { w, h, t, D, L } = g, r = Math.min(h * .19, w * .13), P = [[w * .5, h * .2], [w * .2, h * .74], [w * .8, h * .74]], M = [w * .5, h * .55];
    P.forEach((p, i) => { const k = K(D, i * .12, .5 + i * .12); S(g, .55, 1, c => { if (k > 0) { c.moveTo(p[0] + r, p[1]); c.arc(p[0], p[1], r, 0, TAU * k) } });
      if (k < .6) return; const a = ss(.6, 1, k), s = r * .5;
      S(g, .65 * a, 1, c => { if (i === 0) { c.rect(p[0] - s * .6, p[1] - s * .3, s * 1.2, s * .9); c.moveTo(p[0] - s * .3, p[1] - s * .3); c.arc(p[0], p[1] - s * .3, s * .3, Math.PI, 0) }
        else if (i === 1) { c.moveTo(p[0] - s * .5, p[1] + s * .7); c.lineTo(p[0] - s * .5, p[1] - s * .7); c.lineTo(p[0] + s * .6, p[1] - s * .4); c.lineTo(p[0] - s * .5, p[1] - s * .1) }
        else { c.rect(p[0] - s * .45, p[1] - s * .7, s * .9, s * 1.4); for (let j = 0; j < 3; j++) { c.moveTo(p[0] - s * .2, p[1] - s * .4 + j * s * .35); c.lineTo(p[0] + s * .2, p[1] - s * .4 + j * s * .35) } } }) });
    S(g, .22, 1, c => { P.forEach(p => { poly(c, [p, M], K(D, .5, .8)) }) }, [2, 4]);
    const seq = [...P, M], ph = L > 0 ? t / 1.8 : 3, n = Math.floor(ph) % 4, f = ease(ss(.5, 1, fr(ph))), a = seq[n], b = seq[(n + 1) % 4];
    const lx = L > 0 ? mix(a[0], b[0], f) : M[0], ly = L > 0 ? mix(a[1], b[1], f) : M[1], lr = r * .62;
    if (D > .7) { sq(g, M[0], M[1], 9, g.acc(ss(.7, .9, D))); const al = ss(.7, .9, D); S(g, .8 * al, 1.3, c => { c.moveTo(lx + lr, ly); c.arc(lx, ly, lr, 0, TAU) }); S(g, .8 * al, 3, c => { c.moveTo(lx + lr * .72, ly + lr * .72); c.lineTo(lx + lr * 1.4, ly + lr * 1.4) }) } },
  /* STEP 02：やることの一覧。行が重要な順に並べ替わり、1番上に朱の印 */
  s2(g) { const { w, h, t, D, L } = g, V = [.45, .9, .3, .7, .58], N = 5, rh = h * .84 / N, oy = h * .08, x0 = w * .1;
    const srt = V.map((v, i) => i).sort((a, b) => V[b] - V[a]), pos = []; srt.forEach((i, r) => pos[i] = r);
    const c = fr(t / 7), m = L > 0 ? ease(ss(.08, .3, c)) * (1 - ease(ss(.86, 1, c))) : 1;
    V.forEach((v, i) => { const y = oy + mix(i, pos[i], m) * rh, k = K(D, i * .1, .5 + i * .1); if (k <= 0) return; const bs = rh * .36, cy = y + rh / 2, top = pos[i] === 0 && m > .5;
      box(g, x0 + bs / 2, cy, bs, .6 * k, top ? g.acc(ss(.5, 1, m)) : g.bg);
      S(g, .5, 1, cc => poly(cc, [[x0 + bs * 1.8, cy], [x0 + bs * 1.8 + (w * .76 - bs * 1.8) * v, cy]], k));
      g.ctx.fillStyle = g.ink(.12); g.ctx.fillRect(x0 + bs * 1.8, cy + 3, (w * .76 - bs * 1.8) * v * k, 4) });
    S(g, .25, 1, cc => poly(cc, [[x0 - 8, oy], [x0 - 8, oy + rh * N]], K(D, 0, .4))) },
  /* STEP 03：タスクの札が上から届き、左右2つの列（右＝弊社は朱の見出し）へ振り分けられて積まれる */
  s3(g) { const { w, h, t, D, L } = g, x0 = w * .08, x1 = w * .92, y0 = h * .26, y1 = h * .95, mid = (x0 + x1) / 2, cw = (x1 - x0) / 2 - w * .06, chh = h * .1;
    S(g, .55, 1, c => poly(c, rect(x0, y0, x1 - x0, y1 - y0), K(D, 0, .45))); S(g, .4, 1, c => poly(c, [[mid, y0], [mid, y1]], K(D, .3, .55)));
    if (D > .4) { const a = ss(.4, .7, D); g.ctx.fillStyle = g.ink(.5 * a); g.ctx.fillRect(x0, y0, mid - x0, 4); g.ctx.fillStyle = g.acc(a); g.ctx.fillRect(mid, y0, x1 - mid, 4) }
    const per = 1.5, cyc = 8, ph = L > 0 ? t / per : 4.99, n = Math.floor(ph), f = ease(ss(.1, .8, fr(ph))), cnt = [0, 0];
    const SIDE = [1, 0, 1, 1, 0, 1, 0, 1];
    for (let i = 0; i <= (n % cyc); i++) { const side = SIDE[i % 8], slotN = cnt[side]++, tx = (side ? mid : x0) + w * .03, ty = y0 + 12 + slotN * (chh + 6);
      const isNew = i === n % cyc, x = isNew ? mix(mid - cw / 2, tx, f) : tx, y = isNew ? mix(h * .03, ty, f) : ty, fade = L > 0 ? 1 - ss(.85, 1, fr(t / (per * cyc))) : 1;
      g.ctx.fillStyle = g.bg; g.ctx.fillRect(x, y, cw, chh); S(g, .6 * fade * ss(.6, .9, D), 1, c => { c.rect(x + .5, y + .5, cw - 1, chh - 1); c.moveTo(x + 8, y + chh / 2); c.lineTo(x + cw * .7, y + chh / 2) }) } },
  /* STEP 04：モニターの中のダッシュボード。KPIの札・棒グラフ（朱＝届いていない数字）・流れ続ける折れ線 */
  s4(g) { const { w, h, t, D, L } = g, mx = w * .08, my = h * .06, mw = w * .84, mh = h * .7;
    S(g, .7, 1.2, c => poly(c, rect(mx, my, mw, mh), K(D, 0, .35))); S(g, .5, 1, c => poly(c, [[w * .5, my + mh], [w * .5, h * .88], [w * .36, h * .88], [w * .64, h * .88]], K(D, .2, .4)));
    for (let i = 0; i < 4; i++) { const x = mx + mw * (.05 + i * .235), k = K(D, .3 + i * .05, .5 + i * .05); S(g, .4, 1, c => poly(c, rect(x, my + mh * .08, mw * .2, mh * .2), k));
      if (k > .5) { g.ctx.fillStyle = i === 2 ? g.acc(1) : g.ink(.6); g.ctx.fillRect(x + 6, my + mh * .16, mw * .2 * (i === 2 ? .3 : .55) , 4) } }
    const bx = mx + mw * .06, bb = my + mh * .9, bw = mw * .4 / 5;
    for (let i = 0; i < 5; i++) { const v = (i === 3 ? .3 : .55 + .12 * ((i * 3) % 4)) * (1 + .04 * Math.sin(t * 1.3 + i) * L), bh = mh * .45 * v * K(D, .45 + i * .05, .8 + i * .03);
      g.ctx.fillStyle = i === 3 ? g.acc(.95) : g.ink(.5); g.ctx.fillRect(bx + i * bw, bb - bh, bw * .6, bh) }
    const lx0 = mx + mw * .54, lx1 = mx + mw * .95, pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push([mix(lx0, lx1, u), bb - mh * (.2 + .12 * Math.sin(u * 7 + t * .9 * L) + .06 * Math.sin(u * 17 - t * 1.4 * L))]) }
    S(g, .65, 1, c => poly(c, pts, K(D, .55, .95))); S(g, .3, 1, c => poly(c, [[lx0, bb], [lx1, bb]], K(D, .5, .7))) },
  /* LLMO：吹き出し（AIの答え）に文字が打たれていく。下の4つの情報源（サイト・記事・比較表・口コミ）から線が集まる */
  llmo(g) { const { w, h, t, D, L } = g, bw = w * .46, bh = h * .3, bx = w * .27, by = h * .05, ay = by + bh + h * .05, sy = h * .76, ss2 = Math.min(w * .11, h * .2);
    S(g, .75, 1.2, c => poly(c, [[bx, by], [bx + bw, by], [bx + bw, by + bh], [w * .54, by + bh], [w * .5, by + bh + h * .05], [w * .47, by + bh], [bx, by + bh], [bx, by]], K(D, 0, .4)));
    const ty = L > 0 ? fr(t / 4.5) : 1;
    for (let r = 0; r < 3; r++) { const lenF = r === 2 ? .55 : .86, k = L > 0 ? clamp(ty * 3.6 - r) : K(D, .4 + r * .1, .6 + r * .1); if (k <= 0) continue;
      const x0 = bx + bw * .08, y = by + bh * (.28 + r * .22), x = x0 + bw * (lenF - .08) * k; S(g, .5, 1, c => { c.moveTo(x0, y); c.lineTo(x, y) });
      if (k < 1 && L > 0) sq(g, x + 4, y, 6, g.acc(L)) }
    if (L <= 0 || ty > .8) sq(g, bx + bw * .5 + 4, by + bh * .72, 6, g.acc(1));
    const SX = [.13, .38, .62, .87].map(v => w * v);
    SX.forEach((x, i) => { const k = K(D, .2 + i * .07, .6 + i * .07), s = ss2, y = sy;
      S(g, .6, 1, c => { poly(c, rect(x - s / 2, y - s / 2, s, s), k) });
      if (k > .6) { const a = ss(.6, 1, k); S(g, .45 * a, 1, c => {
        if (i === 0) { c.moveTo(x - s / 2, y - s * .26); c.lineTo(x + s / 2, y - s * .26); for (let j = 0; j < 3; j++) { c.moveTo(x - s * .38 + j * 6, y - s * .38); c.lineTo(x - s * .38 + j * 6 + 2, y - s * .38) } c.rect(x - s * .3, y - s * .1, s * .6, s * .38) }
        else if (i === 1) { for (let j = 0; j < 4; j++) { c.moveTo(x - s * .3, y - s * .28 + j * s * .18); c.lineTo(x + (j === 3 ? 0 : s * .3), y - s * .28 + j * s * .18) } }
        else if (i === 2) { c.moveTo(x, y - s / 2); c.lineTo(x, y + s / 2); for (let j = 0; j < 3; j++) { c.moveTo(x - s / 2, y - s * .2 + j * s * .22); c.lineTo(x + s / 2, y - s * .2 + j * s * .22) } }
        else { c.moveTo(x - s * .3, y - s * .25); c.lineTo(x + s * .3, y - s * .25); c.lineTo(x + s * .3, y + s * .12); c.lineTo(x - s * .05, y + s * .12); c.lineTo(x - s * .2, y + s * .28); c.lineTo(x - s * .2, y + s * .12); c.lineTo(x - s * .3, y + s * .12); c.closePath() } }) }
      const pts = bez([x, y - s / 2], [x, (y + ay) / 2], [w * .5, (y + ay) / 2 + h * .05], [w * .5, ay + 4], 24);
      S(g, .35, 1, c => poly(c, pts, K(D, .5 + i * .05, .85 + i * .03)));
      if (L > 0) for (let j = 0; j < 2; j++) { const p = along(pts, fr(t * .25 + j / 2 + i * .19)); g.ctx.fillStyle = g.ink(.75 * L); g.ctx.fillRect(p[0] - 1.6, p[1] - 1.6, 3.2, 3.2) } }) },
};

/* ================= 動かす ================= */
const ART = MODE === 'con' ? CON : ABS;
const list = [];
document.querySelectorAll('canvas[data-art]').forEach(c => {
  const fn = ART[c.dataset.art]; if (!fn) return;
  const p = { c, ctx: c.getContext('2d'), fn, w: 0, h: 0, d0: null, vis: false, cols: null };
  list.push(p);
});
function cols(p) {
  const st = getComputedStyle(p.c), ink = rgbOf(st.color), acc = hexOf(st.getPropertyValue('--acc')) || hexOf(getComputedStyle(document.documentElement).getPropertyValue('--sig')) || [239, 69, 25];
  let bgc = hexOf(st.getPropertyValue('--art-bg')); if (!bgc) { let e = p.c; while (e && e !== document.documentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) { bgc = rgbOf(b); break } e = e.parentElement } }
  bgc = bgc || [246, 244, 238];
  const kk = parseFloat(st.getPropertyValue('--art-k')) || 1.3;   /* 線の濃さの倍率（案ごとに CSS で調整） */
  p.cols = { ink: a => `rgba(${ink[0]},${ink[1]},${ink[2]},${Math.min(1, a * kk)})`, acc: a => `rgba(${acc[0]},${acc[1]},${acc[2]},${a})`, bg: `rgb(${bgc[0]},${bgc[1]},${bgc[2]})`, bgc: a => `rgba(${bgc[0]},${bgc[1]},${bgc[2]},${a})` };
}
function size(p) {
  const r = p.c.getBoundingClientRect(); if (!r.width || !r.height) return false;
  p.w = r.width; p.h = r.height; p.c.width = Math.round(r.width * DPR); p.c.height = Math.round(r.height * DPR); cols(p); return true;
}
let T = 0;
function draw(p) {
  if (!p.w && !size(p)) return;
  const D = REDUCE ? 1 : (p.d0 == null ? 0 : clamp((T - p.d0) / DUR)), L = REDUCE ? 0 : ss(.82, 1, D) * (p.d0 == null ? 0 : 1);
  const ctx = p.ctx; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, p.w, p.h); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const tt = REDUCE ? 0 : (p.d0 == null ? 0 : T - p.d0);
  p.fn({ ctx, w: p.w, h: p.h, t: tt, D, L, ink: p.cols.ink, acc: p.cols.acc, bg: p.cols.bg, bgc: p.cols.bgc });
}
const ro = new ResizeObserver(es => es.forEach(e => { const p = list.find(x => x.c === e.target); if (p) { p.w = 0; size(p); draw(p) } }));
const vio = new IntersectionObserver(es => es.forEach(e => { const p = e.target.__ap; if (p) p.vis = e.isIntersecting }), { rootMargin: '80px 0px' });
const sio = new IntersectionObserver(es => es.forEach(e => { const p = e.target.__ap; if (p && e.isIntersecting && p.d0 == null) { p.d0 = T; sio.unobserve(e.target) } }), { threshold: .35 });
list.forEach(p => { p.c.__ap = p; ro.observe(p.c); vio.observe(p.c); if (!REDUCE) sio.observe(p.c) });
if (REDUCE) { list.forEach(p => { size(p); draw(p) }); return }
let prev = performance.now();
function loop(now) { requestAnimationFrame(loop); const dt = Math.max(0, Math.min(.05, (now - prev) / 1000)); prev = now; T += dt; list.forEach(p => { if (p.vis) draw(p) }) }
requestAnimationFrame(loop);
/* 撮影用：全部を描き終わった状態にする（画面外のものも） */
window.__s2aArtDone = () => { list.forEach(p => { if (p.d0 == null) p.d0 = T - DUR - 4; else p.d0 = Math.min(p.d0, T - DUR - 4); p.w = 0; draw(p) }) };
window.__s2aArt = () => ({ mode: MODE, n: list.length, started: list.filter(p => p.d0 != null).length });
})();
