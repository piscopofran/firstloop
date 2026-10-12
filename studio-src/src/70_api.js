    // ---------- Studio: what the Assistant is told, and what it may do ----------
    // The song as a short description (the server allows 14 KB for all of it): tracks and their parts in outline, the
    // chords, the sections, and the notes of the selected part only. Every action is checked here against the song
    // before anything changes; all the changes of one reply are one step of Undo, and a version is kept from before.
    function pitchName(p){ return NOTE_SHARP[((p % 12) + 12) % 12].replace("♯", "#") + (Math.floor(p / 12) - 1); }
    function keyWords(k){ k = k || S.key; return !scaleOf(k) ? "none" : NOTE_NAMES[k.root].replace("♯", "#").replace("♭", "b") + (k.scale === "minor" ? " minor" : " major"); }
    function chordWords(c){ return chordName(c).replace("♯", "#").replace("♭", "b"); }
    function asstState(){
      var bt = barTicks(), pt = pulseTicks(), w = {}, st = stepState();
      w.song = { name:S.name.slice(0, 60), tempo:S.tempo, meter:S.sig[0] + "/" + S.sig[1], key:keyWords(), bars:Math.ceil(songTicks() / bt), swing:Math.round(S.swing * 100) };
      w.sections = S.sections.slice(0, 16).map(function(q){ return { name:q.name, bar:q.bar + 1, bars:q.len }; });
      w.chords = S.chords.slice(0, 64).map(function(c){ var bar = Math.floor(c.t / bt); return [bar + 1, Math.round((c.t - bar * bt) / pt * 100) / 100 + 1, chordWords(c)]; });
      if(S.chords.length > 64) w.more_chords = S.chords.length - 64;
      w.tracks = S.tracks.map(function(t, i){
        var d = ENG.inst[t.inst], o = { n:i + 1, name:t.name.slice(0, 32), kind:t.kind === "inst" ? "instrument" : t.kind === "audio" ? "voice" : "drums" };
        if(t.kind !== "audio"){ o.instrument = t.inst.slice(0, 40); if(d && d.range && !d.kit) o.range = pitchName(d.range[0]) + " to " + pitchName(d.range[1]); if(d && d.basic) o.basic_sound = true; }
        if(t.mute) o.muted = true; if(t.solo) o.solo = true;
        o.volume = Math.round(t.vol * 100); if(t.pan) o.pan = Math.round(t.pan * 100); o.reverb = Math.round(t.send * 100);
        o.parts = t.regions.slice(0, 10).map(function(r){
          var q = { bar:Math.floor(r.s / bt) + 1, bars:Math.round(r.l / bt * 100) / 100 };
          if(t.kind === "audio"){ q.kind = "recording"; if(r.takes.length > 1) q.takes = r.takes.length; return q; }
          var lo = 127, hi = 0, n = 0, out = 0;
          eachNote(r, r.s, r.s + r.l, function(s, l, p){ n++; if(p < lo) lo = p; if(p > hi) hi = p; if(t.kind === "inst" && !inScale(p)) out++; });
          q.kind = r.hum ? "hummed" : r.gen ? "follows chords: " + r.gen.style : r.drum && r.drum.feel && !r.drum.edited ? "feel: " + r.drum.feel : "notes";
          q.notes = n;
          if(n && t.kind === "inst"){ q.low = pitchName(lo + 12 * (t.oct || 0)); q.high = pitchName(hi + 12 * (t.oct || 0)); if(out && scaleOf()) q.out_of_key = out; }
          return q;
        });
        if(t.regions.length > 10) o.more_parts = t.regions.length - 10;
        return o;
      });
      var f = selRegion(), ts = selTrack();
      if(ts) w.selected = { track:S.tracks.indexOf(ts) + 1 };
      if(f && f.t.kind !== "audio"){
        w.selected.bar = Math.floor(f.r.s / bt) + 1; w.selected.notes = [];
        eachNote(f.r, f.r.s, f.r.s + f.r.l, function(s, l, p){ if(w.selected.notes.length < 64) w.selected.notes.push([Math.round((s - f.r.s) / pt * 100) / 100 + 1, Math.round(l / pt * 100) / 100, f.t.kind === "drums" ? (DRUM_OF[p] || String(p)) : pitchName(p + 12 * (f.t.oct || 0))]); });
      }
      var ly = [], left = 500;
      (S.sections.length ? S.sections : [{ id:"_all", name:"Lyrics" }]).forEach(function(q){ var tx = S.lyrics[q.id]; if(tx && left > 0 && ly.length < 12){ ly.push({ section:q.name.slice(0, 24), text:tx.slice(0, Math.min(160, left)) }); left -= Math.min(160, tx.length); } });
      if(ly.length) w.lyrics = ly;
      w.done = { hummed:st.hum, instrument_chosen:st.inst, chords:st.chords, drums:st.drums, voice_recorded:st.sing };
      w.playing = !!TR.playing; if(recordingNow()) w.recording = recordingNow();
      w.timing = latNow().measured ? "measured" : "estimated";
      var av = {}; instList().forEach(function(d){ if(Object.keys(av).length < 40) av[d.id] = (d.name + (d.kit ? ", kit" : ", " + d.family)).slice(0, 40); });
      w.instruments = av; w.sounds = ENG.manifestState === "ready" ? "recorded" : "basic only";
      w.feels = FEELS.map(function(x){ return x.id; }); w.styles = CHORD_STYLES.map(function(x){ return x[0]; }); w.bass_styles = BASS_STYLES.map(function(x){ return x[0]; });
      // keep it inside what the server takes
      function size(){ return JSON.stringify(w).length; }
      if(size() > 11000 && w.selected) delete w.selected.notes;
      if(size() > 11000) w.tracks.forEach(function(o){ if(o.parts.length > 3){ o.more_parts = (o.more_parts || 0) + o.parts.length - 3; o.parts = o.parts.slice(0, 3); } });
      if(size() > 11000){ w.chords = w.chords.slice(0, 16); delete w.lyrics; }
      return w;
    }
    var ASSTUNDO = {};
    function asstApply2(actions){
      var out = { changes:[], skipped:[], changed:false, undo:null, applied:0, btns:[], links:[], gm:null, point:null, ref:{ m:null } };
      if(!Array.isArray(actions) || !actions.length || !S) return out;
      var j0 = JSON.stringify(S), bt = barTicks(), pt = pulseTicks(), post = [], labels = [];
      function chg(t){ out.changes.push(t); out.applied++; }
      function skip(t){ out.skipped.push("Skipped: " + t); }
      function show(v){ var s; try { s = typeof v === "string" ? v : JSON.stringify(v); } catch(e){ s = "?"; } return String(s === undefined ? "nothing" : s).replace(/\s+/g, " ").slice(0, 24); }
      function num(v, lo, hi){ if(typeof v === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(v)) v = +v; return (typeof v !== "number" || !isFinite(v) || v < lo || v > hi) ? null : v; }
      function int(v, lo, hi){ var n = num(v, lo, hi); return n === null || Math.floor(n) !== n ? null : n; }
      function trk(v, kind){
        var t = null;
        if(typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) t = S.tracks[+v - 1] || null;
        else if(typeof v === "string"){ var q = v.trim().toLowerCase(); t = S.tracks.filter(function(x){ return x.name.toLowerCase() === q; })[0] || S.tracks.filter(function(x){ return x.name.toLowerCase().indexOf(q) >= 0 || (ENG.inst[x.inst] && ENG.inst[x.inst].name.toLowerCase().indexOf(q) >= 0); })[0] || null; }
        if(t && kind && t.kind !== kind) return null;
        return t;
      }
      function inst(v, kit){
        if(typeof v !== "string" || !v) return null;
        var q = v.trim().toLowerCase(), all = instList().filter(function(d){ return !!d.kit === !!kit; });
        var d = all.filter(function(x){ return x.id.toLowerCase() === q; })[0] || all.filter(function(x){ return x.name.toLowerCase() === q; })[0];
        if(!d){ var fam = FAMILY_ALIAS[q] || q, list = all.filter(function(x){ return x.family === fam; }).sort(function(a, b){ return (a.basic ? 1 : 0) - (b.basic ? 1 : 0); }); d = list[0]; }
        if(!d) d = all.filter(function(x){ return x.name.toLowerCase().indexOf(q) >= 0 || x.id.toLowerCase().indexOf(q.replace(/\s+/g, "-")) >= 0; }).sort(function(a, b){ return (a.basic ? 1 : 0) - (b.basic ? 1 : 0); })[0];
        return d || null;
      }
      function barOf(v, max){ return int(v, 1, max || 400); }
      function sec(v){
        if(typeof v === "number" || (typeof v === "string" && /^\d+$/.test(v))) return S.sections[+v - 1] || null;
        if(typeof v !== "string") return null; var q = v.trim().toLowerCase();
        return S.sections.filter(function(x){ return x.name.toLowerCase() === q; })[0] || S.sections.filter(function(x){ return x.name.toLowerCase().indexOf(q) === 0; })[0] || null;
      }
      function pitchOf(v){
        if(typeof v === "number") return int(v, 0, 127);
        var m = /^\s*([A-Ga-g])([#♯b♭]?)(-?\d)\s*$/.exec(String(v)); if(!m) return null;
        var p = { C:0, D:2, E:4, F:5, G:7, A:9, B:11 }[m[1].toUpperCase()] + (m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0) + 12 * (+m[3] + 1);
        return p >= 0 && p <= 127 ? p : null;
      }
      function range(a, defWhole){
        // from_bar / to_bar (inclusive), or bar / bars, or a section by name; null when it cannot be read
        var s = a.section !== undefined ? sec(a.section) : null, from, to;
        if(a.section !== undefined && !s){ skip("there is no section called " + show(a.section)); return null; }
        if(s){ from = s.bar; to = s.bar + s.len; }
        else if(a.from_bar !== undefined || a.bar !== undefined){
          from = barOf(a.from_bar !== undefined ? a.from_bar : a.bar); if(from === null){ skip("bar " + show(a.from_bar !== undefined ? a.from_bar : a.bar) + " is not a bar of the song"); return null; }
          from -= 1;
          if(a.to_bar !== undefined){ to = barOf(a.to_bar); if(to === null || to <= from){ skip("the bars " + show(a.from_bar) + " to " + show(a.to_bar) + " are not a stretch of the song"); return null; } }
          else if(a.bars !== undefined){ var nb = int(a.bars, 1, 200); if(nb === null){ skip(show(a.bars) + " is not a number of bars"); return null; } to = from + nb; }
          else to = defWhole ? Math.max(from + 1, Math.ceil(songTicks() / bt)) : from + 4;
        } else { from = 0; to = Math.max(defWhole ? Math.ceil(songTicks() / bt) : 4, S.chords.length ? Math.floor(S.chords[S.chords.length - 1].t / bt) + 1 : 0, 1); }
        return { a:from * bt, b:to * bt, from:from, to:to };
      }
      function label(t){ if(labels.indexOf(t) < 0) labels.push(t); }
      var RUN = {
        go_to:function(a){
          var v = String(a.area || a.view || "").toLowerCase();
          if(v === "studio" || v === "write") return out.changes.push("The Studio is open");
          if(["make", "mix", "dj", "learn", "songs"].indexOf(v) < 0) return skip("there is no area called " + show(a.area));
          post.push(function(){ setView(v); }); out.changes.push("Opened " + ({ make:"Make", mix:"Mix", dj:"the DJ area", learn:"Learn", songs:"My songs" })[v]);
        },
        play:function(a){
          var b = a.from_bar !== undefined ? barOf(a.from_bar) : null;
          post.push(function(){ transportPlay(b ? { from:(b - 1) * barTicks() } : {}); }); out.changes.push(b ? "Playing from bar " + b : "Playing");
        },
        stop:function(){ post.push(function(){ transportStop(); auditionStop(); }); out.changes.push("Stopped"); },
        w_tempo:function(a){
          var v = num(a.bpm !== undefined ? a.bpm : a.value, 40, 220); if(v === null) return skip("tempo " + show(a.bpm !== undefined ? a.bpm : a.value) + " is outside 40 to 220");
          v = Math.round(v); if(v === S.tempo) return out.changes.push("Tempo is already " + v);
          var was = S.tempo, had = hasAudio(); setTempo(v); chg("Tempo " + was + " → " + v + (had ? " (recordings keep their own speed)" : "")); label("tempo " + v);
        },
        w_key:function(a){
          var raw = String(a.key !== undefined ? a.key : a.value === undefined ? "" : a.value).trim();
          if(/^(none|no key|off)$/i.test(raw)){ if(!scaleOf()) return out.changes.push("The song has no key set"); S.key = { root:null, scale:"none" }; chg("Key removed"); label("no key"); return; }
          var m = /^([A-Ga-g])\s*([#♯b♭]?)\s*(major|minor|maj|min|m)?$/i.exec(raw.replace(/\s+/g, " ")); if(!m) return skip(show(raw) + " is not a key: say it as “A minor” or “F major”");
          var root = ({ C:0, D:2, E:4, F:5, G:7, A:9, B:11 })[m[1].toUpperCase()] + (m[2] === "#" || m[2] === "♯" ? 1 : m[2] ? -1 : 0), sc = m[3] && /^(minor|min|m)$/i.test(m[3]) ? "minor" : "major";
          root = (root + 12) % 12;
          if(S.key.root === root && S.key.scale === sc) return out.changes.push("Key is already " + keyName(S.key));
          var was = keyName(S.key); S.key = { root:root, scale:sc }; chg("Key " + was + " → " + keyName(S.key) + " (notes are not moved; the grid marks the notes of the key)"); label("key " + keyName(S.key));
        },
        w_meter:function(a){
          var v = String(a.value !== undefined ? a.value : a.meter);
          if(!{ "4/4":1, "3/4":1, "6/8":1, "2/4":1, "5/4":1, "12/8":1 }[v]) return skip("the beats in a bar can be 4/4, 3/4, 6/8, 2/4, 5/4 or 12/8, not " + show(v));
          if(v === S.sig[0] + "/" + S.sig[1]) return out.changes.push("Already in " + v);
          var m = /^(\d+)\/(\d+)$/.exec(v), old = barTicks(); S.sig = [+m[1], +m[2]]; var nbt = barTicks();
          S.sections.forEach(function(q){ var x = Math.round(q.bar * old / nbt), y = Math.max(x + 1, Math.round((q.bar + q.len) * old / nbt)); q.bar = x; q.len = y - x; });
          S.loop.a = Math.round(S.loop.a / old) * nbt; S.loop.b = Math.max(S.loop.a + nbt, Math.round(S.loop.b / old) * nbt); bt = nbt; pt = pulseTicks(); growBars();
          chg("Beats in a bar → " + v + " (the notes stay where they are in time)"); label("time signature " + v);
        },
        w_transpose:function(a){
          var n = int(a.semitones !== undefined ? a.semitones : a.value, -12, 12); if(n === null || n === 0) return skip("a transposition is a whole number of semitones from -12 to 12, not " + show(a.semitones));
          var was = keyName(S.key), moved = transposeSong(n);
          chg("The whole song " + Math.abs(n) + (Math.abs(n) === 1 ? " semitone " : " semitones ") + (n > 0 ? "higher" : "lower") + ": " + moved + " notes and " + S.chords.length + " chords moved" + (scaleOf() ? ", key " + was + " → " + keyName(S.key) : "") + (hasAudio() ? " (recordings are not changed)" : ""));
          label("transpose " + (n > 0 ? "+" : "") + n);
        },
        w_chords:function(a){
          var list = Array.isArray(a.chords) ? a.chords.slice(0, 128) : null; if(!list || !list.length) return skip("the chords came without a list");
          var good = [], bad = 0, nb = Math.round(bt / pt);
          list.forEach(function(c){
            var o = Array.isArray(c) ? { bar:c[0], beat:c.length > 2 ? c[1] : 1, chord:c[c.length - 1] } : (c && typeof c === "object" ? c : null); if(!o){ bad++; return; }
            var bar = barOf(o.bar), beat = o.beat === undefined ? 1 : num(o.beat, 1, nb + 0.99), pc = parseChord(o.chord !== undefined ? o.chord : o.name);
            if(bar === null || beat === null || !pc){ bad++; return; }
            good.push({ t:Math.round((bar - 1) * bt + (beat - 1) * pt), root:pc.root, q:pc.q });
          });
          if(!good.length) return skip("none of the chords could be read (write them as C, Am, F7, Gmaj7, Dsus4, Bb)");
          good.sort(function(x, y){ return x.t - y.t; });
          if(a.replace !== false){ var lo = Math.floor(good[0].t / bt) * bt, hi = Math.floor(good[good.length - 1].t / bt) * bt + bt; S.chords = S.chords.filter(function(c){ return c.t < lo || c.t >= hi; }); }
          good.forEach(function(c){ S.chords = S.chords.filter(function(x){ return x.t !== c.t; }); S.chords.push(c); });
          S.chords.sort(function(x, y){ return x.t - y.t; });
          for(var i = S.chords.length - 1; i > 0; i--) if(S.chords[i].root === S.chords[i - 1].root && S.chords[i].q === S.chords[i - 1].q) S.chords.splice(i, 1);
          growBars(); var fl = chordFollow();
          chg("Chords from bar " + (Math.floor(good[0].t / bt) + 1) + ": " + good.slice(0, 12).map(chordName).join(" ") + (good.length > 12 ? " …" : "") + (bad ? " (" + bad + " could not be read)" : "") + (fl ? "; " + fl + (fl === 1 ? " part that follows the chords was" : " parts that follow the chords were") + " written again" : ""));
          label("chords");
        },
        w_suggest_chords:function(a){
          var t = a.track !== undefined ? trk(a.track, "inst") : (selTrack() && selTrack().kind === "inst" && hasNotes(selTrack()) && !selTrack().regions.every(function(r){ return !!r.gen; }) ? selTrack() : S.tracks.filter(function(x){ return x.kind === "inst" && hasNotes(x) && !x.regions.every(function(r){ return !!r.gen; }); })[0]);
          if(!t) return skip(a.track !== undefined ? "there is no instrument track " + show(a.track) : "there is no part with notes to fit chords to yet");
          var x = 1e12, y = 0; t.regions.forEach(function(r){ if(patOf(r) && patOf(r).notes.length){ x = Math.min(x, r.s); y = Math.max(y, r.s + r.l); } });
          if(y <= x) return skip("“" + t.name + "” has no notes yet");
          x = Math.floor(x / bt) * bt; y = Math.ceil(y / bt) * bt;
          var key = S.key, guessed = null;
          if(!scaleOf(key)){ var all = []; t.regions.forEach(function(r){ eachNote(r, x, y, function(s, l, p){ all.push({ t:s, n:p, d:l }); }); }); guessed = dsp().suggestKey(all); if(!guessed) return skip("there are too few notes on “" + t.name + "” to tell its key"); key = { root:guessed.root, scale:guessed.scale }; }
          var res = suggestChords(t.id, x, y, key), pick = res && res[clamp((int(a.option, 1, 3) || 1) - 1, 0, res.length - 1)];
          if(!pick) return skip("there are too few notes on “" + t.name + "” to suggest chords from");
          if(guessed){ S.key = key; }
          S.chords = S.chords.filter(function(c){ return c.t < x || c.t >= y; }); pick.forEach(function(c){ S.chords.push({ t:c.t, root:c.root, q:c.q }); }); S.chords.sort(function(p, q){ return p.t - q.t; });
          for(var i = S.chords.length - 1; i > 0; i--) if(S.chords[i].root === S.chords[i - 1].root && S.chords[i].q === S.chords[i - 1].q) S.chords.splice(i, 1);
          chordFollow();
          chg("Chords fitted to “" + t.name + "”, bars " + (x / bt + 1) + " to " + (y / bt) + ": " + pick.slice(0, 16).map(chordName).join(" ") + (guessed ? " (the key was set to " + keyName(key) + ", which the notes fit best)" : ""));
          label("chords for " + t.name);
        },
        w_add_track:function(a){
          var kind = String(a.kind || "instrument").toLowerCase(); kind = /drum|kit|perc/.test(kind) ? "drums" : /voice|vocal|audio|record/.test(kind) ? "audio" : "inst";
          if(S.tracks.length >= MAXTRACKS) return skip("a song has room for " + MAXTRACKS + " tracks");
          var d = kind === "audio" ? null : a.instrument !== undefined ? inst(a.instrument, kind === "drums") : ENG.inst[kind === "drums" ? defaultKit() : defaultInst("keys")];
          if(kind !== "audio" && !d) return skip("there is no " + (kind === "drums" ? "kit" : "instrument") + " called " + show(a.instrument));
          var nm = typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 32) : kind === "audio" ? "Voice" : kind === "drums" ? "Drums" : d.name.replace(/\s*\(.*\)$/, "");
          var t = addTrack(kind, d ? d.id : "", nm); chg("New " + (kind === "audio" ? "voice track" : kind === "drums" ? "drum track" : "track") + " “" + t.name + "”" + (d ? " on " + d.name : "")); label("add track " + t.name);
          post.push(function(){ select(t.id, null); });
        },
        w_instrument:function(a){
          var t = trk(a.track); if(!t || t.kind === "audio") return skip("there is no instrument or drum track " + show(a.track));
          var d = inst(a.instrument !== undefined ? a.instrument : a.id, t.kind === "drums"); if(!d) return skip("there is no " + (t.kind === "drums" ? "kit" : "instrument") + " called " + show(a.instrument));
          if(t.inst === d.id) return out.changes.push("“" + t.name + "” already plays on " + d.name);
          var was = instName(t.inst); t.inst = d.id; t.fam = d.kit ? "" : d.family; S.flags.picked = true;
          // parts that follow the chords are written for the new instrument's range and manner
          t.regions.forEach(function(r){ if(r.gen && !stylesFor(t).some(function(x){ return x[0] === r.gen.style; })) r.gen.style = styleDefault(t); });
          chordFollow();
          chg("“" + t.name + "”: " + was + " → " + d.name); label("instrument " + d.name);
        },
        w_accompany:function(a){
          if(!S.chords.length) return skip("the song has no chords yet; set them first (w_chords or w_suggest_chords)");
          var t = a.track !== undefined ? trk(a.track, "inst") : null, made = false;
          if(a.track !== undefined && !t) return skip("there is no instrument track " + show(a.track));
          if(!t){
            var d = inst(a.instrument !== undefined ? a.instrument : "keys", false); if(!d) return skip("there is no instrument called " + show(a.instrument));
            if(S.tracks.length >= MAXTRACKS) return skip("a song has room for " + MAXTRACKS + " tracks");
            t = addTrack("inst", d.id, typeof a.name === "string" && a.name.trim() ? a.name.trim().slice(0, 32) : d.name.replace(/\s*\(.*\)$/, "")); made = true;
          }
          var style = String(a.style || "").toLowerCase().replace(/[^a-z]/g, ""), ok = stylesFor(t).some(function(x){ return x[0] === style; });
          if(a.style !== undefined && !ok && !made) { /* fall through to the default, and say so */ }
          if(!ok) style = styleDefault(t);
          var rg = range(a, true); if(!rg){ if(made) S.tracks.pop(); return; }
          var first = Math.floor(S.chords[0].t / bt) * bt; if(rg.a < first) rg.a = first;
          if(rg.b <= rg.a){ if(made) S.tracks.pop(); return skip("there are no chords in those bars"); }
          var r = chordPart(t.id, rg.a, rg.b, style); if(!r){ if(made) S.tracks.pop(); return skip("there are no chords in those bars"); }
          chg((made ? "New track “" + t.name + "” plays" : "“" + t.name + "” plays") + " the chords, bars " + (rg.a / bt + 1) + " to " + (rg.b / bt) + ", " + styleName(style).toLowerCase() + (a.style !== undefined && !ok ? " (there is no style " + show(a.style) + " for this instrument)" : ""));
          label("accompaniment on " + t.name); post.push(function(){ select(t.id, r.id, { keepTab:true }); });
        },
        w_drums:function(a){
          var feel = String(a.feel || "").toLowerCase(), fl = FEELS.filter(function(x){ return x.id === feel || x.name.toLowerCase() === feel; })[0];
          if(a.feel !== undefined && !fl) return skip("there is no drum feel called " + show(a.feel));
          var t = a.track !== undefined ? trk(a.track, "drums") : S.tracks.filter(function(x){ return x.kind === "drums"; })[0], made = false;
          if(a.track !== undefined && !t) return skip("there is no drum track " + show(a.track));
          if(!t){ if(S.tracks.length >= MAXTRACKS) return skip("a song has room for " + MAXTRACKS + " tracks"); var kd = a.kit !== undefined ? inst(a.kit, true) : ENG.inst[defaultKit()]; if(!kd) return skip("there is no kit called " + show(a.kit)); t = addTrack("drums", kd.id, "Drums"); made = true; }
          var rg = range(a, true); if(!rg){ if(made) S.tracks.pop(); return; }
          if(rg.to - rg.from > 64) rg.b = rg.a + 64 * bt;
          var vari = typeof a.variation === "string" ? "ABC".indexOf(a.variation.toUpperCase()) : (int(a.variation, 1, 3) || 1) - 1; if(vari < 0) vari = 0;
          var existing = t.regions.filter(function(r){ return r.s === rg.a && r.s + r.l === rg.b; })[0];
          if(!fl) fl = FEELS.filter(function(x){ return x.id === (existing && existing.drum ? existing.drum.feel : beatPlan().compound ? "ballad68" : "pop"); })[0] || FEELS[0];
          var r = existing || { id:uid("r"), s:rg.a, l:rg.b - rg.a, pat:newPat(rg.b - rg.a, []), off:0 };
          if(!existing){ t.regions.push(r); clearUnder(t, r); sortRegions(t); growBars(); } else if(linkCount(r.pat) > 1) unlinkRegion(r);
          var keepGrid = DG.grid; drumPreset(r, fl.id, vari, !!a.fill); DG.grid = keepGrid;
          var busy = int(a.busier, -3, 3) || 0, k; for(k = 0; k < Math.abs(busy); k++) drumDensity({ t:t, r:r }, busy > 0 ? 1 : -1);
          chg((made ? "New drum track: " : "Drums: ") + fl.name + " " + "ABC"[vari] + ", bars " + (rg.a / bt + 1) + " to " + (rg.b / bt) + (r.drum.fill ? ", with a fill at the end" : "") + (busy ? (busy > 0 ? ", busier" : ", sparser") : ""));
          label("drums: " + fl.name); post.push(function(){ select(t.id, r.id, { keepTab:true }); });
        },
        w_tidy:function(a){
          var t = a.track !== undefined ? trk(a.track, "inst") : (selTrack() && selTrack().kind === "inst" ? selTrack() : null);
          if(!t) return skip(a.track !== undefined ? "there is no instrument track " + show(a.track) : "no instrument track is selected; say which track");
          var timing = a.timing === undefined ? "" : String(a.timing).toLowerCase(), grid = ({ "1/4":PPQ, "1/8":PPQ / 2, "1/16":PPQ / 4, "1/8t":PPQ / 3, "1/8 triplet":PPQ / 3, "1/16t":PPQ / 6 })[timing] || 0;
          if(timing && !grid && ["tidy", "strict", "grid"].indexOf(timing) < 0) return skip("timing can be tidy, strict, 1/4, 1/8, 1/16 or 1/8 triplet, not " + show(a.timing));
          var fitKey2 = a.pitch !== undefined && /key|scale/i.test(String(a.pitch));
          if(fitKey2 && !scaleOf()){ fitKey2 = false; skip("the song has no key yet, so notes cannot be fitted to it; set the key first"); if(!timing) return; }
          if(!timing && !fitKey2) return skip("say what to tidy: timing, pitch, or both");
          var only = a.bar !== undefined ? barOf(a.bar) : null, moved = 0, fitted = 0, parts = 0, done = {};
          t.regions.forEach(function(r){
            if(r.gen || !r.pat || done[r.pat] || (only !== null && !(r.s <= (only - 1) * bt && r.s + r.l > (only - 1) * bt))) return; done[r.pat] = 1;
            var p = patOf(r); if(!p.notes.length) return; parts++;
            if(timing){
              var g = grid || dsp().chooseGrid(p.notes.map(function(n){ return n.s; }), PPQ);
              p.notes.forEach(function(n){ var q = Math.round(n.s / g) * g; if(q !== n.s){ n.s = q; moved++; } if(timing === "strict" || timing === "grid" || grid) n.l = Math.max(g, Math.round(n.l / g) * g); });
              sortNotes(p);
              // one voice stays one voice: a note ends where the next begins
              for(var i = p.notes.length - 1; i > 0; i--) if(p.notes[i].s === p.notes[i - 1].s && p.notes[i].p === p.notes[i - 1].p) p.notes.splice(i, 1);
            }
            if(fitKey2) p.notes.forEach(function(n){ var q = snapToScale(n.p); if(q !== n.p){ n.p = q; n.m = 1; fitted++; } });
            if(r.hum) r.hum.edited = true;
          });
          if(!parts) return skip("“" + t.name + "” has no notes of its own to tidy" + (only !== null ? " at bar " + only : ""));
          if(!moved && !fitted) return out.changes.push("“" + t.name + "”: the notes were on the grid" + (fitKey2 ? " and in " + keyName(S.key) : "") + " already");
          chg("“" + t.name + "”: " + (timing ? moved + (moved === 1 ? " note" : " notes") + " moved onto the grid" : "") + (timing && fitKey2 ? ", " : "") + (fitKey2 ? fitted + (fitted === 1 ? " note" : " notes") + " moved into " + keyName(S.key) : ""));
          label("tidy " + t.name);
        },
        w_section:function(a){
          var op = String(a.op || "").toLowerCase(), q;
          if(op === "add"){
            var bar = a.bar !== undefined ? barOf(a.bar) : null, len = a.bars !== undefined ? int(a.bars, 1, 64) : 4;
            if(a.bar !== undefined && bar === null) return skip("bar " + show(a.bar) + " is not a bar of the song"); if(len === null) return skip(show(a.bars) + " is not a number of bars");
            q = addSection(typeof a.name === "string" ? a.name.trim().slice(0, 24) : undefined, bar === null ? undefined : bar - 1, len);
            if(!q) return skip("there is no room for a section there; another one is in the way");
            chg("Section “" + q.name + "” at bar " + (q.bar + 1) + ", " + q.len + (q.len === 1 ? " bar" : " bars")); label("section " + q.name); return;
          }
          q = sec(a.section !== undefined ? a.section : a.name); if(!q) return skip("there is no section called " + show(a.section !== undefined ? a.section : a.name));
          if(op === "rename"){ var nn = typeof a.new_name === "string" ? a.new_name.trim().slice(0, 24) : ""; if(!nn) return skip("the new name is missing"); chg("Section “" + q.name + "” is now “" + nn + "”"); q.name = nn; label("rename section"); }
          else if(op === "duplicate"){
            var c = duplicateSection(q.id); if(!c) return skip("that section could not be duplicated");
            if(typeof a.new_name === "string" && a.new_name.trim()) c.name = a.new_name.trim().slice(0, 24);
            var extra = "";
            if(a.fuller){
              var x = c.bar * bt, y = (c.bar + c.len) * bt, did = [];
              S.tracks.forEach(function(t){ if(t.kind === "drums") t.regions.forEach(function(r){ if(r.s >= x && r.s + r.l <= y && drumDensity({ t:t, r:r }, 1)){ if(did.indexOf("busier drums") < 0) did.push("busier drums"); } }); });
              if(chordAt(x) && S.tracks.length < MAXTRACKS){
                var pad = S.tracks.filter(function(t){ return t.kind === "inst" && ENG.inst[t.inst] && ENG.inst[t.inst].family === "strings"; })[0], madeP = false;
                if(!pad){ var sd = ENG.inst[defaultInst("strings")]; pad = addTrack("inst", sd.id, "Strings"); pad.vol = 0.6; madeP = true; }
                if(pad && !pad.regions.some(function(r){ return r.s < y && r.s + r.l > x; }) && chordPart(pad.id, x, y, "pad")) did.push("a sustained pad on “" + pad.name + "”"); else if(madeP) S.tracks.pop();
              }
              extra = did.length ? ", fuller: " + did.join(" and ") : " (nothing could be added to make it fuller: it needs drums or chords)";
            }
            chg("Section “" + q.name + "” copied with its music to bar " + (c.bar + 1) + " as “" + c.name + "”" + extra); label("duplicate section " + q.name);
          }
          else if(op === "delete"){ var withM = a.with_music === true; deleteSection(q.id, withM); chg(withM ? "Section “" + q.name + "” and its music deleted; what followed moved up" : "The marker “" + q.name + "” removed; its music stays"); label("delete section"); }
          else if(op === "move"){ var dir = /earl|left|before|up/i.test(String(a.dir)) ? -1 : 1; if(!moveSection(q.id, dir)) return skip("“" + q.name + "” is already the " + (dir < 0 ? "first" : "last") + " section"); chg("Section “" + q.name + "” moved " + (dir < 0 ? "earlier" : "later") + ", music and all"); label("move section"); }
          else skip("a section can be added, renamed, duplicated, deleted or moved, not " + show(a.op));
        },
        w_mix:function(a){
          var t = trk(a.track); if(!t) return skip("there is no track " + show(a.track));
          var said = [];
          if(a.volume !== undefined){ var v = num(a.volume, 0, 125); if(v === null) skip("volume " + show(a.volume) + " is outside 0 to 125"); else { said.push("volume " + Math.round(t.vol * 100) + " → " + Math.round(v)); t.vol = Math.round(v) / 100; } }
          if(a.pan !== undefined){ var p = num(a.pan, -100, 100); if(p === null) skip("pan " + show(a.pan) + " is outside -100 (left) to 100 (right)"); else { said.push("pan " + Math.round(t.pan * 100) + " → " + Math.round(p)); t.pan = Math.round(p) / 100; } }
          if(a.reverb !== undefined){ var r = num(a.reverb, 0, 100); if(r === null) skip("reverb " + show(a.reverb) + " is outside 0 to 100"); else { said.push("reverb " + Math.round(t.send * 100) + " → " + Math.round(r)); t.send = Math.round(r) / 100; } }
          if(typeof a.mute === "boolean" && a.mute !== t.mute){ t.mute = a.mute; said.push(a.mute ? "muted" : "unmuted"); }
          if(typeof a.solo === "boolean" && a.solo !== t.solo){ t.solo = a.solo; said.push(a.solo ? "solo on" : "solo off"); }
          if(!said.length) return out.changes.push("“" + t.name + "” is as it was");
          chg("“" + t.name + "”: " + said.join(", ")); label("mix " + t.name);
        },
        w_notes:function(a){
          var t = trk(a.track); if(!t || t.kind === "audio") return skip("there is no instrument or drum track " + show(a.track));
          var rg = range(a, false); if(!rg) return;
          var list = Array.isArray(a.notes) ? a.notes.slice(0, 400) : null; if(!list) return skip("the notes came without a list");
          var notes = [], bad = 0, len = rg.b - rg.a, drums = t.kind === "drums";
          list.forEach(function(n){
            if(!Array.isArray(n) || n.length < 3){ bad++; return; }
            var beat = num(n[0], 1, 2000), l = num(n[1], 0.05, 64), p = drums ? (typeof n[2] === "string" && DRUM[n[2]] ? DRUM[n[2]] : null) : pitchOf(n[2]), v = n[3] === undefined ? 90 : int(n[3], 1, 127);
            if(beat === null || l === null || p === null || v === null){ bad++; return; }
            var s = Math.round((beat - 1) * pt); if(s >= len){ bad++; return; }
            notes.push({ s:s, l:drums ? PPQ / 8 : Math.max(20, Math.min(Math.round(l * pt), len - s)), p:drums ? p : clamp(p - 12 * (t.oct || 0), 0, 127), v:v });
          });
          if(!notes.length && list.length) return skip("none of the notes could be read");
          var r = { id:uid("r"), s:rg.a, l:len, pat:newPat(len, notes), off:0, name:"Written" }; sortNotes(S.pats[r.pat]);
          t.regions.push(r); clearUnder(t, r); sortRegions(t); growBars(); gcPats();
          chg("“" + t.name + "”, bars " + (rg.a / bt + 1) + " to " + (rg.b / bt) + ": " + notes.length + (notes.length === 1 ? " note" : " notes") + " written" + (bad ? " (" + bad + " could not be read or fell outside the bars)" : ""));
          label("write notes on " + t.name); post.push(function(){ select(t.id, r.id, { open:true }); });
        },
        w_loop:function(a){
          if(a.off === true || a.on === false){ if(!S.loop.on) return out.changes.push("The loop is off"); S.loop.on = false; out.changes.push("Loop off"); return; }
          var rg = range(a, false); if(!rg) return;
          S.loop = { on:true, a:rg.a, b:rg.b }; out.changes.push("Looping bars " + (rg.a / bt + 1) + " to " + (rg.b / bt));
        },
        w_open:function(a){
          var what = String(a.what || "").toLowerCase(), t = a.track !== undefined ? trk(a.track) : selTrack();
          var map = {
            hum:function(){ var it = t && t.kind === "inst" ? t : S.tracks.filter(function(x){ return x.kind === "inst"; })[0]; if(it) humSheet(it.id); else startWith("hum"); return "Opened Hum a part; the recording starts when you press Start"; },
            record:function(){ var at = t && t.kind === "audio" ? t : S.tracks.filter(function(x){ return x.kind === "audio"; })[0]; if(at){ select(at.id, null); recordAudio(at.id); } else stepDo("sing"); return "Opened Record; the recording starts when you press the button"; },
            chords:function(){ showTab("chords"); return "Opened Chords"; }, lyrics:function(){ showTab("lyrics"); return "Opened Lyrics"; }, mixer:function(){ showTab("mixer"); return "Opened the Mixer"; },
            export:function(){ exportSheet(); return "Opened Export"; }, help:function(){ helpSheet(); return "Opened Help"; }, sounds:function(){ soundsSheet(); return "Opened About the sounds"; },
            instruments:function(){ if(t && t.kind !== "audio") instBrowser(UI.e.addTrack, t.id); else instBrowser(UI.e.addTrack, null); return "Opened the instruments"; },
            songs:function(){ songsSheet(); return "Opened Your songs"; }, versions:function(){ versionsSheet(); return "Opened Versions"; }
          };
          if(!map.hasOwnProperty(what)) return skip("there is nothing called " + show(a.what) + " to open here");
          var fn = map[what]; out.changes.push(what === "hum" ? "Opened Hum a part; the recording starts when you press Start" : what === "record" ? "Opened Record; the recording starts when you press the button" : "Opened " + ({ chords:"Chords", lyrics:"Lyrics", mixer:"the Mixer", export:"Export", help:"Help", sounds:"About the sounds", instruments:"the instruments", songs:"Your songs", versions:"Versions" })[what]);
          post.push(function(){ fn(); });
        }
      };
      actions.slice(0, 40).forEach(function(a){
        var ty = a && typeof a === "object" && !Array.isArray(a) && typeof a.type === "string" ? a.type.toLowerCase() : "";
        if(!ty || !RUN.hasOwnProperty(ty)){ skip("“" + show(ty || a) + "” is not something I can do in the Studio"); return; }
        try { RUN[ty](a); } catch(e){ skip(ty + " could not be read"); if(testMode) console.error(e); }
      });
      if(actions.length > 40) skip((actions.length - 40) + " more action(s) than fit in one reply");
      var j1 = JSON.stringify(S);
      if(j1 !== j0){
        var ok = !!fixSong(JSON.parse(j1));
        if(!ok){
          S = JSON.parse(j0); hist().last = j0; afterSwap();
          out.changes = []; out.applied = 0; out.skipped = ["That change could not be applied safely, so the song was left as it was."]; return out;
        }
        if(out.applied){
          var tok = uid("u"); ASSTUNDO[tok] = j0; var keys2 = Object.keys(ASSTUNDO); if(keys2.length > 12) delete ASSTUNDO[keys2[0]];
          saveVersion("Before the Assistant changed it", JSON.parse(j0), tok)["catch"](function(){});
          gcPats(); commit("Assistant: " + (labels.slice(0, 3).join(", ") || "change")); engSync();
          out.changed = true; out.undo = { studio:S.id, tok:tok };
          try { LOG.asst.actions += out.applied; } catch(e2){}
          count("asst_studio", out.applied);
        } else { touch(); refresh(true); }
      }
      post.forEach(function(fn){ try { fn(); } catch(e){ if(testMode) console.error(e); } });
      refresh(true);
      return out;
    }
    // put the song back to how it was before one reply's changes. Resolves true when done.
    function asstUndo2(u){
      if(!u || !S || u.studio !== S.id) return Promise.resolve(false);
      function use(j){ var s = fixSong(typeof j === "string" ? JSON.parse(j) : j); if(!s) return false; s.id = S.id; S = s; gcPats(); commit("undo the Assistant’s change"); afterSwap(); return true; }
      if(ASSTUNDO[u.tok]){ var j = ASSTUNDO[u.tok]; delete ASSTUNDO[u.tok]; return Promise.resolve(use(j)); }
      return dbBySong("vers", S.id).then(function(rows){ var v = rows.filter(function(r){ return r.tok === u.tok; })[0]; return v ? use(v.data) : false; });
    }
    // without the AI (switched off, no connection, or a server that does not know the Studio yet): a few plain requests
    function asstLocal2(text, dry){
      var q = String(text).toLowerCase().replace(/[’']/g, "").replace(/\s+/g, " ").trim().replace(/^(please |can you |could you )+/, "").replace(/[.!?]+$/, ""), m, acts = null, t = "";
      if((m = /^(?:set (?:the )?)?tempo (?:to )?(\d{2,3})(?: bpm)?$/.exec(q)) || (m = /^(\d{2,3}) bpm$/.exec(q))) acts = [{ type:"w_tempo", bpm:+m[1] }];
      else if(/^(faster|a bit faster|speed it up)$/.test(q)) acts = [{ type:"w_tempo", bpm:clamp(S.tempo + 6, 40, 220) }];
      else if(/^(slower|a bit slower|slow it down)$/.test(q)) acts = [{ type:"w_tempo", bpm:clamp(S.tempo - 6, 40, 220) }];
      else if((m = /^(?:set (?:the )?)?key (?:to |of |is )?([a-g](?:#|b| sharp| flat)? ?(?:major|minor|m)?)$/.exec(q))) acts = [{ type:"w_key", key:m[1].replace(" sharp", "#").replace(" flat", "b") }];
      else if((m = /^(?:transpose|move (?:it|the song)) (up|down)(?: by)? (\d{1,2})(?: semitones?)?$/.exec(q))) acts = [{ type:"w_transpose", semitones:(m[1] === "up" ? 1 : -1) * +m[2] }];
      else if(/(too high|lower (it|the song|key)|bring it down)/.test(q)){ acts = [{ type:"w_transpose", semitones:-2 }]; t = "The whole song is two semitones lower. Say “lower” again, or “transpose up 1”, until it sits well in your voice."; }
      else if(/(too low|higher|raise (it|the song|key))/.test(q)){ acts = [{ type:"w_transpose", semitones:2 }]; t = "The whole song is two semitones higher. Say it again, or “transpose down 1”, until it sits well in your voice."; }
      else if(/suggest (some )?chords|chords (for|that fit)|find (the )?chords/.test(q)) acts = [{ type:"w_suggest_chords" }];
      else if((m = /^add (?:a |some )?(piano|guitar|strings|bass|keys)(?: part| track)?$/.exec(q))) acts = [{ type:"w_accompany", instrument:m[1] === "piano" ? "keys" : m[1] }];
      else if((m = /^add (?:a |some )?(?:(\w+) )?(?:drums|drum beat|beat)$/.exec(q))) acts = [{ type:"w_drums", feel:m[1] && FEELS.some(function(x){ return x.id === m[1]; }) ? m[1] : undefined }];
      else if(/^(tidy|quantise|quantize|clean up)( (it|this|the notes|the timing|my take|the take))?$/.test(q)) acts = [{ type:"w_tidy", timing:"tidy" }];
      else if(/^(fix|fit) (the )?(notes|pitch)( to the key)?$/.test(q)) acts = [{ type:"w_tidy", pitch:"key" }];
      else if(/^(play|play it|start)$/.test(q)) acts = [{ type:"play" }];
      else if(/^(stop|pause)$/.test(q)) acts = [{ type:"stop" }];
      else if(/^(hum|record|i want to hum|let me hum)/.test(q)) acts = [{ type:"w_open", what:"hum" }];
      if(acts){ if(acts[0].feel === undefined) delete acts[0].feel; return dry ? { t:"" } : { t:t, acts:acts }; }
      return { t:"The AI is not answering here just now, so I can only do plain requests in the Studio: “tempo 92”, “key A minor”, “too high for me”, “transpose down 2”, “suggest chords”, “add piano”, “add guitar”, “add bass”, “add drums”, “tidy the notes”, “fit the notes to the key”. Everything else is on the screen: Help, at the top right, explains it.", plainNote:true };
    }

    // ---------- STUDIO: the outside ----------
    var booted = null;
    function boot(){
      if(booted) return booted;
      var last = null; try { last = window.localStorage.getItem("firstloop.studio.last"); } catch(e){}
      booted = (last ? openSong(last) : Promise.resolve(false)).then(function(ok){
        if(ok) return true;
        return listSongs().then(function(rows){ return rows.length ? openSong(rows[0].id) : createSong("New song").then(function(){ return true; }); });
      }).then(function(){
        // one version a session of a song that has something in it: what it was when it was opened
        if(S && S.tracks.length) saveVersion("When opened, " + fmtWhen(Date.now()))["catch"](function(){});
        return true;
      })["catch"](function(e){ if(testMode) console.error(e); if(!S){ S = newSong("New song"); useSong(S, null); } return true; });
      return booted;
    }
    function show(){
      build();
      loadManifest();
      return boot().then(function(){ layout(); refresh(true); emit("shown", {}); return true; });
    }
    function quiet(){ if(recordingNow()) return; if(TR.playing) transportStop(); auditionStop(); }
    function hide(){
      if(!UI.built) return;
      closePops();
      if(HUM){ humCancel(); recStripEnd(); } else if(recordingNow()){ stopAnyRecording(); recStripEnd(); }
      micMeterStop(); clearInterval(HS.timer);
      if(TR.playing) transportStop(); auditionStop(); kbAllOff();
      if(S && saveTimer) saveNowS();
    }
    function backupOut(){
      // every song, and its recordings while they are of a size a backup file can carry
      return dbAll("songs").then(function(rows){
        if(!rows.length) return null;
        var ids = {}; rows.forEach(function(r){ var s = fixSong(r.data); if(s) takesOf(s).forEach(function(id){ ids[id] = r.id; }); });
        return Promise.all(Object.keys(ids).map(function(id){ return dbGet("audio", id); })).then(function(as){
          as = as.filter(Boolean); var total = 0; as.forEach(function(a){ total += a.pcm.byteLength; });
          var keep = total <= 48 * 1048576;
          return { v:1, songs:rows.map(function(r){ return { id:r.id, name:r.name, updated:r.updated, created:r.created, data:r.data }; }),
                   audio:keep ? as.map(function(a){ return { id:a.id, song:a.song, sr:a.sr, name:a.name, kind:a.kind, lat:a.lat || 0, made:a.made, an:anOut(a.an), pcm:b64(new Uint8Array(a.pcm.buffer, a.pcm.byteOffset, a.pcm.byteLength)) }; }) : [],
                   audio_left_out:keep ? 0 : as.length };
        });
      })["catch"](function(){ return null; });
    }
    function backupIn(data){
      // songs come back under the ids they had; one that is here already and newer is kept
      if(!data || !Array.isArray(data.songs)) return Promise.resolve(0);
      var n = 0;
      return dbAll("songs").then(function(have){
        var by = {}; have.forEach(function(r){ by[r.id] = r; });
        var jobs = data.songs.slice(0, 500).map(function(r){
          var s = r && fixSong(r.data); if(!s || (by[s.id] && by[s.id].updated >= (+r.updated || 0))) return null;
          n++; return dbPut("songs", { id:s.id, name:s.name, updated:+r.updated || Date.now(), created:+r.created || Date.now(), data:s });
        });
        (Array.isArray(data.audio) ? data.audio : []).slice(0, 2000).forEach(function(a){
          if(!a || typeof a.pcm !== "string" || typeof a.id !== "string" || !(a.sr >= 8000 && a.sr <= 192000)) return;
          var u = unb64(a.pcm);
          jobs.push(dbPut("audio", { id:a.id.slice(0, 40), song:String(a.song || ""), sr:a.sr | 0, pcm:new Int16Array(u.buffer, 0, u.length >> 1), an:anIn(a.an), name:String(a.name || "Take").slice(0, 40), made:+a.made || Date.now(), lat:+a.lat || 0, kind:a.kind === "hum" ? "hum" : "audio" }));
        });
        return Promise.all(jobs);
      }).then(function(){
        if(n && S && UI.built) return dbGet("songs", S.id).then(function(rec){ if(rec && rec.updated > REC.updated){ var s = fixSong(rec.data); if(s){ s.id = rec.id; useSong(s, rec); } } return n; });
        return n;
      })["catch"](function(){ return n; });
    }
    var API = {
      on:on,
      // for the Assistant
      state:asstState, apply:asstApply2, undo:asstUndo2, local:asstLocal2,
      // what the app's own code calls
      _show:show, _hide:hide, _quiet:quiet, _midi:midiIn2, _backupOut:backupOut, _backupIn:backupIn,
      playing:function(){ return !!TR.playing; }
    };
    if(testMode) API._t = {
      get S(){ return S; }, set S(v){ S = v; }, ENG:ENG, TR:TR, UI:UI, ROLL:ROLL, MIC:MIC, TEST:TEST, LAT:LAT, DG:DG, CH:CH, FEELS:FEELS, DRUM:DRUM, PPQ:PPQ, SOUNDS:SOUNDS,
      get HUM(){ return HUM; }, get AREC(){ return AREC; }, get NREC(){ return NREC; }, get audition(){ return audition; }, takeCache:takeCache, audioBufs:audioBufs,
      dsp:dsp, newSong:newSong, fixSong:fixSong, useSong:useSong, createSong:createSong, openSong:openSong, listSongs:listSongs, deleteSong:deleteSong, duplicateSong:duplicateSong, saveNow:saveNowS,
      saveVersion:saveVersion, listVersions:listVersions, restoreVersion:restoreVersion, commit:commit, undo:undo, redo:redo, hist:hist,
      addTrack:addTrack, addRegion:addRegion, findRegion:findRegion, patOf:patOf, eachNote:eachNote, flatNotes:flatNotes, splitRegion:splitRegion, cloneRegion:cloneRegion, clearUnder:clearUnder,
      addSection:addSection, duplicateSection:duplicateSection, deleteSection:deleteSection, moveSection:moveSection, setTempo:setTempo, transposeSong:transposeSong, setKey:setKey,
      ensureEngine:ensureEngine, loadManifest:loadManifest, loadInst:loadInst, instList:instList, soundFor:soundFor, playNote:playNote, playDrum:playDrum, buildGraph:buildGraph, trackNodes:trackNodes, pickZone:pickZone, silence:silence,
      renderSong:renderSong, wavBytes:wavBytes, wavRead:wavRead, midiOut:midiOut, midiIn:midiIn, projectOut:projectOut, projectIn:projectIn, bufChans:bufChans,
      transportPlay:transportPlay, transportStop:transportStop, transportTick:transportTick, setPos:setPos,
      humStart:humStart, humFinish:humFinish, humRedo:humRedo, humHear:humHear, humSheet:humSheet, calibrate:calibrate, latNow:latNow, latStore:latStore, latLoad:latLoad, takeInfo:takeInfo, takeToNotes:takeToNotes,
      audioRecStart:audioRecStart, audioRecStop:audioRecStop, noteRecStart:noteRecStart, noteRecEvent:noteRecEvent, noteRecStop:noteRecStop, stopAnyRecording:stopAnyRecording,
      rollDo:rollDo, select:select, showTab:showTab, refresh:refresh, layout:layout, chordNotes:chordNotes, chordPart:chordPart, chordFollow:chordFollow, chordSet:chordSet, suggestChords:suggestChords, parseChord:parseChord,
      keyChords:keyChords, chordTones:chordTones, drumNotes:drumNotes, drumPreset:drumPreset, drumDensity:drumDensity, drumRows:drumRows, stylesFor:stylesFor, CHORD_STYLES:CHORD_STYLES, BASS_STYLES:BASS_STYLES,
      instBrowser:instBrowser, exportSheet:exportSheet, exportMix:exportMix, exportStems:exportStems, exportMidi:exportMidi, exportProject:exportProject, startWith:startWith, stepState:stepState, boot:boot,
      scaleOf:scaleOf, inScale:inScale, barTicks:barTicks, tickSec:tickSec, secTick:secTick, songTicks:songTicks, dbGet:dbGet, dbAll:dbAll, auditionInst:auditionInst, genTone:genTone, genDrum:genDrum, levels:levels
    };
    return API;
  }
  // ---- the entry points: all that exists of the Studio until it is opened ----
  function studio(){ if(!STUDIO){ STUDIO = studioMake(); if(STUDIO._t) window.STUDIO = STUDIO; } return STUDIO; }      // (the tests reach it through window when the address says ?fltest)
  function studioOnView(v){
    if(v === "studio"){ studio()._show(); }
    else if(STUDIO) STUDIO._hide();
  }
  function studioQuiet(){ if(STUDIO) STUDIO._quiet(); }
  function studioOnMIDI(e){ return !!(STUDIO && view === "studio" && STUDIO._midi(e)); }
  function studioHasData(){ try { return !!STUDIO || !!window.localStorage.getItem("firstloop.studio.last"); } catch(e){ return !!STUDIO; } }
  function studioBackupOut(){ return studioHasData() ? studio()._backupOut() : Promise.resolve(null); }
  function studioBackupIn(data){ return studio()._backupIn(data); }
  // the Assistant in the Studio: its own description of the song, its own actions
  function studioAsstOn(){ return view === "studio" || (view === "assistant" && workspace === "write"); }
  function studioAsstState(wire){
    var st = { area:"studio", workspace:"write", playing:false };
    try { st.write = studio().state(); st.playing = !!st.write.playing; } catch(e){ st.write = {}; }
    st.setup = { gear:(profile.gear || []).slice(0, 4), microphone:st.write.timing === "measured" ? "used here, timing measured" : "timing not measured yet" };
    return st;
  }
  // a server that has not been updated for the Studio is not sent it: plain requests are done on the page
  function studioAsstOld(mode){ return mode !== "local" && studioAsstOn() && asstWire() < 5; }
  (function(){
    var tabs = document.querySelector(".viewtabs");
    if(tabs && !tabs.querySelector('.viewtab[data-view="studio"]')){
      var tab = document.createElement("button");
      tab.className = "viewtab"; tab.type = "button"; tab.setAttribute("role", "tab");
      tab.dataset.view = "studio"; tab.setAttribute("aria-selected", "false"); tab.textContent = "Studio";
      tab.addEventListener("click", function(){ setView("studio"); });
      tabs.insertBefore(tab, tabs.firstChild);
    }
    if(typeof palAdd === "function"){
      var X = function(fn){ return { run:function(){ setView("studio"); fn && setTimeout(fn, 250); }, ws:"write" }; };
      palAdd("gostudio", "Go to the Studio", "Songwriter", "studio, songwriter, write a song, compose, singer, hum, real instruments, piano roll, arrange, vocals, lyrics", "top", ['.viewtab[data-view="studio"]'], X(null));
      palAdd("sthum", "Hum a part", "Studio", "hum, sing, whistle, voice to notes, bass line, melody, microphone, pitch", "top", ["#strec"], X(function(){ var b = document.getElementById("strec"); if(b) b.click(); }));
      palAdd("stchords", "Chords", "Studio", "chords, harmony, progression, accompaniment, piano, guitar, strum, suggest chords", "top", ["#sttab-chords"], X(function(){ var b = document.getElementById("sttab-chords"); if(b) b.click(); }));
      palAdd("stlyrics", "Lyrics", "Studio", "lyrics, words, text, verse, chorus", "top", ["#sttab-lyrics"], X(function(){ var b = document.getElementById("sttab-lyrics"); if(b) b.click(); }));
      palAdd("stmix", "Mixer (Studio)", "Studio", "mixer, volume, pan, reverb, level, mute, solo, tone", "top", ["#stmixer"], X(function(){ var b = document.getElementById("stmixer"); if(b && b.getAttribute("aria-pressed") !== "true") b.click(); }));
      palAdd("stexport", "Export the song (Studio)", "Studio", "export, wav, stems, midi, song file, save, download, bounce", "top", ["#stexport"], X(function(){ var b = document.getElementById("stexport"); if(b) b.click(); }));
      palAdd("sthelp", "How the Studio works", "Studio", "help, shortcuts, keys, how, guide, timing, latency", "top", ["#sthelp"], X(function(){ var b = document.getElementById("sthelp"); if(b) b.click(); }));
    }
  })();
