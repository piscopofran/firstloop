// A synthetic singer for the hum-to-notes tests: harmonic-rich voice with formants, vibrato, portamento,
// "da"/"ta" consonants, breathy onsets, plus room noise, speaker bleed and clipping. Deterministic.
function rng(seed){ let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const m2hz = m => 440 * Math.pow(2, (m - 69) / 12);
const FORMANTS = {
  ah: [[700, 110, 1], [1150, 120, 0.6], [2600, 160, 0.25]],
  oo: [[320, 80, 1], [800, 100, 0.35], [2300, 150, 0.08]],
  ee: [[280, 70, 1], [2250, 130, 0.45], [2900, 160, 0.25]],
  hum: [[250, 120, 1], [1000, 300, 0.05]],
};
function formantGain(f, name){
  const F = FORMANTS[name]; let g = 0.02;
  for(const [fc, bw, a] of F){ const x = (f - fc) / bw; g += a / (1 + x * x); }
  return g;
}
// notes: [{t, d, m, amp?}] sorted. o: { sr, voice:'ah'|'oo'|'ee'|'hum'|'whistle', style:'legato'|'da'|'ta'|'stacc',
//   vib:{rate,cents,delay}, porta:sec, breath:0..1, jitter:cents, tune:cents, seed, tail }
function sing(notes, o){
  o = Object.assign({ sr: 44100, voice: 'ah', style: 'legato', porta: 0.05, breath: 0, jitter: 4, tune: 0, seed: 7, tail: 0.5, lead: 0 }, o || {});
  const sr = o.sr, R = rng(o.seed), end = notes[notes.length - 1].t + notes[notes.length - 1].d + o.tail;
  const N = Math.round(end * sr), out = new Float32Array(N);
  // per-sample pitch (midi) and amplitude targets
  const pitch = new Float32Array(N), amp = new Float32Array(N), noiseAmp = new Float32Array(N), bar = new Float32Array(N);
  const truth = [];
  for(let i = 0; i < notes.length; i++){
    const n = notes[i], nx = notes[i + 1], pv = notes[i - 1];
    const a = n.amp === undefined ? 1 : n.amp;
    const joinedNext = nx && Math.abs(nx.t - (n.t + n.d)) < 0.012, joinedPrev = pv && Math.abs(n.t - (pv.t + pv.d)) < 0.012;
    const s0 = Math.round(n.t * sr), s1 = Math.round((n.t + n.d) * sr);
    let att = 0.03, rel = 0.05;
    if(o.style === 'da' || o.style === 'ta' || o.style === 'stacc') att = 0.014;
    if(o.style === 'legato' && joinedPrev && pv.m === n.m) truth[truth.length - 1].d += n.d; else truth.push({ t: n.t, d: n.d, m: n.m });
    for(let s = s0; s < Math.min(N, s1 + Math.round(rel * sr)); s++){
      const tt = (s - s0) / sr; let e = 1;
      if(o.style === 'legato' && joinedPrev){ e = 1; } else if(tt < att) e = 0.5 - 0.5 * Math.cos(Math.PI * tt / att);
      if(s >= s1){ if(o.style === 'legato' && joinedNext) e = 0; else e *= 0.5 + 0.5 * Math.cos(Math.PI * (s - s1) / (rel * sr)); }
      // a slight natural swell and decay
      const shape = 0.85 + 0.15 * Math.sin(Math.PI * Math.min(1, tt / Math.max(0.05, n.d)));
      if(s < s1 || !(o.style === 'legato' && joinedNext)) amp[s] = Math.max(amp[s], a * e * shape);
    }
    // pitch: target with vibrato, glide from the previous note when joined
    for(let s = s0; s < Math.min(N, s1 + Math.round(rel * sr)); s++){
      const tt = (s - s0) / sr; let p = n.m + o.tune / 100;
      if(o.vib && tt > (o.vib.delay || 0)){
        const dep = Math.min(1, (tt - (o.vib.delay || 0)) / 0.15);
        p += dep * (o.vib.cents / 100) * Math.sin(2 * Math.PI * o.vib.rate * tt);
      }
      if(joinedPrev && o.style === 'legato' && tt < o.porta / 2){
        const x = 0.5 + tt / o.porta; p = pv.m + o.tune / 100 + (p - pv.m - o.tune / 100) * (0.5 - 0.5 * Math.cos(Math.PI * x));
      }
      if(joinedNext && o.style === 'legato' && (s1 - s) / sr < o.porta / 2){
        const x = 0.5 - (s1 - s) / sr / o.porta; p = p + (nx.m + o.tune / 100 - p) * (0.5 - 0.5 * Math.cos(Math.PI * x));
      }
      // scoop into a note after silence
      if(o.scoop && !joinedPrev && tt < 0.07) p -= o.scoop * (1 - tt / 0.07);
      pitch[s] = p;
    }
    // consonants
    if(o.style === 'da'){
      // closure: 45 ms before the vowel the voice drops to a murmur (only when another note was sounding), then a short burst
      const c0 = Math.max(0, s0 - Math.round(0.045 * sr));
      for(let s = c0; s < s0; s++){ if(amp[s] > 0){ amp[s] *= 0.07; bar[s] = 1; } }
      for(let s = s0; s < Math.min(N, s0 + Math.round(0.008 * sr)); s++) noiseAmp[s] = Math.max(noiseAmp[s], 0.25 * a);
    } else if(o.style === 'ta'){
      const c0 = Math.max(0, s0 - Math.round(0.06 * sr));
      for(let s = c0; s < s0; s++) amp[s] = 0;
      for(let s = Math.max(0, s0 - Math.round(0.018 * sr)); s < s0; s++) noiseAmp[s] = Math.max(noiseAmp[s], 0.2 * a);
    }
    if(o.breath && !joinedPrev){
      const b0 = Math.max(0, s0 - Math.round(0.07 * sr)), b1 = Math.min(N, s0 + Math.round(0.05 * sr));
      for(let s = b0; s < b1; s++){
        const x = s < s0 ? (s - b0) / (s0 - b0) : 1 - (s - s0) / (b1 - s0);
        noiseAmp[s] = Math.max(noiseAmp[s], o.breath * 0.3 * a * x);
      }
    }
  }
  // carry pitch through silences so the oscillator has something to do
  let lastP = notes[0].m; for(let s = 0; s < N; s++){ if(pitch[s] > 0) lastP = pitch[s]; else pitch[s] = lastP; }
  // smooth amplitude a little (3 ms) so nothing clicks
  const k = Math.exp(-1 / (0.003 * sr)); let ae = 0;
  let ph = 0, jit = 0, shim = 0, lp = 0;
  const voice = o.voice;
  for(let s = 0; s < N; s++){
    ae = k * ae + (1 - k) * amp[s];
    if(s % 64 === 0){ jit = (R() - 0.5) * 2 * o.jitter / 100; shim = 1 + (R() - 0.5) * 0.06; }
    const f = m2hz(pitch[s] + jit);
    ph += 2 * Math.PI * f / sr; if(ph > 1e6) ph -= 2 * Math.PI * Math.floor(ph / (2 * Math.PI));
    let v = 0;
    if(voice === 'whistle'){
      v = Math.sin(ph) + 0.03 * Math.sin(2 * ph);
    } else {
      const maxH = Math.min(voice === 'hum' ? 8 : 40, Math.floor(0.45 * sr / f), Math.floor(6000 / f));
      const onlyBar = bar[s] > 0;
      for(let h = 1; h <= (onlyBar ? 2 : maxH); h++){
        const src = 1 / Math.pow(h, voice === 'hum' ? 1.6 : 1.1);
        v += src * formantGain(f * h, voice === 'hum' ? 'hum' : voice) * Math.sin(h * ph + h * 0.7);
      }
      v *= voice === 'hum' ? 1.4 : 1.1;
    }
    const nz = R() * 2 - 1; lp = 0.6 * lp + 0.4 * nz;
    out[s] = 0.32 * ae * shim * v + noiseAmp[s] * (voice === 'whistle' ? lp : nz) * 0.5 + (o.air ? o.air * ae * lp * 0.2 : 0);
  }
  return { x: out, truth, sr };
}
function rmsOf(x){ let s = 0; for(let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); }
// the level of the voice where it is sounding
function activeRms(x){ let s = 0, c = 0; for(let i = 0; i < x.length; i++){ if(Math.abs(x[i]) > 0.01){ s += x[i] * x[i]; c++; } } return Math.sqrt(s / Math.max(1, c)); }
// room noise: mostly low, with some mains hum
function addNoise(x, sr, snrDb, seed){
  const R = rng(seed || 99), ref = activeRms(x), target = ref / Math.pow(10, snrDb / 20), nz = new Float32Array(x.length);
  let b0 = 0, b1 = 0, b2 = 0;
  for(let i = 0; i < x.length; i++){
    const w = R() * 2 - 1; b0 = 0.99765 * b0 + w * 0.0990460; b1 = 0.96300 * b1 + w * 0.2965164; b2 = 0.57000 * b2 + w * 1.0526913;
    nz[i] = b0 + b1 + b2 + w * 0.1848 + 0.25 * Math.sin(2 * Math.PI * 50 * i / sr) + 0.1 * Math.sin(2 * Math.PI * 150 * i / sr);
  }
  const g = target / rmsOf(nz); const y = new Float32Array(x.length);
  for(let i = 0; i < x.length; i++) y[i] = x[i] + g * nz[i];
  return y;
}
// a backing track coming out of the speakers into the microphone: bass notes, a chord pad and a click
function backing(len, sr, bpm, seed){
  const y = new Float32Array(len), beat = 60 / bpm, chords = [[48, 52, 55], [45, 48, 52], [41, 45, 48], [43, 47, 50]];
  for(let i = 0; i < len; i++){
    const t = i / sr, b = Math.floor(t / beat), ch = chords[Math.floor(b / 4) % 4], tb = t - b * beat;
    let v = 0;
    for(const m of ch) v += 0.12 * Math.sin(2 * Math.PI * m2hz(m + 12) * t) + 0.05 * Math.sin(4 * Math.PI * m2hz(m + 12) * t);
    v += 0.35 * Math.exp(-tb * 5) * Math.sin(2 * Math.PI * m2hz(ch[0] - 12) * t);
    if(tb < 0.02) v += 0.5 * Math.sin(2 * Math.PI * 1500 * tb) * (1 - tb / 0.02);
    y[i] = v;
  }
  return y;
}
function mix(x, y, db){ const g = Math.pow(10, db / 20) * activeRms(x) / rmsOf(y), o = new Float32Array(x.length); for(let i = 0; i < x.length; i++) o[i] = x[i] + g * (y[i] || 0); return o; }
function gain(x, g, clip){ const o = new Float32Array(x.length); for(let i = 0; i < x.length; i++){ let v = x[i] * g; if(clip) v = Math.max(-1, Math.min(1, v)); o[i] = v; } return o; }
// a melody from scale steps: [[midi, beats], ...] at a tempo; gapFrac of each note is silence unless legato
function melody(steps, bpm, o){
  o = o || {}; const beat = 60 / bpm, notes = []; let t = o.start === undefined ? 0.4 : o.start;
  for(const [m, b, a] of steps){
    if(m !== null) notes.push({ t, d: b * beat * (o.gate === undefined ? 1 : o.gate), m, amp: a });
    t += b * beat;
  }
  return notes;
}
function wav(x, sr){
  const b = Buffer.alloc(44 + x.length * 2); b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for(let i = 0; i < x.length; i++) b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, x[i])) * 32767), 44 + i * 2);
  return b;
}
// a laptop's built-in microphone: little below 250 Hz, a peak around 3 kHz, nothing much above 7 kHz, and its own hiss
function biquad(x, sr, type, f0, Q){
  const w = 2 * Math.PI * f0 / sr, c = Math.cos(w), al = Math.sin(w) / (2 * Q); let b0, b1, b2, a0 = 1 + al, a1 = -2 * c, a2 = 1 - al;
  if(type === 'hp'){ b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; } else if(type === 'lp'){ b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; } else { b0 = 1 + al * 2; b1 = -2 * c; b2 = 1 - al * 2; }
  const y = new Float32Array(x.length); let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for(let i = 0; i < x.length; i++){ const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x[i]; y2 = y1; y1 = v; y[i] = v; }
  return y;
}
function laptop(x, sr, snrDb){
  let y = biquad(biquad(x, sr, 'hp', 250, 0.7), sr, 'hp', 250, 0.7); y = biquad(y, sr, 'pk', 3000, 1.2); y = biquad(biquad(y, sr, 'lp', 7000, 0.7), sr, 'lp', 7000, 0.7);
  return addNoise(y, sr, snrDb === undefined ? 24 : snrDb, 31);
}
// the metronome coming out of the speakers into the microphone: the app's own click on every beat, high on the bar
function clickBleed(len, sr, bpm, start){
  const y = new Float32Array(len), beat = 60 / bpm;
  for(let k = 0; (start || 0) + k * beat < len / sr; k++){
    const a = Math.round(((start || 0) + k * beat) * sr), f = k % 4 === 0 ? 1568 : 1046.5, n = Math.round(sr * 0.03);
    for(let i = 0; i < n && a + i < len; i++){ const e = Math.exp(-i / sr * 160) * Math.min(1, i / 8); y[a + i] += e * (Math.sin(2 * Math.PI * f * i / sr) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * i / sr)) * 0.6; }
  }
  return y;
}
module.exports = { sing, addNoise, backing, mix, gain, melody, wav, rng, m2hz, rmsOf, activeRms, laptop, clickBleed, biquad };
