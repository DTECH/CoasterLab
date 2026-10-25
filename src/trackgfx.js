// ===================== TRACK GRAPHICS: track styles, supports, catwalks, tunnels, station, guides =====================
function createTrackGfx(THREE, ctx) {
  const V3 = THREE.Vector3;
  const group = new THREE.Group();
  let chevron = null, chevData = [], trk = null, guides = true, stationInfo = null;
  const mats = {};
  const v1 = new V3(), v2 = new V3(), v3 = new V3(), v4 = new V3(), m4 = new THREE.Matrix4(), tq = new THREE.Quaternion(), up = new V3(0, 1, 0);
  const lin = h => new THREE.Color(h);

  function makeMats() {
    const M = THREE.MeshStandardMaterial;
    mats.rail = new M({ color: 0xc22d27, metalness: 0.55, roughness: 0.32 });
    mats.spine = new M({ color: 0xc22d27, metalness: 0.55, roughness: 0.34 });
    mats.support = new M({ color: 0xe7e3d8, metalness: 0.45, roughness: 0.45 });
    mats.footing = new M({ color: 0xa9a49a, roughness: 0.9 });
    mats.chain = new M({ map: ctx.chainTex, metalness: 0.7, roughness: 0.5 });
    mats.fin = new M({ color: 0xc9a46a, metalness: 0.95, roughness: 0.28, side: THREE.DoubleSide });
    mats.lsm = new M({ color: 0x3a3f46, metalness: 0.8, roughness: 0.35 });
    mats.tyre = new M({ color: 0x151515, roughness: 0.8 });
    mats.concrete = new M({ color: 0xb3ada2, roughness: 0.92 });
    mats.roof = new M({ color: 0x353a40, metalness: 0.5, roughness: 0.5 });
    mats.accent = new M({ color: 0xc22d27, metalness: 0.3, roughness: 0.5 });
    mats.glass = new M({ color: 0x9fb8c8, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.45 });
    mats.wood = new M({ color: 0xa98b62, roughness: 0.88, map: ctx.groundTex });
    mats.woodTrack = new M({ color: 0x8a6a45, roughness: 0.85, map: ctx.groundTex });
    mats.chassis = new M({ color: 0x2c2f33, metalness: 0.7, roughness: 0.45 });
    mats.grate = new M({ color: 0x6d7278, metalness: 0.6, roughness: 0.55, map: ctx.grateTex, alphaMap: ctx.grateTex, alphaTest: 0.5, side: THREE.DoubleSide });
    mats.tunnel = new M({ color: 0x5b554d, roughness: 0.95, map: ctx.groundTex, side: THREE.DoubleSide });
    mats.shell = new M({ color: 0x1c4f94, metalness: 0.2, roughness: 0.25, side: THREE.DoubleSide });
    mats.led = new THREE.MeshBasicMaterial({ color: 0xff3c6e, toneMapped: false });
  }
  function setColors(c) {
    if (!mats.rail) makeMats();
    mats.rail.color.set(c.rail); mats.spine.color.set(c.spine || c.rail); mats.support.color.set(c.support); mats.accent.color.set(c.rail);
    mats.shell.color.set(c.body || '#1c4f94'); mats.led.color.set(c.accent && c.accent.toLowerCase() !== '#ffffff' && c.accent.toLowerCase() !== '#f0f0f0' ? c.accent : c.rail);
  }

  // ---------- geometry helpers ----------
  function frameAt(t, s, P, T, U, R) {
    const g = t.get;
    P.set(g(t.px, s), g(t.py, s), g(t.pz, s)); T.set(g(t.tx, s), g(t.ty, s), g(t.tz, s)).normalize();
    U.set(g(t.ux, s), g(t.uy, s), g(t.uz, s)); U.addScaledVector(T, -U.dot(T)).normalize(); R.crossVectors(T, U).normalize();
  }
  function ringsFor(t, from, to) { const loop = t.closed && from === 0 && to === t.n; const r = []; for (let k = from; k < to; k++) r.push(k); if (loop) r.push(0); return r; }
  function tubeGeometry(t, offR, offU, radius, radial, from, to, flat) {
    const rings = ringsFor(t, from, to), nr = rings.length;
    const pos = new Float32Array(nr * (radial + 1) * 3), nrm = new Float32Array(nr * (radial + 1) * 3), uv = new Float32Array(nr * (radial + 1) * 2);
    let p = 0, q = 0;
    for (let ri = 0; ri < nr; ri++) {
      const k = rings[ri];
      const cx = t.px[k] + t.rx[k] * offR + t.ux[k] * offU, cy = t.py[k] + t.ry[k] * offR + t.uy[k] * offU, cz = t.pz[k] + t.rz[k] * offR + t.uz[k] * offU;
      for (let j = 0; j <= radial; j++) {
        const a = j / radial * Math.PI * 2 + Math.PI / radial; const ca = Math.cos(a), sa = Math.sin(a);
        const sx = flat ? flat[0] : 1, sy = flat ? flat[1] : 1;
        const dx = t.rx[k] * ca * sx + t.ux[k] * sa * sy, dy = t.ry[k] * ca * sx + t.uy[k] * sa * sy, dz = t.rz[k] * ca * sx + t.uz[k] * sa * sy;
        const nx = t.rx[k] * ca / sx + t.ux[k] * sa / sy, ny = t.ry[k] * ca / sx + t.uy[k] * sa / sy, nz = t.rz[k] * ca / sx + t.uz[k] * sa / sy; const nl = Math.hypot(nx, ny, nz);
        pos[p] = cx + dx * radius; nrm[p++] = nx / nl; pos[p] = cy + dy * radius; nrm[p++] = ny / nl; pos[p] = cz + dz * radius; nrm[p++] = nz / nl;
        uv[q++] = j / radial; uv[q++] = ri * DS;
      }
    }
    const idx = []; for (let ri = 0; ri < nr - 1; ri++) for (let j = 0; j < radial; j++) { const a = ri * (radial + 1) + j, b = a + radial + 1; idx.push(a, b, a + 1, a + 1, b, b + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx); return geo;
  }
  // rectangular section with flat faces (w across, h along U)
  function boxTube(t, offR, offU, w, h, from, to) {
    const rings = ringsFor(t, from, to), nr = rings.length;
    const corners = [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]], faces = [[0, 1, 0, 1], [1, 2, 1, 0], [2, 3, 0, -1], [3, 0, -1, 0]];
    const pos = [], nrm = [], uv = [], idx = [];
    for (const [a, b, nR, nU] of faces) {
      const base = pos.length / 3;
      for (let ri = 0; ri < nr; ri++) {
        const k = rings[ri];
        const cx = t.px[k] + t.rx[k] * offR + t.ux[k] * offU, cy = t.py[k] + t.ry[k] * offR + t.uy[k] * offU, cz = t.pz[k] + t.rz[k] * offR + t.uz[k] * offU;
        for (const c of [corners[a], corners[b]]) {
          pos.push(cx + t.rx[k] * c[0] + t.ux[k] * c[1], cy + t.ry[k] * c[0] + t.uy[k] * c[1], cz + t.rz[k] * c[0] + t.uz[k] * c[1]);
          nrm.push(t.rx[k] * nR + t.ux[k] * nU, t.ry[k] * nR + t.uy[k] * nU, t.rz[k] * nR + t.uz[k] * nU); uv.push(c === corners[a] ? 0 : 1, ri * DS);
        }
      }
      for (let ri = 0; ri < nr - 1; ri++) { const o = base + ri * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    return geo;
  }
  function ribbon(t, ranges, makePts, uvScale) {
    const pos = [], nrm = [], uv = [], idx = []; let base = 0;
    for (const [a, b] of ranges) {
      for (let k = a; k <= b; k++) { const [p0, p1, n] = makePts(k); pos.push(...p0, ...p1); nrm.push(...n, ...n); uv.push(0, (k - a) * DS / uvScale, 1, (k - a) * DS / uvScale); }
      for (let i = 0; i < b - a; i++) { const o = base + i * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
      base += (b - a + 1) * 2;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    return geo;
  }
  // a swept cross-section (list of [r,u] points) along a range of samples
  function sweep(t, a, b, prof, frameFn, closedProf) {
    const np = prof.length, pos = [], nrm = [], uv = [], idx = [];
    for (let k = a; k <= b; k++) {
      const F = frameFn(k);
      for (let i = 0; i < np; i++) {
        const [r, u] = prof[i];
        pos.push(F.p[0] + F.r[0] * r + F.u[0] * u, F.p[1] + F.r[1] * r + F.u[1] * u, F.p[2] + F.r[2] * r + F.u[2] * u);
        const i0 = Math.max(0, i - 1), i1 = Math.min(np - 1, i + 1); const dr = prof[i1][0] - prof[i0][0], du = prof[i1][1] - prof[i0][1];
        const nr0 = du, nu0 = -dr, nl = Math.hypot(nr0, nu0) || 1;
        nrm.push((F.r[0] * nr0 + F.u[0] * nu0) / nl, (F.r[1] * nr0 + F.u[1] * nu0) / nl, (F.r[2] * nr0 + F.u[2] * nu0) / nl);
        uv.push(i / (np - 1) * 4, (k - a) * DS / 3);
      }
    }
    const segs = closedProf ? np : np - 1;
    for (let k = 0; k < b - a; k++) for (let i = 0; i < segs; i++) { const i2 = (i + 1) % np; const o = k * np; idx.push(o + i, o + np + i, o + i2, o + i2, o + np + i, o + np + i2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    return geo;
  }
  function runsOf(t, pred, n = t.n) { const out = []; let k = 0; while (k < n) { if (pred(t.type[k], k)) { let e = k; while (e + 1 < n && pred(t.type[e + 1], e + 1)) e++; out.push([Math.max(0, k - 1), Math.min(t.n - 1, e + 1)]); k = e + 1; } else k++; } return out; }
  function boxBetween(a, b, w, h) { const d = new V3().subVectors(b, a); const len = d.length(); const g = new THREE.BoxGeometry(w, h, len); const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y) / (len || 1) > 0.99 ? new V3(1, 0, 0) : new V3(0, 1, 0)); g.applyMatrix4(m); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; }
  function mergeSimple(geos) {
    let total = 0; const parts = geos.map(g => { const gg = g.index ? g.toNonIndexed() : g; total += gg.attributes.position.count; return gg; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3); let o = 0;
    for (const g of parts) { pos.set(g.attributes.position.array, o * 3); if (!g.attributes.normal) g.computeVertexNormals(); nrm.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); return geo;
  }
  function addMesh(geo, mat, cast = true, recv = true) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; group.add(m); return m; }
  function instances(geo, mat, list, setFn, cast = true) {
    if (!list.length) return null; const im = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((it, i) => { setFn(it, m4); im.setMatrixAt(i, m4); });
    im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); return im;
  }
  function clear() { while (group.children.length) { const c = group.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); if (c.dispose) c.dispose(); } }

  // ---------- track styles ----------
  // spine side: riders are on +U; the structure sits on the other side
  const STYLE_DEPTH = { tubular: 0.95, box: 1.2, truss: 1.2, ibox: 0.55, wood: 0.65, flat: 0.5, trough: 0.8 };
  function buildRails(t, style, below) {
    const Q = ctx.Q(), seg = Q.railSeg, sp = below ? 1 : -1, n = t.n;
    const P = new V3(), T = new V3(), U = new V3(), R = new V3(), nT = new V3();
    const total = t.closed ? t.L : t.Lm;
    const tieInst = (geo, spacing, mat) => {
      const nt = Math.floor(total / spacing), list = []; for (let i = 0; i < nt; i++) list.push(i * spacing);
      instances(geo, mat, list, (s, m) => { frameAt(t, s, P, T, U, R); nT.copy(T).negate(); m.makeBasis(R, U, nT).setPosition(P); });
    };
    const railTubes = (r, gauge, offU = 0) => { for (const side of [-1, 1]) addMesh(tubeGeometry(t, side * gauge, offU, r, seg, 0, n), mats.rail); };
    if (style === 'tubular') {
      railTubes(0.075, 0.55);
      addMesh(tubeGeometry(t, 0, sp * 0.62, 0.3, Q.spineSeg, 0, n), mats.spine);
      tieInst(mergeSimple([new THREE.BoxGeometry(1.22, 0.07, 0.1).translate(0, sp * 0.08, 0), boxBetween(new V3(-0.55, sp * 0.06, 0), new V3(-0.06, sp * 0.5, 0), 0.07, 0.07), boxBetween(new V3(0.55, sp * 0.06, 0), new V3(0.06, sp * 0.5, 0), 0.07, 0.07)]), 1.3, mats.spine);
    } else if (style === 'box') {
      railTubes(0.08, 0.55);
      addMesh(boxTube(t, 0, sp * 0.82, 0.72, 0.8, 0, n), mats.spine);
      tieInst(mergeSimple([new THREE.BoxGeometry(1.25, 0.06, 0.16).translate(0, sp * 0.1, 0), new THREE.BoxGeometry(0.1, 0.36, 0.16).translate(-0.4, sp * 0.26, 0), new THREE.BoxGeometry(0.1, 0.36, 0.16).translate(0.4, sp * 0.26, 0)]), 1.25, mats.spine);
    } else if (style === 'truss') {
      railTubes(0.08, 0.55);
      addMesh(tubeGeometry(t, 0, sp * 1.05, 0.13, seg, 0, n), mats.spine);
      const a = new V3(-0.55, 0, 0), b = new V3(0.55, 0, 0), c = new V3(0, sp * 1.05, 0);
      tieInst(mergeSimple([boxBetween(a, b, 0.07, 0.07), boxBetween(a, c, 0.07, 0.07), boxBetween(b, c, 0.07, 0.07), boxBetween(a, new V3(0, sp * 1.05, 1.6), 0.05, 0.05), boxBetween(b, new V3(0, sp * 1.05, 1.6), 0.05, 0.05)]), 1.6, mats.spine);
    } else if (style === 'ibox') {
      for (const side of [-1, 1]) addMesh(boxTube(t, side * 0.55, sp * 0.14, 0.16, 0.34, 0, n), mats.rail);
      tieInst(new THREE.BoxGeometry(1.36, 0.1, 0.14).translate(0, sp * 0.3, 0), 1.0, mats.spine);
      tieInst(new THREE.BoxGeometry(2.0, 0.22, 0.26).translate(0, sp * 0.45, 0), 1.0, mats.woodTrack);
    } else if (style === 'wood') {
      for (const side of [-1, 1]) { addMesh(boxTube(t, side * 0.55, sp * 0.02, 0.14, 0.04, 0, n), mats.rail); addMesh(boxTube(t, side * 0.55, sp * 0.25, 0.32, 0.42, 0, n), mats.woodTrack); }
      tieInst(new THREE.BoxGeometry(2.3, 0.16, 0.22).translate(0, sp * 0.54, 0), 0.62, mats.woodTrack);
    } else if (style === 'flat') {
      for (const side of [-1, 1]) addMesh(boxTube(t, side * 0.5, sp * 0.02, 0.1, 0.06, 0, n), mats.rail);
      addMesh(boxTube(t, 0, sp * 0.3, 0.34, 0.3, 0, n), mats.spine);
      tieInst(new THREE.BoxGeometry(1.15, 0.07, 0.12).translate(0, sp * 0.1, 0), 1.5, mats.spine);
    } else if (style === 'trough') {
      railTubes(0.06, 0.45);
      const prof = []; for (let i = 0; i <= 14; i++) { const a = (-172 + i * (164 / 14)) * DEG; prof.push([1.3 * Math.cos(a), 0.62 + 1.3 * Math.sin(a)]); }
      for (let a0 = 0; a0 < n - 1; a0 += 400) { const b0 = Math.min(n - 1, a0 + 401); addMesh(sweep(t, a0, b0, prof, k => ({ p: [t.px[k], t.py[k], t.pz[k]], r: [t.rx[k], t.ry[k], t.rz[k]], u: [t.ux[k], t.uy[k], t.uz[k]] })), mats.shell); }
      addMesh(tubeGeometry(t, 0, sp * 0.4, 0.18, seg, 0, n), mats.spine);
    }
    if (ctx.design().lights) for (const side of [-1, 1]) addMesh(tubeGeometry(t, side * 0.72, sp * 0.18, 0.035, 4, 0, n), mats.led, false, false);
  }

  // ---------- clearance grid (train envelope + rails) ----------
  function makeGrid(t) {
    const cell = 3, map = new Map(), pts = [];
    const add = (x, y, z, r, k) => { pts.push([x, y, z, r, k]); const key = Math.floor(x / cell) + ',' + Math.floor(y / cell) + ',' + Math.floor(z / cell); let a = map.get(key); if (!a) map.set(key, a = []); a.push(pts.length - 1); };
    for (let k = 0; k < t.n; k += 2) {
      add(t.px[k] + t.ux[k] * TRAIN.envOff, t.py[k] + t.uy[k] * TRAIN.envOff, t.pz[k] + t.uz[k] * TRAIN.envOff, TRAIN.envR, k);
      add(t.px[k], t.py[k], t.pz[k], 0.9, k);
    }
    return { hit(x, y, z, r, ignoreK, ignoreRad) {
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell), gz = Math.floor(z / cell);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) {
        const a = map.get((gx + i) + ',' + (gy + j) + ',' + (gz + l)); if (!a) continue;
        for (const pi of a) { const p = pts[pi]; if (ignoreK != null && Math.abs(p[4] - ignoreK) * DS < ignoreRad) continue; const d = Math.hypot(p[0] - x, p[1] - y, p[2] - z); if (d < p[3] + r) return true; }
      }
      return false;
    } };
  }
  function segClear(grid, a, b, r, ownK) {
    const len = a.distanceTo(b), n = Math.max(1, Math.ceil(len / 1.0));
    for (let i = 0; i <= n; i++) { const f = i / n; const x = a.x + (b.x - a.x) * f, y = a.y + (b.y - a.y) * f, z = a.z + (b.z - a.z) * f; if (grid.hit(x, y, z, r, ownK, i === n ? 3 : 1.2)) return false; }
    return true;
  }

  // ---------- supports ----------
  function buildSupports(t, style, below, trackStyle) {
    if (style === 'none') return;
    const grid = makeGrid(t), depth = STYLE_DEPTH[trackStyle] || 0.9;
    const P = new V3(), T = new V3(), U = new V3(), R = new V3(), A = new V3(), C = new V3(), Ct = new V3(), side = new V3(), spineDir = new V3();
    const cols = [], arms = [], foots = [], bents = [];
    const total = t.closed ? t.L : t.Lm;
    const steelStep = trackStyle === 'flat' ? 7 : 10;
    const isWood = style === 'wood';
    const st0 = 0, st1 = t.stationEnd + 1;
    let lastPlaced = -1e9, prevBent = null;
    const step = isWood ? 3 : 2;
    for (let s = 4; s < total - 2; s += step) {
      if (s > st0 && s < st1) continue;
      const k = Math.round(s / DS) % t.n;
      frameAt(t, s, P, T, U, R);
      spineDir.copy(U).multiplyScalar(below ? 1 : -1);
      A.copy(P).addScaledVector(spineDir, depth);
      const gA = ctx.terrainHeight(A.x, A.z), h = A.y - gA;
      if (h < 0.5) continue;
      // wooden lattice bents on upright sections
      if (isWood && spineDir.y < -0.3) {
        side.set(R.x, 0, R.z); if (side.lengthSq() < 1e-4) continue; side.normalize();
        const half = 1.0 + h * 0.07;
        const pL = A.clone().addScaledVector(side, -half), pR = A.clone().addScaledVector(side, half);
        const gL = ctx.terrainHeight(pL.x, pL.z), gR = ctx.terrainHeight(pR.x, pR.z);
        const bL = new V3(pL.x, gL - 0.2, pL.z), bR = new V3(pR.x, gR - 0.2, pR.z);
        if (!segClear(grid, bL, pL, 0.2, k) || !segClear(grid, bR, pR, 0.2, k)) continue;
        bents.push({ a: bL, b: pL, w: 0.2 }, { a: bR, b: pR, w: 0.2 }, { a: pL.clone().addScaledVector(side, -0.15), b: pR.clone().addScaledVector(side, 0.15), w: 0.16 });
        const lev = Math.max(1, Math.floor(h / 2.6)), ptsL = [], ptsR = [];
        for (let i = 1; i <= lev; i++) {
          const f0 = (i - 1) / lev, f1 = i / lev;
          const a0 = bL.clone().lerp(pL, f0), b0 = bR.clone().lerp(pR, f0), a1 = bL.clone().lerp(pL, f1), b1 = bR.clone().lerp(pR, f1);
          bents.push({ a: a1, b: b1, w: 0.12 }); if (i % 2) bents.push({ a: a0, b: b1, w: 0.09 }); else bents.push({ a: b0, b: a1, w: 0.09 });
          ptsL.push(a1); ptsR.push(b1);
        }
        // ledgers tie each bent to the previous one so the structure reads as a lattice, as on real wooden coasters
        if (prevBent && s - prevBent.s <= step * 1.5) {
          const n = Math.min(ptsL.length, prevBent.L.length);
          for (let i = 0; i < n; i++) { if (i % 2 === 0 || i === n - 1) { bents.push({ a: prevBent.L[i], b: ptsL[i], w: 0.08 }, { a: prevBent.R[i], b: ptsR[i], w: 0.08 }); } }
          if (Math.round(s / step) % 2 === 0 && n > 1) { bents.push({ a: prevBent.L[0], b: ptsL[Math.min(n - 1, 1)], w: 0.07 }, { a: prevBent.R[0], b: ptsR[Math.min(n - 1, 1)], w: 0.07 }); }
        }
        prevBent = { s, L: ptsL, R: ptsR };
        if (h > 8 && (Math.round(s / 3) % 3 === 0)) { const a0 = bL.clone().lerp(pL, 0.5); bents.push({ a: a0, b: pL.clone().addScaledVector(T, 3), w: 0.1 }); }
        foots.push(bL, bR);
        continue;
      }
      if (s - lastPlaced < steelStep) continue;
      side.set(R.x, 0, R.z); if (side.lengthSq() < 1e-3) side.set(-T.z, 0, T.x); side.normalize();
      const pref = Math.sign(spineDir.dot(side)) || 1;
      const cands = [];
      if (spineDir.y < -0.35) cands.push(0);
      for (const d of [3.0, 4.4, 6, 8, 10.5]) cands.push(d * pref, -d * pref);
      let ok = null;
      for (const off of cands) {
        C.copy(A).addScaledVector(side, off);
        const g = ctx.terrainHeight(C.x, C.z);
        const topY = off === 0 ? A.y : (spineDir.y > 0.2 ? A.y + 0.7 : A.y);
        Ct.set(C.x, topY, C.z);
        if (topY - g < 0.6) continue;
        const base = new V3(C.x, g - 0.3, C.z);
        if (!segClear(grid, base, Ct, 0.35, off === 0 ? k : null)) continue;
        if (off !== 0 && !segClear(grid, Ct, A, 0.25, k)) continue;
        ok = { base, top: Ct.clone(), off, h: topY - g }; break;
      }
      if (!ok) continue;
      lastPlaced = s;
      const r = 0.26 + Math.min(0.32, ok.h * 0.0034);
      if (ok.off === 0 && ok.h > 24 && spineDir.y < -0.8) {
        const spread = ok.h * 0.17, legs = [];
        for (const sg of [-1, 1]) { const b = ok.base.clone().addScaledVector(side, spread * sg); b.y = ctx.terrainHeight(b.x, b.z) - 0.3; if (segClear(grid, b, ok.top, 0.3, k)) legs.push(b); }
        if (legs.length === 2) { for (const b of legs) { cols.push([b, ok.top.clone(), r * 0.85]); foots.push(b); } arms.push([legs[0].clone().lerp(ok.top, 0.45), legs[1].clone().lerp(ok.top, 0.45), r * 0.5]); continue; }
      }
      cols.push([ok.base, ok.top, r]); foots.push(ok.base);
      if (ok.off !== 0) { arms.push([ok.top.clone(), A.clone(), r * 0.8]); if (ok.h > 10) arms.push([ok.base.clone().lerp(ok.top, 0.72), A.clone().lerp(ok.top, 0.2), r * 0.5]); }
    }
    const cyl = new THREE.CylinderGeometry(1, 1, 1, (style === 'box' ? 4 : ctx.Q().railSeg + 2), 1); cyl.translate(0, 0.5, 0); if (style === 'box') cyl.rotateY(Math.PI / 4);
    const setCyl = ([a, b, r], m) => { const d = v4.subVectors(b, a); const len = d.length(); tq.setFromUnitVectors(up, d.normalize()); m.compose(a, tq, v1.set(r, len, r)); };
    instances(cyl, mats.support, cols, setCyl); instances(cyl, mats.support, arms, setCyl);
    if (bents.length) { const bx = new THREE.BoxGeometry(1, 1, 1); bx.translate(0, 0, 0.5); instances(bx, mats.wood, bents, (it, m) => { const d = v4.subVectors(it.b, it.a); const len = d.length(); m.lookAt(it.b, it.a, Math.abs(d.y / (len || 1)) > 0.99 ? v2.set(1, 0, 0) : up); m.scale(v1.set(it.w, it.w, len)); m.setPosition(it.a); }); }
    if (foots.length) instances(new THREE.BoxGeometry(1.5, 0.8, 1.5), mats.footing, foots, (f, m) => m.makeTranslation(f.x, f.y + 0.25, f.z), false);
  }

  // ---------- catwalks on lifts, launches and brake runs ----------
  function buildCatwalks(t, below) {
    const sel = ty => isLiftCode(ty) || ty === T_BLOCK || ty === T_BRAKES || ty === T_LAUNCH;
    const runs = runsOf(t, sel, t.nm); if (!runs.length) return;
    const sp = below ? 1 : -1, sideOff = 1.15, w = 0.8;
    const g = ribbon(t, runs, k => {
      const cx = t.px[k] + t.rx[k] * sideOff + t.ux[k] * sp * 0.25, cy = t.py[k] + t.ry[k] * sideOff + t.uy[k] * sp * 0.25, cz = t.pz[k] + t.rz[k] * sideOff + t.uz[k] * sp * 0.25;
      return [[cx - t.rx[k] * w / 2, cy - t.ry[k] * w / 2, cz - t.rz[k] * w / 2], [cx + t.rx[k] * w / 2, cy + t.ry[k] * w / 2, cz + t.rz[k] * w / 2], [t.ux[k], t.uy[k], t.uz[k]]];
    }, 1);
    addMesh(g, mats.grate, true, true);
    for (const [a, b] of runs) {
      addMesh(tubeGeometry(t, sideOff + w / 2 + 0.05, sp * 0.25 - sp * 1.0, 0.035, 5, a, b + 1), mats.support, false);
      addMesh(tubeGeometry(t, sideOff + w / 2 + 0.05, sp * 0.25 - sp * 0.5, 0.025, 5, a, b + 1), mats.support, false);
      const posts = []; for (let k = a; k <= b; k += 4) posts.push(k);
      instances(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5).translate(0, 0.5, 0), mats.support, posts, (k, m) => {
        const x = t.px[k] + t.rx[k] * (sideOff + w / 2 + 0.05) + t.ux[k] * sp * 0.25, y = t.py[k] + t.ry[k] * (sideOff + w / 2 + 0.05) + t.uy[k] * sp * 0.25, z = t.pz[k] + t.rz[k] * (sideOff + w / 2 + 0.05) + t.uz[k] * sp * 0.25;
        v1.set(t.ux[k] * -sp, t.uy[k] * -sp, t.uz[k] * -sp); tq.setFromUnitVectors(up, v1); m.compose(v2.set(x, y, z), tq, v3.set(1, 1, 1));
      }, false);
    }
  }
  // ---------- tunnels ----------
  function buildTunnels(t) {
    const runs = []; let k = 0; while (k < t.nm) { if (t.tunnel[k]) { let e = k; while (e + 1 < t.nm && t.tunnel[e + 1]) e++; runs.push([Math.max(0, k - 2), Math.min(t.nm - 1, e + 2)]); k = e + 1; } else k++; }
    for (const [a, b] of runs) {
      const prof = [[3.4, -1.4], [3.4, 1.2]]; for (let i = 1; i < 12; i++) { const ang = i / 12 * Math.PI; prof.push([3.4 * Math.cos(ang), 1.2 + 3.0 * Math.sin(ang)]); } prof.push([-3.4, 1.2], [-3.4, -1.4]);
      const frame = kk => { const hx = t.tx[kk], hz = t.tz[kk], l = Math.hypot(hx, hz) || 1; const r = [hz / l, 0, -hx / l]; return { p: [t.hx[kk], t.hy[kk] - 1.0, t.hz[kk]], r: [-r[0], 0, -r[2]], u: [0, 1, 0] }; };
      addMesh(sweep(t, a, b, prof, frame), mats.tunnel, true, true);
      for (const kk of [a, b]) { const F = frame(kk); const ring = new THREE.Mesh(new THREE.TorusGeometry(3.6, 0.35, 6, 16, Math.PI), mats.concrete); ring.position.set(F.p[0], F.p[1] + 1.2, F.p[2]); ring.lookAt(F.p[0] + t.tx[kk], F.p[1] + 1.2, F.p[2] + t.tz[kk]); ring.castShadow = true; group.add(ring); }
    }
  }
  // ---------- drives, lifts, brakes ----------
  function buildMechanics(t, below) {
    const sp = below ? 1 : -1;
    const chainRuns = runsOf(t, ty => ty === T_CHAIN || ty === T_CABLE, t.nm);
    if (chainRuns.length) {
      const g = ribbon(t, chainRuns, k => { const c = [t.px[k] + t.ux[k] * sp * 0.07, t.py[k] + t.uy[k] * sp * 0.07, t.pz[k] + t.uz[k] * sp * 0.07]; const w = 0.11;
        return [[c[0] - t.rx[k] * w, c[1] - t.ry[k] * w, c[2] - t.rz[k] * w], [c[0] + t.rx[k] * w, c[1] + t.ry[k] * w, c[2] + t.rz[k] * w], [t.ux[k] * -sp, t.uy[k] * -sp, t.uz[k] * -sp]]; }, 0.5);
      addMesh(g, mats.chain, false, true);
      for (const [a, b] of chainRuns) addMesh(tubeGeometry(t, 0, sp * 0.16, 0.14, 4, a, b + 1, [1.2, 0.55]), mats.chassis);
    }
    const finRuns = runsOf(t, ty => ty === T_BRAKES || ty === T_TRIM || ty === T_BLOCK, t.nm);
    if (finRuns.length) addMesh(ribbon(t, finRuns, k => { const top = sp * 0.12, bot = sp * 0.42; return [[t.px[k] + t.ux[k] * top, t.py[k] + t.uy[k] * top, t.pz[k] + t.uz[k] * top], [t.px[k] + t.ux[k] * bot, t.py[k] + t.uy[k] * bot, t.pz[k] + t.uz[k] * bot], [t.rx[k], t.ry[k], t.rz[k]]]; }, 1), mats.fin);
    const lsmRuns = runsOf(t, ty => ty === T_LAUNCH, t.nm);
    for (const [a, b] of lsmRuns) for (const side of [-0.3, 0.3]) addMesh(boxTube(t, side, sp * 0.3, 0.12, 0.34, a, b + 1), mats.lsm);
    const P = new V3(), T = new V3(), U = new V3(), R = new V3(), nT = new V3();
    const tyreList = []; for (let s = 0; s < (t.closed ? t.L : t.Lm); s += 1.4) { const ty = t.typeAt(s); if (ty === T_STATION || ty === T_TRANSFER || ty === T_TIRES || ty === T_TIRELIFT || ty === T_BLOCK) tyreList.push(s); }
    instances(new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12).rotateZ(Math.PI / 2), mats.tyre, tyreList, (s, m) => { frameAt(t, s, P, T, U, R); nT.copy(T).negate(); m.makeBasis(R, U, nT).setPosition(P.addScaledVector(U, sp * 0.3)); }, false);
  }
  // ---------- station ----------
  function buildStation(t, below) {
    const P = new V3(), T = new V3(), U = new V3(), R = new V3();
    const len = Math.max(TRAIN.len + 6, t.stationEnd + 4), mid = Math.min(t.stationEnd, len) / 2;
    frameAt(t, mid, P, T, U, R);
    const g = new THREE.Group(); const yaw = Math.atan2(-T.x, -T.z);
    const gy = ctx.terrainHeight(P.x, P.z);
    const deck = below ? (TRAIN.hl - 1.15) : -0.35;                 // platform at the riders' feet
    const under = gy - P.y;
    const mk = (geo, mat, x, y, z, cs = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cs; m.receiveShadow = true; g.add(m); return m; };
    const wide = TRAIN.envR > 2.2 ? 1.6 : 0;
    mk(new THREE.BoxGeometry(3.4, 0.45, len), mats.concrete, -2.55 - wide, deck - 0.22, 0);
    mk(new THREE.BoxGeometry(2.2, 0.45, len), mats.concrete, 1.95 + wide, deck - 0.22, 0);
    const colH = Math.max(0.3, deck - 0.45 - under);
    for (let z = -len / 2 + 1.5; z <= len / 2 - 1.5; z += 4.5) for (const x of [-3.8 - wide, -1.3 - wide, 1.95 + wide]) mk(new THREE.BoxGeometry(0.45, colH, 0.45), mats.concrete, x, under + colH / 2, z);
    const stairLen = Math.max(2, (deck - under) * 1.6), steps = Math.max(3, Math.round((deck - under) / 0.2));
    for (let i = 0; i < steps; i++) { const f = i / steps; mk(new THREE.BoxGeometry(1.8, 0.22, stairLen / steps + 0.05), mats.concrete, -5.2 - wide, under + (deck - under) * f + 0.1, len / 2 - 3 - f * stairLen - stairLen / steps / 2); }
    for (const x of [-4.15 - wide, 2.95 + wide]) { mk(new THREE.BoxGeometry(0.06, 0.06, len), mats.roof, x, deck + 1.0, 0); for (let z = -len / 2; z <= len / 2; z += 2.5) mk(new THREE.BoxGeometry(0.06, 1.0, 0.06), mats.roof, x, deck + 0.5, z); }
    // air gates along the platform edge
    for (let z = -len / 2 + 2; z <= len / 2 - 2; z += TRAIN.carLen) mk(new THREE.BoxGeometry(0.05, 0.9, 1.1), mats.accent, -0.95 - wide, deck + 0.45, z);
    const roofY = Math.max(4.6, (below ? 2.2 : TRAIN.hl + 2.6));
    for (let z = -len / 2 + 1; z <= len / 2 - 1; z += (len - 2) / 4) for (const x of [-4.0 - wide, 2.8 + wide]) mk(new THREE.CylinderGeometry(0.16, 0.16, roofY - deck, 8), mats.roof, x, (roofY + deck) / 2, z);
    const roof = mk(new THREE.BoxGeometry(9.2 + wide * 2, 0.28, len + 3), mats.roof, -0.6, roofY, 0); roof.rotation.z = 0.06;
    mk(new THREE.BoxGeometry(9.3 + wide * 2, 0.7, 0.3), mats.accent, -0.6, roofY - 0.2, -len / 2 - 1.5);
    mk(new THREE.BoxGeometry(9.3 + wide * 2, 0.7, 0.3), mats.accent, -0.6, roofY - 0.2, len / 2 + 1.5);
    mk(new THREE.BoxGeometry(2.2, 2.4, 2.4), mats.concrete, -5.6 - wide, deck + 1.2, len / 2 - 2);
    mk(new THREE.BoxGeometry(2.25, 1.0, 2.45), mats.glass, -5.6 - wide, deck + 1.6, len / 2 - 2, false);
    g.position.copy(P); g.rotation.y = yaw;
    group.add(g);
    stationInfo = { P: P.clone(), yaw, len, deck, wide };
  }
  // ---------- guide chevrons ----------
  function buildChevrons(t) {
    chevData = [];
    const add = (k, dir, colr) => chevData.push({ k, s: k * DS, dir, col: colr });
    const span = 12; let lastTurn = -99, lastDrop = -99;
    for (let k = span; k < t.nm - span; k++) {
      if (t.uy[k] < 0.3 || t.type[k] === T_STATION || isLiftCode(t.type[k])) continue;
      let dh = t.heading[k + span] - t.heading[k - span]; if (Math.abs(dh) > 2.5) continue;
      const rate = dh / (2 * span * DS) / DEG;
      if (Math.abs(rate) > 0.75 && k - lastTurn >= 14) { add(k, rate > 0 ? 'right' : 'left', 0x22f0ff); lastTurn = k; continue; }
      if (t.ty[k] < -0.45 && k - lastDrop >= 12) { add(k, 'down', 0xff3cf0); lastDrop = k; }
    }
    for (let k = 1; k < t.nm - 1; k++) if (t.uy[k] < 0 && t.uy[k - 1] >= 0) add(Math.max(0, k - 30), 'up', 0xffd23c);
    chevron = null;
    if (!chevData.length) return;
    const sh = new THREE.Shape(); const w = 0.32, L = 1.1, H = 1.0;
    sh.moveTo(-L / 2, H); sh.lineTo(-L / 2 + w * 1.3, H); sh.lineTo(L / 2, 0); sh.lineTo(-L / 2 + w * 1.3, -H); sh.lineTo(-L / 2, -H); sh.lineTo(L / 2 - w * 1.3, 0); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    chevron = new THREE.InstancedMesh(geo, mat, chevData.length * 3); chevron.frustumCulled = false; chevron.renderOrder = 5;
    const P = new V3(), T = new V3(), U = new V3(), R = new V3(), rot = new THREE.Matrix4(), c = new THREE.Color();
    const Th = new V3(), Rh = new V3(), back = new V3(), pos = new V3();
    let i = 0;
    const hOff = Math.max(3.3, TRAIN.hl + 2.2);
    for (const d of chevData) {
      frameAt(t, d.s, P, T, U, R);
      Th.set(T.x, 0, T.z); if (Th.lengthSq() < 1e-4) Th.set(0, 0, -1); Th.normalize(); Rh.crossVectors(Th, up).normalize(); back.copy(Th).negate();
      const ang = d.dir === 'right' ? 0 : d.dir === 'left' ? Math.PI : d.dir === 'down' ? -Math.PI / 2 : Math.PI / 2;
      for (let j = 0; j < 3; j++) {
        pos.copy(P).addScaledVector(up, hOff);
        if (d.dir === 'right' || d.dir === 'left') pos.addScaledVector(Rh, (d.dir === 'right' ? 1 : -1) * (j - 1) * 0.95);
        else pos.addScaledVector(up, (d.dir === 'down' ? -1 : 1) * (j - 1) * 0.85);
        m4.makeBasis(Rh, up, back).setPosition(pos); m4.multiply(rot.makeRotationZ(ang)); m4.multiply(rot.makeScale(0.8, 0.8, 0.8));
        chevron.setMatrixAt(i, m4); chevron.setColorAt(i, c.setRGB(0, 0, 0)); i++;
      }
    }
    chevron.instanceMatrix.needsUpdate = true; group.add(chevron);
  }
  function updateChevrons(time, sTrain, mode) {
    if (!chevron) return; chevron.visible = guides && mode === 'pov';
    if (!chevron.visible) return;
    const c = new THREE.Color(); let i = 0; const pulse = 0.75 + 0.25 * Math.sin(time * 6);
    for (const d of chevData) {
      let ahead = d.s - sTrain; if (trk.closed && ahead < -50) ahead += trk.L;
      const vis = ahead > 4 && ahead < 230 ? (1 - smoothstep(140, 230, ahead)) * smoothstep(4, 18, ahead) : 0;
      for (let j = 0; j < 3; j++) { const b = vis * pulse * (1 - j * 0.18) * 1.6; c.setHex(d.col).multiplyScalar(b); chevron.setColorAt(i++, c); }
    }
    chevron.instanceColor.needsUpdate = true;
  }
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function build(t) {
    trk = t; clear(); if (!mats.rail) makeMats();
    const d = ctx.design(), tt = TRAIN_TYPES[d.train] || TRAIN_TYPES.hyper, below = tt.mount === 'below' || tt.mount === 'swing';
    setColors(d.colors);
    buildRails(t, d.track || 'tubular', below);
    buildMechanics(t, below);
    buildSupports(t, d.supports || 'steel', below, d.track || 'tubular');
    if (d.catwalks !== false) buildCatwalks(t, below);
    buildTunnels(t);
    buildStation(t, below);
    buildChevrons(t);
  }
  return { group, build, setColors, updateChevrons, frameAt, get mats() { return mats; }, get station() { return stationInfo; }, set guides(g) { guides = g; } };
}
// ===================== END TRACK GRAPHICS =====================
