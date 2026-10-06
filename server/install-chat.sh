#!/usr/bin/env bash
# First Loop: install the chat service on the server that already serves the site.
#
# Run as root:
#   curl -fsSL https://raw.githubusercontent.com/piscopofran/firstloop/main/server/install-chat.sh -o /tmp/install-chat.sh && sudo bash /tmp/install-chat.sh
#
# To take everything it added away again:
#   sudo bash /tmp/install-chat.sh --remove
#
# It is safe to run more than once. It does not touch the firewall, the wish
# service, cron, or anything it did not add itself.

set -euo pipefail

RAW="${FL_RAW_BASE:-https://raw.githubusercontent.com/piscopofran/firstloop/main/server}"
APP_DIR=/opt/firstloop-chat
ENV_FILE=/etc/firstloop-chat.env
UNIT=/etc/systemd/system/firstloop-chat.service
LOG_FILE=/var/log/firstloop-chat.log
SVC_USER=firstloop-chat
BACKUP_DIR=/var/backups/firstloop-chat
MARK_BEGIN="# firstloop-chat: begin (added by install-chat.sh)"
MARK_END="# firstloop-chat: end"
DEFAULT_MODEL="claude-haiku-4-5-20251001"
DEFAULT_CAP="1500"

say()  { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
die()  { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "This needs to run as root. Put 'sudo' in front of the command."
for tool in python3 curl systemctl nginx; do
  command -v "$tool" >/dev/null 2>&1 || die "'$tool' is not installed on this server, and this installer needs it."
done

# ---------------------------------------------------------------------------
# nginx: find the site by its existing /api/wish location
# ---------------------------------------------------------------------------
nginx_files() {
  # every real file behind sites-enabled and conf.d that has a location for /api/wish
  local f real
  for f in /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*; do
    [ -e "$f" ] || continue
    real="$(readlink -f "$f")"
    [ -f "$real" ] || continue
    if grep -Eq '^[[:space:]]*location[^{#]*/api/wish' "$real"; then
      printf '%s\n' "$real"
    fi
  done | sort -u
}

# Edits one nginx file. $1 = file, $2 = add | remove. Prints "changed" or "same".
nginx_edit() {
  MARK_BEGIN="$MARK_BEGIN" MARK_END="$MARK_END" python3 - "$1" "$2" <<'PY'
import os, re, sys
path, mode = sys.argv[1], sys.argv[2]
begin, end = os.environ["MARK_BEGIN"], os.environ["MARK_END"]
src = open(path, encoding="utf-8").read()

# take out anything this installer added before
cleaned = re.sub(r"\n[ \t]*" + re.escape(begin) + r".*?" + re.escape(end) + r"[ \t]*", "", src, flags=re.S)

def block(indent):
    lines = [
        begin,
        "location = /api/chat {",
        "    proxy_pass http://127.0.0.1:8788;",
        "    proxy_set_header Host $host;",
        "    proxy_set_header X-Real-IP $remote_addr;",
        "    proxy_buffering off;",
        "    proxy_read_timeout 120s;",
        "    client_max_body_size 64k;",
        "}",
        end,
    ]
    return "".join("\n" + indent + l for l in lines)

def end_of_block(text, open_at):
    """Index just after the brace that closes the block opened at open_at."""
    depth, i, n = 0, open_at, len(text)
    while i < n:
        c = text[i]
        if c == "#":                      # a comment runs to the end of the line
            j = text.find("\n", i)
            i = n if j < 0 else j
            continue
        if c in "\"'":                    # a quoted string
            j = i + 1
            while j < n and text[j] != c:
                j += 2 if text[j] == "\\" else 1
            i = j + 1
            continue
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                return i + 1
        i += 1
    return -1

out = cleaned
if mode == "add":
    pat = re.compile(r"^([ \t]*)location[^{#\n]*/api/wish[^{#\n]*\{", re.M)
    pos, pieces, last = 0, [], 0
    found = 0
    for m in pat.finditer(cleaned):
        if m.start() < last:
            continue
        close = end_of_block(cleaned, m.end() - 1)
        if close < 0:
            sys.exit("could not find the end of the /api/wish block in " + path)
        pieces.append(cleaned[pos:close] + block(m.group(1)))
        pos = last = close
        found += 1
    if not found:
        sys.exit("no /api/wish location in " + path)
    out = "".join(pieces) + cleaned[pos:]

if out == src:
    print("same")
else:
    tmp = path + ".firstloop-new"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(out)
    os.chmod(tmp, os.stat(path).st_mode & 0o7777)
    os.chown(tmp, os.stat(path).st_uid, os.stat(path).st_gid)
    os.replace(tmp, path)
    print("changed")
PY
}

# Backs the files up, edits them, tests nginx, and puts them back if the test fails.
nginx_apply() {
  local mode="$1"; shift
  local stamp changed=0 f b result
  stamp="$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$BACKUP_DIR"; chmod 700 "$BACKUP_DIR"
  local -a done_files=() done_backups=()
  for f in "$@"; do
    b="$BACKUP_DIR/$(printf '%s' "$f" | tr '/' '_').$stamp"
    cp -p "$f" "$b"
    note "Copy of $f kept at $b"
    result="$(nginx_edit "$f" "$mode")" || {
      cp -p "$b" "$f"
      die "Could not edit $f. It has been left exactly as it was."
    }
    done_files+=("$f"); done_backups+=("$b")
    [ "$result" = "changed" ] && changed=1
  done
  if [ "$changed" -eq 0 ]; then
    note "nginx already had it that way. Nothing to change."
    return 0
  fi
  if nginx -t >/tmp/firstloop-nginx-test.txt 2>&1; then
    systemctl reload nginx
    note "nginx accepted the change and has been reloaded."
  else
    local i
    for i in "${!done_files[@]}"; do cp -p "${done_backups[$i]}" "${done_files[$i]}"; done
    note "nginx said:"
    sed 's/^/      /' /tmp/firstloop-nginx-test.txt >&2 || true
    die "nginx did not accept the change, so its files were put back exactly as they were. The website is unaffected."
  fi
}

# ---------------------------------------------------------------------------
# --remove
# ---------------------------------------------------------------------------
if [ "${1:-}" = "--remove" ]; then
  say "Removing the First Loop chat service"
  if systemctl list-unit-files firstloop-chat.service >/dev/null 2>&1 && [ -f "$UNIT" ]; then
    systemctl disable --now firstloop-chat.service >/dev/null 2>&1 || true
    note "Service stopped."
  fi
  rm -f "$UNIT"
  systemctl daemon-reload
  mapfile -t marked < <(grep -rlF "$MARK_BEGIN" /etc/nginx/sites-enabled /etc/nginx/sites-available /etc/nginx/conf.d 2>/dev/null | xargs -r -n1 readlink -f | sort -u)
  if [ "${#marked[@]}" -gt 0 ]; then
    say "Taking the /api/chat block out of nginx"
    nginx_apply remove "${marked[@]}"
  else
    note "nginx has no /api/chat block from this installer."
  fi
  rm -rf "$APP_DIR" /var/lib/firstloop-chat
  rm -f "$ENV_FILE" "$LOG_FILE"
  if id "$SVC_USER" >/dev/null 2>&1; then userdel "$SVC_USER" >/dev/null 2>&1 || true; fi
  say "Removed."
  note "The API key file ($ENV_FILE) was deleted. Copies of the nginx files from before are still in $BACKUP_DIR."
  note "If you no longer need the key at all, also delete it in the Anthropic Console."
  exit 0
fi
[ $# -eq 0 ] || die "Unknown option '$1'. Run it with no options to install, or with --remove."

# ---------------------------------------------------------------------------
# install
# ---------------------------------------------------------------------------
say "Step 1 of 6: finding the First Loop site in nginx"
mapfile -t SITE_FILES < <(nginx_files)
[ "${#SITE_FILES[@]}" -gt 0 ] || die "No nginx site with a 'location' for /api/wish was found under /etc/nginx/sites-enabled or /etc/nginx/conf.d. Nothing has been changed."
for f in "${SITE_FILES[@]}"; do note "Found it in $f"; done

say "Step 2 of 6: downloading the service"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL "$RAW/firstloop-chat.py" -o "$TMP/firstloop-chat.py" || die "Could not download firstloop-chat.py from GitHub. Nothing has been changed."
curl -fsSL "$RAW/firstloop-chat.service" -o "$TMP/firstloop-chat.service" || die "Could not download firstloop-chat.service from GitHub. Nothing has been changed."
python3 -m py_compile "$TMP/firstloop-chat.py" 2>/dev/null || die "The downloaded program did not pass a basic check. Nothing has been changed."
grep -q '^ExecStart=' "$TMP/firstloop-chat.service" || die "The downloaded service file looks wrong. Nothing has been changed."
note "Downloaded and checked."

say "Step 3 of 6: putting the files in place"
if ! id "$SVC_USER" >/dev/null 2>&1; then
  useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$SVC_USER"
  note "Created a user with no login and no rights, called $SVC_USER, to run it."
fi
install -d -m 755 -o root -g root "$APP_DIR"
install -m 644 -o root -g root "$TMP/firstloop-chat.py" "$APP_DIR/firstloop-chat.py"
install -m 644 -o root -g root "$TMP/firstloop-chat.service" "$UNIT"
touch "$LOG_FILE"
chown "$SVC_USER:$SVC_USER" "$LOG_FILE"
chmod 640 "$LOG_FILE"
note "Program: $APP_DIR/firstloop-chat.py"
note "Log:     $LOG_FILE (times and counts only, never what anyone typed)"

say "Step 4 of 6: the API key"
if [ -f "$ENV_FILE" ]; then
  chown root:root "$ENV_FILE"; chmod 600 "$ENV_FILE"
  note "$ENV_FILE is already there, so it is kept as it is. You will not be asked for the key."
else
  [ -r /dev/tty ] || die "There is no terminal to ask for the API key on. Run this from an SSH session."
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
  [ -n "$KEY" ] || die "No usable key was entered. Run the installer again when you have it. The website is unaffected."
  case "$KEY" in
    sk-ant-*) ;;
    *) note "Note: Anthropic keys usually start with sk-ant-. Carrying on; the test at the end will show whether it works." ;;
  esac
  ( umask 077
    {
      printf 'ANTHROPIC_API_KEY=%s\n' "$KEY"
      printf 'FL_MODEL=%s\n' "$DEFAULT_MODEL"
      printf 'FL_DAILY_CAP=%s\n' "$DEFAULT_CAP"
    } > "$ENV_FILE" )
  unset KEY
  chown root:root "$ENV_FILE"; chmod 600 "$ENV_FILE"
  note "Saved in $ENV_FILE, readable by root only."
fi

say "Step 5 of 6: starting the service"
systemctl daemon-reload
systemctl enable firstloop-chat.service >/dev/null 2>&1
systemctl restart firstloop-chat.service
sleep 2
if ! systemctl is-active --quiet firstloop-chat.service; then
  note "Last lines from the service:"
  journalctl -u firstloop-chat.service -n 15 --no-pager 2>/dev/null | sed 's/^/      /' >&2 || true
  die "The service did not start. nginx has not been touched and the website is unaffected."
fi
note "Running, and set to start by itself after a reboot."

say "Step 6 of 6: connecting the website to it"
nginx_apply add "${SITE_FILES[@]}"

# ---------------------------------------------------------------------------
# self-test
# ---------------------------------------------------------------------------
say "Testing"
PROBE="$(curl -s --max-time 10 http://127.0.0.1:8788/api/chat || true)"
case "$PROBE" in
  *'"ok": true'*|*'"ok":true'*) note "The service answers." ;;
  *'no_key'*) die "The service is running but found no API key in $ENV_FILE. Delete that file and run this installer again to enter the key." ;;
  *) die "The service did not answer on this server. Look at: journalctl -u firstloop-chat -n 30" ;;
esac
REPLY="$(curl -s --max-time 60 -X POST http://127.0.0.1:8788/api/chat \
  -H 'Content-Type: application/json' \
  --data '{"song":{"tempo":92},"messages":[{"role":"user","content":"Reply with the single word: ready"}]}' || true)"
case "$REPLY" in
  *'"delta"'*|*'"text"'*)
    printf '\nThe assistant is connected.\n'
    note "Open the site and type something to the Assistant to see it."
    note "Set a monthly spend limit for this key in the Anthropic Console if you have not already."
    ;;
  *'bad_key'*)
    printf '\nNot connected yet: Anthropic did not accept the API key.\n' >&2
    note "Check the key in the Anthropic Console, then run:  sudo rm $ENV_FILE  and run this installer again."
    exit 1 ;;
  *'upstream'*)
    printf '\nNot connected yet: the service is running, but the AI service did not answer.\n' >&2
    note "This is often temporary, or the account has no credit. Try the site in a few minutes."
    note "Details (no message text is ever logged): tail $LOG_FILE"
    exit 1 ;;
  *)
    printf '\nNot connected yet: the test message got no usable answer.\n' >&2
    note "Look at: journalctl -u firstloop-chat -n 30   and   tail $LOG_FILE"
    exit 1 ;;
esac
