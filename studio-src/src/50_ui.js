    // ---------- Studio: the screen (shell, transport, arrangement) ----------
    var UI = { built:false, root:null, e:{}, sel:{ track:null, region:null, section:null }, tab:"notes", edH:0, edOpen:true, col:null, headSig:"", follow:true, kbd:false, midiSeen:false, pops:[] };
    var ARR = { ppt:0.045, rowH:48, rulerH:22, secH:20, chordH:20, view:null, drag:null };
    var ICON = {
      play:"M7 4.5v15l13-7.5z", stop:"M6 6h12v12H6z", rec:"M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z", start:"M6 5h2v14H6zM20 5v14L9 12z",
      loop:"M17 2l4 4-4 4V7H7a3 3 0 0 0-3 3v2H2v-2a5 5 0 0 1 5-5h10zM7 22l-4-4 4-4v3h10a3 3 0 0 0 3-3v-2h2v2a5 5 0 0 1-5 5H7z",
      click:"M12 2l5 20H7zM11 8h2v8h-2z", undo:"M9 5L3 11l6 6v-4h5a4 4 0 0 1 0 8h-3v2h3a6 6 0 0 0 0-12H9z", redo:"M15 5l6 6-6 6v-4h-5a4 4 0 0 0 0 8h3v2h-3a6 6 0 0 1 0-12h5z",
      mic:"M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM6 11v1a6 6 0 0 0 5 5.9V21h2v-3.1A6 6 0 0 0 18 12v-1h-2v1a4 4 0 0 1-8 0v-1z",
      plus:"M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z", pointer:"M5 3l14 8-6 2-2 6z", pencil:"M4 20l1-5L16 4l4 4L9 19zM14 6l4 4", keys:"M3 6h18v12H3zM8 6v7M12 6v7M16 6v7",
      more:"M5 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z", down:"M6 9l6 6 6-6z", x:"M6 6l12 12M18 6L6 18",
      // the phone layout's own (drawn as lines)
      back:"M15 5l-7 7 7 7", fwd:"M9 5l7 7-7 7", up:"M12 19V5M6 11l6-6 6 6", dn:"M12 5v14M6 13l6 6 6-6", left:"M19 12H5M11 6l-6 6 6 6", right:"M5 12h14M13 6l6 6-6 6",
      share:"M12 15V3M8 7l4-4 4 4M5 12v8h14v-8", chat:"M4 5h16v11H9l-5 4z", split:"M12 3v18M4 8h5v8H4zM15 8h5v8h-5z", lasso:"M4 6h3M10 6h4M17 6h3M4 18h3M10 18h4M17 18h3M4 6v3M4 13v5M20 6v3M20 13v5",
      fit:"M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5", shorter:"M4 8h9v8H4zM21 12h-5M18 10l-2 2 2 2", longer:"M4 8h9v8H4zM15 12h6M19 10l2 2-2 2",
      ear:"M4 10v4h4l5 4V6L8 10zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11", trash:"M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13", check:"M5 12l5 5 9-10", list:"M4 6h16M4 12h16M4 18h16",
      head:"M5 14v-2a7 7 0 0 1 14 0v2M5 14h3v6H5zM16 14h3v6h-3z", sliders:"M6 4v16M12 4v16M18 4v16M4 9h4M10 14h4M16 8h4", text:"M5 6h14M5 10h14M5 14h9M5 18h11",
      grid:"M4 5h16v14H4zM4 12h16M9.3 5v14M14.6 5v14", tracks:"M4 6h10M4 12h16M4 18h7"
    };
    var ICON_LINE = { pencil:1, keys:1, x:1, back:1, fwd:1, up:1, dn:1, left:1, right:1, share:1, chat:1, split:1, lasso:1, fit:1, shorter:1, longer:1, ear:1, trash:1, check:1, list:1, head:1, sliders:1, text:1, grid:1, tracks:1 };
    function ico(name, stroke){
      var s = document.createElementNS("http://www.w3.org/2000/svg", "svg"), p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("aria-hidden", "true"); s.setAttribute("class", "st-ico" + (stroke ? " line" : "")); p.setAttribute("d", ICON[name]); s.appendChild(p); return s;
    }
    function ibtn(cls, icon, label, title, fn){ var b = btn("st-b " + (cls || ""), null, title || label, fn); b.setAttribute("aria-label", label); b.appendChild(ico(icon, !!ICON_LINE[icon])); return b; }
    function tbtn(cls, text, title, fn){ return btn("st-b " + (cls || ""), text, title, fn); }
    function colors(){
      if(UI.col) return UI.col;
      var cs = window.getComputedStyle(UI.root || document.body), g = function(n){ return cs.getPropertyValue(n).trim(); };
      UI.col = { bg:g("--bg"), surface:g("--surface"), surface2:g("--surface-2"), raised:g("--raised"), sel:g("--sel"), line:g("--line"), line2:g("--line-2"), ink:g("--ink"), ink2:g("--ink-2"), ink3:g("--ink-3"),
                 accent:g("--accent"), onAccent:g("--on-accent"), danger:g("--danger"), good:g("--good"), cell:g("--cell"), cell4:g("--cell-4"), tracks:TRACK_COLORS.map(g),
                 light:document.documentElement.getAttribute("data-theme") === "light" };
      return UI.col;
    }
    function alpha(hex, a){
      var m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
      if(!m){ m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex || ""); if(m) m = [0, m[1] + m[1], m[2] + m[2], m[3] + m[3]]; }
      return m ? "rgba(" + parseInt(m[1], 16) + "," + parseInt(m[2], 16) + "," + parseInt(m[3], 16) + "," + a + ")" : hex;
    }
    function trackColor(t){ return colors().tracks[t.color % TRACK_COLORS.length]; }
    function rr(c, x, y, w, h, r){
      r = Math.min(r, w / 2, h / 2); if(r < 0.5){ c.rect(x, y, w, h); return; }
      c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r); c.arcTo(x + w, y + h, x + w - r, y + h, r);
      c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r);
    }

    // ---- small floating things: a menu, a panel, a sheet ----
    function closePops(){ UI.pops.slice().forEach(function(c){ c(); }); }
    function place(pop, anchor, o){
      o = o || {};
      var r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : anchor, vw = window.innerWidth, vh = window.innerHeight;
      pop.style.visibility = "hidden"; pop.style.left = "0px"; pop.style.top = "0px";
      var w = pop.offsetWidth, h = pop.offsetHeight, x = o.right ? r.right - w : r.left, y = r.bottom + 4;
      if(y + h > vh - 8) y = Math.max(8, r.top - h - 4);
      x = clamp(x, 8, Math.max(8, vw - w - 8));
      pop.style.left = Math.round(x) + "px"; pop.style.top = Math.round(y) + "px"; pop.style.visibility = "";
    }
    function popOver(anchor, build, o){
      o = o || {};
      // on a phone there is no room beside a button: what would float there comes up from the bottom instead
      if(phoneOn()) return sheet(o.title || (o.label ? String(o.label).charAt(0).toUpperCase() + String(o.label).slice(1) : ""), function(body, close){
        body.className += " st-popbody " + (o.cls || ""); build(body, close);
        if(o.select){ var fi = body.querySelector("input"); if(fi) fi.setAttribute("autofocus", ""); }
      }, { cls:"st-popsheet", onClose:o.onClose });
      closePops();
      var pop = el("div", "st-pop " + (o.cls || "")), back = anchor && anchor.focus ? anchor : null;
      pop.setAttribute("role", o.role || "dialog"); if(o.label) pop.setAttribute("aria-label", o.label);
      function close(){
        var i = UI.pops.indexOf(close); if(i < 0) return; UI.pops.splice(i, 1);
        document.removeEventListener("pointerdown", out, true); window.removeEventListener("resize", close);
        if(pop.parentNode) pop.parentNode.removeChild(pop);
        if(back && back.setAttribute) back.setAttribute("aria-expanded", "false");
        if(o.onClose) o.onClose();
      }
      function out(e){ if(!pop.contains(e.target) && !(anchor && anchor.contains && anchor.contains(e.target))) close(); }
      pop.addEventListener("keydown", function(e){ e.stopPropagation(); if(e.key === "Escape"){ e.preventDefault(); close(); try { if(back) back.focus({ preventScroll:true }); } catch(err){} } });
      pop.addEventListener("keyup", function(e){ e.stopPropagation(); });
      build(pop, close);
      document.body.appendChild(pop); place(pop, anchor, o);
      setTimeout(function(){ document.addEventListener("pointerdown", out, true); }, 0); window.addEventListener("resize", close);
      UI.pops.push(close);
      if(back && back.setAttribute) back.setAttribute("aria-expanded", "true");
      var f = pop.querySelector("[autofocus], input, select, button"); if(f && !o.noFocus){ try { f.focus({ preventScroll:true }); if(f.select && o.select) f.select(); } catch(e2){} }
      return close;
    }
    // items: { t, k (shortcut shown), run, danger, off, on (ticked) } or "-" or { h:"heading" }
    function popMenu(anchor, items, o){
      return popOver(anchor, function(pop, close){
        items.forEach(function(it){
          if(it === "-"){ pop.appendChild(el("div", "st-sep")); return; }
          if(it.h){ pop.appendChild(el("div", "st-mh", it.h)); return; }
          var b = btn("st-mi" + (it.danger ? " danger" : ""), null, it.title || "", function(){ close(); it.run(); });
          b.setAttribute("role", "menuitem"); b.appendChild(el("span", "", it.t)); if(it.k) b.appendChild(el("kbd", "", it.k));
          if(it.on !== undefined) b.setAttribute("aria-checked", it.on ? "true" : "false");
          b.disabled = !!it.off; pop.appendChild(b);
        });
        pop.addEventListener("keydown", function(e){
          var bs = Array.prototype.slice.call(pop.querySelectorAll("button:not(:disabled)")), i = bs.indexOf(document.activeElement);
          if(e.key === "ArrowDown" || e.key === "ArrowUp"){ e.preventDefault(); var n = bs[(i + (e.key === "ArrowDown" ? 1 : bs.length - 1)) % bs.length]; if(n) n.focus(); }
        });
      }, { cls:"st-menu", role:"menu", right:o && o.right, label:o && o.label });
    }
    function sheet(title, build, o){
      o = o || {};
      closePops();
      var back = el("div", "st-sheet-back"), sh = el("div", "st-sheet " + (o.cls || "")), head = el("header"), x = ibtn("quiet", "x", "Close", "Close", function(){ close(); }), was = document.activeElement;
      sh.setAttribute("role", "dialog"); sh.setAttribute("aria-modal", "true"); sh.setAttribute("aria-label", title); if(o.id) sh.id = o.id;
      head.appendChild(el("h2", "", title)); head.appendChild(x); sh.appendChild(head);
      var body = el("div", "st-sheet-body"); sh.appendChild(body); back.appendChild(sh);
      function close(){
        var i = UI.pops.indexOf(close); if(i < 0) return; UI.pops.splice(i, 1);
        if(back.parentNode) back.parentNode.removeChild(back);
        if(o.onClose) o.onClose();
        try { if(was && was.focus) was.focus({ preventScroll:true }); } catch(e){}
      }
      back.addEventListener("pointerdown", function(e){ if(e.target === back && !o.sticky) close(); });
      ["keydown", "keyup", "keypress"].forEach(function(tp){ back.addEventListener(tp, function(e){ e.stopPropagation(); if(tp === "keydown" && e.key === "Escape" && !o.sticky){ e.preventDefault(); close(); } }); });
      build(body, close, sh);
      (o.inside ? UI.root : document.body).appendChild(back);
      UI.pops.push(close);
      if(phoneOn()) phArm();
      var f = sh.querySelector("[autofocus]") || x; try { f.focus({ preventScroll:true }); if(f !== x && f.select) f.select(); } catch(e2){}
      return close;
    }
    function askText(anchor, label, value, done){
      popOver(anchor, function(pop, close){
        var f = el("form", "st-ask"), inp = el("input", "st-i"), ok = tbtn("primary", "OK");
        inp.type = "text"; inp.value = value || ""; inp.maxLength = 60; inp.setAttribute("aria-label", label); ok.type = "submit";
        f.appendChild(el("label", "st-l", label)); f.appendChild(inp); f.appendChild(ok);
        f.addEventListener("submit", function(e){ e.preventDefault(); var v = inp.value.trim(); close(); if(v) done(v); });
        pop.appendChild(f);
      }, { select:true, label:label });
    }
    // a small "?" beside a word: says what the word means, once, in a few words
    var TERMS = {
      bar:"A bar is one count of the beat, usually 1-2-3-4. Songs are built in bars: a verse is often 8 or 16 of them.",
      key:"The key is the family of notes a song is built from, named after its home note. With a key chosen, the notes that belong are marked on the grid.",
      quantise:"Quantise moves notes onto the grid, so that they fall exactly on the beat or on its halves and quarters.",
      velocity:"Velocity is how hard a note is played: higher is louder and brighter, lower is softer.",
      region:"A region is one block on the timeline: a stretch of notes or a recording. It can be moved, copied and cut.",
      tempo:"Tempo is the speed of the song in beats per minute (BPM). 60 is one beat a second; most pop sits between 80 and 130.",
      snap:"Snap makes what you move or draw land on the nearest grid line. Hold Shift while dragging to place something freely.",
      swing:"Swing plays every second short note a little late, for a lilting, shuffled feel. It changes how the notes are played, not where they are written.",
      latency:"A computer takes a moment to play a sound and to hear one. The timing check measures that moment so your recordings land where you sang them.",
      linked:"Linked regions share their notes: change one and the others change with it. “Make independent” gives a region its own copy.",
      send:"Reverb adds the sound of a room. This sets how much of the track is sent into it."
    };
    function helpDot(term){
      var b = btn("st-q", "?", "What is " + (term === "bar" ? "a bar" : term === "key" ? "a key" : term) + "?", function(e){
        e.stopPropagation();
        popOver(b, function(pop){ pop.appendChild(el("p", "st-term", TERMS[term])); }, { cls:"st-termpop", label:term });
      });
      b.setAttribute("aria-label", b.title);
      return b;
    }

    // ---- a canvas that scrolls like a page: the canvas stays put, an empty block behind it gives the scroll bars ----
    function CanvasView(host, o){
      var V = { host:host, cv:el("canvas"), sp:el("div", "st-sp"), w:0, h:0, dpr:0, need:false, o:o };
      host.classList.add("st-cv"); host.appendChild(V.cv); host.appendChild(V.sp);
      V.ctx = V.cv.getContext("2d");
      V.paint = function(){
        V.need = false;
        if(!S || !UI.root || document.body.dataset.view !== "studio" || !host.clientWidth) return;
        var w = host.clientWidth, h = host.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, MOB.lean ? 2 : 8);
        if(w !== V.w || h !== V.h || dpr !== V.dpr){ V.w = w; V.h = h; V.dpr = dpr; V.cv.width = Math.max(1, Math.round(w * dpr)); V.cv.height = Math.max(1, Math.round(h * dpr)); V.cv.style.width = w + "px"; V.cv.style.height = h + "px"; }
        var c = o.content(); V.sp.style.width = Math.round(c.w) + "px"; V.sp.style.height = Math.round(c.h) + "px";
        V.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        var t0 = testMode ? performance.now() : 0;
        o.paint(V.ctx, w, h, host.scrollLeft, host.scrollTop);
        if(testMode){ V.lastMs = performance.now() - t0; V.paints = (V.paints || 0) + 1; }
      };
      V.ask = function(){ if(V.need) return; V.need = true; window.requestAnimationFrame(V.paint); };
      host.addEventListener("scroll", function(){ if(o.onScroll) o.onScroll(host.scrollLeft, host.scrollTop); V.ask(); }, { passive:true });
      try { new ResizeObserver(V.ask).observe(host); } catch(e){ window.addEventListener("resize", V.ask); }
      function pt(e){ var r = V.cv.getBoundingClientRect(); return { x:e.clientX - r.left, y:e.clientY - r.top }; }
      var touches = {}, pinch = null, drag = null, pan = null, tapAt = null;
      V.cv.addEventListener("pointerdown", function(e){
        if(e.button > 0) return;
        var p = pt(e);
        if(e.pointerType === "touch"){
          touches[e.pointerId] = p;
          var ids = Object.keys(touches);
          if(ids.length === 2){
            if(drag && drag.cancel) drag.cancel(); drag = null; pan = null; tapAt = null;
            var a = touches[ids[0]], b = touches[ids[1]];
            pinch = { d:Math.hypot(a.x - b.x, a.y - b.y) || 1, cx:(a.x + b.x) / 2, cy:(a.y + b.y) / 2, sl:host.scrollLeft, st:host.scrollTop };
            return;
          }
        }
        try { V.cv.setPointerCapture(e.pointerId); } catch(err){}
        drag = o.down ? o.down(p, e) : null;
        if(!drag && e.pointerType === "touch") pan = { x:p.x, y:p.y, sl:host.scrollLeft, st:host.scrollTop };
        // a press that does not move and is let go soon is a tap (the phone layout works by taps)
        tapAt = !drag && o.tap ? { x:p.x, y:p.y, t:performance.now(), id:e.pointerId } : null;
        if(drag || pan) e.preventDefault();
      });
      V.cv.addEventListener("pointermove", function(e){
        var p = pt(e);
        if(e.pointerType === "touch" && touches[e.pointerId]){
          touches[e.pointerId] = p;
          if(pinch){
            var ids = Object.keys(touches); if(ids.length < 2) return;
            var a = touches[ids[0]], b = touches[ids[1]], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
            if(o.zoom && Math.abs(d / pinch.d - 1) > 0.02){ o.zoom(d / pinch.d, { x:cx, y:cy }, "x"); pinch.d = d; }
            host.scrollLeft += pinch.cx - cx; host.scrollTop += pinch.cy - cy; pinch.cx = cx; pinch.cy = cy;
            return;
          }
        }
        if(tapAt && Math.hypot(p.x - tapAt.x, p.y - tapAt.y) > 9) tapAt = null;
        if(drag){ if(drag.move) drag.move(p, e); }
        else if(pan){ host.scrollLeft = pan.sl + pan.x - p.x; host.scrollTop = pan.st + pan.y - p.y; }
        else if(o.hover){ var cur = o.hover(p, e); V.cv.style.cursor = cur || ""; }
      });
      function end(e){
        var p = pt(e);
        if(e.pointerType === "touch"){ delete touches[e.pointerId]; if(pinch){ if(Object.keys(touches).length < 2) pinch = null; return; } }
        var d = drag, tp = tapAt; drag = null; pan = null; tapAt = null;
        if(d && d.up) d.up(p, e);
        if(tp && tp.id === e.pointerId && performance.now() - tp.t < 700) o.tap(p, e);
      }
      V.cv.addEventListener("pointerup", end);
      V.cv.addEventListener("pointercancel", function(e){ delete touches[e.pointerId]; pinch = null; pan = null; tapAt = null; var d = drag; drag = null; if(d && d.cancel) d.cancel(); });
      V.cv.addEventListener("dblclick", function(e){ if(o.dbl) o.dbl(pt(e), e); });
      V.cv.addEventListener("contextmenu", function(e){ if(o.menu){ e.preventDefault(); o.menu(pt(e), e); } });
      V.cv.addEventListener("pointerleave", function(){ if(o.leave) o.leave(); });
      host.addEventListener("wheel", function(e){
        if((e.ctrlKey || e.metaKey || e.altKey) && o.zoom){
          e.preventDefault();
          var r = V.cv.getBoundingClientRect();
          o.zoom(Math.exp(-e.deltaY * (e.ctrlKey && Math.abs(e.deltaY) < 20 ? 0.012 : 0.0022)), { x:e.clientX - r.left, y:e.clientY - r.top }, e.altKey ? "y" : "x");
        }
      }, { passive:false });
      V.busy = function(){ return !!drag; };
      return V;
    }

    // ---- building the area ----
    function build(){
      if(UI.built) return;
      UI.built = true;
      var root = UI.root = el("div", "st"); root.id = "studio"; root.setAttribute("role", "region"); root.setAttribute("aria-label", "Studio");
      var wrap = document.querySelector(".wrap");
      wrap.parentNode.insertBefore(root, wrap.nextSibling);
      var E = UI.e;
      // -- transport --
      var bar = E.bar = el("div", "st-bar"); bar.setAttribute("role", "toolbar"); bar.setAttribute("aria-label", "Song and transport");
      E.song = btn("st-b st-songbtn", null, "This song, your other songs, and versions", function(){ songMenu(E.song); });
      E.song.id = "stsong"; E.songName = el("span", "st-songname", ""); E.song.appendChild(E.songName); E.song.appendChild(ico("down")); E.song.setAttribute("aria-haspopup", "menu");
      bar.appendChild(E.song);
      var g1 = el("div", "st-grp");
      E.toStart = ibtn("", "start", "Go to the start", "Go to the start (Home)", function(){ setPos(0); scrollToTick(0); }); E.toStart.id = "ststart";
      E.play = ibtn("st-play", "play", "Play", "Play or stop (Space)", function(){ transportToggle(); }); E.play.id = "stplay";
      E.rec = ibtn("st-rec", "rec", "Record", "Record on the selected track (R)", function(){ recordPressed(); }); E.rec.id = "strec";
      g1.appendChild(E.toStart); g1.appendChild(E.play); g1.appendChild(E.rec); bar.appendChild(g1);
      E.pos = el("div", "st-pos"); E.pos.id = "stpos"; E.pos.title = "Position: bar . beat . sixteenth, and time"; E.posBar = el("b", "", "1.1.1"); E.posTime = el("span", "", "0:00.0"); E.pos.appendChild(E.posBar); E.pos.appendChild(E.posTime);
      bar.appendChild(E.pos);
      var g2 = el("div", "st-grp");
      E.loop = ibtn("", "loop", "Loop", "Repeat the stretch marked on the ruler (L). Drag along the ruler to mark one.", function(){ S.loop.on = !S.loop.on; if(S.loop.on && S.loop.b <= S.loop.a){ S.loop.a = 0; S.loop.b = barTicks() * 4; } touch(); paintBar(); ARR.view.ask(); if(typeof rollAsk === "function") rollAsk(); });
      E.loop.id = "stloop";
      E.click = ibtn("", "click", "Click", "A click on every beat while the song plays (K)", function(){ S.metro = !S.metro; touch(); paintBar(); }); E.click.id = "stclick";
      E.count = tbtn("st-count", "", "How many bars of click before a recording starts", function(){
        popMenu(E.count, [{ h:"Count-in before recording" }, { t:"None", on:S.countIn === 0, run:function(){ S.countIn = 0; touch(); paintBar(); } }, { t:"1 bar", on:S.countIn === 1, run:function(){ S.countIn = 1; touch(); paintBar(); } }, { t:"2 bars", on:S.countIn === 2, run:function(){ S.countIn = 2; touch(); paintBar(); } }]);
      }); E.count.id = "stcount";
      g2.appendChild(E.loop); g2.appendChild(E.click); g2.appendChild(E.count); bar.appendChild(g2);
      var g3 = el("div", "st-grp st-tempo");
      E.tempo = el("input", "st-i st-num"); E.tempo.type = "number"; E.tempo.min = 40; E.tempo.max = 220; E.tempo.step = 1; E.tempo.id = "sttempo"; E.tempo.setAttribute("aria-label", "Tempo in beats per minute");
      E.tempo.addEventListener("change", function(){ var had = hasAudio(); if(setTempo(+E.tempo.value || S.tempo)){ commit("tempo " + S.tempo); if(had) tell("Tempo " + S.tempo + ". Recorded audio keeps its own speed, so it no longer lines up with the bars as before."); } paintBar(); });
      E.tempo.addEventListener("keydown", function(e){ e.stopPropagation(); if(e.key === "Enter") E.tempo.blur(); });
      var taps = [];
      E.tap = tbtn("", "Tap", "Tap the beat four times or more to set the tempo (T)", function(){
        var now = performance.now(); if(taps.length && now - taps[taps.length - 1] > 2500) taps = [];
        taps.push(now); if(taps.length > 8) taps.shift();
        if(taps.length >= 3){ var d = (taps[taps.length - 1] - taps[0]) / (taps.length - 1), bpm = clamp(Math.round(60000 / d), 40, 220); if(setTempo(bpm)){ commit("tempo " + S.tempo, true); refresh(); } }
      }); E.tap.id = "sttap";
      g3.appendChild(E.tempo); g3.appendChild(el("span", "st-l", "BPM")); g3.appendChild(helpDot("tempo")); g3.appendChild(E.tap); bar.appendChild(g3);
      var g4 = el("div", "st-grp");
      E.sig = el("select", "st-s"); E.sig.id = "stsig"; E.sig.setAttribute("aria-label", "Time signature: beats in a bar"); E.sig.title = "Time signature: how the beats are counted in a bar";
      ["4/4", "3/4", "6/8", "2/4", "5/4", "12/8"].forEach(function(v){ var o = el("option", "", v); o.value = v; E.sig.appendChild(o); });
      E.sig.addEventListener("change", function(){ setSig(E.sig.value); });
      E.key = tbtn("st-keybtn", "", "The key of the song", function(){ keyPop(E.key); }); E.key.id = "stkey"; E.key.setAttribute("aria-haspopup", "dialog");
      g4.appendChild(E.sig); g4.appendChild(E.key); g4.appendChild(helpDot("key")); bar.appendChild(g4);
      var g5 = el("div", "st-grp");
      E.undo = ibtn("", "undo", "Undo", "Undo (Ctrl+Z)", function(){ undo(); }); E.undo.id = "stundo";
      E.redo = ibtn("", "redo", "Redo", "Redo (Ctrl+Shift+Z)", function(){ redo(); }); E.redo.id = "stredo";
      g5.appendChild(E.undo); g5.appendChild(E.redo); bar.appendChild(g5);
      bar.appendChild(el("span", "st-flex"));
      E.save = el("span", "st-save"); E.save.id = "stsave"; E.save.setAttribute("role", "status"); bar.appendChild(E.save);
      E.mixB = tbtn("", "Mixer", "Levels, pan, reverb and tone for every track (M)", function(){ showTab(UI.tab === "mixer" && UI.edOpen ? lastTab() : "mixer"); }); E.mixB.id = "stmixer";
      E.exportB = tbtn("", "Export", "Save the song as a sound file, a MIDI file or a song file", function(){ exportSheet(); }); E.exportB.id = "stexport";
      E.helpB = tbtn("", "Help", "How the Studio works, and the keyboard shortcuts", function(){ helpSheet(); }); E.helpB.id = "sthelp";
      bar.appendChild(E.mixB); bar.appendChild(E.exportB); bar.appendChild(E.helpB);
      root.appendChild(bar);
      // -- arrangement --
      var main = E.main = el("div", "st-main"), arr = E.arr = el("div", "st-arr");
      var heads = E.heads = el("div", "st-heads");
      var ht = el("div", "st-headtop");
      var hr1 = el("div", "st-hrow st-hruler");
      E.zoomOut = tbtn("quiet", "−", "Show more bars", function(){ arrZoom(1 / 1.3); }); E.zoomIn = tbtn("quiet", "+", "Show fewer bars, larger", function(){ arrZoom(1.3); });
      E.zoomFit = tbtn("quiet", "Fit", "Show the whole song", function(){ arrFit(); });
      hr1.appendChild(el("span", "st-l", "Bars")); hr1.appendChild(helpDot("bar")); hr1.appendChild(el("span", "st-flex")); hr1.appendChild(E.zoomOut); hr1.appendChild(E.zoomIn); hr1.appendChild(E.zoomFit);
      var hr2 = el("div", "st-hrow");
      E.addSec = tbtn("quiet", "+ Section", "Mark a part of the song: Intro, Verse, Chorus…", function(){ var q = addSection(undefined, sectionBarAtPlayhead()); if(q){ commit("add section " + q.name); UI.sel.section = q.id; refresh(); } else tell("There is no room for a section there. Drag an existing one shorter first."); });
      E.addSec.id = "staddsec";
      hr2.appendChild(el("span", "st-l", "Sections")); hr2.appendChild(el("span", "st-flex")); hr2.appendChild(E.addSec);
      var hr3 = el("div", "st-hrow");
      E.chordsB = tbtn("quiet", "Edit", "Choose chords bar by bar", function(){ showTab("chords"); });
      hr3.appendChild(el("span", "st-l", "Chords")); hr3.appendChild(el("span", "st-flex")); hr3.appendChild(E.chordsB);
      ht.appendChild(hr1); ht.appendChild(hr2); ht.appendChild(hr3); heads.appendChild(ht);
      E.headScroll = el("div", "st-headscroll"); E.headList = el("div", "st-headlist"); E.headScroll.appendChild(E.headList); heads.appendChild(E.headScroll);
      E.addTrack = btn("st-addtrack", null, "Add a track: an instrument, drums, or your voice", function(){ if(phoneOn()) phAddTrack(); else instBrowser(E.addTrack, null); }); E.addTrack.id = "staddtrack";
      E.addTrack.appendChild(ico("plus")); E.addTrack.appendChild(el("span", "", "Add track"));
      arr.appendChild(heads);
      E.tl = el("div", "st-tl"); E.tl.id = "sttl"; E.tl.tabIndex = 0; E.tl.setAttribute("aria-label", "Timeline. Arrow keys move the selected region; Enter opens it.");
      arr.appendChild(E.tl);
      main.appendChild(arr);
      // -- editor --
      E.split = el("div", "st-split"); E.split.title = "Drag to give the editor more or less height"; E.split.setAttribute("role", "separator"); E.split.setAttribute("aria-orientation", "horizontal");
      main.appendChild(E.split);
      var ed = E.ed = el("div", "st-ed");
      var eb = E.edbar = el("div", "st-edbar");
      E.tabs = el("div", "st-tabs"); E.tabs.setAttribute("role", "tablist"); E.tabs.setAttribute("aria-label", "Editor");
      E.tabB = {};
      [["notes", "Notes"], ["drums", "Drums"], ["take", "Recording"], ["chords", "Chords"], ["lyrics", "Lyrics"], ["mixer", "Mixer"]].forEach(function(t){
        var b = btn("st-tab", t[1], "", function(){ showTab(t[0]); }); b.setAttribute("role", "tab"); b.dataset.tab = t[0]; b.id = "sttab-" + t[0]; E.tabB[t[0]] = b; E.tabs.appendChild(b);
      });
      eb.appendChild(E.tabs); eb.appendChild(el("span", "st-flex"));
      E.edWhat = el("span", "st-edwhat", ""); eb.appendChild(E.edWhat);
      E.edFold = tbtn("quiet", "Hide", "Hide or show the editor", function(){ UI.edOpen = !UI.edOpen; layout(); }); E.edFold.id = "stfold"; eb.appendChild(E.edFold);
      ed.appendChild(eb);
      E.edtools = el("div", "st-edtools"); E.edtools.setAttribute("role", "toolbar"); E.edtools.setAttribute("aria-label", "Editor tools"); ed.appendChild(E.edtools);
      E.humbar = el("div", "st-humbar"); E.humbar.hidden = true; ed.appendChild(E.humbar);
      E.edbody = el("div", "st-edbody"); ed.appendChild(E.edbody);
      main.appendChild(ed);
      root.appendChild(main);
      // -- empty state --
      E.empty = el("div", "st-empty"); E.empty.hidden = true; root.appendChild(E.empty);
      // -- recording strip (count-in, level) --
      E.recbar = el("div", "st-recbar"); E.recbar.hidden = true; E.recbar.setAttribute("role", "status"); root.appendChild(E.recbar);

      ARR.view = CanvasView(E.tl, { content:arrContent, paint:arrPaint, down:arrDown, hover:arrHover, dbl:arrDbl, zoom:function(f, p){ arrZoom(f, p.x); }, menu:arrMenu, tap:function(p, e){ if(phoneOn()) phArrTap(p, e); },
        onScroll:function(sl, st){ E.headList.style.transform = "translateY(" + (-st) + "px)"; } });
      E.tl.addEventListener("keydown", arrKeys);
      splitDrag();
      window.addEventListener("keydown", keys, true);
      window.addEventListener("keyup", keysUp, true);
      window.addEventListener("resize", function(){ layout(); });
      try { new MutationObserver(function(){ UI.col = null; refresh(); }).observe(document.documentElement, { attributes:true, attributeFilter:["data-theme"] }); } catch(e){}
      root.addEventListener("dragover", function(e){ if(e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") >= 0){ e.preventDefault(); } });
      root.addEventListener("drop", function(e){ var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if(f){ e.preventDefault(); fileDropped(f); } });
      // back on line: look for the recorded instruments again, and fetch what the song was waiting for
      window.addEventListener("online", function(){ if(ENG.manifestState === "failed"){ ENG.manifestP = null; ENG.manifestState = "none"; loadManifest().then(function(){ engSync(); paintHeads(true); }); } else { Object.keys(ENG.inst).forEach(function(k){ if(ENG.inst[k].state === "failed") ENG.inst[k].state = "none"; }); engSync(); } });
      on("save", paintSave); on("instload", function(){ paintHeadsSoon(); }); on("instruments", function(){ paintHeadsSoon(); });
      on("transport", function(){ paintBar(); });
      buildEditors();
      buildExtras();
      mobileInit();
    }
    function sectionBarAtPlayhead(){ var bar = Math.floor(TR.pos / barTicks()); return sectionAt(bar) ? undefined : bar; }
    function setSig(v){
      var m = /^(\d+)\/(\d+)$/.exec(v); if(!m) return;
      var old = barTicks(); S.sig = [+m[1], +m[2]];
      var bt = barTicks();
      // sections keep the music they were over
      S.sections.forEach(function(q){ var a = Math.round(q.bar * old / bt), b = Math.max(a + 1, Math.round((q.bar + q.len) * old / bt)); q.bar = a; q.len = b - a; });
      for(var i = 1; i < S.sections.length; i++){ var p = S.sections[i - 1]; if(S.sections[i].bar < p.bar + p.len) S.sections[i].bar = p.bar + p.len; }
      S.loop.a = Math.round(S.loop.a / old) * bt; S.loop.b = Math.max(S.loop.a + bt, Math.round(S.loop.b / old) * bt);
      growBars(); commit("time signature " + v);
    }
    function lastTab(){ var f = UI.sel.region && findRegion(UI.sel.region); return f ? (f.t.kind === "drums" ? "drums" : f.t.kind === "audio" ? "take" : "notes") : "notes"; }
    function layout(){
      if(!UI.built) return;
      phSync();
      var E = UI.e, total = E.main.clientHeight, minArr = 120, rw = UI.root.clientWidth;
      UI.root.dataset.w = rw >= 1180 ? "l" : rw >= 1000 ? "m" : "s";
      if(!UI.edH) UI.edH = Math.round(clamp(total * 0.52, 220, 460));
      var h = UI.edOpen ? clamp(UI.edH, 150, Math.max(150, total - minArr)) : 30;
      E.ed.style.height = h + "px"; E.ed.dataset.open = UI.edOpen ? "true" : "false";
      E.edFold.textContent = UI.edOpen ? "Hide" : "Show";
      refresh();
    }
    function splitDrag(){
      var E = UI.e, s = null;
      E.split.addEventListener("pointerdown", function(e){ s = { y:e.clientY, h:E.ed.offsetHeight }; try { E.split.setPointerCapture(e.pointerId); } catch(err){} e.preventDefault(); });
      E.split.addEventListener("pointermove", function(e){ if(!s) return; UI.edOpen = true; UI.edH = s.h + (s.y - e.clientY); layout(); });
      E.split.addEventListener("pointerup", function(){ s = null; });
      E.split.addEventListener("dblclick", function(){ UI.edOpen = !UI.edOpen; layout(); });
    }

    // ---- keeping the screen in step with the song ----
    var refreshRaf = 0, refreshFull = false;
    function refresh(full){
      if(!UI.built || !S) return;
      refreshFull = refreshFull || !!full;
      if(refreshRaf) return;
      refreshRaf = window.requestAnimationFrame(function(){
        refreshRaf = 0; var f = refreshFull; refreshFull = false;
        paintBar(); paintHeads(f); paintEmpty(); ARR.view.ask(); paintEditor(f); paintSave(); paintExtras(); if(phoneOn()) phPaint(f);
      });
    }
    function paintSave(){
      var E = UI.e; if(!E.save) return;
      E.save.textContent = saveState === "saving" ? "Saving" : saveState === "failed" ? "Not saved" : saveState === "memory" ? "Not kept" : "Saved";
      E.save.dataset.state = saveState;
      E.save.title = saveState === "memory" ? "This browser is not letting the page keep anything (a private window does that). The song is here until the page is closed: save it as a song file from Export."
        : saveState === "failed" ? "Saving did not work just now. It is tried again at the next change." : "The song saves by itself in this browser";
    }
    function paintBar(){
      var E = UI.e; if(!S) return;
      if(E.songName.textContent !== S.name) E.songName.textContent = S.name;
      if(document.activeElement !== E.tempo) E.tempo.value = S.tempo;
      E.sig.value = S.sig[0] + "/" + S.sig[1];
      E.key.textContent = keyName(S.key);
      E.loop.setAttribute("aria-pressed", S.loop.on ? "true" : "false"); E.click.setAttribute("aria-pressed", S.metro ? "true" : "false");
      E.count.textContent = S.countIn ? "Count-in " + S.countIn + (S.countIn > 1 ? " bars" : " bar") : "No count-in"; E.count.dataset.short = S.countIn ? "Count " + S.countIn : "No count";
      var h = hist(); E.undo.disabled = !h.u.length; E.redo.disabled = !h.r.length;
      E.undo.title = h.u.length ? "Undo: " + h.u[h.u.length - 1].l + " (Ctrl+Z)" : "Nothing to undo";
      E.redo.title = h.r.length ? "Redo: " + h.r[h.r.length - 1].l + " (Ctrl+Shift+Z)" : "Nothing to redo";
      var pl = TR.playing || !!audition; E.play.dataset.on = pl ? "true" : "false"; E.play.setAttribute("aria-label", pl ? "Stop" : "Play");
      E.play.firstChild.firstChild.setAttribute("d", pl ? ICON.stop : ICON.play);
      var rn = recordingNow(); E.rec.dataset.on = rn ? "true" : "false";
      E.mixB.setAttribute("aria-pressed", UI.tab === "mixer" && UI.edOpen ? "true" : "false");
      paintPos();
    }
    function paintPos(){
      var E = UI.e, tk = audition ? (auditionTick() || 0) : transportTick();
      var a = posText(Math.max(0, tk)), b = timeText(tickSec(Math.max(0, tk)));
      if(E.posBar.textContent !== a) E.posBar.textContent = a;
      if(E.posTime.textContent !== b) E.posTime.textContent = b;
      phPos(a, b);
    }
    var headTimer = 0;
    function paintHeadsSoon(){ clearTimeout(headTimer); headTimer = setTimeout(function(){ paintHeads(true); }, 60); }
    function selTrack(){ return UI.sel.track ? trackById(UI.sel.track) : null; }
    function selRegion(){ return UI.sel.region ? findRegion(UI.sel.region) : null; }
    function selClear(){ UI.sel = { track:null, region:null, section:null }; if(typeof rollSelClear === "function") rollSelClear(); }
    function selFix(){
      if(UI.sel.region && !findRegion(UI.sel.region)) UI.sel.region = null;
      if(UI.sel.track && !trackById(UI.sel.track)) UI.sel.track = S.tracks.length ? S.tracks[0].id : null;
      if(UI.sel.section && !S.sections.some(function(q){ return q.id === UI.sel.section; })) UI.sel.section = null;
      if(typeof rollSelClear === "function") rollSelClear();
    }
    function select(trackId, regionId, o){
      o = o || {};
      var ch = UI.sel.region !== (regionId || null) || UI.sel.track !== trackId;
      UI.sel.track = trackId; UI.sel.region = regionId || null; UI.sel.section = null;
      if(ch && typeof rollSelClear === "function") rollSelClear();
      var t = trackById(trackId);
      if(t && !o.keepTab && UI.tab !== "mixer" && UI.tab !== "chords" && UI.tab !== "lyrics") UI.tab = t.kind === "drums" ? "drums" : t.kind === "audio" ? "take" : "notes";
      if(t && regionId && (UI.tab === "mixer" || UI.tab === "chords" || UI.tab === "lyrics") && o.open) UI.tab = t.kind === "drums" ? "drums" : t.kind === "audio" ? "take" : "notes";
      if(t && t.kind !== "audio") ensureEngine().then(function(){ loadInst(t.inst); });
      emit("select", { track:trackId, region:regionId || null });
      refresh(ch);
    }
    function showTab(tab){ UI.tab = tab; UI.edOpen = true; if(phoneOn()){ phShowTab(tab); return; } layout(); refresh(true); }
    function paintHeads(full){
      if(!S || !UI.built) return;
      var E = UI.e, sig = (phoneOn() ? "P" : "D") + S.tracks.map(function(t){ return t.id + t.kind; }).join("|");
      if(sig !== UI.headSig || full){
        UI.headSig = sig; E.headList.textContent = "";
        E.th = {};
        S.tracks.forEach(function(t){ E.headList.appendChild(buildHead(t)); });
        E.headList.appendChild(E.addTrack);
      }
      S.tracks.forEach(function(t){
        var h = E.th[t.id]; if(!h) return;
        h.el.dataset.sel = UI.sel.track === t.id ? "true" : "false";
        h.el.style.setProperty("--tc", trackColor(t));
        if(h.name.textContent !== t.name) h.name.textContent = t.name;
        var d = ENG.inst[t.inst], nm = t.kind === "audio" ? "Recordings" : instName(t.inst), st = d ? d.state : (ENG.manifestState === "loading" ? "loading" : "missing");
        if(t.kind !== "audio"){
          if(st === "loading") nm += " · loading " + Math.round(100 * (d && d.def && d.def.samples ? d.got / Math.max(1, d.def.samples.length) : 0.5)) + "%";
          else if(st === "failed" || st === "missing") nm = instName(standIn(t)) + " (in place of " + (d ? d.name : "a sound that is not here") + ")";
        }
        if(h.inst.textContent !== nm) h.inst.textContent = nm;
        h.m.setAttribute("aria-pressed", t.mute ? "true" : "false"); h.s.setAttribute("aria-pressed", t.solo ? "true" : "false");
        if(document.activeElement !== h.vol) h.vol.value = Math.round(t.vol * 100);
        if(document.activeElement !== h.pan) h.pan.value = Math.round(t.pan * 50);
      });
      E.addTrack.hidden = S.tracks.length >= MAXTRACKS;
    }
    function buildHead(t){
      if(phoneOn()) return phHead(t);
      var E = UI.e, h = { el:el("div", "st-th") }, top = el("div", "st-th1"), bot = el("div", "st-th2");
      h.el.dataset.id = t.id; h.el.dataset.kind = t.kind; h.el.id = "stth-" + t.id;
      h.name = btn("st-thname", t.name, "Rename this track", function(){ select(t.id, UI.sel.track === t.id ? UI.sel.region : null); askText(h.name, "Track name", t.name, function(v){ t.name = v.slice(0, 32); commit("rename track"); }); });
      h.inst = btn("st-thinst", "", t.kind === "audio" ? "A track for your voice or any recorded sound" : "Choose the instrument", function(){ select(t.id, UI.sel.track === t.id ? UI.sel.region : null); if(t.kind !== "audio") instBrowser(h.inst, t.id); });
      if(t.kind === "audio") h.inst.disabled = true;
      h.more = ibtn("quiet st-thmore", "more", "Track menu", "More for this track", function(){ trackMenu(h.more, t.id); });
      top.appendChild(h.name); top.appendChild(h.inst); top.appendChild(h.more);
      h.m = tbtn("st-ms", "M", "Mute: silence this track", function(){ t.mute = !t.mute; commit(t.mute ? "mute " + t.name : "unmute " + t.name, true); engSync(); refresh(); });
      h.s = tbtn("st-ms solo", "S", "Solo: hear only this track", function(){ t.solo = !t.solo; commit(t.solo ? "solo " + t.name : "end solo of " + t.name, true); engSync(); refresh(); });
      h.m.setAttribute("aria-label", "Mute " + t.name); h.s.setAttribute("aria-label", "Solo " + t.name);
      var word = t.kind === "inst" ? "Hum" : t.kind === "audio" ? "Record" : "Tap";
      h.rec = btn("st-b st-threc", null, t.kind === "inst" ? "Hum or sing this part: it becomes notes for this instrument" : t.kind === "audio" ? "Record your voice on this track" : "Tap a rhythm on the keyboard or the screen", function(){
        select(t.id, UI.sel.track === t.id ? UI.sel.region : null);
        if(t.kind === "inst") humSheet(t.id); else if(t.kind === "audio") recordAudio(t.id); else { showTab("drums"); tapStart(t.id); }
      });
      h.rec.appendChild(ico("mic")); h.rec.appendChild(el("span", "", word)); h.rec.dataset.act = word.toLowerCase();
      h.vol = el("input", "st-vol"); h.vol.type = "range"; h.vol.min = 0; h.vol.max = 125; h.vol.step = 1; h.vol.title = "Volume"; h.vol.setAttribute("aria-label", "Volume of " + t.name);
      h.pan = el("input", "st-pan"); h.pan.type = "range"; h.pan.min = -50; h.pan.max = 50; h.pan.step = 1; h.pan.title = "Pan: left or right"; h.pan.setAttribute("aria-label", "Pan of " + t.name);
      h.vol.addEventListener("input", function(){ t.vol = +h.vol.value / 100; engSync(); if(typeof mixerPaint === "function") mixerPaint(); });
      h.vol.addEventListener("change", function(){ commit("volume of " + t.name, true); });
      h.pan.addEventListener("input", function(){ var v = +h.pan.value; if(Math.abs(v) < 4) v = 0; t.pan = v / 50; engSync(); if(typeof mixerPaint === "function") mixerPaint(); });
      h.pan.addEventListener("change", function(){ h.pan.value = Math.round(t.pan * 50); commit("pan of " + t.name, true); });
      h.pan.addEventListener("dblclick", function(){ t.pan = 0; h.pan.value = 0; engSync(); commit("pan of " + t.name, true); });
      h.meter = el("span", "st-thmeter"); h.meter.appendChild(el("i"));
      bot.appendChild(h.m); bot.appendChild(h.s); bot.appendChild(h.rec); bot.appendChild(h.vol); bot.appendChild(h.pan); bot.appendChild(h.meter);
      h.el.appendChild(top); h.el.appendChild(bot);
      h.el.addEventListener("pointerdown", function(e){ if(!e.target.closest("button, input")) select(t.id, null); });
      E.th[t.id] = h;
      return h.el;
    }
    function trackMenu(anchor, id){
      var t = trackById(id); if(!t) return;
      var i = S.tracks.indexOf(t);
      popMenu(anchor, [
        { t:"Rename", run:function(){ askText(UI.e.th[id].name, "Track name", t.name, function(v){ t.name = v.slice(0, 32); commit("rename track"); }); } },
        { t:"Change colour", run:function(){ t.color = (t.color + 1) % TRACK_COLORS.length; commit("track colour"); } },
        { t:"Play one octave higher", off:t.kind !== "inst" || t.oct >= 3, run:function(){ t.oct++; commit("octave of " + t.name); } },
        { t:"Play one octave lower", off:t.kind !== "inst" || t.oct <= -3, run:function(){ t.oct--; commit("octave of " + t.name); } },
        "-",
        { t:"Move up", off:i <= 0, run:function(){ S.tracks.splice(i, 1); S.tracks.splice(i - 1, 0, t); commit("move track"); refresh(true); } },
        { t:"Move down", off:i >= S.tracks.length - 1, run:function(){ S.tracks.splice(i, 1); S.tracks.splice(i + 1, 0, t); commit("move track"); refresh(true); } },
        { t:"Duplicate track", off:S.tracks.length >= MAXTRACKS, run:function(){
            var c = JSON.parse(JSON.stringify(t)); c.id = uid("t"); c.name = (t.name + " copy").slice(0, 32); c.regions = t.regions.map(function(r){ return cloneRegion(r, false); });
            S.tracks.splice(i + 1, 0, c); commit("duplicate track"); select(c.id, null); refresh(true); } },
        "-",
        { t:"Delete track", danger:true, run:function(){ S.tracks.splice(i, 1); gcPats(); selFix(); commit("delete track " + t.name); engSync(); refresh(true); tell("Track deleted. Undo brings it back."); } }
      ], { right:true, label:"Track" });
    }

    // ---- arrangement: geometry ----
    function arrTop(){ return ARR.rulerH + ARR.secH + ARR.chordH; }
    function arrContent(){ return { w:Math.ceil(S ? S.bars * barTicks() * ARR.ppt : 0) + 120, h:arrTop() + (S ? S.tracks.length : 0) * ARR.rowH + 48 }; }
    function arrX(tick, sl){ return tick * ARR.ppt - sl; }
    function arrTick(x, sl){ return (x + sl) / ARR.ppt; }
    function arrZoom(f, atX){
      var host = UI.e.tl, x = atX === undefined ? host.clientWidth / 2 : atX, tick = arrTick(x, host.scrollLeft);
      var minP = host.clientWidth / (Math.max(S.bars, 8) * barTicks() * 1.5), maxP = 0.6;
      ARR.ppt = clamp(ARR.ppt * f, Math.min(minP, 0.01), maxP);
      ARR.view.paint(); host.scrollLeft = Math.max(0, tick * ARR.ppt - x); ARR.view.ask();
    }
    function arrFit(){
      var host = UI.e.tl, end = Math.max(songTicks() + barTicks() * 2, barTicks() * 8);
      ARR.ppt = clamp((host.clientWidth - 24) / end, 0.008, 0.6); host.scrollLeft = 0; ARR.view.ask();
    }
    function scrollToTick(tick){
      var host = UI.e.tl, x = tick * ARR.ppt;
      if(x < host.scrollLeft || x > host.scrollLeft + host.clientWidth - 40) host.scrollLeft = Math.max(0, x - 60);
    }
    function arrSnap(tick, e){ if(e && e.shiftKey) return Math.round(tick / (PPQ / 4)) * (PPQ / 4); var g = ARR.ppt * barTicks() < 14 ? barTicks() : (ARR.ppt * beatTicks() >= 22 ? beatTicks() : barTicks()); return Math.round(tick / g) * g; }
    function trackAtY(y, st){ var i = Math.floor((y + st - arrTop()) / ARR.rowH); return i >= 0 && i < S.tracks.length ? S.tracks[i] : null; }
    function regionAt(p, sl, st){
      var t = trackAtY(p.y, st); if(!t || p.y < arrTop()) return null;
      var tick = arrTick(p.x, sl), i;
      for(i = t.regions.length - 1; i >= 0; i--){ var r = t.regions[i]; if(tick >= r.s && tick < r.s + r.l) return { t:t, r:r, edge:(r.s + r.l - tick) * ARR.ppt < 7 ? "r" : ((tick - r.s) * ARR.ppt < 5 && r.l * ARR.ppt > 24 ? "l" : "") }; }
      return { t:t, r:null };
    }

    // ---- arrangement: drawing ----
    function arrPaint(c, w, h, sl, st){
      var C = colors(), top = arrTop(), bt = barTicks(), ppt = ARR.ppt, i, x, bar;
      c.clearRect(0, 0, w, h); c.fillStyle = C.bg; c.fillRect(0, 0, w, h);
      if(!S) return;
      var bar0 = Math.max(0, Math.floor(arrTick(0, sl) / bt)), bar1 = Math.ceil(arrTick(w, sl) / bt), barPx = bt * ppt, every = barPx >= 46 ? 1 : barPx >= 24 ? 2 : barPx >= 12 ? 4 : barPx >= 6 ? 8 : 16;
      // lanes
      c.save(); c.beginPath(); c.rect(0, top, w, h - top); c.clip();
      S.tracks.forEach(function(t, ti){
        var y = top + ti * ARR.rowH - st; if(y > h || y + ARR.rowH < top) return;
        c.fillStyle = UI.sel.track === t.id ? C.surface2 : C.surface; c.fillRect(0, y, w, ARR.rowH - 1);
      });
      // bar and beat lines
      for(bar = bar0; bar <= bar1; bar++){
        x = Math.round(arrX(bar * bt, sl)) + 0.5;
        c.strokeStyle = bar % every === 0 ? C.line2 : C.line; c.beginPath(); c.moveTo(x, top); c.lineTo(x, Math.min(h, top + S.tracks.length * ARR.rowH - st)); c.stroke();
        if(barPx >= 90){ var bq = beatTicks(), k; c.strokeStyle = C.line; for(k = 1; k < bt / bq; k++){ var xb = Math.round(arrX(bar * bt + k * bq, sl)) + 0.5; c.beginPath(); c.moveTo(xb, top); c.lineTo(xb, Math.min(h, top + S.tracks.length * ARR.rowH - st)); c.stroke(); } }
      }
      // beyond the song's last bar the lanes are shaded
      var endX = arrX(S.bars * bt, sl); if(endX < w){ c.fillStyle = alpha(C.light ? "#000000" : "#000000", C.light ? 0.06 : 0.22); c.fillRect(endX, top, w - endX, h - top); }
      // regions
      S.tracks.forEach(function(t, ti){
        var y = top + ti * ARR.rowH - st; if(y > h || y + ARR.rowH < top) return;
        t.regions.forEach(function(r){ drawRegion(c, t, r, arrX(r.s, sl), y + 3, r.l * ppt, ARR.rowH - 7, w, false); });
      });
      // a region being dragged is drawn where it would land
      if(ARR.drag && ARR.drag.ghosts) ARR.drag.ghosts.forEach(function(g){ var ti = S.tracks.indexOf(g.t); c.globalAlpha = 0.75; drawRegion(c, g.t, g.r, arrX(g.s, sl), top + ti * ARR.rowH - st + 3, g.l * ppt, ARR.rowH - 7, w, true); c.globalAlpha = 1; });
      // loop shading over the lanes
      if(S.loop.on){ c.fillStyle = alpha(C.accent, 0.06); c.fillRect(arrX(S.loop.a, sl), top, (S.loop.b - S.loop.a) * ppt, Math.max(0, Math.min(h - top, S.tracks.length * ARR.rowH - st))); }
      c.restore();
      // ruler
      c.fillStyle = C.surface; c.fillRect(0, 0, w, top);
      c.strokeStyle = C.line; c.beginPath(); c.moveTo(0, ARR.rulerH + 0.5); c.lineTo(w, ARR.rulerH + 0.5); c.moveTo(0, ARR.rulerH + ARR.secH + 0.5); c.lineTo(w, ARR.rulerH + ARR.secH + 0.5); c.stroke();
      c.strokeStyle = C.line2; c.beginPath(); c.moveTo(0, top + 0.5); c.lineTo(w, top + 0.5); c.stroke();
      c.font = "500 10.5px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
      for(bar = bar0; bar <= bar1; bar++){
        x = Math.round(arrX(bar * bt, sl)) + 0.5; var major = bar % every === 0;
        c.strokeStyle = major ? C.ink3 : C.line2; c.beginPath(); c.moveTo(x, major ? 11 : 16); c.lineTo(x, ARR.rulerH); c.stroke();
        if(major){ c.fillStyle = C.ink2; c.fillText(String(bar + 1), x + 4, 7); }
      }
      // loop brace
      var la = arrX(S.loop.a, sl), lb = arrX(S.loop.b, sl);
      c.fillStyle = S.loop.on ? C.accent : alpha(C.ink3, 0.45); c.fillRect(la, ARR.rulerH - 5, lb - la, 4);
      c.fillRect(la, ARR.rulerH - 9, 2, 8); c.fillRect(lb - 2, ARR.rulerH - 9, 2, 8);
      // sections
      S.sections.forEach(function(q){
        var x0 = arrX(q.bar * bt, sl), wd = q.len * bt * ppt; if(x0 > w || x0 + wd < 0) return;
        var on = UI.sel.section === q.id, col = sectionColor(q.name, C);
        c.fillStyle = alpha(col, on ? 0.5 : 0.24); c.beginPath(); rr(c, x0 + 1, ARR.rulerH + 2, wd - 2, ARR.secH - 4, 3); c.fill();
        if(on){ c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); rr(c, x0 + 1.5, ARR.rulerH + 2.5, wd - 3, ARR.secH - 5, 3); c.stroke(); }
        c.fillStyle = col; c.fillRect(x0 + 1, ARR.rulerH + 2, 3, ARR.secH - 4);
        c.save(); c.beginPath(); c.rect(x0, ARR.rulerH, wd - 4, ARR.secH); c.clip(); c.fillStyle = C.ink; c.font = "600 11px " + FONT; c.fillText(q.name, Math.max(x0, 0) + 9, ARR.rulerH + ARR.secH / 2 + 0.5); c.restore();
      });
      // chords
      c.font = "500 11px " + FONT;
      S.chords.forEach(function(ch, ci){
        var x0 = arrX(ch.t, sl); if(x0 > w) return;
        var nxt = S.chords[ci + 1], x1 = nxt ? arrX(nxt.t, sl) : x0 + bt * ppt; if(x1 < 0) return;
        c.fillStyle = C.ink2; c.save(); c.beginPath(); c.rect(x0, ARR.rulerH + ARR.secH, Math.max(8, x1 - x0 - 3), ARR.chordH); c.clip(); c.fillText(chordName(ch), x0 + 5, ARR.rulerH + ARR.secH + ARR.chordH / 2 + 0.5); c.restore();
        c.strokeStyle = C.line2; c.beginPath(); c.moveTo(Math.round(x0) + 0.5, ARR.rulerH + ARR.secH + 4); c.lineTo(Math.round(x0) + 0.5, top - 4); c.stroke();
      });
      // playhead
      var ph = Math.round(arrX(ARR.phTick === undefined ? TR.pos : ARR.phTick, sl)) + 0.5;
      if(ph >= 0 && ph <= w){
        c.strokeStyle = C.ink; c.lineWidth = 1; c.beginPath(); c.moveTo(ph, ARR.rulerH - 1); c.lineTo(ph, h); c.stroke();
        c.fillStyle = C.ink; c.beginPath(); c.moveTo(ph - 5, ARR.rulerH - 9); c.lineTo(ph + 5, ARR.rulerH - 9); c.lineTo(ph, ARR.rulerH - 1); c.closePath(); c.fill();
      }
      // what is being recorded, growing
      if(HUM || AREC){
        var R = HUM || AREC, tr = trackById(R.t), ti2 = tr ? S.tracks.indexOf(tr) : -1, now = transportTick();
        if(ti2 >= 0 && TR.playing && now > R.at){ c.fillStyle = alpha(C.danger, 0.3); c.fillRect(arrX(R.at, sl), top + ti2 * ARR.rowH - st + 3, (now - R.at) * ppt, ARR.rowH - 7); }
      }
    }
    var FONT = "Archivo, system-ui, -apple-system, 'Segoe UI', sans-serif";
    function sectionColor(name, C){
      var k = String(name).toLowerCase(), i = /intro|outro/.test(k) ? 5 : /chorus|hook|refrain/.test(k) ? 4 : /bridge|middle/.test(k) ? 6 : /verse/.test(k) ? 1 : /pre/.test(k) ? 2 : 0;
      return C.tracks[i];
    }
    function drawRegion(c, t, r, x, y, wd, hh, w, ghost){
      if(x > w || x + wd < 0) return;
      var C = colors(), col = trackColor(t), on = UI.sel.region === r.id && !ghost, x0 = Math.max(x, -4), x1 = Math.min(x + wd, w + 4);
      c.fillStyle = alpha(col, on ? (C.light ? 0.5 : 0.42) : (C.light ? 0.3 : 0.24));
      c.beginPath(); rr(c, x + 0.5, y, wd - 1, hh, 3); c.fill();
      c.fillStyle = col; c.beginPath(); rr(c, x + 0.5, y, wd - 1, 13, 3); c.fill(); c.fillRect(x + 0.5, y + 8, wd - 1, 5);
      // name strip
      c.save(); c.beginPath(); c.rect(x0, y, Math.max(0, x1 - x0 - 3), 13); c.clip();
      c.fillStyle = C.light ? "#ffffff" : "#101010"; c.font = "600 10px " + FONT; c.textBaseline = "middle"; c.textAlign = "left";
      var nm = r.name || (t.kind === "audio" ? "Take" + (r.takes.length > 1 ? " " + (r.act + 1) + " of " + r.takes.length : "") : t.kind === "drums" ? "Drums" : "Notes");
      if(r.pat && linkCount(r.pat) > 1) nm += "  ∞ linked";
      c.fillText(nm, Math.max(x, 0) + 5, y + 7);
      c.restore();
      // miniature
      c.save(); c.beginPath(); c.rect(x0, y + 14, Math.max(0, x1 - x0), hh - 15); c.clip();
      var iy = y + 15, ih = hh - 17;
      if(t.kind === "audio"){
        var ti = takeCache[r.takes[r.act]];
        if(ti && ti.peaks){
          var per = ti.sr / 200 / ti.sr, secPerPx = tickSec(1) / ARR.ppt, px, mid = iy + ih / 2, g = Math.pow(10, (r.gain || 0) / 20);
          c.fillStyle = alpha(col, 0.95);
          for(px = Math.max(0, Math.floor(x0 - x)); px < x1 - x; px++){
            var s0 = Math.floor(((r.off || 0) + px * secPerPx) * 200), s1 = Math.max(s0 + 1, Math.floor(((r.off || 0) + (px + 1) * secPerPx) * 200)), lo = 0, hi = 0, k;
            for(k = s0; k < s1 && k * 2 + 1 < ti.peaks.length; k++){ if(ti.peaks[k * 2] < lo) lo = ti.peaks[k * 2]; if(ti.peaks[k * 2 + 1] > hi) hi = ti.peaks[k * 2 + 1]; }
            var a = clamp(hi / 127 * g, 0, 1) * ih / 2, b = clamp(-lo / 127 * g, 0, 1) * ih / 2;
            c.fillRect(x + px, mid - a, 1, Math.max(1, a + b));
          }
          void per;
        } else { takeInfo(r.takes[r.act]).then(function(v){ if(v) ARR.view.ask(); }); }
      } else {
        var p = patOf(r);
        if(p && p.notes.length){
          var lo2 = 127, hi2 = 0, drums = t.kind === "drums";
          p.notes.forEach(function(n){ if(n.p < lo2) lo2 = n.p; if(n.p > hi2) hi2 = n.p; });
          if(drums){ lo2 = 0; hi2 = DRUM_ROWS.length - 1; }
          var span = Math.max(drums ? 12 : 7, hi2 - lo2 + 1), nh = Math.max(1.5, Math.min(4, ih / span));
          c.fillStyle = C.light ? alpha("#000000", 0.72) : alpha("#ffffff", 0.82);
          eachNote(r, Math.max(r.s, arrTick(x0, 0) + (r.s - x / ARR.ppt) - r.s + r.s), r.s + r.l, function(s, l, pp){
            var nx = x + (s - r.s) * ARR.ppt; if(nx > x1) return;
            var row = drums ? DRUM_ROWS.length - 1 - DRUM_ROWS.indexOf(DRUM_OF[pp]) : pp - lo2;
            var ny = iy + ih - nh - (row / Math.max(1, span - 1)) * (ih - nh);
            c.fillRect(nx, ny, Math.max(1.5, drums ? 2 : l * ARR.ppt - 0.5), nh);
          });
          // where the pattern starts again
          if(r.l > p.len){ c.fillStyle = alpha(C.light ? "#000000" : "#ffffff", 0.35); for(var q = p.len; q < r.l; q += p.len) c.fillRect(x + q * ARR.ppt, y + 13, 1, hh - 13); }
        }
        if(r.hum){ c.fillStyle = C.light ? "#ffffff" : "#101010"; }
      }
      c.restore();
      if(on){ c.strokeStyle = C.ink; c.lineWidth = 1.5; c.beginPath(); rr(c, x + 1, y + 0.5, wd - 2, hh - 1, 3); c.stroke(); c.lineWidth = 1; }
    }

    // ---- arrangement: the pointer ----
    function arrHover(p){
      var host = UI.e.tl, sl = host.scrollLeft, st = host.scrollTop;
      if(p.y < ARR.rulerH){ var la = arrX(S.loop.a, sl), lb = arrX(S.loop.b, sl); return (Math.abs(p.x - la) < 5 || Math.abs(p.x - lb) < 5) && p.y > ARR.rulerH - 11 ? "ew-resize" : "pointer"; }
      if(p.y < ARR.rulerH + ARR.secH){ var q = secAt(p, sl); return q && q.edge ? "ew-resize" : q ? "pointer" : ""; }
      if(p.y < arrTop()) return "pointer";
      var hit = regionAt(p, sl, st); return hit && hit.r ? (hit.edge ? "ew-resize" : "grab") : "";
    }
    function secAt(p, sl){
      var bt = barTicks(), tick = arrTick(p.x, sl), i;
      for(i = 0; i < S.sections.length; i++){ var q = S.sections[i], a = q.bar * bt, b = (q.bar + q.len) * bt; if(tick >= a && tick < b) return { q:q, edge:(b - tick) * ARR.ppt < 7 ? "r" : "" }; }
      return null;
    }
    function arrDown(p, e){
      var host = UI.e.tl, sl = host.scrollLeft, st = host.scrollTop, bt = barTicks(), tick = arrTick(p.x, sl);
      closePops();
      if(phoneOn()) return null;
      try { host.focus({ preventScroll:true }); } catch(err){}
      // ruler: click puts the playhead, a drag marks the loop
      if(p.y < ARR.rulerH){
        var la = arrX(S.loop.a, sl), lb = arrX(S.loop.b, sl), grab = p.y > ARR.rulerH - 11 ? (Math.abs(p.x - la) < 5 ? "a" : Math.abs(p.x - lb) < 5 ? "b" : "") : "", moved = false, t0 = Math.max(0, Math.round(tick / bt) * bt);
        return {
          move:function(q){
            var tk = Math.max(0, Math.round(arrTick(q.x, host.scrollLeft) / bt) * bt);
            if(!moved && Math.abs(q.x - p.x) < 5) return; moved = true;
            if(grab === "a") S.loop.a = Math.min(tk, S.loop.b - bt); else if(grab === "b") S.loop.b = Math.max(tk, S.loop.a + bt);
            else { S.loop.a = Math.min(t0, tk); S.loop.b = Math.max(Math.max(t0, tk), S.loop.a + bt); S.loop.on = true; }
            ARR.view.ask(); paintBar(); if(typeof rollAsk === "function") rollAsk();
          },
          up:function(){ if(moved) touch(); else setPos(arrSnap(tick, e)); }
        };
      }
      // sections
      if(p.y < ARR.rulerH + ARR.secH){
        var sq = secAt(p, sl);
        if(!sq){ UI.sel.section = null; refresh(); return null; }
        UI.sel.section = sq.q.id; refresh();
        if(sq.edge){
          var q0 = sq.q, len0 = q0.len, ch = false;
          return { move:function(q){ var nb = Math.round(arrTick(q.x, host.scrollLeft) / bt) - q0.bar, nxt = S.sections.filter(function(x){ return x.bar > q0.bar; })[0]; nb = clamp(nb, 1, nxt ? nxt.bar - q0.bar : 999); if(nb !== q0.len){ q0.len = nb; ch = true; growBars(); ARR.view.ask(); } },
                   up:function(){ if(ch && q0.len !== len0) commit("resize section " + q0.name); } };
        }
        var mv = false;
        return { move:function(q){ if(Math.abs(q.x - p.x) > 4) mv = true; }, up:function(q){ if(!mv) sectionMenu({ left:q.x + UI.e.tl.getBoundingClientRect().left, right:q.x + UI.e.tl.getBoundingClientRect().left, top:UI.e.tl.getBoundingClientRect().top + ARR.rulerH, bottom:UI.e.tl.getBoundingClientRect().top + ARR.rulerH + ARR.secH }, sq.q.id); } };
      }
      // chords lane: open the chord editor at that bar
      if(p.y < arrTop()){ CH.bar = Math.max(0, Math.floor(tick / bt)); CH.half = 0; showTab("chords"); return null; }
      var hit = regionAt(p, sl, st);
      if(!hit){ return null; }
      if(!hit.r){ select(hit.t.id, null); return e.pointerType === "touch" ? null : { up:function(){} }; }
      var r = hit.r, t = hit.t;
      select(t.id, r.id, { open:true });
      if(hit.edge === "r"){
        var l0 = r.l, changed = false;
        ARR.drag = { kind:"size" };
        return {
          move:function(q){
            var end = arrSnap(arrTick(q.x, host.scrollLeft), q.shiftKey ? { shiftKey:true } : e), nxt = t.regions.filter(function(x){ return x.s > r.s; })[0], mx = nxt ? nxt.s - r.s : 1e9;
            var nl = clamp(end - r.s, t.kind === "audio" ? PPQ / 2 : PPQ, mx);
            if(t.kind === "audio"){ var ti = takeCache[r.takes[r.act]]; if(ti) nl = Math.min(nl, Math.round(secTick(ti.len / ti.sr - (r.off || 0)))); }
            if(nl !== r.l){ r.l = nl; changed = true; growBars(); ARR.view.ask(); if(typeof rollAsk === "function") rollAsk(); }
          },
          up:function(){ ARR.drag = null; if(changed && r.l !== l0) commit(r.l > l0 ? "lengthen region" : "shorten region"); },
          cancel:function(){ r.l = l0; ARR.drag = null; ARR.view.ask(); }
        };
      }
      // move (Alt: copy). The region itself stays where it is until the pointer is let go.
      var grabOff = tick - r.s, d = ARR.drag = { kind:"move", ghosts:null, copy:e.altKey }, movedR = false;
      return {
        move:function(q, ev){
          if(!movedR && Math.hypot(q.x - p.x, q.y - p.y) < 5) return; movedR = true;
          var ns = Math.max(0, arrSnap(arrTick(q.x, host.scrollLeft) - grabOff, ev)), tt = trackAtY(q.y, host.scrollTop) || t;
          if(tt.kind !== t.kind) tt = t;
          d.copy = ev.altKey; d.ghosts = [{ t:tt, r:r, s:ns, l:r.l }]; ARR.view.ask();
          // near the edges the view follows
          if(q.x > host.clientWidth - 30) host.scrollLeft += 14; else if(q.x < 30) host.scrollLeft -= 14;
        },
        up:function(q, ev){
          ARR.drag = null;
          if(!movedR || !d.ghosts){ ARR.view.ask(); return; }
          var g = d.ghosts[0];
          if(d.copy){ var c2 = cloneRegion(r, false); c2.s = g.s; g.t.regions.push(c2); clearUnder(g.t, c2); sortRegions(g.t); growBars(); commit("copy region"); select(g.t.id, c2.id); }
          else if(g.s !== r.s || g.t !== t){
            removeRegion(t, r); r.s = g.s; g.t.regions.push(r); clearUnder(g.t, r); sortRegions(g.t); growBars(); commit("move region"); select(g.t.id, r.id);
          }
          ARR.view.ask();
        },
        cancel:function(){ ARR.drag = null; ARR.view.ask(); }
      };
    }
    function arrDbl(p){
      if(phoneOn()) return;
      var host = UI.e.tl, sl = host.scrollLeft, st = host.scrollTop, bt = barTicks(), tick = arrTick(p.x, sl);
      if(p.y < ARR.rulerH) return;
      if(p.y < ARR.rulerH + ARR.secH){
        var sq = secAt(p, sl);
        if(!sq){ var q = addSection(undefined, Math.floor(tick / bt)); if(q){ commit("add section " + q.name); UI.sel.section = q.id; refresh(); } }
        return;
      }
      var hit = regionAt(p, sl, st); if(!hit) return;
      if(hit.r){ UI.edOpen = true; UI.tab = lastTab(); layout(); return; }
      if(hit.t.kind === "audio"){ tell("An audio track holds recordings: press Record on the track, or drop a sound file here."); return; }
      newRegionAt(hit.t, Math.floor(tick / bt) * bt);
    }
    function newRegionAt(t, at){
      var bt = barTicks(), sec = sectionAt(Math.floor(at / bt)), len = t.kind === "drums" ? bt * 2 : bt * 4, nxt;
      if(sec) len = Math.min(len, (sec.bar + sec.len) * bt - at);
      nxt = t.regions.filter(function(x){ return x.s >= at; })[0];
      if(t.regions.some(function(x){ return x.s <= at && x.s + x.l > at; })) return null;
      if(nxt) len = Math.min(len, nxt.s - at);
      if(len < PPQ) return null;
      var r = addRegion(t, at, len, []); commit("new region"); select(t.id, r.id, { open:true }); UI.edOpen = true; layout();
      return r;
    }
    function arrMenu(p){
      if(phoneOn()) return;
      var host = UI.e.tl, r = host.getBoundingClientRect(), hit = regionAt(p, host.scrollLeft, host.scrollTop), anchor = { left:r.left + p.x, right:r.left + p.x, top:r.top + p.y, bottom:r.top + p.y };
      if(p.y < arrTop() && p.y >= ARR.rulerH && p.y < ARR.rulerH + ARR.secH){ var sq = secAt(p, host.scrollLeft); if(sq){ UI.sel.section = sq.q.id; refresh(); sectionMenu(anchor, sq.q.id); } return; }
      if(hit && hit.r){ select(hit.t.id, hit.r.id); regionMenu(anchor); }
    }
    function regionActions(){
      var f = selRegion(); if(!f) return [];
      var t = f.t, r = f.r, bt = barTicks(), linked = r.pat && linkCount(r.pat) > 1, items = [];
      items.push({ t:"Duplicate", k:"Ctrl+D", run:function(){ regionDuplicate(false); } });
      if(t.kind !== "audio") items.push({ t:"Duplicate as a linked copy", title:TERMS.linked, run:function(){ regionDuplicate(true); } });
      if(linked) items.push({ t:"Make independent", title:TERMS.linked, run:function(){ unlinkRegion(r); commit("make region independent"); } });
      items.push({ t:"Split at the playhead", k:"Ctrl+E", off:!(TR.pos > r.s && TR.pos < r.s + r.l), run:function(){ regionSplit(); } });
      if(t.kind !== "audio") items.push({ t:"Repeat to twice the length", run:function(){ var nxt = t.regions.filter(function(x){ return x.s > r.s; })[0], nl = r.l * 2; if(nxt) nl = Math.min(nl, nxt.s - r.s); if(nl > r.l){ r.l = nl; growBars(); commit("repeat region"); } else tell("The next region is in the way."); } });
      items.push({ t:"Loop the song over this region", run:function(){ S.loop = { on:true, a:Math.floor(r.s / bt) * bt, b:Math.ceil((r.s + r.l) / bt) * bt }; touch(); refresh(); } });
      items.push({ t:"Rename", run:function(){ var th = UI.e.th[t.id]; askText(th ? th.name : UI.e.song, "Region name", r.name || "", function(v){ r.name = v.slice(0, 32); commit("rename region"); }); } });
      items.push("-");
      items.push({ t:"Delete", k:"Del", danger:true, run:function(){ regionDelete(); } });
      return items;
    }
    function regionMenu(anchor){ var it = regionActions(); if(it.length) popMenu(anchor, it, { label:"Region" }); }
    function regionDuplicate(linked){
      var f = selRegion(); if(!f) return;
      var c = cloneRegion(f.r, linked); c.s = f.r.s + f.r.l;
      f.t.regions.push(c); clearUnder(f.t, c); sortRegions(f.t); growBars(); commit(linked ? "linked copy of region" : "duplicate region"); select(f.t.id, c.id); scrollToTick(c.s);
    }
    function regionSplit(){
      var f = selRegion(); if(!f) return;
      var at = TR.pos; if(!(at > f.r.s && at < f.r.s + f.r.l)){ tell("Put the playhead inside the region first: click the ruler where the cut should be."); return; }
      var b = splitRegion(f.t, f.r, at); if(b){ commit("split region"); select(f.t.id, b.id); }
    }
    function regionDelete(){
      var f = selRegion(); if(!f) return;
      removeRegion(f.t, f.r); gcPats(); UI.sel.region = null; commit("delete region"); refresh(true);
    }
    function sectionMenu(anchor, id){
      var q = S.sections.filter(function(x){ return x.id === id; })[0]; if(!q) return;
      var i = S.sections.indexOf(q), bt = barTicks();
      popMenu(anchor, [
        { h:q.name + " · " + q.len + (q.len === 1 ? " bar" : " bars") },
        { t:"Rename", run:function(){ askText(UI.e.addSec, "Section name", q.name, function(v){ q.name = v.slice(0, 24); commit("rename section"); }); } },
        { t:"Duplicate, with its music", run:function(){ var c = duplicateSection(id); if(c){ UI.sel.section = c.id; commit("duplicate section " + q.name); refresh(true); } } },
        { t:"Move earlier", off:i <= 0, run:function(){ if(moveSection(id, -1)){ commit("move section " + q.name); refresh(true); } } },
        { t:"Move later", off:i >= S.sections.length - 1, run:function(){ if(moveSection(id, 1)){ commit("move section " + q.name); refresh(true); } } },
        { t:"Loop this section", run:function(){ S.loop = { on:true, a:q.bar * bt, b:(q.bar + q.len) * bt }; touch(); setPos(q.bar * bt); refresh(); } },
        "-",
        { t:"Remove the marker only", run:function(){ deleteSection(id, false); UI.sel.section = null; commit("remove section marker"); } },
        { t:"Delete the section and its music", danger:true, run:function(){ deleteSection(id, true); UI.sel.section = null; selFix(); commit("delete section " + q.name); refresh(true); } }
      ], { label:"Section" });
    }
    function arrKeys(e){
      var f = selRegion(), bt = barTicks();
      if(e.key === "Enter" && f){ e.preventDefault(); UI.edOpen = true; layout(); if(typeof rollFocus === "function") rollFocus(); return; }
      if(!f) return;
      if(e.key === "ArrowLeft" || e.key === "ArrowRight"){
        e.preventDefault(); e.stopPropagation();
        var by = (e.shiftKey ? beatTicks() : bt) * (e.key === "ArrowLeft" ? -1 : 1), ns = Math.max(0, f.r.s + by);
        if(ns !== f.r.s){ f.r.s = ns; clearUnder(f.t, f.r); sortRegions(f.t); growBars(); commit("move region"); scrollToTick(ns); }
      }
    }

    // ---- the playhead while something plays ----
    var phRaf = 0, meterAt = 0;
    function refreshPlayhead(){ if(!UI.built) return; ARR.phTick = undefined; paintPos(); ARR.view.ask(); if(typeof rollAsk === "function") rollAsk(); }
    function playheadLoop(){
      if(phRaf || !UI.built) return;
      (function step(){
        phRaf = 0;
        var going = TR.playing || audition;
        if(!going){ ARR.phTick = undefined; refreshPlayhead(); paintMeters(true); paintBar(); if(typeof recPaint === "function") recPaint(); return; }
        var tk = audition ? auditionTick() : transportTick();
        ARR.phTick = Math.max(0, tk);
        if(UI.follow && TR.playing && !ARR.view.busy()){
          var host = UI.e.tl, x = ARR.phTick * ARR.ppt - host.scrollLeft;
          if(x > host.clientWidth - 24 || x < 0) host.scrollLeft = Math.max(0, ARR.phTick * ARR.ppt - 40);
        }
        paintPos(); ARR.view.ask(); if(typeof rollPlayhead === "function") rollPlayhead(ARR.phTick);
        var now = performance.now(); if(now - meterAt > 50){ meterAt = now; paintMeters(false); if(typeof recPaint === "function") recPaint(); }
        phRaf = window.requestAnimationFrame(step);
      })();
    }
    var meterHold = {};
    function paintMeters(zero){
      var lv = zero ? { tracks:{}, master:0 } : levels(), E = UI.e;
      S.tracks.forEach(function(t){
        var h = E.th && E.th[t.id]; if(!h) return;
        var v = lv.tracks[t.id] || 0, hold = Math.max(v, (meterHold[t.id] || 0) * 0.82); meterHold[t.id] = hold;
        var pct = hold <= 0.0005 ? 0 : clamp((20 * Math.log(hold) / Math.LN10 + 48) / 48, 0, 1);
        h.meter.firstChild.style.transform = "scaleX(" + pct.toFixed(3) + ")"; h.meter.dataset.hot = hold > 0.98 ? "true" : "false";
      });
      if(typeof mixerMeters === "function") mixerMeters(lv, zero);
      phMixMeters(lv, zero);
    }

    // ---- the empty song ----
    function paintEmpty(){
      var E = UI.e, show = !S.tracks.length && !phoneOn();
      if(show === !E.empty.hidden && (!show || E.empty.firstChild)) return;
      E.empty.hidden = !show; UI.root.dataset.empty = show ? "true" : "false";
      if(!show){ E.empty.textContent = ""; return; }
      E.empty.textContent = "";
      var box = el("div", "st-start");
      box.appendChild(el("h2", "", "Start a song"));
      box.appendChild(el("p", "st-lead", "Sing or hum what you hear in your head. The Studio turns it into notes, plays them on a real instrument, and lets you put right whatever came out differently."));
      var sp = el("div", "st-startrow"); sp.appendChild(el("span", "st-l", "How fast"));
      var seg = el("div", "st-seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "How fast");
      [["Slow", 72], ["Medium", 96], ["Quick", 120], ["I do not know yet", 0]].forEach(function(o){
        var b = tbtn("", o[0] + (o[1] ? " · " + o[1] : ""), o[1] ? o[1] + " beats per minute. It can be changed at any time." : "Stay at 100 for now. Tap sets it later, and humming without a click can find it for you.", function(){
          if(o[1]){ S.tempo = o[1]; touch(); } UI.startTempo = o[1]; paintBar(); Array.prototype.forEach.call(seg.children, function(x){ x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        });
        b.setAttribute("aria-pressed", (UI.startTempo === undefined ? o[1] === 0 : UI.startTempo === o[1]) ? "true" : "false"); seg.appendChild(b);
      });
      sp.appendChild(seg); box.appendChild(sp);
      var ways = el("div", "st-ways");
      function way(id, title, text, fn){
        var b = btn("st-way", null, "", fn); b.id = id; b.appendChild(el("b", "", title)); b.appendChild(el("span", "", text)); ways.appendChild(b); return b;
      }
      way("ststart-hum", "Hum a part", "A bass line, a melody, a riff: hum it or sing “da da da” and it becomes notes on an instrument you choose.", function(){ startWith("hum"); });
      way("ststart-drums", "Start with drums", "Pick a feel (pop, ballad, soul, bossa and more) and get a beat to sing over.", function(){ startWith("drums"); });
      way("ststart-chords", "Start with chords", "Choose chords by name, bar by bar, and have a piano or a guitar play them.", function(){ startWith("chords"); });
      box.appendChild(ways);
      var foot = el("p", "st-foot");
      foot.appendChild(document.createTextNode("Or "));
      var b1 = btn("st-link", "record your voice", "", function(){ startWith("voice"); }), b2 = btn("st-link", "open a song or MIDI file", "", function(){ openFilePick(); }), b3 = btn("st-link", "read how this works", "", function(){ helpSheet(); });
      foot.appendChild(b1); foot.appendChild(document.createTextNode(", ")); foot.appendChild(b2); foot.appendChild(document.createTextNode(", or ")); foot.appendChild(b3); foot.appendChild(document.createTextNode("."));
      box.appendChild(foot);
      E.empty.appendChild(box);
    }
    function startWith(what){
      ensureEngine().then(resume);
      if(what === "hum"){
        instBrowser(document.getElementById("ststart-hum"), null, { kind:"inst", then:function(t){ humSheet(t.id); }, title:"Which instrument should play what you hum?" });
      } else if(what === "drums"){
        var t = addTrack("drums", defaultKit(), "Drums"); if(!t) return;
        var r = addRegion(t, 0, barTicks() * 4, []); drumPreset(r, "pop", 0, true); commit("start with drums"); select(t.id, r.id, { open:true }); UI.tab = "drums"; layout();
        tell("A pop beat to start from. Choose another feel in the editor below, or change any hit on the grid.");
      } else if(what === "chords"){
        var t2 = addTrack("inst", defaultInst("keys"), "Chords"); if(!t2) return;
        commit("start with chords"); select(t2.id, null); CH.track = t2.id; showTab("chords");
        if(S.key.root === null) tell("Choose a key first (the Key button at the top), or pick chords from the full list below.");
      } else if(what === "voice"){
        var t3 = addTrack("audio", "", "Voice"); if(!t3) return;
        commit("add a voice track"); select(t3.id, null); UI.tab = "take"; layout();
      }
    }
    function defaultInst(fam){
      var list = instList().filter(function(d){ return !d.kit && d.family === fam && !d.basic; });
      if(list.length) return list[0].id;
      var b = BASIC.filter(function(x){ return x.family === fam; })[0]; return b ? b.id : "basic:piano";
    }
    function defaultKit(){ var list = instList().filter(function(d){ return d.kit && !d.basic; }); return list.length ? list[0].id : "basic:kit"; }
