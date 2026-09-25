/**
 * A fonte nova: a API-Sports.
 *
 * A anterior dava cotações e o resultado final, e mais nada. Esta dá, na mesma
 * casa e por um plano gratuito de cem pedidos por dia e por desporto, os jogos,
 * as cotações, o resultado ao minuto e as estatísticas de cada jogo. Cada
 * desporto é uma API à parte, com o seu endereço e a sua conta de cem pedidos,
 * mas a chave é a mesma, que é a chave da conta.
 *
 * Três coisas que só se souberam a perguntar-lhe, e que mandam neste desenho:
 *
 *   Um pedido traz os jogos todos de um dia. No dia em que isto se escreveu
 *   foram duzentos e sessenta e cinco. Na fonte antiga cada liga era um pedido,
 *   e era daí que vinha a pobreza da coisa.
 *
 *   Esse mesmo pedido já traz os golos e o minuto de cada jogo. Ou seja: o
 *   resultado ao vivo não custa um pedido a mais do que listar os jogos, o que
 *   era precisamente a coisa que na fonte antiga não cabia no orçamento.
 *
 *   E ela trava aos dez pedidos por minuto. Isto não é teoria: a primeira sonda
 *   que se escreveu disparou três pedidos em rajada e levou dois recusados. Por
 *   isso aqui nunca se dispara nada em rajada.
 *
 * Os erros dela não vêm no estado HTTP. Um pedido mal feito ou uma conta
 * esgotada vem com 200 e um objeto "errors" preenchido, e quem não o ler toma
 * um erro por uma resposta boa e vazia.
 */

/**
 * O endereço de cada desporto. A chave é a mesma para todos.
 *
 * O ténis não está aqui porque a API-Sports não tem ténis: o endereço que eu
 * tinha posto respondeu 530, que é o servidor não existir. Ficou a viver na
 * fonte antiga, que tem, ainda que por torneio e quase sempre vazia. Isto é o
 * género de coisa que só se sabe a perguntar.
 */
export const CASAS = {
  Futebol: 'https://v3.football.api-sports.io',
  Basquetebol: 'https://v1.basketball.api-sports.io',
  'Futebol americano': 'https://v1.american-football.api-sports.io',
  'Hóquei no gelo': 'https://v1.hockey.api-sports.io',
  Basebol: 'https://v1.baseball.api-sports.io',
  MMA: 'https://v1.mma.api-sports.io'
};

/** Quanto se espera entre pedidos, por causa do travão dos dez por minuto. */
export const ESPERA_ENTRE_PEDIDOS = 12000;
export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

export const temChaveNova = (env) =>
  typeof env.APISPORTS_CHAVE === 'string' && env.APISPORTS_CHAVE.length > 8;

/** Quantos dias à frente se vai, e quantos jogos se guardam. */
const SO_ATE_DIAS = 3;
const JOGOS_NO_MAXIMO = 120;

/** Quanto tempo um jogo fica à vista depois de ter começado. */
const AINDA_A_DECORRER = 4 * 60 * 60 * 1000;

/**
 * As competições que vão à frente, por desporto.
 *
 * É uma lista de pedaços de texto e não de números de liga, de propósito. Os
 * números seriam mais exactos, mas obrigavam a adivinhá-los ou a gastar pedidos
 * a perguntá-los, e mudam de temporada para temporada; o país e o nome da
 * competição vêm dentro de cada jogo, de graça. E assim, quando as ligas
 * grandes param para as selecções, o que tiver jogos entra sozinho.
 */
const PREFERIDAS = {
  Futebol: [
    'Portugal|Primeira Liga',
    'Portugal|Liga Portugal',
    'World|UEFA Champions League',
    'World|UEFA Nations League',
    'World|World Cup - Qualification Europe',
    'World|UEFA Europa League',
    'England|Premier League',
    'Spain|La Liga',
    'Italy|Serie A',
    'Germany|Bundesliga',
    'France|Ligue 1',
    'Portugal|'
  ],
  Basquetebol: ['Europe|Euroleague', 'USA|NBA', 'Portugal|'],
  'Futebol americano': ['USA|NFL'],
  'Hóquei no gelo': ['USA|NHL'],
  Basebol: ['USA|MLB'],
  MMA: ['|']
};

/* ============================ os pedidos ============================ */

export async function pedir(env, casa, caminho, procura = {}) {
  if (!temChaveNova(env)) return { erro: 'sem chave nova' };

  const url = new URL(casa + caminho);
  Object.entries(procura).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
  });

  let r;
  try {
    r = await fetch(url, {
      headers: { 'x-apisports-key': env.APISPORTS_CHAVE, Accept: 'application/json' }
    });
  } catch {
    return { erro: 'a feed nova não respondeu' };
  }
  /* Os limites, ditos por ela em cada resposta. Sem isto ando a adivinhar
     porque e que ela recusa: ha um travao por minuto e um por dia, e o erro
     que ela devolve e o mesmo texto para os dois. */
  const limites = {
    dia: r.headers.get('x-ratelimit-requests-limit'),
    diaRestam: r.headers.get('x-ratelimit-requests-remaining'),
    minuto: r.headers.get('X-RateLimit-Limit'),
    minutoRestam: r.headers.get('X-RateLimit-Remaining')
  };
  console.log(
    'LIMITES ' +
      caminho +
      ' ' +
      JSON.stringify(limites) +
      ' TODOS ' +
      JSON.stringify([...r.headers].filter(([k]) => /limit|rate|remain|quota/i.test(k)))
  );

  if (!r.ok) return { erro: `a feed nova respondeu ${r.status}`, estado: r.status, limites };

  let corpo;
  try {
    corpo = await r.json();
  } catch {
    return { erro: 'a feed nova respondeu coisa que não se lê' };
  }

  const erros = corpo && corpo.errors;
  const temErros =
    erros && (Array.isArray(erros) ? erros.length > 0 : Object.keys(erros).length > 0);
  if (temErros)
    return {
      erro: 'a feed nova recusou: ' + JSON.stringify(erros).slice(0, 160),
      limites
    };

  return {
    lista: Array.isArray(corpo?.response) ? corpo.response : [],
    paginas: corpo?.paging || null,
    quantos: corpo?.results ?? null
  };
}

/* ============================ ler um jogo ============================ */

/** O que os estados curtos dela querem dizer, do que nos interessa. */
const ACABOU = new Set(['FT', 'AET', 'PEN', 'AWD', 'WO', 'AOT', 'AP']);
const NAO_SE_FEZ = new Set(['PST', 'CANC', 'ABD', 'SUSP', 'INT']);
const POR_COMECAR = new Set(['NS', 'TBD']);

const soNumero = (n) => (Number.isFinite(+n) ? +n : null);

/**
 * Um jogo, na forma que o resto da casa já conhece.
 *
 * As cotações vêm de outro pedido e entram depois; aqui trata-se do jogo em si,
 * que é o que traz também o resultado e o minuto.
 */
export function jogoDaFeedNova(cru, desporto) {
  const f = cru?.fixture || cru;
  const id = f?.id ?? cru?.id;
  const casa = cru?.teams?.home?.name;
  const fora = cru?.teams?.away?.name;
  const quando = Date.parse(f?.date || cru?.date || '');
  if (!id || !casa || !fora || !Number.isFinite(quando)) return null;

  const curto = String(f?.status?.short || cru?.status?.short || '');

  return {
    id: String(id),
    /** A liga, que é por onde se agrupa e se filtra. */
    chave: String(cru?.league?.id ?? ''),
    liga: String(cru?.league?.name || ''),
    pais: String(cru?.league?.country || ''),
    desporto,
    casa,
    fora,
    /* Os emblemas, que a fonte antiga não tinha. */
    brasaoCasa: String(cru?.teams?.home?.logo || ''),
    brasaoFora: String(cru?.teams?.away?.logo || ''),
    comeca: new Date(quando).toISOString(),
    /* De que fonte veio. É este campo que deixa trocar de fonte sem estragar as
       apostas já feitas: cada perna fecha-se pela fonte de onde nasceu, e as
       antigas não têm isto posto. */
    fonte: 'api-sports',
    estado: curto,
    acabou: ACABOU.has(curto),
    naoSeFez: NAO_SE_FEZ.has(curto),
    porComecar: POR_COMECAR.has(curto),
    minuto: soNumero(f?.status?.elapsed),
    marcaCasa: soNumero(cru?.goals?.home ?? cru?.scores?.home?.total),
    marcaFora: soNumero(cru?.goals?.away ?? cru?.scores?.away?.total)
  };
}

/** Quem ganhou, do que a feed nova diz. Nada, se ainda não há nada a decidir. */
export function quemGanhouNova(jogo) {
  if (!jogo || !jogo.acabou) return null;
  if (jogo.marcaCasa === null || jogo.marcaFora === null) return null;
  return jogo.marcaCasa > jogo.marcaFora
    ? 'casa'
    : jogo.marcaFora > jogo.marcaCasa
      ? 'fora'
      : 'empate';
}

/**
 * As cotações de um jogo.
 *
 * Fica-se pela primeira casa de apostas que tenha o mercado inteiro, como na
 * fonte antiga: escolher sempre a mais alta dava uma casa que perde de certeza.
 */
export function cotacoesDaFeedNova(cru) {
  for (const b of Array.isArray(cru?.bookmakers) ? cru.bookmakers : []) {
    const mercado = (Array.isArray(b.bets) ? b.bets : []).find(
      (m) => m && (m.id === 1 || /match winner|home\/away|winner/i.test(String(m.name)))
    );
    if (!mercado) continue;

    const preco = (...nomes) => {
      const achado = (Array.isArray(mercado.values) ? mercado.values : []).find((v) =>
        nomes.some((n) => String(v?.value).toLowerCase() === n)
      );
      const p = achado ? +achado.odd : NaN;
      return Number.isFinite(p) && p >= 1.01 && p <= 1000 ? p : null;
    };

    const emCasa = preco('home', '1');
    const laFora = preco('away', '2');
    if (emCasa === null || laFora === null) continue;

    const empate = preco('draw', 'x');
    const fonte = String(b.name || '');
    return empate === null
      ? { casa: emCasa, fora: laFora, fonte }
      : { casa: emCasa, fora: laFora, empate, fonte };
  }
  return null;
}

/* ============================ escolher jogos ============================ */

const diaDe = (quantos) => new Date(Date.now() + quantos * 86400000).toISOString().slice(0, 10);

/** Quanto uma competição interessa: menor é melhor, e o que não está na lista
 *  fica no fim mas fica. */
function pesoDa(jogo, desporto) {
  const lista = PREFERIDAS[desporto] || [];
  for (let i = 0; i < lista.length; i += 1) {
    const [pais, nome] = lista[i].split('|');
    if ((!pais || jogo.pais === pais) && (!nome || jogo.liga.includes(nome))) return i;
  }
  return lista.length + 1;
}

/**
 * Vai buscar os jogos de um desporto: hoje e os próximos dias.
 *
 * Um pedido por dia, e cada um traz tudo o que há nesse dia, com o resultado e
 * o minuto de quem já está a jogar.
 */
export async function jogosDaFeedNova(env, desporto, dias = SO_ATE_DIAS) {
  const casa = CASAS[desporto];
  if (!casa) return { erro: `não sei onde pedir ${desporto}` };

  const todos = [];
  let pedidos = 0;
  let falhou = '';

  for (let d = 0; d < dias; d += 1) {
    if (d > 0) await esperar(ESPERA_ENTRE_PEDIDOS);
    const r = await pedir(env, casa, '/fixtures', { date: diaDe(d) });
    pedidos += 1;
    if (r.erro) {
      /* Um dia que falhe nao deita fora os dias que ja vieram, mas o que ja
         veio tem de sair daqui limpo como sairia se nao tivesse falhado nada.
         Antes devolvia-se aqui a lista em bruto, e por isso um jogo adiado
         chegou a aparecer na pagina: o filtro estava depois deste return. */
      falhou = r.erro;
      break;
    }
    r.lista.forEach((cru) => {
      const j = jogoDaFeedNova(cru, desporto);
      if (j) todos.push(j);
    });
  }

  /* Fora os que já acabaram há muito e os que não se fizeram, e primeiro as
     competições que interessam e depois as que jogam mais cedo. */
  const agora = Date.now();
  const servem = todos.filter(
    (j) => !j.naoSeFez && Date.parse(j.comeca) > agora - AINDA_A_DECORRER
  );
  servem.sort((a, b) => {
    const pa = pesoDa(a, desporto);
    const pb = pesoDa(b, desporto);
    if (pa !== pb) return pa - pb;
    return Date.parse(a.comeca) - Date.parse(b.comeca);
  });

  const saida = { jogos: servem.slice(0, JOGOS_NO_MAXIMO), pedidos };
  return falhou ? { ...saida, erro: falhou } : saida;
}

/**
 * As cotações de hoje, para se casarem com os jogos.
 *
 * Também vêm por dia e não por jogo, o que é a diferença entre gastar três
 * pedidos e gastar um por cada jogo que alguém abrisse.
 */
export async function cotacoesDoDia(env, desporto, quantasPaginas = 3) {
  const casa = CASAS[desporto];
  if (!casa) return { erro: `não sei onde pedir ${desporto}` };

  const porJogo = new Map();
  let pedidos = 0;
  for (let p = 1; p <= quantasPaginas; p += 1) {
    if (p > 1) await esperar(ESPERA_ENTRE_PEDIDOS);
    const r = await pedir(env, casa, '/odds', { date: diaDe(0), bet: 1, page: p });
    pedidos += 1;
    if (r.erro) return { erro: r.erro, cotacoes: porJogo, pedidos };

    r.lista.forEach((cru) => {
      const id = String(cru?.fixture?.id ?? '');
      if (!id || porJogo.has(id)) return;
      const c = cotacoesDaFeedNova(cru);
      if (c) porJogo.set(id, c);
    });

    if (!r.paginas || p >= (r.paginas.total || 1)) break;
  }
  return { cotacoes: porJogo, pedidos };
}

/**
 * Os resultados de jogos certos, pelo número deles.
 *
 * Aceita vinte de uma vez, o que faz de fechar apostas um pedido e não um por
 * aposta.
 */
export async function resultadosPorNumero(env, desporto, numeros) {
  const casa = CASAS[desporto];
  if (!casa || numeros.length === 0) return { jogos: [], pedidos: 0 };

  const jogos = [];
  const lotes = [];
  for (let i = 0; i < numeros.length; i += 20) lotes.push(numeros.slice(i, i + 20));

  let pedidos = 0;
  for (let i = 0; i < lotes.length; i += 1) {
    if (i > 0) await esperar(ESPERA_ENTRE_PEDIDOS);
    const r = await pedir(env, casa, '/fixtures', { ids: lotes[i].join('-') });
    pedidos += 1;
    if (r.erro) return { erro: r.erro, jogos, pedidos };
    r.lista.forEach((cru) => {
      const j = jogoDaFeedNova(cru, desporto);
      if (j) jogos.push(j);
    });
  }
  return { jogos, pedidos };
}
