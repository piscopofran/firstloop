// chords, accompaniment styles, chord suggestions, drum feels: are the notes musically valid
const L = require('./lib'), { ok } = L;
(async () => {
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  await E(async () => { const T = STUDIO._t; await T.loadManifest(); });
  // --- chord names ---
  let r = await E(() => { const T = STUDIO._t, P = T.parseChord; const good = { 'C':'0maj', 'Am':'9min', 'F#m7':'6m7', 'Bb':'10maj', 'G7':'7 7', 'Dsus4':'2sus4', 'Ebmaj7':'3maj7', 'c':'0maj', 'A minor':null, 'Bdim':'11dim', 'C/E':'0maj', 'E♭':'3maj', 'F♯m':'6min', 'Gadd9':'7add9', 'D9':'29', 'Caug':'0aug', 'Amin':'9min', 'A-':'9min' };
    const out = {}; Object.keys(good).forEach(k => { const c = P(k); out[k] = c ? c.root + (c.q === '7' ? ' 7' : c.q) : null; });
    const bad = ['', 'H', 'Cxyz', '7', 'C#b', '<b>', 'A'.repeat(50), null, undefined, 12, {}].map(x => P(x));
    return { out, good, bad:bad.filter(x => x !== null).length }; });
  const wrong = Object.keys(r.good).filter(k => k !== 'A minor' && r.out[k] !== r.good[k]);
  ok(wrong.length === 0 && r.bad === 0, 'chord names are read (C, Am, F#m7, Bb, G7, Dsus4, Ebmaj7, C/E, Gadd9 …) and nonsense is refused', wrong.map(k => k + '=' + r.out[k]).join(' '));
  // --- the chords of a key ---
  r = await E(() => { const T = STUDIO._t; const nm = c => ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][c.root] + ({ maj:'', min:'m', dim:'dim' })[c.q]; return { cmaj:T.keyChords({ root:0, scale:'major' }).map(nm).join(' '), amin:T.keyChords({ root:9, scale:'minor' }).map(nm).join(' '), ebmaj:T.keyChords({ root:3, scale:'major' }).map(nm).join(' ') }; });
  ok(r.cmaj === 'C Dm Em F G Am Bdim' && r.amin === 'Am Bdim C Dm Em F G E' && r.ebmaj === 'Eb Fm Gm Ab Bb Cm Ddim', 'the chords of a key: C major, A minor (with the major chord on the fifth), E flat major', r.cmaj + ' | ' + r.amin + ' | ' + r.ebmaj);
  // --- every style, on every kind of instrument, in every metre: notes belong to the chord, sit in range, stay inside the bars ---
  r = await E(() => {
    const T = STUDIO._t, res = [], insts = ['grand-piano', 'steel-guitar', 'strings', 'upright-bass', 'electric-bass', 'flute', 'basic:piano', 'basic:bass', 'harp'];
    const progs = [[[0, 'maj'], [9, 'min'], [5, 'maj'], [7, '7']], [[9, 'min'], [5, 'maj'], [0, 'maj'], [7, 'maj']], [[3, 'maj7'], [8, 'maj'], [10, 'sus4'], [0, 'm7']]];
    ['4/4', '3/4', '6/8', '2/4', '5/4', '12/8'].forEach(sig => {
      insts.forEach(id => {
        if(!T.ENG.inst[id]) return;
        T.S.tracks.length = 0; T.S.chords = []; T.S.pats = {}; T.S.sig = sig.split('/').map(Number); T.S.key = { root:0, scale:'major' };
        const bt = T.barTicks(), t = T.addTrack('inst', id, 'x'), d = T.ENG.inst[id];
        progs.forEach((pg, pi) => {
          T.S.chords = []; pg.forEach((c, i) => T.chordSet(i * bt, c[0], c[1])); if(pi === 2) T.chordSet(Math.round(bt / 2 / T.barTicks() * bt / 240) * 240 + 3 * bt, 5, 'maj');
          T.stylesFor(t).forEach(st => {
            const notes = T.chordNotes(t, 0, 4 * bt, st[0]); const row = { sig, id, style:st[0], n:notes ? notes.length : 0, bad:[] };
            if(!notes || !notes.length){ row.bad.push('no notes'); res.push(row); return; }
            const chordAt = tk => { let c = null; T.S.chords.forEach(x => { if(x.t <= tk) c = x; }); return c; };
            let perBar = [0, 0, 0, 0];
            notes.forEach(n => {
              const c = chordAt(n.s), tones = T.chordTones(c), pc = ((n.p % 12) + 12) % 12, sounding = n.p + 12 * (t.oct || 0);
              if(sounding < d.range[0] || sounding > d.range[1]) row.bad.push('out of range ' + sounding);
              if(n.s < 0 || n.s >= 4 * bt || n.l <= 0) row.bad.push('outside the bars');
              if(n.v < 1 || n.v > 127) row.bad.push('velocity');
              perBar[Math.floor(n.s / bt)]++;
              // a walking bass may step into the next chord on the last beat; everything else is of the chord
              const nxt = chordAt(n.s + T.S.sig[1] === 8 ? 720 : 480 + 1), lastBeat = st[0] === 'walking';
              if(tones.indexOf(pc) < 0 && !lastBeat) row.bad.push('not in chord: ' + pc + ' over ' + c.root + c.q + ' @' + n.s);
              if(st[0] === 'walking' && tones.indexOf(pc) < 0){ const nc = chordAt(n.s + bt); const near = nc && [1, 11, 2, 10].some(dd => (pc + dd) % 12 === nc.root); const scale = [0, 2, 4, 5, 7, 9, 11].indexOf(pc) >= 0 || [1, 11].some(dd => tones.indexOf((pc + dd) % 12) >= 0); if(!near && !scale) row.bad.push('walking: stray note ' + pc + ' @' + n.s); }
            });
            if(perBar.some(c => c === 0)) row.bad.push('an empty bar ' + perBar.join(','));
            // the first note of each chord: the lowest note sounding at the change is the root (or, for held chords, a note of the chord)
            if(/root|rootfifth|walking|ballad|finger|arp/.test(st[0])){ [0, 1, 2, 3].forEach(bar => { const at = notes.filter(n => n.s === bar * bt).sort((a, b2) => a.p - b2.p)[0], c = chordAt(bar * bt); if(!at) row.bad.push('nothing on the bar line ' + bar); else if(((at.p % 12) + 12) % 12 !== c.root) row.bad.push('bar ' + bar + ' does not start on the root'); }); }
            res.push(row);
          });
        });
      });
    });
    return { n:res.length, notes:res.reduce((a, x) => a + x.n, 0), bad:res.filter(x => x.bad.length).map(x => x.sig + ' ' + x.id + ' ' + x.style + ': ' + x.bad.slice(0, 2).join('; ')) };
  });
  ok(r.bad.length === 0, 'accompaniment: ' + r.n + ' parts (every style × 9 instruments × 6 metres × 3 progressions, ' + r.notes + ' notes): of the chord, inside the instrument’s range, no empty bar, the bass on the root', r.bad.slice(0, 6).join(' | ') + (r.bad.length > 6 ? ' … ' + r.bad.length : ''));
  // --- following the chords ---
  r = await E(() => { const T = STUDIO._t; T.S.tracks.length = 0; T.S.chords = []; T.S.pats = {}; T.S.sig = [4, 4]; const bt = 1920, t = T.addTrack('inst', 'grand-piano', 'P'), bs = T.addTrack('inst', 'upright-bass', 'B');
    [[0, 'maj'], [9, 'min'], [5, 'maj'], [7, 'maj']].forEach((c, i) => T.chordSet(i * bt, c[0], c[1]));
    const a = T.chordPart(t.id, 0, 4 * bt, 'ballad'), b2 = T.chordPart(bs.id, 0, 4 * bt, 'rootfifth'); T.commit('parts');
    const pcs = rg => [...new Set(T.patOf(rg).notes.filter(n => n.s >= bt && n.s < 2 * bt).map(n => n.p % 12))].sort((x, y) => x - y).join(',');
    const before = [pcs(a), pcs(b2)];
    T.chordSet(bt, 2, 'min'); T.commit('chord');
    const after = [pcs(a), pcs(b2)], gen = [!!a.gen, !!b2.gen];
    // editing a note by hand ends the following for that part
    T.select(t.id, a.id); T.showTab('notes'); T.ROLL.sel = [T.patOf(a).notes[0]]; T.rollDo('transpose', 1);
    T.chordSet(bt, 4, 'min'); T.commit('chord2');
    const after2 = [pcs(a), pcs(b2)];
    T.undo(); T.undo(); T.undo(); const undone = [pcs(a.id ? T.findRegion(a.id).r : a), pcs(T.findRegion(b2.id).r)];
    return { before, after, gen, after2, undone, name:b2.name }; });
  ok(r.before[0] === '0,4,9' && r.after[0] === '2,5,9' && r.before[1] === '4,9' && r.after[1] === '2,9', 'a part written from the chords is written again when a chord changes (Am becomes Dm in bar 2: piano and bass both follow)', JSON.stringify([r.before, r.after]));
  ok(r.after2[0] === '2,5,9' && r.after2[1] === '4,11', 'once a note of a part is edited by hand that part stops following; the other still follows', JSON.stringify(r.after2));
  ok(r.undone[0] === '0,4,9' && r.undone[1] === '4,9', 'undo takes the chord change and the rewritten parts back together', JSON.stringify(r.undone));
  // --- chords suggested for melodies and bass lines ---
  r = await E(() => { const T = STUDIO._t, out = {}; const nm = c => ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'][c.root] + ({ maj:'', min:'m', dim:'dim' })[c.q];
    const mk = (notes, key, inst) => { T.S.tracks.length = 0; T.S.chords = []; T.S.pats = {}; T.S.sig = [4, 4]; T.S.key = key; const t = T.addTrack('inst', inst, 'x'); let s = 0; const ns = notes.map(n => { const o = { s:s, l:n[1] * 480 - 20, p:n[0], v:90 }; s += n[1] * 480; return o; }); T.addRegion(t, 0, Math.ceil(s / 1920) * 1920, ns); return T.suggestChords(t.id, 0, Math.ceil(s / 1920) * 1920, key).map(a => a.map(nm).join(' ')); };
    // bass lines name the chord by their note on the bar line
    out.bass1 = mk([[36, 2], [43, 1], [36, 1], [45, 2], [40, 1], [45, 1], [41, 2], [36, 1], [41, 1], [43, 2], [38, 1], [43, 1]], { root:0, scale:'major' }, 'upright-bass');
    out.bass2 = mk([[45, 1], [45, 1], [52, 1], [45, 1], [41, 1], [41, 1], [48, 1], [41, 1], [36, 1], [36, 1], [43, 1], [36, 1], [43, 1], [43, 1], [38, 1], [43, 1]], { root:9, scale:'minor' }, 'electric-bass');
    // melodies: the notes on the strong beats
    out.twinkle = mk([[60, 1], [60, 1], [67, 1], [67, 1], [69, 1], [69, 1], [67, 2], [65, 1], [65, 1], [64, 1], [64, 1], [62, 1], [62, 1], [60, 2]], { root:0, scale:'major' }, 'flute');
    out.ode = mk([[64, 1], [64, 1], [65, 1], [67, 1], [67, 1], [65, 1], [64, 1], [62, 1], [60, 1], [60, 1], [62, 1], [64, 1], [64, 1.5], [62, 0.5], [62, 2]], { root:0, scale:'major' }, 'violin');
    out.minor = mk([[69, 1], [72, 1], [76, 2], [74, 1], [72, 1], [71, 2], [69, 1], [72, 1], [76, 1], [81, 1], [80, 2], [76, 2]], { root:9, scale:'minor' }, 'flute');
    out.few = (() => { T.S.tracks.length = 0; const t = T.addTrack('inst', 'flute', 'x'); T.addRegion(t, 0, 1920, [{ s:0, l:100, p:60, v:90 }]); return T.suggestChords(t.id, 0, 1920, { root:0, scale:'major' }); })();
    const inKey = (list, key) => list.every(seq => seq.split(' ').every(c => T.keyChords(key).map(nm).indexOf(c) >= 0));
    return { out, k1:inKey(out.bass1, { root:0, scale:'major' }) && inKey(out.twinkle, { root:0, scale:'major' }), k2:inKey(out.bass2, { root:9, scale:'minor' }) && inKey(out.minor, { root:9, scale:'minor' }) }; });
  ok(r.out.bass1[0] === 'C Am F G', 'a bass line C . G C | A . E A | F . C F | G . D G gets C Am F G', r.out.bass1.join(' / '));
  ok(r.out.bass2[0] === 'Am F C G', 'a bass line on A, F, C, G in A minor gets Am F C G', r.out.bass2.join(' / '));
  ok(/^C (F|Am) (F|Dm) (G|C|Dm)$/.test(r.out.twinkle[0]), 'Twinkle twinkle (two beats to a note’s chord): C, then F or Am, F or Dm, G', r.out.twinkle.join(' / '));
  ok(/^C (G|C|Em) (C|Am) (G|C)$/.test(r.out.ode[0]), 'Ode to Joy: C, then G or a relative, and so on', r.out.ode.join(' / '));
  ok(/^Am/.test(r.out.minor[0]) && r.k2, 'a melody in A minor starts on Am and stays among the chords of A minor', r.out.minor.join(' / '));
  ok(r.k1 && r.out.bass1.length >= 2 && new Set(r.out.bass1).size === r.out.bass1.length, 'up to three different readings are offered, all from the key', r.out.bass1.length + ' readings');
  ok(r.out.few === null, 'one note is too little to suggest chords from');
  // --- drums: every feel, every variation, every metre ---
  r = await E(() => { const T = STUDIO._t, bad = [], sigs = ['4/4', '3/4', '6/8', '2/4', '5/4', '12/8']; let n = 0, total = 0;
    sigs.forEach(sig => { T.S.sig = sig.split('/').map(Number); const bt = T.barTicks(), beat = T.S.sig[1] === 8 ? 720 : 480;
      T.FEELS.forEach(f => { [0, 1, 2].forEach(v => { [false, true].forEach(fill => {
        const notes = T.drumNotes(f.id, v, 4, fill); n++; total += notes.length; const tag = sig + ' ' + f.id + ' ' + 'ABC'[v] + (fill ? ' fill' : '');
        if(notes.length < 8) bad.push(tag + ': only ' + notes.length + ' hits');
        const names = Object.keys(T.DRUM).reduce((m, k) => { m[T.DRUM[k]] = k; return m; }, {});
        if(notes.some(x => !names[x.p])) bad.push(tag + ': a piece no kit has');
        if(notes.some(x => x.s < 0 || x.s >= 4 * bt || x.v < 1 || x.v > 127)) bad.push(tag + ': outside the bars or velocity');
        for(let bar = 0; bar < 4; bar++){ const inBar = notes.filter(x => x.s >= bar * bt && x.s < (bar + 1) * bt); if(!inBar.length) bad.push(tag + ': bar ' + (bar + 1) + ' is empty'); }
        // something low on the first beat of the phrase, and a backbeat or its stand-in somewhere
        if(!notes.some(x => x.s === 0 && (names[x.p] === 'kick' || names[x.p] === 'rim' || names[x.p] === 'snare')) && f.id !== 'reggae') bad.push(tag + ': nothing on the first beat');
        if(!notes.some(x => /snare|rim|clap/.test(names[x.p]))) bad.push(tag + ': no snare, rim or clap at all');
        // no two hits of one piece on the same tick
        const seen = {}; notes.forEach(x => { const k = x.p + ':' + x.s; if(seen[k]) bad.push(tag + ': a doubled hit'); seen[k] = 1; });
        if(fill){ const a = T.drumNotes(f.id, v, 4, false); const lastA = a.filter(x => x.s >= 3 * bt).map(x => x.p + ':' + x.s + ':' + x.v).join(), lastB = notes.filter(x => x.s >= 3 * bt).map(x => x.p + ':' + x.s + ':' + x.v).join(); if(lastA === lastB) bad.push(tag + ': the fill is the same as the bar it replaces'); }
      }); }); });
    });
    // feels differ from one another, and their variations too
    T.S.sig = [4, 4]; const sigOf = (f, v) => T.drumNotes(f, v, 2, false).map(x => x.p + ':' + x.s + ':' + x.v).join(); const all = {}; let same = [];
    T.FEELS.forEach(f => [0, 1, 2].forEach(v => { const s = sigOf(f.id, v); if(all[s]) same.push(f.id + 'ABC'[v] + '=' + all[s]); all[s] = f.id + 'ABC'[v]; }));
    return { n, total, bad:[...new Set(bad)], same:same.length, sameList:same.join(' '), feels:T.FEELS.map(f => f.name).join(', ') }; });
  ok(r.bad.length === 0, 'drums: ' + r.n + ' patterns (12 feels × A, B, C × with and without a fill × 6 metres, ' + r.total + ' hits) are whole: hits in every bar, a low hit on the first beat, a backbeat, pieces the kits have, a fill that differs', r.bad.slice(0, 5).join(' | ') + (r.bad.length > 5 ? ' … ' + r.bad.length : ''));
  ok(r.same === 0, 'no two feels or variations are the same pattern', r.sameList || r.feels);
  // --- busier, sparser, humanise ---
  r = await E(() => { const T = STUDIO._t; T.S.tracks.length = 0; T.S.pats = {}; T.S.sig = [4, 4]; const t = T.addTrack('drums', 'studio-kit', 'D'), rg = T.addRegion(t, 0, 7680, []); T.drumPreset(rg, 'pop', 0, false);
    const f = { t, r:rg }, n0 = T.patOf(rg).notes.length, ups = []; for(let i = 0; i < 5; i++){ const did = T.drumDensity(f, 1); ups.push(did ? T.patOf(rg).notes.length : -1); }
    const downs = []; for(let i = 0; i < 8; i++){ const did = T.drumDensity(f, -1); downs.push(did ? T.patOf(rg).notes.length : -1); }
    const left = T.patOf(rg).notes.map(x => x.p); return { n0, ups, downs, kick:left.indexOf(36) >= 0, snare:left.indexOf(38) >= 0 }; });
  const upsOk = r.ups.filter(x => x > 0).every((x, i, a) => x > (i ? a[i - 1] : r.n0)) && r.ups.some(x => x > 0), downsOk = r.downs.filter(x => x > 0).every((x, i, a) => i === 0 || x < a[i - 1]);
  ok(upsOk && downsOk && r.kick && r.snare, 'Busier adds hits step by step until there is no more to add; Sparser takes them away again and always leaves kick and snare', JSON.stringify(r));
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
