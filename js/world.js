// The town: procedural layout, static geometry (merged per material), colliders,
// loot containers, pickups and the day/night sky.
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smooth, rayAABB, pick } from './util.js';
import { rollLoot, ITEMS } from './items.js';

export const HALF = 112; // playable area is [-HALF, HALF] on X and Z
const ROADS = [-60, 0, 60];
const ROAD_W = 10;
const CELL = 8; // collider grid cell size

// ---------- textures ----------
function canvasTex(size, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function speckle(g, s, base, spots, n, minR = 1, maxR = 3) {
  g.fillStyle = base;
  g.fillRect(0, 0, s, s);
  for (let i = 0; i < n; i++) {
    g.fillStyle = spots[(Math.random() * spots.length) | 0];
    g.globalAlpha = 0.25 + Math.random() * 0.5;
    const r = minR + Math.random() * (maxR - minR);
    g.fillRect(Math.random() * s, Math.random() * s, r, r);
  }
  g.globalAlpha = 1;
}

function makeTextures() {
  const grass = canvasTex(256, (g, s) => speckle(g, s, '#4b5534', ['#3b4527', '#5d6640', '#6b6a44', '#403a2a'], 5000, 1, 4), 120);
  const asphalt = canvasTex(256, (g, s) => {
    speckle(g, s, '#333436', ['#2a2b2d', '#3d3e40', '#444447', '#262626'], 6000, 1, 3);
    g.strokeStyle = 'rgba(15,15,15,0.7)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  });
  const grime = canvasTex(256, (g, s) => {
    speckle(g, s, '#e6e6e6', ['#bdbdbd', '#d0d0d0', '#f5f5f5', '#a8a8a8'], 3000, 2, 6);
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(60,50,40,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 12; i++) {
      g.fillStyle = 'rgba(70,60,50,0.12)';
      const x = Math.random() * s;
      g.fillRect(x, 0, 3 + Math.random() * 8, s * (0.3 + Math.random() * 0.7));
    }
  });
  const brick = canvasTex(256, (g, s) => {
    g.fillStyle = '#b8b0a4';
    g.fillRect(0, 0, s, s);
    const bh = 16, bw = 42;
    for (let y = 0; y < s; y += bh) {
      const off = (y / bh) % 2 ? bw / 2 : 0;
      for (let x = -bw; x < s + bw; x += bw) {
        const v = 150 + Math.random() * 60;
        g.fillStyle = `rgb(${v},${v * 0.55},${v * 0.42})`;
        g.fillRect(x + off + 1, y + 1, bw - 2, bh - 2);
      }
    }
  });
  const wood = canvasTex(128, (g, s) => {
    for (let y = 0; y < s; y += 16) {
      const v = 90 + Math.random() * 40;
      g.fillStyle = `rgb(${v},${v * 0.7},${v * 0.45})`;
      g.fillRect(0, y, s, 15);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(0, y + 15, s, 1);
    }
  });
  const concrete = canvasTex(256, (g, s) => {
    speckle(g, s, '#8d8c86', ['#7a7973', '#9e9d97', '#6d6c66'], 4000, 1, 4);
    g.strokeStyle = 'rgba(40,40,40,0.35)';
    g.strokeRect(0, 0, s, s);
  });
  return { grass, asphalt, grime, brick, wood, concrete };
}

// ---------- geometry helpers ----------
// Box whose UVs are scaled to world units so textures don't stretch.
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (tile) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let v = 0; v < 4; v++) {
        const i = f * 4 + v;
        uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
      }
    }
  }
  return g;
}

// Merges geometries (indexed or not) that share position/normal/uv.
function mergeGeos(geos) {
  let vcount = 0, icount = 0;
  for (const g of geos) {
    vcount += g.attributes.position.count;
    icount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vcount * 3);
  const nor = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  const idx = new Uint32Array(icount);
  let vo = 0, io = 0;
  for (const g of geos) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo;
      io += a.length;
    } else {
      for (let i = 0; i < n; i++) idx[io + i] = vo + i;
      io += n;
    }
    vo += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

const CONTAINER_LABEL = {
  crate: 'ящик', cabinet: 'шкафчик', fridge: 'холодильник', trunk: 'багажник', military: 'военный ящик', desk: 'стол',
};

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.lootMul = opts.lootMul ?? 1;
    this.rng = mulberry32(opts.seed ?? 1987);
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 0;
    this.containers = [];
    this.buildings = []; // {minX,maxX,minZ,maxZ,enterable}
    this.pickups = [];
    this.statics = new Map(); // material -> geometries
    this.tex = makeTextures();
    this.mats = this.makeMaterials();
    this.dynamic = new THREE.Group();
    scene.add(this.dynamic);
    this.build();
    this.finalize();
    this.makeSky();
  }

  makeMaterials() {
    const t = this.tex;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
    return {
      grass: std({ map: t.grass }),
      asphalt: std({ map: t.asphalt }),
      sidewalk: std({ map: t.concrete, color: 0xb0aea6 }),
      concrete: std({ map: t.concrete }),
      line: std({ color: 0xcfc6a0 }),
      plasterA: std({ map: t.grime, color: 0xc9bfa6 }),
      plasterB: std({ map: t.grime, color: 0x9fa89a }),
      plasterC: std({ map: t.grime, color: 0xb58f78 }),
      plasterD: std({ map: t.grime, color: 0x8f99a6 }),
      brick: std({ map: t.brick }),
      roof: std({ color: 0x3a3634 }),
      glass: std({ color: 0x1c262b, roughness: 0.25, metalness: 0.4 }),
      glassLit: std({ color: 0x2a2418, emissive: 0xffb65c, emissiveIntensity: 0 }),
      wood: std({ map: t.wood }),
      darkWood: std({ map: t.wood, color: 0x6b5b4b }),
      metal: std({ color: 0x6d7274, roughness: 0.6, metalness: 0.5 }),
      rust: std({ color: 0x7a4a2e, roughness: 0.8, metalness: 0.3 }),
      white: std({ color: 0xd8d8d2, roughness: 0.5 }),
      carRed: std({ color: 0x7a2a22, roughness: 0.6, metalness: 0.3 }),
      carBlue: std({ color: 0x3a5068, roughness: 0.6, metalness: 0.3 }),
      carWhite: std({ color: 0xb8b6ae, roughness: 0.6, metalness: 0.3 }),
      carGreen: std({ color: 0x4b5a3a, roughness: 0.6, metalness: 0.3 }),
      tire: std({ color: 0x151515 }),
      bark: std({ color: 0x4a3a2c }),
      leaves: std({ color: 0x3d5230, flatShading: true }),
      leaves2: std({ color: 0x5a5a2e, flatShading: true }),
      crate: std({ map: t.wood, color: 0x9c7b52 }),
      olive: std({ color: 0x4f5a35, roughness: 0.85 }),
      sandbag: std({ color: 0x8e7f5e, roughness: 1, flatShading: true }),
      yellow: std({ color: 0xd9b23a }),
      red: std({ color: 0x8c1f1a }),
      blood: std({ color: 0x3d0a08, roughness: 0.4 }),
    };
  }

  // ---------- primitives ----------
  addGeo(geo, mat) {
    if (!this.statics.has(mat)) this.statics.set(mat, []);
    this.statics.get(mat).push(geo);
  }

  // Box centred on x/z with its bottom at y. Returns the collider (if any).
  box(x, y, z, w, h, d, mat, collide = true, tile = 2) {
    this.addGeo(boxGeo(w, h, d, tile).translate(x, y + h / 2, z), mat);
    if (!collide) return null;
    const c = this.addCollider(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2);
    c.mat = this.soundMat(mat);
    return c;
  }

  // What a bullet hitting this material sounds like.
  soundMat(mat) {
    const m = this.mats;
    if ([m.carRed, m.carBlue, m.carWhite, m.carGreen, m.rust, m.metal, m.tire, m.olive].includes(mat)) return 'metal';
    if ([m.wood, m.darkWood, m.crate].includes(mat)) return 'wood';
    return 'hard';
  }

  // Ground type under a point, for footstep sounds.
  surfaceAt(x, y, z) {
    const b = this.insideBuilding(x, z);
    if (b && b.enterable && y >= 0.05) return 'wood';
    if (b) return 'hard';
    if (this.onRoad(x, z, 2.5)) return 'hard';
    if (this.helipad && Math.abs(x - this.helipad.x) < 11 && Math.abs(z - this.helipad.z) < 11) return 'hard';
    return 'grass';
  }

  addCollider(minX, minY, minZ, maxX, maxY, maxZ) {
    const c = { minX, minY, minZ, maxX, maxY, maxZ };
    this.colliders.push(c);
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const k = i * 1000 + j;
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(c);
      }
    }
    return c;
  }

  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const list = this.grid.get(i * 1000 + j);
        if (!list) continue;
        for (const c of list) {
          if (c._s !== s) { c._s = s; out.push(c); }
        }
      }
    }
    return out;
  }

  // ---------- collision ----------
  // Pushes a vertical cylinder out of colliders. Returns true if it hit something.
  collide(pos, radius, feetY, height, step = 0.45) {
    const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._q || (this._q = []));
    let hit = false;
    for (const c of list) {
      if (c.maxY <= feetY + step || c.minY >= feetY + height) continue;
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      hit = true;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre is inside the box: leave by the shortest side.
        const pl = pos.x - c.minX, pr = c.maxX - pos.x, pb = pos.z - c.minZ, pf = c.maxZ - pos.z;
        const m = Math.min(pl, pr, pb, pf);
        if (m === pl) pos.x = c.minX - radius;
        else if (m === pr) pos.x = c.maxX + radius;
        else if (m === pb) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
    const lim = HALF - radius;
    if (pos.x < -lim) { pos.x = -lim; hit = true; }
    if (pos.x > lim) { pos.x = lim; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; hit = true; }
    if (pos.z > lim) { pos.z = lim; hit = true; }
    return hit;
  }

  // Highest surface under the cylinder that is at most `step` above the feet.
  groundAt(pos, radius, feetY, step = 0.45) {
    let g = 0;
    const list = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._q || (this._q = []));
    for (const c of list) {
      if (c.maxY > feetY + step || c.maxY <= g) continue;
      const cx = clamp(pos.x, c.minX, c.maxX);
      const cz = clamp(pos.z, c.minZ, c.maxZ);
      const dx = pos.x - cx, dz = pos.z - cz;
      if (dx * dx + dz * dz < radius * radius * 0.6) g = c.maxY;
    }
    return g;
  }

  // Distance along a ray to the first solid surface (colliders + ground).
  // The collider that was hit is left in this.lastHit (null for the ground).
  raycast(o, d, maxT = 200) {
    let best = maxT;
    this.lastHit = null;
    if (d.y < -1e-6) best = Math.min(best, -o.y / d.y);
    // Walk the grid cells the ray passes through (coarse: sample along the ray).
    const s = ++this.stamp;
    const stepLen = CELL * 0.5;
    for (let t = 0; t <= best + CELL; t += stepLen) {
      const x = o.x + d.x * t, z = o.z + d.z * t;
      const i = Math.floor(x / CELL), j = Math.floor(z / CELL);
      for (let a = -1; a <= 1; a++) {
        for (let b = -1; b <= 1; b++) {
          const list = this.grid.get((i + a) * 1000 + (j + b));
          if (!list) continue;
          for (const c of list) {
            if (c._s === s) continue;
            c._s = s;
            const h = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, c, best);
            if (h < best) { best = h; this.lastHit = c; }
          }
        }
      }
    }
    return best;
  }

  lineOfSight(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const d = { x: dx / len, y: dy / len, z: dz / len };
    return this.raycast(a, d, len) >= len - 0.05;
  }

  // Inside a building footprint (used by the spawner and by the sky light check).
  insideBuilding(x, z, pad = 0) {
    for (const b of this.buildings) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return b;
    }
    return null;
  }

  isFree(x, z, r) {
    if (Math.abs(x) > HALF - r || Math.abs(z) > HALF - r) return false;
    const list = this.query(x - r, z - r, x + r, z + r, []);
    for (const c of list) {
      if (c.maxY < 0.5) continue;
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return false;
    }
    return !this.insideBuilding(x, z, 0.5);
  }

  onRoad(x, z, pad = 0) {
    for (const r of ROADS) {
      if (Math.abs(x - r) < ROAD_W / 2 + pad || Math.abs(z - r) < ROAD_W / 2 + pad) return true;
    }
    return false;
  }

  // ---------- containers & pickups ----------
  addContainer(x, y, z, kind, extra = {}) {
    const c = {
      x, y, z, kind, label: CONTAINER_LABEL[kind] || kind,
      items: rollLoot(kind, this.lootMul, this.rng), searched: false, ...extra,
    };
    this.containers.push(c);
    return c;
  }

  addPickup(id, qty, x, y, z) {
    const g = new THREE.Group();
    const color = new THREE.Color(ITEMS[id].color);
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.22, 0.26),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.25, roughness: 0.6 }),
    );
    g.add(box);
    g.position.set(x, y + 0.3, z);
    box.castShadow = true;
    this.dynamic.add(g);
    const p = { id, qty, mesh: g, x, y: y + 0.3, z, t: Math.random() * 6, life: 180 };
    this.pickups.push(p);
    return p;
  }

  removePickup(p) {
    this.dynamic.remove(p.mesh);
    p.mesh.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    this.pickups.splice(this.pickups.indexOf(p), 1);
  }

  // ---------- town ----------
  build() {
    const m = this.mats;

    // Ground, roads, sidewalks
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), m.grass);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const L = HALF * 2 + 4;
    for (const p of ROADS) {
      this.box(p, 0, 0, ROAD_W + 5, 0.025, L, m.sidewalk, false, 3);
      this.box(0, 0, p, L, 0.025, ROAD_W + 5, m.sidewalk, false, 3);
    }
    for (const p of ROADS) {
      this.box(p, 0, 0, ROAD_W, 0.045, L, m.asphalt, false, 6);
      this.box(0, 0, p, L, 0.045, ROAD_W, m.asphalt, false, 6);
    }
    for (const p of ROADS) {
      for (let s = -HALF; s < HALF; s += 7) {
        if (ROADS.some((q) => Math.abs(s + 1.5 - q) < ROAD_W / 2 + 1)) continue;
        this.box(p, 0.045, s + 1.5, 0.18, 0.008, 3, m.line, false, 0);
        this.box(s + 1.5, 0.045, p, 3, 0.008, 0.18, m.line, false, 0);
      }
    }

    // Perimeter wall
    const WH = 4.2;
    this.box(0, 0, -HALF - 0.5, L, WH, 1, m.concrete, true, 3);
    this.box(0, 0, HALF + 0.5, L, WH, 1, m.concrete, true, 3);
    this.box(-HALF - 0.5, 0, 0, 1, WH, L, m.concrete, true, 3);
    this.box(HALF + 0.5, 0, 0, 1, WH, L, m.concrete, true, 3);
    for (let s = -HALF; s <= HALF; s += 12) {
      for (const [x, z] of [[s, -HALF - 0.5], [s, HALF + 0.5], [-HALF - 0.5, s], [HALF + 0.5, s]]) {
        this.box(x, WH, z, 0.12, 1.2, 0.12, m.rust, false);
      }
    }

    // Blocks between roads: [a, b] intervals on each axis
    const spans = [[-HALF + 2, -65], [-55, -5], [5, 55], [65, HALF - 2]];
    const special = {
      '3,0': 'tower',
      '0,3': 'helipad',
      '1,2': 'park',
    };
    for (let ix = 0; ix < 4; ix++) {
      for (let iz = 0; iz < 4; iz++) {
        const [x0, x1] = spans[ix];
        const [z0, z1] = spans[iz];
        const kind = special[`${ix},${iz}`];
        if (kind === 'tower') this.buildTower(x0, x1, z0, z1);
        else if (kind === 'helipad') this.buildHelipad(x0, x1, z0, z1);
        else if (kind === 'park') this.buildPark(x0, x1, z0, z1);
        else this.buildBlock(x0, x1, z0, z1);
      }
    }

    this.buildCheckpoint(0, 0);
    this.scatterCars();
    this.scatterLamps();
    this.scatterTrees(70);
    this.placeRadioParts();
  }

  // Door faces the closest road edge of the block.
  doorSideFor(cx, cz) {
    let best = null, bd = Infinity;
    for (const p of ROADS) {
      const dx = Math.abs(cx - p), dz = Math.abs(cz - p);
      if (dx < bd) { bd = dx; best = cx < p ? 'E' : 'W'; }
      if (dz < bd) { bd = dz; best = cz < p ? 'S' : 'N'; }
    }
    return best;
  }

  buildBlock(x0, x1, z0, z1) {
    const r = this.rng;
    const placed = [];
    const tries = 40;
    let count = 0;
    const target = 2 + Math.floor(r() * 3);
    for (let t = 0; t < tries && count < target; t++) {
      const tall = r() < 0.3;
      const w = tall ? 10 + r() * 8 : 8 + r() * 5;
      const d = tall ? 10 + r() * 6 : 7 + r() * 5;
      const cx = x0 + 3 + w / 2 + r() * Math.max(0, x1 - x0 - 6 - w);
      const cz = z0 + 3 + d / 2 + r() * Math.max(0, z1 - z0 - 6 - d);
      const rect = { minX: cx - w / 2 - 3, maxX: cx + w / 2 + 3, minZ: cz - d / 2 - 3, maxZ: cz + d / 2 + 3 };
      if (rect.minX < x0 - 1 || rect.maxX > x1 + 1 || rect.minZ < z0 - 1 || rect.maxZ > z1 + 1) continue;
      if (placed.some((p) => rect.minX < p.maxX && rect.maxX > p.minX && rect.minZ < p.maxZ && rect.maxZ > p.minZ)) continue;
      placed.push(rect);
      count++;
      if (tall) this.buildApartment(cx, cz, w, d);
      else this.buildHouse(cx, cz, w, d, this.doorSideFor(cx, cz));
    }
    // Yard clutter
    for (let i = 0; i < 4; i++) {
      const x = lerp(x0 + 2, x1 - 2, r()), z = lerp(z0 + 2, z1 - 2, r());
      if (placed.some((p) => x > p.minX - 1 && x < p.maxX + 1 && z > p.minZ - 1 && z < p.maxZ + 1)) continue;
      if (r() < 0.55) {
        this.box(x, 0, z, 1, 1, 1, this.mats.crate, true, 1);
        if (r() < 0.6) this.addContainer(x, 0.5, z, 'crate');
        if (r() < 0.4) this.box(x + 0.2, 1, z - 0.1, 0.8, 0.8, 0.8, this.mats.crate, true, 1);
      } else {
        this.barrel(x, z);
      }
    }
  }

  barrel(x, z) {
    const g = new THREE.CylinderGeometry(0.35, 0.35, 1, 10).translate(x, 0.5, z);
    this.addGeo(g, this.rng() < 0.5 ? this.mats.rust : this.mats.carBlue);
    this.addCollider(x - 0.35, 0, z - 0.35, x + 0.35, 1, z + 0.35);
  }

  buildHouse(cx, cz, w, d, door, opts = {}) {
    const m = this.mats;
    const r = this.rng;
    const H = 3.4, T = 0.3;
    const wall = opts.wall || pick([m.plasterA, m.plasterB, m.plasterC, m.plasterD, m.brick], r);
    const minX = cx - w / 2, maxX = cx + w / 2, minZ = cz - d / 2, maxZ = cz + d / 2;
    this.buildings.push({ minX, maxX, minZ, maxZ, enterable: true });

    // floor
    this.box(cx, 0, cz, w - 0.1, 0.12, d - 0.1, m.wood, true, 2);
    const doorW = 1.6, doorH = 2.4;
    // walls: N (minZ), S (maxZ) run along X; W (minX), E (maxX) run along Z
    const sides = {
      N: { along: 'x', fixed: minZ + T / 2, a: minX, b: maxX },
      S: { along: 'x', fixed: maxZ - T / 2, a: minX, b: maxX },
      W: { along: 'z', fixed: minX + T / 2, a: minZ + T, b: maxZ - T },
      E: { along: 'z', fixed: maxX - T / 2, a: minZ + T, b: maxZ - T },
    };
    let doorPos = null;
    for (const [side, s] of Object.entries(sides)) {
      const len = s.b - s.a;
      const seg = (a, b, y0, y1) => {
        if (b - a < 0.05) return;
        const mid = (a + b) / 2, l = b - a;
        if (s.along === 'x') this.box(mid, y0, s.fixed, l, y1 - y0, T, wall, true, 2.5);
        else this.box(s.fixed, y0, mid, T, y1 - y0, l, wall, true, 2.5);
      };
      const outward = side === 'N' || side === 'W' ? -1 : 1;
      const windows = [];
      if (side === door) {
        const dc = s.a + len / 2 + (r() - 0.5) * Math.max(0, len - doorW - 3);
        seg(s.a, dc - doorW / 2, 0, H);
        seg(dc + doorW / 2, s.b, 0, H);
        seg(dc - doorW / 2, dc + doorW / 2, doorH, H);
        doorPos = s.along === 'x' ? { x: dc, z: s.fixed + outward * 1.2 } : { x: s.fixed + outward * 1.2, z: dc };
        if (dc - s.a > 3) windows.push((s.a + dc - doorW / 2) / 2);
        if (s.b - dc > 3) windows.push((dc + doorW / 2 + s.b) / 2);
      } else {
        seg(s.a, s.b, 0, H);
        const n = Math.max(1, Math.floor(len / 3.5));
        for (let i = 0; i < n; i++) windows.push(s.a + ((i + 0.5) * len) / n);
      }
      for (const p of windows) {
        const off = s.fixed + outward * (T / 2 + 0.02);
        const mat = r() < 0.12 ? m.glassLit : m.glass;
        if (s.along === 'x') this.box(p, 1.1, off, 1.2, 1.1, 0.04, mat, false, 0);
        else this.box(off, 1.1, p, 0.04, 1.1, 1.2, mat, false, 0);
      }
    }
    // roof with a small overhang and a parapet
    this.box(cx, H, cz, w + 0.4, 0.3, d + 0.4, m.roof, true, 0);
    this.box(cx, H + 0.3, minZ - 0.1, w + 0.4, 0.4, 0.2, wall, false, 2);
    this.box(cx, H + 0.3, maxZ + 0.1, w + 0.4, 0.4, 0.2, wall, false, 2);

    // interior: furniture against the back wall + a table
    const back = { N: 'S', S: 'N', E: 'W', W: 'E' }[door];
    const inset = T + 0.45;
    const along = (t) => {
      if (back === 'N') return { x: lerp(minX + 1.2, maxX - 1.2, t), z: minZ + inset, rot: 'x' };
      if (back === 'S') return { x: lerp(minX + 1.2, maxX - 1.2, t), z: maxZ - inset, rot: 'x' };
      if (back === 'W') return { x: minX + inset, z: lerp(minZ + 1.2, maxZ - 1.2, t), rot: 'z' };
      return { x: maxX - inset, z: lerp(minZ + 1.2, maxZ - 1.2, t), rot: 'z' };
    };
    const furniture = opts.furniture || [pick(['cabinet', 'fridge', 'crate'], r), pick(['cabinet', 'desk', 'fridge'], r)];
    furniture.forEach((kind, i) => {
      const p = along(furniture.length === 1 ? 0.5 : i === 0 ? 0.15 + r() * 0.2 : 0.65 + r() * 0.2);
      const [fw, fh, fd, mat] = {
        cabinet: [1.2, 1.8, 0.5, m.darkWood],
        fridge: [0.8, 1.9, 0.7, m.white],
        crate: [1, 1, 1, m.crate],
        desk: [1.6, 0.8, 0.8, m.wood],
        military: [1.2, 0.7, 0.7, m.olive],
        console: [1.8, 1.1, 0.7, m.metal],
      }[kind];
      const sx = p.rot === 'x' ? fw : fd, sz = p.rot === 'x' ? fd : fw;
      this.box(p.x, 0.12, p.z, sx, fh, sz, mat, true, 1);
      if (kind === 'console') {
        this.box(p.x, 1.22, p.z, sx * 0.9, 0.5, sz * 0.5, m.glassLit, false, 0);
        this.radioConsole = { x: p.x, y: 1.2, z: p.z };
      } else {
        const c = this.addContainer(p.x, 0.12 + Math.min(fh, 1.2), p.z, kind);
        c.building = this.buildings.length - 1;
      }
    });
    if (!opts.noTable && w > 8.5 && d > 7.5) {
      this.box(cx, 0.12, cz, 1.4, 0.75, 0.9, m.wood, true, 1);
    }
    return doorPos;
  }

  buildApartment(cx, cz, w, d) {
    const m = this.mats;
    const r = this.rng;
    const floors = 3 + Math.floor(r() * 3);
    const H = floors * 3;
    const wall = pick([m.plasterA, m.plasterB, m.plasterD, m.brick], r);
    this.box(cx, 0, cz, w, H, d, wall, true, 3);
    this.box(cx, H, cz, w + 0.3, 0.4, d + 0.3, m.roof, false, 0);
    this.buildings.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2, enterable: false });
    for (let f = 0; f < floors; f++) {
      const y = f * 3 + 1;
      for (const [len, along] of [[w, 'x'], [d, 'z']]) {
        const n = Math.floor(len / 2.6);
        for (let i = 0; i < n; i++) {
          const p = -len / 2 + ((i + 0.5) * len) / n;
          const mat = r() < 0.08 ? m.glassLit : m.glass;
          if (along === 'x') {
            this.box(cx + p, y, cz - d / 2 - 0.02, 1.3, 1.4, 0.05, mat, false, 0);
            this.box(cx + p, y, cz + d / 2 + 0.02, 1.3, 1.4, 0.05, mat, false, 0);
          } else {
            this.box(cx - w / 2 - 0.02, y, cz + p, 0.05, 1.4, 1.3, mat, false, 0);
            this.box(cx + w / 2 + 0.02, y, cz + p, 0.05, 1.4, 1.3, mat, false, 0);
          }
        }
      }
    }
  }

  buildTower(x0, x1, z0, z1) {
    const m = this.mats;
    const cx = (x0 + x1) / 2 + 4, cz = (z0 + z1) / 2 + 4;
    this.towerPos = { x: cx, z: cz };
    const S = 3.2, H = 28;
    // lattice mast
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.box(cx + (dx * S) / 2, 0, cz + (dz * S) / 2, 0.3, H, 0.3, m.rust, true, 0);
    }
    for (let y = 2; y < H; y += 3) {
      this.box(cx, y, cz - S / 2, S, 0.15, 0.15, m.rust, false, 0);
      this.box(cx, y, cz + S / 2, S, 0.15, 0.15, m.rust, false, 0);
      this.box(cx - S / 2, y, cz, 0.15, 0.15, S, m.rust, false, 0);
      this.box(cx + S / 2, y, cz, 0.15, 0.15, S, m.rust, false, 0);
    }
    this.box(cx, H, cz, 0.2, 4, 0.2, m.metal, false, 0);
    // blinking beacon (dynamic)
    this.beacon = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0xff2a1a, fog: false }),
    );
    this.beacon.position.set(cx, H + 4.2, cz);
    this.scene.add(this.beacon);
    // radio booth with the console
    this.buildHouse(cx - 12, cz + 10, 6, 5, this.doorSideFor(cx - 12, cz + 10), { wall: m.concrete, furniture: ['console'], noTable: true });
    // fence of crates & a generator
    this.box(cx + 6, 0, cz + 6, 2.2, 1.3, 1.2, m.olive, true, 1);
    this.addContainer(cx + 6, 1.3, cz + 6, 'military');
    this.barrel(cx - 5, cz - 4);
    this.barrel(cx - 4.2, cz - 4.6);
  }

  buildHelipad(x0, x1, z0, z1) {
    const m = this.mats;
    const cx = (x0 + x1) / 2 - 4, cz = (z0 + z1) / 2 + 4;
    this.helipad = { x: cx, z: cz };
    this.box(cx, 0, cz, 22, 0.14, 22, m.concrete, true, 4);
    // H marking
    this.box(cx - 2.5, 0.14, cz, 1, 0.01, 7, m.yellow, false, 0);
    this.box(cx + 2.5, 0.14, cz, 1, 0.01, 7, m.yellow, false, 0);
    this.box(cx, 0.14, cz, 4, 0.01, 1, m.yellow, false, 0);
    const ring = new THREE.RingGeometry(7.5, 8.2, 40).rotateX(-Math.PI / 2).translate(cx, 0.155, cz);
    this.addGeo(ring, m.yellow);
    // sandbag ring with gaps facing the roads
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 14) {
      if (Math.abs(Math.sin(a)) < 0.2 || Math.abs(Math.cos(a)) < 0.2) continue;
      const x = cx + Math.cos(a) * 15, z = cz + Math.sin(a) * 15;
      this.box(x, 0, z, 1.7, 1.1, 1.7, m.sandbag, true, 0);
    }
    // tents
    this.box(cx - 19, 0, cz - 17, 6, 2.6, 4, m.olive, true, 2);
    this.box(cx - 19, 2.6, cz - 17, 6.4, 0.6, 3, m.olive, false, 2);
    this.box(cx + 17, 0, cz - 19, 4, 2.6, 6, m.olive, true, 2);
    for (const [x, z] of [[cx - 15, cz - 14], [cx + 14, cz - 15], [cx - 16, cz + 15]]) {
      this.box(x, 0, z, 1.2, 0.7, 0.7, m.olive, true, 1);
      this.addContainer(x, 0.7, z, 'military');
    }
    // parked military truck
    this.box(cx + 16, 0.5, cz + 14, 2.4, 1.4, 6, m.olive, true, 2);
    this.box(cx + 16, 1.9, cz + 12, 2.4, 1.2, 1.8, m.olive, true, 2);
    this.addContainer(cx + 16, 1.9, cz + 17, 'trunk');
  }

  buildPark(x0, x1, z0, z1) {
    const r = this.rng;
    for (let i = 0; i < 22; i++) {
      const x = lerp(x0 + 2, x1 - 2, r()), z = lerp(z0 + 2, z1 - 2, r());
      this.tree(x, z);
    }
    // benches & a kiosk
    for (let i = 0; i < 5; i++) {
      const x = lerp(x0 + 6, x1 - 6, r()), z = lerp(z0 + 6, z1 - 6, r());
      this.box(x, 0.4, z, 1.8, 0.1, 0.5, this.mats.wood, false, 1);
      this.box(x, 0, z, 1.6, 0.4, 0.4, this.mats.metal, true, 0);
    }
    const kx = (x0 + x1) / 2, kz = (z0 + z1) / 2;
    this.buildHouse(kx, kz, 5, 4, this.doorSideFor(kx, kz), { wall: this.mats.plasterC, furniture: ['fridge'], noTable: true });
  }

  buildCheckpoint(cx, cz) {
    const m = this.mats;
    // jersey barriers on the approaches
    for (const [dx, dz, along] of [[0, -12, 'x'], [0, 12, 'x'], [-12, 0, 'z'], [12, 0, 'z']]) {
      for (const o of [-3.2, 3.2]) {
        const x = cx + dx + (along === 'x' ? o : 0), z = cz + dz + (along === 'z' ? o : 0);
        if (along === 'x') this.box(x, 0, z, 2.8, 0.9, 0.6, m.concrete, true, 1);
        else this.box(x, 0, z, 0.6, 0.9, 2.8, m.concrete, true, 1);
      }
    }
    // sandbag nest and military crates
    this.box(cx + 7, 0, cz + 7, 3.4, 1.1, 0.9, m.sandbag, true, 0);
    this.box(cx + 8.3, 0, cz + 5.6, 0.9, 1.1, 2.2, m.sandbag, true, 0);
    this.box(cx - 7.5, 0, cz - 7.5, 1.2, 0.7, 0.7, m.olive, true, 1);
    this.addContainer(cx - 7.5, 0.7, cz - 7.5, 'military');
    this.box(cx + 7.5, 0, cz - 7.8, 1.2, 0.7, 0.7, m.olive, true, 1);
    this.addContainer(cx + 7.5, 0.7, cz - 7.8, 'military');
    // abandoned APC-ish box
    this.box(cx - 6, 0.4, cz + 7.5, 5.5, 1.6, 2.6, m.olive, true, 2);
    this.box(cx - 6.5, 2, cz + 7.5, 2, 0.7, 1.8, m.olive, true, 1);
    this.box(cx - 4.8, 2.3, cz + 7.5, 2.4, 0.18, 0.18, m.metal, false, 0);
    // blood stains
    for (let i = 0; i < 6; i++) {
      this.box(cx + (this.rng() - 0.5) * 16, 0.1, cz + (this.rng() - 0.5) * 16, 1 + this.rng(), 0.012, 1 + this.rng(), m.blood, false, 0);
    }
  }

  car(x, z, alongX) {
    const m = this.mats;
    const r = this.rng;
    const mat = pick([m.carRed, m.carBlue, m.carWhite, m.carGreen, m.rust], r);
    const L = 4.2, W = 1.9;
    const w = alongX ? L : W, d = alongX ? W : L;
    this.box(x, 0.35, z, w, 0.9, d, mat, true, 0);
    const cw = alongX ? 2.2 : 1.7, cd = alongX ? 1.7 : 2.2;
    const cabOff = -0.2;
    const cx = x + (alongX ? cabOff : 0), cz = z + (alongX ? 0 : cabOff);
    this.box(cx, 1.25, cz, cw, 0.7, cd, m.glass, true, 0);
    this.box(cx, 1.95, cz, cw * 0.95, 0.06, cd * 0.95, mat, false, 0);
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const wx = x + (alongX ? a * 1.35 : b * 0.85), wz = z + (alongX ? b * 0.85 : a * 1.35);
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.25, 12).rotateZ(Math.PI / 2);
      if (alongX) g.rotateY(Math.PI / 2);
      this.addGeo(g.translate(wx, 0.36, wz), m.tire);
    }
    if (r() < 0.65) {
      const back = r() < 0.5 ? -1 : 1;
      const tx = x + (alongX ? back * (L / 2 + 0.2) : 0), tz = z + (alongX ? 0 : back * (L / 2 + 0.2));
      this.addContainer(tx, 1.0, tz, 'trunk');
    }
  }

  scatterCars() {
    const r = this.rng;
    let n = 0;
    for (let tries = 0; tries < 200 && n < 26; tries++) {
      const road = pick(ROADS, r);
      const alongX = r() < 0.5;
      const s = lerp(-HALF + 8, HALF - 8, r());
      const lane = (r() < 0.5 ? -1 : 1) * (1.8 + r() * 1.2);
      const x = alongX ? s : road + lane;
      const z = alongX ? road + lane : s;
      if (Math.hypot(x, z) < 16) continue; // keep checkpoint clear
      if (Math.hypot(x - 2, z - 22) < 8) continue; // keep spawn clear
      // not in intersections
      if (ROADS.some((p) => Math.abs((alongX ? x : z) - p) < ROAD_W / 2 + 3)) continue;
      if (!this.isFree(x, z, 3)) continue;
      this.car(x, z, alongX);
      n++;
    }
  }

  scatterLamps() {
    const m = this.mats;
    for (const p of ROADS) {
      for (let s = -HALF + 10; s < HALF; s += 22) {
        if (ROADS.some((q) => Math.abs(s - q) < 8)) continue;
        for (const [x, z] of [[p + 6.2, s], [s, p - 6.2]]) {
          if (!this.isFree(x, z, 0.6)) continue;
          this.box(x, 0, z, 0.16, 5.5, 0.16, m.metal, true, 0);
          this.box(x, 5.4, z, 0.5, 0.15, 0.3, m.metal, false, 0);
        }
      }
    }
  }

  tree(x, z) {
    const m = this.mats;
    const r = this.rng;
    const h = 2.2 + r() * 1.6;
    this.addGeo(new THREE.CylinderGeometry(0.16, 0.26, h, 7).translate(x, h / 2, z), m.bark);
    this.addCollider(x - 0.25, 0, z - 0.25, x + 0.25, h, z + 0.25);
    const leaf = r() < 0.5 ? m.leaves : m.leaves2;
    if (r() < 0.5) {
      this.addGeo(new THREE.ConeGeometry(1.8, 3.2, 7).translate(x, h + 1.2, z), leaf);
      this.addGeo(new THREE.ConeGeometry(1.3, 2.4, 7).translate(x, h + 2.6, z), leaf);
    } else {
      const s = 1.4 + r() * 0.8;
      this.addGeo(new THREE.IcosahedronGeometry(s, 0).translate(x, h + s * 0.6, z), leaf);
    }
  }

  scatterTrees(n) {
    const r = this.rng;
    let placed = 0;
    for (let t = 0; t < n * 6 && placed < n; t++) {
      const x = lerp(-HALF + 3, HALF - 3, r()), z = lerp(-HALF + 3, HALF - 3, r());
      if (this.onRoad(x, z, 2.5)) continue;
      if (!this.isFree(x, z, 2)) continue;
      if (this.helipad && Math.hypot(x - this.helipad.x, z - this.helipad.z) < 22) continue;
      this.tree(x, z);
      placed++;
    }
  }

  // Hide the three radio parts in house containers far from the start and from each other.
  placeRadioParts() {
    const r = this.rng;
    const candidates = this.containers.filter((c) => c.building != null && Math.hypot(c.x - 2, c.z - 22) > 40);
    const chosen = [];
    for (let t = 0; t < 400 && chosen.length < 3; t++) {
      const c = pick(candidates, r);
      if (chosen.includes(c)) continue;
      if (chosen.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 60)) continue;
      chosen.push(c);
    }
    // Fallback if the spread constraint could not be met.
    for (const c of candidates) if (chosen.length < 3 && !chosen.includes(c)) chosen.push(c);
    for (const c of chosen) c.items.push({ id: 'radio_part', qty: 1 });
    this.radioContainers = chosen;
  }

  finalize() {
    for (const [mat, geos] of this.statics) {
      const mesh = new THREE.Mesh(mergeGeos(geos), mat);
      mesh.castShadow = mat !== this.mats.asphalt && mat !== this.mats.sidewalk && mat !== this.mats.line && mat !== this.mats.blood;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
    }
    this.statics.clear();
  }

  // ---------- sky & lighting ----------
  makeSky() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xbfd0dc, 0x3a3326, 1);
    s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    s.add(this.sun);
    s.add(this.sun.target);
    s.fog = new THREE.Fog(0x9fb0b8, 20, 170);
    s.background = new THREE.Color(0x9fb0b8);

    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 900; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.08;
      const y = v, rr = Math.sqrt(1 - y * y);
      pts.push(Math.cos(u) * rr * 380, y * 380, Math.sin(u) * rr * 380);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    s.add(this.stars);

    this.cDay = new THREE.Color(0x9fb0b8);
    this.cDusk = new THREE.Color(0xc98a5a);
    this.cNight = new THREE.Color(0x070a10);
    this.tmpC = new THREE.Color();
  }

  // t: fraction of the day, 0 = midnight, 0.5 = noon.
  updateSky(t, center, dt) {
    const ang = (t - 0.25) * Math.PI * 2;
    const elev = Math.sin(ang);
    const dayF = smooth(clamp((elev + 0.12) / 0.4, 0, 1));
    const dusk = elev > -0.25 ? clamp(1 - Math.abs(elev) / 0.3, 0, 1) : 0;

    const c = this.tmpC.copy(this.cNight).lerp(this.cDay, dayF).lerp(this.cDusk, dusk * 0.55);
    this.scene.background.copy(c);
    this.scene.fog.color.copy(c);
    this.scene.fog.near = lerp(4, 25, dayF);
    this.scene.fog.far = lerp(55, 175, dayF);

    // Sun by day, a weak blue moon by night.
    const lightUp = elev > 0 ? 1 : -1;
    const dirX = Math.cos(ang) * lightUp, dirY = Math.abs(elev) * 0.9 + 0.25, dirZ = 0.45;
    this.sun.position.set(center.x + dirX * 80, dirY * 80, center.z + dirZ * 80);
    this.sun.target.position.set(center.x, 0, center.z);
    if (elev > 0) {
      this.sun.color.setRGB(1, lerp(0.62, 0.96, clamp(elev * 3, 0, 1)), lerp(0.4, 0.9, clamp(elev * 3, 0, 1)));
      this.sun.intensity = 2.7 * dayF;
    } else {
      this.sun.color.setRGB(0.55, 0.65, 0.95);
      this.sun.intensity = 0.28 * (1 - dayF);
    }
    this.hemi.intensity = lerp(0.14, 1.05, dayF);
    this.hemi.color.setRGB(lerp(0.35, 0.75, dayF), lerp(0.42, 0.8, dayF), lerp(0.62, 0.86, dayF));
    this.stars.material.opacity = clamp(1 - dayF * 1.6, 0, 1);
    this.stars.position.set(center.x, 0, center.z);
    this.mats.glassLit.emissiveIntensity = lerp(1.4, 0, dayF);

    if (this.beacon) {
      this.beaconT = (this.beaconT || 0) + dt;
      this.beacon.visible = this.beaconT % 1.6 < 0.8;
    }
    // pickups bob & spin
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.t += dt;
      p.life -= dt;
      if (p.life <= 0) { this.removePickup(p); continue; }
      p.mesh.rotation.y = p.t * 1.5;
      p.mesh.position.y = p.y + Math.sin(p.t * 2.5) * 0.06;
    }
    return { dayF, elev };
  }
}
