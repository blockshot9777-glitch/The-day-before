// The game as a strict static host serves it: no .glb files (models only as
// packed .glb.json) and a CSP that blocks fetching data: URIs. Checks that the
// real models load instead of the blocky fallback.
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tdb-hosted-'));
for (const f of ['index.html', 'css', 'js', 'vendor', 'assets/audio']) fs.cpSync(path.join(root, f), path.join(out, f), { recursive: true });
execFileSync('node', [path.join(root, 'tools/pack-models.mjs'), path.join(root, 'assets/models'), path.join(out, 'assets/models')]);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.mp3': 'audio/mpeg' };
const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'";
const server = http.createServer((req, res) => {
  const p = path.join(out, decodeURIComponent(req.url.split('?')[0]));
  const type = TYPES[path.extname(p)];
  if (!type || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': type, 'Content-Security-Policy': CSP });
  fs.createReadStream(p).pipe(res);
}).listen(0);
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 480, height: 270 } });
const warnings = [];
page.on('console', (m) => { if (/unavailable|Refused/.test(m.text())) warnings.push(m.text().slice(0, 160)); });
page.on('pageerror', (e) => warnings.push('pageerror: ' + e.message));
let ok = false;
try {
  await page.goto(`http://localhost:${port}/index.html?seed=42`);
  await page.waitForFunction(() => window.__game, null, { timeout: 180000 });
  const s = await page.evaluate(() => {
    const g = window.__game;
    let skinned = 0;
    g.zombies.spawn('walker', 140, 22, 'idle').mesh.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    return { zombies: (g.assets.zombies || []).length, nature: Object.keys(g.assets.nature || {}).length, skinned };
  });
  ok = s.zombies === 4 && s.nature === 16 && s.skinned > 0 && warnings.length === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'} models load on a strict static host ${JSON.stringify(s)}${warnings.length ? '\n  ' + warnings.join('\n  ') : ''}`);
} catch (err) {
  console.log('EXCEPTION ' + err.message);
}
await browser.close();
server.close();
fs.rmSync(out, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
