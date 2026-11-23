// 場面4・案J「芯を押す」の単体確認ページ：本線用の部品 3d/b/sc4.js をそのまま使う
// 本線の代わりにこのページがやること：カメラ（芯から約17・芯の上を見る）、本線のつなぎの朱い線、遠くの塵、
// onNext の後に画面を上へ流して場面5の頭を見せる（本線ではここが「場面5へスクロール」になる）
import { THREE, stage, SP, sstep, clamp } from './base.js';
import { mkLine, mkDust } from './sc4k.js';
import { createScene4 } from '../b/sc4.js';

const S = stage({ fov: 46, fovSp: 62, bloom: [0.85, 0.5, 0.6], exposure: 0.95, grain: 0.04 });
if (SP) S.bloom.strength = 0.55;
const { scene, camera, renderer } = S;
camera.layers.enableAll();
mkLine(scene, 0.6); mkDust(scene);
const center = new THREE.Vector3(0, 0, 0);
let nextAt = null;
const s4 = createScene4({ THREE, scene, center, camera, quality: SP ? 'sp' : 'pc', root: document.getElementById('s4root'), renderer, onNext: () => { nextAt = s4.tau; } });
window.__s4 = s4;   // 確認・撮影用
const body = document.body, next = document.getElementById('next'), hint = document.getElementById('hint');
addEventListener('pointerdown', (e) => { if (body.classList.contains('went') && !e.target.closest('a,button')) { s4.reset(); nextAt = null; } });

const look = new THREE.Vector3();
let lastPT;
S.run((st) => {
  // 撮影用：window.__PT（押した時刻）・window.__HOV
  if (window.__HOV != null) s4.setHover(window.__HOV);
  if (window.__PT !== undefined && window.__PT !== lastPT) { lastPT = window.__PT; s4.reset(); nextAt = null; if (lastPT !== null) { s4.update(lastPT, 0, true); s4.press(); } }
  s4.update(st.t, st.dt, true);
  // 本線のカメラの代わり：芯から約17、芯の上（lookTarget）を見る。打ち上げの後は少しだけ見上げる
  const yaw = st.mx * 0.08 + Math.sin(st.t * 0.05) * 0.03, d = SP ? 19 : 17;
  camera.position.set(Math.sin(yaw) * d, 1.2 - st.my * 0.6, Math.cos(yaw) * d);
  look.copy(s4.lookTarget).y += s4.lookUp * 0.8; camera.lookAt(look);
  // onNext の後：画面が上へ流れて場面5の頭が入る
  const f = s4.tau < 0 || nextAt == null && s4.tau < s4.NEXT ? 0 : sstep(s4.NEXT, s4.NEXT + 1.5, s4.tau);
  body.style.setProperty('--fy', (f * innerHeight * 0.72).toFixed(1) + 'px');
  body.style.setProperty('--fo', (1 - f * 0.75).toFixed(3));
  next.style.opacity = clamp(f * 1.6).toFixed(3);
  body.classList.toggle('went', f > 0.98); hint.textContent = f > 0.98 ? 'CLICK TO REPLAY' : '';
}, {
  chord: 4,
  base: () => ({ noise: s4.tau < 0 ? 1 : 0.3, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 }),
  init() { return { update(s, out) { s4.audio(out, 1); } }; },
});
// 音がオフの時も、部品に「音なし」を伝える
setInterval(() => { if (!window.SND?.out?.()) s4.audio(null, 1); }, 500);
