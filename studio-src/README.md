# The Studio (Songwriter workspace): sources

`index.html` stays one self-contained file. The Studio block in it (between `// ===== Studio =====` and
`// ===== /Studio =====`, and its CSS between `/* ===== Studio (css) ===== */` markers) is generated from the
files here. Edit these, then rebuild; do not edit the block in `index.html` by hand.

    python3 studio-src/build.py index.html        # splice src/*.js and src/studio.css into index.html
    python3 server/check-prompt.py --write        # only after changing write_prompt.txt (and re-running hooks2 on a clean page)

- `src/00_head.js` … `src/70_api.js`: the module, in order (design notes at the top of 00_head.js).
- `src/studio.css`: its styles. `src/studio_phone.css`: everything for phones, tablets and touch (build.py joins
  every `src/*.css`, in name order).
- The phone layout (v35) is the same song, engine and canvases laid out again, not a second app:
  `src/45_mobile.js` holds what a phone needs underneath (sound unlocked by a tap and "Tap to resume sound", the
  iPhone silent switch, headphones and the plan for a take, the microphone's three tiers, storage, sharing, the
  keyboard, Add to Home Screen); `src/66_phone.js` the screens (Home, the song, sheets, navigation, Back);
  `src/67_phedit.js` editing by touch, the recording screen, chords, mix, share, Help and Phone check.
  `phoneWant()` in 00_head.js decides who gets it: narrower than 700px, or a touch device narrower than 1000px or
  shorter than 500px. A tablet upright gets the phone layout with more room; on its side, the desk layout with
  finger-sized controls (`html[data-sttouch]`). `MOB.lean` (any handheld) halves what instruments cost in memory.
- `hooks.py`, `hooks2.py`: the edits to the rest of `index.html` that the Studio needs (workspace, backup, the
  Assistant, the tester role). They were applied once to the v33 page; they are kept as the record of every line
  changed outside the block, and to rebuild from a clean v33 page: hooks.py, hooks2.py, then build.py.
- `write_prompt.txt`: the Assistant's instructions for the Studio (module "write"), which hooks2.py puts into
  `ASST_PROMPT_LINES`.
- Phone tests (Chromium's device emulation, touch input, fake microphone; WebKit cannot run here, so
  `t_iosaudit.js` checks statically that everything iPhone Safari lacks or does differently is guarded):
  `tests/rt.sh t_phone.js [ip13|se|px7|ip13l|ipad] [light]` (the whole journey by touch, every screen measured and
  photographed), `t_touch.js` (note editing), `t_mobile.js` (interruption, no worklet, recorder types, storage
  failure, sample rates, headphones, keyboard, sign-up, sharing), `t_tablet.js`, `t_perf.js` (memory, first note on
  slow networks, scrolling under a 4x slower processor, load), `t_limiter.js` (the limiter, bit for bit against
  v34's), `t_sizes.js` (the desk layout at 1024 to 1440, moved out of the old t_phone.js). `phall.sh` runs the lot.
- `tests/`: Playwright and Node tests (`singer.js` generates singing; `t_pitch.js` measures hum-to-notes accuracy).
  They expect the page served over http with `sounds/` beside it, and Playwright from /home/claude/fltests.
