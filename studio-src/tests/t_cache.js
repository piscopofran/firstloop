// where the recorded instruments come from: beside the page, the two public addresses, the copy kept in the browser, and the basic sounds when there is nothing
const L = require('./lib'), { ok } = L;
const fs = require('fs'), path = require('path');
const { chromium } = require('/home/claude/fltests/node_modules/playwright');
const SND = path.join(__dirname, 'www/sounds');
const JSD = 'https://cdn.jsdelivr.net/gh/piscopofran/firstloop@main/sounds/', RAW = 'https://raw.githubusercontent.com/piscopofran/firstloop/main/sounds/';
async function page(ctx, port, routes){
  const p = await ctx.newPage(), errs = [], reqs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  await p.route('**/*', async r => {
    const u = r.request().url(); reqs.push(u);
    for(const [re, fn] of routes){ if(re.test(u)) return fn(r, u); }
    if(/^http:\/\/localhost/.test(u)) return r.continue();
    return r.abort();
  });
  await p.goto('http://localhost:' + port + '/index.html?fltest=1#write');
  await p.waitForFunction(() => window.STUDIO && STUDIO._t && STUDIO._t.S, null, { timeout:15000 });
  return { p, errs, reqs };
}
const serve = base => (r, u) => { const rel = decodeURIComponent(u.slice(base.length).split('?')[0]), f = path.join(SND, rel); if(!fs.existsSync(f)) return r.fulfill({ status:404, body:'' }); return r.fulfill({ status:200, contentType:/json$/.test(f) ? 'application/json' : 'audio/mpeg', headers:{ 'access-control-allow-origin':'*' }, body:fs.readFileSync(f) }); };
const blockAll = [[/sounds\//, r => r.abort()], [/jsdelivr|githubusercontent/, r => r.abort()]];
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required'] });
  // ---- A. beside the page ----
  const ctx = await b.newContext({ viewport:{ width:1440, height:900 } });
  let P = await page(ctx, 8734, []); let p = P.p;
  let r = await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); const prog = []; STUDIO.on('instload', d => { if(d.id === 'upright-bass') prog.push(Math.round(d.progress * 100) + d.state[0]); });
    const t = T.addTrack('inst', 'upright-bass', 'Bass'); T.addRegion(t, 0, 1920, [{ s:0, l:480, p:40, v:100 }]); T.commit('x'); const ok1 = await T.loadInst('upright-bass');
    const I = T.ENG.inst['upright-bass']; const files = await T.dbAll('files'); const kv = await T.dbGet('kv', 'manifest');
    return { ok1, state:I.state, zones:I.zones.length, prog:prog.slice(0, 4).join(' ') + ' … ' + prog.slice(-2).join(' '), nprog:prog.length, files:files.length, kv:!!(kv && kv.m), base:T.ENG.base, mstate:T.ENG.manifestState, n:T.instList().filter(d => !d.basic).length }; });
  ok(r.mstate === 'ready' && /localhost:8734\/sounds\//.test(r.base) && r.n >= 15, 'with sounds/ beside the page the list of instruments comes from there', r.base + ', ' + r.n + ' recorded');
  ok(r.ok1 && r.state === 'ready' && r.zones >= 10, 'an instrument is fetched when a track first uses it', r.zones + ' samples');
  ok(r.nprog >= r.zones && /^\d+l/.test(r.prog) && /100r$/.test(r.prog), 'its progress is reported file by file, ending at 100%', r.prog);
  ok(r.files >= r.zones && r.kv, 'the files and the list are kept in the browser’s own storage', r.files + ' files kept');
  const fetched = P.reqs.filter(u => /sounds\/upright-bass/.test(u)).length, others = P.reqs.filter(u => /sounds\/(grand-piano|flute|strings)\//.test(u)).length;
  ok(fetched >= r.zones && others === 0, 'only that instrument’s files were fetched', fetched + ' requests for it, ' + others + ' for others');
  // header shows it; a second use costs no request
  const before = P.reqs.length;
  r = await p.evaluate(async () => { const T = STUDIO._t; T.ENG.inst['upright-bass'].p = null; T.ENG.inst['upright-bass'].zones = []; T.ENG.inst['upright-bass'].state = 'none'; const ok2 = await T.loadInst('upright-bass'); return { ok2, z:T.ENG.inst['upright-bass'].zones.length }; });
  ok(r.ok2 && P.reqs.length === before, 'loading it again takes it from storage: no request at all', (P.reqs.length - before) + ' requests');
  await p.evaluate(() => STUDIO._t.saveNow()); await p.close();
  // ---- B. the same browser, later, with no connection ----
  P = await page(ctx, 8734, blockAll); p = P.p;
  r = await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); const m = await T.loadManifest(); const a = await T.loadInst('upright-bass'); const fl = T.addTrack('inst', 'flute', 'Flute'); T.addRegion(fl, 0, 1920, [{ s:0, l:480, p:72, v:100 }]); T.commit('fl'); const c = await T.loadInst('flute'); await T.loadInst('basic:flute'); T.refresh(true); await new Promise(q => setTimeout(q, 300));
    const head = Array.from(document.querySelectorAll('.st-thinst')).map(e => e.textContent);
    const buf = await T.renderSong({ limiter:false }); let pk = 0; const ch = buf.getChannelData(0); for(let i = 0; i < ch.length; i++) pk = Math.max(pk, Math.abs(ch[i]));
    return { m, mstate:T.ENG.manifestState, a, bass:T.ENG.inst['upright-bass'].state, c, flute:T.ENG.inst.flute.state, sound:T.soundFor(fl), head, pk, listed:T.instList().filter(d => !d.basic).length }; });
  ok(r.mstate === 'ready' && r.listed >= 15, 'with no connection the list of instruments is the one kept from last time', r.listed + ' listed');
  ok(r.a && r.bass === 'ready', 'the instrument used before plays from storage');
  ok(!r.c && r.flute === 'failed' && r.sound === 'basic:flute', 'one never fetched cannot be had: the basic sound of its family stands in', r.sound);
  ok(r.head.some(h => /Basic flute \(in place of Flute\)/.test(h)), 'and the track says so', r.head.join(' | '));
  ok(r.pk > 0.05, 'the song plays all the same', 'peak ' + r.pk.toFixed(3));
  await p.close(); await ctx.close();
  // ---- C. a first visit with nothing reachable ----
  const ctx2 = await b.newContext({ viewport:{ width:1440, height:900 } });
  P = await page(ctx2, 8735, blockAll); p = P.p;
  r = await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); const m = await T.loadManifest(); return { m, mstate:T.ENG.manifestState, note:T.ENG.note, list:T.instList().map(d => d.name).join(', ') }; });
  ok(r.m === false && r.mstate === 'failed' && /^Basic/.test(r.list) && !/Upright/.test(r.list), 'a first visit with no way to the recorded instruments: the basic sounds are what is listed', r.list);
  await p.click('#ststart-hum'); await p.waitForSelector('#stinst'); await p.waitForTimeout(300);
  let txt = await p.textContent('#stinst');
  ok(/could not be reached/.test(txt) && /Basic bass/.test(txt) && /generated on this device/.test(txt) && /Try again/.test(txt), 'the instrument list says so in words, calls them basic sounds, and offers to try again', txt.replace(/\s+/g, ' ').slice(-200));
  await p.click('#stinst [data-pick="basic:bass"]'); await p.waitForTimeout(300); await p.keyboard.press('Escape');
  r = await p.evaluate(async () => { const T = STUDIO._t, t = T.S.tracks[0]; T.addRegion(t, 0, 1920, [{ s:0, l:480, p:40, v:100 }, { s:480, l:480, p:43, v:100 }]); T.commit('n'); await T.loadInst('basic:bass'); const buf = await T.renderSong({ limiter:false }); let pk = 0; const ch = buf.getChannelData(0); for(let i = 0; i < ch.length; i++) pk = Math.max(pk, Math.abs(ch[i])); return { inst:t.inst, pk, head:document.querySelector('.st-thinst').textContent }; });
  ok(r.inst === 'basic:bass' && r.pk > 0.05 && /Basic bass/.test(r.head), 'a part on a basic sound plays, and is labelled as one', r.head + ', peak ' + r.pk.toFixed(3));
  // a song made elsewhere with a recorded instrument opens here on the stand-in of the same family
  r = await p.evaluate(async () => { const T = STUDIO._t; const id = await T.projectIn({ app:'firstloop-studio', v:1, song:{ name:'From elsewhere', tracks:[{ kind:'inst', inst:'cello', fam:'strings', name:'Cello', regions:[{ s:0, l:1920, pat:'p' }] }, { kind:'inst', inst:'upright-bass', fam:'bass', name:'Bass', regions:[{ s:0, l:1920, pat:'p' }] }, { kind:'drums', inst:'brush-kit', name:'Drums', regions:[{ s:0, l:1920, pat:'d' }] }], pats:{ p:{ len:1920, notes:[{ s:0, l:480, p:48, v:90 }] }, d:{ len:1920, notes:[{ s:0, l:60, p:36, v:100 }] } } }, audio:[] }); await T.openSong(id); await new Promise(q => setTimeout(q, 500)); return T.S.tracks.map(t => T.soundFor(t)).join(','); });
  ok(r === 'basic:strings,basic:bass,basic:kit', 'a song that names recorded instruments opens on the basic sound of each one’s family', r);
  await ctx2.close();
  // ---- D. the public addresses ----
  const ctx3 = await b.newContext({ viewport:{ width:1440, height:900 } });
  P = await page(ctx3, 8735, [[/^https:\/\/cdn\.jsdelivr\.net\/gh\/piscopofran\/firstloop@main\/sounds\//, serve(JSD)], [/githubusercontent/, r2 => r2.abort()]]); p = P.p;
  r = await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); const m = await T.loadManifest(); const a = await T.loadInst('flute'); return { m, base:T.ENG.base, a, z:T.ENG.inst.flute.zones.length }; });
  ok(r.m && /cdn\.jsdelivr\.net\/gh\/piscopofran\/firstloop@main\/sounds\//.test(r.base) && r.a && r.z >= 5, 'on the live site (no sounds/ beside the page) they come from jsDelivr', r.base);
  ok(P.reqs.filter(u => /localhost:8735\/sounds\/manifest/.test(u)).length === 1, 'after one look beside the page');
  await ctx3.close();
  const ctx4 = await b.newContext({ viewport:{ width:1440, height:900 } });
  P = await page(ctx4, 8735, [[/jsdelivr/, r2 => r2.abort()], [/^https:\/\/raw\.githubusercontent\.com\/piscopofran\/firstloop\/main\/sounds\//, serve(RAW)]]); p = P.p;
  r = await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); const m = await T.loadManifest(); const a = await T.loadInst('studio-kit'); return { m, base:T.ENG.base, a, pcs:Object.keys(T.ENG.inst['studio-kit'].pieces).length }; });
  ok(r.m && /raw\.githubusercontent\.com\/piscopofran\/firstloop\/main\/sounds\//.test(r.base) && r.a && r.pcs >= 10, 'and from raw.githubusercontent.com when jsDelivr does not answer', r.base + ', kit pieces ' + r.pcs);
  // one file that fails on the first address is fetched from the next
  await ctx4.close();
  const ctx5 = await b.newContext({ viewport:{ width:1440, height:900 } }); let dropped = 0;
  P = await page(ctx5, 8735, [[/jsdelivr.*flute\/0(60|72)/, r2 => { dropped++; return r2.abort(); }], [/^https:\/\/cdn\.jsdelivr\.net\/gh\/piscopofran\/firstloop@main\/sounds\//, serve(JSD)], [/^https:\/\/raw\.githubusercontent\.com\/piscopofran\/firstloop\/main\/sounds\//, serve(RAW)]]); p = P.p;
  r = await p.evaluate(async () => { const T = STUDIO._t; await T.ensureEngine(); await T.loadManifest(); const a = await T.loadInst('flute'); return { a, z:T.ENG.inst.flute.zones.length, want:T.ENG.inst.flute.def.samples.length }; });
  ok(r.a && r.z === r.want && dropped >= 1, 'a file the first address fails to give is taken from the second: the instrument is whole', r.z + ' of ' + r.want + ' samples, ' + dropped + ' dropped on the way');
  await ctx5.close();
  await b.close(); L.done(P.errs);
})().catch(e => { console.error(e); process.exit(1); });
