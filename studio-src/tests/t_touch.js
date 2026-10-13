// Notes by touch on a phone: tap to select, the action bar, tap to add, drag with the loupe, the selecting box, two fingers
// to move and to zoom, undo and redo; then the same part with the phone on its side, and back.
// node t_touch.js [ip13|se|px7]
const P = require('./plib'), { ok } = P;
const dev = process.argv[2] || 'ip13';
(async () => {
  const { b, p, errs, ctx, d } = await P.open({ dev });
  const E = (fn, a) => p.evaluate(fn, a), wait = ms => p.waitForTimeout(ms), shot = n => p.screenshot({ path:'shots/tc-' + dev + '-' + n + '.png' });
  const cdp = await ctx.newCDPSession(p);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints:pts.map((q, i) => ({ x:q[0], y:q[1], id:i })) });
  // a song with a bass part of eight notes over two bars
  await E(async () => { const T = STUDIO._t; await T.loadManifest(); const t = T.addTrack('inst', 'basic:bass', 'Bass'); const ns = [40, 43, 45, 43, 40, 38, 40, 45].map((pp, i) => ({ s:i * 480, l:360, p:pp, v:90 })); const r = T.addRegion(t, 0, 3840, ns); T.S.key = { root:4, scale:'minor' }; T.commit('x'); T.select(t.id, r.id); T.phGo('edit', { tab:'notes' }); });
  await wait(700);
  const at = (i, dx, dy) => E(({ i, dx, dy }) => { const T = STUDIO._t, R = T.ROLL, f = T.findRegion(T.UI.sel.region), n = T.patOf(f.r).notes[i], bx = R.host.getBoundingClientRect(); return { x:bx.left + R.keysW + n.s * R.ppt - R.host.scrollLeft + (dx === undefined ? Math.min(14, n.l * R.ppt / 2) : dx), y:bx.top + R.rulerH + (127 - n.p + 0.5) * R.rowH - R.host.scrollTop + (dy || 0) }; }, { i, dx, dy });
  const notes = () => E(() => { const T = STUDIO._t; return T.patOf(T.findRegion(T.UI.sel.region).r).notes.map(n => [n.s, n.l, n.p]); });
  const selN = () => E(() => STUDIO._t.ROLL.sel.length);
  let r = await E(() => { const R = STUDIO._t.ROLL; return { rowH:R.rowH, ppt:R.ppt, keysW:R.keysW, velH:R.velH, w:R.host.clientWidth, h:R.host.clientHeight, bar:!document.getElementById('spnotebar').hidden }; });
  ok(r.rowH >= 16 && r.ppt >= 0.1 && r.velH === 0 && !r.bar, 'the note grid on a phone: rows ' + r.rowH + 'px high, an eighth note ' + Math.round(240 * r.ppt) + 'px wide, ' + r.w + 'x' + r.h + 'px of grid');
  // tap a note
  let q = await at(1); await p.touchscreen.tap(q.x, q.y); await wait(250);
  r = await E(() => ({ sel:STUDIO._t.ROLL.sel.length, bar:!document.getElementById('spnotebar').hidden, btns:[...document.querySelectorAll('#spnotebar .sp-nb')].map(x => x.textContent), h:document.querySelector('#spnotebar .sp-nb').getBoundingClientRect().height }));
  ok(r.sel === 1 && r.bar && r.btns.join() === 'Up,Down,Earlier,Later,Hear,Shorter,Longer,Split,Delete,More' && r.h >= 44, 'a tap on a note selects it and brings up the bar: ' + r.btns.join(', '));
  let a = await P.audit(p); ok(a.small.length === 0 && a.side, 'with the bar up, every control is 44px or more', a.small.join(' | ')); await shot('1-selected');
  const n0 = await notes();
  await P.tap(p, '#spnb-up'); await P.tap(p, '#spnb-later'); await P.tap(p, '#spnb-longer'); await wait(200);
  let n1 = await notes();
  ok(n1[1][2] === n0[1][2] + 1 && n1[1][0] > n0[1][0] && n1[1][1] > n0[1][1] && await selN() === 1, 'Up, Later and Longer move the selected note a step each and keep it selected', JSON.stringify(n0[1]) + ' → ' + JSON.stringify(n1[1]));
  await P.tap(p, '#spnb-down'); await P.tap(p, '#spnb-earlier'); await P.tap(p, '#spnb-shorter'); await wait(150);
  n1 = await notes(); ok(JSON.stringify(n1[1]) === JSON.stringify(n0[1]), 'Down, Earlier and Shorter bring it back');
  await P.tap(p, '#spnb-split'); await wait(150); n1 = await notes(); ok(n1.length === 9, 'Split makes two notes of it');
  await P.tap(p, '#spundo'); await wait(200); n1 = await notes(); ok(n1.length === 8, 'Undo, at the top, takes that back');
  await P.tap(p, '#spredo'); await wait(200); await P.tap(p, '#spundo'); await wait(200);
  q = await at(1); await p.touchscreen.tap(q.x, q.y); await wait(200);
  await P.tap(p, '#spnb-hear'); await wait(400); r = await E(() => STUDIO._t.levels().master); ok(r > 0.003, 'Hear plays the selected note', r.toFixed(3));
  await P.tap(p, '#spnb-delete'); await wait(200); n1 = await notes(); ok(n1.length === 7 && await selN() === 0, 'Delete removes it, and the bar goes');
  await P.tap(p, '#spundo'); await wait(200);
  // tap empty grid: a note
  q = await E(() => { const T = STUDIO._t, R = T.ROLL, bx = R.host.getBoundingClientRect(); return { x:bx.left + R.keysW + 1.0 * 480 * R.ppt - R.host.scrollLeft + 5, y:bx.top + R.rulerH + (127 - 47 + 0.5) * R.rowH - R.host.scrollTop }; });
  await p.touchscreen.tap(q.x, q.y); await wait(250);
  n1 = await notes(); r = n1.filter(n => n[2] === 47);
  ok(n1.length === 9 && r.length === 1 && r[0][0] === 480 && await selN() === 1, 'a tap on empty grid adds a note there, on the grid, and selects it', JSON.stringify(r[0]));
  await P.tap(p, '#spundo'); await wait(200);
  // drag a note: it follows the finger, with the loupe
  q = await at(2); await touch('touchStart', [[q.x, q.y]]);
  const step = await E(() => STUDIO._t.ROLL.rowH);
  for(let i = 1; i <= 8; i++){ await touch('touchMove', [[q.x + i * 6, q.y - i * step * 2 / 8]]); await wait(25); }
  await wait(120);
  r = await E(() => { const l = document.querySelector('.sp-loupe'), bx = l.getBoundingClientRect(); const c = l.getContext('2d').getImageData(0, 0, l.width, l.height).data; let ink = 0; for(let i = 0; i < c.length; i += 97) if(c[i] > 60) ink++; return { shown:!l.hidden, above:bx.bottom, w:bx.width, ink }; });
  ok(r.shown && r.above < q.y - step * 2 - 20 && r.ink > 20, 'while a note is dragged a loupe above the finger shows it, twice the size, with its name and place', JSON.stringify(r));
  await shot('2-loupe');
  await touch('touchEnd', []); await wait(250);
  n1 = await notes(); const moved = n1.filter(n => n[2] === 47)[0];
  ok(moved && moved[0] % 120 === 0 && moved[0] > 960 && !(await E(() => !document.querySelector('.sp-loupe').hidden)), 'let go, it lands on the grid two notes higher and a little later', JSON.stringify(moved));
  await P.tap(p, '#spundo'); await wait(200);
  // one finger on empty grid moves the view; two fingers move and zoom
  let v0 = await E(() => ({ sl:STUDIO._t.ROLL.host.scrollLeft, st:STUDIO._t.ROLL.host.scrollTop, ppt:STUDIO._t.ROLL.ppt, n:STUDIO._t.patOf(STUDIO._t.findRegion(STUDIO._t.UI.sel.region).r).notes.length }));
  const mid = await E(() => { const bx = STUDIO._t.ROLL.host.getBoundingClientRect(); return { x:bx.left + bx.width * 0.6, y:bx.top + bx.height * 0.75 }; });
  await touch('touchStart', [[mid.x, mid.y]]); for(let i = 1; i <= 6; i++){ await touch('touchMove', [[mid.x - i * 12, mid.y]]); await wait(16); } await touch('touchEnd', []); await wait(200);
  let v1 = await E(() => ({ sl:STUDIO._t.ROLL.host.scrollLeft, n:STUDIO._t.patOf(STUDIO._t.findRegion(STUDIO._t.UI.sel.region).r).notes.length }));
  ok(v1.sl > v0.sl + 40 && v1.n === v0.n, 'one finger dragged across empty grid moves the view and adds nothing', v0.sl + ' → ' + v1.sl);
  await touch('touchStart', [[mid.x - 40, mid.y]]); await touch('touchStart', [[mid.x - 40, mid.y], [mid.x + 40, mid.y]]);
  for(let i = 1; i <= 8; i++){ await touch('touchMove', [[mid.x - 40 - i * 7, mid.y], [mid.x + 40 + i * 7, mid.y]]); await wait(16); }
  await touch('touchEnd', []); await wait(250);
  let v2 = await E(() => ({ ppt:STUDIO._t.ROLL.ppt, n:STUDIO._t.patOf(STUDIO._t.findRegion(STUDIO._t.UI.sel.region).r).notes.length }));
  ok(v2.ppt > v0.ppt * 1.5 && v2.n === v0.n, 'two fingers spread apart zoom in', v0.ppt.toFixed(3) + ' → ' + v2.ppt.toFixed(3));
  const sl0 = await E(() => STUDIO._t.ROLL.host.scrollTop);
  await touch('touchStart', [[mid.x - 30, mid.y]]); await touch('touchStart', [[mid.x - 30, mid.y], [mid.x + 30, mid.y]]);
  for(let i = 1; i <= 6; i++){ await touch('touchMove', [[mid.x - 30, mid.y - i * 10], [mid.x + 30, mid.y - i * 10]]); await wait(16); }
  await touch('touchEnd', []); await wait(200);
  r = await E(() => STUDIO._t.ROLL.host.scrollTop); ok(r > sl0 + 30, 'two fingers moved together move the view', sl0 + ' → ' + r);
  await P.tap(p, '#sptool-fit'); await wait(300);
  // the selecting box
  await P.tap(p, '#sptool-select'); await wait(150);
  const a0 = await at(0, 3, -step), a3 = await at(3, 30, step * 1.4);
  await touch('touchStart', [[a0.x, a0.y - step * 6]]); for(let i = 1; i <= 8; i++){ await touch('touchMove', [[a0.x + (a3.x - a0.x) * i / 8, a0.y - step * 6 + (step * 9) * i / 8]]); await wait(16); } await touch('touchEnd', []); await wait(250);
  r = await E(() => ({ sel:STUDIO._t.ROLL.sel.length, pressed:document.getElementById('sptool-select').getAttribute('aria-pressed') }));
  ok(r.sel >= 3 && r.pressed === 'true', 'Select: a box drawn with one finger selects the notes it touches', r.sel + ' notes');
  await shot('3-box');
  const before = await notes(); await P.tap(p, '#spnb-up'); await wait(150); n1 = await notes();
  ok(n1.filter((n, i) => n[2] === before[i][2] + 1).length === r.sel, 'and the bar then moves them together');
  await P.tap(p, '#spundo'); await P.tap(p, '#sptool-select'); await wait(200);
  // More
  q = await at(4); await p.touchscreen.tap(q.x, q.y); await wait(200); await P.tap(p, '#spnb-more'); await p.waitForSelector('#spnotemore'); await wait(150);
  a = await P.audit(p); ok(a.small.length === 0, 'More lists the rest (louder, softer, octave, duplicate, join, onto the grid, fit to key, select all)', a.n + ' controls'); await shot('4-more');
  await p.locator('#spnotemore .sp-row', { hasText:'Select all' }).tap(); await wait(200);
  ok(await selN() === 8, 'Select all the notes');
  await p.touchscreen.tap(mid.x, mid.y + 40).catch(() => {}); await wait(100);

  // ---- on its side ----
  const vp = p.viewportSize(), state0 = await E(() => ({ sel:STUDIO._t.UI.sel.region, scr:STUDIO._t.PH.screen, n:STUDIO._t.patOf(STUDIO._t.findRegion(STUDIO._t.UI.sel.region).r).notes.length, song:STUDIO._t.S.id }));
  await p.setViewportSize({ width:Math.max(vp.width, vp.height) + (dev === 'ip13' ? 0 : 0), height:Math.min(vp.width, vp.height) }); await E(() => window.dispatchEvent(new Event('orientationchange'))); await wait(900);
  r = await E(() => { const T = STUDIO._t, R = T.ROLL; return { phone:T.phoneOn(), scr:T.PH.screen, sel:T.UI.sel.region, w:R.host.clientWidth, h:R.host.clientHeight, top:document.querySelector('.sp-top').getBoundingClientRect().height, side:document.documentElement.scrollWidth <= innerWidth + 1, tr:document.querySelector('.sp-tr').getBoundingClientRect().bottom <= innerHeight + 1 }; });
  ok(r.phone && r.scr === 'edit' && r.sel === state0.sel && r.side && r.tr, 'turned on its side it is still the phone layout, on the same part', JSON.stringify(r));
  ok(r.w >= Math.min(600, Math.max(vp.width, vp.height) - 2) && r.h >= 150 && r.top <= 50, 'and the piano roll is wide: ' + r.w + 'x' + r.h + 'px, under one line of top bar');
  await shot('5-landscape');
  q = await at(5); await p.touchscreen.tap(q.x, q.y); await wait(250);
  r = await E(() => ({ bar:!document.getElementById('spnotebar').hidden, roll:STUDIO._t.ROLL.host.clientHeight, bh:document.getElementById('spnotebar').getBoundingClientRect().height }));
  ok(r.bar && r.roll >= 110 && r.bh <= 60, 'the bar for a selected note is one row there, and the grid keeps ' + r.roll + 'px');
  a = await P.audit(p); ok(a.small.length === 0 && a.side, 'landscape: every control is 44px or more', a.small.join(' | ')); await shot('6-landscape-selected');
  await P.tap(p, '#spback'); await wait(500); a = await P.audit(p); ok(a.small.length === 0 && a.side, 'landscape, the song: 44px and no sideways scroll', a.small.join(' | ')); await shot('7-landscape-song');
  await p.setViewportSize(vp); await E(() => window.dispatchEvent(new Event('orientationchange'))); await wait(800);
  r = await E(() => ({ phone:STUDIO._t.phoneOn(), scr:STUDIO._t.PH.screen, n:STUDIO._t.patOf(STUDIO._t.S.tracks[0].regions[0]).notes.length, song:STUDIO._t.S.id, undo:STUDIO._t.hist().u.length }));
  ok(r.phone && r.scr === 'song' && r.n === state0.n && r.song === state0.song && r.undo > 0, 'upright again: the song, the screen and the undo history are as they were');
  P.done(errs); await b.close();
})().catch(e => { console.error(e); process.exit(1); });
