// Numbers on a phone profile (Chromium, Pixel 7 descriptor): memory with five tracks and a three-minute take, the time to
// the first note of the first instrument on slow connections, frame rate while scrolling under a 4x slower processor,
// and what opening the page costs. Prints the numbers; fails only on the budgets named in the checks.
const P = require('./plib'), { ok } = P; const { execSync } = require('child_process');
const only = process.argv[2] || '';
const NET = { 'Fast 3G':{ down:1.6e6 * 0.9 / 8, up:750e3 * 0.9 / 8, lat:562 }, 'Slow 4G':{ down:4e6 / 8, up:3e6 / 8, lat:170 }, 'Fast 4G':{ down:9e6 / 8, up:1.5e6 / 8, lat:60 } };
const rssAll = () => { try { return execSync("ps -eo rss,args | grep -- '--type=renderer' | grep -v grep | awk '{print $1}'").toString().trim().split('\n').map(Number).filter(Boolean); } catch(e){ return []; } };
(async () => {
  if(!only || only === 'heap'){
    const { b, p, errs, ctx } = await P.open({ dev:'px7' });
    const cdp = await ctx.newCDPSession(p);
    const heap = async () => { await cdp.send('HeapProfiler.collectGarbage').catch(() => {}); const h = await cdp.send('Runtime.getHeapUsage'); return { js:h.usedSize / 1048576, back:(h.backingStorageSize || 0) / 1048576 }; };
    const rss0 = Math.max(0, ...rssAll()), h0 = await heap();
    await p.evaluate(() => { STUDIO._t.TEST.sampleRate = 48000; });
    const made = await p.evaluate(async () => {
      const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); await T.createSong('Heavy');
      const bt = 1920, bars = 90;                      // 3 minutes at 120
      T.S.tempo = 120;
      ['upright-bass', 'grand-piano', 'steel-guitar', 'strings'].forEach((id, k) => { const t = T.addTrack('inst', id, T.ENG.inst[id].name); const ns = []; for(let i = 0; i < bars * 4; i++) ns.push({ s:i * 480, l:440, p:[40, 60, 64, 67][k] + (i % 7), v:90 }); if(id === 'grand-piano') for(let i = 0; i < bars * 4; i++) ns.push({ s:i * 480, l:440, p:72 + (i % 5), v:80 }); T.addRegion(t, 0, bars * bt, ns); });
      const d = T.addTrack('drums', 'studio-kit', 'Drums'), rg = T.addRegion(d, 0, 64 * bt, []); T.drumPreset(rg, 'pop', 0, false);
      const v = T.addTrack('audio', '', 'Voice'); T.commit('x');
      await Promise.all(T.S.tracks.filter(t => t.kind !== 'audio').map(t => T.loadInst(t.inst)));
      // a three-minute take at the context's rate, in as a sound file is (decode, 16-bit copy for storage, a buffer to play)
      const sr = T.ENG.ctx.sampleRate, n = sr * 180, x = new Float32Array(n); for(let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i * 0.03) * (0.5 + 0.5 * Math.sin(i / sr * 2));
      const wav = T.wavBytes([x], sr, 16); T.select(v.id, null);
      const r = await STUDIO._t.audioImport ? null : null; void r;
      return { sr, wav:wav.length, tracks:T.S.tracks.length };
    });
    await p.evaluate(async () => { const T = STUDIO._t, sr = T.ENG.ctx.sampleRate, n = sr * 180, x = new Float32Array(n); for(let i = 0; i < n; i++) x[i] = 0.3 * Math.sin(i * 0.03) * (0.5 + 0.5 * Math.sin(i / sr * 2));
      const f = new File([T.wavBytes([x], sr, 16)], 'take.wav', { type:'audio/wav' }); const dt = new DataTransfer(); dt.items.add(f);
      document.getElementById('studio').dispatchEvent(new DragEvent('drop', { dataTransfer:dt, bubbles:true, cancelable:true })); });
    await p.waitForFunction(() => STUDIO._t.S.tracks[5].regions.length === 1, null, { timeout:60000 }); await p.waitForTimeout(800);
    const loaded = await p.evaluate(() => { const T = STUDIO._t; let inst = 0, takes = 0, ch = 0; Object.values(T.ENG.inst).forEach(d => { const add = z => { inst += z.buf.length * z.buf.numberOfChannels * 4; ch = Math.max(ch, z.buf.numberOfChannels); }; if(d.kit) Object.values(d.pieces).forEach(Ls => Ls.forEach(l => l.forEach(add))); else d.zones.forEach(add); }); Object.values(T.audioBufs).forEach(bf => { takes += bf.length * bf.numberOfChannels * 4; }); return { inst:inst / 1048576, takes:takes / 1048576, ch, secs:T.tickSec(T.songTicks()), ready:Object.values(T.ENG.inst).filter(d => d.state === 'ready').map(d => d.id) }; });
    await p.evaluate(() => STUDIO._t.transportPlay({ from:0 })); await p.waitForTimeout(6000);
    const h1 = await heap(), rss1 = Math.max(0, ...rssAll()), voices = await p.evaluate(() => STUDIO._t.ENG.G.voices.length);
    await p.evaluate(() => STUDIO._t.transportStop());
    console.log('five tracks (upright bass, grand piano, steel guitar, strings, studio kit) + a 3:00 take at ' + made.sr + ' Hz, song ' + loaded.secs.toFixed(0) + ' s');
    console.log('  instruments held: ' + loaded.inst.toFixed(1) + ' MB (max ' + loaded.ch + ' channel), takes held: ' + loaded.takes.toFixed(1) + ' MB; loaded: ' + loaded.ready.join(', '));
    console.log('  JS heap ' + h0.js.toFixed(1) + ' → ' + h1.js.toFixed(1) + ' MB, typed-array storage ' + h0.back.toFixed(1) + ' → ' + h1.back.toFixed(1) + ' MB, voices sounding ' + voices);
    console.log('  renderer process (RSS, includes the browser engine itself): ' + (rss0 / 1024).toFixed(0) + ' → ' + (rss1 / 1024).toFixed(0) + ' MB');
    const total = Math.max(loaded.inst + loaded.takes, h1.back) + h1.js;       // sound buffers that the page has looked into are counted under typed-array storage too
    ok(loaded.ch === 1 && total < 150 && (rss1 - rss0) / 1024 < 250, 'what the Studio holds with five tracks and a three-minute take: ' + total.toFixed(0) + ' MB (sound ' + (loaded.inst + loaded.takes).toFixed(0) + ', script ' + h1.js.toFixed(0) + '), under 250', 'renderer RSS ' + (rss1 / 1024).toFixed(0) + ' MB');
    ok(voices <= 32, 'no more than 32 voices at once on a phone', String(voices));
    // making the sound file of those three minutes
    const t0 = Date.now(); const ex = await p.evaluate(async () => { const T = STUDIO._t; const buf = await T.renderSong({}); const bytes = T.wavBytes(T.bufChans(buf), buf.sampleRate, 16); return { secs:buf.duration, mb:bytes.length / 1048576 }; });
    const h2 = await heap(), rss2 = Math.max(0, ...rssAll());
    console.log('  making the WAV of it (' + ex.secs.toFixed(0) + ' s, ' + ex.mb.toFixed(1) + ' MB): ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; afterwards heap+storage ' + (h2.js + h2.back).toFixed(0) + ' MB, RSS ' + (rss2 / 1024).toFixed(0) + ' MB');
    // another song: the last one's instruments are let go
    const after = await p.evaluate(async () => { const T = STUDIO._t; await T.createSong('Empty'); await new Promise(r => setTimeout(r, 300)); let inst = 0; Object.values(T.ENG.inst).forEach(d => { if(d.kit) Object.values(d.pieces || {}).forEach(Ls => Ls.forEach(l => l.forEach(z => { inst += z.buf.length * 4; }))); else d.zones.forEach(z => { inst += z.buf.length * z.buf.numberOfChannels * 4; }); }); return { inst:inst / 1048576, takes:Object.keys(T.audioBufs).length }; });
    ok(after.inst < 5, 'opening another song lets go of the instruments the last one used', after.inst.toFixed(1) + ' MB still held');
    ok(errs.length === 0, 'no page errors (heap)', errs.join(' | ')); await b.close();
  }
  if(!only || only === 'note'){
    for(const name of Object.keys(NET)){
      const { b, p, errs, ctx } = await P.open({ dev:'px7' });
      const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable');
      await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); await T.loadInst('basic:bass'); });
      await cdp.send('Network.emulateNetworkConditions', { offline:false, downloadThroughput:NET[name].down, uploadThroughput:NET[name].up, latency:NET[name].lat });
      const r = await p.evaluate(async () => { const T = STUDIO._t, t0 = performance.now(), t = T.addTrack('inst', 'upright-bass', 'Bass'); T.addRegion(t, 0, 1920, [{ s:0, l:400, p:40, v:100 }]); T.commit('x');
        const d = T.ENG.inst['upright-bass']; let first = 0, sounding = 0; const P2 = T.loadInst('upright-bass');
        // the stand-in sounds at once
        const v0 = T.playNote(T.ENG.G, t, 40, 100, T.ENG.ctx.currentTime + 0.01, 0.2); const stand = !!v0;
        await new Promise(res => { const iv = setInterval(() => { if(!first && d.zones.length){ const z = T.pickZone(d, 40, 100); if(z && Math.abs(z.nominal - 40) <= 2.5){ first = performance.now() - t0; const v = T.playNote(T.ENG.G, t, 40, 100, T.ENG.ctx.currentTime + 0.01, 0.3); sounding = v && v.src.buffer === z.buf ? 1 : 0; } } if(d.state === 'ready' || d.state === 'failed'){ clearInterval(iv); res(); } }, 20); });
        await P2; return { first, all:performance.now() - t0, state:d.state, stand, sounding, zones:d.zones.length, bytes:d.bytes }; });
      console.log(name + ': first instrument (upright bass, ' + Math.round(r.bytes / 1024) + ' KB in ' + r.zones + ' files): its own first note after ' + (r.first / 1000).toFixed(2) + ' s, all of it after ' + (r.all / 1000).toFixed(2) + ' s; until then the basic bass plays (at once: ' + r.stand + ')');
      ok(r.state === 'ready' && r.stand && r.sounding === 1 && r.first < r.all, name + ': a note is played by the basic sound at once, by the instrument’s own recording as soon as that one file is in, well before the rest');
      ok(errs.length === 0, 'no page errors (' + name + ')', errs.join(' | ')); await b.close();
    }
  }
  if(!only || only === 'fps'){
    const { b, p, errs, ctx } = await P.open({ dev:'px7' });
    const cdp = await ctx.newCDPSession(p);
    await p.evaluate(async () => { const T = STUDIO._t; await T.createSong('Scroll'); const bt = 1920;
      for(let k = 0; k < 8; k++){ const t = T.addTrack(k === 6 ? 'drums' : 'inst', k === 6 ? 'basic:kit' : 'basic:piano', 'Track ' + (k + 1)); for(let rg = 0; rg < 16; rg++){ const ns = []; for(let i = 0; i < 32; i++) ns.push({ s:i * 240, l:200, p:k === 6 ? [36, 38, 42][i % 3] : 48 + ((i * 5 + k * 3) % 24), v:90 }); T.addRegion(t, rg * 4 * bt, 4 * bt, ns); } }
      for(let i = 0; i < 8; i++) T.addSection('S' + i, i * 8, 8); for(let i = 0; i < 64; i++) T.S.chords.push({ t:i * bt, root:(i * 5) % 12, q:i % 2 ? 'min' : 'maj' });
      T.commit('x'); T.phGo('song'); });
    await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); await Promise.all(['basic:piano', 'basic:kit'].map(i => T.loadInst(i))); }); await p.waitForTimeout(800);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate:4 });
    const run = (sel, zoom) => p.evaluate(async ({ sel, zoom }) => { const T = STUDIO._t, host = document.querySelector(sel), V = sel === '#sttl' ? T.ARR.view : T.ROLL.view; if(zoom){ T.ARR.ppt = 0.08; V.paint(); }
      host.scrollLeft = 0; await new Promise(r => requestAnimationFrame(r)); const ts = [], ms = []; let dir = 1; const t0 = performance.now();
      await new Promise(res => { const step = t => { ts.push(t); if(V.lastMs !== undefined) ms.push(V.lastMs); host.scrollLeft += 9 * dir; if(host.scrollLeft <= 0 || host.scrollLeft >= host.scrollWidth - host.clientWidth - 2) dir = -dir; if(t - t0 < 3000) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); });
      const d = []; for(let i = 1; i < ts.length; i++) d.push(ts[i] - ts[i - 1]); d.sort((a, b2) => a - b2); ms.sort((a, b2) => a - b2);
      return { fps:(ts.length - 1) / ((ts[ts.length - 1] - ts[0]) / 1000), p95:d[Math.floor(d.length * 0.95)], worst:d[d.length - 1], paint:ms[ms.length >> 1], paint95:ms[Math.floor(ms.length * 0.95)], w:host.clientWidth, h:host.clientHeight, moved:host.scrollWidth - host.clientWidth }; }, { sel, zoom });
    let r = await run('#sttl', true);
    console.log('arrangement, 8 tracks × 16 parts, 4x slower processor: ' + r.fps.toFixed(1) + ' frames a second (95% of frames within ' + r.p95.toFixed(1) + ' ms, worst ' + r.worst.toFixed(1) + ' ms); drawing one frame takes ' + r.paint.toFixed(1) + ' ms (95%: ' + r.paint95.toFixed(1) + ') for ' + r.w + '×' + r.h + 'px');
    ok(r.fps >= 55 && r.paint95 < 12 && r.moved > 300, 'the arrangement scrolls at 60 frames a second under a 4x slower processor', r.fps.toFixed(1) + ' fps');
    await p.evaluate(() => { const T = STUDIO._t, t = T.S.tracks[0]; const ns = []; for(let i = 0; i < 256; i++) ns.push({ s:i * 120, l:110, p:48 + ((i * 7) % 24), v:90 }); t.regions.length = 0; const rg = T.addRegion(t, 0, 16 * 1920, ns); T.commit('y'); T.select(t.id, rg.id); T.phGo('edit', { tab:'notes' }); });
    await p.waitForTimeout(900);
    r = await run('#stroll', false);
    console.log('note grid, 256 notes over 16 bars, other tracks shown faintly, 4x slower processor: ' + r.fps.toFixed(1) + ' frames a second (95% within ' + r.p95.toFixed(1) + ' ms, worst ' + r.worst.toFixed(1) + ' ms); one frame ' + r.paint.toFixed(1) + ' ms (95%: ' + r.paint95.toFixed(1) + ') for ' + r.w + '×' + r.h + 'px');
    ok(r.fps >= 55 && r.paint95 < 12 && r.moved > 300, 'the note grid scrolls at 60 frames a second under a 4x slower processor', r.fps.toFixed(1) + ' fps');
    await cdp.send('Emulation.setCPUThrottlingRate', { rate:1 });
    const cv = await p.evaluate(() => { const c = document.querySelector('#stroll canvas'); return { w:c.width, cssw:c.clientWidth, dpr:devicePixelRatio }; });
    ok(cv.w <= cv.cssw * 2 + 1, 'canvases are drawn at no more than twice their size, whatever the screen’s density (' + cv.dpr + ' here)', cv.w + ' for ' + cv.cssw + 'px');
    ok(errs.length === 0, 'no page errors (fps)', errs.join(' | ')); await b.close();
  }
  if(!only || only === 'load'){
    const fs = require('fs'), W = '/home/claude/firstloop/.claude/worktrees/agent-a99ef2a66ebbbc977/index.html', zlib = require('zlib');
    const cur = fs.readFileSync(W), a = cur.indexOf('  // ===== Studio ====='), z = cur.indexOf('  // ===== /Studio ====='), ca = cur.indexOf('  /* ===== Studio (css) ===== */'), cz = cur.indexOf('  /* ===== /Studio (css) ===== */');
    console.log('index.html: ' + cur.length + ' bytes (' + zlib.gzipSync(cur).length + ' gzipped); the Studio block ' + (z - a) + ' js + ' + (cz - ca) + ' css');
    for(const name of ['Fast 4G', 'Fast 3G']){
      const { chromium, devices } = require('/home/claude/fltests/node_modules/playwright');
      const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required'] }); const ctx = await b.newContext(Object.assign({}, devices['Pixel 7'])); const p = await ctx.newPage();
      const cdp = await ctx.newCDPSession(p); await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', { offline:false, downloadThroughput:NET[name].down, uploadThroughput:NET[name].up, latency:NET[name].lat }); await cdp.send('Emulation.setCPUThrottlingRate', { rate:4 });
      // the live site sends the page gzipped; this server does not, so the line is made faster by the same ratio
      const ratio = cur.length / zlib.gzipSync(cur).length; await cdp.send('Network.emulateNetworkConditions', { offline:false, downloadThroughput:NET[name].down * ratio, uploadThroughput:NET[name].up, latency:NET[name].lat });
      const t0 = Date.now(); await p.goto('http://localhost:8734/index.html?fltest=1#write', { waitUntil:'commit' });
      await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.PH.built && !!document.getElementById('spnew'), null, { timeout:240000 });
      const ready = Date.now() - t0, nav = await p.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { resp:n.responseEnd, dcl:n.domContentLoadedEventEnd, size:n.transferSize }; });
      console.log(name + ', 4x slower processor: Home of the Studio can be used after ' + (ready / 1000).toFixed(1) + ' s (the page arrived after ' + (nav.resp / 1000).toFixed(1) + ' s, ' + Math.round(zlib.gzipSync(cur).length / 1024) + ' KB over the wire when gzipped; script ran until ' + (nav.dcl / 1000).toFixed(1) + ' s)');
      await b.close();
    }
  }
  P.done([]);
})().catch(e => { console.error(e); process.exit(1); });
