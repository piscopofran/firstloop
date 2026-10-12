#!/bin/bash
# every Studio suite, one after another; a line each in out/SUMMARY
cd "$(dirname "$0")"; W=/home/claude/firstloop/.claude/worktrees/agent-a0680cd705dd88210; export NODE_PATH=/home/claude/fltests/node_modules; : > out/SUMMARY
for t in ${ONLY:-t_pitch t_model t_flow t_hum t_engine t_acc t_roll t_sync t_export t_asst t_ws t_cache t_ui t_phone t_smoke}; do
  [ -f $t.js ] || continue
  timeout 1500 node $t.js $([ $t = t_asst ] && echo $W/index.html) > out/$t.out 2>&1; echo "== $t exit $? $(grep -E '[0-9]+ passed|[0-9]+/[0-9]+' out/$t.out | tail -1)" >> out/SUMMARY
  grep -E '^FAIL' out/$t.out | cut -c1-300 >> out/SUMMARY
done
python3 t_server.py $W/server/firstloop-chat.py out/v33-chat.py fixture-states-v34.json > out/t_server.out 2>&1; echo "== t_server exit $? $(tail -1 out/t_server.out)" >> out/SUMMARY
bash e2e34.sh $W > out/e2e34.out 2>&1; echo "== e2e34 exit $? $(grep -E 'passed' out/e2e34.out | tail -1)" >> out/SUMMARY
echo done >> out/SUMMARY
