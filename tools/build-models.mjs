// Rebuilds assets/models/zombies/*.glb from the original Quaternius characters (CC0).
//
// Usage: node tools/build-models.mjs <dir-with-source-glbs>
// Sources: casual-man.glb, hoodie-man.glb, beach-man.glb, casual-woman.glb from
// https://github.com/kurta999/MyVibeGTA/tree/main/assets/models/source/characters
// (originally https://poly.pizza, Quaternius). Keeps only the animations the
// game uses, renames them to short names, and drops unused data.
import { NodeIO } from '@gltf-transform/core';
import { prune, dedup, resample } from '@gltf-transform/functions';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/build-models.mjs <sources-dir>');
  process.exit(1);
}
const out = path.join(root, 'assets/models/zombies');
fs.mkdirSync(out, { recursive: true });

// game name -> source animation name pattern
const KEEP = {
  idle: /\|(Idle|Female_Idle)$/,
  walk: /\|(Walk|Female_Walk)$/,
  run: /\|(Run|Female_Run)$/,
  attack: /\|(Punch_Right|Female_Punch)$/,
  attack2: /\|Punch_Left$/,
  hit: /\|HitRecieve$/,
  death: /\|(Death|Female_Death)$/,
};

const MODELS = ['casual-man', 'hoodie-man', 'beach-man', 'casual-woman'];
const io = new NodeIO();

for (const name of MODELS) {
  const doc = await io.read(path.join(src, `${name}.glb`));
  const kept = [];
  for (const anim of doc.getRoot().listAnimations()) {
    const game = Object.keys(KEEP).find((k) => KEEP[k].test(anim.getName()));
    if (!game || kept.includes(game)) {
      anim.dispose();
      continue;
    }
    anim.setName(game);
    kept.push(game);
  }
  await doc.transform(resample(), prune(), dedup());
  const dst = path.join(out, `${name}.glb`);
  await io.write(dst, doc);
  const before = fs.statSync(path.join(src, `${name}.glb`)).size;
  const after = fs.statSync(dst).size;
  console.log(`${name}: ${kept.join(', ')}  ${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB`);
  for (const need of ['walk', 'run', 'attack', 'death', 'idle']) {
    if (!kept.includes(need)) throw new Error(`${name}: missing animation ${need}`);
  }
}
