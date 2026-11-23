// 場面3のテレビに流す「番組」。1930年代風のカートゥーン（白黒・セピア）を 2D canvas に描き、音は WebAudio で合成する。
// 絵も音もすべてこのファイルの中で作る（外部の画像・音源ファイルは使わない）。
//
// 使い方：
//   const tv = createTVShow({ width: 640, height: 480 });
//   const tex = new THREE.CanvasTexture(tv.canvas);
//   毎フレーム： tv.update(t, dt); tex.needsUpdate = true;   // t, dt は秒
//   tv.setLevel(0〜1);   // 音の大きさ（場面との距離で絞る）
//   tv.dispose();
// 音は window.SND.out()（sound.js）が返す時だけ鳴らす。OFF→ON にした時は次の番組から鳴る。

const TAU = Math.PI * 2;
const K = '#17120c', D = '#3c3328', M = '#6e6352', L = '#a5977e', P = '#d5c7aa', W = '#f1e6cd';
const SERIF = 'Georgia, "Times New Roman", serif';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const eo = (x) => 1 - Math.pow(1 - clamp(x), 3);
const GAIN = 0.35;   // setLevel(1) の時の出口の大きさ（sound.js の他の音と釣り合う値）

// ---------- 描画の部品 ----------
function circ(c, x, y, r, fill, lw = 4) {
  c.beginPath(); c.arc(x, y, r, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = K; c.stroke(); }
}
function ell(c, x, y, rx, ry, rot, fill, lw = 4) {
  c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = K; c.stroke(); }
}
function box(c, x, y, w, h, fill, lw = 4) {
  if (fill) { c.fillStyle = fill; c.fillRect(x, y, w, h); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = K; c.strokeRect(x, y, w, h); }
}
function rbox(c, x, y, w, h, r, fill, lw = 4) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (lw) { c.lineWidth = lw; c.strokeStyle = K; c.stroke(); }
}
function line(c, x1, y1, x2, y2, lw = 4, col = K) {
  c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.lineWidth = lw; c.strokeStyle = col; c.stroke();
}
// ゴムの手足：2点を弓なりの太線でつなぐ
function hose(c, x1, y1, x2, y2, bend = 0.25, w = 7, col = K) {
  const mx = (x1 + x2) / 2 - (y2 - y1) * bend, my = (y1 + y2) / 2 + (x2 - x1) * bend;
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx, my, x2, y2);
  c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.stroke();
}
// 白い手袋（指先は +x 向き）
function glove(c, x, y, s, ang = 0, point = false) {
  c.save(); c.translate(x, y); c.rotate(ang); c.scale(s, s);
  ell(c, -15, 0, 7, 13, 0, W, 3);
  if (point) ell(c, 20, -3, 13, 5, 0, W, 3);
  ell(c, 1, 0, 15, 14, 0, W, 3);
  ell(c, 5, -12, 5, 8, 0.7, W, 3);
  if (!point) { c.beginPath(); for (const i of [-5, 0, 5]) { c.moveTo(8, i); c.lineTo(15, i); } c.lineWidth = 2.5; c.stroke(); }
  c.restore();
}
// 顔：楕円の目＋黒目、口
function face(c, x, y, s, t, o = {}) {
  const { look = 0, lookY = 0, mouth = 'smile', blink = false } = o;
  for (const g of [-1, 1]) {
    const ex = x + g * 13 * s, ey = y - 9 * s;
    if (blink) { c.beginPath(); c.arc(ex, ey, 8 * s, 0.2, Math.PI - 0.2); c.lineWidth = 3 * s; c.strokeStyle = K; c.stroke(); continue; }
    ell(c, ex, ey, 9 * s, 14 * s, 0, W, 3 * s);
    ell(c, ex + look * 3.5 * s, ey + (2 + lookY * 4) * s, 5 * s, 8 * s, 0, K, 0);
    circ(c, ex + look * 3.5 * s - 1.5 * s, ey - 2 * s + lookY * 4 * s, 1.7 * s, W, 0);
  }
  c.lineWidth = 3 * s; c.strokeStyle = K; c.fillStyle = K;
  if (mouth === 'o') { ell(c, x, y + 16 * s, 7 * s, 9 * s, 0, K, 0); return; }
  c.beginPath(); c.moveTo(x - 19 * s, y + 8 * s); c.quadraticCurveTo(x, y + 14 * s, x + 19 * s, y + 8 * s);
  c.quadraticCurveTo(x, y + (mouth === 'grin' ? 38 : 30) * s, x - 19 * s, y + 8 * s); c.fill();
  ell(c, x, y + 22 * s, 7 * s, 4 * s, 0, M, 0);
  c.beginPath(); c.arc(x - 21 * s, y + 7 * s, 4 * s, -1.2, 1.2); c.arc(x + 21 * s, y + 7 * s, 4 * s, Math.PI - 1.2, Math.PI + 1.2); c.stroke();
}
// 1文字ずつ揺れる見出し
function wtext(c, s, x, y, size, t, o = {}) {
  const { fill = W, stroke = K, lw = Math.max(2, size * 0.16), wob = 1, align = 'center', font = SERIF, weight = '900', rot = 0 } = o;
  c.save(); c.translate(x, y); if (rot) c.rotate(rot);
  c.font = `${weight} ${size}px ${font}`; c.textBaseline = 'middle'; c.textAlign = 'center'; c.lineJoin = 'round';
  const ch = [...s], ws = ch.map((q) => c.measureText(q).width), tw = ws.reduce((a, b) => a + b, 0);
  let cx = align === 'center' ? -tw / 2 : align === 'right' ? -tw : 0;
  const k = Math.floor(t * 12);
  ch.forEach((q, i) => {
    const dy = wob ? Math.sin(t * 9 + i * 0.9) * size * 0.07 * wob : 0;
    const r = wob ? (rnd(k * 31 + i) - 0.5) * 0.14 * wob : 0;
    c.save(); c.translate(cx + ws[i] / 2, dy); c.rotate(r);
    if (stroke && lw) { c.lineWidth = lw; c.strokeStyle = stroke; c.strokeText(q, 0, 0); }
    c.fillStyle = fill; c.fillText(q, 0, 0); c.restore();
    cx += ws[i];
  });
  c.restore();
}
function starburst(c, x, y, r1, r2, n, rot, fill, lw = 4) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
  c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (lw) { c.lineWidth = lw; c.strokeStyle = K; c.stroke(); }
}
function rays(c, cx, cy, n, rot, a, b) {
  c.fillStyle = a; c.fillRect(0, 0, 640, 480); c.fillStyle = b; c.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = rot + (i * TAU) / n, a1 = a0 + TAU / (2 * n);
    c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a0) * 900, cy + Math.sin(a0) * 900); c.lineTo(cx + Math.cos(a1) * 900, cy + Math.sin(a1) * 900); c.closePath();
  }
  c.fill();
}
function sparkle(c, x, y, r) { if (r < 0.5) return; starburst(c, x, y, r, r * 0.22, 4, 0, W, 2.5); }
function cloud(c, x, y, s, fill = W) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.beginPath(); c.arc(-40, 8, 26, 0, TAU); c.arc(-8, -12, 34, 0, TAU); c.arc(30, 0, 28, 0, TAU); c.arc(52, 14, 18, 0, TAU);
  c.fillStyle = fill; c.fill(); c.lineWidth = 4 / s; c.strokeStyle = K; c.stroke();
  c.beginPath(); c.arc(-40, 8, 24, 0, TAU); c.arc(-8, -12, 32, 0, TAU); c.arc(30, 0, 26, 0, TAU); c.arc(52, 14, 16, 0, TAU); c.fill();
  c.restore();
}
function sunface(c, x, y, r, t) {
  c.save(); c.translate(x, y); c.rotate(t * 0.8);
  starburst(c, 0, 0, r * 1.55, r * 1.1, 12, 0, P, 3); c.restore();
  circ(c, x, y, r, W, 4); face(c, x, y + 2, r / 40, t, { look: Math.sin(t * 2), mouth: 'smile' });
}
function note(c, x, y, s, fill = W) {
  c.save(); c.translate(x, y); c.scale(s, s); c.rotate(-0.25);
  ell(c, 0, 0, 10, 7, 0, fill, 3); c.restore();
  line(c, x + 9 * s, y - 2 * s, x + 9 * s, y - 34 * s, 3.5 * s);
  c.beginPath(); c.moveTo(x + 9 * s, y - 34 * s); c.quadraticCurveTo(x + 24 * s, y - 26 * s, x + 20 * s, y - 14 * s); c.stroke();
}

// ---------- 番組 ----------
// draw(c, t, len)：t は番組の中の時間（12コマ/秒に量子化済み）。sound(A, t0, len)：AudioContext 時刻 t0 から len 秒ぶん予約。

// ラグタイムの譜面（16分＝0.1秒）。ピアノの番組で絵と音の両方に使う
const RAG = (() => {
  const s = 0.1, seq = [];
  const mel = [
    [[0, 72], [2, 76], [3, 79], [5, 84], [6, 83], [8, 79], [10, 76], [11, 74], [13, 72], [14, 74]],
    [[0, 76], [2, 79], [3, 77], [5, 76], [6, 74], [8, 71], [10, 74], [11, 77], [13, 76], [14, 72]],
  ];
  const left = [[48, [64, 67, 72]], [43, [62, 65, 71]]];
  for (let bar = 0; bar < 2; bar++) {
    const o = bar * 16;
    mel[bar].forEach(([p, m]) => seq.push({ t: (o + p) * s, m, d: 0.28, h: 1 }));
    const [b, ch] = left[bar];
    [0, 8].forEach((p) => seq.push({ t: (o + p) * s, m: b, d: 0.35, h: 0 }));
    [4, 12].forEach((p) => ch.forEach((m) => seq.push({ t: (o + p) * s, m, d: 0.2, h: 0 })));
  }
  return { seq, len: 32 * s };
})();
const WHITE = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84];
const BLACK_AFTER = [0, 1, 3, 4, 5, 7, 8, 10, 11, 12];   // 何番目の白鍵の右に黒鍵があるか

// 天気図の大陸（でたらめな形）
const LAND = Array.from({ length: 30 }, (_, i) => {
  const a = (i / 30) * TAU, r = 1 + (rnd(i * 3.1) - 0.5) * 0.42 + Math.sin(a * 3) * 0.12;
  return [Math.cos(a) * r * 190, Math.sin(a) * r * 120];
});
// ボクシングの観客の頭
const CROWD = Array.from({ length: 46 }, (_, i) => [rnd(i) * 640, 60 + rnd(i + 99) * 140, 12 + rnd(i + 7) * 10]);

const PROGRAMS = [
  { // 1 跳ねるボールの顔
    name: 'BOING BALL',
    draw(c, t) {
      c.fillStyle = P; c.fillRect(0, 0, 640, 480);
      c.fillStyle = 'rgba(23,18,12,.08)'; for (let x = 0; x < 640; x += 40) c.fillRect(x, 0, 18, 380);
      c.fillStyle = L; c.fillRect(0, 380, 640, 100);
      for (let i = -8; i <= 8; i++) line(c, 320 + i * 40, 380, 320 + i * 120, 480, 2, 'rgba(23,18,12,.35)');
      line(c, 0, 380, 640, 380, 4);
      const T = 0.62, ph = (t % T) / T, h = 4 * ph * (1 - ph), r = 56;
      const hit = ph < 0.07 || ph > 0.95;
      const sx = hit ? 1.3 : h < 0.45 ? 0.9 : 1, sy = hit ? 0.74 : h < 0.45 ? 1.12 : 1;
      const x = 320 + Math.sin(t * 1.5) * 150, gy = 380 - h * 215;
      ell(c, x, 386, r * (1.15 - h * 0.5), 9 * (1 - h * 0.4), 0, 'rgba(23,18,12,.38)', 0);
      c.save(); c.translate(x, gy); c.scale(sx, sy);
      circ(c, 0, -r, r, W, 5);
      c.beginPath(); c.arc(0, -r, r, Math.PI * 0.62, Math.PI * 0.38, true); c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(0, -r, r - 4, Math.PI * 1.15, Math.PI * 1.45); c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,.8)'; c.stroke();
      face(c, 0, -r - 4, 1.25, t, { look: Math.cos(t * 1.5), lookY: hit ? 1 : -0.3, mouth: hit ? 'o' : 'grin' });
      c.restore();
      if (ph < 0.3 && t > 0.2) wtext(c, 'BOING!', x + (x < 320 ? 150 : -150), 330 - ph * 60, 46, t, { rot: x < 320 ? 0.15 : -0.15 });
      // 幕
      for (const g of [-1, 1]) {
        c.save(); if (g > 0) { c.translate(640, 0); c.scale(-1, 1); }
        c.beginPath(); c.moveTo(0, 0); c.lineTo(120, 0); c.quadraticCurveTo(60, 230, 34, 300); c.quadraticCurveTo(60, 400, 80, 480); c.lineTo(0, 480); c.closePath();
        c.fillStyle = D; c.fill(); c.lineWidth = 4; c.strokeStyle = K; c.stroke();
        for (const fx of [30, 62, 92]) { c.beginPath(); c.moveTo(fx, 0); c.quadraticCurveTo(fx * 0.5, 230, fx * 0.25, 300); c.lineWidth = 2; c.stroke(); }
        ell(c, 34, 300, 12, 18, 0.4, M, 3);
        c.restore();
      }
      c.fillStyle = D; c.fillRect(0, 0, 640, 36); c.beginPath();
      for (let x = 0; x <= 640; x += 64) { c.moveTo(x + 32, 36); c.arc(x + 32, 36, 32, 0, Math.PI); }
      c.fill(); c.lineWidth = 3; c.strokeStyle = K; c.stroke();
    },
    sound(A, t0, len) {
      const T = 0.62;
      for (let k = 0; k * T < len; k++) A.boing(t0 + k * T, k % 2 ? 150 : 120);
      [60, 64, 67, 72, 67, 64].forEach((m, i) => { if (i * 0.31 < len) A.piano(m + 12, t0 + i * 0.31 + 0.15, 0.25, 0.05); });
    },
  },
  { // 2 踊る花
    name: 'DAISY WALTZ',
    draw(c, t) {
      c.fillStyle = W; c.fillRect(0, 0, 640, 480);
      ell(c, 120, 470, 260, 120, 0, L, 4); ell(c, 520, 480, 300, 140, 0, L, 4);
      c.fillStyle = M; c.fillRect(0, 410, 640, 70); line(c, 0, 410, 640, 410, 4);
      sunface(c, 80, 80, 40, t);
      cloud(c, 560, 70, 0.7, W);
      [[150, 215, 0], [320, 175, 1.2], [490, 225, 2.4]].forEach(([bx, hy, ph], i) => {
        const sw = Math.sin((t / 1.2) * TAU + ph) * 46, bob = Math.abs(Math.sin((t / 0.4) * Math.PI)) * 10;
        const hx = bx + sw, y = hy - bob, mx = bx - sw * 0.2, my = 330;
        c.beginPath(); c.moveTo(bx, 412); c.quadraticCurveTo(bx - sw * 0.6, 330, hx, y);
        c.lineWidth = 8; c.strokeStyle = K; c.stroke();
        for (const g of [-1, 1]) {
          const wave = Math.sin(t * 7 + i + g) * 22;
          const ex = mx + g * 52, ey = my - 30 + wave * g;
          hose(c, mx, my + 10, ex, ey, 0.25 * g, 6);
          ell(c, ex + g * 6, ey, 16, 8, g * 0.6 + wave * 0.01, M, 3);
        }
        c.save(); c.translate(hx, y); c.rotate(sw * 0.006);
        for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU + t * 0.5; ell(c, Math.cos(a) * 44, Math.sin(a) * 44, 15, 32, a + Math.PI / 2, W, 3); }
        circ(c, 0, 0, 32, L, 4); face(c, 0, 2, 0.95, t, { look: -sw / 46, mouth: i === 1 ? 'grin' : 'smile', blink: (t + i) % 1.6 < 0.12 });
        c.restore();
      });
    },
    sound(A, t0, len) {
      const bar = 1.2, b = bar / 3;
      const mel = [76, 79, 84, 83, 79, 76, 74, 77, 81, 79, 74, 71];
      for (let k = 0; k * b < len; k++) {
        const bi = Math.floor(k / 3) % 2, beat = k % 3, at = t0 + k * b;
        if (beat === 0) A.piano(bi ? 43 : 48, at, 0.4, 0.09);
        else (bi ? [62, 65, 71] : [64, 67, 72]).forEach((m) => A.piano(m, at, 0.2, 0.035));
        A.piano(mel[k % mel.length], at, 0.38, 0.06);
      }
    },
  },
  { // 3 汽車
    name: 'CHOO CHOO EXPRESS',
    draw(c, t) {
      c.fillStyle = W; c.fillRect(0, 0, 640, 480);
      c.save(); c.beginPath(); const o1 = -(t * 50) % 260;
      for (let x = o1 - 130; x < 800; x += 260) { c.moveTo(x - 160, 330); c.quadraticCurveTo(x, 170, x + 160, 330); }
      c.fillStyle = P; c.fill(); c.lineWidth = 4; c.strokeStyle = K; c.stroke(); c.restore();
      c.fillStyle = L; c.fillRect(0, 330, 640, 150); line(c, 0, 330, 640, 330, 4);
      const o2 = -(t * 300) % 44;
      for (let x = o2; x < 660; x += 44) box(c, x, 404, 26, 12, M, 2);
      line(c, 0, 404, 640, 404, 6);
      for (let x = -(t * 300) % 90; x < 660; x += 90) { c.fillStyle = M; c.fillRect(x, 448, 40, 6); }
      const bob = Math.abs(Math.sin(t * Math.PI * 4.2)) * 5;
      c.save(); c.translate(0, -bob);
      for (let k = 0; k < 8; k++) {
        const age = (t * 1.5 + k / 8) % 1, px = 450 - age * 330, py = 196 - age * 150 + Math.sin(age * 9 + k) * 10, r = 12 + age * 42;
        c.globalAlpha = 1 - age * 0.85; circ(c, px, py, r, W, 3); c.globalAlpha = 1;
      }
      box(c, 150, 210, 130, 160, D, 5); box(c, 176, 234, 60, 54, W, 4); box(c, 136, 196, 158, 22, M, 5);
      rbox(c, 270, 262, 230, 108, 40, M, 5);
      for (const bx of [330, 400, 460]) line(c, bx, 264, bx, 368, 3);
      c.beginPath(); c.moveTo(430, 264); c.lineTo(440, 214); c.lineTo(414, 196); c.lineTo(494, 196); c.lineTo(468, 214); c.lineTo(478, 264); c.closePath();
      c.fillStyle = D; c.fill(); c.lineWidth = 5; c.strokeStyle = K; c.stroke();
      ell(c, 372, 258, 22, 16, 0, D, 4);
      c.beginPath(); c.moveTo(500, 330); c.lineTo(560, 392); c.lineTo(490, 392); c.closePath(); c.fillStyle = L; c.fill(); c.stroke();
      circ(c, 512, 314, 52, W, 5); face(c, 512, 314, 1.3, t, { look: 1, mouth: 'grin', blink: t % 1.9 < 0.1 });
      c.restore();
      const a = t * 10;
      [[210, 368, 34], [320, 374, 28], [420, 374, 28]].forEach(([x, y, r]) => {
        circ(c, x, y, r, D, 5);
        for (let k = 0; k < 6; k++) line(c, x, y, x + Math.cos(a + k) * r, y + Math.sin(a + k) * r, 3, W);
        circ(c, x, y, 6, W, 3);
      });
      line(c, 210 + Math.cos(a) * 20, 368 + Math.sin(a) * 20, 420 + Math.cos(a) * 18, 374 + Math.sin(a) * 18, 7, K);
      wtext(c, 'CHOO CHOO!', 210, 70, 50, t, {});
    },
    sound(A, t0, len) {
      for (let k = 0; k * 0.24 < len; k++) A.chuff(t0 + k * 0.24, k % 2 ? 0.08 : 0.13);
      A.whistle(t0 + 0.15, 0.8);
      if (len > 2.2) A.whistle(t0 + 1.4, 0.5);
    },
  },
  { // 4 ピアノの鍵盤
    name: 'RAG-A-MUFFIN RAG',
    draw(c, t) {
      c.fillStyle = K; c.fillRect(0, 0, 640, 480);
      const g = c.createRadialGradient(320, 300, 30, 320, 300, 380); g.addColorStop(0, '#8d806a'); g.addColorStop(1, K);
      c.fillStyle = g; c.fillRect(0, 0, 640, 480);
      const lt = t % RAG.len, kw = 560 / 15, x0 = 40, y0 = 262;
      const down = new Set(RAG.seq.filter((n) => lt >= n.t && lt < n.t + 0.12).map((n) => n.m));
      WHITE.forEach((m, i) => { const d = down.has(m); box(c, x0 + i * kw, y0 + (d ? 7 : 0), kw, 176, d ? L : W, 3); });
      BLACK_AFTER.forEach((i) => box(c, x0 + (i + 1) * kw - kw * 0.3, y0, kw * 0.6, 104, K, 2));
      box(c, 30, y0 - 22, 580, 24, D, 4);
      const kx = (m) => { const i = WHITE.indexOf(m); return i < 0 ? null : x0 + i * kw + kw / 2; };
      RAG.seq.forEach((n) => {
        const age = lt - n.t, x = kx(n.m);
        if (n.h !== 1 || age < 0 || age > 0.9 || x == null) return;
        c.globalAlpha = 1 - age / 0.9; note(c, x + Math.sin(age * 8) * 8, 230 - age * 170, 1, W); c.globalAlpha = 1;
      });
      for (const h of [1, 0]) {
        const last = RAG.seq.filter((n) => n.h === h && n.t <= lt && kx(n.m) != null && (h || n.m < 70)).pop();
        const nx = last ? kx(last.m) : h ? 420 : 200, age = last ? lt - last.t : 1;
        const hy = 226 - Math.min(1, age * 6) * 26 + (age < 0.05 ? 10 : 0);
        hose(c, h ? 640 : 0, 120, nx, hy - 12, h ? -0.25 : 0.25, 8);
        glove(c, nx, hy, 2, Math.PI / 2, false);
      }
      c.beginPath(); c.moveTo(70, 40); c.lineTo(570, 40); c.lineTo(600, 72); c.lineTo(570, 104); c.lineTo(70, 104); c.lineTo(40, 72); c.closePath();
      c.fillStyle = W; c.fill(); c.lineWidth = 5; c.strokeStyle = K; c.stroke();
      wtext(c, 'RAG-A-MUFFIN RAG', 320, 74, 40, t, { fill: K, stroke: null, wob: 0.6 });
    },
    sound(A, t0, len) {
      for (let r = 0; r * RAG.len < len; r++) RAG.seq.forEach((n) => { const at = r * RAG.len + n.t; if (at < len) A.piano(n.m, t0 + at, n.d + 0.1, n.h ? 0.08 : n.m < 55 ? 0.09 : 0.035); });
    },
  },
  { // 5 ニュース（回る新聞＋字幕帯）
    name: 'NEWS FLASH',
    draw(c, t) {
      rays(c, 320, 210, 18, t * 0.7, L, P);
      const k = eo(t / 0.9), s = 0.06 + 0.94 * k, rot = (1 - k) * TAU * 3;
      c.save(); c.translate(320, 205); c.rotate(rot); c.scale(s, s);
      c.fillStyle = 'rgba(23,18,12,.4)'; c.fillRect(-200, -138, 420, 300);
      box(c, -210, -150, 420, 300, W, 5);
      c.font = `900 26px ${SERIF}`; c.fillStyle = K; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('THE EVENING HUBBUB', 0, -122);
      line(c, -194, -102, 194, -102, 3); line(c, -194, -96, 194, -96, 1.5);
      wtext(c, 'EXTRA! EXTRA!', 0, -60, 40, t, { fill: K, stroke: null, wob: 0.4 });
      c.font = `700 20px ${SERIF}`; c.fillStyle = K; c.fillText('EVERYTHING HAPPENS AT ONCE', 0, -18);
      box(c, -192, 6, 150, 126, M, 3); circ(c, -117, 70, 34, P, 3); face(c, -117, 72, 0.8, t, { mouth: 'o', lookY: -1 });
      for (let i = 0; i < 9; i++) { const ln = 150 + rnd(i) * 70; c.fillStyle = D; c.fillRect(-26, 12 + i * 13, Math.min(ln, 216), 5); }
      c.restore();
      if (t > 0.9) { c.globalAlpha = clamp((t - 0.9) * 5); starburst(c, 560, 330, 58, 38, 14, t * 2, W, 4); wtext(c, 'NEW!', 560, 330, 30, t, { fill: K, stroke: null }); c.globalAlpha = 1; }
      box(c, 0, 408, 640, 56, K, 0);
      line(c, 0, 410, 640, 410, 3, W);
      const msg = '★ BULLETIN ★ A MILLION NEW THINGS TODAY ★ READ ALL ABOUT IT ★ MORE COMING ★ ';
      c.font = `900 26px ${SERIF}`; c.textAlign = 'left'; c.fillStyle = W;
      const mw = c.measureText(msg).width, ox = 640 - ((t * 280) % (mw + 0));
      c.fillText(msg, ox, 437); c.fillText(msg, ox - mw, 437); c.fillText(msg, ox + mw, 437);
      if (Math.floor(t * 4) % 2 === 0) { box(c, 16, 16, 150, 40, K, 0); wtext(c, 'NEWS FLASH', 91, 37, 22, t, { fill: W, stroke: null, wob: 0 }); }
    },
    sound(A, t0) {
      [[67, 0, 0.14], [72, 0.15, 0.14], [76, 0.3, 0.14], [79, 0.45, 0.42], [76, 0.9, 0.14], [79, 1.05, 0.6]].forEach(([m, at, d]) => {
        A.brass(m, t0 + at, d, 0.09); A.brass(m - 12, t0 + at, d, 0.05);
      });
    },
    sound2(A, t0, len) { for (let x = 1.0; x < len; x += 0.055) if (rnd(x * 91) > 0.25) A.click(t0 + x); },
  },
  { // 6 天気図
    name: 'WEATHER-O-RAMA',
    draw(c, t) {
      c.fillStyle = P; c.fillRect(0, 0, 640, 480);
      c.setLineDash([6, 8]); for (let x = 40; x < 640; x += 80) line(c, x, 60, x, 480, 1.5, 'rgba(23,18,12,.35)');
      for (let y = 100; y < 480; y += 70) line(c, 0, y, 640, y, 1.5, 'rgba(23,18,12,.35)'); c.setLineDash([]);
      c.save(); c.translate(300, 285); c.beginPath();
      LAND.forEach(([x, y], i) => { const [nx, ny] = LAND[(i + 1) % LAND.length]; if (!i) c.moveTo((x + nx) / 2, (y + ny) / 2); c.quadraticCurveTo(nx, ny, (nx + LAND[(i + 2) % LAND.length][0]) / 2, (ny + LAND[(i + 2) % LAND.length][1]) / 2); });
      c.closePath(); c.fillStyle = L; c.fill(); c.lineWidth = 4; c.strokeStyle = K; c.stroke(); c.restore();
      for (const [x, y] of [[60, 150], [560, 420], [600, 160], [80, 430]]) { c.beginPath(); for (let k = 0; k < 3; k++) { c.moveTo(x + k * 14, y); c.quadraticCurveTo(x + k * 14 + 7, y - 7, x + k * 14 + 14, y); } c.lineWidth = 2.5; c.strokeStyle = M; c.stroke(); }
      c.setLineDash([10, 6]); for (const r of [54, 86]) ell(c, 210, 230, r * 1.2, r * 0.8, 0.2, null, 2); c.setLineDash([]);
      circ(c, 210, 230, 30, W, 4); wtext(c, 'HI', 210, 231, 26, t, { fill: K, stroke: null, wob: 0.3 });
      circ(c, 440, 330, 30, W, 4); wtext(c, 'LO', 440, 331, 26, t, { fill: K, stroke: null, wob: 0.3 });
      sunface(c, 170, 360, 34, t);
      const cy = 180 + Math.sin(t * 3) * 6;
      for (let k = 0; k < 7; k++) { const ry = cy + 30 + ((t * 220 + k * 37) % 90); line(c, 400 + k * 14 - 40, ry, 396 + k * 14 - 40, ry + 12, 3); }
      cloud(c, 430, cy, 0.85, W);
      if ((t * 2.5) % 1 < 0.2) { c.beginPath(); c.moveTo(470, cy + 20); c.lineTo(448, cy + 70); c.lineTo(466, cy + 70); c.lineTo(444, cy + 120); c.lineTo(492, cy + 58); c.lineTo(472, cy + 58); c.lineTo(490, cy + 20); c.closePath(); c.fillStyle = W; c.fill(); c.lineWidth = 3; c.strokeStyle = K; c.stroke(); }
      const pts = [[210, 230], [430, 180], [170, 360], [440, 330]], seg = t / 0.55, i = Math.floor(seg) % 4, j = (i + 1) % 4, e = eo((seg % 1) * 2);
      const px = pts[i][0] + (pts[j][0] - pts[i][0]) * e, py = pts[i][1] + (pts[j][1] - pts[i][1]) * e;
      line(c, 660, 520, px + 30, py + 30, 9, K); line(c, 660, 520, px + 30, py + 30, 4, M);
      glove(c, px + 26, py + 26, 1.3, Math.atan2(py - 520, px - 660), true);
      wtext(c, ['SUN?', 'RAIN!', 'WIND?', 'SNOW!'][i], px + 70, py - 40, 28, t, { rot: -0.1 });
      box(c, 0, 0, 640, 60, D, 0); line(c, 0, 60, 640, 60, 4);
      wtext(c, 'WEATHER-O-RAMA', 320, 32, 36, t, { fill: W, stroke: K });
    },
    sound(A, t0, len) {
      for (let k = 0; k * 0.55 < len; k++) { A.slide(t0 + k * 0.55, k % 2 ? 1400 : 500, k % 2 ? 500 : 1400, 0.4); A.xylo([84, 88, 91, 86][k % 4], t0 + k * 0.55 + 0.27); }
    },
  },
  { // 7 ボクシング
    name: 'PUNCH PARADE',
    draw(c, t) {
      c.fillStyle = K; c.fillRect(0, 0, 640, 480);
      CROWD.forEach(([x, y, r], i) => { circ(c, x, y + Math.sin(t * 10 + i) * 3, r, D, 0); });
      c.fillStyle = L; c.beginPath(); c.moveTo(0, 330); c.lineTo(640, 330); c.lineTo(640, 480); c.lineTo(0, 480); c.fill();
      line(c, 0, 330, 640, 330, 4);
      box(c, 20, 170, 22, 200, M, 4); box(c, 598, 170, 22, 200, M, 4);
      const T = 0.5, k = Math.floor(t / T), p = (t % T) / T, side = k % 2 ? 1 : -1;
      const ext = p < 0.32 ? eo(p / 0.32) : 1 - eo((p - 0.32) / 0.68);
      const shake = Math.max(0, 1 - Math.abs(p - 0.32) * 4);
      [200, 245, 290].forEach((y, i) => {
        const w = Math.sin(t * 30 + i) * 10 * shake;
        c.beginPath(); c.moveTo(30, y); c.quadraticCurveTo(320, y + 18 + w, 610, y); c.lineWidth = 11; c.strokeStyle = K; c.stroke(); c.lineWidth = 5; c.strokeStyle = W; c.stroke();
      });
      if (ext > 0.75) { starburst(c, 320 + side * 10, 220, 120, 64, 12, k, W, 5); wtext(c, k % 3 === 0 ? 'POW!' : k % 3 === 1 ? 'BAM!' : 'WHAP!', 320 - side * 40, 150, 50, t, { fill: W, stroke: K, rot: side * 0.12 }); }
      for (const g of [-1, 1]) {
        const e = g === side ? ext : 0.05 * Math.sin(t * 9);
        const bx = 320 + g * (250 - e * 170), by = 240 + Math.sin(t * 6 + g) * 12;
        hose(c, 320 + g * 360, 380, bx + g * 40, by + 10, 0.2 * g, 16, K);
        c.save(); c.translate(bx, by); c.scale(-g, 1);
        rbox(c, 18, -26, 34, 52, 8, M, 4);
        for (let k2 = 0; k2 < 3; k2++) line(c, 24, -16 + k2 * 14, 46, -10 + k2 * 14, 2);
        ell(c, -14, 0, 56, 48, 0, D, 5); ell(c, -6, -34, 24, 15, -0.4, D, 4);
        c.beginPath(); c.arc(-26, 4, 28, -1, 1); c.lineWidth = 3; c.stroke();
        ell(c, -36, -18, 14, 8, -0.5, 'rgba(241,230,205,.75)', 0);
        c.restore();
      }
      circ(c, 320, 46, 26, L, 4); line(c, 320, 8, 320, 20, 4);
      if (t < 0.5) { const s = Math.sin(t * 60) * 0.3; c.save(); c.translate(320, 46); c.rotate(s); line(c, -36, -16, -46, -24, 3, W); line(c, 36, -16, 46, -24, 3, W); c.restore(); }
    },
    sound(A, t0, len) {
      A.bell(1100, t0, 1.2, 0.08); A.bell(1100, t0 + 0.28, 1.4, 0.08);
      for (let k = 0; k * 0.5 + 0.16 < len; k++) A.punch(t0 + k * 0.5 + 0.16);
      A.crowd(t0, len);
    },
  },
  { // 8 テレビの中のテレビ（無限ズーム）
    name: 'TV IN TV',
    draw(c, t) {
      c.fillStyle = M; c.fillRect(0, 0, 640, 480);
      c.fillStyle = 'rgba(23,18,12,.18)'; for (let y = 0; y < 480; y += 24) for (let x = (y / 24) % 2 * 24; x < 640; x += 48) c.fillRect(x, y, 6, 6);
      const R = 0.6, z = Math.pow(1 / R, (t * 0.9) % 1);
      c.save(); c.translate(320, 250); c.scale(z, z);
      for (let i = 0; i < 9; i++) {
        const w = 470, h = 350, rot = Math.sin(t * 2 + i) * 0.05;
        c.rotate(rot);
        if (i < 3) { line(c, 0, -h / 2, -90, -h / 2 - 90, 6 / (i + 1)); line(c, 0, -h / 2, 90, -h / 2 - 80, 6 / (i + 1)); circ(c, -90, -h / 2 - 90, 9, K, 0); circ(c, 90, -h / 2 - 80, 9, K, 0); }
        rbox(c, -w / 2, -h / 2, w, h, 36, i % 2 ? L : D, 5);
        rbox(c, -w / 2 + 26, -h / 2 + 24, w * 0.74, h * 0.78, 30, i % 2 ? P : W, 4);
        circ(c, w / 2 - 42, -h / 2 + 80, 18, M, 4); circ(c, w / 2 - 42, -h / 2 + 140, 18, M, 4);
        for (let k = 0; k < 4; k++) line(c, w / 2 - 62, -h / 2 + 190 + k * 16, w / 2 - 22, -h / 2 + 190 + k * 16, 3);
        c.translate(-w / 2 + 26 + w * 0.37, -h / 2 + 24 + h * 0.39); c.scale(R * 0.82, R * 0.82);
      }
      c.beginPath(); for (let a = 0; a < 24; a += 0.2) c.lineTo(Math.cos(a - t * 6) * a * 7, Math.sin(a - t * 6) * a * 7); c.lineWidth = 10; c.strokeStyle = K; c.stroke();
      c.restore();
      wtext(c, 'YOU ARE WATCHING', 320, 50, 40, t, {});
      wtext(c, 'YOU ARE WATCHING', 320, 448, 24, t + 0.3, { wob: 0.5 });
    },
    sound(A, t0, len) {
      [[58, 0, 0.32], [57, 0.4, 0.32], [56, 0.8, 0.32], [55, 1.2, 1.1]].forEach(([m, at, d], i) => { if (at < len) A.trombone(m, t0 + at, Math.min(d, len - at), i === 3); });
    },
  },
  { // 9 通販の口上
    name: 'WONDER GLOW TONIC',
    draw(c, t) {
      rays(c, 320, 250, 22, -t * 0.9, P, W);
      const b = Math.abs(Math.sin(t * Math.PI * 2.4)), sq = b < 0.15 ? 0.9 : 1;
      c.save(); c.translate(330, 400 - b * 24); c.scale(2 - sq, sq);
      ell(c, 0, 4, 90, 12, 0, 'rgba(23,18,12,.3)', 0);
      c.beginPath(); c.moveTo(-22, -290); c.lineTo(22, -290); c.lineTo(22, -240); c.quadraticCurveTo(76, -226, 76, -170); c.lineTo(76, -16); c.quadraticCurveTo(76, 0, 60, 0);
      c.lineTo(-60, 0); c.quadraticCurveTo(-76, 0, -76, -16); c.lineTo(-76, -170); c.quadraticCurveTo(-76, -226, -22, -240); c.closePath();
      c.fillStyle = M; c.fill(); c.lineWidth = 5; c.strokeStyle = K; c.stroke();
      box(c, -26, -316, 52, 30, L, 4);
      c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(-62, -170, 12, 150);
      box(c, -64, -150, 128, 110, W, 4);
      c.font = `900 22px ${SERIF}`; c.fillStyle = K; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('WONDER', 0, -126); c.fillText('GLOW', 0, -98); c.font = `900 18px ${SERIF}`; c.fillText('TONIC', 0, -66);
      c.restore();
      for (let i = 0; i < 6; i++) { const a = i * 1.05 + t, r = 150 + (i % 2) * 30; sparkle(c, 330 + Math.cos(a) * r, 260 + Math.sin(a) * r * 0.7, Math.abs(Math.sin(t * 7 + i)) * 22); }
      starburst(c, 520, 120, 84, 62, 16, t * 1.6, W, 5);
      wtext(c, 'ONLY', 520, 96, 22, t, { fill: K, stroke: null, wob: 0.3 }); wtext(c, '10¢', 520, 134, 46, t, { fill: K, stroke: null, wob: 0.5 });
      const hx = 150 + Math.sin(t * 9) * 10;
      hose(c, -30, 330, hx - 20, 250, -0.15, 14, K);
      box(c, -10, 300, 40, 60, D, 0);
      glove(c, hx, 246, 1.7, -0.1, true);
      box(c, 0, 420, 640, 60, K, 0);
      wtext(c, Math.floor(t * 2.5) % 2 ? 'ACT NOW!' : 'WHILE IT LASTS!', 320, 450, 34, t, { fill: W, stroke: null });
    },
    sound(A, t0, len) {
      const j = [[72, 0], [74, 0.12], [76, 0.24], [79, 0.36], [76, 0.6], [79, 0.72], [84, 0.84]];
      j.forEach(([m, at]) => A.kazoo(m, t0 + at, 0.11));
      A.kazoo(84, t0 + 0.84, 0.35);
      A.register(t0 + 1.3);
      if (len > 2.2) j.slice(0, 4).forEach(([m, at]) => A.kazoo(m + 5, t0 + 1.7 + at, 0.11));
    },
  },
  { // 10 拍手する観客
    name: 'APPLAUSE',
    draw(c, t) {
      c.fillStyle = K; c.fillRect(0, 0, 640, 480);
      const g = c.createRadialGradient(320, 140, 20, 320, 140, 360); g.addColorStop(0, '#6d6250'); g.addColorStop(1, K); c.fillStyle = g; c.fillRect(0, 0, 640, 480);
      const lit = Math.floor(t * 5) % 2 === 0;
      box(c, 150, 46, 340, 96, D, 5);
      for (let i = 0; i < 18; i++) {
        const a = i / 18, on = (i + Math.floor(t * 10)) % 3 !== 0;
        const x = a < 0.5 ? 150 + (a / 0.5) * 340 : 490 - ((a - 0.5) / 0.5) * 340, y = a < 0.5 ? 46 : 142;
        circ(c, x, y, 7, on ? W : M, 2);
      }
      wtext(c, 'APPLAUSE', 320, 96, 52, t, { fill: lit ? W : M, stroke: K, wob: 0.2 });
      for (let r = 0; r < 3; r++) {
        const n = 5 + (2 - r), s = 0.9 + r * 0.3, y = 270 + r * 80;
        for (let i = 0; i < n; i++) {
          const x = (i + 0.5 + (r % 2) * 0.3) * (640 / n) - 20, ph = rnd(i * 7 + r) * TAU, rate = 6 + rnd(i + r * 11) * 4;
          const bob = Math.abs(Math.sin(t * 4 + ph)) * 6 * s, hy = y - 62 * s - bob;
          const gap = 4 + Math.abs(Math.sin(t * rate + ph)) * 20 * s;
          hose(c, x - 26 * s, y + 10, x - gap - 8 * s, hy + 8 * s, 0.2, 6 * s, M);
          hose(c, x + 26 * s, y + 10, x + gap + 8 * s, hy + 8 * s, -0.2, 6 * s, M);
          ell(c, x, y + 46 * s, 44 * s, 40 * s, 0, D, 3);
          circ(c, x, y - bob, 30 * s, r === 2 ? D : M, 3);
          glove(c, x - gap, hy, 0.9 * s, -Math.PI / 2 + 0.3, false);
          glove(c, x + gap, hy, 0.9 * s, -Math.PI / 2 - 0.3, false);
        }
      }
      if (Math.floor(t * 6) % 3 === 0) wtext(c, 'CLAP!', 80 + rnd(Math.floor(t * 6)) * 480, 210, 30, t, { rot: -0.2 });
    },
    sound(A, t0, len) { A.claps(t0, len); A.slide(t0 + 0.4, 1200, 2100, 0.5, 0.04); },
  },
  { // 11 踊る目覚まし時計
    name: 'RING-A-DING',
    draw(c, t) {
      c.fillStyle = P; c.fillRect(0, 0, 640, 480);
      for (let y = 0; y < 2; y++) for (let x = -1; x < 12; x++) { c.fillStyle = (x + y) % 2 ? L : W; c.beginPath(); const y0 = 400 + y * 40, x0 = x * 60 + (y ? -10 : 0); c.moveTo(x0, y0); c.lineTo(x0 + 60, y0); c.lineTo(x0 + 60 - 10, y0 + 40); c.lineTo(x0 - 10, y0 + 40); c.fill(); }
      line(c, 0, 400, 640, 400, 4);
      const ring = t % 1.2 > 0.6, sh = ring ? (rnd(Math.floor(t * 24)) - 0.5) * 10 : 0;
      const step = Math.sin(t * TAU * 1.6), cx = 320 + sh, cy = 220 - Math.abs(step) * 14;
      for (const g of [-1, 1]) {
        const lift = Math.max(0, g * step), fx = cx + g * 60 + g * lift * 40, fy = 410 - lift * 60;
        hose(c, cx + g * 34, cy + 100, fx, fy - 8, 0.25 * g, 9);
        ell(c, fx + g * 16, fy, 30, 13, g * lift * 0.3, K, 0);
      }
      for (const g of [-1, 1]) {
        const wv = Math.sin(t * 8 + g) * 30;
        hose(c, cx + g * 100, cy, cx + g * 170, cy - 40 + wv * g, -0.3 * g, 8);
        glove(c, cx + g * 176, cy - 42 + wv * g, 1.4, g > 0 ? -0.5 : Math.PI + 0.5, false);
      }
      const ba = ring ? Math.sin(t * 70) * 0.25 : 0;
      for (const g of [-1, 1]) { c.save(); c.translate(cx + g * 64, cy - 96); c.rotate(g * 0.5 + ba); ell(c, 0, 0, 34, 26, 0, M, 5); line(c, 0, 26, 0, 40, 5); c.restore(); }
      c.save(); c.translate(cx, cy - 116); c.rotate(ring ? Math.sin(t * 70) * 0.6 : 0); line(c, 0, 0, 0, -26, 5); circ(c, 0, -30, 8, K, 0); c.restore();
      circ(c, cx, cy, 108, M, 6); circ(c, cx, cy, 92, W, 4);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; line(c, cx + Math.cos(a) * 78, cy + Math.sin(a) * 78, cx + Math.cos(a) * 88, cy + Math.sin(a) * 88, k % 3 ? 2 : 5); }
      face(c, cx, cy - 22, 1.2, t, { look: Math.sin(t * 3), mouth: ring ? 'o' : 'grin' });
      line(c, cx, cy + 38, cx + Math.cos(t * 6) * 40, cy + 38 + Math.sin(t * 6) * 40, 5);
      line(c, cx, cy + 38, cx + Math.cos(t * 0.5) * 26, cy + 38 + Math.sin(t * 0.5) * 26, 7);
      circ(c, cx, cy + 38, 5, K, 0);
      if (ring) {
        for (const g of [-1, 1]) for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + g * (0.6 + k * 0.3); line(c, cx + g * 64 + Math.cos(a) * 50, cy - 100 + Math.sin(a) * 50, cx + g * 64 + Math.cos(a) * 70, cy - 100 + Math.sin(a) * 70, 4); }
        wtext(c, 'RING-A-DING!', 320, 50, 46, t, {});
      } else wtext(c, 'TICK... TOCK...', 320, 50, 34, t, { wob: 0.4 });
    },
    sound(A, t0, len) {
      for (let x = 0; x < len; x += 0.15) {
        const ring = x % 1.2 > 0.6;
        if (ring) { for (let y = 0; y < 0.15; y += 0.045) A.bell(2300, t0 + x + y, 0.12, 0.035); }
        else if (Math.round(x / 0.15) % 2 === 0) A.wood(t0 + x, Math.round(x / 0.3) % 2 ? 900 : 1250);
      }
    },
  },
  { // 12 しばらくお待ちください
    name: 'PLEASE STAND BY',
    draw(c, t) {
      c.fillStyle = M; c.fillRect(0, 0, 640, 480);
      [K, D, M, L, P, W].forEach((col, i) => { box(c, 20, 40 + i * 66, 56, 66, col, 2); box(c, 564, 40 + i * 66, 56, 66, [W, P, L, M, D, K][i], 2); });
      for (let k = -6; k <= 6; k++) { line(c, 320 + k * 10, 0, 320 + k * 3, 60, 2); line(c, 320 + k * 10, 480, 320 + k * 3, 420, 2); }
      circ(c, 320, 240, 186, L, 5); circ(c, 320, 240, 146, null, 3); circ(c, 320, 240, 104, P, 3);
      line(c, 134, 240, 506, 240, 2); line(c, 320, 54, 320, 426, 2);
      for (let k = 0; k < 16; k++) { const a = (k / 16) * TAU; line(c, 320 + Math.cos(a) * 150, 240 + Math.sin(a) * 150, 320 + Math.cos(a) * 182, 240 + Math.sin(a) * 182, 3); }
      circ(c, 320, 180, 40, W, 4); face(c, 320, 182, 0.9, t, { blink: t % 1.4 < 0.15, mouth: 'smile', look: Math.sin(t * 1.3) });
      box(c, 120, 222, 400, 56, K, 0);
      wtext(c, 'PLEASE STAND BY', 320, 251, 36, t, { fill: W, stroke: null, wob: 0.3 });
      wtext(c, "WE'LL BE RIGHT BACK", 320, 320, 20, t, { fill: K, stroke: null, wob: 0.2 });
    },
    sound(A, t0, len) { A.tone(t0 + 0.05, len - 0.15); },
  },
];

// ---------- 音 ----------
function makeAudio(o, level) {
  const { ctx: ac, sfx, verb, nbuf } = o;
  const bus = ac.createGain();
  const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 170;
  const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4300;
  const sh = ac.createWaveShaper(); const cv = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; cv[i] = Math.tanh(x * 1.8) / Math.tanh(1.8); }
  sh.curve = cv;
  const lvl = ac.createGain(); lvl.gain.value = level * GAIN;
  const send = ac.createGain(); send.gain.value = 0.18;
  bus.connect(hp); hp.connect(sh); sh.connect(lp); lp.connect(lvl); lvl.connect(sfx); lvl.connect(send); send.connect(verb);
  const env = (g, t, a, v, d) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  const osc = (type, f, t, end, to) => { const x = ac.createOscillator(); x.type = type; x.frequency.value = f; x.connect(to); x.start(t); x.stop(end); return x; };
  const noise = (t, d, type, f, q, v, rate = 1) => {
    const s = ac.createBufferSource(); s.buffer = nbuf; s.playbackRate.value = rate;
    const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ac.createGain(); s.connect(fl); fl.connect(g); g.connect(bus);
    env(g, t, 0.003, v, d); s.start(t, Math.random() * 1.5); s.stop(t + d + 0.05);
    return fl;
  };
  const A = {
    ctx: ac, lvl,
    static(t) { noise(t, 0.17, 'bandpass', 2600, 0.35, 0.22, 1.3); noise(t + 0.02, 0.1, 'highpass', 5000, 0.7, 0.08); },
    piano(m, t, d = 0.35, v = 0.08) {
      const g = ac.createGain(); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(v * 0.35, t + 0.09); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      const f = mtof(m);
      [['triangle', 0, 1], ['triangle', 11, 0.7], ['square', -6, 0.1]].forEach(([ty, dt, a]) => {
        const og = ac.createGain(); og.gain.value = a; og.connect(g); osc(ty, f, t, t + d + 0.05, og).detune.value = dt;
      });
    },
    boing(t, f) {
      const g = ac.createGain(); g.connect(bus); env(g, t, 0.006, 0.16, 0.5);
      const x = osc('sine', f * 2.4, t, t + 0.6, g); x.frequency.exponentialRampToValueAtTime(f, t + 0.12); x.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.5);
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 22; lg.gain.setValueAtTime(f * 0.35, t); lg.gain.exponentialRampToValueAtTime(1, t + 0.5);
      l.connect(lg); lg.connect(x.frequency); l.start(t); l.stop(t + 0.6);
    },
    brass(m, t, d, v = 0.08) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 2;
      fl.frequency.setValueAtTime(500, t); fl.frequency.linearRampToValueAtTime(2600, t + 0.05); fl.frequency.exponentialRampToValueAtTime(1100, t + d);
      const g = ac.createGain(); fl.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v * 0.8, t + d); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.12);
      [-7, 7].forEach((dt) => { osc('sawtooth', mtof(m), t, t + d + 0.15, fl).detune.value = dt; });
    },
    click(t) { noise(t, 0.012, 'highpass', 3000 + Math.random() * 2000, 1, 0.1); },
    whistle(t, d) {
      const g = ac.createGain(); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.06); g.gain.setValueAtTime(0.06, t + d - 0.1); g.gain.linearRampToValueAtTime(0, t + d);
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 6; lg.gain.value = 8; l.connect(lg); l.start(t); l.stop(t + d);
      [74, 77, 81].forEach((m) => { const x = osc('triangle', mtof(m) * 0.985, t, t + d, g); x.frequency.linearRampToValueAtTime(mtof(m), t + 0.12); lg.connect(x.frequency); });
      noise(t, d, 'bandpass', 2200, 2, 0.05);
    },
    chuff(t, v) { noise(t, 0.12, 'lowpass', 1100, 0.7, v, 0.6); noise(t, 0.05, 'highpass', 4000, 0.7, v * 0.4); },
    slide(t, f1, f2, d, v = 0.07) {
      const g = ac.createGain(); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.03); g.gain.setValueAtTime(v, t + d - 0.05); g.gain.linearRampToValueAtTime(0, t + d);
      const x = osc('sine', f1, t, t + d + 0.02, g); x.frequency.exponentialRampToValueAtTime(f2, t + d);
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 7; lg.gain.value = f1 * 0.02; l.connect(lg); lg.connect(x.frequency); l.start(t); l.stop(t + d);
    },
    xylo(m, t) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, 0.08, 0.3); osc('sine', mtof(m), t, t + 0.35, g); const g2 = ac.createGain(); g2.connect(bus); env(g2, t, 0.002, 0.03, 0.06); osc('sine', mtof(m) * 3.9, t, t + 0.1, g2); },
    bell(f, t, d, v) {
      [[1, 1], [2.4, 0.5], [3.9, 0.3], [5.4, 0.18]].forEach(([r, a]) => { const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, v * a, d / r); osc('sine', f * r, t, t + d / r + 0.05, g); });
    },
    punch(t) {
      const g = ac.createGain(); g.connect(bus); env(g, t, 0.003, 0.25, 0.18);
      const x = osc('sine', 150, t, t + 0.22, g); x.frequency.exponentialRampToValueAtTime(45, t + 0.18);
      noise(t, 0.08, 'lowpass', 1800, 0.8, 0.2);
    },
    crowd(t, d) {
      const s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true;
      const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = 650; fl.Q.value = 0.6;
      const g = ac.createGain(); s.connect(fl); fl.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.3); g.gain.setValueAtTime(0.06, t + d - 0.2); g.gain.linearRampToValueAtTime(0, t + d);
      s.start(t); s.stop(t + d + 0.05);
    },
    trombone(m, t, d, vib) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 6;
      fl.frequency.setValueAtTime(350, t); fl.frequency.linearRampToValueAtTime(1500, t + 0.12); fl.frequency.exponentialRampToValueAtTime(400, t + d);
      const g = ac.createGain(); fl.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.05); g.gain.setValueAtTime(0.14, t + d - 0.08); g.gain.linearRampToValueAtTime(0, t + d);
      const x = osc('sawtooth', mtof(m), t, t + d, fl);
      if (vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 5; lg.gain.value = 0; lg.gain.linearRampToValueAtTime(5, t + d); l.connect(lg); lg.connect(x.frequency); l.start(t); l.stop(t + d); x.frequency.setValueAtTime(mtof(m), t + d * 0.6); x.frequency.exponentialRampToValueAtTime(mtof(m) * 0.94, t + d); }
    },
    kazoo(m, t, d) {
      const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 1100; f1.Q.value = 2.5;
      const g = ac.createGain(); f1.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.02); g.gain.setValueAtTime(0.14, t + d - 0.02); g.gain.linearRampToValueAtTime(0, t + d);
      const x = osc('sawtooth', mtof(m), t, t + d + 0.02, f1);
      const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = 7; lg.gain.value = 6; l.connect(lg); lg.connect(x.frequency); l.start(t); l.stop(t + d);
    },
    register(t) { noise(t, 0.05, 'bandpass', 2500, 1, 0.15); A.bell(2640, t + 0.08, 1.0, 0.05); A.bell(3520, t + 0.08, 1.0, 0.04); },
    claps(t, d) {
      for (let x = 0; x < d; x += 0.012 + Math.random() * 0.03) {
        const v = 0.05 * Math.min(1, x / 0.3) * Math.min(1, (d - x) / 0.3) + 0.01;
        noise(t + x, 0.03 + Math.random() * 0.03, 'bandpass', 900 + Math.random() * 1200, 0.9, v * (0.6 + Math.random()));
      }
    },
    wood(t, f) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.001, 0.12, 0.06); osc('sine', f, t, t + 0.08, g); noise(t, 0.015, 'bandpass', f * 2, 3, 0.06); },
    tone(t, d) {
      const g = ac.createGain(); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.045, t + 0.05); g.gain.setValueAtTime(0.045, t + d - 0.05); g.gain.linearRampToValueAtTime(0, t + d);
      osc('sine', 880, t, t + d + 0.02, g);
    },
  };
  return A;
}

// ---------- フィルムの質感 ----------
function noiseTile(w, h, aMax) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d'), im = g.createImageData(w, h), d = im.data;
  for (let i = 0; i < w * h; i++) {
    const v = (Math.random() * 255) | 0; d[i * 4] = v; d[i * 4 + 1] = v * 0.96; d[i * 4 + 2] = v * 0.86;
    d[i * 4 + 3] = aMax >= 255 ? 255 : (Math.random() * aMax) | 0;
  }
  g.putImageData(im, 0, 0); return cv;
}
function vignette() {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d');
  const r = g.createRadialGradient(320, 240, 150, 320, 240, 430);
  r.addColorStop(0, 'rgba(12,9,5,0)'); r.addColorStop(0.6, 'rgba(12,9,5,.22)'); r.addColorStop(1, 'rgba(12,9,5,.85)');
  g.fillStyle = r; g.fillRect(0, 0, 640, 480);
  g.fillStyle = 'rgba(0,0,0,.10)'; for (let y = 0; y < 480; y += 3) g.fillRect(0, y, 640, 1);
  return cv;
}

export function createTVShow({ width = 640, height = 480 } = {}) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d', { alpha: false });
  const SX = width / 640, SY = height / 480;
  const grain = [0, 1, 2, 3].map(() => noiseTile(400, 300, 70));
  const snow = [0, 1, 2].map(() => noiseTile(214, 160, 255));
  const vig = vignette();
  const SW = 0.17;                       // 切り替えの砂嵐の長さ（秒）
  let level = 1, A = null, disposed = false;
  let cur = -1, start = 0, len = 2, iris = { open: false, close: false }, chan = 3, bag = [];
  let scratches = [], lastF = -1, fx = { ox: 0, oy: 0, fl: 0 };

  function audio() {
    const o = window.SND?.out?.();
    if (!o || disposed) return null;
    if (!A || A.ctx !== o.ctx) A = makeAudio(o, level);
    return A;
  }
  function pick() {
    if (!bag.length) { bag = PROGRAMS.map((_, i) => i).sort(() => Math.random() - 0.5); if (bag[0] === cur) bag.push(bag.shift()); }
    return bag.shift();
  }
  function next(t) {
    cur = pick(); start = t; len = 1.5 + Math.random() * 1.5;
    iris = { open: Math.random() < 0.35, close: Math.random() < 0.3 };
    chan = 2 + ((chan + 1 + ((Math.random() * 3) | 0)) % 12);
    const a = audio();
    if (a) {
      const t0 = a.ctx.currentTime;
      a.static(t0);
      const p = PROGRAMS[cur];
      p.sound(a, t0 + 0.04, len - 0.04);
      if (p.sound2) p.sound2(a, t0 + 0.04, len - 0.04);
    }
  }
  function film(t, still) {
    const f = Math.floor(t * 24);
    if (f !== lastF) {
      lastF = f;
      fx = { ox: (Math.random() - 0.5) * 2.5, oy: (Math.random() - 0.5) * 3.5, fl: Math.random(), g: (Math.random() * 4) | 0, gx: Math.random() * 80, gy: Math.random() * 60 };
      if (Math.random() < 0.12) scratches.push({ x: Math.random() * 640, life: 3 + ((Math.random() * 10) | 0), w: 1 + Math.random() * 1.5, light: Math.random() < 0.7, dx: (Math.random() - 0.5) * 3 });
      scratches = scratches.filter((s) => --s.life > 0);
      scratches.forEach((s) => { s.x += s.dx; });
      fx.dust = Math.random() < 0.45 ? Array.from({ length: 1 + ((Math.random() * 3) | 0) }, () => [Math.random() * 640, Math.random() * 480, 1 + Math.random() * 3.5, Math.random() < 0.6]) : [];
      fx.hair = Math.random() < 0.04 ? [Math.random() * 640, Math.random() * 480, Math.random() * TAU] : null;
    }
    c.drawImage(grain[fx.g], fx.gx, fx.gy, 320, 240, 0, 0, 640, 480);
    fx.dust.forEach(([x, y, r, dark]) => circ(c, x, y, r, dark ? 'rgba(18,14,9,.85)' : 'rgba(250,242,225,.8)', 0));
    if (fx.hair) { const [x, y, a] = fx.hair; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30, x + 40, y - 20, x + Math.cos(a + 1) * 60, y + Math.sin(a + 1) * 60); c.lineWidth = 1.2; c.strokeStyle = 'rgba(18,14,9,.7)'; c.stroke(); }
    if (!still) scratches.forEach((s) => { c.beginPath(); c.moveTo(s.x, 0); c.lineTo(s.x + 2, 160); c.lineTo(s.x - 1, 330); c.lineTo(s.x + 1, 480); c.lineWidth = s.w; c.strokeStyle = s.light ? 'rgba(245,236,215,.45)' : 'rgba(20,15,10,.4)'; c.stroke(); });
    c.fillStyle = fx.fl < 0.6 ? `rgba(10,7,4,${0.03 + fx.fl * 0.1})` : `rgba(255,240,212,${(fx.fl - 0.6) * 0.12})`;
    c.fillRect(0, 0, 640, 480);
  }
  function irisMask(r) {
    c.fillStyle = K; c.beginPath(); c.rect(0, 0, 640, 480); c.arc(320, 240, Math.max(0, r), 0, TAU, true); c.fill();
    c.beginPath(); c.arc(320, 240, Math.max(0, r), 0, TAU); c.lineWidth = 3; c.strokeStyle = 'rgba(80,70,55,.6)'; c.stroke();
  }
  function frame(p, lt, t, still) {
    c.setTransform(SX, 0, 0, SY, 0, 0);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save();
    c.translate(320 + (still ? 0 : fx.ox), 240 + (still ? 0 : fx.oy)); c.scale(1.02, 1.02); c.translate(-320, -240);
    PROGRAMS[p].draw(c, Math.floor(lt * 12) / 12, len);
    c.restore();
    c.setTransform(SX, 0, 0, SY, 0, 0);
    film(t, still);
  }

  function update(t /* , dt */) {
    if (disposed) return;
    if (cur < 0 || t < start || t - start >= len) next(t);
    const lt = t - start;
    frame(cur, lt, t, false);
    if (iris.open && lt < 0.4) irisMask(eo(lt / 0.4) * 420);
    const rem = len - lt;
    if (iris.close && rem < 0.32) irisMask(eo(rem / 0.32) * 420);
    // 切り替え直後：砂嵐＋横ずれ
    if (lt < SW) {
      const k = lt / SW;
      c.setTransform(1, 0, 0, 1, 0, 0);
      for (let i = 0; i < 7; i++) {
        const y = Math.random() * height, h = 8 + Math.random() * 50, dx = (Math.random() - 0.5) * 140 * (1 - k);
        c.drawImage(canvas, 0, y, width, h, dx, y, width, h);
      }
      c.setTransform(SX, 0, 0, SY, 0, 0);
      c.imageSmoothingEnabled = false;
      c.globalAlpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
      c.drawImage(snow[(Math.random() * 3) | 0], 0, 0, 640, 480);
      c.globalAlpha = 1; c.imageSmoothingEnabled = true;
      c.fillStyle = 'rgba(255,248,230,.35)'; c.fillRect(0, (k * 900) % 480, 640, 26);
    }
    c.drawImage(vig, 0, 0);
    // チャンネル番号（つまみの札）
    if (lt < 0.8) {
      c.globalAlpha = lt < 0.6 ? 1 : 1 - (lt - 0.6) / 0.2;
      circ(c, 586, 54, 30, 'rgba(241,230,205,.92)', 3);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; line(c, 586 + Math.cos(a) * 24, 54 + Math.sin(a) * 24, 586 + Math.cos(a) * 28, 54 + Math.sin(a) * 28, 1.5); }
      c.font = `900 24px ${SERIF}`; c.fillStyle = K; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(chan), 586, 55);
      c.globalAlpha = 1;
    }
  }

  return {
    canvas,
    update,
    setLevel(x) {
      level = clamp(+x || 0);
      if (A) A.lvl.gain.setTargetAtTime(level * GAIN, A.ctx.currentTime, 0.08);
    },
    get now() { return cur >= 0 ? PROGRAMS[cur].name : ''; },
    programs: PROGRAMS.map((p) => p.name),
    // 確認用：番組 i の lt 秒目の1コマを描く（切り替え・アイリスなし）
    renderStill(i, lt = 1) { len = 3; frame(i, lt, lt, true); c.drawImage(vig, 0, 0); },
    dispose() {
      disposed = true;
      if (A) { try { A.lvl.disconnect(); } catch (e) { /* 既に外れている */ } A = null; }
    },
  };
}
