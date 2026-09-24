/**
 * A roleta, do lado de cá.
 *
 * É uma roleta europeia: trinta e sete casas, de zero a trinta e seis, com um
 * zero só. A americana tem dois zeros e come o dobro a quem joga, e não havia
 * razão nenhuma para escolher essa.
 *
 * O número sai aqui, e sai do gerador criptográfico. O site só diz onde pôs as
 * fichas e mostra o que recebe: não tem como dizer que ganhou, nem como saber
 * o número antes de o pedir.
 *
 * A ordem das casas na roda não é a ordem dos números: é a ordem a sério, a
 * que está pintada numa roleta europeia. Serve para o site a desenhar como
 * deve ser; para a sorte não muda nada, que a casa é tirada ao calhas de
 * qualquer maneira.
 */

export const RODA = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14,
  31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26
];

const VERMELHOS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const cor = (n) => (n === 0 ? 'verde' : VERMELHOS.has(n) ? 'vermelho' : 'preto');

export const APOSTA_MINIMA = 1;
export const APOSTA_MAXIMA = 5000;
/** Quantas fichas diferentes se podem pôr na mesa de uma vez. */
export const MAX_APOSTAS = 24;

/**
 * As apostas que a mesa aceita, e o que cada uma paga.
 *
 * O `paga` é quanto volta por cada torrão apostado, com o próprio torrão lá
 * dentro: um número paga trinta e seis, que é o mesmo que dizer trinta e cinco
 * para um. As de fora são todas perdidas no zero, como manda a regra.
 */
export const APOSTAS = {
  numero: { paga: 36, acerta: (n, valor) => n === valor, precisaValor: true },
  vermelho: { paga: 2, acerta: (n) => cor(n) === 'vermelho' },
  preto: { paga: 2, acerta: (n) => cor(n) === 'preto' },
  par: { paga: 2, acerta: (n) => n !== 0 && n % 2 === 0 },
  impar: { paga: 2, acerta: (n) => n % 2 === 1 },
  baixo: { paga: 2, acerta: (n) => n >= 1 && n <= 18 },
  alto: { paga: 2, acerta: (n) => n >= 19 && n <= 36 },
  duzia1: { paga: 3, acerta: (n) => n >= 1 && n <= 12 },
  duzia2: { paga: 3, acerta: (n) => n >= 13 && n <= 24 },
  duzia3: { paga: 3, acerta: (n) => n >= 25 && n <= 36 },
  coluna1: { paga: 3, acerta: (n) => n !== 0 && n % 3 === 1 },
  coluna2: { paga: 3, acerta: (n) => n !== 0 && n % 3 === 2 },
  coluna3: { paga: 3, acerta: (n) => n !== 0 && n % 3 === 0 }
};

/* Um número ao calhas do gerador criptográfico, sem o desvio do resto: com o
   resto puro as primeiras casas saíam um bocadinho mais vezes, e numa roleta
   isso é o princípio de se poder contar com ela. */
function aoCalhas(limite) {
  const b = new Uint32Array(1);
  const teto = Math.floor(0x100000000 / limite) * limite;
  do {
    crypto.getRandomValues(b);
  } while (b[0] >= teto);
  return b[0] % limite;
}

/** Onde a bola para. */
export const girar = () => aoCalhas(37);

/**
 * Lê o que veio do site e devolve as apostas que prestam, ou uma queixa.
 *
 * Nada do que vem de lá é de confiança: nem o tipo, nem o número, nem o
 * quanto. O que sai daqui já está limpo.
 */
export function limparApostas(veio, saldo) {
  if (!Array.isArray(veio) || veio.length === 0) return { erro: 'Não puseste nada na mesa.' };
  if (veio.length > MAX_APOSTAS) return { erro: 'Fichas a mais na mesa.' };

  const limpas = [];
  let total = 0;

  for (const a of veio) {
    const tipo = typeof a?.tipo === 'string' ? a.tipo : '';
    const regra = APOSTAS[tipo];
    if (!regra) return { erro: 'Essa aposta não existe.' };

    const quanto = Math.round(Number(a?.quanto));
    if (!Number.isFinite(quanto) || quanto < APOSTA_MINIMA || quanto > APOSTA_MAXIMA)
      return { erro: `Cada ficha é de ${APOSTA_MINIMA} a ${APOSTA_MAXIMA} torrões.` };

    let valor = null;
    if (regra.precisaValor) {
      valor = Math.round(Number(a?.valor));
      if (!Number.isInteger(valor) || valor < 0 || valor > 36)
        return { erro: 'Esse número não está na roleta.' };
    }

    total += quanto;
    limpas.push(valor === null ? { tipo, quanto } : { tipo, valor, quanto });
  }

  if (total > saldo) return { erro: 'Não tens torrões que cheguem para tudo isso.' };
  return { apostas: limpas, total };
}

/**
 * Quanto volta para quem apostou, e o que aconteceu a cada ficha.
 *
 * O que volta já traz o próprio torrão lá dentro. As fichas que perdem
 * devolvem zero, e a conta de quem ganhou é a soma das que acertaram.
 */
export function contar(apostas, saiu) {
  const detalhe = apostas.map((a) => {
    const regra = APOSTAS[a.tipo];
    const acertou = regra.acerta(saiu, a.valor);
    return { ...a, acertou, volta: acertou ? a.quanto * regra.paga : 0 };
  });
  return {
    detalhe,
    volta: detalhe.reduce((s, d) => s + d.volta, 0),
    apostado: apostas.reduce((s, a) => s + a.quanto, 0)
  };
}

/** Uma rodada inteira: sai o número, contam-se as fichas. */
export function rodada(apostas) {
  const saiu = girar();
  const { detalhe, volta, apostado } = contar(apostas, saiu);
  return {
    saiu,
    cor: cor(saiu),
    /** Onde a casa está na roda, para o site saber onde parar a bola. */
    casa: RODA.indexOf(saiu),
    detalhe,
    apostado,
    volta,
    lucro: volta - apostado
  };
}
