// First-person controller and survival stats.
import * as THREE from 'three';
import { clamp, lerp } from './util.js';

const RADIUS = 0.35;
const STAND_H = 1.75;
const CROUCH_H = 1.1;
const GRAVITY = 20;

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.world = game.world;
    this.flashlight = new THREE.SpotLight(0xfff1d6, 0, 38, 0.42, 0.45, 1.2);
    this.flashlight.castShadow = false;
    this.camera.add(this.flashlight);
    this.flashlight.position.set(0.25, -0.2, 0);
    this.flashlight.target.position.set(0.1, -0.1, -5);
    this.camera.add(this.flashlight.target);
    this.reset();
  }

  reset() {
    this.pos = new THREE.Vector3(2, 0, 22);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.height = STAND_H;
    this.crouching = false;
    this.grounded = true;
    this.hp = 100;
    this.stamina = 100;
    this.hunger = 100;
    this.thirst = 100;
    this.bleeding = false;
    this.bleedTimer = 0;
    this.regenDelay = 0;
    this.healOverTime = 0;
    this.energyTime = 0;
    this.exhausted = false;
    this.battery = 100;
    this.lightOn = false;
    this.bob = 0;
    this.stepAcc = 0;
    this.speedNow = 0;
    this.sprinting = false;
    this.landKick = 0;
    this.dead = false;
    this.distance = 0;
    this.flashlight.intensity = 0;
  }

  get eye() {
    return this.pos.y + this.height - 0.12;
  }

  eyePos(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.eye, this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
  }

  look(dx, dy, sens, invert) {
    const k = 0.0022 * sens * (this.game.weapons.aiming ? 0.6 : 1);
    this.yaw -= dx * k;
    this.pitch -= dy * k * (invert ? -1 : 1);
    this.pitch = clamp(this.pitch, -1.5, 1.5);
  }

  toggleLight() {
    if (!this.lightOn && this.battery <= 0) {
      this.game.ui.msg('Батарейка села — найди новую', 'bad');
      return;
    }
    this.lightOn = !this.lightOn;
    this.game.audio.click();
  }

  // quiet: slow damage (hunger, thirst, bleeding) without the hit sound and red flash.
  damage(amount, fromPos, quiet = false) {
    if (this.dead || this.game.god) return;
    this.hp -= amount;
    this.regenDelay = 6;
    if (!quiet) {
      this.game.audio.hurt();
      this.game.ui.hurt(Math.min(1, amount / 30));
    }
    if (fromPos) this.game.shake = Math.max(this.game.shake, 0.25);
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.game.onDeath(fromPos ? 'Тебя загрызли.' : this.bleeding ? 'Ты истёк кровью.' : 'Ты умер от истощения.');
    }
  }

  update(dt, input) {
    const g = this.game;
    const diff = g.diff;
    // --- look via arrow keys (works without pointer lock) ---
    const turn = (input.down('ArrowLeft') ? 1 : 0) - (input.down('ArrowRight') ? 1 : 0);
    const tilt = (input.down('ArrowUp') ? 1 : 0) - (input.down('ArrowDown') ? 1 : 0);
    this.yaw += turn * 2.2 * dt;
    this.pitch = clamp(this.pitch + tilt * 1.6 * dt, -1.5, 1.5);

    // --- crouch ---
    const wantCrouch = input.down('KeyC') || input.down('ControlLeft');
    if (wantCrouch) this.crouching = true;
    else if (this.crouching) {
      // Stand up only if there is room above.
      const probe = this.world.query(this.pos.x - RADIUS, this.pos.z - RADIUS, this.pos.x + RADIUS, this.pos.z + RADIUS, []);
      const blocked = probe.some((c) => c.minY > this.pos.y + CROUCH_H - 0.05 && c.minY < this.pos.y + STAND_H &&
        this.pos.x > c.minX - RADIUS && this.pos.x < c.maxX + RADIUS && this.pos.z > c.minZ - RADIUS && this.pos.z < c.maxZ + RADIUS);
      if (!blocked) this.crouching = false;
    }
    this.height = lerp(this.height, this.crouching ? CROUCH_H : STAND_H, Math.min(1, dt * 12));

    // --- movement input ---
    const fx = (input.down('KeyW') ? 1 : 0) - (input.down('KeyS') ? 1 : 0);
    const sx = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const moving = fx !== 0 || sx !== 0;
    const wantSprint = input.down('ShiftLeft') || input.down('ShiftRight');
    const canSprint = !this.exhausted && fx > 0 && !this.crouching && !g.weapons.aiming;
    this.sprinting = wantSprint && canSprint && moving;

    let speed = 4.3;
    if (this.sprinting) speed = 7.2;
    if (this.crouching) speed = 2.1;
    if (g.weapons.aiming) speed = Math.min(speed, 2.8);
    if (this.hp < 25) speed *= 0.85;
    if (this.hunger <= 0 || this.thirst <= 0) speed *= 0.85;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let wx = -sin * fx + cos * sx;
    let wz = -cos * fx - sin * sx;
    const len = Math.hypot(wx, wz);
    if (len > 0) { wx /= len; wz /= len; }
    const accel = this.grounded ? 14 : 2.5;
    this.vel.x = lerp(this.vel.x, wx * speed, Math.min(1, accel * dt));
    this.vel.z = lerp(this.vel.z, wz * speed, Math.min(1, accel * dt));

    // --- jump ---
    if (input.pressed('Space') && this.grounded && !this.crouching && this.stamina >= 8) {
      this.vel.y = 6.8;
      this.grounded = false;
      this.stamina -= 8;
    }

    // --- integrate & collide ---
    this.vel.y -= GRAVITY * dt;
    const ox = this.pos.x, oz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.world.collide(this.pos, RADIUS, this.pos.y, this.height);
    // zombies are solid too
    g.zombies.pushOut(this.pos, RADIUS);
    this.world.collide(this.pos, RADIUS, this.pos.y, this.height);

    this.pos.y += this.vel.y * dt;
    const ground = this.world.groundAt(this.pos, RADIUS, this.pos.y);
    if (this.pos.y <= ground) {
      if (!this.grounded && this.vel.y < -9) this.landKick = Math.min(0.12, -this.vel.y * 0.008);
      if (!this.grounded && this.vel.y < -14) this.damage(Math.round((-this.vel.y - 14) * 6), null);
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    } else if (this.pos.y > ground + 0.05) {
      this.grounded = false;
    } else if (this.vel.y <= 0) {
      // Walking down a small step: stick to the ground.
      this.pos.y = ground;
      this.vel.y = 0;
      this.grounded = true;
    }

    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    this.distance += moved;
    this.speedNow = moved / Math.max(dt, 1e-4);

    // --- footsteps & noise ---
    if (this.grounded && this.speedNow > 0.8) {
      this.bob += dt * this.speedNow * 1.9;
      this.stepAcc += moved;
      const stride = this.sprinting ? 2.4 : 1.8;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        g.audio.step(this.crouching);
        if (this.sprinting) g.noise(this.pos, 14);
        else if (!this.crouching) g.noise(this.pos, 5);
      }
    }

    // --- stamina ---
    if (this.sprinting && this.energyTime <= 0) this.stamina -= 17 * dt;
    else this.stamina += (this.grounded ? 14 : 4) * dt * (this.hunger > 20 ? 1 : 0.5);
    if (this.energyTime > 0) this.energyTime -= dt;
    this.stamina = clamp(this.stamina, 0, 100);
    if (this.stamina <= 0) this.exhausted = true;
    if (this.exhausted && this.stamina > 30) this.exhausted = false;

    // --- hunger / thirst ---
    const drain = this.sprinting ? 1.8 : 1;
    this.hunger = clamp(this.hunger - dt * 0.2 * drain * diff.drain, 0, 100);
    this.thirst = clamp(this.thirst - dt * 0.28 * drain * diff.drain, 0, 100);
    if (this.hunger <= 0) this.damage(dt * 0.6, null, true);
    if (this.thirst <= 0) this.damage(dt * 0.8, null, true);

    // --- bleeding ---
    if (this.bleeding) {
      this.bleedTimer += dt;
      if (this.bleedTimer > 1) {
        this.bleedTimer = 0;
        this.damage(1.2, null, true);
        g.ui.hurt(0);
        g.effects.blood(new THREE.Vector3(this.pos.x, this.pos.y + 0.05, this.pos.z), 2, true);
      }
    }

    // --- regen & heal over time ---
    if (this.healOverTime > 0) {
      const h = Math.min(this.healOverTime, 5 * dt);
      this.hp = Math.min(100, this.hp + h);
      this.healOverTime -= h;
    }
    this.regenDelay -= dt;
    if (!this.bleeding && this.regenDelay <= 0 && this.hunger > 50 && this.thirst > 50 && this.hp < 100) {
      this.hp = Math.min(100, this.hp + 0.6 * dt);
    }

    // --- flashlight ---
    if (this.lightOn) {
      this.battery -= dt * 0.55;
      if (this.battery <= 0) {
        this.battery = 0;
        this.lightOn = false;
        g.ui.msg('Фонарик разрядился', 'bad');
      }
    }
    const flicker = this.lightOn && this.battery < 15 && Math.random() < 0.08 ? 0.2 : 1;
    this.flashlight.intensity = this.lightOn ? 38 * flicker : 0;

    this.applyCamera(dt);
  }

  applyCamera(dt) {
    const cam = this.camera;
    const g = this.game;
    this.landKick = Math.max(0, this.landKick - dt * 0.6);
    const bobAmt = this.grounded ? Math.min(1, this.speedNow / 5) : 0;
    const bobY = Math.sin(this.bob * 2) * 0.045 * bobAmt;
    const bobX = Math.cos(this.bob) * 0.03 * bobAmt;
    let sx = 0, sy = 0;
    if (g.shake > 0) {
      sx = (Math.random() - 0.5) * g.shake * 0.15;
      sy = (Math.random() - 0.5) * g.shake * 0.15;
      g.shake = Math.max(0, g.shake - dt * 1.2);
    }
    cam.position.set(this.pos.x + bobX * Math.cos(this.yaw), this.eye + bobY - this.landKick, this.pos.z - bobX * Math.sin(this.yaw));
    cam.rotation.set(this.pitch + g.weapons.recoilPitch + sy, this.yaw + sx, 0, 'YXZ');
  }
}
