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
curl -fsSL https://raw.githubusercontent.com/piscopofran/firstloop/main/server/install-chat.sh -o /tmp/install-chat.sh && sudo bash /tmp/install-chat.sh
```

It says what it is doing at each step. It will ask you to paste the API key
once; nothing shows on screen while you paste, and the key is not written to
the shell history. At the end it sends one tiny test message and prints either
"The assistant is connected." or what went wrong.

Running it again is safe: it keeps the key file it already has and does not
add a second nginx block. Run it again after an update to this folder to get
the new version of the service.

What it adds, and nothing else:

| What | Where |
| --- | --- |
| The program | `/opt/firstloop-chat/firstloop-chat.py` |
| Settings and the key | `/etc/firstloop-chat.env` (root only) |
| The service | `/etc/systemd/system/firstloop-chat.service` |
| A user with no login to run it | `firstloop-chat` |
| A log | `/var/log/firstloop-chat.log` |
| Today's request count | `/var/lib/firstloop-chat/state.json` |
| One `location = /api/chat` block | in the nginx file that has `/api/wish`, right after it |
| Copies of the nginx file from before | `/var/backups/firstloop-chat/` |

It does not touch the firewall, the wish service, cron, or certificates. If
nginx does not accept the change, the nginx file is put back as it was and the
installer stops.

## What it costs

Anthropic bills per use to the account the key belongs to. There is no fixed
fee for this service itself.

**Set a monthly spend limit in the Anthropic Console.** That is the real
safety net: whatever happens on the site, the bill cannot go past it.

For a sense of scale: the default model is Claude Haiku 4.5
(`claude-haiku-4-5-20251001`), listed at $1 per million input tokens and $5
per million output tokens on Anthropic's models overview page
(https://platform.claude.com/docs/en/models/overview, read on 6 October 2026).
One message to the Assistant sends roughly 3,000 to 5,000 input tokens (the
instructions, the description of the song, the recent conversation) and gets a
few hundred back, so about half a cent to one cent per message at those
prices. At the default limit of 1,500 messages a day, a day of the site being
used flat out would be in the region of ten dollars. These are estimates, and
prices change: check https://www.anthropic.com/pricing before relying on them.

## The limits built in

- One address: 30 messages in any 10 minutes, and 200 a day.
- Everyone together: 1,500 messages a day (`FL_DAILY_CAP`). After that the
  Assistant says it has reached its limit for the day; the rest of the app
  keeps working.
- A reply is at most about 1,200 tokens (`FL_MAX_TOKENS`).
- A request is at most 40 KB, with at most 14 messages of at most 4,000
  characters each.
- Only the site itself can use it: requests from other websites are refused.
- The instructions the AI works under are fixed inside the service. A visitor
  cannot replace them, choose a different model, or use the endpoint as a
  general AI service.

## What is recorded

`/var/log/firstloop-chat.log` gets one line per request: the time, a short
scrambled form of the caller's address (it cannot be turned back into the
address, and changes every time the service restarts), the result, and how
many tokens Anthropic counted. **What people type, the songs, and the
answers are never written anywhere on the server.**

Recordings made in the app are never sent at all. The page sends only the
typed message and the notes and settings of the open song.

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
| `FL_DAILY_CAP=` | Most messages answered per day, everyone together | `1500` |
| `FL_MAX_TOKENS=` | Longest reply (the service never allows more than 4096) | `1200` |
| `FL_IP_BURST=` | Messages one address may send in 10 minutes | `30` |
| `FL_IP_DAILY=` | Messages one address may send in a day | `200` |
| `FL_SITE_HOSTS=` | Only needed if the Assistant says it was refused "because it did not come from this site": the site's host name(s), comma separated | (worked out from the request) |

To change the key: `sudo rm /etc/firstloop-chat.env` and run the installer again.

Model names change over time. The current list is at
https://platform.claude.com/docs/en/models/overview.

## Checking on it

```
systemctl status firstloop-chat          # is it running
curl -s http://127.0.0.1:8788/api/chat   # {"ok": true, "model": "..."}
tail /var/log/firstloop-chat.log         # recent requests (no message text)
journalctl -u firstloop-chat -n 30       # if it will not start
```

## Removing it

```
sudo bash /tmp/install-chat.sh --remove
```

(Download the installer again first if `/tmp/install-chat.sh` is gone.) This
stops the service, takes the `/api/chat` block out of nginx (testing nginx
and putting the file back if the test fails), and deletes the program, the
key file, the log and the service user. The site then simply shows the
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
- Protocol: `GET /api/chat` returns `{ok, model}`. `POST /api/chat` takes
  `{"song": {...}, "messages": [{"role", "content"}, ...]}` and answers with a
  `text/event-stream` of `data: {"delta": "..."}` lines ending in
  `data: {"done": true}`, or `data: {"error": "code"}`; or with JSON
  `{"text": "..."}` when `FL_STREAM=0`. Errors before the stream starts are
  JSON `{"error": "code", "message": "..."}` with codes `bad_request`,
  `too_big`, `forbidden`, `rate_limited`, `daily_cap`, `no_key`, `bad_key`,
  `upstream`.
- `FL_UPSTREAM` points the service at a different API address. It exists for
  testing against a local mock.
