// a phone (390 wide, touch): hum, pick the instrument, listen; and 1024x768: everything still within reach
const L = require('./lib'), { ok } = L;
(async () => {
  {
    const { b, p, errs } = await L.open({ w:390, h:800, touch:true, dpr:2 });
    const E = (fn, a) => p.evaluate(fn, a);
    await p.waitForTimeout(600);
    let r = await E(() => ({ phone:document.getElementById('studio').dataset.phone, panel:!!document.getElementById('stphone').getClientRects().length, main:!!document.querySelector('.st-main').getClientRects().length, side:document.documentElement.scrollWidth <= window.innerWidth + 1, txt:document.getElementById('stphone').innerText }));
    ok(r.phone === 'true' && r.panel && !r.main && r.side, 'on a phone the Studio shows its small view: no timeline, no sideways scroll', JSON.stringify({ phone:r.phone, side:r.side }));
    ok(/need a larger screen/.test(r.txt) && /Hum a part/.test(r.txt) && /Play/.test(r.txt), 'it says what a phone is for here, and that arranging needs a larger screen', r.txt.replace(/\n+/g, ' | ').slice(0, 220));
    await p.screenshot({ path:'shots/phone-1.png' });
    await E(() => { STUDIO._t.MIC.label = 'test input'; return STUDIO._t.latLoad().then(() => STUDIO._t.latStore(0.04)); });
    await p.tap('#stphhum'); await p.waitForSelector('#stinst'); await p.waitForFunction(() => document.querySelectorAll('#stinst .st-ibrow').length > 1);
    r = await E(() => { const s = document.querySelector('#stinst'), bx = s.getBoundingClientRect(); return { fits:bx.left >= 0 && bx.right <= window.innerWidth + 1 && bx.bottom <= window.innerHeight + 1, side:document.documentElement.scrollWidth <= window.innerWidth + 1, rows:document.querySelectorAll('#stinst .st-ibrow').length }; });
    ok(r.fits && r.side && r.rows >= 2, 'the instrument list fits the phone', JSON.stringify(r));
    await p.screenshot({ path:'shots/phone-2-instruments.png' });
    await p.tap('#stinst [data-pick="electric-bass"]'); await p.waitForSelector('#sthum'); await p.waitForFunction(() => /Start:/.test(document.getElementById('sthumgo').textContent));
    r = await E(() => { const s = document.querySelector('#sthum'), bx = s.getBoundingClientRect(), go = document.getElementById('sthumgo').getBoundingClientRect(); return { fits:bx.left >= 0 && bx.right <= window.innerWidth + 1, go:go.bottom <= window.innerHeight + 1 || s.querySelector('.st-sheet-body').scrollHeight > s.querySelector('.st-sheet-body').clientHeight }; });
    ok(r.fits && r.go, 'the Hum sheet fits; Start is within reach', JSON.stringify(r));
    await p.screenshot({ path:'shots/phone-3-hum.png' });
    const bass = L.tune([[40, 1], [43, 1], [45, 2], [43, 1], [40, 1], [38, 2], [40, 1], [43, 1], [45, 1], [47, 1], [45, 2], [40, 2]], 100, { voice:'hum' }), id = await L.prep(p, bass.x, bass.sr);
    await p.tap('#sthumgo'); await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
    await L.fire(p, id, (await E(() => STUDIO._t.HUM.startAt)) + 0.04);
    await p.waitForTimeout(1200); await p.screenshot({ path:'shots/phone-4-recording.png' });
    r = await E(() => { const bar = document.querySelector('.st-recbar'), bx = bar.getBoundingClientRect(); return { shown:!bar.hidden, in:bx.top >= 0 && bx.bottom <= window.innerHeight, stop:!!document.getElementById('strecstop').getClientRects().length }; });
    ok(r.shown && r.in && r.stop, 'while it records the count, the level and Stop are on screen', JSON.stringify(r));
    await p.waitForFunction(() => !STUDIO._t.HUM && STUDIO._t.S.tracks[0] && STUDIO._t.S.tracks[0].regions.length, null, { timeout:30000 }); await p.waitForTimeout(1500);
    r = await E(() => { const T = STUDIO._t; return { n:T.patOf(T.S.tracks[0].regions[0]).notes.length, rows:document.querySelectorAll('#stphone .st-lrow').length, txt:document.getElementById('stphone').innerText.replace(/\n+/g, ' | ') }; });
    ok(r.n === 12 && r.rows === 1 && /Electric bass/.test(r.txt) && /Hum another part/.test(r.txt), 'the hummed part is there: twelve notes on the electric bass, listed with its instrument', r.txt.slice(0, 200));
    await p.screenshot({ path:'shots/phone-5-after.png' });
    await E(() => { STUDIO._t.transportStop(); }); await p.tap('#stphplay'); await p.waitForTimeout(1200);
    r = await E(() => ({ pl:STUDIO.playing(), lv:STUDIO._t.levels().master, label:document.getElementById('stphplay').textContent }));
    ok(r.pl && r.lv > 0.01 && /Stop/.test(r.label), 'Play plays it, and the button turns to Stop', JSON.stringify(r));
    await p.tap('#stphplay');
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout:20000 }), p.locator('#stphone .st-b', { hasText:'Save as a song file' }).tap()]);
    ok(/\.flsong$/.test(dl.suggestedFilename()), 'the song can be saved as a file to carry on at a computer', dl.suggestedFilename());
    r = await E(() => ({ side:document.documentElement.scrollWidth <= window.innerWidth + 1 }));
    ok(r.side, 'still no sideways scroll'); console.log(errs.join('\n') || 'no page errors (phone)');
    await b.close();
  }
  for(const [w, h] of [[1024, 768], [1280, 800], [1440, 900]]){
    const { b, p, errs } = await L.open({ w, h });
    await p.evaluate(async () => { const T = STUDIO._t; await T.loadManifest(); ['upright-bass', 'grand-piano', 'steel-guitar', 'flute'].forEach(i => { const t = T.addTrack('inst', i, T.ENG.inst[i].name); T.addRegion(t, 0, 7680, [{ s:0, l:480, p:60, v:90 }]); }); const d = T.addTrack('drums', 'studio-kit', 'Drums'), rg = T.addRegion(d, 0, 7680, []); T.drumPreset(rg, 'pop', 0, false); T.addTrack('audio', '', 'Voice'); T.commit('x'); T.select(T.S.tracks[0].id, T.S.tracks[0].regions[0].id, { open:true }); T.layout(); });
    await p.waitForTimeout(500);
    const r = await p.evaluate(() => { const bar = document.querySelector('.st-bar'), st = document.getElementById('studio'), ed = document.querySelector('.st-roll'), tl = document.getElementById('sttl'), heads = document.querySelector('.st-headscroll');
      const vis = id => { const e = document.getElementById(id); if(!e) return false; const bx = e.getBoundingClientRect(); return bx.width > 0 && bx.right <= bar.getBoundingClientRect().right + 1; };
      return { w:st.dataset.w, asst:document.body.classList.contains('has-assistant'), barFits:bar.scrollWidth <= bar.clientWidth + 1, need:['stsong', 'stplay', 'strec', 'stpos', 'stloop', 'stclick', 'stcount', 'sttempo', 'sttap', 'stsig', 'stkey', 'stundo', 'stredo', 'stmixer', 'stexport', 'sthelp'].filter(id => !vis(id)), roll:ed.clientHeight, tl:tl.clientHeight, tlw:tl.clientWidth, page:document.documentElement.scrollWidth <= window.innerWidth + 1 && st.getBoundingClientRect().bottom <= window.innerHeight + 1, rows:Math.floor((tl.clientHeight - 62) / 48) }; });
    ok(r.barFits && r.need.length === 0 && r.page, w + '×' + h + (r.asst ? ' with the Assistant docked' : '') + ': every control of the bar is on screen, nothing scrolls the page', JSON.stringify(r));
    ok(r.roll >= 150 && r.tl >= 150 && r.tlw >= 420, w + '×' + h + ': room for the timeline (' + r.tlw + '×' + r.tl + ', ' + r.rows + ' tracks without scrolling) and the note editor (' + r.roll + ' high)');
    await p.screenshot({ path:'shots/size-' + w + '.png' });
    if(errs.length) console.log(errs.join('\n'));
    await b.close();
  }
  L.done([]);
})().catch(e => { console.error(e); process.exit(1); });
