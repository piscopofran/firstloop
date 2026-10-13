// helpers for the phone tests: a device from Playwright's list (touch, DPR, user agent), taps, the fake microphone
const { chromium, devices } = require('/home/claude/fltests/node_modules/playwright');
const L = require('./lib'), SG = require('./singer');
const PORT = process.env.PORT || 8734;
const DEV = { ip13:'iPhone 13', se:'iPhone SE', px7:'Pixel 7', ip13l:'iPhone 13 landscape', ipad:'iPad (gen 7)', ipadl:'iPad (gen 7) landscape', ipadpro:'iPad Pro 11', ipadprol:'iPad Pro 11 landscape' };
async function open(o){
  o = o || {};
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'].concat(o.args || []) });
  const d = devices[DEV[o.dev || 'ip13'] || o.dev];
  const ctx = await b.newContext(Object.assign({}, d, { acceptDownloads:true, colorScheme:o.theme === 'light' ? 'light' : 'dark' }, o.ctx || {}));
  if(o.perm !== false) await ctx.grantPermissions(['microphone']).catch(() => {});
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message + ' @ ' + ((e.stack || '').split('\n')[1] || '').trim()));
  p.on('console', m => { if(m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource|404|Manifest/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  if(o.init) await p.addInitScript(o.init);
  if(o.before) await o.before(p, ctx);
  if(o.mob) await p.addInitScript(m => { window.__flTestMob = m; }, o.mob);
  await p.goto('http://localhost:' + (o.port || PORT) + '/index.html?fltest=1' + (o.hash === undefined ? '#write' : o.hash));
  await p.waitForFunction(() => document.body.dataset.view, null, { timeout:15000 });
  if(o.hash === undefined || o.hash === '#write'){
    await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S && STUDIO._t.PH.built, null, { timeout:15000 });
    if(o.theme === 'light') await p.evaluate(() => { document.documentElement.setAttribute('data-theme', 'light'); });
    if(!o.noMic) await L.fakeMic(p);
    if(o.hp !== null) await p.evaluate(h => { STUDIO._t.PREF.hp = h; }, o.hp || 'wired');
  }
  await p.waitForTimeout(300);
  return { b, ctx, p, errs, d };
}
// every control that can be seen and pressed: its size, and whether the page scrolls sideways
async function audit(p, where){
  return p.evaluate(where => {
    const out = { small:[], side:document.documentElement.scrollWidth <= window.innerWidth + 1 && document.body.scrollWidth <= window.innerWidth + 1, n:0, unnamed:[] };
    const vis = e => { const r = e.getBoundingClientRect(); if(r.width < 1 || r.height < 1) return null; const cs = getComputedStyle(e); if(cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return null;
      const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)); const top = document.elementFromPoint(x, y); return top && (e.contains(top) || top.contains(e) || (top.closest('label') && top.closest('label').contains(e))) ? r : null; };
    const roots = where ? [...document.querySelectorAll(where)] : [document.getElementById('studio'), ...document.querySelectorAll('.st-sheet-back')];
    roots.forEach(root => { if(!root) return; root.querySelectorAll('button, select, input, textarea, summary, [role=button]').forEach(e => {
      if(e.disabled) return; const r = vis(e); if(!r) return; out.n++;
      let w = r.width, h = r.height;
      if(e.type === 'checkbox' || e.type === 'radio'){ const l = e.closest('label'); if(l){ const lr = l.getBoundingClientRect(); w = lr.width; h = lr.height; } }
      const name = (e.getAttribute('aria-label') || e.textContent || e.title || e.placeholder || (e.labels && e.labels[0] && e.labels[0].textContent) || '').trim();
      if(!name) out.unnamed.push(e.id || e.className);
      if(w < 43.5 || h < 43.5) out.small.push((e.id || e.className || e.tagName) + ' "' + name.slice(0, 18) + '" ' + Math.round(w) + 'x' + Math.round(h));
    }); });
    return out;
  }, where || null);
}
const tap = (p, sel) => p.locator(sel).first().tap();
module.exports = Object.assign({}, L, { open, audit, tap, DEV, devices, SG });
