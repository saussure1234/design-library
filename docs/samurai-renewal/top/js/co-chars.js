/* 会社概要 VALUES 案C：道具の擬人化キャラ（Strategy2Action の D と同じ作風）で5つの行動指針を描く。外部の画像は使わない。
   s2a-chars.js より先に読み込む。window.__S2A_EXT に場面 cfun・cfree・cflat・copen・copt を足す（前の拡張があれば先に呼ぶ）。
   当社側＝us（ちょんまげ）、ほかの人＝cl。朱は各場面に1点まで。 */
(() => {
const prev = window.__S2A_EXT;
window.__S2A_EXT = E => {
  if (typeof prev === 'function') prev(E);
  const { SC, U, kf, ss, mix, add, circ, ell, rr, xf, arcP, prim, line, dot, sig, onHead, P2, G, PI, TAU } = E;
  const up = (J, i, k = 1) => { const sd = i ? 1 : -1; return P2(J.hang[i], [J.head[0] + sd * J.hr * 1.5, J.head[1] - J.hr * 2.4], k) };
  const bubble = (S, x, y, w, h, tail, a) => {
    if (a <= .02) return;
    prim(S, [...rr(x, y, w, h, 5)], { fill: 'card', a });
    prim(S, [[x + w * (tail > 0 ? .2 : .8) - 3, y + h], [x + w * (tail > 0 ? .2 : .8) + 3, y + h], [x + w * (tail > 0 ? .2 : .8) - tail * 7, y + h + 7]], { fill: 'card', a, lw: .8 });
    for (let i = 0; i < 2; i++) line(S, [[x + 6, y + 7 + i * 7], [x + w * (i ? .55 : .82), y + 7 + i * 7]], { a: a * .7, lw: .8 });
  };

  Object.assign(SC, {
    /* FUN：3人が順に跳ねて両手を上げる。上で花火が開く */
    cfun: { P: 4.8, still: 1.15, fn(S) {
      const t = S.t; U.ground(S);
      const cast = [{ x: 62, obj: 'note', role: 'cl', ph: 0 }, { x: 120, obj: 'case', role: 'us', ph: .28 }, { x: 178, obj: 'pie', role: 'cl', ph: .56 }];
      /* 花火（3つ、時間差で開く） */
      [[60, 42, 0], [124, 30, 1.6], [186, 46, 3.1]].forEach(([cx, cy, t0], k) => {
        const u = ((t - t0) % 4.8 + 4.8) % 4.8 / 1.5; if (u > 1) return;
        const r = 6 + ss(0, .7, u) * 20, a = 1 - ss(.55, 1, u);
        for (let i = 0; i < 12; i++) { const an = i / 12 * TAU + k; line(S, [[cx + Math.cos(an) * r * .55, cy + Math.sin(an) * r * .55], [cx + Math.cos(an) * r, cy + Math.sin(an) * r + u * 3]], { a, lw: 1.1, col: k === 1 ? 'skyD' : 'ink' }) }
        if (k === 1) sig(S, cx, cy, 4, a);
      });
      cast.forEach((c, i) => {
        const v = ((t / 1.6 + c.ph) % 1), jump = Math.max(0, Math.sin(v * TAU)) ** 1.4, crouch = Math.max(0, -Math.sin(v * TAU)) * .5;
        const J = S.body({ x: c.x, f: i === 2 ? -1 : 1, role: c.role, obj: c.obj, lift: jump * 16, crouch, tilt: Math.sin(v * TAU) * .08,
          face: { eye: jump > .3 ? 'h' : 'n', mouth: jump > .2 ? 'd' : 's' }, hands: [J => up(J, 0, .3 + jump * .7), J => up(J, 1, .3 + jump * .7)] });
        S.char(J);
      });
    } },
    /* FREE：カバンがノートPCを持って、家→カフェへ自由に歩く。空の時計は回り続ける */
    cfree: { P: 6.4, still: 2.0, fn(S) {
      const t = S.t; U.ground(S);
      /* 家 */
      prim(S, [[18, G], [18, G - 30], [52, G - 30], [52, G]], { fill: 'card' }); prim(S, [[13, G - 29], [35, G - 48], [57, G - 29]], { fill: 'sky' });
      U.rect(S, 29, G - 18, 10, 18, { fill: 'skyD', lw: .8 });
      /* カフェの机とカップ */
      U.table(S, 186, 226, G - 30); U.cup(S, 206, G - 33, 0, 1, .9);
      /* 時計 */
      const cx = 120, cy = 34; prim(S, circ(cx, cy, 15, 30), { fill: 'card' });
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; dot(S, cx + Math.cos(a) * 11.5, cy + Math.sin(a) * 11.5, .7) }
      line(S, [[cx, cy], [cx + Math.cos(t * 1.1 - PI / 2) * 7, cy + Math.sin(t * 1.1 - PI / 2) * 7]], { lw: 1.6 });
      line(S, [[cx, cy], [cx + Math.cos(t * 6 - PI / 2) * 11, cy + Math.sin(t * 6 - PI / 2) * 11]], { lw: 1 });
      const x = kf(t, [[0, 74], [.6, 74], [2.8, 166], [3.8, 166], [6.0, 74], [6.4, 74]]), f = (t > .6 && t < 3.8) ? 1 : (t >= 3.8 && t < 6.0) ? -1 : (t < .6 ? 1 : 1);
      const mov = (t > .6 && t < 2.8) || (t > 3.8 && t < 6.0), ph = x / 9;
      const typing = !mov;
      const J = S.body({ x, f, role: 'us', obj: 'case', step: { ph, amp: mov ? 7 : 0 }, lean: mov ? .08 : 0,
        face: { eye: typing ? 'c' : 'n', mouth: 's' }, hands: [J => [J.shoulders[0][0] + f * J.reach * .55, J.shoulders[0][1] + J.reach * .5], J => [J.shoulders[1][0] + f * J.reach * .55, J.shoulders[1][1] + J.reach * .5 + (typing ? Math.sin(t * 18) * 1.5 : 0)]] });
      S.char(J);
      const h = P2(J.hands[0], J.hands[1], .5);
      prim(S, [[h[0] - 9, h[1] - 1], [h[0] + 9, h[1] - 1], [h[0] + 9, h[1] + 1.4], [h[0] - 9, h[1] + 1.4]], { fill: 'navy', lw: .8 });
      prim(S, xf([[h[0] - 8, h[1] - 1], [h[0] + 8, h[1] - 1], [h[0] + 8, h[1] - 12], [h[0] - 8, h[1] - 12]], h[0], h[1] - 1, -f * .25), { fill: 'sky', lw: .8 });
    } },
    /* FLAT：高い台と低い台に立つ2人。台が同じ高さにそろい、同じ目線で握手する */
    cflat: { P: 5.6, still: 3.6, fn(S) {
      const t = S.t; U.ground(S);
      const k = kf(t, [[0, 0], [.8, 0], [2.4, 1], [4.8, 1], [5.6, 0]]), hA = mix(46, 14, k), hB = mix(4, 14, k);
      U.rect(S, 44, G - hA, 58, hA, { fill: 'sky' }); U.rect(S, 138, G - hB, 58, hB, { fill: 'sky' });
      line(S, [[30, G - 14], [210, G - 14]], { a: .35 * ss(.6, 1, k), lw: .8 });
      const shake = ss(2.6, 3.0, t) * (1 - ss(4.6, 5.0, t));
      const xa = mix(73, 98, shake), xb = mix(167, 142, shake);
      const A = S.body({ x: xa, f: 1, role: 'boss', obj: 'clip', g: G - hA, tie: true, face: { eye: shake > .5 ? 'h' : 'n', mouth: shake > .5 ? 'd' : 'n' },
        hands: [null, J => P2(J.hang[1], [120, J.shoulders[1][1] + J.reach * .55 + Math.sin(t * 14) * 1.6 * shake], shake)] });
      const B = S.body({ x: xb, f: -1, role: 'us', obj: 'note', g: G - hB, face: { eye: shake > .5 ? 'h' : 'n', mouth: shake > .5 ? 'd' : 's' },
        hands: [J => P2(J.hang[0], [120, J.shoulders[0][1] + J.reach * .55 + Math.sin(t * 14) * 1.6 * shake], shake), null] });
      S.char(A); S.char(B);
      if (shake > .6) sig(S, 120, Math.min(A.shoulders[1][1], B.shoulders[0][1]) - 18, 4, ss(.6, 1, shake));
    } },
    /* OPEN：向き合う2人が交互に吹き出しで話し、聞く側がうなずく */
    copen: { P: 6.0, still: 1.3, fn(S) {
      const t = S.t; U.ground(S);
      const turn = Math.floor(t / 1.5) % 2, u = (t % 1.5) / 1.5, a = ss(0, .2, u) * (1 - ss(.85, 1, u));
      const nodA = turn === 1 ? Math.max(0, Math.sin(u * TAU * 2)) : 0, nodB = turn === 0 ? Math.max(0, Math.sin(u * TAU * 2)) : 0;
      const A = S.body({ x: 82, f: 1, role: 'us', obj: 'doc', nod: nodA, face: { eye: 'n', mouth: turn === 0 ? (u * 8 % 1 < .5 ? 'o' : 's') : 's' },
        hands: [null, J => turn === 0 ? [J.shoulders[1][0] + J.reach * .6, J.shoulders[1][1] + J.reach * .1 + Math.sin(t * 9) * 2] : J.hang[1]] });
      const B = S.body({ x: 158, f: -1, role: 'cl', obj: 'note', nod: nodB, face: { eye: 'n', mouth: turn === 1 ? (u * 8 % 1 < .5 ? 'o' : 's') : 's' },
        hands: [J => turn === 1 ? [J.shoulders[0][0] - J.reach * .6, J.shoulders[0][1] + J.reach * .1 + Math.sin(t * 9) * 2] : J.hang[0], null] });
      S.char(A); S.char(B);
      if (turn === 0) bubble(S, 64, A.head[1] - A.hr - 34, 50, 24, 1, a); else bubble(S, 126, B.head[1] - B.hr - 34, 50, 24, -1, a);
      if (t > 4.6) { const v = ss(4.6, 5.6, t); sig(S, 120, mix(G - 60, G - 84, v), 4, 1 - ss(5.4, 5.9, t)) }
    } },
    /* OPTIMIZATION：絡まった3本の線を、グラフのキャラが引いてまっすぐ平行にそろえる */
    copt: { P: 5.2, still: 3.0, fn(S) {
      const t = S.t; U.ground(S);
      const k = kf(t, [[0, 0], [.6, 0], [2.6, 1], [4.4, 1], [5.2, 0]]), A = 1 - k;
      const J = S.body({ x: 192, f: -1, role: 'us', obj: 'chart', lean: -.12 * ss(.6, 1.4, t) * (1 - ss(4.4, 5.0, t)), face: { eye: k > .9 ? 'h' : 'n', mouth: k > .9 ? 'd' : 'w' },
        hands: [J => [J.shoulders[0][0] - J.reach * .7, G - 62], J => [J.shoulders[1][0] - J.reach * .5, G - 50]] });
      const hx = J.hands[0][0];
      [G - 74, G - 58, G - 42].forEach((y0, i) => {
        const pts = []; for (let j = 0; j <= 30; j++) { const v = j / 30, x = mix(26, hx, v);
          pts.push([x, y0 + A * (Math.sin(v * TAU * 2.2 + i * 2.1) * 13 + Math.sin(v * TAU * 5.3 + i) * 5) * Math.sin(v * PI)]) }
        line(S, pts, { lw: 1.3, col: i === 1 ? 'skyD' : 'ink' });
        dot(S, 26, y0, 2.2, 'ink');
      });
      if (k > .95) U.check(S, 70, G - 100, 12, ss(.95, 1, k));
      S.char(J);
    } },
  });
};
})();
