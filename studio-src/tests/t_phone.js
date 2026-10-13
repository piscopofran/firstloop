// The phone, end to end and by touch: start a song, hum a bass line, keep it, give it the upright bass, add a piano that
// follows suggested chords, drums by feel, a voice take, the mix, sharing, and the song intact after a reload.
// node t_phone.js [ip13|se|px7|ip13l|ipad] [light] ; every screen is checked for 44px targets and sideways scroll, and photographed.
const P = require('./plib'), { ok } = P;
const dev = process.argv[2] || 'ip13', theme = process.argv[3] === 'light' ? 'light' : 'dark', tag = dev + (theme === 'light' ? '-light' : '');
(async () => {
  const { b, p, errs, ctx } = await P.open({ dev, theme });
  const E = (fn, a) => p.evaluate(fn, a), shot = n => p.screenshot({ path:'shots/ph-' + tag + '-' + n + '.png' });
  const tap = s => P.tap(p, s), wait = ms => p.waitForTimeout(ms);
  const screen = async name => { const a = await P.audit(p); ok(a.small.length === 0 && a.side && a.unnamed.length === 0, name + ': every control is 44px or more, has a name, and nothing scrolls sideways', a.n + ' controls' + (a.small.length ? '; small: ' + a.small.slice(0, 6).join(' | ') : '') + (a.unnamed.length ? '; unnamed: ' + a.unnamed.slice(0, 4).join(' | ') : '') + (a.side ? '' : '; sideways scroll')); await shot(name); };

  let r = await E(() => ({ phone:STUDIO._t.phoneOn(), scr:document.getElementById('studio').dataset.screen, dock:!!document.querySelector('.dock').getClientRects().length, ws:document.body.dataset.ws, view:document.body.dataset.view, txt:document.getElementById('sphome').innerText }));
  ok(r.phone && r.scr === 'home' && !r.dock && r.ws === 'write' && r.view === 'studio', '/#write on a phone lands in the Songwriter workspace, on the Studio’s own Home, with the page’s header out of the way', JSON.stringify({ scr:r.scr, ws:r.ws }));
  ok(/Start a song/.test(r.txt) && /Your songs/.test(r.txt) && /Bring in a song file/.test(r.txt) && /Storage/.test(r.txt) && /Account/.test(r.txt) && /Feedback/.test(r.txt) && /Workspace/.test(r.txt) && /Phone check/.test(r.txt) && !/larger screen/.test(r.txt), 'Home has Start a song, the songs, bringing a song file in, storage used, Account, Feedback, Workspace and the phone check');
  await screen('01-home');

  // ---- hum a bass line ----
  await tap('#spnew'); await wait(400);
  r = await E(() => ({ scr:document.getElementById('studio').dataset.screen, start:!document.getElementById('spstart').hidden }));
  ok(r.scr === 'song' && r.start, 'Start a song opens the song with its four ways in');
  await screen('02-start');
  await tap('#spway-hum'); await p.waitForSelector('#stinst [data-pick="electric-bass"]'); await wait(300);
  await screen('03-instruments');
  await tap('#stinst [data-pick="electric-bass"]'); await p.waitForSelector('#spcap:not([hidden])'); await p.waitForFunction(() => /Start:/.test((document.getElementById('spcapgo') || {}).textContent || ''), null, { timeout:8000 });
  r = await E(() => ({ txt:document.getElementById('spcap').innerText, full:document.getElementById('spcap').getBoundingClientRect().height >= window.innerHeight - 2, st:document.getElementById('spmicstate').textContent }));
  ok(r.full && /Hum a part/.test(r.txt) && /Length/.test(r.txt) && /Until I stop/.test(r.txt) && /Headphones with a wire/.test(r.txt) && /Check timing/.test(r.txt), 'humming has a screen of its own: length (also “Until I stop”), what she listens on, the level, the timing check', r.st);
  await screen('04-hum-setup');
  await E(() => STUDIO._t.latLoad().then(() => STUDIO._t.latStore(0.04)));
  const bass = P.tune([[40, 1], [43, 1], [45, 2], [43, 1], [40, 1], [38, 2], [40, 1], [43, 1], [45, 1], [47, 1], [45, 2], [40, 2]], 100, { voice:'hum' }), id = await P.prep(p, bass.x, bass.sr);
  await tap('#spcapgo'); await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
  await wait(250);
  r = await E(() => ({ big:document.getElementById('spcount').textContent, state:document.getElementById('spcap').dataset.state, pips:document.querySelectorAll('#spcap .sp-pips i').length, wake:STUDIO._t.WAKE.want }));
  ok(r.state === 'count' && /^[1-4]$/.test(r.big) && r.pips === 4 && r.wake, 'the count-in is on the screen in large numbers, and the screen is asked to stay on', JSON.stringify(r));
  await shot('05-count');
  await P.fire(p, id, (await E(() => STUDIO._t.HUM.startAt)) + 0.04);
  await p.waitForFunction(() => document.getElementById('spcap').dataset.state === 'rec', null, { timeout:8000 }); await wait(2600);
  r = await E(() => { const C = STUDIO._t.PH.cap; return { big:document.getElementById('spcount').textContent, st:document.getElementById('spmicstate').textContent, trace:C.trace.filter(x => x.m > 0).length, lo:Math.min(...C.trace.filter(x => x.m > 0).map(x => Math.round(x.m))), hi:Math.max(...C.trace.filter(x => x.m > 0).map(x => Math.round(x.m))), stop:!!document.getElementById('spcapstop').getClientRects().length }; });
  ok(/^Bar [1-4]$/.test(r.big) && /Listening/.test(r.st) && r.trace >= 15 && r.lo >= 38 && r.hi <= 47 && r.stop, 'while she hums: the bar, “Listening”, Stop, and a live line of her pitch (E2 to B2 here)', JSON.stringify(r));
  await screen('06-humming');
  await p.waitForFunction(() => !STUDIO._t.PH.cap && STUDIO._t.PH.res, null, { timeout:40000 }); await wait(900);
  r = await E(() => { const T = STUDIO._t, f = T.findRegion(T.PH.res); return { n:T.patOf(f.r).notes.length, scr:T.PH.screen, tab:T.UI.tab, panel:!document.getElementById('sphum').hidden, txt:document.getElementById('sphum').innerText.replace(/\n+/g, ' | '), roll:document.getElementById('stroll').clientHeight, contour:!!(T.takeCache[f.r.hum.take] && T.takeCache[f.r.hum.take].an.contour.length) }; });
  ok(r.n === 12 && r.scr === 'edit' && r.tab === 'notes' && r.panel && r.contour && r.roll >= 120, 'the result: twelve notes over the line of her voice (' + r.roll + 'px of grid)', r.txt.slice(0, 80));
  ok(/My voice/.test(r.txt) && /Notes/.test(r.txt) && /Both/.test(r.txt) && /As hummed/.test(r.txt) && /Half way/.test(r.txt) && /Tidy/.test(r.txt) && /Strict/.test(r.txt) && /Fit to key/.test(r.txt) && /Octave/.test(r.txt) && /Hum it again/.test(r.txt) && /Keep/.test(r.txt), 'with Hear (My voice, Notes, Both), Timing (four ways), Pitch, Octave, Hum it again and Keep');
  ok(/sounds like [A-G]/.test(r.txt), 'and the key it sounds like is offered', (r.txt.match(/This sounds like[^|]*/) || [''])[0]);
  await screen('07-result');
  await p.locator('#sptiming .st-b', { hasText:'Strict' }).tap(); await wait(500);
  r = await E(() => { const T = STUDIO._t, f = T.findRegion(T.PH.res); return { t:f.r.hum.timing, all:T.patOf(f.r).notes.every(n => n.s % 120 === 0) }; });
  ok(r.t === 'strict' && r.all, 'Timing: Strict writes the notes again from the same take, on the grid');
  await p.locator('#spsug .st-b.primary').tap(); await wait(400);
  await p.locator('#sphear .st-b', { hasText:'Both' }).tap(); await wait(900);
  r = await E(() => ({ key:STUDIO._t.S.key, aud:STUDIO._t.audition && STUDIO._t.audition.mode, lv:STUDIO._t.levels().master }));
  ok(r.key.root !== null && r.aud === 'both' && r.lv > 0.005, 'the suggested key is taken with one tap; Hear: Both plays her voice with the notes', JSON.stringify(r));
  await tap('#spkeep'); await wait(600);
  r = await E(() => ({ scr:STUDIO._t.PH.screen, heads:[...document.querySelectorAll('.sp-thb')].map(x => x.innerText.replace(/\n/g, ' / ')), tl:document.getElementById('sttl').clientWidth }));
  ok(r.scr === 'song' && r.heads.length === 1 && /Electric bass/.test(r.heads[0]) && r.tl >= 180, 'Keep goes back to the song: the track is a row with its part on the timeline', r.heads[0] + ', timeline ' + r.tl + 'px');
  await screen('08-song');

  // ---- the track's sheet: the upright bass ----
  await tap('.sp-thb'); await p.waitForSelector('#sptrack'); await wait(250);
  r = await E(() => document.getElementById('sptrack').innerText.replace(/\n+/g, ' | '));
  ok(/Hum another part/.test(r) && /Edit the notes/.test(r) && /Instrument/.test(r) && /Level/.test(r) && /Mute/.test(r) && /Solo/.test(r) && /Delete track/.test(r), 'a tap on the track opens its sheet: instrument, level, mute and solo, hum, edit the notes, delete');
  await screen('09-track-sheet');
  await tap('#sptrinst'); await p.waitForSelector('#stinst [data-pick="upright-bass"]'); await tap('#stinst [data-pick="upright-bass"]'); await wait(700);
  await p.waitForFunction(() => STUDIO._t.ENG.inst['upright-bass'].state === 'ready', null, { timeout:20000 });
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[0]; return { inst:t.inst, lo:Math.min(...T.patOf(t.regions[0]).notes.map(n => n.p)), n:T.patOf(t.regions[0]).notes.length, mono:T.ENG.inst['upright-bass'].zones.every(z => z.buf.numberOfChannels === 1) }; });
  ok(r.inst === 'upright-bass' && r.n === 12 && r.mono, 'the upright bass plays the hummed part', JSON.stringify(r));

  // ---- chords: suggested for the bass line, then a piano that follows them ----
  await tap('#spnav-chords'); await wait(400);
  r = await E(() => ({ scr:STUDIO._t.PH.screen, bars:document.querySelectorAll('.sp-chbar').length, chords:[...document.querySelectorAll('#spchpal .sp-chgrid .st-chord b')].map(x => x.textContent) }));
  ok(r.scr === 'chords' && r.bars >= 8 && r.chords.length >= 7, 'Chords: bars to tap, and the chords of the key as large buttons', r.chords.join(' '));
  await screen('10-chords');
  await E(() => { STUDIO._t.TEST.noAsstSuggest = true; });
  await tap('#spsuggest'); await p.waitForSelector('.sp-alt'); await wait(200);
  r = await E(() => [...document.querySelectorAll('.sp-altseq')].map(x => x.textContent));
  ok(r.length >= 1 && /[A-G]/.test(r[0]), 'Suggest gives chords for the bass line she hummed', r[0]);
  await p.locator('.sp-alt [data-use="0"]').tap(); await wait(400);
  await p.locator('.sp-chbar[data-bar="1"]').tap(); await wait(200);
  const before = await E(() => JSON.stringify(STUDIO._t.S.chords));
  await p.locator('#spchpal .sp-chgrid .st-chord').nth(3).tap(); await wait(300);
  r = await E(() => ({ ch:STUDIO._t.S.chords.length, bar:STUDIO._t.CH.bar, js:JSON.stringify(STUDIO._t.S.chords) }));
  ok(r.ch >= 2 && r.js !== before && r.bar === 2, 'a bar is tapped, a chord button sets its chord and moves on to the next bar', r.ch + ' chords');
  await tap('#spchplay'); await p.waitForSelector('#spfollow'); await wait(200);
  await screen('11-follow');
  await p.locator('#spfollow .st-b', { hasText:'Arpeggio' }).tap(); await wait(150);
  await p.locator('#spfollow .st-b.primary').tap(); await wait(800);
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[1]; return { n:T.S.tracks.length, inst:t && t.inst, gen:t && t.regions[0] && t.regions[0].gen, notes:t && T.patOf(t.regions[0]).notes.length, scr:T.PH.screen }; });
  ok(r.n === 2 && /piano/.test(r.inst) && r.gen && r.gen.style === 'arp' && r.notes > 20 && r.scr === 'song', 'a piano track follows the chords as an arpeggio', JSON.stringify(r));

  // ---- drums by feel ----
  await tap('#staddtrack'); await p.waitForSelector('#spaddsheet'); await wait(200);
  r = await E(() => document.getElementById('spaddsheet').innerText.replace(/\n+/g, ' | '));
  ok(/Hum a part/.test(r) && /Follow the chords/.test(r) && /Drums by feel/.test(r) && /Record my voice/.test(r), 'Add track offers what the desktop does: hum a part, follow the chords, drums by feel, your voice');
  await screen('12-add-track');
  await tap('#spadd-drums'); await p.waitForSelector('#spfeel'); await wait(300);
  await p.locator('#spfeel [data-feel="soul"]').tap(); await wait(250);
  const n0 = await E(() => STUDIO._t.patOf(STUDIO._t.S.tracks[2].regions[0]).notes.length);
  await p.locator('#spfeel .st-b', { hasText:'Busier' }).tap(); await wait(250);
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[2]; return { kind:t.kind, feel:t.regions[0].drum.feel, n:T.patOf(t.regions[0]).notes.length }; });
  ok(r.kind === 'drums' && r.feel === 'soul' && r.n > n0, 'Drums by feel: Soul, then Busier', n0 + ' → ' + r.n + ' hits');
  await screen('13-feel');
  await p.locator('#spfeel .st-b', { hasText:'Edit the hits' }).tap(); await wait(700);
  r = await E(() => ({ scr:STUDIO._t.PH.screen, tab:STUDIO._t.UI.tab, rowH:STUDIO._t.DG.rowH, cell:STUDIO._t.DG.grid * STUDIO._t.DG.ppt }));
  ok(r.scr === 'edit' && r.tab === 'drums' && r.rowH >= 34 && r.cell >= 28, 'the drum grid has cells a finger can hit', Math.round(r.cell) + 'x' + r.rowH + 'px');
  await wait(400); await E(() => { const D = STUDIO._t.DG, row = D.rows.indexOf('clap'); D.host.scrollTop = Math.max(0, (row + 1) * D.rowH + D.rulerH - D.host.clientHeight); }); await wait(300);
  const cellAt = await E(() => { const T = STUDIO._t, D = T.DG, bx = D.host.getBoundingClientRect(), row = D.rows.indexOf('clap'); D.host.scrollTop = Math.max(0, (row + 1) * D.rowH + D.rulerH - D.host.clientHeight); return { x:bx.left + D.nameW + 2.5 * D.grid * D.ppt, y:bx.top + D.rulerH + (row + 0.5) * D.rowH - D.host.scrollTop }; });
  await wait(150);
  const hits0 = await E(() => STUDIO._t.patOf(STUDIO._t.S.tracks[2].regions[0]).notes.filter(n => n.p === 39).length);
  await p.touchscreen.tap(cellAt.x, cellAt.y); await wait(250);
  r = await E(() => STUDIO._t.patOf(STUDIO._t.S.tracks[2].regions[0]).notes.filter(n => n.p === 39).map(n => n.s));
  ok(r.length === hits0 + 1 && r.indexOf(240) >= 0, 'a tap on the grid puts a hit there (a clap on the third sixteenth)', JSON.stringify(r) + ' at ' + JSON.stringify(cellAt) + ' ' + JSON.stringify(await E(() => { const D = STUDIO._t.DG; return { st:D.host.scrollTop, ch:D.host.clientHeight, sh:D.host.scrollHeight, rowH:D.rowH, rows:D.rows.length, ruler:D.rulerH, top:D.host.getBoundingClientRect().top }; })));
  await screen('14-drum-grid');
  await tap('#spback'); await wait(400);

  // ---- a voice take ----
  await tap('#staddtrack'); await p.waitForSelector('#spaddsheet'); await tap('#spadd-voice'); await p.waitForSelector('#spcap:not([hidden])');
  await p.waitForFunction(() => /Record from bar/.test((document.getElementById('spcapgo') || {}).textContent || ''), null, { timeout:8000 });
  await screen('15-voice-setup');
  const mel = P.tune([[64, 2], [67, 2], [69, 4], [67, 2], [64, 2], [62, 4]], 100, { voice:'ah' }), vid = await P.prep(p, mel.x, mel.sr);
  await tap('#spcapgo'); await p.waitForFunction(() => STUDIO._t.AREC && STUDIO._t.AREC.startAt);
  await P.fire(p, vid, (await E(() => STUDIO._t.AREC.startAt)) + 0.04, 0.7);
  await p.waitForFunction(() => document.getElementById('spcap').dataset.state === 'rec', null, { timeout:8000 }); await wait(3200);
  r = await E(() => ({ big:document.getElementById('spcount').textContent, lv:STUDIO._t.PH.cap.trace.length, pl:STUDIO.playing() }));
  ok(/^0:0[2-4]/.test(r.big) && r.lv > 20 && r.pl, 'recording a voice: the song plays, the time runs, the level is drawn', JSON.stringify(r));
  await screen('16-voice-rec');
  await wait(6500); await tap('#spcapstop');
  await p.waitForFunction(() => !STUDIO._t.PH.cap && STUDIO._t.PH.screen === 'edit', null, { timeout:15000 }); await wait(600);
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[3], rg = t.regions[0]; return { kind:t.kind, takes:rg.takes.length, secs:T.tickSec(rg.l), tab:T.UI.tab, tools:document.querySelector('.sp-tools').innerText.replace(/\n+/g, ' | ') }; });
  ok(r.kind === 'audio' && r.takes === 1 && r.secs > 8 && r.tab === 'take' && /Take 1/.test(r.tools) && /Level/.test(r.tools) && /Record again/.test(r.tools), 'the take is on a voice track and open, with its takes, its level and Record again', JSON.stringify(r));
  await screen('17-take');
  // trim the end with the grip
  const grip = await E(() => { const T = STUDIO._t, f = T.findRegion(T.UI.sel.region), bx = T.TK.host.getBoundingClientRect(), t0 = f.r.s - Math.round(26 / T.TK.ppt); return { x:bx.left + (f.r.s + f.r.l - t0) * T.TK.ppt - T.TK.host.scrollLeft - 6, y:bx.top + bx.height / 2, l:f.r.l, ppt:T.TK.ppt }; });
  const cdp = await ctx.newCDPSession(p);
  const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints:pts.map((q, i) => ({ x:q[0], y:q[1], id:i })) });
  await touch('touchStart', [[grip.x, grip.y]]); for(let i = 1; i <= 6; i++){ await touch('touchMove', [[grip.x - i * 10, grip.y]]); await wait(20); } await touch('touchEnd', []); await wait(300);
  r = await E(() => STUDIO._t.findRegion(STUDIO._t.UI.sel.region).r.l);
  ok(r < grip.l - 40 / grip.ppt, 'dragging the grip at its end trims the recording', Math.round(grip.l) + ' → ' + Math.round(r) + ' ticks');
  await tap('#sptool-takes'); await p.waitForSelector('#sptakes'); await wait(200); await screen('18-takes');
  await p.locator('#sptakes header .st-b').tap(); await wait(200);
  await tap('#spback'); await wait(400);
  await screen('19-song-full');
  r = await E(() => ({ heads:[...document.querySelectorAll('.sp-thb')].map(x => x.innerText.split('\n')[0]), h:document.getElementById('sttl').clientHeight }));
  ok(r.heads.length === 4, 'four tracks as rows: ' + r.heads.join(', '), 'timeline ' + r.h + 'px high');

  // ---- play, undo, the transport ----
  await tap('#sppos'); await tap('#spplay'); await wait(1500);
  r = await E(() => ({ pl:STUDIO.playing(), lv:STUDIO._t.levels().master, pos:document.querySelector('#sppos b').textContent, label:document.getElementById('spplay').getAttribute('aria-label') }));
  ok(r.pl && r.lv > 0.01 && r.pos !== '1.1.1' && r.label === 'Stop', 'Play at the bottom plays the song; the position runs', JSON.stringify(r));
  await tap('#spplay'); await wait(200);
  r = await E(() => ({ u:!document.getElementById('spundo').disabled, v:!!document.getElementById('spundo').getClientRects().length, a:!!document.getElementById('spasst').getClientRects().length }));
  ok(r.u && r.v && r.a, 'Undo, Redo and the Assistant are on the song’s screen all the time');

  // ---- mix ----
  await tap('#spnav-mix'); await wait(400);
  r = await E(() => ({ cards:document.querySelectorAll('.sp-mixcard').length, sl:[...document.querySelectorAll('.sp-mixcard:first-child .sp-slider input')].map(x => x.getBoundingClientRect().height), txt:document.querySelector('.sp-mixcard').innerText.replace(/\n+/g, ' | ') }));
  ok(r.cards === 5 && r.sl.length >= 3 && r.sl.every(h => h >= 44) && /Level/.test(r.txt) && /Left or right/.test(r.txt) && /Room/.test(r.txt), 'Mix: a card a track with level, left or right and room as large sliders, and the whole song’s level', r.sl.join(','));
  await E(() => { const i = document.querySelector('.sp-mixcard:nth-child(2) .sp-slider input'); i.value = 55; i.dispatchEvent(new Event('input', { bubbles:true })); i.dispatchEvent(new Event('change', { bubbles:true })); });
  r = await E(() => STUDIO._t.S.tracks[1].vol);
  ok(Math.abs(r - 0.55) < 0.01, 'a slider sets the track’s level');
  await screen('20-mix');

  // ---- lyrics ----
  await tap('#spnav-lyrics'); await wait(400);
  await p.locator('.st-lytext').first().tap(); await p.keyboard.type('Hold on to the morning'); await wait(100);
  r = await E(() => ({ fs:parseFloat(getComputedStyle(document.querySelector('.st-lytext')).fontSize), ly:STUDIO._t.S.lyrics._all }));
  ok(r.fs >= 16 && r.ly === 'Hold on to the morning', 'Lyrics: typed at 16px, so the phone does not zoom in');
  await E(() => document.activeElement.blur()); await screen('21-lyrics');

  // ---- share ----
  await tap('#spnav-share'); await p.waitForSelector('#spshare'); await wait(200);
  await screen('22-share');
  await tap('#spmake-wav'); await p.waitForSelector('#spsave-wav', { timeout:60000 });
  r = await E(() => ({ st:document.getElementById('spshstatus').textContent, send:!!document.getElementById('spsend-wav') }));
  ok(/Ready: .*\.wav, [\d.]+ MB/.test(r.st), 'the song is made into a WAV first, then handed over on a second tap', r.st + (r.send ? ' (share sheet offered)' : ' (no share sheet in this browser: Save)'));
  let [dl] = await Promise.all([p.waitForEvent('download', { timeout:20000 }), tap('#spsave-wav')]);
  ok(/\.wav$/.test(dl.suggestedFilename()), 'Save to this phone downloads it', dl.suggestedFilename());
  await tap('#spmake-song'); await p.waitForSelector('#spsave-song', { timeout:60000 });
  [dl] = await Promise.all([p.waitForEvent('download', { timeout:20000 }), tap('#spsave-song')]);
  const songPath = await dl.path();
  ok(/\.flsong$/.test(dl.suggestedFilename()), 'the song file too', dl.suggestedFilename());
  r = await E(() => ({ txt:document.getElementById('spshare').innerText, more:!!document.getElementById('spshmore') }));
  ok(/Songs live in this browser only/.test(r.txt) && r.more, 'the sheet says plainly that the song file is how a song moves between devices; MIDI and stems are under More');
  await screen('23-share-ready');
  await p.locator('#spshare header .st-b').tap(); await wait(300);

  // ---- reload: the song is intact ----
  await E(() => STUDIO._t.saveNow()); await p.reload();
  await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S && STUDIO._t.PH.built, null, { timeout:15000 }); await wait(700);
  r = await E(() => ({ scr:STUDIO._t.PH.screen, txt:document.getElementById('sphome').innerText.replace(/\n+/g, ' | ').slice(0, 260), cont:!!document.getElementById('spcontinue') }));
  ok(r.scr === 'home' && r.cont && /4 tracks/.test(r.txt), 'after a reload the song is on Home', r.txt.slice(0, 150));
  await screen('24-home-again');
  await tap('#spcontinue'); await wait(700);
  r = await E(() => { const T = STUDIO._t, s = T.S; return { tr:s.tracks.map(t => t.kind + ':' + t.inst + ':' + t.regions.length), bass:T.patOf(s.tracks[0].regions[0]).notes.length, chords:s.chords.length, vol:s.tracks[1].vol, ly:s.lyrics._all, key:s.key.root !== null, take:s.tracks[3].regions[0].takes.length }; });
  ok(r.tr.length === 4 && r.bass === 12 && r.chords >= 2 && Math.abs(r.vol - 0.55) < 0.01 && r.ly === 'Hold on to the morning' && r.key && r.take === 1, 'opened again, everything is there: the bass, the chords, the piano, the drums, the take, the mix, the words', JSON.stringify(r).slice(0, 200));
  await tap('#spplay'); await wait(1600);
  r = await E(() => { const L2 = STUDIO._t.levels(); return { m:L2.master, v:L2.tracks[STUDIO._t.S.tracks[3].id] }; });
  ok(r.m > 0.01 && r.v > 0.002, 'and it plays, the recorded voice with it', JSON.stringify(r));
  await tap('#spplay');
  // the same song file, opened as on another device (a clean browser)
  const c2 = await b.newContext(Object.assign({}, P.devices[P.DEV[dev]], {})); const p2 = await c2.newPage();
  await p2.goto('http://localhost:8734/index.html?fltest=1#write'); await p2.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S && STUDIO._t.PH.built);
  const [fc] = await Promise.all([p2.waitForEvent('filechooser'), p2.locator('#spimport').tap()]);
  await fc.setFiles(songPath); await p2.waitForFunction(() => STUDIO._t.S.tracks.length === 4, null, { timeout:20000 });
  r = await p2.evaluate(() => STUDIO._t.dbAll('audio').then(a => ({ tr:STUDIO._t.S.tracks.length, audio:a.length, name:STUDIO._t.S.name })));
  ok(r.tr === 4 && r.audio === 2, 'the song file opens in another browser with its recordings: this is how a song gets from the phone to the laptop', JSON.stringify(r));
  await c2.close();
  r = await E(() => ({ side:document.documentElement.scrollWidth <= window.innerWidth + 1 }));
  ok(r.side, 'no sideways scroll at the end');
  P.done(errs); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
