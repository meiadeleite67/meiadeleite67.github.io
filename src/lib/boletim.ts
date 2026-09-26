/**
 * O boletim, guardado fora da página que o mostra.
 *
 * Enquanto o detalhe de um jogo era um popup dentro da lista das apostas, o
 * boletim podia viver dentro dessa página: nunca se saía de lá. Agora o detalhe
 * é uma página com endereço próprio, e uma escolha feita nela tinha de
 * sobreviver à viagem de volta. Vive aqui, no armazenamento do browser.
 *
 * Isto também arruma uma coisa que estava mal e ninguém tinha notado: quem
 * escolhia três jogos e recarregava a página sem querer perdia os três. Agora
 * não.
 *
 * O que está aqui é só a escolha, nunca o nome nem o passe: quem aposta
 * prova-o ao servidor no momento de apostar, e uma escolha guardada no browser
 * não é uma aposta feita.
 */
import type { Escolha, Escolhida, JogoDeApostas } from './tipos';

const ONDE = 'mdl-boletim';

/** Quantas pernas cabem numa múltipla. É o servidor que manda nisto, e este
 *  número é só para não se deixar a pessoa escolher o que vai ser recusado. */
export const PERNAS_NO_MAXIMO = 8;

export function lerBoletim(): Escolhida[] {
  try {
    const cru = window.localStorage.getItem(ONDE);
    if (!cru) return [];
    const lista = JSON.parse(cru);
    if (!Array.isArray(lista)) return [];
    /* Só entra o que tem a forma certa: um boletim guardado por uma versão
       antiga do site não pode rebentar a página de quem volta. */
    return lista.filter(
      (e) => e && e.jogo && typeof e.jogo.id === 'string' && typeof e.escolha === 'string'
    );
  } catch {
    /* Sem armazenamento, o boletim vive só nesta página e nada se perde além
       da viagem. Uma janela privada não pode ficar sem apostas. */
    return [];
  }
}

export function guardarBoletim(boletim: Escolhida[]) {
  try {
    if (boletim.length === 0) window.localStorage.removeItem(ONDE);
    else window.localStorage.setItem(ONDE, JSON.stringify(boletim));
  } catch {
    /* como acima */
  }
}

/**
 * Põe ou tira uma escolha, com as regras do boletim.
 *
 * Duas escolhas do mesmo jogo não podem ir juntas na mesma múltipla, por isso a
 * segunda substitui a primeira; a mesma escolha outra vez tira-a. É a mesma
 * regra dos dois lados, e está escrita uma vez só.
 */
export function comEsta(
  antes: Escolhida[],
  jogo: JogoDeApostas,
  escolha: Escolha
): { boletim: Escolhida[]; entrou: boolean; cheio: boolean } {
  const igual = antes.find((e) => e.jogo.id === jogo.id && e.escolha === escolha);
  if (igual) return { boletim: antes.filter((e) => e !== igual), entrou: false, cheio: false };

  const semEste = antes.filter((e) => e.jogo.id !== jogo.id);
  if (semEste.length >= PERNAS_NO_MAXIMO)
    return { boletim: antes, entrou: false, cheio: true };

  return { boletim: [...semEste, { jogo, escolha }], entrou: true, cheio: false };
}

/** A cotação de uma múltipla: as pernas multiplicam-se. */
export const cotacaoDe = (boletim: Escolhida[]) =>
  Number(
    boletim.reduce((t, e) => t * (e.jogo.cotacoes?.[e.escolha] || 1), 1).toFixed(2)
  );
