// Procedural sound effects with the Web Audio API — no audio files needed.

export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.volume = 0.7;
    this.noiseBuf = null;
    this.ambient = null;
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
      this.startAmbient();
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

  shot(kind) {
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

  swing() {
    this.noise(0.18, { gain: 0.35, type: 'bandpass', freq: 600, freqEnd: 2500, q: 2, attack: 0.04 });
  }

  empty() {
    this.tone(1800, 0.03, { gain: 0.2, type: 'square' });
  }

  reload(stage) {
    if (stage === 0) this.tone(700, 0.05, { gain: 0.25, type: 'square', freqEnd: 400 });
    else this.tone(1100, 0.05, { gain: 0.25, type: 'square', freqEnd: 900 });
    this.noise(0.06, { gain: 0.25, type: 'highpass', freq: 3000 });
  }

  step(soft) {
    this.noise(0.08, { gain: soft ? 0.08 : 0.18, freq: 500 + Math.random() * 300, freqEnd: 150 });
  }

  impact(flesh, pan = 0) {
    if (flesh) this.noise(0.12, { gain: 0.4, pan, freq: 900, freqEnd: 200 });
    else this.noise(0.07, { gain: 0.25, pan, type: 'highpass', freq: 2500 });
  }

  hurt() {
    this.tone(110, 0.25, { gain: 0.6, type: 'sawtooth', freqEnd: 60 });
    this.noise(0.15, { gain: 0.3, freq: 700 });
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
