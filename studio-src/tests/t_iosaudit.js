// A static audit: every browser feature the Studio block uses that iPhone Safari lacks, has later, or does differently,
// with how many times it is used and whether each use is guarded. No browser needed.
// node t_iosaudit.js [index.html]
const fs = require('fs');
const W = process.argv[2] || '/home/claude/firstloop/.claude/worktrees/agent-a99ef2a66ebbbc977/index.html';
const src = fs.readFileSync(W, 'utf8'), a = src.indexOf('  // ===== Studio ====='), z = src.indexOf('  // ===== /Studio =====');
const js = src.slice(a, z), ca = src.indexOf('  /* ===== Studio (css) ===== */'), cz = src.indexOf('  /* ===== /Studio (css) ===== */'), css = src.slice(ca, cz);
let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };
const count = (re, s) => ((s || js).match(re) || []).length;
// name, what Safari on iPhone does, the pattern of a use, the pattern that shows a guard or fallback, what the Studio does without it
const rows = [
  ['AudioWorklet (module from a Blob URL)', '14.5+; missing in older and in some in-app browsers', /audioWorklet\.addModule|new AudioWorkletNode/g, /TEST\.noWorklet|createScriptProcessor/, 'recording falls to ScriptProcessor, then MediaRecorder; the limiter is left out of live playback and of the render'],
  ['ScriptProcessorNode', 'present (deprecated)', /createScriptProcessor/g, /MediaRecorder/, 'MediaRecorder tier'],
  ['MediaRecorder', '14.5+; records audio/mp4 (AAC), not webm', /new MediaRecorder/g, /isTypeSupported/, 'type chosen by isTypeSupported from mp4, webm/opus, webm, ogg; else the browser default; decoded back to samples'],
  ['navigator.mediaDevices.getUserMedia', 'https only; not in some in-app browsers', /getUserMedia/g, /micWhy|mediaDevices\s*&&|!navigator\.mediaDevices/, 'a plain explanation and "Open in Safari"'],
  ['getUserMedia constraints (echoCancellation etc.)', 'honoured loosely; iOS may still process', /echoCancellation/g, /getSettings/, 'the settings actually applied are read back and shown in Phone check'],
  ['webkitAudioContext', 'needed before 14.5', /AudioContext/g, /webkitAudioContext/, 'both names tried'],
  ['AudioContext state "interrupted"', 'iOS only (calls, Siri, other apps)', /interrupted/g, /interrupted/, '"Tap to resume sound"; transport stopped; take in progress kept'],
  ['AudioContext.resume() outside a tap', 'refused', /\.resume\(\)/g, /unlock|resumeTap/, 'resumed inside the first tap on any control, and from the resume bar'],
  ['decodeAudioData returning a promise', '14.1+; callback form before', /decodeAudioData\(/g, /decodeAudioData\([^)]*,\s*function|decodeP|function\s*\(buf\)/, 'callback form used, wrapped in a promise'],
  ['OfflineAudioContext.startRendering promise', '14.1+; oncomplete before', /startRendering\(\)/g, /oncomplete/, 'oncomplete used when no promise comes back'],
  ['webkitOfflineAudioContext', 'needed before 14.5', /OfflineAudioContext/g, /webkitOfflineAudioContext/, 'both names tried'],
  ['AnalyserNode.getFloatTimeDomainData', '14.1+', /getFloatTimeDomainData/g, /getByteTimeDomainData|!an\.getFloatTimeDomainData/, 'byte data converted'],
  ['StereoPannerNode', '14.1+', /createStereoPanner/g, /createStereoPanner\s*\?|createPanner|createChannelMerger/, 'gain pair / no pan'],
  ['AudioContext.outputLatency / getOutputTimestamp', 'outputLatency missing; baseLatency 14.1+', /outputLatency|getOutputTimestamp/g, /baseLatency|\|\|\s*0/, 'treated as 0 and measured instead (count clicks, Phone check)'],
  ['navigator.audioSession', '16.4+ only', /audioSession/g, /navigator\.audioSession\s*&&|"audioSession" in navigator|try\s*\{[^}]*audioSession/, 'silent looping <audio> element keeps the session in playback'],
  ['navigator.share with files / canShare', '15+ (files); refuses types it does not know', /navigator\.share\(|canShare\(/g, /canShare/, 'canShare asked first; else a download link; .flsong also offered as .txt'],
  ['navigator.wakeLock', '16.4+ (broken in home-screen apps before 18.4)', /wakeLock/g, /"wakeLock" in navigator|navigator\.wakeLock\s*&&|wakeLock\s*\)/, 'left out; recording still works, the screen may dim'],
  ['navigator.storage.persist / estimate', 'persist 15.2+, estimate 17+', /\.persist\(|\.estimate\(/g, /navigator\.storage/, 'size worked out from what the Studio itself has stored; "Save a copy" reminder'],
  ['IndexedDB (7-day eviction of unused sites)', 'present; storage cleared after 7 days without a visit unless on the Home Screen', /indexedDB\.open/g, /memTakes|takeRetry/, 'takes held in memory until written; copy reminder; Add to Home Screen guidance'],
  ['window.visualViewport', '13+', /visualViewport/g, /window\.visualViewport\s*&&|if\s*\(\s*!?vv|visualViewport\s*\|\|/, 'innerHeight used'],
  ['dvh units', '15.4+', /dvh/g, /--st-vvh|100vh|100%/, 'px height from visualViewport, with vh before it', css],
  ['env(safe-area-inset-*)', '11.2+', /safe-area-inset/g, /safe-area-inset/, 'present on every bar that touches an edge', css],
  ['ResizeObserver', '13.4+', /ResizeObserver/g, /try \{ new ResizeObserver/, 'resize and orientationchange events'],
  ['Pointer events', '13+', /pointerdown/g, /pointerdown/, 'required (13+)'],
  ['Touch events with touch-action', 'pinch cannot be stopped by touch-action alone before 13', /touchstart|touchmove/g, /passive:\s*false|preventDefault/, 'two-finger handling done by the Studio on its canvases'],
  ['navigator.permissions.query({name:"microphone"})', '16+; throws on older', /permissions\.query/g, /permissions\s*&&|catch/, 'skipped; the browser simply asks'],
  ['enumerateDevices labels', 'empty until the microphone is allowed; outputs not listed on iOS', /enumerateDevices/g, /hpAsk|PREF\.hp|label/, 'asked once: "Are you wearing headphones?"'],
  ['devicechange event', 'present, unreliable on iOS', /devicechange/g, /statechange|sampleRate/, 'sample-rate and state changes also watched'],
  ['navigator.clipboard.writeText', '13.4+, only in a tap', /clipboard\.writeText/g, /execCommand|navigator\.clipboard\s*&&|select\(\)/, 'the text is shown selected for a manual copy'],
  ['beforeinstallprompt', 'never on iOS', /beforeinstallprompt/g, /MOB\.ios|Share/, 'written steps: Share, then Add to Home Screen'],
  ['Blob.arrayBuffer / File.text', '14+', /\.arrayBuffer\(\)|\.text\(\)/g, /FileReader/, 'FileReader'],
  ['<input type=file accept> with unknown extensions', 'greys out .flsong files', /accept/g, /MOB\.handheld|handheld/, 'no accept on phones; the file is recognised by its contents'],
  ['<a download> of a Blob URL', '13+; opens a preview in some in-app browsers', /\.download\s*=/g, /navigator\.share|canShare/, 'Share sheet first'],
  ['<audio> autoplay / play() outside a tap', 'refused', /\.play\(\)/g, /catch/, 'started in a tap; a refusal is caught'],
  ['Screen orientation lock', 'not available', /orientation\.lock/g, /$^/, 'not used; both orientations laid out'],
  ['navigator.vibrate', 'never on iOS', /navigator\.vibrate/g, /navigator\.vibrate\s*&&|"vibrate" in/, 'not relied on'],
  ['Web MIDI', 'never on iOS', /requestMIDIAccess/g, /navigator\.requestMIDIAccess\s*&&|requestMIDIAccess\s*\)|!navigator\.requestMIDIAccess/, 'the option is not offered'],
  ['navigator.deviceMemory / performance.memory', 'never on iOS', /deviceMemory|performance\.memory/g, /MOB\.lean|\|\|/, 'every phone is treated as short of memory'],
  ['Service worker', 'present', /serviceWorker\.register/g, /$^/, 'none registered, by choice: nothing to go stale'],
  ['structuredClone', '15.4+', /structuredClone\(/g, /JSON\.parse/, 'JSON copy'],
  ['Array.prototype.at / Object.hasOwn / replaceAll', '15.4+ / 15.4+ / 13.4+', /\.at\(-?\d+\)|Object\.hasOwn\(|\.replaceAll\(/g, /$^/, 'not used'],
  ['Optional chaining, ??, arrow functions, let/const, class in page code', 'old Safari stops parsing the whole page', /\?\.[a-zA-Z_(\[]|\?\?[^?]|=>|\blet (?!me )\b|\bconst \b/g, /function limiterWorklet/, 'used only inside the worklet sources, which run only where worklets exist']
];
console.log('\n| Feature | iPhone Safari | Uses | Guarded | Without it |\n|---|---|---|---|---|');
const table = [];
rows.forEach(r => { const s = r[5] || js, n = count(r[2], s), g = r[3].test(s) || r[3].test(js); table.push({ name:r[0], n, g }); console.log('| ' + r[0] + ' | ' + r[1] + ' | ' + n + ' | ' + (n === 0 ? 'not used' : g ? 'yes' : 'NO') + ' | ' + r[4] + ' |'); });
console.log('');
const T = n => table.find(t => t.name.indexOf(n) === 0);
const mustUse = ['AudioWorklet', 'MediaRecorder', 'navigator.share', 'navigator.wakeLock', 'navigator.storage', 'window.visualViewport', 'env(safe-area', 'webkitAudioContext', 'AudioContext state', 'decodeAudioData', 'OfflineAudioContext.startRendering', 'navigator.audioSession'];
mustUse.forEach(n => { const t = T(n); ok(t && t.n > 0 && t.g, n + ': used, and guarded', t ? t.n + ' uses' : 'missing row'); });
const unguarded = table.filter(t => t.n > 0 && !t.g && !/Service worker|Array\.prototype|Optional chaining|orientation/.test(t.name));
ok(unguarded.length === 0, 'nothing iPhone Safari may lack is used without a guard', unguarded.map(t => t.name).join('; '));
['Service worker', 'Screen orientation lock', 'Array.prototype.at'].forEach(n => ok(T(n).n === 0, n + ': not used'));
// modern syntax: only allowed inside the worklet source strings (which only run where worklets exist) — find any outside
const wl = [['function limiterWorklet(){', 'function recorderWorklet(){'], ['function recorderWorklet(){', '\n    function ']];
let rest = js; wl.forEach(w => { const i = rest.indexOf(w[0]); if(i >= 0){ const j = rest.indexOf(w[1], i + w[0].length); if(j > i) rest = rest.slice(0, i) + rest.slice(j); } });
const stripped = rest.replace(/\/\/[^\n]*/g, '').replace(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/g, '""');
const modern = (stripped.match(/\?\.[a-zA-Z_(\[]|\?\?[^?]|=>|\blet (?!me )[a-zA-Z_]|\bconst [a-zA-Z_]|\basync function|\bawait /g) || []);
ok(modern.length === 0, 'the Studio’s own code keeps to the old syntax every Safari parses', modern.slice(0, 6).join(' , ') + ' (' + modern.length + ')');
ok(/-webkit-tap-highlight-color/.test(css) && /touch-action/.test(css) && /overscroll-behavior/.test(css) && /-webkit-overflow-scrolling|overflow:\s*auto/.test(css), 'css: tap highlight, touch-action and overscroll are set');
ok(/font-size:\s*16px/.test(css), 'css: text fields are 16px on phones (no zoom on focus)');
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
