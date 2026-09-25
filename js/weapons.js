// Weapons: stats, first-person view models, firing, reloading and switching.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

export const WEAPONS = {
  knife: { name: 'Нож', slot: 1, melee: true, damage: 45, range: 2.3, rate: 0.5, tire: 2.5, hold: 0 },
  pistol: { name: 'ПМ', slot: 2, damage: 28, mag: 12, rate: 0.16, auto: false, spread: 0.014, adsSpread: 0.003, recoil: 0.035, reload: 1.4, ammo: 'ammo_pistol', noise: 45, pellets: 1, range: 120, tire: 1.6, hold: 4 },
  shotgun: { name: 'ИЖ-81', slot: 3, damage: 15, mag: 6, rate: 0.85, auto: false, spread: 0.065, adsSpread: 0.045, recoil: 0.1, reload: 2.5, shells: true, ammo: 'ammo_shells', noise: 60, pellets: 9, range: 45, tire: 7, hold: 9 },
  rifle: { name: 'АКС-74У', slot: 4, damage: 25, mag: 30, rate: 0.095, auto: true, spread: 0.022, adsSpread: 0.006, recoil: 0.02, reload: 2.2, ammo: 'ammo_rifle', noise: 65, pellets: 1, range: 160, tire: 1.25, hold: 7.5 },
};
export const ORDER = ['knife', 'pistol', 'shotgun', 'rifle'];
const SHELL_TIME = 0.5; // seconds per shotgun shell

// Arm fatigue thresholds (0..100).
export const FATIGUE = { tremble: 35, twitch: 75 };

function mat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.15, ...o });
}

function part(group, geo, material, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  group.add(m);
  return m;
}

function buildModels() {
  const steel = mat(0x5a5f64);
  const dark = mat(0x34373b);
  const wood = mat(0x6b4526, { metalness: 0.05, roughness: 0.8 });
  const blade = mat(0xc9cdd1, { metalness: 0.9, roughness: 0.25 });
  const skin = mat(0x8a6a55, { metalness: 0, roughness: 0.9 });
  const sleeve = mat(0x3b4030, { metalness: 0, roughness: 1 });
  const B = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const C = (r, l) => new THREE.CylinderGeometry(r, r, l, 10).rotateX(Math.PI / 2);

  const hand = (g, x, y, z) => {
    part(g, B(0.075, 0.085, 0.1), skin, x, y, z);
    part(g, B(0.09, 0.09, 0.26), sleeve, x + 0.03, y - 0.06, z + 0.17, 0.35);
  };

  const models = {};
  let g = new THREE.Group();
  part(g, B(0.03, 0.035, 0.12), dark, 0, 0, 0);
  part(g, B(0.012, 0.04, 0.22), blade, 0, 0.005, -0.17);
  part(g, B(0.05, 0.05, 0.015), steel, 0, 0, -0.065);
  hand(g, 0, -0.01, 0.02);
  g.userData.muzzle = new THREE.Vector3(0, 0, -0.3);
  g.userData.hip = new THREE.Vector3(0.22, -0.2, -0.4);
  models.knife = g;

  g = new THREE.Group();
  part(g, B(0.04, 0.045, 0.19), steel, 0, 0.03, -0.05);
  part(g, B(0.036, 0.1, 0.05), dark, 0, -0.035, 0.02, 0.25);
  part(g, B(0.008, 0.012, 0.01), dark, 0, 0.058, -0.13);
  part(g, B(0.03, 0.01, 0.01), dark, 0, 0.058, 0.03);
  hand(g, 0, -0.05, 0.05);
  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.16);
  g.userData.ads = new THREE.Vector3(0, -0.058, -0.34);
  g.userData.hip = new THREE.Vector3(0.2, -0.19, -0.44);
  models.pistol = g;

  g = new THREE.Group();
  part(g, C(0.022, 0.62), steel, 0, 0.03, -0.3);
  part(g, C(0.02, 0.55), steel, 0, 0.0, -0.27);
  part(g, B(0.06, 0.06, 0.16), wood, 0, -0.01, -0.3);
  part(g, B(0.05, 0.07, 0.18), dark, 0, 0.01, -0.02);
  part(g, B(0.05, 0.11, 0.3), wood, 0, -0.05, 0.18, 0.18);
  part(g, B(0.01, 0.015, 0.01), blade, 0, 0.058, -0.58);
  hand(g, 0, -0.06, -0.3);
  hand(g, 0.01, -0.06, 0.05);
  g.userData.muzzle = new THREE.Vector3(0, 0.03, -0.62);
  g.userData.ads = new THREE.Vector3(0, -0.06, -0.52);
  g.userData.hip = new THREE.Vector3(0.2, -0.21, -0.56);
  models.shotgun = g;

  g = new THREE.Group();
  part(g, B(0.055, 0.075, 0.34), steel, 0, 0.01, -0.1);
  part(g, B(0.05, 0.03, 0.3), dark, 0, 0.06, -0.1);
  part(g, C(0.016, 0.22), dark, 0, 0.025, -0.36);
  part(g, B(0.045, 0.05, 0.16), wood, 0, 0.0, -0.3);
  part(g, B(0.04, 0.14, 0.06), wood, 0, -0.09, -0.12, 0.35);
  part(g, B(0.035, 0.1, 0.05), dark, 0, -0.06, 0.03, -0.2);
  part(g, B(0.02, 0.04, 0.22), steel, 0, 0.0, 0.17);
  part(g, B(0.012, 0.02, 0.012), dark, 0, 0.085, -0.22);
  hand(g, 0, -0.05, -0.28);
  hand(g, 0.01, -0.08, 0.04);
  g.userData.muzzle = new THREE.Vector3(0, 0.025, -0.48);
  g.userData.ads = new THREE.Vector3(0, -0.085, -0.46);
  g.userData.hip = new THREE.Vector3(0.19, -0.2, -0.5);
  models.rifle = g;

  for (const m of Object.values(models)) m.traverse((o) => { o.frustumCulled = false; });
  return models;
}

export class Weapons {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.ambient = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.light = new THREE.DirectionalLight(0xffffff, 1.5);
    this.light.position.set(0.5, 1, 0.6);
    this.scene.add(this.ambient, this.light);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.models = buildModels();
    for (const m of Object.values(this.models)) { m.visible = false; this.rig.add(m); }

    const flashTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grd.addColorStop(0, 'rgba(255,245,200,1)');
      grd.addColorStop(0.3, 'rgba(255,190,80,0.9)');
      grd.addColorStop(1, 'rgba(255,120,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    })();
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    this.flash.scale.set(0.2, 0.2, 0.2);
    this.flash.visible = false;
    this.rig.add(this.flash);
    this.reset();
  }

  reset() {
    this.owned = { knife: true, pistol: true, shotgun: false, rifle: false };
    this.mags = { pistol: 12, shotgun: 0, rifle: 0 };
    this.current = 'pistol';
    this.pending = null;
    this.switchT = 0;
    this.cooldown = 0;
    this.reloading = 0;
    this.reloadTotal = 1;
    this.reloadEvents = [];
    this.reloadKind = 'pistol';
    this.aiming = false;
    this.aimT = 0;
    this.recoilPitch = 0;
    this.kick = 0;
    this.flashT = 0;
    this.swingT = 0;
    this.meleeT = 0;
    this.bloom = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    // arm fatigue & body-cam style hand movement
    this.fatigue = 0;
    this.armT = 0;
    this.restT = 0; // seconds since the arms last worked
    this.twitchT = 0;
    this.twitches = 0;
    this.jerkYaw = 0;
    this.jerkPitch = 0;
    this.swayYaw = 0;
    this.swayPitch = 0;
    this.lagX = 0;
    this.lagY = 0;
    this.microT = 0;
    this.micro = 0;
    this.phase = [Math.random() * 10, Math.random() * 10, Math.random() * 10, Math.random() * 10];
    this.warnedTwitch = false;
    this.show(this.current);
  }

  show(id) {
    for (const [k, m] of Object.entries(this.models)) m.visible = k === id;
  }

  get def() {
    return WEAPONS[this.current];
  }

  reserve(id = this.current) {
    const d = WEAPONS[id];
    return d.ammo ? this.game.inventory.count(d.ammo) : 0;
  }

  give(id) {
    const first = !this.owned[id];
    this.owned[id] = true;
    if (first) {
      this.mags[id] = Math.floor(WEAPONS[id].mag / 2);
      this.select(id);
    } else {
      // Duplicate gun: strip it for ammo.
      this.game.inventory.add(WEAPONS[id].ammo, Math.floor(WEAPONS[id].mag / 2));
    }
    return first;
  }

  select(id) {
    if (!this.owned[id] || (id === this.current && !this.pending)) return;
    this.pending = id;
    this.switchT = 0.3;
    this.reloading = 0;
    this.game.audio.click();
  }

  cycle(dir) {
    const owned = ORDER.filter((k) => this.owned[k]);
    const i = owned.indexOf(this.pending || this.current);
    this.select(owned[(i + dir + owned.length) % owned.length]);
  }

  startReload() {
    const d = this.def;
    if (d.melee || this.reloading > 0 || this.switchT > 0) return;
    if (this.mags[this.current] >= d.mag) return;
    if (this.reserve() <= 0) {
      this.game.ui.msg('Нет патронов для ' + d.name, 'bad');
      return;
    }
    this.aiming = false;
    this.reloadKind = this.current;
    if (d.shells) {
      // pump shotgun: one shell at a time, can be interrupted by firing
      this.reloadTotal = this.reloading = SHELL_TIME + 0.2;
      this.reloadEvents = [];
      return;
    }
    // a round still in the chamber: no need to rack the slide, 20% faster
    const tactical = this.mags[this.current] > 0;
    this.reloadTotal = this.reloading = d.reload * (tactical ? 0.8 : 1);
    this.reloadEvents = [[0.12, 'mag_out'], [0.6, 'mag_in']];
    if (!tactical) this.reloadEvents.push([0.82, 'slide']);
  }

  finishReload() {
    const d = this.def;
    if (d.shells) {
      this.game.inventory.remove(d.ammo, 1);
      this.mags[this.current] += 1;
      this.game.audio.mech(this.current, 'shell');
      if (this.mags[this.current] < d.mag && this.reserve() > 0) this.reloadTotal = this.reloading = SHELL_TIME;
      else this.game.audio.mech(this.current, 'pump');
      return;
    }
    const need = d.mag - this.mags[this.current];
    const got = this.game.inventory.remove(d.ammo, need);
    this.mags[this.current] += got;
  }

  // Mechanical sounds at fixed points of the reload animation.
  tickReload(dt) {
    const done = 1 - this.reloading / this.reloadTotal;
    while (this.reloadEvents.length && done >= this.reloadEvents[0][0]) {
      this.game.audio.mech(this.reloadKind, this.reloadEvents.shift()[1]);
    }
    this.reloading -= dt;
    if (this.reloading <= 0) {
      this.reloading = 0;
      this.finishReload();
    }
  }

  update(dt, input) {
    const g = this.game;
    const p = g.player;
    this.cooldown -= dt;

    // switching
    for (const k of ORDER) if (input.pressed('Digit' + WEAPONS[k].slot)) this.select(k);
    if (input.wheel) this.cycle(input.wheel > 0 ? 1 : -1);
    if (this.switchT > 0) {
      this.switchT -= dt;
      if (this.pending && this.switchT < 0.15) {
        this.current = this.pending;
        this.pending = null;
        this.show(this.current);
      }
    }

    const d = this.def;
    // reload
    if (input.pressed('KeyR')) this.startReload();
    // firing interrupts a shell-by-shell reload
    if (this.reloading > 0 && d.shells && this.mags[this.current] > 0 && input.mousePressed(0)) {
      this.reloading = 0;
      this.game.audio.mech(this.current, 'pump');
      this.cooldown = Math.max(this.cooldown, 0.3);
    }
    if (this.reloading > 0) this.tickReload(dt);

    this.updateArms(dt, input);
    const busy = this.switchT > 0 || this.reloading > 0 || this.twitchT > 0;
    this.aiming = !d.melee && input.mouseDown(2) && !busy && !p.sprinting;
    this.aimT = lerp(this.aimT, this.aiming ? 1 : 0, Math.min(1, dt * 14));

    // fire
    const trigger = d.auto ? input.mouseDown(0) : input.mousePressed(0);
    if (trigger && !busy && this.cooldown <= 0 && !p.sprinting) {
      if (d.melee) this.swing();
      else if (this.mags[this.current] > 0) this.fire();
      else {
        g.audio.empty(this.current);
        this.cooldown = 0.25;
        if (this.reserve() > 0) this.startReload();
        else if (input.mousePressed(0)) g.ui.msg('Магазин пуст', 'bad');
      }
    }

    // recoil recovery
    this.recoilPitch = lerp(this.recoilPitch, 0, Math.min(1, dt * 7));
    this.kick = lerp(this.kick, 0, Math.min(1, dt * 12));
    this.bloom = Math.max(0, this.bloom - dt * 0.12);
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    g.effects.muzzleLight(this.flashT > 0);
    this.swingT = Math.max(0, this.swingT - dt);
    if (this.meleeT > 0) {
      this.meleeT -= dt;
      if (this.meleeT <= 0) g.melee(WEAPONS.knife);
    }

    this.pose(dt);
  }

  // How fast the arms tire: hunger, exhaustion and wounds make it worse.
  fatigueMul() {
    const p = this.game.player;
    let m = 1;
    if (p.hunger < 25) m += 0.5;
    if (p.thirst < 25) m += 0.3;
    if (p.exhausted) m += 0.5;
    if (p.hp < 30) m += 0.4;
    return m;
  }

  tire(amount) {
    this.fatigue = clamp(this.fatigue + amount * this.fatigueMul(), 0, 100);
    this.restT = 0;
  }

  updateArms(dt, input) {
    const g = this.game;
    const p = g.player;
    const d = this.def;
    // holding a gun up tires the arms; lowering it lets them recover
    if (this.aiming) this.tire(d.hold * dt);
    this.restT += dt;
    const lowered = p.sprinting || this.reloading > 0 || this.switchT > 0 || this.twitchT > 0;
    if (!this.aiming && (this.restT > 0.7 || lowered)) {
      const rate = (lowered ? 20 : 13) * (p.crouching ? 1.3 : 1);
      this.fatigue = Math.max(0, this.fatigue - rate * dt);
    }

    // tremor: smooth pseudo-noise, grows with fatigue; low stamina adds breathing sway
    const f = this.fatigue / 100;
    this.armT += dt;
    const t = this.armT;
    const ph = this.phase;
    const amp = Math.pow(f, 1.5) * 0.02 * (1 - this.aimT * 0.25) + (1 - p.stamina / 100) * 0.005;
    const nx = Math.sin(t * 1.3 + ph[0]) * 0.6 + Math.sin(t * 3.7 + ph[1]) * 0.3 + Math.sin(t * 9.1 + ph[2]) * 0.1 * f;
    const ny = Math.sin(t * 1.1 + ph[3]) * 0.5 + Math.sin(t * 2.9 + ph[0]) * 0.35 + Math.sin(t * 11 + ph[1]) * 0.15 * f;
    // small nervous twitches once the arms are tired
    this.microT -= dt;
    if (this.fatigue > FATIGUE.tremble + 10 && this.microT <= 0) {
      this.microT = 0.4 + Math.random() * 1.6;
      this.micro = (Math.random() - 0.5) * 0.012 * f;
    }
    this.micro *= Math.exp(-dt * 10);
    this.swayYaw = nx * amp + this.micro;
    this.swayPitch = ny * amp * 0.8 + this.micro * 0.5;

    // the hand gives out: sharp jerk, the gun drops for a moment (body-cam style)
    if (this.twitchT > 0) this.twitchT -= dt;
    const busyArms = this.aiming || this.restT < 0.3;
    if (this.twitchT <= 0 && busyArms && !d.melee && this.fatigue > FATIGUE.twitch) {
      const chance = ((this.fatigue - FATIGUE.twitch) / (100 - FATIGUE.twitch)) * 0.9 * dt;
      if (this.fatigue >= 99.5 || Math.random() < chance) this.twitch();
    }
    this.jerkYaw *= Math.exp(-dt * 5);
    this.jerkPitch *= Math.exp(-dt * 5);

    // view-model lags behind fast mouse movement
    this.lagX = lerp(this.lagX, clamp(-input.dx * 0.0009, -0.04, 0.04), Math.min(1, dt * 10));
    this.lagY = lerp(this.lagY, clamp(input.dy * 0.0009, -0.04, 0.04), Math.min(1, dt * 10));
  }

  twitch() {
    const g = this.game;
    const side = Math.random() < 0.5 ? -1 : 1;
    this.twitchT = 0.65;
    this.twitches++;
    this.aiming = false;
    this.jerkYaw = side * (0.05 + Math.random() * 0.04);
    this.jerkPitch = -(0.04 + Math.random() * 0.04);
    // part of the jerk stays: you have to find the target again
    g.player.yaw += this.jerkYaw * 0.35;
    g.player.pitch = clamp(g.player.pitch + this.jerkPitch * 0.35, -1.5, 1.5);
    this.fatigue = Math.max(0, this.fatigue - 30);
    g.shake = Math.max(g.shake, 0.3);
    g.audio.twitch();
    if (!this.warnedTwitch) {
      this.warnedTwitch = true;
      g.ui.msg('Рука сорвалась. Опусти оружие, дай рукам отдохнуть', 'bad');
    }
  }

  spreadNow() {
    const d = this.def;
    const p = this.game.player;
    let s = lerp(d.spread, d.adsSpread, this.aimT) + this.bloom + (this.fatigue / 100) * 0.012;
    if (p.speedNow > 1) s += 0.02 * Math.min(1, p.speedNow / 5);
    if (!p.grounded) s += 0.04;
    if (p.crouching) s *= 0.7;
    return s;
  }

  fire() {
    const g = this.game;
    const d = this.def;
    this.mags[this.current]--;
    this.cooldown = d.rate;
    this.shotsFired++;
    const origin = g.player.eyePos();
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(g.camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(g.camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(g.camera.quaternion);
    const spread = this.spreadNow();
    let anyHit = false;
    for (let i = 0; i < d.pellets; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * spread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      if (g.shoot(origin, dir, d, i === 0)) anyHit = true;
    }
    if (anyHit) this.shotsHit++;
    const tired = 1 + (this.fatigue / 100) * 0.6;
    this.recoilPitch += d.recoil * (this.aiming ? 0.6 : 1) * tired;
    this.tire(d.tire);
    g.player.pitch = clamp(g.player.pitch + d.recoil * 0.35, -1.5, 1.5);
    g.player.yaw += (Math.random() - 0.5) * d.recoil * 0.3;
    this.kick = 1;
    this.bloom = Math.min(0.05, this.bloom + (d.auto ? 0.006 : 0.004));
    this.flashT = 0.05;
    const m = this.models[this.current].userData.muzzle;
    this.flash.position.copy(m).add(this.models[this.current].position);
    this.flash.material.rotation = Math.random() * Math.PI;
    this.flash.scale.setScalar(d.pellets > 1 ? 0.32 : 0.2);
    g.audio.shot(this.current);
    g.noise(g.player.pos, d.noise);
  }

  swing() {
    const g = this.game;
    const d = this.def;
    this.cooldown = d.rate;
    this.swingT = 0.3;
    this.meleeT = 0.09; // the blade lands a moment after the swing starts
    this.tire(d.tire);
    g.audio.swing();
    g.noise(g.player.pos, 3);
  }

  pose(dt) {
    const g = this.game;
    const p = g.player;
    const m = this.models[this.current];
    const t = performance.now() / 1000;
    const hip = m.userData.hip;
    const ads = m.userData.ads || hip;
    const pos = hip.clone().lerp(ads, this.aimT);
    // bob & sway
    const moveAmt = Math.min(1, p.speedNow / 5) * (1 - this.aimT * 0.85);
    pos.x += Math.cos(p.bob) * 0.012 * moveAmt;
    pos.y += Math.abs(Math.sin(p.bob)) * 0.014 * moveAmt + Math.sin(t * 1.6) * 0.003;
    pos.z += this.kick * 0.06;
    // inertia and tired hands shaking the gun
    pos.x += this.lagX + this.swayYaw * 0.35;
    pos.y += this.lagY - this.swayPitch * 0.35;
    // lowered while sprinting, switching or reloading
    let lower = 0;
    if (p.sprinting) lower = 0.6;
    if (this.switchT > 0) lower = Math.sin((this.switchT / 0.3) * Math.PI);
    if (this.twitchT > 0) lower = Math.max(lower, Math.sin((this.twitchT / 0.65) * Math.PI) * 0.9);
    pos.y -= lower * 0.12;
    m.position.copy(pos);
    let rx = this.kick * 0.12 - lower * 0.5;
    let ry = p.sprinting ? 0.5 : 0;
    let rz = this.twitchT > 0 ? Math.sign(this.jerkYaw) * 0.4 * Math.sin((this.twitchT / 0.65) * Math.PI) : 0;
    if (this.reloading > 0) {
      const k = Math.sin((1 - this.reloading / this.reloadTotal) * Math.PI);
      rx -= k * 0.35;
      rz = k * 0.6;
      m.position.y -= k * 0.06;
    }
    if (this.swingT > 0) {
      const k = Math.sin((1 - this.swingT / 0.3) * Math.PI);
      rx -= k * 0.9;
      ry += k * 0.8;
      m.position.x -= k * 0.15;
      m.position.z -= k * 0.12;
    }
    m.rotation.set(rx, ry, rz);
    const fov = g.settings.fov;
    this.camera.fov = lerp(55, 42, this.aimT);
    this.camera.updateProjectionMatrix();
    g.camera.fov = lerp(fov, fov * 0.72, this.aimT);
    g.camera.updateProjectionMatrix();
  }

  syncLight(world) {
    this.ambient.intensity = Math.max(0.25, world.hemi.intensity);
    this.light.intensity = Math.max(0.2, world.sun.intensity * 0.6);
  }
}
