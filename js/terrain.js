// Terrain: a seeded height field with hills, a river valley, a lake and
// flattened pads for settlements. Heights are cached on a 2 m grid; the mesh,
// physics, bullets and AI all read the same bilinear surface.
import * as THREE from 'three';
import { clamp, lerp, smooth } from './util.js';

export const WATER_Y = 0; // river and lake surface
const RES = 2; // metres per height sample

// Seeded 2D value noise.
function makeNoise(rng) {
  const P = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) P[i] = perm[i & 255];
  const V = new Float32Array(256);
  for (let i = 0; i < 256; i++) V[i] = rng() * 2 - 1;
  const at = (x, z) => V[P[(P[x & 255] + z) & 511]];
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z);
    const fx = smooth(x - xi), fz = smooth(z - zi);
    const a = at(xi, zi), b = at(xi + 1, zi), c = at(xi, zi + 1), d = at(xi + 1, zi + 1);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
  };
}

// Distance from a point to a polyline, plus the index of the closest segment.
export function distToPath(x, z, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    const d = Math.sqrt(ex * ex + ez * ez);
    if (d < best) best = d;
  }
  return best;
}

export class Terrain {
  // plan: { half, river: [[x,z]...], riverW, lake: {x,z,r}, pads: [{x,z,r,fall}], hills: [{x,z,r,h}] }
  constructor(rng, plan) {
    this.plan = plan;
    this.half = plan.half;
    this.noise = makeNoise(rng);
    this.n = Math.round((plan.half * 2) / RES) + 1;
    this.h = new Float32Array(this.n * this.n);
    this.water = new Uint8Array(this.n * this.n); // 1 where the ground is under water
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = -this.half + i * RES, z = -this.half + j * RES;
        const h = this.shape(x, z);
        this.h[j * this.n + i] = h;
        this.water[j * this.n + i] = h < WATER_Y ? 1 : 0;
      }
    }
  }

  fbm(x, z, oct = 4) {
    let s = 0, a = 1, f = 1, norm = 0;
    for (let o = 0; o < oct; o++) {
      s += this.noise(x * f, z * f) * a;
      norm += a;
      a *= 0.5;
      f *= 2.03;
    }
    return s / norm;
  }

  // The analytic shape before caching.
  shape(x, z) {
    const p = this.plan;
    let h = 3 + this.fbm(x / 150, z / 150) * 6 + this.fbm(x / 45 + 17, z / 45 - 9, 3) * 1.8;
    // hills: named bumps (the radio hill) and a rim of higher ground at the edge
    for (const b of p.hills) {
      const d = Math.hypot(x - b.x, z - b.z) / b.r;
      if (d < 1) h += b.h * smooth(1 - d);
    }
    const edge = Math.max(Math.abs(x), Math.abs(z));
    h += 16 * smooth(clamp((edge - (this.half - 110)) / 100, 0, 1));
    // settlements sit on gently flattened pads
    for (const pad of p.pads) {
      const d = Math.hypot(x - pad.x, z - pad.z);
      if (d < pad.r + pad.fall) {
        const k = d < pad.r ? 1 : 1 - smooth((d - pad.r) / pad.fall);
        const target = pad.h ?? 3 + this.fbm(pad.x / 150, pad.z / 150) * 6;
        h = lerp(h, target + this.fbm(x / 60, z / 60, 2) * 0.35, k);
      }
    }
    // dry land never drops below the water outside the river and the lake
    h = Math.max(h, WATER_Y + 0.6);
    // river valley
    const dr = distToPath(x, z, p.river);
    const w = p.riverW;
    if (dr < w + 14) {
      const bed = WATER_Y - 1.15 + Math.abs(this.noise(x / 9, z / 9)) * 0.25;
      if (dr < w) h = lerp(bed, WATER_Y - 0.4, smooth(dr / w) * 0.3);
      else h = lerp(WATER_Y - 0.4, h, smooth((dr - w) / 14));
    }
    // lake
    if (p.lake) {
      const dl = Math.hypot(x - p.lake.x, z - p.lake.z);
      if (dl < p.lake.r + 16) {
        const bed = WATER_Y - 1.3;
        if (dl < p.lake.r) h = lerp(bed, WATER_Y - 0.3, smooth(dl / p.lake.r) * 0.5);
        else h = lerp(WATER_Y - 0.3, h, smooth((dl - p.lake.r) / 16));
      }
    }
    return h;
  }

  // Bilinear height from the cache.
  height(x, z) {
    const fx = clamp((x + this.half) / RES, 0, this.n - 1.001);
    const fz = clamp((z + this.half) / RES, 0, this.n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const n = this.n, H = this.h;
    const a = H[j * n + i], b = H[j * n + i + 1], c = H[(j + 1) * n + i], d = H[(j + 1) * n + i + 1];
    return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
  }

  isWater(x, z) {
    return this.height(x, z) < WATER_Y - 0.05;
  }

  // Steepness (0 flat .. 1 vertical) for placement decisions.
  slope(x, z) {
    const e = 2;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.min(1, Math.hypot(dx, dz) / (2 * e));
  }

  // First hit of a ray with the ground, or Infinity.
  raycast(o, d, maxT) {
    const step = 1.5;
    let prevT = 0;
    let prevAbove = o.y - this.height(o.x, o.z);
    if (prevAbove < 0) return 0;
    for (let t = step; t <= maxT + step; t += step) {
      const tt = Math.min(t, maxT);
      const y = o.y + d.y * tt;
      const above = y - this.height(o.x + d.x * tt, o.z + d.z * tt);
      if (above < 0) {
        // refine between the last point above ground and this one
        let lo = prevT, hi = tt;
        for (let k = 0; k < 8; k++) {
          const m = (lo + hi) / 2;
          if (o.y + d.y * m - this.height(o.x + d.x * m, o.z + d.z * m) < 0) hi = m;
          else lo = m;
        }
        return hi;
      }
      prevT = tt;
      prevAbove = above;
      if (tt >= maxT) break;
    }
    return Infinity;
  }

  // Terrain mesh with per-vertex colours (grass, fields, dirt, sand, forest floor).
  buildMesh(colorAt, material, res = 4) {
    const segs = Math.round((this.half * 2) / res);
    const g = new THREE.PlaneGeometry(this.half * 2, this.half * 2, segs, segs);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const uv = g.attributes.uv;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = this.height(x, z);
      pos.setY(i, h);
      colorAt(x, z, h, c);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      uv.setXY(i, x / 6, z / 6); // detail texture repeats every 6 m
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, material);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    return mesh;
  }
}
