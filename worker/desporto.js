/**
 * De onde vêm os jogos, as cotações e os resultados.
 *
 * A feed é a The Odds API. A chave dela vive como segredo do Worker e nunca
 * passa por aqui para fora: o site nunca fala com a feed, fala só connosco. Se
 * falasse, a chave tinha de ir no browser de toda a gente.
 *
 * O plano gratuito são 500 créditos por mês, e tudo o que está aqui desenhado
 * existe para os gastar o menos possível. A ideia que segura isto toda é que
 * três das quatro coisas que precisamos de saber são de graça:
 *
 *   /sports                 lista os desportos em época          0 créditos
 *   /sports/{x}/events      lista os jogos e as horas            0 créditos
 *   /sports/{x}/odds        as cotações                          1 crédito
 *   /sports/{x}/scores      os resultados, com dias para trás    2 créditos
 *
 * Ou seja: dá para saber de graça o que há, e só se paga para saber quanto
 * paga e como acabou. É nisso que assenta tudo o que se segue.
 *
 * O que se paga só se paga quando faz falta:
 *
 *   As cotações de uma liga só se compram se houver lá jogos para apostar a
 *   que ainda não temos preço. Uma liga sem jornada nova esta semana não custa
 *   nada, por muitas voltas que se deem.
 *
 *   Os resultados de uma liga só se compram quando se sabe que ha ali algo
 *   acabado. E sabe-se de graça: um jogo que desapareceu da lista de jogos já
 *   não está nem para começar nem a decorrer, portanto acabou. Enquanto as
 *   apostas de alguém forem todas de jogos que ainda lá estão, não se gasta um
 *   crédito que seja a perguntar por elas.
 *
 * Como a maior parte das voltas não custa nada, elas podem ser muitas: de seis
 * em seis horas em vez de uma por dia. As apostas fecham no próprio dia em vez
 * de fecharem na manhã seguinte, e as cotações chegam mais frescas, tudo isto
 * a gastar menos do que se gastava a dar uma volta por dia.
 */
import { jogoDaFeed } from './apostas.js';

const CASA = 'https://api.the-odds-api.com/v4';

/** Onde ficam guardadas as coisas entre voltas. */
const ONDE_OS_JOGOS = 'desporto:jogos';
const ONDE_AS_CONTAS = 'desporto:creditos';
/** O que a ultima volta fez. Nao serve para o jogo: serve para se poder ver de
 *  fora porque e que uma volta nao trouxe o que se esperava, sem ter de andar
 *  a adivinhar nem a gastar creditos a experimentar. */
const ONDE_O_RELATORIO = 'desporto:ultima-volta';

/** Os desportos que se seguem, e quantas ligas de cada.
 *
 *  São mais do que pareceria prudente com quinhentos créditos, e são-no de
 *  propósito: uma liga que não tenha jornada nova não custa nada, por isso
 *  seguir sete em vez de quatro não multiplica a despesa, só a espalha. */
export const A_SEGUIR = [
  { grupo: 'Soccer', quantas: 3, nome: 'Futebol' },
  { grupo: 'Basketball', quantas: 2, nome: 'Basquetebol' },
  { grupo: 'Tennis', quantas: 2, nome: 'Ténis' },
  /* Os de baixo entram para a pagina nao ficar pobre quando os de cima estao
     parados. O tenis nesta feed e por torneio, e entre o US Open e as finais
     nao ha um unico; o futebol americano e o basebol, nessas mesmas semanas,
     estao a meio da epoca. Como um desporto sem jogos nao gasta nada, segui-los
     nao e uma despesa, e so uma rede. */
  { grupo: 'American Football', quantas: 1, nome: 'Futebol americano' },
  { grupo: 'Ice Hockey', quantas: 1, nome: 'Hóquei no gelo' },
  { grupo: 'Baseball', quantas: 1, nome: 'Basebol' },
  { grupo: 'Mixed Martial Arts', quantas: 1, nome: 'MMA' }
];

/** Quantas ligas se experimentam por grupo, além das que se querem. É o que
 *  permite cair para a seguinte quando as preferidas estão de férias: numa
 *  pausa de seleções a Primeira Liga e a Premier não têm jornada nenhuma, e
 *  quem tem jogos é a Liga das Nações. Perguntar a estas não custa nada. */
const EXPERIMENTAR_MAIS = 8;

/** Quando há mais ligas do que lugares, estas vão à frente. É a única parte
 *  disto que tem gosto pessoal lá dentro. */
const PRIMEIRO = [
  'soccer_portugal_primeira_liga',
  'soccer_uefa_champs_league',
  /* As competicoes de selecoes vao a frente das outras ligas grandes de
     proposito: sao elas que jogam exatamente nas semanas em que as ligas
     param, e sem estarem aqui ficava-se sem futebol nenhum nessas semanas. */
  'soccer_uefa_nations_league',
  'soccer_fifa_world_cup_qualifiers_europe',
  'soccer_epl',
  'soccer_spain_la_liga',
  'soccer_italy_serie_a',
  'soccer_germany_bundesliga',
  'soccer_france_ligue_one',
  'soccer_uefa_europa_league',
  'soccer_uefa_europa_conference_league',
  'basketball_nba',
  'basketball_euroleague',
  'americanfootball_nfl',
  'icehockey_nhl',
  'baseball_mlb',
  'mma_mixed_martial_arts'
];

/**
 * Quantas cotações se compram numa volta.
 *
 * Com a prateleira cheia compra-se a uma liga só: as outras esperam seis horas
 * e ninguém dá por isso. Com a prateleira vazia compram-se três, senão um site
 * que acabasse de ser ligado, ou que tivesse perdido o que tinha, levava dois
 * dias a encher a uma liga de cada vez.
 *
 * Quatro voltas por dia a uma compra são quatro créditos; mesmo no pior dia,
 * em que todas as voltas apanhassem a prateleira vazia, o tecto do dia trava
 * antes de isto fazer mossa.
 */
const COMPRAS_POR_VOLTA = 1;
const COMPRAS_COM_A_PRATELEIRA_VAZIA = 3;

/** Abaixo de quantos jogos a prateleira se considera vazia. */
export const PRATELEIRA_VAZIA = 5;

/**
 * Quanto tempo uma liga descansa depois de se lhe comprarem as cotações.
 *
 * Isto é a tampa de uma fuga. Nem todos os jogos que a feed lista têm casa de
 * apostas com preço: há sempre alguns que ficam sem cotação por mais vezes que
 * se pergunte. Sem este descanso, esses jogos ficavam para sempre a contar como
 * "por cobrir", e essa liga mandava comprar cotações a cada volta, todos os
 * dias, sem nunca ficar satisfeita.
 */
const LIGA_DESCANSA = 10 * 60 * 60 * 1000;

/** E quantas ligas se fecham por volta, no máximo. Os resultados são o que
 *  custa mais, dois créditos cada, e uma liga só chega aqui depois de a lista
 *  de jogos ter dito de graça que há ali algo acabado. */
export const FECHOS_POR_VOLTA = 2;

/** Não se compram cotações para jogos que ainda estão longe. Uma liga que
 *  publique a época inteira de uma vez não nos vai fazer pagar hoje por um jogo
 *  de maio, e uma cotação de daqui a uma semana mudava toda antes de alguém lhe
 *  tocar. */
const SO_ATE = 5 * 24 * 60 * 60 * 1000;

/**
 * Quanto tempo um jogo fica na lista depois de ter comecado.
 *
 * Ele ja nao se pode apostar, mas continua a fazer parte do que esta a
 * acontecer, e uma lista que faz desaparecer um jogo a hora a que ele comeca
 * da a impressao de que se perdeu alguma coisa. Fica visivel, com as cotacoes
 * trancadas, e sai quando tiver tido tempo de acabar.
 */
const AINDA_A_DECORRER = 4 * 60 * 60 * 1000;

/** Um jogo só se considera acabado depois de ter tido tempo de acabar. Serve
 *  para não se ir comprar o resultado de um jogo que saiu da lista mal
 *  começou. Cinco horas chegam para um cinco sets de ténis. */
const DEMORA_A_ACABAR = 5 * 60 * 60 * 1000;

/** Abaixo disto só se gastam créditos para fechar apostas. Quem tem torrões
 *  presos numa aposta por fechar tem mais direito ao que resta da quota do que
 *  quem quer ver jogos novos. */
const GUARDADOS_PARA_FECHAR = 40;

/**
 * O travão do dia, que é a rede por baixo de tudo o resto.
 *
 * Era um número fixo e isso é uma regra cega: num dia em que restem quase
 * quinhentos créditos não há razão nenhuma para travar aos doze, e num dia em
 * que restem quarenta os doze já são demais. Agora olha para o que resta, que
 * é o que a própria feed diz em cada resposta.
 *
 * Em cruzeiro isto nunca chega a apertar, que uma volta normal custa um ou dois
 * créditos. Serve para os dias em que se estreia alguma coisa, em que há muito
 * para ir buscar de uma vez, e para os fins de mês apertados, em que o pouco
 * que resta tem de dar para fechar as apostas que estão de pé.
 */
function tectoDoDia(restam) {
  if (!Number.isFinite(restam)) return 12;
  if (restam > 400) return 40;
  if (restam > 300) return 30;
  if (restam > 150) return 12;
  if (restam > 60) return 6;
  return 2;
}

const cabecalhoDasContas = (r) => ({
  restam: Number(r.headers.get('x-requests-remaining')),
  gastos: Number(r.headers.get('x-requests-used'))
});

/** Os desportos que se seguem, pelo nome com que se leem. O site precisa
 *  desta lista para os poder mostrar todos no filtro, mesmo os que hoje nao
 *  tem jogo nenhum: um desporto que desaparece da lista parece um erro, e o
 *  que se passa e so que nao ha nada a jogar nele esta semana. */
export const DESPORTOS = A_SEGUIR.map((d) => d.nome);

export const temChaveDaFeed = (env) =>
  typeof env.ODDS_API_CHAVE === 'string' && env.ODDS_API_CHAVE.length > 8;

/**
 * Um pedido à feed, com as contas apontadas.
 *
 * Devolve sempre um objeto, nunca atira. Uma feed em baixo não pode levar o
 * site atrás dela: pior do que não haver jogos novos é não haver site.
 */
async function pedir(env, caminho, procura = {}) {
  if (!temChaveDaFeed(env)) return { erro: 'sem chave' };

  const url = new URL(CASA + caminho);
  Object.entries(procura).forEach(([k, v]) => url.searchParams.set(k, v));
  url.searchParams.set('apiKey', env.ODDS_API_CHAVE);

  let r;
  try {
    r = await fetch(url, { headers: { Accept: 'application/json' } });
  } catch {
    return { erro: 'a feed não respondeu' };
  }
  if (!r.ok) return { erro: `a feed respondeu ${r.status}`, estado: r.status };

  let corpo;
  try {
    corpo = await r.json();
  } catch {
    return { erro: 'a feed respondeu coisa que não se lê' };
  }
  return { corpo, contas: cabecalhoDasContas(r) };
}

/* ======================== as contas dos créditos ======================== */

export async function relatorioDaVolta(env) {
  return (await env.QUADRO.get(ONDE_O_RELATORIO, 'json')) || null;
}

export async function guardarRelatorio(env, relatorio) {
  await env.QUADRO.put(
    ONDE_O_RELATORIO,
    JSON.stringify({ ...relatorio, quando: new Date().toISOString() })
  );
}

export async function contasDaFeed(env) {
  const guardado = await env.QUADRO.get(ONDE_AS_CONTAS, 'json');
  return guardado || { restam: null, gastos: null, quando: null, hoje: 0, dia: '' };
}

async function guardarContas(env, contas) {
  await env.QUADRO.put(ONDE_AS_CONTAS, JSON.stringify(contas));
}

/** Aponta o que a feed disse e soma ao gasto do dia. Só se conta o que custa:
 *  as chamadas de graça passam por aqui sem somar nada. */
async function apontar(env, resposta, custou) {
  const antes = await contasDaFeed(env);
  const dia = new Date().toISOString().slice(0, 10);
  const contas = {
    ...antes,
    quando: new Date().toISOString(),
    dia,
    hoje: (antes.dia === dia ? antes.hoje || 0 : 0) + (custou || 0)
  };
  if (resposta?.contas && Number.isFinite(resposta.contas.restam)) {
    contas.restam = resposta.contas.restam;
    contas.gastos = resposta.contas.gastos;
  }
  await guardarContas(env, contas);
  return contas;
}

/** Se ainda se pode gastar. O que é de graça não passa por aqui. */
async function daParaGastar(env, quanto) {
  const contas = await contasDaFeed(env);
  const dia = new Date().toISOString().slice(0, 10);
  const hoje = contas.dia === dia ? contas.hoje || 0 : 0;
  if (hoje + quanto > tectoDoDia(contas.restam)) return false;
  if (Number.isFinite(contas.restam) && contas.restam - quanto < 0) return false;
  return true;
}

/* ============================ o que é de graça ============================ */

/**
 * Que ligas se podem seguir hoje, com folga para escolher.
 *
 * Não gasta créditos, e é por isso que se pergunta em vez de se adivinhar: o
 * ténis não tem uma chave só, cada torneio é a sua, e adivinhar quais estão a
 * decorrer esta semana não daria.
 *
 * Devolve mais candidatas do que os lugares que há, por grupo e já por ordem
 * de preferência. Quem escolhe de verdade é quem for ver, de graça, quais
 * delas têm jogos marcados: uma liga estar em época não quer dizer que jogue
 * esta semana, e numa pausa de seleções as melhores estão todas paradas.
 */
export async function ligasDeHoje(env) {
  const r = await pedir(env, '/sports/');
  if (r.erro) return { erro: r.erro };
  await apontar(env, r, 0);
  const todas = Array.isArray(r.corpo) ? r.corpo : [];

  const grupos = [];
  for (const { grupo, quantas, nome } of A_SEGUIR) {
    /* Sem os vencedores de campeonato: ali não há jogo nenhum para acabar, e
       uma aposta que só fecha em maio ficava meio ano à espera. */
    const doGrupo = todas.filter((d) => d && d.group === grupo && d.active && !d.has_outrights);
    const ordenadas = [
      ...doGrupo.filter((d) => PRIMEIRO.includes(d.key)),
      ...doGrupo.filter((d) => !PRIMEIRO.includes(d.key))
    ];
    grupos.push({
      desporto: nome,
      quantas,
      /* Quantas a feed tem em epoca neste grupo, antes de se cortar pelas que
         cabem. Serve para se ver de fora se um desporto vem pobre porque a
         feed so tem aquilo, ou porque sou eu que nao pergunto a mais. */
      emEpoca: doGrupo.length,
      candidatas: ordenadas
        .slice(0, quantas + EXPERIMENTAR_MAIS)
        .map((d) => ({ chave: d.key, liga: d.title, desporto: nome }))
    });
  }
  return { grupos };
}

/** Os jogos de uma liga, sem cotações. Não gasta créditos. */
export async function eventosDe(env, chave, procura = {}) {
  const r = await pedir(env, `/sports/${chave}/events/`, procura);
  if (r.erro) return { erro: r.erro };
  await apontar(env, r, 0);
  return { eventos: Array.isArray(r.corpo) ? r.corpo : [] };
}

/**
 * Quais destes jogos já acabaram, sem gastar um crédito.
 *
 * A lista de jogos traz os que estão para começar e os que estão a decorrer.
 * Um que já lá não esteja não é nem uma coisa nem outra: acabou, foi adiado ou
 * deixou de ser seguido. Em qualquer dos casos é altura de ir ver o resultado,
 * e só aí é que se paga.
 */
export async function jaAcabaram(env, chave, jogos, agora = Date.now()) {
  /* Os que ainda nem tiveram tempo de acabar nem se perguntam. Poupa a
     pergunta e evita ir comprar um resultado que ainda não existe. */
  const velhos = jogos.filter((j) => agora - Date.parse(j.comeca) > DEMORA_A_ACABAR);
  if (velhos.length === 0) return { acabados: [] };

  const r = await eventosDe(env, chave, { eventIds: velhos.map((j) => j.jogo).join(',') });
  if (r.erro) return { erro: r.erro };

  const aindaLa = new Set(r.eventos.map((e) => e && e.id));
  return { acabados: velhos.filter((j) => !aindaLa.has(j.jogo)).map((j) => j.jogo) };
}

/* ============================ o que se paga ============================ */

/**
 * Vai buscar jogos novos, gastando só onde é preciso.
 *
 * Por cada liga pergunta-se de graça que jogos há. Se todos os que estão para
 * breve já têm cotação guardada, não se compra nada. Compra-se só às ligas onde
 * há jogos por cobrir, e mesmo dessas só a algumas de cada vez: as que jogam
 * mais cedo primeiro, que as outras esperam seis horas sem mal nenhum.
 */
export async function refrescarJogos(env) {
  const quais = await ligasDeHoje(env);
  if (quais.erro) return { erro: quais.erro };

  const guardado = (await env.QUADRO.get(ONDE_OS_JOGOS, 'json')) || { jogos: [] };
  const agora = Date.now();
  const temCotacao = new Set(guardado.jogos.map((j) => j.id));
  const descanso = guardado.compradas || {};

  const daqui = new Date(agora).toISOString().slice(0, 19) + 'Z';
  const ate = new Date(agora + SO_ATE).toISOString().slice(0, 19) + 'Z';

  /* ---- de graca: quais das candidatas tem jogos, e o que falta cobrir ---- */
  const aPrecisar = [];
  const seguidas = [];
  /** O que cada candidata disse, para se poder ver de fora o que se passou. */
  const perguntadas = [];

  for (const grupo of quais.grupos) {
    let lugares = grupo.quantas;
    for (const liga of grupo.candidatas) {
      if (lugares <= 0) break;

      const r = await eventosDe(env, liga.chave, {
        commenceTimeFrom: daqui,
        commenceTimeTo: ate
      });
      if (r.erro) {
        perguntadas.push(`${liga.chave}: ${r.erro}`);
        continue;
      }
      perguntadas.push(`${liga.chave}: ${r.eventos.length} jogos`);

      /* Uma liga sem jogos marcados nao ocupa lugar: passa-se a seguinte. E
         assim que numa pausa de selecoes se cai da Primeira Liga para a Liga
         das Nacoes, sem ninguem ter de andar a mexer em listas a mao. */
      if (r.eventos.length === 0) continue;

      lugares -= 1;
      seguidas.push(liga.chave);

      /* Uma liga a quem se comprou ha pouco nao se volta a comprar, mesmo que
         tenha jogos sem preco: se eles nao vieram da ultima vez, nao ha razao
         nenhuma para virem agora. */
      const ultima = Date.parse(descanso[liga.chave] || '');
      if (Number.isFinite(ultima) && agora - ultima < LIGA_DESCANSA) continue;

      const porCobrir = r.eventos.filter((e) => e && e.id && !temCotacao.has(e.id));
      if (porCobrir.length === 0) continue;

      const primeiro = Math.min(...porCobrir.map((e) => Date.parse(e.commence_time) || Infinity));
      aPrecisar.push({ ...liga, quantos: porCobrir.length, primeiro });
    }
  }

  /* Quem ja tem jogos na prateleira espera; quem nao tem nenhum vai a frente.
     Sem isto, a liga com o jogo mais proximo ganhava sempre, e como o futebol
     tem jogos a toda a hora a pagina ficava com trinta e oito jogos de futebol
     e mais nada, com o basebol e o hoquei a espera da vez durante dias. */
  const desportosComJogos = new Set(
    guardado.jogos.filter((j) => Date.parse(j.comeca) > agora).map((j) => j.desporto)
  );
  aPrecisar.sort((a, b) => {
    const aVazio = desportosComJogos.has(a.desporto) ? 1 : 0;
    const bVazio = desportosComJogos.has(b.desporto) ? 1 : 0;
    if (aVazio !== bVazio) return aVazio - bVazio;
    return a.primeiro - b.primeiro;
  });

  /* ---- e so agora se gasta ---- */
  const comprados = [];
  const novos = [];
  /* Compram-se tres quando ha pouco na prateleira, e tambem enquanto houver
     um desporto que se segue sem um unico jogo: e o que faz a pagina encher-se
     em horas em vez de dias, quando se comeca ou quando se acrescenta um
     desporto novo. O tecto do dia esta por cima disto na mesma. */
  const aindaPorComecar = guardado.jogos.filter((j) => Date.parse(j.comeca) > agora).length;
  const haDesportoAZero = aPrecisar.some((l) => !desportosComJogos.has(l.desporto));
  const quantasComprar =
    aindaPorComecar < PRATELEIRA_VAZIA || haDesportoAZero
      ? COMPRAS_COM_A_PRATELEIRA_VAZIA
      : COMPRAS_POR_VOLTA;

  for (const liga of aPrecisar.slice(0, quantasComprar)) {
    const contas = await contasDaFeed(env);
    if (Number.isFinite(contas.restam) && contas.restam <= GUARDADOS_PARA_FECHAR) break;
    if (!(await daParaGastar(env, 1))) break;

    const r = await pedir(env, `/sports/${liga.chave}/odds/`, {
      regions: 'eu',
      markets: 'h2h',
      oddsFormat: 'decimal'
    });
    if (r.erro) continue;
    await apontar(env, r, 1);
    comprados.push(liga.chave);
    descanso[liga.chave] = new Date(agora).toISOString();

    for (const cru of Array.isArray(r.corpo) ? r.corpo : []) {
      const jogo = jogoDaFeed(cru, agora);
      if (jogo && Date.parse(jogo.comeca) - agora <= SO_ATE)
        novos.push({ ...jogo, liga: jogo.liga || liga.liga, desporto: liga.desporto });
    }
  }

  /* Os novos por cima dos velhos, e fora os que ja comecaram. As cotacoes de
     uma liga que nao se comprou esta volta ficam como estavam: velhas, sim, mas
     uma cotacao velha num jogo de amanha vale mais do que jogo nenhum. */
  const por = new Map();
  [...guardado.jogos, ...novos].forEach((j) => {
    /* Os que ja comecaram ficam mais umas horas, trancados. Quem esta a ver o
       jogo quer ve-lo na lista, ainda que ja nao possa apostar nele. */
    if (Date.parse(j.comeca) > agora - AINDA_A_DECORRER) por.set(j.id, j);
  });
  const jogos = [...por.values()].sort((a, b) => Date.parse(a.comeca) - Date.parse(b.comeca));

  /* O descanso so guarda as ligas que ainda se seguem, senao ia juntando
     torneios de tenis do ano passado ate encher. */
  const aSeguir = new Set(seguidas);
  const compradas = Object.fromEntries(
    Object.entries(descanso).filter(([chave]) => aSeguir.has(chave))
  );

  const guardar = {
    jogos: jogos.slice(0, 160),
    compradas,
    quando: new Date().toISOString()
  };
  await env.QUADRO.put(ONDE_OS_JOGOS, JSON.stringify(guardar));
  return {
    ...guardar,
    comprados,
    ligas: seguidas,
    perguntadas,
    quantasComprar,
    emEpoca: quais.grupos.map((g) => `${g.desporto}: ${g.emEpoca} em epoca, ${g.candidatas.length} experimentadas`)
  };
}

/**
 * Se ha algum desporto que se segue sem um unico jogo na prateleira.
 *
 * Nao gasta nada: e uma conta sobre o que ja esta guardado. Serve para decidir
 * se vale a pena dar uma volta, e existe porque a pergunta "ha poucos jogos?"
 * nao chegava: com quarenta jogos de futebol a prateleira parecia cheia
 * enquanto cinco desportos inteiros estavam a zero, e a volta que os traria
 * nunca se dava.
 */
export async function faltamDesportos(env) {
  const guardado = await env.QUADRO.get(ONDE_OS_JOGOS, 'json');
  const agora = Date.now();
  const tem = new Set(
    (guardado?.jogos || []).filter((j) => Date.parse(j.comeca) > agora).map((j) => j.desporto)
  );
  return A_SEGUIR.some(({ nome }) => !tem.has(nome));
}

/** Os jogos que estão guardados, sem gastar crédito nenhum. */
export async function jogosGuardados(env) {
  const guardado = await env.QUADRO.get(ONDE_OS_JOGOS, 'json');
  if (!guardado) return { jogos: [], quando: null };
  /* Os que ja acabaram saem sem ser preciso ir buscar nada: a hora de comeco
     ja esta guardada e o relogio anda sozinho. Os que estao a decorrer ficam,
     e e o site que os mostra trancados. */
  const agora = Date.now();
  return {
    ...guardado,
    jogos: guardado.jogos.filter((j) => Date.parse(j.comeca) > agora - AINDA_A_DECORRER)
  };
}

/** Um jogo pelo seu número, para se confirmar uma aposta contra ele. */
export async function jogoGuardado(env, id) {
  const { jogos } = await jogosGuardados(env);
  return jogos.find((j) => j.id === id) || null;
}

/**
 * Os resultados de uma liga, dos últimos três dias. Custa dois créditos, e é a
 * coisa mais cara que aqui se faz: por isso só se chama depois de a lista de
 * jogos ter dito, de graça, que ali há mesmo algo acabado.
 */
export async function resultadosDe(env, chave) {
  if (!(await daParaGastar(env, 2))) return { erro: 'já se gastou o que havia para gastar hoje' };
  const r = await pedir(env, `/sports/${chave}/scores/`, { daysFrom: 3 });
  if (r.erro) return { erro: r.erro };
  await apontar(env, r, 2);
  return { resultados: Array.isArray(r.corpo) ? r.corpo : [] };
}
