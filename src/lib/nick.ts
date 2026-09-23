/**
 * O nickname de cada um, e a chave que prova que ele é mesmo dele.
 *
 * Quem estreia um nome recebe do servidor uma chave, uma única vez, e ela fica
 * guardada só neste browser. É ela que impede que outra pessoa escreva o mesmo
 * nickname e jogue com os torrões alheios.
 *
 * Vive aqui, e não dentro do blackjack, porque o poker precisa exactamente do
 * mesmo: à mesa de poker senta-se com o nome do quadro de honra, e prova-se
 * com a mesma chave.
 */
import { guardar, lido } from './dados';

const CHAVES = 'mdl.chaves';
const NOME = 'mdl.nome';

export function chavesGuardadas(): Record<string, string> {
  try {
    const g = JSON.parse(lido(CHAVES) || '{}');
    return g && typeof g === 'object' ? g : {};
  } catch {
    return {};
  }
}

export const chaveDe = (nome: string) => chavesGuardadas()[nome] || '';

export const guardarChave = (nome: string, chave: string) =>
  guardar(CHAVES, JSON.stringify({ ...chavesGuardadas(), [nome]: chave }));

export const nomeGuardado = () => (lido(NOME) || '').trim();

export const guardarNome = (nome: string) => guardar(NOME, nome);
