// ===================== TRAINS: car models, restraints, patterns, animated riders =====================
function createTrains(THREE, ctx) {
  const V3 = THREE.Vector3;
  const group = new THREE.Group();
  let design = null, tt = null, trains = [], riders = [], partMeshes = {}, tex = {};
  const M = THREE.MeshStandardMaterial;
  const mats = {};
  const tm = new THREE.Matrix4(), tm2 = new THREE.Matrix4(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), te = new THREE.Euler(), Y = new V3(0, 1, 0);
  const v1 = new V3(), v2 = new V3(), v3 = new V3(), vS = new V3(1, 1, 1);
  const P = new V3(), T = new V3(), U = new V3(), R = new V3(), nT = new V3();
  let rand = 1; const rnd = () => (rand = (rand * 16807) % 2147483647) / 2147483647;

  function makeMats(c) {
    mats.body = ctx.Q().phys ? new THREE.MeshPhysicalMaterial({ color: c.body, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }) : new M({ color: c.body, metalness: 0.35, roughness: 0.3 });
    mats.accent = new M({ color: c.accent, metalness: 0.3, roughness: 0.4 });
    mats.seat = new M({ color: c.seat, roughness: 0.85 });
    mats.bar = new M({ color: c.restraint, roughness: 0.45, metalness: 0.15 });
    mats.chassis = new M({ color: 0x2c2f33, metalness: 0.7, roughness: 0.45 });
    mats.wheel = new M({ color: 0xd8d4c8, roughness: 0.6 });
    mats.chrome = new M({ color: 0xd9dde2, metalness: 0.95, roughness: 0.18 });
    mats.wood = new M({ color: 0x7a5435, roughness: 0.85, map: ctx.groundTex });
    mats.decal = new THREE.MeshStandardMaterial({ transparent: true, roughness: 0.4, metalness: 0.2, polygonOffset: true, polygonOffsetFactor: -2 });
    mats.lamp = new THREE.MeshBasicMaterial({ color: 0xfff2c4, toneMapped: false });
  }
  function setColors(c) {
    if (!mats.body) return;
    mats.body.color.set(c.body); mats.accent.color.set(c.accent); mats.seat.color.set(c.seat); mats.bar.color.set(c.restraint);
    for (const k in tex) { tex[k].dispose(); } tex = {};
    for (const tr of trains) for (const car of tr.cars) for (const d of car.decals) d.material = decalMat(car.index);
  }
  function patternTexture(pattern, accent, idx) {
    const key = pattern + accent + (pattern === 'number' ? idx : '');
    if (tex[key]) return tex[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
    g.clearRect(0, 0, 256, 64); g.fillStyle = accent; g.strokeStyle = accent;
    if (pattern === 'stripe') { g.fillRect(0, 24, 256, 9); g.fillRect(0, 37, 256, 4); }
    else if (pattern === 'split') g.fillRect(0, 0, 256, 30);
    else if (pattern === 'checker') { for (let x = 0; x < 256; x += 16) for (let y = 16; y < 48; y += 16) if (((x + y) / 16) % 2 === 0) g.fillRect(x, y, 16, 16); }
    else if (pattern === 'flame') { g.beginPath(); g.moveTo(0, 64); for (let x = 0; x <= 256; x += 32) { g.quadraticCurveTo(x + 8, 18 + (x % 64 ? 10 : 0), x + 16, 34); g.quadraticCurveTo(x + 24, 4 + (x % 64 ? 14 : 0), x + 32, 30); } g.lineTo(256, 64); g.closePath(); g.fill(); }
    else if (pattern === 'number') { g.beginPath(); g.arc(128, 32, 24, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.font = 'bold 30px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(idx + 1), 128, 33); g.fillStyle = accent; g.fillRect(0, 52, 256, 5); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; tex[key] = t; return t;
  }
  function decalMat(idx) { if (design.pattern === 'solid') return null; const m = mats.decal.clone(); m.map = patternTexture(design.pattern, design.colors.accent, idx); return m; }

  // ---------- shared geometry ----------
  const G = {};
  function sharedGeo() {
    if (G.ready) return;
    G.seatBack = new THREE.BoxGeometry(0.5, 0.7, 0.1); G.seatBase = new THREE.BoxGeometry(0.5, 0.1, 0.48); G.head = new THREE.BoxGeometry(0.32, 0.26, 0.14);
    G.lap = new THREE.TorusGeometry(0.15, 0.03, 6, 14, Math.PI); G.stem = new THREE.CylinderGeometry(0.028, 0.028, 0.3, 6);
    G.otsrSide = new THREE.CylinderGeometry(0.04, 0.04, 0.62, 6); G.otsrYoke = new THREE.TorusGeometry(0.2, 0.05, 6, 14, Math.PI);
    G.vest = new THREE.BoxGeometry(0.36, 0.42, 0.06);
    G.wheel = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14).rotateZ(Math.PI / 2);
    G.unit = new THREE.CylinderGeometry(1, 1, 1, 8).translate(0, 0.5, 0);
    G.box = new THREE.BoxGeometry(1, 1, 1);
    G.ready = true;
  }
  function addM(g, geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, cast = true) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); m.castShadow = cast; g.add(m); return m; }
  function boxM(g, mat, x, y, z, w, h, d, cast = true) { return addM(g, G.box, mat, x, y, z, 0, 0, 0, w, h, d, cast); }
  function bodyShape(front, len, hLow, hHigh) {
    const sh = new THREE.Shape(), L = len / 2;
    if (front) { sh.moveTo(-L, hLow); sh.lineTo(L - 0.6, hLow); sh.quadraticCurveTo(L + 0.05, hLow + 0.02, L + 0.12, hLow + 0.32); sh.quadraticCurveTo(L + 0.05, hHigh + 0.36, L - 0.5, hHigh + 0.36); sh.lineTo(L - 0.9, hHigh + 0.2); sh.lineTo(-L, hHigh); sh.closePath(); }
    else { sh.moveTo(-L, hLow); sh.lineTo(L - 0.15, hLow); sh.quadraticCurveTo(L, hLow + 0.02, L, hLow + 0.22); sh.lineTo(L - 0.12, hHigh + 0.06); sh.lineTo(-L, hHigh); sh.closePath(); }
    return sh;
  }
  function extrudeBody(front, len, width, hLow, hHigh) {
    const g = new THREE.ExtrudeGeometry(bodyShape(front, len, hLow, hHigh), { depth: width, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 3, curveSegments: 10 });
    g.rotateY(Math.PI / 2); g.translate(-width / 2, 0, 0); g.computeVertexNormals(); return g;
  }
  function decal(g, car, x, y, z, w, h, side) {
    const m = decalMat(car.index); if (!m) return;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); d.position.set(x, y, z); d.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; g.add(d); car.decals.push(d);
  }
  function wheels(g, ySign = 1) { for (const zz of [-0.4, 0.4]) for (const xx of [-0.55, 0.55]) { addM(g, G.wheel, mats.wheel, xx, 0.14 * ySign, zz); addM(g, G.wheel, mats.wheel, xx, -0.15 * ySign, zz); } }
  let barSink = null;
  function restraint(g, kind, x, y, z, hipY) {
    const n0 = g.children.length;
    restraintIn(g, kind, x, y, z, hipY);
    if (kind !== 'lap' && kind !== 'tbar') barSink = g.children.slice(n0); else barSink = null;
  }
  function restraintIn(g, kind, x, y, z, hipY) {
    if (kind === 'lap' || kind === 'tbar') { addM(g, G.lap, mats.bar, x, hipY + 0.2, z - 0.2, -Math.PI / 2 + 0.25, 0, 0, kind === 'tbar' ? 1.4 : 1, 1, 1); addM(g, G.stem, mats.bar, x, hipY + 0.06, z - 0.12, 0.6); if (kind === 'tbar') addM(g, G.stem, mats.bar, x, hipY + 0.34, z - 0.25, 0, 0, Math.PI / 2, 1, 1.4, 1); }
    else if (kind === 'otsr' || kind === 'standup') { for (const s of [-1, 1]) addM(g, G.otsrSide, mats.bar, x + s * 0.2, hipY + 0.32, z - 0.17, 0.12); addM(g, G.otsrYoke, mats.bar, x, hipY + 0.64, z - 0.12, 0, 0, 0, 1, 0.8, 1); }
    else if (kind === 'vest') addM(g, G.vest, mats.bar, x, hipY + 0.32, z + 0.12, 0.1);
  }
  // ---------- car builders: return seats as {x, y, z, pose} in the car frame (x right, y up, z backward) ----------
  function buildCar(idx, front, rear) {
    sharedGeo(); barSink = null;
    const car = { index: idx, root: new THREE.Group(), body: new THREE.Group(), seats: [], decals: [], swing: 0, swingV: 0, spin: 0, spinV: 0, pitch: 0 };
    car.root.matrixAutoUpdate = false; car.root.add(car.body);
    const g = car.body, rows = design.rows || tt.rows, seats = design.seats || tt.seats, sw = tt.seatW;
    const len = TRAIN.carLen - 0.15, W = Math.max(1.3, seats * sw + 0.28);
    const rowZ = r => (r - (rows - 1) / 2) * tt.rowPitch, seatX = s => (s - (seats - 1) / 2) * sw;
    const hip = tt.hl - 0.42;
    const pose = tt.pose;
    const seatRow = (r, xs, hipY, opt = {}) => {
      for (const x of xs) {
        const z = rowZ(r);
        if (opt.seat !== false) {
          if (pose === 'stand') { addM(g, G.seatBase, mats.seat, x, hipY - 0.05, z + 0.1, 0, 0, 0, 0.45, 1, 0.5); addM(g, G.seatBack, mats.seat, x, hipY + 0.25, z + 0.24, -0.05, 0, 0, 0.9, 1.1, 1); }
          else if (pose === 'prone') { addM(g, G.seatBack, mats.seat, x, hipY + 0.16, z - 0.2, Math.PI / 2, 0, 0, 0.9, 1.4, 1); }
          else { addM(g, G.seatBase, mats.seat, x, hipY - 0.05, z + 0.02); addM(g, G.seatBack, mats.seat, x, hipY + 0.3, z + 0.27, -0.12); addM(g, G.head, mats.seat, x, hipY + 0.75, z + 0.3); }
        }
        restraint(g, tt.restraint, x, 0, z, hipY);
        car.seats.push({ bars: barSink,  x, y: hipY, z, pose, side: opt.side || 0 });
      }
    };
    const allX = []; for (let s = 0; s < seats; s++) allX.push(seatX(s));
    switch (tt.body) {
      case 'hyper': case 'looper': case 'ptc': case 'mine': case 'mouse': {
        const hLow = 0.28, hHigh = tt.body === 'looper' ? 0.82 : tt.body === 'ptc' ? 0.95 : tt.body === 'mine' ? 0.9 : 0.68;
        if (tt.body === 'mine') { for (let i = 0; i < 4; i++) boxM(g, mats.wood, 0, hLow + 0.15 + i * 0.16, 0, W, 0.14, len - 0.1); for (const s of [-1, 1]) boxM(g, mats.chrome, s * (W / 2 + 0.01), hLow + 0.4, 0, 0.03, 0.08, len - 0.05); boxM(g, mats.accent, 0, hHigh, 0, W + 0.06, 0.06, len); }
        else if (tt.body === 'mouse') { boxM(g, mats.body, 0, 0.55, 0, W, 0.5, len); boxM(g, mats.chrome, 0, 0.42, -len / 2 - 0.1, W + 0.1, 0.14, 0.16); boxM(g, mats.chrome, 0, 0.42, len / 2 + 0.1, W + 0.1, 0.14, 0.16); }
        else { const geo = extrudeBody(front && tt.body !== 'ptc', len, W, hLow, hHigh); const b = new THREE.Mesh(geo, mats.body); b.castShadow = true; b.receiveShadow = true; g.add(b); car.ownGeo = geo; if (tt.body === 'ptc') { boxM(g, mats.chrome, 0, 0.45, -len / 2 - 0.08, W + 0.12, 0.1, 0.1); boxM(g, mats.accent, 0, hHigh + 0.02, 0, W + 0.08, 0.05, len); } }
        for (const s of [-1, 1]) decal(g, car, s * (W / 2 + 0.07), 0.55, 0, len * 0.86, len * 0.22, s);
        if (front && tt.body !== 'mine') for (const s of [-1, 1]) addM(g, new THREE.SphereGeometry(0.06, 8, 6), mats.lamp, s * 0.4, 0.55, -len / 2 - 0.12, 0, 0, 0, 1, 1, 1, false);
        boxM(g, mats.chassis, 0, 0.17, 0, 1.0, 0.16, Math.min(2.2, len - 0.2)); wheels(g);
        for (let r = 0; r < rows; r++) seatRow(r, allX, hip);
        break; }
      case 'floorless': case 'standup': case 'dive': {
        boxM(g, mats.chassis, 0, 0.17, 0, 1.0, 0.16, len - 0.2); wheels(g);
        boxM(g, mats.body, 0, 0.42, 0, W * 0.9, 0.16, len - 0.25);
        for (const s of [-1, 1]) boxM(g, mats.accent, s * (W / 2 - 0.05), 0.55, 0, 0.1, 0.22, len - 0.3);
        if (front) { const nose = boxM(g, mats.body, 0, 0.5, -len / 2 - 0.15, W * 0.92, 0.3, 0.35); nose.rotation.x = 0.35; }
        for (let r = 0; r < rows; r++) { if (tt.body === 'dive') boxM(g, mats.body, 0, hip - 0.12 + r * 0.35, rowZ(r), W, 0.14, 0.6); seatRow(r, allX, hip + (tt.body === 'dive' ? r * 0.35 : 0)); }
        for (const s of [-1, 1]) decal(g, car, s * (W / 2 + 0.01), 0.55, 0, len * 0.8, 0.22, s);
        break; }
      case 'inverted': case 'flying': {
        // bogie on the rails, seats hang below on a frame
        boxM(g, mats.chassis, 0, 0.0, 0, 1.0, 0.24, len - 0.2); wheels(g, -1);
        boxM(g, mats.body, 0, -0.38, 0, 0.5, 0.5, len - 0.4);
        const frameY = tt.body === 'flying' ? hip + 0.42 : hip + 0.78;
        boxM(g, mats.body, 0, frameY, 0, W, 0.18, len - 0.3);
        for (const zz of [-len / 2 + 0.4, len / 2 - 0.4]) boxM(g, mats.body, 0, (frameY - 0.38) / 2 - 0.1, zz, 0.18, Math.abs(frameY + 0.38), 0.18);
        for (const s of [-1, 1]) decal(g, car, s * (W / 2 + 0.01), frameY, 0, len * 0.8, 0.18, s);
        for (let r = 0; r < rows; r++) seatRow(r, allX, hip);
        break; }
      case 'suspended': {
        boxM(g, mats.chassis, 0, 0.0, 0, 0.8, 0.24, len - 0.3); wheels(g, -1);
        boxM(g, mats.chrome, 0, -0.55, 0, 0.12, 0.9, 0.12);
        car.swingPivot = -0.25;
        const cg = new THREE.Group(); car.swingGroup = cg; car.body.add(cg);
        const geo = extrudeBody(front, len, W, -0.25, 0.35); const b = new THREE.Mesh(geo, mats.body); b.position.y = hip - 0.45; b.castShadow = true; cg.add(b); car.ownGeo = geo;
        const roofB = boxM(cg, mats.accent, 0, hip + 1.05, 0, W * 0.6, 0.1, len * 0.8); void roofB;
        for (const s of [-1, 1]) decal(cg, car, s * (W / 2 + 0.07), hip - 0.2, 0, len * 0.86, 0.22, s);
        const gSave = g; void gSave;
        for (let r = 0; r < rows; r++) for (const x of allX) { const z = rowZ(r); addM(cg, G.seatBase, mats.seat, x, hip - 0.05, z + 0.02); addM(cg, G.seatBack, mats.seat, x, hip + 0.3, z + 0.27, -0.12); car.seats.push({ bars: barSink,  x, y: hip, z, pose: 'sit', swing: true }); }
        break; }
      case 'wing': case 'fourd': {
        boxM(g, mats.chassis, 0, 0.12, 0, 1.0, 0.24, len - 0.2); wheels(g);
        const half = Math.ceil(seats / 2), xs = [];
        for (let i = 0; i < half; i++) { const off = 0.95 + i * sw; xs.push(-off, off); }
        const span = 0.95 + half * sw;
        const wingY = tt.body === 'fourd' ? hip + 0.25 : hip - 0.12;
        for (const s of [-1, 1]) { const w = boxM(g, mats.body, s * span / 2, wingY, 0, span, 0.16, 0.6); void w; }
        if (tt.body === 'fourd') { for (const s of [-1, 1]) addM(g, G.unit, mats.chrome, s * 0.55, wingY, 0, 0, 0, Math.PI / 2 * s, 0.08, span - 0.5, 0.08); car.spinGroupL = new THREE.Group(); car.spinGroupR = new THREE.Group(); car.body.add(car.spinGroupL, car.spinGroupR); }
        decal(g, car, span + 0.01, wingY, 0, 0.5, 0.14, 1); decal(g, car, -span - 0.01, wingY, 0, 0.5, 0.14, -1);
        for (let r = 0; r < rows; r++) for (const x of xs) {
          const z = rowZ(r); const sg = tt.body === 'fourd' ? (x < 0 ? car.spinGroupL : car.spinGroupR) : g;
          addM(sg, G.seatBase, mats.seat, x, hip - 0.05, z + 0.02); addM(sg, G.seatBack, mats.seat, x, hip + 0.3, z + 0.27, -0.12); restraint(sg, tt.restraint, x, 0, z, hip);
          car.seats.push({ bars: barSink,  x, y: hip, z, pose: 'hang', fourd: tt.body === 'fourd' ? (x < 0 ? -1 : 1) : 0 });
        }
        if (tt.body === 'fourd') { car.spinY = hip + 0.25; }
        break; }
      case 'bobsled': {
        const cg = new THREE.Group(); car.swingGroup = cg; car.body.add(cg); car.swingPivot = 1.0;
        const geo = new THREE.CapsuleGeometry(0.55, len - 1.2, 6, 12); geo.rotateX(Math.PI / 2); geo.scale(1, 0.6, 1);
        const b = new THREE.Mesh(geo, mats.body); b.position.y = 0.45; b.castShadow = true; cg.add(b); car.ownGeo = geo;
        boxM(cg, mats.seat, 0, 0.62, 0, 0.8, 0.1, len - 0.8);
        for (const s of [-1, 1]) decal(cg, car, s * 0.56, 0.48, 0, len * 0.7, 0.18, s);
        for (let r = 0; r < rows; r++) for (const x of allX) { const z = rowZ(r); restraint(cg, 'lap', x, 0, z, hip); car.seats.push({ bars: barSink,  x, y: hip, z, pose: 'sit', swing: true }); }
        break; }
      case 'spinner': {
        boxM(g, mats.chassis, 0, 0.17, 0, 1.0, 0.16, len - 0.2); wheels(g);
        const cg = new THREE.Group(); car.spinGroup = cg; car.body.add(cg);
        const tub = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.62, W * 0.58, 0.6, 24, 1, true), mats.body); tub.position.y = 0.62; tub.castShadow = true; cg.add(tub);
        const floor = new THREE.Mesh(new THREE.CylinderGeometry(W * 0.58, W * 0.58, 0.08, 24), mats.chassis); floor.position.y = 0.34; cg.add(floor);
        const ringM = new THREE.Mesh(new THREE.TorusGeometry(W * 0.62, 0.05, 6, 24), mats.accent); ringM.rotation.x = Math.PI / 2; ringM.position.y = 0.92; cg.add(ringM);
        // two benches back to back
        for (let r = 0; r < rows; r++) for (const x of allX) {
          const z = (r ? 1 : -1) * 0.35, rot = r ? Math.PI : 0;
          const sb = addM(cg, G.seatBack, mats.seat, x * (r ? -1 : 1), hip + 0.3, z + (r ? -0.27 : 0.27), r ? 0.12 : -0.12); sb.rotation.y = rot;
          addM(cg, G.seatBase, mats.seat, x, hip - 0.05, z); restraint(cg, 'lap', x * (r ? -1 : 1), 0, z * 1, hip);
          car.seats.push({ bars: barSink,  x: x * (r ? -1 : 1), y: hip, z, pose: 'sit', spin: true, face: rot });
        }
        break; }
      default: { boxM(g, mats.body, 0, 0.5, 0, W, 0.5, len); for (let r = 0; r < rows; r++) seatRow(r, allX, hip); }
    }
    g.traverse(o => { if (o.isMesh) o.receiveShadow = true; });
    void rear;
    return car;
  }

  // ---------- riders (instanced body parts) ----------
  const SHIRTS = ['#c0392b', '#2471a3', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#2c3e50', '#16a085', '#d35400', '#7f8c8d', '#e84393', '#0984e3', '#fdcb6e'];
  const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a8714a', '#5c3b22'];
  const HAIR = ['#2c1b10', '#4a2f1c', '#6b4423', '#a0703c', '#d4b483', '#1a1a1a', '#8c8c8c', '#b5523b'];
  const PANTS = ['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#95a5a6', '#2f3542', '#576574'];
  const PARTS = ['torso', 'head', 'hair', 'uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR'];
  function buildRiders() {
    for (const k in partMeshes) { group.remove(partMeshes[k]); partMeshes[k].dispose(); }
    partMeshes = {}; riders = [];
    if (!design.riders) return;
    rand = 7331;
    const occ = clamp(design.occupancy ?? 0.85, 0.1, 1);
    for (let ti = 0; ti < trains.length; ti++) for (const car of trains[ti].cars) car.seats.forEach((st, si) => {
      if (rnd() > occ && !(ti === 0 && car.index === 0 && si < 2)) return;
      const pick = a => a[Math.floor(rnd() * a.length)];
      riders.push({ ti, car, seat: st, shirt: pick(SHIRTS), skin: pick(SKIN), hair: pick(HAIR), pants: pick(PANTS), longHair: rnd() < 0.4, brave: rnd(), scale: 0.88 + rnd() * 0.18, arm: 0, armT: 0, look: 0, lookT: 0, lookTimer: rnd() * 4, bob: rnd() * 6, hidden: false });
    });
    const n = riders.length; if (!n) return;
    const skinMat = new M({ roughness: 0.75 }), clothMat = new M({ roughness: 0.9 });
    const geo = {
      torso: new THREE.CapsuleGeometry(0.15, 0.32, 4, 8).translate(0, 0.33, 0).scale(1.15, 1, 0.75),
      head: new THREE.SphereGeometry(0.115, 12, 10), hair: new THREE.SphereGeometry(0.122, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55),
      limb: new THREE.CapsuleGeometry(0.05, 1, 3, 6).translate(0, 0.5, 0)
    };
    const mk = (k, g, mat) => { const im = new THREE.InstancedMesh(g, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; im.frustumCulled = false; group.add(im); partMeshes[k] = im; };
    mk('torso', geo.torso, clothMat); mk('head', geo.head, skinMat); mk('hair', geo.hair, clothMat);
    for (const k of ['uarmL', 'uarmR', 'thighL', 'thighR', 'shinL', 'shinR']) mk(k, geo.limb, clothMat);
    for (const k of ['farmL', 'farmR']) mk(k, geo.limb, skinMat);
    const c = new THREE.Color();
    riders.forEach((r, i) => {
      partMeshes.torso.setColorAt(i, c.set(r.shirt)); partMeshes.head.setColorAt(i, c.set(r.skin)); partMeshes.hair.setColorAt(i, c.set(r.hair));
      for (const k of ['uarmL', 'uarmR']) partMeshes[k].setColorAt(i, c.set(r.shirt));
      for (const k of ['farmL', 'farmR']) partMeshes[k].setColorAt(i, c.set(r.skin));
      for (const k of ['thighL', 'thighR', 'shinL', 'shinR']) partMeshes[k].setColorAt(i, c.set(r.pants));
    });
    for (const k in partMeshes) partMeshes[k].instanceColor.needsUpdate = true;
  }
  const lv = new V3(), lq = new THREE.Quaternion(), lm = new THREE.Matrix4(), ls = new V3();
  const limbM = (out, base, from, dir, len, thick) => { // matrix for a limb capsule starting at 'from' along 'dir'
    lq.setFromUnitVectors(Y, lv.copy(dir).normalize()); lm.compose(from, lq, ls.set(thick, len, thick)); out.multiplyMatrices(base, lm); return out;
    // eslint-disable-next-line no-unreachable
    tq.setFromUnitVectors(Y, v3.copy(dir).normalize()); tm2.compose(from, tq, vS.set(thick, len, thick)); out.multiplyMatrices(base, tm2); return out;
  };
  const dirs = {
    hold: new V3(0, -0.55, -0.83), holdF: new V3(0, 0.05, -1), up: new V3(0, 1, -0.12), upF: new V3(0, 1, -0.05), side: new V3(0, -0.3, -0.95)
  };
  const tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), seatM = new THREE.Matrix4();
  const outM = new THREE.Matrix4(), baseM = new THREE.Matrix4(), cB = new V3();
  function updateRiders(dt, view, cam) {
    if (!riders.length) return;
    const pm = partMeshes;
    group.updateMatrixWorld(true);
    riders.forEach((r, i) => {
      const tr = trains[r.ti], st = tr.state;
      // reactions
      const vg = tr.vg, v = Math.abs(st.v || 0);
      const thrill = (vg < 0.35 && v > 8) || (tr.ty < -0.45 && v > 10) || (st.launching) || tr.inverted;
      r.armT = st.phase === 'load' ? 0 : thrill ? (r.brave > 0.45 ? 1 : r.brave > 0.25 ? 0.35 : 0) : tr.onLift ? (r.brave > 0.8 ? 0.55 + 0.25 * Math.sin(tr.time * 3 + r.bob) : 0) : (r.brave > 0.7 && v > 6 ? 0.4 : 0);
      if (vg > 2.8) r.armT = Math.min(r.armT, 0.2);
      r.arm += (r.armT - r.arm) * Math.min(1, dt * (r.armT > r.arm ? 4 : 2.5));
      r.lookTimer -= dt; if (r.lookTimer <= 0) { r.lookT = (st.phase === 'load' || tr.onLift) ? (rnd() - 0.5) * 1.4 : (rnd() - 0.5) * 0.3; r.lookTimer = 1.5 + rnd() * 3; }
      r.look += (r.lookT - r.look) * Math.min(1, dt * 2);
      // seat frame
      const car = r.car, s = r.seat;
      tm.makeTranslation(s.x, s.y, s.z);
      if (s.face) tm.multiply(tm2.makeRotationY(s.face));
      const parent = s.swing && car.swingGroup ? car.swingGroup : s.spin && car.spinGroup ? car.spinGroup : s.fourd && car.spinGroupL ? (s.fourd < 0 ? car.spinGroupL : car.spinGroupR) : car.body;
      seatM.multiplyMatrices(parent.matrixWorld, tm);
      if (r.scale !== 1) seatM.multiply(tm2.makeScale(r.scale, r.scale, r.scale));
      const hide = r.hidden;
      const hs = hide ? 0 : 1;
      const pose = s.pose;
      // body lean from forces
      const lean = clamp(-tr.lg * 0.18, -0.3, 0.3), squash = clamp((vg - 1) * 0.02, -0.04, 0.06);
      const base = baseM.copy(seatM);
      if (pose === 'prone') base.multiply(tm2.makeRotationX(-Math.PI / 2)).multiply(tm.makeTranslation(0, -0.05, 0.1));
      base.multiply(tm2.makeRotationZ(lean * 0.3));
      // torso & head
      pm.torso.setMatrixAt(i, tm.multiplyMatrices(base, tm2.compose(v1.set(0, 0, 0), tq.identity(), vS.set(hs, hs * (1 - squash), hs))));
      te.set(clamp((vg - 1) * -0.03, -0.12, 0.25) + (pose === 'prone' ? 0.9 : 0), r.look, lean * 0.7, 'YXZ'); tq.setFromEuler(te);
      const headM = tm.multiplyMatrices(base, tm2.compose(v1.set(0, 0.8 - squash * 2, 0), tq, vS.set(hs, hs, hs)));
      pm.head.setMatrixAt(i, headM);
      pm.hair.setMatrixAt(i, tm.multiplyMatrices(headM, tm2.compose(v1.set(0, 0.012, 0.01), tq.identity(), vS.set(r.longHair ? 1.05 : 1, r.longHair ? 1.35 : 1, r.longHair ? 1.12 : 1))));
      // arms
      const a = r.arm;
      for (const sd of [-1, 1]) {
        const sh = tmpA.set(sd * 0.2, 0.58, 0);
        const du = tmpB.copy(dirs.hold).lerp(dirs.up, a); du.x += sd * (0.08 + a * 0.22);
        pm[sd < 0 ? 'uarmL' : 'uarmR'].setMatrixAt(i, limbM(outM, base, sh, du, 0.27 * hs, hs));
        const elbow = tmpC.copy(sh).addScaledVector(du.normalize(), 0.27);
        const df = v1.copy(dirs.holdF).lerp(dirs.upF, a); df.x += sd * a * 0.12;
        if (a < 0.2 && pose !== 'prone') df.y -= 0.35 * (1 - a * 5);
        pm[sd < 0 ? 'farmL' : 'farmR'].setMatrixAt(i, limbM(outM, base, elbow, df, 0.25 * hs, hs));
      }
      // legs
      const dangle = pose === 'hang' || pose === 'stand' || (pose === 'sit' && (tt.mount === 'below' || tt.mount === 'wing'));
      for (const sd of [-1, 1]) {
        const hp = tmpA.set(sd * 0.1, 0.02, 0);
        let th, sn;
        if (pose === 'stand') { th = v2.set(0, -1, -0.02); sn = v3.set(0, -1, 0.02); }
        else if (pose === 'prone') { th = v2.set(sd * 0.05, -1, 0.15); sn = v3.set(0, -1, 0.2); }
        else { th = v2.set(sd * 0.04, -0.05, -1); sn = dangle ? v3.set(0, -1, 0.12 + Math.sin(tr.time * 2 + r.bob) * 0.06 * (v > 5 ? 1 : 0)) : v3.set(0, -1, 0.25); }
        const knee = tmpC.copy(hp).addScaledVector(cB.copy(th).normalize(), pose === 'stand' || pose === 'prone' ? 0.43 : 0.42);
        pm[sd < 0 ? 'thighL' : 'thighR'].setMatrixAt(i, limbM(outM, base, hp, th, (pose === 'stand' || pose === 'prone' ? 0.43 : 0.42) * hs, hs * 1.25));
        pm[sd < 0 ? 'shinL' : 'shinR'].setMatrixAt(i, limbM(outM, base, knee, sn, 0.42 * hs, hs * 1.1));
      }
    });
    for (const k in pm) pm[k].instanceMatrix.needsUpdate = true;
    void view; void cam;
  }

  // ---------- public ----------
  function build(d, count) {
    design = d; tt = TRAIN_TYPES[d.train] || TRAIN_TYPES.hyper; povBars = null;
    while (group.children.length) { const c = group.children.pop(); c.traverse(o => { if (o.geometry && o.geometry.dispose && !Object.values(G).includes(o.geometry)) o.geometry.dispose(); }); }
    partMeshes = {};
    makeMats(d.colors);
    trains = [];
    const n = clamp(count || 1, 1, 4);
    for (let ti = 0; ti < n; ti++) {
      const tr = { cars: [], state: null, vg: 1, lg: 0, ty: 0, time: 0, onLift: false, inverted: false };
      for (let c = 0; c < TRAIN.cars; c++) { const car = buildCar(c, c === 0, c === TRAIN.cars - 1); group.add(car.root); tr.cars.push(car); }
      trains.push(tr);
    }
    buildRiders();
  }
  function place(trk, states, forces, dt) {
    if (!trk) return;
    trains.forEach((tr, ti) => {
      const st = states[ti]; tr.state = st || { s: trk.stationStop, v: 0, phase: 'load' };
      const f = forces[ti] || { vg: 1, lg: 0 }; tr.vg = f.vg; tr.lg = f.lg; tr.time += dt;
      const s = tr.state.s;
      tr.ty = trk.get(trk.ty, s); const ty0 = trk.type[trk.at(s - TRAIN.len / 2)]; tr.onLift = isLiftCode(ty0); tr.inverted = trk.get(trk.uy, s) < -0.3;
      tr.cars.forEach((car, c) => {
        const sc = s - (c + 0.5) * TRAIN.carLen;
        ctx.frameAt(trk, sc, P, T, U, R); nT.copy(T).negate();
        car.root.matrix.makeBasis(R, U, nT).setPosition(P); car.root.matrixWorldNeedsUpdate = true;
        // swinging (suspended / bobsled), spinning and rotating seats
        if (car.swingGroup) {
          const lat = f.lg || 0, target = clamp(Math.atan(lat) * (tt.sled ? 1.1 : 1.0), -1.2, 1.2);
          car.swingV += ((target - car.swing) * 28 - car.swingV * 5.5) * dt; car.swing += car.swingV * dt; car.swing = clamp(car.swing, -1.3, 1.3);
          const pv = car.swingPivot || 0;
          car.swingGroup.position.set(0, 0, 0); car.swingGroup.matrix.identity();
          car.swingGroup.position.set(0, pv, 0); car.swingGroup.rotation.set(0, 0, tt.sled ? car.swing : -car.swing);
          car.swingGroup.updateMatrix(); car.swingGroup.matrix.multiply(tm.makeTranslation(0, -pv, 0)); car.swingGroup.matrixAutoUpdate = false;
        }
        if (car.spinGroup) { car.spinV += ((f.lg || 0) * 2.2 - car.spinV * 0.35) * dt + (Math.abs(tr.state.v || 0) > 3 ? Math.sin(tr.time * 0.7 + c) * 0.15 * dt : 0); car.spin += car.spinV * dt; car.spinGroup.rotation.y = car.spin; }
        if (car.spinGroupL) {
          const pitch = Math.asin(clamp(trk.get(trk.ty, sc), -1, 1));
          const target = -pitch * 1.8 + (tr.inverted ? Math.PI : 0) * 0;
          car.pitch += (target - car.pitch) * Math.min(1, dt * 1.6);
          for (const sg of [car.spinGroupL, car.spinGroupR]) { sg.position.set(0, car.spinY, 0); sg.rotation.set(car.pitch, 0, 0); sg.updateMatrix(); sg.matrix.multiply(tm.makeTranslation(0, -car.spinY, 0)); sg.matrixAutoUpdate = false; }
        }
      });
    });
  }
  function seatWorld(ti, carIdx, seatIdx, out) {
    const tr = trains[ti]; if (!tr) return null; const car = tr.cars[Math.min(carIdx, tr.cars.length - 1)]; const st = car.seats[Math.min(seatIdx, car.seats.length - 1)];
    const parent = st.swing && car.swingGroup ? car.swingGroup : st.spin && car.spinGroup ? car.spinGroup : st.fourd && car.spinGroupL ? (st.fourd < 0 ? car.spinGroupL : car.spinGroupR) : car.body;
    car.root.updateMatrixWorld(true); parent.updateMatrixWorld(true);
    out.multiplyMatrices(parent.matrixWorld, tm.makeTranslation(st.x, st.y, st.z));
    if (st.face) out.multiply(tm2.makeRotationY(st.face));
    if (st.pose === 'prone') out.multiply(tm2.makeRotationX(-Math.PI / 2));
    return st;
  }
  let povBars = null;
  function showBars(on) { if (povBars) for (const m of povBars) m.visible = on; }
  function setPovSeat(ti, carIdx, seatIdx) {
    const tr = trains[ti]; if (!tr) return; const car = tr.cars[Math.min(carIdx, tr.cars.length - 1)], seat = car.seats[Math.min(seatIdx, car.seats.length - 1)];
    if (povBars !== seat.bars) { showBars(true); povBars = seat.bars; showBars(false); }
    riders.forEach(r => { r.hidden = r.ti === ti && r.car === car && r.seat === seat; });
  }
  function clearPov() { showBars(true); povBars = null; riders.forEach(r => { r.hidden = false; }); }
  return { group, build, place, updateRiders, setColors, seatWorld, setPovSeat, clearPov, get count() { return trains.length; }, get riderCount() { return riders.length; }, get seatsPerCar() { return trains[0] ? trains[0].cars[0].seats.length : 0; } };
}
// ===================== END TRAINS =====================
