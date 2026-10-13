// Sizes: the desk layout at 1024, 1280 and 1440 wide (as in v34: everything within reach, no page scroll), and tablets:
// upright they get the phone layout with more room, on their side the desk layout with controls a finger can hit.
const L = require('./lib'), P = require('./plib'), { ok } = L;
const FILL = async () => { const T = STUDIO._t; await T.loadManifest(); ['upright-bass', 'grand-piano', 'steel-guitar', 'flute'].forEach(i => { const t = T.addTrack('inst', i, T.ENG.inst[i].name); T.addRegion(t, 0, 7680, [{ s:0, l:480, p:60, v:90 }, { s:960, l:480, p:64, v:90 }]); }); const d = T.addTrack('drums', 'studio-kit', 'Drums'), rg = T.addRegion(d, 0, 7680, []); T.drumPreset(rg, 'pop', 0, false); T.addTrack('audio', '', 'Voice'); T.commit('x'); T.select(T.S.tracks[0].id, T.S.tracks[0].regions[0].id, { open:true }); T.layout(); };
const BAR = () => { const bar = document.querySelector('.st-bar'), st = document.getElementById('studio'), ed = document.querySelector('.st-roll'), tl = document.getElementById('sttl');
  const vis = id => { const e = document.getElementById(id); if(!e) return false; const bx = e.getBoundingClientRect(); return bx.width > 0 && bx.right <= bar.getBoundingClientRect().right + 1; };
  return { w:st.dataset.w, phone:st.dataset.phone, asst:document.body.classList.contains('has-assistant'), barFits:bar.scrollWidth <= bar.clientWidth + 1, need:['stsong', 'stplay', 'strec', 'stpos', 'stloop', 'stclick', 'stcount', 'sttempo', 'sttap', 'stsig', 'stkey', 'stundo', 'stredo', 'stmixer', 'stexport', 'sthelp'].filter(id => !vis(id)), roll:ed.clientHeight, tl:tl.clientHeight, tlw:tl.clientWidth, page:document.documentElement.scrollWidth <= window.innerWidth + 1 && st.getBoundingClientRect().bottom <= window.innerHeight + 1, rows:Math.floor((tl.clientHeight - 62) / 48), touch:document.documentElement.dataset.sttouch || '' }; };
(async () => {
  for(const [w, h] of [[1024, 768], [1280, 800], [1440, 900]]){
    const { b, p, errs } = await L.open({ w, h });
    await p.evaluate(FILL); await p.waitForTimeout(500);
    const r = await p.evaluate(BAR);
    ok(r.phone === 'false' && !r.touch && r.barFits && r.need.length === 0 && r.page, w + '×' + h + (r.asst ? ' with the Assistant docked' : '') + ' (a mouse): the desk layout, every control of the bar on screen, nothing scrolls the page', JSON.stringify(r));
    ok(r.roll >= 150 && r.tl >= 150 && r.tlw >= 420, w + '×' + h + ': room for the timeline (' + r.tlw + '×' + r.tl + ', ' + r.rows + ' tracks without scrolling) and the note editor (' + r.roll + ' high)');
    const none = await p.evaluate(() => ({ sp:[...document.querySelectorAll('#studio > [class^="sp-"]')].filter(e => e.getClientRects().length).length, flag:document.documentElement.dataset.stphone || '', man:!!document.querySelector('link[rel=manifest]'), keeper:!!STUDIO._t.UNL.keeper, res:!!document.getElementById('stresume') && !document.getElementById('stresume').hidden }));
    ok(none.sp === 0 && !none.flag && !none.man && !none.keeper && !none.res, w + '×' + h + ': nothing of the phone layout shows or runs there', JSON.stringify(none));
    await p.screenshot({ path:'shots/size-' + w + '.png' });
    if(errs.length) console.log(errs.join('\n')); ok(errs.length === 0, w + ': no page errors');
    await b.close();
  }
  // a narrow desktop window with a mouse (as before v35 below 700px there was a reduced view; now it is the phone layout, worked by the mouse)
  { const { b, p, errs } = await L.open({ w:640, h:800 }); await p.waitForTimeout(400);
    const r = await p.evaluate(() => ({ phone:STUDIO._t.phoneOn(), scr:STUDIO._t.PH.screen })); ok(r.phone && r.scr === 'home', 'a 640px window with a mouse gets the phone layout too', JSON.stringify(r));
    await p.click('#spnew'); await p.waitForTimeout(300); await p.click('#spway-drums'); await p.waitForSelector('#spfeel'); await p.click('#spfeel .st-b.primary'); await p.waitForTimeout(400);
    const bx = await p.evaluate(() => { const T = STUDIO._t, h = document.getElementById('sttl').getBoundingClientRect(); return { x:h.left + 30, y:h.top + T.ARR.rulerH + T.ARR.secH + T.ARR.chordH + 28 }; });
    await p.mouse.click(bx.x, bx.y); await p.waitForSelector('#sppart', { timeout:4000 }).catch(() => {});
    ok(await p.evaluate(() => !!document.getElementById('sppart')), 'and a click on a part opens its sheet, as a tap does');
    ok(errs.length === 0, 'no page errors (640 with a mouse)', errs.join(' | ')); await b.close(); }
  // tablets
  for(const dev of ['ipad', 'ipadpro']){
    const { b, p, errs } = await P.open({ dev });
    let r = await p.evaluate(() => ({ phone:STUDIO._t.phoneOn(), w:innerWidth, h:innerHeight, scr:STUDIO._t.PH.screen }));
    ok(r.phone && r.scr === 'home', dev + ' upright (' + r.w + '×' + r.h + '): the phone layout');
    let a = await P.audit(p); ok(a.small.length === 0 && a.side, dev + ' upright, Home: 44px, no sideways scroll', a.small.join(' | ')); await p.screenshot({ path:'shots/tab-' + dev + '-home.png' });
    await p.evaluate(async F => { const T = STUDIO._t; await (new Function('return (' + F + ')()'))(); T.S.chords = [{ t:0, root:9, q:'min' }, { t:1920, root:5, q:'maj' }]; T.S.key = { root:9, scale:'minor' }; T.addSection('Verse', 0, 4); T.commit('c'); T.phGo('song'); }, FILL.toString());
    await p.waitForTimeout(700);
    r = await p.evaluate(() => ({ heads:document.querySelector('.st-heads').getBoundingClientRect().width, tl:document.getElementById('sttl').clientWidth, th:document.getElementById('sttl').clientHeight }));
    ok(r.heads >= 150 && r.tl >= 500, dev + ' upright, the song: names ' + Math.round(r.heads) + 'px wide, timeline ' + r.tl + '×' + r.th + 'px');
    a = await P.audit(p); ok(a.small.length === 0 && a.side, dev + ' upright, the song: 44px, no sideways scroll', a.small.join(' | ')); await p.screenshot({ path:'shots/tab-' + dev + '-song.png' });
    await p.evaluate(() => STUDIO._t.phGo('edit', { tab:'notes' })); await p.waitForTimeout(600); await p.screenshot({ path:'shots/tab-' + dev + '-notes.png' });
    await p.evaluate(() => STUDIO._t.phGo('chords')); await p.waitForTimeout(400); a = await P.audit(p); ok(a.small.length === 0 && a.side, dev + ' upright, Chords: 44px, no sideways scroll', a.small.join(' | ')); await p.screenshot({ path:'shots/tab-' + dev + '-chords.png' });
    await p.evaluate(() => STUDIO._t.phGo('mix')); await p.waitForTimeout(400); await p.screenshot({ path:'shots/tab-' + dev + '-mix.png' });
    // turned on its side: the desk layout, the same song and selection, sized for a finger
    await p.evaluate(() => STUDIO._t.phGo('edit', { tab:'notes' })); await p.waitForTimeout(300);
    const vp = p.viewportSize(); await p.setViewportSize({ width:vp.height, height:vp.width }); await p.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); await p.waitForTimeout(1100);
    r = await p.evaluate(BAR); const st = await p.evaluate(() => ({ sel:!!STUDIO._t.UI.sel.region, tab:STUDIO._t.UI.tab, open:STUDIO._t.UI.edOpen, tracks:STUDIO._t.S.tracks.length, bh:document.querySelector('.st-bar .st-b').getBoundingClientRect().height, flag:document.documentElement.dataset.stphone || '' }));
    ok(r.phone === 'false' && !st.flag && r.touch === 'true' && st.sel && st.tab === 'notes' && st.open && st.tracks === 6, dev + ' on its side (' + vp.height + '×' + vp.width + '): the desk layout, with the same part open in the editor', JSON.stringify(st));
    ok(r.barFits && r.need.length === 0 && r.page, dev + ' on its side' + (r.asst ? ', the Assistant docked' : '') + ': every control of the bar is on screen, nothing scrolls the page', JSON.stringify({ need:r.need, w:r.w, fits:r.barFits, page:r.page }));
    ok(st.bh >= 34 && r.roll >= 140 && r.tl >= 140, dev + ' on its side: bar buttons ' + st.bh + 'px high; timeline ' + r.tlw + '×' + r.tl + ', editor ' + r.roll + ' high');
    await p.screenshot({ path:'shots/tab-' + dev + '-landscape.png' });
    // a touch on a note there selects it; the Edit menu has what a keyboard would do
    const q = await p.evaluate(() => { const T = STUDIO._t, R = T.ROLL, f = T.findRegion(T.UI.sel.region), n = T.patOf(f.r).notes[0], bx = R.host.getBoundingClientRect(); return { x:bx.left + R.keysW + n.s * R.ppt - R.host.scrollLeft + 8, y:bx.top + R.rulerH + (127 - n.p + 0.5) * R.rowH - R.host.scrollTop }; });
    await p.touchscreen.tap(q.x, q.y); await p.waitForTimeout(250);
    r = await p.evaluate(() => STUDIO._t.ROLL.sel.length); ok(r === 1, dev + ' on its side: a touch on a note selects it');
    await p.locator('#stedit').tap(); await p.waitForTimeout(200); r = await p.evaluate(() => { const m = document.querySelector('.st-menu'); return m ? { n:m.querySelectorAll('.st-mi').length, h:m.querySelector('.st-mi').getBoundingClientRect().height, in:m.getBoundingClientRect().bottom <= innerHeight } : null; });
    ok(r && r.n >= 15 && r.h >= 40 && r.in, dev + ' on its side: the Edit menu lists what can be done to it, in rows ' + (r ? r.h : 0) + 'px high');
    await p.screenshot({ path:'shots/tab-' + dev + '-landscape-menu.png' });
    await p.setViewportSize(vp); await p.evaluate(() => window.dispatchEvent(new Event('orientationchange'))); await p.waitForTimeout(900);
    r = await p.evaluate(() => ({ phone:STUDIO._t.phoneOn(), scr:STUDIO._t.PH.screen, tracks:STUDIO._t.S.tracks.length })); ok(r.phone && r.tracks === 6 && r.scr === 'edit', dev + ' upright again: the phone layout, on the part that was open', JSON.stringify(r));
    ok(errs.length === 0, dev + ': no page errors', errs.join(' | ')); await b.close();
  }
  L.done([]);
})().catch(e => { console.error(e); process.exit(1); });
