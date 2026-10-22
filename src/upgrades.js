// Bônus oferecidos antes de cada tentativa. Cada um altera os atributos do carro só naquela corrida.
import { pickWeighted } from './rng.js';

export const RARITY = {
  comum: { label: 'Comum', weight: 60, color: '#9aa4b2' },
  raro: { label: 'Raro', weight: 30, color: '#3d9bff' },
  epico: { label: 'Épico', weight: 10, color: '#c45cff' },
};

export const UPGRADES = [
  { id: 'carbono', cat: 'Peso', name: 'Chassi de carbono', rarity: 'raro',
    desc: 'Peso −15%: acelera e freia melhor.', cons: 'Batidas na mureta custam mais velocidade.',
    apply: (s) => { s.mass *= 0.85; s.wallLoss *= 1.35; } },
  { id: 'sem-banco', cat: 'Peso', name: 'Interior depenado', rarity: 'comum',
    desc: 'Peso −8%.', cons: null,
    apply: (s) => { s.mass *= 0.92; } },
  { id: 'macios', cat: 'Pneus', name: 'Pneus macios', rarity: 'comum',
    desc: 'Aderência +22%.', cons: 'Desgaste 2,5× mais rápido.',
    apply: (s) => { s.grip *= 1.22; s.wear *= 2.5; } },
  { id: 'slicks', cat: 'Pneus', name: 'Slicks de corrida', rarity: 'epico',
    desc: 'Aderência +35%.', cons: 'Desgaste 3,5× e péssimos na grama.',
    apply: (s) => { s.grip *= 1.35; s.wear *= 3.5; s.offroad *= 0.6; } },
  { id: 'duros', cat: 'Pneus', name: 'Pneus de composto duro', rarity: 'comum',
    desc: 'Quase não desgastam (−70%).', cons: 'Aderência −6%.',
    apply: (s) => { s.wear *= 0.3; s.grip *= 0.94; } },
  { id: 'turbo', cat: 'Motor', name: 'Turbocompressor', rarity: 'raro',
    desc: 'Potência +22%, velocidade máx. +4%.', cons: null,
    apply: (s) => { s.power *= 1.22; s.topSpeed *= 1.04; } },
  { id: 'comando', cat: 'Motor', name: 'Comando bravo', rarity: 'comum',
    desc: 'Velocidade máx. +9%.', cons: 'Potência −6% em baixa.',
    apply: (s) => { s.topSpeed *= 1.09; s.power *= 0.94; } },
  { id: 'v8', cat: 'Motor', name: 'Swap de V8', rarity: 'epico',
    desc: 'Potência +35%, velocidade máx. +8%.', cons: 'Peso +8%.',
    apply: (s) => { s.power *= 1.35; s.topSpeed *= 1.08; s.mass *= 1.08; } },
  { id: 'aerofolio', cat: 'Aerodinâmica', name: 'Aerofólio alto', rarity: 'comum',
    desc: 'Downforce: muito mais aderência em alta velocidade.', cons: 'Velocidade máx. −4%.',
    apply: (s) => { s.downforce += 0.4; s.topSpeed *= 0.96; } },
  { id: 'liso', cat: 'Aerodinâmica', name: 'Carenagem lisa', rarity: 'comum',
    desc: 'Velocidade máx. +7%.', cons: 'Aderência −4%.',
    apply: (s) => { s.topSpeed *= 1.07; s.grip *= 0.96; } },
  { id: 'freios', cat: 'Freios', name: 'Freios de cerâmica', rarity: 'comum',
    desc: 'Frenagem +45%.', cons: null,
    apply: (s) => { s.brake *= 1.45; } },
  { id: 'direcao', cat: 'Direção', name: 'Caixa de direção rápida', rarity: 'comum',
    desc: 'Resposta da direção +22%.', cons: null,
    apply: (s) => { s.steer *= 1.22; } },
  { id: 'nitro', cat: 'Nitro', name: 'Kit de nitro', rarity: 'raro',
    desc: '3 cargas de nitro (Shift).', cons: null,
    apply: (s) => { s.nitroCharges += 3; } },
  { id: 'drift', cat: 'Vácuo', name: 'Recuperação no vácuo', rarity: 'raro',
    desc: '1 carga de nitro, e andar no vácuo recarrega o nitro.', cons: null,
    apply: (s) => { s.nitroCharges += 1; s.draftCharge = true; } },
  { id: 'vacuo', cat: 'Vácuo', name: 'Asa de baixo arrasto', rarity: 'comum',
    desc: 'Vácuo 2× mais forte.', cons: 'Aderência −3%.',
    apply: (s) => { s.draftPower *= 2; s.grip *= 0.97; } },
  { id: 'vacuo-longo', cat: 'Vácuo', name: 'Sensor de esteira', rarity: 'comum',
    desc: 'Pega o vácuo de mais longe (alcance +70%).', cons: null,
    apply: (s) => { s.draftRange *= 1.7; } },
  { id: 'sulcos', cat: 'Pneus', name: 'Pneus com sulcos fundos', rarity: 'comum',
    desc: 'Óleo na pista quase não afeta (−80%).', cons: 'Aderência −3%.',
    apply: (s) => { s.oilEffect *= 0.2; s.grip *= 0.97; } },
  { id: 'ima', cat: 'Nitro', name: 'Injeção sincronizada', rarity: 'comum',
    desc: 'Placas de turbo empurram 2× mais tempo.', cons: null,
    apply: (s) => { s.padBoost *= 2; } },
  { id: 'parachoque', cat: 'Carroceria', name: 'Para-choque reforçado', rarity: 'comum',
    desc: 'Perde 60% menos velocidade em batidas.', cons: 'Peso +4%.',
    apply: (s) => { s.wallLoss *= 0.4; s.mass *= 1.04; } },
  { id: 'rally', cat: 'Suspensão', name: 'Suspensão de rali', rarity: 'comum',
    desc: 'Perde bem menos velocidade fora da pista.', cons: null,
    apply: (s) => { s.offroad *= 1.7; } },
  { id: 'lastro', cat: 'Suspensão', name: 'Lastro baixo', rarity: 'raro',
    desc: 'Aderência +14% e direção mais estável.', cons: 'Peso +6%.',
    apply: (s) => { s.grip *= 1.14; s.steer *= 1.05; s.mass *= 1.06; } },
];

// Escolhe 3 bônus de categorias diferentes, evitando os da tentativa anterior.
// Quanto mais tentativas na mesma pista, mais chance de raros e épicos (a partir da 3ª, pelo menos um).
export function rollOffers(rng, exclude = [], attempt = 1) {
  const luck = 1 + Math.min(4, attempt - 1) * 0.5;
  const weight = (x) => RARITY[x.rarity].weight * (x.rarity === 'comum' ? 1 : luck);
  let pool = UPGRADES.filter((u) => !exclude.includes(u.id));
  if (pool.length < 3) pool = UPGRADES.slice();
  const picks = [];
  const usedCats = new Set();
  let guard = 0;
  while (picks.length < 3 && guard++ < 200) {
    const mustRare = attempt >= 3 && picks.length === 2 && picks.every((p) => p.rarity === 'comum');
    const from = mustRare ? pool.filter((x) => x.rarity !== 'comum' && !usedCats.has(x.cat)) : pool;
    const u = pickWeighted(rng, from.length ? from : pool, weight);
    if (picks.includes(u) || (usedCats.has(u.cat) && guard < 100)) continue;
    picks.push(u);
    usedCats.add(u.cat);
  }
  return picks;
}

export function byId(id) {
  return UPGRADES.find((u) => u.id === id);
}
