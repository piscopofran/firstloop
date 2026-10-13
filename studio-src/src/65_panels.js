    // ---------- Studio: sheets and menus (instruments, humming, recording, songs, key, export, help, lyrics) ----------
    function fmtBytes(n){ return n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
    function count(name, n){ try { useCount(name, n); saveLog(); } catch(e){} }
    function line(cls, text){ return el("p", cls, text); }
    function anyHum(){ return S.tracks.some(function(t){ return t.regions.some(function(r){ return !!r.hum; }); }); }
    function hasNotes(t){ return t.regions.some(function(r){ var p = patOf(r); return p && p.notes.length > 0; }); }

    // ---- instruments ----
    // a short phrase per family, in beats at 100 BPM: [beat, length, semitones above the phrase's home note (or a list of them), velocity]
    var AUD = {
      bass:[[0, 1, 0, 100], [1, 0.5, 0, 84], [1.5, 0.5, 7, 88], [2, 1, 12, 96], [3, 0.5, 10, 84], [3.5, 0.5, 7, 84], [4, 2, 5, 96]],
      keys:[[0, 0.5, 0, 88], [0.5, 0.5, 4, 78], [1, 0.5, 7, 82], [1.5, 0.5, 12, 90], [2, 0.5, 16, 84], [2.5, 0.5, 12, 76], [3, 2.4, [-12, 0, 4, 7, 12], 86]],
      guitars:[[0, 0.5, 0, 92], [0.5, 0.5, 7, 78], [1, 0.5, 12, 82], [1.5, 0.5, 16, 80], [2, 0.5, 19, 84], [2.5, 0.5, 16, 76], [3, 2.4, [0, 7, 12, 16, 19], 90]],
      strings:[[0, 1, 0, 84], [1, 1, 2, 84], [2, 1, 4, 90], [3, 0.5, 7, 92], [3.5, 0.5, 5, 84], [4, 2.2, 4, 88]],
      drums:[[0, 0, "kick", 104], [0, 0, "hat_closed", 84], [0.5, 0, "hat_closed", 64], [1, 0, "snare", 104], [1, 0, "hat_closed", 84], [1.5, 0, "hat_closed", 64], [1.75, 0, "kick", 84], [2, 0, "kick", 100],
             [2, 0, "hat_closed", 84], [2.5, 0, "hat_closed", 64], [3, 0, "snare", 104], [3, 0, "hat_closed", 84], [3.5, 0, "hat_open", 80], [4, 0, "kick", 100], [4, 0, "crash", 90]]
    };
    AUD.winds = AUD.strings; AUD.voice = AUD.strings;
    var IB = null;
    function auditionInst(id){
      return ensureEngine().then(function(ok){ if(!ok) return false; resume(); if(MOB.lean){ var dk = ENG.inst[id]; if(dk) dk.keep = true; unloadUnused(); if(dk) dk.keep = false; } return loadInst(id); }).then(function(ok){
        var d = ENG.inst[id]; if(!ok || !d || d.state !== "ready"){ tell("That sound could not be loaded just now."); return false; }
        if(TR.playing) transportStop(); auditionStop(); if(ENG.G) silence(ENG.G, undefined, true);
        var G = ENG.G, t0 = G.ctx.currentTime + 0.06, beat = 0.6, tr = audTrack(id);
        if(d.kit){
          tr.kind = "drums"; tr.send = 0.08;
          var ph = AUD.drums;
          if(!kitHas(d, "kick") && !kitHas(d, "snare")){ ph = []; Object.keys(d.pieces).forEach(function(pc, i){ ph.push([i * 0.5, 0, pc, 100]); }); }
          ph.forEach(function(n, i){ if(DRUM[n[2]]) playDrum(G, tr, DRUM[n[2]], n[3], t0 + n[0] * beat, i); });
          return true;
        }
        var rg = d.range || [48, 72], mid = (rg[0] + rg[1]) / 2, home = d.family === "bass" ? rg[0] + 9 : Math.round(mid) - 6;
        home = clamp(home - ((home % 12) + 12) % 12 + (d.family === "bass" ? 4 : 0), rg[0] + (d.family === "keys" ? 12 : 0), rg[1] - 19);
        (AUD[d.family] || AUD.keys).forEach(function(n){
          (Array.isArray(n[2]) ? n[2] : [n[2]]).forEach(function(st, j){ var p = home + st; if(p >= rg[0] && p <= rg[1]) playNote(G, tr, p, n[3], t0 + n[0] * beat + j * 0.012, n[1] * beat * 0.95); });
        });
        return true;
      });
    }
    // anchor: what was pressed; trackId: the track whose instrument is being chosen, or null to add a track.
    // o: kind ("inst" lists no drums and no voice track), then(track), title
    function instBrowser(anchor, trackId, o){
      o = o || {};
      var t0 = trackId ? trackById(trackId) : null, cur = t0 ? ENG.inst[t0.inst] : null, drumsOnly = !!(t0 && t0.kind === "drums");
      var fam = o.family || (cur ? cur.family : drumsOnly ? "drums" : "bass");
      loadManifest();
      sheet(o.title || (t0 ? "Instrument for “" + t0.name + "”" : "Add a track"), function(body, close){
        var nav = el("div", "st-ibnav"), list = el("div", "st-iblist"), foot = el("div", "st-ibfoot"), cols = el("div", "st-ibcols");
        nav.setAttribute("role", "tablist"); nav.setAttribute("aria-label", "Kinds of instrument");
        IB = { rows:{}, paint:paint };
        function choose(id){
          var d = ENG.inst[id]; if(!d) return;
          ensureEngine().then(function(){ loadInst(id); });
          S.flags.picked = true;
          if(t0){
            var was = ENG.inst[t0.inst], generic = !was || t0.name === was.name || t0.name === was.name.replace(/\s*\(.*\)$/, "") || /^(Instrument|Chords|Bass|Piano|Guitar|Strings|Drums)$/.test(t0.name);
            t0.inst = id; t0.fam = d.kit ? "" : d.family; if(generic && !d.kit) t0.name = d.name.replace(/\s*\(.*\)$/, "").slice(0, 32);
            // what she hummed is put where the new instrument plays
            var jobs = t0.regions.filter(function(r){ return r.hum && !r.hum.edited; }).map(function(r){ return humRedo(r.id); });
            Promise.all(jobs).then(function(){ chordFollow(); commit("instrument: " + d.name); engSync(); refresh(true); });
            close(); tell(t0.name + " now plays on " + d.name + (d.basic ? " (a basic generated sound)." : "."));
            if(o.then) o.then(t0);
            return;
          }
          var t = addTrack(d.kit ? "drums" : "inst", id, d.kit ? "Drums" : d.name.replace(/\s*\(.*\)$/, "")); if(!t) return;
          if(d.kit && !o.then){ var bt = barTicks(), at = sectionAt(Math.floor(TR.pos / bt)) ? Math.floor(TR.pos / bt) * bt : 0, r = addRegion(t, at, bt * 4, []); drumPreset(r, beatPlan().compound ? "ballad68" : "pop", 0, false); commit("add a drum track"); select(t.id, r.id, { open:true }); UI.tab = "drums"; }
          else { commit("add track " + t.name); select(t.id, null); }
          engSync(); close(); refresh(true);
          if(o.then) o.then(t);
          else if(!d.kit) tell("Press Hum on the track to sing its part, or double-click its lane to write notes by hand.");
        }
        function paint(){
          nav.textContent = ""; list.textContent = ""; IB.rows = {};
          var fams = FAMILIES.filter(function(f){ return drumsOnly ? f[0] === "drums" : (t0 || o.kind === "inst") ? f[0] !== "drums" : true; });
          if(!fams.some(function(f){ return f[0] === fam; })) fam = fams[0][0];
          fams.forEach(function(f){
            var n = instList().filter(function(d){ return d.family === f[0]; }).length; if(!n) return;
            var b = btn("st-ibfam", f[1], "", function(){ fam = f[0]; paint(); }); b.setAttribute("role", "tab"); b.setAttribute("aria-selected", f[0] === fam ? "true" : "false"); b.dataset.fam = f[0]; nav.appendChild(b);
          });
          if(!t0 && o.kind !== "inst"){
            var vb = btn("st-ibfam voice", null, "A track that holds recordings: your voice, or a sound file", function(){ close(); startWith("voice"); }); vb.id = "stibvoice";
            vb.appendChild(el("b", "", "Your voice")); vb.appendChild(el("span", "", "A track to record on")); nav.appendChild(vb);
          }
          var items = instList().filter(function(d){ return d.family === fam; }).sort(function(a, b){ return (a.basic ? 1 : 0) - (b.basic ? 1 : 0); });
          items.forEach(function(d){
            var row = el("div", "st-ibrow"), txt = el("div", "st-ibtxt"), st = el("span", "st-ibstate");
            row.dataset.id = d.id; if(t0 && t0.inst === d.id) row.dataset.cur = "true";
            var play = ibtn("", "play", "Hear " + d.name, "Hear a short phrase", function(){ st.textContent = d.state === "ready" ? "" : "Loading…"; auditionInst(d.id).then(function(){ rowState(d); }); });
            txt.appendChild(el("b", "", d.name));
            txt.appendChild(el("span", "", d.basic ? "A basic sound, generated on this device. Always available, also without a connection." : (d.def && d.def.about) || (d.kit ? "A recorded drum kit." : "A recorded instrument.")));
            var pick = tbtn(t0 && t0.inst === d.id ? "" : "primary", t0 ? (t0.inst === d.id ? "In use" : "Use") : "Add", "", function(){ choose(d.id); }); pick.dataset.pick = d.id;
            row.appendChild(play); row.appendChild(txt); row.appendChild(st); row.appendChild(pick);
            IB.rows[d.id] = { st:st, d:d }; rowState(d);
            list.appendChild(row);
          });
          foot.textContent = "";
          var note = ENG.manifestState === "loading" ? "Looking for the recorded instruments…"
            : ENG.manifestState === "failed" ? "The recorded instruments could not be reached, so only the basic sounds are listed. They are generated on this device and need no connection."
            : "Recorded instruments are fetched the first time each is used, then kept on this device.";
          foot.appendChild(el("span", "st-note", note));
          if(ENG.manifestState === "failed") foot.appendChild(tbtn("", "Try again", "", function(){ ENG.manifestP = null; ENG.manifestState = "none"; loadManifest().then(paint); paint(); }));
          foot.appendChild(el("span", "st-flex"));
          foot.appendChild(tbtn("quiet", "About the sounds", "Where the recorded instruments come from, and their licences", function(){ soundsSheet(); }));
        }
        function rowState(d){
          var r = IB && IB.rows[d.id]; if(!r) return;
          r.st.textContent = d.state === "loading" ? "Loading " + Math.round(100 * (d.def && d.def.samples ? d.got / Math.max(1, d.def.samples.length) : 0.5)) + "%"
            : d.state === "failed" ? "Could not be fetched" : d.state === "ready" ? (d.basic ? "" : "On this device") : d.bytes ? fmtBytes(d.bytes) : "";
          r.st.dataset.state = d.state;
        }
        IB.rowState = rowState;
        cols.appendChild(nav); cols.appendChild(list); body.appendChild(cols); body.appendChild(foot);
        paint();
      }, { cls:"st-inst", id:"stinst", onClose:function(){ IB = null; if(ENG.G && !TR.playing) silence(ENG.G); if(MOB.lean) setTimeout(unloadUnused, 400); } });
    }
    function soundsSheet(){
      loadManifest().then(function(){
        sheet("About the sounds", function(body){
          body.appendChild(line("st-lead", "The instruments in the Studio are recordings of real instruments, made and given away by the people named here. The basic sounds are generated by the app itself."));
          var m = ENG.manifest, rows = m ? (m.instruments || []).concat(m.kits || []) : [];
          if(!rows.length){ body.appendChild(line("st-note", "The list of recorded instruments could not be loaded just now, so only the basic sounds are in use.")); return; }
          var tb = el("table", "st-table"), hr = el("tr"); ["Instrument", "Licence", "Source"].forEach(function(h){ hr.appendChild(el("th", "", h)); }); tb.appendChild(hr);
          rows.forEach(function(d){
            var tr = el("tr"); tr.appendChild(el("td", "", String(d.name || d.id))); tr.appendChild(el("td", "", String(d.licence || "")));
            var td = el("td", "", String(d.source || "")); if(d.credit){ td.appendChild(el("br")); td.appendChild(el("span", "st-credit", String(d.credit))); } tr.appendChild(td); tb.appendChild(tr);
          });
          body.appendChild(tb);
        }, { cls:"st-wide", id:"stsounds" });
      });
    }

    // ---- humming a part ----
    var HS = { bars:4, backing:"", timer:0 };
    function micPermission(){
      try { return navigator.permissions.query({ name:"microphone" }).then(function(p){ return p.state; }, function(){ return "prompt"; }); } catch(e){ return Promise.resolve("prompt"); }
    }
    function micMeterStart(){
      // the microphone open and listening, without keeping anything
      return latLoad().then(micOpen).then(function(){ MIC.meterOnly = true; MIC.level = 0; MIC.on = true; micGate(true); return true; });
    }
    function micMeterStop(){ if(MIC.meterOnly){ MIC.meterOnly = false; micClose(); } }
    function latWords(){
      var l = latNow();
      return l.measured ? "Timing measured for this microphone: " + Math.round(l.sec * 1000) + " ms." : "Timing not measured yet: an estimate of " + Math.round(l.sec * 1000) + " ms is used.";
    }
    // the box both recording sheets share: turn the microphone on, see its level, check the timing
    function micBox(body, onReady){
      var box = el("div", "st-micbox"), top = el("div", "st-microw"), state = el("span", "st-micstate", "The microphone is off."), meter = el("span", "st-meter"), on = tbtn("primary", "Turn on the microphone", "", start);
      on.id = "stmicon"; meter.appendChild(el("i")); meter.setAttribute("aria-hidden", "true");
      top.appendChild(on); top.appendChild(meter); top.appendChild(state); box.appendChild(top);
      var why = line("st-note", "The browser asks for permission the first time. What you record stays in this browser on this device; it is not sent anywhere."); box.appendChild(why);
      var lat = el("div", "st-microw"), latT = el("span", "st-note", ""), chk = tbtn("", "Check timing", "Plays eight clicks through the speakers and listens for them, to measure the delay of this computer", function(){
        chk.disabled = true; latT.textContent = "Listening for eight clicks. Use the speakers for this, not headphones…";
        clearInterval(HS.timer); MIC.meterOnly = false;
        calibrate().then(function(r){
          chk.disabled = false;
          latT.textContent = r.ok ? "Measured: " + Math.round(r.sec * 1000) + " ms (" + r.heard + " of " + r.of + " clicks heard). Recordings are moved by that much."
            : (r.why || "The clicks were not heard by the microphone. Turn the speakers up, take headphones off for this check, and try again.");
          start();
        });
      });
      chk.id = "stlatcheck";
      var nud = el("span", "st-grp"), nv = el("span", "st-val", "");
      function nudge(d){ var cur = Math.round(latNow().nudge * 1000) + d; latNudge(cur).then(function(){ paintLat(); }); }
      nud.appendChild(el("span", "st-l", "By hand")); nud.appendChild(tbtn("quiet", "Earlier", "If your notes land late against the click, move them earlier by 5 ms", function(){ nudge(5); }));
      nud.appendChild(nv);
      nud.appendChild(tbtn("quiet", "Later", "If your notes land early, move them later by 5 ms", function(){ nudge(-5); }));
      function paintLat(){ if(!chk.disabled) latT.textContent = latWords(); var n = Math.round(latNow().nudge * 1000); nv.textContent = (n > 0 ? "+" : "") + n + " ms"; }
      lat.appendChild(latT); lat.appendChild(el("span", "st-flex")); lat.appendChild(chk); lat.appendChild(nud); box.appendChild(lat);
      body.appendChild(box);
      function start(){
        on.disabled = true; state.textContent = "Waiting for the browser…";
        micMeterStart().then(function(){
          on.hidden = true; why.hidden = true; state.textContent = (MIC.label ? MIC.label + ". " : "") + "Say something: the bar should move.";
          box.dataset.on = "true"; paintLat();
          clearInterval(HS.timer); var seen = false;
          HS.timer = setInterval(function(){
            var v = MIC.level || 0, pct = v <= 0.0005 ? 0 : clamp((20 * Math.log(v) / Math.LN10 + 54) / 54, 0, 1);
            meter.firstChild.style.transform = "scaleX(" + pct.toFixed(3) + ")"; meter.dataset.hot = v > 0.95 ? "true" : "false";
            if(!seen && v > 0.02){ seen = true; state.textContent = (MIC.label ? MIC.label + ". " : "") + "The microphone hears you."; }
          }, 50);
          if(onReady) onReady(true);
        }, function(e){ on.disabled = false; on.hidden = false; state.textContent = e && e.message && e.message.length > 20 ? e.message : micWhy(e); box.dataset.on = "false"; if(onReady) onReady(false); });
      }
      latLoad().then(paintLat);
      micPermission().then(function(p){ if((p === "granted" || TEST.micNode) && !box.dataset.on) start(); });
      return { start:start, stop:function(){ clearInterval(HS.timer); } };
    }
    // o: at (tick), bars, msg (a line to show at the top: why the last take gave nothing)
    function humSheet(trackId, o){
      o = o || {};
      var t = trackById(trackId); if(!t || t.kind !== "inst") return;
      if(recordingNow()) return;
      if(phoneOn()){ phCap({ kind:"hum", track:trackId, at:o.at, bars:o.bars, msg:o.msg }); return; }
      if(TR.playing) transportStop();
      var bt = barTicks(), at = o.at !== undefined ? o.at : Math.floor(TR.pos / bt) * bt, others = S.tracks.some(function(x){ return x !== t && x.regions.length > 0; }), started = false;
      var bars = o.bars !== undefined && [0, 2, 4, 8].indexOf(o.bars) >= 0 ? o.bars : HS.bars, backing = others ? (HS.backing || "song") : "click", first = !anyHum() && !S.flags.guided;
      sheet("Hum a part for " + t.name, function(body, close){
        if(o.msg){ var m = line("st-warn", o.msg); m.setAttribute("role", "status"); body.appendChild(m); }
        if(first){
          var ol = el("ol", "st-first");
          ["Put headphones on if you have them, so that the click is not recorded along with you.",
           "Press Start. You hear " + (S.countIn > 1 ? S.countIn + " bars" : "one bar") + " of clicks: count along, then hum or sing “da da da” in time with them.",
           "It stops by itself. The notes appear on the grid with the line of your voice under them, and " + instName(t.inst) + " plays them back."].forEach(function(s){ ol.appendChild(el("li", "", s)); });
          body.appendChild(ol);
        } else body.appendChild(line("st-lead", "Hum, sing “da da da” or whistle. " + instName(t.inst) + " plays what you hum, moved to where that instrument sounds."));
        var form = el("div", "st-form");
        function row(label, node){ var r = el("div", "st-frow"); r.appendChild(el("span", "st-l", label)); r.appendChild(node); form.appendChild(r); return r; }
        var lenSeg = seg([[2, "2 bars"], [4, "4 bars"], [8, "8 bars"], [0, "Until I stop", "No click and no count: hum freely, press Stop, and the Studio finds the beat in it"]], bars, function(v){ bars = +v; lenSeg.set(v); paintStart(); }, "Length");
        lenSeg.id = "sthumlen"; row("Length", lenSeg);
        var bkSeg = seg([["click", "The click only"], ["song", "The song so far", "The other tracks play, a little quieter, while you hum"]], backing, function(v){ backing = v; bkSeg.set(v); }, "What plays while you hum");
        var bkRow = row("You hear", bkSeg); bkRow.hidden = !others;
        var atBox = el("span", "st-grp"), atV = el("span", "st-val", "");
        atBox.appendChild(tbtn("quiet", "−", "One bar earlier", function(){ at = Math.max(0, at - bt); paintStart(); })); atBox.appendChild(atV); atBox.appendChild(tbtn("quiet", "+", "One bar later", function(){ at += bt; paintStart(); }));
        row("Starts at", atBox);
        body.appendChild(form);
        var ready = false, mb = micBox(body, function(ok){ ready = ok; paintStart(); });
        var acts = el("div", "st-acts"), go = tbtn("primary big", "", "", function(){
          if(!ready){ mb.start(); return; }
          started = true; HS.bars = bars; HS.backing = backing; mb.stop(); close();
          var want = { track:t.id, bars:bars, backing:bars ? backing : "click", at:at, done:function(out){ humDone(t.id, out, { at:at, bars:bars }); } };
          humStart(want).then(function(){ recStrip("hum"); }, function(e){ recStripEnd(); humSheet(trackId, { at:at, bars:bars, msg:e && e.message ? e.message : "The microphone could not be opened." }); });
        });
        go.id = "sthumgo";
        function paintStart(){
          atV.textContent = "bar " + (Math.round(at / bt) + 1);
          bkRow.hidden = !others || !bars; atBox.parentNode.hidden = !bars;
          go.textContent = !ready ? "Turn on the microphone" : bars ? "Start: " + (S.countIn > 1 ? S.countIn + " bars" : "one bar") + " of clicks, then hum" : "Start humming";
        }
        acts.appendChild(tbtn("", "Cancel", "", function(){ close(); })); acts.appendChild(go); body.appendChild(acts);
        paintStart();
      }, { cls:"st-hum", id:"sthum", onClose:function(){ clearInterval(HS.timer); if(!started) micMeterStop(); } });
    }
    function humDone(trackId, out, o){
      recStripEnd();
      if(!out || !out.ok){ humSheet(trackId, { at:o.at, bars:o.bars, msg:(out && out.why) || "That take could not be read. Try once more." }); return; }
      S.flags.guided = true; touch(); count("hum_takes");
      UI.humSug = { region:out.region, key:out.key, tempo:out.tempo };
      select(trackId, out.region, { open:true }); UI.tab = "notes"; UI.edOpen = true; layout();
      var t = trackById(trackId), words = out.notes + (out.notes === 1 ? " note" : " notes") + " heard. " + (t ? instName(soundFor(t)) : "The instrument") + " is playing them back.";
      if(out.clipped) words += " The microphone was overloaded in places: sing a little further from it.";
      else if(out.bleed && !out.free) words += " The click was audible in the recording; headphones give cleaner notes.";
      if(out.early) words += " " + out.early + (out.early === 1 ? " note" : " notes") + " before the part began " + (out.early === 1 ? "was" : "were") + " left out.";
      tell(words);
      var d = t && loadInst(t.inst);
      Promise.resolve(d).then(function(){ if(!recordingNow() && !TR.playing) humHear(out.region, "notes").then(function(){ paintHumbar(); paintBar(); }); });
    }

    // ---- the strip that shows while something is being recorded ----
    var RS = { timer:0, kind:"", t0:0 };
    function recStrip(kind){
      var E = UI.e, bar = E.recbar; RS.kind = kind; RS.t0 = performance.now();
      bar.textContent = ""; bar.hidden = false; bar.dataset.kind = kind; bar.dataset.state = "count";
      E.recDot = el("span", "st-recdot"); E.recText = el("b", "st-rectext", ""); E.recPips = el("span", "st-pips"); E.recMeter = el("span", "st-meter"); E.recMeter.appendChild(el("i")); E.recNote = el("span", "st-note", "");
      var stop = tbtn("st-recstop", kind === "hum" && HUM && !HUM.free ? "Stop early" : "Stop", "Stop (Space)", function(){ REC_UI.stop(); }); stop.id = "strecstop";
      bar.appendChild(E.recDot); bar.appendChild(E.recText); bar.appendChild(E.recPips); bar.appendChild(E.recMeter); bar.appendChild(E.recNote); bar.appendChild(el("span", "st-flex"));
      if(kind === "hum") bar.appendChild(tbtn("quiet", "Cancel", "Throw this take away", function(){ humCancel(); recStripEnd(); }));
      bar.appendChild(stop);
      REC_UI = { active:true, stop:function(){ var E2 = UI.e; if(E2.recText) E2.recText.textContent = kind === "hum" ? "Listening to what you hummed…" : "Finishing…"; bar.dataset.state = "listening"; stopAnyRecording().then(function(r){ if(kind === "audio") audioDone(r); else if(kind === "tap") recStripEnd(); }); } };
      clearInterval(RS.timer); RS.timer = setInterval(recPaint, 50); recPaint(); paintBar();
    }
    function recStripEnd(){
      clearInterval(RS.timer); RS.timer = 0; REC_UI = null;
      if(UI.e.recbar){ UI.e.recbar.hidden = true; UI.e.recbar.textContent = ""; }
      paintBar(); paintEditorTools(); refreshPlayhead();
    }
    function recPaint(){
      var E = UI.e; if(!REC_UI || !E.recText || E.recbar.dataset.state === "listening") return;
      var R = HUM || AREC || NREC, bt = barTicks(), pt = pulseTicks(), nb = Math.round(bt / pt), kind = RS.kind;
      if(!R){ return; }
      var now = TR.playing ? transportTick() : 0, ctx = ENG.ctx, pre = TR.playing && TR.startAt && ctx.currentTime < TR.startAt, text = "", beat = -1;
      if(HUM && HUM.free){ text = "Recording. Hum freely, then press Stop."; E.recbar.dataset.state = "rec"; }
      else if(pre){
        var left = TR.startAt - ctx.currentTime, beatsLeft = Math.ceil(left / tickSec(pt) - 0.02); beat = (nb * 8 - beatsLeft) % nb;
        text = "Count-in"; E.recbar.dataset.state = "count";
      } else {
        var rel = Math.max(0, now - R.at), barN = Math.floor(rel / bt) + 1; beat = Math.floor((rel % bt) / pt);
        E.recbar.dataset.state = "rec";
        text = kind === "hum" ? "Hum now: bar " + Math.min(barN, HUM.o.bars) + " of " + HUM.o.bars : kind === "audio" ? "Recording: " + timeText(tickSec(rel)) : "Tap along: F kick, J snare, K hat, L open hat";
      }
      if(E.recText.textContent !== text) E.recText.textContent = text;
      if(E.recPips.childNodes.length !== nb){ E.recPips.textContent = ""; for(var i = 0; i < nb; i++) E.recPips.appendChild(el("i", "", String(i + 1))); }
      for(var k = 0; k < nb; k++) E.recPips.childNodes[k].dataset.on = k === beat ? "true" : "false";
      E.recPips.hidden = !!(HUM && HUM.free);
      var v = MIC.level || 0, pct = v <= 0.0005 ? 0 : clamp((20 * Math.log(v) / Math.LN10 + 54) / 54, 0, 1);
      E.recMeter.hidden = kind === "tap"; E.recMeter.firstChild.style.transform = "scaleX(" + pct.toFixed(3) + ")"; E.recMeter.dataset.hot = v > 0.95 ? "true" : "false";
      ARR.view.ask();
    }
    function recordPressed(){
      if(recordingNow()){ if(REC_UI) REC_UI.stop(); else stopAnyRecording(); return; }
      var t = selTrack();
      if(!S.tracks.length){ startWith("hum"); return; }
      if(!t){ tell("Select a track first: click its name on the left. Then Record hums a part, records your voice, or taps a rhythm, depending on the track."); return; }
      if(t.kind === "inst") humSheet(t.id); else if(t.kind === "audio") recordAudio(t.id); else { showTab("drums"); tapStart(t.id); }
    }
    function recordAudio(trackId){
      var t = trackById(trackId); if(!t || t.kind !== "audio" || recordingNow()) return;
      if(phoneOn()){ phCap({ kind:"voice", track:trackId }); return; }
      if(TR.playing) transportStop();
      var bt = barTicks(), at = Math.floor(TR.pos / bt) * bt, started = false;
      sheet("Record on " + t.name, function(body, close){
        body.appendChild(line("st-lead", "The song plays from bar " + (at / bt + 1) + " and your voice is recorded over it until you press Stop. Recording the same place again keeps the earlier takes, so you can choose between them."));
        body.appendChild(line("st-note", "Wear headphones for this. On speakers the microphone records the song as well as you, and the two cannot be separated afterwards. You do not hear your own voice through the app while recording."));
        var ready = false, mb = micBox(body, function(ok){ ready = ok; go.textContent = ok ? "Record from bar " + (at / bt + 1) : "Turn on the microphone"; });
        var acts = el("div", "st-acts"), go = tbtn("primary big", "Turn on the microphone", "", function(){
          if(!ready){ mb.start(); return; }
          started = true; mb.stop(); close();
          audioRecStart(trackId, { at:at }).then(function(){ recStrip("audio"); }, function(e){ recStripEnd(); tell(e && e.message ? e.message : "The microphone could not be opened."); });
        });
        go.id = "strecgo";
        acts.appendChild(tbtn("", "Cancel", "", function(){ close(); })); acts.appendChild(go); body.appendChild(acts);
      }, { cls:"st-hum", id:"strecsheet", onClose:function(){ clearInterval(HS.timer); if(!started) micMeterStop(); } });
    }
    function audioDone(r){
      recStripEnd();
      if(!r){ tell("Nothing was recorded: the take was too short."); return; }
      var f = findRegion(r.id); if(f){ select(f.t.id, r.id, { open:true }); UI.tab = "take"; UI.edOpen = true; layout(); }
      count("studio_takes");
      tell("Recorded" + (r.takes.length > 1 ? " as take " + r.takes.length + " of this place; choose between them in the editor below." : ". Drag its ends in the editor below to trim it."));
    }
    function onRecordEvent(d){
      if(d.kind === "hum" && d.state === "listening" && UI.e.recText){ UI.e.recText.textContent = "Listening to what you hummed…"; UI.e.recbar.dataset.state = "listening"; }
      if(d.kind === "audio" && d.state === "done"){ if(d.quiet) tell("That take is very quiet. Check that the right microphone is chosen in the browser, and sing closer to it."); else if(d.clipped) tell("That take overloaded the microphone in places. Sing a little further from it."); }
      if(d.kind === "notes" && (d.state === "done" || d.state === "empty")){ recStripEnd(); if(d.state === "empty") tell("No taps were recorded."); else refresh(true); }
    }

    // ---- the song menu, the list of songs, versions ----
    function fmtWhen(t){ try { var d = new Date(t); return d.toLocaleDateString(undefined, { day:"numeric", month:"short" }) + ", " + d.toLocaleTimeString(undefined, { hour:"2-digit", minute:"2-digit" }); } catch(e){ return ""; } }
    function songMenu(anchor){
      popMenu(anchor, [
        { h:S.name },
        { t:"Rename", run:function(){ askText(anchor, "Song name", S.name, function(v){ renameSong(S.id, v); }); } },
        { t:"New song", run:function(){ createSong().then(function(){ tell("A new, empty song. The one before is in “Your songs”."); }); } },
        { t:"Your songs…", run:function(){ songsSheet(); } },
        "-",
        { t:"Save a version", title:"Keep the song as it is now, to come back to", run:function(){ askText(anchor, "Name for this version", "Version " + fmtWhen(Date.now()), function(v){ saveVersion(v).then(function(){ tell("Version kept: “" + v + "”. Versions, in this menu, lists them."); }); }); } },
        { t:"Versions…", run:function(){ versionsSheet(); } },
        { t:"Duplicate this song", run:function(){ duplicateSong(S.id).then(function(id){ if(id) openSong(id).then(function(){ tell("This is the copy. The original is in “Your songs”."); }); }); } },
        "-",
        { t:"Open a song file or MIDI file…", run:function(){ openFilePick(); } },
        { t:"Export…", run:function(){ exportSheet(); } }
      ], { label:"Song" });
    }
    function songsSheet(){
      if(phoneOn()){ closePops(); phGo("home"); return; }
      sheet("Your songs", function(body, close){
        var list = el("div", "st-list"); body.appendChild(list);
        function paint(){
          listSongs().then(function(rows){
            list.textContent = "";
            if(!rows.length) list.appendChild(line("st-note", "No songs yet."));
            rows.forEach(function(r){
              var row = el("div", "st-lrow"), txt = el("div", "st-ibtxt"); if(r.open) row.dataset.cur = "true";
              txt.appendChild(el("b", "", r.name)); txt.appendChild(el("span", "", (r.tracks || 0) + (r.tracks === 1 ? " track" : " tracks") + ", " + (r.tempo || 100) + " BPM. Changed " + fmtWhen(r.updated)));
              row.appendChild(txt);
              if(r.open) row.appendChild(el("span", "st-badge", "Open")); else row.appendChild(tbtn("primary", "Open", "", function(){ openSong(r.id).then(function(){ close(); }); }));
              row.appendChild(tbtn("quiet", "Duplicate", "", function(){ duplicateSong(r.id).then(paint); }));
              var del = tbtn("quiet danger", "Delete", "", function(){
                if(del.dataset.sure !== "true"){ del.dataset.sure = "true"; del.textContent = "Delete for good?"; setTimeout(function(){ del.dataset.sure = ""; del.textContent = "Delete"; }, 4000); return; }
                deleteSong(r.id).then(paint);
              });
              row.appendChild(del); list.appendChild(row);
            });
          });
        }
        paint();
        var acts = el("div", "st-acts");
        acts.appendChild(tbtn("", "Open a file…", "A song file saved from the Studio, or a MIDI file", function(){ close(); openFilePick(); }));
        acts.appendChild(tbtn("primary", "New song", "", function(){ createSong().then(function(){ close(); }); }));
        body.appendChild(acts);
        body.appendChild(line("st-note", "Songs are kept in this browser on this device. To move one to another computer, or to keep a copy outside the browser, save it as a song file from Export."));
      }, { id:"stsongs" });
    }
    function versionsSheet(){
      sheet("Versions of “" + S.name + "”", function(body, close){
        body.appendChild(line("st-lead", "A version is the song as it was at one moment. The Studio keeps one when a song is opened and before the Assistant changes it; “Save a version” keeps one whenever you want."));
        var list = el("div", "st-list"); body.appendChild(list);
        listVersions().then(function(rows){
          if(!rows.length) list.appendChild(line("st-note", "No versions of this song yet."));
          rows.forEach(function(v){
            var row = el("div", "st-lrow"), txt = el("div", "st-ibtxt"); txt.appendChild(el("b", "", v.label)); txt.appendChild(el("span", "", fmtWhen(v.t))); row.appendChild(txt);
            row.appendChild(tbtn("", "Go back to this", "The song becomes what it was then. Undo brings back what it is now.", function(){ restoreVersion(v.k).then(function(ok){ close(); tell(ok ? "The song is as it was in “" + v.label + "”. Undo returns to what it was a moment ago." : "That version could not be read."); }); }));
            list.appendChild(row);
          });
        });
      }, { id:"stversions" });
    }

    // ---- key ----
    function setKey(root, scale){
      S.key = root === null ? { root:null, scale:"none" } : { root:root, scale:scale };
      var jobs = []; S.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.hum && r.hum.pitch === "key" && !r.hum.edited && root !== null) jobs.push(humRedo(r.id)); }); });
      return Promise.all(jobs).then(function(){ commit("key: " + keyName(S.key)); refresh(true); });
    }
    function songNotes(){
      var all = []; S.tracks.forEach(function(t){ if(t.kind !== "inst") return; t.regions.forEach(function(r){ if(r.gen) return; eachNote(r, r.s, r.s + r.l, function(s, l, p){ all.push({ t:s, n:p + 12 * (t.oct || 0), d:l }); }); }); });
      all.sort(function(a, b){ return a.t - b.t; }); return all;
    }
    // every note, chord and the key move by n semitones; drums and recordings stay
    function transposeSong(n){
      n = clamp(Math.round(n), -24, 24); if(!n) return 0;
      var done = {}, moved = 0;
      S.tracks.forEach(function(t){ if(t.kind !== "inst") return; t.regions.forEach(function(r){
        if(r.hum) r.hum.semi = clamp((r.hum.semi || 0) + n, -24, 24);
        if(!r.pat || done[r.pat]) return; done[r.pat] = 1;
        var p = S.pats[r.pat]; if(!p.notes.length) return;
        var hi = Math.max.apply(null, p.notes.map(function(x){ return x.p; })), lo = Math.min.apply(null, p.notes.map(function(x){ return x.p; })), d = n;
        while(hi + d > 127) d -= 12; while(lo + d < 0) d += 12;
        p.notes.forEach(function(x){ x.p += d; moved++; });
      }); });
      S.chords.forEach(function(c){ c.root = ((c.root + n) % 12 + 12) % 12; });
      if(S.key.root !== null && S.key.scale !== "none") S.key.root = ((S.key.root + n) % 12 + 12) % 12;
      chordFollow();
      return moved;
    }
    function keyPop(anchor){
      popOver(anchor, function(pop, close){
        var scale = S.key.scale === "minor" ? "minor" : "major", grid = el("div", "st-keygrid");
        pop.appendChild(el("div", "st-mh", "Key of the song"));
        var sg = seg([["major", "Major"], ["minor", "Minor"]], scale, function(v){ scale = v; sg.set(v); if(S.key.root !== null && S.key.scale !== "none"){ setKey(S.key.root, scale); paint(); } }, "Major or minor");
        function paint(){ Array.prototype.forEach.call(grid.children, function(b){ b.setAttribute("aria-pressed", S.key.scale !== "none" && +b.dataset.r === S.key.root ? "true" : "false"); }); }
        NOTE_NAMES.forEach(function(nm, r){ var b = tbtn("", nm, "", function(){ setKey(r, scale); paint(); }); b.dataset.r = r; grid.appendChild(b); });
        pop.appendChild(sg); pop.appendChild(grid); paint();
        var r2 = el("div", "st-poprow");
        r2.appendChild(tbtn("", "Work it out from my notes", "Looks at the notes on the instrument tracks and names the key they fit best", function(){
          var k = dsp().suggestKey(songNotes()); if(!k){ tell("There are too few notes to tell the key yet."); return; }
          scale = k.scale; sg.set(scale); setKey(k.root, k.scale).then(paint); tell("The notes fit " + keyName(k) + " best" + (k.sure < 0.08 ? "; " + keyName(k.next) + " is nearly as close." : "."));
        }));
        r2.appendChild(tbtn("quiet", "No key", "No notes are marked on the grid", function(){ setKey(null); paint(); }));
        pop.appendChild(r2);
        pop.appendChild(el("div", "st-sep"));
        pop.appendChild(el("div", "st-mh", "Move the whole song higher or lower"));
        var r3 = el("div", "st-poprow"), tv = el("span", "st-val", "to suit your voice");
        function tr(n){ var m = transposeSong(n); commit(n > 0 ? "song up a semitone" : "song down a semitone"); refresh(true); paint(); tv.textContent = keyName(S.key) === "No key" ? (n > 0 ? "up" : "down") + " a semitone" : "now " + keyName(S.key); void m; }
        r3.appendChild(tbtn("", "Lower", "Every note and chord one semitone down. Recordings stay as they are.", function(){ tr(-1); }));
        r3.appendChild(tbtn("", "Higher", "Every note and chord one semitone up. Recordings stay as they are.", function(){ tr(1); }));
        r3.appendChild(tv); pop.appendChild(r3);
      }, { cls:"st-keypop", label:"Key", noFocus:true });
    }

    // ---- files: export, song files, opening ----
    function fileBase(){ return (S.name || "song").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 40) || "song"; }
    function b64(u8){ var s = "", i; for(i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return window.btoa(s); }
    function unb64(str){ var s = window.atob(str), u = new Uint8Array(s.length), i; for(i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
    function anOut(an){ if(!an) return null; var o = {}; Object.keys(an).forEach(function(k){ o[k] = an[k]; }); o.contour = Array.prototype.map.call(an.contour || [], function(v){ return Math.round(v * 100) / 100; }); return o; }
    function anIn(an){ if(!an || typeof an !== "object" || !Array.isArray(an.notes)) return null; var o = {}; Object.keys(an).forEach(function(k){ o[k] = an[k]; }); o.contour = new Float32Array(Array.isArray(an.contour) ? an.contour.slice(0, 400000) : []); return o; }
    function takesOf(s){ var ids = {}; s.tracks.forEach(function(t){ t.regions.forEach(function(r){ (r.takes || []).forEach(function(id){ ids[id] = 1; }); if(r.hum) ids[r.hum.take] = 1; }); }); return Object.keys(ids); }
    function audioOut(ids){
      return Promise.all(ids.map(function(id){ return takeGet(id); })).then(function(rows){
        return rows.filter(Boolean).map(function(a){ return { id:a.id, sr:a.sr, name:a.name, kind:a.kind, lat:a.lat || 0, made:a.made, an:anOut(a.an), pcm:b64(new Uint8Array(a.pcm.buffer, a.pcm.byteOffset, a.pcm.byteLength)) }; });
      });
    }
    function audioIn(list, songId, map){
      return Promise.all((Array.isArray(list) ? list : []).slice(0, 400).map(function(a){
        if(!a || typeof a.pcm !== "string" || !(a.sr >= 8000 && a.sr <= 192000)) return null;
        var u = unb64(a.pcm), pcm = new Int16Array(u.buffer, 0, u.length >> 1), id = uid("a"); map[String(a.id)] = id;
        return dbPut("audio", { id:id, song:songId, sr:a.sr | 0, pcm:pcm, an:anIn(a.an), name:String(a.name || "Take").slice(0, 40), made:+a.made || Date.now(), lat:+a.lat || 0, kind:a.kind === "hum" ? "hum" : "audio" });
      }));
    }
    function projectOut(withAudio){
      return saveNowS().then(function(){ return withAudio ? audioOut(takesOf(S)) : []; }).then(function(audio){
        return { app:"firstloop-studio", v:1, saved:Date.now(), song:JSON.parse(JSON.stringify(S)), audio:audio };
      });
    }
    function projectIn(obj, name){
      var s = obj && obj.app === "firstloop-studio" ? fixSong(obj.song) : null; if(!s) return Promise.resolve(null);
      s.id = uid("s"); if(name) s.name = name;
      var map = {};
      return listSongs().then(function(rows){ s.name = uniqueSongName(s.name, rows); return audioIn(obj.audio, s.id, map); }).then(function(){
        remapTakes(s, map);
        // a region whose recording did not come along cannot play: it is left out
        s.tracks.forEach(function(t){ if(t.kind === "audio") t.regions = t.regions.filter(function(r){ r.takes = r.takes.filter(function(id){ for(var k in map) if(map[k] === id) return true; return false; }); r.act = Math.min(r.act, r.takes.length - 1); return r.takes.length > 0; }); });
        return dbPut("songs", { id:s.id, name:s.name, updated:Date.now(), created:Date.now(), data:s });
      }).then(function(){ return s.id; });
    }
    function exportRange(loopOnly){ return loopOnly && S.loop.on ? { from:S.loop.a, to:S.loop.b, cut:false } : { from:0, to:songTicks() }; }
    function exportMix(bits, loopOnly, say2){
      if(!songTicks()) return Promise.reject(new Error("empty"));
      if(TR.playing) transportStop();
      say2("Loading the instruments…");
      return ensureEngine().then(ensureSounds).then(function(){ say2("Rendering the song…"); return renderSong(exportRange(loopOnly)); }).then(function(buf){
        var bytes = wavBytes(bufChans(buf), buf.sampleRate, bits); count("studio_exports");
        return offerFile(new Blob([bytes], { type:"audio/wav" }), fileBase() + ".wav").then(function(){ return { bytes:bytes.length, seconds:buf.duration }; });
      });
    }
    function exportStems(loopOnly, say2){
      var ts = S.tracks.filter(function(t){ return t.regions.length > 0; }); if(!ts.length) return Promise.reject(new Error("empty"));
      if(TR.playing) transportStop();
      var files = [], rng = exportRange(loopOnly), i = 0;
      say2("Loading the instruments…");
      return ensureEngine().then(ensureSounds).then(function next(){
        if(i >= ts.length) return null;
        var t = ts[i++]; say2("Rendering “" + t.name + "” (" + i + " of " + ts.length + ")…");
        return renderSong({ from:rng.from, to:rng.to, only:t.id }).then(function(buf){
          files.push({ name:(i < 10 ? "0" : "") + i + "-" + (t.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "track") + ".wav", data:wavBytes(bufChans(buf), buf.sampleRate, 24) });
          return next();
        });
      }).then(function(){ count("studio_exports"); return offerFile(zipBlob(files), fileBase() + "-stems.zip"); }).then(function(){ return { files:files.length }; });
    }
    function exportMidi(){
      if(!S.tracks.some(function(t){ return t.kind !== "audio" && hasNotes(t); })) return Promise.reject(new Error("empty"));
      var bytes = midiOut(); count("studio_exports");
      return offerFile(new Blob([bytes], { type:"audio/midi" }), fileBase() + ".mid").then(function(){ return { bytes:bytes.length }; });
    }
    function exportProject(withAudio){
      return projectOut(withAudio).then(function(o){ count("studio_exports"); var txt = JSON.stringify(o); return offerFile(new Blob([txt], { type:"application/json" }), fileBase() + ".flsong").then(function(){ return { bytes:txt.length }; }); });
    }
    function exportSheet(){
      if(phoneOn()){ phShare(); return; }
      sheet("Export “" + S.name + "”", function(body){
        var status = el("p", "st-status", ""); status.setAttribute("role", "status"); status.id = "stexstatus";
        var busy = false, btns = [];
        function say2(t){ status.textContent = t; }
        function run(p, okText){
          if(busy) return; busy = true; btns.forEach(function(b){ b.disabled = true; });
          p().then(function(r){ say2(okText(r || {})); }, function(e){
            say2(e && e.message === "empty" ? "There is nothing to export yet: the song has no notes or recordings." : "That file could not be made. " + (e && e.message === "no audio" ? "This browser has no Web Audio." : "Try once more."));
          }).then(function(){ busy = false; btns.forEach(function(b){ b.disabled = false; }); });
        }
        var loopOnly = false;
        function block(title, text, items){
          var b = el("div", "st-exblock"), txt = el("div", "st-ibtxt"), acts = el("div", "st-exacts"); txt.appendChild(el("b", "", title)); txt.appendChild(el("span", "", text)); b.appendChild(txt);
          items.forEach(function(it){ var bt2 = tbtn(it[2] ? "primary" : "", it[0], "", it[1]); if(it[3]) bt2.id = it[3]; btns.push(bt2); acts.appendChild(bt2); }); b.appendChild(acts); body.appendChild(b);
        }
        function sec(r){ return timeText(r.seconds || 0) + ", " + fmtBytes(r.bytes || 0); }
        if(S.loop.on){
          var lr = el("label", "st-check"), cb = el("input"); cb.type = "checkbox"; cb.addEventListener("change", function(){ loopOnly = cb.checked; });
          lr.appendChild(cb); lr.appendChild(el("span", "", "Only the looped stretch (bars " + (S.loop.a / barTicks() + 1) + " to " + (S.loop.b / barTicks()) + ")")); body.appendChild(lr);
        }
        block("The finished song", "One sound file of everything together, as you hear it: for sending to someone or putting online.", [
          ["WAV", function(){ run(function(){ return exportMix(16, loopOnly, say2); }, function(r){ return "Saved the song as a WAV file (" + sec(r) + ")."; }); }, true, "stexwav"],
          ["WAV, 24-bit", function(){ run(function(){ return exportMix(24, loopOnly, say2); }, function(r){ return "Saved the song as a 24-bit WAV file (" + sec(r) + ")."; }); }]]);
        block("Each track by itself", "A zip of one sound file per track (stems), all the same length: for mixing in another program or giving to a producer.", [
          ["Stems", function(){ run(function(){ return exportStems(loopOnly, say2); }, function(r){ return "Saved " + r.files + (r.files === 1 ? " stem" : " stems") + " in one zip file."; }); }, false, "stexstems"]]);
        block("The notes", "A MIDI file of the instrument and drum tracks, with tempo, key and section names: other music programs open it and play it on their own instruments.", [
          ["MIDI file", function(){ run(function(){ return exportMidi(); }, function(r){ return "Saved the notes as a MIDI file (" + fmtBytes(r.bytes) + ")."; }); }, false, "stexmidi"]]);
        var inc = true, il = el("label", "st-check"), ic = el("input"); ic.type = "checkbox"; ic.checked = true; ic.addEventListener("change", function(){ inc = ic.checked; }); il.appendChild(ic); il.appendChild(el("span", "", "Include the recordings (a larger file)"));
        block("The song itself", "A song file holds everything: tracks, notes, chords, lyrics and, if you wish, the recordings. Open it in the Studio on any computer to carry on.", [
          ["Song file", function(){ run(function(){ return exportProject(inc); }, function(r){ return "Saved the song file (" + fmtBytes(r.bytes) + ")."; }); }, false, "stexsong"]]);
        body.appendChild(il);
        body.appendChild(status);
      }, { id:"stexportsheet", cls:"st-export" });
    }
    function pickFile(accept, fn){
      var i = el("input"); i.type = "file"; if(accept) i.accept = accept; i.style.display = "none";
      i.addEventListener("change", function(){ var f = i.files && i.files[0]; if(i.parentNode) i.parentNode.removeChild(i); if(f) fn(f); });
      document.body.appendChild(i); i.click();
    }
    function fileText(file){ return file.text ? file.text() : new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(String(fr.result)); }; fr.onerror = rej; fr.readAsText(file); }); }
    function fileBuf(file){ return file.arrayBuffer ? file.arrayBuffer() : new Promise(function(res, rej){ var fr = new FileReader(); fr.onload = function(){ res(fr.result); }; fr.onerror = rej; fr.readAsArrayBuffer(file); }); }
    function openFilePick(){ pickFile(MOB.handheld ? "" : ".flsong,.json,.mid,.midi,audio/*", fileDropped); }
    function fileDropped(file){
      var name = String(file.name || ""), base = name.replace(/\.[^.]+$/, "").slice(0, 60);
      if(/\.(mid|midi)$/i.test(name)){
        return fileBuf(file).then(function(ab){
          var s = midiIn(new Uint8Array(ab), base); if(!s){ tell("That MIDI file could not be read."); return; }
          return listSongs().then(function(rows){ s.name = uniqueSongName(s.name, rows); return dbPut("songs", { id:s.id, name:s.name, updated:Date.now(), created:Date.now(), data:s }); }).then(function(){ return openSong(s.id); }).then(function(){ tell("Opened as a new song. The tracks play on basic sounds: choose an instrument for each."); });
        });
      }
      if(/\.(flsong|json)(\.txt)?$/i.test(name) || (/\.txt$/i.test(name) || !/\.[a-z0-9]{1,5}$/i.test(name)) && !/^audio\//.test(file.type || "")){
        return fileText(file).then(function(txt){
          var o = null; try { o = JSON.parse(txt); } catch(e){}
          return projectIn(o).then(function(id){ if(!id){ tell("That is not a song file from the Studio."); return; } return openSong(id).then(function(){ tell("Opened “" + S.name + "” as a new song."); }); });
        });
      }
      // a sound file goes on a voice track
      var t = selTrack(); if(!t || t.kind !== "audio"){ t = S.tracks.filter(function(x){ return x.kind === "audio"; })[0] || addTrack("audio", "", "Audio"); if(!t) return; }
      tell("Reading " + name.slice(0, 40) + "…");
      return audioImport(t.id, file).then(function(r){ if(r){ select(t.id, r.id, { open:true }); UI.tab = "take"; refresh(true); tell("Placed on “" + t.name + "” at the playhead."); } }, function(e){ tell(e && e.message === "long" ? "That file is longer than ten minutes, which is more than a track here can hold." : "That file could not be read as sound."); });
    }

    // ---- help ----
    function helpSheet(){
      if(phoneOn()){ phHelp(); return; }
      sheet("How the Studio works", function(body){
        function h(t){ body.appendChild(el("h3", "", t)); }
        function p(t){ body.appendChild(el("p", "", t)); }
        h("Your voice is the instrument");
        p("Every instrument track has a Hum button. Hum, sing “da da da” or whistle a part against the click, and it becomes notes that the track’s instrument plays. The line of your voice stays under the notes, so you can see what was heard and drag any note that came out differently from what you meant.");
        p("Above the notes of a hummed part are three choices that are worked out again at once from the same take: how closely the timing follows you, whether notes are fitted to the song’s key, and which octave they sit in.");
        h("Building the song");
        p("Chords: open the Chords tab, choose chords bar by bar or have them suggested for a melody or a bass line you hummed, then have a piano, a guitar, strings or a bass play them in a style. Drums: add a drum track, pick a feel, and change any hit on the grid. Sections (Intro, Verse, Chorus) are marked along the top and can be duplicated or moved with their music.");
        p("Your singing goes on a voice track: press Record on it and sing over the song. Each new recording of the same place is kept as another take.");
        h("Sound");
        p("The instruments are recordings of real instruments, fetched the first time each is used. Without a connection the Studio plays basic sounds that it generates itself, and says so on the track.");
        h("Timing");
        p("A computer takes a moment to play a sound and to hear one. “Check timing”, where you turn the microphone on, measures that delay once with eight clicks through the speakers, so that what you hum lands where you hummed it.");
        h("Keys");
        var tb = el("table", "st-table");
        [["Space", "Play or stop"], ["R", "Record on the selected track"], ["Home", "Go to the start"], ["L", "Loop on or off"], ["K", "Click on or off"], ["M", "Mixer"], ["Ctrl+Z, Ctrl+Shift+Z", "Undo, redo"],
         ["Ctrl+D", "Duplicate the selected notes, or the region"], ["Ctrl+C, Ctrl+X, Ctrl+V", "Copy, cut and paste notes"], ["Ctrl+A", "Select all notes"], ["Delete", "Delete the selected notes, or the region"],
         ["Arrow keys", "Move the selected notes (Shift: by an octave); in the timeline, move the region by a bar"], ["Q", "Quantise"], ["1, 2", "Pointer, pencil"], ["+, −", "Louder, softer notes"], ["F", "Show the whole part"],
         ["Ctrl+E", "Split the region at the playhead"], ["Alt while dragging", "Copy instead of move"], ["Shift while dragging", "Leave the snap"], ["Ctrl + wheel", "Zoom"], ["Esc", "Stop recording, or let go of the selection"]]
          .forEach(function(r){ var tr = el("tr"); tr.appendChild(el("td", "", r[0])); tr.appendChild(el("td", "", r[1])); tb.appendChild(tr); });
        body.appendChild(tb);
        var acts = el("div", "st-acts"); acts.appendChild(tbtn("", "About the sounds", "", function(){ soundsSheet(); })); body.appendChild(acts);
      }, { cls:"st-wide st-help", id:"sthelpsheet" });
    }

    // ---- lyrics: plain text beside each section ----
    var lySig = "";
    function lyricsPaint(full){
      var E = UI.e, box = E.lyricsEl, sig = S.id + "|" + S.sections.map(function(q){ return q.id + q.name + q.bar + ":" + q.len; }).join("|");
      if(!full && sig === lySig && box.firstChild) return;
      if(box.contains(document.activeElement) && sig === lySig) return;
      lySig = sig; box.textContent = "";
      function area(key, label, sub, bar){
        var w = el("div", "st-lysec"), hd = el("div", "st-lyhead"), ta = el("textarea", "st-lytext");
        var nm = bar === null ? el("b", "", label) : btn("st-link", label, "Go to this section", function(){ setPos(bar * barTicks()); scrollToTick(bar * barTicks()); });
        hd.appendChild(nm); if(sub) hd.appendChild(el("span", "st-l", sub)); w.appendChild(hd);
        ta.value = S.lyrics[key] || ""; ta.rows = 4; ta.spellcheck = true; ta.placeholder = "Words for " + (bar === null ? "the song" : label.toLowerCase()); ta.setAttribute("aria-label", "Lyrics: " + label);
        ta.addEventListener("input", function(){ if(ta.value) S.lyrics[key] = ta.value.slice(0, 6000); else delete S.lyrics[key]; });
        ta.addEventListener("change", function(){ commit("lyrics", true); });
        w.appendChild(ta); box.appendChild(w);
      }
      if(!S.sections.length){
        area("_all", "Lyrics", "", null);
        var hint = el("div", "st-lysec hint"); hint.appendChild(line("st-note", "With sections marked on the timeline (Intro, Verse, Chorus), each gets its own box here, in the order of the song."));
        hint.appendChild(tbtn("", "+ Section", "", function(){ var q = addSection(undefined, sectionBarAtPlayhead()); if(q){ commit("add section " + q.name); refresh(true); } })); box.appendChild(hint);
      } else {
        S.sections.forEach(function(q){ area(q.id, q.name, "bars " + (q.bar + 1) + " to " + (q.bar + q.len), q.bar); });
        if(S.lyrics._all) area("_all", "Other words", "not tied to a section", null);
      }
    }

    // ---- "Start here", and the small screen ----
    var STEPS_KEY = "firstloop.studio.steps";
    function stepState(){
      var insts = S.tracks.filter(function(t){ return t.kind === "inst"; }), hum = anyHum() || insts.some(function(t){ return hasNotes(t) && !t.regions.every(function(r){ return !!r.gen; }); });
      var drums = S.tracks.some(function(t){ return t.kind === "drums" && hasNotes(t); }), chords = S.chords.length > 0, sing = S.tracks.some(function(t){ return t.kind === "audio" && t.regions.length > 0; });
      return { hum:hum, inst:!!S.flags.picked, chords:chords, drums:drums, both:chords && drums, sing:sing, insts:insts };
    }
    function stepDo(k){
      var st = stepState(), sel0 = selTrack(), it = sel0 && sel0.kind === "inst" ? sel0 : st.insts[0];
      if(k === "hum"){ if(it) humSheet(it.id); else startWith("hum"); }
      else if(k === "inst"){ if(it) instBrowser(UI.e.steps, it.id); else startWith("hum"); }
      else if(k === "chords"){
        if(!st.chords){ showTab("chords"); tell(st.hum ? "Press Suggest for chords that fit what you hummed, or choose them bar by bar." : "Choose chords bar by bar; then have an instrument play them."); }
        else if(!st.drums) instBrowser(UI.e.steps, null, { family:"drums" });
        else showTab("chords");
      } else if(k === "sing"){
        var a = S.tracks.filter(function(t){ return t.kind === "audio"; })[0];
        if(!a){ a = addTrack("audio", "", "Voice"); if(!a) return; commit("add a voice track"); }
        select(a.id, null); recordAudio(a.id);
      }
    }
    function buildExtras(){
      var E = UI.e, root = UI.root;
      E.steps = el("div", "st-steps"); E.steps.id = "ststeps"; E.steps.hidden = true; E.steps.setAttribute("role", "group"); E.steps.setAttribute("aria-label", "Start here");
      root.insertBefore(E.steps, E.main);
      root.insertBefore(E.recbar, E.main);
      on("record", onRecordEvent);
      on("record", function(d){ if(PH.cap && d.kind === "hum" && d.state === "listening" && PH.cap.state !== "listening"){ PH.cap.state = "listening"; phCapPaint(); } });
      on("instload", function(d){ if(IB && IB.rowState && ENG.inst[d.id]) IB.rowState(ENG.inst[d.id]); });
      on("instruments", function(){ if(IB) IB.paint(); });
      on("audition", function(){ paintBar(); if(phoneOn()) phBars(); });
    }
    var stepSig = "";
    function paintExtras(){
      var E = UI.e; if(!E.steps) return;
      var st = stepState(), off = false; try { off = window.localStorage.getItem(STEPS_KEY) === "off"; } catch(e){}
      var all = st.hum && st.inst && st.both && st.sing, sig = [st.hum, st.inst, st.chords, st.drums, st.sing, off, S.id].join("|");
      E.steps.hidden = off || all;
      UI.root.dataset.steps = E.steps.hidden ? "off" : "on";
      if(sig !== stepSig){
        stepSig = sig; E.steps.textContent = "";
        E.steps.appendChild(el("span", "st-stepsh", "Start here"));
        var next = !st.hum ? "hum" : !st.inst ? "inst" : !st.both ? "chords" : "sing";
        [["hum", "Hum a bass line or a melody", st.hum, "Sing a part against the click; it becomes notes"],
         ["inst", "Pick an instrument", st.inst, "Choose what plays the part you hummed"],
         ["chords", st.chords && !st.drums ? "Add drums" : !st.chords && st.drums ? "Add chords" : "Add chords and drums", st.both, "Chords by name or suggested from your notes, played by a piano or a guitar; a drum beat by feel"],
         ["sing", "Sing", st.sing, "Record your voice over the song"]].forEach(function(s, i){
          var b = btn("st-step", null, s[3], function(){ stepDo(s[0]); }); b.dataset.done = s[2] ? "true" : "false"; b.dataset.next = s[0] === next ? "true" : "false"; b.id = "ststep-" + s[0];
          b.appendChild(el("i", "", s[2] ? "✓" : String(i + 1))); b.appendChild(el("span", "", s[1])); E.steps.appendChild(b);
        });
        E.steps.appendChild(el("span", "st-flex"));
        var x = ibtn("quiet", "x", "Hide Start here", "Hide these steps. Help, at the top right, explains everything they do.", function(){ try { window.localStorage.setItem(STEPS_KEY, "off"); } catch(e){} stepSig = ""; paintExtras(); layout(); });
        E.steps.appendChild(x);
      }
    }

    // ---- the keyboard ----
    var TAPKEYS = { f:"kick", j:"snare", k:"hat_closed", l:"hat_open", d:"tom_low", h:"clap" };
    function typing(e){ var t = e.target; return !!(t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)); }
    function keys(e){
      if(document.body.dataset.view !== "studio" || !S) return;
      var tg = e.target, mod = e.ctrlKey || e.metaKey, k = e.key, lk = k.length === 1 ? k.toLowerCase() : k;
      if(tg && tg.closest && tg.closest("#assistant, .pal, .palbox, .acct, .ws-menu, .ws-page-back, .st-sheet, .st-pop")) return;
      if(tg && tg.closest && !tg.closest("#studio") && tg !== document.body && tg !== document.documentElement && !(tg.closest(".dock") && !typing(e))) return;
      if(typing(e)) return;
      function took(){ e.preventDefault(); e.stopPropagation(); }
      var inRoll = UI.tab === "notes" && UI.edOpen && !!rollRegion(), notesSel = inRoll && ROLL.sel.length > 0, rollFocus2 = inRoll && (document.activeElement === ROLL.host || notesSel);
      if(mod){
        if(e.altKey) return;
        if(lk === "z"){ took(); if(e.shiftKey) redo(); else undo(); return; }
        if(lk === "y"){ took(); redo(); return; }
        if(lk === "a" && inRoll){ took(); rollDo("all"); return; }
        if(lk === "c" && notesSel){ took(); rollDo("copy"); return; }
        if(lk === "x" && notesSel){ took(); rollDo("cut"); return; }
        if(lk === "v" && inRoll && ROLL.clip){ took(); rollDo("paste"); return; }
        if(lk === "d"){ took(); if(notesSel) rollDo("duplicate"); else regionDuplicate(false); return; }
        if(lk === "e"){ took(); regionSplit(); return; }
        return;
      }
      if(e.altKey) return;
      if(k === " " || e.code === "Space"){
        if(tg && tg.tagName === "BUTTON" && !tg.closest(".st-bar")) return;      // a focused button is pressed by Space, as everywhere
        took(); if(e.repeat) return; transportToggle(); return;
      }
      if(k === "Escape"){
        if(recordingNow()){ took(); if(HUM){ humCancel(); recStripEnd(); } else if(REC_UI) REC_UI.stop(); return; }
        if(UI.pops.length){ closePops(); return; }
        if(notesSel){ took(); rollDo("none"); return; }
        if(TR.playing || audition){ took(); transportStop(); auditionStop(); }
        return;
      }
      // tapping a rhythm in, and musical typing, take the letter keys while they are on
      if(NREC && !e.repeat){ var tt = trackById(NREC.t); if(tt && tt.kind === "drums" && TAPKEYS[lk]){ took(); var dp = DRUM[TAPKEYS[lk]]; blip(tt, dp, 100); noteRecEvent(true, dp, 100); noteRecEvent(false, dp); return; } }
      if(UI.kbd && UI.tab === "notes" && UI.edOpen){
        var ki = KB_KEYS.indexOf(lk);
        if(ki >= 0){ took(); if(!e.repeat) kbNote(true, (KB.oct + 1) * 12 + ki, 96); return; }
        if(lk === "z" || lk === "x"){ took(); kbAllOff(); KB.oct = clamp(KB.oct + (lk === "z" ? -1 : 1), 0, 8); kbBuild(UI.e.kbHost); return; }
      }
      if(k === "Home"){ took(); setPos(0); scrollToTick(0); return; }
      if(k === "Delete" || k === "Backspace"){ if(notesSel){ took(); rollDo("delete"); } else if(selRegion() && (document.activeElement === UI.e.tl || document.activeElement === document.body || rollFocus2)){ took(); regionDelete(); } return; }
      if(notesSel && /^Arrow/.test(k)){
        took(); var g = rollGrid() || PPQ / 4;
        if(k === "ArrowLeft") rollDo("nudge", -g); else if(k === "ArrowRight") rollDo("nudge", g); else rollDo("transpose", (k === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 12 : 1));
        return;
      }
      if(e.repeat) return;
      if(lk === "r"){ took(); recordPressed(); }
      else if(lk === "l"){ took(); UI.e.loop.click(); }
      else if(lk === "k"){ took(); UI.e.click.click(); }
      else if(lk === "m"){ took(); UI.e.mixB.click(); }
      else if(lk === "t"){ took(); UI.e.tap.click(); }
      else if(k === "?"){ took(); helpSheet(); }
      else if(inRoll){
        if(lk === "q"){ took(); rollDo("quantise", { strength:1 }); }
        else if(k === "1"){ took(); ROLL.tool = "pointer"; paintEditorTools(); }
        else if(k === "2"){ took(); ROLL.tool = "pencil"; paintEditorTools(); }
        else if(lk === "f"){ took(); rollFit(); }
        else if(k === "+" || k === "="){ took(); rollDo("velocity", 10); }
        else if(k === "-" || k === "_"){ took(); rollDo("velocity", -10); }
      }
    }
    function keysUp(e){
      if(document.body.dataset.view !== "studio" || !UI.kbd) return;
      var lk = e.key.length === 1 ? e.key.toLowerCase() : e.key, ki = KB_KEYS.indexOf(lk);
      if(ki >= 0 && Object.keys(KB.held).length) kbNote(false, (KB.oct + 1) * 12 + ki);
    }
    // a MIDI keyboard plays the selected track, and is recorded while a rhythm or notes are being played in
    function midiIn2(e){
      var d = e && e.data; if(!d || d.length < 3) return false;
      var st = d[0] & 0xF0, t = selTrack(); if(st !== 0x90 && st !== 0x80) return false;
      if(!t || t.kind === "audio") return false;
      var on = st === 0x90 && d[2] > 0, p = d[1], key = "midi" + p, rel = t.kind === "drums" ? (DRUM_OF[p] ? DRUM[DRUM_OF[p]] : p) : p - 12 * (t.oct || 0);
      if(on){ liveOn(t, rel, d[2], key); noteRecEvent(true, rel, d[2]); KB.held[p] = 1; }
      else { liveOff(key); noteRecEvent(false, rel); delete KB.held[p]; }
      if(ROLL.view && UI.tab === "notes") ROLL.view.ask();
      return true;
    }
