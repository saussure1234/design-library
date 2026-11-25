/* Strategy2Action REASON 01「事業会社とベンダー、マーケティングと営業双方の経験による一貫支援」の作り直し3案（So 11/26「キャラがわかりにくい」）。
   s2a-chars.js より先に読み込む。window.__S2A_EXT（前にほかのファイルが置いていれば連鎖）で、物2つ（ビル＝事業会社・ノートPC＝ベンダー）と場面 r1a・r1b・r1c を足す。
   r1a 橋渡し：川の両岸にビルとPC。当社のカバンが橋を渡って両方と握手し、最後に3人で橋の真ん中に並ぶ
   r1b 二刀流：メガホンで呼びかける（マーケ）→集まった相手と握手（営業）→上の2つの札が1本の線でつながる
   r1c 一本の線：メガホン→握手→ビル→グラフの4つの札を、カバンが途切れない1本の線でつなぎながら歩く */
(() => {
const prev = window.__S2A_EXT;
window.__S2A_EXT = X => {
  if (typeof prev === 'function') prev(X);
  const SZ = .82;
  const { SC, OBJ, OBJX, U, kf, ss, clamp, mix, add, circ, rr, xf, arcP, prim, line, dot, sig, blend, P2, G, PI } = X;

  /* ---- 物：事業会社のビル（窓・旗）とベンダーのノートPC ---- */
  OBJ.bldg = { w: 30, h: 52 };
  OBJ.pc = { w: 38, h: 28 };
  OBJX.bldg = ({ S, L, R, w, h, s }) => {
    prim(S, R(-w / 2, 0, w / 2, h), { fill: 'sky' });
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      const x0 = -w * .36 + c * w * .26, y0 = h * (.07 + r * .14);
      prim(S, R(x0, y0, x0 + w * .17, y0 + h * .085), { fill: 'card', lw: .55 });
    }
    line(S, [L(w * .22, h), L(w * .22, h + 13 * s)], { lw: .9 });
    prim(S, [L(w * .22, h + 13 * s), L(w * .22 + 9 * s, h + 10.5 * s), L(w * .22, h + 8 * s)], { fill: 'skyD', lw: .6 });
  };
  OBJX.pc = ({ S, R, w, h }) => {
    prim(S, R(-w * .62, 0, w * .62, h * .13), { fill: 'card' });
    prim(S, R(-w / 2, h * .13, w / 2, h), { fill: 'card' });
    prim(S, R(-w * .4, h * .22, w * .4, h * .9), { fill: 'sky', lw: .55 });
  };

  /* ---- 小道具 ---- */
  const shake = (p, t, on) => on ? [p[0], p[1] + Math.sin(t * 17) * 2.4] : p;
  /* メガホン：持ち手 h、向き f、大きさ k */
  const mega = (S, h, f, k = 1, a = 1) => {
    const P = (x, y) => [h[0] + f * x * k, h[1] + y * k];
    line(S, [P(-1, 4), P(1, 0)], { lw: 1.3, a });
    prim(S, [P(0, -2.5), P(5, -3), P(16, -8.5), P(16, 6.5), P(5, 2), P(0, 1.5)], { fill: 'sky', a });
    line(S, [P(16, -8.5), P(16, 6.5)], { lw: 1.4, a });
  };
  /* 声の弧：メガホンの口から外へ広がる */
  const waves = (S, o, f, t, a) => {
    if (a <= .01) return;
    for (let i = 0; i < 3; i++) {
      const u = ((t * 1.1 + i / 3) % 1), r = 6 + u * 22;
      line(S, arcP(o[0], o[1], r, f > 0 ? -.55 : PI - .55, f > 0 ? .55 : PI + .55, 10).map(q => q), { a: a * (1 - u) * .9, lw: 1.1 });
    }
  };
  /* 握手の印（握った手のまわりの短い線） */
  const burst = (S, p, a) => { if (a <= .01) return; [[-1, -1], [0, -1.3], [1, -1]].forEach(([dx, dy]) => line(S, [[p[0] + dx * 6, p[1] + dy * 6], [p[0] + dx * 10, p[1] + dy * 10]], { a, lw: 1 })) };
  /* 札（丸い窓）の中の絵 */
  const icon = {
    mega: (S, c, k, t) => { mega(S, [c[0] - 6 * k, c[1] + 1 * k], 1, .62 * k); },
    hand: (S, c, k, t) => {
      const y = c[1] + Math.sin(t * 17) * 1.1 * k;
      prim(S, rr(c[0] - 11 * k, c[1] + 1 * k, 4 * k, 5 * k), { fill: 'skyD', lw: .6 }); prim(S, rr(c[0] + 7 * k, c[1] + 1 * k, 4 * k, 5 * k), { fill: 'navy', lw: .6 });
      line(S, [[c[0] - 7 * k, c[1] + 3.5 * k], [c[0] - 2.5 * k, y + .5 * k]], { lw: 2.2 }); line(S, [[c[0] + 7 * k, c[1] + 3.5 * k], [c[0] + 2.5 * k, y + .5 * k]], { lw: 2.2 });
      prim(S, rr(c[0] - 4 * k, y - 2.4 * k, 8 * k, 5 * k, 2.4 * k), { fill: 'card', lw: .8 });
      [-1.2, 0, 1.2].forEach(d => line(S, [[c[0] + d * 2 * k, y - 2.2 * k], [c[0] + d * 2 * k, y + .6 * k]], { lw: .5 }));
    },
    bldg: (S, c, k) => {
      prim(S, rr(c[0] - 4.5 * k, c[1] - 6 * k, 9 * k, 13 * k), { fill: 'sky', lw: .8 });
      [[-2, -3.4], [1, -3.4], [-2, 0], [1, 0]].forEach(([x, y]) => prim(S, rr(c[0] + x * k, c[1] + y * k, 1.8 * k, 1.8 * k), { fill: 'card', lw: .4 }));
      line(S, [[c[0] + 2 * k, c[1] - 6 * k], [c[0] + 2 * k, c[1] - 10 * k]], { lw: .7 });
      prim(S, [[c[0] + 2 * k, c[1] - 10 * k], [c[0] + 5.5 * k, c[1] - 9 * k], [c[0] + 2 * k, c[1] - 8 * k]], { fill: 'skyD', lw: .4 });
    },
    graph: (S, c, k, t, g) => {
      line(S, [[c[0] - 7 * k, c[1] - 7 * k], [c[0] - 7 * k, c[1] + 6 * k], [c[0] + 7.5 * k, c[1] + 6 * k]], { lw: .8 });
      [.35, .6, 1].forEach((v, i) => { const hh = 11 * k * v * (.35 + .65 * g); prim(S, rr(c[0] + (-5 + i * 4.2) * k, c[1] + 6 * k - hh, 3 * k, hh), { fill: i === 2 ? 'skyD' : 'sky', lw: .55 }) });
    },
  };
  const badge = (S, c, r, a, on, draw) => {
    if (a <= .01) return;
    const k = .55 + .45 * ss(0, 1, a);
    prim(S, circ(c[0], c[1], r * k, 30), { fill: on ? 'sky' : 'card', a: Math.min(1, a * 1.4) });
    if (a > .35) draw(k);
  };

  /* ================= 案 A 橋渡し ================= */
  SC.r1a = { P: 9, still: 6.4, fn(S) {
    const t = S.t, K = a => kf(t, a), bL = 78, bR = 162;
    /* 岸・川・橋 */
    line(S, [[8, G], [bL, G]], { a: .35 }); line(S, [[bR, G], [232, G]], { a: .35 });
    for (let j = 0; j < 2; j++) { const pts = []; for (let x = bL + 4; x <= bR - 4; x += 4) pts.push([x, G + 7 + j * 5 + Math.sin(x * .16 + t * 2.4 + j * 2) * 1.3]); line(S, pts, { a: .45 - j * .15, lw: .9 }) }
    line(S, [[bL - 2, G - 15], [bR + 2, G - 15]], { lw: .9, a: .7 });
    for (let x = bL; x <= bR + .1; x += 12) line(S, [[x, G - 15], [x, G]], { lw: .8, a: .7 });
    prim(S, rr(bL - 4, G - 1, bR - bL + 8, 4), { fill: 'skyD' });
    /* 位置：当社は真ん中→左→右→真ん中。両者は最後に橋の上へ寄る */
    const xU = K([[0, 120], [.5, 120], [1.4, 78], [3.0, 78], [4.2, 164], [5.6, 164], [6.4, 120], [8.0, 120], [9, 120]]);
    const xB = K([[0, 30], [5.6, 30], [6.4, 72], [8.0, 72], [8.8, 30], [9, 30]]);
    const xP = K([[0, 210], [5.6, 210], [6.4, 168], [8.0, 168], [8.8, 210], [9, 210]]);
    const fU = t < 1.4 ? -1 : t < 3.0 ? -1 : t < 5.6 ? 1 : 1;
    const movU = (t > .5 && t < 1.4) || (t > 3.0 && t < 4.2) || (t > 5.6 && t < 6.4), movS = (t > 5.6 && t < 6.4) || (t > 8.0 && t < 8.8);
    const shB = t > 1.6 && t < 2.8, shP = t > 4.4 && t < 5.4, grp = t > 6.4 && t < 8.0, up = ss(6.6, 7.0, t) * (1 - ss(7.7, 8.0, t));
    const UJ = S.body({ s: SZ, x: xU, role: 'us', obj: 'case' }), R = UJ.reach, shY = UJ.shoulders[0][1];
    const hpB = shake([(xU + xB) / 2, shY + R * .42], t, shB), hpP = shake([(xU + xP) / 2, shY + R * .42], t, shP);
    const lift = (x, sd) => [x + sd * 15, shY - 18 * up - 2 * (1 - up)];
    const B = S.body({ s: SZ, x: xB, f: 1, role: 'cl', obj: 'bldg', tie: 1, step: movS ? { ph: (xB - 30) / 10 * PI, amp: 6 } : null, nod: shB ? Math.max(0, Math.sin((t - 1.6) * 6)) : 0,
      face: { eye: shB || grp ? 'c' : 'n', mouth: shB || grp ? 's' : 'n' }, look: grp ? .3 : .8,
      hands: [null, J => grp ? lift((xB + xU) / 2, 0) : blend(J, 1, [[hpB, ss(1.4, 1.6, t) * (1 - ss(2.8, 3.0, t))]])] });
    const Pc = S.body({ s: SZ, x: xP, f: -1, role: 'cl', obj: 'pc', step: movS ? { ph: (210 - xP) / 10 * PI, amp: 6 } : null, nod: shP ? Math.max(0, Math.sin((t - 4.4) * 6)) : 0,
      face: { eye: shP || grp ? 'c' : 'n', mouth: shP || grp ? 's' : 'n' }, look: grp ? -.3 : -.8,
      hands: [J => grp ? lift((xP + xU) / 2, 0) : blend(J, 0, [[hpP, ss(4.2, 4.4, t) * (1 - ss(5.4, 5.6, t))]]), null] });
    const J = S.body({ s: SZ, x: xU, f: fU, role: 'us', obj: 'case', step: movU ? { ph: xU / 9 * PI, amp: 7 } : null, lean: movU ? .1 : 0,
      face: { eye: shB || shP || grp ? 'c' : 'n', mouth: movU ? 'n' : 's' }, look: grp ? 0 : fU * .8,
      hands: [J => grp ? lift((xB + xU) / 2, 0) : blend(J, 0, [[hpB, ss(1.4, 1.6, t) * (1 - ss(2.8, 3.0, t))]]),
              J => grp ? lift((xP + xU) / 2, 0) : blend(J, 1, [[hpP, ss(4.2, 4.4, t) * (1 - ss(5.4, 5.6, t))]])] });
    S.char(B); S.char(Pc); S.char(J);
    burst(S, add(hpB, [0, -4]), shB ? 1 : 0); burst(S, add(hpP, [0, -4]), shP ? 1 : 0);
    if (up > .5) { sig(S, xU, shY - 40, 5, up); dot(S, xU - 14, shY - 33, 1.6, 'skyD', up); dot(S, xU + 14, shY - 33, 1.6, 'skyD', up) }
  } };

  /* ================= 案 B 二刀流 ================= */
  SC.r1b = { P: 9, still: 6.6, fn(S) {
    const t = S.t, K = a => kf(t, a);
    U.ground(S);
    const xU = K([[0, 48], [2.8, 48], [3.8, 106], [7.6, 106], [8.6, 48], [9, 48]]);
    const x1 = K([[0, 262], [.9, 262], [2.4, 160], [7.4, 160], [8.6, 262], [9, 262]]);
    const x2 = K([[0, 290], [1.2, 290], [2.7, 204], [7.4, 204], [8.7, 290], [9, 290]]);
    const movU = (t > 2.8 && t < 3.8) || (t > 7.6 && t < 8.6), fU = t > 7.6 ? -1 : 1;
    const wM = K([[0, 0], [.3, 1], [2.6, 1], [2.9, 0], [9, 0]]);   /* メガホンを構える */
    const shk = t > 4.0 && t < 5.2, wH = ss(3.8, 4.0, t) * (1 - ss(5.2, 5.4, t));
    const J0 = S.body({ s: SZ, x: xU, role: 'us', obj: 'case' }), R = J0.reach, shY = J0.shoulders[0][1];
    const hp = shake([(xU + x1) / 2 + 2, shY + R * .42], t, shk);
    const C1 = S.body({ s: SZ, x: x1, f: -1, role: 'cl', obj: 'doc', step: (t > .9 && t < 2.4) || (t > 7.4 && t < 8.6) ? { ph: x1 / 9 * PI, amp: 6 } : null,
      face: { eye: shk || t > 5.2 && t < 7.4 ? 'c' : 'n', mouth: t > 4 && t < 7.4 ? 's' : 'n' }, look: -.8, nod: shk ? Math.max(0, Math.sin((t - 4) * 6)) : 0,
      hands: [J => blend(J, 0, [[hp, wH]]), null] });
    const C2 = S.body({ s: SZ, x: x2, f: -1, role: 'cl', obj: 'note', step: (t > 1.2 && t < 2.7) || (t > 7.4 && t < 8.7) ? { ph: x2 / 9 * PI, amp: 6 } : null,
      face: { eye: 'n', mouth: t > 4.4 && t < 7.4 ? 's' : 'n' }, look: -.8, nod: t > 4.6 && t < 5.4 ? Math.max(0, Math.sin((t - 4.6) * 6)) : 0 });
    const J = S.body({ s: SZ, x: xU, f: fU, role: 'us', obj: 'case', step: movU ? { ph: xU / 9 * PI, amp: 7 } : null, lean: movU ? .1 : 0,
      face: { eye: shk ? 'c' : 'n', mouth: wM > .5 ? 'o' : 's' }, look: fU * .8,
      hands: [null, J => blend(J, 1, [[[J.shoulders[1][0] + R * .55, J.shoulders[1][1] - 3], wM], [hp, wH]])] });
    S.char(C2); S.char(C1); S.char(J);
    if (wM > .05) { const h = J.hands[1]; mega(S, h, 1, 1, wM); waves(S, [h[0] + 18, h[1] - 1], 1, t, wM * ss(.4, .7, t)) }
    burst(S, add(hp, [0, -4]), shk ? 1 : 0);
    /* 上の札：メガホン（マーケ）→握手（営業）→1本の線でつながる */
    const c1 = [48, 30], c2 = [134, 30], a1 = ss(.4, .8, t) * (1 - ss(8.2, 8.6, t)), a2 = ss(4.0, 4.4, t) * (1 - ss(8.2, 8.6, t)), lk = ss(5.4, 6.4, t) * (1 - ss(8.2, 8.6, t));
    if (lk > .01) { const e = P2([c1[0] + 13, c1[1]], [c2[0] - 13, c2[1]], ss(5.4, 6.4, t)); line(S, [[c1[0] + 13, c1[1]], e], { lw: 1.6, a: 1 - ss(8.2, 8.6, t) }) }
    badge(S, c1, 13, a1, lk > .99, k => icon.mega(S, c1, k, t));
    badge(S, c2, 13, a2, lk > .99, k => icon.hand(S, c2, k, t));
    if (lk > .99) { const g = ss(6.4, 6.8, t) * (1 - ss(8.2, 8.6, t)); U.check(S, 192, 32, 11, g); line(S, [[c2[0] + 13, c2[1]], [178, c2[1]]], { lw: 1.6, a: g }) }
  } };

  /* ================= 案 C 一本の線 ================= */
  const ST = [{ x: 62, k: 'mega' }, { x: 108, k: 'hand' }, { x: 154, k: 'bldg' }, { x: 200, k: 'graph' }];
  SC.r1c = { P: 9.2, still: 6.6, fn(S) {
    const t = S.t, K = a => kf(t, a), x0 = 39, x1 = 222;
    U.ground(S);
    const J0 = S.body({ s: SZ, x: 30, role: 'us', obj: 'case' }), R = J0.reach, shY = J0.shoulders[0][1], LY = shY - R * .72;
    const xU = K([[0, 30], [.4, 30], [6.2, 200], [7.6, 200], [9.0, 30], [9.2, 30]]);
    const fU = t > 7.6 ? -1 : 1, movU = (t > .4 && t < 6.2) || (t > 7.6 && t < 9.0);
    const pen = [xU + 9, LY];
    /* 線：歩いた所まで（戻る時は後ろから消える） */
    const head = t < 7.6 ? Math.max(x0, pen[0]) : x1 - 12, tail = t < 7.6 ? x0 : mix(x0, x1 - 12, ss(7.6, 9.0, t));
    if (head > tail + 1) { const pts = []; for (let x = tail; x <= head; x += 4) pts.push([x, LY + Math.sin(x * .09) * 2.2]); pts.push([head, LY + Math.sin(head * .09) * 2.2]); line(S, pts, { lw: 1.7 }) }
    /* 札：ペンが通ると色がつき、中の絵が動く */
    ST.forEach((s, i) => {
      const on = t < 7.6 ? ss(s.x - 6, s.x + 4, pen[0]) : 1 - ss(7.6 + i * .3, 7.9 + i * .3, t), c = [s.x, LY - 30];
      line(S, [[s.x, LY - 15], [s.x, LY + Math.sin(s.x * .09) * 2.2]], { lw: .9, a: .4 + .6 * on });
      badge(S, c, 15, .45 + .55 * on, on > .9, k => icon[s.k](S, c, k * 1.15, t, on));
    });
    if (t > 6.2 && t < 7.6) { const u = ss(6.3, 7.3, t); sig(S, mix(x0, x1 - 12, u), LY + Math.sin(mix(x0, x1 - 12, u) * .09) * 2.2, 5, 1 - ss(7.3, 7.6, t)) }
    const done = t > 6.3 && t < 7.6;
    const J = S.body({ s: SZ, x: xU, f: fU, role: 'us', obj: 'case', step: movU ? { ph: xU / 9 * PI, amp: 7 } : null, lean: movU ? .08 : 0,
      face: { eye: done ? 'c' : 'n', mouth: done ? 'd' : 's' }, look: fU * .8, nod: done ? Math.max(0, Math.sin((t - 6.4) * 7)) : 0,
      hands: [null, J => t < 6.2 ? pen : blend(J, 1, [[[J.shoulders[1][0] + fU * 6, J.shoulders[1][1] - R * .55], ss(6.3, 6.6, t) * (1 - ss(7.3, 7.6, t))]])] });
    S.char(J);
    if (t < 6.2) dot(S, pen[0], pen[1], 2.2, 'ink');
  } };
};
})();
