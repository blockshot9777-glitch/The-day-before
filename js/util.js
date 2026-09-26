// Small math helpers shared by all modules.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);

// Deterministic RNG so the town layout is the same every run.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rand = (min, max) => min + Math.random() * (max - min);
export const randInt = (min, max) => Math.floor(rand(min, max + 1));
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];

// Weighted pick from [[value, weight], ...]
export function weighted(table, r = Math.random) {
  let total = 0;
  for (const [, w] of table) total += w;
  let x = r() * total;
  for (const [v, w] of table) {
    x -= w;
    if (x <= 0) return v;
  }
  return table[table.length - 1][0];
}

// Ray vs axis-aligned box (slab method). Returns hit distance or Infinity.
export function rayAABB(ox, oy, oz, dx, dy, dz, b, maxT = Infinity) {
  let tmin = 0;
  let tmax = maxT;
  // X
  if (Math.abs(dx) < 1e-9) {
    if (ox < b.minX || ox > b.maxX) return Infinity;
  } else {
    let t1 = (b.minX - ox) / dx;
    let t2 = (b.maxX - ox) / dx;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Y
  if (Math.abs(dy) < 1e-9) {
    if (oy < b.minY || oy > b.maxY) return Infinity;
  } else {
    let t1 = (b.minY - oy) / dy;
    let t2 = (b.maxY - oy) / dy;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  // Z
  if (Math.abs(dz) < 1e-9) {
    if (oz < b.minZ || oz > b.maxZ) return Infinity;
  } else {
    let t1 = (b.minZ - oz) / dz;
    let t2 = (b.maxZ - oz) / dz;
    if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
    if (t1 > tmin) tmin = t1;
    if (t2 < tmax) tmax = t2;
    if (tmin > tmax) return Infinity;
  }
  return tmin;
}

export function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable: ignore */
    }
  },
};
