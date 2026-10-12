// export: the WAV of the song, stems, MIDI, the song file; what comes out is valid and is the song
const L = require('./lib'), { ok } = L;
const fs = require('fs'), zlib = require('zlib');
function wavInfo(buf){ const fmt = buf.indexOf('fmt '), data = buf.indexOf('data'); return { riff:buf.slice(0, 4).toString(), wave:buf.slice(8, 12).toString(), size:buf.readUInt32LE(4), tag:buf.readUInt16LE(fmt + 8), ch:buf.readUInt16LE(fmt + 10), sr:buf.readUInt32LE(fmt + 12), bits:buf.readUInt16LE(fmt + 22), dataLen:buf.readUInt32LE(data + 4), dataAt:data + 8, len:buf.length }; }
function unzip(buf){ const out = []; let p = 0; while(buf.readUInt32LE(p) === 0x04034b50){ const method = buf.readUInt16LE(p + 8), csize = buf.readUInt32LE(p + 18), nl = buf.readUInt16LE(p + 26), el = buf.readUInt16LE(p + 28), name = buf.slice(p + 30, p + 30 + nl).toString(), d = buf.slice(p + 30 + nl + el, p + 30 + nl + el + csize); out.push({ name, data:method === 8 ? zlib.inflateRawSync(d) : d }); p += 30 + nl + el + csize; } return out; }
(async () => {
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  // a song of four bars at 120: bass, piano chords, drums, and a recorded "voice" (a tone), with a section and lyrics
  await E(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); T.S.name = 'Export test: ä/é?'; T.S.tempo = 120; T.S.key = { root:9, scale:'minor' };
    const bs = T.addTrack('inst', 'upright-bass', 'Bass'), pn = T.addTrack('inst', 'grand-piano', 'Piano'), dr = T.addTrack('drums', 'studio-kit', 'Drums'), vx = T.addTrack('audio', '', 'Voice'), bt = 1920;
    [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']].forEach((c, i) => T.chordSet(i * bt, c[0], c[1]));
    T.chordPart(bs.id, 0, 4 * bt, 'rootfifth'); T.chordPart(pn.id, 0, 4 * bt, 'ballad'); const rg = T.addRegion(dr, 0, 4 * bt, []); T.drumPreset(rg, 'pop', 1, true);
    T.addSection('Verse', 0, 2); T.addSection('Chorus', 2, 2); T.S.lyrics[T.S.sections[0].id] = 'first line\nsecond line';
    pn.vol = 0.7; pn.pan = -0.3; bs.oct = 0; T.S.swing = 0;
    const sr = T.ENG.ctx.sampleRate, n = sr * 4, x = new Float32Array(n); for(let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(2 * Math.PI * 440 * i / sr) * Math.min(1, i / 2000) * Math.min(1, (n - i) / 2000);
    const pcm = new Int16Array(n); for(let i = 0; i < n; i++) pcm[i] = Math.round(x[i] * 32767);
    // a take, saved as the app saves one
    await new Promise((res, rej) => { const rq = indexedDB.open('firstloop-studio'); rq.onsuccess = () => { const tx = rq.result.transaction('audio', 'readwrite'); tx.objectStore('audio').put({ id:'take1', song:T.S.id, sr, pcm, an:null, name:'Take', made:Date.now(), lat:0, kind:'audio' }); tx.oncomplete = res; tx.onerror = rej; }; });
    vx.regions.push({ id:'rv', s:bt, l:2 * bt, takes:['take1'], act:0, off:0.5, fi:0.05, fo:0.2, gain:-3 });
    T.commit('song'); await T.saveNow(); await T.loadInst('upright-bass'); await T.loadInst('grand-piano'); await T.loadInst('studio-kit'); });
  const dl = async (fn) => { const [d] = await Promise.all([p.waitForEvent('download', { timeout:120000 }), E(fn)]); return { name:d.suggestedFilename(), buf:fs.readFileSync(await d.path()) }; };
  // --- WAV ---
  let f = await dl(() => { STUDIO._t.exportMix(16, false, () => {}); });
  let w = wavInfo(f.buf), secs = w.dataLen / (w.sr * w.ch * 2);
  ok(f.name === 'Export-test.wav' || /^Export-test/.test(f.name), 'the file is named after the song, without the characters a file name cannot have', f.name);
  ok(w.riff === 'RIFF' && w.wave === 'WAVE' && w.tag === 1 && w.ch === 2 && w.bits === 16 && w.size === w.len - 8 && w.dataLen === w.len - w.dataAt && [44100, 48000].indexOf(w.sr) >= 0, 'WAV: a correct header (PCM, stereo, 16 bit), sizes that add up', JSON.stringify(w));
  ok(Math.abs(secs - (8 + 1.8)) < 0.05, 'WAV: four bars at 120 are 8 seconds, plus 1.8 for the last notes to ring out', secs.toFixed(3) + ' s');
  const pcmOf = (buf, w2) => { const n = w2.dataLen / (w2.ch * w2.bits / 8), a = new Float32Array(n); for(let i = 0; i < n; i++) a[i] = w2.bits === 16 ? buf.readInt16LE(w2.dataAt + i * w2.ch * 2) / 32768 : buf.readIntLE(w2.dataAt + i * w2.ch * 3, 3) / 8388608; return a; };
  let x = pcmOf(f.buf, w), pk = 0, e0 = 0, eTail = 0, first = -1; for(let i = 0; i < x.length; i++){ const v = Math.abs(x[i]); if(v > pk) pk = v; if(first < 0 && v > 0.01) first = i; } for(let i = 0; i < w.sr * 0.3; i++) e0 += x[i] * x[i]; for(let i = x.length - Math.round(w.sr * 0.05); i < x.length; i++) eTail += x[i] * x[i];
  ok(pk > 0.1 && pk <= 0.9, 'WAV: there is music in it, and the limiter keeps it under the ceiling', 'peak ' + pk.toFixed(3));
  ok(first >= 0 && first / w.sr < 0.02, 'WAV: the song starts at the start of the file (the limiter’s look-ahead is taken off)', (first / w.sr * 1000).toFixed(1) + ' ms');
  ok(Math.sqrt(eTail / (w.sr * 0.05)) < 0.01, 'WAV: it has died away by the end', Math.sqrt(eTail / (w.sr * 0.05)).toFixed(5));
  f = await dl(() => { STUDIO._t.exportMix(24, false, () => {}); });
  let w24 = wavInfo(f.buf);
  ok(w24.bits === 24 && w24.dataLen === w.dataLen / 2 * 3, 'WAV, 24-bit: same length, three bytes a sample', w24.bits + ' bit, ' + w24.dataLen + ' bytes');
  // the same render twice is the same file
  const a1 = await E(async () => { const T = STUDIO._t; const r1 = await T.renderSong({}), r2 = await T.renderSong({}); const c1 = r1.getChannelData(0), c2 = r2.getChannelData(0); let d = 0; for(let i = 0; i < c1.length; i++) d = Math.max(d, Math.abs(c1[i] - c2[i])); return { d, n:c1.length === c2.length }; });
  ok(a1.n && a1.d < 1e-6, 'rendering twice gives the same sound, sample for sample (nothing random)', 'largest difference ' + a1.d.toExponential(1));
  // loop only
  f = await dl(() => { const T = STUDIO._t; T.S.loop = { on:true, a:1920, b:3840 }; T.exportMix(16, true, () => {}); });
  let wl = wavInfo(f.buf); ok(Math.abs(wl.dataLen / (wl.sr * 4) - (2 + 1.8)) < 0.05, 'WAV of the looped stretch only: one bar and its tail', (wl.dataLen / (wl.sr * 4)).toFixed(2) + ' s');
  await E(() => { STUDIO._t.S.loop.on = false; });
  // --- stems ---
  f = await dl(() => { STUDIO._t.exportStems(false, () => {}); });
  const files = unzip(f.buf), infos = files.map(z => wavInfo(z.data));
  ok(files.length === 4 && /^01-Bass\.wav$/.test(files[0].name) && /Voice/.test(files[3].name), 'stems: one WAV for each of the four tracks, numbered in order, in a zip', files.map(z => z.name).join(', '));
  ok(infos.every(i => i.riff === 'RIFF' && i.bits === 24 && i.dataLen === infos[0].dataLen), 'stems: all the same length, 24-bit');
  // the stems add up to the song (before the limiter and the master volume do anything)
  const sum = new Float64Array(infos[0].dataLen / 6); files.forEach((z, k) => { const a = pcmOf(z.data, infos[k]); for(let i = 0; i < sum.length; i++) sum[i] += a[i]; });
  const mixNoLim = await E(async () => { const buf = await STUDIO._t.renderSong({ limiter:false }); return Array.from(buf.getChannelData(0).subarray(0, 96000)); });
  let dmax = 0, ref = 0; for(let i = 0; i < 96000 && i < sum.length; i++){ dmax = Math.max(dmax, Math.abs(sum[i] - mixNoLim[i])); ref = Math.max(ref, Math.abs(mixNoLim[i])); }
  ok(dmax < ref * 0.02 + 1e-3, 'stems: added together they are the mix (first two seconds, left channel)', 'largest difference ' + dmax.toFixed(5) + ' against a peak of ' + ref.toFixed(3));
  const voiceStem = pcmOf(files[3].data, infos[3]); let vFirst = -1; for(let i = 0; i < voiceStem.length; i++) if(Math.abs(voiceStem[i]) > 0.005){ vFirst = i; break; }
  ok(Math.abs(vFirst / infos[3].sr - 2.0) < 0.03, 'stems: the voice comes in at bar 2, where its region is', (vFirst / infos[3].sr).toFixed(3) + ' s');
  // --- MIDI ---
  f = await dl(() => { STUDIO._t.exportMidi(); });
  ok(f.buf.slice(0, 4).toString() === 'MThd' && f.buf.readUInt16BE(8) === 1 && f.buf.readUInt16BE(10) === 4 && f.buf.readUInt16BE(12) === 480, 'MIDI: a type 1 file, a tempo track and three note tracks, 480 ticks to the quarter note', f.name + ', ' + f.buf.length + ' bytes');
  let r = await E(bytes => { const T = STUDIO._t, s = T.midiIn(new Uint8Array(bytes), 'back'); if(!s) return null;
    const flat = (song, t) => { const keep = T.S; T.S = song; const out = []; t.regions.forEach(rg => T.eachNote(rg, rg.s, rg.s + rg.l, (st, l, pch, v) => out.push([st, l, pch + (t.kind === 'inst' ? 12 * (t.oct || 0) : 0), v].join(':')))); T.S = keep; return out.sort().join(' '); };
    const mine = T.S.tracks.filter(t => t.kind !== 'audio').map(t => flat(T.S, t)), theirs = s.tracks.map(t => flat(s, t));
    return { same:mine.map((m, i) => m === theirs[i]), counts:mine.map(m => m.split(' ').length), tempo:s.tempo, sig:s.sig.join('/'), key:s.key, names:s.tracks.map(t => t.name + ':' + t.kind).join(','), secs:s.sections.map(q => q.name + '@' + q.bar + '+' + q.len).join(','), name:s.name }; }, Array.from(f.buf));
  ok(r && r.same.every(Boolean), 'MIDI read back: every note of every track at the same tick, with the same length, pitch and velocity', r && r.counts.join(' + ') + ' notes');
  ok(r && r.tempo === 120 && r.sig === '4/4' && r.key.root === 9 && r.key.scale === 'minor' && r.names === 'Bass:inst,Piano:inst,Drums:drums' && r.secs === 'Verse@0+2,Chorus@2+2', 'MIDI read back: tempo, time signature, key, track names, and the sections as markers', r && JSON.stringify([r.tempo, r.sig, r.key, r.names, r.secs]));
  // a MIDI file from elsewhere (running status, note-on with velocity 0, another resolution)
  r = await E(() => { const T = STUDIO._t; const bytes = [0x4D,0x54,0x68,0x64,0,0,0,6,0,0,0,1,0,96, 0x4D,0x54,0x72,0x6B,0,0,0,0, 0,0xFF,0x51,3,0x07,0xA1,0x20, 0,0x90,60,100, 96,60,0, 0,64,90, 48,64,0, 0,0x99,36,110, 24,36,0, 0,0xFF,0x2F,0]; const len = bytes.length - 22; bytes[18] = (len >> 24) & 255; bytes[19] = (len >> 16) & 255; bytes[20] = (len >> 8) & 255; bytes[21] = len & 255;
    const s = T.midiIn(new Uint8Array(bytes), 'x'); const bad = [T.midiIn(new Uint8Array([1, 2, 3]), 'x'), T.midiIn(new Uint8Array(0), 'x'), T.midiIn(new Uint8Array(bytes.slice(0, 30)), 'x')];
    return s && { tempo:s.tempo, tracks:s.tracks.map(t => t.kind + ':' + Object.keys(s.pats).length).join(), notes:s.tracks.map(t => s.pats[t.regions[0].pat].notes.map(n => n.s + ':' + n.l + ':' + n.p + ':' + n.v).join(' ')).join(' | '), bad:bad.map(x => x === null ? 'null' : 'song') }; });
  ok(r && r.tempo === 120 && r.notes === '0:480:60:100 480:240:64:90 | 720:120:36:110', 'a format 0 MIDI file with running status and 96 ticks to the beat is read: two notes and a kick, on their own tracks', r && r.notes + ' ' + r.tracks);
  ok(r && r.bad[0] === 'null' && r.bad[1] === 'null', 'what is not a MIDI file is refused', r && r.bad.join(','));
  // --- the song file ---
  f = await dl(() => { STUDIO._t.exportProject(true); });
  const proj = JSON.parse(f.buf.toString());
  ok(/\.flsong$/.test(f.name) && proj.app === 'firstloop-studio' && proj.song.tracks.length === 4 && proj.audio.length === 1 && proj.audio[0].pcm.length > 100000, 'song file: the song and its recording', f.name + ', ' + (f.buf.length / 1e6).toFixed(2) + ' MB');
  r = await E(async txt => { const T = STUDIO._t, before = JSON.stringify(T.S.tracks.map(t => [t.name, t.inst, t.vol, t.pan, t.regions.length])) + JSON.stringify(T.S.chords) + JSON.stringify(T.S.sections.map(q => [q.name, q.bar, q.len])) + T.S.tempo;
    const id = await T.projectIn(JSON.parse(txt)); await T.openSong(id); const S = T.S;
    const after = JSON.stringify(S.tracks.map(t => [t.name, t.inst, t.vol, t.pan, t.regions.length])) + JSON.stringify(S.chords) + JSON.stringify(S.sections.map(q => [q.name, q.bar, q.len])) + S.tempo;
    const take = S.tracks[3].regions[0].takes[0], rec = await T.dbGet('audio', take), list = await T.listSongs();
    const buf = await T.renderSong({}); let pk = 0; const c = buf.getChannelData(0); for(let i = 0; i < c.length; i++) pk = Math.max(pk, Math.abs(c[i]));
    return { same:before === after, name:S.name, newTake:take !== 'take1', pcm:rec && rec.pcm.length, song:rec && rec.song === S.id, n:list.length, ly:Object.values(S.lyrics)[0], pk, gen:!!S.tracks[1].regions[0].gen }; }, f.buf.toString());
  ok(r.same && /Export test.* 2$/.test(r.name) && r.n === 2, 'song file opened again: a second song with the same tracks, chords, sections and tempo', r.name);
  ok(r.newTake && r.pcm > 150000 && r.song && r.ly === 'first line\nsecond line' && r.gen && r.pk > 0.1, 'with its recording (under a new id, so the two songs do not share it), its lyrics, the parts still following the chords; and it plays', JSON.stringify(r));
  r = await E(async () => { const T = STUDIO._t; const bad = []; for(const x of [null, {}, { app:'firstloop-studio' }, { app:'other', song:{} }, { app:'firstloop-studio', song:{ tracks:[{ kind:'audio', regions:[{ s:0, l:100, takes:['nope'] }] }] }, audio:[{ id:'zz', sr:5, pcm:'!!!' }] }]){ try { bad.push(await T.projectIn(x)); } catch(e){ bad.push('THROW'); } } return bad.map(v => v === null ? 'null' : typeof v === 'string' && v !== 'THROW' ? 'song' : v); });
  ok(r.slice(0, 4).every(v => v === 'null') && r[4] !== 'THROW', 'a file that is not a song file is refused; one with a broken recording opens without it', r.join(','));
  // --- the export sheet says what it did, and refuses an empty song in words ---
  await E(async () => { await STUDIO._t.createSong('Empty'); });
  await p.click('#stexport'); await p.waitForSelector('#stexportsheet'); await p.click('#stexwav'); await p.waitForTimeout(600);
  const msg = await p.textContent('#stexstatus');
  ok(/nothing to export yet/.test(msg), 'an empty song: Export says there is nothing to export yet', msg);
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
