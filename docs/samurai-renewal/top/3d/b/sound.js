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
// 場面ごとの曲の表情（土台の和音はそのまま、音色・刻み・明るさを変える）
// bpm=刻みの速さ / pulse=低い鼓動 / arp=分散和音の密度（0〜1）/ oct=分散和音の高さ / f=パッドの明るさ / ping=きらめきの間隔(秒) / pad=パッドの量
const MOODS = [
  { bpm: 0,  pulse: 0, arp: 0,    oct: 12, f: 520,  ping: 3.6, pad: 1 },    // FV：静か
  { bpm: 84, pulse: 1, arp: 0.25, oct: 12, f: 680,  ping: 4.5, pad: 1 },    // 1 人とAI：鼓動
  { bpm: 112, pulse: 0, arp: 0.85, oct: 24, f: 980, ping: 1.2, pad: 0.8 },  // 2 エントロピー：細かく散らばる
  { bpm: 0,  pulse: 0, arp: 0,    oct: 12, f: 420,  ping: 9,   pad: 0.45 }, // 3 テレビ：番組の音に譲る
  { bpm: 60, pulse: 1, arp: 0,    oct: 24, f: 360,  ping: 2.4, pad: 1.1 },  // 4 見極め：張りつめる
  { bpm: 96, pulse: 1, arp: 0.5,  oct: 12, f: 760,  ping: 3.2, pad: 0.9 },  // 5 ゼロサム→プラスサム
  { bpm: 76, pulse: 1, arp: 0.6,  oct: 12, f: 1250, ping: 2.6, pad: 1 },    // 6 全体最適：あたたかく上る
  { bpm: 72, pulse: 0, arp: 0.4,  oct: 24, f: 2000, ping: 2.0, pad: 1 },    // 夜明け
];

export const SND = (() => {
  let ctx = null, on = false, want = false, lastSwap = 0, nature = null, nextBird = 0, peopleV = null, peopleBus = null, hiss, radioN = null, radioO = null, radioG = null, master, music, sfx, verb, padF, voices = [], sub, wind, windF, whoosh, whooshF, sig, sigG, nbuf;
  let chord = -1, mood = MOODS[0], nextBeat = 0, beat = 0, padG, lastTick = 0, nextPing = 0, st = { noise: 1, travel: 0, vel: 0, dawn: 0, fv: 1, day: 0, tv: 0 };
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
    padG = ctx.createGain(); padG.gain.value = 0.05; padF.connect(padG); padG.connect(music);
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
    hiss = loopNoise(0, 'highpass', 3200, 0.5); hiss.g.connect(sfx);
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
    if (i === chord) return; chord = i; mood = MOODS[i];
    padG.gain.setTargetAtTime(0.05 * mood.pad, ctx.currentTime, 1.2);
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
  // 話し声：人＝母音が次々に変わる「わちゃわちゃ」（抑揚・間あり）、AI＝抑揚のない機械の「ボソボソ」
  const VOW = [[730, 1090, 2440], [270, 2290, 3010], [300, 870, 2240], [530, 1840, 2480], [570, 840, 2410]];   // ア イ ウ エ オ
  function buildPeople(n) {
    peopleBus = ctx.createGain(); peopleBus.gain.value = 0; peopleBus.connect(music);
    const ring = ctx.createOscillator(); ring.frequency.value = 38; ring.start();
    const crush = ctx.createWaveShaper(); { const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; c[i] = Math.round(x * 6) / 6; } crush.curve = c; }
    crush.connect(peopleBus);
    peopleV = [];
    for (let k = 0; k < n; k++) {
      const female = k % 3 === 1, f0 = female ? 200 + Math.random() * 40 : 105 + Math.random() * 30;
      const v = { f0, female, mode: 'quiet', next: 0, pan: ctx.createStereoPanner ? ctx.createStereoPanner() : null };
      v.o = ctx.createOscillator(); v.o.type = 'sawtooth'; v.o.frequency.value = f0;
      v.fs = VOW[0].map((f, j) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = [5, 8, 11][j]; return b; });
      v.hg = ctx.createGain(); v.hg.gain.value = 0;
      v.fs.forEach((b, j) => { const g = ctx.createGain(); g.gain.value = [1, 0.55, 0.25][j]; v.o.connect(b); b.connect(g); g.connect(v.hg); });
      v.ro = ctx.createOscillator(); v.ro.type = 'square'; v.ro.frequency.value = female ? 180 : 96;
      const rm = ctx.createGain(); rm.gain.value = 0; ring.connect(rm.gain); v.ro.connect(rm);
      v.rf = [ctx.createBiquadFilter(), ctx.createBiquadFilter()]; v.rf.forEach((b, j) => { b.type = 'bandpass'; b.Q.value = 9; b.frequency.value = [500, 1100][j]; rm.connect(b); });
      v.rg = ctx.createGain(); v.rg.gain.value = 0; v.rf.forEach((b) => b.connect(v.rg));
      const out = v.pan || peopleBus;
      if (v.pan) { v.pan.pan.value = (k % 2 ? 0.35 : -0.35) * (0.4 + Math.random() * 0.6); v.pan.connect(peopleBus); }
      v.hg.connect(out); v.rg.connect(crush);
      v.o.start(); v.ro.start();
      peopleV.push(v);
    }
  }
  function speak(v, t) {
    if (v.mode === 'human') {
      const nsyl = 3 + (Math.random() * 7 | 0); let at = t;
      for (let i = 0; i < nsyl; i++) {
        const vw = VOW[(Math.random() * 5) | 0], d = 0.07 + Math.random() * 0.12, f = v.f0 * (1.12 - 0.22 * i / nsyl + (Math.random() - 0.5) * 0.12);
        v.o.frequency.setTargetAtTime(f, at, 0.02);
        v.fs.forEach((b, j) => b.frequency.setTargetAtTime(vw[j] * (v.female ? 1.15 : 1), at, 0.015));
        v.hg.gain.setTargetAtTime(0.05 + Math.random() * 0.03, at, 0.012); v.hg.gain.setTargetAtTime(0.004, at + d, 0.02);
        at += d + 0.03 + Math.random() * 0.05;
      }
      v.next = at + 0.25 + Math.random() * 1.1;
    } else if (v.mode === 'ai') {
      const nsyl = 6 + (Math.random() * 6 | 0); let at = t;
      for (let i = 0; i < nsyl; i++) {
        const vw = VOW[(Math.random() * 5) | 0];
        v.rf.forEach((b, j) => b.frequency.setValueAtTime(vw[j] * 0.9, at));
        v.rg.gain.setValueAtTime(0.06, at); v.rg.gain.setValueAtTime(0.0, at + 0.13);
        at += 0.19;
      }
      v.next = at + 0.5 + Math.random() * 0.6;
    } else { v.hg.gain.setTargetAtTime(0, t, 0.2); v.rg.gain.setTargetAtTime(0, t, 0.2); v.next = t + 0.3; }
  }
  function bird() {
    const at = ctx.currentTime, n = 2 + (Math.random() * 4 | 0), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; o.type = 'sine';
      const t0 = at + i * (0.11 + Math.random() * 0.06), f = base * (0.9 + Math.random() * 0.3);
      o.frequency.setValueAtTime(f, t0); o.frequency.exponentialRampToValueAtTime(f * (1.25 + Math.random() * 0.4), t0 + 0.05); o.frequency.exponentialRampToValueAtTime(f * 0.85, t0 + 0.09);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.03, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.1);
      if (p) { p.pan.value = Math.random() * 1.6 - 0.8; o.connect(g); g.connect(p); p.connect(nature); } else { o.connect(g); g.connect(nature); }
      o.start(t0); o.stop(t0 + 0.12);
    }
  }
  function kick(at, peak) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(92, at); o.frequency.exponentialRampToValueAtTime(38, at + 0.22);
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    o.connect(g); g.connect(music); o.start(at); o.stop(at + 0.55);
  }
  function note(f, at, peak, d) {
    const o = ctx.createOscillator(), g = ctx.createGain(), fl = ctx.createBiquadFilter(); o.type = 'triangle'; o.frequency.value = f;
    fl.type = 'lowpass'; fl.frequency.value = 2600;
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(peak, at + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, at + d);
    o.connect(fl); fl.connect(g); g.connect(music); o.start(at); o.stop(at + d + 0.05);
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
    // 手が1本 AI に置き換わる：奥から手前へ音程が上がる
    // 人が AI に入れ替わる：足元から頭へ走る光に合わせた「シュイン」（上がる短い音）。重なりすぎないよう間引く
    swap(k) { if (!on) return; const n = performance.now(); if (n - lastSwap < 45) return; lastSwap = n;
      const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      const f = mtof(76 + Math.round(k * 10)); o.frequency.setValueAtTime(f * 0.5, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
      o.connect(g); g.connect(sfx); o.start(t); o.stop(t + 0.95); burst(0.018, 0.4, 'bandpass', 3000 + k * 2500, 2); },
    // 場面1：話し声。list = [{ mode: 'human'|'ai'|'quiet' }, …]、lvl＝場面の近さ
    people(list, lvl) {
      if (!ctx || !on) return;
      if (!peopleV) buildPeople(list.length);
      const t = ctx.currentTime;
      peopleBus.gain.setTargetAtTime(0.9 * lvl, t, 0.3);
      list.forEach((it, i) => { const v = peopleV[i]; if (!v) return;
        if (v.mode !== it.mode) { v.mode = it.mode; v.next = t; if (it.mode !== 'human') v.hg.gain.setTargetAtTime(0, t, 0.08); if (it.mode !== 'ai') v.rg.gain.setTargetAtTime(0, t, 0.08); }
        if (lvl > 0.05 && t > v.next) speak(v, t + 0.02); });
    },
    // 場面4：ラジオの同調（目盛りの位置で帯域を絞った雑音 → 合うと澄んだ正弦波）
    radio(r) {
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      if (!radioN) {
        radioN = loopNoise(0, 'bandpass', 900, 4); radioN.g.connect(sfx);
        radioO = ctx.createOscillator(); radioO.type = 'sine'; radioO.frequency.value = mtof(81); radioG = ctx.createGain(); radioG.gain.value = 0; radioO.connect(radioG); radioG.connect(music); radioO.start();
      }
      const v = r.on || 0, lock = r.lock || 0, near = r.near || 0;
      radioN.g.gain.setTargetAtTime(0.2 * (1 - lock * 0.9) * v, t, 0.08);
      radioN.fl.frequency.setTargetAtTime(300 + (r.x || 0) * 2800, t, 0.05);
      radioO.detune.setTargetAtTime((1 - lock) * (1 - near) * 300 * Math.sin(r.t * 3), t, 0.05);
      radioG.gain.setTargetAtTime(0.06 * Math.max(near * 0.5 * (1 - lock), lock) * v, t, 0.15);
      if (v > 0.3 && Math.random() < 0.3 * (1 - lock)) burst(0.02 + Math.random() * 0.04, 0.008, 'highpass', 2500 + Math.random() * 4000, 1);
    },
    // FV の輪がパカッと開く：「フュー」と上がる風＋低い響き＋きらめき
    open() { if (!on) return; const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = nbuf; const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 2.2;
      fl.frequency.setValueAtTime(300, t); fl.frequency.exponentialRampToValueAtTime(5200, t + 1.1);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.16, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      s.connect(fl); fl.connect(g); g.connect(sfx); s.start(t); s.stop(t + 1.7);
      tone(55, 'sine', 0.14, 0.02, 1.8, music, 38);
      [81, 88, 93].forEach((m, i) => setTimeout(() => on && tone(mtof(m), 'sine', 0.035, 0.01, 1.6, music), 350 + i * 90)); },
    // テレビが乱れる「プシュッ」：短い雑音が下へ落ちる
    psh(k = 1) { if (!on) return; const s = ctx.createBufferSource(); s.buffer = nbuf; s.playbackRate.setValueAtTime(1.6, ctx.currentTime); s.playbackRate.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.22);
      const fl = ctx.createBiquadFilter(); fl.type = 'bandpass'; fl.Q.value = 1.4; fl.frequency.setValueAtTime(3200, ctx.currentTime); fl.frequency.exponentialRampToValueAtTime(500, ctx.currentTime + 0.25);
      const g = ctx.createGain(); s.connect(fl); fl.connect(g); g.connect(sfx); env(g, 0.004, 0.09 * k, 0.26); s.start(ctx.currentTime, Math.random()); s.stop(ctx.currentTime + 0.35); },
    // テレビの壁を光の波が走る
    wave() { if (!on || st.tv < 0.3) return; tone(220, 'sine', 0.05, 0.25, 1.4, music, 440); burst(0.04, 0.9, 'bandpass', 1200, 0.6); },
    scene(i) { if (ctx) setChord(i); },
    update(s) {
      Object.assign(st, s);
      if (!ctx || !on) return;
      const t = ctx.currentTime;
      wind.g.gain.setTargetAtTime(0.02 + 0.16 * st.noise * st.fv, t, 0.25);
      whoosh.g.gain.setTargetAtTime(Math.min(0.22, Math.abs(st.vel) * 0.35 + st.travel * 0.1) * (1 - st.day), t, 0.12);
      whooshF.frequency.setTargetAtTime(600 + Math.min(2200, Math.abs(st.vel) * 2600), t, 0.15);
      hiss.g.gain.setTargetAtTime(0.05 * st.tv, t, 0.3);
      sigG.gain.setTargetAtTime(0.018 * (1 - st.noise) * st.fv, t, 0.4);
      padF.frequency.setTargetAtTime(mood.f + 1400 * st.dawn, t, 0.8);
      music.gain.setTargetAtTime(0.9 - 0.8 * st.day, t, 0.8);   // 紙の節では宇宙の音楽を小さく（自然の音はやめた・So 11/24）
      // 紙の節（特徴から下）：地球の音＝風・小川・ときどき鳥（かすかに）
      if (false && st.day > 0.02 && !nature) {
        nature = ctx.createGain(); nature.gain.value = 0; nature.connect(master);
        const wnd = loopNoise(0.5, 'lowpass', 420, 0.4); wnd.g.connect(nature);
        const wl = ctx.createOscillator(), wg = ctx.createGain(); wl.frequency.value = 0.08; wg.gain.value = 0.35; wl.connect(wg); wg.connect(wnd.g.gain); wl.start();
        const brk = loopNoise(0.18, 'bandpass', 2400, 1.6); brk.g.connect(nature);
        const lv = loopNoise(0.0, 'highpass', 5200, 0.7); lv.g.connect(nature);   // 葉ずれ：風に合わせてざわめく
        const ll = ctx.createOscillator(), lg2 = ctx.createGain(); ll.frequency.value = 0.13; lg2.gain.value = 0.16; ll.connect(lg2); lg2.connect(lv.g.gain); ll.start();
        const bl = ctx.createOscillator(), bg = ctx.createGain(); bl.type = 'triangle'; bl.frequency.value = 7.3; bg.gain.value = 0.08; bl.connect(bg); bg.connect(brk.g.gain); bl.start();
        const bl2 = ctx.createOscillator(), bg2 = ctx.createGain(); bl2.frequency.value = 0.9; bg2.gain.value = 900; bl2.connect(bg2); bg2.connect(brk.fl.frequency); bl2.start();
      }
      if (false && nature) {
        nature.gain.setTargetAtTime(0.34 * st.day, t, 1.2);   // 森の音（風・葉ずれ・小川・鳥）
        if (st.day > 0.5 && t > nextBird) { nextBird = t + 1.8 + Math.random() * 5; bird(); }
      }
      // ときどき鳴る小さな音（和音の上の五音音階）
      // 刻み：鼓動と分散和音（少し先まで予約）
      if (mood.bpm && st.day < 0.5) {
        const spb = 60 / mood.bpm / 2;   // 8分
        if (nextBeat < t) nextBeat = t + 0.05;
        while (nextBeat < t + 0.2) {
          const c = CHORDS[chord];
          if (mood.pulse && beat % 4 === 0) kick(nextBeat, beat % 8 === 0 ? 0.11 : 0.07);
          if (mood.arp && Math.random() < mood.arp) { const n = c[1 + (beat % 4)] + mood.oct + (Math.random() < mood.arp * 0.4 ? 12 : 0); note(mtof(n), nextBeat, 0.022 + 0.01 * Math.random(), 0.35 + 0.4 * (1 - mood.arp)); }
          nextBeat += spb; beat++;
        }
      }
      if (t > nextPing && st.day < 0.5) {
        nextPing = t + mood.ping * (0.6 + Math.random() * 0.9);
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
    // 音のあり・なしは入口の画面で選ぶ（前回の選択で勝手に鳴らさない）
      }
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) ctx.suspend(); else if (on) ctx.resume(); });
  if (matchMedia('(hover:hover)').matches) document.querySelectorAll('a, button:not(#snd)').forEach((el) => el.addEventListener('pointerenter', () => api.hover()));
  // ほかの部品（紙の節など）から効果音を足すための口。鳴らしてよい時だけ { ctx, sfx, music, verb, nbuf } を返す
  api.set = (v) => setOn(!!v);
  api.out = () => (on && ctx ? { ctx, sfx, music, verb, nbuf } : null);
  window.SND = api;
  window.dispatchEvent(new Event('snd-ready'));
  return api;
})();
