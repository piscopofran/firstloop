  // ===== Studio =====
  // The one area of the Songwriter workspace (body[data-view="studio"], link /#write): write and produce a
  // song without playing an instrument. Self-contained like the DJ area: its own AudioContext, its own
  // database ("firstloop-studio"). All of it is inside studioMake(), which runs the first time the Studio is
  // opened (or a backup needs its songs): before that the page only holds the text of this block.
  // GENERATED: this block is put together from the files in studio-src/ by studio-src/build.py. Edit those, not this.
  //
  // DESIGN
  // Who it is for: a singer. She hears parts in her head and can sing them; she does not play, and a piano
  //   roll is new to her. So her voice is the input device. "Hum a part" is on every instrument track and
  //   in the middle of the empty screen, and what she hummed stays on the grid as a thin line under the
  //   notes it became: the notes are never a black box, and a note that came out differently from what she
  //   meant can be seen against her own voice and dragged.
  // Layout (one screen, no page scroll; the Assistant docks on the right as everywhere else):
  //   +- transport: song v | |< > O | 1.1.1  0:00.0 | loop click count-in | tempo tap | 4/4 | key | undo redo | Mixer Export ? -+
  //   +- track headers (232px) -+- ruler: bars, loop brace / sections / chords ---------------------------------------------------+
  //   |  colour, name           |  regions: blocks with a miniature of their notes, or the waveform of a recording                |
  //   |  instrument  M S rec    |                                                                                                 |
  //   |  volume, pan            |                                                                                                 |
  //   +- editor (its height can be dragged): Notes | Drums | Recording | Chords | Mixer, following what is selected --------------+
  //   |  toolbar; piano keys | grid, her hummed line, notes | velocity lane                                                       |
  //   +---------------------------------------------------------------------------------------------------------------------------+
  // How it is worked:
  //   - One selection: a region in the arrangement and, inside it, notes. The editor always shows the selected region.
  //   - The pointer does everything (move, stretch an end, drag across empty grid to select, double-click to add);
  //     the pencil only draws. Holding Alt while dragging copies; holding Shift while dragging leaves the snap.
  //   - Every action has a button or a menu entry. The keyboard only repeats them (the list is under "?").
  //   - Nothing is modal except a recording in progress. One undo history per song takes in every change, hummed takes too.
  // Look: the app's own tokens (flat greys, hairlines, 13px, tabular numerals). Colour says three things only: which track
  //   something belongs to, what is selected (accent) and what is recording (danger). The canvases read the same CSS
  //   variables, so both themes follow.
  // Data: a song is plain JSON: tracks > regions > patterns of notes ({s,l,p,v} at 480 ticks to the quarter note). Regions
  //   that share a pattern are "linked". Recordings sit beside the song in IndexedDB and are referred to by id; the
  //   analysis of a hummed take is kept with the take, so her three clean-up choices are worked out again from it at once.
  // Sound: one sampler plays everything, recorded instruments from sounds/manifest.json or generated "basic sounds";
  //   the same scheduling code feeds live playback and the offline render, which is why a saved WAV is what she heard.
  //
  // FOR THE ASSISTANT (and tests): everything goes through the one object STUDIO. See "STUDIO: the outside" near the end
  // of this block for summary(), snapshot(), act(name, args) and on(event, fn).
  var STUDIO = null;
  function studioMake(){
    var PPQ = 480, MAXTRACKS = 16, DBNAME = "firstloop-studio";
    var testMode = /[?&]fltest/.test(window.location.search);
    // where recorded instruments are fetched from: beside the page when that exists, else the public repository
    var SOUNDS = { bases:["sounds/", "https://cdn.jsdelivr.net/gh/piscopofran/firstloop@main/sounds/", "https://raw.githubusercontent.com/piscopofran/firstloop/main/sounds/"], manifest:"manifest.json", timeout:9000 };
    var NOTE_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    var NOTE_SHARP = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
    var TRACK_COLORS = ["--melody", "--bass", "--chord", "--thump", "--snap", "--tick", "--clap", "--good"];
    var listeners = {};
    function on(ev, fn){ (listeners[ev] = listeners[ev] || []).push(fn); return API; }
    function emit(ev, d){ (listeners[ev] || []).slice().forEach(function(fn){ try { fn(d); } catch(e){ if(testMode) console.error(e); } }); }
    function uid(p){ return (p || "") + Math.random().toString(36).slice(2, 8) + (Date.now() % 1679616).toString(36); }
    function clamp(x, a, b){ return x < a ? a : (x > b ? b : x); }
    function el(tag, cls, text){ var n = document.createElement(tag); if(cls) n.className = cls; if(text !== undefined && text !== null) n.textContent = text; return n; }
    function btn(cls, text, title, fn){ var b = el("button", cls, text); b.type = "button"; if(title) b.title = title; if(fn) b.addEventListener("click", fn); return b; }
    function noteName(p){ return NOTE_NAMES[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1); }
    function keyName(k){ return !k || k.root === null || k.root === undefined || k.scale === "none" ? "No key" : NOTE_NAMES[k.root] + (k.scale === "minor" ? " minor" : " major"); }
    function tell(m){ try { say(m); } catch(e){} }
    var DSP = null;
    function dsp(){ return DSP || (DSP = stDspLib()); }
