/**
 * Blackjack a torrões de açúcar. Seis baralhos, a casa fica nos 17,
 * blackjack paga 3:2. Nenhum dinheiro envolvido em momento algum.
 */

export type Carta = { v: string; n: string; verm: boolean };
export type Fase = 'aposta' | 'jogo' | 'fim';

export type Mesa = {
  sapato: Carta[];
  mao: Carta[];
  casa: Carta[];
  /** As fichas que estão na mesa, na ordem em que foram postas. */
  fichas: number[];
  aposta: number;
  saldo: number;
  fase: Fase;
  revelar: boolean;
  msg: string;
  maos: number;
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

export const APOSTAS = [5, 10, 25, 50];

const DIZERES: Record<string, string[]> = {
  espera: ['Aposta lá, que o café arrefece.', 'Quanto é que vale a tua confiança hoje?', 'A casa está aberta. As desculpas também.'],
  joga: ['Pensa bem. Ou não penses, dá na mesma.', 'Mais uma? O açúcar é por conta da casa.', 'Cuidado com o 16. O 16 é traiçoeiro.'],
  ganhou: ['Sorte de principiante. Durante quantos anos?', 'Boa. Paga a próxima rodada.', 'Ganhaste. Não te habitues.'],
  perdeu: ['A casa agradece o contributo.', 'Isso foi doloroso até para mim.', 'Já vi pior. Mas foi há muito tempo.'],
  empate: ['Empate. Ninguém paga, ninguém chora.', 'Fica tudo como estava. Que emoção.'],
  rebentou: ['Rebentaste. Como o leite ao lume.', 'Vinte e dois. Corajoso.', 'A matemática não perdoa, amigo.'],
  bj: ['BLACKJACK! Isso merece uma meia de leite.', 'Vinte e um à primeira. Estás a contar cartas?']
};

export const dizer = (k: keyof typeof DIZERES | string) => {
  const a = DIZERES[k] ?? DIZERES.joga;
  return a[Math.floor(Math.random() * a.length)];
};

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

export function conta(mao: Carta[]): number {
  let t = 0;
  let ases = 0;
  for (const c of mao) {
    if (c.v === 'A') {
      t += 11;
      ases++;
    } else if (c.v === 'J' || c.v === 'Q' || c.v === 'K') t += 10;
    else t += Number(c.v);
  }
  while (t > 21 && ases > 0) {
    t -= 10;
    ases--;
  }
  return t;
}

export function suave(mao: Carta[]): boolean {
  let t = 0;
  let ases = 0;
  for (const c of mao) {
    if (c.v === 'A') {
      t += 11;
      ases++;
    } else if ('JQK'.includes(c.v)) t += 10;
    else t += Number(c.v);
  }
  return t <= 21 && ases > 0;
}

export const soma = (fichas: number[]) => fichas.reduce((t, v) => t + v, 0);

export function mesaNova(saldo = 250): Mesa {
  return {
    sapato: novoSapato(),
    mao: [],
    casa: [],
    fichas: [10],
    aposta: 10,
    saldo,
    fase: 'aposta',
    revelar: false,
    msg: dizer('espera'),
    maos: 0,
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

function fechar(m: Mesa, resultado: 'blackjack' | 'ganhou' | 'empate' | 'perdeu' | 'rebentou'): Mesa {
  m.maos++;
  if (resultado === 'blackjack') {
    m.saldo += Math.round(m.aposta * 2.5);
    m.vitorias++;
    m.bjs++;
    m.msg = dizer('bj');
  } else if (resultado === 'ganhou') {
    m.saldo += m.aposta * 2;
    m.vitorias++;
    m.msg = dizer('ganhou');
  } else if (resultado === 'empate') {
    m.saldo += m.aposta;
    m.msg = dizer('empate');
  } else {
    m.msg = dizer(resultado);
  }
  if (m.saldo > m.pico) m.pico = m.saldo;
  m.fase = 'fim';
  return m;
}

/* Cada jogada devolve uma mesa nova, porque o React precisa de outra
   referência para saber que tem de desenhar outra vez. */
const copia = (m: Mesa): Mesa => ({
  ...m,
  mao: [...m.mao],
  casa: [...m.casa],
  sapato: [...m.sapato],
  fichas: [...m.fichas]
});

/** Põe uma ficha na mesa, se houver torrões para ela. */
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
  m.aposta = soma(m.fichas);
  if (m.aposta <= 0 || m.aposta > m.saldo) return anterior;
  m.saldo -= m.aposta;
  m.mao = [tirar(m), tirar(m)];
  m.casa = [tirar(m), tirar(m)];
  m.fase = 'jogo';
  m.revelar = false;
  m.msg = dizer('joga');
  if (conta(m.mao) === 21) {
    m.revelar = true;
    return fechar(m, conta(m.casa) === 21 ? 'empate' : 'blackjack');
  }
  return m;
}

export function ficar(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.revelar = true;
  while (conta(m.casa) < 17) m.casa.push(tirar(m));
  const eu = conta(m.mao);
  const casa = conta(m.casa);
  if (casa > 21 || eu > casa) return fechar(m, 'ganhou');
  if (eu === casa) return fechar(m, 'empate');
  return fechar(m, 'perdeu');
}

export function pedir(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.mao.push(tirar(m));
  const t = conta(m.mao);
  if (t > 21) {
    m.revelar = true;
    return fechar(m, 'rebentou');
  }
  if (t === 21) return ficar(m);
  m.msg = dizer('joga');
  return m;
}

export function dobrar(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.saldo -= m.aposta;
  m.aposta *= 2;
  m.mao.push(tirar(m));
  if (conta(m.mao) > 21) {
    m.revelar = true;
    return fechar(m, 'rebentou');
  }
  return ficar(m);
}

/** A aposta anterior fica na mesa para poderes repetir, mas encolhe se já não
 *  tiveres torrões que cheguem. */
export function outraMao(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.mao = [];
  m.casa = [];
  m.fase = 'aposta';
  m.revelar = false;
  m.msg = dizer('espera');
  while (m.fichas.length && soma(m.fichas) > m.saldo) m.fichas.pop();
  return m;
}

export function emprestimo(anterior: Mesa): Mesa {
  const m = copia(anterior);
  m.saldo += 100;
  m.salvamentos++;
  m.msg = `Emprestados. São ${m.salvamentos} vez(es). Ele anda a apontar.`;
  return m;
}
