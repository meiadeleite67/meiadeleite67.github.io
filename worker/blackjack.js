/**
 * As regras do blackjack, do lado de cá.
 *
 * Estavam só no browser, o que queria dizer que era o browser a decidir quem
 * tinha ganho. Bastava alguém montar o pedido à mão e dizer que tinha ganho
 * uma mão que perdeu. Agora é aqui que as cartas saem e é aqui que se decide
 * o que vale cada mão; o site só pede cartas e mostra o que recebe.
 *
 * As cartas são números de 0 a 51: o naipe é a divisão por treze e o valor é
 * o resto. Um sapato são seis baralhos, portanto 312 números, que cabem à
 * vontade no sítio onde isto fica guardado.
 *
 * A carta tapada da casa nunca sai daqui enquanto estiver tapada. É por isso
 * que há uma vista: é ela que decide o que o site pode ver.
 */

const NAIPES = [
  { s: '♠', verm: false },
  { s: '♥', verm: true },
  { s: '♦', verm: true },
  { s: '♣', verm: false }
];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

const BARALHOS = 6;
const MAX_MAOS = 4;
/** Abaixo disto o sapato é trocado por um novo. */
const SOBRAS = 60;

export const APOSTA_MAXIMA = 100_000;

const naipeDe = (n) => NAIPES[Math.floor(n / 13) % 4];
const valorDaCarta = (n) => VALORES[n % 13];

/** A carta como o site a quer ver. */
export const carta = (n) => ({ v: valorDaCarta(n), n: naipeDe(n).s, verm: naipeDe(n).verm });

/** Um número ao calhas, do gerador criptográfico e não do Math.random: quem
 *  adivinhasse a ordem do sapato sabia as cartas todas de antemão. */
function aoCalhas(limite) {
  const b = new Uint32Array(1);
  crypto.getRandomValues(b);
  return b[0] % limite;
}

export function sapatoNovo() {
  const c = [];
  for (let d = 0; d < BARALHOS; d++) for (let i = 0; i < 52; i++) c.push(i);
  for (let i = c.length - 1; i > 0; i--) {
    const j = aoCalhas(i + 1);
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/** Quanto vale uma carta sozinha. O ás vale onze até dar jeito valer um. */
const valorDe = (n) => {
  const v = valorDaCarta(n);
  return v === 'A' ? 11 : 'JQK'.includes(v) ? 10 : Number(v);
};

export function conta(cartas) {
  let t = 0;
  let ases = 0;
  for (const c of cartas) {
    t += valorDe(c);
    if (valorDaCarta(c) === 'A') ases++;
  }
  while (t > 21 && ases > 0) {
    t -= 10;
    ases--;
  }
  return t;
}

function tirar(m) {
  if (m.sapato.length < SOBRAS) m.sapato = sapatoNovo();
  return m.sapato.pop();
}

const maoNova = (cartas, aposta, deAses = false) => ({
  cartas,
  aposta,
  fechada: false,
  resultado: null,
  deAses
});

/* ======================= dar cartas ======================= */

export function mesaNova(aposta, sapato) {
  const m = {
    sapato: sapato && sapato.length >= SOBRAS ? sapato : sapatoNovo(),
    casa: [],
    maos: [],
    atual: 0,
    fase: 'jogo',
    revelar: false,
    passo: 0
  };
  m.maos = [maoNova([tirar(m), tirar(m)], aposta)];
  m.casa = [tirar(m), tirar(m)];

  if (conta(m.maos[0].cartas) === 21) {
    m.maos[0].fechada = true;
    m.revelar = true;
    resolver(m);
  }
  return m;
}

/* ======================= jogar ======================= */

export const maoAtual = (m) => m.maos[m.atual];

/** Dá para dividir quando as duas cartas valem o mesmo e ainda há mãos. */
export function podeDividir(m, saldo) {
  const mao = maoAtual(m);
  if (!mao || m.fase !== 'jogo' || mao.fechada) return false;
  if (mao.cartas.length !== 2 || m.maos.length >= MAX_MAOS) return false;
  if (saldo < mao.aposta) return false;
  return valorDe(mao.cartas[0]) === valorDe(mao.cartas[1]);
}

export function podeDobrar(m, saldo) {
  const mao = maoAtual(m);
  return (
    m.fase === 'jogo' &&
    !!mao &&
    !mao.fechada &&
    mao.cartas.length === 2 &&
    !mao.deAses &&
    saldo >= mao.aposta
  );
}

export function dividir(m) {
  const mao = m.maos[m.atual];
  const eramAses = valorDaCarta(mao.cartas[0]) === 'A';

  const segunda = maoNova([mao.cartas.pop()], mao.aposta, eramAses);
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

export function pedir(m) {
  const mao = m.maos[m.atual];
  if (!mao || mao.fechada) return m;

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

export function ficar(m) {
  const mao = m.maos[m.atual];
  if (!mao || mao.fechada) return m;
  mao.fechada = true;
  return seguinte(m);
}

export function dobrar(m) {
  const mao = m.maos[m.atual];
  mao.aposta *= 2;
  mao.cartas.push(tirar(m));
  mao.fechada = true;
  if (conta(mao.cartas) > 21) mao.resultado = 'rebentou';
  return seguinte(m);
}

/** Passa à mão seguinte que ainda esteja aberta; se não houver, joga a casa. */
function seguinte(m) {
  const proxima = m.maos.findIndex((x, i) => i > m.atual && !x.fechada);
  if (proxima >= 0) {
    m.atual = proxima;
    return m;
  }
  m.atual = m.maos.length - 1;
  return resolver(m);
}

/* ======================= fechar a mão ======================= */

function resolver(m) {
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
    mao.fechada = true;
  }

  m.fase = 'fim';
  return m;
}

/** O que cada mão paga de volta, aposta incluída. */
export function paga(mao) {
  if (mao.resultado === 'blackjack') return Math.round(mao.aposta * 2.5);
  if (mao.resultado === 'ganhou') return mao.aposta * 2;
  if (mao.resultado === 'empate') return mao.aposta;
  return 0;
}

/**
 * O que o site pode ver. Enquanto a casa não vira a carta tapada, ela nem
 * sequer sai daqui: vai um lugar vazio no meio das outras, e é o site que
 * desenha lá o verso.
 */
export function vista(m, saldo) {
  return {
    fase: m.fase,
    revelar: m.revelar,
    atual: m.atual,
    passo: m.passo,
    casa: m.revelar ? m.casa.map(carta) : [carta(m.casa[0])],
    tapada: !m.revelar,
    maos: m.maos.map((x) => ({
      cartas: x.cartas.map(carta),
      aposta: x.aposta,
      fechada: x.fechada,
      resultado: x.resultado,
      deAses: x.deAses
    })),
    podeDividir: podeDividir(m, saldo),
    podeDobrar: podeDobrar(m, saldo)
  };
}
