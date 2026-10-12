// the whole first session, through the screen: hum a bass line -> instrument -> drums -> chords -> piano -> melody -> voice -> mixer -> export
const L = require('./lib'), { ok } = L;
const shot = process.argv.includes('--shots');
(async () => {
  const W = +(process.env.W || 1440), H = +(process.env.H || 900), theme = process.env.THEME || 'dark', tag = W + (theme === 'light' ? 'l' : 'd');
  const { b, p, errs } = await L.open({ w:W, h:H, theme });
  const S = n => shot ? p.screenshot({ path:'shots/' + n + '-' + tag + '.png' }) : null;
  await p.waitForTimeout(600);
  ok(await p.isVisible('#ststart-hum'), 'first run: Start a song is shown');
  ok(await p.isVisible('#ststeps'), 'first run: Start here strip');
  await S('01-first-run');
  await p.evaluate(() => STUDIO._t.latLoad().then(() => 0));
  // 1. hum a bass line
  await p.click('#ststart-hum');
  await p.waitForSelector('#stinst');
  await p.waitForFunction(() => document.querySelectorAll('#stinst .st-ibrow').length > 1);
  await S('02-instruments');
  ok(await p.locator('#stinst .st-ibrow').count() >= 2, 'instrument list has recorded and basic basses', await p.locator('#stinst .st-ibrow b').allTextContents().then(a => a.join(', ')));
  await p.click('#stinst [data-pick="upright-bass"]');
  await p.waitForSelector('#sthum');
  await p.waitForFunction(() => /Start:/.test(document.getElementById('sthumgo').textContent), null, { timeout:8000 });
  await S('03-hum-sheet');
  // simulated round trip of 48 ms, known to the app as measured
  const LAT = 0.048;
  await p.evaluate(l => { STUDIO._t.MIC.label = 'test input'; return STUDIO._t.latStore(l); }, LAT);
  const bass = L.tune([[40, 1], [40, 0.5], [43, 0.5], [45, 1], [40, 1], [47, 1.5], [45, 0.5], [43, 1], [40, 1], [45, 1], [45, 1], [43, 1], [40, 1], [38, 2], [40, 2]], 100, { voice:'hum' });
  const idB = await L.prep(p, bass.x, bass.sr);
  await p.click('#sthumgo');
  await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
  const st = await p.evaluate(() => STUDIO._t.HUM.startAt);
  await L.fire(p, idB, st + LAT);
  await p.waitForTimeout(1500); await S('04-recording');
  await p.waitForFunction(() => !STUDIO._t.HUM && STUDIO._t.S.tracks[0] && STUDIO._t.S.tracks[0].regions.length, null, { timeout:30000 });
  await p.waitForTimeout(900);
  const r1 = await p.evaluate(() => { const T = STUDIO._t, r = T.S.tracks[0].regions[0], n = T.patOf(r).notes; return { n:n.length, ps:n.map(x => x.p), ss:n.map(x => x.s), l:r.l, inst:T.S.tracks[0].inst, state:T.ENG.inst['upright-bass'].state }; });
  ok(r1.n === 15, 'hummed bass line: 15 notes heard', r1.n + ' notes');
  ok(r1.ps.join() === [40,40,43,45,40,47,45,43,40,45,45,43,40,38,40].join(), 'hummed pitches are right, in the bass register', r1.ps.join(' '));
  ok(r1.ss.every(s => s % 240 === 0), 'tidy timing: every start on an eighth', r1.ss.join(' '));
  ok(r1.state === 'ready', 'upright bass samples loaded', r1.state);
  await p.waitForTimeout(600);
  await S('05-hummed-take');
  ok(await p.isVisible('.st-humbar'), 'the strip "From your voice" is shown');
  // 2. key suggestion
  const sug = await p.locator('.st-sug').textContent().catch(() => '');
  ok(/sounds like/.test(sug), 'a key is suggested from the humming', sug.slice(0, 60));
  await p.locator('.st-sug .st-b.primary').click();
  await p.waitForTimeout(300);
  // 3. chords: suggest and use
  await p.click('#sttab-chords'); await p.waitForTimeout(200);
  await p.click('#stsuggest'); await p.waitForTimeout(200);
  const alts = await p.locator('.st-chalt .st-chseq').allTextContents();
  ok(alts.length >= 1, 'chords are suggested for the bass line', alts[0]);
  await p.locator('.st-chalt .st-b.primary').first().click(); await p.waitForTimeout(200);
  ok(await p.evaluate(() => STUDIO._t.S.chords.length) >= 2, 'suggested chords are on the song');
  await p.click('#stwritechords'); await p.waitForTimeout(500);
  await S('06-chords');
  const t2 = await p.evaluate(() => { const T = STUDIO._t, t = T.S.tracks[1]; return t ? { name:t.name, inst:t.inst, n:T.patOf(t.regions[0]).notes.length, gen:t.regions[0].gen } : null; });
  ok(t2 && t2.n > 8 && t2.gen, 'a piano plays the chords', JSON.stringify(t2));
  // 4. drums through Start here
  await p.click('#ststep-chords'); await p.waitForSelector('#stinst');
  await p.waitForFunction(() => document.querySelectorAll('#stinst .st-ibrow').length > 1);
  await S('07-kits');
  await p.locator('#stinst .st-ibrow .st-b.primary').first().click(); await p.waitForTimeout(700);
  const dr = await p.evaluate(() => { const T = STUDIO._t, t = T.S.tracks.filter(x => x.kind === 'drums')[0]; return t ? { inst:t.inst, n:T.patOf(t.regions[0]).notes.length, tab:T.UI.tab } : null; });
  ok(dr && dr.n > 10 && dr.tab === 'drums', 'a drum track with a beat', JSON.stringify(dr));
  await p.waitForTimeout(800); await S('08-drums');
  // 5. melody on a new track, with the song playing
  await p.click('#staddtrack'); await p.waitForSelector('#stinst');
  await p.click('#stinst .st-ibfam[data-fam="winds"]'); await p.waitForTimeout(150);
  await p.click('#stinst [data-pick="flute"]'); await p.waitForTimeout(300);
  await p.locator('.st-th[data-kind="inst"] .st-threc').last().click();
  await p.waitForSelector('#sthum'); await p.waitForFunction(() => /Start:/.test(document.getElementById('sthumgo').textContent));
  const mel = L.tune([[64, 1], [67, 1], [69, 2], [67, 1], [64, 1], [62, 2], [60, 1], [62, 1], [64, 2], [62, 1], [60, 1], [57, 2]], 100, { voice:'ah', style:'legato', vib:{ rate:5.5, cents:30, delay:0.15 } });
  const idM = await L.prep(p, mel.x, mel.sr);
  await p.click('#sthumgo');
  await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
  const st2 = await p.evaluate(() => STUDIO._t.HUM.startAt);
  await L.fire(p, idM, st2 + LAT);
  await p.waitForFunction(() => !STUDIO._t.HUM && STUDIO._t.S.tracks.filter(t => t.inst === 'flute')[0].regions.length, null, { timeout:30000 });
  await p.waitForTimeout(800);
  const r2 = await p.evaluate(() => { const T = STUDIO._t, t = T.S.tracks.filter(t => t.inst === 'flute')[0], n = T.patOf(t.regions[0]).notes; return { ps:n.map(x => x.p % 12), lo:Math.min(...n.map(x => x.p)), n:n.length }; });
  ok(r2.n === 12 && r2.ps.join() === [4,7,9,7,4,2,0,2,4,2,0,9].join(), 'hummed melody with vibrato over the playing song: right notes', JSON.stringify(r2));
  ok(r2.lo >= 58, 'the melody is put in the flute’s range', 'lowest ' + r2.lo);
  // 6. sections
  await p.click('#staddsec'); await p.waitForTimeout(150);
  await S('09-arrangement');
  // 7. voice
  await p.click('#ststep-sing'); await p.waitForSelector('#strecsheet');
  await p.waitForFunction(() => /Record from/.test(document.getElementById('strecgo').textContent));
  await S('10-record-sheet');
  const vox = L.tune([[64, 2], [67, 2], [69, 4], [67, 2], [64, 2], [62, 4]], 100, { voice:'ah', style:'legato' });
  const idV = await L.prep(p, vox.x, vox.sr);
  await p.click('#strecgo');
  await p.waitForFunction(() => STUDIO._t.AREC && STUDIO._t.AREC.startAt);
  const st3 = await p.evaluate(() => STUDIO._t.AREC.startAt);
  await L.fire(p, idV, st3 + LAT);
  await p.waitForTimeout(6500);
  await p.click('#strecstop');
  await p.waitForFunction(() => !STUDIO._t.AREC && STUDIO._t.S.tracks.some(t => t.kind === 'audio' && t.regions.length), null, { timeout:15000 });
  await p.waitForTimeout(700);
  ok(await p.evaluate(() => STUDIO._t.UI.tab) === 'take', 'the take is shown in the Recording editor');
  await S('11-voice-take');
  ok(!(await p.isVisible('#ststeps')), 'Start here is gone once all four steps are done');
  // 8. mixer, lyrics, export
  await p.click('#stmixer'); await p.waitForTimeout(300); await S('12-mixer');
  ok(await p.locator('.st-strip').count() === 6, 'mixer: five tracks and the master', String(await p.locator('.st-strip').count()));
  await p.click('#sttab-lyrics'); await p.waitForTimeout(200);
  await p.locator('.st-lytext').first().fill('Walking home in the rain\nI hear the bass line in my head'); await p.locator('.st-lytext').first().blur();
  await S('13-lyrics');
  await p.click('#sttab-notes'); await p.evaluate(() => { const T = STUDIO._t, t = T.S.tracks[1]; T.select(t.id, t.regions[0].id, { open:true }); T.showTab('notes'); }); await p.waitForTimeout(500); await S('14-notes-piano');
  await p.click('#stexport'); await p.waitForSelector('#stexportsheet'); await S('15-export');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout:60000 }), p.click('#stexwav')]);
  const path = await dl.path(), fs = require('fs'), wav = fs.readFileSync(path);
  ok(wav.slice(0, 4).toString() === 'RIFF' && wav.length > 500000, 'WAV of the whole song saved', (wav.length / 1e6).toFixed(1) + ' MB ' + dl.suggestedFilename());
  await p.waitForTimeout(300);
  ok(/Saved the song as a WAV/.test(await p.textContent('#stexstatus')), 'export says what it saved', await p.textContent('#stexstatus'));
  await p.keyboard.press('Escape');
  // play it
  await p.click('#ststart'); await p.click('#stplay'); await p.waitForTimeout(2500);
  const lv = await p.evaluate(() => STUDIO._t.levels());
  ok(lv.master > 0.02, 'the song plays (master level)', lv.master.toFixed(3));
  await S('16-playing');
  await p.click('#stplay');
  // reload: the song is still there
  await p.waitForTimeout(1200);
  await p.reload(); await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S && STUDIO._t.S.tracks.length === 5, null, { timeout:15000 });
  ok(true, 'after a reload the song with its five tracks is open');
  await p.waitForTimeout(800); await S('17-reloaded');
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
