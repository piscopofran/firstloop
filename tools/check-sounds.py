#!/usr/bin/env python3
"""
check-sounds.py: validates sounds/manifest.json and measures every audio file in it.

    python3 tools/check-sounds.py                 # validate + measure, write the report
    python3 tools/check-sounds.py --quick         # validate only (exists, decodes, bytes, ids, ranges, kit pieces)
    python3 tools/check-sounds.py --audition DIR  # also measure the renders made by tools/render-audition.js

The report goes to $FL_SOUNDS_REPORT (default: REPORT.md next to the work folder). It is not part of the
library and is not committed.

Validation (exit code 1 on any failure):
  every file in the manifest exists, decodes with ffmpeg, and the per-instrument / per-kit "bytes" is the
  sum of its files; ids are unique; ranges are sane and no note in a range is more than 3 semitones from
  a sample of every dynamic layer; loop points lie inside the file; every kit has the contract pieces or
  lists them under "absent"; no stray files in sounds/; no instrument above 2.5 MB; the folder below 30 MB.

Measurements, per file (decoded from the MP3 with ffmpeg; --audition compares that with Chromium):
  onset      ms until the envelope first reaches -40 dB of the file's peak (t40, "is there dead air in
             front") and -20 dB (t20); attack = ms until the 10 ms level first comes within 6 dB of the
             level the note settles at (how late a note feels)
  peak, rms  dBFS; loudness = loudest 0.4 s, K-weighted, within the first 1.5 s
  tuning     fundamental (YIN, searched within 4 semitones of the declared note) in cents from the note
  octave     harmonic test of the declared note against the octave below and above (see octave_check)
  clipping   samples at or above 0.999 full scale
  dc         mean of the signal, dBFS
  floor      quietest 50 ms window in the first 75 % of the file, dBFS (an upper bound for the noise floor)
  balance    left minus right RMS, dB (stereo files)
  tail       level of the last 2 ms, dBFS (a click at the end would show here)
  loop       for samples with loop points: "seam" = the step in the waveform's second difference when
             the playhead jumps from loopEnd to loopStart, in dB over the 99.9th percentile of the same
             quantity inside the loop (0 means: no different from what the tone does by itself a few
             dozen times per loop); "step" = the same step in dB relative to the RMS of the loop;
             "swing" = loudest minus quietest 100 ms inside the loop
  held       for samples without loop points on bowed / blown instruments: seconds until the level has
             dropped 6 dB below its level in the first second
Flags: dead air (t40 > 5 ms plucked / struck / drums, > 12 ms bowed / blown); attack > 30 ms plucked /
struck (> 60 ms below C2, where one cycle is that long) or > 150 ms bowed / blown; tuning beyond 20 cents
(45 for pianos, which are stretch-tuned and left as recorded); octave test; clipping; dc above -50 dBFS;
tail above -50 dBFS; balance beyond 10 dB; loop seam more than 12 dB above the loop's own 99.9th
percentile, or more than 6 dB above it with a step above -20 dB of the loop's RMS; held note shorter than 4 s without a loop; loudness
step > 3 dB between neighbouring samples of one layer; tuning step > 25 cents between neighbours.

--audition DIR reads what tools/render-audition.js wrote (the reference player of tools/audition.html run in
Chromium's OfflineAudioContext): for the chromatic run of every instrument the pitch error (cents) and the
loudness of every note with the manifest gain applied; for the long notes of held instruments the same
seam measure at every pass of the loop and the dip in level around it; for all instruments the loudness of
the same phrase (how well "gain" equalises them); for kits the peak of the beat.
"""
import importlib.util
import json
import math
import os
import subprocess
import sys

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location('build_sounds', os.path.join(HERE, 'build-sounds.py'))
bs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bs)
SR = bs.SR
OUT = bs.OUT

PIANOS = ('grand-piano', 'upright-piano')
SLOW = set(i['id'] for i in bs.INSTRUMENTS + bs.ENSEMBLES if i['mode'] == 'slow')


def fail(errors, msg):
    errors.append(msg)
    print('FAIL', msg)


def validate(man, errors):
    seen = set()
    listed = set(['manifest.json', 'CREDITS.md'])
    for inst in man['instruments']:
        if inst['id'] in seen:
            fail(errors, 'duplicate id ' + inst['id'])
        seen.add(inst['id'])
        for k in ('id', 'name', 'family', 'range', 'samples', 'loop', 'release', 'gain', 'bytes', 'licence', 'source', 'credit'):
            if k not in inst:
                fail(errors, '%s: missing field %s' % (inst['id'], k))
        lo, hi = inst['range']
        if not (0 <= lo < hi <= 127):
            fail(errors, '%s: bad range %s' % (inst['id'], inst['range']))
        notes = sorted({s['note'] for s in inst['samples']})
        for n in range(lo, hi + 1):
            if min(abs(n - m) for m in notes) > 3:
                fail(errors, '%s: note %d is more than 3 semitones from any sample' % (inst['id'], n))
        top = max(s['vel'] for s in inst['samples'])
        topnotes = sorted({s['note'] for s in inst['samples'] if s['vel'] == top})
        for n in range(lo, hi + 1):
            if min(abs(n - m) for m in topnotes) > 3:
                fail(errors, '%s: note %d is more than 3 semitones from any loud-layer sample' % (inst['id'], n))
        total = 0
        keys = set()
        if inst['gain'] > 0:
            fail(errors, '%s: gain above 0' % inst['id'])
        has_loop = any('loopStart' in s for s in inst['samples'])
        if bool(inst['loop']) != has_loop:
            fail(errors, '%s: "loop" does not match the samples' % inst['id'])
        for s in inst['samples']:
            if ('loopStart' in s) != ('loopEnd' in s) or ('loopStart' in s and not (0.2 < s['loopStart'] < s['loopEnd'] - 0.5)):
                fail(errors, '%s: bad loop points %s' % (inst['id'], s))
            if (s['note'], s['vel']) in keys:
                fail(errors, '%s: duplicate note/vel %s' % (inst['id'], s))
            keys.add((s['note'], s['vel']))
            p = os.path.join(OUT, s['file'])
            listed.add(s['file'])
            if not os.path.isfile(p):
                fail(errors, 'missing file ' + s['file'])
                continue
            total += os.path.getsize(p)
        if total != inst['bytes']:
            fail(errors, '%s: bytes %d != sum of files %d' % (inst['id'], inst['bytes'], total))
        if total > 2.5e6:
            fail(errors, '%s: %.2f MB is above 2.5 MB' % (inst['id'], total / 1e6))
    for kit in man['kits']:
        if kit['id'] in seen:
            fail(errors, 'duplicate id ' + kit['id'])
        seen.add(kit['id'])
        files = set()
        for piece, fl in kit['pieces'].items():
            if not fl:
                fail(errors, '%s: empty piece %s' % (kit['id'], piece))
            files.update(fl)
        for piece, layers in kit.get('layers', {}).items():
            for layer in layers:
                files.update(layer['files'])
            for layer in layers:
                if not layer['files']:
                    fail(errors, '%s: empty layer in %s' % (kit['id'], piece))
            if layers[-1]['files'] != kit['pieces'].get(piece):
                fail(errors, '%s: pieces.%s is not the loudest layer' % (kit['id'], piece))
        for piece in ('kick', 'snare', 'rim', 'hat_closed', 'hat_open', 'tom_low', 'tom_mid', 'tom_high', 'ride', 'crash', 'shaker', 'tambourine', 'clap'):
            if piece not in kit['pieces'] and piece not in kit.get('absent', []):
                fail(errors, '%s: piece %s neither present nor marked absent' % (kit['id'], piece))
        total = 0
        for f in files:
            listed.add(f)
            p = os.path.join(OUT, f)
            if not os.path.isfile(p):
                fail(errors, 'missing file ' + f)
                continue
            total += os.path.getsize(p)
        if total != kit['bytes']:
            fail(errors, '%s: bytes %d != sum of files %d' % (kit['id'], kit['bytes'], total))
    size = 0
    for root, _, fs in os.walk(OUT):
        for f in fs:
            rel = os.path.relpath(os.path.join(root, f), OUT)
            size += os.path.getsize(os.path.join(root, f))
            if rel not in listed:
                fail(errors, 'file not in manifest: ' + rel)
    if size > 30e6:
        fail(errors, 'sounds/ is %.1f MB, above 30 MB' % (size / 1e6))
    return size


def all_files(man):
    """[(file, kind, owner id, note or None, vel, piece or None)] without duplicates."""
    out, seen = [], set()
    for inst in man['instruments']:
        for s in inst['samples']:
            out.append((s['file'], 'inst', inst['id'], s['note'], s['vel'], None))
            seen.add(s['file'])
    for kit in man['kits']:
        for piece, layers in kit.get('layers', {}).items():
            for layer in layers:
                for f in layer['files']:
                    if f not in seen:
                        seen.add(f)
                        out.append((f, 'kit', f.split('/')[0], None, layer['vel'], piece))
    return out


def measure(path, kind, owner, note):
    x = bs.decode(os.path.join(OUT, path))
    env = bs.envelope(x)
    peak = float(env.max()) if len(env) else 0.0
    m = dict(file=path, frames=len(x), channels=x.shape[1], secs=round(len(x) / SR, 3), bytes=os.path.getsize(os.path.join(OUT, path)))
    m['peak_db'] = round(bs.db(peak), 1)
    m['rms_db'] = round(bs.db(math.sqrt(float(np.mean(x * x)))), 1)
    m['loud'] = round(bs.loud_mm(x), 1)
    m['attack_ms'] = attack_ms(x)
    a20 = np.nonzero(env >= peak * 0.1)[0]
    a40 = np.nonzero(env >= peak * 0.01)[0]
    m['t20_ms'] = round(1000.0 * int(a20[0]) / SR, 1) if len(a20) else None
    m['t40_ms'] = round(1000.0 * int(a40[0]) / SR, 1) if len(a40) else None
    m['clip'] = int(np.sum(env >= 0.999))
    m['dc_db'] = round(bs.db(float(np.max(np.abs(x.mean(axis=0))))), 1)
    w = int(0.05 * SR)
    n75 = int(len(x) * 0.75)
    mono = x.mean(axis=1)
    if n75 > 2 * w:
        cs = np.concatenate(([0.0], np.cumsum(mono[:n75] ** 2)))
        win = (cs[w:] - cs[:-w]) / w
        m['floor_db'] = round(bs.db(math.sqrt(float(win.min()))), 1)
    else:
        m['floor_db'] = None
    if x.shape[1] == 2:
        l, r = math.sqrt(float(np.mean(x[:, 0] ** 2))), math.sqrt(float(np.mean(x[:, 1] ** 2)))
        m['bal_db'] = round(bs.db(l) - bs.db(r), 1)
    else:
        m['bal_db'] = None
    m['tail_db'] = round(bs.db(float(env[-int(0.002 * SR):].max())), 1) if len(env) > 100 else None
    if note is not None:
        f, cents, frames = bs.measure_f0(x, note)
        m['cents'] = None if cents is None else round(cents, 1)
        m['f0_frames'] = frames
        m['octave'] = octave_check(mono, note)
    return m, x


def attack_ms(x):
    """ms until the 10 ms RMS first comes within 6 dB of the level the note settles at (the loudest
    100 ms within the first 0.6 s). None for very short files."""
    m = x.mean(axis=1)
    w, h = int(0.01 * SR), int(0.002 * SR)
    if len(m) < int(0.15 * SR):
        return None
    cs = np.concatenate(([0.0], np.cumsum(m * m)))
    idx = np.arange(0, min(len(m), int(0.7 * SR)) - w, h)
    r10 = np.sqrt((cs[idx + w] - cs[idx]) / w)
    w2 = int(0.1 * SR)
    idx2 = np.arange(0, min(len(m), int(0.7 * SR)) - w2, h)
    ref = float(np.sqrt(np.max(cs[idx2 + w2] - cs[idx2]) / w2)) if len(idx2) else float(r10.max())
    hit = np.nonzero(r10 >= ref * 0.5)[0]
    return round(1000.0 * int(hit[0]) * h / SR, 1) if len(hit) else None


def octave_check(mono, note):
    """Is the sample really in the octave the manifest says? Looks at the spectrum 0.08-0.8 s after
    the start. With f = the declared fundamental:
      'low'   if the partials halfway between the harmonics (0.5 f, 1.5 f, 2.5 f) are within 15 dB of the
              harmonics themselves: the sound is an octave (or more) lower than declared;
      'high'  if the odd harmonics (f, 3 f, 5 f) are all more than 30 dB below the even ones: the sound is
              an octave higher than declared;
      'ok'    otherwise. Returns (verdict, half-partials dB, odd-minus-even dB)."""
    a = int(0.08 * SR)
    seg = mono[a:a + 32768]
    if len(seg) < 4096:
        seg = mono[:32768]
    if len(seg) < 1024:
        return ['?', None, None]
    nfft = 131072
    sp = np.abs(np.fft.rfft(seg * np.hanning(len(seg)), nfft))
    fr = np.fft.rfftfreq(nfft, 1.0 / SR)
    f0 = bs.midi_hz(note)

    def pk(k):
        if f0 * k > SR / 2 - 200 or f0 * k < 18:
            return None
        sel = (fr >= f0 * k * 0.972) & (fr <= f0 * k * 1.028)
        return float(sp[sel].max()) if sel.any() else None

    def lvl(ks):
        v = [pk(k) for k in ks]
        v = [x for x in v if x is not None]
        return bs.db(max(v)) if v else None
    harm, half = lvl((1, 2, 3, 4)), lvl((0.5, 1.5, 2.5))
    odd, even = lvl((1, 3, 5)), lvl((2, 4, 6))
    hd = None if harm is None or half is None else round(half - harm, 1)
    od = None if odd is None or even is None else round(odd - even, 1)
    verdict = 'ok'
    if hd is not None and hd > -15:
        verdict = 'low'
    elif od is not None and od < -30:
        verdict = 'high'
    return [verdict, hd, od]


def loop_check(x, s):
    """Seam measurements for one sample with loop points (see the header). x: decoded (n, ch)."""
    a, b = int(round(s['loopStart'] * SR)), int(round(s['loopEnd'] * SR))
    if not (2048 < a < b <= len(x) - 64):
        return dict(error='loop points outside the file')
    m = x.mean(axis=1)
    inner = np.abs(np.diff(m[a:b], 2))
    ref = float(np.percentile(inner, 99.9)) or 1e-9
    z = np.concatenate([m[b - 64:b], m[a:a + 64]])
    seam = float(np.max(np.abs(np.diff(z, 2))[60:66]))
    w = int(0.05 * SR)
    r = lambda v: math.sqrt(float(np.mean(v * v)) + 1e-20)
    w2 = int(0.1 * SR)
    blocks = [r(m[i:i + w2]) for i in range(a, b - w2, w2 // 2)]
    return dict(seam_db=round(bs.db(seam / ref), 1), step_db=round(bs.db(seam / r(m[a:b])), 1),
                swing_db=round(bs.db(max(blocks) / min(blocks)), 1), len_s=round((b - a) / SR, 2),
                after_end_s=round(len(x) / SR - s['loopEnd'], 2))


def held_seconds(x):
    m = x.mean(axis=1)
    w = int(0.1 * SR)
    cs = np.concatenate(([0.0], np.cumsum(m * m)))
    idx = np.arange(0, len(m) - w, w // 2)
    rms = np.sqrt((cs[idx + w] - cs[idx]) / w)
    if len(rms) < 12:
        return round(len(m) / SR, 2)
    ref = float(np.median(rms[4:20]))
    low = np.nonzero(rms[4:] < ref * 0.5)[0]
    return round((int(low[0]) + 4) * (w // 2) / SR, 2) if len(low) else round(len(m) / SR, 2)


def flags_for(m, kind, owner, note):
    fl = []
    slow = owner in SLOW
    if m['t40_ms'] is None:
        fl.append('silent')
    elif m['t40_ms'] > (12.0 if slow else 5.0):
        fl.append('dead air %.1f ms' % m['t40_ms'])
    att = m.get('attack_ms')
    if att is not None and kind == 'inst':
        lim = 150.0 if slow else (60.0 if note is not None and note < 36 else 30.0)
        if att > lim:
            fl.append('attack %.0f ms' % att)
    if m['clip']:
        fl.append('clip %d' % m['clip'])
    if m['dc_db'] is not None and m['dc_db'] > -50:
        fl.append('dc %.0f dB' % m['dc_db'])
    if m['tail_db'] is not None and m['tail_db'] > -50:
        fl.append('tail %.0f dB' % m['tail_db'])
    if m['bal_db'] is not None and abs(m['bal_db']) > 10:
        fl.append('balance %+.1f dB' % m['bal_db'])
    if note is not None:
        lim = 45 if owner in PIANOS else 20
        if m.get('cents') is None:
            fl.append('pitch not measurable')
        elif abs(m['cents']) > lim:
            fl.append('tuning %+.0f c' % m['cents'])
        if m.get('octave') and m['octave'][0] not in ('ok',):
            fl.append('octave test: %s (half partials %s dB, odd-even %s dB)' % tuple(m['octave']))
    lp = m.get('loop')
    if lp:
        if lp.get('error'):
            fl.append(lp['error'])
        else:
            if lp['seam_db'] > 12 or (lp['seam_db'] > 6 and lp['step_db'] > -20):
                fl.append('loop seam %+.1f dB (step %.0f dB re the loop)' % (lp['seam_db'], lp['step_db']))
    elif slow and m.get('held_s') is not None and m['held_s'] < 4.0:
        fl.append('held only %.1f s, no loop' % m['held_s'])
    return fl


# ---------------------------------------------------------------------------------------------
# Audition renders (tools/render-audition.js): what the reference player produces in Chromium
# ---------------------------------------------------------------------------------------------
def read_wav(path):
    return bs.decode(path)


def analyse_audition(man, d, meas, errors):
    res = dict(instruments={}, kits={}, decode=None)
    # 1. Chromium's decoder against ffmpeg's: same length, note starts at the same sample
    bp = os.path.join(d, 'browser-decode.json')
    if os.path.exists(bp):
        rows = json.load(open(bp))
        bad, dlen, dlead = [], [], []
        for r in rows:
            if r.get('error'):
                bad.append(r['file'])
                fail(errors, 'Chromium decodeAudioData failed: %s (%s)' % (r['file'], r['error']))
                continue
            m = meas.get(r['file'])
            if not m:
                continue
            dlen.append(r['length'] - m['frames'])
            if m.get('i20') is not None and r['first20'] >= 0:
                dlead.append(r['first20'] - m['i20'])
        res['decode'] = dict(files=len(rows), failed=bad, length_diff=[min(dlen), max(dlen)] if dlen else None,
                             onset_diff=[min(dlead), max(dlead)] if dlead else None)
        if dlen and (min(dlen) != 0 or max(dlen) != 0):
            fail(errors, 'Chromium and ffmpeg decode to different lengths (%d .. %d samples)' % (min(dlen), max(dlen)))
        off = sum(1 for v in dlead if abs(v) > 8)
        res['decode']['onset_median'] = int(np.median(dlead)) if dlead else None
        res['decode']['onset_off'] = off
        if dlead and (abs(np.median(dlead)) > 2 or off > len(dlead) * 0.02):
            fail(errors, 'Chromium and ffmpeg disagree about where the note starts (median %d samples, %d files more than 8 samples apart)' % (np.median(dlead), off))
    for inst in man['instruments']:
        iid = inst['id']
        r = {}
        # 2. chromatic run: pitch and level of every note
        jp = os.path.join(d, iid + '_scale.json')
        if os.path.exists(jp):
            info = json.load(open(jp))
            x = read_wav(os.path.join(d, iid + '_scale.wav'))
            notes = []
            for n in info['notes']:
                a = int((n['t'] + 0.05) * SR)
                b = int((n['t'] + n['dur']) * SR)
                seg = x[a:b]
                f, cents, frames = bs.measure_f0(seg, n['midi'], 0, (0.0, 10.0))
                ln = int(n['t'] * SR)
                loud = bs.loud_mm(x[ln:ln + int((n['dur'] + n['release']) * SR)], None)
                notes.append(dict(midi=n['midi'], shift=n['shift'], cents=None if cents is None else round(cents, 1), loud=round(loud, 1)))
            cs = [abs(n['cents']) for n in notes if n['cents'] is not None]
            ls = [n['loud'] for n in notes]
            steps = [(bs.midi_name(p['midi']), bs.midi_name(q['midi']), round(q['loud'] - p['loud'], 1)) for p, q in zip(notes, notes[1:]) if abs(q['loud'] - p['loud']) > 3.0]
            worst = max(notes, key=lambda n: abs(n['cents']) if n['cents'] is not None else -1)
            r.update(scale_notes=len(notes), max_shift=max(abs(n['shift']) for n in notes), unmeasured=sum(1 for n in notes if n['cents'] is None),
                     worst_cents=worst['cents'], worst_cents_note=bs.midi_name(worst['midi']), median_abs_cents=round(float(np.median(cs)), 1) if cs else None,
                     loud_median=round(float(np.median(ls)), 1), loud_span=round(max(ls) - min(ls), 1), steps=steps,
                     scale_peak_db=round(bs.db(info['peak']), 1), notes=notes)
        # 3. the same phrase on every instrument: how well does "gain" equalise them
        for what in ('phrase', 'chord'):
            jp = os.path.join(d, iid + '_%s.json' % what)
            if os.path.exists(jp):
                info = json.load(open(jp))
                x = read_wav(os.path.join(d, iid + '_%s.wav' % what))
                end = max(n['t'] + n['dur'] for n in info['notes'])
                r[what + '_lufs'] = round(bs.loud_mm(x[:int((end + 0.5) * SR)], None), 1)
                r[what + '_peak_db'] = round(bs.db(info['peak']), 1)
        # 4. long notes: every pass of the loop
        jp = os.path.join(d, iid + '_hold.json')
        if os.path.exists(jp):
            info = json.load(open(jp))
            x = read_wav(os.path.join(d, iid + '_hold.wav')).mean(axis=1)
            seams, worst_seam, worst_dip, short = 0, None, None, []
            for n in info['notes']:
                t0 = int(round(n['t'] * SR))
                if n.get('loopStart') is None:
                    # one-shot: how long does it last
                    seg = x[t0:t0 + int(n['dur'] * SR)]
                    short.append((bs.midi_name(n['midi']), held_seconds(seg[:, None])))
                    continue
                L = n['loopEnd'] - n['loopStart']
                body = x[t0 + int(n['loopStart'] * SR): t0 + int(n['dur'] * SR)]
                ref = float(np.percentile(np.abs(np.diff(body, 2)), 99.9)) or 1e-9
                w = int(0.02 * SR)
                cs_ = np.concatenate(([0.0], np.cumsum(body * body)))
                blocks = np.sqrt((cs_[w::w // 2] - cs_[:-w:w // 2]) / w)
                med = float(np.median(blocks)) or 1e-9
                k = 0
                while True:
                    ts = n['t'] + (n['loopEnd'] + k * L) / n['rate']
                    if ts > n['t'] + n['dur'] - 0.05:
                        break
                    i = int(round(ts * SR))
                    sd = bs.db(float(np.max(np.abs(np.diff(x[i - 40:i + 40], 2)))) / ref)
                    around = x[i - w:i + w]
                    dip = bs.db(math.sqrt(float(np.mean(around * around)) + 1e-20) / med)
                    seams += 1
                    if worst_seam is None or sd > worst_seam[0]:
                        worst_seam = (round(sd, 1), bs.midi_name(n['midi']))
                    if worst_dip is None or abs(dip) > abs(worst_dip[0]):
                        worst_dip = (round(dip, 1), bs.midi_name(n['midi']))
                    k += 1
                # is the note still sounding at the end of the 9 s
                endseg = x[t0 + int((n['dur'] - 0.5) * SR): t0 + int(n['dur'] * SR)]
                first = x[t0 + int(0.5 * SR): t0 + int(1.5 * SR)]
                n_end = bs.db(math.sqrt(float(np.mean(endseg * endseg)) + 1e-20) / (math.sqrt(float(np.mean(first * first))) + 1e-20))
                if n_end < -6:
                    short.append((bs.midi_name(n['midi']), 'level %.0f dB after 9 s' % n_end))
            r.update(hold_notes=len(info['notes']), hold_seams=seams, hold_worst_seam=worst_seam, hold_worst_dip=worst_dip, hold_short=short)
        res['instruments'][iid] = r
    for kit in man['kits']:
        r = {}
        for what in ('beat', 'pieces'):
            jp = os.path.join(d, kit['id'] + '_%s.json' % what)
            if os.path.exists(jp):
                info = json.load(open(jp))
                x = read_wav(os.path.join(d, kit['id'] + '_%s.wav' % what))
                r[what + '_peak_db'] = round(bs.db(info['peak']), 1)
                r[what + '_hits'] = len(info['hits'])
                r[what + '_files'] = len({h['file'] for h in info['hits']})
                if what == 'beat':
                    end = max(h['t'] for h in info['hits']) + 0.5
                    r['beat_lufs'] = round(bs.loud_mm(x[:int(end * SR)], None), 1)
        res['kits'][kit['id']] = r
    return res


# ---------------------------------------------------------------------------------------------
def table(rows, head):
    out = ['| ' + ' | '.join(head) + ' |', '|' + '|'.join(['---'] * len(head)) + '|']
    for r in rows:
        out.append('| ' + ' | '.join('' if v is None else str(v) for v in r) + ' |')
    return '\n'.join(out)


def report_path():
    return os.environ.get('FL_SOUNDS_REPORT') or os.path.join(os.path.dirname(bs.WORK.rstrip('/')), 'REPORT.md')


def main(argv):
    quick = '--quick' in argv
    aud = argv[argv.index('--audition') + 1] if '--audition' in argv else None
    man = json.load(open(os.path.join(OUT, 'manifest.json')))
    errors = []
    size = validate(man, errors)
    files = all_files(man)
    print('%d instruments, %d kits, %d audio files, %.2f MB' % (len(man['instruments']), len(man['kits']), len(files), size / 1e6))
    if quick:
        for f, kind, owner, note, vel, piece in files:
            r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', os.path.join(OUT, f)], capture_output=True, text=True)
            if r.returncode != 0 or not r.stdout.strip():
                fail(errors, 'does not decode: ' + f)
        print('validation', 'FAILED' if errors else 'ok')
        return 1 if errors else 0
    sample_of = {s['file']: s for inst in man['instruments'] for s in inst['samples']}
    meas = {}
    for f, kind, owner, note, vel, piece in files:
        try:
            m, x = measure(f, kind, owner, note)
        except Exception as e:
            fail(errors, 'does not decode: %s (%s)' % (f, e))
            continue
        m.update(kind=kind, owner=owner, note=note, vel=vel, piece=piece)
        env = bs.envelope(x)
        a20 = np.nonzero(env >= float(env.max()) * 0.1)[0]
        m['i20'] = int(a20[0]) if len(a20) else None
        s = sample_of.get(f)
        if s and 'loopStart' in s:
            m['loop'] = loop_check(x, s)
        elif kind == 'inst' and owner in SLOW:
            m['held_s'] = held_seconds(x)
        m['flags'] = flags_for(m, kind, owner, note)
        meas[f] = m
    # neighbour steps inside one layer
    steps = {}
    for inst in man['instruments']:
        st = []
        for vel in sorted({s['vel'] for s in inst['samples']}):
            layer = sorted([s for s in inst['samples'] if s['vel'] == vel], key=lambda s: s['note'])
            for a, b in zip(layer, layer[1:]):
                ma, mb = meas.get(a['file']), meas.get(b['file'])
                if not ma or not mb:
                    continue
                if abs(mb['loud'] - ma['loud']) > 3.0:
                    st.append('v%d %s>%s level %+.1f dB' % (vel, bs.midi_name(a['note']), bs.midi_name(b['note']), mb['loud'] - ma['loud']))
                if ma.get('cents') is not None and mb.get('cents') is not None and abs(mb['cents'] - ma['cents']) > 25:
                    st.append('v%d %s>%s tuning %+.0f c' % (vel, bs.midi_name(a['note']), bs.midi_name(b['note']), mb['cents'] - ma['cents']))
        steps[inst['id']] = st
    aud_res = analyse_audition(man, aud, meas, errors) if aud else None
    os.makedirs(bs.WORK, exist_ok=True)
    json.dump(dict(files=meas, steps=steps, audition=aud_res), open(os.path.join(bs.WORK, 'measurements.json'), 'w'), indent=1)
    write_report(man, meas, steps, aud_res, errors, size)
    nflag = sum(1 for m in meas.values() if m['flags'])
    print('measured %d files, %d with flags; validation %s; report: %s' % (len(meas), nflag, 'FAILED' if errors else 'ok', report_path()))
    return 1 if errors else 0


def rng(vals, fmt='%.1f'):
    vals = [v for v in vals if v is not None]
    if not vals:
        return ''
    return (fmt + ' .. ' + fmt) % (min(vals), max(vals))


def write_report(man, meas, steps, aud, errors, size):
    L = []
    L.append('# Sound library: measurement report')
    L.append('')
    L.append('Written by `tools/check-sounds.py`. The per-file numbers are measured on the MP3 files as decoded by ffmpeg; the audition section is '
             'measured on what Chromium renders with the reference player of `tools/audition.html`. '
             'Measurements catch timing, level, tuning, loop and file faults, not whether an instrument sounds good: nobody has listened to these files.')
    L.append('')
    total = sum(i['bytes'] for i in man['instruments'])
    kfiles = {m['file']: m['bytes'] for m in meas.values() if m['kind'] == 'kit'}
    ktotal = sum(kfiles.values())
    L.append('Validation: %s. %d instruments, %d kits, %d audio files; `sounds/` is %.2f MB in total (instruments %.2f MB, kits and percussion %.2f MB).'
             % ('FAILED: ' + '; '.join(errors) if errors else 'passed', len(man['instruments']), len(man['kits']), len(meas), size / 1e6, total / 1e6, ktotal / 1e6))
    L.append('')
    allc = [(abs(m['cents']), f) for f, m in meas.items() if m.get('cents') is not None and m['owner'] not in PIANOS]
    pc = [(abs(m['cents']), f) for f, m in meas.items() if m.get('cents') is not None and m['owner'] in PIANOS]
    L.append('## Summary')
    L.append('')
    if allc:
        w = max(allc)
        L.append('- Tuning of the files (not pianos): worst %.0f cents (`%s`), median %.1f cents.' % (w[0], w[1], float(np.median([c for c, _ in allc]))))
    if pc:
        w = max(pc)
        L.append('- Tuning of the piano files (stretch-tuned on purpose, not corrected): worst %.0f cents (`%s`), median %.1f cents.' % (w[0], w[1], float(np.median([c for c, _ in pc]))))
    octs = [f for f, m in meas.items() if m.get('octave') and m['octave'][0] != 'ok']
    L.append('- Octave test: %d of %d pitched files flagged%s.' % (len(octs), sum(1 for m in meas.values() if m.get('octave')), (': ' + ', '.join('`%s`' % f for f in octs)) if octs else ''))
    L.append('- Clipping: %d files. Loudest file peak %.1f dBFS.' % (sum(1 for m in meas.values() if m['clip']), max(m['peak_db'] for m in meas.values())))
    loops = [m['loop'] for m in meas.values() if m.get('loop') and not m['loop'].get('error')]
    if loops:
        L.append('- Loops: %d samples. Seam step in dB over the loop\'s own 99.9th percentile of the same measure: worst %+.1f, median %+.1f; '
                 'the same step relative to the RMS of the loop: worst %.0f dB. Loop length %.1f .. %.1f s.'
                 % (len(loops), max(l['seam_db'] for l in loops), float(np.median([l['seam_db'] for l in loops])),
                    max(l['step_db'] for l in loops), min(l['len_s'] for l in loops), max(l['len_s'] for l in loops)))
    perc_on = [m['t40_ms'] for m in meas.values() if m['t40_ms'] is not None and m['owner'] not in SLOW]
    slow_on = [m['t40_ms'] for m in meas.values() if m['t40_ms'] is not None and m['owner'] in SLOW]
    L.append('- Dead air before the sound (time to -40 dB of the peak): plucked / struck / drums worst %.1f ms, median %.1f ms; bowed / blown worst %.1f ms, median %.1f ms.'
             % (max(perc_on), float(np.median(perc_on)), max(slow_on) if slow_on else 0, float(np.median(slow_on)) if slow_on else 0))
    pa = [m['attack_ms'] for m in meas.values() if m.get('attack_ms') is not None and m['kind'] == 'inst' and m['owner'] not in SLOW]
    sa = [m['attack_ms'] for m in meas.values() if m.get('attack_ms') is not None and m['kind'] == 'inst' and m['owner'] in SLOW]
    L.append('- Attack (time until the note is within 6 dB of its settled level): plucked / struck worst %.0f ms, median %.0f ms; bowed / blown worst %.0f ms, median %.0f ms.'
             % (max(pa), float(np.median(pa)), max(sa) if sa else 0, float(np.median(sa)) if sa else 0))
    if aud:
        dc = aud.get('decode')
        if dc:
            L.append('- Chromium `decodeAudioData`: %d of %d files decoded; decoded length against ffmpeg: %s samples; first sample at -20 dB of the peak against ffmpeg: median %s samples, '
                     '%d files more than 8 samples apart (range %s; these are slow swells where the threshold is crossed at a slightly different cycle). The MP3 encoder padding is removed by the decoder: no start offset is needed.'
                     % (dc['files'] - len(dc['failed']), dc['files'], dc['length_diff'], dc.get('onset_median'), dc.get('onset_off', 0), dc['onset_diff']))
        ai = aud['instruments']
        wc = [(abs(v['worst_cents']), k, v['worst_cents_note']) for k, v in ai.items() if v.get('worst_cents') is not None]
        np_ = [k for k in ai if k not in PIANOS]
        if wc:
            w = max(c for c in wc if c[1] not in PIANOS)
            L.append('- Rendered chromatic runs: worst pitch error %.0f cents (%s, %s) outside the pianos; %d notes could not be measured.'
                     % (w[0], w[1], w[2], sum(v.get('unmeasured', 0) for v in ai.values())))
        ph = [(v['phrase_lufs'], k) for k, v in ai.items() if 'phrase_lufs' in v]
        if ph:
            L.append('- Same tune on every instrument, manifest gain applied, loudest 0.4 s: %.1f .. %.1f LUFS (spread %.1f dB; quietest %s, loudest %s).'
                     % (min(ph)[0], max(ph)[0], max(ph)[0] - min(ph)[0], min(ph)[1], max(ph)[1]))
            chd = [(v['chord_lufs'], k) for k, v in ai.items() if 'chord_lufs' in v]
            L.append('- Same four-note chord on every instrument, loudest 0.4 s: %.1f .. %.1f LUFS (spread %.1f dB; quietest %s, loudest %s). Held instruments are louder in long chords than plucked ones at the same tune loudness.'
                     % (min(chd)[0], max(chd)[0], max(chd)[0] - min(chd)[0], min(chd)[1], max(chd)[1]))
        hs = [(v['hold_worst_seam'][0], k) for k, v in ai.items() if v.get('hold_worst_seam')]
        if hs:
            L.append('- Long notes rendered through the loop (%d seams): worst seam %+.1f dB (%s); worst level change in the 40 ms around a seam %+.1f dB.'
                     % (sum(v.get('hold_seams', 0) for v in ai.values()), max(hs)[0], max(hs)[1],
                        max((v['hold_worst_dip'][0] for v in ai.values() if v.get('hold_worst_dip')), key=abs)))
    L.append('')
    L.append('## Instruments')
    L.append('')
    rows = []
    for inst in man['instruments']:
        ms = [meas[s['file']] for s in inst['samples'] if s['file'] in meas]
        nfl = sum(1 for m in ms if m['flags'])
        nl = sum(1 for s in inst['samples'] if 'loopStart' in s)
        rows.append([inst['id'], len(ms), len({s['vel'] for s in inst['samples']}),
                     '%s-%s' % (bs.midi_name(inst['range'][0]), bs.midi_name(inst['range'][1])),
                     'stereo' if ms and ms[0]['channels'] == 2 else 'mono', inst['bytes'], '%+.1f' % inst['gain'],
                     ('%d of %d' % (nl, len(ms))) if nl else 'no',
                     rng([m['secs'] for m in ms]), rng([m['t40_ms'] for m in ms]), rng([m.get('attack_ms') for m in ms], '%.0f'), rng([m['peak_db'] for m in ms]), rng([m['loud'] for m in ms]),
                     rng([m.get('cents') for m in ms], '%+.0f'), nfl + len(steps.get(inst['id'], [])), inst['licence']])
    L.append(table(rows, ['id', 'files', 'layers', 'range', 'ch', 'bytes', 'gain dB', 'looped', 'length s', 'dead air ms', 'attack ms', 'peak dBFS', 'loudness', 'tuning cents', 'flags', 'licence']))
    L.append('')
    L.append('## Kits')
    L.append('')
    rows = []
    for kit in man['kits']:
        fs = sorted({f for layers in kit['layers'].values() for l in layers for f in l['files']})
        ms = [meas[f] for f in fs if f in meas]
        rr = ', '.join('%s %s' % (p, '+'.join(str(len(l['files'])) for l in kit['layers'][p])) for p in kit['pieces'])
        rows.append([kit['id'], len(fs), kit['bytes'], '%+.1f' % kit.get('gain', 0), rr, ', '.join(kit.get('absent', [])) or 'none',
                     rng([m['t40_ms'] for m in ms]), rng([m['peak_db'] for m in ms]), sum(1 for m in ms if m['flags']), kit['licence']])
    L.append(table(rows, ['id', 'files', 'bytes', 'gain dB', 'pieces (hits in the soft + loud layer)', 'absent', 'dead air ms', 'peak dBFS', 'flags', 'licence']))
    L.append('')
    L.append('Kit files are shared where the same recording is used: `perc/` holds the hand percussion that every kit points to, so the kit byte counts overlap by the size of shaker + tambourine + clap.')
    L.append('')
    if aud:
        L.append('## Audition renders (reference player in Chromium, OfflineAudioContext)')
        L.append('')
        L.append('Chromatic run over the whole range at the loud layer: pitch of every rendered note against equal temperament, and its loudness with the manifest gain applied. '
                 '"steps" counts neighbouring semitones more than 3 dB apart (where a listener may hear the change from one sample to the next). '
                 'Phrase and chord: the loudest 0.4 s (K-weighted) of the passage; the phrase figure is the one the manifest gain equalises.')
        L.append('')
        rows = []
        for inst in man['instruments']:
            v = aud['instruments'].get(inst['id'], {})
            if not v:
                continue
            rows.append([inst['id'], v.get('scale_notes'), v.get('max_shift'), v.get('worst_cents'), v.get('worst_cents_note'), v.get('median_abs_cents'), v.get('unmeasured'),
                         v.get('loud_median'), v.get('loud_span'), len(v.get('steps', [])), v.get('phrase_lufs'), v.get('phrase_peak_db'), v.get('chord_lufs'), v.get('chord_peak_db'),
                         v.get('hold_seams'), v['hold_worst_seam'][0] if v.get('hold_worst_seam') else None, v['hold_worst_dip'][0] if v.get('hold_worst_dip') else None])
        L.append(table(rows, ['id', 'notes', 'largest shift', 'worst cents', 'at', 'median abs cents', 'unmeasured', 'note loudness median', 'span dB', 'steps > 3 dB',
                              'phrase LUFS', 'phrase peak', 'chord LUFS', 'chord peak', 'loop seams', 'worst seam dB', 'worst seam level dB']))
        L.append('')
        for inst in man['instruments']:
            v = aud['instruments'].get(inst['id'], {})
            if v.get('steps'):
                L.append('- %s, level steps: %s' % (inst['id'], '; '.join('%s>%s %+.1f dB' % s for s in v['steps'])))
            if v.get('hold_short'):
                L.append('- %s, long notes that end early: %s' % (inst['id'], '; '.join('%s %s' % (a, ('%.1f s' % b) if not isinstance(b, str) else b) for a, b in v['hold_short'])))
        L.append('')
        rows = [[k, v.get('beat_hits'), v.get('beat_files'), v.get('beat_lufs'), v.get('beat_peak_db'), v.get('pieces_hits'), v.get('pieces_peak_db')] for k, v in aud['kits'].items()]
        L.append(table(rows, ['kit', 'beat hits', 'different files used', 'beat LUFS', 'beat peak dBFS', 'single hits', 'single hits peak dBFS']))
        L.append('')
    L.append('## Flags that remain')
    L.append('')
    any_flag = False
    for inst in man['instruments']:
        fl = ['`%s` %s' % (s['file'], ', '.join(meas[s['file']]['flags'])) for s in inst['samples'] if s['file'] in meas and meas[s['file']]['flags']]
        st = steps.get(inst['id'], [])
        if fl or st:
            any_flag = True
            L.append('**%s**' % inst['id'])
            L.append('')
            for f in fl:
                L.append('- ' + f)
            if st:
                L.append('- neighbouring samples: ' + '; '.join(st))
            L.append('')
    for kit in man['kits']:
        fs = sorted({f for layers in kit['layers'].values() for l in layers for f in l['files']})
        fl = ['`%s` %s' % (f, ', '.join(meas[f]['flags'])) for f in fs if f in meas and meas[f]['flags'] and f.startswith(kit['id'] + '/')]
        if fl:
            any_flag = True
            L.append('**%s**' % kit['id'])
            L.append('')
            for f in fl:
                L.append('- ' + f)
            L.append('')
    fl = ['`%s` %s' % (f, ', '.join(m['flags'])) for f, m in sorted(meas.items()) if f.startswith('perc/') and m['flags']]
    if fl:
        any_flag = True
        L.append('**perc**')
        L.append('')
        for f in fl:
            L.append('- ' + f)
        L.append('')
    if not any_flag:
        L.append('None.')
        L.append('')
    extra = os.path.join(os.path.dirname(report_path()), 'REPORT-notes.md')
    if os.path.exists(extra):
        L.append(open(extra).read().rstrip())
        L.append('')
    L.append('## Every file')
    L.append('')
    rows = []
    for f in sorted(meas):
        m = meas[f]
        lp = m.get('loop') or {}
        rows.append([f, m['note'] if m['note'] is not None else m['piece'], m['vel'], m['channels'], m['secs'], m['bytes'], m['t40_ms'], m.get('attack_ms'), m['peak_db'], m['rms_db'], m['loud'],
                     '' if m.get('cents') is None else '%+.0f' % m['cents'], m['octave'][0] if m.get('octave') else '', m['clip'], m['dc_db'], m['floor_db'], m['bal_db'], m['tail_db'],
                     ('%s-%s' % (round(lp['len_s'], 2), lp['seam_db'])) if lp and not lp.get('error') else (m.get('held_s') or ''), ', '.join(m['flags'])])
    L.append(table(rows, ['file', 'note / piece', 'vel', 'ch', 's', 'bytes', 'dead air ms', 'attack ms', 'peak', 'rms', 'loud', 'cents', 'octave', 'clip', 'dc', 'floor', 'L-R', 'tail', 'loop s-seam dB / held s', 'flags']))
    L.append('')
    os.makedirs(os.path.dirname(report_path()), exist_ok=True)
    open(report_path(), 'w').write('\n'.join(L))


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
