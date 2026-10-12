const { chromium } = require('/home/claude/fltests/node_modules/playwright');
(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium', args:['--autoplay-policy=no-user-gesture-required','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
  const size = (process.argv[2] || '1440x900').split('x').map(Number);
  const p = await b.newPage({ viewport:{ width:size[0], height:size[1] } });
  const errs = [];
  p.on('pageerror', e => errs.push('PAGEERROR ' + e.message + '\n' + (e.stack||'').split('\n').slice(0,4).join('\n')));
  p.on('console', m => { if(m.type() === 'error' && !/fonts\.g|ERR_|Failed to load resource/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  await p.goto('http://localhost:' + (process.argv[3] || 8734) + '/index.html?fltest=1#write');
  await p.waitForTimeout(1500);
  console.log('view', await p.evaluate(() => document.body.dataset.view + ' ws=' + document.body.dataset.ws));
  await p.screenshot({ path:'shots/smoke1.png' });
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
