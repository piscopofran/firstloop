    // ---------- Studio: the song and where it is kept ----------
    var S = null;                       // the song that is open
    var REC = { updated:0, created:0 }; // its record's dates
    var HIST = {};                      // undo and redo, per song id: { u:[{j,l}], r:[...], last:json }
    var saveTimer = null, saveState = "saved", memStore = { songs:{}, audio:{}, vers:{}, kv:{}, files:{} }, dbP = null, dbBad = false;

    function barTicks(s){ s = s || S; return PPQ * 4 * s.sig[0] / s.sig[1]; }
    function beatTicks(s){ s = s || S; return PPQ * 4 / s.sig[1]; }
    // the pulse a person taps: the dotted quarter in 6/8 and 12/8, otherwise the beat
    function pulseTicks(s){ s = s || S; return s.sig[1] === 8 && s.sig[0] % 3 === 0 && s.sig[0] > 3 ? PPQ * 1.5 : beatTicks(s); }
    function tickSec(t, s){ s = s || S; return t * 60 / (s.tempo * PPQ); }
    function secTick(x, s){ s = s || S; return x * s.tempo * PPQ / 60; }
    function songTicks(s){
      s = s || S; var end = 0;
      s.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.s + r.l > end) end = r.s + r.l; }); });
      return end;
    }
    function posText(tick){
      var bt = barTicks(), bar = Math.floor(tick / bt), rest = tick - bar * bt, b = beatTicks(), beat = Math.floor(rest / b), six = Math.floor((rest - beat * b) / (PPQ / 4));
      return (bar + 1) + "." + (beat + 1) + "." + (six + 1);
    }
    function timeText(sec){ var m = Math.floor(sec / 60), s = sec - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(1); }

    function newSong(name){
      return { v:1, id:uid("s"), name:name || "New song", tempo:100, sig:[4, 4], key:{ root:null, scale:"none" }, swing:0, swingUnit:PPQ / 2,
               bars:16, sections:[], chords:[], tracks:[], pats:{}, lyrics:{}, flags:{}, mvol:1, loop:{ on:false, a:0, b:PPQ * 16 }, metro:true, countIn:1, started:false };
    }
    function newTrack(kind, inst, name){
      var used = {}; S.tracks.forEach(function(t){ used[t.color] = (used[t.color] || 0) + 1; });
      var c = 0, best = 1e9; TRACK_COLORS.forEach(function(_, i){ if((used[i] || 0) < best){ best = used[i] || 0; c = i; } });
      return { id:uid("t"), kind:kind, name:name || (kind === "drums" ? "Drums" : kind === "audio" ? "Voice" : "Instrument"), color:c,
               inst:inst || (kind === "drums" ? "basic:kit" : kind === "audio" ? "" : "basic:piano"), fam:kind === "inst" && ENG.inst[inst] ? ENG.inst[inst].family : "",
               vol:0.8, pan:0, mute:false, solo:false, send:kind === "drums" ? 0.08 : 0.18, eq:[0, 0, 0], oct:0, regions:[] };
    }
    // anything read from a file or a backup goes through here before it is trusted
    function fixSong(s){
      if(!s || typeof s !== "object" || Array.isArray(s)) return null;
      var o = newSong((typeof s.name === "string" && s.name.trim() ? s.name : "Song").slice(0, 60)), SIGS = { "4/4":1, "3/4":1, "6/8":1, "2/4":1, "5/4":1, "12/8":1 };
      o.id = typeof s.id === "string" && /^[\w-]{3,40}$/.test(s.id) ? s.id : o.id;
      o.tempo = clamp(Math.round(+s.tempo || 100), 40, 220);
      if(Array.isArray(s.sig) && SIGS[s.sig[0] + "/" + s.sig[1]]) o.sig = [s.sig[0] | 0, s.sig[1] | 0];
      if(s.key && (s.key.scale === "major" || s.key.scale === "minor") && s.key.root >= 0 && s.key.root < 12) o.key = { root:s.key.root | 0, scale:s.key.scale };
      o.swing = clamp(+s.swing || 0, 0, 0.6); o.swingUnit = s.swingUnit === PPQ / 4 ? PPQ / 4 : PPQ / 2;
      o.mvol = clamp(s.mvol === undefined ? 1 : +s.mvol || 0, 0, 1.25);
      o.metro = s.metro !== false; o.countIn = clamp(s.countIn === undefined ? 1 : (s.countIn | 0), 0, 2); o.started = !!s.started;
      var bt = barTicks(o);
      if(s.loop && s.loop.b > s.loop.a) o.loop = { on:!!s.loop.on, a:Math.max(0, Math.round(s.loop.a)), b:Math.round(s.loop.b) };
      else o.loop = { on:false, a:0, b:bt * 4 };
      (Array.isArray(s.sections) ? s.sections : []).slice(0, 64).forEach(function(q){
        if(q && q.len > 0) o.sections.push({ id:/^[\w-]{1,40}$/.test(String(q.id)) ? String(q.id) : uid("c"), name:(typeof q.name === "string" && q.name ? q.name : "Section").slice(0, 24), bar:clamp(q.bar | 0, 0, 990), len:clamp(q.len | 0, 1, 400) });
      });
      o.sections.sort(function(a, b){ return a.bar - b.bar; });
      if(s.lyrics && typeof s.lyrics === "object") Object.keys(s.lyrics).slice(0, 80).forEach(function(k){ if(/^[\w-]{1,40}$/.test(k) && typeof s.lyrics[k] === "string" && s.lyrics[k]) o.lyrics[k] = s.lyrics[k].slice(0, 6000); });
      if(s.flags && typeof s.flags === "object") ["picked", "guided"].forEach(function(k){ if(s.flags[k]) o.flags[k] = true; });
      (Array.isArray(s.chords) ? s.chords : []).slice(0, 2000).forEach(function(c){
        if(c && c.t >= 0 && c.root >= 0 && c.root < 12) o.chords.push({ t:Math.round(c.t), root:c.root | 0, q:/^[a-z0-9]{1,5}$/.test(String(c.q)) ? String(c.q) : "maj" });
      });
      o.chords.sort(function(a, b){ return a.t - b.t; });
      var pats = s.pats && typeof s.pats === "object" ? s.pats : {};
      (Array.isArray(s.tracks) ? s.tracks : []).slice(0, MAXTRACKS).forEach(function(t){
        if(!t || ["inst", "drums", "audio"].indexOf(t.kind) < 0) return;
        var n = { id:String(t.id || uid("t")), kind:t.kind, name:(typeof t.name === "string" && t.name ? t.name : "Track").slice(0, 32), color:((t.color | 0) % TRACK_COLORS.length + TRACK_COLORS.length) % TRACK_COLORS.length,
                  inst:(typeof t.inst === "string" ? t.inst : "").slice(0, 64), fam:String(t.fam || "").slice(0, 12), vol:clamp(typeof t.vol === "number" && isFinite(t.vol) ? t.vol : 0.8, 0, 1.25), pan:clamp(+t.pan || 0, -1, 1), mute:!!t.mute, solo:!!t.solo,
                  send:clamp(+t.send || 0, 0, 1), eq:[0, 1, 2].map(function(i){ return clamp(+(t.eq || [])[i] || 0, -12, 12); }), oct:clamp(t.oct | 0, -3, 3), regions:[] };
        (Array.isArray(t.regions) ? t.regions : []).slice(0, 400).forEach(function(r){
          if(!r || !(r.l > 0) || !(r.s >= 0)) return;
          var q = { id:String(r.id || uid("r")), s:Math.round(r.s), l:Math.round(r.l) };
          if(r.name) q.name = String(r.name).slice(0, 32);
          if(t.kind === "audio"){
            q.takes = (Array.isArray(r.takes) ? r.takes : []).map(String).slice(0, 12); q.act = clamp(r.act | 0, 0, Math.max(0, q.takes.length - 1));
            q.off = Math.max(0, +r.off || 0); q.fi = clamp(+r.fi || 0, 0, 30); q.fo = clamp(+r.fo || 0, 0, 30); q.gain = clamp(+r.gain || 0, -24, 12);
            if(!q.takes.length) return;
          } else {
            var p = pats[r.pat]; if(!p || !Array.isArray(p.notes)) return;
            q.pat = String(r.pat); q.off = Math.max(0, Math.round(+r.off || 0));
            if(!o.pats[q.pat]){
              var np = { len:Math.max(PPQ / 4, Math.round(+p.len || bt)), notes:[] };
              p.notes.slice(0, 6000).forEach(function(x){
                if(!x || !(x.l > 0) || !(x.s >= 0) || !(x.p >= 0 && x.p <= 127)) return;
                var y = { s:Math.round(x.s), l:Math.max(1, Math.round(x.l)), p:x.p | 0, v:clamp(x.v | 0 || 90, 1, 127) };
                if(x.m) y.m = 1; if(x.c) y.c = clamp(x.c | 0, -60, 60);
                np.notes.push(y);
              });
              np.notes.sort(function(a, b){ return a.s - b.s || a.p - b.p; });
              o.pats[q.pat] = np;
            }
            if(r.hum && r.hum.take) q.hum = { take:String(r.hum.take), timing:["raw", "feel", "tidy", "strict"].indexOf(r.hum.timing) >= 0 ? r.hum.timing : "tidy", pitch:r.hum.pitch === "key" ? "key" : "semi",
                                              octave:clamp(r.hum.octave | 0, -4, 4), origin:+r.hum.origin || 0, grid:r.hum.grid | 0, edited:!!r.hum.edited,
                                              shift:clamp(r.hum.shift | 0, -6, 6), semi:clamp(r.hum.semi | 0, -24, 24) };
            if(r.drum && typeof r.drum === "object" && r.drum.feel) q.drum = { feel:String(r.drum.feel).slice(0, 16), vari:clamp(r.drum.vari | 0, 0, 2), fill:!!r.drum.fill, edited:!!r.drum.edited };
            if(r.gen && typeof r.gen === "object") q.gen = { style:String(r.gen.style || "held").slice(0, 16) };
          }
          n.regions.push(q);
        });
        n.regions.sort(function(a, b){ return a.s - b.s; });
        o.tracks.push(n);
      });
      o.bars = clamp(Math.max(s.bars | 0, 16, Math.ceil(songTicks(o) / bt) + 4), 16, 999);
      return o;
    }

    // ---- the database: firstloop-studio ----
    // songs {id, name, updated, created, data}; audio {id, song, sr, pcm:Int16Array, an, name, made}; vers {k, song, t, label, data};
    // kv (settings, latency by device); files (instrument files by address, so a second visit needs no network)
    function idb(){
      if(dbP) return dbP;
      dbP = new Promise(function(res){
        try {
          var rq = window.indexedDB.open(DBNAME, 1);
          rq.onupgradeneeded = function(){
            var d = rq.result;
            d.createObjectStore("songs", { keyPath:"id" });
            d.createObjectStore("audio", { keyPath:"id" }).createIndex("song", "song");
            d.createObjectStore("vers", { keyPath:"k", autoIncrement:true }).createIndex("song", "song");
            d.createObjectStore("kv"); d.createObjectStore("files");
          };
          rq.onsuccess = function(){ res(rq.result); };
          rq.onerror = rq.onblocked = function(){ dbBad = true; res(null); };
        } catch(e){ dbBad = true; res(null); }
      });
      return dbP;
    }
    function tx(store, mode, fn){
      return idb().then(function(d){
        if(!d) return fn(null);
        return new Promise(function(res, rej){
          var out, t;
          try { t = d.transaction(store, mode); } catch(e){ rej(e); return; }
          t.oncomplete = function(){ res(out); }; t.onerror = t.onabort = function(){ rej(t.error || new Error("storage")); };
          var r = fn(t.objectStore(store));
          if(r && "onsuccess" in r) r.onsuccess = function(){ out = r.result; }; else out = r;
        });
      });
    }
    function dbGet(store, key){ return tx(store, "readonly", function(os){ return os ? os.get(key) : memStore[store][key]; }).then(function(v){ return v === undefined ? null : v; }, function(){ return null; }); }
    function dbPut(store, val, key){
      return tx(store, "readwrite", function(os){
        if(!os){ memStore[store][key !== undefined ? key : (val.id || val.k || (val.k = uid("k")))] = val; return true; }
        return key !== undefined ? os.put(val, key) : os.put(val);
      });
    }
    function dbDel(store, key){ return tx(store, "readwrite", function(os){ if(!os){ delete memStore[store][key]; return true; } return os["delete"](key); }).catch(function(){}); }
    function dbAll(store){ return tx(store, "readonly", function(os){ return os ? os.getAll() : Object.keys(memStore[store]).map(function(k){ return memStore[store][k]; }); }).then(function(v){ return v || []; }, function(){ return []; }); }
    function dbBySong(store, song){
      return tx(store, "readonly", function(os){
        if(!os) return Object.keys(memStore[store]).map(function(k){ return memStore[store][k]; }).filter(function(v){ return v.song === song; });
        return os.index("song").getAll(song);
      }).then(function(v){ return v || []; }, function(){ return []; });
    }

    // ---- saving, by itself ----
    function saveNowS(){
      clearTimeout(saveTimer); saveTimer = null;
      if(!S) return Promise.resolve();
      REC.updated = Date.now();
      var rec = { id:S.id, name:S.name, updated:REC.updated, created:REC.created || REC.updated, data:JSON.parse(JSON.stringify(S)) };
      saveState = "saving"; emit("save", saveState);
      return dbPut("songs", rec).then(function(){
        saveState = dbBad ? "memory" : "saved"; emit("save", saveState);
        try { window.localStorage.setItem("firstloop.studio.last", S.id); } catch(e){}
      }, function(){ saveState = "failed"; emit("save", saveState); });
    }
    function saveSoon(){ saveState = "saving"; emit("save", saveState); clearTimeout(saveTimer); saveTimer = setTimeout(saveNowS, 700); }
    function hist(){ return HIST[S.id] || (HIST[S.id] = { u:[], r:[], last:JSON.stringify(S) }); }
    // call after a change that should be one step of Undo
    function commit(label, quiet){
      var h = hist(), j = JSON.stringify(S);
      if(j === h.last) return false;
      h.u.push({ j:h.last, l:label || "change" }); if(h.u.length > 400) h.u.shift();
      var bytes = 0, i; for(i = h.u.length - 1; i >= 0; i--){ bytes += h.u[i].j.length; if(bytes > 6e7){ h.u.splice(0, i + 1); break; } }
      h.r.length = 0; h.last = j;
      if(!S.started && S.tracks.length){ S.started = true; h.last = JSON.stringify(S); }
      saveSoon();
      emit("change", { what:label || "change" });
      if(!quiet) refresh();
      return true;
    }
    // a change that is kept but is not a step of Undo (loop on or off, the click)
    function touch(){ var h = hist(); h.last = JSON.stringify(S); saveSoon(); }
    function undo(){
      var h = hist(); if(!h.u.length){ tell("Nothing to undo."); return false; }
      var e = h.u.pop(); h.r.push({ j:h.last, l:e.l }); h.last = e.j; S = JSON.parse(e.j);
      afterSwap(); tell("Undone: " + e.l + "."); emit("change", { what:"undo" }); return true;
    }
    function redo(){
      var h = hist(); if(!h.r.length){ tell("Nothing to redo."); return false; }
      var e = h.r.pop(); h.u.push({ j:h.last, l:e.l }); h.last = e.j; S = JSON.parse(e.j);
      afterSwap(); tell("Redone: " + e.l + "."); emit("change", { what:"redo" }); return true;
    }
    function afterSwap(){
      saveSoon();
      if(typeof selFix === "function") selFix();
      if(typeof engSync === "function") engSync();
      // the song is a new object now: everything on the screen that held on to a track or a region is built again
      if(typeof toolSig !== "undefined") toolSig = "";
      if(UI.e && UI.e.humbar) UI.e.humbar.dataset["for"] = "";
      refresh(true);
    }

    // ---- songs: list, open, new, rename, duplicate, delete, versions ----
    function listSongs(){
      return dbAll("songs").then(function(rows){
        return rows.map(function(r){ var d = r.data || {}; return { id:r.id, name:r.name, updated:r.updated, created:r.created, tempo:d.tempo, bars:d.bars, tracks:(d.tracks || []).length, open:!!(S && S.id === r.id) }; })
          .sort(function(a, b){ return b.updated - a.updated; });
      });
    }
    function uniqueSongName(base, rows){
      var names = {}; rows.forEach(function(r){ names[r.name] = 1; });
      if(!names[base]) return base;
      for(var i = 2; i < 999; i++) if(!names[base + " " + i]) return base + " " + i;
      return base;
    }
    function useSong(s, rec){
      if(typeof transportStop === "function") transportStop(true);
      S = s; REC = { updated:rec ? rec.updated : Date.now(), created:rec ? rec.created : Date.now() };
      hist();
      try { window.localStorage.setItem("firstloop.studio.last", S.id); } catch(e){}
      if(typeof selClear === "function") selClear();
      if(typeof engSync === "function") engSync();
      if(MOB.lean && typeof unloadUnused === "function") unloadUnused();      // a phone lets go of the last song's instruments
      emit("song", { id:S.id, name:S.name });
      refresh(true);
    }
    function openSong(id){
      var before = S ? saveNowS() : Promise.resolve();
      return before.then(function(){ return dbGet("songs", id); }).then(function(rec){
        var s = rec && fixSong(rec.data);
        if(!s) return false;
        s.id = rec.id; useSong(s, rec); return true;
      });
    }
    function createSong(name){
      var before = S ? saveNowS() : Promise.resolve();
      return before.then(listSongs).then(function(rows){
        var s = newSong(uniqueSongName(name || "New song", rows));
        useSong(s, null); return saveNowS().then(function(){ return s.id; });
      });
    }
    function renameSong(id, name){
      name = String(name || "").trim().slice(0, 60); if(!name) return Promise.resolve(false);
      if(S && S.id === id){ S.name = name; touch(); emit("song", { id:S.id, name:name }); refresh(); return saveNowS().then(function(){ return true; }); }
      return dbGet("songs", id).then(function(rec){ if(!rec) return false; rec.name = name; if(rec.data) rec.data.name = name; return dbPut("songs", rec).then(function(){ return true; }); });
    }
    function copyAudioOf(fromSong, toSong, map){
      // recordings are copied too, so deleting one song never empties another
      return dbBySong("audio", fromSong).then(function(rows){
        return Promise.all(rows.map(function(a){
          var b = { id:uid("a"), song:toSong, sr:a.sr, pcm:a.pcm, an:a.an, name:a.name, made:a.made, lat:a.lat };
          map[a.id] = b.id; return dbPut("audio", b);
        }));
      });
    }
    function remapTakes(s, map){
      s.tracks.forEach(function(t){ t.regions.forEach(function(r){
        if(r.takes) r.takes = r.takes.map(function(x){ return map[x] || x; });
        if(r.hum && map[r.hum.take]) r.hum.take = map[r.hum.take];
      }); });
    }
    function duplicateSong(id){
      var before = S && S.id === id ? saveNowS() : Promise.resolve();
      return before.then(function(){ return Promise.all([dbGet("songs", id), listSongs()]); }).then(function(a){
        var rec = a[0]; if(!rec) return null;
        var s = fixSong(rec.data), map = {}; s.id = uid("s"); s.name = uniqueSongName(rec.name + " copy", a[1]);
        return copyAudioOf(id, s.id, map).then(function(){
          remapTakes(s, map);
          return dbPut("songs", { id:s.id, name:s.name, updated:Date.now(), created:Date.now(), data:s });
        }).then(function(){ return s.id; });
      });
    }
    function deleteSong(id){
      return Promise.all([dbBySong("audio", id), dbBySong("vers", id)]).then(function(a){
        return Promise.all(a[0].map(function(x){ return dbDel("audio", x.id); }).concat(a[1].map(function(x){ return dbDel("vers", x.k); })));
      }).then(function(){ return dbDel("songs", id); }).then(function(){
        delete HIST[id];
        if(S && S.id === id){
          S = null;
          return listSongs().then(function(rows){ return rows.length ? openSong(rows[0].id) : createSong(); });
        }
      });
    }
    function saveVersion(label, data, tok){
      if(!S) return Promise.resolve();
      var v = { song:S.id, t:Date.now(), label:String(label || "Version").slice(0, 60), data:data || JSON.parse(JSON.stringify(S)) }; if(tok) v.tok = tok;
      return dbPut("vers", v).then(function(){
        return dbBySong("vers", S.id).then(function(rows){
          rows.sort(function(a, b){ return b.t - a.t; });
          return Promise.all(rows.slice(30).map(function(r){ return dbDel("vers", r.k); }));
        });
      });
    }
    function listVersions(){ return S ? dbBySong("vers", S.id).then(function(rows){ return rows.sort(function(a, b){ return b.t - a.t; }).map(function(r){ return { k:r.k, t:r.t, label:r.label }; }); }) : Promise.resolve([]); }
    function restoreVersion(k){
      return dbGet("vers", k).then(function(v){
        if(!v || !S || v.song !== S.id) return false;
        var s = fixSong(v.data); if(!s) return false;
        s.id = S.id; s.name = S.name; S = s;
        commit("go back to “" + v.label + "”"); afterSwap(); return true;
      });
    }

    // ---- tracks, regions, patterns ----
    function trackById(id){ for(var i = 0; i < S.tracks.length; i++) if(S.tracks[i].id === id) return S.tracks[i]; return null; }
    function findRegion(id){
      for(var i = 0; i < S.tracks.length; i++) for(var j = 0; j < S.tracks[i].regions.length; j++)
        if(S.tracks[i].regions[j].id === id) return { t:S.tracks[i], r:S.tracks[i].regions[j], ti:i, ri:j };
      return null;
    }
    function patOf(r){ return r && r.pat ? S.pats[r.pat] : null; }
    function newPat(len, notes){ var id = uid("p"); S.pats[id] = { len:len, notes:notes || [] }; return id; }
    function linkCount(pid){ var n = 0; S.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.pat === pid) n++; }); }); return n; }
    function sortNotes(p){ p.notes.sort(function(a, b){ return a.s - b.s || a.p - b.p; }); }
    function sortRegions(t){ t.regions.sort(function(a, b){ return a.s - b.s; }); }
    function gcPats(){
      var used = {}; S.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.pat) used[r.pat] = 1; }); });
      Object.keys(S.pats).forEach(function(k){ if(!used[k]) delete S.pats[k]; });
    }
    function growBars(){
      var need = Math.ceil(songTicks() / barTicks()) + 4;
      S.sections.forEach(function(q){ if(q.bar + q.len + 2 > need) need = q.bar + q.len + 2; });
      if(need > S.bars) S.bars = Math.min(999, need);
    }
    // every sounding note of a region between two song ticks: fn(start, length, pitch, velocity, note)
    function eachNote(r, a, b, fn){
      var p = patOf(r); if(!p || !p.notes.length) return;
      var P = Math.max(1, p.len), off = r.off || 0, end = r.s + r.l, k0 = Math.floor((Math.max(a, r.s) - r.s + off) / P), k, i, n, s, l;
      for(k = Math.max(0, k0 - 1); ; k++){
        var base = r.s + k * P - off;
        if(base >= end || base >= b) break;
        for(i = 0; i < p.notes.length; i++){
          n = p.notes[i]; s = base + n.s;
          if(n.s >= P) continue;                          // beyond the part's own length: kept, not played
          if(s < r.s || s >= end || s < a || s >= b) continue;
          l = Math.min(n.l, end - s);
          fn(s, l, n.p, n.v, n);
        }
      }
    }
    // the notes of a region as they sound, written out (loops unrolled) in ticks from its start
    function flatNotes(r, a, b){
      var out = []; a = a === undefined ? r.s : a; b = b === undefined ? r.s + r.l : b;
      eachNote(r, a, b, function(s, l, p, v, n){ var q = { s:s - a, l:Math.min(l, b - s), p:p, v:v }; if(n.m) q.m = 1; if(n.c) q.c = n.c; out.push(q); });
      return out;
    }
    function addTrack(kind, inst, name){
      if(S.tracks.length >= MAXTRACKS){ tell("A song has room for " + MAXTRACKS + " tracks. Remove one to add another."); return null; }
      var t = newTrack(kind, inst, name); S.tracks.push(t); return t;
    }
    function addRegion(t, s, l, notes){
      var r = { id:uid("r"), s:Math.max(0, Math.round(s)), l:Math.max(PPQ / 4, Math.round(l)) };
      if(t.kind === "audio"){ r.takes = []; r.act = 0; r.off = 0; r.fi = 0; r.fo = 0; r.gain = 0; }
      else { r.pat = newPat(r.l, notes || []); r.off = 0; sortNotes(S.pats[r.pat]); }
      t.regions.push(r); sortRegions(t); growBars(); return r;
    }
    function cloneRegion(r, linked){
      var q = JSON.parse(JSON.stringify(r)); q.id = uid("r");
      if(r.pat && !linked){ var p = S.pats[r.pat]; q.pat = newPat(p.len, JSON.parse(JSON.stringify(p.notes))); }
      return q;
    }
    function unlinkRegion(r){ if(!r.pat || linkCount(r.pat) < 2) return false; var p = S.pats[r.pat]; r.pat = newPat(p.len, JSON.parse(JSON.stringify(p.notes))); return true; }
    // cut a region in two at a song tick; the two halves are independent afterwards
    function splitRegion(t, r, at){
      at = Math.round(at); if(at <= r.s || at >= r.s + r.l) return null;
      var b = { id:uid("r"), s:at, l:r.s + r.l - at };
      if(r.name) b.name = r.name;
      if(t.kind === "audio"){
        b.takes = r.takes.slice(); b.act = r.act; b.off = (r.off || 0) + tickSec(at - r.s); b.fi = 0; b.fo = r.fo || 0; b.gain = r.gain || 0;
        r.fo = 0;
      } else {
        var na = flatNotes(r, r.s, at), nb = flatNotes(r, at, r.s + r.l);
        b.pat = newPat(b.l, nb); b.off = 0;
        r.pat = newPat(at - r.s, na); r.off = 0;
        if(r.hum){ b.hum = JSON.parse(JSON.stringify(r.hum)); b.hum.origin = r.hum.origin + tickSec(at - r.s); b.hum.edited = true; r.hum.edited = true; }
        delete r.gen;
      }
      r.l = at - r.s;
      t.regions.push(b); sortRegions(t); return b;
    }
    function removeRegion(t, r){ var i = t.regions.indexOf(r); if(i >= 0) t.regions.splice(i, 1); }
    // regions of one track never overlap: whatever a moved or new region covers gives way
    function clearUnder(t, keep){
      var a = keep.s, b = keep.s + keep.l;
      t.regions.slice().forEach(function(r){ if(r !== keep && r.s < a && r.s + r.l > a) splitRegion(t, r, a); });
      t.regions.slice().forEach(function(r){ if(r !== keep && r.s < b && r.s + r.l > b) splitRegion(t, r, b); });
      t.regions = t.regions.filter(function(r){ return r === keep || r.s >= b || r.s + r.l <= a; });
      sortRegions(t);
    }
    // ---- time: sections and whole-song edits ----
    function splitAllAt(tick){ S.tracks.forEach(function(t){ t.regions.slice().forEach(function(r){ if(r.s < tick && r.s + r.l > tick) splitRegion(t, r, tick); }); }); }
    function shiftFrom(tick, by){
      S.tracks.forEach(function(t){ t.regions.forEach(function(r){ if(r.s >= tick) r.s += by; }); });
      S.chords.forEach(function(c){ if(c.t >= tick) c.t += by; });
    }
    function copyRange(a, b, to){
      S.tracks.forEach(function(t){
        t.regions.slice().forEach(function(r){
          if(r.s >= a && r.s + r.l <= b){ var q = cloneRegion(r, false); q.s = r.s - a + to; t.regions.push(q); }
        });
        sortRegions(t);
      });
      S.chords.slice().forEach(function(c){ if(c.t >= a && c.t < b) S.chords.push({ t:c.t - a + to, root:c.root, q:c.q }); });
      S.chords.sort(function(x, y){ return x.t - y.t; });
    }
    function removeRange(a, b){
      S.tracks.forEach(function(t){ t.regions = t.regions.filter(function(r){ return !(r.s >= a && r.s + r.l <= b); }); });
      S.chords = S.chords.filter(function(c){ return c.t < a || c.t >= b; });
    }
    function sectionAt(bar){ for(var i = 0; i < S.sections.length; i++){ var q = S.sections[i]; if(bar >= q.bar && bar < q.bar + q.len) return q; } return null; }
    function addSection(name, bar, len){
      var bt = barTicks(), last = S.sections[S.sections.length - 1];
      if(bar === undefined) bar = last ? last.bar + last.len : 0;
      len = len || 4;
      // fit into the gap that is there
      var next = null; S.sections.forEach(function(q){ if(q.bar >= bar && (!next || q.bar < next.bar)) next = q; });
      var inside = sectionAt(bar);
      if(inside){ bar = last.bar + last.len; next = null; }
      if(next && bar + len > next.bar) len = next.bar - bar;
      if(len < 1) return null;
      var used = {}; S.sections.forEach(function(q){ used[q.name] = 1; });
      var names = ["Intro", "Verse", "Chorus", "Verse 2", "Chorus 2", "Bridge", "Chorus 3", "Outro"], nm = name;
      if(!nm){ nm = "Section"; for(var i = 0; i < names.length; i++) if(!used[names[i]]){ nm = names[i]; break; } }
      var q2 = { id:uid("c"), name:String(nm).slice(0, 24), bar:bar, len:len };
      S.sections.push(q2); S.sections.sort(function(a, b){ return a.bar - b.bar; }); growBars(); void bt;
      return q2;
    }
    function duplicateSection(id){
      var q = S.sections.filter(function(x){ return x.id === id; })[0]; if(!q) return null;
      var bt = barTicks(), a = q.bar * bt, b = (q.bar + q.len) * bt;
      splitAllAt(a); splitAllAt(b);
      shiftFrom(b, b - a);
      S.sections.forEach(function(x){ if(x.bar >= q.bar + q.len) x.bar += q.len; });
      copyRange(a, b, b);
      var base = q.name.replace(/\s+\d+$/, ""), n = 2, used = {}; S.sections.forEach(function(x){ used[x.name] = 1; });
      while(used[base + " " + n]) n++;
      var c = { id:uid("c"), name:(base + " " + n).slice(0, 24), bar:q.bar + q.len, len:q.len };
      S.sections.push(c); S.sections.sort(function(x, y){ return x.bar - y.bar; }); growBars();
      return c;
    }
    function deleteSection(id, withContent){
      var i = -1; S.sections.forEach(function(x, k){ if(x.id === id) i = k; }); if(i < 0) return false;
      var q = S.sections[i], bt = barTicks(), a = q.bar * bt, b = (q.bar + q.len) * bt;
      S.sections.splice(i, 1);
      if(withContent){
        splitAllAt(a); splitAllAt(b); removeRange(a, b); shiftFrom(b, a - b);
        S.sections.forEach(function(x){ if(x.bar >= q.bar + q.len) x.bar -= q.len; });
      }
      return true;
    }
    // swap a section with the one after it (dir 1) or before it (dir -1), music and all
    function moveSection(id, dir){
      var i = -1; S.sections.forEach(function(x, k){ if(x.id === id) i = k; });
      var j = i + dir; if(i < 0 || j < 0 || j >= S.sections.length) return false;
      var A = S.sections[Math.min(i, j)], B = S.sections[Math.max(i, j)], bt = barTicks();
      var a0 = A.bar * bt, a1 = (A.bar + A.len) * bt, b0 = B.bar * bt, b1 = (B.bar + B.len) * bt, gap = b0 - a1, la = a1 - a0, lb = b1 - b0;
      [a0, a1, b0, b1].forEach(splitAllAt);
      function mv(x){ if(x >= a0 && x < a1) return x + lb + gap; if(x >= a1 && x < b0) return x + lb - la; if(x >= b0 && x < b1) return x - la - gap; return x; }
      S.tracks.forEach(function(t){ t.regions.forEach(function(r){ r.s = mv(r.s); }); sortRegions(t); });
      S.chords.forEach(function(c){ c.t = mv(c.t); }); S.chords.sort(function(x, y){ return x.t - y.t; });
      var ab = A.bar; B.bar = ab; A.bar = ab + B.len + gap / bt;
      S.sections.sort(function(x, y){ return x.bar - y.bar; });
      return true;
    }
    // ---- changing the song's time signature or tempo keeps what is there ----
    function setTempo(bpm){
      bpm = clamp(Math.round(bpm), 40, 220); if(bpm === S.tempo) return false;
      var ratio = bpm / S.tempo;
      // recordings keep their own speed: their length in bars changes with the tempo
      S.tracks.forEach(function(t){ if(t.kind === "audio") t.regions.forEach(function(r){ r.l = Math.max(1, Math.round(r.l * ratio)); }); });
      S.tempo = bpm; return true;
    }
    function hasAudio(){ return S.tracks.some(function(t){ return t.kind === "audio" && t.regions.length; }); }
    function scaleOf(k){ k = k || S.key; if(!k || k.root === null || k.scale === "none") return null; return (k.scale === "minor" ? [0, 2, 3, 5, 7, 8, 10] : [0, 2, 4, 5, 7, 9, 11]).map(function(x){ return (x + k.root) % 12; }); }
    function inScale(p, k){ var sc = scaleOf(k); return !sc || sc.indexOf(((p % 12) + 12) % 12) >= 0; }
    function snapToScale(p, k){ return scaleOf(k) ? dsp().fitKey(p, k || S.key) : p; }
