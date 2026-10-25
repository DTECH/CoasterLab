#!/usr/bin/env node
// Dry-runs every built-in preset through the physics core and prints speed and G-force results.
// Exits non-zero if a ride preset stalls or exceeds the rider limits the app warns about.
//   node tools/check_presets.js
const fs = require('fs');
const path = require('path');

const core = fs.readFileSync(path.join(__dirname, '..', 'src', 'core.js'), 'utf8');
const api = new Function(core + '\nreturn { buildTrack, analyzeTrack, getPreset, PRESET_ORDER };')();

const LIMITS = { maxVG: 5.5, minVG: -1.5, maxLG: 1.8 };
let failed = 0;
console.log('preset      nodes  length  top km/h  +G     -G     lat G  airtime  result');
for (const key of api.PRESET_ORDER) {
  const p = api.getPreset(key);
  const trk = api.buildTrack(p.nodes, p.closed);
  const an = api.analyzeTrack(trk);
  const problems = [];
  if (key !== 'blank') {
    if (!an.completes) problems.push(an.stallS != null ? `stalls at ${Math.round(an.stallS)} m` : 'does not finish');
    if (an.maxVG > LIMITS.maxVG) problems.push(`+G ${an.maxVG.toFixed(2)}`);
    if (an.minVG < LIMITS.minVG) problems.push(`-G ${an.minVG.toFixed(2)}`);
    if (an.maxLG > LIMITS.maxLG) problems.push(`lateral ${an.maxLG.toFixed(2)}`);
  }
  if (problems.length) failed++;
  console.log(
    key.padEnd(11), String(p.nodes.length).padStart(5), `${Math.round(trk.Lm)} m`.padStart(7),
    String(Math.round(an.maxV * 3.6)).padStart(9), an.maxVG.toFixed(2).padStart(6), an.minVG.toFixed(2).padStart(6),
    an.maxLG.toFixed(2).padStart(6), `${an.airtime.toFixed(1)} s`.padStart(8), ' ', problems.length ? 'FAIL: ' + problems.join(', ') : (key === 'blank' ? 'skipped' : 'ok')
  );
}
process.exit(failed ? 1 : 0);
