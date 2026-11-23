// 場面4・案L「NoiseからSignalへ切り替える」（ボタン版・土台＝案G「空に届く合図」）
// 問いの下に NOISE ←→ SIGNAL の切り替えスイッチ。触れるとつまみが少し SIGNAL 側へ寄り、ノイズのざわつきが一瞬静まる。
// 切り替える：つまみが朱く灯って SIGNAL 側へ渡り、ノイズが芯へ集まって打ち上がる。先端が上空の層に届いて波紋が広がり、画面が上へ流れて場面5へ。
// 音：スイッチの手応え（押し込みと戻りの2つのカチッ）→ 集まるうなり → 打ち上げ → 上空で鐘。触れた時は、ざわつき（ぱちぱち）が一瞬強まる。
import { stage, SP, sstep, mtof, sfx } from './base.js';
import { press } from './sc4btn.js';
import { mkSky, skySound, RISE } from './sc4gscene.js';

const S = stage({ fov: 42, fovSp: 62, bloom: [0.85, 0.5, 0.6], exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const L = 1.5, GO = L + RISE + 1.0;
const G = mkSky(S);
const sw = document.getElementById('go');
const out = () => window.SND?.out?.();
const C = press({
  btn: sw, GO,
  onHover: () => { if (!out()) return; for (let i = 0; i < 7; i++) setTimeout(() => { const x = out(); x && sfx.burst(x, 0.04 + Math.random() * 0.05, 0.012, 'highpass', 3000 + Math.random() * 3000, 0.8); }, i * 35 + Math.random() * 25); },
  onPress: () => { const o = out(); if (!o) return; sfx.burst(o, 0.16, 0.02, 'bandpass', 2600, 2); sfx.tone(o, 180, 0.08, 0.002, 0.05, 'sine');
    setTimeout(() => { const x = out(); x && (sfx.burst(x, 0.1, 0.015, 'bandpass', 4200, 2), sfx.tone(x, mtof(86), 0.03, 0.002, 0.2, 'sine')); }, 120); },
});
const q = document.querySelector('.qw .t');
S.run((st) => {
  const tau = C.tau(st); st.tau = tau; st.ep = C.ep;
  sw.setAttribute('aria-checked', tau >= 0 ? 'true' : 'false');
  // 触れている間はざわつき（粒の揺れ）を少し止める＝ uHold を半分だけ
  const c = Math.max(0.06 * C.hovS, sstep(0.35, L - 0.1, tau));
  G.update(st, { tau, c, L, sy0: 0.12, sy1: 0 });
  q.style.opacity = (1 - 0.5 * sstep(L, L + 0.3, tau)).toFixed(3);
  st.c = c;
}, {
  chord: 4,
  base: (s) => ({ noise: 1 - (s.c || 0) * 0.8, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(o) { const u = skySound(o, { L, GO }); return { update(s, x) { u(s, x, s.c || 0); } }; },
});
