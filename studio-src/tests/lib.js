// helpers for the Studio's Playwright tests
const { chromium } = require('/home/claude/fltests/node_modules/playwright');
const SG = require('./singer');
const PORT = process.env.PORT || 8734;
async function open(o){
  o = o || {};
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'].concat(o.args || []) });
  const ctx = await b.newContext({ viewport:{ width:o.w || 1440, height:o.h || 900 }, hasTouch:!!o.touch, deviceScaleFactor:o.dpr || 1, acceptDownloads:true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim()));
  p.on('console', m => { if(m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|404/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  if(o.init) await p.addInitScript(o.init);
  await p.goto('http://localhost:' + (o.port || PORT) + '/index.html?fltest=1' + (o.hash === undefined ? '#write' : o.hash));
  await p.waitForFunction(() => document.body.dataset.view, null, { timeout:15000 });
  if(o.hash === undefined || o.hash === '#write'){
    await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S, null, { timeout:15000 });
    if(o.theme === 'light') await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
    if(!o.noMic) await fakeMic(p);
  }
  return { b, ctx, p, errs };
}
// the microphone becomes a gain node the test plays into
async function fakeMic(p){
  await p.evaluate(() => { const T = STUDIO._t; T.TEST.micNode = ctx => { window.__mic = ctx.createGain(); return window.__mic; }; });
}
function f32b64(x){ return Buffer.from(x.buffer, x.byteOffset, x.byteLength).toString('base64'); }
// samples for the fake microphone: prep() puts them in the page ahead of time, fire() starts them at a time on the context's clock
async function prep(p, x, sr){
  return p.evaluate(({ b, sr }) => {
    const raw = atob(b), u = new Uint8Array(raw.length); for(let i = 0; i < raw.length; i++) u[i] = raw.charCodeAt(i);
    window.__bufs = window.__bufs || []; window.__bufs.push({ f:new Float32Array(u.buffer), sr }); return window.__bufs.length - 1;
  }, { b:f32b64(x), sr });
}
async function fire(p, id, at, gain){
  const m = await p.evaluate(({ id, at, gain }) => {
    const T = STUDIO._t, ctx = T.ENG.ctx, B = window.__bufs[id], buf = ctx.createBuffer(1, B.f.length, B.sr); buf.getChannelData(0).set(B.f);
    const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = gain === undefined ? 1 : gain; s.buffer = buf; s.connect(g); g.connect(window.__mic); s.start(at);
    return at - ctx.currentTime;
  }, { id, at, gain });
  if(m < 0.02) console.log('WARNING: the fake singer started late by ' + (-m).toFixed(3) + ' s');
  return m;
}
async function feed(p, x, sr, at, gain){ const id = await prep(p, x, sr); return fire(p, id, at, gain); }
// notes: [[midi, beats], ...] sung so that the first note starts on the bar; returns the singer's signal and truth
function tune(steps, bpm, so){ const notes = SG.melody(steps, bpm, { start:0, gate:so && so.gate }); const s = SG.sing(notes, Object.assign({ style:'da', tail:0.3 }, so || {})); return s; }
const T = (p, fn, arg) => p.evaluate(fn, arg);
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0; const fails = [];
function ok(c, name, extra){ if(typeof c === 'string'){ const t = c; c = name; name = t; } if(c){ pass++; console.log('PASS ' + name + (extra ? '  [' + extra + ']' : '')); } else { fail++; fails.push(name); console.log('FAIL ' + name + (extra ? '  [' + extra + ']' : '')); } }
function done(errs){ if(errs && errs.length){ console.log('page errors:\n' + errs.join('\n')); } console.log('\n' + pass + ' passed, ' + fail + ' failed' + (errs ? ', ' + errs.length + ' page errors' : '')); if(fails.length) console.log('failed: ' + fails.join(' | ')); process.exitCode = fail || (errs && errs.length) ? 1 : 0; }
module.exports = { open, fakeMic, feed, prep, fire, tune, T, sleep, ok, done, SG, f32b64, counts:() => ({ pass, fail }) };
