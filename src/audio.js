// ===================== AUDIO: procedural track sounds, rider voices, weather =====================
// Everything is synthesised with the Web Audio API. Rider voices use a glottal-pulse source shaped by
// formant filters (the resonances of a human vocal tract), with pitch jitter, vibrato and breath noise.
function createSound(onError) {
  let ctx = null, master, voiceBus, trackBus, wxBus, reverb, reverbSend, noiseBuf, mode = 0;
  let rumbleG, rumbleF, windG, windF, brakeG, brakeF, bo1, bo2, tyreG, tyreO, launchG, launchO, launchF, rainG, rainF, gustG, gustF;
  let nextClack = 0, nextJoint = 0, lastScream = -10, lastWoo = -10, lastLaugh = -10, lastGasp = -10, wasLift = false, launchOn = 0, weatherKind = null;
  const glottal = {};
  function init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = 0; master.connect(comp); comp.connect(ctx.destination);
    trackBus = ctx.createGain(); trackBus.connect(master);
    voiceBus = ctx.createGain(); voiceBus.gain.value = 0.9; voiceBus.connect(master);
    wxBus = ctx.createGain(); wxBus.gain.value = 0.8; wxBus.connect(master);
    // outdoor reverb: short, diffuse
    reverb = ctx.createConvolver(); reverb.buffer = makeIR(1.6, 2.6); reverbSend = ctx.createGain(); reverbSend.gain.value = 0.22; reverbSend.connect(reverb); reverb.connect(master);
    voiceBus.connect(reverbSend);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    // glottal source spectra: pressed (screams) and modal (cheers, laughs)
    for (const [name, tilt] of [['pressed', 0.85], ['modal', 1.25], ['breathy', 1.6]]) {
      const N = 48, re = new Float32Array(N), im = new Float32Array(N);
      for (let k = 1; k < N; k++) { const a = 1 / Math.pow(k, tilt); re[k] = 0; im[k] = a * (k % 2 ? 1 : 0.85); }
      glottal[name] = ctx.createPeriodicWave(re, im, { disableNormalization: false });
    }
    const loop = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random() * 2.5); return s; };
    rumbleF = ctx.createBiquadFilter(); rumbleF.type = 'lowpass'; rumbleF.frequency.value = 90; rumbleF.Q.value = 1.1; rumbleG = ctx.createGain(); rumbleG.gain.value = 0; loop().connect(rumbleF).connect(rumbleG).connect(trackBus);
    windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.5; windG = ctx.createGain(); windG.gain.value = 0; loop().connect(windF).connect(windG).connect(trackBus);
    bo1 = ctx.createOscillator(); bo1.type = 'sawtooth'; bo2 = ctx.createOscillator(); bo2.type = 'square'; brakeF = ctx.createBiquadFilter(); brakeF.type = 'bandpass'; brakeF.Q.value = 7;
    brakeG = ctx.createGain(); brakeG.gain.value = 0; const b2g = ctx.createGain(); b2g.gain.value = 0.35; bo1.connect(brakeF); bo2.connect(b2g).connect(brakeF); brakeF.connect(brakeG).connect(trackBus); bo1.start(); bo2.start();
    tyreO = ctx.createOscillator(); tyreO.type = 'triangle'; tyreO.frequency.value = 55; tyreG = ctx.createGain(); tyreG.gain.value = 0; tyreO.connect(tyreG).connect(trackBus); tyreO.start();
    launchO = ctx.createOscillator(); launchO.type = 'sawtooth'; launchF = ctx.createBiquadFilter(); launchF.type = 'bandpass'; launchF.Q.value = 3; launchG = ctx.createGain(); launchG.gain.value = 0; launchO.connect(launchF).connect(launchG).connect(trackBus); launchO.start();
    rainF = ctx.createBiquadFilter(); rainF.type = 'highpass'; rainF.frequency.value = 1800; rainG = ctx.createGain(); rainG.gain.value = 0; loop().connect(rainF).connect(rainG).connect(wxBus);
    gustF = ctx.createBiquadFilter(); gustF.type = 'bandpass'; gustF.frequency.value = 320; gustF.Q.value = 0.7; gustG = ctx.createGain(); gustG.gain.value = 0; loop().connect(gustF).connect(gustG).connect(wxBus);
    return true;
  }
  function makeIR(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1); } }
    return b;
  }
  let paused = false, suspendT = 0;
  function setMode(m) {
    mode = m;
    if (m > 0) { if (!ctx && !init()) { onError && onError('Audio is not available in this browser'); return; } if (!paused) { clearTimeout(suspendT); ctx.resume(); master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.15); } }
    else if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
  }
  // Pausing the ride fades everything out and freezes the audio clock, so screams and launches don't carry on
  // over a frozen train; playing again picks up where it stopped.
  function setPaused(p) {
    paused = !!p; if (!ctx) return; clearTimeout(suspendT);
    if (paused) { master.gain.setTargetAtTime(0, ctx.currentTime, 0.04); suspendT = setTimeout(() => { if (paused) ctx.suspend(); }, 250); }
    else if (mode > 0) { ctx.resume(); master.gain.setTargetAtTime(0.9, ctx.currentTime, 0.12); }
  }
  const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
  function noiseBurst(t, dur, f, q, peak, type = 'bandpass', dest = trackBus, a = 0.003) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); env(g, t, peak, a, dur); s.connect(fl).connect(g).connect(dest); s.start(t, Math.random() * 2.5, a + dur + 0.05); return fl;
  }
  function clack(t) {
    for (const [dt, amp] of [[0, 0.5], [0.07, 0.32]]) {
      noiseBurst(t + dt, 0.06, 1900 + Math.random() * 700, 4, amp);
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(820, t + dt); o.frequency.exponentialRampToValueAtTime(260, t + dt + 0.05);
      const og = ctx.createGain(); env(og, t + dt, amp * 0.5, 0.002, 0.07); o.connect(og).connect(trackBus); o.start(t + dt); o.stop(t + dt + 0.1);
    }
  }
  function jointClack(t, amp) { noiseBurst(t, 0.035, 700 + Math.random() * 300, 2.5, amp); noiseBurst(t + 0.012, 0.05, 220, 1.5, amp * 0.7, 'lowpass'); }

  // ---------- voices ----------
  const VOWELS = { // formant frequencies (Hz) and bandwidths for an adult female tract; scaled for other voices
    a: [[850, 110], [1610, 140], [2950, 200], [3900, 260]], e: [[610, 90], [1900, 120], [2850, 180], [3800, 250]],
    i: [[370, 70], [2700, 120], [3300, 170], [4100, 250]], o: [[560, 90], [940, 110], [2800, 190], [3600, 260]], u: [[380, 70], [870, 90], [2550, 180], [3500, 250]]
  };
  const VOICE_TYPES = { female: { f0: [620, 1100], fs: 1.0 }, male: { f0: [240, 430], fs: 0.84 }, child: { f0: [900, 1350], fs: 1.17 } };
  function pickVoice() { const r = Math.random(); return r < 0.5 ? 'female' : r < 0.85 ? 'male' : 'child'; }
  // one sung syllable: pitch path [[t, f0 ratio]...], vowels path [[t, vowel]...], amplitude path
  function syllable(t0, dur, vt, f0, vowelPath, pitchPath, amp, pan, opts = {}) {
    const V = VOICE_TYPES[vt], fs = V.fs, out = ctx.createGain(); out.gain.value = 0;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null; if (p) { p.pan.value = pan; out.connect(p).connect(voiceBus); } else out.connect(voiceBus);
    const o = ctx.createOscillator(); o.setPeriodicWave(glottal[opts.wave || 'pressed']);
    o.frequency.setValueAtTime(f0 * pitchPath[0][1], t0);
    for (const [tt, r] of pitchPath.slice(1)) o.frequency.linearRampToValueAtTime(f0 * r, t0 + tt * dur);
    // vibrato + jitter
    const vib = ctx.createOscillator(); vib.frequency.value = 5 + Math.random() * 2.5; const vg = ctx.createGain(); vg.gain.value = f0 * (opts.vib ?? 0.035); vib.connect(vg).connect(o.frequency);
    const jit = ctx.createBufferSource(); jit.buffer = noiseBuf; jit.loop = true; const jf = ctx.createBiquadFilter(); jf.type = 'lowpass'; jf.frequency.value = 18; const jg = ctx.createGain(); jg.gain.value = f0 * 0.09; jit.connect(jf).connect(jg).connect(o.frequency);
    // roughness (vocal fry / strain) as fast amplitude modulation
    const am = ctx.createGain(); am.gain.value = 1; const rough = ctx.createOscillator(); rough.frequency.value = 38 + Math.random() * 30; const rg = ctx.createGain(); rg.gain.value = opts.rough ?? 0.18; rough.connect(rg).connect(am.gain);
    o.connect(am);
    // breath noise shares the formant bank
    const br = ctx.createBufferSource(); br.buffer = noiseBuf; br.loop = true; const brg = ctx.createGain(); brg.gain.value = opts.breath ?? 0.25; br.connect(brg);
    const bank = [];
    const v0 = VOWELS[vowelPath[0][1]];
    v0.forEach((fm, i) => {
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fm[0] * fs; f.Q.value = fm[0] / fm[1];
      const g = ctx.createGain(); g.gain.value = [1, 0.55, 0.28, 0.12][i] * (i === 0 ? 1 : 1.6);
      am.connect(f); brg.connect(f); f.connect(g).connect(out); bank.push(f);
      for (const [tt, vw] of vowelPath.slice(1)) f.frequency.linearRampToValueAtTime(VOWELS[vw][i][0] * fs, t0 + tt * dur);
    });
    // amplitude: fast onset with an 'h' of breath, sustain, decay
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(amp, t0 + (opts.attack ?? 0.06));
    out.gain.setTargetAtTime(amp * (opts.sustain ?? 0.78), t0 + 0.2, dur * 0.4);
    out.gain.setTargetAtTime(0.0001, t0 + dur * 0.82, dur * 0.09);
    brg.gain.setValueAtTime(opts.breath ?? 0.25, t0); brg.gain.linearRampToValueAtTime((opts.breath ?? 0.25) * 2.2, t0 + 0.04); brg.gain.linearRampToValueAtTime((opts.breath ?? 0.25) * 0.6, t0 + 0.18);
    const end = t0 + dur + 0.25;
    for (const n of [o, vib, jit, rough, br]) { n.start(t0, n === jit || n === br ? Math.random() * 2 : 0); n.stop(end); }
  }
  function scream(t, k = 1) {
    const n = 2 + Math.floor(Math.random() * 3 + k * 2);
    for (let i = 0; i < n; i++) {
      const vt = pickVoice(), V = VOICE_TYPES[vt], f0 = V.f0[0] + Math.random() * (V.f0[1] - V.f0[0]);
      const dur = 0.9 + Math.random() * 1.5, st = t + Math.random() * 0.45;
      const vA = Math.random() < 0.6 ? 'a' : 'e', vB = Math.random() < 0.5 ? 'a' : Math.random() < 0.5 ? 'e' : 'i';
      const peak = 1.12 + Math.random() * 0.12;
      syllable(st, dur, vt, f0, [[0, vt === 'male' ? 'o' : vA], [0.25, vA], [0.8, vB]], [[0, 0.78], [0.12, peak], [0.55, peak * 0.97], [0.85, 0.9], [1, 0.62]], (0.05 + Math.random() * 0.04) * k * (vt === 'male' ? 1.2 : 1), Math.random() * 1.4 - 0.7, { rough: vt === 'male' ? 0.28 : 0.16, breath: 0.22 });
    }
  }
  function woo(t, k = 1) {
    const n = 1 + Math.floor(Math.random() * 2 + k);
    for (let i = 0; i < n; i++) {
      const vt = Math.random() < 0.55 ? 'male' : 'female', V = VOICE_TYPES[vt], f0 = (V.f0[0] + Math.random() * (V.f0[1] - V.f0[0])) * 0.85;
      const st = t + Math.random() * 0.5, pan = Math.random() * 1.4 - 0.7;
      syllable(st, 0.62, vt, f0, [[0, 'u'], [0.7, 'u'], [1, 'o']], [[0, 0.8], [0.6, 1.35], [1, 1.25]], 0.06 * k, pan, { wave: 'modal', rough: 0.08, vib: 0.02, attack: 0.08 });
      if (Math.random() < 0.7) syllable(st + 0.6, 0.55, vt, f0, [[0, 'u'], [1, 'o']], [[0, 1.3], [0.4, 1.15], [1, 0.75]], 0.055 * k, pan, { wave: 'modal', rough: 0.08, breath: 0.5, attack: 0.04 });
    }
  }
  function laugh(t) {
    const vt = pickVoice(), V = VOICE_TYPES[vt], f0 = (V.f0[0] + Math.random() * (V.f0[1] - V.f0[0])) * 0.62, pan = Math.random() * 1.2 - 0.6, n = 4 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) syllable(t + i * (0.16 + Math.random() * 0.04), 0.15, vt, f0 * (1.1 - i * 0.04), [[0, 'a'], [1, 'a']], [[0, 1.05], [1, 0.92]], 0.045, pan, { wave: 'breathy', breath: 0.8, attack: 0.015, sustain: 0.6, rough: 0.1, vib: 0 });
  }
  function gasp(t) { for (let i = 0; i < 3; i++) { const f = noiseBurst(t + Math.random() * 0.3, 0.35, 1200 + Math.random() * 600, 3, 0.05, 'bandpass', voiceBus, 0.12); void f; } }
  function cheer() {
    if (!ctx || mode !== 2 || paused) return; const t = ctx.currentTime;
    noiseBurst(t, 2.4, 1100, 0.6, 0.22, 'bandpass', voiceBus, 0.3);
    for (let i = 0; i < 30; i++) { const tt = t + Math.random() * 2.2; noiseBurst(tt, 0.03, 1700 + Math.random() * 800, 1.2, 0.12 + Math.random() * 0.12, 'highpass', voiceBus, 0.002); }
    woo(t + 0.1, 0.9); laugh(t + 0.4 + Math.random() * 0.6);
  }
  function thunder(delay = 1) {
    if (!ctx || mode === 0 || paused) return; const t = ctx.currentTime + delay;
    if (delay < 1.2) noiseBurst(t, 0.25, 2500, 0.8, 0.5, 'bandpass', wxBus, 0.005);
    for (let i = 0; i < 4; i++) noiseBurst(t + 0.05 + i * (0.3 + Math.random() * 0.5), 1.8 + Math.random() * 2, 70 + Math.random() * 60, 0.8, 0.55 / (1 + i * 0.4) / Math.max(0.7, delay * 0.5), 'lowpass', wxBus, 0.08);
  }
  function setWeather(kind, wind) {
    weatherKind = kind;
    if (!ctx) return; const t = ctx.currentTime;
    rainG.gain.setTargetAtTime(kind === 'rain' ? 0.14 : 0, t, 0.8);
    gustG.gain.setTargetAtTime((wind || 0) * 0.16, t, 1);
  }
  function update(p) {
    if (!ctx || mode === 0 || paused) return; const t = ctx.currentTime; const v = Math.abs(p.v);
    rumbleG.gain.setTargetAtTime(Math.pow(Math.min(1, v / 32), 1.25) * (p.wood ? 1.15 : 0.95), t, 0.08); rumbleF.frequency.setTargetAtTime(70 + v * (p.wood ? 7 : 5.5), t, 0.1);
    windG.gain.setTargetAtTime(Math.min(1.2, (v / 36) ** 2) * (p.pov ? 0.6 : 0.4), t, 0.12); windF.frequency.setTargetAtTime(320 + v * 42, t, 0.12);
    const onBr = (p.type === T_BRAKES || p.type === T_TRIM || p.type === T_BLOCK) && v > 0.5; const bf = 120 + v * 24;
    brakeG.gain.setTargetAtTime(onBr ? Math.min(1, v / 10) * 0.28 : 0, t, 0.05); bo1.frequency.setTargetAtTime(bf, t, 0.04); bo2.frequency.setTargetAtTime(bf * 1.498, t, 0.04); brakeF.frequency.setTargetAtTime(380 + v * 70, t, 0.05);
    const onTyre = (p.type === T_STATION || p.type === T_TRANSFER || p.type === T_TIRES || p.type === T_TIRELIFT) && v > 0.3; tyreG.gain.setTargetAtTime(onTyre ? 0.12 : 0, t, 0.1); tyreO.frequency.setTargetAtTime(45 + v * 9, t, 0.1);
    // launches: LSM whine, hydraulic roar, pneumatic blast
    if (p.launching) {
      const sys = p.launchSys || 'lsm';
      if (launchOn === 0) { launchOn = 1; if (sys === 'pneumatic') noiseBurst(t, 1.6, 900, 0.5, 0.5, 'bandpass', trackBus, 0.01); if (sys === 'hydraulic') noiseBurst(t, 2.2, 140, 0.6, 0.5, 'lowpass', trackBus, 0.05); }
      launchO.frequency.setTargetAtTime(sys === 'lsm' ? 90 + v * 26 : 50 + v * 12, t, 0.05); launchF.frequency.setTargetAtTime(sys === 'lsm' ? 300 + v * 60 : 200 + v * 20, t, 0.05);
      launchG.gain.setTargetAtTime(sys === 'lsm' ? 0.16 : 0.08, t, 0.05);
    } else { launchOn = 0; launchG.gain.setTargetAtTime(0, t, 0.15); }
    // chain lift and anti-rollback ratchet
    if ((p.type === T_CHAIN || p.type === T_CABLE) && v > 0.3 && p.phase === 'run') { if (nextClack < t) nextClack = t + 0.02; while (nextClack < t + 0.15) { clack(nextClack); nextClack += (p.type === T_CABLE ? 0.6 : 1.15) / Math.max(0.6, v); } }
    // wooden track joints
    if (p.wood && v > 3 && p.phase === 'run') { if (nextJoint < t) nextJoint = t; while (nextJoint < t + 0.12) { jointClack(nextJoint, Math.min(0.35, 0.08 + v * 0.008)); nextJoint += 3.0 / v; } }
    if (mode === 2 && p.phase === 'run') {
      const air = p.vg < 0.3 && v > 9, plunge = p.ty < -0.55 && v > 13, inv = p.uy < -0.2 && v > 6, heavy = p.vg > 3.4, launch = p.launching && v > 8;
      if ((air || plunge || inv || heavy || launch) && t - lastScream > 2.4) { scream(t, Math.min(1.4, 0.7 + v / 40)); lastScream = t + Math.random() * 1.0; }
      else if (air && t - lastWoo > 3 && Math.random() < 0.05) { woo(t, 1); lastWoo = t; }
      if (!air && !plunge && v > 6 && t - lastScream > 4 && t - lastLaugh > 7 && Math.random() < 0.004) { laugh(t); lastLaugh = t; }
      if (p.onLift && !wasLift) lastGasp = t;
      if (wasLift && !p.onLift && t - lastGasp > 3) gasp(t);
    }
    wasLift = !!p.onLift;
    if (weatherKind === 'rain' && Math.random() < 0.3) noiseBurst(t + Math.random() * 0.1, 0.01, 3000 + Math.random() * 3000, 2, 0.02 + Math.random() * 0.04, 'bandpass', wxBus, 0.001);
  }
  return { setMode, setPaused, update, cheer, thunder, setWeather, get mode() { return mode; } };
}
// ===================== END AUDIO =====================
