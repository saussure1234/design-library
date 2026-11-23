// 場面4 ボタン版（J〜）の共通の進行役
// ・ボタンに触れる（hover）／押す（trigger）／スクロールしても押したのと同じ
// ・押してからの秒数 tau を返す（押す前は -1）。GO 秒から画面が上へ流れ、次の場面（05）の頭が下から入ってくる
// ・流れきった後に画面をクリック → 最初に戻る（確認用）
// 撮影用：window.__PT（押した時刻＝st.t の値）・window.__HOV（1 で触れている状態）で状態を固定できる
import { sstep, clamp } from './base.js';

export function press({ btn, GO, onHover, onPress, flowK = 0.72 }) {
  const c = { pT: null, hov: 0, hovS: 0, ep: 0, now: 0, done: false };
  const body = document.body, next = document.getElementById('next'), hint = document.getElementById('hint');
  c.trigger = () => { if (c.pT != null) return; c.pT = c.now; c.ep++; body.classList.add('pressed'); onPress && onPress(); };
  c.reset = () => { c.pT = null; c.done = false; body.classList.remove('pressed', 'went'); scrollTo(0, 0); };
  if (btn) {
    btn.addEventListener('pointerenter', () => { c.hov = 1; if (c.pT == null) onHover && onHover(); });
    btn.addEventListener('pointerleave', () => { c.hov = 0; });
    btn.addEventListener('click', (e) => { e.stopPropagation(); c.trigger(); });
  }
  addEventListener('scroll', () => { if (c.pT == null && scrollY > innerHeight * 0.25) c.trigger(); }, { passive: true });
  addEventListener('pointerdown', (e) => { if (c.done && !e.target.closest('a,button')) c.reset(); });
  c.tau = (st) => {
    c.now = st.t;
    const pT = window.__PT != null ? window.__PT : c.pT;
    const hv = window.__HOV != null ? window.__HOV : c.hov;
    c.hovS += (hv - c.hovS) * Math.min(1, st.dt * 5); if (window.__HOV != null) c.hovS = hv;
    const tau = pT == null ? -1 : st.t - pT;
    body.classList.toggle('pressed', tau >= 0); if (btn) btn.classList.toggle('is-hov', hv > 0.5 && tau < 0);
    // 次へ流れる
    const f = tau < 0 ? 0 : sstep(GO, GO + 1.5, tau);
    const fy = f * innerHeight * flowK;
    body.style.setProperty('--fy', fy.toFixed(1) + 'px');
    body.style.setProperty('--fo', (1 - f * 0.75).toFixed(3));
    if (next) next.style.opacity = clamp(f * 1.6).toFixed(3);
    c.done = f > 0.98; body.classList.toggle('went', c.done);
    if (hint) hint.textContent = c.done ? 'CLICK TO REPLAY' : '';
    return tau;
  };
  return c;
}
