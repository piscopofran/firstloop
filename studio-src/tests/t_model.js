// the song model: tracks, regions, patterns, sections, undo and redo, saving, versions, songs, backup, song files
const L = require('./lib'), { ok } = L;
(async () => {
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  await E(async () => { const T = STUDIO._t; await T.loadManifest(); });
  // --- a song from nothing ---
  let r = await E(() => { const T = STUDIO._t, S = T.S; return { v:S.v, tracks:S.tracks.length, tempo:S.tempo, sig:S.sig.join('/'), key:S.key.scale, bars:S.bars, u:T.hist().u.length }; });
  ok(r.tracks === 0 && r.tempo === 100 && r.sig === '4/4' && r.key === 'none' && r.bars >= 16 && r.u === 0, 'a new song: no tracks, 100 BPM, 4/4, no key, nothing to undo', JSON.stringify(r));
  r = await E(() => { const T = STUDIO._t; const t = T.addTrack('inst', 'upright-bass', 'Bass'); const rg = T.addRegion(t, 0, 1920 * 2, [{ s:0, l:480, p:40, v:100 }, { s:480, l:480, p:43, v:90 }, { s:1920, l:960, p:45, v:80 }]); T.commit('add'); window.__t = t.id; window.__r = rg.id;
    return { tr:T.S.tracks.length, n:T.patOf(rg).notes.length, u:T.hist().u.length, fam:t.fam, started:T.S.started }; });
  ok(r.tr === 1 && r.n === 3 && r.u === 1 && r.fam === 'bass' && r.started, 'a track with a region of notes; one step of undo; the song counts as started', JSON.stringify(r));
  // --- notes at fine resolution, pitch as MIDI, velocity ---
  r = await E(() => { const T = STUDIO._t, f = T.findRegion(window.__r), p = T.patOf(f.r); p.notes.push({ s:487, l:113, p:127, v:1 }, { s:3, l:7, p:0, v:127 }); T.commit('odd');
    const fx = T.fixSong(JSON.parse(JSON.stringify(T.S))); return { ppq:T.PPQ, kept:fx.pats[f.r.pat].notes.map(n => [n.s, n.l, n.p, n.v].join(':')).join(' ') }; });
  ok(r.ppq === 480 && /3:7:0:127/.test(r.kept) && /487:113:127:1/.test(r.kept), '480 ticks to the beat; starts, lengths, pitches 0 to 127 and velocities survive a save', r.kept);
  // --- undo / redo of everything ---
  r = await E(() => { const T = STUDIO._t, out = []; const j = () => JSON.stringify(T.S.tracks) + JSON.stringify(T.S.pats) + JSON.stringify(T.S.sections) + JSON.stringify(T.S.chords) + T.S.tempo + T.S.sig + JSON.stringify(T.S.key) + JSON.stringify(T.S.lyrics);
    const steps = [
      ['tempo', () => { T.setTempo(124); T.commit('tempo'); }], ['key', () => { T.S.key = { root:9, scale:'minor' }; T.commit('key'); }],
      ['section', () => { T.addSection('Verse', 0, 4); T.commit('sec'); }], ['chord', () => { T.chordSet(0, 9, 'min'); T.chordSet(1920, 5, 'maj'); T.commit('ch'); }],
      ['track', () => { T.addTrack('drums', 'studio-kit', 'Drums'); T.commit('trk'); }], ['region', () => { const t = T.S.tracks[1], rg = T.addRegion(t, 0, 7680, []); T.drumPreset(rg, 'pop', 0, true); T.commit('drums'); }],
      ['split', () => { const f = T.findRegion(window.__r); T.splitRegion(f.t, f.r, 1920); T.commit('split'); }], ['transpose', () => { T.transposeSong(-3); T.commit('tr'); }],
      ['lyrics', () => { T.S.lyrics[T.S.sections[0].id] = 'la la'; T.commit('ly'); }], ['mix', () => { T.S.tracks[0].vol = 0.5; T.S.tracks[0].pan = -0.4; T.S.tracks[0].mute = true; T.commit('mix'); }],
      ['dupsec', () => { T.duplicateSection(T.S.sections[0].id); T.commit('dup'); }], ['deltrack', () => { T.S.tracks.splice(0, 1); T.commit('del'); }]];
    const states = [j()];
    steps.forEach(s => { s[1](); states.push(j()); });
    let allDiffer = states.every((s, i) => i === 0 || s !== states[i - 1]);
    let back = true; for(let i = steps.length - 1; i >= 0; i--){ T.undo(); if(j() !== states[i]) { back = false; out.push('undo ' + steps[i][0]); } }
    let fwd = true; for(let i = 0; i < steps.length; i++){ T.redo(); if(j() !== states[i + 1]) { fwd = false; out.push('redo ' + steps[i][0]); } }
    return { allDiffer, back, fwd, out, u:T.hist().u.length, rr:T.hist().r.length }; });
  ok(r.allDiffer, 'twelve kinds of edit each change the song (tempo, key, section, chords, track, drum region, split, transpose, lyrics, mix, duplicate section, delete track)');
  ok(r.back, 'undo takes every one of them back, in order', r.out.join(','));
  ok(r.fwd && r.rr === 0, 'redo brings every one of them forward again', r.out.join(','));
  r = await E(() => { const T = STUDIO._t; T.undo(); T.undo(); const n = T.hist().r.length; T.setTempo(90); T.commit('tempo'); return { before:n, after:T.hist().r.length }; });
  ok(r.before === 2 && r.after === 0, 'a new edit after undo empties redo', JSON.stringify(r));
  // --- regions: overlap rules, linked copies, looping patterns ---
  r = await E(() => { const T = STUDIO._t; T.S.tracks.length = 0; T.S.sections = []; T.S.chords = []; const t = T.addTrack('inst', 'grand-piano', 'P');
    const a = T.addRegion(t, 0, 3840, [{ s:0, l:480, p:60, v:90 }, { s:1920, l:480, p:64, v:90 }, { s:3360, l:480, p:67, v:90 }]);
    const c = T.cloneRegion(a, true); c.s = 3840; t.regions.push(c);
    const d = T.cloneRegion(a, false); d.s = 7680; t.regions.push(d);
    T.patOf(a).notes[0].p = 61;
    const linked = T.patOf(c).notes[0].p, own = T.patOf(d).notes[0].p;
    // a region twice as long as its part repeats it
    a.l = 7680 - 0; c.s = 7680; d.s = 11520; const fl = T.flatNotes(a).map(n => n.s);
    // putting a region over others cuts them
    const x = T.cloneRegion(d, false); x.s = 1920; x.l = 1920; t.regions.push(x); T.clearUnder(t, x);
    const spans = t.regions.map(q => q.s + '-' + (q.s + q.l)).join(' ');
    let overlap = false; t.regions.forEach((q, i) => t.regions.forEach((w, k) => { if(i < k && q.s < w.s + w.l && w.s < q.s + q.l) overlap = true; }));
    T.commit('regions'); return { linked, own, fl:fl.join(' '), spans, overlap }; });
  ok(r.linked === 61 && r.own === 60, 'a linked copy follows its original, an independent copy does not', JSON.stringify([r.linked, r.own]));
  ok(r.fl === '0 1920 3360 3840 5760 7200', 'a region longer than its part plays the part again', r.fl);
  ok(!r.overlap && /^0-1920 1920-3840 3840-7680 /.test(r.spans), 'regions of one track never overlap: what a new one covers is cut away', r.spans);
  // --- sections ---
  r = await E(() => { const T = STUDIO._t; T.S.tracks.length = 0; T.S.sections = []; T.S.chords = []; T.S.pats = {}; const t = T.addTrack('inst', 'grand-piano', 'P'), bt = 1920;
    T.addRegion(t, 0, 4 * bt, [{ s:0, l:480, p:60, v:90 }]); T.addRegion(t, 4 * bt, 4 * bt, [{ s:0, l:480, p:72, v:90 }]);
    const v = T.addSection('Verse', 0, 4), c = T.addSection('Chorus', 4, 4); T.chordSet(0, 0, 'maj'); T.chordSet(4 * bt, 7, 'maj');
    const names0 = T.S.sections.map(q => q.name + '@' + q.bar).join(' ');
    T.moveSection(c.id, -1);
    const names1 = T.S.sections.map(q => q.name + '@' + q.bar).join(' '), firstPitch = T.patOf(t.regions[0]).notes[0].p, ch1 = T.S.chords.map(x => x.t / bt + ':' + x.root).join(' ');
    const d = T.duplicateSection(v.id);
    const names2 = T.S.sections.map(q => q.name + '@' + q.bar).join(' '), regs = t.regions.map(q => q.s / bt + '+' + q.l / bt + ':' + T.patOf(q).notes[0].p).join(' ');
    T.deleteSection(c.id, true);
    const names3 = T.S.sections.map(q => q.name + '@' + q.bar).join(' '), regs3 = t.regions.map(q => q.s / bt + ':' + T.patOf(q).notes[0].p).join(' ');
    const none = T.addSection('X', 1, 2);
    for(let i = 0; i < 60; i++) T.addSection(undefined, undefined, 4);
    T.commit('sections'); return { names0, names1, firstPitch, ch1, names2, regs, names3, regs3, noneAt:none ? none.bar : -1, bars:T.S.bars, secs:T.S.sections.length, dn:d && d.name }; });
  ok(r.names0 === 'Verse@0 Chorus@4', 'sections are added in order', r.names0);
  ok(r.names1 === 'Chorus@0 Verse@4' && r.firstPitch === 72 && r.ch1 === '0:7 4:0', 'moving a section earlier takes its notes and chords with it', r.names1 + ' ' + r.ch1);
  ok(r.names2 === 'Chorus@0 Verse@4 Verse 2@8' && /8\+4:60/.test(r.regs), 'duplicating a section copies its music after it', r.names2 + ' | ' + r.regs);
  ok(r.names3 === 'Verse@0 Verse 2@4' && r.regs3 === '0:60 4:60', 'deleting a section with its music closes the gap', r.names3 + ' | ' + r.regs3);
  ok(r.noneAt >= 8, 'a section asked for inside another is put after the last one instead', String(r.noneAt));
  ok(r.bars >= 200 && r.secs >= 50, 'the song grows past 200 bars as sections are added', r.bars + ' bars, ' + r.secs + ' sections');
  // --- a long song plays its notes from bar 200 ---
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[0], bt = 1920; const rg = T.addRegion(t, 230 * bt, 2 * bt, [{ s:0, l:480, p:60, v:90 }]); T.commit('far'); const fx = T.fixSong(JSON.parse(JSON.stringify(T.S)));
    return { bars:T.S.bars, kept:fx.tracks[0].regions.some(q => q.s === 230 * bt), end:T.songTicks() / bt }; });
  ok(r.bars >= 234 && r.kept && r.end === 232, 'a region at bar 231 is kept and counted', JSON.stringify(r));
  // --- tempo, time signature ---
  r = await E(() => { const T = STUDIO._t; T.S.tracks.length = 0; T.S.sections = []; const t = T.addTrack('audio', '', 'V'); t.regions.push({ id:'ra', s:0, l:1920, takes:['x'], act:0, off:0, fi:0, fo:0, gain:0 }); const was = T.S.tempo; T.setTempo(was * 2 > 220 ? 60 : was * 2); const l = t.regions[0].l; T.S.sig = [6, 8]; return { l, ratio:T.S.tempo / was, bt:T.barTicks() }; });
  ok(Math.abs(r.l - 1920 * r.ratio) < 2 && r.bt === 1440, 'a tempo change keeps a recording’s own length in seconds; a 6/8 bar is 1440 ticks', JSON.stringify(r));
  // --- hostile and broken input to fixSong ---
  r = await E(() => { const T = STUDIO._t, f = T.fixSong; const bad = [null, 1, 'x', [], {}, { tracks:'no' }, { tracks:[{ kind:'evil', regions:[{}] }, { kind:'inst', inst:{ a:1 }, vol:'loud', pan:99, regions:[{ s:-5, l:10, pat:'zz' }, { s:0, l:1e12, pat:'p' }, null] }], pats:{ p:{ len:-3, notes:[{ s:0, l:1, p:999 }, { s:'a' }, null, { s:5, l:5, p:60, v:9999, extra:'<script>' }] } }, tempo:1e9, sig:[7, 3], key:{ root:44, scale:'x' }, name:{}, sections:[{ bar:-9, len:1e9, name:['a'] }], chords:[{ t:-1, root:5 }, { t:0, root:99 }, { t:0, root:3, q:'<img onerror=1>' }], lyrics:{ '<x>':'a', ok:'b'.repeat(9999) }, loop:{ a:5, b:1 } }];
    const res = bad.map(x => { try { return f(x); } catch(e){ return 'THROW ' + e.message; } });
    const last = res[res.length - 1];
    return { nulls:res.slice(0, 4).every(x => x === null), throws:res.some(x => typeof x === 'string'), empty:res[4] && res[4].tracks.length === 0, last:last && { tempo:last.tempo, sig:last.sig.join('/'), key:last.key.scale, tr:last.tracks.length, vol:last.tracks[0] && last.tracks[0].vol, pan:last.tracks[0] && last.tracks[0].pan, regs:last.tracks[0] && last.tracks[0].regions.length, notes:last.pats.p && last.pats.p.notes.map(n => n.p + ':' + n.v).join(' '), sec:last.sections[0], ch:last.chords.map(c => c.root + c.q).join(' '), ly:Object.keys(last.lyrics).join(',') + ':' + (last.lyrics.ok || '').length, name:last.name } }; });
  ok(r.nulls && !r.throws && r.empty, 'what is not a song is refused without an error; an empty object is an empty song');
  ok(r.last && r.last.tempo === 220 && r.last.sig === '4/4' && r.last.key === 'none' && r.last.tr === 1 && r.last.vol === 0.8 && r.last.sec.len <= 400 && r.last.ch === '3maj' && r.last.name === 'Song' && r.last.pan === 1 && r.last.regs === 1 && r.last.notes === '60:127', 'a damaged song file is cut down to what is valid', JSON.stringify(r.last));
  // --- saving by itself, the list of songs, versions ---
  r = await E(async () => { const T = STUDIO._t; await T.createSong('Alpha'); const a = T.S.id; const t = T.addTrack('inst', 'grand-piano', 'P'); T.addRegion(t, 0, 1920, [{ s:0, l:480, p:60, v:90 }]); T.commit('x');
    await new Promise(r => setTimeout(r, 1100)); const rec = await T.dbGet('songs', a);
    await T.saveVersion('first'); T.S.tracks[0].name = 'Changed'; T.commit('rename'); await T.saveVersion('second');
    const vs = await T.listVersions(); await T.restoreVersion(vs[vs.length - 1].k); const nameBack = T.S.tracks[0].name; T.undo(); const nameUndo = T.S.tracks[0].name;
    await T.createSong('Beta'); const bId = T.S.id; const list = await T.listSongs();
    const dupId = await T.duplicateSong(a); await T.openSong(a); await T.deleteSong(a); const list2 = await T.listSongs();
    return { saved:!!(rec && rec.data.tracks.length === 1), vs:vs.map(v => v.label).join(','), nameBack, nameUndo, names:list.map(s => s.name).join(','), after:list2.map(s => s.name).sort().join(','), openNow:T.S.id !== a, dupId:!!dupId, bId }; });
  ok(r.saved, 'the song saves by itself within about a second of a change');
  ok(/second,first/.test(r.vs) && r.nameBack === 'P' && r.nameUndo === 'Changed', 'versions: saved, listed newest first, gone back to, and that step undone', r.vs + ' ' + r.nameBack + ' ' + r.nameUndo);
  ok(/Alpha/.test(r.names) && /Beta/.test(r.names) && /Alpha copy/.test(r.after) && !/Alpha(,|$)/.test(r.after) && r.openNow, 'songs: listed, duplicated, deleted; deleting the open one opens another', r.names + ' -> ' + r.after);
  // --- reload: the last song is open ---
  r = await E(async () => { const T = STUDIO._t; await T.createSong('Gamma'); const t = T.addTrack('drums', 'studio-kit', 'D'); const rg = T.addRegion(t, 0, 3840, []); T.drumPreset(rg, 'soul', 1, true); T.S.lyrics._all = 'words'; T.commit('x'); await T.saveNow(); return T.S.id; });
  await p.reload(); await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S);
  const r2 = await E(() => { const T = STUDIO._t; return { id:T.S.id, name:T.S.name, n:T.S.tracks.length && T.patOf(T.S.tracks[0].regions[0]).notes.length, drum:T.S.tracks[0] && T.S.tracks[0].regions[0].drum, ly:T.S.lyrics._all }; });
  ok(r2.id === r && r2.name === 'Gamma' && r2.n > 20 && r2.drum && r2.drum.feel === 'soul' && r2.drum.fill && r2.ly === 'words', 'after a reload the last song is open with its drums, their feel, and the lyrics', JSON.stringify(r2));
  r = await E(async () => { const T = STUDIO._t; const vs = await T.listVersions(); return vs.map(v => v.label).join('|'); });
  ok(/When opened/.test(r), 'opening a song that has something in it keeps a version of it', r);
  // --- the app's backup carries the Studio's songs ---
  r = await E(async () => { const blob = await (typeof backupBlob === 'function' ? backupBlob() : null); return blob ? blob.size : -1; }).catch(() => -2);
  const bk = await E(async () => { const o = await STUDIO._backupOut(); const n = o.songs.length; const names = o.songs.map(s => s.name).join(','); const txt = JSON.stringify(o);
    // wipe one song, bring the backup in again
    const T = STUDIO._t; const victim = o.songs.filter(s => s.name === 'Beta')[0]; await T.deleteSong(victim.id); const mid = (await T.listSongs()).map(s => s.name).join(',');
    const got = await STUDIO._backupIn(JSON.parse(txt)); const end = (await T.listSongs()).map(s => s.name).sort().join(',');
    return { n, names, bytes:txt.length, mid, got, end }; });
  ok(bk.n >= 3 && !/Beta/.test(bk.mid) && bk.got === 1 && /Beta/.test(bk.end), 'backup: every Studio song goes out; a deleted one comes back from it, the others are left alone', JSON.stringify(bk));
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
