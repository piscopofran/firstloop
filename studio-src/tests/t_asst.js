// the Assistant in the Studio: what it is told, what it may do, hostile replies, Undo, a server that does not know the Studio yet
// node t_asst.js <index.html>
const L = require('../v32four/lib29a'), ok = L.ok;
const W = '/home/claude/firstloop/.claude/worktrees/agent-a0680cd705dd88210/index.html';
async function turn(P, text, say, actions, more){
  P.server.reply = async () => ({ sse:[L.envelope(say, actions, more)] });
  const n = P.chats().length;
  await L.send(P.pg, text); await L.settled(P.pg);
  await P.pg.waitForFunction(() => { const m = window.__flAsst.msgs(); return m.length && m[m.length - 1].r !== 'u'; }, null, { timeout:8000 }).catch(() => {});
  await P.pg.waitForTimeout(350);
  const body = P.chats()[n];
  return { song:body && body.song, body, shown:await L.lastMsg(P.pg) };
}
const studio = pg => pg.waitForFunction(() => window.STUDIO && STUDIO._t && STUDIO._t.S, null, { timeout:15000 });
const seed = pg => pg.evaluate(async () => { const T = STUDIO._t; await T.loadManifest(); T.S.tempo = 96;
  const bs = T.addTrack('inst', T.ENG.inst['upright-bass'] ? 'upright-bass' : 'basic:bass', 'Bass'), ml = T.addTrack('inst', T.ENG.inst.flute ? 'flute' : 'basic:flute', 'Melody');
  T.addRegion(bs, 0, 7680, [[0, 36], [960, 43], [1920, 45], [2880, 40], [3840, 41], [4800, 36], [5760, 43], [6720, 38]].map(a => ({ s:a[0] + 13, l:800, p:a[1], v:90 })));
  T.addRegion(ml, 0, 7680, [[0, 72], [470, 74], [985, 76], [1930, 81], [2890, 79], [3850, 77], [4790, 76], [5770, 74], [6730, 73]].map(a => ({ s:a[0], l:400, p:a[1], v:90 })));
  T.addSection('Verse', 0, 4); T.S.lyrics[T.S.sections[0].id] = 'Walking home in the rain'; T.commit('seed'); T.select(ml.id, ml.regions[0].id); T.refresh(true); });
(async () => {
  const b = await L.launch(); const errs = [], FX = {};
  // ---------- a server that knows the Studio (wire 5) ----------
  {
    const P = await L.newPage(b, { server:{ probe:{ ok:true, model:'m', open:50, v:5 } }, query:'#write' }); errs.push(P.errs); const pg = P.pg;
    await studio(pg); await seed(pg);
    let t = await turn(P, 'what have I got so far', 'A bass line and a melody over four bars.', []);
    const w = t.song && t.song.write; FX['studio, bass and melody'] = t.song;
    ok('wire 5: in the Studio the message carries area "studio", the workspace, and "write"; none of the Make song goes along', t.song && t.song.area === 'studio' && t.song.workspace === 'write' && !!w && t.song.parts === undefined && t.song.tempo === undefined && t.song.dj === undefined, t.song && Object.keys(t.song).join(','));
    ok('write.song: tempo, metre, key, length', w && w.song.tempo === 96 && w.song.meter === '4/4' && w.song.key === 'none' && w.song.bars === 4, w && JSON.stringify(w.song));
    ok('write.tracks: number, name, kind, instrument, range, levels, and each part in outline', w && w.tracks.length === 2 && w.tracks[0].n === 1 && w.tracks[0].kind === 'instrument' && /bass/.test(w.tracks[0].instrument) && w.tracks[0].parts[0].notes === 8 && w.tracks[0].parts[0].low === 'C2' && w.tracks[1].parts[0].high === 'A5', w && JSON.stringify(w.tracks[0]));
    ok('write.selected: the selected part’s notes as [beat, length, pitch]', w && w.selected && w.selected.track === 2 && w.selected.notes.length === 9 && w.selected.notes[0][0] === 1 && w.selected.notes[0][2] === 'C5', w && JSON.stringify(w.selected).slice(0, 120));
    ok('write: sections, the first words of the lyrics, what is done, the instruments and feels that can be named', w && w.sections[0].name === 'Verse' && w.lyrics[0].text === 'Walking home in the rain' && w.done.hummed === true && w.done.chords === false && Object.keys(w.instruments).length >= 6 && w.feels.indexOf('bossa') >= 0 && w.styles.indexOf('strum') >= 0 && w.bass_styles.indexOf('walking') >= 0, w && JSON.stringify(w.done));
    let r = await pg.evaluate(() => { const A = window.__flAsst; const st = { area:'studio', write:{} }; return { kind:A.promptKind(st), k2:A.promptKind({ area:'assistant', write:{ song:{} } }), k3:A.promptKind({ area:'make' }), len:A.promptFor('write').length, hasW:/w_transpose/.test(A.promptFor('write')), noDj:!/dj_load/.test(A.promptFor('write')), noMake:!/set_drum/.test(A.promptFor('write')), makeClean:!/w_transpose/.test(A.promptFor('make')) && !/w_transpose/.test(A.promptFor('dj')) }; });
    ok('the instructions for the Studio are their own piece: chosen for area "studio", holding the w_ actions and none of the decks’ or Make’s; Make and DJ do not get them', r.kind === 'write' && r.k2 === 'write' && r.k3 === 'make' && r.hasW && r.noDj && r.noMake && r.makeClean, JSON.stringify(r));
    ok('the Studio’s instructions are about 3,200 tokens (under 3,600)', r.len / 4 < 3600, Math.round(r.len / 4) + ' tokens');
    // --- actions, one conversation ---
    await pg.evaluate(() => { const T = STUDIO._t; T.chordSet(0, 0, 'maj'); T.chordSet(3840, 5, 'maj7'); T.commit('ch'); }); t = await turn(P, 'and now', 'Two chords.', []); FX['studio, with chords'] = t.song; await pg.evaluate(() => { STUDIO._t.undo(); });
    t = await turn(P, 'it is too high for me', 'The whole song is three semitones lower now.', [{ type:'w_transpose', semitones:-3 }]);
    r = await pg.evaluate(() => { const T = STUDIO._t; return { lo:T.patOf(T.S.tracks[1].regions[0]).notes[0].p, bass:T.patOf(T.S.tracks[0].regions[0]).notes[0].p }; });
    ok('"too high": every note is three semitones lower, and the reply lists it with Undo', r.lo === 69 && r.bass === 33 && /3 semitones lower/.test(t.shown) && /Undo/.test(t.shown), t.shown.replace(/\n/g, ' | ').slice(0, 200));
    await pg.locator('.asst-msg button', { hasText:'Undo' }).last().click(); await pg.waitForTimeout(500);
    r = await pg.evaluate(() => { const T = STUDIO._t; return { lo:T.patOf(T.S.tracks[1].regions[0]).notes[0].p, bass:T.patOf(T.S.tracks[0].regions[0]).notes[0].p }; });
    ok('Undo under the reply puts the song back', r.lo === 72 && r.bass === 36, JSON.stringify(r));
    t = await turn(P, 'find chords for my bass line and have a piano and a guitar play them', 'Chords fitted, piano and guitar added.', [{ type:'w_suggest_chords', track:1 }, { type:'w_accompany', instrument:'piano', style:'ballad' }, { type:'w_accompany', instrument:'guitar', style:'strum' }, { type:'w_drums', feel:'ballad', variation:'B', fill:true }]);
    r = await pg.evaluate(() => { const T = STUDIO._t, S = T.S; return { key:S.key, chords:S.chords.map(c => c.root + c.q).join(' '), tracks:S.tracks.map(t => t.name + ':' + t.kind + ':' + (t.regions[0] ? (t.regions[0].gen ? t.regions[0].gen.style : t.regions[0].drum ? t.regions[0].drum.feel : 'own') : '')).join(', '), u:T.hist().u.length }; });
    ok('chords fitted to the bass line, a piano (ballad), a guitar (strummed) and drums (ballad B with a fill): four actions, one reply', r.chords.split(' ').length >= 3 && /:inst:ballad/.test(r.tracks) && /:inst:strum/.test(r.tracks) && /Drums:drums:ballad/.test(r.tracks) && r.key.scale !== 'none', r.chords + ' | ' + r.tracks);
    const uBefore = r.u;
    await pg.locator('.asst-msg button', { hasText:'Undo' }).last().click(); await pg.waitForTimeout(500);
    r = await pg.evaluate(() => { const S = STUDIO._t.S; return { n:S.tracks.length, ch:S.chords.length }; });
    ok('and all four are one step of Undo', r.n === 2 && r.ch === 0, JSON.stringify(r));
    t = await turn(P, 'do that again please', 'Done again.', [{ type:'w_suggest_chords', track:1 }, { type:'w_accompany', instrument:'piano', style:'ballad' }, { type:'w_drums', feel:'ballad', variation:'B', fill:true }]);
    t = await turn(P, 'tidy my melody and make a chorus from the verse, fuller', 'Tidied; the chorus follows the verse.', [{ type:'w_tidy', track:'Melody', timing:'1/8', pitch:'key' }, { type:'w_section', op:'duplicate', section:'Verse', new_name:'Chorus', fuller:true }, { type:'w_mix', track:'Bass', volume:70, reverb:5 }, { type:'w_tempo', bpm:104 }, { type:'w_loop', from_bar:5, to_bar:8 }]);
    r = await pg.evaluate(() => { const T = STUDIO._t, S = T.S; const ml = S.tracks[1]; return { starts:T.patOf(ml.regions[0]).notes.map(n => n.s % 240).join(''), secs:S.sections.map(q => q.name + '@' + q.bar).join(' '), tempo:S.tempo, vol:S.tracks[0].vol, send:S.tracks[0].send, loop:S.loop, names:S.tracks.map(t => t.name).join(','), bars:Math.round(T.songTicks() / 1920) }; });
    ok('tidy (every start on an eighth), a Chorus copied from the Verse and made fuller, a mix change, tempo, a loop', /^0+$/.test(r.starts) && r.secs === 'Verse@0 Chorus@4' && r.tempo === 104 && r.vol === 0.7 && r.send === 0.05 && r.loop.on && r.loop.a === 7680 && r.bars === 8, JSON.stringify(r).slice(0, 300));
    t = await turn(P, 'write me a simple bass line for the chorus', 'Written.', [{ type:'w_notes', track:'Bass', from_bar:5, to_bar:6, notes:[[1, 1, 'C2', 100], [2, 1, 'G2'], [3, 2, 36], [5, 4, 'F1', 80]] }, { type:'w_key', key:'A minor' }, { type:'w_instrument', track:2, instrument:'guitar' }, { type:'w_add_track', kind:'voice' }, { type:'w_section', op:'rename', section:2, new_name:'Refrain' }, { type:'w_meter', value:'4/4' }]);
    r = await pg.evaluate(() => { const T = STUDIO._t, S = T.S, bs = S.tracks[0]; const rg = bs.regions.filter(q => q.s === 7680)[0]; return { notes:rg ? T.patOf(rg).notes.map(n => n.s + ':' + n.l + ':' + n.p + ':' + n.v).join(' ') : '', key:S.key, inst:S.tracks[1].inst, last:S.tracks[S.tracks.length - 1].kind, sec:S.sections[1].name }; });
    ok('notes written on request (names or numbers), the key named, an instrument changed, a voice track, a section renamed', r.notes === '0:480:36:100 480:480:43:90 960:960:36:90 1920:1920:29:80' && r.key.root === 9 && r.key.scale === 'minor' && /guitar/.test(r.inst) && r.last === 'audio' && r.sec === 'Refrain', JSON.stringify(r));
    t = await turn(P, 'let me hum the bridge', 'Press Start when you are ready.', [{ type:'w_open', what:'hum', track:1 }]);
    await pg.waitForTimeout(400);
    ok('w_open brings up the Hum sheet; it does not record by itself', await pg.isVisible('#sthum') && await pg.evaluate(() => !STUDIO._t.HUM), t.shown.replace(/\n/g, ' | ').slice(0, 120));
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(200);
    t = await turn(P, 'set the key', '<img src=x onerror="window.__pwn=1"> Done <b>bold</b>.', [{ type:'w_key', key:'<img src=x onerror=window.__pwn=1>' }, { type:'w_add_track', kind:'voice', name:'<img src=x onerror=window.__pwn=2>' }]);
    r = await pg.evaluate(() => ({ pwn:window.__pwn, imgs:document.querySelectorAll('#assistant img, #studio img').length, name:STUDIO._t.S.tracks[STUDIO._t.S.tracks.length - 1].name }));
    ok('markup in a reply, in an action and in a track name it gives is shown as text everywhere and runs nothing', r.pwn === undefined && r.imgs === 0 && /^<img/.test(r.name), JSON.stringify(r));
    // the state stays inside what the server takes, even for a full song
    r = await pg.evaluate(() => { const T = STUDIO._t; for(let i = T.S.tracks.length; i < 16; i++){ const t = T.addTrack('inst', 'basic:piano', 'Track with a long name ' + i); for(let k = 0; k < 14; k++) T.addRegion(t, k * 7680, 7680, Array.from({ length:64 }, (_, j) => ({ s:j * 120, l:100, p:48 + (j % 24), v:90 }))); }
      for(let i = 0; i < 120; i++) T.chordSet(i * 960, i % 12, ['maj7', 'm7', 'sus4'][i % 3]); for(let i = 0; i < 20; i++) T.addSection('Section number ' + i, undefined, 4); T.S.sections.forEach(q => { T.S.lyrics[q.id] = 'word '.repeat(400); }); T.commit('big');
      const st = { area:'studio', workspace:'write', write:STUDIO.state() }; return { bytes:new TextEncoder().encode(JSON.stringify(st)).length, tracks:st.write.tracks.length, chords:st.write.chords.length }; });
    ok('a song with 16 full tracks, 120 chords, 21 sections and long lyrics is still described in under 14 KB', r.bytes < 14000 && r.tracks === 16, JSON.stringify(r));
    t = await turn(P, 'hello', 'Hello.', []);
    FX['studio, a full song'] = t.body && t.body.song;
    ok('and the server gets it whole', t.body && JSON.stringify(t.body.song).length < 14000 && t.body.song.write.tracks.length === 16, t.body && String(JSON.stringify(t.body.song).length));
    await P.ctx.close();
  }
  // ---------- hostile and broken replies, straight into the Studio's own checking ----------
  {
    const P = await L.newPage(b, { server:{ probe:{ ok:true, model:'m', open:50, v:5 } }, query:'#write' }); errs.push(P.errs); const pg = P.pg;
    await studio(pg); await seed(pg);
    const r = await pg.evaluate(() => { const T = STUDIO._t, base = JSON.stringify(T.S), out = [];
      const tries = [
        ['not a list', 'nope'], ['null', null], ['numbers', [1, 2, 3]], ['unknown type', [{ type:'delete_everything' }]], ['a Make action', [{ type:'set_drum', part:'A', drum:'kick', steps:[1] }]], ['a DJ action', [{ type:'dj_play', deck:1 }]],
        ['proto', [{ type:'__proto__' }, { type:'constructor' }, { type:'hasOwnProperty' }, { type:'toString' }]],
        ['tempo out of range', [{ type:'w_tempo', bpm:9999 }, { type:'w_tempo', bpm:-1 }, { type:'w_tempo', bpm:'fast' }, { type:'w_tempo', bpm:{ valueOf(){ return 100; } } }, { type:'w_tempo' }]],
        ['transpose out of range', [{ type:'w_transpose', semitones:400 }, { type:'w_transpose', semitones:1.5 }, { type:'w_transpose', semitones:'x' }, { type:'w_transpose', semitones:0 }]],
        ['key nonsense', [{ type:'w_key', key:'<script>alert(1)</script>' }, { type:'w_key', key:{} }, { type:'w_key', key:'H minor' }, { type:'w_key' }]],
        ['meter', [{ type:'w_meter', value:'7/3' }, { type:'w_meter', value:[] }]],
        ['chords', [{ type:'w_chords', chords:'Am F' }, { type:'w_chords', chords:[] }, { type:'w_chords', chords:[{ bar:0, chord:'C' }, { bar:1e9, chord:'C' }, { bar:1, chord:'Zz' }, { bar:1, beat:99, chord:'C' }, null, 5, { bar:'1; DROP', chord:'C' }] }]],
        ['tracks that are not there', [{ type:'w_instrument', track:99, instrument:'flute' }, { type:'w_instrument', track:'nobody', instrument:'flute' }, { type:'w_instrument', track:1, instrument:'kazoo-of-doom' }, { type:'w_mix', track:-1, volume:50 }, { type:'w_mix', track:{}, volume:50 }, { type:'w_tidy', track:44, timing:'tidy' }, { type:'w_notes', track:'x', notes:[] }, { type:'w_accompany', track:9 }, { type:'w_drums', track:5 }]],
        ['mix out of range', [{ type:'w_mix', track:1, volume:1e6 }, { type:'w_mix', track:1, pan:-500 }, { type:'w_mix', track:1, reverb:'lots' }, { type:'w_mix', track:1, mute:'yes' }]],
        ['notes', [{ type:'w_notes', track:1, from_bar:1, to_bar:2, notes:[[1, 1, 'H9'], [1, 1, 999], [-5, 1, 60], [1, -1, 60], [1, 1], 'x', null, [1, 1, 60, 500], [1e9, 1, 60]] }, { type:'w_notes', track:1, from_bar:5, to_bar:1, notes:[[1, 1, 60]] }, { type:'w_notes', track:1, from_bar:1, to_bar:1e7, notes:[[1, 1, 60]] }]],
        ['sections', [{ type:'w_section', op:'explode' }, { type:'w_section', op:'rename', section:'Nope', new_name:'x' }, { type:'w_section', op:'rename', section:1 }, { type:'w_section', op:'add', bar:-4 }, { type:'w_section', op:'add', bars:1e9 }, { type:'w_section', op:'delete', section:77 }]],
        ['accompany with no chords', [{ type:'w_accompany', instrument:'piano' }]],
        ['drums nonsense', [{ type:'w_drums', feel:'polka-from-mars' }, { type:'w_drums', feel:'pop', from_bar:0 }, { type:'w_drums', feel:'pop', kit:'no-such-kit', track:undefined }]],
        ['open nonsense', [{ type:'w_open', what:'javascript:alert(1)' }, { type:'w_open' }, { type:'go_to', area:'../../etc' }, { type:'w_loop', from_bar:'a' }]],
        ['too many', Array.from({ length:300 }, () => ({ type:'w_tempo', bpm:9999 }))],
        ['huge strings', [{ type:'w_add_track', kind:'instrument', instrument:'x'.repeat(100000), name:'y'.repeat(100000) }, { type:'w_key', key:'A'.repeat(1e6) }]]
      ];
      tries.forEach(tr => { let res, thrown = null; try { res = STUDIO.apply(tr[1]); } catch(e){ thrown = String(e); } const now = JSON.stringify(T.S); out.push({ name:tr[0], thrown, changed:now !== base, applied:res && res.applied, skipped:res && res.skipped.length, undo:res && !!res.undo, first:res && res.skipped[0] }); });
      // what a refusal says is plain text and cut short
      const long = STUDIO.apply([{ type:'w_key', key:'<img src=x onerror=alert(1)>' + 'A'.repeat(5000) }]).skipped[0];
      // a name given to a new track is cut, never run
      const res = STUDIO.apply([{ type:'w_add_track', kind:'voice', name:'<b onmouseover=alert(1)>Lead</b>' + 'z'.repeat(500) }]); const nm = T.S.tracks[T.S.tracks.length - 1].name;
      return { out, long, nm, html:document.querySelectorAll('#studio b[onmouseover], #studio img[onerror]').length, ok:T.fixSong(JSON.parse(JSON.stringify(T.S))) !== null }; });
    const bad = r.out.filter(o => o.thrown || o.changed || o.applied || o.undo);
    ok('seventeen kinds of broken or hostile reply (unknown and foreign actions, prototype names, numbers out of range, tracks that are not there, 300 actions, megabyte strings): nothing throws, nothing changes, nothing is counted as done', bad.length === 0, bad.map(o => o.name + (o.thrown ? ' THREW ' + o.thrown : o.changed ? ' CHANGED' : ' applied')).join('; '));
    ok('every refusal says why, in a line', r.out.filter(o => o.name !== 'not a list' && o.name !== 'null').every(o => o.skipped >= 1 && /^Skipped: /.test(o.first)), r.out.map(o => o.skipped).join(','));
    ok('what a refusal quotes back is cut to 24 characters', r.long.length < 110, r.long);
    ok('a name from a reply is text, cut to 32 characters; no markup reaches the page', r.nm.length <= 32 && r.html === 0 && r.ok, r.nm);
    await P.ctx.close();
  }
  // ---------- a server from before the Studio (wire 4) ----------
  {
    const P = await L.newPage(b, { server:{ probe:{ ok:true, model:'m', open:50, v:4 } }, query:'#write' }); errs.push(P.errs); const pg = P.pg;
    await studio(pg); await seed(pg);
    const n0 = P.chats().length;
    await L.send(pg, 'tempo 88'); await L.settled(pg); await pg.waitForTimeout(400);
    let r = await pg.evaluate(() => ({ tempo:STUDIO._t.S.tempo }));
    ok('an older server is never sent the Studio: "tempo 88" is done on the page', P.chats().length === n0 && r.tempo === 88, 'requests ' + (P.chats().length - n0));
    await L.send(pg, 'it is too high for me'); await L.settled(pg); await pg.waitForTimeout(400);
    r = await pg.evaluate(() => STUDIO._t.patOf(STUDIO._t.S.tracks[1].regions[0]).notes[0].p);
    ok('"too high for me" lowers the song two semitones, also without the AI', r === 70 && P.chats().length === n0, String(r));
    await L.send(pg, 'undo'); await L.settled(pg); await pg.waitForTimeout(500);
    r = await pg.evaluate(() => STUDIO._t.patOf(STUDIO._t.S.tracks[1].regions[0]).notes[0].p);
    ok('"undo" takes it back', r === 72, String(r));
    await L.send(pg, 'write me a bridge in the style of the Beatles'); await L.settled(pg); await pg.waitForTimeout(300);
    const shown = await L.lastMsg(pg);
    ok('what needs the AI is answered with what can be done without it, and nothing is sent', /plain requests/.test(shown) && P.chats().length === n0, shown.slice(0, 120));
    // out of the Studio, the same page talks to that server as before
    await pg.evaluate(() => window.__flWs.set('make')); await pg.waitForTimeout(400);
    const t = await turn(P, 'faster', 'Tempo is up.', [{ type:'set_tempo', value:120 }]);
    ok('in Make the same page sends the Make song to that server, with nothing of the Studio in it', t.song && t.song.area === 'make' && t.song.write === undefined && t.song.parts !== undefined, t.song && Object.keys(t.song).slice(0, 8).join(','));
    await P.ctx.close();
  }
  // ---------- the AI switched off: the Studio's own plain requests ----------
  {
    const P = await L.newPage(b, { server:{ probe:null }, query:'#write' }); errs.push(P.errs); const pg = P.pg;
    await studio(pg); await seed(pg);
    await L.send(pg, 'suggest chords'); await L.settled(pg); await pg.waitForTimeout(400);
    await L.send(pg, 'add piano'); await L.settled(pg); await pg.waitForTimeout(400);
    await L.send(pg, 'add bossa drums'); await L.settled(pg); await pg.waitForTimeout(400);
    const r = await pg.evaluate(() => { const S = STUDIO._t.S; return { ch:S.chords.length, tracks:S.tracks.map(t => t.kind + ':' + (t.regions[0] && (t.regions[0].gen ? 'gen' : t.regions[0].drum ? t.regions[0].drum.feel : 'own'))).join(',') }; });
    ok('with no AI at all: "suggest chords", "add piano", "add bossa drums" still work', r.ch >= 2 && /inst:gen/.test(r.tracks) && /drums:bossa/.test(r.tracks), JSON.stringify(r));
    await P.ctx.close();
  }
  require('fs').writeFileSync(__dirname + '/fixture-states-v34.json', JSON.stringify(FX));
  await b.close();
  L.finish ? L.finish(errs) : console.log(JSON.stringify(L.results && L.results()));
})().catch(e => { console.error(e); process.exit(1); });
