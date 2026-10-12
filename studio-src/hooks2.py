#!/usr/bin/env python3
# The Assistant in the Studio, the usage counters and the tester role: edits to existing code (run after hooks.py).
# usage: hooks2.py <index.html>
import sys, os, json
here = os.path.dirname(os.path.abspath(__file__))
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
n0 = len(s)


def rep(a, b, cnt=1):
    global s
    assert s.count(a) == cnt, (a[:90], s.count(a))
    s = s.replace(a, b)


WRITE = open(os.path.join(here, 'write_prompt.txt'), encoding='utf-8').read().rstrip('\n')
WRITE_LINES = ''.join('    ' + json.dumps(l, ensure_ascii=False) + ',\n' for l in WRITE.split('\n'))
ANCHOR = '    "@@ core",\n    "",\n    "RULES FOR CHANGES",\n'
rep(ANCHOR, WRITE_LINES + ANCHOR)
rep('"- Top bar: Play, Tempo, Find (Ctrl+K; locates any control), Equipment, Setup. Areas: Make, Mix, DJ (decks, a mixer, a track library), Learn, My songs.",',
    '"- Top bar: Play, Tempo, Find (Ctrl+K; locates any control), Equipment, Setup. Areas: Make, Mix, DJ (decks, a mixer, a track library), Learn, My songs; and the Studio, in the Songwriter workspace: hum a part, hear it on a recorded instrument, add chords and drums, record a voice.",')
rep('means they chose to see only the DJ side of the app, \\"make\\" only the production side. Stay on that side:',
    'means they chose to see only the DJ side of the app, \\"make\\" only the production side, \\"write\\" only the Studio. Stay on that side:')
rep('"go_to {area: \\"make\\", \\"mix\\", \\"dj\\", \\"learn\\" or \\"songs\\"}",', '"go_to {area: \\"make\\", \\"mix\\", \\"dj\\", \\"learn\\", \\"songs\\" or \\"studio\\"}",')
rep('one of beat, bass, chords, melody, arrangement, mix, effects, recording, dj, coaching, library, gear, theory, app_help, export, feedback, other.",',
    'one of beat, bass, chords, melody, arrangement, mix, effects, recording, songwriting, vocals, dj, coaching, library, gear, theory, app_help, export, feedback, other.",')
rep('  // called name (core, gear, make, dj, teach, coach), and one request is sent', '  // called name (core, gear, make, dj, teach, coach, write), and one request is sent')
rep('  var ASST_PROMPT_SETS = { make:["core","gear","make"], dj:["core","gear","dj","teach"], coach:["core","dj","coach"] };',
    '  var ASST_PROMPT_SETS = { make:["core","gear","make"], dj:["core","gear","dj","teach"], coach:["core","dj","coach"], write:["core","write"] };')
rep('  function asstPromptKind(st){\n', '  function asstPromptKind(st){\n    if(st && (st.area === "studio" || (st.area === "assistant" && !!st.write))) return "write";\n')
rep('  var ASST_WIRE = 4;', '''  // From v34 the server says "v": 5: it knows the Studio ("write": the song there, and the
  // w_ actions). A server below 5 is never sent the Studio; plain requests are then done on the page.
  var ASST_WIRE = 5;''')
rep('''  function assistantSongState(wire){
    wire = wire === undefined ? asstWire() : wire;
''', '''  function assistantSongState(wire){
    wire = wire === undefined ? asstWire() : wire;
    if(wire >= 5 && typeof studioAsstOn === "function" && studioAsstOn()) return studioAsstState(wire);
''')
rep('''  function asstApply(actions){
    var out = {''', '''  function asstApply(actions){
    if(typeof studioAsstOn === "function" && studioAsstOn()) return studio().apply(actions);    // the Studio checks and carries out its own
    var out = {''')
rep('''  function asstUndo(msg){
    if(!msg || !msg.u || asstBusy) return;
''', '''  function asstUndo(msg){
    if(!msg || !msg.u || asstBusy) return;
    if(msg.u.studio){
      // a change made in the Studio is undone there, from the copy it kept
      studio().undo(msg.u).then(function(ok){
        if(!ok){ asstNotice("That change can no longer be undone from here: another song is open in the Studio, or its copy is gone. Versions, in the Studio’s song menu, keeps the song as it was."); return; }
        msg.un = true; delete msg.u; LOG.asst.undos++; saveLog(); asstSave(); asstRenderAll(true);
        asstNotice("Undone. The song is back to how it was before that change.");
      });
      return;
    }
''')
rep('''  function asstLocal(text, dry){
''', '''  function asstLocal(text, dry){
    if(typeof studioAsstOn === "function" && studioAsstOn()){
      if(/^(undo|undo that|undo it|put it back)[.!]?$/i.test(text.trim())){ var su = asstLastUndoable(); if(su && dry) return { t:"" }; if(su){ asstUndo(su); return null; } }
      return studio().local(text, dry);
    }
''')
rep('''    asstPick().then(function(mode){
      if(mode === "local"){
        um.loc = true;
        done();
        var r = isSetup''', '''    asstPick().then(function(mode){
      if(typeof studioAsstOld === "function" && studioAsstOld(mode)) mode = "local";
      if(mode === "local"){
        um.loc = true;
        done();
        var r = isSetup''')
rep('''    if(workspace !== "dj") return "";
    return local ? "Try: where is key lock''', '''    if(workspace === "write") return local ? "Try: tempo 92 · too high for me · suggest chords · add piano" : "Try: suggest chords for what I hummed · it is too high for me · add a soft drum beat · make the chorus fuller";
    if(workspace !== "dj") return "";
    return local ? "Try: where is key lock''')
rep('''      view_dj:v.dj, asst_dj:u.asst_dj, asst_diagrams:u.asst_diagrams,''', '''      view_dj:v.dj, asst_dj:u.asst_dj, asst_diagrams:u.asst_diagrams,
      view_studio:v.studio, hum_takes:u.hum_takes, studio_takes:u.studio_takes, studio_exports:u.studio_exports, asst_studio:u.asst_studio,''')
# ---- a tester who is a singer ----
rep('''  var ACCT_ROLES = [["dj", "DJ"], ["producer", "Producer"], ["instrument", "Learning an instrument"], ["curious", "Just curious"]];''',
    '''  var ACCT_ROLES = [["dj", "DJ"], ["singer", "Singer or songwriter"], ["producer", "Producer"], ["instrument", "Learning an instrument"], ["curious", "Just curious"]];''')
rep('''    var body = { op:"signup", name:name, role:role, age_ok:true };''', '''    // a server from before the Studio does not know "singer": it is told "producer", and the page still opens the Studio
    var body = { op:"signup", name:name, role:(role === "singer" && asstWire() < 5) ? "producer" : role, age_ok:true };''')
rep('''  function wsFromRole(role){
    if(role !== "dj" || wsChosen) return;''', '''  function wsFromRole(role){
    if(role === "singer" && !wsChosen){ wsSet("write", { quiet:true }); say("Songwriter workspace: the Studio. Hum a part, hear it on an instrument, record your voice. The Workspace button brings the DJ area and the rest back."); return; }
    if(role !== "dj" || wsChosen) return;''')
rep('''    if(acctOpen === "signup" && wsIs("dj") && !acctE.role.value) acctE.role.value = "dj";''', '''    if(acctOpen === "signup" && wsIs("dj") && !acctE.role.value) acctE.role.value = "dj";
    if(acctOpen === "signup" && wsIs("write") && !acctE.role.value) acctE.role.value = "singer";''')
open(p, 'w', encoding='utf-8').write(s)
print('hooks2 applied, bytes added', len(s) - n0)
