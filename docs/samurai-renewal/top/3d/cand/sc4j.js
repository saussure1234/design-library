// 場面4・案J「芯を押す」（ボタン版・土台＝案G「空に届く合図」）
// 問いの下、芯の位置に小さな丸いボタン（朱い点＝まだ見つかっていない Signal）。
// 触れる：周りのノイズが少しボタンへ寄り、輪が縮む。押す：ノイズがそこへ一気に集まり、光の柱が問いの後ろを貫いて打ち上がる。
// 先端が上空のノイズの層に届いて朱い波紋が広がり、そのまま画面が上へ流れて場面5の頭が入ってくる。
import { stage, SP, sstep, mtof, sfx } from './base.js';
import { snd } from './sc4k.js';
import { press } from './sc4btn.js';
import { mkSky, skySound, RISE } from './sc4gscene.js';

const S = stage({ fov: 42, fovSp: 62, bloom: [0.85, 0.5, 0.6], exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const L = 1.3, GO = L + RISE + 1.0;
const G = mkSky(S);
const out = () => window.SND?.out?.();
const C = press({
  btn: document.getElementById('go'), GO,
  onHover: () => { const o = out(); if (!o) return; snd.whoosh(o, 500, 1400, 0.7, 0.05); sfx.tone(o, mtof(76), 0.03, 0.03, 0.9, 'sine', o.music, mtof(81)); },
  onPress: () => { const o = out(); if (!o) return; sfx.burst(o, 0.12, 0.03, 'highpass', 3000, 0.8); sfx.tone(o, mtof(88), 0.05, 0.002, 0.25, 'sine'); snd.kick(o, 90, 50, 0.25, 0.18); },
});
const q = document.querySelector('.qw .t');
S.run((st) => {
  const tau = C.tau(st); st.tau = tau; st.ep = C.ep;
  const c = Math.max(0.12 * C.hovS, sstep(0, 1.2, tau));
  G.update(st, { tau, c, L, sy0: 0.17, sy1: 0 });
  q.style.opacity = (1 - 0.5 * sstep(L, L + 0.3, tau)).toFixed(3);
  st.c = c;
}, {
  chord: 4,
  base: (s) => ({ noise: 1 - (s.c || 0) * 0.8, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(o) { const u = skySound(o, { L, GO }); return { update(s, x) { u(s, x, s.c || 0); } }; },
});
