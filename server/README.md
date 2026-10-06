# First Loop chat service

This folder is the small program that lets the Assistant in First Loop talk to
Anthropic's AI using **your own API key**, without that key ever reaching
anybody's browser.

- The website stays a static page.
- The page sends the Assistant's messages to `/api/chat` on your own server.
- This service adds your key and passes the message on to Anthropic, then
  sends the answer back as it arrives.

There are no secrets in this folder or anywhere in the repository. The key
lives only in `/etc/firstloop-chat.env` on the server, readable by root only.

## Installing it

On the server (the same one that already runs the site and `/api/wish`), as root:

```
cd ~ && curl -fsSL https://raw.githubusercontent.com/piscopofran/firstloop/main/server/install-chat.sh -o install-chat.sh && sudo bash install-chat.sh
```

It says what it is doing at each step. It will ask you to paste the API key
once; nothing shows on screen while you paste, and the key is not written to
the shell history. At the end it sends one tiny test message and prints either
"The assistant is connected." or what went wrong and what to do about it.
Whenever it stops early it prints a line starting `STOPPED:` that says why and
where things stand.

Running it again is safe: it keeps the key file it already has and does not
add a second nginx block. Run it again after an update to this folder to get
the new version of the service. It prints a short fingerprint (the first 12
characters of the sha256) of the program it installed, so two installs can be
compared. If a new version does not start, the previous one is put back.

How it treats nginx, since nginx also serves other things on this server:

- It first checks that nginx's configuration passes nginx's own test as it
  is. If it does not, it stops before changing anything.
- It only looks at files nginx really loads, and only at a block written
  exactly as `location /api/wish { ... }` (with or without `=` or `^~`).
- It works the change out on a copy, in `/var/backups/firstloop-chat/`, and
  proves that the new file is the old file plus its own marked block and
  nothing else. If it is not completely sure (for example, something else
  follows the closing brace of the `/api/wish` block on the same line), it
  refuses, says which line, and changes nothing.
- Only then does it write the file, ask nginx to test, and reload. If nginx
  objects, or anything fails part-way, every file it wrote is put back from
  its copy and checked, and nginx is not reloaded.

What it adds, and nothing else:

| What | Where |
| --- | --- |
| The program | `/opt/firstloop-chat/firstloop-chat.py` |
| Settings and the key | `/etc/firstloop-chat.env` (root only) |
| The service | `/etc/systemd/system/firstloop-chat.service` |
| A user with no login to run it | `firstloop-chat` |
| A log | `/var/log/firstloop-chat/chat.log` (and one older file, `chat.log.1`) |
| Today's request count | `/var/lib/firstloop-chat/state.json` |
| One `location = /api/chat` block | in the nginx file that has `/api/wish`, right after it |
| Copies of the nginx file from before, and of the previous version of the program | `/var/backups/firstloop-chat/` |

It does not touch the firewall, the wish service, cron, or certificates.

## What it costs

Anthropic bills per use to the account the key belongs to. There is no fixed
fee for this service itself.

**Set a monthly spend limit in the Anthropic Console before you tell anyone
the Assistant is there.** That limit is the only thing that truly caps the
bill. Everything below reduces how fast money can be spent; none of it is a
guarantee.

For a sense of scale: the default model is Claude Haiku 4.5
(`claude-haiku-4-5-20251001`), listed at $1 per million input tokens and $5
per million output tokens on Anthropic's models overview page
(https://platform.claude.com/docs/en/models/overview, read on 6 October 2026).

- **Ordinary use.** One message to the Assistant sends roughly 3,000 to 5,000
  input tokens (the instructions, the description of the song, the recent
  conversation) and gets a few hundred back: about half a cent to one cent.
- **The worst case, in plain words.** The most one request can cost is the
  largest request the service will pass on, plus the longest reply it allows.
  The largest request is 24 KB of text plus the instructions; text can be as
  dense as one token per byte, so call it 27,000 input tokens: 2.7 cents. The
  longest reply is 1,200 tokens: 0.6 cents. So no single message can cost more
  than about 3.3 cents. The service answers at most 600 messages a day, so the
  worst possible day is 600 x 3.3 cents, about **$20**, and the worst possible
  month about $600. That would take somebody deliberately sending the largest
  possible requests all day, every day. A day of real people using the site
  flat out is more like $3 to $6.
- If you change `FL_DAILY_CAP`, `FL_MAX_TOKENS` or the model, the same sum
  applies with the new numbers: (27,000 x input price + reply tokens x output
  price) x messages per day.

These are estimates, and prices change: check https://www.anthropic.com/pricing
before relying on them.

## The limits built in, and what they are not

- One address: 20 messages in any 10 minutes, and 120 a day. An IPv6
  connection is counted by its /64 (the block a home or phone is given), not
  by single address.
- Everyone together: 600 messages a day (`FL_DAILY_CAP`). After that the
  Assistant says it has reached its limit for the day; the rest of the app
  keeps working. The count restarts at midnight UTC.
- A reply is at most about 1,200 tokens (`FL_MAX_TOKENS`).
- A request is at most 24 KB, of which the description of the song at most
  12 KB, with at most 14 messages of at most 4,000 characters each. (A full
  song, 32 bars with all 8 parts filled, measures about 7 KB.)
- The description of the song is checked field by field against what the page
  really sends. Anything else in it is dropped, every name is cut to 60
  characters, and it is given to the AI as data, separate from the
  instructions.
- The instructions the AI works under are fixed inside the service. A visitor
  cannot replace them or choose a different model.

**This is a limited lock, not a perfect one.** The site has no accounts, so
the service cannot know who is asking. It refuses requests that a browser
sends from some other website, but anyone can write a small program that
sends requests straight to `/api/chat` and claims to be the site. Such a
person gets what a visitor gets: the same instructions, the same size limits,
the same per-address and daily limits. They can use up the day's 600 messages
(so the Assistant stops for everyone until midnight UTC), and they can spend
up to the worst-case figure above. They cannot get the key, and cannot make
the bill go past the spend limit you set in the Console. Somebody determined
can also talk the AI into answering off-topic questions within those limits;
the instructions make that unlikely, not impossible.

If the site is ever put behind a CDN or another proxy, "one address" becomes
the proxy's address and the per-address limits stop meaning much; the daily
limit still holds.

## What is recorded

`/var/log/firstloop-chat/chat.log` gets one line per request: the time, a
short scrambled form of the caller's address (it cannot be turned back into
the address, and changes every time the service restarts), the result, and
how many tokens Anthropic counted. When Anthropic refuses a request, the line
also has its status number and the one-word type of the error, and nothing
else of what it said. **What people type, the songs, and the answers are never
written anywhere on the server.** When the log reaches 5 MB it is renamed
`chat.log.1` (replacing the previous one) and a new one is started, so the two
together never take more than about 10 MB.

Recordings made in the app are never sent at all. The page sends only the
messages typed in the current conversation and the notes, settings and track
names of the open song.

## Changing the model or the limits

Edit the settings file and restart:

```
sudo nano /etc/firstloop-chat.env
sudo systemctl restart firstloop-chat
```

| Line | Meaning | Default |
| --- | --- | --- |
| `ANTHROPIC_API_KEY=` | Your key | (asked for at install) |
| `FL_MODEL=` | Which model answers. A larger one such as `claude-sonnet-5-5` is better at changing songs and costs more per message. | `claude-haiku-4-5-20251001` |
| `FL_DAILY_CAP=` | Most messages answered per day, everyone together | `600` |
| `FL_MAX_TOKENS=` | Longest reply (the service never allows more than 4096) | `1200` |
| `FL_IP_BURST=` | Messages one address may send in 10 minutes | `20` |
| `FL_IP_DAILY=` | Messages one address may send in a day | `120` |
| `FL_SITE_HOSTS=` | Only needed if the Assistant says it was refused "because it did not come from this site": the site's host name(s), comma separated | (worked out from the request) |

To change the key: `sudo rm /etc/firstloop-chat.env` and run the installer again.

Model names change over time. The current list is at
https://platform.claude.com/docs/en/models/overview.

## Checking on it

```
systemctl status firstloop-chat             # is it running
curl -s http://127.0.0.1:8788/api/chat      # {"ok": true, "model": "..."}
tail /var/log/firstloop-chat/chat.log       # recent requests (no message text)
journalctl -u firstloop-chat -n 30          # if it will not start
```

## If it stops working

The page shows one of a few fixed sentences. What each means for you:

- **"The assistant is set up incorrectly on this site. The site owner needs
  to check it."** Anthropic refused the request. Look at the last lines of
  the log: `tail -n 5 /var/log/firstloop-chat/chat.log`
  - `bad_key upstream=401` (or 403): the key is wrong, or was deleted in the
    Console. Make a new key there, then `sudo rm /etc/firstloop-chat.env` and
    run the installer again to paste it in.
  - `config upstream=404 type=not_found_error`: the model name no longer
    exists. Models are retired from time to time. Open the settings file
    (`sudo nano /etc/firstloop-chat.env`), change the line `FL_MODEL=...` to
    a current name from https://platform.claude.com/docs/en/models/overview,
    save, and run `sudo systemctl restart firstloop-chat`.
  - `config upstream=400 type=invalid_request_error`: most often the account
    has run out of credit, or has hit the monthly spend limit you set. Check
    the Billing page of the Console.
  After a refused key or a missing model, the page shows "AI not connected"
  for up to ten minutes even once it is fixed; restarting the service clears
  that at once.
- **"The assistant has reached its limit for today on this site."** The 600
  messages for the day are used. It starts again at midnight UTC. If this
  happens on a day when you do not expect that much use, look at the log:
  many lines with the same `ip=` value is one caller.
- **"The AI service did not answer properly just now."** Usually Anthropic is
  busy; it passes. If it lasts, the log line says `upstream=` and a status
  number; 529 and 5xx are on Anthropic's side.
- **"AI not connected"** in the Assistant's header with nothing else: the
  service is not answering at all. `systemctl status firstloop-chat`, then
  `sudo systemctl restart firstloop-chat`.

Running the installer again is always safe and ends with the same test
message, which prints what is wrong in words.

## Removing it

```
cd ~ && sudo bash install-chat.sh --remove
```

(Download the installer again first if `install-chat.sh` is gone.) This takes
the `/api/chat` block out of nginx (testing nginx and putting the file back if
the test fails), stops the service, and deletes the program, the key file,
the log and the service user. It only removes a block that still looks the
way the installer wrote it, between its two marker lines; if the block has
been edited by hand it stops and says so, and nothing is removed. The site then simply shows the
Assistant as "not connected" and keeps its simple built-in commands.

If you are finished with the key, delete it in the Anthropic Console as well.

## For whoever maintains this

- `firstloop-chat.py` is Python 3, standard library only (Ubuntu 24.04 has
  everything it needs). It listens on `127.0.0.1:8788`.
- The system prompt exists twice on purpose: in `index.html` (`ASST_PROMPT`,
  used when the page talks to Claude directly inside the Claude artifact
  viewer) and in `firstloop-chat.py` (`PROMPT_LINES`). They must be identical.
  `python3 server/check-prompt.py` compares them and exits 1 if they differ;
  `python3 server/check-prompt.py --write` copies the page's prompt into the
  service. After changing the prompt, run the installer on the server again.
- Protocol: `GET /api/chat` returns `{ok, model}`, with `ok: false` and a
  `reason` (`no_key`, `bad_key`, `config`) when it cannot answer. `POST /api/chat` takes
  `{"song": {...}, "messages": [{"role", "content"}, ...]}` and answers with a
  `text/event-stream` of `data: {"delta": "..."}` lines ending in
  `data: {"done": true}`, or `data: {"error": "code"}`; or with JSON
  `{"text": "..."}` when `FL_STREAM=0`. Errors before the stream starts are
  JSON `{"error": "code", "message": "..."}` with codes `bad_request`,
  `too_big`, `forbidden`, `rate_limited`, `daily_cap`, `no_key`, `bad_key`
  (upstream 401/403), `config` (upstream 400/404) and `upstream`. No other
  code is ever sent. A stream that ends without `{"done": true}` is
  incomplete; the page shows what arrived and applies nothing from it.
- The song is checked against `SONG_SHAPE` in `firstloop-chat.py`, which
  mirrors `assistantSongState()` in `index.html`. A field added to the page
  must be added there too or it is silently dropped. The song is sent to the
  API inside `<song_state>` tags at the start of the newest user turn, never
  in `system`.
- Both downloaded files end with the line `# firstloop-chat: end of file`.
  The installer refuses a copy without it, so keep it last.
- `FL_UPSTREAM` points the service at a different API address. It exists for
  testing against a local mock.
