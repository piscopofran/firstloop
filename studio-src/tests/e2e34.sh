#!/bin/bash
# e2e34.sh <repo dir>: the singer's way in, against that repo's page with its own service and with the v33 service
S=/tmp/claude-0/-home-claude-firstloop/6d899f1d-5f42-5a53-9bf7-b82201e0df93/scratchpad
REPO=$(readlink -f "$1")
A=$(bash $S/v33fin/up33.sh s34 "$REPO/server/firstloop-chat.py" "$REPO/index.html" 24201 24202 24203)
B=$(bash $S/v33fin/up33.sh s33 "$S/v34studio/out/v33-chat.py" "$REPO/index.html" 24211 24212 24213)
(cd $S/v34studio && NODE_PATH=/home/claude/fltests/node_modules timeout 600 node journey34.js http://127.0.0.1:24201 "$A" http://127.0.0.1:24211 "$B" 2>&1 | grep -v 'agent-proxy\|connect_rejected\|For details\|and [0-9]* more\|oldest')
bash $S/v33fin/up33.sh s34 stop; bash $S/v33fin/up33.sh s33 stop
