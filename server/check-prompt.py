#!/usr/bin/env python3
"""Check that the assistant's system prompt is the same in both places.

The page (index.html, ASST_PROMPT) is the source. The server keeps its own
copy (server/firstloop-chat.py, PROMPT_LINES) so the endpoint cannot be used
with somebody else's instructions. The two must be identical.

  python3 server/check-prompt.py            compare; exit 1 if they differ
  python3 server/check-prompt.py --write    rewrite the server's copy from the page

Run from the root of the repository. Standard library only.
"""
import ast
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "..", "index.html")
SERVER = os.path.join(HERE, "firstloop-chat.py")
BEGIN, END = "assistant-prompt: begin", "assistant-prompt: end"


def block(text, path):
    a, b = text.find(BEGIN), text.find(END)
    if a < 0 or b < a:
        sys.exit("No prompt markers found in " + path)
    return a, b


def lines_of(text, path):
    a, b = block(text, path)
    out = []
    for raw in text[a:b].split("\n")[1:]:
        s = raw.strip()
        if not s.startswith('"'):
            continue
        out.append(json.loads(s.rstrip(",")))
    if not out:
        sys.exit("The prompt in " + path + " is empty")
    return out


def variants(lines, page, server):
    """The prompt is sent in pieces (a line "@@ name" opens a piece of module
    name). Both files must name the same sets of modules; each set's size is printed."""
    ms = re.search(r"^PROMPT_SETS = (\{.*\})\s*$", server, re.M)
    mp = re.search(r"var ASST_PROMPT_SETS = (\{.*?\});", page)
    if not ms and not mp:
        return 0
    if not ms or not mp:
        print("Only one of the two files says which pieces of the prompt go together.")
        return 1
    sets = dict((k, list(v)) for k, v in ast.literal_eval(ms.group(1)).items())
    if json.loads(re.sub(r"([A-Za-z_]+):", r'"\1":', mp.group(1))) != sets:
        print("The page and the server put different pieces of the prompt together (ASST_PROMPT_SETS, PROMPT_SETS).")
        return 1
    names = set(l[3:] for l in lines if l.startswith("@@ "))
    missing = sorted(set(m for v in sets.values() for m in v) - names)
    unused = sorted(names - set(m for v in sets.values() for m in v))
    if missing or unused:
        print("Modules named but not written: %s; written but in no set: %s" % (missing or "none", unused or "none"))
        return 1
    for kind in sorted(sets):
        on, n = False, -1
        for l in lines:
            if l.startswith("@@ "):
                on = l[3:] in sets[kind]
            elif on:
                n += len(l) + 1
        print("  %-6s %s: %d characters (roughly %d tokens)" % (kind, " + ".join(sets[kind]), n, n // 4))
    return 0


def main():
    page = open(PAGE, encoding="utf-8").read()
    server = open(SERVER, encoding="utf-8").read()
    want = lines_of(page, PAGE)
    if "--write" in sys.argv[1:]:
        a, b = block(server, SERVER)
        head = server[:a] + BEGIN + "\n"
        tail = "# " + server[b:]
        body = "PROMPT_LINES = [\n" + "".join("    " + json.dumps(l) + ",\n" for l in want) + "]\n"
        open(SERVER, "w", encoding="utf-8").write(head + body + tail)
        print("Wrote %d lines of prompt into %s" % (len(want), os.path.relpath(SERVER)))
        return 0
    have = lines_of(server, SERVER) if '"' in server[slice(*block(server, SERVER))] else []
    if have == want:
        chars = len("\n".join(want))
        print("Same prompt in both places: %d lines, %d characters (roughly %d tokens)." % (len(want), chars, chars // 4))
        return variants(want, page, server)
    print("The prompts differ. Run: python3 server/check-prompt.py --write")
    for i in range(max(len(have), len(want))):
        h = have[i] if i < len(have) else None
        w = want[i] if i < len(want) else None
        if h != w:
            print("first difference at line %d:\n  page:   %r\n  server: %r" % (i + 1, w, h))
            break
    return 1


if __name__ == "__main__":
    sys.exit(main())
