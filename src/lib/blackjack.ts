/**
 * Blackjack a torrões de açúcar. Seis baralhos, a casa fica nos 17,
 * blackjack paga 3:2. Nenhum dinheiro envolvido em momento algum.
 *
 * Dá para dividir quando as duas primeiras cartas valem o mesmo, e daí em
 * diante joga-se mão a mão: a primeira até ao fim, depois a seguinte. Por
 * isso a mesa guarda uma lista de mãos e não uma só.
 */

export type Carta = { v: string; n: string; verm: boolean };
export type Fase = 'aposta' | 'jogo' | 'fim';
export type Resultado = 'blackjack' | 'ganhou' | 'empate' | 'perdeu' | 'rebentou';

export type Mao = {
  cartas: Carta[];
  aposta: number;
  /** Já não recebe mais cartas: ficou, dobrou, rebentou ou fez 21. */
  fechada: boolean;
  resultado: Resultado | null;
  /** Mão nascida de dividir ases: leva uma carta e mais nada. */
  deAses: boolean;
};

export type Mesa = {
  sapato: Carta[];
  casa: Carta[];
  maos: Mao[];
  /** Qual das mãos está a jogar. */
  atual: number;
  fichas: number[];
  saldo: number;
  fase: Fase;
  revelar: boolean;
  jogadas: number;
  vitorias: number;
  bjs: number;
  pico: number;
  salvamentos: number;
};

const NAIPES = [
  { s: '♠', verm: false },
  { s: '♥', verm: true },
  { s: '♦', verm: true },
  { s: '♣', verm: false }
];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** As fichas que se podem pôr numa mão. O servidor aceita muito mais do que
 *  isto por mão; o que manda aqui é o que cabe na bancada e o que faz sentido
 *  numa mesa onde o saldo inicial são dois mil e quinhentos torrões. */
export const APOSTAS = [5, 10, 25, 50, 100, 250, 500];
const MAX_MAOS = 4;

export function novoSapato(): Carta[] {
  const c: Carta[] = [];
  for (let d = 0; d < 6; d++)
    for (const n of NAIPES) for (const v of VALORES) c.push({ v, n: n.s, verm: n.verm });
  for (let i = c.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/** Quanto vale uma carta sozinha. O ás vale onze até dar jeito valer um. */
const valorDe = (c: Carta) => (c.v === 'A' ? 11 : 'JQK'.includes(c.v) ? 10 : Number(c.v));

export function conta(cartas: Carta[]): number {
  let t = 0;
  let ases = 0;
  for (const c of cartas) {
    t += valorDe(c);
    if (c.v === 'A') ases++;
  }
  while (t > 21 && ases > 0) {
    t -= 10;
    ases--;
  }
  return t;
}

export function suave(cartas: Carta[]): boolean {
  const cru = cartas.reduce((t, c) => t + valorDe(c), 0);
  return cru <= 21 && cartas.some((c) => c.v === 'A');
}

export const soma = (fichas: number[]) => fichas.reduce((t, v) => t + v, 0);

const maoNova = (cartas: Carta[], aposta: number, deAses = false): Mao => ({
  cartas,
  aposta,
  fechada: false,
  resultado: null,
  deAses
});

export function mesaNova(saldo = 250): Mesa {
  return {
    sapato: novoSapato(),
    casa: [],
    maos: [],
    atual: 0,
    fichas: [10],
    saldo,
    fase: 'aposta',
    revelar: false,
    jogadas: 0,
    vitorias: 0,
    bjs: 0,
    pico: saldo,
    salvamentos: 0
  };
}

/** Tira uma carta, arranjando baralho novo quando o sapato está a acabar. */
function tirar(m: Mesa): Carta {
  if (m.sapato.length < 60) m.sapato = novoSapato();
  return m.sapato.pop()!;
}

/* Cada jogada devolve uma mesa nova, porque o React precisa de outra
   referência para saber que tem de desenhar outra vez. */
const copia = (m: Mesa): Mesa => ({
  ...m,
  casa: [...m.casa],
  sapato: [...m.sapato],
  fichas: [...m.fichas],
  maos: m.maos.map((x) => ({ ...x, cartas: [...x.cartas] }))
});

/* ======================= apostar ======================= */

export function porFicha(anterior: Mesa, valor: number): Mesa {
  const m = copia(anterior);
  if (soma(m.fichas) + valor > m.saldo) return anterior;
  m.fichas.push(valor);
  return m;
}

export function tirarFichas(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.fichas = [];
  return m;
}

export function distribuir(anterior: Mesa): Mesa {
  const m = copia(anterior);
  const aposta = soma(m.fichas);
  if (aposta <= 0 || aposta > m.saldo) return anterior;

  m.saldo -= aposta;
  m.maos = [maoNova([tirar(m), tirar(m)], aposta)];
  m.atual = 0;
  m.casa = [tirar(m), tirar(m)];
  m.fase = 'jogo';
  m.revelar = false;

  if (conta(m.maos[0].cartas) === 21) {
    m.maos[0].fechada = true;
    m.revelar = true;
    return resolver(m);
  }
  return m;
}

/* ======================= jogar ======================= */

export const maoAtual = (m: Mesa): Mao | undefined => m.maos[m.atual];

/** Dá para dividir quando as duas cartas valem o mesmo e ainda há mãos. */
export function podeDividir(m: Mesa): boolean {
  const mao = maoAtual(m);
  if (!mao || m.fase !== 'jogo' || mao.fechada) return false;
  if (mao.cartas.length !== 2 || m.maos.length >= MAX_MAOS) return false;
  if (m.saldo < mao.aposta) return false;
  return valorDe(mao.cartas[0]) === valorDe(mao.cartas[1]);
}

export function dividir(anterior: Mesa): Mesa {
  if (!podeDividir(anterior)) return anterior;
  const m = copia(anterior);
  const mao = m.maos[m.atual];
  const eramAses = mao.cartas[0].v === 'A';

  m.saldo -= mao.aposta;
  const segunda = maoNova([mao.cartas.pop()!], mao.aposta, eramAses);
  mao.deAses = eramAses;
  m.maos.splice(m.atual + 1, 0, segunda);

  // cada uma recebe já a sua segunda carta
  mao.cartas.push(tirar(m));
  segunda.cartas.push(tirar(m));

  /* Ases divididos levam uma carta e mais nada. É a regra de sempre, e é ela
     que impede alguém de partir ases a vida toda à procura do vinte e um. */
  if (eramAses) {
    mao.fechada = true;
    segunda.fechada = true;
    return seguinte(m);
  }
  if (conta(mao.cartas) === 21) {
    mao.fechada = true;
    return seguinte(m);
  }
  return m;
}

export function pedir(anterior: Mesa): Mesa {
  const m = copia(anterior);
  const mao = m.maos[m.atual];
  if (!mao || mao.fechada) return anterior;

  mao.cartas.push(tirar(m));
  const total = conta(mao.cartas);
  if (total > 21) {
    mao.fechada = true;
    mao.resultado = 'rebentou';
    return seguinte(m);
  }
  if (total === 21) {
    mao.fechada = true;
    return seguinte(m);
  }
  return m;
}

export function ficar(anterior: Mesa): Mesa {
  const m = copia(anterior);
  const mao = m.maos[m.atual];
  if (!mao || mao.fechada) return anterior;
  mao.fechada = true;
  return seguinte(m);
}

export function podeDobrar(m: Mesa): boolean {
  const mao = maoAtual(m);
  return (
    m.fase === 'jogo' &&
    !!mao &&
    !mao.fechada &&
    mao.cartas.length === 2 &&
    !mao.deAses &&
    m.saldo >= mao.aposta
  );
}

export function dobrar(anterior: Mesa): Mesa {
  if (!podeDobrar(anterior)) return anterior;
  const m = copia(anterior);
  const mao = m.maos[m.atual];

  m.saldo -= mao.aposta;
  mao.aposta *= 2;
  mao.cartas.push(tirar(m));
  mao.fechada = true;
  if (conta(mao.cartas) > 21) mao.resultado = 'rebentou';
  return seguinte(m);
}

/** Passa à mão seguinte que ainda esteja aberta; se não houver, joga a casa. */
function seguinte(m: Mesa): Mesa {
  const proxima = m.maos.findIndex((x, i) => i > m.atual && !x.fechada);
  if (proxima >= 0) {
    m.atual = proxima;
    return m;
  }
  m.atual = m.maos.length - 1;
  return resolver(m);
}

/* ======================= fechar a mão ======================= */

function resolver(m: Mesa): Mesa {
  m.revelar = true;

  const algumaViva = m.maos.some((x) => conta(x.cartas) <= 21);
  if (algumaViva) while (conta(m.casa) < 17) m.casa.push(tirar(m));
  const casa = conta(m.casa);

  const eraSoUmaMao = m.maos.length === 1;

  for (const mao of m.maos) {
    const meu = conta(mao.cartas);
    if (mao.resultado === 'rebentou' || meu > 21) {
      mao.resultado = 'rebentou';
    } else if (eraSoUmaMao && meu === 21 && mao.cartas.length === 2) {
      /* Blackjack a sério só na mão de origem: vinte e um feito depois de
         dividir conta como vinte e um, e paga a par. */
      mao.resultado = casa === 21 && m.casa.length === 2 ? 'empate' : 'blackjack';
    } else if (casa > 21 || meu > casa) {
      mao.resultado = 'ganhou';
    } else if (meu === casa) {
      mao.resultado = 'empate';
    } else {
      mao.resultado = 'perdeu';
    }

    m.jogadas++;
    if (mao.resultado === 'blackjack') {
      m.saldo += Math.round(mao.aposta * 2.5);
      m.vitorias++;
      m.bjs++;
    } else if (mao.resultado === 'ganhou') {
      m.saldo += mao.aposta * 2;
      m.vitorias++;
    } else if (mao.resultado === 'empate') {
      m.saldo += mao.aposta;
    }
    mao.fechada = true;
  }

  if (m.saldo > m.pico) m.pico = m.saldo;
  m.fase = 'fim';
  return m;
}

/** A aposta anterior fica na mesa para poderes repetir, mas encolhe se já não
 *  tiveres torrões que cheguem. */
export function outraMao(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.maos = [];
  m.casa = [];
  m.atual = 0;
  m.fase = 'aposta';
  m.revelar = false;
  while (m.fichas.length && soma(m.fichas) > m.saldo) m.fichas.pop();
  return m;
}

export function emprestimo(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.saldo += 100;
  m.salvamentos++;
  return m;
}
