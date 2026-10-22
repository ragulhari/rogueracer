// Tamanho do grid e posição de largada do jogador.
export const GRID_SIZE = 20;

const BASE_SLOT = { facil: 5, normal: 7, dificil: 9, insano: 11 };

// O jogador larga no meio do pelotão (mais atrás nas dificuldades altas)
// e sobe duas posições a cada nova tentativa na mesma pista. Os adversários mais rápidos largam na frente.
export function playerGridSlot(diffId = 'normal', attempt = 1) {
  return Math.max(0, (BASE_SLOT[diffId] ?? 7) - 2 * (attempt - 1));
}
