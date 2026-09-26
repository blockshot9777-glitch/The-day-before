// The zone: the village of Sosnovka and its surroundings — a kolkhoz farm,
// fields, forests, a river with two bridges, a lake, a gas station on the
// highway, an army checkpoint, a pioneer camp, a radio tower on a hill and
// the army camp with the evacuation helipad.
import * as THREE from 'three';
import { pick, lerp, clamp } from './util.js';
import { WATER_Y } from './terrain.js';
import { boxGeo } from './world.js';

// Coordinates in metres; north is -Z.
export const PLAN = {
  half: 380,
  river: [[-380, -300], [-250, -210], [-150, -110], [-120, -20], [-118, 60], [-80, 170], [-20, 262], [60, 330], [130, 380]],
  riverW: 7,
  lake: { x: 170, z: -190, r: 40 },
  hills: [
    { x: -220, z: 250, r: 95, h: 22 }, // radio hill
    { x: -290, z: -140, r: 80, h: 9 },
    { x: 305, z: -285, r: 70, h: 12 },
    { x: 110, z: 300, r: 60, h: 6 },
  ],
  pads: [
    { x: 20, z: 20, r: 118, fall: 40 }, // village
    { x: 60, z: -212, r: 55, fall: 30 }, // farm
    { x: 285, z: 62, r: 30, fall: 20 }, // gas station
    { x: 212, z: 255, r: 42, fall: 25 }, // army camp
    { x: -250, z: 60, r: 36, fall: 22 }, // pioneer camp
    { x: 258, z: -150, r: 26, fall: 16 }, // checkpoint
  ],
};

const V = { x: 20, z: 20 }; // village square

const ROADS = [
  { kind: 'asphalt', w: 9, pts: [[262, -380], [258, -150], [262, 60], [256, 250], [260, 380]] },
  { kind: 'dirt', w: 6, pts: [[-240, 58], [-200, 40], [-150, 23], [-118, 21], [-60, 22], [20, 20], [100, 22], [140, 24], [200, 22], [258, 21]] },
  { kind: 'dirt', w: 5.5, pts: [[20, -62], [19, 20], [22, 112]] },
  { kind: 'dirt', w: 5, pts: [[20, -62], [30, -122], [55, -178]] },
  { kind: 'dirt', w: 5, pts: [[22, 112], [-10, 160], [-72, 190], [-140, 232], [-200, 246]] },
  { kind: 'asphalt', w: 7, pts: [[262, 60], [283, 61]] },
  { kind: 'dirt', w: 5, pts: [[256, 250], [230, 254]] },
];

const FIELDS = [
  { minX: 55, maxX: 190, minZ: 62, maxZ: 150 },
  { minX: -105, maxX: -32, minZ: -125, maxZ: -52 },
  { minX: 100, maxX: 220, minZ: -130, maxZ: -52 },
];

// ---------- builders ----------

// Picket fence texture with see-through gaps (alpha-tested).
function fenceMaterial() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 64;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 64);
  g.fillStyle = '#6e604e';
  g.fillRect(0, 16, 128, 5);
  g.fillRect(0, 46, 128, 5);
  for (let x = 2; x < 128; x += 16) {
    const v = 120 + Math.random() * 40;
    g.fillStyle = `rgb(${v},${v * 0.9},${v * 0.75})`;
    g.beginPath();
    g.moveTo(x, 64); g.lineTo(x, 6); g.lineTo(x + 5, 0); g.lineTo(x + 10, 6); g.lineTo(x + 10, 64);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: t, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.95 });
}

// Gable roof: two slopes (roof material) and two gable triangles (wall material).
function gableRoof(w, cx, y, cz, W, D, rise, over, roofMat, gableMat) {
  const alongX = W >= D; // ridge runs along the longer side
  const L = (alongX ? W : D) / 2 + over, S = (alongX ? D : W) / 2 + over;
  const top = y + rise;
  const lo = y - over * (rise / ((alongX ? D : W) / 2));
  const P = (a, b, h) => (alongX ? [cx + a, h, cz + b] : [cx + b, h, cz + a]);
  const quad = (p0, p1, p2, p3, u) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...p0, ...p1, ...p2, ...p0, ...p2, ...p3], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, u[0], 0, u[0], u[1], 0, 0, u[0], u[1], 0, u[1]], 2));
    g.computeVertexNormals();
    return g;
  };
  const slopeLen = Math.hypot(S, rise + (y - lo));
  const uv = [(L * 2) / 2, slopeLen / 2];
  w.addGeo(quad(P(-L, -S, lo), P(L, -S, lo), P(L, 0, top), P(-L, 0, top), uv), roofMat);
  w.addGeo(quad(P(L, S, lo), P(-L, S, lo), P(-L, 0, top), P(L, 0, top), uv), roofMat);
  // gable ends (at the wall line, not the overhang)
  const e = L - over, s = S - over;
  for (const sign of [-1, 1]) {
    const g = new THREE.BufferGeometry();
    const a = P(sign * e, -s, y), b = P(sign * e, s, y), c = P(sign * e, 0, top);
    g.setAttribute('position', new THREE.Float32BufferAttribute(sign > 0 ? [...a, ...c, ...b] : [...a, ...b, ...c], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, s, 0, s / 2, rise / 1.5], 2));
    g.computeVertexNormals();
    w.addGeo(g, gableMat);
  }
  // collider so the attic blocks bullets and sight
  const hw = alongX ? e : s, hd = alongX ? s : e;
  w.addCollider(cx - hw, y, cz - hd, cx + hw, y + rise * 0.7, cz + hd).mat = 'wood';
}

// Ground level for a footprint: the highest corner, so nothing floats.
function footprint(w, cx, cz, W, D) {
  const hs = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]].map(([a, b]) => w.ground(cx + (a * W) / 2, cz + (b * D) / 2));
  return { top: Math.max(...hs), low: Math.min(...hs) };
}

const FURNITURE = {
  cabinet: [1.2, 1.8, 0.5, 'darkWood'],
  fridge: [0.8, 1.9, 0.7, 'white'],
  crate: [1, 1, 1, 'crate'],
  desk: [1.5, 0.8, 0.8, 'wood'],
  chest: [1.1, 0.6, 0.6, 'darkWood'],
  shelf: [1.8, 1.9, 0.5, 'metal'],
  toolbox: [0.9, 0.5, 0.5, 'red'],
  military: [1.2, 0.7, 0.7, 'olive'],
  console: [1.8, 1.1, 0.7, 'metal'],
};

// A house with walls, a door, windows, a roof, steps and furniture.
// door: side facing the street ('N' = -Z, 'S' = +Z, 'W' = -X, 'E' = +X).
function house(w, cx, cz, W, D, door, o = {}) {
  const m = w.mats;
  const r = w.rng;
  const H = o.h ?? 2.7, T = 0.26;
  const wall = o.wall || pick([m.logs, m.logs, m.logsDark, m.planksBlue, m.planksGreen, m.planksOchre], r);
  const { top, low } = footprint(w, cx, cz, W, D);
  const base = top + (o.plinth ?? 0.35);
  // plinth doubles as the floor
  w.box(cx, low - 0.6, cz, W + 0.16, base - low + 0.6, D + 0.16, o.plinthMat || m.stone, true, 1.5);
  w.box(cx, base - 0.01, cz, W - 0.2, 0.02, D - 0.2, m.wood, false, 1.5);
  const minX = cx - W / 2, maxX = cx + W / 2, minZ = cz - D / 2, maxZ = cz + D / 2;
  const b = { minX, maxX, minZ, maxZ, enterable: true, floor: base, name: o.name };
  w.buildings.push(b);
  const doorW = o.doorW ?? 1.15, doorH = o.doorH ?? 2.1;
  const sides = {
    N: { along: 'x', fixed: minZ + T / 2, a: minX, b: maxX, out: -1 },
    S: { along: 'x', fixed: maxZ - T / 2, a: minX, b: maxX, out: 1 },
    W: { along: 'z', fixed: minX + T / 2, a: minZ + T, b: maxZ - T, out: -1 },
    E: { along: 'z', fixed: maxX - T / 2, a: minZ + T, b: maxZ - T, out: 1 },
  };
  const trim = o.trim || (r() < 0.5 ? m.trim : m.trimBlue);
  let doorPos = null;
  for (const [side, s] of Object.entries(sides)) {
    const len = s.b - s.a;
    const seg = (a, bb, y0, y1) => {
      if (bb - a < 0.05) return;
      const mid = (a + bb) / 2, l = bb - a;
      if (s.along === 'x') w.box(mid, base + y0, s.fixed, l, y1 - y0, T, wall, true, 2.2);
      else w.box(s.fixed, base + y0, mid, T, y1 - y0, l, wall, true, 2.2);
    };
    const windows = [];
    if (side === door) {
      const dc = o.doorAt != null ? o.doorAt : s.a + len / 2 + (r() - 0.5) * Math.max(0, len - doorW - 3);
      seg(s.a, dc - doorW / 2, 0, H);
      seg(dc + doorW / 2, s.b, 0, H);
      seg(dc - doorW / 2, dc + doorW / 2, doorH, H);
      doorPos = s.along === 'x' ? { x: dc, z: s.fixed + s.out * 1.1 } : { x: s.fixed + s.out * 1.1, z: dc };
      if (dc - s.a > 2.6) windows.push((s.a + dc - doorW / 2) / 2);
      if (s.b - dc > 2.6) windows.push((dc + doorW / 2 + s.b) / 2);
    } else {
      seg(s.a, s.b, 0, H);
      const n = Math.max(1, Math.floor(len / 3.2));
      for (let i = 0; i < n; i++) windows.push(s.a + ((i + 0.5) * len) / n);
    }
    for (const p of windows) {
      const off = s.fixed + s.out * (T / 2 + 0.02);
      const lit = r() < 0.1;
      const put = (u, y, v, sw, sh, sd, mat) => (s.along === 'x' ? w.box(u, y, off + v * s.out, sw, sh, sd, mat, false, 0) : w.box(off + v * s.out, y, u, sd, sh, sw, mat, false, 0));
      put(p, base + 0.95, 0, 0.9, 1.0, 0.04, lit ? m.glassLit : m.glass);
      // carved frame and open shutters
      put(p, base + 1.95, 0.03, 1.15, 0.12, 0.06, trim);
      put(p, base + 0.85, 0.03, 1.15, 0.1, 0.06, trim);
      if (o.shutters !== false) {
        put(p - 0.72, base + 0.9, 0.04, 0.42, 1.05, 0.05, trim);
        put(p + 0.72, base + 0.9, 0.04, 0.42, 1.05, 0.05, trim);
      }
    }
  }
  // steps up to the door
  if (doorPos) {
    const s = sides[door];
    // On a slope the ground drops further out, so size the flight by the lowest
    // ground under it and repeat until the step count settles.
    const outAt = (d) => (s.along === 'x' ? w.ground(doorPos.x, s.fixed + s.out * (T / 2 + d)) : w.ground(s.fixed + s.out * (T / 2 + d), doorPos.z));
    let n = 1, g = outAt(0.5);
    for (let it = 0; it < 6; it++) {
      g = Math.min(...Array.from({ length: n + 1 }, (_, k) => outAt(0.25 + k * 0.5)));
      const next = Math.max(1, Math.ceil((base - g) / 0.35));
      if (next === n) break;
      n = next;
    }
    const rise = base - g;
    for (let i = 0; i < n; i++) {
      const h = (rise * (n - i)) / n;
      const d = 0.5 * (i + 1);
      const px = s.along === 'x' ? doorPos.x : s.fixed + s.out * (T / 2 + d - 0.25);
      const pz = s.along === 'x' ? s.fixed + s.out * (T / 2 + d - 0.25) : doorPos.z;
      const sw = s.along === 'x' ? 1.6 : 0.5, sd = s.along === 'x' ? 0.5 : 1.6;
      w.box(px, g - 0.2, pz, sw, h + 0.2, sd, m.wood, true, 1);
    }
    b.door = { x: doorPos.x + (s.along === 'x' ? 0 : s.out * 0.5 * n), z: doorPos.z + (s.along === 'x' ? s.out * 0.5 * n : 0) };
    b.doorIn = s.along === 'x' ? { x: 0, z: -s.out } : { x: -s.out, z: 0 }; // walking direction into the house
  }
  // roof
  if (o.flatRoof) {
    w.box(cx, base + H, cz, W + 0.4, 0.3, D + 0.4, m.roof, true, 0);
  } else {
    const rise = Math.min(W, D) * (o.pitch ?? 0.42);
    gableRoof(w, cx, base + H, cz, W, D, rise, 0.45, o.roof || pick([m.roofMetal, m.roofRust, m.roofGreen, m.roofRust], r), wall);
  }
  // interior: furniture along the back wall, a stove and a table
  const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[door];
  const inset = T + 0.45;
  const along = (t) => {
    if (back === 'N') return { x: lerp(minX + 1.1, maxX - 1.1, t), z: minZ + inset, rot: 'x' };
    if (back === 'S') return { x: lerp(minX + 1.1, maxX - 1.1, t), z: maxZ - inset, rot: 'x' };
    if (back === 'W') return { x: minX + inset, z: lerp(minZ + 1.1, maxZ - 1.1, t), rot: 'z' };
    return { x: maxX - inset, z: lerp(minZ + 1.1, maxZ - 1.1, t), rot: 'z' };
  };
  const furniture = o.furniture || [pick(['cabinet', 'chest', 'fridge'], r), pick(['cabinet', 'desk', 'chest', 'shelf'], r)];
  const made = [];
  furniture.forEach((kind, i) => {
    const t = furniture.length === 1 ? 0.5 : 0.12 + (i / (furniture.length - 1)) * 0.5;
    const p = along(t);
    const [fw, fh, fd, matName] = FURNITURE[kind];
    const sx = p.rot === 'x' ? fw : fd, sz = p.rot === 'x' ? fd : fw;
    w.box(p.x, base, p.z, sx, fh, sz, m[matName], true, 1);
    if (kind === 'console') {
      w.box(p.x, base + 1.1, p.z, sx * 0.9, 0.5, sz * 0.5, m.glassLit, false, 0);
      w.radioConsole = { x: p.x, y: base + 1.1, z: p.z };
    } else {
      const c = w.addContainer(p.x, base + Math.min(fh, 1.2), p.z, kind);
      c.building = w.buildings.length - 1;
      made.push(c);
    }
  });
  if (o.stove !== false && W > 5.5 && D > 5.5) {
    // Russian stove in the far corner from the door, chimney through the roof
    const sx = back === 'W' || door === 'E' ? minX + 1.1 : maxX - 1.1;
    const sz = back === 'N' || door === 'S' ? minZ + 1.1 : maxZ - 1.1;
    const p = along(0.92);
    const kx = p.rot === 'x' ? p.x : sx, kz = p.rot === 'x' ? sz : p.z;
    w.box(kx, base, kz, 1.5, 1.8, 1.5, m.stove, true, 1);
    w.box(kx, base + 1.8, kz, 0.6, H + 2.2 - 1.8, 0.6, m.brick, false, 1);
  }
  if (o.table !== false && W > 6 && D > 5.5) w.box(cx, base, cz, 1.3, 0.75, 0.85, m.wood, true, 1);
  if (o.stove !== false && W > 6.5 && D > 6) dressHome(w, { minX, maxX, cx, cz, base });
  return { base, door: b.door, containers: made, building: b };
}

// Bed and rug in a lived-in house. Kept on the side wall so the door, the
// centre table and the back-wall loot stay reachable.
function dressHome(w, { minX, cx, cz, base }) {
  const m = w.mats;
  w.box(cx, base + 0.02, cz, 2.2, 0.02, 1.5, m.red, false, 1);
  const bx = minX + 0.72;
  if (bx > cx - 1.4) return;
  w.box(bx, base, cz - 0.2, 0.95, 0.4, 1.85, m.darkWood, true, 1);
  w.box(bx, base + 0.4, cz - 0.15, 0.88, 0.1, 1.65, m.planksOchre, false, 1);
  w.box(bx, base + 0.5, cz - 0.85, 0.62, 0.08, 0.32, m.white, false, 1);
}

// Straight fence along X or Z with optional gaps (gates), alpha-tested pickets.
function fence(w, x0, z0, x1, z1, gaps = []) {
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
  const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const fixed = alongX ? z0 : x0;
  let cuts = [[a0, a0 + len]];
  for (const g of gaps) {
    cuts = cuts.flatMap(([a, b]) => (g + 0.8 <= a || g - 0.8 >= b ? [[a, b]] : [[a, g - 0.8], [g + 0.8, b]].filter(([p, q]) => q - p > 0.3)));
  }
  for (const [a, b] of cuts) {
    // split into 4 m panels so each follows the ground
    for (let s = a; s < b - 0.05; s += 4) {
      const e = Math.min(b, s + 4), mid = (s + e) / 2, l = e - s;
      const x = alongX ? mid : fixed, z = alongX ? fixed : mid;
      const y = w.ground(x, z) - 0.05;
      const geo = boxGeo(alongX ? l : 0.05, 1.25, alongX ? 0.05 : l, 1.25).translate(x, y + 0.62, z);
      w.addGeo(geo, w.fenceMat);
      w.addCollider(x - (alongX ? l / 2 : 0.06), y, z - (alongX ? 0.06 : l / 2), x + (alongX ? l / 2 : 0.06), y + 1.2, z + (alongX ? 0.06 : l / 2)).mat = 'wood';
      w.box(alongX ? s : fixed, y, alongX ? fixed : s, 0.1, 1.4, 0.1, w.mats.darkWood, false, 0);
    }
  }
}

function barrel(w, x, z) {
  w.nature.prop(w.rng() < 0.5 ? 'barrel' : 'barrel-olive', x, z, w.rng() * 6);
}

function hayBale(w, x, z, rot, y = w.ground(x, z)) {
  const g = new THREE.CylinderGeometry(0.8, 0.8, 1.3, 14).rotateZ(Math.PI / 2).rotateY(rot).translate(x, y + 0.78, z);
  w.addGeo(g, w.mats.hay);
  w.addCollider(x - 0.75, y, z - 0.75, x + 0.75, y + 1.5, z + 0.75).mat = 'wood';
}

// A few blocks of a crate stack, some of them lootable.
function crates(w, x, z, n, kind = 'crate') {
  for (let i = 0; i < n; i++) {
    const px = x + (i % 2) * 1.05, pz = z + Math.floor(i / 2) * 1.05;
    const y = w.ground(px, pz);
    const h = w.nature.prop(kind === 'military' ? 'crate-mil' : 'crate', px, pz, (w.rng() - 0.5) * 0.3, { scale: 1.25 });
    if (w.rng() < 0.6) w.addContainer(px, y + h, pz, kind);
  }
}

// ---------- places ----------

function village(w) {
  const r = w.rng;
  const m = w.mats;
  w.pois.push({ name: 'Сосновка', x: V.x, z: V.z });
  // lots along the main street (E-W, z ≈ 20) and the cross street (N-S, x ≈ 20)
  const lots = [];
  for (let x = -92; x <= 130; x += 25) {
    if (x > -12 && x < 52) continue; // the square
    lots.push({ side: 'N', x, z: V.z - 4.5 }, { side: 'S', x, z: V.z + 4.5 });
  }
  for (let z = -52; z <= 100; z += 25) {
    if (z > -10 && z < 50) continue;
    lots.push({ side: 'W', x: V.x - 3.2, z }, { side: 'E', x: V.x + 3.2, z });
  }
  for (const lot of lots) {
    if (r() < 0.12) continue; // empty lot, overgrown
    // yard 22 x 24 behind the street edge
    const LW = 21, LD = 24;
    let x0, x1, z0, z1, door;
    if (lot.side === 'N') { x0 = lot.x - LW / 2; x1 = lot.x + LW / 2; z1 = lot.z; z0 = z1 - LD; door = 'S'; }
    if (lot.side === 'S') { x0 = lot.x - LW / 2; x1 = lot.x + LW / 2; z0 = lot.z; z1 = z0 + LD; door = 'N'; }
    if (lot.side === 'W') { z0 = lot.z - LW / 2; z1 = lot.z + LW / 2; x1 = lot.x; x0 = x1 - LD; door = 'E'; }
    if (lot.side === 'E') { z0 = lot.z - LW / 2; z1 = lot.z + LW / 2; x0 = lot.x; x1 = x0 + LD; door = 'W'; }
    const W = 6.5 + r() * 2.5, D = 6 + r() * 2;
    const setback = 5 + r() * 2;
    const hx = door === 'E' ? x1 - setback - W / 2 : door === 'W' ? x0 + setback + W / 2 : (x0 + x1) / 2 + (r() - 0.5) * 4;
    const hz = door === 'S' ? z1 - setback - D / 2 : door === 'N' ? z0 + setback + D / 2 : (z0 + z1) / 2 + (r() - 0.5) * 4;
    const h = house(w, hx, hz, W, D, door);
    // fence with a gate facing the door
    const gate = door === 'S' || door === 'N' ? h.door.x : h.door.z;
    const broken = () => (r() < 0.3 ? [x0 + r() * LW] : []);
    if (door === 'S') { fence(w, x0, z1, x1, z1, [gate]); fence(w, x0, z0, x1, z0, broken()); }
    if (door === 'N') { fence(w, x0, z0, x1, z0, [gate]); fence(w, x0, z1, x1, z1, broken()); }
    if (door === 'E') { fence(w, x1, z0, x1, z1, [gate]); fence(w, x0, z0, x0, z1, broken()); }
    if (door === 'W') { fence(w, x0, z0, x0, z1, [gate]); fence(w, x1, z0, x1, z1, broken()); }
    if (door === 'S' || door === 'N') { fence(w, x0, z0, x0, z1, []); fence(w, x1, z0, x1, z1, []); } else { fence(w, x0, z0, x1, z0, []); fence(w, x0, z1, x1, z1, []); }
    // back of the yard: garden beds, a woodpile, a shed or outhouse, fruit trees
    const bx = door === 'E' ? x0 + 5 : door === 'W' ? x1 - 5 : (x0 + x1) / 2;
    const bz = door === 'S' ? z0 + 5 : door === 'N' ? z1 - 5 : (z0 + z1) / 2;
    for (let k = 0; k < 3; k++) {
      const gx = bx + (door === 'S' || door === 'N' ? (k - 1) * 3 : 0), gz = bz + (door === 'E' || door === 'W' ? (k - 1) * 3 : 0);
      w.box(gx, w.ground(gx, gz) - 0.1, gz, door === 'S' || door === 'N' ? 1.6 : 5, 0.28, door === 'S' || door === 'N' ? 5 : 1.6, m.soil, false, 1.5);
    }
    const sx = door === 'S' || door === 'N' ? x0 + 2.5 : bx + (r() - 0.5) * 6;
    const sz = door === 'E' || door === 'W' ? z0 + 2.5 : bz + (r() - 0.5) * 6;
    const sy = w.ground(sx, sz);
    if (r() < 0.6) {
      w.box(sx, sy, sz, 1.6, 2.3, 1.6, pick([m.planksGrey, m.fence], r), true, 1);
      w.box(sx, sy + 2.3, sz, 1.9, 0.12, 1.9, m.roofRust, false, 1);
      if (r() < 0.5) w.addContainer(sx, sy + 1.2, sz, 'toolbox');
    } else {
      // woodpile under a lean-to
      w.box(sx, sy, sz, 2.6, 1.2, 1, m.logsDark, true, 1);
    }
    // yard junk next to the shed
    const jx = sx + (door === 'S' || door === 'N' ? 2.6 : 0), jz = sz + (door === 'E' || door === 'W' ? 2.6 : 0);
    const junk = r();
    if (junk < 0.25) w.nature.prop('planks', jx, jz, r() * 6, { collide: false });
    else if (junk < 0.4) w.nature.prop('tires', jx, jz, r() * 6);
    else if (junk < 0.55) barrel(w, jx, jz);
    else if (junk < 0.65) w.nature.prop('pallet', jx, jz, r() * 6);
    if (r() < 0.8) {
      // fruit tree at the back of the yard, never inside the house
      const along = (r() - 0.5) * 12;
      const tx = door === 'S' || door === 'N' ? (x0 + x1) / 2 + along : bx + (r() - 0.5) * 3;
      const tz = door === 'E' || door === 'W' ? (z0 + z1) / 2 + along : bz + (r() - 0.5) * 3;
      if (!w.insideBuilding(tx, tz, 1.5)) w.nature.tree('leafy', tx, tz, r);
    }
  }

  // square: church, shop, club, well, notice board
  const church = house(w, 4, 2, 9, 14, 'S', { wall: m.whitewash, h: 5, roof: m.roofGreen, name: 'Церковь', furniture: ['cabinet', 'chest', 'cabinet'], stove: false, shutters: false, trim: m.trim, doorW: 1.6, doorH: 2.6 });
  // bell tower with an onion dome over the entrance
  const cy = church.base;
  w.box(4, cy + 5, 7.5, 3.4, 5, 3.4, m.whitewash, true, 2);
  w.addGeo(new THREE.SphereGeometry(1.5, 16, 12).scale(1, 1.3, 1).translate(4, cy + 11.4, 7.5), m.domeBlue);
  w.addGeo(new THREE.ConeGeometry(0.35, 1.8, 8).translate(4, cy + 13.6, 7.5), m.gold);
  w.box(4, cy + 14.4, 7.5, 0.1, 1.4, 0.1, m.gold, false, 0);
  w.box(4, cy + 14.9, 7.5, 0.7, 0.1, 0.1, m.gold, false, 0);

  const shopH = house(w, 37, 7, 11, 8, 'S', { wall: m.brick, flatRoof: true, h: 3.2, name: 'Сельпо', furniture: ['shelf', 'fridge', 'shelf', 'fridge'], stove: false, shutters: false });
  w.nature.prop('boxes', 40.5, 8.8, 0.3, { y: shopH.base });
  w.nature.prop('trash', 44.5, 1, 0);
  for (const [x, z] of [[-4, 30], [30, 30]]) w.nature.prop('streetlight', x, z, Math.PI / 2);
  const club = house(w, 38, 36, 15, 10, 'N', { wall: m.plasterA, h: 3.6, name: 'Клуб', furniture: ['cabinet', 'desk', 'chest'], stove: false, roof: m.roofMetal });
  w.nature.prop('sofa', 44.3, 35.5, -Math.PI / 2, { y: club.base }); // along the east wall, clear of the furniture at the back
  // well with a little roof
  const wy = w.ground(6, 34);
  w.addGeo(new THREE.CylinderGeometry(0.9, 0.95, 0.9, 12).translate(6, wy + 0.45, 34), m.logsDark);
  w.addCollider(5.1, wy, 33.1, 6.9, wy + 0.9, 34.9).mat = 'wood';
  w.box(5.2, wy, 34, 0.12, 2.2, 0.12, m.darkWood, false, 0);
  w.box(6.8, wy, 34, 0.12, 2.2, 0.12, m.darkWood, false, 0);
  gableRoof(w, 6, wy + 2.2, 34, 1.4, 2.2, 0.7, 0.15, m.roofRust, m.darkWood);
  // bus stop at the east entrance, where the story starts
  const BX = 134;
  const by = w.ground(BX, 28.5);
  w.box(BX, by, 30, 4, 2.4, 0.15, m.concrete, true, 2);
  w.box(BX - 1.9, by, 29, 0.15, 2.4, 2, m.concrete, true, 2);
  w.box(BX + 1.9, by, 29, 0.15, 2.4, 2, m.concrete, true, 2);
  w.box(BX, by + 2.4, 29, 4.4, 0.15, 2.6, m.roofMetal, false, 1);
  w.box(BX, by, 29.4, 3, 0.45, 0.5, m.wood, true, 1);
  w.spawn = { x: BX + 4, z: 22.5, yaw: Math.PI / 2 }; // on the road just past the stop, facing the village

  // power poles with sagging wires along the main street
  const wires = [];
  let prev = null;
  for (let x = -140; x <= 250; x += 32) {
    const z = V.z - 3.8; // roadside, between the road and the yard fences
    if (w.terrain.isWater(x, z) || w.insideBuilding(x, z, 1)) { prev = null; continue; }
    const y = w.ground(x, z);
    w.box(x, y - 0.3, z, 0.24, 8.5, 0.24, m.darkWood, true, 0);
    w.box(x, y + 7.6, z, 0.12, 0.12, 1.6, m.darkWood, false, 0);
    const tops = [[x, y + 7.75, z - 0.7], [x, y + 7.75, z + 0.7]];
    if (prev) {
      for (let k = 0; k < 2; k++) {
        const a = prev[k], bb = tops[k];
        for (let s = 0; s < 8; s++) {
          const t0 = s / 8, t1 = (s + 1) / 8;
          const sag = (t) => Math.sin(t * Math.PI) * 0.9;
          wires.push(lerp(a[0], bb[0], t0), lerp(a[1], bb[1], t0) - sag(t0), lerp(a[2], bb[2], t0));
          wires.push(lerp(a[0], bb[0], t1), lerp(a[1], bb[1], t1) - sag(t1), lerp(a[2], bb[2], t1));
        }
      }
    }
    prev = tops;
  }
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  w.scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: 0x1c1c1c })));

  // abandoned cars in the village streets
  w.nature.wreck(70, 17.6, Math.PI / 2 + 0.2, r);
  w.nature.wreck(-40, 23, -Math.PI / 2 + 0.1, r);
  w.nature.wreck(17.5, 80, 0.15, r);
}

function farm(w) {
  const m = w.mats;
  const r = w.rng;
  w.pois.push({ name: 'Колхоз «Заря»', x: 60, z: -212 });
  // big barn with a wide opening, hay and a tractor inside
  const barn = house(w, 42, -228, 24, 12, 'E', { wall: m.planksGrey, h: 5.5, doorW: 5, doorH: 4.6, roof: m.roofRust, stove: false, table: false, shutters: false, furniture: ['crate', 'toolbox', 'crate'], name: 'Амбар' });
  for (let i = 0; i < 5; i++) hayBale(w, 36 + i * 2.6, -232 + (i % 2) * 2, 0, barn.base);
  w.nature.prop('pallet', 47, -224, 0.1, { y: barn.base });
  w.nature.prop('planks', 49.5, -222, 0.4, { y: barn.base + 0.02, collide: false });
  // cow shed and silo
  house(w, 80, -198, 34, 9, 'N', { wall: m.brick, h: 3.2, roof: m.roofMetal, stove: false, table: false, shutters: false, furniture: ['crate', 'crate', 'toolbox'], name: 'Коровник' });
  const sy = w.ground(96, -235);
  w.addGeo(new THREE.CylinderGeometry(4, 4, 15, 20).translate(96, sy + 7.5, -235), m.concrete);
  w.addGeo(new THREE.SphereGeometry(4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).translate(96, sy + 15, -235), m.roofMetal);
  w.addCollider(92.5, sy, -238.5, 99.5, sy + 17, -231.5).mat = 'hard';
  // office: one of the radio parts is in the chairman's cabinet
  const office = house(w, 62, -182, 8, 6.5, 'S', { wall: m.plasterB, name: 'Контора', furniture: ['desk', 'cabinet'] });
  office.containers[office.containers.length - 1].radio = true;
  for (let i = 0; i < 10; i++) hayBale(w, 120 + r() * 60, -125 + r() * 60, r() * 3);
  crates(w, 25, -205, 4);
  barrel(w, 30, -200); barrel(w, 31, -201.2);
  w.nature.prop('water-tower', 70, -240, 0.3, { scale: 2.2 });
  w.nature.prop('container', 22, -228, 1.4, { scale: 1.3 });
  w.nature.prop('tires', 33, -196, 1.1);
  w.nature.prop('pallet', 28, -210, 0.5);
  w.nature.prop('debris', 58, -168, 0.8, { collide: false });
  w.nature.wreck(20, -150, 0.3, r);
}

function gasStation(w) {
  const m = w.mats;
  w.pois.push({ name: 'АЗС', x: 285, z: 62 });
  const gy = w.ground(284, 60);
  w.box(284, gy - 2, 60, 22, 2.12, 16, m.concrete, true, 3); // deep slab: no gap on the slope
  // canopy on four columns and the pumps
  for (const [dx, dz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) w.box(284 + dx, gy, 60 + dz, 0.4, 4.6, 0.4, m.white, true, 0);
  w.box(284, gy + 4.6, 60, 13, 0.5, 8.5, m.white, false, 1);
  w.box(284, gy + 4.4, 60, 13.2, 0.2, 8.7, m.red, false, 0);
  for (const dz of [-1.2, 1.2]) {
    w.box(282, gy + 0.12, 60 + dz, 0.8, 1.7, 0.6, m.red, true, 0);
    w.box(286, gy + 0.12, 60 + dz, 0.8, 1.7, 0.6, m.red, true, 0);
  }
  const shop = house(w, 298, 72, 10, 7, 'W', { wall: m.brick, flatRoof: true, h: 3.1, name: 'Магазин АЗС', furniture: ['shelf', 'fridge', 'shelf'], stove: false, shutters: false });
  shop.containers[0].radio = true;
  w.nature.wreck(281, 56, 0.1, w.rng);
  w.nature.wreck(290, 70, 1.4, w.rng);
  barrel(w, 305, 58); barrel(w, 305.8, 59);
  w.nature.prop('gascan', 303.5, 57, 0.4); w.nature.prop('gascan', 303.9, 58.2, 1.9);
  w.nature.prop('tires', 300, 52, 0.2);
  for (const z of [51, 69]) w.nature.prop('streetlight', 274, z, -Math.PI / 2);
  w.nature.prop('trash', 304, 78, Math.PI / 2);
  w.nature.prop('boxes', 300.5, 70, 0.3, { y: shop.base });
}

function checkpoint(w) {
  const m = w.mats;
  const cx = 258, cz = -150;
  w.pois.push({ name: 'Блокпост', x: cx, z: cz });
  for (const dz of [-9, 9]) {
    for (const o of [-3.3, 3.3]) {
      w.nature.prop('barrier', cx + o - 0.95, cz + dz, 0);
      w.nature.prop('barrier', cx + o + 0.95, cz + dz, 0);
    }
  }
  w.nature.prop('sandbags', cx + 8.5, cz - 1, Math.PI / 2);
  w.nature.prop('sandbags-small', cx + 8.5, cz + 2.4, Math.PI / 2);
  w.nature.prop('container-olive', cx + 12, cz + 3, Math.PI / 2);
  w.nature.prop('container-olive', cx - 10.5, cz + 5, Math.PI / 2 + 0.05);
  for (const dz of [-12, -11.2, 11.2, 12]) w.nature.prop('cone', cx + (dz > 0 ? 1.5 : -1.5), cz + dz, dz);
  crates(w, cx - 9, cz - 6, 4, 'military');
  for (let i = 0; i < 5; i++) w.box(cx + (w.rng() - 0.5) * 12, w.ground(cx, cz) + 0.07, cz + (w.rng() - 0.5) * 16, 1 + w.rng(), 0.012, 1 + w.rng(), m.blood, false, 0);
  w.nature.wreck(cx - 2, cz - 25, 0.05, w.rng);
  w.nature.wreck(cx + 2.5, cz + 30, Math.PI - 0.1, w.rng);
}

function armyCamp(w) {
  const m = w.mats;
  const cx = 212, cz = 255;
  w.pois.push({ name: 'Военный лагерь', x: cx, z: cz });
  const gy = w.ground(cx, cz);
  w.helipad = { x: cx, z: cz, y: gy + 0.14 };
  w.box(cx, gy - 2, cz, 22, 2.14, 22, m.concrete, true, 4);
  w.box(cx - 2.5, gy + 0.14, cz, 1, 0.01, 7, m.yellow, false, 0);
  w.box(cx + 2.5, gy + 0.14, cz, 1, 0.01, 7, m.yellow, false, 0);
  w.box(cx, gy + 0.14, cz, 4, 0.01, 1, m.yellow, false, 0);
  w.addGeo(new THREE.RingGeometry(7.5, 8.2, 40).rotateX(-Math.PI / 2).translate(cx, gy + 0.155, cz), m.yellow);
  // sandbag wall around the pad, each run laid along the circle
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 20) {
    if (Math.abs(Math.cos(a) - 1) < 0.25) continue; // gap toward the road (east)
    const x = cx + Math.cos(a) * 16, z = cz + Math.sin(a) * 16;
    w.nature.prop('sandbags-small', x, z, -a - Math.PI / 2, { y: w.ground(x, z) - 0.1 });
  }
  // A-frame army tents
  for (const [x, z, sw, sd] of [[cx - 22, cz - 16, 7, 4.5], [cx + 18, cz - 22, 4.5, 7], [cx - 24, cz + 12, 7, 4.5]]) {
    const { top } = footprint(w, x, z, sw, sd);
    gableRoof(w, x, top - 0.1, z, sw, sd, 2.7, 0.05, m.olive, m.olive);
  }
  crates(w, cx - 16, cz - 12, 3, 'military');
  crates(w, cx + 14, cz - 16, 2, 'military');
  crates(w, cx - 18, cz + 18, 3, 'military');
  w.nature.prop('container-olive', cx + 18, cz + 15, Math.PI / 2 + 0.03, { scale: 1.3 });
  w.nature.prop('pallet', cx + 14.5, cz + 19, 0.2);
  const gh = w.nature.prop('crate-mil', cx + 14.5, cz + 19, 0.1, { y: w.ground(cx + 14.5, cz + 19) + 0.19, scale: 1.25 });
  w.addContainer(cx + 14.5, w.ground(cx + 14.5, cz + 19) + 0.19 + gh, cz + 19, 'military');
  for (const [x, z] of [[cx - 13, cz + 20], [cx - 12.2, cz + 20.6], [cx + 20, cz - 14]]) w.nature.prop('gascan', x, z, w.rng() * 6);
}

function pioneerCamp(w) {
  const m = w.mats;
  const cx = -250, cz = 60;
  w.pois.push({ name: 'Пионерлагерь «Орлёнок»', x: cx, z: cz });
  const cabins = [
    house(w, cx - 12, cz - 8, 9, 6, 'S', { wall: m.planksBlue, name: 'Корпус 1', furniture: ['chest', 'cabinet'], stove: false }),
    house(w, cx + 4, cz - 10, 9, 6, 'S', { wall: m.planksGreen, name: 'Корпус 2', furniture: ['chest', 'chest'], stove: false }),
    house(w, cx + 14, cz + 10, 7, 6, 'W', { wall: m.planksOchre, name: 'Медпункт', furniture: ['cabinet', 'cabinet'], stove: false }),
  ];
  cabins[1].containers[0].radio = true;
  // gate arch and flagpole
  const gy = w.ground(cx + 18, cz - 3);
  w.box(cx + 18, gy, cz - 5.5, 0.3, 4, 0.3, m.planksBlue, true, 0);
  w.box(cx + 18, gy, cz - 0.5, 0.3, 4, 0.3, m.planksBlue, true, 0);
  w.box(cx + 18, gy + 4, cz - 3, 0.4, 0.8, 5.6, m.planksBlue, false, 1);
  const fy = w.ground(cx, cz + 6);
  w.box(cx, fy, cz + 6, 0.14, 9, 0.14, m.metal, true, 0);
  w.box(cx + 0.7, fy + 7.6, cz + 6, 1.3, 0.9, 0.02, m.red, false, 0);
}

function radioTower(w) {
  const m = w.mats;
  const cx = -214, cz = 250;
  w.pois.push({ name: 'Радиовышка', x: cx, z: cz });
  const y = w.ground(cx, cz);
  w.towerPos = { x: cx, z: cz };
  const S = 3.2, H = 30;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) w.box(cx + (dx * S) / 2, y - 0.5, cz + (dz * S) / 2, 0.3, H + 0.5, 0.3, m.rust, true, 0);
  for (let h = 2; h < H; h += 3) {
    w.box(cx, y + h, cz - S / 2, S, 0.15, 0.15, m.rust, false, 0);
    w.box(cx, y + h, cz + S / 2, S, 0.15, 0.15, m.rust, false, 0);
    w.box(cx - S / 2, y + h, cz, 0.15, 0.15, S, m.rust, false, 0);
    w.box(cx + S / 2, y + h, cz, 0.15, 0.15, S, m.rust, false, 0);
  }
  w.box(cx, y + H, cz, 0.2, 4, 0.2, m.metal, false, 0);
  w.beacon = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }));
  w.beacon.position.set(cx, y + H + 4.2, cz);
  w.scene.add(w.beacon);
  house(w, cx + 10, cz - 4, 6, 5, 'E', { wall: m.concrete, flatRoof: true, furniture: ['console'], stove: false, table: false, shutters: false, name: 'Аппаратная' });
  const ch = w.nature.prop('crate-mil', cx - 6, cz + 5, 0.2, { scale: 1.4 });
  w.addContainer(cx - 6, w.ground(cx - 6, cz + 5) + ch, cz + 5, 'military');
  w.nature.prop('gascan', cx - 4.6, cz + 5.4, 1.2);
  barrel(w, cx - 4, cz - 6);
}

// Wooden bridges where roads cross water: flat 1 m planks from bank to bank,
// with ramps. Crossings are found along the whole road (not per polyline
// segment), so a river meeting a road at a bend still gets one bridge.
function bridges(w) {
  const m = w.mats;
  for (const road of w.roads) {
    // sample the road every 0.5 m of arc length
    const S = [];
    for (let s = 0; s < road.pts.length - 1; s++) {
      const [ax, az] = road.pts[s], [bx, bz] = road.pts[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let t = 0; t < len; t += 0.5) S.push({ x: ax + dx * t, z: az + dz * t, dx, dz });
    }
    const wet = S.map((p) => w.ground(p.x, p.z) < WATER_Y + 0.35);
    for (let i = 0; i < S.length; i++) {
      if (!wet[i]) continue;
      let j = i;
      while (j + 1 < S.length && wet[j + 1]) j++;
      const i0 = Math.max(0, i - 8), i1 = Math.min(S.length - 1, j + 8); // 4 m of ramp each side
      const h0 = w.ground(S[i0].x, S[i0].z), h1 = w.ground(S[i1].x, S[i1].z);
      const deck = Math.max(h0, h1, WATER_Y + 1.1);
      for (let k = i0; k <= i1; k += 2) {
        const p = S[k];
        const y = Math.min(lerp(h0, deck, clamp((k - i0) / 8, 0, 1)), lerp(h1, deck, clamp((i1 - k) / 8, 0, 1)));
        const alongX = Math.abs(p.dx) > Math.abs(p.dz);
        const lw = road.w + 0.6, ll = 1.05;
        w.box(p.x, y - 0.35, p.z, alongX ? ll : lw, 0.35, alongX ? lw : ll, m.wood, true, 1.5);
        for (const sgn of [-1, 1]) {
          const rx = p.x + (alongX ? 0 : sgn * (lw / 2)), rz = p.z + (alongX ? sgn * (lw / 2) : 0);
          w.box(rx, y, rz, alongX ? ll : 0.12, 1.0, alongX ? 0.12 : ll, m.darkWood, true, 1);
        }
        if (k % 6 === 0 && wet[k]) w.box(p.x, w.ground(p.x, p.z) - 0.5, p.z, 0.3, y - w.ground(p.x, p.z) + 0.2, 0.3, m.darkWood, false, 0);
      }
      i = j;
    }
  }
}

export function buildZone(w) {
  w.fenceMat = fenceMaterial();
  w.fields = FIELDS;
  // keep settlements, fields and water clear of forest
  for (const p of PLAN.pads) w.nature.exclude.push({ x: p.x, z: p.z, r: p.r + 12 });
  w.nature.exclude.push({ x: -214, z: 250, r: 22 }, { x: PLAN.lake.x, z: PLAN.lake.z, r: PLAN.lake.r + 8 });
  for (const road of ROADS) w.addRoad(road.pts, road.w, road.kind);
  bridges(w);
  village(w);
  farm(w);
  gasStation(w);
  checkpoint(w);
  armyCamp(w);
  pioneerCamp(w);
  radioTower(w);
  w.pois.push({ name: 'Озеро', x: PLAN.lake.x, z: PLAN.lake.z });
  // wrecks along the highway
  for (const z of [-300, -220, -40, 130, 320]) w.nature.wreck(258 + (w.rng() - 0.5) * 4, z, (w.rng() - 0.5) * 0.6 + (w.rng() < 0.5 ? 0 : Math.PI), w.rng);
  w.nature.scatter(w.rng);
  // the three radio parts: farm office, gas station shop, pioneer camp
  w.radioContainers = w.containers.filter((c) => c.radio);
  for (const c of w.radioContainers) c.items.push({ id: 'radio_part', qty: 1 });
}
