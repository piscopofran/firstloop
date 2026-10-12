// render-audition.js: decodes every file of sounds/ in Chromium and renders the audition material of
// tools/audition.html with an OfflineAudioContext. Maintainer tool; nothing here runs in the app.
//
//   node tools/render-audition.js [--out DIR] [--only id,id] [--no-render] [--no-decode]
//
// Writes into DIR (default: $FL_SOUNDS_WORK/audition or ./audition-out):
//   browser-decode.json            what decodeAudioData returned for every file (length, channels,
//                                  index of the first sample above 1 % and 10 % of the peak)
//   <id>_<what>.wav + .json        the render and the notes / hits that were scheduled
//                                  instruments: scale, chord, phrase, and hold (held instruments only)
//                                  kits: beat, pieces
// python3 tools/check-sounds.py --audition DIR then measures the renders.
//
// Needs Playwright: set FL_PLAYWRIGHT to the module path and FL_CHROMIUM to the browser binary if they
// are not in the default places.
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.dirname(__dirname);
const args = process.argv.slice(2);
function opt(name, def) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; }
const OUT = opt('--out', process.env.FL_SOUNDS_WORK ? path.join(process.env.FL_SOUNDS_WORK, 'audition') : path.join(ROOT, 'audition-out'));
const ONLY = opt('--only', '') ? opt('--only', '').split(',') : null;
const { chromium } = require(process.env.FL_PLAYWRIGHT || '/home/claude/fltests/node_modules/playwright');
const EXE = process.env.FL_CHROMIUM || '/opt/pw-browsers/chromium';

const TYPES = { '.html': 'text/html', '.json': 'application/json', '.mp3': 'audio/mpeg', '.js': 'text/javascript' };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = http.createServer((req, res) => {
    const rel = decodeURIComponent(req.url.split('?')[0]);
    const p = path.join(ROOT, rel);
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(p, (e, d) => {
      if (e) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream' });
      res.end(d);
    });
  }).listen(0);
  const port = srv.address().port;
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('http://127.0.0.1:' + port + '/tools/audition.html');
  await page.waitForFunction(() => document.querySelectorAll('#insts tbody tr').length > 0, null, { timeout: 30000 });
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'sounds', 'manifest.json')));
  const rows = await page.evaluate(() => [document.querySelectorAll('#insts tbody tr').length, document.querySelectorAll('#kits tbody tr').length]);
  console.log('page lists', rows[0], 'instruments and', rows[1], 'kits');

  if (!args.includes('--no-decode')) {
    const files = new Set();
    for (const i of man.instruments) for (const s of i.samples) files.add(s.file);
    for (const k of man.kits) {
      for (const p of Object.keys(k.pieces)) k.pieces[p].forEach(f => files.add(f));
      for (const p of Object.keys(k.layers || {})) k.layers[p].forEach(l => l.files.forEach(f => files.add(f)));
    }
    const list = Array.from(files);
    const out = [];
    for (let i = 0; i < list.length; i += 100) {
      out.push(...await page.evaluate(fl => window.FLAudition.decodeReport(fl), list.slice(i, i + 100)));
    }
    fs.writeFileSync(path.join(OUT, 'browser-decode.json'), JSON.stringify(out, null, 1));
    const bad = out.filter(o => o.error);
    console.log('decodeAudioData:', out.length - bad.length, 'of', out.length, 'files decoded' + (bad.length ? '; FAILED: ' + bad.map(b => b.file).join(', ') : ''));
  }

  if (!args.includes('--no-render')) {
    const jobs = [];
    for (const i of man.instruments) {
      if (ONLY && !ONLY.includes(i.id)) continue;
      for (const w of ['scale', 'chord', 'phrase'].concat(i.loop ? ['hold'] : [])) jobs.push([i.id, w]);
    }
    for (const k of man.kits) {
      if (ONLY && !ONLY.includes(k.id)) continue;
      jobs.push([k.id, 'beat'], [k.id, 'pieces']);
    }
    for (const [id, what] of jobs) {
      const r = await page.evaluate(([id, what]) => window.FLAudition.renderOffline(id, what), [id, what]);
      fs.writeFileSync(path.join(OUT, id + '_' + what + '.wav'), Buffer.from(r.wav, 'base64'));
      delete r.wav;
      fs.writeFileSync(path.join(OUT, id + '_' + what + '.json'), JSON.stringify(r));
      console.log(id, what, 'peak', (20 * Math.log10(r.peak || 1e-9)).toFixed(1), 'dBFS');
    }
  }
  await browser.close();
  srv.close();
  if (errors.length) { console.log('page errors:', errors.join(' | ')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
