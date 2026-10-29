// ===================== DESIGNS: trains, track styles, scenery, weather (plain data) =====================
// mount: top (riders above the rails), below (hanging under the track), swing (hanging, free to swing),
//        wing (seats outboard on both sides of the rails)
// pose:  sit, stand, prone (flying), hang (seated, legs dangling)
const TRAIN_TYPES = {
  hyper:     { label: 'Hyper (open air, T-bar)', cars: 6, rows: 2, seats: 2, seatW: 0.62, rowPitch: 1.12, mount: 'top', pose: 'sit', restraint: 'tbar', body: 'hyper', hl: 1.15, envOff: 1.0, envR: 1.7, mass: 1100, track: 'tubular' },
  looping:   { label: 'Looping (shoulder harness)', cars: 7, rows: 1, seats: 4, seatW: 0.6, rowPitch: 1.2, mount: 'top', pose: 'sit', restraint: 'otsr', body: 'looper', hl: 1.15, envOff: 1.0, envR: 1.8, mass: 900, track: 'box' },
  floorless: { label: 'Floorless (feet dangling)', cars: 8, rows: 1, seats: 4, seatW: 0.6, rowPitch: 1.2, mount: 'top', pose: 'hang', restraint: 'otsr', body: 'floorless', hl: 1.25, envOff: 0.9, envR: 1.8, mass: 850, track: 'box' },
  standup:   { label: 'Stand-up', cars: 7, rows: 1, seats: 4, seatW: 0.6, rowPitch: 1.15, mount: 'top', pose: 'stand', restraint: 'standup', body: 'standup', hl: 1.8, envOff: 1.3, envR: 2.0, mass: 850, track: 'box' },
  inverted:  { label: 'Inverted (hanging, ski-lift seats)', cars: 8, rows: 1, seats: 4, seatW: 0.62, rowPitch: 1.25, mount: 'below', pose: 'hang', restraint: 'otsr', body: 'inverted', hl: -1.35, envOff: -1.55, envR: 1.9, mass: 950, track: 'box' },
  suspended: { label: 'Suspended (swinging cars)', cars: 6, rows: 2, seats: 2, seatW: 0.62, rowPitch: 1.05, mount: 'swing', pose: 'sit', restraint: 'lap', body: 'suspended', hl: -1.75, envOff: -1.9, envR: 2.1, mass: 1000, track: 'tubular' },
  flying:    { label: 'Flying (riders lie face down)', cars: 8, rows: 1, seats: 4, seatW: 0.62, rowPitch: 1.35, mount: 'below', pose: 'prone', restraint: 'vest', body: 'flying', hl: -1.0, envOff: -1.15, envR: 1.8, mass: 950, prone: true, track: 'box' },
  wing:      { label: 'Wing (seats beside the track)', cars: 7, rows: 1, seats: 4, seatW: 0.62, rowPitch: 1.3, mount: 'wing', pose: 'hang', restraint: 'otsr', body: 'wing', hl: 0.45, envOff: 0.3, envR: 2.9, mass: 1000, track: 'box' },
  dive:      { label: 'Dive machine (wide rows)', cars: 3, rows: 2, seats: 8, seatW: 0.6, rowPitch: 1.25, mount: 'top', pose: 'hang', restraint: 'otsr', body: 'dive', hl: 1.3, envOff: 1.0, envR: 2.7, mass: 2600, track: 'box' },
  fourd:     { label: '4th Dimension (rotating seats)', cars: 6, rows: 1, seats: 4, seatW: 0.66, rowPitch: 1.6, mount: 'wing', pose: 'hang', restraint: 'otsr', body: 'fourd', hl: 0.2, envOff: 0.1, envR: 3.0, mass: 1400, spinSeats: true, track: 'truss' },
  bobsled:   { label: 'Bobsled (free-running sleds)', cars: 5, rows: 2, seats: 2, seatW: 0.55, rowPitch: 0.95, mount: 'top', pose: 'sit', restraint: 'lap', body: 'bobsled', hl: 1.0, envOff: 0.9, envR: 1.6, mass: 750, sled: true, track: 'trough' },
  mouse:     { label: 'Wild mouse (single cars)', cars: 1, rows: 2, seats: 2, seatW: 0.58, rowPitch: 0.95, mount: 'top', pose: 'sit', restraint: 'lap', body: 'mouse', hl: 1.15, envOff: 1.0, envR: 1.6, mass: 900, track: 'flat' },
  mine:      { label: 'Mine train', cars: 6, rows: 2, seats: 2, seatW: 0.58, rowPitch: 1.0, mount: 'top', pose: 'sit', restraint: 'lap', body: 'mine', hl: 1.1, envOff: 0.95, envR: 1.6, mass: 900, track: 'tubular' },
  wooden:    { label: 'Classic wooden (PTC)', cars: 6, rows: 2, seats: 2, seatW: 0.6, rowPitch: 1.0, mount: 'top', pose: 'sit', restraint: 'lap', body: 'ptc', hl: 1.1, envOff: 0.95, envR: 1.6, mass: 1000, track: 'wood' },
  spinning:  { label: 'Spinning cars', cars: 4, rows: 2, seats: 2, seatW: 0.58, rowPitch: 0.9, mount: 'top', pose: 'sit', restraint: 'lap', body: 'spinner', hl: 1.15, envOff: 1.0, envR: 2.0, mass: 900, spin: true, track: 'flat' }
};
const TRAIN_ORDER = ['hyper', 'looping', 'floorless', 'standup', 'inverted', 'suspended', 'flying', 'wing', 'dive', 'fourd', 'bobsled', 'mouse', 'mine', 'wooden', 'spinning'];
const TRACK_STYLES = {
  tubular: { label: 'Steel tubular, single spine' },
  box: { label: 'Steel box spine (B&M style)' },
  truss: { label: 'Steel triangle truss (Intamin style)' },
  ibox: { label: 'Hybrid I-Box steel on wood' },
  wood: { label: 'Wooden, laminated with flat steel' },
  flat: { label: 'Flat steel (wild mouse)' },
  trough: { label: 'Bobsled trough' }
};
const SUPPORT_STYLES = { steel: 'Steel columns', box: 'Square steel columns', wood: 'Wooden lattice', none: 'None (floating)' };
const CAR_PATTERNS = { solid: 'Solid', stripe: 'Racing stripe', split: 'Two-tone', flame: 'Flames', checker: 'Checker', number: 'Numbers' };
const PAINT_SCHEMES = [
  { name: 'Goliath Red', rail: '#c22d27', spine: '#c22d27', support: '#e7e3d8', body: '#1c4f94', accent: '#f0f0f0', seat: '#2a2e34', restraint: '#e8b41f' },
  { name: 'Lagoon Teal', rail: '#158a8c', spine: '#158a8c', support: '#8b949b', body: '#e5a51b', accent: '#1d1f22', seat: '#25282c', restraint: '#1d1f22' },
  { name: 'Sunburst', rail: '#f0731d', spine: '#23334c', support: '#23334c', body: '#2b2d31', accent: '#f0731d', seat: '#1e2126', restraint: '#f0731d' },
  { name: 'Midnight Violet', rail: '#5a3ea6', spine: '#5a3ea6', support: '#24252b', body: '#dcdcdc', accent: '#5a3ea6', seat: '#262833', restraint: '#5a3ea6' },
  { name: 'Classic White', rail: '#efeee8', spine: '#efeee8', support: '#3a5a8a', body: '#c12a2f', accent: '#efeee8', seat: '#2b2b2b', restraint: '#c9c9c9' },
  { name: 'Lime Fury', rail: '#7bc12f', spine: '#2b2b2b', support: '#2b2b2b', body: '#7bc12f', accent: '#111111', seat: '#1b1b1b', restraint: '#7bc12f' },
  { name: 'Timber', rail: '#7a7a7a', spine: '#8a6a45', support: '#a98b62', body: '#7a1f1f', accent: '#e3c27a', seat: '#3b2a1d', restraint: '#c9c9c9' }
];
function defaultDesign(trainKey = 'hyper', paint = 0) {
  const tt = TRAIN_TYPES[trainKey] || TRAIN_TYPES.hyper, p = PAINT_SCHEMES[paint] || PAINT_SCHEMES[0];
  return { train: trainKey, cars: tt.cars, rows: tt.rows, seats: tt.seats, trains: 1, pattern: 'stripe', riders: true, occupancy: 0.85, lights: false, catwalks: true,
    track: tt.track, supports: tt.track === 'wood' || tt.track === 'ibox' ? 'wood' : tt.track === 'box' ? 'box' : 'steel', paint,
    colors: { rail: p.rail, spine: p.spine, support: p.support, body: p.body, accent: p.accent, seat: p.seat, restraint: p.restraint } };
}
// Space the train sweeps in its own cross-section, measured from the car and rider models with arms raised:
// [half width, lowest point, highest point] in metres relative to the rails (positive is toward the riders' heads
// for cars on top of the track). Supports, catwalks and the station are kept out of it.
const ENV_BOX = {
  hyper: [0.95, -0.35, 2.05], looping: [1.5, -0.35, 2.05], floorless: [1.5, -0.35, 2.15], standup: [1.5, -0.35, 2.7],
  inverted: [1.55, -2.5, 0.45], suspended: [2.6, -2.9, 0.45], flying: [1.55, -1.95, 0.45], wing: [2.05, -0.7, 1.35],
  dive: [2.7, -0.35, 2.6], fourd: [2.25, -1.15, 1.25], bobsled: [1.2, -0.1, 1.9], mouse: [0.9, -0.35, 2.0],
  mine: [0.95, -0.35, 2.0], wooden: [0.95, -0.35, 2.0], spinning: [1.4, -0.35, 2.05]
};
function envBoxFor(train, seats) {
  const tt = TRAIN_TYPES[train] || TRAIN_TYPES.hyper, b = (ENV_BOX[train] || ENV_BOX.hyper).slice();
  if (seats && seats !== tt.seats) b[0] = Math.max(0.9, b[0] + (seats - tt.seats) * tt.seatW / (tt.mount === 'wing' ? 2 : 2));
  return b;
}
// physics spec for the core simulation from a design
function trainSpecFor(d) {
  const tt = TRAIN_TYPES[d.train] || TRAIN_TYPES.hyper;
  const rows = clamp(d.rows || tt.rows, 1, 3), cars = clamp(d.cars || tt.cars, 1, 10);
  const carLen = Math.max(1.8, rows * tt.rowPitch + 0.5);
  const seats = d.seats || tt.seats;
  return { cars, carLen, massPerCar: tt.mass * (rows * seats) / (tt.rows * tt.seats), hl: tt.hl, envOff: tt.envOff, envR: tt.envR, prone: !!tt.prone, box: envBoxFor(d.train, seats) };
}

const SCENERY = {
  alpine:   { label: 'Alpine valley', ground: ['#4a7424', '#67902f', '#8c8c46', '#35541e'], sand: '#9d8f6c', rock: ['#77726a', '#5d5952'], snowLine: 330, mountains: 'ridge', water: 'lake', veg: { conifer: 0.55, decid: 0.45, palm: 0, cactus: 0, autumn: 0.12, snow: false, density: 1 }, grass: 1, grassTint: [0.85, 0.95, 0.85] },
  autumn:   { label: 'Autumn forest', ground: ['#5e6a2c', '#7a7a33', '#9a7a3e', '#4a4d22'], sand: '#8f7d5a', rock: ['#6f6a62', '#55514b'], snowLine: 9999, mountains: 'hills', water: 'lake', veg: { conifer: 0.25, decid: 0.75, palm: 0, cactus: 0, autumn: 0.8, snow: false, density: 1.2 }, grass: 0.8, grassTint: [1.05, 0.9, 0.6] },
  desert:   { label: 'Desert canyon', ground: ['#c28a55', '#d4a06a', '#b9774a', '#a8683f'], sand: '#e0b47e', rock: ['#a65a36', '#8a4a2e'], snowLine: 9999, mountains: 'mesa', water: 'none', veg: { conifer: 0, decid: 0.05, palm: 0.08, cactus: 0.87, autumn: 0, snow: false, density: 0.16 }, grass: 0.12, grassTint: [1.3, 1.05, 0.55] },
  tropical: { label: 'Tropical coast', ground: ['#4f8a2c', '#6aa133', '#9a9e4c', '#3c6e22'], sand: '#e9d6a6', rock: ['#7e7768', '#5e594e'], snowLine: 9999, mountains: 'coast', water: 'ocean', veg: { conifer: 0, decid: 0.3, palm: 0.7, cactus: 0, autumn: 0, snow: false, density: 0.9 }, grass: 1, grassTint: [0.85, 1.05, 0.75] },
  winter:   { label: 'Snowy winter', ground: ['#e8edf2', '#dfe6ee', '#cfd8e2', '#c9d3dd'], sand: '#d9e0e8', rock: ['#6e7178', '#55585e'], snowLine: -100, mountains: 'ridge', water: 'frozen', veg: { conifer: 0.85, decid: 0.15, palm: 0, cactus: 0, autumn: 0, snow: true, density: 0.9 }, grass: 0.05, grassTint: [1, 1, 1] },
  plains:   { label: 'Open plains', ground: ['#6f9134', '#88a83e', '#a5a253', '#56772a'], sand: '#a39a70', rock: ['#7a756c', '#605c55'], snowLine: 9999, mountains: 'flat', water: 'lake', veg: { conifer: 0.2, decid: 0.8, palm: 0, cactus: 0, autumn: 0.05, snow: false, density: 0.45 }, grass: 1.3, grassTint: [1, 1, 0.8] }
};
const SCENERY_ORDER = ['alpine', 'autumn', 'desert', 'tropical', 'winter', 'plains'];
// cloud: coverage threshold (lower = more cloud), dark: cloud darkness, fog: fog multiplier
const WEATHER = {
  clear:    { label: 'Clear', cloud: 0.82, dark: 0, fog: 0.8, sun: 1 },
  fair:     { label: 'Fair weather clouds', cloud: 0.56, dark: 0.05, fog: 1, sun: 1 },
  cloudy:   { label: 'Mostly cloudy', cloud: 0.38, dark: 0.3, fog: 1.3, sun: 0.75 },
  overcast: { label: 'Overcast', cloud: 0.12, dark: 0.55, fog: 1.8, sun: 0.35 },
  rain:     { label: 'Rain', cloud: 0.1, dark: 0.7, fog: 2.6, sun: 0.25, precip: 'rain', wind: 0.6, wet: 1 },
  storm:    { label: 'Thunderstorm', cloud: 0.04, dark: 0.88, fog: 3.2, sun: 0.15, precip: 'rain', wind: 1, wet: 1, lightning: true },
  fog:      { label: 'Fog', cloud: 0.3, dark: 0.25, fog: 9, sun: 0.45 },
  snow:     { label: 'Snowfall', cloud: 0.12, dark: 0.45, fog: 3.4, sun: 0.35, precip: 'snow', wind: 0.3 }
};
const WEATHER_ORDER = ['clear', 'fair', 'cloudy', 'overcast', 'rain', 'storm', 'fog', 'snow'];
// ===================== END DESIGNS =====================
