// ===================== TUNNELS: covered, underground and underwater tunnels, portals, open cuts, lights, particles =====================
// Built from trk.tunnels / trk.tunRuns (classified in core.js). Everything is sized from the train's clearance circle
// (trk.tunEnv) plus the wall clearance chosen for each tunnel, so no train type can touch the walls.
function createTunnelGfx(THREE, ctx) {
  const V3 = THREE.Vector3;
  const group = new THREE.Group(); group.name = 'tunnels';
  const stencilGroup = new THREE.Group(); stencilGroup.name = 'tunnel-stencil';
  let mats = null, trk = null, tunnels = [], footprints = [], animated = [], insideCells = new Map(), blockCells = new Map(), gap = Infinity;
  const timeU = { value: 0 };
  const up = new V3(0, 1, 0);

  // ---------- procedural textures ----------
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  function normalFrom(src, strength) {
    const w = src.width, h = src.height, g = src.getContext('2d'), d = g.getImageData(0, 0, w, h).data;
    const out = canvas(w, h), og = out.getContext('2d'), img = og.createImageData(w, h);
    const H = (x, y) => d[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength, l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
      img.data[i] = (-dx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    og.putImageData(img, 0, 0); return out;
  }
  function noiseFill(g, w, h, base, amp, blobs) {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let i = 0; i < blobs; i++) { const r = 2 + Math.random() * 30, v = Math.round((Math.random() - 0.5) * amp); g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255 * 0.5})`; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, r, 0, 7); g.fill(); }
    const img = g.getImageData(0, 0, w, h); for (let i = 0; i < img.data.length; i += 4) { const n = (Math.random() - 0.5) * amp * 0.5; img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n; } g.putImageData(img, 0, 0);
  }
  function makeTex() {
    const T = {};
    // concrete liner: segment ring joints, panel seams, bolt pockets and water stains
    const cc = canvas(512, 512), cg = cc.getContext('2d'); noiseFill(cg, 512, 512, '#9a958c', 60, 900);
    cg.strokeStyle = 'rgba(40,38,34,0.85)'; cg.lineWidth = 5; for (let y = 0; y <= 512; y += 256) { cg.beginPath(); cg.moveTo(0, y); cg.lineTo(512, y); cg.stroke(); }
    cg.lineWidth = 3; for (let x = 0; x <= 512; x += 128) { cg.beginPath(); cg.moveTo(x, 0); cg.lineTo(x, 512); cg.stroke(); }
    cg.fillStyle = 'rgba(30,28,26,0.9)'; for (let y = 32; y < 512; y += 256) for (let x = 64; x < 512; x += 128) { cg.beginPath(); cg.arc(x, y, 7, 0, 7); cg.fill(); cg.beginPath(); cg.arc(x, y + 192, 7, 0, 7); cg.fill(); }
    for (let i = 0; i < 26; i++) { const x = Math.random() * 512, y = Math.random() * 512, gr = cg.createLinearGradient(x, y, x, y + 140); gr.addColorStop(0, 'rgba(60,55,45,0.35)'); gr.addColorStop(1, 'rgba(60,55,45,0)'); cg.fillStyle = gr; cg.fillRect(x, y, 6 + Math.random() * 14, 140); }
    T.concrete = cc; T.concreteN = normalFrom(cc, 3.5);
    // timber planks
    const wc = canvas(512, 256), wg = wc.getContext('2d'); wg.fillStyle = '#7b5532'; wg.fillRect(0, 0, 512, 256);
    for (let y = 0; y < 256; y += 32) { const sh = 0.75 + Math.random() * 0.4; wg.fillStyle = `rgb(${123 * sh | 0},${85 * sh | 0},${50 * sh | 0})`; wg.fillRect(0, y + 1, 512, 30); for (let i = 0; i < 40; i++) { wg.strokeStyle = `rgba(40,25,10,${0.08 + Math.random() * 0.15})`; wg.lineWidth = 1; wg.beginPath(); const yy = y + 2 + Math.random() * 28; wg.moveTo(0, yy); wg.bezierCurveTo(170, yy + (Math.random() - 0.5) * 6, 340, yy + (Math.random() - 0.5) * 6, 512, yy); wg.stroke(); } wg.fillStyle = 'rgba(20,12,5,0.9)'; wg.fillRect(0, y, 512, 2); for (let x = Math.random() * 120; x < 512; x += 120 + Math.random() * 60) { wg.beginPath(); wg.arc(x, y + 8, 2.2, 0, 7); wg.arc(x, y + 24, 2.2, 0, 7); wg.fill(); } }
    T.wood = wc; T.woodN = normalFrom(wc, 2.5);
    // bolted steel plates (underwater conduit)
    const mc = canvas(256, 256), mg = mc.getContext('2d'); noiseFill(mg, 256, 256, '#5d6670', 40, 300);
    mg.strokeStyle = 'rgba(25,28,32,0.9)'; mg.lineWidth = 3; mg.strokeRect(2, 2, 252, 252); mg.beginPath(); mg.moveTo(128, 0); mg.lineTo(128, 256); mg.stroke();
    mg.fillStyle = '#9aa3ab'; for (let i = 12; i < 256; i += 22) for (const x of [10, 118, 138, 246]) { mg.beginPath(); mg.arc(x, i, 3.4, 0, 7); mg.fill(); } for (let i = 12; i < 256; i += 22) for (const y of [10, 246]) { mg.beginPath(); mg.arc(i, y, 3.4, 0, 7); mg.fill(); }
    T.plate = mc; T.plateN = normalFrom(mc, 4);
    // corrugated sheet: stripes for roughness and a little rust
    const rc = canvas(64, 256), rg = rc.getContext('2d'); noiseFill(rg, 64, 256, '#9ea6ab', 30, 60); for (let i = 0; i < 9; i++) { rg.fillStyle = `rgba(140,80,40,${Math.random() * 0.25})`; rg.fillRect(Math.random() * 64, Math.random() * 256, 4 + Math.random() * 10, 20 + Math.random() * 60); }
    T.sheet = rc;
    const wrap = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
    return { concrete: wrap(T.concrete, true), concreteN: wrap(T.concreteN), wood: wrap(T.wood, true), woodN: wrap(T.woodN), plate: wrap(T.plate, true), plateN: wrap(T.plateN), sheet: wrap(T.sheet, true) };
  }
  function makeMats() {
    const tex = makeTex(), M = THREE.MeshStandardMaterial;
    mats = {
      tex,
      liner: new M({ map: tex.concrete, normalMap: tex.concreteN, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.92, side: THREE.BackSide }),
      concrete: new M({ map: tex.concrete, normalMap: tex.concreteN, color: 0xd8d3c8, roughness: 0.9 }),
      bed: new M({ map: tex.concrete, normalMap: tex.concreteN, color: 0x8a7a5e, roughness: 1, side: THREE.DoubleSide }),
      floor: new M({ color: 0x6e6a63, roughness: 0.95, map: tex.concrete }),
      wood: new M({ map: tex.wood, normalMap: tex.woodN, roughness: 0.85, side: THREE.DoubleSide }),
      timber: new M({ color: 0x4a311b, roughness: 0.8, map: tex.wood }),
      sheet: new M({ color: 0xb9c1c6, map: tex.sheet, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide }),
      steel: new M({ color: 0x6f7880, metalness: 0.8, roughness: 0.35 }),
      neonFrame: new M({ color: 0x1a2430, metalness: 0.6, roughness: 0.3, emissive: 0x19d6ff, emissiveIntensity: 1.6 }),
      plate: new M({ map: tex.plate, normalMap: tex.plateN, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0xbfe8f2, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 }),
      lamp: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffe2b0, emissiveIntensity: 2.2 }),
      grate: new M({ color: 0x5f666d, metalness: 0.7, roughness: 0.5 })
    };
    mats.tex.concrete.repeat.set(1, 1);
    // condensation drips and water caustics on the inside of the acrylic tube (uv.x around, uv.y along in metres)
    mats.drips = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU, uTint: { value: new THREE.Color(0x7fd3e6) } }, transparent: true, depthWrite: false, side: THREE.BackSide,
      vertexShader: `varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uTint; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          // drips run down the walls (around the tube toward the bottom), each column at its own speed
          float col = floor(vUv.x * 90.0); float sp = 0.15 + h(vec2(col, 3.0)) * 0.35; float ph = h(vec2(col, 7.0));
          float y = fract(vUv.y * 0.12 + ph + uTime * 0.0); float run = fract(abs(vUv.x - 0.5) * 2.0 * 4.0 - uTime * sp + ph * 8.0);
          float drip = smoothstep(0.92, 1.0, run) * step(0.55, h(vec2(col, floor(vUv.y * 0.7)))) * (1.0 - smoothstep(0.35, 0.5, fract(vUv.x * 90.0)) * 0.6);
          float beads = smoothstep(0.78, 0.86, n(vec2(vUv.x * 160.0, vUv.y * 9.0)));
          float caustic = pow(n(vW.xz * 0.6 + vec2(uTime * 0.21, -uTime * 0.17)) * n(vW.xz * 0.9 - vec2(uTime * 0.13, uTime * 0.19)), 1.5) * 2.2;
          vec3 c = uTint * (0.25 + caustic * 0.6) + vec3(0.9, 0.97, 1.0) * (drip * 0.55 + beads * 0.22);
          gl_FragColor = vec4(c, clamp(0.10 + caustic * 0.12 + drip * 0.45 + beads * 0.25, 0.0, 0.75));
          #include <colorspace_fragment>
        }`
    });
    // neon light strips: colour cycles along the tunnel and pulses with a strobe
    mats.neon = new THREE.ShaderMaterial({
      uniforms: { uTime: timeU }, toneMapped: false, side: THREE.DoubleSide,
      vertexShader: `varying float vS; void main(){ vS = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform float uTime; varying float vS; vec3 hsv(float h){ vec3 k = clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); return k; }
        void main(){ float strobe = step(0.82, fract(uTime * 2.3)) * 0.8; vec3 c = hsv(fract(vS * 0.015 - uTime * 0.25)) * (1.4 + strobe * 2.0); gl_FragColor = vec4(c, 1.0); }`
    });
    mats.stencilFront = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.FrontSide, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilZFail: THREE.DecrementWrapStencilOp, stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp });
    mats.stencilBack = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.BackSide, stencilWrite: true, stencilFunc: THREE.AlwaysStencilFunc, stencilZFail: THREE.IncrementWrapStencilOp, stencilZPass: THREE.KeepStencilOp, stencilFail: THREE.KeepStencilOp });
  }

  // ---------- frames: centre of the clearance circle, kept upright so tunnels stand on the ground ----------
  let prevUp = new V3(0, 1, 0);
  function frame(k) {
    const uc = trk.tunEnv.uc;
    const c = new V3(trk.px[k] + trk.ux[k] * uc, trk.py[k] + trk.uy[k] * uc, trk.pz[k] + trk.uz[k] * uc);
    const t = new V3(trk.tx[k], trk.ty[k], trk.tz[k]).normalize();
    const u = up.clone().addScaledVector(t, -t.y); if (u.lengthSq() < 0.04) u.copy(prevUp).addScaledVector(t, -prevUp.dot(t)); u.normalize(); prevUp.copy(u);
    const r = new V3().crossVectors(t, u).normalize();
    return { c, t, u, r };
  }
  // sweep a closed or open profile ([x, y] in the frame) along samples a..b
  function sweep(a, b, prof, opts = {}) {
    const step = opts.step || 2, np = prof.length, pos = [], nrm = [], uv = [], idx = [], ks = [];
    for (let k = a; k <= b; k += step) ks.push(k); if (ks[ks.length - 1] !== b) ks.push(b);
    let perim = [0]; for (let i = 1; i < np; i++) perim.push(perim[i - 1] + Math.hypot(prof[i][0] - prof[i - 1][0], prof[i][1] - prof[i - 1][1]));
    ks.forEach((k, ri) => {
      const F = frame(k);
      for (let i = 0; i < np; i++) {
        const [x, y] = prof[i]; const p = F.c.clone().addScaledVector(F.r, x).addScaledVector(F.u, y);
        pos.push(p.x, p.y, p.z);
        const n = opts.radial ? F.r.clone().multiplyScalar(x).addScaledVector(F.u, y).normalize() : (() => { const i0 = Math.max(0, i - 1), i1 = Math.min(np - 1, i + 1); const dx = prof[i1][0] - prof[i0][0], dy = prof[i1][1] - prof[i0][1]; return F.r.clone().multiplyScalar(dy).addScaledVector(F.u, -dx).normalize(); })();
        nrm.push(n.x, n.y, n.z); uv.push(opts.uAround ? i / (np - 1) * opts.uAround : perim[i] / (opts.uScale || 2), (k - a) * DS / (opts.vScale || 2));
      }
      if (ri > 0) { const segs = opts.closed ? np : np - 1; for (let i = 0; i < segs; i++) { const i2 = (i + 1) % np, o = (ri - 1) * np; idx.push(o + i, o + np + i, o + i2, o + i2, o + np + i, o + np + i2); } }
    });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx);
    return geo;
  }
  const circle = (r, n, from = 0, to = Math.PI * 2) => { const out = []; for (let i = 0; i <= n; i++) { const a = from + (to - from) * i / n; out.push([Math.cos(a) * r, Math.sin(a) * r]); } return out; };
  const add = (geo, mat, cast = true, recv = true, parent = group) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; parent.add(m); return m; };
  // local x = right, y = up, z = backward (right-handed, like the train cars)
  const placeAt = (obj, F, s) => { obj.matrixAutoUpdate = false; obj.matrix.makeBasis(F.r, F.u, F.t.clone().negate()).setPosition(F.c); if (s) obj.matrix.scale(s); return obj; };
  function instanced(geo, mat, frames, cast = true) {
    if (!frames.length) return null; const im = new THREE.InstancedMesh(geo, mat, frames.length), m = new THREE.Matrix4();
    frames.forEach((F, i) => { m.makeBasis(F.r, F.u, F.t.clone().negate()).setPosition(F.c); im.setMatrixAt(i, m); });
    im.castShadow = cast; im.receiveShadow = true; im.computeBoundingSphere(); group.add(im); return im;
  }

  // ---------- module shapes for covered tunnels (one segment, instanced along the track) ----------
  const MOD_LEN = 2.5, MOD_STEP = 2.4;
  function archShape(R, ripple = 0, sides = 0) {
    const sh = new THREE.Shape(), pts = [];
    if (sides) { for (let i = 0; i <= sides; i++) { const a = -Math.PI / 2 + i / sides * Math.PI * 2; pts.push([Math.cos(a) * R, Math.sin(a) * R]); } }
    else {
      const wallN = 10; for (let i = 0; i <= wallN; i++) { const y = -R + i / wallN * R; pts.push([R + (ripple ? Math.sin(i * 2.4) * ripple : 0), y]); }
      const arcN = ripple ? 72 : 24; for (let i = 1; i <= arcN; i++) { const a = i / arcN * Math.PI, rr = R + (ripple ? Math.sin(i * 2.4) * ripple : 0); pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      for (let i = 1; i <= wallN; i++) { const y = -i / wallN * R; pts.push([-R - (ripple ? Math.sin(i * 2.4) * ripple : 0), y]); }
    }
    sh.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]); sh.closePath();
    return sh;
  }
  function shellGeo(rin, th, len, opts = {}) {
    const outer = archShape(rin + th, opts.ripple || 0, opts.sides || 0), hole = archShape(rin, opts.ripple || 0, opts.sides || 0);
    outer.holes.push(new THREE.Path(hole.getPoints()));
    const g = new THREE.ExtrudeGeometry(outer, { depth: len, bevelEnabled: false, curveSegments: 1, steps: 1 }); g.translate(0, 0, -len / 2); g.computeVertexNormals(); return g;
  }
  function mergeGeos(list) {
    const pos = [], nrm = [], uv = [], idx = []; let off = 0;
    for (const { geo, m } of list) {
      const g = m ? geo.clone().applyMatrix4(m) : geo; const pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv;
      for (let i = 0; i < pa.count; i++) { pos.push(pa.getX(i), pa.getY(i), pa.getZ(i)); nrm.push(na.getX(i), na.getY(i), na.getZ(i)); uv.push(ua ? ua.getX(i) : 0, ua ? ua.getY(i) : 0); }
      if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < pa.count; i++) idx.push(i + off); off += pa.count;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); return g;
  }
  const strut = (a, b, w) => { const d = new V3().subVectors(b, a), len = d.length(); const g = new THREE.BoxGeometry(w, w, len); const m = new THREE.Matrix4().lookAt(a, b, Math.abs(d.y / len) > 0.99 ? new V3(1, 0, 0) : up); m.setPosition(a.clone().lerp(b, 0.5)); return { geo: g, m }; };

  // ---------- build ----------
  function clear() {
    for (const g of [group, stencilGroup]) while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    animated = []; footprints = []; insideCells = new Map(); blockCells = new Map(); gap = Infinity;
  }
  function build(t) {
    if (!mats) makeMats();
    clear(); trk = t; tunnels = t.tunnels || [];
    if (!tunnels.length && !(t.tunRuns || []).some(r => r.kind === TUN.TRENCH)) return;
    const env = t.tunEnv, [hw, u0, u1] = TRAIN.box;
    const below = (TRAIN_TYPES[ctx.design().train] || {}).mount === 'below' || (TRAIN_TYPES[ctx.design().train] || {}).mount === 'swing';
    // open cuts first (they also produce the terrain footprints)
    for (const r of t.tunRuns) if (r.kind === TUN.TRENCH) buildTrench(r, env, below);
    tunnels.forEach((tn, ti) => {
      const rin = tn.rin, rout = tn.rout, P = tn.props;
      for (const part of tn.parts) {
        const a = Math.max(0, part.a - 1), b = Math.min(t.n - 1, part.b + 1);
        if (part.kind === TUN.UNDER) buildUnder(a, b, rin, rout, env, below);
        else if (part.kind === TUN.WATER) buildWater(a, b, rin, rout, P);
        else if (part.kind === TUN.ABOVE) buildCovered(a, b, rin, P);
      }
      buildBedding(tn, env);
      buildPortals(tn);
      buildLights(tn);
      buildParticles(tn, ti);
      for (let k = tn.a; k <= tn.b; k += 2) { const F = frame(k); registerCell(insideCells, F.c, { tn, ti, k, c: F.c, rin, kind: t.tunKind[k] }, 6); if (t.tunKind[k] !== TUN.UNDER) registerCell(blockCells, F.c, { c: F.c, r: rout + 0.3 }, 8, true); }
      // clearance: corners of the train's box at every sample against the inner wall
      for (let k = tn.a; k <= tn.b; k += 2) {
        const F = frame(k); let dmax = 0;
        for (const sx of [-hw, hw]) for (const su of [u0, u1]) { const p = new V3(t.px[k] + t.rx[k] * sx + t.ux[k] * su, t.py[k] + t.ry[k] * sx + t.uy[k] * su, t.pz[k] + t.rz[k] * sx + t.uz[k] * su).sub(F.c); p.addScaledVector(F.t, -p.dot(F.t)); dmax = Math.max(dmax, p.length()); }
        gap = Math.min(gap, rin - dmax); tn.gap = Math.min(tn.gap ?? Infinity, rin - dmax);
      }
    });
  }
  function registerCell(map, c, item, cell, flat) { const key = flat ? Math.floor(c.x / cell) + ',' + Math.floor(c.z / cell) : Math.floor(c.x / cell) + ',' + Math.floor(c.y / cell) + ',' + Math.floor(c.z / cell); let a = map.get(key); if (!a) map.set(key, a = []); a.push(item); }

  function buildUnder(a, b, rin, rout, env, below) {
    // segmented concrete liner, visible from inside; uv: 1 texture repeat per ~2.4 m along and 6 around
    const ring = circle(rin, 28, -Math.PI / 2, Math.PI * 1.5);
    add(sweep(a, b, ring, { radial: true, uAround: 6, vScale: 2.4 }), mats.liner, false, true);
    // walkway floor below the track structure
    const depth = (STYLE_DEPTH_T[ctx.design().track] || 0.9);
    const floorY = below ? -(env.rc + 0.05) : -(env.uc + depth + 0.08);
    if (-floorY < rin - 0.1) { const hwF = Math.sqrt(rin * rin - floorY * floorY) - 0.02; add(sweep(a, b, [[hwF, floorY], [-hwF, floorY]], { uScale: 2.4, vScale: 2.4 }), mats.floor, false, true); }
  }
  function buildWater(a, b, rin, rout, P) {
    const ring = circle(rin + 0.12, 32, -Math.PI / 2, Math.PI * 1.5);
    if (P.shell === 'metal') {
      add(sweep(a, b, ring, { radial: true, uAround: 8, vScale: 2.4 }), mats.plate, true, true);
    } else {
      add(sweep(a, b, ring, { radial: true, uAround: 1, vScale: 4 }), mats.glass, false, false);
      const inner = add(sweep(a, b, circle(rin + 0.08, 32, -Math.PI / 2, Math.PI * 1.5), { radial: true, uAround: 1, vScale: 1 }), mats.drips, false, false); inner.renderOrder = 6;
      // steel hoops every 3 m and a walkway
      const hoops = []; for (let k = a; k <= b; k += Math.round(3 / DS)) hoops.push(frame(k));
      instanced(new THREE.TorusGeometry(rin + 0.14, 0.07, 6, 32), mats.steel, hoops);
    }
    const fy = -(trk.tunEnv.rc + 0.06), hwF = Math.sqrt(Math.max(0.1, rin * rin - fy * fy)) - 0.05;
    add(sweep(a, b, [[hwF, fy], [-hwF, fy]], { uScale: 1, vScale: 1 }), mats.grate, false, true);
    // stencil volume (outer radius, capped) that hides the water surface inside the tube
    const vol = sweep(a, b, circle(rout + 0.1, 24, 0, Math.PI * 2).slice(0, 24), { closed: true, radial: true, step: 4 });
    const caps = [a, b].map((k, i) => { const F = frame(k); const g = new THREE.CircleGeometry(rout + 0.1, 24); const m = new THREE.Matrix4().makeBasis(F.r, F.u, F.t.clone().negate()).setPosition(F.c); if (i === 1) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI)); g.applyMatrix4(m); return { geo: g }; });
    const closed = mergeGeos([{ geo: vol }, ...caps]);
    const f = new THREE.Mesh(closed, mats.stencilFront), bk = new THREE.Mesh(closed, mats.stencilBack);
    f.renderOrder = 20; bk.renderOrder = 21; f.frustumCulled = bk.frustumCulled = false; stencilGroup.add(f, bk);
  }
  function buildCovered(a, b, rin, P) {
    const frames = []; for (let s = a * DS + MOD_STEP / 2; s <= b * DS; s += MOD_STEP) frames.push(frame(Math.min(b, Math.round(s / DS))));
    if (P.style === 'metal') {
      instanced(shellGeo(rin, 0.06, MOD_LEN, { ripple: 0.035 }), mats.sheet, frames);
      instanced(shellGeo(rin + 0.06, 0.12, 0.16), mats.steel, frames.filter((f, i) => i % 2 === 0));
    } else if (P.style === 'wire') {
      const ring = shellGeo(rin, 0.1, 0.1, { sides: 10 }), struts = [];
      for (let i = 0; i < 10; i++) { const a0 = -Math.PI / 2 + i / 10 * Math.PI * 2, a1 = -Math.PI / 2 + (i + 1) / 10 * Math.PI * 2, R = rin + 0.05; struts.push(strut(new V3(Math.cos(a0) * R, Math.sin(a0) * R, -MOD_STEP / 2), new V3(Math.cos(a1) * R, Math.sin(a1) * R, MOD_STEP / 2), 0.045)); }
      instanced(mergeGeos([{ geo: ring }, ...struts]), mats.neonFrame, frames, false);
    } else {
      instanced(shellGeo(rin, 0.08, MOD_LEN), mats.wood, frames);
      instanced(shellGeo(rin + 0.08, 0.16, 0.24), mats.timber, frames.filter((f, i) => i % 2 === 0));
    }
  }
  function buildTrench(r, env, below) {
    const t = trk, W = Math.max(TRAIN.box[0] + 0.9, env.rc * 0.8 + 0.4), th = 0.35, pos = [], idx = [], nrm = [], uv = [];
    const a = Math.max(0, r.a - 2), b = Math.min(t.n - 1, r.b + 2);
    const ground = (x, z) => Math.max(ctx.terrainHeight(x, z), ctx.meshHeight ? ctx.meshHeight(x, z) : -1e9);
    let row = 0; const quads = [];
    for (let k = a; k <= b; k++) {
      const F = frame(k), rail = t.py[k];
      const floor = Math.min(rail - 0.75, below ? F.c.y - env.rc - 0.3 : rail - 0.75);
      const L = F.c.clone().addScaledVector(F.r, -W), Rr = F.c.clone().addScaledVector(F.r, W);
      const gL = ground(L.x, L.z), gR = ground(Rr.x, Rr.z), top = Math.max(gL, gR, floor + 0.6) + 0.35;
      const pts = [[-W - th, floor - 0.4], [-W - th, top], [-W, top], [-W, floor], [W, floor], [W, top], [W + th, top], [W + th, floor - 0.4]];
      let per = 0; pts.forEach(([x, y], q) => { if (q) per += Math.hypot(x - pts[q - 1][0], y - pts[q - 1][1]); const p = F.c.clone().addScaledVector(F.r, x); pos.push(p.x, y, p.z); nrm.push(0, 1, 0); uv.push(per / 2.4, k * DS / 2.4); });
      if (row > 0) for (let i = 0; i < pts.length - 1; i++) { const o = (row - 1) * pts.length; idx.push(o + i, o + i + 1, o + pts.length + i, o + i + 1, o + pts.length + i + 1, o + pts.length + i); }
      quads.push([F.c.clone().addScaledVector(F.r, -W - th * 0.5), F.c.clone().addScaledVector(F.r, W + th * 0.5), floor]);
      row++;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = add(geo, mats.concrete, true, true); m.material = mats.concrete.clone(); m.material.side = THREE.DoubleSide;
    for (let i = 0; i < quads.length - 1; i++) footprints.push({ poly: [quads[i][0], quads[i][1], quads[i + 1][1], quads[i + 1][0]], floor: Math.min(quads[i][2], quads[i + 1][2]) });
  }
  // Where the ground rises into a lake tube or a covered tunnel (a lake bed or a slope higher than the tube's
  // underside), the shell is laid in a dredged/excavated channel: the terrain inside the channel is masked out and a
  // floor and side walls close the cut, so no ground ever reaches the riders' tube.
  function buildBedding(tn, env) {
    const t = trk, rout = tn.rout, W = rout + 0.45, th = 0.3, ground = (x, z) => Math.max(ctx.terrainHeight(x, z), ctx.meshHeight ? ctx.meshHeight(x, z) : -1e9);
    const a0 = Math.max(0, tn.a - 4), b0 = Math.min(t.n - 1, tn.b + 4), need = new Uint8Array(b0 - a0 + 1);
    for (let k = a0; k <= b0; k++) {
      if (t.tunKind[k] === TUN.UNDER) continue;   // bored sections are sealed by the liner
      const F = frame(k), bottom = F.c.y - rout - 0.3; let g = -1e9;
      for (const x of [-W, -W * 0.5, 0, W * 0.5, W]) { const p = F.c.clone().addScaledVector(F.r, x); g = Math.max(g, ground(p.x, p.z)); }
      if (g > bottom - 0.4) need[k - a0] = 1;
    }
    for (let pass = 0; pass < 4; pass++) for (let i = need.length - 1; i >= 0; i--) if (need[i] === 1) { if (i > 0 && !need[i - 1]) need[i - 1] = 2; if (i < need.length - 1 && !need[i + 1]) need[i + 1] = 2; }
    let i = 0;
    while (i < need.length) {
      if (!need[i]) { i++; continue; } let e = i; while (e + 1 < need.length && need[e + 1]) e++;
      const pos = [], idx = [], uv = [], quads = []; let row = 0;
      for (let k = a0 + i; k <= a0 + e; k++) {
        const F = frame(k), floor = F.c.y - rout - 0.3;
        const L = F.c.clone().addScaledVector(F.r, -W), R = F.c.clone().addScaledVector(F.r, W);
        // walls stand a little proud of the ground so the coarse terrain mesh never shows a gap at the cut edge
        const top = Math.max(ground(L.x, L.z), ground(R.x, R.z), ground(F.c.x, F.c.z), floor + 0.3) + 0.6;
        const pts = [[-W - th, floor - 0.4], [-W - th, top], [-W, top], [-W, floor], [W, floor], [W, top], [W + th, top], [W + th, floor - 0.4]];
        let per = 0; pts.forEach(([x, y], q) => { if (q) per += Math.hypot(x - pts[q - 1][0], y - pts[q - 1][1]); const p = F.c.clone().addScaledVector(F.r, x); pos.push(p.x, y, p.z); uv.push(per / 2.4, k * DS / 2.4); });
        if (row > 0) for (let q = 0; q < pts.length - 1; q++) { const o = (row - 1) * pts.length; idx.push(o + q, o + q + 1, o + pts.length + q, o + q + 1, o + pts.length + q + 1, o + pts.length + q); }
        quads.push([F.c.clone().addScaledVector(F.r, -W - th * 0.5), F.c.clone().addScaledVector(F.r, W + th * 0.5), floor]); row++;
      }
      if (row > 1) {
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
        if (!mats.concreteDS) { mats.concreteDS = mats.concrete.clone(); mats.concreteDS.side = THREE.DoubleSide; }
        add(geo, tn.kinds.includes(TUN.WATER) ? mats.bed : mats.concreteDS, false, true);
        for (let q = 0; q < quads.length - 1; q++) footprints.push({ poly: [quads[q][0], quads[q][1], quads[q + 1][1], quads[q + 1][0]], floor: Math.min(quads[q][2], quads[q + 1][2]), lower: false });
      }
      i = e + 1;
    }
  }
  function buildPortals(tn) {
    const rin = tn.rin;
    for (const p of tn.portals) {
      const k = clamp(Math.round(p.s / DS), 0, trk.n - 1), F = frame(k); F.c.set(trk.get(trk.px, p.s) + trk.get(trk.ux, p.s) * trk.tunEnv.uc, trk.get(trk.py, p.s) + trk.get(trk.uy, p.s) * trk.tunEnv.uc, trk.get(trk.pz, p.s) + trk.get(trk.uz, p.s) * trk.tunEnv.uc);
      if (p.inner) { placeAt(add(new THREE.TorusGeometry(rin + 0.2, 0.22, 10, 36), mats.steel), F); continue; }
      if (p.kind === TUN.UNDER || p.kind === TUN.WATER) {
        // concrete headwall with the bore through it, square to the track
        const Wd = rin + 1.7, sh = new THREE.Shape(); sh.moveTo(-Wd, -rin - 1.0); sh.lineTo(Wd, -rin - 1.0); sh.lineTo(Wd, rin + 1.6); sh.lineTo(-Wd, rin + 1.6); sh.closePath();
        sh.holes.push(new THREE.Path(circle(rin + 0.02, 40).map(q => new THREE.Vector2(q[0], q[1]))));
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.9, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.05, bevelSegments: 1, curveSegments: 1 }); g.translate(0, 0, -0.45);
        placeAt(add(g, mats.concrete), F);
        // coping on top
        const cp = new THREE.BoxGeometry(Wd * 2 + 0.3, 0.25, 1.2); cp.translate(0, rin + 1.72, 0); placeAt(add(cp, mats.concrete), F);
        if (p.kind === TUN.WATER) placeAt(add(new THREE.TorusGeometry(rin + 0.2, 0.2, 10, 36), mats.steel), F);
      } else if (p.kind === TUN.ABOVE) {
        if (tn.props.style === 'wire') placeAt(add(shellGeo(rin + 0.1, 0.25, 0.3, { sides: 10 }), mats.neonFrame, false), F);
        else { const sh = new THREE.Shape(), Wd = rin + 0.9; sh.moveTo(-Wd, -rin - 0.2); sh.lineTo(Wd, -rin - 0.2); sh.lineTo(Wd, rin + 0.9); sh.lineTo(-Wd, rin + 0.9); sh.closePath(); sh.holes.push(new THREE.Path(archShape(rin + 0.02).getPoints()));
          const g = new THREE.ExtrudeGeometry(sh, { depth: 0.3, bevelEnabled: false }); g.translate(0, 0, -0.15); placeAt(add(g, tn.props.style === 'metal' ? mats.steel : mats.timber), F); }
      }
    }
  }
  function buildLights(tn) {
    const L = tn.props.light, rin = tn.rin;
    if (L === 'work') {
      const fr = []; for (let k = tn.a + 6; k <= tn.b; k += Math.round(6 / DS)) { const F = frame(k); for (const sg of [-1, 1]) { const a = Math.PI / 2 + sg * 0.6; fr.push({ c: F.c.clone().addScaledVector(F.r, Math.cos(a) * (rin - 0.08)).addScaledVector(F.u, Math.sin(a) * (rin - 0.08)), r: F.r.clone().applyAxisAngle(F.t, sg * 0.6), u: F.u.clone().applyAxisAngle(F.t, sg * 0.6), t: F.t }); } }
      instanced(new THREE.BoxGeometry(0.22, 0.08, 1.1), mats.lamp, fr, false);
    } else if (L === 'neon') {
      for (const sg of [-1, 1]) { const a = Math.PI / 2 + sg * 1.15, R = rin - 0.04, x = Math.cos(a) * R, y = Math.sin(a) * R, dx = -Math.sin(a) * 0.05, dy = Math.cos(a) * 0.05;
        const m = add(sweep(tn.a, tn.b, [[x - dx, y - dy], [x + dx, y + dy]], { vScale: 1 }), mats.neon, false, false); m.material = mats.neon; animated.push(m); }
    }
  }
  function buildParticles(tn, ti) {
    const P = tn.props, kinds = ['fog', 'spray', 'dust'].filter(k => P[k]); if (!kinds.length) return;
    const n0 = clamp(Math.round(tn.len * 3), 60, ctx.Q().railSeg >= 10 ? 1400 : 700);
    for (const kind of kinds) {
      const n = kind === 'fog' ? Math.round(n0 * 0.35) : n0, pos = new Float32Array(n * 3), rnd = new Float32Array(n);
      for (let i = 0; i < n; i++) { const k = tn.a + Math.floor(Math.random() * (tn.b - tn.a + 1)), F = frame(k), a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * tn.rin * 0.9; const p = F.c.clone().addScaledVector(F.r, Math.cos(a) * r).addScaledVector(F.u, Math.sin(a) * r * (kind === 'fog' ? 0.6 : 1) - (kind === 'fog' ? tn.rin * 0.35 : 0)); pos.set([p.x, p.y, p.z], i * 3); rnd[i] = Math.random(); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aRnd', new THREE.BufferAttribute(rnd, 1));
      const cfg = { fog: [0xd9dee3, 260, 0.07], spray: [0xbfe6ff, 22, 0.55], dust: [0xe8d2a8, 10, 0.5] }[kind];
      const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: kind === 'fog' ? THREE.NormalBlending : THREE.AdditiveBlending,
        uniforms: { uTime: timeU, uCol: { value: new THREE.Color(cfg[0]) }, uSize: { value: cfg[1] }, uAlpha: { value: cfg[2] }, uKind: { value: kinds.indexOf(kind) >= 0 ? ['fog', 'spray', 'dust'].indexOf(kind) : 0 }, uR: { value: tn.rin } },
        vertexShader: `uniform float uTime, uSize, uKind, uR; attribute float aRnd; varying float vA;
          void main(){ vec3 p = position; float t = uTime;
            if (uKind < 0.5) { p.x += sin(t * 0.2 + aRnd * 30.0) * 1.2; p.z += cos(t * 0.17 + aRnd * 20.0) * 1.2; p.y += sin(t * 0.3 + aRnd * 9.0) * 0.15; }
            else if (uKind < 1.5) { float f = fract(t * (0.6 + aRnd * 0.6) + aRnd * 7.0); p.y += uR * 0.9 - f * uR * 1.8; p.x += sin(aRnd * 40.0 + t) * 0.15; vA = 1.0 - f; }
            else { p += vec3(sin(t * 0.37 + aRnd * 50.0), sin(t * 0.21 + aRnd * 13.0) * 0.6, cos(t * 0.29 + aRnd * 31.0)) * 0.6; }
            if (uKind > 1.5 || uKind < 0.5) vA = 0.6 + 0.4 * sin(t + aRnd * 6.28);
            vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = uSize * (1.0 + aRnd) / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
        fragmentShader: `uniform vec3 uCol; uniform float uAlpha; varying float vA; void main(){ vec2 d = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(d)); gl_FragColor = vec4(uCol, a * uAlpha * vA); }` });
      const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 7; group.add(pts);
    }
  }

  // ---------- runtime ----------
  function update(dt, time) { timeU.value = time; }
  function insideAt(p) {
    const cell = 6, gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell), gz = Math.floor(p.z / cell); let best = null, bd = 1e9;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let l = -1; l <= 1; l++) { const a = insideCells.get((gx + i) + ',' + (gy + j) + ',' + (gz + l)); if (!a) continue; for (const it of a) { const d = it.c.distanceTo(p); if (d < it.rin + 0.3 && d < bd) { bd = d; best = it; } } }
    return best;
  }
  // placement grid: true where a covered or underwater tunnel occupies the ground at (x, z)
  function blocked(x, z, r = 0) {
    const cell = 8, gx = Math.floor(x / cell), gz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const a = blockCells.get((gx + i) + ',' + (gz + j)); if (!a) continue; for (const it of a) if (Math.hypot(it.c.x - x, it.c.z - z) < it.r + r) return true; }
    return false;
  }
  return { group, stencilGroup, build, update, insideAt, blocked, get footprints() { return footprints; }, get gap() { return gap; }, get tunnels() { return tunnels; }, get hasWater() { return stencilGroup.children.length > 0; } };
}
const STYLE_DEPTH_T = { tubular: 0.95, box: 1.2, truss: 1.2, ibox: 0.55, wood: 0.65, flat: 0.5, trough: 0.8 };
// ===================== END TUNNELS =====================
