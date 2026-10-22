import * as THREE from 'three';
import { trackForLevel, fixedTrack, FIXED_TRACKS } from './track.js';
import { DIFFICULTIES, difficultyById } from './difficulty.js';
import { CarPhysics, collideCars, slipstream } from './physics.js';
import { aiInput, makeAi, aiPaceForLevel, aiStats, attemptEase } from './ai.js';
import { buildStats, driverBonus, xpToNext, raceXp, addXp, loadSave, writeSave, clearSave, defaultSave, MAX_DRIVER_LEVEL } from './driver.js';
import { rollOffers, RARITY } from './upgrades.js';
import { buildTrackScene, disposeGroup, makeCarMesh, SkidMarks, Smoke } from './scene.js';
import { mulberry32 } from './rng.js';
import { LIVERIES, liveryColors } from './livery.js';
import { GRID_SIZE, playerGridSlot } from './grid.js';
import { Engine, VOLUME_LEVELS, VOLUME_NAMES } from './audio.js';

const DT = 1 / 120;
const CAR_PALETTE = [
  { name: 'Amarelo', hex: 0xffcf3d }, { name: 'Vermelho', hex: 0xe5484d }, { name: 'Azul', hex: 0x3d9bff },
  { name: 'Verde', hex: 0x4ade80 }, { name: 'Laranja', hex: 0xff8a3d }, { name: 'Roxo', hex: 0xa86bff },
  { name: 'Rosa', hex: 0xff5fa2 }, { name: 'Ciano', hex: 0x3de0e0 }, { name: 'Branco', hex: 0xf2f2f2 },
  { name: 'Preto', hex: 0x2a2d34 },
];
const hexCss = (h) => '#' + h.toString(16).padStart(6, '0');
// ?autopilot na URL: a IA dirige o seu carro (útil para testar e para demonstração)
const AUTOPILOT = new URLSearchParams(location.search).has('autopilot');
const AI_NAMES = ['Vespa', 'Faísca', 'Trovão', 'Corisco', 'Bala', 'Cometa', 'Furacão', 'Relâmpago', 'Tufão', 'Ciclone',
  'Pantera', 'Falcão', 'Tornado', 'Raio', 'Gavião', 'Turbina', 'Bólido', 'Zênite', 'Fagulha', 'Meteoro'];

// ---------- Three.js ----------
const canvas = document.getElementById('game');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  window.__showBootError?.('Seu navegador não liberou o WebGL',
    'O jogo usa a placa de vídeo (WebGL) para desenhar a pista. Ative a <b>aceleração de hardware</b> nas configurações do navegador '
    + '(Chrome/Edge: Configurações → Sistema → "Usar aceleração de hardware quando disponível"), reinicie o navegador e abra de novo.<br>'
    + 'Para conferir, acesse <b>get.webgl.org</b>: deve aparecer um cubo girando.');
  window.__started = true;
  throw e;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 1, 2000);
const hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 300 });
scene.add(sun, sun.target);
const skids = new SkidMarks(scene);
const smoke = new Smoke(scene);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  smoke.setViewport(window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

// ---------- Entrada ----------
const keys = new Set();
const pressed = new Set();
const GAME_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
window.addEventListener('keydown', (e) => {
  if (GAME_KEYS.includes(e.code)) e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
  engine.unlock();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());
const down = (...codes) => codes.some((c) => keys.has(c));
const hit = (...codes) => codes.some((c) => pressed.has(c));

// ---------- Estado ----------
const engine = new Engine();
let save = loadSave();
engine.setVolume(VOLUME_LEVELS[save.volume ?? 2]);
const laps = () => g.track?.laps || 3;
const diff = () => difficultyById(save.difficulty);
// modo 'career' (pistas em sequência, como roguelike) ou 'free' (corrida livre, não mexe na carreira)
const freeRace = () => g.mode === 'free';
// pistas da corrida livre: as inspiradas em circuitos reais e as primeiras pistas geradas da carreira
const FREE_TRACKS = ['monaco', 'interlagos', ...[1, 2, 3, 4, 6, 7, 9, 10, 11, 12].map((n) => `p${n}`)];
const freeTrack = (id) => (FIXED_TRACKS[id] ? fixedTrack(id) : trackForLevel(Number(id.slice(1))));
const TITLE_ROWS = ['career', 'free'];
const SETUP_ROWS = ['color', 'color2', 'livery', 'diff', 'volume', 'reset', 'go'];
const g = {
  state: 'title',
  mode: 'career',
  freeTrackId: 'monaco',
  menuSel: 0,
  trackSel: 0,
  freeOffers: [],
  track: null,
  trackGroup: null,
  cars: [],
  player: null,
  time: 0,
  countdown: 0,
  offers: [],
  sel: 0,
  chosen: null,
  rotateCam: false,
  wrongWay: 0,
  msg: '',
  msgTime: 0,
  finishDelay: 0,
  confirmNew: false,
  results: null,
  shake: 0,
  impact: 0,
  padHit: null,
  lastBeep: 0,
};
const camPos = new THREE.Vector3(0, 120, 0);
const camLook = new THREE.Vector3();

const $ = (id) => document.getElementById(id);
const screenEl = $('screen');
const hudEl = $('hud');

function showScreen(html) {
  screenEl.innerHTML = html;
  screenEl.classList.add('show');
}
function hideScreen() { screenEl.classList.remove('show'); }

function fmt(t) {
  if (!isFinite(t)) return '—';
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

function flash(text, dur = 1.6) { g.msg = text; g.msgTime = dur; }

// ---------- Pista ----------
function loadTrack() {
  const next = freeRace() ? freeTrack(g.freeTrackId) : trackForLevel(save.trackLevel);
  if (g.track === next) return;
  if (g.trackGroup) { scene.remove(g.trackGroup); disposeGroup(g.trackGroup); }
  for (const c of g.cars) scene.remove(c.mesh);
  g.cars = [];
  g.track = next;
  g.trackGroup = buildTrackScene(g.track);
  scene.add(g.trackGroup);
  const th = g.track.theme;
  scene.background = new THREE.Color(th.sky);
  const neon = th.name === 'Cidade Neon';
  hemi.intensity = neon ? 0.7 : 1.6;
  sun.intensity = neon ? 0.9 : 2.2;
  buildMinimap();
  // câmera começa sobre o grid
  const s = g.track.gridSlot(3);
  camPos.set(s.x, 120, s.y + 20);
  camLook.set(s.x, 0, s.y);
}

// ---------- Telas ----------
function driverPanel() {
  const d = save.driver;
  const pct = d.level >= MAX_DRIVER_LEVEL ? 100 : (d.xp / xpToNext(d.level)) * 100;
  const b = driverBonus(d.level);
  const p = (x) => `+${Math.round((x - 1) * 100)}%`;
  return `
    <div class="stats">
      <div class="stat"><div class="v">Nv. ${d.level}</div><div class="k">Piloto</div></div>
      <div class="stat"><div class="v">${p(b.topSpeed)}</div><div class="k">Velocidade máx.</div></div>
      <div class="stat"><div class="v">${p(b.grip)}</div><div class="k">Aderência</div></div>
      <div class="stat"><div class="v">${p(b.steer)}</div><div class="k">Direção</div></div>
    </div>
    <div class="xpbar"><i style="width:${pct}%"></i></div>
    <div class="sub" style="margin:0">${d.level >= MAX_DRIVER_LEVEL ? 'Nível máximo' : `${d.xp} / ${xpToNext(d.level)} XP para o próximo nível`}</div>`;
}

// ---------- Menu inicial ----------
function showMenu() {
  g.state = 'title';
  g.mode = 'career';
  hudEl.style.display = 'none';
  loadTrack();
  renderTitle();
}

function renderTitle() {
  const dr = save.driver;
  const pct = dr.level >= MAX_DRIVER_LEVEL ? 100 : (dr.xp / xpToNext(dr.level)) * 100;
  const careerTrack = trackForLevel(save.trackLevel);
  const started = save.trackLevel > 1 || dr.level > 1 || save.attempt > 1;
  const row = (id, inner) => `<div class="mrow ${TITLE_ROWS[g.menuSel] === id ? 'sel' : ''}" data-row="${id}">${inner}</div>`;
  showScreen(`
    <div class="box">
      <h1>ROGUE<span>RACER</span></h1>
      <p class="sub">Se as teclas não responderem, clique na tela.</p>
      <div class="menu">
        ${row('career', `<div class="mode"><b>Carreira</b><span>Todas as pistas em sequência. Vença para avançar; perdeu, repete a pista com outros bônus.</span>
          <span class="meta">${started ? 'Continuar' : 'Começar'}: pista ${save.trackLevel}, ${careerTrack.name} · tentativa ${save.attempt} · piloto nível ${dr.level}</span>
          <div class="xpbar small"><i style="width:${pct}%"></i></div></div><kbd>1</kbd>`)}
        ${row('free', `<div class="mode"><b>Corrida livre</b><span>Escolha a pista, incluindo Monaque e Interlakes. Ganha XP, mas não muda a carreira.</span></div><kbd>2</kbd>`)}
      </div>
      <div class="actions"><span><kbd>↑</kbd> <kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> confirmar</span></div>
    </div>`);
  screenEl.querySelectorAll('[data-row]').forEach((el) => el.addEventListener('click', () => {
    g.menuSel = TITLE_ROWS.indexOf(el.dataset.row);
    activateTitleRow();
  }));
}

function activateTitleRow() {
  g.mode = TITLE_ROWS[g.menuSel] === 'free' ? 'free' : 'career';
  showSetup();
}

// ---------- Segunda tela: preparar o carro e a corrida ----------
function showSetup() {
  g.state = 'setup';
  g.setupSel = SETUP_ROWS.length - 1; // começa no botão de seguir
  g.confirmNew = false;
  hudEl.style.display = 'none';
  renderSetup();
}

function renderSetup() {
  const d = diff();
  const col = CAR_PALETTE[save.color] || CAR_PALETTE[0];
  const col2 = CAR_PALETTE[save.color2] || CAR_PALETTE[9];
  const free = g.mode === 'free';
  const row = (id, inner) => `<div class="mrow ${SETUP_ROWS[g.setupSel] === id ? 'sel' : ''}" data-row="${id}">${inner}</div>`;
  const swatches = (key) => CAR_PALETTE.map((c, i) => `<button class="swatch ${i === save[key] ? 'on' : ''}" data-${key}="${i}" style="background:${hexCss(c.hex)}" title="${c.name}"></button>`).join('');
  const liveries = LIVERIES.map((l, i) => `<button class="chip ${i === save.livery ? 'on' : ''}" data-livery="${i}">${l.name}</button>`).join('');
  const diffs = DIFFICULTIES.map((x) => `<button class="chip ${x.id === d.id ? 'on' : ''}" data-diff="${x.id}">${x.name}</button>`).join('');
  showScreen(`
    <div class="box">
      <h2>${free ? 'Corrida livre' : 'Carreira'}</h2>
      <p class="sub">Prepare o carro e a corrida. ${free ? 'Depois você escolhe a pista.' : `Próxima: pista ${save.trackLevel}, ${trackForLevel(save.trackLevel).name}.`}</p>
      <div class="menu">
        <div class="livery-wrap">
          <div>
            ${row('color', `<span class="k">Cor principal</span><div class="row">${swatches('color')}</div><span class="v">${col.name}</span>`)}
            ${row('color2', `<span class="k">Cor secundária</span><div class="row">${swatches('color2')}</div><span class="v">${col2.name}</span>`)}
            ${row('livery', `<span class="k">Desenho</span><div class="row">${liveries}</div><span class="v"></span>`)}
          </div>
          <canvas id="car-preview" width="140" height="280" title="Seu carro"></canvas>
        </div>
        ${row('diff', `<span class="k">Dificuldade</span><div class="row">${diffs}</div><span class="v small">${d.desc}</span>`)}
        ${row('volume', `<span class="k">Som</span><div class="row"><button class="chip on" data-vol="1">${VOLUME_NAMES[save.volume ?? 2]}</button></div><span class="v"></span>`)}
        ${free ? '' : row('reset', `<span class="k">Apagar progresso</span><div class="row"><span class="${g.confirmNew ? 'lose' : 'muted'}">${g.confirmNew ? 'Aperte Enter de novo para zerar carreira, XP e recordes' : 'Zera a carreira, o piloto e os recordes'}</span></div><span class="v"></span>`)}
        ${row('go', `<div class="mode go"><b>${free ? 'Escolher a pista' : 'Ir para a largada'}</b><span>${free ? 'Monaque, Interlakes e as pistas da carreira' : 'Escolha 1 de 3 bônus e corra'}</span></div><kbd>Enter</kbd>`)}
      </div>
      <div class="controls">
        <span><kbd>W</kbd> <kbd>↑</kbd></span><span>Acelerar</span>
        <span><kbd>S</kbd> <kbd>↓</kbd></span><span>Frear / ré</span>
        <span><kbd>A</kbd> <kbd>D</kbd> <kbd>←</kbd> <kbd>→</kbd></span><span>Virar</span>
        <span><b>Vácuo</b></span><span>Ande logo atrás de outro carro</span>
        <span><kbd>Shift</kbd></span><span>Nitro (se tiver)</span>
        <span><kbd>R</kbd></span><span>Voltar para a pista</span>
        <span><kbd>C</kbd></span><span>Câmera fixa / girando</span>
        <span><kbd>M</kbd></span><span>Silenciar na corrida</span>
      </div>
      <div class="actions"><span><kbd>↑</kbd> <kbd>↓</kbd> escolher</span><span><kbd>←</kbd> <kbd>→</kbd> mudar opção</span><span><kbd>Enter</kbd> seguir</span><span><kbd>Esc</kbd> voltar</span></div>
    </div>`);
  screenEl.querySelectorAll('[data-row]').forEach((el) => el.addEventListener('click', () => {
    g.setupSel = SETUP_ROWS.indexOf(el.dataset.row);
    if (['go', 'reset'].includes(el.dataset.row)) activateSetupRow();
    else renderSetup();
  }));
  screenEl.querySelectorAll('[data-color]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); setColor('color', +el.dataset.color); }));
  screenEl.querySelectorAll('[data-color2]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); setColor('color2', +el.dataset.color2); }));
  screenEl.querySelectorAll('[data-livery]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); setLivery(+el.dataset.livery); }));
  screenEl.querySelectorAll('[data-diff]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); setDifficulty(el.dataset.diff); }));
  screenEl.querySelectorAll('[data-vol]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); cycleVolume(1); }));
  drawCarPreview($('car-preview'), col.hex, col2.hex, save.livery);
}

function setupRows() {
  return g.mode === 'free' ? SETUP_ROWS.filter((r) => r !== 'reset') : SETUP_ROWS;
}

function activateSetupRow() {
  const id = SETUP_ROWS[g.setupSel];
  if (id !== 'reset') g.confirmNew = false;
  if (id === 'reset') {
    if (g.confirmNew) {
      clearSave();
      const keep = { color: save.color, color2: save.color2, livery: save.livery, difficulty: save.difficulty, volume: save.volume };
      save = { ...defaultSave(), ...keep };
      writeSave(save);
      g.confirmNew = false;
      loadTrack();
    } else g.confirmNew = true;
    renderSetup();
  } else if (id === 'volume') cycleVolume(1);
  else if (g.mode === 'free') showTrackSelect();
  else toDraft();
}

function changeSetupOption(step) {
  const id = SETUP_ROWS[g.setupSel];
  if (id === 'color') setColor('color', save.color + step);
  else if (id === 'color2') setColor('color2', save.color2 + step);
  else if (id === 'livery') setLivery(save.livery + step);
  else if (id === 'diff') shiftDifficulty(step);
  else if (id === 'volume') cycleVolume(step);
}

function setColor(key, i) {
  save[key] = (i + CAR_PALETTE.length) % CAR_PALETTE.length;
  writeSave(save);
  renderSetup();
}

function setLivery(i) {
  save.livery = (i + LIVERIES.length) % LIVERIES.length;
  writeSave(save);
  renderSetup();
}

// Vista de cima do carro com a pintura escolhida (bico para cima)
function drawCarPreview(cv, primary, secondary, livery) {
  if (!cv) return;
  const L = liveryColors(livery, primary, secondary);
  const c = cv.getContext('2d');
  const k = 44, cx = cv.width / 2, cy = cv.height / 2 + 6;
  c.clearRect(0, 0, cv.width, cv.height);
  const rect = (x, z, w, d, color, r = 2) => {
    c.fillStyle = typeof color === 'number' ? hexCss(color) : color;
    c.beginPath();
    c.roundRect(cx + (x - w / 2) * k, cy - (z + d / 2) * k, w * k, d * k, r);
    c.fill();
  };
  const carbon = '#15171c';
  for (const [x, z, w, r] of [[-0.98, 1.45, 0.36, 0.34], [0.98, 1.45, 0.36, 0.34], [-0.98, -1.4, 0.46, 0.37], [0.98, -1.4, 0.46, 0.37]]) rect(x, z, w, r * 2, '#0d0d0f', 4);
  rect(0, -0.45, 1.5, 2.9, carbon);
  rect(0, 2.45, 2.1, 0.42, carbon);
  rect(0, 2.32, 1.9, 0.12, L.trim);
  for (const x of [-1.04, 1.04]) rect(x, 2.45, 0.08, 0.5, L.part('endF'), 1);
  // bico em trapézio
  c.fillStyle = hexCss(L.part('nose'));
  c.beginPath();
  c.moveTo(cx - 0.36 * k, cy - 0.9 * k); c.lineTo(cx + 0.36 * k, cy - 0.9 * k);
  c.lineTo(cx + 0.16 * k, cy - 2.6 * k); c.lineTo(cx - 0.16 * k, cy - 2.6 * k);
  c.fill();
  for (const x of [-0.72, 0.72]) rect(x, -0.35, 0.62, 1.5, L.part('pod'), 4);
  rect(0, 0.35, 0.78, 1.9, L.part('mono'), 4);
  rect(0, -1.0, 0.62, 1.6, L.part('engine'), 4);
  for (const sx of L.stripes) {
    const w = L.stripes.length > 1 ? 0.1 : 0.2;
    rect(sx * 0.55, 1.72, w * 0.8, 1.7, L.stripe, 1);
    rect(sx, 0.9, w, 1.0, L.stripe, 1);
    rect(sx * 0.85, -1.0, w, 1.6, L.stripe, 1);
  }
  rect(0, -1.25, 0.05, 1.1, L.part('fin'), 1);
  rect(0, 0.15, 0.5, 0.7, carbon, 6);
  c.fillStyle = hexCss(L.trim);
  c.beginPath(); c.arc(cx, cy - 0.05 * k, 0.2 * k, 0, Math.PI * 2); c.fill();
  rect(0, -2.15, 1.4, 0.38, carbon);
  rect(0, -2.28, 1.4, 0.2, L.trim);
  for (const x of [-0.72, 0.72]) rect(x, -2.18, 0.08, 0.62, L.part('endR'), 1);
}

function setDifficulty(id) {
  save.difficulty = id;
  writeSave(save);
  renderSetup();
}

function shiftDifficulty(step) {
  const i = DIFFICULTIES.findIndex((x) => x.id === diff().id);
  setDifficulty(DIFFICULTIES[Math.max(0, Math.min(DIFFICULTIES.length - 1, i + step))].id);
}

function cycleVolume(step = 1) {
  save.volume = ((save.volume ?? 2) + step + VOLUME_LEVELS.length) % VOLUME_LEVELS.length;
  engine.setVolume(VOLUME_LEVELS[save.volume]);
  writeSave(save);
  engine.beep(660, 0.12);
  renderSetup();
}

// ---------- Corrida livre: escolha da pista ----------
function showTrackSelect() {
  g.state = 'tracks';
  g.mode = 'free';
  hudEl.style.display = 'none';
  renderTrackSelect();
}

function renderTrackSelect() {
  const cards = FREE_TRACKS.map((id, i) => {
    const t = freeTrack(id);
    const best = save.best[`${t.id}:${save.difficulty}`];
    return `
      <div class="tcard ${i === g.trackSel ? 'sel' : ''}" data-t="${i}">
        <canvas data-prev="${id}" width="240" height="150"></canvas>
        <div class="tname">${t.name}</div>
        <div class="tmeta">Pista ${t.level} da carreira · ${(t.length / 1000).toFixed(1).replace('.', ',')} km · ${t.laps || 3} voltas</div>
        <div class="tmeta">${best ? `Seu recorde: ${fmt(best)}` : 'Sem recorde'}</div>
      </div>`;
  }).join('');
  showScreen(`
    <div class="box wide">
      <h2>Corrida livre</h2>
      <p class="sub">Escolha a pista. Dificuldade ${diff().name}. Você ganha XP, mas a carreira não muda.</p>
      <div class="tracks">${cards}</div>
      <div class="actions"><span><kbd>←</kbd> <kbd>→</kbd> <kbd>↑</kbd> <kbd>↓</kbd> escolher</span><span><kbd>Enter</kbd> correr</span><span><kbd>Esc</kbd> Menu</span></div>
    </div>`);
  screenEl.querySelectorAll('[data-t]').forEach((el) => el.addEventListener('click', () => { g.trackSel = +el.dataset.t; pickFreeTrack(); }));
  screenEl.querySelectorAll('canvas[data-prev]').forEach((cv) => drawTrackPreview(cv, freeTrack(cv.dataset.prev)));
  screenEl.querySelector('.tcard.sel')?.scrollIntoView({ block: 'nearest' });
}

function drawTrackPreview(cv, t) {
  const c = cv.getContext('2d');
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < t.N; i++) {
    minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
    minY = Math.min(minY, t.py[i]); maxY = Math.max(maxY, t.py[i]);
  }
  const pad = 14;
  const sc = Math.min((cv.width - pad * 2) / (maxX - minX), (cv.height - pad * 2) / (maxY - minY));
  const ox = (cv.width - (maxX - minX) * sc) / 2, oy = (cv.height - (maxY - minY) * sc) / 2;
  const P = (i) => [ox + (t.px[i % t.N] - minX) * sc, oy + (t.py[i % t.N] - minY) * sc];
  c.fillStyle = hexCss(t.theme.ground);
  c.globalAlpha = 0.35;
  c.fillRect(0, 0, cv.width, cv.height);
  c.globalAlpha = 1;
  c.beginPath();
  for (let i = 0; i <= t.N; i += 2) { const [x, y] = P(i); i ? c.lineTo(x, y) : c.moveTo(x, y); }
  c.closePath();
  c.lineJoin = 'round';
  c.strokeStyle = '#0d0f14'; c.lineWidth = 7; c.stroke();
  c.strokeStyle = '#e8ebf0'; c.lineWidth = 3.5; c.stroke();
  const [sx, sy] = P(0);
  c.fillStyle = '#ffcf3d';
  c.fillRect(sx - 4, sy - 4, 8, 8);
}

function pickFreeTrack() {
  g.freeTrackId = FREE_TRACKS[g.trackSel];
  g.mode = 'free';
  toDraft();
}

function backFromRace() {
  if (freeRace()) showTrackSelect();
  else showMenu();
}

function toDraft() {
  loadTrack();
  const rng = mulberry32((Date.now() ^ (save.trackLevel * 9973) ^ (save.attempt * 131)) >>> 0);
  if (freeRace()) {
    g.offers = rollOffers(rng, g.freeOffers, 1);
    g.freeOffers = g.offers.map((o) => o.id);
  } else {
    g.offers = rollOffers(rng, save.lastOffers || [], save.attempt);
    save.lastOffers = g.offers.map((o) => o.id);
    writeSave(save);
  }
  g.sel = 0;
  g.state = 'draft';
  hudEl.style.display = 'none';
  renderDraft();
}

function renderDraft() {
  const t = g.track;
  const cards = g.offers.map((u, i) => {
    const r = RARITY[u.rarity];
    return `
      <div class="card ${i === g.sel ? 'sel' : ''}" data-i="${i}" style="${i === g.sel ? `border-color:${r.color}` : ''}">
        <kbd class="key">${i + 1}</kbd>
        <div class="cat">${u.cat}</div>
        <div class="name">${u.name}</div>
        <div class="rar" style="color:${r.color}">${r.label}</div>
        <div class="desc">${u.desc}</div>
        ${u.cons ? `<div class="cons">${u.cons}</div>` : ''}
      </div>`;
  }).join('');
  const best = save.best[bestKey()];
  const d = diff();
  const easeTxt = !freeRace() && save.attempt > 1 && d.ease > 0
    ? `<p class="sub" style="margin:-12px 0 16px">Adversários ${Math.round(attemptEase(save.attempt) * d.ease * 100)}% mais lentos e largada mais à frente nesta tentativa${save.attempt >= 3 ? ' · pelo menos um bônus raro garantido' : ''}</p>`
    : (!freeRace() && save.attempt >= 3 ? '<p class="sub" style="margin:-12px 0 16px">Pelo menos um bônus raro garantido</p>' : '');
  showScreen(`
    <div class="box">
      <p class="sub" style="margin:0">${freeRace() ? 'Corrida livre · não muda a carreira' : `Carreira · pista ${t.level} · tentativa ${save.attempt}`} · Dificuldade ${d.name}</p>
      <h2>${t.name}</h2>
      <p class="sub">${Math.round(t.length)} m · ${laps()} voltas · ${GRID_SIZE} carros, você larga em ${playerGridSlot(d.id, freeRace() ? 1 : save.attempt) + 1}º${best ? ` · seu recorde: ${fmt(best)}` : ''}</p>
      ${easeTxt}
      <h2 style="font-size:22px">Escolha um bônus para esta tentativa</h2>
      <div class="cards">${cards}</div>
      <div class="actions"><span><kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> ou <kbd>←</kbd> <kbd>→</kbd> + <kbd>Enter</kbd> para escolher</span><span><kbd>Esc</kbd> ${freeRace() ? 'Trocar de pista' : 'Menu'}</span></div>
    </div>`);
  screenEl.querySelectorAll('.card').forEach((el) => {
    el.addEventListener('click', () => pickOffer(Number(el.dataset.i)));
  });
}

function bestKey() {
  return `${g.track.id}:${save.difficulty}`;
}

function pickOffer(i) {
  g.chosen = g.offers[i];
  setupRace();
}

// ---------- Corrida ----------
function setupRace() {
  const t = g.track;
  for (const c of g.cars) scene.remove(c.mesh);
  skids.clear();
  smoke.clear();
  g.cars = [];
  const rng = mulberry32(t.level * 1000 + save.attempt);
  const names = AI_NAMES.slice().sort(() => rng() - 0.5);
  const d = diff();
  const attempt = freeRace() ? 1 : save.attempt;
  const myColor = (CAR_PALETTE[save.color] || CAR_PALETTE[0]).hex;
  const myColor2 = (CAR_PALETTE[save.color2] || CAR_PALETTE[9]).hex;
  // pinturas dos adversários: sem repetir combinação e sem usar a sua cor principal
  const used = new Set();
  const rivalLivery = () => {
    for (let k = 0; k < 200; k++) {
      const p = CAR_PALETTE[Math.floor(rng() * CAR_PALETTE.length)].hex;
      const s2 = CAR_PALETTE[Math.floor(rng() * CAR_PALETTE.length)].hex;
      const l = Math.floor(rng() * LIVERIES.length);
      const key = `${p}:${s2}:${l}`;
      if (p === myColor || p === s2 || used.has(key)) continue;
      used.add(key);
      return { p, s2, l };
    }
    return { p: 0x888888, s2: 0xffffff, l: 0 };
  };
  const mySlot = playerGridSlot(d.id, attempt);
  g.gridPos = mySlot + 1;
  let slot = 0;
  for (let i = 0; i < GRID_SIZE - 1; i++) {
    if (slot === mySlot) slot++;
    const pace = aiPaceForLevel(t.level, i, attempt, d);
    const car = new CarPhysics(aiStats(() => buildStats(1), pace), t.gridSlot(slot++));
    car.ai = makeAi(rng, pace, d.noise);
    car.name = names[i % names.length];
    const lv = rivalLivery();
    car.color = lv.p;
    car.color2 = lv.s2;
    car.livery = lv.l;
    g.cars.push(car);
  }
  const stats = buildStats(save.driver.level, [g.chosen.id]);
  stats.wear *= d.wear;
  stats.wallLoss *= d.wallLoss;
  const player = new CarPhysics(stats, t.gridSlot(mySlot));
  player.name = 'Você';
  player.color = myColor;
  player.color2 = myColor2;
  player.livery = save.livery;
  player.isPlayer = true;
  g.cars.push(player);
  g.player = player;
  player.ai = makeAi(rng, 1);
  for (const c of g.cars) {
    c.mesh = makeCarMesh(c.color, c.color2, c.livery);
    if (c.isPlayer) {
      // anel claro no chão para achar o seu carro no meio do pelotão
      const ring = new THREE.Mesh(new THREE.RingGeometry(2.7, 3.1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45, depthWrite: false }));
      ring.position.y = 0.06;
      c.mesh.add(ring);
    }
    c.mesh.userData.spoiler.visible = c.s.downforce > 0;
    scene.add(c.mesh);
    syncMesh(c);
  }
  g.time = 0;
  g.countdown = 3.5;
  g.finishDelay = 0;
  g.wrongWay = 0;
  g.shake = 0;
  g.lastBeep = 4;
  g.lapsSeen = 0;
  g.state = 'countdown';
  hideScreen();
  hudEl.style.display = '';
  $('hud-br').innerHTML = `Piloto <b>Nv. ${save.driver.level}</b><br>Bônus: <b style="color:${RARITY[g.chosen.rarity].color}">${g.chosen.name}</b><br>${freeRace() ? `${t.name} · corrida livre` : `Carreira · pista ${t.level} · tentativa ${save.attempt}`}<br>Largada <b>${g.gridPos}º</b> de ${GRID_SIZE} · dificuldade <b>${d.name}</b>`;
}

function syncMesh(c) {
  c.mesh.position.set(c.x, 0, c.y);
  c.mesh.rotation.y = c.h;
  // leve inclinação na derrapagem
  c.mesh.rotation.z = Math.max(-0.08, Math.min(0.08, c.yawRate * c.speed * 0.002));
  const boosting = c.nitroTime > 0 || c.boostTime > 0;
  c.mesh.userData.flame.visible = boosting;
  if (boosting) c.mesh.userData.flame.scale.setScalar(0.8 + Math.random() * 0.4);
}

function playerInput() {
  return {
    throttle: down('KeyW', 'ArrowUp') ? 1 : 0,
    brake: down('KeyS', 'ArrowDown') ? 1 : 0,
    steer: (down('KeyD', 'ArrowRight') ? 1 : 0) - (down('KeyA', 'ArrowLeft') ? 1 : 0),
  };
}

function standings() {
  const t = g.track;
  return g.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.finishTime - b.finishTime;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress(t) - a.progress(t);
  });
}

const skidRng = mulberry32(5);
function stepRace(dt) {
  const t = g.track;
  if (g.state !== 'race') return; // largada: carros parados no grid
  for (const c of g.cars) {
    let inp;
    if (c.isPlayer && !c.finished && !AUTOPILOT) inp = playerInput();
    else inp = aiInput(c, t, c.ai, dt, skidRng, g.cars);
    if (c.isPlayer && c.finished) inp.throttle = Math.min(inp.throttle, 0.3);
    c.update(dt, inp, t, g.time, laps());
    if (c.isPlayer) {
      g.impact = Math.max(g.impact, c.wallImpact);
      if (c.padEvent) g.padHit = c.padEvent;
    }
  }
  slipstream(g.cars, dt);
  for (let i = 0; i < g.cars.length; i++)
    for (let j = i + 1; j < g.cars.length; j++) {
      const hitSpeed = collideCars(g.cars[i], g.cars[j]);
      if (hitSpeed > 0 && (g.cars[i].isPlayer || g.cars[j].isPlayer)) g.impact = Math.max(g.impact, hitSpeed * 0.8);
    }
  g.time += dt;
}

function emitSkids() {
  const dust = g.track.theme.shoulder;
  for (const c of g.cars) {
    const fx = Math.sin(c.h), fy = Math.cos(c.h);
    const rx = c.x - fx * 2, ry = c.y - fy * 2;
    if (c.slide > 2.5 && c.speed > 6) {
      for (const side of [-0.95, 0.95]) {
        skids.add(c.x - fx * 1.35 - fy * side, c.y - fy * 1.35 + fx * side, c.h);
      }
      const n = c.slide > 6 ? 2 : 1;
      for (let k = 0; k < n; k++) {
        smoke.emit(rx + (Math.random() - 0.5) * 2, ry + (Math.random() - 0.5) * 2,
          c.vx * 0.2 + (Math.random() - 0.5) * 3, c.vy * 0.2 + (Math.random() - 0.5) * 3, 0xe6e6e6, 0.9, 2.4);
      }
    }
    if (c.onGrass && c.speed > 8) {
      smoke.emit(rx, ry, c.vx * 0.15 + (Math.random() - 0.5) * 4, c.vy * 0.15 + (Math.random() - 0.5) * 4, dust, 0.7, 2.8);
    }
    if (c.boostTime > 0 || c.nitroTime > 0) {
      smoke.emit(c.x - fx * 3, c.y - fy * 3, -fx * 8, -fy * 8, 0x4fd2ff, 0.35, 1.6);
    }
  }
}

function endRace() {
  const t = g.track;
  const order = standings();
  const position = order.indexOf(g.player) + 1;
  const won = position === 1;
  const p = g.player;
  const xp = raceXp({ position, lapsDone: Math.min(laps(), p.lapTimes.length), cleanLaps: p.cleanLaps, trackLevel: t.level, won, attempt: freeRace() ? 2 : save.attempt });
  const d = diff();
  if (d.xp !== 1) { xp.diffMult = d.xp; xp.total = Math.round(xp.total * d.xp); }
  const prevLevel = save.driver.level;
  const gained = addXp(save.driver, xp.total);
  const bestLap = Math.min(...p.lapTimes);
  const leader = order[0];
  const prevBest = save.best[bestKey()];
  const newRecord = p.finished && (!prevBest || p.finishTime < prevBest);
  if (newRecord) save.best[bestKey()] = p.finishTime;
  g.results = { position, won, xp, gained, prevLevel, bestLap, newRecord, order, level: t.level, attempt: save.attempt,
    gap: !won && p.finished && leader.finished ? p.finishTime - leader.finishTime : null };
  // distância de quem não terminou até o jogador, para a tabela
  for (const c of order) c.metersBehind = Math.max(0, (p.progress(t) - c.progress(t)) * t.ds);
  g.results.free = freeRace();
  if (freeRace()) {
    // corrida avulsa: só XP e recorde
  } else if (won) {
    save.trackLevel++;
    save.attempt = 1;
    save.lastOffers = [];
  } else {
    save.attempt++;
  }
  writeSave(save);
  showResults();
}

function showResults() {
  g.state = 'results';
  g.msgTime = 0;
  $('center-msg').innerHTML = '';
  const r = g.results;
  const rows = r.order.map((c, i) => `
    <tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}º</td><td><span class="dot" style="background:#${c.color.toString(16).padStart(6, '0')}"></span>${c.name}</td>
    <td>${c.finished ? fmt(c.finishTime) : c.isPlayer ? 'desistiu' : `a ${Math.round(c.metersBehind)} m`}</td></tr>`).join('');
  const xpRows = r.xp.lines.map(([k, v]) => `<tr><td>${k}</td><td>+${v}</td></tr>`).join('')
    + (r.xp.mult > 1 ? `<tr><td>Multiplicador da pista ${r.level}</td><td>×${r.xp.mult.toFixed(2)}</td></tr>` : '')
    + (r.xp.diffMult ? `<tr><td>Dificuldade ${diff().name}</td><td>×${r.xp.diffMult.toFixed(2)}</td></tr>` : '')
    + `<tr><td><b>Total</b></td><td>+${r.xp.total} XP</td></tr>`;
  showScreen(`
    <div class="box">
      <h1 class="${r.won ? 'win' : 'lose'}">${r.won ? 'VITÓRIA!' : `${r.position}º LUGAR`}</h1>
      <p class="sub">${r.free ? (r.won ? `Você venceu: ${g.track.name}!` : 'Tente de novo com outro bônus.') : r.won ? `Pista ${r.level} vencida${r.attempt > 1 ? ` na tentativa ${r.attempt}` : ' de primeira'}. Próxima pista desbloqueada.` : `Só o 1º lugar avança${r.gap !== null ? `, e faltaram ${r.gap.toFixed(1)} s` : ''}. Você volta para esta mesma pista com outros bônus.`}</p>
      <table class="standings">${rows}</table>
      <p class="sub" style="margin:4px 0">Melhor volta ${fmt(r.bestLap)} ${r.newRecord ? '· <b style="color:var(--accent)">novo recorde da pista!</b>' : ''}</p>
      <table class="xp">${xpRows}</table>
      ${r.gained ? `<div class="levelup">Piloto subiu para o nível ${save.driver.level}! Carro mais rápido e mais fácil de controlar.</div>` : ''}
      ${driverPanel()}
      <div class="actions"><span><kbd>Enter</kbd> ${r.free ? 'Correr de novo nesta pista' : r.won ? 'Próxima pista' : 'Tentar de novo'}</span><span><kbd>Esc</kbd> ${r.free ? 'Trocar de pista' : 'Menu'}</span></div>
    </div>`);
}

function showPause() {
  g.resumeState = g.state;
  g.state = 'paused';
  showScreen(`
    <div class="box">
      <h1>PAUSA</h1>
      <div class="actions"><span><kbd>Esc</kbd> Continuar</span><span><kbd>R</kbd> Reiniciar a corrida</span><span><kbd>Q</kbd> Desistir (conta como derrota)</span></div>
    </div>`);
}

function forfeit() {
  // desistência: termina como último colocado, ganha só XP das voltas feitas
  const p = g.player;
  p.finished = false;
  p.lap = -1;
  endRace();
}

// ---------- HUD ----------
const mm = $('minimap');
const mmCtx = mm.getContext('2d');
let mmBase = null, mmTf = null;
function buildMinimap() {
  const t = g.track;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < t.N; i++) {
    minX = Math.min(minX, t.px[i]); maxX = Math.max(maxX, t.px[i]);
    minY = Math.min(minY, t.py[i]); maxY = Math.max(maxY, t.py[i]);
  }
  const size = mm.width, pad = 30;
  const sc = (size - pad * 2) / Math.max(maxX - minX, maxY - minY);
  const ox = (size - (maxX - minX) * sc) / 2, oy = (size - (maxY - minY) * sc) / 2;
  mmTf = (x, y) => [ox + (x - minX) * sc, oy + (y - minY) * sc];
  mmBase = document.createElement('canvas');
  mmBase.width = mmBase.height = size;
  const c = mmBase.getContext('2d');
  c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i <= t.N; i++) {
    const [x, y] = mmTf(t.px[i % t.N], t.py[i % t.N]);
    i ? c.lineTo(x, y) : c.moveTo(x, y);
  }
  c.strokeStyle = '#ffffff30'; c.lineWidth = 18; c.stroke();
  c.strokeStyle = '#d6dbe4'; c.lineWidth = 8; c.stroke();
  for (const pad of t.pads) {
    const [x, y] = mmTf(t.px[pad.idx] + t.nx[pad.idx] * pad.lat, t.py[pad.idx] + t.ny[pad.idx] * pad.lat);
    c.fillStyle = pad.kind === 'boost' ? '#4fd2ff' : '#6b4fa8';
    c.beginPath(); c.arc(x, y, 5, 0, Math.PI * 2); c.fill();
  }
  const [sx, sy] = mmTf(t.px[0], t.py[0]);
  c.fillStyle = '#ffcf3d';
  c.fillRect(sx - 6, sy - 6, 12, 12);
}

function drawMinimap() {
  mmCtx.clearRect(0, 0, mm.width, mm.height);
  mmCtx.drawImage(mmBase, 0, 0);
  for (const c of g.cars) {
    const [x, y] = mmTf(c.x, c.y);
    mmCtx.beginPath();
    mmCtx.arc(x, y, c.isPlayer ? 11 : 8, 0, Math.PI * 2);
    mmCtx.fillStyle = '#' + c.color.toString(16).padStart(6, '0');
    mmCtx.fill();
    if (c.isPlayer) { mmCtx.lineWidth = 3; mmCtx.strokeStyle = '#fff'; mmCtx.stroke(); }
  }
}

function updateHud() {
  const p = g.player;
  const order = standings();
  const pos = order.indexOf(p) + 1;
  $('pos').innerHTML = `${pos}º<small style="font-size:16px;color:var(--muted)">/${g.cars.length}</small>`;
  $('lap').textContent = `${Math.max(1, Math.min(laps(), p.lap))}/${laps()}`;
  $('time').textContent = fmt(g.time);
  $('bestlap').textContent = p.lapTimes.length ? fmt(Math.min(...p.lapTimes)) : '—';
  $('speed').innerHTML = `${Math.round(p.speed * 3.6)} <small>km/h</small>`;
  const tp = Math.round(p.tire * 100);
  $('tirepct').textContent = `${tp}%`;
  const bar = $('tirebar');
  bar.style.width = `${tp}%`;
  bar.style.background = tp > 60 ? 'var(--good)' : tp > 35 ? 'var(--accent)' : 'var(--bad)';
  $('draft').style.opacity = p.draft > 0.15 ? Math.min(1, 0.4 + p.draft) : 0;
  $('draftbar').style.width = `${Math.round(p.draft * 100)}%`;
  $('nitro').innerHTML = p.nitro > 0 || p.s.nitroCharges > 0 ? '<span></span>'.repeat(p.nitro) || '—' : '—';
  drawMinimap();

  let msg = '';
  if (g.state === 'countdown') {
    const n = Math.ceil(g.countdown - 0.5);
    msg = n > 0 ? `${n}` : 'JÁ!';
  } else if (g.msgTime > 0) {
    msg = g.msg;
  } else if (g.wrongWay > 1.2) {
    msg = 'CONTRAMÃO!<small>aperte R para voltar à pista</small>';
  }
  $('center-msg').innerHTML = msg;
}

// ---------- Câmera ----------
function updateCamera(dt) {
  const p = g.player;
  const speed = p ? p.speed : 0;
  const height = 70 + speed * 0.9;
  if (p) {
    const ahead = 0.55;
    const tx = p.x + p.vx * ahead, tz = p.y + p.vy * ahead;
    const k = 1 - Math.exp(-dt * 5);
    camLook.x += (tx - camLook.x) * k;
    camLook.z += (tz - camLook.z) * k;
    let want;
    if (g.rotateCam) {
      const fx = Math.sin(p.h), fy = Math.cos(p.h);
      want = new THREE.Vector3(camLook.x - fx * height * 0.45, height, camLook.z - fy * height * 0.45);
    } else {
      want = new THREE.Vector3(camLook.x, height, camLook.z + height * 0.22);
    }
    camPos.lerp(want, 1 - Math.exp(-dt * 4));
    g.shake *= Math.exp(-dt * 7);
    sun.position.set(p.x + 40, 90, p.y + 30);
    sun.target.position.set(p.x, 0, p.y);
  }
  camera.position.copy(camPos);
  camera.lookAt(camLook);
  if (g.shake > 0.02) {
    camera.position.x += (Math.random() - 0.5) * g.shake;
    camera.position.z += (Math.random() - 0.5) * g.shake;
  }
}

// ---------- Loop ----------
let last = performance.now();
let acc = 0;
let skidTimer = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (hit('KeyM') && (g.state === 'race' || g.state === 'countdown' || g.state === 'paused')) engine.toggle();

  switch (g.state) {
    case 'title': {
      const prev = g.menuSel;
      if (hit('ArrowUp', 'KeyW', 'ArrowDown', 'KeyS')) g.menuSel = 1 - g.menuSel;
      if (prev !== g.menuSel) renderTitle();
      if (hit('Enter', 'NumpadEnter', 'Space')) activateTitleRow();
      else if (hit('Digit1', 'Numpad1')) { g.menuSel = 0; activateTitleRow(); }
      else if (hit('Digit2', 'Numpad2')) { g.menuSel = 1; activateTitleRow(); }
      break;
    }
    case 'setup': {
      const rows = setupRows();
      const prev = g.setupSel;
      let k = rows.indexOf(SETUP_ROWS[g.setupSel]);
      if (hit('ArrowUp', 'KeyW')) k = (k + rows.length - 1) % rows.length;
      if (hit('ArrowDown', 'KeyS')) k = (k + 1) % rows.length;
      g.setupSel = SETUP_ROWS.indexOf(rows[k]);
      if (prev !== g.setupSel) { g.confirmNew = false; renderSetup(); }
      if (hit('ArrowLeft', 'KeyA')) changeSetupOption(-1);
      else if (hit('ArrowRight', 'KeyD')) changeSetupOption(1);
      else if (hit('Enter', 'NumpadEnter', 'Space')) activateSetupRow();
      else if (hit('Escape')) showMenu();
      break;
    }
    case 'tracks': {
      const prev = g.trackSel, n = FREE_TRACKS.length;
      const cols = Math.max(1, Math.round(screenEl.querySelector('.tracks')?.clientWidth / 250) || 4);
      if (hit('ArrowLeft', 'KeyA')) g.trackSel = (g.trackSel + n - 1) % n;
      if (hit('ArrowRight', 'KeyD')) g.trackSel = (g.trackSel + 1) % n;
      if (hit('ArrowUp', 'KeyW')) g.trackSel = Math.max(0, g.trackSel - cols);
      if (hit('ArrowDown', 'KeyS')) g.trackSel = Math.min(n - 1, g.trackSel + cols);
      if (prev !== g.trackSel) renderTrackSelect();
      if (hit('Enter', 'NumpadEnter')) pickFreeTrack();
      else if (hit('Escape')) showSetup();
      break;
    }
    case 'draft': {
      const prev = g.sel;
      if (hit('ArrowLeft', 'KeyA')) g.sel = (g.sel + 2) % 3;
      if (hit('ArrowRight', 'KeyD')) g.sel = (g.sel + 1) % 3;
      if (prev !== g.sel) renderDraft();
      if (hit('Digit1', 'Numpad1')) pickOffer(0);
      else if (hit('Digit2', 'Numpad2')) pickOffer(1);
      else if (hit('Digit3', 'Numpad3')) pickOffer(2);
      else if (hit('Enter', 'NumpadEnter')) pickOffer(g.sel);
      else if (hit('Escape')) backFromRace();
      break;
    }
    case 'countdown':
    case 'race': {
      if (hit('Escape')) { showPause(); break; }
      if (g.state === 'countdown') {
        g.countdown -= dt;
        const n = Math.ceil(g.countdown - 0.5);
        if (n < g.lastBeep && n > 0) { g.lastBeep = n; engine.beep(440, 0.18); }
        if (g.countdown <= 0.5) { g.state = 'race'; engine.beep(880, 0.4); }
      }
      const p = g.player;
      if (g.state === 'race') {
        if (hit('ShiftLeft', 'ShiftRight') && p.fireNitro()) flash('NITRO!', 0.8);
        if (hit('KeyR')) p.resetToTrack(g.track);
      }
      if (hit('KeyC')) g.rotateCam = !g.rotateCam;
      acc += dt;
      while (acc >= DT) { stepRace(DT); acc -= DT; }
      skidTimer += dt;
      if (skidTimer > 0.03) { skidTimer = 0; emitSkids(); }
      if (g.impact > 4) {
        g.shake = Math.min(3, g.shake + g.impact * 0.12);
        engine.thud(g.impact);
        if (g.impact > 10) flash('BATIDA!', 0.6);
      }
      g.impact = 0;
      if (g.padHit === 'boost') { engine.beep(300, 0.45, 'sine', 0.06, 700); flash('TURBO!', 0.6); }
      if (g.padHit === 'oil' && p.s.oilEffect > 0.3) flash('ÓLEO!', 0.8);
      g.padHit = null;
      if (p.lapTimes.length > g.lapsSeen && !p.finished) {
        const lt = p.lapTimes[p.lapTimes.length - 1];
        const prevBest = Math.min(...p.lapTimes.slice(0, -1));
        const delta = isFinite(prevBest) ? ` <small>${lt < prevBest ? 'melhor volta' : `+${(lt - prevBest).toFixed(1)} s`}</small>` : '';
        flash(`VOLTA ${p.lapTimes.length}: ${fmt(lt)}${delta}`, 2);
        if (p.lap === laps()) setTimeout(() => flash('ÚLTIMA VOLTA!'), 1800);
      }
      g.lapsSeen = p.lapTimes.length;
      // contramão: velocidade contra o sentido da pista
      const t = g.track;
      const along = p.vx * t.tx[p.idx] + p.vy * t.ty[p.idx];
      g.wrongWay = along < -3 ? g.wrongWay + dt : 0;
      if (g.msgTime > 0) g.msgTime -= dt;
      if (p.finished) {
        if (g.finishDelay === 0) flash(standings()[0] === p ? 'VITÓRIA!' : 'CHEGADA', 3);
        g.finishDelay += dt;
        if (g.finishDelay > 2.2) endRace();
      }
      smoke.update(dt);
      updateHud();
      break;
    }
    case 'paused':
      if (hit('Escape')) { hideScreen(); g.state = g.resumeState || 'race'; }
      else if (hit('KeyQ')) forfeit();
      else if (hit('KeyR')) setupRace();
      break;
    case 'results':
      if (hit('Enter', 'NumpadEnter')) toDraft();
      else if (hit('Escape')) backFromRace();
      break;
  }

  for (const c of g.cars) syncMesh(c);
  if (g.state === 'title' || g.state === 'setup' || g.state === 'tracks' || g.state === 'draft') {
    // câmera passeando devagar sobre a pista
    const t = g.track;
    const i = Math.floor((now / 1000) * 12) % t.N;
    camLook.lerp(new THREE.Vector3(t.px[i], 0, t.py[i]), 1 - Math.exp(-dt * 0.8));
    camPos.lerp(new THREE.Vector3(camLook.x, 130, camLook.z + 60), 1 - Math.exp(-dt * 0.8));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
  } else {
    updateCamera(dt);
  }
  engine.update(g.state === 'race' || g.state === 'countdown' ? g.player : null, dt);
  renderer.render(scene, camera);
  pressed.clear();
  requestAnimationFrame(frame);
}

showMenu();
window.__started = true;
requestAnimationFrame(frame);
if (AUTOPILOT) window.__game = g;
// dentro de um iframe o teclado só chega depois de um clique
window.addEventListener('pointerdown', () => { window.focus(); engine.unlock(); });
