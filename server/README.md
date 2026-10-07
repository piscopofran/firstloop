# First Loop chat service

This folder is the small program that lets the Assistant in First Loop talk to
Anthropic's AI using **your own API key**, without that key ever reaching
anybody's browser.

- The website stays a static page.
- The page sends the Assistant's messages to `/api/chat` on your own server.
- This service adds your key and passes the message on to Anthropic, then
  sends the answer back as it arrives.
- It also keeps the **invite codes**: who may use the Assistant and how much,
  and it serves the **owner page**, where you make codes, set limits and see
  how the Assistant is used.

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
add a second nginx block (it says "nginx already had it that way"). Run the
same line again after an update to this folder to get the new version of the
service; the key, your limits, the invite codes, the counts and the owner link
all stay as they are. It prints a short fingerprint (the first 12
characters of the sha256) of the program it installed, so two installs can be
compared. If a new version does not start, the previous one is put back.

The last thing it prints the first time is your **owner link**. Bookmark it
then: it is shown once and is not kept anywhere on the server in a form that
can be read back. After that it says whether people need an invite code.

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
| Invite codes, counts and your limits | `/var/lib/firstloop-chat/state.db` (a SQLite database) |
| The scrambled owner token | `/var/lib/firstloop-chat/admin.hash` |
| One `location = /api/chat` block | in the nginx file that has `/api/wish`, right after it |
| Copies of the nginx file from before, and of the previous version of the program | `/var/backups/firstloop-chat/` |

It does not touch the firewall, the wish service, cron, or certificates.

## Invite codes and the owner page

From this version on, **people need an invite code to use the AI**, unless you
decide otherwise. An invite code is the whole account: there is no email, no
password, and nothing about the person is kept except the label you type.

**The owner page** is at `https://<your site>/api/chat?admin`, and it only
opens with the owner link the installer printed:
`https://<your site>/api/chat?admin#<a long secret>`. The secret comes after
the `#`, which browsers never send to a server, so it does not end up in
nginx's log. The page takes it out of the address bar as soon as it has read
it and keeps it for that browser tab only. Anyone who has the link can do
everything on the page, so treat it like a password.

If the link is lost, or someone else has seen it, make a new one. In the
Terminal window connected to the server:

```
cd ~ && curl -fsSL https://raw.githubusercontent.com/piscopofran/firstloop/main/server/install-chat.sh -o install-chat.sh && sudo bash install-chat.sh --new-admin-link
```

It prints a new link and the old one stops working at that moment. Nothing
else is changed and the service is not restarted.

On the owner page:

- **Overview**: messages and estimated cost today, in the last 7 and the last
  30 days; a chart of messages per day; whether the service is running and
  with which model; and the limits (below), which you can change there.
- **Invite codes**: make a code (who it is for, how many messages, counted in
  total, per month or per day), copy it or a ready-made invite sentence,
  switch it off and on, change it, set its used count back to 0, delete it.
  Clicking a code shows how it has been used. Codes look like
  `LOOP-7K3M-QX9T`; capitals or not, and spaces, do not matter when typing
  one in. Months and days are counted in UTC.
- **What people do**: which topics come up, which kinds of change the
  Assistant makes, which parts of the app get used, the equipment people have
  named, and "Asked for but not possible": things people wanted that First
  Loop cannot do.
- **What is recorded**: the same list as further down this page.

A message counts against a code once any of the answer has reached the
person. If the AI service fails before that, nothing is taken off.

Deleting a code stops it working at once. Its past messages stay in the
totals, as "Codes you have deleted".

**People without a code.** The first limit on the Overview page, "Free
messages a day without a code", starts at 0: no code, no Assistant. Set it to,
say, 5 and every visitor gets five messages a day (counted per internet
address; that count starts again if the service restarts). The rest of the app
works for everyone either way.

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

- **Ordinary use.** One message to the Assistant sends roughly 5,500 to 8,000
  input tokens and gets a few hundred back: about two thirds of a cent to one
  cent. Of those input tokens about 4,100 are the instructions (they grew
  with the DJ area and the equipment diagrams); the description of what is on
  screen is 800 to 1,500 (measured: 2.3 KB for a new song, 3.1 KB in the DJ
  area with two tracks loaded and twelve tracks listed, 4.2 KB with a
  controller's diagram as well, 6.9 KB for the fullest possible song); the
  rest is the recent conversation.
- **The worst case, in plain words.** The most one request can cost is the
  largest request the service will pass on, plus the longest reply it allows.
  The largest request is 26 KB of text plus the instructions; text can be as
  dense as one token per byte, so call it 31,000 input tokens: 3.1 cents. The
  longest reply is 1,200 tokens: 0.6 cents. So no single message can cost more
  than about 3.7 cents. The service answers at most 600 messages a day, so the
  worst possible day is 600 x 3.7 cents, about **$22**, and the worst possible
  month about $670. That would take somebody deliberately sending the largest
  possible requests all day, every day. A day of real people using the site
  flat out is more like $4 to $6.
- If you change `FL_DAILY_CAP`, `FL_MAX_TOKENS` or the model, the same sum
  applies with the new numbers: (31,000 x input price + reply tokens x output
  price) x messages per day.

These are estimates, and prices change: check https://www.anthropic.com/pricing
before relying on them.

**The cost figures on the owner page are estimates too.** They are the token
counts Anthropic reports for each answered message, multiplied by two prices
kept under Limits on that page (dollars per million tokens, in and out). They
start at the Haiku 4.5 prices above; if you change the model or Anthropic
changes its prices, change them there. A new price applies to messages from
then on, not to what is already counted. Requests that fail are not in the
estimate although a few of them may still be billed. The invoice from
Anthropic is the real figure.

With invite codes, the most a single code can cost you is its allowance times
the worst-case message above: a code for 300 messages is at most about $11,
and in ordinary use $2 to $3.

## The limits built in, and what they are not

- One address: 20 messages in any 10 minutes, and 120 a day. An IPv6
  connection is counted by its /64 (the block a home or phone is given), not
  by single address.
- Everyone together: 600 messages a day (`FL_DAILY_CAP`). After that the
  Assistant says it has reached its limit for the day; the rest of the app
  keeps working. The count restarts at midnight UTC.
- A reply is at most about 1,200 tokens (`FL_MAX_TOKENS`).
- A request is at most 26 KB, of which the description of the song, the DJ
  decks and the connected equipment at most 14 KB, with at most 14 messages
  of at most 4,000 characters each. (Measured: the fullest possible song, 32
  bars with all 8 parts filled, is 6.9 KB; with two decks loaded and the
  largest equipment diagram on top of it, 10.6 KB. The limit is that plus
  about 30 per cent, because track titles in other alphabets take more
  bytes.)
- The description of the song, the decks and the equipment is checked field
  by field against what the page really sends. Anything else in it is dropped, every name is cut to 60
  characters, and it is given to the AI as data, separate from the
  instructions.
- The instructions the AI works under are fixed inside the service. A visitor
  cannot replace them or choose a different model.

- An invite code answers only as many messages as you gave it. Without a
  code nothing is answered, unless you have allowed free messages.
- The per-address and whole-day limits can be changed on the owner page;
  what is set there wins over the settings file.
- Ten wrong invite codes from one address in ten minutes and that address has
  to wait; five wrong owner links and it is shut out of the owner page for
  ten minutes.

**This is a limited lock, not a perfect one.** With a code required, somebody
without one cannot make the AI answer at all. Somebody WITH a code is who
they say only in the sense that they have the code: codes can be passed on,
so give each person their own and switch off any that goes astray. A person
with a code gets what a visitor gets: the same instructions, the same size
limits, their code's allowance and the per-address and daily limits. If you
allow free messages, anyone can write a small program that sends requests
straight to `/api/chat`, from many addresses, and use up the day's 600
messages (so the Assistant stops for everyone until midnight UTC), spending
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

`/var/lib/firstloop-chat/state.db` holds, as counts only:

- for each invite code: the label and note you typed, its allowance and
  whether it is on; how many messages it has sent (in total, and per day for
  the last 90 days) and when it was last used; the tokens Anthropic counted
  and the cost estimated from them; how often each topic came up; which kinds
  of change the Assistant made (for example `set_tempo`); short names of
  equipment the person said they own; and how often parts of the app were
  used (pressing play, exporting and so on), which the page reports as plain
  counts a few times an hour at most;
- for the site: the same counts for people without a code, your limits and
  prices, and the most recent 200 "asked for but not possible" labels, each
  with the code's label and the date.

The topic, equipment and "not possible" labels are short tags the AI attaches
to its own answer. The service cuts them to a few words and to plain letters
and digits before keeping them. It never keeps what the person typed, what
the Assistant said, a song, or an internet address.

The owner token is kept only as a sha256 scramble
(`/var/lib/firstloop-chat/admin.hash`).

Recordings made in the app are never sent at all. The page sends only the
messages typed in the current conversation; the notes, settings and track
names of the open song; from the DJ area what is on the two decks, where the
mixer's controls are, and the titles, artists, tempo and key of the tracks at
the top of the list on screen (never the music itself); and the names of
connected MIDI and sound devices with the last few controls touched.

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
| `FL_DAILY_CAP=` | Most messages answered per day, everyone together (the owner page can override it) | `600` |
| `FL_OPEN=` | Free messages a day for a visitor without an invite code (the owner page can override it) | `0` |
| `FL_MAX_TOKENS=` | Longest reply (the service never allows more than 4096) | `1200` |
| `FL_IP_BURST=` | Messages one address may send in 10 minutes (the owner page can override it) | `20` |
| `FL_IP_DAILY=` | Messages one address may send in a day (the owner page can override it) | `120` |
| `FL_SITE_HOSTS=` | Only needed if the Assistant says it was refused "because it did not come from this site": the site's host name(s), comma separated | (worked out from the request) |

The four limits marked "the owner page can override it" are easier to change
on the owner page, and take effect at once there. Once a limit has been saved
on the owner page, that value is used and the line in this file is ignored.

To change the key: `sudo rm /etc/firstloop-chat.env` and run the installer again.

Model names change over time. The current list is at
https://platform.claude.com/docs/en/models/overview.

## Checking on it

```
systemctl status firstloop-chat             # is it running
curl -s http://127.0.0.1:8788/api/chat      # {"ok": true, "model": "...", "open": 0, "v": 3}
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
- **The owner page says the owner link is needed or not accepted.** Open the
  full link again (the one with `#` and the long secret), or make a new one
  with `--new-admin-link` as described above. After five wrong tries from one
  address the page is shut to that address for ten minutes.
- **The owner page warns that the database was damaged or is kept in memory.**
  The service carries on either way. A damaged file is moved aside as
  `/var/lib/firstloop-chat/state.db.bad-<time>` (the newest three are kept)
  and an empty one is started, so codes have to be made again. "In memory"
  means the folder could not be written; check it exists and belongs to the
  user `firstloop-chat`, then `sudo systemctl restart firstloop-chat`.
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
the log and the service user. **It also deletes the invite codes, the usage
counts and the owner link, and makes no backup of them.** If you want to keep
them, copy `/var/lib/firstloop-chat/state.db` somewhere first. It only removes a block that still looks the
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
- Protocol, all on `/api/chat`. `GET` returns `{ok, model, open, v}`, with
  `ok: false` and a `reason` (`no_key`, `bad_key`, `config`) when it cannot
  answer; `open` is the free messages a day without a code (0 = code needed).
  `v` (`WIRE_VERSION`, 2 since v29) says which description of the app the
  service understands. The page reads it: to a service that says `v` 2 or
  more it sends `dj`, `equipment` and the fuller `midi` lists; to an older
  one (no `v`) it sends exactly what it always did, because that service
  would drop the new fields and its instructions know nothing of the decks.
  The page and the service can therefore be updated in either order.
  `GET /api/chat?admin` is the owner page. `POST` takes JSON with an `op`:
  - absent or `chat`: `{"song": {...}, "messages": [{"role", "content"}, ...],
    "code": "LOOP-..."}` (code optional). Answers with a `text/event-stream`
    of `data: {"delta": "..."}` lines ending in
    `data: {"done": true, "left": N}` (`left` is null without a code), or
    `data: {"error": "code"}`; or with JSON `{"text": "...", "left": N}` when
    `FL_STREAM=0`. Errors before the stream starts are JSON
    `{"error": "code", "message": "..."}` with codes `bad_request`, `too_big`,
    `forbidden`, `rate_limited`, `daily_cap`, `no_key`, `bad_key` (upstream
    401/403), `config` (upstream 400/404), `upstream`, and for codes
    `need_code` (401), `bad_code` (401), `code_off` (403), `code_spent` (429).
    No other code is ever sent. A stream that ends without `{"done": true}`
    is incomplete; the page shows what arrived and applies nothing from it.
  - `code`: `{"code"}` -> `{ok, label, limit, left, period}`, or
    `{"error": "bad_code" | "code_off"}` with HTTP 200.
  - `usage`: `{"code"?, "counts": {name: int}}` -> `{ok}`. Names not in
    `FEATURES` are dropped; a value adds at most 10,000.
  - `admin.overview`, `admin.codes`, `admin.create`, `admin.update`,
    `admin.delete`, `admin.settings`: need `Authorization: Bearer <token>`;
    401 `auth` otherwise, 429 after five failures from an address in ten
    minutes, 404 `bad_code` for a code that does not exist.
  - `selftest`: the installer's test message. Accepted only from the machine
    itself, with no `X-Real-IP`/`X-Forwarded-*` header (nginx always adds
    `X-Real-IP`, so it cannot come through the website), and with a one-time
    secret the installer writes to `selftest.hash` and deletes afterwards.
- The model's reply is one JSON object. Besides `say` and `actions` it may
  carry `topic`, `gear` and `missing`; `read_envelope` picks those and the
  action types out at the end of a reply for the counts. `say` is not kept.
  Any action name of the right shape is counted, so a new kind of action
  needs nothing here except, if it should read as words on the owner page, a
  line in `ACTION` in the page's script (new topics: `TOPICS` and `TOPIC`).
- Updating from the v27 or v28 service changes nothing in the database: the
  schema is the same (version 1) and the new topics, actions and counts are
  new names in the tables that are already there. The installer leaves the
  database, the key file, the owner link and nginx as they are.
- The database is `state.db` beside `FL_STATE` (`FL_DB` to move it), schema
  version in `PRAGMA user_version`. One connection under one lock. An
  allowance is taken before the AI is called and given back if no text
  arrives, which is what keeps parallel requests within the limit.
- The owner page is the `ADMIN_PAGE` string in `firstloop-chat.py`: one
  document, no outside requests, served with a strict Content-Security-Policy
  (a fresh nonce per request), so it must not gain inline `style=""`
  attributes or event-handler attributes. It builds everything with
  `textContent`.
- The song is checked against `SONG_SHAPE` in `firstloop-chat.py`, which
  mirrors `assistantSongState()` in `index.html`. A field added to the page
  must be added there too or it is silently dropped. The song is sent to the
  API inside `<song_state>` tags at the start of the newest user turn, never
  in `system`.
- Both downloaded files end with the line `# firstloop-chat: end of file`.
  The installer refuses a copy without it, so keep it last.
- `FL_UPSTREAM` points the service at a different API address. It exists for
  testing against a local mock.
