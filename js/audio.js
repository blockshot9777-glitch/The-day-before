// Sound: recorded CC0 samples (assets/audio, see CREDITS.md) played through a
// 3D HRTF panner and a small reverb, plus procedural synthesis for ambience,
// UI and anything that has no recording. Until the samples finish loading
// every effect falls back to its synthesized version.

const SURFACE_STEP = { grass: 'step_grass', hard: 'step_hard', wood: 'step_wood', gravel: 'step_gravel', leaves: 'step_leaves', mud: 'step_mud' };

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.noiseBuf = null;
    this.ambient = null;
    this.buffers = new Map(); // clip name -> AudioBuffer
    this.groups = new Map(); // "pistol_shot" -> [buffers of pistol_shot_1, _2...]
    this.loaded = false;
    this.played = []; // recent clip names (read by tests)
    this.base = 'assets/audio/';
  }

  // Must be called from a user gesture (browsers block audio before that).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.makeReverb();
      this.startAmbient();
      this.load();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get ok() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // ---------- samples ----------
  async load() {
    try {
      const names = await (await fetch(this.base + 'manifest.json')).json();
      await Promise.all(names.map(async (n) => {
        try {
          const data = await (await fetch(`${this.base}${n}.mp3`)).arrayBuffer();
          const buf = await this.ctx.decodeAudioData(data);
          this.buffers.set(n, buf);
          const group = n.replace(/_\d+$/, '');
          if (!this.groups.has(group)) this.groups.set(group, []);
          this.groups.get(group).push(buf);
        } catch {
          /* one missing clip falls back to synthesis */
        }
      }));
      this.loaded = true;
    } catch {
      /* no samples (offline file://): synthesis only */
    }
  }

  // Short outdoor-ish reverb from a decaying noise impulse.
  makeReverb() {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * 1.6);
    const ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        // sparse early reflections, then a smooth tail
        const early = i < c.sampleRate * 0.08 && Math.random() < 0.02 ? 1 : 0;
        d[i] = ((Math.random() * 2 - 1) * 0.6 + early) * Math.pow(1 - t, 3.2);
      }
    }
    this.reverb = c.createConvolver();
    this.reverb.buffer = ir;
    this.reverbIn = c.createGain();
    this.reverbIn.gain.value = 0.35;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    this.reverbIn.connect(lp);
    lp.connect(this.reverb);
    this.reverb.connect(this.master);
  }

  // Keeps the Web Audio listener on the camera so panners are relative to it.
  updateListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.position;
    const e = cam.matrixWorld.elements;
    // forward = -Z column, up = Y column of the camera matrix
    const f = [-e[8], -e[9], -e[10]], u = [e[4], e[5], e[6]];
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t); l.positionY.setValueAtTime(p.y, t); l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(f[0], t); l.forwardY.setValueAtTime(f[1], t); l.forwardZ.setValueAtTime(f[2], t);
      l.upX.setValueAtTime(u[0], t); l.upY.setValueAtTime(u[1], t); l.upZ.setValueAtTime(u[2], t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(f[0], f[1], f[2], u[0], u[1], u[2]);
    }
  }

  has(group) {
    return this.groups.has(group) || this.buffers.has(group);
  }

  // Plays a clip or a random variant of a group.
  // opts: gain, rate (pitch), jitter (random pitch spread), pos {x,y,z} for 3D, reverb (send), delay
  play(group, { gain = 1, rate = 1, jitter = 0.04, pos = null, reverb = 0, delay = 0, ref = 3, lowpass = 0 } = {}) {
    if (!this.ok) return false;
    const list = this.groups.get(group) || (this.buffers.has(group) ? [this.buffers.get(group)] : null);
    if (!list) return false;
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = list[(Math.random() * list.length) | 0];
    src.playbackRate.value = rate * (1 + (Math.random() * 2 - 1) * jitter);
    let node = src;
    if (lowpass) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lowpass;
      node.connect(f);
      node = f;
    }
    const g = c.createGain();
    g.gain.value = gain;
    node.connect(g);
    let out = g;
    if (pos) {
      const pan = c.createPanner();
      pan.panningModel = 'HRTF';
      pan.distanceModel = 'inverse';
      pan.refDistance = ref;
      pan.rolloffFactor = 1.1;
      pan.maxDistance = 400;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
      g.connect(pan);
      out = pan;
    }
    out.connect(this.master);
    if (reverb && this.reverbIn) {
      const send = c.createGain();
      send.gain.value = reverb;
      out.connect(send);
      send.connect(this.reverbIn);
    }
    src.start(c.currentTime + delay);
    this.played.push(group);
    if (this.played.length > 40) this.played.shift();
    return true;
  }

  // Output node with gain and stereo pan.
  out(gain = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = gain;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      p.connect(this.master);
    } else {
      g.connect(this.master);
    }
    return g;
  }

  noise(dur, { gain = 1, pan = 0, type = 'lowpass', freq = 1200, freqEnd = null, q = 0.8, attack = 0.002 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    f.Q.value = q;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(env);
    env.connect(this.out(gain, pan));
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  tone(freq, dur, { gain = 0.3, pan = 0, type = 'sine', freqEnd = null, delay = 0 } = {}) {
    if (!this.ok) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(env);
    env.connect(this.out(gain, pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // Gunshot: close recording + delayed distant layer as a slap-back echo.
  shot(kind) {
    if (this.play(`${kind}_shot`, { gain: 0.9, jitter: 0.03, reverb: 0.5 })) {
      this.play(`${kind}_shot_far`, { gain: 0.28, jitter: 0.05, delay: 0.09 + Math.random() * 0.05, lowpass: 2500 });
      if (kind === 'shotgun') this.play('shotgun_pump', { gain: 0.7, delay: 0.42 });
      return;
    }
    if (kind === 'pistol') {
      this.noise(0.25, { gain: 0.9, freq: 3000, freqEnd: 300 });
      this.tone(160, 0.12, { gain: 0.5, type: 'triangle', freqEnd: 50 });
    } else if (kind === 'shotgun') {
      this.noise(0.55, { gain: 1.2, freq: 1800, freqEnd: 120 });
      this.tone(90, 0.3, { gain: 0.8, type: 'sine', freqEnd: 35 });
    } else if (kind === 'rifle') {
      this.noise(0.2, { gain: 0.8, freq: 4200, freqEnd: 400 });
      this.tone(120, 0.1, { gain: 0.5, type: 'square', freqEnd: 40 });
    }
  }

  // Weapon mechanics: 'mag_out', 'mag_in', 'slide', 'bolt', 'shell', 'pump'.
  mech(kind, part) {
    const names = { slide: kind === 'rifle' ? 'rifle_bolt' : 'pistol_slide', bolt: 'rifle_bolt' };
    const name = names[part] || `${kind}_${part}`;
    if (this.play(name, { gain: 0.7, jitter: 0.03 })) return;
    this.reload(part === 'mag_out' || part === 'shell' ? 0 : 1);
  }

  swing() {
    this.noise(0.18, { gain: 0.35, type: 'bandpass', freq: 600, freqEnd: 2500, q: 2, attack: 0.04 });
  }

  empty(kind = 'pistol') {
    if (this.play(`${kind}_dry`, { gain: 0.8 })) return;
    this.tone(1800, 0.03, { gain: 0.2, type: 'square' });
  }

  reload(stage) {
    if (stage === 0) this.tone(700, 0.05, { gain: 0.25, type: 'square', freqEnd: 400 });
    else this.tone(1100, 0.05, { gain: 0.25, type: 'square', freqEnd: 900 });
    this.noise(0.06, { gain: 0.25, type: 'highpass', freq: 3000 });
  }

  step(soft, surface = 'grass') {
    const gain = (soft ? 0.25 : 0.55) * (surface === 'leaves' || surface === 'mud' ? 0.55 : 1);
    if (this.play(SURFACE_STEP[surface] || 'step_grass', { gain, jitter: 0.08 })) return;
    this.noise(0.08, { gain: soft ? 0.08 : 0.18, freq: 500 + Math.random() * 300, freqEnd: 150 });
  }

  // What a bullet hit: 'flesh', 'metal', 'wood' or anything else (stone/plaster).
  impact(what, pos = null) {
    const flesh = what === true || what === 'flesh';
    const group = flesh ? 'hit_flesh' : what === 'metal' ? 'hit_metal' : what === 'wood' ? 'hit_wood' : what === 'knife' ? 'knife_hit' : 'hit_wall';
    if (this.play(group, { gain: flesh ? 0.8 : 0.6, pos, ref: 4 })) return;
    const pan = 0;
    if (flesh) this.noise(0.12, { gain: 0.4, pan, freq: 900, freqEnd: 200 });
    else this.noise(0.07, { gain: 0.25, pan, type: 'highpass', freq: 2500 });
  }

  hurt() {
    this.play('player_hurt', { gain: 0.8 });
    this.tone(110, 0.25, { gain: 0.6, type: 'sawtooth', freqEnd: 60 });
    this.noise(0.15, { gain: 0.3, freq: 700 });
  }

  // Zombie vocal at a world position: 'groan', 'alert', 'attack', 'death'.
  zombie(kind, pos, pitch = 1) {
    if (this.play(`zombie_${kind}`, { gain: kind === 'groan' ? 0.9 : 1.1, rate: pitch, jitter: 0.07, pos, ref: 2.5, reverb: 0.15 })) return;
    this.groan(0, 0, pitch);
  }

  groan(dist, pan, pitch = 1) {
    if (!this.ok) return;
    const gain = Math.max(0, 0.45 * (1 - dist / 35));
    if (gain < 0.02) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    const base = (70 + Math.random() * 40) * pitch;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.4, t + 0.3);
    o.frequency.linearRampToValueAtTime(base * 0.8, t + 1.0);
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 7 + Math.random() * 5;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 12;
    lfo.connect(lfoG);
    lfoG.connect(o.frequency);
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(1, t + 0.15);
    env.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    o.connect(f);
    f.connect(env);
    env.connect(this.out(gain, pan));
    o.start(t);
    lfo.start(t);
    o.stop(t + 1.2);
    lfo.stop(t + 1.2);
  }

  // Hand gives out: cloth rustle, gear rattle and a short grunt.
  twitch() {
    this.noise(0.22, { gain: 0.35, type: 'bandpass', freq: 900, freqEnd: 300, q: 1.2, attack: 0.01 });
    this.noise(0.08, { gain: 0.25, type: 'highpass', freq: 3500 });
    this.tone(150, 0.18, { gain: 0.25, type: 'sawtooth', freqEnd: 95 });
  }

  pickup() {
    this.tone(660, 0.08, { gain: 0.2, type: 'triangle' });
    this.tone(990, 0.1, { gain: 0.2, type: 'triangle', delay: 0.07 });
  }

  use() {
    this.noise(0.25, { gain: 0.25, type: 'bandpass', freq: 1500, q: 1.5, attack: 0.05 });
  }

  click() {
    this.tone(1200, 0.03, { gain: 0.15, type: 'square' });
  }

  heartbeat() {
    this.tone(60, 0.12, { gain: 0.5, type: 'sine', freqEnd: 40 });
    this.tone(55, 0.12, { gain: 0.4, type: 'sine', freqEnd: 38, delay: 0.18 });
  }

  radio() {
    this.noise(1.2, { gain: 0.3, type: 'bandpass', freq: 1800, q: 3 });
    this.tone(880, 0.15, { gain: 0.15, type: 'square', delay: 0.3 });
    this.tone(880, 0.15, { gain: 0.15, type: 'square', delay: 0.6 });
  }

  helicopter(gain) {
    this.noise(0.12, { gain, freq: 220, freqEnd: 90, attack: 0.01 });
  }

  startAmbient() {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    const g = this.ctx.createGain();
    g.gain.value = 0.05;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoG = this.ctx.createGain();
    lfoG.gain.value = 0.035;
    lfo.connect(lfoG);
    lfoG.connect(g.gain);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start();
    lfo.start();
    this.ambient = g;
  }
}
