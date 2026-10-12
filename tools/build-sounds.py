#!/usr/bin/env python3
"""
build-sounds.py: builds the First Loop Studio instrument library (sounds/) from
openly licensed sample libraries. Maintainer tool; nothing here runs in the app.

    1. bash tools/build-sounds.sh             # clones the pinned sources into $FL_SOUNDS_SRC (about 6 GB)
    2. python3 tools/build-sounds.py          # (re)builds every instrument and kit + manifest.json
       python3 tools/build-sounds.py grand-piano studio-kit    # only these ids (manifest is merged)
       python3 tools/build-sounds.py --regain                  # only recompute the manifest gains
    3. python3 tools/check-sounds.py          # validates the manifest, measures every file, writes REPORT.md
       node tools/render-audition.js          # decodes every file in Chromium and renders tools/audition.html offline

Needs: python3 with numpy + scipy, and ffmpeg (libmp3lame) on PATH.

What happens to every sample (the same steps for every instrument, numbers per instrument in the
INSTRUMENTS / KITS tables below):

  decode      ffmpeg -> 32-bit float, 44.1 kHz (sources at 48 kHz are resampled by ffmpeg's swresample).
  channels    "mono": 1-channel sources are used as they are. For 2-channel sources one decision is made
              for the whole instrument: if the two channels are similar (median correlation >= 0.6)
              they are summed, otherwise the louder channel is used for every sample (a spaced
              microphone pair summed to mono would comb-filter). "stereo": kept as recorded.
  high-pass   2nd-order Butterworth at 15 Hz (causal): removes DC offset and sub-sonic rumble.
  onset trim  the start is cut to just before the note speaks, so a note placed on a step sounds on
              that step. "perc" (plucked, struck): first sample above -30 dB of the peak, walked back
              to -40 dB (at most 20 ms), minus 1 ms pre-roll, 0.5 ms fade-in. "slow" (bowed, blown):
              first sample above -20 dB, walked back to -32 dB (at most 40 ms), 2 ms pre-roll, 6 ms
              fade-in: the quiet scrape or breath before the tone is cut so that hummed notes do not
              sound late. If the note then still needs more than ATTACK_MAX (120 ms) to come within
              6 dB of its settled level (softly bowed notes swell slowly), the start is cut again so
              that this point lies 60 ms in, with a 30 ms fade-in ("attack shortened" in the log).
  tuning      the fundamental is measured (YIN, median over frames 0.15-1.2 s after the onset). If it is
              more than TUNE_FIX cents (6) from the declared note the sample is resampled to pitch.
              Pianos are never retuned: they are stretch-tuned on purpose (bass flat, treble sharp).
              Samples that cannot be measured reliably are left alone and listed in the report.
  length      plucked / struck: cut to the instrument's maximum length with a raised-cosine fade-out.
  loop        bowed / blown / organ ("slow"): a loop is cut inside the steady part of the note so that a
              held note can last as long as it is held. The loop end b is placed near the end of the
              steady part (at most LOOP_MAX_END seconds in), the loop start a is the point after
              LOOP_MIN_START whose 93 ms of signal before it match the 93 ms before b best (normalised
              cross-correlation, level difference penalised). The last X seconds before b are then
              cross-faded into the X seconds before a (X = 60 ms for a well matched solo tone, up to
              0.6 s for an ensemble), so that jumping from b back to a continues the same waveform.
              After b the file goes on with the signal from a, faded out over LOOP_TAIL seconds: a
              player that ignores the loop points gets a clean one-shot, and a decoder whose buffer is
              a few milliseconds off still loops without a step. Each such sample has "loopStart" and
              "loopEnd" (seconds into the decoded file) in the manifest and the instrument has
              "loop": true. A sample without a usable steady part stays a one-shot (no loop fields).
  level       "loudness" of a sample is its loudest 0.4 s (K-weighted, within the first 1.5 s), which
              treats a short high pluck and a slowly speaking bowed note alike. A sample more than
              2.5 dB away from the median of its neighbours in the same layer is moved onto that
              median ("level smoothing"), and one more than EVEN_DB (6) from the median of its whole
              layer is brought to 6 dB ("evening": a tune should not fade away at the ends of the
              range). Then one gain per instrument sets its loudest peak to -1.5 dBFS, so the
              difference between the soft and the loud layer is kept as recorded.
              The manifest "gain" (dB, never above 0) makes instruments equally loud: the same short
              tune (the "phrase" of tools/audition.html) is rendered with the loud layer of every
              instrument and its loudest 0.4 s is put at TARGET_LUFS. Because the gain only ever
              turns down, one note cannot clip; the player adds its own master gain.
  encode      MP3, LAME VBR (ffmpeg libmp3lame -q:a N), with the LAME/Xing header that tells decoders
              how many priming samples to skip. The encoded file is decoded again and cross-correlated
              with the signal that went in; the measured offset is stored in the build log and must be 0.

Kits: same steps without tuning. Multi-microphone kits are summed to one stereo file per hit with the
microphone balance of the kit's own "basic" program (see KITS).

Environment:
  FL_SOUNDS_SRC   folder with the cloned sources (default: ./.sounds-src next to the repo)
  FL_SOUNDS_WORK  folder for the build log / measurements (default: $FL_SOUNDS_SRC/../work)
"""
import json
import math
import os
import re
import subprocess
import sys

import numpy as np
from scipy import signal

SR = 44100
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'sounds')
SRC = os.environ.get('FL_SOUNDS_SRC', os.path.join(os.path.dirname(ROOT), '.sounds-src'))
WORK = os.environ.get('FL_SOUNDS_WORK', os.path.join(os.path.dirname(SRC.rstrip('/')), 'work'))

PEAK_DB = -1.5        # loudest peak of an instrument after normalisation
TARGET_LUFS = -21.0   # loudest 0.4 s of the reference tune on every instrument once "gain" is applied
ATTACK_MAX = 0.120    # s: slower swells are shortened (see "onset trim")
EVEN_DB = 6.0         # a sample is never further than this from the median loudness of its layer
KIT_LUFS = -27.0      # loudness of a kit's loud snare (first half second) once the kit "gain" is applied
LOOP_MIN_START = 0.7  # s: a loop never starts before this (the attack is over)
LOOP_MAX_END = 4.2    # s: a loop never ends after this (file size)
LOOP_MIN_LEN = 1.2    # s
LOOP_TAIL = 0.45      # s of signal after the loop end (fades out)
TUNE_FIX = 6.0        # cents; beyond this a sample is retuned by resampling (never pianos)
SMOOTH_DB = 2.5       # level smoothing threshold (dB from the neighbours' median)

# ----------------------------------------------------------------------------------------------
# Sources. "dir" is the folder name under FL_SOUNDS_SRC (see build-sounds.sh for URLs and commits).
# ----------------------------------------------------------------------------------------------
SOURCES = {
    'meatbass': dict(dir='meatbass', commit='ac9e859',
                        evidence="LICENSE in the repository: CC0 1.0 Universal; readme: 'Royalty-free for all commercial and non-commercial use'",
                       name='Karoryfer Samples: Meatbass',
                     url='https://github.com/sfzinstruments/karoryfer.meatbass', licence='CC0 1.0', credit=''),
    'bnb': dict(dir='sfzinstruments_karoryfer.black-and-blue-basses', commit='6e7d674',
                   evidence="'license' file in the repository: CC0 1.0 Universal",
                  name='Karoryfer Samples: Black And Blue Basses',
                url='https://github.com/sfzinstruments/karoryfer.black-and-blue-basses', licence='CC0 1.0', credit=''),
    'emily': dict(dir='sfzinstruments_karoryfer.emilyguitar', commit='b4920dc',
                     evidence="LICENSE in the repository: CC0 1.0 Universal; readme: 'Royalty-free for all commercial and non-commercial use'",
                    name='Karoryfer Samples: Emilyguitar',
                  url='https://github.com/sfzinstruments/karoryfer.emilyguitar', licence='CC0 1.0', credit=''),
    'cello': dict(dir='sfzinstruments_karoryfer-bigcat.cello', commit='6fd75fb',
                     evidence="LICENSE in the repository: CC0 1.0 Universal; readme: 'royalty-free for all commercial and non-commercial use'",
                    name='Karoryfer Samples x bigcat instruments: cello (performed by Kamila Borowiak)',
                  url='https://github.com/sfzinstruments/karoryfer-bigcat.cello', licence='CC0 1.0', credit=''),
    'salamander': dict(dir='sfzinstruments_SalamanderGrandPiano', commit='3382bf9',
                          evidence='LICENSE in the repository: Creative Commons Attribution 3.0 Unported',
                         name='Salamander Grand Piano V3 by Alexander Holm',
                       url='https://github.com/sfzinstruments/SalamanderGrandPiano', licence='CC BY 3.0',
                       credit='Salamander Grand Piano V3 by Alexander Holm, licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Samples were trimmed, level-adjusted and converted to MP3 for First Loop.'),
    'sullivan': dict(dir='sfzinstruments_GregSullivan.E-Pianos', commit='8c3e581',
                        evidence="LICENSE in the repository: Creative Commons Attribution 3.0 Unported; README: published 'with the author permission with the request for attribution'",
                       name="Greg Sullivan's E-Pianos: Wurlitzer EP200",
                     url='https://github.com/sfzinstruments/GregSullivan.E-Pianos', licence='CC BY 3.0',
                     credit='Wurlitzer EP200 electric piano samples by Greg Sullivan (http://www.sullivang.net/), licensed under CC BY 3.0 (https://creativecommons.org/licenses/by/3.0/). Samples were trimmed, level-adjusted and converted to MP3 for First Loop.'),
    'discord': dict(dir='sfzinstruments_Discord-SFZ-GM-Bank', commit='7a9c478',
                       evidence="header of '026-Acoustic Guitar (steel).sfz': 'Author: Jeff Learman ... License: Creative Commons CC0'; the bank's README allows only CC0 and CC BY material and names commercial use",
                      name='Discord SFZ GM Bank: Acoustic Guitar (steel), 2017 Martin HD28, by Jeff Learman',
                    url='https://github.com/sfzinstruments/Discord-SFZ-GM-Bank', licence='CC0 1.0', credit=''),
    'vsco': dict(dir='sgossner_VSCO-2-CE', commit='4403009',
                    evidence='LICENSE in the repository: CC0 1.0 Universal',
                   name='Versilian Studios Chamber Orchestra 2: Community Edition',
                 url='https://github.com/sgossner/VSCO-2-CE', licence='CC0 1.0', credit=''),
    'vcsl': dict(dir='sgossner_VCSL', commit='c1ea7bc',
                    evidence="LICENSE in the repository: CC0 1.0 Universal; README: 'you can do whatever you want with these sounds (even make commercial software), no royalties, no credit'",
                   name='Versilian Community Sample Library',
                 url='https://github.com/sgossner/VCSL', licence='CC0 1.0', credit=''),
    'virtuosity': dict(dir='sfzinstruments_virtuosity_drums', commit='9f04cf9',
                          evidence='LICENSE in the repository: CC0 1.0 Universal',
                         name='Virtuosity Drums by Versilian Studios and Karoryfer Samples',
                       url='https://github.com/sfzinstruments/virtuosity_drums', licence='CC0 1.0', credit=''),
    'swirly': dict(dir='sfzinstruments_karoryfer.swirly-drums', commit='c40dafe',
                      evidence="'license' file in the repository: CC0 1.0 Universal",
                     name='Karoryfer Samples: Swirly Drums',
                   url='https://github.com/sfzinstruments/karoryfer.swirly-drums', licence='CC0 1.0', credit=''),
    'bigrusty': dict(dir='sfzinstruments_karoryfer.big-rusty-drums', commit='f07ce00',
                        evidence='LICENSE in the repository: CC0 1.0 Universal',
                       name='Karoryfer Samples: Big Rusty Drums',
                     url='https://github.com/sfzinstruments/karoryfer.big-rusty-drums', licence='CC0 1.0', credit=''),
}

NOTE_BASE = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}


def note_num(name, octave_shift=0):
    """'eb1', 'F#2', 'A#3', 'Db4' -> MIDI number (C4 = 60). octave_shift moves a library whose
    octave names are an octave off (each one was checked against the measured pitch)."""
    m = re.fullmatch(r'([a-gA-G])([#b]?)(-?\d)', name)
    if not m:
        raise ValueError('bad note name ' + name)
    n = NOTE_BASE[m.group(1).lower()] + {'#': 1, 'b': -1, '': 0}[m.group(2)]
    return n + 12 * (int(m.group(3)) + 1) + 12 * octave_shift


def midi_hz(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']


def midi_name(n):
    return '%s%d' % (NAMES[n % 12], n // 12 - 1)


# ----------------------------------------------------------------------------------------------
# Audio helpers
# ----------------------------------------------------------------------------------------------
def decode(path, sr=SR):
    """Any audio file -> float32 array (frames, channels) at sr."""
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=channels',
                        '-of', 'csv=p=0', path], capture_output=True, text=True)
    ch = int(r.stdout.strip().split('\n')[0].strip(',') or 1)
    p = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le',
                        '-ar', str(sr), '-ac', str(ch), '-'], capture_output=True)
    if p.returncode != 0:
        raise RuntimeError('ffmpeg decode failed: %s: %s' % (path, p.stderr.decode()[:200]))
    x = np.frombuffer(p.stdout, dtype='<f4').astype(np.float64)
    return x.reshape(-1, ch)


def encode_mp3(x, path, q):
    """float array (frames, channels) -> MP3 (LAME VBR quality q), no tags, with Xing/LAME header."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    ch = x.shape[1]
    raw = np.clip(x, -1.0, 1.0).astype('<f4').tobytes()
    cmd = ['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(ch), '-i', '-',
           '-c:a', 'libmp3lame', '-q:a', str(q), '-map_metadata', '-1', '-id3v2_version', '0',
           '-write_xing', '1', '-fflags', '+bitexact', '-flags:a', '+bitexact', path]
    p = subprocess.run(cmd, input=raw, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError('ffmpeg encode failed: ' + p.stderr.decode()[:300])


def db(v):
    return 20 * math.log10(max(float(v), 1e-12))


def envelope(x):
    return np.max(np.abs(x), axis=1)


def channel_stats(x):
    """(correlation of L and R over the first 3 s, energy L, energy R); (1, e, e) for mono files."""
    if x.shape[1] == 1:
        e = float(np.dot(x[:, 0], x[:, 0]))
        return 1.0, e, e
    n = min(len(x), 3 * SR)
    a, b = x[:n, 0], x[:n, 1]
    ea, eb = float(np.dot(a, a)), float(np.dot(b, b))
    return float(np.dot(a, b)) / (math.sqrt(ea * eb) or 1.0), ea, eb


def mono_policy(paths):
    """One decision for a whole instrument: 'sum', 'L' or 'R' (see the header)."""
    st = [channel_stats(decode(p)) for p in paths]
    corr = float(np.median([c for c, _, _ in st]))
    if corr >= 0.6:
        return 'sum', corr
    # louder channel, judged per file so that one loud note does not decide for all
    left = sum(1 for _, ea, eb in st if ea >= eb)
    return ('L' if left * 2 >= len(st) else 'R'), corr


def to_mono(x, policy):
    if x.shape[1] == 1:
        return x
    if policy == 'sum':
        return (0.5 * (x[:, 0] + x[:, 1]))[:, None]
    return x[:, (0 if policy == 'L' else 1)][:, None]


_HP = signal.butter(2, 15.0, 'highpass', fs=SR, output='sos')


def highpass(x):
    return signal.sosfilt(_HP, x, axis=0)


def find_onset(x, mode):
    """Index where the trimmed sample should start."""
    env = envelope(x)
    if not len(env):
        return 0
    peak = float(env[:int(3 * SR)].max()) or 1.0
    if mode == 'perc':
        hi, lo, back, pre = -30.0, -40.0, 0.020, 0.001
    else:
        hi, lo, back, pre = -20.0, -32.0, 0.040, 0.002
    above = np.nonzero(env > peak * 10 ** (hi / 20))[0]
    if not len(above):
        return 0
    i = int(above[0])
    lo_lin = peak * 10 ** (lo / 20)
    stop = max(0, i - int(back * SR))
    w = int(0.0005 * SR)
    j = i
    while j > stop and env[max(0, j - w):j + 1].max() > lo_lin:
        j -= 1
    return max(0, j - int(pre * SR))


def attack_seconds(x):
    """Seconds until the 10 ms RMS first comes within 6 dB of the level the note settles at (the loudest
    100 ms within the first 0.7 s)."""
    m = x.mean(axis=1)
    w, h, w2 = int(0.01 * SR), int(0.002 * SR), int(0.1 * SR)
    end = min(len(m), int(0.7 * SR))
    if end < w2 + w:
        return 0.0
    cs = np.concatenate(([0.0], np.cumsum(m * m)))
    idx = np.arange(0, end - w, h)
    r10 = np.sqrt((cs[idx + w] - cs[idx]) / w)
    idx2 = np.arange(0, end - w2, h)
    ref = float(np.sqrt(np.max(cs[idx2 + w2] - cs[idx2]) / w2))
    hit = np.nonzero(r10 >= ref * 0.5)[0]
    return float(hit[0]) * h / SR if len(hit) else 0.0


def fade_in(x, secs):
    n = min(len(x), max(1, int(secs * SR)))
    x[:n] *= (0.5 - 0.5 * np.cos(np.linspace(0, math.pi, n)))[:, None]
    return x


def fade_out(x, secs):
    n = min(len(x), max(1, int(secs * SR)))
    x[-n:] *= (0.5 + 0.5 * np.cos(np.linspace(0, math.pi, n)))[:, None]
    return x


def _kweight():
    # ITU-R BS.1770 K-weighting, coefficients derived for SR (pre-filter shelf + RLB high-pass)
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196
    K = math.tan(math.pi * f0 / SR)
    Vh, Vb = 10 ** (G / 20), (10 ** (G / 20)) ** 0.4996667741545416
    a0 = 1 + K / Q + K * K
    b1 = [(Vh + Vb * K / Q + K * K) / a0, 2 * (K * K - Vh) / a0, (Vh - Vb * K / Q + K * K) / a0]
    a1 = [1.0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    f0, Q = 38.13547087602444, 0.5003270373238773
    K = math.tan(math.pi * f0 / SR)
    a0 = 1 + K / Q + K * K
    b2 = [1.0, -2.0, 1.0]
    a2 = [1.0, 2 * (K * K - 1) / a0, (1 - K / Q + K * K) / a0]
    return (b1, a1), (b2, a2)


_KW = _kweight()


def loudness(x, secs=1.0):
    """K-weighted loudness (LUFS-style, ungated) of the first `secs` seconds."""
    y = x[:int(secs * SR)]
    if len(y) < 64:
        return -120.0
    for b, a in _KW:
        y = signal.lfilter(b, a, y, axis=0)
    ms = float(np.sum(np.mean(y * y, axis=0)))
    return -0.691 + 10 * math.log10(max(ms, 1e-12))


def loud_mm(x, span=1.5, win=0.4):
    """Loudest `win` seconds (K-weighted) within the first `span` seconds; span None = the whole signal."""
    y = x if span is None else x[:int(span * SR)]
    if len(y) < 64:
        return -120.0
    for b, a in _KW:
        y = signal.lfilter(b, a, y, axis=0)
    p = np.sum(y * y, axis=1)
    w = int(win * SR)
    if len(p) <= w:
        ms = float(np.sum(p)) / w
    else:
        cs = np.concatenate(([0.0], np.cumsum(p)))
        ms = float(np.max(cs[w::441] - cs[:-w:441])) / w
    return -0.691 + 10 * math.log10(max(ms, 1e-12))


def phrase_events(lo, hi):
    """The reference tune: the same notes as material(inst, 'phrase') in tools/audition.html."""
    r = int(math.floor((lo + hi) / 2.0 + 0.5)) - 6
    r -= r % 12
    while r < lo:
        r += 12
    while r + 16 > hi:
        r -= 12
    root = max(lo, r)
    e, t, out = 0.3, 0.0, []
    tune = [(0, 1), (0, 1), (4, 1), (7, 2), (9, 1), (7, 1), (4, 2), (5, 1), (4, 1), (2, 1), (-1, 1), (0, 2), (12, 1), (11, 1), (7, 2), (4, 1), (2, 1), (0, 6)]
    for k, (d, n) in enumerate(tune):
        m = root + d
        if m < lo:
            m += 12
        if m > hi:
            m -= 12
        out.append((m, t, n * e * 0.92, 1.0 if k % 4 == 0 else 0.86 ** 1.2))
        t += n * e
    return out


def phrase_loudness(samples, lo, hi, release):
    """samples: [(note, array (n, ch))] of the loud layer. Renders the reference tune the way the player
    does (nearest sample, resampled, linear release) and returns its loudest 0.4 s."""
    ev = phrase_events(lo, hi)
    total = int((ev[-1][1] + ev[-1][2] + release + 0.2) * SR)
    out = np.zeros((total, 2))
    for midi, t, dur, lvl in ev:
        note, x = min(samples, key=lambda s_: (abs(s_[0] - midi), s_[0]))
        rate = 2 ** ((midi - note) / 12.0)
        n = min(int(len(x) / rate) - 1, int((dur + release) * SR))
        pos = np.arange(n) * rate
        i0 = np.minimum(pos.astype(int), len(x) - 2)
        fr = (pos - i0)[:, None]
        y = (x[i0] * (1 - fr) + x[i0 + 1] * fr) * lvl
        k0 = int(dur * SR)
        if n > k0:
            y[k0:] *= np.linspace(1.0, 0.0, n - k0)[:, None]
        if y.shape[1] == 1:
            y = np.repeat(y, 2, axis=1)
        a = int(t * SR)
        out[a:a + n] += y[:total - a]
    return loud_mm(out, None)


def yin_f0(seg, fmin, fmax, sr=SR):
    """One YIN estimate on a mono segment. Returns (f0 or None, aperiodicity)."""
    tau_max = int(sr / fmin) + 2
    tau_min = max(2, int(sr / fmax))
    w = len(seg) - tau_max
    if w < tau_max // 2 or w < 256:
        return None, 1.0
    x = seg.astype(np.float64)
    # difference function via FFT autocorrelation
    n = len(x)
    size = 1 << int(math.ceil(math.log2(n + w)))
    fx = np.fft.rfft(x, size)
    fw = np.fft.rfft(x[:w][::-1], size)
    conv = np.fft.irfft(fx * fw, size)[w - 1:w - 1 + tau_max + 1]
    cs = np.concatenate(([0.0], np.cumsum(x * x)))
    e0 = cs[w] - cs[0]
    et = cs[np.arange(tau_max + 1) + w] - cs[np.arange(tau_max + 1)]
    d = e0 + et - 2 * conv
    d[0] = 0.0
    cm = np.ones_like(d)
    run = np.cumsum(d[1:])
    cm[1:] = d[1:] * np.arange(1, len(d)) / np.maximum(run, 1e-20)
    sl = cm[tau_min:tau_max]
    if not len(sl):
        return None, 1.0
    t = None
    below = np.nonzero(sl < 0.15)[0]
    if len(below):
        t = int(below[0]) + tau_min
        while t + 1 < tau_max and cm[t + 1] < cm[t]:
            t += 1
    else:
        t = int(np.argmin(sl)) + tau_min
    if t <= 1 or t >= len(cm) - 1:
        return None, float(cm[t]) if 0 <= t < len(cm) else 1.0
    a, b, c = cm[t - 1], cm[t], cm[t + 1]
    den = a - 2 * b + c
    off = 0.5 * (a - c) / den if abs(den) > 1e-12 else 0.0
    return sr / (t + off), float(b)


def measure_f0(x, expected_midi=None, onset=0, span=(0.15, 1.2)):
    """Median fundamental over frames after the onset. With expected_midi the search is limited to
    +-4 semitones around it (no octave errors); without, it is a free search 25-4500 Hz.
    Returns (hz or None, cents from expected or None, number of frames used)."""
    m = x.mean(axis=1) if x.ndim == 2 else x
    up = 1
    if expected_midi is not None:
        fe = midi_hz(expected_midi)
        fmin, fmax = fe * 2 ** (-4 / 12), fe * 2 ** (4 / 12)
        if fe > 700:
            up = 4
        if fe > 2000:
            up = 8
    else:
        fmin, fmax = 25.0, 4500.0
    a = onset + int(span[0] * SR)
    b = min(len(m), onset + int(span[1] * SR))
    if b - a < int(0.08 * SR):
        a = onset + int(0.02 * SR)
        b = len(m)
    seg = m[a:b]
    sr = SR
    if up > 1 and len(seg):
        seg = signal.resample_poly(seg, up, 1)
        sr = SR * up
    frame = int(max(0.08 * sr, 8 * sr / fmin + sr / fmin))
    hop = max(1, frame // 2)
    f0s = []
    i = 0
    pk = float(np.max(np.abs(seg))) if len(seg) else 0.0
    while i + frame <= len(seg):
        fr = seg[i:i + frame]
        if float(np.max(np.abs(fr))) > pk * 0.03:
            f, ap = yin_f0(fr, fmin, fmax, sr)
            if f and ap < 0.35:
                f0s.append(f)
        i += hop
    if not f0s and len(seg) > 256:
        f, ap = yin_f0(seg[:min(len(seg), frame * 2)], fmin, fmax, sr)
        if f and ap < 0.5:
            f0s.append(f)
    if not f0s:
        return None, None, 0
    f = float(np.median(f0s))
    cents = 1200 * math.log2(f / midi_hz(expected_midi)) if expected_midi is not None else None
    return f, cents, len(f0s)


def retune(x, cents):
    """Resample so that the pitch moves by -cents (i.e. corrects a sample that is `cents` sharp)."""
    ratio = 2 ** (cents / 1200.0)          # > 1 when sharp: make it longer
    n = int(round(len(x) * ratio))
    return signal.resample(x, n, axis=0)


def shift_semitones(x, semis):
    """Pitch-shift by resampling (used only when building the layered string ensemble)."""
    n = int(round(len(x) / (2 ** (semis / 12.0))))
    return signal.resample(x, n, axis=0)


def xcorr_lag(ref, dec, maxlag=4000):
    """Samples by which `dec` is delayed against `ref` (positive = decoded audio starts late)."""
    n = min(len(ref), len(dec), SR)
    a = ref[:n].mean(axis=1)
    b0 = dec[:n].mean(axis=1)
    den = math.sqrt(float(np.dot(a, a)) * float(np.dot(b0, b0))) or 1.0
    if float(np.dot(a, b0)) / den >= 0.97:
        return 0          # a held tone also matches one period later; lag 0 is checked first
    b = dec[:n + maxlag].mean(axis=1) if len(dec) >= n + maxlag else np.pad(dec.mean(axis=1), (0, max(0, n + maxlag - len(dec))))[:n + maxlag]
    c = signal.correlate(b, a, mode='valid')                             # lags 0 .. maxlag
    c2 = signal.correlate(np.pad(a, (0, maxlag)), b[:n], mode='valid')   # lags 0 .. -maxlag
    best = max(float(c.max()), float(c2.max()))
    # a sustained tone correlates almost as well one period later: take the smallest lag that is
    # within 0.5 % of the best match
    for lag in range(0, maxlag + 1):
        if c[lag] >= best * 0.995:
            return lag
        if c2[lag] >= best * 0.995:
            return -lag
    return int(np.argmax(c))


def make_loop(x, max_end=None, wide=False):
    """Cut a loop into a sustained sample (see the header). x: (n, ch) after trim and tuning.
    Returns (y, loop_start_s, loop_end_s, info) or (None, None, None, reason)."""
    max_end = max_end or LOOP_MAX_END
    m = x.mean(axis=1)
    hop, win = SR // 100, SR // 20
    if len(m) < int((LOOP_MIN_START + LOOP_MIN_LEN + 0.3) * SR):
        return None, None, None, 'too short'
    win = int(0.3 * SR)                                       # 0.3 s windows: vibrato and tremolo average out
    cs = np.concatenate(([0.0], np.cumsum(m * m)))
    idx = np.arange(0, len(m) - win, hop)
    rms = np.sqrt((cs[idx + win] - cs[idx]) / win)
    ref = float(np.median(rms[50:250]))                       # windows starting 0.5 .. 2.5 s in
    low = rms < ref * 10 ** (-6.0 / 20)
    t1 = len(m) / SR - 0.15
    for k in range(70, len(rms) - 15):
        if low[k:k + 15].all():                               # 150 ms of windows 6 dB down: the note is ending
            t1 = k * hop / SR + 0.15
            break
    region_end = min(t1 - 0.1, max_end, len(m) / SR - 0.15)
    if region_end - LOOP_MIN_START < LOOP_MIN_LEN:
        return None, None, None, 'steady part only %.1f s' % max(0.0, region_end - LOOP_MIN_START)
    W = 4096
    cs2 = cs
    best = None
    for k in range(12):
        b = int((region_end - 0.03 * k) * SR)
        a0, a1 = int(LOOP_MIN_START * SR), b - int(LOOP_MIN_LEN * SR)
        if a1 - a0 < 64:
            break
        tpl = m[b - W:b]
        seg = m[a0 - W:a1]
        c = signal.correlate(seg, tpl, mode='valid')[1:]      # c[i]: window ending at a0 + i ... a1
        aa = np.arange(a0 + 1, a1 + 1)[:len(c)]
        ea = cs2[aa] - cs2[aa - W]
        eb = float(cs2[b] - cs2[b - W])
        ncc = c / np.sqrt(np.maximum(ea * eb, 1e-20))
        lvl = 10 * np.log10(np.maximum(ea, 1e-20) / max(eb, 1e-20))
        score = ncc - 0.15 * np.abs(lvl) - 0.04 * (aa - a0) / SR
        i = int(np.argmax(score))
        cand = (float(score[i]), int(aa[i]), b, float(ncc[i]), float(lvl[i]))
        if best is None or cand[0] > best[0]:
            best = cand
    if best is None:
        return None, None, None, 'no candidate'
    _, a, b, corr, lvl = best
    if abs(lvl) > 3.0:
        return None, None, None, 'level differs %.1f dB across the loop' % lvl
    cpos = max(0.0, min(1.0, corr))
    xf = 0.06 + (0.85 - cpos) / 0.85 * 0.54 if cpos < 0.85 else 0.06
    if wide or abs(lvl) > 1.5:
        xf = max(xf, 0.35)                                    # a longer cross-fade hides a small level step
    X = int(min(xf * SR, a - int(0.05 * SR), (b - a) // 2))
    f = 0.5 - 0.5 * np.cos(np.linspace(0, math.pi, X))
    norm = np.sqrt(f * f + (1 - f) * (1 - f) + 2 * cpos * f * (1 - f))
    y = x[:b].copy()
    y[b - X:b] = (x[b - X:b] * (1 - f)[:, None] + x[a - X:a] * f[:, None]) / norm[:, None]
    T = min(int(LOOP_TAIL * SR), len(x) - a)
    tail = x[a:a + T].copy()
    hold = min(T // 4, int(0.08 * SR))
    tail[hold:] *= (0.5 + 0.5 * np.cos(np.linspace(0, math.pi, T - hold)))[:, None]
    y = np.concatenate([y, tail])
    return y, a / SR, b / SR, dict(loop_corr=round(corr, 3), loop_level_db=round(lvl, 2), loop_xfade_ms=round(1000.0 * X / SR),
                                   loop_len_s=round((b - a) / SR, 2))


# ----------------------------------------------------------------------------------------------
# Instrument table
# ----------------------------------------------------------------------------------------------
def src_path(source, *parts):
    return os.path.join(SRC, SOURCES[source]['dir'], *parts)


def collect(source, folder, regex, vel_of, octave=0, note_of=None, every=None, only=None):
    """Scan one source folder. regex has groups n (note name or number) and optionally l (layer).
    vel_of: {layer: velocity}. Returns [{note, vel, path}], one file per (note, vel)."""
    d = src_path(source, folder)
    out = {}
    for f in sorted(os.listdir(d)):
        m = re.fullmatch(regex, f)
        if not m:
            continue
        layer = m.groupdict().get('l') or ''
        if layer not in vel_of:
            continue
        note = note_of(m.group('n')) if note_of else note_num(m.group('n'), octave)
        if only and note not in only:
            continue
        key = (note, vel_of[layer])
        if key not in out:
            out[key] = dict(note=note, vel=vel_of[layer], path=os.path.join(d, f), source=source)
    items = [out[k] for k in sorted(out)]
    if every:
        # keep a sparse set: walk up from the lowest note, keeping notes at least `every` semitones apart
        keep, last = set(), None
        notes = sorted({i['note'] for i in items})
        for n in notes:
            if last is None or n - last >= every:
                keep.add(n)
                last = n
        if notes[-1] not in keep and notes[-1] - last >= 2:
            keep.add(notes[-1])
        items = [i for i in items if i['note'] in keep]
    return items


def piano_len(note):
    # long bass strings ring for a long time; the top octaves are short anyway
    if note < 48:
        return 6.5
    if note < 72:
        return 5.5
    if note < 84:
        return 4.0
    return 2.5


def upright_len(note):
    return 6.0 if note < 55 else (5.0 if note < 79 else 3.0)


INSTRUMENTS = [
    dict(id='upright-bass', name='Upright bass', family='bass', mode='perc', mono=True, q=4,
         maxlen=4.0, fade=0.6, release=0.18,
         samples=lambda: collect('meatbass', 'Samples/pizz', r'(?P<n>[a-g]b?\d)_(?P<l>vl\d)_rr1\.wav',
                                 {'vl2': 50, 'vl4': 100}),
         note='1958 Otto Rubner double bass, plucked (pizzicato), two dynamic layers.'),
    dict(id='electric-bass', name='Electric bass (finger)', family='bass', mode='perc', mono=True, q=4,
         maxlen=4.0, fade=0.6, release=0.12,
         samples=lambda: collect('bnb', 'Samples/darkblack/reg', r'darkblack_(?P<n>[a-g]b?\d)_(?P<l>\w+?)_rr1\.wav',
                                 {'mp': 50, 'f': 100}, octave=-1, every=3),
         note='Washburn AB-95 five-string, finger style, neck pickup, recorded direct.'),
    dict(id='electric-bass-pick', name='Electric bass (pick)', family='bass', mode='perc', mono=True, q=4,
         maxlen=3.5, fade=0.6, release=0.12,
         samples=lambda: collect('bnb', 'Samples/babyblue/reg', r'babyblue_(?P<n>[a-g]b?\d)_(?P<l>\w+?)_rr1\.wav',
                                 {'f': 100}, octave=-1, every=3),
         note='Five-string bass played with a pick, bridge pickup, recorded direct.'),
    dict(id='grand-piano', name='Grand piano', family='keys', mode='perc', mono=False, q=5, stretch=True,
         maxlen=piano_len, fade=1.5, release=0.35,
         samples=lambda: collect('salamander', 'Samples', r'(?P<n>[A-G]#?\d)(?P<l>v\d+)\.flac',
                                 {'v8': 50, 'v12': 100}),
         note='Yamaha C5 grand, two dynamic layers, sampled every minor third.'),
    dict(id='upright-piano', name='Upright piano', family='keys', mode='perc', mono=False, q=5, stretch=True,
         maxlen=upright_len, fade=1.2, release=0.3,
         samples=lambda: collect('vsco', 'Keys/Upright Piano', r'Player_(?P<l>dyn\d)_rr1_(?P<n>\d+)\.wav',
                                 {'dyn1': 50, 'dyn3': 100}, note_of=lambda s: 21 + 2 * int(s)),
         note='Upright piano sampled by Simon Dalzell of Ivy Audio, two dynamic layers, every major third.'),
    dict(id='electric-piano', name='Electric piano (Wurlitzer)', family='keys', mode='perc', mono=True, q=4,
         maxlen=4.0, fade=0.6, release=0.2,
         samples=lambda: (
             collect('sullivan', 'Wurlitzer EP200/Samples', r'(?P<n>[a-g]b?\d)(?P<l>f)\.flac', {'f': 100})
             + collect('sullivan', 'Wurlitzer EP200/Samples', r'(?P<n>e4|g4)(?P<l>ff)\.flac', {'ff': 100})
             + collect('sullivan', 'Wurlitzer EP200/Samples', r'(?P<n>[a-g]b?\d)(?P<l>mp)\.flac', {'mp': 50})),
         note='Wurlitzer EP200 reed electric piano, two dynamic layers.'),
    dict(id='steel-guitar', name='Acoustic guitar (steel)', family='guitar', mode='perc', mono=True, q=4,
         maxlen=4.5, fade=0.35, release=0.25,
         samples=lambda: collect('discord', 'Discord GM/Melodic/026-Acoustic Guitar (steel)',
                                 r'MartinGM2_(?P<n>\d+)_+[A-G]b?\d_1\.wav', {'': 100}, note_of=int),
         drop=[77],   # the F5 sample has almost no fundamental (it sounds an octave up); E5-flat and A5-flat cover it
         note='2017 Martin HD28 steel-string guitar, single plucked notes, one dynamic layer.'),
    dict(id='electric-guitar', name='Electric guitar (clean)', family='guitar', mode='perc', mono=True, q=4,
         maxlen=4.0, fade=0.6, release=0.2,
         samples=lambda: collect('emily', 'notes', r'(?P<n>[a-g]b?\d)_(?P<l>\w+?)_rr1\.wav', {'mp': 50, 'f': 100}),
         note='Epiphone hollow-body with flatwound strings, recorded direct, two dynamic layers.'),
    dict(id='violin', name='Violin', family='strings', mode='slow', mono=True, q=4,
         maxlen=5.5, fade=0.7, release=0.3,
         samples=lambda: collect('vsco', 'Strings/Solo Violin/Arco Vib', r'LLVln_ArcoVib_(?P<n>[A-G]#?\d)_(?P<l>[fp])\.wav',
                                 {'p': 50, 'f': 100}),
         note='Solo violin, bowed with vibrato, two dynamic layers.'),
    dict(id='violin-pizz', name='Violin (pizzicato)', family='strings', mode='perc', mono=True, q=4,
         maxlen=2.0, fade=0.3, release=0.2,
         samples=lambda: collect('vsco', 'Strings/Solo Violin/Pizz', r'LLVln_Pizz_(?P<n>[A-G]#?\d)_(?P<l>f)(_RR1)?\.wav',
                                 {'f': 100}),
         note='Solo violin, plucked.'),
    dict(id='cello', name='Cello', family='strings', mode='slow', mono=True, q=4,
         maxlen=5.5, fade=0.7, release=0.3,
         samples=lambda: collect('cello', 'Samples/sus', r'(?P<n>[A-G]b?\d)_(?P<l>\w+)_d\.wav', {'mp': 50, 'f': 100}, octave=1),
         note='Solo cello performed by Kamila Borowiak, bowed, two dynamic layers.'),
    dict(id='cello-pizz', name='Cello (pizzicato)', family='strings', mode='perc', mono=True, q=4,
         maxlen=3.0, fade=0.4, release=0.2,
         samples=lambda: collect('cello', 'Samples/pizzcato', r'(?P<n>[A-G]b?\d)_(?P<l>1)\.wav', {'1': 100}, octave=1),
         note='Solo cello, plucked.'),
    dict(id='flute', name='Flute', family='winds', mode='slow', mono=True, q=4,
         maxlen=5.0, fade=0.6, release=0.2,
         samples=lambda: collect('vsco', 'Woodwinds/Flute/susvib', r'LDFlute_susvib_(?P<n>[A-G]#?\d)_(?P<l>v1)_1\.wav',
                                 {'v1': 100}, octave=1),
         note='Solo flute, sustained with vibrato.'),
    dict(id='clarinet', name='Clarinet', family='winds', mode='slow', mono=True, q=4,
         maxlen=5.0, fade=0.6, release=0.2,
         samples=lambda: collect('vsco', 'Woodwinds/Clarinet/susLong', r'DCClar_susLong_(?P<n>[A-G]#?\d)_(?P<l>v\d)_rr1_sum\.wav',
                                 {'v1': 50, 'v3': 100}, octave=1),
         renote={90: 89},   # the files named F#5 measure as F (100 cents flat of F#) in both layers
         note='Solo clarinet, sustained, two dynamic layers.'),
    dict(id='trumpet', name='Trumpet', family='brass', mode='slow', mono=True, q=4,
         maxlen=5.0, fade=0.6, release=0.2,
         samples=lambda: collect('vsco', 'Brass/Trumpet/sus', r'Sum_SHTrumpet_sus_(?P<n>[A-G]#?\d)_(?P<l>v\d)_rr1\.wav',
                                 {'v1': 50, 'v3': 100}, octave=1),
         note='Solo trumpet, sustained, two dynamic layers.'),
    dict(id='french-horn', name='French horn', family='brass', mode='slow', mono=True, q=4,
         maxlen=5.0, fade=0.6, release=0.25,
         samples=lambda: collect('vsco', 'Brass/F Horn/sus', r'MOHorn_sus_(?P<n>[A-G]#?\d)_(?P<l>v\d)_1\.wav',
                                 {'v1': 100}, octave=1),
         drop=[74, 77],   # the library has nothing between C4 and D5: the instrument stops at E-flat 4
         note='Solo French horn, sustained, low and middle register (up to E-flat above middle C).'),
    dict(id='tenor-sax', name='Tenor saxophone', family='winds', mode='slow', mono=True, q=4,
         maxlen=5.0, fade=0.6, release=0.2,
         samples=lambda: collect('vcsl', 'Aerophones/Reed Aerophones/Tenor Saxophone/Non-Vibrato',
                                 r'BrettTenor_NV_Main_(?P<n>[A-G]#?\d)_(?P<l>vl\d)_rr1\.wav', {'vl2': 50, 'vl3': 100}, octave=1),
         note='Tenor saxophone, sustained without vibrato, two dynamic layers.'),
    dict(id='organ', name='Pipe organ (soft stop)', family='keys', mode='slow', mono=True, q=5, wide=True,
         maxlen=5.0, fade=0.6, release=0.3,
         samples=lambda: collect('vcsl', 'Aerophones/Edge-blown Aerophones/Pipe Organ/Quiet',
                                 r'NT5_Man3Quiet_(?P<n>[A-G]#?\d)_(?P<l>rr1)\.wav', {'rr1': 100}, octave=1),
         note='Church pipe organ sampled by Simon Dalzell of Ivy Audio, a quiet stop of the third manual.'),
    dict(id='harp', name='Harp', family='strings', mode='perc', mono=False, q=5,
         maxlen=5.0, fade=0.8, release=0.5,
         samples=lambda: collect('vsco', 'Strings/Harp', r'KSHarp_(?P<n>[A-G]#?\d)_(?P<l>mf|f|mp)\.wav',
                                 {'mf': 100, 'f': 100, 'mp': 100}),
         note='Concert harp, plucked, one dynamic layer.'),
]

# The string ensemble is layered from the three VSCO 2 CE section recordings: for every target note
# each section that has a sample within 2 semitones is resampled to the note and the sections are
# summed at equal loudness. dict(folder, regex, octave shift, {layer name: velocity}).
ENSEMBLES = [
    dict(id='strings', name='String ensemble', family='strings', mode='slow', mono=False, q=6, wide=True,
         maxlen=6.0, fade=0.9, release=0.45, source='vsco', lo=36, hi=86, step=3, reach=2,
         sections=[
             ('Strings/Cello Section/susvib', r'susvib_(?P<n>[A-G]#?\d)_(?P<l>v\d)_1\.wav', 1, {'v1': 50, 'v3': 100}),
             ('Strings/Viola Section/susvib', r'ViolaEns_susvib_(?P<n>[A-G]#?\d)_(?P<l>v\d)_1\.wav', 1, {'v1': 50, 'v2': 100}),
             ('Strings/Violin Section/susVib', r'VlnEns_susVib_(?P<n>[A-G]#?\d)_(?P<l>v\d)\.wav', 1, {'v1': 50, 'v2': 100}),
         ],
         note='Cello, viola and violin sections layered, bowed with vibrato, two dynamic layers.'),
    dict(id='strings-pizz', name='String ensemble (pizzicato)', family='strings', mode='perc', mono=False, q=5,
         maxlen=2.5, fade=0.4, release=0.3, source='vsco', lo=36, hi=86, step=3, reach=2,
         sections=[
             ('Strings/Cello Section/pizzT', r'pizzT_(?P<n>[A-G]#?\d)_(?P<l>v2)_RR1\.wav', 1, {'v2': 100}),
             ('Strings/Viola Section/pizz', r'ViolaEns_pizz_(?P<n>[A-G]#?\d)_(?P<l>v2)_rr1\.wav', 1, {'v2': 100}),
             ('Strings/Violin Section/Pizz', r'VlnEns_Pizz_(?P<n>[A-G]#?\d)_(?P<l>v2)_rr1\.wav', 1, {'v2': 100}),
         ],
         note='Cello, viola and violin sections layered, plucked.'),
]


# ----------------------------------------------------------------------------------------------
# Building a melodic instrument
# ----------------------------------------------------------------------------------------------
def prepare(path, inst, note, log):
    """decode -> channels -> high-pass -> onset trim -> tuning. Returns float array (n, ch)."""
    x = decode(path)
    if inst.get('mono'):
        log['channels'] = 'mono source' if x.shape[1] == 1 else 'mono from stereo: ' + inst.get('_mono_policy', 'sum')
        x = to_mono(x, inst.get('_mono_policy', 'sum'))
    else:
        if x.shape[1] == 1:
            log['channels'] = 'mono source'
        else:
            x = x[:, :2]
            log['channels'] = 'stereo'
    x = highpass(x)
    on = find_onset(x, inst['mode'])
    log['src_onset_ms'] = round(1000.0 * on / SR, 1)
    x = x[on:].copy()
    fade_in(x, 0.0005 if inst['mode'] == 'perc' else 0.006)
    if inst['mode'] == 'slow':
        att = attack_seconds(x)
        if att > ATTACK_MAX:
            cut = int((att - 0.060) * SR)
            x = x[cut:].copy()
            fade_in(x, 0.030)
            log['attack_shortened_ms'] = round(1000.0 * cut / SR)
    if note is not None:
        f, cents, frames = measure_f0(x, note)
        log['src_cents'] = None if cents is None else round(cents, 1)
        fw, _, _ = measure_f0(x, None)
        if fw:
            st = 69 + 12 * math.log2(fw / 440.0) - note
            if abs(st) > 0.6:
                log['free_f0_semitones_off'] = round(st, 1)   # informational: octave/partial errors of the free search show up here
        if cents is not None and frames >= 2 and not inst.get('stretch') and TUNE_FIX < abs(cents) < 150:
            x = retune(x, cents)
            log['retuned_cents'] = round(-cents, 1)
    return x


def finish(x, inst, note):
    maxlen = inst['maxlen'](note) if callable(inst['maxlen']) else inst['maxlen']
    n = int(maxlen * SR)
    if len(x) > n:
        x = x[:n].copy()
        fade_out(x, inst['fade'])
    else:
        x = x.copy()
        fade_out(x, min(inst['fade'], 0.25, len(x) / SR / 3))
    return x


def smooth_levels(items, log_adjust):
    """items: [{note, vel, x}]. Moves a sample onto the median loudness of its neighbours (same layer)
    when it is more than SMOOTH_DB away, then brings samples further than EVEN_DB from the median of
    the whole layer to EVEN_DB. Loudness: loudest 0.4 s (loud_mm)."""
    for vel in sorted({i['vel'] for i in items}):
        layer = sorted([i for i in items if i['vel'] == vel], key=lambda i: i['note'])
        L = [loud_mm(i['x']) for i in layer]
        for k, it in enumerate(layer):
            nb = [L[j] for j in range(max(0, k - 2), min(len(layer), k + 3)) if j != k]
            if len(nb) < 2:
                continue
            med = float(np.median(nb))
            if abs(L[k] - med) > SMOOTH_DB:
                g = med - L[k]
                it['x'] = it['x'] * 10 ** (g / 20)
                L[k] += g
                log_adjust.append(dict(note=it['note'], vel=vel, moved_db=round(g, 1)))
        med = float(np.median(L))
        for k, it in enumerate(layer):
            d = L[k] - med
            if abs(d) > EVEN_DB:
                g = (EVEN_DB if d > 0 else -EVEN_DB) - d
                it['x'] = it['x'] * 10 ** (g / 20)
                log_adjust.append(dict(note=it['note'], vel=vel, evened_db=round(g, 1)))


def write_instrument(inst, items, source_keys, buildlog):
    """items: [{note, vel, x}] already trimmed/tuned/cut. Normalises, encodes, returns manifest entry."""
    adjust = []
    smooth_levels(items, adjust)
    peak = max(float(np.max(np.abs(i['x']))) for i in items)
    g = 10 ** (PEAK_DB / 20) / peak
    top = max(i['vel'] for i in items)
    for i in items:
        i['x'] = i['x'] * g
    notes_ = sorted({i['note'] for i in items})
    rng_ = inst.get('range') or [notes_[0], min(127, notes_[-1] + 2)]
    L = phrase_loudness([(i['note'], i['x']) for i in items if i['vel'] == top], rng_[0], rng_[1], inst['release'])
    gain = round(max(-30.0, min(0.0, TARGET_LUFS - L)) * 2) / 2.0
    samples, total = [], 0
    multi = len({i['vel'] for i in items}) > 1
    for i in sorted(items, key=lambda i: (i['note'], i['vel'])):
        rel = '%s/%03d%s.mp3' % (inst['id'], i['note'], ('_v%d' % i['vel']) if multi else '')
        path = os.path.join(OUT, rel)
        encode_mp3(i['x'], path, inst['q'])
        dec = decode(path)
        lag = xcorr_lag(i['x'], dec)
        size = os.path.getsize(path)
        total += size
        smp = dict(note=i['note'], file=rel, vel=i['vel'])
        if i.get('loop'):
            smp['loopStart'] = round(i['loop'][0], 5)
            smp['loopEnd'] = round(i['loop'][1], 5)
        samples.append(smp)
        e = dict(i.get('log', {}))
        e.update(file=rel, note=i['note'], vel=i['vel'], bytes=size, frames=len(i['x']), decoded_frames=len(dec),
                 mp3_lead_samples=lag)
        buildlog['files'].append(e)
    notes = sorted({i['note'] for i in items})
    srcs = [SOURCES[k] for k in source_keys]
    entry = dict(
        id=inst['id'], name=inst['name'], family=inst['family'],
        range=rng_,
        samples=samples, loop=any('loopStart' in s_ for s_ in samples), release=inst['release'], gain=gain, bytes=total,
        licence=' + '.join(sorted({s['licence'] for s in srcs})),
        source='; '.join('%s, %s' % (s['name'], s['url']) for s in srcs),
        credit=' '.join(s['credit'] for s in srcs if s['credit']),
        about=inst.get('note', ''),
    )
    buildlog['instruments'].setdefault(inst['id'], {}).update(level_smoothing=adjust, norm_gain_db=round(db(g), 2),
                                                              phrase_lufs_at_full_scale=round(L, 1), manifest_gain=gain)
    return entry


def build_instrument(inst, buildlog):
    raw = inst['samples']()
    if not raw:
        raise RuntimeError('no samples found for ' + inst['id'])
    raw = [s for s in raw if s['note'] not in inst.get('drop', ())]
    for s in raw:
        s['note'] = inst.get('renote', {}).get(s['note'], s['note'])
    if inst.get('mono'):
        inst['_mono_policy'], corr = mono_policy([s['path'] for s in raw])
        buildlog['instruments'].setdefault(inst['id'], {})['mono_policy'] = '%s (median L/R correlation %.2f)' % (inst['_mono_policy'], corr)
    items = []
    for s in raw:
        log = dict(src=os.path.relpath(s['path'], SRC))
        x = prepare(s['path'], inst, s['note'], log)
        loop = None
        if inst['mode'] == 'slow' and inst.get('loops', True):
            y, a, b, info = make_loop(x, wide=inst.get('wide', False))
            if y is None:
                log['no_loop'] = info
            else:
                x, loop = y, (a, b)
                log.update(info)
        if loop is None:
            x = finish(x, inst, s['note'])
        items.append(dict(note=s['note'], vel=s['vel'], x=x, log=log, loop=loop))
    return write_instrument(inst, items, sorted({s['source'] for s in raw}), buildlog)


def build_ensemble(ens, buildlog):
    secs = []
    for folder, regex, octv, vel_of in ens['sections']:
        secs.append(collect(ens['source'], folder, regex, vel_of, octave=octv))
    items = []
    for vel in sorted({v for _, _, _, vo in ens['sections'] for v in vo.values()}):
        for note in range(ens['lo'], ens['hi'] + 1, ens['step']):
            parts, used = [], []
            for sec in secs:
                cands = [s for s in sec if s['vel'] == vel and abs(s['note'] - note) <= ens['reach']]
                if not cands:
                    continue
                s = min(cands, key=lambda s: (abs(s['note'] - note), s['note']))
                log = {}
                x = prepare(s['path'], ens, s['note'], log)
                if s['note'] != note:
                    x = shift_semitones(x, note - s['note'])
                x = finish(x, ens, note)
                L = loudness(x)
                parts.append(x * 10 ** ((-30.0 - L) / 20))
                used.append('%s (%+d st, %s)' % (os.path.relpath(s['path'], SRC), note - s['note'],
                                                 'retuned %+.0f c' % log['retuned_cents'] if 'retuned_cents' in log else 'src %s c' % log.get('src_cents')))
            if not parts:
                continue
            n = max(len(p) for p in parts)
            mix = np.zeros((n, 2))
            for p in parts:
                if p.shape[1] == 1:
                    p = np.repeat(p, 2, axis=1)
                mix[:len(p)] += p
            mix /= math.sqrt(len(parts))
            _, cents, _ = measure_f0(mix, note)
            log = dict(src=' + '.join(used), channels='stereo', sections=len(parts), src_cents=None if cents is None else round(cents, 1))
            loop = None
            if ens['mode'] == 'slow':
                y, a, b, info = make_loop(mix, max_end=min(LOOP_MAX_END, ens['maxlen'] - ens['fade'] - 0.1), wide=True)
                if y is None:
                    log['no_loop'] = info
                else:
                    mix, loop = y, (a, b)
                    log.update(info)
            items.append(dict(note=note, vel=vel, x=mix, log=log, loop=loop))
    return write_instrument(ens, items, [ens['source']], buildlog)


# ----------------------------------------------------------------------------------------------
# Kits (filled in by tools/build-sounds-kits.py to keep this file readable)
# ----------------------------------------------------------------------------------------------
def load_kits_module():
    import importlib.util
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build-sounds-kits.py')
    if not os.path.exists(p):
        return None
    spec = importlib.util.spec_from_file_location('build_sounds_kits', p)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


CC_URL = {'CC0 1.0': 'https://creativecommons.org/publicdomain/zero/1.0/', 'CC BY 3.0': 'https://creativecommons.org/licenses/by/3.0/'}


def write_credits(manifest):
    """sounds/CREDITS.md from the manifest and SOURCES, so the two cannot drift apart."""
    used = {}
    for e in manifest['instruments'] + manifest['kits']:
        for k, s_ in SOURCES.items():
            if s_['url'] in e['source']:
                used.setdefault(k, []).append(e['name'])
    L = ['# Sound library: credits and licences', '',
         'Every file in this folder is a recording of a real instrument taken from an openly licensed sample library and prepared for First Loop '
         'by `tools/build-sounds.py`: cut to the start of the note, shortened and faded, some samples retuned by resampling, held notes given a '
         'cross-faded loop, levels adjusted, drum microphones mixed to stereo, converted to MP3. Only libraries under CC0 1.0 (public domain '
         'dedication) or CC BY (attribution) are used; nothing here is under a non-commercial, no-derivatives or share-alike licence.', '',
         'This file is generated from `manifest.json`; the same licence, source and attribution text is in each manifest entry (`licence`, `source`, `credit`).', '',
         '## Attribution required', '',
         'These two libraries are under CC BY 3.0: the lines below must stay with the files and be shown wherever the app lists its credits.', '']
    for k, s_ in SOURCES.items():
        if k in used and s_['credit']:
            L.append('- **%s**: %s' % (', '.join(used[k]), s_['credit']))
    L += ['', '## Instruments and kits', '', '| Instrument or kit | Source | Licence | Attribution line |', '|---|---|---|---|']
    for e in manifest['instruments'] + manifest['kits']:
        L.append('| %s (`%s`) | %s | %s | %s |' % (e['name'], e['id'], e['source'].replace('; ', '<br>'), e['licence'], e['credit'] or 'none required'))
    L += ['', 'The files in `perc/` (shaker, tambourine, claps and the pieces of the Hand percussion kit) are shared by all kits; they come from Virtuosity Drums '
          'and the Versilian Community Sample Library, both CC0 1.0.', '',
          '## Sources', '', '| Library | Repository and commit | Licence | Where the licence is stated | Used for |', '|---|---|---|---|---|']
    for k, s_ in SOURCES.items():
        if k in used:
            L.append('| %s | %s (commit `%s`) | [%s](%s) | %s | %s |' % (s_['name'], s_['url'], s_['commit'], s_['licence'], CC_URL[s_['licence']], s_['evidence'], ', '.join(used[k])))
    L += ['', 'Thanks, although the CC0 libraries ask for none: Karoryfer Samples (D. Smolken) and bigcat instruments; Versilian Studios (Sam Gossner) and '
          'Simon Dalzell of Ivy Audio, who recorded the upright piano and the pipe organ; Jeff Learman; Austin McMahon and Virtuosity Musical Instruments, Boston; '
          'the sfzinstruments project, which hosts most of these libraries.', '',
          '## Looked at and not used', '',
          '- jRhodes3c / jRhodes3d (Jeff Learman, Rhodes Mark I): the samples are CC BY-NC, not usable in a product. The electric piano here is the Wurlitzer instead.',
          '- gleitz/midi-js-soundfonts: renders of the FluidR3_GM (MIT) and MusyngKite (CC BY-SA) soundfonts; share-alike was ruled out and real multi-sampled sources were preferred.',
          '- nbrosowsky/tonejs-instruments: a collection from mixed sources whose individual licences could not be confirmed.',
          '- Nylon-string guitar: no clean permissively licensed source was found (the Discord SFZ GM Bank entry is an empty placeholder).', '']
    open(os.path.join(OUT, 'CREDITS.md'), 'w').write('\n'.join(L))


def main(argv):
    only = set(a for a in argv if not a.startswith('-'))
    os.makedirs(OUT, exist_ok=True)
    os.makedirs(WORK, exist_ok=True)
    mpath = os.path.join(OUT, 'manifest.json')
    lpath = os.path.join(WORK, 'buildlog.json')
    if '--regain' in argv:
        # only recompute the manifest gains from the build log (after changing TARGET_LUFS)
        manifest, buildlog = json.load(open(mpath)), json.load(open(lpath))
        for inst in manifest['instruments']:
            L = buildlog['instruments'][inst['id']]['phrase_lufs_at_full_scale']
            inst['gain'] = round(max(-30.0, min(0.0, TARGET_LUFS - L)) * 2) / 2.0
            buildlog['instruments'][inst['id']]['manifest_gain'] = inst['gain']
            print('%-20s tune at full scale %6.1f LUFS, gain %+.1f dB' % (inst['id'], L, inst['gain']))
        json.dump(manifest, open(mpath, 'w'), indent=1)
        json.dump(buildlog, open(lpath, 'w'), indent=1)
        return
    manifest = dict(version=1, base='', instruments=[], kits=[])
    buildlog = dict(instruments={}, kits={}, files=[])
    if only and os.path.exists(mpath):
        manifest = json.load(open(mpath))
        if os.path.exists(lpath):
            buildlog = json.load(open(lpath))
    done = {}
    for inst in INSTRUMENTS + ENSEMBLES:
        if only and inst['id'] not in only:
            continue
        print('building', inst['id'], flush=True)
        buildlog['files'] = [f for f in buildlog['files'] if not f['file'].startswith(inst['id'] + '/')]
        d = os.path.join(OUT, inst['id'])
        if os.path.isdir(d):
            for f in os.listdir(d):
                os.remove(os.path.join(d, f))
        done[inst['id']] = build_ensemble(inst, buildlog) if 'sections' in inst else build_instrument(inst, buildlog)
        print('   %d samples, %.2f MB, gain %+.1f dB' % (len(done[inst['id']]['samples']), done[inst['id']]['bytes'] / 1e6, done[inst['id']]['gain']), flush=True)
    order = [i['id'] for i in INSTRUMENTS + ENSEMBLES]
    merged = {i['id']: i for i in manifest['instruments']}
    merged.update(done)
    manifest['instruments'] = [merged[i] for i in order if i in merged]
    kits = load_kits_module()
    if kits:
        kdone = kits.build_kits(sys.modules[__name__], only, buildlog)
        kmerged = {k['id']: k for k in manifest['kits']}
        kmerged.update(kdone)
        manifest['kits'] = [kmerged[k] for k in kits.KIT_ORDER if k in kmerged]
    manifest['format'] = dict(
        audio='MP3 (LAME VBR, with the LAME header that makes decoders drop the encoder padding), 44.1 kHz',
        lead='0: after decodeAudioData the note starts at sample 0 of the buffer (measured in Chromium)',
        gain='dB to apply to the instrument or kit so that all of them are equally loud (%g LUFS for a loud mid-range note, '
             'kits %g LUFS for a loud snare); never above 0, so one note cannot clip: add your own master gain' % (TARGET_LUFS, KIT_LUFS),
        vel='nominal velocity of the dynamic layer (50 = soft, 100 = loud): pick the layer nearest to the played velocity, '
            'then scale its level for the velocities in between',
        loop='instrument "loop": true means its samples carry "loopStart" and "loopEnd" (seconds into the decoded file): set '
             'source.loop = true, source.loopStart, source.loopEnd and stop the note with a gain ramp of "release" seconds. '
             'A sample without them is a one-shot. Ignoring the loop points is safe: every file ends with a fade.',
        range='MIDI notes the instrument is meant to play; no note in it is more than 3 semitones from a sample of every layer',
        kits='"pieces" holds the loud hits (round robins: play them in turn or at random); "layers" optionally adds a soft layer '
             '(vel 50) per piece; "absent" lists contract pieces a kit does not have')
    manifest['lead'] = 0
    json.dump(manifest, open(mpath, 'w'), indent=1)
    write_credits(manifest)
    json.dump(buildlog, open(lpath, 'w'), indent=1)
    print('manifest: %d instruments, %d kits' % (len(manifest['instruments']), len(manifest['kits'])))


if __name__ == '__main__':
    main(sys.argv[1:])
