#!/usr/bin/env python3
# The edits to existing code that the Studio needs (run once on a clean v33 index.html). usage: hooks.py <index.html>
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
n0 = len(s)
def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (a[:80], s.count(a))
    s = s.replace(a, b)
# 1. setView
rep('''    if(["make","mix","dj","learn","songs","assistant"].indexOf(v) < 0) v = "make";''',
    '''    if(["make","mix","dj","learn","songs","assistant","studio"].indexOf(v) < 0) v = "make";''')
rep('''    if(typeof djOnView === "function") djOnView(v);
    if(typeof wsStartSize === "function") wsStartSize();''',
    '''    if(typeof djOnView === "function") djOnView(v);
    if(typeof studioOnView === "function") studioOnView(v);
    if(typeof wsStartSize === "function") wsStartSize();''')
# 2. the sequencer starting stops the Studio
rep('''    if(typeof DJ !== "undefined" && DJ) DJ._seqStart();        // the decks and the sequencer never play together
''', '''    if(typeof DJ !== "undefined" && DJ) DJ._seqStart();        // the decks and the sequencer never play together
    if(typeof studioQuiet === "function") studioQuiet();       // nor the Studio
''')
rep('''    if(playing) stop();
    if(typeof DJ !== "undefined" && DJ) DJ._seqStart();
''', '''    if(playing) stop();
    if(typeof DJ !== "undefined" && DJ) DJ._seqStart();
    if(typeof studioQuiet === "function") studioQuiet();
''')
# 3. MIDI
rep('''    if(typeof equipOnMIDI === "function") equipOnMIDI(e);     // the monitor and the activity light see everything
    if(took) return;
''', '''    if(typeof equipOnMIDI === "function") equipOnMIDI(e);     // the monitor and the activity light see everything
    if(took) return;
    if(typeof studioOnMIDI === "function" && studioOnMIDI(e)) return;   // in the Studio a keyboard plays the selected track
''')
# 4. keys
rep('''    if(wsIs("dj")) return;
    if(e.code === "Space" && !e.target.closest(".pad, .cliptap")){''', '''    if(wsIs("dj") || view === "studio") return;
    if(e.code === "Space" && !e.target.closest(".pad, .cliptap")){''')
# 5. backup
rep('''      return djp.then(function(dj){
        if(dj) data.dj = dj;
        return new Blob([JSON.stringify(data)], { type:"application/json" });
      });''', '''      // the Studio's songs go along too: everything but the recordings themselves
      var stp = (!only && typeof studioBackupOut === "function") ? studioBackupOut() : Promise.resolve(null);
      return Promise.all([djp, stp]).then(function(both){
        if(both[0]) data.dj = both[0];
        if(both[1]) data.studio = both[1];
        return new Blob([JSON.stringify(data)], { type:"application/json" });
      });''')
rep('''      if(data.dj && typeof DJ !== "undefined" && DJ) DJ._backupIn(data.dj);
''', '''      if(data.dj && typeof DJ !== "undefined" && DJ) DJ._backupIn(data.dj);
      if(data.studio && typeof studioBackupIn === "function") studioBackupIn(data.studio);
''')
# 6. assistant layout and first run
rep('''    if(wide && view === "assistant") setView("make");''', '''    if(wide && view === "assistant") setView(typeof wsHome === "function" ? wsHome() : "make");''')
rep('''    if(wsIs("dj")){ wsFirstRun(); return; }''', '''    if(wsIs("dj")){ wsFirstRun(); return; }
    if(wsIs("write")){ if(!profile.done){ profile.done = true; saveProfile(); } return; }''')
rep('''    if(profile.done){ setupGear(); if(!wsIs("dj")) firstWords(); }''', '''    if(profile.done){ setupGear(); if(!wsIs("dj") && !wsIs("write")) firstWords(); }''')
# 7. workspace
rep('''  var WS_NAMES = { dj:"DJ", make:"Produce", all:"Everything" };
  var WS_SAYS = { dj:"The decks, the mixer, your library and the Assistant.", make:"Make, Mix, Learn and My songs.", all:"Both, side by side." };''',
'''  var WS_NAMES = { dj:"DJ", make:"Produce", write:"Songwriter", all:"Everything" };
  var WS_SAYS = { dj:"The decks, the mixer, your library and the Assistant.", make:"Make, Mix, Learn and My songs.",
                  write:"The Studio: hum a part, hear it on an instrument, record your voice.", all:"DJ and Produce, side by side." };
  var WS_ORDER = ["dj", "make", "write", "all"];
  function wsHome(){ return workspace === "dj" ? "dj" : workspace === "write" ? "studio" : "make"; }
  // is this area part of that workspace ("Everything" is what was there before the Studio, which has a workspace of its own)
  function wsHas(w, v){ return w === "dj" ? v === "dj" : w === "write" ? v === "studio" : w === "make" ? (v !== "dj" && v !== "studio") : v !== "studio"; }''')
rep('''    var m = /^#(dj|produce|everything)$/i.exec(String(window.location.hash || ""));
    if(m){
      workspace = ({ dj:"dj", produce:"make", everything:"all" })[m[1].toLowerCase()]; wsChosen = true; wsLinked = true;''',
'''    var m = /^#(dj|produce|everything|write)$/i.exec(String(window.location.hash || ""));
    if(m){
      workspace = ({ dj:"dj", produce:"make", everything:"all", write:"write" })[m[1].toLowerCase()]; wsChosen = true; wsLinked = true;''')
rep('''    if(workspace === "all" || v === "assistant") return v;
    if((workspace === "dj") === (v === "dj")) return v;
    if(booting) return workspace === "dj" ? "dj" : "make";
    var name = ({ make:"Make", mix:"Mix", learn:"Learn", songs:"My songs", dj:"The DJ area" })[v] || v, was = WS_NAMES[workspace];''',
'''    if(v === "assistant" || wsHas(workspace, v)) return v;
    if(booting) return wsHome();
    // the Studio is the Songwriter workspace: opening it from anywhere else goes there
    if(v === "studio"){ wsSet("write"); return v; }
    var name = ({ make:"Make", mix:"Mix", learn:"Learn", songs:"My songs", dj:"The DJ area" })[v] || v, was = WS_NAMES[workspace];''')
rep('''    if(w === "dj" && playing){ try { stop(); } catch(e2){} }
    if(w === "dj" && view !== "dj" && view !== "assistant") setView("dj");
    else if(w === "make" && view === "dj") setView("make");''',
'''    if((w === "dj" || w === "write") && playing){ try { stop(); } catch(e2){} }
    if(w !== "write" && typeof studioQuiet === "function") studioQuiet();
    if(w === "dj" && view !== "dj" && view !== "assistant") setView("dj");
    else if(w === "write" && view !== "studio" && view !== "assistant") setView("studio");
    else if(w !== "write" && view === "studio") setView(w === "dj" ? "dj" : "make");
    else if(w === "make" && view === "dj") setView("make");''')
rep('''      : w === "make" ? "Produce workspace: the DJ area is not shown. The Workspace button brings it back."
      : "Everything is shown again.");''', '''      : w === "make" ? "Produce workspace: the DJ area is not shown. The Workspace button brings it back."
      : w === "write" ? "Songwriter workspace: the top bar shows the Studio and the Assistant. The Workspace button brings the DJ area and the rest back."
      : "Everything is shown again.");''')
rep('''    ["dj", "make", "all"].forEach(function(k){
      var b = mk("button"); b.type = "button"; b.setAttribute("role", "menuitemradio");''', '''    WS_ORDER.forEach(function(k){
      var b = mk("button"); b.type = "button"; b.setAttribute("role", "menuitemradio");''')
rep('''      var list = ["dj", "make", "all"].map(function(k){ return E.items[k]; }), i = list.indexOf(document.activeElement);''',
    '''      var list = WS_ORDER.map(function(k){ return E.items[k]; }), i = list.indexOf(document.activeElement);''')
rep('''      ["dj", "make", "all"].forEach(function(k){
        var b = mk("button", "", WS_NAMES[k]); b.type = "button"; b.title = WS_SAYS[k];''', '''      WS_ORDER.forEach(function(k){
        var b = mk("button", "", WS_NAMES[k]); b.type = "button"; b.title = WS_SAYS[k];''')
rep('''    if(workspace === "all" || !e) return true;
    var isDj = e.ws === "dj" || /^dj/.test(e.id || "") || e.id === "godj";
    if(workspace === "make") return !isDj;''', '''    if(!e) return true;
    // what belongs to the Studio is listed in its own workspace and in Everything (choosing it goes there)
    if(e.ws === "write") return workspace === "write" || workspace === "all";
    if(workspace === "all") return true;
    if(workspace === "write") return e.ws === "any" || e.id === "theme" || e.id === "wish" || e.id === "report" || (e.kind === "word" && !!WS_PAL_WORDS[String(e.id).replace(/^w-/, "")] && e.ws !== "dj");
    var isDj = e.ws === "dj" || /^dj/.test(e.id || "") || e.id === "godj";
    if(workspace === "make") return !isDj;''')
rep('''    [["wsdj", "dj", "Show only the DJ side"], ["wsmake", "make", "Show only the production side"], ["wsall", "all", "Show everything"]].forEach(function(w){''',
    '''    [["wsdj", "dj", "Show only the DJ side"], ["wsmake", "make", "Show only the production side"], ["wswrite", "write", "Show the Songwriter studio"], ["wsall", "all", "Show everything"]].forEach(function(w){''')
rep('''      palAdd(w[0], w[2], "Workspace: " + WS_NAMES[w[1]], "workspace, view, mode, layout, hide, show, dj only, produce, everything, simple, tabs", "top", ["body"], { run:function(){ wsSet(w[1]); }, ws:"any" });''',
    '''      palAdd(w[0], w[2], "Workspace: " + WS_NAMES[w[1]], "workspace, view, mode, layout, hide, show, dj only, produce, everything, simple, tabs" + (w[1] === "write" ? ", songwriter, studio, singer, hum, write a song" : ""), "top", ["body"], { run:function(){ wsSet(w[1]); }, ws:"any" });''')
rep('''    if(workspace === "dj"){
      setView("dj");
      wsStartBuild();''', '''    if(workspace === "write") setView("studio");
    if(workspace === "dj"){
      setView("dj");
      wsStartBuild();''')
open(p, 'w', encoding='utf-8').write(s)
print('hooks applied, bytes added', len(s) - n0)
