#!/usr/bin/env python3
"""Check that the assistant's system prompt is the same in both places.

The page (index.html, ASST_PROMPT) is the source. The server keeps its own
copy (server/firstloop-chat.py, PROMPT_LINES) so the endpoint cannot be used
with somebody else's instructions. The two must be identical.

  python3 server/check-prompt.py            compare; exit 1 if they differ
  python3 server/check-prompt.py --write    rewrite the server's copy from the page

Run from the root of the repository. Standard library only.
"""
import json
import os
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
        return 0
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
