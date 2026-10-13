// The limiter in the page against the v34 limiter, sample for sample, on loud and quiet noise (Node; no browser).
// node t_limiter.js [index.html]
const fs = require('fs'), { execSync } = require('child_process');
const W = process.argv[2] || '/home/claude/firstloop/.claude/worktrees/agent-a99ef2a66ebbbc977/index.html';
function grab(src){ const a = src.indexOf('function limiterWorklet(){'), b = src.indexOf('function recorderWorklet(){', a); return src.slice(a, b); }
function make(fnSrc, sr){ let K = null; const env = { sampleRate:sr, AudioWorkletProcessor:class {}, registerProcessor:(n, k) => { K = k; } };
  new Function('sampleRate', 'AudioWorkletProcessor', 'registerProcessor', fnSrc + '; limiterWorklet();')(env.sampleRate, env.AudioWorkletProcessor, env.registerProcessor); return new K({ processorOptions:{ look:0.005, ceiling:0.891 } }); }
const now = grab(fs.readFileSync(W, 'utf8')), old = grab(execSync('git -C ' + W.replace(/\/index\.html$/, '') + ' show 8a14035:index.html', { maxBuffer:1 << 28 }).toString());
let pass = 0, fail = 0; const ok = (c, n, x) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + n + (x ? '  [' + x + ']' : '')); };
ok(now !== old && /this\.tg/.test(old) && !/this\.tg/.test(now), 'the page’s limiter is the new one, and the one it is compared with is v34’s');
let s = 12345; const rnd = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296 * 2 - 1; };
for(const sr of [44100, 48000, 16000]){
  const A = make(now, sr), B = make(old, sr); let worst = 0, n = 0, over = 0, red = 0; const t0 = [0, 0];
  for(let blk = 0; blk < 1500; blk++){
    const loud = blk % 300 < 200 ? 2.2 : blk % 300 < 250 ? 0.3 : 0, L = new Float32Array(128), R = new Float32Array(128);
    for(let i = 0; i < 128; i++){ L[i] = rnd() * loud * (i % 37 === 0 ? 1.6 : 0.6); R[i] = rnd() * loud * 0.5; }
    const oa = [new Float32Array(128), new Float32Array(128)], ob = [new Float32Array(128), new Float32Array(128)];
    let t = process.hrtime.bigint(); A.process([[L, R]], [oa]); t0[0] += Number(process.hrtime.bigint() - t); t = process.hrtime.bigint(); B.process([[L, R]], [ob]); t0[1] += Number(process.hrtime.bigint() - t);
    for(let i = 0; i < 128; i++){ const d = Math.max(Math.abs(oa[0][i] - ob[0][i]), Math.abs(oa[1][i] - ob[1][i])); if(d > worst) worst = d; if(Math.abs(oa[0][i]) > 0.8911) over++; if(Math.abs(oa[0][i]) < Math.abs(L[i]) * 0.9) red++; n++; }
  }
  ok(worst === 0 && red > 1000, sr + ' Hz: ' + n + ' samples (' + red + ' of them held back), the same to the last bit as v34’s limiter', 'largest difference ' + worst + '; ' + (t0[1] / t0[0]).toFixed(1) + ' times faster here');
}
console.log('\n' + pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
