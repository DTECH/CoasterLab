// ===================== CORE: track math, physics, presets =====================
const G = 9.81;
const DS = 0.5;                       // track sample spacing (m)
const T_STATION = 0, T_CHAIN = 1, T_STEEL = 2, T_BRAKES = 3, T_TRANSFER = 4;
const TYPE_CODE = { station: 0, chain: 1, steel: 2, brakes: 3, transfer: 4 };
const TYPE_NAME = ['station', 'chain', 'steel', 'brakes', 'transfer'];
const TYPE_LABEL = ['Station', 'Chain Lift', 'Steel Track', 'Brakes', 'Transfer'];
const TRAIN = { cars: 6, carLen: 2.6, massPerCar: 1150 };
TRAIN.len = TRAIN.cars * TRAIN.carLen;
TRAIN.mass = TRAIN.cars * TRAIN.massPerCar;
const PHYS = {
  mu: 0.0105, drag: 0.00024, chainSpeed: 4.4, brakeDecel: 6.0, trimSpeed: 7.5,
  stationSpeed: 2.4, transferSpeed: 6.0, stationDecel: 1.8, loadTime: 3.2
};

const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smoother = t => t * t * t * (t * (t * 6 - 15) + 10);
const DEG = Math.PI / 180;

// ---------- natural cubic spline (chord-length parameterised, 2D) ----------
function naturalSpline1D(t, v) {
  const n = v.length; const M = new Float64Array(n);
  if (n < 3) return M;
  const a = new Float64Array(n), b = new Float64Array(n), c = new Float64Array(n), d = new Float64Array(n);
  for (let i = 1; i < n - 1; i++) {
    const h0 = t[i] - t[i - 1], h1 = t[i + 1] - t[i];
    a[i] = h0; b[i] = 2 * (h0 + h1); c[i] = h1;
    d[i] = 6 * ((v[i + 1] - v[i]) / h1 - (v[i] - v[i - 1]) / h0);
  }
  // Thomas algorithm on interior
  for (let i = 2; i < n - 1; i++) { const w = a[i] / b[i - 1]; b[i] -= w * c[i - 1]; d[i] -= w * d[i - 1]; }
  M[n - 2] = d[n - 2] / b[n - 2];
  for (let i = n - 3; i >= 1; i--) M[i] = (d[i] - c[i] * M[i + 1]) / b[i];
  return M;
}
function splineEval(t, v, M, i, x) {
  const h = t[i + 1] - t[i], A = (t[i + 1] - x) / h, B = (x - t[i]) / h;
  return A * v[i] + B * v[i + 1] + ((A * A * A - A) * M[i] + (B * B * B - B) * M[i + 1]) * h * h / 6;
}

// Build the dense 2D profile (x,y) for a node list. Returns arrays + node arc positions.
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

// Evaluate the profile spline at continuous node parameter u (for builder drawing)
function profileAtU(prof, u) {
  const n = prof.X.length; const i = clamp(Math.floor(u), 0, n - 2); const f = clamp(u - i, 0, 1);
  const tt = prof.t[i] + (prof.t[i + 1] - prof.t[i]) * f;
  return [splineEval(prof.t, prof.X, prof.MX, i, tt), splineEval(prof.t, prof.Y, prof.MY, i, tt)];
}

function bellF(d) { // integral of raised cosine over [-0.5,0.5], normalised 0..1
  if (d <= -0.5) return 0; if (d >= 0.5) return 1;
  return d + 0.5 + Math.sin(2 * Math.PI * d) / (2 * Math.PI);
}

// ---------- full 3D track build ----------
function buildTrack(nodes, closed) {
  const prof = buildProfile(nodes);
  const Lm = Math.max(DS * 4, prof.length);
  const nm = Math.floor(Lm / DS) + 1;
  const N = nodes.length;
  // resample profile at uniform arc length
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
  // heading & roll as functions of arc length
  const nodeS = prof.nodeS;
  const wNode = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const a = i > 0 ? nodeS[i] - nodeS[i - 1] : 0, b = i < N - 1 ? nodeS[i + 1] - nodeS[i] : 0;
    wNode[i] = Math.max(6, (i > 0 && i < N - 1) ? (a + b) : 2 * (a + b));
  }
  const heading = new Float64Array(nm), roll = new Float64Array(nm);
  let seg = 0;
  for (let k = 0; k < nm; k++) {
    const s = k * DS; let H = 0;
    for (let i = 0; i < N; i++) if (nodes[i].yaw) H += nodes[i].yaw * DEG * bellF((s - nodeS[i]) / wNode[i]);
    heading[k] = H;
    while (seg < N - 2 && nodeS[seg + 1] < s) seg++;
    const sa = nodeS[seg], sb = nodeS[seg + 1];
    const f = sb > sa ? smoother(clamp((s - sa) / (sb - sa), 0, 1)) : 0;
    roll[k] = lerp(nodes[seg].roll, nodes[seg + 1].roll, f) * DEG;
  }
  // cumulative lateral shift (used by loops so the exit clears the entry)
  const latOff = new Float64Array(nm);
  if (nodes.some(nd => nd.lat)) for (let k = 0; k < nm; k++) { let o = 0; const s = k * DS; for (let i = 0; i < N; i++) if (nodes[i].lat) o += nodes[i].lat * bellF((s - nodeS[i]) / wNode[i]); latOff[k] = o; }
  // segment type per sample: incoming type of the node the segment leads to
  const typeM = new Uint8Array(nm);
  for (let k = 0; k < nm; k++) {
    const si = clamp(Math.floor(pu[k]) + 1, 1, N - 1);
    typeM[k] = TYPE_CODE[nodes[si].type] ?? T_STEEL;
  }
  // brake targets per contiguous brake run
  const brakeT = new Float32Array(nm);
  { let k = 0; while (k < nm) {
      if (typeM[k] === T_BRAKES) { let e = k; while (e < nm && typeM[e] === T_BRAKES) e++;
        let moreRide = false; for (let q = e; q < nm; q++) if (typeM[q] === T_STEEL || typeM[q] === T_CHAIN) { moreRide = true; break; }
        const tgt = moreRide ? PHYS.trimSpeed : (closed ? 2.5 : 0);
        for (let q = k; q < e; q++) brakeT[q] = tgt; k = e; } else k++; } }

  // integrate 3D positions
  const P = [], H = heading;
  let hx = 0, hz = 0;
  for (let k = 0; k < nm; k++) {
    if (k > 0) { const dxp = px[k] - px[k - 1]; const Hm = (H[k] + H[k - 1]) * 0.5; hx += dxp * Math.sin(Hm); hz += -dxp * Math.cos(Hm); }
    P.push(hx + latOff[k] * Math.cos(H[k]), py[k], hz + latOff[k] * Math.sin(H[k]));
  }
  // optional return transfer track (Hermite) back to the station
  let nr = 0; const Pr = [];
  if (closed && nm > 4) {
    const e = (nm - 1) * 3; const p0 = [P[e], P[e + 1], P[e + 2]], p1 = [P[0], P[1], P[2]];
    const t0 = norm3([P[e] - P[e - 3], P[e + 1] - P[e - 2], P[e + 2] - P[e - 1]]);
    const t1 = norm3([P[3] - P[0], P[4] - P[1], P[5] - P[2]]);
    const dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
    const Lh = Math.max(30, dist * 1.15);
    const dense = []; const steps = 600;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, t2 = t * t, t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
      const q = [0, 1, 2].map(c => h00 * p0[c] + h10 * t0[c] * Lh + h01 * p1[c] + h11 * t1[c] * Lh);
      dense.push(q);
    }
    let acc = [0]; for (let i = 1; i < dense.length; i++) acc.push(acc[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1], dense[i][2] - dense[i - 1][2]));
    const Lr = acc[acc.length - 1]; nr = Math.max(2, Math.round(Lr / DS));
    const dsr = Lr / nr; let q = 0;
    for (let k = 1; k < nr; k++) { // skip endpoints (shared with main track)
      const s = k * dsr; while (q < acc.length - 2 && acc[q + 1] < s) q++;
      const f = (s - acc[q]) / Math.max(1e-6, acc[q + 1] - acc[q]);
      const y0 = lerp(dense[q][1], dense[q + 1][1], f);
      Pr.push(lerp(dense[q][0], dense[q + 1][0], f), Math.max(2.4, y0), lerp(dense[q][2], dense[q + 1][2], f));
    }
    nr = Pr.length / 3;
  }
  const n = nm + nr;
  const px3 = new Float32Array(n), py3 = new Float32Array(n), pz3 = new Float32Array(n);
  for (let k = 0; k < nm; k++) { px3[k] = P[k * 3]; py3[k] = P[k * 3 + 1]; pz3[k] = P[k * 3 + 2]; }
  for (let k = 0; k < nr; k++) { px3[nm + k] = Pr[k * 3]; py3[nm + k] = Pr[k * 3 + 1]; pz3[nm + k] = Pr[k * 3 + 2]; }
  const type = new Uint8Array(n); type.set(typeM); for (let k = nm; k < n; k++) type[k] = T_TRANSFER;
  const brake = new Float32Array(n); brake.set(brakeT);
  const rollA = new Float32Array(n); rollA.set(roll);
  const headA = new Float32Array(n); headA.set(heading);
  const profX = new Float32Array(n), profY = new Float32Array(n), uArr = new Float32Array(n);
  for (let k = 0; k < nm; k++) { profX[k] = px[k]; profY[k] = py[k]; uArr[k] = pu[k]; }
  for (let k = nm; k < n; k++) { profX[k] = NaN; profY[k] = py3[k]; uArr[k] = N - 1; }
  const L = closed ? n * DS : (nm - 1) * DS;  // closed loop: last sample connects to 0
  const wrap = closed;
  const idx = k => wrap ? ((k % n) + n) % n : clamp(k, 0, n - 1);

  // tangents
  const tx = new Float32Array(n), ty = new Float32Array(n), tz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let a = idx(k - 1), b = idx(k + 1);
    if (!wrap && k === 0) a = 0; if (!wrap && k === n - 1) b = n - 1;
    const v = norm3([px3[b] - px3[a], py3[b] - py3[a], pz3[b] - pz3[a]]);
    tx[k] = v[0]; ty[k] = v[1]; tz[k] = v[2];
  }
  // frames
  const ux = new Float32Array(n), uy = new Float32Array(n), uz = new Float32Array(n);
  const rx = new Float32Array(n), ry = new Float32Array(n), rz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let U;
    if (k < nm) {
      // profile tangent
      const a = Math.max(0, k - 1), b = Math.min(nm - 1, k + 1);
      let ppx = px[b] - px[a], ppy = py[b] - py[a]; const l = Math.hypot(ppx, ppy) || 1; ppx /= l; ppy /= l;
      const sH = Math.sin(heading[k]), cH = Math.cos(heading[k]);
      U = [-ppy * sH, ppx, ppy * cH];
    } else U = [0, 1, 0];
    const T = [tx[k], ty[k], tz[k]];
    const dd = dot3(U, T); U = norm3([U[0] - T[0] * dd, U[1] - T[1] * dd, U[2] - T[2] * dd]);
    let R = cross3(T, U);
    const r = rollA[k], cr = Math.cos(r), sr = Math.sin(r);
    const U2 = [U[0] * cr + R[0] * sr, U[1] * cr + R[1] * sr, U[2] * cr + R[2] * sr];
    const R2 = [R[0] * cr - U[0] * sr, R[1] * cr - U[1] * sr, R[2] * cr - U[2] * sr];
    ux[k] = U2[0]; uy[k] = U2[1]; uz[k] = U2[2]; rx[k] = R2[0]; ry[k] = R2[1]; rz[k] = R2[2];
  }
  // curvature vector dT/ds, smoothed
  let kx = new Float32Array(n), ky = new Float32Array(n), kz = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    let a = idx(k - 1), b = idx(k + 1); let h = 2 * DS;
    if (!wrap && k === 0) { a = 0; h = DS; } if (!wrap && k === n - 1) { b = n - 1; h = DS; }
    kx[k] = (tx[b] - tx[a]) / h; ky[k] = (ty[b] - ty[a]) / h; kz[k] = (tz[b] - tz[a]) / h;
  }
  const smooth = (arr, rad) => { const o = new Float32Array(n); for (let k = 0; k < n; k++) { let s = 0, c = 0; for (let q = -rad; q <= rad; q++) { const ii = wrap ? idx(k + q) : k + q; if (ii < 0 || ii >= n) continue; s += arr[ii]; c++; } o[k] = s / c; } return o; };
  for (let pass = 0; pass < 2; pass++) { kx = smooth(kx, 3); ky = smooth(ky, 3); kz = smooth(kz, 3); }

  // station extent
  let stationEnd = 0; for (let k = 0; k < nm && type[k] === T_STATION; k++) stationEnd = k * DS;
  if (stationEnd < TRAIN.len + 2) stationEnd = Math.min(Lm, TRAIN.len + 2);
  const stationStop = clamp(stationEnd - 1.5, TRAIN.len, Lm);

  let maxY = -1e9, minY = 1e9, bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (let k = 0; k < n; k++) { maxY = Math.max(maxY, py3[k]); minY = Math.min(minY, py3[k]); bx0 = Math.min(bx0, px3[k]); bx1 = Math.max(bx1, px3[k]); bz0 = Math.min(bz0, pz3[k]); bz1 = Math.max(bz1, pz3[k]); }

  const trk = { n, nm, closed, L, Lm, prof, nodeS, px: px3, py: py3, pz: pz3, tx, ty, tz, ux, uy, uz, rx, ry, rz, kx, ky, kz,
    type, brake, roll: rollA, heading: headA, profX, profY, u: uArr, stationEnd, stationStop, maxY, minY,
    bounds: { x0: bx0, x1: bx1, z0: bz0, z1: bz1 } };
  trk.wrapS = s => closed ? ((s % trk.L) + trk.L) % trk.L : clamp(s, 0, trk.L);
  trk.fi = s => { s = trk.wrapS(s); const f = s / DS; let i = Math.floor(f); let fr = f - i; if (!closed && i >= n - 1) { i = n - 2; fr = 1; } return [i, idx(i + 1), fr]; };
  trk.get = (arr, s) => { const [i, j2, f] = trk.fi(s); return arr[i] + (arr[j2] - arr[i]) * f; };
  trk.typeAt = s => trk.type[trk.fi(s)[0]];
  return trk;
}
function norm3(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }

// ---------- G forces ----------
function gForces(trk, s, v, aT) {
  const g = trk.get;
  const kx = g(trk.kx, s), ky = g(trk.ky, s), kz = g(trk.kz, s);
  const v2 = v * v;
  const fx = v2 * kx + aT * g(trk.tx, s), fy = v2 * ky + aT * g(trk.ty, s) + G, fz = v2 * kz + aT * g(trk.tz, s);
  const vg = (fx * g(trk.ux, s) + fy * g(trk.uy, s) + fz * g(trk.uz, s)) / G;
  const lg = (fx * g(trk.rx, s) + fy * g(trk.ry, s) + fz * g(trk.rz, s)) / G;
  return [vg, lg];
}

// ---------- physics ----------
function newTrainState(trk) {
  return { s: trk.stationStop, v: 0, aT: 0, phase: 'load', timer: 1.2, lap: 0, dispatch: false, chainReleased: false,
    stillT: 0, endHold: 0, event: null, time: 0 };
}
function physStep(st, trk, dt) {
  const v0 = st.v; st.event = null; st.time += dt;
  const closed = trk.closed;
  if (st.phase === 'load') {
    st.v = 0; st.s = trk.stationStop; st.timer -= dt; st.aT = 0;
    if (st.timer <= 0) { st.phase = 'run'; st.dispatch = true; st.chainReleased = false; st.stillT = 0; st.event = 'dispatch'; }
    return;
  }
  const sFront = st.s, sMid = st.s - TRAIN.len * 0.5, sRear = st.s - TRAIN.len;
  const tF = trk.typeAt(sFront), tM = trk.typeAt(sMid), tR = trk.typeAt(sRear);
  // gravity averaged over cars
  let gy = 0; for (let c = 0; c < TRAIN.cars; c++) gy += trk.get(trk.ty, st.s - (c + 0.5) * TRAIN.carLen);
  gy /= TRAIN.cars;
  let a = -G * gy;
  const sp = Math.abs(st.v);
  if (sp > 0.02) a -= Math.sign(st.v) * (PHYS.mu * G + PHYS.drag * st.v * st.v);
  else if (Math.abs(a) < PHYS.mu * G * 1.5) { a = 0; st.v = 0; }
  st.v += a * dt;

  if (st.phase === 'arrive') {
    const dir = st.arriveDir;
    const dist = (st.s - trk.stationStop) * -dir; // remaining distance to stop
    const target = Math.sqrt(2 * PHYS.stationDecel * Math.max(0, dist));
    let sv = st.v * dir; // forward-positive along arrival direction
    const tg = Math.max(target, 0.25);
    if (sv > tg) sv = Math.max(tg, sv - 5.5 * dt);
    if (sv < Math.min(1.4, target)) sv = Math.min(1.4, target); // booster tyres
    st.v = sv * dir;
    if (dist <= 0.03 || (dist < 0 && Math.abs(st.v) < 1)) { st.s = trk.stationStop; st.v = 0; st.phase = 'load'; st.timer = PHYS.loadTime; st.event = 'arrived'; st.aT = 0; return; }
  } else {
    // dispatch tyres
    if (st.dispatch) {
      if (st.v < PHYS.stationSpeed) st.v = Math.min(PHYS.stationSpeed, Math.max(0, v0) + 2.0 * dt);
      if (tF === T_CHAIN || st.s > trk.stationEnd + TRAIN.len + 24 || st.v > PHYS.stationSpeed + 1.5) st.dispatch = false;
    }
    // chain lift
    const onChain = tF === T_CHAIN || tM === T_CHAIN || tR === T_CHAIN;
    if (onChain && !st.chainReleased && v0 >= -0.35 && st.v < PHYS.chainSpeed) st.v = Math.min(PHYS.chainSpeed, Math.max(v0, 0) + 3.0 * dt);
    // brakes
    if (tF === T_BRAKES || tM === T_BRAKES) {
      const tgt = trk.get(trk.brake, sMid) || trk.brake[trk.fi(sFront)[0]];
      if (Math.abs(st.v) > tgt) st.v -= Math.sign(st.v) * Math.min(PHYS.brakeDecel * dt, Math.abs(st.v) - tgt);
      if (tgt === 0 && Math.abs(st.v) < 0.25) st.v = 0;
    }
    // transfer tyres
    if (tF === T_TRANSFER || tM === T_TRANSFER) { if (st.v < PHYS.transferSpeed) st.v = Math.min(PHYS.transferSpeed, Math.max(v0, st.v) + 2.5 * dt); else st.v -= Math.min(2.5 * dt, st.v - PHYS.transferSpeed); }
  }

  st.s += st.v * dt;
  // boundaries
  if (closed) {
    if (st.s >= trk.L) { st.s -= trk.L; st.lap++; st.event = 'lap'; st.chainReleased = false; }
    if (st.s < 0) st.s += trk.L;
    if (st.phase === 'run' && !st.dispatch && st.s < trk.stationEnd && st.s > 1 && st.v > 0) { st.phase = 'arrive'; st.arriveDir = 1; }
  } else {
    if (st.s >= trk.Lm) { st.s = trk.Lm; if (st.v > 0) st.v = 0; st.endHold += dt; if (st.endHold > 1.2) st.chainReleased = true; }
    else st.endHold = 0;
    if (st.s < TRAIN.len) { st.s = TRAIN.len; if (st.v < 0) st.v = 0; }
    if (st.phase === 'run' && !st.dispatch && st.v < 0 && st.s < trk.stationEnd + 0.5) { st.phase = 'arrive'; st.arriveDir = -1; }
    if (st.phase === 'arrive' && st.arriveDir === -1 && st.s < trk.stationStop) { st.s = trk.stationStop; }
  }
  // stall / ride complete
  if (st.phase === 'run' && Math.abs(st.v) < 0.05) {
    st.stillT += dt;
    const onBr = trk.typeAt(st.s) === T_BRAKES;
    if (st.stillT > (onBr ? 1.6 : 3.0)) {
      st.event = onBr ? 'complete' : 'stall'; st.stallS = st.s;
      st.phase = 'load'; st.timer = PHYS.loadTime; st.s = trk.stationStop; st.v = 0; st.lap++;
    }
  } else st.stillT = 0;
  const aT = (st.v - v0) / dt;
  st.aT += (aT - st.aT) * Math.min(1, dt * 12);
}

// ---------- dry-run analysis (predicts speeds & G along the track) ----------
function analyzeTrack(trk) {
  const st = newTrainState(trk); st.timer = 0;
  const n = trk.n; const spd = new Float32Array(n).fill(NaN), vgA = new Float32Array(n).fill(NaN), lgA = new Float32Array(n).fill(NaN);
  let maxV = 0, maxVG = -9, minVG = 9, maxLG = 0, t = 0, stallS = null, completes = false, maxVGs = 0, minVGs = 0, maxLGs = 0, airtime = 0, lapsDone = 0;
  const dt = 1 / 90; let vgS = 1, lgS = 0; let started = false;
  for (let step = 0; step < 90 * 420; step++) {
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
      maxV = Math.max(maxV, Math.abs(st.v));
      if (vgS > maxVG) { maxVG = vgS; maxVGs = st.s; } if (vgS < minVG) { minVG = vgS; minVGs = st.s; }
      if (Math.abs(lgS) > maxLG) { maxLG = Math.abs(lgS); maxLGs = st.s; }
      if (vgS < 0.2) airtime += dt;
    }
  }
  return { spd, vg: vgA, lg: lgA, maxV, maxVG, minVG, maxLG, maxVGs, minVGs, maxLGs, duration: t, stallS, completes, airtime };
}

function safetyLevel(vg, lg) {
  if (vg > 5.5) return { code: 'blackout', label: 'BLACKOUT RISK', sev: 3 };
  if (vg < -1.5) return { code: 'redout', label: 'REDOUT RISK', sev: 3 };
  if (vg > 4.2) return { code: 'highg', label: 'HIGH G WARNING', sev: 2 };
  if (Math.abs(lg) > 1.8) return { code: 'lateral', label: 'LATERAL G WARNING', sev: 2 };
  return { code: 'safe', label: 'SAFE', sev: 0 };
}

// ---------- elements (spliced after a node) ----------
function makeElement(kind, base, speedHint) {
  const x0 = base.x, y0 = base.y; const out = [];
  const N = (x, y, yaw = 0, roll = 0, type = 'steel') => out.push({ x: +x.toFixed(2), y: +Math.max(0, y).toFixed(2), yaw, roll, type });
  switch (kind) {
    case 'loop': {
      const pts = loopShape(speedHint || 22);
      const yb = Math.max(y0, 3); const cx = x0 + 12;
      N(cx, yb);
      pts.forEach((q, i) => { N(cx + q[0], yb + q[1]); out[out.length - 1].lat = +(3.6 / pts.length).toFixed(3); });
      const ex = cx + pts[pts.length - 1][0];
      N(ex + 10, yb); N(ex + 24, yb);
      break; }
    case 'camelback': {
      const h = clamp((speedHint || 20) ** 2 / (2 * G) * 0.55, 8, 40), W = Math.max(50, h * 2.6);
      [0.18, 0.38, 0.5, 0.62, 0.82, 1].forEach(t => { const yy = y0 + h * (1 - (2 * t - 1) ** 2); N(x0 + W * t, t === 1 ? y0 : yy); });
      break; }
    case 'bankleft': case 'bankright': {
      const s = kind === 'bankleft' ? -1 : 1;
      N(x0 + 18, y0, s * 30, s * 32); N(x0 + 36, y0, s * 30, s * 48); N(x0 + 54, y0, s * 30, s * 32); N(x0 + 72, y0, 0, 0);
      break; }
    case 'drop': {
      const d = clamp(y0 - 4, 0, 70);
      if (d < 6) { N(x0 + 20, y0); break; }
      N(x0 + 6, y0 - d * 0.04); N(x0 + d * 0.22 + 8, y0 - d * 0.32); N(x0 + d * 0.36 + 12, y0 - d * 0.72); N(x0 + d * 0.62 + 18, y0 - d * 0.97); N(x0 + d * 0.95 + 30, y0 - d);
      break; }
    case 'helix': {
      for (let i = 1; i <= 6; i++) N(x0 + 17 * i, y0 - 1.8 * i, 60, 52);
      N(x0 + 17 * 6 + 18, y0 - 12, 0, 0);
      break; }
    case 'scurve': {
      N(x0 + 18, y0, -40, -38); N(x0 + 36, y0, -20, -20); N(x0 + 54, y0, 40, 38); N(x0 + 72, y0, 20, 20); N(x0 + 90, y0, 0, 0);
      break; }
  }
  return out;
}
// clothoid-style teardrop loop: curvature rises from bottom to top
function loopShape(v) {
  const vb = clamp(v, 14, 42); const Rb = vb * vb / (2.5 * G), Rt = Rb * 0.31;
  const steps = 1440, kb = 1 / Rb, kt = 1 / Rt, raw = []; let x = 0, y = 0;
  for (let i = 0; i <= steps; i++) {
    const th = 2 * Math.PI * i / steps; raw.push([x, y, th]);
    const dth = 2 * Math.PI / steps, k = kb + (kt - kb) * Math.pow(Math.sin((th + dth / 2) / 2), 2), ds = dth / k;
    x += Math.cos(th + dth / 2) * ds; y += Math.sin(th + dth / 2) * ds;
  }
  const drift = Math.max(8, Rt * 1.2), pts = [];
  for (let i = 1; i <= 12; i++) { const r = raw[Math.round(i * steps / 12)]; const f = clamp((r[2] - 1.25 * Math.PI) / (0.75 * Math.PI), 0, 1); pts.push([+(r[0] + drift * f * f * (3 - 2 * f)).toFixed(2), +r[1].toFixed(2)]); }
  return pts;
}
function spliceElement(nodes, k, kind, speedHint) {
  const base = nodes[k]; const el = makeElement(kind, base, speedHint);
  if (!el.length) return { nodes, added: 0 };
  const span = Math.max(...el.map(e => e.x)) - base.x;
  const after = nodes.slice(k + 1).map(nd => ({ ...nd, x: +(nd.x + span).toFixed(2) }));
  // drop height for downstream nodes after a drop: shift following nodes by elevation change only if element ends lower and next node was level with base
  return { nodes: [...nodes.slice(0, k + 1), ...el, ...after], added: el.length, span };
}

// ---------- presets ----------
function P(x, y, yaw = 0, roll = 0, type = 'steel') { return { x, y, yaw, roll, type }; }
const A = 'auto';
// Splice an element into a preset at the end of the current node list
function energySpeed(nodes, k) { let m = 0; for (let i = 0; i <= k; i++) m = Math.max(m, nodes[i].y); return 0.97 * Math.sqrt(2 * G * Math.max(1, m - nodes[k].y)); }
function withEl(nodes, kind) { const k = nodes.length - 1; const r = spliceElement(nodes, k, kind, energySpeed(nodes, k)); return r.nodes; }
function shiftFrom(list, dx) { return list.map(n => ({ ...n, x: +(n.x + dx).toFixed(2) })); }
function chain(base, more) { const last = base[base.length - 1]; return base.concat(shiftFrom(more, last.x)); }
const PRESET_DEFS = {
  hyper: () => ({ name: 'Hyper-Goliath Mega Coaster', closed: true, nodes: [
    P(0, 4, 0, 0, 'station'), P(28, 4, 0, 0, 'station'), P(40, 4.6), P(56, 12, 0, 0, 'chain'), P(112, 66, 0, 0, 'chain'), P(124, 70.5, 0, 0, 'chain'),
    P(136, 68.8), P(150, 54), P(164, 31), P(181, 12), P(201, 5), P(222, 6.6), P(238, 13.5), P(250, 24), P(260, 33), P(270, 39.5), P(280, 43.6), P(290, 45.2), P(300, 43.6), P(310, 39.5), P(320, 33), P(331, 23), P(343, 12.5), P(358, 6), P(376, 5),
    P(390, 7), P(412, 17, 45, A), P(440, 27, 45, A), P(470, 27, 45, A), P(500, 17, 45, A), P(526, 8), P(550, 5),
    P(572, 12), P(594, 24.5), P(614, 28), P(634, 24.5), P(656, 12), P(678, 5.5),
    P(704, 6, -38, A), P(732, 7, 38, A), P(758, 8), P(778, 13.5), P(796, 15), P(814, 13.5), P(834, 6),
    P(856, 5, 0, 0, 'brakes'), P(890, 4.5, 0, 0, 'brakes'), P(914, 4.5, 0, 0, 'brakes') ] }),
  corkscrew: () => { let n = [P(0, 4, 0, 0, 'station'), P(26, 4, 0, 0, 'station'), P(36, 4.6), P(50, 10, 0, 0, 'chain'), P(88, 38, 0, 0, 'chain'), P(98, 40, 0, 0, 'chain'),
      P(108, 38.5), P(120, 26), P(134, 10), P(152, 4)];
    n = withEl(n, 'loop');
    n = chain(n, [P(22, 6, 45, A), P(46, 9, 45, A), P(70, 9, 45, A), P(94, 6, 45, A), P(114, 5)]);
    n = withEl(n, 'loop');
    n = chain(n, [P(20, 11), P(36, 13.5), P(52, 11), P(70, 5),
      P(90, 5, -60, A), P(108, 4.6, -60, A), P(126, 4.4, -60, A), P(144, 4.4, -60, A), P(164, 4.5),
      P(184, 4.5, 0, 0, 'brakes'), P(210, 4.5, 0, 0, 'brakes')]);
    return { name: 'Looping Corkscrew', closed: true, nodes: n }; },
  boomerang: () => { let n = [P(0, 4, 0, 0, 'station'), P(26, 4, 0, 0, 'station'), P(40, 4.2, 0, 0, 'brakes'), P(52, 9, 0, 0, 'chain'), P(76, 34, 0, 0, 'chain'), P(84, 37, 0, 0, 'chain'),
      P(92, 35.5), P(104, 22), P(116, 7.5), P(132, 4)];
    n = spliceElement(n, n.length - 1, 'loop', 27).nodes;
    n = chain(n, [P(16, 6.5, 0, 0, 'chain'), P(30, 17, 0, 0, 'chain'), P(39, 33, 0, 0, 'chain'), P(42.5, 45, 0, 0, 'chain'), P(43.6, 53, 0, 0, 'chain')]);
    return { name: 'Boomerang Shuttle', closed: false, nodes: n }; },
  mine: () => ({ name: 'Family Mine Train', closed: true, nodes: [
    P(0, 4, 0, 0, 'station'), P(24, 4, 0, 0, 'station'), P(34, 4.5), P(46, 8, 0, 0, 'chain'), P(70, 17, 0, 0, 'chain'), P(80, 18, 0, 0, 'chain'),
    P(96, 16.5, 35, A), P(114, 13, 35, A), P(132, 9, 30, A), P(150, 6.5), P(168, 8.5), P(184, 9), P(200, 6.5),
    P(218, 6, -35, A), P(236, 5.6, -35, A), P(256, 5.2), P(272, 7.2), P(288, 7.6), P(304, 5.4),
    P(322, 5, 45, A), P(342, 4.8, 45, A), P(362, 4.7, 45, A), P(382, 4.6, 45, A), P(402, 4.6),
    P(420, 4.5, 0, 0, 'brakes'), P(442, 4.5, 0, 0, 'brakes') ] }),
  blank: () => ({ name: 'Blank Slate (3 Nodes)', closed: false, nodes: [P(0, 4, 0, 0, 'station'), P(30, 4, 0, 0, 'station'), P(60, 4)] })
};
// resolve 'auto' banking by iterating analysis -> bank
function resolvePreset(key) {
  const def = PRESET_DEFS[key](); const autos = def.nodes.map(n => n.roll === A);
  let nodes = def.nodes.map(n => ({ ...n, roll: n.roll === A ? 0 : n.roll }));
  for (let it = 0; it < 4 && autos.some(Boolean); it++) {
    const trk = buildTrack(nodes, def.closed), an = analyzeTrack(trk);
    nodes = nodes.map((n, i) => autos[i] ? { ...n, roll: autoBankFor(nodes, i, trk, an) } : n);
  }
  return { name: def.name, closed: def.closed, nodes };
}
const PRESET_ORDER = ['hyper', 'corkscrew', 'boomerang', 'mine', 'blank'];
const PRESETS = {}; // filled lazily
function getPreset(key) { return PRESETS[key] || (PRESETS[key] = resolvePreset(key)); }
function autoBankFor(nodes, i, trk, an) {
  const nd = nodes[i]; if (!nd.yaw) return 0;
  let v = NaN;
  if (trk && an && trk.nodeS) { const k = Math.min(trk.nm - 1, Math.round(trk.nodeS[i] / DS)); v = an.spd[k]; }
  if (!isFinite(v)) { let ymax = 0; for (const q of nodes) ymax = Math.max(ymax, q.y); v = Math.sqrt(Math.max(4, 2 * G * (ymax - nd.y))) * 0.88; }
  // peak turn rate of the bell = 2*yaw/w
  const a = i > 0 && trk ? trk.nodeS[i] - trk.nodeS[i - 1] : 20, b = i < nodes.length - 1 && trk ? trk.nodeS[i + 1] - trk.nodeS[i] : 20;
  const w = Math.max(6, a + b);
  const kap = Math.abs(nd.yaw * DEG) * 2 / w;
  const bank = Math.atan(v * v * kap / G) / DEG;
  return Math.round(clamp(bank, 0, 80) * Math.sign(nd.yaw));
}
// ===================== END CORE =====================
