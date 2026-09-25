// World core: terrain, static geometry (merged per material and per 64 m chunk
// so off-screen chunks are culled), colliders, bullets and sight lines, loot
// containers, ground pickups and the day/night sky. What stands where is
// decided in zone.js; trees and wrecks are instanced in nature.js.
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smooth, rayAABB } from './util.js';
import { rollLoot, ITEMS } from './items.js';
import { Terrain, WATER_Y, distToPath } from './terrain.js';
import { PLAN, buildZone } from './zone.js';
import { Nature } from './nature.js';

export const HALF = PLAN.half; // playable area is [-HALF, HALF] on X and Z
const CELL = 8; // collider grid cell size
const CHUNK = 128; // static geometry chunk size

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
  t.anisotropy = 8;
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
  // ground detail: light speckle multiplied over the terrain's vertex colours
  const ground = canvasTex(256, (g, s) => {
    speckle(g, s, '#d9d9d9', ['#b8b8b8', '#efefef', '#a6a6a6', '#c8c8c8'], 7000, 1, 4);
    g.strokeStyle = 'rgba(90,90,90,0.25)';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * s, y = Math.random() * s;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (Math.random() - 0.5) * 6, y - 4 - Math.random() * 8);
      g.stroke();
    }
  });
  const asphalt = canvasTex(256, (g, s) => {
    speckle(g, s, '#3a3b3d', ['#2a2b2d', '#46474a', '#505053', '#262626'], 6000, 1, 3);
    g.strokeStyle = 'rgba(15,15,15,0.7)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      g.beginPath();
      let x = Math.random() * s, y = Math.random() * s;
      g.moveTo(x, y);
      for (let k = 0; k < 8; k++) { x += (Math.random() - 0.5) * 40; y += (Math.random() - 0.5) * 40; g.lineTo(x, y); }
      g.stroke();
    }
  });
  const dirt = canvasTex(256, (g, s) => {
    speckle(g, s, '#7a6650', ['#6a5642', '#8a7560', '#5e4c3a', '#94826c'], 7000, 1, 4);
    // wheel ruts
    g.fillStyle = 'rgba(60,45,32,0.35)';
    g.fillRect(s * 0.22, 0, s * 0.12, s);
    g.fillRect(s * 0.66, 0, s * 0.12, s);
  });
  const grime = canvasTex(256, (g, s) => {
    speckle(g, s, '#e6e6e6', ['#bdbdbd', '#d0d0d0', '#f5f5f5', '#a8a8a8'], 3000, 2, 6);
    const grd = g.createLinearGradient(0, 0, 0, s);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, 'rgba(60,50,40,0.35)');
    g.fillStyle = grd;
    g.fillRect(0, 0, s, s);
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
  // round logs of an izba, stacked horizontally
  const logs = canvasTex(256, (g, s) => {
    const h = 32;
    for (let y = 0; y < s; y += h) {
      const grd = g.createLinearGradient(0, y, 0, y + h);
      const v = 105 + Math.random() * 30;
      grd.addColorStop(0, `rgb(${v * 0.55},${v * 0.42},${v * 0.3})`);
      grd.addColorStop(0.45, `rgb(${v},${v * 0.78},${v * 0.56})`);
      grd.addColorStop(1, `rgb(${v * 0.45},${v * 0.34},${v * 0.24})`);
      g.fillStyle = grd;
      g.fillRect(0, y, s, h);
      g.fillStyle = 'rgba(40,28,18,0.5)';
      for (let k = 0; k < 6; k++) g.fillRect(Math.random() * s, y + 4 + Math.random() * (h - 8), 12 + Math.random() * 30, 1);
    }
  });
  // painted vertical planks, paint peeling
  const planks = canvasTex(256, (g, s) => {
    g.fillStyle = '#dcdcdc';
    g.fillRect(0, 0, s, s);
    for (let x = 0; x < s; x += 21) {
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x, 0, 2, s);
    }
    for (let i = 0; i < 90; i++) {
      g.fillStyle = `rgba(${90 + Math.random() * 40},${70 + Math.random() * 30},${50},${0.35 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * s, Math.random() * s, 3 + Math.random() * 14, 2 + Math.random() * 6);
    }
  });
  // corrugated roofing sheets
  const roofing = canvasTex(128, (g, s) => {
    for (let x = 0; x < s; x++) {
      const v = 150 + Math.sin((x / s) * Math.PI * 16) * 45;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(x, 0, 1, s);
    }
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(120,60,30,${0.2 + Math.random() * 0.4})`;
      g.fillRect(Math.random() * s, Math.random() * s, 2 + Math.random() * 10, 4 + Math.random() * 20);
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
  const stone = canvasTex(256, (g, s) => {
    g.fillStyle = '#6f6a62';
    g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) {
      const v = 90 + Math.random() * 60;
      g.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`;
      g.beginPath();
      g.ellipse(Math.random() * s, Math.random() * s, 10 + Math.random() * 18, 7 + Math.random() * 10, Math.random() * 3, 0, Math.PI * 2);
      g.fill();
    }
  });
  const hay = canvasTex(128, (g, s) => {
    speckle(g, s, '#c9a55a', ['#b08a42', '#dcbc70', '#9c7a38', '#e6cb86'], 3000, 1, 5);
  });
  return { ground, asphalt, dirt, grime, brick, logs, planks, roofing, wood, concrete, stone, hay };
}

// ---------- geometry helpers ----------
// Box whose UVs are scaled to world units so textures don't stretch.
export function boxGeo(w, h, d, tile) {
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
  chest: 'сундук', shelf: 'стеллаж', toolbox: 'ящик с инструментами',
};

export class World {
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.lootMul = opts.lootMul ?? 1;
    this.rng = mulberry32(opts.seed ?? 1987);
    this.assets = opts.assets || {};
    this.colliders = [];
    this.grid = new Map();
    this.stamp = 0;
    this.containers = [];
    this.buildings = []; // {minX,maxX,minZ,maxZ,enterable,floor}
    this.pickups = [];
    this.roads = []; // {pts, w, kind}
    this.fields = []; // {minX,maxX,minZ,maxZ}
    this.pois = []; // named places for the map
    this.statics = new Map(); // "chunk|material id" -> {mat, geos}
    this.tex = makeTextures();
    this.mats = this.makeMaterials();
    this.dynamic = new THREE.Group();
    scene.add(this.dynamic);
    this.terrain = new Terrain(this.rng, PLAN);
    this.nature = new Nature(this, this.assets.nature);
    buildZone(this);
    this.addTerrain();
    this.nature.finalize();
    this.finalize();
    this.makeSky();
  }

  makeMaterials() {
    const t = this.tex;
    const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
    const m = {
      terrain: std({ map: t.ground, vertexColors: true, roughness: 1 }),
      asphalt: std({ map: t.asphalt }),
      dirtRoad: std({ map: t.dirt }),
      concrete: std({ map: t.concrete }),
      line: std({ color: 0xcfc6a0 }),
      plasterA: std({ map: t.grime, color: 0xc9bfa6 }),
      plasterB: std({ map: t.grime, color: 0x9fa89a }),
      whitewash: std({ map: t.grime, color: 0xe8e4d8 }),
      brick: std({ map: t.brick }),
      logs: std({ map: t.logs }),
      logsDark: std({ map: t.logs, color: 0x8a7a6a }),
      planksBlue: std({ map: t.planks, color: 0x6d8aa0 }),
      planksGreen: std({ map: t.planks, color: 0x7f9a6a }),
      planksOchre: std({ map: t.planks, color: 0xc9a060 }),
      planksGrey: std({ map: t.planks, color: 0x9a968c }),
      trim: std({ color: 0xe6e2d6 }),
      trimBlue: std({ color: 0x4f7ca8 }),
      roofMetal: std({ map: t.roofing, color: 0x8b9aa0, roughness: 0.6, metalness: 0.35, side: THREE.DoubleSide }),
      roofRust: std({ map: t.roofing, color: 0xa0674a, roughness: 0.75, metalness: 0.25, side: THREE.DoubleSide }),
      roofGreen: std({ map: t.roofing, color: 0x5d7a5a, roughness: 0.65, metalness: 0.3, side: THREE.DoubleSide }),
      roof: std({ color: 0x3a3634 }),
      stone: std({ map: t.stone }),
      glass: std({ color: 0x1c262b, roughness: 0.25, metalness: 0.4 }),
      glassLit: std({ color: 0x2a2418, emissive: 0xffb65c, emissiveIntensity: 0 }),
      wood: std({ map: t.wood }),
      darkWood: std({ map: t.wood, color: 0x6b5b4b }),
      fence: std({ map: t.wood, color: 0x8f8472 }),
      metal: std({ color: 0x6d7274, roughness: 0.6, metalness: 0.5 }),
      rust: std({ color: 0x7a4a2e, roughness: 0.8, metalness: 0.3 }),
      white: std({ color: 0xd8d8d2, roughness: 0.5 }),
      stove: std({ map: t.grime, color: 0xf0ece2 }),
      gold: std({ color: 0xc9a23a, roughness: 0.35, metalness: 0.8 }),
      domeBlue: std({ color: 0x3f6aa0, roughness: 0.5, metalness: 0.3 }),
      carRed: std({ color: 0x7a2a22, roughness: 0.6, metalness: 0.3 }),
      tire: std({ color: 0x151515 }),
      crate: std({ map: t.wood, color: 0x9c7b52 }),
      olive: std({ color: 0x4f5a35, roughness: 0.85 }),
      sandbag: std({ color: 0x8e7f5e, roughness: 1, flatShading: true }),
      hay: std({ map: t.hay }),
      soil: std({ map: t.dirt, color: 0x6b5a48 }),
      yellow: std({ color: 0xd9b23a }),
      red: std({ color: 0x8c1f1a }),
      blood: std({ color: 0x3d0a08, roughness: 0.4 }),
      water: new THREE.MeshStandardMaterial({ color: 0x3c5a5e, roughness: 0.08, metalness: 0.2, transparent: true, opacity: 0.82 }),
    };
    let id = 0;
    for (const v of Object.values(m)) v.userData.id = id++;
    return m;
  }

  // ---------- primitives ----------
  addGeo(geo, mat) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cx = Math.floor(((bb.min.x + bb.max.x) / 2) / CHUNK), cz = Math.floor(((bb.min.z + bb.max.z) / 2) / CHUNK);
    const key = `${cx},${cz}|${mat.userData.id}`;
    if (!this.statics.has(key)) this.statics.set(key, { mat, geos: [] });
    this.statics.get(key).geos.push(geo);
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
    if ([m.carRed, m.rust, m.metal, m.tire, m.olive, m.roofMetal, m.roofRust, m.roofGreen].includes(mat)) return 'metal';
    if ([m.wood, m.darkWood, m.crate, m.logs, m.logsDark, m.fence, m.planksBlue, m.planksGreen, m.planksOchre, m.planksGrey].includes(mat)) return 'wood';
    return 'hard';
  }

  ground(x, z) {
    return this.terrain.height(x, z);
  }

  // Ground type under a point, for footstep sounds.
  surfaceAt(x, y, z) {
    const b = this.insideBuilding(x, z);
    if (b && b.enterable && y >= b.floor - 0.05) return 'wood';
    if (this.terrain.isWater(x, z) && y < WATER_Y + 0.3) return 'mud';
    const road = this.roadAt(x, z);
    if (road) return road.kind === 'asphalt' ? 'hard' : 'gravel';
    if (this.inForest(x, z)) return 'leaves';
    return 'grass';
  }

  roadAt(x, z, pad = 0) {
    for (const r of this.roads) {
      if (distToPath(x, z, r.pts) < r.w / 2 + pad) return r;
    }
    return null;
  }

  onRoad(x, z, pad = 0) {
    return !!this.roadAt(x, z, pad);
  }

  inField(x, z, pad = 0) {
    return this.fields.some((f) => x > f.minX - pad && x < f.maxX + pad && z > f.minZ - pad && z < f.maxZ + pad);
  }

  inForest(x, z) {
    return this.nature.density(x, z) > 0.55;
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
      const dx = pos.x - cx, dz = pos.z - cz;
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
    const lim = HALF - 2 - radius;
    if (pos.x < -lim) { pos.x = -lim; hit = true; }
    if (pos.x > lim) { pos.x = lim; hit = true; }
    if (pos.z < -lim) { pos.z = -lim; hit = true; }
    if (pos.z > lim) { pos.z = lim; hit = true; }
    return hit;
  }

  // Highest surface under the cylinder: the terrain or a collider top that is
  // at most `step` above the feet.
  groundAt(pos, radius, feetY, step = 0.45) {
    let g = this.terrain.height(pos.x, pos.z);
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

  // Distance along a ray to the first solid surface (colliders + terrain).
  // The collider that was hit is left in this.lastHit (null for the ground).
  raycast(o, d, maxT = 200) {
    this.lastHit = null;
    let best = Math.min(maxT, this.terrain.raycast(o, d, maxT));
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

  insideBuilding(x, z, pad = 0) {
    for (const b of this.buildings) {
      if (x > b.minX - pad && x < b.maxX + pad && z > b.minZ - pad && z < b.maxZ + pad) return b;
    }
    return null;
  }

  // Free standing spot on dry land (spawns, scatter).
  isFree(x, z, r) {
    if (Math.abs(x) > HALF - 4 - r || Math.abs(z) > HALF - 4 - r) return false;
    if (this.terrain.isWater(x, z)) return false;
    const gy = this.terrain.height(x, z);
    const list = this.query(x - r, z - r, x + r, z + r, []);
    for (const c of list) {
      if (c.maxY < gy + 0.5) continue;
      if (x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return false;
    }
    return !this.insideBuilding(x, z, 0.5);
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

  // ---------- terrain, water, roads ----------
  terrainColor(x, z, h, out) {
    const t = this.terrain;
    const n = t.fbm(x / 35, z / 35, 3);
    // meadow green with dry patches
    out.setRGB(0.36 + n * 0.06, 0.42 + n * 0.05, 0.22 + n * 0.03);
    const dry = smooth(clamp(t.fbm(x / 90 + 40, z / 90, 2) * 2 + 0.2, 0, 1));
    out.lerp(new THREE.Color(0.55, 0.5, 0.3), dry * 0.35);
    if (this.inField(x, z)) out.lerp(new THREE.Color(0.78, 0.66, 0.36), 0.85);
    const forest = this.nature.density(x, z);
    if (forest > 0.4) out.lerp(new THREE.Color(0.28, 0.26, 0.16), smooth(clamp((forest - 0.4) * 2.5, 0, 1)) * 0.7);
    // wet sand and mud at the water line
    if (h < WATER_Y + 0.9) out.lerp(new THREE.Color(0.45, 0.4, 0.3), smooth(clamp((WATER_Y + 0.9 - h) / 1.2, 0, 1)));
    // rock on steep slopes
    const sl = t.slope(x, z);
    if (sl > 0.35) out.lerp(new THREE.Color(0.45, 0.43, 0.4), smooth(clamp((sl - 0.35) * 3, 0, 1)));
  }

  addTerrain() {
    const mesh = this.terrain.buildMesh((x, z, h, c) => this.terrainColor(x, z, h, c), this.mats.terrain, 3);
    this.scene.add(mesh);
    this.terrainMesh = mesh;
    // one water sheet: the ground covers it everywhere except the river and lake
    const water = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), this.mats.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = WATER_Y;
    water.receiveShadow = true;
    this.scene.add(water);
  }

  // Road ribbon draped over the terrain; skipped where a bridge carries it.
  addRoad(pts, w, kind) {
    this.roads.push({ pts, w, kind });
    const mat = kind === 'asphalt' ? this.mats.asphalt : this.mats.dirtRoad;
    const step = 3;
    for (let s = 0; s < pts.length - 1; s++) {
      const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / step));
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      const px = -dz * (w / 2), pz = dx * (w / 2);
      const pos = [], uv = [], idx = [];
      let v = 0;
      for (let i = 0; i <= n; i++) {
        const x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n);
        const lx = x + px, lz = z + pz, rx = x - px, rz = z - pz;
        pos.push(lx, this.terrain.height(lx, lz) + 0.06, lz, rx, this.terrain.height(rx, rz) + 0.06, rz);
        const u = (s * 1000 + (i / n) * len) / (w * 1.5);
        uv.push(0, u, 1, u);
        // counter-clockwise seen from above, so the ribbon faces up
        if (i > 0) idx.push(v - 2, v, v - 1, v - 1, v, v + 1);
        v += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      this.addGeo(g, mat);
    }
  }

  finalize() {
    const noShadow = new Set([this.mats.asphalt, this.mats.dirtRoad, this.mats.line, this.mats.blood, this.mats.soil]);
    for (const { mat, geos } of this.statics.values()) {
      const mesh = new THREE.Mesh(mergeGeos(geos), mat);
      mesh.castShadow = !noShadow.has(mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.scene.add(mesh);
    }
    this.statics.clear();
  }

  // Top-down map for the minimap (canvas 2D, x right, z down).
  renderMap(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const k = size / (HALF * 2);
    const X = (x) => (x + HALF) * k;
    const img = g.createImageData(size, size);
    const col = new THREE.Color();
    const cell = HALF * 2 / size;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++) {
        const x = -HALF + (px + 0.5) * cell, z = -HALF + (py + 0.5) * cell;
        const h = this.terrain.height(x, z);
        if (h < WATER_Y) col.setRGB(0.2, 0.32, 0.38);
        else {
          this.terrainColor(x, z, h, col);
          const shade = 0.75 + clamp((h - 3) / 30, -0.2, 0.35); // higher ground lighter
          col.multiplyScalar(shade);
        }
        const o = (py * size + px) * 4;
        img.data[o] = col.r * 255; img.data[o + 1] = col.g * 255; img.data[o + 2] = col.b * 255; img.data[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const r of this.roads) {
      g.strokeStyle = r.kind === 'asphalt' ? '#55575b' : '#8a7458';
      g.lineWidth = Math.max(2, r.w * k);
      g.beginPath();
      r.pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), X(z)) : g.moveTo(X(x), X(z))));
      g.stroke();
    }
    for (const b of this.buildings) {
      g.fillStyle = b.enterable ? '#c9bea4' : '#8d887e';
      g.fillRect(X(b.minX), X(b.minZ), Math.max(2, (b.maxX - b.minX) * k), Math.max(2, (b.maxZ - b.minZ) * k));
    }
    if (this.helipad) {
      g.strokeStyle = '#d9b23a';
      g.lineWidth = 3;
      g.beginPath();
      g.arc(X(this.helipad.x), X(this.helipad.z), 8 * k, 0, Math.PI * 2);
      g.stroke();
    }
    return { canvas: c, k };
  }

  // ---------- sky & lighting ----------
  makeSky() {
    const s = this.scene;
    this.hemi = new THREE.HemisphereLight(0xbfd0dc, 0x3a3326, 1);
    s.add(this.hemi);
    // Roofs block the sun completely (no GI), so rooms need their own fill.
    this.roomLight = new THREE.PointLight(0xffe6c4, 0, 16, 1.2);
    s.add(this.roomLight);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -55; sc.right = 55; sc.top = 55; sc.bottom = -55; sc.near = 1; sc.far = 260;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.05;
    s.add(this.sun);
    s.add(this.sun.target);
    s.fog = new THREE.Fog(0x9fb0b8, 30, 260);
    s.background = new THREE.Color(0x9fb0b8);

    const starGeo = new THREE.BufferGeometry();
    const pts = [];
    for (let i = 0; i < 1200; i++) {
      const u = Math.random() * Math.PI * 2, v = Math.random() * 0.9 + 0.08;
      const y = v, rr = Math.sqrt(1 - y * y);
      pts.push(Math.cos(u) * rr * 480, y * 480, Math.sin(u) * rr * 480);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0 }));
    s.add(this.stars);

    this.cDay = new THREE.Color(0xa7b8bf);
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
    this.scene.fog.near = lerp(5, 40, dayF);
    this.scene.fog.far = lerp(70, 280, dayF);

    // Sun by day, a weak blue moon by night.
    const lightUp = elev > 0 ? 1 : -1;
    const dirX = Math.cos(ang) * lightUp, dirY = Math.abs(elev) * 0.9 + 0.25, dirZ = 0.45;
    const cy = center.y ?? this.terrain.height(center.x, center.z);
    this.sun.position.set(center.x + dirX * 100, cy + dirY * 100, center.z + dirZ * 100);
    this.sun.target.position.set(center.x, cy, center.z);
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
    const indoors = this.insideBuilding(center.x, center.z);
    const inRoom = indoors && indoors.enterable && center.y >= indoors.floor - 0.3 && center.y < indoors.floor + 2.4;
    this.roomLight.position.set(center.x, (inRoom ? indoors.floor : cy) + 2.05, center.z);
    this.roomLight.intensity = inRoom ? 8 : 0;
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
