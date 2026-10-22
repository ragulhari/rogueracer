// Simula corridas no Node para balancear. Uso: node tools/sim.mjs [dificuldade] [ritmo do robô] [posição de largada do robô]
import { CarPhysics, collideCars, slipstream } from '../src/physics.js';
import { aiInput, makeAi, aiPaceForLevel, aiStats } from '../src/ai.js';
import { buildStats } from '../src/driver.js';
import { mulberry32 } from '../src/rng.js';
import { trackForLevel } from '../src/track.js';
import { difficultyById } from '../src/difficulty.js';
import { GRID_SIZE, playerGridSlot } from '../src/grid.js';
const diff = difficultyById(process.argv[2] || 'normal');
const playerPace = +(process.argv[3] || 0.9);
const levels = process.argv[5] ? process.argv[5].split(',').map(Number) : [1, 2, 3, 4, 5, 6, 7, 8];
console.log('dificuldade', diff.name, '· piloto-robô com ritmo', playerPace, '·', GRID_SIZE, 'carros');

const dt = 1 / 120;
for (const level of levels) {
  const t0 = Date.now();
  const track = trackForLevel(level);
  const LAPS = track.laps || 3;
  const slot = process.argv[4] !== undefined ? +process.argv[4] : playerGridSlot(diff.id, 1);
  const rng = mulberry32(level);
  const cars = [];
  let g = 0;
  for (let i = 0; i < GRID_SIZE - 1; i++) {
    if (g === slot) g++;
    const p = aiPaceForLevel(level, i, 1, diff);
    const c = new CarPhysics(aiStats(() => buildStats(1), p), track.gridSlot(g++)); c.ai = makeAi(rng, p, diff.noise); cars.push(c);
  }
  const pl = new CarPhysics(buildStats(1), track.gridSlot(slot)); pl.ai = makeAi(rng, playerPace); pl.isPlayer = true; cars.push(pl);
  let time = 0, walls = 0, hits = 0;
  while (time < 500 && !cars.every((c) => c.finished)) {
    for (const c of cars) if (!c.finished) c.update(dt, aiInput(c, track, c.ai, dt, rng, cars), track, time, LAPS);
    slipstream(cars, dt);
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) { const h = collideCars(cars[i], cars[j]); if (h > 3) hits++; }
    if (pl.wallImpact > 3) walls++;
    time += dt;
  }
  const order = cars.slice().sort((a, b) => (a.finished ? a.finishTime : 1e9 - a.progress(track)) - (b.finished ? b.finishTime : 1e9 - b.progress(track)));
  const ft = (c) => (c.finished ? c.finishTime.toFixed(1) : 'DNF');
  console.log(`L${level} ${track.name} ${track.length.toFixed(0)}m ${LAPS}v largada P${slot + 1} → chegou P${order.indexOf(pl) + 1} em ${ft(pl)}s · líder IA ${ft(order.find((c) => c !== pl))}s · último ${ft(order[order.length - 1])}s · batidas fortes ${hits} · ${Date.now() - t0}ms`);
}
