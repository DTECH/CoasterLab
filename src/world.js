// ===================== WORLD: three.js scene, scenery, track, train, cameras =====================
function createWorld(THREE) {
  const V3 = THREE.Vector3;
  let renderer, scene, camera, pmrem, envRT = null;
  let sunLight, hemiLight, skyMesh, skyUniforms, skyScene;
  let terrainMesh, waterMesh, waterNormal, groundTex, groundNrm, chainTex;
  const vegGroup = new THREE.Group(), trackGroup = new THREE.Group(), trainGroup = new THREE.Group(), parkGroup = new THREE.Group();
  let chevron = null, chevData = [];
  let cars = [], wheelGroup = null, ferris = null;
  let Q = null, qualityKey = 'auto', tierResolved = 'medium';
  let trk = null, paintIdx = 0, todKey = 'golden', guides = true;
  let mats = {}; const timeU = { value: 0 }; let gpuName = ''; let sunDirV = [0, 1, 0]; let onResizeCb = null;
  let time = 0, lastTrackForVeg = null;
  let pr = 1, prMax = 1, prMin = 0.6, fpsAcc = 0, fpsN = 0, fpsT = 0, fps = 60, lowStreak = 0, highStreak = 0;
  const camState = { mode: 'follow', az: 0.55, el: 0.32, dist: 30, pos: new V3(40, 30, 40), look: new V3(), hS: 0, lookYaw: 0, lookPitch: 0, fov: 70, init: false };
  const tmp = new THREE.Matrix4(), tq = new THREE.Quaternion(), tq2 = new THREE.Quaternion(), te = new THREE.Euler();
  const v1 = new V3(), v2 = new V3(), v3 = new V3(), v4 = new V3();

  // ---------- quality tiers ----------
  const TIERS = {
    low:    { name: 'Low',    prMax: 1.0, shadow: 1024, shadowExt: 80,  soft: false, trees: 3200,  bushes: 900,  grass: 7000,  rocks: 260, grid: 180, railSeg: 6,  spineSeg: 8,  clouds: 3, treeShadow: false, phys: false },
    medium: { name: 'Medium', prMax: 1.5, shadow: 2048, shadowExt: 110, soft: true,  trees: 7000,  bushes: 2000, grass: 22000, rocks: 420, grid: 260, railSeg: 8,  spineSeg: 10, clouds: 4, treeShadow: true,  phys: false },
    high:   { name: 'High',   prMax: 2.0, shadow: 4096, shadowExt: 150, soft: true,  trees: 13000, bushes: 3500, grass: 48000, rocks: 650, grid: 340, railSeg: 10, spineSeg: 14, clouds: 5, treeShadow: true,  phys: true },
    ultra:  { name: 'Ultra',  prMax: 2.0, shadow: 4096, shadowExt: 190, soft: true,  trees: 22000, bushes: 6000, grass: 85000, rocks: 900, grid: 420, railSeg: 12, spineSeg: 16, clouds: 5, treeShadow: true,  phys: true }
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

  // ---------- terrain ----------
  const VALLEY = { cx: 40, cz: -220, r0: 1150, r1: 2700 };
  const LAKE = { x: -235, z: -190, r: 125, depth: 7 };
  const WATER_Y = -1.5;
  function terrainHeight(x, z) {
    const dx = x - VALLEY.cx, dz = z - VALLEY.cz; const r = Math.hypot(dx, dz);
    let h = Noise.fbm(x * 0.0045, z * 0.0045, 4) * 2.0 - 0.7;
    h += Noise.n2(x * 0.03, z * 0.03) * 0.25;
    const hill = sstep(520, 1150, r);
    if (hill > 0) h += hill * (Noise.fbm(x * 0.0017 + 7.3, z * 0.0017 - 3.1, 5) * 0.5 + 0.55) * 85;
    const m = sstep(VALLEY.r0, VALLEY.r1, r);
    if (m > 0) h += m * (Noise.ridge(x * 0.00085, z * 0.00085, 6) * 640 + 30 + Noise.fbm(x * 0.004, z * 0.004, 3) * 25);
    let ld = Math.hypot(x - LAKE.x, (z - LAKE.z) * 1.35);
    if (ld < LAKE.r * 2) { ld += Noise.n2(x * 0.012, z * 0.012) * 28; const t = sstep(LAKE.r * 1.45, LAKE.r * 0.55, ld); h = lerp(h, -LAKE.depth, t); }
    return h;
  }

  function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function groundTextures() {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'); const img = g.createImageData(S, S); const hgt = new Float32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      // tileable noise via torus mapping
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
    // water normals: sum of periodic waves (tileable)
    const W = 256, wc = makeCanvas(W, W), wg = wc.getContext('2d'), wimg = wg.createImageData(W, W);
    const waves = []; for (let i = 0; i < 18; i++) waves.push([1 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 7) - 3, Math.random() * 6.28, 0.6 / (1 + i * 0.25)]);
    for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
      let dx = 0, dy = 0;
      for (const [kx, ky, ph, amp] of waves) { const arg = (kx * x + ky * y) / W * Math.PI * 2 + ph; const c2 = Math.cos(arg) * amp; dx += c2 * kx; dy += c2 * ky; }
      const n = norm3([-dx * 0.08, -dy * 0.08, 1]); const i = (y * W + x) * 4;
      wimg.data[i] = (n[0] * 0.5 + 0.5) * 255; wimg.data[i + 1] = (n[1] * 0.5 + 0.5) * 255; wimg.data[i + 2] = (n[2] * 0.5 + 0.5) * 255; wimg.data[i + 3] = 255;
    }
    wg.putImageData(wimg, 0, 0);
    waterNormal = new THREE.CanvasTexture(wc); waterNormal.wrapS = waterNormal.wrapT = THREE.RepeatWrapping;
    // chain links
    const cc = makeCanvas(32, 64), cg = cc.getContext('2d');
    cg.fillStyle = '#1b1c1e'; cg.fillRect(0, 0, 32, 64);
    cg.strokeStyle = '#8d9096'; cg.lineWidth = 5;
    cg.beginPath(); cg.roundRect ? cg.roundRect(9, 4, 14, 26, 6) : cg.rect(9, 4, 14, 26); cg.stroke();
    cg.beginPath(); cg.roundRect ? cg.roundRect(9, 34, 14, 26, 6) : cg.rect(9, 34, 14, 26); cg.stroke();
    chainTex = new THREE.CanvasTexture(cc); chainTex.colorSpace = THREE.SRGBColorSpace; chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping;
  }

  function buildTerrain() {
    if (terrainMesh) { scene.remove(terrainMesh); terrainMesh.geometry.dispose(); }
    const N = Q.grid, E = 5200, a = 0.2;
    const map = u => Math.sign(u) * E * (a * Math.abs(u) + (1 - a) * Math.abs(u) ** 3);
    const pos = new Float32Array((N + 1) * (N + 1) * 3), uv = new Float32Array((N + 1) * (N + 1) * 2), col = new Float32Array((N + 1) * (N + 1) * 3);
    let p = 0, q = 0;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
      const x = VALLEY.cx + map(i / N * 2 - 1), z = VALLEY.cz + map(j / N * 2 - 1);
      pos[p++] = x; pos[p++] = terrainHeight(x, z); pos[p++] = z; uv[q++] = x / 7; uv[q++] = z / 7;
    }
    const idx = new (N > 250 ? Uint32Array : Uint32Array)(N * N * 6); let k = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const A = j * (N + 1) + i, B = A + 1, C = A + N + 1, D = C + 1; idx[k++] = A; idx[k++] = C; idx[k++] = B; idx[k++] = B; idx[k++] = C; idx[k++] = D; }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal.array;
    const cGrassA = new THREE.Color(0x4a7424), cGrassB = new THREE.Color(0x67902f), cDry = new THREE.Color(0x8c8c46), cForest = new THREE.Color(0x35541e),
      cSand = new THREE.Color(0x9d8f6c), cMud = new THREE.Color(0x4d4433), cRock = new THREE.Color(0x77726a), cRock2 = new THREE.Color(0x5d5952), cSnow = new THREE.Color(0xeef1f5);
    const c = new THREE.Color();
    for (let v = 0; v < pos.length / 3; v++) {
      const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2], ny = nrm[v * 3 + 1];
      const n1 = Noise.fbm(x * 0.006 + 11, z * 0.006, 3) * 0.5 + 0.5, n2 = Noise.fbm(x * 0.02, z * 0.02 + 5, 2) * 0.5 + 0.5;
      c.copy(cGrassA).lerp(cGrassB, n1);
      c.lerp(cDry, sstep(0.68, 0.92, n2) * 0.28);
      c.lerp(cForest, sstep(0.0, 0.25, Noise.fbm(x * 0.004 + 50, z * 0.004, 3)) * 0.35);
      if (y < WATER_Y + 1.6) c.lerp(cSand, sstep(WATER_Y + 1.6, WATER_Y + 0.3, y));
      if (y < WATER_Y - 0.2) c.lerp(cMud, sstep(WATER_Y - 0.2, WATER_Y - 2.5, y));
      const rockT = sstep(0.86, 0.68, ny) + sstep(240, 420, y) * 0.5;
      if (rockT > 0) c.lerp(n2 > 0.5 ? cRock : cRock2, clamp(rockT, 0, 1));
      const snowT = sstep(330 + n1 * 90, 420 + n1 * 90, y) * sstep(0.6, 0.82, ny);
      if (snowT > 0) c.lerp(cSnow, snowT);
      col[v * 3] = c.r; col[v * 3 + 1] = c.g; col[v * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: groundTex, normalMap: groundNrm, normalScale: new THREE.Vector2(0.55, 0.55), roughness: 0.96, metalness: 0 });
    terrainMesh = new THREE.Mesh(geo, mat); terrainMesh.receiveShadow = true; terrainMesh.name = 'terrain';
    scene.add(terrainMesh);
  }
  function buildWater() {
    const geo = new THREE.CircleGeometry(LAKE.r * 1.9, 96); geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshPhysicalMaterial({ color: 0x0a2129, roughness: 0.1, metalness: 0, ior: 1.33, normalMap: waterNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 0.8 });
    waterNormal.repeat.set(10, 10);
    waterMesh = new THREE.Mesh(geo, mat); waterMesh.position.set(LAKE.x, WATER_Y, LAKE.z); waterMesh.scale.set(1, 1, 1 / 1.35); waterMesh.receiveShadow = true;
    scene.add(waterMesh);
  }

  // ---------- sky ----------
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
    const float pi = 3.141592653589793; const float rayleighZenithLength = 8.4E3; const float mieZenithLength = 1.25E3;
    const float sunAngularDiameterCos = 0.99995; const float THREE_OVER_SIXTEENPI = 0.05968310365946075; const float ONE_OVER_FOURPI = 0.07957747154594767;
    float rayleighPhase(float c) { return THREE_OVER_SIXTEENPI * (1.0 + pow(c, 2.0)); }
    float hgPhase(float c, float g) { float g2 = pow(g, 2.0); float inv = 1.0 / pow(1.0 - 2.0 * g * c + g2, 1.5); return ONE_OVER_FOURPI * ((1.0 - g2) * inv); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
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
      L0 += (vSunE * 19000.0 * Fex) * sundisk;
      vec3 texColor = (Lin + L0) * 0.04 + vec3(0.0, 0.0003, 0.00075);
      vec3 retColor = pow(texColor, vec3(1.0 / (1.2 + (1.2 * vSunfade))));
      // below-horizon: fade to a hazy ground tone so the far edge never shows a seam
      float below = smoothstep(0.0, -0.08, direction.y);
      // clouds
      if (direction.y > 0.0) {
        vec2 cuv = direction.xz / (direction.y + 0.1) * 1.35 + uTime * vec2(0.004, 0.0015);
        float c = fbm(cuv);
        float cov = smoothstep(uCloudCover, uCloudCover + 0.32, c);
        float dens = cov * smoothstep(0.0, 0.22, direction.y);
        float c2 = fbm(cuv + vSunDirection.xz * 0.06);
        float sunAmt = pow(max(cosTheta, 0.0), 8.0);
        vec3 lit = uCloudLit * (0.85 + 0.9 * sunAmt);
        vec3 ccol = mix(lit, uCloudShade, clamp((c2 - c) * 4.0 + 0.35, 0.0, 1.0) * 0.85);
        retColor = mix(retColor, ccol, dens * 0.9);
      }
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
    morning: { label: 'Morning', elev: 15, az: 100, turbidity: 3.2, rayleigh: 1.5, mie: 0.004, mieG: 0.8, cloud: 0.56, sunI: 3.0, hemiI: 0.7, fog: 0.00018, exposure: 0.95, lit: [1.2, 1.12, 1.05], shade: [0.52, 0.56, 0.64] },
    noon:    { label: 'Midday',  elev: 58, az: 165, turbidity: 2.6, rayleigh: 1.1, mie: 0.0035, mieG: 0.78, cloud: 0.54, sunI: 3.3, hemiI: 0.75, fog: 0.00015, exposure: 0.9, lit: [1.28, 1.28, 1.3], shade: [0.6, 0.64, 0.72] },
    golden:  { label: 'Golden Hour', elev: 5, az: 248, turbidity: 8.0, rayleigh: 2.6, mie: 0.006, mieG: 0.84, cloud: 0.55, sunI: 3.0, hemiI: 0.6, fog: 0.0002, exposure: 1.0, lit: [1.45, 1.05, 0.72], shade: [0.48, 0.44, 0.5] },
    dusk:    { label: 'Dusk', elev: 1.6, az: 262, turbidity: 7.5, rayleigh: 2.8, mie: 0.007, mieG: 0.85, cloud: 0.57, sunI: 1.5, hemiI: 0.45, fog: 0.00024, exposure: 1.35, lit: [1.1, 0.6, 0.45], shade: [0.3, 0.27, 0.36] }
  };
  const TOD_ORDER = ['morning', 'noon', 'golden', 'dusk'];
  function sunDirFor(t) { const e = t.elev * DEG, a = t.az * DEG; return [Math.sin(a) * Math.cos(e), Math.sin(e), -Math.cos(a) * Math.cos(e)]; }
  function buildSky() {
    if (skyMesh) { scene.remove(skyMesh); skyMesh.material.dispose(); }
    skyUniforms = {
      sunPosition: { value: new V3(0, 1, 0) }, up: { value: new V3(0, 1, 0) }, turbidity: { value: 4 }, rayleigh: { value: 2 }, mieCoefficient: { value: 0.005 },
      mieDirectionalG: { value: 0.8 }, cameraPos: { value: new V3() }, uTime: { value: 0 }, uCloudCover: { value: 0.55 },
      uCloudLit: { value: new V3(1, 1, 1) }, uCloudShade: { value: new V3(0.5, 0.5, 0.6) }, uGain: { value: 0.62 }
    };
    const mat = new THREE.ShaderMaterial({ uniforms: skyUniforms, vertexShader: SKY_VS, fragmentShader: SKY_FS(Q.clouds), side: THREE.BackSide, depthWrite: false });
    skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), mat); skyMesh.scale.setScalar(9000); skyMesh.renderOrder = -10; skyMesh.frustumCulled = false;
    scene.add(skyMesh);
    // env scene shares all uniforms except the camera position
    const envU = { ...skyUniforms, cameraPos: { value: new V3() } };
    const envMat = new THREE.ShaderMaterial({ uniforms: envU, vertexShader: SKY_VS, fragmentShader: SKY_FS(3), side: THREE.BackSide, depthWrite: false });
    skyScene = new THREE.Scene(); const em = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), envMat); em.scale.setScalar(800); skyScene.add(em);
  }
  function setTimeOfDay(key) {
    todKey = key; const t = TOD[key]; const sd = sunDirFor(t);
    skyUniforms.sunPosition.value.set(sd[0], sd[1], sd[2]);
    skyUniforms.turbidity.value = t.turbidity; skyUniforms.rayleigh.value = t.rayleigh; skyUniforms.mieCoefficient.value = t.mie; skyUniforms.mieDirectionalG.value = t.mieG;
    skyUniforms.uCloudCover.value = t.cloud; skyUniforms.uCloudLit.value.set(...t.lit); skyUniforms.uCloudShade.value.set(...t.shade);
    const P = { turbidity: t.turbidity, rayleigh: t.rayleigh, mie: t.mie, mieG: t.mieG, gain: skyUniforms.uGain.value };
    // fog colour: average of the sky a few degrees above the horizon, all around
    let fc = [0, 0, 0];
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const d = norm3([Math.sin(a), 0.05, -Math.cos(a)]); const s = skyEvalJS(d, sd, P).color; fc = fc.map((v, k) => v + s[k] / 12); }
    scene.fog = new THREE.FogExp2(new THREE.Color(fc[0], fc[1], fc[2]), t.fog);
    const sunS = skyEvalJS(sd, sd, P); const fx = sunS.fex; const mx = Math.max(...fx);
    sunLight.color.setRGB(fx[0] / mx, Math.pow(fx[1] / mx, 0.9), Math.pow(fx[2] / mx, 0.85));
    sunLight.intensity = t.sunI * clamp(sd[1] * 6 + 0.25, 0.25, 1);
    const zen = skyEvalJS([0, 1, 0], sd, P).color, zm = Math.max(...zen);
    hemiLight.color.setRGB(zen[0] / zm, zen[1] / zm, zen[2] / zm); hemiLight.groundColor.setRGB(0.32, 0.3, 0.2); hemiLight.intensity = t.hemiI;
    renderer.toneMappingExposure = t.exposure;
    sunDirV = sd;
    regenEnv();
  }
  function regenEnv() {
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene, 0.02, 1, 3000);
    scene.environment = envRT.texture;
  }

  // ---------- geometry helpers ----------
  function mergeGeos(list) { // list of {geo, color:THREE.Color|fn(x,y,z)->[r,g,b], normalFn?}
    let total = 0; const parts = list.map(it => { const g = it.geo.index ? it.geo.toNonIndexed() : it.geo; total += g.attributes.position.count; return { g, it }; });
    const pos = new Float32Array(total * 3), nrm = new Float32Array(total * 3), col = new Float32Array(total * 3); let o = 0;
    for (const { g, it } of parts) {
      const p = g.attributes.position.array; if (!g.attributes.normal) g.computeVertexNormals(); const n = g.attributes.normal.array;
      for (let i = 0; i < g.attributes.position.count; i++) {
        const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
        pos[(o + i) * 3] = x; pos[(o + i) * 3 + 1] = y; pos[(o + i) * 3 + 2] = z;
        let nn = [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]]; if (it.normalFn) nn = it.normalFn(x, y, z, nn);
        nrm[(o + i) * 3] = nn[0]; nrm[(o + i) * 3 + 1] = nn[1]; nrm[(o + i) * 3 + 2] = nn[2];
        const c = typeof it.color === 'function' ? it.color(x, y, z) : [it.color.r, it.color.g, it.color.b];
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
  function lin(hex) { return new THREE.Color(hex); }
  function treeGeos() {
    const lod = Q.railSeg >= 10 ? 1 : 0;
    // conifer: narrow spruce silhouette from stacked, jittered skirts
    const bark = lin(0x4a3a2a), needleA = lin(0x1d361d), needleB = lin(0x355a2b);
    const parts = [{ geo: new THREE.CylinderGeometry(0.14, 0.28, 3.0, 6).translate(0, 1.5, 0), color: bark }];
    const tiers = 7;
    for (let i = 0; i < tiers; i++) {
      const r = 2.25 - i * 0.29, h = 3.0 - i * 0.17, y = 1.5 + i * 1.5;
      const g = new THREE.ConeGeometry(r, h, 10 + lod * 4, 2, true).translate(0, y + h / 2, 0); jitter(g, 0.3, 1.1, (x, yy) => yy > y + h - 0.05);
      const cy = y + h * 0.4;
      parts.push({ geo: g, color: (x, yy, z) => { const t = clamp((yy - y) / h, 0, 1); const c = needleA.clone().lerp(needleB, t * 0.7 + i * 0.045 + Noise.n2(x * 3, z * 3) * 0.12); const k = 0.62 + t * 0.48; return [c.r * k, c.g * k, c.b * k]; },
        normalFn: (x, yy, z, n) => norm3([x * 0.8 + n[0] * 0.6, (yy - cy) * 0.3 + 0.5, z * 0.8 + n[2] * 0.6]) });
    }
    const conifer = mergeGeos(parts);
    // deciduous: forked trunk under a lumpy, many-lobed crown
    const bark2 = lin(0x56483a), leafA = lin(0x2b4a1a), leafB = lin(0x52742a);
    const dparts = [{ geo: new THREE.CylinderGeometry(0.2, 0.36, 4.4, 7).translate(0, 2.2, 0), color: bark2 },
      { geo: new THREE.CylinderGeometry(0.07, 0.14, 2.8, 5).rotateZ(0.65).translate(0.75, 4.3, 0), color: bark2 },
      { geo: new THREE.CylinderGeometry(0.07, 0.13, 2.6, 5).rotateZ(-0.6).rotateY(2).translate(-0.5, 4.2, 0.5), color: bark2 }];
    const cc = [0, 6.3, 0]; Noise.reseed(777);
    for (let bI = 0; bI < 11; bI++) {
      const a2 = Noise.rand() * Math.PI * 2, e2 = (Noise.rand() - 0.35) * 1.4, rr = bI === 0 ? 0 : 1.3 + Noise.rand() * 0.9;
      const x = Math.cos(a2) * Math.cos(e2) * rr * 1.15, y = cc[1] + Math.sin(e2) * rr * 0.95, z = Math.sin(a2) * Math.cos(e2) * rr * 1.15, r = bI === 0 ? 2.2 : 1.15 + Noise.rand() * 0.75;
      const g = new THREE.IcosahedronGeometry(r, 1 + lod).translate(x, y, z); jitter(g, 0.32, 1.0);
      dparts.push({ geo: g, color: (xx, yy, zz) => { const t = clamp((yy - 4.2) / 4.6, 0, 1); const d = Math.hypot(xx - cc[0], (yy - cc[1]) * 1.2, zz - cc[2]); const c = leafA.clone().lerp(leafB, t * 0.8 + Noise.n2(xx * 1.7, zz * 1.7) * 0.25); const k = 0.55 + t * 0.4 + clamp(d / 3.4, 0, 1) * 0.25; return [c.r * k, c.g * k, c.b * k]; },
        normalFn: (xx, yy, zz, n) => norm3([(xx - cc[0]) * 0.6 + n[0] * 0.55, (yy - cc[1]) * 0.6 + n[1] * 0.55 + 0.3, (zz - cc[2]) * 0.6 + n[2] * 0.55]) });
    }
    const decid = mergeGeos(dparts);
    // grass tuft: crossed tapered blades
    const blades = [];
    const gp = [], gc = [];
    const base = lin(0x2f4a18), tip = lin(0x9fb04f);
    const nb = 7;
    for (let b = 0; b < nb; b++) {
      const a = b / nb * Math.PI + Math.random() * 0.4, h = 0.45 + Math.random() * 0.5, w = 0.05 + Math.random() * 0.03, lean = (Math.random() - 0.5) * 0.35;
      const ox = (Math.random() - 0.5) * 0.25, oz = (Math.random() - 0.5) * 0.25; const ca = Math.cos(a), sa = Math.sin(a);
      const L = [ox - ca * w, 0, oz - sa * w], Rr = [ox + ca * w, 0, oz + sa * w], T = [ox + lean * sa, h, oz - lean * ca];
      gp.push(...L, ...Rr, ...T); gc.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b);
    }
    const grass = new THREE.BufferGeometry(); grass.setAttribute('position', new THREE.Float32BufferAttribute(gp, 3)); grass.setAttribute('color', new THREE.Float32BufferAttribute(gc, 3));
    const gn = []; for (let i = 0; i < gp.length / 3; i++) gn.push(0, 1, 0); grass.setAttribute('normal', new THREE.Float32BufferAttribute(gn, 3));
    const rock = jitter(new THREE.IcosahedronGeometry(1, 1), 0.28, 1.3); rock.computeVertexNormals();
    return { conifer, decid, grass, rock };
  }
  let GEO = null;

  // ---------- materials / paints ----------
  const PAINTS = [
    { name: 'Goliath Red', rail: 0xc22d27, support: 0xe7e3d8, car: 0x1c4f94, trim: 0xf0f0f0 },
    { name: 'Lagoon Teal', rail: 0x158a8c, support: 0x8b949b, car: 0xe5a51b, trim: 0x1d1f22 },
    { name: 'Sunburst', rail: 0xf0731d, support: 0x23334c, car: 0x2b2d31, trim: 0xf0731d },
    { name: 'Midnight Violet', rail: 0x5a3ea6, support: 0x24252b, car: 0xdcdcdc, trim: 0x5a3ea6 },
    { name: 'Classic White', rail: 0xefeee8, support: 0x3a5a8a, car: 0xc12a2f, trim: 0xefeee8 }
  ];
  function buildMaterials() {
    const pt = PAINTS[paintIdx];
    const M = THREE.MeshStandardMaterial;
    mats = {
      rail: new M({ color: pt.rail, metalness: 0.55, roughness: 0.32 }),
      support: new M({ color: pt.support, metalness: 0.45, roughness: 0.45 }),
      footing: new M({ color: 0xa9a49a, roughness: 0.9 }),
      chain: new M({ map: chainTex, metalness: 0.7, roughness: 0.5 }),
      fin: new M({ color: 0xc9a46a, metalness: 0.95, roughness: 0.28, side: THREE.DoubleSide }),
      tyre: new M({ color: 0x151515, roughness: 0.8 }),
      body: Q.phys ? new THREE.MeshPhysicalMaterial({ color: pt.car, metalness: 0.35, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 }) : new M({ color: pt.car, metalness: 0.35, roughness: 0.3 }),
      trim: new M({ color: pt.trim, metalness: 0.3, roughness: 0.4 }),
      seat: new M({ color: 0x30353c, roughness: 0.85 }),
      bar: new M({ color: 0xe8b41f, roughness: 0.45, metalness: 0.1 }),
      chassis: new M({ color: 0x2c2f33, metalness: 0.7, roughness: 0.45 }),
      wheel: new M({ color: 0xd8d4c8, roughness: 0.6 }),
      concrete: new M({ color: 0xb3ada2, roughness: 0.92 }),
      roof: new M({ color: 0x353a40, metalness: 0.5, roughness: 0.5 }),
      accent: new M({ color: pt.rail, metalness: 0.3, roughness: 0.5 }),
      glass: new M({ color: 0x9fb8c8, metalness: 0.1, roughness: 0.08, transparent: true, opacity: 0.45 }),
      paving: new M({ color: 0x9c968a, roughness: 0.95, map: groundTex }),
      tree: new M({ vertexColors: true, roughness: 0.92, metalness: 0 }),
      grass: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      rock: new M({ color: 0x7a766e, roughness: 0.95, map: groundTex })
    };
    mats.grass.onBeforeCompile = sh => {
      sh.uniforms.uTime = timeU;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec4 wpI = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sway = sin(uTime * 1.6 + wpI.x * 0.09 + wpI.z * 0.07) * 0.13 + sin(uTime * 3.3 + wpI.x * 0.4) * 0.04;
        transformed.x += sway * position.y; transformed.z += sway * 0.6 * position.y;`);
    };
  }

  // ---------- vegetation ----------
  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); c.traverse(o => { if (o.geometry && o.geometry !== GEO?.conifer && o.geometry !== GEO?.decid && o.geometry !== GEO?.grass && o.geometry !== GEO?.rock && !o.userData.sharedGeo) o.geometry.dispose(); }); if (c.dispose) c.dispose(); } }
  function trackHash(trk) {
    const cell = 16, h = new Map();
    for (let k = 0; k < trk.n; k += 2) { const x = trk.px[k], z = trk.pz[k]; const key = Math.floor(x / cell) + ',' + Math.floor(z / cell); let a = h.get(key); if (!a) h.set(key, a = []); a.push(x, z, trk.py[k]); }
    return { near(x, z, r) { const cx = Math.floor(x / cell), cz = Math.floor(z / cell), rr = Math.ceil(r / cell); let best = 1e9;
      for (let i = -rr; i <= rr; i++) for (let j = -rr; j <= rr; j++) { const a = h.get((cx + i) + ',' + (cz + j)); if (!a) continue; for (let q = 0; q < a.length; q += 3) { const d = (a[q] - x) ** 2 + (a[q + 1] - z) ** 2; if (d < best) best = d; } }
      return Math.sqrt(best); } };
  }
  const PLAZA = { x: -34, z: 6, r: 46 }, FERRIS = { x: -96, z: 58 };
  function scatterVegetation(trk) {
    clearGroup(vegGroup); Noise.reseed(4242);
    const R = Noise.rand; const th = trackHash(trk);
    const tile = 260; const buckets = new Map();
    const put = (kind, x, z, m, c) => { const key = kind + ':' + Math.floor(x / tile) + ',' + Math.floor(z / tile); let b = buckets.get(key); if (!b) buckets.set(key, b = { kind, mats: [], cols: [] }); b.mats.push(m); b.cols.push(c); };
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V3(), p = new V3(), col = new THREE.Color(), up = new V3(0, 1, 0);
    const cx = (trk.bounds.x0 + trk.bounds.x1) / 2, cz = (trk.bounds.z0 + trk.bounds.z1) / 2;
    const okGround = (x, z, h) => {
      if (h < WATER_Y + 0.5) return false;
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r) return false;
      if (Math.hypot(x - FERRIS.x, z - FERRIS.z) < 30) return false;
      return true;
    };
    let placed = 0, tries = 0; const target = Q.trees;
    while (placed < target && tries < target * 6) {
      tries++;
      let x, z;
      if (R() < 0.55) { const a = R() * Math.PI * 2, r = Math.sqrt(R()) * 700; x = cx + Math.cos(a) * r; z = cz + Math.sin(a) * r; }
      else { const a = R() * Math.PI * 2, r = 300 + Math.sqrt(R()) * 2300; x = VALLEY.cx + Math.cos(a) * r; z = VALLEY.cz + Math.sin(a) * r; }
      const h = terrainHeight(x, z); if (!okGround(x, z, h) || h > 360) continue;
      const slope = Math.hypot(terrainHeight(x + 3, z) - h, terrainHeight(x, z + 3) - h) / 3; if (slope > 0.75) continue;
      const forest = Noise.fbm(x * 0.0042 + 50, z * 0.0042, 3) + (h > 40 ? 0.15 : 0);
      if (forest < -0.12 + R() * 0.32) continue;
      const d = th.near(x, z, 24); if (d < 9 + R() * 6) continue;
      const conifer = h > 70 || R() < 0.42;
      const sc = conifer ? 0.75 + R() * 0.8 : 0.8 + R() * 0.55;
      p.set(x, h - 0.25, z); q.setFromAxisAngle(up, R() * Math.PI * 2); s.set(sc * (0.9 + R() * 0.2), sc * (0.9 + R() * 0.25), sc * (0.9 + R() * 0.2));
      m4.compose(p, q, s);
      if (conifer) col.setHSL(0.27 + R() * 0.06, 0.2 + R() * 0.2, 0.38 + R() * 0.14);
      else { const autumn = R() < 0.12; col.setHSL(autumn ? 0.07 + R() * 0.06 : 0.19 + R() * 0.09, autumn ? 0.6 : 0.18 + R() * 0.25, autumn ? 0.5 : 0.36 + R() * 0.14); }
      // instance colour multiplies the vertex colours: normalise around 1
      const cv = conifer ? 2.0 : 1.85; put(conifer ? 'conifer' : 'decid', x, z, m4.clone(), [col.r * cv, col.g * cv, col.b * cv]);
      placed++;
    }
    // bushes near the track corridor
    for (let i = 0, t = 0; i < Q.bushes && t < Q.bushes * 5; t++) {
      const k = Math.floor(R() * trk.n); const off = (R() < 0.5 ? -1 : 1) * (7 + R() * 40);
      const x = trk.px[k] + trk.rx[k] * off, z = trk.pz[k] + trk.rz[k] * off; const h = terrainHeight(x, z);
      if (!okGround(x, z, h) || th.near(x, z, 16) < 5) continue;
      const sc = 0.16 + R() * 0.18; p.set(x, h - 0.4, z); q.setFromAxisAngle(up, R() * 6.28); s.set(sc * 1.4, sc, sc * 1.4); m4.compose(p, q, s);
      col.setHSL(0.18 + R() * 0.1, 0.35, 0.42 + R() * 0.12); put('decid', x, z, m4.clone(), [col.r * 2, col.g * 2, col.b * 2]); i++;
    }
    // grass tufts: dense along the corridor and around the plaza
    for (let i = 0, t = 0; i < Q.grass && t < Q.grass * 3; t++) {
      let x, z;
      if (R() < 0.85) { const k = Math.floor(R() * trk.n); const off = (R() < 0.5 ? -1 : 1) * (1.8 + Math.pow(R(), 1.6) * 70); x = trk.px[k] + trk.rx[k] * off + (R() - 0.5) * 3; z = trk.pz[k] + trk.rz[k] * off + (R() - 0.5) * 3; }
      else { const a = R() * 6.28, r = PLAZA.r + R() * 80; x = PLAZA.x + Math.cos(a) * r; z = PLAZA.z + Math.sin(a) * r; }
      const h = terrainHeight(x, z); if (!okGround(x, z, h)) continue;
      const sc = 0.7 + R() * 0.9; p.set(x, h - 0.05, z); q.setFromAxisAngle(up, R() * 6.28); s.set(sc, sc * (0.8 + R() * 0.6), sc); m4.compose(p, q, s);
      const g = 0.85 + R() * 0.3; put('grass', x, z, m4.clone(), [g, g * (0.95 + R() * 0.1), g * 0.9]); i++;
    }
    // rocks
    for (let i = 0; i < Q.rocks; i++) {
      const a = R() * 6.28, r = Math.sqrt(R()) * 2400 + 60; const x = VALLEY.cx + Math.cos(a) * r, z = VALLEY.cz + Math.sin(a) * r; const h = terrainHeight(x, z);
      if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < PLAZA.r || th.near(x, z, 12) < 5) continue;
      const sc = (r > 1100 ? 3 + R() * 9 : 0.4 + R() * 1.6); p.set(x, h - sc * 0.35, z); q.setFromEuler(te.set(R() * 3, R() * 3, R() * 3)); s.set(sc * (0.8 + R() * 0.6), sc * (0.5 + R() * 0.4), sc * (0.8 + R() * 0.6)); m4.compose(p, q, s);
      const g = 0.8 + R() * 0.35; put('rock', x, z, m4.clone(), [g, g * 0.98, g * 0.95]);
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
    lastTrackForVeg = trk;
  }

  // ---------- park: plaza, buildings, ferris wheel ----------
  function buildPark() {
    clearGroup(parkGroup);
    const hy = terrainHeight(PLAZA.x, PLAZA.z);
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(PLAZA.r, 64).rotateX(-Math.PI / 2), mats.paving); plaza.position.set(PLAZA.x, hy + 0.06, PLAZA.z); plaza.receiveShadow = true; parkGroup.add(plaza);
    // a few low buildings with pitched roofs
    const bmat = new THREE.MeshStandardMaterial({ color: 0xd9cfbf, roughness: 0.9 });
    const rmat = new THREE.MeshStandardMaterial({ color: 0x7b3b2c, roughness: 0.75 });
    const spots = [[-62, -14, 0.3, 14, 8], [-58, 26, -0.4, 12, 9], [-20, 40, 1.2, 16, 7]];
    for (const [x, z, rot, w, d] of spots) {
      const gh = terrainHeight(x, z); const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(w, 4.2, d), bmat); body.position.y = 2.1; body.castShadow = body.receiveShadow = true; g.add(body);
      const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.1, d * 0.62, w + 0.8, 4, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 4), rmat); roof.scale.set(1, 0.45, 1); roof.position.y = 4.2 + d * 0.12; roof.castShadow = true; g.add(roof);
      const awn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.7, 0.12, 1.6), mats.accent); awn.position.set(0, 2.9, d / 2 + 0.7); awn.rotation.x = 0.2; g.add(awn);
      g.position.set(x, gh, z); g.rotation.y = rot; parkGroup.add(g);
    }
    // lamp posts
    const lampG = new THREE.CylinderGeometry(0.06, 0.09, 4.5, 6).translate(0, 2.25, 0);
    for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28; const x = PLAZA.x + Math.cos(a) * (PLAZA.r - 4), z = PLAZA.z + Math.sin(a) * (PLAZA.r - 4);
      const m = new THREE.Mesh(lampG, mats.roof); m.position.set(x, terrainHeight(x, z), z); m.castShadow = true; parkGroup.add(m);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshStandardMaterial({ color: 0xfff4d6, emissive: 0xffe2a8, emissiveIntensity: 0.6 })); head.position.set(x, terrainHeight(x, z) + 4.6, z); parkGroup.add(head); }
    // ferris wheel
    const fw = new THREE.Group(); const R = 22; const fh = terrainHeight(FERRIS.x, FERRIS.z);
    const legMat = new THREE.MeshStandardMaterial({ color: 0xe9e6de, metalness: 0.5, roughness: 0.4 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const len = Math.hypot(R + 3, 9); const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, len, 8), legMat);
      leg.position.set(sx * 4.5, (R + 3) / 2, sz * 2.4); leg.rotation.z = -sx * Math.atan2(9, R + 3) * 0.5; leg.rotation.x = sz * 0.08; leg.castShadow = true; fw.add(leg); }
    const wheel = new THREE.Group(); wheel.position.y = R + 3;
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, metalness: 0.5, roughness: 0.35 });
    for (const zz of [-1.2, 1.2]) { const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.28, 8, 96), rimMat); rim.position.z = zz; rim.castShadow = true; wheel.add(rim);
      const rim2 = new THREE.Mesh(new THREE.TorusGeometry(R * 0.55, 0.18, 6, 64), rimMat); rim2.position.z = zz; wheel.add(rim2); }
    const spokeG = new THREE.CylinderGeometry(0.08, 0.08, R, 4).translate(0, R / 2, 0);
    const gond = new THREE.Group(); const gondMats = [0xd8433b, 0x2f7fc1, 0xf0b429, 0x3aa776].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.2 }));
    const NG = 24; ferris = { wheel, gondolas: [] };
    for (let i = 0; i < NG; i++) {
      const a = i / NG * 6.28; for (const zz of [-1.2, 1.2]) { const sp = new THREE.Mesh(spokeG, rimMat); sp.rotation.z = a; sp.position.z = zz; wheel.add(sp); }
      const gnd = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.7, 1.6), gondMats[i % 4]); const piv = new THREE.Group(); piv.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); gnd.position.y = -1.3; gnd.castShadow = true;
      piv.add(gnd); wheel.add(piv); ferris.gondolas.push(piv);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 3.4, 16).rotateX(Math.PI / 2), legMat); wheel.add(hub);
    fw.add(wheel); fw.position.set(FERRIS.x, fh, FERRIS.z); fw.rotation.y = 0.6; parkGroup.add(fw);
  }

  // ---------- track ----------
  function frameAt(t, s, P, T, U, R) {
    const g = t.get;
    P.set(g(t.px, s), g(t.py, s), g(t.pz, s)); T.set(g(t.tx, s), g(t.ty, s), g(t.tz, s)).normalize();
    U.set(g(t.ux, s), g(t.uy, s), g(t.uz, s)); U.addScaledVector(T, -U.dot(T)).normalize(); R.crossVectors(T, U).normalize();
  }
  function tubeGeometry(t, offR, offU, radius, radial, from, to, flat) {
    const loop = t.closed && from === 0 && to === t.n;
    const rings = []; for (let k = from; k < to; k++) rings.push(k); if (loop) rings.push(0);
    const nr = rings.length; const pos = new Float32Array(nr * (radial + 1) * 3), nrm = new Float32Array(nr * (radial + 1) * 3), uv = new Float32Array(nr * (radial + 1) * 2);
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
  function runsOf(t, pred) { const out = []; let k = 0; while (k < t.n) { if (pred(t.type[k])) { let e = k; while (e + 1 < t.n && pred(t.type[e + 1])) e++; out.push([Math.max(0, k - 1), Math.min(t.n - 1, e + 1)]); k = e + 1; } else k++; } return out; }
  function boxBetween(a, b, w, h) { const d = new V3().subVectors(b, a); const len = d.length(); const g = new THREE.BoxGeometry(w, h, len); const m = new THREE.Matrix4().lookAt(a, b, new V3(0, 1, 0)); g.applyMatrix4(m); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2); return g; }
  function buildTrackMeshes(t) {
    clearGroup(trackGroup);
    // rails + spine
    const rails = [tubeGeometry(t, -0.55, 0, 0.075, Q.railSeg, 0, t.n), tubeGeometry(t, 0.55, 0, 0.075, Q.railSeg, 0, t.n), tubeGeometry(t, 0, -0.62, 0.3, Q.spineSeg, 0, t.n)];
    for (const g of rails) { const m = new THREE.Mesh(g, mats.rail); m.castShadow = true; m.receiveShadow = true; trackGroup.add(m); }
    // ties: crossbar + braces to the spine
    const tieParts = [
      { geo: new THREE.BoxGeometry(1.22, 0.07, 0.1).translate(0, -0.08, 0), color: lin(0xffffff) },
      { geo: boxBetween(new V3(-0.55, -0.06, 0), new V3(-0.06, -0.5, 0), 0.07, 0.07), color: lin(0xffffff) },
      { geo: boxBetween(new V3(0.55, -0.06, 0), new V3(0.06, -0.5, 0), 0.07, 0.07), color: lin(0xffffff) }
    ];
    const tieGeo = mergeGeos(tieParts); tieGeo.deleteAttribute('color');
    const spacing = 1.3, nt = Math.floor((t.closed ? t.L : t.Lm) / spacing);
    const ties = new THREE.InstancedMesh(tieGeo, mats.rail, nt);
    const P = new V3(), T = new V3(), U = new V3(), R = new V3(), m4 = new THREE.Matrix4(), nT = new V3();
    for (let i = 0; i < nt; i++) { frameAt(t, i * spacing, P, T, U, R); nT.copy(T).negate(); m4.makeBasis(R, U, nT).setPosition(P); ties.setMatrixAt(i, m4); }
    ties.castShadow = true; ties.computeBoundingSphere(); trackGroup.add(ties);
    // supports
    const cols = [], foots = [], braces = [];
    const A = new V3(), G0 = new V3(), up = new V3(0, 1, 0);
    for (let k = 4; k < t.n - 2; k += (t.py[k] > 30 ? 28 : 22)) {
      if (t.uy[k] < 0.55 || t.type[k] === T_STATION) continue;
      P.set(t.px[k], t.py[k], t.pz[k]); U.set(t.ux[k], t.uy[k], t.uz[k]); R.set(t.rx[k], t.ry[k], t.rz[k]);
      A.copy(P).addScaledVector(U, -0.85);
      const gy = terrainHeight(A.x, A.z); const h = A.y - gy; if (h < 0.6) continue;
      const r = 0.26 + Math.min(0.32, h * 0.0034);
      if (h > 24) {
        const rh = v1.set(R.x, 0, R.z).normalize(); const spread = h * 0.17;
        for (const sg of [-1, 1]) { G0.set(A.x + rh.x * spread * sg, 0, A.z + rh.z * spread * sg); G0.y = terrainHeight(G0.x, G0.z) - 0.3; cols.push([G0.clone(), A.clone(), r * 0.85]); foots.push(G0.clone()); }
        const mid = 0.45; const a = v2.copy(cols[cols.length - 2][0]).lerp(A, mid).clone(), b = v3.copy(cols[cols.length - 1][0]).lerp(A, mid).clone(); braces.push([a, b, r * 0.5]);
      } else { G0.set(A.x, gy - 0.3, A.z); cols.push([G0.clone(), A.clone(), r]); foots.push(G0.clone()); }
    }
    const cylG = new THREE.CylinderGeometry(1, 1, 1, Q.railSeg + 2, 1); cylG.translate(0, 0.5, 0);
    const mkCyl = (list, mat) => { if (!list.length) return; const im = new THREE.InstancedMesh(cylG, mat, list.length); im.userData.sharedGeo = false;
      list.forEach(([a, b, r], i) => { const d = v4.subVectors(b, a); const len = d.length(); tq.setFromUnitVectors(up, d.normalize()); m4.compose(a, tq, v1.set(r, len, r)); im.setMatrixAt(i, m4); });
      im.castShadow = true; im.receiveShadow = true; im.computeBoundingSphere(); trackGroup.add(im); };
    mkCyl(cols, mats.support); mkCyl(braces, mats.support);
    if (foots.length) { const fg = new THREE.BoxGeometry(1.7, 0.8, 1.7); const im = new THREE.InstancedMesh(fg, mats.footing, foots.length); foots.forEach((f, i) => { m4.makeTranslation(f.x, f.y + 0.2, f.z); im.setMatrixAt(i, m4); }); im.receiveShadow = true; im.computeBoundingSphere(); trackGroup.add(im); }
    // chain lift ribbon
    const chainRuns = runsOf(t, ty => ty === T_CHAIN);
    if (chainRuns.length) {
      const g = ribbon(t, chainRuns, k => { const c = [t.px[k] - t.ux[k] * 0.07, t.py[k] - t.uy[k] * 0.07, t.pz[k] - t.uz[k] * 0.07]; const w = 0.11;
        return [[c[0] - t.rx[k] * w, c[1] - t.ry[k] * w, c[2] - t.rz[k] * w], [c[0] + t.rx[k] * w, c[1] + t.ry[k] * w, c[2] + t.rz[k] * w], [t.ux[k], t.uy[k], t.uz[k]]]; }, 0.5);
      chainTex.repeat.set(1, 1); const m = new THREE.Mesh(g, mats.chain); m.receiveShadow = true; trackGroup.add(m);
      // chain trough
      for (const [a, b] of chainRuns) { const tg = tubeGeometry(t, 0, -0.16, 0.14, 4, a, b + 1, [1.2, 0.55]); const mm = new THREE.Mesh(tg, mats.chassis); trackGroup.add(mm); }
    }
    // brake fins
    const brRuns = runsOf(t, ty => ty === T_BRAKES);
    if (brRuns.length) {
      const g = ribbon(t, brRuns, k => { const top = -0.12, bot = -0.42; return [[t.px[k] + t.ux[k] * top, t.py[k] + t.uy[k] * top, t.pz[k] + t.uz[k] * top], [t.px[k] + t.ux[k] * bot, t.py[k] + t.uy[k] * bot, t.pz[k] + t.uz[k] * bot], [t.rx[k], t.ry[k], t.rz[k]]]; }, 1);
      const m = new THREE.Mesh(g, mats.fin); m.castShadow = true; trackGroup.add(m);
    }
    // drive tyres (station + transfer)
    const tyreList = []; for (let s = 0; s < (t.closed ? t.L : t.Lm); s += 1.4) { const ty = t.typeAt(s); if (ty === T_STATION || ty === T_TRANSFER) tyreList.push(s); }
    if (tyreList.length) { const tg = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 12).rotateZ(Math.PI / 2); const im = new THREE.InstancedMesh(tg, mats.tyre, tyreList.length);
      tyreList.forEach((s, i) => { frameAt(t, s, P, T, U, R); nT.copy(T).negate(); m4.makeBasis(R, U, nT).setPosition(P.addScaledVector(U, -0.3)); im.setMatrixAt(i, m4); }); im.computeBoundingSphere(); trackGroup.add(im); }
    buildStation(t);
    buildChevrons(t);
  }
  function buildStation(t) {
    const P = new V3(), T = new V3(), U = new V3(), R = new V3();
    const len = Math.max(TRAIN.len + 6, t.stationEnd + 4); const mid = Math.min(t.stationEnd, len) / 2;
    frameAt(t, mid, P, T, U, R);
    const g = new THREE.Group(); const yaw = Math.atan2(-T.x, -T.z);
    const railY = P.y; const gy = terrainHeight(P.x, P.z);
    const platH = Math.max(0.5, railY - 0.35 - gy);
    const mk = (geo, mat, x, y, z, cs = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = cs; m.receiveShadow = true; g.add(m); return m; };
    // raised platforms: slab decks on columns, with a stair down to the plaza
    const deckY = -0.35, under = gy - railY;
    mk(new THREE.BoxGeometry(3.4, 0.45, len), mats.concrete, -2.55, deckY - 0.22, 0);
    mk(new THREE.BoxGeometry(2.2, 0.45, len), mats.concrete, 1.95, deckY - 0.22, 0);
    const colH = Math.max(0.3, deckY - 0.45 - under);
    for (let z = -len / 2 + 1.5; z <= len / 2 - 1.5; z += 4.5) for (const x of [-3.8, -1.3, 1.95]) mk(new THREE.BoxGeometry(0.45, colH, 0.45), mats.concrete, x, under + colH / 2, z);
    const stairLen = Math.max(2, (deckY - under) * 1.6), steps = Math.max(3, Math.round((deckY - under) / 0.2));
    for (let i = 0; i < steps; i++) { const f = i / steps; mk(new THREE.BoxGeometry(1.8, 0.22, stairLen / steps + 0.05), mats.concrete, -5.2, under + (deckY - under) * f + 0.1, len / 2 - 3 - f * stairLen - stairLen / steps / 2); }
    mk(new THREE.BoxGeometry(1.2, Math.max(0.2, railY - gy - 1.2), len), mats.chassis, 0, (gy + railY - 1.2) / 2 - railY, 0, false);
    // railings
    for (const x of [-4.15, 2.95]) { mk(new THREE.BoxGeometry(0.06, 0.06, len), mats.roof, x, -0.35 + 1.0, 0); for (let z = -len / 2; z <= len / 2; z += 2.5) mk(new THREE.BoxGeometry(0.06, 1.0, 0.06), mats.roof, x, -0.35 + 0.5, z); }
    // columns + roof
    const roofY = 4.6;
    for (let z = -len / 2 + 1; z <= len / 2 - 1; z += (len - 2) / 4) for (const x of [-4.0, 2.8]) mk(new THREE.CylinderGeometry(0.16, 0.16, roofY + 0.35, 8), mats.roof, x, (roofY - 0.35) / 2, z);
    const roof = mk(new THREE.BoxGeometry(9.2, 0.28, len + 3), mats.roof, -0.6, roofY, 0); roof.rotation.z = 0.06;
    mk(new THREE.BoxGeometry(9.3, 0.7, 0.3), mats.accent, -0.6, roofY - 0.2, -len / 2 - 1.5);
    mk(new THREE.BoxGeometry(9.3, 0.7, 0.3), mats.accent, -0.6, roofY - 0.2, len / 2 + 1.5);
    // operator booth
    mk(new THREE.BoxGeometry(2.2, 2.4, 2.4), mats.concrete, -5.6, 1.2 - 0.35, len / 2 - 2);
    mk(new THREE.BoxGeometry(2.25, 1.0, 2.45), mats.glass, -5.6, 1.6 - 0.35, len / 2 - 2, false);
    g.position.copy(P); g.rotation.y = yaw;
    trackGroup.add(g);
  }
  function buildChevrons(t) {
    chevData = [];
    const add = (k, dir, colr) => chevData.push({ k, s: k * DS, dir, col: colr });
    const span = 12; let lastTurn = -99, lastDrop = -99;
    for (let k = span; k < t.nm - span; k++) {
      if (t.uy[k] < 0.3 || t.type[k] === T_STATION || t.type[k] === T_CHAIN) continue;
      const rate = (t.heading[k + span] - t.heading[k - span]) / (2 * span * DS) / DEG; // deg per metre
      if (Math.abs(rate) > 0.75 && k - lastTurn >= 14) { add(k, rate > 0 ? 'right' : 'left', 0x22f0ff); lastTurn = k; continue; }
      if (t.ty[k] < -0.45 && k - lastDrop >= 12) { add(k, 'down', 0xff3cf0); lastDrop = k; }
    }
    // loops: one upward marker at each loop entry
    for (let k = 1; k < t.nm - 1; k++) if (t.uy[k] < 0 && t.uy[k - 1] >= 0) { const e = Math.max(0, k - 30); add(e, 'up', 0xffd23c); }
    if (chevron) { trackGroup.remove(chevron); }
    if (!chevData.length) { chevron = null; return; }
    // chevron shape: a ">" in the XY plane
    const sh = new THREE.Shape(); const w = 0.32, L = 1.1, H = 1.0;
    sh.moveTo(-L / 2, H); sh.lineTo(-L / 2 + w * 1.3, H); sh.lineTo(L / 2, 0); sh.lineTo(-L / 2 + w * 1.3, -H); sh.lineTo(-L / 2, -H); sh.lineTo(L / 2 - w * 1.3, 0); sh.closePath();
    const geo = new THREE.ShapeGeometry(sh);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
    chevron = new THREE.InstancedMesh(geo, mat, chevData.length * 3); chevron.frustumCulled = false; chevron.renderOrder = 5;
    const P = new V3(), T = new V3(), U = new V3(), R = new V3(), m4 = new THREE.Matrix4(), rot = new THREE.Matrix4(), c = new THREE.Color();
    const Th = new V3(), Rh = new V3(), Up = new V3(0, 1, 0), back = new V3(), pos = new V3();
    let i = 0;
    for (const d of chevData) {
      frameAt(t, d.s, P, T, U, R);
      Th.set(T.x, 0, T.z); if (Th.lengthSq() < 1e-4) Th.set(0, 0, -1); Th.normalize(); Rh.crossVectors(Th, Up).normalize(); back.copy(Th).negate();
      const ang = d.dir === 'right' ? 0 : d.dir === 'left' ? Math.PI : d.dir === 'down' ? -Math.PI / 2 : Math.PI / 2;
      for (let j = 0; j < 3; j++) {
        pos.copy(P).addScaledVector(Up, 3.3);
        if (d.dir === 'right' || d.dir === 'left') pos.addScaledVector(Rh, (d.dir === 'right' ? 1 : -1) * (j - 1) * 0.95);
        else pos.addScaledVector(Up, (d.dir === 'down' ? -1 : 1) * (j - 1) * 0.85);
        m4.makeBasis(Rh, Up, back).setPosition(pos); m4.multiply(rot.makeRotationZ(ang)); m4.multiply(rot.makeScale(0.8, 0.8, 0.8));
        chevron.setMatrixAt(i, m4); chevron.setColorAt(i, c.setRGB(0, 0, 0)); i++;
      }
    }
    chevron.instanceMatrix.needsUpdate = true; trackGroup.add(chevron);
  }
  function updateChevrons(sTrain, mode) {
    if (!chevron) return; chevron.visible = guides && mode !== 'overview';
    if (!chevron.visible) return;
    const c = new THREE.Color(); let i = 0; const pulse = 0.75 + 0.25 * Math.sin(time * 6);
    for (const d of chevData) {
      let ahead = d.s - sTrain; if (trk.closed && ahead < -50) ahead += trk.L;
      const vis = ahead > 4 && ahead < 230 ? (1 - sstep(140, 230, ahead)) * sstep(4, 18, ahead) : 0;
      for (let j = 0; j < 3; j++) { const b = vis * pulse * (1 - j * 0.18) * 1.6; c.setHex(d.col).multiplyScalar(b); chevron.setColorAt(i++, c); }
    }
    chevron.instanceColor.needsUpdate = true;
  }

  // ---------- train ----------
  function carGeometry(front) {
    const sh = new THREE.Shape();
    if (front) { sh.moveTo(-1.25, 0.3); sh.lineTo(0.95, 0.3); sh.quadraticCurveTo(1.55, 0.32, 1.6, 0.62); sh.quadraticCurveTo(1.55, 1.02, 1.05, 1.02); sh.lineTo(0.62, 0.86); sh.lineTo(-1.25, 0.66); sh.closePath(); }
    else { sh.moveTo(-1.25, 0.3); sh.lineTo(1.15, 0.3); sh.quadraticCurveTo(1.3, 0.32, 1.3, 0.52); sh.lineTo(1.18, 0.72); sh.lineTo(-1.25, 0.66); sh.closePath(); }
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.36, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.07, bevelSegments: 3, curveSegments: 10 });
    g.rotateY(Math.PI / 2); g.translate(-0.68, 0, 0); g.computeVertexNormals(); return g;
  }
  function buildTrain() {
    clearGroup(trainGroup); cars = [];
    const bodyF = carGeometry(true), bodyM = carGeometry(false);
    const seatBack = new THREE.BoxGeometry(0.52, 0.72, 0.12), seatBase = new THREE.BoxGeometry(0.52, 0.12, 0.5), head = new THREE.BoxGeometry(0.34, 0.26, 0.14);
    const barG = new THREE.TorusGeometry(0.15, 0.028, 6, 16, Math.PI); const barStem = new THREE.CylinderGeometry(0.028, 0.028, 0.3, 6);
    const chas = new THREE.BoxGeometry(1.0, 0.16, 2.2), wheelG = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 14).rotateZ(Math.PI / 2), stripe = new THREE.BoxGeometry(0.02, 0.1, 2.0);
    for (let c = 0; c < TRAIN.cars; c++) {
      const g = new THREE.Group(); g.matrixAutoUpdate = false;
      const body = new THREE.Mesh(c === 0 ? bodyF : bodyM, mats.body); body.castShadow = true; body.receiveShadow = true; g.add(body);
      for (const sx of [-0.74, 0.74]) { const st = new THREE.Mesh(stripe, mats.trim); st.position.set(sx, 0.5, 0); g.add(st); }
      const ch = new THREE.Mesh(chas, mats.chassis); ch.position.y = 0.17; g.add(ch);
      for (const zz of [-0.85, 0.85]) for (const xx of [-0.55, 0.55]) { const w = new THREE.Mesh(wheelG, mats.wheel); w.position.set(xx + Math.sign(xx) * -0.0, 0.14, zz); g.add(w); const w2 = new THREE.Mesh(wheelG, mats.wheel); w2.position.set(xx, -0.15, zz); g.add(w2); }
      for (const row of [-0.2, 0.75]) for (const sx of [-0.33, 0.33]) {
        const b = new THREE.Mesh(seatBack, mats.seat); b.position.set(sx, 1.0, row + 0.32); b.rotation.x = -0.12; b.castShadow = true; g.add(b);
        const hr = new THREE.Mesh(head, mats.seat); hr.position.set(sx, 1.46, row + 0.38); g.add(hr);
        const base = new THREE.Mesh(seatBase, mats.seat); base.position.set(sx, 0.7, row + 0.06); g.add(base);
        const bar = new THREE.Mesh(barG, mats.bar); bar.position.set(sx, 0.86, row - 0.24); bar.rotation.x = -Math.PI / 2 + 0.25; g.add(bar);
        const stem = new THREE.Mesh(barStem, mats.bar); stem.position.set(sx, 0.76, row - 0.14); stem.rotation.x = 0.6; g.add(stem);
      }
      trainGroup.add(g); cars.push(g);
    }
  }
  const tP = new V3(), tT = new V3(), tU = new V3(), tR = new V3(), tN = new V3();
  function placeTrain(s) {
    if (!trk) return;
    for (let c = 0; c < cars.length; c++) {
      const sc = s - (c + 0.5) * TRAIN.carLen;
      frameAt(trk, sc, tP, tT, tU, tR); tN.copy(tT).negate();
      cars[c].matrix.makeBasis(tR, tU, tN).setPosition(tP); cars[c].matrixWorldNeedsUpdate = true;
    }
  }

  // ---------- cameras ----------
  function updateCamera(dt, st, view) {
    if (!trk) return;
    const s = st.s;
    if (view.mode === 'pov') {
      const m = cars[view.seat ? cars.length - 1 : 0].matrix;
      camera.position.set(-0.33, 1.42, 0.16).applyMatrix4(m);
      tq.setFromRotationMatrix(m);
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
      const sm = s - TRAIN.len * 0.5;
      frameAt(trk, sm, tP, tT, tU, tR);
      const hA = trk.get(trk.heading, sm);
      let dh = hA - camState.hS; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
      if (!camState.init || camState.mode !== 'follow') camState.hS = hA; else camState.hS += dh * Math.min(1, dt * 1.6);
      const az = camState.hS + Math.PI + view.az, el = view.el, dist = view.dist;
      const target = v1.copy(tP); target.y += 1.2;
      const dir = v2.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      const want = v3.copy(target).addScaledVector(dir, dist);
      const gy = terrainHeight(want.x, want.z) + 2; if (want.y < gy) want.y = gy;
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
    sunLight.target.position.copy(focus); sunLight.position.set(focus.x + sd[0] * 700, focus.y + sd[1] * 700, focus.z + sd[2] * 700);
    sunLight.target.updateMatrixWorld();
  }

  // ---------- public ----------
  function applyQuality(key) {
    qualityKey = key; tierResolved = key === 'auto' ? detectTier() : key; Q = TIERS[tierResolved];
    prMax = Math.min(window.devicePixelRatio || 1, Q.prMax); pr = prMax; prMin = Math.max(0.55, prMax * 0.5);
    renderer.setPixelRatio(pr);
    renderer.shadowMap.type = Q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    if (sunLight) {
      sunLight.shadow.mapSize.set(Q.shadow, Q.shadow); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
      const sc = sunLight.shadow.camera; sc.left = sc.bottom = -Q.shadowExt; sc.right = sc.top = Q.shadowExt; sc.near = 50; sc.far = 1600; sc.updateProjectionMatrix();
    }
  }
  function init(canvas, quality) {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    scene = new THREE.Scene(); camera = new THREE.PerspectiveCamera(70, 1, 0.08, 14000);
    pmrem = new THREE.PMREMGenerator(renderer);
    sunLight = new THREE.DirectionalLight(0xffffff, 3); sunLight.castShadow = true; sunLight.shadow.bias = -0.00025; sunLight.shadow.normalBias = 0.05;
    scene.add(sunLight); scene.add(sunLight.target);
    hemiLight = new THREE.HemisphereLight(0xbcd2ff, 0x4a4a33, 0.6); scene.add(hemiLight);
    applyQuality(quality || 'auto');
    groundTextures(); buildMaterials(); GEO = treeGeos();
    buildSky(); buildTerrain(); buildWater(); buildPark();
    scene.add(vegGroup, trackGroup, trainGroup, parkGroup);
    buildTrain();
    setTimeOfDay(todKey);
  }
  function setTrack(t, opts = {}) {
    trk = t; buildTrackMeshes(t);
    if (opts.vegetation !== false) scatterVegetation(t);
  }
  function setQuality(key) {
    const prev = tierResolved; applyQuality(key);
    if (TIERS[prev] !== Q) {
      buildMaterials(); GEO = treeGeos(); buildSky(); setTimeOfDay(todKey); buildTerrain();
      scene.remove(waterMesh); buildWater(); buildPark(); buildTrain(); if (trk) setTrack(trk);
    }
    return tierResolved;
  }
  function setPaint(i) {
    paintIdx = (i + PAINTS.length) % PAINTS.length; const pt = PAINTS[paintIdx];
    mats.rail.color.setHex(pt.rail); mats.support.color.setHex(pt.support); mats.body.color.setHex(pt.car); mats.trim.color.setHex(pt.trim); mats.accent.color.setHex(pt.rail);
    return pt.name;
  }
  function resize(w, h) { renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); }
  function frame(dt, st, view) {
    time += dt; timeU.value = time; skyUniforms.uTime.value = time;
    if (!trk) return;
    placeTrain(st.s);
    updateCamera(dt, st, view);
    updateChevrons(st.s, view.mode);
    // chain motion
    if (chainTex) chainTex.offset.y -= PHYS.chainSpeed * dt / 0.5;
    if (waterNormal) { waterNormal.offset.x += dt * 0.006; waterNormal.offset.y += dt * 0.004; }
    if (ferris) { ferris.wheel.rotation.z += dt * 0.05; for (const g of ferris.gondolas) g.rotation.z = -ferris.wheel.rotation.z; }
    skyMesh.position.copy(camera.position); skyUniforms.cameraPos.value.copy(camera.position);
    updateShadowCam();
  }
  function render(dt) {
    renderer.render(scene, camera);
    // dynamic resolution
    fpsAcc += dt; fpsN++;
    if (fpsAcc > 1) {
      fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
      if (fps < 48) { lowStreak++; highStreak = 0; } else if (fps > 58) { highStreak++; lowStreak = 0; } else { lowStreak = 0; highStreak = 0; }
      if (lowStreak >= 2 && pr > prMin) { pr = Math.max(prMin, pr - 0.15); renderer.setPixelRatio(pr); lowStreak = 0; onResizeCb && onResizeCb(); }
      if (highStreak >= 4 && pr < prMax) { pr = Math.min(prMax, pr + 0.1); renderer.setPixelRatio(pr); highStreak = 0; onResizeCb && onResizeCb(); }
    }
  }
  function stats() { const i = renderer.info; return { fps, pr, tier: tierResolved, tierName: Q.name, tris: i.render.triangles, calls: i.render.calls }; }
  function cycleTime() { const i = TOD_ORDER.indexOf(todKey); setTimeOfDay(TOD_ORDER[(i + 1) % TOD_ORDER.length]); return TOD[todKey].label; }
  return { init, setTrack, setQuality, setPaint, resize, frame, render, stats, cycleTime, setTimeOfDay, terrainHeight,
    setGuides: g => { guides = g; }, todLabel: () => TOD[todKey].label, paintName: () => PAINTS[paintIdx].name, PAINTS, TIERS,
    get camera() { return camera; }, get renderer() { return renderer; }, get tier() { return tierResolved; }, get todKey() { return todKey; }, set todKeyInit(k) { todKey = k; }, set paintInit(i) { paintIdx = i; }, get gpu() { return gpuName; }, set onResize(f) { onResizeCb = f; }, rescatter: t => scatterVegetation(t) };
}
// ===================== END WORLD =====================
