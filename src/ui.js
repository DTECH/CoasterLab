// ===================== APP: state, builder board, inspector, telemetry, audio =====================
(() => {
  const $ = id => document.getElementById(id);
  let World = null;
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const K_AUTO = 'coasterlab.v1.autosave', K_SLOTS = 'coasterlab.v1.slots', K_PREFS = 'coasterlab.v1.prefs';
  const css = getComputedStyle(document.documentElement);
  const C = n => css.getPropertyValue(n).trim();
  const COL = { board: C('--board'), grid: C('--board-grid'), grid2: C('--board-grid-2'), text: C('--text'), muted: C('--muted'), faint: C('--faint'), signal: C('--signal'), vg: C('--vg'), lg: C('--lg'), ok: C('--ok'), warn: C('--warn'), crit: C('--crit'), ink: C('--ink') };

  const prefs = LS.get(K_PREFS, {});
  const S = {
    nodes: [], closed: true, sel: 1, mode: 'build', cam: prefs.cam || 'follow', playing: true, audio: 0,
    quality: prefs.quality || 'auto', guides: prefs.guides !== false, colorMode: prefs.colorMode || 'g', vex: prefs.vex || 3,
    viewPct: prefs.viewPct || 56, seat: 0, paint: prefs.paint || 0, tod: prefs.tod || 'golden', name: ''
  };
  const view = { mode: 'overview', az: 0.95, el: 0.2, dist: 30, lookYaw: 0, lookPitch: 0, seat: 0 };
  let trk = null, an = null, train = null, glOK = false, lastAn = 0;
  const savePrefs = () => LS.set(K_PREFS, { cam: S.cam, quality: S.quality, guides: S.guides, colorMode: S.colorMode, vex: S.vex, viewPct: S.viewPct, paint: S.paint, tod: S.tod });

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
  function rebuild(full, opts = {}) {
    trk = buildTrack(S.nodes, S.closed);
    const now = performance.now();
    if (full || !an || now - lastAn > 160) { an = analyzeTrack(trk); lastAn = now; }
    if (!train || opts.resetTrain) { train = newTrainState(trk); resetPeaks(); }
    else {
      const maxS = S.closed ? trk.L : trk.Lm; train.s = clamp(train.s, TRAIN.len, maxS);
      if (train.phase === 'load') train.s = trk.stationStop;
    }
  }
  let t3d = 0, tVeg = 0, live3dAt = 0;
  function schedule3D() {
    if (!glOK) return; clearTimeout(t3d); clearTimeout(tVeg);
    t3d = setTimeout(() => { World.setTrack(trk, { vegetation: false }); tVeg = setTimeout(() => World.rescatter(trk), 650); }, 20);
  }
  function commit(opts = {}) {
    rebuild(true, opts); boardDirty = true; refreshInspector(); refreshCheck(); autosave(); schedule3D();
  }
  function liveUpdate() {
    rebuild(false); boardDirty = true; refreshInspector(true);
    if (glOK && S.cam !== 'overview' && performance.now() - live3dAt > 220) { live3dAt = performance.now(); World.setTrack(trk, { vegetation: false }); }
  }
  function autosave() { LS.set(K_AUTO, { nodes: S.nodes, closed: S.closed, sel: S.sel, name: S.name, ts: Date.now() }); }

  // ---------- presets ----------
  function loadPreset(key, silent) {
    const p = getPreset(key); if (!silent) pushHistory();
    S.nodes = p.nodes.map(n => ({ ...n })); S.closed = p.closed; S.sel = Math.min(1, S.nodes.length - 1); S.name = p.name;
    commit({ resetTrain: true }); refreshCircuit(); fitBoard(); if (!silent) toast(`Loaded ${p.name}`);
  }

  // ---------- toast ----------
  let toastT = 0;
  function toast(msg, action, fn, ms = 2600) {
    $('toastT').textContent = msg; const a = $('toastA');
    if (action) { a.hidden = false; a.textContent = action; a.onclick = () => { $('toast').hidden = true; fn(); }; } else a.hidden = true;
    $('toast').hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { $('toast').hidden = true; }, ms);
  }

  // ---------- board (2D profile editor) ----------
  const board = $('board'), bg = board.getContext('2d'); const stage = $('stage');
  const BV = { sc: 1, ox: 50, oy: 300, w: 300, h: 300, dpr: 1 };
  let boardDirty = true, needFit = true;
  const sx = x => BV.ox + x * BV.sc, sy = y => BV.oy - y * BV.sc * S.vex;
  const fromScreen = (px, py) => [(px - BV.ox) / BV.sc, (BV.oy - py) / (BV.sc * S.vex)];
  function sizeCanvas(c, maxDpr = 2) { const r = c === board ? stage.getBoundingClientRect() : c.getBoundingClientRect(); const dpr = Math.min(maxDpr, window.devicePixelRatio || 1); const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr)); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return { w: r.width, h: r.height, dpr }; }
  function fitBoard() {
    if (!trk) return; const rr = stage.getBoundingClientRect(); if (rr.width > 10) { BV.w = rr.width; BV.h = rr.height; } let x0 = 1e9, x1 = -1e9, y1 = 12;
    for (let k = 0; k < trk.nm; k += 2) { x0 = Math.min(x0, trk.profX[k]); x1 = Math.max(x1, trk.profX[k]); y1 = Math.max(y1, trk.profY[k]); }
    const padL = 54, padR = 28, padT = 86, padB = 60;
    const sw = (BV.w - padL - padR) / Math.max(30, x1 - x0), sh = (BV.h - padT - padB) / (y1 * S.vex + 4);
    BV.sc = clamp(Math.min(sw, sh), 0.04, 40);
    BV.ox = padL - x0 * BV.sc + Math.max(0, ((BV.w - padL - padR) - (x1 - x0) * BV.sc) / 2);
    BV.oy = Math.min(BV.h - padB, padT + (BV.h - padT - padB) / 2 + (y1 * S.vex * BV.sc) / 2 + 10);
    boardDirty = true;
  }
  function niceStep(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); const m = v / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; }
  function gColor(vg) { if (!isFinite(vg)) return '#3b4753'; if (vg < -0.5) return '#ff4f9a'; if (vg < 0.3) return '#b48cff'; if (vg <= 3.0) return COL.ok; if (vg <= 4.2) return COL.signal; return COL.crit; }
  function spdColor(v, vm) {
    if (!isFinite(v)) return '#3b4753'; const t = clamp(v / Math.max(1, vm), 0, 1);
    const stops = [[47, 127, 214], [69, 196, 134], [243, 179, 61], [255, 81, 70]]; const f = t * 3, i = Math.min(2, Math.floor(f)), u = f - i;
    const a = stops[i], b = stops[i + 1]; return `rgb(${a.map((c, j) => Math.round(c + (b[j] - c) * u)).join(',')})`;
  }
  function trackColorAt(k) { return S.colorMode === 'g' ? gColor(an.vg[k]) : spdColor(an.spd[k], an.maxV); }
  function drawBoard() {
    const r = sizeCanvas(board); BV.w = r.w; BV.h = r.h; BV.dpr = r.dpr;
    const g = bg; g.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
    g.fillStyle = COL.board; g.fillRect(0, 0, BV.w, BV.h);
    if (!trk) return;
    // grid
    const stepX = niceStep(70 / BV.sc), stepY = niceStep(46 / (BV.sc * S.vex));
    g.lineWidth = 1; g.font = '10px ' + C('--f-mono'); g.textBaseline = 'middle';
    const xa = Math.floor(fromScreen(0, 0)[0] / stepX) * stepX, xb = fromScreen(BV.w, 0)[0];
    for (let x = xa; x <= xb; x += stepX) { const X = Math.round(sx(x)) + 0.5; const major = Math.round(x / stepX) % 5 === 0; g.strokeStyle = major ? COL.grid2 : COL.grid; g.beginPath(); g.moveTo(X, 0); g.lineTo(X, BV.h); g.stroke(); }
    const yTop = fromScreen(0, 0)[1];
    for (let y = 0; y <= yTop; y += stepY) { const Y = Math.round(sy(y)) + 0.5; const major = Math.round(y / stepY) % 5 === 0; g.strokeStyle = major ? COL.grid2 : COL.grid; g.beginPath(); g.moveTo(0, Y); g.lineTo(BV.w, Y); g.stroke(); }
    // ground
    const gy = sy(0); g.fillStyle = 'rgba(28,46,30,0.55)'; g.fillRect(0, gy, BV.w, BV.h - gy);
    g.strokeStyle = '#3c5a3a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, gy); g.lineTo(BV.w, gy); g.stroke();
    // axis labels
    g.fillStyle = COL.faint; g.textAlign = 'center';
    for (let x = xa; x <= xb; x += stepX) if (x >= 0) g.fillText(Math.round(x) + ' m', sx(x), gy + 14);
    g.textAlign = 'left';
    for (let y = stepY; y <= yTop; y += stepY) g.fillText(Math.round(y) + ' m', 6, sy(y) - 7);
    // station zone
    const st0 = sx(S.nodes[0].x), st1 = sx(trk.profX[Math.min(trk.nm - 1, Math.round(trk.stationEnd / DS))]);
    g.fillStyle = 'rgba(127,143,160,0.10)'; g.fillRect(Math.min(st0, st1), 0, Math.abs(st1 - st0), gy);
    g.fillStyle = COL.faint; g.fillText('STATION', Math.min(st0, st1) + 4, 14);
    // supports
    g.strokeStyle = 'rgba(160,175,190,0.16)'; g.lineWidth = 1; g.beginPath();
    for (let k = 4; k < trk.nm; k += 20) if (trk.uy[k] > 0.55 && trk.type[k] !== T_STATION) { const X = sx(trk.profX[k]), Y = sy(trk.profY[k] - 0.8); g.moveTo(X, Y); g.lineTo(X, gy); }
    g.stroke();
    // track (outline then coloured runs)
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
    // chain lift hatch + brake marks
    for (let q = 0; q < trk.nm; q += 6) {
      const t = trk.type[q]; if (t !== T_CHAIN && t !== T_BRAKES) continue;
      const X = sx(trk.profX[q]), Y = sy(trk.profY[q]);
      g.fillStyle = t === T_CHAIN ? '#e3e8ec' : '#d39a52'; g.fillRect(X - 1.5, Y - 1.5, 3, 3);
    }
    if (S.closed) { const e = trk.nm - 1; g.fillStyle = COL.muted; g.textAlign = 'left'; g.fillText('↩ return transfer to station', sx(trk.profX[e]) + 10, sy(trk.profY[e]) - 2); }
    // stall marker
    if (an.stallS != null && an.stallS < trk.Lm) { const kk = Math.round(an.stallS / DS); const X = sx(trk.profX[kk]), Y = sy(trk.profY[kk]);
      g.strokeStyle = COL.crit; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X - 7, Y - 7); g.lineTo(X + 7, Y + 7); g.moveTo(X + 7, Y - 7); g.lineTo(X - 7, Y + 7); g.stroke();
      g.fillStyle = COL.crit; g.textAlign = 'center'; g.fillText('train stalls', X, Y - 16); }
    // peak G callouts
    const callout = (s, txt, col) => { if (s == null || s > trk.Lm) return; const kk = Math.round(s / DS); const X = sx(trk.profX[kk]), Y = sy(trk.profY[kk]);
      g.fillStyle = col; g.beginPath(); g.arc(X, Y, 3.5, 0, 7); g.fill(); g.textAlign = 'center'; g.fillText(txt, X, Y + 16); };
    if (an.maxVG > 1.2) callout(an.maxVGs, an.maxVG.toFixed(1) + ' G', gColor(an.maxVG));
    if (an.minVG < 0.5) callout(an.minVGs, an.minVG.toFixed(1) + ' G', gColor(an.minVG));
    // nodes + badges
    const touch = matchMedia('(pointer:coarse)').matches; const nr = clamp(BV.sc * 9, 3.5, touch ? 8 : 6.5);
    const badgeRows = [-1e9, -1e9, -1e9, -1e9];
    const order = S.nodes.map((n, i) => i).sort((a, b) => S.nodes[a].x - S.nodes[b].x);
    for (const i of order) {
      const n = S.nodes[i]; const X = sx(n.x), Y = sy(n.y); const sel = i === S.sel;
      const tc = { station: '#8b9aab', chain: '#e3e8ec', steel: COL.vg, brakes: '#d39a52' }[n.type] || COL.vg;
      g.beginPath(); g.arc(X, Y, sel ? nr + 2.5 : nr, 0, Math.PI * 2);
      g.fillStyle = sel ? COL.signal : COL.board; g.fill(); g.lineWidth = 2.4; g.strokeStyle = sel ? '#fff3d6' : tc; g.stroke();
      if (sel) { g.fillStyle = COL.signal; g.textAlign = 'center'; g.font = '600 11px ' + C('--f-mono'); g.fillText('#' + i, X, Y + nr + 14); g.font = '10px ' + C('--f-mono'); }
      // badges for turns/banking and steep drops
      const parts = [];
      if (n.yaw) parts.push((n.yaw > 0 ? '↱' : '↰') + Math.abs(n.yaw) + '°');
      if (n.roll) parts.push('∠' + Math.abs(n.roll) + '°');
      let drop = false;
      if (i > 0) { const p = S.nodes[i - 1]; const ang = Math.atan2(n.y - p.y, Math.abs(n.x - p.x)) / DEG; if (ang < -45 && n.x > p.x) { parts.push('▼ ' + Math.round(-ang) + '°'); drop = true; } }
      if (parts.length) {
        const txt = parts.join(' '); g.font = '600 10px ' + C('--f-mono'); const tw = g.measureText(txt).width + 12;
        let lvl = 0; while (lvl < 3 && badgeRows[lvl] > X - tw / 2 - 3) lvl++; if (lvl >= 3 && !sel) continue; if (lvl >= 3) lvl = 2; badgeRows[lvl] = X + tw / 2;
        const bx = X - tw / 2, by = Y - nr - 24 - lvl * 19;
        g.fillStyle = drop && !n.yaw ? 'rgba(255,60,240,0.16)' : 'rgba(34,240,255,0.13)'; g.strokeStyle = drop && !n.yaw ? 'rgba(255,90,240,0.75)' : 'rgba(34,240,255,0.7)'; g.lineWidth = 1;
        roundRect(g, bx, by, tw, 16, 8); g.fill(); g.stroke();
        g.fillStyle = drop && !n.yaw ? '#ffc2fb' : '#bff9ff'; g.textAlign = 'center'; g.fillText(txt, X, by + 8.5); g.font = '10px ' + C('--f-mono');
        g.strokeStyle = 'rgba(34,240,255,0.35)'; g.beginPath(); g.moveTo(X, by + 16); g.lineTo(X, Y - nr - 2); g.stroke();
      }
    }
    // train
    if (train && train.s <= trk.Lm + 0.01) {
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.lineCap = 'round'; g.beginPath(); let first = true;
      for (let s = Math.max(0, train.s - TRAIN.len); s <= train.s; s += 1) { const kk = Math.min(trk.nm - 1, Math.round(s / DS)); const X = sx(trk.profX[kk]), Y = sy(trk.profY[kk]); first ? g.moveTo(X, Y) : g.lineTo(X, Y); first = false; }
      g.stroke(); const kk = Math.min(trk.nm - 1, Math.round(train.s / DS));
      g.fillStyle = COL.signal; g.beginPath(); g.arc(sx(trk.profX[kk]), sy(trk.profY[kk]), 5, 0, 7); g.fill();
    } else if (train && S.closed) { const e = trk.nm - 1; g.fillStyle = COL.signal; g.textAlign = 'left'; g.fillText('train on return transfer', sx(trk.profX[e]) + 10, sy(trk.profY[e]) + 12); }
    boardDirty = false;
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function legendHTML() {
    if (S.colorMode === 'g') return `<span><i style="background:${COL.crit}"></i>&gt;4.2 G</span><span><i style="background:${COL.signal}"></i>3–4.2</span><span><i style="background:${COL.ok}"></i>0.3–3</span><span><i style="background:#b48cff"></i>airtime</span><span><i style="background:#ff4f9a"></i>&lt;−0.5</span>`;
    return `<span><i style="background:rgb(47,127,214)"></i>slow</span><span><i style="background:rgb(243,179,61)"></i>fast</span><span><i style="background:rgb(255,81,70)"></i>${Math.round(an ? an.maxV * 3.6 : 0)} km/h</span>`;
  }

  // ---------- minimap ----------
  const mini = $('minimap'), mg = mini.getContext('2d');
  function drawMini() {
    if (mini.hidden || !trk) return; const r = sizeCanvas(mini); mg.setTransform(r.dpr, 0, 0, r.dpr, 0, 0); mg.clearRect(0, 0, r.w, r.h);
    let x0 = 1e9, x1 = -1e9, y1 = 10; for (let k = 0; k < trk.nm; k += 4) { x0 = Math.min(x0, trk.profX[k]); x1 = Math.max(x1, trk.profX[k]); y1 = Math.max(y1, trk.profY[k]); }
    const sc = Math.min((r.w - 16) / (x1 - x0 || 1), (r.h - 14) / y1 * 2); const X = x => 8 + (x - x0) * ((r.w - 16) / (x1 - x0 || 1)), Y = y => r.h - 6 - y * Math.min((r.h - 14) / y1, sc);
    mg.strokeStyle = 'rgba(200,215,228,0.55)'; mg.lineWidth = 1.5; mg.beginPath();
    for (let k = 0; k < trk.nm; k += 2) { const a = X(trk.profX[k]), b = Y(trk.profY[k]); k ? mg.lineTo(a, b) : mg.moveTo(a, b); } mg.stroke();
    if (train && train.s <= trk.Lm) { const kk = Math.min(trk.nm - 1, Math.round(train.s / DS)); mg.fillStyle = COL.signal; mg.beginPath(); mg.arc(X(trk.profX[kk]), Y(trk.profY[kk]), 4, 0, 7); mg.fill(); }
  }

  // ---------- stage interaction ----------
  const ptrs = new Map(); let drag = null, lastTap = { t: 0, x: 0, y: 0 }, lastLookAt = 0;
  function hitNode(px, py) { const touch = matchMedia('(pointer:coarse)').matches; const R = touch ? 22 : 13; let best = -1, bd = R * R;
    S.nodes.forEach((n, i) => { const d = (sx(n.x) - px) ** 2 + (sy(n.y) - py) ** 2; if (d < bd) { bd = d; best = i; } }); return best; }
  function localXY(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
  stage.addEventListener('pointerdown', e => {
    if (e.target.closest('.ov') && e.target.closest('.ov') !== mini) return;
    stage.setPointerCapture(e.pointerId); const [x, y] = localXY(e); ptrs.set(e.pointerId, { x, y });
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; drag = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), sc0: BV.sc, dist0: view.dist, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, ox0: BV.ox, oy0: BV.oy }; return; }
    if (S.cam === 'overview') {
      const hit = hitNode(x, y);
      if (hit >= 0) { selectNode(hit); if (S.mode === 'build') drag = { kind: 'node', i: hit, moved: false }; else drag = { kind: 'pan', x, y, ox: BV.ox, oy: BV.oy }; }
      else {
        const now = performance.now();
        if (S.mode === 'build' && e.pointerType !== 'mouse' && now - lastTap.t < 330 && Math.hypot(x - lastTap.x, y - lastTap.y) < 28) { insertNodeAt(x, y); lastTap.t = 0; drag = null; return; }
        lastTap = { t: now, x, y }; drag = { kind: 'pan', x, y, ox: BV.ox, oy: BV.oy };
      }
    } else drag = { kind: 'look', x, y };
  });
  stage.addEventListener('pointermove', e => {
    const [x, y] = localXY(e);
    if (!ptrs.has(e.pointerId)) { if (S.cam === 'overview' && e.pointerType === 'mouse') board.style.cursor = hitNode(x, y) >= 0 ? (S.mode === 'build' ? 'grab' : 'pointer') : 'default'; return; }
    const p = ptrs.get(e.pointerId); const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
    if (!drag) return;
    if (drag.kind === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y); const f = d / Math.max(10, drag.d0);
      if (S.cam === 'overview') { const mx = drag.mx, my = drag.my; const sc = clamp(drag.sc0 * f, 0.04, 40); BV.ox = mx - (mx - drag.ox0) * sc / drag.sc0; BV.oy = my - (my - drag.oy0) * sc / drag.sc0; BV.sc = sc; boardDirty = true; }
      else if (S.cam === 'follow') view.dist = clamp(drag.dist0 / f, 8, 220);
    } else if (drag.kind === 'node') {
      const n = S.nodes[drag.i]; if (!drag.moved) { beginEdit(); drag.moved = true; }
      const [wx, wy] = fromScreen(x, y); n.x = +clamp(wx, -100, 6000).toFixed(1); n.y = +clamp(wy, 0, 220).toFixed(1); liveUpdate();
    } else if (drag.kind === 'pan') { BV.ox += dx; BV.oy += dy; boardDirty = true; }
    else if (drag.kind === 'look') {
      if (S.cam === 'pov') { view.lookYaw = clamp(view.lookYaw - dx * 0.006, -1.9, 1.9); view.lookPitch = clamp(view.lookPitch - dy * 0.005, -1.0, 0.9); lastLookAt = performance.now(); }
      else { view.az -= dx * 0.007; view.el = clamp(view.el + dy * 0.005, 0.04, 1.4); }
    }
  });
  const endPtr = e => {
    ptrs.delete(e.pointerId);
    if (drag && drag.kind === 'node' && drag.moved) endEdit();
    if (ptrs.size === 0) drag = null; else if (drag && drag.kind === 'pinch') drag = null;
  };
  stage.addEventListener('pointerup', endPtr); stage.addEventListener('pointercancel', endPtr);
  stage.addEventListener('dblclick', e => { if (S.cam !== 'overview' || S.mode !== 'build') { if (S.cam === 'pov') { view.lookYaw = 0; view.lookPitch = 0; } return; } const [x, y] = localXY(e); if (hitNode(x, y) < 0) insertNodeAt(x, y); });
  stage.addEventListener('wheel', e => {
    if (e.target.closest('.ov')) return; e.preventDefault(); const f = Math.exp(-e.deltaY * 0.0015);
    if (S.cam === 'overview') { const [x, y] = localXY(e); const sc = clamp(BV.sc * f, 0.04, 40); BV.ox = x - (x - BV.ox) * sc / BV.sc; BV.oy = y - (y - BV.oy) * sc / BV.sc; BV.sc = sc; boardDirty = true; }
    else if (S.cam === 'follow') view.dist = clamp(view.dist / f, 8, 220);
  }, { passive: false });
  function zoomBoard(f) { const x = BV.w / 2, y = BV.h / 2; const sc = clamp(BV.sc * f, 0.04, 40); BV.ox = x - (x - BV.ox) * sc / BV.sc; BV.oy = y - (y - BV.oy) * sc / BV.sc; BV.sc = sc; boardDirty = true; }

  // ---------- node editing ----------
  function selectNode(i) { S.sel = clamp(i, 0, S.nodes.length - 1); refreshInspector(); boardDirty = true; }
  function insertNodeAt(px, py) {
    const [wx, wy] = fromScreen(px, py); let best = 0, bd = 1e18;
    for (let k = 0; k < trk.nm; k++) { const d = (sx(trk.profX[k]) - px) ** 2 + (sy(trk.profY[k]) - py) ** 2; if (d < bd) { bd = d; best = k; } }
    const seg = clamp(Math.floor(trk.u[best]), 0, S.nodes.length - 2);
    pushHistory();
    const nextType = S.nodes[seg + 1].type === 'station' ? 'steel' : S.nodes[seg + 1].type;
    S.nodes.splice(seg + 1, 0, { x: +wx.toFixed(1), y: +Math.max(0, wy).toFixed(1), yaw: 0, roll: 0, type: nextType });
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
    const k = S.sel; const kk = Math.min(trk.nm - 1, Math.round(trk.nodeS[k] / DS));
    let v = an && isFinite(an.spd[kk]) ? an.spd[kk] : energySpeed(S.nodes, k);
    pushHistory();
    const r = spliceElement(S.nodes, k, kind, v);
    if (!r.added) { undoStack.pop(); updUndo(); toast('Not enough height here for a drop'); return; }
    S.nodes = r.nodes; S.sel = k + r.added; commit();
    const names = { loop: 'Vertical loop', camelback: 'Camelback hill', bankleft: 'Banked left turn', bankright: 'Banked right turn', drop: 'Steep drop', helix: 'Helix', scurve: 'S-curve' };
    toast(`${names[kind]} added · track shifted ${Math.round(r.span)} m`, 'Undo', undo); ensureVisible();
  }
  function ensureVisible() { const n = S.nodes[S.sel]; const X = sx(n.x), Y = sy(n.y); if (X < 20 || X > BV.w - 20 || Y < 20 || Y > BV.h - 20) fitBoard(); }

  // ---------- inspector ----------
  const F = { x: ['fX', 'fXn'], y: ['fY', 'fYn'], yaw: ['fYaw', 'fYawn'], roll: ['fRoll', 'fRolln'] };
  function refreshInspector(light) {
    const n = S.nodes[S.sel]; if (!n) return;
    $('nIdx').textContent = S.sel; $('nCount').textContent = S.nodes.length - 1; $('insTag').textContent = `after node #${S.sel}`;
    let maxX = 0; for (const q of S.nodes) maxX = Math.max(maxX, q.x); $('fX').max = Math.max(1400, Math.ceil((maxX + 200) / 100) * 100);
    for (const key in F) { const [r, num] = F[key]; if (document.activeElement !== $(r)) $(r).value = n[key]; if (document.activeElement !== $(num)) $(num).value = n[key]; }
    if (!light) {
      document.querySelectorAll('.typeseg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.t === n.type)));
      $('nPrev').disabled = S.sel <= 0; $('nNext').disabled = S.sel >= S.nodes.length - 1; $('nDel').disabled = S.nodes.length <= 2;
    }
  }
  for (const key in F) {
    const [r, num] = F[key];
    const apply = (val, live) => { const n = S.nodes[S.sel]; let v = parseFloat(val); if (!isFinite(v)) return;
      const lim = { x: [-100, 6000], y: [0, 220], yaw: [-90, 90], roll: [-80, 80] }[key]; v = clamp(v, lim[0], lim[1]); n[key] = v; live ? liveUpdate() : null; };
    $(r).addEventListener('input', () => { if (S.mode === 'ride') return; beginEdit(); apply($(r).value, true); $(num).value = $(r).value; });
    $(r).addEventListener('change', () => endEdit());
    $(num).addEventListener('change', () => { if (S.mode === 'ride') return; beginEdit(); apply($(num).value, true); endEdit(); });
  }
  $('yawQuick').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || S.mode === 'ride') return; pushHistory(); S.nodes[S.sel].yaw = +b.dataset.y; commit(); });
  document.querySelector('.typeseg').addEventListener('click', e => { const b = e.target.closest('button'); if (!b || S.mode === 'ride') return; pushHistory(); S.nodes[S.sel].type = b.dataset.t; commit({ resetTrain: false }); });
  $('bAutoBank').onclick = () => { if (S.mode === 'ride') return; const n = S.nodes[S.sel]; if (!n.yaw) { toast('This node has no turn. Set a turn angle first.'); return; } pushHistory(); n.roll = autoBankFor(S.nodes, S.sel, trk, an); commit(); toast(`Banked to ${Math.abs(n.roll)}° for the predicted speed`); };
  $('bAlign').onclick = () => { if (S.mode === 'ride') return; pushHistory(); const l = S.nodes[S.nodes.length - 1]; l.y = S.nodes[0].y; S.sel = S.nodes.length - 1; commit(); toast('Final node levelled with the station'); };
  $('nPrev').onclick = () => selectNode(S.sel - 1); $('nNext').onclick = () => selectNode(S.sel + 1); $('nDel').onclick = deleteNode;
  document.querySelectorAll('.elbtn[data-el]').forEach(b => b.onclick = () => insertElement(b.dataset.el));
  $('bAppend').onclick = appendNode;
  $('bPaint').onclick = () => { if (!glOK) return; S.paint = (S.paint + 1) % World.PAINTS.length; const nm = World.setPaint(S.paint); $('paintTag').textContent = nm; savePrefs(); toast(`Paint: ${nm}`); };

  // ---------- design check ----------
  function refreshCheck() {
    if (!an) return; const row = (k, v, cls = '') => `<dt>${k}</dt><dd class="${cls}">${v}</dd>`;
    const cg = v => v > 5.5 ? 'bad' : v > 4.2 ? 'warn' : 'good';
    $('check').innerHTML = row('Track length', `${Math.round(trk.Lm)} m${S.closed ? ` + ${Math.round(trk.L - trk.Lm)} m return` : ''}`) + row('Max height', `${trk.maxY.toFixed(1)} m`) +
      row('Top speed', `${Math.round(an.maxV * 3.6)} km/h`) + row('Peak vertical G', `${an.maxVG.toFixed(2)} G`, cg(an.maxVG)) +
      row('Lowest vertical G', `${an.minVG.toFixed(2)} G`, an.minVG < -1.5 ? 'bad' : an.minVG < -0.8 ? 'warn' : 'good') + row('Peak lateral G', `${an.maxLG.toFixed(2)} G`, an.maxLG > 1.8 ? 'warn' : 'good') +
      row('Airtime', `${an.airtime.toFixed(1)} s`) + row('Ride time', `${Math.round(an.duration)} s`);
    let note = '';
    if (an.stallS != null) { let j = 0; for (let i = 0; i < trk.nodeS.length; i++) if (trk.nodeS[i] <= an.stallS) j = i; note = `<div class="note">The train runs out of energy near ${Math.round(an.stallS)} m (after node #${j}). Lower the hill ahead of it or add a chain lift.</div>`; }
    else if (an.maxVG > 5.5 || an.minVG < -1.5) note = `<div class="note">Some forces exceed rider limits. The orange and red sections on the Overview show where to open up the curve.</div>`;
    else note = `<div class="note ok">The train completes the ${S.closed ? 'circuit' : 'run'} with forces inside rider limits.</div>`;
    $('checkNote').innerHTML = note;
  }

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
    if (alertS.dismissed[lv.code]) return;
    if (alertS.shown && alertS.shown.sev > lv.sev && !$('banner').hidden) return;
    alertS.shown = lv; const b = $('banner'); b.hidden = false; b.classList.toggle('amber', lv.sev < 3);
    $('banT').textContent = lv.label;
    const what = lv.code === 'lateral' ? `${Math.abs(lg).toFixed(1)} G sideways` : `${vg.toFixed(1)} G vertical`;
    const fix = lv.code === 'lateral' ? 'Bank this turn more (try Auto-bank).' : lv.code === 'redout' ? 'Round off the crest or slow the train.' : 'Open up the curve or reduce speed here.';
    $('banD').textContent = `${what} at ${Math.round(s)} m. ${fix}`;
  }
  $('banClear').onclick = () => { resetPeaks(); alertS.dismissed = {}; alertS.shown = null; $('banner').hidden = true; };
  $('banX').onclick = () => { if (alertS.shown) alertS.dismissed[alertS.shown.code] = true; alertS.shown = null; $('banner').hidden = true; };

  const gs = { vg: 1, lg: 0 };
  let teleT = 0, scopeT = 0, perfT = 0;
  function updTelemetry() {
    const s = train.s, v = Math.abs(train.v), y = trk.get(trk.py, s);
    const typ = trk.typeAt(s);
    $('tSpd').innerHTML = `${Math.round(v * 3.6)}<small>km/h</small>`; $('tAlt').innerHTML = `${y.toFixed(1)}<small>m</small>`;
    $('tVg').textContent = gs.vg.toFixed(2); $('tLg').textContent = gs.lg.toFixed(2);
    $('pMax').textContent = peaks.max.toFixed(2); $('pMin').textContent = peaks.min.toFixed(2); $('pLat').textContent = peaks.lat.toFixed(2); $('pSpd').textContent = Math.round(peaks.spd * 3.6);
    $('lapN').textContent = train.lap;
    const lv = train.phase === 'run' ? safetyLevel(gs.vg, gs.lg) : { code: 'safe', label: 'SAFE', sev: 0 };
    const pill = $('safety'); pill.textContent = lv.label; pill.className = 'pill' + (lv.sev >= 3 ? ' crit' : lv.sev > 0 ? ' warn' : '');
    const m = TRAIN.mass, ke = 0.5 * m * v * v / 1000, pe = m * G * (y - trk.minY) / 1000;
    const eRef = Math.max(1, m * G * (trk.maxY - trk.minY) / 1000 * 1.1);
    $('keV').textContent = `${Math.round(ke).toLocaleString()} kJ`; $('peV').textContent = `${Math.round(pe).toLocaleString()} kJ`; $('eTot').textContent = `${Math.round(ke + pe).toLocaleString()} kJ total`;
    $('keBar').style.width = clamp(ke / eRef * 100, 0, 100) + '%'; $('peBar').style.width = clamp(pe / eRef * 100, 0, 100) + '%';
    if (!$('hud').hidden) {
      $('hSeg').textContent = train.phase === 'load' ? 'Loading' : TYPE_LABEL[typ];
      $('hSpd').innerHTML = `${Math.round(v * 3.6)}<small>km/h</small>`; $('hAlt').innerHTML = `${y.toFixed(0)}<small>m</small>`;
      $('hVg').textContent = gs.vg.toFixed(1); $('hLg').textContent = gs.lg.toFixed(1);
    }
  }

  // ---------- audio: procedural synth ----------
  const Sound = (() => {
    let ctx = null, master, noiseBuf, rumbleG, rumbleF, windG, windF, brakeG, brakeF, bo1, bo2, tyreG, tyreO, mode = 0, nextClack = 0, lastScream = -10;
    function init() {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC(); const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 5;
      master = ctx.createGain(); master.gain.value = 0; master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const d = noiseBuf.getChannelData(0); let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
      const loop = () => { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; s.start(0, Math.random() * 1.5); return s; };
      rumbleF = ctx.createBiquadFilter(); rumbleF.type = 'lowpass'; rumbleF.frequency.value = 90; rumbleF.Q.value = 1.1; rumbleG = ctx.createGain(); rumbleG.gain.value = 0; loop().connect(rumbleF).connect(rumbleG).connect(master);
      windF = ctx.createBiquadFilter(); windF.type = 'bandpass'; windF.frequency.value = 500; windF.Q.value = 0.5; windG = ctx.createGain(); windG.gain.value = 0; loop().connect(windF).connect(windG).connect(master);
      bo1 = ctx.createOscillator(); bo1.type = 'sawtooth'; bo2 = ctx.createOscillator(); bo2.type = 'square'; brakeF = ctx.createBiquadFilter(); brakeF.type = 'bandpass'; brakeF.Q.value = 7;
      brakeG = ctx.createGain(); brakeG.gain.value = 0; const b2g = ctx.createGain(); b2g.gain.value = 0.35; bo1.connect(brakeF); bo2.connect(b2g).connect(brakeF); brakeF.connect(brakeG).connect(master); bo1.start(); bo2.start();
      tyreO = ctx.createOscillator(); tyreO.type = 'triangle'; tyreO.frequency.value = 55; tyreG = ctx.createGain(); tyreG.gain.value = 0; tyreO.connect(tyreG).connect(master); tyreO.start();
      return true;
    }
    function setMode(m) {
      mode = m;
      if (m > 0) { if (!ctx && !init()) { toast('Audio is not available in this browser'); return; } ctx.resume(); master.gain.setTargetAtTime(0.85, ctx.currentTime, 0.15); }
      else if (ctx) master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
    }
    const env = (g, t, peak, a, d) => { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); };
    function clack(t) {
      for (const [dt, amp] of [[0, 0.5], [0.07, 0.32]]) {
        const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900 + Math.random() * 700; f.Q.value = 4;
        const g = ctx.createGain(); env(g, t + dt, amp, 0.003, 0.06); s.connect(f).connect(g).connect(master); s.start(t + dt, Math.random() * 1.5, 0.09);
        const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(820, t + dt); o.frequency.exponentialRampToValueAtTime(260, t + dt + 0.05);
        const og = ctx.createGain(); env(og, t + dt, amp * 0.5, 0.002, 0.07); o.connect(og).connect(master); o.start(t + dt); o.stop(t + dt + 0.1);
      }
    }
    function voice(t, f0, dur, amp, low) {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(f0 * (low ? 0.9 : 0.8), t); o.frequency.linearRampToValueAtTime(f0 * (low ? 1.35 : 1.25), t + 0.18 + Math.random() * 0.1);
      o.frequency.linearRampToValueAtTime(f0 * 1.05, t + dur * 0.6); o.frequency.linearRampToValueAtTime(f0 * 0.72, t + dur);
      const lfo = ctx.createOscillator(); lfo.frequency.value = 5.5 + Math.random() * 3; const lg = ctx.createGain(); lg.gain.value = f0 * 0.035; lfo.connect(lg).connect(o.frequency);
      const out = ctx.createGain(); out.gain.setValueAtTime(0.0001, t); out.gain.exponentialRampToValueAtTime(amp, t + 0.07); out.gain.setTargetAtTime(amp * 0.75, t + 0.25, 0.4); out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      const fm = low ? [600, 1050, 2400] : [900 + Math.random() * 200, 1400 + Math.random() * 300, 2800 + Math.random() * 300];
      [1, 0.65, 0.3].forEach((gain, i) => { const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = fm[i]; f.Q.value = 9; const g = ctx.createGain(); g.gain.value = gain; o.connect(f).connect(g).connect(out); });
      out.connect(master); o.start(t); lfo.start(t); o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; const nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 3000; nf.Q.value = 0.8;
      const ng = ctx.createGain(); env(ng, t, amp * 0.25, 0.06, dur); s.connect(nf).connect(ng).connect(master); s.start(t, Math.random(), dur + 0.1);
    }
    function scream(t, k) { const n = 3 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) voice(t + Math.random() * 0.4, 520 + Math.random() * 600, 1.0 + Math.random() * 1.4, (0.09 + Math.random() * 0.06) * k, Math.random() < 0.3); }
    function cheer() {
      if (!ctx || mode !== 2) return; const t = ctx.currentTime;
      const s = ctx.createBufferSource(); s.buffer = noiseBuf; const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = 0.6; const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6); s.connect(f).connect(g).connect(master); s.start(t, 0, 2.7);
      for (let i = 0; i < 34; i++) { const tt = t + Math.random() * 2.2; const c = ctx.createBufferSource(); c.buffer = noiseBuf; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400; const cg = ctx.createGain(); env(cg, tt, 0.18 + Math.random() * 0.15, 0.002, 0.03); c.connect(hp).connect(cg).connect(master); c.start(tt, Math.random() * 1.5, 0.05); }
      for (let i = 0; i < 4; i++) voice(t + Math.random() * 0.6, 330 + Math.random() * 180, 0.9 + Math.random() * 0.7, 0.07, true);
    }
    function update(p) {
      if (!ctx || mode === 0) return; const t = ctx.currentTime; const v = Math.abs(p.v);
      rumbleG.gain.setTargetAtTime(Math.pow(Math.min(1, v / 32), 1.25) * 0.95, t, 0.08); rumbleF.frequency.setTargetAtTime(70 + v * 5.5, t, 0.1);
      windG.gain.setTargetAtTime(Math.min(1.2, (v / 36) ** 2) * 0.55, t, 0.12); windF.frequency.setTargetAtTime(320 + v * 42, t, 0.12);
      const onBr = p.type === T_BRAKES && v > 0.5; const bf = 120 + v * 24;
      brakeG.gain.setTargetAtTime(onBr ? Math.min(1, v / 10) * 0.28 : 0, t, 0.05); bo1.frequency.setTargetAtTime(bf, t, 0.04); bo2.frequency.setTargetAtTime(bf * 1.498, t, 0.04); brakeF.frequency.setTargetAtTime(380 + v * 70, t, 0.05);
      const onTyre = (p.type === T_STATION || p.type === T_TRANSFER) && v > 0.3; tyreG.gain.setTargetAtTime(onTyre ? 0.12 : 0, t, 0.1); tyreO.frequency.setTargetAtTime(45 + v * 9, t, 0.1);
      if (p.type === T_CHAIN && v > 0.3 && p.phase === 'run') { if (nextClack < t) nextClack = t + 0.02; while (nextClack < t + 0.15) { clack(nextClack); nextClack += 1.15 / Math.max(0.6, v); } }
      if (mode === 2 && p.phase === 'run') {
        const air = p.vg < 0.3 && v > 9, plunge = p.ty < -0.55 && v > 13, inv = p.uy < -0.2 && v > 6, heavy = p.vg > 3.4;
        if ((air || plunge || inv || heavy) && t - lastScream > 2.6) { scream(t, Math.min(1.4, 0.7 + v / 40)); lastScream = t + Math.random() * 1.2; }
      }
    }
    return { setMode, update, cheer };
  })();

  // ---------- modes & controls ----------
  function setPressed(ids, on) { ids.forEach(id => $(id).setAttribute('aria-pressed', String(id === on))); }
  function setMode(m) {
    S.mode = m; setPressed(['mBuild', 'mRide'], m === 'build' ? 'mBuild' : 'mRide');
    document.body.classList.toggle('locked', m === 'ride'); $('left').classList.toggle('locked', m === 'ride');
    document.querySelectorAll('.elbtn, #inspector .editable input, #inspector .editable button').forEach(el => el.disabled = m === 'ride');
    if (m === 'ride') { train = newTrainState(trk); train.timer = 1.0; resetPeaks(); setPlaying(true); if (S.cam === 'overview' && glOK) setCam('pov'); toast('Ride mode: editing locked'); }
    updUndo(); refreshInspector();
  }
  function setPlaying(p) { S.playing = p; $('playLbl').textContent = p ? 'Pause' : 'Play'; $('playIco').innerHTML = p ? '<path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/>' : '<path d="M4 2.5v11l9-5.5z"/>'; }
  function refreshCircuit() { setPressed(['cOpen', 'cClosed'], S.closed ? 'cClosed' : 'cOpen'); }
  function setCircuit(closed) { if (closed === S.closed) return; pushHistory(); S.closed = closed; refreshCircuit(); commit({ resetTrain: true }); toast(closed ? 'Closed circuit: the end now returns to the station' : 'Open shuttle: the train stops or rolls back at the end'); }
  function setAudio(m) { S.audio = m; setPressed(['aOff', 'aTrack', 'aRiders'], ['aOff', 'aTrack', 'aRiders'][m]); Sound.setMode(m); }
  function setCam(c) {
    if (c !== 'overview' && !glOK) { toast('3D view needs WebGL, which is unavailable here'); c = 'overview'; }
    S.cam = c; view.mode = c; setPressed(['camOverview', 'camFollow', 'camPov'], { overview: 'camOverview', follow: 'camFollow', pov: 'camPov' }[c]);
    const ov = c === 'overview';
    $('board').hidden = !ov; $('gl').hidden = ov; $('boardtools').hidden = !ov; $('legend').hidden = !ov; $('minimap').hidden = ov; $('hud').hidden = c !== 'pov'; $('povtools').hidden = c !== 'pov'; $('perf').hidden = ov;
    $('vignette').style.opacity = 0;
    if (ov) { boardDirty = true; requestAnimationFrame(() => { if (needFit) { needFit = false; fitBoard(); } drawBoard(); }); } else onResize();
    savePrefs();
  }
  $('mBuild').onclick = () => setMode('build'); $('mRide').onclick = () => setMode('ride');
  $('bUndo').onclick = undo; $('bRedo').onclick = redo;
  $('bPlay').onclick = () => setPlaying(!S.playing);
  $('bRestart').onclick = () => { train = newTrainState(trk); train.timer = 0.8; resetPeaks(); toast('Train returned to the station'); };
  $('cOpen').onclick = () => setCircuit(false); $('cClosed').onclick = () => setCircuit(true);
  $('aOff').onclick = () => setAudio(0); $('aTrack').onclick = () => setAudio(1); $('aRiders').onclick = () => setAudio(2);
  $('camOverview').onclick = () => setCam('overview'); $('camFollow').onclick = () => setCam('follow'); $('camPov').onclick = () => setCam('pov');
  $('bFit').onclick = fitBoard; $('bZoomIn').onclick = () => zoomBoard(1.25); $('bZoomOut').onclick = () => zoomBoard(0.8);
  $('bVex').onclick = () => { S.vex = S.vex >= 3 ? 1 : S.vex + 1; $('bVex').textContent = `Height ×${S.vex}`; fitBoard(); savePrefs(); };
  $('bColor').onclick = () => { S.colorMode = S.colorMode === 'g' ? 'speed' : 'g'; $('bColor').textContent = S.colorMode === 'g' ? 'Colour: G-force' : 'Colour: Speed'; $('legend').innerHTML = legendHTML(); boardDirty = true; savePrefs(); };
  $('bGuides').onclick = () => { S.guides = !S.guides; $('bGuides').setAttribute('aria-pressed', String(S.guides)); if (glOK) World.setGuides(S.guides); savePrefs(); };
  $('bSeat').onclick = () => { S.seat = S.seat ? 0 : 1; view.seat = S.seat; $('bSeat').textContent = S.seat ? 'Seat: Rear' : 'Seat: Front'; };
  $('bLook').onclick = () => { view.lookYaw = 0; view.lookPitch = 0; };
  $('bTime').onclick = () => { if (!glOK) return; $('timeLbl').textContent = World.cycleTime(); S.tod = World.todKey; savePrefs(); };
  $('selQuality').onchange = () => {
    S.quality = $('selQuality').value; savePrefs(); if (!glOK) return;
    $('loading').hidden = false; $('loadS').textContent = 'Rebuilding scenery at the new quality';
    setTimeout(() => { const t = World.setQuality(S.quality); World.setGuides(S.guides); World.setPaint(S.paint); $('loading').hidden = true; onResize(); toast(`Graphics: ${World.TIERS[t].name}`); refreshSys(); }, 40);
  };
  $('bFull').onclick = () => { const el = stage; if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); else if (el.requestFullscreen) el.requestFullscreen().catch(() => toast('Fullscreen is not available here. Try the Full size button.')); else toast('Fullscreen is not available here'); };
  document.querySelectorAll('#sizesw button').forEach(b => b.onclick = () => { S.viewPct = +b.dataset.pct; document.querySelectorAll('#sizesw button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); applyStageH(); savePrefs(); });
  const ps = $('selPreset'); ps.innerHTML = '<option value="">Load preset…</option>' + PRESET_ORDER.map(k => `<option value="${k}">${PRESET_DEFS[k]().name}</option>`).join('');
  ps.onchange = () => { const k = ps.value; ps.value = ''; if (!k) return; if (S.mode === 'ride') setMode('build'); loadPreset(k); };

  // ---------- save / load ----------
  function slots() { return LS.get(K_SLOTS, []); }
  function renderSlots() {
    const list = slots(); const el = $('slots');
    if (!list.length) { el.innerHTML = '<div class="empty">No saved designs yet. Name this coaster above and save it.</div>'; return; }
    el.innerHTML = list.map((s, i) => `<div class="slot"><div class="meta"><b>${esc(s.name)}</b><small>${s.nodes.length} nodes · ${s.closed ? 'closed' : 'open'} · ${new Date(s.ts).toLocaleString()}</small></div>
      <button class="btn" data-load="${i}">Load</button><button class="btn danger" data-del="${i}">Delete</button></div>`).join('');
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function blueprint() { return JSON.stringify({ app: 'CoasterLab', version: 1, name: S.name || 'Untitled coaster', closed: S.closed, nodes: S.nodes }, null, 1); }
  function openModal() { $('modal').hidden = false; $('saveName').value = S.name || ''; $('exportBox').value = blueprint(); $('importMsg').textContent = ''; renderSlots(); setTimeout(() => $('saveName').focus(), 30); }
  function closeModal() { $('modal').hidden = true; }
  $('bSave').onclick = openModal; $('mClose').onclick = closeModal; $('mBack').onclick = closeModal;
  $('saveName').addEventListener('keydown', e => { if (e.key === 'Enter') $('bDoSave').click(); }); $('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  $('bDoSave').onclick = () => {
    const name = $('saveName').value.trim() || `Coaster ${new Date().toLocaleDateString()}`; S.name = name;
    const list = slots(); const i = list.findIndex(s => s.name === name); const rec = { name, ts: Date.now(), closed: S.closed, nodes: S.nodes };
    if (i >= 0) list[i] = rec; else list.unshift(rec); if (list.length > 40) list.length = 40;
    if (LS.set(K_SLOTS, list)) { autosave(); closeModal(); toast(i >= 0 ? `Updated “${name}”` : `Saved “${name}”`); } else $('importMsg').textContent = 'Saving is blocked in this browser, so use Copy JSON to keep a copy.';
  };
  $('slots').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const list = slots();
    if (b.dataset.load != null) { const s = list[+b.dataset.load]; if (S.mode === 'ride') setMode('build'); pushHistory(); S.nodes = s.nodes.map(n => ({ ...n })); S.closed = s.closed; S.name = s.name; S.sel = Math.min(1, S.nodes.length - 1); commit({ resetTrain: true }); refreshCircuit(); fitBoard(); closeModal(); toast(`Loaded “${s.name}”`); }
    if (b.dataset.del != null) {
      if (b.dataset.armed) { const nm = list[+b.dataset.del].name; list.splice(+b.dataset.del, 1); LS.set(K_SLOTS, list); renderSlots(); toast(`Deleted “${nm}”`); }
      else { b.dataset.armed = '1'; b.textContent = 'Confirm delete'; setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = 'Delete'; } }, 3000); }
    }
  });
  $('bCopy').onclick = () => { const t = $('exportBox'); const fallback = () => { t.focus(); t.select(); toast('Select-all done. Copy it from the box.'); };
    try { navigator.clipboard.writeText(t.value).then(() => toast('Blueprint copied'), fallback); } catch (e) { fallback(); } };
  function importText(txt) {
    let o; try { o = JSON.parse(txt); } catch (e) { $('importMsg').textContent = 'That is not valid JSON. Check that the whole blueprint was pasted.'; return; }
    const arr = Array.isArray(o) ? o : o && o.nodes; if (!Array.isArray(arr) || arr.length < 2) { $('importMsg').textContent = 'The blueprint needs a "nodes" list with at least 2 nodes.'; return; }
    const nodes = []; for (const n of arr) { if (!n || !isFinite(+n.x) || !isFinite(+n.y)) { $('importMsg').textContent = 'Every node needs numeric x and y values.'; return; }
      const q = { x: clamp(+n.x, -100, 6000), y: clamp(+n.y, 0, 220), yaw: clamp(+n.yaw || 0, -90, 90), roll: clamp(+n.roll || 0, -80, 80), type: TYPE_CODE[n.type] != null && n.type !== 'transfer' ? n.type : 'steel' };
      if (n.lat) q.lat = clamp(+n.lat, -5, 5); nodes.push(q); }
    if (S.mode === 'ride') setMode('build');
    pushHistory(); S.nodes = nodes; S.closed = o.closed != null ? !!o.closed : S.closed; S.name = o.name || 'Imported coaster'; S.sel = Math.min(1, nodes.length - 1);
    commit({ resetTrain: true }); refreshCircuit(); fitBoard(); closeModal(); toast(`Imported “${S.name}” · ${nodes.length} nodes`);
  }
  $('bImport').onclick = () => importText($('importBox').value);
  $('importFile').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => importText(String(r.result)); r.readAsText(f); e.target.value = ''; };

  // ---------- keyboard ----------
  document.addEventListener('keydown', e => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) && document.activeElement.type !== 'range';
    if ((e.ctrlKey || e.metaKey) && !typing) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); } else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); redo(); }
      return;
    }
    if (typing) { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); return; }
    if (e.key === 'Escape' && !$('modal').hidden) { closeModal(); return; }
    if (!$('modal').hidden || !$('start').hidden) return;
    if (e.key === ' ') { e.preventDefault(); setPlaying(!S.playing); }
    else if (e.key === 'Delete' || e.key === 'Backspace') deleteNode();
    else if (e.key === '[') selectNode(S.sel - 1); else if (e.key === ']') selectNode(S.sel + 1);
    else if (e.key === '1') setCam('overview'); else if (e.key === '2') setCam('follow'); else if (e.key === '3') setCam('pov');
  });

  // ---------- sizing ----------
  function applyStageH() {
    document.querySelectorAll('#sizesw button').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.pct === S.viewPct)));
    if (innerWidth <= 1100) { const navH = $('nav').offsetHeight; const avail = innerHeight - navH - 8; const h = S.viewPct >= 100 ? avail : avail * S.viewPct / 100; document.documentElement.style.setProperty('--stageH', Math.max(200, Math.round(h)) + 'px'); }
    onResize();
  }
  function onResize() {
    const r = stage.getBoundingClientRect();
    if (glOK && S.cam !== 'overview') World.resize(Math.max(1, Math.round(r.width)), Math.max(1, Math.round(r.height)));
    const before = BV.w; const rr = sizeCanvas(board); const changed = Math.abs(before - rr.w) > 2; BV.w = rr.w; BV.h = rr.h;
    if (changed) fitBoard(); boardDirty = true;
  }
  new ResizeObserver(() => onResize()).observe(stage);
  addEventListener('resize', applyStageH);
  function refreshSys() { if (!glOK) { $('sysline').textContent = '3D unavailable: WebGL could not start. The 2D builder still works.'; return; } const st = World.stats(); $('sysline').textContent = `${World.gpu} · ${st.tierName} · ${Math.round(st.fps)} fps @ ${st.pr.toFixed(2)}× res`; }

  // ---------- main loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000)); last = now;
    if (S.playing && trk) {
      let acc = dt; const h = 1 / 240;
      while (acc > 1e-6) { const d = Math.min(h, acc); physStep(train, trk, d); acc -= d; handleEvent(train.event); }
    }
    // forces
    let vg = 1, lg = 0;
    if (train.phase !== 'load') [vg, lg] = gForces(trk, train.s, train.v, train.aT);
    const k = Math.min(1, dt * 9); gs.vg += (vg - gs.vg) * k; gs.lg += (lg - gs.lg) * k;
    const typ = trk.typeAt(train.s);
    if (train.phase === 'run' && typ !== T_STATION && typ !== T_TRANSFER) {
      peaks.max = Math.max(peaks.max, gs.vg); peaks.min = Math.min(peaks.min, gs.vg); peaks.lat = Math.max(peaks.lat, Math.abs(gs.lg)); peaks.spd = Math.max(peaks.spd, Math.abs(train.v));
      const lv = safetyLevel(gs.vg, gs.lg); if (lv.sev > 0) showBanner(lv, gs.vg, gs.lg, train.s);
    }
    if (S.playing) { scopeBuf.vg[scopeBuf.i] = gs.vg; scopeBuf.lg[scopeBuf.i] = gs.lg; scopeBuf.i = (scopeBuf.i + 1) % scopeBuf.vg.length; }
    Sound.update({ v: train.v, type: typ, phase: train.phase, vg: gs.vg, ty: trk.get(trk.ty, train.s), uy: trk.get(trk.uy, train.s) });
    // view
    if (S.cam !== 'overview' && glOK) {
      if (S.cam === 'pov' && !(drag && drag.kind === 'look') && now - lastLookAt > 1400) { view.lookYaw *= Math.exp(-dt * 2.5); view.lookPitch *= Math.exp(-dt * 2.5); }
      World.frame(dt, { s: train.s, v: train.v, lg: gs.lg }, view); World.render(dt);
      if (S.cam === 'pov') { const vgn = gs.vg; const grey = clamp((vgn - 3.6) / 2.6, 0, 0.85), red = clamp((-vgn - 0.6) / 1.4, 0, 0.7);
        const vi = $('vignette'); if (grey > 0.01) { vi.style.background = `radial-gradient(ellipse at center, rgba(0,0,0,0) ${Math.round(55 - grey * 35)}%, rgba(8,8,10,${0.5 + grey * 0.5}) 100%)`; vi.style.opacity = grey; }
        else if (red > 0.01) { vi.style.background = `radial-gradient(ellipse at center, rgba(120,0,0,${red * 0.25}) 30%, rgba(150,0,0,${0.4 + red * 0.5}) 100%)`; vi.style.opacity = red; } else vi.style.opacity = 0; }
      if (now - perfT > 500) { perfT = now; const st = World.stats(); $('perf').textContent = `${Math.round(st.fps)} fps · ${st.tierName} · ${st.pr.toFixed(2)}×`; drawMini(); }
    } else if (boardDirty || (S.playing && train.phase !== 'load')) drawBoard();
    if (now - teleT > 90) { teleT = now; updTelemetry(); }
    if (now - scopeT > 33) { scopeT = now; drawScope(); }
    requestAnimationFrame(loop);
  }
  let lastSysT = 0;
  function handleEvent(ev) {
    if (!ev) return;
    if (ev === 'arrived') { Sound.cheer(); }
    if (ev === 'stall') toast(`The train stalled at ${Math.round(train.stallS || 0)} m and was returned to the station`);
    if (ev === 'complete' && !S.closed) toast('Ride complete. Dispatching the next train.');
    if (ev === 'lap') { const n = performance.now(); if (n - lastSysT > 2000) { lastSysT = n; refreshSys(); } }
  }

  // ---------- start screen ----------
  let restored = false, soundOn = true, glState = 'loading';
  function refreshStart() {
    const name = restored && S.name ? S.name : (restored ? 'your last design' : (S.name || 'Hyper-Goliath'));
    $('stRideT').textContent = `Ride ${restored ? name : 'the ' + name.replace(/ Mega Coaster$/, '')}`;
    const info = an ? `${Math.round(an.maxV * 3.6)} km/h top speed · ${Math.round(an.duration)} s ride` : '';
    $('stRideS').textContent = glState === 'fail' ? 'Rides in the 2D overview on this device' : `First-person 3D ride · ${info}`;
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
    else { if (S.mode === 'ride') setMode('build'); setCam('overview'); fitBoard(); }
  }
  $('stRide').onclick = () => leaveStart('ride');
  $('stBuild').onclick = () => leaveStart('build');
  $('stSound').onclick = () => { soundOn = !soundOn; $('stSound').setAttribute('aria-pressed', String(soundOn)); $('stSoundT').textContent = soundOn ? 'Sound on' : 'Sound off'; };
  $('stLoad').onclick = () => { $('start').hidden = true; if (S.mode === 'ride') setMode('build'); setCam('overview'); openModal(); };
  $('stFresh').onclick = () => { restored = false; loadPreset('hyper'); refreshStart(); };
  $('bHome').onclick = () => { if (S.mode === 'ride') setMode('build'); setPlaying(true); openStart(); };

  // ---------- boot ----------
  function boot() {
    $('selQuality').value = S.quality; $('bVex').textContent = `Height ×${S.vex}`; $('bColor').textContent = S.colorMode === 'g' ? 'Colour: G-force' : 'Colour: Speed';
    $('bGuides').setAttribute('aria-pressed', String(S.guides));
    const auto = LS.get(K_AUTO, null);
    if (auto && Array.isArray(auto.nodes) && auto.nodes.length >= 2) {
      S.nodes = auto.nodes; S.closed = !!auto.closed; S.sel = clamp(auto.sel || 1, 0, auto.nodes.length - 1); S.name = auto.name || ''; restored = true;
      rebuild(true, { resetTrain: true }); refreshCircuit(); refreshInspector(); refreshCheck();
    } else loadPreset('hyper', true);
    $('legend').innerHTML = legendHTML();
    applyStageH(); fitBoard(); drawBoard(); updUndo();
    setCam('overview'); refreshStart();
    requestAnimationFrame(loop);
    const fail = err => { console.error(err); glOK = false; glState = 'fail'; refreshStart(); setCam('overview'); refreshSys(); };
    (window.THREE_READY || Promise.reject(new Error('three.js loader missing'))).then(THREE => {
      if (!THREE || !THREE.WebGLRenderer) throw new Error('three.js did not load');
      World = createWorld(THREE);
      World.todKeyInit = S.tod; World.paintInit = S.paint;
      World.init($('gl'), S.quality); glOK = true;
      World.setTrack(trk); World.setGuides(S.guides);
      $('timeLbl').textContent = World.todLabel(); $('paintTag').textContent = World.paintName();
      glState = 'ready'; refreshSys();
      if (!$('start').hidden) setCam('follow'); else setCam(S.cam || 'follow');
      refreshStart(); if (!$('start').hidden) $('stRide').focus();
    }).catch(fail);
  }
  window.__coaster = { seek(s, v) { train.phase = 'run'; train.dispatch = false; train.s = s; train.v = v; }, setCam, get train() { return train; }, get trk() { return trk; } };
  boot();
})();
// ===================== END APP =====================
