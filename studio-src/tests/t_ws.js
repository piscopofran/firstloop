// the Songwriter workspace among the others: nothing of the Studio runs until it is opened; switching; Produce and DJ as they were
const L = require('./lib'), { ok } = L;
const fs = require('fs'), zlib = require('zlib');
(async () => {
  // ---- 1. a visit that never opens the Studio ----
  {
    const reqs = [];
    const { b, p, errs, ctx } = await L.open({ hash:'', noMic:true, port:8734 });
    p.on('request', r => reqs.push(r.url()));
    await p.waitForTimeout(1200);
    const skip = await p.$('#greetskip'); if(skip && await skip.isVisible().catch(() => false)) await skip.click();
    let r = await p.evaluate(async () => ({ view:document.body.dataset.view, ws:document.body.dataset.ws, made:window.__flStudio.made(), dom:!!document.getElementById('studio'), dbs:(await indexedDB.databases()).map(d => d.name), tab:!!document.querySelector('.viewtab[data-view="studio"]'), tabShown:!!document.querySelector('.viewtab[data-view="studio"]').getClientRects().length, ctxs:window.STUDIO === undefined }));
    ok('a plain visit opens Make as before: the Studio has not been made, has no element on the page, and no database', r.view === 'make' && r.made === false && !r.dom && r.dbs.indexOf('firstloop-studio') < 0 && r.ctxs, JSON.stringify(r));
    ok('its tab exists but is not shown outside the Songwriter workspace', r.tab && !r.tabShown);
    await p.click('#play'); await p.waitForTimeout(900);
    r = await p.evaluate(() => ({ playing:document.getElementById('play').dataset.playing, made:window.__flStudio.made() }));
    ok('Make plays; still nothing of the Studio', r.playing === 'true' && !r.made, JSON.stringify(r));
    await p.click('#play');
    for(const v of ['mix', 'learn', 'songs', 'dj', 'make']){ await p.click('.viewtab[data-view="' + v + '"]'); await p.waitForTimeout(v === 'dj' ? 900 : 250); }
    r = await p.evaluate(() => ({ made:window.__flStudio.made(), view:document.body.dataset.view }));
    ok('Mix, Learn, My songs, DJ and back: the Studio is still not made, and nothing was fetched for it', !r.made && r.view === 'make' && !reqs.some(u => /sounds\/|jsdelivr|githubusercontent/.test(u)), reqs.filter(u => /sounds|jsdelivr/.test(u)).join(' '));
    // Find knows the Studio only where it belongs
    await p.keyboard.press('Control+k'); await p.keyboard.type('hum a part'); await p.waitForTimeout(300);
    let found = await p.evaluate(() => Array.from(document.querySelectorAll('.pal-row, [role="option"]')).map(e => e.textContent).join(' | '));
    ok('Find, with Everything on show, lists “Hum a part”', /Hum a part/.test(found), found.slice(0, 700));
    await p.keyboard.press('Escape');
    // the Workspace menu
    await p.keyboard.press('Control+k'); await p.keyboard.type('songwriter'); await p.waitForTimeout(300); await p.keyboard.press('Enter'); await p.waitForTimeout(900);
    r = await p.evaluate(() => ({ view:document.body.dataset.view, ws:document.body.dataset.ws, made:window.__flStudio.made(), dom:!!document.getElementById('studio'), tabs:Array.from(document.querySelectorAll('.viewtab')).filter(e => e.getClientRects().length).map(e => e.textContent).join(','), play:!!document.getElementById('play').getClientRects().length, wsbtn:document.querySelector('.wsbtn').textContent }));
    ok('“Workspace: Songwriter” in Find opens the Studio: now it is made', r.ws === 'write' && r.view === 'studio' && r.made && r.dom, JSON.stringify(r));
    ok('the top bar shows the Studio tab only (and the Assistant’s on a narrow screen), not Produce’s transport; the Workspace button says Songwriter', /^Studio(,Assistant)?$/.test(r.tabs) && !r.play && /Songwriter/.test(r.wsbtn), r.tabs + ' | ' + r.wsbtn);
    await p.waitForFunction(() => window.STUDIO && STUDIO._t.S);
    // the Studio plays; Space is its own
    await p.evaluate(async () => { const T = STUDIO._t; const t = T.addTrack('drums', 'basic:kit', 'D'), rg = T.addRegion(t, 0, 7680, []); T.drumPreset(rg, 'pop', 0, false); T.commit('x'); await T.ensureEngine(); await T.loadInst('basic:kit'); });
    await p.locator('#sttl').click({ position:{ x:300, y:200 } }); await p.keyboard.press('Space'); await p.waitForTimeout(700);
    r = await p.evaluate(() => ({ st:STUDIO.playing(), make:document.getElementById('play').dataset.playing }));
    ok('Space plays the Studio’s song, not Make’s', r.st === true && r.make === 'false', JSON.stringify(r));
    // switching away stops it and shows the other side whole
    await p.click('.wsbtn'); await p.click('#wspick-dj'); await p.waitForTimeout(900);
    r = await p.evaluate(() => ({ st:STUDIO.playing(), view:document.body.dataset.view, ws:document.body.dataset.ws, studioShown:!!document.getElementById('studio').getClientRects().length, dj:!!document.getElementById('dj').getClientRects().length }));
    ok('Workspace → DJ: the Studio stops and is not shown; the decks are', r.st === false && r.view === 'dj' && !r.studioShown && r.dj, JSON.stringify(r));
    await p.click('.wsbtn'); await p.click('#wspick-make'); await p.waitForTimeout(500);
    r = await p.evaluate(() => ({ view:document.body.dataset.view, tabs:Array.from(document.querySelectorAll('.viewtab')).filter(e => e.getClientRects().length).map(e => e.textContent).join(','), play:!!document.getElementById('play').getClientRects().length }));
    ok('Workspace → Produce: Make, Mix, Learn, My songs and their transport, no Studio tab', r.view === 'make' && /^Make,Mix,Learn,My songs(,Assistant)?$/.test(r.tabs) && r.play, r.tabs);
    await p.click('.wsbtn'); await p.click('#wspick-write'); await p.waitForTimeout(500);
    r = await p.evaluate(() => ({ view:document.body.dataset.view, n:STUDIO._t.S.tracks.length }));
    ok('and back to Songwriter: the same song is there', r.view === 'studio' && r.n === 1, JSON.stringify(r));
    // Make starting to play (from Find's "Go to Make" then play) stops the Studio
    await p.keyboard.press('Space'); await p.waitForTimeout(400);
    await p.evaluate(() => window.__flWs.set('all')); await p.waitForTimeout(400);
    r = await p.evaluate(() => ({ st:STUDIO.playing(), view:document.body.dataset.view, tabShown:!!document.querySelector('.viewtab[data-view="studio"]').getClientRects().length }));
    ok('Workspace → Everything leaves the Studio (it has a workspace of its own), stopped', r.st === false && r.view === 'make' && !r.tabShown, JSON.stringify(r));
    // the app's backup carries the Studio's songs
    r = await p.evaluate(async () => { const fn = (typeof makeBackup === 'function') ? makeBackup : null; return fn ? 'global' : 'closed'; });
    await p.click('.viewtab[data-view="songs"]'); await p.waitForTimeout(300);
    const btn = await p.$('#backupbtn, #backupsave, button[data-backup]') || await p.evaluateHandle(() => Array.from(document.querySelectorAll('button')).filter(b => /back ?up/i.test(b.textContent) && b.getClientRects().length)[0]);
    let got = null;
    try { const [dl] = await Promise.all([p.waitForEvent('download', { timeout:15000 }), btn.asElement().click()]); got = JSON.parse(fs.readFileSync(await dl.path(), 'utf8')); } catch(e){ got = { err:String(e).slice(0, 120) }; }
    ok('Backup, in My songs, carries the Studio’s songs with the rest', got && got.app === 'firstloop' && got.studio && got.studio.songs.length >= 1 && Array.isArray(got.songs), got && (got.err || Object.keys(got).join(',')));
    console.log(errs.join('\n') || 'no page errors'); await b.close();
  }
  // ---- 2. links ----
  for(const [hash, ws, view] of [['#write', 'write', 'studio'], ['#dj', 'dj', 'dj'], ['#produce', 'make', 'make'], ['#everything', 'all', 'make']]){
    const { b, p, errs } = await L.open({ hash, noMic:true }); await p.waitForTimeout(900);
    const r = await p.evaluate(() => ({ ws:document.body.dataset.ws, view:document.body.dataset.view, made:window.__flStudio.made(), hash:location.hash }));
    ok('the link /' + hash + ' opens the ' + ws + ' workspace' + (hash === '#write' ? ' and the Studio' : '; the Studio is not made'), r.ws === ws && r.view === view && r.made === (hash === '#write') && r.hash === '' && !errs.length, JSON.stringify(r) + errs.join(';'));
    if(hash === '#write'){ await p.reload(); await p.waitForTimeout(900); const r2 = await p.evaluate(() => document.body.dataset.ws + ' ' + document.body.dataset.view); ok('and the choice is remembered on the next visit', r2 === 'write studio', r2); }
    await b.close();
  }
  // ---- 3. what the Studio costs a visit that does not use it ----
  const cur = fs.readFileSync('/home/claude/firstloop/.claude/worktrees/agent-a0680cd705dd88210/index.html'), old = fs.readFileSync('wwwb/v33.html');
  const gz = x => zlib.gzipSync(x, { level:9 }).length;
  console.log('bytes: v33 ' + old.length + ' (' + gz(old) + ' gzipped); now ' + cur.length + ' (' + gz(cur) + ' gzipped); added ' + (cur.length - old.length) + ' (' + (gz(cur) - gz(old)) + ' gzipped)');
  async function loadCost(port, file){
    const { chromium } = require('/home/claude/fltests/node_modules/playwright');
    const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium' }); const ts = [], heap = [];
    for(let i = 0; i < 7; i++){ const ctx = await b.newContext(); const p = await ctx.newPage(); await p.route('**/*', r => /localhost/.test(r.request().url()) ? r.continue() : r.abort()); await p.goto('http://localhost:' + port + '/' + file + '?fltest=1'); await p.waitForFunction(() => document.body.dataset.view); await p.waitForTimeout(300);
      const m = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { dcl:n.domContentLoadedEventEnd - n.responseEnd, heap:performance.memory ? performance.memory.usedJSHeapSize : 0 }; }); ts.push(m.dcl); heap.push(m.heap); await ctx.close(); }
    await b.close(); ts.sort((x, y) => x - y); heap.sort((x, y) => x - y); return { ms:ts[3], heap:heap[3] };
  }
  const c0 = await loadCost(8735, 'v33.html'), c1 = await loadCost(8735, 'index.html');
  console.log('load (response received to DOMContentLoaded, median of 7): v33 ' + c0.ms.toFixed(0) + ' ms, now ' + c1.ms.toFixed(0) + ' ms; JS heap after load: v33 ' + (c0.heap / 1e6).toFixed(1) + ' MB, now ' + (c1.heap / 1e6).toFixed(1) + ' MB');
  ok('a visit that does not open the Studio pays for parsing its text only: within 60 ms and 2.5 MB of v33 on this machine', c1.ms - c0.ms < 60 && c1.heap - c0.heap < 2.5e6, (c1.ms - c0.ms).toFixed(0) + ' ms, ' + ((c1.heap - c0.heap) / 1e6).toFixed(2) + ' MB');
  L.done([]);
})().catch(e => { console.error(e); process.exit(1); });
