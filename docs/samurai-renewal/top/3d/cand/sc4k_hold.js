// 場面4・案K「長押しで溜める」（ボタン版・土台＝案G「空に届く合図」）
// 横長のボタン「長押しで見極める」。押している間だけノイズが集まり、ボタンの中が朱く満ちていく（離すとほどけて戻る）。
// 満ちきった瞬間、すべてが止まって芯が一度だけ脈打ち、打ち上がる。先端が上空の層に届いて波紋が広がり、画面が上へ流れて場面5へ。
// 音：押している間は集まるうなりと刻みが速くなる → 満ちると無音 → 鼓動 → 打ち上げ → 上空で鐘。
import { stage, SP, sstep, mix, mtof, sfx, clamp } from './base.js';
import { snd } from './sc4k.js';
import { press } from './sc4btn.js';
import { mkSky, skySound, RISE } from './sc4gscene.js';

const S = stage({ fov: 42, fovSp: 62, bloom: [0.85, 0.5, 0.6], exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const BEAT = 0.3, L = 0.62, GO = L + RISE + 1.0, CHG = 1.4;   // 満ちてから：脈・打ち上げ・次へ／満ちるまでの秒
const G = mkSky(S);
const btn = document.getElementById('go');
const out = () => window.SND?.out?.();
const C = press({ btn: null, GO });
let ch = 0, holding = false;
const start = (e) => { if (C.pT != null) return; e.preventDefault(); holding = true; btn.classList.add('on'); const o = out(); if (o) { sfx.burst(o, 0.1, 0.03, 'highpass', 2600, 0.8); snd.kick(o, 80, 50, 0.2, 0.14); } };
const stop = () => { if (!holding) return; holding = false; btn.classList.remove('on'); const o = out(); if (o && C.pT == null && ch > 0.05) snd.whoosh(o, 1200, 300, 0.5, 0.05); };
btn.addEventListener('pointerdown', start); addEventListener('pointerup', stop); btn.addEventListener('pointerleave', stop); addEventListener('pointercancel', stop);
btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) start(e); });
btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') stop(); });
btn.addEventListener('contextmenu', (e) => e.preventDefault());
btn.addEventListener('pointerenter', () => { C.hov = 1; const o = out(); if (o && C.pT == null) snd.whoosh(o, 300, 700, 0.6, 0.04); });
btn.addEventListener('pointerleave', () => { C.hov = 0; });
const q = document.querySelector('.qw .t');

S.run((st) => {
  if (C.pT == null) { ch = clamp(ch + (holding ? st.dt / CHG : -st.dt / 0.7)); if (ch >= 1) { holding = false; btn.classList.remove('on'); C.trigger(); } }
  const tau = C.tau(st); st.tau = tau; st.ep = C.ep;
  const chv = window.__CH != null ? window.__CH : (tau >= 0 ? 1 : ch);
  btn.style.setProperty('--ch', chv.toFixed(3)); btn.classList.toggle('is-hov', C.hovS > 0.5 && tau < 0);
  const c = Math.max(0.1 * C.hovS, tau >= 0 ? 1 : sstep(0, 1, chv));
  const hold = tau >= 0 && tau < L ? sstep(0, 0.2, tau) : 0;
  const beat = tau >= 0 ? Math.exp(-Math.pow((tau - BEAT) / 0.06, 2)) : 0;
  // 止まる：粒の時間を止める
  G.conv.U.uHold.value = hold > 0 ? 1 : 0; if (!hold) G.conv.U.uHT.value = st.t;
  G.update(st, { tau, c, L, hold, beat, sy0: 0.11, sy1: 0 });
  G.conv.U.uRise.value = sstep(L, L + 0.7, tau);   // 止まっている間は昇らせない
  q.style.opacity = (1 - 0.5 * sstep(L, L + 0.3, tau)).toFixed(3);
  st.c = c; st.hold = hold > 0; st.holding = holding || window.__CH != null;
}, {
  chord: 4,
  base: (s) => ({ noise: s.hold ? 0 : 1 - (s.c || 0) * 0.8, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init(o) {
    const u = skySound(o, { L, GO });
    let nextTick = 0;
    const beatDone = { ep: -1 };
    return { update(s, x) {
      u(s, x, s.hold ? 0 : (s.tau >= 0 ? 0 : s.c || 0));
      if (s.holding && s.tau < 0 && s.t >= nextTick) { nextTick = s.t + mix(0.4, 0.06, Math.pow(s.c || 0, 1.2)); sfx.tone(x, mtof(93), 0.03 + 0.03 * (s.c || 0), 0.002, 0.06, 'sine'); }
      if (s.tau >= BEAT && s.tau < BEAT + 0.2 && beatDone.ep !== s.ep) { beatDone.ep = s.ep; snd.kick(x, 70, 42, 0.6, 0.3); }
    } };
  },
});
