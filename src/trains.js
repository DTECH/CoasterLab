// ===================== TRAINS: car models, wheel assemblies, restraints, patterns, animated riders =====================
// Car shells are lofted from rounded cross-sections, seats and fittings use rounded boxes and swept tubes, and the
// riders are instanced, jointed figures (shaped torso, head with face, hair styles, tapered limbs, hands and shoes).
function createTrains(THREE, ctx) {
  const V3 = THREE.Vector3;
  const group = new THREE.Group();
  let design = null, tt = null, trains = [], riders = [], partMeshes = {}, tex = {};
  const M = THREE.MeshStandardMaterial;
  const mats = {};
  const tm = new THREE.Matrix4(), tm2 = new THREE.Matrix4(), tm3 = new THREE.Matrix4(), tq = new THREE.Quaternion(), te = new THREE.Euler(), Y = new V3(0, 1, 0);
  const v1 = new V3(), v2 = new V3(), v3 = new V3(), vS = new V3(1, 1, 1);
  const P = new V3(), T = new V3(), U = new V3(), R = new V3(), nT = new V3();
  let rand = 1; const rnd = () => (rand = (rand * 16807) % 2147483647) / 2147483647;
  const detail = () => { const s = ctx.Q().railSeg || 8; return s <= 6 ? 0 : s <= 8 ? 1 : 2; };

  function makeMats(c) {
    const phys = ctx.Q().phys;
    mats.body = phys ? new THREE.MeshPhysicalMaterial({ color: c.body, metalness: 0.15, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06 }) : new M({ color: c.body, metalness: 0.2, roughness: 0.3 });
    mats.accent = phys ? new THREE.MeshPhysicalMaterial({ color: c.accent, metalness: 0.2, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.1 }) : new M({ color: c.accent, metalness: 0.25, roughness: 0.35 });
    mats.seat = new M({ color: c.seat, roughness: 0.62, metalness: 0.0 });
    mats.pad = new M({ color: 0x1b1c1f, roughness: 0.72 });
    mats.bar = new M({ color: c.restraint, roughness: 0.35, metalness: 0.25 });
    mats.chassis = new M({ color: 0x5a5f66, metalness: 0.7, roughness: 0.38 });
    mats.wheel = new M({ color: 0xe6e1d2, roughness: 0.55 });
    mats.hub = new M({ color: 0xb9bec4, metalness: 0.85, roughness: 0.3 });
    mats.chrome = new M({ color: 0xdfe3e8, metalness: 0.95, roughness: 0.14 });
    mats.wood = new M({ color: 0x7a5435, roughness: 0.8, map: ctx.groundTex });
    mats.decal = new M({ transparent: true, roughness: 0.32, metalness: 0.15, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false });
    mats.lamp = new THREE.MeshBasicMaterial({ color: 0xfff2c4, toneMapped: false });
    mats.tail = new THREE.MeshBasicMaterial({ color: 0xff3b2e, toneMapped: false });
  }
  function setColors(c) {
    if (!mats.body) return;
    mats.body.color.set(c.body); mats.accent.color.set(c.accent); mats.seat.color.set(c.seat); mats.bar.color.set(c.restraint);
    for (const k in tex) { tex[k].dispose(); } tex = {};
    for (const tr of trains) for (const car of tr.cars) for (const d of car.decals) { const m = decalMat(car.index); if (m) d.material = m; }
  }
  function patternTexture(pattern, accent, idx) {
    const key = pattern + accent + (pattern === 'number' ? idx : '');
    if (tex[key]) return tex[key];
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.clearRect(0, 0, 512, 128); g.fillStyle = accent; g.strokeStyle = accent;
    if (pattern === 'stripe') { g.fillRect(0, 50, 512, 16); g.fillRect(0, 74, 512, 6); }
    else if (pattern === 'split') g.fillRect(0, 0, 512, 60);
    else if (pattern === 'checker') { for (let x = 0; x < 512; x += 32) for (let y = 32; y < 96; y += 32) if (((x + y) / 32) % 2 === 0) g.fillRect(x, y, 32, 32); }
    else if (pattern === 'flame') { g.beginPath(); g.moveTo(0, 128); for (let x = 0; x <= 512; x += 64) { g.quadraticCurveTo(x + 16, 36 + (x % 128 ? 20 : 0), x + 32, 68); g.quadraticCurveTo(x + 48, 8 + (x % 128 ? 28 : 0), x + 64, 60); } g.lineTo(512, 128); g.closePath(); g.fill(); }
    else if (pattern === 'number') { g.beginPath(); g.arc(256, 64, 46, 0, 7); g.fill(); g.fillStyle = '#ffffff'; g.font = 'bold 58px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(idx + 1), 256, 66); g.fillStyle = accent; g.fillRect(0, 104, 512, 10); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; tex[key] = t; return t;
  }
  function decalMat(idx) { if (design.pattern === 'solid') return null; const m = mats.decal.clone(); m.map = patternTexture(design.pattern, design.colors.accent, idx); return m; }

  // ---------- geometry helpers ----------
  // rounded box (corner radius r) with optional concave bend across its width
  function roundedBox(w, h, d, r, s, bend = 0) {
    const seg = s * 2 + 1, g = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg);
    const pos = g.attributes.position, nor = g.attributes.normal, half = 0.5 / seg;
    r = Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3);
    const bx = w / 2 - r, by = h / 2 - r, bz = d / 2 - r, p = new V3(), n = new V3();
    for (let i = 0; i < pos.count; i++) {
      p.fromBufferAttribute(pos, i); n.copy(p);
      n.x -= Math.sign(n.x) * half; n.y -= Math.sign(n.y) * half; n.z -= Math.sign(n.z) * half; n.normalize();
      let x = bx * Math.sign(p.x) + n.x * r, y = by * Math.sign(p.y) + n.y * r, z = bz * Math.sign(p.z) + n.z * r;
      if (bend) z += bend * (x / (w / 2)) ** 2;
      pos.setXYZ(i, x, y, z); nor.setXYZ(i, n.x, n.y, n.z);
    }
    return g;
  }
  const chaikin = (pts, it) => { for (let k = 0; k < it; k++) { const o = []; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]); } pts = o; } return pts; };
  // loft closed rings (counter-clockwise seen from +z, ordered front to back) into a smooth closed shell
  function loftRings(rings, caps = true) {
    const Mn = rings[0].length, pos = [], idx = [], uv = [];
    rings.forEach((ring, i) => ring.forEach((p, j) => { pos.push(p[0], p[1], p[2]); uv.push(i / (rings.length - 1), j / Mn); }));
    for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < Mn; j++) { const a = i * Mn + j, b = i * Mn + (j + 1) % Mn, c = (i + 1) * Mn + j, d = (i + 1) * Mn + (j + 1) % Mn; idx.push(a, b, c, b, d, c); }
    if (caps) for (const [ri, flip] of [[0, true], [rings.length - 1, false]]) {
      const ring = rings[ri]; let cx = 0, cy = 0, cz = 0; ring.forEach(p => { cx += p[0]; cy += p[1]; cz += p[2]; });
      const ci = pos.length / 3; pos.push(cx / Mn, cy / Mn, cz / Mn); uv.push(ri ? 1 : 0, 0.5);
      for (let j = 0; j < Mn; j++) { const a = ri * Mn + j, b = ri * Mn + (j + 1) % Mn; flip ? idx.push(ci, b, a) : idx.push(ci, a, b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // merge geometries (each with an optional matrix); keeps position, normal, uv
  function merge(list) {
    const pos = [], nor = [], uv = [], idx = []; let off = 0; const nm = new THREE.Matrix3(), p = new V3(), n = new V3();
    for (const it of list) {
      const g = it.geo || it, m = it.m;
      const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
      if (m) nm.getNormalMatrix(m);
      for (let i = 0; i < pa.count; i++) {
        p.fromBufferAttribute(pa, i); n.fromBufferAttribute(na, i);
        if (m) { p.applyMatrix4(m); n.applyMatrix3(nm).normalize(); }
        pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < pa.count; i++) idx.push(i + off);
      off += pa.count;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
    return g;
  }
  const mat4 = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new V3(sx, sy, sz));
  const tube = (pts, r, seg) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(p => new V3(p[0], p[1], p[2]))), seg, r, detail() === 2 ? 8 : 6, false);
  const capTube = (pts, r, seg) => { const g = tube(pts, r, seg); const a = pts[0], b = pts[pts.length - 1]; const s = new THREE.SphereGeometry(r, detail() === 2 ? 8 : 6, 4); return merge([g, { geo: s, m: mat4(a[0], a[1], a[2]) }, { geo: s, m: mat4(b[0], b[1], b[2]) }]); };
  // tapered limb along +y from 0 to len with rounded ends
  function limbGeo(len, r0, r1, radial) {
    const pts = [], cap = 3;
    for (let i = 0; i <= cap; i++) { const a = -Math.PI / 2 + i / cap * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r0, r0 + Math.sin(a) * r0)); }
    for (let i = 1; i < 4; i++) { const f = i / 4, r = r0 + (r1 - r0) * f; pts.push(new THREE.Vector2(r * (1 + 0.08 * Math.sin(f * Math.PI)), r0 + (len - r0 - r1) * f)); }
    for (let i = 0; i <= cap; i++) { const a = i / cap * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * r1, len - r1 + Math.sin(a) * r1)); }
    pts[0].x = 0.0001; pts[pts.length - 1].x = 0.0001;
    return new THREE.LatheGeometry(pts, radial);
  }
  // ellipse-ring loft along +y (torso, pelvis): sections [y, rx, rz, zOff, squareness]
  function bodyLoft(secs, radial) {
    const rings = secs.map(([y, rx, rz, zo = 0, sq = 2]) => { const ring = []; for (let j = 0; j < radial; j++) { const a = j / radial * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); const e = 2 / sq; ring.push([rx * Math.sign(c) * Math.abs(c) ** e, y, zo + rz * Math.sign(s) * Math.abs(s) ** e]); } return ring; });
    // rings lie in x-z; reorder to be counter-clockwise looking along +y... loftRings expects rings stacked along an axis; we pass them as-is and fix winding below
    const g = loftRings(rings);
    return fixWinding(g, new V3(1, 0, 0));
  }
  // make sure triangles face outward: compare the normal at the vertex furthest along dir
  function fixWinding(g, dir) {
    const pa = g.attributes.position, na = g.attributes.normal; let best = -1e9, bi = 0;
    for (let i = 0; i < pa.count; i++) { const d = pa.getX(i) * dir.x + pa.getY(i) * dir.y + pa.getZ(i) * dir.z; if (d > best) { best = d; bi = i; } }
    const dn = na.getX(bi) * dir.x + na.getY(bi) * dir.y + na.getZ(bi) * dir.z;
    if (dn < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.index.needsUpdate = true; g.computeVertexNormals(); }
    return g;
  }

  // ---------- car hull: a lofted tub (rounded outer skin, lip, inner wall and floor) ----------
  function hullRing(W, hb, hs, hd, t, f, bulge) {
    const hw = W / 2, hdE = hs - (hs - hd) * f, tt0 = t * Math.max(0.15, f);
    const right = [[0, hb], [hw - 0.13, hb], [hw - 0.02, hb + 0.07], [hw + bulge, hb + (hs - hb) * 0.45], [hw + bulge * 0.4, hs - 0.07], [hw - 0.02, hs], [hw - tt0 + 0.02, hs], [hw - tt0, hs - 0.06 * f - 0.01], [hw - tt0 - 0.02, hdE + 0.06 * f], [hw - tt0 - 0.12 * f - 0.02, hdE], [0, hdE]];
    const poly = right.slice(); for (let i = right.length - 2; i >= 1; i--) poly.push([-right[i][0], right[i][1]]);
    return chaikin(poly, 2);
  }
  // sections: [z, widthScale, sideHeight, troughFactor, bottomLift]
  function hullGeo(W, hb, hs, hd, t, bulge, secs) {
    const rings = secs.map(([z, ws, hS, f, lift = 0]) => hullRing(W * ws, hb + lift, hS, Math.min(hd, hS - 0.02), t, f, bulge * ws).map(p => [p[0], p[1], z]));
    return fixWinding(loftRings(rings), new V3(1, 0, 0));
  }
  function carSections(L, hs, nose, front, rear, style) {
    const s = [], hL = L / 2;
    if (front && nose > 0) {
      if (style === 'ptc') s.push([-hL - nose, 0.8, hs * 0.72, 0, 0.06], [-hL - nose * 0.75, 0.94, hs * 0.92, 0, 0.02], [-hL - nose * 0.35, 1, hs + 0.1, 0.15], [-hL + 0.05, 1, hs + 0.04, 1]);
      else s.push([-hL - nose, 0.34, hs * 0.5, 0, 0.14], [-hL - nose * 0.8, 0.62, hs * 0.66, 0, 0.06], [-hL - nose * 0.5, 0.86, hs * 0.86, 0, 0.02], [-hL - nose * 0.15, 0.98, hs + 0.06, 0.2], [-hL + 0.12, 1, hs + 0.02, 1]);
    } else s.push([-hL - 0.04, 0.9, hs - 0.14, 0, 0.03], [-hL + 0.03, 0.98, hs - 0.03, 0.6], [-hL + 0.1, 1, hs, 1]);
    s.push([0, 1, hs, 1]);
    if (rear) s.push([hL - 0.12, 1, hs, 1], [hL - 0.02, 0.98, hs - 0.03, 0.7], [hL + 0.06, 0.92, hs - 0.12, 0, 0.03]);
    else s.push([hL - 0.1, 1, hs, 1], [hL - 0.03, 0.98, hs - 0.03, 0.6], [hL + 0.04, 0.9, hs - 0.14, 0, 0.03]);
    return s;
  }

  // ---------- shared part geometry (built once per detail level) ----------
  const G = {}; let gDet = -1;
  function sharedGeo() {
    const dt = detail(); if (gDet === dt) return; gDet = dt;
    const rs = dt === 2 ? 2 : 1, ws = dt === 0 ? 10 : dt === 1 ? 14 : 18;
    const tirePts = [[0.05, -0.052], [0.118, -0.052], [0.14, -0.04], [0.15, -0.02], [0.15, 0.02], [0.14, 0.04], [0.118, 0.052], [0.05, 0.052]].map(p => new THREE.Vector2(p[0], p[1]));
    G.tire = new THREE.LatheGeometry(tirePts, ws).rotateZ(Math.PI / 2);
    G.hubCap = new THREE.CylinderGeometry(0.06, 0.07, 0.115, ws).rotateZ(Math.PI / 2);
    G.smallTire = G.tire.clone().scale(1, 0.66, 0.66);
    G.bracket = roundedBox(0.1, 0.48, 0.3, 0.035, rs);
    G.axle = roundedBox(1.0, 0.12, 0.18, 0.04, rs);
    // bucket seat: pan, sculpted back with side bolsters, headrest
    G.seatPan = roundedBox(0.46, 0.09, 0.46, 0.04, rs, -0.025);
    G.seatBack = roundedBox(0.46, 0.6, 0.1, 0.045, rs, 0.05);
    G.bolster = roundedBox(0.07, 0.5, 0.16, 0.03, rs);
    G.headrest = roundedBox(0.3, 0.24, 0.11, 0.05, rs, 0.03);
    G.headWing = roundedBox(0.07, 0.24, 0.17, 0.03, rs);
    G.bikeSeat = roundedBox(0.22, 0.08, 0.3, 0.035, rs);
    G.box = roundedBox(1, 1, 1, 0.06, rs);
    G.cyl = new THREE.CylinderGeometry(1, 1, 1, 12).translate(0, 0.5, 0);
    G.lamp = new THREE.SphereGeometry(0.06, 10, 8);
    G.restraint = {};
  }
  const add = (g, geo, mat, m, cast = true) => { const mesh = new THREE.Mesh(geo, mat); mesh.matrixAutoUpdate = false; mesh.matrix.copy(m); mesh.castShadow = cast; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  const rb = (g, mat, x, y, z, w, h, d, r = 0.05, rx = 0, ry = 0, rz = 0) => add(g, roundedBox(w, h, d, r, detail() === 2 ? 2 : 1), mat, mat4(x, y, z, rx, ry, rz));

  // restraints, in a seat frame whose origin is the rider's hip joint (x right, y up, z backward)
  function restraintGeo(kind) {
    if (G.restraint[kind]) return G.restraint[kind];
    const seg = detail() === 2 ? 18 : 12; let frame, pad;
    if (kind === 'tbar') {
      frame = merge([capTube([[0, -0.42, -0.42], [0, -0.1, -0.38], [0, 0.1, -0.3], [0, 0.16, -0.27]], 0.032, seg), capTube([[-0.17, 0.17, -0.27], [0, 0.18, -0.28], [0.17, 0.17, -0.27]], 0.022, 12)]);
      pad = merge([capTube([[-0.16, 0.12, -0.22], [-0.06, 0.13, -0.24]], 0.045, 6), capTube([[0.06, 0.13, -0.24], [0.16, 0.12, -0.22]], 0.045, 6)]);
    } else if (kind === 'lap') {
      frame = merge([capTube([[-0.27, -0.02, 0.0], [-0.25, 0.1, -0.12], [-0.2, 0.17, -0.22], [0, 0.19, -0.26], [0.2, 0.17, -0.22], [0.25, 0.1, -0.12], [0.27, -0.02, 0.0]], 0.026, seg)]);
      pad = capTube([[-0.14, 0.18, -0.24], [0, 0.195, -0.265], [0.14, 0.18, -0.24]], 0.048, 10);
    } else if (kind === 'otsr' || kind === 'standup' || kind === 'vest') {
      const bars = [], pads = [], thin = kind === 'vest' ? 0.75 : 1;
      for (const s of [-1, 1]) {
        bars.push(capTube([[s * 0.07, 0.95, 0.15], [s * 0.15, 0.9, 0.06], [s * 0.2, 0.78, -0.05], [s * 0.18, 0.56, -0.18], [s * 0.12, 0.32, -0.23], [s * 0.05, 0.16, -0.24]], 0.034 * thin, seg));
        pads.push(capTube([[s * 0.13, 0.82, 0.02], [s * 0.165, 0.74, -0.06], [s * 0.15, 0.55, -0.15], [s * 0.11, 0.36, -0.18]], 0.052 * thin, 16));
      }
      bars.push(capTube([[-0.07, 0.95, 0.15], [0, 0.98, 0.17], [0.07, 0.95, 0.15]], 0.04, 8));
      bars.push(capTube([[-0.05, 0.16, -0.24], [0, 0.12, -0.24], [0.05, 0.16, -0.24]], 0.04, 8));
      if (kind === 'vest') pads.push({ geo: roundedBox(0.3, 0.3, 0.06, 0.03, 2, -0.03), m: mat4(0, 0.48, -0.19, 0.18) });
      if (kind === 'standup') pads.push({ geo: roundedBox(0.26, 0.11, 0.1, 0.04, 2, -0.03), m: mat4(0, 0.03, -0.2) });
      frame = merge(bars); pad = merge(pads);
    }
    return (G.restraint[kind] = { frame, pad });
  }

  // ---------- wheel assemblies (road, guide and upstop wheels on each rail) ----------
  function bogies(g, L, ySign, gauge) {
    const items = { tire: [], hub: [], frame: [] };
    for (const zz of [-L / 2 + 0.42, L / 2 - 0.42]) {
      for (const s of [-1, 1]) {
        const x = s * gauge;
        // road wheels ride on top of the rails and upstop wheels underneath whichever way the car hangs
        items.tire.push({ geo: G.tire, m: mat4(x, 0.225, zz) }, { geo: G.smallTire, m: mat4(x, -0.17, zz) }, { geo: G.smallTire, m: mat4(x + s * 0.17, 0, zz, 0, 0, Math.PI / 2) });
        items.hub.push({ geo: G.hubCap, m: mat4(x, 0.225, zz) });
        items.frame.push({ geo: G.bracket, m: mat4(x + s * 0.11, ySign * 0.04, zz) });
      }
      items.frame.push({ geo: G.axle, m: mat4(0, ySign * 0.33, zz) });
    }
    add(g, merge(items.tire), mats.wheel, mat4(0, 0, 0)); add(g, merge(items.hub), mats.hub, mat4(0, 0, 0)); add(g, merge(items.frame), mats.chassis, mat4(0, 0, 0));
  }
  function decalStrip(g, car, x0, z0, z1, y, h, side) {
    const m = decalMat(car.index); if (!m) return;
    const d = new THREE.Mesh(new THREE.PlaneGeometry(z1 - z0, h), m); d.position.set(x0 * side, y, (z0 + z1) / 2); d.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2; d.renderOrder = 2; g.add(d); car.decals.push(d);
  }
  // bucket seat (+ headrest) at a seat whose hip joint is at (x, y, z)
  function bucketSeat(list, x, y, z, opts = {}) {
    list.push({ geo: G.seatPan, m: mat4(x, y - 0.1, z - 0.03) }, { geo: G.seatBack, m: mat4(x, y + 0.24, z + 0.2, -0.12) });
    if (opts.bolsters !== false) for (const s of [-1, 1]) list.push({ geo: G.bolster, m: mat4(x + s * 0.21, y + 0.2, z + 0.15, -0.12) });
    if (opts.head) { list.push({ geo: G.headrest, m: mat4(x, y + 0.72, z + 0.25, -0.08) }); if (opts.wings) for (const s of [-1, 1]) list.push({ geo: G.headWing, m: mat4(x + s * 0.16, y + 0.72, z + 0.2, -0.08, s * 0.25) }); }
  }
  let barSink = null;
  function restraint(g, kind, x, y, z, keep, prone) {
    const geo = restraintGeo(kind); const m = mat4(x, y, z);
    if (prone) m.multiply(new THREE.Matrix4().makeRotationX(-Math.PI / 2)).multiply(new THREE.Matrix4().makeTranslation(0, -0.05, 0.1));
    const parts = [add(g, geo.frame, mats.bar, m), add(g, geo.pad, mats.pad, m)];
    parts.forEach(p => { p.userData.keep = keep; });
    barSink = kind === 'lap' || kind === 'tbar' ? null : parts;
  }
  // merge every static mesh of a group by material (fewer draw calls); restraints flagged keep stay separate
  function bake(g) {
    const byMat = new Map(), drop = [];
    for (const o of g.children) {
      if (!o.isMesh || o.userData.keep || o.material.transparent) continue;
      if (o.matrixAutoUpdate) o.updateMatrix();
      let a = byMat.get(o.material); if (!a) byMat.set(o.material, a = []); a.push({ geo: o.geometry, m: o.matrix.clone() }); drop.push(o);
    }
    for (const o of drop) g.remove(o);
    for (const [mat, list] of byMat) { const mesh = new THREE.Mesh(merge(list), mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.own = true; g.add(mesh); }
  }

  // ---------- car builders: seats are {x, y (hip), z, pose} in the car frame (x right, y up, z backward) ----------
  function buildCar(idx, front, rear) {
    sharedGeo(); barSink = null;
    const car = { index: idx, root: new THREE.Group(), body: new THREE.Group(), seats: [], decals: [], swing: 0, swingV: 0, spin: 0, spinV: 0, pitch: 0 };
    car.root.matrixAutoUpdate = false; car.root.add(car.body);
    const g = car.body, rows = design.rows || tt.rows, seats = design.seats || tt.seats, sw = tt.seatW;
    const L = TRAIN.carLen - 0.15, W = Math.max(1.3, seats * sw + 0.26);
    const rowZ = r => (r - (rows - 1) / 2) * tt.rowPitch + 0.05, seatX = s => (s - (seats - 1) / 2) * sw;
    const hip = tt.hl - 0.42, pose = tt.pose, gauge = { flat: 0.5, trough: 0.45 }[design.track] || 0.55;
    const keepBars = idx === 0 || idx === TRAIN.cars - 1;
    const seatsList = [];
    const allX = []; for (let s = 0; s < seats; s++) allX.push(seatX(s));
    const otsrSeat = tt.restraint === 'otsr';
    const pushSeat = (grp, x, y, z, p, extra = {}) => { restraint(grp, tt.restraint, x, y, z, keepBars, p === 'prone'); car.seats.push({ bars: barSink, x, y, z, pose: p, ...extra }); };
    const lamps = (gg, y, z, w) => { for (const s of [-1, 1]) add(gg, G.lamp, mats.lamp, mat4(s * w, y, z), false); };
    switch (tt.body) {
      case 'hyper': case 'looper': case 'ptc': case 'mine': case 'mouse': {
        const hb = 0.3, hd = hip - 0.17;
        const hs = tt.body === 'hyper' ? hip + 0.1 : tt.body === 'looper' ? hip + 0.28 : tt.body === 'ptc' ? hip + 0.3 : tt.body === 'mine' ? hip + 0.24 : hip + 0.34;
        const nose = tt.body === 'hyper' ? 0.75 : tt.body === 'looper' ? 0.6 : tt.body === 'ptc' ? 0.4 : tt.body === 'mouse' ? 0.25 : 0;
        const secs = carSections(L, hs, nose, front && nose > 0, rear, tt.body);
        const hull = hullGeo(W, hb, hs, hd, 0.08, tt.body === 'mine' ? 0.0 : 0.035, secs);
        add(g, hull, tt.body === 'mine' ? mats.wood : mats.body, mat4(0, 0, 0));
        if (tt.body === 'mine') for (const zz of [-L / 2 + 0.15, 0, L / 2 - 0.15]) rb(g, mats.chassis, 0, hb + (hs - hb) / 2, zz, W + 0.05, hs - hb + 0.03, 0.06, 0.025);
        if (tt.body === 'mouse') for (const zz of [-L / 2 - 0.1, L / 2 + 0.1]) rb(g, mats.chrome, 0, 0.45, zz, W + 0.06, 0.16, 0.14, 0.06);
        // accent trim along the lip and a chassis skirt
        for (const sd of [-1, 1]) rb(g, mats.accent, sd * (W / 2 - 0.035), hs + 0.004, 0, 0.085, 0.03, L - 0.16, 0.014);
        rb(g, mats.chassis, 0, hb + 0.02, 0, W - 0.18, 0.1, L - 0.3, 0.04);
        decalStrip(g, car, W / 2 + 0.05, -L / 2 + 0.25, L / 2 - 0.2, hb + (hs - hb) * 0.5, Math.min(0.3, (hs - hb) * 0.55), 1);
        decalStrip(g, car, W / 2 + 0.05, -L / 2 + 0.25, L / 2 - 0.2, hb + (hs - hb) * 0.5, Math.min(0.3, (hs - hb) * 0.55), -1);
        if (front && nose > 0) { lamps(g, hb + 0.18, -L / 2 - nose * 0.9, W * 0.18); }
        if (rear) for (const s of [-1, 1]) add(g, G.lamp, mats.tail, mat4(s * W * 0.35, hs - 0.12, L / 2 + 0.06, 0, 0, 0, 0.8, 0.5, 0.4), false);
        bogies(g, L, 1, gauge);
        for (let r = 0; r < rows; r++) for (const x of allX) { bucketSeat(seatsList, x, hip, rowZ(r), { head: otsrSeat || tt.body === 'looper', wings: otsrSeat }); pushSeat(g, x, hip, rowZ(r), pose); }
        break; }
      case 'floorless': case 'standup': case 'dive': {
        const deckY = pose === 'stand' ? 0.34 : 0.5;
        add(g, roundedBox(0.62, 0.26, L - 0.25, 0.08, detail() === 2 ? 2 : 1), mats.body, mat4(0, deckY, 0));
        for (const s of [-1, 1]) add(g, roundedBox(0.09, 0.2, L - 0.4, 0.04, 2), mats.accent, mat4(s * 0.33, deckY + 0.02, 0));
        if (front) { add(g, roundedBox(W * 0.7, 0.34, 0.5, 0.15, detail() === 2 ? 2 : 1), mats.body, mat4(0, deckY + 0.12, -L / 2 - 0.15, 0.25)); lamps(g, deckY + 0.08, -L / 2 - 0.38, 0.2); }
        decalStrip(g, car, 0.32, -L / 2 + 0.3, L / 2 - 0.3, deckY, 0.18, 1); decalStrip(g, car, 0.32, -L / 2 + 0.3, L / 2 - 0.3, deckY, 0.18, -1);
        bogies(g, L, 1, gauge);
        for (let r = 0; r < rows; r++) {
          const lift = tt.body === 'dive' ? r * 0.38 : 0, z = rowZ(r);
          // row beam carrying the seats (stand-up trains get a floor plate under the riders' feet instead)
          if (pose === 'stand') { add(g, roundedBox(W - 0.1, 0.06, 0.5, 0.025, 1), mats.chassis, mat4(0, hip - 0.9, z - 0.05)); for (const x of allX) add(g, G.cyl, mats.chrome, mat4(x, hip - 0.88, z + 0.12, 0, 0, 0, 0.035, 0.8, 0.035)); }
          else add(g, roundedBox(W - 0.1, 0.14, 0.34, 0.06, detail() === 2 ? 2 : 1), mats.body, mat4(0, hip - 0.2 + lift, z + 0.05));
          if (lift) add(g, roundedBox(0.5, lift + 0.1, 0.3, 0.05, 2), mats.chassis, mat4(0, hip - 0.2 + lift / 2, z + 0.05));
          if (pose !== 'stand') for (const s of [-1, 1]) add(g, roundedBox(0.12, 0.22, 0.42, 0.05, 2), mats.accent, mat4(s * (W / 2 - 0.02), hip - 0.18 + lift, z + 0.05));
          for (const x of allX) {
            if (pose === 'stand') { seatsList.push({ geo: G.bikeSeat, m: mat4(x, hip - 0.05, z + 0.02) }, { geo: G.seatBack, m: mat4(x, hip + 0.42, z + 0.2, -0.04, 0, 0, 0.8, 1.15, 1) }); }
            else bucketSeat(seatsList, x, hip + lift, z, { head: true, wings: true });
            pushSeat(g, x, hip + lift, z, pose);
          }
        }
        break; }
      case 'inverted': case 'flying': {
        bogies(g, L, -1, gauge);
        add(g, roundedBox(0.66, 0.3, L - 0.3, 0.1, detail() === 2 ? 2 : 1), mats.body, mat4(0, -0.5, 0));
        const frameY = tt.body === 'flying' ? hip + 0.42 : hip + 0.98;
        // hanger posts and the seat carrier
        for (const zz of [-L / 2 + 0.45, L / 2 - 0.45]) add(g, roundedBox(0.16, Math.abs(frameY + 0.5) + 0.1, 0.16, 0.05, 2), mats.chassis, mat4(0, (frameY - 0.5) / 2, zz));
        if (tt.body === 'flying') {
          add(g, roundedBox(W, 0.16, L - 0.35, 0.07, detail() === 2 ? 2 : 1), mats.body, mat4(0, frameY, 0));
          for (const s of [-1, 1]) add(g, roundedBox(0.1, 0.18, L - 0.5, 0.04, 2), mats.accent, mat4(s * (W / 2 + 0.02), frameY, 0));
        } else {
          // a narrow carrier over the middle of the row; each seat hangs from it by an arm behind the headrest
          add(g, roundedBox(0.42, 0.2, L - 0.35, 0.08, detail() === 2 ? 2 : 1), mats.body, mat4(0, frameY + 0.08, 0.1));
          for (let r = 0; r < rows; r++) for (const x of allX) { const a = new V3(Math.sign(x) * 0.18, frameY + 0.05, rowZ(r) + 0.32), b = new V3(x, hip + 0.82, rowZ(r) + 0.3), d = b.clone().sub(a); add(g, roundedBox(0.09, d.length() + 0.08, 0.12, 0.04, 1), mats.accent, new THREE.Matrix4().compose(a.clone().lerp(b, 0.5), new THREE.Quaternion().setFromUnitVectors(Y, d.normalize()), new V3(1, 1, 1))); }
        }
        if (front) { add(g, roundedBox(W * 0.8, 0.22, 0.45, 0.1, detail() === 2 ? 2 : 1), mats.body, mat4(0, frameY + 0.05, -L / 2 - 0.12, 0.3)); lamps(g, frameY, -L / 2 - 0.34, 0.25); }
        decalStrip(g, car, 0.34, -L / 2 + 0.3, L / 2 - 0.3, -0.5, 0.2, 1); decalStrip(g, car, 0.34, -L / 2 + 0.3, L / 2 - 0.3, -0.5, 0.2, -1);
        for (let r = 0; r < rows; r++) for (const x of allX) {
          const z = rowZ(r);
          if (tt.body === 'flying') { seatsList.push({ geo: G.seatBack, m: mat4(x, hip + 0.3, z - 0.26, Math.PI / 2 - 0.06, 0, 0, 1, 1.3, 1) }); }
          else { bucketSeat(seatsList, x, hip, z, { head: true, wings: true }); seatsList.push({ geo: G.box, m: mat4(x, hip + 0.88, z + 0.24, 0, 0, 0, 0.12, 0.2, 0.1) }); }
          pushSeat(g, x, hip, z, pose);
        }
        break; }
      case 'suspended': {
        bogies(g, L, -1, gauge);
        add(g, roundedBox(0.5, 0.26, L - 0.4, 0.08, detail() === 2 ? 2 : 1), mats.chassis, mat4(0, -0.45, 0));
        add(g, G.cyl, mats.chrome, mat4(0, -1.05, 0, 0, 0, 0, 0.06, 0.6, 0.06));
        car.swingPivot = -0.45;
        const cg = new THREE.Group(); car.swingGroup = cg; car.body.add(cg); cg.matrixAutoUpdate = false;
        const hb = hip - 0.45, hs = hip + 0.3;
        const secs = carSections(L, hs, front ? 0.5 : 0, front, rear, 'hyper');
        add(cg, hullGeo(W, hb, hs, hip - 0.16, 0.08, 0.04, secs), mats.body, mat4(0, 0, 0));
        // hanger yoke from the swing pivot down to the front and back of the car
        for (const zz of [-L / 2 + 0.12, L / 2 - 0.12]) { const a = new V3(0, -0.5, 0), b = new V3(0, hs - 0.02, zz), d = b.clone().sub(a); add(cg, G.cyl, mats.chassis, new THREE.Matrix4().compose(a, new THREE.Quaternion().setFromUnitVectors(Y, d.clone().normalize()), new V3(0.06, d.length(), 0.06))); }
        add(cg, roundedBox(0.2, 0.14, 0.26, 0.05, 1), mats.chassis, mat4(0, -0.5, 0));
        decalStrip(cg, car, W / 2 + 0.05, -L / 2 + 0.25, L / 2 - 0.2, (hb + hs) / 2, 0.28, 1); decalStrip(cg, car, W / 2 + 0.05, -L / 2 + 0.25, L / 2 - 0.2, (hb + hs) / 2, 0.28, -1);
        const sl = [];
        for (let r = 0; r < rows; r++) for (const x of allX) { const z = rowZ(r); bucketSeat(sl, x, hip, z); pushSeat(cg, x, hip, z, 'sit', { swing: true }); }
        add(cg, merge(sl), mats.seat, mat4(0, 0, 0)); bake(cg);
        break; }
      case 'wing': case 'fourd': {
        bogies(g, L, 1, gauge);
        add(g, roundedBox(0.7, 0.3, L - 0.3, 0.1, detail() === 2 ? 2 : 1), mats.body, mat4(0, 0.5, 0));
        if (front) { add(g, roundedBox(0.66, 0.34, 0.5, 0.15, detail() === 2 ? 2 : 1), mats.body, mat4(0, 0.55, -L / 2 - 0.12, 0.3)); lamps(g, 0.52, -L / 2 - 0.35, 0.18); }
        const half = Math.ceil(seats / 2), xs = [];
        for (let i = 0; i < half; i++) { const off = 0.95 + i * sw; xs.push(-off, off); }
        const span = 0.95 + half * sw - 0.25, wingY = tt.body === 'fourd' ? hip + 0.25 : hip - 0.2;
        for (const s of [-1, 1]) {
          add(g, roundedBox(span, 0.15, 0.62, 0.06, detail() === 2 ? 2 : 1), mats.body, mat4(s * span / 2, wingY, 0));
          add(g, roundedBox(0.16, Math.abs(0.5 - wingY) + 0.1, 0.3, 0.05, 2), mats.chassis, mat4(s * 0.35, (0.5 + wingY) / 2, 0));
          decalStrip(g, car, span + 0.002, -0.28, 0.28, wingY, 0.13, s);
        }
        if (tt.body === 'fourd') { for (const s of [-1, 1]) add(g, G.cyl, mats.chrome, mat4(s * 0.5, wingY, 0, 0, 0, -s * Math.PI / 2, 0.07, span - 0.4, 0.07)); car.spinGroupL = new THREE.Group(); car.spinGroupR = new THREE.Group(); car.body.add(car.spinGroupL, car.spinGroupR); car.spinY = hip + 0.25; }
        const lists = { g: [], L: [], R: [] };
        for (let r = 0; r < rows; r++) for (const x of xs) {
          const z = rowZ(r), sg = tt.body === 'fourd' ? (x < 0 ? car.spinGroupL : car.spinGroupR) : g, key = tt.body === 'fourd' ? (x < 0 ? 'L' : 'R') : 'g';
          bucketSeat(lists[key], x, hip, z, { head: true, wings: true });
          pushSeat(sg, x, hip, z, 'hang', { fourd: tt.body === 'fourd' ? (x < 0 ? -1 : 1) : 0 });
        }
        if (lists.L.length) { add(car.spinGroupL, merge(lists.L), mats.seat, mat4(0, 0, 0)); add(car.spinGroupR, merge(lists.R), mats.seat, mat4(0, 0, 0)); bake(car.spinGroupL); bake(car.spinGroupR); }
        seatsList.push(...lists.g);
        break; }
      case 'bobsled': {
        const cg = new THREE.Group(); car.swingGroup = cg; car.body.add(cg); car.swingPivot = 1.0; cg.matrixAutoUpdate = false;
        const hb = 0.14, hs = hip + 0.18;
        const secs = carSections(L, hs, front ? 0.55 : 0.1, true, rear, 'hyper');
        add(cg, hullGeo(Math.max(1.05, W - 0.2), hb, hs, hip - 0.16, 0.07, 0.06, secs), mats.body, mat4(0, 0, 0));
        for (const sd of [-1, 1]) rb(cg, mats.accent, sd * (Math.max(1.05, W - 0.2) / 2 - 0.035), hs + 0.004, 0, 0.08, 0.03, L - 0.25, 0.014);
        for (const s of [-1, 1]) add(cg, G.smallTire, mats.wheel, mat4(s * 0.45, 0.12, -L / 2 + 0.3, 0, 0, 0, 1, 1, 1)), add(cg, G.smallTire, mats.wheel, mat4(s * 0.45, 0.12, L / 2 - 0.3));
        decalStrip(cg, car, Math.max(1.05, W - 0.2) / 2 + 0.06, -L / 2 + 0.3, L / 2 - 0.3, (hb + hs) / 2, 0.22, 1); decalStrip(cg, car, Math.max(1.05, W - 0.2) / 2 + 0.06, -L / 2 + 0.3, L / 2 - 0.3, (hb + hs) / 2, 0.22, -1);
        const sl = [];
        for (let r = 0; r < rows; r++) for (const x of allX) { const z = rowZ(r); bucketSeat(sl, x * 0.8, hip, z, { bolsters: false }); restraint(cg, 'lap', x * 0.8, hip, z, keepBars); car.seats.push({ bars: null, x: x * 0.8, y: hip, z, pose: 'sit', swing: true }); }
        add(cg, merge(sl), mats.seat, mat4(0, 0, 0)); bake(cg);
        break; }
      case 'spinner': {
        bogies(g, L, 1, gauge);
        add(g, roundedBox(1.0, 0.18, L - 0.3, 0.06, detail() === 2 ? 2 : 1), mats.chassis, mat4(0, 0.42, 0));
        const cg = new THREE.Group(); car.spinGroup = cg; car.body.add(cg);
        const R0 = Math.max(0.85, W * 0.62), hT = hip + 0.3, prof = [];
        for (const [r, y] of [[0.01, 0.48], [R0 - 0.15, 0.48], [R0, 0.56], [R0 + 0.04, (0.5 + hT) / 2], [R0, hT - 0.04], [R0 - 0.05, hT], [R0 - 0.1, hT - 0.06], [R0 - 0.12, hip - 0.1], [0.01, hip - 0.12]]) prof.push(new THREE.Vector2(r, y));
        add(cg, new THREE.LatheGeometry(prof, 28), mats.body, mat4(0, 0, 0));
        add(cg, new THREE.TorusGeometry(R0 - 0.02, 0.035, 8, 28).rotateX(Math.PI / 2), mats.accent, mat4(0, hT + 0.01, 0));
        const sl = [];
        for (let r = 0; r < rows; r++) for (const x of allX) {
          const z = (r ? 1 : -1) * 0.32, face = r ? Math.PI : 0, xx = x * (r ? -1 : 1);
          const m = new THREE.Matrix4().makeTranslation(xx, 0, z).multiply(new THREE.Matrix4().makeRotationY(face));
          const tmp = []; bucketSeat(tmp, 0, hip, 0, { head: true }); for (const it of tmp) sl.push({ geo: it.geo, m: m.clone().multiply(it.m) });
          const gq = restraintGeo('lap'); const rm = m.clone().multiply(mat4(0, hip, 0)); add(cg, gq.frame, mats.bar, rm); add(cg, gq.pad, mats.pad, rm);
          car.seats.push({ bars: null, x: xx, y: hip, z, pose: 'sit', spin: true, face });
        }
        add(cg, merge(sl), mats.seat, mat4(0, 0, 0)); bake(cg);
        break; }
      default: { add(g, roundedBox(W, 0.5, L, 0.1, detail() === 2 ? 2 : 1), mats.body, mat4(0, 0.5, 0)); for (let r = 0; r < rows; r++) for (const x of allX) { bucketSeat(seatsList, x, hip, rowZ(r)); pushSeat(g, x, hip, rowZ(r), pose); } }
    }
    if (seatsList.length) add(g, merge(seatsList), mats.seat, mat4(0, 0, 0));
    // coupler to the next car
    if (!rear && tt.body !== 'bobsled') add(g, G.cyl, mats.chrome, mat4(0, (tt.mount === 'below' || tt.mount === 'swing') ? -0.33 : 0.33, L / 2 - 0.25, Math.PI / 2, 0, 0, 0.05, 0.42, 0.05));
    bake(g);
    return car;
  }

  // ---------- riders (instanced body parts) ----------
  const SHIRTS = ['#c0392b', '#2471a3', '#27ae60', '#f1c40f', '#8e44ad', '#e67e22', '#ecf0f1', '#2c3e50', '#16a085', '#d35400', '#7f8c8d', '#e84393', '#0984e3', '#fdcb6e', '#3d3d3d', '#b2bec3'];
  const SKIN = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac', '#a8714a', '#5c3b22', '#eac086'];
  const HAIR = ['#2c1b10', '#4a2f1c', '#6b4423', '#a0703c', '#d4b483', '#1a1a1a', '#8c8c8c', '#b5523b', '#e6c88a'];
  const PANTS = ['#2d3436', '#34495e', '#1e3799', '#6d4c41', '#95a5a6', '#2f3542', '#576574', '#3b5998', '#c8b89a'];
  const SHOES = ['#f5f6fa', '#2d3436', '#e84118', '#273c75', '#dcdde1', '#353b48'];
  let riderGeo = null, riderDet = -1;
  // one smooth skull: narrower, longer jaw and a forward chin, so the face has no seams
  function headShape(r, seg) {
    const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.8)), pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const ny = y / r, front = Math.max(0, -z / r);
      if (ny < 0) { const f = -ny; x *= 1 - 0.22 * f; z *= 1 - 0.12 * f * (1 - front); y *= 1 + 0.25 * f; z -= 0.012 * f * front; }
      else { x *= 0.94; z *= 1.02; y *= 1.05; }
      pa.setXYZ(i, x * 0.97, y, z);
    }
    g.computeVertexNormals(); return g;
  }
  function buildRiderGeo() {
    const dt = detail(); if (riderGeo && riderDet === dt) return riderGeo; riderDet = dt;
    const rad = dt === 0 ? 8 : dt === 1 ? 10 : 12, hs = dt === 0 ? 9 : dt === 1 ? 11 : 14;
    const sph = (r, x, y, z, sx = 1, sy = 1, sz = 1, ws = hs, hs2 = Math.round(hs * 0.65)) => ({ geo: new THREE.SphereGeometry(r, ws, hs2), m: mat4(x, y, z, 0, 0, 0, sx, sy, sz) });
    riderGeo = {
      // shirt from the waist to the neck; pelvis in trouser colour
      torso: bodyLoft([[0.08, 0.145, 0.102, 0.005], [0.18, 0.138, 0.097, 0.0], [0.3, 0.15, 0.104, -0.004], [0.42, 0.163, 0.11, -0.01, 2.15], [0.5, 0.17, 0.104, -0.006, 2.3], [0.56, 0.158, 0.092, 0, 2.3], [0.605, 0.11, 0.072, 0.005], [0.635, 0.052, 0.048, 0.01]], rad),
      pelvis: bodyLoft([[-0.075, 0.07, 0.06, 0.02], [-0.05, 0.14, 0.1, 0.01], [0.0, 0.168, 0.115, 0.0], [0.07, 0.158, 0.108, 0.003], [0.13, 0.15, 0.104, 0.004]], rad),
      // head (pivot at the base of the neck): skull, jaw, nose, ears and neck
      head: merge([{ geo: headShape(0.104, hs + 4), m: mat4(0, 0.16, 0.005) }, sph(0.018, 0, 0.145, -0.102, 0.9, 1.35, 1.1, 6, 4), sph(0.022, -0.097, 0.158, 0.008, 0.45, 1.25, 0.8, 6, 4), sph(0.022, 0.097, 0.158, 0.008, 0.45, 1.25, 0.8, 6, 4),
        { geo: new THREE.CylinderGeometry(0.046, 0.052, 0.12, rad), m: mat4(0, 0.035, 0.008) }]),
      eyes: merge([sph(0.0125, -0.036, 0.172, -0.088, 1, 1, 0.7, 6, 4), sph(0.0125, 0.036, 0.172, -0.088, 1, 1, 0.7, 6, 4),
        { geo: new THREE.BoxGeometry(0.04, 0.008, 0.012), m: mat4(-0.037, 0.198, -0.088, 0, 0, 0.12) }, { geo: new THREE.BoxGeometry(0.04, 0.008, 0.012), m: mat4(0.037, 0.198, -0.088, 0, 0, -0.12) }]),
      mouth: new THREE.SphereGeometry(0.022, 8, 4).scale(1, 0.32, 0.45),
      hairShort: merge([{ geo: new THREE.SphereGeometry(0.111, rad, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m: mat4(0, 0.18, 0.012, 0.6, 0, 0, 0.95, 1.06, 1.02) }]),
      hairLong: merge([{ geo: new THREE.SphereGeometry(0.113, rad, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), m: mat4(0, 0.178, 0.014, 0.62, 0, 0, 0.97, 1.1, 1.05) },
        { geo: roundedBox(0.2, 0.2, 0.06, 0.03, 2, 0.02), m: mat4(0, 0.1, 0.07, 0.1) }]),
      hairPony: merge([{ geo: new THREE.SphereGeometry(0.111, rad, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m: mat4(0, 0.18, 0.012, 0.6, 0, 0, 0.95, 1.06, 1.02) }, sph(0.034, 0, 0.18, 0.11, 1, 1, 1, 8, 6), { geo: limbGeo(0.16, 0.03, 0.018, 6), m: mat4(0, 0.18, 0.12, Math.PI * 0.85) }]),
      uarm: limbGeo(0.29, 0.05, 0.042, rad),
      farm: merge([limbGeo(0.25, 0.041, 0.032, rad), sph(0.036, 0, 0.285, -0.006, 0.8, 1.25, 0.55, 8, 6), sph(0.013, 0.026, 0.268, -0.014, 1, 1.6, 1, 6, 4)]),
      thigh: limbGeo(0.44, 0.07, 0.052, rad),
      shin: limbGeo(0.42, 0.055, 0.042, rad),
      shoe: merge([{ geo: roundedBox(0.1, 0.095, 0.26, 0.04, 1), m: mat4(0, -0.04, -0.06) }])
    };
    return riderGeo;
  }
  const PARTS = ['torso', 'pelvis', 'head', 'eyes', 'mouth', 'hairShort', 'hairLong', 'hairPony', 'uarmL', 'uarmR', 'farmL', 'farmR', 'thighL', 'thighR', 'shinL', 'shinR', 'shoeL', 'shoeR'];
  function buildRiders() {
    for (const k in partMeshes) { group.remove(partMeshes[k]); partMeshes[k].dispose(); }
    partMeshes = {}; riders = [];
    if (!design.riders) return;
    rand = 7331;
    const occ = clamp(design.occupancy ?? 0.85, 0.1, 1);
    for (let ti = 0; ti < trains.length; ti++) for (const car of trains[ti].cars) car.seats.forEach((st, si) => {
      if (rnd() > occ && !(ti === 0 && car.index === 0 && si < 2)) return;
      const pick = a => a[Math.floor(rnd() * a.length)];
      const hr = rnd(), shirt = pick(SHIRTS), skin = pick(SKIN);
      riders.push({ ti, car, seat: st, shirt, skin, sleeve: rnd() < 0.3 ? skin : shirt, hair: pick(HAIR), pants: pick(PANTS), shoes: pick(SHOES), hairStyle: hr < 0.42 ? 'hairShort' : hr < 0.72 ? 'hairLong' : hr < 0.92 ? 'hairPony' : null,
        brave: rnd(), scale: 0.9 + rnd() * 0.16, arm: 0, armT: 0, look: 0, lookT: 0, lookTimer: rnd() * 4, bob: rnd() * 6, mouth: 0, hidden: false });
    });
    const n = riders.length; if (!n) return;
    const geo = buildRiderGeo();
    const skinMat = new M({ roughness: 0.62, metalness: 0 }), clothMat = new M({ roughness: 0.88 }), hairMat = new M({ roughness: 0.7 }), eyeMat = new M({ color: 0x1d1612, roughness: 0.25 }), mouthMat = new M({ color: 0x5a1f22, roughness: 0.6 }), shoeMat = new M({ roughness: 0.6 });
    const mk = (k, g, mat, cast = true) => { const im = new THREE.InstancedMesh(g, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = cast; im.receiveShadow = true; im.frustumCulled = false; group.add(im); partMeshes[k] = im; };
    mk('torso', geo.torso, clothMat); mk('pelvis', geo.pelvis, clothMat); mk('head', geo.head, skinMat); mk('eyes', geo.eyes, eyeMat, false); mk('mouth', geo.mouth, mouthMat, false);
    // each hair style only gets instances for the riders who wear it
    for (const k of ['hairShort', 'hairLong', 'hairPony']) { const who = riders.filter(r => r.hairStyle === k); who.forEach((r, j) => { r.hairIdx = j; }); if (!who.length) continue; const im = new THREE.InstancedMesh(geo[k], hairMat, who.length); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.castShadow = true; im.frustumCulled = false; group.add(im); partMeshes[k] = im; }
    mk('uarmL', geo.uarm, clothMat); mk('uarmR', geo.uarm, clothMat); mk('farmL', geo.farm, skinMat); mk('farmR', geo.farm, skinMat);
    for (const k of ['thighL', 'thighR']) mk(k, geo.thigh, clothMat); for (const k of ['shinL', 'shinR']) mk(k, geo.shin, clothMat);
    for (const k of ['shoeL', 'shoeR']) mk(k, geo.shoe, shoeMat);
    const c = new THREE.Color();
    riders.forEach((r, i) => {
      partMeshes.torso.setColorAt(i, c.set(r.shirt)); partMeshes.pelvis.setColorAt(i, c.set(r.pants)); partMeshes.head.setColorAt(i, c.set(r.skin));
      if (r.hairStyle && partMeshes[r.hairStyle]) partMeshes[r.hairStyle].setColorAt(r.hairIdx, c.set(r.hair));
      for (const k of ['uarmL', 'uarmR']) partMeshes[k].setColorAt(i, c.set(r.sleeve));
      for (const k of ['farmL', 'farmR']) partMeshes[k].setColorAt(i, c.set(r.skin));
      for (const k of ['thighL', 'thighR', 'shinL', 'shinR']) partMeshes[k].setColorAt(i, c.set(r.pants));
      for (const k of ['shoeL', 'shoeR']) partMeshes[k].setColorAt(i, c.set(r.shoes));
      for (const k of ['eyes', 'mouth']) partMeshes[k].setColorAt(i, c.set('#ffffff'));
    });
    for (const k in partMeshes) if (partMeshes[k].instanceColor) partMeshes[k].instanceColor.needsUpdate = true;
  }
  const lq = new THREE.Quaternion(), lm = new THREE.Matrix4(), ls = new V3(), lv = new V3();
  const limbM = (out, base, from, dir, s) => { lq.setFromUnitVectors(Y, lv.copy(dir).normalize()); lm.compose(from, lq, ls.set(s, s, s)); out.multiplyMatrices(base, lm); return out; };
  const fX = new V3(), fY = new V3(), fZ = new V3(), BACK = new V3(0, 0, 1);
  const footM = (out, base, at, shinDir, s) => { // shoe frame: up along the shin, toe pointing forward
    fY.copy(shinDir).normalize().negate(); fZ.copy(BACK).addScaledVector(fY, -BACK.dot(fY)); if (fZ.lengthSq() < 1e-4) fZ.set(0, -1, 0); fZ.normalize(); fX.crossVectors(fY, fZ);
    lm.makeBasis(fX, fY, fZ).setPosition(at); if (s !== 1) lm.scale(ls.set(s, s, s)); out.multiplyMatrices(base, lm); return out;
  };
  // resting arm directions: hands on a lap bar or T-bar, or gripping shoulder-harness handles
  const dirs = { hold: new V3(0, -0.62, -0.78), holdF: new V3(0, -0.91, -0.41), holdO: new V3(0, -0.9, -0.43), holdOF: new V3(0, 0.1, -1), up: new V3(0, 1, -0.12), upF: new V3(0, 1, -0.05) };
  const tmpA = new V3(), tmpB = new V3(), tmpC = new V3(), tmpD = new V3(), seatM = new THREE.Matrix4();
  const outM = new THREE.Matrix4(), baseM = new THREE.Matrix4(), cB = new V3(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
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
      const mouthT = st.phase === 'load' ? 0.05 : thrill || vg > 3 ? 0.85 : tr.onLift ? 0.15 : 0.1;
      r.mouth += (mouthT - r.mouth) * Math.min(1, dt * 6);
      r.lookTimer -= dt; if (r.lookTimer <= 0) { r.lookT = (st.phase === 'load' || tr.onLift) ? (rnd() - 0.5) * 1.4 : (rnd() - 0.5) * 0.3; r.lookTimer = 1.5 + rnd() * 3; }
      r.look += (r.lookT - r.look) * Math.min(1, dt * 2);
      // seat frame
      const car = r.car, s = r.seat;
      tm.makeTranslation(s.x, s.y, s.z);
      if (s.face) tm.multiply(tm2.makeRotationY(s.face));
      const parent = s.swing && car.swingGroup ? car.swingGroup : s.spin && car.spinGroup ? car.spinGroup : s.fourd && car.spinGroupL ? (s.fourd < 0 ? car.spinGroupL : car.spinGroupR) : car.body;
      seatM.multiplyMatrices(parent.matrixWorld, tm);
      if (r.scale !== 1) seatM.multiply(tm2.makeScale(r.scale, r.scale, r.scale));
      if (r.hidden) { for (const k of PARTS) if (pm[k] && !k.startsWith('hair')) pm[k].setMatrixAt(i, zero); if (r.hairStyle && pm[r.hairStyle]) pm[r.hairStyle].setMatrixAt(r.hairIdx, zero); return; }
      const pose = s.pose;
      // body lean from forces
      const lean = clamp(-tr.lg * 0.18, -0.3, 0.3), squash = clamp((vg - 1) * 0.02, -0.04, 0.06);
      const base = baseM.copy(seatM);
      if (pose === 'prone') base.multiply(tm2.makeRotationX(-Math.PI / 2)).multiply(tm.makeTranslation(0, -0.05, 0.1));
      base.multiply(tm2.makeRotationZ(lean * 0.3));
      // torso, pelvis & head
      pm.pelvis.setMatrixAt(i, base);
      pm.torso.setMatrixAt(i, tm.multiplyMatrices(base, tm2.compose(v1.set(0, 0, 0), tq.identity(), vS.set(1, 1 - squash, 1))));
      te.set(clamp((vg - 1) * -0.03, -0.12, 0.25) + (pose === 'prone' ? 0.9 : 0), r.look, lean * 0.7, 'YXZ'); tq.setFromEuler(te);
      const headM = tm3.multiplyMatrices(base, tm2.compose(v1.set(0, 0.615 - squash * 2, 0.005), tq, vS.set(1, 1, 1)));
      pm.head.setMatrixAt(i, headM); pm.eyes.setMatrixAt(i, headM);
      pm.mouth.setMatrixAt(i, tm.multiplyMatrices(headM, tm2.compose(v1.set(0, 0.098, -0.094), tq.identity(), vS.set(1, 0.4 + r.mouth * 2.6, 1))));
      if (r.hairStyle && pm[r.hairStyle]) pm[r.hairStyle].setMatrixAt(r.hairIdx, headM);
      // arms
      const a = r.arm;
      for (const sd of [-1, 1]) {
        const sh = tmpA.set(sd * 0.178, 0.54, 0.01);
        const shoulderBars = tt.restraint !== 'lap' && tt.restraint !== 'tbar';
        const du = tmpB.copy(shoulderBars ? dirs.holdO : dirs.hold).lerp(dirs.up, a); du.x += sd * (0.1 + a * 0.22); du.normalize();
        pm[sd < 0 ? 'uarmL' : 'uarmR'].setMatrixAt(i, limbM(outM, base, sh, du, 1));
        const elbow = tmpC.copy(sh).addScaledVector(du, 0.27);
        const df = v1.copy(shoulderBars ? dirs.holdOF : dirs.holdF).lerp(dirs.upF, a); df.x += sd * (a * 0.12 - 0.05);
        pm[sd < 0 ? 'farmL' : 'farmR'].setMatrixAt(i, limbM(outM, base, elbow, df, 1));
      }
      // legs
      const dangle = pose === 'hang' || pose === 'stand' || (pose === 'sit' && (tt.mount === 'below' || tt.mount === 'wing'));
      for (const sd of [-1, 1]) {
        const hp = tmpA.set(sd * 0.095, 0.0, -0.005);
        let th, sn;
        if (pose === 'stand') { th = v2.set(sd * 0.02, -1, -0.02); sn = v3.set(0, -1, 0.02); }
        else if (pose === 'prone') { th = v2.set(sd * 0.05, -1, 0.15); sn = v3.set(0, -1, 0.2); }
        else { th = v2.set(sd * 0.05, -0.06, -1); sn = dangle ? v3.set(sd * 0.02, -1, 0.12 + Math.sin(tr.time * 2 + r.bob) * 0.06 * (v > 5 ? 1 : 0)) : v3.set(sd * 0.02, -1, 0.25); }
        cB.copy(th).normalize();
        const knee = tmpC.copy(hp).addScaledVector(cB, 0.41);
        pm[sd < 0 ? 'thighL' : 'thighR'].setMatrixAt(i, limbM(outM, base, hp, cB, 1));
        pm[sd < 0 ? 'shinL' : 'shinR'].setMatrixAt(i, limbM(outM, base, knee, sn, 1));
        const ankle = tmpD.copy(knee).addScaledVector(lv.copy(sn).normalize(), 0.41);
        pm[sd < 0 ? 'shoeL' : 'shoeR'].setMatrixAt(i, footM(outM, base, ankle, sn, 1));
      }
    });
    for (const k in pm) pm[k].instanceMatrix.needsUpdate = true;
    void view; void cam;
  }

  // ---------- public ----------
  function build(d, count) {
    design = d; tt = TRAIN_TYPES[d.train] || TRAIN_TYPES.hyper; povBars = null;
    const shared = new Set(); for (const k in G) { if (G[k] && G[k].isBufferGeometry) shared.add(G[k]); }
    if (G.restraint) for (const k in G.restraint) { shared.add(G.restraint[k].frame); shared.add(G.restraint[k].pad); }
    if (riderGeo) for (const k in riderGeo) shared.add(riderGeo[k]);
    while (group.children.length) { const c = group.children.pop(); c.traverse(o => { if (o.geometry && o.geometry.dispose && !shared.has(o.geometry)) o.geometry.dispose(); }); }
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
          car.swingGroup.matrix.makeTranslation(0, pv, 0).multiply(tm.makeRotationZ(tt.sled ? car.swing : -car.swing)).multiply(tm2.makeTranslation(0, -pv, 0));
          car.swingGroup.matrixAutoUpdate = false; car.swingGroup.matrixWorldNeedsUpdate = true;
        }
        if (car.spinGroup) { car.spinV += ((f.lg || 0) * 2.2 - car.spinV * 0.35) * dt + (Math.abs(tr.state.v || 0) > 3 ? Math.sin(tr.time * 0.7 + c) * 0.15 * dt : 0); car.spin += car.spinV * dt; car.spinGroup.rotation.y = car.spin; }
        if (car.spinGroupL) {
          const pitch = Math.asin(clamp(trk.get(trk.ty, sc), -1, 1));
          car.pitch += (-pitch * 1.8 - car.pitch) * Math.min(1, dt * 1.6);
          for (const sg of [car.spinGroupL, car.spinGroupR]) { sg.matrix.makeTranslation(0, car.spinY, 0).multiply(tm.makeRotationX(car.pitch)).multiply(tm2.makeTranslation(0, -car.spinY, 0)); sg.matrixAutoUpdate = false; sg.matrixWorldNeedsUpdate = true; }
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
