// ===================== APP: state, side and top editors, inspector, telemetry, panels =====================
(() => {
  const $ = id => document.getElementById(id);
  let World = null;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const K_AUTO = 'coasterlab.v1.autosave', K_SLOTS = 'coasterlab.v1.slots', K_PREFS = 'coasterlab.v1.prefs', K_SYNC = 'coasterlab.v2.sync';
  const css = getComputedStyle(document.documentElement);
  const C = n => css.getPropertyValue(n).trim();
  const COL = { board: C('--board'), grid: C('--board-grid'), grid2: C('--board-grid-2'), text: C('--text'), muted: C('--muted'), faint: C('--faint'), signal: C('--signal'), vg: C('--vg'), lg: C('--lg'), ok: C('--ok'), warn: C('--warn'), crit: C('--crit'), ink: C('--ink') };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const prefs = LS.get(K_PREFS, {});
  const S = {
    nodes: [], closed: true, sel: 1, mode: 'build', cam: prefs.cam && prefs.cam !== 'overview' ? prefs.cam : 'follow', playing: true, audio: 0,
    quality: prefs.quality || 'auto', guides: prefs.guides !== false, alerts: prefs.alerts !== false, colorMode: prefs.colorMode || 'g', vex: prefs.vex || 3,
    viewPct: prefs.viewPct || 56, seat: 0, name: '', dir: prefs.dir || 1, cat: prefs.cat || 'hills',
    design: prefs.design ? { ...defaultDesign(), ...prefs.design, colors: { ...defaultDesign().colors, ...(prefs.design.colors || {}) } } : defaultDesign('hyper', 0),
    env: { scenery: prefs.env?.scenery || 'alpine', tod: prefs.env?.tod || prefs.tod || 'golden', weather: prefs.env?.weather || 'fair' }
  };
  const view = { mode: 'side', az: 0.95, el: 0.2, dist: 30, lookYaw: 0, lookPitch: 0, seat: 0, train: 0 };
  let trk = null, an = null, clear = null, trains = [], glOK = false, lastAn = 0, plan = null;
  const savePrefs = () => LS.set(K_PREFS, { cam: S.cam, quality: S.quality, guides: S.guides, alerts: S.alerts, colorMode: S.colorMode, vex: S.vex, viewPct: S.viewPct, dir: S.dir, cat: S.cat, design: S.design, env: S.env });

  // ---------- history ----------
  const undoStack = [], redoStack = []; let editing = false;
  const snap = () => JSON.stringify({ nodes: S.nodes, closed: S.closed, sel: S.sel });
  function pushHistory() { undoStack.push(snap()); if (undoStack.length > 40) undoStack.shift(); redoStack.length = 0; updUndo(); }
  function restore(js) { const o = JSON.parse(js); const closedChanged = o.closed !== S.closed; S.nodes = o.nodes; S.closed = o.closed; S.sel = clamp(o.sel, 0, S.nodes.length - 1); commit({ resetTrain: closedChanged }); refreshCircuit(); }
  function undo() { if (!undoStack.length || S.mode === 'ride') return; redoStack.push(snap()); restore(undoStack.pop()); updUndo(); toast('Undone'); }
  function redo() { if (!redoStack.length || S.mode === 'ride') return; undoStack.push(snap()); restore(redoStack.pop()); updUndo(); toast('Redone'); }
  function updUndo() { $('bUndo').disabled = !undoStack.length || S.mode === 'ride'; $('bRedo').disabled = !redoStack.length || S.mode === 'ride'; }
  function beginEdit() { if (!editing) { pushHistory(); editing = true; } }
  function endEdit() { if (editing) { editing = false; commit(); } }

  // ---------- rebuild ----------
  const trainCount = () => trk ? Math.min(S.design.trains || 1, maxTrainsFor(trk)) : 1;
  function resetTrains() {
    const n = trainCount(); trains = [];
    for (let i = 0; i < n; i++) {
      const st = newTrainState(trk, i);
      if (i > 0) { const b = trk.blocks[trk.blocks.length - i]; if (b && b.kind !== 'station') { st.phase = 'run'; st.s = b.s; st.v = 0; st.dispatch = false; } }
      trains.push(st);
    }
    resetPeaks();
  }
  function rebuild(full, opts = {}) {
    setTrainSpec(trainSpecFor(S.design));
    trk = buildTrack(S.nodes, S.closed);
    const now = performance.now();
    if (full || !an || now - lastAn > 160) { an = analyzeTrack(trk); lastAn = now; clear = trackClearance(trk); }
    plan = null;
    if (!trains.length || opts.resetTrain || trains.length !== trainCount()) resetTrains();
    else for (const st of trains) { const maxS = S.closed ? trk.L : trk.Lm; st.s = clamp(st.s, Math.min(TRAIN.len, trk.Lm), maxS); if (st.phase === 'load') st.s = trk.stationStop; }
  }
  let t3d = 0, tVeg = 0, live3dAt = 0;
  function schedule3D(opts = {}) {
    if (!glOK) return; clearTimeout(t3d); clearTimeout(tVeg);
    t3d = setTimeout(() => { World.setTrack(trk, { vegetation: false, count: trains.length, trains: opts.trains !== false }); if (trk.tunnels && trk.tunnels.length) { refreshCheck(); refreshTunnel(); } tVeg = setTimeout(() => World.rescatter(trk), 650); }, 20);
  }
  function commit(opts = {}) { rebuild(true, opts); boardDirty = true; refreshInspector(); refreshCheck(); autosave(); schedule3D(); }
  function liveUpdate() {
    rebuild(false); boardDirty = true; refreshInspector(true);
    if (glOK && (S.cam === 'follow' || S.cam === 'pov') && performance.now() - live3dAt > 220) { live3dAt = performance.now(); World.setTrack(trk, { vegetation: false, count: trains.length }); }
  }
  function autosave() { LS.set(K_AUTO, { nodes: S.nodes, closed: S.closed, sel: S.sel, name: S.name, design: S.design, env: S.env, ts: Date.now() }); }

  // ---------- presets ----------
  function applyStyle(style) {
    if (!style) return;
    const d = defaultDesign(style.train || 'hyper', style.paint ?? 0);
    d.track = style.track || d.track; d.supports = style.supports || d.supports; d.trains = S.design.trains || 1; d.riders = S.design.riders; d.occupancy = S.design.occupancy; d.lights = S.design.lights; d.pattern = S.design.pattern || d.pattern;
    S.design = d;
  }
  function loadPreset(key, silent) {
    const p = getPreset(key); if (!silent) pushHistory();
    applyStyle(p.style);
    S.nodes = p.nodes.map(n => ({ ...n })); S.closed = p.closed; S.sel = Math.min(1, S.nodes.length - 1); S.name = p.name;
    if (glOK) World.setDesign(S.design);
    commit({ resetTrain: true }); refreshCircuit(); fitBoard(); refreshDesignSheet(); savePrefs();
    if (glOK) schedule3D();
    if (!silent) toast(`Loaded ${p.name}`);
  }

  // ---------- toast ----------
  let toastT = 0;
  function toast(msg, action, fn, ms = 2800) {
    $('toastT').textContent = msg; const a = $('toastA');
    if (action) { a.hidden = false; a.textContent = action; a.onclick = () => { $('toast').hidden = true; fn(); }; } else a.hidden = true;
    $('toast').hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, ms);
  }

  // ---------- board: side profile and top-down plan ----------
  const board = $('board'), bg = board.getContext('2d'); const stage = $('stage');
  const BV = { sc: 1, ox: 50, oy: 300, w: 300, h: 300, dpr: 1 };
  const TV = { sc: 1, ox: 0, oy: 0 };                 // top view: screen = o + (x, z) * sc
  let boardDirty = true, needFit = true, needFitTop = true;
  const sx = x => BV.ox + x * BV.sc, sy = y => BV.oy - y * BV.sc * S.vex;
  const fromScreen = (px, py) => [(px - BV.ox) / BV.sc, (BV.oy - py) / (BV.sc * S.vex)];
  const tx = x => TV.ox + x * TV.sc, tz = z => TV.oy + z * TV.sc;
  const fromTop = (px, py) => [(px - TV.ox) / TV.sc, (py - TV.oy) / TV.sc];
  const isBoard = () => S.cam === 'side' || S.cam === 'top';
  function sizeCanvas(c, maxDpr = 2) { const r = c === board ? stage.getBoundingClientRect() : c.getBoundingClientRect(); const dpr = Math.min(maxDpr, window.devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return { w: r.width, h: r.height, dpr }; }
  function fitBoard() {
    if (!trk) return; const rr = stage.getBoundingClientRect(); if (rr.width > 10) { BV.w = rr.width; BV.h = rr.height; }
    if (S.cam === 'top') return fitTop();
    let x0 = 1e9, x1 = -1e9, y1 = 12, y0 = 0;
    for (let k = 0; k < trk.nm; k += 2) { x0 = Math.min(x0, trk.profX[k]); x1 = Math.max(x1, trk.profX[k]); y1 = Math.max(y1, trk.profY[k]); y0 = Math.min(y0, trk.profY[k] - 1, trk.ground ? trk.ground[k] : 0); }
    y0 = Math.max(y0, -45);
    const padL = 54, padR = 28, padT = 86, padB = 60;
    const sw = (BV.w - padL - padR) / Math.max(30, x1 - x0), sh = (BV.h - padT - padB) / ((y1 - y0) * S.vex + 4);
    BV.sc = clamp(Math.min(sw, sh), 0.02, 40);
    BV.ox = padL - x0 * BV.sc + Math.max(0, ((BV.w - padL - padR) - (x1 - x0) * BV.sc) / 2);
    BV.oy = Math.min(BV.h - padB + y0 * S.vex * BV.sc, padT + (BV.h - padT - padB) / 2 + ((y1 + y0) / 2 * S.vex * BV.sc) + 10);
    boardDirty = true;
  }
  function fitTop() {
    const b = trk.bounds, padX = 60, padT = 70, padB = 110, w = Math.max(40, b.x1 - b.x0), h = Math.max(40, b.z1 - b.z0);
    TV.sc = clamp(Math.min((BV.w - padX * 2) / w, (BV.h - padT - padB) / h), 0.03, 20);
    TV.ox = BV.w / 2 - (b.x0 + b.x1) / 2 * TV.sc; TV.oy = padT + (BV.h - padT - padB) / 2 - (b.z0 + b.z1) / 2 * TV.sc;
    boardDirty = true;
  }
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  function gColor(vg) { if (!isFinite(vg)) return '#3b4753'; const b = TRAIN.prone ? -vg : vg; if (b < -0.5) return '#ff4f9a'; if (b < 0.3) return '#b48cff'; if (b <= 3.0) return COL.ok; if (b <= 4.2) return COL.signal; return COL.crit; }
  function rampColor(t) { t = clamp(t, 0, 1); const stops = [[47, 127, 214], [69, 196, 134], [243, 179, 61], [255, 81, 70]]; const f = t * 3, i = Math.min(2, Math.floor(f)), u = f - i; const a = stops[i], b = stops[i + 1]; return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * u)).join(',')})`; }
  function trackColorAt(k) {
    if (S.colorMode === 'g') return gColor(an.vg[k]);
    if (S.colorMode === 'speed') return isFinite(an.spd[k]) ? rampColor(an.spd[k] / Math.max(1, an.maxV)) : '#3b4753';
    return rampColor((trk.py[k] - trk.minY) / Math.max(5, trk.maxY - trk.minY));
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function drawBoard() {
    const r = sizeCanvas(board); BV.w = r.w; BV.h = r.h; BV.dpr = r.dpr;
    const g = bg; g.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    g.fillStyle = COL.board; g.fillRect(0, 0, BV.w, BV.h);
    if (!trk) return;
    if (S.cam === 'top') drawTop(g); else drawSide(g);
    boardDirty = false;
  }
  function drawSide(g) {
    const stepX = niceStep(70 / BV.sc), stepY = niceStep(46 / (BV.sc * S.vex));
    g.lineWidth = 1; g.font = '10px ' + C('--f-mono'); g.textBaseline = 'middle';
    const xa = Math.floor(fromScreen(0, 0)[0] / stepX) * stepX, xb = fromScreen(BV.w, 0)[0];
    for (let x = xa; x <= xb; x += stepX) { const X = Math.round(sx(x)) + 0.5; const major = Math.round(x / stepX) % 5 === 0; g.strokeStyle = major ? COL.grid2 : COL.grid; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, BV.h); g.stroke(); }
    const yTop = fromScreen(0, 0)[1];
    for (let y = 0; y <= yTop; y += stepY) { const Y = Math.round(sy(y)) + 0.5; const major = Math.round(y / stepY) % 5 === 0; g.strokeStyle = major ? COL.grid2 : COL.grid; g.beginPath(); g.moveTo(0, Y); g.lineTo(BV.w, Y); g.stroke(); }
    const gy = sy(0);
    // the ground (and any water) under the track, as the 3D world reports it
    const gnd = trk.ground, last = trk.nm - 1;
    if (gnd) {
      g.beginPath(); g.moveTo(0, BV.h); g.lineTo(0, sy(gnd[0])); for (let k = 0; k <= last; k += 2) g.lineTo(sx(trk.profX[k]), sy(gnd[k]));
      g.lineTo(sx(trk.profX[last]), sy(gnd[last])); g.lineTo(BV.w, sy(gnd[last])); g.lineTo(BV.w, BV.h); g.closePath();
      g.fillStyle = 'rgba(28,46,30,0.55)'; g.fill();
      g.strokeStyle = '#3c5a3a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, sy(gnd[0])); for (let k = 0; k <= last; k += 2) g.lineTo(sx(trk.profX[k]), sy(gnd[k])); g.lineTo(BV.w, sy(gnd[last])); g.stroke();
      const wy = trk.waterY; let k = 0;
      while (k <= last) {
        if (isNaN(wy[k])) { k++; continue; } let e = k; while (e < last && !isNaN(wy[e + 1])) e++;
        g.beginPath(); for (let q = k; q <= e; q++) g.lineTo(sx(trk.profX[q]), sy(wy[q])); for (let q = e; q >= k; q--) g.lineTo(sx(trk.profX[q]), sy(gnd[q])); g.closePath();
        g.fillStyle = 'rgba(40,140,190,0.32)'; g.fill(); g.strokeStyle = 'rgba(110,200,240,0.8)'; g.lineWidth = 1.2; g.beginPath(); for (let q = k; q <= e; q++) g.lineTo(sx(trk.profX[q]), sy(wy[q])); g.stroke();
        k = e + 1;
      }
    } else { g.fillStyle = 'rgba(28,46,30,0.55)'; g.fillRect(0, gy, BV.w, BV.h - gy); }
    g.fillStyle = COL.faint; g.textAlign = 'center';
    for (let x = xa; x <= xb; x += stepX) if (x >= 0) g.fillText(Math.round(x) + ' m', sx(x), gy + 14);
    g.textAlign = 'left';
    for (let y = stepY; y <= yTop; y += stepY) g.fillText(Math.round(y) + ' m', 6, sy(y) - 7);
    const st0 = sx(S.nodes[0].x), st1 = sx(trk.profX[Math.min(trk.nm - 1, Math.round(trk.stationEnd / DS))]);
    g.fillStyle = 'rgba(127,143,160,0.10)'; g.fillRect(Math.min(st0, st1), 0, Math.abs(st1 - st0), gy);
    g.fillStyle = COL.faint; g.fillText('STATION', Math.min(st0, st1) + 4, 14);
    drawTunnelsSide(g);
    g.strokeStyle = 'rgba(160,175,190,0.16)'; g.lineWidth = 1; g.beginPath();
    for (let k = 4; k < trk.nm; k += 20) if (trk.uy[k] > 0.55 && trk.type[k] !== T_STATION) { const X = sx(trk.profX[k]), Y = sy(trk.profY[k] - 0.8); g.moveTo(X, Y); g.lineTo(X, gy); }
    g.stroke();
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 7; g.beginPath();
    for (let k = 0; k < trk.nm; k++) { const X = sx(trk.profX[k]), Y = sy(trk.profY[k]); k ? g.lineTo(X, Y) : g.moveTo(X, Y); } g.stroke();
    g.lineWidth = 3.4; let k = 0;
    while (k < trk.nm - 1) {
      const col = trackColorAt(k); g.strokeStyle = col; g.beginPath(); g.moveTo(sx(trk.profX[k]), sy(trk.profY[k]));
      let e = k + 1; while (e < trk.nm - 1 && trackColorAt(e) === col) e++;
      for (let q = k + 1; q <= e; q++) g.lineTo(sx(trk.profX[q]), sy(trk.profY[q]));
      g.stroke(); k = e;
    }
    // inverted stretches dotted above the line
    g.fillStyle = '#ffd23c'; for (let q = 0; q < trk.nm; q += 8) if (trk.uy[q] < -0.3) { g.beginPath(); g.arc(sx(trk.profX[q]), sy(trk.profY[q]) - 7, 1.6, 0, 7); g.fill(); }
    segMarks(g, q => [sx(trk.profX[q]), sy(trk.profY[q])]);
    if (S.closed) { const e = trk.nm - 1; g.fillStyle = COL.muted; g.textAlign = 'left'; g.fillText('↩ return transfer to station (see Top view)', sx(trk.profX[e]) + 10, sy(trk.profY[e]) - 2); }
    if (an.stallS != null && an.stallS < trk.Lm) { const kk = Math.round(an.stallS / DS); const X = sx(trk.profX[kk]), Y = sy(trk.profY[kk]); xMark(g, X, Y, COL.crit); g.fillStyle = COL.crit; g.textAlign = 'center'; g.fillText('train stalls', X, Y - 16); }
    for (const c of clear.conflicts) { if (c.k >= trk.nm) continue; const X = sx(trk.profX[c.k]), Y = sy(trk.profY[c.k]); xMark(g, X, Y, '#ff6b5c'); }
    const callout = (s, txt, col) => { if (s == null || s > trk.Lm) return; const kk = Math.round(s / DS); const X = sx(trk.profX[kk]), Y = sy(trk.profY[kk]);
      g.fillStyle = col; g.beginPath(); g.arc(X, Y, 3.5, 0, 7); g.fill(); g.textAlign = 'center'; g.fillText(txt, X, Y + 16); };
    if (an.maxVG > 1.2) callout(an.maxVGs, an.maxVG.toFixed(1) + ' G', gColor(an.maxVG));
    if (an.minVG < 0.5) callout(an.minVGs, an.minVG.toFixed(1) + ' G', gColor(an.minVG));
    const touch = matchMedia('(pointer:coarse)').matches; const nr = clamp(BV.sc * 9, 3.5, touch ? 8 : 6.5);
    const badgeRows = [-1e9, -1e9, -1e9];
    const order = S.nodes.map((n, i) => i).sort((a, b) => S.nodes[a].x - S.nodes[b].x);
    for (const i of order) {
      const n = S.nodes[i]; const X = sx(n.x), Y = sy(n.y); const sel = i === S.sel;
      nodeDot(g, X, Y, nr, sel, n, i);
      const parts = [];
      if (n.yaw) parts.push((n.yaw > 0 ? '↱' : '↰') + Math.abs(n.yaw) + '°');
      if (n.roll) parts.push('∠' + Math.abs(n.roll) + '°');
      if (n.flip) parts.push('⟲');
      let drop = false;
      if (i > 0) { const p = S.nodes[i - 1]; const ang = Math.atan2(n.y - p.y, Math.abs(n.x - p.x)) / DEG; if (ang < -45 && n.x > p.x) { parts.push('▼' + Math.round(-ang) + '°'); drop = true; } }
      if (parts.length) {
        const txt = parts.join(' '); g.font = '600 10px ' + C('--f-mono'); const tw = g.measureText(txt).width + 12;
        let lvl = 0; while (lvl < 3 && badgeRows[lvl] > X - tw / 2 - 3) lvl++; if (lvl >= 3 && !sel) { g.font = '10px ' + C('--f-mono'); continue; } if (lvl >= 3) lvl = 2; badgeRows[lvl] = X + tw / 2;
        const bx = X - tw / 2, by = Y - nr - 24 - lvl * 19;
        g.fillStyle = drop && !n.yaw ? 'rgba(255,60,240,0.16)' : 'rgba(34,240,255,0.13)'; g.strokeStyle = drop && !n.yaw ? 'rgba(255,90,240,0.75)' : 'rgba(34,240,255,0.7)'; g.lineWidth = 1;
        roundRect(g, bx, by, tw, 16, 8); g.fill(); g.stroke();
        g.fillStyle = drop && !n.yaw ? '#ffc2fb' : '#bff9ff'; g.textAlign = 'center'; g.fillText(txt, X, by + 8.5); g.font = '10px ' + C('--f-mono');
      }
    }
    for (const st of trains) {
      if (st.s > trk.Lm + 0.01) continue;
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); let first = true;
      for (let s = Math.max(0, st.s - TRAIN.len); s <= st.s; s += 1) { const kk = Math.min(trk.nm - 1, Math.round(s / DS)); const X = sx(trk.profX[kk]), Y = sy(trk.profY[kk]); first ? g.moveTo(X, Y) : g.lineTo(X, Y); first = false; }
      g.stroke(); const kk = Math.min(trk.nm - 1, Math.round(st.s / DS));
      g.fillStyle = COL.signal; g.beginPath(); g.arc(sx(trk.profX[kk]), sy(trk.profY[kk]), 5, 0, 7); g.fill();
    }
  }
  // tunnels in the side view: a shell drawn around the riders' clearance circle, coloured by kind, with the portals
  const TUN_COL = ['', '201,160,99', '160,150,138', '64,196,230', '150,175,95'];
  function selTunnel() { if (!trk || !trk.tunnels) return null; return trk.tunnels.find(t => t.nodes.includes(S.sel)) || null; }
  function drawTunnelsSide(g) {
    if (!trk.tunRuns) return; const env = trk.tunEnv, sel = selTunnel();
    for (const r of trk.tunRuns) {
      if (r.a >= trk.nm) continue; const b = Math.min(r.b, trk.nm - 1), col = TUN_COL[r.kind];
      const tn = trk.tunnels.find(t => r.a >= t.a && r.a <= t.b), hot = tn && tn === sel;
      const top = k => trk.profY[k] + env.uc + (tn ? tn.rout : env.rc + 0.5), bot = k => trk.profY[k] - 0.9;
      g.beginPath(); for (let k = r.a; k <= b; k++) g.lineTo(sx(trk.profX[k]), sy(top(k))); for (let k = b; k >= r.a; k--) g.lineTo(sx(trk.profX[k]), sy(bot(k))); g.closePath();
      g.fillStyle = `rgba(${col},${r.kind === TUN.TRENCH ? 0.1 : hot ? 0.34 : 0.2})`; g.fill();
      g.strokeStyle = `rgba(${col},${hot ? 1 : 0.7})`; g.lineWidth = hot ? 2 : 1.3; if (r.kind === TUN.TRENCH) g.setLineDash([4, 4]);
      g.beginPath(); for (let k = r.a; k <= b; k++) g.lineTo(sx(trk.profX[k]), sy(top(k))); g.stroke(); g.setLineDash([]);
      const m = Math.round((r.a + b) / 2), w = sx(trk.profX[b]) - sx(trk.profX[r.a]);
      if (w > 70) { g.fillStyle = `rgba(${col},0.95)`; g.textAlign = 'center'; g.fillText(`${TUN_NAME[r.kind]} ${Math.round((b - r.a + 1) * DS)} m`, sx(trk.profX[m]), sy(top(m)) - 9); }
    }
    for (const tn of trk.tunnels) for (const p of tn.portals) {
      const k = Math.min(trk.nm - 1, Math.round(p.s / DS)); if (p.inner || p.s > trk.Lm) continue;
      const X = sx(trk.profX[k]), y0 = sy(trk.profY[k] - 1.2), y1 = sy(trk.profY[k] + env.uc + tn.rout + 0.8);
      g.strokeStyle = `rgba(${TUN_COL[p.kind]},1)`; g.lineWidth = 4; g.beginPath(); g.moveTo(X, y0); g.lineTo(X, y1); g.stroke();
    }
  }
  // water seen from above, sampled once per track/scenery around the layout
  let waterCache = null;
  function waterGrid() {
    if (!trk || !World || !World.probe) return null; const b = trk.bounds, key = [Math.round(b.x0), Math.round(b.x1), Math.round(b.z0), Math.round(b.z1), World.env.scenery].join();
    if (waterCache && waterCache.key === key) return waterCache;
    const st = 4, x0 = b.x0 - 120, z0 = b.z0 - 120, nx = Math.ceil((b.x1 - b.x0 + 240) / st), nz = Math.ceil((b.z1 - b.z0 + 240) / st), cells = [];
    if (nx * nz < 60000) for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) { const x = x0 + i * st, z = z0 + j * st; if (World.probe.water(x, z) != null) cells.push(x, z); }
    return (waterCache = { key, cells, st });
  }
  function nodeDot(g, X, Y, nr, sel, n, i) {
    const tc = { station: '#8b9aab', chain: '#e3e8ec', cable: '#e3e8ec', tirelift: '#e3e8ec', launch: '#ff9f43', tires: '#c7b26a', trim: '#d39a52', block: '#e07b3c', brakes: '#d39a52' }[n.type] || COL.vg;
    g.beginPath(); g.arc(X, Y, sel ? nr + 2.5 : nr, 0, Math.PI * 2);
    g.fillStyle = sel ? COL.signal : COL.board; g.fill(); g.lineWidth = 2.4; g.strokeStyle = sel ? '#fff3d6' : tc; g.stroke();
    if (sel) { g.fillStyle = COL.signal; g.textAlign = 'center'; g.font = '600 11px ' + C('--f-mono'); g.fillText('#' + i, X, Y + nr + 14); g.font = '10px ' + C('--f-mono'); }
  }
  function xMark(g, X, Y, col) { g.strokeStyle = col; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X - 7, Y - 7); g.lineTo(X + 7, Y + 7); g.moveTo(X + 7, Y - 7); g.lineTo(X - 7, Y + 7); g.stroke(); }
  function segMarks(g, at) {
    for (let q = 0; q < trk.nm; q += 6) {
      const t = trk.type[q]; if (t === T_STEEL || t === T_STATION) continue;
      const [X, Y] = at(q);
      g.fillStyle = isLiftCode(t) ? '#e3e8ec' : t === T_LAUNCH ? '#ff9f43' : t === T_TIRES ? '#c7b26a' : '#d39a52'; g.fillRect(X - 1.5, Y - 1.5, 3, 3);
    }
  }
  function drawTop(g) {
    if (!plan) plan = planNodes(S.nodes);
    // grid
    const step = niceStep(80 / TV.sc); g.lineWidth = 1; g.font = '10px ' + C('--f-mono'); g.textBaseline = 'middle';
    const [x0, z0] = fromTop(0, 0), [x1, z1] = fromTop(BV.w, BV.h);
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const X = Math.round(tx(x)) + 0.5; g.strokeStyle = Math.round(x / step) % 5 === 0 ? COL.grid2 : COL.grid; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, BV.h); g.stroke(); }
    for (let z = Math.floor(z0 / step) * step; z <= z1; z += step) { const Y = Math.round(tz(z)) + 0.5; g.strokeStyle = Math.round(z / step) % 5 === 0 ? COL.grid2 : COL.grid; g.beginPath(); g.moveTo(0, Y); g.lineTo(BV.w, Y); g.stroke(); }
    // scale bar + north
    const bar = niceStep(120 / TV.sc), bw = bar * TV.sc; g.strokeStyle = COL.muted; g.lineWidth = 2; g.beginPath(); g.moveTo(14, BV.h - 70); g.lineTo(14 + bw, BV.h - 70); g.stroke();
    g.fillStyle = COL.muted; g.textAlign = 'left'; g.fillText(bar + ' m', 18 + bw, BV.h - 70);
    const nY = BV.w < 760 ? 100 : 60; g.textAlign = 'center'; g.fillText('N', BV.w - 22, nY); g.beginPath(); g.moveTo(BV.w - 22, nY + 8); g.lineTo(BV.w - 27, nY + 22); g.lineTo(BV.w - 17, nY + 22); g.closePath(); g.fill();
    // height shadow: supports as dots, track outline
    g.lineJoin = 'round'; g.lineCap = 'round';
    const drawPath = (a, b, width, style) => { g.strokeStyle = style; g.lineWidth = width; g.beginPath(); for (let k = a; k <= b; k++) { const X = tx(trk.px[k]), Y = tz(trk.pz[k]); k === a ? g.moveTo(X, Y) : g.lineTo(X, Y); } g.stroke(); };
    // return transfer
    if (S.closed && trk.n > trk.nm) {
      g.setLineDash([7, 6]); drawPath(trk.nm - 1, trk.n - 1, 3, 'rgba(160,175,190,0.75)'); g.setLineDash([]);
      const mk = trk.nm + Math.floor((trk.n - trk.nm) / 2); g.fillStyle = COL.muted; g.textAlign = 'center'; g.fillText('return transfer ' + Math.round((trk.n - trk.nm) * DS) + ' m', tx(trk.px[mk]), tz(trk.pz[mk]) - 12);
      const lastX = tx(trk.px[trk.n - 1]), lastY = tz(trk.pz[trk.n - 1]); g.beginPath(); g.moveTo(lastX, lastY); g.lineTo(tx(trk.px[0]), tz(trk.pz[0])); g.stroke();
    }
    const wg = waterGrid(); if (wg && wg.cells.length) { g.fillStyle = 'rgba(40,140,190,0.22)'; const c = wg.cells, w = wg.st * TV.sc + 0.6; for (let i = 0; i < c.length; i += 2) g.fillRect(tx(c[i]) - w / 2, tz(c[i + 1]) - w / 2, w, w); }
    if (trk.tunRuns) { const sel = selTunnel();
      for (const r of trk.tunRuns) { const tn = trk.tunnels.find(t => r.a >= t.a && r.a <= t.b), hot = tn && tn === sel; if (r.kind === TUN.TRENCH) g.setLineDash([5, 4]);
        drawPath(r.a, Math.min(r.b, trk.n - 1), Math.max(10, (tn ? tn.rout * 2 : 5) * TV.sc), `rgba(${TUN_COL[r.kind]},${hot ? 0.55 : 0.32})`); g.setLineDash([]); } }
    drawPath(0, trk.nm - 1, 7, 'rgba(0,0,0,0.55)');
    // draw lower sections first so overpasses read correctly
    const segs = []; for (let k = 0; k < trk.nm - 1; k += 2) segs.push(k);
    segs.sort((a, b) => trk.py[a] - trk.py[b]);
    g.lineWidth = 3.6;
    for (const k of segs) { const k2 = Math.min(trk.nm - 1, k + 2); g.strokeStyle = trackColorAt(k); g.beginPath(); g.moveTo(tx(trk.px[k]), tz(trk.pz[k])); g.lineTo(tx(trk.px[k2]), tz(trk.pz[k2])); g.stroke(); }
    g.fillStyle = '#ffd23c'; for (let q = 0; q < trk.nm; q += 8) if (trk.uy[q] < -0.3) { g.beginPath(); g.arc(tx(trk.px[q]), tz(trk.pz[q]), 1.8, 0, 7); g.fill(); }
    segMarks(g, q => [tx(trk.px[q]), tz(trk.pz[q])]);
    // station
    const sx0 = tx(trk.px[0]), sz0 = tz(trk.pz[0]), se = Math.min(trk.nm - 1, Math.round(trk.stationEnd / DS));
    g.strokeStyle = 'rgba(200,210,220,0.9)'; g.lineWidth = 9; g.globalAlpha = 0.25; g.beginPath(); g.moveTo(sx0, sz0); g.lineTo(tx(trk.px[se]), tz(trk.pz[se])); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = COL.text; g.textAlign = 'left'; g.fillText('STATION', sx0 + 10, sz0 - 10);
    // crossings and clashes
    for (const c of clear.crossings) { const X = tx(trk.px[c.k]), Y = tz(trk.pz[c.k]); g.strokeStyle = COL.ok; g.lineWidth = 1.5; g.beginPath(); g.arc(X, Y, 8, 0, 7); g.stroke(); g.fillStyle = COL.ok; g.textAlign = 'left'; g.fillText(c.dy.toFixed(0) + ' m clear', X + 11, Y - 9); }
    for (const c of clear.conflicts) { const X = tx(trk.px[c.k]), Y = tz(trk.pz[c.k]); xMark(g, X, Y, '#ff6b5c'); g.fillStyle = '#ff8d84'; g.textAlign = 'left'; g.fillText('clash ' + c.d.toFixed(1) + ' m', X + 11, Y + 10); }
    // nodes and the selected node's heading handle
    const touch = matchMedia('(pointer:coarse)').matches; const nr = touch ? 7 : 5.5;
    for (let i = 0; i < S.nodes.length; i++) {
      const X = tx(plan.x[i]), Y = tz(plan.z[i]); nodeDot(g, X, Y, nr, i === S.sel, S.nodes[i], i);
      const n = S.nodes[i]; if (n.yaw && i !== S.sel) { g.fillStyle = 'rgba(191,249,255,0.85)'; g.textAlign = 'left'; g.fillText((n.yaw > 0 ? '↱' : '↰') + Math.abs(Math.round(n.yaw)) + '°', X + 8, Y - 8); }
    }
    const h = headingHandle(); if (h && S.mode === 'build') {
      g.strokeStyle = COL.signal; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(h.nx, h.ny); g.lineTo(h.x, h.y); g.stroke(); g.setLineDash([]);
      g.fillStyle = COL.signal; g.beginPath(); g.arc(h.x, h.y, touch ? 9 : 7, 0, 7); g.fill(); g.fillStyle = COL.signalInk || '#1a1405'; g.textAlign = 'center'; g.fillText('↻', h.x, h.y + 0.5);
    }
    for (const st of trains) { const k = trk.at(st.s), k2 = trk.at(st.s - TRAIN.len); g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.beginPath(); g.moveTo(tx(trk.px[k2]), tz(trk.pz[k2])); g.lineTo(tx(trk.px[k]), tz(trk.pz[k])); g.stroke(); g.fillStyle = COL.signal; g.beginPath(); g.arc(tx(trk.px[k]), tz(trk.pz[k]), 5, 0, 7); g.fill(); }
  }
  function headingHandle() {
    if (!plan || S.sel < 1 || S.sel >= S.nodes.length) return null;
    const k = Math.min(trk.nm - 1, Math.round(trk.nodeS[S.sel] / DS)), k2 = Math.min(trk.nm - 1, k + Math.round(Math.max(4, (trk.nodeS[S.sel + 1] - trk.nodeS[S.sel] || 10) / 2) / DS));
    let dx = trk.hx[k2] - trk.hx[k], dz = trk.hz[k2] - trk.hz[k]; const l = Math.hypot(dx, dz); if (l < 1e-3) return null; dx /= l; dz /= l;
    const nx = tx(plan.x[S.sel]), ny = tz(plan.z[S.sel]);
    return { nx, ny, x: nx + dx * 46, y: ny + dz * 46, dirX: dx, dirZ: dz };
  }
  function legendHTML() {
    if (S.colorMode === 'g') return `<span><i style="background:${COL.crit}"></i>&gt;4.2 G</span><span><i style="background:${COL.signal}"></i>3–4.2</span><span><i style="background:${COL.ok}"></i>0.3–3</span><span><i style="background:#b48cff"></i>airtime</span><span><i style="background:#ff4f9a"></i>&lt;−0.5</span><span><i style="background:#ffd23c;width:6px;height:6px;border-radius:3px"></i>inverted</span>`;
    if (S.colorMode === 'speed') return `<span><i style="background:rgb(47,127,214)"></i>slow</span><span><i style="background:rgb(243,179,61)"></i>fast</span><span><i style="background:rgb(255,81,70)"></i>${Math.round(an ? an.maxV * 3.6 : 0)} km/h</span>`;
    return `<span><i style="background:rgb(47,127,214)"></i>${Math.round(trk ? trk.minY : 0)} m</span><span><i style="background:rgb(243,179,61)"></i>high</span><span><i style="background:rgb(255,81,70)"></i>${Math.round(trk ? trk.maxY : 0)} m</span>`;
  }

  // ---------- minimap ----------
  const mini = $('minimap'), mg = mini.getContext('2d');
  function drawMini() {
    if (mini.hidden || !trk) return; const r = sizeCanvas(mini); mg.setTransform(r.dpr, 0, 0, r.dpr, 0, 0); mg.clearRect(0, 0, r.w, r.h);
    const b = trk.bounds, sc = Math.min((r.w - 12) / Math.max(10, b.x1 - b.x0), (r.h - 12) / Math.max(10, b.z1 - b.z0));
    const X = x => r.w / 2 + (x - (b.x0 + b.x1) / 2) * sc, Y = z => r.h / 2 + (z - (b.z0 + b.z1) / 2) * sc;
    mg.strokeStyle = 'rgba(200,215,228,0.55)'; mg.lineWidth = 1.5; mg.beginPath();
    for (let k = 0; k < trk.n; k += 3) { const a = X(trk.px[k]), c = Y(trk.pz[k]); k ? mg.lineTo(a, c) : mg.moveTo(a, c); } mg.stroke();
    trains.forEach((st, i) => { const k = trk.at(st.s); mg.fillStyle = i === (view.train || 0) ? COL.signal : '#ffffff'; mg.beginPath(); mg.arc(X(trk.px[k]), Y(trk.pz[k]), i === (view.train || 0) ? 4 : 3, 0, 7); mg.fill(); });
  }

  // ---------- stage interaction ----------
  const ptrs = new Map(); let drag = null, lastTap = { t: 0, x: 0, y: 0 }, lastLookAt = 0;
  function hitNode(px, py) {
    const touch = matchMedia('(pointer:coarse)').matches; const R = touch ? 22 : 13; let best = -1, bd = R * R;
    if (S.cam === 'top') { if (!plan) plan = planNodes(S.nodes); S.nodes.forEach((n, i) => { const d = (tx(plan.x[i]) - px) ** 2 + (tz(plan.z[i]) - py) ** 2; if (d < bd) { bd = d; best = i; } }); }
    else S.nodes.forEach((n, i) => { const d = (sx(n.x) - px) ** 2 + (sy(n.y) - py) ** 2; if (d < bd) { bd = d; best = i; } });
    return best;
  }
  // a press on a tunnel's band in either editor selects it and shows its properties
  function tunnelHit(px, py) {
    if (!trk || !trk.tunnels || !trk.tunnels.length) return null; let best = null, bd = 1e9;
    for (const tn of trk.tunnels) for (let k = tn.a; k <= Math.min(tn.b, trk.nm - 1); k += 2) {
      let d;
      if (S.cam === 'top') d = Math.hypot(tx(trk.px[k]) - px, tz(trk.pz[k]) - py) - Math.max(5, tn.rout * TV.sc);
      else { const X = sx(trk.profX[k]), y0 = sy(trk.profY[k] - 1), y1 = sy(trk.profY[k] + trk.tunEnv.uc + tn.rout); d = Math.abs(X - px) + (py < y1 ? y1 - py : py > y0 ? py - y0 : 0) - 3; }
      if (d < bd) { bd = d; best = tn; }
    }
    return bd < 6 ? best : null;
  }
  function localXY(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.ov') && e.target.closest('.ov') !== mini) return;
    stage.setPointerCapture(e.pointerId); const [x, y] = localXY(e); ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), sc0: S.cam === 'top' ? TV.sc : BV.sc, dist0: view.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox0: S.cam === 'top' ? TV.ox : BV.ox, oy0: S.cam === 'top' ? TV.oy : BV.oy }; return; }
    if (isBoard()) {
      if (S.cam === 'top' && S.mode === 'build') { const h = headingHandle(); if (h && Math.hypot(h.x - x, h.y - y) < 16) { drag = { kind: 'heading', i: S.sel, moved: false }; return; } }
      const hit = hitNode(x, y);
      if (hit >= 0) { selectNode(hit); if (S.mode === 'build') drag = { kind: S.cam === 'top' ? 'bend' : 'node', i: hit, moved: false }; else drag = { kind: 'pan', x, y }; }
      else {
        const now = performance.now();
        const tn = tunnelHit(x, y); if (tn) { const ns = [...tn.nodes].sort((p, q) => p - q); selectNode(ns.find(i => i > 0) ?? ns[0]); if (innerWidth > 1100) $('tunSec').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        if (S.cam === 'side' && S.mode === 'build' && e.pointerType !== 'mouse' && now - lastTap.t < 330 && Math.hypot(x - lastTap.x, y - lastTap.y) < 28) { insertNodeAt(x, y); lastTap.t = 0; drag = null; return; }
        lastTap = { t: now, x, y }; drag = { kind: 'pan', x, y };
      }
    } else drag = { kind: 'look', x, y };
  });
  stage.addEventListener('pointermove', e => {
    const [x, y] = localXY(e);
    if (!ptrs.has(e.pointerId)) { if (isBoard() && e.pointerType === 'mouse') { const h = S.cam === 'top' && S.mode === 'build' ? headingHandle() : null; board.style.cursor = h && Math.hypot(h.x - x, h.y - y) < 16 ? 'grab' : hitNode(x, y) >= 0 ? (S.mode === 'build' ? 'grab' : 'pointer') : 'default'; } return; }
    const p = ptrs.get(e.pointerId); const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
    if (!drag) return;
    if (drag.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const f = d / Math.max(10, drag.d0);
      if (isBoard()) { const V = S.cam === 'top' ? TV : BV; const mx = drag.mx, my = drag.my; const sc = clamp(drag.sc0 * f, 0.02, 40); V.ox = mx - (mx - drag.ox0) * sc / drag.sc0; V.oy = my - (my - drag.oy0) * sc / drag.sc0; V.sc = sc; boardDirty = true; }
      else if (S.cam === 'follow') view.dist = clamp(drag.dist0 / f, 8, 260);
    } else if (drag.kind === 'node') {
      const n = S.nodes[drag.i]; if (!drag.moved) { beginEdit(); drag.moved = true; }
      const [wx, wy] = fromScreen(x, y); n.x = +clamp(wx, LIMITS.x[0], LIMITS.x[1]).toFixed(1); n.y = +clamp(wy, LIMITS.y[0], LIMITS.y[1]).toFixed(1); liveUpdate();
    } else if (drag.kind === 'bend') {
      if (drag.i < 1) return; if (!drag.moved) { beginEdit(); drag.moved = true; }
      bendTo(drag.i, ...fromTop(x, y)); liveUpdate(); plan = planNodes(S.nodes);
    } else if (drag.kind === 'heading') {
      if (!drag.moved) { beginEdit(); drag.moved = true; }
      const i = drag.i, h = headingHandle(); if (!h) return;
      const [wx, wz] = fromTop(x, y), want = Math.atan2(wx - plan.x[i], -(wz - plan.z[i])), cur = Math.atan2(h.dirX, -h.dirZ);
      let d = (want - cur) / DEG; while (d > 180) d -= 360; while (d < -180) d += 360;
      S.nodes[i].yaw = Math.round(clamp((S.nodes[i].yaw || 0) + d * 0.6, LIMITS.yaw[0], LIMITS.yaw[1])); liveUpdate(); plan = planNodes(S.nodes);
    } else if (drag.kind === 'pan') { const V = S.cam === 'top' ? TV : BV; V.ox += dx; V.oy += dy; boardDirty = true; }
    else if (drag.kind === 'look') {
      if (S.cam === 'pov') { view.lookYaw = clamp(view.lookYaw - dx * 0.006, -1.9, 1.9); view.lookPitch = clamp(view.lookPitch - dy * 0.005, -1.0, 0.9); lastLookAt = performance.now(); }
      else { view.az -= dx * 0.007; view.el = clamp(view.el + dy * 0.005, 0.04, 1.4); }
    }
  });
  const endPtr = e => {
    ptrs.delete(e.pointerId);
    if (drag && (drag.kind === 'node' || drag.kind === 'bend' || drag.kind === 'heading') && drag.moved) endEdit();
    if (ptrs.size === 0) drag = null; else if (drag && drag.kind === 'pinch') drag = null;
  };
  stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('dblclick', e => { if (S.cam === 'pov') { view.lookYaw = 0; view.lookPitch = 0; return; } if (S.cam !== 'side' || S.mode !== 'build') return; const [x, y] = localXY(e); if (hitNode(x, y) < 0) insertNodeAt(x, y); });
  stage.addEventListener('wheel', e => {
    if (e.target.closest('.ov')) return; e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015);
    if (isBoard()) { const V = S.cam === 'top' ? TV : BV; const [x, y] = localXY(e); const sc = clamp(V.sc * f, 0.02, 40); V.ox = x - (x - V.ox) * sc / V.sc; V.oy = y - (y - V.oy) * sc / V.sc; V.sc = sc; boardDirty = true; }
    else if (S.cam === 'follow') view.dist = clamp(view.dist / f, 8, 260);
  }, { passive: false });
  function zoomBoard(f) { const V = S.cam === 'top' ? TV : BV; const x = BV.w / 2, y = BV.h / 2; const sc = clamp(V.sc * f, 0.02, 40); V.ox = x - (x - V.ox) * sc / V.sc; V.oy = y - (y - V.oy) * sc / V.sc; V.sc = sc; boardDirty = true; }

  // ---------- top-view bending: move node i by changing the turn before it and the segment length ----------
  function bendTo(i, wx, wz) {
    const nodes = S.nodes, j = i - 1; if (j < 0) return;
    const evalP = () => { const p = planNodes(nodes, i); return [p.x[i], p.z[i]]; };
    for (let it = 0; it < 3; it++) {
      const [px0, pz0] = evalP(); const ex = wx - px0, ez = wz - pz0; if (Math.hypot(ex, ez) < 0.3) break;
      const y0 = nodes[j].yaw || 0, seg = nodes[i].x - nodes[j].x;
      nodes[j].yaw = y0 + 1; const [ax, az] = evalP(); nodes[j].yaw = y0;
      const dxL = 1; for (let q = i; q < nodes.length; q++) nodes[q].x += dxL; const [bx, bz] = evalP(); for (let q = i; q < nodes.length; q++) nodes[q].x -= dxL;
      const J = [[ax - px0, bx - px0], [az - pz0, bz - pz0]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      if (Math.abs(det) < 1e-6) break;
      let dYaw = (ex * J[1][1] - ez * J[0][1]) / det, dLen = (J[0][0] * ez - J[1][0] * ex) / det;
      dYaw = clamp(dYaw, -25, 25); dLen = clamp(dLen, -seg + 3, 60);
      nodes[j].yaw = Math.round(clamp(y0 + dYaw, LIMITS.yaw[0], LIMITS.yaw[1]) * 10) / 10;
      for (let q = i; q < nodes.length; q++) nodes[q].x = +(nodes[q].x + dLen).toFixed(2);
    }
  }
  // Route to station: bend the final turns so the track ends lined up behind the station
  function routeToStation() {
    if (S.mode === 'ride') return; if (!S.closed) { toast('Route to station is for closed circuits'); return; }
    const nodes = S.nodes.map(n => ({ ...n }));
    const st = planNodes(nodes); const h0 = st.startH;
    // goal: finish pointing along the station heading, on the station's centre line, at least 25 m behind it
    const fx = Math.sin(h0), fz = -Math.cos(h0), x0 = st.x[0], z0 = st.z[0], orig = nodes.map(n => n.yaw || 0);
    const cost = () => {
      const p = planNodes(nodes); let dh = p.endH - h0; dh = ((dh % (2 * Math.PI)) + 3 * Math.PI) % (2 * Math.PI) - Math.PI;
      const ex = p.endX - x0, ez = p.endZ - z0, along = ex * fx + ez * fz, side = ex * fz - ez * fx;
      let c = Math.abs(side) + Math.abs(dh) * 60 + Math.max(0, along + 25) * 1.5;
      for (const i of cand) c += Math.abs((nodes[i].yaw || 0) - orig[i]) * 0.08;
      return c;
    };
    const cand = []; for (let i = nodes.length - 2; i > 1 && cand.length < 6; i--) { if (nodes[i].type === 'station') break; if (nodes[i].yaw || cand.length < 3) cand.push(i); }
    if (!cand.length) { toast('Add some turns first'); return; }
    let best = cost(), stepSz = 30; const start = best;
    for (let it = 0; it < 60 && stepSz > 0.5; it++) {
      let improved = false;
      for (const i of cand) for (const sgn of [1, -1]) {
        const old = nodes[i].yaw || 0; nodes[i].yaw = clamp(old + sgn * stepSz, -175, 175);
        const c = cost(); if (c < best - 0.01) { best = c; improved = true; } else nodes[i].yaw = old;
      }
      if (!improved) stepSz /= 2;
    }
    if (start < 12) { toast('The track already lines up with the station'); return; }
    const before = { clashes: clear.conflicts.length, hi: an.maxVG, lat: an.maxLG }, saved = JSON.stringify(S.nodes);
    pushHistory();
    for (const i of cand) { S.nodes[i].yaw = Math.round(nodes[i].yaw); S.nodes[i].roll = 0; }
    rebuild(true);
    for (const i of cand) if (S.nodes[i].yaw) S.nodes[i].roll = autoBankFor(S.nodes, i, trk, an);
    rebuild(true);
    const worse = clear.conflicts.length > before.clashes || (an.maxVG > 4.2 && an.maxVG > before.hi + 0.2) || (an.maxLG > 1.8 && an.maxLG > before.lat + 0.2);
    if (worse || best > start * 0.8) {
      S.nodes = JSON.parse(saved); undoStack.pop(); updUndo(); rebuild(true); boardDirty = true;
      toast('The last turns can’t line up with the station without getting too tight. Add a turnaround near the end, then try again.', null, null, 5200); return;
    }
    commit(); toast(best < 12 ? 'The track now lines up with the station' : 'Closer to the station. A turnaround near the end would line it up fully.', 'Undo', undo, 4200);
  }

  // ---------- node editing ----------
  function selectNode(i) { S.sel = clamp(i, 0, S.nodes.length - 1); refreshInspector(); boardDirty = true; }
  function insertNodeAt(px, py) {
    const [wx, wy] = fromScreen(px, py); let best = 0, bd = 1e18;
    for (let k = 0; k < trk.nm; k++) { const d = (sx(trk.profX[k]) - px) ** 2 + (sy(trk.profY[k]) - py) ** 2; if (d < bd) { bd = d; best = k; } }
    const seg = clamp(Math.floor(trk.u[best]), 0, S.nodes.length - 2);
    pushHistory();
    const nextType = S.nodes[seg + 1].type === 'station' ? 'steel' : S.nodes[seg + 1].type;
    S.nodes.splice(seg + 1, 0, { x: +wx.toFixed(1), y: +clamp(wy, 0, LIMITS.y[1]).toFixed(1), yaw: 0, roll: 0, type: nextType });
    S.sel = seg + 1; commit(); toast(`Node #${seg + 1} added`);
  }
  function appendNode() {
    if (S.mode === 'ride') return; pushHistory(); const l = S.nodes[S.nodes.length - 1];
    S.nodes.push({ x: +(l.x + 30).toFixed(1), y: l.y, yaw: 0, roll: 0, type: l.type === 'station' ? 'steel' : l.type }); S.sel = S.nodes.length - 1; commit(); ensureVisible();
  }
  function deleteNode() {
    if (S.mode === 'ride') return; if (S.nodes.length <= 2) { toast('A track needs at least 2 nodes'); return; }
    pushHistory(); S.nodes.splice(S.sel, 1); S.sel = Math.min(S.sel, S.nodes.length - 1); commit(); toast('Node deleted', 'Undo', undo);
  }
  function insertElement(kind) {
    if (S.mode === 'ride') return;
    const el = ELEMENT_BY_KEY[kind]; const k = S.sel; const kk = Math.min(trk.nm - 1, Math.round(trk.nodeS[k] / DS));
    const v = an && isFinite(an.spd[kk]) ? an.spd[kk] : energySpeed(S.nodes, k);
    pushHistory();
    const r = spliceElement(S.nodes, k, kind, v, S.dir);
    if (!r.added) { undoStack.pop(); updUndo(); toast(r.msg || 'Not enough height or speed here for that element'); return; }
    S.nodes = r.nodes; S.sel = k + r.added; commit();
    const warn = an.stallS != null ? ' · the train now stalls, check the Design check' : '';
    toast(`${el.label}${el.dir ? (S.dir < 0 ? ' (left)' : ' (right)') : ''} added · track shifted ${Math.round(r.span)} m${warn}`, 'Undo', undo, 4200); ensureVisible();
  }
  function ensureVisible() { if (S.cam !== 'side') { boardDirty = true; return; } const n = S.nodes[S.sel]; const X = sx(n.x), Y = sy(n.y); if (X < 20 || X > BV.w - 20 || Y < 20 || Y > BV.h - 20) fitBoard(); }

  // ---------- element palette ----------
  function renderPalette() {
    $('catTabs').innerHTML = ELEMENT_CATS.map(([k, l]) => `<button role="tab" data-cat="${k}" aria-selected="${k === S.cat}">${l}</button>`).join('');
    const list = ELEMENTS.filter(e => e.cat === S.cat);
    $('elGrid').innerHTML = list.map(e => `<button class="elbtn" data-el="${e.key}" title="${esc(e.tip)}"><span>${esc(e.label)}</span>${e.dir ? '<i class="dirmark" aria-hidden="true">⇆</i>' : ''}</button>`).join('');
    $('dirRow').hidden = !list.some(e => e.dir);
    $('dirL').setAttribute('aria-pressed', String(S.dir < 0)); $('dirR').setAttribute('aria-pressed', String(S.dir > 0));
    const hints = { hills: 'Shapes are sized for the speed the train has at the selected node.', turns: 'Turns are banked for the predicted speed. Check the Top view to see where they lead.', inversions: 'Inversions roll around the riders’ heartline. Reversing elements send the track back the way it came.', power: 'Lifts and launches add energy. Launch speed and lift speed can be changed in the inspector.', brakes: 'Block brakes let more than one train run safely. Set the number of trains in Design.' };
    $('elHint').textContent = hints[S.cat] || '';
    document.querySelectorAll('#elGrid .elbtn').forEach(b => b.disabled = S.mode === 'ride');
  }
  $('catTabs').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; S.cat = b.dataset.cat; renderPalette(); savePrefs(); });
  $('elGrid').addEventListener('click', e => { const b = e.target.closest('.elbtn'); if (b && b.dataset.el) insertElement(b.dataset.el); });
  $('dirL').onclick = () => { S.dir = -1; renderPalette(); savePrefs(); }; $('dirR').onclick = () => { S.dir = 1; renderPalette(); savePrefs(); };

  // ---------- inspector ----------
  $('fType').innerHTML = SEGMENTS.map(s => `<option value="${s.key}">${s.label}</option>`).join('');
  const F = { x: ['fX', 'fXn'], y: ['fY', 'fYn'], yaw: ['fYaw', 'fYawn'], roll: ['fRoll', 'fRolln'] };
  const LIM = { x: LIMITS.x, y: LIMITS.y, yaw: LIMITS.yaw, roll: [-180, 180] };
  function refreshInspector(light) {
    const n = S.nodes[S.sel]; if (!n) return;
    $('nIdx').textContent = S.sel; $('nCount').textContent = S.nodes.length - 1; $('insTag').textContent = `after node #${S.sel}`;
    let maxX = 0; for (const q of S.nodes) maxX = Math.max(maxX, q.x); $('fX').max = Math.max(1400, Math.ceil((maxX + 200) / 100) * 100);
    for (const key in F) { const [r, num] = F[key]; const v = n[key] || 0; if (document.activeElement !== $(r)) $(r).value = v; if (document.activeElement !== $(num)) $(num).value = v; }
    if (!light) {
      $('fType').value = n.type || 'steel';
      const sg = SEG_BY_KEY[n.type] || SEG_BY_KEY.steel, sp = n.spd != null ? n.spd : sg.spd;
      $('fSpdRow').hidden = sg.spd == null; $('fSpdLbl').textContent = sg.lift ? 'Lift speed' : n.type === 'launch' ? 'Launch to' : n.type === 'trim' ? 'Trim to' : 'Push at';
      if (sg.spd != null) { $('fSpd').value = sp; $('fSpdn').value = sp; }
      $('fSysRow').hidden = n.type !== 'launch'; $('fSys').value = n.sys || 'lsm';
      $('fHoldRow').hidden = n.type !== 'block'; $('fHold').value = n.hold || 0; $('fHoldn').value = n.hold || 0;
      $('fTunnel').checked = !!n.tunnel; $('fFlip').checked = !!n.flip;
      refreshTunnel();
      $('nPrev').disabled = S.sel <= 0; $('nNext').disabled = S.sel >= S.nodes.length - 1; $('nDel').disabled = S.nodes.length <= 2;
    }
  }
  for (const key in F) {
    const [r, num] = F[key];
    const apply = val => { const n = S.nodes[S.sel]; let v = parseFloat(val); if (!isFinite(v)) return; v = clamp(v, LIM[key][0], LIM[key][1]); n[key] = v; liveUpdate(); };
    $(r).addEventListener('input', () => { if (S.mode === 'ride') return; beginEdit(); apply($(r).value); $(num).value = $(r).value; });
    $(r).addEventListener('change', () => endEdit());
    $(num).addEventListener('change', () => { if (S.mode === 'ride') return; beginEdit(); apply($(num).value); endEdit(); });
  }
  const nodeEdit = fn => { if (S.mode === 'ride') return; pushHistory(); fn(S.nodes[S.sel]); commit(); };
  $('yawQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) nodeEdit(n => { n.yaw = +b.dataset.y; }); });
  $('rollQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) nodeEdit(n => { n.roll = +b.dataset.r; }); });
  $('fType').onchange = () => nodeEdit(n => { n.type = $('fType').value; delete n.spd; delete n.sys; delete n.hold; if (n.type === 'launch') n.sys = 'lsm'; });
  const spdApply = v => nodeEdit(n => { n.spd = clamp(Math.round(+v), 3, 260); });
  $('fSpd').onchange = () => spdApply($('fSpd').value); $('fSpd').oninput = () => { $('fSpdn').value = $('fSpd').value; }; $('fSpdn').onchange = () => spdApply($('fSpdn').value);
  $('fSys').onchange = () => nodeEdit(n => { n.sys = $('fSys').value; });
  const holdApply = v => nodeEdit(n => { n.hold = clamp(+v, 0, 20); });
  $('fHold').onchange = () => holdApply($('fHold').value); $('fHold').oninput = () => { $('fHoldn').value = $('fHold').value; }; $('fHoldn').onchange = () => holdApply($('fHoldn').value);
  $('fTunnel').onchange = () => nodeEdit(n => { if ($('fTunnel').checked) n.tunnel = true; else delete n.tunnel; });
  // ---------- tunnel properties: shown when the selected node's incoming segment lies in a tunnel ----------
  function refreshTunnel() {
    const tn = selTunnel(); $('tunSec').hidden = !tn; if (!tn) return; const P = tn.props;
    const kinds = tn.kinds.map(k => `<i style="background:rgb(${TUN_COL[k]})"></i>${TUN_NAME[k]}`).join(' → ');
    const ns = [...tn.nodes].sort((a, b) => a - b), entries = tn.portals.filter(p => !p.inner);
    $('tunTag').textContent = `${Math.round(tn.len)} m`;
    $('tunSum').innerHTML = `${kinds}<br>Portals at <b>${entries.map(p => Math.round(p.s) + ' m').join('</b> and <b>')}</b> · nodes #${ns[0]}–#${ns[ns.length - 1]}`;
    const segSet = (id, v) => $(id).querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
    segSet('tunLight', P.light); segSet('tunStyle', P.style); segSet('tunShell', P.shell); segSet('tunFit', P.fit);
    $('tunStyleRow').hidden = !tn.kinds.includes(TUN.ABOVE); $('tunShellRow').hidden = !tn.kinds.includes(TUN.WATER);
    $('tunFog').checked = !!P.fog; $('tunSpray').checked = !!P.spray; $('tunDust').checked = !!P.dust; $('tunEcho').checked = P.echo !== false; $('tunSfx').value = P.sfx || 'none';
    $('tunGap').textContent = `${(tn.gap != null && isFinite(tn.gap) ? tn.gap : tn.rin - trk.tunEnv.rc).toFixed(2)} m to reach`;
    $('tunHint').textContent = tn.kinds.includes(TUN.WATER) || tn.kinds.includes(TUN.UNDER) ? 'Underground and underwater sections follow the terrain: lower the track below the ground or into the lake to make one. Settings apply to the whole tunnel.' : 'Settings apply to the whole tunnel. Untick “Covered tunnel” on its nodes to remove it.';
    $('tunSec').querySelectorAll('button, input, select').forEach(el => el.disabled = S.mode === 'ride');
  }
  function tunEdit(fn, msg) {
    if (S.mode === 'ride') return; const tn = selTunnel(); if (!tn) return;
    pushHistory(); const P = { ...tn.props }; fn(P); const clean = cleanTun(P);
    for (const i of tn.nodes) { const n = S.nodes[i]; if (!n) continue; if (clean) n.tun = { ...clean }; else delete n.tun; }
    commit(); if (msg) toast(msg);
  }
  for (const [id, key] of [['tunLight', 'light'], ['tunStyle', 'style'], ['tunShell', 'shell'], ['tunFit', 'fit']])
    $(id).addEventListener('click', e => { const b = e.target.closest('button'); if (b) tunEdit(P => { P[key] = b.dataset.v; }); });
  for (const [id, key] of [['tunFog', 'fog'], ['tunSpray', 'spray'], ['tunDust', 'dust'], ['tunEcho', 'echo']]) $(id).onchange = () => tunEdit(P => { P[key] = $(id).checked; });
  $('tunSfx').onchange = () => tunEdit(P => { P.sfx = $('tunSfx').value; }, $('tunSfx').value !== 'none' ? 'The effect plays as the train enters the tunnel (sound on)' : null);
  $('fFlip').onchange = () => nodeEdit(n => { if ($('fFlip').checked) n.flip = true; else delete n.flip; });
  $('bAutoBank').onclick = () => { if (S.mode === 'ride') return; const n = S.nodes[S.sel]; if (!n.yaw) { toast('This node has no turn. Set a turn angle first.'); return; } pushHistory(); n.roll = autoBankFor(S.nodes, S.sel, trk, an); commit(); toast(`Banked to ${Math.abs(n.roll)}° for the predicted speed`); };
  $('bAlign').onclick = () => { if (S.mode === 'ride') return; pushHistory(); const l = S.nodes[S.nodes.length - 1]; l.y = S.nodes[0].y; S.sel = S.nodes.length - 1; commit(); toast('Final node levelled with the station'); };
  $('nPrev').onclick = () => selectNode(S.sel - 1); $('nNext').onclick = () => selectNode(S.sel + 1); $('nDel').onclick = deleteNode;
  $('bAppend').onclick = appendNode;

  // ---------- design check ----------
  function refreshCheck() {
    if (!an) return; const row = (k, v, cls = '') => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`;
    const body = v => TRAIN.prone ? -v : v;
    const cg = v => v > 5.5 ? 'bad' : v > 4.2 ? 'warn' : 'good';
    const hi = TRAIN.prone ? Math.max(body(an.maxVG), body(an.minVG)) : an.maxVG, lo = TRAIN.prone ? Math.min(body(an.maxVG), body(an.minVG)) : an.minVG;
    const blocks = trk.closed ? trk.blocks.length : 1;
    $('check').innerHTML = row('Track length', `${Math.round(trk.Lm)} m${S.closed ? ` + ${Math.round(trk.L - trk.Lm)} m return` : ''}`) + row('Height', `${trk.maxY.toFixed(1)} m`) +
      row('Top speed', `${Math.round(an.maxV * 3.6)} km/h`) + row(TRAIN.prone ? 'Peak G (into seat)' : 'Peak vertical G', `${hi.toFixed(2)} G`, cg(hi)) +
      row('Lowest vertical G', `${lo.toFixed(2)} G`, lo < -1.5 ? 'bad' : lo < -0.8 ? 'warn' : 'good') + row('Peak lateral G', `${an.maxLG.toFixed(2)} G`, an.maxLG > 1.8 ? 'warn' : 'good') +
      row('Inversions', an.inversions) + row('Airtime', `${an.airtime.toFixed(1)} s`) + row('Ride time', `${Math.round(an.duration)} s`) +
      row('Block sections', S.closed ? `${blocks} · up to ${maxTrainsFor(trk)} train${maxTrainsFor(trk) > 1 ? 's' : ''}` : 'shuttle, 1 train') +
      row('Track clashes', clear.conflicts.length, clear.conflicts.length ? 'bad' : 'good') + row('Crossovers', clear.crossings.length) + tunnelRows(row);
    let note = '';
    if (an.stallS != null) { let j = 0; for (let i = 0; i < trk.nodeS.length; i++) if (trk.nodeS[i] <= an.stallS) j = i; note = `<div class="note">The train runs out of energy near ${Math.round(an.stallS)} m (after node #${j}). Lower the hill ahead of it or add a lift or launch.</div>`; }
    else if (clear.conflicts.length) note = `<div class="note">Part of the track runs through another part. Bend it away in the Top view or raise one section above the other.</div>`;
    else if (hi > 5.5 || lo < -1.5) note = `<div class="note">Some forces exceed rider limits. The orange and red sections show where to open up the curve.</div>`;
    else note = `<div class="note ok">The train completes the ${S.closed ? 'circuit' : 'run'} with forces inside rider limits.</div>`;
    $('checkNote').innerHTML = note;
    $('clashList').innerHTML = clear.conflicts.slice(0, 5).map((c, i) => `<button class="clash" data-i="${i}">Clash at ${Math.round(c.s)} m and ${Math.round(c.s2)} m · ${c.d.toFixed(1)} m apart <b>Show</b></button>`).join('');
  }
  function tunnelRows(row) {
    let out = ''; const R = an.ratings;
    if (trk.tunnels && trk.tunnels.length) {
      out += row('Tunnels', `${trk.tunnels.length} · ${Math.round(trk.tunnels.reduce((a, t) => a + t.len, 0))} m`);
      const gap = Math.min(...trk.tunnels.map(t => t.gap != null && isFinite(t.gap) ? t.gap : t.rin - trk.tunEnv.rc));
      if (isFinite(gap)) out += row('Tunnel wall clearance', `${gap.toFixed(2)} m`, gap < 0.05 ? 'bad' : gap < 0.25 ? 'warn' : 'good');
    }
    if (R) { const cls = v => v > 9 ? 'bad' : v > 7 ? 'warn' : '';
      out += row('Excitement', `${R.excitement.toFixed(2)} · ${ratingLabel(R.excitement)}`) + row('Intensity', `${R.intensity.toFixed(2)} · ${ratingLabel(R.intensity)}`, cls(R.intensity)) + row('Nausea', `${R.nausea.toFixed(2)} · ${ratingLabel(R.nausea)}`, cls(R.nausea)); }
    return out;
  }
  $('clashList').addEventListener('click', e => {
    const b = e.target.closest('.clash'); if (!b) return; const c = clear.conflicts[+b.dataset.i]; if (!c) return;
    let j = 0; for (let i = 0; i < trk.nodeS.length; i++) if (trk.nodeS[i] <= c.s) j = i;
    selectNode(j); setCam('top'); TV.sc = Math.max(TV.sc, 2.2); TV.ox = BV.w / 2 - trk.px[c.k] * TV.sc; TV.oy = BV.h / 2 - trk.pz[c.k] * TV.sc; boardDirty = true;
  });

  // ---------- telemetry ----------
  const peaks = { max: 1, min: 1, lat: 0, spd: 0 };
  function resetPeaks() { peaks.max = 1; peaks.min = 1; peaks.lat = 0; peaks.spd = 0; }
  const scopeBuf = { vg: new Float32Array(600), lg: new Float32Array(600), i: 0 };
  scopeBuf.vg.fill(1);
  const scope = $('scope'), sg = scope.getContext('2d');
  function drawScope() {
    const r = sizeCanvas(scope); const W = r.w, H = r.h; sg.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    sg.fillStyle = COL.board; sg.fillRect(0, 0, W, H);
    const gmin = -2, gmax = 6; const Y = g => 6 + (gmax - g) / (gmax - gmin) * (H - 12);
    sg.font = '9.5px ' + C('--f-mono'); sg.textBaseline = 'middle'; sg.textAlign = 'right';
    for (let g = gmin; g <= gmax; g++) { sg.strokeStyle = g === 0 || g === 1 ? COL.grid2 : COL.grid; sg.lineWidth = 1; sg.beginPath(); sg.moveTo(26, Math.round(Y(g)) + 0.5); sg.lineTo(W, Math.round(Y(g)) + 0.5); sg.stroke(); if (g % 2 === 0) { sg.fillStyle = COL.faint; sg.fillText(g + 'G', 22, Y(g)); } }
    sg.setLineDash([4, 4]); sg.strokeStyle = 'rgba(255,81,70,0.7)';
    for (const g of [4.2, -1.5]) { sg.beginPath(); sg.moveTo(26, Y(g)); sg.lineTo(W, Y(g)); sg.stroke(); }
    sg.setLineDash([]);
    const N = scopeBuf.vg.length; const dx = (W - 28) / (N - 1);
    for (const [arr, col] of [[scopeBuf.lg, COL.lg], [scopeBuf.vg, COL.vg]]) {
      sg.strokeStyle = col; sg.lineWidth = 1.6; sg.beginPath();
      for (let j = 0; j < N; j++) { const v = clamp(arr[(scopeBuf.i + j) % N], gmin, gmax); const X = 27 + j * dx, YY = Y(v); j ? sg.lineTo(X, YY) : sg.moveTo(X, YY); }
      sg.stroke();
    }
    const last = (scopeBuf.i - 1 + N) % N; sg.fillStyle = COL.vg; sg.beginPath(); sg.arc(W - 1.5, Y(clamp(scopeBuf.vg[last], gmin, gmax)), 3, 0, 7); sg.fill();
  }
  const alertS = { dismissed: {}, shown: null };
  function showBanner(lv, vg, lg, s) {
    if (!S.alerts || alertS.dismissed[lv.code]) return;
    if (alertS.shown && alertS.shown.sev > lv.sev && !$('banner').hidden) return;
    alertS.shown = lv; const b = $('banner'); b.hidden = false; b.classList.toggle('amber', lv.sev < 3);
    $('banT').textContent = lv.label;
    const what = lv.code === 'lateral' ? `${Math.abs(lg).toFixed(1)} G sideways` : `${vg.toFixed(1)} G vertical`;
    const fix = lv.code === 'lateral' ? 'Bank this turn more (try Auto-bank).' : lv.code === 'redout' ? 'Round off the crest or slow the train.' : 'Open up the curve or reduce speed here.';
    $('banD').textContent = `${what} at ${Math.round(s)} m. ${fix}`;
  }
  $('banClear').onclick = () => { resetPeaks(); alertS.dismissed = {}; alertS.shown = null; $('banner').hidden = true; };
  function setAlerts(on) { S.alerts = on; $('fAlerts').checked = on; if (!on) { $('banner').hidden = true; alertS.shown = null; } savePrefs(); }
  $('fAlerts').onchange = () => { setAlerts($('fAlerts').checked); toast($('fAlerts').checked ? 'Physics warnings on' : 'Physics warnings off. The safety status still shows in the telemetry panel.'); };
  $('banOff').onclick = () => { setAlerts(false); toast('Physics warnings off. Turn them back on in the telemetry panel.'); };
  $('banX').onclick = () => { if (alertS.shown) alertS.dismissed[alertS.shown.code] = true; alertS.shown = null; $('banner').hidden = true; };
  const forces = []; const gs = { vg: 1, lg: 0 };
  let teleT = 0, scopeT = 0, perfT = 0;
  function updTelemetry() {
    const st = trains[view.train || 0] || trains[0]; if (!st) return;
    const s = st.s, v = Math.abs(st.v), y = trk.get(trk.py, s), typ = trk.typeAt(s);
    $('tSpd').innerHTML = `${Math.round(v * 3.6)}<small>km/h</small>`; $('tAlt').innerHTML = `${y.toFixed(1)}<small>m</small>`;
    $('tVg').textContent = gs.vg.toFixed(2); $('tLg').textContent = gs.lg.toFixed(2);
    $('pMax').textContent = peaks.max.toFixed(2); $('pMin').textContent = peaks.min.toFixed(2); $('pLat').textContent = peaks.lat.toFixed(2); $('pSpd').textContent = Math.round(peaks.spd * 3.6);
    $('lapN').textContent = st.lap; $('trainLbl').textContent = trains.length > 1 ? `Train ${(view.train || 0) + 1} of ${trains.length} · ` : '';
    const lv = st.phase === 'run' ? safetyLevel(gs.vg, gs.lg) : { code: 'safe', label: 'SAFE', sev: 0 };
    const pill = $('safety'); pill.textContent = lv.label; pill.className = 'pill' + (lv.sev >= 3 ? ' crit' : lv.sev > 0 ? ' warn' : '');
    const m = TRAIN.mass, ke = 0.5 * m * v * v / 1000, pe = m * G * (y - trk.minY) / 1000;
    const eRef = Math.max(1, Math.max(m * G * (trk.maxY - trk.minY), 0.5 * m * (an.maxV ** 2)) / 1000 * 1.1);
    $('keV').textContent = `${Math.round(ke).toLocaleString()} kJ`; $('peV').textContent = `${Math.round(pe).toLocaleString()} kJ`; $('eTot').textContent = `${Math.round(ke + pe).toLocaleString()} kJ total`;
    $('keBar').style.width = clamp(ke / eRef * 100, 0, 100) + '%'; $('peBar').style.width = clamp(pe / eRef * 100, 0, 100) + '%';
    if (!$('hud').hidden) {
      $('hSeg').textContent = st.phase === 'load' ? (st.held ? 'Waiting' : 'Loading') : st.held ? 'Held: block' : TYPE_LABEL[typ];
      $('hSpd').innerHTML = `${Math.round(v * 3.6)}<small>km/h</small>`; $('hAlt').innerHTML = `${y.toFixed(0)}<small>m</small>`;
      $('hVg').textContent = gs.vg.toFixed(1); $('hLg').textContent = gs.lg.toFixed(1);
    }
    const br = $('blocksRow');
    if (trains.length > 1) { br.hidden = false; br.innerHTML = trains.map((t, i) => `<button class="tchip${i === (view.train || 0) ? ' on' : ''}" data-t="${i}">Train ${i + 1} · ${t.phase === 'load' ? (t.held ? 'waiting' : 'loading') : t.held ? 'held' : Math.round(Math.abs(t.v) * 3.6) + ' km/h'}</button>`).join(''); }
    else br.hidden = true;
  }
  $('blocksRow').addEventListener('click', e => { const b = e.target.closest('.tchip'); if (b) { view.train = +b.dataset.t; resetPeaks(); } });

  // ---------- audio ----------
  const Sound = createSound(msg => toast(msg));

  // ---------- modes & controls ----------
  function setPressed(ids, on) { ids.forEach(id => $(id).setAttribute('aria-pressed', String(id === on))); }
  function setMode(m) {
    S.mode = m; setPressed(['mBuild', 'mRide'], m === 'build' ? 'mBuild' : 'mRide');
    $('left').classList.toggle('locked', m === 'ride');
    document.querySelectorAll('.elbtn, #inspector .editable input, #inspector .editable button, #inspector .editable select, #tunSec input, #tunSec button, #tunSec select, #catTabs button, #dirRow button').forEach(el => el.disabled = m === 'ride');
    if (m === 'ride') { resetTrains(); trains.forEach(t => { if (t.phase === 'load') t.timer = 1.0; }); setPlaying(true); if (isBoard() && glOK) setCam('pov'); toast('Ride mode: editing locked'); }
    updUndo(); refreshInspector(); boardDirty = true;
  }
  function setPlaying(p) { S.playing = p; Sound.setPaused(!p); $('playLbl').textContent = p ? 'Pause' : 'Play'; $('playIco').innerHTML = p ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11l9-5.5z"/>'; }
  function refreshCircuit() { setPressed(['cOpen', 'cClosed'], S.closed ? 'cClosed' : 'cOpen'); }
  function setCircuit(closed) { if (closed === S.closed) return; pushHistory(); S.closed = closed; refreshCircuit(); commit({ resetTrain: true }); toast(closed ? 'Closed circuit: the end now returns to the station' : 'Open shuttle: the train stops or rolls back at the end'); }
  function setAudio(m) { S.audio = m; setPressed(['aOff', 'aTrack', 'aRiders'], ['aOff', 'aTrack', 'aRiders'][m]); Sound.setMode(m); const w = WEATHER[S.env.weather] || {}; Sound.setWeather(w.precip, w.wind); }
  function setCam(c) {
    if ((c === 'follow' || c === 'pov') && !glOK) { toast('3D view needs WebGL, which is unavailable here'); c = 'side'; }
    const was = S.cam; S.cam = c; view.mode = c; setPressed(['camSide', 'camTop', 'camFollow', 'camPov'], { side: 'camSide', top: 'camTop', follow: 'camFollow', pov: 'camPov' }[c]);
    const ov = isBoard();
    $('board').hidden = !ov; $('gl').hidden = ov; $('boardtools').hidden = !ov; $('legend').hidden = !ov; $('minimap').hidden = ov; $('hud').hidden = c !== 'pov'; $('povtools').hidden = c !== 'pov'; $('perf').hidden = ov;
    $('bVex').hidden = c !== 'side'; $('bRoute').hidden = c !== 'top';
    $('vignette').style.opacity = 0;
    if (ov) { boardDirty = true; requestAnimationFrame(() => { if ((c === 'side' && needFit) || (c === 'top' && needFitTop)) { if (c === 'side') needFit = false; else needFitTop = false; fitBoard(); } drawBoard(); }); } else onResize();
    if (c === 'top' && was !== 'top') toast(S.mode === 'build' ? 'Top view: drag a node to bend the track, drag the ↻ handle to change a turn' : 'Top view', null, null, 3600);
    savePrefs();
  }
  $('mBuild').onclick = () => setMode('build'); $('mRide').onclick = () => setMode('ride');
  $('bUndo').onclick = undo; $('bRedo').onclick = redo;
  $('bPlay').onclick = () => setPlaying(!S.playing);
  $('bRestart').onclick = () => { resetTrains(); trains.forEach(t => { if (t.phase === 'load') t.timer = 0.8; }); toast('Trains returned to the station'); };
  $('cOpen').onclick = () => setCircuit(false); $('cClosed').onclick = () => setCircuit(true);
  $('aOff').onclick = () => setAudio(0); $('aTrack').onclick = () => setAudio(1); $('aRiders').onclick = () => setAudio(2);
  $('camSide').onclick = () => setCam('side'); $('camTop').onclick = () => setCam('top'); $('camFollow').onclick = () => setCam('follow'); $('camPov').onclick = () => setCam('pov');
  $('bFit').onclick = fitBoard; $('bZoomIn').onclick = () => zoomBoard(1.25); $('bZoomOut').onclick = () => zoomBoard(0.8);
  $('bVex').onclick = () => { S.vex = S.vex >= 3 ? 1 : S.vex + 1; $('bVex').textContent = `Height ×${S.vex}`; fitBoard(); savePrefs(); };
  const colorLbl = { g: 'Colour: G-force', speed: 'Colour: Speed', height: 'Colour: Height' };
  $('bColor').onclick = () => { S.colorMode = S.colorMode === 'g' ? 'speed' : S.colorMode === 'speed' ? 'height' : 'g'; $('bColor').textContent = colorLbl[S.colorMode]; $('legend').innerHTML = legendHTML(); boardDirty = true; savePrefs(); };
  $('bRoute').onclick = routeToStation;
  $('bGuides').onclick = () => { S.guides = !S.guides; $('bGuides').setAttribute('aria-pressed', String(S.guides)); if (glOK) World.setGuides(S.guides); savePrefs(); };
  $('bSeat').onclick = () => { S.seat = S.seat ? 0 : 1; view.seat = S.seat; $('bSeat').textContent = S.seat ? 'Seat: Rear' : 'Seat: Front'; };
  $('bLook').onclick = () => { view.lookYaw = 0; view.lookPitch = 0; };
  $('selQuality').onchange = () => {
    S.quality = $('selQuality').value; savePrefs(); if (!glOK) return;
    $('loading').hidden = false; $('loadS').textContent = 'Rebuilding scenery at the new quality';
    setTimeout(() => { const t = World.setQuality(S.quality); World.setGuides(S.guides); $('loading').hidden = true; onResize(); toast(`Graphics: ${World.TIERS[t].name}`); refreshSys(); }, 40);
  };
  $('bFull').onclick = () => { const el = stage; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast('Fullscreen is not available here. Try the Full size button.')); else toast('Fullscreen is not available here'); };
  document.querySelectorAll('#sizesw button').forEach(b => b.onclick = () => { S.viewPct = +b.dataset.pct; applyStageH(); savePrefs(); });
  const ps = $('selPreset'); ps.innerHTML = '<option value="">Load preset…</option>' + PRESET_ORDER.map(k => `<option value="${k}">${PRESET_DEFS[k]().name}</option>`).join('');
  ps.onchange = () => { const k = ps.value; ps.value = ''; if (!k) return; if (S.mode === 'ride') setMode('build'); loadPreset(k); };

  // ---------- design sheet ----------
  const COLOR_KEYS = [['body', 'Car body'], ['accent', 'Car accent'], ['seat', 'Seats'], ['restraint', 'Restraints'], ['rail', 'Rails'], ['spine', 'Spine & ties'], ['support', 'Supports']];
  $('dTrain').innerHTML = TRAIN_ORDER.map(k => `<option value="${k}">${TRAIN_TYPES[k].label}</option>`).join('');
  $('dTrack').innerHTML = Object.entries(TRACK_STYLES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  $('dSupports').innerHTML = Object.entries(SUPPORT_STYLES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('dPattern').innerHTML = Object.entries(CAR_PATTERNS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  $('dPaint').innerHTML = '<option value="-1">Custom</option>' + PAINT_SCHEMES.map((p, i) => `<option value="${i}">${p.name}</option>`).join('');
  $('dColors').innerHTML = COLOR_KEYS.map(([k, l]) => `<label class="colsw"><input type="color" id="dc_${k}" data-k="${k}"><span>${l}</span></label>`).join('');
  function refreshDesignSheet() {
    const d = S.design, tt = TRAIN_TYPES[d.train] || TRAIN_TYPES.hyper;
    $('dTrain').value = d.train; $('dCars').value = d.cars; $('dRows').value = d.rows; $('dSeats').value = d.seats;
    $('dRiders').checked = d.riders !== false; $('dOcc').value = Math.round((d.occupancy ?? 0.85) * 100); $('dOccTag').textContent = Math.round((d.occupancy ?? 0.85) * 100) + '%';
    $('dPaint').value = String(d.paint ?? -1); $('dPattern').value = d.pattern || 'stripe';
    for (const [k] of COLOR_KEYS) $('dc_' + k).value = d.colors[k];
    $('dTrack').value = d.track; $('dSupports').value = d.supports; $('dCatwalks').checked = d.catwalks !== false; $('dLights').checked = !!d.lights;
    const mx = trk ? maxTrainsFor(trk) : 1;
    document.querySelectorAll('#dTrains button').forEach(b => { const n = +b.dataset.n; b.disabled = n > mx; b.setAttribute('aria-pressed', String(n === Math.min(d.trains || 1, mx))); });
    $('dTrainsTag').textContent = mx > 1 ? `${trk.blocks.length} block sections allow up to ${mx}` : S.closed ? 'add a block brake (MCBR) to run more trains' : 'shuttles run one train';
    $('dSeats').max = tt.body === 'dive' ? 10 : tt.mount === 'wing' ? 6 : 4;
  }
  function designChanged(kind) {
    savePrefs();
    if (kind === 'colors') { if (glOK) World.setDesign(S.design, 'colors'); return; }
    if (glOK) World.setDesign(S.design);
    if (kind === 'train') { rebuild(true, { resetTrain: true }); boardDirty = true; refreshCheck(); }
    schedule3D(); refreshDesignSheet();
  }
  $('dTrain').onchange = () => { const k = $('dTrain').value, tt = TRAIN_TYPES[k], d = S.design; d.train = k; d.cars = tt.cars; d.rows = tt.rows; d.seats = tt.seats; d.track = tt.track; if (tt.track === 'wood') d.supports = 'wood'; else if (d.supports === 'wood' && tt.track !== 'ibox') d.supports = tt.track === 'box' ? 'box' : 'steel'; designChanged('train'); toast(`Train: ${tt.label}. Track style set to match.`); };
  for (const id of ['dCars', 'dRows', 'dSeats']) $(id).onchange = () => { const k = { dCars: 'cars', dRows: 'rows', dSeats: 'seats' }[id], lim = { cars: [1, 10], rows: [1, 3], seats: [1, +$('dSeats').max || 4] }[k]; S.design[k] = clamp(Math.round(+$(id).value || 1), lim[0], lim[1]); designChanged('train'); };
  $('dTrains').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; S.design.trains = +b.dataset.n; rebuild(true, { resetTrain: true }); designChanged(); toast(S.design.trains > 1 ? `${S.design.trains} trains. Block brakes keep them apart.` : 'One train'); });
  $('dRiders').onchange = () => { S.design.riders = $('dRiders').checked; designChanged(); };
  $('dOcc').oninput = () => { $('dOccTag').textContent = $('dOcc').value + '%'; }; $('dOcc').onchange = () => { S.design.occupancy = +$('dOcc').value / 100; designChanged(); };
  $('dPaint').onchange = () => { const i = +$('dPaint').value; if (i < 0) return; const p = PAINT_SCHEMES[i]; S.design.paint = i; for (const [k] of COLOR_KEYS) S.design.colors[k] = p[k]; refreshDesignSheet(); designChanged('colors'); };
  $('dColors').addEventListener('input', e => { const k = e.target.dataset.k; if (!k) return; S.design.colors[k] = e.target.value; S.design.paint = -1; $('dPaint').value = '-1'; if (glOK) World.setDesign(S.design, 'colors'); });
  $('dColors').addEventListener('change', () => savePrefs());
  $('dPattern').onchange = () => { S.design.pattern = $('dPattern').value; designChanged(); };
  $('dTrack').onchange = () => { S.design.track = $('dTrack').value; designChanged(); };
  $('dSupports').onchange = () => { S.design.supports = $('dSupports').value; designChanged(); };
  $('dCatwalks').onchange = () => { S.design.catwalks = $('dCatwalks').checked; designChanged(); };
  $('dLights').onchange = () => { S.design.lights = $('dLights').checked; designChanged(); };
  function openSheet(id) { for (const s of ['designSheet', 'scenerySheet']) if (s !== id) $(s).hidden = true; $(id).hidden = false; if (id === 'designSheet') refreshDesignSheet(); else refreshScenerySheet(); }
  $('bDesign').onclick = () => openSheet('designSheet'); $('dClose').onclick = $('dDone').onclick = () => { $('designSheet').hidden = true; };

  // ---------- scenery sheet ----------
  function refreshScenerySheet() {
    const opt = (k, l, on, grp) => `<button class="opt" data-g="${grp}" data-k="${k}" aria-pressed="${on}">${l}</button>`;
    $('sScenery').innerHTML = SCENERY_ORDER.map(k => opt(k, SCENERY[k].label, S.env.scenery === k, 'scenery')).join('');
    const TODL = { morning: 'Morning', noon: 'Midday', golden: 'Golden hour', dusk: 'Dusk', night: 'Night' };
    $('sTod').innerHTML = ['morning', 'noon', 'golden', 'dusk', 'night'].map(k => opt(k, TODL[k], S.env.tod === k, 'tod')).join('');
    $('sWeather').innerHTML = WEATHER_ORDER.map(k => opt(k, WEATHER[k].label, S.env.weather === k, 'weather')).join('');
    $('sceneLbl').textContent = SCENERY[S.env.scenery].label.split(' ')[0] + ' · ' + WEATHER[S.env.weather].label.split(' ')[0];
  }
  document.querySelectorAll('#sScenery, #sTod, #sWeather').forEach(el => el.addEventListener('click', e => {
    const b = e.target.closest('.opt'); if (!b) return; const g = b.dataset.g, k = b.dataset.k; if (S.env[g] === k) return;
    S.env[g] = k; refreshScenerySheet(); savePrefs();
    if (g === 'weather') { const w = WEATHER[k]; Sound.setWeather(w.precip, w.wind); }
    if (!glOK) return;
    if (g === 'scenery') { $('loading').hidden = false; $('loadS').textContent = 'Growing the ' + SCENERY[k].label.toLowerCase(); setTimeout(() => { World.setEnvironment({ [g]: k }, { retrack: false }); retrackTerrain(); $('loading').hidden = true; }, 40); }
    else World.setEnvironment({ [g]: k });
  }));
  // tunnels depend on the terrain and water, so a new landscape reclassifies the track and rebuilds it in 3D
  function retrackTerrain() { rebuild(true); boardDirty = true; needFit = true; refreshInspector(); refreshCheck(); if (glOK) World.setTrack(trk, { count: trains.length }); }
  $('bScenery').onclick = () => openSheet('scenerySheet'); $('sClose').onclick = $('sDone').onclick = () => { $('scenerySheet').hidden = true; };

  // ---------- save / share ----------
  function slots() { return LS.get(K_SLOTS, []); }
  const sync = LS.get(K_SYNC, {});
  function renderSlots() {
    const list = slots(); const el = $('slots');
    $('syncTag').textContent = sync.token ? (sync.last ? 'synced ' + new Date(sync.last).toLocaleTimeString() : 'sync on') : '';
    if (!list.length) { el.innerHTML = '<div class="empty">No saved designs yet. Name this coaster above and save it.</div>'; return; }
    el.innerHTML = list.map((s, i) => `<div class="slot"><div class="meta"><b>${esc(s.name)}</b><small>${s.nodes.length} nodes · ${s.closed ? 'closed' : 'open'}${s.design ? ' · ' + esc((TRAIN_TYPES[s.design.train] || {}).label?.split(' (')[0] || '') : ''} · ${new Date(s.ts).toLocaleString()}</small></div>
      <button class="btn" data-load="${i}">Load</button><button class="btn danger" data-del="${i}">Delete</button></div>`).join('');
  }
  function blueprint() { return { app: 'CoasterLab', version: 2, name: S.name || 'Untitled coaster', closed: S.closed, nodes: S.nodes, design: S.design, env: S.env }; }
  function openModal() { $('modal').hidden = false; $('saveName').value = S.name || ''; $('exportBox').value = JSON.stringify(blueprint(), null, 1); $('importMsg').textContent = ''; $('qrBox').hidden = true; $('shareBox').hidden = true; $('gistToken').value = sync.token ? '••••••••' : ''; $('bSyncOff').hidden = !sync.token; $('syncMsg').textContent = sync.url ? 'Gist: ' + sync.url : ''; renderSlots(); setTimeout(() => $('saveName').focus(), 30); }
  function closeModal() { $('modal').hidden = true; }
  $('bSave').onclick = openModal; $('mClose').onclick = closeModal; $('mBack').onclick = closeModal;
  $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('saveName').addEventListener('keydown', e => { if (e.key === 'Enter') $('bDoSave').click(); });
  $('bDoSave').onclick = () => {
    const name = $('saveName').value.trim() || `Coaster ${new Date().toLocaleDateString()}`; S.name = name;
    const list = slots(); const i = list.findIndex(s => s.name === name); const rec = { name, ts: Date.now(), closed: S.closed, nodes: S.nodes, design: S.design, env: S.env };
    if (i >= 0) list[i] = rec; else list.unshift(rec); if (list.length > 60) list.length = 60;
    if (LS.set(K_SLOTS, list)) { autosave(); closeModal(); toast(i >= 0 ? `Updated “${name}”` : `Saved “${name}”`); if (sync.token) doSync(true); } else $('importMsg').textContent = 'Saving is blocked in this browser, so use Copy JSON to keep a copy.';
  };
  $('slots').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const list = slots();
    if (b.dataset.load != null) { loadBlueprint(list[+b.dataset.load]); closeModal(); }
    if (b.dataset.del != null) {
      if (b.dataset.armed) { const nm = list[+b.dataset.del].name; list.splice(+b.dataset.del, 1); LS.set(K_SLOTS, list); renderSlots(); toast(`Deleted “${nm}”`); }
      else { b.dataset.armed = '1'; b.textContent = 'Confirm delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000); }
    }
  });
  function copyText(text, okMsg, box) { const fallback = () => { if (box) { box.hidden = false; box.value = text; box.focus(); box.select(); } toast('Select the text in the box and copy it'); }; try { navigator.clipboard.writeText(text).then(() => toast(okMsg), fallback); } catch (e) { fallback(); } }
  $('bCopy').onclick = () => copyText($('exportBox').value, 'Blueprint copied', $('exportBox'));
  $('bShareLink').onclick = async () => { const url = await Share.link(blueprint()); $('shareBox').hidden = false; $('shareBox').value = url; copyText(url, 'Share link copied. Open it on any device to load this coaster.', $('shareBox')); };
  $('bQR').onclick = async () => {
    const url = await Share.link(blueprint()); const box = $('qrBox'); box.hidden = false; box.innerHTML = '<p class="hint">Making QR code…</p>';
    try { box.innerHTML = await Share.qrSVG(url) + '<p class="hint">Scan with your phone camera to open this coaster.</p>'; } catch (e) { box.innerHTML = `<p class="hint">${esc(e.message)}. Use Copy share link instead.</p>`; }
  };
  $('bDownload').onclick = async () => { try { const r = await Share.download(blueprint(), S.name || 'coaster'); if (r === 'saved') toast('Blueprint file saved'); } catch (e) { toast('Downloads are blocked here. Use Copy JSON or a share link instead.'); } };
  async function doSync(quiet) {
    if (!sync.token) return; $('syncMsg').textContent = 'Syncing…';
    try { const r = await Share.sync(sync.token, sync.gistId, slots()); sync.gistId = r.gistId; sync.url = r.url; sync.last = Date.now(); LS.set(K_SYNC, sync); LS.set(K_SLOTS, r.slots); renderSlots(); $('syncMsg').textContent = `Synced ${r.slots.length} design${r.slots.length === 1 ? '' : 's'} · ${r.url}`; if (!quiet) toast('Designs synced with your gist'); }
    catch (e) { const blocked = /Failed to fetch|NetworkError|Load failed/i.test(e.message); $('syncMsg').textContent = blocked ? 'GitHub could not be reached from this page. Sync works on the GitHub Pages version (' + Share.HOME + ').' : e.message; if (!quiet) toast('Sync failed'); }
  }
  $('bSyncNow').onclick = () => { const v = $('gistToken').value.trim(); if (v && !/^•+$/.test(v)) { sync.token = v; LS.set(K_SYNC, sync); } if (!sync.token) { $('syncMsg').textContent = 'Paste a GitHub token with the gist permission first.'; return; } $('bSyncOff').hidden = false; doSync(false); };
  $('bSyncOff').onclick = () => { for (const k of Object.keys(sync)) delete sync[k]; LS.set(K_SYNC, sync); $('gistToken').value = ''; $('bSyncOff').hidden = true; $('syncMsg').textContent = 'Sync turned off. The token was removed from this browser.'; renderSlots(); };
  function normaliseNodes(arr) {
    const nodes = []; for (const n of arr) { if (!n || !isFinite(+n.x) || !isFinite(+n.y)) return null;
      const q = { x: clamp(+n.x, LIMITS.x[0], LIMITS.x[1]), y: clamp(+n.y, LIMITS.y[0], LIMITS.y[1]), yaw: clamp(+n.yaw || 0, LIMITS.yaw[0], LIMITS.yaw[1]), roll: normDeg(+n.roll || 0), type: SEG_BY_KEY[n.type] ? n.type : 'steel' };
      for (const k of ['lat', 'off', 'spd', 'hold']) if (n[k] != null && isFinite(+n[k])) q[k] = +n[k];
      if (n.flip) q.flip = true; if (n.tunnel) q.tunnel = true; if (n.sys && LAUNCH_SYS[n.sys]) q.sys = n.sys;
      const tun = cleanTun(n.tun); if (tun) q.tun = tun;
      nodes.push(q); }
    return nodes;
  }
  function loadBlueprint(o, label) {
    const arr = Array.isArray(o) ? o : o && o.nodes; const nodes = arr && arr.length >= 2 ? normaliseNodes(arr) : null;
    if (!nodes) return false;
    if (S.mode === 'ride') setMode('build');
    pushHistory(); S.nodes = nodes; S.closed = o.closed != null ? !!o.closed : S.closed; S.name = o.name || 'Imported coaster'; S.sel = Math.min(1, nodes.length - 1);
    if (o.design && TRAIN_TYPES[o.design.train]) S.design = { ...defaultDesign(o.design.train), ...o.design, colors: { ...defaultDesign(o.design.train).colors, ...(o.design.colors || {}) } };
    if (o.env) { const env = { ...S.env }; if (SCENERY[o.env.scenery]) env.scenery = o.env.scenery; if (o.env.tod) env.tod = o.env.tod; if (WEATHER[o.env.weather]) env.weather = o.env.weather; const changed = JSON.stringify(env) !== JSON.stringify(S.env); S.env = env; if (changed && glOK) World.setEnvironment(env, { retrack: false }); }
    if (glOK) World.setDesign(S.design);
    commit({ resetTrain: true }); refreshCircuit(); needFit = needFitTop = true; fitBoard(); refreshDesignSheet(); refreshScenerySheet(); savePrefs();
    toast(`${label || 'Loaded'} “${S.name}” · ${nodes.length} nodes`);
    return true;
  }
  async function importText(txt) {
    const code = Share.codeFrom(txt);
    if (code) { try { const o = await Share.decode(code); if (loadBlueprint(o, 'Opened')) closeModal(); else $('importMsg').textContent = 'That share link did not contain a coaster.'; } catch (e) { $('importMsg').textContent = 'That share link looks damaged. Copy it again.'; } return; }
    let o; try { o = JSON.parse(txt); } catch (e) { $('importMsg').textContent = 'That is not valid JSON or a share link. Check that the whole text was pasted.'; return; }
    if (loadBlueprint(o, 'Imported')) closeModal(); else $('importMsg').textContent = 'The blueprint needs a "nodes" list with at least 2 nodes, each with numeric x and y.';
  }
  $('bImport').onclick = () => importText($('importBox').value);
  $('importFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importText(String(r.result)); r.readAsText(f); e.target.value = ''; };

  // ---------- keyboard ----------
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'range' && document.activeElement.type !== 'checkbox';
    if ((e.ctrlKey || e.metaKey) && !typing) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      return;
    }
    if (e.key === 'Escape') { if (!$('modal').hidden) { closeModal(); return; } for (const s of ['designSheet', 'scenerySheet']) if (!$(s).hidden) { $(s).hidden = true; return; } }
    if (typing) return;
    if (!$('modal').hidden || !$('start').hidden) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!S.playing); }
    else if (e.key === 'Delete' || e.key === 'Backspace') deleteNode();
    else if (e.key === '[') selectNode(S.sel - 1); else if (e.key === ']') selectNode(S.sel + 1);
    else if (e.key === '1') setCam('side'); else if (e.key === '2') setCam('top'); else if (e.key === '3') setCam('follow'); else if (e.key === '4') setCam('pov');
  });

  // ---------- sizing ----------
  function applyStageH() {
    document.querySelectorAll('#sizesw button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.pct === S.viewPct)));
    if (innerWidth <= 1100) { const navH = $('nav').offsetHeight; const avail = innerHeight - navH - 8; const h = S.viewPct >= 100 ? avail : avail * S.viewPct / 100; document.documentElement.style.setProperty('--stageH', Math.max(200, Math.round(h)) + 'px'); }
    onResize();
  }
  function onResize() {
    const r = stage.getBoundingClientRect();
    if (glOK && !isBoard()) World.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    const before = BV.w; const rr = sizeCanvas(board); const changed = Math.abs(before - rr.w) > 2; BV.w = rr.w; BV.h = rr.h;
    if (changed) { needFitTop = true; if (S.cam === 'side') fitBoard(); else if (S.cam === 'top') { fitTop(); needFitTop = false; } } boardDirty = true;
  }
  new ResizeObserver(() => onResize()).observe(stage);
  addEventListener('resize', applyStageH);
  function refreshSys() { if (!glOK) { $('sysline').textContent = '3D unavailable: WebGL could not start. The 2D editors still work.'; return; } const st = World.stats(); $('sysline').textContent = `${World.gpu} · ${st.tierName} · ${Math.round(st.fps)} fps @ ${st.pr.toFixed(2)}× res · ${World.riderCount} riders`; }

  // ---------- main loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (S.playing && trk && trains.length) {
      let acc = dt; const h = 1 / 240;
      while (acc > 1e-6) { const d = Math.min(h, acc); for (const st of trains) { physStep(st, trk, d, trains); handleEvent(st); } acc -= d; }
    }
    trains.forEach((st, i) => {
      let vg = 1, lg = 0; if (st.phase !== 'load') [vg, lg] = gForces(trk, st.s, st.v, st.aT);
      const f = forces[i] || (forces[i] = { vg: 1, lg: 0 }); const k = Math.min(1, dt * 9); f.vg += (vg - f.vg) * k; f.lg += (lg - f.lg) * k;
    });
    forces.length = trains.length;
    const ti = Math.min(view.train || 0, trains.length - 1), main = trains[ti];
    if (!main) { requestAnimationFrame(loop); return; }
    gs.vg = forces[ti].vg; gs.lg = forces[ti].lg;
    const typ = trk.typeAt(main.s);
    if (main.phase === 'run' && typ !== T_STATION && typ !== T_TRANSFER) {
      peaks.max = Math.max(peaks.max, gs.vg); peaks.min = Math.min(peaks.min, gs.vg); peaks.lat = Math.max(peaks.lat, Math.abs(gs.lg)); peaks.spd = Math.max(peaks.spd, Math.abs(main.v));
      const lv = safetyLevel(gs.vg, gs.lg); if (lv.sev > 0) showBanner(lv, gs.vg, gs.lg, main.s);
    }
    if (S.playing) { scopeBuf.vg[scopeBuf.i] = gs.vg; scopeBuf.lg[scopeBuf.i] = gs.lg; scopeBuf.i = (scopeBuf.i + 1) % scopeBuf.vg.length; }
    const kM = trk.at(main.s);
    Sound.update({ v: main.v, type: typ, phase: main.phase, vg: gs.vg, ty: trk.get(trk.ty, main.s), uy: trk.get(trk.uy, main.s), launching: main.launching, launchSys: S.nodes[clamp(Math.floor(trk.u[kM]) + 1, 1, S.nodes.length - 1)]?.sys, wood: S.design.track === 'wood', pov: S.cam === 'pov', onLift: isLiftCode(trk.type[trk.at(main.s - TRAIN.len / 2)]) });
    // tunnel echo and effects: the camera's tunnel in 3D views, the lead train's in the 2D editors
    if (trk.tunnels && trk.tunnels.length) Sound.tunnel({ tn: !isBoard() && glOK ? (World.tunnelInside ? World.tunnelInside.tn : null) : (main.phase === 'run' ? trk.tunnelAt(main.s) : null), v: main.v });
    else Sound.tunnel(null);
    if (!isBoard() && glOK) {
      if (S.cam === 'pov' && !(drag && drag.kind === 'look') && now - lastLookAt > 1400) { view.lookYaw *= Math.exp(-dt * 2.5); view.lookPitch *= Math.exp(-dt * 2.5); }
      World.frame(dt, trains, forces, view); World.render(dt);
      if (S.cam === 'pov') { const vgn = TRAIN.prone ? -gs.vg : gs.vg; const grey = clamp((vgn - 3.6) / 2.6, 0, 0.85), red = clamp((-vgn - 0.6) / 1.4, 0, 0.7);
        const vi = $('vignette'); if (grey > 0.01) { vi.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(55 - grey * 35)}%, rgba(8,8,10,${0.5 + grey * 0.5}) 100%)`; vi.style.opacity = grey; }
        else if (red > 0.01) { vi.style.background = `radial-gradient(ellipse at center, rgba(120,0,0,${red * 0.25}) 30%, rgba(150,0,0,${0.4 + red * 0.5}) 100%)`; vi.style.opacity = red; } else vi.style.opacity = 0; }
      if (now - perfT > 500) { perfT = now; const st = World.stats(); $('perf').textContent = `${Math.round(st.fps)} fps · ${st.tierName} · ${st.pr.toFixed(2)}×`; drawMini(); }
    } else if (boardDirty || (S.playing && trains.some(t => t.phase !== 'load'))) drawBoard();
    if (now - teleT > 90) { teleT = now; updTelemetry(); }
    if (now - scopeT > 33) { scopeT = now; drawScope(); }
    requestAnimationFrame(loop);
  }
  let lastSysT = 0;
  function handleEvent(st) {
    const ev = st.event; if (!ev) return;
    const mine = st === trains[view.train || 0];
    if (ev === 'arrived' && mine) Sound.cheer();
    if (ev === 'stall' && mine) toast(`The train stalled at ${Math.round(st.stallS || 0)} m and was returned to the station`);
    if (ev === 'complete' && !S.closed && mine) toast('Ride complete. Dispatching the next train.');
    if (ev === 'lap') { const n = performance.now(); if (n - lastSysT > 2000) { lastSysT = n; refreshSys(); } }
  }

  // ---------- start screen ----------
  let restored = false, soundOn = true, glState = 'loading';
  function refreshStart() {
    const name = restored && S.name ? S.name : (restored ? 'your last design' : (S.name || 'Hyper-Goliath'));
    $('stRideT').textContent = `Ride ${restored ? name : 'the ' + name.replace(/ Mega Coaster$/, '')}`;
    const info = an ? `${Math.round(an.maxV * 3.6)} km/h top speed · ${an.inversions ? an.inversions + ' inversion' + (an.inversions > 1 ? 's · ' : ' · ') : ''}${Math.round(an.duration)} s ride` : '';
    $('stRideS').textContent = glState === 'fail' ? 'Rides in the 2D views on this device' : `First-person 3D ride · ${info}`;
    $('stRide').disabled = glState === 'loading';
    const st = $('stStatus'); st.className = 'sstatus' + (glState === 'ready' ? ' ready' : glState === 'fail' ? ' fail' : '');
    $('stStatusT').textContent = glState === 'loading' ? 'Building the 3D scenery…' : glState === 'ready' ? `Scenery ready · ${World.TIERS[World.tier].name} graphics` : '3D could not start here. The builder still works.';
    $('stFresh').hidden = !restored;
  }
  function openStart() { $('start').hidden = false; refreshStart(); if (glOK && S.cam !== 'follow') setCam('follow'); setTimeout(() => (glState === 'loading' ? $('stBuild') : $('stRide')).focus(), 30); }
  function leaveStart(mode) {
    $('start').hidden = true; restored = false;
    if (soundOn && S.audio === 0) setAudio(mode === 'ride' ? 2 : 1);
    if (!soundOn && S.audio) setAudio(0);
    if (mode === 'ride') { setMode('ride'); if (glOK) setCam('pov'); }
    else { if (S.mode === 'ride') setMode('build'); setCam('side'); fitBoard(); }
  }
  $('stRide').onclick = () => leaveStart('ride');
  $('stBuild').onclick = () => leaveStart('build');
  $('stSound').onclick = () => { soundOn = !soundOn; $('stSound').setAttribute('aria-pressed', String(soundOn)); $('stSoundT').textContent = soundOn ? 'Sound on' : 'Sound off'; };
  $('stLoad').onclick = () => { $('start').hidden = true; if (S.mode === 'ride') setMode('build'); setCam('side'); openModal(); };
  $('stFresh').onclick = () => { restored = false; loadPreset('hyper'); refreshStart(); };
  $('bHome').onclick = () => { if (S.mode === 'ride') setMode('build'); setPlaying(true); openStart(); };

  // ---------- boot ----------
  async function boot() {
    $('selQuality').value = S.quality; $('fAlerts').checked = S.alerts; $('bVex').textContent = `Height ×${S.vex}`; $('bColor').textContent = colorLbl[S.colorMode] || colorLbl.g;
    $('bGuides').setAttribute('aria-pressed', String(S.guides));
    renderPalette(); refreshScenerySheet();
    const auto = LS.get(K_AUTO, null);
    let shared = null; const code = Share.fromHash();
    if (code) { try { shared = await Share.decode(code); } catch (e) { shared = null; } Share.clearHash(); }
    if (shared && shared.nodes && normaliseNodes(shared.nodes)) {
      S.nodes = normaliseNodes(shared.nodes); S.closed = shared.closed != null ? !!shared.closed : true; S.name = shared.name || 'Shared coaster'; S.sel = 1;
      if (shared.design && TRAIN_TYPES[shared.design.train]) S.design = { ...defaultDesign(shared.design.train), ...shared.design, colors: { ...defaultDesign(shared.design.train).colors, ...(shared.design.colors || {}) } };
      if (shared.env) { if (SCENERY[shared.env.scenery]) S.env.scenery = shared.env.scenery; if (shared.env.tod) S.env.tod = shared.env.tod; if (WEATHER[shared.env.weather]) S.env.weather = shared.env.weather; }
      restored = true; rebuild(true, { resetTrain: true }); refreshCircuit(); refreshInspector(); refreshCheck(); autosave();
      setTimeout(() => toast(`Opened shared coaster “${S.name}”. Save it to keep it on this device.`, null, null, 5200), 400);
    } else if (auto && Array.isArray(auto.nodes) && auto.nodes.length >= 2 && normaliseNodes(auto.nodes)) {
      S.nodes = normaliseNodes(auto.nodes); S.closed = !!auto.closed; S.sel = clamp(auto.sel || 1, 0, S.nodes.length - 1); S.name = auto.name || ''; restored = true;
      if (auto.design && TRAIN_TYPES[auto.design.train]) S.design = { ...defaultDesign(auto.design.train), ...auto.design, colors: { ...defaultDesign(auto.design.train).colors, ...(auto.design.colors || {}) } };
      rebuild(true, { resetTrain: true }); refreshCircuit(); refreshInspector(); refreshCheck();
    } else loadPreset('hyper', true);
    $('legend').innerHTML = legendHTML();
    applyStageH(); fitBoard(); drawBoard(); updUndo();
    setCam('side'); refreshStart(); refreshDesignSheet();
    requestAnimationFrame(loop);
    const fail = err => { console.error(err); glOK = false; glState = 'fail'; refreshStart(); setCam('side'); refreshSys(); };
    (window.THREE_READY || Promise.reject(new Error('three.js loader missing'))).then(THREE => {
      if (!THREE || !THREE.WebGLRenderer) throw new Error('three.js did not load');
      World = createWorld(THREE);
      World.init($('gl'), S.quality, S.env); World.setDesign(S.design); glOK = true;
      // classify tunnels against the real terrain and water now that the world exists
      setEnvProbe(World.probe); rebuild(true); needFit = needFitTop = true; if (isBoard()) fitBoard(); boardDirty = true; refreshInspector(); refreshCheck();
      World.onThunder = d => Sound.thunder(d);
      World.setTrack(trk, { count: trains.length }); World.setGuides(S.guides);
      glState = 'ready'; refreshSys();
      if (!$('start').hidden) setCam('follow'); else setCam(S.cam || 'follow');
      refreshStart(); if (!$('start').hidden) $('stRide').focus();
    }).catch(fail);
  }
  window.__coaster = { get view() { return view; }, commit: o => commit(o), sampleScreen(k) { return S.cam === 'top' ? [tx(trk.px[k]), tz(trk.pz[k])] : [sx(trk.profX[k]), sy(trk.profY[k])]; }, nodeScreen(i) { if (S.cam === 'top') { if (!plan) plan = planNodes(S.nodes); return [tx(plan.x[i]), tz(plan.z[i])]; } return [sx(S.nodes[i].x), sy(S.nodes[i].y)]; }, routeToStation, seek(s, v, i = 0) { const t = trains[i]; t.phase = 'run'; t.dispatch = false; t.s = s; t.v = v; }, setCam, get trains() { return trains; }, get trk() { return trk; }, get S() { return S; }, loadPreset, insertElement, setMode, get an() { return an; }, get clear() { return clear; }, refreshDesignSheet, designChanged, get World() { return World; } };
  boot();
})();
// ===================== END APP =====================
