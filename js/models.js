// Animated zombie models: Quaternius characters (CC0, see assets/models/CREDITS.md)
// re-coloured as the infected, with a hunched posture layered on top of the clips.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const BASE = 'assets/models/zombies/';
const MODELS = ['casual-man', 'hoodie-man', 'beach-man', 'casual-woman'];
const HEIGHT = 1.8; // metres, before the per-type scale

// Clip playback speed that matches the clip's stride to 1 m/s of ground speed.
const STRIDE = { walk: 1 / 1.5, run: 1 / 4.2 };

const SKIN = {
  walker: [0x8d9a7a, 0x7f8c70, 0x96a083],
  runner: [0xa08579, 0x94786d, 0xa89085],
  brute: [0x6d7864, 0x5f6a58, 0x74806a],
};

export async function loadZombieModels() {
  const loader = new GLTFLoader();
  const out = [];
  await Promise.all(MODELS.map(async (name) => {
    const gltf = await loader.loadAsync(BASE + name + '.glb');
    const scene = gltf.scene;
    const box = new THREE.Box3().setFromObject(scene);
    const h = box.max.y - box.min.y;
    out.push({
      name, scene, clips: gltf.animations,
      norm: HEIGHT / h, footY: box.min.y,
    });
  }));
  out.sort((a, b) => MODELS.indexOf(a.name) - MODELS.indexOf(b.name));
  return out;
}

const matCache = new Map();

// Infected versions of the original materials, shared by all zombies of the
// same model / type / variant so the renderer compiles few shaders.
function infectedMaterial(orig, model, type, variant) {
  const key = `${model}|${type}|${variant}|${orig.name}`;
  if (matCache.has(key)) return matCache.get(key);
  const n = (orig.name || '').toLowerCase();
  const m = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0 });
  if (n.startsWith('skin')) {
    m.color.setHex(SKIN[type][variant % 3]);
    if (n.includes('dark')) m.color.multiplyScalar(0.8);
    m.roughness = 0.75;
  } else if (n.startsWith('eye') && !n.includes('brow')) {
    m.color.setHex(0xd8d2a0);
    m.emissive.setHex(0xffd060);
    m.emissiveIntensity = 0.9;
  } else {
    // clothes and hair: faded, dirty, sometimes soaked in blood
    const c = orig.color ? orig.color.clone() : new THREE.Color(0x777777);
    const grey = (c.r + c.g + c.b) / 3;
    c.lerp(new THREE.Color(grey, grey, grey), 0.55).multiplyScalar(n.includes('hair') || n.includes('brow') ? 0.45 : 0.62);
    if (variant === 2 && !n.includes('hair')) c.lerp(new THREE.Color(0x3a0f0c), 0.35);
    c.lerp(new THREE.Color(0x3b3226), 0.15); // dirt
    m.color.copy(c);
  }
  matCache.set(key, m);
  return m;
}

const tmpQ = new THREE.Quaternion();
const tmpE = new THREE.Euler();

export class ZombieVisual {
  constructor(tpl, type, scale) {
    this.type = type;
    this.variant = (Math.random() * 3) | 0;
    this.group = new THREE.Group();
    this.root = cloneSkinned(tpl.scene);
    this.root.scale.setScalar(tpl.norm);
    this.root.position.y = -tpl.footY * tpl.norm;
    this.group.add(this.root);
    this.group.scale.setScalar(scale);
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = false;
      o.frustumCulled = false; // skinned bounds don't follow the animation
      o.material = Array.isArray(o.material)
        ? o.material.map((mm) => infectedMaterial(mm, tpl.name, type, this.variant))
        : infectedMaterial(o.material, tpl.name, type, this.variant);
    });
    this.mixer = new THREE.AnimationMixer(this.root);
    this.actions = {};
    for (const clip of tpl.clips) this.actions[clip.name] = this.mixer.clipAction(clip);
    for (const k of ['attack', 'attack2', 'hit', 'death']) {
      const a = this.actions[k];
      if (!a) continue;
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
    }
    // GLTFLoader strips dots from node names: "UpperArm.L" becomes "UpperArmL".
    const bone = (n) => this.root.getObjectByName(n);
    this.bones = {
      torso: bone('Torso'), neck: bone('Neck'), head: bone('Head'),
      armL: bone('UpperArmL'), armR: bone('UpperArmR'), foreL: bone('LowerArmL'), foreR: bone('LowerArmR'),
    };
    // Some clips don't key every posed bone; without a reset the additive
    // posture would accumulate frame after frame.
    this.rest = Object.values(this.bones).filter(Boolean).map((b) => [b, b.quaternion.clone()]);
    this.current = null;
    this.limp = 0.75 + Math.random() * 0.5; // how badly this one drags its feet
    this.t = Math.random() * 10;
    this.play('idle', 0);
  }

  play(name, fade = 0.25) {
    const next = this.actions[name] || (name === 'attack2' ? this.actions.attack : null);
    if (!next || next === this.current) return;
    next.reset().play();
    if (this.current) next.crossFadeFrom(this.current, fade, false);
    this.current = next;
    this.currentName = name;
  }

  // Picks the clip from the zombie's AI state and adds the infected posture.
  update(dt, z) {
    this.t += dt;
    for (const [b, q] of this.rest) b.quaternion.copy(q);
    if (z.dead) {
      this.play('death', 0.15);
      this.mixer.update(dt);
      return;
    }
    const sp = z.speedNow;
    if (z.windup > 0) this.play(this.swing || (this.swing = Math.random() < 0.5 ? 'attack' : 'attack2'), 0.12);
    else {
      this.swing = null;
      if (z.stagger > 0.1 && this.actions.hit) this.play('hit', 0.08);
      else if (this.currentName === 'hit' && this.current.isRunning()) { /* let the flinch finish */ }
      else if (sp > 3.2) this.play('run');
      else if (sp > 0.25) this.play('walk');
      else this.play('idle', 0.4);
    }
    if (this.currentName === 'walk') this.current.timeScale = Math.max(0.35, sp * STRIDE.walk) * (0.9 + 0.1 * Math.sin(this.t * 2.3));
    else if (this.currentName === 'run') this.current.timeScale = Math.max(0.6, sp * STRIDE.run);
    else if (this.current) this.current.timeScale = this.currentName === 'idle' ? 0.6 : 1;
    this.mixer.update(dt);
    this.pose(z);
  }

  // Additive rotations in each bone's local frame, applied after the clip.
  twist(bone, x, y, z) {
    if (!bone) return;
    tmpE.set(x, y, z);
    tmpQ.setFromEuler(tmpE);
    bone.quaternion.multiply(tmpQ);
  }

  pose(z) {
    const b = this.bones;
    const t = this.t;
    const attacking = z.windup > 0;
    const hunt = z.state === 'chase' ? 1 : z.state === 'alert' ? 0.7 : 0.35;
    const moving = this.currentName === 'walk' || this.currentName === 'run';
    // hunched spine, head lolling to one side
    this.twist(b.torso, POSE.lean * (0.6 + 0.4 * hunt), 0, Math.sin(t * 1.3) * 0.05 * this.limp);
    this.twist(b.neck, POSE.neck, 0, 0);
    this.twist(b.head, Math.sin(t * 0.7) * 0.08, Math.sin(t * 0.5) * 0.15, POSE.headTilt * this.limp + Math.sin(t * 0.9) * 0.1);
    if (!attacking && moving) {
      // arms reaching for the prey
      // on this rig local Z swings the arm forward (mirrored per side), local X spreads it sideways
      const r = POSE.reach * hunt;
      this.twist(b.armL, POSE.armOut, 0, -(r + Math.sin(t * 2.1) * 0.08));
      this.twist(b.armR, POSE.armOut, 0, r * 0.9 + Math.sin(t * 2.4 + 1) * 0.08);
      this.twist(b.foreL, 0, 0, -POSE.elbow * hunt);
      this.twist(b.foreR, 0, 0, POSE.elbow * hunt);
    }
  }
}

// Posture offsets (radians), tuned against screenshots of the rig.
export const POSE = { lean: 0.35, neck: 0.15, headTilt: 0.25, reach: 1.2, armOut: 0, elbow: 0.25 };
