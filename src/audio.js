// Som do motor sintetizado com WebAudio (sem arquivos externos).
export const VOLUME_LEVELS = [0, 0.35, 0.7, 1];
export const VOLUME_NAMES = ['Desligado', 'Baixo', 'Médio', 'Alto'];

// Relações de marcha: limite superior de cada marcha como fração da velocidade máxima.
const GEAR_TOP = [0.15, 0.28, 0.41, 0.54, 0.67, 0.8, 0.92, 1.4];
const IDLE_RPM = 3800, SHIFT_RPM = 11800, DROP_RPM = 8200;

export class Engine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.volume = 0.7;
    this.rpm = IDLE_RPM;
    this.gear = 1;
    this.lastThrottle = 0;
  }

  // Motor sintetizado como um motor de combustão:
  // - onda periódica com vários harmônicos na frequência de explosões (sobe com a rotação)
  // - sub-harmônico para o ronco e uma cópia levemente desafinada para o batimento
  // - ruído de combustão pulsando na mesma frequência
  // - saturação leve, filtro que abre com o acelerador, assobio do turbo e estalos no escapamento ao soltar
  unlock() {
    if (this.ctx) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      comp.connect(ctx.destination);
      const master = ctx.createGain();
      master.gain.value = 0;
      master.connect(comp);
      this.out = comp;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = 1.2;
      filter.frequency.value = 900;
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(1024);
      for (let i = 0; i < curve.length; i++) {
        const x = (i / (curve.length - 1)) * 2 - 1;
        curve[i] = Math.tanh(x * 2.2) / Math.tanh(2.2);
      }
      shaper.curve = curve;
      const mix = ctx.createGain();
      mix.gain.value = 0.5;
      mix.connect(shaper).connect(filter).connect(master);

      // harmônicos fixos dão o "timbre" do motor
      const n = 28, re = new Float32Array(n + 1), im = new Float32Array(n + 1);
      for (let k = 1; k <= n; k++) {
        const bump = [1, 0.55, 0.9, 0.35, 0.6, 0.3, 0.45, 0.2][(k - 1) % 8];
        im[k] = (bump / Math.pow(k, 0.75)) * (k % 2 ? 1 : 0.7);
      }
      const wave = ctx.createPeriodicWave(re, im);
      const osc = (gain, type) => {
        const o = ctx.createOscillator();
        if (type) o.type = type; else o.setPeriodicWave(wave);
        const gn = ctx.createGain();
        gn.gain.value = gain;
        o.connect(gn).connect(mix);
        o.start();
        return o;
      };
      const main = osc(0.55);
      const detune = osc(0.25);
      const sub = osc(0.4, 'triangle');

      // ruído de combustão modulado na frequência das explosões
      const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = noiseBuf;
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;
      noise.loop = true;
      const nBand = ctx.createBiquadFilter();
      nBand.type = 'bandpass';
      nBand.frequency.value = 1400;
      nBand.Q.value = 0.7;
      const nGain = ctx.createGain();
      nGain.gain.value = 0;
      const pulse = ctx.createOscillator();
      pulse.type = 'square';
      const pulseDepth = ctx.createGain();
      pulseDepth.gain.value = 0.12;
      pulse.connect(pulseDepth).connect(nGain.gain);
      noise.connect(nBand).connect(nGain).connect(mix);
      noise.start();
      pulse.start();

      // assobio do turbo
      const turbo = ctx.createOscillator();
      turbo.type = 'sine';
      const turboGain = ctx.createGain();
      turboGain.gain.value = 0;
      turbo.connect(turboGain).connect(master);
      turbo.start();

      Object.assign(this, { ctx, master, filter, main, detune, sub, nGain, nBand, pulse, turbo, turboGain });
    } catch (e) {
      this.ctx = null;
    }
  }

  toggle() { this.muted = !this.muted; }
  setVolume(v) { this.volume = v; }
  get level() { return this.muted ? 0 : this.volume; }

  update(car, dt = 1 / 60) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = car ? this.level : 0;
    const sp = car ? Math.max(0, car.forwardSpeed) / car.s.topSpeed : 0;
    const throttle = car ? car.throttle || 0 : 0;

    // marcha e rotação a partir da velocidade (com troca para baixo atrasada, como câmbio de verdade)
    let gear = this.gear;
    while (gear < GEAR_TOP.length && sp > GEAR_TOP[gear - 1]) gear++;
    while (gear > 1 && sp < GEAR_TOP[gear - 2] * 0.92) gear--;
    const shifted = gear !== this.gear;
    this.gear = gear;
    const lo = gear === 1 ? 0 : GEAR_TOP[gear - 2], hi = GEAR_TOP[gear - 1];
    const frac = Math.max(0, Math.min(1.05, (sp - lo) / (hi - lo)));
    let target = (gear === 1 ? IDLE_RPM : DROP_RPM) + frac * (SHIFT_RPM - (gear === 1 ? IDLE_RPM : DROP_RPM));
    if (throttle > 0 && sp < 0.05) target = IDLE_RPM + 2500; // acelerando parado
    this.rpm += (target - this.rpm) * Math.min(1, dt * (shifted ? 30 : 10));

    const f = (this.rpm / 60) * 1.5; // frequência das explosões
    this.main.frequency.setTargetAtTime(f, t, 0.02);
    this.detune.frequency.setTargetAtTime(f * 1.006, t, 0.02);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.02);
    this.pulse.frequency.setTargetAtTime(f, t, 0.02);
    this.nBand.frequency.setTargetAtTime(900 + this.rpm * 0.12, t, 0.05);
    this.turbo.frequency.setTargetAtTime(1800 + this.rpm * 0.25, t, 0.1);

    const load = 0.35 + 0.65 * throttle;
    this.filter.frequency.setTargetAtTime(600 + load * 1800 + (this.rpm / SHIFT_RPM) * 1400, t, 0.05);
    this.nGain.gain.setTargetAtTime(0.06 + 0.1 * throttle, t, 0.05);
    this.turboGain.gain.setTargetAtTime(on * throttle * (this.rpm / SHIFT_RPM) * 0.012, t, 0.15);
    // corte rápido na troca de marcha
    const vol = on * (0.16 + 0.16 * load) * (shifted && gear > this.prevGearForCut ? 0.35 : 1);
    this.master.gain.setTargetAtTime(vol, t, shifted ? 0.01 : 0.06);
    this.prevGearForCut = gear;

    // estalos no escapamento ao tirar o pé em alta rotação
    if (car && this.lastThrottle > 0 && throttle === 0 && this.rpm > 7500 && on) {
      for (let k = 0; k < 4; k++) this.pop(t + 0.05 + Math.random() * 0.45);
    }
    this.lastThrottle = throttle;
  }

  pop(at) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 700;
    const gn = this.ctx.createGain();
    gn.gain.setValueAtTime(0.0001, at);
    gn.gain.exponentialRampToValueAtTime(0.25 * this.level, at + 0.005);
    gn.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    src.connect(f).connect(gn).connect(this.out);
    src.start(at, Math.random());
    src.stop(at + 0.08);
  }

  // bipe curto (largada, turbo)
  beep(freq, dur = 0.15, type = 'triangle', vol = 0.08, slideTo = 0) {
    if (!this.ctx || !this.level) return;
    vol *= this.level;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const gn = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(gn).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // batida: ruído filtrado, volume pela força do impacto
  thud(strength) {
    if (!this.ctx || !this.level) return;
    const t = this.ctx.currentTime;
    const len = 0.25;
    const buf = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * len), this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500 + strength * 40;
    const gn = this.ctx.createGain();
    gn.gain.value = Math.min(0.4, 0.04 + strength * 0.015) * this.level;
    src.connect(f).connect(gn).connect(this.ctx.destination);
    src.start(t);
  }
}
