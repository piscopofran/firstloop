    // ---------- Studio: sound ----------
    // One sampler for everything. An instrument is a list of zones {note, vel, buf, loop}; a note is played from the
    // nearest zone, re-pitched by at most three semitones where the instrument was sampled that densely. The graph
    // (per track: tone, volume, pan, reverb send; then the master limiter) is built by one function for the live
    // context and for an offline one, and notes are put into either by the same code, at whole sample frames.
    var ENG = { ctx:null, G:null, ready:null, manifest:null, manifestState:"none", base:"", inst:{}, kits:{}, limiterOK:false, mods:null, note:"" };
    var MAXV = 56, LOOKAHEAD = 0.16, LIM_LOOK = 0.005;
    var DRUM = { kick:36, rim:37, snare:38, clap:39, tom_low:45, tom_mid:47, tom_high:50, hat_closed:42, hat_open:46, ride:51, crash:49, tambourine:54, shaker:70,
                 rimshot:40, hat_pedal:44, ride_bell:53, cowbell:56, tambourine_shake:58, bongo_high:60, bongo_low:61, conga_high:63, conga_low:64, cabasa:69, cajon_high:76, cajon_low:77 };
    // the rows every kit shows, top to bottom; a kit that has more pieces (a pedal hat, congas) gets rows for those too
    var DRUM_BASE = ["crash", "ride", "hat_open", "hat_closed", "tom_high", "tom_mid", "tom_low", "tambourine", "shaker", "clap", "rim", "snare", "kick"];
    var DRUM_ROWS = ["crash", "ride_bell", "ride", "hat_open", "hat_pedal", "hat_closed", "tom_high", "tom_mid", "tom_low", "cowbell", "tambourine_shake", "tambourine", "cabasa", "shaker", "clap",
                     "bongo_high", "bongo_low", "conga_high", "conga_low", "cajon_high", "cajon_low", "rim", "rimshot", "snare", "kick"];
    var DRUM_NAMES = { kick:"Kick", snare:"Snare", rim:"Rim", clap:"Clap", hat_closed:"Closed hat", hat_open:"Open hat", tom_low:"Low tom", tom_mid:"Mid tom", tom_high:"High tom",
                       ride:"Ride", crash:"Crash", tambourine:"Tambourine", shaker:"Shaker", rimshot:"Rimshot", hat_pedal:"Pedal hat", ride_bell:"Ride bell", cowbell:"Cowbell",
                       tambourine_shake:"Tambourine shake", bongo_high:"High bongo", bongo_low:"Low bongo", conga_high:"High conga", conga_low:"Low conga", cabasa:"Cabasa", cajon_high:"Cajon slap", cajon_low:"Cajon bass" };
    // a piece a kit does not have is played by its nearest relative
    var DRUM_ALT = { rimshot:"snare", hat_pedal:"hat_closed", ride_bell:"ride", tom_mid:"tom_low", tambourine_shake:"tambourine", cabasa:"shaker", rim:"rimshot", cajon_low:"kick", cajon_high:"snare",
                     conga_high:"tom_high", conga_low:"tom_low", bongo_high:"tom_high", bongo_low:"tom_mid", cowbell:"rim" };
    var DRUM_OF = {}; (function(){ for(var k in DRUM) DRUM_OF[DRUM[k]] = k; DRUM_OF[35] = "kick"; DRUM_OF[41] = "tom_low"; DRUM_OF[43] = "tom_low";
      DRUM_OF[48] = "tom_high"; DRUM_OF[57] = "crash"; DRUM_OF[59] = "ride"; DRUM_OF[82] = "shaker"; DRUM_OF[62] = "conga_high"; })();
    function kitHas(d, pc){ return !!(d && d.pieces && d.pieces[pc] && d.pieces[pc].length); }
    // the rows of the drum grid for a track: what its kit has, and whatever the part already uses
    function drumRows(t, pat, all){
      var d = ENG.inst[soundFor(t)], ready = d && d.kit && d.state === "ready", used = {}, noKit = ready && !kitHas(d, "kick") && !kitHas(d, "snare");
      if(pat) pat.notes.forEach(function(n){ if(DRUM_OF[n.p]) used[DRUM_OF[n.p]] = 1; });
      return DRUM_ROWS.filter(function(pc){ return used[pc] || (ready && (all || noKit) && kitHas(d, pc)) || (!noKit && DRUM_BASE.indexOf(pc) >= 0); });
    }
    function kitExtras(t){ var d = ENG.inst[soundFor(t)]; return !!(d && d.kit && d.state === "ready" && DRUM_ROWS.some(function(pc){ return DRUM_BASE.indexOf(pc) < 0 && kitHas(d, pc); })); }
    var FAMILIES = [["bass", "Bass"], ["keys", "Keys"], ["guitars", "Guitars"], ["strings", "Strings"], ["winds", "Winds and brass"], ["drums", "Drums and percussion"], ["voice", "Choir"]];
    var FAMILY_ALIAS = { guitar:"guitars", piano:"keys", key:"keys", keyboard:"keys", string:"strings", wind:"winds", brass:"winds", woodwind:"winds", woodwinds:"winds", drum:"drums", percussion:"drums", vocal:"voice", vocals:"voice", choir:"voice", basses:"bass" };
    // what is always there: generated stand-ins, labelled as such
    var BASIC = [
      { id:"basic:bass", name:"Basic bass", family:"bass", range:[28, 60], release:0.18, gm:33 },
      { id:"basic:piano", name:"Basic piano", family:"keys", range:[28, 96], release:0.3, gm:0 },
      { id:"basic:guitar", name:"Basic guitar", family:"guitars", range:[40, 84], release:0.3, gm:24 },
      { id:"basic:strings", name:"Basic strings", family:"strings", range:[36, 96], release:0.45, gm:48, loop:true },
      { id:"basic:flute", name:"Basic flute", family:"winds", range:[55, 96], release:0.15, gm:73, loop:true },
      { id:"basic:voice", name:"Basic voices", family:"voice", range:[43, 84], release:0.35, gm:52, loop:true }
    ];
    var GM_BY_FAMILY = { bass:32, keys:0, guitars:24, strings:48, winds:73, voice:52, drums:0 };

    function prng(seed){ var s = seed >>> 0 || 1; return function(){ s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
    function frameTime(ctx, t){ return Math.round(t * ctx.sampleRate) / ctx.sampleRate; }

    // ---- generated instruments ----
    function genTone(id, midi, sr){
      // returns { data:Float32Array, note:exact pitch of what was made, loop:[a,b] seconds or null }
      var f0 = 440 * Math.pow(2, (midi - 69) / 12), i, k, n, out, R = prng(midi * 131 + id.length * 7), two = 2 * Math.PI, note = midi, loop = null;
      if(id === "basic:piano" || id === "basic:bass" || id === "basic:guitar"){
        var bass = id === "basic:bass", gtr = id === "basic:guitar";
        var tau0 = clamp((bass ? 1.6 : gtr ? 1.3 : 2.4) * Math.sqrt(261.6 / f0), 0.35, bass ? 3 : 5), len = Math.min(bass ? 3.2 : 6, tau0 * 3.6);
        n = Math.round(len * sr); out = new Float32Array(n);
        var N = Math.max(1, Math.min(bass ? 14 : 26, Math.floor(0.42 * sr / f0))), B = bass ? 0.00003 : gtr ? 0.00002 : 0.00003 * Math.pow(f0 / 261.6, 0.5);
        for(k = 1; k <= N; k++){
          var fk = k * f0 * Math.sqrt(1 + B * k * k); if(fk > 0.45 * sr) break;
          var comb = Math.abs(Math.sin(Math.PI * k / (gtr ? 5.3 : bass ? 6.2 : 7.7))) + 0.12;
          var a = comb * Math.pow(k, bass ? -1.35 : gtr ? -1.15 : -1.05) * Math.exp(-k * (bass ? 0.1 : 0.05));
          var tk = tau0 / (1 + (bass ? 0.55 : gtr ? 0.4 : 0.22) * k), w = two * fk / sr, w2 = two * fk * 1.0007 / sr, ph = R() * two, d1 = Math.exp(-1 / (tk * sr)), d2 = Math.exp(-1 / (tk * 3.2 * sr)), e1 = 1, e2 = 0.22;
          for(i = 0; i < n; i++){ out[i] += a * (e1 * Math.sin(w * i + ph) + e2 * Math.sin(w2 * i + ph * 1.3)); e1 *= d1; e2 *= d2; }
        }
        // the hammer or the finger: a few milliseconds of filtered noise at the start
        var th = Math.round(sr * (bass ? 0.012 : 0.006)), lp = 0;
        for(i = 0; i < th; i++){ lp = 0.7 * lp + 0.3 * (R() * 2 - 1); out[i] += lp * (bass ? 0.5 : 0.35) * (1 - i / th); }
        var at = Math.round(sr * 0.003); for(i = 0; i < at; i++) out[i] *= i / at;
        var fd = Math.round(sr * 0.05); for(i = 0; i < fd; i++) out[n - 1 - i] *= i / fd;
      } else {
        // held sounds: an attack, then a stretch that repeats without a seam (a whole number of cycles of everything in it)
        var voice = id === "basic:voice", flute = id === "basic:flute", loopSec = flute ? 0.8 : (f0 < 140 ? 2.4 : 1.2), M = Math.max(1, Math.round(f0 * loopSec)), Ls = Math.round(M * sr / f0);
        var f = M * sr / Ls, attS = Math.round(sr * (flute ? 0.07 : voice ? 0.12 : 0.22));
        note = 69 + 12 * Math.log(f / 440) / Math.LN2;
        n = attS + Ls + 64; out = new Float32Array(n);
        // whole cycles more or fewer in the loop: slow beating that still closes, a few cents either side of the note
        var kd = Math.max(1, Math.round(M * 0.0028)), parts = flute ? [[0, 1]] : [[-kd, 0.5], [0, 0.7], [kd, 0.5]];
        var maxH = Math.min(flute ? 5 : voice ? 18 : 22, Math.floor(0.42 * sr / f));
        parts.forEach(function(pt){
          var fp = (M + pt[0]) * sr / Ls;
          for(k = 1; k <= maxH; k++){
            var ak;
            if(flute) ak = [1, 0.28, 0.12, 0.04, 0.02][k - 1];
            else if(voice){ var fx = k * fp, x1 = (fx - 340) / 90, x2 = (fx - 850) / 130, x3 = (fx - 2500) / 200; ak = Math.pow(k, -1.1) * (1 / (1 + x1 * x1) + 0.3 / (1 + x2 * x2) + 0.06 / (1 + x3 * x3) + 0.01); }
            else ak = Math.pow(k, -1) * Math.exp(-k / 9);
            var wk = two * k * fp / sr, phk = R() * two;
            for(i = 0; i < n; i++) out[i] += pt[1] * ak * Math.sin(wk * (i - attS) + phk);
          }
        });
        if(flute){
          // breath: looped noise, and a slow waver of whole cycles
          var xf = Math.round(sr * 0.02), nz = new Float32Array(Ls + xf), l2 = 0; for(i = 0; i < Ls + xf; i++){ l2 = 0.85 * l2 + 0.15 * (R() * 2 - 1); nz[i] = l2; }
          for(i = 0; i < xf; i++){ var m1 = i / xf; nz[i] = nz[i] * m1 + nz[Ls + i] * (1 - m1); }
          for(i = 0; i < n; i++){ var q = ((i - attS) % Ls + Ls) % Ls; out[i] = out[i] * (1 + 0.05 * Math.sin(two * 4 * q / Ls)) + 0.05 * nz[q]; }
        }
        for(i = 0; i < attS; i++){ var e = i / attS; out[i] *= e * e * (3 - 2 * e); }
        loop = [attS / sr, (attS + Ls) / sr];
      }
      var pk = 0; for(i = 0; i < n; i++) if(Math.abs(out[i]) > pk) pk = Math.abs(out[i]);
      if(pk > 0){ var g = (loop ? 0.5 : 0.8) / pk; for(i = 0; i < n; i++) out[i] *= g; }
      return { data:out, note:note, loop:loop };
    }
    function genDrum(piece, sr, variant){
      var R = prng(piece.length * 977 + variant * 31 + piece.charCodeAt(0)), two = 2 * Math.PI, i, n, out, t, e;
      function noise(len, hp, lp){
        var x = new Float32Array(len), a = 0, b = 0, w, y;
        for(var j = 0; j < len; j++){ w = R() * 2 - 1; a += lp * (w - a); y = a; b += hp * (y - b); x[j] = y - b; }
        return x;
      }
      if(piece === "kick"){
        n = Math.round(sr * 0.5); out = new Float32Array(n); var ph = 0;
        for(i = 0; i < n; i++){ t = i / sr; var f = 46 + 110 * Math.exp(-t * 34) + 30 * Math.exp(-t * 200); ph += two * f / sr; out[i] = Math.sin(ph) * Math.exp(-t * (7.5 + variant)) + 0.25 * Math.exp(-t * 400) * (R() * 2 - 1); }
      } else if(piece === "snare" || piece === "rim" || piece === "clap"){
        n = Math.round(sr * (piece === "snare" ? 0.32 : piece === "clap" ? 0.3 : 0.07)); out = new Float32Array(n);
        var nzs = noise(n, piece === "rim" ? 0.5 : 0.25, piece === "snare" ? 0.75 : 0.6);
        for(i = 0; i < n; i++){
          t = i / sr;
          if(piece === "snare") out[i] = 0.9 * nzs[i] * Math.exp(-t * (17 + variant * 2)) + 0.55 * Math.sin(two * (188 + variant * 6) * t + 0.5 * Math.exp(-t * 60)) * Math.exp(-t * 26) + 0.3 * Math.sin(two * 331 * t) * Math.exp(-t * 40);
          else if(piece === "rim") out[i] = (0.8 * Math.sin(two * 1730 * t) + 0.5 * Math.sin(two * 520 * t) + 0.4 * nzs[i]) * Math.exp(-t * 130);
          else { var c = 0; [0, 0.011, 0.021 + variant * 0.002, 0.032].forEach(function(d, k){ if(t >= d) c += Math.exp(-(t - d) * (k === 3 ? 22 : 190)); }); out[i] = nzs[i] * c * 0.8; }
        }
      } else if(piece === "hat_closed" || piece === "hat_open" || piece === "shaker" || piece === "tambourine" || piece === "crash" || piece === "ride"){
        var lenS = { hat_closed:0.09, hat_open:0.55, shaker:0.14, tambourine:0.32, crash:2.2, ride:1.6 }[piece];
        n = Math.round(sr * lenS); out = new Float32Array(n);
        var nh = noise(n, piece === "crash" ? 0.35 : 0.65, 0.95), fr = [3120, 4170, 5411, 6790, 8123, 9377].map(function(f){ return f * (1 + (R() - 0.5) * 0.03); });
        for(i = 0; i < n; i++){
          t = i / sr; var metal = 0;
          if(piece !== "shaker") for(var m = 0; m < fr.length; m++) metal += (Math.sin(two * fr[m] * (piece === "ride" ? 0.62 : piece === "tambourine" ? 1.25 : 1) * t) > 0 ? 1 : -1);
          metal /= 6;
          if(piece === "hat_closed") e = Math.exp(-t * (55 + variant * 12));
          else if(piece === "hat_open") e = Math.exp(-t * 7.5);
          else if(piece === "shaker") e = Math.min(1, t / 0.018) * Math.exp(-Math.max(0, t - 0.018) * 38);
          else if(piece === "tambourine") e = Math.exp(-t * 14) * (0.6 + 0.4 * Math.abs(Math.sin(two * 21 * t)));
          else if(piece === "crash") e = Math.exp(-t * 2.4);
          else e = 0.55 * Math.exp(-t * 3) + 0.45 * Math.exp(-t * 30);
          out[i] = (0.75 * nh[i] + (piece === "shaker" ? 0 : 0.4 * metal)) * e;
        }
        // metal partials are square waves: take the edge off the lows with one more high-pass
        var hpz = 0, hx = 0; for(i = 0; i < n; i++){ var v = out[i]; hpz = 0.92 * (hpz + v - hx); hx = v; out[i] = hpz; }
      } else {
        var base = piece === "tom_low" ? 92 : piece === "tom_mid" ? 128 : 172;
        n = Math.round(sr * 0.5); out = new Float32Array(n); var p2 = 0;
        for(i = 0; i < n; i++){ t = i / sr; p2 += two * (base * (1 + 0.5 * Math.exp(-t * 22))) / sr; out[i] = Math.sin(p2) * Math.exp(-t * (7 + variant)) + 0.15 * (R() * 2 - 1) * Math.exp(-t * 90); }
      }
      var pk = 0; for(i = 0; i < n; i++) if(Math.abs(out[i]) > pk) pk = Math.abs(out[i]);
      var lvl = { kick:0.95, snare:0.8, rim:0.55, clap:0.6, hat_closed:0.35, hat_open:0.38, shaker:0.3, tambourine:0.35, crash:0.5, ride:0.38, tom_low:0.8, tom_mid:0.75, tom_high:0.7 }[piece] || 0.6;
      var fdn = Math.min(n, Math.round(sr * 0.02));
      for(i = 0; i < n; i++) out[i] *= lvl / (pk || 1);
      for(i = 0; i < fdn; i++) out[n - 1 - i] *= i / fdn;
      return out;
    }
    function bufFrom(ctx, data, sr){ var b = ctx.createBuffer(1, data.length, sr); b.getChannelData(0).set(data); return b; }

    // ---- the context and the things loaded into it ----
    function limiterWorklet(){
      // a look-ahead peak limiter: exactly the input, five milliseconds late, until a peak would pass the ceiling
      registerProcessor("fl-studio-limiter", class extends AudioWorkletProcessor {
        constructor(o){
          super();
          var p = (o && o.processorOptions) || {};
          this.N = Math.max(8, Math.round((p.look || 0.005) * sampleRate)); this.ceil = p.ceiling || 0.891;
          this.dl = new Float32Array(this.N); this.dr = new Float32Array(this.N); this.tg = new Float32Array(this.N); this.w = 0; this.env = 1;
          this.rel = Math.exp(-1 / (0.12 * sampleRate)); this.att = Math.exp(-1 / (this.N / 5)); this.red = 0; this.quiet = this.N + 1;
          this.tg.fill(1);
        }
        process(inputs, outputs){
          var inp = inputs[0], out = outputs[0]; if(!out || !out.length) return true;
          var L = inp && inp[0], R = inp && (inp[1] || inp[0]), ol = out[0], or = out[1] || out[0], n = ol.length, N = this.N, c = this.ceil, i, k, a, b, pk, g, mn;
          for(i = 0; i < n; i++){
            a = L ? L[i] : 0; b = R ? R[i] : 0;
            pk = Math.abs(a) > Math.abs(b) ? Math.abs(a) : Math.abs(b);
            ol[i] = this.dl[this.w]; if(or !== ol) or[i] = this.dr[this.w];
            this.dl[this.w] = a; this.dr[this.w] = b; this.tg[this.w] = pk > c ? c / pk : 1;
            this.w = (this.w + 1) % N;
            if(this.env === 1 && pk <= c && this.quiet > N){ continue; }
            if(pk > c) this.quiet = 0; else this.quiet = (this.quiet || 0) + 1;
            mn = 1; for(k = 0; k < N; k++) if(this.tg[k] < mn) mn = this.tg[k];
            if(mn < this.env) this.env = mn + (this.env - mn) * this.att; else { this.env = 1 - (1 - this.env) * this.rel; if(this.env > 0.99999) this.env = 1; }
            g = this.env; ol[i] *= g; if(or !== ol) or[i] *= g;
          }
          return true;
        }
      });
    }
    function recorderWorklet(){
      registerProcessor("fl-studio-rec", class extends AudioWorkletProcessor {
        constructor(){ super(); this.on = false; var me = this; this.port.onmessage = function(e){ me.on = !!e.data.on; }; }
        process(inputs){
          if(!this.on) return true;
          var ch = inputs[0] && inputs[0][0];
          if(ch){
            var c = new Float32Array(ch.length), two = inputs[0][1];
            if(two) for(var i = 0; i < c.length; i++) c[i] = 0.5 * (ch[i] + two[i]); else c.set(ch);
            this.port.postMessage({ f:currentFrame, x:c }, [c.buffer]);
          }
          return true;
        }
      });
    }
    function loadModules(ctx){
      if(!ctx.audioWorklet || typeof window.AudioWorkletNode !== "function") return Promise.resolve(false);
      var src = "(" + limiterWorklet.toString() + ")();(" + recorderWorklet.toString() + ")();", url;
      try { url = URL.createObjectURL(new Blob([src], { type:"text/javascript" })); } catch(e){ url = null; }
      var p = url ? ctx.audioWorklet.addModule(url) : Promise.reject();
      return p.then(function(){ return true; }, function(){
        return ctx.audioWorklet.addModule("data:text/javascript;charset=utf-8," + encodeURIComponent(src)).then(function(){ return true; }, function(){ return false; });
      });
    }
    function impulse(ctx){
      // a small room, generated: the same numbers every time, so a saved file matches what was heard
      var sr = ctx.sampleRate, n = Math.round(sr * 1.9), b = ctx.createBuffer(2, n, sr), c, i;
      for(c = 0; c < 2; c++){
        var d = b.getChannelData(c), R = prng(4711 + c * 97), lp = 0, pre = Math.round(sr * 0.012);
        for(i = pre; i < n; i++){
          var t = (i - pre) / sr, w = R() * 2 - 1, k = 0.25 + 0.7 * Math.exp(-t * 2.2);
          lp += k * (w - lp);
          d[i] = lp * Math.pow(10, -3 * t / 1.5) * (t < 0.03 ? t / 0.03 : 1);
        }
        // a few early reflections
        [0.019, 0.031, 0.043, 0.058].forEach(function(tm, j){ var ix = Math.round((tm + c * 0.0037) * sr); if(ix < n) d[ix] += (j % 2 ? -0.5 : 0.6) * Math.pow(0.8, j); });
        var s = 0; for(i = 0; i < n; i++) s += d[i] * d[i];
        var g = 0.5 / Math.sqrt(s); for(i = 0; i < n; i++) d[i] *= g * 2.4;
      }
      return b;
    }
    // G: one graph, live or offline
    function buildGraph(ctx, live, o){
      o = o || {};
      var G = { ctx:ctx, live:live, tracks:{}, voices:[], hatOpen:{}, sum:ctx.createGain(), music:ctx.createGain(), revIn:ctx.createGain(), rev:ctx.createConvolver(), revOut:ctx.createGain(), master:ctx.createGain(), click:ctx.createGain(), lookFrames:0 };
      G.rev.buffer = impulse(ctx); G.revOut.gain.value = 0.9;
      G.revIn.connect(G.rev); G.rev.connect(G.revOut); G.revOut.connect(G.music);
      G.music.connect(G.sum);
      G.master.gain.value = 1;
      G.sum.connect(G.master);
      var out = G.master;
      if(o.limiter !== false && ENG.limiterOK){
        try {
          G.lim = new AudioWorkletNode(ctx, "fl-studio-limiter", { numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2], channelCount:2, channelCountMode:"explicit", processorOptions:{ look:LIM_LOOK, ceiling:0.891 } });
          G.master.connect(G.lim); out = G.lim; G.lookFrames = Math.max(8, Math.round(LIM_LOOK * ctx.sampleRate));
        } catch(e){ G.lim = null; }
      }
      G.out = out;
      if(live){
        G.meter = ctx.createAnalyser(); G.meter.fftSize = 512; out.connect(G.meter);
        out.connect(ctx.destination);
        G.click.connect(ctx.destination);                // the click never goes into a saved file, nor through the limiter
      } else out.connect(ctx.destination);
      return G;
    }
    function trackNodes(G, t){
      var n = G.tracks[t.id]; if(n) return n;
      var ctx = G.ctx;
      n = G.tracks[t.id] = { input:ctx.createGain(), lo:ctx.createBiquadFilter(), mid:ctx.createBiquadFilter(), hi:ctx.createBiquadFilter(), vol:ctx.createGain(), pan:ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain(), send:ctx.createGain() };
      n.lo.type = "lowshelf"; n.lo.frequency.value = 180; n.mid.type = "peaking"; n.mid.frequency.value = 1200; n.mid.Q.value = 0.8; n.hi.type = "highshelf"; n.hi.frequency.value = 5200;
      n.input.connect(n.lo); n.lo.connect(n.mid); n.mid.connect(n.hi); n.hi.connect(n.vol); n.vol.connect(n.pan); n.pan.connect(G.music); n.vol.connect(n.send); n.send.connect(G.revIn);
      if(G.live){ n.meter = ctx.createAnalyser(); n.meter.fftSize = 256; n.vol.connect(n.meter); }
      applyTrack(G, t, 0, null);
      return n;
    }
    // only: when rendering one track by itself (a stem), everything else is silent whatever mute and solo say
    function trackGain(t, only){
      if(only) return only === t.id ? t.vol : 0;
      if(t.id === "_aud") return t.vol;
      var anySolo = S.tracks.some(function(x){ return x.solo; });
      return (t.mute || (anySolo && !t.solo)) ? 0 : t.vol;
    }
    function applyTrack(G, t, ramp, only){
      var n = G.tracks[t.id]; if(!n) return;
      var now = G.ctx.currentTime, set = function(p, v){ if(ramp && G.live){ try { p.setTargetAtTime(v, now, 0.015); return; } catch(e){} } p.value = v; };
      set(n.vol.gain, trackGain(t, only)); if(n.pan.pan) set(n.pan.pan, t.pan);
      set(n.send.gain, t.send * 0.9); set(n.lo.gain, t.eq[0]); set(n.mid.gain, t.eq[1]); set(n.hi.gain, t.eq[2]);
    }
    function engSync(){
      if(!ENG.G || !S) return;
      S.tracks.forEach(function(t){ trackNodes(ENG.G, t); applyTrack(ENG.G, t, true, null); });
      try { ENG.G.master.gain.setTargetAtTime(S.mvol === undefined ? 1 : S.mvol, ENG.ctx.currentTime, 0.015); } catch(e){}
      Object.keys(ENG.G.tracks).forEach(function(id){ if(!trackById(id)){ try { ENG.G.tracks[id].pan.disconnect(); ENG.G.tracks[id].send.disconnect(); } catch(e){} delete ENG.G.tracks[id]; } });
      S.tracks.forEach(function(t){ if(t.kind !== "audio") loadInst(t.inst); });
    }
    function ensureEngine(){
      if(ENG.ready) return ENG.ready;
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if(!Ctx){ ENG.note = "This browser has no Web Audio, so the Studio cannot make sound."; ENG.ready = Promise.resolve(false); return ENG.ready; }
      ENG.ctx = new Ctx({ latencyHint:"interactive" });
      ENG.ready = loadModules(ENG.ctx).then(function(ok){
        ENG.limiterOK = ok; ENG.mods = ok;
        ENG.G = buildGraph(ENG.ctx, true);
        engSync();
        emit("engine", { sampleRate:ENG.ctx.sampleRate, limiter:ok });
        return true;
      });
      return ENG.ready;
    }
    function resume(){ try { if(ENG.ctx && ENG.ctx.state !== "running") return ENG.ctx.resume(); } catch(e){} return Promise.resolve(); }

    // ---- recorded instruments: the manifest and its files ----
    function fetchT(url, ms){
      return new Promise(function(res, rej){
        var done = false, t = setTimeout(function(){ if(!done){ done = true; rej(new Error("timeout")); } }, ms || SOUNDS.timeout);
        fetch(url, { cache:"force-cache" }).then(function(r){ if(done) return; done = true; clearTimeout(t); if(!r.ok) rej(new Error("http " + r.status)); else res(r); }, function(e){ if(done) return; done = true; clearTimeout(t); rej(e); });
      });
    }
    function absBase(b){ try { return new URL(b, window.location.href).href; } catch(e){ return b; } }
    function loadManifest(){
      if(ENG.manifestP) return ENG.manifestP;
      ENG.manifestState = "loading";
      var bases = SOUNDS.bases.map(absBase).filter(function(b){ return !/^file:/.test(b) || /^file:/.test(window.location.href); });
      function tryBase(i){
        if(i >= bases.length) return Promise.reject(new Error("unreachable"));
        return fetchT(bases[i] + SOUNDS.manifest, i === 0 ? 4000 : SOUNDS.timeout).then(function(r){ return r.json(); }).then(function(m){
          if(!m || !Array.isArray(m.instruments)) throw new Error("shape");
          return { m:m, base:bases[i] };
        })["catch"](function(){ return tryBase(i + 1); });
      }
      ENG.manifestP = tryBase(0).then(function(x){
        dbPut("kv", { m:x.m, base:x.base, t:Date.now() }, "manifest")["catch"](function(){});
        return x;
      }, function(){
        // no network: what was fetched last time, if anything (its files are in the database too)
        return dbGet("kv", "manifest").then(function(c){ if(c && c.m) return { m:c.m, base:c.base, cached:true }; throw new Error("none"); });
      }).then(function(x){
        var m = x.m, mb = x.base;
        try { if(m.base) mb = new URL(m.base, x.base).href; } catch(e){}
        ENG.manifest = m; ENG.base = mb; ENG.bases = bases; ENG.manifestState = "ready"; ENG.note = "";
        (m.instruments || []).forEach(function(d){
          if(!d || !d.id || !Array.isArray(d.samples) || !d.samples.length) return;
          var fam = String(d.family || "keys").toLowerCase(); fam = FAMILY_ALIAS[fam] || fam; if(!FAMILIES.some(function(f){ return f[0] === fam; })) fam = "keys";
          ENG.inst[d.id] = ENG.inst[d.id] || { id:d.id, name:String(d.name || d.id).slice(0, 40), family:fam, range:Array.isArray(d.range) ? [d.range[0] | 0, d.range[1] | 0] : [36, 84], release:clamp(+d.release || 0.25, 0.02, 4),
            gainDb:clamp(+d.gain || 0, -24, 24), loop:!!d.loop, bytes:d.bytes | 0, licence:String(d.licence || ""), source:String(d.source || ""), credit:String(d.credit || ""), def:d, zones:[], state:"none", got:0 };
        });
        (m.kits || []).forEach(function(d){
          if(!d || !d.id || !d.pieces) return;
          ENG.inst[d.id] = ENG.inst[d.id] || { id:d.id, name:String(d.name || d.id).slice(0, 40), family:"drums", kit:true, gainDb:clamp(+d.gain || 0, -24, 24), bytes:d.bytes | 0, licence:String(d.licence || ""),
            source:String(d.source || ""), credit:String(d.credit || ""), def:d, pieces:{}, state:"none", got:0 };
        });
        emit("instruments", { recorded:true });
        return true;
      }, function(){
        ENG.manifestState = "failed"; ENG.note = "Recorded instruments could not be loaded; using basic sounds.";
        emit("instruments", { recorded:false });
        return false;
      });
      return ENG.manifestP;
    }
    (function(){
      BASIC.forEach(function(b){ ENG.inst[b.id] = { id:b.id, name:b.name, family:b.family, range:b.range, release:b.release, gainDb:0, loop:!!b.loop, basic:true, zones:[], state:"none", got:0, gm:b.gm }; });
      ENG.inst["basic:kit"] = { id:"basic:kit", name:"Basic kit", family:"drums", kit:true, basic:true, gainDb:0, pieces:{}, state:"none", got:0 };
    })();
    function instList(){ return Object.keys(ENG.inst).map(function(k){ return ENG.inst[k]; }); }
    function instInfo(id){ return ENG.inst[id] || null; }
    function instName(id){ var d = ENG.inst[id]; return d ? d.name : (id ? "Missing sound" : ""); }
    // the stand-in for an instrument that cannot be had (not in the manifest, or its files did not arrive)
    function standIn(t){
      var d = ENG.inst[t.inst];
      if(t.kind === "drums") return "basic:kit";
      var fam = d ? d.family : (t.fam || null), b = BASIC.filter(function(x){ return x.family === fam; })[0];
      return b ? b.id : "basic:piano";
    }
    function fileBytes(rel){
      // from the database if it was fetched before, else from the first base that answers
      return dbGet("files", rel).then(function(c){
        if(c && c.byteLength) return c;
        var bases = [ENG.base].concat((ENG.bases || []).filter(function(b){ return b !== ENG.base; }));
        function go(i){
          if(i >= bases.length) return Promise.reject(new Error("unreachable"));
          return fetchT(bases[i] + rel).then(function(r){ return r.arrayBuffer(); })["catch"](function(){ return go(i + 1); });
        }
        return go(0).then(function(ab){ dbPut("files", ab, rel)["catch"](function(){}); return ab; });
      });
    }
    function decode(ab){
      return new Promise(function(res, rej){
        try { var p = ENG.ctx.decodeAudioData(ab.slice(0), res, rej); if(p && p["catch"]) p["catch"](rej); } catch(e){ rej(e); }
      });
    }
    function loadFile(s){
      // "file" first, "file2" if the browser cannot decode the first
      var names = [s.file, s.file2].filter(Boolean);
      function go(i){
        if(i >= names.length) return Promise.reject(new Error("no file"));
        return fileBytes(names[i]).then(decode)["catch"](function(){ return go(i + 1); });
      }
      return go(0);
    }
    function loadInst(id){
      var d = ENG.inst[id];
      if(!d){
        if(ENG.manifestState === "none" || ENG.manifestState === "loading") return loadManifest().then(function(){ return ENG.inst[id] ? loadInst(id) : false; });
        return Promise.resolve(false);
      }
      if(d.p) return d.p;
      if(!ENG.ctx) return Promise.resolve(false);
      d.state = "loading"; d.got = 0; emit("instload", { id:id, state:"loading", progress:0 });
      var sr = ENG.ctx.sampleRate, jobs = [], total = 0, lead = ENG.manifest ? +ENG.manifest.lead || 0 : 0;
      function tick(){ d.got++; emit("instload", { id:id, state:"loading", progress:total ? d.got / total : 1 }); }
      if(d.basic && d.kit){
        d.p = new Promise(function(res){
          var names = DRUM_BASE.slice(), i = 0; total = names.length;
          (function step(){
            var t0 = Date.now();
            while(i < names.length && Date.now() - t0 < 12){ var nm = names[i++], vs = /snare|hat|shaker|clap|tamb/.test(nm) ? 3 : 2, arr = []; for(var v = 0; v < vs; v++) arr.push({ buf:bufFrom(ENG.ctx, genDrum(nm, sr, v), sr), vel:100 }); d.pieces[nm] = [arr]; tick(); }
            if(i < names.length) setTimeout(step, 0); else res(true);
          })();
        });
      } else if(d.basic){
        d.p = new Promise(function(res){
          var notes = [], m; for(m = d.range[0] + 2; m <= d.range[1] + 2; m += 5) notes.push(m);
          total = notes.length; var i = 0;
          (function step(){
            var t0 = Date.now();
            while(i < notes.length && Date.now() - t0 < 14){ var z = genTone(id, notes[i++], sr); d.zones.push({ note:z.note, vel:100, buf:bufFrom(ENG.ctx, z.data, sr), loop:z.loop }); tick(); }
            if(i < notes.length) setTimeout(step, 0); else res(true);
          })();
        });
      } else if(d.kit){
        // "layers" (soft and loud hits of each piece, several of each) when the manifest has them, else the plain list of files
        var LY = d.def.layers && typeof d.def.layers === "object" ? d.def.layers : null, pcs = {};
        Object.keys(d.def.pieces).forEach(function(pc){ pcs[pc] = 1; }); if(LY) Object.keys(LY).forEach(function(pc){ pcs[pc] = 1; });
        Object.keys(pcs).forEach(function(pc){
          if(!DRUM[pc]) return;
          var files = [];
          if(LY && Array.isArray(LY[pc])) LY[pc].forEach(function(l){ if(l && Array.isArray(l.files)) l.files.forEach(function(fn){ files.push({ file:fn, vel:l.vel | 0 || 100, gain:+l.gain || 0 }); }); });
          if(!files.length){ files = d.def.pieces[pc] || []; if(!Array.isArray(files)) files = [files]; }
          var layers = {};
          files.forEach(function(f){
            var s = typeof f === "string" ? { file:f, vel:100 } : f; if(!s || !s.file) return;
            total++;
            jobs.push(loadFile(s).then(function(buf){ var v = s.vel | 0 || 100; (layers[v] = layers[v] || []).push({ buf:buf, vel:v, gainDb:+s.gain || 0 }); tick(); }, function(){ tick(); }));
          });
          d.pieces[pc] = layers;
        });
        d.p = Promise.all(jobs).then(function(){
          var okN = 0;
          Object.keys(d.pieces).forEach(function(pc){
            var L = d.pieces[pc], vs = Object.keys(L).map(Number).sort(function(a, b){ return a - b; });
            d.pieces[pc] = vs.map(function(v){ return L[v]; }); if(vs.length) okN++;
          });
          if(!okN) throw new Error("no files");
          // a piece this kit lacks is played by the generated kit, so a pattern never falls silent
          if(DRUM_BASE.some(function(pc){ return !kitHas(d, pc) && !kitHas(d, DRUM_ALT[pc]); })) return loadInst("basic:kit").then(function(){ return true; });
          return true;
        });
      } else {
        var autoTune = d.def.tuning !== "keep" && !/(grand|upright)[-_ ]?piano/.test(id);
        d.def.samples.forEach(function(s){
          if(!s || !s.file || !(s.note >= 0)) return;
          total++;
          jobs.push(loadFile(s).then(function(buf){
            var z = { note:+s.note + (+s.tune || 0) / 100, nominal:+s.note, vel:s.vel | 0 || 100, buf:buf, loop:null, gainDb:+s.gain || 0, off:clamp(+(s.offset !== undefined ? s.offset : (d.def.lead !== undefined ? d.def.lead : lead)) || 0, 0, 1) };
            if(d.loop && s.loopEnd > s.loopStart) z.loop = [+s.loopStart, +s.loopEnd];
            else if(d.loop && Array.isArray(s.loop) && s.loop[1] > s.loop[0]) z.loop = [+s.loop[0], +s.loop[1]];
            d.zones.push(z);
            // a recording is seldom exactly on its note: where the manifest does not say by how much, it is measured once
            // (not for acoustic pianos, whose stretched tuning is meant)
            if(s.tune === undefined && autoTune && typeof dspRun === "function"){
              var ch = buf.getChannelData(0), a0 = Math.min(ch.length, Math.round((z.off + 0.09) * buf.sampleRate)), part = ch.slice(a0, Math.min(ch.length, a0 + Math.round(0.75 * buf.sampleRate)));
              return dspRun("tuneOf", [part, buf.sampleRate, 440 * Math.pow(2, (z.nominal - 69) / 12)]).then(function(m){ if(m && m.cents !== null && m.clarity >= 0.85 && Math.abs(m.cents) >= 2.5 && Math.abs(m.cents) <= 45){ z.note = z.nominal + m.cents / 100; z.tuned = m.cents; } tick(); }, function(){ tick(); });
            }
            tick();
          }, function(){ tick(); }));
        });
        d.p = Promise.all(jobs).then(function(){ if(!d.zones.length) throw new Error("no files"); d.zones.sort(function(a, b){ return a.note - b.note || a.vel - b.vel; }); return true; });
      }
      d.p = d.p.then(function(){ d.state = "ready"; emit("instload", { id:id, state:"ready", progress:1 }); return true; }, function(){
        d.state = "failed"; d.p = null; d.zones = []; if(d.kit) d.pieces = {};
        emit("instload", { id:id, state:"failed", progress:0 });
        return false;
      });
      return d.p;
    }
    function unloadUnused(){
      // buffers of instruments no track uses are let go
      var used = {}; if(S) S.tracks.forEach(function(t){ used[t.inst] = 1; used[soundFor(t)] = 1; });
      Object.keys(ENG.inst).forEach(function(k){ var d = ENG.inst[k]; if(!used[k] && d.state === "ready" && !d.keep){ d.zones = []; if(d.kit) d.pieces = {}; d.state = "none"; d.p = null; } });
    }
    // which loaded instrument a track sounds with right now (its own, or the stand-in while that loads or if it failed)
    function soundFor(t){
      var d = ENG.inst[t.inst];
      if(d && d.state === "ready") return t.inst;
      var s = standIn(t); return s;
    }
    function ensureSounds(){
      // everything the song needs, loaded (for a render)
      if(!S) return Promise.resolve();
      var ids = {}; S.tracks.forEach(function(t){ if(t.kind !== "audio"){ ids[t.inst] = 1; } });
      return Promise.all(Object.keys(ids).map(loadInst)).then(function(){
        var more = {}; S.tracks.forEach(function(t){ if(t.kind !== "audio") more[soundFor(t)] = 1; });
        return Promise.all(Object.keys(more).map(loadInst));
      });
    }
    function pickZone(d, note, vel){
      var zs = d.zones, best = null, bd = 1e9, i, dd;
      for(i = 0; i < zs.length; i++){ dd = Math.abs((zs[i].nominal === undefined ? zs[i].note : zs[i].nominal) - note); if(dd < bd - 1e-6){ bd = dd; best = zs[i]; } }
      if(!best) return null;
      // among the zones at that note: the loudness layer nearest to how hard the note is played
      var pick = best, pv = 1e9;
      var nb = best.nominal === undefined ? best.note : best.nominal;
      for(i = 0; i < zs.length; i++) if(Math.abs((zs[i].nominal === undefined ? zs[i].note : zs[i].nominal) - nb) < 0.01){ dd = Math.abs(zs[i].vel - vel); if(dd < pv){ pv = dd; pick = zs[i]; } }
      return pick;
    }

    // ---- voices ----
    function velGain(v){ return Math.pow(clamp(v, 1, 127) / 127, 1.6); }
    function velCut(v, drum){ return v >= 112 ? 0 : Math.min(18000, (drum ? 1500 : 900) * Math.pow(2, v / 127 * 4.4)); }
    function claim(G, when){
      // forget voices that have ended; if too many still sound, the oldest fades out in a few milliseconds
      var vs = G.voices, i;
      for(i = vs.length - 1; i >= 0; i--) if(vs[i].end <= when) vs.splice(i, 1);
      while(vs.length >= MAXV){
        var o = vs.shift();
        try { o.g.gain.cancelScheduledValues(when); o.g.gain.setTargetAtTime(0, when, 0.004); o.src.stop(when + 0.03); } catch(e){}
      }
    }
    // a note of known length. Returns the voice.
    function playNote(G, t, pitch, vel, when, dur){
      var id = soundFor(t), d = ENG.inst[id]; if(!d || d.kit || d.state !== "ready") return null;
      var n = trackNodes(G, t), ctx = G.ctx, p = pitch + 12 * (t.oct || 0), z = pickZone(d, p, vel); if(!z) return null;
      when = frameTime(ctx, Math.max(when, 0));
      claim(G, when);
      var src = ctx.createBufferSource(), g = ctx.createGain(), cut = velCut(vel, false), rate = Math.pow(2, (p - z.note) / 12), node = src;
      src.buffer = z.buf; src.playbackRate.value = rate;
      if(z.loop){ src.loop = true; src.loopStart = z.loop[0]; src.loopEnd = z.loop[1]; }
      if(cut){ var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut; f.Q.value = 0.5; src.connect(f); node = f; }
      var lv = velGain(vel) * Math.pow(10, ((d.gainDb || 0) + (z.gainDb || 0)) / 20), rel = d.release || 0.25, end = when + Math.max(0.03, dur);
      g.gain.value = lv; g.gain.setValueAtTime(lv, when);
      node.connect(g); g.connect(n.input);
      src.start(when, z.off || 0);
      var natural = z.loop ? Infinity : when + (z.buf.duration - (z.off || 0)) / rate, v = { src:src, g:g, start:when, end:Math.min(natural, end + rel * 2), track:t.id, pitch:pitch, lv:lv, rel:rel };
      if(dur !== Infinity){
        g.gain.setValueAtTime(lv, frameTime(ctx, end)); g.gain.setTargetAtTime(0, frameTime(ctx, end), rel / 3);
        try { src.stop(frameTime(ctx, end + rel * 2)); } catch(e){}
      } else v.end = natural === Infinity ? when + 3600 : natural;
      G.voices.push(v);
      return v;
    }
    function releaseVoice(G, v, when){
      if(!v || v.off) return; v.off = true;
      when = Math.max(when || G.ctx.currentTime, v.start + 0.02);
      try { v.g.gain.cancelScheduledValues(when); v.g.gain.setValueAtTime(v.lv, when); v.g.gain.setTargetAtTime(0, when, v.rel / 3); v.src.stop(when + v.rel * 2); } catch(e){}
      v.end = when + v.rel * 2;
    }
    function playDrum(G, t, pitch, vel, when, rr){
      var id = soundFor(t), d = ENG.inst[id]; if(!d || !d.kit || d.state !== "ready") return null;
      var pc = DRUM_OF[pitch], layers = pc && (kitHas(d, pc) ? d.pieces[pc] : kitHas(d, DRUM_ALT[pc]) ? d.pieces[DRUM_ALT[pc]] : null);
      if(!layers && pc && !d.basic){ var bk = ENG.inst["basic:kit"]; if(bk.state === "ready"){ d = bk; layers = kitHas(d, pc) ? d.pieces[pc] : d.pieces[DRUM_ALT[pc]]; } }
      if(!layers || !layers.length) return null;
      var n = trackNodes(G, t), ctx = G.ctx, i, li = 0, bd = 1e9;
      for(i = 0; i < layers.length; i++){ var dv = Math.abs(layers[i][0].vel - vel); if(dv < bd){ bd = dv; li = i; } }
      var L = layers[li], z = L[((rr | 0) % L.length + L.length) % L.length];
      when = frameTime(ctx, Math.max(when, 0));
      claim(G, when);
      var src = ctx.createBufferSource(), g = ctx.createGain(), cut = layers.length > 1 ? 0 : velCut(vel, true), node = src;
      src.buffer = z.buf;
      // a hair of pitch and level difference from hit to hit, the same for the same place in the song
      var h = ((rr | 0) * 2654435761 >>> 0) / 4294967296; src.playbackRate.value = 1 + (h - 0.5) * 0.012;
      if(cut){ var f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = cut; f.Q.value = 0.5; src.connect(f); node = f; }
      var lv = (layers.length > 1 ? Math.pow(clamp(vel, 1, 127) / 127, 1.1) : velGain(vel)) * Math.pow(10, ((d.gainDb || 0) + (z.gainDb || 0)) / 20) * (0.97 + 0.06 * h);
      g.gain.value = lv; node.connect(g); g.connect(n.input); src.start(when);
      var v = { src:src, g:g, start:when, end:when + z.buf.duration, track:t.id, lv:lv, rel:0.05 };
      // a closed hat stops the open one that is still ringing
      var key = t.id;
      if(pc === "hat_closed" && G.hatOpen[key] && G.hatOpen[key].end > when){ var o = G.hatOpen[key]; try { o.g.gain.setValueAtTime(o.lv, when); o.g.gain.setTargetAtTime(0, when, 0.012); o.src.stop(when + 0.08); } catch(e){} o.end = when + 0.08; }
      if(pc === "hat_open") G.hatOpen[key] = v;
      G.voices.push(v);
      return v;
    }
    function playAudio(G, t, buf, when, offset, dur, r){
      var n = trackNodes(G, t), ctx = G.ctx; when = frameTime(ctx, Math.max(when, 0));
      if(offset >= buf.duration || dur <= 0) return null;
      dur = Math.min(dur, buf.duration - offset);
      var src = ctx.createBufferSource(), g = ctx.createGain(), lv = Math.pow(10, (r.gain || 0) / 20), fi = Math.min(r.fi || 0, dur), fo = Math.min(r.fo || 0, dur), startIn = r._in || 0;
      src.buffer = buf;
      // fades are placed against the region's own start and end, also when play starts in its middle
      var regStart = when - startIn, regEnd = regStart + (r._len || dur + startIn), edge = 0.004;
      g.gain.value = 0; g.gain.setValueAtTime(0, when);
      var fiEnd = regStart + Math.max(fi, edge);
      if(when < fiEnd){ var frac = (when - regStart) / Math.max(fi, edge); g.gain.setValueAtTime(lv * clamp(frac, 0, 1), when); g.gain.linearRampToValueAtTime(lv, frameTime(ctx, fiEnd)); }
      else { g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(lv, when + edge); }
      var foStart = Math.max(when + edge, regEnd - Math.max(fo, edge));
      if(foStart < when + dur){ g.gain.setValueAtTime(lv, frameTime(ctx, foStart)); g.gain.linearRampToValueAtTime(0, frameTime(ctx, Math.min(regEnd, when + dur))); }
      src.connect(g); g.connect(n.input); src.start(when, offset, dur + 0.01);
      var v = { src:src, g:g, start:when, end:when + dur + 0.02, track:t.id, lv:lv, rel:0.02, audio:true };
      G.voices.push(v);
      return v;
    }
    function silence(G, at, hard){
      var t = at === undefined ? G.ctx.currentTime : at;
      G.voices.forEach(function(v){ try { v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, hard ? 0.005 : 0.03); v.src.stop(t + (hard ? 0.04 : 0.25)); } catch(e){} });
      G.voices.length = 0; G.hatOpen = {};
    }
    // ---- the click ----
    function clickBuf(ctx, hi){
      var key = "_click" + (hi ? 1 : 0); if(ENG[key] && ENG[key].sampleRate === ctx.sampleRate) return ENG[key];
      var sr = ctx.sampleRate, n = Math.round(sr * 0.03), d = new Float32Array(n), f = hi ? 1568 : 1046.5, i;
      for(i = 0; i < n; i++){ var e = Math.exp(-i / sr * 160) * Math.min(1, i / 8); d[i] = e * (Math.sin(2 * Math.PI * f * i / sr) + 0.3 * Math.sin(2 * Math.PI * f * 2.76 * i / sr)) * 0.6; }
      return (ENG[key] = bufFrom(ctx, d, sr));
    }
    function playClick(G, when, hi, vol){
      var s = G.ctx.createBufferSource(), g = G.ctx.createGain(); s.buffer = clickBuf(G.ctx, hi); g.gain.value = (hi ? 0.7 : 0.45) * (vol === undefined ? 1 : vol);
      s.connect(g); g.connect(G.live ? G.click : G.sum); s.start(frameTime(G.ctx, when));
      return s;
    }

    // ---- swing: off-beats played late, as a way of playing, not a change to the notes ----
    function warp(tick, s){
      s = s || S; var sw = s.swing; if(!sw) return tick;
      var g = s.swingUnit, pair = 2 * g, base = Math.floor(tick / pair) * pair, x = tick - base;
      return base + (x < g ? x * (1 + sw) : g * (1 + sw) + (x - g) * (1 - sw));
    }
    // ---- putting a stretch of the song into a graph ----
    // from..to in song ticks; time = seconds on G's clock of tick "from" (plus skew for a start inside the window)
    var audioBufs = {};      // take id -> AudioBuffer (decoded from the database once)
    function scheduleSpan(G, from, to, timeOf, o){
      o = o || {};
      S.tracks.forEach(function(t){
        if(o.only && o.only !== t.id) return;
        if(t.kind === "audio"){
          t.regions.forEach(function(r){
            var st = r.s, en = r.s + r.l, id = r.takes[r.act], buf = audioBufs[id]; if(!buf) return;
            // a recording starts once: at its own start, or right away when play begins inside it
            var startsHere = st >= from && st < to, inside = o.first && st < from && en > from;
            if(!startsHere && !inside) return;
            var at = startsHere ? st : from, into = tickSec(at - st), len = tickSec(en - at);
            if(o.until !== undefined) len = Math.min(len, tickSec(Math.max(0, o.until - at)));
            r._in = into; r._len = tickSec(r.l);
            playAudio(G, t, buf, timeOf(at), (r.off || 0) + into, len, r);
            delete r._in; delete r._len;
          });
          return;
        }
        var drums = t.kind === "drums";
        t.regions.forEach(function(r){
          if(r.s >= to || r.s + r.l <= from) return;
          eachNote(r, from, to, function(s, l, p, v){
            var w = warp(s), when = timeOf(w);
            if(drums) playDrum(G, t, p, v, when, Math.round(s / 30) + p);
            else {
              var e = s + l; if(o.until !== undefined && e > o.until) e = o.until;
              var dur = timeOf(warp(e)) - when;
              if(dur > 0.004) playNote(G, t, p, v, when, dur);
            }
          });
        });
      });
    }
    function scheduleClicks(G, from, to, timeOf, vol){
      var bt = barTicks(), pt = pulseTicks(), sub = S.sig[1] === 8 && pt !== beatTicks() ? beatTicks() : 0, k;
      for(k = Math.ceil(from / (sub || pt)); k * (sub || pt) < to; k++){
        var tick = k * (sub || pt), onBar = tick % bt === 0, onPulse = tick % pt === 0;
        playClick(G, timeOf(tick), onBar, (onBar || onPulse ? 1 : 0.45) * (vol === undefined ? 1 : vol));
      }
    }

    // ---- the transport ----
    var TR = { playing:false, pos:0, from:0, tick0:0, time0:0, next:0, timer:null, recording:null, raf:0, countEnd:0 };
    function transportTick(){
      // where the sound is now, in song ticks (what is heard, not what has been scheduled)
      if(!TR.playing) return TR.pos;
      var ctx = ENG.ctx, lat = (ctx.outputLatency || ctx.baseLatency || 0), now = ctx.currentTime - lat, x = TR.tick0 + secTick(now - TR.time0);
      if(TR.passes) for(var i = TR.passes.length - 1; i >= 0; i--){ if(now >= TR.passes[i].time0){ x = TR.passes[i].tick0 + secTick(now - TR.passes[i].time0); break; } }
      return Math.max(TR.from < 0 ? TR.from : 0, x);
    }
    function loadTakes(){
      // decode the recordings the song places on its timeline
      if(!S || !ENG.ctx) return Promise.resolve();
      var ids = {}; S.tracks.forEach(function(t){ if(t.kind === "audio") t.regions.forEach(function(r){ var id = r.takes[r.act]; if(id && !audioBufs[id]) ids[id] = 1; }); });
      return Promise.all(Object.keys(ids).map(function(id){
        return dbGet("audio", id).then(function(a){
          if(!a || !a.pcm) return;
          var f = new Float32Array(a.pcm.length), i; for(i = 0; i < f.length; i++) f[i] = a.pcm[i] / 32768;
          audioBufs[id] = bufFrom(ENG.ctx, f, a.sr);
        });
      }));
    }
    function pump(){
      if(!TR.playing) return;
      var ctx = ENG.ctx, G = ENG.G, horizon = ctx.currentTime + LOOKAHEAD, guard = 0;
      while(guard++ < 64){
        var tick0 = TR.tick0, time0 = TR.time0, timeOf = function(tk){ return time0 + tickSec(tk - tick0); };
        var toTick = tick0 + secTick(horizon - time0), loop = S.loop.on && (!TR.recording || TR.recording.kind === "notes") && S.loop.b > S.loop.a && TR.next < S.loop.b ? S.loop : null, end = loop ? Math.min(toTick, loop.b) : toTick;
        if(TR.stopAt !== undefined && end > TR.stopAt) end = TR.stopAt;
        if(end > TR.next){
          if(TR.next >= 0 || end > 0){
            var a = Math.max(0, TR.next);
            if(!TR.clickOnly) scheduleSpan(G, a, end, timeOf, { first:TR.first, until:loop ? loop.b : undefined });
            TR.first = false;
          }
          if(S.metro || TR.recording || TR.next < 0) scheduleClicks(G, TR.next, end, timeOf, TR.next < 0 || TR.recording ? 1 : 0.8);
          TR.next = end;
        }
        if(loop && TR.next >= loop.b && toTick >= loop.b){
          // round again: the loop's start now falls where its end was
          TR.time0 = timeOf(loop.b); TR.tick0 = loop.a; TR.next = loop.a; TR.first = true;
          (TR.passes = TR.passes || []).push({ tick0:loop.a, time0:TR.time0 }); if(TR.passes.length > 8) TR.passes.shift();
          continue;
        }
        break;
      }
      var endTick = Math.max(songTicks(), S.loop.on ? S.loop.b : 0);
      if(TR.stopAt !== undefined && transportTick() >= TR.stopAt){ var cb = TR.onStopAt; transportStop(false, true); if(cb) cb(); return; }
      if(!TR.recording && TR.stopAt === undefined && !S.loop.on && transportTick() > endTick + secTick(1.2)){ transportStop(false, false); TR.pos = 0; emit("transport", { playing:false, tick:0 }); refreshPlayhead(); }
    }
    // o: from (tick), countIn (bars of click before), clickOnly, stopAt (tick), onStopAt, record
    function transportPlay(o){
      o = o || {};
      if(!S) return Promise.resolve(false);
      // one thing plays at a time in First Loop: the sequencer and the decks stop
      try { if(playing) stop(); } catch(e){}
      try { if(typeof shelfStop === "function") shelfStop(); } catch(e1){}
      try { if(typeof DJ !== "undefined" && DJ) DJ._seqStart(); } catch(e2){}
      return ensureEngine().then(function(ok){
        if(!ok) return false;
        return resume().then(loadTakes).then(function(){
          if(TR.playing) transportStop(true);
          var ctx = ENG.ctx, bt = barTicks(), from = o.from !== undefined ? o.from : TR.pos;
          if(S.loop.on && !o.record && o.from === undefined && (from < S.loop.a || from >= S.loop.b)) from = S.loop.a;
          var pre = (o.countIn || 0) * bt;
          TR.playing = true; TR.from = from; TR.pos = from; TR.first = true; TR.passes = null;
          TR.tick0 = from - pre; TR.time0 = frameTime(ctx, ctx.currentTime + 0.09); TR.next = from - pre;
          // inside the count the ticks before "from" only carry clicks: map them so that tick "from" comes after the count
          TR.clickOnly = !!o.clickOnly; TR.stopAt = o.stopAt; TR.onStopAt = o.onStopAt; TR.recording = o.record || null;
          TR.startAt = TR.time0 + tickSec(pre);          // when tick "from" sounds
          if(pre > 0){
            // the count: clicks on the bar(s) before, then the song from "from"
            var G = ENG.G, t0 = TR.time0, cTick;
            for(cTick = 0; cTick < pre; cTick += pulseTicks()) playClick(G, t0 + tickSec(cTick), cTick % bt === 0, 1);
            TR.tick0 = from; TR.time0 = TR.startAt; TR.next = from;
          }
          clearInterval(TR.timer); TR.timer = setInterval(pump, 25); pump();
          emit("transport", { playing:true, tick:from });
          if(typeof playheadLoop === "function") playheadLoop();
          return true;
        });
      });
    }
    function transportStop(quiet, keepPos){
      if(!TR.playing){ return; }
      var at = transportTick();
      TR.playing = false; clearInterval(TR.timer); TR.timer = null;
      if(ENG.G) silence(ENG.G);
      // clicks already handed to the context are short; nothing to cancel
      TR.pos = keepPos ? Math.max(0, at) : Math.max(0, TR.from);
      TR.stopAt = undefined; TR.onStopAt = null; TR.recording = null; TR.clickOnly = false; TR.passes = null;
      if(!quiet){ emit("transport", { playing:false, tick:TR.pos }); refreshPlayhead(); }
    }
    function transportToggle(){ if(TR.playing){ if(REC_UI && REC_UI.active) REC_UI.stop(); else transportStop(); } else transportPlay(); }
    function setPos(tick){
      tick = Math.max(0, Math.round(tick));
      if(TR.playing && !TR.recording){ transportPlay({ from:tick }); return; }
      TR.pos = tick; refreshPlayhead(); emit("transport", { playing:TR.playing, tick:tick });
    }
    // a note played by hand (keys on screen, the computer keyboard, a MIDI keyboard, dragging a note)
    var liveVoices = {};
    function liveOn(t, pitch, vel, key){
      if(!ENG.G) { ensureEngine().then(resume); return; }
      resume();
      var G = ENG.G, when = G.ctx.currentTime + 0.003, k = key || (t.id + ":" + pitch);
      if(liveVoices[k]) liveOff(k);
      if(t.kind === "drums") playDrum(G, t, pitch, vel, when, Math.floor(Math.random() * 8));
      else liveVoices[k] = playNote(G, t, pitch, vel, when, Infinity);
    }
    function liveOff(k){ var v = liveVoices[k]; if(v && ENG.G) releaseVoice(ENG.G, v, ENG.G.ctx.currentTime + 0.005); delete liveVoices[k]; }
    function blip(t, pitch, vel, dur){
      // a short sounding of one note: what a drag or a click on the grid lets her hear
      if(!t || t.kind === "audio") return;
      ensureEngine().then(function(ok){ if(!ok) return; resume(); loadInst(t.inst); var G = ENG.G, when = G.ctx.currentTime + 0.004; if(t.kind === "drums") playDrum(G, t, pitch, vel || 96, when, Math.floor(Math.random() * 8)); else playNote(G, t, pitch, vel || 96, when, dur || 0.3); });
    }
    function levels(){
      // peak of each track and of the master since the last look, 0..1+
      var out = { tracks:{}, master:0 }, G = ENG.G; if(!G) return out;
      var buf = levels.buf || (levels.buf = new Float32Array(512));
      function peak(an){ var n = an.fftSize, b = buf.subarray(0, n), m = 0, i; an.getFloatTimeDomainData(b); for(i = 0; i < n; i++){ var v = Math.abs(b[i]); if(v > m) m = v; } return m; }
      Object.keys(G.tracks).forEach(function(id){ if(G.tracks[id].meter) out.tracks[id] = peak(G.tracks[id].meter); });
      if(G.meter) out.master = peak(G.meter);
      return out;
    }

    // ---- a file of the song: the same graph, off line ----
    // o: from, to (ticks; default the whole song), only (track id: a stem), tail (seconds), limiter, sampleRate
    function renderSong(o){
      o = o || {};
      return ensureEngine().then(function(ok){ if(!ok) throw new Error("no audio"); return Promise.all([ensureSounds(), loadTakes()]); }).then(function(){
        var sr = o.sampleRate || ENG.ctx.sampleRate, from = o.from || 0, to = o.to !== undefined ? o.to : songTicks(), tail = o.tail === undefined ? 1.8 : o.tail;
        if(to <= from) throw new Error("empty");
        var useLim = o.limiter !== false && ENG.limiterOK && !o.only, look = useLim ? Math.max(8, Math.round(LIM_LOOK * sr)) : 0;
        var secs = tickSec(warp(to) - from) + tail, frames = Math.ceil(secs * sr) + look, OC = window.OfflineAudioContext || window.webkitOfflineAudioContext, oc = new OC(2, frames, sr);
        var mods = useLim ? loadModules(oc) : Promise.resolve(false);
        return mods.then(function(okm){
          var keep = ENG.limiterOK; ENG.limiterOK = !!okm && useLim;
          var G = buildGraph(oc, false, { limiter:useLim }); ENG.limiterOK = keep;
          S.tracks.forEach(function(t){ trackNodes(G, t); applyTrack(G, t, 0, o.only || null); });
          G.master.gain.value = o.only ? 1 : (S.mvol === undefined ? 1 : S.mvol);
          var timeOf = function(tk){ return tickSec(tk - from); };
          scheduleSpan(G, from, to, timeOf, { first:true, until:o.cut ? to : undefined, only:o.only || null });
          if(o.click) scheduleClicks(G, from, to, timeOf, 1);
          return oc.startRendering().then(function(buf){
            if(!G.lookFrames) return buf;
            // the limiter looks ahead: take its delay off the front so the file starts where the song does
            var out = oc.createBuffer(2, buf.length - G.lookFrames, sr), c;
            for(c = 0; c < 2; c++) out.getChannelData(c).set(buf.getChannelData(c).subarray(G.lookFrames));
            return out;
          });
        });
      });
    }
    function wavBytes(chans, sr, bits){
      bits = bits === 24 ? 24 : 16;
      var nc = chans.length, n = chans[0].length, bps = bits / 8, ab = new ArrayBuffer(44 + n * nc * bps), dv = new DataView(ab), i, c, p = 44, v;
      function str(o, s){ for(var k = 0; k < s.length; k++) dv.setUint8(o + k, s.charCodeAt(k)); }
      str(0, "RIFF"); dv.setUint32(4, 36 + n * nc * bps, true); str(8, "WAVEfmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nc, true);
      dv.setUint32(24, sr, true); dv.setUint32(28, sr * nc * bps, true); dv.setUint16(32, nc * bps, true); dv.setUint16(34, bits, true); str(36, "data"); dv.setUint32(40, n * nc * bps, true);
      for(i = 0; i < n; i++) for(c = 0; c < nc; c++){
        v = chans[c][i]; v = v < -1 ? -1 : (v > 1 ? 1 : v);
        if(bits === 16){ dv.setInt16(p, Math.round(v < 0 ? v * 32768 : v * 32767), true); p += 2; }
        else { var q = Math.round(v < 0 ? v * 8388608 : v * 8388607); dv.setUint8(p, q & 255); dv.setUint8(p + 1, (q >> 8) & 255); dv.setUint8(p + 2, (q >> 16) & 255); p += 3; }
      }
      return new Uint8Array(ab);
    }
    function wavRead(u8){
      // enough of a reader for the files this app writes and the usual PCM WAV: returns { sr, chans:[Float32Array] } or null
      try {
        var dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), p = 12, fmt = null, i, c;
        if(dv.getUint32(0, false) !== 0x52494646 || dv.getUint32(8, false) !== 0x57415645) return null;
        while(p + 8 <= u8.length){
          var id = dv.getUint32(p, false), sz = dv.getUint32(p + 4, true);
          if(id === 0x666d7420) fmt = { tag:dv.getUint16(p + 8, true), nc:dv.getUint16(p + 10, true), sr:dv.getUint32(p + 12, true), bits:dv.getUint16(p + 22, true) };
          else if(id === 0x64617461 && fmt){
            var bps = fmt.bits / 8, n = Math.floor(Math.min(sz, u8.length - p - 8) / (bps * fmt.nc)), ch = [], q = p + 8;
            for(c = 0; c < fmt.nc; c++) ch.push(new Float32Array(n));
            for(i = 0; i < n; i++) for(c = 0; c < fmt.nc; c++){
              if(fmt.tag === 3 && fmt.bits === 32) ch[c][i] = dv.getFloat32(q, true);
              else if(fmt.bits === 16) ch[c][i] = dv.getInt16(q, true) / 32768;
              else if(fmt.bits === 24) ch[c][i] = ((dv.getInt8(q + 2) << 16) | (dv.getUint8(q + 1) << 8) | dv.getUint8(q)) / 8388608;
              else if(fmt.bits === 8) ch[c][i] = (dv.getUint8(q) - 128) / 128;
              else return null;
              q += bps;
            }
            return { sr:fmt.sr, chans:ch };
          }
          p += 8 + sz + (sz & 1);
        }
      } catch(e){}
      return null;
    }
    function bufChans(buf){ var ch = [], c; for(c = 0; c < buf.numberOfChannels; c++) ch.push(buf.getChannelData(c)); return ch; }

    // ---- MIDI files: out (type 1) and in ----
    function midiOut(s){
      s = s || S;
      function vlq(n){ var b = [n & 127]; n >>= 7; while(n > 0){ b.unshift((n & 127) | 128); n >>= 7; } return b; }
      function chunk(id, data){ var o = [id.charCodeAt(0), id.charCodeAt(1), id.charCodeAt(2), id.charCodeAt(3), (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255]; return o.concat(data); }
      function text(type, str){ var bytes = []; for(var i = 0; i < str.length; i++){ var c = str.charCodeAt(i); bytes.push(c < 128 ? c : 63); } return [0xFF, type].concat(vlq(bytes.length), bytes); }
      var tracks = [], us = Math.round(60000000 / s.tempo), den = Math.round(Math.log(s.sig[1]) / Math.LN2);
      var head = [].concat([0], text(3, s.name), [0, 0xFF, 0x51, 3, (us >> 16) & 255, (us >> 8) & 255, us & 255], [0, 0xFF, 0x58, 4, s.sig[0], den, s.sig[1] === 8 ? 36 : 24, 8]);
      if(s.key && s.key.root !== null && s.key.scale !== "none"){
        var sf = [0, -5, 2, -3, 4, -1, 6, 1, -4, 3, -2, 5][s.key.scale === "minor" ? (s.key.root + 3) % 12 : s.key.root];
        head = head.concat([0, 0xFF, 0x59, 2, sf & 255, s.key.scale === "minor" ? 1 : 0]);
      }
      s.sections.forEach(function(){});
      var marks = s.sections.map(function(q){ return { t:q.bar * barTicks(s), name:q.name }; }).sort(function(a, b){ return a.t - b.t; }), last = 0;
      marks.forEach(function(m){ head = head.concat(vlq(m.t - last), text(6, m.name)); last = m.t; });
      head = head.concat([0, 0xFF, 0x2F, 0]);
      tracks.push(chunk("MTrk", head));
      var chN = 0;
      s.tracks.forEach(function(t){
        if(t.kind === "audio") return;
        var drums = t.kind === "drums", ch = drums ? 9 : (chN === 9 ? ++chN : chN), ev = [], d = ENG.inst[t.inst], prog = drums ? 0 : (d && d.gm !== undefined ? d.gm : GM_BY_FAMILY[d ? d.family : "keys"] || 0);
        if(!drums) chN = (chN + 1) % 16;
        var keep = S; S = s;
        t.regions.forEach(function(r){ eachNote(r, r.s, r.s + r.l, function(st, l, p, v){
          var a = Math.round(warp(st, s)), b = Math.round(warp(st + l, s)), pp = clamp(p + (drums ? 0 : 12 * (t.oct || 0)), 0, 127);
          ev.push([a, 1, 0x90 | ch, pp, v]); ev.push([Math.max(a + 1, b), 0, 0x80 | ch, pp, 0]);
        }); });
        S = keep;
        ev.sort(function(a, b){ return a[0] - b[0] || a[1] - b[1]; });
        var data = [].concat([0], text(3, t.name), [0, 0xC0 | ch, prog, 0, 0xB0 | ch, 7, Math.round(clamp(t.vol, 0, 1) * 127), 0, 0xB0 | ch, 10, Math.round((t.pan + 1) * 63.5)]), lt = 0;
        ev.forEach(function(e){ data = data.concat(vlq(e[0] - lt), [e[2], e[3], e[4]]); lt = e[0]; });
        data = data.concat([0, 0xFF, 0x2F, 0]);
        tracks.push(chunk("MTrk", data));
      });
      var hd = chunk("MThd", [0, 1, (tracks.length >> 8) & 255, tracks.length & 255, (PPQ >> 8) & 255, PPQ & 255]), all = hd;
      tracks.forEach(function(t){ all = all.concat(t); });
      return new Uint8Array(all);
    }
    function midiIn(u8, name){
      // returns a song (not yet opened) or null
      try {
        var p = 0, dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
        if(dv.getUint32(0, false) !== 0x4D546864) return null;
        var hl = dv.getUint32(4, false), ntr = dv.getUint16(10, false), div = dv.getUint16(12, false);
        if(div & 0x8000) return null;
        p = 8 + hl;
        var s = newSong(name || "Imported song"), raw = [], tempoSet = false, sigSet = false, k;
        for(k = 0; k < ntr && p + 8 <= u8.length; k++){
          if(dv.getUint32(p, false) !== 0x4D54726B){ p += 8 + dv.getUint32(p + 4, false); k--; if(p >= u8.length) break; continue; }
          var len = dv.getUint32(p + 4, false), q = p + 8, end = q + len, tick = 0, run = 0, tr = { name:"", notes:{}, out:[], ch:{}, prog:{} };
          while(q < end){
            var dl = 0, b; do { b = u8[q++]; dl = (dl << 7) | (b & 127); } while(b & 128 && q < end);
            tick += dl;
            var st = u8[q];
            if(st < 0x80) st = run; else { q++; if(st < 0xF0) run = st; }
            if(st === 0xFF){
              var mt = u8[q++], ml = 0; do { b = u8[q++]; ml = (ml << 7) | (b & 127); } while(b & 128);
              if(mt === 0x51 && !tempoSet && ml === 3){ s.tempo = clamp(Math.round(60000000 / ((u8[q] << 16) | (u8[q + 1] << 8) | u8[q + 2])), 40, 220); tempoSet = true; }
              else if(mt === 0x58 && !sigSet){ var nn = u8[q], dd = 1 << u8[q + 1]; if({ "4/4":1, "3/4":1, "6/8":1, "2/4":1, "5/4":1, "12/8":1 }[nn + "/" + dd]){ s.sig = [nn, dd]; } sigSet = true; }
              else if(mt === 0x59 && ml === 2){ var sf = dv.getInt8(q), mi = u8[q + 1]; var root = ((sf * 7) % 12 + 12) % 12; if(mi) root = (root + 9) % 12; s.key = { root:root, scale:mi ? "minor" : "major" }; }
              else if(mt === 3){ var nm = ""; for(var i2 = 0; i2 < ml; i2++) nm += String.fromCharCode(u8[q + i2]); if(k === 0 && ntr > 1) s.name = name || nm.slice(0, 60) || s.name; tr.name = nm.slice(0, 32); }
              else if(mt === 6){ var mk = ""; for(var i3 = 0; i3 < ml; i3++) mk += String.fromCharCode(u8[q + i3]); (s._marks = s._marks || []).push({ t:tick, name:mk.slice(0, 24) }); }
              q += ml;
            } else if(st === 0xF0 || st === 0xF7){ var sl = 0; do { b = u8[q++]; sl = (sl << 7) | (b & 127); } while(b & 128); q += sl; }
            else {
              var hi = st & 0xF0, ch = st & 15, d1 = u8[q++], d2 = (hi === 0xC0 || hi === 0xD0) ? 0 : u8[q++];
              if(hi === 0x90 && d2 > 0){ tr.notes[ch + ":" + d1] = { s:tick, v:d2 }; tr.ch[ch] = 1; }
              else if(hi === 0x80 || (hi === 0x90 && d2 === 0)){ var on = tr.notes[ch + ":" + d1]; if(on){ tr.out.push({ s:on.s, l:Math.max(1, tick - on.s), p:d1, v:on.v, ch:ch }); delete tr.notes[ch + ":" + d1]; } }
              else if(hi === 0xC0) tr.prog[ch] = d1;
            }
          }
          raw.push(tr); p = end;
        }
        var scale = PPQ / div, bt = barTicks(s);
        raw.forEach(function(tr){
          // one track of the file may hold several channels: each becomes a track here
          Object.keys(tr.ch).forEach(function(chS){
            var ch = +chS, ns = tr.out.filter(function(n){ return n.ch === ch; }); if(!ns.length || s.tracks.length >= MAXTRACKS) return;
            var drums = ch === 9, prog = tr.prog[ch] || 0, fam = drums ? "drums" : prog < 8 ? "keys" : prog < 24 ? "keys" : prog < 32 ? "guitars" : prog < 40 ? "bass" : prog < 52 ? "strings" : prog < 56 ? "voice" : prog < 80 ? "winds" : "keys";
            var b = BASIC.filter(function(x){ return x.family === fam; })[0], keep = S; S = s;
            var t = newTrack(drums ? "drums" : "inst", drums ? "basic:kit" : (b ? b.id : "basic:piano"), tr.name || (drums ? "Drums" : "Track " + (s.tracks.length + 1)));
            var notes = ns.map(function(n){ return { s:Math.round(n.s * scale), l:Math.max(1, Math.round(n.l * scale)), p:drums ? (DRUM_OF[n.p] ? DRUM[DRUM_OF[n.p]] : n.p) : n.p, v:n.v }; });
            if(drums) notes = notes.filter(function(n){ return DRUM_OF[n.p]; });
            var endT = 0; notes.forEach(function(n){ if(n.s + n.l > endT) endT = n.s + n.l; });
            var L = Math.max(bt, Math.ceil(endT / bt) * bt);
            s.tracks.push(t);
            if(notes.length) addRegion(t, 0, L, notes);
            S = keep;
          });
        });
        if(s._marks){
          var ms = s._marks.sort(function(a, b){ return a.t - b.t; }), endAll = Math.ceil(songTicks(s) / bt);
          ms.forEach(function(m, i){ var bar = Math.round(m.t * scale / bt), nb = i + 1 < ms.length ? Math.round(ms[i + 1].t * scale / bt) : endAll; if(nb > bar) s.sections.push({ id:uid("c"), name:m.name || "Section", bar:bar, len:nb - bar }); });
          delete s._marks;
        }
        return fixSong(s) ? s : null;
      } catch(e){ return null; }
    }
