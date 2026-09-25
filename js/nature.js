// Vegetation, rocks and wrecked cars, drawn with InstancedMesh (Kenney Nature
// Kit and a Quaternius car, CC0). Every tree gets a trunk collider so trees
// stop players, zombies, bullets and sight lines.
import * as THREE from 'three';
import { clamp, smooth, pick } from './util.js';
import { loadModel, gltfLoader } from './models.js';

const NATURE = [
  'tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA', 'tree_default', 'tree_oak',
  'tree_detailed', 'tree_thin', 'tree_tall', 'tree_fat', 'plant_bushDetailed', 'rock_largeA', 'rock_tallA',
  'rock_smallFlatA', 'grass_large',
];

// Muted, late-summer versions of the kit's bright colours.
const RECOLOR = {
  leafsDark: 0x2b4029, leafsGreen: 0x4a6534, woodBarkDark: 0x3b2f27, woodBark: 0x5d4a3a,
  grass: 0x55693a, dirt: 0x6b6152, _defaultMat: 0x6f6a62,
};

// Props from Quaternius' Toon Shooter kit (CC0): alias -> [file, material recolours,
// fallback box size w/h/d, bullet sound]. The kit's toy colours are replaced
// with worn, muted ones; one file can give several variants.
const PROPS = {
  sandbags: ['sandbags', { Sack: 0x7a6d50 }, [3.3, 1.3, 0.9], 'hard'],
  'sandbags-small': ['sandbags-small', { Sack: 0x7a6d50 }, [2.5, 1, 0.9], 'hard'],
  crate: ['crate', { Wood: 0x4f3a26, Wood_Light: 0x6e5539 }, [0.8, 0.8, 0.8], 'wood'],
  'crate-mil': ['crate', { Wood: 0x3a4229, Wood_Light: 0x4f5836 }, [0.8, 0.8, 0.8], 'wood'],
  pallet: ['pallet', { Wood: 0x6a5842 }, [1.7, 0.2, 1.5], 'wood'],
  barrel: ['barrel', { Red: 0x5c3522, White: 0x5c3522, Grey: 0x45423d }, [0.8, 1, 0.8], 'metal'],
  'barrel-olive': ['barrel', { Red: 0x3b4530, White: 0x3b4530, Grey: 0x2f332b }, [0.8, 1, 0.8], 'metal'],
  gascan: ['gascan', { Red: 0x3b4530, DarkRed: 0x2f3727, Black: 0x151515 }, [0.8, 1, 0.35], 'metal'],
  container: ['container-long', { Red: 0x6b4533, Grey: 0x575049 }, [4.4, 2.1, 2.1], 'metal'],
  'container-olive': ['container-long', { Red: 0x404a33, Grey: 0x4a4d44 }, [4.4, 2.1, 2.1], 'metal'],
  barrier: ['barrier', { Yellow: 0x8f7c4c, White: 0x8d8c84, Grey: 0x6f6f6a }, [1.9, 0.65, 0.65], 'hard'],
  tires: ['tires', {}, [1.8, 1.1, 1.1], 'hard'],
  planks: ['planks', { Wood: 0x6a5842, Wood_Light: 0x7e6a52 }, [0.7, 0.12, 1.7], 'wood'],
  debris: ['debris', { Red: 0x5c3522, Wood: 0x5a4632 }, [2.1, 0.2, 2.6], 'wood'],
  'water-tower': ['water-tower', { White: 0x7d7b72, Grey: 0x5b5d5c }, [1.6, 3.5, 2.3], 'metal'],
  streetlight: ['streetlight', {}, [0.4, 5.6, 2.1], 'metal'],
  boxes: ['boxes', { Cardboard: 0x7e6243, Tape: 0x8a8068 }, [1, 0.5, 0.7], 'wood'],
  sofa: ['sofa', { Red: 0x5a4038 }, [3.3, 1.3, 1.5], 'wood'],
  cone: ['cone', {}, [0.65, 0.65, 0.65], 'hard'],
  trash: ['trash', { Green: 0x33412c }, [2.4, 2, 1.3], 'metal'],
};

export async function loadNatureModels() {
  const loader = gltfLoader();
  const out = {};
  const load = async (name, url, recolor = RECOLOR) => {
    const gltf = await loadModel(loader, url);
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const src = o.material;
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
      if (recolor[src.name] != null) mat.color.setHex(recolor[src.name]);
      else if (src.color) mat.color.copy(src.color);
      mat.name = src.name;
      parts.push({ geo, mat });
    });
    const box = new THREE.Box3();
    for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    out[name] = { parts, box, height: box.max.y - box.min.y, radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 };
  };
  await Promise.all([
    ...NATURE.map((n) => load(n, `assets/models/nature/${n}.glb`)),
    load('sedan', 'assets/models/vehicles/sedan.glb'),
    ...Object.entries(PROPS).map(([alias, [file, recolor]]) => load(alias, `assets/models/props/${file}.glb`, recolor)),
  ]);
  // rusty, burnt-out paint on the wrecks
  for (const p of out.sedan.parts) {
    const n = p.mat.name.toLowerCase();
    if (n.includes('window')) p.mat.color.setHex(0x2a3134);
    else if (n.includes('black') || n.includes('grey')) p.mat.color.multiplyScalar(0.6);
    else if (n.includes('light')) p.mat.color.setHex(0x3a3530);
    else p.mat.color.lerp(new THREE.Color(0x6d4a36), 0.55).multiplyScalar(0.8);
    p.mat.flatShading = false;
  }
  return out;
}

// Instances are grouped in 128 m cells so the camera and the sun's shadow
// camera only draw the cells they can see.
const CELL = 128;

const TREE_TYPES = {
  pine: ['tree_pineTallA', 'tree_pineTallB', 'tree_pineDefaultA', 'tree_pineRoundA'],
  leafy: ['tree_default', 'tree_oak', 'tree_detailed', 'tree_fat'],
  birch: ['tree_thin', 'tree_tall'],
};
const TREE_HEIGHT = { pine: [11, 17], leafy: [7, 11], birch: [8, 12] };

export class Nature {
  constructor(world, models) {
    this.world = world;
    this.models = models || null;
    this.instances = new Map(); // model name -> [Matrix4]
    this.exclude = []; // {x, z, r} kept clear of trees
    this.count = 0;
  }

  // 0..1: how wooded a place is. Deterministic, so the ground colour, the
  // footstep surface and the tree scatter all agree.
  density(x, z) {
    const w = this.world;
    const t = w.terrain;
    if (w.inField(x, z)) return 0; // ploughed land, not forest
    let d = 0.35 + t.fbm(x / 110 + 300, z / 110 - 200, 3) * 0.9;
    const edge = Math.max(Math.abs(x), Math.abs(z));
    d += smooth(clamp((edge - 200) / 150, 0, 1)) * 0.55; // the zone is walled in by forest
    for (const e of this.exclude) {
      const k = Math.hypot(x - e.x, z - e.z) / e.r;
      if (k < 1.35) d -= smooth(clamp((1.35 - k) / 0.35, 0, 1)) * 2;
    }
    return clamp(d, 0, 1);
  }

  add(name, x, y, z, scale, rot = 0, tilt = 0) {
    const key = `${name}|${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
    if (!this.instances.has(key)) this.instances.set(key, []);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rot, 0)),
      new THREE.Vector3(scale, scale, scale),
    );
    this.instances.get(key).push(m);
    this.count++;
  }

  tree(kind, x, z, r = Math.random) {
    const w = this.world;
    const y = w.ground(x, z) - 0.2;
    const [h0, h1] = TREE_HEIGHT[kind];
    const h = h0 + r() * (h1 - h0);
    if (this.models) {
      const name = pick(TREE_TYPES[kind], r);
      const s = h / this.models[name].height;
      this.add(name, x, y, z, s, r() * Math.PI * 2);
    } else {
      // no models: simple cones
      const m = w.mats;
      w.addGeo(new THREE.CylinderGeometry(0.16, 0.26, h * 0.4, 6).translate(x, y + h * 0.2, z), w.mats.darkWood);
      w.addGeo(new THREE.ConeGeometry(h * 0.18, h * 0.75, 7).translate(x, y + h * 0.6, z), m.olive);
    }
    const tr = kind === 'pine' ? 0.28 : 0.22;
    w.addCollider(x - tr, y, z - tr, x + tr, y + h * 0.7, z + tr).mat = 'wood';
  }

  // Forest over the whole zone wherever density allows.
  scatter(r) {
    const w = this.world;
    const half = w.terrain.half - 6;
    const step = 6;
    for (let z = -half; z < half; z += step) {
      for (let x = -half; x < half; x += step) {
        const px = x + (r() - 0.5) * step * 0.9, pz = z + (r() - 0.5) * step * 0.9;
        const d = this.density(px, pz);
        if (d < 0.5 || r() > (d - 0.5) * 1.6) continue;
        if (w.terrain.isWater(px, pz) || w.onRoad(px, pz, 3) || w.inField(px, pz, 2)) continue;
        if (w.terrain.slope(px, pz) > 0.7) continue;
        if (w.insideBuilding(px, pz, 6)) continue; // keep porches and steps clear
        const pine = w.terrain.fbm(px / 70 - 50, pz / 70, 2) < 0.1 || d > 0.85;
        this.tree(pine ? 'pine' : r() < 0.55 ? 'birch' : 'leafy', px, pz, r);
        // undergrowth
        if (this.models && r() < 0.35) {
          const bx = px + (r() - 0.5) * 4, bz = pz + (r() - 0.5) * 4;
          if (!w.onRoad(bx, bz, 2)) this.add('plant_bushDetailed', bx, w.ground(bx, bz) - 0.05, bz, 2 + r() * 2.5, r() * 6);
        }
      }
    }
    // rocks and tufts in the open
    if (!this.models) return;
    for (let i = 0; i < 700; i++) {
      const x = (r() - 0.5) * half * 2, z = (r() - 0.5) * half * 2;
      if (w.terrain.isWater(x, z) || w.onRoad(x, z, 2) || w.insideBuilding(x, z, 7)) continue;
      const roll = r();
      if (roll < 0.12) {
        const s = 2 + r() * 3;
        this.add(r() < 0.5 ? 'rock_largeA' : 'rock_tallA', x, w.ground(x, z) - 0.3, z, s, r() * 6);
        w.addCollider(x - s * 0.35, w.ground(x, z) - 0.3, z - s * 0.35, x + s * 0.35, w.ground(x, z) + s * 0.6, z + s * 0.35).mat = 'hard';
      } else if (roll < 0.35) this.add('rock_smallFlatA', x, w.ground(x, z) - 0.02, z, 1.5 + r() * 2, r() * 6);
      else if (!w.inField(x, z)) this.add('grass_large', x, w.ground(x, z) - 0.02, z, 2.5 + r() * 2, r() * 6);
    }
  }

  // A burnt-out car standing on the ground, facing `rot`.
  wreck(x, z, rot, r = Math.random) {
    const w = this.world;
    const y = w.ground(x, z);
    if (this.models) {
      const s = 4.3 / (this.models.sedan.radius * 2);
      this.add('sedan', x, y, z, s, rot, (r() - 0.5) * 0.05);
    } else w.box(x, y + 0.35, z, 1.9, 1.2, 4.2, w.mats.carRed, false, 0);
    // collider: an axis-aligned box around the rotated body
    const c = Math.abs(Math.cos(rot)), sn = Math.abs(Math.sin(rot));
    const hx = 0.95 * c + 2.1 * sn, hz = 0.95 * sn + 2.1 * c;
    w.addCollider(x - hx, y, z - hz, x + hx, y + 1.45, z + hz).mat = 'metal';
    if (r() < 0.6) w.addContainer(x - Math.sin(rot) * 2.3, y + 0.9, z - Math.cos(rot) * 2.3, 'trunk');
  }

  // A prop standing on the ground (or at `o.y`), turned by `rot`, with a box
  // collider around its rotated footprint. Without models: a plain box.
  prop(name, x, z, rot = 0, o = {}) {
    const w = this.world;
    const [, , size, sound] = PROPS[name];
    const s = o.scale ?? 1;
    const y = o.y ?? w.ground(x, z);
    let minX, maxX, minZ, maxZ, h;
    if (this.models) {
      const b = this.models[name].box;
      this.add(name, x, y - b.min.y * s, z, s, rot);
      minX = b.min.x * s; maxX = b.max.x * s; minZ = b.min.z * s; maxZ = b.max.z * s; h = (b.max.y - b.min.y) * s;
    } else {
      w.box(x, y, z, size[0] * s, size[1] * s, size[2] * s, w.mats.crate, false, 1);
      minX = -size[0] * s / 2; maxX = -minX; minZ = -size[2] * s / 2; maxZ = -minZ; h = size[1] * s;
      rot = 0;
    }
    if (o.collide === false) return h;
    // axis-aligned bounds of the rotated footprint
    const c = Math.cos(rot), sn = Math.sin(rot);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [px, pz] of [[minX, minZ], [maxX, minZ], [minX, maxZ], [maxX, maxZ]]) {
      const rx = px * c + pz * sn, rz = -px * sn + pz * c;
      x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
    }
    w.addCollider(x + x0, y, z + z0, x + x1, y + h, z + z1).mat = sound;
    return h;
  }

  finalize() {
    if (!this.models) return;
    for (const [key, list] of this.instances) {
      const name = key.split('|')[0];
      for (const part of this.models[name].parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.instanceMatrix.needsUpdate = true;
        im.castShadow = !name.startsWith('grass') && !name.startsWith('rock_small');
        im.receiveShadow = true;
        im.computeBoundingSphere(); // covers only this cell, so culling works
        this.world.scene.add(im);
      }
    }
  }
}
