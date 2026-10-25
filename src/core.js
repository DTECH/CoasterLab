// ===================== CORE: track math, physics, blocks, analysis =====================
const G = 9.81;
const DS = 0.5;                       // track sample spacing (m)
const DEG = Math.PI / 180;
const T_STATION = 0, T_CHAIN = 1, T_STEEL = 2, T_BRAKES = 3, T_TRANSFER = 4, T_CABLE = 5, T_TIRELIFT = 6, T_LAUNCH = 7, T_TRIM = 8, T_BLOCK = 9, T_TIRES = 10;
// Segment types in the order the inspector shows them. spd is km/h.
const SEGMENTS = [
  { key: 'station', code: T_STATION, label: 'Station', short: 'Station' },
  { key: 'steel', code: T_STEEL, label: 'Track', short: 'Track' },
  { key: 'chain', code: T_CHAIN, label: 'Chain lift', short: 'Chain', lift: true, spd: 16 },
  { key: 'cable', code: T_CABLE, label: 'Cable lift', short: 'Cable', lift: true, spd: 29 },
  { key: 'tirelift', code: T_TIRELIFT, label: 'Tire lift', short: 'Tire lift', lift: true, spd: 13 },
  { key: 'launch', code: T_LAUNCH, label: 'Launch', short: 'Launch', spd: 100 },
  { key: 'tires', code: T_TIRES, label: 'Booster tires', short: 'Boosters', spd: 22 },
  { key: 'trim', code: T_TRIM, label: 'Trim brake', short: 'Trim', spd: 55 },
  { key: 'block', code: T_BLOCK, label: 'Block brake', short: 'Block', hold: 0 },
  { key: 'brakes', code: T_BRAKES, label: 'Brake run', short: 'Brakes' }
];
const TYPE_CODE = { transfer: T_TRANSFER }, TYPE_NAME = [], TYPE_LABEL = [];
SEGMENTS.forEach(s => { TYPE_CODE[s.key] = s.code; TYPE_NAME[s.code] = s.key; TYPE_LABEL[s.code] = s.label; });
TYPE_NAME[T_TRANSFER] = 'transfer'; TYPE_LABEL[T_TRANSFER] = 'Transfer';
const SEG_BY_KEY = Object.fromEntries(SEGMENTS.map(s => [s.key, s]));
const isLiftCode = c => c === T_CHAIN || c === T_CABLE || c === T_TIRELIFT;
const LAUNCH_SYS = {
  lsm: { label: 'LSM (linear synchronous motor)', short: 'LSM', acc: 1.0 * G },
  hydraulic: { label: 'Hydraulic (cable catch-car)', short: 'Hydraulic', acc: 1.6 * G },
  pneumatic: { label: 'Pneumatic (compressed air)', short: 'Pneumatic', acc: 2.4 * G }
};
// The active train: set from the train designer. hl = heartline height above the rails (negative when riders hang below).
const TRAIN = { cars: 6, carLen: 2.6, massPerCar: 1150, hl: 1.1, envOff: 1.0, envR: 1.7, prone: false };
function setTrainSpec(spec) { Object.assign(TRAIN, spec || {}); TRAIN.len = TRAIN.cars * TRAIN.carLen; TRAIN.mass = TRAIN.cars * TRAIN.massPerCar; }
setTrainSpec();
const PHYS = { mu: 0.0105, drag: 0.00024, brakeDecel: 6.0, trimSpeed: 7.5, stationSpeed: 2.4, transferSpeed: 6.0, stationDecel: 1.8, loadTime: 3.2, blockRelease: 2.6 };
const LIMITS = { y: [0, 500], x: [-200, 20000], yaw: [-360, 360], roll: [-180, 180] };

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const wrapDeg = d => { d = ((d + 180) % 360 + 360) % 360 - 180; return d; };   // [-180, 180)
const normDeg = d => { d = wrapDeg(d); return d === -180 ? 180 : d; };            // (-180, 180]

// ---------- natural cubic spline (chord-length parameterised, 2D profile) ----------
function naturalSpline1D(t, v) {
  const n = v.length; const M = new Float64Array(n);
  if (n < 3) return M;
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const h0 = t[i] - t[i - 1], h1 = t[i + 1] - t[i];
    a[i] = h0; b[i] = 2 * (h0 + h1); c[i] = h1;
    d[i] = 6 * ((v[i + 1] - v[i]) / h1 - (v[i] - v[i - 1]) / h0);
  }
  for (let i = 2; i < n - 1; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
  M[n - 2] = d[n - 2] / b[n - 2];
  for (let i = n - 3; i >= 1; i--) M[i] = (d[i] - c[i] * M[i + 1]) / b[i];
  return M;
}
function splineEval(t, v, M, i, x) {
  const h = t[i + 1] - t[i], A = (t[i + 1] - x) / h, B = (x - t[i]) / h;
  return A * v[i] + B * v[i + 1] + ((A * A * A - A) * M[i] + (B * B * B - B) * M[i + 1]) * h * h / 6;
}
// Monotone cubic (PCHIP) used for roll and lateral offset: smooth, never overshoots
function pchip(xs, ys) {
  const n = xs.length, m = new Float64Array(n);
  if (n < 2) return { xs, ys, m };
  const h = [], dl = [];
  for (let i = 0; i < n - 1; i++) { h[i] = Math.max(1e-6, xs[i + 1] - xs[i]); dl[i] = (ys[i + 1] - ys[i]) / h[i]; }
  m[0] = n > 2 ? 0 : dl[0]; m[n - 1] = n > 2 ? 0 : dl[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (dl[i - 1] * dl[i] <= 0) m[i] = 0;
    else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / dl[i - 1] + w2 / dl[i]); }
  }
  return { xs, ys, m };
}
function pchipAt(p, x) {
  const { xs, ys, m } = p, n = xs.length;
  if (n === 1 || x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const md = (lo + hi) >> 1; if (xs[md] <= x) lo = md; else hi = md; }
  const h = xs[hi] - xs[lo], t = (x - xs[lo]) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * ys[lo] + (t3 - 2 * t2 + t) * h * m[lo] + (-2 * t3 + 3 * t2) * ys[hi] + (t3 - t2) * h * m[hi];
}

function buildProfile(nodes) {
  const n = nodes.length;
  const t = new Float64Array(n), X = new Float64Array(n), Y = new Float64Array(n);
  for (let i = 0; i < n; i++) { X[i] = nodes[i].x; Y[i] = nodes[i].y; }
  for (let i = 1; i < n; i++) t[i] = t[i - 1] + Math.max(0.05, Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]));
  const MX = naturalSpline1D(t, X), MY = naturalSpline1D(t, Y);
  const dx = [], dy = [], du = [], dsArr = [];
  let acc = 0; const nodeS = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) {
    const steps = Math.max(6, Math.ceil((t[i + 1] - t[i]) / 0.2));
    for (let k = (i === 0 ? 0 : 1); k <= steps; k++) {
      const tt = t[i] + (t[i + 1] - t[i]) * k / steps;
      const x = splineEval(t, X, MX, i, tt), y = splineEval(t, Y, MY, i, tt);
      if (dx.length) acc += Math.hypot(x - dx[dx.length - 1], y - dy[dy.length - 1]);
      dx.push(x); dy.push(y); du.push(i + k / steps); dsArr.push(acc);
    }
    nodeS[i + 1] = acc;
  }
  return { dx, dy, du, ds: dsArr, length: acc, nodeS, t, X, Y, MX, MY };
}

function bellF(d) { if (d <= -0.5) return 0; if (d >= 0.5) return 1; return d + 0.5 + Math.sin(2 * Math.PI * d) / (2 * Math.PI); }
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

function segParams(nd) {
  const sg = SEG_BY_KEY[nd.type] || SEG_BY_KEY.steel;
  const spd = (nd.spd != null ? +nd.spd : sg.spd || 0) / 3.6;
  const sys = LAUNCH_SYS[nd.sys] ? nd.sys : 'lsm';
  return { spd, acc: sg.code === T_LAUNCH ? (nd.acc ? +nd.acc * G : LAUNCH_SYS[sys].acc) : 0, hold: nd.hold != null ? +nd.hold : (sg.hold || 0) };
}

// ---------- full 3D track build ----------
// The node path is the riders' heartline. Rails sit TRAIN.hl below it along the rolled up-vector,
// so rolls rotate the track around the riders (heartline rolls), and loops keep riders on the inside.
function buildTrack(nodes, closed) {
  const prof = buildProfile(nodes);
  const N = nodes.length;
  const Lm = Math.max(DS * 4, prof.length);
  const nm = Math.floor(Lm / DS) + 1;
  const px = new Float64Array(nm), py = new Float64Array(nm), pu = new Float64Array(nm);
  let j = 0;
  for (let k = 0; k < nm; k++) {
    const s = Math.min(k * DS, prof.length);
    while (j < prof.ds.length - 2 && prof.ds[j + 1] < s) j++;
    const s0 = prof.ds[j], s1 = prof.ds[j + 1] ?? s0; const f = s1 > s0 ? clamp((s - s0) / (s1 - s0), 0, 1) : 0;
    px[k] = lerp(prof.dx[j], prof.dx[j + 1] ?? prof.dx[j], f);
    py[k] = lerp(prof.dy[j], prof.dy[j + 1] ?? prof.dy[j], f);
    pu[k] = lerp(prof.du[j], prof.du[j + 1] ?? prof.du[j], f);
  }
  const ppx = new Float64Array(nm), ppy = new Float64Array(nm);
  for (let k = 0; k < nm; k++) {
    const a = Math.max(0, k - 1), b = Math.min(nm - 1, k + 1);
    let gx = px[b] - px[a], gy = py[b] - py[a]; const l = Math.hypot(gx, gy) || 1; ppx[k] = gx / l; ppy[k] = gy / l;
  }
  const nodeS = prof.nodeS;
  const wNode = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = i > 0 ? nodeS[i] - nodeS[i - 1] : 0, b = i < N - 1 ? nodeS[i + 1] - nodeS[i] : 0;
    wNode[i] = Math.max(6, (i > 0 && i < N - 1) ? (a + b) : 2 * (a + b));
  }
  // direction-reversal flips: heading +180 and roll +180 at the most vertical sample near the node
  const flipK = [], flipSAt = new Float64Array(N).fill(NaN);
  for (let i = 1; i < N; i++) if (nodes[i].flip) {
    const k0 = Math.max(1, Math.floor((nodeS[i] - 6) / DS)), k1 = Math.min(nm - 2, Math.ceil((nodeS[i] + 6) / DS));
    let best = Math.round(nodeS[i] / DS), bv = 9;
    for (let k = k0; k <= k1; k++) if (Math.abs(ppx[k]) < bv) { bv = Math.abs(ppx[k]); best = k; }
    flipK.push(best); flipSAt[i] = best * DS;
  }
  flipK.sort((a, b) => a - b);
  // heading
  const heading = new Float64Array(nm);
  { let fi = 0;
    for (let k = 0; k < nm; k++) {
      const s = k * DS; let H = 0;
      for (let i = 0; i < N; i++) if (nodes[i].yaw) H += nodes[i].yaw * DEG * bellF((s - nodeS[i]) / wNode[i]);
      while (fi < flipK.length && flipK[fi] <= k) fi++;
      heading[k] = H + Math.PI * fi;
    } }
  // roll: unwrap node angles, monotone-cubic between nodes, split at flips (step there)
  const roll = new Float64Array(nm);
  { const R = new Float64Array(N); R[0] = nodes[0].roll || 0;
    for (let i = 1; i < N; i++) R[i] = R[i - 1] + wrapDeg((nodes[i].roll || 0) - (nodes[i - 1].roll || 0));
    const pieces = []; let xs = [nodeS[0]], ys = [R[0]];
    for (let i = 1; i < N; i++) {
      if (!isNaN(flipSAt[i])) {
        const sf = Math.max(flipSAt[i], xs[xs.length - 1] + 0.01);
        xs.push(sf); ys.push(ys[ys.length - 1]); pieces.push({ end: sf, p: pchip(xs, ys) });
        xs = [sf]; ys = [R[i]];
        if (nodeS[i] > sf + 0.01) { xs.push(nodeS[i]); ys.push(R[i]); }
      } else { if (nodeS[i] <= xs[xs.length - 1] + 0.01) { ys[ys.length - 1] = R[i]; continue; } xs.push(nodeS[i]); ys.push(R[i]); }
    }
    pieces.push({ end: Infinity, p: pchip(xs, ys) });
    let pi = 0;
    for (let k = 0; k < nm; k++) { const s = k * DS; while (pi < pieces.length - 1 && s >= pieces[pi].end) pi++; roll[k] = pchipAt(pieces[pi].p, s) * DEG; } }
  // lateral: cumulative steps (lat) + local offsets (off)
  const lateral = new Float64Array(nm);
  if (nodes.some(nd => nd.lat)) for (let k = 0; k < nm; k++) { let o = 0; const s = k * DS; for (let i = 0; i < N; i++) if (nodes[i].lat) o += nodes[i].lat * bellF((s - nodeS[i]) / wNode[i]); lateral[k] = o; }
  if (nodes.some(nd => nd.off)) {
    // natural cubic through the offsets reproduces helix shapes far better than a monotone fit
    const ts = Float64Array.from(nodeS), vs = Float64Array.from(nodes.map(nd => +nd.off || 0)), Mo = naturalSpline1D(ts, vs);
    let si = 0;
    for (let k = 0; k < nm; k++) { const s = Math.min(k * DS, ts[N - 1]); while (si < N - 2 && ts[si + 1] < s) si++; lateral[k] += ts[si + 1] > ts[si] ? splineEval(ts, vs, Mo, si, s) : vs[si]; }
  }
  // segment types and per-sample parameters
  const typeM = new Uint8Array(nm), sSpd = new Float32Array(nm), sAcc = new Float32Array(nm), sHold = new Float32Array(nm), tunnel = new Uint8Array(nm);
  const segP = nodes.map(segParams);
  for (let k = 0; k < nm; k++) {
    const si = clamp(Math.floor(pu[k]) + 1, 1, N - 1);
    typeM[k] = TYPE_CODE[nodes[si].type] ?? T_STEEL; sSpd[k] = segP[si].spd; sAcc[k] = segP[si].acc; sHold[k] = segP[si].hold; tunnel[k] = nodes[si].tunnel ? 1 : 0;
  }
  // brake targets per contiguous brake run
  const brakeT = new Float32Array(nm);
  { let k = 0; while (k < nm) {
      if (typeM[k] === T_BRAKES) { let e = k; while (e < nm && typeM[e] === T_BRAKES) e++;
        let moreRide = false; for (let q = e; q < nm; q++) if (typeM[q] !== T_BRAKES && typeM[q] !== T_STATION && typeM[q] !== T_TRIM && typeM[q] !== T_BLOCK) { moreRide = true; break; }
        const tgt = moreRide ? PHYS.trimSpeed : (closed ? 2.5 : 0);
        for (let q = k; q < e; q++) brakeT[q] = tgt; k = e; } else k++; } }
  // integrate the heartline
  const P = new Float64Array(nm * 3);
  { let hx = 0, hz = 0;
    for (let k = 0; k < nm; k++) {
      if (k > 0) {
        const dxp = px[k] - px[k - 1], dl = lateral[k] - lateral[k - 1];
        const jump = Math.abs(heading[k] - heading[k - 1]) > 2;
        const Hm = jump ? heading[k - 1] : (heading[k] + heading[k - 1]) * 0.5;
        const sH = Math.sin(Hm), cH = Math.cos(Hm);
        hx += dxp * sH + dl * cH; hz += -dxp * cH + dl * sH;
      }
      P[k * 3] = hx; P[k * 3 + 1] = py[k]; P[k * 3 + 2] = hz;
    } }
  // optional return transfer track (Hermite) back to the station, at constant low height
  let nr = 0; let Pr = [];
  const hlr = TRAIN.hl;
  if (closed && nm > 4) {
    const e = (nm - 1) * 3; const p0 = [P[e], P[e + 1], P[e + 2]], p1 = [P[0], P[1], P[2]];
    const t0 = norm3([P[e] - P[e - 3], P[e + 1] - P[e - 2], P[e + 2] - P[e - 1]]);
    const t1 = norm3([P[3] - P[0], P[4] - P[1], P[5] - P[2]]);
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const Lh = Math.max(30, dist * 1.15);
    const dense = []; const steps = 800;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      dense.push([0, 1, 2].map(c => h00 * p0[c] + h10 * t0[c] * Lh + h01 * p1[c] + h11 * t1[c] * Lh));
    }
    const acc = [0]; for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
    const Lr = acc[acc.length - 1]; nr = Math.max(2, Math.round(Lr / DS));
    const dsr = Lr / nr; let q = 0;
    for (let k = 1; k < nr; k++) {
      const s = k * dsr; while (q < acc.length - 2 && acc[q + 1] < s) q++;
      const f = (s - acc[q]) / Math.max(1e-6, acc[q + 1] - acc[q]);
      Pr.push(lerp(dense[q][0], dense[q + 1][0], f), Math.max(2.4 + Math.max(0, hlr), lerp(dense[q][1], dense[q + 1][1], f)), lerp(dense[q][2], dense[q + 1][2], f));
    }
    nr = Pr.length / 3;
  }
  const n = nm + nr;
  const hx3 = new Float32Array(n), hy3 = new Float32Array(n), hz3 = new Float32Array(n);
  for (let k = 0; k < nm; k++) { hx3[k] = P[k * 3]; hy3[k] = P[k * 3 + 1]; hz3[k] = P[k * 3 + 2]; }
  for (let k = 0; k < nr; k++) { hx3[nm + k] = Pr[k * 3]; hy3[nm + k] = Pr[k * 3 + 1]; hz3[nm + k] = Pr[k * 3 + 2]; }
  const type = new Uint8Array(n); type.set(typeM); for (let k = nm; k < n; k++) type[k] = T_TRANSFER;
  const brake = new Float32Array(n); brake.set(brakeT);
  const segSpd = new Float32Array(n); segSpd.set(sSpd); const segAcc = new Float32Array(n); segAcc.set(sAcc); const segHold = new Float32Array(n); segHold.set(sHold);
  const tun = new Uint8Array(n); tun.set(tunnel);
  const rollA = new Float32Array(n); rollA.set(roll);
  const headA = new Float32Array(n); headA.set(heading);
  const profX = new Float32Array(n), profY = new Float32Array(n), uArr = new Float32Array(n);
  for (let k = 0; k < nm; k++) { profX[k] = px[k]; profY[k] = py[k]; uArr[k] = pu[k]; }
  for (let k = nm; k < n; k++) { profX[k] = NaN; profY[k] = hy3[k]; uArr[k] = N - 1; }
  const L = closed ? n * DS : (nm - 1) * DS;
  const wrap = closed;
  const idx = k => wrap ? ((k % n) + n) % n : clamp(k, 0, n - 1);
  // tangents of the heartline
  const tx = new Float32Array(n), ty = new Float32Array(n), tz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let a = idx(k - 1), b = idx(k + 1);
    if (!wrap && k === 0) a = 0; if (!wrap && k === n - 1) b = n - 1;
    const v = norm3([hx3[b] - hx3[a], hy3[b] - hy3[a], hz3[b] - hz3[a]]);
    tx[k] = v[0]; ty[k] = v[1]; tz[k] = v[2];
  }
  // frames (U = riders' up, R = riders' right)
  const ux = new Float32Array(n), uy = new Float32Array(n), uz = new Float32Array(n);
  const rx = new Float32Array(n), ry = new Float32Array(n), rz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let U;
    if (k < nm) { const sH = Math.sin(heading[k]), cH = Math.cos(heading[k]); U = [-ppy[k] * sH, ppx[k], ppy[k] * cH]; }
    else U = [0, 1, 0];
    const T = [tx[k], ty[k], tz[k]];
    const dd = dot3(U, T); U = norm3([U[0] - T[0] * dd, U[1] - T[1] * dd, U[2] - T[2] * dd]);
    const R = cross3(T, U);
    const r = rollA[k], cr = Math.cos(r), sr = Math.sin(r);
    ux[k] = U[0] * cr + R[0] * sr; uy[k] = U[1] * cr + R[1] * sr; uz[k] = U[2] * cr + R[2] * sr;
    rx[k] = R[0] * cr - U[0] * sr; ry[k] = R[1] * cr - U[1] * sr; rz[k] = R[2] * cr - U[2] * sr;
  }
  // rail centre = heartline - U * hl
  const px3 = new Float32Array(n), py3 = new Float32Array(n), pz3 = new Float32Array(n);
  for (let k = 0; k < n; k++) { px3[k] = hx3[k] - ux[k] * hlr; py3[k] = hy3[k] - uy[k] * hlr; pz3[k] = hz3[k] - uz[k] * hlr; }
  // curvature of the heartline, smoothed
  let kx = new Float32Array(n), ky = new Float32Array(n), kz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let a = idx(k - 1), b = idx(k + 1); let h = 2 * DS;
    if (!wrap && k === 0) { a = 0; h = DS; } if (!wrap && k === n - 1) { b = n - 1; h = DS; }
    kx[k] = (tx[b] - tx[a]) / h; ky[k] = (ty[b] - ty[a]) / h; kz[k] = (tz[b] - tz[a]) / h;
  }
  const smooth = (arr, rad) => { const o = new Float32Array(n); for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let q = -rad; q <= rad; q++) { const ii = wrap ? idx(k + q) : k + q; if (ii < 0 || ii >= n) continue; s += arr[ii]; c++; } o[k] = s / c; } return o; };
  for (let pass = 0; pass < 2; pass++) { kx = smooth(kx, 3); ky = smooth(ky, 3); kz = smooth(kz, 3); }

  let stationEnd = 0; for (let k = 0; k < nm && type[k] === T_STATION; k++) stationEnd = k * DS;
  if (stationEnd < TRAIN.len + 2) stationEnd = Math.min(Lm, TRAIN.len + 2);
  const stationStop = clamp(stationEnd - 1.5, Math.min(TRAIN.len, Lm), Lm);

  let maxY = -1e9, minY = 1e9, bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let k = 0; k < n; k++) { maxY = Math.max(maxY, py3[k]); minY = Math.min(minY, py3[k]); bx0 = Math.min(bx0, px3[k]); bx1 = Math.max(bx1, px3[k]); bz0 = Math.min(bz0, pz3[k]); bz1 = Math.max(bz1, pz3[k]); }

  const trk = { n, nm, closed, L, Lm, prof, nodeS, px: px3, py: py3, pz: pz3, hx: hx3, hy: hy3, hz: hz3, tx, ty, tz, ux, uy, uz, rx, ry, rz, kx, ky, kz,
    type, brake, segSpd, segAcc, segHold, tunnel: tun, roll: rollA, heading: headA, profX, profY, u: uArr, stationEnd, stationStop, maxY, minY, hl: hlr,
    bounds: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 }, flipK };
  trk.wrapS = s => closed ? ((s % trk.L) + trk.L) % trk.L : clamp(s, 0, trk.L);
  trk.fi = s => { s = trk.wrapS(s); const f = s / DS; let i = Math.floor(f); let fr = f - i; if (i >= n - 1) { if (closed) { i = n - 1; } else { i = n - 2; fr = 1; } } return [i, idx(i + 1), fr]; };
  trk.get = (arr, s) => { const [i, j2, f] = trk.fi(s); return arr[i] + (arr[j2] - arr[i]) * f; };
  trk.typeAt = s => trk.type[trk.fi(s)[0]];
  trk.at = s => trk.fi(s)[0];
  trk.blocks = computeBlocks(trk);
  return trk;
}

// ---------- fast plan view of node positions (for the top-down editor) ----------
// Same heading/flip/lateral rules as buildTrack, without frames or forces. Returns heartline x,z per node
// plus the end position and heading.
function planNodes(nodes, upto) {
  const all = upto == null ? nodes : nodes.slice(0, Math.min(nodes.length, upto + 3));
  const N = all.length; if (N < 2) return { x: [0], z: [0], endX: 0, endZ: 0, endH: 0 };
  const prof = buildProfile(all), nodeS = prof.nodeS, Lm = Math.max(DS * 4, prof.length), nm = Math.floor(Lm / DS) + 1;
  const px = new Float64Array(nm), py = new Float64Array(nm); let j = 0;
  for (let k = 0; k < nm; k++) { const s = Math.min(k * DS, prof.length); while (j < prof.ds.length - 2 && prof.ds[j + 1] < s) j++; const s0 = prof.ds[j], s1 = prof.ds[j + 1] ?? s0; const f = s1 > s0 ? clamp((s - s0) / (s1 - s0), 0, 1) : 0; px[k] = lerp(prof.dx[j], prof.dx[j + 1] ?? prof.dx[j], f); py[k] = lerp(prof.dy[j], prof.dy[j + 1] ?? prof.dy[j], f); }
  const w = new Float64Array(N); for (let i = 0; i < N; i++) { const a = i > 0 ? nodeS[i] - nodeS[i - 1] : 0, b = i < N - 1 ? nodeS[i + 1] - nodeS[i] : 0; w[i] = Math.max(6, (i > 0 && i < N - 1) ? (a + b) : 2 * (a + b)); }
  const H = new Float64Array(nm);
  for (let i = 0; i < N; i++) { const yw = all[i].yaw; if (!yw) continue; const k0 = Math.max(0, Math.floor((nodeS[i] - w[i] / 2) / DS)), k1 = Math.min(nm - 1, Math.ceil((nodeS[i] + w[i] / 2) / DS)); for (let k = k0; k <= k1; k++) H[k] += yw * DEG * bellF((k * DS - nodeS[i]) / w[i]); if (k1 < nm - 1) for (let k = k1 + 1; k < nm; k++) H[k] += yw * DEG; }
  for (let i = 1; i < N; i++) if (all[i].flip) { let best = Math.round(nodeS[i] / DS), bv = 9; for (let k = Math.max(1, best - 12); k <= Math.min(nm - 2, best + 12); k++) { const gx = px[k + 1] - px[k - 1], gy = py[k + 1] - py[k - 1], l = Math.hypot(gx, gy) || 1; if (Math.abs(gx / l) < bv) { bv = Math.abs(gx / l); best = k; } } for (let k = best; k < nm; k++) H[k] += Math.PI; }
  const lat = new Float64Array(nm);
  for (let i = 0; i < N; i++) if (all[i].lat) for (let k = 0; k < nm; k++) lat[k] += all[i].lat * bellF((k * DS - nodeS[i]) / w[i]);
  if (all.some(n => n.off)) { const ts = Float64Array.from(nodeS), vs = Float64Array.from(all.map(n => +n.off || 0)), Mo = naturalSpline1D(ts, vs); let si = 0; for (let k = 0; k < nm; k++) { const s = Math.min(k * DS, ts[N - 1]); while (si < N - 2 && ts[si + 1] < s) si++; lat[k] += splineEval(ts, vs, Mo, si, s); } }
  const X = new Float64Array(nm), Z = new Float64Array(nm); let hx = 0, hz = 0;
  for (let k = 1; k < nm; k++) { const dxp = px[k] - px[k - 1], dl = lat[k] - lat[k - 1]; const jump = Math.abs(H[k] - H[k - 1]) > 2; const Hm = jump ? H[k - 1] : (H[k] + H[k - 1]) * 0.5; const sH = Math.sin(Hm), cH = Math.cos(Hm); hx += dxp * sH + dl * cH; hz += -dxp * cH + dl * sH; X[k] = hx; Z[k] = hz; }
  const lim = upto == null ? N : Math.min(N, upto + 1), x = [], z = [];
  for (let i = 0; i < lim; i++) { const k = Math.min(nm - 1, Math.round(nodeS[i] / DS)); x.push(X[k]); z.push(Z[k]); }
  return { x, z, endX: X[nm - 1], endZ: Z[nm - 1], endH: H[nm - 1], startH: H[0] };
}

// ---------- G forces (at the heartline, in the riders' frame) ----------
function gForces(trk, s, v, aT) {
  const g = trk.get;
  const kx = g(trk.kx, s), ky = g(trk.ky, s), kz = g(trk.kz, s);
  const v2 = v * v;
  const fx = v2 * kx + aT * g(trk.tx, s), fy = v2 * ky + aT * g(trk.ty, s) + G, fz = v2 * kz + aT * g(trk.tz, s);
  const vg = (fx * g(trk.ux, s) + fy * g(trk.uy, s) + fz * g(trk.uz, s)) / G;
  const lg = (fx * g(trk.rx, s) + fy * g(trk.ry, s) + fz * g(trk.rz, s)) / G;
  return [vg, lg];
}

// ---------- blocks: places a train can be held so only one train occupies each section ----------
function computeBlocks(trk) {
  const out = [{ s: trk.stationStop, z0: 0, kind: 'station' }];
  const nm = trk.nm; let k = 0;
  while (k < nm) {
    const c = trk.type[k];
    const kind = isLiftCode(c) ? 'lift' : c === T_BLOCK ? 'block' : c === T_BRAKES ? 'brakes' : null;
    if (!kind || c === T_STATION) { k++; continue; }
    let e = k; while (e + 1 < nm && (kind === 'lift' ? isLiftCode(trk.type[e + 1]) : trk.type[e + 1] === c)) e++;
    let hold = 0; for (let q = k; q <= e; q++) hold = Math.max(hold, trk.segHold[q]);
    if (e * DS > trk.stationStop + 2) out.push({ s: e * DS, z0: k * DS, kind, hold });
    k = e + 1;
  }
  out.sort((a, b) => a.s - b.s);
  return out;
}
function maxTrainsFor(trk) { return trk.closed ? Math.max(1, Math.min(4, trk.blocks.length - 1)) : 1; }
function spanOverlap(a0, a1, b0, b1, L, closed) {
  // do intervals (a0,a1] and [b0,b1] overlap on a circle of length L?
  if (!closed) return a0 < b1 && b0 <= a1;
  const norm = x => ((x % L) + L) % L;
  const segs = (x0, x1) => { const lenA = x1 - x0; if (lenA >= L) return [[0, L]]; const s0 = norm(x0), s1 = s0 + lenA; return s1 <= L ? [[s0, s1]] : [[s0, L], [0, s1 - L]]; };
  for (const [p0, p1] of segs(a0, a1)) for (const [q0, q1] of segs(b0, b1)) if (p0 < q1 && q0 <= p1) return true;
  return false;
}
function blockAfter(trk, s) {
  // index of the next boundary at or ahead of s (wraps on closed circuits)
  const b = trk.blocks; for (let i = 0; i < b.length; i++) if (b[i].s >= s - 0.05) return i; return trk.closed ? 0 : -1;
}
function blockOccupied(trk, bi, self, trains) {
  const b = trk.blocks; if (!trains || trains.length < 2) return false;
  const a = b[bi].s, e = bi + 1 < b.length ? b[bi + 1].s : b[0].s + trk.L;
  for (const o of trains) { if (o === self) continue; const so = o.phase === 'load' ? trk.stationStop : o.s; if (spanOverlap(a + 0.01, e, so - TRAIN.len, so, trk.L, trk.closed)) return true; }
  return false;
}

// ---------- physics ----------
function newTrainState(trk, id = 0) {
  return { id, s: trk.stationStop, v: 0, aT: 0, phase: 'load', timer: 1.2, lap: 0, dispatch: false, chainReleased: false,
    stillT: 0, endHold: 0, event: null, time: 0, launches: 0, holdT: 0, held: false, relaunchT: 0 };
}
function physStep(st, trk, dt, trains) {
  const v0 = st.v; st.event = null; st.time += dt;
  const closed = trk.closed; const multi = trains && trains.length > 1;
  if (st.phase === 'load') {
    st.v = 0; st.s = trk.stationStop; st.timer -= dt; st.aT = 0;
    if (st.timer <= 0) {
      if (multi && blockOccupied(trk, 0, st, trains)) { st.held = true; st.timer = 0.2; return; }
      st.held = false; st.phase = 'run'; st.dispatch = true; st.chainReleased = false; st.stillT = 0; st.launches = 0; st.event = 'dispatch';
    }
    return;
  }
  const len = TRAIN.len;
  const sFront = st.s, sMid = st.s - len * 0.5, sRear = st.s - len;
  const kF = trk.at(sFront), kM = trk.at(sMid), kR = trk.at(sRear);
  const tF = trk.type[kF], tM = trk.type[kM], tR = trk.type[kR];
  let gy = 0; for (let c = 0; c < TRAIN.cars; c++) gy += trk.get(trk.ty, st.s - (c + 0.5) * TRAIN.carLen);
  gy /= TRAIN.cars;
  let a = -G * gy;
  if (Math.abs(st.v) > 0.02) a -= Math.sign(st.v) * (PHYS.mu * G + PHYS.drag * st.v * st.v);
  else if (Math.abs(a) < PHYS.mu * G * 1.5) { a = 0; st.v = 0; }
  st.v += a * dt;
  const toward = (target, rate) => { if (st.v < target) st.v = Math.min(target, Math.max(st.v, v0) + rate * dt); else if (st.v > target) st.v = Math.max(target, st.v - rate * dt); };

  // block control: stop before entering an occupied section, and holding brakes
  let stopAt = null;
  if (st.phase === 'run' && st.v >= -0.1 && !st.dispatch) {
    const bi = blockAfter(trk, sFront);
    if (bi >= 0) {
      const b = trk.blocks[bi];
      const inZone = closed ? spanOverlap(b.z0, b.s, sFront - 0.01, sFront, trk.L, true) : sFront >= b.z0 && sFront <= b.s + 0.05;
      if (inZone && b.kind !== 'station') {
        const nb = (bi + 1) % trk.blocks.length;
        const blocked = multi && (closed || nb !== 0) && blockOccupied(trk, nb, st, trains);
        if (b.hold > 0 && b.kind === 'block' && st.holdDone !== bi) { stopAt = { b, bi, hold: true }; }
        else if (blocked) stopAt = { b, bi, hold: false };
      }
    }
  }
  st.held = false;
  if (st.phase === 'arrive') {
    const dir = st.arriveDir;
    const dist = (st.s - trk.stationStop) * -dir;
    const target = Math.sqrt(2 * PHYS.stationDecel * Math.max(0, dist));
    let sv = st.v * dir;
    const tg = Math.max(target, 0.25);
    if (sv > tg) sv = Math.max(tg, sv - 5.5 * dt);
    if (sv < Math.min(1.4, target)) sv = Math.min(1.4, target);
    st.v = sv * dir;
    if (dist <= 0.03 || (dist < 0 && Math.abs(st.v) < 1)) { st.s = trk.stationStop; st.v = 0; st.phase = 'load'; st.timer = PHYS.loadTime; st.event = 'arrived'; st.aT = 0; st.holdDone = -1; return; }
  } else {
    if (st.dispatch) {
      if (st.v < PHYS.stationSpeed) st.v = Math.min(PHYS.stationSpeed, Math.max(0, v0) + 2.0 * dt);
      if (tF !== T_STATION && tF !== T_STEEL && tF !== T_TIRES || st.s > trk.stationEnd + len + 24 || st.v > PHYS.stationSpeed + 1.5) st.dispatch = false;
    }
    // lifts (with anti-rollback on closed circuits)
    const onLift = isLiftCode(tF) || isLiftCode(tM) || isLiftCode(tR);
    if (onLift) {
      const k = isLiftCode(tM) ? kM : isLiftCode(tF) ? kF : kR; const ls = trk.segSpd[k] || 4.4;
      if (stopAt && stopAt.b.kind === 'lift') { toward(0, 2.5); if (st.v < 0) st.v = 0; st.held = true; }
      else if (!st.chainReleased && v0 >= -0.35 && st.v < ls) st.v = Math.min(ls, Math.max(v0, 0) + 3.0 * dt);
      if (closed && st.v < 0 && !st.chainReleased) st.v = 0;
    }
    // launch track
    if (tF === T_LAUNCH || tM === T_LAUNCH) {
      const k = tM === T_LAUNCH ? kM : kF; const tgt = trk.segSpd[k] || 25, acc = trk.segAcc[k] || G;
      if (st.v >= -0.05) {
        if (st.relaunchT > 0) { st.relaunchT -= dt; st.v = 0; }
        else if (st.v < tgt) { if (st.v < 0.3 && !st.launching) { st.launches++; st.event = 'launch'; } st.launching = true; st.v = Math.min(tgt, Math.max(st.v, v0) + acc * dt); }
      } else { st.v = Math.min(0, st.v + 5.5 * dt); if (st.v > -0.05) { st.v = 0; st.relaunchT = st.launches < 3 ? 1.2 : 1e9; st.launching = false; } }
    } else st.launching = false;
    // booster tires hold a speed in either direction
    if (tF === T_TIRES || tM === T_TIRES) { const k = tM === T_TIRES ? kM : kF; const tg = trk.segSpd[k] || 6; if (Math.abs(st.v) < 0.2 && v0 >= -0.2) toward(tg, 2.5); else if (st.v > 0) toward(tg, 2.5); else st.v = -Math.max(-st.v - 2.5 * dt, Math.min(-st.v, tg)); }
    // trim brakes
    if (tF === T_TRIM || tM === T_TRIM) { const k = tM === T_TRIM ? kM : kF; const tg = trk.segSpd[k] || PHYS.trimSpeed; if (Math.abs(st.v) > tg) st.v -= Math.sign(st.v) * Math.min(PHYS.brakeDecel * dt, Math.abs(st.v) - tg); }
    // brake runs
    if (tF === T_BRAKES || tM === T_BRAKES) {
      const tgt = trk.get(trk.brake, sMid) || trk.brake[kF];
      if (Math.abs(st.v) > tgt) st.v -= Math.sign(st.v) * Math.min(PHYS.brakeDecel * dt, Math.abs(st.v) - tgt);
      if (tgt === 0 && Math.abs(st.v) < 0.25) st.v = 0;
    }
    // block brakes / holding brakes
    if (stopAt && stopAt.b.kind !== 'lift') {
      const dist = Math.max(0, (closed ? ((stopAt.b.s - sFront) % trk.L + trk.L) % trk.L : stopAt.b.s - sFront));
      const tg = Math.sqrt(2 * 4.5 * Math.max(0, dist - 0.3));
      if (st.v > tg) st.v = Math.max(tg, st.v - PHYS.brakeDecel * 1.2 * dt);
      if (dist < 0.4 || st.v < 0.05) {
        st.v = 0; st.held = true;
        if (stopAt.hold) { st.holdT += dt; if (st.holdT >= stopAt.b.hold) { st.holdDone = stopAt.bi; st.holdT = 0; st.event = 'release'; st.v = 0.6; } }
      }
    } else if ((tF === T_BLOCK || tM === T_BLOCK) && !st.held) { if (st.v < PHYS.blockRelease && st.v >= -0.1) toward(PHYS.blockRelease, 2.0); }
    if (tF === T_TRANSFER || tM === T_TRANSFER) { if (st.v < PHYS.transferSpeed) st.v = Math.min(PHYS.transferSpeed, Math.max(v0, st.v) + 2.5 * dt); else st.v -= Math.min(2.5 * dt, st.v - PHYS.transferSpeed); }
  }
  st.s += st.v * dt;
  if (closed) {
    if (st.s >= trk.L) { st.s -= trk.L; st.lap++; st.event = 'lap'; st.chainReleased = false; st.holdDone = -1; }
    if (st.s < 0) st.s += trk.L;
    if (st.phase === 'run' && !st.dispatch && st.s < trk.stationEnd && st.s > 1 && st.v > 0) {
      if (multi && trains.some(o => o !== st && o.phase === 'load')) { st.v = 0; st.s = Math.min(st.s, 1.05); st.held = true; }
      else { st.phase = 'arrive'; st.arriveDir = 1; }
    }
  } else {
    if (st.s >= trk.Lm) { st.s = trk.Lm; if (st.v > 0) st.v = 0; st.endHold += dt; if (st.endHold > 1.2) st.chainReleased = true; }
    else st.endHold = 0;
    if (st.s < Math.min(len, trk.Lm)) { st.s = Math.min(len, trk.Lm); if (st.v < 0) st.v = 0; }
    if (st.phase === 'run' && !st.dispatch && st.v < 0 && st.s < trk.stationEnd + 0.5) { st.phase = 'arrive'; st.arriveDir = -1; }
    if (st.phase === 'arrive' && st.arriveDir === -1 && st.s < trk.stationStop) st.s = trk.stationStop;
  }
  if (st.phase === 'run' && Math.abs(st.v) < 0.05 && !st.held && !(st.relaunchT > 0 && st.relaunchT < 100)) {
    st.stillT += dt;
    const ty = trk.typeAt(st.s), onBr = ty === T_BRAKES || ty === T_LAUNCH && st.relaunchT > 100;
    if (st.stillT > (onBr ? 1.6 : 3.0)) {
      st.event = onBr ? 'complete' : 'stall'; st.stallS = st.s;
      st.phase = 'load'; st.timer = PHYS.loadTime; st.s = trk.stationStop; st.v = 0; st.lap++; st.relaunchT = 0; st.holdDone = -1;
    }
  } else st.stillT = 0;
  const aT = (st.v - v0) / dt;
  st.aT += (aT - st.aT) * Math.min(1, dt * 12);
}

// ---------- dry-run analysis ----------
function analyzeTrack(trk) {
  const st = newTrainState(trk); st.timer = 0;
  const n = trk.n; const spd = new Float32Array(n).fill(NaN), vgA = new Float32Array(n).fill(NaN), lgA = new Float32Array(n).fill(NaN);
  let maxV = 0, maxVG = -9, minVG = 9, maxLG = 0, t = 0, stallS = null, completes = false, maxVGs = 0, minVGs = 0, maxLGs = 0, airtime = 0, lapsDone = 0, maxAcc = 0, inverted = 0;
  const dt = 1 / 90; let vgS = 1, lgS = 0; let started = false;
  for (let step = 0; step < 90 * 480; step++) {
    physStep(st, trk, dt); t += dt;
    if (st.phase === 'run') started = true;
    if (st.event === 'stall') { stallS = st.stallS; break; }
    if (st.event === 'complete' || st.event === 'arrived') { completes = true; break; }
    if (st.event === 'lap') lapsDone++;
    if (lapsDone > 0 && !trk.closed) break;
    if (!started) continue;
    const [vg, lg] = gForces(trk, st.s, st.v, st.aT);
    vgS += (vg - vgS) * Math.min(1, dt * 10); lgS += (lg - lgS) * Math.min(1, dt * 10);
    const k = trk.fi(st.s)[0];
    const typ = trk.type[k];
    spd[k] = Math.abs(st.v); vgA[k] = vgS; lgA[k] = lgS;
    if (typ !== T_STATION && typ !== T_TRANSFER) {
      maxV = Math.max(maxV, Math.abs(st.v)); maxAcc = Math.max(maxAcc, Math.abs(st.aT));
      if (vgS > maxVG) { maxVG = vgS; maxVGs = st.s; } if (vgS < minVG) { minVG = vgS; minVGs = st.s; }
      if (Math.abs(lgS) > maxLG) { maxLG = Math.abs(lgS); maxLGs = st.s; }
      if (vgS < 0.2) airtime += dt;
      if (trk.uy[k] < -0.2) inverted += dt;
    }
  }
  // fill gaps (samples skipped at high speed) so colour maps are continuous
  for (const arr of [spd, vgA, lgA]) { let last = NaN; for (let k = 0; k < n; k++) { if (isNaN(arr[k])) { if (!isNaN(last) && k > 0 && !isNaN(arr[k - 1])) { let e = k; while (e < n && isNaN(arr[e])) e++; if (e < n && e - k < 8) for (let q = k; q < e; q++) arr[q] = arr[k - 1]; } } else last = arr[k]; } }
  return { spd, vg: vgA, lg: lgA, maxV, maxVG, minVG, maxLG, maxVGs, minVGs, maxLGs, duration: t, stallS, completes, airtime, maxAcc, inverted, inversions: countInversions(trk) };
}
function countInversions(trk) {
  let c = 0, inv = false;
  for (let k = 0; k < trk.nm; k++) { if (!inv && trk.uy[k] < -0.35) { inv = true; c++; } else if (inv && trk.uy[k] > 0.2) inv = false; }
  return c;
}

// ---------- clearance: track sections that hit each other, and safe crossovers ----------
function trackClearance(trk) {
  const n = trk.n, step = 2, cell = 4, env = TRAIN.envR, need = 2 * env + 0.2, minDs = Math.max(26, 8 * env);
  const cx = new Float32Array(n), cy = new Float32Array(n), cz = new Float32Array(n);
  for (let k = 0; k < n; k++) { cx[k] = trk.px[k] + trk.ux[k] * TRAIN.envOff; cy[k] = trk.py[k] + trk.uy[k] * TRAIN.envOff; cz[k] = trk.pz[k] + trk.uz[k] * TRAIN.envOff; }
  const grid = new Map(); const key = (a, b, c) => a + ',' + b + ',' + c;
  for (let k = 0; k < n; k += step) { const kk = key(Math.floor(cx[k] / cell), Math.floor(cy[k] / cell), Math.floor(cz[k] / cell)); let a = grid.get(kk); if (!a) grid.set(kk, a = []); a.push(k); }
  const sep = (a, b) => { let d = Math.abs(a - b) * DS; if (trk.closed) d = Math.min(d, trk.L - d); return d; };
  const hits = [];
  for (let k = 0; k < n; k += step) {
    const gx = Math.floor(cx[k] / cell), gy = Math.floor(cy[k] / cell), gz = Math.floor(cz[k] / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) {
      const a = grid.get(key(gx + i, gy + j, gz + l)); if (!a) continue;
      for (const q of a) { if (q <= k || sep(k, q) < minDs) continue; const d = Math.hypot(cx[k] - cx[q], cy[k] - cy[q], cz[k] - cz[q]); if (d < need) hits.push([k, q, d]); }
    }
  }
  // cluster hits along the track
  hits.sort((a, b) => a[0] - b[0]);
  const conflicts = [];
  for (const h of hits) {
    const last = conflicts[conflicts.length - 1];
    if (last && h[0] - last.k1 < 24 && Math.abs(h[1] - last.q) < 40) { last.k1 = h[0]; if (h[2] < last.d) { last.d = h[2]; last.k = h[0]; last.q = h[1]; } }
    else conflicts.push({ k: h[0], k0: h[0], k1: h[0], q: h[1], d: h[2] });
  }
  // crossovers: one section passes over another with enough clearance
  const grid2 = new Map();
  for (let k = 0; k < n; k += step) { const kk = Math.floor(trk.px[k] / 3) + ',' + Math.floor(trk.pz[k] / 3); let a = grid2.get(kk); if (!a) grid2.set(kk, a = []); a.push(k); }
  const cross = [];
  for (let k = 0; k < n; k += step) {
    const gx = Math.floor(trk.px[k] / 3), gz = Math.floor(trk.pz[k] / 3);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const a = grid2.get((gx + i) + ',' + (gz + j)); if (!a) continue;
      for (const q of a) {
        if (q <= k || sep(k, q) < minDs) continue;
        if (Math.hypot(trk.px[k] - trk.px[q], trk.pz[k] - trk.pz[q]) > 2.2) continue;
        const dy = Math.abs(trk.py[k] - trk.py[q]);
        if (dy >= need && !cross.some(c => Math.abs(c.k - k) < 30 && Math.abs(c.q - q) < 30)) cross.push({ k, q, dy });
      }
    }
  }
  return { conflicts: conflicts.map(c => ({ s: c.k * DS, s2: c.q * DS, d: c.d, k: c.k, q: c.q })), crossings: cross, need };
}

function safetyLevel(vg, lg) {
  const body = TRAIN.prone ? -vg : vg;
  const lim = TRAIN.prone ? { hi: 6.0, warn: 4.8, lo: -2.2 } : { hi: 5.5, warn: 4.2, lo: -1.5 };
  if (body > lim.hi) return { code: 'blackout', label: 'BLACKOUT RISK', sev: 3 };
  if (body < lim.lo) return { code: 'redout', label: 'REDOUT RISK', sev: 3 };
  if (body > lim.warn) return { code: 'highg', label: 'HIGH G WARNING', sev: 2 };
  if (Math.abs(lg) > 1.8) return { code: 'lateral', label: 'LATERAL G WARNING', sev: 2 };
  return { code: 'safe', label: 'SAFE', sev: 0 };
}
function autoBankFor(nodes, i, trk, an) {
  const nd = nodes[i]; if (!nd.yaw) return 0;
  let v = NaN;
  if (trk && an && trk.nodeS) { const k = Math.min(trk.nm - 1, Math.round(trk.nodeS[i] / DS)); v = an.spd[k]; }
  if (!isFinite(v)) { let ymax = 0; for (const q of nodes) ymax = Math.max(ymax, q.y); v = Math.sqrt(Math.max(4, 2 * G * (ymax - nd.y))) * 0.88; }
  const a = i > 0 && trk ? trk.nodeS[i] - trk.nodeS[i - 1] : 20, b = i < nodes.length - 1 && trk ? trk.nodeS[i + 1] - trk.nodeS[i] : 20;
  const w = Math.max(6, a + b);
  const kap = Math.abs(nd.yaw * DEG) * 2 / w;
  const bank = Math.atan(v * v * kap / G) / DEG;
  return Math.round(clamp(bank, 0, 88) * Math.sign(nd.yaw));
}
// ===================== END CORE =====================
