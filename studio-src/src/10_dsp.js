  // ---------- Studio: listening (pure functions; also run inside a Worker from this function's own text) ----------
  // Everything in stDspLib depends on nothing outside it, so the same text
  // runs on the page, in a Worker and in Node (the tests feed it generated singing).
  //   analyse(samples, sampleRate, opts) -> { notes:[{t,d,p,n,db,cl}], hop, contour, env, tune, ... }
  //   cleanup(analysis, opts)            -> notes in ticks, with her three choices applied
  //   suggestKey(notes), suggestTempo(notes), clickDelay(rec, sr, times, click)
  function stDspLib(){
    "use strict";
    var LOG2 = Math.log(2);
    function hz2m(f){ return 69 + 12 * Math.log(f / 440) / LOG2; }
    function m2hz(m){ return 440 * Math.pow(2, (m - 69) / 12); }
    function db(x){ return 20 * Math.log(Math.max(1e-9, x)) / Math.LN10; }
    function clamp(x, a, b){ return x < a ? a : (x > b ? b : x); }

    // ---- FFT (radix 2, in place) ----
    var plans = {};
    function plan(n){
      if(plans[n]) return plans[n];
      var rev = new Uint32Array(n), cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), bits = Math.round(Math.log(n) / LOG2), i, j, r;
      for(i = 0; i < n; i++){ r = 0; for(j = 0; j < bits; j++) if(i & (1 << j)) r |= 1 << (bits - 1 - j); rev[i] = r; }
      for(i = 0; i < n / 2; i++){ cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
      return (plans[n] = { n:n, rev:rev, cos:cos, sin:sin });
    }
    function fft(re, im, P){
      var n = P.n, rev = P.rev, cos = P.cos, sin = P.sin, i, j, k, t, size, half, step, wr, wi, xr, xi;
      for(i = 0; i < n; i++){ j = rev[i]; if(j > i){ t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
      for(size = 2; size <= n; size <<= 1){
        half = size >> 1; step = n / size;
        for(i = 0; i < n; i += size){
          for(j = 0, k = 0; j < half; j++, k += step){
            wr = cos[k]; wi = -sin[k];
            xr = re[i + j + half] * wr - im[i + j + half] * wi; xi = re[i + j + half] * wi + im[i + j + half] * wr;
            re[i + j + half] = re[i + j] - xr; im[i + j + half] = im[i + j] - xi;
            re[i + j] += xr; im[i + j] += xi;
          }
        }
      }
    }
    function median(a){
      if(!a.length) return 0;
      var b = Array.prototype.slice.call(a).sort(function(x, y){ return x - y; }), m = b.length >> 1;
      return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2;
    }
    function pct(a, p){
      if(!a.length) return 0;
      var b = Array.prototype.slice.call(a).sort(function(x, y){ return x - y; });
      return b[clamp(Math.round(p * (b.length - 1)), 0, b.length - 1)];
    }

    // ---- frame level: pitch candidates (McLeod's normalised square difference), level, spectral change ----
    // The signal is high-passed, brought down to about 22 kHz and looked at in
    // 46 ms windows every 5.8 ms. Each frame keeps up to four period
    // candidates with their clarity; which one is the pitch is decided later,
    // over the whole phrase, so that one frame cannot jump an octave by itself.
    var KC = 4;
    function frames(x, sr, o){
      o = o || {};
      var D = Math.max(1, Math.round(sr / 22050)), fs = sr / D, n = x.length, i, j, k;
      // high-pass (two one-pole stages at 55 Hz) so rumble and handling noise do not pass for a low note
      var hp = new Float32Array(n), a = Math.exp(-2 * Math.PI * 55 / sr), y1 = 0, x1 = 0, y2 = 0, z1 = 0, v;
      for(i = 0; i < n; i++){ v = x[i]; y1 = a * (y1 + v - x1); x1 = v; y2 = a * (y2 + y1 - z1); z1 = y1; hp[i] = y2; }
      // low-pass and decimate
      var ds;
      if(D === 1) ds = hp;
      else {
        var taps = 16 * D + 1, h = new Float32Array(taps), mid = (taps - 1) / 2, fc = 0.45 / D, sum = 0, s;
        for(i = 0; i < taps; i++){
          k = i - mid;
          h[i] = (k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k)) * (0.54 - 0.46 * Math.cos(2 * Math.PI * i / (taps - 1)));
          sum += h[i];
        }
        for(i = 0; i < taps; i++) h[i] /= sum;
        var m = Math.floor(n / D);
        ds = new Float32Array(m);
        for(i = 0; i < m; i++){
          s = 0; var c0 = i * D - mid;
          for(j = 0; j < taps; j++){ k = c0 + j; if(k >= 0 && k < n) s += h[j] * hp[k]; }
          ds[i] = s;
        }
      }
      var W = 1; while(W < fs * 0.042) W <<= 1;                 // 1024 at 22.05 and 24 kHz
      var H = Math.max(1, Math.round(fs * 0.0058)), N2 = W * 2, P = plan(N2);
      var nF = ds.length >= W ? Math.floor((ds.length - W) / H) + 1 : 0;
      var tauMin = Math.max(2, Math.floor(fs / 2300)), tauMax = Math.min(W - 2, Math.ceil(fs / 62));
      var F = { fs:fs, hop:H / fs, win:W / fs, n:nF, tau:new Float32Array(nF * KC), cl:new Float32Array(nF * KC), nc:new Uint8Array(nF),
                db:new Float32Array(nF), flux:new Float32Array(nF), hf:new Float32Array(nF) };
      var re = new Float64Array(N2), im = new Float64Array(N2), nsdf = new Float32Array(W), prevMag = new Float32Array(W / 2), mag = new Float32Array(W / 2);
      var eW = Math.max(8, Math.round(sr * 0.012)), f, off, e, m0, r0, t, best, pk, pv, ct, den, a1, b1, c1, d1, xs, vs, fl, hfE, lfE;
      for(f = 0; f < nF; f++){
        off = f * H;
        // level: 12 ms of the full-rate signal round the middle of the frame
        var ce = Math.round((off + W / 2) * D), e0 = Math.max(0, ce - (eW >> 1)), e1 = Math.min(n, e0 + eW);
        e = 0; for(i = e0; i < e1; i++) e += hp[i] * hp[i];
        F.db[f] = db(Math.sqrt(e / Math.max(1, e1 - e0)));
        for(i = 0; i < W; i++){ re[i] = ds[off + i]; im[i] = 0; }
        for(i = W; i < N2; i++){ re[i] = 0; im[i] = 0; }
        fft(re, im, P);
        // spectral change against the frame before (for consonants), and how much of the frame is hiss
        fl = 0; hfE = 0; lfE = 0;
        for(i = 1; i < W / 2; i++){
          var pw = re[i * 2] * re[i * 2] + im[i * 2] * im[i * 2];
          mag[i] = Math.log(1 + 40 * Math.sqrt(pw));
          if(mag[i] > prevMag[i]) fl += mag[i] - prevMag[i];
          if(i * fs / W > 3500) hfE += pw; else lfE += pw;
          prevMag[i] = mag[i];
        }
        F.flux[f] = fl / (W / 2); F.hf[f] = hfE / (hfE + lfE + 1e-12);
        // autocorrelation from the power spectrum
        for(i = 0; i < N2; i++){ re[i] = re[i] * re[i] + im[i] * im[i]; im[i] = 0; }
        fft(re, im, P);
        r0 = re[0] / N2;
        if(r0 < 1e-10){ F.nc[f] = 0; continue; }
        m0 = 2 * r0;
        nsdf[0] = 1;
        for(t = 1; t <= tauMax + 1 && t < W; t++){
          m0 -= ds[off + t - 1] * ds[off + t - 1] + ds[off + W - t] * ds[off + W - t];
          nsdf[t] = m0 > 1e-12 ? 2 * (re[t] / N2) / m0 : 0;
        }
        // key maxima: the highest point of each positive lobe after the first fall through zero
        t = 1; while(t <= tauMax && nsdf[t] > 0) t++;
        ct = 0; best = 0;
        var ctau = [], cval = [];
        while(t <= tauMax){
          while(t <= tauMax && nsdf[t] <= 0) t++;
          pk = -1; pv = 0;
          while(t <= tauMax && nsdf[t] > 0){ if(nsdf[t] > pv && nsdf[t] >= nsdf[t - 1] && nsdf[t] >= nsdf[t + 1]){ pv = nsdf[t]; pk = t; } t++; }
          if(pk >= tauMin && pk > 0){
            a1 = nsdf[pk - 1]; b1 = nsdf[pk]; c1 = nsdf[pk + 1]; den = a1 - 2 * b1 + c1;
            d1 = Math.abs(den) > 1e-9 ? 0.5 * (a1 - c1) / den : 0; d1 = clamp(d1, -0.5, 0.5);
            xs = pk + d1; vs = b1 - 0.25 * (a1 - c1) * d1;
            ctau.push(xs); cval.push(vs > 1 ? 1 : vs);
            if(vs > best) best = vs;
          }
        }
        // keep the strongest few, in order of period
        var idx = [];
        for(i = 0; i < ctau.length && idx.length < KC; i++) if(cval[i] >= 0.3 && cval[i] >= best * 0.6) idx.push(i);
        F.nc[f] = idx.length;
        for(i = 0; i < idx.length; i++){ F.tau[f * KC + i] = ctau[idx[i]]; F.cl[f * KC + i] = cval[idx[i]]; }
      }
      return F;
    }

    // ---- one pitch per frame: the path through the candidates that changes least ----
    function track(F){
      var n = F.n, pm = new Float32Array(n), cl = new Float32Array(n), i, j, f;
      var A = 9, B = 0.9, C = 0.28, CAP = 3.2;
      var back = new Int8Array(n * KC), prev = new Float64Array(KC), cost = new Float64Array(KC), pmid = new Float64Array(KC), cmid = new Float64Array(KC);
      function emit(f, c){
        var v = F.cl[f * KC + c], hi = -1, q, bestv = 0;
        for(q = 0; q < F.nc[f]; q++) if(F.cl[f * KC + q] > bestv) bestv = F.cl[f * KC + q];
        for(q = 0; q < F.nc[f]; q++) if(F.cl[f * KC + q] >= bestv * 0.88){ hi = q; break; }    // the shortest period among the near-equals
        var sub = hi >= 0 && c > hi ? Math.log(F.tau[f * KC + c] / F.tau[f * KC + hi]) / LOG2 : 0;
        return A * (1 - v) + B * sub;
      }
      f = 0;
      while(f < n){
        if(!F.nc[f]){ f++; continue; }
        var a = f, np = F.nc[f], nc;
        for(j = 0; j < np; j++){ prev[j] = emit(f, j); pmid[j] = hz2m(F.fs / F.tau[f * KC + j]); }
        f++;
        while(f < n && F.nc[f]){
          nc = F.nc[f];
          for(j = 0; j < nc; j++){
            cmid[j] = hz2m(F.fs / F.tau[f * KC + j]);
            var bi = 0, bc = 1e18, tc;
            for(i = 0; i < np; i++){ tc = prev[i] + Math.min(CAP, C * Math.abs(cmid[j] - pmid[i])); if(tc < bc){ bc = tc; bi = i; } }
            cost[j] = bc + emit(f, j); back[f * KC + j] = bi;
          }
          for(j = 0; j < nc; j++){ prev[j] = cost[j]; pmid[j] = cmid[j]; }
          np = nc; f++;
        }
        var b = 0, g;
        for(j = 1; j < np; j++) if(prev[j] < prev[b]) b = j;
        for(g = f - 1; g >= a; g--){
          pm[g] = hz2m(F.fs / F.tau[g * KC + b]); cl[g] = F.cl[g * KC + b];
          if(g > a) b = back[g * KC + b];
        }
      }
      return { pm:pm, cl:cl };
    }

    // ---- the whole take: frames -> notes in seconds ----
    function analyse(x, sr, o){
      o = o || {};
      var F = frames(x, sr, o), T = track(F), n = F.n, hop = F.hop, half = F.win / 2;
      var pm = T.pm, cl = T.cl, dbv = F.db, i, j, k;
      var out = { v:1, sr:sr, dur:x.length / sr, hop:hop, t0:half, n:n, notes:[], tune:0, peakDb:-120, noiseDb:-120, quiet:false, clipped:false };
      if(!n){ out.contour = new Float32Array(0); out.env = new Float32Array(0); return out; }
      // clipping: flat tops at full scale
      var clipN = 0; for(i = 0; i < x.length; i++) if(x[i] >= 0.985 || x[i] <= -0.985) clipN++;
      out.clipped = clipN > x.length * 0.002;
      // levels: the loud end, and the level of the frames that are plainly not a voice
      var all = [], unclear = [];
      for(i = 0; i < n; i++){ all.push(dbv[i]); if(cl[i] < 0.35) unclear.push(dbv[i]); }
      var pk = pct(all, 0.97), nf = unclear.length >= 12 ? pct(unclear, 0.3) : Math.min(pk - 40, pct(all, 0.05));
      if(nf > pk - 12) nf = Math.min(nf, pk - 12);
      out.peakDb = pk; out.noiseDb = nf;
      if(pk < -66){ out.quiet = true; out.contour = new Float32Array(n); out.env = dbv; return out; }
      var gate = Math.max(nf + 7, pk - (o.bleed ? 24 : 32));
      // voiced: clear enough, loud enough, in range; starts need more clarity than continuing does
      var voiced = new Uint8Array(n), on = false, snr = pk - nf, cOn = snr < 18 ? 0.5 : 0.6, cStay = snr < 18 ? 0.38 : 0.45;
      for(i = 0; i < n; i++){
        var okp = pm[i] >= 35 && pm[i] <= 98 && dbv[i] >= gate;
        if(!on){ if(okp && cl[i] >= cOn) on = true; }
        else if(!okp || cl[i] < cStay) on = false;
        voiced[i] = on ? 1 : 0;
      }
      // a start is taken back over the frames that were already clear enough to continue
      for(i = n - 2; i >= 0; i--) if(!voiced[i] && voiced[i + 1] && pm[i] >= 35 && pm[i] <= 98 && dbv[i] >= gate && cl[i] >= cStay && Math.abs(pm[i] - pm[i + 1]) < 1.5) voiced[i] = 1;
      // close holes of up to three frames where the pitch carries on, drop specks
      for(i = 1; i < n - 1; i++){
        if(voiced[i]) continue;
        j = i; while(j < n && !voiced[j]) j++;
        if(j < n && voiced[i - 1] && j - i <= 3 && Math.abs(pm[i - 1] - pm[j]) < 1.2){
          var dmin = 0; for(k = i; k < j; k++) dmin = Math.min(dmin, dbv[k] - Math.min(dbv[i - 1], dbv[j]));
          if(dmin > -5){ for(k = i; k < j; k++){ voiced[k] = 1; pm[k] = pm[i - 1] + (pm[j] - pm[i - 1]) * (k - i + 1) / (j - i + 1); } }
        }
        i = j;
      }
      var runs = [];
      for(i = 0; i < n; i++){
        if(!voiced[i]) continue;
        j = i; while(j < n && voiced[j]) j++;
        if(j - i >= 5) runs.push([i, j]); else for(k = i; k < j; k++) voiced[k] = 0;
        i = j;
      }
      // median of five inside each run (takes out single-frame slips, keeps vibrato)
      var sm = new Float32Array(n), w5 = [];
      runs.forEach(function(r){
        for(i = r[0]; i < r[1]; i++){
          w5.length = 0;
          for(k = Math.max(r[0], i - 2); k <= Math.min(r[1] - 1, i + 2); k++) w5.push(pm[k]);
          sm[i] = median(w5);
        }
      });
      // an octave slip that lasts a few frames: fold back frames that sit an octave from the run's own level
      runs.forEach(function(r){
        var loc = [], q;
        for(i = r[0]; i < r[1]; i++){
          loc.length = 0;
          for(q = Math.max(r[0], i - 26); q < Math.min(r[1], i + 27); q++) loc.push(sm[q]);
          var md = median(loc), d = sm[i] - md;
          if(Math.abs(Math.abs(d) - 12) < 1.2){
            // only short slips: a real octave leap holds
            var a2 = i, b2 = i; while(a2 > r[0] && Math.abs(sm[a2 - 1] - sm[i]) < 1) a2--; while(b2 < r[1] - 1 && Math.abs(sm[b2 + 1] - sm[i]) < 1) b2++;
            if((b2 - a2 + 1) * hop < 0.07) sm[i] -= d > 0 ? 12 : -12;
          }
        }
      });
      // how far from concert pitch she is as a whole (so a singer 30 cents flat still gets her own melody)
      var sx = 0, sy = 0, wsum = 0;
      runs.forEach(function(r){
        for(i = r[0] + 1; i < r[1] - 1; i++){
          if(Math.abs(sm[i] - sm[i - 1]) > 0.12 || Math.abs(sm[i + 1] - sm[i]) > 0.12) continue;
          var ph = 2 * Math.PI * (sm[i] - Math.round(sm[i])); sx += Math.cos(ph) * cl[i]; sy += Math.sin(ph) * cl[i]; wsum += cl[i];
        }
      });
      var tune = 0;
      if(wsum > 0){
        var R = Math.sqrt(sx * sx + sy * sy) / wsum;
        if(R > 0.35 && wsum * hop > 0.5) tune = Math.atan2(sy, sx) / (2 * Math.PI);
      }
      if(o.tune === false) tune = 0;
      if(typeof o.tune === "number") tune = o.tune;
      out.tune = tune;

      // smoothed level for finding the dips between repeated notes
      var es = new Float32Array(n);
      for(i = 0; i < n; i++){ var s3 = 0, c3 = 0; for(k = Math.max(0, i - 1); k <= Math.min(n - 1, i + 1); k++){ s3 += dbv[k]; c3++; } es[i] = s3 / c3; }
      var fluxMed = pct(Array.prototype.slice.call(F.flux), 0.5), fluxHi = pct(Array.prototype.slice.call(F.flux), 0.9);

      var P = o.changeCost || 5.5, minLen = o.minNote || 0.06, raw = [];
      runs.forEach(function(r, ri){
        var a = r[0], b = r[1], len = b - a, lo = 200, hi = 0;
        for(i = a; i < b; i++){ var q = Math.round(sm[i] - tune); if(q < lo) lo = q; if(q > hi) hi = q; }
        lo -= 1; hi += 1;
        var S = hi - lo + 1, cur = new Float64Array(S), nxt = new Float64Array(S), bk = new Int16Array(len * S), s, d, e, mn, mi;
        for(s = 0; s < S; s++){ d = sm[a] - tune - (lo + s); cur[s] = Math.min(d * d, 2.2); }
        for(i = 1; i < len; i++){
          mn = 1e18; mi = 0; for(s = 0; s < S; s++) if(cur[s] < mn){ mn = cur[s]; mi = s; }
          for(s = 0; s < S; s++){
            d = sm[a + i] - tune - (lo + s); e = Math.min(d * d, 2.2);
            if(cur[s] <= mn + P){ nxt[s] = cur[s] + e; bk[i * S + s] = s; } else { nxt[s] = mn + P + e; bk[i * S + s] = mi; }
          }
          var tmp = cur; cur = nxt; nxt = tmp;
        }
        mn = 1e18; mi = 0; for(s = 0; s < S; s++) if(cur[s] < mn){ mn = cur[s]; mi = s; }
        var st = new Int16Array(len); s = mi;
        for(i = len - 1; i >= 0; i--){ st[i] = lo + s; s = bk[i * S + s]; }
        // dips in level inside the run: "da da" on one pitch. A dip counts when the level falls and comes
        // back by 6 dB or more inside about a fifth of a second (less if there is a burst of spectral change with it).
        var cuts = {}, span = Math.round(0.13 / hop);
        for(i = a + 3; i < b - 3; i++){
          if(es[i] > es[i - 1] || es[i] > es[i + 1]) continue;
          var isMin = true; for(k = Math.max(a, i - 4); k <= Math.min(b - 1, i + 4); k++) if(es[k] < es[i]) isMin = false;
          if(!isMin) continue;
          var lm = -200, rm = -200, rAt = i;
          for(k = Math.max(a, i - span); k < i; k++) if(es[k] > lm) lm = es[k];
          for(k = i + 1; k <= Math.min(b - 1, i + span); k++) if(es[k] > rm){ rm = es[k]; rAt = k; }
          var depth = Math.min(lm, rm) - es[i], burst = 0;
          for(k = i; k <= Math.min(b - 1, i + 8); k++) if(F.flux[k] > burst) burst = F.flux[k];
          var need = burst > fluxHi * 1.15 ? 4 : 6;
          if(depth < need) continue;
          // the new note starts where the level has come half way back
          var mid = es[i] + (rm - es[i]) * 0.5, at = i; while(at < rAt && es[at] < mid) at++;
          if(at - a >= 3 && b - at >= 3){ cuts[at] = i; i += 4; }
        }
        // pieces
        var segs = [], s0 = a;
        for(i = a + 1; i <= b; i++){
          if(i === b || st[i - a] !== st[i - 1 - a] || cuts[i] !== undefined){
            segs.push({ a:s0, b:i, n:st[s0 - a], cut:cuts[s0] !== undefined, run:ri });
            s0 = i;
          }
        }
        // a piece between two different notes that never settles (under 35 ms near its own pitch) is the slide itself:
        // the change of note is put in its middle
        for(i = segs.length - 2; i > 0; i--){
          var gq = segs[i], pq = segs[i - 1], nq = segs[i + 1];
          if(gq.cut || nq.cut || (gq.b - gq.a) * hop >= 0.13 || (gq.n - pq.n) * (nq.n - gq.n) <= 0) continue;
          var stable = 0; for(k = gq.a; k < gq.b; k++) if(Math.abs(sm[k] - tune - gq.n) < 0.3) stable++;
          if(stable * hop < 0.035){ var hq = gq.a + Math.round((gq.b - gq.a) / 2); pq.b = hq; nq.a = hq; segs.splice(i, 1); }
        }
        // short pieces join a neighbour: a slide through passing notes, a scoop up into a note
        var guard = 0;
        while(segs.length > 1 && guard++ < 500){
          var si = -1, sl = 1e9;
          for(i = 0; i < segs.length; i++){ var L = (segs[i].b - segs[i].a) * hop; if(L < minLen && L < sl){ sl = L; si = i; } }
          if(si < 0) break;
          var g = segs[si], pv2 = segs[si - 1], nx = segs[si + 1], into;
          if(pv2 && nx && !g.cut && !nx.cut && pv2.n !== nx.n && (g.n - pv2.n) * (nx.n - g.n) > 0){
            // on the way from one note to another: the change of note is put in the middle of the slide
            var half2 = g.a + Math.round((g.b - g.a) / 2);
            pv2.b = half2; nx.a = half2; segs.splice(si, 1); continue;
          }
          if(!pv2 || g.cut) into = nx && !nx.cut ? nx : (pv2 || nx);
          else if(!nx || nx.cut) into = pv2;
          else {
            // towards the nearer pitch; at the very start of a run it is a scoop into the note that follows
            var mdp = median(Array.prototype.slice.call(sm, g.a, g.b)) - tune;
            into = si === 0 ? nx : (Math.abs(mdp - nx.n) <= Math.abs(mdp - pv2.n) ? nx : pv2);
          }
          if(!into) break;
          if(into === nx){ nx.a = g.a; nx.cut = g.cut; } else pv2.b = g.b;
          segs.splice(si, 1);
        }
        segs.forEach(function(g2){ raw.push(g2); });
      });
      // pitch of each piece from its settled middle; neighbours on the same note with no dip between them are one note
      function settle(g){
        var a = g.a, b = g.b, L = b - a, p0 = a + Math.floor(L * 0.18), p1 = b - Math.floor(L * 0.1), arr = [];
        if(p1 - p0 < 3){ p0 = a; p1 = b; }
        for(var q = p0; q < p1; q++) arr.push(sm[q]);
        g.p = median(arr); g.n = Math.round(g.p - tune);
      }
      raw.forEach(settle);
      for(i = raw.length - 1; i > 0; i--){
        var u = raw[i - 1], w = raw[i];
        if(u.run === w.run && u.b === w.a && !w.cut && u.n === w.n){ u.b = w.b; raw.splice(i, 1); settle(u); }
      }
      // loudness, clarity; drop what is too short, too faint or too unclear to be a note
      var notes = [];
      raw.forEach(function(g){
        var a = g.a, b = g.b, L = (b - a) * hop, lv = [], cs = 0;
        for(i = a; i < b; i++){ lv.push(dbv[i]); cs += cl[i]; }
        lv.sort(function(p, q){ return q - p; });
        var top = lv.slice(0, Math.max(1, Math.ceil(lv.length * 0.6))), ldb = 0;
        top.forEach(function(v){ ldb += v; }); ldb /= top.length;
        g.db = ldb; g.cl = cs / (b - a); g.len = L;
      });
      var loud = -200; raw.forEach(function(g){ if(g.len >= 0.08 && g.db > loud) loud = g.db; });
      if(loud < -150) raw.forEach(function(g){ if(g.db > loud) loud = g.db; });
      raw.forEach(function(g){
        if(g.len < 0.045) return;
        if(g.db < loud - (o.bleed ? 20 : 26)) return;
        if(g.cl < (snr < 18 ? 0.5 : 0.62) && g.len < 0.12) return;
        notes.push(g);
      });
      // starts and ends in seconds
      var fineThr;
      notes.forEach(function(g, gi){
        var tA = half + g.a * hop, tB = half + (g.b - 1) * hop + hop;
        var prevSame = gi > 0 && notes[gi - 1].b === g.a;
        if(!prevSame){
          // after silence or a consonant: the level rises before the detector is sure of a pitch. Walk back
          // (at most 45 ms) to where the level was still within 14 dB of the note's own.
          fineThr = g.db - 9; k = g.a; var lim = Math.max(0, g.a - Math.round(0.045 / hop));
          while(k > lim && dbv[k - 1] >= fineThr && dbv[k - 1] <= dbv[k] + 1.5 && cl[k - 1] >= 0.3 && F.hf[k - 1] < 0.5) k--;
          tA = half + k * hop - 0.001;
        } else if(g.cut) tA = half + g.a * hop + 0.002;
        g.t = Math.max(0, tA); g.e = Math.min(out.dur, tB);
      });
      for(i = 0; i < notes.length - 1; i++) if(notes[i].e > notes[i + 1].t) notes[i].e = notes[i + 1].t;
      out.notes = notes.filter(function(g){ return g.e - g.t >= 0.03; }).map(function(g){
        return { t:Math.round(g.t * 1e4) / 1e4, d:Math.round((g.e - g.t) * 1e4) / 1e4, p:Math.round(g.p * 100) / 100, n:g.n,
                 db:Math.round(g.db * 10) / 10, cl:Math.round(g.cl * 100) / 100 };
      });
      // what is kept for drawing her voice under the notes
      var contour = new Float32Array(n);
      for(i = 0; i < n; i++) contour[i] = voiced[i] ? sm[i] : 0;
      out.contour = contour; out.env = dbv;
      return out;
    }

    // ---- her three choices, from the stored analysis ----
    // o: tempo, ppq, origin (seconds in the take that are tick 0 of the part), timing "raw"|"tidy"|"strict",
    //    grid (ticks; 0 = choose), pitch "semi"|"key", key {root, scale}, octave (whole octaves added), range [lo, hi],
    //    autoOctave, maxTicks
    var SCALES = { major:[0, 2, 4, 5, 7, 9, 11], minor:[0, 2, 3, 5, 7, 8, 10] };
    function gridFit(starts, g){
      var s = 0, sx = 0, sy = 0, i, d;
      for(i = 0; i < starts.length; i++){
        d = starts[i] - Math.round(starts[i] / g) * g; s += d * d;
        sx += Math.cos(2 * Math.PI * starts[i] / g); sy += Math.sin(2 * Math.PI * starts[i] / g);
      }
      return { rms:Math.sqrt(s / Math.max(1, starts.length)), shift:Math.atan2(sy, sx) / (2 * Math.PI) * g, R:Math.sqrt(sx * sx + sy * sy) / Math.max(1, starts.length) };
    }
    function chooseGrid(starts, ppq){
      // the coarsest of 1/8, triplets and 1/16 that her starts sit on nearly as well as on the finest
      var c = [[ppq / 2, 0], [ppq / 3, ppq * 0.022], [ppq / 4, ppq * 0.03]], best = c[0][0], bs = 1e9, i, f;
      for(i = 0; i < c.length; i++){
        f = gridFit(starts, c[i][0]);
        // measure after taking out a steady lead or lag
        var sh = f.R > 0.5 ? f.shift : 0, s2 = 0, d, k;
        for(k = 0; k < starts.length; k++){ d = starts[k] - sh - Math.round((starts[k] - sh) / c[i][0]) * c[i][0]; s2 += d * d; }
        var sc = Math.sqrt(s2 / Math.max(1, starts.length)) + c[i][1];
        if(sc < bs){ bs = sc; best = c[i][0]; }
      }
      return best;
    }
    function fitKey(n, key){
      if(!key || key.root === null || key.root === undefined || !SCALES[key.scale]) return n;
      var sc = SCALES[key.scale], pc = ((n - key.root) % 12 + 12) % 12, i, best = 99, bd = 0;
      for(i = 0; i < sc.length; i++){
        var d = sc[i] - pc; if(d > 6) d -= 12; if(d < -6) d += 12;
        if(Math.abs(d) < Math.abs(best) || (Math.abs(d) === Math.abs(best) && d < 0)){ best = d; }
      }
      return n + (best === 99 ? bd : best);
    }
    function cleanup(an, o){
      o = o || {};
      var ppq = o.ppq || 480, tps = (o.tempo || 100) * ppq / 60, origin = o.origin || 0, src = an.notes || [], i;
      var res = { notes:[], grid:0, octave:0, moved:0, early:0, shift:0 };
      if(!src.length) return res;
      // octave: put the middle of what she sang in the instrument's comfortable range
      var ps = src.map(function(q){ return q.n; }), md = median(ps), oct = 0;
      if(o.range && o.autoOctave !== false){
        var lo = o.range[0], hi = o.range[1], centre = (lo + hi) / 2, bestD = 1e9, kk;
        for(kk = -5; kk <= 5; kk++){
          var c = md + 12 * kk, d = Math.abs(c - centre), mx = Math.max.apply(null, ps) + 12 * kk, mnn = Math.min.apply(null, ps) + 12 * kk;
          if(mx > hi) d += (mx - hi) * 2; if(mnn < lo) d += (lo - mnn) * 2;
          if(d < bestD - 1e-6){ bestD = d; oct = kk; }
        }
      }
      oct += (o.octave || 0);
      res.octave = oct;
      var starts = src.map(function(q){ return (q.t - origin) * tps; });
      var g = 0, shift = 0;
      if(o.timing === "tidy" || o.timing === "strict"){
        g = o.grid || chooseGrid(starts, ppq);
        var f = gridFit(starts, g);
        if(f.R > 0.5 && Math.abs(f.shift) <= g * 0.34) shift = f.shift;        // a steady lead or lag comes out first
      }
      res.grid = g; res.shift = shift;
      var notes = [];
      for(i = 0; i < src.length; i++){
        var q = src[i], s = starts[i], l = q.d * tps, p = q.n, moved = 0;
        if(g){
          s = Math.round((s - shift) / g) * g;
          if(o.timing === "strict") l = Math.max(g, Math.round(l / g) * g);
        } else s = Math.round(s);
        if(o.pitch === "key"){ var p2 = fitKey(p, o.key); if(p2 !== p){ moved = 1; p = p2; } }
        p += 12 * oct + (o.semi || 0);
        while(p > 127) p -= 12; while(p < 0) p += 12;
        if(s < 0){ if(s > -(g || ppq / 8) * 0.75) s = 0; else { res.early++; continue; } }
        var rel = (o.loud !== undefined ? o.loud : 0);
        notes.push({ s:s, l:Math.max(ppq / 16, Math.round(l)), p:p, v:0, db:q.db, m:moved, c:Math.round((q.p - an.tune - q.n) * 100) });
      }
      // one voice: two notes on one start keep the longer; a note ends where the next begins
      notes.sort(function(a, b){ return a.s - b.s || b.l - a.l; });
      for(i = notes.length - 1; i > 0; i--) if(notes[i].s === notes[i - 1].s) notes.splice(i, 1);
      for(i = 0; i < notes.length - 1; i++){
        if(notes[i].s + notes[i].l > notes[i + 1].s) notes[i].l = notes[i + 1].s - notes[i].s;
        // strict: a short gap before the next note is closed, as written music would have it
        else if(o.timing === "strict" && g && notes[i + 1].s - (notes[i].s + notes[i].l) <= g) notes[i].l = notes[i + 1].s - notes[i].s;
      }
      if(o.maxTicks) notes = notes.filter(function(q2){ return q2.s < o.maxTicks; });
      // loudness -> velocity: her loudest note is 104, 2.6 steps a decibel below that
      var top = -200; notes.forEach(function(q3){ if(q3.db > top) top = q3.db; });
      notes.forEach(function(q4){
        q4.v = clamp(Math.round(104 + (q4.db - top) * 2.6), 28, 120); delete q4.db;
        if(q4.m) res.moved++; else delete q4.m;
        if(!q4.c) delete q4.c;
      });
      res.notes = notes;
      return res;
    }

    // ---- "This sounds like A minor" ----
    var KS_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
    var KS_MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
    function suggestKey(notes){
      // notes: [{p|n, l|d}] ; returns the best major or minor key and how sure it is
      var h = new Float64Array(12), i, k, tot = 0, pcs = 0;
      notes.forEach(function(q){ var p = q.p !== undefined && q.n === undefined ? q.p : q.n, w = q.l !== undefined ? q.l : q.d; if(p === undefined) return; h[((Math.round(p) % 12) + 12) % 12] += Math.max(0.05, w); });
      for(i = 0; i < 12; i++){ tot += h[i]; if(h[i] > 0) pcs++; }
      if(notes.length < 4 || pcs < 3 || tot <= 0) return null;
      function corr(prof, root){
        var mx = 0, my = 0, sxy = 0, sxx = 0, syy = 0, a, b;
        for(k = 0; k < 12; k++){ mx += h[(k + root) % 12]; my += prof[k]; } mx /= 12; my /= 12;
        for(k = 0; k < 12; k++){ a = h[(k + root) % 12] - mx; b = prof[k] - my; sxy += a * b; sxx += a * a; syy += b * b; }
        return sxy / Math.sqrt(sxx * syy + 1e-12);
      }
      var all = [];
      for(i = 0; i < 12; i++){ all.push({ root:i, scale:"major", r:corr(KS_MAJ, i) }); all.push({ root:i, scale:"minor", r:corr(KS_MIN, i) }); }
      // the first and the last note lean towards the home note
      var first = notes[0], lastN = notes[notes.length - 1];
      all.forEach(function(c){
        var f = first.n !== undefined ? first.n : first.p, l = lastN.n !== undefined ? lastN.n : lastN.p;
        if(((Math.round(l) % 12) + 12) % 12 === c.root) c.r += 0.06;
        if(((Math.round(f) % 12) + 12) % 12 === c.root) c.r += 0.03;
      });
      all.sort(function(a, b){ return b.r - a.r; });
      return { root:all[0].root, scale:all[0].scale, sure:Math.round((all[0].r - all[1].r) * 100) / 100, r:Math.round(all[0].r * 100) / 100,
               next:{ root:all[1].root, scale:all[1].scale } };
    }

    // ---- "free" humming: find the pulse ----
    function suggestTempo(notes, o){
      o = o || {};
      if(!notes || notes.length < 5) return null;
      var ts = notes.map(function(q){ return q.t; }), ws = notes.map(function(q){ return Math.min(1, 0.4 + (q.d || 0.2)); });
      var best = null, bpm, i;
      function res(T){
        var sx = 0, sy = 0, w = 0;
        for(i = 0; i < ts.length; i++){ sx += ws[i] * Math.cos(2 * Math.PI * ts[i] / T); sy += ws[i] * Math.sin(2 * Math.PI * ts[i] / T); w += ws[i]; }
        return { R:Math.sqrt(sx * sx + sy * sy) / w, ph:Math.atan2(sy, sx) };
      }
      for(bpm = 50; bpm <= 180; bpm += 0.25){
        var T = 60 / bpm, a = res(T), b = res(T / 2), c = res(T / 4);
        // the beat itself, its half and its quarter all have to carry notes; mid tempos are the likelier reading
        var prior = Math.exp(-0.5 * Math.pow(Math.log(bpm / 100) / Math.log(2) / 0.55, 2));
        var sc = (0.45 * a.R + 0.4 * b.R + 0.15 * c.R) * (0.7 + 0.3 * prior);
        if(!best || sc > best.sc) best = { sc:sc, bpm:bpm, ph:a.ph, R:b.R, Ra:a.R };
      }
      if(!best || best.R < 0.45) return null;
      var Tb = 60 / best.bpm, off = (best.ph / (2 * Math.PI)) * Tb;          // a beat falls at off + k*Tb
      // refine the tempo by a straight line through the note starts against their nearest half-beat numbers
      var xs = [], ys = [];
      for(i = 0; i < ts.length; i++){ var kq = Math.round((ts[i] - off) / (Tb / 2)); if(Math.abs(ts[i] - off - kq * Tb / 2) < Tb / 8){ xs.push(kq); ys.push(ts[i]); } }
      if(xs.length >= 4){
        var mx = 0, my = 0, sxy = 0, sxx = 0; for(i = 0; i < xs.length; i++){ mx += xs[i]; my += ys[i]; } mx /= xs.length; my /= xs.length;
        for(i = 0; i < xs.length; i++){ sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) * (xs[i] - mx); }
        if(sxx > 0){ var slope = sxy / sxx; if(slope > 0){ Tb = slope * 2; off = my - slope * mx; } }
      }
      // bar 1 starts on the beat nearest her first note
      var k0 = Math.round((ts[0] - off) / Tb), origin = off + k0 * Tb;
      if(origin > ts[0] + Tb * 0.3) origin -= Tb;
      return { bpm:Math.round(60 / Tb), exact:Math.round(600 / Tb) / 10, origin:Math.max(0, origin), sure:Math.round(best.R * 100) / 100 };
    }

    // ---- latency: where do the clicks that were played turn up in what the microphone heard ----
    // times: when each click left (seconds on the recording's own clock); click: the click's samples.
    // Returns the delay in seconds that most clicks agree on, or null.
    function clickDelay(rec, sr, times, click, maxDelay){
      var found = [], W = Math.round((maxDelay || 0.45) * sr), L = click.length, i, k, t, e = 0;
      for(i = 0; i < L; i++) e += click[i] * click[i];
      times.forEach(function(tm){
        var a = Math.round(tm * sr), best = 0, at = -1, tot = 0, cnt = 0;
        if(a < 0 || a + W + L > rec.length) return;
        for(k = 0; k < W; k += 1){
          var s = 0, er = 0;
          for(i = 0; i < L; i += 2){ var v = rec[a + k + i]; s += v * click[i]; er += v * v; }
          var c = er > 1e-10 ? Math.abs(s) / Math.sqrt(er * e / 2) : 0;       // normalised: 1 = the click itself
          tot += c; cnt++;
          if(c > best){ best = c; at = k; }
        }
        if(at >= 0 && best > 0.35 && best > 4 * tot / cnt) found.push({ d:at / sr, c:best });
      });
      if(found.length < Math.max(2, Math.ceil(times.length * 0.5))) return null;
      var ds = found.map(function(f){ return f.d; }), md = median(ds), agree = ds.filter(function(d){ return Math.abs(d - md) < 0.004; });
      if(agree.length < Math.max(2, Math.ceil(times.length * 0.5))) return null;
      var s2 = 0; agree.forEach(function(d){ s2 += d; });
      return { delay:s2 / agree.length, heard:agree.length, of:times.length, strength:median(found.map(function(f){ return f.c; })) };
    }

    // ---- a picture of a recording: lowest and highest sample of each slice ----
    function peaks(x, per){
      var n = Math.ceil(x.length / per), out = new Int8Array(n * 2), i, j, lo, hi, v;
      for(i = 0; i < n; i++){
        lo = 1; hi = -1;
        for(j = i * per; j < Math.min(x.length, (i + 1) * per); j++){ v = x[j]; if(v < lo) lo = v; if(v > hi) hi = v; }
        out[i * 2] = clamp(Math.round(lo * 127), -127, 127); out[i * 2 + 1] = clamp(Math.round(hi * 127), -127, 127);
      }
      return out;
    }
    // ---- how far a recorded note is from the pitch it is filed under ----
    // x: a stretch of the recording after its attack; f0: the pitch it should have. Returns { cents (sharp is positive), clarity }.
    function tuneOf(x, sr, f0){
      var D = Math.max(1, Math.floor(sr / (f0 * 110))), i, j;
      if(D > 1){ var m = Math.floor(x.length / D), y = new Float32Array(m), s; for(i = 0; i < m; i++){ s = 0; for(j = 0; j < D; j++) s += x[i * D + j]; y[i] = s / D; } x = y; sr = sr / D; }
      var per = sr / f0, lo = Math.floor(per / Math.pow(2, 1.2 / 12)), hi = Math.ceil(per * Math.pow(2, 1.2 / 12)), N = Math.min(x.length - hi - 2, Math.round(Math.max(0.1 * sr, 30 * per)));
      if(N < per * 6) return { cents:null, clarity:0 };
      var best = -1, bl = 0, c = new Float64Array(hi + 2), l, sx, e1, e2, a, b;
      for(l = lo - 1; l <= hi + 1; l++){ sx = 0; e1 = 0; e2 = 0; for(i = 0; i < N; i++){ a = x[i]; b = x[i + l]; sx += a * b; e1 += a * a; e2 += b * b; } c[l] = sx / Math.sqrt(e1 * e2 + 1e-20); if(l >= lo && l <= hi && c[l] > best){ best = c[l]; bl = l; } }
      if(best < 0.5 || bl === lo || bl === hi) return { cents:null, clarity:best };
      var d = 0.5 * (c[bl - 1] - c[bl + 1]) / (c[bl - 1] - 2 * c[bl] + c[bl + 1]);
      return { cents:1200 * Math.log((sr / (bl + d)) / f0) / LOG2, clarity:best };
    }
    return { tuneOf:tuneOf, analyse:analyse, cleanup:cleanup, suggestKey:suggestKey, suggestTempo:suggestTempo, clickDelay:clickDelay, peaks:peaks,
             frames:frames, track:track, fitKey:fitKey, chooseGrid:chooseGrid, hz2m:hz2m, m2hz:m2hz, SCALES:SCALES };
  }
