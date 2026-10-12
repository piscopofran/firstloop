// the sample player with the real instrument files: pitch of every note of every instrument, note ends, velocity, voice limit, drums
const L = require('./lib'), { ok } = L;
(async () => {
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  await E(async () => {
    const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest();
    // fine pitch of a stretch of signal near an expected frequency: the lag at which it best matches itself
    window.pitchOf = (x, sr, f0, from) => {
      const per = sr / f0, lo = Math.floor(per / Math.pow(2, 1.6 / 12)), hi = Math.ceil(per * Math.pow(2, 1.6 / 12)), N = Math.min(x.length - from - hi - 2, Math.round(Math.max(0.12 * sr, Math.min(0.6 * sr, 24 * per))));
      if(N < per * 4) return null;
      let best = -1, bl = 0; const c = [];
      for(let l = lo; l <= hi; l++){ let s = 0, e1 = 0, e2 = 0; for(let i = 0; i < N; i++){ const a = x[from + i], b2 = x[from + i + l]; s += a * b2; e1 += a * a; e2 += b2 * b2; } const v = s / Math.sqrt(e1 * e2 + 1e-20); c[l] = v; if(v > best){ best = v; bl = l; } }
      if(best < 0.5 || bl === lo || bl === hi) return { cents:null, clarity:best };
      const a = c[bl - 1], m = c[bl], n = c[bl + 1], d = 0.5 * (a - n) / (a - 2 * m + n), lag = bl + d;
      return { cents:1200 * Math.log2((sr / lag) / f0), clarity:best };
    };
    window.renderNotes = async (inst, notes, o) => {
      // notes: [{p, v, t, d}] -> mono Float32Array
      o = o || {}; const sr = T.ENG.ctx.sampleRate, end = Math.max(...notes.map(n => n.t + n.d)) + (o.tail || 1.5);
      const oc = new OfflineAudioContext(2, Math.ceil(end * sr), sr), G = T.buildGraph(oc, false, { limiter:false });
      const t = { id:'_x', kind:o.drums ? 'drums' : 'inst', inst, vol:1, pan:0, send:0, eq:[0, 0, 0], oct:0, mute:false, solo:false, regions:[] };
      T.trackNodes(G, t); G.tracks._x.vol.gain.value = 1; G.tracks._x.send.gain.value = 0;
      let made = 0; notes.forEach((n, i) => { const v = o.drums ? T.playDrum(G, t, n.p, n.v, n.t, i) : T.playNote(G, t, n.p, n.v, n.t, n.d); if(v) made++; });
      const buf = await oc.startRendering(), a = buf.getChannelData(0), c = buf.getChannelData(1), x = new Float32Array(a.length); for(let i = 0; i < a.length; i++) x[i] = 0.5 * (a[i] + c[i]);
      return { x, sr, made, voices:G.voices.length };
    };
  });
  const insts = await E(() => STUDIO._t.instList().filter(d => !d.kit).map(d => ({ id:d.id, range:d.range, basic:!!d.basic, loop:d.loop, name:d.name, rel:d.release })));
  ok(insts.filter(d => !d.basic).length >= 15, 'the manifest lists the recorded instruments', insts.filter(d => !d.basic).length + ' recorded, ' + insts.filter(d => d.basic).length + ' basic');
  let worstPlayer = 0, absAll = [], pianoAll = [], rows = [];
  for(const d of insts){
    if(process.env.INST && !new RegExp(process.env.INST).test(d.id)) continue;
    const r = await E(async d => {
      const T = STUDIO._t; const okL = await T.loadInst(d.id); if(!okL) return { failed:true };
      const I = T.ENG.inst[d.id], sr = T.ENG.ctx.sampleRate, lo = d.range[0], hi = d.range[1], notes = [];
      for(let n = lo; n <= hi; n++) notes.push({ p:n, v:120, t:(n - lo) * 1.1 + 0.05, d:0.7 });
      const R = await renderNotes(d.id, notes, {});
      const out = { n:notes.length, made:R.made, zones:I.zones.length, abs:[], player:[], silent:[], unclear:[], maxShift:0 };
      const meas = {};
      notes.forEach(n => { const f = 440 * Math.pow(2, (n.p - 69) / 12), from = Math.round((n.t + (d.loop ? 0.3 : 0.09)) * sr); let e = 0; /* a held note is measured once its attack is over (a low horn note scoops up to its pitch) */ for(let i = from; i < from + 4000; i++) e += R.x[i] * R.x[i]; if(e < 1e-7){ out.silent.push(n.p); return; } let m = pitchOf(R.x, sr, f, from); if(d.loop && m && m.cents !== null){ const ms = [m.cents]; for(const dt of [-0.15, -0.08, 0.08, 0.16, 0.24]){ const q = pitchOf(R.x, sr, f, from + Math.round(dt * sr)); if(q && q.cents !== null) ms.push(q.cents); } ms.sort((x, y) => x - y); m = { cents:ms[ms.length >> 1] }; } if(!m || m.cents === null){ out.unclear.push(n.p); return; } meas[n.p] = m.cents; out.abs.push([n.p, m.cents]); });
      // the player's own error: a note between two samples against the sample it was made from
      notes.forEach(n => { const z = T.pickZone(I, n.p, n.v); const zn = z.nominal === undefined ? Math.round(z.note) : z.nominal; out.maxShift = Math.max(out.maxShift, Math.abs(n.p - zn)); if(meas[n.p] !== undefined && meas[zn] !== undefined && zn !== n.p) out.player.push([n.p, meas[n.p] - meas[zn]]); });
      return out;
    }, d);
    if(r.failed){ ok(false, d.id + ': loads'); continue; }
    if(process.env.INST) console.log(d.id, 'over 10 cents:', r.abs.filter(a => Math.abs(a[1]) > 10).map(a => a[0] + ':' + a[1].toFixed(0)).join(' '), 'unclear', r.unclear.join(' '));
    const absV = r.abs.map(a => Math.abs(a[1])).sort((x, y) => x - y), pl = r.player.map(a => Math.abs(a[1])).sort((x, y) => x - y);
    const med = a => a.length ? a[a.length >> 1] : 0, mx = a => a.length ? a[a.length - 1] : 0, over5 = r.abs.filter(a => Math.abs(a[1]) > 5).length;
    rows.push({ id:d.id, notes:r.n, measured:r.abs.length, medAbs:med(absV), maxAbs:mx(absV), over5, medPlayer:med(pl), maxPlayer:mx(pl), maxShift:r.maxShift, silent:r.silent.length, unclear:r.unclear.length });
    if(!d.basic){ worstPlayer = Math.max(worstPlayer, med(pl)); if(!/(grand|upright)-piano/.test(d.id)) absAll = absAll.concat(absV); else pianoAll = pianoAll.concat(absV); }
    ok(r.made === r.n && r.silent.length === 0, d.id + ': every note of its range sounds (' + r.n + ' notes, ' + r.zones + ' samples)', r.silent.length ? 'silent: ' + r.silent.join(' ') : '');
    ok(r.maxShift <= 3.01 || !d.basic, d.id + ': no note is further than 3 semitones from a sample' + (r.maxShift > 3.01 ? ' (NOT SO in this copy of the files: ' + r.maxShift + ')' : ''), 'furthest ' + r.maxShift.toFixed(2));
    const piano = /(grand|upright)-piano/.test(d.id);
    const plucked = /pizz|upright-bass/.test(d.id), held = !!d.loop && !d.basic, share = (r.abs.length - over5) / Math.max(1, r.abs.length);
    ok(piano ? med(absV) <= 12 : plucked ? share >= 0.6 && med(absV) <= 5 : held ? share >= 0.8 && med(absV) <= 3.6 && mx(absV) <= 12 : share >= 0.9 && med(absV) <= 3.6,
       d.id + (piano ? ': an acoustic piano keeps its own stretched tuning (median within 12 cents)' : plucked ? ': plucked strings drift as they ring: median within 5 cents, six notes in ten within 5' : held ? ': a bowed or blown note moves a little as it is held: median within 3.6 cents, eight notes in ten within 5, none beyond 12' : ': at least nine notes in ten within 5 cents of their pitch, median within 3.6'),
       'median ' + med(absV).toFixed(1) + ', max ' + mx(absV).toFixed(1) + ' cents, ' + over5 + ' of ' + r.abs.length + ' over 5');
  }
  console.log('\ninstrument             notes meas  |abs| med  max   >5c   player med  max   furthest sample');
  rows.forEach(r => console.log((r.id + ' '.repeat(22)).slice(0, 22) + String(r.notes).padEnd(6) + String(r.measured).padEnd(6) + r.medAbs.toFixed(1).padEnd(10) + r.maxAbs.toFixed(1).padEnd(6) + String(r.over5).padEnd(6) + r.medPlayer.toFixed(2).padEnd(12) + r.maxPlayer.toFixed(1).padEnd(6) + r.maxShift));
  absAll.sort((x, y) => x - y);
  const within5 = absAll.filter(v => v <= 5).length, within10 = absAll.filter(v => v <= 10).length;
  pianoAll.sort((x, y) => x - y); console.log('acoustic pianos (stretched tuning kept): ' + pianoAll.length + ' notes, median ' + (pianoAll[pianoAll.length >> 1] || 0).toFixed(1) + ' cents from equal temperament');
  console.log('recorded instruments other than the acoustic pianos, all notes: ' + absAll.length + ' measured; within 5 cents of equal temperament ' + (100 * within5 / absAll.length).toFixed(1) + '%, within 10 cents ' + (100 * within10 / absAll.length).toFixed(1) + '%, median ' + absAll[absAll.length >> 1].toFixed(1) + ', p95 ' + absAll[Math.floor(absAll.length * 0.95)].toFixed(1) + ' cents');
  ok(worstPlayer <= 2.5, 'the player itself: a note made from a neighbouring sample is within 2.5 cents (median, worst instrument) of that sample moved by the interval', worstPlayer.toFixed(2) + ' cents');
  ok(within5 / absAll.length >= 0.9, 'recorded instruments other than the acoustic pianos: at least 90% of all notes within 5 cents of their pitch', (100 * within5 / absAll.length).toFixed(1) + '%');
  // --- note ends: no click, a tail, then silence ---
  for(const id of ['strings', 'flute', 'upright-bass', 'grand-piano', 'electric-piano', 'basic:strings', 'basic:piano']){
    const r = await E(async id => {
      const T = STUDIO._t; await T.loadInst(id); const I = T.ENG.inst[id], sr = T.ENG.ctx.sampleRate, mid = Math.round((I.range[0] + I.range[1]) / 2), rel = I.release;
      const R = await renderNotes(id, [{ p:mid, v:120, t:0.05, d:0.5 }], { tail:rel * 3 + 0.5 }), x = R.x, e = Math.round(0.55 * sr);
      let dS = 0, dE = 0, i; for(i = Math.round(0.2 * sr); i < e - 200; i++) dS = Math.max(dS, Math.abs(x[i] - x[i - 1])); for(i = e - 100; i < e + Math.round((rel * 2 + 0.05) * sr) && i < x.length; i++) dE = Math.max(dE, Math.abs(x[i] - x[i - 1]));
      const rms = (a, n) => { let s = 0; for(let k = a; k < a + n && k < x.length; k++) s += x[k] * x[k]; return Math.sqrt(s / n); };
      const start = Math.max(...Array.from(x.subarray(Math.round(0.05 * sr) - 2, Math.round(0.05 * sr) + 3)).map(Math.abs));
      return { dS, dE, before:rms(e - 4000, 4000), tail:rms(e + Math.round(rel / 3 * sr), 1000), gone:rms(e + Math.round((rel * 2 + 0.1) * sr), 2000), start };
    }, id);
    ok(r.dE <= r.dS * 1.25 + 1e-4, id + ': no click where a note ends (largest step there against the largest while it sounds)', r.dE.toFixed(4) + ' vs ' + r.dS.toFixed(4));
    ok(r.tail > r.before * 0.02 && r.tail < r.before * 1.05 && r.gone < r.before * 0.02 + 1e-4, id + ': a release tail, then silence', 'before ' + r.before.toFixed(4) + ' tail ' + r.tail.toFixed(4) + ' after ' + r.gone.toFixed(5));
  }
  // --- velocity: louder and brighter ---
  for(const id of ['grand-piano', 'steel-guitar', 'basic:piano']){
    const r = await E(async id => {
      const T = STUDIO._t; await T.loadInst(id); const sr = T.ENG.ctx.sampleRate;
      const zc = x => { let z = 0; for(let i = 1; i < x.length; i++) if((x[i] >= 0) !== (x[i - 1] >= 0)) z++; return z / x.length; }, rms = x => { let s = 0; for(let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length); };
      const out = []; for(const v of [30, 70, 120]){ const R = await renderNotes(id, [{ p:60, v, t:0.05, d:0.8 }], {}); const seg = R.x.subarray(Math.round(0.06 * sr), Math.round(0.6 * sr)); out.push([rms(seg), zc(seg)]); }
      return out; }, id);
    ok(r[0][0] < r[1][0] && r[1][0] < r[2][0] && r[2][0] > r[0][0] * 3, id + ': a harder note is louder', r.map(a => a[0].toFixed(4)).join(' < '));
    ok(r[0][1] < r[2][1], id + ': and brighter', r.map(a => a[1].toFixed(4)).join(' , '));
  }
  // --- many notes at once: the limit holds, the oldest give way, nothing breaks ---
  let r = await E(async () => { const T = STUDIO._t; await T.loadInst('grand-piano'); const notes = []; for(let i = 0; i < 140; i++) notes.push({ p:36 + (i % 60), v:100, t:0.05 + i * 0.004, d:2 });
    const R = await renderNotes('grand-piano', notes, {}); let nan = 0, pk = 0; for(let i = 0; i < R.x.length; i++){ if(R.x[i] !== R.x[i]) nan++; pk = Math.max(pk, Math.abs(R.x[i])); }
    return { made:R.made, voices:R.voices, nan, pk }; });
  ok(r.made === 140 && r.voices <= 56 && r.nan === 0 && r.pk > 0.05, '140 notes within half a second: all start, at most 56 sound together, the output is sound', JSON.stringify(r));
  // --- kits ---
  const kits = await E(() => STUDIO._t.instList().filter(d => d.kit).map(d => d.id));
  for(const id of kits){
    r = await E(async id => { const T = STUDIO._t; const okL = await T.loadInst(id); if(!okL) return { failed:true }; const I = T.ENG.inst[id], base = ['kick', 'snare', 'hat_closed', 'hat_open', 'tom_low', 'tom_mid', 'tom_high', 'ride', 'crash', 'rim', 'clap', 'shaker', 'tambourine'], sr = T.ENG.ctx.sampleRate;
      const notes = base.map((pc, i) => ({ p:T.DRUM[pc], v:110, t:0.05 + i * 0.7, d:0 })), R = await renderNotes(id, notes, { drums:true, tail:1 }), silent = [], late = [];
      base.forEach((pc, i) => { const a = Math.round((0.05 + i * 0.7) * sr); let pk = 0, first = -1; for(let k = a; k < a + Math.round(0.4 * sr); k++){ const v = Math.abs(R.x[k]); if(v > pk) pk = v; } for(let k = a; k < a + Math.round(0.4 * sr); k++){ if(Math.abs(R.x[k]) > pk * 0.1){ first = k - a; break; } } if(pk < 0.003) silent.push(pc); else if(first / sr > 0.012) late.push(pc + ' ' + Math.round(first / sr * 1000) + 'ms'); });
      const soft = await renderNotes(id, [{ p:T.DRUM.snare, v:40, t:0.05, d:0 }], { drums:true, tail:0.6 }), loud = await renderNotes(id, [{ p:T.DRUM.snare, v:120, t:0.05, d:0 }], { drums:true, tail:0.6 });
      const pk = x => { let m = 0; for(let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i])); return m; };
      return { pieces:Object.keys(I.pieces).length, layers:Math.max(...Object.keys(I.pieces).map(k => I.pieces[k].length)), silent, late, soft:pk(soft.x), loud:pk(loud.x) }; }, id);
    if(r.failed){ ok(false, id + ': loads'); continue; }
    ok(r.silent.length === 0, id + ': every one of the thirteen usual pieces sounds (its own, a relative, or the basic kit’s)', r.pieces + ' pieces, up to ' + r.layers + ' loudness layers' + (r.silent.length ? '; silent: ' + r.silent.join(' ') : ''));
    ok(r.late.length === 0, id + ': hits start within 12 ms of their time', r.late.join(', '));
    ok(r.loud > r.soft * 1.5, id + ': a hard hit is louder than a soft one', r.soft.toFixed(3) + ' < ' + r.loud.toFixed(3));
  }
  // --- a closed hat cuts the open one ---
  r = await E(async () => { const T = STUDIO._t, sr = T.ENG.ctx.sampleRate; await T.loadInst('basic:kit'); const a = await renderNotes('basic:kit', [{ p:46, v:110, t:0.05, d:0 }], { drums:true, tail:0.8 }), c = await renderNotes('basic:kit', [{ p:46, v:110, t:0.05, d:0 }, { p:42, v:30, t:0.2, d:0 }], { drums:true, tail:0.8 });
    const rms = (x, t0) => { let s = 0, i0 = Math.round(t0 * sr); for(let i = i0; i < i0 + 2000; i++) s += x[i] * x[i]; return Math.sqrt(s / 2000); }; return [rms(a.x, 0.4), rms(c.x, 0.4)]; });
  ok(r[1] < r[0] * 0.5, 'a closed hat stops the open hat that was ringing', r.map(v => v.toFixed(4)).join(' -> '));
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
