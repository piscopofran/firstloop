    // ---------- Studio: what a phone or a tablet does differently underneath ----------
    // Each of these is something a desktop browser does not do to a page, and each is handled where it happens:
    //   - sound starts only inside a tap, and the system can take it away again (a call, Siri, the lock screen): audioUnlock,
    //     ctxWatch, the "Tap to resume sound" bar, engRebuild when the old context will not come back;
    //   - an iPhone's silent switch mutes Web Audio: the audio session is asked for "playback", and where that cannot be
    //     asked for, a looping <audio> element of pure silence is kept playing, which has the same effect (keeper*);
    //   - the phone's own speaker sits beside its microphone, and a Bluetooth headset records in call quality and late:
    //     routeDetect, hpState, and the levels a recording plays the click and the song at;
    //   - the screen sleeps, the keyboard covers the page, storage can be cleared: wakeSet, vvApply, storage*.
    var PREF_KEY = "firstloop.studio.phone", PREF = {};
    try { PREF = JSON.parse(window.localStorage.getItem(PREF_KEY) || "{}") || {}; } catch(e){ PREF = {}; }
    function prefSet(k, v){ PREF[k] = v; try { window.localStorage.setItem(PREF_KEY, JSON.stringify(PREF)); } catch(e){} }

    // ---- sound needs a tap, and can be taken away ----
    var UNL = { done:false, banner:false, rebuild:false, keeper:null, keeperOn:false, session:"", hiddenAt:0, tries:0 };
    function ctxWatch(ctx){ try { ctx.onstatechange = function(){ if(ctx === ENG.ctx) ctxChanged(); }; } catch(e){} }
    function ctxChanged(){
      var st = ENG.ctx.state;
      emit("audiostate", { state:st });
      if(st === "running"){ UNL.banner = false; UNL.rebuild = false; UNL.tries = 0; resumePaint(); return; }
      if(st === "closed" || !UNL.done) return;
      // suspended, or "interrupted" on an iPhone: whatever was sounding has stopped, so the screen says so
      soundLost();
    }
    function soundLost(){
      if(recordingNow()){
        tell("Sound was interrupted (a call, or another app). What was recorded so far is kept.");
        if(HUM && !HUM.free && HUM.state !== "done"){ humCancel(); if(typeof recStripEnd === "function") recStripEnd(); if(typeof phCapEnd === "function") phCapEnd(); }
        else if(REC_UI) REC_UI.stop(); else stopAnyRecording();
      } else if(TR.playing) transportStop(false, true);
      auditionStop();
      UNL.banner = true; resumePaint();
    }
    // called inside every tap on a touch device: the only moment a phone lets a page start or restart its sound
    function audioUnlock(){
      if(!S || !UI.built || document.body.dataset.view !== "studio") return;
      if(UNL.rebuild){ UNL.rebuild = false; engRebuild(); }
      ensureEngine();                       // makes the context now, inside the tap
      var ctx = ENG.ctx; if(!ctx) return;
      if(ctx.state !== "running"){ try { var p = ctx.resume(); if(p && p["catch"]) p["catch"](function(){}); } catch(e){} }
      if(!UNL.done){
        UNL.done = true;
        try { var s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate); s.connect(ctx.destination); s.start(0); } catch(e2){}
      }
      keeperStart();
    }
    function resumeTap(){
      // the bar was tapped: bring the sound back; if the old context will not come, the next tap makes a new one
      audioUnlock();
      var ctx = ENG.ctx; UNL.tries++;
      setTimeout(function(){
        if(!ENG.ctx || ENG.ctx.state === "running"){ UNL.banner = false; resumePaint(); return; }
        if(ctx === ENG.ctx){ UNL.rebuild = true; resumePaint(); }
      }, 900);
    }
    function resumePaint(){
      if(!UI.built) return;
      var E = UI.e;
      if(!E.resume){
        E.resume = btn("st-resume", "", "", resumeTap); E.resume.id = "stresume"; E.resume.hidden = true;
        E.resume.appendChild(ico("play")); E.resumeText = el("span", "", ""); E.resume.appendChild(E.resumeText);
        UI.root.appendChild(E.resume);
      }
      E.resume.hidden = !UNL.banner;
      E.resumeText.textContent = UNL.rebuild ? "Sound did not come back. Tap once more." : "Sound is paused. Tap to resume sound.";
      UI.root.dataset.paused = UNL.banner ? "true" : "false";
    }
    // a new context in place of one that would not resume, or whose rate no longer matches the device. Buffers that were
    // loaded stay: a buffer is not tied to the context that made it, and is played at its own rate.
    function engRebuild(){
      var old = ENG.ctx; if(!old) return ensureEngine();
      if(TR.playing) transportStop(true, true);
      auditionStop(); micClose(); liveVoices = {};
      try { old.onstatechange = null; old.close()["catch"](function(){}); } catch(e){}
      ENG.ctx = null; ENG.G = null; ENG.ready = null; ENG._click0 = ENG._click1 = null; ENG.rebuilt = (ENG.rebuilt || 0) + 1;
      keeperDrop();
      return ensureEngine().then(function(ok){ refresh(true); return ok; });
    }
    function visChanged(){
      if(!UI.built || !MOB.touch) return;
      if(document.hidden){
        UNL.hiddenAt = Date.now();
        // a phone stops a page's sound and its microphone when the page is put away; better to stop cleanly than to be cut
        if(document.body.dataset.view === "studio"){
          if(recordingNow()){ if(HUM && !HUM.free && HUM.state !== "done"){ humCancel(); if(typeof recStripEnd === "function") recStripEnd(); if(typeof phCapEnd === "function") phCapEnd(); } else if(REC_UI) REC_UI.stop(); else stopAnyRecording(); }
          else if(TR.playing) transportStop(false, true);
          auditionStop();
          if(S && saveTimer) saveNowS();
        }
        keeperPause();
        return;
      }
      if(WAKE.want) wakeSet(true);
      var ctx = ENG.ctx; if(!ctx || !UNL.done || document.body.dataset.view !== "studio") return;
      var away = Date.now() - UNL.hiddenAt;
      // an iPhone can come back saying "running" and play nothing: stopping and starting the context wakes it
      var p = MOB.ios && away > 1000 && ctx.state === "running" && ctx.suspend ? ctx.suspend()["catch"](function(){}) : Promise.resolve();
      p.then(function(){ try { return ctx.resume(); } catch(e){ return null; } })["catch"](function(){}).then(function(){
        setTimeout(function(){ if(ctx === ENG.ctx && ctx.state !== "running" && !document.hidden){ UNL.banner = true; resumePaint(); } }, 700);
      });
    }

    // ---- the silent switch (iPhone, iPad) ----
    // Web Audio counts as a "sound effect" there and is muted by the switch on the side. Telling the system this is
    // playback lifts that: by navigator.audioSession where it exists (iOS 16.4 on), and by a media element that plays,
    // which is what moves the session on every version. The element plays one second of zeros, looped: it cannot be
    // heard. It is paused while the microphone is open, when the session is "play and record" and the switch does not
    // apply, so it cannot get in the way of a recording.
    function sessionSet(type){
      try { if(navigator.audioSession && navigator.audioSession.type !== type){ navigator.audioSession.type = type; UNL.session = type; } } catch(e){}
    }
    function keeperStart(){
      if(!MOB.ios || MIC.stream || MIC.pending) return;
      sessionSet("playback");
      if(!UNL.keeper){
        try {
          var a = document.createElement("audio"), sr = ENG.ctx ? ENG.ctx.sampleRate : 44100;
          a.setAttribute("playsinline", ""); a.setAttribute("webkit-playsinline", ""); a.setAttribute("x-webkit-airplay", "deny"); a.setAttribute("aria-hidden", "true");
          a.loop = true; a.preload = "auto"; a.controls = false; try { a.disableRemotePlayback = true; } catch(e0){}
          UNL.keeperUrl = URL.createObjectURL(new Blob([wavBytes([new Float32Array(Math.round(sr))], sr, 16)], { type:"audio/wav" }));
          a.src = UNL.keeperUrl; UNL.keeper = a;
        } catch(e){ UNL.keeper = null; return; }
      }
      if(UNL.keeperOn && !UNL.keeper.paused) return;
      try { var p = UNL.keeper.play(); if(p && p.then) p.then(function(){ UNL.keeperOn = true; }, function(){ UNL.keeperOn = false; }); else UNL.keeperOn = true; } catch(e2){ UNL.keeperOn = false; }
    }
    function keeperPause(){ if(UNL.keeper){ try { UNL.keeper.pause(); } catch(e){} } UNL.keeperOn = false; }
    function keeperDrop(){ keeperPause(); if(UNL.keeper){ try { UNL.keeper.removeAttribute("src"); UNL.keeper.load(); URL.revokeObjectURL(UNL.keeperUrl); } catch(e){} UNL.keeper = null; } }
    function micBefore(){ MIC.pending = true; keeperPause(); if(MOB.ios) sessionSet("play-and-record"); }
    function micAfter(){ MIC.pending = false; if(MOB.ios){ sessionSet("playback"); if(UNL.done && !document.hidden && document.body.dataset.view === "studio") keeperStart(); } routeDetect(); }
    function micLost(){
      if(!recordingNow()) return;
      tell("The microphone was taken by something else (a call, or another app). What was recorded so far is kept.");
      if(REC_UI) REC_UI.stop(); else stopAnyRecording();
    }
    function silentTip(){
      // once, before the first sound on an iPhone
      if(!MOB.ios || PREF.silentTip) return false;
      prefSet("silentTip", 1);
      tell("If you hear nothing, check the silent switch on the side of the phone, and the volume.");
      return true;
    }

    // ---- the screen stays on while something plays or records ----
    var WAKE = { lock:null, want:false };
    function wakeSet(on){
      WAKE.want = !!on;
      if(!MOB.touch || !navigator.wakeLock || !navigator.wakeLock.request) return;
      if(on && !WAKE.lock && !WAKE.asking && !document.hidden){
        WAKE.asking = true;
        try {
          navigator.wakeLock.request("screen").then(function(l){
            WAKE.asking = false; WAKE.lock = l;
            try { l.addEventListener("release", function(){ if(WAKE.lock === l) WAKE.lock = null; }); } catch(e){}
            if(!WAKE.want) wakeSet(false);
          }, function(){ WAKE.asking = false; });
        } catch(e2){ WAKE.asking = false; }
      } else if(!on && WAKE.lock){ var l0 = WAKE.lock; WAKE.lock = null; try { l0.release()["catch"](function(){}); } catch(e3){} }
    }
    function wakeSync(){ wakeSet(!!(TR.playing || audition || recordingNow())); }

    // ---- headphones ----
    // What is plugged in can only be read from the names the browser gives its inputs and outputs, and those are there
    // only once the microphone has been allowed. Where they say nothing, she is asked once and the answer is kept.
    var HP = { auto:"", label:"", labels:"", low:false };
    function routeDetect(){
      var md = navigator.mediaDevices;
      if(TEST.route){ HP.auto = TEST.route.auto || ""; HP.label = TEST.route.label || ""; HP.low = !!TEST.route.low; emit("route", HP); return Promise.resolve(HP); }
      if(!md || !md.enumerateDevices) return Promise.resolve(HP);
      return md.enumerateDevices().then(function(list){
        var names = [], cur = MIC.label || "";
        list.forEach(function(d){ if((d.kind === "audioinput" || d.kind === "audiooutput") && d.label) names.push(d.label); });
        HP.labels = names.join(" | ").slice(0, 300);
        var BT = /bluetooth|airpods|hands-?free|\bbuds\b|\bbeats\b/i, WIRED = /wired head|headset microphone|headphone|earpods|usb audio|usb-c|external mic/i;
        var bt = names.filter(function(n){ return BT.test(n); })[0], wired = names.filter(function(n){ return WIRED.test(n) && !/earpiece/i.test(n); })[0];
        // the microphone in use decides between them when both are there
        if(bt && (BT.test(cur) || !wired)){ HP.auto = "bt"; HP.label = bt; }
        else if(wired){ HP.auto = "wired"; HP.label = wired; }
        else { HP.auto = ""; HP.label = ""; }
        // a headset microphone on Bluetooth runs at call quality: 8 or 16 kHz (the whole context drops to that on an iPhone)
        var rate = MIC.settings && MIC.settings.sampleRate ? MIC.settings.sampleRate : 0;
        HP.low = !!((rate && rate <= 24000) || (ENG.ctx && ENG.ctx.sampleRate <= 24000));
        if(HP.low && !HP.auto && MOB.handheld){ HP.auto = "bt"; HP.label = cur || "Headset"; }
        emit("route", HP);
        return HP;
      }, function(){ return HP; });
    }
    // "wired" | "bt" | "no" | "" (not known yet: ask)
    function hpState(){ return HP.auto || PREF.hp || ""; }
    function hpSet(v){ prefSet("hp", v); emit("route", HP); }
    // how a recording plays the click and the song, given what she listens on
    function recPlan(kind, backing){
      var hp = hpState(), speaker = MOB.handheld && hp !== "wired" && hp !== "bt";
      if(!MOB.handheld) return { clickVol:1, musicVol:kind === "hum" ? 0.5 : 1, backing:backing, speaker:false, hp:hp };
      // on the phone's own speaker: the click plays quietly (it is taken out of the recording afterwards) and the song
      // stays silent under a hummed part, because the notes it would add cannot be told from hers
      if(kind === "hum") return { clickVol:speaker ? 0.3 : 1, musicVol:0.5, backing:speaker ? "click" : backing, speaker:speaker, hp:hp };
      return { clickVol:speaker ? 0.3 : 1, musicVol:speaker ? 0.3 : 1, backing:"song", speaker:speaker, hp:hp };
    }
    try { if(navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener("devicechange", function(){ if(UI.built && MOB.touch) routeDetect(); }); } catch(e){}

    // ---- storage ----
    // A phone clears what a site has stored if the site is not opened for a while (an iPhone after some weeks), and gives
    // it less room. So: ask for the storage to be kept, show how much is used, and say when a song exists only here.
    var STO = { asked:false, persisted:null, used:null, quota:null, copies:null };
    function storagePersist(){
      var st = navigator.storage;
      if(STO.asked || !MOB.handheld || !st || !st.persist) return Promise.resolve(STO.persisted);
      STO.asked = true;
      try { return st.persist().then(function(ok){ STO.persisted = !!ok; return STO.persisted; }, function(){ return null; }); } catch(e){ return Promise.resolve(null); }
    }
    function storageInfo(){
      var st = navigator.storage, jobs = [];
      if(!st) return Promise.resolve(STO);
      try { if(st.estimate) jobs.push(st.estimate().then(function(e){ STO.used = e && typeof e.usage === "number" ? e.usage : null; STO.quota = e && typeof e.quota === "number" ? e.quota : null; }, function(){})); } catch(e1){}
      try { if(st.persisted) jobs.push(st.persisted().then(function(ok){ STO.persisted = !!ok; }, function(){})); } catch(e2){}
      return Promise.all(jobs).then(function(){ return STO; });
    }
    function copiesLoad(){ return STO.copies ? Promise.resolve(STO.copies) : dbGet("kv", "copies").then(function(m){ STO.copies = m && typeof m === "object" ? m : {}; return STO.copies; }); }
    // work worth keeping was done ("take": a recording; "edit": a change): the song is marked as not copied yet
    function storageNote(what){
      if(!S || !MOB.handheld) return;
      storagePersist();
      copiesLoad().then(function(m){
        var c = m[S.id] || (m[S.id] = { t:0, n:0, takes:0 });
        if(what === "take") c.takes = (c.takes || 0) + 1; else c.n = (c.n || 0) + 1;
        clearTimeout(STO.timer); STO.timer = setTimeout(function(){ dbPut("kv", m, "copies")["catch"](function(){}); }, 1500);
        if(what === "take") emit("copydue", {});
      });
    }
    function copyMark(){
      if(!S) return;
      copiesLoad().then(function(m){ m[S.id] = { t:Date.now(), n:0, takes:0 }; dbPut("kv", m, "copies")["catch"](function(){}); emit("copydue", {}); });
    }
    // does this song hold work that exists only on this device
    function copyDue(){
      var c = STO.copies && S ? STO.copies[S.id] : null;
      return !!(c && ((c.takes || 0) >= 1 || (c.n || 0) >= 25));
    }

    // ---- handing a file to another app (the share sheet), or saving it ----
    function shareFile(blob, name){
      try { var f = new File([blob], name, { type:blob.type || "application/octet-stream" }); return navigator.canShare && navigator.share && navigator.canShare({ files:[f] }) ? f : null; } catch(e){ return null; }
    }
    // inside a tap. Resolves "shared", "cancelled" or "saved" (handed to the browser as a download).
    function shareOrSave(blob, name, title, alt){
      var f = shareFile(blob, name);
      // Android's share sheet takes only the kinds of file it knows: a song file goes as text there
      if(!f && alt) f = shareFile(new Blob([blob], { type:alt.type }), alt.name);
      if(f){
        return navigator.share({ files:[f], title:title || name }).then(function(){ return "shared"; }, function(e){
          if(e && e.name === "AbortError") return "cancelled";
          return offerFile(blob, name).then(function(){ return "saved"; });
        });
      }
      return offerFile(blob, name).then(function(){ return "saved"; });
    }

    // ---- the keyboard on the screen ----
    // The page's own height does not change when the keyboard comes up on an iPhone: the part that can be seen does. The
    // phone layout, its sheets and the Assistant are sized by these two numbers, so an input is never under the keyboard.
    function vvApply(){
      var vv = window.visualViewport, de = document.documentElement, h = vv && vv.height ? vv.height : window.innerHeight, top = vv && vv.offsetTop ? vv.offsetTop : 0;
      de.style.setProperty("--st-vvh", Math.round(h) + "px"); de.style.setProperty("--st-vvt", Math.round(top) + "px");
      var kb = !!(vv && window.innerHeight - vv.height > 120);
      if(de.dataset.stkb !== (kb ? "open" : "closed")){ de.dataset.stkb = kb ? "open" : "closed"; emit("keyboard", { open:kb }); }
      // what is being typed into stays in sight
      var a = document.activeElement;
      if(kb && a && /^(INPUT|TEXTAREA)$/.test(a.tagName) && a.closest && a.closest("#studio, .st-sheet, #assistant")){
        clearTimeout(vvApply.t); vvApply.t = setTimeout(function(){ try { var r = a.getBoundingClientRect(); if(r.bottom > top + h - 8 || r.top < top + 8) a.scrollIntoView({ block:"center" }); } catch(e){} }, 60);
      }
    }
    function vvWatch(){
      if(vvWatch.on) return; vvWatch.on = true;
      try { if(window.visualViewport){ window.visualViewport.addEventListener("resize", vvApply); window.visualViewport.addEventListener("scroll", vvApply); } } catch(e){}
      window.addEventListener("resize", vvApply); window.addEventListener("orientationchange", function(){ setTimeout(vvApply, 250); });
      document.addEventListener("focusin", function(){ setTimeout(vvApply, 300); });
      vvApply();
    }

    // ---- on the Home Screen like an app ----
    // The site is one file, so the icon and the manifest are made here when the Studio opens on a phone and put in the
    // page's head; no service worker is used (one that kept an old index.html would do more harm than its absence).
    var INST = { done:false, prompt:null };
    function appIcon(size){
      var c = document.createElement("canvas"), x = c.getContext("2d"), col = colors(), u = size / 64;
      c.width = c.height = size;
      x.fillStyle = "#141414"; x.fillRect(0, 0, size, size);
      x.lineCap = "round"; x.lineWidth = 7 * u; x.strokeStyle = col.accent || "#f59a23";
      x.beginPath(); x.arc(32 * u, 32 * u, 17 * u, Math.PI * 0.18, Math.PI * 1.82); x.stroke();
      x.fillStyle = "#f2f2ee"; x.beginPath(); x.arc(49 * u, 32 * u, 5 * u, 0, Math.PI * 2); x.fill();
      return c.toDataURL("image/png");
    }
    function installTags(){
      if(INST.done || !MOB.handheld) return; INST.done = true;
      try {
        var head = document.head, here = window.location.origin + window.location.pathname;
        var tag = function(name, attrs){ var n = document.createElement(name); Object.keys(attrs).forEach(function(k){ n.setAttribute(k, attrs[k]); }); head.appendChild(n); return n; };
        if(!head.querySelector('link[rel="apple-touch-icon"]')) tag("link", { rel:"apple-touch-icon", href:appIcon(180) });
        if(!head.querySelector('meta[name="apple-mobile-web-app-capable"]')){
          tag("meta", { name:"apple-mobile-web-app-capable", content:"yes" }); tag("meta", { name:"mobile-web-app-capable", content:"yes" });
          tag("meta", { name:"apple-mobile-web-app-title", content:"First Loop" }); tag("meta", { name:"apple-mobile-web-app-status-bar-style", content:"black" });
        }
        if(!head.querySelector('link[rel="manifest"]')){
          var man = { name:"First Loop", short_name:"First Loop", start_url:here + "#write", scope:here.replace(/[^\/]*$/, ""), display:"standalone", background_color:"#141414", theme_color:"#141414",
                      icons:[{ src:appIcon(192), sizes:"192x192", type:"image/png", purpose:"any" }, { src:appIcon(512), sizes:"512x512", type:"image/png", purpose:"any" }] };
          tag("link", { rel:"manifest", href:"data:application/manifest+json;charset=utf-8," + encodeURIComponent(JSON.stringify(man)) });
        }
      } catch(e){}
    }
    function isStandalone(){ try { return !!(window.navigator.standalone || window.matchMedia("(display-mode: standalone)").matches); } catch(e){ return false; } }
    try { window.addEventListener("beforeinstallprompt", function(e){ if(!MOB.handheld) return; e.preventDefault(); INST.prompt = e; emit("install", {}); }); } catch(e){}

    // ---- wiring (once, when the screen is built) ----
    function mobileInit(){
      if(mobileInit.done) return; mobileInit.done = true;
      on("transport", wakeSync); on("record", wakeSync); on("audition", wakeSync);
      if(!MOB.touch) return;
      ["pointerup", "touchend", "click", "keydown"].forEach(function(tp){
        document.addEventListener(tp, function(e){ if(document.body.dataset.view === "studio" && (!e.target || !e.target.closest || !e.target.closest(".dock"))) audioUnlock(); }, true);
      });
      document.addEventListener("visibilitychange", visChanged);
      window.addEventListener("pagehide", function(){ if(S && saveTimer) saveNowS(); });
      vvWatch(); installTags(); copiesLoad();
      on("change", function(d){ if(d && d.what !== "undo" && d.what !== "redo") storageNote("edit"); });
    }
