# The Studio (Songwriter workspace): sources

`index.html` stays one self-contained file. The Studio block in it (between `// ===== Studio =====` and
`// ===== /Studio =====`, and its CSS between `/* ===== Studio (css) ===== */` markers) is generated from the
files here. Edit these, then rebuild; do not edit the block in `index.html` by hand.

    python3 studio-src/build.py index.html        # splice src/*.js and src/studio.css into index.html
    python3 server/check-prompt.py --write        # only after changing write_prompt.txt (and re-running hooks2 on a clean page)

- `src/00_head.js` … `src/70_api.js`: the module, in order (design notes at the top of 00_head.js).
- `src/studio.css`: its styles.
- `hooks.py`, `hooks2.py`: the edits to the rest of `index.html` that the Studio needs (workspace, backup, the
  Assistant, the tester role). They were applied once to the v33 page; they are kept as the record of every line
  changed outside the block, and to rebuild from a clean v33 page: hooks.py, hooks2.py, then build.py.
- `write_prompt.txt`: the Assistant's instructions for the Studio (module "write"), which hooks2.py puts into
  `ASST_PROMPT_LINES`.
- `tests/`: Playwright and Node tests (`singer.js` generates singing; `t_pitch.js` measures hum-to-notes accuracy).
  They expect the page served over http with `sounds/` beside it, and Playwright from /home/claude/fltests.
