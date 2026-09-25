/* global place, LANE -- helpers installed inside the page, used from page.evaluate */
// End-to-end check of every game mechanic in a headless browser.
// Run: npm install && npm test   (screenshots go to test-results/)
// Game time is advanced with window.__game.tick(), so results don't depend on FPS.
import { chromium } from 'playwright';
import fs from 'node:fs';
import { serve } from '../tools/serve.mjs';

const SP = 'test-results';
fs.mkdirSync(SP, { recursive: true });
const server = await serve(0);
const URL = `http://localhost:${server.address().port}/index.html?seed=42`;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !/fonts|CERT|ERR_/.test(m.text())) errs.push('console: ' + m.text()); });
await page.goto(URL);
await page.waitForFunction(() => window.__game);
const ev = (f, a) => page.evaluate(f, a);
const tick = (sec) => ev((n) => window.__game.tick(1 / 60, n), Math.round(sec * 60));
const results = [];
const check = (name, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`);
const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${SP}/${name}.png` }); };
const clearZ = () => ev(() => { const g = window.__game; g.zombies.list.forEach(z => g.zombies.group.remove(z.mesh)); g.zombies.list.length = 0; g.zombies.spawnT = 1e9; });
try {
  await page.click('#btn-play');
  await ev(() => {
    const g = window.__game;
    g.manual = true;
    // test lane: the village main street, clear from x=100 to x=-10 along z=20.5, facing west (-X)
    window.LANE = { x: 60, z: 20.5, yaw: Math.PI / 2 };
    window.place = (x, z, yaw = Math.PI / 2, pitch = 0) => {
      const p = g.player;
      p.pos.set(x, g.world.groundAt({ x, z }, 0.3, 1000, 2000), z);
      p.vel.set(0, 0, 0); p.yaw = yaw; p.pitch = pitch; p.grounded = true;
    };
  });
  await clearZ();
  // freeze real-time loop progress by making dt tiny: pause state between ticks is not needed; ticks dominate.
  // 1. walk / sprint / jump / crouch
  await ev(() => place(LANE.x + 30, LANE.z));
  let x0 = await ev(() => window.__game.player.pos.x);
  await page.keyboard.down('KeyW'); await tick(1); await page.keyboard.up('KeyW');
  let x1 = await ev(() => window.__game.player.pos.x);
  check('walk 1s ≈ 4 m', x0 - x1 > 3 && x0 - x1 < 5, (x0 - x1).toFixed(2));
  await ev(() => place(LANE.x + 35, LANE.z));
  await page.keyboard.down('ShiftLeft'); await page.keyboard.down('KeyW'); await tick(1);
  let s = await ev(() => ({ st: window.__game.player.stamina, sp: window.__game.player.speedNow }));
  await page.keyboard.up('KeyW'); await page.keyboard.up('ShiftLeft');
  const diag = await ev(() => { const g = window.__game, p = g.player; return { pos: p.pos.toArray().map((v) => +v.toFixed(2)), vel: p.vel.toArray().map((v) => +v.toFixed(2)), keys: [...g.input.keys], z: g.zombies.list.length, state: g.state }; });
  check('sprint faster & drains stamina', s.st < 90 && s.sp > 6, JSON.stringify(s) + ' ' + JSON.stringify(diag));
  await tick(1);
  const pre = await ev(() => { const g = window.__game, p = g.player; return { state: g.state, grounded: p.grounded, st: Math.round(p.stamina), pos: p.pos.toArray().map((v) => +v.toFixed(2)), focus: document.activeElement.id || document.activeElement.tagName }; });
  const y0 = await ev(() => window.__game.player.pos.y);
  await page.keyboard.press('Space'); await tick(0.25);
  const y = (await ev(() => window.__game.player.pos.y)) - y0;
  check('jump', y > 0.5, y.toFixed(2) + ' ' + JSON.stringify(pre));
  await tick(1);
  await page.keyboard.down('KeyC'); await tick(0.5);
  s = await ev(() => ({ h: window.__game.player.height, c: window.__game.player.crouching }));
  await page.keyboard.up('KeyC'); await tick(0.5);
  const hUp = await ev(() => window.__game.player.height);
  check('crouch & stand', s.c && s.h < 1.3 && hUp > 1.6, JSON.stringify(s) + ' up=' + hUp.toFixed(2));
  // wall collision: walk into a house wall
  s = await ev(() => {
    // the village shop's back (north) wall, walking south into it
    const g = window.__game, b = g.world.buildings.find((b) => b.name === 'Сельпо');
    place((b.minX + b.maxX) / 2, b.minZ - 3, Math.PI);
    return b.minZ;
  });
  await page.keyboard.down('KeyW'); await tick(2); await page.keyboard.up('KeyW');
  const pz = await ev(() => window.__game.player.pos.z);
  check('wall blocks player', pz <= s - 0.3, `wall=${s.toFixed(2)} player=${pz.toFixed(2)}`);

  // 2. shoot
  await ev(() => { const g = window.__game; place(LANE.x, LANE.z); g.zombies.spawn('walker', LANE.x - 8, LANE.z, 'idle'); });
  await tick(0.1);
  for (let i = 0; i < 6; i++) { await page.mouse.move(480, 270); await page.mouse.down(); await tick(0.05); await page.mouse.up(); await tick(0.3); }
  s = await ev(() => { const g = window.__game; return { kills: g.stats.kills, mag: g.weapons.mags.pistol, fired: g.weapons.shotsFired, hit: g.weapons.shotsHit }; });
  check('pistol kills zombie at 8 m', s.kills === 1, JSON.stringify(s));
  await shot('shoot');
  // 3. reload
  const res0 = await ev(() => window.__game.inventory.count('ammo_pistol'));
  await page.keyboard.press('KeyR'); await tick(1.6);
  s = await ev(() => ({ mag: window.__game.weapons.mags.pistol, res: window.__game.inventory.count('ammo_pistol') }));
  check('reload moves ammo from backpack', s.mag === 12 && s.res < res0, `${res0} -> ${JSON.stringify(s)}`);
  // 4. knife stealth kill
  await page.keyboard.press('Digit1'); await tick(0.5);
  await ev(() => { const g = window.__game, p = g.player; place(p.pos.x, p.pos.z, LANE.yaw, -0.2); g.zombies.spawn('walker', p.pos.x - 1.6, p.pos.z, 'idle'); g.zombies.list.at(-1).yaw = -Math.PI / 2; g.zombies.list.at(-1).idleStop = true; g.zombies.list.at(-1).wanderT = 99; });
  await page.keyboard.down('KeyC'); await tick(0.3);
  await page.mouse.down(); await tick(0.05); await page.mouse.up(); await tick(0.2);
  await page.keyboard.up('KeyC'); await tick(0.5);
  s = await ev(() => ({ cur: window.__game.weapons.current, kills: window.__game.stats.kills }));
  check('crouched knife stealth kill from behind', s.cur === 'knife' && s.kills === 2, JSON.stringify(s));
  await page.keyboard.press('Digit2'); await tick(0.5);
  // 5. zombie AI: sees player & chases, attacks
  await clearZ();
  await ev(() => { const g = window.__game, p = g.player; place(LANE.x, LANE.z); p.hp = 100; g.zombies.spawn('walker', LANE.x - 12, LANE.z, 'idle'); Object.assign(g.zombies.list[0], { yaw: Math.PI / 2, wanderT: 99, idleStop: true }); });
  await tick(1);
  s = await ev(() => { const g = window.__game, z = g.zombies.list[0]; return { st: z.state, zp: z.pos.toArray().map((v) => +v.toFixed(1)), yaw: +z.yaw.toFixed(2), pp: g.player.pos.toArray().map((v) => +v.toFixed(1)), dayF: g.dayF, n: g.zombies.list.length, los: g.world.lineOfSight({ x: z.pos.x, y: 1.7, z: z.pos.z }, g.player.eyePos()) }; });
  check('zombie notices player in view', s.st === 'chase', JSON.stringify(s));
  await tick(6);
  s = await ev(() => ({ hp: window.__game.player.hp, d: window.__game.zombies.list[0].pos.distanceTo(window.__game.player.pos) }));
  check('zombie reaches & bites', s.hp < 100 && s.d < 2, JSON.stringify(s));
  await clearZ();
  await ev(() => { const g = window.__game; g.player.hp = 100; g.player.bleeding = false; });
  // hearing: zombie behind a wall hears a gunshot
  await ev(() => { const g = window.__game; place(LANE.x, LANE.z); g.zombies.spawn('walker', LANE.x - 30, LANE.z, 'idle'); g.zombies.list[0].yaw = -Math.PI / 2; });
  await page.mouse.down(); await tick(0.05); await page.mouse.up(); await tick(0.1);
  s = await ev(() => window.__game.zombies.list[0].state);
  check('gunshot alerts zombie 30 m away', s === 'alert' || s === 'chase', s);
  await clearZ();

  // 6. loot a house container
  const lootInfo = await ev(() => {
    const g = window.__game, w = g.world, p = g.player;
    const c = w.containers.find((c) => c.building != null && !w.radioContainers.includes(c) && c.items.length);
    const b = w.buildings[c.building];
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
    const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz);
    p.pos.set(c.x + dx / d * 1.4, b.floor, c.z + dz / d * 1.4);
    p.yaw = Math.atan2(-(c.x - p.pos.x), -(c.z - p.pos.z)); p.pitch = -0.25;
    return { kind: c.kind, items: JSON.stringify(c.items), idx: w.containers.indexOf(c) };
  });
  await tick(0.1);
  const prompt = await ev(() => document.getElementById('prompt').hidden ? null : document.getElementById('prompt').textContent);
  check('interaction prompt', !!prompt, prompt);
  await shot('loot');
  await page.keyboard.down('KeyE'); await tick(1.4); await page.keyboard.up('KeyE');
  s = await ev((i) => { const g = window.__game, c = g.world.containers[i]; return { searched: c.searched, left: c.items.length, inv: g.inventory.slots.filter(Boolean).map(s => s.id + 'x' + s.qty).join(',') }; }, lootInfo.idx);
  check('search container gives items', s.searched && s.left === 0, `${lootInfo.kind} ${lootInfo.items} -> ${JSON.stringify(s)}`);
  // all house containers reachable from inside? check each has a free standing spot with LOS
  s = await ev(() => {
    const g = window.__game, w = g.world, p = g.player; let ok = 0, bad = [];
    for (const c of w.containers.filter(c => c.building != null && !(c.searched && !c.items.length))) {
      const b = w.buildings[c.building];
      const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
      const dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz);
      p.pos.set(c.x + dx / d * 1.3, b.floor, c.z + dz / d * 1.3);
      w.collide(p.pos, 0.35, b.floor, 1.75);
      p.yaw = Math.atan2(-(c.x - p.pos.x), -(c.z - p.pos.z)); p.pitch = -0.3;
      const it = g.findInteract();
      if (it && it.obj === c) ok++; else bad.push(c.kind);
    }
    return { ok, bad };
  });
  check('every house container is interactable', s.bad.length === 0, JSON.stringify(s));

  // 7. inventory
  await ev(() => { place(LANE.x, LANE.z); window.__game.player.thirst = 30; });
  await page.keyboard.press('Tab'); await page.waitForTimeout(200);
  let state = await ev(() => window.__game.state);
  check('inventory opens', state === 'inventory');
  await page.screenshot({ path: SP + '/inventory.png' });
  const wi = await ev(() => window.__game.inventory.slots.findIndex((s) => s && s.id === 'water'));
  await page.click('#inv-cell-' + wi);
  const th = await ev(() => window.__game.player.thirst);
  check('drink water', th > 70, th.toFixed(1));
  const ci = await ev(() => window.__game.inventory.slots.findIndex((s) => s && s.id === 'chips'));
  await page.click('#inv-cell-' + ci, { button: 'right' });
  s = await ev(() => ({ chips: window.__game.inventory.count('chips'), pickups: window.__game.world.pickups.length }));
  check('drop item makes pickup', s.pickups >= 1, JSON.stringify(s));
  await page.keyboard.press('Tab'); await page.waitForTimeout(100);
  state = await ev(() => window.__game.state);
  check('inventory closes', state === 'playing', state);
  // pick it back up
  const pk0 = await ev(() => window.__game.world.pickups.length);
  await ev(() => { const g = window.__game, pk = g.world.pickups.at(-1), p = g.player; p.yaw = Math.atan2(-(pk.x - p.pos.x), -(pk.z - p.pos.z)); p.pitch = -0.6; });
  await tick(0.1);
  await page.keyboard.press('KeyE'); await tick(0.1);
  s = await ev(() => ({ pickups: window.__game.world.pickups.length }));
  check('pick up item from ground', s.pickups === pk0 - 1, pk0 + ' -> ' + JSON.stringify(s));

  // 8. bleeding, quick heal, hunger damage
  await ev(() => { const p = window.__game.player; p.bleeding = true; p.hp = 60; });
  await tick(3);
  s = await ev(() => window.__game.player.hp);
  check('bleeding drains hp', s < 60, s.toFixed(1));
  await page.keyboard.press('KeyH'); await tick(0.1);
  s = await ev(() => ({ b: window.__game.player.bleeding, hp: window.__game.player.hp }));
  check('H bandages bleeding', !s.b, JSON.stringify(s));
  await ev(() => { const p = window.__game.player; p.hunger = 0; p.hp = 50; });
  await tick(3);
  s = await ev(() => window.__game.player.hp);
  check('starvation hurts', s < 50, s.toFixed(1));
  await ev(() => { const p = window.__game.player; p.hunger = 100; p.thirst = 100; p.hp = 100; });

  // 9. night + flashlight
  await ev(() => { const g = window.__game; g.timeOfDay = 0.94; place(LANE.x, LANE.z, LANE.yaw, -0.1); });
  await page.keyboard.press('KeyF'); await tick(0.1);
  s = await ev(() => ({ on: window.__game.player.lightOn, i: window.__game.player.flashlight.intensity, dayF: window.__game.dayF, target: window.__game.zombies.targetCount() }));
  check('night: flashlight on, more zombies', s.on && s.i > 0 && s.dayF < 0.1, JSON.stringify(s));
  await shot('night');
  const b0 = await ev(() => window.__game.player.battery);
  await tick(5);
  const b1 = await ev(() => window.__game.player.battery);
  check('flashlight drains battery', b1 < b0, `${b0.toFixed(1)} -> ${b1.toFixed(1)}`);
  await page.keyboard.press('KeyF'); await tick(0.05);
  await ev(() => { window.__game.timeOfDay = 0.45; });

  // 10. quest
  await ev(() => window.__game.giveItem('radio_part', 3));
  s = await ev(() => window.__game.phase);
  check('3 parts -> radio phase', s === 'radio', s);
  await ev(() => {
    const g = window.__game, rc = g.world.radioConsole, p = g.player, b = g.world.buildings.find(b => rc.x > b.minX && rc.x < b.maxX && rc.z > b.minZ && rc.z < b.maxZ);
    const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, dx = cx - rc.x, dz = cz - rc.z, d = Math.hypot(dx, dz) || 1;
    p.pos.set(rc.x + dx / d * 1.5, b.floor, rc.z + dz / d * 1.5);
    p.yaw = Math.atan2(-(rc.x - p.pos.x), -(rc.z - p.pos.z)); p.pitch = -0.3;
  });
  await tick(0.1);
  await shot('radio');
  await page.keyboard.down('KeyE'); await tick(2.7); await page.keyboard.up('KeyE');
  s = await ev(() => ({ phase: window.__game.phase, horde: window.__game.zombies.hordeTarget }));
  check('call evac -> hold', s.phase === 'hold' && s.horde > 0, JSON.stringify(s));
  await ev(() => { const g = window.__game; g.god = true; g.zombies.spawnT = 0; });
  await tick(10);
  s = await ev(() => ({ alive: window.__game.zombies.alive().length, chasing: window.__game.zombies.alive().filter(z => z.state === 'chase').length }));
  check('horde spawns & chases', s.chasing >= 5, JSON.stringify(s));
  await ev(() => { window.__game.holdT = 119.9; });
  await tick(0.2);
  s = await ev(() => ({ phase: window.__game.phase, heli: !!window.__game.effects.heli }));
  check('hold -> evac, heli spawned', s.phase === 'evac' && s.heli, JSON.stringify(s));
  await tick(30);
  s = await ev(() => { const h = window.__game.effects.heli, pad = window.__game.world.helipad; return { landed: h.landed, dist: Math.hypot(h.group.position.x - pad.x, h.group.position.z - pad.z).toFixed(1), y: h.group.position.y.toFixed(2) }; });
  check('heli flies in and lands on its own', s.landed, JSON.stringify(s));
  await clearZ();
  await ev(() => { const g = window.__game, pad = g.world.helipad; place(pad.x + 7, pad.z, Math.PI / 2, 0.05); });
  await tick(0.1);
  await shot('heli');
  await page.keyboard.press('KeyE'); await tick(0.1);
  s = await ev(() => ({ state: window.__game.state, visible: !document.getElementById('end').hidden }));
  check('board heli -> win', s.state === 'won' && s.visible, JSON.stringify(s));
  await page.screenshot({ path: SP + '/win.png' });

  // 11. death
  await page.click('#btn-again');
  await clearZ();
  await ev(() => { const g = window.__game; g.player.hp = 5; const p = g.player.pos; g.zombies.spawn('walker', p.x, p.z - 1.2, 'chase'); });
  await tick(4);
  s = await ev(() => ({ state: window.__game.state, reason: document.getElementById('end-reason').textContent, rec: localStorage.getItem('tdb.record') }));
  check('death -> end screen + record saved', s.state === 'dead' && !!s.rec, JSON.stringify(s));
  await page.screenshot({ path: SP + '/dead.png' });

  // 12. pause, weapons
  await page.click('#btn-again');
  await page.keyboard.press('Escape');
  state = await ev(() => window.__game.state);
  check('Esc pauses', state === 'paused', state);
  await page.keyboard.press('Escape');
  state = await ev(() => window.__game.state);
  check('Esc resumes', state === 'playing', state);
  await ev(() => { window.__game.giveItem('w_rifle', 1); window.__game.inventory.add('ammo_rifle', 60); });
  await tick(0.5);
  await clearZ();
  await ev(() => { place(LANE.x, LANE.z); });
  const m0 = await ev(() => window.__game.weapons.mags.rifle);
  await page.mouse.down(); await tick(0.5); await page.mouse.up(); await tick(0.05);
  const m1 = await ev(() => window.__game.weapons.mags.rifle);
  check('rifle is full-auto', m0 - m1 >= 4, `${m0} -> ${m1}`);
  await ev(() => window.__game.giveItem('w_shotgun', 1));
  await tick(0.5);
  await ev(() => { const g = window.__game; g.zombies.spawn('brute', LANE.x - 6, LANE.z, 'idle'); g.inventory.add('ammo_shells', 10); });
  const hp0 = await ev(() => window.__game.zombies.list[0].hp);
  await page.mouse.down(); await tick(0.05); await page.mouse.up(); await tick(0.1);
  const hp1 = await ev(() => window.__game.zombies.list[0].hp);
  check('shotgun pellets hit brute', hp0 - hp1 > 40, `${hp0} -> ${hp1.toFixed(0)}`);
  s = await ev(() => window.__game.weapons.current);
  check('weapon switched to shotgun on pickup', s === 'shotgun', s);
  await page.mouse.down({ button: 'right' }); await tick(0.5);
  s = await ev(() => ({ aimT: window.__game.weapons.aimT, fov: window.__game.camera.fov }));
  check('ADS zooms', s.aimT > 0.9 && s.fov < 70, JSON.stringify(s));
  await shot('ads');
  await page.mouse.up({ button: 'right' });
  await page.mouse.wheel(0, 100); await tick(0.5);
  s = await ev(() => window.__game.weapons.current);
  check('mouse wheel cycles weapon', s === 'rifle', s);
  await shot('rifle');
  // arm fatigue: sustained aimed fire tires the arms, tremor moves the view, the hand gives out, rest recovers
  await ev(() => { const g = window.__game; g.weapons.fatigue = 0; g.inventory.add('ammo_rifle', 90); g.weapons.select('rifle'); g.weapons.mags.rifle = 30; });
  await tick(0.5);
  await page.mouse.down({ button: 'right' }); await page.mouse.down(); await tick(0.5);
  const mid = await ev(() => { const g = window.__game, w = g.weapons; return { f: +w.fatigue.toFixed(1), aim: w.aiming, cur: w.current, mag: w.mags.rifle, rel: w.reloading, st: g.state, btn: [...g.input.buttons] }; });
  await tick(1.5); await page.mouse.up(); await tick(0.05);
  s = await ev(() => ({ f: window.__game.weapons.fatigue, chip: document.getElementById('status-row').textContent }));
  s.mid = mid;
  check('sustained aimed fire tires the arms', s.f > 35 && /Руки/.test(s.chip), JSON.stringify(s));
  s = await ev(() => { const g = window.__game, w = g.weapons; w.fatigue = 70; w.twitchT = 0; w.jerkYaw = 0; const ys = []; for (let i = 0; i < 90; i++) { g.tick(1 / 60, 1); ys.push(g.camera.rotation.y - g.player.yaw); } return { spread: Math.max(...ys) - Math.min(...ys) }; });
  check('tired arms make the aim tremble', s.spread > 0.004, JSON.stringify(s));
  s = await ev(() => { const g = window.__game, w = g.weapons; w.fatigue = 100; const n0 = w.twitches; g.tick(1 / 60, 30); return { twitches: w.twitches - n0, f: w.fatigue, t: w.twitchT }; });
  check('exhausted hand gives out (twitch)', s.twitches >= 1 && s.f < 75, JSON.stringify(s));
  await page.mouse.up({ button: 'right' });
  await tick(6);
  s = await ev(() => window.__game.weapons.fatigue);
  check('lowered weapon lets the arms recover', s < 5, s.toFixed(1));
  // animated zombie models: loaded, skinned, clip follows the AI state
  s = await ev(() => {
    const g = window.__game, Z = g.zombies;
    const models = (g.assets.zombies || []).map((m) => m.name);
    const z = Z.spawn('walker', g.player.pos.x + 6, g.player.pos.z, 'chase');
    let skinned = 0;
    z.mesh.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    const clips = [];
    g.tick(1 / 60, 30); clips.push(z.visual.currentName);
    z.windup = 0.4; z.visual.update(1 / 60, z); clips.push(z.visual.currentName);
    z.windup = 0; Z.kill(z, { x: 1, y: 0, z: 0 }); g.tick(1 / 60, 30); clips.push(z.visual.currentName);
    const b = Z.spawn('brute', g.player.pos.x + 8, g.player.pos.z, 'idle');
    return { models, skinned, clips, bruteModel: b.visual && b.mesh.children.length > 0 };
  });
  check('zombie models load (4 characters)', s.models.length === 4, JSON.stringify(s.models));
  check('zombie is a skinned animated character', s.skinned > 0, JSON.stringify(s));
  check('clip follows AI: chase -> walk/run, windup -> attack, killed -> death', ['walk', 'run'].includes(s.clips[0]) && /^attack/.test(s.clips[1]) && s.clips[2] === 'death', JSON.stringify(s.clips));
  await clearZ();
  // sound: every recorded clip decodes, and game events play the right samples
  s = await page.evaluate(async () => {
    const a = window.__game.audio;
    for (let i = 0; i < 100 && !a.loaded; i++) await new Promise((r) => setTimeout(r, 100));
    const names = await (await fetch('assets/audio/manifest.json')).json();
    return { loaded: a.loaded, decoded: a.buffers.size, total: names.length, state: a.ctx && a.ctx.state, missing: names.filter((n) => !a.buffers.has(n)) };
  });
  check('all audio clips decode', s.loaded && s.decoded === s.total && s.total > 60, JSON.stringify(s));
  s = await ev(() => {
    const g = window.__game, a = g.audio, w = g.weapons;
    const heard = (fn) => { a.played.length = 0; fn(); return [...a.played]; };
    const out = {};
    w.current = 'pistol'; w.show('pistol'); w.mags.pistol = 5; w.cooldown = 0; w.reloading = 0;
    out.shot = heard(() => w.fire());
    out.reload = heard(() => { g.inventory.add('ammo_pistol', 12); w.startReload(); g.tick(1 / 60, 90); });
    out.dry = heard(() => a.empty('rifle'));
    const house = g.world.buildings.find((b) => b.enterable);
    const floor = g.world.surfaceAt((house.minX + house.maxX) / 2, house.floor, (house.minZ + house.maxZ) / 2);
    out.stepWood = heard(() => a.step(false, floor));
    const z = g.zombies.spawn('walker', g.player.pos.x + 3, g.player.pos.z, 'idle');
    out.death = heard(() => g.zombies.kill(z, { x: 1, y: 0, z: 0 }));
    const W = g.world;
    out.surface = [W.surfaceAt(262, 50, 0), W.surfaceAt(60, 10, 20.5), W.surfaceAt(-118, -0.5, 5), W.surfaceAt(170, 10, 110)];
    return out;
  });
  check('pistol shot plays close + distant layers', s.shot.includes('pistol_shot') && s.shot.includes('pistol_shot_far'), JSON.stringify(s.shot));
  check('tactical reload: mag out, mag in, no slide', s.reload.join() === 'pistol_mag_out,pistol_mag_in', JSON.stringify(s.reload));
  check('dry fire, footsteps and zombie death sounds', s.dry[0] === 'rifle_dry' && s.stepWood[0] === 'step_wood' && s.death[0] === 'zombie_death', JSON.stringify(s));
  check('surfaces: highway hard, dirt street gravel, river mud, field grass', s.surface.join() === 'hard,gravel,mud,grass', JSON.stringify(s.surface));
  s = await ev(() => {
    const g = window.__game, w = g.weapons, a = g.audio;
    w.owned.shotgun = true; w.current = 'shotgun'; w.show('shotgun'); w.reloading = 0; w.switchT = 0; w.mags.shotgun = 3;
    g.inventory.add('ammo_shells', 10);
    const before = g.inventory.count('ammo_shells');
    a.played.length = 0;
    w.startReload();
    g.tick(1 / 60, 45); // ~1 shell
    const mid = w.mags.shotgun;
    g.tick(1 / 60, 200);
    return { mid, end: w.mags.shotgun, used: before - g.inventory.count('ammo_shells'), sounds: [...a.played] };
  });
  check('shotgun reloads shell by shell, pumps at the end', s.mid === 4 && s.end === 6 && s.used === 3 && s.sounds.filter((x) => x === 'shotgun_shell').length === 3 && s.sounds.at(-1) === 'shotgun_pump', JSON.stringify(s));
  // open zone: terrain, river bridge, big map
  s = await ev(() => {
    const g = window.__game, W = g.world, T = W.terrain;
    // player stands on the terrain on a slope
    const hx = -214, hz = 290; place(hx, hz); g.tick(1 / 60, 20);
    const onSlope = { y: +g.player.pos.y.toFixed(2), ground: +T.height(g.player.pos.x, g.player.pos.z).toFixed(2), slope: +T.slope(hx, hz).toFixed(2) };
    // a shot fired down hits the ground; the radio hill blocks sight across it
    const down = W.raycast({ x: 0, y: 30, z: 150 }, { x: 0, y: -1, z: 0 }, 100);
    const across = W.lineOfSight({ x: -214, y: T.height(-214, 160) + 1.6, z: 160 }, { x: -214, y: T.height(-214, 340) + 1.6, z: 340 });
    const peak = T.height(-214, 250);
    return { onSlope, down: +down.toFixed(2), expect: +(30 - T.height(0, 150)).toFixed(2), across, peak: +peak.toFixed(1), zombiesOnLand: g.zombies.list.every((z) => !T.isWater(z.pos.x, z.pos.z)) };
  });
  check('player stands on sloped terrain', Math.abs(s.onSlope.y - s.onSlope.ground) < 0.1 && s.onSlope.slope > 0.05, JSON.stringify(s.onSlope));
  check('bullets hit the ground', Math.abs(s.down - s.expect) < 0.2, JSON.stringify(s));
  check('the radio hill blocks line of sight', !s.across && s.peak > 18, JSON.stringify(s));
  // walk west along the main street across the river bridge
  await ev(() => { place(-96, 21); window.__game.zombies.spawnT = 1e9; });
  await page.keyboard.down('KeyW');
  s = await ev(() => { const g = window.__game, ys = []; for (let i = 0; i < 12 * 60; i++) { g.tick(1 / 60, 1); if (Math.abs(g.player.pos.x + 118) < 3) ys.push(g.player.pos.y); } return { x: +g.player.pos.x.toFixed(1), minYOverRiver: +Math.min(...ys).toFixed(2), samples: ys.length }; });
  await page.keyboard.up('KeyW');
  check('bridge carries the player over the river', s.x < -140 && s.samples > 0 && s.minYOverRiver > 0.8, JSON.stringify(s));
  await ev(() => place(LANE.x, LANE.z));
  await page.keyboard.press('KeyM');
  s = await ev(() => ({ state: window.__game.state, map: !document.getElementById('bigmap').hidden, pois: window.__game.world.pois.length }));
  await page.screenshot({ path: SP + '/map.png' });
  await page.keyboard.press('KeyM');
  const back = await ev(() => window.__game.state);
  check('M opens the zone map and closes it', s.state === 'map' && s.map && s.pois >= 8 && back === 'playing', JSON.stringify(s) + ' back=' + back);
  // generator sanity on random zones: every door walkable, every house container reachable,
  // radio console usable, three radio parts, dry spawn and helipad
  s = await ev(() => {
    const g = window.__game, res = [];
    for (let run = 0; run < 5; run++) {
      g.newGame(); g.state = 'playing'; g.god = true;
      const w = g.world, P = g.player, T = w.terrain, issues = [];
      for (const c of w.containers.filter((c) => c.building != null)) {
        const b = w.buildings[c.building];
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2, dx = cx - c.x, dz = cz - c.z, d = Math.hypot(dx, dz);
        P.pos.set(c.x + (dx / d) * 1.3, b.floor, c.z + (dz / d) * 1.3); w.collide(P.pos, 0.35, b.floor, 1.75);
        P.yaw = Math.atan2(-(c.x - P.pos.x), -(c.z - P.pos.z)); P.pitch = -0.3;
        const it = g.findInteract(); if (!(it && it.obj === c)) issues.push('container:' + (b.name || c.kind));
      }
      for (const b of w.buildings.filter((b) => b.door)) {
        const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
        P.pos.set(b.door.x, w.groundAt({ x: b.door.x, z: b.door.z }, 0.3, w.ground(b.door.x, b.door.z) + 3, 0.45), b.door.z);
        for (let i = 0; i < 150; i++) {
          const dx = i < 70 ? b.doorIn.x : cx - P.pos.x, dz = i < 70 ? b.doorIn.z : cz - P.pos.z, l = Math.hypot(dx, dz) || 1;
          P.pos.x += (dx / l) * 0.05; P.pos.z += (dz / l) * 0.05;
          w.collide(P.pos, 0.35, P.pos.y, 1.75); P.pos.y = w.groundAt(P.pos, 0.35, P.pos.y);
        }
        if (!(P.pos.x > b.minX && P.pos.x < b.maxX && P.pos.z > b.minZ && P.pos.z < b.maxZ)) issues.push('door:' + (b.name || 'house'));
      }
      g.phase = 'radio';
      const rc = w.radioConsole, rb = w.buildings.find((b) => rc.x > b.minX && rc.x < b.maxX && rc.z > b.minZ && rc.z < b.maxZ);
      const dx = (rb.minX + rb.maxX) / 2 - rc.x, dz = (rb.minZ + rb.maxZ) / 2 - rc.z, dd = Math.hypot(dx, dz) || 1;
      P.pos.set(rc.x + (dx / dd) * 1.5, rb.floor, rc.z + (dz / dd) * 1.5); w.collide(P.pos, 0.35, rb.floor, 1.75);
      P.yaw = Math.atan2(-(rc.x - P.pos.x), -(rc.z - P.pos.z)); P.pitch = -0.3;
      const it = g.findInteract(); if (!it || it.kind !== 'radio') issues.push('radio console');
      if (w.radioContainers.length !== 3) issues.push('radio parts: ' + w.radioContainers.length);
      if (!w.isFree(w.spawn.x, w.spawn.z, 0.5)) issues.push('spawn');
      if (T.isWater(w.helipad.x, w.helipad.z)) issues.push('helipad');
      res.push(issues);
    }
    return res;
  });
  check('5 random zones: doors, containers, radio, spawn, helipad all usable', s.every((r) => r.length === 0), JSON.stringify(s));
  // settings persistence
  await page.keyboard.press('Escape');
  await page.click('#btn-settings2');
  await page.selectOption('#set-scale', '0.5');
  s = await ev(() => ({ scale: window.__game.settings.scale, pr: window.__game.renderer.getPixelRatio(), stored: localStorage.getItem('tdb.settings') }));
  check('render scale setting applies & persists', s.scale === 0.5 && s.stored.includes('"scale":0.5'), JSON.stringify(s));
  await page.screenshot({ path: SP + '/settings.png' });
} catch (e) { results.push('EXCEPTION ' + e.message.split('\n')[0]); }
console.log(results.join('\n'));
if (errs.length) console.log('ERRORS:\n' + errs.join('\n'));
await browser.close();
server.close();
const failed = results.filter((r) => !r.startsWith('PASS')).length + errs.length;
console.log(failed ? `\n${failed} problem(s)` : `\nAll ${results.length} checks passed`);
process.exit(failed ? 1 : 0);
