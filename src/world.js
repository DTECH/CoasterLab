// ===================== WORLD: renderer, sky, weather, scenery, cameras =====================
function createWorld(THREE) {
  const V3 = THREE.Vector3;
  let renderer, scene, camera, pmrem, envRT = null;
  let sunLight, hemiLight, skyMesh, skyUniforms, skyScene, envU;
  let terrainMesh, waterMesh, waterNormal, groundTex, groundNrm, chainTex, grateTex;
  const vegGroup = new THREE.Group(), parkGroup = new THREE.Group(), fxGroup = new THREE.Group();
  let ferris = null, lampLights = [], lampHeads = [];
  let Q = null, tierResolved = 'medium';
  let trk = null, todKey = 'golden', weatherKey = 'fair', sceneryKey = 'alpine', guides = true;
  let design = defaultDesign();
  let mats = {}; const timeU = { value: 0 }, windU = { value: 0.3 }; let gpuName = ''; let sunDirV = [0, 1, 0]; let onResizeCb = null, onThunder = null;
  let time = 0;
  let pr = 1, prMax = 1, prMin = 0.6, fpsAcc = 0, fpsN = 0, fps = 60, lowStreak = 0, highStreak = 0;
  let precip = null, flash = 0, nextFlash = 6, nightF = 0;
  const camState = { mode: 'follow', pos: new V3(40, 30, 40), look: new V3(), hS: 0, lookYaw: 0, lookPitch: 0, fov: 70, init: false };
  const tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), te = new THREE.Euler(), seatM = new THREE.Matrix4();
  const v1 = new V3(), v2 = new V3(), v3 = new V3(), v4 = new V3();
  let trackGfx = null, trainGfx = null, tunnelGfx = null, tunLight = null, waterPre = null, waterUnder = null, terrainBaseY = null;
  const tunState = { exp: 1, fogMix: 0, inside: null };
  const envBase = { exposure: 1, fogColor: new THREE.Color(), fogDensity: 0 };
  // terrain carving: a top-down mask (white = removed) over the area of any open cuts, read in the terrain shader
  const carveU = { uCarve: { value: null }, uCarveRect: { value: new THREE.Vector4(0, 0, 1, 1) }, uCarveOn: { value: 0 } };

  // ---------- quality tiers ----------
  const TIERS = {
    low:    { name: 'Low',    prMax: 1.0, shadow: 1024, shadowExt: 80,  soft: false, trees: 3000,  bushes: 800,  grass: 6000,  rocks: 240, grid: 180, railSeg: 6,  spineSeg: 8,  clouds: 3, treeShadow: false, phys: false, precip: 1500 },
    medium: { name: 'Medium', prMax: 1.5, shadow: 2048, shadowExt: 110, soft: true,  trees: 6500,  bushes: 1800, grass: 20000, rocks: 400, grid: 260, railSeg: 8,  spineSeg: 10, clouds: 4, treeShadow: true,  phys: false, precip: 3500 },
    high:   { name: 'High',   prMax: 2.0, shadow: 4096, shadowExt: 150, soft: true,  trees: 12000, bushes: 3200, grass: 45000, rocks: 620, grid: 340, railSeg: 10, spineSeg: 14, clouds: 5, treeShadow: true,  phys: true,  precip: 7000 },
    ultra:  { name: 'Ultra',  prMax: 2.0, shadow: 4096, shadowExt: 190, soft: true,  trees: 20000, bushes: 5500, grass: 80000, rocks: 880, grid: 420, railSeg: 12, spineSeg: 16, clouds: 5, treeShadow: true,  phys: true,  precip: 12000 }
  };
  function detectTier() {
    const ua = navigator.userAgent || '';
    const mobile = /Android|iPhone|iPad|Mobile/i.test(ua) || (matchMedia('(pointer:coarse)').matches && Math.min(screen.width, screen.height) < 900);
    let gpu = '';
    try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch (e) {}
    gpuName = gpu || 'Unknown GPU';
    if (mobile) return /Adreno \(TM\) (7[3-9]\d|8\d\d)|Adreno.*8\d\d|Immortalis|Xclipse 9/i.test(gpu) ? 'medium' : 'low';
    if (/NVIDIA|GeForce|RTX|GTX|Radeon RX|Radeon Pro|Arc/i.test(gpu)) return 'high';
    if (/SwiftShader|llvmpipe|Software/i.test(gpu)) return 'low';
    return 'medium';
  }

  // ---------- noise ----------
  const Noise = (() => {
    let seed = 20261017; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const perm = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
    const p = new Uint8Array(512); for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const grad = (h, x, y) => { switch (h & 7) { case 0: return x + y; case 1: return -x + y; case 2: return x - y; case 3: return -x - y; case 4: return x; case 5: return -x; case 6: return y; default: return -y; } };
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
    function n2(x, y) {
      const xf = Math.floor(x), yf = Math.floor(y); const X = xf & 255, Y = yf & 255; x -= xf; y -= yf;
      const u = fade(x), v = fade(y); const a = p[X] + Y, b = p[X + 1] + Y;
      return lerp(lerp(grad(p[a], x, y), grad(p[b], x - 1, y), u), lerp(grad(p[a + 1], x, y - 1), grad(p[b + 1], x - 1, y - 1), u), v);
    }
    function fbm(x, y, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { s += a * n2(x * f, y * f); n += a; a *= 0.5; f *= 2.03; } return s / n; }
    function ridge(x, y, o = 5) { let s = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < o; i++) { let r = 1 - Math.abs(n2(x * f + i * 13.1, y * f - i * 7.7)); r *= r; s += a * r; n += a; a *= 0.48; f *= 2.07; } return s / n; }
    let rs = 99; const rand = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
    return { n2, fbm, ridge, rand, reseed: s => { rs = s; } };
  })();
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  // ---------- terrain (shape depends on the scenery type) ----------
  const VALLEY = { cx: 40, cz: -220, r0: 1150, r1: 2700 };
  const LAKE = { x: -235, z: -190, r: 125, depth: 7 };
  const OCEAN = { dir: [-0.62, 0.78], start: 330, depth: 14 };
  const WATER_Y = -1.5;
  const SC = () => SCENERY[sceneryKey] || SCENERY.alpine;
  function terrainHeight(x, z) {
    const sc = SC(), mode = sc.mountains;
    const dx = x - VALLEY.cx, dz = z - VALLEY.cz; const r = Math.hypot(dx, dz);
    let h = Noise.fbm(x * 0.0045, z * 0.0045, 4) * 2.0 - 0.7;
    h += Noise.n2(x * 0.03, z * 0.03) * 0.25;
    if (mode === 'ridge') {
      const hill = sstep(520, 1150, r); if (hill > 0) h += hill * (Noise.fbm(x * 0.0017 + 7.3, z * 0.0017 - 3.1, 5) * 0.5 + 0.55) * 85;
      const m = sstep(VALLEY.r0, VALLEY.r1, r); if (m > 0) h += m * (Noise.ridge(x * 0.00085, z * 0.00085, 6) * 640 + 30 + Noise.fbm(x * 0.004, z * 0.004, 3) * 25);
    } else if (mode === 'hills') {
      const hill = sstep(380, 1000, r); if (hill > 0) h += hill * (Noise.fbm(x * 0.0022 + 3.1, z * 0.0022, 5) * 0.6 + 0.6) * 120;
      const m = sstep(1400, 2900, r); if (m > 0) h += m * (Noise.fbm(x * 0.0011, z * 0.0011, 5) * 0.5 + 0.5) * 260;
    } else if (mode === 'mesa') {
      h += Noise.fbm(x * 0.008, z * 0.008, 3) * 1.5;
      const n = Noise.fbm(x * 0.0011 + 11, z * 0.0011 - 4, 4) + sstep(500, 1600, r) * 0.35 - 0.1;
      const plateau = sstep(0.02, 0.07, n) * 70 + sstep(0.22, 0.26, n) * 55 + sstep(0.38, 0.41, n) * 40;
      h += plateau * sstep(320, 700, r) + sstep(1600, 3000, r) * 120;
      h += Noise.ridge(x * 0.004, z * 0.004, 3) * 4 * sstep(0.03, 0.06, n);
    } else if (mode === 'coast') {
      const dd = dx * OCEAN.dir[0] + dz * OCEAN.dir[1];
      const inland = sstep(-200, -900, dd);
      h += inland * (Noise.fbm(x * 0.0018, z * 0.0018, 5) * 0.6 + 0.7) * 160;
      h = lerp(h, -OCEAN.depth + Noise.n2(x * 0.004, z * 0.004) * 3, sstep(OCEAN.start, OCEAN.start + 260, dd + Noise.n2(x * 0.006, z * 0.006) * 70));
    } else if (mode === 'flat') {
      h += Noise.fbm(x * 0.0016, z * 0.0016, 4) * 6 * sstep(300, 900, r) + sstep(1800, 3200, r) * (Noise.fbm(x * 0.0012, z * 0.0012, 4) * 0.5 + 0.5) * 70;
    }
    if (sc.water === 'lake' || sc.water === 'frozen') {
      let ld = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.35);
      if (ld < LAKE.r * 2) { ld += Noise.n2(x * 0.012, z * 0.012) * 28; const t = sstep(LAKE.r * 1.45, LAKE.r * 0.55, ld); h = lerp(h, -LAKE.depth, t); }
    }
    return h;
  }

  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function groundTextures() {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'); const img = g.createImageData(S, S); const hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const a = x / S * Math.PI * 2, b = y / S * Math.PI * 2;
      const nx = Math.cos(a) * 3, ny = Math.sin(a) * 3, nz = Math.cos(b) * 3, nw = Math.sin(b) * 3;
      let v = 0, amp = 1, f = 1, tot = 0;
      for (let o = 0; o < 5; o++) { v += amp * Noise.n2(nx * f + nz * f * 0.7 + o * 3.1, ny * f + nw * f * 0.7 - o * 1.7); tot += amp; amp *= 0.55; f *= 2.1; }
      v = v / tot; const speck = Math.random() < 0.06 ? (Math.random() - 0.5) * 0.5 : 0;
      const val = clamp(0.84 + v * 0.32 + speck * 0.5, 0, 1); hgt[y * S + x] = val;
      const i = (y * S + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = val * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    const nc = makeCanvas(S, S), ng = nc.getContext('2d'), nimg = ng.createImageData(S, S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const hx = hgt[y * S + ((x + 1) % S)] - hgt[y * S + ((x - 1 + S) % S)], hy = hgt[((y + 1) % S) * S + x] - hgt[((y - 1 + S) % S) * S + x];
      const n = norm3([-hx * 3, -hy * 3, 1]); const i = (y * S + x) * 4;
      nimg.data[i] = (n[0] * 0.5 + 0.5) * 255; nimg.data[i + 1] = (n[1] * 0.5 + 0.5) * 255; nimg.data[i + 2] = (n[2] * 0.5 + 0.5) * 255; nimg.data[i + 3] = 255;
    }
    ng.putImageData(nimg, 0, 0);
    groundTex = new THREE.CanvasTexture(c); groundTex.colorSpace = THREE.SRGBColorSpace;
    groundNrm = new THREE.CanvasTexture(nc);
    for (const t of [groundTex, groundNrm]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
    const W = 256, wc = makeCanvas(W, W), wg = wc.getContext('2d'), wimg = wg.createImageData(W, W);
    const waves = []; for (let i = 0; i < 18; i++) waves.push([1 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 7) - 3, Math.random() * 6.28, 0.6 / (1 + i * 0.25)]);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      let ddx = 0, ddy = 0;
      for (const [kx, ky, ph, amp] of waves) { const arg = (kx * x + ky * y) / W * Math.PI * 2 + ph; const c2 = Math.cos(arg) * amp; ddx += c2 * kx; ddy += c2 * ky; }
      const n = norm3([-ddx * 0.08, -ddy * 0.08, 1]); const i = (y * W + x) * 4;
      wimg.data[i] = (n[0] * 0.5 + 0.5) * 255; wimg.data[i + 1] = (n[1] * 0.5 + 0.5) * 255; wimg.data[i + 2] = (n[2] * 0.5 + 0.5) * 255; wimg.data[i + 3] = 255;
    }
    wg.putImageData(wimg, 0, 0);
    waterNormal = new THREE.CanvasTexture(wc); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
    const cc = makeCanvas(32, 64), cg = cc.getContext('2d');
    cg.fillStyle = '#1b1c1e'; cg.fillRect(0, 0, 32, 64); cg.strokeStyle = '#8d9096'; cg.lineWidth = 5;
    cg.beginPath(); cg.roundRect ? cg.roundRect(9, 4, 14, 26, 6) : cg.rect(9, 4, 14, 26); cg.stroke();
    cg.beginPath(); cg.roundRect ? cg.roundRect(9, 34, 14, 26, 6) : cg.rect(9, 34, 14, 26); cg.stroke();
    chainTex = new THREE.CanvasTexture(cc); chainTex.colorSpace = THREE.SRGBColorSpace; chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping;
    const gc = makeCanvas(64, 64), gg = gc.getContext('2d'); gg.fillStyle = '#000'; gg.fillRect(0, 0, 64, 64); gg.fillStyle = '#fff';
    for (let i = 0; i < 64; i += 8) { gg.fillRect(i, 0, 3, 64); gg.fillRect(0, i, 64, 3); }
    grateTex = new THREE.CanvasTexture(gc); grateTex.wrapS = grateTex.wrapT = THREE.RepeatWrapping; grateTex.repeat.set(2, 1);
  }

  function buildTerrain() {
    if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); terrainMesh.material.dispose(); }
    const sc = SC(), N = Q.grid, E = 5200, a = 0.2;
    const map = u => Math.sign(u) * E * (a * Math.abs(u) + (1 - a) * Math.abs(u) ** 3);
    const pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2), col = new Float32Array((N + 1) * (N + 1) * 3);
    let p = 0, q = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = VALLEY.cx + map(i / N * 2 - 1), z = VALLEY.cz + map(j / N * 2 - 1);
      pos[p++] = x; pos[p++] = terrainHeight(x, z); pos[p++] = z; uv[q++] = x / 7; uv[q++] = z / 7;
    }
    const idx = new Uint32Array(N * N * 6); let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const A = j * (N + 1) + i, B = A + 1, C = A + N + 1, D = C + 1; idx[k++] = A; idx[k++] = C; idx[k++] = B; idx[k++] = B; idx[k++] = C; idx[k++] = D; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal.array;
    const [gA, gB, gDry, gF] = sc.ground.map(h => new THREE.Color(h));
    const cSand = new THREE.Color(sc.sand), cMud = new THREE.Color(0x4d4433), cRock = new THREE.Color(sc.rock[0]), cRock2 = new THREE.Color(sc.rock[1]), cSnow = new THREE.Color(0xeef1f5);
    const c = new THREE.Color();
    const coast = sc.mountains === 'coast';
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ny = nrm[v * 3 + 1];
      const n1 = Noise.fbm(x * 0.006 + 11, z * 0.006, 3) * 0.5 + 0.5, n2 = Noise.fbm(x * 0.02, z * 0.02 + 5, 2) * 0.5 + 0.5;
      c.copy(gA).lerp(gB, n1);
      c.lerp(gDry, sstep(0.68, 0.92, n2) * 0.3);
      c.lerp(gF, sstep(0.0, 0.25, Noise.fbm(x * 0.004 + 50, z * 0.004, 3)) * 0.35);
      const beach = coast ? 3.5 : 1.6;
      if (y < WATER_Y + beach) c.lerp(cSand, sstep(WATER_Y + beach, WATER_Y + 0.3, y));
      if (y < WATER_Y - 0.2) c.lerp(cMud, sstep(WATER_Y - 0.2, WATER_Y - 2.5, y) * (coast ? 0.3 : 1));
      const rockT = sstep(0.86, 0.68, ny) + sstep(240, 420, y) * 0.5 + (sc.mountains === 'mesa' ? sstep(0.95, 0.75, ny) * 0.6 : 0);
      if (rockT > 0) c.lerp(n2 > 0.5 ? cRock : cRock2, clamp(rockT, 0, 1));
      if (sc.mountains === 'mesa') c.lerp(cRock2, sstep(0.5, 0.9, Math.sin(y * 0.35) * 0.5 + 0.5) * sstep(8, 30, y) * 0.35);
      const snowT = sstep(sc.snowLine + n1 * 90, sc.snowLine + 90 + n1 * 90, y) * sstep(0.6, 0.82, ny);
      if (snowT > 0) c.lerp(cSnow, snowT);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, normalMap: groundNrm, normalScale: new THREE.Vector2(0.55, 0.55), roughness: sceneryKey === 'winter' ? 0.75 : 0.96, metalness: 0 });
    mat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, carveU);
      sh.vertexShader = 'varying vec2 vCarveXZ;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vCarveXZ = (modelMatrix * vec4(position, 1.0)).xz;');
      sh.fragmentShader = 'uniform sampler2D uCarve; uniform vec4 uCarveRect; uniform float uCarveOn; varying vec2 vCarveXZ;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (uCarveOn > 0.5) { vec2 cu = (vCarveXZ - uCarveRect.xy) / (uCarveRect.zw - uCarveRect.xy); if (cu.x > 0.0 && cu.y > 0.0 && cu.x < 1.0 && cu.y < 1.0 && texture2D(uCarve, cu).r > 0.5) discard; }');
    };
    mats.terrain = mat;
    terrainMesh = new THREE.Mesh(geo, mat); terrainMesh.receiveShadow = true; terrainMesh.name = 'terrain';
    terrainBaseY = Float32Array.from({ length: pos.length / 3 }, (_, i) => pos[i * 3 + 1]);
    scene.add(terrainMesh);
  }
  function buildWater() {
    if (waterMesh) { scene.remove(waterMesh); waterMesh.geometry.dispose(); waterMesh.material.dispose(); waterMesh = null; }
    if (waterPre) { scene.remove(waterPre); waterPre.material.dispose(); waterPre = null; }
    if (waterUnder) { scene.remove(waterUnder); waterUnder.material.dispose(); waterUnder = null; }
    const sc = SC(); if (sc.water === 'none') return;
    let geo;
    if (sc.water === 'ocean') { geo = new THREE.PlaneGeometry(12000, 12000); geo.rotateX(-Math.PI / 2); }
    else { geo = new THREE.CircleGeometry(LAKE.r * 1.9, 96); geo.rotateX(-Math.PI / 2); }
    const frozen = sc.water === 'frozen';
    const mat = frozen ? new THREE.MeshStandardMaterial({ color: 0xcfe2ee, roughness: 0.35, metalness: 0.05, normalMap: groundNrm, normalScale: new THREE.Vector2(0.15, 0.15) })
      : new THREE.MeshPhysicalMaterial({ color: sc.water === 'ocean' ? 0x0b3346 : 0x0a2129, roughness: 0.1, metalness: 0, ior: 1.33, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.8 });
    waterNormal.repeat.set(sc.water === 'ocean' ? 300 : 10, sc.water === 'ocean' ? 300 : 10);
    waterMesh = new THREE.Mesh(geo, mat);
    if (sc.water === 'ocean') waterMesh.position.set(VALLEY.cx, WATER_Y, VALLEY.cz); else { waterMesh.position.set(LAKE.x, WATER_Y, LAKE.z); waterMesh.scale.set(1, 1, 1 / 1.35); }
    waterMesh.receiveShadow = true;
    scene.add(waterMesh);
    // the surface seen from below (from inside an acrylic tube): a bright, fogged sheet that only shows its back face
    if (!frozen) { waterUnder = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x4fb6c2, side: THREE.BackSide })); waterUnder.position.copy(waterMesh.position); waterUnder.scale.copy(waterMesh.scale); scene.add(waterUnder); }
    configureWaterStencil();
  }
  // Water exclusion inside underwater tubes: the water is drawn into depth first, the tube volumes then count
  // (z-fail) how many of their walls lie behind each water pixel, and the water colour is only drawn where the count is 0.
  // This keeps the surface (and its reflections) out of the tubes, also with the camera inside one.
  function configureWaterStencil() {
    if (!waterMesh) return;
    const on = !!(tunnelGfx && tunnelGfx.hasWater);
    for (const w of [waterMesh, waterUnder]) { if (!w) continue; const m = w.material;
      m.stencilWrite = on; m.stencilRef = 0; m.stencilFunc = THREE.EqualStencilFunc; m.stencilFail = m.stencilZFail = m.stencilZPass = THREE.KeepStencilOp; m.needsUpdate = true;
      w.renderOrder = on ? 30 : 0; }
    if (on && !waterPre) { waterPre = new THREE.Mesh(waterMesh.geometry, new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })); waterPre.position.copy(waterMesh.position); waterPre.scale.copy(waterMesh.scale); waterPre.renderOrder = 10; scene.add(waterPre); }
    if (waterPre) waterPre.visible = on;
  }
  // ---------- tunnels: build, carve the terrain for open cuts, water mask ----------
  function buildTunnels(t) {
    tunnelGfx.build(t);
    carveTerrain(tunnelGfx.footprints);
    configureWaterStencil();
    const want = (t.tunnels || []).length > 0;
    if (want && !tunLight) { tunLight = new THREE.PointLight(0xffe2b0, 0, 26, 1.6); scene.add(tunLight); }
    if (!want && tunLight) { scene.remove(tunLight); tunLight = null; }
  }
  function carveTerrain(fps) {
    if (!terrainMesh) return;
    const geo = terrainMesh.geometry, pos = geo.attributes.position, arr = pos.array; let changed = false;
    for (let i = 0; i < terrainBaseY.length; i++) if (arr[i * 3 + 1] !== terrainBaseY[i]) { arr[i * 3 + 1] = terrainBaseY[i]; changed = true; }
    carveU.uCarveOn.value = 0;
    if (fps.length) {
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const f of fps) for (const p of f.poly) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      x0 -= 12; z0 -= 12; x1 += 12; z1 += 12;
      const S = 1024, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.fillStyle = '#fff';
      const X = x => (x - x0) / (x1 - x0) * S, Z = z => (z - z0) / (z1 - z0) * S;
      for (const f of fps) { g.beginPath(); f.poly.forEach((p, i) => i ? g.lineTo(X(p.x), Z(p.z)) : g.moveTo(X(p.x), Z(p.z))); g.closePath(); g.fill(); }
      const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.generateMipmaps = false;
      if (carveU.uCarve.value) carveU.uCarve.value.dispose();
      carveU.uCarve.value = tex; carveU.uCarveRect.value.set(x0, z0, x1, z1); carveU.uCarveOn.value = 1;
      // lower the heightmap vertices inside each cut so the coarse terrain dips toward the trench floor
      const inPoly = (x, z, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.z > z) !== (b.z > z) && x < (b.x - a.x) * (z - a.z) / (b.z - a.z) + a.x) c = !c; } return c; };
      for (let i = 0; i < pos.count; i++) {
        const x = arr[i * 3], z = arr[i * 3 + 2]; if (x < x0 || x > x1 || z < z0 || z > z1) continue;
        for (const f of fps) if (f.lower !== false && inPoly(x, z, f.poly)) { arr[i * 3 + 1] = Math.min(arr[i * 3 + 1], f.floor - 0.4); changed = true; break; }
      }
    }
    if (changed) { pos.needsUpdate = true; geo.computeVertexNormals(); }
  }

  // ---------- sky (Preetham scattering + procedural clouds + stars and moon at night) ----------
  const SKY_VS = `
    uniform vec3 sunPosition; uniform float rayleigh; uniform float turbidity; uniform float mieCoefficient; uniform vec3 up;
    varying vec3 vWorldPosition; varying vec3 vSunDirection; varying float vSunfade; varying vec3 vBetaR; varying vec3 vBetaM; varying float vSunE;
    const float e = 2.71828182845904523536; const vec3 totalRayleigh = vec3(5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5);
    const vec3 MieConst = vec3(1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14);
    const float cutoffAngle = 1.6110731556870734; const float steepness = 1.5; const float EE = 1000.0;
    float sunIntensity(float zc) { zc = clamp(zc, -1.0, 1.0); return EE * max(0.0, 1.0 - pow(e, -((cutoffAngle - acos(zc)) / steepness))); }
    vec3 totalMie(float T) { float c = (0.2 * T) * 10E-18; return 0.434 * c * MieConst; }
    void main() {
      vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w;
      vSunDirection = normalize(sunPosition); vSunE = sunIntensity(dot(vSunDirection, up));
      vSunfade = 1.0 - clamp(1.0 - exp((sunPosition.y / 450000.0)), 0.0, 1.0);
      float rayleighCoefficient = rayleigh - (1.0 * (1.0 - vSunfade));
      vBetaR = totalRayleigh * rayleighCoefficient; vBetaM = totalMie(turbidity) * mieCoefficient;
    }`;
  const SKY_FS = (oct) => `
    varying vec3 vWorldPosition; varying vec3 vSunDirection; varying float vSunfade; varying vec3 vBetaR; varying vec3 vBetaM; varying float vSunE;
    uniform float mieDirectionalG; uniform vec3 up; uniform vec3 cameraPos; uniform float uTime; uniform float uCloudCover; uniform vec3 uCloudLit; uniform vec3 uCloudShade; uniform float uGain;
    uniform float uCloudDark; uniform float uNight; uniform vec3 uMoonDir; uniform float uFlash; uniform float uWind;
    const float pi = 3.141592653589793; const float rayleighZenithLength = 8.4E3; const float mieZenithLength = 1.25E3;
    const float sunAngularDiameterCos = 0.99995; const float THREE_OVER_SIXTEENPI = 0.05968310365946075; const float ONE_OVER_FOURPI = 0.07957747154594767;
    float rayleighPhase(float c) { return THREE_OVER_SIXTEENPI * (1.0 + pow(c, 2.0)); }
    float hgPhase(float c, float g) { float g2 = pow(g, 2.0); float inv = 1.0 / pow(1.0 - 2.0 * g * c + g2, 1.5); return ONE_OVER_FOURPI * ((1.0 - g2) * inv); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
    float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
    float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < ${oct}; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.0, 9.0); a *= 0.5; } return s; }
    void main() {
      vec3 direction = normalize(vWorldPosition - cameraPos);
      float zenithAngle = acos(max(0.0, dot(up, direction)));
      float inverse = 1.0 / (cos(zenithAngle) + 0.15 * pow(93.885 - ((zenithAngle * 180.0) / pi), -1.253));
      float sR = rayleighZenithLength * inverse; float sM = mieZenithLength * inverse;
      vec3 Fex = exp(-(vBetaR * sR + vBetaM * sM));
      float cosTheta = dot(direction, vSunDirection);
      float rPhase = rayleighPhase(cosTheta * 0.5 + 0.5); vec3 betaRTheta = vBetaR * rPhase;
      float mPhase = hgPhase(cosTheta, mieDirectionalG); vec3 betaMTheta = vBetaM * mPhase;
      vec3 Lin = pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * (1.0 - Fex), vec3(1.5));
      Lin *= mix(vec3(1.0), pow(vSunE * ((betaRTheta + betaMTheta) / (vBetaR + vBetaM)) * Fex, vec3(1.0 / 2.0)), clamp(pow(1.0 - dot(up, vSunDirection), 5.0), 0.0, 1.0));
      vec3 L0 = vec3(0.1) * Fex;
      float sundisk = smoothstep(sunAngularDiameterCos, sunAngularDiameterCos + 0.00002, cosTheta);
      L0 += (vSunE * 19000.0 * Fex) * sundisk * (1.0 - uCloudDark);
      vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
      vec3 retColor = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));
      // night sky: deep blue, stars and a moon
      if (uNight > 0.0) {
        vec3 nightCol = mix(vec3(0.010, 0.016, 0.035), vec3(0.03, 0.045, 0.08), pow(1.0 - max(direction.y, 0.0), 3.0));
        vec3 sd = direction * 340.0; vec3 cell = floor(sd);
        float st = step(0.9965, hash3(cell)) * smoothstep(0.0, 0.25, direction.y);
        float tw = 0.65 + 0.35 * sin(uTime * 3.0 + hash3(cell + 3.0) * 30.0);
        nightCol += vec3(0.9, 0.92, 1.0) * st * tw * (1.0 - uCloudDark);
        float md = dot(direction, normalize(uMoonDir));
        nightCol += vec3(0.85, 0.88, 0.95) * smoothstep(0.99955, 0.9997, md) * 2.0 * (1.0 - uCloudDark * 0.8);
        nightCol += vec3(0.18, 0.2, 0.26) * pow(max(md, 0.0), 60.0) * 0.6;
        retColor = mix(retColor, nightCol, uNight);
      }
      float below = smoothstep(0.0, -0.08, direction.y);
      if (direction.y > 0.0) {
        vec2 cuv = direction.xz / (direction.y + 0.1) * 1.35 + uTime * vec2(0.004, 0.0015) * (1.0 + uWind * 3.0);
        float c = fbm(cuv);
        float cov = smoothstep(uCloudCover, uCloudCover + 0.32, c);
        float dens = cov * smoothstep(0.0, 0.22, direction.y);
        float c2 = fbm(cuv + vSunDirection.xz * 0.06);
        float sunAmt = pow(max(cosTheta, 0.0), 8.0) * (1.0 - uCloudDark);
        vec3 lit = uCloudLit * (0.85 + 0.9 * sunAmt);
        vec3 ccol = mix(lit, uCloudShade, clamp((c2 - c) * 4.0 + 0.35, 0.0, 1.0) * 0.85);
        ccol = mix(ccol, uCloudShade * 0.55, uCloudDark * 0.75);
        retColor = mix(retColor, ccol, dens * (0.9 + uCloudDark * 0.1));
        retColor = mix(retColor, uCloudShade * (0.6 + 0.2 * (1.0 - uCloudDark)), uCloudDark * 0.55);
      }
      retColor += vec3(0.75, 0.8, 1.0) * uFlash;
      retColor = mix(retColor, retColor * vec3(0.78, 0.8, 0.82), below);
      gl_FragColor = vec4(retColor * uGain, 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`;
  function skyEvalJS(dir, sunDir, P) {
    const tr = [5.804542996261093E-6, 1.3562911419845635E-5, 3.0265902468824876E-5], MC = [1.8399918514433978E14, 2.7798023919660528E14, 4.0790479543861094E14];
    const zc = clamp(sunDir[1], -1, 1); const sunE = 1000 * Math.max(0, 1 - Math.pow(Math.E, -((1.6110731556870734 - Math.acos(zc)) / 1.5)));
    const cM = 0.2 * P.turbidity * 10E-18;
    const bR = tr.map(v => v * P.rayleigh), bM = MC.map(v => 0.434 * cM * v * P.mie);
    const za = Math.acos(Math.max(0, dir[1])); const inv = 1 / (Math.cos(za) + 0.15 * Math.pow(93.885 - za * 180 / Math.PI, -1.253));
    const Fex = [0, 1, 2].map(i => Math.exp(-(bR[i] * 8400 * inv + bM[i] * 1250 * inv)));
    const ct = dot3(dir, sunDir); const rP = 0.05968310365946075 * (1 + Math.pow(ct * 0.5 + 0.5, 2));
    const g = P.mieG, g2 = g * g; const mP = 0.07957747154594767 * ((1 - g2) / Math.pow(1 - 2 * g * ct + g2, 1.5));
    const mixT = clamp(Math.pow(1 - sunDir[1], 5), 0, 1);
    const out = [0, 1, 2].map(i => {
      const ratio = (bR[i] * rP + bM[i] * mP) / (bR[i] + bM[i]);
      let Lin = Math.pow(sunE * ratio * (1 - Fex[i]), 1.5);
      Lin *= lerp(1, Math.pow(sunE * ratio * Fex[i], 0.5), mixT);
      const tex = (Lin + 0.1 * Fex[i]) * 0.04 + [0, 0.0003, 0.00075][i];
      return Math.pow(tex, 1 / 2.4) * P.gain;
    });
    return { color: out, fex: Fex };
  }
  const TOD = {
    morning: { label: 'Morning', elev: 15, az: 100, turbidity: 3.2, rayleigh: 1.5, mie: 0.004, mieG: 0.8, sunI: 3.0, hemiI: 0.7, fog: 0.00018, exposure: 0.95, lit: [1.2, 1.12, 1.05], shade: [0.52, 0.56, 0.64] },
    noon:    { label: 'Midday',  elev: 58, az: 165, turbidity: 2.6, rayleigh: 1.1, mie: 0.0035, mieG: 0.78, sunI: 3.3, hemiI: 0.75, fog: 0.00015, exposure: 0.9, lit: [1.28, 1.28, 1.3], shade: [0.6, 0.64, 0.72] },
    golden:  { label: 'Golden hour', elev: 5, az: 248, turbidity: 8.0, rayleigh: 2.6, mie: 0.006, mieG: 0.84, sunI: 3.0, hemiI: 0.6, fog: 0.0002, exposure: 1.0, lit: [1.45, 1.05, 0.72], shade: [0.48, 0.44, 0.5] },
    dusk:    { label: 'Dusk', elev: 1.6, az: 262, turbidity: 7.5, rayleigh: 2.8, mie: 0.007, mieG: 0.85, sunI: 1.5, hemiI: 0.45, fog: 0.00024, exposure: 1.35, lit: [1.1, 0.6, 0.45], shade: [0.3, 0.27, 0.36] },
    night:   { label: 'Night', elev: -16, az: 270, turbidity: 2, rayleigh: 1, mie: 0.003, mieG: 0.8, sunI: 0, hemiI: 0.2, fog: 0.00022, exposure: 1.6, lit: [0.2, 0.22, 0.28], shade: [0.07, 0.08, 0.11], night: true, moon: { elev: 38, az: 140 } }
  };
  const TOD_ORDER = ['morning', 'noon', 'golden', 'dusk', 'night'];
  function dirFor(elev, az) { const e = elev * DEG, a = az * DEG; return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]; }
  function buildSky() {
    if (skyMesh) { scene.remove(skyMesh); skyMesh.material.dispose(); }
    skyUniforms = {
      sunPosition: { value: new V3(0, 1, 0) }, up: { value: new V3(0, 1, 0) }, turbidity: { value: 4 }, rayleigh: { value: 2 }, mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 }, cameraPos: { value: new V3() }, uTime: { value: 0 }, uCloudCover: { value: 0.55 },
      uCloudLit: { value: new V3(1, 1, 1) }, uCloudShade: { value: new V3(0.5, 0.5, 0.6) }, uGain: { value: 0.62 },
      uCloudDark: { value: 0 }, uNight: { value: 0 }, uMoonDir: { value: new V3(0.3, 0.6, -0.5) }, uFlash: { value: 0 }, uWind: { value: 0 }
    };
    const mat = new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS(Q.clouds), side: THREE.BackSide, depthWrite: false });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat); skyMesh.scale.setScalar(9000); skyMesh.renderOrder = -10; skyMesh.frustumCulled = false;
    scene.add(skyMesh);
    envU = { ...skyUniforms, cameraPos: { value: new V3() }, uFlash: { value: 0 } };
    const envMat = new THREE.ShaderMaterial({ uniforms: envU, vertexShader: SKY_VS, fragmentShader: SKY_FS(3), side: THREE.BackSide, depthWrite: false });
    skyScene = new THREE.Scene(); const em = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), envMat); em.scale.setScalar(800); skyScene.add(em);
  }
  function applyEnvironment() {
    const t = TOD[todKey] || TOD.golden, w = WEATHER[weatherKey] || WEATHER.fair, sc = SC();
    const night = !!t.night; nightF = night ? 1 : 0;
    const sd = dirFor(night ? t.elev : t.elev, t.az);
    skyUniforms.sunPosition.value.set(sd[0], sd[1], sd[2]);
    skyUniforms.turbidity.value = t.turbidity * (1 + w.dark * 0.6); skyUniforms.rayleigh.value = t.rayleigh; skyUniforms.mieCoefficient.value = t.mie * (1 + w.dark); skyUniforms.mieDirectionalG.value = t.mieG;
    skyUniforms.uCloudCover.value = w.cloud; skyUniforms.uCloudDark.value = w.dark; skyUniforms.uNight.value = night ? 1 : 0; skyUniforms.uWind.value = w.wind || 0.15;
    const lit = t.lit.map(v => v * (1 - w.dark * 0.45)), shade = t.shade.map(v => v * (1 - w.dark * 0.35));
    skyUniforms.uCloudLit.value.set(...lit); skyUniforms.uCloudShade.value.set(...shade);
    if (night) { const md = dirFor(t.moon.elev, t.moon.az); skyUniforms.uMoonDir.value.set(md[0], md[1], md[2]); }
    windU.value = (w.wind || 0.2) + 0.15;
    const P = { turbidity: skyUniforms.turbidity.value, rayleigh: t.rayleigh, mie: skyUniforms.mieCoefficient.value, mieG: t.mieG, gain: skyUniforms.uGain.value };
    let fc = [0, 0, 0];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const d = norm3([Math.sin(a), 0.05, -Math.cos(a)]); const s = skyEvalJS(d, sd, P).color; fc = fc.map((v, k) => v + s[k] / 12); }
    const grey = (fc[0] + fc[1] + fc[2]) / 3; fc = fc.map((v, k) => lerp(v, Math.max(grey * 0.9, shade[k] * 0.55), w.dark * 0.8));
    if (night) fc = [0.025, 0.032, 0.05];
    scene.fog = new THREE.FogExp2(new THREE.Color(fc[0], fc[1], fc[2]), t.fog * w.fog * (sc.water === 'ocean' ? 0.8 : 1));
    envBase.fogColor.copy(scene.fog.color); envBase.fogDensity = scene.fog.density;
    if (night) {
      const md = skyUniforms.uMoonDir.value;
      sunLight.color.setRGB(0.62, 0.7, 0.9); sunLight.intensity = 0.32 * (1 - w.dark * 0.7); sunDirV = [md.x, md.y, md.z];
      hemiLight.color.setRGB(0.3, 0.36, 0.5); hemiLight.groundColor.setRGB(0.06, 0.06, 0.07); hemiLight.intensity = t.hemiI;
    } else {
      const sunS = skyEvalJS(sd, sd, P); const fx = sunS.fex; const mx = Math.max(...fx);
      sunLight.color.setRGB(fx[0] / mx, Math.pow(fx[1] / mx, 0.9), Math.pow(fx[2] / mx, 0.85));
      sunLight.intensity = t.sunI * clamp(sd[1] * 6 + 0.25, 0.25, 1) * w.sun;
      const zen = skyEvalJS([0, 1, 0], sd, P).color, zm = Math.max(...zen);
      hemiLight.color.setRGB(lerp(zen[0] / zm, 0.75, w.dark), lerp(zen[1] / zm, 0.78, w.dark), lerp(zen[2] / zm, 0.82, w.dark));
      hemiLight.groundColor.setRGB(0.32, 0.3, 0.2); hemiLight.intensity = t.hemiI * (1 + w.dark * 0.35);
      sunDirV = sd;
    }
    renderer.toneMappingExposure = t.exposure * (1 + w.dark * 0.25); envBase.exposure = renderer.toneMappingExposure;
    for (const l of lampLights) { l.intensity = night ? 40 : (w.dark > 0.6 ? 8 : 0); l.visible = l.intensity > 0; }  // hidden lights cost nothing in the shaders
    for (const h of lampHeads) h.material.emissiveIntensity = night ? 3 : w.dark > 0.6 ? 1.2 : 0.3;
    if (mats.terrain) { mats.terrain.roughness = w.wet ? 0.7 : sceneryKey === 'winter' ? 0.75 : 0.96; }
    buildPrecip(w.precip);
    regenEnv();
  }
  function regenEnv() {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene, 0.02, 1, 3000);
    scene.environment = envRT.texture;
  }
  // ---------- rain and snow ----------
  function buildPrecip(kind) {
    if (precip) { fxGroup.remove(precip); precip.geometry.dispose(); precip.material.dispose(); precip = null; }
    if (!kind) return;
    const n = Q.precip, box = kind === 'rain' ? 60 : 50;
    const pos = new Float32Array(n * (kind === 'rain' ? 6 : 3)), seed = new Float32Array(n * (kind === 'rain' ? 2 : 1));
    for (let i = 0; i < n; i++) {
      const x = (Math.random() - 0.5) * box, y = Math.random() * box, z = (Math.random() - 0.5) * box, s = Math.random();
      if (kind === 'rain') { pos.set([x, y, z, x, y, z], i * 6); seed[i * 2] = 0; seed[i * 2 + 1] = 1; seed.fill(s, i * 2, i * 2 + 2); }
      else { pos.set([x, y, z], i * 3); seed[i] = s; }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    if (kind === 'rain') { const end = new Float32Array(n * 2); for (let i = 0; i < n; i++) { end[i * 2] = 0; end[i * 2 + 1] = 1; } geo.setAttribute('endp', new THREE.BufferAttribute(end, 1)); }
    const uni = { uTime: { value: 0 }, uCam: { value: new V3() }, uBox: { value: box }, uWind: windU, uVel: { value: new V3() } };
    const vs = kind === 'rain' ? `
      attribute float seed; attribute float endp; uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uWind; uniform vec3 uVel; varying float vA;
      void main() { vec3 p = position; float fall = 18.0 + seed * 6.0;
        p.y = mod(p.y - uTime * fall, uBox); p.x = mod(p.x + uTime * uWind * 6.0 - uCam.x + uBox * 0.5, uBox) - uBox * 0.5; p.z = mod(p.z - uCam.z + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 wp = vec3(p.x + uCam.x, p.y + uCam.y - uBox * 0.45, p.z + uCam.z);
        vec3 vel = vec3(uWind * 6.0, -fall, 0.0) - uVel; wp += normalize(vel) * endp * (0.55 + length(uVel) * 0.012);
        vA = 0.32 * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(p.xz)));
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }` : `
      attribute float seed; uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uWind; varying float vA;
      void main() { vec3 p = position; float fall = 1.2 + seed * 0.9;
        p.y = mod(p.y - uTime * fall, uBox); p.x = mod(p.x + sin(uTime * 0.8 + seed * 20.0) * 0.6 + uTime * uWind * 2.0 - uCam.x + uBox * 0.5, uBox) - uBox * 0.5; p.z = mod(p.z + cos(uTime * 0.7 + seed * 13.0) * 0.6 - uCam.z + uBox * 0.5, uBox) - uBox * 0.5;
        vec3 wp = vec3(p.x + uCam.x, p.y + uCam.y - uBox * 0.45, p.z + uCam.z);
        vA = 0.85 * (1.0 - smoothstep(uBox * 0.3, uBox * 0.5, length(p.xz)));
        vec4 mv = viewMatrix * vec4(wp, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(90.0 / -mv.z, 1.5, 9.0) * (0.6 + seed * 0.6); }`;
    const fs = kind === 'rain' ? `varying float vA; void main() { gl_FragColor = vec4(0.72, 0.78, 0.86, vA); }` : `varying float vA; void main() { vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; gl_FragColor = vec4(1.0, 1.0, 1.0, vA * smoothstep(0.5, 0.15, d)); }`;
    const mat = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, fog: false });
    precip = kind === 'rain' ? new THREE.LineSegments(geo, mat) : new THREE.Points(geo, mat);
    precip.frustumCulled = false; precip.userData.uni = uni; precip.renderOrder = 6;
    fxGroup.add(precip);
  }

  // ---------- geometry helpers for scenery ----------
  function mergeGeos(list) {
    let total = 0; const parts = list.map(it => { const g = it.geo.index ? it.geo.toNonIndexed() : it.geo; total += g.attributes.position.count; return { g, it }; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3); let o = 0;
    for (const { g, it } of parts) {
      const p = g.attributes.position.array; if (!g.attributes.normal) g.computeVertexNormals(); const n = g.attributes.normal.array;
      for (let i = 0; i < g.attributes.position.count; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        pos[(o + i) * 3] = x; pos[(o + i) * 3 + 1] = y; pos[(o + i) * 3 + 2] = z;
        let nn = [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]]; if (it.normalFn) nn = it.normalFn(x, y, z, nn);
        nrm[(o + i) * 3] = nn[0]; nrm[(o + i) * 3 + 1] = nn[1]; nrm[(o + i) * 3 + 2] = nn[2];
        const c = typeof it.color === 'function' ? it.color(x, y, z, nn) : [it.color.r, it.color.g, it.color.b];
        col[(o + i) * 3] = c[0]; col[(o + i) * 3 + 1] = c[1]; col[(o + i) * 3 + 2] = c[2];
      }
      o += g.attributes.position.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere(); return geo;
  }
  function jitter(geo, amt, freq, keep) {
    const p = geo.attributes.position; for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (keep && keep(x, y, z)) continue;
      p.setXYZ(i, x + Noise.n2(x * freq + 3, y * freq) * amt, y + Noise.n2(y * freq, z * freq + 9) * amt * 0.6, z + Noise.n2(z * freq + 5, x * freq) * amt);
    } return geo;
  }
  const lin = h => new THREE.Color(h);
  function treeGeos() {
    const lod = Q.railSeg >= 10 ? 1 : 0, snow = SC().veg.snow, white = [0.93, 0.95, 0.98];
    const snowMix = (c, nn, k = 0.62) => snow && nn[1] > 0.35 ? [lerp(c[0], white[0], k), lerp(c[1], white[1], k), lerp(c[2], white[2], k)] : c;
    const bark = lin(0x4a3a2a), needleA = lin(0x1d361d), needleB = lin(0x355a2b);
    const parts = [{ geo: new THREE.CylinderGeometry(0.14, 0.28, 3.0, 6).translate(0, 1.5, 0), color: bark }];
    Noise.reseed(123);
    for (let i = 0; i < 7; i++) {
      const r = 2.25 - i * 0.29, h = 3.0 - i * 0.17, y = 1.5 + i * 1.5;
      const g = new THREE.ConeGeometry(r, h, 10 + lod * 4, 2, true).translate(0, y + h / 2, 0); jitter(g, 0.3, 1.1, (x, yy) => yy > y + h - 0.05);
      const cy = y + h * 0.4;
      parts.push({ geo: g, color: (x, yy, z, nn) => { const t = clamp((yy - y) / h, 0, 1); const c = needleA.clone().lerp(needleB, t * 0.7 + i * 0.045 + Noise.n2(x * 3, z * 3) * 0.12); const k = 0.62 + t * 0.48; return snowMix([c.r * k, c.g * k, c.b * k], nn); },
        normalFn: (x, yy, z, n) => norm3([x * 0.8 + n[0] * 0.6, (yy - cy) * 0.3 + 0.5, z * 0.8 + n[2] * 0.6]) });
    }
    const conifer = mergeGeos(parts);
    const bark2 = lin(0x56483a), leafA = lin(0x2b4a1a), leafB = lin(0x52742a);
    const dparts = [{ geo: new THREE.CylinderGeometry(0.2, 0.36, 4.4, 7).translate(0, 2.2, 0), color: bark2 },
      { geo: new THREE.CylinderGeometry(0.07, 0.14, 2.8, 5).rotateZ(0.65).translate(0.75, 4.3, 0), color: bark2 },
      { geo: new THREE.CylinderGeometry(0.07, 0.13, 2.6, 5).rotateZ(-0.6).rotateY(2).translate(-0.5, 4.2, 0.5), color: bark2 }];
    const cc = [0, 6.3, 0]; Noise.reseed(777);
    for (let bI = 0; bI < 11; bI++) {
      const a2 = Noise.rand() * Math.PI * 2, e2 = (Noise.rand() - 0.35) * 1.4, rr = bI === 0 ? 0 : 1.3 + Noise.rand() * 0.9;
      const x = Math.cos(a2) * Math.cos(e2) * rr * 1.15, y = cc[1] + Math.sin(e2) * rr * 0.95, z = Math.sin(a2) * Math.cos(e2) * rr * 1.15, r = bI === 0 ? 2.2 : 1.15 + Noise.rand() * 0.75;
      const g = new THREE.IcosahedronGeometry(r, 1 + lod).translate(x, y, z); jitter(g, 0.32, 1.0);
      dparts.push({ geo: g, color: (xx, yy, zz, nn) => { const t = clamp((yy - 4.2) / 4.6, 0, 1); const d = Math.hypot(xx - cc[0], (yy - cc[1]) * 1.2, zz - cc[2]); const c = leafA.clone().lerp(leafB, t * 0.8 + Noise.n2(xx * 1.7, zz * 1.7) * 0.25); const k = 0.55 + t * 0.4 + clamp(d / 3.4, 0, 1) * 0.25; return snowMix([c.r * k, c.g * k, c.b * k], nn, 0.4); },
        normalFn: (xx, yy, zz, n) => norm3([(xx - cc[0]) * 0.6 + n[0] * 0.55, (yy - cc[1]) * 0.6 + n[1] * 0.55 + 0.3, (zz - cc[2]) * 0.6 + n[2] * 0.55]) });
    }
    const decid = mergeGeos(dparts);
    // palm: curved segmented trunk with drooping fronds
    const pparts = [], trunkC = lin(0x8a7458), frondC = lin(0x3f7a2a);
    let px = 0, py = 0; const segs = 7;
    for (let i = 0; i < segs; i++) { const h = 1.25, lean = 0.12 * i; const g = new THREE.CylinderGeometry(0.17 - i * 0.012, 0.22 - i * 0.012, h, 7).translate(0, h / 2, 0).rotateZ(-0.09 * i).translate(px, py, 0); pparts.push({ geo: g, color: (x, y) => { const b = 0.8 + 0.2 * Math.sin(y * 9); return [trunkC.r * b, trunkC.g * b, trunkC.b * b]; } }); px += Math.sin(0.09 * i + 0.05) * h; py += Math.cos(0.09 * i) * h; void lean; }
    for (let f = 0; f < 9; f++) {
      const a = f / 9 * Math.PI * 2; const g = new THREE.ConeGeometry(0.42, 3.6, 4, 1).translate(0, 1.8, 0).scale(1, 1, 0.12).rotateX(0).rotateZ(-1.9 + Noise.n2(f, 2) * 0.3).rotateY(a).translate(px, py, 0);
      pparts.push({ geo: g, color: (x, y, z) => { const t = clamp((y - py + 1.5) / 3, 0, 1); return [frondC.r * (0.7 + t * 0.4), frondC.g * (0.7 + t * 0.4), frondC.b * (0.7 + t * 0.4)]; } });
    }
    pparts.push({ geo: new THREE.SphereGeometry(0.35, 6, 5).translate(px, py - 0.1, 0), color: lin(0x5a4a22) });
    const palm = mergeGeos(pparts);
    // saguaro cactus
    const cact = lin(0x4b7a3a), cparts = [{ geo: new THREE.CapsuleGeometry(0.32, 4.4, 4, 10).translate(0, 2.5, 0), color: cact }];
    for (const [sx, h, up] of [[1, 2.0, 1.6], [-1, 2.8, 1.2]]) { cparts.push({ geo: new THREE.CapsuleGeometry(0.2, 0.7, 3, 8).rotateZ(Math.PI / 2).translate(sx * 0.6, h, 0), color: cact }); cparts.push({ geo: new THREE.CapsuleGeometry(0.2, up, 3, 8).translate(sx * 1.0, h + up / 2, 0), color: cact }); }
    const cactus = mergeGeos(cparts.map(p => ({ ...p, color: (x, y, z, nn) => { const r = 0.85 + 0.15 * Math.sin(Math.atan2(z, x) * 12); return [cact.r * r, cact.g * r, cact.b * r]; } })));
    // grass tuft
    const gp = [], gcol = [];
    const base = lin(0x2f4a18), tip = lin(0x9fb04f);
    for (let b = 0; b < 7; b++) {
      const a = b / 7 * Math.PI + Math.random() * 0.4, h = 0.45 + Math.random() * 0.5, w = 0.05 + Math.random() * 0.03, lean = (Math.random() - 0.5) * 0.35;
      const ox = (Math.random() - 0.5) * 0.25, oz = (Math.random() - 0.5) * 0.25; const ca = Math.cos(a), sa = Math.sin(a);
      gp.push(ox - ca * w, 0, oz - sa * w, ox + ca * w, 0, oz + sa * w, ox + lean * sa, h, oz - lean * ca);
      gcol.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
    const grass = new THREE.BufferGeometry(); grass.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); grass.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    const gn = []; for (let i = 0; i < gp.length / 3; i++) gn.push(0, 1, 0); grass.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
    const rock = jitter(new THREE.IcosahedronGeometry(1, 1), 0.28, 1.3); rock.computeVertexNormals();
    return { conifer, decid, palm, cactus, grass, rock };
  }
  let GEO = null;
  function buildMaterials() {
    const Mt = THREE.MeshStandardMaterial;
    mats.tree = new Mt({ vertexColors: true, roughness: 0.92, metalness: 0 });
    mats.grass = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mats.rock = new Mt({ color: new THREE.Color(SC().rock[0]).multiplyScalar(1.15), roughness: 0.95, map: groundTex });
    mats.paving = new Mt({ color: 0x9c968a, roughness: 0.95, map: groundTex });
    mats.grass.onBeforeCompile = sh => {
      sh.uniforms.uTime = timeU; sh.uniforms.uWind = windU;
      sh.vertexShader = 'uniform float uTime; uniform float uWind;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpI = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = (sin(uTime * 1.6 + wpI.x * 0.09 + wpI.z * 0.07) * 0.13 + sin(uTime * 3.3 + wpI.x * 0.4) * 0.04) * (0.5 + uWind * 1.6);
        transformed.x += sway * position.y; transformed.z += sway * 0.6 * position.y;`);
    };
  }

  // ---------- vegetation ----------
  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); }); if (c.dispose) c.dispose(); } }
  function trackHash(t) {
    const cell = 16, h = new Map();
    for (let k = 0; k < t.n; k += 2) { const x = t.px[k], z = t.pz[k]; const key = Math.floor(x / cell) + ',' + Math.floor(z / cell); let a = h.get(key); if (!a) h.set(key, a = []); a.push(x, z, t.py[k]); }
    return { near(x, z, r) { const cx = Math.floor(x / cell), cz = Math.floor(z / cell), rr = Math.ceil(r / cell); let best = 1e9;
      for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) { const a = h.get((cx + i) + ',' + (cz + j)); if (!a) continue; for (let q = 0; q < a.length; q += 3) { const d = (a[q] - x) ** 2 + (a[q + 1] - z) ** 2; if (d < best) best = d; } }
      return Math.sqrt(best); } };
  }
  const PLAZA = { x: -34, z: 6, r: 46 }, FERRIS = { x: -96, z: 58 };
  function scatterVegetation(t) {
    clearGroup(vegGroup); Noise.reseed(4242);
    const R = Noise.rand; const th = trackHash(t); const sc = SC(), vg = sc.veg;
    const tile = 260; const buckets = new Map();
    const put = (kind, x, z, m, c) => { const key = kind + ':' + Math.floor(x / tile) + ',' + Math.floor(z / tile); let b = buckets.get(key); if (!b) buckets.set(key, b = { kind, mats: [], cols: [] }); b.mats.push(m); b.cols.push(c); };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), col = new THREE.Color(), upv = new V3(0, 1, 0);
    const cx = (t.bounds.x0 + t.bounds.x1) / 2, cz = (t.bounds.z0 + t.bounds.z1) / 2;
    const okGround = (x, z, h) => h >= WATER_Y + (sc.mountains === 'coast' ? 1.6 : 0.5) && Math.hypot(x - PLAZA.x, z - PLAZA.z) >= PLAZA.r && Math.hypot(x - FERRIS.x, z - FERRIS.z) >= 30 && !tunnelGfx.blocked(x, z, 2);
    let placed = 0, tries = 0; const target = Math.round(Q.trees * vg.density);
    const total = vg.conifer + vg.decid + vg.palm + vg.cactus || 1;
    while (placed < target && tries < target * 6) {
      tries++;
      let x, z;
      if (R() < 0.55) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 700; x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; }
      else { const a = R() * Math.PI * 2, r = 300 + Math.sqrt(R()) * 2300; x = VALLEY.cx + Math.cos(a) * r; z = VALLEY.cz + Math.sin(a) * r; }
      const h = terrainHeight(x, z); if (!okGround(x, z, h) || h > 360) continue;
      const slope = Math.hypot(terrainHeight(x + 3, z) - h, terrainHeight(x, z + 3) - h) / 3; if (slope > 0.75) continue;
      const forest = Noise.fbm(x * 0.0042 + 50, z * 0.0042, 3) + (h > 40 ? 0.15 : 0);
      if (vg.cactus < 0.5 && forest < -0.12 + R() * 0.32) continue;
      const d = th.near(x, z, 24); if (d < 9 + R() * 6) continue;
      let pick = R() * total, kind;
      if ((pick -= vg.conifer) < 0 || (h > 70 && vg.conifer > 0.2 && R() < 0.6)) kind = 'conifer'; else if ((pick -= vg.decid) < 0) kind = 'decid'; else if ((pick -= vg.palm) < 0) kind = 'palm'; else kind = 'cactus';
      if (kind === 'palm' && sc.mountains === 'coast') { const dd = (x - VALLEY.cx) * OCEAN.dir[0] + (z - VALLEY.cz) * OCEAN.dir[1]; if (dd < -500 && R() < 0.7) kind = 'decid'; }
      const sc0 = kind === 'conifer' ? 0.75 + R() * 0.8 : kind === 'palm' ? 0.9 + R() * 0.5 : kind === 'cactus' ? 0.7 + R() * 0.6 : 0.8 + R() * 0.55;
      p.set(x, h - 0.25, z); q.setFromAxisAngle(upv, R() * Math.PI * 2); s.set(sc0 * (0.9 + R() * 0.2), sc0 * (0.9 + R() * 0.25), sc0 * (0.9 + R() * 0.2));
      m4.compose(p, q, s);
      if (kind === 'conifer') col.setHSL(0.27 + R() * 0.06, 0.2 + R() * 0.2, 0.38 + R() * 0.14);
      else if (kind === 'decid') { const autumn = R() < vg.autumn; col.setHSL(autumn ? 0.02 + R() * 0.11 : 0.19 + R() * 0.09, autumn ? 0.55 + R() * 0.3 : 0.18 + R() * 0.25, autumn ? 0.42 + R() * 0.14 : 0.36 + R() * 0.14); }
      else col.setHSL(0.25 + R() * 0.05, 0.2, 0.42 + R() * 0.12);
      const cv = kind === 'conifer' ? 2.0 : kind === 'decid' ? 1.85 : 2.1;
      const cc2 = vg.snow && kind !== 'palm' ? [1, 1, 1] : [col.r * cv, col.g * cv, col.b * cv];
      put(kind, x, z, m4.clone(), cc2);
      placed++;
    }
    for (let i = 0, tt = 0; i < Q.bushes * vg.density && tt < Q.bushes * 5; tt++) {
      const k = Math.floor(R() * t.n); const off = (R() < 0.5 ? -1 : 1) * (7 + R() * 40);
      const x = t.px[k] + t.rx[k] * off, z = t.pz[k] + t.rz[k] * off; const h = terrainHeight(x, z);
      if (!okGround(x, z, h) || th.near(x, z, 16) < 5) continue;
      const sc0 = 0.16 + R() * 0.18; p.set(x, h - 0.4, z); q.setFromAxisAngle(upv, R() * 6.28); s.set(sc0 * 1.4, sc0, sc0 * 1.4); m4.compose(p, q, s);
      col.setHSL(vg.cactus > 0.5 ? 0.12 + R() * 0.06 : 0.18 + R() * 0.1, vg.cactus > 0.5 ? 0.25 : 0.35, 0.42 + R() * 0.12);
      put('decid', x, z, m4.clone(), vg.snow ? [1, 1, 1] : [col.r * 2, col.g * 2, col.b * 2]); i++;
    }
    const nGrass = Q.grass * sc.grass;
    for (let i = 0, tt = 0; i < nGrass && tt < nGrass * 3; tt++) {
      let x, z;
      if (R() < 0.85) { const k = Math.floor(R() * t.n); const off = (R() < 0.5 ? -1 : 1) * (1.8 + Math.pow(R(), 1.6) * 70); x = t.px[k] + t.rx[k] * off + (R() - 0.5) * 3; z = t.pz[k] + t.rz[k] * off + (R() - 0.5) * 3; }
      else { const a = R() * 6.28, r = PLAZA.r + R() * 80; x = PLAZA.x + Math.cos(a) * r; z = PLAZA.z + Math.sin(a) * r; }
      const h = terrainHeight(x, z); if (!okGround(x, z, h)) continue;
      const sc0 = 0.7 + R() * 0.9; p.set(x, h - 0.05, z); q.setFromAxisAngle(upv, R() * 6.28); s.set(sc0, sc0 * (0.8 + R() * 0.6), sc0); m4.compose(p, q, s);
      const g = 0.85 + R() * 0.3, tn = sc.grassTint; put('grass', x, z, m4.clone(), [g * tn[0], g * (0.95 + R() * 0.1) * tn[1], g * 0.9 * tn[2]]); i++;
    }
    for (let i = 0; i < Q.rocks * (sc.mountains === 'mesa' ? 1.8 : 1); i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 2400 + 60; const x = VALLEY.cx + Math.cos(a) * r, z = VALLEY.cz + Math.sin(a) * r; const h = terrainHeight(x, z);
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r || th.near(x, z, 12) < 5 || h < WATER_Y - 1 || tunnelGfx.blocked(x, z, 3)) continue;
      const sc0 = (r > 1100 ? 3 + R() * 9 : 0.4 + R() * 1.6); p.set(x, h - sc0 * 0.35, z); q.setFromEuler(te.set(R() * 3, R() * 3, R() * 3)); s.set(sc0 * (0.8 + R() * 0.6), sc0 * (0.5 + R() * 0.4), sc0 * (0.8 + R() * 0.6)); m4.compose(p, q, s);
      const g = 0.8 + R() * 0.35; put('rock', x, z, m4.clone(), vg.snow && R() < 0.6 ? [1.3, 1.32, 1.36] : [g, g * 0.98, g * 0.95]);
    }
    for (const b of buckets.values()) {
      const geo = GEO[b.kind]; const mat = b.kind === 'grass' ? mats.grass : b.kind === 'rock' ? mats.rock : mats.tree;
      const im = new THREE.InstancedMesh(geo, mat, b.mats.length); im.userData.sharedGeo = true;
      for (let i = 0; i < b.mats.length; i++) { im.setMatrixAt(i, b.mats[i]); im.setColorAt(i, col.setRGB(b.cols[i][0], b.cols[i][1], b.cols[i][2])); }
      im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = b.kind !== 'grass' && (b.kind === 'rock' || Q.treeShadow); im.receiveShadow = b.kind !== 'grass' || Q.phys;
      vegGroup.add(im);
    }
  }

  // ---------- park ----------
  function buildPark() {
    clearGroup(parkGroup); lampLights = []; lampHeads = [];
    const hy = terrainHeight(PLAZA.x, PLAZA.z);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.r, 64).rotateX(-Math.PI / 2), mats.paving); plaza.position.set(PLAZA.x, hy + 0.06, PLAZA.z); plaza.receiveShadow = true; parkGroup.add(plaza);
    const bmat = new THREE.MeshStandardMaterial({ color: sceneryKey === 'desert' ? 0xd9b98f : 0xd9cfbf, roughness: 0.9 });
    const rmat = new THREE.MeshStandardMaterial({ color: sceneryKey === 'tropical' ? 0x2a6f7a : 0x7b3b2c, roughness: 0.75 });
    const awnMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(design.colors.rail), roughness: 0.5 });
    const winMat = new THREE.MeshStandardMaterial({ color: 0x223040, emissive: 0xffc77a, emissiveIntensity: 0.0, roughness: 0.3 });
    lampHeads.push({ material: winMat });
    const spots = [[-62, -14, 0.3, 14, 8], [-58, 26, -0.4, 12, 9], [-20, 40, 1.2, 16, 7]];
    for (const [x, z, rot, w, d] of spots) {
      const gh = terrainHeight(x, z); const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), bmat); body.position.y = 2.1; body.castShadow = body.receiveShadow = true; g.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, d * 0.62, w + 0.8, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4), rmat); roof.scale.set(1, 0.45, 1); roof.position.y = 4.2 + d * 0.12; roof.castShadow = true; g.add(roof);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.12, 1.6), awnMat); awn.position.set(0, 2.9, d / 2 + 0.7); awn.rotation.x = 0.2; g.add(awn);
      const win = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.6, 1.4), winMat); win.position.set(0, 1.6, d / 2 + 0.02); g.add(win);
      g.position.set(x, gh, z); g.rotation.y = rot; parkGroup.add(g);
    }
    const lampG = new THREE.CylinderGeometry(0.06, 0.09, 4.5, 6).translate(0, 2.25, 0);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x353a40, metalness: 0.5, roughness: 0.5 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffd9a0, emissiveIntensity: 0.3 }); lampHeads.push({ material: headMat });
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * 6.28; const x = PLAZA.x + Math.cos(a) * (PLAZA.r - 4), z = PLAZA.z + Math.sin(a) * (PLAZA.r - 4);
      const m = new THREE.Mesh(lampG, poleMat); m.position.set(x, terrainHeight(x, z), z); m.castShadow = true; parkGroup.add(m);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 10, 8), headMat); head.position.set(x, terrainHeight(x, z) + 4.6, z); parkGroup.add(head);
      if (i % 2 === 0 && tierResolved !== 'low') { const L = new THREE.PointLight(0xffc98a, 0, 34, 2); L.visible = false; L.position.set(x, terrainHeight(x, z) + 4.4, z); parkGroup.add(L); lampLights.push(L); }
    }
    const fw = new THREE.Group(); const R = 22; const fh = terrainHeight(FERRIS.x, FERRIS.z);
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, metalness: 0.5, roughness: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const len = Math.hypot(R + 3, 9); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, len, 8), legMat);
      leg.position.set(sx * 4.5, (R + 3) / 2, sz * 2.4); leg.rotation.z = -sx * Math.atan2(9, R + 3) * 0.5; leg.rotation.x = sz * 0.08; leg.castShadow = true; fw.add(leg); }
    const wheel = new THREE.Group(); wheel.position.y = R + 3;
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, metalness: 0.5, roughness: 0.35, emissive: 0xff6bd0, emissiveIntensity: 0 }); lampHeads.push({ material: rimMat });
    for (const zz of [-1.2, 1.2]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.28, 8, 96), rimMat); rim.position.z = zz; rim.castShadow = true; wheel.add(rim);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.18, 6, 64), rimMat); rim2.position.z = zz; wheel.add(rim2); }
    const spokeG = new THREE.CylinderGeometry(0.08, 0.08, R, 4).translate(0, R / 2, 0);
    const gondMats = [0xd8433b, 0x2f7fc1, 0xf0b429, 0x3aa776].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));
    const NG = 24; ferris = { wheel, gondolas: [] };
    for (let i = 0; i < NG; i++) {
      const a = i / NG * 6.28; for (const zz of [-1.2, 1.2]) { const sp = new THREE.Mesh(spokeG, rimMat); sp.rotation.z = a; sp.position.z = zz; wheel.add(sp); }
      const gnd = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 1.6), gondMats[i % 4]); const piv = new THREE.Group(); piv.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); gnd.position.y = -1.3; gnd.castShadow = true;
      piv.add(gnd); wheel.add(piv); ferris.gondolas.push(piv);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 16).rotateX(Math.PI / 2), legMat); wheel.add(hub);
    fw.add(wheel); fw.position.set(FERRIS.x, fh, FERRIS.z); fw.rotation.y = 0.6; parkGroup.add(fw);
    // lamp emissive intensities follow time of day
    const night = !!(TOD[todKey] || {}).night;
    headMat.emissiveIntensity = night ? 3 : 0.3; winMat.emissiveIntensity = night ? 1.5 : 0; rimMat.emissiveIntensity = night ? 0.6 : 0;
    lampHeads.length = 0; lampHeads.push({ material: headMat }, { material: winMat, scale: 0.5 }, { material: rimMat, scale: 0.2 });
  }

  // ---------- cameras ----------
  function updateCamera(dt, st, view) {
    if (!trk) return;
    if (view.mode === 'pov') {
      const tt = TRAIN_TYPES[design.train] || TRAIN_TYPES.hyper;
      const seatsPer = trainGfx.seatsPerCar || 1;
      const carIdx = view.seat ? TRAIN.cars - 1 : 0, seatIdx = Math.min(seatsPer - 1, tt.mount === 'wing' ? 0 : Math.max(0, Math.floor(((design.seats || tt.seats) - 1) / 2)));
      const seat = trainGfx.seatWorld(view.train || 0, carIdx, seatIdx, seatM);
      if (seat) {
        trainGfx.setPovSeat(view.train || 0, carIdx, seatIdx);
        const headUp = seat.pose === 'stand' ? 0.86 : 0.8;
        camera.position.set(0, headUp, seat.pose === 'prone' ? -0.05 : 0.02).applyMatrix4(seatM);
        tq.setFromRotationMatrix(seatM);
        if (seat.pose === 'prone') { tq2.setFromAxisAngle(v1.set(1, 0, 0), Math.PI / 2 - 0.25); tq.multiply(tq2); }
      }
      camState.lookYaw += (view.lookYaw - camState.lookYaw) * Math.min(1, dt * 10);
      camState.lookPitch += (view.lookPitch - camState.lookPitch) * Math.min(1, dt * 10);
      const lean = clamp(-(st.lg || 0) * 0.05, -0.12, 0.12);
      const shake = Math.min(1, Math.abs(st.v) / 35) * 0.004;
      te.set(camState.lookPitch + (Math.random() - 0.5) * shake, camState.lookYaw + (Math.random() - 0.5) * shake, lean, 'YXZ');
      tq2.setFromEuler(te); tq.multiply(tq2);
      if (!camState.init || camState.mode !== 'pov') camera.quaternion.copy(tq); else camera.quaternion.slerp(tq, 1 - Math.exp(-dt * 30));
      const fov = 74 + clamp(Math.abs(st.v) * 0.22, 0, 12);
      camState.fov += (fov - camState.fov) * Math.min(1, dt * 2);
    } else {
      trainGfx.clearPov();
      const P = new V3(), T = new V3(), U = new V3(), R = new V3();
      const sm = st.s - TRAIN.len * 0.5;
      trackGfx.frameAt(trk, sm, P, T, U, R);
      let hA = Math.atan2(T.x, -T.z); if (Math.abs(T.y) > 0.97) hA = camState.hS;
      let dh = hA - camState.hS; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      if (!camState.init || camState.mode !== 'follow') camState.hS = hA; else camState.hS += dh * Math.min(1, dt * 1.6);
      const az = camState.hS + Math.PI + view.az, el = view.el, dist = view.dist;
      const target = v1.copy(P); target.y += 1.2;
      const dir = v2.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const want = v3.copy(target).addScaledVector(dir, dist);
      const gy = terrainHeight(want.x, want.z) + 2; if (want.y < gy) want.y = gy;
      // underground or under the lake the orbit camera would only see the ground or the water surface, so it drops
      // into the tunnel and chases the train from inside it
      const kd = trk.tunKind ? trk.tunKind[trk.at(sm)] : 0, buried = kd === TUN.UNDER || kd === TUN.WATER;
      camState.tw = (camState.tw || 0) + ((buried ? 1 : 0) - (camState.tw || 0)) * (camState.init && camState.mode === 'follow' ? Math.min(1, dt * 3) : 1);
      if (camState.tw > 0.001) {
        const uc = trk.tunEnv ? trk.tunEnv.uc : 1, P2 = new V3(), T2 = new V3(), U2 = new V3(), R2 = new V3();
        trackGfx.frameAt(trk, st.s - TRAIN.len - 6, P2, T2, U2, R2);
        const chase = P2.addScaledVector(U2, uc + 0.45), look = new V3().copy(P).addScaledVector(U, uc);
        want.lerp(chase, camState.tw); target.lerp(look, camState.tw);
      }
      if (!camState.init || camState.mode !== 'follow') camState.pos.copy(want); else camState.pos.lerp(want, 1 - Math.exp(-dt * 4));
      if (!camState.init || camState.mode !== 'follow') camState.look.copy(target); else camState.look.lerp(target, 1 - Math.exp(-dt * 10));
      camera.position.copy(camState.pos); camera.up.set(0, 1, 0); camera.lookAt(camState.look);
      camState.fov += (58 - camState.fov) * Math.min(1, dt * 3);
    }
    camState.mode = view.mode; camState.init = true;
    if (Math.abs(camera.fov - camState.fov) > 0.01) { camera.fov = camState.fov; camera.updateProjectionMatrix(); }
  }
  function updateShadowCam() {
    const ext = Q.shadowExt; const sd = sunDirV; const focus = v4.copy(camera.position);
    if (camState.mode === 'follow') focus.lerp(camState.look, 0.6);
    else { const f = new V3(0, 0, -1).applyQuaternion(camera.quaternion); focus.addScaledVector(f, ext * 0.55); }
    const texel = ext * 2 / Q.shadow; focus.x = Math.round(focus.x / texel) * texel; focus.z = Math.round(focus.z / texel) * texel; focus.y = Math.round(focus.y / texel) * texel;
    sunLight.target.position.copy(focus); sunLight.position.set(focus.x + sd[0] * 700, focus.y + Math.max(0.15, sd[1]) * 700, focus.z + sd[2] * 700);
    sunLight.target.updateMatrixWorld();
  }

  // ---------- public ----------
  function applyQuality(key) {
    tierResolved = key === 'auto' ? detectTier() : key; Q = TIERS[tierResolved];
    prMax = Math.min(window.devicePixelRatio || 1, Q.prMax); pr = prMax; prMin = Math.max(0.55, prMax * 0.5);
    renderer.setPixelRatio(pr);
    renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (sunLight) {
      sunLight.shadow.mapSize.set(Q.shadow, Q.shadow); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
      const sc = sunLight.shadow.camera; sc.left = sc.bottom = -Q.shadowExt; sc.right = sc.top = Q.shadowExt; sc.near = 50; sc.far = 1600; sc.updateProjectionMatrix();
    }
  }
  // height of the rendered (uncarved) terrain mesh: linear over its triangles, so it can sit above terrainHeight()
  // in hollows such as the lake bed. The grid is separable (x from i, z from j), so each axis inverts on its own.
  const TER_E = 5200, TER_A = 0.2, terMap = u => Math.sign(u) * TER_E * (TER_A * Math.abs(u) + (1 - TER_A) * Math.abs(u) ** 3);
  function terInv(d, N) { let lo = -1, hi = 1; for (let it = 0; it < 40; it++) { const m = (lo + hi) / 2; if (terMap(m) < d) lo = m; else hi = m; } const f = ((lo + hi) / 2 + 1) / 2 * N, i = clamp(Math.floor(f), 0, N - 1); const x0 = terMap(i / N * 2 - 1), x1 = terMap((i + 1) / N * 2 - 1); return [i, clamp((d - x0) / (x1 - x0), 0, 1)]; }
  function meshHeight(x, z) {
    if (!terrainBaseY) return terrainHeight(x, z);
    const N = Math.round(Math.sqrt(terrainBaseY.length)) - 1, [i, fx] = terInv(x - VALLEY.cx, N), [j, fz] = terInv(z - VALLEY.cz, N), H = (ii, jj) => terrainBaseY[jj * (N + 1) + ii];
    const hA = H(i, j), hB = H(i + 1, j), hC = H(i, j + 1), hD = H(i + 1, j + 1);
    return fx + fz <= 1 ? hA + fx * (hB - hA) + fz * (hC - hA) : hD + (1 - fx) * (hC - hD) + (1 - fz) * (hB - hD);
  }
  const ctx = { terrainHeight, meshHeight, Q: () => Q, design: () => design, get groundTex() { return groundTex; }, get chainTex() { return chainTex; }, get grateTex() { return grateTex; } };
  function init(canvas, quality, env) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(70, 1, 0.08, 14000);
    pmrem = new THREE.PMREMGenerator(renderer);
    sunLight = new THREE.DirectionalLight(0xffffff, 3); sunLight.castShadow = true; sunLight.shadow.bias = -0.00025; sunLight.shadow.normalBias = 0.05;
    scene.add(sunLight); scene.add(sunLight.target);
    hemiLight = new THREE.HemisphereLight(0xbcd2ff, 0x4a4a33, 0.6); scene.add(hemiLight);
    if (env) { todKey = env.tod || todKey; weatherKey = env.weather || weatherKey; sceneryKey = env.scenery || sceneryKey; }
    applyQuality(quality || 'auto');
    groundTextures(); buildMaterials(); GEO = treeGeos();
    trackGfx = createTrackGfx(THREE, { ...ctx, groundTex, chainTex, grateTex });
    trainGfx = createTrains(THREE, { ...ctx, groundTex, frameAt: (...a) => trackGfx.frameAt(...a) });
    tunnelGfx = createTunnelGfx(THREE, ctx);
    buildSky(); buildTerrain(); buildWater(); buildPark();
    scene.add(vegGroup, trackGfx.group, trainGfx.group, parkGroup, fxGroup, tunnelGfx.group, tunnelGfx.stencilGroup);
    applyEnvironment();
  }
  function setTrack(t, opts = {}) {
    trk = t; trackGfx.build(t); buildTunnels(t);
    if (opts.trains !== false) trainGfx.build(design, opts.count || 1);
    if (opts.vegetation !== false) scatterVegetation(t);
  }
  function setDesign(d, rebuild) { design = d; if (rebuild === 'colors') { trackGfx.setColors(d.colors); trainGfx.setColors(d.colors); } }
  function setQuality(key) {
    const prev = tierResolved; applyQuality(key);
    if (TIERS[prev] !== Q) { buildMaterials(); GEO = treeGeos(); buildSky(); buildTerrain(); buildWater(); buildPark(); applyEnvironment(); if (trk) setTrack(trk, { count: trainGfx.count }); }
    return tierResolved;
  }
  // opts.retrack === false: the caller reclassifies the track against the new terrain and calls setTrack itself
  function setEnvironment(env, opts = {}) {
    const sceneryChanged = env.scenery && env.scenery !== sceneryKey;
    if (env.tod) todKey = env.tod; if (env.weather) weatherKey = env.weather; if (env.scenery) sceneryKey = env.scenery;
    if (sceneryChanged) { buildMaterials(); GEO = treeGeos(); buildTerrain(); buildWater(); buildPark(); if (trk && opts.retrack !== false) { trackGfx.build(trk); buildTunnels(trk); scatterVegetation(trk); } }
    applyEnvironment();
  }
  function resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  function frame(dt, states, forces, view) {
    time += dt; timeU.value = time; skyUniforms.uTime.value = time;
    if (!trk) return;
    trainGfx.place(trk, states, forces, dt);
    const st = states[view.train || 0] || states[0];
    updateCamera(dt, { s: st.s, v: st.v, lg: (forces[view.train || 0] || {}).lg || 0 }, view);
    trainGfx.updateRiders(dt, view, camera);
    trackGfx.guides = guides; trackGfx.updateChevrons(time, st.s, view.mode);
    updateTunnelAmbience(dt);
    if (chainTex) chainTex.offset.y -= 4.4 * dt / 0.5;
    if (waterNormal) { waterNormal.offset.x += dt * 0.006; waterNormal.offset.y += dt * 0.004; }
    if (ferris) { ferris.wheel.rotation.z += dt * 0.05; for (const g of ferris.gondolas) g.rotation.z = -ferris.wheel.rotation.z; }
    skyMesh.position.copy(camera.position); skyUniforms.cameraPos.value.copy(camera.position);
    if (precip) { const u = precip.userData.uni; u.uTime.value = time; u.uCam.value.copy(camera.position); }
    // lightning
    const w = WEATHER[weatherKey] || {};
    if (w.lightning) {
      nextFlash -= dt;
      if (nextFlash <= 0) { flash = 1; nextFlash = 5 + Math.random() * 12; if (onThunder) onThunder(0.6 + Math.random() * 2.5); }
    }
    if (flash > 0) { flash = Math.max(0, flash - dt * (flash > 0.5 ? 6 : 2.5)); const f = flash > 0.5 || Math.random() < 0.4 ? flash : flash * 0.3; skyUniforms.uFlash.value = f * 0.9; hemiLight.userData.boost = f; }
    else skyUniforms.uFlash.value = 0;
    updateShadowCam();
  }
  // inside a tunnel: the eye adapts to the lighting, work lights or neon follow the camera, and from an underwater
  // tube the world outside fades into blue-green water
  function updateTunnelAmbience(dt) {
    tunnelGfx.update(dt, time);
    const inside = trk && trk.tunnels && trk.tunnels.length ? tunnelGfx.insideAt(camera.position) : null;
    tunState.inside = inside;
    const L = inside ? inside.tn.props.light : null, water = inside && inside.kind === TUN.WATER, glass = water && inside.tn.props.shell !== 'metal';
    const targetExp = !inside ? 1 : L === 'black' ? (glass ? 0.55 : 0.16) : L === 'neon' ? 0.75 : 0.85;
    tunState.exp += (targetExp - tunState.exp) * Math.min(1, dt * (targetExp < tunState.exp ? 3.5 : 1.6));
    renderer.toneMappingExposure = envBase.exposure * tunState.exp;
    // the water column fades in over a moment, but clears almost at once on leaving the tube (into a bore, a cut or open air)
    tunState.fogMix += ((glass ? 1 : 0) - tunState.fogMix) * Math.min(1, dt * (glass ? 2.5 : 12));
    if (!glass && tunState.fogMix < 0.02) tunState.fogMix = 0;
    if (scene.fog) { scene.fog.color.copy(envBase.fogColor).lerp(UNDERWATER_FOG, tunState.fogMix); scene.fog.density = envBase.fogDensity * (1 + tunState.fogMix * 40) + tunState.fogMix * 0.03; }
    // under the lake the sky is replaced by the colour of the water column
    const deep = tunState.fogMix > 0.5; if (skyMesh.visible === deep) { skyMesh.visible = !deep; scene.background = deep ? scene.fog.color : null; }
    if (tunLight) {
      if (inside && L !== 'black') {
        const f = v1.set(0, 0, -1).applyQuaternion(camera.quaternion); tunLight.position.copy(camera.position).addScaledVector(f, 3).add(v2.set(0, 0.6, 0));
        if (L === 'neon') { const h = (time * 0.25) % 1; tunLight.color.setHSL(h, 1, 0.55); tunLight.intensity = 4 + (((time * 2.3) % 1) > 0.85 ? 16 : 0); }
        else { tunLight.color.set(0xffe2b0); tunLight.intensity = 28; }
      } else tunLight.intensity = 0;
    }
  }
  const UNDERWATER_FOG = new THREE.Color(0x0d4a57);
  function render(dt) {
    const boost = skyUniforms.uFlash.value; const hi = hemiLight.intensity;
    if (boost > 0) hemiLight.intensity = hi + boost * 4;
    renderer.render(scene, camera);
    if (boost > 0) hemiLight.intensity = hi;
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) {
      fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 48) { lowStreak++; highStreak = 0; } else if (fps > 58) { highStreak++; lowStreak = 0; } else { lowStreak = 0; highStreak = 0; }
      if (lowStreak >= 2 && pr > prMin) { pr = Math.max(prMin, pr - 0.15); renderer.setPixelRatio(pr); lowStreak = 0; onResizeCb && onResizeCb(); }
      if (highStreak >= 4 && pr < prMax) { pr = Math.min(prMax, pr + 0.1); renderer.setPixelRatio(pr); highStreak = 0; onResizeCb && onResizeCb(); }
    }
  }
  function stats() { const i = renderer.info; return { fps, pr, tier: tierResolved, tierName: Q.name, tris: i.render.triangles, calls: i.render.calls }; }
  // ground and water seen by the track classifier (tunnels): the uncarved terrain and the water surface where there is water
  const probe = {
    ground: (x, z) => Math.max(terrainHeight(x, z), terrainBaseY ? meshHeight(x, z) : -1e9),   // what is drawn can sit above the shape in hollows
    water: (x, z) => { const sc = SC(); if (sc.water === 'none') return null; if (sc.water !== 'ocean' && Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.35) > LAKE.r * 1.9) return null; return terrainHeight(x, z) < WATER_Y - 0.2 ? WATER_Y : null; }
  };
  return { init, setTrack, setDesign, setQuality, setEnvironment, resize, frame, render, stats, terrainHeight, meshHeight, probe, get tunnelInside() { return tunState.inside; }, get tunnelGap() { return tunnelGfx ? tunnelGfx.gap : Infinity; },
    setGuides: g => { guides = g; }, TIERS, TOD, TOD_ORDER,
    rescatter: t => scatterVegetation(t), rebuildTrains: count => trainGfx.build(design, count),
    get camera() { return camera; }, get scene() { return scene; }, get renderer() { return renderer; }, get tier() { return tierResolved; }, get gpu() { return gpuName; },
    get env() { return { tod: todKey, weather: weatherKey, scenery: sceneryKey }; }, get riderCount() { return trainGfx.riderCount; },
    set onResize(f) { onResizeCb = f; }, set onThunder(f) { onThunder = f; }, get isNight() { return nightF > 0; } };
}
// ===================== END WORLD =====================
