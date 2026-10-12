// humming a part, through the page: Chromium's own microphone path fed from a sound file; free humming and the tempo found in it;
// the choices above a hummed part; hearing the take; an empty take; a microphone that is refused; a voice take turned into notes
const L = require('./lib'), { ok } = L;
const SG = L.SG, fs = require('fs');
(async () => {
  // ---- 1. the real path: getUserMedia -> the recorder -> the listener ----
  {
    const steps = [[60, 1], [62, 1], [64, 1], [65, 1], [67, 2], [65, 1], [64, 1], [62, 2], [60, 2]], bpm = 96;
    const sung = L.tune(steps, bpm, { voice:'ah', style:'da' }), sr = sung.sr, lead = 5 * sr, x = new Float32Array(lead + sung.x.length + 8 * sr); x.set(sung.x, lead);
    fs.writeFileSync('out/fake-mic.wav', SG.wav(x, sr));
    const { b, p, errs } = await L.open({ noMic:true, args:['--use-file-for-fake-audio-capture=' + __dirname + '/out/fake-mic.wav%noloop'] });
    const E = (fn, a) => p.evaluate(fn, a);
    await E(async () => { const T = STUDIO._t; await T.loadManifest(); const t = T.addTrack('inst', 'basic:piano', 'Piano'); T.commit('x'); T.select(t.id, null); });
    await p.locator('.st-th .st-threc').click(); await p.waitForSelector('#sthum');
    await p.locator('#sthumlen .st-b', { hasText:'Until I stop' }).click();
    await p.waitForFunction(() => /Start humming/.test(document.getElementById('sthumgo').textContent), null, { timeout:8000 });
    let r = await E(() => ({ label:STUDIO._t.MIC.label, stream:!!STUDIO._t.MIC.stream, state:document.querySelector('.st-micstate').textContent }));
    ok(r.stream && /hears you|should move/.test(r.state), 'the browser’s own microphone is opened (permission already given), and its level is shown', r.state);
    await p.click('#sthumgo'); await p.waitForFunction(() => STUDIO._t.HUM);
    ok(await p.isVisible('.st-recbar') && /Hum freely/.test(await p.textContent('.st-rectext')), 'free humming: the strip says it is recording and how to stop', await p.textContent('.st-rectext'));
    await p.waitForTimeout(13500); await p.click('#strecstop');
    await p.waitForFunction(() => !STUDIO._t.HUM && STUDIO._t.S.tracks[0].regions.length, null, { timeout:30000 }); await p.waitForTimeout(600);
    r = await E(() => { const T = STUDIO._t, rg = T.S.tracks[0].regions[0]; return { ps:T.patOf(rg).notes.map(n => n.p % 12).join(' '), n:T.patOf(rg).notes.length, bars:rg.l / 1920, s:rg.s, sug:T.UI.humSug }; });
    ok(r.ps === '0 2 4 5 7 5 4 2 0', 'a tune played into Chromium’s microphone from a sound file comes out as its nine notes', r.ps);
    ok(r.sug && r.sug.tempo && Math.abs(r.sug.tempo.bpm - bpm) <= 2, 'no click was running: the pulse of the humming is found (sung at ' + bpm + ')', r.sug && JSON.stringify(r.sug.tempo));
    const sugText = await p.textContent('.st-sug');
    ok(/about \d+ BPM/.test(sugText), 'and offered in words', sugText.slice(0, 90));
    await p.locator('.st-sug .st-b.primary').click(); await p.waitForTimeout(700);
    r = await E(() => { const T = STUDIO._t, rg = T.S.tracks[0].regions[0]; return { tempo:T.S.tempo, starts:T.patOf(rg).notes.map(n => n.s / 480).join(' '), bars:rg.l / 1920 }; });
    ok(Math.abs(r.tempo - bpm) <= 2 && r.starts === '0 1 2 3 4 6 7 8 10' && r.bars === 3, 'taking it sets the song’s tempo and puts her notes on its beats: bar 1 starts on her first note', JSON.stringify(r));
    console.log(errs.join('\n') || 'no page errors (real microphone path)'); await b.close();
  }
  // ---- 2. with the stand-in microphone: the choices, hearing it, edge cases ----
  const { b, p, errs } = await L.open({});
  const E = (fn, a) => p.evaluate(fn, a);
  await E(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); await T.latLoad(); T.MIC.label = 'test input'; await T.latStore(0.05); T.S.key = { root:0, scale:'major' }; const t = T.addTrack('inst', 'cello', 'Cello'); T.commit('x'); T.select(t.id, null); });
  async function hum(sig, o){
    o = o || {}; const id = await L.prep(p, sig.x, sig.sr);
    await E(() => { STUDIO._t.setPos(window.__at || 0); });
    await p.locator('.st-th[data-kind="inst"] .st-threc').first().click(); await p.waitForSelector('#sthum');
    if(o.bars) await p.locator('#sthumlen .st-b', { hasText:o.bars + ' bars' }).click();
    await p.waitForFunction(() => /^Start/.test(document.getElementById('sthumgo').textContent)); await p.click('#sthumgo');
    await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
    await L.fire(p, id, (await E(() => STUDIO._t.HUM.startAt)) + 0.05 + (o.shift || 0));
    await p.waitForFunction(() => !STUDIO._t.HUM, null, { timeout:40000 }); await p.waitForTimeout(700);
  }
  const reg = () => E(() => { const T = STUDIO._t, rg = T.S.tracks[0].regions[0]; return rg ? { notes:T.patOf(rg).notes.map(n => ({ s:n.s, l:n.l, p:n.p, v:n.v, m:n.m })), hum:rg.hum, s:rg.s, l:rg.l } : null; });
  // a woman sings a melody with a note outside the key, a little unevenly, loud and soft
  const mel = SG.melody([[72, 1, 1], [74, 0.5, 0.5], [76, 0.5, 0.5], [78, 1, 0.9], [79, 1, 1], [76, 1, 0.3], [74, 1, 0.6], [72, 2, 1]], 100, { start:0 });
  mel.forEach((n, i) => { n.t += [0, 0.03, -0.02, 0.035, -0.03, 0.02, -0.035, 0.01][i]; });
  const sig = SG.sing(mel, { style:'da', voice:'ah', tail:0.3 });
  await hum(sig, { bars:2 });
  let r = await reg();
  ok(r && r.notes.length === 8 && r.notes.map(n => n.p % 12).join(' ') === '0 2 4 6 7 4 2 0', 'eight notes, F sharp among them as sung (the song is in C major)', r && r.notes.map(n => n.p).join(' '));
  ok(r.notes.every(n => n.p >= 36 && n.p <= 76) && r.hum.shift <= -1, 'sung around C5, written where a cello plays (an octave or two down)', 'octaves moved: ' + r.hum.shift + ', notes ' + r.notes[0].p + '…');
  const vs = r.notes.map(n => n.v);
  ok(vs[2] > vs[5] + 8 && vs[5] === Math.min(...vs) && Math.max(...vs) === 104, 'her loudest note is 104; the same E sung softly gets a lower velocity than the E sung louder', vs.join(' '));
  const tidy = r.notes.map(n => n.s);
  ok(tidy.join(' ') === '0 480 720 960 1440 1920 2400 2880', 'Tidy (the default): her uneven starts are on the eighths', tidy.join(' '));
  ok(await p.locator('#sttiming .st-b[aria-pressed="true"]').textContent() === 'Tidy' && await p.locator('#stpitch .st-b[aria-pressed="true"]').textContent() === 'As hummed', 'the strip above the notes shows the choices in force');
  await p.locator('#sttiming .st-b', { hasText:'As hummed' }).click(); await p.waitForTimeout(400);
  const raw = (await reg()).notes.map(n => n.s);
  ok(raw.some((s, i) => Math.abs(s - tidy[i]) >= 10) && raw.every((s, i) => Math.abs(s - tidy[i]) < 60), '“As hummed” puts every start back where she sang it', raw.join(' '));
  await p.locator('#sttiming .st-b', { hasText:'Half way' }).click(); await p.waitForTimeout(400);
  const feel = (await reg()).notes.map(n => n.s);
  ok(feel.every((s, i) => Math.abs(s - (raw[i] + tidy[i]) / 2) <= 2), '“Half way” is half way between the two', feel.join(' '));
  await p.locator('#sttiming .st-b', { hasText:'Strict' }).click(); await p.waitForTimeout(400);
  r = await reg();
  ok(r.notes.every(n => n.s % 240 === 0 && n.l % 240 === 0) && r.notes.slice(0, -1).every((n, i) => n.s + n.l === r.notes[i + 1].s), 'Strict: starts and lengths on the grid, each note held to the next', r.notes.map(n => n.s + '+' + n.l).join(' '));
  await p.selectOption('#sthumgrid', '480'); await p.waitForTimeout(400);
  r = await reg();
  ok(r.notes.every(n => n.s % 480 === 0) && r.notes.length < 8, 'Grid 1/4: everything on the beats (two notes on one beat become one)', r.notes.map(n => n.s).join(' '));
  await p.selectOption('#sthumgrid', '0'); await p.locator('#sttiming .st-b', { hasText:'Tidy' }).click(); await p.waitForTimeout(300);
  await p.locator('#stpitch .st-b', { hasText:'Fit to key' }).click(); await p.waitForTimeout(400);
  r = await reg();
  ok(r.notes.map(n => n.p % 12).join(' ') === '0 2 4 5 7 4 2 0' && r.notes[3].m === 1 && !r.notes[0].m, 'Fit to key: the F sharp becomes F, and is marked as moved', r.notes.map(n => n.p + (n.m ? '*' : '')).join(' '));
  const lo0 = r.notes[0].p;
  await p.locator('.st-humbar .st-b', { hasText:/^\+$/ }).click(); await p.waitForTimeout(400);
  r = await reg();
  ok(r.notes[0].p === lo0 + 12 && r.hum.octave === 1, 'Octave +: the same notes an octave higher', String(r.notes[0].p));
  const undoN = await E(() => STUDIO._t.hist().u.length);
  await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
  r = await reg();
  ok(r.notes[0].p === lo0 && r.hum.octave === 0, 'each choice is a step of Undo', String(r.notes[0].p));
  // hearing it
  await p.locator('#sthear .st-b', { hasText:'My voice' }).click(); await p.waitForTimeout(500);
  r = await E(() => { const a = STUDIO._t.audition; return a ? { mode:a.mode, nodes:a.nodes.length, lv:STUDIO._t.levels().master } : null; });
  ok(r && r.mode === 'voice' && r.nodes === 1 && r.lv > 0.01, '“My voice” plays the take itself', JSON.stringify(r));
  await p.locator('#sthear .st-b', { hasText:'Both' }).click(); await p.waitForTimeout(500);
  r = await E(() => { const a = STUDIO._t.audition; return a ? { mode:a.mode, nodes:a.nodes.length, voices:STUDIO._t.ENG.G.voices.length } : null; });
  ok(r && r.mode === 'both' && r.nodes === 1 && r.voices >= 1, '“Both” plays the take and the instrument together', JSON.stringify(r));
  await p.locator('#sthear .st-b', { hasText:'Both' }).click(); await p.waitForTimeout(200);
  ok(await E(() => !STUDIO._t.audition), 'pressing it again stops');
  // a note moved by hand, then a choice: says that the notes are written afresh
  await E(() => { const T = STUDIO._t, rg = T.S.tracks[0].regions[0]; T.select(T.S.tracks[0].id, rg.id); T.ROLL.sel = [T.patOf(rg).notes[1]]; T.rollDo('transpose', 2); });
  await p.waitForTimeout(300);
  ok(/changed by hand/.test(await p.textContent('.st-humbar')), 'after a note is moved by hand the strip says a choice would write the notes afresh');
  // hum it again: replaces the part in the same place
  const again = SG.sing(SG.melody([[67, 2], [65, 2], [64, 2], [62, 2]], 100, { start:0 }), { style:'da', voice:'ah', tail:0.3 });
  await p.locator('.st-humbar .st-b', { hasText:'Hum it again' }).click(); await p.waitForSelector('#sthum');
  const idA = await L.prep(p, again.x, again.sr); await p.waitForFunction(() => /^Start/.test(document.getElementById('sthumgo').textContent)); await p.click('#sthumgo');
  await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt); await L.fire(p, idA, (await E(() => STUDIO._t.HUM.startAt)) + 0.05);
  await p.waitForFunction(() => !STUDIO._t.HUM, null, { timeout:40000 }); await p.waitForTimeout(700);
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[0]; return { regs:t.regions.length, ps:T.patOf(t.regions[0]).notes.map(n => n.p % 12).join(' '), l:t.regions[0].l }; });
  ok(r.regs === 1 && r.ps === '7 5 4 2' && r.l === 3840, '“Hum it again” records the same two bars again and replaces the part', JSON.stringify(r));
  // a pick-up: two notes before the bar belong to the part
  await E(() => { const T = STUDIO._t; T.S.tracks[0].regions = []; T.commit('clear'); window.__at = 3840; });
  const pick = SG.sing(SG.melody([[67, 0.5], [69, 0.5], [72, 2], [71, 2], [69, 2], [67, 2]], 100, { start:0 }), { style:'da', voice:'ah', tail:0.3 });
  await hum(pick, { bars:2, shift:-0.6 });
  r = await reg();
  ok(r && r.s === 1920 && r.l === 5760 && r.notes.length === 6 && r.notes[0].s === 1440 && r.notes[2].s === 1920, 'a pick-up sung in the count-in is kept: the part starts a bar earlier and the first full note is still on bar 3', r && JSON.stringify({ s:r.s, l:r.l, starts:r.notes.map(n => n.s) }));
  // nothing sung
  await E(() => { const T = STUDIO._t; T.S.tracks[0].regions = []; T.commit('clear'); window.__at = 0; });
  await hum({ x:new Float32Array(48000), sr:48000 }, { bars:2 });
  await p.waitForSelector('#sthum', { timeout:8000 });
  let txt = await p.textContent('#sthum .st-warn');
  ok(/Nothing was heard|No notes were found/.test(txt) && await E(() => STUDIO._t.S.tracks[0].regions.length) === 0, 'a take with nothing in it: no part is made; the sheet comes back saying why', txt);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  ok(await E(() => !STUDIO._t.MIC.node), 'and the microphone is let go');
  // cancel during the count
  await p.locator('.st-th[data-kind="inst"] .st-threc').first().click(); await p.waitForSelector('#sthum'); await p.waitForFunction(() => /^Start/.test(document.getElementById('sthumgo').textContent)); await p.click('#sthumgo');
  await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt); await p.waitForTimeout(500); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  r = await E(() => ({ hum:!!STUDIO._t.HUM, playing:STUDIO._t.TR.playing, bar:document.querySelector('.st-recbar').hidden, regs:STUDIO._t.S.tracks[0].regions.length, mic:!!STUDIO._t.MIC.node }));
  ok(!r.hum && !r.playing && r.bar && r.regs === 0 && !r.mic, 'Esc during a take throws it away: nothing recorded, nothing left running', JSON.stringify(r));
  // a voice take becomes notes
  r = await E(async x => { const T = STUDIO._t; const raw = atob(x.b), u = new Uint8Array(raw.length); for(let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i); const f = new Float32Array(u.buffer), pcm = new Int16Array(f.length); for(let i = 0; i < f.length; i++) pcm[i] = Math.round(Math.max(-1, Math.min(1, f[i])) * 32767);
    await new Promise((res, rej) => { const rq = indexedDB.open('firstloop-studio'); rq.onsuccess = () => { const tx = rq.result.transaction('audio', 'readwrite'); tx.objectStore('audio').put({ id:'vt', song:T.S.id, sr:x.sr, pcm, an:null, name:'Take', made:Date.now(), lat:0, kind:'audio' }); tx.oncomplete = res; tx.onerror = rej; }; });
    const v = T.addTrack('audio', '', 'Voice'); v.regions.push({ id:'rv', s:0, l:3840, takes:['vt'], act:0, off:0, fi:0, fo:0, gain:0 }); T.commit('take'); T.select(v.id, 'rv', { open:true }); T.showTab('take'); return true; }, { b:L.f32b64(again.x), sr:again.sr });
  await p.waitForTimeout(400); await p.locator('.st-edtools .st-b', { hasText:'Turn this take into notes' }).click();
  await p.waitForFunction(() => STUDIO._t.S.tracks.length === 3, null, { timeout:20000 }); await p.waitForTimeout(500);
  r = await E(() => { const T = STUDIO._t, t = T.S.tracks[2]; return { name:t.name, ps:T.patOf(t.regions[0]).notes.map(n => n.p % 12).join(' '), tab:T.UI.tab, hum:!!t.regions[0].hum }; });
  ok(r.ps === '7 5 4 2' && r.tab === 'notes' && r.hum, '“Turn this take into notes” writes a sung recording as notes on a new track, with the same choices above them', JSON.stringify(r));
  console.log(errs.join('\n') || 'no page errors'); await b.close();
  // ---- 3. the microphone refused ----
  {
    const { chromium } = require('/home/claude/fltests/node_modules/playwright');
    const b2 = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required'] });
    const ctx = await b2.newContext({ viewport:{ width:1280, height:800 }, permissions:[] }); const p2 = await ctx.newPage();
    await p2.addInitScript(() => { const md = navigator.mediaDevices; if(md) md.getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError')); });
    await p2.goto('http://localhost:8734/index.html?fltest=1#write'); await p2.waitForFunction(() => window.STUDIO && STUDIO._t && STUDIO._t.S);
    await p2.evaluate(async () => { const T = STUDIO._t; const t = T.addTrack('inst', 'basic:piano', 'Piano'); T.commit('x'); T.select(t.id, null); });
    await p2.locator('.st-th .st-threc').click(); await p2.waitForSelector('#sthum');
    const before = await p2.textContent('#sthum');
    ok(/asks for permission the first time/.test(before) && /stays in this browser/.test(before) && /Turn on the microphone/.test(before), 'before the browser asks, the sheet says that it will, and that the recording stays on this device');
    await p2.click('#stmicon'); await p2.waitForTimeout(600);
    const st = await p2.textContent('.st-micstate');
    ok(/did not allow the microphone/.test(st) && /Allow it for this page/.test(st), 'a refusal is explained, with what to do', st);
    ok(/Turn on the microphone/.test(await p2.textContent('#sthumgo')) && await p2.evaluate(() => !STUDIO._t.HUM), 'and nothing starts recording');
    await b2.close();
  }
  L.done([]);
})().catch(e => { console.error(e); process.exit(1); });
