// A tablet on its side gets the desk layout with controls a finger can hit; upright it gets the phone layout with more room.
// node t_tablet.js   (iPad gen 7 and iPad Pro 11, both ways, dark and light; photographed)
const { chromium, devices } = require('/home/claude/fltests/node_modules/playwright');
const P = require('./plib'), { ok } = P;
(async () => {
  for(const [tag, name, theme] of [['ipadl', 'iPad (gen 7) landscape', 'dark'], ['ipadl-light', 'iPad (gen 7) landscape', 'light'], ['ipadprol', 'iPad Pro 11 landscape', 'dark'], ['ipad', 'iPad (gen 7)', 'dark'], ['ipadpro', 'iPad Pro 11', 'dark']]){
    const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
    const ctx = await b.newContext(Object.assign({}, devices[name], { colorScheme:theme })); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('http://localhost:8734/index.html?fltest=1#write'); await p.waitForFunction(() => typeof STUDIO !== 'undefined' && STUDIO && STUDIO._t && STUDIO._t.S, null, { timeout:20000 });
    if(theme === 'light') await p.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await p.evaluate(async () => { const T = STUDIO._t; await T.loadManifest(); await T.createSong('Tablet'); T.S.key = { root:4, scale:'minor' };
      const t = T.addTrack('inst', 'basic:bass', 'Bass'); const r = T.addRegion(t, 0, 7680, [40, 43, 45, 43, 40, 38, 40, 45].map((pp, i) => ({ s:i * 960, l:800, p:pp, v:90 })));
      const t2 = T.addTrack('inst', 'basic:piano', 'Piano'); T.addRegion(t2, 0, 7680, [52, 55, 59, 60].map((pp, i) => ({ s:i * 1920, l:1800, p:pp, v:80 })));
      T.commit('seed'); T.select(t.id, r.id); if(T.phoneOn()) T.phGo('edit', { tab:'notes' }); else T.layout && T.layout(); });
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => { const T = STUDIO._t, vis = e => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const small = []; document.querySelectorAll('#studio button, #studio select, #studio input').forEach(e => { if(e.disabled || !vis(e)) return; const q = e.getBoundingClientRect(); const pad = e.classList.contains('st-q') ? 12 : 0, hit = /quiet|st-thname|st-thinst/.test(e.className) ? [6, 14] : /st-ms|st-threc/.test(e.className) ? [2, 10] : [pad, pad];   // the area that answers, where it is larger than what is drawn
        if(q.height + hit[1] < 29.5 || q.width + hit[0] < 29.5) small.push((e.id || e.className) + ' ' + Math.round(q.width) + 'x' + Math.round(q.height)); });
      return { phone:T.phoneOn(), touch:document.documentElement.dataset.sttouch, side:document.documentElement.scrollWidth <= innerWidth + 1, w:innerWidth, h:innerHeight, rollH:T.ROLL.host.clientHeight, rollW:T.ROLL.host.clientWidth, small, asst:document.body.dataset.asst || '' }; });
    await p.screenshot({ path:'shots/tb-' + tag + '.png' });
    const land = r.w > r.h;
    ok(r.phone === !land, tag + ' (' + r.w + 'x' + r.h + '): ' + (land ? 'the desk layout' : 'the phone layout, with more room'));
    ok(r.side, tag + ': nothing scrolls sideways');
    ok(r.rollH >= 180 && r.rollW >= 500, tag + ': the note editor has room', r.rollW + 'x' + r.rollH);
    if(land) ok(r.touch === 'true' && r.small.length === 0, tag + ': every control of the desk layout is 30px or more for a finger', r.small.slice(0, 6).join(' | '));
    else { const a = await P.audit(p); ok(a.small.length === 0 && a.side, tag + ': every control is 44px or more', a.small.slice(0, 5).join(' | ')); }
    ok(errs.length === 0, tag + ': no page errors', errs.join(' | ')); await b.close();
  }
  P.done([]);
})().catch(e => { console.error(e); process.exit(1); });
