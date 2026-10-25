// ===================== ELEMENTS: track element generators and presets =====================
// Generators draw in the unrolled side profile with a "turtle" (x = distance along the track, y = height,
// theta = pitch). Points become nodes. Direction-reversing inversions use flip nodes at vertical points,
// so the profile stays left-to-right while the real track turns back on itself.
function Turtle() {
  const t = { x: 0, y: 0, th: 0, s: 0, pts: [], st: { roll: 0, off: 0, type: 'steel' } };
  t.emit = (extra = {}) => {
    for (const k of ['roll', 'off', 'type']) if (extra[k] !== undefined) t.st[k] = extra[k];
    t.pts.push({ x: t.x, y: t.y, roll: t.st.roll, off: t.st.off, type: t.st.type, ...extra });
  };
  t.arc = (dDeg, r, n, fn) => {
    const d = dDeg * DEG;
    for (let i = 1; i <= n; i++) {
      const th0 = t.th, th1 = th0 + d / n;
      if (d > 0) { const cx = t.x - r * Math.sin(th0), cy = t.y + r * Math.cos(th0); t.x = cx + r * Math.sin(th1); t.y = cy - r * Math.cos(th1); }
      else { const cx = t.x + r * Math.sin(th0), cy = t.y - r * Math.cos(th0); t.x = cx - r * Math.sin(th1); t.y = cy + r * Math.cos(th1); }
      t.th = th1; t.s += r * Math.abs(d) / n; t.emit(fn ? fn(i / n, i) : {});
    }
    return t;
  };
  t.line = (len, n, fn) => { for (let i = 1; i <= n; i++) { t.x += Math.cos(t.th) * len / n; t.y += Math.sin(t.th) * len / n; t.s += len / n; t.emit(fn ? fn(i / n, i) : {}); } return t; };
  t.to = (x, y, extra) => { t.s += Math.hypot(x - t.x, y - t.y); t.x = x; t.y = y; t.emit(extra || {}); return t; };
  t.last = () => t.pts[t.pts.length - 1];
  return t;
}
const rnd2 = v => Math.round(v * 100) / 100;
const lerpArr = (a, b, u) => a + (b - a) * u;

// ---------- generators: (t = turtle, c = {v, y0, d, vAt}) ----------
function genHill(t, c, hfrac, targetVG, hmax, nodesPer = 8) {
  const v = c.vAt(t.y), h = clamp(hfrac * v * v / (2 * G), 1.2, hmax || 70), vt = c.vAt(t.y + h);
  const kap = Math.max(0.004, (1 - targetVG) * G / (vt * vt));
  const W = Math.max(Math.PI * Math.sqrt(2 * h / kap), 4 * h, 10);
  const x0 = t.x, y0 = t.y; const us = nodesPer >= 8 ? [0.12, 0.25, 0.37, 0.5, 0.63, 0.75, 0.88, 1] : [0.25, 0.5, 0.75, 1];
  for (const u of us) t.to(x0 + W * u, y0 + h * (1 - Math.cos(2 * Math.PI * u)) / 2);
  t.th = 0; return { h, W };
}
function genTurn(t, c, deg, bankDeg, K, opts = {}) {
  const v = c.vAt(t.y), d = c.d;
  const R = opts.R || clamp(v * v / (G * Math.tan(bankDeg * DEG)), opts.Rmin || 10, opts.Rmax || 140);
  const sp = R * Math.abs(deg) * DEG / K;
  const bank = opts.flat ? 0 : clamp(Math.atan(v * v / (G * R)) / DEG, 0, opts.bankMax || 85);
  const dy = opts.dy || 0;
  for (let i = 1; i <= K; i++) {
    const edge = i === 1 || i === K ? (opts.flat ? 1 : 0.8) : 1;
    t.x += sp; t.y += dy / K; t.emit({ yaw: rnd2(d * deg / K), roll: Math.round(d * bank * edge) });
  }
  t.x += Math.max(8, sp); t.emit({ roll: 0 });
  return { R, bank };
}
function genRoll(t, c, len, fromDeg, toDeg, steps, yFn) {
  const x0 = t.x, y0 = t.y;
  for (let i = 1; i <= steps; i++) { const u = i / steps; t.to(x0 + len * u, y0 + (yFn ? yFn(u) : 0), { roll: normDeg(lerpArr(fromDeg, toDeg, u)) }); }
}
// Half loops are integrated so riders feel a chosen G at every point: about 4 G at the bottom easing to
// 1.3 G at the top. Curvature at loop angle phi is k = (G(phi) - cos phi) * g / v^2.
const LOOP_GB = 4.0, LOOP_GT = 1.3;
function loopSpeed(c, y) { return Math.max(3, 0.5 * (c.vAt(y) + c.vFront(y))); }
function loopArc(t, c, dDeg, phiOf, gOf, n, dry) {
  const sub = 80, tot = dDeg * DEG, dth = tot / (sub * n);
  const st = dry ? { x: t.x, y: t.y, th: t.th } : t;
  for (let i = 1; i <= n; i++) {
    for (let j = 0; j < sub; j++) {
      const thm = st.th + dth / 2, phi = phiOf(thm), v = loopSpeed(c, st.y);
      const k = clamp((gOf(phi) - Math.cos(phi)) * G / (v * v), 1 / 400, 1 / 4.5), ds = Math.abs(dth) / k;
      st.x += Math.cos(thm) * ds; st.y += Math.sin(thm) * ds; st.th += dth; if (!dry) t.s += ds;
    }
    if (!dry) t.emit({});
  }
  return st;
}
const gUp = phi => lerp(LOOP_GB, LOOP_GT, clamp(phi / Math.PI, 0, 1));
const gDown = phi => lerp(LOOP_GT, LOOP_GB, clamp((phi - Math.PI) / Math.PI, 0, 1));
function halfLoopUp(t, c) {           // horizontal -> vertical -> over the top (inverted, travelling back)
  const R0 = t.st.roll;
  loopArc(t, c, 90, th => th, gUp, 4);
  t.last().flip = true; t.last().roll = normDeg(R0 + 180); t.st.roll = t.last().roll;
  loopArc(t, c, -90, th => Math.PI - th, gUp, 3);
}
function halfLoopHeightAt(c, y) { const t = { x: 0, y, th: 0 }; let st = loopArc(t, c, 90, th => th, gUp, 4, true); st = loopArc(st, c, -90, th => Math.PI - th, gUp, 3, true); return st.y - y; }
function halfLoopDown(t, c, yBottom) { // inverted at top -> vertical down -> pull out upright (travelling back)
  const R0 = t.st.roll;
  loopArc(t, c, -90, th => Math.PI - th, gDown, 3);
  t.last().flip = true; t.last().roll = normDeg(R0 + 180); t.st.roll = t.last().roll;
  loopArc(t, c, 90, th => 2 * Math.PI + th, gDown, 4);
  void yBottom;
}
function halfCork(t, c, len, dz, yawDeg, fromRoll, toRoll, steps = 3) {
  const x0 = t.x, y0 = t.y;
  for (let i = 1; i <= steps; i++) { const u = i / steps; t.to(x0 + len * u, y0 + dz * (1 - Math.cos(Math.PI * u)) / 2, { yaw: i < steps ? rnd2(yawDeg / (steps - 1)) : 0, roll: normDeg(lerpArr(fromRoll, toRoll, u)), align: i < steps }); }
  t.th = 0;
}

const ELEMENTS = [
  // ---- hills & drops
  { key: 'camelback', cat: 'hills', label: 'Airtime hill', tip: 'Parabolic hill shaped for near-weightless floater airtime', gen: (t, c) => genHill(t, c, 0.45, 0.1) },
  { key: 'speedhill', cat: 'hills', label: 'Speed hill', tip: 'Small hill taken fast for strong ejector airtime', gen: (t, c) => genHill(t, c, 0.2, -0.45) },
  { key: 'camels', cat: 'hills', label: 'Camelback series', tip: 'Three hills, each smaller than the last', gen: (t, c) => { genHill(t, c, 0.42, 0.15); t.x += 6; t.emit(); genHill(t, c, 0.3, 0.15); t.x += 6; t.emit(); genHill(t, c, 0.2, 0.15); } },
  { key: 'bunny', cat: 'hills', label: 'Bunny hops', tip: 'Series of small quick hills', gen: (t, c) => { for (let i = 0; i < 4; i++) genHill(t, c, 0.06, -0.25, 6, 4); } },
  { key: 'predrop', cat: 'hills', label: 'Pre-drop', tip: 'Small dip after the lift that takes tension off the chain', gen: (t, c) => { const f = Math.max(1, c.vAt(t.y) / 10); for (const [x, y] of [[8, -0.3], [16, -2.4], [24, -3.5], [32, -3.7], [42, -3.5]]) t.to(x * f, y); } },
  { key: 'drop', cat: 'hills', label: 'Steep drop', tip: 'Steep plunge down to near ground level', down: true, gen: (t, c) => { const d = clamp(c.y0 - 4, 0, 140); if (d < 6) { t.to(20, 0); return; } t.to(6, -d * 0.04); t.to(d * 0.22 + 8, -d * 0.32); t.to(d * 0.36 + 12, -d * 0.72); t.to(d * 0.62 + 18, -d * 0.97); t.to(d * 0.95 + 30, -d); } },
  { key: 'vdrop', cat: 'hills', label: 'Vertical drop', tip: '90° drop with a tight crest', down: true, gen: (t, c) => genVDrop(t, c, 90) },
  { key: 'holddrop', cat: 'hills', label: 'Holding-brake drop', tip: 'Dive-coaster style: the train is held over the edge, then released into a vertical drop', down: true, gen: (t, c) => { t.to(5, 0, { type: 'block', hold: 3.5 }); t.to(11, 0, { type: 'block', hold: 3.5 }); t.st.type = 'steel'; genVDrop(t, c, 90, true); } },
  { key: 'bvdrop', cat: 'hills', label: 'Beyond-vertical drop', tip: 'Drop steeper than 90°, tucking back under itself', down: true, gen: (t, c) => genVDrop(t, c, 112) },
  { key: 'doubledown', cat: 'hills', label: 'Double down', tip: 'A drop, a short level section, then a second drop', down: true, gen: (t, c) => { const D = clamp(c.y0 - 4, 6, 120); for (const [x, f] of [[10, 0.06], [20, 0.25], [30, 0.43], [40, 0.48], [50, 0.5], [60, 0.62], [72, 0.86], [86, 0.98], [100, 1]]) t.to(x * Math.max(1, D / 40), -D * f); } },
  { key: 'doubleup', cat: 'hills', label: 'Double up', tip: 'A climb, a level ledge, then a second climb', rise: true, gen: (t, c) => { const H = clamp(0.33 * c.v * c.v / (2 * G), 6, 60); const sx = Math.max(1, H / 25, c.v / 15); for (const [x, f] of [[12, 0.06], [24, 0.3], [34, 0.47], [44, 0.5], [54, 0.53], [64, 0.75], [74, 0.95], [86, 1]]) t.to(x * sx, H * f); } },
  { key: 'tophat', cat: 'hills', label: 'Top hat', tip: 'Vertical climb, tight crest, vertical drop (needs a launch)', gen: (t, c) => genTopHat(t, c, false) },
  { key: 'spike', cat: 'hills', label: 'Vertical spike', tip: 'Straight up and stop: the train rolls back (shuttles)', gen: (t, c) => { const H = clamp(0.85 * c.v * c.v / (2 * G), 15, 140); const r = clamp(c.v * c.v / (3.4 * G), 7, 30); t.line(6, 1); t.arc(90, r, 4); t.line(H - r, Math.max(2, Math.round((H - r) / 10))); } },
  // ---- turns
  { key: 'bank', cat: 'turns', dir: true, label: 'Banked turn 90°', tip: '90° turn banked for the predicted speed', gen: (t, c) => genTurn(t, c, 90, 50, 4) },
  { key: 'turnaround', cat: 'turns', dir: true, label: 'Turnaround 180°', tip: 'Banked 180° turn for out-and-back layouts', gen: (t, c) => genTurn(t, c, 180, 58, 6) },
  { key: 'helix', cat: 'turns', dir: true, label: 'Helix 540°', tip: 'Banked spiral of one and a half turns; it descends when there is height to spare and climbs when there is not', gen: (t, c) => genTurn(t, c, 540, 60, 18, { dy: c.y0 - 6 >= 12 ? -Math.min(18, c.y0 - 6) : 12, Rmin: 14, Rmax: 70 }) },
  { key: 'scurve', cat: 'turns', label: 'S-curve', tip: 'Left then right banked bends', gen: (t, c) => { const d0 = c.d; c.d = -1; genTurn(t, c, 60, 45, 3); c.d = 1; genTurn(t, c, 60, 45, 3); c.d = d0; } },
  { key: 'overbank', cat: 'turns', dir: true, label: 'Overbanked turn', tip: 'Turn banked past vertical (≈115°)', gen: (t, c) => { const v = c.vAt(t.y), h = clamp(0.18 * v * v / (2 * G), 3, 25), sp = clamp(v * 0.75, 10, 28); const rolls = [45, 95, 118, 118, 95, 45], ys = [0.3, 0.75, 1, 1, 0.75, 0.3]; for (let i = 0; i < 6; i++) { t.x += sp; t.y = c.yBase + h * ys[i]; t.emit({ yaw: c.d * 25, roll: c.d * rolls[i] }); } t.x += sp; t.y = c.yBase; t.emit({ roll: 0 }); } },
  { key: 'hammerhead', cat: 'turns', dir: true, label: 'Hammerhead', tip: 'Steep climb, overbanked 180° turn at the top, dive back down', gen: (t, c) => { const v = c.vAt(t.y), h = clamp(0.42 * v * v / (2 * G), 8, 50), sp = clamp(v * 0.7, 12, 26); const yaw = [-15, 45, 55, 55, 40], roll = [-20, 70, 112, 105, 55], ys = [0.25, 0.75, 1, 0.8, 0.35]; for (let i = 0; i < 5; i++) { t.x += sp * (i === 0 ? 1.3 : 1); t.y = c.yBase + h * ys[i]; t.emit({ yaw: c.d * yaw[i], roll: c.d * roll[i] }); } t.x += sp * 1.4; t.y = c.yBase; t.emit({ roll: 0 }); } },
  { key: 'waveturn', cat: 'turns', dir: true, label: 'Wave turn', tip: 'Turn banked toward the outside over a small hill: sideways airtime', gen: (t, c) => { const v = c.vAt(t.y), h = clamp(0.08 * v * v / (2 * G), 2, 8), sp = clamp(v * v / (0.9 * G) * (Math.PI / 2) / 4, 10, 60); const rolls = [-35, -82, -82, -35], ys = [0.4, 1, 1, 0.4]; for (let i = 0; i < 4; i++) { t.x += sp; t.y = c.yBase + h * ys[i]; t.emit({ yaw: c.d * 22.5, roll: c.d * rolls[i] }); } t.x += sp; t.y = c.yBase; t.emit({ roll: 0 }); } },
  { key: 'stengel', cat: 'turns', dir: true, label: 'Stengel dive', tip: 'Crest that banks past 90° and dives into a turn', down: true, gen: (t, c) => { const v = c.vAt(t.y), h = clamp(0.25 * v * v / (2 * G), 4, 30), sp = clamp(v * 0.8, 10, 26); const drop = Math.min(c.y0 - 5, h * 1.6); const pts = [[0.6, 60, 15], [1, 112, 35], [0.55, 95, 30], [-0.4, 40, 10]]; for (const [f, r, y] of pts) { t.x += sp; t.y = c.yBase + (f >= 0 ? h * f : drop * f); t.emit({ yaw: c.d * y, roll: c.d * r }); } t.x += sp * 1.5; t.y = c.yBase - drop; t.emit({ roll: 0 }); } },
  { key: 'hairpin', cat: 'turns', dir: true, label: 'Hairpin (wild mouse)', tip: 'Tight unbanked 180° switchback', gen: (t, c) => { const v = c.vAt(t.y); genTurn(t, c, 180, 0, 4, { R: Math.max(5, v * v / (1.3 * G)), flat: true }); } },
  // ---- inversions
  { key: 'loop', cat: 'inversions', label: 'Vertical loop', tip: 'Clothoid teardrop loop sized for the entry speed', gen: (t, c) => genClassicLoop(t, c) },
  { key: 'corkscrew', cat: 'inversions', dir: true, label: 'Corkscrew', tip: 'Helical 360° roll around a forward axis', gen: (t, c) => genCorkscrew(t, c, 1) },
  { key: 'barrelroll', cat: 'inversions', dir: true, label: 'Barrel roll', tip: 'Large, slow B&M-style corkscrew', gen: (t, c) => genCorkscrew(t, c, 1.6) },
  { key: 'heartline', cat: 'inversions', dir: true, label: 'Heartline roll', tip: '360° roll around the riders’ chest on a straight path', gen: (t, c) => { const v = c.vAt(t.y), L = clamp(1.25 * v, 16, 42); t.to(t.x + 6, t.y); genRoll(t, c, L, 0, 360 * c.d, 4); t.to(t.x + 8, t.y); } },
  { key: 'inline', cat: 'inversions', dir: true, label: 'Inline twist', tip: 'Quick 360° twist at constant height', gen: (t, c) => { const v = c.vAt(t.y), L = clamp(0.8 * v, 10, 26); t.to(t.x + 5, t.y); genRoll(t, c, L, 0, 360 * c.d, 4); t.to(t.x + 6, t.y); } },
  { key: 'zerog', cat: 'inversions', dir: true, label: 'Zero-G roll', tip: 'Roll over the crest of a hill shaped for weightlessness', gen: (t, c) => genZeroG(t, c, false) },
  { key: 'zerogstall', cat: 'inversions', dir: true, label: 'Zero-G stall', tip: 'Half roll up, hang inverted across the crest, half roll down', gen: (t, c) => genZeroG(t, c, true) },
  { key: 'immelmann', cat: 'inversions', dir: true, label: 'Immelmann', tip: 'Half loop up, then half roll out: exits the opposite way, higher', gen: (t, c) => { t.line(5, 1); halfLoopUp(t, c); const vt = c.vFront(t.y); genRoll(t, c, clamp(0.9 * vt, 10, 24), 180, 180 + 180 * c.d, 3); t.last().lat = 7 * c.d; } },
  { key: 'diveloop', cat: 'inversions', dir: true, label: 'Dive loop', tip: 'Climb with a half roll, then dive through a half loop: exits the opposite way', gen: (t, c) => genDiveLoop(t, c) },
  { key: 'cobra', cat: 'inversions', dir: true, label: 'Cobra roll', tip: 'Two half loops joined by two half corkscrews: two inversions, exits reversed', gen: (t, c) => genCobra(t, c, 1, 1) },
  { key: 'seaserpent', cat: 'inversions', dir: true, label: 'Sea serpent', tip: 'Cobra-roll shape whose second half flips the other way: exits the same direction', gen: (t, c) => genCobra(t, c, 1, -1) },
  { key: 'batwing', cat: 'inversions', dir: true, label: 'Batwing', tip: 'Half corkscrew up, dive half loop, half loop up, half corkscrew down', gen: (t, c) => genBatwing(t, c) },
  { key: 'sidewinder', cat: 'inversions', dir: true, label: 'Sidewinder', tip: 'Half loop up then a half corkscrew down: exits about 90° to the side', gen: (t, c) => { t.line(5, 1); const y0 = t.y; halfLoopUp(t, c); const H = t.y - y0; halfCork(t, c, clamp(H * 1.7, 16, 80), -H, 90 * c.d, 180, 180 + 180 * c.d, 4); t.to(t.x + 8, t.y); } },
  { key: 'norwegian', cat: 'inversions', dir: true, label: 'Norwegian loop', tip: 'Dive loop straight into an Immelmann: two inversions side by side', down: false, gen: (t, c) => { genDiveLoop(t, c); t.line(8, 1); halfLoopUp(t, c); const vt = c.vFront(t.y); genRoll(t, c, clamp(0.9 * vt, 10, 24), 180, 180 + 180 * c.d, 3); t.last().lat = -7 * c.d; } },
  { key: 'invtophat', cat: 'inversions', dir: true, label: 'Inverted top hat', tip: 'Twist inverted on the vertical climb, cross the top upside down, twist out on the way down', gen: (t, c) => genTopHat(t, c, true) },
  { key: 'pretzel', cat: 'inversions', label: 'Pretzel loop', tip: 'Loop entered from the top: dive down, round the bottom, climb back. Built for flying coasters, where riders lie on their backs through it', gen: (t, c) => genPretzel(t, c) },
  { key: 'nonloop', cat: 'inversions', dir: true, label: 'Non-inverting loop', tip: 'Loop that twists on the way up so riders stay upright at the top', gen: (t, c) => genNonInvLoop(t, c) },
  // ---- lifts & launches
  { key: 'chainlift', cat: 'power', label: 'Chain lift hill', tip: '35° chain lift to about 45 m', gen: (t, c) => genLift(t, c, 'chain', 35, 45) },
  { key: 'cablelift', cat: 'power', label: 'Cable lift hill', tip: '45° high-speed cable lift to about 70 m', gen: (t, c) => genLift(t, c, 'cable', 45, 70) },
  { key: 'tirelift', cat: 'power', label: 'Tire lift', tip: 'Gentle 25° drive-tire lift (family rides)', gen: (t, c) => genLift(t, c, 'tirelift', 25, 16) },
  { key: 'vertlift', cat: 'power', label: 'Vertical lift', tip: '90° chain lift (Euro-Fighter style)', gen: (t, c) => genLift(t, c, 'chain', 90, 36) },
  { key: 'lsm', cat: 'power', label: 'LSM launch', tip: 'Linear synchronous motors, about 1 G to 100 km/h', gen: (t, c) => genLaunch(t, c, 'lsm', 100) },
  { key: 'hydraulic', cat: 'power', label: 'Hydraulic launch', tip: 'Catch-car launch, about 1.6 G to 190 km/h', gen: (t, c) => genLaunch(t, c, 'hydraulic', 190) },
  { key: 'pneumatic', cat: 'power', label: 'Pneumatic launch', tip: 'Compressed-air launch, about 2.4 G to 170 km/h', gen: (t, c) => genLaunch(t, c, 'pneumatic', 170) },
  { key: 'boosters', cat: 'power', label: 'Booster tires', tip: 'Drive tires that push the train at a set speed', gen: t => { t.to(t.x + 14, t.y, { type: 'tires', spd: 22 }); t.to(t.x + 14, t.y, { type: 'tires', spd: 22 }); t.st.type = 'steel'; t.to(t.x + 6, t.y); } },
  // ---- brakes & stations
  { key: 'trim', cat: 'brakes', label: 'Trim brake', tip: 'Slows the train without stopping it', gen: (t, c) => { const sp = Math.round(Math.max(20, c.vAt(t.y) * 3.6 * 0.75)); t.to(t.x + 10, t.y, { type: 'trim', spd: sp }); t.to(t.x + 10, t.y, { type: 'trim', spd: sp }); t.st.type = 'steel'; t.to(t.x + 6, t.y); } },
  { key: 'mcbr', cat: 'brakes', label: 'Block brake (MCBR)', tip: 'Mid-course brake run that can stop a train so two or more trains can run safely', gen: t => { t.to(t.x + 12, t.y, { type: 'block' }); t.to(t.x + 24, t.y, { type: 'block' }); t.to(t.x + 32, t.y, { type: 'block' }); t.st.type = 'steel'; t.to(t.x + 8, t.y); } },
  { key: 'brakerun', cat: 'brakes', label: 'Final brake run', tip: 'Magnetic and fin brakes before the station', gen: t => { t.to(t.x + 14, t.y, { type: 'brakes' }); t.to(t.x + 30, t.y, { type: 'brakes' }); t.to(t.x + 44, t.y, { type: 'brakes' }); } }
];
const ELEMENT_BY_KEY = Object.fromEntries(ELEMENTS.map(e => [e.key, e]));
// keys used by older saves and toolbar buttons
ELEMENT_BY_KEY.bankleft = { ...ELEMENT_BY_KEY.bank, forceDir: -1 }; ELEMENT_BY_KEY.bankright = { ...ELEMENT_BY_KEY.bank, forceDir: 1 };
const ELEMENT_CATS = [['hills', 'Hills & drops'], ['turns', 'Turns'], ['inversions', 'Inversions'], ['power', 'Lifts & launches'], ['brakes', 'Brakes']];

function genVDrop(t, c, angle, hold) {
  const D = clamp(c.y0 - 4, 0, 400);
  if (D < 14) { t.to(t.x + 20, t.y); return; }
  const vb = Math.sqrt(c.v * c.v + 2 * G * D * 0.92);
  let r1 = clamp(c.v * c.v / (0.55 * G), 5, 22), r2 = clamp(vb * vb / (3.2 * G), 8, 70);
  const a = angle * DEG, f = 1 - Math.cos(a) * (angle > 90 ? 1 : 0);
  const arcDepth = r => r * (angle > 90 ? 1 - Math.cos(a) : Math.sin(a));
  let line = (D - arcDepth(r1) - r2 * (1 - Math.cos(a))) / Math.sin(a);
  if (line < 2) { const sc = Math.max(0.3, D / (arcDepth(r1) + r2 * (1 - Math.cos(a)) + 2)); r1 *= sc; r2 *= sc; line = 2; }
  t.line(4, 1);
  t.arc(-angle, r1, angle > 90 ? 5 : 3);
  t.line(line, Math.max(1, Math.round(line / 14)));
  t.arc(angle, r2, angle > 90 ? 5 : 4);
  t.line(10, 1);
  void f; void hold;
}
function genTopHat(t, c, inverted) {
  // Pull-ups, crest and pull-out are force-integrated: about 4 G at the bottom easing to 2.2 G at vertical,
  // and gentle airtime over the crest (-0.9 G at the vertical edges, -0.2 G at the very top).
  const v = c.vAt(t.y), hE = v * v / (2 * G), d = c.d, H = clamp(0.86 * hE, 12, 170);
  const HP = Math.PI / 2;
  const pullUp = phi => lerp(4.0, 2.2, clamp(phi / HP, 0, 1)), pullOut = phi => lerp(2.2, 4.0, clamp((phi + HP) / HP, 0, 1));
  const crest = phi => lerp(0.2, 0.9, clamp(Math.abs(phi - Math.PI) / HP, 0, 1)); // = -target G, used with phi = theta + pi
  t.line(6, 1); const yBase = t.y;
  const upEnd = y => loopArc({ x: 0, y, th: 0 }, c, 90, th => th, pullUp, 4, true).y;
  const crestTop = y => loopArc({ x: 0, y, th: HP }, c, -90, th => th + Math.PI, crest, 3, true).y;
  const yA = upEnd(yBase), target = yBase + H;
  if (crestTop(yA + 4) > yBase + 0.95 * hE) { t.fail = `A top hat needs more speed here (try at least ${Math.round(Math.sqrt(2 * G * (crestTop(yA + 4) - yBase) / 0.86) * 3.6)} km/h). Add a launch before it.`; return; }
  let lo = 4, hi = Math.max(5, target - yA);
  for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (crestTop(yA + m) > target) hi = m; else lo = m; }
  const lineUp = lo, minRollLine = 14;
  if (inverted && lineUp < minRollLine) { t.fail = 'An inverted top hat needs more speed here so the climb is long enough to roll. Add a stronger launch before it.'; return; }
  loopArc(t, c, 90, th => th, pullUp, 4);
  const nU = Math.max(inverted ? 3 : 1, Math.round(lineUp / 10));
  t.line(lineUp, nU, inverted ? (u => ({ roll: normDeg(180 * d * clamp((u - 0.1) / 0.8, 0, 1)) })) : null);
  loopArc(t, c, -90, th => th + Math.PI, crest, 3); loopArc(t, c, -90, th => th + Math.PI, crest, 3);
  // vertical drop, then a pull-out that ends level with where the element started
  const outDrop = y => y - loopArc({ x: 0, y, th: -HP }, c, 90, th => th, pullOut, 4, true).y;
  let lo2 = 0, hi2 = Math.max(1, t.y - yBase);
  for (let i = 0; i < 30; i++) { const m = (lo2 + hi2) / 2; const yb = t.y - m; if (yb - outDrop(yb) < yBase) hi2 = m; else lo2 = m; }
  const lineDn = Math.max(2, lo2), nD = Math.max(inverted ? 3 : 1, Math.round(lineDn / 10));
  t.line(lineDn, nD, inverted ? (u => ({ roll: normDeg(180 * d + 180 * d * clamp((u - 0.1) / 0.8, 0, 1)) })) : null);
  loopArc(t, c, 90, th => th, pullOut, 4); t.th = 0; t.line(8, 1, () => ({ roll: 0 }));
}
function genCorkscrew(t, c, scale) {
  // helix around a forward axis; phase eases in and out so the train enters and leaves without a sideways jolt
  const v = c.vAt(t.y), d = c.d;
  const rc = clamp((0.0035 * v * v + 2.8) * scale, 3, 10);
  const kt = 3.0 * G / (v * v);                                 // target heartline curvature at the busiest point
  const cpitch = Math.sqrt(Math.max(4, rc / kt - rc * rc));     // helix pitch / 2pi
  const Lc = clamp(2 * Math.PI * cpitch * 1.5, 22 * scale, 140);
  t.to(t.x + 6, t.y);
  const x0 = t.x, y0 = t.y, steps = 16;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps, ph = 2 * Math.PI * (3 * u * u - 2 * u * u * u);
    t.to(x0 + Lc * u, y0 + rc * (1 - Math.cos(ph)), { roll: normDeg(d * ph / DEG), off: rnd2(-d * rc * Math.sin(ph)), align: i < steps });
  }
  t.to(t.x + 10, y0, { roll: 0, off: 0 });
}
function genZeroG(t, c, stall) {
  const v = c.vAt(t.y), h = clamp((stall ? 0.3 : 0.22) * v * v / (2 * G), 3, 30), vt = c.vAt(t.y + h);
  const kap = Math.max(0.004, 1.0 * G / (vt * vt)), W = Math.max(Math.PI * Math.sqrt(2 * h / kap), 5 * h, 24) * (stall ? 1.25 : 1);
  const x0 = t.x, y0 = t.y, d = c.d;
  const rollAt = u => stall ? (u < 0.2 ? 0 : u < 0.36 ? 180 * (u - 0.2) / 0.16 : u < 0.64 ? 180 : u < 0.8 ? 180 + 180 * (u - 0.64) / 0.16 : 360) : clamp((u - 0.22) / 0.56, 0, 1) * 360;
  const us = stall ? [0.12, 0.22, 0.29, 0.36, 0.5, 0.64, 0.71, 0.78, 0.88, 1] : [0.14, 0.26, 0.36, 0.45, 0.55, 0.64, 0.74, 0.86, 1];
  for (const u of us) t.to(x0 + W * u, y0 + h * (1 - Math.cos(2 * Math.PI * u)) / 2, { roll: normDeg(d * rollAt(u)) });
  t.th = 0;
}
function genCobra(t, c, d1, d2) {
  const d = c.d; t.line(5, 1); const y0 = t.y;
  halfLoopUp(t, c); const H = t.y - y0;
  const vt = c.vFront(t.y), Lh = clamp(1.3 * vt, 14, 52), dz = H * 0.3;
  const x0 = t.x, yt = t.y, R0 = t.st.roll;
  for (let i = 1; i <= 7; i++) { const u = i / 7; t.to(x0 + 2 * Lh * u, yt - dz * Math.sin(Math.PI * u), { yaw: i < 7 ? rnd2((i <= 3 ? d1 : d2) * d * 30) : 0, roll: normDeg(R0 + 360 * d * u), align: i < 7 }); }
  t.th = 0;
  halfLoopDown(t, c, y0); t.line(6, 1);
}
function genDiveLoop(t, c) {
  // rising half roll to the height a half loop needs, then the half loop down to the entry height
  const d = c.d, y0 = t.y, H = halfLoopHeightAt(c, y0), L = clamp(1.7 * H, 22, 80);
  t.to(t.x + 5, t.y);
  const n0 = t.pts.length;
  // the roll mostly happens over the upper, slower part of the climb so the pull-up does not push riders sideways
  { const x0 = t.x, yb = t.y; for (let i = 1; i <= 6; i++) { const u = i / 6, ru = clamp((u - 0.2) / 0.8, 0, 1); t.to(x0 + L * u, yb + H * (1 - Math.cos(Math.PI * u)) / 2, { roll: normDeg(180 * d * ru * ru * (3 - 2 * ru)) }); } }
  const S = 2 * TRAIN.envR + 3.2; for (let i = n0; i < t.pts.length; i++) t.pts[i].lat = -S * d / (t.pts.length - n0);
  t.th = 0;
  halfLoopDown(t, c); t.line(6, 1);
}
function genBatwing(t, c) {
  const d = c.d, y0 = t.y;
  const H = halfLoopHeightAt(c, y0);
  t.to(t.x + 5, t.y);
  const Lh = clamp(H * 1.7, 16, 80);
  halfCork(t, c, Lh, H, 90 * d, 0, 180 * d, 4);
  // the run between the half loops is long enough that the exit corkscrew lands beside the entry instead of crossing it
  const run = 1.62 * Lh + 2 * TRAIN.envR + 6;
  halfLoopDown(t, c, y0); t.line(run, Math.max(2, Math.round(run / 15)));
  halfLoopUp(t, c);
  const H2 = t.y - y0;
  halfCork(t, c, Lh, -H2, 90 * d, t.st.roll, t.st.roll + 180 * d, 4);
  t.to(t.x + 6, t.y);
}
function genPretzel(t, c) {
  const v = c.vAt(t.y), room = Math.max(8, c.y0 - 5);
  let r2 = clamp(v * v / (1.5 * G), 5, 22), rb = 10; for (let i = 0; i < 20; i++) rb = lerp(rb, clamp(c.vAt(t.y - r2 - rb) ** 2 / (2.6 * G), 6, 45), 0.5);
  if (v < 11) { t.fail = 'A pretzel loop climbs back to its entry height, so the train needs at least 40 km/h going in. Put it after a drop and a climb rather than at the top of a lift.'; return; }
  if (r2 + rb + 3 > room) { t.fail = `A pretzel loop dives down first, so it needs about ${Math.round(r2 + rb + 8)} m of height here. Add it after a lift or a climb.`; return; }
  const R0 = t.st.roll;
  t.line(5, 1); t.arc(-90, r2, 3); t.last().flip = true; t.last().roll = normDeg(R0 + 180); t.st.roll = t.last().roll;
  const S = 2 * TRAIN.envR + 2.5; t.arc(180, rb, 6, () => ({ lat: S / 6 })); t.last().flip = true; t.last().roll = normDeg(R0 + 360); t.st.roll = t.last().roll;
  t.arc(-90, r2, 3); t.line(6, 1);
}
function genNonInvLoop(t, c) {
  // quarter loop up, then twist upright while cresting so riders cross the top on the outside, head up;
  // twist back on the way down and finish with a quarter loop. The crest is force-integrated like a top hat.
  const d = c.d, HP = Math.PI / 2, hE = c.v * c.v / (2 * G * 1.06);
  const crest = phi => lerp(0.3, 1.15, clamp(Math.abs(phi - Math.PI) / HP, 0, 1));
  t.line(5, 1); const y0 = t.y;
  const tw = 4, pull = phi => lerp(4.3, 2.4, clamp(phi / HP, 0, 1)), pullDn = phi => lerp(2.4, 4.3, clamp((phi - 1.5 * Math.PI) / HP, 0, 1));
  const yA = loopArc({ x: 0, y: y0, th: 0 }, c, 90, th => th, pull, 4, true).y;
  const top = loopArc({ x: 0, y: yA + tw, th: HP }, c, -90, th => th + Math.PI, crest, 3, true).y;
  if (top > y0 + 0.97 * hE) { t.fail = `A non-inverting loop needs more speed here (about ${Math.round(Math.sqrt(2 * G * 1.06 * (top - y0) / 0.96) * 3.6)} km/h). Try it after a bigger drop or a launch.`; return; }
  const S = 2 * TRAIN.envR + 5, sh = S / 18, setRolls = (i0, f) => { const n = t.pts.length - i0; for (let i = i0; i < t.pts.length; i++) { const q = t.pts[i]; Object.assign(q, f((i - i0 + 1) / n)); } t.st.roll = t.last().roll; };
  let j0 = t.pts.length; loopArc(t, c, 90, th => th, pull, 4); for (let i = j0; i < t.pts.length; i++) t.pts[i].lat = sh;
  t.last().flip = true; t.last().roll = 180; t.st.roll = 180;
  let i0 = t.pts.length; t.line(tw, 2); loopArc(t, c, -90, th => th + Math.PI, crest, 3);
  setRolls(i0, u => ({ roll: normDeg(180 + 180 * d * u * u * (3 - 2 * u)), lat: -sh }));
  i0 = t.pts.length; loopArc(t, c, -90, th => th + Math.PI, crest, 3); t.line(tw, 2);
  setRolls(i0, u => ({ roll: normDeg(180 * d * u * u * (3 - 2 * u)), lat: -sh }));
  t.last().flip = true; t.last().roll = normDeg(180 * d + 180); t.st.roll = t.last().roll;
  j0 = t.pts.length; loopArc(t, c, 90, th => 2 * Math.PI + th, pullDn, 4); for (let i = j0; i < t.pts.length; i++) t.pts[i].lat = sh; t.line(6, 1, () => ({ lat: 0 }));
}
function genClassicLoop(t, c) {
  const pts = loopShape(c.vAt(t.y));
  const x0 = t.x + 12, y0 = t.y; t.to(x0, y0);
  // shift sideways mostly near the top so the entry and exit runs pass each other with full clearance
  const S = Math.max(4.4, 2 * TRAIN.envR + 1.0), w = pts.map((q, i) => Math.pow(Math.sin(Math.PI * (i + 0.5) / pts.length), 4)), ws = w.reduce((a, b) => a + b, 0);
  pts.forEach((q, i) => t.to(x0 + q[0], y0 + q[1], { lat: +(S * w[i] / ws).toFixed(3) }));
  const ex = x0 + pts[pts.length - 1][0];
  t.to(ex + 10, y0); t.to(ex + 24, y0);
}
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
function genLift(t, c, type, angle, height) {
  const rIn = angle >= 80 ? 7 : 18, rOut = angle >= 80 ? 6 : 14;
  const H = Math.max(8, height);
  const a = angle * DEG;
  const rise = H - rIn * (1 - Math.cos(a)) - rOut * (1 - Math.cos(a));
  t.line(4, 1, () => ({ type }));
  t.arc(angle, rIn, angle >= 80 ? 4 : 2, () => ({ type }));
  const L = Math.max(4, rise / Math.sin(a));
  t.line(L, Math.max(2, Math.round(L / 18)), () => ({ type }));
  t.arc(-angle, rOut, angle >= 80 ? 4 : 2, u => ({ type: u < 0.6 ? type : 'steel' }));
  t.st.type = 'steel'; t.line(6, 1);
}
function genLaunch(t, c, sys, kmh) {
  const v = kmh / 3.6, a = LAUNCH_SYS[sys].acc, L = clamp(v * v / (2 * a) + 12, 20, 260);
  const n = Math.max(3, Math.round(L / 25));
  for (let i = 1; i <= n; i++) { t.x += L / n; t.emit({ type: 'launch', sys, spd: kmh }); }
  t.st.type = 'steel'; t.x += 10; t.emit({ type: 'steel' });
}

// ---------- splice an element after node k ----------
function makeElement(kind, base, speedHint, dir = 1) {
  const el = ELEMENT_BY_KEY[kind]; if (!el) return [];
  const v = Math.max(6, speedHint || 20);
  const t = Turtle(); t.st.roll = 0;
  const vAt = yRel => Math.sqrt(Math.max(16, v * v - 2 * G * yRel * 1.06));
  // a long train's front car crests faster than a point mass would: its centre of mass is still lower
  const vFront = yRel => vAt(yRel > 0 ? yRel - Math.min(yRel * 0.4, TRAIN.len * 0.45) : yRel);
  const c = { v, y0: base.y, yBase: 0, d: el.forceDir || (dir < 0 ? -1 : 1), vAt, vFront };
  el.gen(t, c);
  if (t.fail) return { fail: t.fail };
  // rising elements return to their entry height so the rest of the ride is unchanged
  const endY = t.pts.length ? t.pts[t.pts.length - 1].y : 0;
  if (el.rise || (endY > 4 && !el.down && !['chainlift', 'cablelift', 'tirelift', 'vertlift', 'spike'].includes(kind))) {
    const H = endY, L = Math.max(30, H * 2.4, vAt(endY) * 1.6), x0 = t.x, y0 = t.y; t.th = 0;
    for (const u of [0.15, 0.35, 0.55, 0.75, 0.9, 1]) t.to(x0 + L * u, y0 - H * (1 - Math.cos(Math.PI * u)) / 2, { roll: 0 });
  }
  const out = [];
  for (const p of t.pts) {
    const nd = { x: rnd2(base.x + p.x), y: rnd2(Math.max(0.5, base.y + p.y)), yaw: p.yaw || 0, roll: Math.round(normDeg(p.roll || 0)), type: p.type || 'steel' };
    if (p.flip) nd.flip = true;
    if (p.off) nd.off = p.off;
    if (p.lat) nd.lat = p.lat;
    for (const k of ['spd', 'sys', 'hold']) if (p[k] !== undefined) nd[k] = p[k];
    out.push(nd);
  }
  const res = out.filter((nd, i) => i === 0 || Math.hypot(nd.x - out[i - 1].x, nd.y - out[i - 1].y) > 0.3);
  const alignIdx = []; t.pts.forEach((p, i) => { if (p.align) alignIdx.push(i); });
  if (alignIdx.length && res.length === out.length) alignRolls(res, base, v, new Set(alignIdx));
  return res;
}
// Roll helical sections so the track leans with the felt force (no sideways push), like a real corkscrew design.
function alignRolls(els, base, v, which) {
  const lead = { x: base.x - 30, y: base.y, yaw: 0, roll: 0, type: 'steel' }, b0 = { x: base.x, y: base.y, yaw: 0, roll: 0, type: 'steel' };
  const last = els[els.length - 1];
  for (let it = 0; it < 4; it++) {
    const nodes = [lead, b0, ...els, { ...last, x: last.x + 30, roll: 0, off: 0, flip: false, yaw: 0 }];
    const trk = buildTrack(nodes, false);
    for (const i of which) {
      const ni = i + 2, s = trk.nodeS[ni], k = Math.min(trk.nm - 1, Math.round(s / DS));
      const sp = Math.sqrt(Math.max(9, v * v - 2 * G * (trk.hy[k] - base.y) * 1.05));
      const fx = sp * sp * trk.kx[k], fy = sp * sp * trk.ky[k] + G, fz = sp * sp * trk.kz[k];
      const fu = fx * trk.ux[k] + fy * trk.uy[k] + fz * trk.uz[k], fr = fx * trk.rx[k] + fy * trk.ry[k] + fz * trk.rz[k];
      if (Math.hypot(fu, fr) < 0.6 * G) continue;
      const err = Math.atan2(fr, fu) / DEG;
      els[i].roll = Math.round(normDeg(els[i].roll + err * 0.85));
    }
  }
}
function spliceElement(nodes, k, kind, speedHint, dir = 1) {
  const base = nodes[k]; const el = makeElement(kind, base, speedHint, dir);
  if (!Array.isArray(el)) return { nodes, added: 0, msg: el.fail };
  if (!el.length) return { nodes, added: 0 };
  const endX = el[el.length - 1].x, span = endX - base.x;
  const dy = el[el.length - 1].y - base.y;
  const after = nodes.slice(k + 1).map(nd => {
    const o = { ...nd, x: rnd2(nd.x + span) };
    if (dy < -1) o.y = nd.y < 3.5 ? nd.y : rnd2(Math.max(3.5, nd.y + dy));
    return o;
  });
  return { nodes: [...nodes.slice(0, k + 1), ...el, ...after], added: el.length, span, dy };
}
function energySpeed(nodes, k) { let m = 0; for (let i = 0; i <= k; i++) m = Math.max(m, nodes[i].y); return 0.97 * Math.sqrt(2 * G * Math.max(1, m - nodes[k].y)); }

// ---------- presets ----------
function P(x, y, yaw = 0, roll = 0, type = 'steel', extra) { return { x, y, yaw, roll, type, ...(extra || {}) }; }
const A = 'auto';
function withEl(nodes, kind, dir = 1, v) { const k = nodes.length - 1; return spliceElement(nodes, k, kind, v || energySpeed(nodes, k), dir).nodes; }
function shiftFrom(list, dx) { return list.map(n => ({ ...n, x: rnd2(n.x + dx) })); }
function chain(base, more) { const last = base[base.length - 1]; return base.concat(shiftFrom(more, last.x)); }
const INV_END = { a: -69, L: 0, b: 74, c: 46 };
const PRESET_DEFS = {
  hyper: () => ({ name: 'Hyper-Goliath Mega Coaster', closed: true, style: { train: 'hyper', track: 'tubular', supports: 'steel', paint: 0 }, nodes: [
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
    n = withEl(n, 'corkscrew', 1);
    n = withEl(n, 'corkscrew', 1);
    n = chain(n, [P(20, 11), P(36, 13.5), P(52, 11), P(70, 5),
      P(90, 5, -60, A), P(108, 4.6, -60, A), P(126, 4.4, -60, A), P(144, 4.4, -60, A), P(164, 4.5),
      P(184, 4.5, 0, 0, 'brakes'), P(210, 4.5, 0, 0, 'brakes')]);
    return { name: 'Looping Corkscrew', closed: true, style: { train: 'looping', track: 'tubular', supports: 'steel', paint: 2 }, nodes: n }; },
  boomerang: () => { let n = [P(0, 4, 0, 0, 'station'), P(26, 4, 0, 0, 'station'), P(40, 4.2, 0, 0, 'brakes'), P(52, 9, 0, 0, 'chain'), P(76, 34, 0, 0, 'chain'), P(84, 37, 0, 0, 'chain'),
      P(92, 35.5), P(104, 22), P(116, 7.5), P(132, 4)];
    n = withEl(n, 'loop', 1, 27);
    n = chain(n, [P(16, 6.5, 0, 0, 'chain'), P(30, 17, 0, 0, 'chain'), P(39, 33, 0, 0, 'chain'), P(42.5, 45, 0, 0, 'chain'), P(43.6, 53, 0, 0, 'chain')]);
    return { name: 'Boomerang Shuttle', closed: false, style: { train: 'looping', track: 'tubular', supports: 'steel', paint: 1 }, nodes: n }; },
  inverted: () => { let n = [P(0, 4.5, 0, 0, 'station'), P(28, 4.5, 0, 0, 'station'), P(40, 5), P(54, 12, 0, 0, 'chain'), P(100, 48, 0, 0, 'chain'), P(110, 51, 0, 0, 'chain'),
      P(120, 50, 30, A), P(136, 42, 40, A), P(150, 28, 40, A), P(164, 14, 20, A), P(180, 6.5)];
    n = withEl(n, 'loop');
    n = chain(n, [P(18, 9), P(32, 10)]);
    n = withEl(n, 'zerog', 1);
    n = chain(n, [P(16, 8.5)]);
    n = withEl(n, 'cobra', -1);
    n = chain(n, [P(18, 7.5, INV_END.a, A), P(40, 8), P(60, 7)]);
    n = withEl(n, 'corkscrew', 1);
    n = chain(n, [P(16, 6), P(16 + INV_END.L, 6), P(40 + INV_END.L, 6, INV_END.b, A), P(64 + INV_END.L, 5.5, INV_END.c, A), P(84 + INV_END.L, 5), P(104 + INV_END.L, 4.8, 0, 0, 'brakes'), P(130 + INV_END.L, 4.8, 0, 0, 'brakes')]);
    return { name: 'Inverted Twister', closed: true, style: { train: 'inverted', track: 'box', supports: 'steel', paint: 3 }, nodes: n }; },
  strata: () => { let n = [P(0, 4, 0, 0, 'station'), P(26, 4, 0, 0, 'station'), P(40, 4)];
    n = withEl(n, 'hydraulic', 1, 4);
    n = withEl(n, 'tophat', 1, 52);
    n = chain(n, [P(30, 4.5), P(60, 4.5, 0, 0, 'brakes'), P(110, 4.5, 0, 0, 'brakes'), P(160, 4.5, 0, 0, 'brakes'), P(210, 4.5, 0, 0, 'brakes'), P(240, 4.5, 90, A), P(268, 4.5, 90, A), P(300, 4.5)]);
    return { name: 'Strata Launch Tower', closed: true, style: { train: 'hyper', track: 'truss', supports: 'steel', paint: 0 }, nodes: n }; },
  woodie: () => { let n = [P(0, 4, 0, 0, 'station'), P(26, 4, 0, 0, 'station'), P(38, 4.4), P(52, 10, 0, 0, 'chain'), P(98, 36, 0, 0, 'chain'), P(108, 38, 0, 0, 'chain'),
      P(118, 37), P(132, 26), P(146, 10), P(162, 5)];
    n = withEl(n, 'camelback'); n = withEl(n, 'speedhill');
    n = chain(n, [P(10, 5.5)]);
    n = withEl(n, 'turnaround', 1);
    n = withEl(n, 'camelback'); n = withEl(n, 'bunny');
    n = chain(n, [P(12, 5, 0, 0), P(30, 4.8, 0, 0, 'brakes'), P(56, 4.6, 0, 0, 'brakes')]);
    return { name: 'Timber Out-and-Back', closed: true, style: { train: 'wooden', track: 'wood', supports: 'wood', paint: 4 }, nodes: n }; },
  dive: () => { let n = [P(0, 4, 0, 0, 'station'), P(26, 4, 0, 0, 'station'), P(38, 4.4), P(52, 11, 0, 0, 'chain'), P(84, 44, 0, 0, 'chain'), P(92, 46.5, 0, 0, 'chain'), P(104, 47)];
    n = withEl(n, 'holddrop', 1, 4);
    n = chain(n, [P(10, 5)]);
    n = withEl(n, 'immelmann', 1);
    n = withEl(n, 'camelback');
    n = chain(n, [P(16, 6, 60, A), P(36, 6, 60, A), P(56, 6, 60, A), P(76, 5.5)]);
    n = withEl(n, 'inline', 1);
    n = chain(n, [P(16, 5), P(40, 4.8, 0, 0, 'brakes'), P(66, 4.6, 0, 0, 'brakes')]);
    return { name: 'Dive Machine', closed: true, style: { train: 'dive', track: 'box', supports: 'steel', paint: 2 }, nodes: n }; },
  mouse: () => { let n = [P(0, 4, 0, 0, 'station'), P(20, 4, 0, 0, 'station'), P(30, 4.4), P(42, 8, 0, 0, 'tirelift'), P(60, 15, 0, 0, 'tirelift'), P(68, 16, 0, 0, 'tirelift'), P(76, 16)];
    n = withEl(n, 'hairpin', 1, 5); n = chain(n, [P(10, 15.5)]); n = withEl(n, 'hairpin', -1, 5); n = chain(n, [P(10, 15)]); n = withEl(n, 'hairpin', 1, 5);
    n = chain(n, [P(12, 14.5), P(24, 11), P(32, 8.5), P(44, 8)]);
    n = withEl(n, 'turnaround', -1, 10);
    n = chain(n, [P(14, 6.5), P(28, 7), P(40, 5, 0, 0, 'trim', { spd: 20 }), P(52, 5)]);
    n = withEl(n, 'hairpin', 1, 5.6);
    n = chain(n, [P(16, 4.6, 0, 0, 'brakes'), P(34, 4.4, 0, 0, 'brakes')]);
    return { name: 'Wild Mouse', closed: true, style: { train: 'mouse', track: 'flat', supports: 'steel', paint: 1 }, nodes: n }; },
  mine: () => ({ name: 'Family Mine Train', closed: true, style: { train: 'mine', track: 'tubular', supports: 'wood', paint: 4 }, nodes: [
    P(0, 4, 0, 0, 'station'), P(24, 4, 0, 0, 'station'), P(34, 4.5), P(46, 8, 0, 0, 'chain'), P(70, 17, 0, 0, 'chain'), P(80, 18, 0, 0, 'chain'),
    P(96, 16.5, 35, A), P(114, 13, 35, A), P(132, 9, 30, A), P(150, 6.5), P(168, 8.5), P(184, 9), P(200, 6.5),
    P(218, 6, -35, A, 'steel', { tunnel: true }), P(236, 5.6, -35, A, 'steel', { tunnel: true }), P(256, 5.2), P(272, 7.2), P(288, 7.6), P(304, 5.4),
    P(322, 5, 45, A), P(342, 4.8, 45, A), P(362, 4.7, 45, A), P(382, 4.6, 45, A), P(402, 4.6),
    P(420, 4.5, 0, 0, 'brakes'), P(442, 4.5, 0, 0, 'brakes') ] }),
  blank: () => ({ name: 'Blank Slate (3 Nodes)', closed: false, nodes: [P(0, 4, 0, 0, 'station'), P(30, 4, 0, 0, 'station'), P(60, 4)] })
};
function resolvePreset(key) {
  const def = PRESET_DEFS[key](); const autos = def.nodes.map(n => n.roll === A);
  let nodes = def.nodes.map(n => ({ ...n, roll: n.roll === A ? 0 : n.roll }));
  for (let it = 0; it < 4 && autos.some(Boolean); it++) {
    const trk = buildTrack(nodes, def.closed), an = analyzeTrack(trk);
    nodes = nodes.map((n, i) => autos[i] ? { ...n, roll: autoBankFor(nodes, i, trk, an) } : n);
  }
  return { name: def.name, closed: def.closed, style: def.style || null, nodes };
}
const PRESET_ORDER = ['hyper', 'corkscrew', 'inverted', 'strata', 'woodie', 'dive', 'mouse', 'boomerang', 'mine', 'blank'];
const PRESETS = {};
function getPreset(key) { return PRESETS[key] || (PRESETS[key] = resolvePreset(key)); }
// ===================== END ELEMENTS =====================
