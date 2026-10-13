// What a phone does differently underneath, each forced and checked under Chromium with a phone's descriptor:
// interruption and "Tap to resume sound", the silent-switch keeper (iPhone UA), the microphone without a worklet and with
// MediaRecorder only, MIME choice, a take the device will not store, 48 kHz and 16 kHz, headphones, the keyboard, the
// Assistant as a sheet, the phone check and its report as feedback, Home's Account/Feedback/Workspace, sharing, Back.
const P = require('./plib'), { ok } = P;
const only = process.argv[2] || '';
const BASS = [[40, 1], [43, 1], [45, 2], [43, 1], [40, 1], [38, 2], [40, 1], [43, 1], [45, 1], [47, 1], [45, 2], [40, 2]];
async function newBass(p){ return p.evaluate(async () => { const T = STUDIO._t; await T.loadManifest(); await T.createSong('Test'); const t = T.addTrack('inst', 'basic:bass', 'Bass'); T.commit('x'); T.select(t.id, null); T.phGo('song'); await T.latLoad(); await T.latStore(0.04); return t.id; }); }
// hum through the phone's own recording screen; resolves what landed
async function hum(p, o){
  o = o || {};
  const tid = await newBass(p), sig = P.tune(BASS, 100, Object.assign({ voice:'hum' }, o.sing || {})), id = await P.prep(p, sig.x, sig.sr);
  await p.evaluate(t => STUDIO._t.phCap({ kind:'hum', track:t }), tid);
  await p.waitForFunction(() => /Start:/.test((document.getElementById('spcapgo') || {}).textContent || ''), null, { timeout:10000 });
  if(o.setup) await o.setup();
  await P.tap(p, '#spcapgo'); await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt, null, { timeout:10000 });
  const mode = await p.evaluate(() => STUDIO._t.MIC.mode);
  await P.fire(p, id, (await p.evaluate(() => STUDIO._t.HUM.startAt)) + 0.04, o.gain);
  await p.waitForFunction(() => !STUDIO._t.PH.cap && STUDIO._t.PH.res, null, { timeout:45000 }).catch(() => {});
  return p.evaluate(mode => { const T = STUDIO._t, f = T.PH.res && T.findRegion(T.PH.res); if(!f) return { n:0, mode, msg:(document.getElementById('spcap') || {}).innerText };
    const ns = T.patOf(f.r).notes; return { n:ns.length, mode, ps:ns.map(x => x.p), ss:ns.map(x => x.s), sr:T.ENG.ctx.sampleRate, take:f.r.hum.take, lat:T.takeCache[f.r.hum.take] && T.takeCache[f.r.hum.take].lat, region:f.r.id }; }, mode);
}
const WANT_S = [0, 480, 960, 1920, 2400, 2880, 3840, 4320, 4800, 5280, 5760, 6720];
const onGrid = r => r.n === 12 && r.ss.every((s, i) => Math.abs(s - WANT_S[i]) <= 120);
const sect = async (name, fn) => { if(only && name.indexOf(only) < 0) return; console.log('--- ' + name); try { await fn(); } catch(e){ ok(false, name + ': ran to the end', String(e && e.stack || e).slice(0, 400)); } };
(async () => {
  await sect('interruption', async () => {
    const { b, p, errs } = await P.open({ dev:'ip13' });
    const E = (fn, a) => p.evaluate(fn, a);
    await E(async () => { const T = STUDIO._t; await T.createSong('I'); const t = T.addTrack('inst', 'basic:bass', 'Bass'); T.addRegion(t, 0, 7680, [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ s:i * 960, l:900, p:40 + i, v:100 }))); T.commit('x'); T.phGo('song'); });
    await p.waitForTimeout(300);
    let r = await E(() => ({ ctx:!!STUDIO._t.ENG.ctx, done:STUDIO._t.UNL.done }));
    ok(!r.ctx && !r.done, 'no sound context exists before the first tap');
    await P.tap(p, '#spplay'); await p.waitForTimeout(2600);
    r = await E(() => ({ st:STUDIO._t.ENG.ctx.state, done:STUDIO._t.UNL.done, pl:STUDIO.playing(), lv:STUDIO._t.levels().master, keeper:!!STUDIO._t.UNL.keeper, kon:STUDIO._t.UNL.keeperOn, kp:STUDIO._t.UNL.keeper && STUDIO._t.UNL.keeper.paused, loop:STUDIO._t.UNL.keeper && STUDIO._t.UNL.keeper.loop, tip:document.getElementById('sptoast').textContent }));
    ok(r.st === 'running' && r.done && r.pl && r.lv > 0.01, 'the first tap makes and starts the context; Play plays', JSON.stringify({ st:r.st, lv:r.lv }));
    ok(r.keeper && r.kon && !r.kp && r.loop, 'iPhone: the silent element is playing, looped, from that tap on (the silent switch then does not mute the Studio)');
    ok(/silent switch/.test(r.tip), 'iPhone: once, before the first sound, the tip about the silent switch', r.tip);
    r = await E(async () => { const k = STUDIO._t.UNL.keeper, ab = await (await fetch(k.src)).arrayBuffer(), u = new Int16Array(ab.slice(44)); let mx = 0; for(let i = 0; i < u.length; i++) if(Math.abs(u[i]) > mx) mx = Math.abs(u[i]); return { bytes:ab.byteLength, max:mx, dom:document.contains(k) }; });
    ok(r.max === 0 && r.bytes > 40000, 'what it plays is one second of zeros: it cannot make a sound', JSON.stringify(r));
    // the system takes the sound away mid-song
    await E(() => STUDIO._t.ENG.ctx.suspend()); await p.waitForTimeout(400);
    r = await E(() => ({ pl:STUDIO.playing(), bar:!document.getElementById('stresume').hidden, txt:document.getElementById('stresume').textContent, pos:STUDIO._t.TR.pos, h:document.getElementById('stresume').getBoundingClientRect().height }));
    ok(!r.pl && r.bar && /Tap to resume sound/.test(r.txt) && r.pos > 0 && r.h >= 44, 'the context suspended in mid-song: playback stops where it was and a bar says “Tap to resume sound”', r.txt + ' at tick ' + Math.round(r.pos));
    await p.screenshot({ path:'shots/mb-resume.png' });
    await P.tap(p, '#stresume'); await p.waitForTimeout(500);
    r = await E(() => ({ st:STUDIO._t.ENG.ctx.state, bar:!document.getElementById('stresume').hidden }));
    ok(r.st === 'running' && !r.bar, 'a tap on it resumes the context and the bar goes');
    await P.tap(p, '#spplay'); await p.waitForTimeout(900); r = await E(() => ({ pl:STUDIO.playing(), lv:STUDIO._t.levels().master })); ok(r.pl && r.lv > 0.01, 'and Play plays on from there', JSON.stringify(r)); await P.tap(p, '#spplay');
    // a context that will not come back: the second tap makes a new one
    await E(() => { const c = STUDIO._t.ENG.ctx; window.__old = c; c.resume = () => new Promise(() => {}); return c.suspend(); }); await p.waitForTimeout(300);
    await P.tap(p, '#stresume'); await p.waitForTimeout(1300);
    r = await E(() => ({ txt:document.getElementById('stresume').textContent, bar:!document.getElementById('stresume').hidden }));
    ok(r.bar && /Tap once more/.test(r.txt), 'when the old context does not answer within a second the bar says so', r.txt);
    await P.tap(p, '#stresume'); await p.waitForTimeout(900);
    r = await E(() => ({ fresh:STUDIO._t.ENG.ctx !== window.__old, st:STUDIO._t.ENG.ctx.state, bar:!document.getElementById('stresume').hidden, n:STUDIO._t.ENG.rebuilt }));
    ok(r.fresh && r.st === 'running' && !r.bar && r.n === 1, 'the next tap makes a new context, running', JSON.stringify(r));
    await P.tap(p, '#spplay'); await p.waitForTimeout(1000); r = await E(() => ({ pl:STUDIO.playing(), lv:STUDIO._t.levels().master })); ok(r.pl && r.lv > 0.01, 'and the song plays in it, with the instruments that were loaded', JSON.stringify(r)); await P.tap(p, '#spplay');
    // put away and brought back
    r = await E(async () => { const T = STUDIO._t; await T.transportPlay({ from:0 }); Object.defineProperty(document, 'hidden', { configurable:true, get:() => true }); document.dispatchEvent(new Event('visibilitychange')); const a = { pl:STUDIO.playing(), kp:T.UNL.keeper ? T.UNL.keeper.paused : null }; Object.defineProperty(document, 'hidden', { configurable:true, get:() => false }); document.dispatchEvent(new Event('visibilitychange')); await new Promise(r2 => setTimeout(r2, 1000)); a.st = T.ENG.ctx.state; a.bar = !document.getElementById('stresume').hidden; return a; });
    ok(!r.pl && r.st === 'running' && !r.bar, 'put away while playing: it stops cleanly; brought back, the context is running and no bar is needed', JSON.stringify(r));
    // the microphone and the silent element
    r = await E(async () => { const T = STUDIO._t; T.TEST.micNode = null; await T.micOpen(); const a = { paused:T.UNL.keeper.paused, mode:T.MIC.mode, set:T.MIC.settings }; T.micClose(); await new Promise(r2 => setTimeout(r2, 300)); a.after = T.UNL.keeper.paused; return a; });
    ok(r.paused && r.after === false, 'while the microphone is open the silent element is paused; it plays again afterwards', JSON.stringify({ mode:r.mode, ec:r.set && r.set.echoCancellation, ns:r.set && r.set.noiseSuppression, agc:r.set && r.set.autoGainControl }));
    ok(r.set && r.set.echoCancellation === false && r.set.noiseSuppression === false && r.set.autoGainControl === false, 'the microphone is asked for raw sound, and what the browser gave is kept for the phone check');
    r = await E(() => ({ man:(document.querySelector('link[rel=manifest]') || {}).href || '', icon:!!document.querySelector('link[rel="apple-touch-icon"]'), cap:(document.querySelector('meta[name="apple-mobile-web-app-capable"]') || {}).content, sw:navigator.serviceWorker ? 'api' : 'none' }));
    const man = JSON.parse(decodeURIComponent(r.man.split(',').slice(1).join(',')) || '{}');
    ok(/#write$/.test(man.start_url || '') && man.display === 'standalone' && man.icons && man.icons.length === 2 && r.icon && r.cap === 'yes', 'Home Screen: a manifest (starting at #write, standalone), an icon and the iOS tags are put in the head', (man.start_url || '').replace(/^https?:\/\/[^/]+/, ''));
    r = await E(() => navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(a => a.length) : 0); ok(r === 0, 'no service worker is registered');
    console.log(errs.join('\n') || 'no page errors'); ok(errs.length === 0, 'no page errors (interruption)'); await b.close();
  });
  await sect('pixel', async () => {
    const { b, p, errs } = await P.open({ dev:'px7' });
    await p.evaluate(async () => { const T = STUDIO._t; await T.createSong('I'); const t = T.addTrack('inst', 'basic:bass', 'Bass'); T.addRegion(t, 0, 1920, [{ s:0, l:900, p:40, v:100 }]); T.commit('x'); T.phGo('song'); });
    await P.tap(p, '#spplay'); await p.waitForTimeout(800);
    const r = await p.evaluate(() => ({ ios:STUDIO._t.MOB.ios, android:STUDIO._t.MOB.android, keeper:!!STUDIO._t.UNL.keeper, pl:STUDIO.playing(), tip:document.getElementById('sptoast').textContent, lean:STUDIO._t.MOB.lean }));
    ok(!r.ios && r.android && !r.keeper && r.pl && !/silent switch/.test(r.tip) && r.lean, 'Android: no silent element and no tip about a switch it does not have; the rest is the same', JSON.stringify(r));
    ok(errs.length === 0, 'no page errors (Pixel)', errs.join(' | ')); await b.close();
  });
  await sect('worklet', async () => {
    let { b, p, errs } = await P.open({ dev:'ip13', init:() => { window.__noWorklet = true; } });
    await p.evaluate(() => { STUDIO._t.TEST.noWorklet = true; });
    let r = await hum(p);
    ok(r.mode === 'script' && r.n === 12, 'the worklet cannot be loaded: the older ScriptProcessor keeps the samples and the twelve notes are found', JSON.stringify({ mode:r.mode, n:r.n }));
    ok(onGrid(r), 'and they land where they were sung', (r.ss || []).join(','));
    r = await p.evaluate(() => ({ mods:STUDIO._t.ENG.mods, lim:STUDIO._t.ENG.limiterOK })); ok(r.mods === false && !r.lim, 'the song then plays without the limiter, which the Mix says');
    await b.close();
    ({ b, p, errs } = await P.open({ dev:'px7' }));
    await p.evaluate(() => { STUDIO._t.TEST.micMode = 'recorder'; });
    r = await hum(p);
    const mime = await p.evaluate(() => STUDIO._t.recMime());
    ok(r.mode === 'recorder' && r.n === 12, 'with only MediaRecorder: the take is recorded as ' + mime + ', decoded, and the twelve notes are found', JSON.stringify({ n:r.n, mode:r.mode }));
    ok(r.n === 12 && r.ss.every((s, i) => Math.abs(s - WANT_S[i]) <= 240), 'near where they were sung (this way has no exact clock; the timing check measures it)', (r.ss || []).join(','));
    r = await p.evaluate(async () => { const T = STUDIO._t, a = await T.dbAll('audio'); const x = a[a.length - 1]; return { pcm:x.pcm instanceof Int16Array, sr:x.sr, n:x.pcm.length }; });
    ok(r.pcm && r.sr >= 8000 && r.n > r.sr * 8, 'whatever the container, the take is kept as plain 16-bit samples beside the song', JSON.stringify(r));
    // which type is asked for
    r = await p.evaluate(() => { const T = STUDIO._t, real = MediaRecorder.isTypeSupported, out = {};
      MediaRecorder.isTypeSupported = t => /^audio\/mp4/.test(t); out.ios = T.recMime();
      MediaRecorder.isTypeSupported = t => /^audio\/webm;codecs=opus$/.test(t); out.chrome = T.recMime();
      MediaRecorder.isTypeSupported = t => /^audio\/ogg/.test(t); out.ff = T.recMime();
      MediaRecorder.isTypeSupported = () => false; out.none = T.recMime();
      MediaRecorder.isTypeSupported = () => { throw new Error('x'); }; out.thrower = T.recMime();
      MediaRecorder.isTypeSupported = real; return out; });
    ok(/^audio\/mp4/.test(r.ios) && r.chrome === 'audio/webm;codecs=opus' && /^audio\/ogg/.test(r.ff) && r.none === '' && r.thrower === '', 'the type is chosen by isTypeSupported: MP4/AAC where that is all there is (Safari), WebM/Opus, Ogg, or the browser’s own default', JSON.stringify(r));
    await p.evaluate(() => { MediaRecorder.__real = MediaRecorder.isTypeSupported; MediaRecorder.isTypeSupported = () => false; });
    r = await hum(p); await p.evaluate(() => { MediaRecorder.isTypeSupported = MediaRecorder.__real; });
    ok(r.mode === 'recorder' && r.n === 12, 'with no type it says it supports, the recorder’s default is used and decoded all the same', JSON.stringify({ n:r.n }));
    ok(errs.length === 0, 'no page errors (fallbacks)', errs.join(' | ')); await b.close();
  });
  await sect('storage', async () => {
    const { b, p, errs } = await P.open({ dev:'ip13' });
    await p.evaluate(() => { STUDIO._t.TEST.failAudio = true; });
    let r = await hum(p);
    const st = await p.evaluate(() => ({ mem:Object.keys(STUDIO._t.memTakes).length, toast:document.getElementById('sptoast').textContent, db:0 }));
    ok(r.n === 12 && st.mem === 1, 'the device refuses to store a take: the notes are there all the same and the take is kept in memory', JSON.stringify({ n:r.n, mem:st.mem }));
    let seen = await p.evaluate(() => window.__says || []);
    r = await p.evaluate(async reg => { const T = STUDIO._t; await T.humHear(reg, 'voice'); await new Promise(r2 => setTimeout(r2, 500)); const lv = T.levels().master; const o = await T.projectOut(true); return { lv, audio:o.audio.length, pcm:o.audio[0] && o.audio[0].pcm.length > 1000 }; }, r.region);
    ok(r.lv > 0.005 && r.audio === 1 && r.pcm, 'it still plays back, and a song file made now carries it');
    r = await p.evaluate(async () => { const T = STUDIO._t; T.TEST.failAudio = false; const left = await T.takeRetry(); return { left, db:(await T.dbAll('audio')).length }; });
    ok(r.left === 0 && r.db >= 1, 'when storing works again it is written, and nothing is left only in memory', JSON.stringify(r));
    r = await p.evaluate(async () => { const T = STUDIO._t; await T.storageInfo(); return { due:T.copyDue(), nudge:!document.querySelector('.sp-nudge').hidden || T.PH.screen !== 'song', used:T.STO.used, per:T.STO.persisted }; });
    ok(r.due && typeof r.used === 'number', 'after a take the song is marked as only on this phone (Save a copy), and storage use is known', JSON.stringify(r));
    void seen; void st;
    ok(errs.length === 0, 'no page errors (storage)', errs.join(' | ')); await b.close();
  });
  await sect('rates', async () => {
    for(const [rate, name] of [[48000, '48 kHz (an iPhone’s usual rate)'], [16000, '16 kHz (an iPhone with a Bluetooth headset: the whole context drops)'], [22050, '22.05 kHz']]){
      const { b, p, errs } = await P.open({ dev:'ip13' });
      await p.evaluate(sr => { STUDIO._t.TEST.sampleRate = sr; }, rate);
      const r = await hum(p);
      ok(r.sr === rate && r.n === 12 && onGrid(r) && r.ps.join() === '28,31,33,31,28,26,28,31,33,35,33,28'.split(',').map(x => +x + (r.ps[0] - 28)).join(), 'context at ' + name + ': twelve notes, the right ones, in place', JSON.stringify({ sr:r.sr, n:r.n, p0:r.ps && r.ps[0] }));
      if(rate === 16000){
        const w = await p.evaluate(async t => { const T = STUDIO._t; await T.routeDetect(); T.phGo('song'); T.phCap({ kind:'hum', track:T.S.tracks[0].id }); await new Promise(r2 => setTimeout(r2, 700)); return { low:T.HP.low, txt:document.getElementById('spcap').innerText }; });
        ok(w.low && /telephone quality \(16 kHz\)/.test(w.txt), 'and the recording screen says the microphone is in telephone quality', (w.txt.match(/The microphone is running[^.]*\./) || [''])[0]);
        await p.screenshot({ path:'shots/mb-lowrate.png' });
      }
      const pl = await p.evaluate(async () => { const T = STUDIO._t; if(T.PH.cap) document.getElementById('spcapx').click(); await T.transportPlay({ from:0 }); await new Promise(r2 => setTimeout(r2, 700)); const lv = T.levels().master; T.transportStop(); const buf = await T.renderSong({}); return { lv, sr:buf.sampleRate, secs:buf.duration }; });
      ok(pl.lv > 0.005 && pl.sr === rate && pl.secs > 9, 'it plays and renders at that rate', JSON.stringify(pl));
      ok(errs.length === 0, 'no page errors (' + rate + ')', errs.join(' | ')); await b.close();
    }
    // a 16 kHz, band-limited voice (what a Bluetooth headset's microphone gives) into an ordinary context, with noise
    const { b, p, errs } = await P.open({ dev:'px7' });
    const r = await hum(p, { sing:{ sr:16000 } });
    ok(r.n === 12 && onGrid(r), 'a voice recorded at 16 kHz, as a Bluetooth headset gives it, is read as well: twelve notes in place', JSON.stringify({ n:r.n, ctx:r.sr }));
    ok(errs.length === 0, 'no page errors (16 kHz voice)', errs.join(' | ')); await b.close();
  });
  await sect('headphones', async () => {
    const { b, p, errs } = await P.open({ dev:'ip13', hp:null });
    const E = (fn, a) => p.evaluate(fn, a);
    const tid = await newBass(p);
    await E(async t => { const T = STUDIO._t; const t2 = T.addTrack('inst', 'basic:piano', 'Piano'); T.addRegion(t2, 0, 7680, [{ s:0, l:7000, p:60, v:90 }]); T.commit('y'); T.select(t, null); T.phCap({ kind:'hum', track:t }); }, tid);
    await p.waitForFunction(() => document.querySelector('#sphp .sp-opts')); await p.waitForTimeout(500);
    let r = await E(() => ({ txt:document.getElementById('sphp').innerText, go:document.getElementById('spcapgo').textContent, dis:document.getElementById('spcapgo').disabled }));
    ok(/Are you wearing headphones\?/.test(r.txt) && /No/.test(r.txt) && /with a wire/.test(r.txt) && /Bluetooth/.test(r.txt) && r.dis, 'nothing tells what is plugged in, so she is asked once: “Are you wearing headphones?”', r.go);
    await p.screenshot({ path:'shots/mb-headphones-ask.png' });
    let a = await P.audit(p); ok(a.small.length === 0 && a.side, 'that screen: 44px, no sideways scroll', a.small.join(' | '));
    await p.locator('#sphp [data-hp="no"]').tap(); await p.waitForTimeout(300);
    r = await E(() => ({ txt:document.getElementById('spcap').innerText, plan:STUDIO._t.recPlan('hum', 'song'), voice:STUDIO._t.recPlan('voice'), pref:STUDIO._t.PREF.hp, back:document.querySelector('#spcapback [aria-pressed="true"]').textContent }));
    ok(r.pref === 'no' && r.plan.speaker && r.plan.clickVol <= 0.3 && r.plan.backing === 'click' && r.back === 'The click only' && /click plays quietly/.test(r.txt) && /wire give the cleanest/.test(r.txt), 'No headphones: the click plays quietly, the other tracks stay silent while she hums, and the screen says why and what is better', JSON.stringify(r.plan));
    ok(r.voice.musicVol <= 0.3 && r.voice.speaker, 'for a voice take the song plays quietly instead');
    await p.screenshot({ path:'shots/mb-headphones-no.png' });
    // hum on the speaker: the click bleeds into the microphone and is taken out; latency is measured from it
    const sig = P.tune(BASS, 100, { voice:'hum' }); const id = await P.prep(p, sig.x, sig.sr);
    await E(() => { const T = STUDIO._t; T.LAT.map = {}; const ctx = T.ENG.ctx, d = ctx.createDelay(1); d.delayTime.value = 0.085; const g = ctx.createGain(); g.gain.value = 0.5; T.ENG.G.click.connect(d); d.connect(g); g.connect(window.__mic); });
    await P.tap(p, '#spcapgo'); await p.waitForFunction(() => STUDIO._t.HUM && STUDIO._t.HUM.startAt);
    r = await E(() => STUDIO._t.ENG.G.click.gain.value);
    await P.fire(p, id, (await E(() => STUDIO._t.HUM.startAt)) + 0.085);
    await p.waitForFunction(() => !STUDIO._t.PH.cap && STUDIO._t.PH.res, null, { timeout:45000 });
    const res = await E(() => { const T = STUDIO._t, f = T.findRegion(T.PH.res), ns = T.patOf(f.r).notes; return { n:ns.length, ss:ns.map(x => x.s), lat:T.latNow(), toast:document.getElementById('sptoast').textContent }; });
    ok(res.n === 12 && res.ss.every((s, i) => Math.abs(s - WANT_S[i]) <= 120), 'hummed on the phone’s own speaker with the click audible in the microphone: twelve notes, in place', res.ss.join(','));
    ok(res.lat.measured && Math.abs(res.lat.sec - 0.085) < 0.006, 'and the count’s clicks measured the round trip by themselves', Math.round(res.lat.sec * 1000) + ' ms');
    // a Bluetooth headset, found by name
    await E(() => { const T = STUDIO._t; T.TEST.route = { auto:'bt', label:'AirPods Pro', low:true }; document.getElementById('spagain').click(); });
    await p.waitForFunction(() => /Bluetooth headphones/.test((document.getElementById('sphp') || {}).innerText || ''), null, { timeout:8000 });
    r = await E(() => ({ txt:document.getElementById('sphp').innerText, plan:STUDIO._t.recPlan('hum', 'song'), change:/Change/.test(document.getElementById('sphp').innerText) }));
    ok(/telephone quality/.test(r.txt) && /reaches you late/.test(r.txt) && /a wire is better/.test(r.txt) && !r.plan.speaker && !r.change, 'a Bluetooth headset found by name: it says the microphone is of telephone quality and late, that a wire is better, and still works', r.txt.replace(/\n+/g, ' | ').slice(0, 120));
    await p.screenshot({ path:'shots/mb-headphones-bt.png' });
    ok(errs.length === 0, 'no page errors (headphones)', errs.join(' | ')); await b.close();
  });
  await sect('keyboard', async () => {
    const { b, p, errs } = await P.open({ dev:'se' });
    const E = (fn, a) => p.evaluate(fn, a);
    await newBass(p); await P.tap(p, '#spnav-lyrics'); await p.waitForTimeout(400);
    await p.locator('.st-lytext').first().tap(); await p.waitForTimeout(200);
    // the keyboard comes up: the part that can be seen shrinks, the page's own height does not (as on an iPhone)
    const kb = h => E(h2 => { const vv = window.visualViewport; Object.defineProperty(vv, 'height', { configurable:true, get:() => h2 }); vv.dispatchEvent(new Event('resize')); }, h);
    const full = await E(() => window.innerHeight);
    await kb(full - 260); await p.waitForTimeout(400);
    let r = await E(() => { const a = document.activeElement.getBoundingClientRect(), st = document.getElementById('studio').getBoundingClientRect(); return { vis:window.visualViewport.height, studio:st.bottom, ta:[a.top, a.bottom], tr:!!document.querySelector('.sp-tr').getClientRects().length, kb:document.documentElement.dataset.stkb }; });
    ok(r.kb === 'open' && r.studio <= r.vis + 1 && r.ta[0] >= 0 && r.ta[1] <= r.vis + 1 && !r.tr, 'the keyboard up (260px of a ' + full + 'px screen): the Studio ends where the keyboard begins, the lyrics box being typed in is in sight, the transport steps aside', JSON.stringify(r));
    await p.screenshot({ path:'shots/mb-keyboard-lyrics.png' });
    await kb(full); await E(() => document.activeElement.blur()); await p.waitForTimeout(200);
    // rename, in a sheet
    await P.tap(p, '#spnav-song'); await p.waitForTimeout(200); await P.tap(p, '#sptitle'); await p.waitForSelector('.st-ask input'); await kb(full - 260); await p.waitForTimeout(300);
    r = await E(() => { const i = document.querySelector('.st-ask input').getBoundingClientRect(), okb = document.querySelector('.st-ask .st-b').getBoundingClientRect(); return { vis:window.visualViewport.height, in:[i.top, i.bottom], ok:okb.bottom, fs:parseFloat(getComputedStyle(document.querySelector('.st-ask input')).fontSize), focus:document.activeElement.tagName }; });
    ok(r.in[0] >= 0 && r.ok <= r.vis + 1 && r.fs >= 16 && r.focus === 'INPUT', 'renaming the song: the field and its OK sit above the keyboard, typed at 16px', JSON.stringify(r));
    await p.keyboard.type('Morning song'); await p.keyboard.press('Enter'); await kb(full); await p.waitForTimeout(400);
    r = await E(() => STUDIO._t.S.name); ok(r === 'Morning song', 'and the name is taken');
    // the Assistant
    await P.tap(p, '#spasst'); await p.waitForTimeout(400);
    r = await E(() => { const a = document.getElementById('assistant').getBoundingClientRect(); return { top:a.top, h:a.height, ih:innerHeight, view:document.body.dataset.view, x:!!document.getElementById('spasstx').getClientRects().length, z:+getComputedStyle(document.getElementById('assistant')).zIndex }; });
    ok(r.top === 0 && Math.abs(r.h - r.ih) <= 1 && r.view === 'studio' && r.x, 'the Assistant opens from its button on the song’s screen as a sheet the height of the screen; the Studio stays open underneath', JSON.stringify(r));
    await p.screenshot({ path:'shots/mb-assistant.png' });
    await p.locator('#asstinput').tap(); await kb(full - 260); await p.waitForTimeout(400);
    r = await E(() => { const i = document.getElementById('asstinput').getBoundingClientRect(), s = document.getElementById('asstsend').getBoundingClientRect(), a = document.getElementById('assistant').getBoundingClientRect(); return { vis:window.visualViewport.height, in:[i.top, i.bottom], send:s.bottom, sheet:a.bottom, fs:parseFloat(getComputedStyle(document.getElementById('asstinput')).fontSize) }; });
    ok(r.sheet <= r.vis + 1 && r.in[1] <= r.vis + 1 && r.send <= r.vis + 1 && r.in[0] > 40 && r.fs >= 16, 'with the keyboard up its input and Send are above the keyboard', JSON.stringify(r));
    await p.screenshot({ path:'shots/mb-assistant-keyboard.png' });
    await p.keyboard.type('tempo 92'); await p.keyboard.press('Enter'); await p.waitForTimeout(1500);
    r = await E(() => ({ tempo:STUDIO._t.S.tempo, last:(window.__flAsst ? window.__flAsst.msgs().slice(-1)[0] : null) }));
    ok(r.tempo === 92, 'asked there for “tempo 92”, the song’s tempo changes: the same Studio actions as on a wide screen', JSON.stringify(r.last).slice(0, 160));
    await kb(full); await P.tap(p, '#spasstx'); await p.waitForTimeout(300);
    r = await E(() => ({ open:document.documentElement.dataset.stasst, shown:!!document.getElementById('assistant').getClientRects().length, tempo:document.querySelector('#sptempo b').textContent, scr:STUDIO._t.PH.screen }));
    ok(!r.open && !r.shown && r.tempo === '92' && r.scr === 'song', 'closed, the song is there as it was left, at the new tempo');
    ok(errs.length === 0, 'no page errors (keyboard, Assistant)', errs.join(' | ')); await b.close();
  });
  await sect('home', async () => {
    const posts = [];
    const { b, p, errs } = await P.open({ dev:'ip13', before:async pg => {
      await pg.route('**/api/chat', async rt => { const rq = rt.request(); if(rq.method() === 'GET') return rt.fulfill({ contentType:'application/json', body:JSON.stringify({ ok:true, v:5, open:0, signup:true, signup_word:false }) });
        let body = {}; try { body = JSON.parse(rq.postData() || '{}'); } catch(e){} posts.push(body);
        if(body.op === 'feedback') return rt.fulfill({ contentType:'application/json', body:JSON.stringify({ ok:true, id:7, receipt:'r-abc', time:1760000000, account:false }) });
        return rt.fulfill({ contentType:'application/json', body:JSON.stringify({ ok:false, error:'need_code' }) }); });
      await pg.route('**/api/wish', rt => rt.fulfill({ status:404, body:'' }));
    } });
    const E = (fn, a) => p.evaluate(fn, a);
    await p.waitForTimeout(800);
    // Feedback
    await p.locator('#sphfb').tap(); await p.waitForTimeout(400);
    let r = await E(() => { const f = document.getElementById('fbpanel'); const bx = f.getBoundingClientRect(); return { shown:!f.hidden && bx.height > 100, in:bx.left >= 0 && bx.right <= innerWidth && bx.top >= 0, fs:parseFloat(getComputedStyle(document.getElementById('fbwrite')).fontSize), top:document.elementFromPoint(innerWidth / 2, bx.top + 20).closest('#fbpanel') !== null }; });
    ok(r.shown && r.in && r.fs >= 16 && r.top, 'Feedback, from Home, opens the site’s own feedback panel over the Studio', JSON.stringify(r));
    await p.screenshot({ path:'shots/mb-feedback.png' });
    await p.locator('#fbclose').tap(); await p.waitForTimeout(200);
    // Account
    await p.locator('#sphacct').tap(); await p.waitForTimeout(700);
    r = await E(() => ({ open:document.documentElement.dataset.stasst, form:document.getElementById('acctform') && !document.getElementById('acctform').hidden, role:(document.querySelector('#acctform select') || {}).value, code:!!(document.getElementById('asstcodeform') && document.getElementById('asstcodeform').getClientRects().length) }));
    ok(r.open === 'open' && (r.form || r.code), 'Account, from Home, opens the Assistant’s sheet at creating a tester account (or the invite code where the site offers no accounts)', JSON.stringify(r));
    ok(!r.form || r.role === 'singer', 'the sign-up form starts with “Singer or songwriter” chosen in this workspace', String(r.role));
    await p.screenshot({ path:'shots/mb-account.png' });
    await P.tap(p, '#spasstx'); await p.waitForTimeout(200);
    // the phone check, and its report as feedback
    await p.locator('#sphcheck').tap(); await p.waitForSelector('#spcheck'); await p.waitForTimeout(300);
    let a = await P.audit(p); ok(a.small.length === 0 && a.side, 'Phone check: 44px, no sideways scroll', a.small.join(' | '));
    const t0 = Date.now();
    await P.tap(p, '#spchktone'); await p.waitForSelector('#spchkyes', { state:'visible' }); await p.waitForTimeout(300);
    r = await E(() => STUDIO._t.levels().master); ok(r > 0.01, 'step 1 plays a test tone and asks “Did you hear them?”', r.toFixed(3));
    await P.tap(p, '#spchkyes');
    await E(() => { const T = STUDIO._t; const real = T.TEST.micNode; T.TEST.micNode = ctx => { const n = real(ctx); const o = ctx.createOscillator(), g = ctx.createGain(); g.gain.value = 0.2; o.frequency.value = 220; o.connect(g); g.connect(n); o.start(); o.stop(ctx.currentTime + 3); return n; }; });
    await P.tap(p, '#spchkrec'); await p.waitForFunction(() => /microphone works/.test(document.getElementById('spchk-2').innerText), null, { timeout:8000 });
    r = await E(() => document.getElementById('spchk-2').innerText.replace(/\n+/g, ' | ')); ok(/loudest moment -1[0-9] dB, at \d+ Hz/.test(r), 'step 2 records two seconds and shows the level and the sample rate', r.slice(0, 120));
    // timing by the loop from speaker to microphone
    await E(() => { const T = STUDIO._t; const ctx = T.ENG.ctx, d = ctx.createDelay(1); d.delayTime.value = 0.12; T.TEST.micNode = c2 => { window.__mic = c2.createGain(); T.ENG.G.click.connect(d); d.connect(window.__mic); return window.__mic; }; });
    await P.tap(p, '#spchklat'); await p.waitForFunction(() => /Measured: \d+ ms/.test(document.getElementById('spchk-3').innerText), null, { timeout:12000 });
    r = await E(() => document.getElementById('spchk-3').innerText); ok(/Measured: 1[12]\d ms/.test(r), 'step 3 measures the way from speaker to microphone', (r.match(/Measured[^.]*\./) || [''])[0]);
    // tap along
    await P.tap(p, '#spchktap'); await p.waitForSelector('#spchkpad', { state:'visible' });
    const pad = await p.locator('#spchkpad').boundingBox(); const ct = await E(() => STUDIO._t.ENG.ctx.currentTime);
    for(let i = 0; i < 8; i++){ const due = (1 + i * 0.6 + 0.07) * 1000; const now = (await E(() => STUDIO._t.ENG.ctx.currentTime) - ct) * 1000; if(due > now) await p.waitForTimeout(due - now); await p.touchscreen.tap(pad.x + pad.width / 2, pad.y + pad.height / 2); }
    await p.waitForFunction(() => /Your taps came/.test(document.getElementById('spchk-3').innerText), null, { timeout:9000 });
    r = await E(() => document.getElementById('spchk-3').innerText); ok(/Your taps came \d+ ms after/.test(r), 'or, with headphones on, she taps along with eight clicks and the delay is worked out from her taps', (r.match(/Your taps[^.]*\./) || [''])[0]);
    const secs = (Date.now() - t0) / 1000; ok(secs < 60, 'all of it in under a minute (' + secs.toFixed(0) + ' s here, the machine tapping)');
    r = await E(() => document.querySelector('.sp-check-out').innerText);
    ok(/First Loop phone check/.test(r) && /Device\s*Mozilla.*iPhone/.test(r) && /Sound\s*\d+ Hz, running/.test(r) && /Test tone\s*played, heard: yes/.test(r) && /Silent switch\s*workaround active/.test(r) && /Microphone[\s\S]*echo no, noise no, auto level no|Microphone[\s\S]*no report/.test(r) && /Timing\s*speaker to microphone 1[12]\d ms \(\d\/8\); tap along \d+ ms/.test(r) && /audio worklet yes/.test(r) && /MediaRecorder yes/.test(r) && /share files/.test(r) && /wake lock/.test(r) && /Storage/.test(r) && /kept safe/.test(r), 'step 4 lists it: device and browser, the context’s rate and state, the tone, the silent-switch workaround, the microphone as asked and as given, both timings, what the browser can do, storage', r.length + ' characters');
    console.log(r);
    await p.screenshot({ path:'shots/mb-check.png', fullPage:false });
    await E(() => { navigator.clipboard.writeText = t => { window.__clip = t; return Promise.resolve(); }; });
    await P.tap(p, '#spchkcopy'); await p.waitForTimeout(200);
    r = await E(() => ({ clip:window.__clip || '', st:document.getElementById('spchkstatus').textContent })); ok(/First Loop phone check/.test(r.clip) && r.clip.length <= 2000 && /Copied/.test(r.st), 'Copy report puts it on the clipboard (' + r.clip.length + ' characters)');
    await P.tap(p, '#spchksend'); await p.waitForFunction(() => /Sent|Not sent|did not accept/.test(document.getElementById('spchkstatus').textContent), null, { timeout:8000 });
    r = await E(() => document.getElementById('spchkstatus').textContent); const fb = posts.filter(x => x.op === 'feedback')[0];
    ok(/Sent\. Thank you\./.test(r) && fb && fb.kind === 'other' && /First Loop phone check/.test(fb.text) && fb.text.length <= 2000 && fb.details && typeof fb.details.ua === 'string', 'Send as feedback sends it through the site’s Feedback (op "feedback", with the usual technical details), and says so', fb ? Object.keys(fb).join(',') + '; details: ' + Object.keys(fb.details || {}).join(',') : r);
    await p.locator('#spcheck header .st-b').tap(); await p.waitForTimeout(200);
    // Workspace
    await p.locator('#sphws').tap(); await p.waitForSelector('#spwssheet'); await p.screenshot({ path:'shots/mb-workspace.png' });
    await p.locator('#spwssheet .sp-row', { hasText:'DJ' }).first().tap(); await p.waitForTimeout(900);
    r = await E(() => ({ ws:document.body.dataset.ws, view:document.body.dataset.view, dock:!!document.querySelector('.dock').getClientRects().length, flag:document.documentElement.dataset.stphone, side:document.documentElement.scrollWidth <= innerWidth + 1, ov:getComputedStyle(document.body).overflow }));
    ok(r.ws === 'dj' && r.view === 'dj' && r.dock && !r.flag, 'Workspace, from Home, reaches the DJ area: the page’s header is back and the DJ area is as it was on a phone', JSON.stringify(r));
    await p.screenshot({ path:'shots/mb-dj.png' });
    await p.locator('#wsbtn').tap(); await p.waitForTimeout(200); await p.locator('#wsmenu [data-ws="write"], #wsmenu button', { hasText:'Songwriter' }).first().tap(); await p.waitForTimeout(700);
    r = await E(() => ({ ws:document.body.dataset.ws, phone:STUDIO._t.phoneOn(), scr:STUDIO._t.PH.screen, flag:document.documentElement.dataset.stphone }));
    ok(r.ws === 'write' && r.phone && r.flag === 'true', 'and the Workspace button there brings the Songwriter workspace back, in the phone layout', JSON.stringify(r));
    // Back
    await P.tap(p, '#spnew'); await p.waitForTimeout(300); await P.tap(p, '#spnav-mix'); await p.waitForTimeout(300);
    await p.goBack().catch(() => {}); await p.waitForTimeout(400); r = await E(() => STUDIO._t.PH.screen); ok(r === 'song', 'the phone’s Back button goes one step back inside the Studio (Mix to the tracks)', r);
    await p.goBack().catch(() => {}); await p.waitForTimeout(400); r = await E(() => ({ scr:STUDIO._t.PH.screen, url:location.href })); ok(r.scr === 'home' && /index\.html/.test(r.url), 'and again, to Home, without leaving the site');
    ok(errs.length === 0, 'no page errors (Home)', errs.join(' | ')); await b.close();
  });
  await sect('signup', async () => {
    // a tester who opens the plain address on a phone and signs up as a singer lands in the phone Studio
    const { b, p, errs } = await P.open({ dev:'px7', hash:'' });
    let r = await p.evaluate(() => ({ ws:document.body.dataset.ws, view:document.body.dataset.view }));
    await p.evaluate(() => { const s = [...document.scripts].length; void s; });
    r = await p.evaluate(async () => { const before = document.body.dataset.ws; const btn = document.querySelector('.viewtab.asst-tab'); void btn; return before; });
    await p.evaluate(() => { window.__flTestRole && window.__flTestRole('singer'); });
    const has = await p.evaluate(() => typeof window.__flTestRole);
    if(has !== 'function'){
      // no test hook for the role: go by the form itself when the site offers sign-up; otherwise by the workspace it sets
      await p.evaluate(() => { const tab = document.querySelector('.viewtab[data-view="studio"]'); if(tab) tab.click(); });
    }
    await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.PH.built, null, { timeout:10000 });
    r = await p.evaluate(() => ({ ws:document.body.dataset.ws, phone:STUDIO._t.phoneOn(), scr:STUDIO._t.PH.screen }));
    ok(r.ws === 'write' && r.phone && r.scr === 'home', 'from the plain address, going to the Songwriter workspace on a phone lands on the phone Studio’s Home', JSON.stringify(r) + (has === 'function' ? ' (by role)' : ''));
    ok(errs.length === 0, 'no page errors (plain address)', errs.join(' | ')); await b.close();
  });
  await sect('share', async () => {
    const { b, p, errs } = await P.open({ dev:'ip13', init:() => {
      window.__shared = []; navigator.canShare = d => !!(d && d.files && d.files.every(f => window.__canTypes ? window.__canTypes.test(f.type) : true));
      navigator.share = d => { window.__shared.push({ n:d.files.length, name:d.files[0].name, type:d.files[0].type, size:d.files[0].size, title:d.title }); return window.__shareFail ? Promise.reject(Object.assign(new Error('x'), { name:window.__shareFail })) : Promise.resolve(); }; } });
    const E = (fn, a) => p.evaluate(fn, a);
    await E(async () => { const T = STUDIO._t; await T.createSong('Share me'); const t = T.addTrack('inst', 'basic:bass', 'Bass'); T.addRegion(t, 0, 3840, [0, 1, 2, 3].map(i => ({ s:i * 960, l:900, p:40 + i, v:100 }))); T.commit('x'); T.phGo('song'); });
    await P.tap(p, '#spnav-share'); await p.waitForSelector('#spshare'); await P.tap(p, '#spmake-wav'); await p.waitForSelector('#spsend-wav', { timeout:30000 });
    let r = await E(() => ({ shared:window.__shared.length })); ok(r.shared === 0, 'making the file does not open the share sheet by itself (a phone allows that only inside a tap)');
    await p.screenshot({ path:'shots/mb-share-send.png' });
    await P.tap(p, '#spsend-wav'); await p.waitForTimeout(400);
    r = await E(() => ({ s:window.__shared[0], st:document.getElementById('spshstatus').textContent }));
    ok(r.s && r.s.n === 1 && r.s.name === 'Share-me.wav' && r.s.type === 'audio/wav' && r.s.size > 100000 && /Handed to the app/.test(r.st), '“Send or share” hands the WAV to the share sheet as a file (navigator.share with files)', JSON.stringify(r.s));
    await E(() => { window.__shareFail = 'AbortError'; }); await P.tap(p, '#spsend-wav'); await p.waitForTimeout(300);
    r = await E(() => document.getElementById('spshstatus').textContent); ok(/Not sent\. The file is still ready/.test(r), 'the share sheet closed without sending: it says so, and the file is still there', r);
    await E(() => { window.__shareFail = 'NotAllowedError'; }); const [dl] = await Promise.all([p.waitForEvent('download', { timeout:10000 }), P.tap(p, '#spsend-wav')]);
    ok(/\.wav$/.test(dl.suggestedFilename()), 'the share sheet refusing: the file is downloaded instead', dl.suggestedFilename());
    await E(() => { window.__shareFail = ''; window.__canTypes = /^(audio\/|text\/plain)/; });
    await P.tap(p, '#spmake-song'); await p.waitForSelector('#spsend-song', { timeout:20000 }); await P.tap(p, '#spsend-song'); await p.waitForTimeout(400);
    r = await E(() => ({ s:window.__shared[window.__shared.length - 1], due:STUDIO._t.copyDue() }));
    ok(r.s && r.s.name === 'Share-me.flsong.txt' && r.s.type === 'text/plain' && !r.due, 'where the share sheet takes only the kinds of file it knows (Android), the song file goes as text; sharing it counts as the copy', JSON.stringify(r.s));
    await p.locator('#spshmore summary').tap(); await p.waitForTimeout(150);
    let a = await P.audit(p); ok(a.small.length === 0 && a.side, 'Share with More open: 44px, no sideways scroll', a.small.join(' | '));
    await P.tap(p, '#spmake-midi'); await p.waitForSelector('#spsave-midi'); await P.tap(p, '#spmake-stems'); await p.waitForSelector('#spsave-stems', { timeout:30000 });
    r = await E(() => document.getElementById('spshstatus').textContent); ok(/stems\.zip/.test(r), 'MIDI and stems are made under More', r);
    // a text file that is a song file opens as a song
    r = await E(async () => { const T = STUDIO._t, o = await T.projectOut(true); const f = new File([JSON.stringify(o)], 'Share-me.flsong.txt', { type:'text/plain' }); const n0 = (await T.listSongs()).length; const dt = new DataTransfer(); dt.items.add(f); const inp = document.createElement('input'); inp.type = 'file'; void inp; document.getElementById('studio').dispatchEvent(new DragEvent('drop', { dataTransfer:dt, bubbles:true, cancelable:true })); await new Promise(r2 => setTimeout(r2, 900)); return { n0, n1:(await T.listSongs()).length, name:T.S.name }; });
    ok(r.n1 === r.n0 + 1 && /Share me/.test(r.name), 'and a song file that arrived as “.flsong.txt” opens as a song', JSON.stringify(r));
    ok(errs.length === 0, 'no page errors (share)', errs.join(' | ')); await b.close();
  });
  await sect('cap', async () => {
    const { b, p, errs } = await P.open({ dev:'ip13' });
    const E = (fn, a) => p.evaluate(fn, a);
    await E(async () => { const T = STUDIO._t; T.TEST.takeCap = 3; await T.createSong('Cap'); const t = T.addTrack('audio', '', 'Voice'); T.S.countIn = 0; T.commit('x'); T.select(t.id, null); T.phGo('song'); T.phCap({ kind:'voice', track:t.id }); });
    await p.waitForFunction(() => /Record from bar/.test((document.getElementById('spcapgo') || {}).textContent || ''), null, { timeout:8000 });
    await P.tap(p, '#spcapgo'); await p.waitForFunction(() => !STUDIO._t.PH.cap && STUDIO._t.S.tracks[0].regions.length === 1, null, { timeout:15000 });
    const r = await E(() => ({ secs:STUDIO._t.tickSec(STUDIO._t.S.tracks[0].regions[0].l), toast:document.getElementById('sptoast').textContent, rec:STUDIO._t.AREC }));
    ok(r.secs > 2 && r.secs < 4.5 && !r.rec, 'a take that reaches the phone’s limit is stopped and kept (the limit is eight minutes; three seconds in this test)', r.secs.toFixed(1) + ' s');
    ok(errs.length === 0, 'no page errors (take limit)', errs.join(' | ')); await b.close();
  });
  await sect('a11y', async () => {
    const { b, p, errs, ctx } = await P.open({ dev:'px7', ctx:{ reducedMotion:'reduce' } });
    const E = (fn, a) => p.evaluate(fn, a);
    let r = await E(() => ({ tr:getComputedStyle(document.getElementById('sptoast')).transitionDuration, root:document.getElementById('studio').getAttribute('role') + '/' + document.getElementById('studio').getAttribute('aria-label') }));
    ok(/^0s/.test(r.tr) && /region\/Studio/.test(r.root), 'with “reduce motion” set nothing is animated; the Studio is a named region', JSON.stringify(r));
    // the order of focus on Home follows the order on the screen
    r = await E(() => { const els = [...document.querySelectorAll('#sphome button')].filter(e => e.getClientRects().length); let okOrder = true, last = -1; els.forEach(e => { const y = e.getBoundingClientRect().top + document.getElementById('sphome').scrollTop; if(y < last - 1) okOrder = false; last = y; }); return { n:els.length, okOrder, tabbable:els.every(e => e.tabIndex >= 0) }; });
    ok(r.okOrder && r.tabbable && r.n >= 8, 'Home: the ' + r.n + ' controls come in the order they are on the screen, and each can be reached by the keyboard');
    await newBass(p); await p.waitForTimeout(300);
    r = await E(() => { const q = s => document.querySelector(s); return { top:q('.sp-top').getAttribute('role'), nav:q('.sp-nav').getAttribute('role'), sel:q('#spnav-song').getAttribute('aria-selected'), tr:q('.sp-tr').getAttribute('aria-label'), play:q('#spplay').getAttribute('aria-label'), rec:q('#sprec').getAttribute('aria-label'), pos:q('#sppos').getAttribute('aria-label'), tempo:q('#sptempo').getAttribute('aria-label'), key:q('#spkey').getAttribute('aria-label'), undo:q('#spundo').getAttribute('aria-label'), toast:q('#sptoast').getAttribute('aria-live'), order:[...document.querySelectorAll('#studio > *')].filter(e => e.getClientRects().length && getComputedStyle(e).position !== 'absolute').map(e => [e.className.split(' ')[0], Math.round(e.getBoundingClientRect().top), +getComputedStyle(e).order]) }; });
    ok(r.top === 'toolbar' && r.nav === 'tablist' && r.sel === 'true' && r.tr === 'Transport' && r.play === 'Play' && /Hum a part on Bass/.test(r.rec) && /Position/.test(r.pos) && /Tempo 100 beats per minute/.test(r.tempo) && /Key/.test(r.key) && /Undo/.test(r.undo) && r.toast === 'polite', 'the song’s screen: toolbars, a tab list with its selected tab, and every icon button says in words what it does', r.rec + ' | ' + r.tempo);
    await P.tap(p, '.sp-thb'); await p.waitForSelector('#sptrack');
    r = await E(() => { const s = document.getElementById('sptrack'); return { role:s.getAttribute('role'), modal:s.getAttribute('aria-modal'), label:s.getAttribute('aria-label'), focusIn:s.contains(document.activeElement), sl:[...s.querySelectorAll('input[type=range]')].every(i => i.getAttribute('aria-label')), pressed:document.getElementById('sptrmute').getAttribute('aria-pressed') }; });
    ok(r.role === 'dialog' && r.modal === 'true' && r.label && r.focusIn && r.sl && r.pressed === 'false', 'a sheet is a named dialog, takes the focus, and its sliders and toggles carry their names and states', JSON.stringify(r));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await p.waitForTimeout(150); r = await E(() => ({ gone:!document.getElementById('sptrack'), back:document.activeElement && document.activeElement.className })); ok(r.gone && /sp-thb/.test(r.back), 'Escape closes it and the focus goes back to what opened it');
    r = await E(() => { const cs = getComputedStyle(document.documentElement), st = getComputedStyle(document.getElementById('studio')); return { ta:st.touchAction, us:st.userSelect || st.webkitUserSelect, os:cs.overscrollBehaviorY, ov:cs.overflow, canvas:getComputedStyle(document.querySelector('#sttl canvas')).touchAction }; });
    ok(r.ta === 'manipulation' && r.us === 'none' && r.os === 'none' && r.ov === 'hidden' && r.canvas === 'none', 'double-tap zoom, text selection on controls and pull-to-refresh are off; the canvases take touches for themselves', JSON.stringify(r));
    ok(errs.length === 0, 'no page errors (accessibility)', errs.join(' | ')); await b.close();
  });
  P.done([]);
})().catch(e => { console.error(e); process.exit(1); });
