    // ---------- Studio: the editor panel (tools for each tab, drums, recordings, chords, mixer) ----------
    var DG = { rows:[], view:null, host:null, ppt:0.16, rowH:22, nameW:104, rulerH:20, grid:PPQ / 4, level:96, phTick:null, forRegion:null };
    var TK = { view:null, host:null, ppt:0.08, phTick:null };
    var CH = { bar:0, half:0, track:null, style:"", from:null, alts:null };
    var MX = { strips:{}, sig:"" };
    var toolSig = "";
    function buildEditors(){
      var E = UI.e, b = E.edbody;
      E.rollWrap = el("div", "st-rollwrap"); E.kbHost = el("div", "st-kbhost"); E.kbHost.hidden = true;
      ROLL.host = el("div", "st-roll"); ROLL.host.tabIndex = 0; ROLL.host.id = "stroll"; ROLL.host.setAttribute("aria-label", "Note editor. Arrow keys move the selected notes; the Edit menu lists everything that can be done.");
      E.rollWrap.appendChild(ROLL.host); E.rollWrap.appendChild(E.kbHost); b.appendChild(E.rollWrap);
      ROLL.view = CanvasView(ROLL.host, { content:rollContent, paint:rollPaint, down:rollDown, hover:rollHover, dbl:rollDbl, zoom:rollZoom, tap:function(p, e){ if(phoneOn()) phRollTap(p, e); } });
      DG.host = el("div", "st-drum"); DG.host.tabIndex = 0; DG.host.id = "stdrum"; DG.host.setAttribute("aria-label", "Drum grid"); b.appendChild(DG.host);
      DG.view = CanvasView(DG.host, { content:drumContent, paint:drumPaint, down:drumDown, hover:function(p){ return p.y > DG.rulerH ? "pointer" : ""; }, tap:function(p, e){ if(phoneOn()) phDrumTap(p, e); }, zoom:function(f, p){ var u = (p.x - DG.nameW + DG.host.scrollLeft) / DG.ppt; DG.ppt = clamp(DG.ppt * f, 0.04, 0.6); DG.view.paint(); DG.host.scrollLeft = Math.max(0, u * DG.ppt + DG.nameW - p.x); DG.view.ask(); } });
      TK.host = el("div", "st-take"); TK.host.tabIndex = 0; TK.host.id = "sttake"; TK.host.setAttribute("aria-label", "Recording editor"); b.appendChild(TK.host);
      TK.view = CanvasView(TK.host, { content:takeContent, paint:takePaint, down:takeDown, hover:takeHover, tap:function(p, e){ if(phoneOn()) phTakeTap(p, e); }, zoom:function(f, p){ var f0 = selRegion(); if(!f0) return; var u = (p.x + TK.host.scrollLeft) / TK.ppt; TK.ppt = clamp(TK.ppt * f, 0.01, 1); TK.view.paint(); TK.host.scrollLeft = Math.max(0, u * TK.ppt - p.x); TK.view.ask(); } });
      E.chordsEl = el("div", "st-chords"); E.chordsEl.id = "stchords"; b.appendChild(E.chordsEl);
      E.lyricsEl = el("div", "st-lyrics"); E.lyricsEl.id = "stlyrics"; b.appendChild(E.lyricsEl);
      E.mixEl = el("div", "st-mix"); E.mixEl.id = "stmix"; b.appendChild(E.mixEl);
    }
    function drumRegion(){ var f = selRegion(); return f && f.t.kind === "drums" ? f : null; }
    function takeRegion(){ var f = selRegion(); return f && f.t.kind === "audio" ? f : null; }
    function drumAsk(){ if(DG.view && UI.tab === "drums") DG.view.ask(); }
    function takeAsk(){ if(TK.view && UI.tab === "take") TK.view.ask(); }
    function drumPlayhead(tick){ if(UI.tab === "drums" && DG.view){ DG.phTick = tick; DG.view.ask(); } }
    function takePlayhead(tick){ if(UI.tab === "take" && TK.view){ TK.phTick = tick; TK.view.ask(); } }
    function paintEditor(full){
      var E = UI.e; if(!E.edbody) return;
      var tab = UI.tab;
      Object.keys(E.tabB).forEach(function(k){ E.tabB[k].setAttribute("aria-selected", k === tab ? "true" : "false"); });
      E.rollWrap.hidden = tab !== "notes"; DG.host.hidden = tab !== "drums"; TK.host.hidden = tab !== "take"; E.chordsEl.hidden = tab !== "chords"; E.mixEl.hidden = tab !== "mixer"; E.lyricsEl.hidden = tab !== "lyrics";
      var fw = selRegion(), tw = selTrack();
      E.edWhat.textContent = tab === "mixer" || tab === "chords" || tab === "lyrics" ? "" : fw ? fw.t.name + ", bars " + (Math.floor(fw.r.s / barTicks()) + 1) + " to " + Math.ceil((fw.r.s + fw.r.l) / barTicks()) : tw ? tw.name : "";
      var fw = selRegion(), tw = selTrack();
      E.edWhat.textContent = tab === "mixer" || tab === "chords" || tab === "lyrics" ? "" : fw ? fw.t.name + ", bars " + (Math.floor(fw.r.s / barTicks()) + 1) + " to " + Math.ceil((fw.r.s + fw.r.l) / barTicks()) : tw ? tw.name : "";
      var f = selRegion(), sig = [tab, UI.sel.track, UI.sel.region, f && f.r.pat ? linkCount(f.r.pat) : 0, f && f.r.hum ? "h" : "", UI.kbd, S.tracks.length, tw && ENG.inst[tw.inst] ? ENG.inst[tw.inst].state : "", f && f.r.takes ? f.r.takes.length + ":" + f.r.act : ""].join("|");
      if(full || sig !== toolSig){ toolSig = sig; buildTools(); }
      paintEditorTools();
      paintHumbar();
      E.kbHost.hidden = !(UI.kbd && tab === "notes");
      if(!E.kbHost.hidden && (full || !E.kbHost.firstChild)) kbBuild(E.kbHost);
      if(tab === "notes"){ ROLL.phTick = TR.playing ? ROLL.phTick : null; ROLL.view.ask(); }
      else if(tab === "drums"){ DG.phTick = TR.playing ? DG.phTick : null; DG.view.ask(); }
      else if(tab === "take"){ TK.phTick = TR.playing ? TK.phTick : null; TK.view.ask(); }
      else if(tab === "chords") chordsPaint(full);
      else if(tab === "mixer") mixerPaint(full);
      else if(tab === "lyrics") lyricsPaint(full);
    }
    function sel(cls, options, value, title, fn){
      var s = el("select", "st-s " + (cls || "")); s.title = title || ""; s.setAttribute("aria-label", title || "");
      options.forEach(function(o){ var op = el("option", "", o[1]); op.value = o[0]; s.appendChild(op); });
      s.value = String(value); s.addEventListener("change", function(){ fn(s.value); });
      return s;
    }
    function lbl(text, term){ var s = el("span", "st-l", text); if(term){ var w = el("span", "st-lq"); w.appendChild(s); w.appendChild(helpDot(term)); return w; } return s; }
    function seg(items, cur, fn, label){
      var d = el("div", "st-seg"); d.setAttribute("role", "group"); if(label) d.setAttribute("aria-label", label);
      items.forEach(function(it){ var b = tbtn("", it[1], it[2] || "", function(){ fn(it[0]); }); b.dataset.v = it[0]; b.setAttribute("aria-pressed", String(it[0]) === String(cur) ? "true" : "false"); d.appendChild(b); });
      d.set = function(v){ Array.prototype.forEach.call(d.children, function(b){ b.setAttribute("aria-pressed", b.dataset.v === String(v) ? "true" : "false"); }); };
      return d;
    }
    function partLenTools(box, f){
      var p = patOf(f.r), bars = Math.round(p.len / barTicks() * 100) / 100;
      var g = el("div", "st-grp");
      g.appendChild(lbl("Part"));
      g.appendChild(tbtn("quiet", "−", "One bar shorter", function(){ partLength(-1); }));
      g.appendChild(el("span", "st-val", bars + (bars === 1 ? " bar" : " bars")));
      g.appendChild(tbtn("quiet", "+", "One bar longer", function(){ partLength(1); }));
      box.appendChild(g);
      if(linkCount(f.r.pat) > 1){
        var lk = el("div", "st-grp"); lk.appendChild(el("span", "st-badge", "Linked × " + linkCount(f.r.pat))); lk.appendChild(helpDot("linked"));
        lk.appendChild(tbtn("quiet", "Make independent", "Give this region its own copy of the notes", function(){ unlinkRegion(f.r); commit("make region independent"); refresh(true); }));
        box.appendChild(lk);
      }
    }
    function buildTools(){
      var E = UI.e, box = E.edtools, tab = UI.tab, g; box.textContent = ""; E.tool = {};
      if(tab === "notes"){
        var f = rollRegion();
        g = el("div", "st-grp");
        E.tool.pointer = ibtn("", "pointer", "Pointer", "Pointer: select, move and stretch notes; double-click adds one (1)", function(){ ROLL.tool = "pointer"; paintEditorTools(); });
        E.tool.pencil = ibtn("", "pencil", "Pencil", "Pencil: press and pull to draw a note; click a note to remove it (2)", function(){ ROLL.tool = "pencil"; paintEditorTools(); });
        g.appendChild(E.tool.pointer); g.appendChild(E.tool.pencil); box.appendChild(g);
        g = el("div", "st-grp"); g.appendChild(lbl("Snap", "snap"));
        E.tool.snap = sel("", [["auto", "Auto"], [PPQ, "1/4"], [PPQ / 2, "1/8"], [PPQ / 4, "1/16"], [PPQ / 8, "1/32"], [PPQ / 3, "1/8 triplet"], [PPQ / 6, "1/16 triplet"], [0, "Off"]], ROLL.snap, "Snap: what notes land on when moved or drawn", function(v){ ROLL.snap = v === "auto" ? "auto" : +v; rollAsk(); });
        g.appendChild(E.tool.snap); box.appendChild(g);
        g = el("div", "st-grp");
        E.tool.quant = tbtn("", "Quantise", "Move the selected notes (or all of them) onto the grid", function(){
          popMenu(E.tool.quant, [{ h:"Move note starts onto the grid" }, { t:"All the way", k:"Q", run:function(){ rollDo("quantise", { strength:1 }); } }, { t:"Most of the way (75%)", run:function(){ rollDo("quantise", { strength:0.75 }); } }, { t:"Half way (50%)", run:function(){ rollDo("quantise", { strength:0.5 }); } }]);
        });
        g.appendChild(E.tool.quant); g.appendChild(helpDot("quantise"));
        E.tool.edit = tbtn("", "Edit", "Everything that can be done to the selected notes", function(){ popMenu(E.tool.edit, editMenu()); }); E.tool.edit.id = "stedit";
        g.appendChild(E.tool.edit); box.appendChild(g);
        g = el("div", "st-grp");
        E.tool.ghost = tbtn("", "Other tracks", "Show the notes of the other instrument tracks faintly behind these", function(){ ROLL.ghost = !ROLL.ghost; paintEditorTools(); rollAsk(); });
        E.tool.keysnap = tbtn("", "Stay in key", "New and moved notes land on notes of the song’s key", function(){ if(!scaleOf()){ tell("The song has no key yet. Choose one with the Key button at the top."); return; } ROLL.keySnap = !ROLL.keySnap; paintEditorTools(); });
        E.tool.kbd = ibtn("", "keys", "Keyboard", "Play notes from the computer keyboard or the screen", function(){ kbToggle(); }); E.tool.kbd.id = "stkbd";
        g.appendChild(E.tool.ghost); g.appendChild(E.tool.keysnap); g.appendChild(E.tool.kbd); box.appendChild(g);
        if(f) partLenTools(box, f);
        box.appendChild(el("span", "st-flex"));
        g = el("div", "st-grp");
        g.appendChild(tbtn("quiet", "−", "Zoom out (Ctrl + wheel, or pinch)", function(){ rollZoom(1 / 1.3, { x:ROLL.host.clientWidth / 2, y:0 }, "x"); }));
        g.appendChild(tbtn("quiet", "+", "Zoom in (Ctrl + wheel, or pinch)", function(){ rollZoom(1.3, { x:ROLL.host.clientWidth / 2, y:0 }, "x"); }));
        g.appendChild(tbtn("quiet", "Fit", "Show the whole part (F)", function(){ rollFit(); }));
        box.appendChild(g);
      } else if(tab === "drums"){
        var fd = drumRegion();
        if(!fd) return;
        var dr = fd.r.drum || {};
        g = el("div", "st-grp"); g.appendChild(lbl("Feel"));
        E.tool.feel = sel("", [["", "Choose…"]].concat(FEELS.map(function(x){ return [x.id, x.name]; })), dr.feel || "", "A drum pattern to start from", function(v){ if(v){ drumPreset(fd.r, v, 0, false); commit("drum feel: " + feelName(v)); refresh(true); } });
        g.appendChild(E.tool.feel);
        E.tool.vari = seg([[0, "A"], [1, "B"], [2, "C"]], dr.feel ? dr.vari || 0 : -1, function(v){ if(!fd.r.drum || !fd.r.drum.feel){ tell("Choose a feel first."); return; } drumPreset(fd.r, fd.r.drum.feel, +v, !!fd.r.drum.fill); commit("drum variation"); refresh(true); }, "Variation");
        g.appendChild(E.tool.vari);
        E.tool.fill = tbtn("", "Fill", "End the part with a drum fill in its last bar", function(){ if(!fd.r.drum || !fd.r.drum.feel){ tell("Choose a feel first."); return; } drumPreset(fd.r, fd.r.drum.feel, fd.r.drum.vari || 0, !fd.r.drum.fill); commit(fd.r.drum.fill ? "add a drum fill" : "remove the drum fill"); refresh(true); });
        g.appendChild(E.tool.fill); box.appendChild(g);
        g = el("div", "st-grp");
        g.appendChild(tbtn("", "Busier", "Add a layer: more hats, soft snare notes, an extra kick", function(){ if(drumDensity(fd, 1)){ commit("busier drums"); } else tell("That is as busy as this gets. Add hits by hand on the grid."); }));
        g.appendChild(tbtn("", "Sparser", "Take a layer away", function(){ if(drumDensity(fd, -1)){ commit("sparser drums"); } else tell("There is nothing left to take away but the main hits."); }));
        g.appendChild(tbtn("", "Humanise", "Small differences in timing and loudness from hit to hit, as a drummer has", function(){ drumHumanise(fd); commit("humanise drums"); }));
        box.appendChild(g);
        g = el("div", "st-grp"); g.appendChild(lbl("Hit", "velocity"));
        E.tool.level = seg([[52, "Soft", "A soft, ghost hit"], [96, "Normal"], [120, "Accent", "A hard hit"]], DG.level, function(v){ DG.level = +v; E.tool.level.set(v); }, "How hard new hits are"); g.appendChild(E.tool.level); box.appendChild(g);
        g = el("div", "st-grp"); g.appendChild(lbl("Grid"));
        g.appendChild(sel("", [[PPQ / 2, "1/8"], [PPQ / 4, "1/16"], [PPQ / 3, "1/8 triplet"], [PPQ / 8, "1/32"]], DG.grid, "The size of one step", function(v){ DG.grid = +v; drumAsk(); })); box.appendChild(g);
        g = el("div", "st-grp"); g.appendChild(lbl("Swing", "swing"));
        E.tool.swing = el("input", "st-range"); E.tool.swing.type = "range"; E.tool.swing.min = 0; E.tool.swing.max = 60; E.tool.swing.value = Math.round(S.swing * 100); E.tool.swing.title = "Swing for the whole song"; E.tool.swing.setAttribute("aria-label", "Swing");
        E.tool.swing.addEventListener("input", function(){ S.swing = +E.tool.swing.value / 100; });
        E.tool.swing.addEventListener("change", function(){ commit("swing " + Math.round(S.swing * 100) + "%", true); });
        g.appendChild(E.tool.swing);
        g.appendChild(sel("", [[PPQ / 2, "on 1/8"], [PPQ / 4, "on 1/16"]], S.swingUnit, "Which notes swing", function(v){ S.swingUnit = +v; commit("swing grid", true); })); box.appendChild(g);
        partLenTools(box, fd);
        if(kitExtras(fd.t) || DG.all){ E.tool.allp = tbtn("", "All pieces", "Show a row for every piece this kit has", function(){ DG.all = !DG.all; paintEditorTools(); drumAsk(); }); box.appendChild(E.tool.allp); }
        box.appendChild(el("span", "st-flex"));
        E.tool.tap = tbtn("", "Tap a rhythm", "Record a rhythm by tapping: F is the kick, J the snare, K the hat (or tap the names on the left)", function(){ if(recordingNow()) stopAnyRecording(); else tapStart(fd.t.id); });
        E.tool.tap.id = "sttap2"; box.appendChild(E.tool.tap);
      } else if(tab === "take"){
        var ft = takeRegion(), tk = selTrack();
        if(ft){
          var r = ft.r;
          if(r.takes.length > 1){
            g = el("div", "st-grp"); g.appendChild(lbl("Take"));
            g.appendChild(sel("", r.takes.map(function(id, i){ return [i, "Take " + (i + 1)]; }), r.act, "Which take plays", function(v){ r.act = +v; loadTakes().then(function(){ ARR.view.ask(); takeAsk(); }); commit("choose take " + (r.act + 1)); }));
            g.appendChild(tbtn("quiet", "Delete take", "Remove this take from the region", function(){ r.takes.splice(r.act, 1); r.act = Math.max(0, r.act - 1); commit("delete a take"); refresh(true); }));
            box.appendChild(g);
          }
          g = el("div", "st-grp"); g.appendChild(lbl("Level"));
          var gn = el("input", "st-range"); gn.type = "range"; gn.min = -24; gn.max = 12; gn.step = 0.5; gn.value = r.gain || 0; gn.title = "Louder or quieter, in decibels"; gn.setAttribute("aria-label", "Level of this recording");
          var gv = el("span", "st-val", ((r.gain || 0) > 0 ? "+" : "") + (r.gain || 0) + " dB");
          gn.addEventListener("input", function(){ r.gain = +gn.value; gv.textContent = (r.gain > 0 ? "+" : "") + r.gain + " dB"; takeAsk(); ARR.view.ask(); });
          gn.addEventListener("change", function(){ commit("level of a recording", true); });
          g.appendChild(gn); g.appendChild(gv); box.appendChild(g);
          g = el("div", "st-grp");
          g.appendChild(tbtn("", "Split", "Cut the recording in two at the playhead", function(){ regionSplit(); }));
          g.appendChild(tbtn("", "Fade in", "A short fade at the start (drag the corner on the picture to change it)", function(){ r.fi = r.fi ? 0 : Math.min(0.5, tickSec(r.l) / 4); commit("fade in"); }));
          g.appendChild(tbtn("", "Fade out", "A fade at the end (drag the corner on the picture to change it)", function(){ r.fo = r.fo ? 0 : Math.min(1.5, tickSec(r.l) / 3); commit("fade out"); }));
          box.appendChild(g);
          g = el("div", "st-grp");
          E.tool.tonotes = tbtn("", "Turn this take into notes", "Listen to this recording and write what was sung as notes for an instrument", function(){
            E.tool.tonotes.disabled = true; tell("Listening to the take…");
            takeToNotes(r.id, null).then(function(res){
              E.tool.tonotes.disabled = false;
              if(!res || !res.ok){ tell(res && res.why ? res.why : "No notes were found in that take."); return; }
              select(res.track, res.region, { open:true }); UI.tab = "notes"; refresh(true); tell(res.notes + " notes written on a new piano track. Choose another instrument on the track, and correct anything in the editor.");
              if(res.key && res.key.r > 0.55) UI.humSug = { region:res.region, key:res.key };
            }, function(){ E.tool.tonotes.disabled = false; tell("That take could not be read."); });
          });
          g.appendChild(E.tool.tonotes); box.appendChild(g);
        }
        box.appendChild(el("span", "st-flex"));
        if(tk && tk.kind === "audio"){
          E.tool.imp = tbtn("", "Bring in a sound file", "Put a WAV, MP3 or other sound file on this track at the playhead", function(){ pickFile("audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aif,.aiff", function(file){ tell("Reading " + file.name + "…"); audioImport(tk.id, file).then(function(r2){ if(r2){ select(tk.id, r2.id); tell("Placed at the playhead."); } }, function(e){ tell(e && e.message === "long" ? "That file is longer than ten minutes, which is more than a track here can hold." : "That file could not be read as sound."); }); }); });
          E.tool.recb = tbtn("st-recbtn", "Record", "Record your voice on this track from the playhead", function(){ if(recordingNow()) stopAnyRecording(); else recordAudio(tk.id); });
          box.appendChild(E.tool.imp); box.appendChild(E.tool.recb);
        }
      }
    }
    function editMenu(){
      var g = rollGrid() || PPQ / 4, n = ROLL.sel.length, none = !n;
      return [
        { h:n ? n + (n === 1 ? " note selected" : " notes selected") : "No notes selected" },
        { t:"Select all", k:"Ctrl+A", run:function(){ rollDo("all"); } },
        { t:"Duplicate", k:"Ctrl+D", off:none, run:function(){ rollDo("duplicate"); } },
        { t:"Copy", k:"Ctrl+C", off:none, run:function(){ rollDo("copy"); } },
        { t:"Paste at the playhead", k:"Ctrl+V", off:!ROLL.clip, run:function(){ rollDo("paste"); } },
        { t:"Delete", k:"Del", off:none, danger:true, run:function(){ rollDo("delete"); } },
        "-",
        { t:"Earlier by one step", k:"←", off:none, run:function(){ rollDo("nudge", -g); } }, { t:"Later by one step", k:"→", off:none, run:function(){ rollDo("nudge", g); } },
        { t:"Up a semitone", k:"↑", run:function(){ rollDo("transpose", 1); } }, { t:"Down a semitone", k:"↓", run:function(){ rollDo("transpose", -1); } },
        { t:"Up an octave", k:"Shift+↑", run:function(){ rollDo("transpose", 12); } }, { t:"Down an octave", k:"Shift+↓", run:function(){ rollDo("transpose", -12); } },
        { t:"Fit to the song’s key", run:function(){ rollDo("tokey"); } },
        "-",
        { t:"Split", off:none, title:"At the playhead if it crosses the note, otherwise in half", run:function(){ rollDo("split"); } },
        { t:"Join", off:n < 2, title:"Notes of the same pitch become one", run:function(){ rollDo("join"); } },
        { t:"Hold each note until the next (legato)", run:function(){ rollDo("legato"); } },
        { t:"Make each one step long", off:none, run:function(){ rollDo("length", g); } },
        "-",
        { t:"Louder", k:"+", run:function(){ rollDo("velocity", 10); } }, { t:"Softer", k:"−", run:function(){ rollDo("velocity", -10); } }
      ];
    }
    function paintEditorTools(){
      var T = UI.e.tool || {};
      if(T.pointer){ T.pointer.setAttribute("aria-pressed", ROLL.tool === "pointer" ? "true" : "false"); T.pencil.setAttribute("aria-pressed", ROLL.tool === "pencil" ? "true" : "false"); }
      if(T.ghost) T.ghost.setAttribute("aria-pressed", ROLL.ghost ? "true" : "false");
      if(T.keysnap) T.keysnap.setAttribute("aria-pressed", ROLL.keySnap && scaleOf() ? "true" : "false");
      if(T.kbd) T.kbd.setAttribute("aria-pressed", UI.kbd ? "true" : "false");
      if(T.fill){ var f = drumRegion(); T.fill.setAttribute("aria-pressed", f && f.r.drum && f.r.drum.fill ? "true" : "false"); }
      if(T.allp) T.allp.setAttribute("aria-pressed", DG.all ? "true" : "false");
      if(T.tap){ T.tap.textContent = NREC ? "Stop tapping" : "Tap a rhythm"; T.tap.dataset.on = NREC ? "true" : "false"; }
      if(T.recb){ T.recb.textContent = AREC ? "Stop" : "Record"; T.recb.dataset.on = AREC ? "true" : "false"; }
      if(phoneOn()) phBars();
    }

    // ---- the strip over the notes of a hummed part: hear it, and the three choices ----
    function paintHumbar(){
      var E = UI.e, f = rollRegion(), bar = E.humbar, show = UI.tab === "notes" && f && f.r.hum;
      bar.hidden = !show; if(!show){ bar.dataset.for = ""; return; }
      var r = f.r, h = r.hum, sug = UI.humSug && UI.humSug.region === r.id ? UI.humSug : null, sig = [r.id, h.timing, h.grid, h.pitch, h.octave, h.edited, sug ? JSON.stringify(sug.key || 0) + JSON.stringify(sug.tempo || 0) : "", audition ? audition.mode : "", keyName(S.key)].join("|");
      if(bar.dataset.for === sig) return; bar.dataset.for = sig; bar.textContent = "";
      function redo(label){ humRedo(r.id).then(function(res){ if(res){ commit(label); if(res.early) tell(res.early + (res.early === 1 ? " note was" : " notes were") + " sung before the part begins and left out."); } }); }
      bar.title = "This part came from your voice. These choices are worked out again from the same take.";
      var g = el("div", "st-grp"); g.appendChild(lbl("Hear"));
      var hear = seg([["voice", "My voice"], ["notes", "Notes"], ["both", "Both"]], audition && audition.region === r.id ? audition.mode : "", function(v){ if(audition && audition.mode === v){ auditionStop(); paintHumbar(); return; } humHear(r.id, v).then(function(){ bar.dataset.for = ""; paintHumbar(); paintBar(); }); }, "Hear");
      hear.id = "sthear"; g.appendChild(hear); bar.appendChild(g);
      g = el("div", "st-grp"); g.appendChild(lbl("Timing"));
      var tm = seg([["raw", "As hummed", "Every note starts exactly where you sang it"], ["feel", "Half way", "Note starts move half way to the grid: tidier, with your own feel kept"], ["tidy", "Tidy", "Note starts move to the nearest sensible step; lengths stay as sung"], ["strict", "Strict", "Starts and lengths both sit on the grid, as written music would"]], h.timing, function(v){ h.timing = v; redo("timing: " + v); }, "Timing");
      tm.id = "sttiming"; g.appendChild(tm);
      var gs = sel("", [[0, "Grid: auto"], [PPQ, "1/4"], [PPQ / 2, "1/8"], [PPQ / 4, "1/16"], [PPQ / 3, "1/8 triplet"], [PPQ / 6, "1/16 triplet"]], h.grid || 0, "The grid the timing choices use. Auto picks the coarsest one your notes sit on.", function(v){ h.grid = +v; redo("grid of the hummed part"); });
      gs.id = "sthumgrid"; gs.disabled = h.timing === "raw"; g.appendChild(gs); bar.appendChild(g);
      g = el("div", "st-grp"); g.appendChild(lbl("Pitch"));
      var pm = seg([["semi", "As hummed", "Each note is the nearest note to what you sang"], ["key", "Fit to key", "Notes outside the song’s key move to the nearest one inside it; they are marked with a corner"]], h.pitch, function(v){
        if(v === "key" && !scaleOf()){ tell("The song has no key yet. Choose one with the Key button at the top; the notes will then fit to it."); return; }
        h.pitch = v; redo("pitch: " + (v === "key" ? "fit to the key" : "as hummed")); }, "Pitch");
      pm.id = "stpitch"; g.appendChild(pm); bar.appendChild(g);
      g = el("div", "st-grp"); g.appendChild(lbl("Octave"));
      g.appendChild(tbtn("", "−", "One octave lower", function(){ h.octave = clamp(h.octave - 1, -4, 4); redo("octave lower"); }));
      g.appendChild(tbtn("", "+", "One octave higher", function(){ h.octave = clamp(h.octave + 1, -4, 4); redo("octave higher"); }));
      bar.appendChild(g);
      if(h.edited) bar.appendChild(el("span", "st-note", "Notes were changed by hand: a choice here writes them afresh from the humming."));
      bar.appendChild(el("span", "st-flex"));
      bar.appendChild(tbtn("", "Hum it again", "Record this part once more, in the same place", function(){ humSheet(f.t.id, { at:r.s, bars:Math.round(r.l / barTicks()) }); }));
      if(sug && (sug.key || sug.tempo)){
        var s2 = el("div", "st-sug"); s2.setAttribute("role", "status");
        if(sug.tempo){
          s2.appendChild(el("span", "", "The pulse of what you hummed is about " + sug.tempo.bpm + " BPM."));
          s2.appendChild(tbtn("primary", "Set the song to " + sug.tempo.bpm + " and line the notes up", "", function(){ var sg = sug.tempo; sug.tempo = null; humUseTempo(r.id, sg).then(function(){ refresh(true); }); }));
          s2.appendChild(tbtn("quiet", "Leave it", "", function(){ sug.tempo = null; bar.dataset.for = ""; paintHumbar(); }));
        } else if(sug.key){
          s2.appendChild(el("span", "", "This sounds like " + keyName(sug.key) + "."));
          s2.appendChild(tbtn("primary", "Use " + keyName(sug.key), "Set the song’s key. The grid then marks the notes that belong.", function(){ S.key = { root:sug.key.root, scale:sug.key.scale }; sug.key = null; commit("key: " + keyName(S.key)); refresh(true); }));
          if(sug.key.next) s2.appendChild(tbtn("", "Or " + keyName(sug.key.next), "", function(){ S.key = { root:sug.key.next.root, scale:sug.key.next.scale }; sug.key = null; commit("key: " + keyName(S.key)); refresh(true); }));
          s2.appendChild(tbtn("quiet", "No key", "", function(){ sug.key = null; bar.dataset.for = ""; paintHumbar(); }));
        }
        bar.appendChild(s2);
      }
    }

    // ---- drums: the grid ----
    function drumContent(){ var f = drumRegion(); DG.rows = f ? drumRows(f.t, patOf(f.r), DG.all) : DRUM_BASE; return { w:DG.nameW + (f ? rollLen(f) * DG.ppt : 0) + 40, h:DG.rulerH + DG.rows.length * DG.rowH + 8 }; }
    function drumPaint(c, w, h, sl, st){
      var C = colors(), f = drumRegion(), i, k, x, y;
      c.clearRect(0, 0, w, h); c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
      if(!f){ c.fillStyle = C.ink3; c.font = "500 12.5px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; var t0 = selTrack(); c.fillText(t0 && t0.kind === "drums" ? "Double-click the drum track’s lane above to start a region." : "Select a region of a drum track to see its hits here.", w / 2, h / 2); return; }
      var r = f.r, t = f.t, pat = patOf(r), L = rollLen(f), col = trackColor(t), bt = barTicks(), bq = beatTicks(), g = DG.grid, ppt = DG.ppt, NW = DG.nameW, RH = DG.rulerH, rowH = DG.rowH, base = r.s;
      if(DG.forRegion !== r.id){ DG.forRegion = r.id; DG.ppt = ppt = phoneOn() ? clamp(Math.max(30 / g, (DG.host.clientWidth - NW - 8) / bt), 0.05, 0.6) : clamp((DG.host.clientWidth - NW - 24) / Math.min(L, bt * 4), 0.05, 0.5); if(g * ppt < 9) DG.grid = g = PPQ / 2; }
      DG.rows = drumRows(t, pat, DG.all);
      DG.rowH = rowH = phoneOn() ? clamp(Math.floor((h - RH - 4) / Math.max(1, DG.rows.length)), 34, 46) : clamp(Math.floor((h - RH - 4) / Math.max(1, DG.rows.length)), 15, 24);
      var d = ENG.inst[soundFor(t)], has = function(pc){ return !d || !d.pieces || d.state !== "ready" || kitHas(d, pc) || kitHas(d, DRUM_ALT[pc]); };
      c.save(); c.beginPath(); c.rect(NW, RH, w - NW, h - RH); c.clip();
      var u0 = Math.max(0, (NW - NW + sl) / ppt), u1 = Math.min(L, (w - NW + sl) / ppt), cellW = g * ppt;
      for(i = 0; i < DG.rows.length; i++){
        y = RH + i * rowH - st;
        for(k = Math.floor(u0 / g); k * g < u1; k++){
          x = NW + k * g * ppt - sl; var abs = base + k * g, beat = Math.floor(abs / bq);
          c.fillStyle = beat % 2 === 0 ? C.cell : C.cell4; if(k * g >= pat.len) c.fillStyle = C.surface;
          c.beginPath(); rr(c, x + 1, y + 1, cellW - 2, rowH - 2, 2); c.fill();
        }
      }
      for(k = Math.floor((base + u0) / bt); k * bt - base <= u1; k++){ x = Math.round(NW + (k * bt - base) * ppt - sl) + 0.5; if(k * bt - base < 0) continue; c.strokeStyle = C.light ? "rgba(0,0,0,.45)" : "rgba(255,255,255,.35)"; c.beginPath(); c.moveTo(x, RH); c.lineTo(x, RH + DG.rows.length * rowH - st); c.stroke(); }
      pat.notes.forEach(function(n){
        var row = DG.rows.indexOf(DRUM_OF[n.p]); if(row < 0 || n.s > u1 || n.s < u0 - g) return;
        var yy = RH + row * rowH - st, xx = NW + n.s * ppt - sl, lv = n.v >= 110 ? 2 : n.v < 64 ? 0 : 1, inset = lv === 0 ? 4 : 2, wd = Math.max(5, Math.min(cellW, 30) - inset * 2);
        c.fillStyle = alpha(col, lv === 0 ? 0.5 : lv === 1 ? 0.85 : 1); c.beginPath(); rr(c, xx + inset, yy + inset, wd, rowH - inset * 2, 2); c.fill();
        if(lv === 2){ c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); rr(c, xx + inset + 0.5, yy + inset + 0.5, wd - 1, rowH - inset * 2 - 1, 2); c.stroke(); }
      });
      var ph = DG.phTick === null ? TR.pos : DG.phTick, px = Math.round(NW + (ph - base) * ppt - sl) + 0.5;
      if(px >= NW && px <= w){ c.strokeStyle = C.ink; c.beginPath(); c.moveTo(px, RH); c.lineTo(px, h); c.stroke(); }
      c.restore();
      // ruler
      c.fillStyle = C.surface; c.fillRect(0, 0, w, RH); c.strokeStyle = C.line2; c.beginPath(); c.moveTo(0, RH + 0.5); c.lineTo(w, RH + 0.5); c.stroke();
      c.save(); c.beginPath(); c.rect(NW, 0, w - NW, RH); c.clip(); c.font = "500 10.5px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
      for(k = Math.floor((base + u0) / bq); k * bq - base <= u1; k++){
        var ub = k * bq - base; if(ub < 0) continue; x = Math.round(NW + ub * ppt - sl) + 0.5; var onBar = (k * bq) % bt === 0;
        c.strokeStyle = onBar ? C.ink3 : C.line2; c.beginPath(); c.moveTo(x, onBar ? 9 : 14); c.lineTo(x, RH); c.stroke();
        c.fillStyle = onBar ? C.ink2 : C.ink3; if(onBar || bq * ppt > 30) c.fillText(onBar ? String(Math.floor(k * bq / bt) + 1) : (Math.floor(k * bq / bt) + 1) + "." + (Math.round(((k * bq) % bt) / bq) + 1), x + 4, 7);
      }
      c.restore();
      // names
      c.fillStyle = C.surface; c.fillRect(0, RH + 1, NW, h - RH); c.fillRect(0, 0, NW, RH);
      c.save(); c.beginPath(); c.rect(0, RH, NW, h - RH); c.clip(); c.font = "500 11.5px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
      for(i = 0; i < DG.rows.length; i++){
        y = RH + i * rowH - st; var pc = DG.rows[i];
        if(DG.downRow === i){ c.fillStyle = alpha(col, 0.3); c.fillRect(0, y, NW, rowH); }
        c.fillStyle = has(pc) ? C.ink : C.ink3; c.fillText(DRUM_NAMES[pc], 10, y + rowH / 2 + 0.5);
        c.fillStyle = C.line; c.fillRect(0, y + rowH - 1, NW, 1);
      }
      c.restore();
      c.strokeStyle = C.line2; c.beginPath(); c.moveTo(NW + 0.5, 0); c.lineTo(NW + 0.5, h); c.stroke();
    }
    function drumDown(p, e){
      var f = drumRegion(), host = DG.host; if(!f) return null;
      var sl = host.scrollLeft, st = host.scrollTop, r = f.r, pat = patOf(r), g = DG.grid;
      DG.rows = drumRows(f.t, pat, DG.all);
      closePops(); try { host.focus({ preventScroll:true }); } catch(err){}
      if(phoneOn() && (p.y < DG.rulerH || p.x >= DG.nameW)) return null;        // on a phone a hit is a tap; a drag moves the grid
      if(p.y < DG.rulerH){ if(p.x > DG.nameW) setPos(Math.max(0, r.s + Math.round((p.x - DG.nameW + sl) / DG.ppt / g) * g)); return null; }
      var row = Math.floor((p.y - DG.rulerH + st) / DG.rowH); if(row < 0 || row >= DG.rows.length) return null;
      var pitch = DRUM[DG.rows[row]];
      if(p.x < DG.nameW){
        // the name plays the sound; while a rhythm is being tapped in, it is a pad
        DG.downRow = row; blip(f.t, pitch, DG.level); noteRecEvent(true, pitch, DG.level); noteRecEvent(false, pitch); DG.view.ask();
        return { up:function(){ DG.downRow = -1; DG.view.ask(); }, cancel:function(){ DG.downRow = -1; DG.view.ask(); } };
      }
      var mode = null, changed = false, seen = {};
      function at(q){
        var rw = Math.floor((q.y - DG.rulerH + host.scrollTop) / DG.rowH); if(rw !== row) return;
        var k = Math.floor((q.x - DG.nameW + host.scrollLeft) / DG.ppt / g); if(k < 0 || k * g >= rollLen(f) || seen[k]) return; seen[k] = 1;
        var s = k * g, hit = pat.notes.filter(function(n){ return n.p === pitch && n.s >= s - g * 0.25 && n.s < s + g * 0.75; })[0];
        if(mode === null) mode = hit ? ((hit.v >= 110 ? 120 : hit.v < 64 ? 52 : 96) === DG.level ? "off" : "level") : "on";
        if(mode === "on" && !hit){ pat.notes.push({ s:s, l:Math.min(g, PPQ / 4), p:pitch, v:DG.level }); changed = true; if(!TR.playing) blip(f.t, pitch, DG.level); }
        else if(mode === "off" && hit){ pat.notes.splice(pat.notes.indexOf(hit), 1); changed = true; }
        else if(mode === "level" && hit){ hit.v = DG.level; changed = true; if(!TR.playing) blip(f.t, pitch, DG.level); }
        DG.view.ask();
      }
      at(p);
      return { move:at, up:function(){ if(changed){ sortNotes(pat); if(f.r.drum) f.r.drum.edited = true; commit(mode === "on" ? "add drum hits" : mode === "off" ? "remove drum hits" : "change how hard a hit is"); } } };
    }

    // ---- drums: feels ----
    // One bar of four beats per line; x normal, X accent, o soft (ghost), - quiet. Triplet feels have three steps to the beat.
    function F(id, name, sub, vars, fill){ return { id:id, name:name, sub:sub, vars:vars, fill:fill }; }
    var FEELS = [
      F("pop", "Pop", 4, [
        [{ kick:"x.......x.x.....", snare:"....X.......X...", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"x.....x.x.x.....", snare:"....X.......X...", hat_closed:"x.-.x.-.x.-.x.-." }, { kick:"x.....x.x.x....x", snare:"....X.......X...", hat_closed:"x.-.x.-.x.-.x.", hat_open:"..............x." }],
        [{ kick:"x..x....x.x.....", snare:"....X.......X..o", hat_closed:"x-x-x-x-x-x-x-x-", tambourine:"....-.......-..." }]],
        { kick:"x.......x.......", snare:"....X.....o.xxXX", hat_closed:"x.-.x.-.x.-.", tom_high:"..........x.", crash:"" }),
      F("ballad", "Ballad", 4, [
        [{ kick:"x.........x.....", rim:"....x.......x...", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"x.........x.....", snare:"....x.......x...", hat_closed:"x.-.x.-.x.-.x.-." }, { kick:"x.......x.x.....", snare:"....x.......x...", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"x.........x.....", snare:"....x.......x...", ride:"x.-.x.-.x.-.x.-.", hat_closed:"....-.......-..." }]],
        { kick:"x.........x.....", snare:"....x.......x.xX", hat_closed:"x.-.x.-.x.-.", tom_mid:"..........-.", tom_low:"" }),
      F("rock", "Rock", 4, [
        [{ kick:"X.......X.X.....", snare:"....X.......X...", hat_closed:"X.x.X.x.X.x.X.x." }],
        [{ kick:"X..x....X.X.....", snare:"....X.......X...", hat_closed:"X.x.X.x.X.x.X.x." }, { kick:"X..x....X.X...x.", snare:"....X.......X...", hat_closed:"X.x.X.x.X.x.X.", hat_open:"..............x." }],
        [{ kick:"X.x...x.X.x.....", snare:"....X.......X...", ride:"X.x.X.x.X.x.X.x.", crash:"X..............." }]],
        { kick:"X.......X.......", snare:"....X...x.x.XXXX", hat_closed:"X.x.X.x.", tom_high:"........x.x.", tom_low:"..............." }),
      F("soul", "Soul", 4, [
        [{ kick:"x..x......x.....", snare:"....X..o.o..X...", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"x..x....x.x.....", snare:"....X..o.o..X..o", hat_closed:"x.-.x.-.x.-.x.-.", tambourine:"....x.......x..." }],
        [{ kick:"x.....x...x..x..", snare:"....X.....o.X...", hat_closed:"x-x-x-x-x-x-x-x-" }]],
        { kick:"x..x......x.....", snare:"....X..o.o.oX.XX", hat_closed:"x.-.x.-.x.-." }),
      F("bossa", "Bossa", 4, [
        [{ kick:"x..x.x..x..x.x..".replace(/x\.\.x\.x/g, "x.....x"), rim:"x..x..x...x..x..", hat_closed:"-.-.-.-.-.-.-.-." }],
        [{ kick:"x.....x.x.....x.", rim:"x..x..x...x..x..", hat_closed:"-.-.-.-.-.-.-.-.", shaker:"-o-o-o-o-o-o-o-o" }],
        [{ kick:"x.....x.x.....x.", rim:"..x..x....x..x..", ride:"-.-.-.-.-.-.-.-." }]],
        { kick:"x.....x.x.....x.", rim:"x..x..x...x.....", hat_closed:"-.-.-.-.-.-.", tom_high:"............x.x.", snare:"..............." }),
      F("shuffle", "Shuffle", 3, [
        [{ kick:"x.....x.....", snare:"...X.....X..", hat_closed:"x.-x.-x.-x.-" }],
        [{ kick:"x.....x....x", snare:"...X.....X..", hat_closed:"x.-x.-x.-x.-" }],
        [{ kick:"x..x..x..x..", snare:"...X.....X..", ride:"x.-x.-x.-x.-", hat_closed:"...-.....-.." }]],
        { kick:"x.....x.....", snare:"...X..x.xXXX", hat_closed:"x.-x.-x.-" }),
      F("ballad68", "6/8 ballad", 3, [
        [{ kick:"x.....x.....", snare:"...x.....x..", hat_closed:"x--x--x--x--" }],
        [{ kick:"x....xx.....", snare:"...x.....x..", hat_closed:"x--x--x--x--" }],
        [{ kick:"x.....x....x", rim:"...x.....x..", ride:"x--x--x--x--" }]],
        { kick:"x.....x.....", snare:"...x..x.xxXX", hat_closed:"x--x--x--" }),
      F("folk", "Folk", 4, [
        [{ kick:"x.......x.......", snare:"....x.......x...", shaker:"-.o.-.o.-.o.-.o.", tambourine:"....-.......-..." }],
        [{ kick:"x.....x.x.......", rim:"....x.......x...", shaker:"-o--o-o--o--o-o-".slice(0, 16) }],
        [{ kick:"x.......x.x.....", snare:"....x.......x...", hat_closed:"-.-.-.-.-.-.-.-.", tambourine:"..-...-...-...-." }]],
        { kick:"x.......x.......", snare:"....x.......x.x.", shaker:"-.o.-.o.-.o.-.o.", tom_low:"..............x." }),
      F("funk", "Funk", 4, [
        [{ kick:"x..x......x..x..", snare:"....X..o.o..X..o", hat_closed:"x-x-x-x-x-x-x-x-" }],
        [{ kick:"x..x..x...x..x..", snare:"....X..o.o.oX...", hat_closed:"x-x-x-x-x-x-x-", hat_open:"..............x." }],
        [{ kick:"x.x...x..xx.....", snare:"....X..o....X.o.", hat_closed:"x-x-x-x-x-x-x-x-", clap:"....x.......x..." }]],
        { kick:"x..x......x.....", snare:"....X..o.o.oXoXX", hat_closed:"x-x-x-x-x-x-", hat_open:"" }),
      F("reggae", "Reggae", 4, [
        [{ kick:"........x.......", rim:"........x.......", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"........x.......", snare:"........x.......", hat_closed:"..x...x...x...x.", hat_open:"" }],
        [{ kick:"x.......x.......", rim:"....x.......x...", hat_closed:"x.-.x.-.x.-.x.-." }]],
        { kick:"........x.......", rim:"........x.......", hat_closed:"x.-.x.-.x.-.", tom_high:"............x.x.", snare:"" }),
      F("train", "Train beat", 4, [
        [{ kick:"x.......x.......", snare:"o-X-o-X-o-X-o-X-" }],
        [{ kick:"x.....x.x.......", snare:"o-X-o-X-o-X-o-X-" }],
        [{ kick:"x.......x.......", snare:"o-X-o-X-o-X-o-X-", hat_closed:"....x.......x..." }]],
        { kick:"x.......x.......", snare:"o-X-o-X-o-X-XXXX" }),
      F("half", "Half-time", 4, [
        [{ kick:"x.........x.....", snare:"........X.......", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"x.....x...x.....", snare:"........X.......", hat_closed:"x.-.x.-.x.-.x.-." }, { kick:"x.....x...x..x..", snare:"........X.....o.", hat_closed:"x.-.x.-.x.-.x.-." }],
        [{ kick:"x.........x.....", snare:"........X.......", ride:"x.-.x.-.x.-.x.-.", hat_closed:"....-.......-..." }]],
        { kick:"x.........x.....", snare:"........X...xxXX", hat_closed:"x.-.x.-.x.-.", tom_low:"" })
    ];
    FEELS[4].vars[0][0].kick = "x.....x.x.....x.";
    function feelName(id){ var f = FEELS.filter(function(x){ return x.id === id; })[0]; return f ? f.name : id; }
    var VEL = { x:96, X:120, o:50, "-":72 };
    // which beats of a four-beat bar make a bar of this song's metre
    function beatPlan(){
      var n = S.sig[0], d = S.sig[1];
      if(d === 8 && n === 6) return { beats:[0, 1], compound:true };
      if(d === 8 && n === 12) return { beats:[0, 1, 2, 3], compound:true };
      if(n === 2) return { beats:[0, 1] };
      if(n === 3) return { beats:[0, 1, 3] };
      if(n === 5) return { beats:[0, 1, 3, 2, 1] };
      return { beats:[0, 1, 2, 3] };
    }
    function cellOf(str, beat, sub){ return (str || "").slice(beat * sub, beat * sub + sub); }
    function tripletCell(cell, isHat){
      // four steps to three: the off-beat sixteenths fold onto the last triplet
      var a = cell[0] || ".", b = cell[1] || ".", c2 = cell[2] || ".", d = cell[3] || ".", last = c2 !== "." ? c2 : d !== "." ? d : ".", midc = b !== "." ? "o" : ".";
      if(isHat && a !== "." && last !== "." && midc === ".") midc = "-";
      return a + midc + last;
    }
    function drumNotes(feelId, vari, bars, withFill){
      var fl = FEELS.filter(function(x){ return x.id === feelId; })[0] || FEELS[0], v = fl.vars[clamp(vari | 0, 0, fl.vars.length - 1)], plan = beatPlan(), notes = [], bt = barTicks();
      // a bar of two or three beats is made from the four-beat pattern: its first beat, and the beats that carry the backbeat
      var back2 = ["snare", "rim", "clap"].some(function(pc){ return /[xXo-]/.test(cellOf(v[0][pc], 1, fl.sub)); });
      if(plan.beats.length === 3 && !back2) plan = { beats:[0, 2, 3] };
      if(plan.beats.length === 2 && !back2) plan = { beats:[0, 2], compound:plan.compound };
      var beatLen = plan.compound ? PPQ * 1.5 : beatTicks(), bar, b, k;
      for(bar = 0; bar < bars; bar++){
        var isFill = withFill && bar === bars - 1 && bars > 1, src = isFill ? fl.fill : v[bar % v.length];
        // a fill happens at the end of its four beats: a shorter bar takes those
        var beats = !isFill || plan.beats.length >= 4 ? plan.beats : plan.beats.length === 3 ? [0, 2, 3] : [2, 3];
        Object.keys(src).forEach(function(pc){
          if(!DRUM[pc] || !src[pc]) return;
          beats.forEach(function(sb, bi){
            var cell = cellOf(src[pc], sb, fl.sub), sub = fl.sub;
            if(plan.compound && sub === 4){ cell = tripletCell(cell, /hat|ride|shaker/.test(pc)); sub = 3; }
            for(k = 0; k < sub; k++){
              var ch = cell[k]; if(!ch || !VEL[ch]) continue;
              notes.push({ s:Math.round(bar * bt + bi * beatLen + k * beatLen / sub), l:PPQ / 8, p:DRUM[pc], v:VEL[ch] });
            }
          });
        });
        // a crash where the song comes back in after a fill is left to her; a fill ends on the bar line
      }
      notes.sort(function(a, b2){ return a.s - b2.s || a.p - b2.p; });
      return notes;
    }
    function drumPreset(r, feel, vari, fill){
      var p = patOf(r), bars = Math.max(1, Math.round(r.l / barTicks()));
      p.len = bars * barTicks(); p.notes = drumNotes(feel, vari, bars, fill);
      r.drum = { feel:feel, vari:vari | 0, fill:!!fill && bars > 1, edited:false };
      if(fill && bars < 2) tell("A fill needs a part of two bars or more: make the part longer first.");
      // triplet feels are easiest to see on a triplet grid
      var fl = FEELS.filter(function(x){ return x.id === feel; })[0];
      DG.grid = (fl && fl.sub === 3 && !beatPlan().compound) ? PPQ / 3 : (beatPlan().compound ? PPQ / 2 : PPQ / 4);
    }
    function drumDensity(f, dir){
      var p = patOf(f.r), bt = barTicks(), bq = beatTicks(), comp = beatPlan().compound, step = comp ? PPQ / 2 : PPQ / 4, n = p.notes, HC = DRUM.hat_closed, SN = DRUM.snare, KK = DRUM.kick, bars = Math.round(p.len / bt), b, i;
      function has(pitch, s){ return n.some(function(x){ return x.p === pitch && Math.abs(x.s - s) < step / 3; }); }
      function any(s){ return n.some(function(x){ return Math.abs(x.s - s) < step / 3 && (x.p === SN || x.p === KK); }); }
      if(dir > 0){
        var topRow = n.some(function(x){ return x.p === DRUM.ride; }) ? DRUM.ride : n.some(function(x){ return x.p === DRUM.shaker; }) && !n.some(function(x){ return x.p === HC; }) ? DRUM.shaker : HC;
        var hats = n.filter(function(x){ return x.p === topRow; }), offs = hats.filter(function(x){ return Math.round(x.s / step) % 2 === 1; });
        if(hats.length && offs.length < hats.length * 0.5 && !comp){
          var add = []; for(i = 0; i < p.len; i += step) if(Math.round(i / step) % 2 === 1 && !has(topRow, i)) add.push({ s:i, l:PPQ / 8, p:topRow, v:54 });
          if(add.length){ add.forEach(function(x){ n.push(x); }); sortNotes(p); return true; }
        }
        if(!hats.length){ for(i = 0; i < p.len; i += comp ? PPQ / 2 : PPQ / 2) n.push({ s:i, l:PPQ / 8, p:HC, v:i % bq === 0 ? 90 : 66 }); sortNotes(p); return true; }
        var ghosts = n.filter(function(x){ return x.p === SN && x.v < 64; });
        if(ghosts.length < bars * 2){
          var done = 0; for(b = 0; b < bars; b++) [7, 9, 15, 3].forEach(function(k){ var s = b * bt + k * step; if(done < bars * 2 - ghosts.length && s < p.len && !any(s)){ n.push({ s:s, l:PPQ / 8, p:SN, v:46 }); done++; } });
          if(done){ sortNotes(p); return true; }
        }
        var added = 0; for(b = 0; b < bars; b++) [10, 7, 14].some(function(k){ var s = b * bt + k * step; if(s < p.len && !any(s)){ n.push({ s:s, l:PPQ / 8, p:KK, v:88 }); added++; return true; } return false; });
        if(added){ sortNotes(p); return true; }
        return false;
      }
      var before = n.length;
      p.notes = n.filter(function(x){ return !(x.v < 64 && (x.p === SN || x.p === DRUM.rim)); }); if(p.notes.length < before) return true;
      p.notes = n.filter(function(x){ return !((x.p === HC || x.p === DRUM.ride || x.p === DRUM.shaker) && Math.round(x.s / step) % 2 === 1 && !comp); }); if(p.notes.length < before) return true;
      p.notes = n.filter(function(x){ return !((x.p === DRUM.tambourine || x.p === DRUM.clap || x.p === DRUM.hat_open)); }); if(p.notes.length < before) return true;
      p.notes = n.filter(function(x){ return !((x.p === HC || x.p === DRUM.ride || x.p === DRUM.shaker) && x.s % bq !== 0); }); if(p.notes.length < before) return true;
      p.notes = n.filter(function(x){ return !(x.p === KK && x.s % bq !== 0); }); if(p.notes.length < before) return true;
      return false;
    }
    function drumHumanise(f){
      var p = patOf(f.r), bq = beatTicks();
      p.notes.forEach(function(n){
        var onBeat = n.s % bq === 0, late = n.p === DRUM.snare ? 3 : 0;
        if(n.s % barTicks() !== 0) n.s = Math.max(0, n.s + Math.round((Math.random() - 0.5) * (onBeat ? 8 : 16)) + late);
        n.v = clamp(n.v + Math.round((Math.random() - 0.5) * 16), 20, 127);
      });
      sortNotes(p); if(f.r.drum) f.r.drum.edited = true;
    }
    function tapStart(trackId){
      var t = trackById(trackId); if(!t || t.kind !== "drums") return;
      var f = drumRegion(), bt = barTicks(), at = f && f.t === t ? f.r.s : Math.floor(TR.pos / bt) * bt;
      ensureEngine().then(function(){ return loadInst(t.inst); }).then(function(){
        if(f && f.t === t){ S.loop = { on:true, a:f.r.s, b:f.r.s + f.r.l }; touch(); }
        return noteRecStart(trackId, { at:at, snap:DG.grid, countIn:1 });
      }).then(function(){ recStrip("tap"); paintEditorTools(); paintBar(); tell("Tap along: F is the kick, J the snare, K the closed hat, L the open hat. Space stops."); });
    }

    // ---- recordings: the picture of a take ----
    function takeContent(){ var f = takeRegion(); return { w:f ? (f.r.l + barTicks() * 2) * TK.ppt + 40 : 0, h:10 }; }
    function takeGeom(f){ return { t0:phoneOn() ? f.r.s - Math.round(26 / TK.ppt) : Math.max(0, f.r.s - barTicks()) }; }
    function takePaint(c, w, h, sl){
      var C = colors(), f = takeRegion();
      c.clearRect(0, 0, w, h); c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
      if(!f){ c.fillStyle = C.ink3; c.font = "500 12.5px " + FONT; c.textAlign = "center"; c.textBaseline = "middle"; var t0 = selTrack(); c.fillText(t0 && t0.kind === "audio" ? "Press Record to sing onto this track, or bring in a sound file." : "Select a recording on a voice track to see it here.", w / 2, h / 2); return; }
      var r = f.r, t = f.t, col = trackColor(t), G = takeGeom(f), ppt = TK.ppt, bt = barTicks(), RH = 20, x, k;
      if(TK.forRegion !== r.id){ TK.forRegion = r.id; TK.ppt = ppt = clamp((TK.host.clientWidth - (phoneOn() ? 60 : 30)) / (r.l + (phoneOn() ? 0 : bt * 2)), 0.01, 0.6); G = takeGeom(f); }
      function X(tick){ return (tick - G.t0) * ppt - sl; }
      var x0 = X(r.s), x1 = X(r.s + r.l), mid = RH + (h - RH) / 2, amp = (h - RH) / 2 - 8;
      c.fillStyle = C.surface; c.fillRect(x0, RH, x1 - x0, h - RH);
      for(k = Math.floor(G.t0 / bt); X(k * bt) < w; k++){ x = Math.round(X(k * bt)) + 0.5; if(x < 0 || k < 0) continue; c.strokeStyle = C.line2; c.beginPath(); c.moveTo(x, RH); c.lineTo(x, h); c.stroke(); }
      var ti = takeCache[r.takes[r.act]];
      if(!ti) takeInfo(r.takes[r.act]).then(function(v){ if(v) takeAsk(); });
      else {
        var secPerPx = tickSec(1) / ppt, g = Math.pow(10, (r.gain || 0) / 20), px;
        for(px = 0; px < w; px++){
          var tick = G.t0 + (px + sl) / ppt, sec = (r.off || 0) + tickSec(tick - r.s); if(sec < 0) continue; if(sec > ti.len / ti.sr) break;
          var s0 = Math.floor(sec * 200), s1 = Math.max(s0 + 1, Math.floor((sec + secPerPx) * 200)), lo = 0, hi = 0, q;
          for(q = s0; q < s1 && q * 2 + 1 < ti.peaks.length; q++){ if(ti.peaks[q * 2] < lo) lo = ti.peaks[q * 2]; if(ti.peaks[q * 2 + 1] > hi) hi = ti.peaks[q * 2 + 1]; }
          var inside = tick >= r.s && tick < r.s + r.l, env = 1, into = tickSec(tick - r.s), left = tickSec(r.s + r.l - tick);
          if(inside){ if(r.fi && into < r.fi) env = into / r.fi; if(r.fo && left < r.fo) env = Math.min(env, left / r.fo); }
          var a = clamp(hi / 127 * g * env, 0, 1) * amp, b = clamp(-lo / 127 * g * env, 0, 1) * amp;
          c.fillStyle = inside ? col : alpha(C.ink3, 0.4); c.fillRect(px, mid - a, 1, Math.max(1, a + b));
        }
      }
      // fades and the ends that can be pulled
      c.strokeStyle = C.ink; c.lineWidth = 1.2; c.beginPath();
      c.moveTo(x0, h - 3); c.lineTo(x0 + secTick(r.fi || 0) * ppt, RH + 4); c.moveTo(x1 - secTick(r.fo || 0) * ppt, RH + 4); c.lineTo(x1, h - 3); c.stroke(); c.lineWidth = 1;
      if(!phoneOn()){ c.fillStyle = C.ink; c.fillRect(x0 + secTick(r.fi || 0) * ppt - 4, RH + 1, 8, 8); c.fillRect(x1 - secTick(r.fo || 0) * ppt - 4, RH + 1, 8, 8); }
      c.fillStyle = col; c.fillRect(x0 - 1, RH, 3, h - RH); c.fillRect(x1 - 2, RH, 3, h - RH);
      if(phoneOn()){
        // the two ends, as grips: drag one to trim the start or the end
        [[x0, 1], [x1, -1]].forEach(function(gp){
          var gx = gp[0] - (gp[1] > 0 ? 3 : 15), gy = mid - 30;
          c.fillStyle = C.ink; c.beginPath(); rr(c, gx, gy, 18, 60, 6); c.fill();
          c.strokeStyle = C.bg; c.lineWidth = 1.5; c.beginPath(); c.moveTo(gx + 6.5, gy + 20); c.lineTo(gx + 6.5, gy + 40); c.moveTo(gx + 11.5, gy + 20); c.lineTo(gx + 11.5, gy + 40); c.stroke(); c.lineWidth = 1;
        });
      }
      c.fillStyle = C.surface; c.fillRect(0, 0, w, RH); c.strokeStyle = C.line2; c.beginPath(); c.moveTo(0, RH + 0.5); c.lineTo(w, RH + 0.5); c.stroke();
      c.font = "500 10.5px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
for(k = Math.floor(G.t0 / bt); X(k * bt) < w; k++){ x = Math.round(X(k * bt)) + 0.5; if(x < 0 || k < 0) continue; c.strokeStyle = C.ink3; c.beginPath(); c.moveTo(x, 9); c.lineTo(x, RH); c.stroke(); c.fillStyle = C.ink2; c.fillText(String(k + 1), x + 4, 7); }
      var ph = Math.round(X(TK.phTick === null ? TR.pos : TK.phTick)) + 0.5; if(ph >= 0 && ph <= w){ c.strokeStyle = C.ink; c.beginPath(); c.moveTo(ph, 12); c.lineTo(ph, h); c.stroke(); }
    }
    function takeHit(p){
      var f = takeRegion(); if(!f) return "";
      var r = f.r, G = takeGeom(f), sl = TK.host.scrollLeft, x0 = (r.s - G.t0) * TK.ppt - sl, x1 = (r.s + r.l - G.t0) * TK.ppt - sl, fi = x0 + secTick(r.fi || 0) * TK.ppt, fo = x1 - secTick(r.fo || 0) * TK.ppt;
      if(phoneOn()){
        // a finger: the ends answer to a wide stripe; fades are set from the buttons, not dragged
        if(p.y < 26) return "ruler";
        var dl = Math.abs(p.x - x0 - 6), dr = Math.abs(p.x - x1 + 6);
        return dl < 26 && dl <= dr ? "l" : dr < 26 ? "r" : "";
      }
      if(p.y > 20 && p.y < 34 && Math.abs(p.x - fi) < 8) return "fi";
      if(p.y > 20 && p.y < 34 && Math.abs(p.x - fo) < 8) return "fo";
      if(Math.abs(p.x - x0) < 6) return "l";
      if(Math.abs(p.x - x1) < 6) return "r";
      return p.y < 20 ? "ruler" : "";
    }
    function takeHover(p){ var k = takeHit(p); return k === "l" || k === "r" || k === "fi" || k === "fo" ? "ew-resize" : k === "ruler" ? "pointer" : ""; }
    function takeDown(p, e){
      var f = takeRegion(); if(!f) return null;
      var r = f.r, G = takeGeom(f), host = TK.host, kind = takeHit(p), o = { s:r.s, l:r.l, off:r.off || 0, fi:r.fi || 0, fo:r.fo || 0 }, ch = false, ti = takeCache[r.takes[r.act]];
      function tk(q){ return G.t0 + (q.x + host.scrollLeft) / TK.ppt; }
      if(phoneOn() && (!kind || kind === "ruler")) return null;
      if(!kind || kind === "ruler"){ setPos(Math.max(0, e.shiftKey ? Math.round(tk(p)) : Math.round(tk(p) / (PPQ / 4)) * (PPQ / 4))); return null; }
      return {
        move:function(q, ev){
          var tick = ev.shiftKey ? Math.round(tk(q)) : Math.round(tk(q) / (PPQ / 8)) * (PPQ / 8);
          if(kind === "l"){
            var prev = f.t.regions.filter(function(x){ return x.s + x.l <= o.s && x !== r; }).pop(), minS = Math.max(prev ? prev.s + prev.l : 0, o.s - secTick(o.off));
            var ns = clamp(tick, minS, o.s + o.l - PPQ / 2); r.s = Math.round(ns); r.l = o.s + o.l - r.s; r.off = Math.max(0, o.off + tickSec(r.s - o.s));
          } else if(kind === "r"){
            var nxt = f.t.regions.filter(function(x){ return x.s > r.s; })[0], mx = nxt ? nxt.s : 1e12; if(ti) mx = Math.min(mx, r.s + secTick(ti.len / ti.sr - (r.off || 0)));
            r.l = Math.round(clamp(tick, r.s + PPQ / 2, mx) - r.s);
          } else if(kind === "fi") r.fi = clamp(tickSec(tk(q) - r.s), 0, tickSec(r.l) - (r.fo || 0));
          else if(kind === "fo") r.fo = clamp(tickSec(r.s + r.l - tk(q)), 0, tickSec(r.l) - (r.fi || 0));
          ch = true; TK.view.ask(); ARR.view.ask();
        },
        up:function(){ if(ch) commit(kind === "fi" ? "fade in" : kind === "fo" ? "fade out" : "trim a recording"); },
        cancel:function(){ r.s = o.s; r.l = o.l; r.off = o.off; r.fi = o.fi; r.fo = o.fo; TK.view.ask(); ARR.view.ask(); }
      };
    }

    // ---- chords ----
    var CHORD_Q = { maj:[0, 4, 7], min:[0, 3, 7], "7":[0, 4, 7, 10], maj7:[0, 4, 7, 11], m7:[0, 3, 7, 10], sus4:[0, 5, 7], sus2:[0, 2, 7], dim:[0, 3, 6], aug:[0, 4, 8], "6":[0, 4, 7, 9], add9:[0, 4, 7, 14], "9":[0, 4, 7, 10, 14] };
    var CHORD_SUF = { maj:"", min:"m", "7":"7", maj7:"maj7", m7:"m7", sus4:"sus4", sus2:"sus2", dim:"dim", aug:"aug", "6":"6", add9:"add9", "9":"9" };
    function chordName(c){ return NOTE_NAMES[c.root] + (CHORD_SUF[c.q] === undefined ? "" : CHORD_SUF[c.q]); }
    function chordAt(tick){ var out = null; for(var i = 0; i < S.chords.length; i++){ if(S.chords[i].t <= tick) out = S.chords[i]; else break; } return out; }
    function chordSet(tick, root, q){
      S.chords = S.chords.filter(function(c){ return c.t !== tick; });
      if(root !== null) S.chords.push({ t:tick, root:root, q:q });
      S.chords.sort(function(a, b){ return a.t - b.t; });
      // two entries in a row that say the same thing are one
      for(var i = S.chords.length - 1; i > 0; i--) if(S.chords[i].root === S.chords[i - 1].root && S.chords[i].q === S.chords[i - 1].q) S.chords.splice(i, 1);
      growBars(); chordFollow();
    }
    // the chords of the whole song written as a part: on a track, or on a new one ("new:keys", "new:bass"…)
    function chordsWrite(where, style, a, b){
      var bt = barTicks(); where = where || CH.track; style = style || CH.style;
      if(!S.chords.length){ tell("Choose some chords first: pick a bar on the left, then a chord."); return null; }
      if(a === undefined){ a = Math.floor(S.chords[0].t / bt) * bt; b = Math.ceil(Math.max(songTicks(), S.chords[S.chords.length - 1].t + bt) / bt) * bt; }
      var tid = where;
      if(/^new:/.test(where)){
        var fam = where.slice(4), nt = addTrack("inst", defaultInst(fam), fam === "bass" ? "Bass" : fam === "guitars" ? "Guitar" : fam === "strings" ? "Strings" : "Piano"); if(!nt) return null;
        tid = nt.id; if(CH.track === where) CH.track = tid;
      }
      var tr = trackById(tid); if(!tr) return null;
      if(!stylesFor(tr).some(function(x){ return x[0] === style; })) style = styleDefault(tr);
      var rg = chordPart(tid, a, b, style);
      if(rg){ commit("write the chords as a part"); ensureEngine().then(function(){ loadInst(tr.inst); }); select(tid, rg.id, { keepTab:true }); refresh(true); tell("Written on “" + tr.name + "” (" + styleName(style).toLowerCase() + "). It follows the chords until you edit its notes."); }
      return rg;
    }
    // the chords that belong to a key, with their numbers
    function keyChords(k){
      k = k || S.key; if(!scaleOf(k)) return [];
      var maj = k.scale === "major", steps = maj ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10], qs = maj ? ["maj", "min", "min", "maj", "maj", "min", "dim"] : ["min", "dim", "maj", "min", "min", "maj", "maj"];
      var rom = maj ? ["I", "ii", "iii", "IV", "V", "vi", "vii°"] : ["i", "ii°", "III", "iv", "v", "VI", "VII"];
      var out = steps.map(function(st, i){ return { root:(k.root + st) % 12, q:qs[i], num:rom[i], deg:i }; });
      if(!maj) out.push({ root:(k.root + 7) % 12, q:"maj", num:"V", deg:4, alt:true });       // the major chord on the fifth, common in minor songs
      return out;
    }
    function chordTones(c){ return (CHORD_Q[c.q] || CHORD_Q.maj).map(function(x){ return (c.root + x) % 12; }); }
    function audTrack(inst){ return { id:"_aud", kind:"inst", inst:inst || defaultInst("keys"), vol:0.8, pan:0, send:0.15, eq:[0, 0, 0], oct:0, mute:false, solo:false, regions:[] }; }
    function chordsHear(list){
      ensureEngine().then(function(){
        resume(); transportStop(true); auditionStop();
        var tr = audTrack(), bt = barTicks();
        loadInst(tr.inst).then(function(){
          if(ENG.inst[tr.inst].state !== "ready") tr.inst = "basic:piano";
          return loadInst(tr.inst);
        }).then(function(){
          var G = ENG.G, t0 = G.ctx.currentTime + 0.08, prev = null;
          list.forEach(function(c, i){ var v = voicing(c, 60, prev), end = i + 1 < list.length ? list[i + 1].t : c.t + bt; prev = v; v.forEach(function(p, j){ playNote(G, tr, p, 82, t0 + tickSec(c.t - list[0].t) + j * 0.01, tickSec(end - c.t) * 0.96); }); });
        });
      });
    }
    function chordPlay(c, t){
      t = t || (CH.track && trackById(CH.track)) || S.tracks.filter(function(x){ return x.kind === "inst"; })[0];
      ensureEngine().then(function(){
        resume();
        var G = ENG.G, when = G.ctx.currentTime + 0.01, tr = t || audTrack();
        loadInst(tr.inst).then(function(){ voicing(c, 60, null).forEach(function(p, i){ playNote(G, tr, p, 84, when + i * 0.012, 0.9); }); });
      });
    }
    // notes of a chord near a centre, keeping close to the chord before (so the hands barely move)
    function voicing(c, centre, prev){
      var tones = chordTones(c), out = tones.map(function(pc){ var p = centre - 6 + ((pc - (centre - 6)) % 12 + 12) % 12; return p; }).sort(function(a, b){ return a - b; });
      if(prev && prev.length){ var pm = prev.reduce(function(a, b){ return a + b; }, 0) / prev.length, om = out.reduce(function(a, b){ return a + b; }, 0) / out.length; if(om - pm > 5) out = out.map(function(p){ return p - 12; }).sort(function(a, b){ return a - b; }); else if(pm - om > 5) out[0] += 12; out.sort(function(a, b){ return a - b; }); }
      return out;
    }
    // How an instrument plays the chords. Each style is a rule from the chord under each beat to notes, so a part
    // written this way can be written again when the chords change ("follows the chords" until a note is edited by hand).
    var CHORD_STYLES = [["held", "Held chords"], ["block", "Chords on every beat"], ["ballad", "Ballad: bass note, then chords"], ["arp", "Arpeggio"], ["pop", "Pop rhythm"], ["offbeat", "Off the beat"],
                        ["strum", "Strummed"], ["finger", "Fingerpicked"], ["pad", "Sustained pad"]];
    var BASS_STYLES = [["root", "Root notes"], ["rootfifth", "Root and fifth"], ["walking", "Walking bass"]];
    function isBassTrack(t){ var d = t && (ENG.inst[t.inst] || ENG.inst[standIn(t)]); return !!(d && d.family === "bass"); }
    function stylesFor(t){ return isBassTrack(t) ? BASS_STYLES : CHORD_STYLES; }
    function styleDefault(t){
      var d = t && (ENG.inst[t.inst] || ENG.inst[standIn(t)]), fam = d ? d.family : "keys";
      return fam === "bass" ? "rootfifth" : fam === "guitars" ? "strum" : fam === "strings" || fam === "winds" || fam === "voice" ? "pad" : "ballad";
    }
    function styleName(id){ var a = CHORD_STYLES.concat(BASS_STYLES).filter(function(x){ return x[0] === id; })[0]; return a ? a[1] : id; }
    function chordNotes(t, a, b, style){
      var d = ENG.inst[t.inst] || ENG.inst[standIn(t)], rg = d && d.range ? d.range : [36, 84], bassy = isBassTrack(t);
      if(bassy && !BASS_STYLES.some(function(x){ return x[0] === style; })) style = style === "held" ? "root" : "rootfifth";
      if(!bassy && !CHORD_STYLES.some(function(x){ return x[0] === style; })) style = "held";
      var lo = rg[0] - 12 * (t.oct || 0), hi = rg[1] - 12 * (t.oct || 0);
      var centre = clamp(60, lo + 10, hi - 8), bt = barTicks(), pt = pulseTicks(), nb = Math.max(1, Math.round(bt / pt)), compound = pt !== beatTicks(), sub = compound ? pt / 3 : pt / 2;
      var notes = [], prev = null, segs = [];
      var cur = chordAt(a), marks = S.chords.filter(function(c){ return c.t > a && c.t < b; });
      if(cur) segs.push({ t:a, c:cur }); marks.forEach(function(c){ segs.push({ t:c.t, c:c }); });
      if(!segs.length) return null;
      function fit(p){ while(p < lo) p += 12; while(p > hi) p -= 12; return p; }
      function near(pc, c0){ return c0 - 6 + ((pc - (c0 - 6)) % 12 + 12) % 12; }
      segs.forEach(function(sg, si){
        var end = si + 1 < segs.length ? segs[si + 1].t : b, c = sg.c, tones = chordTones(c), nxt = si + 1 < segs.length ? segs[si + 1].c : null, s, k;
        function put(at, l, vel, p){ if(at >= sg.t && at < end) notes.push({ s:Math.round(at - a), l:Math.max(30, Math.round(Math.min(l, end - at) - 8)), p:fit(p), v:clamp(Math.round(vel), 1, 127) }); }
        function beatIn(at){ return Math.round((at % bt) / pt) % nb; }
        if(bassy){
          var bc = clamp(lo + 12, lo + 5, hi - 12), root = near(c.root, bc), third = root + ((tones[1] - c.root + 12) % 12), fifth = root + 7 > hi ? root - 5 : root + 7;
          for(s = sg.t; s < end; s += pt){
            var bi = beatIn(s), lastBeat = s + pt >= end;
            if(style === "root"){ if(bi === 0) put(s, pt * Math.min(nb, 2) - (nb > 2 ? pt * 0.25 : 0), 98, root); else if(nb === 4 && bi === 2) put(s, pt * 1.5, 84, root); }
            else if(style === "rootfifth"){
              if(bi === 0) put(s, pt * (nb === 2 ? 0.95 : 1.5), 98, root);
              else if((nb === 4 && bi === 2) || (nb === 3 && bi === 2) || (nb === 2 && bi === 1) || (nb === 5 && bi === 3)) put(s, pt * 0.95, 86, fifth);
              if(nb === 4 && bi === 1 && !compound) put(s + pt / 2, pt / 2, 70, root);
            } else {
              // walking: the root, two notes of the chord, then a step into the next root
              var step = bi === 0 ? root : bi === 1 ? third : bi === nb - 1 ? fifth : (bi % 2 ? third + (third - root <= 3 ? 4 : 3) : fifth);
              if(lastBeat && nxt && s > sg.t){ var nr = near(nxt.root, root); step = nr === root ? fifth : nr > root ? nr - 1 : nr + 1; }
              put(s, pt * 0.92, bi === 0 ? 98 : 86, step);
            }
          }
          return;
        }
        var v = voicing(c, centre, prev); prev = v;
        // the bass note of the chord stays the lowest note, also on an instrument with little room below
        var lowR = fit(near(c.root, centre - 19)); if(lowR >= v[0]){ if(lowR - 12 >= lo) lowR -= 12; else v = v.map(function(p0){ return p0 <= lowR ? p0 + 12 : p0; }).sort(function(x, y){ return x - y; }); }
        var low = lowR, wide = [low, low + 7].concat(v.map(function(p){ return p + (p - low < 12 ? 12 : 0); })).sort(function(x, y){ return x - y; });
        function chord(at, l, vel, which, stagger){ (which || v).forEach(function(p, j){ put(at + (stagger || 0) * j, l, vel - (j ? 4 : 0), p); }); }
        if(style === "held") chord(sg.t, end - sg.t, 82);
        else if(style === "pad"){ put(sg.t, end - sg.t + 20, 66, low + 12); v.forEach(function(p, j){ put(sg.t, end - sg.t + 20, 70 - j * 2, p + (j === 0 ? 12 : 0)); }); }
        else if(style === "block"){ for(s = sg.t; s < end; s += pt) chord(s, pt * 0.9, beatIn(s) === 0 ? 92 : 76); }
        else if(style === "ballad"){ for(s = sg.t; s < end; s += pt){ if(beatIn(s) === 0 || s === sg.t){ put(s, pt * Math.min(2, nb) * 0.98, 88, low); chord(s, pt * 0.95, 78); } else chord(s, pt * 0.92, beatIn(s) === 2 && nb === 4 ? 74 : 66); } }
        else if(style === "arp"){ var seq = v.length > 3 ? [0, 1, 2, 3, 2, 1] : [0, 1, 2, 1]; for(k = 0, s = sg.t; s < end; s += sub, k++){ var onB = Math.abs((s % bt) % pt) < 1; if(Math.abs(s % bt) < 1 || s === sg.t){ put(s, sub * 3.6, 88, low); k = 0; } put(s, sub * 1.7, onB ? 86 : 72, v[seq[k % seq.length]]); } }
        else if(style === "pop"){ for(s = sg.t; s < end; s += pt){ var bp = beatIn(s); if(bp === 0){ chord(s, pt * 1.4, 94); if(!compound && nb >= 3) chord(s + pt * 1.5, pt * 0.9, 80); } else if(bp === nb - 1 && nb >= 3) chord(s, pt * 0.9, 84); else if(compound) chord(s, pt * 0.9, 78); } }
        else if(style === "offbeat"){ for(s = sg.t + (compound ? sub * 2 : pt / 2); s < end; s += pt) chord(s, pt * 0.35, 84); }
        else if(style === "strum"){
          // down, down-up, up-down-up: a hand keeping time and missing the strings where there is a dot
          var patS = compound ? "D.UD.U" : nb === 3 ? "D.DUDU" : nb === 2 ? "D.DU" : "D.DU.UDU", per = compound ? 3 : 2;
          for(s = sg.t; s < end; s += sub){
            var hI = Math.round((s % bt) / sub) % (nb * per), chS = s === sg.t && patS[hI % patS.length] === "." ? "D" : patS[hI % patS.length];
            if(chS === "D") chord(s, sub * 1.9, hI === 0 ? 94 : 84, wide, 11);
            else if(chS === "U") chord(s, sub * 1.4, 68, wide.slice(-3).reverse(), 9);
          }
        } else if(style === "finger"){
          var up = wide.slice(2), cyc = [0, 1, 2, 1], ci = 0;
          for(s = sg.t; s < end; s += sub){
            var hF = Math.round((s % bt) / sub), onBeat = Math.abs((s % bt) % pt) < 1, bF = beatIn(s);
            if(hF === 0 || s === sg.t){ put(s, pt * 1.9, 90, low); ci = 0; }
            else if(onBeat && nb >= 3 && bF === (nb === 3 ? 2 : 2)){ put(s, pt * 1.9, 82, low + 7); }
            else { put(s, sub * 2.6, onBeat ? 78 : 68, up[cyc[ci % 4] % up.length]); ci++; }
          }
        }
      });
      return notes.filter(function(n){ return n.s < b - a; });
    }
    // write the chords of a stretch of the song as a region on a track
    function chordPart(trackId, a, b, style){
      var t = trackById(trackId); if(!t || t.kind !== "inst") return null;
      var notes = chordNotes(t, a, b, style); if(!notes) return null;
      var r = { id:uid("r"), s:a, l:b - a, pat:newPat(b - a, notes), off:0, name:isBassTrack(t) ? "Bass line" : "Chords", gen:{ style:style } };
      sortNotes(S.pats[r.pat]);
      t.regions.push(r); clearUnder(t, r); sortRegions(t); growBars();
      return r;
    }
    // after the chords change: every part that still follows them is written again
    function chordFollow(){
      var n = 0;
      S.tracks.forEach(function(t){ if(t.kind !== "inst") return; t.regions.forEach(function(r){
        if(!r.gen || !r.pat) return;
        var notes = chordNotes(t, r.s, r.s + r.l, r.gen.style); if(!notes) return;
        if(linkCount(r.pat) > 1) unlinkRegion(r);
        var p = patOf(r); p.notes = notes; p.len = r.l; r.off = 0; sortNotes(p); n++;
      }); });
      return n;
    }
    // "Am7", "F#", "Bb maj7", "C/E" -> { root, q } or null
    function parseChord(txt){
      var m = /^\s*([A-Ga-g])\s*([#♯b♭]?)\s*([^\/\s]*)\s*(?:\/.*)?$/.exec(String(txt || "")); if(!m) return null;
      var root = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[m[1].toUpperCase()] + (m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0), x = m[3];
      var q = { "":"maj", M:"maj", maj:"maj", major:"maj", m:"min", min:"min", minor:"min", "-":"min", "7":"7", dom7:"7", maj7:"maj7", M7:"maj7", "Δ":"maj7", m7:"m7", min7:"m7", "-7":"m7",
                sus4:"sus4", sus:"sus4", sus2:"sus2", dim:"dim", "°":"dim", o:"dim", aug:"aug", "+":"aug", "6":"6", add9:"add9", "9":"9" }[x];
      if(q === undefined) q = { m:"min", min:"min", minor:"min", maj:"maj", major:"maj" }[x.toLowerCase()];
      return q === undefined ? null : { root:(root + 12) % 12, q:q };
    }
    // chords for a melody or a bass line: the chords of the key that hold the notes on the strong beats, in an order songs use
    var CHORD_NEXT = { // how readily chord (by degree) follows chord, major keys; used for minor too by position
      0:{ 3:0.12, 4:0.12, 5:0.1, 1:0.04, 0:0.04 }, 1:{ 4:0.14, 3:0.04, 0:0.02 }, 2:{ 5:0.1, 3:0.06 }, 3:{ 4:0.12, 0:0.12, 1:0.04, 5:0.04, 3:0.02 }, 4:{ 0:0.16, 5:0.1, 3:0.05, 4:0.02 }, 5:{ 3:0.13, 1:0.07, 4:0.06, 2:0.03, 5:0.02 }, 6:{ 0:0.1, 5:0.04 } };
    var CHORD_PRIOR = [0.16, 0.03, 0.0, 0.1, 0.1, 0.08, -0.3];
    function suggestChords(trackId, a, b, key){
      var t = trackById(trackId), bt = barTicks(), bq = pulseTicks(); if(!t || t.kind !== "inst") return null;
      key = key || S.key; if(!scaleOf(key)) return null;
      var cands = keyChords(key).filter(function(c){ return !c.alt; }), sc = scaleOf(key), nb = Math.round((b - a) / bt), w = [], bassLine, i, bar, all = [];
      t.regions.forEach(function(r){ eachNote(r, a, b, function(s, l, p){ all.push({ s:s, l:l, p:p + 12 * (t.oct || 0) }); }); });
      if(all.length < 2) return null;
      var med = all.map(function(n){ return n.p; }).sort(function(x, y){ return x - y; })[all.length >> 1]; bassLine = med < 50;
      for(bar = 0; bar < nb; bar++){
        var h = new Float64Array(12), first = null, ba = a + bar * bt, bb = ba + bt;
        all.forEach(function(n){
          var ov = Math.min(n.s + n.l, bb) - Math.max(n.s, ba); if(ov <= 0) return;
          var rel = n.s - ba, strength = rel >= 0 && rel < 20 ? 1.6 : (rel >= 0 && Math.abs(rel % bq) < 20 ? 1.2 : 0.75);
          h[n.p % 12] += (ov / bq) * strength;
          if(rel >= -10 && rel < bq / 2 && (first === null || n.p < first)) first = n.p;
        });
        w.push({ h:h, first:first });
      }
      function emit(bar2, ci){
        var c = cands[ci], tones = chordTones(c), h = w[bar2].h, s = CHORD_PRIOR[c.deg], tot = 0, k;
        for(k = 0; k < 12; k++){ if(!h[k]) continue; tot += h[k]; s += h[k] * (tones.indexOf(k) >= 0 ? 1 : sc.indexOf(k) >= 0 ? -0.4 : -0.9); }
        var base = tot ? s / Math.max(1, tot * 0.6) + CHORD_PRIOR[c.deg] : CHORD_PRIOR[c.deg] * 2;
        if(bassLine && w[bar2].first !== null){ var pc = w[bar2].first % 12; base += pc === c.root ? 1.1 : pc === tones[1] ? 0.3 : pc === tones[2] ? 0.15 : -0.6; }
        return base;
      }
      function best(pen){
        var N = cands.length, cost = [], back = [], j, k2;
        for(bar = 0; bar < nb; bar++){
          cost.push(new Float64Array(N)); back.push(new Int8Array(N));
          for(j = 0; j < N; j++){
            var e = emit(bar, j) - (pen && pen[bar] && pen[bar][j] ? pen[bar][j] : 0);
            if(bar === 0){ cost[0][j] = e + (cands[j].deg === 0 ? 0.08 : 0); continue; }
            var bv = -1e9, bi = 0;
            for(k2 = 0; k2 < N; k2++){ var tr = (CHORD_NEXT[cands[k2].deg] || {})[cands[j].deg] || 0, v = cost[bar - 1][k2] + tr * 2.2; if(v > bv){ bv = v; bi = k2; } }
            cost[bar][j] = bv + e; back[bar][j] = bi;
          }
        }
        var end = 0; for(j = 1; j < N; j++) if(cost[nb - 1][j] > cost[nb - 1][end]) end = j;
        var path = []; for(bar = nb - 1; bar >= 0; bar--){ path.unshift(end); end = back[bar][end]; }
        return path;
      }
      var outs = [], pen = [], p1 = best(null);
      outs.push(p1);
      for(i = 0; i < 2; i++){
        // another reading: what the earlier ones chose costs a little, so that it differs where the melody allows
        outs.forEach(function(pa){ pa.forEach(function(ci, bar2){ pen[bar2] = pen[bar2] || {}; pen[bar2][ci] = (pen[bar2][ci] || 0) + 0.9; }); });
        var pn = best(pen); if(!outs.some(function(o){ return o.join() === pn.join(); })) outs.push(pn);
      }
      return outs.map(function(pa){ return pa.map(function(ci, bar2){ return { t:a + bar2 * bt, root:cands[ci].root, q:cands[ci].q, num:cands[ci].num }; }); });
    }
    function chordsPaint(full){
      var E = UI.e, box = E.chordsEl, bt = barTicks(), k = S.key, hasKey = !!scaleOf(), i;
      var sig = [JSON.stringify(S.chords), CH.bar, CH.half, CH.track, CH.style, keyName(k), S.bars, S.tracks.map(function(t){ return t.id + t.name; }).join(), CH.alts ? CH.alts.length : 0, bt].join("|");
      if(!full && box.dataset.sig === sig) return; box.dataset.sig = sig; box.textContent = "";
      var left = el("div", "st-chgrid"), right = el("div", "st-chside");
      // bars
      var nb = Math.max(8, Math.min(S.bars, Math.ceil((Math.max(songTicks(), S.chords.length ? S.chords[S.chords.length - 1].t + bt : 0)) / bt) + 4));
      nb = Math.ceil(nb / 4) * 4;
      var strip = el("div", "st-chbars"); strip.setAttribute("role", "grid"); strip.setAttribute("aria-label", "Chords, bar by bar");
      for(i = 0; i < nb; i++){
        (function(bar){
          var cell = el("div", "st-chbar"), q = sectionAt(bar);
          cell.appendChild(el("span", "st-chno", (q && q.bar === bar ? q.name + " · " : "") + (bar + 1)));
          [0, 1].forEach(function(half){
            var tick = bar * bt + (half ? Math.round(bt / 2 / pulseTicks()) * pulseTicks() : 0), own = S.chords.filter(function(c){ return c.t === tick; })[0], cur = chordAt(tick);
            var b = btn("st-chslot" + (own ? " own" : ""), own ? chordName(own) : (half ? "" : (cur ? "〃" : "")), half ? "The second half of bar " + (bar + 1) : "Bar " + (bar + 1), function(){ CH.bar = bar; CH.half = half; chordsPaint(true); if(own) chordPlay(own); });
            b.setAttribute("aria-pressed", CH.bar === bar && CH.half === half ? "true" : "false"); if(half) b.classList.add("half");
            cell.appendChild(b);
          });
          strip.appendChild(cell);
        })(i);
      }
      left.appendChild(strip);
      // palette
      var selTick = CH.bar * bt + (CH.half ? Math.round(bt / 2 / pulseTicks()) * pulseTicks() : 0);
      function choose(root, q){ chordSet(selTick, root, q); commit("chord: " + chordName({ root:root, q:q })); chordPlay({ root:root, q:q }); if(!CH.half) CH.bar = Math.min(nb - 1, CH.bar + 1); CH.alts = null; refresh(true); }
      var pal = el("div", "st-chpal"), ph = el("div", "st-chhead");
      ph.appendChild(el("b", "", "Bar " + (CH.bar + 1) + (CH.half ? ", second half" : "")));
      ph.appendChild(el("span", "st-l", hasKey ? "Chords of " + keyName(k) : "No key chosen: every chord is listed"));
      if(!hasKey) ph.appendChild(tbtn("quiet", "Choose a key", "With a key, the list is the six or seven chords that belong together", function(e){ keyPop(e.currentTarget); }));
      ph.appendChild(el("span", "st-flex"));
      var typed = el("input", "st-i st-chtype"); typed.type = "text"; typed.placeholder = "Type one: Am7, F, G7"; typed.maxLength = 10; typed.id = "stchtype"; typed.setAttribute("aria-label", "Type a chord name for this bar"); typed.autocomplete = "off"; typed.spellcheck = false;
      typed.addEventListener("keydown", function(e){ e.stopPropagation(); if(e.key !== "Enter") return; var pc = parseChord(typed.value); if(!pc){ tell("“" + typed.value.slice(0, 10) + "” is not a chord name the Studio knows. Examples: C, Am, F7, Gmaj7, Dsus4, Bb."); return; } choose(pc.root, pc.q); setTimeout(function(){ var n = document.getElementById("stchtype"); if(n) n.focus(); }, 60); });
      ph.appendChild(typed);
      ph.appendChild(tbtn("quiet", "No chord here", "Take this chord away; the one before carries on", function(){ chordSet(selTick, null); commit("remove a chord"); refresh(true); }));
      pal.appendChild(ph);
      var row = el("div", "st-chrow");
      if(hasKey){
        keyChords().forEach(function(c){ var b = btn("st-chord", null, c.alt ? "The major chord on the fifth note: common in minor songs" : "", function(){ choose(c.root, c.q); }); b.appendChild(el("b", "", chordName(c))); b.appendChild(el("span", "", c.num)); row.appendChild(b); });
        pal.appendChild(row);
        var cur2 = chordAt(selTick);
        if(cur2){
          var row2 = el("div", "st-chrow small"); row2.appendChild(el("span", "st-l", "Colour " + NOTE_NAMES[cur2.root] + ":"));
          [["maj", "plain"], ["min", "minor"], ["7", "7"], ["maj7", "maj7"], ["m7", "m7"], ["sus4", "sus4"], ["sus2", "sus2"]].forEach(function(v){ var b = tbtn("", chordName({ root:cur2.root, q:v[0] }), v[1], function(){ var own = S.chords.filter(function(c){ return c.t === selTick; })[0]; chordSet(own ? selTick : cur2.t, cur2.root, v[0]); commit("chord: " + chordName({ root:cur2.root, q:v[0] })); chordPlay({ root:cur2.root, q:v[0] }); refresh(true); }); b.setAttribute("aria-pressed", cur2.q === v[0] ? "true" : "false"); row2.appendChild(b); });
          pal.appendChild(row2);
        }
      } else {
        ["maj", "min"].forEach(function(q){ var rw = el("div", "st-chrow small"); for(var r0 = 0; r0 < 12; r0++) (function(root){ var b = tbtn("", chordName({ root:root, q:q }), "", function(){ choose(root, q); }); rw.appendChild(b); })(r0); pal.appendChild(rw); });
      }
      left.appendChild(pal);
      // right: suggest, and write the part
      var insts = S.tracks.filter(function(t){ return t.kind === "inst"; });
      var s1 = el("div", "st-chbox"); s1.appendChild(el("b", "", "Suggest chords"));
      if(!insts.length) s1.appendChild(el("p", "st-note", "Hum a melody or a bass line first; chords can then be suggested for it."));
      else {
        var from = CH.from && trackById(CH.from) ? CH.from : insts[0].id; CH.from = from;
        var l1 = el("div", "st-chline"); l1.appendChild(lbl("For"));
        l1.appendChild(sel("", insts.map(function(t){ return [t.id, t.name]; }), from, "The track whose notes the chords should fit", function(v){ CH.from = v; CH.alts = null; chordsPaint(true); }));
        var sg = tbtn("primary", "Suggest", "Chords of the key that fit the notes on the strong beats", function(){
          var tr = trackById(CH.from), a = 1e12, b = 0; tr.regions.forEach(function(r){ a = Math.min(a, r.s); b = Math.max(b, r.s + r.l); });
          if(b <= a){ tell("That track has no notes yet."); return; }
          a = Math.floor(a / bt) * bt; b = Math.ceil(b / bt) * bt;
          var key = S.key, guessed = null;
          if(!scaleOf(key)){ var all = []; tr.regions.forEach(function(r){ eachNote(r, a, b, function(s, l, p){ all.push({ t:s, n:p, d:l }); }); }); guessed = dsp().suggestKey(all); if(!guessed){ tell("There are too few notes to tell the key. Choose one with the Key button at the top."); return; } key = { root:guessed.root, scale:guessed.scale }; }
          var res = suggestChords(CH.from, a, b, key);
          if(!res){ tell("There are too few notes on that track to suggest chords from."); return; }
          CH.alts = res; CH.altKey = guessed ? key : null; chordsPaint(true);
        }); sg.id = "stsuggest"; l1.appendChild(sg); s1.appendChild(l1);
        if(CH.alts){
          if(CH.altKey) s1.appendChild(el("p", "st-note", "The notes sound like " + keyName(CH.altKey) + ", so these are chords of that key. Using one sets the key too."));
          CH.alts.forEach(function(alt, ai){
            var ln = el("div", "st-chalt"), names = [], lastN = "";
            alt.forEach(function(c){ var nm = chordName(c); names.push(nm === lastN ? "〃" : nm); lastN = nm; });
            ln.appendChild(el("span", "st-chseq", names.join("   ")));
            ln.appendChild(tbtn("quiet", "Hear", "Play these chords, one bar each", function(){ chordsHear(alt); }));
            ln.appendChild(tbtn(ai === 0 ? "primary" : "", "Use", "Put these chords on the song", function(){
              if(CH.altKey) S.key = { root:CH.altKey.root, scale:CH.altKey.scale };
              var a2 = alt[0].t, b2 = alt[alt.length - 1].t + bt; S.chords = S.chords.filter(function(c){ return c.t < a2 || c.t >= b2; });
              alt.forEach(function(c){ S.chords.push({ t:c.t, root:c.root, q:c.q }); }); S.chords.sort(function(x, y){ return x.t - y.t; });
              for(var j = S.chords.length - 1; j > 0; j--) if(S.chords[j].root === S.chords[j - 1].root && S.chords[j].q === S.chords[j - 1].q) S.chords.splice(j, 1);
              chordFollow(); CH.alts = null; commit("use suggested chords"); refresh(true); tell("Chords set. “Write the part” below puts them on an instrument.");
            }));
            s1.appendChild(ln);
          });
        }
      }
      right.appendChild(s1);
      var s2 = el("div", "st-chbox"); s2.appendChild(el("b", "", "Have an instrument play them"));
      var l2 = el("div", "st-chline"); l2.appendChild(lbl("On"));
      var opts = insts.map(function(t){ return [t.id, t.name]; });
      [["new:keys", "A new piano track"], ["new:guitars", "A new guitar track"], ["new:strings", "A new strings track"], ["new:bass", "A new bass track"]].forEach(function(o){ opts.push(o); });
      if(!CH.track || (!/^new:/.test(CH.track) && !trackById(CH.track))) CH.track = "new:keys";
      var onT = /^new:/.test(CH.track) ? { inst:defaultInst(CH.track.slice(4)), kind:"inst", oct:0 } : trackById(CH.track), sts = stylesFor(onT);
      if(!sts.some(function(x){ return x[0] === CH.style; })) CH.style = styleDefault(onT);
      l2.appendChild(sel("", opts, CH.track, "The track that plays the chords", function(v){ CH.track = v; CH.style = ""; chordsPaint(true); }));
      s2.appendChild(l2);
      var l3 = el("div", "st-chline"); l3.appendChild(lbl("Style"));
      l3.appendChild(sel("", sts, CH.style, "How the instrument plays them", function(v){ CH.style = v; }));
      var wr = tbtn("primary", "Write the part", "Turn the chords into notes on that track. They can be edited like any others.", function(){ chordsWrite(); }); wr.id = "stwritechords";
      l3.appendChild(wr); s2.appendChild(l3);
      var fol = [];
      S.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.gen && fol.indexOf(t.name + ": " + styleName(r.gen.style).toLowerCase()) < 0) fol.push(t.name + ": " + styleName(r.gen.style).toLowerCase()); }); });
      s2.appendChild(el("p", "st-note", fol.length ? "Following the chords now: " + fol.join("; ") + ". Change a chord and these parts are written again. A part stops following once you edit its notes."
        : "The part is ordinary notes. It follows the chords (it is written again when they change) until you edit a note in it."));
      right.appendChild(s2);
      box.appendChild(left); box.appendChild(right);
    }

    // ---- mixer ----
    function mixerPaint(full){
      var E = UI.e, box = E.mixEl; if(!box || UI.tab !== "mixer") return;
      var sig = S.tracks.map(function(t){ return t.id + t.name + t.color; }).join("|");
      if(full || sig !== MX.sig){
        MX.sig = sig; MX.strips = {}; box.textContent = "";
        if(!S.tracks.length) box.appendChild(el("p", "st-note pad", "There are no tracks yet."));
        S.tracks.forEach(function(t){
          var st = { el:el("div", "st-strip") }, hd = el("div", "st-striphead"); st.el.style.setProperty("--tc", trackColor(t)); st.el.id = "ststrip-" + t.id;
          hd.appendChild(el("b", "", t.name)); hd.appendChild(el("span", "", t.kind === "audio" ? "Recording" : instName(soundFor(t)))); st.el.appendChild(hd);
          var body = el("div", "st-stripbody"); st.meter = el("div", "st-vmeter"); st.meter.appendChild(el("i")); body.appendChild(st.meter);
          var rows = el("div", "st-striprows");
          function row(name, min, max, step, get, set, title, fmt, term){
            var r = el("label", "st-srow"), i = el("input", "st-range"), v = el("span", "st-val", fmt(get()));
            var nm = el("span", "st-l", name); r.appendChild(nm); if(term) r.appendChild(helpDot(term));
            i.type = "range"; i.min = min; i.max = max; i.step = step; i.value = get(); i.title = title; i.setAttribute("aria-label", name + " of " + t.name);
            i.addEventListener("input", function(){ set(+i.value); v.textContent = fmt(get()); engSync(); if(name === "Volume" || name === "Pan") paintHeads(false); });
            i.addEventListener("change", function(){ commit(name.toLowerCase() + " of " + t.name, true); });
            i.addEventListener("dblclick", function(){ var def = name === "Volume" ? 80 : name === "Reverb" ? 18 : 0; i.value = def; set(def); v.textContent = fmt(get()); engSync(); commit(name.toLowerCase() + " of " + t.name, true); refresh(); });
            r.appendChild(i); r.appendChild(v); rows.appendChild(r); return i;
          }
          function dbf(x){ return x <= 0 ? "off" : (20 * Math.log(x / 0.8) / Math.LN10 >= 0 ? "+" : "") + (20 * Math.log(x / 0.8) / Math.LN10).toFixed(1) + " dB"; }
          st.vol = row("Volume", 0, 125, 1, function(){ return Math.round(t.vol * 100); }, function(v){ t.vol = v / 100; }, "Volume", function(){ return dbf(t.vol); });
          st.pan = row("Pan", -50, 50, 1, function(){ return Math.round(t.pan * 50); }, function(v){ t.pan = Math.abs(v) < 4 ? 0 : v / 50; }, "Left or right", function(){ return t.pan === 0 ? "centre" : (t.pan < 0 ? "L " : "R ") + Math.round(Math.abs(t.pan) * 100); });
          row("Reverb", 0, 100, 1, function(){ return Math.round(t.send * 100); }, function(v){ t.send = v / 100; }, "How much of the track goes into the room", function(){ return Math.round(t.send * 100) + "%"; }, "send");
          ["Low", "Mid", "High"].forEach(function(nm, k){ row(nm, -12, 12, 0.5, function(){ return t.eq[k]; }, function(v){ t.eq[k] = Math.abs(v) < 0.75 ? 0 : v; }, "Tone: " + nm.toLowerCase() + "s, in decibels", function(){ return (t.eq[k] > 0 ? "+" : "") + t.eq[k] + " dB"; }); });
          body.appendChild(rows); st.el.appendChild(body);
          var ft = el("div", "st-stripfoot");
          st.m = tbtn("st-ms", "M", "Mute", function(){ t.mute = !t.mute; commit(t.mute ? "mute " + t.name : "unmute " + t.name, true); engSync(); refresh(); });
          st.s = tbtn("st-ms solo", "S", "Solo", function(){ t.solo = !t.solo; commit(t.solo ? "solo " + t.name : "end solo of " + t.name, true); engSync(); refresh(); });
          ft.appendChild(st.m); ft.appendChild(st.s); st.el.appendChild(ft);
          MX.strips[t.id] = st; box.appendChild(st.el);
        });
        var ms = el("div", "st-strip master"), mh = el("div", "st-striphead"); mh.appendChild(el("b", "", "Master")); mh.appendChild(el("span", "", "Everything together")); ms.appendChild(mh);
        var mb = el("div", "st-stripbody"); MX.master = el("div", "st-vmeter wide"); MX.master.appendChild(el("i")); mb.appendChild(MX.master);
        var note = el("div", "st-striprows");
        var mr = el("label", "st-srow"), mi = el("input", "st-range"), mv = el("span", "st-val", "");
        function mdb(){ return S.mvol <= 0 ? "off" : (20 * Math.log(S.mvol) / Math.LN10 >= 0 ? "+" : "") + (20 * Math.log(S.mvol) / Math.LN10).toFixed(1) + " dB"; }
        mr.appendChild(el("span", "st-l", "Volume")); mi.type = "range"; mi.min = 0; mi.max = 125; mi.step = 1; mi.value = Math.round(S.mvol * 100); mi.title = "Volume of the whole song"; mi.setAttribute("aria-label", "Master volume"); mi.id = "stmaster"; mv.textContent = mdb();
        mi.addEventListener("input", function(){ S.mvol = +mi.value / 100; mv.textContent = mdb(); engSync(); }); mi.addEventListener("change", function(){ commit("master volume", true); });
        mi.addEventListener("dblclick", function(){ S.mvol = 1; mi.value = 100; mv.textContent = mdb(); engSync(); commit("master volume", true); });
        mr.appendChild(mi); mr.appendChild(mv); note.appendChild(mr);
        MX.lim = el("p", "st-note", ENG.limiterOK || !ENG.ctx ? "A limiter holds back peaks that would distort. If the meter sits in the red, turn the loudest track down." : "This browser has no limiter here: keep the meter out of the red."); note.appendChild(MX.lim); mb.appendChild(note);
        ms.appendChild(mb); box.appendChild(ms);
      }
      S.tracks.forEach(function(t){ var st = MX.strips[t.id]; if(!st) return; st.m.setAttribute("aria-pressed", t.mute ? "true" : "false"); st.s.setAttribute("aria-pressed", t.solo ? "true" : "false"); if(document.activeElement !== st.vol) st.vol.value = Math.round(t.vol * 100); if(document.activeElement !== st.pan) st.pan.value = Math.round(t.pan * 50); });
    }
    var mxHold = {};
    function mixerMeters(lv, zero){
      if(UI.tab !== "mixer" || !MX.master) return;
      function setM(elm, key, v){ var hold = Math.max(v || 0, (mxHold[key] || 0) * 0.85); mxHold[key] = zero ? 0 : hold; var pct = hold <= 0.0005 || zero ? 0 : clamp((20 * Math.log(hold) / Math.LN10 + 54) / 54, 0, 1); elm.firstChild.style.transform = "scaleY(" + pct.toFixed(3) + ")"; elm.dataset.hot = hold > 0.89 ? "true" : "false"; }
      S.tracks.forEach(function(t){ var st = MX.strips[t.id]; if(st) setM(st.meter, t.id, lv.tracks[t.id]); });
      setM(MX.master, "_m", lv.master);
    }
