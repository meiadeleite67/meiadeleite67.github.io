/**
 * As regras do Texas Hold'em, do lado de cá.
 *
 * Tal como no blackjack, nada disto vive no browser. As cartas saem aqui, a
 * força de cada mão é decidida aqui, e o site só mostra o que recebe. As
 * cartas de quem está à mesa nem chegam a sair deste lado enquanto a mão não
 * for mostrada: é por isso que há uma vista, e é ela que corta o que cada um
 * pode ver.
 *
 * As cartas são números de 0 a 51, como no blackjack: o naipe é a divisão por
 * treze e o valor é o resto. Aqui o ás é a carta mais alta, por isso vale
 * catorze, e volta a valer um quando for preciso para a sequência A2345.
 *
 * Este ficheiro não sabe nada de rede nem de quem está ligado: recebe uma mão,
 * mexe-lhe, e devolve-a. Quem trata da mesa e de quem lá está é a
 * mesa-de-poker.js.
 */

export const MAX_LUGARES = 5;
export const MINIMO_PARA_JOGAR = 2;
/* As fichas de uma mesa sao torroes a serio, comprados ao banco. Quem se
   senta leva a compra normal, ou o que tiver se for menos, desde que chegue
   para o minimo da mesa; quando se levanta, o que sobrar volta para a
   carteira. */
export const COMPRA_MAXIMA = 1000;
export const COMPRA_MINIMA = 100;
/* Os cegos sao pequenos de proposito. Com a carteira partilhada, quem comeca
   tem 250 torroes: cegos de 25 e 50 davam-lhe cinco maos e acabava-se ali. */
export const CEGO_PEQUENO = 5;
export const CEGO_GRANDE = 10;

const NAIPES = [
  { s: '♠', verm: false },
  { s: '♥', verm: true },
  { s: '♦', verm: true },
  { s: '♣', verm: false }
];
const VALORES = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** A carta como o site a quer ver. */
export const carta = (n) => ({
  v: VALORES[n % 13],
  n: NAIPES[Math.floor(n / 13)].s,
  verm: NAIPES[Math.floor(n / 13)].verm
});

/** O ás é a carta mais alta: vale catorze. O um só aparece na sequência A2345. */
const valorDe = (n) => (n % 13 === 0 ? 14 : (n % 13) + 1);

/* Um número ao calhas do gerador criptográfico, sem o desvio do resto: com o
   resto puro os primeiros números saíam um bocadinho mais vezes, e num baralho
   isso é o princípio de se poder adivinhar. */
function aoCalhas(limite) {
  const b = new Uint32Array(1);
  const teto = Math.floor(0x100000000 / limite) * limite;
  do {
    crypto.getRandomValues(b);
  } while (b[0] >= teto);
  return b[0] % limite;
}

/** Um baralho só, baralhado de alto a baixo. */
export function baralhoNovo() {
  const c = [];
  for (let i = 0; i < 52; i++) c.push(i);
  for (let i = c.length - 1; i > 0; i--) {
    const j = aoCalhas(i + 1);
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

/* ======================= quanto vale uma mão ======================= */

const NOMES = [
  '',
  '',
  'dois',
  'três',
  'quatro',
  'cinco',
  'seis',
  'sete',
  'oito',
  'nove',
  'dez',
  'valete',
  'dama',
  'rei',
  'ás'
];
const MUITOS = [
  '',
  '',
  'dois',
  'trêses',
  'quatros',
  'cincos',
  'seis',
  'setes',
  'oitos',
  'noves',
  'dezes',
  'valetes',
  'damas',
  'reis',
  'ases'
];

/** A ponta da melhor sequência que exista nesta mistura de valores, ou zero. */
function pontaDaSequencia(mascara) {
  // o ás também conta como um, que é o que faz a sequência A2345
  const com = mascara | (((mascara >> 14) & 1) << 1);
  for (let topo = 14; topo >= 5; topo--) {
    let inteira = true;
    for (let i = 0; i < 5; i++)
      if (!(com & (1 << (topo - i)))) {
        inteira = false;
        break;
      }
    if (inteira) return topo;
  }
  return 0;
}

/** Os n valores mais altos de uma máscara, do maior para o menor. */
function maiores(mascara, n) {
  const fora = [];
  for (let v = 14; v >= 2 && fora.length < n; v--) if (mascara & (1 << v)) fora.push(v);
  return fora;
}

/** As cartas de fora que desempatam, tirando os valores já usados. */
function acompanhantes(contas, usados, quantos) {
  const fora = [];
  for (let v = 14; v >= 2 && fora.length < quantos; v--)
    if (contas[v] && !usados.includes(v)) fora.push(v);
  return fora;
}

/* A força cabe toda num número: a categoria vale mais do que tudo, e depois
   vêm até cinco desempates por ordem de importância. Em base dezasseis cada um
   tem o seu lugar e nunca se pisam. */
const pontosDe = (categoria, chaves) => {
  let p = categoria;
  for (let i = 0; i < 5; i++) p = p * 16 + (chaves[i] || 0);
  return p;
};

/**
 * Quanto vale esta mão. Entram cinco, seis ou sete cartas e sai a melhor mão
 * de cinco que lá esteja dentro, em número.
 */
export function avaliar(cartas) {
  const contas = new Array(15).fill(0);
  const porNaipe = [[], [], [], []];
  let mascara = 0;
  for (const c of cartas) {
    const v = valorDe(c);
    contas[v]++;
    porNaipe[Math.floor(c / 13)].push(v);
    mascara |= 1 << v;
  }

  /* A cor resolve-se primeiro porque, com sete cartas, quem tem cinco do mesmo
     naipe nunca pode ter full house nem quadra: as outras duas cartas não
     chegam para isso. */
  const naipeCheio = porNaipe.findIndex((l) => l.length >= 5);
  if (naipeCheio >= 0) {
    let m = 0;
    for (const v of porNaipe[naipeCheio]) m |= 1 << v;
    const ponta = pontaDaSequencia(m);
    if (ponta) return { categoria: 8, chaves: [ponta], pontos: pontosDe(8, [ponta]) };
    const cinco = maiores(m, 5);
    return { categoria: 5, chaves: cinco, pontos: pontosDe(5, cinco) };
  }

  const grupos = [];
  for (let v = 14; v >= 2; v--) if (contas[v]) grupos.push([contas[v], v]);
  grupos.sort((a, b) => b[0] - a[0] || b[1] - a[1]);

  const [quantas, valor] = grupos[0];

  if (quantas === 4) {
    const chaves = [valor, ...acompanhantes(contas, [valor], 1)];
    return { categoria: 7, chaves, pontos: pontosDe(7, chaves) };
  }

  if (quantas === 3) {
    const par = grupos.find((g, i) => i > 0 && g[0] >= 2);
    if (par) {
      const chaves = [valor, par[1]];
      return { categoria: 6, chaves, pontos: pontosDe(6, chaves) };
    }
  }

  const ponta = pontaDaSequencia(mascara);
  if (ponta) return { categoria: 4, chaves: [ponta], pontos: pontosDe(4, [ponta]) };

  if (quantas === 3) {
    const chaves = [valor, ...acompanhantes(contas, [valor], 2)];
    return { categoria: 3, chaves, pontos: pontosDe(3, chaves) };
  }

  if (quantas === 2) {
    const pares = grupos.filter((g) => g[0] === 2).map((g) => g[1]);
    if (pares.length >= 2) {
      const dois = [pares[0], pares[1]];
      const chaves = [...dois, ...acompanhantes(contas, dois, 1)];
      return { categoria: 2, chaves, pontos: pontosDe(2, chaves) };
    }
    const chaves = [valor, ...acompanhantes(contas, [valor], 3)];
    return { categoria: 1, chaves, pontos: pontosDe(1, chaves) };
  }

  const cinco = maiores(mascara, 5);
  return { categoria: 0, chaves: cinco, pontos: pontosDe(0, cinco) };
}

/** O nome da mão, à maneira de quem está a ver e não de quem conta pontos. */
export function nomeDaMao(a) {
  if (!a) return '';
  const [x, y] = a.chaves;
  switch (a.categoria) {
    case 8:
      return x === 14 ? 'Sequência real' : `Sequência de cor ao ${NOMES[x]}`;
    case 7:
      return `Quadra de ${MUITOS[x]}`;
    case 6:
      return `Full house, ${MUITOS[x]} com ${MUITOS[y]}`;
    case 5:
      return `Cor ao ${NOMES[x]}`;
    case 4:
      return `Sequência ao ${NOMES[x]}`;
    case 3:
      return `Trio de ${MUITOS[x]}`;
    case 2:
      return `Dois pares, ${MUITOS[x]} e ${MUITOS[y]}`;
    case 1:
      return `Par de ${MUITOS[x]}`;
    default:
      return `Carta alta, ${NOMES[x]}`;
  }
}

/* ========================= a mão a decorrer ========================= */

const tirar = (m) => m.baralho.pop();
const queimar = (m) => m.baralho.pop();

const pagar = (j, quanto) => {
  const q = Math.max(0, Math.min(quanto, j.fichas));
  j.fichas -= q;
  j.posto += q;
  j.total += q;
  if (j.fichas === 0) j.estado = 'tudo';
  return q;
};

/** O próximo, à volta da mesa, que ainda tem fichas e não desistiu. */
function proximoQuePodeMexer(m, desde) {
  const n = m.jogadores.length;
  for (let k = 1; k <= n; k++) {
    const i = (desde + k) % n;
    if (m.jogadores[i].estado === 'aberto') return i;
  }
  return -1;
}

/**
 * Uma mão nova.
 *
 * Os lugares vêm por ordem de lugar e só entram os que têm fichas. O botão
 * anda para o lugar ocupado seguinte, e os cegos saem logo. A dois, o botão é
 * o cego pequeno e fala primeiro antes do flop, como manda a regra.
 */
export function maoNova({ numero, lugares, ultimoBotao }) {
  const jogadores = lugares.map((l) => ({
    lugar: l.lugar,
    nome: l.nome,
    fichas: l.fichas,
    cartas: [],
    posto: 0,
    total: 0,
    estado: 'aberto',
    mexeu: false,
    mostra: false,
    ganhou: 0,
    avaliacao: null
  }));

  const n = jogadores.length;
  /* O botão vai para o primeiro lugar ocupado depois de onde estava. Se já
     ninguém está sentado depois dele, volta ao princípio da mesa. */
  let iBotao = jogadores.findIndex((j) => j.lugar > ultimoBotao);
  if (iBotao < 0) iBotao = 0;

  const m = {
    numero,
    baralho: baralhoNovo(),
    jogadores,
    iBotao,
    comunidade: [],
    fase: 'previa',
    pote: 0,
    aposta: 0,
    subidaMinima: CEGO_GRANDE,
    vez: -1,
    passo: 0,
    prazo: 0,
    bolos: [],
    botaoNoLugar: jogadores[iBotao].lugar
  };

  const iPeq = n === 2 ? iBotao : (iBotao + 1) % n;
  const iGra = n === 2 ? (iBotao + 1) % n : (iBotao + 2) % n;
  pagar(jogadores[iPeq], CEGO_PEQUENO);
  pagar(jogadores[iGra], CEGO_GRANDE);
  m.aposta = Math.max(...jogadores.map((j) => j.posto));
  m.cegos = { pequeno: jogadores[iPeq].lugar, grande: jogadores[iGra].lugar };

  // duas a cada um, a começar à esquerda do botão, como numa mesa a sério
  for (let volta = 0; volta < 2; volta++)
    for (let k = 1; k <= n; k++) jogadores[(iBotao + k) % n].cartas.push(tirar(m));

  m.vez = proximoQuePodeMexer(m, iGra);

  // ninguém tem nada a decidir: os cegos deixaram toda a gente sem fichas
  if (m.vez < 0 || naoHaMaisNadaADecidir(m)) fecharRonda(m);
  return m;
}

function naoHaMaisNadaADecidir(m) {
  const abertos = m.jogadores.filter((j) => j.estado === 'aberto');
  const maior = Math.max(0, ...m.jogadores.map((j) => j.posto));
  if (abertos.some((j) => j.posto < maior)) return false;
  if (abertos.length <= 1) return true;
  return abertos.every((j) => j.mexeu);
}

function fecharRonda(m) {
  for (const j of m.jogadores) {
    m.pote += j.posto;
    j.posto = 0;
    j.mexeu = false;
  }
  m.aposta = 0;
  m.subidaMinima = CEGO_GRANDE;
  darRua(m);
}

/** A rua seguinte: o flop, a turn, o river, e depois mostram-se as cartas. */
function darRua(m) {
  if (m.fase === 'river') return mostrar(m);
  m.fase = m.fase === 'previa' ? 'flop' : m.fase === 'flop' ? 'turn' : 'river';
  queimar(m);
  const quantas = m.fase === 'flop' ? 3 : 1;
  for (let k = 0; k < quantas; k++) m.comunidade.push(tirar(m));

  /* Com um só jogador ainda com fichas e os outros já com tudo lá dentro não
     há mais nada para apostar: as cartas que faltam saem de seguida. */
  const abertos = m.jogadores.filter((j) => j.estado === 'aberto');
  if (abertos.length < 2) return darRua(m);

  m.vez = proximoQuePodeMexer(m, m.iBotao);
}

/** Toda a gente desistiu menos um: leva o que está na mesa sem mostrar nada. */
function arrematar(m) {
  for (const j of m.jogadores) {
    m.pote += j.posto;
    j.posto = 0;
  }
  m.bolos = repartir(m);
  m.fase = 'acabou';
  m.vez = -1;
}

function mostrar(m) {
  m.fase = 'mostra';
  for (const j of m.jogadores)
    if (j.estado !== 'passou') {
      j.avaliacao = avaliar([...j.cartas, ...m.comunidade]);
      j.mostra = true;
    }
  m.bolos = repartir(m);
  m.fase = 'acabou';
  m.vez = -1;
}

/** Quem está mais à esquerda do botão fica à frente, que é quem recebe as
 *  fichas a mais quando um bolo não se divide certo. */
const porOrdemDepoisDoBotao = (m, lista) => {
  const n = m.jogadores.length;
  // o lugar logo a seguir ao botão fica em primeiro, e o botão em último
  const quanto = (j) => (m.jogadores.indexOf(j) - m.iBotao - 1 + n) % n;
  return [...lista].sort((a, b) => quanto(a) - quanto(b));
};

/**
 * Os bolos. Quem vai com tudo só pode ganhar até ao que pôs lá dentro, e o
 * resto fica num bolo à parte para quem tinha mais fichas. Faz-se por camadas:
 * cada camada vai até ao que o jogador mais curto pôs, e só disputa essa
 * camada quem lá chegou.
 *
 * É também isto que devolve a quem apostou sozinho o que ninguém chegou a
 * igualar: essa camada só tem um dono.
 */
function repartir(m) {
  const niveis = [...new Set(m.jogadores.map((j) => j.total).filter((t) => t > 0))].sort(
    (a, b) => a - b
  );
  const bolos = [];
  let anterior = 0;

  for (const nivel of niveis) {
    let valor = 0;
    for (const j of m.jogadores) valor += Math.max(0, Math.min(j.total, nivel) - anterior);
    anterior = nivel;
    if (valor <= 0) continue;

    let elegiveis = m.jogadores.filter((j) => j.estado !== 'passou' && j.total >= nivel);
    // rede de segurança: fichas nunca se perdem pelo caminho
    if (elegiveis.length === 0) elegiveis = m.jogadores.filter((j) => j.estado !== 'passou');
    if (elegiveis.length === 0) elegiveis = m.jogadores.filter((j) => j.total >= nivel);

    const forca = (j) => (j.avaliacao ? j.avaliacao.pontos : 0);
    const melhor = Math.max(...elegiveis.map(forca));
    const ganham = porOrdemDepoisDoBotao(
      m,
      elegiveis.filter((j) => forca(j) === melhor)
    );

    const fatia = Math.floor(valor / ganham.length);
    let sobra = valor - fatia * ganham.length;
    for (const j of ganham) {
      const quanto = fatia + (sobra > 0 ? 1 : 0);
      if (sobra > 0) sobra--;
      j.fichas += quanto;
      j.ganhou += quanto;
    }

    bolos.push({ valor, para: ganham.map((j) => j.lugar) });
  }

  return bolos;
}

/** Depois de cada jogada: ou a mão acabou, ou passa a vez, ou muda de rua. */
function andar(m, i) {
  if (m.jogadores.filter((j) => j.estado !== 'passou').length === 1) return arrematar(m);
  if (!naoHaMaisNadaADecidir(m)) {
    m.vez = proximoQuePodeMexer(m, i);
    return;
  }
  fecharRonda(m);
}

/**
 * Uma jogada. Devolve uma queixa em texto quando não presta, e nesse caso a
 * mão fica exactamente como estava.
 *
 *   desistir  deita as cartas fora
 *   passar    fica como está, e só dá quando não se deve nada
 *   igualar   põe o que falta para chegar à aposta
 *   subir     põe mais, e o valor é o total desta ronda e não o acrescento
 */
export function jogar(m, lugar, acao, valor) {
  if (!m || m.fase === 'acabou' || m.fase === 'mostra') return 'A mão já acabou.';
  const i = m.jogadores.findIndex((j) => j.lugar === lugar);
  if (i < 0) return 'Não estás nesta mão.';
  if (i !== m.vez) return 'Não é a tua vez.';

  const j = m.jogadores[i];
  const deve = m.aposta - j.posto;

  if (acao === 'desistir') {
    j.estado = 'passou';
    j.mexeu = true;
  } else if (acao === 'passar') {
    if (deve > 0) return 'Tens de igualar ou desistir.';
    j.mexeu = true;
  } else if (acao === 'igualar') {
    if (deve <= 0) return 'Não há nada para igualar.';
    pagar(j, deve);
    j.mexeu = true;
  } else if (acao === 'subir') {
    const alvo = Math.round(Number(valor) || 0);
    const tudo = j.posto + j.fichas;
    if (alvo <= m.aposta) return 'Para ficares pelo mesmo, iguala.';
    if (alvo > tudo) return 'Não tens fichas que cheguem.';
    /* A subida mínima é a da última subida. Quem vai com tudo pode subir menos
       do que isso: é o que a regra deixa, e é a única excepção. */
    const minimo = Math.min(m.aposta + m.subidaMinima, tudo);
    if (alvo < minimo) return `Tens de subir para ${minimo} ou ir com tudo.`;

    pagar(j, alvo - j.posto);
    m.subidaMinima = Math.max(m.subidaMinima, alvo - m.aposta);
    m.aposta = alvo;
    for (const o of m.jogadores) if (o !== j && o.estado === 'aberto') o.mexeu = false;
    j.mexeu = true;
  } else {
    return 'Jogada que não existe.';
  }

  m.passo++;
  andar(m, i);
  return null;
}

/** O que cada um pode fazer agora, para o site não mostrar botões a mais. */
export function podeFazer(m, lugar) {
  if (!m || m.vez < 0) return null;
  const j = m.jogadores[m.vez];
  if (!j || j.lugar !== lugar) return null;
  const deve = m.aposta - j.posto;
  const tudo = j.posto + j.fichas;
  return {
    passar: deve <= 0,
    igualar: deve > 0 ? Math.min(deve, j.fichas) : 0,
    minimo: Math.min(m.aposta + m.subidaMinima, tudo),
    maximo: tudo,
    podeSubir: tudo > m.aposta
  };
}

/**
 * O que o site pode ver, visto do lugar de quem pergunta.
 *
 * As cartas dos outros só vão daqui para fora quando a mão for mostrada. Antes
 * disso vai o número delas e mais nada, que é o que se vê numa mesa. O baralho
 * nunca sai daqui.
 */
export function vista(m, lugar) {
  if (!m) return null;
  const emcima = m.jogadores.reduce((s, j) => s + j.posto, 0);
  return {
    numero: m.numero,
    passo: m.passo,
    fase: m.fase,
    comunidade: m.comunidade.map(carta),
    pote: m.pote + emcima,
    aposta: m.aposta,
    subidaMinima: m.subidaMinima,
    botao: m.botaoNoLugar,
    cegos: m.cegos,
    vez: m.vez >= 0 ? m.jogadores[m.vez].lugar : -1,
    prazo: m.prazo || 0,
    bolos: m.bolos || [],
    podes: podeFazer(m, lugar),
    jogadores: m.jogadores.map((j) => ({
      lugar: j.lugar,
      nome: j.nome,
      fichas: j.fichas,
      posto: j.posto,
      estado: j.estado,
      ganhou: j.ganhou,
      quantas: j.cartas.length,
      cartas: j.lugar === lugar || j.mostra ? j.cartas.map(carta) : null,
      /* O nome da mao so aparece a quem ela pertence, e so enquanto ela
         valer alguma coisa: a quem desistiu nao interessa saber o que tinha. */
      mao:
        j.mostra && j.avaliacao
          ? nomeDaMao(j.avaliacao)
          : j.lugar === lugar && j.estado !== 'passou' && m.comunidade.length >= 3
            ? nomeDaMao(avaliar([...j.cartas, ...m.comunidade]))
            : ''
    }))
  };
}
