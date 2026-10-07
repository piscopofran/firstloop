#!/usr/bin/env node
// make-crates.js: writes crates.json, the pinned starter crates for Free music in the DJ area.
//
// Why it exists. Without crates.json the page works each starter crate out by itself: the
// most downloaded releases of a style on archive.org, under the licences that allow mixing.
// That is a saved search, and nobody has listened to what it finds. This script runs the
// same search from a machine that can reach archive.org, checks every file, and writes the
// result down, so that a person can listen, throw out what does not belong, and publish a
// list that then stays the same for everyone.
//
// What it does, in order:
//   1. reads the rules out of ../index.html (the part between "fm:pure begin" and
//      "fm:pure end"), so this script and the page can never disagree about a licence;
//   2. for each crate asks archive.org for the most downloaded releases of its style;
//   3. reads each release's own page (metadata) and keeps tracks of 3 to 9 minutes, MP3,
//      under CC BY, CC BY-SA, CC0 or the Public Domain Mark, at most two per release;
//   4. with --check, asks for the first bytes of every chosen file to see that it is there;
//   5. prints the list with the address of each release, and writes crates.json.
//
// Use (Node 18 or newer, no packages to install):
//   node tools/make-crates.js                      writes ./crates.json next to index.html
//   node tools/make-crates.js --check              the same, and tests that each file answers
//   node tools/make-crates.js --per 12 --look 80   12 tracks a crate, from the top 80 releases
//   node tools/make-crates.js --crates house,techno
//   node tools/make-crates.js --drop someIdentifier,anotherIdentifier
//                                                  leave these releases out (after listening)
//   node tools/make-crates.js --out /tmp/crates.json --index ./index.html
// Then put crates.json beside index.html on the web server. Delete it to go back to the
// saved searches. The page reads the licence of every pinned track again from archive.org
// before it downloads one, so a list that has gone stale cannot let a wrong licence through.
//
// Manners: one request at a time, a pause between them, and a User-Agent that says who is asking.
'use strict';
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
function opt(name, def){ const i = args.indexOf('--' + name); return i < 0 ? def : (args[i + 1] === undefined || /^--/.test(args[i + 1]) ? true : args[i + 1]); }
if(args.indexOf('--help') >= 0 || args.indexOf('-h') >= 0){ console.log(fs.readFileSync(__filename, 'utf8').split('\n').filter(l => /^\/\//.test(l)).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); process.exit(0); }
const INDEX = path.resolve(String(opt('index', path.join(__dirname, '..', 'index.html'))));
const OUT = path.resolve(String(opt('out', path.join(path.dirname(INDEX), 'crates.json'))));
const PAUSE = +opt('pause', 700), CHECK = !!opt('check', false);
const DROP = String(opt('drop', '')).split(',').map(s => s.trim()).filter(Boolean);
const UA = 'FirstLoop-make-crates/1 (starter crates for the First Loop DJ area; one request at a time)';

// ---- the page's own rules
function rules(){
  const html = fs.readFileSync(INDEX, 'utf8');
  const a = html.indexOf('// --- fm:pure begin ---'), b = html.indexOf('// --- fm:pure end ---');
  if(a < 0 || b < a) throw new Error('The rules were not found in ' + INDEX + ' (looked for "fm:pure begin" and "fm:pure end").');
  const src = html.slice(html.indexOf('\n', a) + 1, b);
  return new Function(src + '\nreturn { FM_CFG:FM_CFG, fmLicence:fmLicence, fmSearchURL:fmSearchURL, fmRow:fmRow, fmParseItem:fmParseItem, fmCratePick:fmCratePick, fmMetaURL:fmMetaURL, fmFileURL:fmFileURL, fmItemURL:fmItemURL, fmCrateRow:fmCrateRow };')();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url){
  for(let tries = 0; ; tries++){
    await sleep(PAUSE);
    let r;
    try { r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } }); }
    catch(e){ if(tries < 2){ await sleep(3000 * (tries + 1)); continue; } throw new Error('archive.org could not be reached (' + (e.cause && e.cause.code || e.message) + ').'); }
    if(r.status === 429 || r.status >= 500){
      if(tries >= 4) throw new Error('archive.org keeps answering ' + r.status + '. Try again later.');
      const ra = parseFloat(r.headers.get('retry-after')) || 0;
      await sleep(ra > 0 ? Math.min(ra, 60) * 1000 : 4000 * Math.pow(2, tries));
      continue;
    }
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch(e){ const err = new Error('archive.org answered with something that is not JSON (HTTP ' + r.status + ').'); err.refused = true; throw err; }
    if(typeof j === 'string' || (j && j.error !== undefined && j.response === undefined && j.metadata === undefined)){ const err = new Error('archive.org refused the request: ' + (typeof j === 'string' ? j : j.error)); err.refused = true; throw err; }
    if(!r.ok){ const err = new Error('archive.org answered HTTP ' + r.status + '.'); err.refused = true; throw err; }
    return j;
  }
}
async function fileAnswers(url){
  await sleep(PAUSE);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Range': 'bytes=0-2047' } });
    if(!(r.status === 200 || r.status === 206)) return 'HTTP ' + r.status;
    const b = new Uint8Array(await r.arrayBuffer());
    if(b.length < 4) return 'empty';
    const head = String.fromCharCode(b[0], b[1], b[2], b[3]);
    return /^ID3/.test(head) || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) || /^(RIFF|OggS|fLaC)/.test(head) ? '' : 'not audio';
  } catch(e){ return 'unreachable'; }
}

(async () => {
  const R = rules(), C = R.FM_CFG;
  if(opt('origin', '')) C.origin = String(opt('origin'));             // for trying the script against a stand-in server
  const per = +opt('per', C.crate.size), look = +opt('look', Math.max(C.crate.look, per * 5));
  const want = String(opt('crates', C.crates.map(c => c.id).join(','))).split(',').map(s => s.trim()).filter(Boolean);
  const out = { version: 1, made: new Date().toISOString().slice(0, 10), source: C.origin, note: 'Made by tools/make-crates.js. Tracks of 3 to 9 minutes from the most downloaded releases of each style under licences that allow mixing.', crates: {} };
  let plain = false, short = 0;
  for(const id of want){
    const def = C.crates.filter(c => c.id === id)[0];
    if(!def){ console.error('No crate called "' + id + '". The crates are: ' + C.crates.map(c => c.id).join(', ') + '.'); process.exitCode = 2; continue; }
    console.error('\n' + def.name);
    let res;
    try { res = await getJSON(R.fmSearchURL(def.genre, '', 'downloads', 1, look, plain)); }
    catch(e){ if(!e.refused || plain) throw e; console.error('  the fuller question was refused (' + e.message + '); asking the plain one (CC BY only)'); plain = true; res = await getJSON(R.fmSearchURL(def.genre, '', 'downloads', 1, look, true)); }
    const docs = res && res.response && Array.isArray(res.response.docs) ? res.response.docs : [];
    const rows = docs.map(R.fmRow).filter(Boolean).filter(r => DROP.indexOf(r.id) < 0);
    console.error('  ' + docs.length + ' releases answered, ' + rows.length + ' may be listed' + (docs.length - rows.length ? ' (' + (docs.length - rows.length) + ' dropped: licence, identifier or --drop)' : ''));
    const rels = [];
    let picked = [];
    for(const row of rows){
      if(picked.length >= per) break;
      let rel = null;
      try { rel = R.fmParseItem(row.id, await getJSON(R.fmMetaURL(row.id))); } catch(e){ console.error('  ' + row.id + ': ' + e.message); continue; }
      if(!rel || !rel.lic.ok){ console.error('  ' + row.id + ': its own page does not give an allowed licence; left out'); continue; }
      rels.push(rel);
      picked = R.fmCratePick(rels, Object.assign({}, C.crate, { size: per }));
    }
    const list = [];
    for(const p of picked){
      let why = '';
      if(CHECK) why = await fileAnswers(R.fmFileURL(p.id, p.file));
      const lic = R.fmLicence(p.lic);
      console.error('  ' + (why ? 'SKIP (' + why + ') ' : '') + '"' + p.title + '" by ' + (p.artist || 'unknown artist') + '  ' + Math.floor(p.secs / 60) + ':' + ('0' + Math.round(p.secs % 60)).slice(-2) + '  ' + lic.name + '  ' + R.fmItemURL(p.id));
      if(why) continue;
      list.push({ identifier: p.id, file: p.file, title: p.title, artist: p.artist, release: p.release, label: p.label, licenseurl: lic.url, seconds: Math.round(p.secs), bytes: p.size });
    }
    // what is written must read back as the page will read it
    const back = list.map(R.fmCrateRow).filter(Boolean);
    if(back.length !== list.length) throw new Error('Internal check failed for ' + id + ': ' + (list.length - back.length) + ' rows would not be accepted by the page.');
    if(list.length < Math.min(3, per)){ console.error('  only ' + list.length + ' tracks: this crate is left out of the file, so the page will use its saved search'); short++; continue; }
    out.crates[id] = list;
  }
  if(!Object.keys(out.crates).length){ console.error('\nNothing to write.'); process.exit(1); }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n');
  console.error('\nWrote ' + OUT + ': ' + Object.keys(out.crates).map(k => k + ' ' + out.crates[k].length).join(', ') + '.' + (plain ? ' CC BY only (the fuller question was refused).' : '') +
    '\nListen to each release at the addresses above before publishing; run again with --drop <identifier> to leave one out.');
  if(short) process.exitCode = 3;
})().catch(e => { console.error('\nStopped: ' + e.message); process.exit(1); });
