#!/usr/bin/env bash
# First Loop: install the chat service on the server that already serves the site.
#
# Run as root, from your home folder:
#   cd ~ && curl -fsSL https://raw.githubusercontent.com/piscopofran/firstloop/main/server/install-chat.sh -o install-chat.sh && sudo bash install-chat.sh
#
# To take everything it added away again:
#   cd ~ && sudo bash install-chat.sh --remove
#
# It is safe to run more than once. It does not touch the firewall, the wish
# service, cron, or anything it did not add itself. Every nginx file it edits
# is copied first, the edit is checked, nginx is asked to test it, and the
# files are put back if anything at all is not right.
#
# Nothing below runs until the last line of this file has been read, so a
# download that was cut short does nothing.

set -Eeuo pipefail

RAW="${FL_RAW_BASE:-https://raw.githubusercontent.com/piscopofran/firstloop/main/server}"
APP_DIR=/opt/firstloop-chat
ENV_FILE=/etc/firstloop-chat.env
UNIT=/etc/systemd/system/firstloop-chat.service
LOG_DIR=/var/log/firstloop-chat
LOG_FILE=$LOG_DIR/chat.log
OLD_LOG_FILE=/var/log/firstloop-chat.log
STATE_DIR=/var/lib/firstloop-chat
SVC_USER=firstloop-chat
BACKUP_DIR=/var/backups/firstloop-chat
MARK_BEGIN="# firstloop-chat: begin (added by install-chat.sh)"
MARK_END="# firstloop-chat: end"
SENTINEL="# firstloop-chat: end of file"
DEFAULT_MODEL="claude-haiku-4-5-20251001"
DEFAULT_CAP="600"

# What to tell the owner if the script stops somewhere unexpected.
WHERE="Nothing has been changed."

say()  { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  {
  printf '\nSTOPPED: %s\n' "$*" >&2
  # always end by saying where things stand, unless the message already did
  case "$*" in *"$WHERE"*) ;; *) printf '    %s\n' "$WHERE" >&2 ;; esac
  exit 1
}
on_err() {
  local code=$? line=$1
  # inside $( ... ) only pass the failure up; the outer shell does the talking
  [ "${BASHPID:-$$}" = "$$" ] || exit "$code"
  printf '\nSTOPPED: a step failed unexpectedly (line %s of the installer, exit code %s).\n' "$line" "$code" >&2
  printf '    %s\n' "$WHERE" >&2
  exit 1
}
trap 'on_err $LINENO' ERR

# ---------------------------------------------------------------------------
# nginx: the part that reads and edits a configuration file
# ---------------------------------------------------------------------------
# nginx_py FILE has            prints yes | no | unreadable: why
# nginx_py FILE add    OUT     writes the new text to OUT; prints "changed" or "same"
# nginx_py FILE remove OUT     the same, for taking the block out
# It never writes to FILE. When it is not completely sure, it refuses: it
# prints the reason on the error output and exits 3.
nginx_py() {
  MARK_BEGIN="$MARK_BEGIN" MARK_END="$MARK_END" python3 - "$@" <<'PY'
import os, re, sys

path, mode = sys.argv[1], sys.argv[2]
outpath = sys.argv[3] if len(sys.argv) > 3 else None
BEGIN, END = os.environ["MARK_BEGIN"], os.environ["MARK_END"]
BLOCK = [
    "location = /api/chat {",
    "    proxy_pass http://127.0.0.1:8788;",
    "    proxy_set_header Host $host;",
    "    proxy_set_header X-Real-IP $remote_addr;",
    "    proxy_buffering off;",
    "    proxy_read_timeout 120s;",
    "    client_max_body_size 64k;",
    "}",
]


class Refuse(Exception):
    pass


def line_of(text, pos):
    return text.count("\n", 0, pos) + 1


def tokens(t):
    """Split the way nginx does: words, quoted strings, ; { } and # comments.
    A quote or a # only means something at the start of a word, and a } in
    the middle of a word is part of the word."""
    out, i, n = [], 0, len(t)
    while i < n:
        c = t[i]
        if c in " \t\r\n":
            i += 1
            continue
        if c == "#":
            j = t.find("\n", i)
            i = n if j < 0 else j
            continue
        if c in ";{}":
            out.append((c, i, i + 1, c))
            i += 1
            continue
        if c in "\"'":
            j = i + 1
            while j < n and t[j] != c:
                j += 2 if t[j] == "\\" else 1
            if j >= n:
                raise Refuse("a quotation mark opened on line %d is never closed" % line_of(t, i))
            out.append(("w", i, j + 1, t[i + 1:j]))
            i = j + 1
            continue
        j, var = i, False
        while j < n:
            ch = t[j]
            if ch == "{" and var:          # ${name}
                var = False
                j += 1
                continue
            var = False
            if ch == "\\":
                j += 2
                continue
            if ch == "$":
                var = True
                j += 1
                continue
            if ch in " \t\r\n;{":
                break
            j += 1
        j = min(j, n)
        out.append(("w", i, j, t[i:j]))
        i = j
    return out


def parse(t):
    """Every { } block in the file: name, arguments, where it starts and ends, and its parent."""
    stack, blocks, stmt = [], [], []
    for kind, s, e, val in tokens(t):
        if kind == "w":
            if val.endswith("_by_lua_block") or val.endswith("_by_njs_block"):
                raise Refuse("it contains embedded program code (line %d), which this installer will not edit around" % line_of(t, s))
            stmt.append((s, e, val))
        elif kind == ";":
            stmt = []
        elif kind == "{":
            b = {"name": stmt[0][2] if stmt else "", "args": [x[2] for x in stmt[1:]],
                 "start": stmt[0][0] if stmt else s, "open": s, "close": None,
                 "parent": stack[-1] if stack else None}
            stack.append(b)
            blocks.append(b)
            stmt = []
        else:
            if not stack:
                raise Refuse("there is a closing brace on line %d with no opening brace before it" % line_of(t, s))
            if stmt:
                raise Refuse("the setting on line %d is not finished with a semicolon" % line_of(t, stmt[0][0]))
            stack.pop()["close"] = e
    if stack:
        raise Refuse("the block opened on line %d is never closed" % line_of(t, stack[-1]["open"]))
    if stmt:
        raise Refuse("the setting on line %d is not finished" % line_of(t, stmt[0][0]))
    return blocks


def location_for(b, target):
    """True when b is 'location [modifier] target', where the modifier is none, = or ^~."""
    if b["name"] != "location":
        return False
    a = b["args"]
    return a == [target] or a in (["=", target], ["^~", target], ["=" + target], ["^~" + target])


def any_location_for(b, target):
    return b["name"] == "location" and bool(b["args"]) and b["args"][-1].lstrip("=^~") == target


def server_of(b):
    p = b["parent"]
    while p is not None and p["name"] != "server":
        p = p["parent"]
    return p


def inside(b, scope):
    if scope is None:
        return True
    p = b["parent"]
    while p is not None:
        if p is scope:
            return True
        p = p["parent"]
    return False


SIMPLE = re.compile(r"^[a-z_]+( [^;{}#\"']+)?;$")


def strip_blocks(t):
    """Take out every block this installer added. Returns (text, how many).
    Only a begin line followed by exactly one plain /api/chat location and an
    end marker counts; anything else is refused."""
    pieces, pos, count = [], 0, 0
    start, body, first = None, [], False
    for m in re.finditer(r"[^\n]*\n|[^\n]+$", t):
        line, ls = m.group(), m.start()
        s = line.strip()
        if start is None:
            if s == BEGIN:
                first = ls == 0
                start = ls
                if not first:
                    start -= 1                      # the line break before it goes too
                    if start > 0 and t[start - 1] == "\r":
                        start -= 1
                body = []
            elif BEGIN in line or END in line:
                raise Refuse("line %d has one of this installer's markers in a place it never puts them" % line_of(t, ls))
            continue
        if s == BEGIN or BEGIN in line:
            raise Refuse("the marker on line %d begins a block before the earlier one has ended" % line_of(t, ls))
        if s.startswith(END):
            ok = len(body) >= 2 and body[0] == BLOCK[0] and body[-1] == "}" and all(SIMPLE.match(x) for x in body[1:-1])
            if not ok:
                raise Refuse("the marked block ending on line %d has been changed by hand, so it will not be removed automatically" % line_of(t, ls))
            stop = ls + line.index(END) + len(END)
            if first and s == END:                  # block on the first line: its own line break goes instead
                stop = ls + len(line)
            pieces.append(t[pos:start])
            pos = stop
            start, count = None, count + 1
            continue
        body.append(s)
    if start is not None:
        raise Refuse("a marked block begins on line %d but its end marker is missing" % line_of(t, start + 2))
    pieces.append(t[pos:])
    return "".join(pieces), count


def add(cleaned):
    blocks = parse(cleaned)
    wish = [b for b in blocks if location_for(b, "/api/wish")]
    if not wish:
        raise Refuse("it has no 'location /api/wish' block")
    spots, seen = [], []
    for b in wish:
        scope = server_of(b)
        if scope is None and b["parent"] is not None:
            raise Refuse("the /api/wish location on line %d is not inside a server block" % line_of(cleaned, b["start"]))
        if any(scope is x for x in seen):
            continue                                # one per server block
        seen.append(scope)
        for other in blocks:
            if any_location_for(other, "/api/chat") and inside(other, scope):
                raise Refuse("it already has a location for /api/chat (line %d) that this installer did not add" % line_of(cleaned, other["start"]))
        anchor = b                                  # the block at the server's own level that holds /api/wish
        while anchor["parent"] is not scope:
            anchor = anchor["parent"]
        close = anchor["close"]
        eol = cleaned.find("\n", close)
        if eol < 0:
            eol = len(cleaned)
        at = eol - 1 if eol > close and cleaned[eol - 1] == "\r" else eol
        rest = cleaned[close:at]
        if not re.match(r"^[ \t]*(#.*)?$", rest):
            raise Refuse("on line %d there is more configuration after the closing brace of the /api/wish block (%r). "
                         "Put what follows that brace on a line of its own, then run this again"
                         % (line_of(cleaned, close), rest.strip()[:40]))
        if cleaned[at:at + 2] == "\r\n":
            nl = "\r\n"
        elif at < len(cleaned):
            nl = "\n"
        else:
            nl = "\r\n" if "\r\n" in cleaned else "\n"
        ls = cleaned.rfind("\n", 0, anchor["start"]) + 1
        indent = re.match(r"[ \t]*", cleaned[ls:anchor["start"]]).group()
        spots.append((at, "".join(nl + indent + l for l in [BEGIN] + BLOCK + [END])))
    out, pos = [], 0
    for at, text in sorted(spots):
        out.append(cleaned[pos:at])
        out.append(text)
        pos = at
    out.append(cleaned[pos:])
    new = "".join(out)
    # Proof that nothing else moved: take the marked blocks back out and the
    # result must be the text we started from, byte for byte.
    back, n = strip_blocks(new)
    if back != cleaned or n != len(spots) or new.count(BEGIN) != len(spots):
        raise Refuse("the edit did not check out (the file with the new block taken out again is not identical to the original)")
    after = parse(new)
    if sum(1 for b in after if any_location_for(b, "/api/chat")) != len(spots) or len(after) != len(blocks) + len(spots):
        raise Refuse("the edit did not check out (the new block is not where it should be)")
    return new


def main():
    try:
        with open(path, "rb") as f:
            raw = f.read()
    except OSError as e:
        raise Refuse("it could not be read (%s)" % e.strerror)
    if b"\0" in raw:
        raise Refuse("it is not a text file")
    text = raw.decode("latin-1")                    # every byte survives the round trip, whatever the encoding
    if mode == "has":
        if "/api/wish" not in text:
            print("no")
            return
        try:
            print("yes" if any(location_for(b, "/api/wish") for b in parse(strip_blocks(text)[0])) else "no")
        except Refuse as e:
            print("unreadable: " + str(e))
        return
    cleaned, had = strip_blocks(text)
    if mode == "add":
        new = add(cleaned)
    elif mode == "remove":
        new = cleaned
        if BEGIN in new or len(new) >= len(text) and had:
            raise Refuse("the removal did not check out")
    else:
        raise Refuse("unknown mode")
    if new == text:
        print("same")
        return
    data = new.encode("latin-1")
    with open(outpath, "wb") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    with open(outpath, "rb") as f:
        if f.read() != data:
            raise Refuse("the new copy could not be written correctly")
    print("changed")


try:
    main()
except Refuse as e:
    sys.stderr.write(str(e) + "\n")
    sys.exit(3)
except Exception as e:                              # never a traceback in front of the owner
    sys.stderr.write("an unexpected problem while reading it (%s)\n" % type(e).__name__)
    sys.exit(3)
PY
}

# Every configuration file nginx actually loads (asked from nginx itself),
# or the usual places when nginx will not say.
nginx_loaded() {
  local out f real
  out="$(nginx -T 2>/dev/null | sed -n 's/^# configuration file \(.*\):$/\1/p')" || out=""
  {
    if [ -n "$out" ]; then
      printf '%s\n' "$out"
    else
      for f in /etc/nginx/nginx.conf /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*.conf; do printf '%s\n' "$f"; done
    fi
    if [ "${1:-}" = "all" ]; then
      for f in /etc/nginx/sites-enabled/* /etc/nginx/sites-available/* /etc/nginx/conf.d/*; do printf '%s\n' "$f"; done
    fi
  } | while IFS= read -r f; do
    [ -e "$f" ] || continue
    real="$(readlink -f -- "$f")" || continue
    [ -f "$real" ] && printf '%s\n' "$real"
  done | sort -u
}

# The loaded files that have a location for exactly /api/wish.
nginx_files() {
  local f verdict
  while IFS= read -r f; do
    grep -qF '/api/wish' -- "$f" 2>/dev/null || continue
    verdict="$(nginx_py "$f" has 2>/dev/null)" || verdict="unreadable: could not be examined"
    case "$verdict" in
      yes) printf '%s\n' "$f" ;;
      unreadable*) printf '    Skipping %s: %s.\n' "$f" "${verdict#unreadable: }" >&2 ;;
    esac
  done < <(nginx_loaded)
}

# Puts files back from their copies. $1 = how many of the arrays' entries.
# Uses the arrays ED_FILES and ED_BACKUPS. Returns 1 if any could not be put back.
nginx_restore() {
  local count="$1" i bad=0
  for ((i = 0; i < count; i++)); do
    if cp -p -- "${ED_BACKUPS[$i]}" "${ED_FILES[$i]}" 2>/dev/null && cmp -s -- "${ED_BACKUPS[$i]}" "${ED_FILES[$i]}"; then
      :
    else
      bad=1
      printf '    COULD NOT put %s back. Its copy from before is at %s\n' "${ED_FILES[$i]}" "${ED_BACKUPS[$i]}" >&2
    fi
  done
  return "$bad"
}

# Works out the change to every file first (touching nothing), then writes
# them, then asks nginx to test. If any step fails, every file written so far
# is put back before stopping.
nginx_apply() {
  local mode="$1"; shift
  local stamp f b n result reason errf i put
  ED_FILES=(); ED_BACKUPS=()
  local -a news=()
  drop_news() { local x; for x in ${news[@]+"${news[@]}"}; do rm -f -- "$x"; done; }
  mkdir -p "$BACKUP_DIR" || die "Could not create $BACKUP_DIR. No nginx file has been changed."
  chmod 700 "$BACKUP_DIR"
  stamp="$(date +%Y%m%d-%H%M%S)-$$"
  errf="$(mktemp "$BACKUP_DIR/tmp.XXXXXXXX")" || die "Could not create a temporary file in $BACKUP_DIR. No nginx file has been changed."

  # 1. plan: nothing is written to nginx's folders here
  for f in "$@"; do
    b="$BACKUP_DIR/$(printf '%s' "$f" | tr '/' '_').$stamp"
    n="$(mktemp "$BACKUP_DIR/new.XXXXXXXX")" || { rm -f -- "$errf"; drop_news; die "Could not create a temporary file in $BACKUP_DIR. No nginx file has been changed."; }
    if ! cp -p -- "$f" "$b"; then
      rm -f -- "$errf" "$n"; drop_news
      die "Could not make a copy of $f, so it was not touched. No nginx file has been changed."
    fi
    if ! result="$(nginx_py "$f" "$mode" "$n" 2>"$errf")"; then
      reason="$(head -c 600 "$errf" | tr '\n' ' ')"
      rm -f -- "$errf" "$n" "$b"; drop_news
      die "Not changing $f: ${reason:-it could not be examined}. No nginx file has been changed, and nginx has not been reloaded."
    fi
    if [ "$result" = "changed" ]; then
      ED_FILES+=("$f"); ED_BACKUPS+=("$b"); news+=("$n")
      note "Copy of $f kept at $b"
    else
      rm -f "$n" "$b"
    fi
  done
  if [ "${#ED_FILES[@]}" -eq 0 ]; then
    rm -f -- "$errf"
    note "nginx already had it that way. Nothing to change."
    return 0
  fi

  # 2. write
  for i in "${!ED_FILES[@]}"; do
    f="${ED_FILES[$i]}"
    if ! cmp -s -- "$f" "${ED_BACKUPS[$i]}"; then
      put="and every nginx file was put back exactly as it was"
      nginx_restore "$i" || put="but NOT every nginx file could be put back (see above)"
      rm -f -- "$errf"; drop_news
      die "$f changed while the installer was working, so it was left alone, $put. nginx has not been reloaded. Run the installer again."
    fi
    if ! { cat -- "${news[$i]}" > "$f"; } 2>/dev/null || ! cmp -s -- "${news[$i]}" "$f"; then
      put="Every nginx file was put back exactly as it was."
      nginx_restore "$((i + 1))" || put="NOT every nginx file could be put back (see above)."
      rm -f -- "$errf"; drop_news
      die "Could not write $f. $put nginx has not been reloaded."
    fi
  done
  drop_news

  # 3. let nginx judge, and put everything back if it objects
  if nginx -t >"$errf" 2>&1; then
    if systemctl reload nginx; then
      rm -f -- "$errf"
      note "nginx accepted the change and has been reloaded."
      return 0
    fi
    put="Its files were put back exactly as they were."
    nginx_restore "${#ED_FILES[@]}" || put="NOT every file could be put back (see above)."
    rm -f -- "$errf"
    die "nginx accepted the change but did not reload. $put Check nginx with: systemctl status nginx"
  fi
  note "nginx said:"
  sed 's/^/      /' "$errf" >&2 || true
  rm -f -- "$errf"
  if nginx_restore "${#ED_FILES[@]}"; then
    if nginx -t >/dev/null 2>&1; then
      die "nginx did not accept the change, so its files were put back exactly as they were (checked), and nginx was not reloaded. The website is unaffected."
    fi
    die "nginx did not accept the change. Its files were put back exactly as they were, but nginx's own test still fails, so something else in its configuration needs attention. nginx was not reloaded, so the running website is unaffected for now."
  fi
  die "nginx did not accept the change and NOT every file could be put back (see above). nginx was not reloaded, so the running website is unaffected for now. Put the listed copies back by hand before reloading nginx."
}

# Downloads one file to $2 and makes sure something arrived.
fetch() {
  curl -fsSL --max-time 60 "$RAW/$1" -o "$2" || die "Could not download $1 from GitHub. $WHERE"
  [ -s "$2" ] || die "The download of $1 came back empty. $WHERE"
}

# Refuses anything that is not a whole, sane copy of the two files.
check_downloaded() {
  local d="$1"
  [ -s "$d/firstloop-chat.py" ] && [ -s "$d/firstloop-chat.service" ] || die "A downloaded file is empty. $WHERE"
  python3 -m py_compile "$d/firstloop-chat.py" 2>/dev/null || die "The downloaded program did not pass a basic check. $WHERE"
  [ "$(tail -n 1 "$d/firstloop-chat.py")" = "$SENTINEL" ] || die "The downloaded program is incomplete (its last line is missing). $WHERE Try again in a minute."
  grep -q '^\[Service\]$' "$d/firstloop-chat.service" || die "The downloaded service file looks wrong. $WHERE"
  grep -q '^ExecStart=' "$d/firstloop-chat.service" || die "The downloaded service file looks wrong. $WHERE"
  [ "$(tail -n 1 "$d/firstloop-chat.service")" = "$SENTINEL" ] || die "The downloaded service file is incomplete (its last line is missing). $WHERE Try again in a minute."
}

short_sum() { sha256sum -- "$1" | cut -c1-12; }

# ---------------------------------------------------------------------------
# --remove
# ---------------------------------------------------------------------------
remove_all() {
  local -a marked=()
  local f
  say "Removing the First Loop chat service"
  WHERE="Nothing has been removed yet."
  while IFS= read -r f; do
    if grep -qF "$MARK_BEGIN" -- "$f" 2>/dev/null; then marked+=("$f"); fi
  done < <(nginx_loaded all)
  if [ "${#marked[@]}" -gt 0 ]; then
    note "Taking the /api/chat block out of nginx"
    nginx_apply remove "${marked[@]}"
  else
    note "nginx has no /api/chat block from this installer."
  fi
  WHERE="The /api/chat block is out of nginx. Run this again to finish removing the rest."
  if [ -f "$UNIT" ]; then
    systemctl disable --now firstloop-chat.service >/dev/null 2>&1 || true
    note "Service stopped."
  fi
  rm -f "$UNIT" || die "Could not delete $UNIT."
  systemctl daemon-reload || note "systemd did not reload its list of services; that sorts itself out at the next restart."
  rm -rf "$APP_DIR" "$STATE_DIR" "$LOG_DIR" || die "Could not delete the program's folders."
  rm -f "$ENV_FILE" "$OLD_LOG_FILE" || die "Could not delete $ENV_FILE."
  if id "$SVC_USER" >/dev/null 2>&1; then userdel "$SVC_USER" >/dev/null 2>&1 || note "The user $SVC_USER could not be deleted; it has no login and no rights, so it is harmless."; fi
  say "Removed."
  note "The API key file ($ENV_FILE) was deleted. Copies of the nginx files from before are still in $BACKUP_DIR."
  note "If you no longer need the key at all, also delete it in the Anthropic Console."
}

# ---------------------------------------------------------------------------
# install
# ---------------------------------------------------------------------------
install_all() {
  local -a SITE_FILES=()
  local f TMP KEY attempt PROBE REPLY had_old=0 sum_py sum_unit tlog

  say "Step 1 of 6: finding the First Loop site in nginx"
  tlog="$(mktemp)" || die "Could not create a temporary file. Nothing has been changed."
  if ! nginx -t >"$tlog" 2>&1; then
    sed 's/^/      /' "$tlog" >&2 || true
    rm -f "$tlog"
    die "nginx's configuration does not pass its own test as it is now (see above), before this installer has touched anything. That needs fixing first. Nothing has been changed."
  fi
  rm -f "$tlog"
  while IFS= read -r f; do SITE_FILES+=("$f"); done < <(nginx_files)
  [ "${#SITE_FILES[@]}" -gt 0 ] || die "No nginx site with a 'location /api/wish { ... }' block was found in the configuration nginx loads. Nothing has been changed."
  for f in "${SITE_FILES[@]}"; do note "Found it in $f"; done

  say "Step 2 of 6: downloading the service"
  TMP="$(mktemp -d)" || die "Could not create a temporary folder. Nothing has been changed."
  # shellcheck disable=SC2064
  trap "rm -rf '$TMP'" EXIT
  fetch firstloop-chat.py "$TMP/firstloop-chat.py"
  fetch firstloop-chat.service "$TMP/firstloop-chat.service"
  check_downloaded "$TMP"
  sum_py="$(short_sum "$TMP/firstloop-chat.py")"
  sum_unit="$(short_sum "$TMP/firstloop-chat.service")"
  note "Downloaded and checked."
  note "Version fingerprints (sha256, first 12): program $sum_py, service file $sum_unit"

  say "Step 3 of 6: putting the files in place"
  WHERE="nginx has not been touched and the website is unaffected. Running the installer again is safe."
  if ! id "$SVC_USER" >/dev/null 2>&1; then
    useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SVC_USER" \
      || die "Could not create the user $SVC_USER. $WHERE"
    note "Created a user with no login and no rights, called $SVC_USER, to run it."
  fi
  mkdir -p "$BACKUP_DIR" && chmod 700 "$BACKUP_DIR" || die "Could not create $BACKUP_DIR. $WHERE"
  if [ -f "$APP_DIR/firstloop-chat.py" ] && [ -f "$UNIT" ]; then
    had_old=1
    cp -p -- "$APP_DIR/firstloop-chat.py" "$BACKUP_DIR/previous-firstloop-chat.py" || die "Could not keep a copy of the version that is installed now. $WHERE"
    cp -p -- "$UNIT" "$BACKUP_DIR/previous-firstloop-chat.service" || die "Could not keep a copy of the version that is installed now. $WHERE"
  fi
  install -d -m 755 -o root -g root "$APP_DIR" || die "Could not create $APP_DIR. $WHERE"
  install -m 644 -o root -g root "$TMP/firstloop-chat.py" "$APP_DIR/firstloop-chat.py" || die "Could not write the program into $APP_DIR. $WHERE"
  install -m 644 -o root -g root "$TMP/firstloop-chat.service" "$UNIT" || die "Could not write $UNIT. $WHERE"
  rm -f "$OLD_LOG_FILE" || true
  note "Program: $APP_DIR/firstloop-chat.py"
  note "Log:     $LOG_FILE (times and counts only, never what anyone typed)"

  say "Step 4 of 6: the API key"
  if [ -f "$ENV_FILE" ]; then
    chown root:root "$ENV_FILE" && chmod 600 "$ENV_FILE" || die "Could not lock down $ENV_FILE. $WHERE"
    note "$ENV_FILE is already there, so it is kept as it is. You will not be asked for the key."
  else
    [ -r /dev/tty ] || die "There is no terminal to ask for the API key on. Run this from an SSH session. $WHERE"
    note "Paste your Anthropic API key and press Enter."
    note "Nothing will appear on screen while you paste. That is deliberate."
    KEY=""
    for attempt in 1 2 3; do
      printf '    API key: ' > /dev/tty
      IFS= read -rs KEY < /dev/tty || KEY=""
      printf '\n' > /dev/tty
      KEY="${KEY//[[:space:]]/}"
      if [[ "$KEY" =~ ^[A-Za-z0-9_-]{20,300}$ ]]; then break; fi
      note "That did not look like an API key (letters, numbers, dashes; no spaces). Try again."
      KEY=""
    done
    [ -n "$KEY" ] || die "No usable key was entered. Run the installer again when you have it. $WHERE"
    case "$KEY" in
      sk-ant-*) ;;
      *) note "Note: Anthropic keys usually start with sk-ant-. Carrying on; the test at the end will show whether it works." ;;
    esac
    ( umask 077
      {
        printf 'ANTHROPIC_API_KEY=%s\n' "$KEY"
        printf 'FL_MODEL=%s\n' "$DEFAULT_MODEL"
        printf 'FL_DAILY_CAP=%s\n' "$DEFAULT_CAP"
      } > "$ENV_FILE" ) || die "Could not write $ENV_FILE. $WHERE"
    unset KEY
    chown root:root "$ENV_FILE" && chmod 600 "$ENV_FILE" || die "Could not lock down $ENV_FILE. $WHERE"
    note "Saved in $ENV_FILE, readable by root only."
  fi

  say "Step 5 of 6: starting the service"
  systemctl daemon-reload || die "systemd would not reload its list of services. $WHERE"
  systemctl enable firstloop-chat.service >/dev/null 2>&1 || die "The service could not be set to start by itself. $WHERE"
  systemctl restart firstloop-chat.service || true
  sleep 2
  if ! systemctl is-active --quiet firstloop-chat.service; then
    note "Last lines from the service:"
    journalctl -u firstloop-chat.service -n 15 --no-pager 2>/dev/null | sed 's/^/      /' >&2 || true
    if [ "$had_old" -eq 1 ]; then
      cp -p -- "$BACKUP_DIR/previous-firstloop-chat.py" "$APP_DIR/firstloop-chat.py" || true
      cp -p -- "$BACKUP_DIR/previous-firstloop-chat.service" "$UNIT" || true
      systemctl daemon-reload || true
      systemctl restart firstloop-chat.service || true
      sleep 2
      if systemctl is-active --quiet firstloop-chat.service; then
        die "The new version did not start, so the version from before was put back and is running again. nginx has not been touched and the website is unaffected."
      fi
      die "The new version did not start, and neither did the version from before when it was put back. nginx has not been touched; the website works, and its Assistant shows as not connected."
    fi
    die "The service did not start. $WHERE"
  fi
  note "Running, and set to start by itself after a reboot."

  say "Step 6 of 6: connecting the website to it"
  WHERE="The service is installed and running. Running the installer again is safe."
  nginx_apply add "${SITE_FILES[@]}"

  # -------------------------------------------------------------------------
  # self-test
  # -------------------------------------------------------------------------
  say "Testing"
  WHERE="Everything is installed and nginx is connected to it; only this last test did not pass. Running the installer again is safe."
  PROBE="$(curl -s --max-time 10 http://127.0.0.1:8788/api/chat || true)"
  case "$PROBE" in
    *'"ok": true'*|*'"ok":true'*) note "The service answers." ;;
    *'no_key'*) die "The service is running but found no API key in $ENV_FILE. Delete that file (sudo rm $ENV_FILE) and run this installer again to enter the key." ;;
    *) die "The service did not answer on this server. Look at: journalctl -u firstloop-chat -n 30" ;;
  esac
  REPLY="$(curl -s --max-time 60 -X POST http://127.0.0.1:8788/api/chat \
    -H 'Content-Type: application/json' \
    --data '{"song":{"tempo":92},"messages":[{"role":"user","content":"Reply with the single word: ready"}]}' || true)"
  case "$REPLY" in
    *'"delta"'*'"done"'*|*'"text"'*)
      printf '\nThe assistant is connected.\n'
      note "Open the site and type something to the Assistant to see it."
      note "IMPORTANT: set a monthly spend limit for this key in the Anthropic Console now, if you have not already."
      note "That limit is the only thing that truly caps the bill."
      ;;
    *'bad_key'*)
      printf '\nNot connected yet: Anthropic did not accept the API key.\n' >&2
      note "Check the key in the Anthropic Console (it may have been deleted, or copied with a piece missing)."
      note "Then run:  sudo rm $ENV_FILE  and run this installer again to enter it afresh."
      exit 1 ;;
    *'"config"'*)
      printf '\nNot connected yet: Anthropic refused the request itself, not the key.\n' >&2
      note "The usual reasons: the model name is wrong or that model has been retired, or the account has no credit."
      note "To change the model: open $ENV_FILE (sudo nano $ENV_FILE), change the line FL_MODEL=... to a current"
      note "model name from https://platform.claude.com/docs/en/models/overview , save, then run:"
      note "    sudo systemctl restart firstloop-chat"
      note "To check credit: the Billing page of the Anthropic Console."
      note "The last line of the log names the reason Anthropic gave (no message text is ever logged): tail -n 3 $LOG_FILE"
      exit 1 ;;
    *'daily_cap'*|*'rate_limited'*)
      printf '\nThe service is installed and working, but it has already reached its own message limit, so the test message was not sent.\n' >&2
      note "That limit clears by itself (the daily one at midnight UTC). The site will work again then."
      exit 1 ;;
    *'no_key'*)
      printf '\nNot connected yet: the service found no API key.\n' >&2
      note "Run:  sudo rm $ENV_FILE  and run this installer again to enter the key."
      exit 1 ;;
    *'upstream'*)
      printf '\nNot connected yet: the service is running, but the AI service did not answer properly.\n' >&2
      note "This is usually temporary (Anthropic busy or unreachable from this server). Try the site in a few minutes."
      note "Details (no message text is ever logged): tail -n 3 $LOG_FILE"
      exit 1 ;;
    *)
      printf '\nNot connected yet: the test message got no usable answer.\n' >&2
      note "Look at: journalctl -u firstloop-chat -n 30   and   tail -n 3 $LOG_FILE"
      exit 1 ;;
  esac
}

main() {
  local tool
  [ "$(id -u)" -eq 0 ] || die "This needs to run as root. Put 'sudo' in front of the command."
  for tool in python3 curl systemctl nginx sha256sum cmp mktemp; do
    command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed on this server, and this installer needs it. Nothing has been changed."
  done
  if [ "${1:-}" = "--remove" ]; then
    [ $# -eq 1 ] || die "Unknown extra option '$2'. Nothing has been changed."
    remove_all
    return 0
  fi
  [ $# -eq 0 ] || die "Unknown option '$1'. Run it with no options to install, or with --remove. Nothing has been changed."
  install_all
}

# Run only when this file is the program being run (a test may load it with
# "source" to use its functions). This must stay the last thing in the file.
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  main "$@"
fi
