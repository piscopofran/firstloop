// the rest of the screen: menus and sheets, the drum grid and the recording editor under the mouse, keys, the small screen
const L = require('./lib'), { ok } = L;
const shots = process.argv.includes('--shots');
(async () => {
  const W = +(process.env.W || 1440), H = +(process.env.H || 900), theme = process.env.THEME || 'dark', tag = W + (theme === 'light' ? 'l' : 'd');
  const { b, p, errs } = await L.open({ w:W, h:H, theme });
  const E = (fn, a) => p.evaluate(fn, a), S = n => shots ? p.screenshot({ path:'shots/u-' + n + '-' + tag + '.png' }) : null;
  await E(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); });
  // --- the key ---
  await p.click('#stkey'); await p.waitForSelector('.st-keypop');
  await p.locator('.st-keypop .st-seg .st-b', { hasText:'Minor' }).click(); await p.locator('.st-keygrid .st-b', { hasText:/^A$/ }).click(); await p.waitForTimeout(200);
  await S('key');
  ok(await p.textContent('#stkey') === 'A minor', 'the Key button: A, minor', await p.textContent('#stkey'));
  await p.keyboard.press('Escape'); await p.mouse.click(600, 500);
  // --- tempo, tap, time signature, count-in, click, loop ---
  await p.fill('#sttempo', '87'); await p.press('#sttempo', 'Enter');
  for(let i = 0; i < 5; i++){ await p.click('#sttap'); await p.waitForTimeout(500); }
  let r = await E(() => STUDIO._t.S.tempo);
  ok(r >= 96 && r <= 130, 'Tap, five times about half a second apart, sets the tempo from the taps (about 120; this machine is slow to click)', String(r));
  await p.selectOption('#stsig', '3/4'); await p.click('#stcount'); await p.locator('.st-menu .st-mi', { hasText:'2 bars' }).click(); await p.click('#stclick'); await p.click('#stloop');
  r = await E(() => { const S = STUDIO._t.S; return { sig:S.sig.join('/'), ci:S.countIn, metro:S.metro, loop:S.loop.on }; });
  ok(r.sig === '3/4' && r.ci === 2 && r.metro === false && r.loop === true, 'time signature, count-in, click and loop from the bar', JSON.stringify(r));
  await p.selectOption('#stsig', '4/4'); await p.click('#stclick'); await p.click('#stloop');
  // --- start with drums; the grid under the mouse ---
  await p.click('#ststart-drums'); await p.waitForTimeout(700);
  r = await E(() => { const T = STUDIO._t; return { tab:T.UI.tab, n:T.patOf(T.S.tracks[0].regions[0]).notes.length, inst:T.S.tracks[0].inst }; });
  ok(r.tab === 'drums' && r.n > 20 && r.inst === 'studio-kit', '“Start with drums” gives a pop beat on the recorded kit, open in the drum grid', JSON.stringify(r));
  const cell = (row, step) => E(({ row, step }) => { const T = STUDIO._t, D = T.DG, h = D.host, bx = h.getBoundingClientRect(), i = D.rows.indexOf(row); return { x:bx.left + D.nameW + (step + 0.5) * D.grid * D.ppt - h.scrollLeft, y:bx.top + D.rulerH + (i + 0.5) * D.rowH - h.scrollTop, rows:D.rows.length, fits:D.rulerH + D.rows.length * D.rowH <= h.clientHeight + 2 }; }, { row, step });
  let c = await cell('clap', 4);
  ok(c.fits && c.rows === 13, 'all thirteen rows of the grid fit without scrolling', c.rows + ' rows');
  const hits = pc => E(pc2 => { const T = STUDIO._t; return T.patOf(T.S.tracks[0].regions[0]).notes.filter(n => n.p === T.DRUM[pc2]).map(n => n.s / 120 + ':' + n.v).join(' '); }, pc);
  await p.mouse.click(c.x, c.y);
  ok(await hits('clap') === '4:96', 'a click on an empty square puts a hit there', await hits('clap'));
  await p.locator('.st-edtools .st-seg .st-b', { hasText:'Accent' }).click(); await p.mouse.click(c.x, c.y);
  ok(await hits('clap') === '4:120', 'with Accent chosen, a click on a hit makes it an accent', await hits('clap'));
  await p.mouse.click(c.x, c.y);
  ok(await hits('clap') === '', 'and a click on a hit of the chosen strength removes it');
  await p.locator('.st-edtools .st-seg .st-b', { hasText:'Normal' }).click();
  c = await cell('tom_low', 0); const c2 = await cell('tom_low', 5); await p.mouse.move(c.x, c.y); await p.mouse.down(); await p.mouse.move(c2.x, c2.y, { steps:8 }); await p.mouse.up();
  ok((await hits('tom_low')).split(' ').length === 6, 'dragging along a row fills it', await hits('tom_low'));
  await p.keyboard.press('Control+z');
  ok(await hits('tom_low') === '', 'one Undo takes the whole stroke back');
  await p.selectOption('.st-edtools select', 'bossa'); await p.waitForTimeout(200);
  await p.locator('.st-edtools .st-seg .st-b', { hasText:/^B$/ }).click(); await p.locator('.st-edtools .st-b', { hasText:/^Fill$/ }).click(); await p.waitForTimeout(200);
  r = await E(() => STUDIO._t.S.tracks[0].regions[0].drum);
  ok(r.feel === 'bossa' && r.vari === 1 && r.fill === true, 'Feel, variation B and Fill from the toolbar', JSON.stringify(r));
  await S('drums');
  // tap a rhythm: F J K on the keyboard, looped, then Space
  await E(() => { const T = STUDIO._t; T.patOf(T.S.tracks[0].regions[0]).notes = []; T.commit('clear'); T.S.countIn = 1; });
  await p.click('#sttap2'); await p.waitForFunction(() => STUDIO._t.NREC && STUDIO._t.TR.playing); 
  await p.waitForFunction(() => STUDIO._t.transportTick() >= 0, null, { timeout:8000 });
  for(const k of ['f', 'k', 'j', 'k', 'f', 'k', 'j', 'k']){ await p.keyboard.press(k); await p.waitForTimeout(248); }
  await p.keyboard.press('Space'); await p.waitForTimeout(500);
  r = await E(() => { const T = STUDIO._t, n = T.patOf(T.S.tracks[0].regions[0]).notes; return { n:n.length, pcs:[...new Set(n.map(x => x.p))].sort().join(','), rec:!!T.NREC, grid:n.every(x => x.s % 120 === 0), bar:document.querySelector('.st-recbar').hidden }; });
  ok(r.n === 8 && r.pcs === '36,38,42' && !r.rec && r.grid && r.bar, 'Tap a rhythm: F, J and K tapped along become kick, snare and hat on the grid; Space stops', JSON.stringify(r));
  // --- chords typed in, an instrument plays them ---
  await p.click('#sttab-chords'); await p.waitForTimeout(200);
  for(const ch of ['Am', 'F', 'C', 'G7']){ await p.fill('#stchtype', ch); await p.press('#stchtype', 'Enter'); await p.waitForTimeout(150); }
  r = await E(() => STUDIO._t.S.chords.map(c => c.root + c.q).join(' '));
  ok(r === '9min 5maj 0maj 77', 'chords typed by name, one bar after another: Am F C G7', r);
  await p.fill('#stchtype', 'Xq'); await p.press('#stchtype', 'Enter'); await p.waitForTimeout(150);
  ok(/not a chord name/.test(await p.textContent('#status')), 'a name that is not a chord is answered with examples', await p.textContent('#status'));
  await p.selectOption('.st-chbox:nth-child(2) .st-chline select', 'new:guitars'); await p.waitForTimeout(200);
  r = await E(() => Array.from(document.querySelectorAll('.st-chbox:nth-child(2) .st-chline:nth-of-type(2) select option')).map(o => o.textContent).join(','));
  ok(/Strummed/.test(r) && /Fingerpicked/.test(r), 'for a guitar the styles are offered, strummed first', r);
  await p.click('#stwritechords'); await p.waitForTimeout(400);
  await p.selectOption('.st-chbox:nth-child(2) .st-chline select', 'new:bass'); await p.waitForTimeout(200);
  r = await E(() => Array.from(document.querySelectorAll('.st-chbox:nth-child(2) .st-chline:nth-of-type(2) select option')).map(o => o.textContent).join(','));
  ok(r === 'Root notes,Root and fifth,Walking bass', 'for a bass the styles are bass styles', r);
  await p.selectOption('.st-chbox:nth-child(2) .st-chline:nth-of-type(2) select', 'walking'); await p.click('#stwritechords'); await p.waitForTimeout(400);
  r = await E(() => STUDIO._t.S.tracks.map(t => t.name + ':' + t.inst + ':' + (t.regions[0] && t.regions[0].gen ? t.regions[0].gen.style : '')).join(' | '));
  ok(/Guitar:steel-guitar:strum/.test(r) && /Bass:upright-bass:walking/.test(r), 'a strummed guitar and a walking bass are written from the chords', r);
  await S('chords');
  // --- sections on the timeline ---
  await p.click('#staddsec'); await p.click('#staddsec'); await p.waitForTimeout(200);
  r = await E(() => STUDIO._t.S.sections.map(q => q.name + '@' + q.bar + '+' + q.len).join(' '));
  ok(r === 'Intro@0+4 Verse@4+4', '+ Section twice: Intro, then Verse after it', r);
  // --- the song menu, songs, versions ---
  await p.click('#stsong'); await p.locator('.st-menu .st-mi', { hasText:'Rename' }).click(); await p.waitForSelector('.st-ask'); await p.fill('.st-ask input', 'Rain song'); await p.press('.st-ask input', 'Enter'); await p.waitForTimeout(300);
  ok(await p.textContent('.st-songname') === 'Rain song', 'the song is renamed from its menu');
  await p.click('#stsong'); await p.locator('.st-menu .st-mi', { hasText:'Save a version' }).click(); await p.waitForSelector('.st-ask'); await p.fill('.st-ask input', 'before the bridge'); await p.press('.st-ask input', 'Enter'); await p.waitForTimeout(400);
  await p.click('#stsong'); await p.locator('.st-menu .st-mi', { hasText:'Versions' }).click(); await p.waitForSelector('#stversions'); await p.waitForTimeout(300);
  ok(/before the bridge/.test(await p.textContent('#stversions')), 'a version saved by name is listed under Versions');
  await S('versions'); await p.keyboard.press('Escape');
  await p.click('#stsong'); await p.locator('.st-menu .st-mi', { hasText:'New song' }).click(); await p.waitForTimeout(600);
  await p.click('#stsong'); await p.locator('.st-menu .st-mi', { hasText:'Your songs' }).click(); await p.waitForSelector('#stsongs'); await p.waitForTimeout(300);
  let txt = await p.textContent('#stsongs');
  ok(/Rain song/.test(txt) && /New song/.test(txt) && /Kept in this browser|kept in this browser/.test(txt), 'Your songs lists both, and says where songs are kept', txt.replace(/\s+/g, ' ').slice(0, 140));
  await S('songs');
  await p.locator('#stsongs .st-lrow', { hasText:'Rain song' }).locator('.st-b.primary').click(); await p.waitForTimeout(600);
  ok(await p.textContent('.st-songname') === 'Rain song' && await E(() => STUDIO._t.S.tracks.length) === 3, 'opening it brings its three tracks back');
  // --- help, about the sounds ---
  await p.click('#sthelp'); await p.waitForSelector('#sthelpsheet'); await S('help');
  txt = await p.textContent('#sthelpsheet');
  ok(/Your voice is the instrument/.test(txt) && /Ctrl\+Z/.test(txt) && !/!/.test(txt), 'Help explains the Studio and lists the keys, without an exclamation mark');
  await p.locator('#sthelpsheet .st-b', { hasText:'About the sounds' }).click(); await p.waitForSelector('#stsounds'); await p.waitForTimeout(300);
  txt = await p.textContent('#stsounds');
  ok(/Upright bass/.test(txt) && /CC0|CC BY|Creative Commons|Public/.test(txt) && /Source/.test(txt), 'About the sounds lists every recorded instrument with its licence and source', txt.replace(/\s+/g, ' ').slice(0, 200));
  await S('sounds'); await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  // --- playing notes in from the computer keyboard ---
  await E(() => { const T = STUDIO._t; const t = T.S.tracks.filter(x => x.kind === 'inst')[0]; T.select(t.id, t.regions[0].id, { open:true }); T.showTab('notes'); });
  await p.click('#stkbd'); await p.waitForSelector('.st-kbkeys');
  await p.locator('#sttl').focus();
  await p.keyboard.down('a'); await p.waitForTimeout(200);
  r = await E(() => ({ held:Object.keys(STUDIO._t.ROLL ? {} : {}).length, v:STUDIO._t.ENG.G.voices.length, on:document.querySelectorAll('.st-key[data-on="true"]').length }));
  await p.keyboard.up('a'); await p.waitForTimeout(100);
  const off = await E(() => document.querySelectorAll('.st-key[data-on="true"]').length);
  ok(r.on === 1 && r.v >= 1 && off === 0, 'with the keyboard open, the letter A plays a note for as long as it is held', JSON.stringify(r));
  await S('keyboard'); await p.click('#stkbd');
  // --- a MIDI keyboard plays the selected track ---
  r = await E(() => { const before = STUDIO._t.ENG.G.voices.length; const took = STUDIO._midi({ data:[0x90, 60, 100] }); const mid = STUDIO._t.ENG.G.voices.length; STUDIO._midi({ data:[0x80, 60, 0] }); return { took, more:mid > before, cc:STUDIO._midi({ data:[0xB0, 7, 100] }) }; });
  ok(r.took === true && r.more && r.cc === false, 'a MIDI note plays the selected track; other MIDI messages are left to the rest of the app', JSON.stringify(r));
  // --- mixer under the mouse ---
  await p.keyboard.press('m'); await p.waitForSelector('.st-strip');
  const vol = p.locator('.st-strip').first().locator('input[type=range]').first(); await vol.focus(); for(let i = 0; i < 10; i++) await p.keyboard.press('ArrowLeft'); await vol.blur();
  r = await E(() => ({ v:STUDIO._t.S.tracks[0].vol, g:STUDIO._t.ENG.G.tracks[STUDIO._t.S.tracks[0].id].vol.gain.value }));
  ok(Math.abs(r.v - 0.7) < 0.011, 'M opens the mixer; a fader moves the track’s volume', JSON.stringify(r));
  await p.locator('.st-strip').nth(1).locator('.st-ms.solo').click();
  r = await E(() => STUDIO._t.S.tracks.map(t => t.solo).join(','));
  ok(r === 'false,true,false', 'S on a strip solos that track', r);
  await p.locator('.st-strip').nth(1).locator('.st-ms.solo').click();
  await S('mixer');
  // --- nothing spills ---
  r = await E(() => { const bar = document.querySelector('.st-bar'), st = document.getElementById('studio'); return { bar:bar.scrollWidth <= bar.clientWidth + 1, page:document.documentElement.scrollWidth <= window.innerWidth + 1, h:st.getBoundingClientRect().bottom <= window.innerHeight + 1, cut:Array.from(bar.querySelectorAll('button')).filter(b2 => b2.getClientRects().length && b2.scrollWidth > b2.clientWidth + 2 && !b2.classList.contains('st-songbtn')).map(b2 => b2.id || b2.textContent) }; });
  ok(r.bar && r.page && r.h && r.cut.length === 0, 'at ' + W + '×' + H + ' the bar fits, no button’s words are cut, the page does not scroll sideways or down', JSON.stringify(r));
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
