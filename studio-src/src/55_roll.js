    // ---------- Studio: the note editor ----------
    // One canvas: piano keys down the left, bars along the top, velocity along the bottom, all three staying
    // put while the grid scrolls under them. Notes are the pattern's own objects; a drag changes them in place
    // and becomes one step of Undo when the pointer is let go.
    var ROLL = { view:null, host:null, ppt:0.12, rowH:14, keysW:58, rulerH:20, velH:56, snap:"auto", tool:"pointer", sel:[], ghost:true, keySnap:false, lastLen:PPQ / 2, lastVel:92,
                 drag:null, marquee:null, forRegion:null, clip:null, phTick:null, hoverKey:-1, downKey:-1 };
    var KB = { oct:4, held:{}, el:null };
    var KB_KEYS = "awsedftgyhujkolp;";
    function rollRegion(){ var f = selRegion(); return f && f.t.kind === "inst" ? f : null; }
    function rollAsk(){ if(ROLL.view && UI.tab === "notes") ROLL.view.ask(); if(typeof drumAsk === "function") drumAsk(); if(typeof takeAsk === "function") takeAsk(); }
    function rollSelClear(){ ROLL.sel = []; }
    function rollFocus(){ try { ROLL.host.focus({ preventScroll:true }); } catch(e){} }
    function rollLen(f){ var p = patOf(f.r); return Math.max(f.r.l, p ? p.len : 0); }
    function rollGrid(){
      if(ROLL.snap === 0) return 0;
      if(ROLL.snap !== "auto") return ROLL.snap;
      var c = [PPQ, PPQ / 2, PPQ / 4, PPQ / 8], i, g = PPQ; for(i = 0; i < c.length; i++) if(c[i] * ROLL.ppt >= 9) g = c[i];
      if(S.sig[1] === 8 && g === PPQ) g = PPQ / 2;
      return g;
    }
    function rollSnapT(u, e){ var g = rollGrid(); return (!g || (e && e.shiftKey)) ? Math.round(u) : Math.round(u / g) * g; }
    function rollX(u, sl){ return ROLL.keysW + u * ROLL.ppt - sl; }
    function rollU(x, sl){ return (x - ROLL.keysW + sl) / ROLL.ppt; }
    function rollY(p, st){ return ROLL.rulerH + (127 - p) * ROLL.rowH - st; }
    function rollP(y, st){ return 127 - Math.floor((y - ROLL.rulerH + st) / ROLL.rowH); }
    function rollContent(){ var f = rollRegion(); return { w:ROLL.keysW + (f ? rollLen(f) * ROLL.ppt : 0) + 60, h:ROLL.rulerH + 128 * ROLL.rowH + ROLL.velH }; }
    function isBlack(p){ return [1, 3, 6, 8, 10].indexOf(((p % 12) + 12) % 12) >= 0; }
    function rollCentre(f){
      // bring the notes (or the instrument's middle) into view, once for each region
      var host = ROLL.host, p = patOf(f.r), lo = 127, hi = 0;
      if(p && p.notes.length) p.notes.forEach(function(n){ if(n.p < lo) lo = n.p; if(n.p > hi) hi = n.p; });
      else { var d = ENG.inst[f.t.inst] || ENG.inst[standIn(f.t)], rg = d && d.range ? d.range : [48, 72], mid = Math.round((rg[0] + rg[1]) / 2); lo = mid - 6; hi = mid + 6; }
      var gridH = host.clientHeight - ROLL.rulerH - ROLL.velH, midY = (127 - (lo + hi) / 2) * ROLL.rowH;
      host.scrollTop = Math.max(0, midY - gridH / 2);
    }
    function rollFit(){
      var f = rollRegion(), host = ROLL.host; if(!f) return;
      var p = patOf(f.r), lo = 127, hi = 0, L = rollLen(f);
      ROLL.ppt = clamp((host.clientWidth - ROLL.keysW - 24) / L, 0.02, 1.2);
      if(p && p.notes.length){ p.notes.forEach(function(n){ if(n.p < lo) lo = n.p; if(n.p > hi) hi = n.p; }); ROLL.rowH = clamp(Math.floor((host.clientHeight - ROLL.rulerH - ROLL.velH - 16) / (hi - lo + 5)), 8, 22); }
      ROLL.view.paint(); host.scrollLeft = 0; rollCentre(f); ROLL.view.ask();
    }
    function rollZoom(fz, p, axis){
      var host = ROLL.host;
      if(axis === "y"){
        var pitch = rollP(p.y, host.scrollTop) ; ROLL.rowH = clamp(Math.round(ROLL.rowH * (fz > 1 ? 1.15 : 0.87)), 7, 26);
        ROLL.view.paint(); host.scrollTop = Math.max(0, ROLL.rulerH + (127 - pitch) * ROLL.rowH - p.y); ROLL.view.ask(); return;
      }
      var u = rollU(p.x, host.scrollLeft); ROLL.ppt = clamp(ROLL.ppt * fz, 0.015, 1.6);
      ROLL.view.paint(); host.scrollLeft = Math.max(0, u * ROLL.ppt + ROLL.keysW - p.x); ROLL.view.ask();
    }

    function rollPaint(c, w, h, sl, st){
      var C = colors(), f = rollRegion(), K = ROLL.keysW, RH = ROLL.rulerH, VH = ROLL.velH, rowH = ROLL.rowH, ppt = ROLL.ppt, gh = h - VH, i, x, y, p;
      c.clearRect(0, 0, w, h); c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
      if(!f){
        c.fillStyle = C.ink3; c.font = "500 12.5px " + FONT; c.textAlign = "center"; c.textBaseline = "middle";
        var t0 = selTrack(), msg = !S.tracks.length ? "" : t0 && t0.kind === "inst" ? "Double-click the track’s lane above to start a region, or press Hum on the track." : "Select a region of an instrument track to see its notes here.";
        c.fillText(msg, w / 2, h / 2); return;
      }
      var r = f.r, t = f.t, pat = patOf(r), L = rollLen(f), col = trackColor(t), bt = barTicks(), bq = beatTicks(), g = rollGrid() || PPQ / 4;
      if(ROLL.forRegion !== r.id){ ROLL.forRegion = r.id; rollCentre(f); st = ROLL.host.scrollTop; sl = ROLL.host.scrollLeft; }
      var pTop = Math.min(127, rollP(RH, st)), pBot = Math.max(0, rollP(gh, st)), sc = scaleOf(), root = S.key.root;
      c.save(); c.beginPath(); c.rect(K, RH, w - K, gh - RH); c.clip();
      // rows
      for(p = pTop; p >= pBot; p--){
        y = rollY(p, st);
        var black = isBlack(p), out = sc && sc.indexOf(p % 12) < 0;
        c.fillStyle = out ? (C.light ? "#C6C6C2" : "#101010") : black ? (C.light ? "#D6D6D3" : "#191919") : C.surface;
        c.fillRect(K, y, w - K, rowH);
        if(sc && p % 12 === root){ c.fillStyle = alpha(col, C.light ? 0.16 : 0.11); c.fillRect(K, y, w - K, rowH); }
        if(rowH >= 10 || p % 12 === 0){ c.fillStyle = p % 12 === 0 ? C.line2 : C.line; c.fillRect(K, y + rowH - 1, w - K, 1); }
      }
      // grid lines: bars, beats, the snap value
      var u0 = Math.max(0, rollU(K, sl)), u1 = Math.min(L, rollU(w, sl)), base = r.s, k;
      var kStart = Math.floor((base + u0) / g) * g - base;
      for(k = kStart; k <= u1; k += g){
        if(k < 0) continue;
        var abs = base + k, onBar = Math.abs(abs % bt) < 0.5, onBeat = Math.abs(abs % bq) < 0.5;
        if(!onBar && !onBeat && g * ppt < 7) continue;
        x = Math.round(rollX(k, sl)) + 0.5;
        c.strokeStyle = onBar ? (C.light ? "rgba(0,0,0,.42)" : "rgba(255,255,255,.3)") : onBeat ? C.line2 : C.line;
        c.beginPath(); c.moveTo(x, RH); c.lineTo(x, gh); c.stroke();
      }
      // beyond the part's own length the grid is shaded: that stretch repeats the part
      if(pat && pat.len < L){ c.fillStyle = C.light ? "rgba(0,0,0,.1)" : "rgba(0,0,0,.34)"; c.fillRect(rollX(pat.len, sl), RH, (L - pat.len) * ppt, gh - RH); }
      c.fillStyle = C.light ? "rgba(0,0,0,.14)" : "rgba(0,0,0,.45)"; c.fillRect(rollX(L, sl), RH, w, gh - RH);
      if(S.loop.on){ c.fillStyle = alpha(C.accent, 0.05); c.fillRect(rollX(S.loop.a - base, sl), RH, (S.loop.b - S.loop.a) * ppt, gh - RH); }
      // the other tracks, faintly
      if(ROLL.ghost){
        S.tracks.forEach(function(ot){
          if(ot === t || ot.kind !== "inst" || ot.mute) return;
          var oc = trackColor(ot); c.fillStyle = alpha(oc, 0.2); c.strokeStyle = alpha(oc, 0.55);
          ot.regions.forEach(function(or){
            if(or.s >= base + L || or.s + or.l <= base) return;
            eachNote(or, base + u0 - bt, base + u1, function(s, l, pp){
              var nx = rollX(s - base, sl), ny = rollY(pp + 12 * ((ot.oct || 0) - (t.oct || 0)), st), nw = Math.max(2, l * ppt - 1);
              if(ny < RH - rowH || ny > gh) return;
              c.fillRect(nx, ny + 2, nw, rowH - 4); c.strokeRect(nx + 0.5, ny + 2.5, nw - 1, rowH - 5);
            });
          });
        });
      }
      // her voice: the line she hummed, in the octave the notes were put in
      var ti = r.hum ? takeCache[r.hum.take] : null;
      if(r.hum && !ti) takeInfo(r.hum.take).then(function(v){ if(v) rollAsk(); });
      if(ti && ti.an && ti.an.contour){
        var an = ti.an, hop = an.hop, shift = 12 * (r.hum.shift || 0) + (r.hum.semi || 0) - an.tune, pen = false, tps = S.tempo * PPQ / 60, a0 = Math.max(0, Math.floor((r.hum.origin + u0 / tps - an.t0) / hop) - 1), a1 = Math.min(an.contour.length, Math.ceil((r.hum.origin + u1 / tps - an.t0) / hop) + 1);
        c.lineJoin = "round"; c.lineCap = "round";
        [[5, alpha(col, 0.16)], [1.6, alpha(C.light ? "#000000" : "#ffffff", C.light ? 0.6 : 0.7)]].forEach(function(pass){
          c.lineWidth = pass[0]; c.strokeStyle = pass[1]; c.beginPath(); pen = false;
          for(i = a0; i < a1; i++){
            var v = an.contour[i]; if(!v){ pen = false; continue; }
            var xx = rollX((an.t0 + i * hop - r.hum.origin) * tps, sl), yy = RH + (127 - (v + shift) + 0.5) * rowH - st;
            if(pen) c.lineTo(xx, yy); else { c.moveTo(xx, yy); pen = true; }
          }
          c.stroke();
        });
        c.lineWidth = 1;
      }
      // notes
      var selSet = ROLL.sel, hasHum = !!r.hum;
      if(pat){
        c.font = "600 " + Math.min(10.5, rowH - 3) + "px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
        for(i = 0; i < pat.notes.length; i++){
          var n = pat.notes[i];
          if(n.s > u1 || n.s + n.l < u0 || n.p > pTop + 1 || n.p < pBot - 1) continue;
          var on = selSet.indexOf(n) >= 0, nx = rollX(n.s, sl), ny = rollY(n.p, st), nw = Math.max(3, n.l * ppt - 1), dim = n.s >= pat.len;
          c.fillStyle = alpha(col, dim ? 0.25 : hasHum && !on ? 0.42 + 0.4 * n.v / 127 : 0.5 + 0.5 * n.v / 127);
          c.beginPath(); rr(c, nx, ny + 1, nw, rowH - 2, 3); c.fill();
          c.fillStyle = col; c.fillRect(nx, ny + 1, Math.min(3, nw), rowH - 2);
          if(on){ c.strokeStyle = C.ink; c.lineWidth = 1.5; c.beginPath(); rr(c, nx + 0.75, ny + 1.75, nw - 1.5, rowH - 3.5, 3); c.stroke(); c.lineWidth = 1; }
          if(n.m){ c.fillStyle = C.ink; c.beginPath(); c.moveTo(nx + nw - 7, ny + 1); c.lineTo(nx + nw, ny + 1); c.lineTo(nx + nw, ny + 8); c.closePath(); c.fill(); }   // moved to fit the key
          if(rowH >= 12 && nw >= 26){ c.fillStyle = C.light ? "#ffffff" : "#0e0e0e"; c.fillText(noteName(n.p + 12 * (t.oct || 0)), nx + 6, ny + rowH / 2 + 0.5); }
        }
      }
      if(ROLL.marquee){ var m = ROLL.marquee; c.fillStyle = alpha(C.accent, 0.12); c.strokeStyle = C.accent; c.fillRect(m.x0, m.y0, m.x1 - m.x0, m.y1 - m.y0); c.strokeRect(Math.round(m.x0) + 0.5, Math.round(m.y0) + 0.5, m.x1 - m.x0, m.y1 - m.y0); }
      // playhead
      var ph = ROLL.phTick === null ? TR.pos : ROLL.phTick, px = Math.round(rollX(ph - base, sl)) + 0.5;
      if(px >= K && px <= w){ c.strokeStyle = C.ink; c.beginPath(); c.moveTo(px, RH); c.lineTo(px, gh); c.stroke(); }
      c.restore();
      // velocity lane
      c.fillStyle = C.surface; c.fillRect(0, gh, w, VH); c.strokeStyle = C.line2; c.beginPath(); c.moveTo(0, gh + 0.5); c.lineTo(w, gh + 0.5); c.stroke();
      c.save(); c.beginPath(); c.rect(K, gh + 1, w - K, VH - 1); c.clip();
      c.strokeStyle = C.line; c.beginPath(); c.moveTo(K, gh + 6 + (VH - 12) * 0.5 + 0.5); c.lineTo(w, gh + 6 + (VH - 12) * 0.5 + 0.5); c.stroke();
      if(pat) for(i = 0; i < pat.notes.length; i++){
        var nv = pat.notes[i]; if(nv.s > u1 || nv.s < u0 - 10) continue;
        var vx = Math.round(rollX(nv.s, sl)), vh = Math.max(2, (VH - 12) * nv.v / 127), sel2 = selSet.indexOf(nv) >= 0;
        c.fillStyle = sel2 ? C.ink : alpha(col, 0.9); c.fillRect(vx, gh + VH - 5 - vh, 3, vh); c.fillRect(vx - 2, gh + VH - 5 - vh, 7, 3);
      }
      c.restore();
      c.fillStyle = C.surface; c.fillRect(0, gh + 1, K, VH - 1); c.fillStyle = C.ink3; c.font = "600 10px " + FONT; c.textAlign = "left"; c.textBaseline = "middle"; c.fillText("Velocity", 8, gh + VH / 2);
      // ruler
      c.fillStyle = C.surface; c.fillRect(0, 0, w, RH); c.strokeStyle = C.line2; c.beginPath(); c.moveTo(0, RH + 0.5); c.lineTo(w, RH + 0.5); c.stroke();
      c.save(); c.beginPath(); c.rect(K, 0, w - K, RH); c.clip();
      c.font = "500 10.5px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
      var b0 = Math.floor((base + u0) / bt), b1 = Math.ceil((base + u1) / bt), barPx = bt * ppt, showBeats = bq * ppt >= 34;
      for(k = b0; k <= b1; k++){
        x = Math.round(rollX(k * bt - base, sl)) + 0.5;
        c.strokeStyle = C.ink3; c.beginPath(); c.moveTo(x, 9); c.lineTo(x, RH); c.stroke();
        if(barPx >= 26 || k % 2 === 0){ c.fillStyle = C.ink2; c.fillText(String(k + 1), x + 4, 7); }
        if(showBeats) for(i = 1; i < bt / bq; i++){ var xb = Math.round(rollX(k * bt + i * bq - base, sl)) + 0.5; c.strokeStyle = C.line2; c.beginPath(); c.moveTo(xb, 14); c.lineTo(xb, RH); c.stroke(); c.fillStyle = C.ink3; c.fillText((k + 1) + "." + (i + 1), xb + 4, 7); }
      }
      var la = rollX(S.loop.a - base, sl), lb = rollX(S.loop.b - base, sl);
      c.fillStyle = S.loop.on ? C.accent : alpha(C.ink3, 0.45); c.fillRect(la, RH - 4, lb - la, 3);
      if(px >= K){ c.fillStyle = C.ink; c.beginPath(); c.moveTo(px - 5, RH - 8); c.lineTo(px + 5, RH - 8); c.lineTo(px, RH - 1); c.closePath(); c.fill(); }
      c.restore();
      // keys
      c.fillStyle = C.surface; c.fillRect(0, 0, K, RH);
      c.save(); c.beginPath(); c.rect(0, RH, K, gh - RH); c.clip();
      c.font = "500 " + Math.min(10.5, Math.max(8.5, rowH - 3)) + "px " + FONT; c.textBaseline = "middle"; c.textAlign = "right";
      for(p = pTop; p >= pBot; p--){
        y = rollY(p, st);
        var blk = isBlack(p), sound = p + 12 * (t.oct || 0), inS = !sc || sc.indexOf(p % 12) >= 0, down = ROLL.downKey === p || KB.held[p];
        c.fillStyle = down ? col : blk ? (C.light ? "#3a3a3a" : "#0c0c0c") : (C.light ? "#fbfbf9" : "#cfcfcb");
        c.fillRect(0, y, blk ? K * 0.62 : K - 1, rowH - (blk ? 0 : 1));
        if(blk){ c.fillStyle = C.light ? "#fbfbf9" : "#cfcfcb"; c.fillRect(K * 0.62, y, K * 0.38 - 1, rowH); c.fillStyle = C.light ? "rgba(0,0,0,.25)" : "rgba(0,0,0,.4)"; c.fillRect(K * 0.62, y + Math.floor(rowH / 2), K * 0.38 - 1, 1); }
        if(p % 12 === 0 || (rowH >= 13 && !blk)){
          c.fillStyle = p % 12 === 0 ? "#111111" : "rgba(0,0,0,.55)"; if(down) c.fillStyle = C.onAccent;
          c.fillText(noteName(sound), K - 6, y + rowH / 2 + 0.5);
        }
        if(sc && inS){ c.fillStyle = p % 12 === root ? col : alpha(col, 0.55); c.fillRect(K - 3, y + 1, 2, rowH - 2); }
      }
      c.restore();
      c.strokeStyle = C.line2; c.beginPath(); c.moveTo(K + 0.5, 0); c.lineTo(K + 0.5, h); c.stroke();
    }

    // ---- the pointer in the note editor ----
    function rollNoteAt(p, sl, st){
      var f = rollRegion(), pat = f && patOf(f.r); if(!pat) return null;
      var u = rollU(p.x, sl), pitch = rollP(p.y, st), i;
      for(i = pat.notes.length - 1; i >= 0; i--){
        var n = pat.notes[i]; if(n.p !== pitch) continue;
        var x0 = n.s * ROLL.ppt, x1 = Math.max(x0 + 4, (n.s + n.l) * ROLL.ppt), xx = u * ROLL.ppt;
        if(xx >= x0 - 1 && xx <= x1 + 1) return { n:n, edge:(x1 - xx < 6 && x1 - x0 > 10) ? "r" : (xx - x0 < 5 && x1 - x0 > 16 ? "l" : "") };
      }
      return null;
    }
    function rollHover(p){
      var f = rollRegion(), host = ROLL.host; if(!f) return "";
      if(p.y < ROLL.rulerH) return p.x > ROLL.keysW ? "pointer" : "";
      if(p.x < ROLL.keysW) return p.y < host.clientHeight - ROLL.velH ? "pointer" : "";
      if(p.y > host.clientHeight - ROLL.velH) return "ns-resize";
      var hit = rollNoteAt(p, host.scrollLeft, host.scrollTop);
      if(hit) return hit.edge ? "ew-resize" : (ROLL.tool === "pencil" ? "pointer" : "grab");
      return ROLL.tool === "pencil" ? "crosshair" : "";
    }
    function noteEdited(f){ if(f.r.hum) f.r.hum.edited = true; if(f.r.gen) delete f.r.gen; sortNotes(patOf(f.r)); }
    function ownPattern(f){
      // a part shorter than its region repeats; before it is edited past its own end it is written out
      var p = patOf(f.r); if(p.len < f.r.l){ var sel = ROLL.sel.slice(); void sel; }
      return p;
    }
    function rollDown(p, e){
      var f = rollRegion(), host = ROLL.host; if(!f) return null;
      var sl = host.scrollLeft, st = host.scrollTop, r = f.r, t = f.t, pat = patOf(r), gh = host.clientHeight - ROLL.velH, base = r.s;
      closePops(); rollFocus();
      // ruler: playhead, or a drag for the loop
      if(p.y < ROLL.rulerH){
        if(p.x < ROLL.keysW) return null;
        var bt = barTicks(), movedL = false, t0 = Math.max(0, Math.round((base + rollU(p.x, sl)) / bt) * bt);
        return { move:function(q){ if(!movedL && Math.abs(q.x - p.x) < 5) return; movedL = true; var tk = Math.max(0, Math.round((base + rollU(q.x, host.scrollLeft)) / bt) * bt); S.loop.a = Math.min(t0, tk); S.loop.b = Math.max(Math.max(t0, tk), S.loop.a + bt); S.loop.on = true; paintBar(); ARR.view.ask(); ROLL.view.ask(); },
                 up:function(){ if(movedL) touch(); else setPos(Math.max(0, base + rollSnapT(rollU(p.x, sl), e))); } };
      }
      // keys: play the note while held
      if(p.x < ROLL.keysW){
        if(p.y > gh) return null;
        var kp = rollP(p.y, st); ROLL.downKey = kp; liveOn(t, kp, 96, "key"); noteRecEvent(true, kp, 96); ROLL.view.ask();
        return { move:function(q){ var np = rollP(q.y, host.scrollTop); if(np !== ROLL.downKey && q.y < gh && q.y > ROLL.rulerH){ noteRecEvent(false, ROLL.downKey); ROLL.downKey = np; liveOn(t, np, 96, "key"); noteRecEvent(true, np, 96); ROLL.view.ask(); } },
                 up:function(){ liveOff("key"); noteRecEvent(false, ROLL.downKey); ROLL.downKey = -1; ROLL.view.ask(); }, cancel:function(){ liveOff("key"); ROLL.downKey = -1; ROLL.view.ask(); } };
      }
      // velocity lane: drag a stem; drawing across sets several
      if(p.y > gh){
        var changedV = false;
        var setV = function(q){
          var u = rollU(q.x, host.scrollLeft), v = clamp(Math.round(127 * (gh + ROLL.velH - 5 - q.y) / (ROLL.velH - 12)), 1, 127), best = null, bd = 9 / ROLL.ppt;
          pat.notes.forEach(function(n){ var d = Math.abs(n.s - u); if(d < bd){ bd = d; best = n; } });
          if(!best) return;
          var grp = ROLL.sel.indexOf(best) >= 0 ? ROLL.sel : pat.notes.filter(function(n){ return n.s === best.s && (ROLL.sel.length === 0 || true) && n === best; });
          var dv = v - best.v; grp.forEach(function(n){ n.v = clamp(n.v + dv, 1, 127); }); if(dv) changedV = true; ROLL.lastVel = best.v; ROLL.view.ask();
        };
        setV(p);
        return { move:setV, up:function(){ if(changedV){ noteEdited(f); commit("change velocity", true); refresh(); } } };
      }
      var hit = rollNoteAt(p, sl, st), u = rollU(p.x, sl), pitch = rollP(p.y, st);
      if(ROLL.tool === "pencil" && hit && !hit.edge){
        pat.notes.splice(pat.notes.indexOf(hit.n), 1); ROLL.sel = []; noteEdited(f); commit("delete note"); return { up:function(){} };
      }
      if(!hit){
        if(ROLL.tool === "pencil"){
          // draw: press where the note starts, pull to its length
          var s0 = Math.max(0, Math.floor(u / (rollGrid() || 1)) * (rollGrid() || 1)); if(e.shiftKey) s0 = Math.round(u);
          var np2 = clamp(ROLL.keySnap ? snapToScale(pitch) : pitch, 0, 127), nn = { s:s0, l:ROLL.lastLen, p:np2, v:ROLL.lastVel };
          pat.notes.push(nn); ROLL.sel = [nn]; blip(t, np2, nn.v, 0.25); ROLL.view.ask();
          return { move:function(q, ev){ var end = rollSnapT(rollU(q.x, host.scrollLeft), ev); nn.l = Math.max(rollGrid() || PPQ / 8, end - nn.s); ROLL.view.ask(); },
                   up:function(){ ROLL.lastLen = nn.l; noteEdited(f); commit("draw a note"); }, cancel:function(){ pat.notes.splice(pat.notes.indexOf(nn), 1); ROLL.sel = []; ROLL.view.ask(); } };
        }
        if(e.pointerType === "touch"){ if(ROLL.sel.length){ ROLL.sel = []; ROLL.view.ask(); paintEditorTools(); } return null; }
        // empty grid: a box that selects
        var keep = e.shiftKey ? ROLL.sel.slice() : [], m = ROLL.marquee = { x0:p.x, y0:p.y, x1:p.x, y1:p.y, sl:sl, st:st }, movedM = false;
        return {
          move:function(q){
            movedM = true;
            var dx = host.scrollLeft - m.sl, dy = host.scrollTop - m.st;
            m.x0 = Math.min(p.x - dx, q.x); m.x1 = Math.max(p.x - dx, q.x); m.y0 = Math.max(ROLL.rulerH, Math.min(p.y - dy, q.y)); m.y1 = Math.min(gh, Math.max(p.y - dy, q.y));
            var ua = rollU(m.x0, host.scrollLeft), ub = rollU(m.x1, host.scrollLeft), ph = rollP(m.y0, host.scrollTop), pl = rollP(m.y1, host.scrollTop);
            ROLL.sel = keep.concat(pat.notes.filter(function(n){ return keep.indexOf(n) < 0 && n.s < ub && n.s + n.l > ua && n.p <= ph && n.p >= pl; }));
            ROLL.view.ask();
          },
          up:function(){ ROLL.marquee = null; if(!movedM){ ROLL.sel = keep; } ROLL.view.ask(); paintEditorTools(); },
          cancel:function(){ ROLL.marquee = null; ROLL.view.ask(); }
        };
      }
      // a note: select it, then move it or pull one of its ends
      var n = hit.n;
      if(e.shiftKey && ROLL.sel.indexOf(n) >= 0 && !hit.edge){ ROLL.sel.splice(ROLL.sel.indexOf(n), 1); ROLL.view.ask(); paintEditorTools(); return { up:function(){} }; }
      if(ROLL.sel.indexOf(n) < 0) ROLL.sel = e.shiftKey ? ROLL.sel.concat([n]) : [n];
      paintEditorTools();
      var group = ROLL.sel.slice(), orig = group.map(function(x){ return { s:x.s, l:x.l, p:x.p }; }), copied = false, moved = false, lastP = n.p, grabU = u - n.s;
      blip(t, n.p, n.v, 0.22);
      ROLL.lastLen = n.l; ROLL.lastVel = n.v;
      var minS = Math.min.apply(null, orig.map(function(o){ return o.s; })), maxP = Math.max.apply(null, orig.map(function(o){ return o.p; })), minP = Math.min.apply(null, orig.map(function(o){ return o.p; }));
      return {
        move:function(q, ev){
          if(!moved && Math.hypot(q.x - p.x, q.y - p.y) < 4) return;
          if(!moved && ev.altKey && !hit.edge){
            // Alt: the originals stay, copies are what moves
            var cps = group.map(function(x){ var c2 = { s:x.s, l:x.l, p:x.p, v:x.v }; pat.notes.push(c2); return c2; }); group = cps; ROLL.sel = cps.slice(); copied = true;
          }
          moved = true;
          var uu = rollU(q.x, host.scrollLeft), i2;
          if(hit.edge === "r"){
            var end = rollSnapT(uu, ev), dl = end - (orig[group.indexOf(n) < 0 ? 0 : group.indexOf(n)].s + orig[group.indexOf(n) < 0 ? 0 : group.indexOf(n)].l);
            for(i2 = 0; i2 < group.length; i2++) group[i2].l = Math.max(rollGrid() ? Math.min(rollGrid(), PPQ / 8) : 10, orig[i2].l + dl);
            ROLL.lastLen = n.l;
          } else if(hit.edge === "l"){
            var k = group.indexOf(n), st2 = rollSnapT(uu, ev), ds = st2 - orig[k].s;
            for(i2 = 0; i2 < group.length; i2++){ var d2 = Math.min(ds, orig[i2].l - 10); if(orig[i2].s + d2 < 0) d2 = -orig[i2].s; group[i2].s = orig[i2].s + d2; group[i2].l = orig[i2].l - d2; }
          } else {
            var k2 = group.indexOf(n), ns = rollSnapT(uu - grabU, ev), dt = Math.max(-minS, ns - orig[k2].s), dp = clamp(rollP(q.y, host.scrollTop) - rollP(p.y, st), -minP, 127 - maxP);
            for(i2 = 0; i2 < group.length; i2++){ group[i2].s = orig[i2].s + dt; group[i2].p = orig[i2].p + dp; }
            if(n.p !== lastP){ lastP = n.p; blip(t, n.p, n.v, 0.2); }
          }
          ROLL.view.ask();
        },
        up:function(){
          if(!moved) return;
          group.forEach(function(x){ if(x.m) delete x.m; if(x.c) delete x.c; if(ROLL.keySnap && !hit.edge) x.p = snapToScale(x.p); });
          var L = Math.max.apply(null, group.map(function(x){ return x.s + x.l; }));
          if(L > pat.len && pat.len >= r.l){ /* past the end: the part stays its length; the note is kept */ }
          noteEdited(f); commit(copied ? "copy notes" : hit.edge ? "change note length" : "move notes");
        },
        cancel:function(){
          if(copied) group.forEach(function(x){ var i3 = pat.notes.indexOf(x); if(i3 >= 0) pat.notes.splice(i3, 1); });
          else group.forEach(function(x, i3){ x.s = orig[i3].s; x.l = orig[i3].l; x.p = orig[i3].p; });
          ROLL.view.ask();
        }
      };
    }
    function rollDbl(p, e){
      var f = rollRegion(), host = ROLL.host; if(!f || p.x < ROLL.keysW || p.y < ROLL.rulerH || p.y > host.clientHeight - ROLL.velH) return;
      var hit = rollNoteAt(p, host.scrollLeft, host.scrollTop), pat = patOf(f.r);
      if(hit){ pat.notes.splice(pat.notes.indexOf(hit.n), 1); ROLL.sel = []; noteEdited(f); commit("delete note"); return; }
      if(ROLL.tool === "pencil") return;
      var g = rollGrid() || 1, u = rollU(p.x, host.scrollLeft), s = Math.max(0, e.shiftKey ? Math.round(u) : Math.floor(u / g) * g), pitch = rollP(p.y, host.scrollTop);
      if(ROLL.keySnap) pitch = snapToScale(pitch);
      var n = { s:s, l:ROLL.lastLen, p:clamp(pitch, 0, 127), v:ROLL.lastVel };
      pat.notes.push(n); ROLL.sel = [n]; blip(f.t, n.p, n.v, 0.25); noteEdited(f); commit("add a note");
    }

    // ---- what can be done to the selected notes (buttons, menu, keys and the Assistant all come here) ----
    function rollNotes(){ var f = rollRegion(); return f ? patOf(f.r).notes : []; }
    function rollSelOrAll(){ return ROLL.sel.length ? ROLL.sel : rollNotes(); }
    function rollDo(what, arg){
      var f = rollRegion(); if(!f) return false;
      var pat = patOf(f.r), sel = ROLL.sel, g = rollGrid() || PPQ / 4, bt = barTicks(), i;
      function need(){ if(!sel.length){ tell("Select one or more notes first: click one, or drag a box round several."); return false; } return true; }
      function done(label){ noteEdited(f); commit(label); return true; }
      if(what === "all"){ ROLL.sel = pat.notes.slice(); ROLL.view.ask(); paintEditorTools(); return true; }
      if(what === "none"){ ROLL.sel = []; ROLL.view.ask(); paintEditorTools(); return true; }
      if(what === "delete"){ if(!need()) return false; pat.notes = pat.notes.filter(function(n){ return sel.indexOf(n) < 0; }); ROLL.sel = []; return done("delete notes"); }
      if(what === "duplicate"){
        if(!need()) return false;
        var a = Math.min.apply(null, sel.map(function(n){ return n.s; })), b = Math.max.apply(null, sel.map(function(n){ return n.s + n.l; })), span = Math.max(g, Math.ceil((b - a) / g) * g);
        var cp = sel.map(function(n){ return { s:n.s + span, l:n.l, p:n.p, v:n.v }; }); cp.forEach(function(n){ pat.notes.push(n); }); ROLL.sel = cp; return done("duplicate notes");
      }
      if(what === "copy"){ if(!need()) return false; var a2 = Math.min.apply(null, sel.map(function(n){ return n.s; })); ROLL.clip = sel.map(function(n){ return { s:n.s - a2, l:n.l, p:n.p, v:n.v }; }); tell(sel.length + (sel.length === 1 ? " note copied." : " notes copied.")); return true; }
      if(what === "cut"){ if(!need()) return false; rollDo("copy"); return rollDo("delete"); }
      if(what === "paste"){
        if(!ROLL.clip || !ROLL.clip.length){ tell("Nothing has been copied yet."); return false; }
        var at = TR.pos >= f.r.s && TR.pos < f.r.s + rollLen(f) ? Math.round((TR.pos - f.r.s) / g) * g : 0;
        var cp2 = ROLL.clip.map(function(n){ return { s:n.s + at, l:n.l, p:n.p, v:n.v }; }); cp2.forEach(function(n){ pat.notes.push(n); }); ROLL.sel = cp2; return done("paste notes");
      }
      if(what === "nudge"){ if(!need()) return false; var mn = Math.min.apply(null, sel.map(function(n){ return n.s; })), d = Math.max(-mn, arg); if(!d) return false; sel.forEach(function(n){ n.s += d; }); return done("nudge notes"); }
      if(what === "transpose"){
        var list = rollSelOrAll(); if(!list.length) return false;
        var hi = Math.max.apply(null, list.map(function(n){ return n.p; })), lo = Math.min.apply(null, list.map(function(n){ return n.p; })), dp = clamp(arg, -lo, 127 - hi); if(!dp) return false;
        list.forEach(function(n){ n.p += dp; delete n.m; });
        if(list.length === 1) blip(f.t, list[0].p, list[0].v, 0.2);
        return done(Math.abs(arg) === 12 ? "move notes an octave" : "transpose notes");
      }
      if(what === "quantise"){
        // arg: { strength 0..1, grid }
        var l2 = rollSelOrAll(); if(!l2.length) return false;
        var gq = (arg && arg.grid) || g, k = arg && arg.strength !== undefined ? arg.strength : 1;
        l2.forEach(function(n){ var tq = Math.round(n.s / gq) * gq; n.s = Math.max(0, Math.round(n.s + (tq - n.s) * k)); });
        return done("quantise notes");
      }
      if(what === "legato"){
        var l3 = rollSelOrAll().slice().sort(function(x, y){ return x.s - y.s; }); if(l3.length < 2) return false;
        for(i = 0; i < l3.length - 1; i++){ var j = i + 1; while(j < l3.length && l3[j].s <= l3[i].s) j++; if(j < l3.length) l3[i].l = l3[j].s - l3[i].s; }
        return done("join notes end to start");
      }
      if(what === "length"){ if(!need()) return false; sel.forEach(function(n){ n.l = arg || g; }); return done("set note length"); }
      if(what === "split"){
        // at the playhead where it crosses a note, otherwise each selected note in half
        if(!need()) return false;
        var at2 = TR.pos - f.r.s, cut = sel.filter(function(n){ return at2 > n.s && at2 < n.s + n.l; }), add = [];
        (cut.length ? cut : sel).forEach(function(n){ var c = cut.length ? at2 : n.s + Math.round(n.l / 2 / (g / 2)) * (g / 2); if(c <= n.s || c >= n.s + n.l) c = n.s + n.l / 2; var q = { s:Math.round(c), l:Math.round(n.s + n.l - c), p:n.p, v:n.v }; n.l = Math.round(c - n.s); add.push(q); });
        add.forEach(function(n){ pat.notes.push(n); }); ROLL.sel = sel.concat(add); return done("split notes");
      }
      if(what === "join"){
        if(sel.length < 2){ tell("Select two or more notes of the same pitch to join them."); return false; }
        var by = {}; sel.forEach(function(n){ (by[n.p] = by[n.p] || []).push(n); });
        var out = []; Object.keys(by).forEach(function(k2){ var ns = by[k2].sort(function(x, y){ return x.s - y.s; }), first = ns[0], end = Math.max.apply(null, ns.map(function(n){ return n.s + n.l; })); first.l = end - first.s; ns.slice(1).forEach(function(n){ pat.notes.splice(pat.notes.indexOf(n), 1); }); out.push(first); });
        ROLL.sel = out; return done("join notes");
      }
      if(what === "velocity"){ var l4 = rollSelOrAll(); if(!l4.length) return false; l4.forEach(function(n){ n.v = clamp(n.v + arg, 1, 127); }); return done(arg > 0 ? "louder notes" : "softer notes"); }
      if(what === "tokey"){
        if(!scaleOf()){ tell("The song has no key yet. Choose one with the Key button at the top."); return false; }
        var l5 = rollSelOrAll(), ch = 0; l5.forEach(function(n){ var q = snapToScale(n.p); if(q !== n.p){ n.p = q; n.m = 1; ch++; } });
        if(!ch){ tell("Those notes are all in " + keyName(S.key) + " already."); return false; }
        return done("fit notes to the key");
      }
      return false;
    }
    function partLength(delta){
      var f = rollRegion() || drumRegion(); if(!f) return;
      var p = patOf(f.r), bt = barTicks(), nl = Math.max(bt, Math.round(p.len / bt) * bt + delta * bt), same = p.len >= f.r.l;
      if(nl === p.len) return;
      var nxt = f.t.regions.filter(function(x){ return x.s > f.r.s; })[0];
      if(same && nxt && f.r.s + nl > nxt.s){ tell("The next region is in the way. Move it, or shorten it, first."); return; }
      p.len = nl; if(same) f.r.l = nl;
      growBars(); commit(delta > 0 ? "lengthen the part" : "shorten the part"); refresh(true);
    }

    // ---- playing notes by hand: keys on the screen and musical typing ----
    function kbToggle(on){
      UI.kbd = on === undefined ? !UI.kbd : on;
      var t = selTrack(); if(UI.kbd && t && t.kind === "inst"){ var d = ENG.inst[t.inst] || ENG.inst[standIn(t)], rg = d && d.range ? d.range : [48, 72]; KB.oct = clamp(Math.round(((rg[0] + rg[1]) / 2 - 6) / 12) - 1, 0, 8); }
      paintEditor(true);
    }
    function kbBuild(host){
      host.textContent = "";
      var t = selTrack(), box = el("div", "st-kb"), keysEl = el("div", "st-kbkeys"), base = (KB.oct + 1) * 12, i;
      var info = el("div", "st-kbinfo");
      info.appendChild(tbtn("quiet", "Octave −", "Lower octave (Z)", function(){ KB.oct = clamp(KB.oct - 1, 0, 8); kbBuild(host); }));
      info.appendChild(el("span", "st-l", "C" + KB.oct + " to E" + (KB.oct + 1)));
      info.appendChild(tbtn("quiet", "Octave +", "Higher octave (X)", function(){ KB.oct = clamp(KB.oct + 1, 0, 8); kbBuild(host); }));
      info.appendChild(el("span", "st-kbnote", t && t.kind !== "audio" ? "The letters on the keys play them. Press Record at the top to keep what you play." : "Select an instrument track to play it."));
      box.appendChild(info);
      var whites = 0;
      for(i = 0; i < 17; i++){
        (function(k){
          var p = base + k, blk = isBlack(p), b = el("button", "st-key" + (blk ? " black" : ""));
          b.type = "button"; b.tabIndex = -1; b.dataset.p = p; b.setAttribute("aria-label", noteName(p));
          b.appendChild(el("span", "", KB_KEYS[k].toUpperCase()));
          if(blk) b.style.left = "calc(" + whites + " * var(--kw) - var(--kw) * 0.3)"; else { b.style.left = "calc(" + whites + " * var(--kw))"; whites++; }
          var down = function(e){ e.preventDefault(); kbNote(true, p, 96); try { b.setPointerCapture(e.pointerId); } catch(err){} };
          var up = function(){ kbNote(false, p); };
          b.addEventListener("pointerdown", down); b.addEventListener("pointerup", up); b.addEventListener("pointercancel", up); b.addEventListener("lostpointercapture", up);
          keysEl.appendChild(b);
        })(i);
      }
      keysEl.style.setProperty("--n", whites);
      box.appendChild(keysEl); host.appendChild(box); KB.el = keysEl;
    }
    function kbNote(on, p, vel){
      var t = selTrack(); if(!t || t.kind === "audio") return;
      var key = "kb" + p, rel = p - 12 * (t.kind === "inst" ? (t.oct || 0) : 0);
      if(on){ if(KB.held[p]) return; KB.held[p] = 1; liveOn(t, t.kind === "drums" ? p : rel, vel || 96, key); noteRecEvent(true, t.kind === "drums" ? p : rel, vel || 96); }
      else { if(!KB.held[p]) return; delete KB.held[p]; liveOff(key); noteRecEvent(false, t.kind === "drums" ? p : rel); }
      if(KB.el){ var b = KB.el.querySelector('[data-p="' + p + '"]'); if(b) b.dataset.on = on ? "true" : "false"; }
      if(ROLL.view && UI.tab === "notes") ROLL.view.ask();
    }
    function kbAllOff(){ Object.keys(KB.held).forEach(function(p){ kbNote(false, +p); }); }
    function rollPlayhead(tick){
      if(UI.tab === "notes" && ROLL.view){
        ROLL.phTick = tick;
        var f = rollRegion();
        if(f && UI.follow && TR.playing && !ROLL.view.busy()){
          var host = ROLL.host, x = rollX(tick - f.r.s, host.scrollLeft);
          if(tick >= f.r.s && tick < f.r.s + rollLen(f) && (x > host.clientWidth - 30 || x < ROLL.keysW)) host.scrollLeft = Math.max(0, (tick - f.r.s) * ROLL.ppt - 40);
        }
        ROLL.view.ask();
      }
      if(typeof drumPlayhead === "function") drumPlayhead(tick);
      if(typeof takePlayhead === "function") takePlayhead(tick);
    }
