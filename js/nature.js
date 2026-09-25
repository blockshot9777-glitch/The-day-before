// Vegetation, rocks and wrecked cars, drawn with InstancedMesh (Kenney Nature
// Kit and a Quaternius car, CC0). Every tree gets a trunk collider so trees
// stop players, zombies, bullets and sight lines.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp, smooth, pick } from './util.js';

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

export async function loadNatureModels() {
  const loader = new GLTFLoader();
  const out = {};
  const load = async (name, url) => {
    const gltf = await loader.loadAsync(url);
    gltf.scene.updateMatrixWorld(true);
    const parts = [];
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      const geo = o.geometry.clone().applyMatrix4(o.matrixWorld);
      const src = o.material;
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true });
      if (RECOLOR[src.name] != null) mat.color.setHex(RECOLOR[src.name]);
      else if (src.color) mat.color.copy(src.color);
      mat.name = src.name;
      parts.push({ geo, mat });
    });
    const box = new THREE.Box3();
    for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox); }
    out[name] = { parts, height: box.max.y - box.min.y, radius: Math.max(box.max.x - box.min.x, box.max.z - box.min.z) / 2 };
  };
  await Promise.all([
    ...NATURE.map((n) => load(n, `assets/models/nature/${n}.glb`)),
    load('sedan', 'assets/models/vehicles/sedan.glb'),
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
