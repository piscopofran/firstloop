    // ---------- Studio: the microphone, humming a part, recording ----------
    var MIC = { stream:null, src:null, node:null, sink:null, chunks:[], len:0, frame0:null, on:false, label:"", level:0, onLevel:null };
    var REC_UI = null;                  // set by the screen while something is being recorded: { active, stop() }
    var TEST = { micNode:null };        // tests put a node here that stands in for the microphone
    var takeCache = {};                 // take id -> { an, sr, len, peaks, lat }
    var LAT = { map:null, nudge:0 };
    var worker = null, workerJobs = {}, workerSeq = 0;

    function dspWorker(){
      if(worker !== null) return worker;
      try {
        var src = "var L=(" + stDspLib.toString() + ")();onmessage=function(e){var d=e.data,r;try{r=L[d.fn].apply(null,d.args);postMessage({id:d.id,r:r});}catch(err){postMessage({id:d.id,err:String(err)});}};";
        worker = new Worker(URL.createObjectURL(new Blob([src], { type:"text/javascript" })));
        worker.onmessage = function(e){ var j = workerJobs[e.data.id]; if(!j) return; delete workerJobs[e.data.id]; if(e.data.err) j.rej(new Error(e.data.err)); else j.res(e.data.r); };
        worker.onerror = function(){ var js = workerJobs; workerJobs = {}; worker = false; Object.keys(js).forEach(function(k){ js[k].fallback(); }); };
      } catch(e){ worker = false; }
      return worker;
    }
    // run one of the listening functions off the page's own thread (on it, if a Worker cannot be made)
    function dspRun(fn, args){
      var w = dspWorker();
      function direct(){ return new Promise(function(res, rej){ setTimeout(function(){ try { res(dsp()[fn].apply(null, args)); } catch(e){ rej(e); } }, 0); }); }
      if(!w) return direct();
      return new Promise(function(res, rej){
        var id = ++workerSeq; workerJobs[id] = { res:res, rej:rej, fallback:function(){ direct().then(res, rej); } };
        try { w.postMessage({ id:id, fn:fn, args:args }); } catch(e){ delete workerJobs[id]; direct().then(res, rej); }
      });
    }

    // ---- the microphone ----
    // Three ways of keeping what it hears, tried in this order: a recorder on the audio thread (exact to the sample),
    // the older ScriptProcessor (where a worklet cannot be loaded), and the browser's own MediaRecorder decoded
    // afterwards (where neither is there). All three end as the same thing: samples at a known rate, kept as 16-bit
    // PCM beside the song, so nothing later depends on which container a browser records in.
    function micChunk(x, f){
      if(!MIC.on) return;
      var i, m = 0, ctx = ENG.ctx;
      if(MIC.meterOnly){ for(i = 0; i < x.length; i += 4){ var v0 = Math.abs(x[i]); if(v0 > m) m = v0; } MIC.level = Math.max(m, MIC.level * 0.86); return; }
      if(MIC.frame0 === null) MIC.frame0 = f;
      // a block that went missing is filled with silence, so that time stays true
      var want = MIC.frame0 + MIC.len;
      if(f !== null && !MIC.loose && f > want && f - want < ctx.sampleRate){ MIC.chunks.push(new Float32Array(f - want)); MIC.len += f - want; }
      MIC.chunks.push(x); MIC.len += x.length;
      for(i = 0; i < x.length; i += 4){ var v = Math.abs(x[i]); if(v > m) m = v; }
      MIC.level = Math.max(m, MIC.level * 0.86);
      if(m > MIC.peak) MIC.peak = m;
      if(MIC.cap && MIC.len > MIC.cap && MIC.onCap){ var cb = MIC.onCap; MIC.onCap = null; setTimeout(cb, 0); }
    }
    function recMime(){
      // what this browser's recorder can write: WebM/Opus in Chrome and Firefox, MP4/AAC in Safari
      var MR = window.MediaRecorder, list = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", "audio/ogg;codecs=opus", "audio/wav"], i;
      if(!MR || typeof MR.isTypeSupported !== "function") return "";
      for(i = 0; i < list.length; i++){ try { if(MR.isTypeSupported(list[i])) return list[i]; } catch(e){} }
      return "";
    }
    function micModes(){
      var ctx = ENG.ctx, out = [];
      if(ENG.mods) out.push("worklet");
      if(ctx && typeof ctx.createScriptProcessor === "function") out.push("script");
      if(typeof window.MediaRecorder === "function") out.push("recorder");
      if(TEST.micMode && out.indexOf(TEST.micMode) >= 0) out = [TEST.micMode];
      return out;
    }
    function micOpen(){
      return ensureEngine().then(function(ok){
        if(!ok) throw new Error("noaudio");
        if(!micModes().length) throw new Error("noworklet");
        return resume();
      }).then(function(){
        if(MIC.src) return true;
        var ctx = ENG.ctx;
        function wire(srcNode, label, stream){
          var modes = micModes(), k;
          MIC.src = srcNode; MIC.label = label || ""; MIC.mode = "";
          MIC.sink = ctx.createGain(); MIC.sink.gain.value = 0; MIC.sink.connect(ctx.destination);
          // the level and the line of her voice while she hums are read here, whichever way the samples are kept
          try { MIC.an = ctx.createAnalyser(); MIC.an.fftSize = 4096; MIC.an.smoothingTimeConstant = 0; srcNode.connect(MIC.an); } catch(e0){ MIC.an = null; }
          for(k = 0; k < modes.length && !MIC.mode; k++){
            try {
              if(modes[k] === "worklet"){
                MIC.node = new AudioWorkletNode(ctx, "fl-studio-rec", { numberOfInputs:1, numberOfOutputs:1, channelCount:1, channelCountMode:"explicit" });
                srcNode.connect(MIC.node); MIC.node.connect(MIC.sink);
                MIC.node.port.onmessage = function(e){ micChunk(e.data.x, e.data.f); };
              } else if(modes[k] === "script"){
                var sp = ctx.createScriptProcessor(TEST.spSize || 2048, 1, 1);
                sp.onaudioprocess = function(e){
                  if(!MIC.on) return;
                  var ch = e.inputBuffer.getChannelData(0), x = new Float32Array(ch.length); x.set(ch);
                  // the callback is told when its output will be heard; what it is handed was heard two blocks before that.
                  // Only the first block's time is used (blocks follow one another; their reported times jitter).
                  micChunk(x, Math.round((e.playbackTime || ctx.currentTime) * ctx.sampleRate) - 2 * ch.length);
                };
                srcNode.connect(sp); sp.connect(MIC.sink); MIC.node = sp; MIC.loose = true;
              } else {
                var st = stream; if(!st){ MIC.msd = ctx.createMediaStreamDestination(); srcNode.connect(MIC.msd); st = MIC.msd.stream; }
                MIC.rec = { stream:st, mr:null, parts:[], t0:0, mime:recMime() }; MIC.node = null;
              }
              MIC.mode = modes[k];
            } catch(e1){ MIC.node = null; }
          }
          if(!MIC.mode){ micClose(); throw new Error("noworklet"); }
          emit("mic", { open:true, mode:MIC.mode, label:MIC.label });
          return true;
        }
        if(TEST.micNode) return wire(TEST.micNode(ctx), "test input", null);
        if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("nomic");
        if(typeof micBefore === "function") micBefore();
        // music, not a call: the browser's echo canceller, noise gate and automatic level all damage a sung note
        // (a phone honours these only in part; what it actually gave is kept in MIC.settings for the phone check)
        return navigator.mediaDevices.getUserMedia({ audio:{ echoCancellation:false, noiseSuppression:false, autoGainControl:false, channelCount:1 } }).then(function(stream){
          MIC.stream = stream;
          var tr = stream.getAudioTracks()[0];
          try { MIC.settings = tr && tr.getSettings ? tr.getSettings() : null; } catch(e2){ MIC.settings = null; }
          // a call, Siri or another app taking the microphone ends the track: what was recorded so far is kept
          if(tr) tr.onended = function(){ if(MIC.stream === stream && typeof micLost === "function") micLost(); };
          return wire(ctx.createMediaStreamSource(stream), tr ? tr.label : "", stream);
        }, function(e){ if(typeof micAfter === "function") micAfter(); throw e; });
      });
    }
    function micGate(on){
      if(MIC.mode === "worklet" && MIC.node) MIC.node.port.postMessage({ on:on });
      else if(MIC.mode === "recorder" && MIC.rec){
        var R = MIC.rec;
        if(on && !MIC.meterOnly && !R.mr){
          R.parts = []; R.t0 = ENG.ctx.currentTime;
          try { R.mr = R.mime ? new MediaRecorder(R.stream, { mimeType:R.mime }) : new MediaRecorder(R.stream); } catch(e){ R.mr = new MediaRecorder(R.stream); }
          R.mr.ondataavailable = function(e){ if(e.data && e.data.size) R.parts.push(e.data); };
          R.mr.onstart = function(){ R.t0 = ENG.ctx.currentTime; };
          R.mr.start(1000);
        }
      }
      // where no chunks arrive on the page (the recorder), the level is read from the analyser
      clearInterval(MIC.lvTimer); MIC.lvTimer = 0;
      if(on && MIC.mode === "recorder") MIC.lvTimer = setInterval(function(){ var l = micLive(true); if(l){ MIC.level = Math.max(l.peak, MIC.level * 0.86); if(!MIC.meterOnly && l.peak > MIC.peak) MIC.peak = l.peak; } }, 50);
    }
    function micClose(){
      var had = !!MIC.src;
      MIC.on = false; clearInterval(MIC.lvTimer); MIC.lvTimer = 0;
      try { micGate(false); } catch(e0){}
      try { if(MIC.rec && MIC.rec.mr && MIC.rec.mr.state !== "inactive"){ MIC.rec.mr.ondataavailable = null; MIC.rec.mr.onstop = null; MIC.rec.mr.stop(); } } catch(e3){}
      try { if(MIC.src) MIC.src.disconnect(); if(MIC.node){ MIC.node.disconnect(); if(MIC.node.onaudioprocess) MIC.node.onaudioprocess = null; } if(MIC.sink) MIC.sink.disconnect(); if(MIC.msd) MIC.msd.disconnect(); } catch(e){}
      try { if(MIC.stream) MIC.stream.getTracks().forEach(function(t){ t.onended = null; t.stop(); }); } catch(e2){}
      MIC.stream = MIC.src = MIC.node = MIC.sink = MIC.an = MIC.rec = MIC.msd = null; MIC.mode = ""; MIC.cap = 0; MIC.onCap = null; MIC.loose = false;
      if(had){ if(typeof micAfter === "function") micAfter(); emit("mic", { open:false }); }
    }
    function micWhy(e){
      var n = e && (e.name || e.message) || "", ph = MOB.handheld;
      if(/noworklet|noaudio/.test(n)) return "This browser cannot record here. Chrome, Edge, Safari and Firefox of the last few years can.";
      if(/nomic|NotFound|Overconstrained/.test(n)) return ph ? "No microphone was found. If a headset is connected, check that it is switched on." : "No microphone was found. Plug one in, or check the computer's sound settings.";
      if(/NotAllowed|Permission|Security/.test(n)) return ph ? "The microphone is not allowed for this page. Allow it in the browser’s settings for this site, then press the button again. On an iPhone: the page menu beside the address, Website Settings, Microphone."
        : "The browser did not allow the microphone. Allow it for this page (the icon beside the address), then press the button again.";
      return ph ? "The microphone could not be opened. Another app may be using it (a call, a voice message). Close that, then try again." : "The microphone could not be opened. Close other programs that are using it, then try again.";
    }
    // the level and the pitch of what the microphone hears this moment: { peak, db, midi (0 when no clear note), clarity }
    function micLive(levelOnly){
      var an = MIC.an; if(!an || !ENG.ctx) return null;
      var n = an.fftSize, b = micLive.buf && micLive.buf.length === n ? micLive.buf : (micLive.buf = new Float32Array(n)), i, pk = 0, e = 0, v;
      if(an.getFloatTimeDomainData) an.getFloatTimeDomainData(b);
      else { var u = micLive.u8 && micLive.u8.length === n ? micLive.u8 : (micLive.u8 = new Uint8Array(n)); an.getByteTimeDomainData(u); for(i = 0; i < n; i++) b[i] = (u[i] - 128) / 128; }
      var tail = Math.min(n, Math.round(ENG.ctx.sampleRate * 0.05));
      for(i = n - tail; i < n; i++){ v = b[i]; if(v < 0) v = -v; if(v > pk) pk = v; e += v * v; }
      var out = { peak:pk, db:10 * Math.log(Math.max(1e-12, e / tail)) / Math.LN10, midi:0, clarity:0 };
      if(levelOnly || out.db < -52) return out;
      try {
        var F = dsp().frames(b, ENG.ctx.sampleRate), T = F.n ? dsp().track(F) : null, k = F.n - 1;
        if(T && T.cl[k] >= 0.6 && T.pm[k] >= 33 && T.pm[k] <= 100){ out.midi = T.pm[k]; out.clarity = T.cl[k]; }
      } catch(e2){}
      return out;
    }
    function recBegin(){ MIC.meterOnly = false; MIC.chunks = []; MIC.len = 0; MIC.frame0 = null; MIC.peak = 0; MIC.level = 0; MIC.on = true; micGate(true); }
    // resolves with what was recorded: { x, sr, frame0, peak }
    function recEnd(){
      var R = MIC.rec, ctx = ENG.ctx, mode = MIC.mode;
      MIC.on = false; try { micGate(false); } catch(e0){}
      if(mode === "recorder" && R && R.mr){
        var mr = R.mr, peak = MIC.peak; R.mr = null;
        return new Promise(function(res, rej){
          mr.onstop = function(){
            var blob = new Blob(R.parts, { type:mr.mimeType || R.mime || "" }); R.parts = [];
            var ab = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function(r2, j2){ var fr = new FileReader(); fr.onload = function(){ r2(fr.result); }; fr.onerror = j2; fr.readAsArrayBuffer(blob); });
            ab.then(decode).then(function(buf){
              var n = buf.length, x = new Float32Array(n), c, i, d;
              for(c = 0; c < buf.numberOfChannels; c++){ d = buf.getChannelData(c); for(i = 0; i < n; i++) x[i] += d[i] / buf.numberOfChannels; }
              res({ x:x, sr:buf.sampleRate, frame0:Math.round(R.t0 * buf.sampleRate), peak:peak, mode:"recorder", mime:blob.type });
            }, rej);
          };
          try { if(mr.state !== "inactive") mr.stop(); else mr.onstop(); } catch(e){ rej(e); }
        });
      }
      var x = new Float32Array(MIC.len), p = 0; MIC.chunks.forEach(function(c){ x.set(c, p); p += c.length; }); MIC.chunks = [];
      return Promise.resolve({ x:x, sr:ctx.sampleRate, frame0:MIC.frame0 || 0, peak:MIC.peak, mode:mode });
    }

    // ---- latency: the time between a sound leaving the app and coming back through the microphone ----
    function latKey(){ return (MIC.label || "default") + "|" + (ENG.ctx ? ENG.ctx.sampleRate : 0); }
    function latLoad(){ return LAT.map ? Promise.resolve(LAT.map) : dbGet("kv", "latency").then(function(m){ LAT.map = m && typeof m === "object" ? m : {}; return LAT.map; }); }
    function latNow(){
      // { sec, measured }
      var m = LAT.map || {}, k = latKey(), e = m[k] || m["*"];
      if(e && typeof e.sec === "number") return { sec:e.sec + (e.nudge || 0), measured:true, nudge:e.nudge || 0 };
      var ctx = ENG.ctx, out = ctx ? (ctx.outputLatency || 0) + (ctx.baseLatency || 0) : 0, inp = 0;
      try { var st = MIC.stream && MIC.stream.getAudioTracks()[0].getSettings(); if(st && st.latency) inp = st.latency; } catch(e2){}
      return { sec:clamp(out + (inp || 0.012), 0, 0.5) + ((m["*nudge"] || 0)), measured:false, nudge:m["*nudge"] || 0 };
    }
    function latStore(sec){ return latLoad().then(function(m){ var old = m[latKey()]; m[latKey()] = { sec:sec, nudge:old ? old.nudge || 0 : 0, t:Date.now() }; return dbPut("kv", m, "latency"); }); }
    function latNudge(ms){
      return latLoad().then(function(m){
        var k = latKey(); if(m[k]) m[k].nudge = clamp(ms / 1000, -0.2, 0.2); else m["*nudge"] = clamp(ms / 1000, -0.2, 0.2);
        return dbPut("kv", m, "latency");
      });
    }
    // eight clicks out, listened for on the way back. Resolves { ok, sec, heard, of } .
    function calibrate(onStep){
      var res = { ok:false };
      return latLoad().then(micOpen).then(function(){
        var ctx = ENG.ctx, G = ENG.G, n = 8, gap = 0.4, t0 = frameTime(ctx, ctx.currentTime + 0.5), times = [], i;
        transportStop(true);
        recBegin();
        for(i = 0; i < n; i++){ times.push(t0 + i * gap); playClick(G, t0 + i * gap, true, 1.4); }
        if(onStep) for(i = 0; i < n; i++) (function(k){ setTimeout(function(){ onStep(k + 1, n); }, (t0 - ctx.currentTime + k * gap) * 1000); })(i);
        return new Promise(function(done){
          setTimeout(function(){
            recEnd().then(function(r){
              var rel = times.map(function(t){ return t - r.frame0 / r.sr; }), click = clickBuf(ctx, true).getChannelData(0);
              return dspRun("clickDelay", [r.x, r.sr, rel, click, 0.45]).then(function(d){
                if(d && d.delay > 0.001){ res = { ok:true, sec:d.delay, heard:d.heard, of:d.of }; return latStore(d.delay).then(function(){ done(res); }); }
                done({ ok:false, level:r.peak });
              });
            })["catch"](function(){ done({ ok:false }); });
          }, (t0 - ctx.currentTime + n * gap + 0.55) * 1000);
        });
      })["catch"](function(e){ return { ok:false, why:micWhy(e) }; }).then(function(r){ micClose(); return r; });
    }

    // while something is recorded: how loud the song and the click play (quietly on a phone's own speaker, which the
    // microphone beside it hears); null puts both back
    function recLevels(o){
      if(!ENG.G) return;
      var now = ENG.ctx.currentTime;
      try { ENG.G.music.gain.setTargetAtTime(o && o.music !== undefined ? o.music : 1, now, 0.02); ENG.G.click.gain.setTargetAtTime(o && o.click !== undefined ? o.click : 1, now, 0.02); } catch(e){}
    }
    // ---- takes ----
    // a take that the device would not store (no room, storage blocked) stays here until the page closes
    var memTakes = {};
    function takePut(rec){
      return (TEST.failAudio ? Promise.reject(new Error("test")) : dbPut("audio", rec)).then(function(){ delete memTakes[rec.id]; return true; }, function(){
        memTakes[rec.id] = rec; emit("takelost", { id:rec.id });
        tell("This take could not be stored on this device (no room, or storage is blocked). It is kept until the page closes: save a copy of the song now, from Share.");
        return false;
      });
    }
    function takeRetry(){
      // try once more to store what is only in memory
      return Promise.all(Object.keys(memTakes).map(function(id){ return takePut(memTakes[id]); })).then(function(){ return Object.keys(memTakes).length; });
    }
    function takeGet(id){ return memTakes[id] ? Promise.resolve(memTakes[id]) : dbGet("audio", id); }
    function takeSave(x, sr, meta){
      var pcm = new Int16Array(x.length), i, v; for(i = 0; i < x.length; i++){ v = x[i]; v = v < -1 ? -1 : (v > 1 ? 1 : v); pcm[i] = Math.round(v * 32767); }
      var rec = { id:uid("a"), song:S.id, sr:sr, pcm:pcm, an:meta.an || null, name:meta.name || "Take", made:Date.now(), lat:meta.lat || 0, kind:meta.kind || "audio" };
      takeCache[rec.id] = { an:rec.an, sr:sr, len:x.length, peaks:dsp().peaks(x, Math.max(1, Math.round(sr / 200))), lat:rec.lat, name:rec.name, made:rec.made };
      if(ENG.ctx) audioBufs[rec.id] = bufFrom(ENG.ctx, x, sr);
      return takePut(rec).then(function(){ if(typeof storageNote === "function") storageNote("take"); return rec.id; });
    }
    function takeInfo(id){
      // analysis and waveform of a take, read once
      if(takeCache[id]) return Promise.resolve(takeCache[id]);
      return takeGet(id).then(function(a){
        if(!a || !a.pcm) return null;
        var f = new Float32Array(a.pcm.length), i; for(i = 0; i < f.length; i++) f[i] = a.pcm[i] / 32768;
        takeCache[id] = { an:a.an, sr:a.sr, len:f.length, peaks:dsp().peaks(f, Math.max(1, Math.round(a.sr / 200))), lat:a.lat || 0, name:a.name, made:a.made };
        if(ENG.ctx && !audioBufs[id]) audioBufs[id] = bufFrom(ENG.ctx, f, a.sr);
        return takeCache[id];
      });
    }
    function takeFloat(id){
      return takeGet(id).then(function(a){ if(!a || !a.pcm) return null; var f = new Float32Array(a.pcm.length), i; for(i = 0; i < f.length; i++) f[i] = a.pcm[i] / 32768; return { x:f, sr:a.sr, rec:a }; });
    }
    function takeAnalyse(id, o){
      // listen to a take that has not been listened to yet (a recorded voice that is to become notes)
      return takeFloat(id).then(function(t){
        if(!t) return null;
        return dspRun("analyse", [t.x, t.sr, o || {}]).then(function(an){
          t.rec.an = slimAn(an);
          if(takeCache[id]) takeCache[id].an = t.rec.an;
          return takePut(t.rec).then(function(){ return t.rec.an; });
        });
      });
    }
    function slimAn(an){
      // what is kept of an analysis: the notes in seconds, her pitch line, the overall tuning and levels
      return { v:1, notes:an.notes, contour:an.contour, hop:an.hop, t0:an.t0, tune:an.tune, peakDb:an.peakDb, noiseDb:an.noiseDb, dur:an.dur, clipped:!!an.clipped, quiet:!!an.quiet };
    }

    // ---- from a take's analysis to the notes of a region, by her three choices ----
    function humNotes(t, r, an){
      var d = ENG.inst[t.inst] || ENG.inst[standIn(t)], h = r.hum, rng = d && d.range ? d.range : [48, 84];
      // a comfortable range sits inside what the instrument can play: its middle two thirds
      var span = rng[1] - rng[0], comfy = [rng[0] + span * 0.12, rng[1] - span * 0.25];
      return dsp().cleanup(an, { tempo:S.tempo, ppq:PPQ, origin:h.origin, timing:h.timing, grid:h.grid || 0, pitch:h.pitch, key:S.key, octave:h.octave || 0, semi:h.semi || 0,
                                 range:comfy, autoOctave:true, maxTicks:r.l });
    }
    function humApply(t, r, an){
      var res = humNotes(t, r, an), p = patOf(r);
      // the track's own octave setting is for listening; the notes are written where they sound
      p.notes = res.notes; p.len = Math.max(p.len, r.l); sortNotes(p);
      r.hum.edited = false; r.hum.shift = res.octave;
      return res;
    }
    function humRedo(regionId){
      // called when one of the three choices changes
      var f = findRegion(regionId); if(!f || !f.r.hum) return Promise.resolve(null);
      return takeInfo(f.r.hum.take).then(function(ti){
        if(!ti || !ti.an) return null;
        if(f.r.pat && linkCount(f.r.pat) > 1) unlinkRegion(f.r);
        return humApply(f.t, f.r, ti.an);
      });
    }

    // ---- "Hum a part" ----
    // o: track (id), bars (2, 4, 8; 0 = free: no click, until Stop), backing ("song" | "click"), at (tick)
    // Resolves when the recording has begun; the result arrives through o.done({ ok, region, notes, key, tempo, bleed, ... }).
    var HUM = null;
    function humStart(o){
      var t = trackById(o.track); if(!t || t.kind !== "inst") return Promise.reject(new Error("track"));
      var bt = barTicks(), free = !o.bars, at = o.at !== undefined ? o.at : Math.floor(TR.pos / bt) * bt;
      if(TR.playing) transportStop(true);
      return latLoad().then(micOpen).then(function(){
        var lat = latNow();
        HUM = { o:o, t:t.id, at:at, free:free, lat:lat, state:"count" };
        var count = free ? 0 : Math.max(1, S.countIn || 1), len = free ? 0 : o.bars * bt;
        recLevels({ music:o.backing === "song" ? (o.musicVol === undefined ? 0.5 : o.musicVol) : 1, click:o.clickVol });
        recBegin();
        var p;
        if(free){
          // nothing plays: only the microphone runs
          HUM.startAt = ENG.ctx.currentTime; HUM.state = "rec"; p = Promise.resolve(true);
        } else {
          p = transportPlay({ from:at, countIn:count, clickOnly:o.backing !== "song", stopAt:at + len, onStopAt:function(){ humFinish(); }, record:{ kind:"hum" } }).then(function(){ HUM.startAt = TR.startAt; HUM.count = count; return true; });
        }
        return p.then(function(){ emit("record", { kind:"hum", state:"count", track:t.id, at:at, bars:o.bars || 0 }); return true; });
      })["catch"](function(e){ HUM = null; micClose(); throw new Error(micWhy(e)); });
    }
    function humCancel(){
      if(!HUM) return;
      HUM = null; try { recEnd()["catch"](function(){}); } catch(e){} micClose(); transportStop();
      recLevels(null);
      emit("record", { kind:"hum", state:"cancelled" });
    }
    function humFinish(){
      if(!HUM || HUM.state === "done") return Promise.resolve(null);
      var H = HUM, o = H.o; H.state = "done";
      // let the last note ring into the microphone for a moment
      return new Promise(function(r){ setTimeout(r, H.free ? 60 : 260); }).then(recEnd).then(function(rec){
        var endTick = H.free ? 0 : H.at + o.bars * barTicks();
        micClose(); if(TR.playing) transportStop(true); TR.pos = H.at;
        recLevels(null);
        emit("record", { kind:"hum", state:"listening" });
        var t0rec = rec.frame0 / rec.sr, startIn = H.startAt - t0rec, bleedP = Promise.resolve(null);
        if(!H.free){
          // were the count's clicks audible in the microphone? Then the speakers are, and so is the song
          var times = [], k, pt = pulseTicks(), n = Math.round(H.count * barTicks() / pt);
          for(k = 0; k < n; k++) times.push(startIn - tickSec((n - k) * pt));
          bleedP = dspRun("clickDelay", [rec.x, rec.sr, times, clickBuf(ENG.ctx, false).getChannelData(0), 0.4])["catch"](function(){ return null; });
        }
        return bleedP.then(function(bl){
          var lat = H.lat.sec, bleed = !!(bl && bl.heard >= 2);
          // on speakers the count itself measures the round trip, which is exactly the number wanted
          if(bleed && !H.lat.measured){ lat = bl.delay; latStore(bl.delay); }
          // the clicks are known exactly, so what the microphone caught of them is taken out before listening for notes
          if(bleed){ try { clickCancel(rec.x, rec.sr, startIn, H, bl.delay); } catch(e3){ if(testMode) console.error(e3); } }
          return dspRun("analyse", [rec.x, rec.sr, { bleed:bleed && o.backing === "song" }]).then(function(an){
            return humLand(H, rec, an, lat, startIn, bleed);
          });
        });
      })["catch"](function(e){ HUM = null; emit("record", { kind:"hum", state:"failed" }); if(o.done) o.done({ ok:false, why:"The take could not be read." }); if(testMode) console.error(e); return null; });
    }
    function clickCancel(x, sr, startIn, H, delay){
      var bt = barTicks(), pt = pulseTicks(), sub = S.sig[1] === 8 && pt !== beatTicks() ? beatTicks() : pt, from = -H.count * bt, to = H.o.bars * bt, tick, hi = clickBuf(ENG.ctx, true).getChannelData(0), lo = clickBuf(ENG.ctx, false).getChannelData(0), n = 0;
      for(tick = from; tick < to; tick += sub){
        var c = tick % bt === 0 ? hi : lo, at = Math.round((startIn + tickSec(tick) + delay) * sr), best = 0, bk = 0, k, i, sxy, sxx = 0, L = c.length;
        if(at < 4 || at + L + 4 > x.length) continue;
        for(i = 0; i < L; i++) sxx += c[i] * c[i];
        for(k = -3; k <= 3; k++){ sxy = 0; for(i = 0; i < L; i++) sxy += x[at + k + i] * c[i]; if(Math.abs(sxy) > Math.abs(best)){ best = sxy; bk = k; } }
        var g = best / sxx; if(Math.abs(g) < 0.002) continue;
        for(i = 0; i < L; i++) x[at + bk + i] -= g * c[i];
        n++;
      }
      return n;
    }
    function humLand(H, rec, an, lat, startIn, bleed){
      var o = H.o, t = trackById(H.t), out = { ok:false, bleed:bleed, clipped:an.clipped, measured:H.lat.measured || bleed };
      HUM = null;
      if(!t){ if(o.done) o.done(out); return out; }
      if(!an.notes.length){
        out.why = an.quiet ? "Nothing was heard. Check that the right microphone is chosen and that it is not muted, then try again."
          : "No notes were found in that. Hum or sing “da da da” a little louder and closer to the microphone.";
        emit("record", { kind:"hum", state:"empty" }); if(o.done) o.done(out); return out;
      }
      var bt = barTicks(), origin = startIn + lat, len = H.free ? 0 : o.bars * bt, at = H.at, sugT = null;
      if(H.free){
        // no click was running: start at her first note; if a pulse can be heard in it, offer the tempo
        origin = Math.max(0, an.notes[0].t - 0.02);
        sugT = dsp().suggestTempo(an.notes);
        var endS = an.notes[an.notes.length - 1].t + an.notes[an.notes.length - 1].d - origin;
        len = Math.max(bt, Math.ceil((secTick(endS) - PPQ / 4) / bt) * bt);   // a last note held a little over the bar line does not add a bar
      } else {
        // a pick-up: notes sung in the last beat before the bar belong to the part; it then starts a bar earlier
        var early = an.notes.filter(function(n){ return n.t < origin - tickSec(PPQ / 8) && n.t > origin - tickSec(bt); });
        if(early.length && at >= bt && early[0].t > startIn - tickSec(barTicks()) + 0.05){ at -= bt; len += bt; origin -= tickSec(bt); }
      }
      return takeSave(rec.x, rec.sr, { an:slimAn(an), name:"Hummed part", lat:lat, kind:"hum" }).then(function(takeId){
        var r = { id:uid("r"), s:at, l:len, pat:newPat(len, []), off:0, name:"Hummed",
                  hum:{ take:takeId, timing:"tidy", pitch:"semi", octave:0, origin:origin, grid:0, edited:false } };
        t.regions.push(r); clearUnder(t, r); sortRegions(t); growBars();
        var res = humApply(t, r, an);
        var keyS = (S.key.root === null || S.key.scale === "none") ? dsp().suggestKey(an.notes) : null;
        commit("hum a part");
        out.ok = true; out.region = r.id; out.notes = res.notes.length; out.early = res.early; out.grid = res.grid; out.octave = res.octave;
        out.key = keyS && keyS.r > 0.55 ? keyS : null; out.tempo = sugT; out.free = H.free; out.take = takeId;
        emit("record", { kind:"hum", state:"done", region:r.id, notes:out.notes });
        if(o.done) o.done(out);
        return out;
      });
    }
    // after a free take: set the song's tempo to her pulse and put bar 1 on her first beat
    function humUseTempo(regionId, sug){
      var f = findRegion(regionId); if(!f || !f.r.hum || !sug) return Promise.resolve(false);
      setTempo(sug.bpm); f.r.hum.origin = sug.origin; f.r.hum.timing = "tidy";
      return takeInfo(f.r.hum.take).then(function(ti){
        if(!ti || !ti.an) return false;
        var last = ti.an.notes[ti.an.notes.length - 1], bt = barTicks();
        f.r.l = Math.max(bt, Math.ceil((secTick(last.t + last.d - sug.origin) - PPQ / 4) / bt) * bt); patOf(f.r).len = f.r.l;
        humApply(f.t, f.r, ti.an); clearUnder(f.t, f.r); growBars();
        commit("set the tempo from the humming"); return true;
      });
    }

    // ---- hear the take, the notes, or both ----
    var audition = null;
    function humHear(regionId, mode){
      // mode: "voice" | "notes" | "both"
      var f = findRegion(regionId); if(!f) return Promise.resolve(false);
      auditionStop();
      return ensureEngine().then(function(){ return resume(); }).then(function(){ return f.r.hum ? takeInfo(f.r.hum.take) : null; }).then(function(){
        var ctx = ENG.ctx, G = ENG.G, r = f.r, t0 = frameTime(ctx, ctx.currentTime + 0.08), dur = tickSec(r.l);
        try { if(playing) stop(); } catch(e){} try { if(typeof DJ !== "undefined" && DJ) DJ._seqStart(); } catch(e2){}
        transportStop(true);
        audition = { nodes:[], region:r.id, t0:t0, end:t0 + dur, mode:mode };
        if(mode !== "notes" && r.hum && audioBufs[r.hum.take]){
          var src = ctx.createBufferSource(), g = ctx.createGain(); src.buffer = audioBufs[r.hum.take]; g.gain.value = mode === "both" ? 0.8 : 1;
          src.connect(g); g.connect(G.sum);
          var off = r.hum.origin; if(off >= 0) src.start(t0, off, dur); else src.start(t0 - off, 0, dur + off);
          audition.nodes.push(src);
        }
        if(mode !== "voice"){
          var keep = G.voices.length;
          eachNote(r, r.s, r.s + r.l, function(s, l, p, v){ playNote(G, f.t, p, v, t0 + tickSec(warp(s) - r.s), tickSec(l)); });
          void keep;
        }
        audition.timer = setTimeout(function(){ auditionStop(); }, (dur + 0.3) * 1000);
        emit("audition", { on:true, region:r.id, mode:mode });
        if(typeof playheadLoop === "function") playheadLoop();
        return true;
      });
    }
    function auditionStop(){
      if(!audition) return;
      clearTimeout(audition.timer);
      audition.nodes.forEach(function(n){ try { n.stop(); } catch(e){} });
      if(ENG.G) silence(ENG.G);
      audition = null; emit("audition", { on:false });
    }
    function auditionTick(){
      if(!audition) return null;
      var f = findRegion(audition.region); if(!f) return null;
      var lat = ENG.ctx.outputLatency || ENG.ctx.baseLatency || 0;
      return f.r.s + secTick(Math.max(0, ENG.ctx.currentTime - lat - audition.t0));
    }

    // ---- recording a voice on an audio track ----
    var AREC = null;
    function audioRecStart(trackId, o){
      o = o || {};
      var t = trackById(trackId); if(!t || t.kind !== "audio") return Promise.reject(new Error("track"));
      var bt = barTicks(), at = o.at !== undefined ? o.at : Math.floor(TR.pos / bt) * bt;
      if(TR.playing) transportStop(true);
      return latLoad().then(micOpen).then(function(){
        AREC = { t:trackId, at:at, lat:latNow() };
        recLevels({ music:o.musicVol === undefined ? 1 : o.musicVol, click:o.clickVol });
        // a phone has room for a take of some minutes, not for an hour left running
        if(MOB.lean){ MIC.cap = Math.round(ENG.ctx.sampleRate * (TEST.takeCap || 480)); MIC.onCap = function(){ tell("That is as long as one take can be on a phone: eight minutes. It was stopped and kept."); if(REC_UI) REC_UI.stop(); else audioRecStop(); }; }
        recBegin();
        return transportPlay({ from:at, countIn:S.countIn || 0, record:{ kind:"audio" } }).then(function(){ AREC.startAt = TR.startAt; emit("record", { kind:"audio", state:"count", track:trackId, at:at }); return true; });
      })["catch"](function(e){ AREC = null; micClose(); throw new Error(micWhy(e)); });
    }
    function audioRecStop(){
      if(!AREC) return Promise.resolve(null);
      var A = AREC; AREC = null;
      var endTick = Math.max(A.at + PPQ, transportTick());
      return new Promise(function(r){ setTimeout(r, 120); }).then(recEnd).then(function(rec){
        var t = trackById(A.t); micClose(); transportStop(true); TR.pos = A.at; refreshPlayhead(); recLevels(null);
        var startIn = A.startAt - rec.frame0 / rec.sr + A.lat.sec;
        if(!t || rec.x.length < rec.sr * 0.3 || startIn >= rec.x.length / rec.sr){ emit("record", { kind:"audio", state:"empty" }); return null; }
        return takeSave(rec.x, rec.sr, { name:"Take", lat:A.lat.sec, kind:"audio" }).then(function(id){
          var same = t.regions.filter(function(r){ return r.s === A.at; })[0], r;
          var len = Math.max(PPQ, Math.round(Math.min(endTick - A.at, secTick(rec.x.length / rec.sr - startIn))));
          if(same){
            // another take of the same place: it becomes the one that plays, the others are kept
            same.takes.push(id); same.act = same.takes.length - 1; same.off = startIn; same.l = Math.max(same.l, len); r = same;
          } else {
            r = { id:uid("r"), s:A.at, l:len, takes:[id], act:0, off:Math.max(0, startIn), fi:0, fo:0, gain:0 };
            t.regions.push(r); clearUnder(t, r); sortRegions(t);
          }
          growBars(); commit("record a take");
          emit("record", { kind:"audio", state:"done", region:r.id, take:id, quiet:rec.peak < 0.02, clipped:rec.peak > 0.985 });
          return r;
        });
      });
    }
    // an audio file dropped in or chosen: becomes a take at the playhead
    function audioImport(trackId, file){
      var t = trackById(trackId); if(!t || t.kind !== "audio") return Promise.resolve(null);
      return ensureEngine().then(function(){ return fileBuf(file); }).then(decode).then(function(buf){
        var n = buf.length, x = new Float32Array(n), c, i;
        for(c = 0; c < buf.numberOfChannels; c++){ var d = buf.getChannelData(c); for(i = 0; i < n; i++) x[i] += d[i] / buf.numberOfChannels; }
        if(n > buf.sampleRate * 600) throw new Error("long");
        return takeSave(x, buf.sampleRate, { name:String(file.name || "Sound").replace(/\.[^.]+$/, "").slice(0, 32), kind:"audio" }).then(function(id){
          var bt = barTicks(), at = Math.floor(TR.pos / bt) * bt, r = { id:uid("r"), s:at, l:Math.max(PPQ, Math.round(secTick(n / buf.sampleRate))), takes:[id], act:0, off:0, fi:0, fo:0, gain:0 };
          t.regions.push(r); clearUnder(t, r); sortRegions(t); growBars(); commit("bring in a sound file");
          return r;
        });
      });
    }
    // "Turn this take into notes": the same listening, on a recording that is already there
    function takeToNotes(regionId, toTrack){
      var f = findRegion(regionId); if(!f || f.t.kind !== "audio") return Promise.resolve(null);
      var id = f.r.takes[f.r.act];
      return takeInfo(id).then(function(ti){ return ti && ti.an ? ti.an : takeAnalyse(id, {}); }).then(function(an){
        if(!an || !an.notes.length) return { ok:false, why:"No notes were found in that take." };
        var t = toTrack ? trackById(toTrack) : null;
        if(!t){ t = addTrack("inst", "basic:piano", "From " + f.t.name); if(!t) return { ok:false, why:"There is no room for another track." }; }
        var r = { id:uid("r"), s:f.r.s, l:f.r.l, pat:newPat(f.r.l, []), off:0, name:"From a take", hum:{ take:id, timing:"tidy", pitch:"semi", octave:0, origin:f.r.off || 0, grid:0, edited:false } };
        t.regions.push(r); clearUnder(t, r); sortRegions(t);
        var res = humApply(t, r, an);
        commit("turn a take into notes");
        return { ok:true, region:r.id, track:t.id, notes:res.notes.length, key:(S.key.root === null || S.key.scale === "none") ? dsp().suggestKey(an.notes) : null };
      });
    }

    // ---- playing notes in by hand (keys on screen, computer keyboard, MIDI keyboard), with or without recording ----
    var NREC = null;
    function noteRecStart(trackId, o){
      o = o || {};
      var t = trackById(trackId); if(!t || t.kind === "audio") return Promise.reject(new Error("track"));
      var bt = barTicks(), at = o.at !== undefined ? o.at : Math.floor(TR.pos / bt) * bt;
      NREC = { t:trackId, at:at, notes:[], held:{}, snap:o.snap || 0 };
      return transportPlay({ from:at, countIn:o.countIn === undefined ? (S.countIn || 0) : o.countIn, record:{ kind:"notes" } }).then(function(){ emit("record", { kind:"notes", state:"count", track:trackId, at:at }); return true; });
    }
    function noteRecEvent(on, pitch, vel){
      if(!NREC || !TR.playing) return;
      var tick = transportTick();
      if(on){ if(tick < NREC.at - PPQ / 4) return; NREC.held[pitch] = { s:Math.max(NREC.at, tick), v:vel }; }
      else {
        var h = NREC.held[pitch]; if(!h) return; delete NREC.held[pitch];
        var l = tick - h.s; if(l < 0) l = S.loop.on ? S.loop.b - h.s : PPQ / 4;      // the loop came round while it was held
        NREC.notes.push({ s:h.s, l:Math.max(PPQ / 16, l), p:pitch, v:h.v });
      }
    }
    function noteRecStop(){
      if(!NREC) return null;
      var N = NREC, t = trackById(N.t), end = transportTick(), bt = barTicks(); NREC = null;
      Object.keys(N.held).forEach(function(p){ var h = N.held[p]; N.notes.push({ s:h.s, l:Math.max(PPQ / 16, end - h.s), p:+p, v:h.v }); });
      transportStop(true); TR.pos = N.at; refreshPlayhead();
      if(!t || !N.notes.length){ emit("record", { kind:"notes", state:"empty" }); return null; }
      var drums = t.kind === "drums", g = N.snap;
      N.notes.forEach(function(n){ if(g){ n.s = Math.round(n.s / g) * g; } n.s = Math.round(n.s); n.l = drums ? PPQ / 4 : Math.round(n.l); });
      var first = Math.min.apply(null, N.notes.map(function(n){ return n.s; })), last = Math.max.apply(null, N.notes.map(function(n){ return n.s + n.l; }));
      // into the region that is there (overdub), or a new one
      var r = t.regions.filter(function(x){ return x.s <= first && x.s + x.l > first; })[0];
      if(!r){
        var a = Math.floor(first / bt) * bt, b = Math.max(a + bt, Math.ceil(last / bt) * bt), nx = t.regions.filter(function(x){ return x.s >= a; })[0];
        if(nx && nx.s < b) b = Math.max(a + bt, nx.s);
        r = addRegion(t, a, b - a, []);
      } else if(linkCount(r.pat) > 1) unlinkRegion(r);
      var p = patOf(r);
      if(p.len < r.l){ p.notes = flatNotes(r); p.len = r.l; r.off = 0; }
      N.notes.forEach(function(n){ var s = n.s - r.s; if(s < 0 || s >= r.l) return; p.notes.push({ s:s, l:Math.min(n.l, r.l - s), p:n.p, v:n.v }); });
      sortNotes(p); if(r.hum) r.hum.edited = true; delete r.gen;
      commit(drums ? "tap a rhythm" : "play notes in");
      emit("record", { kind:"notes", state:"done", region:r.id, notes:N.notes.length });
      return r;
    }
    function stopAnyRecording(){
      if(HUM){ if(HUM.free || HUM.state === "rec" || HUM.state === "count") return humFinish(); }
      if(AREC) return audioRecStop();
      if(NREC) return Promise.resolve(noteRecStop());
      return Promise.resolve(null);
    }
    function recordingNow(){ return HUM ? "hum" : AREC ? "audio" : NREC ? "notes" : ""; }
