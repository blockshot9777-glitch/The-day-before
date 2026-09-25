// Packs assets/models/**/*.glb as "<name>.glb.json" ({"glb": base64}) for static hosts that
// serve only web file types. Usage: node tools/pack-models.mjs assets/models <out>/assets/models
import fs from 'node:fs'; import path from 'node:path';
const [src, dstDir] = process.argv.slice(2);
for (const f of fs.readdirSync(src, { recursive: true }).filter((f) => f.endsWith('.glb'))) {
  const out = path.join(dstDir, f + '.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ glb: fs.readFileSync(path.join(src, f)).toString('base64') }));
}
