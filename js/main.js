// Game bootstrap: state machine, main loop, quest, shooting, looting, menus.
import * as THREE from 'three';
import { World } from './world.js';
import { Player } from './player.js';
import { Weapons, WEAPONS } from './weapons.js';
import { Zombies } from './zombies.js';
import { Effects } from './effects.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Inventory, ITEMS } from './items.js';
import { storage, fmtTime, clamp } from './util.js';

const DAY_SECONDS = 480; // one in-game day lasts 8 real minutes
const HOLD_SECONDS = 120; // survive this long after calling the evac
const SEARCH_TIME = 1.2;

const DIFFICULTY = {
  easy: { zCount: 7, zDmg: 0.6, zHp: 0.85, loot: 1.35, drain: 0.7, horde: 8 },
  normal: { zCount: 11, zDmg: 1, zHp: 1, loot: 1, drain: 1, horde: 12 },
  hard: { zCount: 17, zDmg: 1.4, zHp: 1.2, loot: 0.7, drain: 1.3, horde: 18 },
};

const DEFAULT_SETTINGS = { sens: 1, vol: 0.7, fov: 75, diff: 'normal', shadows: 'high', scale: 1, invert: false };
const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.canvas = $('view');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.settings = { ...DEFAULT_SETTINGS, ...storage.get('tdb.settings', {}) };
    this.input = new Input(this.canvas);
    this.audio = new Audio();
    this.audio.setVolume(this.settings.vol);
    this.inventory = new Inventory(20);
    this.state = 'menu';
    this.shake = 0;
    this.god = false;
    this.manual = false; // tests set this to drive time only through tick()

    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 1, 0.05, 600);
    this.ui = new UI(this);
    this.weapons = new Weapons(this);
    this.bindMenus();
    this.input.onKey = (e) => this.onKey(e);
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => this.onLockChange());

    this.newGame();
    this.resize();
    this.showScreen('menu');
    this.renderRecord();
    $('loading').hidden = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  get diff() {
    return DIFFICULTY[this.settings.diff] || DIFFICULTY.normal;
  }

  // ---------- setup ----------
  newGame() {
    if (this.scene) {
      this.scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
    }
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight), 0.05, 600);
    this.scene.add(this.camera);
    // ?seed=123 fixes the town layout (used by the automated test).
    const seed = Number(new URLSearchParams(location.search).get('seed')) || ((Math.random() * 1e9) | 0);
    this.world = new World(this.scene, { seed, lootMul: this.diff.loot });
    this.effects = new Effects(this);
    this.zombies = new Zombies(this);
    this.player = new Player(this);
    this.weapons.reset();
    this.inventory.clear();
    this.inventory.add('ammo_pistol', 24);
    this.inventory.add('bandage', 2);
    this.inventory.add('water', 1);
    this.inventory.add('chips', 1);
    this.timeOfDay = 7.5 / 24;
    this.day = 1;
    this.dayF = 1;
    this.phase = 'parts';
    this.holdT = 0;
    this.hordeCall = 0;
    this.interact = null;
    this.searchT = 0;
    this.deathT = 0;
    this.stats = { kills: 0, score: 0, time: 0, won: false };
    this.announced = {};
    this.god = false;
    this.applyShadows();
    this.world.updateSky(this.timeOfDay, this.player.pos, 0);
    // a few zombies already roam the town
    for (let i = 0; i < 70 && this.zombies.list.length < Math.round(this.diff.zCount * 0.8); i++) {
      const x = (Math.random() - 0.5) * 200, z = (Math.random() - 0.5) * 200;
      if (Math.hypot(x - this.player.pos.x, z - this.player.pos.z) < 30) continue;
      if (!this.world.isFree(x, z, 0.8)) continue;
      this.zombies.spawn(Math.random() < 0.15 ? 'runner' : 'walker', x, z);
    }
    this.player.applyCamera(0);
    this.resize();
  }

  applyShadows() {
    const s = this.settings.shadows;
    this.renderer.shadowMap.enabled = s !== 'off';
    const size = s === 'high' ? 2048 : 1024;
    const sun = this.world.sun;
    sun.castShadow = s !== 'off';
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    this.scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5) * this.settings.scale);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.weapons.camera.aspect = w / h;
    this.weapons.camera.updateProjectionMatrix();
  }

  // ---------- screens & menus ----------
  showScreen(id) {
    for (const s of ['menu', 'pause', 'settings', 'controls', 'inventory', 'end']) $(s).hidden = s !== id;
    $('hud').hidden = !(id === null || id === 'inventory' || id === 'pause');
  }

  bindMenus() {
    const on = (id, fn) => $(id).addEventListener('click', fn);
    on('btn-play', () => { this.audio.unlock(); if (this.stats.time > 0) this.newGame(); this.start(); });
    on('btn-resume', () => this.resume());
    on('btn-restart', () => { this.newGame(); this.start(); });
    on('btn-quit', () => { this.state = 'menu'; this.newGame(); this.showScreen('menu'); this.renderRecord(); });
    on('btn-again', () => { this.newGame(); this.start(); });
    on('btn-end-menu', () => { this.state = 'menu'; this.newGame(); this.showScreen('menu'); this.renderRecord(); });
    const openSub = (id) => { this.subReturn = this.state === 'paused' ? 'pause' : 'menu'; this.showScreen(id); if (id === 'settings') this.fillSettings(); };
    on('btn-settings', () => openSub('settings'));
    on('btn-settings2', () => openSub('settings'));
    on('btn-controls', () => openSub('controls'));
    on('btn-controls2', () => openSub('controls'));
    on('btn-settings-back', () => this.showScreen(this.subReturn));
    on('btn-controls-back', () => this.showScreen(this.subReturn));

    const bind = (id, key, fmt, parse = Number) => {
      const el = $(id);
      const out = $(id.replace('set-', 'out-'));
      el.addEventListener('input', () => {
        this.settings[key] = el.type === 'checkbox' ? el.checked : parse(el.value);
        if (out) out.textContent = fmt(this.settings[key]);
        this.onSettings(key);
      });
    };
    bind('set-sens', 'sens', (v) => v.toFixed(2));
    bind('set-vol', 'vol', (v) => `${Math.round(v * 100)}%`);
    bind('set-fov', 'fov', (v) => `${v}°`);
    bind('set-diff', 'diff', () => '', String);
    bind('set-shadows', 'shadows', () => '', String);
    bind('set-scale', 'scale', () => '');
    bind('set-invert', 'invert', () => '');
    // select elements fire 'change' in some browsers only
    for (const id of ['set-diff', 'set-shadows', 'set-scale', 'set-invert']) $(id).addEventListener('change', (e) => $(id).dispatchEvent(new Event('input')));

    if (matchMedia('(pointer: coarse)').matches) $('touch-note').hidden = false;
    // Pointer lock can be refused right after Esc: clicking the view tries again.
    this.canvas.addEventListener('mousedown', () => { if (this.state === 'playing' && !this.input.locked) this.input.requestLock(); });
  }

  fillSettings() {
    const s = this.settings;
    $('set-sens').value = s.sens; $('out-sens').textContent = s.sens.toFixed(2);
    $('set-vol').value = s.vol; $('out-vol').textContent = `${Math.round(s.vol * 100)}%`;
    $('set-fov').value = s.fov; $('out-fov').textContent = `${s.fov}°`;
    $('set-diff').value = s.diff;
    $('set-shadows').value = s.shadows;
    $('set-scale').value = String(s.scale);
    $('set-invert').checked = s.invert;
  }

  onSettings(key) {
    storage.set('tdb.settings', this.settings);
    if (key === 'vol') this.audio.setVolume(this.settings.vol);
    if (key === 'shadows') this.applyShadows();
    if (key === 'scale') this.resize();
    if (key === 'diff' && this.state === 'playing') this.ui.msg('Сложность применится в новой игре');
  }

  renderRecord() {
    const r = storage.get('tdb.record', null);
    $('record').textContent = r ? `Рекорд: ${r.kills} убийств · продержался ${fmtTime(r.time)}${r.wins ? ` · эвакуаций: ${r.wins}` : ''}` : '';
  }

  start() {
    this.audio.unlock();
    this.state = 'playing';
    this.showScreen(null);
    this.input.reset();
    this.input.enabled = true;
    this.input.requestLock();
    if (this.stats.time === 0) {
      this.ui.msg('Город пал. Эвакуация ушла без тебя.', 'key');
      setTimeout(() => this.ui.msg('Найди 3 детали рации в домах — пеленгатор на компасе.'), 1600);
      setTimeout(() => this.ui.msg('Tab — рюкзак, E — обыскать, F — фонарик.'), 3400);
    }
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.expectUnlock = true;
    this.input.exitLock();
    this.showScreen('pause');
  }

  resume() {
    this.state = 'playing';
    this.showScreen(null);
    this.input.reset();
    this.input.enabled = true;
    this.input.requestLock();
  }

  toggleInventory() {
    if (this.state === 'playing') {
      this.state = 'inventory';
      this.input.enabled = false;
      this.expectUnlock = true;
      this.input.exitLock();
      this.ui.renderInventory();
      this.ui.describe(null);
      this.showScreen('inventory');
    } else if (this.state === 'inventory') {
      this.resume();
    }
  }

  onKey(e) {
    if (e.code === 'Escape') {
      if (this.state === 'playing') { this.pause(); return true; }
      if (this.state === 'paused') { this.resume(); return true; }
      if (this.state === 'inventory') { this.resume(); return true; }
    }
    if (e.code === 'Tab' || e.code === 'KeyI') {
      if (this.state === 'playing' || this.state === 'inventory') { this.toggleInventory(); return true; }
    }
    return false;
  }

  onLockChange() {
    const locked = document.pointerLockElement === this.canvas;
    if (!locked && this.state === 'playing' && !this.expectUnlock) this.pause();
    this.expectUnlock = false;
  }

  // ---------- gameplay helpers ----------
  noise(pos, radius) {
    this.zombies.noise(pos, radius);
  }

  shoot(origin, dir, def, first) {
    const tWorld = this.world.raycast(origin, dir, def.range);
    const hit = this.zombies.raycast(origin, dir, tWorld);
    const muzzle = origin.clone().addScaledVector(dir, 0.8);
    muzzle.y -= 0.12;
    if (hit) {
      let dmg = def.damage * (hit.head ? 2.3 : 1);
      if (def.pellets > 1) dmg *= clamp(1 - (hit.t - 8) / 30, 0.3, 1);
      const p = origin.clone().addScaledVector(dir, hit.t);
      this.zombies.hit(hit.z, dmg, hit.head, dir);
      this.effects.blood(p, hit.head ? 12 : 7);
      this.ui.hitmarker(hit.head);
      this.audio.impact(true);
      if (first) this.effects.tracer(muzzle, p);
      return true;
    }
    const end = origin.clone().addScaledVector(dir, Math.min(tWorld, def.range));
    if (tWorld < def.range) this.effects.spark(end);
    if (first) this.effects.tracer(muzzle, end);
    return false;
  }

  melee(def) {
    if (this.state !== 'playing') return;
    const p = this.player;
    const f = p.forward();
    const fl = Math.hypot(f.x, f.z) || 1;
    let best = null, bd = def.range;
    for (const z of this.zombies.list) {
      if (z.dead) continue;
      const dx = z.pos.x - p.pos.x, dz = z.pos.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > def.range + 0.3 * z.scale || Math.abs(z.pos.y - p.pos.y) > 1.8) continue;
      const dot = (dx * f.x + dz * f.z) / (d * fl || 1);
      if (dot < 0.55) continue;
      if (d < bd + 0.3) { bd = d; best = z; }
    }
    if (!best) return;
    // Stealth kill: zombies that haven't noticed you take triple damage.
    const sneak = best.state !== 'chase';
    const dmg = def.damage * (sneak ? 3 : 1);
    const dir = new THREE.Vector3(f.x / fl, 0, f.z / fl);
    this.zombies.hit(best, dmg, false, dir);
    this.effects.blood(new THREE.Vector3(best.pos.x, best.pos.y + 1.3 * best.scale, best.pos.z), 10);
    this.ui.hitmarker(sneak);
    this.audio.impact(true);
    if (sneak && best.dead) this.ui.msg('Тихое убийство', 'good');
  }

  giveItem(id, qty) {
    const it = ITEMS[id];
    if (it.weapon) {
      const first = this.weapons.give(it.weapon);
      this.ui.msg(first ? `Новое оружие: ${it.name} [${WEAPONS[it.weapon].slot}]` : `${it.name}: разобран на патроны`, 'key');
      return 0;
    }
    const left = this.inventory.add(id, qty);
    const got = qty - left;
    if (got > 0) this.ui.msg(`+ ${it.name}${got > 1 ? ` ×${got}` : ''}`, id === 'radio_part' ? 'key' : 'good');
    if (id === 'radio_part' && got > 0) this.onRadioPart();
    if (left > 0) this.ui.msg('Рюкзак полон', 'bad');
    return left;
  }

  onRadioPart() {
    const n = this.inventory.count('radio_part');
    if (n >= 3 && this.phase === 'parts') {
      this.phase = 'radio';
      this.ui.msg('Рация собрана! Иди к радиовышке и вызови эвакуацию.', 'key');
    } else this.ui.msg(`Деталей рации: ${n} из 3`, 'key');
  }

  useItem(i) {
    const s = this.inventory.slots[i];
    if (!s) return;
    const it = ITEMS[s.id];
    const p = this.player;
    let used = false;
    switch (s.id) {
      case 'bandage':
        if (p.bleeding || p.hp < 100) { p.bleeding = false; p.hp = Math.min(100, p.hp + 15); used = true; }
        break;
      case 'medkit':
        if (p.bleeding || p.hp < 100) { p.bleeding = false; p.hp = Math.min(100, p.hp + 60); used = true; }
        break;
      case 'painkillers':
        if (p.hp < 100) { p.healOverTime += 25; used = true; }
        break;
      case 'canned': p.hunger = Math.min(100, p.hunger + 45); used = true; break;
      case 'chips': p.hunger = Math.min(100, p.hunger + 20); used = true; break;
      case 'water': p.thirst = Math.min(100, p.thirst + 50); used = true; break;
      case 'energy': p.thirst = Math.min(100, p.thirst + 20); p.energyTime = 40; p.stamina = 100; p.exhausted = false; used = true; break;
      case 'battery':
        if (p.battery < 100) { p.battery = 100; used = true; }
        break;
      default:
        return;
    }
    if (used) {
      this.inventory.remove(s.id, 1);
      this.audio.use();
      this.ui.msg(`Использовано: ${it.name}`, 'good');
    } else this.ui.msg(`${it.name}: сейчас не нужно`);
  }

  quickHeal() {
    const p = this.player;
    const inv = this.inventory;
    let id = null;
    if (p.bleeding) id = inv.count('bandage') ? 'bandage' : inv.count('medkit') ? 'medkit' : null;
    else if (p.hp < 45 && inv.count('medkit')) id = 'medkit';
    else if (p.hp < 100) id = ['painkillers', 'bandage', 'medkit'].find((k) => inv.count(k));
    if (!id) {
      this.ui.msg(p.hp >= 100 && !p.bleeding ? 'Ты здоров' : 'Нечем лечиться', p.hp >= 100 ? '' : 'bad');
      return;
    }
    this.useItem(inv.slots.findIndex((s) => s && s.id === id));
  }

  dropItem(i) {
    const s = this.inventory.slots[i];
    if (!s || ITEMS[s.id].quest) { if (s) this.ui.msg('Это нельзя выбросить'); return; }
    const p = this.player;
    const f = p.forward();
    this.world.addPickup(s.id, s.qty, p.pos.x + f.x * 1.2, p.pos.y, p.pos.z + f.z * 1.2);
    this.inventory.slots[i] = null;
  }

  // ---------- quest ----------
  objective() {
    const n = this.inventory.count('radio_part');
    switch (this.phase) {
      case 'parts': {
        const t = this.nearestPart();
        const d = t ? Math.round(Math.hypot(t.x - this.player.pos.x, t.z - this.player.pos.z)) : 0;
        return { text: `Найди детали рации: ${n} / 3`, sub: t ? `Сигнал пеленгатора: ${d} м` : '' };
      }
      case 'radio': {
        const d = Math.round(Math.hypot(this.world.radioConsole.x - this.player.pos.x, this.world.radioConsole.z - this.player.pos.z));
        return { text: 'Вызови эвакуацию с радиовышки', sub: `Пульт в будке у вышки: ${d} м` };
      }
      case 'hold':
        return { text: 'Продержись до прилёта вертолёта', sub: `Осталось ${fmtTime(Math.max(0, HOLD_SECONDS - this.holdT))}` };
      case 'evac': {
        const h = this.world.helipad;
        const d = Math.round(Math.hypot(h.x - this.player.pos.x, h.z - this.player.pos.z));
        return { text: 'Беги к вертолёту!', sub: `Вертолётная площадка: ${d} м` };
      }
      default:
        return { text: 'Эвакуирован', sub: '' };
    }
  }

  nearestPart() {
    let best = null, bd = Infinity;
    for (const c of this.world.radioContainers) {
      if (!c.items.some((i) => i.id === 'radio_part')) continue;
      const d = Math.hypot(c.x - this.player.pos.x, c.z - this.player.pos.z);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  objectivePos() {
    if (this.phase === 'parts') return this.nearestPart();
    if (this.phase === 'radio') return this.world.radioConsole;
    if (this.phase === 'hold' || this.phase === 'evac') return this.world.helipad;
    return null;
  }

  // ---------- interaction ----------
  findInteract() {
    const p = this.player;
    const eye = p.eyePos();
    const f = p.forward();
    let best = null, bs = Infinity;
    const consider = (obj, x, y, z, kind, range = 2.3) => {
      const dx = x - eye.x, dy = y - eye.y, dz = z - eye.z;
      const d = Math.hypot(dx, dy, dz);
      if (d > range + 0.8) return;
      const hd = Math.hypot(dx, dz);
      if (hd > range) return;
      const dot = (dx * f.x + dy * f.y + dz * f.z) / (d || 1);
      if (dot < 0.55 && d > 1.1) return;
      const score = d * (2 - dot);
      if (score < bs) { bs = score; best = { obj, kind }; }
    };
    for (const c of this.world.containers) {
      if (c.searched && c.items.length === 0) continue;
      if (Math.abs(c.x - p.pos.x) > 4 || Math.abs(c.z - p.pos.z) > 4) continue;
      consider(c, c.x, c.y, c.z, 'container');
    }
    for (const it of this.world.pickups) consider(it, it.x, it.y, it.z, 'pickup');
    const rc = this.world.radioConsole;
    if (rc && (this.phase === 'radio' || this.phase === 'parts')) consider(rc, rc.x, rc.y, rc.z, 'radio', 2.6);
    const h = this.effects.heli;
    if (h && h.landed) consider(h, h.group.position.x, 1.5, h.group.position.z, 'heli', 7);
    if (best && best.kind !== 'heli') {
      // The loot point sits inside its furniture, so allow the ray to stop within the last 0.9 m.
      const o = best.obj;
      const dx = o.x - eye.x, dy = o.y + 0.1 - eye.y, dz = o.z - eye.z;
      const len = Math.hypot(dx, dy, dz);
      const t = this.world.raycast(eye, { x: dx / len, y: dy / len, z: dz / len }, len);
      if (t < len - 0.9) best = null;
    }
    return best;
  }

  updateInteract(dt) {
    const it = this.findInteract();
    const same = it && this.interact && it.obj === this.interact.obj;
    if (!same) this.searchT = 0;
    this.interact = it;
    if (!it) { this.ui.prompt(null); this.ui.progress(null); return; }
    const k = '<kbd>E</kbd>';
    if (it.kind === 'pickup') {
      const itm = ITEMS[it.obj.id];
      this.ui.prompt(`${k}Подобрать: ${itm.name}${it.obj.qty > 1 ? ` ×${it.obj.qty}` : ''}`);
      this.ui.progress(null);
      if (this.input.pressed('KeyE')) {
        const left = this.giveItem(it.obj.id, it.obj.qty);
        this.audio.pickup();
        if (left > 0) it.obj.qty = left;
        else this.world.removePickup(it.obj);
      }
      return;
    }
    if (it.kind === 'radio') {
      if (this.phase === 'parts') {
        this.ui.prompt(`Рации не хватает деталей: ${this.inventory.count('radio_part')} / 3`);
        return;
      }
      this.ui.prompt(`${k}Удерживай — вызвать эвакуацию`);
      this.holdSearch(dt, 2.5, () => this.callEvac());
      return;
    }
    if (it.kind === 'heli') {
      this.ui.prompt(`${k}Сесть в вертолёт`);
      if (this.input.pressed('KeyE')) this.win();
      return;
    }
    const c = it.obj;
    const label = c.label[0].toUpperCase() + c.label.slice(1);
    this.ui.prompt(c.searched ? `${k}Забрать остатки: ${label.toLowerCase()}` : `${k}Удерживай — обыскать ${c.label}`);
    this.holdSearch(dt, c.searched ? 0.2 : SEARCH_TIME, () => this.lootContainer(c));
  }

  holdSearch(dt, time, done) {
    if (this.input.down('KeyE')) {
      this.searchT += dt;
      this.ui.progress(Math.min(1, this.searchT / time));
      if (this.searchT >= time) {
        this.searchT = -1e9; // needs a new press
        done();
      }
    } else {
      this.searchT = 0;
      this.ui.progress(null);
    }
    if (this.searchT < 0) this.ui.progress(null);
  }

  lootContainer(c) {
    const first = !c.searched;
    c.searched = true;
    if (c.items.length === 0) {
      this.ui.msg(`${c.label[0].toUpperCase() + c.label.slice(1)}: пусто`);
      this.audio.click();
      return;
    }
    const rest = [];
    for (const item of c.items) {
      const left = this.giveItem(item.id, item.qty);
      if (left > 0) rest.push({ id: item.id, qty: left });
    }
    c.items = rest;
    this.audio.pickup();
    if (first) this.noise(this.player.pos, 4);
  }

  callEvac() {
    this.inventory.remove('radio_part', 3);
    this.phase = 'hold';
    this.holdT = 0;
    this.zombies.hordeTarget = this.diff.horde;
    this.audio.radio();
    this.ui.msg('«Борт 12, принял. Вылетаем. Продержитесь две минуты».', 'key');
    setTimeout(() => this.ui.msg('Сигнал слышали не только военные. Орда идёт!', 'bad'), 2500);
    this.noise(this.player.pos, 120);
  }

  win() {
    if (this.state !== 'playing') return;
    this.phase = 'done';
    this.stats.won = true;
    this.endGame('Эвакуирован', 'Вертолёт поднимается над мёртвым городом. Ты выжил.');
  }

  onDeath(reason) {
    if (this.state !== 'playing') return;
    this.state = 'dying';
    this.deathReason = reason;
    this.deathT = 0;
    this.input.enabled = false;
    this.ui.prompt(null);
    this.ui.progress(null);
  }

  endGame(title, reason) {
    this.state = this.stats.won ? 'won' : 'dead';
    this.input.enabled = false;
    this.expectUnlock = true;
    this.input.exitLock();
    const s = this.stats;
    const acc = this.weapons.shotsFired ? Math.round((this.weapons.shotsHit / this.weapons.shotsFired) * 100) : 0;
    $('end-title').textContent = title;
    $('end-reason').textContent = reason;
    $('end-stats').innerHTML = [
      ['Прожито', fmtTime(s.time)],
      ['Игровых дней', this.day],
      ['Убито зомби', s.kills],
      ['Точность', `${acc}%`],
      ['Пройдено', `${(this.player.distance / 1000).toFixed(2)} км`],
      ['Очки', s.score + (s.won ? 500 : 0)],
    ].map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('');
    const rec = storage.get('tdb.record', { kills: 0, time: 0, wins: 0 });
    storage.set('tdb.record', { kills: Math.max(rec.kills, s.kills), time: Math.max(rec.time, s.time), wins: (rec.wins || 0) + (s.won ? 1 : 0) });
    this.showScreen('end');
  }

  // ---------- main loop ----------
  update(dt) {
    const input = this.input;
    const p = this.player;
    this.stats.time += dt;

    // time of day
    const prevHour = this.timeOfDay * 24;
    this.timeOfDay += dt / DAY_SECONDS;
    if (this.timeOfDay >= 1) { this.timeOfDay -= 1; this.day++; this.ui.msg(`Наступил день ${this.day}`, 'key'); }
    const hour = this.timeOfDay * 24;
    if (prevHour < 20 && hour >= 20) this.ui.msg('Темнеет. Ночью зомби больше и они быстрее.', 'bad');
    if (prevHour < 6 && hour >= 6) this.ui.msg('Рассвет. Пережил ночь.', 'good');

    if (input.dx || input.dy) p.look(input.dx, input.dy, this.settings.sens, this.settings.invert);
    if (input.pressed('KeyF')) p.toggleLight();
    if (input.pressed('KeyH')) this.quickHeal();

    p.update(dt, input);
    this.weapons.update(dt, input);
    if (this.state !== 'playing') return;
    this.zombies.update(dt);
    this.effects.update(dt);
    const sky = this.world.updateSky(this.timeOfDay, p.pos, dt);
    this.dayF = sky.dayF;
    this.weapons.syncLight(this.world);
    this.updateInteract(dt);

    if (this.phase === 'hold') {
      this.holdT += dt;
      // the horde keeps homing in on you while you wait
      this.hordeCall = (this.hordeCall || 0) - dt;
      if (this.hordeCall <= 0) { this.hordeCall = 5; this.noise(p.pos, 70); }
      if (this.holdT >= HOLD_SECONDS) {
        this.phase = 'evac';
        this.effects.spawnHeli(this.world.helipad);
        this.ui.msg('Вертолёт на подлёте к площадке! Беги!', 'key');
      }
    }

    // heartbeat when hurt
    this.beatT = (this.beatT || 0) - dt;
    if (p.hp < 30 && this.beatT <= 0) { this.beatT = 0.9; this.audio.heartbeat(); }

    this.ui.update(dt);
  }

  updateDying(dt) {
    this.deathT += dt;
    const k = Math.min(1, this.deathT / 1.2);
    const p = this.player;
    this.camera.position.y = Math.max(p.pos.y + 0.3, p.pos.y + p.height - k * (p.height - 0.3));
    this.camera.rotation.z = k * 1.2;
    this.zombies.update(dt);
    this.effects.update(dt);
    this.world.updateSky(this.timeOfDay, p.pos, dt);
    this.ui.el.hurt.style.opacity = 0.6 + k * 0.4;
    if (this.deathT > 2.2) this.endGame('Ты погиб', this.deathReason);
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === 'playing' || this.state === 'paused' || this.state === 'inventory') {
      r.clearDepth();
      r.render(this.weapons.scene, this.weapons.camera);
    }
  }

  // Advances the simulation without rendering; automated tests use it to run
  // in game time instead of wall time.
  tick(dt = 1 / 60, n = 1) {
    for (let i = 0; i < n; i++) {
      if (this.state === 'playing') this.update(dt);
      else if (this.state === 'dying') this.updateDying(dt);
      this.input.endFrame();
    }
  }

  loop(now) {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.manual) {
      // simulation advanced by tick() only
    } else if (this.state === 'playing') this.update(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.state === 'menu') {
      // slow orbit behind the main menu
      this.menuT = (this.menuT || 0) + dt;
      const a = this.menuT * 0.05;
      this.camera.position.set(Math.sin(a) * 40, 14, Math.cos(a) * 40);
      this.camera.lookAt(0, 2, 0);
      this.world.updateSky(0.29, { x: 0, z: 0 }, dt);
    }
    this.render();
    if (!this.manual) this.input.endFrame();
    requestAnimationFrame((t) => this.loop(t));
  }
}

try {
  window.__game = new Game();
} catch (err) {
  console.error(err);
  const l = document.getElementById('loading');
  l.hidden = false;
  l.querySelector('h2').textContent = 'Не удалось запустить WebGL. Обнови браузер или включи аппаратное ускорение.';
}
