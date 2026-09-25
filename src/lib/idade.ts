/**
 * A pergunta da idade, e o que se faz com a resposta.
 *
 * O site tem mesas de blackjack, de poker e de roleta. Joga-se com torrões,
 * que não valem nada, não se compram nem se trocam por nada, mas são na mesma
 * jogos de casino e é por isso que se pergunta à entrada.
 *
 * Isto não prova idade nenhuma: quem responde o que lhe apetecer passa à
 * mesma. Nenhum sítio destes prova, com ou sem data de nascimento. O que faz é
 * perguntar às claras e respeitar a resposta, e é para isso que serve.
 *
 * A resposta fica só neste aparelho. Não vai para o servidor, não vai para
 * lado nenhum, e não é ligada a nome nenhum.
 */

const CHAVE = 'mdl.idade';

export type Resposta = 'sim' | 'nao';

/** O que a pessoa já respondeu, ou nada se for a primeira vez que cá vem. */
export function idadeSabida(): Resposta | null {
  try {
    const posto = localStorage.getItem(CHAVE);
    return posto === 'sim' || posto === 'nao' ? posto : null;
  } catch {
    /* Sem sítio para guardar, pergunta-se outra vez na próxima visita. Chatear
       alguém de cada vez é melhor do que deixar a porta aberta. */
    return null;
  }
}

export function guardarIdade(resposta: Resposta) {
  try {
    localStorage.setItem(CHAVE, resposta);
  } catch {
    /* vale para esta visita e mais nada */
  }
}

/** As páginas que ficam fechadas a quem disse que ainda não tem 18. São as
 *  mesas de apostas e mais nada: o Cusco, a Colherada, o jogo e a Leader Board
 *  não têm nada com isto. */
export const SO_PARA_MAIORES = ['blackjack', 'poker', 'roleta', 'apostas'];
