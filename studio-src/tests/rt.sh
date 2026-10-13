#!/bin/bash
# rt.sh <test.js> [args...] : run one test here, keep its output in out/, print what did not pass
cd "$(dirname "$0")"; mkdir -p out shots
n=$(basename "$1" .js); tag="$n$( [ -n "$2" ] && echo "-$2" )$( [ -n "$3" ] && echo "-$3" )"
timeout ${T:-560} node "$@" > "out/$tag.out" 2>&1
echo "== $tag exit $? $(grep -E '[0-9]+ passed' out/$tag.out | tail -1)"
grep -E '^FAIL|PAGEERROR|CONSOLE|Error:|WARNING' "out/$tag.out" | cut -c1-600 | head -${H:-30}
