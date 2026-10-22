// Geração procedural de pistas. Puro JS (sem Three.js) para poder testar a física no Node.
import { mulberry32 } from './rng.js';

export const THEMES = [
  { name: 'Vale Verde', ground: 0x4f8a3c, shoulder: 0x6aa04f, road: 0x3a3d42, wall: 0xd8d8d8, tree: 0x2f6b2a, sky: 0x9fd1ff },
  { name: 'Dunas Douradas', ground: 0xd9b26f, shoulder: 0xe6c88f, road: 0x55504a, wall: 0xb5523b, tree: 0x8a9a3a, sky: 0xf5d6a0 },
  { name: 'Pico Nevado', ground: 0xe8eef5, shoulder: 0xcfd9e4, road: 0x40454d, wall: 0x2e6fd1, tree: 0x2c5a4a, sky: 0xcfe3ff },
  { name: 'Outono Rubro', ground: 0x8a6a2f, shoulder: 0xa07c3a, road: 0x3b3936, wall: 0xe0e0e0, tree: 0xc0502a, sky: 0xf0c9a0 },
  { name: 'Cidade Neon', ground: 0x1f2433, shoulder: 0x2b3147, road: 0x15171d, wall: 0xff3dbb, tree: 0x26e0c8, sky: 0x10121a },
];

const TRACK_NAMES = ['Circuito', 'Anel', 'Autódromo', 'Traçado', 'Serpentina', 'Grande Prêmio'];

const DS = 2; // espaçamento entre amostras (metros)

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}

export function generateTrack(level) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rng = mulberry32(level * 7919 + attempt * 104729 + 17);
    const t = tryBuild(level, rng);
    if (t) {
      t.pads = placePads(t);
      return t;
    }
  }
  throw new Error('Não foi possível gerar a pista');
}

// Gerador de pistas com cara de autódromo:
// 1. pontos aleatórios -> envoltória convexa (o contorno geral)
// 2. pontos médios das arestas deslocados para dentro e para fora (cria curvas para os dois lados, chicanes e grampos)
// 3. cantos arredondados com raios variados ligados por retas de verdade
// 4. filtros de qualidade: curvas para os dois lados, reta longa, número mínimo de curvas
function tryBuild(level, rng) {
  const halfWidth = Math.max(6.5, 9.5 - (level - 1) * 0.3);
  const grass = 7;
  const wallOffset = halfWidth + grass;
  const minR = wallOffset + 3;
  const W = 560 + Math.min(level, 12) * 15 + rng() * 140;
  const H = W * (0.55 + rng() * 0.25);
  const nPts = 6 + Math.min(4, Math.floor(level / 3)) + Math.floor(rng() * 3);

  let pts = [];
  for (let i = 0; i < nPts; i++) pts.push([rng() * W, rng() * H]);
  pts = convexHull(pts);
  if (pts.length < 4) return null;

  // O contorno sai no sentido anti-horário, então a normal à esquerda aponta para dentro.
  // Cada aresta longa ganha um "trecho": reta pura, baía para dentro (curvas ao contrário e grampo),
  // barriga para fora ou um S (um ponto para dentro, outro para fora).
  const along = (a, b, t, off) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
    return [a[0] + dx * t - (dy / len) * off, a[1] + dy * t + (dx / len) * off];
  };
  const edgeLen = (i) => Math.hypot(pts[(i + 1) % pts.length][0] - pts[i][0], pts[(i + 1) % pts.length][1] - pts[i][1]);
  let longestEdge = 0;
  for (let i = 1; i < pts.length; i++) if (edgeLen(i) > edgeLen(longestEdge)) longestEdge = i;
  {
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const len = edgeLen(i);
      if (len < 140 || i === longestEdge) continue; // a maior aresta vira a reta principal
      const r = rng();
      if (r < 0.2) continue;
      if (r < 0.55) {
        const depth = len * (0.3 + rng() * 0.35);
        if (rng() < 0.5) out.push(along(a, b, 0.5, depth));
        else out.push(along(a, b, 0.3 + rng() * 0.1, depth), along(a, b, 0.6 + rng() * 0.1, depth * (0.7 + rng() * 0.5)));
      } else if (r < 0.75) {
        out.push(along(a, b, 0.5, -len * (0.12 + rng() * 0.18)));
      } else {
        const d = len * (0.15 + rng() * 0.15), sg = rng() < 0.5 ? 1 : -1;
        out.push(along(a, b, 0.33, d * sg), along(a, b, 0.67, -d * sg));
      }
    }
    pts = out;
  }
  if (level >= 4) {
    // segunda passada mais leve, só em parte das arestas
    const out = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      out.push(a);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 190 && rng() < 0.45) out.push(along(a, b, 0.5, (rng() * 2 - 1) * len * 0.18));
    }
    pts = out;
  }

  // afasta pontos muito próximos
  for (let it = 0; it < 12; it++) {
    for (let i = 0; i < pts.length; i++) {
      for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[j][0] - pts[i][0], dy = pts[j][1] - pts[i][1];
        const d = Math.hypot(dx, dy) || 1;
        const min = 75;
        if (d < min) {
          const push = (min - d) / 2;
          pts[i][0] -= (dx / d) * push; pts[i][1] -= (dy / d) * push;
          pts[j][0] += (dx / d) * push; pts[j][1] += (dy / d) * push;
        }
      }
    }
  }
  // suaviza bicos agudos demais (viradas acima de ~150°)
  for (let it = 0; it < 6; it++) {
    for (let i = 0; i < pts.length; i++) {
      const p0 = pts[(i - 1 + pts.length) % pts.length], p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      if (Math.abs(turnAngle(p0, p1, p2)) > 2.6) {
        p1[0] = (p1[0] * 2 + (p0[0] + p2[0]) / 2) / 3;
        p1[1] = (p1[1] * 2 + (p0[1] + p2[1]) / 2) / 3;
      }
    }
  }

  // chicanes tipo "parada de ônibus" em retas longas: desvia para um lado e volta
  if (level >= 2) {
    const want = level < 6 ? 1 : 2;
    const order = pts.map((_, i) => i).sort((i, j) => Math.hypot(pts[(j + 1) % pts.length][0] - pts[j][0], pts[(j + 1) % pts.length][1] - pts[j][1]) - Math.hypot(pts[(i + 1) % pts.length][0] - pts[i][0], pts[(i + 1) % pts.length][1] - pts[i][1]));
    const chosen = order.slice(1, 1 + want).filter((i) => Math.hypot(pts[(i + 1) % pts.length][0] - pts[i][0], pts[(i + 1) % pts.length][1] - pts[i][1]) > 220).sort((x, y) => y - x);
    for (const i of chosen) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const c = 0.45 + rng() * 0.25, h = (14 + rng() * 8) * (rng() < 0.5 ? 1 : -1), u = 1 / len;
      pts.splice(i + 1, 0, along(a, b, c - 50 * u, 0), along(a, b, c - 16 * u, h), along(a, b, c + 16 * u, h), along(a, b, c + 50 * u, 0));
    }
  }

  const dense = filletPath(pts, rng, minR);
  if (!dense) return null;
  const theme = THEMES[(level - 1) % THEMES.length];
  // o tema repete a cada 5 níveis; o prefixo muda a cada volta do ciclo para não repetir nomes
  const name = `${TRACK_NAMES[Math.floor((level - 1) / THEMES.length) % TRACK_NAMES.length]} ${theme.name}`;
  const t = buildFromControl(null, { level, name, theme, halfWidth, grass, minLen: 1000, maxLen: 2400, dense });
  if (!t) return null;

  // qualidade: precisa virar para os dois lados, ter uma reta longa e curvas suficientes
  let pos = 0, neg = 0, run = 0, longest = 0, corners = 0, inCorner = false;
  for (let k = 0; k < t.N * 2; k++) {
    const c = t.curvature[k % t.N];
    if (k < t.N) { if (c > 0) pos += c; else neg -= c; }
    if (Math.abs(c) < 0.004) { run += t.ds; longest = Math.max(longest, run); } else run = 0;
    if (k < t.N) {
      const corner = Math.abs(c) > 0.01;
      if (corner && !inCorner) corners++;
      inCorner = corner;
    }
  }
  const minority = Math.min(pos, neg) / (pos + neg);
  if (minority < (level < 3 ? 0.14 : 0.2)) return null;
  if (longest < 140) return null;
  if (corners < Math.min(12, 6 + Math.floor(level / 2))) return null;
  t.laps = t.length > 1500 ? 2 : 3;
  return t;
}

function convexHull(points) {
  const p = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop(); lower.push(q); }
  for (const q of p.reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1)).map((q) => [q[0], q[1]]);
}

function turnAngle(p0, p1, p2) {
  const ax = p1[0] - p0[0], ay = p1[1] - p0[1], bx = p2[0] - p1[0], by = p2[1] - p1[1];
  return Math.atan2(ax * by - ay * bx, ax * bx + ay * by);
}

// Liga os pontos com retas e arredonda cada canto com um arco. Raios: grampo apertado, curva média ou de alta.
function filletPath(pts, rng, minR) {
  const n = pts.length;
  const corner = pts.map((p1, i) => {
    const p0 = pts[(i - 1 + n) % n], p2 = pts[(i + 1) % n];
    const turn = turnAngle(p0, p1, p2);
    const a = Math.abs(turn);
    let r;
    if (a > 1.9) r = minR * (1 + rng() * 0.6); // grampo
    else if (a > 0.8) r = 22 + rng() * 45; // curva média
    else r = 45 + rng() * 90; // curva de alta
    return { turn, r: Math.max(minR, r) };
  });
  // garante que os arcos de cantos vizinhos cabem na reta entre eles
  const tl = (c) => c.r * Math.tan(Math.abs(c.turn) / 2);
  for (let it = 0; it < 4; it++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const len = Math.hypot(pts[j][0] - pts[i][0], pts[j][1] - pts[i][1]);
      const need = tl(corner[i]) + tl(corner[j]);
      if (need > len * 0.95) {
        const k = (len * 0.95) / need;
        corner[i].r *= k;
        corner[j].r *= k;
      }
    }
  }
  if (corner.some((c) => c.r < minR)) return null;

  const out = [];
  const geo = corner.map((c, i) => {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n];
    let ix = p1[0] - p0[0], iy = p1[1] - p0[1];
    let l = Math.hypot(ix, iy); ix /= l; iy /= l;
    let ox = p2[0] - p1[0], oy = p2[1] - p1[1];
    l = Math.hypot(ox, oy); ox /= l; oy /= l;
    const d = tl(c);
    const entry = [p1[0] - ix * d, p1[1] - iy * d];
    const exit = [p1[0] + ox * d, p1[1] + oy * d];
    const sg = Math.sign(c.turn) || 1;
    const center = [entry[0] - iy * c.r * sg, entry[1] + ix * c.r * sg];
    return { entry, exit, center, r: c.r, turn: c.turn };
  });
  for (let i = 0; i < n; i++) {
    const g = geo[i];
    const a0 = Math.atan2(g.entry[1] - g.center[1], g.entry[0] - g.center[0]);
    const steps = Math.max(2, Math.ceil((Math.abs(g.turn) * g.r) / 1.5));
    for (let k = 0; k < steps; k++) {
      const a = a0 + (g.turn * k) / steps;
      out.push([g.center[0] + Math.cos(a) * g.r, g.center[1] + Math.sin(a) * g.r]);
    }
    const nx = geo[(i + 1) % n].entry;
    const len = Math.hypot(nx[0] - g.exit[0], nx[1] - g.exit[1]);
    const ss = Math.max(1, Math.ceil(len / 1.5));
    for (let k = 0; k < ss; k++) out.push([g.exit[0] + ((nx[0] - g.exit[0]) * k) / ss, g.exit[1] + ((nx[1] - g.exit[1]) * k) / ss]);
  }
  return out;
}

// Monte a pista a partir de pontos de controle (spline fechada).
// startAt: [x, y] fixa a largada perto desse ponto; sem ele, a largada vai para o trecho mais reto.
function buildFromControl(ctrl, { level, name, theme, halfWidth, grass, minLen, maxLen, startAt, strict = true, dense: given }) {
  const nPts = ctrl ? ctrl.length : 0;
  const wallOffset = halfWidth + grass;

  // Spline fechada densa (ou o caminho pronto, quando vier do gerador de retas e arcos)
  const dense = given || [];
  for (let i = 0; i < (given ? 0 : nPts); i++) {
    const p0 = ctrl[(i - 1 + nPts) % nPts], p1 = ctrl[i], p2 = ctrl[(i + 1) % nPts], p3 = ctrl[(i + 2) % nPts];
    for (let k = 0; k < 40; k++) dense.push(catmull(p0, p1, p2, p3, k / 40));
  }

  // Reamostragem por comprimento de arco
  let total = 0;
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1], b = dense[i % dense.length];
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
    cum.push(total);
  }
  if (total < minLen || total > maxLen) return null;
  const N = Math.floor(total / DS);
  const ds = total / N;
  let px = new Float32Array(N), py = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * ds;
    while (cum[j + 1] < s) j++;
    const a = dense[j], b = dense[(j + 1) % dense.length];
    const f = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    px[i] = a[0] + (b[0] - a[0]) * f;
    py[i] = a[1] + (b[1] - a[1]) * f;
  }

  const tangents = (X, Y) => {
    const tx = new Float32Array(N), ty = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N, b = (i + 1) % N;
      const dx = X[b] - X[a], dy = Y[b] - Y[a];
      const l = Math.hypot(dx, dy) || 1;
      tx[i] = dx / l; ty[i] = dy / l;
    }
    return [tx, ty];
  };
  let [tx, ty] = tangents(px, py);

  // Curvatura (com sinal) e raio mínimo
  const curv = new Float32Array(N);
  let maxCurv = 0;
  for (let i = 0; i < N; i++) {
    const b = (i + 1) % N;
    const cross = tx[i] * ty[b] - ty[i] * tx[b];
    const dot = tx[i] * tx[b] + ty[i] * ty[b];
    curv[i] = Math.atan2(cross, dot) / ds;
  }
  // suaviza
  const sc = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = -3; k <= 3; k++) s += curv[(i + k + N) % N];
    sc[i] = s / 7;
    maxCurv = Math.max(maxCurv, Math.abs(sc[i]));
  }
  if (strict && 1 / maxCurv < wallOffset + 2) return startAt ? fail(`curva fechada demais: raio ${(1 / maxCurv).toFixed(1)} m`) : null;

  // Sem trechos da pista se aproximando demais
  const minGap = 2 * wallOffset + 8;
  const skip = Math.ceil((Math.PI * wallOffset + 40) / ds);
  for (let a = 0; a < N; a += 2) {
    for (let b = a + skip; b < N; b += 2) {
      if (N - (b - a) < skip) break;
      const dx = px[a] - px[b], dy = py[a] - py[b];
      if (strict && dx * dx + dy * dy < minGap * minGap) return startAt ? fail(`trechos ${a} e ${b} perto demais`) : null;
    }
  }

  // A largada fica no trecho mais reto
  const win = Math.floor(80 / ds);
  let best = 0, bestSum = Infinity;
  for (let i = 0; i < N; i++) {
    let s = 0;
    for (let k = 0; k < win; k++) s += Math.abs(sc[(i + k) % N]);
    if (s < bestSum) { bestSum = s; best = i; }
  }
  let start = (best + Math.floor(win * 0.6)) % N;
  if (startAt) {
    let bd = Infinity;
    for (let i = 0; i < N; i++) {
      const d = (px[i] - startAt[0]) ** 2 + (py[i] - startAt[1]) ** 2;
      if (d < bd) { bd = d; start = i; }
    }
  }
  const rotArr = (arr) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = arr[(i + start) % N]; return o; };
  px = rotArr(px); py = rotArr(py);
  [tx, ty] = tangents(px, py);
  const curvature = rotArr(sc);
  return new Track({ level, name, theme, N, ds, px, py, tx, ty, curvature, halfWidth, grass, wallOffset, length: total });
}

function fail(msg) { throw new Error(`Pista fixa inválida: ${msg}`); }

// ---------- Mônaco ----------
// Traçado inspirado no Circuit de Monaco, no sentido horário, com as curvas na ordem real.
// Coordenadas com o norte para cima (convertidas para o mapa do jogo abaixo), em unidades que são escaladas.
const MONACO_POINTS = [
  [0, -30], [0, 20], [0, 70], [0, 120], [0, 160], // reta dos boxes (Boulevard Albert 1er)
  [3, 184], [16, 199], [40, 206], // Sainte Dévote (direita)
  [80, 214], [130, 228], [180, 250], // subida da Beau Rivage
  [222, 282], [244, 320], // Massenet (esquerda longa)
  [268, 350], [304, 362], // Casino (direita)
  [338, 354], [358, 330], // descida para Mirabeau
  [360, 300], [342, 282], [314, 276], // Mirabeau Haute (direita)
  [296, 270], [286, 256], [292, 242], [308, 236], // grampo do Grand Hotel (esquerda)
  [340, 230], [368, 214], // Mirabeau Bas (direita)
  [380, 188], [368, 162], // Portier (direita)
  [334, 142], [286, 127], [236, 113], // túnel
  [196, 102], [180, 88], [160, 85], // Nouvelle Chicane
  [132, 76], [114, 56], // Tabac (esquerda)
  [96, 44], [78, 50], [62, 38], // Piscine (esquerda-direita, direita-esquerda)
  [50, 12], [44, -18], [30, -40], // La Rascasse (direita)
  [12, -52], [2, -46], // Anthony Noghes (direita)
];

export const MONACO_THEME = {
  name: 'Monte Carlô', ground: 0x8f8c86, shoulder: 0xc6bfb1, road: 0x34373c, wall: 0xe9e9e9,
  tree: 0xe8d6b5, sky: 0x8ec9f0, city: true,
};

// ---------- Interlagos ----------
// Traçado inspirado no Autódromo José Carlos Pace, no sentido anti-horário, com as curvas na ordem real.
const INTERLAGOS_POINTS = [
  [200, 318], [140, 316], [90, 310], // fim da reta dos boxes
  [62, 300], [48, 282], [44, 258], // S do Senna (esquerda)
  [34, 236], [24, 210], // S do Senna (direita)
  [24, 180], [34, 145], [58, 112], // Curva do Sol (esquerda)
  [100, 88], [160, 68], [230, 48], [300, 30], // Reta Oposta
  [345, 24], [375, 42], [380, 72], [362, 96], // Descida do Lago (esquerda)
  [330, 106], [296, 112], [268, 124], [256, 150], // Ferradura (direita)
  [262, 178], [284, 192], // Laranjinha (direita)
  [304, 202], [316, 222], // Pinheirinho (esquerda)
  [322, 244], [340, 254], [354, 240], // Bico de Pato (direita)
  [356, 214], [370, 194], // Mergulho (esquerda)
  [396, 186], [416, 200], // Junção (esquerda)
  [428, 236], [420, 276], [392, 302], [340, 316], [270, 320], // Subida dos Boxes
];

export const INTERLAGOS_THEME = {
  name: 'Interlakes', ground: 0x4a8a3a, shoulder: 0x64a04c, road: 0x3b3e43, wall: 0xf2f2f2,
  tree: 0x2f6b2a, sky: 0xa8d4f5,
};

// Pistas fixas inspiradas em circuitos reais. level define o ritmo dos adversários e as placas.
export const FIXED_TRACKS = {
  monaco: {
    name: 'Grande Prêmio de Monaque', points: MONACO_POINTS, scale: 1.8, theme: MONACO_THEME,
    halfWidth: 6.4, grass: 3.2, start: [0, -40], laps: 2, level: 5, pads: { oil: 0, boost: 2 },
    // porto (Port Hercule) entre a reta dos boxes e a piscina, com alguns iates
    water: { x0: 14, x1: 150, y0: 95, y1: 185 },
  },
  interlagos: {
    name: 'Grande Prêmio de Interlakes', points: INTERLAGOS_POINTS, scale: 2.0, theme: INTERLAGOS_THEME,
    halfWidth: 7.6, grass: 6, start: [180, 318], laps: 2, level: 8, pads: { oil: 2, boost: 3 },
    // represa ao sul da Reta Oposta
    water: { x0: 120, x1: 330, y0: -70, y1: -6 },
  },
};

const fixedCache = {};
export function fixedTrack(id, strict = true) {
  if (strict && fixedCache[id]) return fixedCache[id];
  const d = FIXED_TRACKS[id];
  const S = d.scale;
  const t = buildFromControl(d.points.map(([x, y]) => [x * S, -y * S]), {
    level: d.level, name: d.name, theme: d.theme, halfWidth: d.halfWidth, grass: d.grass,
    minLen: 500, maxLen: 5000, startAt: [d.start[0] * S, -d.start[1] * S], strict,
  });
  t.id = id;
  t.fixed = true;
  t.laps = d.laps;
  if (d.water) t.water = { x0: d.water.x0 * S, x1: d.water.x1 * S, y0: -d.water.y1 * S, y1: -d.water.y0 * S };
  t.pads = placePads(t, d.pads);
  fixedCache[id] = t;
  return t;
}

export function monacoTrack(_level, strict = true) {
  return fixedTrack('monaco', strict);
}

// Pista da carreira: a 5 é Mônaco e a 8 é Interlagos; as outras são geradas pela semente do nível.
const levelCache = {};
export function trackForLevel(level) {
  if (level === 5) return fixedTrack('monaco');
  if (level === 8) return fixedTrack('interlagos');
  if (!levelCache[level]) {
    levelCache[level] = generateTrack(level);
    levelCache[level].id = `g2-${level}`;
  }
  return levelCache[level];
}

// Placas de turbo (nas retas) e manchas de óleo (a partir do nível 2).
// Cada uma: { idx, lat, kind: 'boost' | 'oil', len, w }
function placePads(t, counts = {}) {
  const rng = mulberry32(t.level * 577 + 3);
  const pads = [];
  const nBoost = counts.boost ?? 2 + Math.min(2, Math.floor(t.level / 3));
  const nOil = counts.oil ?? (t.level < 2 ? 0 : Math.min(5, 1 + Math.floor(t.level / 2)));
  const minSep = Math.floor(60 / t.ds);
  const farFromOthers = (i) => pads.every((p) => {
    const d = Math.abs(p.idx - i);
    return Math.min(d, t.N - d) > minSep;
  });
  const startGap = Math.floor(70 / t.ds);
  const okIdx = (i) => i > startGap && i < t.N - startGap / 2;
  let guard = 0;
  while (pads.filter((p) => p.kind === 'boost').length < nBoost && guard++ < 500) {
    const i = Math.floor(rng() * t.N);
    if (!okIdx(i) || !farFromOthers(i) || t.maxCurvAhead(t.wrap(i - 10), 40) > 0.008) continue;
    pads.push({ idx: i, lat: (rng() - 0.5) * t.halfWidth, kind: 'boost', len: 7, w: 3.6 });
  }
  guard = 0;
  while (pads.filter((p) => p.kind === 'oil').length < nOil && guard++ < 500) {
    const i = Math.floor(rng() * t.N);
    if (!okIdx(i) || !farFromOthers(i)) continue;
    pads.push({ idx: i, lat: (rng() - 0.5) * t.halfWidth * 1.1, kind: 'oil', len: 6, w: 4.5 });
  }
  return pads;
}

export class Track {
  constructor(o) {
    Object.assign(this, o);
    // Normal à esquerda do sentido de corrida
    this.nx = new Float32Array(this.N);
    this.ny = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) { this.nx[i] = -this.ty[i]; this.ny[i] = this.tx[i]; }
  }

  wrap(i) { return ((i % this.N) + this.N) % this.N; }

  // Placa sob a posição (idx, lat), ou null
  padAt(idx, lat) {
    for (const p of this.pads || []) {
      let d = Math.abs(p.idx - idx);
      d = Math.min(d, this.N - d) * this.ds;
      if (d < p.len / 2 && Math.abs(lat - p.lat) < p.w / 2) return p;
    }
    return null;
  }

  // Encontra a amostra mais próxima. hint < 0 => busca global.
  project(x, y, hint = -1) {
    const N = this.N;
    let bestI = 0, bestD = Infinity;
    if (hint < 0) {
      for (let i = 0; i < N; i++) {
        const d = (this.px[i] - x) ** 2 + (this.py[i] - y) ** 2;
        if (d < bestD) { bestD = d; bestI = i; }
      }
    } else {
      for (let k = -30; k <= 30; k++) {
        const i = this.wrap(hint + k);
        const d = (this.px[i] - x) ** 2 + (this.py[i] - y) ** 2;
        if (d < bestD) { bestD = d; bestI = i; }
      }
    }
    const lat = (x - this.px[bestI]) * this.nx[bestI] + (y - this.py[bestI]) * this.ny[bestI];
    return { idx: bestI, lat };
  }

  // Maior curvatura absoluta num trecho à frente (para a IA frear antes da curva)
  maxCurvAhead(idx, meters) {
    const n = Math.ceil(meters / this.ds);
    let m = 0;
    for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(this.curvature[this.wrap(idx + k)]));
    return m;
  }

  // Posição de largada no grid (slot 0 = pole)
  gridSlot(slot) {
    const row = Math.floor(slot / 2), col = slot % 2;
    const i = this.wrap(-4 - Math.round((row * 9 + (col ? 4.5 : 0)) / this.ds));
    const side = col ? -1 : 1;
    const off = side * this.halfWidth * 0.42;
    return {
      x: this.px[i] + this.nx[i] * off,
      y: this.py[i] + this.ny[i] * off,
      heading: Math.atan2(this.tx[i], this.ty[i]),
      idx: i,
    };
  }
}
