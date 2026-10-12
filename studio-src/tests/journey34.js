// A singer's way in, against the real service (the stand-in model answers from a script): the link, an account as
// "Singer or songwriter", the Assistant in the Studio. Then the same page against the v33 service.
// node journey34.js BASE34 WORK34 BASE33 WORK33
const J = require('../v33int/jlib');
const [B5, W5, B4, W4] = process.argv.slice(2);
const { ok, w } = J;
const studio = pg => pg.waitForFunction(() => window.STUDIO && STUDIO._t && STUDIO._t.S, null, { timeout:20000 });
const seed = pg => pg.evaluate(() => { const T = STUDIO._t; const t = T.addTrack('inst', 'basic:flute', 'Melody'); T.addRegion(t, 0, 7680, [[0, 76], [960, 79], [1920, 81], [3840, 76]].map(a => ({ s:a[0], l:800, p:a[1], v:90 }))); T.S.key = { root:9, scale:'minor' }; T.commit('seed'); T.select(t.id, t.regions[0].id); });
(async () => {
  const br = await J.launch(true);
  // ---------- the v34 service ----------
  {
    const A = await J.open(br, B5, { viewport:{ width:1280, height:800 }, fresh:true, hash:'#write' }); const pg = A.pg;
    await studio(pg); await w(pg, 500);
    ok('1 /#write lands in the Songwriter workspace, in the Studio, on a new song with Start here', (await pg.evaluate(() => document.body.dataset.ws + ' ' + document.body.dataset.view)) === 'write studio' && await J.vis(pg, '#ststeps') && await J.vis(pg, '#ststart-hum'));
    ok('1 the old areas and their transport are not in the top bar; the Workspace button is', await pg.evaluate(() => ['make', 'mix', 'learn', 'songs', 'dj'].every(v => { const e = document.querySelector('.viewtab[data-view="' + v + '"]'); return !e || !e.getClientRects().length; }) && !document.getElementById('play').getClientRects().length && !!document.querySelector('.wsbtn').getClientRects().length));
    ok('1 the Assistant says an account or an invite code is needed', /Account or invite code needed/.test(await pg.textContent('#asststate')) && await J.vis(pg, '#acctgatenew'));
    await pg.click('#acctgatenew'); await w(pg, 300);
    ok('1 in the Songwriter workspace the form has "Singer or songwriter" chosen already', (await pg.inputValue('#acctrole')) === 'singer', await pg.inputValue('#acctrole'));
    await pg.fill('#acctname', 'Mara S'); await pg.check('#acctage'); await pg.click('#acctgo'); await w(pg, 1200);
    const code = await pg.evaluate(() => { const e = document.getElementById('acctcode'); return e ? e.textContent : ''; });
    ok('1 the account is made and the Assistant is connected', /^LOOP-/.test(code) && /Your account is ready/.test(await pg.textContent('#acctready')), code);
    ok('1 the request said role singer', A.posts.some(b => b.op === 'signup' && b.role === 'singer'), JSON.stringify(A.posts.filter(b => b.op === 'signup')));
    const list = await J.admin(B5, 'admin.codes').catch(() => null);
    const mine = JSON.stringify(list || {});
    ok('1 the owner page’s data has her as a singer', /"role":\s*"singer"/.test(mine), mine.slice(0, 200));
    await pg.click('#acctdone').catch(() => {}); await w(pg, 300);
    ok('1 she is still in the Studio', (await pg.evaluate(() => document.body.dataset.ws + ' ' + document.body.dataset.view)) === 'write studio');
    await seed(pg);
    J.script(W5, [['too high', { say:'The whole song is three semitones lower now, in F# minor.', actions:[{ type:'w_transpose', semitones:-3 }], topic:'songwriting' }], ['drums', { say:'A soft ballad beat is in.', actions:[{ type:'w_drums', feel:'ballad' }], topic:'songwriting' }]]);
    await J.send(pg, 'it is too high for me');
    let up = J.upstream(W5), last = up[up.length - 1], st = J.stateOf(last);
    const sys = typeof last.system === 'string' ? last.system : JSON.stringify(last.system);
    ok('2 the service passes the Studio’s description of the song on, and nothing of Make’s', st.area === 'studio' && st.write && st.write.song.key === 'A minor' && st.write.tracks.length === 1 && st.parts === undefined, JSON.stringify(st).slice(0, 200));
    ok('2 with the Studio’s instructions, and not the decks’ or Make’s', /THE STUDIO/.test(sys) && /w_transpose/.test(sys) && !/dj_load/.test(sys) && !/set_drum/.test(sys), sys.length + ' characters');
    let r = await pg.evaluate(() => ({ p:STUDIO._t.patOf(STUDIO._t.S.tracks[0].regions[0]).notes[0].p, key:STUDIO._t.S.key }));
    ok('2 the reply’s change is made: three semitones lower, F sharp minor', r.p === 73 && r.key.root === 6, JSON.stringify(r));
    const m = await J.msgs(pg);
    ok('2 and listed under the reply with Undo', /3 semitones lower/.test(m[m.length - 1]) && /Undo/.test(m[m.length - 1]), m[m.length - 1].slice(0, 220));
    await J.send(pg, 'add some drums');
    r = await pg.evaluate(() => STUDIO._t.S.tracks.map(t => t.kind).join(','));
    ok('2 a second request: drums are added', r === 'inst,drums', r);
    await w(pg, 1500);
    const usage = await J.admin(B5, 'admin.overview').catch(() => null), us = JSON.stringify(usage || {}), cd = JSON.stringify(await J.admin(B5, 'admin.codes').catch(() => ({})));
    ok('2 the topic songwriting is counted by the service', /songwriting/.test(us) || /songwriting/.test(cd), (us + cd).replace(/.*?(.{60}songwriting.{60}).*/, '$1').slice(0, 200));
    console.log(A.errs.join('\n') || 'no page errors (v34 service)');
    await A.ctx.close();
  }
  // ---------- the v33 service, the v34 page ----------
  {
    const A = await J.open(br, B4, { viewport:{ width:1280, height:800 }, fresh:true, hash:'#write' }); const pg = A.pg;
    await studio(pg); await w(pg, 500);
    ok('3 against the v33 service the Studio opens just the same', (await pg.evaluate(() => document.body.dataset.ws + ' ' + document.body.dataset.view)) === 'write studio');
    await pg.click('#acctgatenew'); await w(pg, 300);
    await pg.fill('#acctname', 'Mara S'); await pg.check('#acctage'); await pg.click('#acctgo'); await w(pg, 1200);
    const code = await pg.evaluate(() => { const e = document.getElementById('acctcode'); return e ? e.textContent : ''; });
    ok('3 a singer can make an account there too: the page tells that service "producer", the role it knows', /^LOOP-/.test(code) && A.posts.some(b => b.op === 'signup' && b.role === 'producer'), JSON.stringify(A.posts.filter(b => b.op === 'signup')));
    await pg.click('#acctdone').catch(() => {}); await w(pg, 300);
    ok('3 and she stays in the Studio', (await pg.evaluate(() => document.body.dataset.ws + ' ' + document.body.dataset.view)) === 'write studio');
    await seed(pg);
    const n0 = J.upstream(W4).length;
    await J.send(pg, 'it is too high for me');
    let r = await pg.evaluate(() => STUDIO._t.patOf(STUDIO._t.S.tracks[0].regions[0]).notes[0].p);
    ok('3 the Studio is never sent to that service: the request is done on the page (two semitones lower)', J.upstream(W4).length === n0 && r === 74, 'upstream calls ' + (J.upstream(W4).length - n0));
    await pg.evaluate(() => window.__flWs.set('make')); await w(pg, 500);
    await J.send(pg, 'faster');
    const up = J.upstream(W4), st = up.length > n0 ? J.stateOf(up[up.length - 1]) : null;
    ok('3 in Make the conversation goes to that service as before, with the Make song', !!st && st.area === 'make' && st.write === undefined && st.tempo !== undefined, st && Object.keys(st).slice(0, 6).join(','));
    console.log(A.errs.join('\n') || 'no page errors (v33 service)');
    await A.ctx.close();
  }
  await br.close(); J.finish([]);
})().catch(e => { console.error(e); process.exit(1); });
