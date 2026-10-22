// Níveis de dificuldade: mexem no ritmo dos adversários, nos erros deles e na XP ganha.
export const DIFFICULTIES = [
  { id: 'facil', name: 'Fácil', ai: -0.04, ease: 1, noise: 1.4, xp: 0.75, wear: 1, wallLoss: 1,
    desc: 'Adversários mais lentos e com mais erros.' },
  { id: 'normal', name: 'Normal', ai: 0.05, ease: 1, noise: 1, xp: 1, wear: 1, wallLoss: 1,
    desc: 'Adversários rápidos. Perder deixa a próxima tentativa um pouco mais fácil.' },
  { id: 'dificil', name: 'Difícil', ai: 0.1, ease: 0.5, noise: 0.6, xp: 1.3, wear: 1.25, wallLoss: 1.15,
    desc: 'Adversários muito rápidos, seus pneus gastam mais. XP ×1,3.' },
  { id: 'insano', name: 'Insano', ai: 0.16, ease: 0, noise: 0.25, xp: 1.7, wear: 1.5, wallLoss: 1.4,
    desc: 'Adversários quase perfeitos, batidas custam caro e perder não ajuda. XP ×1,7.' },
];

export function difficultyById(id) {
  return DIFFICULTIES.find((d) => d.id === id) || DIFFICULTIES[1];
}
