/* Strategy2Action：コードで描いて動かすキャラクター（4つの作風 × 10場面）。外部の画像は使わない。
   使い方：<canvas data-ch="p1"> … 場面は p1〜p3（PROBLEM）・r1〜r3（REASON）・s1〜s4（PROCESS）。
   作風は canvas か祖先の data-chs（line＝一筆書きの線／geo＝幾何の部品／chunky＝ずんぐり／obj＝道具の擬人化）。
   トップの FEATURES と同じ文法：画面に入ると線で描かれていき（D：0→1）、描き終わると場面の動き（4〜8秒のループ）を続ける。
   画面外では止める。動きを減らす設定では、止まった完成形を出す。
   骨組みは1つ（腰→膝→足、肩→肘→手を2関節のIKで解く）。場面は「手をどこへ・顔をどうする」を時間で書くだけで、作風は描き方だけが違う。 */
(() => {
'use strict';
const TAU = Math.PI * 2, PI = Math.PI, DPR = Math.min(2, window.devicePixelRatio || 1);
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v, mix = (a, b, t) => a + (b - a) * t;
const ss = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t) };
const fr = x => x - Math.floor(x);
const W = 240, H = 180, G = 164, DUR = 2.4;
const C = { ink: [21, 21, 19], navy: [7, 11, 22], sky: [200, 239, 255], lav: [224, 219, 251], paper: [246, 244, 238], card: [255, 253, 248],
  pap: [234, 230, 218], sig: [239, 69, 25], skyD: [126, 196, 226], lavD: [168, 156, 236] };
/* 色の整理（案 h）：body[data-pal=blue] なら淡紫を青の濃淡に置きかえる。blue2 は朱も青に */
{ const pal = document.body && document.body.dataset.pal; if (pal === 'blue' || pal === 'blue2') { C.lav = [168, 216, 238]; C.lavD = [74, 150, 190]; if (pal === 'blue2') C.sig = [31, 111, 150] } if (pal === 'blue3') { C.lav = [168, 216, 238]; C.lavD = [74, 150, 190]; window.__S2A_NOTE_W = 1 } }
const P2 = (a, b, u) => [mix(a[0], b[0], u), mix(a[1], b[1], u)];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]], mul = (a, k) => [a[0] * k, a[1] * k];
const rgbOf = s => { const m = String(s).match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null };

/* キーフレーム：[[秒, 値], …]。値は数か配列。区間はなめらかにつなぐ */
function kf(t, K) {
  if (t <= K[0][0]) return K[0][1];
  for (let i = 1; i < K.length; i++) { const [t1, v1] = K[i]; if (t <= t1) { const [t0, v0] = K[i - 1], u = ss(0, 1, (t - t0) / ((t1 - t0) || 1));
    return Array.isArray(v0) ? v0.map((a, j) => mix(a, v1[j], u)) : mix(v0, v1, u) } }
  return K[K.length - 1][1];
}
/* 形はすべて点の列にする（途中まで描けるように） */
const circ = (x, y, r, n = 26, a0 = -PI / 2) => { const o = []; for (let i = 0; i < n; i++) { const a = a0 + TAU * i / n; o.push([x + Math.cos(a) * r, y + Math.sin(a) * r]) } return o };
const ell = (x, y, rx, ry, rot = 0, n = 28) => { const o = [], c = Math.cos(rot), s = Math.sin(rot); for (let i = 0; i < n; i++) { const a = -PI / 2 + TAU * i / n, px = Math.cos(a) * rx, py = Math.sin(a) * ry; o.push([x + px * c - py * s, y + px * s + py * c]) } return o };
function rr(x, y, w, h, r = 0) {
  if (r <= 0) return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  r = Math.min(r, w / 2, h / 2); const o = [], cs = [[x + w - r, y + r, -PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, PI / 2], [x + r, y + r, PI]];
  cs.forEach(([cx, cy, a0]) => { for (let i = 0; i <= 3; i++) { const a = a0 + PI / 2 * i / 3; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) } }); return o;
}
const xf = (pts, cx, cy, a) => { const c = Math.cos(a), s = Math.sin(a); return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]) };
const arcP = (cx, cy, r, a0, a1, n = 14) => { const o = []; for (let i = 0; i <= n; i++) { const a = mix(a0, a1, i / n); o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]) } return o };
function poly(ctx, pts, k) {
  if (k <= 0 || pts.length < 2) return;
  let L = 0; const sg = []; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); sg.push(d); L += d }
  let r = L * Math.min(1, k); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) { if (r >= sg[i - 1]) { ctx.lineTo(pts[i][0], pts[i][1]); r -= sg[i - 1]; continue }
    const f = r / (sg[i - 1] || 1); ctx.lineTo(mix(pts[i - 1][0], pts[i][0], f), mix(pts[i - 1][1], pts[i][1], f)); return }
}
/* 2関節のIK。届かない時は目標の方へまっすぐ伸びる（指差し・背伸びに見える） */
function ik(a, t, l1, l2, pick) {
  const dx = t[0] - a[0], dy = t[1] - a[1], d = Math.hypot(dx, dy) || .001, dd = clamp(d, Math.abs(l1 - l2) + .01, l1 + l2 - .01), ux = dx / d, uy = dy / d;
  const an = Math.acos(clamp((l1 * l1 + dd * dd - l2 * l2) / (2 * l1 * dd), -1, 1));
  const c1 = [a[0] + l1 * (ux * Math.cos(an) - uy * Math.sin(an)), a[1] + l1 * (ux * Math.sin(an) + uy * Math.cos(an))];
  const c2 = [a[0] + l1 * (ux * Math.cos(-an) - uy * Math.sin(-an)), a[1] + l1 * (ux * Math.sin(-an) + uy * Math.cos(-an))];
  return [pick(c1) >= pick(c2) ? c1 : c2, [a[0] + ux * dd, a[1] + uy * dd]];
}

/* ================= 作風 =================
   line   ＝一筆書きの線の人：FEATURES と同じ細い墨の線（太さは画面で一定）。面は紙の色で抜くだけ。朱は1点
   geo    ＝幾何の部品の人：丸い頭＋角の胴。淡い水色・紫の面、手足は紺の太い線。輪郭線なし（描く途中だけ下書き線）
   chunky ＝ずんぐりした人：大きい頭と丸い胴、短く太い手足。太い墨の輪郭＋淡い面、ほっぺ
   obj    ＝道具の擬人化：グラフ・付箋・書類・カバンなどに細い手足と顔 */
const STY = {
  line: { name: 'line', stroke: 'ink', rig: { leg: [19, 18], arm: [18, 17], torso: 29, hr: 9, sw: 5, hw: 3.2 } },
  geo: { name: 'geo', stroke: 'navy', lw: 1.6, rig: { leg: [18, 17], arm: [17, 16], torso: 28, hr: 10.5, sw: 9, hw: 5 } },
  chunky: { name: 'chunky', stroke: 'ink', lw: 2.5, rig: { leg: [9, 8], arm: [13, 12], torso: 27, hr: 15.5, sw: 14, hw: 7.5 } },
  obj: { name: 'obj', stroke: 'ink', lw: 1.45, rig: { leg: [12, 11], arm: [16, 15], torso: 0, hr: 0, sw: 0, hw: 6 } },
};
const CS = { line: 1.16, geo: 1.14, chunky: 1.12, obj: 1.14 };   /* 人の大きさ（場面の枠 240×180 に対して） */
const FILL = {
  line: k => k === 'sig' ? 'sig' : (k === 'ink' || k === 'navy') ? 'ink' : 'bg',
  geo: k => k === 'card' ? 'pap' : k, chunky: k => k, obj: k => k,
};
const SCOL = {
  line: k => k === 'sig' ? 'sig' : 'ink',
  geo: k => k || 'navy', chunky: k => k || 'ink', obj: k => k || 'ink',
};

/* ---- 描く道具（S は1枚の canvas の1フレーム） ---- */
function prim(S, pts, o = {}) {
  const k = S.next(); if (k <= 0 || !pts.length) return;
  const c = S.ctx, st = S.st.name, al = o.a ?? 1; if (al <= .002) return;
  const fk = o.fill ? FILL[st](o.fill) : null;
  let stroke = o.stroke !== false;
  if (st === 'geo' && fk && !o.line) stroke = false;
  const closed = o.closed ?? !!o.fill, path = closed ? pts.concat([pts[0]]) : pts;
  if (fk) {
    const fa = ss(.45, 1, k) * al * (o.fa ?? 1);
    if (fa > 0) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = S.col(fk, fa); c.fill() }
    if (st === 'geo' && !stroke && k < 1 && o.sketch !== false) { c.beginPath(); poly(c, path, k); c.lineWidth = S.hair; c.strokeStyle = S.col('navy', .6 * (1 - ss(.45, 1, k)) * al); c.stroke() }
  }
  if (stroke) {
    c.beginPath(); poly(c, path, k); c.lineWidth = o.w != null ? o.w : (o.lw || 1) * S.lw;
    c.strokeStyle = S.col(SCOL[st](o.col), al * (o.sa ?? 1)); if (o.dash) c.setLineDash(o.dash.map(v => v * (st === 'line' ? S.lw / .9 : 1))); c.stroke(); if (o.dash) c.setLineDash([]);
  }
}
const line = (S, pts, o = {}) => prim(S, pts, Object.assign({ closed: false }, o));
const dot = (S, x, y, r, key = 'ink', a = 1) => prim(S, circ(x, y, r, 12), { fill: key, stroke: false, a, sketch: false });
const sig = (S, x, y, s = 5, a = 1) => prim(S, rr(x - s / 2, y - s / 2, s, s), { fill: 'sig', stroke: false, a, sketch: false });

/* ================= 骨組み ================= */
const OBJ = {
  chart: { w: 34, h: 40 }, note: { w: 32, h: 32 }, doc: { w: 28, h: 38 }, case: { w: 40, h: 28 }, pie: { w: 34, h: 34 }, clip: { w: 30, h: 38 }, bot: { w: 30, h: 34 },
};
const OBJX = {};   /* ほかのページ（動画制作）が足す物の描き方：OBJX[名前]({ S, J, L, R, w, h, lw, s }) */
function rigOf(S, p) {
  const r = Object.assign({}, S.st.rig);
  if (S.st.name === 'obj') { const ob = OBJ[p.obj || 'doc']; r.ow = ob.w; r.oh = ob.h; r.sw = ob.w / 2; r.hw = Math.min(ob.w * .2, 6) }
  return r;
}
function body(S, p) {
  const rg = rigOf(S, p), s = (p.s || 1) * CS[S.st.name], f = p.f || 1, g = p.g ?? G, st = S.st.name;
  const la = f * (p.lean || 0), u = [Math.sin(la), -Math.cos(la)], n = [Math.cos(la), Math.sin(la)];
  const legL = (rg.leg[0] + rg.leg[1]) * s, stp = p.step, amp = stp ? (stp.amp || 0) * s : 0;
  const bob = amp ? Math.abs(Math.sin(stp.ph)) * amp * .12 : 0;
  const hip = [p.x, g - legL * (.965 - (p.crouch || 0) * .3) - (p.lift || 0) + bob];
  const hips = [add(hip, mul(n, -rg.hw * s)), add(hip, mul(n, rg.hw * s))];
  const feet = [0, 1].map(i => { const sd = i ? 1 : -1; if (p.feet && p.feet[i]) return p.feet[i];
    if (amp) { const ph = stp.ph + i * PI; return [p.x + sd * rg.hw * s * .35 + Math.sin(ph) * amp * f, g - Math.max(0, Math.cos(ph)) * amp * .5] }
    return [p.x + sd * rg.hw * s * 1.25, g] });
  const knees = [0, 1].map(i => ik(hips[i], feet[i], rg.leg[0] * s, rg.leg[1] * s, c => (c[0] - hips[i][0]) * f)[0]);
  const A = la + (p.tilt || 0), hu = [Math.sin(A), -Math.cos(A)], nod = p.nod || 0;
  let neck, shB, head, hr;
  if (st === 'obj') { const oh = rg.oh * s; hr = rg.ow * s * .3; neck = add(hip, mul(u, oh)); shB = add(hip, mul(u, oh * .44)); head = add(hip, mul(u, oh * .66 - nod * 2)) }
  else if (st === 'chunky') { hr = rg.hr * s; neck = add(hip, mul(u, rg.torso * s)); shB = add(hip, mul(u, rg.torso * s * .6)); head = add(add(neck, mul(hu, hr * .62)), [0, nod * hr * .2]) }
  else { hr = rg.hr * s; neck = add(hip, mul(u, rg.torso * s)); shB = add(neck, mul(u, -2.5 * s)); head = add(add(neck, mul(hu, hr + 1.8 * s)), [0, nod * hr * .28]) }
  const shoulders = [add(shB, mul(n, -rg.sw * s)), add(shB, mul(n, rg.sw * s))];
  const reach = (rg.arm[0] + rg.arm[1]) * s;
  const J = { p, rg, s, f, u, n, la, A, hip, hips, feet, knees, neck, shB, head, hr, shoulders, reach, hands: [], elbows: [] };
  J.hang = shoulders.map((sh, i) => { const sd = i ? 1 : -1; return [sh[0] + sd * (st === 'chunky' ? 6 : 2.5) * s, sh[1] + reach * .92] });
  for (let i = 0; i < 2; i++) {
    let tg = p.hands && p.hands[i]; if (typeof tg === 'function') tg = tg(J); if (!tg) tg = J.hang[i];
    const sd = i ? 1 : -1, b = p.bend && p.bend[i], sh = shoulders[i];
    const [el, hd] = ik(sh, tg, rg.arm[0] * s, rg.arm[1] * s, c => b ? b * (c[0] - sh[0]) : (c[1] - sh[1]) + sd * (c[0] - sh[0]) * .8);
    J.elbows.push(el); J.hands.push(hd);
  }
  return J;
}

/* ---- 顔（頭の中心 c・半径 hr・角度 A） ---- */
function face(S, J, c, hr, A) {
  const p = J.p, fc = p.face || {}, st = S.st.name, look = p.look ?? J.f * .8;
  const ca = Math.cos(A), sa = Math.sin(A), R = (x, y) => [c[0] + x * ca - y * sa, c[1] + x * sa + y * ca];
  const ink = st === 'geo' ? 'navy' : 'ink', fw = { line: S.lw, geo: 1.4, chunky: 2.1, obj: 1.3 }[st];
  const eo = look * hr * .24, es = hr * (st === 'chunky' ? .34 : .3), ey = -hr * .04 + (p.nod || 0) * hr * .1;
  const eye = fc.eye || ((p.nod || 0) > .5 ? 'c' : 'n');
  for (const sd of [-1, 1]) {
    const x = eo + sd * es, e = R(x, ey);
    if (eye === 'n') { if (st === 'chunky') prim(S, ell(e[0], e[1], hr * .085, hr * .13, A, 12), { fill: ink, stroke: false, sketch: false }); else dot(S, e[0], e[1], Math.max(.9, hr * .1), ink) }
    else if (eye === 'c') line(S, [R(x - hr * .12, ey), R(x, ey + hr * .06), R(x + hr * .12, ey)], { col: ink, w: fw })
    else if (eye === 'h') line(S, [R(x - hr * .12, ey + hr * .05), R(x, ey - hr * .08), R(x + hr * .12, ey + hr * .05)], { col: ink, w: fw })
    else if (eye === 'w') { prim(S, circ(e[0], e[1], hr * .17, 14), { fill: 'card', col: ink, w: fw * .8, line: true }); dot(S, e[0], e[1], hr * .07, ink) }
    if (fc.brow) { const by = ey - hr * .3; line(S, [R(eo + sd * es * .45, by - hr * .08), R(eo + sd * es * 1.45, by + hr * .03)], { col: ink, w: fw * .9 }) }
    if (st === 'chunky' && eye !== 'w') { const k = R(eo + sd * es * 1.3, ey + hr * .34); prim(S, ell(k[0], k[1], hr * .13, hr * .08, A, 12), { fill: 'lav', stroke: false, sketch: false, a: .95 }) }
  }
  const m = fc.mouth || 'n', mx = look * hr * .2, my = hr * .42, mw = hr * .2, pts = [];
  if (m === 's' || m === 'f') { for (let i = 0; i <= 8; i++) { const v = i / 8; pts.push(R(mx + (v - .5) * mw * 2, my + (m === 's' ? 1 : -1) * Math.sin(v * PI) * hr * .1 + (m === 'f' ? hr * .06 : 0))) } line(S, pts, { col: ink, w: fw }) }
  else if (m === 'w') { for (let i = 0; i <= 10; i++) { const v = i / 10; pts.push(R(mx + (v - .5) * mw * 2.2, my + Math.sin(v * TAU * 1.5) * hr * .05)) } line(S, pts, { col: ink, w: fw }) }
  else if (m === 'o') prim(S, xf(circ(...R(mx, my + hr * .02), hr * .09, 12), 0, 0, 0), { fill: ink, stroke: false, sketch: false })
  else if (m === 'd') { for (let i = 0; i <= 8; i++) { const a = PI * i / 8; pts.push(R(mx + Math.cos(a) * mw * 1.1, my - hr * .04 + Math.sin(a) * hr * .17)) } prim(S, pts, { fill: ink, stroke: false, sketch: false }) }
  else line(S, [R(mx - mw * .6, my), R(mx + mw * .6, my)], { col: ink, w: fw });
  if (p.sweat > .05) { const q = R(-J.f * hr * 1.08, -hr * .35 + (1 - p.sweat) * 3); prim(S, [[q[0], q[1] - 4.2], ...arcP(q[0], q[1], 2.1, -PI * .05, PI * 1.05, 8)], { fill: 'sky', col: ink, w: fw * .8, line: true, a: p.sweat }) }
}

/* ---- 道具の擬人化：体そのものが物。L(x,y)＝腰の真ん中を原点、上が +y ---- */
function objBody(S, J) {
  const p = J.p, ob = OBJ[p.obj || 'doc'], s = J.s, w = ob.w * s, h = ob.h * s;
  const L = (x, y) => [J.hip[0] + J.n[0] * x + J.u[0] * y, J.hip[1] + J.n[1] * x + J.u[1] * y];
  const R = (x0, y0, x1, y1) => [L(x0, y0), L(x1, y0), L(x1, y1), L(x0, y1)];
  const lw = .8;
  switch (p.obj) {
    case 'chart':
      prim(S, R(-w / 2, 0, w / 2, h), { fill: 'card' });
      line(S, [L(-w * .36, h * .42), L(-w * .36, h * .06), L(w * .38, h * .06)], { lw });
      [[-.24, .12], [-.04, .2], [.16, .28]].forEach(([x, hh], i) => prim(S, R(w * x, h * .06, w * x + w * .13, h * (.06 + hh * .55)), { fill: i === 1 ? 'lav' : 'sky', lw }));
      break;
    case 'note':
      prim(S, [L(-w / 2, 0), L(w / 2, 0), L(w / 2, h * .78), L(w * .28, h), L(-w / 2, h)], { fill: window.__S2A_NOTE_W ? 'card' : 'sky' });
      prim(S, [L(w / 2, h * .78), L(w * .28, h * .78), L(w * .28, h)], { fill: 'skyD', lw });
      line(S, [L(-w * .3, h * .18), L(w * .3, h * .18)], { lw });
      break;
    case 'doc':
      prim(S, [L(-w / 2, 0), L(w / 2, 0), L(w / 2, h * .8), L(w * .26, h), L(-w / 2, h)], { fill: 'card' });
      line(S, [L(w / 2, h * .8), L(w * .26, h * .8), L(w * .26, h)], { lw });
      [.1, .2, .3].forEach((y, i) => line(S, [L(-w * .32, h * y), L(w * (i === 2 ? .05 : .32), h * y)], { lw: .7 }));
      break;
    case 'case':
      line(S, [L(-w * .18, h), L(-w * .18, h * 1.2), L(w * .18, h * 1.2), L(w * .18, h)], { lw: 1.1 });
      prim(S, R(-w / 2, 0, w / 2, h), { fill: 'lav' });
      line(S, [L(-w / 2, h * .3), L(w / 2, h * .3)], { lw });
      prim(S, R(-w * .07, h * .22, w * .07, h * .38), { fill: 'card', lw });
      break;
    case 'pie': {
      const c = L(0, h / 2), r = w / 2;
      prim(S, circ(c[0], c[1], r, 30), { fill: 'sky' });
      prim(S, [c, ...arcP(c[0], c[1], r, PI * .15 + J.la, PI * .75 + J.la, 10)], { fill: 'lav', lw });
      break }
    case 'clip':
      prim(S, R(-w / 2, 0, w / 2, h), { fill: 'card' });
      prim(S, R(-w * .22, h * .9, w * .22, h * 1.06), { fill: 'navy', lw });
      [.12, .24].forEach(y => { line(S, [L(-w * .32, h * y), L(-w * .22, h * (y - .05)), L(-w * .12, h * (y + .05))], { lw: .9 }); line(S, [L(-w * .02, h * y), L(w * .32, h * y)], { lw: .7 }) });
      break;
    case 'bot':
      line(S, [L(0, h), L(0, h * 1.22)], { lw: 1 });
      prim(S, R(-w / 2, 0, w / 2, h), { fill: 'sky' });
      prim(S, R(-w * .36, h * .42, w * .36, h * .9), { fill: 'navy', lw });
      break;
    default: if (OBJX[p.obj]) OBJX[p.obj]({ S, J, L, R, w, h, lw, s });
  }
  return { L, w, h };
}

/* ---- 人を描く ---- */
const ROLE = { us: ['sky', 'lav'], cl: ['lav', 'sky'], boss: ['navy', 'sky'], bot: ['sky', 'lav'] };   // [胴, 頭]（geo・chunky の面の色）
function drawChar(S, J, opt = {}) {
  const st = S.st.name, p = J.p, s = J.s, role = p.role || 'us', [bc, hc] = ROLE[role];
  if (opt.body !== false) {
    /* 足 */
    for (let i = 0; i < 2; i++) {
      const pts = [J.hips[i], J.knees[i], J.feet[i]], ft = J.feet[i];
      if (st === 'line') line(S, [...pts, [ft[0] + J.f * 3.2 * s, ft[1]]]);
      else if (st === 'geo') { line(S, pts, { w: 4.2 * s, col: 'navy' }); prim(S, rr(ft[0] - 3 * s + J.f * 1.5 * s, ft[1] - 2.2 * s, 6 * s, 2.6 * s), { fill: 'navy' }) }
      else if (st === 'chunky') { line(S, pts, { w: 6.4 * s }); prim(S, ell(ft[0] + J.f * 2 * s, ft[1] - 2.2 * s, 5.2 * s, 2.8 * s, 0, 14), { fill: 'ink', stroke: false, sketch: false }) }
      else { line(S, pts, { w: 1.7 * s }); prim(S, ell(ft[0] + J.f * 1.8 * s, ft[1] - 1.6 * s, 3.4 * s, 1.8 * s, 0, 12), { fill: 'ink', stroke: false, sketch: false }) }
    }
    /* 胴と頭 */
    const tw = (a, b) => [add(J.hip, mul(J.n, -a)), add(J.shB, mul(J.n, -b)), add(J.shB, mul(J.n, b)), add(J.hip, mul(J.n, a))];
    if (st === 'line') {
      const top = add(J.shB, mul(J.u, 1.5)), tr = [add(J.hip, mul(J.n, -J.rg.hw * s * 1.35)), add(top, mul(J.n, -J.rg.sw * s)), add(top, mul(J.n, J.rg.sw * s)), add(J.hip, mul(J.n, J.rg.hw * s * 1.35))];
      prim(S, tr, { fill: 'card' }); line(S, [J.neck, add(J.head, mul([Math.sin(J.A), -Math.cos(J.A)], -J.hr))]);
      if (p.tie) line(S, [add(top, mul(J.u, -1)), add(J.hip, mul(J.u, 10 * s))]);
    } else if (st === 'geo') {
      prim(S, tw(J.rg.hw * s * 1.5, J.rg.sw * s * 1.08), { fill: bc });
      if (p.tie) prim(S, [add(J.shB, mul(J.n, -2 * s)), add(J.shB, mul(J.n, 2 * s)), add(J.hip, mul(J.u, 11 * s))], { fill: 'sky' });
    } else if (st === 'chunky') {
      const c = add(J.hip, mul(J.u, J.rg.torso * s * .46));
      prim(S, ell(c[0], c[1], (J.rg.sw + 3) * s, J.rg.torso * s * .62, J.la, 30), { fill: bc });
      if (p.tie) prim(S, [add(J.neck, mul(J.n, -3 * s)), add(J.neck, mul(J.n, 3 * s)), add(c, mul(J.u, -4 * s))], { fill: 'navy', lw: .6 });
    }
    if (st === 'obj') {
      const ob = objBody(S, J);
      if (p.tie) prim(S, [ob.L(-3 * s, ob.h * .42), ob.L(3 * s, ob.h * .42), ob.L(0, ob.h * .16)], { fill: 'navy', lw: .6 });
      if (role === 'us') prim(S, [ob.L(-2.5 * s, ob.h), ob.L(-1.5 * s, ob.h + 5 * s), ob.L(2.5 * s, ob.h + 5.5 * s), ob.L(2 * s, ob.h)], { fill: 'navy', lw: .6 });
      if (role === 'bot') sig(S, ...ob.L(0, ob.h * 1.22 + 2.4 * s), 4.6 * s);
      face(S, J, J.head, J.hr, J.A);
    } else {
      const hu = [Math.sin(J.A), -Math.cos(J.A)], hn = [Math.cos(J.A), Math.sin(J.A)], top = add(J.head, mul(hu, J.hr));
      if (role === 'bot') {
        line(S, [top, add(top, mul(hu, 6 * s))]); sig(S, ...add(top, mul(hu, 8 * s)), 4.4 * s);
        prim(S, xf(rr(J.head[0] - J.hr, J.head[1] - J.hr * .9, J.hr * 2, J.hr * 1.8, J.hr * .3), J.head[0], J.head[1], J.A), { fill: st === 'geo' ? hc : 'card' });
      } else {
        if (role === 'us') {   /* ちょんまげ（墨・紺の小さな髷） */
          const b = add(top, mul(hu, -1.2 * s)), kn = [add(b, mul(hn, -2.6 * s)), add(add(b, mul(hn, -1.6 * s)), mul(hu, 4.6 * s)), add(add(b, mul(hn, 3.2 * s)), mul(hu, 5.6 * s)), add(b, mul(hn, 2.6 * s))];
          prim(S, kn, { fill: st === 'line' ? 'card' : 'navy', lw: .8 });
        }
        if (st === 'line') prim(S, circ(J.head[0], J.head[1], J.hr, 30), { fill: 'card' });
        else if (st === 'geo') prim(S, circ(J.head[0], J.head[1], J.hr, 30), { fill: hc });
        else prim(S, circ(J.head[0], J.head[1], J.hr, 34), { fill: 'card' });
        if (role === 'boss') line(S, [add(add(J.head, mul(hu, J.hr * .82)), mul(hn, -J.hr * .6)), add(add(J.head, mul(hu, J.hr * 1.02)), mul(hn, J.hr * .1)), add(add(J.head, mul(hu, J.hr * .78)), mul(hn, J.hr * .62))], { w: st === 'chunky' ? 2.4 : st === 'geo' ? 2 : S.lw });
      }
      face(S, J, J.head, J.hr, J.A);
    }
  }
  if (opt.arms !== false) arms(S, J);
}
function arms(S, J) {
  const st = S.st.name, s = J.s;
  for (let i = 0; i < 2; i++) {
    const pts = [J.shoulders[i], J.elbows[i], J.hands[i]], h = J.hands[i];
    if (st === 'line') { line(S, pts); prim(S, circ(h[0], h[1], 1.6 * s, 10), { fill: 'card' }) }
    else if (st === 'geo') { line(S, pts, { w: 3.4 * s, col: 'navy' }); dot(S, h[0], h[1], 2.4 * s, 'navy') }
    else if (st === 'chunky') { line(S, pts, { w: 5.6 * s }); prim(S, circ(h[0], h[1], 3.4 * s, 14), { fill: 'card', lw: .85 }) }
    else { line(S, pts, { w: 1.7 * s }); prim(S, circ(h[0], h[1], 2.3 * s, 12), { fill: 'card', lw: .8 }) }
  }
}

/* ================= 小道具（どの作風でも同じ形。描き方だけ作風で変わる） ================= */
const U = {
  ground(S, x0 = 10, x1 = 230) { line(S, [[x0, G], [x1, G]], { a: .3 }) },
  rect(S, x, y, w, h, o = {}) { const pts = rr(x, y, w, h, o.r || 0); prim(S, o.rot ? xf(pts, x + w / 2, y + h / 2, o.rot) : pts, o) },
  note(S, cx, cy, sz, rot = 0, fill = 'sky', a = 1, mark = 0) {
    const h = sz / 2, pts = xf([[cx - h, cy - h], [cx + h, cy - h], [cx + h, cy + h * .5], [cx + h * .5, cy + h], [cx - h, cy + h]], cx, cy, rot);
    prim(S, pts, { fill, a });
    const ln = []; for (let i = 0; i < 2; i++) ln.push([[cx - h * .6, cy - h * .45 + i * h * .5], [cx + h * (i ? .1 : .55), cy - h * .45 + i * h * .5]]);
    ln.forEach(l => line(S, xf(l, cx, cy, rot), { a: a * .8, lw: .8 }));
    if (mark) sig(S, ...xf([[cx + h * .45, cy - h * .45]], cx, cy, rot)[0], sz * .22, a * mark);
  },
  doc(S, cx, cy, w, h, rot = 0, a = 1) {
    const x = cx - w / 2, y = cy - h / 2, f = Math.min(w, h) * .28;
    prim(S, xf([[x, y], [x + w - f, y], [x + w, y + f], [x + w, y + h], [x, y + h]], cx, cy, rot), { fill: 'card', a });
    for (let i = 0; i < 3; i++) line(S, xf([[x + w * .18, y + h * (.36 + i * .2)], [x + w * (i === 2 ? .55 : .82), y + h * (.36 + i * .2)]], cx, cy, rot), { a: a * .75, lw: .75 });
  },
  chartCard(S, cx, cy, w, h, rot = 0, a = 1) {
    const x = cx - w / 2, y = cy - h / 2;
    prim(S, xf(rr(x, y, w, h), cx, cy, rot), { fill: 'sky', a });
    [.35, .6, .85].forEach((v, i) => prim(S, xf(rr(x + w * (.16 + i * .25), y + h * (.9 - v * .7), w * .16, h * v * .7), cx, cy, rot), { fill: 'card', a, lw: .7 }));
  },
  qmark(S, x, y, sz, a = 1, sigDot = false) {
    if (a <= .01) return; const r = sz * .3, cy = y - sz * .62;
    line(S, [...arcP(x, cy, r, PI * 1.05, PI * 2.45, 14), [x, y - sz * .12]], { a, lw: 1.15 });
    if (sigDot) sig(S, x, y + sz * .14, sz * .2, a); else dot(S, x, y + sz * .14, sz * .09, 'ink', a);
  },
  check(S, x, y, sz, a = 1, col) { line(S, [[x - sz * .45, y], [x - sz * .1, y + sz * .36], [x + sz * .5, y - sz * .42]], { a, lw: 1.3, col }) },
  table(S, x0, x1, y, fill = 'card') { line(S, [[x0 + 4, y], [x0 + 4, G]]); line(S, [[x1 - 4, y], [x1 - 4, G]]); prim(S, rr(x0, y - 3, x1 - x0, 3.4), { fill }) },
  counter(S, x0, x1, y, fill = 'card') { prim(S, rr(x0, y, x1 - x0, G - y), { fill }); prim(S, rr(x0 - 3, y - 3, x1 - x0 + 6, 3.4), { fill: 'skyD' }) },
  cup(S, cx, cy, rot, a = 1, k = 1) {   /* cx,cy＝カップの底の真ん中・k＝大きさ */
    const w = 9 * k, h = 10 * k, pts = xf([[cx - w / 2, cy - h], [cx + w / 2, cy - h], [cx + w * .42, cy], [cx - w * .42, cy]], cx, cy, rot);
    line(S, xf(arcP(cx + w * .5, cy - h * .55, 3.2 * k, -PI / 2, PI / 2, 8), cx, cy, rot), { a });
    prim(S, pts, { fill: 'card', a });
    line(S, xf([[cx - w * .4, cy - h * .78], [cx + w * .4, cy - h * .78]], cx, cy, rot), { a: a * .7, lw: .8 });
  },
  tool(S, k, cx, cy, sz, rot) {
    if (k === 0) prim(S, xf([[cx - sz * .5, cy - sz * .18], [cx + sz * .1, cy - sz * .18], [cx + sz * .5, cy - sz * .42], [cx + sz * .5, cy + sz * .42], [cx + sz * .1, cy + sz * .18], [cx - sz * .5, cy + sz * .18]], cx, cy, rot), { fill: 'lav' });
    else if (k === 1) { line(S, xf([[cx + sz * .12, cy + sz * .12], [cx + sz * .5, cy + sz * .5]], cx, cy, rot), { lw: 1.6 }); prim(S, xf(circ(cx - sz * .1, cy - sz * .1, sz * .3, 18), cx, cy, rot), { fill: 'sky' }) }
    else prim(S, xf([[cx - sz * .5, cy - sz * .08], [cx + sz * .3, cy - sz * .08], [cx + sz * .5, cy], [cx + sz * .3, cy + sz * .08], [cx - sz * .5, cy + sz * .08]], cx, cy, rot), { fill: 'skyD' });
  },
};
const blend = (J, i, L) => { let q = J.hang[i]; for (const [pt, w] of L) if (w > 0) q = P2(q, pt, w); return q };
const onHead = (J, i, dy = -.2) => { const sd = i ? 1 : -1; return [J.head[0] + sd * J.hr * 1.0, J.head[1] + J.hr * dy] };
const arc = (a, b, u, hgt) => [mix(a[0], b[0], u), mix(a[1], b[1], u) - Math.sin(PI * u) * hgt];

/* ================= 10場面 ================= */
const SC = {
  /* PROBLEM 01：目標の点線に届かないグラフ。指差す→頭を抱えて首を振る→ため息でしょんぼり */
  p1: { P: 6.4, still: 2.4, fn(S) {
    const t = S.t, K = a => kf(t, a), x0 = 20, x1 = 120, goal = G - 106;
    U.ground(S);
    const bump = K([[0, 0], [.4, 0], [1.05, 1], [1.3, .1], [1.45, .25], [1.6, 0], [6.4, 0]]), hs = [34, 50, 42, 60 + 34 * bump];
    line(S, [[x0, G - 116], [x0, G - .5]]);
    hs.forEach((h, i) => U.rect(S, x0 + 9 + i * 24, G - h, 15, h, { fill: i === 3 ? 'lav' : 'sky' }));
    line(S, [[x0 - 4, goal], [x1 + 4, goal]], { dash: [3, 3] }); sig(S, x1 + 8, goal, 5);
    const wP = K([[0, 0], [.35, 1], [1.3, 1], [1.6, 0], [6.4, 0]]), wH = K([[0, 0], [1.45, 0], [1.85, 1], [3.9, 1], [4.3, 0], [6.4, 0]]), wS = K([[0, 0], [4.1, 0], [4.5, 1], [5.5, 1], [6.0, 0], [6.4, 0]]);
    const bt = [x0 + 9 + 3 * 24 + 7, G - hs[3] - 4];
    const J = S.body({ x: 182, f: -1, role: 'cl', obj: 'chart', lean: .2 * wS - .06 * wH, tilt: wH * Math.sin(t * 8) * .15 + .1 * wP, crouch: .1 * wS, sweat: wH,
      face: { eye: wS > .5 ? 'c' : wH > .5 ? 'w' : 'n', mouth: wH > .5 ? 'w' : wS > .5 ? 'f' : wP > .5 ? 'o' : 'n', brow: wH > .3 || wS > .5 },
      hands: [J => blend(J, 0, [[bt, wP], [onHead(J, 0), wH]]), J => blend(J, 1, [[onHead(J, 1), wH]])] });
    S.char(J);
    U.qmark(S, J.head[0] - 2, J.head[1] - J.hr - 9 - 3 * Math.abs(Math.sin(t * 5)), 13, wH);
  } },
  /* PROBLEM 02：付箋の順番を入れ替えては首をかしげる。最後は元の並びに戻ってしまう */
  p2: { P: 7.2, still: .2, fn(S) {
    const t = S.t, cx = 120, J0 = S.body({ x: cx, obj: 'note' }), R = J0.reach, shY = J0.shoulders[0][1];
    const sy = shY + R * .74, d = clamp(Math.max(R * .62, J0.rg.sw * J0.s + 10), 0, 36), slots = [cx - d, cx, cx + d], sz = Math.min(22, d * .78);
    const SW = [[0, 2], [0, 1], [0, 1], [0, 2]], k = Math.min(3, Math.floor(t / 1.8)), u = (t - k * 1.8) / 1.8;
    let perm = [0, 1, 2]; for (let i = 0; i < k; i++) { const [a, b] = SW[i]; [perm[a], perm[b]] = [perm[b], perm[a]] }
    const [a, b] = SW[k], mv = ss(.2, .6, u), wR = ss(0, .2, u) * (1 - ss(.6, .76, u)), wT = ss(.72, .84, u) * (1 - ss(.94, 1, u));
    const pos = j => j === a ? arc([slots[a], sy], [slots[b], sy], mv, 24) : j === b ? arc([slots[b], sy], [slots[a], sy], mv, -7) : [slots[j], sy];
    U.ground(S);
    const J = S.body({ x: cx, f: 1, look: 0, role: 'cl', obj: 'note', tilt: wT * .3 * (k % 2 ? -1 : 1), sweat: k === 3 ? wT : 0,
      face: { eye: 'n', mouth: wT > .3 ? 'o' : 'n', brow: wT > .3 },
      hands: [J => blend(J, 0, [[add(pos(a), [0, -2]), wR]]), J => blend(J, 1, [[add(pos(b), [0, -2]), wR]])] });
    S.char(J, { arms: false });
    U.counter(S, cx - d - 26, cx + d + 26, sy - sz * .5 - 8);
    const FL = ['sky', 'lav', 'card'];
    [0, 1, 2].forEach(j => { const id = perm[j], q = pos(j); U.note(S, q[0], q[1], sz, (j === a ? 1 : j === b ? -1 : 0) * Math.sin(mv * PI) * .35 + (id - 1) * .05, FL[id]) });
    S.arms(J);
    U.qmark(S, J.head[0] + (k % 2 ? -1 : 1) * J.hr * 1.4, J.head[1] - J.hr - 6, 11, wT, true);
  } },
  /* PROBLEM 03：届いたレポートを逆さまに読み、首をかしげて肩をすくめる。その間にカレンダーが1枚めくれる */
  p3: { P: 7.0, still: 2.6, fn(S) {
    const t = S.t, K = a => kf(t, a), x = 168, f = -1;
    U.ground(S);
    const cx0 = 18, cy0 = G - 132, cw = 46, ch = 42, fl = ss(4.5, 5.2, t);
    U.rect(S, cx0, cy0, cw, ch, { fill: 'card' });
    const grid = (a) => { for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) { const gx = cx0 + 8 + c * 10, gy = cy0 + 16 + r * 9; if (r === 2 && c === 3) sig(S, gx, gy, 4.4, a); else dot(S, gx, gy, 1.2, 'ink', a * .7) } };
    grid(1);
    if (fl < 1) { const hh = ch * Math.abs(Math.cos(PI * fl)); U.rect(S, cx0, cy0, cw, Math.max(.5, hh), { fill: fl < .5 ? 'card' : 'lav' }); if (fl < .5 && hh > ch * .8) grid(1) }
    line(S, [[cx0 + 10, cy0 - 4], [cx0 + 10, cy0 + 4]], { lw: 1.4 }); line(S, [[cx0 + cw - 10, cy0 - 4], [cx0 + cw - 10, cy0 + 4]], { lw: 1.4 });
    for (let i = 0; i < 3; i++) U.rect(S, 36 + i * 1.5, G - 5 - i * 5, 44, 4.4, { fill: i % 2 ? 'sky' : 'card' });
    const fly = ss(5.4, 6.2, t), fa = t > 5.4 ? 1 - ss(6.5, 7, t) : 0;
    if (fa > 0) U.rect(S, mix(10, 38, fly), mix(-10, G - 20, fly), 44, 4.4, { fill: 'card', a: fa, rot: (1 - fly) * 1.2 });
    const rot = K([[0, 0], [1.2, 0], [2.0, PI], [3.2, PI], [4.0, TAU], [7, TAU]]), wSh = K([[0, 0], [4.0, 0], [4.3, 1], [4.7, 1], [5.0, 0], [7, 0]]), wL = K([[0, 0], [4.6, 0], [4.9, 1], [5.6, 1], [6.0, 0], [7, 0]]);
    const conf = ss(1.2, 1.5, t) * (1 - ss(3.9, 4.1, t));
    const J0 = S.body({ x, f, obj: 'doc' }), R = J0.reach, c = [x + f * R * .62, J0.shoulders[0][1] + R * .32], dw = 17;
    const hold = i => { const sd = i ? 1 : -1; return [c[0] + Math.cos(rot) * sd * dw * .5, c[1] + Math.sin(rot) * sd * dw * .5] };
    const J = S.body({ x, f, role: 'cl', obj: 'doc', tilt: conf * Math.sin(t * 3.4) * .2 + wL * .22, look: f * .8 * (1 - wL * .3), lean: -.08 * wSh,
      face: { eye: wSh > .5 ? 'c' : 'n', mouth: wSh > .5 ? 'w' : conf > .5 ? 'o' : 'n', brow: conf > .4 },
      hands: [J => P2(hold(0), add(J.shoulders[0], [-R * .55, -R * .2]), wSh), J => P2(hold(1), add(J.shoulders[1], [R * .55, -R * .2]), wSh)] });
    S.char(J, { arms: false });
    const dc = P2(c, add(J.hands[0], [-3, -9]), wSh);
    U.doc(S, dc[0], dc[1], dw, 22, rot + wSh * -.3);
    S.arms(J);
    U.qmark(S, J.head[0] + 3, J.head[1] - J.hr - 8, 12, conf * ss(1.9, 2.2, t));
  } },
  /* REASON 01：事業会社（ビル）とベンダー（ノートPC）の間を走って、書類とグラフを受け渡す */
  r1: { P: 7.2, still: 1.6, fn(S) {
    const t = S.t, K = a => kf(t, a), J0 = S.body({ x: 0, obj: 'case' }), R = J0.reach, shY = J0.shoulders[0][1], sw = J0.rg.sw;
    U.ground(S);
    const bx1 = 50, win = [bx1 + 4, shY + 4];
    U.rect(S, 8, G - 98, bx1 - 8, 98, { fill: 'lav' });
    for (let r = 0; r < 4; r++) for (let c = 0; c < 2; c++) U.rect(S, 15 + c * 15, G - 88 + r * 16, 9, 9, { fill: 'card', lw: .8 });
    line(S, [[bx1, win[1] - 8], [bx1 + 9, win[1] - 8]], { lw: 1.2 });
    const dy = shY + R * .58, dx0 = 188;
    U.table(S, dx0, 234, dy);
    prim(S, [[dx0 + 12, dy - 3], [dx0 + 40, dy - 3], [dx0 + 37, dy - 5], [dx0 + 15, dy - 5]], { fill: 'card' });
    U.rect(S, dx0 + 16, dy - 25, 21, 19, { fill: 'navy', rot: -.08 });
    const xa = bx1 + 6 + sw + R * .62, xb = dx0 + 6 - sw - R * .55;
    const x = K([[0, xa], [.9, xa], [2.9, xb], [3.8, xb], [5.8, xa], [7.2, xa]]), f = t < .8 ? -1 : t < 3.8 ? 1 : -1;
    const mov = (t > .9 && t < 2.9) || (t > 3.8 && t < 5.8), amp = mov ? 7 : 0, ph = (x - xa) / 14 * PI;
    const fi = f > 0 ? 1 : 0, bi = 1 - fi;
    const wW = K([[0, 0], [.2, 1], [.75, 1], [.9, 0], [5.8, 0], [6.0, 1], [6.5, 1], [6.7, 0], [7.2, 0]]), wD = K([[0, 0], [2.9, 0], [3.1, 1], [3.6, 1], [3.8, 0], [7.2, 0]]);
    const has = t < .55 ? 0 : t < 3.3 ? 1 : t < 3.5 ? 0 : t < 6.25 ? 2 : 0;
    const J = S.body({ x, f, role: 'us', obj: 'case', step: { ph, amp }, lean: mov ? .1 : 0, nod: t > 6.7 ? Math.max(0, Math.sin((t - 6.7) * 12)) : 0,
      face: { eye: 'n', mouth: mov ? 's' : 'n' },
      hands: [J => i0(J, 0), J => i0(J, 1)] });
    function i0(J, i) { if (i === fi) return blend(J, i, [[[J.shoulders[i][0] + f * R * .55, J.shoulders[i][1] + R * .45], has ? 1 : 0], [win, wW], [[dx0 + 22, dy - 8], wD]]);
      return add(J.hang[i], [Math.sin(ph) * (mov ? 5 : 0) * -f, 0]) }
    if (t >= 6.25) U.chartCard(S, win[0] + 2, win[1] - 1, 11, 9, 0, 1 - ss(6.7, 7.1, t));
    if (t < .55) U.doc(S, win[0] + 2, win[1], 9, 12, 0);
    if (t > 6.8) U.doc(S, win[0] + 2, win[1], 9, 12, 0, ss(6.8, 7.2, t));
    if (t > 3.3 && t < 3.5) U.chartCard(S, dx0 + 22, dy - 12, 11, 9);
    S.char(J);
    const h = J.hands[fi];
    if (has === 1) U.doc(S, h[0] + f * 2, h[1] - 3, 10, 13, f * .15); else if (has === 2) U.chartCard(S, h[0] + f * 2, h[1] - 3, 12, 10, f * .1);
  } },
  /* REASON 02：AI（ロボ）が猛烈に打ち込み、書類が飛んでいく。こちらはコーヒー。1枚が顔をかすめて、こぼしそうになる */
  r2: { P: 7.2, still: 1.6, fn(S) {
    const t = S.t, K = a => kf(t, a);
    U.ground(S);
    const B0 = S.body({ x: 58, obj: 'bot', role: 'bot' }), dyR = B0.shoulders[0][1] + B0.reach * .62;
    const bot = S.body({ x: 58, f: 1, look: .5, role: 'bot', obj: 'bot', tilt: Math.sin(t * 7) * .05, face: { eye: 'n', mouth: 'n' },
      hands: [0, 1].map(i => J => [58 + (i ? 6 : -9), dyR - 3 - 5 * Math.max(0, Math.sin(t * 17 + i * PI))]) });
    S.char(bot, { arms: false });
    U.counter(S, 24, 100, dyR);
    line(S, [[46, dyR - 2.5], [74, dyR - 2.5]], { lw: 2 });
    S.arms(bot);
    const ty = G - 40; U.table(S, 116, 146, ty, 'card');
    for (let i = 0; i < 3; i++) U.rect(S, 120, ty - 6 - i * 3, 22, 2.6, { fill: i % 2 ? 'sky' : 'card', lw: .7 });
    const x = 194, f = -1, J0 = S.body({ x, f, obj: 'pie' }), R = J0.reach, shY = J0.shoulders[0][1];
    const wUp = K([[0, 0], [.5, 0], [1.0, 1], [2.2, 1], [2.6, 0], [4.8, 0], [5.2, 1], [6.6, 1], [7.0, 0], [7.2, 0]]);
    const st = K([[0, 0], [2.75, 0], [2.92, 1], [3.3, 1], [3.6, 0], [7.2, 0]]), cat = K([[0, 0], [3.2, 0], [3.42, 1], [3.6, 1], [3.95, 0], [7.2, 0]]), rel = K([[0, 0], [3.7, 0], [3.95, 1], [4.6, 1], [4.9, 0], [7.2, 0]]);
    const c0 = [x + f * R * .5, shY + R * .5], lip0 = [c0[0] - 1, c0[1] - 12], catchP = [lip0[0] + 16, lip0[1] + 8];
    const J = S.body({ x, f, role: 'us', obj: 'pie', lean: -.16 * st, sweat: rel, tilt: wUp * -.1,
      face: { eye: st > .4 ? 'w' : wUp > .6 ? 'c' : 'n', mouth: st > .4 ? 'o' : rel > .4 ? 'w' : 's', brow: st > .5 || rel > .5 },
      hands: [J => { const m = [J.head[0] - J.hr * .85, J.head[1] + J.hr * .95 + 6]; return P2(P2(P2(c0, m, wUp), add(c0, [3, -2]), st), [catchP[0], catchP[1] + 9], cat) },
              J => blend(J, 1, [[onHead(J, 1, -.1), rel]])] });
    S.char(J);
    const h = J.hands[0], crot = f * .75 * wUp - f * .95 * st * (1 - cat);
    const ck = S.st.name === 'chunky' ? 1.45 : 1.15; U.cup(S, h[0] - 1, h[1] + 5 * ck, crot, 1, ck);
    if (t > 2.92 && t < 3.47) { const v = (t - 2.92) / .55, q = [mix(lip0[0], catchP[0], v), lip0[1] - 16 * Math.sin(PI * v * .9) + 6 * v]; prim(S, [[q[0], q[1] - 3.4], ...arcP(q[0], q[1], 1.7, -PI * .05, PI * 1.05, 8)], { fill: 'navy' }) }
    for (let j = 0; j < 8; j++) { if (j === 3 || j * .9 > t || t - j * .9 > .7) continue;
      const w = (t - j * .9) / .7; const q = arc([100, dyR - 6], [131, ty - 10], w, 26); U.doc(S, q[0], q[1], 8, 10, w * 4, 1 - ss(.85, 1, w)) }
    if (t > 2.55 && t < 3.4) { const w = (t - 2.55) / .85, q = arc([100, dyR - 6], [250, J0.head[1] - 22], w, 30); U.doc(S, q[0], q[1], 8, 10, w * 9) }
  } },
  /* REASON 03：窓口のカウンターの向こうで、施策の道具（拡声器・虫めがね・ペン）をお手玉。横の表に1つずつチェックが入る */
  r3: { P: 4.8, still: .35, fn(S) {
    const t = S.t, x = 104, J0 = S.body({ x, obj: 'clip' }), R = J0.reach, shY = J0.shoulders[0][1];
    U.ground(S);
    const T = .4, hy = shY + R * .55, inn = R * .22, out = R * .62, apex = hy - (J0.head[1] - J0.hr) + 16;
    const hand = side => { const u = fr((t - (side > 0 ? T : 0)) / (2 * T)), I = [x + side * inn, hy], O = [x + side * out, hy - 2];
      return u < .5 ? arc(I, O, ss(0, .5, u), 3) : arc(O, I, ss(.5, 1, u), -6) };
    const hL = hand(-1), hR = hand(1);
    const J = S.body({ x, f: 1, look: 0, role: 'us', obj: 'clip', tilt: Math.sin(t * PI / T) * .06, face: { eye: 'h', mouth: 'd' }, hands: [hL, hR] });
    S.char(J, { arms: false });
    U.counter(S, x - 52, x + 52, J0.hip[1] - 2);
    S.arms(J);
    const pts = [];
    for (let j = 0; j < 3; j++) { const s = fr(t / (6 * T) + j / 3), half = s < .5 ? 0 : 1, v = (s - half * .5) / .5, from = half ? 1 : -1;
      let q, rot = 0; if (v < 2 / 3) { const w = v / (2 / 3); q = arc([x + from * inn, hy], [x - from * out, hy - 2], w, apex); rot = w * TAU * from * .5 } else q = hand(-from);
      U.tool(S, j, q[0], q[1] - 6, 13, rot) }
    const bx = 178, by = G - 104;
    line(S, [[bx + 22, by + 60], [bx + 22, G]]); U.rect(S, bx, by, 44, 60, { fill: 'card' });
    for (let r = 0; r < 4; r++) { const ry = by + 10 + r * 13, on = ss(.25 + r * 1.05, .45 + r * 1.05, t) * (1 - ss(4.45, 4.75, t));
      U.rect(S, bx + 6, ry - 4, 8, 8, { fill: 'card', lw: .8 }); line(S, [[bx + 19, ry], [bx + 37, ry]], { lw: .7, a: .7 });
      if (on > .01) { if (r === 3) sig(S, bx + 10, ry, 5, on); else U.check(S, bx + 10.5, ry - .5, 9, on) } }
  } },
  /* STEP 01：3C の円を指しながら説明し、円が寄って重なる。相手はあごに手を当てて考え、うんうん頷く */
  s1: { P: 6.4, still: 3.4, fn(S) {
    const t = S.t, K = a => kf(t, a);
    U.ground(S);
    const bx0 = 74, bx1 = 166, by0 = G - 132, by1 = G - 64, vc = [(bx0 + bx1) / 2, (by0 + by1) / 2 + 2];
    line(S, [[vc[0] - 16, by1], [vc[0] - 22, G]]); line(S, [[vc[0] + 16, by1], [vc[0] + 22, G]]);
    U.rect(S, bx0, by0, bx1 - bx0, by1 - by0, { fill: 'card' });
    const ov = K([[0, 0], [2.1, 0], [3.0, 1], [5.6, 1], [6.3, 0], [6.4, 0]]), sp = mix(19, 8.5, ov), r = 13.5;
    const cs = [-PI / 2, PI / 6, PI * 5 / 6].map(a => [vc[0] + Math.cos(a) * sp, vc[1] + Math.sin(a) * sp]);
    ['sky', 'lav', 'card'].forEach((fc, i) => prim(S, circ(cs[i][0], cs[i][1], r, 28), { fill: fc, fa: .82, line: true, col: 'navy', lw: .7 }));
    if (ov > .9) sig(S, vc[0], vc[1], 5, ss(.9, 1, ov));
    const tgt = t < .7 ? cs[0] : t < 1.4 ? cs[1] : t < 2.1 ? cs[2] : vc;
    const wPt = K([[0, 0], [.25, 1], [4.6, 1], [5.0, 0], [6.4, 0]]), turn = t > 4.7 && t < 5.9;
    const A = S.body({ x: 40, f: 1, role: 'us', obj: 'pie', tilt: turn ? .1 : 0, face: { eye: turn ? 'h' : 'n', mouth: turn ? 's' : 'o' },
      hands: [null, J => blend(J, 1, [[tgt, wPt]])] });
    S.char(A);
    const think = K([[0, 1], [2.6, 1], [2.9, 0], [4.8, 0], [5.2, 1], [6.4, 1]]), nod = t > 3.0 && t < 4.6 ? Math.max(0, Math.sin((t - 3.0) * PI * 2.5)) : 0;
    const B = S.body({ x: 200, f: -1, role: 'cl', obj: 'doc', tilt: think * .14, nod, face: { eye: nod > .5 ? 'c' : 'n', mouth: think > .5 ? 'n' : 's' },
      hands: [J => blend(J, 0, [[[J.head[0] - J.hr * .35, J.head[1] + J.hr * 1.05], think]]), null] });
    S.char(B);
  } },
  /* STEP 02：散らばった付箋を、ボードの上から順に並べる。並べ終えたら一番上に朱の印 */
  s2: { P: 7.2, still: 6.3, fn(S) {
    const t = S.t, x = 112, J0 = S.body({ x, obj: 'note' }), R = J0.reach, shY = J0.shoulders[0][1];
    U.ground(S);
    const bw = J0.rg.sw * J0.s, pile = [x - Math.max(R * .85, bw + 22), shY + R * .6], sx = x + Math.max(R * .9, bw + 30), sl = [0, 1, 2].map(i => [sx, shY - R * .3 + i * R * .42]), sz = Math.min(18, R * .4);
    U.table(S, pile[0] - 20, pile[0] + 16, pile[1] + 8);
    line(S, [[sx, sl[2][1] + 16], [sx - 8, G]]); line(S, [[sx, sl[2][1] + 16], [sx + 8, G]]);
    U.rect(S, sx - 16, sl[0][1] - 14, 32, sl[2][1] - sl[0][1] + 28, { fill: 'card' });
    const FL = ['sky', 'lav', 'card'], k = Math.min(3, Math.floor(t / 2)), u = (t - k * 2) / 2, fade = 1 - ss(6.7, 7.1, t), done = ss(6.0, 6.3, t) * fade;
    const back = k === 3 ? ss(6.7, 7.1, t) : 1, from = k === 3 ? 0 : k + (u > .25 ? 1 : 0);
    for (let i = 2; i >= from; i--) U.note(S, pile[0] - 6 + i * 5, pile[1] - 2 - i * 2, sz * .9, (i - 1) * .3, FL[i], back);
    for (let i = 0; i < Math.min(k, 3); i++) U.note(S, sl[i][0], sl[i][1], sz, 0, FL[i], fade, i === 0 ? done : 0);
    let carry = null, f = 1, wH = 0;
    if (k < 3) { const toPile = ss(0, .22, u) * (1 - ss(.25, .5, u)), toSlot = ss(.3, .62, u) * (1 - ss(.7, .82, u));
      f = u < .28 ? -1 : 1; wH = Math.max(toPile, toSlot);
      if (u > .25 && u < .72) carry = P2(pile, sl[k], ss(.3, .62, u)); if (u >= .72) { U.note(S, sl[k][0], sl[k][1], sz, 0, FL[k]) } }
    const nod = k < 3 && u > .82 ? Math.max(0, Math.sin((u - .82) * 30)) : 0, thumbs = ss(6.0, 6.3, t) * (1 - ss(6.8, 7.1, t));
    const fi = f > 0 ? 1 : 0;
    const J = S.body({ x, f, role: 'us', obj: 'note', nod, face: { eye: thumbs > .5 ? 'h' : 'n', mouth: thumbs > .5 ? 'd' : 'n' },
      hands: [J => fi === 0 ? blend(J, 0, [[pile, wH]]) : blend(J, 0, [[[J.head[0] - J.hr * 1.8, J.head[1] + 2], thumbs]]),
              J => fi === 1 ? blend(J, 1, [[carry || sl[Math.min(k, 2)], wH]]) : J.hang[1]] });
    S.char(J);
    if (carry) U.note(S, carry[0], carry[1], sz, Math.sin(u * 9) * .1, FL[k]);
  } },
  /* STEP 03：真ん中の山からタスクの札を1枚ずつ。相手に手渡し、自分の分は自分のトレーへ */
  s3: { P: 6.4, still: 1.3, fn(S) {
    const t = S.t % 3.2, K = a => kf(t, a);
    U.ground(S);
    const A0 = S.body({ x: 84, obj: 'case' }), R = A0.reach, shY = A0.shoulders[0][1], ty = shY + R * .66, bw = A0.rg.sw * A0.s, xA = 120 - Math.max(36, bw + 18), xB = 240 - xA;
    const mid = [120, shY - 2];
    const stack = [120, ty - 4];
    U.table(S, 104, 136, ty);
    for (let i = 0; i < 4; i++) U.rect(S, 110, ty - 4 - i * 3, 20, 2.6, { fill: i % 2 ? 'lav' : 'card', lw: .7 });
    const trL = [xA - Math.max(R * .8, bw + 16), ty], trR = [xB + Math.max(R * .8, bw + 16), ty];
    U.table(S, trL[0] - 16, trL[0] + 14, ty); U.table(S, trR[0] - 14, trR[0] + 16, ty);
    U.rect(S, trL[0] - 11, ty - 6, 22, 3, { fill: 'sky', lw: .7 }); U.rect(S, trR[0] - 11, ty - 6, 22, 3, { fill: 'lav', lw: .7 });
    const aF = t < 2.0 ? 1 : t < 3.0 ? -1 : 1, bF = t > 1.45 && t < 2.5 ? 1 : -1;
    const aH = K([[0, 0], [.45, 1], [.6, 1], [1.2, 2], [1.45, 2], [1.7, 3], [2.0, 3], [2.4, 4], [2.75, 4], [3.0, 0], [3.2, 0]]);
    const aPos = J => { const v = aH; if (v <= 1) return P2(J.hang[1], stack, v); if (v <= 2) return P2(stack, [mid[0] - 3, mid[1]], v - 1); if (v <= 3) return P2([mid[0] - 3, mid[1]], stack, v - 2); return P2(stack, [trL[0] + 4, ty - 8], v - 3) };
    const A = S.body({ x: xA, f: aF, role: 'us', obj: 'case', face: { eye: t > 1.2 && t < 1.6 ? 'h' : 'n', mouth: 's' },
      hands: [J => aF < 0 ? aPos(J) : J.hang[0], J => aF > 0 ? aPos(J) : J.hang[1]] });
    const bH = K([[0, 0], [.9, 0], [1.25, 1], [1.45, 1], [1.8, 2], [2.2, 2], [2.5, 0], [3.2, 0]]);
    const bPos = J => bH <= 1 ? P2(J.hang[0], [mid[0] + 3, mid[1]], bH) : P2([mid[0] + 3, mid[1]], [trR[0] - 4, ty - 8], bH - 1);
    const nod = t > 2.5 && t < 3.1 ? Math.max(0, Math.sin((t - 2.5) * 16)) : 0;
    const B = S.body({ x: xB, f: bF, role: 'cl', obj: 'doc', nod, face: { eye: 'n', mouth: t > 1.3 && t < 1.7 ? 'o' : 's' },
      hands: [J => bF < 0 ? bPos(J) : J.hang[0], J => bF > 0 ? bPos(J) : J.hang[1]] });
    S.char(A); S.char(B);
    const ha = A.hands[aF > 0 ? 1 : 0], hb = B.hands[bF > 0 ? 1 : 0];
    if (t > .55 && t < 1.45) U.rect(S, ha[0] - 7, ha[1] - 5, 14, 9, { fill: 'card' });
    if (t >= 1.45 && t < 2.2) { U.rect(S, hb[0] - 7, hb[1] - 5, 14, 9, { fill: 'card' }); sig(S, hb[0] + 3.5, hb[1] - 1, 3.6) }
    if (t > 1.62 && t < 2.75) U.rect(S, ha[0] - 7, ha[1] - 5, 14, 9, { fill: 'sky' });
    if (t > .55 && t < 1.45) sig(S, ha[0] + 3.5, ha[1] - 1, 3.6);
  } },
  /* STEP 04：ダッシュボードを指差して説明。上司は画面を見て頷き、最後に親指を立てる */
  s4: { P: 6.4, still: 4.3, fn(S) {
    const t = S.t, K = a => kf(t, a);
    U.ground(S);
    const mx0 = 14, mx1 = 116, my0 = G - 120, my1 = G - 52;
    line(S, [[(mx0 + mx1) / 2, my1], [(mx0 + mx1) / 2, G - 6]], { lw: 1.4 }); line(S, [[(mx0 + mx1) / 2 - 16, G - .5], [(mx0 + mx1) / 2 + 16, G - .5]], { lw: 1.4 });
    U.rect(S, mx0, my0, mx1 - mx0, my1 - my0, { fill: 'navy' });
    U.rect(S, mx0 + 5, my0 + 5, mx1 - mx0 - 10, my1 - my0 - 10, { fill: 'card' });
    const n0 = [mx0 + 30, my0 + 14], n1 = [[mx0 + 16, my0 + 30], [mx0 + 44, my0 + 30]], n2 = [[mx0 + 12, my0 + 48], [mx0 + 24, my0 + 48], [mx0 + 38, my0 + 48], [mx0 + 50, my0 + 48]];
    line(S, [n0, [n0[0], n0[1] + 8], [n1[0][0], n0[1] + 8], n1[0]], { lw: .7 }); line(S, [[n0[0], n0[1] + 8], [n1[1][0], n0[1] + 8], n1[1]], { lw: .7 });
    n2.forEach((q, i) => line(S, [[n1[i >> 1][0], n1[0][1] + 4], [n1[i >> 1][0], n1[0][1] + 10], [q[0], n1[0][1] + 10], q], { lw: .7 }));
    [n0, ...n1, ...n2].forEach((q, i) => U.rect(S, q[0] - 4, q[1] - 3, 8, 6, { fill: i === 5 ? 'lav' : 'sky', lw: .7 }));
    const bn = n2[2], pulse = .5 + .5 * Math.sin(t * 5);
    sig(S, bn[0], bn[1] - 7, 4.4); prim(S, circ(bn[0], bn[1], 7 + pulse * 3, 18), { closed: true, col: 'sig', a: .5 * (1 - pulse), lw: .8 });
    const gr = ss(.2, 1.6, t) * (1 - ss(6.0, 6.4, t)) * .8 + .2;
    [.5, .7, .45, .9].forEach((v, i) => U.rect(S, mx0 + 66 + i * 8, my1 - 9 - v * 34 * gr, 5, v * 34 * gr, { fill: i === 2 ? 'lav' : 'sky', lw: .6 }));
    const tg = t < 1.2 ? n0 : t < 2.0 ? n1[1] : bn, wPt = K([[0, 0], [.3, 1], [3.6, 1], [3.9, 0], [6.4, 0]]), turn = t > 3.7 && t < 5.2;
    const A = S.body({ x: 146, f: turn ? 1 : -1, role: 'us', obj: 'chart', face: { eye: turn ? 'h' : 'n', mouth: turn ? 'd' : 'o' },
      hands: [J => blend(J, 0, [[[tg[0] + 4, tg[1] + 2], wPt]]), null] });
    const nod = t > .8 && t < 3.6 ? Math.max(0, Math.sin((t - .8) * PI * 1.25)) ** 2 : 0, th = K([[0, 0], [3.8, 0], [4.2, 1], [5.0, 1], [5.4, 0], [6.4, 0]]);
    const B = S.body({ x: 206, f: -1, s: 1.08, role: 'boss', obj: 'doc', tie: true, nod, tilt: -.04, face: { eye: nod > .5 ? 'c' : th > .5 ? 'h' : 'n', mouth: th > .5 ? 's' : 'n' },
      hands: [J => blend(J, 0, [[[J.head[0] - J.hr * 1.6, J.head[1] + J.hr * .4], th]]), null] });
    S.char(A); S.char(B);
    if (th > .3) { const h = B.hands[0]; line(S, [[h[0], h[1]], [h[0], h[1] - 5]], { lw: 1.6, a: th }) }
  } },
};
/* ほかのページが場面を足す口（js/vp-chars.js が先に window.__S2A_EXT を置く）。S2A の10場面は変えない */
if (typeof window.__S2A_EXT === 'function') window.__S2A_EXT({ SC, OBJ, OBJX, U, kf, ss, clamp, mix, add, mul, circ, ell, rr, xf, arcP, prim, line, dot, sig, blend, onHead, arc, P2, G, PI, TAU });
const ORDER = ['p1', 'p2', 'p3', 'r1', 'r2', 'r3', 's1', 's2', 's3', 's4'];

/* ================= 動かす ================= */
const list = [];
document.querySelectorAll('canvas[data-ch]').forEach(c => {
  const sc = SC[c.dataset.ch]; if (!sc) return;
  const host = c.closest('[data-chs]'), st = STY[(c.dataset.chs || (host && host.dataset.chs) || 'line')] || STY.line;
  list.push({ c, ctx: c.getContext('2d'), sc, st, w: 0, h: 0, d0: null, vis: false, n: 60, bg: null, tOff: (list.length % 5) * .9 });
});
function bgOf(el) { let e = el; while (e && e !== document.documentElement) { const b = getComputedStyle(e).backgroundColor; if (b && !/rgba\(0, 0, 0, 0\)|transparent/.test(b)) return rgbOf(b); e = e.parentElement } return C.paper }
function size(p) {
  const r = p.c.getBoundingClientRect(); if (!r.width || !r.height) return false;
  p.w = r.width; p.h = r.height; p.c.width = Math.round(r.width * DPR); p.c.height = Math.round(r.height * DPR); p.bg = bgOf(p.c); return true;
}
let T = 0, SEEK = null;
function draw(p) {
  if (!p.w && !size(p)) return;
  const sc = Math.min(p.w / W, p.h / H), ox = (p.w - W * sc) / 2, oy = (p.h - H * sc) / 2;
  const D = REDUCE ? 1 : SEEK != null ? 1 : (p.d0 == null ? 0 : clamp((T - p.d0) / DUR));
  const t = REDUCE ? p.sc.still : SEEK != null ? SEEK : (p.d0 == null ? 0 : Math.max(0, T - p.d0 - DUR + p.tOff));
  const ctx = p.ctx; ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, p.w, p.h);
  ctx.setTransform(DPR * sc, 0, 0, DPR * sc, DPR * ox, DPR * oy); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  let i = 0; const nPrev = p.n || 60;
  const S = {
    ctx, st: p.st, t: ((t % p.sc.P) + p.sc.P) % p.sc.P, lw: p.st.name === 'line' ? 1.3 / sc : p.st.lw, hair: .9 / sc,
    next: () => { const k = D >= 1 ? 1 : clamp((D - .6 * i / nPrev) / .4); i++; return k },
    col: (k, a) => { const v = k === 'bg' ? p.bg : (C[k] || C.ink); return `rgba(${v[0]},${v[1]},${v[2]},${a})` },
  };
  S.body = pose => body(S, pose); S.char = (J, o) => drawChar(S, J, o); S.arms = J => arms(S, J);
  try { p.sc.fn(S) } catch (e) { console.error('s2a-chars', p.c.dataset.ch, e) }
  p.n = Math.max(1, i);
}
const ro = new ResizeObserver(es => es.forEach(e => { const p = e.target.__cp; if (p) { p.w = 0; size(p); draw(p) } }));
const vio = new IntersectionObserver(es => es.forEach(e => { const p = e.target.__cp; if (p) p.vis = e.isIntersecting }), { rootMargin: '80px 0px' });
const sio = new IntersectionObserver(es => es.forEach(e => { const p = e.target.__cp; if (p && e.isIntersecting && p.d0 == null) { p.d0 = T; sio.unobserve(e.target) } }), { threshold: .35 });
list.forEach(p => { p.c.__cp = p; ro.observe(p.c); vio.observe(p.c); if (!REDUCE) sio.observe(p.c) });
/* 撮影・確認用：__s2aChSeek(秒) で全部をその時刻の完成形にする（null で解除）。__s2aChDone() で全部を描き終わった状態に */
window.__s2aChSeek = v => { SEEK = v; list.forEach(p => { p.w = 0; draw(p) }) };
window.__s2aChDone = () => { list.forEach(p => { if (p.d0 == null || p.d0 > T - DUR) p.d0 = T - DUR - .01; p.w = 0; draw(p) }) };
window.__s2aCh = () => ({ n: list.length, started: list.filter(p => p.d0 != null).length, styles: [...new Set(list.map(p => p.st.name))], scenes: ORDER });
if (REDUCE) { list.forEach(p => { size(p); draw(p) }); return }
let prev = performance.now();
function loop(now) { requestAnimationFrame(loop); const dt = Math.max(0, Math.min(.05, (now - prev) / 1000)); prev = now; T += dt; if (SEEK == null) list.forEach(p => { if (p.vis) draw(p) }) }
requestAnimationFrame(loop);
})();
