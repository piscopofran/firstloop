    // ---------- Studio: the phone layout (inside a part, recording, chords, the mix, sharing, help and the phone check) ----------

    // ---- notes, by touch ----
    // a note under a fingertip: the row touched, a little either side of the note; failing that the row above or below
    function phNoteAt(p, sl, st){
      var f = rollRegion(), pat = f && patOf(f.r); if(!pat) return null;
      var u = rollU(p.x, sl), xx = u * ROLL.ppt, best = null, bd = 1e9, i;
      for(i = pat.notes.length - 1; i >= 0; i--){
        var n = pat.notes[i], x0 = n.s * ROLL.ppt, x1 = Math.max(x0 + 6, (n.s + n.l) * ROLL.ppt), yc = rollY(n.p, st) + ROLL.rowH / 2;
        var dx = xx < x0 ? x0 - xx : xx > x1 ? xx - x1 : 0, dy = Math.abs(p.y - yc);
        if(dx > 12 || dy > ROLL.rowH * 0.5 + 9) continue;
        var d = dx + (dy > ROLL.rowH / 2 ? 20 + dy : 0);
        if(d < bd){ bd = d; best = n; }
      }
      return best ? { n:best } : null;
    }
    function phRollWide(){ if(ROLL.ppt < 0.1){ ROLL.ppt = 0.1; ROLL.view.ask(); } }
    function phRollDown(p, e, f){
      var host = ROLL.host, sl = host.scrollLeft, st = host.scrollTop, r = f.r, t = f.t, pat = patOf(r), gh = host.clientHeight;
      if(p.y < ROLL.rulerH) return null;
      if(p.x < ROLL.keysW){
        // the keys: a note sounds while it is held
        var kp = rollP(p.y, st); ROLL.downKey = kp; liveOn(t, kp, 96, "key"); ROLL.view.ask();
        return { move:function(q){ var np = rollP(q.y, host.scrollTop); if(np !== ROLL.downKey && q.y < gh && q.y > ROLL.rulerH){ ROLL.downKey = np; liveOn(t, np, 96, "key"); ROLL.view.ask(); } },
                 up:function(){ liveOff("key"); ROLL.downKey = -1; ROLL.view.ask(); }, cancel:function(){ liveOff("key"); ROLL.downKey = -1; ROLL.view.ask(); } };
      }
      var hit = phNoteAt(p, sl, st);
      if(PH.lasso && !hit){
        // "Select" is on: a drag draws a box, and what it touches is selected
        var keep = ROLL.sel.slice(), m = ROLL.marquee = { x0:p.x, y0:p.y, x1:p.x, y1:p.y, sl:sl, st:st }, movedM = false;
        return {
          move:function(q){
            if(!movedM && Math.hypot(q.x - p.x, q.y - p.y) < 6) return; movedM = true;
            m.x0 = Math.min(p.x, q.x); m.x1 = Math.max(p.x, q.x); m.y0 = Math.max(ROLL.rulerH, Math.min(p.y, q.y)); m.y1 = Math.min(gh, Math.max(p.y, q.y));
            var ua = rollU(m.x0, host.scrollLeft), ub = rollU(m.x1, host.scrollLeft), ph = rollP(m.y0, host.scrollTop), pl = rollP(m.y1, host.scrollTop);
            ROLL.sel = keep.concat(pat.notes.filter(function(n){ return keep.indexOf(n) < 0 && n.s < ub && n.s + n.l > ua && n.p <= ph && n.p >= pl; }));
            ROLL.view.ask();
          },
          up:function(){ ROLL.marquee = null; if(!movedM) ROLL.sel = []; ROLL.view.ask(); phBars(); phTools(true); },
          cancel:function(){ ROLL.marquee = null; ROLL.view.ask(); }
        };
      }
      if(!hit) return null;
      // a note: it follows the finger, landing on the grid; the loupe above the finger shows what the finger hides
      var n = hit.n, was = ROLL.sel.indexOf(n) >= 0, sole = was && ROLL.sel.length === 1;
      if(!was) ROLL.sel = PH.lasso ? ROLL.sel.concat([n]) : [n];
      phBars();
      var group = ROLL.sel.slice(), orig = group.map(function(x){ return { s:x.s, l:x.l, p:x.p }; }), moved = false, lastP = n.p, grabU = rollU(p.x, sl) - n.s;
      var minS = Math.min.apply(null, orig.map(function(o){ return o.s; })), maxP = Math.max.apply(null, orig.map(function(o){ return o.p; })), minP = Math.min.apply(null, orig.map(function(o){ return o.p; }));
      blip(t, n.p, n.v, 0.22); ROLL.lastLen = n.l; ROLL.lastVel = n.v; ROLL.view.ask();
      return {
        move:function(q){
          if(!moved && Math.hypot(q.x - p.x, q.y - p.y) < 8) return; moved = true;
          var k = group.indexOf(n), ns = rollSnapT(rollU(q.x, host.scrollLeft) - grabU), dt = Math.max(-minS, ns - orig[k].s), dp = clamp(rollP(q.y, host.scrollTop) - rollP(p.y, st), -minP, 127 - maxP), i2;
          for(i2 = 0; i2 < group.length; i2++){ group[i2].s = orig[i2].s + dt; group[i2].p = orig[i2].p + dp; }
          if(n.p !== lastP){ lastP = n.p; blip(t, n.p, n.v, 0.2); }
          PH.loupe = { x:q.x, y:q.y, n:n }; ROLL.view.ask();
          if(q.x > host.clientWidth - 26) host.scrollLeft += 10; else if(q.x < ROLL.keysW + 26) host.scrollLeft -= 10;
        },
        up:function(){
          PH.loupe = null; PH.e.loupe.hidden = true;
          if(!moved){
            // a tap on a note: select it, or let it go when it was the one selected
            if(PH.lasso){ if(was) ROLL.sel.splice(ROLL.sel.indexOf(n), 1); } else if(sole) ROLL.sel = [];
            ROLL.view.ask(); phBars(); return;
          }
          group.forEach(function(x){ if(x.m) delete x.m; if(x.c) delete x.c; if(ROLL.keySnap) x.p = snapToScale(x.p); });
          noteEdited(f); commit("move notes");
        },
        cancel:function(){ PH.loupe = null; PH.e.loupe.hidden = true; group.forEach(function(x, i3){ x.s = orig[i3].s; x.l = orig[i3].l; x.p = orig[i3].p; }); ROLL.view.ask(); }
      };
    }
    function phRollTap(p){
      var f = rollRegion(), host = ROLL.host; if(!f) return;
      var sl = host.scrollLeft, st = host.scrollTop, pat = patOf(f.r), u = rollU(p.x, sl);
      if(p.y < ROLL.rulerH){ if(p.x > ROLL.keysW) setPos(Math.max(0, f.r.s + rollSnapT(u))); return; }
      if(p.x < ROLL.keysW || PH.res) return;
      if(PH.lasso){ if(ROLL.sel.length){ ROLL.sel = []; ROLL.view.ask(); phBars(); } return; }
      if(u < 0 || u >= rollLen(f)) return;
      // empty grid: a note goes there, as long as the last one made and as loud
      var g = rollGrid() || PPQ / 4, s = Math.max(0, Math.floor(u / g) * g), pitch = rollP(p.y, st);
      if(ROLL.keySnap) pitch = snapToScale(pitch);
      var n = { s:s, l:Math.max(g, Math.min(ROLL.lastLen, PPQ * 2)), p:clamp(pitch, 0, 127), v:ROLL.lastVel };
      pat.notes.push(n); ROLL.sel = [n]; blip(f.t, n.p, n.v, 0.25); noteEdited(f); commit("add a note");
    }
    // the loupe: twice the size, what is under the finger, and in words where the note is
    function phLoupePaint(){
      var L = PH.loupe, cv = PH.e.loupe, src = ROLL.view.cv, f = rollRegion(); if(!L || !f) return;
      var host = ROLL.host, d = ROLL.view.dpr || 1, W = 156, H = 92, Z = 2, n = L.n;
      if(cv.width !== W * 2){ cv.width = W * 2; cv.height = H * 2; cv.style.width = W + "px"; cv.style.height = H + "px"; }
      var nx = rollX(n.s, host.scrollLeft), ny = rollY(n.p, host.scrollTop), cx = nx + Math.min(60, n.l * ROLL.ppt) / 2, cy = ny + ROLL.rowH / 2, sw = W / Z, sh = (H - 22) / Z, c = cv.getContext("2d"), C = colors();
      c.setTransform(2, 0, 0, 2, 0, 0); c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
      try { c.drawImage(src, Math.max(0, (cx - sw / 2) * d), Math.max(0, (cy - sh / 2) * d), sw * d, sh * d, 0, 0, W, H - 22); } catch(e){}
      c.fillStyle = C.surface2; c.fillRect(0, H - 22, W, 22); c.fillStyle = C.ink; c.font = "600 12px " + FONT; c.textBaseline = "middle"; c.textAlign = "center";
      c.fillText(noteName(n.p + 12 * (f.t.oct || 0)) + "   " + posText(f.r.s + n.s), W / 2, H - 10.5);
      c.strokeStyle = C.ink3; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1);
      var hr = host.getBoundingClientRect(), rr2 = UI.root.getBoundingClientRect(), x = clamp(hr.left - rr2.left + L.x - W / 2, 4, rr2.width - W - 4), y = hr.top - rr2.top + L.y - H - 54;
      if(y < 4) y = hr.top - rr2.top + L.y + 54;
      cv.style.left = Math.round(x) + "px"; cv.style.top = Math.round(y) + "px"; cv.hidden = false;
    }
    function phHearSel(){
      var f = rollRegion(), list = ROLL.sel.slice().sort(function(a, b){ return a.s - b.s; }); if(!f || !list.length) return;
      ensureEngine().then(function(ok){
        if(!ok) return; resume(); if(TR.playing) transportStop(); auditionStop(); silence(ENG.G, undefined, true);
        var G = ENG.G, t0 = G.ctx.currentTime + 0.05, a = list[0].s;
        list.slice(0, 64).forEach(function(n){ playNote(G, f.t, n.p, n.v, t0 + tickSec(n.s - a), Math.max(0.12, tickSec(n.l))); });
      });
    }
    function phNotebar(){
      var E = PH.e, show = PH.screen === "edit" && UI.tab === "notes" && ROLL.sel.length > 0 && !PH.res && !!rollRegion();
      if(!E.notebar.firstChild){
        var g = function(){ return rollGrid() || PPQ / 4; };
        [["up", "Up", function(){ rollDo("transpose", 1); }], ["dn", "Down", function(){ rollDo("transpose", -1); }], ["left", "Earlier", function(){ rollDo("nudge", -g()); }], ["right", "Later", function(){ rollDo("nudge", g()); }], ["ear", "Hear", phHearSel],
         ["shorter", "Shorter", function(){ rollDo("stretch", -g()); }], ["longer", "Longer", function(){ rollDo("stretch", g()); }], ["split", "Split", function(){ rollDo("split"); }], ["trash", "Delete", function(){ rollDo("delete"); }], ["more", "More", phNoteMore]]
          .forEach(function(a){ var b = btn("sp-nb", null, "", a[2]); b.id = "spnb-" + a[1].toLowerCase(); b.appendChild(ico(a[0], !!ICON_LINE[a[0]])); b.appendChild(el("span", "", a[1])); E.notebar.appendChild(b); });
      }
      if(E.notebar.hidden !== !show){ E.notebar.hidden = !show; UI.root.dataset.notebar = show ? "on" : "off"; }
      E.notebar.setAttribute("aria-label", ROLL.sel.length + (ROLL.sel.length === 1 ? " note selected" : " notes selected"));
    }
    function phNoteMore(){
      var n = ROLL.sel.length, g = rollGrid() || PPQ / 4;
      sheet(n + (n === 1 ? " note selected" : " notes selected"), function(body, close){
        phList(body, [
          { t:"Louder", stay:true, run:function(){ rollDo("velocity", 10); } }, { t:"Softer", stay:true, run:function(){ rollDo("velocity", -10); } },
          { t:"Up an octave", run:function(){ rollDo("transpose", 12); } }, { t:"Down an octave", run:function(){ rollDo("transpose", -12); } },
          { t:"Duplicate", d:"A copy straight after", run:function(){ rollDo("duplicate"); } },
          { t:"Join", d:"Notes of the same pitch become one", off:n < 2, run:function(){ rollDo("join"); } },
          { t:"Hold each note until the next", run:function(){ rollDo("legato"); } },
          { t:"Onto the grid", d:"Move the starts to the nearest step", run:function(){ rollDo("quantise", { strength:1 }); } },
          { t:"Fit to the song’s key", off:!scaleOf(), run:function(){ rollDo("tokey"); } },
          { t:"Select all the notes", run:function(){ rollDo("all"); phBars(); } }, { t:"Let go of the selection", run:function(){ rollDo("none"); phBars(); } }
        ], close);
        void g;
      }, { id:"spnotemore" });
    }
    // drums: a tap puts a hit, takes it away, or changes how hard it is
    function phDrumTap(p){
      var f = drumRegion(), host = DG.host; if(!f) return;
      var sl = host.scrollLeft, st = host.scrollTop, pat = patOf(f.r), g = DG.grid;
      if(p.y < DG.rulerH){ if(p.x > DG.nameW) setPos(Math.max(0, f.r.s + Math.round((p.x - DG.nameW + sl) / DG.ppt / g) * g)); return; }
      if(p.x < DG.nameW) return;
      DG.rows = drumRows(f.t, pat, DG.all);
      var row = Math.floor((p.y - DG.rulerH + st) / DG.rowH), k = Math.floor((p.x - DG.nameW + sl) / DG.ppt / g); if(row < 0 || row >= DG.rows.length || k < 0 || k * g >= rollLen(f)) return;
      var pitch = DRUM[DG.rows[row]], s = k * g, hit = pat.notes.filter(function(n){ return n.p === pitch && n.s >= s - g * 0.25 && n.s < s + g * 0.75; })[0];
      if(!hit){ pat.notes.push({ s:s, l:Math.min(g, PPQ / 4), p:pitch, v:DG.level }); if(!TR.playing) blip(f.t, pitch, DG.level); sortNotes(pat); if(f.r.drum) f.r.drum.edited = true; commit("add drum hits"); }
      else if((hit.v >= 110 ? 120 : hit.v < 64 ? 52 : 96) === DG.level){ pat.notes.splice(pat.notes.indexOf(hit), 1); if(f.r.drum) f.r.drum.edited = true; commit("remove drum hits"); }
      else { hit.v = DG.level; if(!TR.playing) blip(f.t, pitch, DG.level); if(f.r.drum) f.r.drum.edited = true; commit("change how hard a hit is"); }
    }
    function phTakeTap(p){
      var f = takeRegion(); if(!f) return;
      var G = takeGeom(f), tick = G.t0 + (p.x + TK.host.scrollLeft) / TK.ppt;
      setPos(Math.max(0, Math.round(tick / (PPQ / 4)) * (PPQ / 4)));
    }

    // ---- the row of tools above a part ----
    function phTools(full){
      var E = PH.e, box = E.tools, f = selRegion(), tab = UI.tab, on = PH.screen === "edit" && tab !== "lyrics" && !!f && !PH.res;
      box.hidden = !on; if(!on){ PH.sig.tools = ""; return; }
      var r = f.r, t = f.t, sig = [tab, r.id, PH.lasso, ROLL.snap, DG.level, r.hum ? 1 : 0, r.drum ? r.drum.feel + r.drum.vari + r.drum.fill : "", r.takes ? r.takes.length + ":" + r.act + ":" + r.gain + ":" + (r.fi ? 1 : 0) + (r.fo ? 1 : 0) : "", AREC ? 1 : 0].join("|");
      if(!full && sig === PH.sig.tools) return; PH.sig.tools = sig; box.textContent = "";
      function tb(text, id, fn, pressed){ var b = tbtn("sp-tb", text, "", fn); b.id = id; if(pressed !== undefined) b.setAttribute("aria-pressed", pressed ? "true" : "false"); box.appendChild(b); return b; }
      if(tab === "notes" && t.kind === "inst"){
        tb("Select", "sptool-select", function(){ PH.lasso = !PH.lasso; if(!PH.lasso){ ROLL.marquee = null; } phTools(true); tell(PH.lasso ? "Select is on: drag a box round notes, or tap them one by one. Tap Select again to go back to moving the view." : "Select is off."); }, PH.lasso);
        var sn = sel("sp-ts", [["auto", "Snap: auto"], [PPQ, "Snap: 1/4"], [PPQ / 2, "Snap: 1/8"], [PPQ / 4, "Snap: 1/16"], [PPQ / 3, "Snap: triplet"], [0, "Snap: off"]], ROLL.snap, "What notes land on when moved or added", function(v){ ROLL.snap = v === "auto" ? "auto" : +v; rollAsk(); phTools(true); });
        sn.id = "sptool-snap"; box.appendChild(sn);
        tb("Fit", "sptool-fit", function(){ rollFit(); phRollWide(); });
        if(r.hum) tb("Timing and pitch", "sptool-hum", function(){ PH.res = r.id; ROLL.sel = []; refresh(true); });
        tb("More", "sptool-more", function(){ phPartMore(); });
      } else if(tab === "drums" && t.kind === "drums"){
        tb("Feel: " + (r.drum && r.drum.feel ? feelName(r.drum.feel) : "none"), "sptool-feel", function(){ phFeelSheet(t.id); });
        var lv = seg([[52, "Soft"], [96, "Normal"], [120, "Hard"]], DG.level, function(v){ DG.level = +v; lv.set(v); PH.sig.tools = ""; }, "How hard a new hit is"); lv.id = "sptool-level"; box.appendChild(lv);
        tb("More", "sptool-more", function(){ phPartMore(); });
      } else if(tab === "take" && t.kind === "audio"){
        tb(r.takes.length > 1 ? "Take " + (r.act + 1) + " of " + r.takes.length : "Take 1", "sptool-takes", function(){ phTakesSheet(); });
        tb("Level " + ((r.gain || 0) > 0 ? "+" : "") + (r.gain || 0) + " dB", "sptool-gain", function(){ phTakeLevel(); });
        tb("Record again", "sptool-again", function(){ setPos(r.s); recordAudio(t.id); });
        tb("More", "sptool-more", function(){ phPartMore(); });
      }
    }
    function phPartMore(){
      var f = selRegion(); if(!f) return;
      var r = f.r, t = f.t, tab = UI.tab, pat = patOf(r), bt = barTicks();
      sheet(t.name, function(body, close){
        var items = [];
        if(tab === "notes"){
          items.push({ t:"Select all the notes", run:function(){ rollDo("all"); phBars(); } });
          items.push({ t:"All notes onto the grid", d:"Move every start to the nearest step", run:function(){ ROLL.sel = []; rollDo("quantise", { strength:1 }); } });
          items.push({ t:"Stay in key", d:scaleOf() ? "New and moved notes land on notes of " + keyName(S.key) : "The song has no key yet", on:ROLL.keySnap && !!scaleOf(), off:!scaleOf(), stay:true, run:function(b){ ROLL.keySnap = !ROLL.keySnap; b.setAttribute("aria-pressed", ROLL.keySnap ? "true" : "false"); b.lastChild.textContent = ROLL.keySnap ? "On" : "Off"; } });
          items.push({ t:"Show the other tracks faintly", on:ROLL.ghost, stay:true, run:function(b){ ROLL.ghost = !ROLL.ghost; rollAsk(); b.setAttribute("aria-pressed", ROLL.ghost ? "true" : "false"); b.lastChild.textContent = ROLL.ghost ? "On" : "Off"; } });
          if(r.hum) items.push({ t:"Hum it again", d:"Record this part once more, in the same place", run:function(){ humSheet(t.id, { at:r.s, bars:Math.round(r.l / bt) }); } });
        } else if(tab === "drums"){
          items.push({ t:"Busier", d:"More hats, soft snare notes, an extra kick", stay:true, run:function(){ if(drumDensity(f, 1)) commit("busier drums"); else tell("That is as busy as this gets. Add hits by hand on the grid."); } });
          items.push({ t:"Sparser", d:"Take a layer away", stay:true, run:function(){ if(drumDensity(f, -1)) commit("sparser drums"); else tell("There is nothing left to take away but the main hits."); } });
          items.push({ t:"Humanise", d:"Small differences from hit to hit, as a drummer has", run:function(){ drumHumanise(f); commit("humanise drums"); } });
          items.push({ t:"Steps of the grid", v:DG.grid === PPQ / 2 ? "1/8" : DG.grid === PPQ / 3 ? "triplets" : DG.grid === PPQ / 8 ? "1/32" : "1/16", stay:true, run:function(b){ var o = [PPQ / 2, PPQ / 4, PPQ / 3, PPQ / 8]; DG.grid = o[(o.indexOf(DG.grid) + 1) % o.length]; DG.forRegion = null; drumAsk(); b.lastChild.textContent = DG.grid === PPQ / 2 ? "1/8" : DG.grid === PPQ / 3 ? "triplets" : DG.grid === PPQ / 8 ? "1/32" : "1/16"; } });
          if(kitExtras(f.t)) items.push({ t:"Show every piece of the kit", on:!!DG.all, stay:true, run:function(b){ DG.all = !DG.all; drumAsk(); b.setAttribute("aria-pressed", DG.all ? "true" : "false"); b.lastChild.textContent = DG.all ? "On" : "Off"; } });
        } else if(tab === "take"){
          items.push({ t:"Fade in", on:!!r.fi, stay:true, run:function(b){ r.fi = r.fi ? 0 : Math.min(0.5, tickSec(r.l) / 4); commit("fade in"); b.setAttribute("aria-pressed", r.fi ? "true" : "false"); b.lastChild.textContent = r.fi ? "On" : "Off"; } });
          items.push({ t:"Fade out", on:!!r.fo, stay:true, run:function(b){ r.fo = r.fo ? 0 : Math.min(1.5, tickSec(r.l) / 3); commit("fade out"); b.setAttribute("aria-pressed", r.fo ? "true" : "false"); b.lastChild.textContent = r.fo ? "On" : "Off"; } });
          items.push({ t:"Split at the playhead", off:!(TR.pos > r.s && TR.pos < r.s + r.l), run:function(){ regionSplit(); } });
          items.push({ t:"Turn this take into notes", d:"What was sung is written as notes for an instrument", run:function(){
            tell("Listening to the take…");
            takeToNotes(r.id, null).then(function(res){
              if(!res || !res.ok){ tell(res && res.why ? res.why : "No notes were found in that take."); return; }
              if(res.key && res.key.r > 0.55) UI.humSug = { region:res.region, key:res.key };
              select(res.track, res.region); PH.res = res.region; phGo("edit", { tab:"notes" }); tell(res.notes + " notes written on a new piano track.");
            }, function(){ tell("That take could not be read."); });
          } });
          items.push({ t:"Bring in a sound file", d:"Put a recording from this phone on the track at the playhead", run:function(){ pickFile(MOB.handheld ? "audio/*" : "audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aif,.aiff", function(file){ tell("Reading " + file.name + "…"); audioImport(t.id, file).then(function(r2){ if(r2){ select(t.id, r2.id); refresh(true); tell("Placed at the playhead."); } }, function(e){ tell(e && e.message === "long" ? "That file is longer than ten minutes, which is more than a track here can hold." : "That file could not be read as sound."); }); }); } });
        }
        if(pat){
          var bars = Math.round(pat.len / bt * 100) / 100;
          items.push({ h:"The part is " + bars + (bars === 1 ? " bar" : " bars") + " long" });
          items.push({ t:"One bar longer", stay:true, run:function(){ partLength(1); } }, { t:"One bar shorter", off:pat.len <= bt, stay:true, run:function(){ partLength(-1); } });
        }
        phList(body, items, close);
      }, { id:"sppartmore" });
    }
    function phTakesSheet(){
      var f = takeRegion(); if(!f) return; var r = f.r;
      sheet("Takes of this place", function(body, close){
        function paint(){
          body.textContent = "";
          body.appendChild(line("st-lead", "Each recording of the same place is kept as a take. The one chosen here is the one that plays."));
          var list = el("div", "sp-list");
          r.takes.forEach(function(id, i){
            var row = el("div", "sp-takerow"), ti = takeCache[id], b = btn("sp-row", null, "", function(){ r.act = i; loadTakes().then(function(){ ARR.view.ask(); takeAsk(); }); commit("choose take " + (i + 1)); paint(); });
            b.setAttribute("aria-pressed", r.act === i ? "true" : "false"); b.id = "sptake-" + i;
            var tx = el("span", "sp-rowt"); tx.appendChild(el("b", "", "Take " + (i + 1))); tx.appendChild(el("span", "", ti ? timeText(ti.len / ti.sr) + (ti.made ? ", " + fmtWhen(ti.made) : "") : "")); b.appendChild(tx);
            b.appendChild(el("span", "sp-rowv", r.act === i ? "Plays" : "Choose"));
            row.appendChild(b);
            if(r.takes.length > 1){ var del = ibtn("sp-ib", "trash", "Delete take " + (i + 1), "", function(){ if(del.dataset.sure !== "true"){ del.dataset.sure = "true"; tell("Tap the bin once more to delete take " + (i + 1) + "."); setTimeout(function(){ del.dataset.sure = ""; }, 4000); return; } r.takes.splice(i, 1); r.act = clamp(r.act > i ? r.act - 1 : r.act, 0, r.takes.length - 1); commit("delete a take"); loadTakes().then(function(){ refresh(true); }); paint(); }); del.removeAttribute("title"); row.appendChild(del); }
            list.appendChild(row);
            if(!ti) takeInfo(id).then(function(v){ if(v && b.isConnected) paint(); });
          });
          body.appendChild(list);
          var acts = el("div", "st-acts");
          acts.appendChild(tbtn("big", "Hear it", "", function(){ silentTip(); transportPlay({ from:r.s, stopAt:r.s + r.l }); }));
          acts.appendChild(tbtn("primary big", "Record another take", "", function(){ close(); setPos(r.s); recordAudio(f.t.id); }));
          body.appendChild(acts);
        }
        paint();
      }, { id:"sptakes" });
    }
    function phTakeLevel(){
      var f = takeRegion(); if(!f) return; var r = f.r;
      sheet("Level of this recording", function(body){
        body.appendChild(phSlider("Louder or quieter", -24, 12, 0.5, function(){ return r.gain || 0; }, function(v){ r.gain = v; takeAsk(); ARR.view.ask(); }, function(){ return ((r.gain || 0) > 0 ? "+" : "") + (r.gain || 0) + " dB"; }, function(){ commit("level of a recording", true); refresh(); }, "sptakegain"));
        body.appendChild(line("st-note", "This changes this recording only. The track’s own level is in the Mix."));
      }, { id:"sptakelevel" });
    }
    // drums: the feel of a part, and how busy it is, part by part
    function phFeelSheet(trackId){
      var t = trackById(trackId); if(!t || t.kind !== "drums") return;
      var bt = barTicks(), cur = (UI.sel.region && t.regions.filter(function(r){ return r.id === UI.sel.region; })[0]) || phRegionNear(t);
      if(!cur){ cur = addRegion(t, Math.floor(TR.pos / bt) * bt, bt * 4, []); drumPreset(cur, beatPlan().compound ? "ballad68" : "pop", 0, false); commit("new drum part"); }
      var all = false;
      sheet("Drums: the feel", function(body, close){
        function name(r){ var q = sectionAt(Math.floor(r.s / bt)); return (q && q.bar * bt === r.s ? q.name : "Bars " + (Math.floor(r.s / bt) + 1) + " to " + Math.ceil((r.s + r.l) / bt)); }
        function each(fn){ (all ? t.regions : [cur]).forEach(fn); }
        function paint(){
          body.textContent = ""; if(t.regions.indexOf(cur) < 0) cur = t.regions[0]; if(!cur){ close(); return; }
          var dr = cur.drum || {};
          if(t.regions.length > 1){
            body.appendChild(el("div", "sp-listh", "Which part"));
            var parts = el("div", "sp-opts"), ab = tbtn("", "Every part", "", function(){ all = true; paint(); }); ab.setAttribute("aria-pressed", all ? "true" : "false"); parts.appendChild(ab);
            t.regions.forEach(function(r){ var b = tbtn("", name(r), "", function(){ all = false; cur = r; select(t.id, r.id); paint(); }); b.setAttribute("aria-pressed", !all && r === cur ? "true" : "false"); parts.appendChild(b); });
            body.appendChild(parts);
          }
          body.appendChild(el("div", "sp-listh", "Feel"));
          var grid = el("div", "sp-opts sp-feels");
          FEELS.forEach(function(x){ var b = tbtn("", x.name, "", function(){ each(function(r){ drumPreset(r, x.id, r.drum ? r.drum.vari || 0 : 0, !!(r.drum && r.drum.fill)); }); commit("drum feel: " + x.name); paint(); hear(); }); b.dataset.feel = x.id; b.setAttribute("aria-pressed", dr.feel === x.id ? "true" : "false"); grid.appendChild(b); });
          body.appendChild(grid);
          var vr = el("div", "sp-frow"); vr.appendChild(el("span", "st-l", "Variation"));
          vr.appendChild(seg([[0, "A"], [1, "B"], [2, "C"]], dr.feel ? dr.vari || 0 : -1, function(v){ each(function(r){ if(r.drum && r.drum.feel) drumPreset(r, r.drum.feel, +v, !!r.drum.fill); }); commit("drum variation"); paint(); hear(); }, "Variation"));
          var fb = tbtn("", "Fill at the end", "", function(){ var onF = !(cur.drum && cur.drum.fill); each(function(r){ if(r.drum && r.drum.feel) drumPreset(r, r.drum.feel, r.drum.vari || 0, onF); }); commit(onF ? "add a drum fill" : "remove the drum fill"); paint(); }); fb.setAttribute("aria-pressed", dr.fill ? "true" : "false"); vr.appendChild(fb);
          body.appendChild(vr);
          var ir = el("div", "sp-frow"); ir.appendChild(el("span", "st-l", "How busy"));
          var two = el("div", "sp-two");
          two.appendChild(tbtn("big", "Sparser", "", function(){ var n = 0; each(function(r){ if(drumDensity({ t:t, r:r }, -1)) n++; }); if(n){ commit("sparser drums"); hear(); } else tell("There is nothing left to take away but the main hits."); }));
          two.appendChild(tbtn("big", "Busier", "", function(){ var n = 0; each(function(r){ if(drumDensity({ t:t, r:r }, 1)) n++; }); if(n){ commit("busier drums"); hear(); } else tell("That is as busy as this gets. Add hits by hand on the grid."); }));
          ir.appendChild(two); body.appendChild(ir);
          phList(body, [{ t:"Kit", v:instName(t.inst), go:true, run:function(){ instBrowser(null, t.id); } }], close);
          var acts = el("div", "st-acts");
          acts.appendChild(tbtn("big", TR.playing ? "Stop" : "Hear it", "", function(){ if(TR.playing) transportStop(); else hear(true); paint(); }));
          acts.appendChild(tbtn("big", "Edit the hits", "", function(){ close(); select(t.id, cur.id); phGo("edit", { tab:"drums" }); }));
          acts.appendChild(tbtn("primary big", "Done", "", function(){ close(); }));
          body.appendChild(acts);
        }
        function hear(force){ if(!force && !TR.playing) return; silentTip(); loadInst(t.inst); transportPlay({ from:cur.s, stopAt:cur.s + Math.min(cur.l, bt * 4) }); }
        paint();
      }, { id:"spfeel", onClose:function(){ if(TR.playing && TR.stopAt !== undefined) transportStop(); refresh(true); } });
    }

    // ---- a hummed part: hear it, and the choices worked out again from the same take ----
    function phHumPanel(full){
      var E = PH.e, f = rollRegion(), show = PH.screen === "edit" && UI.tab === "notes" && !!f && !!f.r.hum && PH.res === f.r.id, box = E.hum;
      UI.root.dataset.res = show ? "on" : "off";
      if(!show){ if(!box.hidden){ box.hidden = true; box.textContent = ""; PH.sig.hum = ""; } if(PH.res && PH.screen === "edit" && (!f || f.r.id !== PH.res)) PH.res = null; return; }
      var r = f.r, t = f.t, h = r.hum, sug = UI.humSug && UI.humSug.region === r.id ? UI.humSug : null;
      var sig = [r.id, h.timing, h.grid, h.pitch, h.octave, h.edited, sug ? JSON.stringify(sug.key || 0) + JSON.stringify(sug.tempo || 0) : "", audition ? audition.mode : "", keyName(S.key), t.inst].join("|");
      if(!full && sig === PH.sig.hum && !box.hidden) return; PH.sig.hum = sig; box.hidden = false; box.textContent = "";
      function redo(label){ humRedo(r.id).then(function(res){ if(res){ commit(label); if(res.early) tell(res.early + (res.early === 1 ? " note was" : " notes were") + " sung before the part begins and left out."); } }); }
      function row(label, node, id){ var w = el("div", "sp-frow"); w.appendChild(el("span", "st-l", label)); w.appendChild(node); if(id) node.id = id; box.appendChild(w); return w; }
      box.appendChild(el("div", "sp-humh", patOf(r).notes.length + (patOf(r).notes.length === 1 ? " note" : " notes") + " on " + instName(soundFor(t)) + ". The line is your voice."));
      if(sug && (sug.tempo || sug.key)){
        var s2 = el("div", "sp-sug"); s2.setAttribute("role", "status"); s2.id = "spsug";
        if(sug.tempo){
          s2.appendChild(el("span", "", "The pulse of what you hummed is about " + sug.tempo.bpm + " BPM."));
          s2.appendChild(tbtn("primary", "Set the song to " + sug.tempo.bpm, "", function(){ var sg = sug.tempo; sug.tempo = null; humUseTempo(r.id, sg).then(function(){ refresh(true); }); }));
          s2.appendChild(tbtn("", "Leave it", "", function(){ sug.tempo = null; phHumPanel(true); }));
        } else {
          s2.appendChild(el("span", "", "This sounds like " + keyName(sug.key) + "."));
          s2.appendChild(tbtn("primary", "Use " + keyName(sug.key), "", function(){ S.key = { root:sug.key.root, scale:sug.key.scale }; sug.key = null; commit("key: " + keyName(S.key)); refresh(true); }));
          s2.appendChild(tbtn("", "No key", "", function(){ sug.key = null; phHumPanel(true); }));
        }
        box.appendChild(s2);
      }
      row("Hear", seg([["voice", "My voice"], ["notes", "Notes"], ["both", "Both"]], audition && audition.region === r.id ? audition.mode : "", function(v){ if(audition && audition.mode === v){ auditionStop(); phHumPanel(true); return; } silentTip(); humHear(r.id, v).then(function(){ phHumPanel(true); phBars(); }); }, "Hear"), "sphear");
      row("Timing", seg([["raw", "As hummed"], ["feel", "Half way"], ["tidy", "Tidy"], ["strict", "Strict"]], h.timing, function(v){ h.timing = v; redo("timing: " + v); }, "Timing"), "sptiming");
      var pr = el("div", "sp-humrow2");
      pr.appendChild(seg([["semi", "As hummed"], ["key", "Fit to key"]], h.pitch, function(v){
        if(v === "key" && !scaleOf()){ tell("The song has no key yet. Choose one with Key, at the bottom right; the notes will then fit to it."); return; }
        h.pitch = v; redo("pitch: " + (v === "key" ? "fit to the key" : "as hummed")); }, "Pitch"));
      pr.firstChild.id = "sppitch";
      var oc = el("div", "st-seg"); oc.setAttribute("role", "group"); oc.setAttribute("aria-label", "Octave");
      var od = tbtn("", "Octave −", "", function(){ h.octave = clamp(h.octave - 1, -4, 4); redo("octave lower"); }), ou = tbtn("", "Octave +", "", function(){ h.octave = clamp(h.octave + 1, -4, 4); redo("octave higher"); });
      od.id = "spoctdn"; ou.id = "spoctup"; oc.appendChild(od); oc.appendChild(ou); pr.appendChild(oc);
      row("Pitch", pr);
      var acts = el("div", "sp-two");
      var again = tbtn("big", "Hum it again", "", function(){ auditionStop(); humSheet(t.id, { at:r.s, bars:Math.round(r.l / barTicks()) }); }); again.id = "spagain";
      var keep = tbtn("primary big", "Keep", "", function(){ auditionStop(); PH.res = null; phGo("song"); }); keep.id = "spkeep";
      acts.appendChild(again); acts.appendChild(keep); box.appendChild(acts);
    }

    // ---- recording: humming a part, or a voice take, on a screen of its own ----
    function phCap(o){
      var t = trackById(o.track); if(!t || PH.cap || recordingNow()) return;
      if(TR.playing) transportStop(); auditionStop(); closePops();
      var hum = o.kind === "hum", bt = barTicks();
      var others = S.tracks.some(function(x){ return x !== t && x.regions.length > 0; });
      PH.cap = { o:o, kind:o.kind, hum:hum, t:t.id, at:o.at !== undefined ? o.at : Math.floor(TR.pos / bt) * bt, bars:hum ? (o.bars !== undefined && [0, 2, 4, 8].indexOf(o.bars) >= 0 ? o.bars : HS.bars) : 0,
                 backing:others ? (HS.backing || "song") : "click", others:others, state:"setup", ready:false, opening:false, msg:o.msg || "", trace:[], lv:[], hot:0, quiet:0, heard:false, t0:0, timer:0, first:hum && !anyHum() && !S.flags.guided };
      PH.e.cap.hidden = false; UI.root.dataset.cap = "on"; phArm();
      routeDetect();
      micPermission().then(function(p){ if(PH.cap && (p === "granted" || TEST.micNode) && !PH.cap.ready) phCapMic(); });
      latLoad().then(function(){ if(PH.cap) phCapPaint(); });
      phCapPaint();
      clearInterval(PH.capT); PH.capT = setInterval(phCapTick, 50);
    }
    function phCapEnd(){
      var C = PH.cap; clearInterval(PH.capT); PH.capT = 0;
      if(!C) return;
      PH.cap = null; REC_UI = null;
      micMeterStop();
      PH.e.cap.hidden = true; PH.e.cap.textContent = ""; UI.root.dataset.cap = "off";
      phBars();
    }
    function phCapCancel(){
      var C = PH.cap; if(!C) return;
      if(C.state === "count" || C.state === "rec"){ if(C.hum) humCancel(); else { audioRecStop(); } }
      phCapEnd();
    }
    function phCapMic(){
      var C = PH.cap; if(!C || C.opening) return;
      C.opening = true; C.msg = ""; phCapPaint();
      micMeterStart().then(function(){ if(PH.cap !== C){ micMeterStop(); return; } C.opening = false; C.ready = true; routeDetect().then(function(){ if(PH.cap === C) phCapPaint(); }); phCapPaint(); },
        function(e){ if(PH.cap !== C) return; C.opening = false; C.ready = false; C.msg = e && e.message && e.message.length > 20 ? e.message : micWhy(e); phCapPaint(); });
    }
    function phCapPaint(){
      var C = PH.cap, box = PH.e.cap; if(!C) return;
      var t = trackById(C.t), bt = barTicks(), hp = hpState(), plan = recPlan(C.hum ? "hum" : "voice", C.backing);
      box.textContent = ""; box.dataset.state = C.state; box.dataset.kind = C.kind;
      box.setAttribute("aria-label", C.hum ? "Hum a part" : "Record your voice");
      var head = el("header", "sp-caph"), x = ibtn("sp-ib", "x", C.state === "setup" ? "Close" : "Cancel and throw the take away", "", function(){ phCapCancel(); }); x.id = "spcapx"; x.removeAttribute("title");
      var ht = el("div", "sp-capt"); ht.appendChild(el("b", "", C.hum ? "Hum a part" : "Record your voice")); ht.appendChild(el("span", "", t ? t.name + (C.hum ? ", " + instName(t.inst) : "") : ""));
      head.appendChild(x); head.appendChild(ht); box.appendChild(head);
      var body = el("div", "sp-capbody"); box.appendChild(body);
      var foot = el("footer", "sp-capfoot"); box.appendChild(foot);
      C.el = {};
      function meter(){
        var m = el("div", "sp-meter"); m.setAttribute("aria-hidden", "true"); m.appendChild(el("i")); m.appendChild(el("u")); C.el.meter = m;
        C.el.state = el("p", "sp-micstate", ""); C.el.state.id = "spmicstate"; C.el.state.setAttribute("role", "status");
        var w = el("div", "sp-micbox"); w.appendChild(m); w.appendChild(C.el.state); return w;
      }
      if(C.state === "setup"){
        if(C.msg){ var m0 = line("st-warn", C.msg); m0.setAttribute("role", "status"); body.appendChild(m0); }
        if(C.first) body.appendChild(line("st-lead", "Press Start, count along with the clicks, then hum or sing “da da da” in time. It stops by itself, and " + instName(t.inst) + " plays what you hummed."));
        else if(!C.hum) body.appendChild(line("st-lead", "The song plays from bar " + (C.at / bt + 1) + " and your voice is recorded over it until you press Stop. Recording the same place again keeps the earlier takes."));
        // headphones
        var hb = el("div", "sp-card"); hb.id = "sphp";
        if(MOB.handheld || TEST.route){
          if(!hp){
            hb.appendChild(el("b", "", "Are you wearing headphones?"));
            var q3 = el("div", "sp-opts");
            [["no", "No"], ["wired", "Yes, with a wire"], ["bt", "Yes, Bluetooth"]].forEach(function(a){ var b = tbtn("big", a[1], "", function(){ hpSet(a[0]); phCapPaint(); }); b.dataset.hp = a[0]; q3.appendChild(b); });
            hb.appendChild(q3);
            hb.appendChild(line("st-note", "It decides what plays while you record. Headphones with a wire give the best result."));
          } else {
            var hl = el("div", "sp-hpline"); hl.appendChild(ico("head", true));
            hl.appendChild(el("b", "", hp === "wired" ? "Headphones with a wire" : hp === "bt" ? "Bluetooth headphones" : "No headphones"));
            if(!HP.auto) hl.appendChild(tbtn("quiet", "Change", "", function(){ hpSet(""); phCapPaint(); }));
            hb.appendChild(hl);
            hb.appendChild(line("st-note", hp === "wired" ? "The best way: you hear the click and the song, and the microphone hears only you."
              : hp === "bt" ? "Their microphone records in telephone quality and the sound reaches you late. It works; a wire is better. Check the timing below once, with the microphone close to an earpiece."
              : C.hum ? "The click plays quietly through the phone and is taken out of the recording afterwards. The other tracks stay silent while you hum, because the microphone would hear them as notes. Headphones with a wire give the cleanest result."
              : "The song plays quietly through the phone, and some of it will be heard in the recording. Headphones with a wire give a clean take."));
            if(HP.low) hb.appendChild(line("st-warn", "The microphone is running in telephone quality (" + Math.round(((MIC.settings && MIC.settings.sampleRate) || (ENG.ctx ? ENG.ctx.sampleRate : 0)) / 1000) + " kHz), as a Bluetooth headset does. Notes are still found; a recorded voice will sound thin."));
          }
          body.appendChild(hb);
        }
        var form = el("div", "sp-form");
        function row(label, node){ var r0 = el("div", "sp-frow"); r0.appendChild(el("span", "st-l", label)); r0.appendChild(node); form.appendChild(r0); return r0; }
        if(C.hum){
          var ls = seg([[2, "2 bars"], [4, "4 bars"], [8, "8 bars"], [0, "Until I stop"]], C.bars, function(v){ C.bars = +v; phCapPaint(); }, "Length"); ls.id = "spcaplen"; ls.classList.add("sp-seg4"); row("Length", ls);
          if(!C.bars) form.appendChild(line("st-note", "No click and no count: hum freely, press Stop, and the Studio finds the beat in it."));
          if(C.others && C.bars){
            var bs = seg([["click", "The click only"], ["song", "The song so far"]], plan.backing, function(v){ if(v === "song" && plan.speaker){ tell("Without headphones the other tracks stay silent while you hum: the microphone would hear them as notes."); return; } C.backing = v; phCapPaint(); }, "What plays while you hum"); bs.id = "spcapback"; row("You hear", bs);
          }
        }
        if(C.bars || !C.hum){
          var ab = el("div", "sp-step"), av = el("b", "", "Bar " + (Math.round(C.at / bt) + 1));
          var am = tbtn("big", "−", "", function(){ C.at = Math.max(0, C.at - bt); phCapPaint(); }), ap = tbtn("big", "+", "", function(){ C.at += bt; phCapPaint(); });
          am.setAttribute("aria-label", "One bar earlier"); ap.setAttribute("aria-label", "One bar later"); ab.appendChild(am); ab.appendChild(av); ab.appendChild(ap); row("Starts at", ab);
        }
        body.appendChild(form);
        body.appendChild(meter());
        if(C.ready){
          var lt = el("div", "sp-lat"), ln = el("span", "st-note", latWords()); ln.id = "spcaplat";
          var chk = tbtn("", "Check timing", "", function(){
            chk.disabled = true; C.busy = true; ln.textContent = plan.speaker || !MOB.handheld ? "Listening for eight clicks…" : "Listening for eight clicks. Hold the microphone close to an earpiece…";
            MIC.meterOnly = false;
            calibrate().then(function(r0){ if(PH.cap !== C) return; C.busy = false; C.ready = false; C.msg = r0.ok ? "" : (r0.why || "The clicks were not heard by the microphone. Turn the volume up" + (plan.speaker ? "" : ", hold the microphone close to an earpiece") + ", and try again."); if(r0.ok) tell("Measured: " + Math.round(r0.sec * 1000) + " ms. Recordings are moved by that much."); phCapMic(); });
          });
          chk.id = "spcapcheck"; lt.appendChild(ln); lt.appendChild(chk); body.appendChild(lt);
        } else body.appendChild(line("st-note", "The browser asks for the microphone the first time. What you record stays in this browser on this " + (MOB.handheld ? "phone" : "device") + "; it is not sent anywhere."));
        var need = (MOB.handheld || TEST.route) && !hp;
        var go = tbtn("primary sp-go", C.opening ? "Waiting for the browser…" : !C.ready ? "Turn on the microphone" : need ? "Answer the question above first" : C.hum ? (C.bars ? "Start: " + (S.countIn > 1 ? S.countIn + " bars" : "one bar") + " of clicks, then hum" : "Start humming") : "Record from bar " + (C.at / bt + 1), "", function(){
          if(!C.ready){ phCapMic(); return; }
          phCapStart();
        });
        go.id = "spcapgo"; go.disabled = C.opening || (C.ready && need); foot.appendChild(go);
      } else {
        // counting in, recording, or listening to what was hummed
        var stage = el("div", "sp-stage");
        C.el.big = el("div", "sp-count", ""); C.el.big.id = "spcount"; C.el.big.setAttribute("role", "status"); C.el.big.setAttribute("aria-live", "assertive");
        C.el.sub = el("div", "sp-countsub", ""); C.el.pips = el("div", "st-pips sp-pips");
        stage.appendChild(C.el.big); stage.appendChild(C.el.sub); stage.appendChild(C.el.pips); body.appendChild(stage);
        C.el.cv = el("canvas", "sp-trace"); C.el.cv.setAttribute("aria-hidden", "true"); body.appendChild(C.el.cv);
        body.appendChild(meter());
        if(C.state !== "listening"){
          if(C.hum){ var cb = tbtn("big", "Cancel", "", function(){ phCapCancel(); }); cb.id = "spcapcancel"; foot.appendChild(cb); }
          var sb = tbtn("sp-go sp-stop", C.hum && C.bars ? "Stop early" : "Stop", "", function(){ phCapStop(); }); sb.id = "spcapstop"; foot.appendChild(sb);
        }
      }
      phCapTick();
    }
    function phCapStart(){
      var C = PH.cap, plan = recPlan(C.hum ? "hum" : "voice", C.backing); if(!C || C.state !== "setup") return;
      C.state = "count"; C.trace = []; C.lv = []; C.t0 = 0; C.plan = plan; C.heard = false; C.quiet = 0; C.hot = 0;
      if(C.hum){
        HS.bars = C.bars; if(!plan.speaker) HS.backing = C.backing;
        humStart({ track:C.t, bars:C.bars, backing:C.bars ? plan.backing : "click", at:C.at, clickVol:plan.clickVol, musicVol:plan.musicVol, done:function(out){ phCapHumDone(C, out); } })
          .then(function(){ if(PH.cap !== C) return; REC_UI = { active:true, stop:phCapStop }; phCapPaint(); }, function(e){ if(PH.cap !== C) return; C.state = "setup"; C.ready = false; C.msg = e && e.message ? e.message : "The microphone could not be opened."; phCapPaint(); });
      } else {
        audioRecStart(C.t, { at:C.at, clickVol:plan.clickVol, musicVol:plan.musicVol })
          .then(function(){ if(PH.cap !== C) return; REC_UI = { active:true, stop:phCapStop }; phCapPaint(); }, function(e){ if(PH.cap !== C) return; C.state = "setup"; C.ready = false; C.msg = e && e.message ? e.message : "The microphone could not be opened."; phCapPaint(); });
      }
      phCapPaint();
    }
    function phCapStop(){
      var C = PH.cap; if(!C || (C.state !== "count" && C.state !== "rec")) return;
      C.state = "listening"; phCapPaint();
      if(C.hum) stopAnyRecording();
      else audioRecStop().then(function(r){
        if(PH.cap !== C) return;
        phCapEnd();
        if(!r){ tell("Nothing was recorded: the take was too short."); return; }
        var f = findRegion(r.id); if(f){ select(f.t.id, r.id); phGo("edit", { tab:"take" }); }
        count("studio_takes");
        tell("Recorded" + (r.takes.length > 1 ? " as take " + r.takes.length + " of this place. Takes, above the picture, chooses between them." : ". Drag the two grips to trim its start and its end."));
      }, function(){ if(PH.cap === C){ phCapEnd(); tell("That take could not be kept."); } });
    }
    function phCapHumDone(C, out){
      if(PH.cap !== C) return;
      REC_UI = null;
      if(!out || !out.ok){
        C.state = "setup"; C.ready = false; C.opening = false; C.msg = (out && out.why) || "That take could not be read. Try once more.";
        phCapPaint(); phCapMic(); return;
      }
      S.flags.guided = true; touch(); count("hum_takes");
      UI.humSug = { region:out.region, key:out.key, tempo:out.tempo };
      phCapEnd();
      select(C.t, out.region); PH.res = out.region; phGo("edit", { tab:"notes" });
      var t = trackById(C.t), words = out.notes + (out.notes === 1 ? " note" : " notes") + " heard.";
      if(out.clipped) words += " The microphone was overloaded in places: hold the phone a little further away.";
      else if(out.bleed && !out.free && !(C.plan && C.plan.speaker)) words += " The click was audible in the recording; headphones give cleaner notes.";
      if(out.early) words += " " + out.early + (out.early === 1 ? " note" : " notes") + " before the part began " + (out.early === 1 ? "was" : "were") + " left out.";
      tell(words);
      // play it back as soon as the instrument has the notes it needs
      var tries = 0;
      (function go(){
        if(PH.res !== out.region || recordingNow() || TR.playing) return;
        var d = t && ENG.inst[t.inst];
        if(!d || d.state === "ready" || d.state === "failed" || tries++ > 60 || instCovers(t, out.region)){ humHear(out.region, "notes").then(function(){ phHumPanel(true); phBars(); }); return; }
        setTimeout(go, 150);
      })();
      if(t) loadInst(t.inst);
    }
    // has the instrument, still arriving, the recordings these notes need
    function instCovers(t, regionId){
      var d = ENG.inst[t.inst], f = findRegion(regionId); if(!d || d.kit || !f || !d.zones.length) return false;
      var p = patOf(f.r); if(!p) return false;
      return p.notes.every(function(n){ var z = pickZone(d, n.p + 12 * (t.oct || 0), n.v); return z && Math.abs((z.nominal === undefined ? z.note : z.nominal) - (n.p + 12 * (t.oct || 0))) <= 2.5; });
    }
    function phCapTick(){
      var C = PH.cap; if(!C || !C.el) return;
      var E = C.el, live = C.busy ? null : micLive(C.state === "setup" || !C.hum), v = live ? Math.max(live.peak, MIC.level || 0) : (MIC.level || 0), pct = v <= 0.0005 ? 0 : clamp((20 * Math.log(v) / Math.LN10 + 54) / 54, 0, 1);
      if(E.meter){ E.meter.firstChild.style.transform = "scaleX(" + pct.toFixed(3) + ")"; E.meter.dataset.hot = v > 0.95 ? "true" : "false"; }
      // listening, too quiet, too loud: said in words beside the bar
      if(v > 0.95) C.hot = 30; else if(C.hot > 0) C.hot--;
      if(v > 0.03){ C.heard = true; C.quiet = 0; } else C.quiet++;
      var word = !C.ready && C.state === "setup" ? (C.opening ? "Waiting for the browser…" : "The microphone is off.")
        : C.hot > 0 ? "Too loud. Hold the phone a little further away."
        : !C.heard ? (C.state === "setup" ? "Say something: the bar should move." : "Listening…")
        : C.quiet > 50 ? "Too quiet. Come closer, or hum louder." : (C.state === "setup" ? "The microphone hears you." : "Listening.");
      if(C.state === "listening") word = "";
      if(E.state && E.state.textContent !== word){ E.state.textContent = word; E.state.dataset.kind = C.hot > 0 ? "hot" : C.heard && C.quiet > 50 ? "quiet" : "ok"; }
      if(C.state === "setup") return;
      var ctx = ENG.ctx, bt = barTicks(), pt = pulseTicks(), nb = Math.round(bt / pt), big = "", sub = "", beat = -1, free = C.hum && !C.bars;
      if(C.state === "listening"){ big = "…"; sub = C.hum ? "Listening to what you hummed" : "Finishing"; }
      else if(!TR.playing && !free){ big = ""; sub = "Starting…"; }
      else {
        var pre = !free && TR.startAt && ctx.currentTime < TR.startAt;
        if(pre){
          var left = TR.startAt - ctx.currentTime, beatsLeft = Math.ceil(left / tickSec(pt) - 0.02); beat = (nb * 8 - beatsLeft) % nb;
          big = String(beat + 1); sub = "Count-in"; C.state = "count";
        } else {
          if(C.state !== "rec"){ C.state = "rec"; PH.e.cap.dataset.state = "rec"; C.t0 = performance.now(); }
          if(free){ big = timeText((performance.now() - C.t0) / 1000); sub = "Hum freely, then press Stop"; }
          else {
            var rel = Math.max(0, transportTick() - C.at), barN = Math.floor(rel / bt) + 1; beat = Math.floor((rel % bt) / pt);
            if(C.hum){ big = "Bar " + Math.min(barN, C.bars); sub = "Hum now. " + C.bars + " bars"; }
            else { big = timeText(tickSec(rel)); sub = "Recording from bar " + (C.at / bt + 1); }
          }
        }
      }
      PH.e.cap.dataset.state = C.state;
      if(E.big && E.big.textContent !== big) E.big.textContent = big;
      if(E.sub && E.sub.textContent !== sub) E.sub.textContent = sub;
      if(E.pips){
        if(E.pips.childNodes.length !== nb){ E.pips.textContent = ""; for(var i = 0; i < nb; i++) E.pips.appendChild(el("i", "", String(i + 1))); }
        for(var k = 0; k < nb; k++) E.pips.childNodes[k].dataset.on = k === beat ? "true" : "false";
        E.pips.hidden = free || C.state === "listening";
      }
      if(C.state === "rec" && live){ C.trace.push({ t:performance.now() - C.t0, m:live.midi, v:pct }); if(C.trace.length > 6000) C.trace.splice(0, 1000); }
      phTracePaint();
    }
    // her voice while she hums: a line that rises and falls with the pitch; for a voice take, how loud it was
    function phTracePaint(){
      var C = PH.cap, cv = C && C.el && C.el.cv; if(!cv) return;
      var w = cv.clientWidth, h = cv.clientHeight; if(!w || !h) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2), c = cv.getContext("2d"), col = colors(), t = trackById(C.t), tc = t ? trackColor(t) : col.accent, i;
      if(cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
      c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h); c.fillStyle = col.surface; c.fillRect(0, 0, w, h);
      var total = C.hum && C.bars ? tickSec(C.bars * barTicks()) * 1000 : 0, now = C.state === "rec" ? performance.now() - C.t0 : (C.trace.length ? C.trace[C.trace.length - 1].t : 0);
      var span = total || Math.max(8000, 0), t0 = total ? 0 : Math.max(0, now - span), X = function(ms){ return (ms - t0) / span * w; };
      if(total){ c.strokeStyle = col.line2; for(i = 1; i < C.bars; i++){ var bx = Math.round(i / C.bars * w) + 0.5; c.beginPath(); c.moveTo(bx, 0); c.lineTo(bx, h); c.stroke(); } }
      var tr = C.trace; if(!tr.length) return;
      if(!C.hum){
        c.fillStyle = alpha(tc, 0.9);
        for(i = 0; i < tr.length; i++){ if(tr[i].t < t0) continue; var a = Math.max(1, tr[i].v * (h - 8)); c.fillRect(X(tr[i].t), (h - a) / 2, Math.max(1.5, w / (span / 50) - 0.5), a); }
      } else {
        // the middle of what has been sung so far, an octave and a half either side
        var ps = [], lo, hi; for(i = 0; i < tr.length; i++) if(tr[i].m) ps.push(tr[i].m);
        if(ps.length){
          ps.sort(function(p, q){ return p - q; }); var md = ps[ps.length >> 1]; lo = Math.min(md - 9, ps[0] - 2); hi = Math.max(md + 9, ps[ps.length - 1] + 2);
          C.lo = C.lo === undefined ? lo : C.lo + (lo - C.lo) * 0.2; C.hi = C.hi === undefined ? hi : C.hi + (hi - C.hi) * 0.2;
          var Y = function(m){ return h - 6 - (m - C.lo) / (C.hi - C.lo) * (h - 12); }, pen = false, last = 0;
          c.strokeStyle = col.line; c.fillStyle = col.ink3; c.font = "500 10px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
          for(i = Math.ceil(C.lo); i <= C.hi; i++) if(((i % 12) + 12) % 12 === 0 || C.hi - C.lo < 14){ var gy = Math.round(Y(i)) + 0.5; c.beginPath(); c.moveTo(0, gy); c.lineTo(w, gy); c.stroke(); if(((i % 12) + 12) % 12 === 0) c.fillText(noteName(i), 4, gy - 7); }
          c.lineWidth = 3; c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = tc; c.beginPath();
          for(i = 0; i < tr.length; i++){
            if(tr[i].t < t0 || !tr[i].m || (pen && Math.abs(tr[i].m - last) > 5)){ pen = false; if(!tr[i].m || tr[i].t < t0) continue; }
            var x = X(tr[i].t), y = Y(tr[i].m); if(pen) c.lineTo(x, y); else { c.moveTo(x, y); c.lineTo(x + 0.1, y); pen = true; } last = tr[i].m;
          }
          c.stroke(); c.lineWidth = 1;
        }
      }
      if(C.state === "rec"){ var nx = Math.round(X(now)) + 0.5; c.strokeStyle = col.ink; c.beginPath(); c.moveTo(nx, 0); c.lineTo(nx, h); c.stroke(); }
    }

    // ---- chords: bar by bar, with large buttons ----
    function phChords(full){
      var E = PH.e, box = E.chords, bt = barTicks(), hasKey = !!scaleOf(), i;
      var insts = S.tracks.filter(function(t){ return t.kind === "inst" && hasNotes(t) && !t.regions.every(function(r){ return !!r.gen; }); });
      var sig = [JSON.stringify(S.chords), CH.bar, CH.half, keyName(S.key), S.bars, bt, CH.alts ? CH.alts.length : 0, insts.map(function(t){ return t.id; }).join(), S.tracks.length, S.sections.length, PH.chBusy ? 1 : 0].join("|");
      if(!full && sig === PH.sig.chords) return; PH.sig.chords = sig;
      var keepScroll = box.firstChild ? box.firstChild.scrollTop : 0; box.textContent = "";
      var nb = Math.max(8, Math.min(S.bars, Math.ceil(Math.max(songTicks(), S.chords.length ? S.chords[S.chords.length - 1].t + bt : 0) / bt) + 4)); nb = Math.ceil(nb / 4) * 4;
      if(CH.bar >= nb) CH.bar = nb - 1;
      var half = Math.round(bt / 2 / pulseTicks()) * pulseTicks(), selTick = CH.bar * bt + (CH.half ? half : 0);
      var strip = el("div", "sp-chbars"); strip.id = "spchbars"; strip.setAttribute("role", "grid"); strip.setAttribute("aria-label", "Chords, bar by bar");
      for(i = 0; i < nb; i++) (function(bar){
        var q = sectionAt(bar), own = S.chords.filter(function(c){ return c.t === bar * bt; })[0], own2 = S.chords.filter(function(c){ return c.t === bar * bt + half; })[0], cur = chordAt(bar * bt);
        var b = btn("sp-chbar", null, "", function(){ if(CH.bar === bar && own2){ CH.half = CH.half ? 0 : 1; } else { CH.bar = bar; CH.half = 0; } var c0 = CH.half ? own2 : own; if(c0) chordPlay(c0); phChords(true); });
        b.dataset.bar = bar; b.setAttribute("aria-pressed", CH.bar === bar ? "true" : "false");
        b.appendChild(el("span", "sp-chno", (q && q.bar === bar ? q.name + " " : "") + (bar + 1)));
        var nm = el("b", own ? "own" : "", own ? chordName(own) : cur ? "〃" : ""); b.appendChild(nm);
        if(own2) b.appendChild(el("i", "", chordName(own2)));
        b.setAttribute("aria-label", "Bar " + (bar + 1) + (own ? ", " + chordName(own) : cur ? ", " + chordName(cur) + " carries on" : ", no chord") + (own2 ? ", then " + chordName(own2) : ""));
        strip.appendChild(b);
      })(i);
      box.appendChild(strip); strip.scrollTop = keepScroll;
      var pal = el("div", "sp-chpal"); pal.id = "spchpal";
      function choose(root, q){ chordSet(selTick, root, q); commit("chord: " + chordName({ root:root, q:q })); silentTip(); chordPlay({ root:root, q:q }); if(!CH.half) CH.bar = Math.min(nb - 1, CH.bar + 1); CH.half = 0; CH.alts = null; refresh(true); }
      var ph = el("div", "sp-chhead");
      ph.appendChild(el("b", "", "Bar " + (CH.bar + 1)));
      var hs = seg([[0, "Whole bar"], [1, "Second half"]], CH.half, function(v){ CH.half = +v; phChords(true); }, "Which part of the bar"); hs.id = "spchhalf"; ph.appendChild(hs);
      pal.appendChild(ph);
      if(hasKey){
        var row = el("div", "sp-chgrid");
        keyChords().forEach(function(c){ var b = btn("st-chord", null, "", function(){ choose(c.root, c.q); }); b.dataset.chord = chordName(c); b.appendChild(el("b", "", chordName(c))); b.appendChild(el("span", "", c.num)); row.appendChild(b); });
        pal.insertBefore(el("div", "sp-listh", "Chords of " + keyName(S.key)), null); pal.appendChild(row);
        var cur2 = chordAt(selTick);
        if(cur2){
          pal.appendChild(el("div", "sp-listh", "Colour of " + NOTE_NAMES[cur2.root]));
          var row2 = el("div", "sp-opts sp-colours");
          [["maj", "plain"], ["min", "minor"], ["7", "7"], ["maj7", "maj7"], ["m7", "m7"], ["sus4", "sus4"], ["sus2", "sus2"]].forEach(function(v){
            var b = tbtn("", chordName({ root:cur2.root, q:v[0] }), "", function(){ var own = S.chords.filter(function(c){ return c.t === selTick; })[0]; chordSet(own ? selTick : cur2.t, cur2.root, v[0]); commit("chord: " + chordName({ root:cur2.root, q:v[0] })); chordPlay({ root:cur2.root, q:v[0] }); refresh(true); });
            b.setAttribute("aria-pressed", cur2.q === v[0] ? "true" : "false"); row2.appendChild(b); });
          pal.appendChild(row2);
        }
      } else {
        pal.appendChild(line("st-note", "With a key chosen, the list is the seven chords that belong together. Without one, every chord is here."));
        var kb = el("div", "sp-two");
        kb.appendChild(tbtn("big", "Choose a key", "", function(){ keyPop(null); }));
        var wk = tbtn("big", "Work it out from my notes", "", function(){ var k = dsp().suggestKey(songNotes()); if(!k){ tell("There are too few notes to tell the key yet."); return; } setKey(k.root, k.scale); tell("The notes fit " + keyName(k) + " best."); }); wk.disabled = !insts.length; kb.appendChild(wk);
        pal.appendChild(kb);
        ["maj", "min"].forEach(function(q){ var rw = el("div", "sp-chgrid all"); for(var r0 = 0; r0 < 12; r0++) (function(root){ var b = btn("st-chord", null, "", function(){ choose(root, q); }); b.appendChild(el("b", "", chordName({ root:root, q:q }))); rw.appendChild(b); })(r0); pal.appendChild(rw); });
      }
      var acts = el("div", "sp-two");
      var none = tbtn("big", "No chord here", "", function(){ chordSet(selTick, null); commit("remove a chord"); refresh(true); }); none.disabled = !S.chords.some(function(c){ return c.t === selTick; });
      var hearAll = tbtn("big", "Hear the chords", "", function(){ if(!S.chords.length) return; silentTip(); chordsHear(S.chords.slice(0, 64)); }); hearAll.disabled = !S.chords.length;
      acts.appendChild(none); acts.appendChild(hearAll); pal.appendChild(acts);
      // suggested for a part she hummed: by the Assistant when it is answering, else by the rule the Studio has
      var sg = el("div", "sp-card"); sg.id = "spchsug";
      sg.appendChild(el("b", "", "Suggest chords"));
      if(!insts.length) sg.appendChild(line("st-note", "Hum a melody or a bass line first; chords can then be suggested for it."));
      else {
        var from = CH.from && trackById(CH.from) && insts.some(function(t){ return t.id === CH.from; }) ? CH.from : insts[0].id; CH.from = from;
        if(insts.length > 1){ var fs = sel("sp-ts", insts.map(function(t){ return [t.id, "For " + t.name]; }), from, "The track the chords should fit", function(v){ CH.from = v; CH.alts = null; phChords(true); }); sg.appendChild(fs); }
        var sb = tbtn("primary big", "Suggest for “" + trackById(from).name + "”", "", function(){ phSuggest(); }); sb.id = "spsuggest"; sg.appendChild(sb);
        if(CH.alts){
          if(CH.altKey) sg.appendChild(line("st-note", "The notes sound like " + keyName(CH.altKey) + ", so these are chords of that key. Using one sets the key too."));
          CH.alts.forEach(function(alt, ai){
            var ln = el("div", "sp-alt"), names = [], lastN = "";
            alt.forEach(function(c){ var nm2 = chordName(c); names.push(nm2 === lastN ? "〃" : nm2); lastN = nm2; });
            ln.appendChild(el("span", "sp-altseq", names.join("  ")));
            ln.appendChild(tbtn("", "Hear", "", function(){ silentTip(); chordsHear(alt); }));
            var ub = tbtn(ai === 0 ? "primary" : "", "Use", "", function(){
              if(CH.altKey) S.key = { root:CH.altKey.root, scale:CH.altKey.scale };
              var a2 = alt[0].t, b2 = alt[alt.length - 1].t + bt; S.chords = S.chords.filter(function(c){ return c.t < a2 || c.t >= b2; });
              alt.forEach(function(c){ S.chords.push({ t:c.t, root:c.root, q:c.q }); }); S.chords.sort(function(x, y){ return x.t - y.t; });
              for(var j = S.chords.length - 1; j > 0; j--) if(S.chords[j].root === S.chords[j - 1].root && S.chords[j].q === S.chords[j - 1].q) S.chords.splice(j, 1);
              chordFollow(); CH.alts = null; commit("use suggested chords"); refresh(true); tell("Chords set. “Have an instrument play them”, below, puts them on a piano or a guitar.");
            }); ub.dataset.use = ai; ln.appendChild(ub);
            sg.appendChild(ln);
          });
        }
      }
      pal.appendChild(sg);
      var fol = [];
      S.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.gen && fol.indexOf(t.name) < 0) fol.push(t.name); }); });
      phList(pal, [{ t:"Have an instrument play them", d:fol.length ? "Following the chords now: " + fol.join(", ") : "A piano, a guitar, strings or a bass, in a style", go:true, id:"spchplay", off:!S.chords.length, run:function(){ phFollowSheet(); } }]);
      box.appendChild(pal);
    }
    function phSuggest(){
      var tr = trackById(CH.from), bt = barTicks(); if(!tr) return;
      // the Assistant, where it is answering: it hears the request as she would say it, and its changes can be undone
      var ai = false; try { ai = typeof asstMode === "string" && asstMode !== "local" && asstMode !== "probing" && !!document.getElementById("assistant") && !studioAsstOld(asstMode); } catch(e){}
      if(ai && !TEST.noAsstSuggest){
        phAsst(true);
        try { if(asstSubmit("Suggest chords that fit “" + tr.name + "”, and say in a few words why they fit.")) return; } catch(e2){}
        phAsst(false);
      }
      var a = 1e12, b = 0; tr.regions.forEach(function(r){ a = Math.min(a, r.s); b = Math.max(b, r.s + r.l); });
      if(b <= a){ tell("That track has no notes yet."); return; }
      a = Math.floor(a / bt) * bt; b = Math.ceil(b / bt) * bt;
      var key = S.key, guessed = null;
      if(!scaleOf(key)){ var all = []; tr.regions.forEach(function(r){ eachNote(r, a, b, function(s, l, p){ all.push({ t:s, n:p, d:l }); }); }); guessed = dsp().suggestKey(all); if(!guessed){ tell("There are too few notes to tell the key. Choose one with Key, at the bottom right."); return; } key = { root:guessed.root, scale:guessed.scale }; }
      var res = suggestChords(CH.from, a, b, key);
      if(!res){ tell("There are too few notes on that track to suggest chords from."); return; }
      CH.alts = res; CH.altKey = guessed ? key : null; phChords(true);
      setTimeout(function(){ var n = document.getElementById("spchsug"); if(n && n.scrollIntoView) n.scrollIntoView({ block:"nearest" }); }, 50);
    }

    // ---- the mix: one card a track, large sliders ----
    function phMix(full){
      var E = PH.e, box = E.mix, sig = S.id + "|" + S.tracks.map(function(t){ return t.id + t.name + t.color + t.inst; }).join("|");
      if(full || sig !== PH.sig.mix){
        PH.sig.mix = sig; PH.mx = {}; var sc = box.scrollTop; box.textContent = "";
        if(!S.tracks.length) box.appendChild(line("st-note sp-pad", "There are no tracks yet."));
        S.tracks.forEach(function(t){
          var card = el("div", "sp-mixcard"), hd = el("div", "sp-mixh"), m = { }; card.style.setProperty("--tc", trackColor(t)); card.id = "spmix-" + t.id;
          var nm = el("div", "sp-rowt"); nm.appendChild(el("b", "", t.name)); nm.appendChild(el("span", "", t.kind === "audio" ? "Recording" : instName(soundFor(t)))); hd.appendChild(nm);
          m.m = tbtn("st-ms", "Mute", "", function(){ t.mute = !t.mute; commit(t.mute ? "mute " + t.name : "unmute " + t.name, true); engSync(); refresh(); });
          m.s = tbtn("st-ms solo", "Solo", "", function(){ t.solo = !t.solo; commit(t.solo ? "solo " + t.name : "end solo of " + t.name, true); engSync(); refresh(); });
          m.m.setAttribute("aria-label", "Mute " + t.name); m.s.setAttribute("aria-label", "Solo " + t.name);
          hd.appendChild(m.m); hd.appendChild(m.s); card.appendChild(hd);
          m.meter = el("div", "sp-mixmeter"); m.meter.appendChild(el("i")); card.appendChild(m.meter);
          m.vol = phSlider("Level", 0, 125, 1, function(){ return Math.round(t.vol * 100); }, function(v){ t.vol = v / 100; engSync(); }, function(){ return volText(t.vol); }, function(){ commit("volume of " + t.name, true); });
          m.pan = phSlider("Left or right", -50, 50, 1, function(){ return Math.round(t.pan * 50); }, function(v){ t.pan = Math.abs(v) < 4 ? 0 : v / 50; engSync(); }, function(){ return panText(t.pan); }, function(){ m.pan.set(); commit("pan of " + t.name, true); });
          m.rev = phSlider("Room (reverb)", 0, 100, 1, function(){ return Math.round(t.send * 100); }, function(v){ t.send = v / 100; engSync(); }, function(){ return Math.round(t.send * 100) + "%"; }, function(){ commit("reverb of " + t.name, true); });
          card.appendChild(m.vol); card.appendChild(m.pan); card.appendChild(m.rev);
          var tone = el("details", "sp-tone"), sm = el("summary", "", "Tone"); tone.appendChild(sm);
          ["Low", "Mid", "High"].forEach(function(nm2, k){ tone.appendChild(phSlider(nm2, -12, 12, 0.5, function(){ return t.eq[k]; }, function(v){ t.eq[k] = Math.abs(v) < 0.75 ? 0 : v; engSync(); }, function(){ return (t.eq[k] > 0 ? "+" : "") + t.eq[k] + " dB"; }, function(){ commit(nm2.toLowerCase() + " of " + t.name, true); })); });
          card.appendChild(tone);
          PH.mx[t.id] = m; box.appendChild(card);
        });
        var ms = el("div", "sp-mixcard master"), mh = el("div", "sp-mixh"), mn = el("div", "sp-rowt"); mn.appendChild(el("b", "", "Everything together")); mn.appendChild(el("span", "", "The level of the whole song")); mh.appendChild(mn); ms.appendChild(mh);
        PH.mxMaster = el("div", "sp-mixmeter"); PH.mxMaster.appendChild(el("i")); ms.appendChild(PH.mxMaster);
        ms.appendChild(phSlider("Level", 0, 125, 1, function(){ return Math.round(S.mvol * 100); }, function(v){ S.mvol = v / 100; engSync(); }, function(){ return volText(S.mvol); }, function(){ commit("master volume", true); }, "spmaster"));
        ms.appendChild(line("st-note", ENG.limiterOK || !ENG.ctx ? "A limiter holds back peaks that would distort. If the bar turns red, turn the loudest track down." : "This browser has no limiter here: keep the bar out of the red."));
        box.appendChild(ms); box.scrollTop = sc;
      }
      S.tracks.forEach(function(t){ var m = PH.mx[t.id]; if(!m) return; m.m.setAttribute("aria-pressed", t.mute ? "true" : "false"); m.s.setAttribute("aria-pressed", t.solo ? "true" : "false"); if(!box.contains(document.activeElement)){ m.vol.set(); m.pan.set(); m.rev.set(); } });
    }
    var phMxHold = {};
    function phMixMeters(lv, zero){
      if(!phoneOn() || PH.screen !== "mix" || !PH.mxMaster) return;
      function setM(elm, key, v){ var hold = Math.max(v || 0, (phMxHold[key] || 0) * 0.85); phMxHold[key] = zero ? 0 : hold; var pct = hold <= 0.0005 || zero ? 0 : clamp((20 * Math.log(hold) / Math.LN10 + 54) / 54, 0, 1); elm.firstChild.style.transform = "scaleX(" + pct.toFixed(3) + ")"; elm.dataset.hot = hold > 0.89 ? "true" : "false"; }
      S.tracks.forEach(function(t){ var m = PH.mx[t.id]; if(m) setM(m.meter, t.id, lv.tracks[t.id]); });
      setM(PH.mxMaster, "_m", lv.master);
    }

    // ---- sharing: the song as sound, the song itself ----
    // The file is made first and handed over on a second tap: a phone lets a page open its share sheet only in the
    // moment of a tap, and making a file takes longer than that.
    function phShare(first){
      if(TR.playing) transportStop();
      var made = {}, busy = false, loopOnly = false, inc = true;
      sheet("Share “" + S.name + "”", function(body, close){
        var status = el("p", "st-status", ""); status.setAttribute("role", "status"); status.id = "spshstatus";
        function say2(t){ status.textContent = t; }
        function fail(e){ busy = false; say2(e && e.message === "empty" ? "There is nothing to share yet: the song has no notes or recordings." : e && e.message === "big" ? "That would be too large a file for this phone to make. Send yourself the song file, and make this one at a computer." : "That file could not be made. " + (MOB.handheld ? "The phone may be short of memory: close other tabs and try once more." : "Try once more.")); paint(); }
        function make(kind){
          if(busy) return; busy = true; paint();
          var p;
          if(kind === "wav") p = phMixBlob(loopOnly, say2);
          else if(kind === "song") p = projectOut(inc).then(function(o){ count("studio_exports"); var txt = JSON.stringify(o); return { blob:new Blob([txt], { type:"application/json" }), name:fileBase() + ".flsong", alt:{ name:fileBase() + ".flsong.txt", type:"text/plain" }, song:true }; });
          else if(kind === "midi") p = new Promise(function(res, rej){ if(!S.tracks.some(function(t){ return t.kind !== "audio" && hasNotes(t); })) return rej(new Error("empty")); count("studio_exports"); res({ blob:new Blob([midiOut()], { type:"audio/midi" }), name:fileBase() + ".mid" }); });
          else p = phStemsBlob(loopOnly, say2);
          p.then(function(m){ busy = false; made[kind] = m; say2("Ready: " + m.name + ", " + fmtBytes(m.blob.size) + (m.seconds ? ", " + timeText(m.seconds) : "") + "."); paint(); }, fail);
        }
        function hand(kind, save){
          var m = made[kind]; if(!m) return;
          (save ? offerFile(m.blob, m.name).then(function(){ return "saved"; }) : shareOrSave(m.blob, m.name, S.name, m.alt)).then(function(how){
            if(how === "cancelled"){ say2("Not sent. The file is still ready."); return; }
            if(m.song) copyMark();
            say2(how === "shared" ? "Handed to the app you chose." : "Saved to this " + (MOB.handheld ? "phone’s downloads" : "device") + ": " + m.name + ".");
          }, function(){ say2("That did not work. Try “Save to this phone”."); });
        }
        function block(kind, title, text, extra){
          var b = el("div", "sp-card sp-share"); b.dataset.kind = kind; b.appendChild(el("b", "", title)); b.appendChild(el("span", "st-note", text)); if(extra) b.appendChild(extra);
          var acts = el("div", "sp-two"), m = made[kind];
          if(!m){ var mk = tbtn("primary big", busy ? "Working…" : "Make the file", "", function(){ make(kind); }); mk.id = "spmake-" + kind; mk.disabled = busy; acts.appendChild(mk); }
          else {
            var can = !!(shareFile(m.blob, m.name) || (m.alt && shareFile(new Blob([m.blob], { type:m.alt.type }), m.alt.name)));
            if(can){ var sh = tbtn("primary big", "Send or share", "", function(){ hand(kind, false); }); sh.id = "spsend-" + kind; acts.appendChild(sh); }
            var sv = tbtn(can ? "big" : "primary big", MOB.handheld ? "Save to this phone" : "Save", "", function(){ hand(kind, true); }); sv.id = "spsave-" + kind; acts.appendChild(sv);
          }
          b.appendChild(acts); return b;
        }
        function paint(){
          body.textContent = "";
          if(S.loop.on){
            var lr = el("label", "st-check sp-check"), cb = el("input"); cb.type = "checkbox"; cb.checked = loopOnly; cb.addEventListener("change", function(){ loopOnly = cb.checked; made.wav = made.stems = null; paint(); });
            lr.appendChild(cb); lr.appendChild(el("span", "", "Only the looped stretch (bars " + (S.loop.a / barTicks() + 1) + " to " + (S.loop.b / barTicks()) + ")")); body.appendChild(lr);
          }
          body.appendChild(block("wav", "The song as sound", "One sound file (WAV) of everything together, as you hear it: to send to someone, or to yourself."));
          var il = el("label", "st-check sp-check"), ic = el("input"); ic.type = "checkbox"; ic.checked = inc; ic.addEventListener("change", function(){ inc = ic.checked; made.song = null; paint(); }); il.appendChild(ic); il.appendChild(el("span", "", "Include the recordings (a larger file)"));
          body.appendChild(block("song", "The song itself", "A song file holds every track, note, chord, lyric and recording. Songs live in this browser only, so this file is how a song gets to a computer or another phone, and how you keep a copy: open it there with “Bring in a song file”.", il));
          var more = el("details", "sp-tone"); more.id = "spshmore"; more.appendChild(el("summary", "", "More")); if(made.midi || made.stems) more.open = true;
          more.appendChild(block("midi", "The notes", "A MIDI file of the instrument and drum tracks: other music programs open it and play it on their own instruments."));
          more.appendChild(block("stems", "Each track by itself", "A zip of one sound file a track, all the same length: for mixing in another program."));
          body.appendChild(more);
          body.appendChild(status);
        }
        paint();
        if(first === "song") setTimeout(function(){ var n = body.querySelector('[data-kind="song"]'); if(n && n.scrollIntoView) n.scrollIntoView({ block:"start" }); }, 60);
      }, { id:"spshare" });
    }
    function phMixBlob(loopOnly, say2){
      if(!songTicks()) return Promise.reject(new Error("empty"));
      var rng = exportRange(loopOnly), secs = tickSec(rng.to - rng.from) + 2;
      if(MOB.lean && secs > 900) return Promise.reject(new Error("big"));
      say2("Loading the instruments…");
      return ensureEngine().then(ensureSounds).then(function(){ say2("Making the sound file…"); return renderSong(rng); }).then(function(buf){
        var bytes = wavBytes(bufChans(buf), buf.sampleRate, 16); count("studio_exports");
        return { blob:new Blob([bytes], { type:"audio/wav" }), name:fileBase() + ".wav", seconds:buf.duration };
      });
    }
    function phStemsBlob(loopOnly, say2){
      var ts = S.tracks.filter(function(t){ return t.regions.length > 0; }); if(!ts.length) return Promise.reject(new Error("empty"));
      var files = [], rng = exportRange(loopOnly), i = 0, secs = tickSec(rng.to - rng.from) + 2, bits = MOB.lean ? 16 : 24;
      // every stem is held until the zip is made: on a phone that is only possible for a short song
      if(MOB.lean && secs * ts.length * (ENG.ctx ? ENG.ctx.sampleRate : 48000) * 4 > 120e6) return Promise.reject(new Error("big"));
      say2("Loading the instruments…");
      return ensureEngine().then(ensureSounds).then(function next(){
        if(i >= ts.length) return null;
        var t = ts[i++]; say2("Making “" + t.name + "” (" + i + " of " + ts.length + ")…");
        return renderSong({ from:rng.from, to:rng.to, only:t.id }).then(function(buf){
          files.push({ name:(i < 10 ? "0" : "") + i + "-" + (t.name.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "track") + ".wav", data:wavBytes(bufChans(buf), buf.sampleRate, bits) });
          return next();
        });
      }).then(function(){ count("studio_exports"); return { blob:zipBlob(files), name:fileBase() + "-stems.zip" }; });
    }

    // ---- help, the Home Screen, the phone check ----
    function phHelp(){
      sheet("How the Studio works", function(body, close){
        function h(t){ body.appendChild(el("h3", "", t)); }
        function p(t){ body.appendChild(el("p", "", t)); }
        h("Your voice is the instrument");
        p("Add a track, choose “Hum a part”, pick an instrument, and hum or sing “da da da” against the click. It becomes notes that the instrument plays. The line of your voice stays under the notes, so you can see what was heard.");
        p("After a take you choose how closely the timing follows you, whether notes are fitted to the song’s key, and the octave. All of it is worked out again from the same take.");
        h("Putting notes right");
        p("Tap a note to select it; the buttons that appear move it up, down, earlier or later, make it longer or shorter, split it or delete it. Drag a note to move it. Tap empty grid to add a note. One finger moves the view, two fingers zoom. “Select” lets you draw a box round several notes. Undo is always at the top.");
        h("Building the song");
        p("Chords: choose them bar by bar with the large buttons, or have them suggested for a part you hummed; then “Follow the chords” has a piano, a guitar, strings or a bass play them. Drums: pick a feel and how busy it is, part by part; tap the grid to change a hit. Your voice: “Record my voice” records over the song, and each new recording of the same place is kept as a take.");
        h("Headphones");
        p("Headphones with a wire give the best result: the microphone hears only you. Without headphones the click is played quietly and removed afterwards. Bluetooth headphones work, but their microphone is of telephone quality and the sound arrives late.");
        h("Keeping your songs");
        p("Songs are kept in this browser on this device, and nowhere else. Share, on the song’s screen, makes a song file: send it to yourself to open the song on a computer, or to keep a copy. A phone can clear what a website has stored when the site is not used for a while.");
        phList(body, [
          { t:"Phone check", d:"Tests the sound and the microphone, and makes a report for the site owner", go:true, id:"sphelpcheck", run:function(){ phCheck(); } },
          MOB.handheld && !isStandalone() ? { t:"Add to Home Screen", go:true, run:function(){ phInstall(); } } : null,
          { t:"About the sounds", d:"Where the recorded instruments come from", go:true, run:function(){ soundsSheet(); } }
        ], close);
      }, { cls:"st-help", id:"sphelp" });
    }
    function phInstall(){
      installTags();
      sheet("Add to Home Screen", function(body, close){
        body.appendChild(line("st-lead", "First Loop can sit on the Home Screen and open full screen, like an app. It is still this website: nothing is installed from a shop."));
        var ol = el("ol", "st-first");
        if(MOB.ios) ["Open this page in Safari, if it is not already.", "Tap the Share button: the square with an arrow pointing up.", "Scroll down and tap “Add to Home Screen”, then “Add”."].forEach(function(s){ ol.appendChild(el("li", "", s)); });
        else ["Tap the browser’s menu: the three dots.", "Tap “Add to Home screen” or “Install app”.", "Confirm with “Add” or “Install”."].forEach(function(s){ ol.appendChild(el("li", "", s)); });
        body.appendChild(ol);
        if(INST.prompt){ var ib2 = tbtn("primary big", "Add it now", "", function(){ var pr = INST.prompt; INST.prompt = null; try { pr.prompt(); } catch(e){} close(); }); ib2.id = "spinstallgo"; body.appendChild(ib2); }
        if(MOB.ios) body.appendChild(line("st-warn", "An iPhone gives the Home Screen copy its own storage: songs made in Safari do not appear there, and the other way round. Add it before you start, or carry your songs across with their song files (Share, then “The song itself”)."));
        body.appendChild(line("st-note", "It needs a connection to open, and loads the newest version each time."));
      }, { id:"spinstall" });
    }
    // what this phone can do, found out in under a minute and written so that the site owner can read it
    function phCheck(){
      var R = { tone:"not played", heard:"", rec:null, lat:null, tap:null, modules:null, persist:null, sto:null, cover:"" }, tapT = [], clickT = [], busy = false;
      sheet("Phone check", function(body, close){
        var out = el("div", "sp-check-out"), status = el("p", "st-status", ""); status.setAttribute("role", "status"); status.id = "spchkstatus";
        function step(n, title){ var c = el("div", "sp-card sp-chk"); c.id = "spchk-" + n; var hh = el("b", "", n + ". " + title); c.appendChild(hh); body.appendChild(c); return c; }
        body.appendChild(line("st-lead", "Four short steps. At the end, one button sends what was found to the person who runs this site, so that they can see what this phone does without asking you anything technical."));
        // 1: a tone
        var c1 = step(1, "Sound"), r1 = el("p", "st-note", "Turn the volume up, then play the test tone."), a1 = el("div", "sp-two"), q1 = el("div", "sp-two"); q1.hidden = true;
        var pb = tbtn("primary big", "Play the test tone", "", function(){
          audioUnlock();
          ensureEngine().then(function(ok){
            if(!ok){ R.tone = "no Web Audio"; r1.textContent = "This browser has no Web Audio."; return; }
            resume(); var ctx = ENG.ctx, G = ENG.G, t0 = ctx.currentTime + 0.05;
            [660, 880, 660].forEach(function(fq, i){ var o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = fq; g.gain.value = 0; g.gain.setValueAtTime(0, t0 + i * 0.35); g.gain.linearRampToValueAtTime(0.25, t0 + i * 0.35 + 0.02); g.gain.setTargetAtTime(0, t0 + i * 0.35 + 0.22, 0.03); o.connect(g); g.connect(G.sum); o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.5); });
            R.tone = "played"; r1.textContent = "Three short notes were played. Did you hear them?"; q1.hidden = false; paintOut();
          });
        }); pb.id = "spchktone";
        a1.appendChild(pb); c1.appendChild(r1); c1.appendChild(a1);
        var yes = tbtn("big", "Yes", "", function(){ R.heard = "yes"; r1.textContent = "Heard."; q1.hidden = true; paintOut(); }), no = tbtn("big", "No", "", function(){ R.heard = "no"; r1.textContent = MOB.ios ? "Not heard. Check the silent switch on the side of the phone and the volume buttons; if headphones or a speaker are connected by Bluetooth, the sound goes there." : "Not heard. Check the media volume (press a volume button, then the slider for media); if headphones or a speaker are connected by Bluetooth, the sound goes there."; paintOut(); });
        yes.id = "spchkyes"; no.id = "spchkno"; q1.appendChild(yes); q1.appendChild(no); c1.appendChild(q1);
        // 2: the microphone
        var c2 = step(2, "Microphone"), r2 = el("p", "st-note", "Records two seconds, to see how loud the microphone hears you. Say something while it records. Nothing is kept."), mt = el("div", "sp-meter"); mt.appendChild(el("i")); mt.appendChild(el("u"));
        var rb = tbtn("primary big", "Record two seconds", "", function(){
          if(busy) return; busy = true; rb.disabled = true; r2.textContent = "Recording… say something.";
          micOpen().then(function(){
            recBegin(); var iv = setInterval(function(){ var v = MIC.level || 0, pct = v <= 0.0005 ? 0 : clamp((20 * Math.log(v) / Math.LN10 + 54) / 54, 0, 1); mt.firstChild.style.transform = "scaleX(" + pct.toFixed(3) + ")"; }, 50);
            return new Promise(function(res){ setTimeout(res, 2000); }).then(function(){ clearInterval(iv); var mode = MIC.mode, label = MIC.label, st = MIC.settings; return recEnd().then(function(rec){ micClose(); return { rec:rec, mode:mode, label:label, st:st }; }); });
          }).then(function(a){
            var x = a.rec.x, i, pk = 0, e = 0; for(i = 0; i < x.length; i++){ var v = Math.abs(x[i]); if(v > pk) pk = v; e += v * v; }
            R.rec = { peak:pk, rms:Math.sqrt(e / Math.max(1, x.length)), sr:a.rec.sr, n:x.length, mode:a.mode, label:a.label, st:a.st, mime:a.rec.mime || "" };
            return routeDetect();
          }).then(function(){
            busy = false; rb.disabled = false; var db = function(v){ return v > 0 ? Math.round(20 * Math.log(v) / Math.LN10) + " dB" : "silent"; };
            r2.textContent = R.rec.peak < 0.01 ? "The microphone gave almost nothing (" + db(R.rec.peak) + "). Something may be covering it, or another microphone is chosen." : "The microphone works: loudest moment " + db(R.rec.peak) + ", at " + R.rec.sr + " Hz" + (R.rec.sr <= 24000 ? " (telephone quality, as a Bluetooth headset gives)." : ".");
            paintOut();
          }, function(e){ busy = false; rb.disabled = false; micClose(); R.rec = { err:String(e && (e.name || e.message) || "error") }; r2.textContent = micWhy(e); paintOut(); });
        }); rb.id = "spchkrec";
        c2.appendChild(r2); c2.appendChild(mt); c2.appendChild(rb);
        // 3: timing
        var c3 = step(3, "Timing"), r3 = el("p", "st-note", "How long sound takes to leave the phone and come back. Without headphones, “Measure” plays eight clicks and listens for them. With headphones, tap the pad in time with eight clicks instead."), a3 = el("div", "sp-two");
        var mb = tbtn("big", "Measure", "", function(){
          if(busy) return; busy = true; mb.disabled = true; r3.textContent = "Listening for eight clicks…";
          calibrate().then(function(r0){ busy = false; mb.disabled = false; R.lat = r0; r3.textContent = r0.ok ? "Measured: " + Math.round(r0.sec * 1000) + " ms from speaker to microphone (" + r0.heard + " of " + r0.of + " clicks heard)." : (r0.why || "The clicks were not heard by the microphone. That is expected with headphones on: use “Tap along” instead."); paintOut(); });
        }); mb.id = "spchklat";
        var pad = btn("sp-tappad", "Tap here with each click", "", null); pad.id = "spchkpad"; pad.hidden = true;
        var tb2 = tbtn("big", "Tap along", "", function(){
          if(busy) return; busy = true; tb2.disabled = true; tapT = []; clickT = []; pad.hidden = false; r3.textContent = "Eight clicks. Tap the pad with each one.";
          ensureEngine().then(function(){ resume(); var ctx = ENG.ctx, t0 = ctx.currentTime + 1, i; for(i = 0; i < 8; i++){ clickT.push(t0 + i * 0.6); playClick(ENG.G, t0 + i * 0.6, i === 0, 1.2); }
            setTimeout(function(){
              busy = false; tb2.disabled = false; pad.hidden = true;
              var ds = []; tapT.forEach(function(tt){ var best = 1e9; clickT.forEach(function(ct){ if(Math.abs(tt - ct) < Math.abs(best)) best = tt - ct; }); if(Math.abs(best) < 0.3) ds.push(best); });
              ds.sort(function(p, q){ return p - q; });
              R.tap = ds.length >= 4 ? { ms:Math.round(ds[ds.length >> 1] * 1000), n:ds.length } : { ms:null, n:ds.length };
              r3.textContent = R.tap.ms === null ? "Too few taps landed near the clicks to tell. Try once more." : "Your taps came " + Math.abs(R.tap.ms) + " ms " + (R.tap.ms >= 0 ? "after" : "before") + " the clicks left the app (" + R.tap.n + " taps). Most of that is the sound’s way out to your ears.";
              paintOut();
            }, 1000 + 8 * 600 + 500);
          });
        }); tb2.id = "spchktap";
        pad.addEventListener("pointerdown", function(e){ e.preventDefault(); var ctx = ENG.ctx; if(!ctx) return; var t = ctx.currentTime; try { var ts = ctx.getOutputTimestamp ? ctx.getOutputTimestamp() : null; if(ts && ts.performanceTime && e.timeStamp) t = ts.contextTime + (e.timeStamp - ts.performanceTime) / 1000 + (ctx.outputLatency || 0); } catch(e2){} tapT.push(t); pad.dataset.on = "true"; setTimeout(function(){ pad.dataset.on = "false"; }, 90); });
        a3.appendChild(mb); a3.appendChild(tb2); c3.appendChild(r3); c3.appendChild(a3); c3.appendChild(pad);
        // 4: the report
        var c4 = step(4, "What was found"); c4.appendChild(out);
        var a4 = el("div", "sp-two");
        var cp = tbtn("big", "Copy report", "", function(){ var txt = report(); var done = function(ok){ status.textContent = ok ? "Copied. Paste it into a message." : "Copying is not allowed here. Use “Send as feedback”."; };
          try { if(navigator.clipboard && navigator.clipboard.writeText){ navigator.clipboard.writeText(txt).then(function(){ done(true); }, function(){ done(legacyCopy(txt)); }); return; } } catch(e){} done(legacyCopy(txt)); }); cp.id = "spchkcopy";
        var sd = tbtn("primary big", "Send as feedback", "", function(){
          var txt = report();
          if(typeof asstWeb !== "undefined" && !asstWeb){ status.textContent = "This copy of First Loop was opened as a file, so there is no site to send to. Use “Copy report”."; return; }
          sd.disabled = true; status.textContent = "Sending…";
          var q = { t:Date.now(), kind:"other", text:txt.slice(0, 2000), rating:0, name:(fbStore && fbStore.name) || "", details:fbDetails() };
          fbDeliver(q).then(function(how){ return how; }, function(){ return "queued"; }).then(function(how){
            sd.disabled = false;
            if(how === "refused"){ status.textContent = "The site did not accept it. Use “Copy report” and send it in a message."; return; }
            if(how !== "sent"){ fbStore.queue.push(q); if(fbStore.queue.length > FB_QMAX) fbStore.queue.shift(); }
            try { fbSave(); } catch(e){}
            status.textContent = how === "sent" ? "Sent. Thank you." : "Not sent yet: the site could not be reached. It is kept on this phone and sent when the connection is back.";
          });
        }); sd.id = "spchksend";
        a4.appendChild(cp); a4.appendChild(sd); c4.appendChild(a4); c4.appendChild(status);
        function legacyCopy(txt){ try { var ta = el("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); var ok = document.execCommand("copy"); document.body.removeChild(ta); return ok; } catch(e){ return false; } }
        function yn(v){ return v === true ? "yes" : v === false ? "no" : v === null || v === undefined ? "unknown" : String(v); }
        function report(){
          var ctx = ENG.ctx, L = [], st = R.rec && R.rec.st, wav = null, song = null;
          try { wav = !!shareFile(new Blob(["x"], { type:"audio/wav" }), "a.wav"); song = shareFile(new Blob(["{}"], { type:"application/json" }), "a.flsong") ? "yes" : shareFile(new Blob(["{}"], { type:"text/plain" }), "a.flsong.txt") ? "as text" : "no"; } catch(e){}
          L.push("First Loop phone check, " + (typeof LOG !== "undefined" && LOG.build ? LOG.build : "") + ", " + new Date().toISOString().slice(0, 16).replace("T", " ") + " UTC");
          L.push("Device: " + String(navigator.userAgent || "").slice(0, 190));
          L.push("Kind: " + (MOB.ios ? "iPhone or iPad" : MOB.android ? "Android" : "other") + "; touch points " + (navigator.maxTouchPoints || 0) + "; screen " + (window.screen ? window.screen.width + "x" + window.screen.height : "?") + " @" + (window.devicePixelRatio || 1) + "; window " + window.innerWidth + "x" + window.innerHeight + "; Home Screen app " + yn(isStandalone()) + "; language " + (navigator.language || "?"));
          L.push("Sound: " + (ctx ? ctx.sampleRate + " Hz, " + ctx.state + ", base latency " + Math.round((ctx.baseLatency || 0) * 1000) + " ms, output latency " + Math.round((ctx.outputLatency || 0) * 1000) + " ms" + (ENG.rebuilt ? ", made afresh " + ENG.rebuilt + " time(s)" : "") : "not started"));
          L.push("Test tone: " + R.tone + (R.heard ? ", heard: " + R.heard : ", not answered"));
          L.push("Silent switch: " + (MOB.ios ? "workaround " + (UNL.keeperOn || UNL.session === "playback" ? "active" : "not active") + " (audio session " + (navigator.audioSession ? UNL.session || navigator.audioSession.type || "auto" : "not available") + ", silent element " + (UNL.keeperOn ? "playing" : UNL.keeper ? "paused" : "none") + ")" : "not an iPhone, nothing needed"));
          if(R.rec && R.rec.err) L.push("Microphone: failed, " + R.rec.err);
          else if(R.rec) L.push("Microphone: " + (R.rec.label || "no name") + "; " + R.rec.sr + " Hz; loudest " + (R.rec.peak > 0 ? Math.round(20 * Math.log(R.rec.peak) / Math.LN10) : -120) + " dB, average " + (R.rec.rms > 0 ? Math.round(20 * Math.log(R.rec.rms) / Math.LN10) : -120) + " dB; kept by " + R.rec.mode + (R.rec.mime ? " (" + R.rec.mime + ")" : "") + "; asked for no echo cancelling, no noise gate, no automatic level, got " + (st ? "echo " + yn(st.echoCancellation) + ", noise " + yn(st.noiseSuppression) + ", auto level " + yn(st.autoGainControl) + ", track rate " + (st.sampleRate || "?") + ", channels " + (st.channelCount || "?") : "no report"));
          else L.push("Microphone: not tested");
          L.push("Headphones: " + (HP.auto ? "found " + HP.auto + " (" + HP.label + ")" : "none found by name") + "; answered: " + (PREF.hp || "not asked") + "; names: " + (HP.labels || "none given"));
          L.push("Timing: speaker to microphone " + (R.lat ? (R.lat.ok ? Math.round(R.lat.sec * 1000) + " ms (" + R.lat.heard + "/" + R.lat.of + ")" : "not heard") : "not measured") + "; tap along " + (R.tap ? (R.tap.ms === null ? "too few taps" : R.tap.ms + " ms (" + R.tap.n + " taps)") : "not done") + "; in use " + Math.round(latNow().sec * 1000) + " ms (" + (latNow().measured ? "measured" : "estimate") + ")");
          L.push("Can do: audio worklet " + yn(!!(ctx && ctx.audioWorklet)) + " (loaded " + yn(ENG.mods) + "), script processor " + yn(!!(ctx && ctx.createScriptProcessor)) + ", MediaRecorder " + yn(typeof window.MediaRecorder === "function") + (typeof window.MediaRecorder === "function" ? " (" + (recMime() || "default type") + ")" : "") + ", offline rendering " + yn(!!(window.OfflineAudioContext || window.webkitOfflineAudioContext)) + ", share files: sound " + yn(wav) + ", song file " + yn(song) + ", wake lock " + yn(!!navigator.wakeLock) + ", visual viewport " + yn(!!window.visualViewport) + ", audio session " + yn(!!navigator.audioSession) + ", worker " + yn(!!worker));
          L.push("Storage: " + (R.sto ? (R.sto.used !== null ? fmtBytes(R.sto.used) + " used of " + (R.sto.quota ? fmtBytes(R.sto.quota) : "?") : "size unknown") + ", kept safe: " + yn(R.sto.persisted) : "unknown") + ", database " + (dbBad ? "not available" : "ok") + ", save state " + saveState);
          L.push("Instruments: " + (ENG.manifestState === "ready" ? "recorded ones reachable" : ENG.manifestState === "failed" ? "not reachable, basic sounds only" : ENG.manifestState) + (R.cover ? "; " + R.cover : ""));
          try { if(typeof fbErrs !== "undefined" && fbErrs.length) L.push("Errors: " + fbErrs.slice(-3).join(" | ")); } catch(e2){}
          return L.join("\n").slice(0, 1990);
        }
        function paintOut(){ out.textContent = ""; report().split("\n").forEach(function(l, i){ var k = l.indexOf(": "), row = el("p", "sp-repline"); if(i === 0 || k < 0){ row.appendChild(el("b", "", l)); } else { row.appendChild(el("b", "", l.slice(0, k))); row.appendChild(el("span", "", l.slice(k + 2))); } out.appendChild(row); }); }
        storagePersist().then(function(){ return storageInfo(); }).then(function(s){ R.sto = { used:s.used, quota:s.quota, persisted:s.persisted }; paintOut(); });
        ensureEngine().then(function(){ var u = S.tracks.filter(function(t){ return t.kind !== "audio"; }).map(function(t){ var d = ENG.inst[t.inst]; return (d ? d.name : t.inst) + " " + (d ? d.state : "missing"); }); R.cover = u.length ? "in this song: " + u.join(", ").slice(0, 160) : ""; paintOut(); });
        paintOut();
      }, { id:"spcheck", cls:"st-wide", onClose:function(){ if(MIC.src && !recordingNow() && !PH.cap) micClose(); } });
    }
