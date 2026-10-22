// Experiência do piloto (permanente) e montagem dos atributos do carro.
import { byId } from './upgrades.js';

export const MAX_DRIVER_LEVEL = 30;

export function baseStats() {
  return {
    topSpeed: 46, // m/s (~165 km/h)
    power: 1, // multiplicador de aceleração
    mass: 1000, // kg
    grip: 1, // multiplicador de aderência lateral
    steer: 1, // multiplicador de resposta da direção
    brake: 1,
    wear: 1, // multiplicador de desgaste de pneu
    downforce: 0, // aderência extra proporcional à velocidade
    offroad: 1, // quanto maior, menos penalidade na grama
    wallLoss: 1, // perda de velocidade em batidas
    nitroCharges: 0,
    draftPower: 1, // força do vácuo
    draftRange: 1, // alcance do vácuo
    draftCharge: false, // vácuo recarrega nitro
    oilEffect: 1, // quanto a mancha de óleo afeta (0 = imune)
    padBoost: 1, // duração do impulso das placas de turbo
  };
}

// Bônus do piloto por nível: cada nível deixa o carro mais fácil de controlar e mais rápido.
export function driverBonus(level) {
  const l = Math.min(level, MAX_DRIVER_LEVEL) - 1;
  return {
    grip: 1 + l * 0.018,
    steer: 1 + l * 0.02,
    topSpeed: 1 + l * 0.012,
    power: 1 + l * 0.018,
    brake: 1 + l * 0.015,
    stability: Math.min(1, l * 0.04), // amortece derrapagens indesejadas
  };
}

export function buildStats(driverLevel, upgradeIds = []) {
  const s = baseStats();
  const d = driverBonus(driverLevel);
  s.grip *= d.grip;
  s.steer *= d.steer;
  s.topSpeed *= d.topSpeed;
  s.power *= d.power;
  s.brake *= d.brake;
  s.stability = d.stability;
  for (const id of upgradeIds) byId(id)?.apply(s);
  return s;
}

export function xpToNext(level) {
  return 120 + 70 * (level - 1);
}

// Retorna a XP ganha numa corrida e um detalhamento para a tela de resultado.
export function raceXp({ position, lapsDone, cleanLaps, trackLevel, won, attempt }) {
  const posXp = [140, 80, 50, 30][position - 1] ?? 20;
  const lines = [
    [`${position}º lugar`, posXp],
    [`Voltas completas (${lapsDone})`, lapsDone * 10],
  ];
  if (cleanLaps > 0) lines.push([`Voltas limpas (${cleanLaps})`, cleanLaps * 15]);
  if (won && attempt === 1) lines.push(['Vitória de primeira', 50]);
  const mult = 1 + (trackLevel - 1) * 0.15;
  const subtotal = lines.reduce((s, l) => s + l[1], 0);
  return { lines, mult, total: Math.round(subtotal * mult) };
}

export function addXp(driver, amount) {
  let levelsGained = 0;
  driver.xp += amount;
  while (driver.level < MAX_DRIVER_LEVEL && driver.xp >= xpToNext(driver.level)) {
    driver.xp -= xpToNext(driver.level);
    driver.level++;
    levelsGained++;
  }
  if (driver.level >= MAX_DRIVER_LEVEL) driver.xp = 0;
  return levelsGained;
}

const SAVE_KEY = 'rogueracer-save-v1';
const OLD_SAVE_KEY = 'racing-roguelike-save-v1'; // nome antigo do jogo: o progresso é migrado na primeira abertura

export function defaultSave() {
  return { driver: { level: 1, xp: 0 }, trackLevel: 1, attempt: 1, best: {}, lastOffers: [], color: 0, color2: 9, livery: 1, difficulty: 'normal', volume: 2 };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(OLD_SAVE_KEY);
    if (raw) return { ...defaultSave(), ...JSON.parse(raw) };
  } catch (e) { /* sem armazenamento disponível */ }
  return defaultSave();
}

export function writeSave(save) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignora */ }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); localStorage.removeItem(OLD_SAVE_KEY); } catch (e) { /* ignora */ }
}
