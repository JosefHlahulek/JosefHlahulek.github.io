(function () {
  /* ---------- simulated market: GARCH(1,1) with fat-tailed (t, 5 d.o.f.) shocks ----------
     Different on every visit. Units: returns in basis points per step. */
  var OMEGA = 0.8, ALPHA = 0.10, BETA = 0.87;       // bp^2 units; unconditional variance = OMEGA/(1-ALPHA-BETA)
  var DF = 5, LAMBDA = 0.94;
  var M = 640;                                      // points kept on screen
  var STEP_MS = 55;                                 // time per simulated step

  function gauss() { var u = 1 - Math.random(), v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function tShock() {
    var c = 0; for (var k = 0; k < DF; k++) { var g = gauss(); c += g * g; }
    return gauss() / Math.sqrt(c / DF) * Math.sqrt((DF - 2) / DF);   // unit variance
  }

  var v2 = OMEGA / (1 - ALPHA - BETA), ewma = Math.sqrt(v2), cum = 0;
  var logp = [], rets = [], sig = [];

  function step() {
    var s = Math.sqrt(v2), e = s * tShock();       // return in bp
    cum += e; logp.push(cum / 1e4); rets.push(e); sig.push(s);
    ewma = Math.sqrt(LAMBDA * ewma * ewma + (1 - LAMBDA) * e * e);
    v2 = OMEGA + ALPHA * e * e + BETA * v2;
    if (logp.length > M + 1) { logp.shift(); rets.shift(); sig.shift(); }
  }
  for (var w = 0; w < 400; w++) step();           // warm-up
  while (logp.length < M + 1) step();

  /* ---------- indicators ---------- */
  function fmt(x, d) { return x.toFixed(d); }
  function indicators() {
    var n = rets.length, last = rets[n - 1], price = 100 * Math.exp(logp[n - 1]);
    var win = rets.slice(-120), up = 0, i;
    for (i = 0; i < win.length; i++) if (win[i] > 0) up++;
    var p = up / win.length, H = (p <= 0 || p >= 1) ? 0 : -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
    var peak = -Infinity, dd = 0, lp = logp.slice(-M);
    for (i = 0; i < lp.length; i++) { if (lp[i] > peak) peak = lp[i]; var d = Math.exp(lp[i] - peak) - 1; if (d < dd) dd = d; }
    var sNow = Math.sqrt(v2);                      // next-step conditional vol
    set('i-p', fmt(price, 2));
    var el = set('i-r', (last >= 0 ? '+' : '') + fmt(last, 1) + ' bp'); el.className = last >= 0 ? 'up' : 'dn';
    set('i-s', fmt(sNow, 1) + ' bp');
    set('i-e', fmt(ewma, 1) + ' bp');
    set('i-v', fmt(1.645 * sNow, 1) + ' bp');
    set('i-h', fmt(H, 3) + ' bit');
    set('i-d', fmt(dd * 100, 2) + '%');
  }
  function set(id, t) { var e = document.getElementById(id) || document.createElement('span'); e.textContent = t; return e; }

  /* ---------- background canvas ---------- */
  var cv = document.getElementById('bg'); if (!cv) return;
  var ctx = cv.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, acc = 0, last = 0, lo = 0, hi = 1, init = false, tAcc = 0;

  function size() {
    var d = window.devicePixelRatio || 1;
    W = window.innerWidth; H = window.innerHeight;
    cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0);
  }

  function draw(frac) {
    ctx.clearRect(0, 0, W, H);
    var n = logp.length, dx = W / (M - 1), i;
    var mn = Infinity, mx = -Infinity, ms = 0;
    for (i = 0; i < n; i++) { if (logp[i] < mn) mn = logp[i]; if (logp[i] > mx) mx = logp[i]; if (sig[i] > ms) ms = sig[i]; }
    var pad = (mx - mn) * 0.08 + 1e-6; mn -= pad; mx += pad;
    if (!init) { lo = mn; hi = mx; init = true; } else { lo += (mn - lo) * 0.04; hi += (mx - hi) * 0.04; }

    var top = H * 0.24, bottom = H * 0.80;
    function X(k) { return (k - frac) * dx; }
    function Y(v) { return top + (bottom - top) * (1 - (v - lo) / (hi - lo)); }

    // conditional volatility band along the bottom edge
    ctx.beginPath(); ctx.moveTo(X(0), H);
    for (i = 0; i < n; i++) ctx.lineTo(X(i), H - H * 0.18 * (sig[i] / ms));
    ctx.lineTo(X(n - 1), H); ctx.closePath();
    var g = ctx.createLinearGradient(0, H * 0.80, 0, H);
    g.addColorStop(0, 'rgba(11,110,138,.11)'); g.addColorStop(1, 'rgba(11,110,138,0)');
    ctx.fillStyle = g; ctx.fill();

    // price line
    ctx.beginPath();
    for (i = 0; i < n; i++) { if (i) ctx.lineTo(X(i), Y(logp[i])); else ctx.moveTo(X(i), Y(logp[i])); }
    ctx.strokeStyle = 'rgba(13,27,42,.24)'; ctx.lineWidth = 1.4; ctx.lineJoin = 'round'; ctx.stroke();

    // leading point
    var lx = X(n - 1), ly = Y(logp[n - 1]);
    ctx.beginPath(); ctx.arc(lx, ly, 3.4, 0, 6.2832); ctx.fillStyle = 'rgba(11,110,138,.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lx, ly, 9, 0, 6.2832); ctx.strokeStyle = 'rgba(11,110,138,.25)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function loop(t) {
    if (!last) last = t;
    var dt = Math.min(200, t - last); last = t;
    acc += dt; tAcc += dt;
    while (acc >= STEP_MS) { step(); acc -= STEP_MS; }
    draw(acc / STEP_MS);
    if (tAcc > 250) { indicators(); tAcc = 0; }
    requestAnimationFrame(loop);
  }

  size(); indicators(); draw(0);
  if (!reduce) requestAnimationFrame(loop);
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { size(); draw(acc / STEP_MS); }, 120); });
})();
