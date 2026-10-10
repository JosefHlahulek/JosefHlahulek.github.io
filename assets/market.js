(function () {
  /* ---------- simulated market: GARCH(1,1) with fat-tailed (t, 5 d.o.f.) shocks ----------
     Different on every visit. Units: returns in basis points per step. */
  var OMEGA = 0.8, ALPHA = 0.10, BETA = 0.87;       // bp^2 units; unconditional variance = OMEGA/(1-ALPHA-BETA)
  var DF = 5, LAMBDA = 0.94;
  var M = 640;                                      // ticks kept for the line view and the indicators
  var STEP_MS = 55;                                 // time per simulated step
  var K = 10;                                       // steps per candle
  var MAXC = 130;                                   // candles kept
  var S0 = Math.sqrt(OMEGA / (1 - ALPHA - BETA));   // unconditional volatility, bp

  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function tShock() {
    var c = 0; for (var k = 0; k < DF; k++) { var g = gauss(); c += g * g; }
    return gauss() / Math.sqrt(c / DF) * Math.sqrt((DF - 2) / DF);   // unit variance
  }

  var v2 = OMEGA / (1 - ALPHA - BETA), ewma = Math.sqrt(v2), cum = 0;
  var logp = [], rets = [], sig = [];
  var candles = [], live = null, inLive = 0, shift = 0, lastCandleVol = 0;

  function step() {
    var s = Math.sqrt(v2), e = s * tShock();       // return in bp
    var prev = cum / 1e4;
    cum += e; var p = cum / 1e4;
    logp.push(p); rets.push(e); sig.push(s);
    ewma = Math.sqrt(LAMBDA * ewma * ewma + (1 - LAMBDA) * e * e);
    v2 = OMEGA + ALPHA * e * e + BETA * v2;
    if (logp.length > M + 1) { logp.shift(); rets.shift(); sig.shift(); }

    // volume: grows with the size of the move, with log-normal noise
    var vol = 100 * (0.6 + 1.2 * Math.abs(e) / S0) * Math.exp(0.35 * gauss());

    // candle aggregation: K steps per candle, the last one is "live"
    if (!live) {
      live = { o: prev, h: prev, l: prev, c: prev, v: 0 }; candles.push(live); inLive = 0; shift += 1;
      if (candles.length > MAXC) candles.shift();
    }
    live.c = p; if (p > live.h) live.h = p; if (p < live.l) live.l = p; live.v += vol;
    if (++inLive >= K) { lastCandleVol = live.v; live = null; }
  }
  for (var w = 0; w < 400; w++) step();           // warm-up
  while (logp.length < M + 1 || candles.length < MAXC) step();
  shift = 0;

  /* ---------- indicators ---------- */
  function fmt(x, d) { return x.toFixed(d); }
  function fmtVol(v) { return v >= 1000 ? (v / 1000).toFixed(2) + 'k' : v.toFixed(0); }
  function set(id, t) { var e = document.getElementById(id) || document.createElement('span'); e.textContent = t; return e; }
  function indicators() {
    var n = rets.length, lastRet = rets[n - 1], price = 100 * Math.exp(logp[n - 1]);
    var win = rets.slice(-120), up = 0, i;
    for (i = 0; i < win.length; i++) if (win[i] > 0) up++;
    var p = up / win.length, Hs = (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
    var peak = -Infinity, dd = 0, lp = logp.slice(-M);
    for (i = 0; i < lp.length; i++) { if (lp[i] > peak) peak = lp[i]; var d = Math.exp(lp[i] - peak) - 1; if (d < dd) dd = d; }
    var sNow = Math.sqrt(v2);                      // next-step conditional vol
    set('i-p', fmt(price, 2));
    var el = set('i-r', (lastRet >= 0 ? '+' : '') + fmt(lastRet, 1) + ' bp'); el.className = lastRet >= 0 ? 'up' : 'dn';
    set('i-vol', fmtVol(lastCandleVol));
    set('i-s', fmt(sNow, 1) + ' bp');
    set('i-e', fmt(ewma, 1) + ' bp');
    set('i-v', fmt(1.645 * sNow, 1) + ' bp');
    set('i-h', fmt(Hs, 3) + ' bit');
    set('i-d', fmt(dd * 100, 2) + '%');
  }

  /* ---------- background canvas ---------- */
  var cv = document.getElementById('bg'); if (!cv) return;
  var ctx = cv.getContext('2d');
  var candleMode = cv.getAttribute('data-style') === 'candles';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, acc = 0, lastT = 0, lo = 0, hi = 1, init = false, tAcc = 0;

  function size() {
    var d = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  function drawLine(frac) {
    var n = logp.length, dx = W / (M - 1), i;
    var mn = Infinity, mx = -Infinity, ms = 0;
    for (i = 0; i < n; i++) { if (logp[i] < mn) mn = logp[i]; if (logp[i] > mx) mx = logp[i]; if (sig[i] > ms) ms = sig[i]; }
    var pad = (mx - mn) * 0.08 + 1e-6; mn -= pad; mx += pad;
    if (!init) { lo = mn; hi = mx; init = true; } else { lo += (mn - lo) * 0.04; hi += (mx - hi) * 0.04; }

    var top = H * 0.24, bottom = H * 0.80;
    function X(k) { return (k - frac) * dx; }
    function Y(v) { return top + (bottom - top) * (1 - (v - lo) / (hi - lo)); }

    ctx.beginPath(); ctx.moveTo(X(0), H);
    for (i = 0; i < n; i++) ctx.lineTo(X(i), H - H * 0.18 * (sig[i] / ms));
    ctx.lineTo(X(n - 1), H); ctx.closePath();
    var g = ctx.createLinearGradient(0, H * 0.80, 0, H);
    g.addColorStop(0, 'rgba(11,110,138,.11)'); g.addColorStop(1, 'rgba(11,110,138,0)');
    ctx.fillStyle = g; ctx.fill();

    ctx.beginPath();
    for (i = 0; i < n; i++) { if (i) ctx.lineTo(X(i), Y(logp[i])); else ctx.moveTo(X(i), Y(logp[i])); }
    ctx.strokeStyle = 'rgba(13,27,42,.24)'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();

    var lx = X(n - 1), ly = Y(logp[n - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 3.4, 0, 6.2832); ctx.fillStyle = 'rgba(11,110,138,.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, 6.2832); ctx.strokeStyle = 'rgba(11,110,138,.25)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawCandles() {
    var C = Math.max(28, Math.min(96, Math.round(W / 14)));
    var rightPad = 24, cw = (W - rightPad) / C, n = candles.length, start = Math.max(0, n - C - 2), i;
    var mn = Infinity, mx = -Infinity, mv = 0;
    for (i = start; i < n; i++) {
      var c = candles[i]; if (c.l < mn) mn = c.l; if (c.h > mx) mx = c.h; if (c.v > mv) mv = c.v;
    }
    var pad = (mx - mn) * 0.10 + 1e-6; mn -= pad; mx += pad;
    if (!init) { lo = mn; hi = mx; init = true; } else { lo += (mn - lo) * 0.06; hi += (mx - hi) * 0.06; }

    var top = H * 0.22, bottom = H * 0.78, volH = H * 0.16;
    function Y(v) { return top + (bottom - top) * (1 - (v - lo) / (hi - lo)); }
    function XC(k) { return W - rightPad - cw / 2 - (n - 1 - k) * cw + shift * cw; }

    // volume bars along the bottom edge
    var bw = cw * 0.62;
    for (i = start; i < n; i++) {
      var cc = candles[i], up = cc.c >= cc.o, h = volH * (cc.v / mv);
      ctx.fillStyle = up ? 'rgba(11,110,138,.09)' : 'rgba(13,27,42,.07)';
      ctx.fillRect(XC(i) - bw / 2, H - h, bw, h);
    }

    // candles
    for (i = start; i < n; i++) {
      var k = candles[i], isUp = k.c >= k.o, x = XC(i);
      var col = isUp ? '11,110,138' : '13,27,42';
      var a = (k === live) ? 0.55 : 0.30;
      var yo = Y(k.o), yc = Y(k.c), yh = Y(k.h), yl = Y(k.l);
      ctx.strokeStyle = 'rgba(' + col + ',' + a + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, yh); ctx.lineTo(x, yl); ctx.stroke();
      var bt = Math.min(yo, yc), bh = Math.max(1.5, Math.abs(yo - yc));
      ctx.fillStyle = 'rgba(' + col + ',' + (isUp ? 0.04 : 0.14) + ')';
      ctx.fillRect(x - bw / 2, bt, bw, bh);
      ctx.strokeRect(x - bw / 2 + 0.5, bt + 0.5, bw - 1, Math.max(0.5, bh - 1));
    }

    // last price
    var lc = candles[n - 1].c, ly = Y(lc);
    ctx.setLineDash([3, 5]); ctx.strokeStyle = 'rgba(11,110,138,.28)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); ctx.setLineDash([]);
  }

  function draw(frac) {
    ctx.clearRect(0, 0, W, H);
    if (candleMode) drawCandles(); else drawLine(frac);
  }

  function loop(t) {
    if (!lastT) lastT = t;
    var dt = Math.min(200, t - lastT); lastT = t;
    acc += dt; tAcc += dt;
    while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
    shift -= shift * (1 - Math.exp(-dt / 110));    // eases the scroll when a new candle opens
    if (shift < 0.001) shift = 0;
    draw(acc / STEP_MS);
    if (tAcc > 250) { indicators(); tAcc = 0; }
    requestAnimationFrame(loop);
  }

  size(); indicators(); draw(0);
  if (!reduce) requestAnimationFrame(loop);
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); draw(acc / STEP_MS); }, 120); });
})();
