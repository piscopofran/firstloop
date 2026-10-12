// Hum-to-notes accuracy: generated singing through the real analysis code.
// node t_pitch.js [path to index.html | path to src/10_dsp.js] [-v]
const fs = require('fs'), path = require('path');
const SG = require('./singer');
const arg = process.argv[2] && !/^-/.test(process.argv[2]) ? process.argv[2] : path.join(__dirname, 'src/10_dsp.js');
let src = fs.readFileSync(arg, 'utf8');
if(/\.html$/.test(arg)){ const a = src.indexOf('  function stDspLib(){'), b = src.indexOf('\n  }\n', src.indexOf('return { analyse:analyse', a)); src = src.slice(a, b + 5); }
const LIB = new Function(src + ';return stDspLib();')();
const V = process.argv.includes('-v');
module.exports = { LIB };

function score(truth, notes){
  // each sung note is looked for among the detected ones: nearest start within 110 ms
  const used = new Set(); let ok = 0, found = 0; const errs = [], miss = [], cents = [];
  for(const t of truth){
    let best = -1, bd = 0.11;
    notes.forEach((n, i) => { if(used.has(i)) return; const d = Math.abs(n.t - t.t); if(d < bd){ bd = d; best = i; } });
    if(best < 0){ miss.push(t); continue; }
    used.add(best); found++; errs.push(notes[best].t - t.t); cents.push(Math.abs(notes[best].p - (t.m + (t.tune || 0) / 100)) * 100);
    if(notes[best].n === Math.round(t.m + (t.tune || 0))) ok++; else miss.push(Object.assign({ got: notes[best].n, gotp: notes[best].p }, t));
  }
  const abs = errs.map(Math.abs).sort((a, b) => a - b);
  return { n: truth.length, ok, found, extra: notes.length - used.size, det: notes.length, cents, errs, med: abs.length ? abs[abs.length >> 1] : 0, p90: abs.length ? abs[Math.floor(abs.length * 0.9)] : 0,
           bias: errs.length ? errs.reduce((a, b) => a + b, 0) / errs.length : 0, miss };
}
const C = 60;
const TUNES = {
  // [midi, beats]
  scale: [[60, 1], [62, 1], [64, 1], [65, 1], [67, 1], [69, 1], [71, 1], [72, 2], [71, 1], [69, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 2]],
  tune: [[64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2]],
  leaps: [[57, 1], [64, 1], [60, 1], [69, 2], [62, 1], [67, 1], [55, 1], [72, 1], [64, 2]],
  bass: [[43, 1], [43, 0.5], [45, 0.5], [47, 1], [43, 1], [50, 1.5], [48, 0.5], [47, 1], [45, 1], [43, 2]],
  rep: [[62, 0.5], [62, 0.5], [62, 0.5], [62, 0.5], [64, 0.5], [64, 0.5], [64, 1], [62, 0.5], [62, 0.5], [60, 0.5], [60, 0.5], [60, 2]],
  eighths: [[60, 0.5], [62, 0.5], [64, 0.5], [65, 0.5], [67, 0.5], [65, 0.5], [64, 0.5], [62, 0.5], [60, 0.5], [64, 0.5], [67, 0.5], [72, 0.5], [71, 0.5], [67, 0.5], [64, 0.5], [60, 0.5]],
  long: [[60, 8], [null, 1], [64, 8], [null, 1], [67, 6]],
  chrom: [[60, 1], [61, 1], [62, 1], [63, 1], [64, 1], [63, 1], [62, 1], [61, 1], [60, 2]],
};
const tr = (steps, k) => steps.map(([m, b]) => [m === null ? null : m + k, b]);
const cases = [];
function add(group, name, notes, so, post){ cases.push({ group, name, notes, so, post }); }
// ---- clean ----
for(const bpm of [60, 100, 140]) add('clean', 'legato ah, scale, ' + bpm, SG.melody(TUNES.scale, bpm), { style: 'legato' });
for(const bpm of [80, 120, 160]) add('clean', 'da-da tune, ' + bpm, SG.melody(TUNES.tune, bpm), { style: 'da', voice: 'ah' });
add('clean', 'ta staccato tune, 110', SG.melody(TUNES.tune, 110, { gate: 0.6 }), { style: 'ta', voice: 'ee' });
add('clean', 'plain staccato, 100 (gaps)', SG.melody(TUNES.tune, 100, { gate: 0.7 }), { style: 'stacc', voice: 'oo' });
add('clean', 'low hum G2 line, legato, 90', SG.melody(TUNES.bass, 90), { style: 'legato', voice: 'hum' });
add('clean', 'low hum G2 line, da, 90', SG.melody(TUNES.bass, 90), { style: 'da', voice: 'hum' });
add('clean', 'very low hum E2 line, 80', SG.melody(tr(TUNES.bass, -3), 80), { style: 'da', voice: 'hum' });
add('clean', 'high whistle to C6, 100', SG.melody(tr(TUNES.scale, 12), 100, { gate: 0.85 }), { style: 'stacc', voice: 'whistle' });
add('clean', 'whistle legato C6-C7, 110', SG.melody(tr(TUNES.tune, 24), 110), { style: 'legato', voice: 'whistle' });
add('clean', 'soprano ah A4-A5, 100', SG.melody(tr(TUNES.scale, 9), 100), { style: 'legato', voice: 'ah' });
add('clean', 'repeated notes da, 60', SG.melody(TUNES.rep, 60), { style: 'da' });
add('clean', 'repeated notes da, 120', SG.melody(TUNES.rep, 120), { style: 'da' });
add('clean', 'repeated notes da, 160', SG.melody(TUNES.rep, 160), { style: 'da' });
add('clean', 'repeated notes ta, 140', SG.melody(TUNES.rep, 140, { gate: 0.7 }), { style: 'ta' });
add('clean', 'eighths legato, 160', SG.melody(TUNES.eighths, 160), { style: 'legato', porta: 0.03 });
add('clean', 'eighths da, 160', SG.melody(TUNES.eighths, 160), { style: 'da' });
add('clean', 'chromatic legato, 90', SG.melody(TUNES.chrom, 90), { style: 'legato' });
add('clean', 'long held notes', SG.melody(TUNES.long, 120), { style: 'stacc' });
add('clean', 'leaps legato, 96', SG.melody(TUNES.leaps, 96), { style: 'legato' });
add('clean', '48 kHz, da tune, 120', SG.melody(TUNES.tune, 120), { style: 'da', sr: 48000 });
add('clean', 'dynamics: soft and loud notes', SG.melody(TUNES.tune.map(([m, b], i) => [m, b, i % 3 === 0 ? 1 : (i % 3 === 1 ? 0.45 : 0.25)]), 100), { style: 'da' });
// ---- hard ----
add('hard', 'vibrato 5.5 Hz ±40c, legato scale, 80', SG.melody(TUNES.scale, 80), { style: 'legato', vib: { rate: 5.5, cents: 40, delay: 0.12 } });
add('hard', 'vibrato 6 Hz ±40c, da tune, 90', SG.melody(TUNES.tune, 90), { style: 'da', vib: { rate: 6, cents: 40, delay: 0.1 } });
add('hard', 'vibrato ±60c long notes', SG.melody(TUNES.long, 120), { style: 'stacc', vib: { rate: 5.2, cents: 60, delay: 0.25 } });
add('hard', 'portamento 120 ms, tune, 90', SG.melody(TUNES.tune, 90), { style: 'legato', porta: 0.12 });
add('hard', 'portamento 150 ms, leaps, 80', SG.melody(TUNES.leaps, 80), { style: 'legato', porta: 0.15 });
add('hard', 'scoops up into notes (1.5 st), 100', SG.melody(TUNES.tune, 100, { gate: 0.8 }), { style: 'stacc', scoop: 1.5 });
add('hard', 'breathy onsets + air, 100', SG.melody(TUNES.tune, 100, { gate: 0.8 }), { style: 'stacc', breath: 1, air: 0.5 });
add('hard', 'singer 35 cents flat, legato', SG.melody(TUNES.scale, 100), { style: 'legato', tune: -35 }, null);
add('hard', 'singer 45 cents sharp + vibrato', SG.melody(TUNES.tune, 90), { style: 'da', tune: 45, vib: { rate: 5.5, cents: 30, delay: 0.1 } });
for(const snr of [30, 20, 12]) add('hard', 'room noise SNR ' + snr + ' dB, da tune', SG.melody(TUNES.tune, 100), { style: 'da' }, (x, sr) => SG.addNoise(x, sr, snr));
add('hard', 'room noise SNR 15 dB, legato hum bass', SG.melody(TUNES.bass, 90), { style: 'legato', voice: 'hum' }, (x, sr) => SG.addNoise(x, sr, 15));
add('hard', 'room noise SNR 20 dB + vibrato + portamento', SG.melody(TUNES.scale, 84), { style: 'legato', porta: 0.1, vib: { rate: 5.6, cents: 40, delay: 0.12 } }, (x, sr) => SG.addNoise(x, sr, 20));
add('hard', 'speaker bleed -25 dB, da tune', SG.melody(TUNES.tune, 100), { style: 'da' }, (x, sr) => SG.mix(x, SG.backing(x.length, sr, 100), -25), { bleed: true });
add('hard', 'speaker bleed -18 dB, legato scale', SG.melody(TUNES.scale, 100), { style: 'legato' }, (x, sr) => SG.mix(x, SG.backing(x.length, sr, 100), -18), { bleed: true });
add('hard', 'clipped (x6 into full scale)', SG.melody(TUNES.tune, 100), { style: 'da' }, x => SG.gain(x, 6, true));
add('hard', 'very quiet (-46 dBFS peak) + faint noise', SG.melody(TUNES.tune, 100), { style: 'da' }, (x, sr) => SG.gain(SG.addNoise(x, sr, 28), 0.012));
add('hard', 'fast 160 eighths, vibrato-less, noise 20', SG.melody(TUNES.eighths, 160), { style: 'da' }, (x, sr) => SG.addNoise(x, sr, 20));
// ---- v34: the ranges of a man and a woman, a laptop's microphone, the metronome in the room ----
add('clean', 'baritone ah A2-A3, da, 96', SG.melody(tr(TUNES.tune, -15), 96), { style: 'da', voice: 'ah' });
add('clean', 'bass voice E2-E3 legato ah, 84', SG.melody(tr(TUNES.scale, -20), 84), { style: 'legato', voice: 'ah' });
add('clean', 'tenor oo C3-C4, da, 110', SG.melody(tr(TUNES.tune, -12), 110), { style: 'da', voice: 'oo' });
add('clean', 'alto ee G3-G4 legato, 100', SG.melody(tr(TUNES.scale, -5), 100), { style: 'legato', voice: 'ee' });
add('clean', 'woman humming a bass line an octave up (G3), 92', SG.melody(tr(TUNES.bass, 12), 92), { style: 'da', voice: 'hum' });
add('clean', 'glides between notes 80 ms, eighths, 120', SG.melody(TUNES.eighths, 120), { style: 'legato', porta: 0.08 });
add('hard', 'laptop microphone, woman da tune, 100', SG.melody(TUNES.tune, 100), { style: 'da' }, (x, sr) => SG.laptop(x, sr, 24));
add('hard', 'laptop microphone, man E2-E3 hum legato (fundamental lost), 84', SG.melody(tr(TUNES.scale, -20), 84), { style: 'legato', voice: 'hum' }, (x, sr) => SG.laptop(x, sr, 24));
add('hard', 'laptop microphone, low hum bass line G2, 90', SG.melody(TUNES.bass, 90), { style: 'da', voice: 'hum' }, (x, sr) => SG.laptop(x, sr, 22));
add('hard', 'laptop microphone + vibrato + breath, soprano', SG.melody(tr(TUNES.scale, 9), 92, { gate: 0.85 }), { style: 'stacc', vib: { rate: 5.6, cents: 35, delay: 0.12 }, breath: 0.8 }, (x, sr) => SG.laptop(x, sr, 22));
add('hard', 'metronome bleed -12 dB, da tune, 100', SG.melody(TUNES.tune, 100), { style: 'da' }, (x, sr) => SG.mix(x, SG.clickBleed(x.length, sr, 100, 0.4), -12));
add('hard', 'metronome bleed -6 dB, legato scale, 100', SG.melody(TUNES.scale, 100), { style: 'legato' }, (x, sr) => SG.mix(x, SG.clickBleed(x.length, sr, 100, 0.4), -6));
add('hard', 'metronome bleed -10 dB + laptop microphone, hum bass', SG.melody(TUNES.bass, 90), { style: 'da', voice: 'hum' }, (x, sr) => SG.laptop(SG.mix(x, SG.clickBleed(x.length, sr, 90, 0.4), -10), sr, 24));
add('hard', 'metronome and song bleed -18 dB + noise 20 dB, vibrato tune', SG.melody(TUNES.tune, 100), { style: 'da', vib: { rate: 5.5, cents: 30, delay: 0.1 } }, (x, sr) => SG.addNoise(SG.mix(x, SG.backing(x.length, sr, 100), -18), sr, 20));
// bleed flag passed per case
for(const c of cases){ if(c.post && typeof c.post !== 'function'){ c.ao = c.post; c.post = null; } }
cases.forEach(c => { const a = arguments; });

function run(){
  const rows = [], tot = { clean: { n: 0, ok: 0, found: 0, extra: 0, errs: [] }, hard: { n: 0, ok: 0, found: 0, extra: 0, errs: [] } };
  for(const c of cases){
    const s = SG.sing(c.notes, c.so);
    let x = s.x;
    const ao = {};
    if(typeof c.post === 'function') x = c.post(x, s.sr);
    if(/bleed/.test(c.name)) ao.bleed = true;
    const t0 = Date.now(), an = LIB.analyse(x, s.sr, ao), ms = Date.now() - t0;
    const truth = s.truth.map(t => Object.assign({ tune: 0 }, t));
    // a singer who is off concert pitch as a whole is judged on her own melody: the nearest semitones to what she sang, after her own offset
    const sc = score(truth, an.notes);
    rows.push({ c, sc, ms, an, dur: x.length / s.sr });
    const T = tot[c.group]; T.n += sc.n; T.ok += sc.ok; T.found += sc.found; T.extra += sc.extra; T.det = (T.det || 0) + sc.det; T.cents = (T.cents || []).concat(sc.cents); T.on = (T.on || []).concat(sc.errs.map(Math.abs));
    for(const t of truth){ /* collected below */ }
    T.errs.push({ med: sc.med, n: sc.found });
  }
  return { rows, tot };
}
if(require.main === module){
  const { rows, tot } = run();
  const pad = (s, n) => (s + ' '.repeat(n)).slice(0, n);
  console.log(pad('case', 52) + pad('notes', 7) + pad('pitch ok', 10) + pad('found', 7) + pad('extra', 7) + pad('onset med', 11) + pad('p90', 8) + pad('bias', 8) + 'ms/s');
  let allOn = [];
  for(const r of rows){
    const { c, sc } = r;
    console.log(pad((c.group === 'hard' ? 'H ' : 'C ') + c.name, 52) + pad(sc.n, 7) + pad(sc.ok + ' ' + (100 * sc.ok / sc.n).toFixed(0) + '%', 10) + pad(sc.found, 7) + pad(sc.extra, 7) +
      pad((sc.med * 1000).toFixed(1) + ' ms', 11) + pad((sc.p90 * 1000).toFixed(0), 8) + pad((sc.bias * 1000).toFixed(0), 8) + (r.ms / r.dur).toFixed(0));
    if(V && (sc.ok < sc.n || sc.extra)){ console.log('     missed/wrong: ' + JSON.stringify(sc.miss.map(m => ({ t: +m.t.toFixed(2), m: m.m, got: m.got, gp: m.gotp })))); console.log('     got: ' + r.an.notes.map(n => n.t.toFixed(2) + ':' + n.n + '/' + n.d.toFixed(2)).join(' ') + ' tune ' + r.an.tune.toFixed(2)); }
  }
  for(const g of ['clean', 'hard']){
    const T = tot[g];
    const meds = rows.filter(r => r.c.group === g).map(r => r.sc.med).sort((a, b) => a - b);
    console.log('TOTAL ' + g + ': pitch ' + T.ok + '/' + T.n + ' = ' + (100 * T.ok / T.n).toFixed(1) + '%   found ' + T.found + '   extra ' + T.extra + '   median of onset medians ' + (meds[meds.length >> 1] * 1000).toFixed(1) + ' ms, worst case median ' + (meds[meds.length - 1] * 1000).toFixed(1) + ' ms');
  }
  const med = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : 0; }, p90 = a => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length * 0.9)] : 0; };
  for(const g of ['clean', 'hard']){
    const T = tot[g];
    console.log('SUMMARY ' + g + ': notes sung ' + T.n + ', detected ' + T.det + ', correct ' + T.ok + '  recall ' + (100 * T.ok / T.n).toFixed(1) + '%  precision ' + (100 * T.ok / T.det).toFixed(1) + '%  pitch error median ' + med(T.cents).toFixed(1) + ' cents (p90 ' + p90(T.cents).toFixed(1) + ')  onset error median ' + (1000 * med(T.on)).toFixed(1) + ' ms (p90 ' + (1000 * p90(T.on)).toFixed(1) + ')');
    console.log((100 * T.ok / T.n >= (g === 'clean' ? 95 : 85) && 100 * T.ok / T.det >= (g === 'clean' ? 95 : 85) ? 'PASS ' : 'FAIL ') + g + ' input: at least ' + (g === 'clean' ? 95 : 85) + '% of notes right, both ways');
  }
  // nothing from breath, room noise or silence
  const sr = 44100, R = SG.rng(5), len = sr * 6;
  const silence = new Float32Array(len);
  const room = SG.gain(SG.addNoise(SG.gain(SG.sing([{ t: 0.1, d: 0.2, m: 60 }], { tail: 5.7 }).x, 0), sr, 0), 1);
  const noiseOnly = new Float32Array(len); { let b = 0; for(let i = 0; i < len; i++){ const w = R() * 2 - 1; b = 0.98 * b + 0.02 * w; noiseOnly[i] = 0.02 * (b * 6 + 0.3 * w) + 0.004 * Math.sin(2 * Math.PI * 50 * i / sr); } }
  const breath = new Float32Array(len); { let b = 0; for(let i = 0; i < len; i++){ const w = R() * 2 - 1; b = 0.7 * b + 0.3 * w; const e = Math.max(0, Math.sin(2 * Math.PI * i / sr / 2.5)); breath[i] = 0.08 * e * e * b + 0.002 * w; } }
  const clicks = new Float32Array(len); for(let k = 0; k < 10; k++){ const a = Math.round((0.3 + k * 0.5) * sr); for(let i = 0; i < 900; i++) clicks[a + i] = 0.5 * Math.sin(2 * Math.PI * 1500 * i / sr) * (1 - i / 900); }
  // breath between sung notes at a normal level
  const sung = SG.sing(SG.melody(TUNES.tune, 100, { gate: 0.6 }), { style: 'stacc' }); const withBreath = new Float32Array(sung.x.length); { let b = 0; for(let i = 0; i < withBreath.length; i++){ const w = R() * 2 - 1; b = 0.7 * b + 0.3 * w; const ph = (i / sung.sr * 100 / 60) % 1; withBreath[i] = sung.x[i] + (ph > 0.65 && ph < 0.95 ? 0.03 * b : 0) + 0.001 * w; } }
  const z = [['silence', silence], ['room noise only', noiseOnly], ['breathing only', breath], ['metronome clicks only', clicks]].map(([n, x]) => [n, LIB.analyse(x, sr, {}).notes.length]);
  const wb = score(sung.truth, LIB.analyse(withBreath, sung.sr, {}).notes);
  console.log('NO-NOTE inputs (notes found, want 0): ' + z.map(a => a[0] + ' ' + a[1]).join(', ') + '; breaths between sung notes: extra ' + wb.extra + ', pitch ' + wb.ok + '/' + wb.n);
}
module.exports.run = run; module.exports.score = score; module.exports.TUNES = TUNES;
