// latency: what is hummed or sung lands where it was sung, once the round trip is known (measured by the check, from the count-in, or set by hand)
const L = require('./lib'), { ok } = L;
const SG = L.SG;
(async () => {
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  await E(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); await T.latLoad(); const t = T.addTrack('inst', 'basic:piano', 'Piano'); const v = T.addTrack('audio', '', 'Voice'); T.S.tempo = 100; T.commit('x'); window.__t = t.id; window.__v = v.id; T.select(t.id, null); });
  const steps = [[60, 1], [62, 1], [64, 0.5], [65, 0.5], [67, 1], [65, 1], [64, 1], [62, 0.5], [60, 0.5], [62, 1], [64, 1], [60, 2], [67, 2], [60, 2]];
  const sung = L.tune(steps, 100, { voice:'ah', style:'da' }), truth = sung.truth.map(n => n.t * 1000);
  const id = await L.prep(p, sung.x, sung.sr);
  async function hum(lat, opts){
    // one hummed take of four bars through the screen; returns the note starts in ms from the start of the part, with timing "as hummed"
    await E(() => { const T = STUDIO._t; T.S.tracks[0].regions = []; T.commit('clear', true); T.setPos(0); T.select(window.__t, null); });
    await p.locator('.st-th[data-kind="inst"] .st-threc').first().click();
    await p.waitForSelector('#sthum'); await p.waitForFunction(() => /Start/.test(document.getElementById('sthumgo').textContent) && !/Turn on/.test(document.getElementById('sthumgo').textContent));
    if(opts && opts.before) await opts.before();
    await p.click('#sthumgo');
    await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
    const st = await E(() => STUDIO._t.HUM.startAt);
    await L.fire(p, id, st + lat);
    await p.waitForFunction(() => !STUDIO._t.HUM && STUDIO._t.S.tracks[0].regions.length, null, { timeout:40000 });
    await p.waitForTimeout(300);
    return E(async () => { const T = STUDIO._t, r = T.S.tracks[0].regions[0]; T.auditionStop && 0; r.hum.timing = 'raw'; await T.humRedo(r.id); T.commit('raw'); const tidy = T.patOf(r).notes.map(n => T.tickSec(n.s) * 1000);
      const ti = await T.takeInfo(r.hum.take); return { raw:tidy, lat:ti.lat, n:tidy.length }; });
  }
  const errOf = (got) => { const d = got.map((g, i) => g - truth[i]); const a = d.map(Math.abs).sort((x, y) => x - y); return { med:a[a.length >> 1], max:a[a.length - 1], bias:d.reduce((x, y) => x + y, 0) / d.length }; };
  // 1. measured latency of 73 ms
  await E(() => { STUDIO._t.MIC.label = 'test input'; return STUDIO._t.latStore(0.073); });
  let r = await hum(0.073), e = errOf(r.raw);
  ok(r.n === truth.length && e.med <= 10 && e.max <= 25, 'round trip 73 ms, measured: hummed notes land where they were sung (median within 10 ms)', 'median ' + e.med.toFixed(1) + ' ms, worst ' + e.max.toFixed(1) + ', average ' + e.bias.toFixed(1) + '; the detector itself hears a “da” about 9 ms early');
  // 2. the same singer, but the app believes 0 ms: everything is late by the round trip
  await E(async () => { const T = STUDIO._t; await T.latStore(0.001); });
  r = await hum(0.073); e = errOf(r.raw);
  ok(e.bias > 55 && e.bias < 85, 'without the right number the notes are late by the round trip (this is what the check removes)', 'average ' + e.bias.toFixed(1) + ' ms late');
  // 3. by hand: 72 ms earlier
  await E(async () => { const T = STUDIO._t; await T.latStore(0.001); }); 
  r = await hum(0.073, { before:async () => { for(let i = 0; i < 14; i++) await p.locator('#sthum .st-microw .st-b.quiet').first().click(); await p.waitForTimeout(200); } }); e = errOf(r.raw);
  ok(Math.abs(e.bias + 7) < 8, 'the Earlier button, pressed 14 times (70 ms), brings them back', 'average ' + e.bias.toFixed(1) + ' ms');
  await E(async () => { const T = STUDIO._t; const m = await T.latLoad(); Object.keys(m).forEach(k => { delete m[k]; }); T.LAT.map = m; });
  // 4. speakers: the click reaches the microphone 61 ms after it was sent, and so does the singer who sings with what she hears
  await E(() => { const T = STUDIO._t, ctx = T.ENG.ctx; window.__loop = ctx.createDelay(1); window.__loop.delayTime.value = 0.061; const g = ctx.createGain(); g.gain.value = 0.5; T.ENG.G.click.connect(window.__loop); window.__loop.connect(g); window.__lg = g; });
  // (the microphone node is made when the sheet opens; the loop is plugged into it then)
  r = await hum(0.061, { before:async () => { await E(() => { window.__lg.connect(window.__mic); }); } }); e = errOf(r.raw);
  ok(Math.abs(r.lat - 0.061) < 0.003, 'on speakers the count-in itself is heard by the microphone and gives the round trip', (r.lat * 1000).toFixed(1) + ' ms for a true 61.0');
  ok(e.med <= 10, 'so a first take on speakers, never measured, still lands (median within 10 ms)', 'median ' + e.med.toFixed(1) + ' ms, worst ' + e.max.toFixed(1));
  r = await E(() => { const l = STUDIO._t.latNow(); return { sec:l.sec, measured:l.measured }; });
  ok(r.measured && Math.abs(r.sec - 0.061) < 0.003, 'and that number is kept for this microphone', JSON.stringify(r));
  // 5. "Check timing": eight clicks out, heard back
  await E(async () => { const T = STUDIO._t; const m = await T.latLoad(); Object.keys(m).forEach(k => { delete m[k]; }); window.__loop.delayTime.value = 0.094; });
  r = await E(async () => { const T = STUDIO._t; const pr = T.calibrate(); await new Promise(r2 => setTimeout(r2, 150)); if(window.__mic) window.__lg.connect(window.__mic); return pr; });
  ok(r.ok && Math.abs(r.sec - 0.094) < 0.002 && r.heard >= 6, 'Check timing measures a 94 ms round trip to within 2 ms', JSON.stringify(r));
  r = await E(async () => { const T = STUDIO._t; try { window.__lg.disconnect(); } catch(e){} const pr = T.calibrate(); return pr; });
  ok(r.ok === false, 'with headphones on (no click reaches the microphone) the check says it heard nothing, and stores nothing', JSON.stringify(r));
  // 6. a voice take over the playing song: clicks "sung" on every beat come back on the beat
  await E(async () => { const T = STUDIO._t; await T.latStore(0.094); const d = T.addTrack('drums', 'basic:kit', 'D'), rg = T.addRegion(d, 0, 7680, []); T.drumPreset(rg, 'pop', 0, false); T.commit('drums'); T.setPos(0); T.select(window.__v, null); });
  const sr = 48000, beat = 0.6, n = Math.round(sr * beat * 12), x = new Float32Array(n); for(let k = 0; k < 12; k++){ const a0 = Math.round(k * beat * sr); for(let i = 0; i < 480; i++) x[a0 + i] = Math.sin(2 * Math.PI * 2000 * i / sr) * Math.exp(-i / 60) * 0.8; }
  const idc = await L.prep(p, x, sr);
  async function take(lat){
    await p.locator('.st-th[data-kind="audio"] .st-threc').click(); await p.waitForSelector('#strecsheet'); await p.waitForFunction(() => /Record from/.test(document.getElementById('strecgo').textContent));
    await p.click('#strecgo'); await p.waitForFunction(() => STUDIO._t.AREC && STUDIO._t.AREC.startAt);
    const st = await E(() => STUDIO._t.AREC.startAt); await L.fire(p, idc, st + lat);
    await p.waitForTimeout(7600); await p.click('#strecstop');
    await p.waitForFunction(() => !STUDIO._t.AREC && !document.querySelector('.st-recbar:not([hidden])'), null, { timeout:15000 }); await p.waitForTimeout(400);
  }
  await take(0.094);
  r = await E(async () => { const T = STUDIO._t, t = T.S.tracks.filter(q => q.kind === 'audio')[0], rg = t.regions[0]; T.S.tracks.forEach(q => { q.mute = q.kind !== 'audio'; });
    const buf = await T.renderSong({ from:0, to:7680, tail:0.2, limiter:false }), ch = buf.getChannelData(0), sr = buf.sampleRate, found = [];
    for(let k = 0; k < 12; k++){ const c = Math.round(k * 0.6 * sr); let pk = 0, at = -1; for(let i = Math.max(0, c - Math.round(0.1 * sr)); i < c + Math.round(0.1 * sr) && i < ch.length; i++){ if(Math.abs(ch[i]) > pk){ pk = Math.abs(ch[i]); at = i; } } if(pk > 0.02) found.push((at - c) / sr * 1000); }
    T.S.tracks.forEach(q => { q.mute = false; }); return { found, off:rg.off, takes:rg.takes.length, l:rg.l, s:rg.s }; });
  const worst = Math.max(...r.found.map(Math.abs));
  ok(r.found.length >= 8 && worst <= 10, 'a take recorded over the playing song, round trip 94 ms: every beat she sang plays back within 10 ms of the beat', r.found.length + ' beats, worst ' + worst.toFixed(2) + ' ms, offsets ' + r.found.slice(0, 5).map(v => v.toFixed(1)).join(' '));
  // 7. a second take of the same place is kept beside the first
  await E(() => { STUDIO._t.setPos(0); });
  await take(0.094);
  r = await E(() => { const T = STUDIO._t, rg = T.S.tracks.filter(q => q.kind === 'audio')[0].regions; return { regions:rg.length, takes:rg[0].takes.length, act:rg[0].act }; });
  ok(r.regions === 1 && r.takes === 2 && r.act === 1, 'recording the same place again keeps both takes; the new one plays', JSON.stringify(r));
  ok(await p.locator('.st-edtools select').first().isVisible(), 'the Recording editor offers the choice of take');
  // 8. the microphone is asked for with processing off
  await E(() => { STUDIO._t.TEST.micNode = null; window.__gum = null; const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices); navigator.mediaDevices.getUserMedia = c => { window.__gum = c; return orig(c); }; });
  await E(() => { STUDIO._t.setPos(0); STUDIO._t.select(window.__t, null); });
  await p.locator('.st-th[data-kind="inst"] .st-threc').first().click(); await p.waitForSelector('#sthum'); await p.waitForTimeout(1200);
  r = await E(() => { const tr = STUDIO._t.MIC.stream && STUDIO._t.MIC.stream.getAudioTracks()[0]; return { asked:window.__gum, got:tr ? tr.getSettings() : null, label:STUDIO._t.MIC.label }; });
  ok(r.asked && r.asked.audio.echoCancellation === false && r.asked.audio.noiseSuppression === false && r.asked.audio.autoGainControl === false, 'the browser is asked for the microphone with echo cancelling, noise suppression and automatic gain all off', JSON.stringify(r.asked));
  ok(r.got && r.got.echoCancellation === false && r.got.noiseSuppression === false && r.got.autoGainControl === false, 'and (in this Chromium, with its stand-in microphone) that is what it gives', JSON.stringify(r.got && { ec:r.got.echoCancellation, ns:r.got.noiseSuppression, agc:r.got.autoGainControl, ch:r.got.channelCount }));
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  r = await E(() => ({ stream:!!STUDIO._t.MIC.stream }));
  ok(!r.stream, 'closing the sheet lets the microphone go');
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
