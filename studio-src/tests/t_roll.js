// the note editor: with the mouse on the grid, with the keyboard, and through the Edit menu's own functions
const L = require('./lib'), { ok } = L;
(async () => {
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  await E(async () => { const T = STUDIO._t; await T.loadManifest(); const t = T.addTrack('inst', 'basic:piano', 'Piano'); const o = T.addTrack('inst', 'basic:bass', 'Bass');
    T.addRegion(o, 0, 7680, [{ s:0, l:960, p:36, v:90 }, { s:1920, l:960, p:43, v:90 }]);
    const r = T.addRegion(t, 0, 7680, [{ s:0, l:480, p:60, v:90 }, { s:480, l:480, p:62, v:80 }, { s:960, l:960, p:64, v:100 }, { s:1920, l:480, p:65, v:70 }]); T.commit('setup'); T.select(t.id, r.id, { open:true }); T.showTab('notes'); window.__r = r.id; });
  await p.waitForTimeout(500);
  const notes = () => E(() => { const T = STUDIO._t; return T.patOf(T.findRegion(window.__r).r).notes.map(n => n.s + ':' + n.l + ':' + n.p + ':' + n.v).join(' '); });
  const sel = () => E(() => STUDIO._t.ROLL.sel.map(n => n.s + ':' + n.p).sort().join(' '));
  // where a note is on the screen
  const at = (s, pch, dx) => E(({ s, pch, dx }) => { const T = STUDIO._t, R = T.ROLL, h = R.host, bx = h.getBoundingClientRect(); return { x:bx.left + R.keysW + s * R.ppt - h.scrollLeft + (dx || 0), y:bx.top + R.rulerH + (127 - pch) * R.rowH - h.scrollTop + R.rowH / 2 }; }, { s, pch, dx });
  await E(() => { const T = STUDIO._t; T.ROLL.snap = 240; });
  let n0 = await notes();
  ok(n0 === '0:480:60:90 480:480:62:80 960:960:64:100 1920:480:65:70', 'the part shows its four notes', n0);
  // click selects, drag moves in time and pitch (snapped to 1/8)
  let a = await at(480, 62, 12); await p.mouse.move(a.x, a.y); await p.mouse.down(); let c = await at(480 + 960, 67, 12); await p.mouse.move((a.x + c.x) / 2, (a.y + c.y) / 2, { steps:3 }); await p.mouse.move(c.x, c.y, { steps:3 }); await p.mouse.up();
  ok(/1440:480:67:80/.test(await notes()) && await sel() === '1440:67', 'dragging a note moves it in time and pitch, on the snap', await notes());
  // pull its right end
  a = await at(1440 + 480, 67, -3); await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + (await E(() => STUDIO._t.ROLL.ppt)) * 480, a.y, { steps:4 }); await p.mouse.up();
  ok(/1440:960:67:80/.test(await notes()), 'pulling the right end makes it longer', await notes());
  // shift leaves the snap
  a = await at(0, 60, 10); await p.mouse.move(a.x, a.y); await p.keyboard.down('Shift'); await p.mouse.down(); await p.mouse.move(a.x + 7, a.y, { steps:3 }); await p.mouse.up(); await p.keyboard.up('Shift');
  let first = (await notes()).split(' ')[0].split(':')[0];
  ok(+first > 0 && +first < 240 && +first % 240 !== 0, 'holding Shift places a note off the snap', first);
  await p.keyboard.press('Control+z');
  ok((await notes()).split(' ')[0] === '0:480:60:90', 'Ctrl+Z undoes that move', await notes());
  // double-click on empty grid adds a note; double-click on a note removes it
  a = await at(2880, 72, 5); await p.mouse.dblclick(a.x, a.y);
  ok(/2880:\d+:72:\d+/.test(await notes()), 'a double-click on the grid adds a note there', await notes());
  await p.mouse.dblclick(a.x, a.y);
  ok(!/2880:\d+:72/.test(await notes()), 'a double-click on a note removes it');
  // a box selects several; arrows move them; Shift+arrow an octave
  a = await at(-60, 66.2, 0); c = await at(1900, 58.5, 0); a.x = (await at(0, 60, -4)).x + 2;
  await E(() => { const T = STUDIO._t; T.ROLL.host.scrollTop = Math.max(0, (127 - 70) * T.ROLL.rowH - 40); T.ROLL.view.paint(); });
  a = await at(0, 69, 2); c = await at(1900, 58, 0); await p.mouse.move(a.x - 0, a.y); 
  // start on empty grid: a row where no note is
  await p.mouse.down(); await p.mouse.move(c.x, c.y, { steps:6 }); await p.mouse.up();
  let s1 = await sel();
  ok(s1 === '0:60 1440:67 960:64', 'dragging a box across empty grid selects the notes it touches', s1);
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowRight');
  ok(/240:480:61:90/.test(await notes()) && /1200:960:65:100/.test(await notes()), 'arrow keys move the selection: up a semitone, right one step', await notes());
  await p.keyboard.press('Shift+ArrowDown');
  ok(/240:480:49:90/.test(await notes()), 'Shift+arrow moves it an octave', await notes());
  await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z'); await p.keyboard.press('Control+z');
  // copy, paste at the playhead, duplicate, delete
  await E(() => { const T = STUDIO._t, pt = T.patOf(T.findRegion(window.__r).r); T.ROLL.sel = pt.notes.filter(n => n.s < 900); T.setPos(3840); T.ROLL.view.ask(); });
  await p.locator('#stroll').focus();
  await p.keyboard.press('Control+c'); await p.keyboard.press('Control+v');
  ok(/3840:480:60:90/.test(await notes()), 'Ctrl+C and Ctrl+V: the copied notes land at the playhead', await notes());
  await p.keyboard.press('Control+d');
  let nn = await notes();
  ok(/4320:480:60:90/.test(nn), 'Ctrl+D repeats the selection straight after itself', nn);
  await p.keyboard.press('Delete');
  ok(!/4320:480:60/.test(await notes()), 'Delete removes the selected notes');
  await p.keyboard.press('Control+a');
  ok((await sel()).split(' ').length === (await notes()).split(' ').length, 'Ctrl+A selects every note');
  // quantise, legato, split, join, velocity, fit to key: the Edit menu's functions
  let r = await E(() => { const T = STUDIO._t, f = T.findRegion(window.__r), pt = T.patOf(f.r), out = {};
    pt.notes = [{ s:13, l:400, p:60, v:90 }, { s:500, l:300, p:61, v:90 }, { s:955, l:200, p:66, v:90 }, { s:1447, l:480, p:67, v:60 }]; T.ROLL.sel = []; T.ROLL.snap = 240; T.commit('set');
    T.rollDo('quantise', { strength:1 }); out.q = pt.notes.map(n => n.s).join(' ');
    T.undo(); T.rollDo('quantise', { strength:0.5 }); out.half = T.patOf(T.findRegion(window.__r).r).notes.map(n => n.s).join(' ');
    T.undo(); T.rollDo('quantise', { strength:1 }); const P = () => T.patOf(T.findRegion(window.__r).r);
    T.rollDo('legato'); out.leg = P().notes.map(n => n.l).join(' ');
    T.S.key = { root:0, scale:'major' }; T.rollDo('tokey'); out.key = P().notes.map(n => n.p + (n.m ? '*' : '')).join(' ');
    T.ROLL.sel = [P().notes[0]]; T.rollDo('split'); out.split = P().notes.length; T.ROLL.sel = P().notes.filter(n => n.p === 60); T.rollDo('join'); out.join = P().notes.length + ':' + P().notes[0].l;
    T.rollDo('all'); T.rollDo('velocity', 10); out.vel = P().notes.map(n => n.v).join(' ');
    T.rollDo('transpose', 12); out.oct = P().notes.map(n => n.p).join(' ');
    T.rollDo('none'); out.none = T.ROLL.sel.length; out.cut = T.rollDo('cut'); out.u = T.hist().u.length;
    return out; });
  ok(r.q === '0 480 960 1440', 'Quantise moves every start onto the grid', r.q);
  ok(r.half === '7 490 958 1444', 'Quantise at 50% moves them half way', r.half);
  ok(r.leg === '480 480 480 480', 'legato: each note is held until the next', r.leg);
  ok(r.key === '60 60* 65* 67', 'Fit to the key moves the notes outside it and marks them', r.key);
  ok(r.split === 5 && r.join === '3:960', 'split cuts a note in two; join makes the selected notes of one pitch into one', r.split + ' ' + r.join);
  ok(r.vel === '100 100 70' && r.oct === '72 77 79', 'louder by ten; up an octave', r.vel + ' | ' + r.oct);
  ok(r.none === 0 && r.cut === false, 'with nothing selected, Cut says so and changes nothing');
  // pencil: press and pull draws, a click on a note removes it
  await p.keyboard.press('2');
  ok(await E(() => STUDIO._t.ROLL.tool) === 'pencil', 'the key 2 takes the pencil');
  a = await at(3840, 70, 2);
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(a.x + (await E(() => STUDIO._t.ROLL.ppt)) * 700, a.y, { steps:4 }); await p.mouse.up();
  nn = await notes();
  ok(/3840:720:70:\d+/.test(nn), 'the pencil draws a note as long as it is pulled', nn);
  a = await at(3840, 70, 20); await p.mouse.click(a.x, a.y);
  ok(!/3840:720:70/.test(await notes()), 'the pencil removes a note it clicks');
  await p.keyboard.press('1');
  // Stay in key: a new note lands on the scale
  await E(() => { STUDIO._t.ROLL.keySnap = true; });
  a = await at(5760, 73, 4); await p.mouse.dblclick(a.x, a.y);
  nn = await notes();
  ok(/5760:\d+:72:\d+/.test(nn) && !/5760:\d+:73/.test(nn), 'with Stay in key on, a note put on C sharp in C major lands on C', nn);
  await E(() => { STUDIO._t.ROLL.keySnap = false; });
  // velocity lane
  r = await E(() => { const T = STUDIO._t, R = T.ROLL, h = R.host, bx = h.getBoundingClientRect(), pt = T.patOf(T.findRegion(window.__r).r), n = pt.notes[0]; return { x:bx.left + R.keysW + n.s * R.ppt - h.scrollLeft + 1, y0:bx.bottom - 10, y1:bx.bottom - R.velH + 8, v:n.v }; });
  await p.mouse.move(r.x, r.y0); await p.mouse.down(); await p.mouse.move(r.x, r.y1, { steps:4 }); await p.mouse.up();
  let v1 = await E(() => STUDIO._t.patOf(STUDIO._t.findRegion(window.__r).r).notes[0].v);
  ok(v1 > 110, 'dragging in the velocity lane sets how hard the note is played', r.v + ' -> ' + v1);
  // zoom, fit, snap choices, other tracks behind, the keys on the left sound
  r = await E(async () => { const T = STUDIO._t, R = T.ROLL; const p0 = R.ppt; R.host.dispatchEvent(new WheelEvent('wheel', { deltaY:-200, ctrlKey:true, clientX:600, clientY:700, bubbles:true, cancelable:true })); const p1 = R.ppt; document.querySelector('.st-edtools').querySelectorAll('button'); 
    const sn = document.querySelector('.st-edtools select'); const opts = [...sn.options].map(o => o.textContent).join(','); sn.value = '160'; sn.dispatchEvent(new Event('change')); const snap = R.snap;
    return { zoomed:p1 > p0, opts, snap, ghost:R.ghost, ms:R.view.lastMs }; });
  ok(r.zoomed && /1\/16/.test(r.opts) && /triplet/.test(r.opts) && /Off/.test(r.opts) && r.snap === 160, 'Ctrl+wheel zooms; snap offers 1/4 to 1/32, triplets, Auto and Off', r.opts);
  await p.keyboard.press('f');
  r = await E(() => { const T = STUDIO._t, R = T.ROLL, h = R.host; return { w:Math.round(R.ppt * 7680), room:h.clientWidth - R.keysW }; });
  ok(r.w <= r.room && r.w > r.room * 0.8, 'F shows the whole part', JSON.stringify(r));
  r = await E(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadInst('basic:piano'); const R = T.ROLL, h = R.host, bx = h.getBoundingClientRect(); return { x:bx.left + 20, y:bx.top + R.rulerH + (127 - 76) * R.rowH - h.scrollTop + 4 }; });
  await p.mouse.move(r.x, r.y); await p.mouse.down(); await p.waitForTimeout(250);
  let lv = await E(() => { const T = STUDIO._t, R = T.ROLL; return { v:T.ENG.G.voices.length, key:R.downKey, lv:T.levels().master, dbg:[R.rowH, R.host.scrollTop, R.host.clientHeight, R.velH] }; });
  await p.mouse.up();
  ok(lv.key === 76 && lv.v >= 1, 'pressing a key at the left of the grid plays that note', JSON.stringify(lv));
  // a part that repeats: its notes past the part's own length are kept but shaded (not played)
  r = await E(() => { const T = STUDIO._t, f = T.findRegion(window.__r), pt = T.patOf(f.r); pt.len = 1920; pt.notes = [{ s:0, l:480, p:60, v:90 }, { s:2400, l:480, p:62, v:90 }]; T.commit('short part'); return T.flatNotes(f.r).map(n => n.s + ':' + n.p).join(' '); });
  ok(r === '0:60 1920:60 3840:60 5760:60', 'a one-bar part in a four-bar region plays four times; a note beyond the part’s length is kept, not played', r);
  // painting stays quick with a great many notes
  r = await E(async () => { const T = STUDIO._t, f = T.findRegion(window.__r), pt = T.patOf(f.r); pt.len = 7680; pt.notes = []; for(let i = 0; i < 3000; i++) pt.notes.push({ s:(i * 37) % 7600, l:60, p:36 + (i * 7) % 60, v:60 + i % 60 }); T.commit('many'); T.ROLL.view.paint(); const t0 = performance.now(); for(let i = 0; i < 10; i++) T.ROLL.view.paint(); return (performance.now() - t0) / 10; });
  ok(r < 25, 'the grid repaints 3,000 notes in well under a frame or two', r.toFixed(1) + ' ms');
  await b.close(); L.done(errs);
})().catch(e => { console.error(e); process.exit(1); });
