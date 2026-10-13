#!/usr/bin/env python3
# Splices the Studio sources into index.html between its markers. usage: build.py <index.html>
import sys, os, re, glob
here = os.path.dirname(os.path.abspath(__file__))
idx = sys.argv[1]
s = open(idx, encoding='utf-8').read()
js = ''.join(open(f, encoding='utf-8').read().rstrip('\n') + '\n' for f in sorted(glob.glob(os.path.join(here, 'src', '*.js'))))
css = ''.join(open(f, encoding='utf-8').read().rstrip('\n') + '\n' for f in sorted(glob.glob(os.path.join(here, 'src', '*.css'))))
CS, CE = '  /* ===== Studio (css) ===== */\n', '  /* ===== /Studio (css) ===== */\n'
JS, JE = '  // ===== Studio =====\n', '  // ===== /Studio =====\n'
if not js.startswith(JS): raise SystemExit('js must start with the marker')
if CS in s:
    a, b = s.index(CS), s.index(CE) + len(CE); s = s[:a] + CS + css + CE + s[b:]
else:
    k = '  /* ===== /workspace (css) ===== */\n'; a = s.index(k) + len(k); s = s[:a] + CS + css + CE + s[a:]
if JS in s:
    a, b = s.index(JS), s.index(JE) + len(JE); s = s[:a] + js + JE + s[b:]
else:
    k = '  // ===== /workspace =====\n'; a = s.index(k) + len(k); s = s[:a] + '\n' + js + JE + s[a:]
open(idx, 'w', encoding='utf-8').write(s)
print('built', len(js), 'js', len(css), 'css')
