#!/usr/bin/env node
// Dry-runs every built-in preset through the physics core with its own train type and prints speed, G-force,
// inversions and track clearance. Exits non-zero if a preset stalls, exceeds the rider limits the app warns
// about, or has a section of track running through another.
//   node tools/check_presets.js
const fs = require('fs');
const path = require('path');

const src = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const api = new Function(src('core.js') + src('elements.js') + src('designs.js') +
  '\nreturn { buildTrack, analyzeTrack, trackClearance, getPreset, PRESET_ORDER, setTrainSpec, trainSpecFor, defaultDesign, TRAIN };')();

const LIMITS = { maxVG: 5.5, minVG: -1.5, maxLG: 1.8 };
let failed = 0;
console.log('preset      train        nodes  length  km/h   +G     -G   lat G  inv  air s  result');
for (const key of api.PRESET_ORDER) {
  const p = api.getPreset(key);
  const d = api.defaultDesign((p.style && p.style.train) || 'hyper');
  api.setTrainSpec(api.trainSpecFor(d));
  const trk = api.buildTrack(p.nodes, p.closed);
  const an = api.analyzeTrack(trk);
  const clr = api.trackClearance(trk);
  const prone = api.TRAIN.prone, hi = prone ? -an.minVG : an.maxVG, lo = prone ? -an.maxVG : an.minVG;
  const problems = [];
  if (key !== 'blank') {
    if (!an.completes) problems.push(an.stallS != null ? `stalls at ${Math.round(an.stallS)} m` : 'does not finish');
    if (hi > LIMITS.maxVG) problems.push(`+G ${hi.toFixed(2)}`);
    if (lo < LIMITS.minVG) problems.push(`-G ${lo.toFixed(2)}`);
    if (an.maxLG > LIMITS.maxLG) problems.push(`lateral ${an.maxLG.toFixed(2)}`);
    if (clr.conflicts.length) problems.push(`${clr.conflicts.length} clash${clr.conflicts.length > 1 ? 'es' : ''} (${clr.conflicts.map(c => Math.round(c.s) + '/' + Math.round(c.s2) + ' m').join(', ')})`);
  }
  if (problems.length) failed++;
  console.log(
    key.padEnd(11), d.train.padEnd(12), String(p.nodes.length).padStart(5), `${Math.round(trk.Lm)} m`.padStart(7),
    String(Math.round(an.maxV * 3.6)).padStart(5), hi.toFixed(2).padStart(6), lo.toFixed(2).padStart(6),
    an.maxLG.toFixed(2).padStart(6), String(an.inversions).padStart(4), an.airtime.toFixed(1).padStart(6), ' ',
    problems.length ? 'FAIL: ' + problems.join(', ') : (key === 'blank' ? 'skipped' : 'ok')
  );
}
process.exit(failed ? 1 : 0);
