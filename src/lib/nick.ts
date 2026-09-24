/**
 * O nickname de cada um, e o passe que prova que ele é mesmo dele.
 *
 * O nome é defendido por um PIN, escolhido por quem o usa. O PIN escreve-se
 * uma vez em cada aparelho; em troca o servidor devolve um passe, e é o passe
 * que fica guardado aqui. Assim o PIN não anda a viajar a cada jogada, e quem
 * mudar de telemóvel volta a entrar no seu nome com o PIN, o que com a chave
 * antiga não dava: ela vivia só no browser onde o nome tinha sido estreado.
 *
 * Vive aqui, e não dentro do blackjack, porque o poker senta à mesa com o
 * mesmo nome e prova-o da mesma maneira.
 */
import { guardar, lido } from './dados';

const PASSES = 'mdl.passes';
const NOME = 'mdl.nome';
/** O sítio onde viviam as chaves antigas. Já não abre nada. */
const CHAVES_ANTIGAS = 'mdl.chaves';

function passesGuardados(): Record<string, string> {
  try {
    const g = JSON.parse(lido(PASSES) || '{}');
    return g && typeof g === 'object' ? g : {};
  } catch {
    return {};
  }
}

export const passeDe = (nome: string) => passesGuardados()[nome] || '';

export const guardarPasse = (nome: string, passe: string) =>
  guardar(PASSES, JSON.stringify({ ...passesGuardados(), [nome]: passe }));

export function esquecerPasse(nome: string) {
  const todos = passesGuardados();
  delete todos[nome];
  guardar(PASSES, JSON.stringify(todos));
}

export const nomeGuardado = () => (lido(NOME) || '').trim();

export const guardarNome = (nome: string) => guardar(NOME, nome);

/** Havia aqui uma chave deste nome, do tempo em que o nome era do browser? É
 *  só para se poder dizer a quem está a chegar porque é que agora lhe pedem um
 *  PIN. A chave em si não serve para mais nada. */
export function tinhaChaveAntiga(nome: string): boolean {
  try {
    const g = JSON.parse(lido(CHAVES_ANTIGAS) || '{}');
    return !!(g && typeof g === 'object' && g[nome]);
  } catch {
    return false;
  }
}
