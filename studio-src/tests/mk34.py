#!/usr/bin/env python3
# v34 copies of the older suites whose checks name the wire version (4 -> 5), the list of workspaces or the list of roles.
# Every changed line is printed. Nothing else in the copies differs from the v33 files.
import re, os, sys
S = '/tmp/claude-0/-home-claude-firstloop/6d899f1d-5f42-5a53-9bf7-b82201e0df93/scratchpad'
def cp(src, dst, subs):
    s = open(os.path.join(S, src), encoding='utf-8').read(); n = 0
    for a, b, cnt in subs:
        c = len(re.findall(a, s)) if isinstance(a, re.Pattern) else s.count(a)
        assert cnt is None and c >= 1 or c == cnt, (src, a, c)
        s = a.sub(b, s) if isinstance(a, re.Pattern) else s.replace(a, b); n += c
    open(os.path.join(S, dst), 'w', encoding='utf-8').write(s); os.chmod(os.path.join(S, dst), 0o755)
    print('%-44s %d places' % (dst, n))
V = [('"v": 4', '"v": 5', None)]
cp('tests/server_test_v33.py', 'tests/server_test_v34.py', V)
cp('v27server/server27_test_v33.py', 'v27server/server27_test_v34.py', V)
cp('v29asst/t_server_v33.py', 'v29asst/t_server_v34.py', [('wire version 4", mod.MAX_BODY == 26 * 1024 and mod.MAX_SONG == 14 * 1024 and mod.WIRE_VERSION == 4', 'wire version 5", mod.MAX_BODY == 26 * 1024 and mod.MAX_SONG == 14 * 1024 and mod.WIRE_VERSION == 5', 1),
   ('H1 GET says v: 4 beside ok, model and open", st == 200 and j.get("v") == 4', 'H1 GET says v: 5 beside ok, model and open", st == 200 and j.get("v") == 5', 1),
   ('with v: 4 and the owner\'s open setting", j.get("v") == 4', 'with v: 5 and the owner\'s open setting", j.get("v") == 5', 1)])
cp('v32d4/t4_server_v33.py', 'v32d4/t4_server_v34.py', [('says v 4; the v31 one says v 2", new.WIRE_VERSION == 4', 'says v 5; the v31 one says v 2", new.WIRE_VERSION == 5', 1),
   ('carries v: 4", bool(got) and got.get("v") == 4', 'carries v: 5", bool(got) and got.get("v") == 5', 1)])
cp('v33acct/t33_server.py', 'v33acct/t33_server_v34.py', [('"v": 4', '"v": 5', 2), ('A1 GET: v 4', 'A1 GET: v 5', 1), ('g.get("v") == 4', 'g.get("v") == 5', 1), ('says v 4", get(PM).get("v") == 4', 'says v 5", get(PM).get("v") == 5', 1)])
cp('v29asst/installer29_test_v33.sh', 'v29asst/installer29_test_v34.sh', [('(GET has v: 4)', '(GET has v: 5)', 1), ('grep -q "\\"v\\": 4"', 'grep -q "\\"v\\": 5"', 1)])
cp('v33acct/installer33_test_v33int.sh', 'v33acct/installer33_test_v34.sh', [('GET now has v: 4', 'GET now has v: 5', 1), ('grep -q "\\"v\\": 4"', 'grep -q "\\"v\\": 5"', 1)])
cp('fix26/installer_test_v33int.sh', 'fix26/installer_test_v34.sh', [('installer29_test_v33.sh', 'installer29_test_v34.sh', 1), ('installer33_test_v33int.sh', 'installer33_test_v34.sh', 1)])
cp('v33acct/run_server_v33int.sh', 'v33acct/run_server_v34.sh', [('server_test_v33.py', 'server_test_v34.py', 1), ('server27_test_v33.py', 'server27_test_v34.py', 1), ('installer_test_v33int.sh', 'installer_test_v34.sh', 1), ('t_server_v33.py', 't_server_v34.py', 1), ('t4_server_v33.py', 't4_server_v34.py', 1), ('t33_server.py', 't33_server_v34.py', 1)])
# the page: four workspaces now, five roles; the version label these two checks name was already stale (v32; the page says v33)
cp('v33int/t_ws.js', 'v33int/v34_t_ws.js', [("'1 the Workspace menu: three choices, DJ ticked'", "'1 the Workspace menu: four choices, DJ ticked'", 1), ("=== 'dj:true,make:false,all:false'", "=== 'dj:true,make:false,write:false,all:false'", 1),
   ("=== 'DJ:true,Produce:false,Everything:false'", "=== 'DJ:true,Produce:false,Songwriter:false,Everything:false'", 1)])
cp('v33acct/t33_client_v33int.js', 'v33acct/t33_client_v34.js', [("says v 4 and signup true; the page says so too (wire 4, sign-up offered)', probe.v === 4 && probe.signup === true && (await pg.evaluate(() => window.__flAsst.wire() === 4", "says v 5 and signup true; the page says so too (wire 5, sign-up offered)', probe.v === 5 && probe.signup === true && (await pg.evaluate(() => window.__flAsst.wire() === 5", 1),
   ('(four choices)', '(five choices)', 1), ("'dj:DJ', 'producer:Producer'", "'dj:DJ', 'singer:Singer or songwriter', 'producer:Producer'", 1),
   ("shown.vals[0] === 'v32'", "shown.vals[0] === 'v33'", 1), ("w.context.build === 'v32'", "w.context.build === 'v33'", 1)])
cp('v33acct/run_client_v33int.sh', 'v33acct/run_client_v34.sh', [('t33_client_v33int.js', 't33_client_v34.js', 1)])
cp('v33acct/t5_e2e_v33.js', 'v33acct/t5_e2e_v34.js', [("[['v33 service', NEW, NEWW, 4],", "[['v34 service', NEW, NEWW, 5],", 1)])
cp('v33coach/t5_coach_e2e.js', 'v33coach/t5_coach_e2e_v34.js', [("'wire 4 service: GET says v: 4', probe.v === 4", "'wire 5 service: GET says v: 5', probe.v === 5", 1), ("will send the coach (wire 4)'", "will send the coach (wire 5)'", 1), ("window.__flAsst.wire())) === 4, await", "window.__flAsst.wire())) === 5, await", 1)])
cp('v29asst/t_e2e29_v33.js', 'v29asst/t_e2e29_v34.js', [("isNew ? 'says v: 4' : 'has no v'), isNew ? probe.v === 4", "isNew ? 'says v: 5' : 'has no v'), isNew ? probe.v === 5", 1), ("(isNew ? 4 : 1) + ')'", "(isNew ? 5 : 1) + ')'", 1), ("=== (isNew ? 4 : 1));", "=== (isNew ? 5 : 1));", 1)])
