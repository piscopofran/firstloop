#!/usr/bin/env python3
"""
build-sounds-kits.py: the drum kit and hand percussion part of tools/build-sounds.py (loaded by it;
run that script, not this one).

Every hit is built the same way:
  mix      the microphone files of one hit are summed with the weights given in KITS (taken from the
           default settings of each library's own "basic" program; mono microphones go to the centre
           at -3 dB, stereo overheads / room files are kept as recorded).
  filter   15 Hz high-pass (DC, rumble).
  onset    cut to 1 ms before the hit ("perc" rule of build-sounds.py), 0.5 ms fade-in.
  length   cut to the piece's maximum length with a raised-cosine fade-out.
  level    ONE gain for the whole kit, so the kit keeps the balance it was recorded with: the loud
           snare is put at KIT_LUFS (first half second), or lower if a hit would otherwise peak above
           -1.5 dBFS (the difference then goes into the manifest "gain"). Hand percussion comes from
           other recordings and is set to the fixed peak levels in PERC, which put a loud clap near a
           loud snare; its files are shared by all kits, so kits and percussion have the same level
           in the files and the kit "gain" is normally 0.
  layers   two dynamic layers per piece where the source has them ("vel": 50 and 100), up to three
           round-robin hits per layer. Sources without round robins (Virtuosity snare and toms have
           up to 36 dynamic steps instead) use neighbouring dynamic steps as round robins.

Manifest, per kit:
  "pieces": {piece: [files]}                          the loud layer (vel 100), per the contract
  "layers": {piece: [{"vel": 50, "files": [...]}, {"vel": 100, "files": [...]}]}   optional extra
  "absent": [piece, ...]                              contract pieces this kit does not have
  "aliases": {piece: other piece}                     contract pieces that reuse another piece's files
  "gain":   dB, same meaning as for instruments
"""
import math
import os
import re

import numpy as np

KIT_ORDER = ['studio-kit', 'big-kit', 'brush-kit', 'hand-percussion']

REQUIRED = ['kick', 'snare', 'rim', 'hat_closed', 'hat_open', 'tom_low', 'tom_mid', 'tom_high',
            'ride', 'crash', 'shaker', 'tambourine', 'clap']

# maximum length (s) and fade-out (s) per piece
LENGTHS = dict(kick=(1.0, 0.25), snare=(1.3, 0.3), rim=(0.6, 0.15), rimshot=(1.3, 0.3),
               hat_closed=(0.45, 0.12), hat_open=(2.2, 0.5), hat_pedal=(0.45, 0.12),
               tom_low=(2.2, 0.5), tom_mid=(2.0, 0.5), tom_high=(1.8, 0.45),
               ride=(3.5, 1.0), ride_bell=(3.5, 1.0), crash=(4.5, 1.4),
               shaker=(0.45, 0.1), tambourine=(1.0, 0.25), tambourine_shake=(0.6, 0.15), clap=(0.9, 0.25),
               conga_high=(1.2, 0.3), conga_low=(1.5, 0.35), bongo_high=(0.8, 0.2), bongo_low=(0.9, 0.2),
               cajon_low=(1.0, 0.25), cajon_high=(0.8, 0.2), cabasa=(0.5, 0.1), cowbell=(1.0, 0.25))


def vl_pick(n_layers, has_rr):
    """Which dynamic steps of the source make the soft (vel 50) and loud (vel 100) layer."""
    loud = max(1, int(round(0.85 * n_layers)))
    soft = max(1, int(round(0.45 * n_layers)))
    if has_rr or n_layers < 8:
        return [soft], [loud]
    return [soft - 1, soft, soft + 1], [loud - 1, loud, loud + 1]


# ---- Virtuosity Drums: kick mic + snare mic + overheads at unity (its "01-basic-kit" program) ----
def virtuosity(piece_dir, art, n_layers, n_rr):
    def files(vl, rr):
        tail = '%s_%s_vl%d%s.flac' % (piece_dir, art, vl, ('_rr%d' % rr) if n_rr else '')
        return [('Samples/kickmic/%s/kickmic_%s' % (piece_dir, tail), 1.0),
                ('Samples/snaremic/%s/snaremic_%s' % (piece_dir, tail), 1.0),
                ('Samples/oh/%s/oh_%s' % (piece_dir, tail), 1.0)]
    return dict(files=files, n_layers=n_layers, n_rr=n_rr)


# ---- Big Rusty Drums: close + overhead with the default levels of its "02-basic" program ----
def bigrusty(folder, stem, mics, n_layers, n_rr=4):
    def files(vl, rr):
        return [('Samples/%s/%s/%s_vl%d_rr%d.flac' % (folder, m, stem, vl, rr), w) for m, w in mics]
    return dict(files=files, n_layers=n_layers, n_rr=n_rr)


# ---- Swirly Drums (brushes): dry microphones + the library's own "wet" room files ----
def swirly(folder, stems, n_layers, wet=0.35, n_rr=4):
    def files(vl, rr):
        out = []
        for stem, suffix, w in stems:
            name = '%s_vl%d_rr%d%s.wav' % (stem, vl, rr, suffix)
            out.append(('Samples/%s/%s' % (folder, name), w))
            if wet:
                out.append(('Samples/wet/%s/%s' % (folder, name), w * wet, True))   # True: skip if missing
        return out
    return dict(files=files, n_layers=n_layers, n_rr=n_rr)


BR_TOM = [('cl', 0.79), ('oh', 0.55)]
BR_CYM = [('cl', 0.79), ('oh', 0.79)]
BR_SN = [('btm', 0.79), ('top', 0.31), ('oh', 0.47)]

KITS = [
    dict(id='studio-kit', name='Studio kit (sticks)', source='virtuosity',
         about='Club-size jazz kit played with sticks by Austin McMahon: close microphones plus overheads, dry and tight. Two toms.',
         pieces=dict(
             kick=virtuosity('kick', 'snon', 4, 4), snare=virtuosity('snare', 'center', 36, 0),
             rim=virtuosity('snare', 'crossstick', 16, 0), rimshot=virtuosity('snare', 'rimshot', 12, 0),
             hat_closed=virtuosity('hh', 'closed', 4, 4), hat_open=virtuosity('hh', 'open', 4, 3),
             hat_pedal=virtuosity('hh', 'pedal', 3, 4),
             tom_low=virtuosity('ltom', 'center', 16, 0), tom_high=virtuosity('htom', 'center', 16, 0),
             ride=virtuosity('ride', 'ride', 3, 4), ride_bell=virtuosity('ride', 'bell', 3, 3),
             crash=virtuosity('crash', 'crash', 3, 4)),
         aliases=dict(tom_mid='tom_high')),      # a two-tom kit: the middle tom plays the high tom
    dict(id='big-kit', name='Big kit (sticks)', source='bigrusty',
         about='Large 1980s kit with a 24 inch kick and deep toms, close microphones plus overheads: a rounder, roomier sound.',
         pieces=dict(
             kick=bigrusty('kick_24/kick', 'k', [('kick', 0.79), ('oh', 0.4)], 14),
             snare=bigrusty('snare_14/center', 'sn_center', BR_SN, 10),
             rim=bigrusty('snare_14/sidestick', 'sn_ss', BR_SN, 4),
             rimshot=bigrusty('snare_14/rimshot', 'sn_rims', BR_SN, 6),
             hat_closed=bigrusty('hihat_14/cl', 'ht_cl', BR_CYM, 6), hat_open=bigrusty('hihat_14/open', 'ht_open', BR_CYM, 6),
             hat_pedal=bigrusty('hihat_14/chik', 'ht_chik', BR_CYM, 5),
             tom_low=bigrusty('tom_18/center', 't18', BR_TOM, 7), tom_mid=bigrusty('tom_15/center', 't15', BR_TOM, 7),
             tom_high=bigrusty('tom_14/center', 't14', BR_TOM, 7),
             ride=bigrusty('ride_22/rd', 'rd', BR_CYM, 6, 5), ride_bell=bigrusty('ride_22/bl', 'rd_bl', BR_CYM, 4),
             crash=bigrusty('crash_17/cr', 'cr', BR_CYM, 5))),
    dict(id='brush-kit', name='Brush kit', source='swirly',
         about='Small kit played with brushes, a marching bass drum as the kick, with a little of the room: soft and warm.',
         pieces=dict(
             kick=swirly('marching_kick', [('marching_kick', '_reso', 0.79), ('marching_kick', '_beater', 0.55)], 22),
             snare=swirly('snare_main', [('snare_hit', '_top', 0.63), ('snare_hit', '_btm', 0.79)], 12),
             rim=swirly('snare_edge', [('snare_edge', '_top', 0.63), ('snare_edge', '_btm', 0.79)], 10),
             hat_closed=swirly('hat_closed', [('hh_closed', '', 0.79)], 12), hat_open=swirly('hat_open', [('hh_open', '', 0.79)], 14),
             hat_pedal=swirly('hat_foot', [('hh_foot', '', 0.79)], 9),
             tom_low=swirly('tom_floor', [('tom_floor', '', 0.63)], 12), tom_mid=swirly('tom_mlow', [('tom_mlow', '', 0.63)], 12),
             tom_high=swirly('tom_mhi', [('tom_mhi', '', 0.63)], 10),
             ride=swirly('ride', [('ride', '', 0.79)], 15), crash=swirly('crash', [('crash', '', 0.79)], 12))),
]

# Hand percussion: shared by every kit (files live in sounds/perc/). peak = dBFS of the loudest hit.
V = 'Samples/perc/close/'
VC = 'Idiophones/Struck Idiophones/'
PERC = dict(
    shaker=dict(source='virtuosity', peak=-12.0, layers={100: [V + 'shaker/LShaker_Shake1D_rr1_Close.wav', V + 'shaker/LShaker_Shake1U_rr1_Close.wav',
                                                               V + 'shaker/LShaker_Shake1D_rr2_Close.wav', V + 'shaker/LShaker_Shake1U_rr2_Close.wav']}),
    tambourine=dict(source='vcsl', peak=-8.0, layers={50: [VC + 'Tambourine 1/Tamb1_Hit_v1_rr1_Mid.wav'],
                                                      100: [VC + 'Tambourine 1/Tamb1_Hit_v2_rr1_Mid.wav']}),
    tambourine_shake=dict(source='virtuosity', peak=-10.0, layers={100: [V + 'tambourine/Tamb1_Shake_rr%d_Close.wav' % i for i in (1, 2, 3, 4)]}),
    clap=dict(source='vcsl', peak=-5.0, layers={100: [VC + 'Claps/Clap_rr%d.wav' % i for i in (1, 2, 3, 4)]}),
    conga_high=dict(source='virtuosity', peak=-5.0, layers={50: [V + 'conga/Conga_22_HitN_1_50_rr%d_Close.wav' % i for i in (1, 2)],
                                                            100: [V + 'conga/Conga_22_HitN_101_127_rr%d_Close.wav' % i for i in (1, 2, 3)]}),
    conga_low=dict(source='virtuosity', peak=-5.0, layers={50: [V + 'tumba/Tumba_24_HitN_41_70_rr%d_Close.wav' % i for i in (1, 2)],
                                                           100: [V + 'tumba/Tumba_24_HitN_101_127_rr%d_Close.wav' % i for i in (1, 2, 3)]}),
    bongo_high=dict(source='virtuosity', peak=-6.0, layers={50: [V + 'bongoh/BongoH_Hit1_v1_rr%d_Close.wav' % i for i in (1, 2)],
                                                            100: [V + 'bongoh/BongoH_Hit1_v3_rr%d_Close.wav' % i for i in (1, 2, 3)]}),
    bongo_low=dict(source='virtuosity', peak=-6.0, layers={50: [V + 'bongol/BongoL_Hit1_v1_rr%d_Close.wav' % i for i in (1, 2)],
                                                           100: [V + 'bongol/BongoL_Hit1_v3_rr%d_Close.wav' % i for i in (1, 2, 3)]}),
    cajon_low=dict(source='vcsl', peak=-4.0, layers={50: [VC + 'Cajon/Cajon_hit1_mp_rr1.wav', VC + 'Cajon/Cajon_hit1_mp_rr2.wav'],
                                                     100: [VC + 'Cajon/Cajon_hit1_f_rr1.wav', VC + 'Cajon/Cajon_hit1_f_rr2.wav']}),
    cajon_high=dict(source='vcsl', peak=-5.0, layers={50: [VC + 'Cajon/Cajon_hit3_mp_rr1.wav', VC + 'Cajon/Cajon_hit3_mp_rr2.wav'],
                                                      100: [VC + 'Cajon/Cajon_hit3_f_rr1.wav', VC + 'Cajon/Cajon_hit3_f_rr2.wav']}),
    cabasa=dict(source='virtuosity', peak=-12.0, layers={100: [V + 'cabasa/Cabasa1_Rub_v2_rr%d_Close.wav' % i for i in (1, 2, 3)]}),
    cowbell=dict(source='virtuosity', peak=-9.0, layers={50: [V + 'cowbell/Cowbell1_Normal_v1_rr1_Close.wav'],
                                                         100: [V + 'cowbell/Cowbell1_Normal_v3_rr%d_Close.wav' % i for i in (1, 2)]}),
)
KIT_PERC = ['shaker', 'tambourine', 'clap']        # contract pieces every kit points to
PERC_KIT = dict(id='hand-percussion', name='Hand percussion',
                about='Shaker, tambourine, claps, congas, bongos, cajon, cabasa and cowbell. Not a drum kit: it has no kick, snare, hats, toms or cymbals.')


def stereo_mix(bs, src, parts):
    """parts: [(relative path, weight[, optional])] -> (n, 2) float array, or None if the main files are missing."""
    xs = []
    for p in parts:
        path = bs.src_path(src, p[0])
        if not os.path.exists(path):
            if len(p) > 2 and p[2]:
                continue
            return None
        x = bs.decode(path)
        if x.shape[1] == 1:
            x = np.repeat(x, 2, axis=1) * math.sqrt(0.5)
        else:
            x = x[:, :2]
        xs.append(x * p[1])
    if not xs:
        return None
    n = max(len(x) for x in xs)
    out = np.zeros((n, 2))
    for x in xs:
        out[:len(x)] += x
    return out


def shape(bs, x, piece):
    maxlen, fade = LENGTHS[piece]
    x = bs.highpass(x)
    on = bs.find_onset(x, 'perc')
    x = x[on:].copy()
    bs.fade_in(x, 0.0005)
    n = int(maxlen * bs.SR)
    if len(x) > n:
        x = x[:n].copy()
        bs.fade_out(x, fade)
    else:
        bs.fade_out(x, min(fade, len(x) / bs.SR / 3))
    return x, on


def encode_all(bs, hits, buildlog, q=4):
    total = 0
    for h in hits:
        path = os.path.join(bs.OUT, h['file'])
        bs.encode_mp3(h['x'], path, q)
        dec = bs.decode(path)
        h['bytes'] = os.path.getsize(path)
        total += h['bytes']
        buildlog['files'].append(dict(file=h['file'], piece=h['piece'], vel=h['vel'], bytes=h['bytes'], frames=len(h['x']),
                                      decoded_frames=len(dec), mp3_lead_samples=bs.xcorr_lag(h['x'], dec),
                                      src=h['src'], src_onset_ms=h['on_ms'], channels='stereo'))
    return total


def clean_dir(bs, name):
    d = os.path.join(bs.OUT, name)
    if os.path.isdir(d):
        for f in os.listdir(d):
            os.remove(os.path.join(d, f))


def build_perc(bs, buildlog):
    clean_dir(bs, 'perc')
    buildlog['files'] = [f for f in buildlog['files'] if not f['file'].startswith('perc/')]
    out = {}
    hits = []
    for piece, spec in PERC.items():
        ph = []
        for vel in sorted(spec['layers']):
            for k, rel in enumerate(spec['layers'][vel]):
                x = stereo_mix(bs, spec['source'], [(rel, 1.0)])
                if x is None:
                    raise RuntimeError('missing percussion source ' + rel)
                x, on = shape(bs, x, piece)
                ph.append(dict(piece=piece, vel=vel, x=x, src=rel, on_ms=round(1000.0 * on / bs.SR, 1),
                               file='perc/%s_v%d_%d.mp3' % (piece, vel, k + 1)))
        peak = max(float(np.max(np.abs(h['x']))) for h in ph)
        g = 10 ** (spec['peak'] / 20) / peak
        for h in ph:
            h['x'] = h['x'] * g
        hits += ph
        out[piece] = ph
    encode_all(bs, hits, buildlog)
    return out


def layers_of(hits):
    vels = sorted({h['vel'] for h in hits})
    return [dict(vel=v, files=[h['file'] for h in hits if h['vel'] == v]) for v in vels]


def snare_lufs(bs, hits):
    ref = [h for h in hits if h['piece'] == 'snare' and h['vel'] == 100] or [h for h in hits if h['vel'] == 100]
    return float(np.median([bs.loudness(h['x'], 0.5) for h in ref]))


def build_kits(bs, only, buildlog):
    done = {}
    want = lambda kid: (not only) or kid in only
    if not any(want(k['id']) for k in KITS) and not want('hand-percussion'):
        return done
    perc = build_perc(bs, buildlog)
    psrc = sorted({PERC[p]['source'] for p in PERC})
    for kit in KITS:
        if not want(kit['id']):
            continue
        print('building', kit['id'], flush=True)
        clean_dir(bs, kit['id'])
        buildlog['files'] = [f for f in buildlog['files'] if not f['file'].startswith(kit['id'] + '/')]
        hits = []
        for piece, spec in kit['pieces'].items():
            soft, loud = vl_pick(spec['n_layers'], spec['n_rr'] > 0)
            for vel, vls in ((50, soft), (100, loud)):
                combos = [(vl, rr) for vl in vls for rr in (range(1, min(3, spec['n_rr']) + 1) if spec['n_rr'] else [0])]
                k = 0
                for vl, rr in combos:
                    parts = spec['files'](vl, rr)
                    x = stereo_mix(bs, kit['source'], parts)
                    if x is None:
                        print('   missing', piece, 'vl', vl, 'rr', rr, parts[0][0])
                        continue
                    x, on = shape(bs, x, piece)
                    k += 1
                    hits.append(dict(piece=piece, vel=vel, x=x, src=' + '.join('%s x%.2f' % (p[0], p[1]) for p in parts),
                                     on_ms=round(1000.0 * on / bs.SR, 1), file='%s/%s_v%d_%d.mp3' % (kit['id'], piece, vel, k)))
        peak = max(float(np.max(np.abs(h['x']))) for h in hits)
        g = 10 ** (bs.PEAK_DB / 20) / peak                      # the loudest this kit can be
        L = snare_lufs(bs, hits) + bs.db(g)
        down = min(0.0, bs.KIT_LUFS - L)                        # turn down to the common snare level
        g *= 10 ** (down / 20)
        kgain = round((bs.KIT_LUFS - (L + down)) * 2) / 2.0     # > 0 only if the kit cannot reach it
        for h in hits:
            h['x'] = h['x'] * g
        total = encode_all(bs, hits, buildlog)
        pieces, layers = {}, {}
        for piece in kit['pieces']:
            ph = [h for h in hits if h['piece'] == piece]
            if not ph:
                continue
            layers[piece] = layers_of(ph)
            pieces[piece] = layers[piece][-1]['files']
        for piece, other in kit.get('aliases', {}).items():
            layers[piece] = layers[other]
            pieces[piece] = pieces[other]
        for piece in KIT_PERC:
            layers[piece] = layers_of(perc[piece])
            pieces[piece] = layers[piece][-1]['files']
            total += sum(h['bytes'] for h in perc[piece])
        srcs = [bs.SOURCES[kit['source']]] + [bs.SOURCES[s] for s in psrc if s != kit['source']]
        done[kit['id']] = dict(
            id=kit['id'], name=kit['name'], bytes=total, gain=kgain,
            licence=' + '.join(sorted({s['licence'] for s in srcs})),
            source='; '.join('%s, %s' % (s['name'], s['url']) for s in srcs),
            credit=' '.join(s['credit'] for s in srcs if s['credit']),
            pieces=pieces, layers=layers, absent=[p for p in REQUIRED if p not in pieces], aliases=kit.get('aliases', {}),
            about=kit['about'])
        buildlog['kits'][kit['id']] = dict(norm_gain_db=round(bs.db(g), 2), manifest_gain=done[kit['id']]['gain'], snare_lufs_at_full_scale=round(L, 1))
        print('   %d files, %.2f MB, gain %+.1f dB, absent %s' % (len(hits), total / 1e6, done[kit['id']]['gain'], done[kit['id']]['absent']), flush=True)
    if want('hand-percussion'):
        allp = [h for p in perc for h in perc[p]]
        srcs = [bs.SOURCES[s] for s in psrc]
        layers = {p: layers_of(perc[p]) for p in perc}
        pieces = {p: layers[p][-1]['files'] for p in perc}
        done['hand-percussion'] = dict(
            id='hand-percussion', name=PERC_KIT['name'], bytes=sum(h['bytes'] for h in allp), gain=0.0,
            licence=' + '.join(sorted({s['licence'] for s in srcs})),
            source='; '.join('%s, %s' % (s['name'], s['url']) for s in srcs), credit='',
            pieces=pieces, layers=layers, absent=[p for p in REQUIRED if p not in pieces], about=PERC_KIT['about'])
    return done
