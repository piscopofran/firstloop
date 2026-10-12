#!/bin/bash
# run34.sh <tag>: the older suites whose expectations changed with v34 (the copies made by mk34.py), and the ones that
# failed in the full run for a reason since fixed. One at a time, against a copy of the worktree taken now.
S=/tmp/claude-0/-home-claude-firstloop/6d899f1d-5f42-5a53-9bf7-b82201e0df93/scratchpad
I=$S/v33int; SRC=/home/claude/firstloop/.claude/worktrees/agent-a0680cd705dd88210
OUT=$I/runs/$1; mkdir -p "$OUT"; rm -rf "$OUT/repo"; mkdir -p "$OUT/repo"; cp "$SRC/index.html" "$OUT/repo/"; cp -r "$SRC/server" "$OUT/repo/server"; [ -d "$SRC/tools" ] && cp -r "$SRC/tools" "$OUT/repo/tools"
REPO=$OUT/repo; W=$REPO/index.html; SV=$REPO/server; R=$S/review27; C=$S/v33acct/c
export NODE_PATH=/home/claude/fltests/node_modules
sum() { f="$OUT/$1.out"; echo "== $1  PASS $(grep -c '^ *PASS' "$f") FAIL $(grep -c '^ *FAIL' "$f")  $(tail -n 1 "$f" | cut -c1-90)" >> "$OUT/SUMMARY"; grep -E '^ *FAIL' "$f" | cut -c1-400 | head -25 >> "$OUT/SUMMARY"; grep -E 'PAGEERR|CRASH|TypeError|Traceback|ReferenceError' "$f" | cut -c1-300 | head -4 >> "$OUT/SUMMARY"; }
: > "$OUT/SUMMARY"; date >> "$OUT/SUMMARY"
(cd $I && timeout 1700 node v34_t_ws.js "$W" > "$OUT/int_t_ws_v34.out" 2>&1); sum int_t_ws_v34
(cd $S/v33coach && timeout 1700 node t3_more_v33int.js "$W" > "$OUT/coach_t3_more.out" 2>&1); sum coach_t3_more
bash $S/v33acct/run_server_v34.sh "$SRC/server" > "$OUT/server_all_v34.out" 2>&1; sum server_all_v34; echo "   (lists only what did not pass; lines: $(wc -l < "$OUT/server_all_v34.out"))" >> "$OUT/SUMMARY"
python3 $S/v33coach/t_allow_v33int.py "$SV/firstloop-chat.py" $S/v33coach/fixture-states-v33coach.json > "$OUT/coach_t_allow.out" 2>&1; sum coach_t_allow
(cd "$REPO" && python3 server/check-prompt.py > "$OUT/prompt.out" 2>&1; echo "exit $?" >> "$OUT/prompt.out"); sum prompt
bash $S/v33acct/run_client_v34.sh "$REPO" > "$OUT/acct_client_v34.out" 2>&1; sum acct_client_v34
a="$(bash $C/up33.sh e33 "$SV/firstloop-chat.py" "$W" 23711 23712 23713)"; b="$(bash $C/up33.sh e27 "$S/v32four/old-e82a717-chat.py" "$W" 23721 23722 23723)"; c="$(bash $C/up33.sh e31 "$S/v32four/main-chat.py" "$W" 23731 23732 23733)"; d="$(bash $C/up33.sh e32 "$S/v33acct/main-chat.py" "$W" 23741 23742 23743)"
(cd $S/v33acct && timeout 1500 node t5_e2e_v34.js http://127.0.0.1:23711 "$a" http://127.0.0.1:23721 "$b" http://127.0.0.1:23731 "$c" http://127.0.0.1:23741 "$d" > "$OUT/t5_e2e_v34.out" 2>&1)
for n in e33 e27 e31 e32; do bash $C/up33.sh $n stop; done; sum t5_e2e_v34
bash $R/up.sh c33d "$SV/firstloop-chat.py" "$W" 23880 23881 23882 > /dev/null; bash $R/up.sh c33a "$S/v33acct/main-chat.py" "$W" 23871 23872 23873 > /dev/null
(cd $S/v33coach && timeout 400 node t5_coach_e2e_v34.js http://127.0.0.1:23880 $R/c33d http://127.0.0.1:23871 $R/c33a > "$OUT/coach_e2e_v34.out" 2>&1)
for n in c33a c33d; do kill -- -$(cat $R/$n.pid) 2>/dev/null; done; sum coach_e2e_v34
bash $R/up.sh f32 "$SV/firstloop-chat.py" "$W" 9511 9512 9513 > /dev/null; bash $R/up.sh f2 $S/v32four/old-e82a717-chat.py "$W" 9521 9522 9523 > /dev/null
(cd $S/v29asst && timeout 500 node t_e2e29_v34.js http://127.0.0.1:9511 $R/f32 http://127.0.0.1:9521 $R/f2 > "$OUT/e2e29_v34.out" 2>&1)
for n in f32 f2; do kill -- -$(cat $R/$n.pid) 2>/dev/null; done; sum e2e29_v34
date >> "$OUT/SUMMARY"; echo ALLDONE > "$OUT/done"
