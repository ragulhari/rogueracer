// Física arcade 2D do carro. Mundo em metros: (x, y) do mapa vira (x, z) no Three.js.
// Direção: frente = (sin h, cos h). Virar à direita diminui h.

export const CAR_RADIUS = 1.9;

export class CarPhysics {
  constructor(stats, spawn) {
    this.s = stats;
    this.x = spawn.x;
    this.y = spawn.y;
    this.h = spawn.heading;
    this.vx = 0;
    this.vy = 0;
    this.yawRate = 0;
    this.steerSmooth = 0;
    this.idx = spawn.idx;
    this.lat = 0;
    this.lap = 0;
    this.passedHalf = true;
    this.finished = false;
    this.finishTime = 0;
    this.tire = 1;
    this.nitro = stats.nitroCharges;
    this.nitroTime = 0;
    this.boostTime = 0; // placa de turbo
    this.oilTime = 0; // mancha de óleo
    this.padEvent = null; // 'boost' | 'oil' no quadro em que entrou numa placa
    this.draft = 0; // 0..1, força do vácuo atrás de outro carro
    this.draftMeter = 0;
    this.slide = 0;
    this.onGrass = false;
    this.wallImpact = 0;
    this.lapClean = true;
    this.cleanLaps = 0;
    this.grassTime = 0;
    this.lapTimes = [];
    this.lapStart = 0;
  }

  get speed() { return Math.hypot(this.vx, this.vy); }
  get forwardSpeed() { return this.vx * Math.sin(this.h) + this.vy * Math.cos(this.h); }

  progress(track) { return this.lap * track.N + this.idx; }

  fireNitro() {
    if (this.nitro > 0 && this.nitroTime <= 0) {
      this.nitro--;
      this.nitroTime = 2.5;
      return true;
    }
    return false;
  }

  // inp: { throttle, brake, steer (-1 esquerda..1 direita) }
  update(dt, inp, track, time, laps) {
    const s = this.s;
    let fx = Math.sin(this.h), fy = Math.cos(this.h);
    let rx = -fy, ry = fx;
    let vf = this.vx * fx + this.vy * fy;
    let vl = this.vx * rx + this.vy * ry;
    const speed = Math.hypot(vf, vl);

    const massF = 1000 / s.mass;
    const nitroOn = this.nitroTime > 0 || this.boostTime > 0;
    if (this.nitroTime > 0) this.nitroTime -= dt;
    if (this.boostTime > 0) this.boostTime -= dt;
    const oily = this.oilTime > 0;
    if (oily) this.oilTime -= dt;
    // vácuo: menos arrasto, um pouco mais de velocidade final e de aceleração
    const tow = this.draft * s.draftPower;
    let top = s.topSpeed * (nitroOn ? 1.18 : 1) * (1 + 0.05 * tow);
    const accel = 13 * s.power * massF * (nitroOn ? 1.7 : 1) * (1 + 0.12 * tow);
    const tireF = 0.55 + 0.45 * this.tire;
    let grip = 27 * s.grip * tireF * (1 + s.downforce * Math.min(1, speed / s.topSpeed));
    let drag = 0.12 * (1 - 0.35 * Math.min(1, tow));

    if (this.onGrass) {
      top *= Math.min(0.85, 0.45 * s.offroad);
      grip *= 0.72;
      drag += 0.6 / s.offroad;
    }

    // Longitudinal
    const throttle = inp.throttle || 0, brake = inp.brake || 0;
    this.throttle = throttle; // usado pelo som do motor
    if (throttle > 0 && vf > -1) {
      vf += accel * throttle * dt * Math.max(0, 1 - (vf / top) ** 2);
    }
    if (brake > 0) {
      if (vf > 0.5) vf = Math.max(0, vf - 30 * s.brake * Math.sqrt(massF) * brake * dt);
      else if (throttle === 0) vf = Math.max(-10, vf - 7 * brake * dt);
    }
    if (throttle > 0 && vf < -0.5) vf = Math.min(0, vf + 25 * dt);
    vf -= vf * drag * dt;
    if (vf > top) vf -= (vf - top) * 1.5 * dt;
    if (!throttle && !brake) vf -= Math.sign(vf) * Math.min(Math.abs(vf), 2.5 * dt);

    if (oily) grip *= 1 - 0.75 * s.oilEffect;

    // Direção (suavizada: teclado é digital)
    const steerTarget = inp.steer || 0;
    const steerSpeed = 7 * (0.8 + 0.2 * s.steer);
    this.steerSmooth += Math.max(-steerSpeed * dt, Math.min(steerSpeed * dt, steerTarget - this.steerSmooth));
    const rate = (2.7 * s.steer) / (1 + speed / 32);
    const lowSpeed = Math.min(1, Math.abs(vf) / 5);
    let targetYaw = -this.steerSmooth * rate * lowSpeed * Math.sign(vf || 1);
    if (oily) targetYaw *= 1 - 0.5 * s.oilEffect;
    this.yawRate += (targetYaw - this.yawRate) * Math.min(1, 12 * dt);
    this.h += this.yawRate * dt;

    // Recompõe a velocidade no referencial novo e aplica aderência lateral
    let vx = fx * vf + rx * vl, vy = fy * vf + ry * vl;
    fx = Math.sin(this.h); fy = Math.cos(this.h);
    rx = -fy; ry = fx;
    vf = vx * fx + vy * fy;
    vl = vx * rx + vy * ry;
    const maxDv = grip * dt * (1 + (s.stability || 0) * 0.25);
    if (Math.abs(vl) <= maxDv) {
      vl = 0;
      this.slide = 0;
    } else {
      vf -= Math.abs(maxDv) * 0.08 * Math.sign(vf);
      vl -= Math.sign(vl) * maxDv;
      this.slide = Math.abs(vl);
    }
    this.vx = fx * vf + rx * vl;
    this.vy = fy * vf + ry * vl;

    // Desgaste dos pneus
    this.tire = Math.max(0, this.tire - dt * (speed * 0.00004 + this.slide * 0.0005) * s.wear);

    // Recarga de nitro no vácuo (bônus)
    if (s.draftCharge && this.draft > 0.25) {
      this.draftMeter += dt * this.draft / 3.5;
      if (this.draftMeter >= 1) {
        this.draftMeter = 0;
        if (this.nitro < 3) this.nitro++;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Pista, grama e muretas
    const prevIdx = this.idx;
    const p = track.project(this.x, this.y, this.idx);
    this.idx = p.idx;
    this.lat = p.lat;
    this.onGrass = Math.abs(p.lat) > track.halfWidth + 0.4;
    if (this.onGrass) this.grassTime += dt;
    this.padEvent = null;
    const pad = track.padAt(p.idx, p.lat);
    if (pad && pad !== this.lastPad) {
      this.padEvent = pad.kind;
      if (pad.kind === 'boost') this.boostTime = 1.3 * s.padBoost;
      else if (s.oilEffect > 0) this.oilTime = 0.9;
    }
    this.lastPad = pad;
    this.wallImpact = 0;
    const limit = track.wallOffset - 1.1;
    if (Math.abs(p.lat) > limit) {
      const sg = Math.sign(p.lat);
      const nx = track.nx[p.idx] * sg, ny = track.ny[p.idx] * sg;
      const pen = Math.abs(p.lat) - limit;
      this.x -= nx * pen;
      this.y -= ny * pen;
      const vn = this.vx * nx + this.vy * ny;
      if (vn > 0) {
        this.vx -= nx * vn * 1.35;
        this.vy -= ny * vn * 1.35;
        const loss = Math.min(0.5, 0.014 * vn * s.wallLoss);
        this.vx *= 1 - loss;
        this.vy *= 1 - loss;
        this.yawRate *= 0.5;
        this.wallImpact = vn;
        if (vn > 3) this.lapClean = false;
      }
    }

    // Voltas
    const N = track.N;
    if (this.idx > N * 0.4 && this.idx < N * 0.6) this.passedHalf = true;
    if (prevIdx > N * 0.8 && this.idx < N * 0.2) {
      if (this.passedHalf) {
        if (this.lap >= 1) {
          this.lapTimes.push(time - this.lapStart);
          if (this.lapClean && this.grassTime < 0.6) this.cleanLaps++;
        }
        this.lap++;
        this.lapStart = time;
        this.lapClean = true;
        this.grassTime = 0;
        this.passedHalf = false;
        if (this.lap > laps && !this.finished) {
          this.finished = true;
          this.finishTime = time;
        }
      }
    } else if (prevIdx < N * 0.2 && this.idx > N * 0.8) {
      // cruzou a linha de ré
      this.lap--;
      this.passedHalf = true;
    }
  }

  resetToTrack(track) {
    const i = track.wrap(this.idx - 3);
    this.x = track.px[i];
    this.y = track.py[i];
    this.h = Math.atan2(track.tx[i], track.ty[i]);
    this.vx = this.vy = this.yawRate = 0;
    this.idx = i;
  }
}

// Empurra dois carros para fora um do outro e troca parte do momento.
// Vácuo: o carro logo atrás e alinhado com outro ganha força de reboque (0..1), suavizada.
export function slipstream(cars, dt) {
  for (const a of cars) {
    const fx = Math.sin(a.h), fy = Math.cos(a.h);
    const range = 26 * a.s.draftRange;
    let best = 0;
    if (a.speed > 18 && !a.finished) {
      for (const b of cars) {
        if (b === a) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const along = dx * fx + dy * fy;
        if (along < 4 || along > range) continue;
        const side = Math.abs(dx * fy - dy * fx);
        const width = 2.2 + along * 0.06; // o cone de ar turbulento abre com a distância
        if (side > width) continue;
        best = Math.max(best, (1 - along / range) ** 0.6 * (1 - side / width) ** 0.5);
      }
    }
    a.draft += (best - a.draft) * Math.min(1, (best > a.draft ? 3 : 2) * dt);
  }
}

export function collideCars(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d2 = dx * dx + dy * dy;
  const min = CAR_RADIUS * 2;
  if (d2 >= min * min || d2 === 0) return 0;
  const d = Math.sqrt(d2);
  const nx = dx / d, ny = dy / d;
  const pen = (min - d) / 2;
  const ma = a.s.mass, mb = b.s.mass;
  const wa = mb / (ma + mb), wb = ma / (ma + mb);
  a.x -= nx * pen * 2 * wa; a.y -= ny * pen * 2 * wa;
  b.x += nx * pen * 2 * wb; b.y += ny * pen * 2 * wb;
  const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rv < 0) {
    const j = -rv * 0.8;
    a.vx -= nx * j * wa; a.vy -= ny * j * wa;
    b.vx += nx * j * wb; b.vy += ny * j * wb;
  }
  return -rv;
}
