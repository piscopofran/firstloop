#!/bin/sh
# rebuild the worktree's index.html from v33 + hooks + the Studio sources
set -e
W=/home/claude/firstloop/.claude/worktrees/agent-a0680cd705dd88210
H=$(dirname "$0")
git -C $W show main:index.html > $W/index.html
python3 $H/hooks.py $W/index.html
python3 $H/hooks2.py $W/index.html
python3 $H/build.py $W/index.html
sed -n '/<script>/,/<\/script>/p' $W/index.html | sed '1d;$d' > $H/out/app.js
node --check $H/out/app.js && echo syntax ok
