// 音：BGM と効果音。すべてブラウザの中で合成する（外部の音源ファイルは使わない）
// 既定は OFF。ヘッダーの SOUND ボタンで切り替え、選んだ状態はこのブラウザに覚える。
const KEY = 'samurai-b-sound';
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
// 場面ごとの和音（MIDI 番号）。0=FV、1〜6=STORY、7=夜明け
const CHORDS = [
  [38, 50, 57, 64, 65],   // Dm(add9)
  [34, 46, 53, 57, 62],   // B♭maj7
  [31, 43, 50, 57, 58],   // Gm(add9)
  [33, 45, 52, 57, 62],   // Asus4
  [38, 50, 57, 62, 64],   // Dm(add9) 開いた形
  [29, 41, 48, 52, 57],   // Fmaj7
  [36, 48, 55, 62, 64],   // Cadd9
  [38, 50, 54, 57, 64],   // D（夜明けで明るく）
];
const PENTA = [62, 64, 65, 69, 72, 74, 76, 77, 81];

export const SND = (() => {
  let ctx = null, on = false, want = false, master, music, sfx, verb, padF, voices = [], sub, wind, windF, whoosh, whooshF, sig, sigG, nbuf;
  let chord = -1, lastTick = 0, nextPing = 0, st = { noise: 1, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0 };
  const btn = document.getElementById('snd');
  const lab = btn && btn.querySelector('.st');
  const store = (v) => { try { localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* 保存できない環境は無視 */ } };
  const stored = () => { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } };
  const paint = () => { if (!btn) return; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); if (lab) lab.textContent = on ? 'ON' : 'OFF'; };

  function impulse(sec, decay) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  function loopNoise(gain, type, f, q) {
    const s = ctx.createBufferSource(); s.buffer = nbuf; s.loop = true;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(fl); fl.connect(g); s.start(); return { g, fl };
  }
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    nbuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    { const d = nbuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3;
    master.connect(comp); comp.connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(5, 2.4);
    const vg = ctx.createGain(); vg.gain.value = 0.6; verb.connect(vg); vg.connect(master);
    music = ctx.createGain(); music.gain.value = 0.9; music.connect(master); music.connect(verb);
    sfx = ctx.createGain(); sfx.gain.value = 0.75; sfx.connect(master);
    const sv = ctx.createGain(); sv.gain.value = 0.3; sfx.connect(sv); sv.connect(verb);

    // パッド：1音につき少しずらした鋸波2本 → ローパス（ゆっくり開閉）
    padF = ctx.createBiquadFilter(); padF.type = 'lowpass'; padF.frequency.value = 620; padF.Q.value = 0.6;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.045; lg.gain.value = 220; lfo.connect(lg); lg.connect(padF.frequency); lfo.start();
    const padG = ctx.createGain(); padG.gain.value = 0.05; padF.connect(padG); padG.connect(music);
    for (let i = 1; i < 5; i++) {
      const g = ctx.createGain(); g.gain.value = i === 4 ? 0.55 : 1; g.connect(padF);
      const o = [-6, 6].map((dt) => { const x = ctx.createOscillator(); x.type = 'sawtooth'; x.detune.value = dt; x.connect(g); x.start(); return x; });
      voices.push(o);
    }
    // 低いうなり
    sub = ctx.createOscillator(); sub.type = 'sine'; const sg = ctx.createGain(); sg.gain.value = 0.1; sub.connect(sg); sg.connect(music); sub.start();
    // 宇宙の風（ノイズの量に連動）
    wind = loopNoise(0, 'bandpass', 420, 0.7); wind.g.connect(music); windF = wind.fl;
    const wl = ctx.createOscillator(), wlg = ctx.createGain(); wl.frequency.value = 0.07; wlg.gain.value = 260; wl.connect(wlg); wlg.connect(windF.frequency); wl.start();
    // 移動の風切り（速さに連動）
    whoosh = loopNoise(0, 'bandpass', 900, 0.9); whoosh.g.connect(sfx); whooshF = whoosh.fl;
    // シグナルの音（文字がそろうと鳴る細い正弦波＋やまびこ）
    sig = ctx.createOscillator(); sig.type = 'sine'; sig.frequency.value = mtof(81);
    sigG = ctx.createGain(); sigG.gain.value = 0;
    const dl = ctx.createDelay(1), fb = ctx.createGain(); dl.delayTime.value = 0.42; fb.gain.value = 0.38;
    sig.connect(sigG); sigG.connect(music); sigG.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(music); sig.start();
    setChord(0, true);
  }
  function setChord(i, now) {
    i = Math.max(0, Math.min(CHORDS.length - 1, i));
    if (i === chord) return; chord = i;
    const c = CHORDS[i], t = ctx.currentTime, tc = now ? 0.01 : 0.9;
    sub.frequency.setTargetAtTime(mtof(c[0]), t, tc);
    voices.forEach((o, k) => o.forEach((x) => x.frequency.setTargetAtTime(mtof(c[k + 1]), t, tc)));
  }
  // ---- 効果音 ----
  function env(g, a, peak, d, t0 = ctx.currentTime) { g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d); }
  function tone(f, type, peak, a, d, to, f2) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, ctx.currentTime + a + d);
    o.connect(g); g.connect(to || sfx); env(g, a, peak, d); o.start(); o.stop(ctx.currentTime + a + d + 0.05);
  }
  function burst(peak, dur, type, f, q) {
    const s = ctx.createBufferSource(); s.buffer = nbuf; s.playbackRate.value = 0.25 + Math.random() * 0.5;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); s.connect(fl); fl.connect(g); g.connect(sfx);
    env(g, 0.004, peak, dur); s.start(ctx.currentTime, Math.random()); s.stop(ctx.currentTime + dur + 0.05);
  }
  const api = {
    get on() { return on; },
    glitch() { if (!on) return; burst(0.22, 0.16, 'highpass', 1800, 0.7); tone(1400, 'square', 0.035, 0.002, 0.22, sfx, 90); },
    tick() { if (!on) return; const n = performance.now(); if (n - lastTick < 28) return; lastTick = n; burst(0.05, 0.012, 'highpass', 4000 + Math.random() * 3000, 1.2); },
    lock() { if (!on) return; tone(mtof(81), 'sine', 0.09, 0.005, 2.4, music); setTimeout(() => on && tone(mtof(88), 'sine', 0.05, 0.005, 2.8, music), 140); },
    hover() { if (!on) return; tone(1320, 'sine', 0.025, 0.003, 0.08); },
    scene(i) { if (ctx) setChord(i); },
    update(s) {
      Object.assign(st, s);
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      wind.g.gain.setTargetAtTime(0.02 + 0.16 * st.noise * st.fv, t, 0.25);
      whoosh.g.gain.setTargetAtTime(Math.min(0.22, Math.abs(st.vel) * 0.35 + st.travel * 0.1) * (1 - st.day), t, 0.12);
      whooshF.frequency.setTargetAtTime(600 + Math.min(2200, Math.abs(st.vel) * 2600), t, 0.15);
      sigG.gain.setTargetAtTime(0.018 * (1 - st.noise) * st.fv, t, 0.4);
      padF.frequency.setTargetAtTime(620 + 1600 * st.dawn, t, 0.5);
      music.gain.setTargetAtTime(0.9 - 0.45 * st.day, t, 0.8);
      // ときどき鳴る小さな音（和音の上の五音音階）
      if (t > nextPing && st.day < 0.5) {
        nextPing = t + 2.2 + Math.random() * 3.2;
        tone(mtof(PENTA[(Math.random() * PENTA.length) | 0]), 'sine', 0.028, 0.01, 2.2, music);
      }
    },
  };
  async function setOn(v) {
    want = v; store(v);
    if (v && !ctx) build();
    on = v; paint();
    if (!ctx) return;
    const t = ctx.currentTime;
    if (v) {
      await ctx.resume();
      master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0.9, t, 0.5);
      [0, 120, 240].forEach((ms, i) => setTimeout(() => on && tone(mtof([69, 76, 81][i]), 'sine', 0.05, 0.005, 1.4, music), ms));
      api.update({});
    } else {
      master.gain.cancelScheduledValues(t); master.gain.setTargetAtTime(0, t, 0.25);
      setTimeout(() => { if (!on && ctx) ctx.suspend(); }, 1500);
    }
  }
  if (btn) {
    btn.addEventListener('click', () => setOn(!on));
    paint();
    // 前回 ON にしていた人は、最初の操作で鳴らし始める（ブラウザは操作なしでは音を出せない）
    if (stored()) {
      btn.classList.add('wait');
      const first = (e) => {
        removeEventListener('pointerdown', first, true); removeEventListener('keydown', first, true); btn.classList.remove('wait');
        if (e.type === 'pointerdown' && btn.contains(e.target)) return;   // ボタン自体を押した時はボタンの処理に任せる
        if (!on) setOn(true);
      };
      addEventListener('pointerdown', first, true); addEventListener('keydown', first, true);
    }
  }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
  if (matchMedia('(hover:hover)').matches) document.querySelectorAll('a, button:not(#snd)').forEach((el) => el.addEventListener('pointerenter', () => api.hover()));
  return api;
})();
