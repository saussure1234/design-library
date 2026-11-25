/* 動画制作：コードで描いて動かすキャラクター（Strategy2Action の D＝道具の擬人化と同じ作風）。外部の画像は使わない。
   s2a-chars.js より先に読み込む。window.__S2A_EXT で、物（カメラ・カチンコ・リール・再生画面・スマホ）と10場面を足す。
   場面：vp1〜vp3（Problem）・vs1〜vs3（Strength）・vw1〜vw4（Work Flow）。お客様側＝cl（髷なし）、当社側＝us（ちょんまげ）。 */
window.__S2A_EXT = E => {
  const { SC, OBJ, OBJX, U, kf, ss, clamp, mix, add, circ, ell, rr, xf, arcP, prim, line, dot, sig, blend, onHead, arc, P2, G, PI, TAU } = E;
  const TR = (x, y, s, rot = 0) => xf([[x - s * .3, y - s * .4], [x + s * .42, y], [x - s * .3, y + s * .4]], x, y, rot);

  /* ---- 物 ---- */
  Object.assign(OBJ, { cam: { w: 38, h: 27 }, clap: { w: 32, h: 26 }, reel: { w: 34, h: 34 }, play: { w: 38, h: 28 }, phone: { w: 22, h: 40 } });
  /* ビデオカメラ：体＝本体。向いている側にレンズ、上にファインダー、背に録画の点 */
  OBJX.cam = ({ S, J, L, R, w, h, lw, s }) => {
    const f = J.f;
    prim(S, [L(f * w / 2, h * .2), L(f * (w / 2 + 9 * s), h * .08), L(f * (w / 2 + 9 * s), h * .92), L(f * w / 2, h * .8)], { fill: 'skyD', lw });
    prim(S, R(-w / 2, 0, w / 2, h), { fill: 'sky' });
    prim(S, [L(-f * w * .34, h), L(-f * w * .04, h), L(-f * w * .04, h * 1.22), L(-f * w * .34, h * 1.22)], { fill: 'navy', lw });
    const rec = .5 + .5 * Math.sin(S.t * 6);
    sig(S, ...L(-f * w * .36, h * .82), 3.6 * s, .35 + .65 * rec);
  };
  /* カチンコ：白い板＋上の拍子木（J.p.open＝開き 0〜1） */
  OBJX.clap = ({ S, J, L, R, w, h, lw, s }) => {
    prim(S, R(-w / 2, 0, w / 2, h), { fill: 'card' });
    line(S, [L(-w * .36, h * .2), L(w * .36, h * .2)], { lw: .7 });
    const op = J.p.open || 0, hg = L(-w / 2, h + 1.5 * s), an = -op * .55;
    const bar = [[0, 0], [w, 0], [w, 6 * s], [0, 6 * s]].map(([x, y]) => { const c = Math.cos(an), sn = Math.sin(an); const lx = x * c - (-y) * sn, ly = x * sn + (-y) * c; return [hg[0] + J.n[0] * lx + J.u[0] * -ly, hg[1] + J.n[1] * lx + J.u[1] * -ly] });
    prim(S, bar, { fill: 'navy', lw });
    for (let i = 1; i < 4; i++) { const a = P2(bar[0], bar[1], i / 4), b = P2(bar[3], bar[2], i / 4 - .08); line(S, [a, b], { col: 'card', lw: 1.6 }) }
  };
  /* フィルムのリール：丸に穴5つ（J.p.spin で回る） */
  OBJX.reel = ({ S, J, L, w, h, lw, s }) => {
    const c = L(0, h / 2), r = w / 2, sp = J.p.spin || 0;
    prim(S, circ(c[0], c[1], r, 32), { fill: 'sky' });
    for (let i = 0; i < 5; i++) { const a = sp + TAU * i / 5 + PI * .1; if (Math.sin(a) < -.2) continue; prim(S, circ(c[0] + Math.cos(a) * r * .7, c[1] + Math.sin(a) * r * .7, r * .14, 12), { fill: 'card', lw }) }
    dot(S, c[0], c[1] + r * .72, 1.4 * s, 'ink', .6);
  };
  /* 再生画面：角の丸い板＋左上の再生の三角＋下の進行バー（J.p.prog） */
  OBJX.play = ({ S, J, L, w, h, lw, s }) => {
    const pts = rr(-w / 2, 0, w, h, 4 * s).map(([x, y]) => L(x, y));
    prim(S, pts, { fill: 'sky' });
    const a = L(-w * .3, h * .82); prim(S, TR(a[0], a[1], 7 * s), { fill: 'navy', lw: .6 });
    const pr = J.p.prog == null ? .4 : J.p.prog;
    line(S, [L(-w * .38, h * .14), L(w * .38, h * .14)], { lw: .7, a: .5 });
    line(S, [L(-w * .38, h * .14), L(mix(-w * .38, w * .38, pr), h * .14)], { lw: 1.6, col: 'navy' });
  };
  /* スマホ（縦）：紺の縁＋白い画面 */
  OBJX.phone = ({ S, J, L, w, h, lw, s }) => {
    prim(S, rr(-w / 2, 0, w, h, 4 * s).map(([x, y]) => L(x, y)), { fill: 'navy' });
    prim(S, rr(-w / 2 + 2.4 * s, 4 * s, w - 4.8 * s, h - 8.5 * s, 2 * s).map(([x, y]) => L(x, y)), { fill: 'card', lw });
  };

  /* ---- 小道具 ---- */
  const camIcon = (S, x, y, k = 1, a = 1) => { U.rect(S, x - 7 * k, y - 5 * k, 11 * k, 10 * k, { fill: 'sky', a }); prim(S, [[x + 4 * k, y - 2 * k], [x + 8 * k, y - 4.5 * k], [x + 8 * k, y + 4.5 * k], [x + 4 * k, y + 2 * k]], { fill: 'skyD', a, lw: .7 }) };
  const reelIcon = (S, x, y, k = 1, a = 1, sp = 0) => { prim(S, circ(x, y, 7 * k, 20), { fill: 'card', a }); for (let i = 0; i < 4; i++) { const an = sp + TAU * i / 4; dot(S, x + Math.cos(an) * 4 * k, y + Math.sin(an) * 4 * k, 1.3 * k, 'ink', a * .8) } };
  const playIcon = (S, x, y, k = 1, a = 1) => { U.rect(S, x - 9 * k, y - 6.5 * k, 18 * k, 13 * k, { fill: 'sky', a, r: 2 }); prim(S, TR(x, y, 7 * k), { fill: 'navy', a, lw: .6 }) };
  const film = (S, x, y, n, a = 1, cols) => { for (let i = 0; i < n; i++) { const fx = x + i * 13; U.rect(S, fx, y, 12, 10, { fill: cols ? cols[i % cols.length] : 'card', a, lw: .7 }); line(S, [[fx + 2, y + 1.6], [fx + 10, y + 1.6]], { a: a * .6, lw: .6, dash: [1.2, 1.6] }); line(S, [[fx + 2, y + 8.4], [fx + 10, y + 8.4]], { a: a * .6, lw: .6, dash: [1.2, 1.6] }) } };
  const bubble = (S, x, y, rw, rh, a = 1, tail = -1) => { if (a <= .02) return; prim(S, [...arcP(x, y, 1, 0, 0, 0).slice(0, 0), ...ell(x, y, rw, rh, 0, 26)], { fill: 'card', a }); prim(S, [[x + tail * rw * .2, y + rh * .8], [x + tail * rw * .5, y + rh + 7], [x + tail * rw * .45, y + rh * .7]], { fill: 'card', a, lw: .7 }) };
  const frame = (S, x, y, w, h, a = 1, col) => { const c = Math.min(w, h) * .22; [[[x, y + c], [x, y], [x + c, y]], [[x + w - c, y], [x + w, y], [x + w, y + c]], [[x + w, y + h - c], [x + w, y + h], [x + w - c, y + h]], [[x + c, y + h], [x, y + h], [x, y + h - c]]].forEach(p => line(S, p, { a, lw: 1.3, col })) };
  const tripod = (S, x, top, a = 1) => { line(S, [[x, top], [x - 12, G]], { a, lw: 1.1 }); line(S, [[x, top], [x + 12, G]], { a, lw: 1.1 }); line(S, [[x, top], [x, G - 4]], { a, lw: 1.1 }) };

  Object.assign(SC, {
    /* PROBLEM 01：企画・撮影・編集をひとりで抱えてお手玉。途中でひとつ落として、汗をかいて固まる */
    vp1: { P: 7.0, still: 2.2, fn(S) {
      const t = S.t, cx = 120;
      U.ground(S);
      const J0 = S.body({ x: cx, obj: 'play' }), top = J0.head[1] - J0.hr - 30, R = 26, drop = ss(4.2, 4.5, t) * (1 - ss(6.6, 6.9, t));
      const wP = ss(4.5, 4.9, t) * (1 - ss(6.3, 6.7, t));
      const pos = i => { const ph = (t * .9 + i / 3) % 1, an = PI + ph * TAU; return [cx + Math.cos(an) * R, top + 22 - Math.sin(an) * -R * .9 - 22] };
      const fall = (() => { const u = clamp((t - 4.2) / .7), b = Math.abs(Math.sin(u * PI * 2.2)) * (1 - u) * 18; return [cx + 46 + u * 20, mix(top, G - 8, Math.min(1, u * 1.4)) - b] })();
      const hand = i => { const sd = i ? 1 : -1, ph = t * .9 * 3 + i * 1.5; return [cx + sd * 18, J0.shoulders[0][1] - 6 - Math.max(0, Math.sin(ph * PI)) * 8 * (1 - wP)] };
      const J = S.body({ x: cx, f: 1, look: 0, role: 'cl', obj: 'play', prog: .15, sweat: wP, nod: 0,
        face: { eye: wP > .5 ? 'w' : 'n', mouth: wP > .5 ? 'w' : 'o', brow: true },
        hands: [J => blend(J, 0, [[hand(0), 1 - wP * .6]]), J => blend(J, 1, [[hand(1), 1 - wP * .6]])] });
      S.char(J);
      const draw = (i, q) => i === 0 ? U.note(S, q[0], q[1], 15, t * 2) : i === 1 ? camIcon(S, q[0], q[1], 1.05) : reelIcon(S, q[0], q[1], 1.05, 1, t * 3);
      for (let i = 0; i < 3; i++) { if (i === 2 && drop > .01) draw(i, fall); else if (!(i === 2 && t > 4.2 && t < 6.9)) draw(i, pos(i)) }
      U.qmark(S, J.head[0] - 22, J.head[1] - J.hr - 8, 12, wP, true);
    } },
    /* PROBLEM 02：カメラはきれいに撮れるのに、枠がお客様からずれる。何度直しても合わず、首をかしげる */
    vp2: { P: 6.8, still: 3.2, fn(S) {
      const t = S.t, K = a => kf(t, a);
      U.ground(S);
      const B = S.body({ x: 192, f: -1, role: 'cl', obj: 'doc', face: { eye: 'n', mouth: t > 3.6 ? 'f' : 's' }, tilt: t > 3.6 ? Math.sin(t * 2) * .06 : 0 });
      S.char(B);
      const fx = K([[0, 120], [1.0, 128], [1.8, 150], [2.6, 132], [3.4, 158], [4.6, 158], [5.6, 120], [6.8, 120]]), fy = K([[0, G - 128], [1.0, G - 132], [1.8, G - 52], [2.6, G - 140], [3.4, G - 46], [4.6, G - 46], [5.6, G - 128], [6.8, G - 128]]);
      const wQ = ss(3.4, 3.8, t) * (1 - ss(5.2, 5.6, t));
      const A = S.body({ x: 62, f: 1, role: 'cl', obj: 'cam', tilt: -.12 + (fy - (G - 90)) / 400, sweat: wQ, face: { eye: wQ > .5 ? 'w' : 'n', mouth: wQ > .5 ? 'w' : 'n', brow: wQ > .3 },
        hands: [null, J => [J.head[0] + 22, J.head[1] + 4]] });
      S.char(A);
      const ln = [A.head[0] + 30, A.head[1] + 2];
      line(S, [ln, [fx, fy]], { a: .35, dash: [2, 3], lw: .8 }); line(S, [ln, [fx, fy + 36]], { a: .35, dash: [2, 3], lw: .8 });
      frame(S, fx, fy, 46, 36, 1);
      U.qmark(S, A.head[0], A.head[1] - A.hr - 12, 12, wQ, true);
    } },
    /* PROBLEM 03：ふたりの吹き出しの中身（動画・スマホ・グラフ・人）がくるくる変わって決まらない。最後は両手を上げてお手上げ */
    vp3: { P: 7.2, still: 2.0, fn(S) {
      const t = S.t;
      U.ground(S);
      const wS = ss(5.0, 5.4, t) * (1 - ss(6.8, 7.1, t));
      const up = (J, i) => [J.shoulders[i][0] + (i ? 1 : -1) * 16, J.shoulders[i][1] - 14];
      const A = S.body({ x: 64, f: 1, role: 'cl', obj: 'note', tilt: wS * .08, face: { eye: wS > .5 ? 'c' : 'n', mouth: wS > .5 ? 'w' : (Math.sin(t * 9) > 0 ? 'o' : 'n') }, hands: [J => blend(J, 0, [[up(J, 0), wS]]), J => blend(J, 1, [[up(J, 1), wS]])] });
      const B = S.body({ x: 176, f: -1, role: 'cl', obj: 'doc', tilt: -wS * .08, face: { eye: wS > .5 ? 'c' : 'n', mouth: wS > .5 ? 'w' : (Math.sin(t * 9 + 2) > 0 ? 'o' : 'n') }, hands: [J => blend(J, 0, [[up(J, 0), wS]]), J => blend(J, 1, [[up(J, 1), wS]])] });
      S.char(A); S.char(B);
      const ICO = [(x, y) => playIcon(S, x, y, .9), (x, y) => prim(S, rr(x - 5, y - 8, 10, 16, 2), { fill: 'navy' }), (x, y) => U.chartCard(S, x, y, 18, 13), (x, y) => { dot(S, x, y - 3, 3, 'ink'); prim(S, arcP(x, y + 7, 6, PI, TAU, 10), { fill: 'sky' }) }];
      const ba = 1 - wS;
      [[A, 0, 1, 0], [B, 2, -1, .45]].forEach(([J, o, tl, ph]) => {
        const bx = J.head[0] + tl * 14, by = J.head[1] - J.hr - 26;
        bubble(S, bx, by, 17, 13, ba, -tl);
        if (ba > .05) ICO[(Math.floor(t / .9 + ph) + o) % 4](bx, by);
      });
      U.qmark(S, 120, G - 104 - 3 * Math.abs(Math.sin(t * 5)), 18, wS, true);
    } },

    /* STRENGTH 01：顧客・競合・自社の3つの円を描いて、重なりから動画の企画（再生画面）へ矢印。描き終えて頷く */
    vs1: { P: 7.0, still: 4.6, fn(S) {
      const t = S.t, K = a => kf(t, a);
      U.ground(S);
      const bx0 = 14, by0 = G - 132, bw = 120, bh = 86;
      line(S, [[bx0 + 20, by0 + bh], [bx0 + 14, G]], { lw: 1.1 }); line(S, [[bx0 + bw - 20, by0 + bh], [bx0 + bw - 14, G]], { lw: 1.1 });
      U.rect(S, bx0, by0, bw, bh, { fill: 'card' });
      const C3 = [[bx0 + 34, by0 + 32], [bx0 + 54, by0 + 32], [bx0 + 44, by0 + 50]], r = 15;
      const d = [ss(.3, 1.2, t), ss(1.2, 2.1, t), ss(2.1, 3.0, t)].map(v => v * (1 - ss(6.5, 6.9, t)));
      C3.forEach(([x, y], i) => { if (d[i] > 0) line(S, circ(x, y, r, 30).concat([circ(x, y, r, 30)[0]]).slice(0, Math.max(2, Math.round(31 * d[i]))), { lw: 1.1 }) });
      const ar = ss(3.1, 3.7, t) * (1 - ss(6.5, 6.9, t)), ctr = [bx0 + 44, by0 + 38];
      if (ar > 0) { const e = P2([ctr[0] + 22, ctr[1]], [bx0 + 92, ctr[1]], ar); line(S, [[ctr[0] + 22, ctr[1]], e], { lw: 1.1 }); if (ar > .9) line(S, [[e[0] - 4, e[1] - 3], e, [e[0] - 4, e[1] + 3]], { lw: 1.1 }) }
      const pa = ss(3.6, 4.0, t) * (1 - ss(6.5, 6.9, t)); if (pa > 0) playIcon(S, bx0 + 104, ctr[1], 1, pa);
      if (d[2] > .95 && t < 6.5) sig(S, ctr[0], ctr[1], 4, ss(3.0, 3.2, t));
      const pen = t < 1.2 ? P2(C3[0], [C3[0][0], C3[0][1] - r], 1) : null;
      const tg = t < 1.2 ? [C3[0][0] + Math.cos(-PI / 2 + TAU * d[0]) * r, C3[0][1] + Math.sin(-PI / 2 + TAU * d[0]) * r]
        : t < 2.1 ? [C3[1][0] + Math.cos(-PI / 2 + TAU * d[1]) * r, C3[1][1] + Math.sin(-PI / 2 + TAU * d[1]) * r]
          : t < 3.0 ? [C3[2][0] + Math.cos(-PI / 2 + TAU * d[2]) * r, C3[2][1] + Math.sin(-PI / 2 + TAU * d[2]) * r]
            : t < 3.8 ? P2([ctr[0] + 22, ctr[1]], [bx0 + 92, ctr[1]], ar) : null;
      void pen;
      const wD = K([[0, 0], [.2, 1], [3.8, 1], [4.1, 0], [7, 0]]), nod = t > 4.2 && t < 5.6 ? Math.max(0, Math.sin((t - 4.2) * PI * 1.5)) ** 2 : 0;
      const A = S.body({ x: 178, f: -1, role: 'us', obj: 'clip', nod, face: { eye: nod > .5 ? 'c' : 'n', mouth: t > 4 ? 's' : 'o' },
        hands: [J => tg ? blend(J, 0, [[tg, wD]]) : J.hang[0], null] });
      S.char(A);
    } },
    /* STRENGTH 02：カメラが撮ったフィルムが、そのまま隣のリールへ流れ込んで回り、再生画面になって飛び出す（企画〜編集まで社内で一貫） */
    vs2: { P: 6.0, still: 2.5, fn(S) {
      const t = S.t;
      U.ground(S);
      const A = S.body({ x: 52, f: 1, role: 'us', obj: 'cam', face: { eye: 'n', mouth: 's' }, hands: [null, J => [J.head[0] + 20, J.head[1] + 6]] });
      const B = S.body({ x: 186, f: -1, role: 'us', obj: 'reel', spin: t * 4, face: { eye: Math.sin(t * 2) > .7 ? 'h' : 'n', mouth: 's' },
        hands: [J => [J.shoulders[0][0] - 10, J.shoulders[0][1] + 4], null] });
      S.char(A); S.char(B);
      const y = A.head[1] - 4, x0 = A.head[0] + 32, x1 = B.head[0] - 26, span = x1 - x0;
      for (let i = 0; i < 6; i++) { const u = ((t * .5 + i / 6) % 1), x = x0 + u * span, a = ss(0, .08, u) * (1 - ss(.9, 1, u)); film(S, x - 6, y - 5, 1, a, [i % 2 ? 'sky' : 'card']) }
      line(S, [[x0, y + 7], [x1, y + 7]], { a: .25, lw: .8 });
      for (let i = 0; i < 2; i++) { const u = ((t / 3 + i / 2) % 1), a = ss(0, .15, u) * (1 - ss(.75, 1, u)); playIcon(S, B.head[0] + 6 + u * 14, B.head[1] - B.hr - 14 - u * 40, .8, a) }
    } },
    /* STRENGTH 03：スーツケースを引いて地図のピンからピンへ。着いたら三脚を立て、カレンダーが1枚めくれる（最短翌日） */
    vs3: { P: 7.6, still: 3.6, fn(S) {
      const t = S.t, K = a => kf(t, a);
      U.ground(S);
      const pins = [44, 184];
      pins.forEach((px, i) => { const pu = i === 1 ? .5 + .5 * Math.sin(t * 5) : 0; prim(S, [...arcP(px, G - 16, 6, PI, TAU, 10), [px, G - 4]], { fill: i ? 'skyD' : 'sky' }); dot(S, px, G - 16, 1.8, 'card'); if (i && t > 3 && t < 5.2) prim(S, ell(px, G - 2, 10 + pu * 4, 2.4, 0, 18), { closed: true, a: .4 * (1 - pu), lw: .8 }) });
      line(S, [[pins[0], G - 2], [pins[1], G - 2]], { dash: [2, 4], a: .35, lw: .8 });
      const x = K([[0, 78], [.6, 78], [3.0, 162], [5.0, 162], [7.0, 78], [7.6, 78]]), f = t < 4.9 ? 1 : -1, mov = (t > .6 && t < 3.0) || (t > 5.0 && t < 7.0);
      const ph = x / 14 * PI, set = ss(3.1, 3.5, t) * (1 - ss(4.6, 5.0, t));
      const A = S.body({ x, f, role: 'us', obj: 'cam', step: { ph, amp: mov ? 6 : 0 }, lean: mov ? .08 : 0, face: { eye: set > .5 ? 'h' : 'n', mouth: 's' },
        hands: [J => f > 0 ? [J.shoulders[0][0] - 16, J.shoulders[0][1] + 12] : J.hang[0], J => f < 0 ? [J.shoulders[1][0] + 16, J.shoulders[1][1] + 12] : J.hang[1]] });
      const hd = A.hands[f > 0 ? 0 : 1], cx = hd[0] - f * 10;
      line(S, [hd, [cx, G - 22]], { lw: 1 });
      U.rect(S, cx - 9, G - 22, 18, 17, { fill: 'card', r: 2 }); dot(S, cx - 5, G - 3, 2, 'ink'); dot(S, cx + 5, G - 3, 2, 'ink');
      if (set > .02) tripod(S, 204, G - 40, set);
      S.char(A);
      const kx = 200, ky = 18, fl = ss(3.6, 4.2, t);
      U.rect(S, kx, ky, 30, 28, { fill: 'card' });
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) dot(S, kx + 7 + c * 8, ky + 14 + r * 7, 1.1, 'ink', .6);
      if (fl < 1 && t > 3.6) { const hh = 28 * Math.abs(Math.cos(PI * fl)); U.rect(S, kx, ky, 30, Math.max(.5, hh), { fill: fl < .5 ? 'card' : 'sky' }) }
      if (t > 4.2 && t < 7.2) sig(S, kx + 23, ky + 21, 4.2, ss(4.2, 4.4, t));
    } },

    /* STEP 1 ヒアリング・企画：お客様の話（吹き出し）を聞いて頷き、絵コンテのコマが1枚ずつ増えていく */
    vw1: { P: 7.0, still: 5.4, fn(S) {
      const t = S.t;
      U.ground(S);
      const talk = t < 4.2, B = S.body({ x: 52, f: 1, role: 'cl', obj: 'doc', face: { eye: 'n', mouth: talk ? (Math.sin(t * 10) > 0 ? 'o' : 's') : 's' }, hands: [null, J => talk ? [J.shoulders[1][0] + 14, J.shoulders[1][1] - 4 - 4 * Math.sin(t * 4)] : J.hang[1]] });
      const nod = t > .6 && t < 4.2 ? Math.max(0, Math.sin((t - .6) * PI * 1.4)) ** 2 : 0;
      const fr = [0, 1, 2].map(i => ss(1.2 + i * 1.1, 1.6 + i * 1.1, t) * (1 - ss(6.6, 6.95, t)));
      const cur = fr[2] > .5 ? 2 : fr[1] > .5 ? 1 : 0, px = 92 + cur * 30, py = 30;
      const A = S.body({ x: 188, f: -1, role: 'us', obj: 'clip', nod, face: { eye: nod > .5 ? 'c' : 'n', mouth: t > 4.8 ? 's' : 'n' },
        hands: [J => t > 1.1 && t < 4.6 ? [px + 12 + Math.sin(t * 14) * 3, py + 20] : J.hang[0], null] });
      S.char(B); S.char(A);
      if (talk) { bubble(S, B.head[0] + 22, B.head[1] - B.hr - 20, 15, 10, 1, -1); for (let i = 0; i < 3; i++) dot(S, B.head[0] + 15 + i * 7, B.head[1] - B.hr - 20, 1.6, 'ink', (Math.floor(t * 3) % 3) >= i ? 1 : .25) }
      fr.forEach((v, i) => { if (v <= .01) return; const x = 92 + i * 30, y = py; U.rect(S, x, y, 26, 20, { fill: 'card', a: v }); if (i === 0) dot(S, x + 13, y + 8, 3, 'ink', v * .8); if (i === 1) { line(S, [[x + 5, y + 15], [x + 21, y + 15]], { a: v, lw: .8 }); prim(S, rr(x + 9, y + 5, 8, 9), { fill: 'sky', a: v }) } if (i === 2) prim(S, TR(x + 13, y + 10, 8), { fill: 'navy', a: v }) });
      if (fr[2] > .9 && t > 4.8) U.check(S, 196, 26, 12, ss(4.8, 5.1, t) * (1 - ss(6.6, 6.95, t)));
    } },
    /* STEP 2 撮影：カチンコをパチン → 録画の点が光り、枠の中でお客様が手を振る */
    vw2: { P: 6.4, still: 2.4, fn(S) {
      const t = S.t, K = a => kf(t, a);
      U.ground(S);
      const op = K([[0, 0], [.3, 1], [.8, 1], [.95, 0], [6.4, 0]]), wC = K([[0, 1], [1.4, 1], [1.8, 0], [6.4, 0]]);
      const B = S.body({ x: 188, f: -1, role: 'cl', obj: 'doc', face: { eye: t > 1.6 ? 'h' : 'n', mouth: t > 1.6 ? 'd' : 's' },
        hands: [J => t > 1.8 ? [J.head[0] - J.hr * 1.6 + Math.sin(t * 9) * 4, J.head[1] - J.hr * .8] : J.hang[0], null] });
      S.char(B);
      const fa = ss(1.0, 1.3, t);
      frame(S, B.head[0] - 30, B.head[1] - B.hr - 14, 62, 86, fa);
      tripod(S, 66, G - 46);
      const A = S.body({ x: 66, f: 1, role: 'us', obj: 'cam', lift: 0, face: { eye: 'n', mouth: t > 1.6 ? 's' : 'o' },
        hands: [J => blend(J, 0, [[[J.head[0] + 34, J.head[1] - 6], wC]]), J => [J.head[0] + 22, J.head[1] + 8]] });
      S.char(A);
      if (wC > .02) { const h = A.hands[0]; S.char(S.body({ x: h[0] + 6, g: h[1] + 16, s: .5, f: 1, role: 'us', obj: 'clap', open: op, face: { eye: op > .5 ? 'w' : 'c', mouth: 'o' } }), { arms: false }) }
      if (t > 1.0) { const b = .5 + .5 * Math.sin(t * 6); sig(S, B.head[0] + 26, B.head[1] - B.hr - 8, 4, .4 + .6 * b) }
    } },
    /* STEP 3 編集：机の上のタイムラインで、リールがコマを1つ持ち上げて並べ替え、最後に再生の三角が出る */
    vw3: { P: 6.8, still: 4.6, fn(S) {
      const t = S.t;
      U.ground(S);
      const ty = G - 58, x0 = 22, segW = 28, slot = i => x0 + i * (segW + 3);
      U.table(S, 14, 158, ty);
      const COL = ['sky', 'card', 'skyD', 'card'], mv = ss(1.2, 2.6, t) * (1 - ss(6.3, 6.7, t));
      const order = [0, 1, 2, 3], pos = i => i === 1 ? arc([slot(1), ty - 13], [slot(3), ty - 13], mv, 26) : i === 3 ? arc([slot(3), ty - 13], [slot(1), ty - 13], mv, -6) : [slot(i), ty - 13];
      line(S, [[x0 - 2, ty - 1.5], [slot(3) + segW + 2, ty - 1.5]], { a: .4, lw: .8 });
      const hd = pos(1);
      const A = S.body({ x: 196, f: -1, role: 'us', obj: 'reel', spin: t * 2.4, face: { eye: t > 3.4 ? 'h' : 'n', mouth: t > 3.4 ? 's' : 'o' },
        hands: [J => t > .9 && t < 2.8 ? [hd[0] + segW / 2, hd[1] + 2] : J.hang[0], null] });
      S.char(A);
      order.forEach(i => { const q = pos(i); U.rect(S, q[0], q[1], segW, 11, { fill: COL[i], lw: .8 }); line(S, [[q[0] + 3, q[1] + 2], [q[0] + segW - 3, q[1] + 2]], { a: .5, lw: .6, dash: [1.2, 1.8] }) });
      const ph = ss(3.2, 3.6, t) * (1 - ss(6.3, 6.7, t));
      if (ph > 0) { playIcon(S, 86, ty - 44, 1.3, ph); const pr = ss(3.6, 6.0, t); line(S, [[x0, ty - 20], [mix(x0, slot(3) + segW, pr), ty - 20]], { col: 'navy', lw: 1.4, a: ph }); sig(S, mix(x0, slot(3) + segW, pr), ty - 20, 3.6, ph) }
    } },
    /* STEP 4 納品：再生画面のキャラがスマホを手渡し。お客様（上司）が再生し、進行バーが進んで親指を立てる */
    vw4: { P: 6.8, still: 4.8, fn(S) {
      const t = S.t, K = a => kf(t, a);
      U.ground(S);
      const g = K([[0, 0], [.4, 0], [1.4, 1], [6.8, 1]]), mid = [120, G - 60];
      const th = K([[0, 0], [4.0, 0], [4.4, 1], [5.6, 1], [6.0, 0], [6.8, 0]]), prog = ss(1.8, 4.0, t);
      const A = S.body({ x: 66, f: 1, role: 'us', obj: 'play', prog: .95, face: { eye: t > 4 ? 'h' : 'n', mouth: 's' },
        hands: [null, J => blend(J, 1, [[[mid[0] - 6, mid[1] + 6], 1 - ss(1.4, 1.8, t)]])] });
      const nod = t > 2 && t < 4 ? Math.max(0, Math.sin((t - 2) * PI * 1.5)) ** 2 : 0;
      const B = S.body({ x: 178, f: -1, s: 1.06, role: 'boss', obj: 'doc', tie: true, nod, face: { eye: th > .5 ? 'h' : nod > .5 ? 'c' : 'n', mouth: th > .5 ? 'd' : 'o' },
        hands: [J => blend(J, 0, [[[mid[0] + 8, mid[1] + 6], ss(1.2, 1.6, t)], [[J.head[0] - J.hr * 1.6, J.head[1] + J.hr * .2], th]]), J => P2(J.hang[1], [mid[0] + 14, mid[1] + 14], ss(1.2, 1.6, t))] });
      S.char(A); S.char(B);
      const ph = P2([A.hands[1][0] + 4, A.hands[1][1] - 18], [mid[0] + 2, mid[1] - 12], g), pw = 16, phh = 26;
      U.rect(S, ph[0] - pw / 2, ph[1], pw, phh, { fill: 'navy', r: 3 }); U.rect(S, ph[0] - pw / 2 + 2, ph[1] + 3, pw - 4, phh - 7, { fill: 'card', r: 1.5 });
      if (t > 1.6) { prim(S, TR(ph[0], ph[1] + 11, 5), { fill: 'navy', a: 1 - prog * .5, lw: .5 }); line(S, [[ph[0] - 5, ph[1] + 19], [ph[0] - 5 + 10 * prog, ph[1] + 19]], { col: 'navy', lw: 1.4 }) }
      if (th > .3) { const h = B.hands[0]; line(S, [[h[0], h[1]], [h[0], h[1] - 5]], { lw: 1.6, a: th }) }
    } },
  });
};
