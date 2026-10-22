// Pilotos adversários: seguem a linha central com um deslocamento, freiam antes das curvas.

// Ritmo dos adversários diminui um pouco a cada derrota na mesma pista (até −4%).
export function attemptEase(attempt) {
  return Math.min(0.04, (attempt - 1) * 0.01);
}

export function aiPaceForLevel(level, slot, attempt = 1, diff = null) {
  // slot 0 é o adversário mais forte da corrida
  const base = 0.8 + Math.min(level - 1, 12) * 0.028 + Math.max(0, level - 13) * 0.008;
  const ease = attemptEase(attempt) * (diff ? diff.ease : 1);
  // os três primeiros ficam próximos; o resto do grid vai ficando um pouco mais lento
  const spread = slot <= 2 ? slot * 0.035 : 0.07 + (slot - 2) * 0.012;
  return base + (diff ? diff.ai : 0) - spread - ease;
}

export function makeAi(rng, pace, noiseMul = 1) {
  return {
    pace,
    noiseMul,
    lane: (rng() - 0.5) * 0.8,
    laneTarget: 0,
    laneTimer: 0,
    noise: 0,
    noiseTimer: 0,
  };
}

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function aiInput(car, track, ai, dt, rng, cars = null) {
  const speed = car.speed;
  ai.laneTimer -= dt;
  if (ai.laneTimer <= 0) {
    ai.laneTimer = 2 + rng() * 3;
    ai.laneTarget = (rng() - 0.5) * 0.9;
  }
  ai.lane += (ai.laneTarget - ai.lane) * Math.min(1, dt * 0.8);
  ai.noiseTimer -= dt;
  if (ai.noiseTimer <= 0) {
    ai.noiseTimer = 0.4 + rng() * 0.8;
    ai.noise = (rng() - 0.5) * Math.max(0.05, 1.2 - ai.pace) * 0.6 * ai.noiseMul;
  }

  const look = 7 + speed * 0.42;
  const ti = track.wrap(car.idx + Math.round(look / track.ds));
  // Corta por dentro da curva que vem a seguir
  const c = track.curvature[track.wrap(ti + 5)];
  const inside = Math.max(-0.5, Math.min(0.5, c * 25));
  let off = (ai.lane + inside) * track.halfWidth;
  // desvia de óleo e mira nas placas de turbo
  for (const p of track.pads || []) {
    let ahead = p.idx - car.idx;
    if (ahead < 0) ahead += track.N;
    const dist = ahead * track.ds;
    if (dist < 8 || dist > 55) continue;
    if (p.kind === 'oil' && car.s.oilEffect > 0.5 && Math.abs(off - p.lat) < p.w / 2 + 2.5) {
      off = p.lat + Math.sign(off - p.lat || 1) * (p.w / 2 + 3);
    } else if (p.kind === 'boost' && ai.pace > 0.9) {
      off = p.lat;
    }
  }
  // tráfego: procura o carro mais próximo à frente na mesma faixa e tenta passar pelo lado com mais espaço
  const lim = track.halfWidth * 0.85;
  let follow = Infinity;
  if (cars) {
    let block = null, blockDist = Infinity;
    const reach = 8 + speed * 0.55;
    for (const o of cars) {
      if (o === car || o.finished) continue;
      let ahead = o.idx - car.idx;
      if (ahead < -track.N / 2) ahead += track.N;
      if (ahead > track.N / 2) ahead -= track.N;
      const dist = ahead * track.ds;
      if (dist <= 0.5 || dist > reach) continue;
      if (Math.abs(o.lat - car.lat) > 3.4) continue;
      if (speed - o.speed < -1.5) continue; // ele está se afastando
      if (dist < blockDist) { blockDist = dist; block = o; }
    }
    if (block) {
      if (!ai.passSide || ai.passTimer <= 0) {
        const roomL = block.lat + lim, roomR = lim - block.lat; // espaço de cada lado do carro da frente
        ai.passSide = roomR > roomL ? 1 : -1;
        if (Math.abs(roomR - roomL) < 2) ai.passSide = car.lat >= block.lat ? 1 : -1;
      }
      ai.passTimer = 1.2;
      const want = block.lat + ai.passSide * 4.2;
      if (Math.abs(want) <= lim) off = want;
      else if (blockDist < 6 + speed * 0.3) follow = block.speed - 0.5; // sem espaço: espera atrás
      else off = block.lat - ai.passSide * 4.2;
    } else ai.passTimer = (ai.passTimer || 0) - dt;
    // carro lado a lado: abre um pouco para não bater de lado
    for (const o of cars) {
      if (o === car || o.finished) continue;
      let ahead = o.idx - car.idx;
      if (ahead < -track.N / 2) ahead += track.N;
      if (ahead > track.N / 2) ahead -= track.N;
      const side = car.lat - o.lat;
      if (Math.abs(ahead * track.ds) < 5 && Math.abs(side) < 3.6) off = car.lat + Math.sign(side || 1) * 4;
    }
  }
  off = Math.max(-lim, Math.min(lim, off));
  const tx = track.px[ti] + track.nx[ti] * off;
  const ty = track.py[ti] + track.ny[ti] * off;
  const desired = Math.atan2(tx - car.x, ty - car.y);
  const diff = wrapAngle(desired - car.h);
  const steer = Math.max(-1, Math.min(1, -diff * 2.4 + ai.noise));

  const s = car.s;
  const tireF = 0.55 + 0.45 * car.tire;
  const gripEst = 27 * s.grip * tireF * (1 + s.downforce * 0.6) * 0.82;
  const kAhead = track.maxCurvAhead(car.idx, 12 + speed * 1.5);
  const safe = kAhead > 1e-4 ? Math.sqrt(gripEst / kAhead) * (0.75 + 0.3 * ai.pace) : 999;
  const target = Math.min(safe, s.topSpeed * 1.2, follow);
  return {
    throttle: speed < target ? 1 : 0,
    brake: speed > target + 2.5 ? 1 : 0,
    steer,
  };
}

export function aiStats(baseStatsFn, pace) {
  const s = baseStatsFn();
  s.topSpeed *= pace;
  s.power *= 0.85 + 0.2 * pace;
  s.grip *= 0.9 + 0.12 * pace;
  return s;
}
