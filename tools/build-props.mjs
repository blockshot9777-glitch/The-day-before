// Builds assets/models/props/*.glb (and the knife) from Quaternius' Toon Shooter
// Game Kit (CC0), shipped as .gltf with embedded buffers.
//
// Usage: node tools/build-props.mjs "<Toon Shooter Game Kit - Dec 2022>"
// Source used: https://github.com/MarcoPaoletta/xogot---toon-shooter
// (assets/Toon Shooter Game Kit - Dec 2022), originally
// https://quaternius.com/packs/toonshootergamekit.html
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-props.mjs <toon-shooter-kit-dir>');
  process.exit(1);
}

// output name -> source file (relative to the kit)
const PROPS = {
  'props/sandbags': 'Environment/glTF/SackTrench.gltf',
  'props/sandbags-small': 'Environment/glTF/SackTrench_Small.gltf',
  'props/crate': 'Environment/glTF/Crate.gltf',
  'props/pallet': 'Environment/glTF/Pallet.gltf',
  'props/barrel': 'Environment/glTF/ExplodingBarrel.gltf',
  'props/gascan': 'Environment/glTF/GasCan.gltf',
  'props/container-long': 'Environment/glTF/Container_Long.gltf',
  'props/barrier': 'Environment/glTF/Barrier_Single.gltf',
  'props/tires': 'Environment/glTF/Debris_Tires.gltf',
  'props/planks': 'Environment/glTF/WoodPlanks.gltf',
  'props/debris': 'Environment/glTF/Debris_Pile.gltf',
  'props/water-tower': 'Environment/glTF/WaterTank_Platform.gltf',
  'props/streetlight': 'Environment/glTF/StreetLight.gltf',
  'props/boxes': 'Environment/glTF/CardboardBoxes_1.gltf',
  'props/sofa': 'Environment/glTF/Sofa.gltf',
  'props/cone': 'Environment/glTF/TrafficCone.gltf',
  'props/trash': 'Environment/glTF/TrashContainer.gltf',
  'weapons/knife': 'Guns/glTF/Knife_1.gltf',
};

const io = new NodeIO();
let total = 0;
for (const [name, file] of Object.entries(PROPS)) {
  const doc = await io.read(path.join(src, file));
  await doc.transform(dedup(), prune());
  const out = path.join(root, 'assets/models', name + '.glb');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await io.write(out, doc);
  total += fs.statSync(out).size;
  console.log(name.padEnd(24), (fs.statSync(out).size / 1024).toFixed(0), 'KB');
}
console.log('total', (total / 1024).toFixed(0), 'KB');
