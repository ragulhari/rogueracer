// Pinturas: cada carro tem cor principal (P), cor secundária (S) e um desenho que diz onde vai cada cor.
// Partes: bico, monocoque, laterais, motor, barbatana, placas das asas, detalhes (faixa da asa e capacete).
export const LIVERIES = [
  { id: 'classica', name: 'Clássica', parts: {}, trim: 'S' },
  { id: 'faixa', name: 'Faixa central', parts: {}, trim: 'S', stripes: [0] },
  { id: 'listras', name: 'Listras duplas', parts: {}, trim: 'S', stripes: [-0.19, 0.19] },
  { id: 'meio', name: 'Meio a meio', parts: { pod: 'S', engine: 'S', fin: 'S', endR: 'S' }, trim: 'P' },
  { id: 'laterais', name: 'Laterais', parts: { pod: 'S', endF: 'S', endR: 'S' }, trim: 'S' },
  { id: 'bico', name: 'Bico e motor', parts: { nose: 'S', engine: 'S', fin: 'S' }, trim: 'P' },
];

export function liveryColors(liveryIdx, primary, secondary) {
  const l = LIVERIES[liveryIdx] || LIVERIES[0];
  const pick = (k) => (k === 'S' ? secondary : primary);
  const part = (name) => pick(l.parts[name] || 'P');
  return { part, trim: pick(l.trim), stripe: secondary, stripes: l.stripes || [] };
}
