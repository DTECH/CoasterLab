// ===================== SHARE: links, QR codes, files and GitHub Gist sync =====================
const Share = (() => {
  const HOME = 'https://dtech.github.io/CoasterLab/';
  const GIST_FILE = 'coasterlab-designs.json', GIST_DESC = 'CoasterLab saved designs';
  const b64u = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const unb64u = str => { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const s = atob(str); const b = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; };
  async function pipe(bytes, stream) { const s = new Blob([bytes]).stream().pipeThrough(stream); return new Uint8Array(await new Response(s).arrayBuffer()); }
  async function encode(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream !== 'undefined') { try { return 'z' + b64u(await pipe(raw, new CompressionStream('deflate-raw'))); } catch (e) {} }
    return 'j' + b64u(raw);
  }
  async function decode(code) {
    const kind = code[0], bytes = unb64u(code.slice(1));
    const raw = kind === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
    return JSON.parse(new TextDecoder().decode(raw));
  }
  function base() { return /github\.io$/.test(location.hostname) ? location.href.split('#')[0] : HOME; }
  async function link(obj) { return base() + '#d=' + await encode(obj); }
  function codeFrom(text) { const m = /[#&]d=([A-Za-z0-9_-]+)/.exec(text || ''); return m ? m[1] : null; }
  function fromHash() { return codeFrom(location.hash); }
  function clearHash() { try { history.replaceState(null, '', location.href.split('#')[0]); } catch (e) {} }
  let qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    return qrLoading || (qrLoading = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js'; s.onload = () => window.qrcode ? res(window.qrcode) : rej(new Error('QR library missing')); s.onerror = () => { qrLoading = null; rej(new Error('Could not load the QR code library')); }; document.head.appendChild(s); }));
  }
  async function qrSVG(text, dark = '#0d1217', light = '#ffffff') {
    const q = await loadQR(); const qr = q(0, text.length > 1800 ? 'L' : 'M'); qr.addData(text); qr.make();
    const n = qr.getModuleCount(), m = 4, size = n + m * 2; let path = '';
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c + m} ${r + m}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges" role="img" aria-label="QR code for the share link"><rect width="${size}" height="${size}" fill="${light}"/><path d="${path}" fill="${dark}"/></svg>`;
  }
  // Inside a Claude artifact the page has no direct download permission, so saves go through the viewer's
  // downloads capability (the viewer confirms). Everywhere else a normal browser download is used.
  let dlNs;
  async function downloadsNs() { if (dlNs !== undefined) return dlNs; dlNs = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads').catch(() => null) : null; return dlNs; }
  async function download(obj, name) {
    const text = JSON.stringify(obj, null, 1), filename = (name || 'coaster').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.coasterlab.json';
    const dl = await downloadsNs();
    if (dl) { try { await dl.save({ filename, data: text }); return 'saved'; } catch (e) { if (e && e.code === 'declined') return 'declined'; throw new Error(e && e.message || 'Download unavailable'); } }
    const blob = new Blob([text], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    return 'saved';
  }
  // ---- GitHub Gist sync: merges by design name, newest save wins ----
  async function gh(token, path, opts = {}) {
    const r = await fetch('https://api.github.com' + path, { ...opts, headers: { Accept: 'application/vnd.github+json', Authorization: 'Bearer ' + token, 'X-GitHub-Api-Version': '2022-11-28', ...(opts.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (r.status === 401) throw new Error('GitHub rejected the token. Check that it is valid and has the gist permission.');
    if (r.status === 403 || r.status === 404 && opts.method === 'PATCH') throw new Error('GitHub refused the request (' + r.status + '). The token needs the gist permission.');
    if (!r.ok && r.status !== 404) throw new Error('GitHub error ' + r.status);
    return r.status === 404 ? null : r.json();
  }
  function merge(a, b) {
    const map = new Map(); for (const s of [...a, ...b]) { const o = map.get(s.name); if (!o || (s.ts || 0) > (o.ts || 0)) map.set(s.name, s); }
    return [...map.values()].sort((x, y) => (y.ts || 0) - (x.ts || 0)).slice(0, 60);
  }
  async function sync(token, gistId, local) {
    let gist = gistId ? await gh(token, '/gists/' + gistId) : null;
    if (!gist) { const list = await gh(token, '/gists?per_page=100') || []; gist = list.find(g => g.description === GIST_DESC && g.files && g.files[GIST_FILE]) || null; if (gist) gist = await gh(token, '/gists/' + gist.id); }
    let remote = [];
    if (gist && gist.files && gist.files[GIST_FILE]) {
      let content = gist.files[GIST_FILE].content;
      if (gist.files[GIST_FILE].truncated) { const r = await fetch(gist.files[GIST_FILE].raw_url); content = await r.text(); }
      try { const o = JSON.parse(content); remote = Array.isArray(o.slots) ? o.slots : []; } catch (e) { remote = []; }
    }
    const slots = merge(local, remote);
    const body = JSON.stringify({ description: GIST_DESC, files: { [GIST_FILE]: { content: JSON.stringify({ app: 'CoasterLab', version: 2, updated: new Date().toISOString(), slots }) } } });
    const saved = gist ? await gh(token, '/gists/' + gist.id, { method: 'PATCH', body }) : await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), public: false }) });
    return { gistId: saved.id, slots, url: saved.html_url };
  }
  return { encode, decode, link, codeFrom, fromHash, clearHash, qrSVG, download, sync, HOME };
})();
// ===================== END SHARE =====================
