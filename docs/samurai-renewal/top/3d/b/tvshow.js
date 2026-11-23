// 場面3のテレビに流す「番組」。ジャンル5種（白黒カートゥーン／70〜80年代カラー／今どき／アニメ調／ニュース）を 2D canvas に描き、音は WebAudio で合成する。
// 絵も音もすべてこのファイルの中で作る（外部の画像・音源ファイルは使わない）。
//
// 使い方：
//   const tv = createTVShow({ width: 640, height: 480, genre: 'cartoon' });   // genre: cartoon / color / modern / anime / news
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

// ================= ここから カートゥーン以外のジャンル =================
const JP = '"Hiragino Sans","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
const SANS = '"Helvetica Neue",Helvetica,Arial,sans-serif';
const MONO = 'Menlo,Consolas,"Courier New",monospace';
function txt(c, s, x, y, size, fill, o = {}) {
  const { font = SANS, weight = '800', align = 'center', stroke = null, lw = 0, italic = false, shadow = null, outer = null } = o;
  c.font = `${italic ? 'italic ' : ''}${weight} ${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
  if (shadow) { c.fillStyle = shadow[0]; c.fillText(s, x + shadow[1], y + shadow[2]); }
  if (outer) { c.lineWidth = outer[1]; c.strokeStyle = outer[0]; c.strokeText(s, x, y); }
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.strokeText(s, x, y); }
  c.fillStyle = fill; c.fillText(s, x, y);
}
function rf(c, x, y, w, h, r, fill, stroke = null, lw = 2) {
  c.beginPath(); c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}
function dot(c, x, y, r, fill) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); c.fillStyle = fill; c.fill(); }
function vgrad(c, y0, y1, stops) { const g = c.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
function fillAll(c, f) { c.fillStyle = f; c.fillRect(0, 0, 640, 480); }
function poly(c, pts, fill, stroke = null, lw = 2) {
  c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath();
  if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); }
}
function heart(c, x, y, s, fill) {
  c.save(); c.translate(x, y); c.scale(s, s); c.beginPath(); c.moveTo(0, 6);
  c.bezierCurveTo(-14, -4, -10, -16, 0, -9); c.bezierCurveTo(10, -16, 14, -4, 0, 6); c.fillStyle = fill; c.fill(); c.restore();
}
function sparkle4(c, x, y, r, fill = '#fff') {
  if (r < 0.5) return; c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, q = i % 2 ? r * 0.22 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
  c.closePath(); c.fillStyle = fill; c.fill();
}
// テロップ（太い縁取り＋縦グラデ）。age は出てからの秒数で、ポンと跳ねて出る
function telop(c, s, x, y, size, age, c1 = '#fff36b', c2 = '#ff8a00', edge = '#1a1020') {
  const sc = age < 0.1 ? 0.4 + (age / 0.1) * 0.8 : age < 0.18 ? 1.2 - ((age - 0.1) / 0.08) * 0.2 : 1;
  c.save(); c.translate(x, y); c.scale(sc, sc);
  c.font = `900 ${size}px ${JP}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
  c.lineWidth = size * 0.34; c.strokeStyle = edge; c.strokeText(s, 0, 0);
  c.lineWidth = size * 0.17; c.strokeStyle = '#fff'; c.strokeText(s, 0, 0);
  c.fillStyle = vgrad(c, -size / 2, size / 2, [[0, c1], [1, c2]]); c.fillText(s, 0, 0);
  c.restore();
}
function grid(t0, len, bpm, steps, fn) { const st = 60 / bpm / 4; for (let i = 0; i * st < len - 0.03; i++) fn(i % steps, t0 + i * st, st, i); }
const on = (pat, i) => pat[i % pat.length] === 'x';

// ---------- カラー（70〜80年代のカラー放送） ----------
const CO = { cream: '#f6e9c8', orange: '#ea5f2a', mustard: '#f2b52c', teal: '#22a092', magenta: '#d8336e', blue: '#2c4ca0', brown: '#5a3825', ink: '#1b1410', purple: '#6a3d9a' };
function colorBars(c) {
  const w = 640 / 7;
  ['#c8c8c0', '#d2c43a', '#3cc4c0', '#3cb843', '#c23cb8', '#c8382f', '#3438b8'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * w, 0, w + 1, 320); });
  ['#3438b8', '#161616', '#c23cb8', '#161616', '#3cc4c0', '#161616', '#c8c8c0'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * w, 320, w + 1, 40); });
  ['#1e2f5a', '#f0f0f0', '#3a1f6a', '#161616', '#161616', '#262626', '#161616'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * w, 360, w + 1, 120); });
}
const COLOR = [
  { name: 'KITCHEN 3MIN',
    draw(c, t) {
      fillAll(c, '#f6e2b8');
      for (let y = 0; y < 300; y += 40) for (let x = 0; x < 640; x += 40) rf(c, x + 2, y + 2, 36, 36, 3, (x / 40 + y / 40) % 2 ? '#f2b52c' : '#ea8a3a');
      rf(c, 0, 300, 640, 180, 0, '#5a3825'); rf(c, 0, 300, 640, 14, 0, '#7a4e33');
      ell(c, 330, 360, 150, 48, 0, '#2a2a2a', 0); rf(c, 470, 350, 150, 18, 9, '#3a2418'); ell(c, 330, 352, 132, 38, 0, '#444', 0);
      const fl = Math.sin(t * 5) * 0.5 + 0.5;
      ell(c, 300, 350 - fl * 30, 60, 22, 0, '#fffaf0', 0); dot(c, 300, 348 - fl * 30, 18, '#ffb400');
      for (let k = 0; k < 4; k++) { const a = (t * 0.9 + k / 4) % 1; c.globalAlpha = 0.5 * (1 - a); dot(c, 260 + k * 30 + Math.sin(a * 8 + k) * 10, 320 - a * 160, 14 + a * 20, '#fff'); c.globalAlpha = 1; }
      rf(c, 20, 20, 250, 56, 28, CO.teal); txt(c, 'きょうのおかず', 145, 48, 28, '#fff', { font: JP, weight: '900' });
      starburst(c, 540, 90, 60, 44, 12, t, CO.magenta, 0); txt(c, '3分!', 540, 92, 30, '#fff', { font: JP, weight: '900' });
    },
    sound(A, t0, len) { A.rumble(t0, len, 0.05); for (let x = 0; x < len; x += 0.05) if (Math.random() < 0.5) A.click(t0 + x); [72, 76, 79, 77, 74, 72, 76, 84].forEach((m, i) => i * 0.18 < len && A.xylo(m - 12, t0 + i * 0.18)); } },
  { name: 'FIT-O-RAMA',
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 480, [[0, '#2a0f5a'], [1, '#d8336e']]));
      dot(c, 320, 300, 140, '#f2b52c'); for (let k = 0; k < 6; k++) rf(c, 160, 230 + k * 22, 320, 8, 0, '#2a0f5a');
      for (let k = 0; k < 12; k++) line(c, 320 + (k - 5.5) * 30, 360, 320 + (k - 5.5) * 120, 480, 2, '#ff6ad5');
      for (let k = 0; k < 5; k++) line(c, 0, 360 + k * k * 6, 640, 360 + k * k * 6, 2, '#ff6ad5');
      rf(c, 0, 358, 640, 4, 0, '#ff6ad5');
      const j = Math.abs(Math.sin(t * Math.PI * 2.2)), y = 350 - j * 26;
      c.save(); c.translate(320, y);
      line(c, -8, -60, -20 - j * 40, 0, 12, '#1a0a30'); line(c, 8, -60, 20 + j * 40, 0, 12, '#1a0a30');
      rf(c, -22, -130, 44, 76, 14, CO.teal); rf(c, -22, -66, 44, 12, 4, CO.magenta);
      line(c, -18, -120, -40 - j * 30, -120 - (1 - j) * -50 - j * 60, 10, '#e9b99a'); line(c, 18, -120, 40 + j * 30, -120 - j * 60 + (1 - j) * 50, 10, '#e9b99a');
      dot(c, 0, -150, 20, '#e9b99a'); c.beginPath(); c.arc(0, -154, 23, Math.PI, TAU); c.fillStyle = '#3a1a10'; c.fill(); rf(c, -24, -160, 48, 8, 4, CO.mustard);
      c.restore();
      txt(c, 'FIT-O-RAMA', 320, 70, 54, CO.mustard, { italic: true, weight: '900', shadow: [CO.magenta, 4, 4] });
    },
    sound(A, t0, len) { grid(t0, len, 132, 16, (i, at, st) => { if (i % 4 === 0) A.kick(at, 0.5); if (i === 4 || i === 12) A.clap(at, 0.25); if (i % 2) A.hat(at, 0.08); A.bass([40, 40, 52, 40][i % 4], at, st * 0.8, 0.09); if (i % 8 === 0) A.pad([64, 67, 71], at, st * 3, 0.04); }); A.whistle(t0 + 0.1, 0.25); } },
  { name: 'COLOR BARS / IDENT',
    draw(c, t) {
      colorBars(c);
      if (t < 0.8) { rf(c, 230, 380, 180, 40, 4, '#161616'); txt(c, 'TELE-RAINBOW 8', 320, 400, 18, '#f0f0f0', { font: MONO, weight: '700' }); return; }
      const k = eo((t - 0.8) / 0.35);
      c.save(); c.beginPath(); c.arc(320, 240, k * 420, 0, TAU); c.clip();
      const g = c.createRadialGradient(320, 260, 20, 320, 260, 420); g.addColorStop(0, '#3b5bc0'); g.addColorStop(1, '#140a2e'); fillAll(c, g);
      [CO.magenta, CO.orange, CO.mustard, CO.teal, CO.blue].forEach((col, i) => {
        c.beginPath(); c.arc(320, 330, (190 - i * 26) * eo((t - 0.9 - i * 0.05) / 0.4), Math.PI, TAU); c.lineWidth = 22; c.strokeStyle = col; c.stroke();
      });
      txt(c, 'TELE-RAINBOW', 320, 262, 58, vgrad(c, 232, 292, [[0, '#ffffff'], [0.5, CO.mustard], [1, CO.orange]]), { italic: true, weight: '900', shadow: [CO.magenta, 4, 4] });
      txt(c, '— COLOR 8 —', 320, 368, 24, CO.cream, { weight: '700' });
      for (let i = 0; i < 6; i++) sparkle4(c, 140 + rnd(i) * 360, 120 + rnd(i + 9) * 260, Math.abs(Math.sin(t * 6 + i)) * 16);
      c.restore();
    },
    sound(A, t0, len) {
      A.tone(t0, Math.min(0.78, len), 1000, 0.035);
      if (len > 0.9) { [72, 76, 79, 84].forEach((m, i) => A.lead(m, t0 + 0.82 + i * 0.1, 0.5, 0.05, 'square')); A.pad([60, 64, 67, 71], t0 + 0.82, len - 0.85, 0.035); }
    } },
  { name: 'STAR PARADE',
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 480, [[0, '#2a0f3d'], [1, '#8a1f5c']]));
      for (const x of [80, 560]) { line(c, x, 30, x, 380, 14, 'rgba(255,90,170,.25)'); line(c, x, 30, x, 380, 4, '#ffd1e8'); }
      for (let i = 0; i < 26; i++) {
        const a = Math.PI + (i / 25) * Math.PI, x = 320 + Math.cos(a) * 250, y = 360 + Math.sin(a) * 250, lit = (i + Math.floor(t * 8)) % 3 === 0;
        if (lit) dot(c, x, y, 15, 'rgba(255,210,90,.3)'); dot(c, x, y, 7, lit ? '#ffe08a' : '#5a2f4a');
      }
      for (const s of [-1, 1]) {
        const a = Math.sin(t * 1.6 + s) * 0.35, ax = 320 + s * 300;
        poly(c, [[ax, -20], [ax + Math.tan(a - 0.2 - s * 0.5) * 500, 480], [ax + Math.tan(a + 0.2 - s * 0.5) * 500, 480]], 'rgba(255,240,200,.16)');
      }
      c.fillStyle = vgrad(c, 390, 480, [[0, '#4a1240'], [1, '#14050f']]); c.fillRect(0, 390, 640, 90);
      dot(c, 320, 410, 90, 'rgba(255,230,200,.12)');
      c.save(); c.translate(320, 400); c.rotate(Math.sin(t * 2.6) * 0.06);
      poly(c, [[-24, -132], [24, -132], [64, 0], [-64, 0]], CO.magenta);
      for (let i = 0; i < 14; i++) sparkle4(c, -50 + rnd(i) * 100, -120 + rnd(i + 4) * 115, (Math.sin(t * 9 + i) > 0.6 ? 7 : 0), '#ffe6f2');
      line(c, -18, -122, -74, -176 + Math.sin(t * 5) * 14, 8, '#e9b99a');
      line(c, 16, -122, 8, -150, 8, '#e9b99a');
      line(c, 4, -152, 10, -132, 5, '#222'); dot(c, 3, -156, 7, '#888');
      ell(c, 0, -164, 26, 30, 0, '#2a1530', 0); ell(c, 0, -158, 15, 19, 0, '#e9b99a', 0);
      c.restore();
      txt(c, 'STAR☆PARADE', 30, 56, 42, CO.mustard, { italic: true, weight: '900', align: 'left', shadow: [CO.magenta, 4, 4] });
      rf(c, 30, 412, 260, 44, 6, 'rgba(10,5,20,.72)');
      txt(c, '♪ 夜明けのメロディ', 46, 435, 22, CO.cream, { font: JP, weight: '700', align: 'left' });
    },
    sound(A, t0, len) {
      const B = [45, 45, 57, 45, 45, 57, 45, 57, 41, 41, 53, 41, 43, 43, 55, 43], Lm = { 0: 76, 3: 79, 6: 81, 8: 79, 10: 76, 12: 74, 14: 72 };
      grid(t0, len, 120, 16, (i, at, st) => {
        if (i % 4 === 0) A.kick(at, 0.5); if (i === 4 || i === 12) A.snare(at, 0.3); if (i % 2) A.hat(at, 0.1);
        A.bass(B[i], at, st * 0.9, 0.1); if (Lm[i]) A.lead(Lm[i], at, st * 1.8, 0.05, 'square');
      });
    } },
  { name: 'FIZZ-O CM',
    draw(c, t) {
      rays(c, 320, 520, 20, t * 0.6, CO.orange, CO.mustard);
      [CO.magenta, CO.orange, CO.mustard, CO.teal, CO.blue].forEach((col, i) => { c.beginPath(); c.arc(320, 560, 360 - i * 22, Math.PI, TAU); c.lineWidth = 22; c.strokeStyle = col; c.stroke(); });
      for (let k = 0; k < 18; k++) {
        const x = 70 + rnd(k) * 500, y = 500 - ((t * 140 * (0.6 + rnd(k + 3)) + rnd(k + 5) * 500) % 540), r = 4 + rnd(k + 8) * 10;
        dot(c, x, y, r, 'rgba(255,255,255,.25)'); c.lineWidth = 2; c.strokeStyle = '#fff'; c.stroke();
      }
      const pop = t < 0.3 ? eo(t / 0.3) * 1.08 : 1 + Math.sin(t * 6) * 0.03;
      c.save(); c.translate(320, 245); c.scale(pop, pop); c.rotate(Math.sin(t * 2) * 0.08);
      const g = c.createLinearGradient(-72, 0, 72, 0);
      [[0, '#6a0b26'], [0.3, '#e23b5a'], [0.48, '#ffb0bd'], [0.65, '#d8336e'], [1, '#4a0818']].forEach(([o, col]) => g.addColorStop(o, col));
      rf(c, -72, -140, 144, 280, 20, g);
      ell(c, 0, -140, 70, 14, 0, '#dcd6c8', 0); ell(c, 0, -140, 56, 9, 0, '#a8a296', 0);
      c.beginPath(); c.moveTo(-72, -40); for (let x = -72; x <= 72; x += 8) c.lineTo(x, -40 + Math.sin(x * 0.08 + t * 4) * 8);
      c.lineTo(72, 40); for (let x = 72; x >= -72; x -= 8) c.lineTo(x, 40 + Math.sin(x * 0.08 + t * 4 + 1) * 8); c.closePath(); c.fillStyle = '#fff6e6'; c.fill();
      c.save(); c.rotate(-0.15); txt(c, 'FIZZ-O', 0, 2, 40, CO.magenta, { italic: true, weight: '900' }); c.restore();
      for (let i = 0; i < 6; i++) ell(c, -50 + rnd(i) * 100, 60 + rnd(i + 2) * 70, 3, 6, 0, 'rgba(255,255,255,.7)', 0);
      c.restore();
      starburst(c, 520, 110, 64, 44, 14, t * 2, CO.teal, 0); txt(c, 'NEW!', 520, 112, 30, '#fff', { weight: '900', italic: true });
      txt(c, 'おいしさ、はじける。', 320, 438, 32, '#fff', { font: JP, weight: '900', stroke: '#7a0f2e', lw: 9 });
    },
    sound(A, t0, len) {
      A.noise(t0, 0.35, 'bandpass', 4500, 0.8, 0.12);
      [[72, 0.35], [76, 0.47], [79, 0.59], [84, 0.71], [79, 0.95], [84, 1.07], [88, 1.19]].forEach(([m, at]) => at < len && A.lead(m, t0 + at, 0.18, 0.05, 'triangle'));
      if (len > 1.2) A.pad([60, 64, 67, 72], t0 + 0.35, len - 0.4, 0.03);
      for (let x = 0.1; x < len; x += 0.07 + Math.random() * 0.12) A.bubble(t0 + x);
    } },
  { name: 'QUIZ TOWN', gain: 1.3,
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 480, [[0, '#0e2058'], [1, '#2c4ca0']]));
      const pal = [CO.teal, CO.orange, CO.mustard, CO.magenta, '#4f7fe0'];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 9; i++) {
        const h = rnd(i * 7 + j * 31 + Math.floor(t * 6));
        rf(c, 40 + i * 63, 30 + j * 56, 56, 48, 6, h > 0.45 ? pal[(i + j) % 5] : '#1a2a5e');
      }
      rf(c, 170, 64, 300, 132, 14, CO.cream, CO.mustard, 7);
      txt(c, 'Q.', 245, 132, 62, CO.magenta, { italic: true, weight: '900' });
      c.save(); c.translate(390, 132); c.scale(1 + Math.sin(t * 8) * 0.08, 1); txt(c, '?', 0, 0, 96, CO.blue, { weight: '900' }); c.restore();
      rf(c, 110, 214, 420, 46, 23, CO.magenta); txt(c, 'QUIZ ヒラメキ・タウン', 320, 238, 28, '#fff', { font: JP, weight: '900' });
      [[130, CO.magenta, '120'], [320, CO.teal, '80'], [510, CO.orange, '250']].forEach(([x, col, n], i) => {
        dot(c, x, 300, 30, '#1b1410'); ell(c, x, 280, 30, 14, 0, '#3a2418', 0);
        const lit = Math.floor(t * 3) % 3 === i;
        if (lit) dot(c, x, 318, 34, 'rgba(255,220,90,.35)');
        ell(c, x, 318, 22, 9, 0, lit ? '#ffe36b' : '#7a7a7a', 0);
        poly(c, [[x - 80, 330], [x + 80, 330], [x + 70, 480], [x - 70, 480]], col);
        rf(c, x - 46, 352, 92, 44, 4, '#140808'); txt(c, n, x, 375, 30, '#ff5a3c', { font: MONO, weight: '900' });
      });
    },
    sound(A, t0, len) {
      A.chime2(t0 + 0.02, 1318, 1046, 0.06);
      A.pad([60, 64, 67], t0 + 0.6, 0.35, 0.05); A.lead(72, t0 + 0.6, 0.3, 0.04, 'sawtooth');
      if (len > 1.5) { if (Math.random() < 0.5) A.buzzer(t0 + 1.3, 0.35); else A.chime2(t0 + 1.3, 1568, 2093, 0.06); }
      grid(t0 + 0.6, len - 0.6, 128, 8, (i, at) => { if (i % 4 === 0) A.kick(at, 0.3); if (i % 2) A.hat(at, 0.06); A.bass([48, 48, 55, 48, 50, 50, 57, 50][i], at, 0.1, 0.07); });
    } },
  { name: 'DISCO 77',
    draw(c, t) {
      fillAll(c, '#140a1e');
      const pal = [CO.magenta, CO.orange, CO.mustard, CO.teal, '#4f7fe0'], beat = Math.floor(t / 0.476);
      for (let k = 0; k < 10; k++) { const a = t * 0.8 + k * 0.63; line(c, 320, 70, 320 + Math.cos(a) * 700, 70 + Math.abs(Math.sin(a)) * 700, 26, `rgba(255,255,255,.05)`); }
      for (let j = 0; j < 5; j++) {
        const y0 = 300 + j * 36, w0 = 200 + j * 90, w1 = 200 + (j + 1) * 90;
        for (let i = 0; i < 8; i++) {
          const lit = rnd(i * 7 + j * 13 + beat) > 0.45;
          poly(c, [[320 - w0 + (i * 2 * w0) / 8, y0], [320 - w0 + ((i + 1) * 2 * w0) / 8, y0], [320 - w1 + ((i + 1) * 2 * w1) / 8, y0 + 36], [320 - w1 + (i * 2 * w1) / 8, y0 + 36]], lit ? pal[(i + j + beat) % 5] : '#2a1a33', '#140a1e', 2);
        }
      }
      line(c, 320, 0, 320, 34, 2, '#888');
      const g = c.createRadialGradient(306, 58, 4, 320, 72, 40); g.addColorStop(0, '#fff'); g.addColorStop(1, '#666'); dot(c, 320, 72, 38, g);
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + t; if (Math.cos(a) > 0) sparkle4(c, 320 + Math.sin(a) * 34, 60 + (i % 3) * 12, rnd(i + Math.floor(t * 12)) > 0.6 ? 9 : 0); }
      txt(c, 'DISCO 77', 320, 150, 50, vgrad(c, 125, 175, [[0, CO.mustard], [0.5, CO.orange], [1, CO.magenta]]), { italic: true, weight: '900', shadow: ['#000', 3, 3] });
      [180, 320, 460].forEach((x, i) => {
        const pose = (beat + i) % 2 ? 1 : -1, y = 330 - Math.abs(Math.sin(t * 6.6)) * 6, col = '#0a0510', rim = pal[(i * 2) % 5];
        c.save(); c.translate(x, y);
        poly(c, [[-14, -60], [-36, 0], [-20, 0], [0, -40], [20, 0], [36, 0], [14, -60]], col, rim, 2.5);
        poly(c, [[-18, -118], [18, -118], [14, -60], [-14, -60]], col, rim, 2.5);
        line(c, 16 * pose, -112, 56 * pose, -170, 9, col); line(c, -16 * pose, -112, -30 * pose, -84, 9, col); line(c, -30 * pose, -84, -12 * pose, -70, 9, col);
        dot(c, 0, -134, 16, col); c.lineWidth = 2.5; c.strokeStyle = rim; c.stroke();
        c.restore();
      });
    },
    sound(A, t0, len) {
      const R = [45, 45, 45, 45, 50, 50, 43, 43];
      grid(t0, len, 126, 16, (i, at, st, n) => {
        if (i % 4 === 0) A.kick(at, 0.5); if (i % 4 === 2) A.hat(at, 0.12, true); if (i === 4 || i === 12) A.clap(at, 0.25);
        if (i % 2 === 0) A.bass(R[Math.floor(n / 16) % 8] + (i % 4 ? 12 : 0), at, st * 1.6, 0.1);
        if (i === 6 || i === 14) A.pad([69, 72, 76], at, st * 1.5, 0.05);
      });
    } },
];

// ---------- 今どきの番組 ----------
const MO = { y: '#ffd400', r: '#ff3b30', c: '#00b8f0', p: '#ff5fa2', k: '#111', g: '#2bd67b', o: '#ff8a00', skin: '#f2c7a5', hair: '#2b1d16' };
function flatPerson(c, x, y, s, shirt, mood, t) {
  c.save(); c.translate(x, y); c.scale(s, s);
  rf(c, -34, 0, 68, 96, 30, shirt);
  dot(c, 0, -26, 30, MO.skin);
  c.beginPath(); c.arc(0, -30, 32, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(28, -26); c.lineTo(-28, -26); c.fillStyle = MO.hair; c.fill();
  dot(c, -10, -22, 3.5, MO.k); dot(c, 10, -22, 3.5, MO.k);
  if (mood === 'o') ell(c, 0, -6, 6, 8, 0, '#7a1f1f', 0);
  else if (mood === 'laugh') { c.beginPath(); c.arc(0, -10, 10, 0, Math.PI); c.fillStyle = '#7a1f1f'; c.fill(); }
  else { c.beginPath(); c.arc(0, -12, 8, 0.3, Math.PI - 0.3); c.lineWidth = 3; c.strokeStyle = MO.k; c.stroke(); }
  c.restore();
}
const VTEL = ['まさかの結果に一同騒然!?', 'えっ…ウソでしょ!?', 'ここで衝撃の事実が', 'スタジオ大爆笑'];
const CUTS = [
  (c) => { fillAll(c, vgrad(c, 0, 400, [[0, '#ff9a5c'], [1, '#ffd27a']])); for (let i = 0; i < 12; i++) { const h = 80 + rnd(i) * 220, x = i * 56 - 10; rf(c, x, 400 - h, 50, h + 80, 0, '#2a2140'); for (let k = 0; k < 8; k++) dot(c, x + 12 + (k % 2) * 24, 420 - h + Math.floor(k / 2) * 26, 4, '#ffd76b'); } },
  (c) => { fillAll(c, '#f6e3c8'); dot(c, 320, 240, 170, '#c8462e'); dot(c, 320, 240, 145, '#f2c86b'); for (let k = 0; k < 6; k++) { c.beginPath(); for (let x = -110; x <= 110; x += 10) c.lineTo(320 + x, 210 + k * 14 + Math.sin(x * 0.1 + k) * 6); c.lineWidth = 5; c.strokeStyle = '#fff2c2'; c.stroke(); } ell(c, 260, 170, 34, 26, 0.3, '#fff', 0); dot(c, 262, 170, 14, '#ffb400'); for (let i = 0; i < 10; i++) dot(c, 360 + rnd(i) * 60, 260 + rnd(i + 3) * 60, 6, '#3cb043'); },
  (c) => { fillAll(c, MO.c); rf(c, 250, 70, 150, 300, 22, '#111'); rf(c, 260, 86, 130, 262, 10, vgrad(c, 86, 348, [[0, '#7a5cff'], [1, '#ff5fa2']])); for (let i = 0; i < 12; i++) rf(c, 272 + (i % 3) * 40, 104 + Math.floor(i / 3) * 44, 28, 28, 8, ['#fff', MO.y, MO.g][i % 3]); rf(c, 220, 300, 120, 160, 50, MO.skin); },
  (c) => { fillAll(c, vgrad(c, 0, 480, [[0, '#5b3ea8'], [1, '#ff8fb0']])); dot(c, 320, 300, 70, '#ffe28a'); poly(c, [[0, 480], [180, 230], [330, 480]], '#3a2a6a'); poly(c, [[200, 480], [420, 200], [640, 480]], '#2a1d50'); poly(c, [[380, 200], [420, 200], [460, 260], [360, 260]], '#fff'); },
  (c) => { fillAll(c, '#ffe0e9'); dot(c, 320, 250, 150, '#fff'); dot(c, 320, 250, 118, '#7a4a2a'); dot(c, 320, 250, 100, '#c8915a'); heart(c, 320, 250, 4.2, '#f4dcc0'); rf(c, 460, 200, 70, 30, 15, '#fff'); },
  (c) => { fillAll(c, MO.y); rf(c, 210, 170, 220, 200, 8, MO.p); rf(c, 300, 170, 40, 200, 0, '#fff'); rf(c, 210, 250, 220, 40, 0, '#fff'); ell(c, 290, 160, 40, 22, -0.4, '#fff', 0); ell(c, 350, 160, 40, 22, 0.4, '#fff', 0); },
];
const CHAT = [['mochi', '草'], ['kuro_7', '神回'], ['sora', 'それな'], ['nanashi', '!?'], ['hiro', 'うまい'], ['tama', '8888'], ['yuzu', '初見です'], ['ren', 'www'], ['aoi', 'いまの何'], ['kai', 'すご']];
const SPRITE = ['..XXXX..', '.X....X.', 'X.X..X.X', 'X......X', 'X.XXXX.X', '.X....X.', '..X..X..', '.XX..XX.'];
const MODERN = [
  { name: 'EXPLAINER', gain: 2.6,
    draw(c, t) {
      fillAll(c, '#fbfaf6'); for (let y = 30; y < 480; y += 30) line(c, 0, y, 640, y, 1, 'rgba(0,120,200,.12)');
      rf(c, 30, 30, 440, 64, 10, MO.k); txt(c, '3分でわかる「流れ」の話', 250, 62, 28, '#fff', { font: JP, weight: '900' });
      const n = Math.min(3, Math.floor(t / 0.5) + 1);
      for (let i = 0; i < n; i++) {
        const y = 150 + i * 90, a = Math.min(1, (t - i * 0.5) / 0.2);
        c.globalAlpha = a; dot(c, 70, y, 26, [MO.r, MO.c, MO.g][i]); txt(c, String(i + 1), 70, y + 1, 26, '#fff', { weight: '900' });
        rf(c, 110, y - 12, 250 * a, 22, 4, 'rgba(255,212,0,.55)');
        txt(c, ['まず全体を見る', '次に差を見る', '最後に決める'][i], 112, y, 28, MO.k, { font: JP, weight: '900', align: 'left' }); c.globalAlpha = 1;
      }
      const b = Math.abs(Math.sin(t * 6)) * 6;
      dot(c, 540, 440, 110, MO.c); flatPerson(c, 540, 330 - b, 1.4, MO.p, Math.floor(t * 8) % 2 ? 'o' : 'smile', t);
      rf(c, 440, 150, 170, 60, 14, '#fff', MO.k, 3); txt(c, 'ここ大事！', 525, 180, 24, MO.r, { font: JP, weight: '900' });
    },
    sound(A, t0, len) { for (let i = 0; i < 3; i++) if (i * 0.5 < len) A.pop(t0 + i * 0.5); for (let x = 0; x < len; x += 0.07) if (Math.random() < 0.6) A.click(t0 + x); grid(t0, len, 100, 8, (i, at) => { if (i % 4 === 0) A.kick(at, 0.25); if (i % 2) A.hat(at, 0.04); }); } },
  { name: 'TRAVEL VLOG', gain: 1.8,
    draw(c, t) {
      const sx = Math.sin(t * 3.1) * 8, sy = Math.sin(t * 4.3) * 6;
      c.save(); c.translate(sx, sy); c.rotate(Math.sin(t * 2) * 0.015);
      fillAll(c, vgrad(c, -20, 260, [[0, '#4fc3ff'], [1, '#bdeaff']]));
      dot(c, 520, 90, 40, '#fff6c0');
      fillAll(c, 'rgba(0,0,0,0)'); rf(c, -20, 250, 680, 80, 0, '#1fa3c9'); for (let k = 0; k < 8; k++) line(c, ((k * 97 + t * 40) % 700) - 40, 270 + k * 7, ((k * 97 + t * 40) % 700) + 20, 270 + k * 7, 3, 'rgba(255,255,255,.7)');
      rf(c, -20, 320, 680, 200, 0, '#f3dcaa');
      line(c, 140, 330, 120, 150, 10, '#7a5230'); [[-1.2], [-0.6], [0], [0.6], [1.2]].forEach(([a]) => ell(c, 120 + Math.sin(a) * 50, 150 + Math.cos(a) * 10 - 10, 60, 14, a * 0.6, '#2c9a4a', 0));
      c.restore();
      rf(c, 20, 20, 120, 46, 23, '#fff'); txt(c, 'Day 2', 80, 43, 24, MO.k, { weight: '900' });
      c.save(); c.translate(560, 380); c.rotate(-0.1); rf(c, -70, -26, 140, 52, 10, MO.y); txt(c, '最高すぎ', 0, 0, 26, MO.k, { font: JP, weight: '900' }); c.restore();
      c.beginPath(); c.arc(80, 400, 16, Math.PI, 0); c.lineTo(80, 432); c.closePath(); c.fillStyle = MO.r; c.fill(); dot(c, 80, 400, 6, '#fff');
      txt(c, 'みなみの浜', 104, 410, 20, '#fff', { font: JP, weight: '900', align: 'left', outer: ['rgba(0,0,0,.6)', 5] });
    },
    sound(A, t0, len) { grid(t0, len, 118, 16, (i, at, st) => { if (i % 4 === 0) A.kick(at, 0.35); if (i % 4 === 2) A.hat(at, 0.08, true); if (i % 8 === 4) [60, 64, 67, 71].forEach((m) => A.epiano(m, at, st * 3, 0.03)); }); A.whoosh(t0, 0.3, 0.06); A.rumble(t0, len, 0.03); } },
  { name: 'VARIETY', gain: 3,
    draw(c, t) {
      const cut = Math.floor(t / 0.75), age = t - cut * 0.75, z = [1, 1.3, 1.12, 1.4][cut % 4], fx = [320, 250, 420, 330][cut % 4];
      c.save(); c.translate(320, 240); c.scale(z, z); c.translate(-fx, -240);
      fillAll(c, vgrad(c, 0, 480, [[0, '#ff6fb1'], [1, '#ffb347']]));
      const pal = [MO.c, MO.y, MO.g, '#fff', MO.p];
      for (let j = 0; j < 5; j++) for (let i = 0; i < 14; i++) rf(c, i * 46 + 4, j * 46 + 4, 40, 40, 8, pal[(i + j + Math.floor(t * 4)) % 5] + '55');
      [[130, MO.c], [250, MO.y], [390, MO.g], [510, MO.p]].forEach(([x, col], i) => flatPerson(c, x, 250 - (cut % 2 ? Math.abs(Math.sin(t * 14 + i)) * 5 : 0), 1, col, cut % 2 ? 'laugh' : i === 1 ? 'o' : 'smile', t));
      rf(c, 30, 320, 580, 160, 24, '#fff'); rf(c, 30, 340, 580, 14, 0, MO.y);
      c.restore();
      rf(c, 16, 16, 230, 40, 8, 'rgba(0,0,0,.6)'); txt(c, 'ナゾトキ発見バラエティ', 28, 36, 19, '#fff', { font: JP, weight: '800', align: 'left' });
      const wb = Math.abs(Math.sin(t * 9)) * 4;
      rf(c, 448, 16 - wb, 176, 122, 14, '#fff'); rf(c, 454, 22 - wb, 164, 110, 10, '#7ad0ff');
      c.save(); c.beginPath(); c.roundRect(454, 22 - wb, 164, 110, 10); c.clip(); flatPerson(c, 536, 92 - wb, 0.95, MO.r, 'o', t); c.restore();
      telop(c, VTEL[cut % 4], 320, 418, 38, age);
      if (cut % 2) txt(c, 'www', 560, 300, 28, '#fff', { weight: '900', stroke: MO.k, lw: 6 });
    },
    sound(A, t0, len) {
      for (let k = 0; k * 0.75 < len; k++) { const at = t0 + k * 0.75; A.boom(at, 0.18); A.pop(at + 0.02); if (k % 2) A.laugh(at + 0.12, Math.min(0.6, len - k * 0.75 - 0.15)); else A.pikon(at + 0.25); }
    } },
  { name: 'SHORT VIDEO', gain: 2.4,
    draw(c, t) {
      fillAll(c, '#1a1426'); dot(c, 120, 120, 160, 'rgba(0,184,240,.18)'); dot(c, 540, 380, 180, 'rgba(255,95,162,.18)');
      c.save(); c.beginPath(); c.rect(185, 0, 270, 480); c.clip();
      fillAll(c, vgrad(c, 0, 480, [[0, '#45d4ff'], [1, '#ff7ab8']]));
      ell(c, 320, 400, 90, 18, 0, 'rgba(0,0,0,.18)', 0);
      const b = t * (140 / 60), p = Math.sin(b * Math.PI), q = Math.cos(b * Math.PI), hy = 300 - Math.abs(p) * 10;
      line(c, 310, hy, 290 - p * 16, 398, 14, '#222'); line(c, 330, hy, 350 + p * 16, 398, 14, '#222');
      rf(c, 296, hy - 86, 48, 92, 18, MO.y);
      line(c, 300, hy - 74, 300 - 40, hy - 74 - q * 50, 11, MO.y); line(c, 340, hy - 74, 340 + 40, hy - 74 + q * 50, 11, MO.y);
      dot(c, 320, hy - 108, 24, MO.skin); c.beginPath(); c.arc(320, hy - 112, 25, Math.PI, TAU); c.fillStyle = MO.r; c.fill(); rf(c, 320, hy - 118, 30, 7, 3, MO.r);
      txt(c, 'これ、知ってた？', 320, 66, 27, '#fff', { font: JP, weight: '900', stroke: MO.k, lw: 7 });
      const beat = (b % 1) < 0.15;
      heart(c, 428, 236, beat ? 2.4 : 2.1, MO.p); txt(c, '1.2万', 428, 262, 12, '#fff', { weight: '700' });
      ell(c, 428, 300, 16, 13, 0, '#fff', 0); poly(c, [[418, 308], [412, 320], [428, 312]], '#fff'); txt(c, '348', 428, 326, 12, '#fff', { weight: '700' });
      poly(c, [[416, 372], [432, 358], [432, 366], [442, 366], [442, 378], [432, 378], [432, 386]], '#fff'); txt(c, '共有', 428, 398, 12, '#fff', { font: JP, weight: '700' });
      for (let k = 0; k < 6; k++) { const a = (t * 0.8 + k / 6) % 1; c.globalAlpha = 1 - a; heart(c, 428 + Math.sin(a * 6 + k) * 12, 230 - a * 170, 1, MO.p); c.globalAlpha = 1; }
      txt(c, '@kotsu_lab', 198, 418, 15, '#fff', { weight: '800', align: 'left' });
      txt(c, '#毎日ちょっと得する', 198, 440, 13, '#fff', { font: JP, weight: '700', align: 'left' });
      rf(c, 185, 474, 270, 4, 0, 'rgba(255,255,255,.35)'); rf(c, 185, 474, 270 * ((t % 3) / 3), 4, 0, '#fff');
      c.restore();
    },
    sound(A, t0, len) {
      const B = [33, 0, 0, 0, 0, 0, 0, 33, 0, 0, 36, 0, 0, 0, 0, 0];
      grid(t0, len, 140, 16, (i, at, st) => {
        if (on('x......x..x.....', i)) A.kick(at, 0.45); if (i === 8) A.clap(at, 0.3);
        A.hat(at, 0.06); if (i >= 13) { A.hat(at + st / 3, 0.05); A.hat(at + (2 * st) / 3, 0.05); }
        if (B[i]) A.sub808(B[i], at, st * 5, 0.2);
        if (i % 4 === 0) A.celesta([79, 82, 86, 84][(i / 4) | 0], at, 0.04);
      });
    } },
  { name: 'TOP 10 CUTS', gain: 1.8,
    draw(c, t) {
      const CUT = 0.24, k = Math.floor(t / CUT), age = t - k * CUT, z = 1 + age * 0.4;
      c.save(); c.translate(320, 240); c.scale(z, z); c.translate(-320, -240); CUTS[k % CUTS.length](c); c.restore();
      if (age < 0.05) { c.fillStyle = `rgba(255,255,255,${0.7 * (1 - age / 0.05)})`; c.fillRect(0, 0, 640, 480); }
      rf(c, 20, 20, 132, 72, 10, MO.r); txt(c, `第${10 - (k % 10)}位`, 86, 56, 34, '#fff', { font: JP, weight: '900' });
      rf(c, 0, 398, 640, 82, 0, 'rgba(0,0,0,.72)');
      txt(c, '話題のアレ、ぜんぶ見せます', 320, 440, 32, MO.y, { font: JP, weight: '900' });
    },
    sound(A, t0, len) {
      for (let x = 0; x < len; x += 0.24) { A.whoosh(t0 + x, 0.16, 0.08); A.kick(t0 + x, 0.3); }
      A.riser(t0, len, 0.05);
    } },
  { name: 'REVIEW', gain: 2.4,
    draw(c, t) {
      fillAll(c, '#efe9e0'); for (let y = 0; y < 480; y += 30) line(c, 0, y + Math.sin(y) * 3, 640, y, 1, 'rgba(120,90,60,.08)');
      const ly = 180 - eo((t - 0.3) / 0.5) * 280;
      rf(c, 206, 190, 240, 200, 6, 'rgba(0,0,0,.12)');
      rf(c, 200, 180, 240, 200, 6, '#c9a77c'); rf(c, 214, 194, 212, 172, 4, '#b38f63');
      if (t > 0.5) {
        const s = eo((t - 0.5) / 0.3);
        c.save(); c.translate(320, 280); c.scale(s, s); rf(c, -70, -60, 140, 120, 34, '#a8e0d4'); dot(c, 0, 0, 26, '#fff'); dot(c, 0, 0, 10, '#6cc2b0'); c.restore();
        for (let i = 0; i < 5; i++) sparkle4(c, 240 + rnd(i) * 160, 200 + rnd(i + 5) * 150, Math.abs(Math.sin(t * 8 + i)) * 14, '#fff8c8');
      }
      rf(c, 192, ly - 8, 256, 70, 6, '#d6b88e'); line(c, 320, ly - 8, 320, ly + 62, 6, '#e8d5b5');
      const hy = Math.max(ly + 40, 420);
      rf(c, 150, hy - 30, 70, 110, 34, MO.skin); rf(c, 420, hy - 30, 70, 110, 34, MO.skin);
      rf(c, 16, 16, 172, 44, 22, '#111'); txt(c, '正直レビュー', 102, 38, 22, '#fff', { font: JP, weight: '900' });
      if (t > 1) { txt(c, '★★★★☆', 530, 110, 32, '#ffb800', { weight: '900' }); txt(c, '4.6', 530, 148, 30, '#111', { weight: '900' }); }
      c.save(); c.translate(540, 330); c.rotate(-0.2 + Math.sin(t * 3) * 0.05); starburst(c, 0, 0, 58, 50, 18, 0, MO.y, 0); txt(c, '¥1,980', 0, 2, 24, '#111', { weight: '900' }); c.restore();
      txt(c, 'え、これ買ってよかった…', 320, 452, 26, '#fff', { font: JP, weight: '900', stroke: '#111', lw: 7 });
    },
    sound(A, t0, len) {
      const ch = [[57, 60, 64, 67], [53, 57, 60, 64]];
      grid(t0, len, 84, 16, (i, at, st, n) => {
        if (on('x.........x.....', i)) A.kick(at, 0.3); if (i === 4 || i === 12) A.snare(at, 0.12); if (i % 2 === 0) A.hat(at + (i % 4 ? st * 0.25 : 0), 0.04);
        if (i === 0 || i === 8) ch[Math.floor(n / 8) % 2].forEach((m) => A.epiano(m, at, st * 7, 0.03));
      });
      A.pop(t0 + 0.55); A.zing(t0 + 0.8, 0.03);
    } },
  { name: 'GAME LIVE', gain: 1.8,
    draw(c, t) {
      c.save(); c.beginPath(); c.rect(0, 0, 430, 480); c.clip();
      fillAll(c, '#62c6ff');
      for (let i = 0; i < 3; i++) { const x = ((i * 180 - t * 30) % 600 + 600) % 600 - 80; rf(c, x, 60 + i * 40, 90, 24, 0, '#fff'); rf(c, x + 20, 48 + i * 40, 50, 14, 0, '#fff'); }
      const off = (t * 160) % 32;
      for (let x = -off; x < 440; x += 32) { rf(c, x, 380, 32, 100, 0, '#c86b2c'); rf(c, x, 380, 32, 10, 0, '#3cc04a'); line(c, x, 380, x, 480, 2, '#8a4418'); line(c, x, 420, x + 32, 420, 2, '#8a4418'); }
      for (let x = 160 - ((t * 160) % 220); x < 440; x += 220) { for (let k = 0; k < 3; k++) rf(c, x + k * 32, 270, 32, 32, 0, '#9a9aa8', '#55556a', 2); }
      for (let k = 0; k < 6; k++) { const x = ((k * 90 - t * 160) % 540 + 540) % 540 - 40; c.save(); c.translate(x, 240 + (k % 2) * 40); c.scale(Math.abs(Math.cos(t * 5 + k)), 1); dot(c, 0, 0, 10, '#ffd400'); c.restore(); }
      const jy = 380 - 40 - Math.abs(Math.sin(t * Math.PI * 1.6)) * 90;
      SPRITE.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') c.fillStyle = '#222', c.fillRect(120 + i * 5, jy + j * 5, 5, 5); else if (j > 0 && j < 7 && i > 0 && i < 7) c.fillStyle = '#ff6b4a', c.fillRect(120 + i * 5, jy + j * 5, 5, 5); }));
      txt(c, 'SCORE 004210', 420, 74, 16, '#fff', { font: MONO, weight: '900', align: 'right', shadow: ['#000', 2, 2] });
      rf(c, 12, 12, 54, 24, 4, '#e91916'); txt(c, 'LIVE', 39, 25, 14, '#fff', { weight: '900' });
      txt(c, '12,345 人が視聴中', 74, 25, 13, '#fff', { font: JP, weight: '700', align: 'left', shadow: ['#000', 1, 1] });
      c.restore();
      rf(c, 430, 0, 210, 480, 0, '#18181f'); txt(c, 'チャット', 446, 22, 14, '#9a9aae', { font: JP, weight: '700', align: 'left' });
      const o = t * 2.6, base = Math.floor(o), fr = o - base;
      c.save(); c.beginPath(); c.rect(430, 40, 210, 440); c.clip();
      for (let j = 0; j < 12; j++) {
        const [n, m] = CHAT[(base + j) % CHAT.length], y = 456 - (11 - j + fr) * 36;
        txt(c, n, 446, y, 13, ['#ff7ab8', '#7ad0ff', '#ffd400', '#7dff9a'][(base + j) % 4], { weight: '800', align: 'left' });
        txt(c, m, 446 + n.length * 8 + 12, y, 15, '#fff', { font: JP, weight: '700', align: 'left' });
      }
      c.restore();
    },
    sound(A, t0, len) {
      const ar = [60, 64, 67, 72, 62, 65, 69, 74];
      grid(t0, len, 150, 16, (i, at, st, n) => { A.lead(ar[(i % 4) + (Math.floor(n / 16) % 2) * 4] + 12, at, st * 0.8, 0.025, 'square'); if (i % 4 === 0) A.bass(36 + (Math.floor(n / 16) % 2) * 2, at, st * 2, 0.06, 'triangle'); });
      for (let x = 0; x < len; x += 1 / 1.6) A.jump(t0 + x);
      for (let x = 0.3; x < len; x += 0.55) A.coin(t0 + x);
    } },
];

// ---------- アニメ調（オリジナル） ----------
const AN = { s1: '#2f6fd0', s2: '#4f92e6', s3: '#8cc4f4', cl: '#ffffff', cls: '#c3d3ef', ink: '#1b1f33', red: '#e8443a', pur: '#6a4c9c' };
function animeCloud(c, x, y, s) {
  const P2 = [[-60, 10, 40], [-15, -20, 52], [40, -5, 44], [80, 18, 30], [0, 22, 46]];
  P2.forEach(([dx, dy, r]) => dot(c, x + dx * s, y + dy * s, r * s, AN.cls));
  P2.forEach(([dx, dy, r]) => dot(c, x + (dx - 6) * s, y + (dy - 10) * s, r * 0.86 * s, AN.cl));
}
const BLD = Array.from({ length: 8 }, (_, i) => [60 + rnd(i * 5) * 70, 30 + rnd(i * 5 + 1) * 70]);
const ANIME = [
  { name: 'PETALS', gain: 3,
    draw(c, t) {
      c.fillStyle = '#8ec9f5'; c.fillRect(0, 0, 640, 200); c.fillStyle = '#b7dcf8'; c.fillRect(0, 200, 640, 120);
      rf(c, 0, 300, 640, 180, 0, '#9ccf7a'); rf(c, 0, 300, 640, 30, 0, '#86bb66');
      rf(c, 380, 120, 260, 180, 0, '#e9e2d6'); for (let k = 0; k < 4; k++) rf(c, 400 + k * 60, 150, 40, 50, 0, '#9fc3e0');
      line(c, 160, 330, 150, 150, 18, '#5a3b2c'); line(c, 152, 200, 90, 140, 8, '#5a3b2c'); line(c, 155, 180, 230, 120, 8, '#5a3b2c');
      [[150, 120, 90], [80, 140, 60], [230, 120, 60], [160, 80, 60]].forEach(([x, y, r]) => { dot(c, x, y + 8, r, '#f2a7c3'); dot(c, x - 6, y, r * 0.86, '#ffd0e0'); });
      const f = Math.floor(t * 24);
      for (let k = 0; k < 26; k++) { const a = (t * 0.25 + rnd(k)) % 1, x = (rnd(k + 3) * 760 - a * 260 + Math.sin(t * 2 + k) * 20), y = a * 520 - 20; c.save(); c.translate(x, y); c.rotate(t * 3 + k); ell(c, 0, 0, 7, 4, 0, '#ffd0e0', 0); c.restore(); }
      c.save(); c.translate(330, 330);
      poly(c, [[-40, 0], [40, 0], [30, -90], [-30, -90]], AN.ink); dot(c, 0, -112, 26, AN.ink);
      c.beginPath(); c.moveTo(-6, -138); for (let k = 0; k <= 6; k++) c.lineTo(20 + k * 13, -128 + k * 9 + Math.sin(t * 6 + k) * 5); for (let k = 6; k >= 0; k--) c.lineTo(14 + k * 11, -110 + k * 10 + Math.sin(t * 6 + k + 1) * 5); c.lineTo(0, -92); c.fillStyle = AN.ink; c.fill();
      c.restore();
      if (f % 48 < 2) { c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(0, 0, 640, 480); }
    },
    sound(A, t0, len) { [[60, 64, 67, 71], [57, 60, 64, 67]].forEach((ch, i) => { if (i * 1.3 < len) ch.forEach((m, k) => A.piano(m + 12, t0 + i * 1.3 + k * 0.09, 1.4, 0.05)); }); A.shimmer(t0, len, 0.03); for (let x = 0.2; x < len; x += 0.45) A.celesta(91 + ((x * 7) | 0) % 5, t0 + x, 0.02); } },
  { name: 'NEON CHASE',
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 480, [[0, '#0b0820'], [1, '#2a1050']]));
      for (let i = 0; i < 14; i++) { const w = 40 + rnd(i) * 50, h = 120 + rnd(i + 2) * 220, x = ((i * 60 - t * 90) % 840 + 840) % 840 - 100; rf(c, x, 360 - h, w, h, 0, '#140f30'); if (i % 3 === 0) { rf(c, x + 6, 380 - h, w - 12, 26, 4, null, ['#ff3cac', '#2bd2ff', '#ffe14d'][i % 3], 3); txt(c, ['ネオン', 'ミライ', 'ヨル'][i % 3], x + w / 2, 393 - h, 14, ['#ff3cac', '#2bd2ff', '#ffe14d'][i % 3], { font: JP, weight: '900' }); } }
      rf(c, 0, 360, 640, 120, 0, '#0a0818');
      const f = Math.floor(t * 24);
      for (let k = 0; k < 18; k++) { const y = 370 + rnd(f * 11 + k) * 100, x = rnd(f * 5 + k) * 640, l = 120 + rnd(k + f) * 300; line(c, x, y, x + l, y, 3, ['#ff3cac', '#2bd2ff', '#ffe14d', '#fff'][k % 4]); }
      c.save(); c.translate(300, 410 + Math.sin(t * 30) * 2);
      dot(c, -50, 20, 22, '#000'); dot(c, 50, 20, 22, '#000'); dot(c, -50, 20, 10, '#555'); dot(c, 50, 20, 10, '#555');
      poly(c, [[-70, 10], [60, 10], [80, -14], [10, -24], [-40, -16]], '#e8443a'); poly(c, [[-10, -24], [20, -60], [40, -56], [30, -22]], AN.ink); dot(c, 22, -68, 14, AN.ink);
      line(c, 80, -10, 640, -40, 26, 'rgba(255,240,180,.18)');
      c.restore();
      txt(c, 'ギュンッ', 470, 120, 50, '#fff', { font: JP, weight: '900', italic: true, outer: ['#ff3cac', 12] });
    },
    sound(A, t0, len) { grid(t0, len, 160, 16, (i, at, st) => { A.bass([38, 38, 50, 38][i % 4], at, st * 0.9, 0.1); if (i % 4 === 0) A.kick(at, 0.5); if (i === 4 || i === 12) A.snare(at, 0.3); }); A.riser(t0, len, 0.04); A.zing(t0 + 0.2, 0.04); } },
  { name: 'SKY RUN',
    draw(c, t) {
      c.fillStyle = AN.s1; c.fillRect(0, 0, 640, 170); c.fillStyle = AN.s2; c.fillRect(0, 170, 640, 140); c.fillStyle = AN.s3; c.fillRect(0, 310, 640, 170);
      animeCloud(c, 470 - t * 20, 190, 1.6); animeCloud(c, 120 - t * 12, 110, 1.1);
      dot(c, 540, 70, 30, 'rgba(255,255,255,.5)'); dot(c, 470, 130, 12, 'rgba(255,255,255,.35)'); dot(c, 420, 175, 6, 'rgba(255,255,255,.35)');
      const tot = BLD.reduce((a, b) => a + b[0] + 6, 0), off = (t * 420) % tot;
      for (let rep = 0; rep < 3; rep++) { let x = -off + rep * tot; BLD.forEach(([w, h], i) => { rf(c, x, 360 - h, w, 200, 0, '#6f90c8'); if (i % 3 === 0) { line(c, x + w / 2, 360 - h, x + w / 2, 330 - h, 3, '#6f90c8'); } if (i % 3 === 1) rf(c, x + 10, 344 - h, 24, 16, 3, '#6f90c8'); x += w + 6; }); }
      rf(c, 0, 380, 640, 100, 0, '#18223a'); line(c, 0, 381, 640, 381, 3, '#3a4f7a');
      const p = t * 9, x = 260, y = 382 - Math.abs(Math.sin(p)) * 8;
      c.save(); c.translate(x, y);
      const lg = (ph) => { const a = Math.sin(ph) * 0.9; const kx = Math.sin(a) * 30, ky = Math.cos(a) * 30; line(c, 0, -60, kx, -60 + ky, 9, AN.ink); line(c, kx, -60 + ky, kx - 18 + Math.cos(ph) * 10, -60 + ky + 28, 8, AN.ink); };
      lg(p); lg(p + Math.PI);
      line(c, 0, -60, 12, -112, 15, AN.ink);
      line(c, 10, -104, 10 + Math.sin(p + Math.PI) * 28, -84, 8, AN.ink); line(c, 10, -104, 10 + Math.sin(p) * 28, -80, 8, AN.ink);
      dot(c, 16, -128, 15, AN.ink);
      c.beginPath(); c.moveTo(8, -114); for (let k = 0; k <= 6; k++) c.lineTo(-k * 16, -118 + Math.sin(t * 20 + k) * 6 + k * 2); for (let k = 6; k >= 0; k--) c.lineTo(-k * 16, -108 + Math.sin(t * 20 + k) * 6 + k * 2); c.fillStyle = AN.red; c.fill();
      c.restore();
      const f = Math.floor(t * 24);
      for (let k = 0; k < 14; k++) { const yy = rnd(f * 17 + k) * 480, xx = rnd(f * 23 + k) * 640, ln = 80 + rnd(f + k) * 200; line(c, xx, yy, xx + ln, yy, 2, 'rgba(255,255,255,.7)'); }
    },
    sound(A, t0, len) {
      const R = [40, 40, 43, 45], M = [64, 67, 69, 71, 74, 71, 69, 67];
      grid(t0, len, 170, 16, (i, at, st, n) => {
        if (on('x.......x.x.....', i)) A.kick(at, 0.5); if (i === 4 || i === 12) A.snare(at, 0.35); if (i % 2 === 0) A.hat(at, 0.08);
        if (i % 2 === 0) A.bass(R[Math.floor(n / 16) % 4], at, st * 1.5, 0.11);
        if (i % 2 === 0) A.lead(M[(i / 2) | 0], at, st * 1.8, 0.04, 'sawtooth');
      });
    } },
  { name: 'IMPACT', gain: 1.8,
    draw(c, t) {
      const f = Math.floor(t * 24), sh = (t % 0.7) < 0.2 ? 10 : 3;
      c.save(); c.translate((rnd(f) - 0.5) * sh, (rnd(f + 1) - 0.5) * sh);
      fillAll(c, '#fff');
      c.fillStyle = AN.ink; c.beginPath();
      for (let k = 0; k < 110; k++) { const a = rnd(f * 100 + k) * TAU, r0 = 150 + rnd(f * 50 + k) * 130, w = 0.006 + rnd(k) * 0.012; c.moveTo(320 + Math.cos(a) * r0, 240 + Math.sin(a) * r0); c.lineTo(320 + Math.cos(a - w) * 700, 240 + Math.sin(a - w) * 700); c.lineTo(320 + Math.cos(a + w) * 700, 240 + Math.sin(a + w) * 700); }
      c.fill();
      c.beginPath(); c.moveTo(170, 250); c.quadraticCurveTo(320, 130, 470, 236); c.quadraticCurveTo(320, 330, 170, 250); c.fillStyle = '#fff'; c.fill(); c.lineWidth = 6; c.strokeStyle = AN.ink; c.stroke();
      c.save(); c.clip();
      dot(c, 320, 240, 56, '#3a7bd5'); dot(c, 320, 250, 42, '#1d3f80'); dot(c, 320, 244, 20, '#0a0f1e'); dot(c, 300, 222, 12, '#fff'); dot(c, 340, 262, 5, '#fff');
      c.restore();
      c.beginPath(); c.moveTo(160, 252); c.quadraticCurveTo(320, 118, 480, 232); c.lineWidth = 14; c.strokeStyle = AN.ink; c.stroke();
      line(c, 210, 140, 420, 110, 16, AN.ink);
      c.restore();
      [[110, 140, -0.2], [540, 360, 0.2], [520, 120, 0.15]].forEach(([x, y, r], i) => txt(c, 'ゴゴゴ', x + (rnd(f + i) - 0.5) * 6, y, 46, AN.pur, { font: JP, weight: '900', outer: [AN.ink, 18], stroke: '#fff', lw: 9 }));
      if ((t % 0.7) < 0.05) { c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(0, 0, 640, 480); }
    },
    sound(A, t0, len) { A.drone(t0, len, 41, 0.06); for (let x = 0; x < len; x += 0.7) A.boom(t0 + x, 0.25); A.zing(t0 + 0.35, 0.04); } },
  { name: 'SPARKLE MAGIC',
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 480, [[0, '#ffa6d8'], [1, '#6c48c0']]));
      c.save(); c.translate(320, 250); c.rotate(t * 0.8);
      c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3;
      for (const r of [176, 152, 62]) { c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); }
      for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; line(c, Math.cos(a) * 156, Math.sin(a) * 156, Math.cos(a) * (k % 3 ? 164 : 172), Math.sin(a) * (k % 3 ? 164 : 172), 2, '#fff'); }
      c.beginPath(); for (let k = 0; k <= 7; k++) { const a = ((k * 3) / 7) * TAU - Math.PI / 2; c.lineTo(Math.cos(a) * 150, Math.sin(a) * 150); } c.stroke();
      for (let k = 0; k < 7; k++) { const a = (k / 7) * TAU - Math.PI / 2; dot(c, Math.cos(a) * 150, Math.sin(a) * 150, 8, '#fff'); }
      c.rotate(-t * 1.8); c.setLineDash([10, 8]); c.beginPath(); c.arc(0, 0, 108, 0, TAU); c.stroke(); c.setLineDash([]);
      c.restore();
      ['#ffe27a', '#9ff0ff', '#ffffff'].forEach((col, i) => {
        c.beginPath(); for (let a = 0; a < 7; a += 0.1) { const r = 40 + a * 30, aa = a + t * 2 + i * 2.1; c.lineTo(320 + Math.cos(aa) * r, 250 + Math.sin(aa) * r * 0.55 - a * 6); }
        c.lineWidth = 9; c.strokeStyle = col; c.globalAlpha = 0.75; c.stroke(); c.globalAlpha = 1;
      });
      const g = c.createRadialGradient(320, 250, 4, 320, 250, 80 + Math.sin(t * 6) * 10); g.addColorStop(0, '#fff'); g.addColorStop(0.4, 'rgba(255,230,250,.8)'); g.addColorStop(1, 'rgba(255,180,230,0)');
      dot(c, 320, 250, 90, g);
      const f = Math.floor(t * 12);
      for (let i = 0; i < 16; i++) sparkle4(c, rnd(f * 3 + i) * 640, rnd(f * 7 + i) * 480, rnd(f + i * 9) * 18);
      txt(c, 'キラッ', 140 + rnd(f) * 40, 100, 34, '#fff', { font: JP, weight: '900', outer: [AN.pur, 10] });
    },
    sound(A, t0, len) {
      const ar = [72, 76, 79, 83, 84, 88, 91, 95];
      grid(t0, len, 150, 8, (i, at) => A.celesta(ar[i], at, 0.05));
      A.pad([60, 64, 67, 71], t0, len, 0.03); A.shimmer(t0, len, 0.04);
    } },
  { name: 'SUNSET TRAIN', gain: 4,
    draw(c, t) {
      [['#5a3f92', 0, 120], ['#b45a8e', 120, 200], ['#ff8a5c', 200, 270], ['#ffcf70', 270, 340]].forEach(([col, a, b]) => { c.fillStyle = col; c.fillRect(0, a, 640, b - a); });
      dot(c, 430, 300, 52, '#fff1b8');
      for (let i = 0; i < 16; i++) { const w = 30 + rnd(i) * 40, h = 20 + rnd(i + 3) * 60, x = ((i * 48 - t * 18) % 760 + 760) % 760 - 60; rf(c, x, 340 - h, w, h + 10, 0, '#4a3270'); }
      rf(c, 0, 340, 640, 140, 0, '#33224d');
      const sp = 300, off = (t * 520) % sp;
      for (let x = -off - sp; x < 700 + sp; x += sp) {
        c.beginPath(); c.moveTo(x, 150); c.quadraticCurveTo(x + sp / 2, 190, x + sp, 150); c.moveTo(x, 172); c.quadraticCurveTo(x + sp / 2, 210, x + sp, 172); c.lineWidth = 2; c.strokeStyle = '#20152e'; c.stroke();
        rf(c, x - 5, 130, 10, 350, 0, '#20152e'); rf(c, x - 30, 146, 60, 8, 0, '#20152e');
      }
      c.beginPath(); c.rect(0, 0, 640, 480); c.roundRect(60, 46, 520, 330, 28); c.fillStyle = '#151020'; c.fill('evenodd');
      c.beginPath(); c.roundRect(60, 46, 520, 330, 28); c.lineWidth = 3; c.strokeStyle = '#ff9a6a'; c.stroke();
      ell(c, 160, 470, 120, 70, 0, '#0b0812', 0); dot(c, 160, 362, 50, '#0b0812');
      c.beginPath(); c.arc(160, 362, 50, -1.1, 0.6); c.lineWidth = 3; c.strokeStyle = '#ff9a6a'; c.stroke();
      const near = Math.min(...[0, 1, 2, 3].map((k) => Math.abs(((-off + k * sp) % sp + sp) % sp - 320)));
      if (near < 40) { c.fillStyle = `rgba(0,0,0,${0.18 * (1 - near / 40)})`; c.fillRect(0, 0, 640, 480); }
    },
    sound(A, t0, len) {
      for (let x = 0.05; x < len; x += 0.9) { A.chuff(t0 + x, 0.1); A.chuff(t0 + x + 0.13, 0.08); }
      A.rumble(t0, len, 0.05);
      [[53, 57, 60, 64], [52, 55, 59, 62]].forEach((ch, i) => { if (i * 1.4 < len) ch.forEach((m, k) => A.piano(m + 12, t0 + i * 1.4 + k * 0.06, 1.6, 0.04)); });
    } },
  { name: 'TITLE CARD',
    draw(c, t) {
      fillAll(c, '#1e9fb4');
      const s = eo(t / 0.3) * 260 - 260;
      poly(c, [[0, 0], [400 + s, 0], [240 + s, 480], [0, 480]], '#ff7a3d');
      poly(c, [[400 + s, 0], [430 + s, 0], [270 + s, 480], [240 + s, 480]], '#fff');
      txt(c, '第7話', 130 + s * 0.6, 130, 46, '#fff', { font: JP, weight: '900', outer: [AN.ink, 12] });
      const k = t < 0.25 ? 0 : t < 0.4 ? 1.25 - ((t - 0.25) / 0.15) * 0.25 : 1;
      c.save(); c.translate(330, 260); c.scale(k, k); c.rotate(-0.04);
      txt(c, '空とシグナル', 0, 0, 76, '#fff', { font: JP, weight: '900', outer: [AN.ink, 18] }); c.restore();
      if (t > 0.4) txt(c, 'SORA TO SIGNAL', 330, 334, 20, '#fff', { italic: true, weight: '800', outer: [AN.ink, 6] });
      for (let i = 0; i < 8; i++) sparkle4(c, 360 + rnd(i) * 260, 60 + rnd(i + 4) * 120, Math.abs(Math.sin(t * 7 + i)) * 16);
    },
    sound(A, t0, len) { A.pad([48, 55, 60, 64, 67], t0, 0.9, 0.08, 'sawtooth'); A.boom(t0, 0.2); A.noise(t0, 0.8, 'highpass', 5000, 0.5, 0.08); [84, 88, 91, 96].forEach((m, i) => A.celesta(m, t0 + 0.4 + i * 0.08, 0.05)); } },
];

// ---------- ニュース ----------
const NW = { navy: '#0c2647', blue: '#1b5ea6', red: '#d7262e', g: '#e8eef5', gold: '#f2b705', up: '#3ee08f', down: '#ff5a5a' };
const STOCK = '  ZX指数 38,412.07 ▲128.55    KTR 1,204 ▲12    MNO 873 ▼5    円/ドル 151.20    LBX 2,950 ▲31    ORI 611 ▼2  ';
const CHART = (() => { let v = 0; return Array.from({ length: 80 }, (_, i) => (v += (rnd(i * 3.3) - 0.45) * 12)); })();
function newsChrome(c, t, head, tag = 'NEWS', tagCol = NW.blue) {
  rf(c, 16, 16, 108, 34, 3, NW.red); txt(c, 'N8 NEWS', 70, 33, 18, '#fff', { weight: '900' });
  rf(c, 532, 16, 92, 34, 3, 'rgba(8,14,24,.75)'); txt(c, '18:42', 578, 33, 20, '#fff', { font: MONO, weight: '700' });
  const sx = (1 - eo(t / 0.35)) * -640;
  c.save(); c.translate(sx, 0);
  rf(c, 0, 352, 640, 58, 0, 'rgba(255,255,255,.96)'); rf(c, 0, 352, 8, 58, 0, NW.red);
  rf(c, 16, 328, 90, 26, 0, tagCol); txt(c, tag, 61, 341, 15, '#fff', { font: JP, weight: '900' });
  txt(c, head, 24, 381, 28, NW.navy, { font: JP, weight: '900', align: 'left' });
  c.restore();
  rf(c, 0, 440, 640, 40, 0, NW.navy); rf(c, 0, 440, 110, 40, 0, NW.blue); txt(c, 'MARKET', 55, 460, 15, '#fff', { weight: '900' });
  c.save(); c.beginPath(); c.rect(110, 440, 530, 40); c.clip();
  c.font = `700 18px ${JP}`; const w = c.measureText(STOCK).width, x = 640 - ((t * 110) % w);
  txt(c, STOCK, x, 460, 18, '#fff', { font: JP, weight: '700', align: 'left' }); txt(c, STOCK, x - w, 460, 18, '#fff', { font: JP, weight: '700', align: 'left' });
  c.restore();
}
function anchor(c, t, x, talk = true) {
  c.beginPath(); c.moveTo(x - 110, 352); c.quadraticCurveTo(x - 100, 250, x, 242); c.quadraticCurveTo(x + 100, 250, x + 110, 352); c.fillStyle = '#1a2233'; c.fill();
  poly(c, [[x - 24, 244], [x + 24, 244], [x, 300]], '#fff'); poly(c, [[x - 7, 252], [x + 7, 252], [x + 9, 300], [x, 310], [x - 9, 300]], NW.red);
  rf(c, x - 16, 222, 32, 26, 6, '#e3b998');
  ell(c, x, 186, 40, 48, 0, '#e9c3a5', 0);
  c.beginPath(); c.ellipse(x, 172, 44, 38, 0, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(x + 40, 178); c.quadraticCurveTo(x, 150, x - 40, 178); c.fillStyle = '#2a211c'; c.fill();
  dot(c, x - 14, 186, 3.5, '#222'); dot(c, x + 14, 186, 3.5, '#222');
  ell(c, x, 212, 9, talk ? 1.5 + Math.abs(Math.sin(t * 14)) * 4 : 1.5, 0, '#8a3a3a', 0);
}
function deskBg(c, t) {
  fillAll(c, vgrad(c, 0, 480, [[0, '#0b2a55'], [1, '#1d64b0']]));
  for (let i = 0; i < 6; i++) rf(c, 40 + i * 110, 0, 40, 480, 0, 'rgba(255,255,255,.05)');
  c.strokeStyle = 'rgba(255,255,255,.22)'; c.lineWidth = 2;
  dot(c, 470, 190, 160, 'rgba(255,255,255,.04)'); c.beginPath(); c.arc(470, 190, 160, 0, TAU); c.stroke();
  for (let k = 0; k < 6; k++) { const rx = 160 * Math.abs(Math.cos(t * 0.4 + k * 0.52)); c.beginPath(); c.ellipse(470, 190, Math.max(1, rx), 160, 0, 0, TAU); c.stroke(); }
  for (const dy of [-110, -55, 0, 55, 110]) { const rx = Math.sqrt(160 * 160 - dy * dy); line(c, 470 - rx, 190 + dy, 470 + rx, 190 + dy, 2, 'rgba(255,255,255,.22)'); }
}
const NEWS = [
  { name: 'SPORTS', gain: 2.4,
    draw(c, t) {
      fillAll(c, '#2f8f4a'); for (let k = 0; k < 8; k++) rf(c, k * 80, 0, 40, 480, 0, 'rgba(255,255,255,.05)');
      c.strokeStyle = '#fff'; c.lineWidth = 3; c.strokeRect(40, 70, 560, 260); line(c, 320, 70, 320, 330, 3, '#fff'); c.beginPath(); c.arc(320, 200, 50, 0, TAU); c.stroke();
      for (let k = 0; k < 10; k++) { const x = 100 + rnd(k) * 440 + Math.sin(t * 2 + k) * 30, y = 100 + rnd(k + 9) * 200 + Math.cos(t * 1.7 + k) * 20; dot(c, x, y, 9, k < 5 ? NW.red : '#fff'); }
      dot(c, 320 + Math.sin(t * 3) * 120, 200 + Math.sin(t * 5) * 60, 6, '#ffe14d');
      rf(c, 180, 14, 280, 44, 4, NW.navy); txt(c, 'HOME  3 - 2  AWAY', 320, 37, 24, '#fff', { weight: '900' });
      newsChrome(c, t, '終盤に逆転、白熱の一戦', 'SPORTS', '#2e9a4f');
    },
    sound(A, t0, len) { A.crowd(t0, len); A.chime2(t0 + 0.1, 2093, 2093, 0.03); if (len > 0.7) A.voice(t0 + 0.6, len - 0.65, 135, 0.06); } },
  { name: 'TRAFFIC', gain: 2.2,
    draw(c, t) {
      fillAll(c, '#c9d3c0'); for (let k = 0; k < 12; k++) rf(c, (k % 4) * 170 + 10, Math.floor(k / 4) * 120 + 10, 140, 90, 6, '#b6c2ae');
      c.save(); c.translate(320, 220); c.rotate(-0.35); rf(c, -500, -36, 1000, 72, 0, '#555c66'); line(c, -500, 0, 500, 0, 3, '#e8e8e8');
      for (let k = 0; k < 16; k++) { const x = ((k * 70 + t * (k % 2 ? 60 : -40)) % 1000 + 1000) % 1000 - 500; rf(c, x, k % 2 ? -26 : 8, 30, 16, 4, ['#fff', '#d7262e', '#1b5ea6', '#f2b705'][k % 4]); }
      line(c, -160, -18, 120, -18, 8, 'rgba(215,38,46,.75)'); c.restore();
      rf(c, 470, 70, 150, 40, 4, NW.red); txt(c, '渋滞 4km', 545, 90, 22, '#fff', { font: JP, weight: '900' });
      newsChrome(c, t, '夕方の交通情報です', '交通', '#e07a10');
    },
    sound(A, t0, len) { A.rumble(t0, len, 0.04); A.chime2(t0 + 0.05, 1568, 1318, 0.04); if (len > 0.6) A.voice(t0 + 0.5, len - 0.55, 150, 0.06); } },
  { name: 'NEWS DESK', gain: 1.6,
    draw(c, t) {
      deskBg(c, t); anchor(c, t, 250, t > 0.9);
      rf(c, 40, 300, 560, 60, 10, NW.g); rf(c, 40, 314, 560, 8, 0, NW.blue);
      newsChrome(c, t, '各地で新しい情報、相次ぐ');
    },
    sound(A, t0, len) {
      [[[60, 64, 67], 0], [[62, 65, 70], 0.18], [[65, 69, 72], 0.36], [[67, 72, 76], 0.54]].forEach(([ch, at], i) => ch.forEach((m) => A.brass(m, t0 + at, i === 3 ? 0.4 : 0.14, 0.04)));
      A.timp(t0 + 0.54); if (len > 1.1) A.voice(t0 + 0.95, len - 1.0, 118, 0.07);
    } },
  { name: 'BREAKING', gain: 2.5,
    draw(c, t) {
      deskBg(c, t); anchor(c, t, 250, false); rf(c, 40, 300, 560, 60, 10, NW.g);
      c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(0, 0, 640, 480);
      rf(c, 0, 150, 640, 128, 0, Math.floor(t * 4) % 2 ? NW.red : '#a5121a');
      line(c, 0, 156, 640, 156, 3, '#fff'); line(c, 0, 272, 640, 272, 3, '#fff');
      txt(c, 'ニュース速報', 320, 200, 56, '#fff', { font: JP, weight: '900' });
      txt(c, 'BREAKING NEWS', 320, 250, 22, '#ffd2d2', { weight: '900' });
      rf(c, 0, 0, 640, 48, 0, 'rgba(5,10,20,.88)');
      const s = '速報　情報が入り次第お伝えします　'; c.font = `900 24px ${JP}`; const w = c.measureText(s).width, x = 640 - ((t * 200) % (w + 640));
      txt(c, s, x, 25, 24, '#fff', { font: JP, weight: '900', align: 'left' });
    },
    sound(A, t0, len) { A.chime2(t0 + 0.02, 1046, 784, 0.06); A.chime2(t0 + 0.55, 1046, 784, 0.06); if (len > 1.3) A.voice(t0 + 1.2, len - 1.25, 125, 0.07); } },
  { name: 'WEATHER', gain: 1.3,
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 480, [[0, '#1d6fa8'], [1, '#0f4677']]));
      [[250, 190, 0.85, 0.62], [470, 120, 0.32, 0.28], [500, 260, 0.26, 0.22]].forEach(([x, y, sx, sy]) => {
        c.beginPath(); LAND.forEach(([px, py], i) => (i ? c.lineTo(x + px * sx, y + py * sy) : c.moveTo(x + px * sx, y + py * sy))); c.closePath();
        c.fillStyle = '#7fbf6a'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#e8f2dc'; c.stroke();
      });
      const sunI = (x, y, s = 1) => { c.save(); c.translate(x, y); c.scale(s, s); c.rotate(t); for (let k = 0; k < 8; k++) { c.rotate(TAU / 8); rf(c, 26, -4, 14, 8, 4, '#ffc93c'); } c.restore(); dot(c, x, y, 22 * s, '#ffc93c'); };
      const cl = (x, y) => { dot(c, x - 16, y + 4, 16, '#fff'); dot(c, x + 4, y - 6, 22, '#fff'); dot(c, x + 24, y + 6, 14, '#fff'); rf(c, x - 30, y + 4, 66, 18, 9, '#fff'); };
      sunI(180, 120 + Math.sin(t * 3) * 3); cl(330, 160); cl(520, 230); for (let k = 0; k < 5; k++) { const yy = 260 + ((t * 120 + k * 17) % 40); line(c, 506 + k * 8, yy, 502 + k * 8, yy + 8, 3, '#9fd3ff'); }
      [[210, 220, '23°', NW.red], [300, 260, '19°', NW.blue], [470, 150, '26°', NW.red], [430, 290, '17°', NW.blue]].forEach(([x, y, s, col]) => { rf(c, x - 34, y - 18, 68, 36, 18, col); txt(c, s, x, y + 1, 22, '#fff', { weight: '900' }); });
      rf(c, 16, 16, 196, 42, 3, NW.blue); txt(c, 'きょうの天気', 114, 37, 24, '#fff', { font: JP, weight: '900' });
      rf(c, 0, 342, 640, 138, 0, 'rgba(8,20,40,.85)');
      ['月', '火', '水', '木', '金'].forEach((d, i) => {
        const x = 64 + i * 128; txt(c, d, x, 366, 20, '#fff', { font: JP, weight: '800' });
        if (i % 2) cl(x - 4, 406); else sunI(x, 410, 0.7);
        txt(c, `${24 - i}`, x - 22, 452, 20, '#ff8a7a', { weight: '900' }); txt(c, `${16 - (i % 3)}`, x + 22, 452, 20, '#8cc8ff', { weight: '900' });
      });
    },
    sound(A, t0, len) { [84, 88, 91, 96].forEach((m, i) => A.xylo(m - 12, t0 + 0.05 + i * 0.12)); if (len > 0.8) A.voice(t0 + 0.7, len - 0.75, 150, 0.06); } },
  { name: 'MARKETS', gain: 1.6,
    draw(c, t) {
      fillAll(c, '#071a33');
      for (let x = 40; x <= 600; x += 70) line(c, x, 90, x, 320, 1, 'rgba(255,255,255,.08)');
      for (let y = 90; y <= 320; y += 46) line(c, 40, y, 600, y, 1, 'rgba(255,255,255,.08)');
      const n = Math.max(2, Math.floor(eo(t / 1.4) * CHART.length)), mn = Math.min(...CHART), mx = Math.max(...CHART);
      const P2 = CHART.slice(0, n).map((v, i) => [40 + (i / (CHART.length - 1)) * 560, 310 - ((v - mn) / (mx - mn)) * 200]);
      c.beginPath(); P2.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineTo(P2[P2.length - 1][0], 320); c.lineTo(40, 320); c.closePath();
      c.fillStyle = vgrad(c, 100, 320, [[0, 'rgba(62,224,143,.45)'], [1, 'rgba(62,224,143,0)']]); c.fill();
      c.beginPath(); P2.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.lineWidth = 3; c.strokeStyle = NW.up; c.stroke();
      const [ex, ey] = P2[P2.length - 1]; dot(c, ex, ey, 6 + Math.abs(Math.sin(t * 8)) * 4, NW.up);
      txt(c, 'ZX指数', 40, 62, 24, '#fff', { font: JP, weight: '900', align: 'left' });
      txt(c, '38,412.07', 150, 62, 32, '#fff', { weight: '900', align: 'left' });
      txt(c, '▲ +128.55 (+0.34%)', 340, 64, 20, NW.up, { font: JP, weight: '800', align: 'left' });
      newsChrome(c, t, '市場は小幅に上昇', 'MARKET', NW.blue);
    },
    sound(A, t0, len) { grid(t0, len, 112, 8, (i, at) => { A.bass(i % 4 ? 45 : 38, at, 0.1, 0.05, 'triangle'); if (i % 2) A.blip(at); }); if (len > 0.6) A.voice(t0 + 0.5, len - 0.55, 112, 0.06); } },
  { name: 'FIELD REPORT', gain: 2.2,
    draw(c, t) {
      fillAll(c, vgrad(c, 0, 340, [[0, '#9cc7ea'], [1, '#e2ecf4']]));
      for (let i = 0; i < 12; i++) rf(c, i * 58 - 10, 330 - (60 + rnd(i) * 140), 52, 300, 0, '#aab9c9');
      for (let i = 0; i < 8; i++) { const h = 90 + rnd(i + 20) * 150, x = i * 84 - 20; rf(c, x, 340 - h, 76, h, 0, '#6f8094'); for (let k = 0; k < 6; k++) rf(c, x + 10 + (k % 2) * 32, 352 - h + Math.floor(k / 2) * 30, 22, 14, 0, 'rgba(255,255,255,.35)'); }
      rf(c, 0, 330, 640, 150, 0, '#5a6470');
      for (let k = 0; k < 4; k++) { const x = ((k * 190 + t * (60 + k * 25)) % 800) - 80; rf(c, x, 250, 26, 90, 13, 'rgba(40,46,56,.45)'); }
      const x = 420;
      poly(c, [[x - 70, 480], [x - 56, 300], [x + 56, 300], [x + 70, 480]], '#2d3a4f');
      ell(c, x, 252, 34, 42, 0, '#e5bf9f', 0); c.beginPath(); c.ellipse(x, 238, 38, 32, 0, Math.PI, TAU); c.fillStyle = '#3a2a20'; c.fill();
      line(c, x - 50, 330, x - 70, 290, 14, '#2d3a4f'); line(c, x - 70, 290, x - 52, 268, 6, '#222');
      rf(c, x - 82, 250, 34, 28, 3, NW.red); txt(c, 'N8', x - 65, 264, 13, '#fff', { weight: '900' });
      rf(c, 536, 62, 72, 28, 3, Math.floor(t * 2) % 2 ? NW.red : '#8a0f14'); txt(c, '● LIVE', 572, 76, 14, '#fff', { weight: '900' });
      newsChrome(c, t, '中央駅前から中継です', '中継', NW.red);
    },
    sound(A, t0, len) { A.rumble(t0, len, 0.035); A.whoosh(t0 + 0.6, 0.9, 0.04); A.voice(t0 + 0.15, len - 0.2, 165, 0.07, true); } },
];

const GENRES = {
  cartoon: { list: PROGRAMS, fps: 12, post: 'film', osd: 'dial' },
  color: { list: COLOR, fps: 30, post: 'crt', osd: 'green' },
  modern: { list: MODERN, fps: 0, post: 'clean', osd: 'white' },
  anime: { list: ANIME, fps: 24, post: 'clean', osd: 'white' },
  news: { list: NEWS, fps: 0, post: 'clean', osd: 'white' },
};
export const TV_GENRES = Object.keys(GENRES);

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
    ctx: ac, lvl, bus,
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
    tone(t, d, f = 880, v = 0.045) {
      const g = ac.createGain(); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.05); g.gain.setValueAtTime(v, t + d - 0.05); g.gain.linearRampToValueAtTime(0, t + d);
      osc('sine', f, t, t + d + 0.02, g);
    },
    noise(t, d, type, f, q, v) { noise(t, d, type, f, q, v); },
    // ---- ここから カートゥーン以外のジャンル用 ----
    kick(t, v = 0.5) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, v * 0.5, 0.22); const x = osc('sine', 150, t, t + 0.26, g); x.frequency.exponentialRampToValueAtTime(45, t + 0.12); },
    snare(t, v = 0.3) { noise(t, 0.13, 'highpass', 1400, 0.7, v * 0.6); const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, v * 0.3, 0.07); osc('triangle', 190, t, t + 0.1, g); },
    hat(t, v = 0.1, open = false) { noise(t, open ? 0.22 : 0.035, 'highpass', 7500, 0.8, v); },
    clap(t, v = 0.25) { [0, 0.011, 0.022].forEach((d) => noise(t + d, 0.02, 'bandpass', 1300, 1.2, v * 0.7)); noise(t + 0.03, 0.12, 'bandpass', 1200, 1, v * 0.5); },
    bass(m, t, d, v = 0.1, type = 'sawtooth') {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.Q.value = 4; fl.frequency.setValueAtTime(900, t); fl.frequency.exponentialRampToValueAtTime(260, t + d);
      const g = ac.createGain(); fl.connect(g); g.connect(bus); env(g, t, 0.004, v, d); osc(type, mtof(m), t, t + d + 0.05, fl);
    },
    lead(m, t, d, v = 0.05, type = 'square') {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 2600;
      const g = ac.createGain(); fl.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.008); g.gain.setValueAtTime(v * 0.8, t + d * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      [-6, 6].forEach((dt) => { osc(type, mtof(m), t, t + d + 0.05, fl).detune.value = dt; });
    },
    pad(ms, t, d, v = 0.04, type = 'sawtooth') {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1100;
      const g = ac.createGain(); fl.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + Math.min(0.15, d * 0.3)); g.gain.setValueAtTime(v, t + d * 0.75); g.gain.linearRampToValueAtTime(0, t + d);
      ms.forEach((m) => [-8, 8].forEach((dt) => { osc(type, mtof(m), t, t + d + 0.05, fl).detune.value = dt; }));
    },
    epiano(m, t, d, v = 0.04) {
      const g = ac.createGain(); g.connect(bus); env(g, t, 0.004, v, d); osc('sine', mtof(m), t, t + d + 0.05, g);
      const g2 = ac.createGain(); g2.connect(bus); env(g2, t, 0.002, v * 0.4, 0.25); osc('sine', mtof(m) * 4, t, t + 0.3, g2);
    },
    celesta(m, t, v = 0.05) {
      const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, v, 0.6); osc('sine', mtof(m), t, t + 0.65, g);
      const g2 = ac.createGain(); g2.connect(bus); env(g2, t, 0.002, v * 0.5, 0.15); osc('sine', mtof(m) * 4, t, t + 0.2, g2);
    },
    sub808(m, t, d, v = 0.2) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.004, v, d); const x = osc('sine', mtof(m + 12), t, t + d + 0.05, g); x.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.06); },
    chime2(t, f1, f2, v = 0.06) { [[f1, 0], [f2, 0.24]].forEach(([f, d]) => { const g = ac.createGain(); g.connect(bus); env(g, t + d, 0.01, v, 0.7); osc('sine', f, t + d, t + d + 0.75, g); const g2 = ac.createGain(); g2.connect(bus); env(g2, t + d, 0.01, v * 0.25, 0.4); osc('sine', f * 2, t + d, t + d + 0.45, g2); }); },
    buzzer(t, d) { const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1800; const g = ac.createGain(); fl.connect(g); g.connect(bus); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.07, t + 0.01); g.gain.setValueAtTime(0.07, t + d - 0.03); g.gain.linearRampToValueAtTime(0, t + d); osc('square', 160, t, t + d, fl); osc('sawtooth', 167, t, t + d, fl); },
    bubble(t) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, 0.04, 0.05); const x = osc('sine', 300 + Math.random() * 300, t, t + 0.08, g); x.frequency.exponentialRampToValueAtTime(1400 + Math.random() * 600, t + 0.05); },
    boom(t, v = 0.2) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.003, v, 0.6); const x = osc('sine', 95, t, t + 0.7, g); x.frequency.exponentialRampToValueAtTime(32, t + 0.5); noise(t, 0.3, 'lowpass', 900, 0.7, v * 0.5); },
    pop(t) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, 0.07, 0.07); const x = osc('sine', 420, t, t + 0.1, g); x.frequency.exponentialRampToValueAtTime(1300, t + 0.05); },
    pikon(t) { [1318, 2637].forEach((f, i) => { const g = ac.createGain(); g.connect(bus); env(g, t + i * 0.07, 0.003, 0.05, 0.25); osc('sine', f, t + i * 0.07, t + i * 0.07 + 0.3, g); }); },
    zing(t, v = 0.04) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.005, v, 0.35); const x = osc('sine', 2600, t, t + 0.4, g); x.frequency.exponentialRampToValueAtTime(6200, t + 0.3); noise(t, 0.3, 'highpass', 7000, 0.7, v); },
    whoosh(t, d, v = 0.08) { const fl = noise(t, d, 'bandpass', 500, 1.4, v); fl.frequency.setValueAtTime(500, t); fl.frequency.exponentialRampToValueAtTime(4500, t + d); },
    riser(t, d, v = 0.05) {
      const s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true; const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 2;
      fl.frequency.setValueAtTime(400, t); fl.frequency.exponentialRampToValueAtTime(7000, t + d);
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + d * 0.9); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t); s.stop(t + d + 0.05);
    },
    laugh(t, d) {
      for (let k = 0; k < 6; k++) {
        const f = 500 + Math.random() * 700;
        for (let x = Math.random() * 0.08; x < d; x += 0.11 + Math.random() * 0.06) noise(t + x, 0.06, 'bandpass', f * (1 + (Math.random() - 0.5) * 0.1), 4, 0.06 * (1 - x / d * 0.6));
      }
    },
    jump(t) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.002, 0.03, 0.14); const x = osc('square', 280, t, t + 0.16, g); x.frequency.exponentialRampToValueAtTime(900, t + 0.13); },
    coin(t) { const g = ac.createGain(); g.connect(bus); g.gain.setValueAtTime(0.03, t); g.gain.setValueAtTime(0.03, t + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); const x = osc('square', 988, t, t + 0.36, g); x.frequency.setValueAtTime(1319, t + 0.06); },
    drone(t, d, m, v = 0.06) {
      const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(200, t); fl.frequency.linearRampToValueAtTime(700, t + d);
      const g = ac.createGain(); fl.connect(g); g.connect(bus); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.3); g.gain.setValueAtTime(v, t + d - 0.15); g.gain.linearRampToValueAtTime(0, t + d);
      [0, 7, 12].forEach((s) => osc('sawtooth', mtof(m + s), t, t + d + 0.05, fl));
    },
    shimmer(t, d, v = 0.04) {
      const s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true; const fl = ac.createBiquadFilter(); fl.type = 'highpass'; fl.frequency.value = 8000;
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + d * 0.5); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t); s.stop(t + d + 0.05);
    },
    rumble(t, d, v = 0.05) {
      const s = ac.createBufferSource(); s.buffer = nbuf; s.loop = true; s.playbackRate.value = 0.5; const fl = ac.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 500;
      const g = ac.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.15); g.gain.setValueAtTime(v, t + d - 0.15); g.gain.linearRampToValueAtTime(0, t + d);
      s.connect(fl); fl.connect(g); g.connect(bus); s.start(t); s.stop(t + d + 0.05);
    },
    timp(t) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.004, 0.18, 0.7); const x = osc('sine', 110, t, t + 0.8, g); x.frequency.exponentialRampToValueAtTime(82, t + 0.4); },
    blip(t) { const g = ac.createGain(); g.connect(bus); env(g, t, 0.001, 0.025, 0.04); osc('sine', 1760 + Math.random() * 800, t, t + 0.06, g); },
    // アナウンサーの気配：言葉ではなく、母音の並びと抑揚だけ（ノコギリ波＋2本のフォルマント）
    voice(t, d, f0 = 120, v = 0.07, radio = false) {
      if (d < 0.2) return;
      const src = ac.createOscillator(); src.type = 'sawtooth';
      const f1 = ac.createBiquadFilter(); f1.type = 'bandpass'; f1.Q.value = 7;
      const f2 = ac.createBiquadFilter(); f2.type = 'bandpass'; f2.Q.value = 9;
      const g = ac.createGain(); g.gain.value = 0;
      src.connect(f1); src.connect(f2); f1.connect(g); f2.connect(g);
      let out = g;
      if (radio) { const hp2 = ac.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 600; g.connect(hp2); out = hp2; }
      out.connect(bus);
      const VW = [[730, 1090], [270, 2290], [300, 870], [530, 1840], [570, 840]];
      let x = t, ph = t;
      src.frequency.setValueAtTime(f0 * 1.15, t);
      while (x < t + d - 0.12) {
        const sd = 0.08 + Math.random() * 0.1, [a, b] = VW[(Math.random() * 5) | 0];
        f1.frequency.setTargetAtTime(a, x, 0.015); f2.frequency.setTargetAtTime(b, x, 0.015);
        const decl = 1.18 - Math.min(1, (x - ph) / 1.6) * 0.32;
        src.frequency.setTargetAtTime(f0 * decl * (1 + (Math.random() - 0.5) * 0.08), x, 0.04);
        g.gain.setTargetAtTime(v * 5, x, 0.012); g.gain.setTargetAtTime(v * 0.6, x + sd * 0.65, 0.02);
        if (Math.random() < 0.3) noise(x, 0.03, 'highpass', 4000, 0.8, v * 0.25);
        x += sd;
        if (Math.random() < 0.1) { g.gain.setTargetAtTime(0, x, 0.03); x += 0.18 + Math.random() * 0.15; ph = x; src.frequency.setTargetAtTime(f0 * 1.18, x - 0.05, 0.03); }
      }
      g.gain.setTargetAtTime(0, x, 0.04);
      src.start(t); src.stop(t + d + 0.2);
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
function vignette(edge = 0.85, mid = 0.22, scan = 0.1) {
  const cv = document.createElement('canvas'); cv.width = 640; cv.height = 480;
  const g = cv.getContext('2d');
  const r = g.createRadialGradient(320, 240, 150, 320, 240, 430);
  r.addColorStop(0, 'rgba(12,9,5,0)'); r.addColorStop(0.6, `rgba(12,9,5,${mid})`); r.addColorStop(1, `rgba(12,9,5,${edge})`);
  g.fillStyle = r; g.fillRect(0, 0, 640, 480);
  g.fillStyle = `rgba(0,0,0,${scan})`; for (let y = 0; y < 480; y += 3) g.fillRect(0, y, 640, 1);
  return cv;
}

// 同じジャンルのテレビが何台あっても、同時に同じ番組を流さないための共有表（ジャンル → いま流している番組の番号）
const PLAYING = {};
let SERIAL = 0;

export function createTVShow({ width = 640, height = 480, genre = 'cartoon' } = {}) {
  const G = GENRES[genre] || GENRES.cartoon, LIST = G.list;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const c = canvas.getContext('2d', { alpha: false });
  const SX = width / 640, SY = height / 480;
  const grain = [0, 1, 2, 3].map(() => noiseTile(400, 300, 70));
  const snow = [0, 1, 2].map(() => noiseTile(214, 160, 255));
  const vig = G.post === 'film' ? vignette() : G.post === 'crt' ? vignette(0.7, 0.16, 0.13) : vignette(0.45, 0.08, 0.06);
  const SW = 0.17;                       // 切り替えの砂嵐の長さ（秒）
  let level = 1, A = null, disposed = false;
  let cur = -1, start = 0, len = 2, iris = { open: false, close: false }, chan = 2 + ((Math.random() * 10) | 0), bag = [], first = true;
  let scratches = [], lastF = -1, fx = { ox: 0, oy: 0, fl: 0 };
  const gkey = GENRES[genre] ? genre : 'cartoon', id = ++SERIAL; (PLAYING[gkey] ||= new Map());

  function audio() {
    const o = window.SND?.out?.();
    if (!o || disposed) return null;
    if (!A || A.ctx !== o.ctx) A = makeAudio(o, level);
    return A;
  }
  function pick() {
    if (!bag.length) { bag = LIST.map((_, i) => i).sort(() => Math.random() - 0.5); if (bag[0] === cur) bag.push(bag.shift()); }
    const busy = new Set([...PLAYING[gkey]].filter(([k]) => k !== id).map(([, v]) => v));
    let j = bag.findIndex((i) => !busy.has(i) && i !== cur);
    if (j < 0) { const free = LIST.map((_, i) => i).filter((i) => !busy.has(i) && i !== cur); if (free.length) { bag.push(free[(Math.random() * free.length) | 0]); j = bag.length - 1; } else j = 0; }
    const i = bag.splice(j, 1)[0];
    PLAYING[gkey].set(id, i);
    return i;
  }
  function next(t) {
    cur = pick(); start = t;
    // 1本目は長さをばらつかせ、同じジャンルのテレビが何台あっても切り替えがそろわないようにする
    len = first ? 0.4 + Math.random() * 2.4 : 1.5 + Math.random() * 1.5; first = false;
    iris = G.post === 'film' ? { open: Math.random() < 0.35, close: Math.random() < 0.3 } : { open: false, close: false };
    chan = 2 + ((chan + 1 + ((Math.random() * 3) | 0)) % 12);
    const a = audio();
    if (a) {
      const t0 = a.ctx.currentTime;
      const p = LIST[cur];
      a.bus.gain.setValueAtTime(p.gain || 1, t0);   // 番組ごとの音量の釣り合い
      a.static(t0);
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
    if (G.post === 'film') {
      c.drawImage(grain[fx.g], fx.gx, fx.gy, 320, 240, 0, 0, 640, 480);
      fx.dust.forEach(([x, y, r, dark]) => circ(c, x, y, r, dark ? 'rgba(18,14,9,.85)' : 'rgba(250,242,225,.8)', 0));
      if (fx.hair) { const [x, y, a] = fx.hair; c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30, x + 40, y - 20, x + Math.cos(a + 1) * 60, y + Math.sin(a + 1) * 60); c.lineWidth = 1.2; c.strokeStyle = 'rgba(18,14,9,.7)'; c.stroke(); }
      if (!still) scratches.forEach((s) => { c.beginPath(); c.moveTo(s.x, 0); c.lineTo(s.x + 2, 160); c.lineTo(s.x - 1, 330); c.lineTo(s.x + 1, 480); c.lineWidth = s.w; c.strokeStyle = s.light ? 'rgba(245,236,215,.45)' : 'rgba(20,15,10,.4)'; c.stroke(); });
      c.fillStyle = fx.fl < 0.6 ? `rgba(10,7,4,${0.03 + fx.fl * 0.1})` : `rgba(255,240,212,${(fx.fl - 0.6) * 0.12})`;
      c.fillRect(0, 0, 640, 480);
    } else if (G.post === 'crt') {
      // ブラウン管のにじみ：右へずらした写しを薄く足す＋細かいノイズ＋ゆっくり下る明るい帯
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.16; c.drawImage(canvas, 4 * SX, 0); c.globalAlpha = 0.08; c.drawImage(canvas, -3 * SX, 1 * SY);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.setTransform(SX, 0, 0, SY, 0, 0);
      c.globalAlpha = 0.35; c.drawImage(grain[fx.g], fx.gx, fx.gy, 320, 240, 0, 0, 640, 480); c.globalAlpha = 1;
      c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(0, ((t * 60) % 600) - 60, 640, 50);
    }
  }
  function irisMask(r) {
    c.fillStyle = K; c.beginPath(); c.rect(0, 0, 640, 480); c.arc(320, 240, Math.max(0, r), 0, TAU, true); c.fill();
    c.beginPath(); c.arc(320, 240, Math.max(0, r), 0, TAU); c.lineWidth = 3; c.strokeStyle = 'rgba(80,70,55,.6)'; c.stroke();
  }
  function frame(p, lt, t, still) {
    c.setTransform(SX, 0, 0, SY, 0, 0);
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.save();
    if (G.post === 'film') { c.translate(320 + (still ? 0 : fx.ox), 240 + (still ? 0 : fx.oy)); c.scale(1.02, 1.02); c.translate(-320, -240); }
    LIST[p].draw(c, G.fps ? Math.floor(lt * G.fps) / G.fps : lt, len);
    c.restore();
    c.setTransform(SX, 0, 0, SY, 0, 0);
    film(t, still);
  }
  function osd(lt) {
    if (lt >= 0.8) return;
    c.globalAlpha = lt < 0.6 ? 1 : 1 - (lt - 0.6) / 0.2;
    if (G.osd === 'dial') {
      circ(c, 586, 54, 30, 'rgba(241,230,205,.92)', 3);
      for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; line(c, 586 + Math.cos(a) * 24, 54 + Math.sin(a) * 24, 586 + Math.cos(a) * 28, 54 + Math.sin(a) * 28, 1.5); }
      c.font = `900 24px ${SERIF}`; c.fillStyle = K; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(chan), 586, 55);
    } else if (G.osd === 'green') {
      txt(c, `CH ${String(chan).padStart(2, '0')}`, 612, 46, 34, '#6bff7e', { font: MONO, weight: '900', align: 'right', shadow: ['rgba(0,40,0,.8)', 3, 3] });
    } else {
      txt(c, String(chan).padStart(2, '0'), 612, 44, 30, '#fff', { font: SANS, weight: '700', align: 'right', shadow: ['rgba(0,0,0,.6)', 2, 2] });
    }
    c.globalAlpha = 1;
  }

  function update(t /* , dt */) {
    if (disposed) return;
    if (cur < 0 || t < start || t - start >= len) next(t);
    const lt = t - start;
    frame(cur, lt, t, false);
    if (iris.open && lt < 0.4) irisMask(eo(lt / 0.4) * 420);
    const rem = len - lt;
    if (iris.close && rem < 0.32) irisMask(eo(rem / 0.32) * 420);
    // 切り替え直後：砂嵐＋横ずれ（全ジャンル共通）
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
    osd(lt);
  }

  return {
    canvas,
    update,
    genre: GENRES[genre] ? genre : 'cartoon',
    setLevel(x) {
      level = clamp(+x || 0);
      if (A) A.lvl.gain.setTargetAtTime(level * GAIN, A.ctx.currentTime, 0.08);
    },
    get now() { return cur >= 0 ? LIST[cur].name : ''; },
    programs: LIST.map((p) => p.name),
    // 確認用：番組 i の lt 秒目の1コマを描く（切り替え・アイリスなし）
    renderStill(i, lt = 1) { len = 3; frame(i, lt, lt, true); c.drawImage(vig, 0, 0); },
    dispose() {
      disposed = true;
      PLAYING[gkey].delete(id);
      if (A) { try { A.lvl.disconnect(); } catch (e) { /* 既に外れている */ } A = null; }
    },
  };
}
