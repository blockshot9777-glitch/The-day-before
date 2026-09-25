// Zombies: models, perception (sight + hearing), steering, attacks, spawning.
import * as THREE from 'three';
import { lerp, rayAABB, angleDiff, pick, weighted } from './util.js';
import { rollLoot } from './items.js';
import { HALF } from './world.js';
import { ZombieVisual } from './models.js';

const TYPES = {
  walker: { hp: 70, speed: [1.2, 1.8], chase: [2.4, 3.1], dmg: 12, scale: 1, bleed: 0.3, skin: 0x7d8a6e, score: 1 },
  runner: { hp: 45, speed: [1.6, 2.2], chase: [4.9, 5.6], dmg: 9, scale: 0.95, bleed: 0.35, skin: 0x8f7466, score: 2 },
  brute: { hp: 340, speed: [1.1, 1.4], chase: [2.3, 2.6], dmg: 28, scale: 1.35, bleed: 0.5, skin: 0x5f6b58, score: 4 },
};
const R = 0.38;

const GEO = {
  leg: new THREE.BoxGeometry(0.2, 0.85, 0.24).translate(0, -0.42, 0),
  torso: new THREE.BoxGeometry(0.55, 0.7, 0.3).translate(0, 0.35, 0),
  head: new THREE.BoxGeometry(0.3, 0.32, 0.3).translate(0, 0.16, 0),
  arm: new THREE.BoxGeometry(0.15, 0.72, 0.16).translate(0, -0.34, 0),
  eye: new THREE.BoxGeometry(0.06, 0.035, 0.02),
};

export class Zombies {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.scene.add(this.group);
    const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...o });
    this.mats = {
      skin: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, m(t.skin)])),
      shirts: [0x5a4f45, 0x3f4a5a, 0x6a3a32, 0x7a7466, 0x2f3a2f, 0x8a6e4a].map((c) => m(c)),
      pants: [0x2b2d33, 0x3b3328, 0x40443a].map((c) => m(c)),
      eye: new THREE.MeshBasicMaterial({ color: 0xffd84a }),
    };
    this.spawnT = 0;
    this.groanT = 2;
    this.killed = 0;
    this.hordeTarget = 0;
    this._v = new THREE.Vector3();
  }

  reset() {
    for (const z of this.list) this.group.remove(z.mesh);
    this.list.length = 0;
    this.killed = 0;
    this.spawnT = 0;
    this.hordeTarget = 0;
  }

  makeMesh(type) {
    const t = TYPES[type];
    const g = new THREE.Group();
    const skin = this.mats.skin[type];
    const shirt = pick(this.mats.shirts);
    const pants = pick(this.mats.pants);
    const mk = (geo, mat, x, y, z) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      return mesh;
    };
    const legL = mk(GEO.leg, pants, -0.14, 0.88, 0);
    const legR = mk(GEO.leg, pants, 0.14, 0.88, 0);
    const torso = mk(GEO.torso, shirt, 0, 0.88, 0);
    torso.rotation.x = -0.18;
    const head = mk(GEO.head, skin, 0, 0.7, 0.02);
    torso.add(head);
    const armL = mk(GEO.arm, skin, -0.36, 0.62, 0);
    const armR = mk(GEO.arm, skin, 0.36, 0.62, 0);
    torso.add(armL, armR);
    const eyeL = new THREE.Mesh(GEO.eye, this.mats.eye);
    eyeL.position.set(-0.07, 0.18, -0.155);
    const eyeR = eyeL.clone();
    eyeR.position.x = 0.07;
    head.add(eyeL, eyeR);
    g.add(legL, legR, torso);
    g.scale.setScalar(t.scale);
    g.rotation.order = 'YXZ';
    g.userData = { legL, legR, torso, head, armL, armR };
    return g;
  }

  spawn(type, x, z, state = 'idle') {
    const t = TYPES[type];
    const diff = this.game.diff;
    // animated character if the models loaded, blocky fallback otherwise
    const models = this.game.assets && this.game.assets.zombies;
    let visual = null;
    if (models && models.length) {
      // brutes are the bulky men, runners any build
      const pool = type === 'brute' ? models.filter((m) => m.name !== 'casual-woman') : models;
      visual = new ZombieVisual(pick(pool), type, t.scale);
    }
    const mesh = visual ? visual.group : this.makeMesh(type);
    // stand on the ground (or a floor) right away, not at y = 0 under the hills
    const w = this.game.world;
    mesh.position.set(x, w.groundAt({ x, z }, R, w.ground(x, z), 0.45), z);
    this.group.add(mesh);
    const zb = {
      type, t, mesh, pos: mesh.position, hp: t.hp * diff.zHp, maxHp: t.hp * diff.zHp,
      yaw: Math.random() * Math.PI * 2, state, target: new THREE.Vector3(x, 0, z),
      walk: lerp(t.speed[0], t.speed[1], Math.random()), run: lerp(t.chase[0], t.chase[1], Math.random()),
      phase: Math.random() * 10, senseT: Math.random() * 0.3, attackT: 0, windup: 0, stagger: 0,
      memory: 0, wanderT: 0, stuckT: 0, detourT: 0, detourDir: 1, dead: false, deadT: 0, speedNow: 0,
      scale: t.scale, visual,
    };
    if (state === 'chase') { zb.memory = 20; zb.target.copy(this.game.player.pos); }
    this.list.push(zb);
    return zb;
  }

  // Voice position and pitch: brutes are deeper, runners shriller.
  mouth(z) {
    return { x: z.pos.x, y: z.pos.y + 1.65 * z.scale, z: z.pos.z };
  }

  pitch(z) {
    return (z.type === 'brute' ? 0.72 : z.type === 'runner' ? 1.18 : 1) * (z.voice || (z.voice = 0.92 + Math.random() * 0.16));
  }

  alive() {
    return this.list.filter((z) => !z.dead);
  }

  // Loud events pull zombies within the radius toward the source.
  noise(pos, radius) {
    for (const z of this.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - pos.x, z.pos.z - pos.z);
      if (d > radius) continue;
      if (z.state !== 'chase') {
        z.state = 'alert';
        z.target.set(pos.x + (Math.random() - 0.5) * 6, 0, pos.z + (Math.random() - 0.5) * 6);
        z.memory = 12;
      }
    }
  }

  // Ray hit test against body and head boxes. Returns nearest hit or null.
  raycast(o, d, maxT) {
    let best = null;
    for (const z of this.list) {
      if (z.dead) continue;
      const s = z.scale, p = z.pos;
      const body = { minX: p.x - 0.3 * s, maxX: p.x + 0.3 * s, minY: p.y, maxY: p.y + 1.58 * s, minZ: p.z - 0.3 * s, maxZ: p.z + 0.3 * s };
      const hy = p.y + 1.58 * s;
      const head = { minX: p.x - 0.19 * s, maxX: p.x + 0.19 * s, minY: hy, maxY: hy + 0.36 * s, minZ: p.z - 0.19 * s, maxZ: p.z + 0.19 * s };
      const th = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, head, maxT);
      const tb = rayAABB(o.x, o.y, o.z, d.x, d.y, d.z, body, maxT);
      const t = Math.min(th, tb);
      if (t < maxT && (!best || t < best.t)) best = { z, t, head: th <= tb };
    }
    return best;
  }

  hit(z, dmg, head, dir) {
    const g = this.game;
    z.hp -= dmg;
    z.stagger = head ? 0.35 : 0.18;
    z.pos.x += dir.x * (head ? 0.15 : 0.08) * (z.type === 'brute' ? 0.3 : 1);
    z.pos.z += dir.z * (head ? 0.15 : 0.08) * (z.type === 'brute' ? 0.3 : 1);
    if (z.state !== 'chase') {
      z.state = 'chase';
      z.target.copy(g.player.pos);
    }
    z.memory = 15;
    if (z.hp <= 0) this.kill(z, dir);
  }

  kill(z, dir) {
    this.game.audio.zombie('death', this.mouth(z), this.pitch(z));
    const g = this.game;
    z.dead = true;
    z.deadT = 0;
    z.baseY = z.pos.y;
    z.fallDir = Math.atan2(dir.x, dir.z);
    this.killed++;
    g.stats.kills++;
    g.stats.score += z.t.score * 10;
    if (Math.random() < 0.4 * g.diff.loot) {
      for (const it of rollLoot('zombie', 1)) g.world.addPickup(it.id, it.qty, z.pos.x + (Math.random() - 0.5), 0.1, z.pos.z + (Math.random() - 0.5));
    }
  }

  // Keeps a circle (the player) out of zombie bodies.
  pushOut(pos, r) {
    for (const z of this.list) {
      if (z.dead) continue;
      const dx = pos.x - z.pos.x, dz = pos.z - z.pos.z;
      const min = r + R * z.scale;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.6;
        pos.x += (dx / d) * push;
        pos.z += (dz / d) * push;
        z.pos.x -= (dx / d) * (min - d) * 0.4;
        z.pos.z -= (dz / d) * (min - d) * 0.4;
      }
    }
  }

  targetCount() {
    const g = this.game;
    const night = 1 - g.dayF;
    let n = g.diff.zCount * (1 + night * 0.6) + Math.min(3, g.day);
    return Math.round(n + this.hordeTarget);
  }

  trySpawn(forceChase = false) {
    const g = this.game;
    const p = g.player.pos;
    const fwd = g.player.forward();
    for (let i = 0; i < 20; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = forceChase ? 26 + Math.random() * 18 : 35 + Math.random() * 35;
      const x = p.x + Math.cos(a) * dist, z = p.z + Math.sin(a) * dist;
      if (Math.abs(x) > HALF - 3 || Math.abs(z) > HALF - 3) continue;
      if (!g.world.isFree(x, z, 0.8)) continue;
      // avoid spawning right in view
      const dot = ((x - p.x) * fwd.x + (z - p.z) * fwd.z) / dist;
      if (dot > 0.5 && g.world.lineOfSight({ x, y: 1.6, z }, g.player.eyePos())) continue;
      const night = 1 - g.dayF;
      const type = weighted([['walker', 10], ['runner', 1 + night * 5 + (forceChase ? 4 : 0)], ['brute', 0.6 + g.day * 0.3]]);
      this.spawn(type, x, z, forceChase ? 'chase' : 'idle');
      return true;
    }
    return false;
  }

  update(dt) {
    const g = this.game;
    const player = g.player;
    const ppos = player.pos;
    const world = g.world;

    // spawner
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = 0.8;
      const alive = this.list.filter((z) => !z.dead).length;
      if (alive < this.targetCount()) this.trySpawn(this.hordeTarget > 0);
    }

    // occasional groan from the nearest zombie
    this.groanT -= dt;
    if (this.groanT <= 0) {
      this.groanT = 2.5 + Math.random() * 4;
      let near = null, nd = 40;
      for (const z of this.list) {
        if (z.dead) continue;
        const d = z.pos.distanceTo(ppos);
        if (d < nd && Math.random() < 0.6) { nd = d; near = z; }
      }
      if (near) g.audio.zombie('groan', this.mouth(near), this.pitch(near));
    }

    const eye = player.eyePos(this._v);
    const night = 1 - g.dayF;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const z = this.list[i];
      if (z.dead) { this.animateDeath(z, dt, i); continue; }
      const dx = ppos.x - z.pos.x, dz = ppos.z - z.pos.z;
      const dist = Math.hypot(dx, dz);

      // despawn far idle ones
      if (dist > 95 && z.state !== 'chase') {
        this.group.remove(z.mesh);
        this.list.splice(i, 1);
        continue;
      }

      // --- perception ---
      z.senseT -= dt;
      if (z.senseT <= 0) {
        z.senseT = 0.25 + Math.random() * 0.1;
        let range = lerp(34, 18, night);
        if (player.crouching) range *= 0.6;
        if (player.lightOn) range *= 1 + night * 0.9;
        if (player.sprinting) range *= 1.15;
        const facing = Math.abs(angleDiff(Math.atan2(dx, dz), z.yaw)) < 1.2;
        // Sensing someone behind depends on how loud they are: sneak up crouched for a knife kill.
        const feel = player.crouching ? 1.0 : player.sprinting ? 7 : player.speedNow > 1 ? 2.5 : 1.6;
        let sees = false;
        if (!player.dead && dist < range && (facing || dist < feel || z.state === 'chase')) {
          const head = { x: z.pos.x, y: z.pos.y + 1.7 * z.scale, z: z.pos.z };
          sees = world.lineOfSight(head, eye);
        }
        if (sees) {
          if (z.state !== 'chase' && Math.random() < 0.7) g.audio.zombie('alert', this.mouth(z), this.pitch(z));
          z.state = 'chase';
          z.target.copy(ppos);
          z.memory = 8;
        }
      }
      if (z.state === 'chase' || z.state === 'alert') {
        z.memory -= dt;
        if (z.memory <= 0) z.state = 'idle';
      }
      // hordes always know where you are
      if (z.state === 'chase' && this.hordeTarget > 0) z.target.copy(ppos);

      // --- choose where to go ---
      let tx, tz, speed;
      if (z.state === 'chase' || z.state === 'alert') {
        tx = z.target.x; tz = z.target.z;
        speed = z.state === 'chase' ? z.run : z.walk * 1.3;
        const tdist = Math.hypot(tx - z.pos.x, tz - z.pos.z);
        if (z.state === 'alert' && tdist < 1.5) { z.state = 'idle'; z.wanderT = 0; }
        if (z.state === 'chase' && tdist < 1 && dist > 2) z.target.copy(ppos); // reached last known spot, keep sniffing
      } else {
        z.wanderT -= dt;
        if (z.wanderT <= 0) {
          z.wanderT = 3 + Math.random() * 6;
          z.target.set(z.pos.x + (Math.random() - 0.5) * 16, 0, z.pos.z + (Math.random() - 0.5) * 16);
          z.idleStop = Math.random() < 0.35;
        }
        tx = z.target.x; tz = z.target.z;
        speed = z.idleStop ? 0 : z.walk * 0.6;
        if (Math.hypot(tx - z.pos.x, tz - z.pos.z) < 0.8) speed = 0;
      }

      // --- attack ---
      const reachY = Math.abs(ppos.y - z.pos.y) < 2.2;
      const attackRange = 1.25 * z.scale + 0.35;
      if (z.state === 'chase' && dist < attackRange + 0.25 && reachY && !player.dead) {
        speed = 0;
        if (z.windup <= 0 && z.attackT <= 0) {
          z.windup = 0.45;
          if (Math.random() < 0.6) g.audio.zombie('attack', this.mouth(z), this.pitch(z));
        }
      }
      if (z.windup > 0) {
        z.windup -= dt;
        speed *= 0.2;
        if (z.windup <= 0) {
          z.attackT = z.type === 'brute' ? 1.6 : 1.1;
          if (dist < attackRange + 0.4 && reachY && !player.dead) {
            player.damage(z.t.dmg * g.diff.zDmg, z.pos);
            if (Math.random() < z.t.bleed && !player.bleeding) {
              player.bleeding = true;
              g.ui.msg('Кровотечение! Нужен бинт — H', 'bad');
            }
            if (z.type === 'brute') {
              player.vel.x += (dx / (dist || 1)) * 7;
              player.vel.z += (dz / (dist || 1)) * 7;
              player.vel.y = 3;
            }
          }
        }
      }
      z.attackT -= dt;
      if (z.stagger > 0) { z.stagger -= dt; speed *= 0.25; }

      // --- steering with a simple detour when blocked ---
      let ddx = tx - z.pos.x, ddz = tz - z.pos.z;
      const dl = Math.hypot(ddx, ddz) || 1;
      ddx /= dl; ddz /= dl;
      if (z.detourT > 0) {
        z.detourT -= dt;
        const sx = -ddz * z.detourDir, sz = ddx * z.detourDir;
        ddx = ddx * 0.3 + sx; ddz = ddz * 0.3 + sz;
        const l2 = Math.hypot(ddx, ddz) || 1;
        ddx /= l2; ddz /= l2;
      }
      const ox = z.pos.x, oz = z.pos.z;
      if (speed > 0) {
        z.pos.x += ddx * speed * dt;
        z.pos.z += ddz * speed * dt;
      }
      // separation from other zombies
      for (let j = 0; j < this.list.length; j++) {
        const o = this.list[j];
        if (o === z || o.dead) continue;
        const sx = z.pos.x - o.pos.x, sz = z.pos.z - o.pos.z;
        const min = R * (z.scale + o.scale);
        const d2 = sx * sx + sz * sz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          z.pos.x += (sx / d) * (min - d) * 0.5;
          z.pos.z += (sz / d) * (min - d) * 0.5;
        }
      }
      world.collide(z.pos, R * z.scale, 0, 1.8 * z.scale, 0.3);
      z.pos.y = world.groundAt(z.pos, R * z.scale, z.pos.y, 0.3);

      const moved = Math.hypot(z.pos.x - ox, z.pos.z - oz);
      z.speedNow = lerp(z.speedNow, moved / Math.max(dt, 1e-4), Math.min(1, dt * 8));
      if (speed > 0.5 && moved < speed * dt * 0.35 && z.stagger <= 0) {
        z.stuckT += dt;
        if (z.stuckT > 0.35 && z.detourT <= 0) {
          z.detourT = 0.8 + Math.random() * 1.2;
          z.detourDir = Math.random() < 0.5 ? -1 : 1;
          z.stuckT = 0;
        }
      } else z.stuckT = Math.max(0, z.stuckT - dt);

      // --- face & animate ---
      const faceX = z.state === 'chase' && dist < 3 ? dx : ddx;
      const faceZ = z.state === 'chase' && dist < 3 ? dz : ddz;
      if (speed > 0 || z.state === 'chase') {
        const want = Math.atan2(faceX, faceZ);
        z.yaw += angleDiff(want, z.yaw) * Math.min(1, dt * 8);
      }
      // the animated models face +Z, the blocky fallback faces -Z
      z.mesh.rotation.y = z.yaw + (z.visual ? 0 : Math.PI);
      this.animate(z, dt);
    }
  }

  animate(z, dt) {
    if (z.visual) {
      z.visual.update(dt, z);
      return;
    }
    const u = z.mesh.userData;
    z.phase += dt * (1.5 + z.speedNow * 1.9);
    const s = Math.sin(z.phase);
    const amp = Math.min(0.7, z.speedNow * 0.2);
    u.legL.rotation.x = s * amp;
    u.legR.rotation.x = -s * amp;
    const reach = z.state === 'chase' || z.state === 'alert' ? 1 : 0.4;
    let armX = (Math.PI / 2) * reach + Math.sin(z.phase * 0.5) * 0.12;
    if (z.windup > 0) armX = Math.PI * 0.85 - (1 - z.windup / 0.45) * 1.4;
    u.armL.rotation.x = armX + s * 0.1;
    u.armR.rotation.x = armX - s * 0.1;
    u.torso.rotation.x = -0.18 - (z.state === 'chase' ? 0.15 : 0) + (z.stagger > 0 ? 0.35 : 0);
    u.torso.rotation.z = Math.sin(z.phase * 0.5) * 0.08;
    u.head.rotation.z = Math.sin(z.phase * 0.3) * 0.2;
  }

  animateDeath(z, dt, i) {
    z.deadT += dt;
    if (z.visual) z.visual.update(dt, z);
    else {
      const k = Math.min(1, z.deadT / 0.55);
      z.mesh.rotation.x = -k * k * Math.PI / 2 * 0.95;
    }
    z.mesh.position.y = z.baseY - (z.deadT > 20 ? (z.deadT - 20) * 0.3 : 0);
    if (z.deadT > 26) {
      this.group.remove(z.mesh);
      this.list.splice(i, 1);
    }
  }
}
