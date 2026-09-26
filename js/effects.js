// Short-lived visual effects: blood, sparks, tracers, muzzle light, the evac helicopter.
import * as THREE from 'three';

export class Effects {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.parts = [];
    this.tracers = [];
    this.decals = [];
    this.geo = new THREE.BoxGeometry(0.06, 0.06, 0.06);
    this.mBlood = new THREE.MeshBasicMaterial({ color: 0x6a0d0a });
    this.mSpark = new THREE.MeshBasicMaterial({ color: 0xffd27a });
    this.mDust = new THREE.MeshBasicMaterial({ color: 0x8a8272 });
    this.mTracer = new THREE.LineBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.7 });
    this.decalGeo = new THREE.CircleGeometry(0.35, 8).rotateX(-Math.PI / 2);
    this.mDecal = new THREE.MeshBasicMaterial({ color: 0x2e0605, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    this.light = new THREE.PointLight(0xffc070, 0, 14, 1.6);
    this.scene.add(this.light);
    this.heli = null;
  }

  reset() {
    for (const p of this.parts) this.scene.remove(p.mesh);
    for (const t of this.tracers) { this.scene.remove(t.line); t.line.geometry.dispose(); }
    for (const d of this.decals) this.scene.remove(d);
    this.parts.length = 0;
    this.tracers.length = 0;
    this.decals.length = 0;
    if (this.heli) { this.scene.remove(this.heli.group); this.heli = null; }
  }

  burst(pos, n, mat, speed, life, grav = 9) {
    for (let i = 0; i < n; i++) {
      if (this.parts.length > 220) break;
      const m = new THREE.Mesh(this.geo, mat);
      m.position.copy(pos);
      const s = 0.6 + Math.random() * 0.8;
      m.scale.setScalar(s);
      this.scene.add(m);
      this.parts.push({
        mesh: m, life: life * (0.6 + Math.random() * 0.6), grav,
        v: new THREE.Vector3((Math.random() - 0.5) * speed, Math.random() * speed * 0.8, (Math.random() - 0.5) * speed),
      });
    }
  }

  blood(pos, n = 8, drip = false) {
    this.burst(pos, n, this.mBlood, drip ? 0.6 : 3, 0.6);
    if (drip || Math.random() < 0.5) this.decal(pos.x, pos.z, pos.y);
  }

  decal(x, z, y = 0) {
    const d = new THREE.Mesh(this.decalGeo, this.mDecal);
    const g = this.game.world.groundAt({ x, z }, 0.1, y, 0.3);
    d.position.set(x + (Math.random() - 0.5) * 0.3, Math.max(g, 0.05) + 0.012, z + (Math.random() - 0.5) * 0.3);
    d.scale.setScalar(0.5 + Math.random() * 0.9);
    this.scene.add(d);
    this.decals.push(d);
    if (this.decals.length > 60) this.scene.remove(this.decals.shift());
  }

  spark(pos) {
    this.burst(pos, 5, this.mSpark, 4, 0.25);
    this.burst(pos, 3, this.mDust, 1.5, 0.5, 2);
  }

  tracer(from, to) {
    const g = new THREE.BufferGeometry().setFromPoints([from, to]);
    const line = new THREE.Line(g, this.mTracer);
    this.scene.add(line);
    this.tracers.push({ line, life: 0.05 });
  }

  muzzleLight(on) {
    if (on) {
      const p = this.game.player;
      const f = p.forward();
      this.light.position.set(p.pos.x + f.x * 1.2, p.eye + f.y * 1.2, p.pos.z + f.z * 1.2);
    }
    this.light.intensity = on ? 30 : 0;
  }

  // Evac helicopter: flies in from the edge of the map and lands on the pad.
  spawnHeli(pad) {
    const g = new THREE.Group();
    const olive = new THREE.MeshStandardMaterial({ color: 0x6b7a52, roughness: 0.7, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2c3033, roughness: 0.4, metalness: 0.2 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fc4d6, roughness: 0.15, metalness: 0.3 });
    const add = (geo, m, x, y, z) => { const mesh = new THREE.Mesh(geo, m); mesh.position.set(x, y, z); mesh.castShadow = true; g.add(mesh); return mesh; };
    add(new THREE.BoxGeometry(2.6, 2.4, 7), olive, 0, 1.6, 0);
    add(new THREE.BoxGeometry(2.3, 1.2, 1.4), glass, 0, 2.1, -3.8);
    add(new THREE.BoxGeometry(2.62, 0.9, 1.6), glass, 0, 2.1, -0.6);
    add(new THREE.BoxGeometry(2.64, 0.5, 7.02), dark, 0, 0.6, 0);
    add(new THREE.BoxGeometry(0.7, 0.8, 7), olive, 0, 2.2, 6.5);
    add(new THREE.BoxGeometry(0.2, 2, 1.1), olive, 0, 3.2, 9.8);
    add(new THREE.BoxGeometry(0.2, 0.2, 5), dark, -1.3, 0.2, 0);
    add(new THREE.BoxGeometry(0.2, 0.2, 5), dark, 1.3, 0.2, 0);
    const rotor = add(new THREE.BoxGeometry(15, 0.08, 0.5), dark, 0, 3.1, 0);
    const rotor2 = add(new THREE.BoxGeometry(0.5, 0.08, 15), dark, 0, 3.1, 0);
    const tail = add(new THREE.BoxGeometry(0.1, 2.4, 0.3), dark, 0.2, 3.2, 9.8);
    const light = new THREE.PointLight(0xff3020, 8, 20, 1.5);
    light.position.set(0, 0.3, 0);
    g.add(light);
    g.position.set(pad.x + 160, 60, pad.z - 160);
    this.scene.add(g);
    this.heli = { group: g, rotor, rotor2, tail, pad, t: 0, landed: false, sndT: 0 };
    return this.heli;
  }

  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      p.v.y -= p.grav * dt;
      p.mesh.position.addScaledVector(p.v, dt);
      if (p.mesh.position.y < 0.05) { p.mesh.position.y = 0.05; p.v.set(0, 0, 0); }
      if (p.life <= 0) { this.scene.remove(p.mesh); this.parts.splice(i, 1); }
    }
    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const t = this.tracers[i];
      t.life -= dt;
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); this.tracers.splice(i, 1); }
    }
    const h = this.heli;
    if (h) {
      h.t += dt;
      h.rotor.rotation.y += dt * 25;
      h.rotor2.rotation.y += dt * 25;
      h.tail.rotation.x += dt * 30;
      const target = new THREE.Vector3(h.pad.x, h.pad.y ?? 0.15, h.pad.z);
      const pos = h.group.position;
      if (!h.landed) {
        const toX = target.x - pos.x, toZ = target.z - pos.z;
        const horiz = Math.hypot(toX, toZ);
        if (horiz > 0.5) {
          const sp = Math.min(22, horiz * 0.6 + 2);
          pos.x += (toX / horiz) * sp * dt;
          pos.z += (toZ / horiz) * sp * dt;
          h.group.rotation.y = Math.atan2(-toX, -toZ);
          h.group.rotation.x = -0.12;
        } else h.group.rotation.x = 0;
        const wantY = horiz > 30 ? 45 : horiz > 2 ? 12 : target.y;
        pos.y += (wantY - pos.y) * Math.min(1, dt * (horiz > 2 ? 0.8 : 0.6));
        if (horiz < 1 && pos.y < target.y + 0.25) { pos.y = target.y; h.landed = true; }
      }
      h.sndT -= dt;
      if (h.sndT <= 0) {
        h.sndT = 0.11;
        const d = pos.distanceTo(this.game.player.pos);
        this.game.audio.helicopter(Math.max(0, 0.6 * (1 - d / 220)));
      }
    }
  }
}
