    // ---------- Studio: the phone layout (the shell: screens, the bars at the top and the bottom, Home, the sheets) ----------
    // The same song, the same engine and the same canvases as the desktop layout, arranged for one hand:
    //   Home (songs, Start a song, this phone)  ->  the song (tracks as rows, sections and chords above them, the
    //   transport at the bottom, tabs Tracks | Chords | Lyrics | Mix | Share)  ->  one part (notes, drum hits or a recording).
    // Everything is a tap: a tap on a track's name opens its sheet, a tap on a part opens that part's sheet, a tap in the
    // grid adds or selects. One finger moves the view, two fingers zoom. Nothing depends on hovering, on a right click or
    // on a handle smaller than a fingertip; what a keyboard does on the desktop has a button here.
    // 67_phedit.js holds what happens inside a part, the recording screen, chords, the mix, sharing and the phone check.
    var PH = { built:false, screen:"home", e:{}, loupe:null, lasso:false, res:null, cap:null, asst:false, armed:false, sig:{}, toastT:0, first:true };
    function geomApply(){
      var p = phoneOn();
      ARR.rowH = p ? 56 : 48; ARR.rulerH = p ? 28 : 22; ARR.secH = p ? 30 : 20; ARR.chordH = p ? 30 : 20;
      ROLL.keysW = p ? 46 : 58; ROLL.rulerH = p ? 26 : 20; ROLL.velH = p ? 0 : 56; ROLL.rowH = p ? 22 : 14; ROLL.forRegion = null;
      DG.nameW = p ? 92 : 104; DG.rulerH = p ? 26 : 20; DG.forRegion = null; TK.forRegion = null;
    }
    // which layout this is, decided again whenever the window changes (a phone turned on its side stays a phone; a
    // tablet turned upright becomes one). The song, the selection and what is open carry over.
    function phSync(){
      if(!UI.built) return;
      var here = document.body.dataset.view === "studio", want = here && phoneWant(), was = UI.root.dataset.phone === "true", de = document.documentElement;
      if(here && MOB.touch) de.dataset.sttouch = "true"; else delete de.dataset.sttouch;
      if(want) de.dataset.stphone = "true"; else { delete de.dataset.stphone; delete de.dataset.stasst; }
      UI.root.dataset.phone = want ? "true" : "false";
      // a tablet on its side has the desk layout; with the Assistant docked beside it the bar would not fit, so the
      // Assistant is folded away once (its tab at the top opens it again)
      if(here && !want && MOB.touch && !PH.asstAuto && window.innerWidth < 1300 && document.body.classList.contains("has-assistant")){
        PH.asstAuto = true;
        try { asstSetCollapsed(true); setTimeout(function(){ layout(); tell("The Assistant is folded away to give the Studio room. “Assistant”, at the top, opens it."); }, 80); } catch(e){}
      }
      if(want === was) return;
      geomApply(); UI.headSig = ""; toolSig = ""; closePops();
      if(want){
        phBuild();
        // from the desktop layout: what was open there is what is open here
        if(!PH.first && S && UI.sel.region && UI.edOpen && PH.screen !== "home") PH.screen = UI.tab === "chords" ? "chords" : UI.tab === "mixer" ? "mix" : PH.screen;
        if(PH.first){ PH.first = false; PH.screen = "home"; }
        phGo(PH.screen, { quiet:true });
      } else {
        if(PH.cap) phCapCancel();
        PH.asst = false; PH.loupe = null; PH.res = null; UI.edH = 0;
        if(PH.screen === "edit"){ UI.edOpen = true; if(UI.tab === "lyrics" || UI.tab === "notes" || UI.tab === "drums" || UI.tab === "take") UI.edOpen = true; }
        else if(PH.screen === "chords"){ UI.tab = "chords"; UI.edOpen = true; }
        else if(PH.screen === "mix"){ UI.tab = "mixer"; UI.edOpen = true; }
        if(PH.screen === "home") PH.first = true;
      }
    }
    function phBuild(){
      if(PH.built) return; PH.built = true;
      var E = PH.e, root = UI.root;
      function ib(icon, label, id, fn){ var b = ibtn("sp-ib", icon, label, "", fn); b.id = id; b.removeAttribute("title"); return b; }
      // -- top --
      E.top = el("div", "sp-top"); E.top.setAttribute("role", "toolbar"); E.top.setAttribute("aria-label", "Song");
      E.back = ib("back", "Back", "spback", function(){ phBack(); });
      E.title = btn("sp-title", null, "", function(){ phTitleTap(); }); E.title.id = "sptitle";
      E.titleT = el("b", "", ""); E.titleS = el("span", "", ""); E.title.appendChild(E.titleT); E.title.appendChild(E.titleS);
      E.undo = ib("undo", "Undo", "spundo", function(){ undo(); }); E.redo = ib("redo", "Redo", "spredo", function(){ redo(); });
      E.asst = ib("chat", "Assistant", "spasst", function(){ phAsst(true); }); E.asst.classList.add("sp-asstb");
      E.menu = ib("more", "More for this song", "spmenu", function(){ phSongMenu(); });
      [E.back, E.title, E.undo, E.redo, E.asst, E.menu].forEach(function(n){ E.top.appendChild(n); });
      E.nav = el("div", "sp-nav"); E.nav.setAttribute("role", "tablist"); E.nav.setAttribute("aria-label", "Parts of the song"); E.navB = {};
      [["song", "Tracks", "tracks"], ["chords", "Chords", "grid"], ["lyrics", "Lyrics", "text"], ["mix", "Mix", "sliders"], ["share", "Share", "share"]].forEach(function(n){
        var b = btn("sp-navb", null, "", function(){ if(n[0] === "share") phShare(); else if(n[0] === "lyrics") phGo("edit", { tab:"lyrics" }); else phGo(n[0]); });
        b.id = "spnav-" + n[0]; b.setAttribute("role", n[0] === "share" ? "button" : "tab"); b.appendChild(ico(n[2], true)); b.appendChild(el("span", "", n[1])); E.navB[n[0]] = b; E.nav.appendChild(b);
      });
      E.top.appendChild(E.nav);
      root.appendChild(E.top);
      E.nudge = el("div", "sp-nudge"); E.nudge.hidden = true; E.nudge.setAttribute("role", "status"); root.appendChild(E.nudge);
      E.tools = el("div", "sp-tools"); E.tools.setAttribute("role", "toolbar"); E.tools.setAttribute("aria-label", "Tools for this part"); root.appendChild(E.tools);
      // -- the pages that are the phone's own --
      E.page = el("div", "sp-page"); E.home = el("div", "sp-home"); E.home.id = "sphome"; E.chords = el("div", "sp-chords"); E.chords.id = "spchords"; E.mix = el("div", "sp-mix"); E.mix.id = "spmix";
      E.page.appendChild(E.home); E.page.appendChild(E.chords); E.page.appendChild(E.mix); root.appendChild(E.page);
      E.start = el("div", "sp-start"); E.start.id = "spstart"; E.start.hidden = true; root.appendChild(E.start);
      E.hum = el("div", "sp-hum"); E.hum.id = "sphum"; E.hum.hidden = true; root.appendChild(E.hum);
      E.notebar = el("div", "sp-notebar"); E.notebar.id = "spnotebar"; E.notebar.hidden = true; E.notebar.setAttribute("role", "toolbar"); E.notebar.setAttribute("aria-label", "The selected notes"); root.appendChild(E.notebar);
      E.toast = el("div", "sp-toast"); E.toast.id = "sptoast"; E.toast.setAttribute("role", "status"); E.toast.setAttribute("aria-live", "polite"); E.toast.dataset.on = "false"; root.appendChild(E.toast);
     
      // -- transport --
      E.tr = el("div", "sp-tr"); E.tr.setAttribute("role", "toolbar"); E.tr.setAttribute("aria-label", "Transport");
      E.play = ibtn("sp-play", "play", "Play", "", function(){ silentTip(); transportToggle(); }); E.play.id = "spplay"; E.play.removeAttribute("title");
      E.rec = ibtn("sp-rec", "rec", "Record or hum", "", function(){ phRecord(); }); E.rec.id = "sprec"; E.rec.removeAttribute("title");
      E.pos = btn("sp-pos", null, "", function(){ setPos(0); scrollToTick(0); }); E.pos.id = "sppos"; E.posB = el("b", "", "1.1.1"); E.posT = el("span", "", "0:00.0"); E.pos.appendChild(E.posB); E.pos.appendChild(E.posT);
      E.pos.setAttribute("aria-label", "Position. Tap to go to the start.");
      E.tempo = btn("sp-chip", null, "", function(){ phTempoSheet(); }); E.tempo.id = "sptempo"; E.tempoB = el("b", "", "100"); E.tempo.appendChild(E.tempoB); E.tempo.appendChild(el("span", "", "BPM"));
      E.key = btn("sp-chip", null, "", function(){ keyPop(E.key); }); E.key.id = "spkey"; E.keyB = el("b", "", ""); E.key.appendChild(E.keyB); E.key.appendChild(el("span", "", "Key"));
      [E.play, E.rec, E.pos, E.tempo, E.key].forEach(function(n){ E.tr.appendChild(n); });
      root.appendChild(E.tr);
      E.loupe = el("canvas", "sp-loupe"); E.loupe.hidden = true; E.loupe.setAttribute("aria-hidden", "true"); root.appendChild(E.loupe);
      E.cap = el("div", "sp-cap"); E.cap.id = "spcap"; E.cap.hidden = true; E.cap.setAttribute("role", "dialog"); E.cap.setAttribute("aria-modal", "true"); root.appendChild(E.cap);
      on("transport", function(){ if(phoneOn()) phBars(); });
      on("save", function(){ if(phoneOn()) phTop(); });
      on("copydue", function(){ if(phoneOn()) phNudge(); });
      on("route", function(){ if(PH.cap && PH.cap.state === "setup") phCapPaint(); });
      on("instload", function(){ if(phoneOn() && PH.screen === "song") paintHeadsSoon(); });
      window.addEventListener("popstate", function(){
        // the phone's own Back: one step back inside the Studio, as long as there is one
        PH.armed = false; if(!phoneOn()) return;
        if(phBackOne() && (PH.screen !== "home" || UI.pops.length || PH.cap || PH.asst)) phArm();
      });
      window.addEventListener("orientationchange", function(){ setTimeout(function(){ layout(); }, 300); });
      try {
        var log = document.getElementById("asstlog");
        if(log) new MutationObserver(function(){ if(phoneOn() && !PH.asst) E.asst.dataset.unread = "true"; }).observe(log, { childList:true });
      } catch(e){}
    }
    function phArm(){ if(PH.armed) return; try { window.history.pushState({ stph:1 }, ""); PH.armed = true; } catch(e){} }
    function phBackOne(){
      if(PH.cap){ phCapCancel(); return true; }
      if(PH.asst){ phAsst(false); return true; }
      if(UI.pops.length){ closePops(); return true; }
      if(PH.screen !== "home"){ phBack(); return true; }
      return false;
    }
    function phBack(){
      if(PH.screen === "edit" || PH.screen === "chords" || PH.screen === "mix"){ if(audition) auditionStop(); phGo("song"); }
      else if(PH.screen === "song"){ if(TR.playing) transportStop(); phGo("home"); }
    }
    // scr: "home" | "song" | "edit" (o.tab: notes, drums, take, lyrics) | "chords" | "mix"
    function phGo(scr, o){
      o = o || {};
      if(!PH.built) return;
      if(scr === "edit"){ if(o.tab) UI.tab = o.tab; if(UI.tab !== "lyrics" && !selRegion()) scr = "song"; }
      PH.screen = scr; UI.root.dataset.screen = scr; UI.root.dataset.tab = scr === "edit" ? UI.tab : "";
      if(scr !== "edit"){ PH.res = null; PH.lasso = false; ROLL.marquee = null; }
      if(scr !== "home") phArm();
      PH.sig = {};
      if(scr === "song") setTimeout(function(){ if(PH.screen === "song" && ARR.view){ if(!PH.fitted || PH.fitted !== S.id){ PH.fitted = S.id; arrFit(); } ARR.view.ask(); } }, 30);
      if(scr === "edit" && UI.tab === "notes") setTimeout(function(){ if(PH.screen === "edit" && rollRegion()){ rollFit(); phRollWide(); } }, 40);
      if(!o.quiet) closePops();
      refresh(true);
      if(scr === "home") phHome(true);
    }
    // the desktop's editor tabs, asked for by name (the Assistant does): where each lives on a phone
    function phShowTab(tab){
      if(tab === "chords") phGo("chords"); else if(tab === "mixer") phGo("mix"); else if(tab === "lyrics") phGo("edit", { tab:"lyrics" });
      else if(selRegion()) phGo("edit", { tab:tab }); else phGo("song");
    }
    function phToast(m){
      if(!phoneOn() || !PH.built || !m) return;
      if(/^\d+ notes? heard/.test(m)) return;   // the panel under the notes says so already
      var E = PH.e; E.toast.textContent = m; E.toast.dataset.on = "true";
      clearTimeout(PH.toastT); PH.toastT = setTimeout(function(){ E.toast.dataset.on = "false"; }, Math.min(7000, 2600 + String(m).length * 40));
    }

    // ---- painting what is always there ----
    function phPaint(full){
      if(!PH.built || !S) return;
      var E = PH.e, scr = PH.screen;
      UI.root.dataset.screen = scr; UI.root.dataset.tab = scr === "edit" ? UI.tab : "";
      if(scr === "edit" && UI.tab !== "lyrics" && !selRegion()){ phGo("song"); return; }
      phTop(); phBars(); phNudge();
      E.start.hidden = !(scr === "song" && !S.tracks.length);
      if(!E.start.hidden) phStart();
      if(scr === "home") phHome(false);
      else if(scr === "chords") phChords(full);
      else if(scr === "mix") phMix(full);
      phTools(full); phHumPanel(full);
    }
    function phTop(){
      var E = PH.e, scr = PH.screen, f = selRegion(), bt = barTicks(), h = hist(), t = "", s = "";
      if(scr === "edit" && UI.tab === "lyrics"){ t = "Lyrics"; s = S.name; }
      else if(scr === "edit" && f){ t = f.t.name; s = (f.t.kind === "audio" ? "Recording" : f.t.kind === "drums" ? "Drums" : "Notes") + ", bars " + (Math.floor(f.r.s / bt) + 1) + " to " + Math.ceil((f.r.s + f.r.l) / bt); }
      else { t = S.name; s = saveState === "failed" ? "Not saved" : saveState === "memory" ? "Not kept on this phone" : scr === "chords" ? "Chords" : scr === "mix" ? "Mix" : S.tracks.length + (S.tracks.length === 1 ? " track" : " tracks"); }
      if(E.titleT.textContent !== t) E.titleT.textContent = t;
      if(E.titleS.textContent !== s) E.titleS.textContent = s;
      E.titleS.dataset.warn = saveState === "failed" || saveState === "memory" ? "true" : "false";
      E.title.setAttribute("aria-label", scr === "edit" ? t + ", " + s : t + ". Tap to rename.");
      E.back.setAttribute("aria-label", scr === "song" ? "Your songs" : "Back to the tracks");
      E.undo.disabled = !h.u.length; E.redo.disabled = !h.r.length;
      E.undo.setAttribute("aria-label", h.u.length ? "Undo: " + h.u[h.u.length - 1].l : "Undo"); E.redo.setAttribute("aria-label", h.r.length ? "Redo: " + h.r[h.r.length - 1].l : "Redo");
      E.asst.hidden = !document.getElementById("assistant");
      Object.keys(E.navB).forEach(function(k){ var on = k === scr || (k === "lyrics" && scr === "edit" && UI.tab === "lyrics"); if(k !== "share") E.navB[k].setAttribute("aria-selected", on ? "true" : "false"); });
    }
    function phBars(){
      var E = PH.e; if(!PH.built || !S) return;
      var pl = TR.playing || !!audition, rn = recordingNow();
      E.play.dataset.on = pl ? "true" : "false"; E.play.setAttribute("aria-label", pl ? "Stop" : "Play"); E.play.firstChild.firstChild.setAttribute("d", pl ? ICON.stop : ICON.play);
      E.rec.dataset.on = rn ? "true" : "false";
      var st = selTrack(); E.rec.setAttribute("aria-label", !st ? "Record or hum: add a part" : st.kind === "inst" ? "Hum a part on " + st.name : st.kind === "audio" ? "Record on " + st.name : "Drums: choose a feel");
      if(E.tempoB.textContent !== String(S.tempo)) E.tempoB.textContent = String(S.tempo);
      E.tempo.setAttribute("aria-label", "Tempo " + S.tempo + " beats per minute, " + S.sig[0] + "/" + S.sig[1]);
      var kn = scaleOf() ? NOTE_NAMES[S.key.root] + (S.key.scale === "minor" ? " min" : " maj") : "None";
      if(E.keyB.textContent !== kn) E.keyB.textContent = kn;
      E.key.setAttribute("aria-label", "Key: " + keyName(S.key));
      phNotebar();
    }
    function phPos(a, b){ var E = PH.e; if(!E.posB) return; if(E.posB.textContent !== a) E.posB.textContent = a; if(E.posT.textContent !== b) E.posT.textContent = b; }
    function phNudge(){
      var E = PH.e, show = PH.screen === "song" && copyDue() && !PH.nudgeOff;
      if(E.nudge.hidden === !show && (!show || E.nudge.firstChild)) return;
      E.nudge.hidden = !show; E.nudge.textContent = "";
      if(!show) return;
      E.nudge.appendChild(el("span", "", "This song is only on this " + (MOB.handheld ? "phone" : "device") + "."));
      E.nudge.appendChild(tbtn("", "Save a copy", "", function(){ phShare("song"); }));
      var x = ibtn("quiet", "x", "Not now", "", function(){ PH.nudgeOff = true; phNudge(); }); x.removeAttribute("title"); E.nudge.appendChild(x);
    }
    function phTitleTap(){
      if(PH.screen === "edit") return;
      askText(PH.e.title, "Song name", S.name, function(v){ renameSong(S.id, v); });
    }
    function phHead(t){
      var E = UI.e, h = { el:el("div", "st-th sp-th") };
      h.el.dataset.id = t.id; h.el.dataset.kind = t.kind; h.el.id = "stth-" + t.id;
      var b = btn("sp-thb", null, "", function(){ select(t.id, UI.sel.track === t.id ? UI.sel.region : null); phTrackSheet(t.id); });
      h.name = el("b", "sp-thname", t.name); h.inst = el("span", "sp-thinst", "");
      var fl = el("span", "sp-thflags"); h.m = el("i", "sp-flag", "Muted"); h.s = el("i", "sp-flag solo", "Solo"); fl.appendChild(h.m); fl.appendChild(h.s);
      b.appendChild(h.name); b.appendChild(h.inst); b.appendChild(fl);
      h.vol = el("input"); h.pan = el("input");        // the track's sheet and the Mix hold these on a phone
      h.meter = el("span", "st-thmeter"); h.meter.appendChild(el("i"));
      h.el.appendChild(b); h.el.appendChild(h.meter);
      E.th[t.id] = h;
      return h.el;
    }
    // a small list of things to do, each a full-width row
    function phList(box, items, close){
      var list = el("div", "sp-list");
      items.forEach(function(it){
        if(!it) return;
        if(it.h){ list.appendChild(el("div", "sp-listh", it.h)); return; }
        var b = btn("sp-row" + (it.danger ? " danger" : "") + (it.primary ? " primary" : ""), null, "", function(){
          if(it.sure && b.dataset.sure !== "true"){ b.dataset.sure = "true"; lab.textContent = it.sure; setTimeout(function(){ if(b.isConnected){ b.dataset.sure = ""; lab.textContent = it.t; } }, 4000); return; }
          if(!it.stay && close) close(); it.run(b);
        });
        if(it.id) b.id = it.id;
        if(it.icon) b.appendChild(ico(it.icon, !!ICON_LINE[it.icon]));
        var tx = el("span", "sp-rowt"), lab = el("b", "", it.t); tx.appendChild(lab); if(it.d) tx.appendChild(el("span", "", it.d)); b.appendChild(tx);
        if(it.v !== undefined) b.appendChild(el("span", "sp-rowv", it.v));
        if(it.on !== undefined){ b.setAttribute("aria-pressed", it.on ? "true" : "false"); b.appendChild(el("span", "sp-rowv", it.on ? "On" : "Off")); }
        else if(it.go) b.appendChild(ico("fwd", true));
        b.disabled = !!it.off; list.appendChild(b);
      });
      box.appendChild(list); return list;
    }
    function phSlider(label, min, max, step, get, set, fmt, done, id){
      var w = el("label", "sp-slider"), top = el("span", "sp-sltop"), v = el("span", "st-val", fmt(get())), i = el("input");
      top.appendChild(el("span", "", label)); top.appendChild(v); w.appendChild(top);
      i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = get(); i.setAttribute("aria-label", label); if(id) i.id = id;
      i.addEventListener("input", function(){ set(+i.value); v.textContent = fmt(get()); });
      i.addEventListener("change", function(){ if(done) done(); });
      w.appendChild(i); w.set = function(){ i.value = get(); v.textContent = fmt(get()); };
      return w;
    }
    function volText(x){ return x <= 0 ? "off" : Math.round(x * 100) + "%"; }
    function panText(p){ return p === 0 ? "centre" : (p < 0 ? "left " : "right ") + Math.round(Math.abs(p) * 100); }

    // ---- Home ----
    function phHome(force){
      var E = PH.e;
      if(PH.screen !== "home") return;
      if(PH.homeBusy) return; PH.homeBusy = true;
      Promise.all([listSongs(), storageInfo(), copiesLoad()]).then(function(a){
        PH.homeBusy = false;
        var rows = a[0], sig = JSON.stringify(rows) + "|" + STO.used + "|" + STO.persisted + "|" + workspace + "|" + (INST.prompt ? 1 : 0) + "|" + copyDue();
        if(!force && sig === PH.sig.home) return; PH.sig.home = sig;
        var box = E.home, sc = box.scrollTop; box.textContent = "";
        var hd = el("header", "sp-hh"), br = el("div", "sp-brand"); br.appendChild(el("b", "", "First Loop")); br.appendChild(el("span", "", "Songwriter")); hd.appendChild(br); box.appendChild(hd);
        var cur = S && S.tracks.length ? rows.filter(function(r){ return r.open; })[0] : null;
        var st = btn("sp-big primary", null, "", function(){ phNewSong(); }); st.id = "spnew"; st.appendChild(ico("plus")); st.appendChild(el("span", "", "Start a song")); box.appendChild(st);
        if(cur){ var co = btn("sp-big", null, "", function(){ phGo("song"); }); co.id = "spcontinue"; co.appendChild(ico("play")); co.appendChild(el("span", "", "Carry on with “" + cur.name + "”")); box.appendChild(co); }
        box.appendChild(el("h3", "sp-h", "Your songs"));
        var list = el("div", "sp-songs"); list.id = "spsongs";
        var shown = rows.filter(function(r){ return r.tracks > 0 || rows.length === 1 || r.open; });
        if(!shown.length || (shown.length === 1 && !shown[0].tracks)) list.appendChild(line("st-note", "No songs yet. Start one above: hum a part, and an instrument plays it."));
        shown.forEach(function(r){
          if(!r.tracks && shown.length === 1) return;
          var row = el("div", "sp-songrow"), ob = btn("sp-song", null, "", function(){ openSong(r.id).then(function(ok){ if(ok) phGo("song"); }); });
          ob.appendChild(el("b", "", r.name)); ob.appendChild(el("span", "", r.tracks ? r.tracks + (r.tracks === 1 ? " track, " : " tracks, ") + (r.tempo || 100) + " BPM, changed " + fmtWhen(r.updated) : "Empty"));
          if(r.open) row.dataset.cur = "true";
          var mb = ibtn("sp-ib", "more", "More for “" + r.name + "”", "", function(){ phSongSheet(r); }); mb.removeAttribute("title");
          row.appendChild(ob); row.appendChild(mb); list.appendChild(row);
        });
        box.appendChild(list);
        phList(box, [{ t:"Bring in a song file", d:"A song file saved from the Studio on any device, or a MIDI file", icon:"dn", id:"spimport", run:function(){ openFilePick(); } }]);
        box.appendChild(line("st-note sp-pad", "Songs are kept in this browser on this " + (MOB.handheld ? "phone" : "device") + ". Nothing carries them to another device by itself: to move a song, or to keep a copy, share its song file and open that file in the Studio on the other device."));
        var used = STO.used !== null ? fmtBytes(STO.used) + " used" + (STO.quota ? " of about " + fmtBytes(STO.quota) : "") : "";
        var sl = el("p", "st-note sp-pad"); sl.id = "spstorage";
        sl.textContent = (used ? "Storage: " + used + ". " : "") + (STO.persisted === true ? "The browser has agreed to keep it." : MOB.ios ? "An iPhone can clear what a site has stored if the site is not opened for some weeks, so keep copies of songs that matter." : STO.persisted === false ? "The browser may clear it if the device runs short of room, so keep copies of songs that matter." : "");
        box.appendChild(sl);
        box.appendChild(el("h3", "sp-h", "This " + (MOB.handheld ? "phone" : "device")));
        var hasAsst = !!document.getElementById("assistant"), items = [];
        if(hasAsst) items.push({ t:"Assistant", d:"Ask in your own words; it can change the song", icon:"chat", go:true, id:"sphasst", run:function(){ phAsst(true); } });
        if(hasAsst) items.push({ t:"Account", d:"A tester account, or an invite code", go:true, id:"sphacct", run:function(){ phAccount(); } });
        if(document.getElementById("fbbtn")) items.push({ t:"Feedback", d:"Write to the person who runs this site", go:true, id:"sphfb", run:function(){ try { fbOpen(); } catch(e){} } });
        items.push({ t:"Workspace", v:WS_NAMES[workspace] || "", d:"The DJ area and the rest of First Loop", go:true, id:"sphws", run:function(){ phWorkspace(); } });
        items.push({ t:"Help", d:"How the Studio works on a phone", go:true, id:"sphhelp", run:function(){ phHelp(); } });
        items.push({ t:"Phone check", d:"A one-minute test of sound and microphone, to send to the site owner", go:true, id:"sphcheck", run:function(){ phCheck(); } });
        if(MOB.handheld && !isStandalone()) items.push({ t:"Add to Home Screen", d:"Open First Loop full screen, like an app", go:true, id:"sphinstall", run:function(){ phInstall(); } });
        items.push({ t:"Light or dark", v:document.documentElement.getAttribute("data-theme") === "light" ? "Light" : "Dark", id:"sphtheme", stay:true, run:function(){ var tb = document.getElementById("themebtn"); if(tb) tb.click(); setTimeout(function(){ phHome(true); }, 60); } });
        phList(box, items);
        box.scrollTop = force ? 0 : sc;
      }, function(){ PH.homeBusy = false; });
    }
    function phNewSong(){
      var go = function(){ PH.fitted = null; phGo("song"); };
      if(S && !S.tracks.length && !S.chords.length) go(); else createSong().then(go);
    }
    function phSongSheet(r){
      sheet(r.name, function(body, close){
        phList(body, [
          { t:"Open", primary:true, run:function(){ openSong(r.id).then(function(ok){ if(ok) phGo("song"); }); } },
          { t:"Rename", run:function(){ askText(null, "Song name", r.name, function(v){ renameSong(r.id, v).then(function(){ phHome(true); }); }); } },
          { t:"Duplicate", run:function(){ duplicateSong(r.id).then(function(){ phHome(true); }); } },
          { t:"Share or save a copy", d:"The song file, or the song as sound", run:function(){ openSong(r.id).then(function(ok){ if(ok){ phGo("song"); phShare(); } }); } },
          { t:"Delete", danger:true, sure:"Delete for good?", run:function(){ deleteSong(r.id).then(function(){ phHome(true); }); } }
        ], close);
      }, { id:"spsongsheet" });
    }
    function phWorkspace(){
      sheet("Workspace", function(body, close){
        body.appendChild(line("st-lead", "First Loop has more than the Studio. Choosing another workspace leaves it; the Workspace button at the top of the page brings the Songwriter workspace back. Your songs stay where they are."));
        phList(body, WS_ORDER.map(function(w){ return { t:WS_NAMES[w], d:WS_SAYS[w], on:undefined, v:w === workspace ? "Now" : "", run:function(){ if(w !== workspace) wsSet(w); } }; }), close);
      }, { id:"spwssheet" });
    }
    function phAccount(){
      phAsst(true);
      setTimeout(function(){
        try {
          if(typeof acctV === "function" && acctV() && asstCode && !asstCodeBad){ acctShow("mine"); acctLoad(); }
          else if(typeof acctCanSignup === "function" && acctCanSignup()) acctShow("signup");
          else if(typeof asstCodeShow === "function") asstCodeShow(true);
        } catch(e){}
      }, 80);
    }
    // the Assistant as a sheet over the song: the same panel as on a wide screen, the same actions
    function phAsst(open){
      var de = document.documentElement, a = document.getElementById("assistant"); if(!a) return;
      PH.asst = !!open;
      if(open){
        closePops(); phArm();
        if(!PH.e.asstX){ PH.e.asstX = ibtn("sp-asstx", "x", "Close the Assistant", "", function(){ phAsst(false); }); PH.e.asstX.id = "spasstx"; PH.e.asstX.removeAttribute("title"); a.appendChild(PH.e.asstX); }
        de.dataset.stasst = "open"; PH.e.asst.dataset.unread = "false";
        vvApply();
        try { asstPaint(); asstScroll(); } catch(e){}
      } else {
        delete de.dataset.stasst;
        try { if(document.activeElement && a.contains(document.activeElement)) document.activeElement.blur(); } catch(e2){}
        refresh(true);
      }
    }

    // ---- the song screen ----
    function phStart(){
      var E = PH.e, box = E.start; if(box.dataset["for"] === S.id) return; box.dataset["for"] = S.id; box.textContent = "";
      box.appendChild(el("h2", "", "Start a song"));
      box.appendChild(line("st-lead", "Hum or sing what you hear in your head. It becomes notes on an instrument you choose, and you can put right whatever came out differently."));
      var sp = el("div", "sp-frow"); sp.appendChild(el("span", "st-l", "How fast"));
      var sg = seg([[72, "Slow"], [96, "Medium"], [120, "Quick"], [0, "Not sure"]], UI.startTempo === undefined ? 0 : UI.startTempo, function(v){ v = +v; if(v){ S.tempo = v; touch(); } UI.startTempo = v; sg.set(v); phBars(); }, "How fast");
      sp.appendChild(sg); box.appendChild(sp);
      var ways = el("div", "sp-ways");
      function way(id, title, text, fn){ var b = btn("st-way", null, "", fn); b.id = id; b.appendChild(el("b", "", title)); b.appendChild(el("span", "", text)); ways.appendChild(b); }
      way("spway-hum", "Hum a part", "A bass line, a melody, a riff. It becomes notes on an instrument.", function(){ phAddHum(); });
      way("spway-drums", "Drums by feel", "Pop, ballad, soul, bossa and more: a beat to sing over.", function(){ phDrumsAdd(); });
      way("spway-chords", "Chords first", "Choose chords bar by bar; a piano or a guitar plays them.", function(){ phGo("chords"); });
      way("spway-voice", "Record my voice", "Sing; add the instruments afterwards.", function(){ phAddVoice(); });
      box.appendChild(ways);
    }
    function phArrTap(p){
      var host = UI.e.tl, sl = host.scrollLeft, st = host.scrollTop, bt = barTicks(), tick = arrTick(p.x, sl);
      if(p.y < ARR.rulerH){ setPos(Math.max(0, arrSnap(tick))); return; }
      if(p.y < ARR.rulerH + ARR.secH){
        var sq = secAt(p, sl);
        if(sq){ UI.sel.section = sq.q.id; refresh(); sectionMenu(null, sq.q.id); }
        else { var q = addSection(undefined, Math.max(0, Math.floor(tick / bt))); if(q){ commit("add section " + q.name); UI.sel.section = q.id; refresh(); tell("Section “" + q.name + "”. Tap it to rename it, make copies of it or move it."); } }
        return;
      }
      if(p.y < arrTop()){ CH.bar = Math.max(0, Math.floor(tick / bt)); CH.half = 0; phGo("chords"); return; }
      var hit = regionAt(p, sl, st); if(!hit) return;
      if(!hit.r){ select(hit.t.id, null); setPos(Math.max(0, Math.floor(tick / bt) * bt)); return; }
      select(hit.t.id, hit.r.id); phPartSheet();
    }
    function phRecord(){
      if(recordingNow()){ if(REC_UI) REC_UI.stop(); else stopAnyRecording(); return; }
      var t = selTrack();
      if(!S.tracks.length || !t){ phAddTrack(); return; }
      if(t.kind === "inst") humSheet(t.id); else if(t.kind === "audio") recordAudio(t.id); else phFeelSheet(t.id);
    }
    function phAddHum(){ instBrowser(null, null, { kind:"inst", then:function(t){ if(PH.screen !== "song") phGo("song"); humSheet(t.id); }, title:"Which instrument plays what you hum?" }); }
    function phAddVoice(){
      var t = S.tracks.filter(function(x){ return x.kind === "audio" && !x.regions.length; })[0];
      if(!t){ t = addTrack("audio", "", "Voice"); if(!t) return; commit("add a voice track"); }
      select(t.id, null); recordAudio(t.id);
    }
    function phDrumsAdd(){
      var t = addTrack("drums", defaultKit(), "Drums"); if(!t) return;
      var bt = barTicks(), feel = beatPlan().compound ? "ballad68" : "pop", spans = [], keep = DG.grid;
      // a part for each section, so that each can have its own feel and its own weight; else one part for what there is
      if(S.sections.length) S.sections.forEach(function(q){ spans.push([q.bar * bt, q.len * bt]); });
      else spans.push([0, clamp(Math.ceil(songTicks() / bt), 4, 64) * bt]);
      spans.forEach(function(sp){ var r = addRegion(t, sp[0], sp[1], []); drumPreset(r, feel, 0, false); });
      DG.grid = keep;
      commit("add drums"); engSync(); select(t.id, t.regions[0].id); refresh(true);
      phFeelSheet(t.id);
    }
    function phAddTrack(){
      if(S.tracks.length >= MAXTRACKS){ tell("A song has room for " + MAXTRACKS + " tracks. Remove one to add another."); return; }
      sheet("Add a track", function(body, close){
        var ways = el("div", "sp-ways");
        function way(id, title, text, fn){ var b = btn("st-way", null, "", function(){ close(); fn(); }); b.id = id; b.appendChild(el("b", "", title)); b.appendChild(el("span", "", text)); ways.appendChild(b); }
        way("spadd-hum", "Hum a part", "Hum or sing it; an instrument you choose plays it.", phAddHum);
        way("spadd-chords", "Follow the chords", "A piano, a guitar, strings or a bass plays the song’s chords in a style.", function(){ phFollowSheet(); });
        way("spadd-drums", "Drums by feel", "Pick a feel; change any hit afterwards.", phDrumsAdd);
        way("spadd-voice", "Record my voice", "Sing over the song. Each take is kept.", phAddVoice);
        body.appendChild(ways);
        phList(body, [{ t:"An instrument to write notes on by hand", d:"Tap notes into the grid", run:function(){
          instBrowser(null, null, { kind:"inst", title:"Which instrument?", then:function(t){ var bt = barTicks(), r = addRegion(t, Math.floor(TR.pos / bt) * bt, bt * 4, []); commit("new part"); select(t.id, r.id); phGo("edit", { tab:"notes" }); } });
        } }], close);
      }, { id:"spaddsheet" });
    }
    // an instrument that plays the song's chords
    function phFollowSheet(trackId){
      var t0 = trackId ? trackById(trackId) : null;
      if(!S.chords.length){
        sheet("Follow the chords", function(body, close){
          body.appendChild(line("st-lead", "The song has no chords yet. Choose them bar by bar, or have them suggested for a part you hummed; then an instrument can play them."));
          phList(body, [{ t:"Choose the chords", primary:true, go:true, run:function(){ phGo("chords"); } }], close);
        }, { id:"spfollow" });
        return;
      }
      var fam = "keys", style = "";
      sheet(t0 ? "How “" + t0.name + "” plays the chords" : "Follow the chords", function(body, close){
        function paint(){
          body.textContent = "";
          var probe = t0 || { inst:defaultInst(fam), kind:"inst", oct:0 }, sts = stylesFor(probe);
          if(!sts.some(function(x){ return x[0] === style; })) style = t0 && t0.regions.filter(function(r){ return r.gen; })[0] ? t0.regions.filter(function(r){ return r.gen; })[0].gen.style : styleDefault(probe);
          if(!sts.some(function(x){ return x[0] === style; })) style = styleDefault(probe);
          if(!t0){
            body.appendChild(el("div", "sp-listh", "Instrument"));
            var fs = seg([["keys", "Piano"], ["guitars", "Guitar"], ["strings", "Strings"], ["bass", "Bass"]], fam, function(v){ fam = v; style = ""; paint(); }, "Instrument"); fs.classList.add("sp-seg4"); body.appendChild(fs);
            body.appendChild(line("st-note", instName(defaultInst(fam)) + ". Its sheet has every other instrument once the track is there."));
          }
          body.appendChild(el("div", "sp-listh", "Style"));
          var grid = el("div", "sp-opts");
          sts.forEach(function(x){ var b = tbtn("", x[1], "", function(){ style = x[0]; paint(); }); b.setAttribute("aria-pressed", x[0] === style ? "true" : "false"); grid.appendChild(b); });
          body.appendChild(grid);
          var acts = el("div", "st-acts");
          acts.appendChild(tbtn("primary big", t0 ? "Use this style" : "Add the track", "", function(){
            close();
            if(t0){ var n = 0; t0.regions.forEach(function(r){ if(r.gen){ r.gen.style = style; n++; } }); if(n){ chordFollow(); commit("style: " + styleName(style)); } else chordsWrite(t0.id, style); }
            else chordsWrite("new:" + fam, style);
            if(PH.screen !== "song") phGo("song"); else refresh(true);
          }));
          body.appendChild(acts);
        }
        paint();
      }, { id:"spfollow" });
    }
    function phTrackSheet(id){
      var t = trackById(id); if(!t) return;
      sheet(t.name, function(body, close, sh){
        function paint(){
          t = trackById(id); if(!t){ close(); return; }
          body.textContent = "";
          var d = ENG.inst[t.inst], gen = t.regions.filter(function(r){ return !!r.gen; })[0], reg = phRegionNear(t);
          var main = el("div", "sp-two");
          if(t.kind === "inst") main.appendChild(tbtn("primary big", t.regions.length ? "Hum another part" : "Hum a part", "", function(){ close(); humSheet(t.id); }));
          else if(t.kind === "audio") main.appendChild(tbtn("primary big", t.regions.length ? "Record another take" : "Record", "", function(){ close(); recordAudio(t.id); }));
          else main.appendChild(tbtn("primary big", "Choose a feel", "", function(){ close(); phFeelSheet(t.id); }));
          var ed = tbtn("big", t.kind === "audio" ? "Edit the recording" : t.kind === "drums" ? "Edit the hits" : "Edit the notes", "", function(){
            close(); var r = phRegionNear(t);
            if(!r && t.kind !== "audio"){ var bt = barTicks(); r = addRegion(t, Math.floor(TR.pos / bt) * bt, bt * 4, []); commit("new part"); }
            if(r){ select(t.id, r.id); phGo("edit", { tab:t.kind === "drums" ? "drums" : t.kind === "audio" ? "take" : "notes" }); }
          });
          ed.id = "sptredit"; ed.disabled = t.kind === "audio" && !reg; main.appendChild(ed); body.appendChild(main);
          var rows = [];
          if(t.kind !== "audio") rows.push({ t:"Instrument", v:instName(t.inst) + (d && d.state === "loading" ? " (loading)" : ""), go:true, id:"sptrinst", run:function(){ instBrowser(null, t.id); } });
          if(t.kind === "inst" && (gen || S.chords.length)) rows.push({ t:gen ? "Style" : "Play the song’s chords", v:gen ? styleName(gen.gen.style) : "", go:true, run:function(){ phFollowSheet(t.id); } });
          phList(body, rows, close);
          body.appendChild(phSlider("Level", 0, 125, 1, function(){ return Math.round(t.vol * 100); }, function(v){ t.vol = v / 100; engSync(); }, function(){ return volText(t.vol); }, function(){ commit("volume of " + t.name, true); }, "sptrvol"));
          body.appendChild(phSlider("Left or right", -50, 50, 1, function(){ return Math.round(t.pan * 50); }, function(v){ t.pan = Math.abs(v) < 4 ? 0 : v / 50; engSync(); }, function(){ return panText(t.pan); }, function(){ commit("pan of " + t.name, true); }));
          var ms = el("div", "sp-two");
          var mb = tbtn("big", "Mute", "", function(){ t.mute = !t.mute; commit(t.mute ? "mute " + t.name : "unmute " + t.name, true); engSync(); refresh(); paint(); }); mb.setAttribute("aria-pressed", t.mute ? "true" : "false"); mb.id = "sptrmute";
          var sb = tbtn("big", "Solo", "", function(){ t.solo = !t.solo; commit(t.solo ? "solo " + t.name : "end solo of " + t.name, true); engSync(); refresh(); paint(); }); sb.setAttribute("aria-pressed", t.solo ? "true" : "false"); sb.id = "sptrsolo";
          ms.appendChild(mb); ms.appendChild(sb); body.appendChild(ms);
          var more = [{ t:"Rename", run:function(){ askText(null, "Track name", t.name, function(v){ t.name = v.slice(0, 32); commit("rename track"); }); } }];
          if(t.kind === "inst"){
            more.push({ t:"One octave higher", off:t.oct >= 3, stay:true, run:function(){ t.oct++; commit("octave of " + t.name); paint(); } });
            more.push({ t:"One octave lower", off:t.oct <= -3, stay:true, run:function(){ t.oct--; commit("octave of " + t.name); paint(); } });
          }
          more.push({ t:"Delete track", danger:true, sure:"Delete this track?", id:"sptrdel", run:function(){ var i = S.tracks.indexOf(t); if(i < 0) return; S.tracks.splice(i, 1); gcPats(); selFix(); commit("delete track " + t.name); engSync(); if(MOB.lean) unloadUnused(); refresh(true); tell("Track deleted. Undo brings it back."); } });
          phList(body, more, close);
        }
        paint();
      }, { id:"sptrack", onClose:function(){ setTimeout(function(){ var h = UI.e.th && UI.e.th[id]; if(h && !UI.pops.length && (!document.activeElement || document.activeElement === document.body)){ try { h.el.querySelector("button").focus({ preventScroll:true }); } catch(e){} } }, 0); } });
    }
    // the part of a track under the playhead, else its first
    function phRegionNear(t){
      var r = t.regions.filter(function(x){ return x.s <= TR.pos && x.s + x.l > TR.pos; })[0];
      if(!r && UI.sel.region){ var f = findRegion(UI.sel.region); if(f && f.t === t) r = f.r; }
      return r || t.regions[0] || null;
    }
    function phPartSheet(){
      var f = selRegion(); if(!f) return;
      var t = f.t, r = f.r, bt = barTicks(), kind = t.kind;
      sheet(t.name + ", bars " + (Math.floor(r.s / bt) + 1) + " to " + Math.ceil((r.s + r.l) / bt), function(body, close){
        function free(a, b){ return !t.regions.some(function(x){ return x !== r && x.s < b && x.s + x.l > a; }) && a >= 0; }
        var two = el("div", "sp-two");
        var eb = tbtn("primary big", kind === "audio" ? "Edit the recording" : kind === "drums" ? "Edit the hits" : "Edit the notes", "", function(){ close(); phGo("edit", { tab:kind === "drums" ? "drums" : kind === "audio" ? "take" : "notes" }); }); eb.id = "sppartedit";
        var hb = tbtn("big", "Hear it", "", function(){ close(); silentTip(); S.loop = { on:true, a:Math.floor(r.s / bt) * bt, b:Math.ceil((r.s + r.l) / bt) * bt }; touch(); transportPlay({ from:S.loop.a }); refresh(); tell("Playing this part round and round. Loop, under the three dots, turns that off."); });
        two.appendChild(eb); two.appendChild(hb); body.appendChild(two);
        var items = [];
        if(r.hum) items.push({ t:"Hum it again", d:"Record this part once more, in the same place", run:function(){ humSheet(t.id, { at:r.s, bars:Math.round(r.l / bt) }); } });
        if(kind === "drums") items.push({ t:"Feel and weight", v:r.drum && r.drum.feel ? feelName(r.drum.feel) : "", go:true, run:function(){ phFeelSheet(t.id); } });
        items.push({ t:"Duplicate", d:"A copy straight after it", off:!free(r.s + r.l, r.s + r.l * 2), run:function(){ regionDuplicate(false); } });
        if(kind !== "audio") items.push({ t:"Longer by a bar", d:"The part repeats to fill it", off:!free(r.s + r.l, r.s + r.l + bt), stay:true, run:function(){ if(free(r.s + r.l, r.s + r.l + bt)){ r.l += bt; growBars(); commit("lengthen region"); } } });
        items.push({ t:"Shorter by a bar", off:r.l <= bt, stay:true, run:function(){ if(r.l > bt){ r.l -= bt; commit("shorten region"); } } });
        items.push({ t:"Earlier by a bar", off:!free(r.s - bt, r.s), stay:true, run:function(){ if(free(r.s - bt, r.s)){ r.s -= bt; sortRegions(t); commit("move region"); scrollToTick(r.s); } } });
        items.push({ t:"Later by a bar", off:!free(r.s + r.l, r.s + r.l + bt), stay:true, run:function(){ if(free(r.s + r.l, r.s + r.l + bt)){ r.s += bt; sortRegions(t); growBars(); commit("move region"); scrollToTick(r.s); } } });
        items.push({ t:"Split at the playhead", off:!(TR.pos > r.s && TR.pos < r.s + r.l), run:function(){ regionSplit(); } });
        items.push({ t:"Delete", danger:true, sure:"Delete this part?", id:"sppartdel", run:function(){ regionDelete(); tell("Part deleted. Undo brings it back."); } });
        phList(body, items, close);
      }, { id:"sppart" });
    }
    function phSongMenu(){
      sheet(S.name, function(body, close){
        function paint(){
          body.textContent = "";
          phList(body, [
            { t:"Add a section", d:"Mark a part of the song: Intro, Verse, Chorus", run:function(){ var q = addSection(undefined, sectionBarAtPlayhead()); if(q){ commit("add section " + q.name); UI.sel.section = q.id; refresh(); tell("Section “" + q.name + "” added. Tap it above the tracks to rename, copy or move it."); } else tell("There is no room for a section there."); } },
            { t:"Loop", d:"Repeat a stretch of the song", on:S.loop.on, stay:true, run:function(){ S.loop.on = !S.loop.on; if(S.loop.on && S.loop.b <= S.loop.a){ S.loop.a = 0; S.loop.b = barTicks() * 4; } touch(); refresh(); paint(); } },
            { t:"Show the whole song", run:function(){ if(PH.screen !== "song") phGo("song"); setTimeout(arrFit, 60); } },
            { t:"Save a version", d:"Keep the song as it is now, to come back to", run:function(){ askText(null, "Name for this version", "Version " + fmtWhen(Date.now()), function(v){ saveVersion(v).then(function(){ tell("Version kept: “" + v + "”."); }); }); } },
            { t:"Versions", go:true, run:function(){ versionsSheet(); } },
            { t:"Rename the song", run:function(){ phTitleTap(); } },
            { t:"Help", go:true, run:function(){ phHelp(); } },
            { t:"Phone check", go:true, run:function(){ phCheck(); } }
          ], close);
        }
        paint();
      }, { id:"spsongmenu" });
    }
    function phTempoSheet(){
      var taps = [];
      sheet("Tempo and beat", function(body, close){
        function setT(v){ var had = hasAudio(); if(setTempo(v)){ commit("tempo " + S.tempo, true); if(had) tell("Recorded audio keeps its own speed, so it no longer lines up with the bars as before."); } paint(); phBars(); }
        var big = el("div", "sp-tempo"), num = el("b", "", ""), row = el("div", "sp-tempobtns");
        [[-5, "−5"], [-1, "−1"], [1, "+1"], [5, "+5"]].forEach(function(d){ row.appendChild(tbtn("big", d[1], "", function(){ setT(S.tempo + d[0]); })); });
        big.appendChild(num); big.appendChild(el("span", "", "beats per minute")); body.appendChild(big); body.appendChild(row);
        var tap = tbtn("big sp-tap", "Tap the beat here", "", function(){
          var now = performance.now(); if(taps.length && now - taps[taps.length - 1] > 2500) taps = [];
          taps.push(now); if(taps.length > 8) taps.shift();
          if(taps.length >= 3) setT(clamp(Math.round(60000 / ((taps[taps.length - 1] - taps[0]) / (taps.length - 1))), 40, 220));
        });
        tap.id = "sptap"; body.appendChild(tap);
        body.appendChild(el("div", "sp-listh", "Beats in a bar"));
        var sig = seg([["4/4", "4/4"], ["3/4", "3/4"], ["6/8", "6/8"], ["2/4", "2/4"], ["5/4", "5/4"], ["12/8", "12/8"]], S.sig[0] + "/" + S.sig[1], function(v){ setSig(v); sig.set(v); }, "Beats in a bar"); sig.classList.add("sp-seg6"); body.appendChild(sig);
        body.appendChild(el("div", "sp-listh", "Click"));
        var opts = el("div");
        function paint(){
          num.textContent = String(S.tempo);
          opts.textContent = "";
          phList(opts, [{ t:"Click while the song plays", on:S.metro, stay:true, run:function(){ S.metro = !S.metro; touch(); paint(); } }]);
          var cr = el("div", "sp-frow"); cr.appendChild(el("span", "st-l", "Count-in before recording"));
          var cs = seg([[0, "None"], [1, "1 bar"], [2, "2 bars"]], S.countIn, function(v){ S.countIn = +v; touch(); cs.set(v); }, "Count-in"); cr.appendChild(cs); opts.appendChild(cr);
        }
        body.appendChild(opts); paint();
      }, { id:"sptemposheet" });
    }
